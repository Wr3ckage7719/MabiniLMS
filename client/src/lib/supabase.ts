import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

type AuthPersistenceMode = 'local' | 'session';

const AUTH_PERSISTENCE_MODE_STORAGE_KEY = 'mabini:auth:persistence-mode';
const DEFAULT_AUTH_PERSISTENCE_MODE: AuthPersistenceMode = 'local';

const isBrowser = (): boolean => typeof window !== 'undefined';

const getLocalStorage = (): Storage | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getSessionStorage = (): Storage | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const readAuthPersistenceMode = (): AuthPersistenceMode => {
  const localStorageRef = getLocalStorage();
  if (!localStorageRef) {
    return DEFAULT_AUTH_PERSISTENCE_MODE;
  }

  const rawMode = localStorageRef.getItem(AUTH_PERSISTENCE_MODE_STORAGE_KEY);
  return rawMode === 'session' ? 'session' : DEFAULT_AUTH_PERSISTENCE_MODE;
};

const writeAuthPersistenceMode = (mode: AuthPersistenceMode): void => {
  const localStorageRef = getLocalStorage();
  if (!localStorageRef) {
    return;
  }

  localStorageRef.setItem(AUTH_PERSISTENCE_MODE_STORAGE_KEY, mode);
};

const removeSupabaseAuthTokens = (storageRef: Storage | null): void => {
  if (!storageRef) {
    return;
  }

  const matchingKeys: string[] = [];

  for (let index = 0; index < storageRef.length; index += 1) {
    const key = storageRef.key(index);
    if (!key) {
      continue;
    }

    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      matchingKeys.push(key);
    }
  }

  matchingKeys.forEach((key) => {
    storageRef.removeItem(key);
  });
};

const hybridAuthStorage = {
  getItem: (key: string): string | null => {
    const localStorageRef = getLocalStorage();
    const localValue = localStorageRef?.getItem(key);
    if (localValue !== null && localValue !== undefined) {
      return localValue;
    }

    const sessionStorageRef = getSessionStorage();
    const sessionValue = sessionStorageRef?.getItem(key);
    if (sessionValue !== null && sessionValue !== undefined) {
      return sessionValue;
    }

    return null;
  },
  setItem: (key: string, value: string): void => {
    const mode = readAuthPersistenceMode();
    const localStorageRef = getLocalStorage();
    const sessionStorageRef = getSessionStorage();

    if (mode === 'session') {
      sessionStorageRef?.setItem(key, value);
      localStorageRef?.removeItem(key);
      return;
    }

    localStorageRef?.setItem(key, value);
    sessionStorageRef?.removeItem(key);
  },
  removeItem: (key: string): void => {
    getLocalStorage()?.removeItem(key);
    getSessionStorage()?.removeItem(key);
  },
};

export const setRememberSessionPersistence = (rememberMe: boolean): void => {
  const mode: AuthPersistenceMode = rememberMe ? 'local' : 'session';
  writeAuthPersistenceMode(mode);

  if (mode === 'session') {
    removeSupabaseAuthTokens(getLocalStorage());
    return;
  }

  removeSupabaseAuthTokens(getSessionStorage());
};

export const isRememberSessionEnabled = (): boolean => {
  return readAuthPersistenceMode() === 'local';
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: hybridAuthStorage,
  },
});
