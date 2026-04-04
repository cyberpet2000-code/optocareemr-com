import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "doctor" | "receptionist";

export function useRole() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setRoles([]); setLoading(false); return; }

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRoles((data || []).map((r: any) => r.role as AppRole));
        setLoading(false);
      });
  }, [user]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("admin");
  const isDoctor = hasRole("doctor");
  const isReceptionist = hasRole("receptionist");
  // If no roles assigned, treat as receptionist-level
  const canAccessClinical = isAdmin || isDoctor || roles.length === 0;
  const canAccessInventory = isAdmin || isReceptionist || roles.length === 0;
  const canAccessAdmin = isAdmin;

  return { roles, loading, hasRole, isAdmin, isDoctor, isReceptionist, canAccessClinical, canAccessInventory, canAccessAdmin };
}
