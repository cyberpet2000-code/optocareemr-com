import { cn } from "@/lib/utils";
import logoAsset from "@/assets/optocare-logo.png.asset.json";

type Size = "sm" | "md" | "lg" | "xl";

interface Props {
  size?: Size;
  showTagline?: boolean;
  className?: string;
}

const HEIGHTS: Record<Size, string> = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
  xl: "h-24",
};

const TAGLINE_TEXT: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
};

/**
 * Official OptoCare-EMR brand logo.
 * Uses the supplied gradient logo asset. Renders crisply in light & dark mode.
 */
export default function OptoCareLogo({ size = "md", showTagline = false, className }: Props) {
  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <img
        src={logoAsset.url}
        alt="OptoCare-EMR"
        className={cn(HEIGHTS[size], "w-auto select-none dark:drop-shadow-[0_0_10px_hsl(var(--primary)/0.25)]")}
        draggable={false}
      />
      {showTagline && (
        <span
          className={cn(
            TAGLINE_TEXT[size],
            "font-medium tracking-wide text-muted-foreground"
          )}
        >
          Intelligent Eye Care Management
        </span>
      )}
    </div>
  );
}
