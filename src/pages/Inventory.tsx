import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Plus, X, Search, AlertTriangle, DollarSign, ShoppingCart, Trash2, Edit2, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const CATEGORIES = ["Frames", "Lenses", "Contact lenses", "Accessories", "Drugs / Eye drops"];
const DRUG_CATEGORIES = ["Antibiotics", "Anti-inflammatory", "Lubricants", "Anti-glaucoma", "Mydriatics", "Others"];

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image_url: string | null;
  drug_category: string | null;
  expiry_date: string | null;
  low_stock_threshold: number;
}

interface CartItem {
  inventory_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  available_stock: number;
}

const emptyProduct = { name: "", category: "Frames", price: "", stock: "", drugCategory: "", expiryDate: "", lowStockThreshold: "5" };

export default function Inventory() {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [patients, setPatients] = useState<{id: number; full_name: string}[]>([]);
  const [salePatientId, setSalePatientId] = useState("");

  const loadItems = async () => {
    const { data } = await supabase.from("inventory").select("*").order("name");
    if (data) setItems(data as unknown as InventoryItem[]);
    setLoading(false);
  };

  useEffect(() => { loadItems(); }, []);
  useEffect(() => {
    supabase.from("Patients").select("id, full_name").order("full_name").then(({ data }) => {
      if (data) setPatients(data as any);
    });
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      category: form.category,
      price: parseFloat(form.price) || 0,
      stock: parseInt(form.stock) || 0,
      low_stock_threshold: parseInt(form.lowStockThreshold) || 5,
      drug_category: form.category === "Drugs / Eye drops" ? form.drugCategory || null : null,
      expiry_date: form.category === "Drugs / Eye drops" && form.expiryDate ? form.expiryDate : null,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("inventory").update(payload).eq("id", editId));
    } else {
      payload.created_by = user?.id;
      ({ error } = await supabase.from("inventory").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Product updated" : "Product added");
    setShowForm(false); setEditId(null); setForm(emptyProduct);
    loadItems();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await supabase.from("inventory").delete().eq("id", id);
    toast.success("Product deleted");
    loadItems();
  };

  const startEdit = (item: InventoryItem) => {
    setEditId(item.id);
    setForm({
      name: item.name, category: item.category,
      price: String(item.price), stock: String(item.stock),
      drugCategory: item.drug_category || "", expiryDate: item.expiry_date || "",
      lowStockThreshold: String(item.low_stock_threshold),
    });
    setShowForm(true);
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
  const updateCartQty = (id: string, qty: number) => {
    setCart(cart.map(c => c.inventory_id === id ? { ...c, quantity: Math.max(1, Math.min(qty, c.available_stock)) } : c));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  const completeSale = async () => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    setSaving(true);
    const { data: sale, error } = await supabase.from("inventory_sales").insert({
      patient_id: salePatientId ? parseInt(salePatientId) : null,
      sold_by: user?.id,
      total_amount: cartTotal,
    } as any).select().single();

    if (error || !sale) { toast.error(error?.message || "Sale failed"); setSaving(false); return; }

    const saleItems = cart.map(c => ({
      sale_id: (sale as any).id,
      inventory_id: c.inventory_id,
      quantity: c.quantity,
      unit_price: c.unit_price,
      total_price: c.quantity * c.unit_price,
    }));

    const { error: itemsErr } = await supabase.from("inventory_sale_items").insert(saleItems as any);
    setSaving(false);
    if (itemsErr) { toast.error(itemsErr.message); return; }
    toast.success("Sale completed — stock deducted");
    setCart([]); setSalePatientId("");
    loadItems();
  };

  const filtered = items.filter(i =>
    (filterCat === "All" || i.category === filterCat) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockItems = items.filter(i => i.stock <= i.low_stock_threshold);
  const totalValue = items.reduce((sum, i) => sum + i.price * i.stock, 0);

  return (
    <AppLayout>
      <h1 className="page-header mb-6">Inventory</h1>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="text-primary" size={20} /></div>
          <div><p className="text-sm text-muted-foreground">Total Products</p><p className="text-2xl font-bold">{items.length}</p></div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle className="text-destructive" size={20} /></div>
          <div><p className="text-sm text-muted-foreground">Low Stock</p><p className="text-2xl font-bold">{lowStockItems.length}</p></div>
        </div>
        <div className="stat-card">
          <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center"><BarChart3 className="text-success" size={20} /></div>
          <div><p className="text-sm text-muted-foreground">Inventory Value</p><p className="text-2xl font-bold">₦{totalValue.toLocaleString()}</p></div>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products"><Package size={14} className="mr-1" /> Products</TabsTrigger>
          <TabsTrigger value="sell"><ShoppingCart size={14} className="mr-1" /> Sell</TabsTrigger>
          <TabsTrigger value="alerts"><AlertTriangle size={14} className="mr-1" /> Low Stock ({lowStockItems.length})</TabsTrigger>
        </TabsList>

        {/* PRODUCTS TAB */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search products..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(emptyProduct); }} size="sm">
              {showForm ? <><X size={14} className="mr-1" /> Cancel</> : <><Plus size={14} className="mr-1" /> Add Product</>}
            </Button>
          </div>

          {showForm && (
            <div className="form-section max-w-lg">
              <h2 className="section-title text-base">{editId ? "Edit Product" : "Add Product"}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5 sm:col-span-2"><Label>Name *</Label><Input value={form.name} onChange={e => set("name", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={v => set("category", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Price (₦)</Label><Input type="number" min={0} value={form.price} onChange={e => set("price", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Stock</Label><Input type="number" min={0} value={form.stock} onChange={e => set("stock", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Low Stock Alert</Label><Input type="number" min={0} value={form.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value)} /></div>
                {form.category === "Drugs / Eye drops" && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Drug Category</Label>
                      <Select value={form.drugCategory} onValueChange={v => set("drugCategory", v)}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{DRUG_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>Expiry Date</Label><Input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} /></div>
                  </>
                )}
              </div>
              <Button onClick={handleSubmit} disabled={saving} className="mt-2">{saving ? "Saving..." : editId ? "Update Product" : "Add Product"}</Button>
            </div>
          )}

          <div className="medical-card">
            {loading ? (
              <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No products found.</p>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-3 -mx-2 px-2 hover:bg-muted/50 rounded-lg transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{item.name}</p>
                        <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{item.category}</span>
                        {item.drug_category && <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded">{item.drug_category}</span>}
                        {item.stock <= item.low_stock_threshold && (
                          <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <AlertTriangle size={10} /> Low
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        ₦{item.price.toLocaleString()} • Stock: {item.stock}
                        {item.expiry_date && ` • Exp: ${item.expiry_date}`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(item)}><Edit2 size={14} /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}><Trash2 size={14} className="text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* SELL TAB */}
        <TabsContent value="sell" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Product Selection */}
            <div>
              <div className="relative mb-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search products to add..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="medical-card max-h-96 overflow-y-auto">
                <div className="divide-y divide-border">
                  {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && i.stock > 0).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-xs text-muted-foreground">₦{item.price.toLocaleString()} • Stock: {item.stock}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => addToCart(item)}>
                        <Plus size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cart */}
            <div className="form-section">
              <h2 className="section-title text-base"><ShoppingCart size={16} /> Cart</h2>
              <div className="space-y-1.5 mb-3">
                <Label>Patient (optional)</Label>
                <Select value={salePatientId} onValueChange={setSalePatientId}>
                  <SelectTrigger><SelectValue placeholder="Walk-in sale" /></SelectTrigger>
                  <SelectContent>
                    {patients.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {cart.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">No items in cart</p>
              ) : (
                <div className="space-y-2">
                  {cart.map(c => (
                    <div key={c.inventory_id} className="flex items-center justify-between bg-muted/50 rounded-lg p-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">₦{c.unit_price.toLocaleString()} × {c.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} max={c.available_stock} value={c.quantity} onChange={e => updateCartQty(c.inventory_id, parseInt(e.target.value) || 1)} className="w-16 h-8 text-center text-sm" />
                        <Button variant="ghost" size="sm" onClick={() => removeFromCart(c.inventory_id)}><X size={14} /></Button>
                      </div>
                    </div>
                  ))}
                  <div className="border-t border-border pt-3 flex items-center justify-between">
                    <p className="font-bold">Total: ₦{cartTotal.toLocaleString()}</p>
                    <Button onClick={completeSale} disabled={saving}>{saving ? "Processing..." : "Complete Sale"}</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* LOW STOCK TAB */}
        <TabsContent value="alerts">
          <div className="medical-card">
            {lowStockItems.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">All items are well stocked!</p>
            ) : (
              <div className="divide-y divide-border">
                {lowStockItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-destructive" />
                        <p className="font-medium">{item.name}</p>
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.category}</span>
                      </div>
                      <p className="text-sm text-muted-foreground ml-6">Stock: {item.stock} (threshold: {item.low_stock_threshold})</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => startEdit(item)}>Restock</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
