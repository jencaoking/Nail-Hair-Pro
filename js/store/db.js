/* IndexedDB 极简封装：仅 history 一个 store，LRU 上限 30 条 */
const DB_NAME = 'tryon-db';
const STORE = 'history';
const MAX_RECORDS = 30;
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const out = fn(store);
    tx.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

export async function addHistory(record) {
  await run('readwrite', s => s.add(record));
  await pruneTo(MAX_RECORDS);
}

export async function listHistory() {
  try {
    const all = await run('readonly', s => s.getAll());
    return (all || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    return [];
  }
}

export async function deleteHistory(id) {
  await run('readwrite', s => s.delete(id));
}

export async function clearHistory() {
  await run('readwrite', s => s.clear());
}

async function pruneTo(max) {
  const all = await listHistory();
  const extra = all.slice(max);
  for (const rec of extra) await deleteHistory(rec.id);
}
