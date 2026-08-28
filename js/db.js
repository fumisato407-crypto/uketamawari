// IndexedDBラッパ（実装順5で本格利用。骨組み段階では開くだけ）
const DB_NAME = "uketamawari";
const DB_VERSION = 1;

const db = (() => {
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains("products")) {
          d.createObjectStore("products", { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains("orders")) {
          d.createObjectStore("orders", { keyPath: "id" });
        }
        if (!d.objectStoreNames.contains("settings")) {
          // categories / staff などマスタ付随情報
          d.createObjectStore("settings", { keyPath: "key" });
        }
        if (!d.objectStoreNames.contains("images")) {
          // 商品写真Blob
          d.createObjectStore("images", { keyPath: "id" });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode, fn) {
    return open().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const result = fn(t.objectStore(store));
      t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
      t.onerror = () => reject(t.error);
    }));
  }

  return {
    open,
    getAll: (store) => open().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })),
    put: (store, value) => tx(store, "readwrite", (s) => s.put(value)),
    delete: (store, key) => tx(store, "readwrite", (s) => s.delete(key)),
    clear: (store) => tx(store, "readwrite", (s) => s.clear()),
  };
})();

// タブレットのストレージ逼迫時にデータを消されないよう永続化を要求
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist();
}
