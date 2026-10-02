import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  Glasses,
  LayoutDashboard,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import OptoCareLogo from "@/components/OptoCareLogo";
import { trackGoogleGrowthEvent } from "@/lib/googleGrowth";

type DemoView = "overview" | "patients" | "visit" | "billing";

type DemoPatient = {
  id: string;
  name: string;
  age: number;
  phone: string;
  lastVisit: string;
  status: "Private" | "HMO";
  diagnosis: string;
  va: string;
  prescription: string;
};

const patients: DemoPatient[] = [
  {
    id: "OC-1048",
    name: "Amara Okafor",
    age: 34,
    phone: "0803 000 1048",
    lastVisit: "Oct 2, 2026",
    status: "Private",
    diagnosis: "Myopia with astigmatism",
    va: "6/6 OU",
    prescription: "-2.00 / -0.75 × 180",
  },
  {
    id: "OC-1039",
    name: "Daniel Eze",
    age: 47,
    phone: "0806 000 1039",
    lastVisit: "Sep 29, 2026",
    status: "HMO",
    diagnosis: "Presbyopia",
    va: "6/9 OU",
    prescription: "+1.50 Add",
  },
  {
    id: "OC-1021",
    name: "Ngozi Williams",
    age: 29,
    phone: "0810 000 1021",
    lastVisit: "Sep 26, 2026",
    status: "Private",
    diagnosis: "Digital eye strain",
    va: "6/6 OU",
    prescription: "Plano / Near add",
  },
];

const navigation: { id: DemoView; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "patients", label: "Patients", icon: Users },
  { id: "visit", label: "Visit", icon: Stethoscope },
  { id: "billing", label: "Billing", icon: CreditCard },
];

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="border-slate-300 bg-[#C8DFEC]/70 shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-xl bg-white/70 p-2.5 text-[#155D80]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-[#0B3150]">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OptoCareDemo() {
  const [view, setView] = useState<DemoView>("overview");
  const [selectedPatient, setSelectedPatient] = useState<DemoPatient>(patients[0]);
  const [query, setQuery] = useState("");
  const [visitCompleted, setVisitCompleted] = useState(false);
  const [paymentRecorded, setPaymentRecorded] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const filteredPatients = useMemo(
    () =>
      patients.filter((patient) =>
        `${patient.name} ${patient.id} ${patient.phone}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );

  const go = (next: DemoView) => {
    setView(next);
    setMobileNavOpen(false);
    trackGoogleGrowthEvent("demo_navigation", { from: view, to: next });
  };

  return (
    <main className="min-h-screen bg-[#E5E5E5] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-300 bg-white/90 backdrop-blur-xl">
        <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:px-6">
          <Button size="icon" variant="outline" className="lg:hidden shrink-0" onClick={() => setMobileNavOpen((open) => !open)} aria-label="Toggle demo navigation"><Menu className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold text-[#0B3150] sm:text-xl">Cedar Demo Clinic</h1>
              <span className="hidden items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 sm:inline-flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" /> Active</span>
            </div>
            <div className="hidden text-[10px] leading-tight text-slate-400 sm:block">OptoCare EMR · Doctor</div>
          </div>
          <div className="hidden w-64 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 xl:flex">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder="Search patients, visits, invoices…" aria-label="Demo global search" />
          </div>
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications"><Bell className="h-4 w-4" /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" /></Button>
          <Badge variant="outline" className="hidden sm:inline-flex bg-cyan-50 text-cyan-700">Doctor</Badge>
          <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#C8DFEC] text-xs font-semibold text-[#155D80]">DK</div>
            <div className="hidden leading-tight lg:block"><div className="text-xs font-medium">Dr. Kalu</div><div className="text-[10px] text-slate-400">Doctor</div></div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Demo logout"><LogOut className="h-4 w-4" /></Button>
        </div>
        <div className="border-t border-slate-200 bg-emerald-50/70 px-3 py-1 sm:px-6">
          <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700 sm:text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> ACTIVE CLINIC: <span className="uppercase tracking-wide">CEDAR DEMO CLINIC</span><span className="ml-auto text-[9px] font-normal text-emerald-600">Demo environment</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {mobileNavOpen && (
          <button
            className="fixed inset-0 z-20 bg-slate-900/20 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        <aside
          className={[
            "fixed inset-y-[61px] left-0 z-30 w-64 border-r border-slate-300 bg-[#DCEAF2] p-4 transition-transform lg:static lg:translate-x-0",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          ].join(" ")}
        >
          <div className="rounded-2xl bg-white/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cedar Demo Clinic</p>
            <p className="mt-1 font-semibold text-[#0B3150]">Dr. Kalu • Optometrist</p>
          </div>

          <nav className="mt-5 space-y-1">
            {navigation.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => go(id)}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition",
                  view === id
                    ? "bg-[#0B3150] text-white shadow-sm"
                    : "text-slate-700 hover:bg-white/70",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-6 rounded-2xl border border-slate-300 bg-white/70 p-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Demo environment
            </div>
            <p className="mt-2 leading-5">
              Actions here are simulated in your browser and do not save to the OptoCare database.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl pb-16 md:pb-0">
            <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">
                  {view === "overview" ? "Good morning, Dr. Kalu" : "OptoCare-EMR Demo"}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#0B3150] sm:text-3xl">
                  {view === "overview" && "Clinic at a glance"}
                  {view === "patients" && "Patient records"}
                  {view === "visit" && "Fast clinical documentation"}
                  {view === "billing" && "Billing & payment"}
                </h1>
              </div>
              <Button
                variant="outline"
                onClick={() => go("overview")}
                className="w-full sm:w-auto"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Button>
            </div>

            {view === "overview" && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard icon={Users} label="Patients today" value="12" detail="+3 from yesterday" />
                  <StatCard icon={CalendarDays} label="Appointments" value="8" detail="2 still waiting" />
                  <StatCard icon={CreditCard} label="Revenue" value="₦186,500" detail="Today • demo values" />
                  <StatCard icon={Package} label="Optical items" value="94" detail="Inventory units available" />
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
                  <Card className="border-slate-300 bg-white/80">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-[#0B3150]">Today's clinic flow</CardTitle>
                      <Badge variant="outline">Live demo</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        ["08:45", "Amara Okafor", "Visit completed", "Private"],
                        ["09:30", "Daniel Eze", "Waiting for doctor", "HMO"],
                        ["10:15", "Ngozi Williams", "Appointment confirmed", "Private"],
                      ].map(([time, name, status, type]) => (
                        <div key={`${time}-${name}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-[#F7FAFC] p-3 sm:flex-row sm:items-center">
                          <div className="w-14 text-sm font-semibold text-slate-500">{time}</div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{name}</p>
                            <p className="text-xs text-slate-500">{status}</p>
                          </div>
                          <Badge variant="outline">{type}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-slate-300 bg-[#C8DFEC]/50">
                    <CardHeader>
                      <CardTitle className="text-lg text-[#0B3150]">Explore the workflow</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button className="w-full justify-between bg-[#0B3150] hover:bg-[#0B3150]/90" onClick={() => go("patients")}>
                        Open patient list
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" className="w-full justify-between" onClick={() => go("visit")}>
                        Start a sample visit
                        <Stethoscope className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" className="w-full justify-between" onClick={() => go("billing")}>
                        Open sample billing
                        <CreditCard className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-slate-300 bg-white/80">
                  <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Eye className="h-5 w-5 text-cyan-700" />
                        <p className="font-semibold text-[#0B3150]">Built around eye-care workflows</p>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        Move from patient registration to examination, treatment, dispensing and payment without
                        forcing the clinician to work through a generic hospital form.
                      </p>
                    </div>
                    <Button onClick={() => go("visit")}>See the clinical flow</Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {view === "patients" && (
              <div className="space-y-5">
                <Card className="border-slate-300 bg-white/80">
                  <CardContent className="p-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        className="pl-9"
                        placeholder="Search patient name, ID or phone"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4">
                  {filteredPatients.map((patient) => (
                    <Card key={patient.id} className="border-slate-300 bg-white/80">
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="rounded-full bg-[#C8DFEC] p-3">
                              <UserRound className="h-5 w-5 text-[#155D80]" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#0B3150]">{patient.name}</p>
                              <p className="text-xs text-slate-500">{patient.id} • {patient.age} years • {patient.phone}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant="outline">{patient.status}</Badge>
                            <Badge variant="outline">{patient.lastVisit}</Badge>
                          </div>
                          <Button
                            onClick={() => {
                              setSelectedPatient(patient);
                              go("visit");
                            }}
                          >
                            Open record
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {filteredPatients.length === 0 && (
                    <Card className="border-slate-300 bg-white/80">
                      <CardContent className="p-8 text-center text-sm text-slate-500">
                        No demo patients match your search.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            )}

            {view === "visit" && (
              <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
                <Card className="border-slate-300 bg-[#C8DFEC]/60">
                  <CardHeader>
                    <CardTitle className="text-lg text-[#0B3150]">Patient</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-lg font-semibold text-[#0B3150]">{selectedPatient.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{selectedPatient.id} • {selectedPatient.age} years</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">VA</p>
                        <p className="mt-1 font-semibold">{selectedPatient.va}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">Last diagnosis</p>
                        <p className="mt-1 font-semibold">{selectedPatient.diagnosis}</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => go("patients")}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Choose another patient
                    </Button>
                  </CardContent>
                </Card>

                <div className="space-y-5">
                  <Card className="border-slate-300 bg-white/80">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-[#0B3150]">Examination</CardTitle>
                      {visitCompleted ? (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Completed
                        </Badge>
                      ) : (
                        <Badge variant="outline">In progress</Badge>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          ["VA", "OD 6/6", "OS 6/6"],
                          ["IOP", "OD 14", "OS 14"],
                          ["Refraction", selectedPatient.prescription, "Balance acceptable"],
                        ].map(([label, left, right]) => (
                          <div key={label} className="rounded-xl border border-slate-200 bg-[#F7FAFC] p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                            <p className="mt-2 text-sm font-semibold">{left}</p>
                            <p className="text-xs text-slate-500">{right}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-xl bg-[#EDF6FA] p-4">
                        <div className="flex items-start gap-3">
                          <ClipboardList className="mt-0.5 h-4 w-4 text-cyan-700" />
                          <div>
                            <p className="font-medium text-[#0B3150]">Assessment</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                              {selectedPatient.diagnosis}. Demo clinician note: stable findings, spectacle prescription updated.
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-300 bg-white/80">
                    <CardHeader>
                      <CardTitle className="text-lg text-[#0B3150]">Treatment plan</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {[
                          "Prescription spectacle recommended",
                          "Lens options explained",
                          "Review in 12 months",
                        ].map((item, index) => (
                          <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-[#F7FAFC] p-3 text-sm">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C8DFEC] text-xs font-semibold text-[#155D80]">
                              {index + 1}
                            </span>
                            {item}
                          </div>
                        ))}
                      </div>
                      <Button
                        className="mt-4 w-full bg-[#0B3150] hover:bg-[#0B3150]/90"
                        onClick={() => setVisitCompleted(true)}
                        disabled={visitCompleted}
                      >
                        {visitCompleted ? "Visit completed" : "Complete sample visit"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {view === "billing" && (
              <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
                <Card className="border-slate-300 bg-white/80">
                  <CardHeader>
                    <CardTitle className="text-lg text-[#0B3150]">Sample invoice</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      ["Consultation", "₦8,000"],
                      ["Single vision lenses", "₦35,000"],
                      ["Frame", "₦25,000"],
                    ].map(([item, amount]) => (
                      <div key={item} className="flex items-center justify-between rounded-xl bg-[#F7FAFC] p-3 text-sm">
                        <span>{item}</span>
                        <span className="font-semibold">{amount}</span>
                      </div>
                    ))}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4 font-semibold text-[#0B3150]">
                      <span>Total</span>
                      <span>₦68,000</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-300 bg-[#C8DFEC]/60">
                  <CardHeader>
                    <CardTitle className="text-lg text-[#0B3150]">Payment</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl bg-white/80 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Patient</p>
                      <p className="mt-1 font-semibold">{selectedPatient.name}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">Billing type</p>
                        <p className="mt-1 font-semibold">{selectedPatient.status}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">Outstanding</p>
                        <p className="mt-1 font-semibold">₦68,000</p>
                      </div>
                    </div>
                    <Button
                      className="w-full bg-[#0B3150] hover:bg-[#0B3150]/90"
                      onClick={() => setPaymentRecorded(true)}
                      disabled={paymentRecorded}
                    >
                      {paymentRecorded ? (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Payment recorded
                        </>
                      ) : (
                        <>
                          <CreditCard className="mr-2 h-4 w-4" /> Record sample payment
                        </>
                      )}
                    </Button>
                    <p className="text-center text-xs text-slate-500">
                      Demo only — no money is charged and no payment gateway is contacted.
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </section>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-300 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur md:hidden">
        <div className="flex items-center justify-around">
          {navigation.slice(0, 5).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => go(id)} className={["flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium", view === id ? "text-[#0B3150]" : "text-slate-500"].join(" ")}>
              <Icon className="h-4 w-4" /><span>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
