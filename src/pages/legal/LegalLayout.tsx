import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import OptoCareLogo from "@/components/OptoCareLogo";
import ThemeToggle from "@/components/ThemeToggle";
import { Printer } from "lucide-react";

export const LEGAL_PAGES = [
  { to: "/legal/terms", label: "Terms & Conditions" },
  { to: "/legal/privacy", label: "Privacy Policy" },
  { to: "/legal/cookies", label: "Cookie Policy" },
  { to: "/legal/dpa", label: "Data Processing Agreement" },
  { to: "/legal/security", label: "Security Policy" },
  { to: "/legal/compliance", label: "HIPAA/GDPR Disclaimer" },
  { to: "/legal/medical-disclaimer", label: "Medical Disclaimer" },
  { to: "/legal/contact", label: "Contact" },
];

export const LAST_UPDATED = "June 17, 2026";

interface Props {
  title: string;
  description?: string;
  lastUpdated?: string;
  children: ReactNode;
}

export default function LegalLayout({ title, description, lastUpdated = LAST_UPDATED, children }: Props) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .legal-prose { max-width: 100% !important; }
          body { background: white !important; }
        }
      `}</style>

      {/* Header */}
      <header className="no-print sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <OptoCareLogo size="sm" />
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors"
              aria-label="Print page"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <ThemeToggle />
            <Link
              to="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b bg-gradient-brand-soft">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <nav className="no-print mb-4 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <span className="mx-2">/</span>
            <Link to="/legal" className="hover:text-foreground">Legal</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{title}</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-4 max-w-2xl text-base md:text-lg text-muted-foreground">{description}</p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>
      </section>

      {/* Body with sidebar */}
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          {/* Sidebar nav */}
          <aside className="no-print lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Legal Documents
              </h2>
              <ul className="space-y-1">
                {LEGAL_PAGES.map((p) => {
                  const active = location.pathname === p.to;
                  return (
                    <li key={p.to}>
                      <Link
                        to={p.to}
                        className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {p.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          {/* Content */}
          <main className="legal-prose max-w-3xl">
            <article className="legal-article max-w-none text-foreground/90 leading-relaxed
              [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:text-foreground
              [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-foreground
              [&_p]:my-4
              [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2
              [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2
              [&_strong]:text-foreground [&_strong]:font-semibold
              [&_a]:text-primary hover:[&_a]:underline">
              {children}
            </article>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="no-print border-t bg-card/50">
        <div className="container mx-auto px-4 py-10">
          <div className="grid gap-8 md:grid-cols-3">
            <div>
              <OptoCareLogo size="sm" />
              <p className="mt-3 text-sm text-muted-foreground max-w-xs">
                Intelligent Eye Care Management Platform.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Legal</h3>
              <ul className="space-y-2 text-sm">
                {LEGAL_PAGES.slice(0, 4).map((p) => (
                  <li key={p.to}>
                    <Link to={p.to} className="text-muted-foreground hover:text-foreground">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">More</h3>
              <ul className="space-y-2 text-sm">
                {LEGAL_PAGES.slice(4).map((p) => (
                  <li key={p.to}>
                    <Link to={p.to} className="text-muted-foreground hover:text-foreground">
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-8 border-t pt-6 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} OptoCare Technologies. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
