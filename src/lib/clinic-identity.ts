// Lightweight persisted clinic identity (name + role) so the app shell
// stays stable while clinic/role data is loading or briefly unavailable.

const KEY = "optocare:clinic-identity";

export interface ClinicIdentity {
  name: string | null;
  role: string | null;
}

export function readIdentity(): ClinicIdentity {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return { name: null, role: null };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === "string" ? parsed.name : null,
      role: typeof parsed?.role === "string" ? parsed.role : null,
    };
  } catch {
    return { name: null, role: null };
  }
}

export function writeIdentity(next: ClinicIdentity) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearIdentity() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
