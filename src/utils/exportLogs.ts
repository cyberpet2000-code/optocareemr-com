export function exportLogs(lines: string[], filename = "opto-care-runtime", format: "log" | "json" = "log") {
  try {
    let blob: Blob;
    let ext = "log";
    if (format === "log") {
      blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      ext = "log";
    } else {
      blob = new Blob([JSON.stringify({ logs: lines, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json;charset=utf-8" });
      ext = "json";
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to export logs", err);
  }
}
