import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useAccess } from "@/hooks/useAccess";
import { useClinic } from "@/hooks/useClinic";
import { PatientWhatsAppMessages } from "@/components/PatientWhatsAppMessages";

export default function Visits() {
  const { effectiveClinicId: cid, role } = useAccess();
  const { clinic } = useClinic();
  const isReceptionist = role === "receptionist";

  const [searchParams] = useSearchParams();
const filter = searchParams.get("filter");

  const [visits, setVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorMap, setDoctorMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!cid) return;

    (async () => {
      let data: any[] = [];

      if (isReceptionist) {
        const from = filter === "today"
          ? new Date(new Date().toISOString().split("T")[0] + "T00:00:00").toISOString()
          : null;
        const { data: rpcData, error } = await apiClient.rpc(
          "get_receptionist_clinic_visits",
          {
            p_clinic_id: cid,
            p_limit: 500,
            p_offset: 0,
            p_from: from,
            p_to: null,
          } as any
        );
        if (error) {
          console.error("Receptionist visits query failed:", error);
          setVisits([]);
          setLoading(false);
          return;
        }
        data = rpcData || [];
      } else {
        let query = apiClient.from("visits").select("*").eq("clinic_id", cid);

        if (filter === "today") {
          const today = new Date().toISOString().split("T")[0];
          query = query.gte("created_at", `${today}T00:00:00`);
        }

        const { data: rows, error } = await query.order("created_at", { ascending: false });
        if (error) {
          console.error("Visits query failed:", error);
          setVisits([]);
          setLoading(false);
          return;
        }
        data = rows || [];
      }

      const patientIds = [...new Set(data.map((v: any) => v.patient_id).filter(Boolean))];

      const { data: patients } = patientIds.length
        ? await apiClient.from("patients").select("id, full_name, phone").in("id", patientIds)
        : { data: [] };

      const doctorIds = [...new Set(data.map((v: any) => v.doctor_id).filter(Boolean))];

      const { data: doctorProfiles } = doctorIds.length
        ? await apiClient.from("profiles").select("id, full_name").in("id", doctorIds)
        : { data: [] };

      const nextDoctorMap = new Map<string, string>(
        (doctorProfiles || []).map((p: any) => [p.id, p.full_name || "Doctor"])
      );
      setDoctorMap(nextDoctorMap);

      const patientMap = new Map(
        (patients || []).map((p: any) => [p.id, { full_name: p.full_name, phone: p.phone }])
      );

      const visitsWithNames = data.map((visit: any) => ({
        ...visit,
        patient_name: patientMap.get(visit.patient_id)?.full_name || "Unknown Patient",
        patient_phone: patientMap.get(visit.patient_id)?.phone || null,
      }));

      const finalVisits = visitsWithNames.map((visit: any) => ({
        ...visit,
        doctor_name:
          nextDoctorMap.get(visit.doctor_id) ||
          (visit.doctor_id ? "Assigned doctor" : "Not assigned"),
      }));
      setVisits(finalVisits);
      setLoading(false);
    })();
  }, [cid, filter]);

  return (
    <>
<h1 className="page-header mb-5">
{filter === "today"
  ? `${isReceptionist ? "Today's Patient Visits" : "Today's Visits"} (${visits.length})`
  : `${isReceptionist ? "Patient Visits" : "All Visits"} (${visits.length})`}
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
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold truncate">{visit.patient_name}</p>
          <PatientWhatsAppMessages
            clinicId={cid || ""}
            clinicName={clinic?.name || "Clinic"}
            patientId={visit.patient_id}
            patientName={visit.patient_name}
            phone={visit.patient_phone}
            visitId={visit.id}
          />
        </div>

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

      {!isReceptionist && visit.diagnosis && (
  <p className="text-sm mt-1">
    Diagnosis: {visit.diagnosis}
  </p>
)}

{!isReceptionist && (
  <p className="text-xs text-muted-foreground mt-1">
    {visit.diagnosis} • IOP {visit.iop_od || "-"} / {visit.iop_os || "-"}
    {visit.iop_time ? ` • Tonometer time ${String(visit.iop_time).slice(0, 5)}` : ""}
  </p>
)}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
        <span>Doctor: {visit.doctor_name}</span>
        <span>{new Date(visit.created_at).toLocaleString()}</span>
      </div>
    </div>
  </Link>
))}
        </div>
      )}
    </>
  );
}
