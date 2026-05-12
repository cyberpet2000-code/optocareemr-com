import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { AlertCircle } from "lucide-react";

export default function TrialBanner() {
  const [info, setInfo] = useState<{ daysLeft: number; expired: boolean; status: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await apiClient.auth.getUser();
      if (!user) return;
      const { data: prof } = await apiClient.from("profiles").select("clinic_id").eq("id", user.id).maybeSingle();
      if (!prof?.clinic_id) return;
      const { data: clinic } = await apiClient.from("clinics")
        .select("subscription_status, trial_start_date, trial_end_date")
        .eq("id", prof.clinic_id).maybeSingle();
      if (!clinic) return;
      const status = clinic.subscription_status || "trial";
      if (status !== "trial") { setInfo({ daysLeft: 0, expired: false, status }); return; }
      const end = clinic.trial_end_date
        ? new Date(clinic.trial_end_date)
        : new Date(new Date(clinic.trial_start_date || Date.now()).getTime() + 14 * 86400000);
      const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
      setInfo({ daysLeft, expired: daysLeft <= 0, status });
    })();
  }, []);

  if (!info || info.status !== "trial") return null;

  return (
    <div className={`mb-4 rounded-2xl border p-3 flex items-center gap-3 ${
      info.expired ? "bg-destructive/5 border-destructive/30 text-destructive"
      : info.daysLeft <= 3 ? "bg-warning/5 border-warning/30 text-warning"
      : "bg-primary/5 border-primary/30 text-primary"
    }`}>
      <AlertCircle size={18} className="shrink-0" />
      <div className="flex-1 text-sm">
        {info.expired ? (
          <span className="font-semibold">Trial expired — please upgrade to continue.</span>
        ) : (
          <span><strong>{info.daysLeft} day{info.daysLeft === 1 ? "" : "s"}</strong> left in your free trial.</span>
        )}
      </div>
    </div>
  );
}
