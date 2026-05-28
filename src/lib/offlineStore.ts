// Tiny localStorage helper for offline caching.
const PREFIX = "optocare:offline:";

export const offlineStore = {
  save<T>(key: string, data: T): void {
    try {
      localStorage.setItem(
        PREFIX + key,
        JSON.stringify({ t: Date.now(), data })
      );
    } catch (e) {
      console.warn("[offlineStore] save failed", key, e);
    }
  },
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed?.data ?? null) as T | null;
    } catch {
      return null;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* noop */
    }
  },
};
