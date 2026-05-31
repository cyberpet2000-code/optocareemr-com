import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerGroup = { group: string; items: string[] };
export type PickerOptions = string[] | PickerGroup[];

const SEP = ", ";

export function splitValues(v: string): string[] {
  return (v || "")
    .split(/,\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

export function appendUnique(current: string, additions: string[]): string {
  const existing = splitValues(current);
  const set = new Set(existing.map(s => s.toLowerCase()));
  const merged = [...existing];
  for (const a of additions) {
    if (!set.has(a.toLowerCase())) {
      merged.push(a);
      set.add(a.toLowerCase());
    }
  }
  return merged.join(SEP);
}

export function removeValue(current: string, value: string): string {
  return splitValues(current)
    .filter(v => v.toLowerCase() !== value.toLowerCase())
    .join(SEP);
}

function isGrouped(opts: PickerOptions): opts is PickerGroup[] {
  return Array.isArray(opts) && opts.length > 0 && typeof (opts as any)[0] === "object";
}

interface QuickPickerProps {
  options: PickerOptions;
  multi?: boolean;
  searchable?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
  /** For multi-select: current field value (comma + space separated) so we can show checks. */
  currentValue?: string;
  /** Single-select: called with the chosen string. Multi-select: called once with the merged comma+space string. */
  onSelect: (value: string) => void;
  popoverWidthClassName?: string;
  align?: "start" | "center" | "end";
}

export function QuickPicker({
  options,
  multi = false,
  searchable = false,
  triggerLabel = "Pick",
  triggerClassName,
  currentValue = "",
  onSelect,
  popoverWidthClassName = "w-72",
  align = "start",
}: QuickPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string[]>([]);

  // Initialize pending from current value whenever opening multi
  const onOpenChange = (v: boolean) => {
    if (v && multi) setPending(splitValues(currentValue));
    if (!v) setQuery("");
    setOpen(v);
  };

  const groups: PickerGroup[] = useMemo(() => {
    if (isGrouped(options)) return options;
    return [{ group: "", items: options as string[] }];
  }, [options]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({
        group: g.group,
        items: g.items.filter(i => i.toLowerCase().includes(q)),
      }))
      .filter(g => g.items.length > 0);
  }, [groups, query]);

  const isSelected = (item: string) => {
    if (multi) return pending.some(p => p.toLowerCase() === item.toLowerCase());
    return splitValues(currentValue).some(p => p.toLowerCase() === item.toLowerCase());
  };

  const toggle = (item: string) => {
    if (multi) {
      setPending(prev => {
        const exists = prev.some(p => p.toLowerCase() === item.toLowerCase());
        return exists ? prev.filter(p => p.toLowerCase() !== item.toLowerCase()) : [...prev, item];
      });
    } else {
      onSelect(item);
      setOpen(false);
    }
  };

  const done = () => {
    onSelect(pending.join(SEP));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("h-7 px-2 rounded-lg text-[10px] gap-1", triggerClassName)}
        >
          {triggerLabel} <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className={cn("p-0 z-50", popoverWidthClassName)}
        onOpenAutoFocus={(e) => { if (!searchable) e.preventDefault(); }}
      >
        {searchable && (
          <div className="p-2 border-b border-border/60">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const first = filteredGroups[0]?.items[0];
                  if (first) toggle(first);
                } else if (e.key === "Escape") {
                  setOpen(false);
                }
              }}
              placeholder="Search..."
              aria-label="Search options"
              className="h-8 text-xs rounded-lg"
            />
          </div>
        )}

        <div className="max-h-72 overflow-y-auto p-1">
          {filteredGroups.length === 0 && (
            <div className="text-xs text-muted-foreground px-3 py-4 text-center">No matches</div>
          )}
          {filteredGroups.map((g, gi) => (
            <div key={gi} className="mb-1">
              {g.group && (
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  {g.group}
                </div>
              )}
              {g.items.map(item => {
                const selected = isSelected(item);
                return (
                  <button
                    type="button"
                    key={item}
                    onClick={() => toggle(item)}
                    className={cn(
                      "w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center justify-between gap-2 hover:bg-muted",
                      selected && "bg-primary/10 text-primary"
                    )}
                  >
                    <span className="truncate">{item}</span>
                    {selected && <Check size={12} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {multi && (
          <div className="flex justify-end gap-2 border-t border-border/60 p-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="h-7 text-xs rounded-lg" onClick={done}>
              Done ({pending.length})
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface ChipsProps {
  value: string;
  onChange: (next: string) => void;
}

export function PickerChips({ value, onChange }: ChipsProps) {
  const items = splitValues(value);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {items.map(item => (
        <span
          key={item}
          className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full"
        >
          {item}
          <button
            type="button"
            onClick={() => onChange(removeValue(value, item))}
            className="hover:bg-primary/20 rounded-full p-0.5"
            aria-label={`Remove ${item}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

// ---------- Option presets ----------

export const VA_DISTANCE_OPTIONS = [
  "6/4", "6/5", "6/6", "6/9", "6/12", "6/18", "6/24", "6/36", "6/60",
  "3/60", "CF", "HM", "LP", "NLP",
];

export const VA_NEAR_OPTIONS = ["N5", "N6", "N8", "N10", "N12", "N18", "N24", "N36"];


function buildSphereOptions(): string[] {
  const opts: string[] = [];
  // negative: -20.00 -> -0.25
  for (let i = 80; i >= 1; i--) {
    const v = (i * 0.25).toFixed(2);
    opts.push(`-${v}`);
  }
  opts.push("0.00");
  for (let i = 1; i <= 80; i++) {
    const v = (i * 0.25).toFixed(2);
    opts.push(`+${v}`);
  }
  return opts;
}

export const SPHERE_OPTIONS = buildSphereOptions();
export const CYL_OPTIONS = SPHERE_OPTIONS;
export const ADD_OPTIONS = (() => {
  // ADD usually positive small range; include +0.25..+4.00 prominent
  const opts: string[] = [];
  for (let i = 1; i <= 16; i++) opts.push(`+${(i * 0.25).toFixed(2)}`);
  return opts;
})();

export const AXIS_OPTIONS = Array.from({ length: 180 }, (_, i) => String(i + 1));

export const REFRACTIVE_ERROR_OPTIONS = [
  "Myopia",
  "Hyperopia",
  "Astigmatism",
  "Presbyopia",
  "Emmetropia",
  "Myopia with Astigmatism",
  "Hyperopia with Astigmatism",
  "Mixed Astigmatism",
  "Anisometropia",
  "Aphakia",
  "Combination of more than 1 refractive error",
];

export const LENS_RECOMMENDATION_OPTIONS = [
  "Glasses",
  "Spectacles",
  "Prescription spectacles",
  "Reading glasses",
  "Distance glasses",
  "Bifocal spectacles",
  "Progressive spectacles",
  "Photochromic Blue Cut (Photo BC)",
  "Photochromic AR",
  "Varilux (PAL)",
  "Blue Cut Clear",
  "AR Clear",
  "Polycarbonate Lens",
  "Fused Bifocal",
  "Invisible Bifocal",
  "Combination of more than 1",
  "Contact Lens (CL) Daily Wear",
  "Contact Lens (CL) Extended Wear",
  "Single Vision (SV)",
  "Reading Glasses (Plano Add)",
  "Tinted Lenses",
  "Plano Protective Glasses",
  "High Index Lens",
];


export const ADVICE_OPTIONS = [
  "Use glasses full time",
  "Use glasses for distance only",
  "Use glasses for near work only",
  "Reduce screen time",
  "20-20-20 rule",
  "UV protection outdoors",
  "Avoid eye rubbing",
  "Warm compress",
  "Lid hygiene",
  "Hand hygiene",
  "Return urgently if pain worsens",
  "Follow-up in 1 week",
  "Follow-up in 1 month",
  "Follow-up in 3 months",
  "Annual eye exam",
];

export const REFERRAL_OPTIONS = [
  "Ophthalmologist review",
  "Cataract surgery review",
  "Glaucoma specialist",
  "Retina specialist",
  "Corneal specialist",
  "Emergency referral",
  "Hospital admission",
];

export const DIAGNOSIS_GROUPS: PickerGroup[] = [
  {
    group: "Refractive",
    items: [
      "Myopia", "Hyperopia", "Astigmatism", "Presbyopia",
      "Anisometropia", "Aphakia",
    ],
  },
  {
    group: "Anterior Segment",
    items: [
      "Allergic Conjunctivitis", "Bacterial Conjunctivitis", "Viral Conjunctivitis",
      "Dry Eye Disease", "Blepharitis", "Meibomian Gland Dysfunction",
      "Pterygium", "Pinguecula", "Corneal Abrasion", "Corneal Ulcer", "Keratitis",
      "Chalazion", "Hordeolum (Stye)", "Subconjunctival Haemorrhage",
    ],
  },
  {
    group: "Lens",
    items: [
      "Cataract — Immature", "Cataract — Mature", "Cataract — Hypermature",
      "Posterior Capsular Opacification (PCO)", "Pseudophakia",
    ],
  },
  {
    group: "Glaucoma",
    items: [
      "Primary Open Angle Glaucoma (POAG)",
      "Primary Angle Closure Glaucoma (PACG)",
      "Normal Tension Glaucoma",
      "Secondary Glaucoma",
      "Ocular Hypertension",
      "Glaucoma Suspect",
    ],
  },
  {
    group: "Retina",
    items: [
      "Diabetic Retinopathy — Non-proliferative",
      "Diabetic Retinopathy — Proliferative",
      "Diabetic Macular Oedema",
      "Hypertensive Retinopathy",
      "Age-related Macular Degeneration (Dry)",
      "Age-related Macular Degeneration (Wet)",
      "Retinal Detachment",
      "Central Serous Chorioretinopathy",
      "Retinitis Pigmentosa",
    ],
  },
  {
    group: "Neuro-Ophthalmology",
    items: [
      "Optic Neuritis", "Papilloedema", "Optic Atrophy",
      "Third Nerve Palsy", "Sixth Nerve Palsy",
    ],
  },
  {
    group: "Paediatric / Strabismus",
    items: [
      "Amblyopia", "Esotropia", "Exotropia",
      "Hypertropia", "Convergence Insufficiency",
    ],
  },
  {
    group: "Trauma / Other",
    items: [
      "Ocular Trauma", "Foreign Body — Cornea", "Foreign Body — Conjunctiva",
      "Chemical Injury", "Uveitis", "Iritis", "Episcleritis", "Scleritis",
    ],
  },
];

// ---------- Validators ----------

const POWER_RE = /^[+-]?\d+(\.\d{1,2})?$/;
export function isValidPower(v: string): boolean {
  if (!v) return true;
  if (!POWER_RE.test(v)) return false;
  const n = Math.round(parseFloat(v) * 100);
  return n % 25 === 0;
}
export function isValidAxis(v: string): boolean {
  if (!v) return true;
  if (!/^\d{1,3}$/.test(v)) return false;
  const n = parseInt(v, 10);
  return n >= 1 && n <= 180;
}
export function isValidVaDistance(v: string): boolean {
  if (!v) return true;
  return VA_DISTANCE_OPTIONS.includes(v);
}
export function isValidVaNear(v: string): boolean {
  if (!v) return true;
  return VA_NEAR_OPTIONS.includes(v);
}
