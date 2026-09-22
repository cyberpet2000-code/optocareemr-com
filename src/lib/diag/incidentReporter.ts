import { apiClient } from "@/lib/apiClient";

const QUEUE_KEY = "optocare:incident-queue";
const MAX_QUEUE = 100;

type Incident = {
  fingerprint: string;
  clinic_id?: string | null;
  user_id?: string | null;
  page_name?: string | null;
  route?: string | null;
  error_name?: string | null;
  error_message?: string | null;
  stack?: string | null;
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  context?: Record<string, unknown>;
};

function readQueue(): Incident[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeQueue(items: Incident[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)));
  } catch {}
}

function fingerprint(input: Incident) {
  const raw = [
    input.source,
    input.page_name || "",
    input.route || "",
    input.error_name || "",
    input.error_message || "",
  ].join("|").toLowerCase().replace(/\s+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function getIdentity() {
  try {
    const { data } = await apiClient.auth.getUser();
    return {
      user_id: data.user?.id ?? null,
      clinic_id: null as string | null,
    };
  } catch {
    return { user_id: null, clinic_id: null };
  }
}

async function send(incident: Incident) {
  const identity = await getIdentity();
  const payload = {
    ...incident,
    user_id: incident.user_id ?? identity.user_id,
    clinic_id: incident.clinic_id ?? identity.clinic_id,
  };
  const { error } = await apiClient.from("system_incidents").upsert(
    {
      ...payload,
      occurrence_count: 1,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      context: payload.context ?? {},
    },
    { onConflict: "fingerprint" },
  );
  if (error) throw error;
}

export function getQueuedIncidentCount() { return readQueue().length; }

export async function flushIncidentQueue() {
  if (!navigator.onLine) return;
  const queue = readQueue();
  if (!queue.length) return;
  const remaining: Incident[] = [];
  for (const item of queue) {
    try {
      await send(item);
    } catch {
      remaining.push(item);
    }
  }
  writeQueue(remaining);
}

export async function reportIncident(input: Omit<Incident, "fingerprint"> & { fingerprint?: string }) {
  const incident: Incident = {
    ...input,
    fingerprint: input.fingerprint ?? fingerprint(input as Incident),
    route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : null),
  };
  try {
    if (!navigator.onLine) throw new Error("offline");
    await send(incident);
    void flushIncidentQueue();
  } catch {
    const queue = readQueue();
    const existing = queue.findIndex((x) => x.fingerprint === incident.fingerprint);
    if (existing >= 0) queue[existing] = incident;
    else queue.push(incident);
    writeQueue(queue);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushIncidentQueue());
  setTimeout(() => void flushIncidentQueue(), 1500);
}
