import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Archive, Download, Lock, Trash2, Plus, ShieldCheck, FileArchive,
  CheckCircle2, AlertCircle, Loader2, Calendar, User, Building2, Clock,
} from "lucide-react";
import { toast } from "sonner";

type ArchiveRow = {
  id: string;
  clinic_id: string;
  scope: "full" | "patient" | "date_range";
  patient_id: string | null;
  date_from: string | null;
  date_to: string | null;
  status: "pending" | "generating" | "ready" | "failed" | "deleted";
  storage_path: string | null;
  file_size_bytes: number | null;
  file_count: number | null;
  encrypted: boolean;
  expires_at: string | null;
  error_message: string | null;
  progress: number;
  created_at: string;
};

type Clinic = { id: string; name: string };
type Patient = { id: string; full_name: string };

function formatBytes(b: number | null | undefined) {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${u[i]}`;
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 3600 * 24));
  return d;
}

function estimateSize(patients: number, scope: "full" | "patient" | "date_range") {
  // Rough estimate: ~25KB per patient PDF + 50KB overhead
  const base = 50_000;
  const n = scope === "patient" ? 1 : Math.max(1, patients);
  return base + n * 25_000;
}

export default function SuperAdminArchives() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [archives, setArchives] = useState<ArchiveRow[]>([]);
  const [loading, setLoading] = useState(true);

  // dialog state
  const [open, setOpen] = useState(false);
  const [clinicId, setClinicId] = useState<string>(params.get("clinic_id") ?? "");
  const [clinicPatientCount, setClinicPatientCount] = useState<number>(0);
  const [scope, setScope] = useState<"full" | "patient" | "date_range">("full");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // pending delete
  const [deleteTarget, setDeleteTarget] = useState<ArchiveRow | null>(null);

  const refresh = async () => {
    const [{ data: cs }, { data: ar }] = await Promise.all([
      apiClient.from("clinics").select("id, name").order("name"),
      apiClient.from("clinic_archives").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setClinics((cs ?? []) as Clinic[]);
    setArchives((ar ?? []) as ArchiveRow[]);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  // realtime progress
  useEffect(() => {
    if (!activeArchiveId) return;
    const channel = apiClient.channel(`archive-${activeArchiveId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clinic_archives", filter: `id=eq.${activeArchiveId}` },
        (payload) => {
          const row = payload.new as ArchiveRow;
          setArchives((prev) => prev.map((a) => (a.id === row.id ? row : a)));
          if (row.status === "ready") {
            setGenerating(false);
            setShowSuccess(true);
          } else if (row.status === "failed") {
            setGenerating(false);
            toast.error(row.error_message || "Archive failed");
          }
        }).subscribe();
    return () => { apiClient.removeChannel(channel); };
  }, [activeArchiveId]);

  // Load patients when clinic selected and scope is patient
  useEffect(() => {
    if (!clinicId) { setPatients([]); setClinicPatientCount(0); return; }
    apiClient.from("patients").select("id, full_name", { count: "exact" }).eq("clinic_id", clinicId).order("full_name").limit(500)
      .then(({ data, count }) => {
        setPatients((data ?? []) as Patient[]);
        setClinicPatientCount(count ?? (data?.length ?? 0));
      });
  }, [clinicId]);

  const startGenerate = async () => {
    if (!clinicId) { toast.error("Select a clinic"); return; }
    if (scope === "patient" && !patientId) { toast.error("Select a patient"); return; }
    if (scope === "date_range" && (!dateFrom || !dateTo)) { toast.error("Pick a date range"); return; }
    if (usePassword) {
      if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
      if (password !== confirmPassword) { toast.error("Passwords don't match"); return; }
    }

    setGenerating(true);
    setShowSuccess(false);

    const { data, error } = await apiClient.functions.invoke("generate-clinic-archive", {
      body: {
        clinic_id: clinicId, scope, patient_id: scope === "patient" ? patientId : undefined,
        date_from: scope === "date_range" ? dateFrom : undefined,
        date_to: scope === "date_range" ? dateTo : undefined,
        password: usePassword ? password : undefined,
      },
    });

    if (error || (data as any)?.error) {
      setGenerating(false);
      toast.error((data as any)?.error || error?.message || "Failed to start archive");
      return;
    }
    setActiveArchiveId((data as any).archive_id);
    await refresh();
  };

  const download = async (a: ArchiveRow) => {
    const { data, error } = await apiClient.functions.invoke("manage-clinic-archive", {
      body: { action: "download", archive_id: a.id },
    });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Failed"); return; }
    window.open((data as any).url, "_blank");
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { data, error } = await apiClient.functions.invoke("manage-clinic-archive", {
      body: { action: "delete", archive_id: deleteTarget.id },
    });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Failed"); return; }
    toast.success("Archive deleted");
    setDeleteTarget(null);
    refresh();
  };

  const resetDialog = () => {
    setOpen(false);
    setGenerating(false); setShowSuccess(false); setActiveArchiveId(null);
    setPassword(""); setConfirmPassword(""); setUsePassword(false);
    setScope("full"); setPatientId(""); setDateFrom(""); setDateTo("");
  };

  const estSize = estimateSize(clinicPatientCount, scope);
  const activeRow = archives.find((a) => a.id === activeArchiveId);
  const clinicName = clinics.find((c) => c.id === clinicId)?.name ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="text-primary" size={24} /> Clinic Data Archives
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate, encrypt, and manage downloadable data exports. Clinics retain access for 180 days after cancellation.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shadow-sm">
          <Plus size={16} className="mr-1.5" /> New Archive
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total archives", value: archives.length, icon: FileArchive },
          { label: "Ready", value: archives.filter(a => a.status === "ready").length, icon: CheckCircle2 },
          { label: "Generating", value: archives.filter(a => a.status === "generating").length, icon: Loader2 },
          { label: "Encrypted", value: archives.filter(a => a.encrypted).length, icon: Lock },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <s.icon size={16} className="text-muted-foreground" />
            </div>
            <div className="text-2xl font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Archive cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
        ) : archives.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <Archive size={36} className="mx-auto text-muted-foreground mb-3" />
            <div className="font-medium">No archives yet</div>
            <p className="text-sm text-muted-foreground mt-1">Generate your first clinic data export.</p>
          </div>
        ) : (
          archives.map((a) => {
            const clinic = clinics.find((c) => c.id === a.clinic_id);
            const days = daysLeft(a.expires_at);
            const expired = days !== null && days <= 0;
            return (
              <div key={a.id} className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 size={14} className="text-muted-foreground" />
                      <span className="font-medium">{clinic?.name || a.clinic_id.slice(0, 8)}</span>
                      <StatusBadge status={a.status} />
                      {a.encrypted && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary inline-flex items-center gap-1">
                          <Lock size={11} /> AES-256
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground capitalize">
                        {a.scope.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1"><Calendar size={11} /> {new Date(a.created_at).toLocaleString()}</span>
                      <span className="inline-flex items-center gap-1"><FileArchive size={11} /> {formatBytes(a.file_size_bytes)} • {a.file_count ?? 0} files</span>
                      {a.expires_at && (
                        <span className={`inline-flex items-center gap-1 ${expired ? "text-destructive" : days! < 30 ? "text-warning" : ""}`}>
                          <Clock size={11} /> {expired ? "Expired" : `${days}d retention left`}
                        </span>
                      )}
                    </div>
                    {a.status === "generating" && (
                      <div className="mt-3">
                        <Progress value={a.progress} className="h-1.5" />
                        <div className="text-xs text-muted-foreground mt-1">{a.progress}% complete…</div>
                      </div>
                    )}
                    {a.status === "failed" && (
                      <div className="mt-2 text-xs text-destructive flex items-start gap-1.5">
                        <AlertCircle size={12} className="mt-0.5" /> {a.error_message || "Generation failed"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.status === "ready" && (
                      <Button size="sm" onClick={() => download(a)}>
                        <Download size={14} className="mr-1.5" /> Download
                      </Button>
                    )}
                    {a.status !== "deleted" && (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteTarget(a)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Generate dialog */}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : resetDialog())}>
        <DialogContent className="max-w-lg">
          {showSuccess && activeRow ? (
            <div className="py-4 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-success/10 flex items-center justify-center animate-in zoom-in-50 duration-500">
                <CheckCircle2 className="text-success" size={36} />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Archive ready</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatBytes(activeRow.file_size_bytes)} • {activeRow.file_count} files
                  {activeRow.encrypted && " • AES-256 encrypted"}
                </p>
              </div>
              <div className="flex gap-2 justify-center pt-2">
                <Button onClick={() => download(activeRow)}><Download size={16} className="mr-1.5" /> Download ZIP</Button>
                <Button variant="outline" onClick={resetDialog}>Close</Button>
              </div>
            </div>
          ) : generating ? (
            <div className="py-6 text-center space-y-4">
              <Loader2 className="mx-auto animate-spin text-primary" size={36} />
              <div>
                <h3 className="text-lg font-semibold">Building archive…</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Generating PDFs, packaging ZIP{usePassword ? ", encrypting with AES-256" : ""}.
                </p>
              </div>
              {activeRow && (
                <div className="px-4">
                  <Progress value={activeRow.progress} className="h-2" />
                  <div className="text-xs text-muted-foreground mt-1.5">{activeRow.progress}%</div>
                </div>
              )}
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Archive size={18} /> Generate Clinic Archive</DialogTitle>
                <DialogDescription>
                  Export clinic data as a downloadable ZIP. Files: archive_summary.pdf, patients/, billing/, hmo_claims/, inventory/, attachments/.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Clinic</Label>
                  <Select value={clinicId} onValueChange={setClinicId}>
                    <SelectTrigger><SelectValue placeholder="Select a clinic" /></SelectTrigger>
                    <SelectContent>
                      {clinics.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Scope</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: "full", label: "Entire clinic", icon: Building2 },
                      { v: "patient", label: "Single patient", icon: User },
                      { v: "date_range", label: "Date range", icon: Calendar },
                    ] as const).map((opt) => (
                      <button key={opt.v} type="button" onClick={() => setScope(opt.v)}
                        className={`rounded-lg border p-3 text-xs text-left transition-colors ${scope === opt.v ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                        <opt.icon size={14} className={scope === opt.v ? "text-primary" : "text-muted-foreground"} />
                        <div className="mt-1.5 font-medium">{opt.label}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {scope === "patient" && (
                  <div className="space-y-1.5">
                    <Label>Patient</Label>
                    <Select value={patientId} onValueChange={setPatientId} disabled={!clinicId}>
                      <SelectTrigger><SelectValue placeholder={clinicId ? "Select a patient" : "Pick a clinic first"} /></SelectTrigger>
                      <SelectContent>
                        {patients.map((p) => (<SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {scope === "date_range" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>From</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>To</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} className="rounded" />
                    <span className="text-sm font-medium inline-flex items-center gap-1.5"><Lock size={13} /> Encrypt with password (AES-256)</span>
                  </label>
                  {usePassword && (
                    <div className="space-y-2 pt-1">
                      <PasswordInput placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
                      <PasswordInput placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                      <p className="text-xs text-muted-foreground inline-flex items-start gap-1.5">
                        <ShieldCheck size={12} className="mt-0.5 text-primary" />
                        Password is never stored. Share it separately with the recipient.
                      </p>
                    </div>
                  )}
                </div>

                {clinicId && (
                  <div className="text-xs text-muted-foreground flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <span>Estimated size</span>
                    <span className="font-medium text-foreground">{formatBytes(estSize)}</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={resetDialog}>Cancel</Button>
                <Button onClick={startGenerate} disabled={!clinicId}>
                  <Archive size={14} className="mr-1.5" /> Generate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete archive?</DialogTitle>
            <DialogDescription>
              This permanently removes the archive file from storage. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 size={14} className="mr-1.5" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ArchiveRow["status"] }) {
  const map: Record<string, { label: string; cls: string; icon?: any }> = {
    pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
    generating: { label: "Generating", cls: "bg-primary/10 text-primary", icon: Loader2 },
    ready: { label: "Ready", cls: "bg-success/10 text-success", icon: CheckCircle2 },
    failed: { label: "Failed", cls: "bg-destructive/10 text-destructive", icon: AlertCircle },
    deleted: { label: "Deleted", cls: "bg-muted text-muted-foreground line-through" },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-md inline-flex items-center gap-1 ${m.cls}`}>
      {Icon && <Icon size={11} className={status === "generating" ? "animate-spin" : ""} />}
      {m.label}
    </span>
  );
}
