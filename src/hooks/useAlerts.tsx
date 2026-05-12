import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAccess } from "@/hooks/useAccess";

export interface Alert {
  id: string;
  alert_type: string | null;
  severity: string;
  message: string | null;
  created_at: string;
  status: string;
  patient_id: string | null;
}

export function useAlerts() {
  const { effectiveClinicId: cid } = useAccess();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!cid) { setAlerts([]); setLoading(false); return; }
    const { data } = await supabase
      .from("alerts")
      .select("*")
      .eq("clinic_id", cid)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);
    console.debug("[alerts]", { clinic_id: cid, count: data?.length ?? 0 });
    setAlerts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!cid) return;
    const ch = supabase
      .channel(`alerts-realtime-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts", filter: `clinic_id=eq.${cid}` }, () => load())
      .subscribe();
    return () => { apiClient.removeChannel(ch); };
  }, [cid]);

  const dismiss = async (id: string) => {
    await apiClient.from("alerts").update({ status: "dismissed" } as any).eq("id", id);
  };

  return { alerts, loading, dismiss, reload: load };
}
