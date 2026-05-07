import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, History, Search } from "lucide-react";

type Row = {
  id: string;
  admin_id: string | null;
  from_clinic: string | null;
  to_clinic: string | null;
  access_granted: boolean | null;
  reason: string | null;
  created_at: string | null;
};

type Clinic = { id: string; name: string };
type Profile = { id: string; full_name: string | null; email?: string | null };

export default function SuperAdminSwitchAudit() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clinics, setClinics] = useState<Record<string, string>>({});
  const [admins, setAdmins] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [clinicFilter, setClinicFilter] = useState<string>("all");
  const [adminFilter, setAdminFilter] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [logs, cs, ps] = await Promise.all([
        supabase.from("clinic_switch_log").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("clinics").select("id, name"),
        supabase.from("profiles").select("*"),
      ]);
      setRows((logs.data as any) || []);
      const cmap: Record<string, string> = {};
      ((cs.data as Clinic[]) || []).forEach(c => { cmap[c.id] = c.name; });
      setClinics(cmap);
      const amap: Record<string, string> = {};
      ((ps.data as any[]) || []).forEach((p: any) => { amap[p.id] = p.full_name || p.email || p.id; });
      setAdmins(amap);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 86400000 : null;
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (clinicFilter !== "all" && r.to_clinic !== clinicFilter && r.from_clinic !== clinicFilter) return false;
      if (adminFilter !== "all" && r.admin_id !== adminFilter) return false;
      if (fromTs && r.created_at && new Date(r.created_at).getTime() < fromTs) return false;
      if (toTs && r.created_at && new Date(r.created_at).getTime() >= toTs) return false;
      if (q) {
        const hay = [
          r.reason || "",
          admins[r.admin_id || ""] || "",
          clinics[r.from_clinic || ""] || "",
          clinics[r.to_clinic || ""] || "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, clinicFilter, adminFilter, from, to, admins, clinics]);

  const exportCsv = () => {
    const header = ["Timestamp", "Admin", "From Clinic", "To Clinic", "Access Granted", "Reason"];
    const csv = [header.join(",")]
      .concat(filtered.map(r => [
        r.created_at ? new Date(r.created_at).toISOString() : "",
        admins[r.admin_id || ""] || r.admin_id || "",
        clinics[r.from_clinic || ""] || r.from_clinic || "",
        clinics[r.to_clinic || ""] || r.to_clinic || "",
        r.access_granted === false ? "no" : "yes",
        (r.reason || "").replace(/"/g, '""'),
      ].map(v => `"${String(v)}"`).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clinic-switch-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clinicOptions = useMemo(() =>
    Object.entries(clinics).sort((a, b) => a[1].localeCompare(b[1])), [clinics]);
  const adminOptions = useMemo(() => {
    const ids = Array.from(new Set(rows.map(r => r.admin_id).filter(Boolean))) as string[];
    return ids.map(id => [id, admins[id] || id] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows, admins]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><History size={20} /> Clinic Switch Audit</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length} entries</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={16} className="mr-1" /> Export CSV
        </Button>
      </div>

      <div className="form-section grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="md:col-span-2 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search reason, admin, clinic…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={clinicFilter} onValueChange={setClinicFilter}>
          <SelectTrigger><SelectValue placeholder="Clinic" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clinics</SelectItem>
            {clinicOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={adminFilter} onValueChange={setAdminFilter}>
          <SelectTrigger><SelectValue placeholder="Admin" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All admins</SelectItem>
            {adminOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div className="form-section overflow-x-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">No entries match your filters.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Admin</th>
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">Access</th>
                <th className="py-2 pr-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td>
                  <td className="py-2.5 pr-3">{admins[r.admin_id || ""] || r.admin_id || "—"}</td>
                  <td className="py-2.5 pr-3">{clinics[r.from_clinic || ""] || (r.from_clinic ? r.from_clinic.slice(0, 8) : "—")}</td>
                  <td className="py-2.5 pr-3 font-medium">{clinics[r.to_clinic || ""] || (r.to_clinic ? r.to_clinic.slice(0, 8) : "—")}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${r.access_granted === false ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                      {r.access_granted === false ? "Denied" : "Granted"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{r.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
