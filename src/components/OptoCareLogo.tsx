import { cn } from "@/lib/utils";
import logoAsset from "@/assets/optocare-logo.png.asset.json";

type Size = "sm" | "md" | "lg" | "xl";

interface Props {
  size?: Size;
  showTagline?: boolean;
  className?: string;
  imgClassName?: string;
}

const HEIGHTS: Record<Size, string> = {
  sm: "h-8",
  md: "h-12",
  lg: "h-20",
  xl: "h-36",
};

const TAGLINE_TEXT: Record<Size, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-base",
};

/**
 * Official OptoCare-EMR brand logo.
 * Transparent PNG — renders naturally on light & dark themes.
 */
export default function OptoCareLogo({ size = "md", showTagline = false, className, imgClassName }: Props) {
  return (
     <div
  className={cn(
    "inline-flex flex-col items-center gap-3 overflow-visible",
    className
  )}
>
      <img
        src={logoAsset.url}
        alt="OptoCare-EMR"
        className={cn(HEIGHTS[size], "w-auto select-none object-contain", imgClassName)}
        draggable={false}
        style={{ imageRendering: "auto" }}
      />
      {showTagline && (
        <span
          className={cn(
            TAGLINE_TEXT[size],
            "font-medium tracking-[0.04em] text-center text-[#35548D] dark:text-white/90"
          )}
          style={{ textShadow: "none" }}
        >
          Intelligent Eye Care Management Platform 
        </span>
      )}
    </div>
  );
}
