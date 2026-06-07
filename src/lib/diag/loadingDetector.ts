const timers = new Map<string, number>();

export function startLoadingWatch(name: string) {
  const id = window.setTimeout(() => {
    console.warn(`[DIAG] ${name} loading > 10s`);
  }, 10000);

  timers.set(name, id);
}

export function stopLoadingWatch(name: string) {
  const id = timers.get(name);

  if (id) {
    clearTimeout(id);
    timers.delete(name);
  }
}
