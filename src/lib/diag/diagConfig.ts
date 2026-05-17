// Diagnostic activation gate. Cheap boolean — call freely.
// Enabled when:
//   - import.meta.env.DEV is true, or
//   - URL contains ?diag=1, or
//   - localStorage.optocare_diag === "1"
//
// Toggle at runtime:
//   localStorage.setItem("optocare_diag", "1"); location.reload();

const STORAGE_KEY = "optocare_diag";

let cached: boolean | null = null;

function compute(): boolean {
  try {
    if (typeof import.meta !== "undefined" && (import.meta as any).env?.DEV) return true;
    if (typeof window === "undefined") return false;

    const url = new URL(window.location.href);
    const param = url.searchParams.get("diag");
    if (param === "1") {
      try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* noop */ }
      return true;
    }
    if (param === "0") {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      return false;
    }

    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export function isDiagEnabled(): boolean {
  if (cached === null) cached = compute();
  return cached;
}

export function setDiagEnabled(enabled: boolean) {
  cached = enabled;
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}
