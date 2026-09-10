import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";

export default function PatientFeedback() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [clinicName, setClinicName] = useState("");

  useEffect(() => {
    async function loadFeedbackRequest() {
      if (!token) {
        setValid(false);
        setLoading(false);
        return;
      }

      const { data, error } = await apiClient
        .from("feedback_requests")
        .select("id, clinic_id, status")
        .eq("token", token)
        .eq("status", "pending")
        .maybeSingle();

      if (error || !data) {
        setValid(false);
        setLoading(false);
        return;
      }

      const { data: clinic, error: clinicError } = await apiClient
        .from("clinics")
        .select("name")
        .eq("id", data.clinic_id)
        .maybeSingle();

      if (!clinicError && clinic?.name) {
        setClinicName(clinic.name);
      }

      setValid(true);
      setLoading(false);
    }

    loadFeedbackRequest();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          Loading feedback form...
        </p>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-foreground">
            Feedback link unavailable
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            This feedback link is invalid, expired, cancelled, or has
            already been submitted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            {clinicName || "Our Clinic"}
          </p>

          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            Patient Feedback Form
          </h1>

          <p className="mt-3 text-sm text-muted-foreground">
            Thank you for choosing our clinic.
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            We value your feedback and use it to improve our services,
            patient care and overall experience.
          </p>
        </div>
      </div>
    </div>
  );
}
