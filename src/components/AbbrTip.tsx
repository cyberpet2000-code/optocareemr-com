import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Common ophthalmology abbreviation glossary
const GLOSSARY: Record<string, string> = {
  OD: "Right eye (oculus dexter)",
  OS: "Left eye (oculus sinister)",
  OU: "Both eyes (oculus uterque)",
  VA: "Visual acuity",
  Sph: "Spherical power (dioptres)",
  Sphere: "Spherical power (dioptres)",
  Cyl: "Cylindrical power — minus-cyl convention",
  Axis: "Cylinder axis (1°–180°)",
  Add: "Reading addition (positive dioptres)",
  ADD: "Reading addition (positive dioptres)",
  IOP: "Intraocular pressure (mmHg)",
  PD: "Pupillary distance (mm)",
  CF: "Counting fingers",
  HM: "Hand motion",
  LP: "Light perception",
  NLP: "No light perception",
  Auto: "Auto-refractor reading",
  Sub: "Subjective refraction",
};

interface AbbrTipProps extends React.HTMLAttributes<HTMLSpanElement> {
  term?: string;
  tip?: string;
  children: React.ReactNode;
}

/**
 * Wraps an abbreviation with a desktop hover tooltip explaining the term.
 * On touch devices the tooltip is dismissible. Falls back to the raw text
 * if no tip/term is provided.
 */
export function AbbrTip({ term, tip, children, className, ...rest }: AbbrTipProps) {
  const key = (term ?? (typeof children === "string" ? children : "")).trim();
  const text = tip ?? GLOSSARY[key];
  if (!text) {
    return <span className={className} {...rest}>{children}</span>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2", className)}
          {...rest}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
