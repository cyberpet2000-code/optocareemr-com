import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("alerts")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50);
    setAlerts((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("alerts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const dismiss = async (id: string) => {
    await supabase.from("alerts").update({ status: "dismissed" } as any).eq("id", id);
  };

  return { alerts, loading, dismiss, reload: load };
}
