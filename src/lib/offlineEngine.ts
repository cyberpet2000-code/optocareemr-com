import { secureOfflineGet, secureOfflineSave, secureOfflineRemove } from "@/lib/secureOfflineStore";

export type OfflineOperationKind = "family.create" | "patient.create" | "visit.save" | "appointment.save" | "appointment.status" | "inventory.save" | "inventory.delete" | "inventory.sale" | "payment.create" | "billing.save";

export interface OfflineOperation {
  id: string;
  clinicId: string;
  userId: string | null;
  kind: OfflineOperationKind;
  entityId: string;
  payload: any;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

const DB_NAME = "optocare-offline";
const DB_VERSION = 1;
const STORE = "operations";

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("clinicId", "clinicId", { unique: false });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function enqueueOfflineOperation(
  operation: Omit<OfflineOperation, "id" | "createdAt" | "attempts" | "lastError">
): Promise<OfflineOperation> {
  const item: OfflineOperation = {
    ...operation,
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

  const db = await openDb();
  let storedInIndexedDb = false;
  if (db) {
    storedInIndexedDb = await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    db.close();
  }

  // Never report an offline write as successful if IndexedDB rejected it.
  // Fall back to the encrypted browser cache so the operation remains recoverable.
  if (!storedInIndexedDb) {
    const key = `operations:${operation.clinicId}`;
    const queue = await secureOfflineGet<OfflineOperation[]>(key) ?? [];
    await secureOfflineSave(key, [...queue, item]);
  }

  return item;
}

export async function getOfflineOperations(clinicId: string): Promise<OfflineOperation[]> {
  const db = await openDb();
  if (db) {
    const result = await new Promise<{ ok: boolean; rows: OfflineOperation[] }>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).index("clinicId").getAll(clinicId);
        request.onsuccess = () => resolve({ ok: true, rows: (request.result || []) as OfflineOperation[] });
        request.onerror = () => resolve({ ok: false, rows: [] });
        tx.onerror = () => resolve({ ok: false, rows: [] });
      } catch {
        resolve({ ok: false, rows: [] });
      }
    });
    db.close();

    if (result.ok) {
      return result.rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  }

  return (await secureOfflineGet<OfflineOperation[]>(`operations:${clinicId}`) ?? [])
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getOfflineSyncStatus(clinicId: string): Promise<{ pending: number; failed: number }> {
  const operations = await getOfflineOperations(clinicId);
  const legacyAppointments = await secureOfflineGet<any[]>(`appointments-queue:${clinicId}`) ?? [];
  const legacyBills = await secureOfflineGet<any[]>(`bills-queue:${clinicId}`) ?? [];
  const legacy = [...legacyAppointments, ...legacyBills];

  return {
    pending: operations.length + legacy.length,
    failed: operations.filter((operation) => operation.attempts > 0).length +
      legacy.filter((item: any) => Number(item?.attempts ?? 0) > 0).length,
  };
}

export async function removeOfflineOperation(clinicId: string, id: string) {
  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
    return;
  }

  const key = `operations:${clinicId}`;
  const queue = await secureOfflineGet<OfflineOperation[]>(key) ?? [];
  await secureOfflineSave(key, queue.filter((item) => item.id !== id));
}

export async function markOfflineOperationFailed(
  clinicId: string,
  operation: OfflineOperation,
  error: unknown,
) {
  const next: OfflineOperation = {
    ...operation,
    attempts: operation.attempts + 1,
    lastError: String((error as any)?.message ?? error ?? "Sync failed"),
  };

  const db = await openDb();
  if (db) {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(next);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
    return;
  }

  const key = `operations:${clinicId}`;
  const queue = await secureOfflineGet<OfflineOperation[]>(key) ?? [];
  await secureOfflineSave(key, queue.map((item) => item.id === operation.id ? next : item));
}

export async function cacheAppointmentsOffline(clinicId: string, appointments: any[]) {
  await secureOfflineSave("appointments:" + clinicId, appointments);
}

export async function cachePatientsOffline(clinicId: string, patients: any[]) {
  // Bulk-write the patient list once. Calling cachePatientOffline for every
  // row repeatedly serializes the growing list and can exhaust localStorage
  // on larger clinics.
  await secureOfflineSave(`patients:${clinicId}:all`, patients);
  await secureOfflineSave(`patients:${clinicId}`, patients);
}

export async function cachePatientOffline(clinicId: string, patient: any) {
  await secureOfflineSave(`patient-record:${clinicId}:${patient.id}`, patient);
  const key = `patients:${clinicId}:all`;
  const rows = await secureOfflineGet<any[]>(key) ?? [];
  const next = [patient, ...rows.filter((row) => row.id !== patient.id)];
  await secureOfflineSave(key, next);
  await secureOfflineSave(`patients:${clinicId}`, next);
}

export async function cacheVisitsOffline(clinicId: string, patientId: string, visits: any[]) {
  await secureOfflineSave(`patient-visits:${clinicId}:${patientId}`, visits);
}

export async function cacheVisitOffline(clinicId: string, patientId: string, visit: any) {
  const key = `patient-visits:${clinicId}:${patientId}`;
  const rows = await secureOfflineGet<any[]>(key) ?? [];
  await secureOfflineSave(key, [visit, ...rows.filter((row) => row.id !== visit.id)]);
}

export async function cacheStaffProfilesOffline(clinicId: string, profiles: any[]) {
  const normalized = profiles.map((profile: any) => ({
    id: profile.id,
    full_name: profile.full_name ?? null,
    role: profile.role ?? null,
    title: profile.title ?? null,
    is_active: profile.is_active ?? true,
  }));
  await secureOfflineSave(`staff-profiles:${clinicId}`, normalized);
}

export async function getStaffProfilesOffline(clinicId: string): Promise<any[]> {
  return await secureOfflineGet<any[]>(`staff-profiles:${clinicId}`) ?? [];
}
