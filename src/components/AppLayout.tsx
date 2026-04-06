import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, ShoppingBag, Pill, DollarSign, LogOut, Menu, X, ShieldCheck, Calendar, History, UserPlus, Settings } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/inventory", label: "Optical", icon: ShoppingBag },
  { to: "/pharmacy", label: "Pharmacy", icon: Pill },
  { to: "/billing", label: "Billing", icon: DollarSign },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const { isAdmin, roles } = useRole();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const moreItems = [
    { to: "/register", label: "Add Patient", icon: UserPlus },
    { to: "/appointments", label: "Appointments", icon: Calendar },
    { to: "/sales-history", label: "Sales History", icon: History },
    ...(isAdmin ? [{ to: "/admin/roles", label: "Manage Roles", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      {/* Desktop top bar */}
      <header className="hidden lg:block sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between px-6 h-16 max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-black">O</span>
            </div>
            <span>Optocare</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link key={item.to} to={item.to}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}>
                  <Icon size={16} /> {item.label}
                </Link>
              );
            })}
            {moreItems.map(item => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link key={item.to} to={item.to}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}>
                  <Icon size={16} /> {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {roles.length > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg capitalize font-medium">
                {roles[0]}
              </span>
            )}
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/" className="flex items-center gap-2 font-bold text-base tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-black">O</span>
            </div>
            <span>Optocare</span>
          </Link>
          <div className="flex items-center gap-2">
            {roles.length > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md capitalize font-medium">
                {roles[0]}
              </span>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="border-t border-border/60 px-4 pb-3 pt-2 space-y-1 animate-fade-in bg-card">
            {moreItems.map(item => {
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                  <Icon size={16} /> {item.label}
                </Link>
              );
            })}
            <button onClick={() => { setMenuOpen(false); handleLogout(); }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all w-full">
              <LogOut size={16} /> Logout
            </button>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-5 animate-page">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav lg:hidden">
        <div className="flex items-center justify-around px-2 pb-safe pt-1">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={`bottom-nav-item ${active ? "active" : ""}`}>
                <Icon className="bottom-nav-icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
