import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, WifiOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportIncident } from "@/lib/diag/incidentReporter";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : undefined,
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    void reportIncident({
      error_name: error instanceof Error ? error.name : "ApplicationRuntimeError",
      error_message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      source: "app-boundary",
      severity: "critical",
      route: window.location.pathname,
      context: { componentStack: info.componentStack || null },
    });
    console.error("[OptoCare] Application runtime error", error, info);
  }

  handleRetry = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = window.location.pathname || "/";
    }
  };

  handleDashboard = () => {
    window.location.href = "/dashboard";
  };

  handleSystemHealth = () => {
    window.location.href = "/super-admin/system-health";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen w-full bg-[#F0F8FA] flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-lg rounded-3xl border border-[#D4E6EC] bg-[#F8FCFD] shadow-xl p-7 sm:p-9 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E0F2F7] text-[#0A4174]">
            <RefreshCw className="h-8 w-8" aria-hidden="true" />
          </div>

          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#4E8EA2] mb-3">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            OptoCare is protecting your clinic workflow
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-[#001D39]">
            We’re getting things back on track
          </h1>

          <p className="mt-3 text-sm sm:text-base leading-6 text-[#36566D]">
            OptoCare encountered a temporary application problem while loading.
            This does not mean your clinic records have been deleted or lost.
          </p>

          <div className="mt-6 rounded-2xl border border-[#D7E8EE] bg-[#EEF8FB] p-4 text-left">
            <div className="flex gap-3">
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-[#49769F]" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-[#001D39]">
                  Please try again
                </p>
                <p className="mt-1 text-xs sm:text-sm leading-5 text-[#4A6578]">
                  A refresh will reconnect OptoCare and reload the clinic workspace.
                  If you were working offline, wait for your connection to return and try again.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={this.handleRetry}
              className="w-full h-11 bg-[#0A4174] hover:bg-[#001D39] text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Try Again
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={this.handleDashboard}
              className="w-full h-11"
            >
              Continue to Dashboard
            </Button>
          </div>

          {typeof window !== "undefined" &&
            window.location.pathname.startsWith("/super-admin") && (
              <Button
                type="button"
                variant="outline"
                onClick={this.handleSystemHealth}
                className="mt-2 w-full h-11 border-[#B8D7E3] text-[#0A4174]"
              >
                Open Super Admin System Health
              </Button>
            )}

          <p className="mt-4 text-xs text-[#6A7F8E]">
            If this continues, please contact OptoCare Support. We’ll help you restore access to your workspace.
          </p>


        </div>
      </div>
    );
  }
}
