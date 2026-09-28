import LegalLayout from "./LegalLayout";
import { Mail, Globe, Building2 } from "lucide-react";

export default function Contact() {
  return (
    <LegalLayout title="Contact & Legal Notices" description="Support, privacy, security and legal contact information for OptoCare-EMR.">
      <p><strong>OptoCare Technologies</strong></p>
      <p><strong>Legal entity:</strong> [LEGAL ENTITY TYPE — PENDING CAC REGISTRATION]</p>
      <p><strong>CAC registration number:</strong> [TO BE INSERTED]</p>
      <p><strong>Registered office:</strong> [TO BE INSERTED]</p>
      <p><strong>Product:</strong> OptoCare-EMR</p>
      <p>Corporate details above will be replaced with the exact CAC record before final production legal publication.</p>
      <div className="not-prose mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-card p-5"><div className="flex items-center gap-3"><Building2 className="h-5 w-5 text-primary" /><h3 className="font-semibold">Company</h3></div><p className="mt-3 text-sm text-muted-foreground">OptoCare Technologies</p></div>
        <div className="rounded-lg border bg-card p-5"><div className="flex items-center gap-3"><Mail className="h-5 w-5 text-primary" /><h3 className="font-semibold">Legal & Privacy Email</h3></div><a href="mailto:support@optocareemr.com" className="mt-3 inline-block text-sm text-primary hover:underline">support@optocareemr.com</a></div>
        <div className="rounded-lg border bg-card p-5 sm:col-span-2"><div className="flex items-center gap-3"><Globe className="h-5 w-5 text-primary" /><h3 className="font-semibold">Website</h3></div><a href="https://optocareemr.com" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-primary hover:underline">https://optocareemr.com</a></div>
      </div>
    </LegalLayout>
  );
}
