import { useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type HmoVerifStatus = "pending" | "verified" | "rejected" | "not_applicable";

interface HMOVerificationCardProps {
  patientId: string;
  clinicId: string;
  hmoId: string | null;
  hmoName?: string | null;
  enrolleeNumber?: string | null;
  status: HmoVerifStatus;
  verifiedAt?: string | null;
  notes?: string | null;
  onUpdated?: (next: {
    status: HmoVerifStatus;
    verifiedAt: string | null;
    notes: string;
  }) => void;
}

const STATUS_META: Record<HmoVerifStatus, { label: string; cls: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  pending: { label: "Pending verification", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30", Icon: ShieldQuestion },
  verified: { label: "Verified", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30", Icon: ShieldCheck },
  rejected: { label: "Rejected", cls: "bg-destructive/10 text-destructive border-destructive/30", Icon: ShieldAlert },
  not_applicable: { label: "Not applicable", cls: "bg-muted text-muted-foreground border-border", Icon: ShieldQuestion },
};

export function HMOVerificationCard({
  patientId,
  clinicId,
  hmoId,
  hmoName,
  enrolleeNumber,
  status,
  verifiedAt,
  notes,
  onUpdated,
}: HMOVerificationCardProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes || "");
  const meta = STATUS_META[status] || STATUS_META.pending;
  const Icon = meta.Icon;

  const act = async (next: HmoVerifStatus) => {
    setBusy(true);
    const { data: u } = await apiClient.auth.getUser();
    const uid = u.user?.id ?? null;
    const verifiedAtNew = next === "verified" ? new Date().toISOString() : null;
    const { error: e1 } = await apiClient
      .from("patients")
      .update({
        hmo_verification_status: next,
        hmo_verification_notes: draftNotes || null,
        hmo_verified_at: verifiedAtNew,
        hmo_verified_by: next === "verified" ? uid : null,
      } as any)
      .eq("id", patientId);
    if (e1) {
      setBusy(false);
      toast.error(e1.message);
      return;
    }
    const { error: e2 } = await apiClient.from("hmo_verification_log").insert({
      patient_id: patientId,
      clinic_id: clinicId,
      hmo_id: hmoId,
      enrollee_number: enrolleeNumber || null,
      status: next,
      notes: draftNotes || null,
      acted_by: uid,
    } as any);
    setBusy(false);
    if (e2) {
      toast.error(`Saved, but log failed: ${e2.message}`);
    } else {
      toast.success(`HMO ${next === "verified" ? "verified" : next}`);
    }
    setOpen(false);
    onUpdated?.({ status: next, verifiedAt: verifiedAtNew, notes: draftNotes });
  };

  return (
    <div className={cn("medical-card border", meta.cls.split(" ").filter(c => c.startsWith("border-")).join(" "))}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", meta.cls)}>
            <Icon size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold">HMO Verification — {meta.label}</div>
            <div className="text-xs text-muted-foreground">
              {hmoName || "HMO"}
              {enrolleeNumber ? ` · Enrollee ${enrolleeNumber}` : ""}
              {verifiedAt ? ` · ${new Date(verifiedAt).toLocaleString()}` : ""}
            </div>
            {notes && <div className="text-xs mt-1">{notes}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!open && (
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setDraftNotes(notes || ""); setOpen(true); }}>
              {status === "verified" ? "Re-verify" : "Verify HMO"}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea
            rows={2}
            value={draftNotes}
            onChange={e => setDraftNotes(e.target.value)}
            placeholder="e.g. Confirmed eligibility with HMO call centre, ref #1234"
            className="rounded-xl text-sm"
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button size="sm" variant="ghost" className="rounded-xl" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl" disabled={busy} onClick={() => act("rejected")}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Mark rejected"}
            </Button>
            <Button size="sm" className="rounded-xl" disabled={busy} onClick={() => act("verified")}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Mark verified"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
