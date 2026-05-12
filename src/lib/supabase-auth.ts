import type { Session } from "@supabase/supabase-js";

export const AUTH_BOOTSTRAP_TIMEOUT_MS = 5000;

const STORAGE_PROBE_KEY = "__optocare_supabase_storage_probe__";
const LOCK_POLL_INTERVAL_MS = 50;

type AuthSessionApi = {
  getSession: () => Promise<{ data: { session: Session | null } }>;
};

type AuthLockEntry = {
  token: symbol;
  promise: Promise<unknown>;
  startedAt: number;
};

type SessionResolution = {
  session: Session | null;
  recovered: boolean;
  storageAvailable: boolean;
  source: "override" | "primary" | "retry" | "none";
  error: Error | null;
};

type SafeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type GlobalWithSupabaseAuth = typeof globalThis & {
  __optocareAuthLocks?: Map<string, AuthLockEntry | null>;
  __optocareKnownSession?: Session | null;
  __optocareSessionRestorePromise?: Promise<SessionResolution>;
  __optocareStorageAvailable?: boolean | null;
  __optocareStorageFallback?: Map<string, string>;
};

const sharedGlobal = globalThis as GlobalWithSupabaseAuth;

function wait(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function toError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown auth error");
}

function isTimeoutError(error: Error) {
  return /timed out/i.test(error.message);
}

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

export function isSupabaseStorageAvailable(forceCheck = false) {
  if (!forceCheck && sharedGlobal.__optocareStorageAvailable !== undefined && sharedGlobal.__optocareStorageAvailable !== null) {
    return sharedGlobal.__optocareStorageAvailable;
  }

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
  } catch (error) {
    const nextError = toError(error);
    sharedGlobal.__optocareStorageAvailable = false;
    // eslint-disable-next-line no-console
    console.warn("[auth:storage] localStorage unavailable", { message: nextError.message });
    return false;
  }
}

export const safeSupabaseStorage: SafeStorage = {
  getItem(key) {
    const storage = getBrowserLocalStorage();
    if (storage && isSupabaseStorageAvailable()) {
      try {
        return storage.getItem(key);
      } catch (error) {
        const nextError = toError(error);
        sharedGlobal.__optocareStorageAvailable = false;
        // eslint-disable-next-line no-console
        console.warn("[auth:storage:get] Falling back to memory storage", { key, message: nextError.message });
      }
    }

    return getFallbackStorage().get(key) ?? null;
  },
  setItem(key, value) {
    const storage = getBrowserLocalStorage();
    if (storage && isSupabaseStorageAvailable()) {
      try {
        storage.setItem(key, value);
      } catch (error) {
        const nextError = toError(error);
        sharedGlobal.__optocareStorageAvailable = false;
        // eslint-disable-next-line no-console
        console.warn("[auth:storage:set] Falling back to memory storage", { key, message: nextError.message });
      }
    }

    getFallbackStorage().set(key, value);
  },
  removeItem(key) {
    const storage = getBrowserLocalStorage();
    if (storage && isSupabaseStorageAvailable()) {
      try {
        storage.removeItem(key);
      } catch (error) {
        const nextError = toError(error);
        sharedGlobal.__optocareStorageAvailable = false;
        // eslint-disable-next-line no-console
        console.warn("[auth:storage:remove] Falling back to memory storage", { key, message: nextError.message });
      }
    }

    getFallbackStorage().delete(key);
  },
};

export async function supabaseAuthLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>) {
  if (!sharedGlobal.__optocareAuthLocks) {
    sharedGlobal.__optocareAuthLocks = new Map<string, AuthLockEntry | null>();
  }

  const locks = sharedGlobal.__optocareAuthLocks;
  const waitStartedAt = Date.now();

  while (true) {
    const activeLock = locks.get(name) ?? null;
    if (!activeLock) break;

    if (acquireTimeout === 0) {
      const error = new Error(`Acquiring auth lock \"${name}\" immediately failed`) as Error & { isAcquireTimeout?: boolean };
      error.isAcquireTimeout = true;
      throw error;
    }

    const elapsedMs = Date.now() - waitStartedAt;
    if (acquireTimeout > 0 && elapsedMs >= acquireTimeout) {
      // eslint-disable-next-line no-console
      console.warn("[auth:lock:timeout] Releasing stalled auth lock", {
        name,
        acquireTimeout,
        heldForMs: Date.now() - activeLock.startedAt,
      });
      locks.set(name, null);
      break;
    }

    await Promise.race([
      activeLock.promise.catch(() => undefined),
      wait(acquireTimeout > 0 ? Math.min(LOCK_POLL_INTERVAL_MS, Math.max(LOCK_POLL_INTERVAL_MS, acquireTimeout - elapsedMs)) : LOCK_POLL_INTERVAL_MS),
    ]);
  }

  const token = Symbol(name);
  const execution = Promise.resolve().then(fn);
  locks.set(name, { token, promise: execution, startedAt: Date.now() });

  try {
    return await execution;
  } finally {
    if (locks.get(name)?.token === token) {
      locks.set(name, null);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function attemptSessionRestore(auth: AuthSessionApi, attempt: "primary" | "retry", timeoutMs: number) {
  // eslint-disable-next-line no-console
  console.debug("[auth:getSession:start]", { attempt, timeoutMs });

  try {
    const result = await withTimeout(auth.getSession(), timeoutMs, "Supabase session restore");
    const session = result.data.session ?? null;
    setKnownSupabaseSession(session);
    // eslint-disable-next-line no-console
    console.debug("[auth:getSession:result]", {
      attempt,
      hasSession: !!session,
      user_id: session?.user?.id ?? null,
      tokenPresent: !!session?.access_token,
    });
    return { session, error: null };
  } catch (error) {
    const nextError = toError(error);
    // eslint-disable-next-line no-console
    console.warn(isTimeoutError(nextError) ? "[auth:timeout]" : "[auth:getSession:error]", {
      attempt,
      message: nextError.message,
    });
    return { session: null, error: nextError };
  }
}

export function getKnownSupabaseSession() {
  return sharedGlobal.__optocareKnownSession ?? null;
}

export function setKnownSupabaseSession(session: Session | null) {
  sharedGlobal.__optocareKnownSession = session;
}

export async function resolveSupabaseSessionWithRecovery(
  auth: AuthSessionApi,
  options: {
    sessionOverride?: Session | null;
    forceFresh?: boolean;
    timeoutMs?: number;
  } = {},
) {
  const timeoutMs = options.timeoutMs ?? AUTH_BOOTSTRAP_TIMEOUT_MS;

  if (options.sessionOverride !== undefined) {
    setKnownSupabaseSession(options.sessionOverride);
    // eslint-disable-next-line no-console
    console.debug("[auth:init:override]", {
      hasSession: !!options.sessionOverride,
      user_id: options.sessionOverride?.user?.id ?? null,
      tokenPresent: !!options.sessionOverride?.access_token,
    });
    return {
      session: options.sessionOverride,
      recovered: false,
      storageAvailable: isSupabaseStorageAvailable(),
      source: "override",
      error: null,
    } satisfies SessionResolution;
  }

  if (!options.forceFresh && sharedGlobal.__optocareSessionRestorePromise) {
    return sharedGlobal.__optocareSessionRestorePromise;
  }

  const runPromise = (async () => {
    const storageAvailable = isSupabaseStorageAvailable(true);
    // eslint-disable-next-line no-console
    console.debug("[auth:init:start]", { storageAvailable, timeoutMs });

    const firstAttempt = await attemptSessionRestore(auth, "primary", timeoutMs);
    if (!firstAttempt.error) {
      return {
        session: firstAttempt.session,
        recovered: false,
        storageAvailable,
        source: "primary",
        error: null,
      } satisfies SessionResolution;
    }

    setKnownSupabaseSession(null);
    // eslint-disable-next-line no-console
    console.warn("[auth:retry] Retrying auth bootstrap after failed session restore", {
      message: firstAttempt.error.message,
    });

    await wait(150);

    const retryAttempt = await attemptSessionRestore(auth, "retry", timeoutMs);
    return {
      session: retryAttempt.session,
      recovered: true,
      storageAvailable,
      source: retryAttempt.error ? "none" : "retry",
      error: retryAttempt.error,
    } satisfies SessionResolution;
  })();

  sharedGlobal.__optocareSessionRestorePromise = runPromise;

  try {
    return await runPromise;
  } finally {
    if (sharedGlobal.__optocareSessionRestorePromise === runPromise) {
      sharedGlobal.__optocareSessionRestorePromise = undefined;
    }
  }
}