import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, ShoppingBag, DollarSign, ShieldCheck, Calendar,
  UserPlus, Building2, Sparkles, LifeBuoy, CheckCircle2, CircleDashed, Clock,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useRole } from "@/hooks/useRole";
import { useClinic } from "@/hooks/useClinic";
import ClinicSwitcher from "@/components/ClinicSwitcher";
import { readIdentity } from "@/lib/clinic-identity";

export type Workspace = "super-admin" | "clinic";

export function resolveWorkspace(pathname: string): Workspace {
  return pathname.startsWith("/super-admin") ? "super-admin" : "clinic";
}

const ROLE_LABEL: Record<string, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  admin: "Administrator",
  receptionist: "Receptionist",
  super_admin: "Super Admin",
};

export default function ClinicSidebar() {
  const location = useLocation();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isSuperAdmin, isDoctor, isReceptionist, roles } = useRole();
  const { clinic: clinicBase, profile, loading: clinicLoading } = useClinic();
  const clinic = clinicBase as (typeof clinicBase & { logo_url?: string | null }) | null;
  const workspace = resolveWorkspace(location.pathname);
  const [cachedIdentity] = useState(readIdentity);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    if (isMobile) setOpenMobile(false);
  }, [location.pathname, isMobile, setOpenMobile]);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  const { primary, secondary } = useMemo(() => {
    if (workspace === "super-admin") {
      return {
        primary: [
          { to: "/super-admin", label: "Overview", icon: LayoutDashboard },
          { to: "/super-admin/clinics", label: "Clinics", icon: Building2 },
        ],
        secondary: [
          { to: "/super-admin/create-clinic", label: "Create Clinic", icon: Sparkles },
          { to: "/super-admin/users", label: "Users", icon: ShieldCheck },
        ],
      };
    }

    if (isDoctor && !isAdmin && !isSuperAdmin) {
      return {
        primary: [
          { to: "/patients", label: "Patients", icon: Users },
          { to: "/appointments", label: "Visits", icon: Calendar },
        ],
        secondary: [],
      };
    }

    if (isReceptionist && !isAdmin && !isDoctor) {
      return {
        primary: [
          { to: "/register", label: "Register", icon: UserPlus },
          { to: "/appointments", label: "Appointments", icon: Calendar },
          { to: "/billing", label: "Billing", icon: DollarSign },
        ],
        secondary: [],
      };
    }

    return {
      primary: [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/patients", label: "Patients", icon: Users },
        { to: "/billing", label: "Billing", icon: DollarSign },
        { to: "/inventory", label: "Optical", icon: ShoppingBag },
      ],
      secondary: [
        { to: "/register", label: "Add Patient", icon: UserPlus },
        { to: "/appointments", label: "Appointments", icon: Calendar },
        { to: "/hmos", label: "HMOs", icon: Building2 },
        ...(isAdmin ? [{ to: "/admin/roles", label: "Manage Roles", icon: ShieldCheck }] : []),
      ],
    };
  }, [isAdmin, isDoctor, isReceptionist, isSuperAdmin, workspace]);

  const isActive = (path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const isSuperAdminWs = workspace === "super-admin";
  const resolvedName = clinic?.name?.trim() || null;
  const clinicName = isSuperAdminWs
    ? "Platform Console"
    : (resolvedName || cachedIdentity.name || "OptoCare Clinic");
  const userRole = isSuperAdminWs ? "super_admin" : (roles.find(r => r !== "super_admin") || roles[0] || "admin");
  const initials = (clinicName || "?").split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();
  const identityLoading = !isSuperAdminWs && clinicLoading && !resolvedName && !cachedIdentity.name;

  const setupComplete = !isSuperAdminWs && clinic?.setup_completed === true;
  const setupPending = !isSuperAdminWs && clinic?.setup_completed === false;

  const lifecycleLabel = (() => {
    if (isSuperAdminWs || !clinic) return null;
    if ((clinic as any).lifecycle_status === "suspended" || clinic.is_active === false) {
      return { text: "Clinic suspended", tone: "destructive" as const };
    }
    return { text: "Active", tone: "success" as const };
  })();

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      {/* Clinic identity block */}
      <SidebarHeader className="border-b border-border/60 p-3">
        <Link to={isSuperAdminWs ? "/super-admin" : "/dashboard"} className="flex items-center gap-2.5 group">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-sm"
            style={clinic?.logo_url && !isSuperAdminWs ? undefined : { background: "hsl(var(--primary))" }}
          >
            {clinic?.logo_url && !isSuperAdminWs ? (
              <img src={clinic.logo_url} alt={clinicName} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <span>{initials || (isSuperAdminWs ? "OC" : "C")}</span>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              {identityLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              ) : (
                <>
                  <div className="font-bold text-sm text-foreground leading-tight truncate" title={clinicName}>
                    {clinicName}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize leading-tight mt-0.5">
                    {ROLE_LABEL[userRole] || userRole}
                  </div>
                </>
              )}
            </div>
          )}
        </Link>

        {!collapsed && !isSuperAdminWs && (
          <div className="mt-3">
            <ClinicSwitcher variant="sidebar" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Workspace</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.map(item => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                      <NavLink to={item.to} onClick={handleNavClick} className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="text-sm">{item.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {secondary.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>More</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {secondary.map(item => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                        <NavLink to={item.to} onClick={handleNavClick} className="flex items-center gap-2.5">
                          <Icon className="h-4 w-4 shrink-0" />
                          {!collapsed && <span className="text-sm">{item.label}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Status / footer */}
      <SidebarFooter className="border-t border-border/60 p-3 space-y-2">
        {!collapsed && !isSuperAdminWs && clinic && (
          <>
            <div className="flex items-center gap-2 text-[11px] px-1">
              {setupComplete ? (
                <><CheckCircle2 size={13} className="text-success" /><span className="text-muted-foreground">Setup complete</span></>
              ) : setupPending ? (
                <><CircleDashed size={13} className="text-warning" /><span className="text-muted-foreground">Setup pending</span></>
              ) : (
                <><Clock size={13} className="text-muted-foreground" /><span className="text-muted-foreground">Setup status unknown</span></>
              )}
            </div>
            {lifecycleLabel && (
              <div className={`text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 ${
                lifecycleLabel.tone === "success" ? "bg-success/10 text-success" :
                "bg-destructive/10 text-destructive"
              }`}>
                <Clock size={12} /> {lifecycleLabel.text}
              </div>
            )}
          </>
        )}
        {!collapsed && (
          <>
            <button
              type="button"
              className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full px-1"
              onClick={() => window.open("mailto:support@optocareemr.com", "_blank")}
            >
              <LifeBuoy size={12} /> Support
            </button>
            <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/40 px-1">
              Powered by <span className="font-medium">OptoCare EMR</span>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
