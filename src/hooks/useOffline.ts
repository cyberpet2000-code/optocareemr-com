import { useEffect, useState } from "react";
import { diagnoseConnection, type ConnectionDiagnosis } from "@/lib/diag/connectionDiagnosis";

export type NetworkQuality = "connected" | "slow" | "unstable" | "offline" | "unknown";

function qualityFromDiagnosis(d: ConnectionDiagnosis): NetworkQuality {
  if (d.code === "NO_NETWORK" || d.code === "NO_INTERNET" || d.code === "OFFLINE_MODE") return "offline";
  if (d.code === "SLOW_NETWORK" || (d.latencyMs ?? 0) >= 2000) return "slow";
  if (d.code !== "UNKNOWN" && d.application === "online" && (d.authentication === "degraded" || d.database === "degraded" || d.edgeFunctions === "degraded")) return "unstable";
  return "connected";
}

export function useOffline() {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "unknown"
  );
  const [diagnosis, setDiagnosis] = useState<ConnectionDiagnosis | null>(null);

  useEffect(() => {
    let cancelled = false;
    let probeTimer: number | undefined;
    let failureStreak = 0;

    const apply = (d: ConnectionDiagnosis) => {
      if (cancelled) return;
      const quality = qualityFromDiagnosis(d);
      if (quality === "offline" || quality === "slow" || quality === "unstable") failureStreak += 1;
      else failureStreak = 0;

      setDiagnosis(d);
      setNetworkQuality(quality);
      setIsOffline(quality === "offline");

      // Avoid flipping the UI on one transient failed request.
      if (quality === "unstable" && failureStreak < 2) {
        setNetworkQuality("connected");
      }
    };

    const probe = async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setIsOffline(true);
        setNetworkQuality("offline");
        return;
      }
      apply(await diagnoseConnection());
      probeTimer = window.setTimeout(probe, networkQuality === "slow" ? 15000 : 30000);
    };

    const onOnline = () => { void probe(); };
    const onOffline = () => {
      failureStreak = 0;
      setIsOffline(true);
      setNetworkQuality("offline");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void probe();

    return () => {
      cancelled = true;
      if (probeTimer) window.clearTimeout(probeTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { isOffline, networkQuality, diagnosis };
}
