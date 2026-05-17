import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { Building2, Users, Activity, Sparkles, ShieldCheck, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SuperAdminDashboard() {
  const { isAuthReady } = useAuth();
  const [stats, setStats] = useState<{ clinics: number; patients: number; users: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [c, p, u] = await Promise.all([
          apiClient.from("clinics").select("id", { count: "exact", head: true }),
          apiClient.from("patients").select("id", { count: "exact", head: true }),
          apiClient.from("profiles").select("id", { count: "exact", head: true }),
        ]);
        const errors: { table: string; error: { message: string } }[] = [
          { table: "clinics", error: c.error },
          { table: "patients", error: p.error },
          { table: "profiles", error: u.error },
        ].filter(e => e.error) as { table: string; error: { message: string } }[];

        if (errors.length > 0) {
          errors.forEach(e => {
            console.error(`[SuperAdminDashboard] ${e.table} query error:`, e.error.message);
          });
          const first = errors[0];
          if (!cancelled) setError(`${first.table} query failed: ${first.error.message}`);
          return;
        }
        if (!cancelled) {
          setStats({
            clinics: c.count ?? 0,
            patients: p.count ?? 0,
            users: u.count ?? 0,
          });
        }
      } catch (err: any) {
        console.error("[SuperAdminDashboard] stats fetch failed:", err);
        if (!cancelled) setError(err?.message || "Failed to load stats");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthReady]);

  const cards = [
    { label: "Total Clinics", value: stats?.clinics, icon: Building2 },
    { label: "Total Patients", value: stats?.patients, icon: Users },
    { label: "Platform Users", value: stats?.users, icon: ShieldCheck },
  ];

  const links = [
    { to: "/super-admin/create-clinic", label: "Create Clinic", icon: Plus, desc: "Provision new clinic + admin" },
    { to: "/super-admin/clinics", label: "All Clinics", icon: Building2, desc: "Manage clinic accounts" },
    { to: "/super-admin/users", label: "Platform Users", icon: Users, desc: "Manage all users" },
    { to: "/super-admin", label: "Performance", icon: Activity, desc: "System health & metrics" },
    { to: "/super-admin/clinics", label: "Clinic Control", icon: Sparkles, desc: "Lifecycle and access oversight" },
    { to: "/super-admin/users", label: "Safety & Roles", icon: ShieldCheck, desc: "User access and safeguards" },
  ];

  const showSkeletons = !isAuthReady || loading || (!stats && !error);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin Control Center</h1>
        <p className="text-sm text-muted-foreground">Global platform overview and management</p>
      </div>
      {error && (
        <div className="form-section text-sm text-destructive border-destructive/40">
          Failed to load stats: {error}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="form-section flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon size={22} /></div>
              <div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                {showSkeletons ? (
                  <Skeleton className="h-7 w-12 mt-1" />
                ) : (
                  <div className="text-2xl font-bold">{c.value ?? "—"}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map(l => {
          const Icon = l.icon;
          return (
            <Link key={l.to} to={l.to} className="form-section hover:border-primary/50 transition-all group">
              <Icon className="text-primary mb-2" size={22} />
              <div className="font-semibold group-hover:text-primary">{l.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{l.desc}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
