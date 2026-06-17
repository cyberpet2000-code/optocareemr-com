import { Link } from "react-router-dom";
import LegalLayout, { LEGAL_PAGES } from "./LegalLayout";
import { FileText } from "lucide-react";

export default function LegalIndex() {
  return (
    <LegalLayout
      title="Legal Center"
      description="Transparency on how OptoCare-EMR operates, protects clinical data, and serves the eye care community."
    >
      <p>
        Welcome to the OptoCare-EMR Legal Center. Below you'll find all the policies, agreements, and
        disclaimers that govern your use of our platform. These documents are written in plain language
        so clinicians, administrators, and patients can understand exactly how we operate.
      </p>
      <div className="not-prose mt-8 grid gap-4 sm:grid-cols-2">
        {LEGAL_PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            className="group flex items-start gap-3 rounded-lg border bg-card p-5 hover:border-primary hover:shadow-card transition-all"
          >
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                {p.label}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">View document →</p>
            </div>
          </Link>
        ))}
      </div>
    </LegalLayout>
  );
}
