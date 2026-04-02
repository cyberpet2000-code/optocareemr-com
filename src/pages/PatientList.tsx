import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";

interface PatientRow {
  id: number;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string;
  insurance_name: string;
}

export default function PatientList() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("Patients")
      .select("id, full_name, age, gender, phone, insurance_name")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setPatients(data as unknown as PatientRow[]);
        setLoading(false);
      });
  }, []);

  const filtered = patients.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone.includes(search)
  );

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="page-header">All Patients</h1>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="medical-card">
        {loading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {patients.length === 0 ? "No patients registered yet." : "No matching patients found."}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map(p => (
              <Link
                key={p.id}
                to={`/patient/${p.id}`}
                className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div>
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.gender}, {p.age} yrs • {p.phone}
                    {p.insurance_name && ` • ${p.insurance_name}`}
                  </p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
