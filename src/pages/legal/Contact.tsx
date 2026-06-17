import LegalLayout from "./LegalLayout";
import { Mail, Globe, Building2 } from "lucide-react";

export default function Contact() {
  return (
    <LegalLayout
      title="Contact Us"
      description="Get in touch with the OptoCare Technologies team."
    >
      <p>
        We're here to help with questions about the platform, your subscription, security, or anything
        else related to OptoCare-EMR.
      </p>

      <div className="not-prose mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Building2 className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">Company</h3>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">OptoCare Technologies</p>
          <p className="mt-1 text-sm text-muted-foreground">Product: OptoCare-EMR</p>
          <p className="mt-1 text-sm italic text-muted-foreground">
            "Intelligent Eye Care Management Platform."
          </p>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">Email</h3>
          </div>
          <a
            href="mailto:support@optocareemr.com"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            support@optocareemr.com
          </a>
        </div>

        <div className="rounded-lg border bg-card p-5 sm:col-span-2">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <h3 className="font-semibold">Website</h3>
          </div>
          <a
            href="https://optocareemr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-primary hover:underline"
          >
            https://optocareemr.com
          </a>
        </div>
      </div>
    </LegalLayout>
  );
}
