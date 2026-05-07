import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type ClinicRow = { id: string; name: string; setup_completed: boolean | null };

export default function ClinicSwitcher() {
  const { role, activeClinicId, switchClinic } = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (role !== "super_admin") return;
    supabase.from("clinics")
      .select("id, name, setup_completed")
      .order("name", { ascending: true })
      .then(({ data }) => setClinics((data as any) || []));
  }, [role]);

  if (role !== "super_admin") return null;
  // Only show switcher in super-admin workspace to enforce isolation
  if (!location.pathname.startsWith("/super-admin")) return null;

  const onChange = async (clinicId: string) => {
    if (clinicId === activeClinicId || switching) return;
    setSwitching(true);
    const target = clinics.find(c => c.id === clinicId);
    try {
      const granted = await switchClinic(clinicId);
      if (granted) toast.success(`Access granted — switched to ${target?.name || "clinic"}`);
      else toast.warning(`Switched to ${target?.name || "clinic"} (access flagged)`);
      navigate(target?.setup_completed ? "/dashboard" : "/onboarding", { replace: true });
    } catch (e: any) {
      toast.error(`Access denied: ${e?.message || "unknown error"}`);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {switching && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      <Select value={activeClinicId || ""} onValueChange={onChange} disabled={switching}>
        <SelectTrigger className="h-8 text-xs w-[160px] rounded-lg">
          <SelectValue placeholder="Select clinic" />
        </SelectTrigger>
        <SelectContent>
          {clinics.map(c => (
            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
