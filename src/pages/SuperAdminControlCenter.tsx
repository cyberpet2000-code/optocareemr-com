import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { logSuperAdminAction } from "@/lib/superAdminAudit";
import { toast } from "sonner";

type FlagRow = {
  id: string;
  clinic_id: string;
  billing_enabled: boolean | null;
  hmo_enabled: boolean | null;
  pharmacy_enabled: boolean | null;
  inventory_enabled: boolean | null;
  appointments_enabled: boolean | null;
};

const FLAG_FIELDS = [
  "billing_enabled",
  "hmo_enabled",
  "pharmacy_enabled",
  "inventory_enabled",
  "appointments_enabled",
] as const;

export default function SuperAdminControlCenter() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clinic_feature_flags")
      .select("id, clinic_id, billing_enabled, hmo_enabled, pharmacy_enabled, inventory_enabled, appointments_enabled")
      .order("created_at", { ascending: false });
    setRows((data as FlagRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const toggleFlag = async (row: FlagRow, field: (typeof FLAG_FIELDS)[number], value: boolean) => {
    const { error } = await apiClient.from("clinic_feature_flags").update({ [field]: value } as never).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await logSuperAdminAction(user?.id, {
      action: "super_admin_feature_flag_updated",
      table_name: "clinic_feature_flags",
      clinic_id: row.clinic_id,
      record_id: row.id,
      old_data: { [field]: row[field] },
      new_data: { [field]: value },
    });
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, [field]: value } : item)));
    toast.success("Feature updated");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Control Center</h1>
        <p className="text-sm text-muted-foreground">Global clinic module controls</p>
      </div>
      <div className="form-section overflow-x-auto">
        {loading ? (
          <div className="py-8 text-sm text-muted-foreground text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground text-center">No feature flags found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3">Clinic</th>
                {FLAG_FIELDS.map((field) => (
                  <th key={field} className="py-2 pr-3">{field.replace("_enabled", "")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="py-3 pr-3 font-mono text-xs">{row.clinic_id.slice(0, 8)}</td>
                  {FLAG_FIELDS.map((field) => (
                    <td key={field} className="py-3 pr-3">
                      <Switch checked={Boolean(row[field])} onCheckedChange={(value) => void toggleFlag(row, field, value)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Button variant="outline" onClick={() => void load()}>Refresh</Button>
    </div>
  );
}