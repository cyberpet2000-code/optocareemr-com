import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, UserPlus, Users, Menu, X, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/register", label: "Add Patient", icon: UserPlus },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-primary text-primary-foreground shadow-md">
        <div className="flex items-center justify-between px-4 h-14 max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span className="bg-primary-foreground text-primary rounded-lg w-8 h-8 flex items-center justify-center text-sm font-black">O</span>
            Optocare EMR
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? "bg-primary-foreground/20" : "hover:bg-primary-foreground/10"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-primary-foreground/10"
            >
              <LogOut size={16} />
              Logout
            </button>
          </nav>
          <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="md:hidden border-t border-primary-foreground/20 px-4 pb-3 pt-1 space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active ? "bg-primary-foreground/20" : "hover:bg-primary-foreground/10"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={() => { setMobileOpen(false); handleLogout(); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-primary-foreground/10 w-full"
            >
              <LogOut size={16} />
              Logout
            </button>
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
