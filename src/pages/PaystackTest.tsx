import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initializePaystackCheckout } from "@/lib/paystack";

export default function PaystackTest() {
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("starter_monthly");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function startPayment() {
    setWorking(true);
    setMessage("");
    try {
      const result = await initializePaystackCheckout({
        email,
        plan: plan || undefined,
      });

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      window.location.assign(result.authorization_url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start payment.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#E5E5E5] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              OptoCare Paystack Lab
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Isolated test surface. This page is intended for the Paystack implementation project only.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <Label htmlFor="paystack-email">Customer email</Label>
              <Input id="paystack-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="paystack-plan">OptoCare plan</Label>
              <select id="paystack-plan" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="starter_monthly">Starter — ₦10,000/month</option>
                <option value="starter_annual">Starter — ₦100,000/year</option>
                <option value="professional_monthly">Professional — ₦18,000/month</option>
                <option value="professional_annual">Professional — ₦180,000/year</option>
                <option value="clinic_monthly">Clinic — ₦30,000/month</option>
                <option value="clinic_annual">Clinic — ₦300,000/year</option>
              </select>
            </div>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <Button className="w-full" onClick={startPayment} disabled={working}>
              {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue to Paystack
            </Button>
            <p className="text-xs text-muted-foreground">
              Never place a Paystack secret key in Vite client code. Transaction initialization belongs on the server.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
