type SupabaseAccessGateState = {
  sessionBootstrapped: boolean;
  hasSession: boolean;
  accessReady: boolean;
  userId: string | null;
};

const state: SupabaseAccessGateState = {
  sessionBootstrapped: false,
  hasSession: false,
  accessReady: false,
  userId: null,
};

const listeners = new Set<() => void>();

function createDeferred() {
  let resolvePromise!: (value: SupabaseAccessGateState) => void;

  return {
    settled: false,
    promise: new Promise<SupabaseAccessGateState>((resolve) => {
      resolvePromise = resolve;
    }),
    resolve(value: SupabaseAccessGateState) {
      if (this.settled) return;
      this.settled = true;
      resolvePromise(value);
    },
  };
}

let accessGateDeferred = createDeferred();

function notify() {
  listeners.forEach((listener) => listener());
}

function isGateReady() {
  return state.sessionBootstrapped && (!state.hasSession || state.accessReady);
}

function resolveGateIfReady() {
  if (!isGateReady()) return;
  accessGateDeferred.resolve(getSupabaseAccessGateState());
}

export function getSupabaseAccessGateState() {
  return { ...state };
}

export function resetSupabaseAccessGate(next: Partial<SupabaseAccessGateState> = {}) {
  accessGateDeferred = createDeferred();
  Object.assign(state, {
    sessionBootstrapped: false,
    hasSession: false,
    accessReady: false,
    userId: null,
  }, next);
  notify();
  resolveGateIfReady();
}

export function updateSupabaseAccessGate(next: Partial<SupabaseAccessGateState>) {
  Object.assign(state, next);
  notify();
  resolveGateIfReady();
}

export function subscribeToSupabaseAccessGate(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function waitForSupabaseAccessGate(timeoutMs = 12000) {
  if (isGateReady()) return getSupabaseAccessGateState();

  return new Promise<SupabaseAccessGateState>((resolve) => {
    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(getSupabaseAccessGateState());
    }, timeoutMs);

    const unsubscribe = subscribeToSupabaseAccessGate(() => {
      if (!isGateReady()) return;
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(getSupabaseAccessGateState());
    });

    accessGateDeferred.promise.then((value) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(value);
    });
  });
}