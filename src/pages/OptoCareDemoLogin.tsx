import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import OptoCareLogo from "@/components/OptoCareLogo";
import { trackGoogleGrowthEvent } from "@/lib/googleGrowth";

export default function OptoCareDemoLogin() {
  const [email, setEmail] = useState("doctor@cedardemo.example");
  const [password, setPassword] = useState("demo");
  const [showDemo, setShowDemo] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    trackGoogleGrowthEvent("demo_login", { method: "simulated" });
    window.location.href = "/demo";
  };

  return (
    <main className="min-h-screen bg-[#E5E5E5] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">
        <section className="w-full overflow-hidden rounded-3xl border border-slate-300 bg-white shadow-xl">
          <div className="bg-[linear-gradient(180deg,#7bbde8_0%,#dceaf2_100%)] px-6 pb-8 pt-9 text-center sm:px-8">
            <OptoCareLogo className="mx-auto h-12 w-auto" />
            <h1 className="mt-5 text-2xl font-bold text-[#0B3150]">OptoCare EMR Demo</h1>
            <p className="mt-1 text-sm text-[#155D80]">Intelligent eye care management platform</p>
          </div>

          <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
            <div>
              <h2 className="text-lg font-semibold text-[#0B3150]">Sign in to the demo</h2>
              <p className="mt-1 text-xs text-slate-500">This is a simulated login. No account is created and no password is transmitted.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="demo-email" className="text-xs font-medium">Email</label>
              <Input id="demo-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>

            <div className="space-y-2">
              <label htmlFor="demo-password" className="text-xs font-medium">Password</label>
              <Input id="demo-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </div>

            <Button type="submit" className="h-11 w-full bg-[#0B3150] hover:bg-[#0B3150]/90">
              Enter demo workspace <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <button type="button" onClick={() => setShowDemo((value) => !value)} className="mx-auto flex items-center gap-1 text-xs font-medium text-[#155D80] underline underline-offset-2">
              {showDemo ? "Hide" : "Show"} demo credentials
            </button>

            {showDemo && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900">
                <div><strong>Email:</strong> doctor@cedardemo.example</div>
                <div><strong>Password:</strong> demo</div>
              </div>
            )}

            <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Fictional demo data only. Production clinic records, Supabase authentication, payments and patient information are not connected.</span>
            </div>

            <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
              <LockKeyhole className="h-3 w-3" /> Demo interface — replaceable independently from production login
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
