import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-level capture: `beforeinstallprompt` may fire before any React tree
// mounts. Catching it as soon as the module loads (which happens during the
// initial render of LandingPage) means the prompt is still available when the
// user finally clicks Install.
let cachedPrompt: BeforeInstallPromptEvent | null = null;
let cachedInstalled = false;
const subscribers = new Set<() => void>();

const notifySubscribers = () => {
  subscribers.forEach((notify) => notify());
};

const detectInstalled = (): boolean => {
  if (typeof window === 'undefined') return false;
  const iosStandalone = Boolean(
    (window.navigator as Navigator & { standalone?: boolean }).standalone,
  );
  const standardStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || standardStandalone;
};

if (typeof window !== 'undefined') {
  cachedInstalled = detectInstalled();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    cachedPrompt = event as BeforeInstallPromptEvent;
    notifySubscribers();
  });

  window.addEventListener('appinstalled', () => {
    cachedInstalled = true;
    cachedPrompt = null;
    notifySubscribers();
  });

  if (typeof window.matchMedia === 'function') {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    standaloneQuery.addEventListener?.('change', (event) => {
      if (event.matches) {
        cachedInstalled = true;
        notifySubscribers();
      }
    });
  }
}

export function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(
    cachedPrompt,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(cachedInstalled);

  useEffect(() => {
    const sync = () => {
      setInstallPrompt(cachedPrompt);
      setIsInstalled(cachedInstalled);
    };

    sync();
    subscribers.add(sync);
    return () => {
      subscribers.delete(sync);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!cachedPrompt) return false;

    try {
      await cachedPrompt.prompt();
      const result = await cachedPrompt.userChoice;
      cachedPrompt = null;
      notifySubscribers();

      if (result.outcome === 'accepted') {
        cachedInstalled = true;
        notifySubscribers();
        return true;
      }
      return false;
    } catch (error) {
      console.error('PWA install failed:', error);
      cachedPrompt = null;
      notifySubscribers();
      return false;
    }
  }, []);

  return {
    isInstallable: Boolean(installPrompt) && !isInstalled,
    isInstalled,
    install,
  };
}
