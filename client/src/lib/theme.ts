export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'mabini:theme';
const LEGACY_THEME_STORAGE_KEY = 'theme';
const DEFAULT_THEME: AppTheme = 'light';

const normalizeThemeValue = (value: unknown): AppTheme | null => {
  if (value === true) {
    return 'dark';
  }

  if (value === false) {
    return 'light';
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'dark' || normalized === 'true' || normalized === '1' || normalized === 'on') {
    return 'dark';
  }

  if (normalized === 'light' || normalized === 'false' || normalized === '0' || normalized === 'off') {
    return 'light';
  }

  return null;
};

const readThemeFromStorage = (): AppTheme | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const primaryValue = normalizeThemeValue(window.localStorage.getItem(THEME_STORAGE_KEY));
    if (primaryValue) {
      return primaryValue;
    }

    return normalizeThemeValue(window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY));
  } catch {
    return null;
  }
};

export const readStoredThemePreference = (): AppTheme => {
  const storageTheme = readThemeFromStorage();
  if (storageTheme) {
    return storageTheme;
  }

  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }

  return DEFAULT_THEME;
};

export const applyThemePreference = (theme: AppTheme): void => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures so theme still applies in memory.
    }
  }
};

export const initializeThemePreference = (): void => {
  applyThemePreference(readStoredThemePreference());
};

export const isDarkModeEnabled = (): boolean => {
  return readStoredThemePreference() === 'dark';
};