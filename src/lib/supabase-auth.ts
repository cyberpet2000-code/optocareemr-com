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
    return window.localStorage.getItem(key);
  },

  setItem(key: string, value: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },

  removeItem(key: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  },
};

export function getKnownSupabaseSession(): Session | null {
  return sharedGlobal.__optocareKnownSession ?? null;
}

export function setKnownSupabaseSession(session: Session | null) {
  sharedGlobal.__optocareKnownSession = session;
}
