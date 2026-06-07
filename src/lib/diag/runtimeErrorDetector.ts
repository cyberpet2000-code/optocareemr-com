import { diag } from "./diag";

export function installRuntimeErrorDetector() {
  window.addEventListener("error", (event) => {
    diag.error(
      "runtime",
      "window-error",
      event.error || event.message
    );
  });

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      diag.error(
        "runtime",
        "unhandled-promise",
        event.reason
      );
    }
  );
}
