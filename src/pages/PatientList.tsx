import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronRight, UserPlus, Phone, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PatientRow {
  id: number;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string;
  insurance_name: string;
  patient_type: string;
  patient_uid: string;
}

export default function PatientList() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("patients")
      .select("id, full_name, age, gender, phone, insurance_name, patient_type, patient_uid")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setPatients(data as unknown as PatientRow[]);
        setLoading(false);
      });
  }, []);

  const filtered = patients.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search) ||
    p.patient_uid?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="page-header">Patients</h1>
        <Link to="/register">
          <Button size="sm" className="rounded-xl gap-1.5">
            <UserPlus size={14} /> New
          </Button>
        </Link>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search name, phone, or ID..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">
            {patients.length === 0 ? "No patients registered yet." : "No matching patients found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="medical-card p-3 flex items-center gap-3">
              <Link to={`/patient/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{(p.full_name || "?")[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{p.full_name}</p>
                    <span className="text-[10px] font-mono text-muted-foreground">{p.patient_uid}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                      p.patient_type === "HMO" ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"
                    }`}>
                      {p.patient_type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.gender}, {p.age} yrs • {p.phone}
                  </p>
                </div>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                {p.phone && (
                  <>
                    <a href={`tel:${p.phone}`} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Call">
                      <Phone size={14} className="text-success" />
                    </a>
                    <a href={`https://wa.me/${p.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-xl hover:bg-muted transition-colors" title="WhatsApp">
                      <MessageCircle size={14} className="text-success" />
                    </a>
                  </>
                )}
                <Link to={`/patient/${p.id}`} className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <ChevronRight size={14} className="text-muted-foreground" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
