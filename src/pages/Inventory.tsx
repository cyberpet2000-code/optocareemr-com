import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Plus, X, Search, AlertTriangle, ShoppingCart, Trash2, Edit2, BarChart3, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const CATEGORIES = ["Frames", "Lenses", "Contact lenses", "Accessories", "Drugs / Eye drops"];
const DRUG_CATEGORIES = ["Antibiotics", "Anti-inflammatory", "Lubricants", "Anti-glaucoma", "Mydriatics", "Others"];

interface InventoryItem {
  id: string; name: string; category: string; price: number; stock: number;
  image_url: string | null; drug_category: string | null; expiry_date: string | null; low_stock_threshold: number;
}

interface CartItem {
  inventory_id: string; name: string; quantity: number; unit_price: number; available_stock: number;
}

const emptyProduct = { name: "", category: "Frames", price: "", stock: "", drugCategory: "", expiryDate: "", lowStockThreshold: "5" };

export default function Inventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [patients, setPatients] = useState<{ id: number; full_name: string }[]>([]);
  const [salePatientId, setSalePatientId] = useState("");

  const loadItems = async () => {
    const { data } = await supabase.from("inventory").select("*").order("name");
    if (data) setItems(data as unknown as InventoryItem[]);
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, []);
  useEffect(() => {
    supabase.from("patients").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setPatients(data as any);
    });
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) { toast.error("Upload failed"); return null; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    let imageUrl: string | null = null;
    if (imageFile) { imageUrl = await uploadImage(imageFile); if (!imageUrl) { setSaving(false); return; } }

    const payload: any = {
      name: form.name.trim(), category: form.category, price: parseFloat(form.price) || 0,
      stock: parseInt(form.stock) || 0, low_stock_threshold: parseInt(form.lowStockThreshold) || 5,
      drug_category: form.category === "Drugs / Eye drops" ? form.drugCategory || null : null,
      expiry_date: form.category === "Drugs / Eye drops" && form.expiryDate ? form.expiryDate : null,
    };
    if (imageUrl) payload.image_url = imageUrl;
    let error;
    if (editId) { ({ error } = await supabase.from("inventory").update(payload).eq("id", editId)); }
    else { payload.created_by = user?.id; ({ error } = await supabase.from("inventory").insert(payload)); }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Updated" : "Added");
    setShowForm(false); setEditId(null); setForm(emptyProduct); setImageFile(null); loadItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete?")) return;
    await supabase.from("inventory").delete().eq("id", id);
    toast.success("Deleted"); loadItems();
  };

  const startEdit = (item: InventoryItem) => {
    setEditId(item.id);
    setForm({ name: item.name, category: item.category, price: String(item.price), stock: String(item.stock), drugCategory: item.drug_category || "", expiryDate: item.expiry_date || "", lowStockThreshold: String(item.low_stock_threshold) });
    setImageFile(null); setShowForm(true);
  };

  const addToCart = (item: InventoryItem) => {
    const existing = cart.find(c => c.inventory_id === item.id);
    if (existing) {
      if (existing.quantity >= item.stock) { toast.error("Not enough stock"); return; }
      setCart(cart.map(c => c.inventory_id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      if (item.stock < 1) { toast.error("Out of stock"); return; }
      setCart([...cart, { inventory_id: item.id, name: item.name, quantity: 1, unit_price: item.price, available_stock: item.stock }]);
    }
  };

  const removeFromCart = (id: string) => setCart(cart.filter(c => c.inventory_id !== id));
  const updateCartQty = (id: string, qty: number) => setCart(cart.map(c => c.inventory_id === id ? { ...c, quantity: Math.max(1, Math.min(qty, c.available_stock)) } : c));
  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  const completeSale = async () => {
    if (cart.length === 0) { toast.error("Cart empty"); return; }
    setSaving(true);
    const { data: sale, error } = await supabase.from("inventory_sales").insert({
      patient_id: salePatientId ? parseInt(salePatientId) : null, sold_by: user?.id, total_amount: cartTotal,
    } as any).select().single();
    if (error || !sale) { toast.error(error?.message || "Failed"); setSaving(false); return; }
    const saleItems = cart.map(c => ({ sale_id: (sale as any).id, inventory_id: c.inventory_id, quantity: c.quantity, unit_price: c.unit_price, total_price: c.quantity * c.unit_price }));
    const { error: itemsErr } = await supabase.from("inventory_sale_items").insert(saleItems as any);
    setSaving(false);
    if (itemsErr) { toast.error(itemsErr.message); return; }
    toast.success("Sale completed"); setCart([]); setSalePatientId(""); loadItems();
  };

  const filtered = items.filter(i => (filterCat === "All" || i.category === filterCat) && i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStockItems = items.filter(i => i.stock <= i.low_stock_threshold);
  const totalValue = items.reduce((sum, i) => sum + i.price * i.stock, 0);

  return (
    <AppLayout>
      <h1 className="page-header mb-5">Optical Shop</h1>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="text-primary" size={18} /></div>
          <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Products</p><p className="text-lg font-bold">{items.length}</p></div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle className="text-destructive" size={18} /></div>
          <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Low Stock</p><p className="text-lg font-bold">{lowStockItems.length}</p></div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center"><BarChart3 className="text-success" size={18} /></div>
          <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Value</p><p className="text-lg font-bold">₦{totalValue.toLocaleString()}</p></div>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="bg-muted/50 rounded-2xl p-1">
          <TabsTrigger value="products" className="rounded-xl text-xs gap-1"><Package size={12} /> Products</TabsTrigger>
          <TabsTrigger value="sell" className="rounded-xl text-xs gap-1"><ShoppingCart size={12} /> Sell</TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-xl text-xs gap-1"><AlertTriangle size={12} /> Alerts ({lowStockItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-full sm:w-40 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <Button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyProduct); }} size="sm" className="rounded-xl gap-1">
              {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> Add</>}
            </Button>
          </div>

          {showForm && (
            <div className="form-section max-w-lg animate-fade-in">
              <h2 className="section-title text-sm">{editId ? "Edit" : "Add"} Product</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Name *</Label><Input className="rounded-xl" value={form.name} onChange={e => set("name", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Category</Label>
                  <Select value={form.category} onValueChange={v => set("category", v)}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-xs">Price (₦)</Label><Input className="rounded-xl" type="number" min={0} value={form.price} onChange={e => set("price", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Stock</Label><Input className="rounded-xl" type="number" min={0} value={form.stock} onChange={e => set("stock", e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Low Alert</Label><Input className="rounded-xl" type="number" min={0} value={form.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value)} /></div>
                <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Image</Label><Input className="rounded-xl" type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} /></div>
                {form.category === "Drugs / Eye drops" && (
                  <>
                    <div className="space-y-1"><Label className="text-xs">Drug Category</Label>
                      <Select value={form.drugCategory} onValueChange={v => set("drugCategory", v)}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{DRUG_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">Expiry</Label><Input className="rounded-xl" type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} /></div>
                  </>
                )}
              </div>
              <Button className="rounded-xl mt-2" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : editId ? "Update" : "Add"}</Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No products found.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => (
                <div key={item.id} className="medical-card p-3 flex items-center gap-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="w-11 h-11 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0"><ImageIcon size={16} className="text-muted-foreground" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold">{item.name}</p>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md">{item.category}</span>
                      {item.stock <= item.low_stock_threshold && <span className="text-[10px] bg-destructive/10 text-destructive px-1 py-0.5 rounded-md">Low</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">₦{item.price.toLocaleString()} • Stock: {item.stock}</p>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => startEdit(item)} className="p-2 rounded-xl hover:bg-muted transition-colors"><Edit2 size={12} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded-xl hover:bg-muted transition-colors"><Trash2 size={12} className="text-destructive" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sell" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search products..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && i.stock > 0).map(item => (
                  <div key={item.id} className="medical-card p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">₦{item.price.toLocaleString()} • Stock: {item.stock}</p>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-xl h-7" onClick={() => addToCart(item)}><Plus size={12} /></Button>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2">
              <div className="form-section sticky top-20">
                <h2 className="section-title text-sm"><ShoppingCart size={14} /> Cart</h2>
                <div className="space-y-1 mb-3">
                  <Label className="text-xs">Patient (optional)</Label>
                  <Select value={salePatientId} onValueChange={setSalePatientId}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Walk-in" /></SelectTrigger>
                    <SelectContent>{patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {cart.length === 0 ? (
                  <p className="text-muted-foreground text-xs text-center py-6">No items</p>
                ) : (
                  <div className="space-y-2">
                    {cart.map(c => (
                      <div key={c.inventory_id} className="flex items-center gap-2 bg-muted/50 rounded-xl p-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">₦{c.unit_price.toLocaleString()} × {c.quantity}</p>
                        </div>
                        <Input type="number" min={1} max={c.available_stock} value={c.quantity} onChange={e => updateCartQty(c.inventory_id, parseInt(e.target.value) || 1)} className="w-14 h-7 text-center text-xs rounded-lg" />
                        <button onClick={() => removeFromCart(c.inventory_id)} className="p-1 hover:text-destructive"><X size={12} /></button>
                      </div>
                    ))}
                    <div className="border-t border-border/60 pt-3 flex items-center justify-between">
                      <p className="font-bold text-sm">₦{cartTotal.toLocaleString()}</p>
                      <Button size="sm" className="rounded-xl" onClick={completeSale} disabled={saving}>{saving ? "..." : "Complete"}</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          {lowStockItems.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">All items well stocked!</div>
          ) : (
            <div className="space-y-2">
              {lowStockItems.map(item => (
                <div key={item.id} className="medical-card p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle size={16} className="text-destructive" /></div>
                    <div>
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Stock: {item.stock} / Min: {item.low_stock_threshold}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => startEdit(item)}>Restock</Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
