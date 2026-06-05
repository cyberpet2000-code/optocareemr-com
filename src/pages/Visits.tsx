import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
<h1 className="page-header mb-5">
  {filter === "today"
    ? `Today's Visits (${visits.length})`
    : `All Visits (${visits.length})`}
</h1>
      {loading ? (
        <p>Loading...</p>
      ) : visits.length === 0 ? (
        <p>No visits found.</p>
      ) : (
        <div className="space-y-2">
          {visits.map((visit) => (
  <Link
    key={visit.id}
    to={`/patient/${visit.patient_id}`}
    className="block"
  >
    <div className="medical-card p-3 hover:bg-muted/50 transition-all">
      <div className="flex items-center justify-between">
        <p className="font-semibold">
          {visit.patient_name}
        </p>

        <span
          className={`text-[10px] px-2 py-1 rounded-md font-medium ${
  visit.status === "completed"
    ? "bg-success/10 text-success"
    : visit.status === "in_progress"
    ? "bg-primary/10 text-primary"
    : visit.status === "cancelled"
    ? "bg-destructive/10 text-destructive"
    : "bg-warning/10 text-warning"
}`}
        >
          {visit.status}
        </span>
      </div>

      {visit.diagnosis && (
        <p className="text-sm mt-1">
          Diagnosis: {visit.diagnosis}
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-1">
  {visit.diagnosis} • IOP {visit.iop_od || "-"} / {visit.iop_os || "-"}
</p>

      <p className="text-xs text-muted-foreground mt-1">
        {new Date(
          visit.created_at
        ).toLocaleString()}
      </p>
    </div>
  </Link>
))}
        </div>
      )}
    </>
  );
}
