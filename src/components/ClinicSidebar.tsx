import { Link, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, ShoppingBag, Pill, DollarSign, ShieldCheck, Calendar, History,
  UserPlus, ListOrdered, Building2, Activity, Sparkles, LifeBuoy, Settings, CheckCircle2,
  CircleDashed, Clock, Mail,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { useRole } from "@/hooks/useRole";
import { useClinic } from "@/hooks/useClinic";
import ClinicSwitcher from "@/components/ClinicSwitcher";

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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { isAdmin, isSuperAdmin, isDoctor, isReceptionist, roles } = useRole();
  const { clinic: clinicBase, profile, trialDaysLeft, trialExpired } = useClinic();
  const clinic = clinicBase as (typeof clinicBase & { logo_url?: string | null }) | null;
  const workspace = resolveWorkspace(location.pathname);

  let primary: { to: string; label: string; icon: any }[] = [];
  let secondary: { to: string; label: string; icon: any }[] = [];

  if (workspace === "super-admin") {
    primary = [
      { to: "/super-admin", label: "Overview", icon: LayoutDashboard },
      { to: "/super-admin/clinics", label: "Clinics", icon: Building2 },
      { to: "/super-admin/performance", label: "Performance", icon: Activity },
    ];
    secondary = [
      { to: "/super-admin/create-clinic", label: "Create Clinic", icon: Sparkles },
      { to: "/super-admin/users", label: "Users", icon: ShieldCheck },
      { to: "/super-admin/audit", label: "Switch Audit", icon: History },
    ];
  } else if (isDoctor && !isAdmin && !isSuperAdmin) {
    primary = [
      { to: "/queue", label: "Queue", icon: ListOrdered },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/appointments", label: "Visits", icon: Calendar },
    ];
  } else if (isReceptionist && !isAdmin && !isDoctor) {
    primary = [
      { to: "/register", label: "Register", icon: UserPlus },
      { to: "/queue", label: "Queue", icon: ListOrdered },
      { to: "/appointments", label: "Appointments", icon: Calendar },
      { to: "/billing", label: "Billing", icon: DollarSign },
    ];
  } else {
    primary = [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/queue", label: "Queue", icon: ListOrdered },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/billing", label: "Billing", icon: DollarSign },
      { to: "/inventory", label: "Optical", icon: ShoppingBag },
    ];
    secondary = [
      { to: "/register", label: "Add Patient", icon: UserPlus },
      { to: "/appointments", label: "Appointments", icon: Calendar },
      { to: "/pharmacy", label: "Pharmacy", icon: Pill },
      { to: "/hmos", label: "HMOs", icon: Building2 },
      { to: "/sales-history", label: "Sales History", icon: History },
      ...(isAdmin ? [{ to: "/admin/roles", label: "Manage Roles", icon: ShieldCheck }] : []),
      ...(isAdmin ? [{ to: "/communications", label: "Communications", icon: Mail }] : []),
    ];
  }

  const isActive = (path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const isSuperAdminWs = workspace === "super-admin";
  const clinicName = isSuperAdminWs ? "Platform Console" : (clinic?.name || "Select a clinic");
  const userRole = isSuperAdminWs ? "super_admin" : (roles.find(r => r !== "super_admin") || roles[0] || "admin");
  const initials = (clinicName || "?").split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();

  const setupComplete = !isSuperAdminWs && clinic?.setup_completed === true;
  const setupPending = !isSuperAdminWs && clinic?.setup_completed === false;

  const trialLabel = (() => {
    if (isSuperAdminWs || !clinic) return null;
    if (clinic.subscription_status === "active") return { text: "Subscription active", tone: "success" as const };
    if (trialExpired) return { text: "Trial expired", tone: "destructive" as const };
    if (Number.isFinite(trialDaysLeft)) return { text: `Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`, tone: "warning" as const };
    return null;
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
              <div className="font-bold text-sm text-foreground leading-tight truncate" title={clinicName}>
                {clinicName}
              </div>
              <div className="text-[10px] text-muted-foreground capitalize leading-tight mt-0.5">
                {ROLE_LABEL[userRole] || userRole}
              </div>
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
                      <NavLink to={item.to} className="flex items-center gap-2.5">
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
                        <NavLink to={item.to} className="flex items-center gap-2.5">
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
            {trialLabel && (
              <div className={`text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1.5 ${
                trialLabel.tone === "success" ? "bg-success/10 text-success" :
                trialLabel.tone === "warning" ? "bg-warning/10 text-warning" :
                "bg-destructive/10 text-destructive"
              }`}>
                <Clock size={12} /> {trialLabel.text}
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
