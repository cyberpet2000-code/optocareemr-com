@@
-                    <MedicationPicker
-                      items={medications}
-                      onAdd={line => setField("medication", form.medication ? `${form.medication}\n${line}` : line)}
-                      triggerLabel="+ Medication"
-                    />
+                    <MedicationPicker
+                      items={medications}
+                      onAdd={line => setField("medication", form.medication ? `${form.medication}\n${line}` : line)}
+                      triggerLabel="+ Medication"
+                    />
