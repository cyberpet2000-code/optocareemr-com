import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, ShoppingBag, Pill, DollarSign, LogOut, ListOrdered, Calendar, UserPlus,
  Bell, Search, Building2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { useClinic } from "@/hooks/useClinic";
import TrialBanner from "@/components/TrialBanner";
import ClinicSidebar, { resolveWorkspace } from "@/components/ClinicSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

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

export default function AppLayout({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isAdmin, isSuperAdmin, isDoctor, isReceptionist, roles } = useRole();
  const { profile, clinic } = useClinic();

  const workspace = resolveWorkspace(location.pathname);
  const isSuperAdminWs = workspace === "super-admin";

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const userRole = isSuperAdminWs ? "super_admin" : (roles.find(r => r !== "super_admin") || roles[0] || "admin");
  const userName = profile?.full_name || "User";
  const userInitials = userName.split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();

  // Mobile bottom nav (kept for handheld continuity)
  let mobilePrimary: { to: string; label: string; icon: any }[] = [];
  if (isSuperAdminWs) {
    mobilePrimary = [
      { to: "/super-admin", label: "Overview", icon: LayoutDashboard },
      { to: "/super-admin/clinics", label: "Clinics", icon: Building2 },
      { to: "/super-admin/users", label: "Users", icon: Users },
    ];
  } else if (isDoctor && !isAdmin && !isSuperAdmin) {
    mobilePrimary = [
      { to: "/queue", label: "Queue", icon: ListOrdered },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/appointments", label: "Visits", icon: Calendar },
    ];
  } else if (isReceptionist && !isAdmin && !isDoctor) {
    mobilePrimary = [
      { to: "/register", label: "Register", icon: UserPlus },
      { to: "/queue", label: "Queue", icon: ListOrdered },
      { to: "/appointments", label: "Appts", icon: Calendar },
      { to: "/billing", label: "Billing", icon: DollarSign },
    ];
  } else {
    mobilePrimary = [
      { to: "/dashboard", label: "Home", icon: LayoutDashboard },
      { to: "/queue", label: "Queue", icon: ListOrdered },
      { to: "/patients", label: "Patients", icon: Users },
      { to: "/billing", label: "Billing", icon: DollarSign },
      { to: "/inventory", label: "Optical", icon: ShoppingBag },
    ];
  }

  const isActive = (path: string) => path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  // Header clinic identity
  const headerClinicName = isSuperAdminWs ? "Platform Console" : (clinic?.name || "No clinic selected");
  const showActiveBadge = !isSuperAdminWs && !!clinic;

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <ClinicSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top header — clinic name dominant, OptoCare brand subtle */}
          <header className="sticky top-0 z-40 bg-card/85 backdrop-blur-xl border-b border-border/60">
            <div className="flex items-center gap-2 lg:gap-4 px-3 lg:px-6 h-14 lg:h-16">
              <SidebarTrigger className="shrink-0" />

              {/* Active clinic identity */}
              <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
                <div className="min-w-0">
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
                    OptoCare EMR
                  </div>
                </div>
              </div>

              {/* Center search (desktop only) */}
              <div className="hidden xl:flex items-center gap-2 px-3 h-9 rounded-lg bg-muted/60 border border-border/60 w-72">
                <Search size={14} className="text-muted-foreground" />
                <input
                  className="bg-transparent outline-none text-sm flex-1 placeholder:text-muted-foreground"
                  placeholder="Search patients, visits, invoices…"
                />
              </div>

              {/* Right cluster */}
              <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                <button className="hidden lg:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground" aria-label="Notifications">
                  <Bell size={16} />
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
                  aria-label="Logout">
                  <LogOut size={16} />
                </button>
              </div>
            </div>

            {/* Persistent context strip */}
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

          {/* Main content */}
          <main className="flex-1 px-3 lg:px-6 py-4 lg:py-6 pb-24 lg:pb-6 animate-page">
            <div className="max-w-7xl mx-auto">
              <TrialBanner />
              {children ?? <Outlet />}
            </div>
          </main>

          {/* Footer brand line (desktop) */}
          <footer className="hidden lg:block border-t border-border/40 px-6 py-2 text-[10px] text-muted-foreground/70 text-center">
            Powered by <span className="font-medium">OptoCare EMR</span>
          </footer>

          {/* Mobile bottom nav */}
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

// Re-export so existing imports keep working
export { resolveWorkspace } from "@/components/ClinicSidebar";
export type { Workspace } from "@/components/ClinicSidebar";
