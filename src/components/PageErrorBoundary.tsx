import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { reportIncident } from "@/lib/diag/incidentReporter";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  pageName: string;
}

interface State {
  hasError: boolean;
}

export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    void reportIncident({
      page_name: this.props.pageName,
      error_name: error instanceof Error ? error.name : "RuntimeError",
      error_message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      source: "page-boundary",
      severity: "error",
      context: { route: window.location.pathname },
    });
    console.error("[OptoCare] Page runtime error", {
      page: this.props.pageName,
      path: window.location.pathname,
      error,
      info,
      timestamp: new Date().toISOString(),
    });
  }

  handleRetry = () => {
    try {
      window.location.reload();
    } catch {
      window.location.href = window.location.pathname;
    }
  };

  handleSafeNavigation = () => {
    window.location.href = "/dashboard";
  };

  handleSystemHealth = () => {
    window.location.href = "/super-admin/system-health";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-[60vh] w-full flex items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-xl rounded-3xl border border-[#D4E6EC] bg-[#F8FCFD] p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF4E5] text-[#A66A00]">
            <AlertTriangle className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-[#4E8EA2]">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Your clinic records are safe
          </div>
          <h1 className="text-xl font-bold text-[#001D39] sm:text-2xl">
            This page needs a moment to recover
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#36566D] sm:text-base">
            We couldn’t load the {this.props.pageName} page right now.
            This is a temporary application issue and does not mean your clinic records have been deleted or lost.
          </p>
          <div className="mt-5 rounded-2xl border border-[#D7E8EE] bg-[#EEF8FB] p-4 text-left">
            <p className="text-sm font-semibold text-[#001D39]">What you can do</p>
            <p className="mt-1 text-xs leading-5 text-[#4A6578] sm:text-sm">
              Try the page again. If the problem continues, you can use the other OptoCare pages from the navigation while we troubleshoot this page.
            </p>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              onClick={this.handleRetry}
              className="h-11 w-full bg-[#0A4174] text-white hover:bg-[#001D39]"
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Reload {this.props.pageName}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={this.handleSafeNavigation}
              className="h-11 w-full"
            >
              Continue to Dashboard
            </Button>
          </div>
          {typeof window !== "undefined" &&
            window.location.pathname.startsWith("/super-admin") &&
            window.location.pathname !== "/super-admin/system-health" && (
              <Button
                type="button"
                variant="outline"
                onClick={this.handleSystemHealth}
                className="mt-2 h-11 w-full border-[#B8D7E3] text-[#0A4174]"
              >
                Open Super Admin System Health
              </Button>
            )}
          {typeof window !== "undefined" &&
            window.location.pathname === "/super-admin/system-health" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => { window.location.href = "/super-admin"; }}
                className="mt-2 h-11 w-full border-[#B8D7E3] text-[#0A4174]"
              >
                Back to Super Admin
              </Button>
            )}
          <p className="mt-4 text-xs text-[#6A7F8E]">
            If this keeps happening, please contact OptoCare Support and tell us which page was affected.
          </p>
        </div>
      </div>
    );
  }
}
