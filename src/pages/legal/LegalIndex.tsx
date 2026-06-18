import { Link } from "react-router-dom";
import LegalLayout, { LEGAL_PAGES } from "./LegalLayout";
import { ChevronRight } from "lucide-react";

export default function LegalIndex() {
  return (
    <LegalLayout
      title="Legal Center"
      description="Policies, agreements, and disclaimers that govern your use of OptoCare-EMR."
    >
      <p className="text-sm text-muted-foreground">
        Browse the documents below. Written in plain language so clinicians, administrators, and
        patients can understand how we operate.
      </p>
      <ul className="not-prose mt-6 divide-y rounded-lg border bg-card">
        {LEGAL_PAGES.map((p) => (
          <li key={p.to}>
            <Link
              to={p.to}
              className="group flex items-center justify-between px-4 py-3 text-sm hover:bg-accent transition-colors"
            >
              <span className="text-foreground group-hover:text-primary transition-colors">
                {p.label}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </li>
        ))}
      </ul>
    </LegalLayout>
  );
}

