import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard, Users, ShoppingBag, LogOut, Calendar, UserPlus,
  Bell, Search, Building2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useClinic } from "@/hooks/useClinic";
import { useAccessClinic } from "@/hooks/useAccess";

import ClinicSidebar, { resolveWorkspace } from "@/components/ClinicSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { diag } from "@/lib/diag";
import { useOffline } from "@/hooks/useOffline";
import { registerAutomaticSync, runOfflineSync } from "@/lib/offlineSync";
import { getOfflineSyncStatus } from "@/lib/offlineEngine";
import ThemeToggle from "@/components/ThemeToggle";
import { apiClient } from "@/lib/apiClient";
import { showNotification } from "@/lib/notifications";

const ROLE_LABEL: Record<string, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  admin: "Admin",
  receptionist: "Receptionist",
  super_admin: "Super Admin",
};

const ROLE_TONE: Record<string, string> = {
  doctor: "bg-accent/10 text-accent",
  nurse: "bg-success/10 text-success",
  admin: "bg-primary/10 text-primary",
  receptionist: "bg-warning/10 text-warning",
  super_admin: "bg-destructive/10 text-destructive",
};

const NairaIcon = ({ size = 18 }: { size?: number }) => <span style={{ fontSize: size, lineHeight: 1, fontWeight: 700 }}>₦</span>;

export default function AppLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { isOffline } = useOffline();
  const { isAdmin, isSuperAdmin, isDoctor, isReceptionist, roles } = useRole();
  const {
  profile,
  clinic,
  loading,
  activeClinicId,
  effectiveClinicId,
} = useClinic();
  const { memberships } = useAccessClinic();

  const workspace = resolveWorkspace(location.pathname);
  const isSuperAdminWs = workspace === "super-admin";

  const [offlineSyncPending, setOfflineSyncPending] = useState(0);
  const [offlineSyncFailed, setOfflineSyncFailed] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [notificationUnread, setNotificationUnread] = useState(0);

  const refreshOfflineSyncStatus = useCallback(async () => {
    if (!effectiveClinicId || isSuperAdminWs) return;
    const status = await getOfflineSyncStatus(effectiveClinicId);
    setOfflineSyncPending(status.pending);
    setOfflineSyncFailed(status.failed);
  }, [effectiveClinicId, isSuperAdminWs]);

  useEffect(() => {
    void refreshOfflineSyncStatus();
    const onSyncDone = () => { void refreshOfflineSyncStatus(); };
    window.addEventListener("optocare:sync:done", onSyncDone);
    const timer = window.setInterval(() => { void refreshOfflineSyncStatus(); }, 5000);
    return () => {
      window.removeEventListener("optocare:sync:done", onSyncDone);
      window.clearInterval(timer);
    };
  }, [refreshOfflineSyncStatus]);

  const handleOfflineSyncNow = useCallback(async () => {
    if (!effectiveClinicId || isOffline || syncingOffline) return;
    setSyncingOffline(true);
    try {
      await runOfflineSync(effectiveClinicId);
    } finally {
      setSyncingOffline(false);
      await refreshOfflineSyncStatus();
    }
  }, [effectiveClinicId, isOffline, syncingOffline, refreshOfflineSyncStatus]);

  useEffect(() => {
    if (!effectiveClinicId || isSuperAdminWs) return;
    const sync = registerAutomaticSync(effectiveClinicId, { debounceMs: 1200, autoTriggerIfOnline: true });
    return sync.unregister;
  }, [effectiveClinicId, isSuperAdminWs]);

  useEffect(() => {
    const onNotificationRead = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count || 0);
      if (count > 0) setNotificationUnread(value => Math.max(0, value - count));
    };
    const onNotificationReadAll = () => setNotificationUnread(0);
    window.addEventListener("optocare:notifications:read", onNotificationRead);
    window.addEventListener("optocare:notifications:read-all", onNotificationReadAll);

    return () => {
      window.removeEventListener("optocare:notifications:read", onNotificationRead);
      window.removeEventListener("optocare:notifications:read-all", onNotificationReadAll);
    };
  }, []);

  useEffect(() => {
    if (!effectiveClinicId || isSuperAdminWs || !user?.id || isOffline) return;
    let cancelled = false;
    const refreshRecallNotifications = async () => {
      const { error } = await apiClient.rpc("refresh_patient_recall_notifications", { p_clinic_id: effectiveClinicId });
      if (error && !cancelled) console.warn("Recall notification refresh failed:", error.message);
    };
    void refreshRecallNotifications();
    const timer = window.setInterval(() => { void refreshRecallNotifications(); }, 15 * 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [effectiveClinicId, isSuperAdminWs, user?.id, isOffline]);

  useEffect(() => {
    if (!effectiveClinicId || isSuperAdminWs || !user?.id) {
      setNotificationUnread(0);
      return;
    }
    let cancelled = false;
    const loadUnread = async () => {
      const { count } = await apiClient
        .from("staff_notifications")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", effectiveClinicId)
        .eq("recipient_user_id", user.id)
        .is("read_at", null);
      if (!cancelled) setNotificationUnread(count || 0);
    };
    void loadUnread();
    const channel = apiClient
      .channel(`header-notifications-${effectiveClinicId}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_notifications", filter: `clinic_id=eq.${effectiveClinicId}` },
        (payload: any) => {
          const row = payload.new;
          if (row?.recipient_user_id !== user.id) return;
          setNotificationUnread(value => value + 1);
          if (row?.title && row?.body) {
            void showNotification(row.title, row.body);
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      apiClient.removeChannel(channel);
    };
  }, [effectiveClinicId, isSuperAdminWs, user?.id]);

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate("/login");
  }, [navigate, signOut]);

  const userRole = isSuperAdminWs ? "super_admin" : (roles.find(r => r !== "super_admin") || roles[0] || "admin");
  const userName = profile?.full_name || "User";
  const userInitials = userName.split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();

  const mobilePrimary = useMemo(() => {
    if (isSuperAdminWs) {
      return [
        { to: "/super-admin", label: "Overview", icon: LayoutDashboard },
        { to: "/super-admin/clinics", label: "Clinics", icon: Building2 },
        { to: "/super-admin/users", label: "Users", icon: Users },
      ];
    }
    if (isDoctor && !isAdmin && !isSuperAdmin) {
      return [
        { to: "/patients", label: "Patients", icon: Users },
        { to: "/appointments", label: "Visits", icon: Calendar },
      ];
    }
    if (isReceptionist && !isAdmin && !isDoctor) {
      return [
        { to: "/dashboard", label: "Home", icon: LayoutDashboard },
        { to: "/patients", label: "Patients", icon: Users },
        { to: "/register", label: "Register", icon: UserPlus },
        { to: "/appointments", label: "Appts", icon: Calendar },
        { to: "/billing", label: "Billing", icon: NairaIcon },
      ];
    }
    return [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/appointments", label: "Visits", icon: Calendar },
      { to: "/billing", label: "Billing", icon: NairaIcon },
      { to: "/inventory", label: "Optical", icon: ShoppingBag },
    ];
  }, [isAdmin, isDoctor, isReceptionist, isSuperAdmin, isSuperAdminWs]);

  const isActive = useCallback((path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path), [location.pathname]);

  const resolvedClinicName = clinic?.name?.trim() || null;
  const resolvedRoleLabel = roles.length > 0 ? (ROLE_LABEL[userRole] || null) : null;

  const headerClinicName = isSuperAdminWs
    ? "Platform Console"
    : (resolvedClinicName || "Loading clinic...");
  const headerRoleLabel = resolvedRoleLabel || "Staff";
  const showActiveBadge = !isSuperAdminWs && !!clinic;
  const identityLoading =
  !isSuperAdminWs &&
  (loading || (!!effectiveClinicId && !clinic));

    useEffect(() => {
  if (isSuperAdminWs || loading) return;

  const normalizedId = (typeof activeClinicId === "string" ? activeClinicId.trim() : "") || null;
  const membershipIds = Array.isArray(memberships)
    ? memberships.map((m: any) => m?.clinic_id).filter(Boolean)
    : [];

  if (resolvedClinicName) {
    diag.event("hydration", "clinic-resolved", {
      clinicName: resolvedClinicName,
    });
    return;
  }

  // Suppress false positives:
  //  - "all" sentinel is not a real clinic id
  //  - memberships not loaded yet (can't tell if id is valid)
  //  - id is a known membership but clinic record still in-flight
  if (
    normalizedId &&
    normalizedId !== "all" &&
    membershipIds.length > 0 &&
    !membershipIds.includes(normalizedId)
  ) {
    diag.warn("hydration", "clinic-name-empty", {
      profileId: (profile as any)?.id ?? null,
      activeClinicId: normalizedId,
      effectiveClinicId: effectiveClinicId ?? null,
      clinicIds: membershipIds,
    });
  }
}, [
  isSuperAdminWs,
  loading,
  resolvedClinicName,
  profile,
  activeClinicId,
  effectiveClinicId,
  memberships,
]);


  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <ClinicSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {(isOffline || offlineSyncPending > 0) && !isSuperAdminWs && (
            <div className={isOffline ? "bg-destructive text-destructive-foreground text-xs font-medium px-3 lg:px-6 py-1.5" : "bg-warning/10 text-warning text-xs font-medium px-3 lg:px-6 py-1.5"}>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span>
                  {isOffline
                    ? "Offline mode — changes are saved on this device and will sync automatically when internet returns."
                    : offlineSyncFailed > 0
                      ? "Sync attention: " + offlineSyncFailed + " change(s) need retry."
                      : offlineSyncPending + " offline change(s) waiting to sync."}
                </span>
                {!isOffline && (
                  <button
                    type="button"
                    onClick={handleOfflineSyncNow}
                    disabled={syncingOffline}
                    className="underline font-semibold disabled:opacity-60"
                  >
                    {syncingOffline ? "Syncing…" : "Sync now"}
                  </button>
                )}
              </div>
            </div>
          )}
          <header className="sticky top-0 z-40 bg-card/85 backdrop-blur-xl border-b border-border/60">
            <div className="flex items-center gap-2 lg:gap-4 px-3 lg:px-6 h-14 lg:h-16">
              <SidebarTrigger className="shrink-0" />

              <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
                <div className="min-w-0">
                  {identityLoading ? (
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="hidden sm:block h-2.5 w-20" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <h1 className="text-base lg:text-xl font-bold text-foreground truncate leading-tight" title={headerClinicName}>
                          {headerClinicName}
                        </h1>
                        {showActiveBadge && (
                          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-success/10 text-success shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                            Active
                          </span>
                        )}
                      </div>
                      <div className="hidden sm:block text-[10px] text-muted-foreground/70 leading-tight">
                        {isSuperAdminWs ? "OptoCare EMR" : `OptoCare EMR · ${headerRoleLabel}`}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="hidden xl:flex items-center gap-2 px-3 h-9 rounded-lg bg-muted/60 border border-border/60 w-72">
                <Search size={14} className="text-muted-foreground" />
                <input
                  className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
                  placeholder="Search patients, visits, invoices…"
                />
              </div>

              {isReceptionist && !isSuperAdminWs && location.pathname !== "/dashboard" && (
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary px-2.5 h-9 text-xs font-medium hover:bg-primary/10 transition-colors shrink-0"
                  title="Back to Dashboard"
                  aria-label="Back to Dashboard"
                >
                  <LayoutDashboard size={14} />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
              )}

              {isSuperAdmin && location.pathname !== "/super-admin" && (
                <button
                  type="button"
                  onClick={() => navigate("/super-admin")}
                  className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary px-2.5 h-9 text-xs font-medium hover:bg-primary/10 transition-colors shrink-0"
                  title="Return to Super Admin dashboard"
                  aria-label="Return to Super Admin dashboard"
                >
                  <LayoutDashboard size={14} />
                  <span className="hidden sm:inline">Super Admin</span>
                </button>
              )}

              <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                <ThemeToggle />
                <button
                  type="button"
                  onClick={() => navigate("/notifications")}
                  className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  aria-label="Notifications"
                  title="Notifications"
                >
                  <Bell size={16} />
                  {notificationUnread > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                      {notificationUnread > 9 ? "9+" : notificationUnread}
                    </span>
                  )}
                </button>
                <span className={`hidden sm:inline-flex text-[10px] lg:text-xs px-2 py-1 rounded-md font-medium capitalize ${ROLE_TONE[userRole] || "bg-muted text-foreground"}`}>
                  {ROLE_LABEL[userRole] || userRole}
                </span>
                <div className="hidden md:flex items-center gap-2 pl-2 lg:pl-3 border-l border-border/60">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                    {userInitials || "U"}
                  </div>
                  <div className="hidden lg:block leading-tight">
                    <div className="text-xs font-medium text-foreground">{userName}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{ROLE_LABEL[userRole]}</div>
                  </div>
                </div>
                <button onClick={handleLogout}
                  className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Logout" title="Sign out">
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {!isSuperAdminWs && clinic && (
              <div className="px-3 lg:px-6 py-1 border-t border-border/40 bg-success/5">
                <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] font-medium text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  ACTIVE CLINIC: <span className="uppercase tracking-wide">{clinic.name}</span>
                </div>
              </div>
            )}
            {isSuperAdminWs && (
              <div className="px-3 lg:px-6 py-1 border-t border-border/40 bg-destructive/5">
                <div className="flex items-center gap-1.5 text-[10px] lg:text-[11px] font-medium text-destructive">
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  PLATFORM CONSOLE — super admin scope
                </div>
              </div>
            )}
          </header>

          <main className="flex-1 px-3 lg:px-6 py-4 lg:py-6 pb-24 lg:pb-6 animate-page">
            <div className="max-w-7xl mx-auto">
              {children ?? <Outlet />}
            </div>
          </main>

          <footer className="hidden lg:block border-t border-border/40 px-6 py-2 text-[10px] text-muted-foreground/70 text-center">
            <span className="text-[8px]">Powered by OptoCare EMR</span>
          </footer>

          <nav className="bottom-nav lg:hidden">
            <div className="flex items-center justify-around px-2 pb-safe pt-1">
              {mobilePrimary.slice(0, 5).map(item => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link key={item.to} to={item.to} className={`bottom-nav-item ${active ? "active" : ""}`}>
                    <Icon className="bottom-nav-icon" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </SidebarProvider>
  );
}

export { resolveWorkspace } from "@/components/ClinicSidebar";
export type { Workspace } from "@/components/ClinicSidebar";
