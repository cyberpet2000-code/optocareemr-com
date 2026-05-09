import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/useAccess";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Building2 } from "lucide-react";

type ClinicRow = { id: string; name: string; setup_completed: boolean | null; role?: string };

interface ClinicSwitcherProps {
  variant?: "header" | "sidebar";
  className?: string;
}

export default function ClinicSwitcher({ variant = "header", className = "" }: ClinicSwitcherProps) {
  const { role, activeClinicId, switchClinic, memberships } = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [allClinics, setAllClinics] = useState<ClinicRow[]>([]);
  const [switching, setSwitching] = useState(false);

  // Super admin sees ALL clinics (so they can be added/granted access). Others only see memberships.
  useEffect(() => {
    if (role !== "super_admin") return;
    supabase.from("clinics")
      .select("id, name, setup_completed")
      .order("name", { ascending: true })
      .then(({ data }) => setAllClinics((data as any) || []));
  }, [role]);

  const clinics = useMemo<ClinicRow[]>(() => {
    if (role === "super_admin" && location.pathname.startsWith("/super-admin")) {
      return allClinics;
    }
    // For regular users (and super-admin in clinic workspace), show only the clinics they're a member of
    return (memberships || []).map((m: any) => ({
      id: m.clinic_id,
      name: m.clinic_name || "Unnamed clinic",
      setup_completed: m.setup_completed,
      role: m.role,
    }));
  }, [role, location.pathname, allClinics, memberships]);

  // Hide if there's nothing to switch between
  if (clinics.length === 0) return null;
  if (clinics.length === 1 && variant === "header" && !location.pathname.startsWith("/super-admin")) return null;

  const onChange = async (clinicId: string) => {
    if (clinicId === activeClinicId || switching) return;
    setSwitching(true);
    const target = clinics.find(c => c.id === clinicId);
    try {
      const granted = await switchClinic(clinicId);
      if (granted) toast.success(`Switched to ${target?.name || "clinic"}`);
      else toast.warning(`Switched to ${target?.name || "clinic"} (access flagged)`);
      navigate(target?.setup_completed ? "/dashboard" : "/onboarding", { replace: true });
    } catch (e: any) {
      toast.error(`Access denied: ${e?.message || "unknown error"}`);
    } finally {
      setSwitching(false);
    }
  };

  if (variant === "sidebar") {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Building2 size={11} /> Switch clinic
          {switching && <Loader2 size={11} className="animate-spin" />}
        </div>
        <Select value={activeClinicId || ""} onValueChange={onChange} disabled={switching}>
          <SelectTrigger className="h-9 text-sm w-full rounded-lg bg-background">
            <SelectValue placeholder="Select clinic" />
          </SelectTrigger>
          <SelectContent>
            {clinics.map(c => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                <div className="flex flex-col items-start leading-tight">
                  <span className="font-medium">{c.name}</span>
                  {c.role && <span className="text-[10px] text-muted-foreground capitalize">{c.role.replace("_", " ")}</span>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {switching && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      <Select value={activeClinicId || ""} onValueChange={onChange} disabled={switching}>
        <SelectTrigger className="h-8 text-xs w-[170px] rounded-lg">
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
