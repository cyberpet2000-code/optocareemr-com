import { diag } from "./diag";

export function installRuntimeErrorDetector() {
  window.addEventListener("error", (event) => {
    diag.error(
      "app",
      "window-error",
      event.error || event.message
    );
  });

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      diag.error(
        "app",
        "unhandled-promise",
        event.reason
      );
    }
  );
}
