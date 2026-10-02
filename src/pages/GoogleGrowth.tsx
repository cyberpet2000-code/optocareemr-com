import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardCheck,
  Eye,
  PackageSearch,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OptoCareLogo from "@/components/OptoCareLogo";
import {
  googleGrowthMeasurementConfigured,
  initGoogleGrowthAnalytics,
  trackGoogleGrowthEvent,
  trackGoogleGrowthPageView,
} from "@/lib/googleGrowth";

const features = [
  {
    icon: ClipboardCheck,
    title: "Clinical documentation",
    text: "Capture structured eye-care visits, refraction findings, diagnosis and treatment without turning every encounter into a giant form.",
  },
  {
    icon: CalendarCheck,
    title: "Appointments & recall",
    text: "Keep scheduling, follow-up and recall workflows connected to the patient's care record.",
  },
  {
    icon: PackageSearch,
    title: "Billing & optical workflow",
    text: "Connect billing, inventory and dispensing workflows so staff do not have to duplicate the same information.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    text: "Clinic workflows are separated by role and clinic so staff see the information they need for their work.",
  },
  {
    icon: Smartphone,
    title: "Built for real clinic work",
    text: "Use OptoCare across desktop and mobile layouts, with offline-aware workflows where the product supports them.",
  },
  {
    icon: Eye,
    title: "Designed for eye care",
    text: "OptoCare is shaped around optometry and eye-clinic workflows rather than adapting a generic hospital system.",
  },
];

export default function GoogleGrowth() {
  useEffect(() => {
    initGoogleGrowthAnalytics();
    document.title = "OptoCare-EMR | Intelligent Eye Care Management Platform";

    const description =
      "OptoCare-EMR is an intelligent eye care management platform for eye clinics and optometry practices, connecting clinical documentation, appointments, billing and optical workflows.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", description);

    trackGoogleGrowthPageView("/growth");

    useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "OptoCare-EMR",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Electronic Medical Record",
      operatingSystem: "Web",
      url: "https://optocareemr.com/growth",
      description:
        "Intelligent eye care management platform for eye clinics and optometry practices.",
    });
    document.head.appendChild(script);
    return () => script.remove();
  }, []);

  return () => {
      document.title = "Optocareemr";
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#E5E5E5] text-slate-900">
      <section className="bg-gradient-to-b from-[#0B3150] via-[#155D80] to-[#2A8D9F] text-white">
        <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <OptoCareLogo size="sm" showTagline={false} imgClassName="brightness-0 invert" />
            <Button asChild variant="outline" className="border-white/60 bg-white/10 text-white hover:bg-white/20">
              <Link
                to="/login"
                onClick={() => trackGoogleGrowthEvent("login_cta_click", { placement: "growth_header" })}
              >
                Sign in
              </Link>
            </Button>
          </div>

          <div className="grid gap-10 py-16 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:py-24">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-cyan-100">
                Eye-care practice management
              </p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Intelligent eye care management, built around the way clinics work.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
                OptoCare-EMR connects patient records, clinical documentation, appointments,
                billing, inventory and optical workflows in one platform for eye clinics and
                optometry practices.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-[#0B3150] hover:bg-white/90"
                >
                  <Link
                    to="/signup"
                    onClick={() => trackGoogleGrowthEvent("signup_cta_click", { placement: "growth_hero" })}
                  >
                    Get started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/60 bg-white/10 text-white hover:bg-white/20"
                >
                  <a
                    href="#features"
                    onClick={() => trackGoogleGrowthEvent("features_cta_click")}
                  >
                    Explore features
                  </a>
                </Button>
              </div>
              <p className="mt-4 text-xs text-white/65">
                {googleGrowthMeasurementConfigured
                  ? "Google Analytics tracking is enabled for this growth surface."
                  : "Growth analytics is ready to activate when a Google Analytics measurement ID is configured."}
              </p>
            </div>

            <Card className="border-white/15 bg-white/10 text-white shadow-2xl backdrop-blur">
              <CardHeader>
                <CardTitle className="text-xl">One connected clinic workflow</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-white/85">
                {[
                  ["Patient", "Register and find the patient record."],
                  ["Visit", "Document the eye-care encounter."],
                  ["Plan", "Connect treatment, prescription and follow-up."],
                  ["Bill", "Track private/HMO billing and payments."],
                  ["Dispense", "Move optical items through inventory and dispensing."],
                ].map(([label, text]) => (
                  <div key={label} className="flex gap-3 rounded-xl bg-white/10 p-3">
                    <div className="mt-0.5 h-7 w-7 rounded-full bg-white/15 text-center text-xs font-semibold leading-7">
                      {label.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-white/65">{text}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-700">Why OptoCare</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">A clinic system shaped around eye care</h2>
          <p className="mt-4 text-muted-foreground">
            The growth site should explain the product clearly first, then give visitors a direct path
            into the product rather than hiding the important information behind marketing copy.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <Card key={title} className="border-slate-300 bg-[#C8DFEC]/70">
              <CardHeader>
                <Icon className="h-5 w-5 text-cyan-700" />
                <CardTitle className="text-lg">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-slate-600">{text}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-slate-300 bg-white/50">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="rounded-3xl bg-[#0B3150] p-8 text-white sm:p-10 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-semibold">Ready to see OptoCare in your clinic?</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">
                Start with the product and evaluate the workflow against how your clinic actually operates.
              </p>
            </div>
            <Button asChild className="mt-6 bg-white text-[#0B3150] hover:bg-white/90 lg:mt-0">
              <Link
                to="/signup"
                onClick={() => trackGoogleGrowthEvent("signup_cta_click", { placement: "growth_footer" })}
              >
                Create an account
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
