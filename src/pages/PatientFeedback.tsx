import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";

export default function PatientFeedback() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [clinicName, setClinicName] = useState("");

  const [overallRating, setOverallRating] = useState<number | null>(null);
const [cleanlinessRating, setCleanlinessRating] = useState<number | null>(null);
  const [frontDeskRating, setFrontDeskRating] = useState<number | null>(null);
const [attendedReasonableTime, setAttendedReasonableTime] = useState<string | null>(null);
  const [doctorProfessionalismRating, setDoctorProfessionalismRating] =
  useState<number | null>(null);

const [doctorExplanationClarity, setDoctorExplanationClarity] =
  useState<string | null>(null);

const [concernsAddressed, setConcernsAddressed] =
  useState<string | null>(null);
 
const [prescriptionExplanationSatisfaction, setPrescriptionExplanationSatisfaction] =
  useState<number | null>(null);

const [glassesVisionSatisfaction, setGlassesVisionSatisfaction] =
  useState<number | null>(null);

const [glassesVisionNotApplicable, setGlassesVisionNotApplicable] =
  useState(false);

const [prescriptionDifficulty, setPrescriptionDifficulty] =
  useState<boolean | null>(null);

const [prescriptionDifficultyDetails, setPrescriptionDifficultyDetails] =
  useState("");

  
const ratingOptions = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very Good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Fair" },
  { value: 1, label: "Poor" },
];
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
          <div className="mt-8 border-t pt-6">
  <h2 className="text-lg font-semibold text-foreground">
    1. Your Visit
  </h2>

  <div className="mt-6">
    <p className="text-sm font-medium text-foreground">
      How would you rate your overall experience at the clinic?
    </p>

    <div className="mt-3 space-y-2">
      {ratingOptions.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="overall-rating"
            value={option.value}
            checked={overallRating === option.value}
            onChange={() => setOverallRating(option.value)}
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>

  <div className="mt-8">
    <p className="text-sm font-medium text-foreground">
      How would you rate the cleanliness and comfort of the clinic?
    </p>

    <div className="mt-3 space-y-2">
      {ratingOptions.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="cleanliness-rating"
            value={option.value}
            checked={cleanlinessRating === option.value}
            onChange={() => setCleanlinessRating(option.value)}
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>
            <div className="mt-8 border-t pt-6">
  <h2 className="text-lg font-semibold text-foreground">
    2. Reception & Staff
  </h2>

  <div 
    <div className="mt-8 border-t pt-6">
  <h2 className="text-lg font-semibold text-foreground">
    3. Doctor / Optometrist
  </h2>

  <div className="mt-6">
    <p className="text-sm font-medium text-foreground">
      How would you rate the professionalism of the doctor/optometrist?
    </p>

    <div className="mt-3 space-y-2">
      {ratingOptions.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="doctor-professionalism-rating"
            value={option.value}
            checked={doctorProfessionalismRating === option.value}
            onChange={() =>
              setDoctorProfessionalismRating(option.value)
            }
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>

  <div className="mt-8">
    <p className="text-sm font-medium text-foreground">
      Did the doctor explain your eye condition and findings clearly?
    </p>

    <div className="mt-3 space-y-2">
      {[
        { value: "very_clearly", label: "Very clearly" },
        { value: "clearly", label: "Clearly" },
        { value: "somewhat_clearly", label: "Somewhat clearly" },
        { value: "not_clearly", label: "Not clearly" },
      ].map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="doctor-explanation-clarity"
            value={option.value}
            checked={doctorExplanationClarity === option.value}
            onChange={() =>
              setDoctorExplanationClarity(option.value)
            }
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>

  <div className="mt-8">
    <p className="text-sm font-medium text-foreground">
      Did you feel that your concerns were properly listened to and addressed?
    </p>

    <div className="mt-3 space-y-2">
      {[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "somewhat", label: "Somewhat" },
      ].map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="concerns-addressed"
            value={option.value}
            checked={concernsAddressed === option.value}
            onChange={() =>
              setConcernsAddressed(option.value)
            }
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>
</div>
    className="mt-6">
    <p className="text-sm font-medium text-foreground">
      How would you rate the attitude and professionalism of our front-desk staff?
    </p>

    <div className="mt-3 space-y-2">
      {ratingOptions.map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="front-desk-rating"
            value={option.value}
            checked={frontDeskRating === option.value}
            onChange={() => setFrontDeskRating(option.value)}
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>

  <div className="mt-8">
    <p className="text-sm font-medium text-foreground">
      Were you attended to within a reasonable time?
    </p>

    <div className="mt-3 space-y-2">
      {[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
        { value: "somewhat", label: "Somewhat" },
      ].map((option) => (
        <label
          key={option.value}
          className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"
        >
          <input
            type="radio"
            name="attended-reasonable-time"
            value={option.value}
            checked={attendedReasonableTime === option.value}
            onChange={() => setAttendedReasonableTime(option.value)}
          />

          <span className="text-sm">
            {option.label}
          </span>
        </label>
      ))}
    </div>
  </div>
</div>
</div>
        </div>
      </div>
    </div>
  );
}
