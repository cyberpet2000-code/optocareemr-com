import type { Session } from "@supabase/supabase-js";

// Minimal helpers around Supabase auth storage + cached session.
// No locks, no recovery loops, no fetch gates. The Supabase client + a single
// AuthProvider handle the rest.

const STORAGE_PROBE_KEY = "__optocare_supabase_storage_probe__";

type SafeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type GlobalWithSupabaseAuth = typeof globalThis & {
  __optocareKnownSession?: Session | null;
  __optocareStorageAvailable?: boolean | null;
  __optocareStorageFallback?: Map<string, string>;
};

const sharedGlobal = globalThis as GlobalWithSupabaseAuth;

function getFallbackStorage() {
  if (!sharedGlobal.__optocareStorageFallback) {
    sharedGlobal.__optocareStorageFallback = new Map<string, string>();
  }
  return sharedGlobal.__optocareStorageFallback;
}

function getBrowserLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageAvailable() {
  if (sharedGlobal.__optocareStorageAvailable != null) return sharedGlobal.__optocareStorageAvailable;
  const storage = getBrowserLocalStorage();
  if (!storage) {
    sharedGlobal.__optocareStorageAvailable = false;
    return false;
  }
  try {
    storage.setItem(STORAGE_PROBE_KEY, "1");
    storage.removeItem(STORAGE_PROBE_KEY);
    sharedGlobal.__optocareStorageAvailable = true;
    return true;
  } catch {
    sharedGlobal.__optocareStorageAvailable = false;
    return false;
  }
}

export const safeSupabaseStorage: SafeStorage = {
  getItem(key) {
    const storage = getBrowserLocalStorage();
    if (storage && storageAvailable()) {
      try { return storage.getItem(key); } catch { /* fall through */ }
    }
    return getFallbackStorage().get(key) ?? null;
  },
  setItem(key, value) {
    const storage = getBrowserLocalStorage();
    if (storage && storageAvailable()) {
      try { storage.setItem(key, value); } catch { /* fall through */ }
    }
    getFallbackStorage().set(key, value);
  },
  removeItem(key) {
    const storage = getBrowserLocalStorage();
    if (storage && storageAvailable()) {
      try { storage.removeItem(key); } catch { /* fall through */ }
    }
    getFallbackStorage().delete(key);
  },
};

export function getKnownSupabaseSession(): Session | null {
  return sharedGlobal.__optocareKnownSession ?? null;
}

export function setKnownSupabaseSession(session: Session | null) {
  sharedGlobal.__optocareKnownSession = session;
}
