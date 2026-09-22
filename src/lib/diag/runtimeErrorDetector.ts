import { diag } from "./diag";
import { reportIncident } from "./incidentReporter";

export function installRuntimeErrorDetector() {
  window.addEventListener("error", (event) => {
    const error = event.error || new Error(event.message);
    diag.error("diagnostics", "window-error", error);
    void reportIncident({
      error_name: error instanceof Error ? error.name : "WindowError",
      error_message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      source: "window-error",
      severity: "critical",
      route: window.location.pathname,
      context: { filename: event.filename || null, line: event.lineno || null, column: event.colno || null },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    diag.error("diagnostics", "unhandled-promise", reason);
    void reportIncident({
      error_name: reason?.name || "UnhandledPromiseRejection",
      error_message: reason?.message || String(reason),
      stack: reason?.stack,
      source: "unhandled-promise",
      severity: "critical",
      route: window.location.pathname,
    });
  });
}
