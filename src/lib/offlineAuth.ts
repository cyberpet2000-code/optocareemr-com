import type { User } from "@supabase/supabase-js";

const DB_NAME = "optocare-offline-auth";
const DB_VERSION = 1;
const STORE = "trusted";
const SESSION_KEY = "optocare:offline-auth:session";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export type OfflineAccessSnapshot = {
  profile: any | null;
  clinic: any | null;
  memberships: any[];
  roles: string[];
  role: string | null;
  resolvedClinicId: string | null;
  activeClinicId: string | null;
};

type TrustedProfile = {
  id: "primary";
  userId: string;
  email: string | null;
  displayName: string | null;
  clinicId: string | null;
  snapshot: OfflineAccessSnapshot;
  salt: ArrayBuffer;
  verifier: ArrayBuffer;
  createdAt: string;
  updatedAt: string;
  failedAttempts: number;
  lockedUntil: number | null;
};

type OfflineSession = {
  userId: string;
  email: string | null;
  displayName: string | null;
  clinicId: string | null;
  startedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available on this device."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline authentication storage."));
  });
}

async function readTrusted(): Promise<TrustedProfile | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get("primary");
      request.onsuccess = () => resolve((request.result as TrustedProfile | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function writeTrusted(value: TrustedProfile) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteTrusted() {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete("primary");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore cleanup failures.
  }
}

function toBytes(value: ArrayBuffer) {
  return new Uint8Array(value);
}

async function deriveVerifier(pin: string, salt: ArrayBuffer) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
    material,
    256,
  );
}

function equalBytes(left: ArrayBuffer, right: ArrayBuffer) {
  const a = toBytes(left);
  const b = toBytes(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function getSessionMarker(): OfflineSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as OfflineSession : null;
  } catch {
    return null;
  }
}

export async function hasOfflineAccess() {
  return !!(await readTrusted());
}

export async function getTrustedOfflineProfile() {
  return readTrusted();
}

export async function enableOfflineAccess(
  user: User,
  snapshot: OfflineAccessSnapshot,
  pin: string,
) {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("Offline PIN must be exactly 6 digits.");
  }

  if (!crypto?.subtle) {
    throw new Error("This browser does not support secure offline authentication.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16)).buffer;
  const verifier = await deriveVerifier(pin, salt);

  await writeTrusted({
    id: "primary",
    userId: user.id,
    email: user.email ?? null,
    displayName: user.user_metadata?.full_name ?? user.email ?? null,
    clinicId: snapshot.activeClinicId || snapshot.resolvedClinicId || null,
    snapshot,
    salt,
    verifier,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    failedAttempts: 0,
    lockedUntil: null,
  });
}

export async function disableOfflineAccess() {
  await deleteTrusted();
  clearOfflineSession();
}

export async function getOfflineSession() {
  return getSessionMarker();
}

export function clearOfflineSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

export async function authenticateOffline(pin: string) {
  const trusted = await readTrusted();
  if (!trusted) throw new Error("Offline access has not been enabled on this device.");

  const now = Date.now();
  if (trusted.lockedUntil && trusted.lockedUntil > now) {
    const minutes = Math.max(1, Math.ceil((trusted.lockedUntil - now) / 60000));
    throw new Error(`Offline login is temporarily locked. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const verifier = await deriveVerifier(pin, trusted.salt);
  if (!equalBytes(verifier, trusted.verifier)) {
    const failedAttempts = trusted.failedAttempts + 1;
    const lockedUntil = failedAttempts >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;
    await writeTrusted({
      ...trusted,
      failedAttempts,
      lockedUntil,
      updatedAt: new Date().toISOString(),
    });
    if (lockedUntil) throw new Error("Too many incorrect PIN attempts. Offline login is locked for 5 minutes.");
    throw new Error("Incorrect offline PIN.");
  }

  await writeTrusted({
    ...trusted,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: new Date().toISOString(),
  });

  const session: OfflineSession = {
    userId: trusted.userId,
    email: trusted.email,
    displayName: trusted.displayName,
    clinicId: trusted.clinicId,
    startedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    throw new Error("Unable to start the offline session on this device.");
  }

  return { session, snapshot: trusted.snapshot };
}
