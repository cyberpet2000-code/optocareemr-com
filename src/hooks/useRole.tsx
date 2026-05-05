import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "super_admin" | "admin" | "doctor" | "nurse" | "receptionist";

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setRoles([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      // Combine user_roles table + profiles.role + profiles.is_super_admin (single source of truth)
      const [ur, pr] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("profiles").select("role, is_super_admin").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const set = new Set<AppRole>();
      (ur.data || []).forEach((r: any) => { if (r.role) set.add(r.role as AppRole); });
      const pRole = (pr.data as any)?.role as string | undefined;
      if (pRole && ["super_admin", "admin", "doctor", "nurse", "receptionist"].includes(pRole)) {
        set.add(pRole as AppRole);
      }
      if ((pr.data as any)?.is_super_admin) set.add("super_admin");
      setRoles(Array.from(set));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole("super_admin");
  const isAdmin = hasRole("admin") || isSuperAdmin;
  const isDoctor = hasRole("doctor");
  const isNurse = hasRole("nurse");
  const isReceptionist = hasRole("receptionist");
  const noRoles = roles.length === 0;
  const canAccessClinical = isAdmin || isDoctor || isNurse || noRoles;
  const canAccessBilling = isAdmin || isReceptionist || noRoles;
  const canAccessInventory = isAdmin || isReceptionist || noRoles;
  const canAccessAdmin = isAdmin;

  return {
    roles, loading, hasRole,
    isSuperAdmin, isAdmin, isDoctor, isNurse, isReceptionist,
    canAccessClinical, canAccessBilling, canAccessInventory, canAccessAdmin,
  };
}
