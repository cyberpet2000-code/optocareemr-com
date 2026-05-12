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

function notify() {
  listeners.forEach((listener) => listener());
}

export function getSupabaseAccessGateState() {
  return { ...state };
}

export function updateSupabaseAccessGate(next: Partial<SupabaseAccessGateState>) {
  Object.assign(state, next);
  notify();
}

export function subscribeToSupabaseAccessGate(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function waitForSupabaseAccessGate(timeoutMs = 12000) {
  const isReady = () => state.sessionBootstrapped && (!state.hasSession || state.accessReady);
  if (isReady()) return getSupabaseAccessGateState();

  return new Promise<SupabaseAccessGateState>((resolve) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(getSupabaseAccessGateState());
    }, timeoutMs);

    const cleanup = subscribeToSupabaseAccessGate(() => {
      if (!isReady()) return;
      window.clearTimeout(timeout);
      cleanup();
      resolve(getSupabaseAccessGateState());
    });
  });
}