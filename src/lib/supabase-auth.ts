import type { Session } from "@supabase/supabase-js";

// Minimal helpers around Supabase auth storage + cached session.
// Uses browser localStorage directly for deterministic, persistent auth state.

type GlobalWithSupabaseAuth = typeof globalThis & {
  __optocareKnownSession?: Session | null;
};

const sharedGlobal = globalThis as GlobalWithSupabaseAuth;

export const safeSupabaseStorage = {
  getItem(key: string) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Storage can be temporarily unavailable in restricted/private browser
      // contexts. Never turn a storage read failure into an authentication loss.
      return null;
    }
  },

  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Do not sign the user out if the browser temporarily rejects storage.
    }
  },

  removeItem(key: string) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
  },
};

export function getKnownSupabaseSession(): Session | null {
  return sharedGlobal.__optocareKnownSession ?? null;
}

export function setKnownSupabaseSession(session: Session | null) {
  sharedGlobal.__optocareKnownSession = session;
}
