import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { useRole } from "@/hooks/useRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, RefreshCw, FileText } from "lucide-react";
import { toast } from "sonner";

interface Report {
  id: string; clinic_id: string; year: number; month: number;
  status: string; storage_path: string | null; file_size_bytes: number | null;
  error_message: string | null; created_at: string; payload: any;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function MonthlyReports() {
  const { effectiveClinicId } = useClinic();
  const { isAdmin, isSuperAdmin } = useRole();
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [gen, setGen] = useState(false);

  const load = useCallback(async () => {
    if (!effectiveClinicId) return;
    setLoading(true);
    const { data, error } = await apiClient.from("monthly_reports").select("*")
      .eq("clinic_id", effectiveClinicId).order("year", { ascending: false }).order("month", { ascending: false }).limit(24);
    if (error) toast.error(error.message);
    setRows((data as any) || []);
    setLoading(false);
  }, [effectiveClinicId]);

  useEffect(() => { load(); }, [load]);

  async function generatePrevious() {
    if (!effectiveClinicId) return;
    setGen(true);
    try {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const { data, error } = await apiClient.functions.invoke("generate-monthly-report", {
        body: { clinic_id: effectiveClinicId, year: prev.getFullYear(), month: prev.getMonth() + 1, send_email: false },
      });
      if (error) throw error;
      toast.success("Report generated");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally {
      setGen(false);
    }
  }

  async function download(r: Report) {
    if (!r.storage_path) return;
    const { data, error } = await apiClient.storage.from("monthly-reports").createSignedUrl(r.storage_path, 300);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  }

  const canGenerate = isAdmin || isSuperAdmin;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Monthly Reports</h1>
          <p className="text-sm text-muted-foreground">Automatically generated on the 1st of each month</p>
        </div>
        {canGenerate && (
          <Button onClick={generatePrevious} disabled={gen}>
            <RefreshCw size={16} className={`mr-1 ${gen ? "animate-spin" : ""}`} /> Generate previous month
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />) :
          rows.length === 0 ? (
            <div className="form-section col-span-full text-center py-10 text-muted-foreground">
              No reports yet. The first report will generate automatically on the 1st of next month.
            </div>
          ) : rows.map(r => (
            <div key={r.id} className="form-section">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-primary" />
                    <div className="font-semibold">{MONTHS[r.month - 1]} {r.year}</div>
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase ${
                      r.status === "ready" ? "bg-success/15 text-success" :
                      r.status === "failed" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Generated {new Date(r.created_at).toLocaleString()}</div>
                  {r.error_message && <div className="text-xs text-destructive mt-1">{r.error_message}</div>}
                </div>
                {r.status === "ready" && r.storage_path && (
                  <Button size="sm" variant="outline" onClick={() => download(r)}><Download size={14} className="mr-1" /> PDF</Button>
                )}
              </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}
