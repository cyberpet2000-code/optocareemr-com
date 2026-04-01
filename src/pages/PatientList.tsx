import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { getPatients } from "@/lib/store";
import AppLayout from "@/components/AppLayout";
import { Input } from "@/components/ui/input";

export default function PatientList() {
  const patients = getPatients();
  const [search, setSearch] = useState("");

  const filtered = patients.filter(p =>
    p.fullName.toLowerCase().includes(search.toLowerCase()) ||
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
        {filtered.length === 0 ? (
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
                  <p className="font-medium">{p.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.gender}, {p.age} yrs • {p.phone}
                    {p.insuranceName && ` • ${p.insuranceName}`}
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
