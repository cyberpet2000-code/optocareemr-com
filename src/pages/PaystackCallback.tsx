import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyPaystackTransaction } from "@/lib/paystack";

type State =
  | { status: "checking" }
  | { status: "success"; reference: string; amount?: number | null; currency?: string | null }
  | { status: "failed"; message: string };

export default function PaystackCallback() {
  const [params] = useSearchParams();
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    const reference = params.get("reference")?.trim() || "";
    if (!reference) {
      setState({ status: "failed", message: "No Paystack transaction reference was provided." });
      return;
    }

    let cancelled = false;
    verifyPaystackTransaction(reference)
      .then((result) => {
        if (cancelled) return;
        if (result.status === "success") {
          setState({
            status: "success",
            reference: result.reference || reference,
            amount: result.amount ?? null,
            currency: result.currency || null,
          });
        } else {
          setState({
            status: "failed",
            message: `The payment status is "${result.status || "unknown"}". Please check the transaction before retrying.`,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "failed",
            message: error instanceof Error ? error.message : "Unable to verify the Paystack transaction.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main className="min-h-screen bg-[#E5E5E5] px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {state.status === "checking" && <Loader2 className="h-5 w-5 animate-spin" />}
              {state.status === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              {state.status === "failed" && <XCircle className="h-5 w-5 text-destructive" />}
              Paystack payment result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.status === "checking" && (
              <p className="text-sm text-muted-foreground">Verifying the transaction with Paystack...</p>
            )}

            {state.status === "success" && (
              <>
                <p className="text-sm">Payment verified successfully.</p>
                <div className="rounded-xl bg-muted p-4 text-sm">
                  <div><strong>Reference:</strong> {state.reference}</div>
                  {typeof state.amount === "number" && (
                    <div><strong>Amount:</strong> {(state.amount / 100).toLocaleString()} {state.currency || "NGN"}</div>
                  )}
                </div>
                <Button asChild className="w-full">
                  <Link to="/dashboard">Continue to OptoCare</Link>
                </Button>
              </>
            )}

            {state.status === "failed" && (
              <>
                <p className="text-sm text-destructive">{state.message}</p>
                <div className="flex gap-3">
                  <Button asChild variant="outline" className="flex-1">
                    <Link to="/dashboard">Back to OptoCare</Link>
                  </Button>
                  <Button asChild className="flex-1">
                    <Link to="/paystack-test">Try again</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
