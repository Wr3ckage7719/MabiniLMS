export interface IdbQueueOptions<T> {
  dbName: string;
  storeName: string;
  legacyLocalStorageKey?: string;
  legacyParse?: (raw: string) => T[];
  changeEventName: string;
  broadcastChannel?: string;
}

export interface IdbQueue<T> {
  ready: Promise<void>;
  getAll(): T[];
  upsert(key: string, item: T): void;
  remove(key: string): void;
  replaceAll(items: T[]): void;
  subscribe(listener: () => void): () => void;
}

const openDb = (dbName: string, storeName: string): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: '__key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const dbGetAll = <T>(db: IDBDatabase, storeName: string): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
};

const dbPut = <T>(db: IDBDatabase, storeName: string, item: T): Promise<void> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const dbDelete = (db: IDBDatabase, storeName: string, key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
};

const dbCount = (db: IDBDatabase, storeName: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const dbPutAll = <T>(db: IDBDatabase, storeName: string, items: T[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    let i = 0;
    const putNext = () => {
      if (i >= items.length) { resolve(); return; }
      const req = store.put(items[i++]);
      req.onsuccess = putNext;
      req.onerror = () => reject(req.error);
    };
    putNext();
  });
};

export function createIdbQueue<T extends { __key: string }>(
  options: IdbQueueOptions<T>
): IdbQueue<T> {
  const { dbName, storeName, legacyLocalStorageKey, legacyParse, changeEventName, broadcastChannel: bcName } = options;

  let mirror: T[] = [];
  let db: IDBDatabase | null = null;
  let bc: BroadcastChannel | null = null;
  let persistRequestedOnce = false;

  const listeners = new Set<() => void>();

  const notify = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(changeEventName));
    }
    for (const l of listeners) l();
  };

  const schedulePersist = (item: T) => {
    if (!db) return;
    dbPut(db, storeName, item).then(() => {
      bc?.postMessage({ type: 'refresh' });
    }).catch((err: unknown) => {
      const isQuota = err instanceof DOMException && (
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      );
      if (isQuota) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mabini:queue-quota-exceeded', { detail: { store: storeName } }));
        }
      }
    });
  };

  const scheduleRemove = (key: string) => {
    if (!db) return;
    dbDelete(db, storeName, key).then(() => {
      bc?.postMessage({ type: 'refresh' });
    }).catch(() => undefined);
  };

  const refreshMirrorFromIdb = async () => {
    if (!db) return;
    mirror = await dbGetAll<T>(db, storeName);
    notify();
  };

  const ready = (async () => {
    db = await openDb(dbName, storeName);

    if (legacyLocalStorageKey && legacyParse && typeof window !== 'undefined') {
      try {
        const count = await dbCount(db, storeName);
        if (count === 0) {
          const raw = window.localStorage.getItem(legacyLocalStorageKey);
          if (raw) {
            const items = legacyParse(raw);
            if (items.length > 0) {
              await dbPutAll(db, storeName, items);
              window.localStorage.setItem(
                `${legacyLocalStorageKey}:migrated_at`,
                new Date().toISOString()
              );
            }
          }
        }
      } catch {
        // Migration is best-effort; don't break startup.
      }
    }

    const idbItems = await dbGetAll<T>(db, storeName);

    // Merge: start with IDB contents (the persistent baseline), then overlay
    // any in-memory items that arrived before ready resolved and haven't been
    // persisted to IDB yet. This prevents a race where upserts called before
    // ready resolves are silently overwritten when we read from IDB.
    const idbKeys = new Set(idbItems.map((i) => i.__key));
    const pendingItems = mirror.filter((m) => !idbKeys.has(m.__key));
    mirror = [...idbItems, ...pendingItems];

    if (bcName && typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(bcName);
      bc.onmessage = (event) => {
        if (event.data?.type === 'refresh') {
          void refreshMirrorFromIdb();
        }
      };
    }
  })();

  return {
    ready,

    getAll(): T[] {
      return mirror.slice();
    },

    upsert(key: string, item: T): void {
      const idx = mirror.findIndex((m) => m.__key === key);
      if (idx >= 0) {
        mirror[idx] = item;
      } else {
        mirror.push(item);
      }
      notify();

      if (!persistRequestedOnce) {
        persistRequestedOnce = true;
        void (navigator as Navigator & { storage?: { persist?: () => Promise<boolean> } }).storage?.persist?.();
      }

      schedulePersist(item);
    },

    remove(key: string): void {
      mirror = mirror.filter((m) => m.__key !== key);
      notify();
      scheduleRemove(key);
    },

    replaceAll(items: T[]): void {
      mirror = items.slice();
      notify();
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
