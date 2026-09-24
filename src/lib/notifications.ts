export async function enableNotifications() {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

export async function showNotification(
  title: string,
  body: string
) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // Standard Notification() is not supported in some browser/PWA contexts.
  // Prefer the active service worker registration when available.
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        icon: "/favicon.ico",
      });
      return;
    }
  } catch {
    // Keep notifications non-blocking; they must never break the EMR UI.
  }
}