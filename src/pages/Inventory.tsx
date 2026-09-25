import OptoLoader from "@/components/OptoLoader";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Plus, X, Search, AlertTriangle, ShoppingCart, Trash2, Edit2, BarChart3, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAccess } from "@/hooks/useAccess";
import { secureOfflineGet, secureOfflineSave } from "@/lib/secureOfflineStore";
import { useOffline } from "@/hooks/useOffline";
import { useRole } from "@/hooks/useRole";
import { enqueueOfflineOperation } from "@/lib/offlineEngine";
import { confirmDestructiveAction } from "@/lib/safeDelete";


const CATEGORIES = ["Frames", "Lenses", "Contact Lenses", "Accessories", "Drugs"];
const DRUG_CATEGORIES = ["Antibiotics", "Anti-inflammatory", "Anti-Allergy", "Lubricants", "Antioxidant", "Anti-glaucoma", "Mydriatics", "Others"];

interface InventoryItem {
  id: string; name: string; category: string; price: number; stock_quantity: number;
  image_url: string | null; drug_category: string | null; expiry_date: string | null; low_stock_threshold: number;
}

interface CartItem {
  inventory_id: string; name: string; quantity: number; unit_price: number; available_stock: number;
}

const emptyProduct = { name: "", category: "Frames", price: "", stock: "", drugCategory: "", expiryDate: "", lowStockThreshold: "5" };

export default function Inventory() {
  const { user } = useAuth();
  const { effectiveClinicId: cid } = useAccess();
  const { isOffline } = useOffline();
  const { isAdmin, isSuperAdmin } = useRole();
  const canFinalizeStockCount = isAdmin || isSuperAdmin;
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
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [salePatientId, setSalePatientId] = useState("");
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
  const [countNotes, setCountNotes] = useState<Record<string, string>>({});
  const [countingId, setCountingId] = useState<string | null>(null);

  const loadItems = async () => {
    if (!cid) { setItems([]); setLoading(false); return; }
    const cacheKey = `inventory:${cid}`;
    const loadFromCache = async () => {
      const cached = await secureOfflineGet<InventoryItem[]>(cacheKey);
      if (cached) setItems(cached);
      setLoading(false);
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) { loadFromCache(); return; }
    try {
      const { data, error } = await apiClient.from("inventory").select("*").eq("clinic_id", cid).order("name");
      if (error || !data) { loadFromCache(); return; }
      setItems(data as unknown as InventoryItem[]);
      await secureOfflineSave(cacheKey, data);
      setLoading(false);
    } catch {
      loadFromCache();
    }
  };

  useEffect(() => { loadItems(); }, [cid, isOffline]);
  useEffect(() => {
    if (!cid) { setPatients([]); return; }
    const cacheKey = `inventory-patients:${cid}`;
    const loadCachedPats = async () => {
      const cached = await secureOfflineGet<{ id: string; full_name: string }[]>(cacheKey);
      if (cached) setPatients(cached);
    };
    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      await loadCachedPats();
      return;
    }
    apiClient.from("patients").select("id, full_name").eq("clinic_id", cid).order("full_name").then(({ data, error }) => {
      if (error || !data) { void loadCachedPats(); return; }
      setPatients(data as any);
      offlineStore.save(cacheKey, data);
    }, loadCachedPats);

  }, [cid, isOffline]);


  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const uploadImage = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await apiClient.storage.from("product-images").upload(path, file);
    if (error) { toast.error("Upload failed"); return null; }
    const { data } = apiClient.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    let imageUrl: string | null = null;
    if (imageFile) { imageUrl = await uploadImage(imageFile); if (!imageUrl) { setSaving(false); return; } }

    const payload: any = {
      name: form.name.trim(),
      category: form.category,
      price: parseFloat(form.price) || 0,
      stock_quantity: parseInt(form.stock) || 0,
      low_stock_threshold: parseInt(form.lowStockThreshold) || 5,
      min_stock: parseInt(form.lowStockThreshold) || 5,
      drug_category: form.category === "Drugs" ? (form.drugCategory || null) : null,
      expiry_date: form.expiryDate ? form.expiryDate : null,
    };
    if (imageUrl) payload.image_url = imageUrl;
    const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
    if (offline) {
      if (imageFile) {
        setSaving(false);
        toast.error("Adding an image requires internet. Save the inventory item without an image first.");
        return;
      }
      const id = editId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "inventory-" + Date.now());
      const offlinePayload = { ...payload, id, clinic_id: cid, created_by: user?.id ?? null };
      await enqueueOfflineOperation({ clinicId: cid, userId: user?.id ?? null, kind: "inventory.save", entityId: id, payload: offlinePayload });
      const current = await secureOfflineGet<InventoryItem[]>(`inventory:${cid}`) ?? items;
      const local = { ...offlinePayload, offline_pending_sync: true } as InventoryItem;
      const next = editId ? current.map(item => item.id === editId ? local : item) : [local, ...current];
      await secureOfflineSave(`inventory:${cid}`, next);
      setItems(next);
      setSaving(false);
      toast.success("Inventory change saved offline — it will sync automatically.");
      setShowForm(false); setEditId(null); setForm(emptyProduct); setImageFile(null);
      return;
    }

    let error;
    if (editId) {
      ({ error } = await apiClient.from("inventory").update(payload).eq("clinic_id", cid).eq("id", editId));
    } else {
      payload.created_by = user?.id;
      payload.clinic_id = cid;
      ({ error } = await apiClient.from("inventory").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editId ? "Updated" : "Added");
    setShowForm(false); setEditId(null); setForm(emptyProduct); setImageFile(null); loadItems();
  };

  const handleDelete = async (id: string) => {
    if (!cid) return;
    const item = items.find((i) => i.id === id);
    if (!(await confirmDestructiveAction({ item: `inventory item "${item?.name || id}"`, details: "This removes the item from the clinic inventory.", highRisk: true }))) return;
    if (isOffline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      await enqueueOfflineOperation({ clinicId: cid, userId: user?.id ?? null, kind: "inventory.delete", entityId: id, payload: { id } });
      const current = offlineStore.get<InventoryItem[]>(`inventory:${cid}`) ?? items;
      const next = current.filter(item => item.id !== id);
      offlineStore.save(`inventory:${cid}`, next);
      setItems(next);
      toast.success("Inventory deletion saved offline — it will sync automatically.");
      return;
    }
    await apiClient.from("inventory").delete().eq("clinic_id", cid).eq("id", id);
    toast.success("Deleted"); loadItems();
  };

  const startEdit = (item: InventoryItem) => {
    setEditId(item.id);
    setForm({
      name: item.name, category: item.category,
      price: String(item.price), stock: String(item.stock_quantity),
      drugCategory: item.drug_category || "", expiryDate: item.expiry_date || "",
      lowStockThreshold: String(item.low_stock_threshold),
    });
    setImageFile(null); setShowForm(true);
  };

  const addToCart = (item: InventoryItem) => {
    const existing = cart.find(c => c.inventory_id === item.id);
    if (existing) {
      if (existing.quantity >= item.stock_quantity) { toast.error("Not enough stock"); return; }
      setCart(cart.map(c => c.inventory_id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      if (item.stock_quantity < 1) { toast.error("Out of stock"); return; }
      setCart([...cart, { inventory_id: item.id, name: item.name, quantity: 1, unit_price: item.price, available_stock: item.stock_quantity }]);
    }
  };

  const removeFromCart = (id: string) => setCart(cart.filter(c => c.inventory_id !== id));
  const updateCartQty = (id: string, qty: number) => setCart(cart.map(c => c.inventory_id === id ? { ...c, quantity: Math.max(1, Math.min(qty, c.available_stock)) } : c));
  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  const completeSale = async () => {
    if (!cid) { toast.error("No active clinic"); return; }
    if (cart.length === 0) { toast.error("Cart empty"); return; }
    setSaving(true);

    const offline = isOffline || (typeof navigator !== "undefined" && !navigator.onLine);
    if (offline) {
      const saleId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "sale-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      const saleItems = cart.map((item) => ({
        id: typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "sale-item-" + Date.now() + "-" + Math.random().toString(36).slice(2),
        clinic_id: cid,
        sale_id: saleId,
        inventory_id: item.inventory_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
      }));
      await enqueueOfflineOperation({
        clinicId: cid,
        userId: user?.id ?? null,
        kind: "inventory.sale",
        entityId: saleId,
        payload: {
          sale: {
            id: saleId,
            clinic_id: cid,
            patient_id: salePatientId || null,
            sold_by: user?.id ?? null,
            total_amount: cartTotal,
          },
          items: saleItems,
        },
      });
      const nextItems = items.map((inventoryItem) => {
        const sold = cart.find((cartItem) => cartItem.inventory_id === inventoryItem.id);
        return sold
          ? { ...inventoryItem, stock_quantity: Math.max(0, inventoryItem.stock_quantity - sold.quantity), offline_pending_sync: true }
          : inventoryItem;
      });
      await secureOfflineSave("inventory:" + cid, nextItems);
      setItems(nextItems);
      setSaving(false);
      setCart([]);
      setSalePatientId("");
      toast.success("Sale saved offline — stock updated on this device and will sync automatically.");
      return;
    }

    const { data: sale, error } = await apiClient.from("inventory_sales").insert({
      clinic_id: cid,
      patient_id: salePatientId || null,
      sold_by: user?.id,
      total_amount: cartTotal,
    } as any).select().single();
    if (error || !sale) { toast.error(error?.message || "Failed"); setSaving(false); return; }
    const saleItems = cart.map(c => ({
      clinic_id: cid,
      sale_id: (sale as any).id,
      inventory_id: c.inventory_id,
      quantity: c.quantity,
      unit_price: c.unit_price,
      total_price: c.quantity * c.unit_price,
    }));
    const { error: itemsErr } = await apiClient.from("inventory_sale_items").insert(saleItems as any);
    if (itemsErr) { toast.error(itemsErr.message); setSaving(false); return; }
    // Stock deduction is handled by the database trigger (trg_inv_sale_movement -> log_inventory_sale_movement).
    // Do NOT perform manual stock updates here to avoid double-deduction.
    setSaving(false);
    toast.success("Sale completed"); setCart([]); setSalePatientId(""); loadItems();
  };

  const filtered = items.filter(i => (filterCat === "All" || i.category === filterCat) && i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStockItems = items.filter(i => i.stock_quantity <= i.low_stock_threshold);
  const today = new Date();
  const expirySoonDays = 30;
  const expirySoonCutoff = new Date(today);
  expirySoonCutoff.setDate(expirySoonCutoff.getDate() + expirySoonDays);
  const expiredItems = items.filter(i => !!i.expiry_date && new Date(i.expiry_date + "T23:59:59") < today);
  const expiringSoonItems = items.filter(i => {
    if (!i.expiry_date) return false;
    const d = new Date(i.expiry_date + "T23:59:59");
    return d >= today && d <= expirySoonCutoff;
  });
  const totalValue = items.reduce((sum, i) => sum + i.price * i.stock_quantity, 0);

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const d = new Date(expiryDate + "T23:59:59");
    if (d < today) return "Expired";
    if (d <= expirySoonCutoff) return "Expires soon";
    return "Valid";
  };

  const finalizeStockCount = async (item: InventoryItem) => {
    if (!cid || !canFinalizeStockCount) return;
    const raw = physicalCounts[item.id];
    const quantity = Number.parseInt(raw ?? "", 10);
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error("Enter a valid physical quantity");
      return;
    }
    setCountingId(item.id);
    const { error } = await apiClient.rpc("finalize_inventory_stock_count", {
      p_inventory_id: item.id,
      p_physical_quantity: quantity,
      p_notes: countNotes[item.id] || null,
    });
    setCountingId(null);
    if (error) {
      toast.error("Stock count could not be completed");
      return;
    }
    const delta = quantity - item.stock_quantity;
    setItems(current => current.map(row => row.id === item.id ? { ...row, stock_quantity: quantity } : row));
    await secureOfflineSave("inventory:" + cid, items.map(row => row.id === item.id ? { ...row, stock_quantity: quantity } : row));
    setPhysicalCounts(current => ({ ...current, [item.id]: "" }));
    setCountNotes(current => ({ ...current, [item.id]: "" }));
    toast.success(delta === 0 ? "Stock count recorded" : "Stock count completed and inventory adjusted");
  };

  return (
    <>
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
        <TabsList className="bg-muted/50 rounded-2xl p-1 flex-wrap h-auto">
          <TabsTrigger value="products" className="rounded-xl text-xs gap-1"><Package size={12} /> Products</TabsTrigger>
          <TabsTrigger value="sell" className="rounded-xl text-xs gap-1"><ShoppingCart size={12} /> Sell</TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-xl text-xs gap-1"><AlertTriangle size={12} /> Alerts ({lowStockItems.length + expiredItems.length + expiringSoonItems.length})</TabsTrigger>
          {canFinalizeStockCount && <TabsTrigger value="stock-count" className="rounded-xl text-xs gap-1"><BarChart3 size={12} /> Stock Count</TabsTrigger>}
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
                {form.category === "Drugs" && (
                  <div className="space-y-1"><Label className="text-xs">Eye Drop / Drug Category</Label>
                    <Select value={form.drugCategory} onValueChange={v => set("drugCategory", v)}>
                      <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{DRUG_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1"><Label className="text-xs">Expiry (if applicable)</Label><Input className="rounded-xl" type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} /></div>
              </div>
              <Button className="rounded-xl mt-2" onClick={handleSubmit} disabled={saving}>{saving ? "Saving..." : editId ? "Update" : "Add"}</Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12"><OptoLoader size={40} /></div>
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
                      {item.stock_quantity <= item.low_stock_threshold && <span className="text-[10px] bg-destructive/10 text-destructive px-1 py-0.5 rounded-md">Low</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">₦{item.price.toLocaleString()} • Stock: {item.stock_quantity}</p>
                    {item.expiry_date && <div className="flex items-center gap-1 mt-1"><span className="text-[10px] text-muted-foreground">Expiry: {item.expiry_date}</span><span className={getExpiryStatus(item.expiry_date) === "Expired" ? "text-[10px] text-destructive" : getExpiryStatus(item.expiry_date) === "Expires soon" ? "text-[10px] text-amber-700" : "text-[10px] text-success"}>{getExpiryStatus(item.expiry_date)}</span></div>}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button onClick={() => startEdit(item)} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Edit inventory item" aria-label="Edit inventory item"><Edit2 size={12} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Delete inventory item" aria-label="Delete inventory item"><Trash2 size={12} className="text-destructive" /></button>
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
                {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()) && i.stock_quantity > 0).map(item => (
                  <div key={item.id} className="medical-card p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">₦{item.price.toLocaleString()} • Stock: {item.stock_quantity}</p>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-xl h-7" title="Add item to cart" aria-label="Add item to cart" onClick={() => addToCart(item)}><Plus size={12} /></Button>
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
                    <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
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
                        <button onClick={() => removeFromCart(c.inventory_id)} className="p-1 hover:text-destructive" title="Remove item from cart" aria-label="Remove item from cart"><X size={12} /></button>
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

        <TabsContent value="alerts" className="space-y-4">
          {expiredItems.length > 0 && <div>
            <h3 className="text-sm font-semibold text-destructive mb-2">Expired ({expiredItems.length})</h3>
            <div className="space-y-2">{expiredItems.map(item => <div key={item.id} className="medical-card p-3 flex items-center justify-between"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-destructive">Expired: {item.expiry_date} • Stock: {item.stock_quantity}</p></div><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => startEdit(item)}>Edit</Button></div>)}</div>
          </div>}
          {expiringSoonItems.length > 0 && <div>
            <h3 className="text-sm font-semibold mb-2">Expiring within 30 days ({expiringSoonItems.length})</h3>
            <div className="space-y-2">{expiringSoonItems.map(item => <div key={item.id} className="medical-card p-3 flex items-center justify-between"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">Expiry: {item.expiry_date} • Stock: {item.stock_quantity}</p></div><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => startEdit(item)}>Edit</Button></div>)}</div>
          </div>}
          {lowStockItems.length > 0 && <div>
            <h3 className="text-sm font-semibold mb-2">Low stock ({lowStockItems.length})</h3>
            <div className="space-y-2">{lowStockItems.map(item => <div key={item.id} className="medical-card p-3 flex items-center justify-between"><div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">Stock: {item.stock_quantity} / Min: {item.low_stock_threshold}</p></div><Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => startEdit(item)}>Restock</Button></div>)}</div>
          </div>}
          {expiredItems.length === 0 && expiringSoonItems.length === 0 && lowStockItems.length === 0 && <div className="text-center py-8 text-sm text-muted-foreground">All inventory alerts are clear.</div>}
        </TabsContent>
        {canFinalizeStockCount && <TabsContent value="stock-count" className="space-y-3">
          <div className="form-section">
            <h2 className="section-title text-sm">Physical Stock Count</h2>
            <p className="text-xs text-muted-foreground">Compare the system quantity with the physical quantity. Finalizing a count updates stock and records the variance in Inventory Audit.</p>
          </div>
          <div className="space-y-2">
            {filtered.map(item => {
              const physical = physicalCounts[item.id];
              const qty = Number.parseInt(physical ?? "", 10);
              const variance = Number.isInteger(qty) ? qty - item.stock_quantity : null;
              return <div key={item.id} className="medical-card p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.category} • System: {item.stock_quantity}</p></div>
                  {variance !== null && <span className={variance === 0 ? "text-xs text-success" : "text-xs font-semibold text-destructive"}>Variance: {variance > 0 ? "+" : ""}{variance}</span>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Physical quantity</Label><Input className="rounded-xl" type="number" min={0} value={physical ?? ""} onChange={e => setPhysicalCounts(current => ({ ...current, [item.id]: e.target.value }))} /></div>
                  <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Note (optional)</Label><Input className="rounded-xl" placeholder="Reason for variance, if needed" value={countNotes[item.id] ?? ""} onChange={e => setCountNotes(current => ({ ...current, [item.id]: e.target.value }))} /></div>
                </div>
                <Button size="sm" className="rounded-xl" onClick={() => finalizeStockCount(item)} disabled={countingId === item.id || !Number.isInteger(qty) || qty < 0}>{countingId === item.id ? "Saving..." : variance === 0 ? "Record Count" : "Finalize Count"}</Button>
              </div>;
            })}
          </div>
        </TabsContent>}
      </Tabs>
    </>
  );
}
