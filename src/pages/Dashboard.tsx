import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Users, CalendarCheck, UserPlus, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";

interface PatientRow {
  id: number;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string;
}

export default function Dashboard() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [todayVisits, setTodayVisits] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split("T")[0];

      const [patientsRes, countRes, visitsRes] = await Promise.all([
        supabase
          .from("Patients")
          .select("id, full_name, age, gender, phone")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("Patients").select("*", { count: "exact", head: true }),
        supabase
          .from("Visits")
          .select("*", { count: "exact", head: true })
          .gte("created_at", `${today}T00:00:00`)
          .lt("created_at", `${today}T23:59:59.999`),
      ]);

      if (patientsRes.data) setPatients(patientsRes.data as unknown as PatientRow[]);
      setTotalCount(countRes.count ?? 0);
      setTodayVisits(visitsRes.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <AppLayout>
      <h1 className="page-header mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="stat-card">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="text-primary" size={22} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Patients</p>
            <p className="text-2xl font-bold">{loading ? "—" : totalCount}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="w-12 h-12 rounded-xl bg-success/10 flex items-center justify-center">
            <CalendarCheck className="text-success" size={22} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Today's Visits</p>
            <p className="text-2xl font-bold">{loading ? "—" : todayVisits}</p>
          </div>
        </div>

        <div className="stat-card sm:col-span-2 lg:col-span-1">
          <Link
            to="/register"
            className="flex items-center gap-3 w-full text-primary font-semibold hover:underline"
          >
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <UserPlus className="text-primary-foreground" size={22} />
            </div>
            <span>Add New Patient</span>
            <ChevronRight size={18} className="ml-auto" />
          </Link>
        </div>
      </div>

      <div className="medical-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Recent Patients</h2>
          <Link to="/patients" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {loading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
        ) : patients.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No patients registered yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {patients.map(p => (
              <Link
                key={p.id}
                to={`/patient/${p.id}`}
                className="flex items-center justify-between py-3 hover:bg-muted/50 -mx-2 px-2 rounded-lg transition-colors"
              >
                <div>
                  <p className="font-medium">{p.full_name}</p>
                  <p className="text-sm text-muted-foreground">{p.gender}, {p.age} yrs • {p.phone}</p>
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
