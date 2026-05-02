import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "super_admin" | "admin" | "doctor" | "receptionist";

export function useRole() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRoles([]); setLoading(false); return; }
    let cancelled = false;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setRoles((data || []).map((r: any) => r.role as AppRole));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isSuperAdmin = hasRole("super_admin");
  const isAdmin = hasRole("admin") || isSuperAdmin;
  const isDoctor = hasRole("doctor");
  const isReceptionist = hasRole("receptionist");
  // Empty roles: treat as admin during initial setup so the app is usable
  const noRoles = roles.length === 0;
  const canAccessClinical = isAdmin || isDoctor || noRoles;
  const canAccessBilling = isAdmin || isReceptionist || noRoles;
  const canAccessInventory = isAdmin || isReceptionist || noRoles;
  const canAccessAdmin = isAdmin;

  return {
    roles, loading, hasRole,
    isSuperAdmin, isAdmin, isDoctor, isReceptionist,
    canAccessClinical, canAccessBilling, canAccessInventory, canAccessAdmin,
  };
}
