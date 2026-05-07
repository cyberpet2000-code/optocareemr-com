import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Plus, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useAccess";
import { toast } from "sonner";

export default function SuperAdminClinics() {
  const [clinics, setClinics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { switchClinic } = useAccess();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("clinics")
        .select("id, name, subscription_status, trial_end_date, setup_completed, is_active, created_at")
        .order("created_at", { ascending: false });
      setClinics(data || []);
      setLoading(false);
    })();
  }, []);

  const enter = async (c: any) => {
    await switchClinic(c.id);
    toast.success(`Entered ${c.name}`);
    navigate(c.setup_completed ? "/dashboard" : "/onboarding", { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">All Clinics</h1>
          <p className="text-sm text-muted-foreground">{clinics.length} total</p>
        </div>
        <Link to="/super-admin/create-clinic">
          <Button><Plus size={16} className="mr-1" /> New Clinic</Button>
        </Link>
      </div>
      <div className="form-section overflow-x-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : clinics.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No clinics yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Setup</th>
                <th className="py-2 pr-3">Trial Ends</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {clinics.map(c => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-medium flex items-center gap-2"><Building2 size={14} className="text-muted-foreground" /> {c.name}</td>
                  <td className="py-2.5 pr-3"><span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary capitalize">{c.subscription_status || "—"}</span></td>
                  <td className="py-2.5 pr-3 text-xs">{c.setup_completed ? "✓ Done" : "Pending"}</td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{c.trial_end_date ? new Date(c.trial_end_date).toLocaleDateString() : "—"}</td>
                  <td className="py-2.5 pr-3 text-xs">{c.is_active ? "Yes" : "No"}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => enter(c)}>
                      <LogIn size={14} className="mr-1" /> Enter
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
