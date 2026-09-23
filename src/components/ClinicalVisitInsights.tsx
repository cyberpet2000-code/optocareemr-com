import { Eye, BarChart3, Sparkles } from "lucide-react";

type Props = {
  vaUnaidedOd?: string;
  vaUnaidedOs?: string;
  vaUnaidedOu?: string;
  vaUnaidedOdPh?: string;
  vaUnaidedOsPh?: string;
  vaAidedOd?: string;
  vaAidedOs?: string;
  vaAidedOu?: string;
  vaUnaidedNearOu?: string;
  vaAidedNearOu?: string;
  autoVaOd?: string;
  autoVaOs?: string;
  subVaOd?: string;
  subVaOs?: string;
  subVaOutcome?: string;
  autoOdSphere?: string;
  autoOdCyl?: string;
  autoOsSphere?: string;
  autoOsCyl?: string;
  subOdSphere?: string;
  subOdCyl?: string;
  subOsSphere?: string;
  subOsCyl?: string;
};

const VA_SCORE: Record<string, number> = {
  "6/4": -1, "6/5": 0, "6/6": 1, "6/9": 2, "6/12": 3,
  "6/18": 4, "6/24": 5, "6/36": 6, "6/60": 7, "3/60": 8,
  CF: 9, HM: 10, LP: 11, NLP: 12,
};

function score(v?: string) {
  return VA_SCORE[String(v || "").trim()] ?? null;
}

function lineChange(from?: string, to?: string) {
  const a = score(from), b = score(to);
  if (a === null || b === null) return null;
  return a - b;
}

function num(v?: string) {
  if (!v) return null;
  const n = Number.parseFloat(v.replace(/[^d.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function se(s?: string, c?: string) {
  const sphere = num(s), cyl = num(c);
  return sphere === null ? null : sphere + (cyl ?? 0) / 2;
}

function formatD(v: number | null) {
  if (v === null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)} D`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/70 border px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

export function ClinicalVisitInsights(props: Props) {
  const phOd = lineChange(props.vaUnaidedOd, props.vaUnaidedOdPh);
  const phOs = lineChange(props.vaUnaidedOs, props.vaUnaidedOsPh);
  const rxOd = lineChange(props.vaUnaidedOd, props.subVaOd || props.autoVaOd);
  const rxOs = lineChange(props.vaUnaidedOs, props.subVaOs || props.autoVaOs);

  const seOd = se(props.subOdSphere || props.autoOdSphere, props.subOdCyl || props.autoOdCyl);
  const seOs = se(props.subOsSphere || props.autoOsSphere, props.subOsCyl || props.autoOsCyl);
  const seDiff = seOd !== null && seOs !== null ? Math.abs(seOd - seOs) : null;

  const hasVa = props.vaUnaidedOd || props.vaUnaidedOs || props.vaUnaidedOu;
  const hasRx = props.subOdSphere || props.subOsSphere || props.autoOdSphere || props.autoOsSphere;

  if (!hasVa && !hasRx) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
      {hasVa && (
        <div className="rounded-2xl border bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg bg-primary/10 p-1.5"><Eye size={15} className="text-primary" /></div>
            <div>
              <p className="text-xs font-semibold">VA Analysis</p>
              <p className="text-[10px] text-muted-foreground">Calculated automatically from recorded values</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Metric label="OD pinhole" value={phOd === null ? "—" : `${phOd} line${phOd === 1 ? "" : "s"}`} />
            <Metric label="OS pinhole" value={phOs === null ? "—" : `${phOs} line${phOs === 1 ? "" : "s"}`} />
            <Metric label="OD refraction" value={rxOd === null ? "—" : `${rxOd} line${rxOd === 1 ? "" : "s"}`} />
            <Metric label="OS refraction" value={rxOs === null ? "—" : `${rxOs} line${rxOs === 1 ? "" : "s"}`} />
          </div>
          {(props.vaUnaidedNearOu || props.vaAidedNearOu || props.subVaOutcome) && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Near VA: unaided {props.vaUnaidedNearOu || "—"} · aided {props.vaAidedNearOu || "—"} · subjective {props.subVaOutcome || "—"}
            </p>
          )}
        </div>
      )}

      {hasRx && (
        <div className="rounded-2xl border bg-accent/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg bg-accent/10 p-1.5"><BarChart3 size={15} className="text-accent" /></div>
            <div>
              <p className="text-xs font-semibold">Refraction Analysis</p>
              <p className="text-[10px] text-muted-foreground">Calculated automatically — not a diagnosis</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Metric label="OD spherical equivalent" value={formatD(seOd)} />
            <Metric label="OS spherical equivalent" value={formatD(seOs)} />
            <Metric label="Inter-eye SE difference" value={formatD(seDiff)} />
          </div>
          {seDiff !== null && seDiff >= 1.00 && (
            <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-2">
              <Sparkles size={12} className="text-primary" /> Refractive asymmetry detected — OptoCare AI can consider its clinical significance with age, VA and history.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
