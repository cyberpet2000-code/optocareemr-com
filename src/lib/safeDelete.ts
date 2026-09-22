type DestructiveActionOptions = {
  item: string;
  details?: string;
  highRisk?: boolean;
};

/**
 * Branded, app-level destructive confirmation.
 *
 * Native window.confirm/prompt/alert dialogs are unreliable in some
 * mobile/PWA/browser contexts, so OptoCare uses an in-app modal instead.
 */
export function confirmDestructiveAction(
  options: DestructiveActionOptions,
): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    const existing = document.getElementById("optocare-delete-confirmation");
    existing?.remove();

    const overlay = document.createElement("div");
    overlay.id = "optocare-delete-confirmation";
    overlay.setAttribute("role", "presentation");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      background: "rgba(0, 29, 57, 0.58)",
      backdropFilter: "blur(3px)",
    });

    const card = document.createElement("div");
    Object.assign(card.style, {
      width: "min(100%, 460px)",
      maxHeight: "calc(100vh - 40px)",
      overflowY: "auto",
      borderRadius: "20px",
      background: "#ffffff",
      boxShadow: "0 24px 80px rgba(0, 29, 57, 0.28)",
      padding: "24px",
      fontFamily: "inherit",
      color: "#001D39",
    });

    const title = document.createElement("h2");
    title.textContent = options.highRisk ? "Confirm Permanent Deletion" : "Confirm Deletion";
    Object.assign(title.style, { margin: "0 0 10px", fontSize: "20px", fontWeight: "700" });

    const message = document.createElement("p");
    message.textContent = `This action will permanently delete ${options.item}.`;
    Object.assign(message.style, { margin: "0", fontSize: "15px", lineHeight: "1.5" });

    card.append(title, message);

    if (options.details) {
      const details = document.createElement("p");
      details.textContent = options.details;
      Object.assign(details.style, {
        margin: "12px 0 0",
        padding: "12px",
        borderRadius: "12px",
        background: "#EEF8FB",
        color: "#36566D",
        fontSize: "13px",
        lineHeight: "1.5",
      });
      card.append(details);
    }

    let input: HTMLInputElement | null = null;
    if (options.highRisk) {
      const warning = document.createElement("p");
      warning.textContent = "This is a high-risk deletion and cannot be undone.";
      Object.assign(warning.style, {
        margin: "14px 0 8px",
        color: "#B42318",
        fontSize: "13px",
        fontWeight: "600",
      });
      card.append(warning);

      const label = document.createElement("label");
      label.textContent = "Type DELETE to confirm";
      Object.assign(label.style, { display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "600" });

      input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.autocapitalize = "characters";
      input.placeholder = "DELETE";
      Object.assign(input.style, {
        boxSizing: "border-box",
        width: "100%",
        border: "1px solid #B8CCD8",
        borderRadius: "10px",
        padding: "11px 12px",
        outline: "none",
        fontSize: "15px",
      });
      card.append(label, input);
    }

    const actions = document.createElement("div");
    Object.assign(actions.style, {
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
      marginTop: "20px",
    });

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    Object.assign(cancel.style, {
      border: "1px solid #B8CCD8",
      borderRadius: "10px",
      background: "#ffffff",
      color: "#36566D",
      padding: "10px 16px",
      fontWeight: "600",
      cursor: "pointer",
    });

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Delete";
    Object.assign(confirm.style, {
      border: "0",
      borderRadius: "10px",
      background: "#B42318",
      color: "#ffffff",
      padding: "10px 16px",
      fontWeight: "700",
      cursor: "pointer",
    });

    const cleanup = (result: boolean) => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      resolve(result);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cleanup(false);
      if (event.key === "Enter" && (!options.highRisk || input?.value.trim().toUpperCase() === "DELETE")) {
        cleanup(true);
      }
    };

    cancel.addEventListener("click", () => cleanup(false));
    confirm.addEventListener("click", () => {
      if (options.highRisk && input?.value.trim().toUpperCase() !== "DELETE") {
        input?.focus();
        input?.setAttribute("aria-invalid", "true");
        return;
      }
      cleanup(true);
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) cleanup(false);
    });

    document.addEventListener("keydown", onKeyDown);
    actions.append(cancel, confirm);
    card.append(actions);
    overlay.append(card);
    document.body.append(overlay);

    if (input) {
      window.setTimeout(() => input?.focus(), 0);
    } else {
      window.setTimeout(() => cancel.focus(), 0);
    }
  });
}
