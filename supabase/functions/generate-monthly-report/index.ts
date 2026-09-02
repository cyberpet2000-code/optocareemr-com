@@
-      admin.from("inventory_sales").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
-      admin.from("inventory_sale_items").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
+      admin.from("inventory_sales").select("*").eq("clinic_id", clinic_id).gte("created_at", from).lt("created_at", to),
@@
-      const bRows = billing.data || [];
-      const eRows = expenses.data || [];
-      const walkInRows = (sales.data || []).filter((s: any) => s.sale_type === "walk_in");
-      const pAll = patients.data || [];
-      const vRows = visits.data || [];
-      const avRows = allVisits.data || [];
-      const iRows = inventory.data || [];
-      const siRows = saleItems.data || [];
+      const bRows = billing.data || [];
+      const eRows = expenses.data || [];
+      const walkInRows = (sales.data || []).filter((s: any) => s.sale_type === "walk_in");
+      const pAll = patients.data || [];
+      const vRows = visits.data || [];
+      const avRows = allVisits.data || [];
+      const iRows = inventory.data || [];
+      // Fetch sale items for the inventory_sales in this month (inventory_sale_items has no created_at)
+      const salesRows = (sales.data || []);
+      let siRows: any[] = [];
+      if (salesRows.length > 0) {
+        const saleIds = salesRows.map((s: any) => s.id);
+        const { data: saleItemsData, error: saleItemsErr } = await admin
+          .from("inventory_sale_items")
+          .select("*")
+          .eq("clinic_id", clinic_id)
+          .in("sale_id", saleIds);
+        if (saleItemsErr) throw saleItemsErr;
+        siRows = saleItemsData || [];
+      } else {
+        siRows = [];
+      }
@@
-      const bestSellers = groupSum(siRows, (r: any) => {
+      const bestSellers = groupSum(siRows, (r: any) => {
         const item = iRows.find((i: any) => i.id === r.inventory_id);
         return item?.name || "Unknown";
       }, (r: any) => r.quantity);
