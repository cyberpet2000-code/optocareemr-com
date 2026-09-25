// Encrypted browser storage for sensitive OptoCare offline data.
// Uses Web Crypto AES-GCM. The non-exportable device key lives only in IndexedDB;
// queued clinical payloads are never written as plaintext to localStorage.

const KEY_DB = "optocare-secure-key";
const KEY_STORE = "keys";
const KEY_ID = "offline-data-key";
const DATA_PREFIX = "optocare:secure-offline:";

function openKeyDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(KEY_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
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

    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).put(key, KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return key;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function secureOfflineSave<T>(key: string, data: T): Promise<boolean> {
  const cryptoKey = await getKey();
  if (!cryptoKey) return false;

  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      plaintext,
    );
    localStorage.setItem(
      DATA_PREFIX + key,
      JSON.stringify({
        v: 1,
        t: Date.now(),
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(ciphertext)),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function secureOfflineGet<T>(key: string): Promise<T | null> {
  const cryptoKey = await getKey();
  if (!cryptoKey) return null;

  try {
    const raw = localStorage.getItem(DATA_PREFIX + key);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      cryptoKey,
      base64ToBytes(envelope.data),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    return null;
  }
}

export function secureOfflineRemove(key: string): void {
  try { localStorage.removeItem(DATA_PREFIX + key); } catch { /* noop */ }
}

export function secureOfflineClearData(): void {
  try {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DATA_PREFIX)) remove.push(key);
    }
    remove.forEach((key) => localStorage.removeItem(key));
  } catch { /* noop */ }
}

export async function secureOfflineClearKey(): Promise<void> {
  secureOfflineClearData();
  const db = await openKeyDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(KEY_STORE, "readwrite");
      tx.objectStore(KEY_STORE).delete(KEY_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}
