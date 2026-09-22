import { getIssues, resolveIssue } from "./issueTracker";
import { flushIncidentQueue, reportIncident } from "./incidentReporter";

export type HealingAction = {
  name: string;
  attempted: boolean;
  verified: boolean;
  detail: string;
};

async function recoverCaches(): Promise<HealingAction> {
  if (typeof caches === "undefined") {
    return { name: "Clear stale app caches", attempted: false, verified: false, detail: "Cache API unavailable." };
  }

  try {
    const names = await caches.keys();
    const targets = names.filter((name) => /optocare|workbox|vite/i.test(name));
    await Promise.all(targets.map((name) => caches.delete(name)));
    return {
      name: "Clear stale app caches",
      attempted: true,
      verified: true,
      detail: targets.length ? `Cleared ${targets.length} application cache(s).` : "No stale OptoCare cache found.",
    };
  } catch (error) {
    return { name: "Clear stale app caches", attempted: true, verified: false, detail: String(error) };
  }
}

async function recoverServiceWorker(): Promise<HealingAction> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { name: "Refresh service worker", attempted: false, verified: false, detail: "Service Worker API unavailable." };
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
    return {
      name: "Refresh service worker",
      attempted: true,
      verified: true,
      detail: registrations.length ? `Refreshed ${registrations.length} service worker registration(s).` : "No service worker registration found.",
    };
  } catch (error) {
    return { name: "Refresh service worker", attempted: true, verified: false, detail: String(error) };
  }
}

export async function runSelfHealing() {
  const actions: HealingAction[] = [];

  actions.push(await recoverCaches());
  actions.push(await recoverServiceWorker());

  try {
    await flushIncidentQueue();
    actions.push({
      name: "Flush offline incident queue",
      attempted: true,
      verified: typeof navigator === "undefined" || navigator.onLine,
      detail: "Queued maintenance evidence was sent when connectivity was available.",
    });
  } catch (error) {
    actions.push({ name: "Flush offline incident queue", attempted: true, verified: false, detail: String(error) });
  }

  const localIssues = getIssues();
  const safeIssueNames = localIssues
    .filter((issue) => issue.status === "open")
    .filter((issue) => /cache|service worker|stale shell/i.test(issue.name))
    .map((issue) => issue.name);

  safeIssueNames.forEach(resolveIssue);

  const verified = actions.filter((action) => action.verified).length;
  const failed = actions.filter((action) => action.attempted && !action.verified).length;

  return {
    actions,
    healedCount: verified,
    failedCount: failed,
    note: "Self-healing only performs predefined, reversible client recovery actions. It never edits production source code or automatically closes central incidents.",
  };
}

export async function reportHealingResult(result: Awaited<ReturnType<typeof runSelfHealing>>) {
  if (!result.actions.length) return;
  await reportIncident({
    page_name: typeof document !== "undefined" ? document.title : "System Health",
    route: typeof window !== "undefined" ? window.location.pathname : null,
    error_name: "self-healing",
    error_message: result.failedCount ? "Safe self-healing completed with failures" : "Safe self-healing completed",
    source: "self-healing",
    severity: result.failedCount ? "warning" : "info",
    context: result,
  });
}
