import { useAccess } from "./useAccess";

export type AppRole = "super_admin" | "admin" | "doctor" | "nurse" | "receptionist";

export function useRole() {
  const { role, roles, roleLoading, isAuthReady } = useAccess();
  const typedRoles = roles as AppRole[];

  const hasRole = (nextRole: AppRole) => typedRoles.includes(nextRole);
  const isSuperAdmin = hasRole("super_admin");
  const isAdmin = hasRole("admin") || isSuperAdmin;
  const isDoctor = hasRole("doctor");
  const isNurse = hasRole("nurse");
  const isReceptionist = hasRole("receptionist");
  const noRoles = typedRoles.length === 0;
  const canAccessClinical = isAdmin || isDoctor || isNurse || noRoles;
  const canAccessBilling = isAdmin || isReceptionist || noRoles;
  const canAccessInventory = isAdmin || isReceptionist || noRoles;
  const canAccessAdmin = isAdmin;

  return {
    role: role as AppRole | null,
    roles: typedRoles,
    loading: !isAuthReady || roleLoading,
    hasRole,
    isSuperAdmin, isAdmin, isDoctor, isNurse, isReceptionist,
    canAccessClinical, canAccessBilling, canAccessInventory, canAccessAdmin,
  };
}
