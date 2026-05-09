import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { pushNotificationsService } from "@/services/push-notifications.service";
import { initializeThemePreference } from "@/lib/theme";
import {
	AUTH_ROLE_CACHE_STORAGE_KEY,
	PWA_MOBILE_ZOOM_POLICY_CHANGED_EVENT,
	PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY,
	resolveShouldLockPwaMobileZoom,
} from "@/lib/pwa-zoom-policy";

const DEFAULT_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1.0';
const PWA_MOBILE_LOCKED_VIEWPORT_CONTENT = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

function isStandalonePwa(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	const iOSStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
	const standardStandalone = window.matchMedia('(display-mode: standalone)').matches;

	return iOSStandalone || standardStandalone;
}

function isMobileViewport(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}

	return window.matchMedia('(max-width: 767px)').matches;
}

function applyPwaMobileViewportZoomPolicy() {
	if (typeof document === 'undefined') {
		return;
	}

	const viewportMeta = document.querySelector('meta[name="viewport"]');
	if (!viewportMeta) {
		return;
	}

	const shouldLockZoom = isStandalonePwa() && isMobileViewport() && resolveShouldLockPwaMobileZoom();
	viewportMeta.setAttribute(
		'content',
		shouldLockZoom ? PWA_MOBILE_LOCKED_VIEWPORT_CONTENT : DEFAULT_VIEWPORT_CONTENT,
	);
}

const scheduleIdle = (cb: () => void) => {
	if (typeof window === 'undefined') return;
	if ('requestIdleCallback' in window) {
		(window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
			.requestIdleCallback(cb, { timeout: 1000 });
	} else {
		setTimeout(cb, 0);
	}
};

const ensurePreconnect = (href: string) => {
	if (!href || typeof document === 'undefined') return;
	if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
	const link = document.createElement('link');
	link.rel = 'preconnect';
	link.href = href;
	link.crossOrigin = 'anonymous';
	document.head.appendChild(link);
};

initializeThemePreference();

// Apply zoom policy synchronously before React mounts — must run before createRoot.
if (typeof window !== 'undefined') {
	applyPwaMobileViewportZoomPolicy();
}

// Runtime preconnect fallback for envs where index.html hints aren't enough.
try {
	const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
	if (apiUrl) ensurePreconnect(new URL(apiUrl).origin);
	const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
	if (supabaseUrl) ensurePreconnect(new URL(supabaseUrl).origin);
} catch {
	// Bad URLs are non-fatal.
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Defer non-paint-critical side effects so React gets first pick of the main thread.
scheduleIdle(() => {
	if (typeof window === 'undefined') return;

	const standaloneQuery = window.matchMedia('(display-mode: standalone)');
	const mobileQuery = window.matchMedia('(max-width: 767px)');
	const handleStorageChange = (event: StorageEvent) => {
		if (
			event.key === PWA_MOBILE_ZOOM_POLICY_STORAGE_KEY ||
			event.key === AUTH_ROLE_CACHE_STORAGE_KEY
		) {
			applyPwaMobileViewportZoomPolicy();
		}
	};

	standaloneQuery.addEventListener('change', applyPwaMobileViewportZoomPolicy);
	mobileQuery.addEventListener('change', applyPwaMobileViewportZoomPolicy);
	window.addEventListener('orientationchange', applyPwaMobileViewportZoomPolicy);
	window.addEventListener(PWA_MOBILE_ZOOM_POLICY_CHANGED_EVENT, applyPwaMobileViewportZoomPolicy);
	window.addEventListener('storage', handleStorageChange);

	// SW registration — non-blocking, deferred after first paint.
	if ('serviceWorker' in navigator) {
		void pushNotificationsService.registerServiceWorker().catch((error) => {
			console.debug('Service worker registration skipped', error);
		});
	}
});
