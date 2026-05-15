import { beforeEach, describe, expect, it } from 'vitest';
import { createIdbQueue } from './idb-queue';

interface TestItem {
  __key: string;
  n: number;
}

let dbCounter = 0;
const freshDbName = () => `test-idb-${dbCounter++}`;

describe('idb-queue', () => {
  it('returns empty array when store is empty', async () => {
    const q = createIdbQueue<TestItem>({
      dbName: freshDbName(),
      storeName: 'items',
      changeEventName: 'items:changed',
    });
    await q.ready;
    expect(q.getAll()).toEqual([]);
  });

  it('migrates from localStorage legacy key', async () => {
    const legacyKey = 'test:legacy-key:v1';
    const items: TestItem[] = [
      { __key: 'a1', n: 1 },
      { __key: 'a2', n: 2 },
    ];
    window.localStorage.setItem(legacyKey, JSON.stringify({ version: 1, items }));

    const q = createIdbQueue<TestItem>({
      dbName: freshDbName(),
      storeName: 'items',
      legacyLocalStorageKey: legacyKey,
      legacyParse: (raw) => {
        const p = JSON.parse(raw);
        return Array.isArray(p?.items) ? p.items : [];
      },
      changeEventName: 'items:changed',
    });
    await q.ready;

    expect(q.getAll()).toHaveLength(2);
    // Legacy key preserved — not deleted.
    expect(window.localStorage.getItem(legacyKey)).not.toBeNull();
    // Migration timestamp written.
    expect(window.localStorage.getItem(`${legacyKey}:migrated_at`)).not.toBeNull();

    window.localStorage.removeItem(legacyKey);
    window.localStorage.removeItem(`${legacyKey}:migrated_at`);
  });

  it('round-trips: upsert persists and a new instance sees it from IDB', async () => {
    const dbName = freshDbName();
    const storeName = 'items';

    const q1 = createIdbQueue<TestItem>({ dbName, storeName, changeEventName: 'x:changed' });
    await q1.ready;
    q1.upsert('k1', { __key: 'k1', n: 42 });

    // Wait for the async IDB write to complete.
    await new Promise((r) => setTimeout(r, 30));

    const q2 = createIdbQueue<TestItem>({ dbName, storeName, changeEventName: 'x:changed' });
    await q2.ready;
    expect(q2.getAll()).toEqual([{ __key: 'k1', n: 42 }]);
  });

  it('fires quota-exceeded event when IDB put rejects with QuotaExceededError', async () => {
    const q = createIdbQueue<TestItem>({
      dbName: freshDbName(),
      storeName: 'items',
      changeEventName: 'items:changed',
    });
    await q.ready;

    // Patch IDBDatabase.prototype.transaction so that readwrite transactions
    // return a fake store whose put() fires an error with QuotaExceededError.
    // This simulates the real browser quota failure path without relying on
    // fake-indexeddb internals.
    const origTx = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode
    ): IDBTransaction {
      if (mode === 'readwrite') {
        const fakeReq: Partial<IDBRequest> & { onsuccess: null | (() => void); onerror: null | (() => void) } = {
          onsuccess: null,
          onerror: null,
          error: new DOMException('Storage quota exceeded', 'QuotaExceededError'),
        };
        setTimeout(() => { fakeReq.onerror?.(); }, 0);
        const fakeTx = {
          objectStore: () => ({
            put: () => fakeReq as unknown as IDBRequest,
            getAll: () => ({ onsuccess: null, onerror: null, result: [] } as unknown as IDBRequest),
            count: () => ({ onsuccess: null, onerror: null, result: 0 } as unknown as IDBRequest),
            delete: () => ({ onsuccess: null, onerror: null } as unknown as IDBRequest),
          }),
        };
        return fakeTx as unknown as IDBTransaction;
      }
      return origTx.call(this, storeNames, mode);
    };

    const quotaFired = new Promise<void>((resolve) => {
      window.addEventListener('mabini:queue-quota-exceeded', () => resolve(), { once: true });
    });

    q.upsert('k', { __key: 'k', n: 99 });
    await quotaFired;

    // Mirror should still contain the item even though IDB write failed.
    expect(q.getAll().find((i) => i.__key === 'k')).toBeDefined();

    IDBDatabase.prototype.transaction = origTx;
  }, 10000);

  it('cross-tab: sibling queue refreshes after upsert via BroadcastChannel', async () => {
    const dbName = freshDbName();
    const storeName = 'items';
    const bcName = `test-bc-${dbName}`;

    const q1 = createIdbQueue<TestItem>({ dbName, storeName, changeEventName: 'y:changed', broadcastChannel: bcName });
    const q2 = createIdbQueue<TestItem>({ dbName, storeName, changeEventName: 'y:changed', broadcastChannel: bcName });
    await Promise.all([q1.ready, q2.ready]);

    q1.upsert('cross', { __key: 'cross', n: 7 });

    // Wait for IDB write + BroadcastChannel message + mirror refresh.
    await new Promise((r) => setTimeout(r, 150));

    expect(q2.getAll().find((i) => i.__key === 'cross')).toBeDefined();
  }, 10000);
});
