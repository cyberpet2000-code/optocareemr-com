// Encrypted offline browser storage for sensitive OptoCare data.
// Device encryption keys and encrypted data records are stored in IndexedDB.
// A one-time migration keeps older encrypted/localStorage caches usable.

const KEY_DB = "optocare-secure-key";
const KEY_STORE = "keys";
const KEY_ID = "offline-data-key";
const DATA_DB = "optocare-secure-data";
const DATA_STORE = "records";
const DATA_VERSION = 2;
const DATA_PREFIX = "optocare:secure-offline:";

type StoredRecord = { key: string; v: number; t: number; iv: string; data: string };

function openDb(name: string, version: number, upgrade: (db: IDBDatabase) => void): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => upgrade(req.result);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

function openKeyDb() {
  return openDb(KEY_DB, 1, db => {
    if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
  });
}

function openDataDb() {
  return openDb(DATA_DB, DATA_VERSION, db => {
    if (!db.objectStoreNames.contains(DATA_STORE)) {
      const store = db.createObjectStore(DATA_STORE, { keyPath: "key" });
      store.createIndex("updatedAt", "t", { unique: false });
    }
  });
}

async function getKey(): Promise<CryptoKey | null> {
  const db = await openKeyDb();
  if (!db || !window.crypto?.subtle) return null;
  try {
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readonly");
      const req = tx.objectStore(KEY_STORE).get(KEY_ID);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).put(key, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return key;
  } catch { return null; } finally { db.close(); }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptRecord<T>(key: string, data: T, cryptoKey: CryptoKey): Promise<StoredRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
  return { key, v: 2, t: Date.now(), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(ciphertext)) };
}

async function writeIdb(record: StoredRecord): Promise<boolean> {
  const db = await openDataDb();
  if (!db) return false;
  try {
    return await new Promise<boolean>(resolve => {
      const tx = db.transaction(DATA_STORE, "readwrite");
      tx.objectStore(DATA_STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  } finally { db.close(); }
}

async function readIdb(key: string): Promise<StoredRecord | null> {
  const db = await openDataDb();
  if (!db) return null;
  try {
    return await new Promise<StoredRecord | null>(resolve => {
      const req = db.transaction(DATA_STORE, "readonly").objectStore(DATA_STORE).get(key);
      req.onsuccess = () => resolve((req.result as StoredRecord) || null);
      req.onerror = () => resolve(null);
    });
  } finally { db.close(); }
}

async function deleteIdb(key: string): Promise<void> {
  const db = await openDataDb();
  if (!db) return;
  try {
    await new Promise<void>(resolve => {
      const tx = db.transaction(DATA_STORE, "readwrite");
      tx.objectStore(DATA_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally { db.close(); }
}

async function decryptRecord<T>(record: StoredRecord, cryptoKey: CryptoKey): Promise<T | null> {
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(record.iv) },
      cryptoKey,
      base64ToBytes(record.data),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch { return null; }
}

async function migrateLegacyLocalStorage(key: string, cryptoKey: CryptoKey): Promise<StoredRecord | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DATA_PREFIX + key);
    if (!raw) raw = localStorage.getItem("optocare:offline:" + key);
  } catch { return null; }
  if (!raw) return null;

  try {
    const legacy = JSON.parse(raw);
    const record: StoredRecord = legacy?.v === 1 && legacy.iv && legacy.data
      ? { key, v: 2, t: Number(legacy.t || Date.now()), iv: legacy.iv, data: legacy.data }
      : await encryptRecord(key, legacy?.data ?? null, cryptoKey);
    const saved = await writeIdb(record);
    if (saved) {
      try {
        localStorage.removeItem(DATA_PREFIX + key);
        localStorage.removeItem("optocare:offline:" + key);
      } catch { /* noop */ }
      return record;
    }
  } catch { /* noop */ }
  return null;
}

export async function secureOfflineSave<T>(key: string, data: T): Promise<boolean> {
  const cryptoKey = await getKey();
  if (!cryptoKey) return false;
  try {
    const record = await encryptRecord(key, data, cryptoKey);
    if (await writeIdb(record)) {
      // Remove old copies so storage does not grow in two places.
      try {
        localStorage.removeItem(DATA_PREFIX + key);
        localStorage.removeItem("optocare:offline:" + key);
      } catch { /* noop */ }
      return true;
    }

    // Compatibility fallback for browsers where IndexedDB is unavailable.
    localStorage.setItem(DATA_PREFIX + key, JSON.stringify(record));
    return true;
  } catch { return false; }
}

export async function secureOfflineGet<T>(key: string): Promise<T | null> {
  const cryptoKey = await getKey();
  if (!cryptoKey) return null;

  let record = await readIdb(key);
  if (!record) record = await migrateLegacyLocalStorage(key, cryptoKey);
  if (!record) return null;

  return decryptRecord<T>(record, cryptoKey);
}

export function secureOfflineRemove(key: string): void {
  void deleteIdb(key);
  try {
    localStorage.removeItem(DATA_PREFIX + key);
    localStorage.removeItem("optocare:offline:" + key);
  } catch { /* noop */ }
}

export function secureOfflineClearData(): void {
  void (async () => {
    const db = await openDataDb();
    if (db) {
      try {
        await new Promise<void>(resolve => {
          const tx = db.transaction(DATA_STORE, "readwrite");
          tx.objectStore(DATA_STORE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      } finally { db.close(); }
    }
    try {
      const remove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(DATA_PREFIX) || k?.startsWith("optocare:offline:")) remove.push(k);
      }
      remove.forEach(k => localStorage.removeItem(k));
    } catch { /* noop */ }
  })();
}

export async function secureOfflineClearKey(): Promise<void> {
  secureOfflineClearData();
  const db = await openKeyDb();
  if (!db) return;
  try {
    await new Promise<void>(resolve => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).delete(KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally { db.close(); }
}
