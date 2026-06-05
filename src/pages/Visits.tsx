import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useAccessClinic } from "@/hooks/useAccess";

export default function Visits() {
  const { effectiveClinicId: cid } = useAccessClinic();

  const [searchParams] = useSearchParams();
const filter = searchParams.get("filter");

  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cid) return;

    (async () => {
      let query = apiClient
        .from("visits")
        .select("*")
        .eq("clinic_id", cid);

      if (filter === "today") {
        const today = new Date().toISOString().split("T")[0];
        query = query.gte("created_at", `${today}T00:00:00`);
      }

      const { data } = await query.order("created_at", { ascending: false });
      const patientIds = [
  ...new Set(
    (data || [])
      .map((v: any) => v.patient_id)
      .filter(Boolean)
  )
];

const { data: patients } = await apiClient
  .from("patients")
  .select("id, full_name")
  .in("id", patientIds);

const patientMap = new Map(
  (patients || []).map((p: any) => [
    p.id,
    p.full_name,
  ])
);

const visitsWithNames = (data || []).map(
  (visit: any) => ({
    ...visit,
    patient_name:
      patientMap.get(visit.patient_id) ||
      "Unknown Patient",
  })
);


      setVisits(visitsWithNames);
      setLoading(false);
    })();
  }, [cid, filter]);

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
                  {visit.patient_name}
              </p>

              <p className="text-xs text-muted-foreground">
                  {new Date(
                {visit.created_at}
                 ).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
