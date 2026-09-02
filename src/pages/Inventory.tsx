@@
     const { error: itemsErr } = await apiClient.from("inventory_sale_items").insert(saleItems as any);
     if (itemsErr) { toast.error(itemsErr.message); setSaving(false); return; }
-    // Decrement stock
-    for (const c of cart) {
-      const item = items.find(i => i.id === c.inventory_id);
-      if (item) {
-        await apiClient.from("inventory").update({ stock_quantity: item.stock_quantity - c.quantity }).eq("clinic_id", cid).eq("id", item.id);
-      }
-    }
+    // Stock deduction is handled by the database trigger (trg_inv_sale_movement -> log_inventory_sale_movement).
+    // Do NOT perform manual stock updates here to avoid double-deduction.
     setSaving(false);
     toast.success("Sale completed"); setCart([]); setSalePatientId(""); loadItems();
   };