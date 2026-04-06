import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pill, Search, AlertTriangle, Plus, X, Ban } from "lucide-react";

const DRUG_CATEGORIES = ["Antibiotics", "Anti-inflammatory", "Lubricants", "Anti-glaucoma", "Mydriatics", "Others"];

interface Drug {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  stock: number | null;
  expiry_date: string | null;
}

interface DispenseItem {
  drug_id: string;
  name: string;
  quantity: number;
  price: number;
  available: number;
}

export default function Pharmacy() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<DispenseItem[]>([]);
  const [patients, setPatients] = useState<{ id: number; full_name: string }[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [dispensing, setDispensing] = useState(false);

  const loadDrugs = async () => {
    const { data } = await supabase.from("drugs").select("*").order("name");
    if (data) setDrugs(data as unknown as Drug[]);
    setLoading(false);
  };

  useEffect(() => {
    loadDrugs();
    supabase.from("patients").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setPatients(data as any);
    });
  }, []);

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const isExpiringSoon = (d: Drug) => d.expiry_date && new Date(d.expiry_date) <= thirtyDaysFromNow;
  const isExpired = (d: Drug) => d.expiry_date && new Date(d.expiry_date) < new Date();
  const isOutOfStock = (d: Drug) => (d.stock ?? 0) <= 0;

  const addToCart = (drug: Drug) => {
    if (isOutOfStock(drug)) { toast.error("Out of stock"); return; }
    if (isExpired(drug)) { toast.error("Drug has expired"); return; }
    const existing = cart.find(c => c.drug_id === drug.id);
    if (existing) {
      if (existing.quantity >= (drug.stock ?? 0)) { toast.error("Not enough stock"); return; }
      setCart(cart.map(c => c.drug_id === drug.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { drug_id: drug.id, name: drug.name, quantity: 1, price: drug.price ?? 0, available: drug.stock ?? 0 }]);
    }
  };

  const removeFromCart = (id: string) => setCart(cart.filter(c => c.drug_id !== id));
  const updateQty = (id: string, qty: number) => {
    setCart(cart.map(c => c.drug_id === id ? { ...c, quantity: Math.max(1, Math.min(qty, c.available)) } : c));
  };

  const total = cart.reduce((s, c) => s + c.quantity * c.price, 0);

  const handleDispense = async () => {
    if (cart.length === 0) { toast.error("Add drugs to dispense"); return; }
    setDispensing(true);

    for (const item of cart) {
      const { error } = await supabase.from("dispensing").insert({
        drug_id: item.drug_id,
        quantity: item.quantity,
        price: item.price * item.quantity,
        dispensed_at: new Date().toISOString(),
      } as any);
      if (error) { toast.error(`Failed: ${error.message}`); setDispensing(false); return; }
    }

    toast.success("Drugs dispensed — stock updated");
    setCart([]);
    setSelectedPatient("");
    setDispensing(false);
    loadDrugs();
  };

  const filtered = drugs.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-header flex items-center gap-2"><Pill size={20} /> Pharmacy</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Drug list */}
        <div className="lg:col-span-3 space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search drugs..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No drugs found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(drug => (
                <div key={drug.id} className="medical-card p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold">{drug.name}</p>
                      {drug.category && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md">{drug.category}</span>}
                      {isOutOfStock(drug) && (
                        <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <Ban size={8} /> Out of Stock
                        </span>
                      )}
                      {!isOutOfStock(drug) && (drug.stock ?? 0) <= 5 && (
                        <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <AlertTriangle size={8} /> Low
                        </span>
                      )}
                      {isExpired(drug) && (
                        <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-md">Expired</span>
                      )}
                      {!isExpired(drug) && isExpiringSoon(drug) && (
                        <span className="text-[10px] bg-warning/10 text-warning px-1.5 py-0.5 rounded-md">⚠️ Exp. soon</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      ₦{(drug.price ?? 0).toLocaleString()} • Stock: {drug.stock ?? 0}
                      {drug.expiry_date && ` • Exp: ${drug.expiry_date}`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={() => addToCart(drug)} disabled={isOutOfStock(drug) || isExpired(drug)}>
                    <Plus size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dispensing cart */}
        <div className="lg:col-span-2">
          <div className="form-section sticky top-20">
            <h2 className="section-title text-sm"><Pill size={14} /> Dispense</h2>
            <div className="space-y-1.5 mb-3">
              <Label className="text-xs">Patient (optional)</Label>
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Walk-in" /></SelectTrigger>
                <SelectContent>
                  {patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {cart.length === 0 ? (
              <p className="text-muted-foreground text-xs text-center py-8">Add drugs to dispense</p>
            ) : (
              <div className="space-y-2">
                {cart.map(c => (
                  <div key={c.drug_id} className="flex items-center gap-2 bg-muted/50 rounded-xl p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">₦{c.price.toLocaleString()} × {c.quantity} = ₦{(c.price * c.quantity).toLocaleString()}</p>
                    </div>
                    <Input type="number" min={1} max={c.available} value={c.quantity} onChange={e => updateQty(c.drug_id, parseInt(e.target.value) || 1)} className="w-14 h-8 text-center text-xs rounded-lg" />
                    <button onClick={() => removeFromCart(c.drug_id)} className="p-1 hover:text-destructive transition-colors"><X size={14} /></button>
                  </div>
                ))}
                <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                  <p className="font-bold text-sm">Total: ₦{total.toLocaleString()}</p>
                  <Button size="sm" className="rounded-xl" onClick={handleDispense} disabled={dispensing}>
                    {dispensing ? "Processing..." : "Dispense"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
