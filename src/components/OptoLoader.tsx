import { cn } from "@/lib/utils";

interface Props {
  size?: number;
  label?: string;
  className?: string;
  fullscreen?: boolean;
}

/**
 * OptoCare branded loader.
 * The "O" eye stays static; a thin ring rotates around it.
 */
export default function OptoLoader({ size = 48, label, className, fullscreen }: Props) {
  const stroke = Math.max(2, Math.round(size / 24));
  const r = size / 2 - stroke;
  const inner = size * 0.3;
  const pupil = size * 0.13;

  const content = (
    <div className={cn("inline-flex flex-col items-center justify-center gap-3", className)}>
      <div
        className="relative inline-block"
        style={{ width: size, height: size }}
        role="status"
        aria-label={label || "Loading"}
      >
        {/* Static O / eye */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="absolute inset-0"
          aria-hidden="true"
        >
          {/* eye outline */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={inner}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={stroke}
          />
          {/* pupil */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={pupil}
            fill="hsl(var(--primary))"
          />
        </svg>
        {/* Rotating ring */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="absolute inset-0 animate-opto-spin"
          style={{ animationDuration: "1.2s" }}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * r * 0.25} ${2 * Math.PI * r * 0.75}`}
            opacity={0.7}
          />
        </svg>
      </div>
      {label && <div className="text-sm text-muted-foreground">{label}</div>}
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
