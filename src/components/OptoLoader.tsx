import { cn } from "@/lib/utils";

type SizeName = "sm" | "md" | "lg";

interface Props {
  /** Either a preset (sm|md|lg) or a custom pixel size. */
  size?: SizeName | number;
  /** Optional caption shown beneath the loader. */
  loadingText?: string;
  /** Backwards-compatible alias of loadingText. */
  label?: string;
  className?: string;
  fullscreen?: boolean;
  clinicName?: string;
}

const SIZE_MAP: Record<SizeName, number> = { sm: 28, md: 48, lg: 72 };

/**
 * OptoCare branded loader.
 * - Eye (the "O") is stationary.
 * - A thin ring rotates continuously around the eye (1.2s linear infinite).
 * - No pulse, no bounce, no scale.
 */
export default function OptoLoader({
  size = "lg",
  loadingText,
  label,
  clinicName,
  className,
  fullscreen,
}: Props) {
  const px = typeof size === "number" ? size : SIZE_MAP[size];
  const stroke = Math.max(2, Math.round(px / 24));
  const ringR = px / 2 - stroke-2;
  const eyeR = px * 0.34;
  const pupilR = px * 0.15;
  const caption = loadingText ?? label;

  const content = (
    <div
      className={cn(
        "inline-flex flex-col items-center justify-center gap-3",
        className
      )}
    >
      <div
        className="relative inline-block"
        style={{ width: px, height: px }}
        role="status"
        aria-label={caption || "Loading"}
      >
        {/* Stationary eye (the O) */}
        <img
  src="/__l5e/assets-v1/1d217ffb-c36c-4677-af40-563d3ced8221/optocare-logo.png"
  alt="OptoCare"
  className="absolute inset-0 m-auto"
  style={{
    width: px * 0.75,
    height: px * 0.75,
    objectFit: "contain",
  }}
/>
        {/* Rotating outer "O" ring */}
        <svg
          viewBox={`0 0 ${px} ${px}`}
          width={px}
          height={px}
          className="absolute inset-0 animate-opto-spin"
          style={{ animationDuration: "1.2s" }}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`opto-ring-${px}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.3)" />
            </linearGradient>
          </defs>
          <circle
            cx={px / 2}
            cy={px / 2}
            r={ringR}
            fill="none"
            stroke={`url(#opto-ring-${px})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * ringR * 0.28} ${2 * Math.PI * ringR * 0.72}`}
          />
        </svg>
      </div>
      <div className="text-center space-y-1">
  {caption && (
  <div className="flex flex-col items-center gap-1">
    <p className="text-sm font-medium text-foreground">
      {caption}
    </p>

    <p className="text-xs text-muted-foreground">
      Powered by OptoCare EMR
    </p>
  </div>
)}

  {clinicName && (
    <div className="text-sm font-semibold text-primary">
      {clinicName}
    </div>
  )}
</div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        {content}
      </div>
    );
  }
  return content;
}
