import { Wifi, WifiOff, ServerCrash, RefreshCw, Activity } from "lucide-react";
import { useOffline } from "@/hooks/useOffline";

export default function ConnectionStatusBanner() {
  const { isOffline, networkQuality, diagnosis } = useOffline();

  if (isOffline || networkQuality === "slow") {
    const slow = networkQuality === "slow" && !isOffline;
    return (
      <div className="bg-warning/10 text-warning border-b border-warning/20 px-3 lg:px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-medium text-center">
          {slow ? <Wifi size={15} /> : <WifiOff size={15} />}
          <span>
            {slow
              ? "Your internet connection is poor or slow. OptoCare is still working, but some actions may take longer."
              : "Your internet connection is unavailable. OptoCare is in Offline Mode and saved changes will sync when internet returns."}
          </span>
        </div>
      </div>
    );
  }

  if (networkQuality === "unstable" || diagnosis?.code === "AUTH_SERVICE" || diagnosis?.code === "DATABASE_SERVICE" || diagnosis?.code === "EDGE_FUNCTION") {
    const message =
      diagnosis?.code === "AUTH_SERVICE"
        ? "OptoCare sign-in service is having a problem. Your internet connection is available."
        : diagnosis?.code === "DATABASE_SERVICE"
          ? "OptoCare database service is having a problem. Your internet connection is available and your records are safe."
          : diagnosis?.code === "EDGE_FUNCTION"
            ? "An OptoCare background service is having a problem. Your internet connection is available."
            : "OptoCare services are experiencing an intermittent problem. Your internet connection appears to be available.";

    return (
      <div className="bg-destructive/10 text-destructive border-b border-destructive/20 px-3 lg:px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-xs font-medium text-center">
          <ServerCrash size={15} />
          <span>{message}</span>
        </div>
      </div>
    );
  }

  return null;
}
