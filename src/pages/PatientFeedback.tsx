import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";

const ratingOptions = [
  { value: 5, label: "Excellent" },
  { value: 4, label: "Very Good" },
  { value: 3, label: "Good" },
  { value: 2, label: "Fair" },
  { value: 1, label: "Poor" },
];

const satisfactionOptions = [
  { value: 5, label: "Very satisfied" },
  { value: 4, label: "Satisfied" },
  { value: 3, label: "Neutral" },
  { value: 2, label: "Dissatisfied" },
  { value: 1, label: "Very dissatisfied" },
];

const clarityOptions = [
  { value: "very_clearly", label: "Very clearly" },
  { value: "clearly", label: "Clearly" },
  { value: "somewhat_clearly", label: "Somewhat clearly" },
  { value: "not_clearly", label: "Not clearly" },
];

const yesNoSomewhatOptions = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "somewhat", label: "Somewhat" },
];

function RatingGroup({
  value,
  onChange,
  options = ratingOptions,
}: {
  value: number | null;
  onChange: (value: number) => void;
  options?: { value: number; label: string }[];name: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
      {options.map((option) => (
        <label
          key={option.value}
          className={`cursor-pointer rounded-lg border p-3 text-center text-sm transition ${
            value === option.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:bg-muted"
          }`}
        >
          <input
            type="radio"
            name={`rating-${options.map((item) => item.value).join("-")}`}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

function TextOptionGroup({
  value,
  onChange,
  options,
  name,
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  name: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
      {options.map((option) => (
        <label
          key={option.value}
          className={`cursor-pointer rounded-lg border p-3 text-sm transition ${
            value === option.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border hover:bg-muted"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export default function PatientFeedback() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(false);
  const [clinicName, setClinicName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Section 1
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [cleanlinessRating, setCleanlinessRating] = useState<number | null>(
    null
  );

  // Section 2
  const [frontDeskRating, setFrontDeskRating] = useState<number | null>(null);
  const [attendedReasonableTime, setAttendedReasonableTime] = useState<
    string | null
  >(null);

  // Section 3
  const [doctorProfessionalismRating, setDoctorProfessionalismRating] =
    useState<number | null>(null);
  const [doctorExplanationClarity, setDoctorExplanationClarity] = useState<
    string | null
  >(null);
  const [concernsAddressed, setConcernsAddressed] = useState<string | null>(
    null
  );

  // Section 4
  const [
    prescriptionExplanationSatisfaction,
    setPrescriptionExplanationSatisfaction,
  ] = useState<number | null>(null);

  const [glassesVisionSatisfaction, setGlassesVisionSatisfaction] = useState<
    number | null
  >(null);

  const [glassesVisionNotApplicable, setGlassesVisionNotApplicable] =
    useState(false);

  const [prescriptionDifficulty, setPrescriptionDifficulty] = useState<
    boolean | null
  >(null);

  const [prescriptionDifficultyDetails, setPrescriptionDifficultyDetails] =
    useState("");

  // Section 5
  const [opticalServiceRating, setOpticalServiceRating] = useState<
    number | null
  >(null);

  const [opticalServiceNotApplicable, setOpticalServiceNotApplicable] =
    useState(false);

  const [glassesFittingSatisfaction, setGlassesFittingSatisfaction] = useState<
    number | null
  >(null);

  const [glassesFittingNotApplicable, setGlassesFittingNotApplicable] =
    useState(false);

  // Section 6
  const [recommendationScore, setRecommendationScore] = useState<number | null>(
    null
  );

  const [whatDidWell, setWhatDidWell] = useState("");
  const [whatCanImprove, setWhatCanImprove] = useState("");
  const [anythingElse, setAnythingElse] = useState("");

  // Section 7
  const [wantsFollowUp, setWantsFollowUp] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFeedbackRequest() {
      if (!token) {
        if (mounted) {
          setValid(false);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await apiClient.rpc(
  "get_public_feedback_request",
  {
    p_token: token,
  }
);

if (error || !data || data.length === 0) {
  if (mounted) {
    setValid(false);
    setLoading(false);
  }
  return;
}

const request = data[0];

if (mounted) {
  setClinicName(request.clinic_name || "Our Clinic");
  setValid(true);
  setLoading(false);
}
      } catch {
        if (mounted) {
          setValid(false);
          setLoading(false);
        }
      }
    }

    loadFeedbackRequest();

    return () => {
      mounted = false;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");

    if (!token) {
      setErrorMessage("This feedback link is invalid.");
      return;
    }

    if (overallRating === null) {
      setErrorMessage("Please rate your overall experience.");
      return;
    }

    if (cleanlinessRating === null) {
      setErrorMessage("Please rate cleanliness and comfort.");
      return;
    }

    if (frontDeskRating === null) {
      setErrorMessage("Please rate the front-desk staff.");
      return;
    }

    if (!attendedReasonableTime) {
      setErrorMessage(
        "Please tell us whether you were attended to within a reasonable time."
      );
      return;
    }

    if (doctorProfessionalismRating === null) {
      setErrorMessage("Please rate the doctor's professionalism.");
      return;
    }

    if (!doctorExplanationClarity) {
      setErrorMessage(
        "Please tell us how clearly your eye condition/findings were explained."
      );
      return;
    }

    if (!concernsAddressed) {
      setErrorMessage(
        "Please tell us whether your concerns were properly addressed."
      );
      return;
    }

    if (prescriptionExplanationSatisfaction === null) {
      setErrorMessage(
        "Please rate your satisfaction with the prescription explanation."
      );
      return;
    }

    if (
      !glassesVisionNotApplicable &&
      glassesVisionSatisfaction === null
    ) {
      setErrorMessage(
        "Please rate your satisfaction with your glasses vision, or select Not applicable."
      );
      return;
    }

    if (prescriptionDifficulty === null) {
      setErrorMessage(
        "Please tell us whether you are experiencing difficulty with your new prescription/glasses."
      );
      return;
    }

    if (!opticalServiceNotApplicable && opticalServiceRating === null) {
      setErrorMessage(
        "Please rate the glasses/optical service, or select Not applicable."
      );
      return;
    }

    if (
      !glassesFittingNotApplicable &&
      glassesFittingSatisfaction === null
    ) {
      setErrorMessage(
        "Please rate the fitting, comfort and appearance, or select Not applicable."
      );
      return;
    }

    if (recommendationScore === null) {
      setErrorMessage(
        "Please select how likely you are to recommend our clinic."
      );
      return;
    }

    if (wantsFollowUp === null) {
      setErrorMessage(
        "Please tell us whether you would like someone from the clinic to contact you."
      );
      return;
    }

    try {
      setSubmitting(true);

      const { error } = await apiClient.rpc("submit_patient_feedback", {
        p_token: token,
        p_overall_rating: overallRating,
        p_cleanliness_rating: cleanlinessRating,
        p_front_desk_rating: frontDeskRating,
        p_attended_reasonable_time: attendedReasonableTime,
        p_doctor_professionalism_rating: doctorProfessionalismRating,
        p_doctor_explanation_clarity: doctorExplanationClarity,
        p_concerns_addressed: concernsAddressed,
        p_prescription_explanation_satisfaction:
          prescriptionExplanationSatisfaction,
        p_glasses_vision_satisfaction: glassesVisionNotApplicable
          ? null
          : glassesVisionSatisfaction,
        p_glasses_vision_not_applicable: glassesVisionNotApplicable,
        p_prescription_difficulty: prescriptionDifficulty,
        p_prescription_difficulty_details:
          prescriptionDifficultyDetails.trim() || null,
        p_optical_service_rating: opticalServiceNotApplicable
          ? null
          : opticalServiceRating,
        p_optical_service_not_applicable: opticalServiceNotApplicable,
        p_glasses_fitting_satisfaction: glassesFittingNotApplicable
          ? null
          : glassesFittingSatisfaction,
        p_glasses_fitting_not_applicable: glassesFittingNotApplicable,
        p_recommendation_score: recommendationScore,
        p_what_did_well: whatDidWell.trim() || null,
        p_what_can_improve: whatCanImprove.trim() || null,
        p_anything_else: anythingElse.trim() || null,
        p_wants_follow_up: wantsFollowUp,
      });

      if (error) {
        console.error("Feedback submission error:", error);
        setErrorMessage(
          error.message || "Unable to submit your feedback. Please try again."
        );
        return;
      }

      setSubmitted(true);
    } catch (error) {
      console.error("Feedback submission error:", error);
      setErrorMessage("Unable to submit your feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-muted-foreground">Loading feedback form...</p>
        </div>
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Feedback link unavailable</h1>

          <p className="mt-3 text-sm text-muted-foreground">
            This feedback link may have expired, already been used, or is no
            longer available.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl">
            ✓
          </div>

          <h1 className="mt-5 text-2xl font-semibold">
            Thank you for your feedback
          </h1>

          <p className="mt-3 text-muted-foreground">
            Your feedback has been successfully submitted to{" "}
            <span className="font-medium text-foreground">
              {clinicName}
            </span>
            .
          </p>

          <p className="mt-4 text-sm text-muted-foreground">
            We appreciate you taking the time to help us improve our services
            and patient care.
          </p>

          <div className="mt-6 text-xs text-muted-foreground">
            Powered by OptoCare EMR
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="border-b px-5 py-6 sm:px-8">
            <p className="text-sm font-medium text-primary">{clinicName}</p>

            <h1 className="mt-2 text-2xl sm:text-3xl font-bold">
              Patient Feedback Form
            </h1>

            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Thank you for choosing our clinic.
              <br />
              We value your feedback and use it to improve our services,
              patient care and overall experience.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-6 sm:px-8">
            {/* SECTION 1 */}
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">1. Your Visit</h2>
              </div>

              <div>
                <p className="font-medium">
                  How would you rate your overall experience at the clinic?
                </p>

                <RatingGroup
                  value={overallRating}
                  onChange={setOverallRating}
                />
              </div>

              <div>
                <p className="font-medium">
                  How would you rate cleanliness and comfort?
                </p>

                <RatingGroup
                  value={cleanlinessRating}
                  onChange={setCleanlinessRating}
                />
              </div>
            </section>

            <div className="my-8 border-t" />

            {/* SECTION 2 */}
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">
                  2. Reception &amp; Staff
                </h2>
              </div>

              <div>
                <p className="font-medium">
                  How would you rate the attitude/professionalism of
                  front-desk staff?
                </p>

                <RatingGroup
                  value={frontDeskRating}
                  onChange={setFrontDeskRating}
                />
              </div>

              <div>
                <p className="font-medium">
                  Were you attended to within reasonable time?
                </p>

                <TextOptionGroup
                  name="attended-time"
                  value={attendedReasonableTime}
                  onChange={setAttendedReasonableTime}
                  options={yesNoSomewhatOptions}
                />
              </div>
            </section>

            <div className="my-8 border-t" />

            {/* SECTION 3 */}
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">
                  3. Doctor / Optometrist
                </h2>
              </div>

              <div>
                <p className="font-medium">
                  How would you rate the doctor's professionalism?
                </p>

                <RatingGroup
                  value={doctorProfessionalismRating}
                  onChange={setDoctorProfessionalismRating}
                />
              </div>

              <div>
                <p className="font-medium">
                  How clearly did the doctor explain your eye
                  condition/findings?
                </p>

                <TextOptionGroup
                  name="doctor-clarity"
                  value={doctorExplanationClarity}
                  onChange={setDoctorExplanationClarity}
                  options={clarityOptions}
                />
              </div>

              <div>
                <p className="font-medium">
                  Were your concerns properly listened to and addressed?
                </p>

                <TextOptionGroup
                  name="concerns-addressed"
                  value={concernsAddressed}
                  onChange={setConcernsAddressed}
                  options={yesNoSomewhatOptions}
                />
              </div>
            </section>

            <div className="my-8 border-t" />

            {/* SECTION 4 */}
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">
                  4. Your Prescription
                </h2>
              </div>

              <div>
                <p className="font-medium">
                  How satisfied were you with the explanation of your
                  prescription?
                </p>

                <RatingGroup
                  value={prescriptionExplanationSatisfaction}
                  onChange={setPrescriptionExplanationSatisfaction}
                  options={satisfactionOptions}
                />
              </div>

              <div>
                <p className="font-medium">
                  If you received glasses, how satisfied are you with the
                  vision through your glasses?
                </p>

                <RatingGroup
                  value={glassesVisionSatisfaction}
                  onChange={setGlassesVisionSatisfaction}
                  options={satisfactionOptions}
                />

                <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={glassesVisionNotApplicable}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setGlassesVisionNotApplicable(checked);

                      if (checked) {
                        setGlassesVisionSatisfaction(null);
                      }
                    }}
                  />

                  <span>Not applicable</span>
                </label>
              </div>

              <div>
                <p className="font-medium">
                  Are you experiencing difficulty with your new
                  prescription/glasses?
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <label
                    className={`cursor-pointer rounded-lg border p-3 text-center text-sm transition ${
                      prescriptionDifficulty === false
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="prescription-difficulty"
                      checked={prescriptionDifficulty === false}
                      onChange={() => setPrescriptionDifficulty(false)}
                      className="sr-only"
                    />
                    No
                  </label>

                  <label
                    className={`cursor-pointer rounded-lg border p-3 text-center text-sm transition ${
                      prescriptionDifficulty === true
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="prescription-difficulty"
                      checked={prescriptionDifficulty === true}
                      onChange={() => setPrescriptionDifficulty(true)}
                      className="sr-only"
                    />
                    Yes
                  </label>
                </div>

                {prescriptionDifficulty === true && (
                  <textarea
                    value={prescriptionDifficultyDetails}
                    onChange={(event) =>
                      setPrescriptionDifficultyDetails(event.target.value)
                    }
                    placeholder="If yes, please briefly describe the difficulty..."
                    rows={4}
                    className="mt-3 w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}
              </div>
            </section>

            <div className="my-8 border-t" />

            {/* SECTION 5 */}
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">
                  5. Glasses / Optical Service
                </h2>
              </div>

              <div>
                <p className="font-medium">
                  If you purchased/had lenses fitted, how would you rate the
                  service?
                </p>

                <RatingGroup
                  value={opticalServiceRating}
                  onChange={setOpticalServiceRating}
                />

                <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opticalServiceNotApplicable}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setOpticalServiceNotApplicable(checked);

                      if (checked) {
                        setOpticalServiceRating(null);
                      }
                    }}
                  />

                  <span>Not applicable</span>
                </label>
              </div>

              <div>
                <p className="font-medium">
                  How satisfied are you with the fitting, comfort and
                  appearance?
                </p>

                <RatingGroup
                  value={glassesFittingSatisfaction}
                  onChange={setGlassesFittingSatisfaction}
                  options={satisfactionOptions}
                />

                <label className="mt-3 flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={glassesFittingNotApplicable}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setGlassesFittingNotApplicable(checked);

                      if (checked) {
                        setGlassesFittingSatisfaction(null);
                      }
                    }}
                  />

                  <span>Not applicable</span>
                </label>
              </div>
            </section>

            <div className="my-8 border-t" />

            {/* SECTION 6 */}
            <section className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold">6. Overall</h2>
              </div>

              <div>
                <p className="font-medium">
                  How likely are you to recommend our clinic to someone else?
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  0 = Not at all likely, 10 = Extremely likely
                </p>

                <div className="grid grid-cols-6 sm:grid-cols-11 gap-2 mt-3">
                  {Array.from({ length: 11 }, (_, index) => index).map(
                    (score) => (
                      <label
                        key={score}
                        className={`cursor-pointer rounded-lg border p-2 text-center text-sm font-medium transition ${
                          recommendationScore === score
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <input
                          type="radio"
                          name="recommendation-score"
                          value={score}
                          checked={recommendationScore === score}
                          onChange={() => setRecommendationScore(score)}
                          className="sr-only"
                        />

                        {score}
                      </label>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="font-medium">
                  What did we do well?
                </label>

                <textarea
                  value={whatDidWell}
                  onChange={(event) => setWhatDidWell(event.target.value)}
                  rows={4}
                  placeholder="Tell us what you liked..."
                  className="mt-2 w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="font-medium">
                  What can we improve?
                </label>

                <textarea
                  value={whatCanImprove}
                  onChange={(event) => setWhatCanImprove(event.target.value)}
                  rows={4}
                  placeholder="Tell us how we can improve..."
                  className="mt-2 w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="font-medium">
                  Anything else you would like us to know?
                </label>

                <textarea
                  value={anythingElse}
                  onChange={(event) => setAnythingElse(event.target.value)}
                  rows={4}
                  placeholder="Any additional comments..."
                  className="mt-2 w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </section>

            <div className="my-8 border-t" />

            {/* SECTION 7 */}
            <section className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold">7. Follow-up</h2>
              </div>

              <div>
                <p className="font-medium">
                  Would you like someone from the clinic to contact you?
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <label
                    className={`cursor-pointer rounded-lg border p-3 text-center text-sm transition ${
                      wantsFollowUp === true
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="follow-up"
                      checked={wantsFollowUp === true}
                      onChange={() => setWantsFollowUp(true)}
                      className="sr-only"
                    />
                    Yes
                  </label>

                  <label
                    className={`cursor-pointer rounded-lg border p-3 text-center text-sm transition ${
                      wantsFollowUp === false
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="follow-up"
                      checked={wantsFollowUp === false}
                      onChange={() => setWantsFollowUp(false)}
                      className="sr-only"
                    />
                    No
                  </label>
                </div>
              </div>
            </section>

            {errorMessage && (
              <div className="mt-8 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            <div className="mt-8">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting feedback..." : "Submit Feedback"}
              </button>
            </div>

            <div className="mt-6 text-center text-xs text-muted-foreground">
              Thank you for helping us improve our services and patient care.
              <br />
              <span className="mt-1 inline-block">
                Powered by OptoCare EMR
              </span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
  }
