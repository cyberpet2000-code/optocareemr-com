import { diag } from "./diag";

export function installRuntimeErrorDetector() {
  window.addEventListener("error", (event) => {
    diag.error(
      "diagnostics",
      "window-error",
      event.error || event.message
    );
  });

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      diag.error(
        "diagnostics",
        "unhandled-promise",
        event.reason
      );
    }
  );
}
