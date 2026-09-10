import { useParams } from "react-router-dom";

export default function PatientFeedback() {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">
            Patient Feedback Form
          </h1>

          <p className="mt-3 text-sm text-muted-foreground">
            Thank you for choosing our clinic.
          </p>

          <p className="mt-1 text-sm text-muted-foreground">
            We value your feedback and use it to improve our services,
            patient care and overall experience.
          </p>

          <div className="mt-6 rounded-lg bg-muted/50 p-4">
            <p className="text-xs text-muted-foreground">
              Feedback reference
            </p>

            <p className="mt-1 text-sm font-medium">
              {token || "Invalid feedback link"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
