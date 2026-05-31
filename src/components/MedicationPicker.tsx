import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";

export interface MedItem { id: string; name: string }
export type MedEye = "RE" | "LE" | "BOTH EYES";

interface Props {
  items: MedItem[];
  onAdd: (line: string) => void;
  triggerLabel?: string;
}

export function MedicationPicker({ items, onAdd, triggerLabel = "+ Medication" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MedItem | null>(null);
  const [dose, setDose] = useState("");
  const [duration, setDuration] = useState("");
  const [eye, setEye] = useState<MedEye>("BOTH EYES");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items.filter(i => i.name.toLowerCase().includes(q)).slice(0, 50);
  }, [items, query]);

  const reset = () => {
    setSelected(null); setDose(""); setDuration(""); setEye("BOTH EYES"); setQuery("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    setOpen(v);
  };

  const add = () => {
    if (!selected) return;
    const parts = [selected.name];
    if (dose.trim()) parts.push(dose.trim());
    if (duration.trim()) parts.push(`× ${duration.trim()}`);
    parts.push(eye);
    onAdd(parts.join(" — ").replace(" — × ", " × "));
    setOpen(false);
    reset();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 rounded-lg text-[10px] gap-1">
          {triggerLabel} <ChevronDown size={12} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-2 w-72 z-50">
        {!selected ? (
          <>
            <Input
              autoFocus
              placeholder="Search medication..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
              className="h-8 text-xs rounded-lg mb-2"
              aria-label="Search medication"
            />
            <div className="max-h-56 overflow-y-auto">
              {items.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                  No medications in inventory.
                </div>
              )}
              {filtered.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted"
                >
                  {m.name}
                </button>
              ))}
              {items.length > 0 && filtered.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-3 text-center">No matches</div>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-semibold">{selected.name}</div>
            <div className="space-y-1">
              <Label className="text-[10px]">Dosage</Label>
              <Input className="h-8 text-xs rounded-lg" value={dose} onChange={e => setDose(e.target.value)} placeholder="1 drop qid" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Duration</Label>
              <Input className="h-8 text-xs rounded-lg" value={duration} onChange={e => setDuration(e.target.value)} placeholder="7 days" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Eye</Label>
              <div className="flex gap-1">
                {(["RE", "LE", "BOTH EYES"] as MedEye[]).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setEye(opt)}
                    className={`flex-1 text-[10px] px-2 py-1 rounded-md border ${eye === opt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => setSelected(null)}>
                Back
              </Button>
              <Button type="button" size="sm" className="h-7 text-xs rounded-lg" onClick={add}>
                Add
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
