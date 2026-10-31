// In-memory IndexedDB polyfill for Node.js test execution of idb-backed production services

class IDBRequest extends EventTarget {
  constructor() {
    super();
    this.result = null;
    this.error = null;
    this.source = null;
    this.transaction = null;
    this.readyState = 'pending';
  }
}
class IDBOpenDBRequest extends IDBRequest {}
class IDBTransaction extends EventTarget {
  constructor(db, mode, store, storeNames) {
    super();
    this.db = db;
    this.mode = mode;
    this.error = null;
    this.store = store;
    this.objectStoreNames = Array.isArray(storeNames) ? storeNames : [storeNames || 'store1'];
  }
  objectStore() {
    return this.store;
  }
}
class IDBDatabase extends EventTarget {
  constructor(name, version) {
    super();
    this.name = name;
    this.version = version;
    this.objectStoreNames = {
      contains: () => true,
    };
  }
}
class IDBObjectStore {
  put() {}
  get() {}
  getAll() {}
  delete() {}
  clear() {}
  index() {}
}
class IDBIndex {
  get() {}
  getAll() {}
}
class IDBCursor {}

globalThis.IDBRequest = IDBRequest;
globalThis.IDBOpenDBRequest = IDBOpenDBRequest;
globalThis.IDBTransaction = IDBTransaction;
globalThis.IDBDatabase = IDBDatabase;
globalThis.IDBObjectStore = IDBObjectStore;
globalThis.IDBIndex = IDBIndex;
globalThis.IDBCursor = IDBCursor;

const storage = new Map();

class MockStore extends IDBObjectStore {
  get(key) {
    const req = new IDBRequest();
    queueMicrotask(() => {
      req.result = storage.get(key);
      req.dispatchEvent(new Event('success'));
    });
    return req;
  }
  put(value) {
    const req = new IDBRequest();
    queueMicrotask(() => {
      const key = value.client_report_id || value.id || 'k1';
      storage.set(key, value);
      req.result = key;
      req.dispatchEvent(new Event('success'));
    });
    return req;
  }
  getAll() {
    const req = new IDBRequest();
    queueMicrotask(() => {
      const all = Array.from(storage.values()).sort((a, b) => {
        return new Date(a.queued_at || 0).getTime() - new Date(b.queued_at || 0).getTime();
      });
      req.result = all;
      req.dispatchEvent(new Event('success'));
    });
    return req;
  }
  delete(key) {
    const req = new IDBRequest();
    queueMicrotask(() => {
      storage.delete(key);
      req.result = undefined;
      req.dispatchEvent(new Event('success'));
    });
    return req;
  }
  clear() {
    const req = new IDBRequest();
    queueMicrotask(() => {
      storage.clear();
      req.result = undefined;
      req.dispatchEvent(new Event('success'));
    });
    return req;
  }
  index() {
    return this;
  }
}

const mockStore = new MockStore();

class MockDB extends IDBDatabase {
  transaction(storeNames, mode) {
    const tx = new IDBTransaction(this, mode, mockStore, storeNames);
    queueMicrotask(() => {
      tx.dispatchEvent(new Event('complete'));
    });
    return tx;
  }
  createObjectStore() {
    return mockStore;
  }
}

globalThis.window = globalThis;
globalThis.indexedDB = {
  open(name, version) {
    const req = new IDBOpenDBRequest();
    const db = new MockDB(name, version);
    queueMicrotask(() => {
      req.result = db;
      req.dispatchEvent(new Event('upgradeneeded'));
      queueMicrotask(() => {
        req.dispatchEvent(new Event('success'));
      });
    });
    return req;
  }
};

