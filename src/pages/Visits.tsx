import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import { useAccessClinic } from "@/hooks/useAccess";

export default function Visits() {
  const { effectiveClinicId: cid } = useAccessClinic();
  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cid) return;

    (async () => {
      const { data } = await apiClient
        .from("visits")
        .select("*")
        .eq("clinic_id", cid)
        .order("created_at", { ascending: false });

      setVisits(data || []);
      setLoading(false);
    })();
  }, [cid]);

  return (
    <>
      <h1 className="page-header mb-5">Visits</h1>

      {loading ? (
        <p>Loading...</p>
      ) : visits.length === 0 ? (
        <p>No visits found.</p>
      ) : (
        <div className="space-y-2">
          {visits.map((visit) => (
            <div
              key={visit.id}
              className="medical-card p-3"
            >
              <p className="font-medium">
                Visit #{visit.id.slice(0, 8)}
              </p>

              <p className="text-xs text-muted-foreground">
                {visit.created_at}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
