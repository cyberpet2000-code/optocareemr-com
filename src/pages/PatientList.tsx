import OptoLoader from "@/components/OptoLoader";
import EmptyState from "@/components/EmptyState";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ChevronRight, UserPlus, Phone, MessageCircle, Users, FileText} from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAccess } from "@/hooks/useAccess";
import { offlineStore } from "@/lib/offlineStore";
import { useOffline } from "@/hooks/useOffline";

interface PatientRow {
  id: string;
  full_name: string;
  age: number | null;
  gender: string | null;
  phone: string;
  payment_type: string;
  active_hmo_id: string | null;
  queue_number: number;
  patient_number: string | null;
  hmo_name?: string;
  last_visit?: string | null;
  hmo_verification_status?: string | null;
  balance?: number;
}

export default function PatientList() {
  const { effectiveClinicId: cid } = useAccess();
  const { isOffline } = useOffline();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
const filter = searchParams.get("filter");

  useEffect(() => {
    if (!cid) { setPatients([]); setLoading(false); return; }
    const cacheKey = `patients:${cid}`;

    const loadFromCache = () => {
      const cached = offlineStore.get<PatientRow[]>(cacheKey);
      if (cached) setPatients(cached);
      setLoading(false);
    };

    if (isOffline) { loadFromCache(); return; }

    (async () => {
      try {
        let query = apiClient
  .from("patients",)
  .select("id, full_name, age, gender, phone, payment_type, active_hmo_id, queue_number, patient_number")
  .eq("clinic_id", cid);

if (filter === "thismonth") {
  const monthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString();

  query = query.gte(
    "created_at",
    monthStart
  );
}

const { data, error } =
  await query.order(
    "created_at",
    { ascending: false }
  );
        if (error || !data) { loadFromCache(); return; }
        const hmoIds = [...new Set(data.map((p: any) => p.active_hmo_id).filter(Boolean))];
        let hmoMap = new Map<string, string>();
        if (hmoIds.length > 0) {
          const { data: hmos } = await apiClient.from("hmos").select("id, name").eq("clinic_id", cid).in("id", hmoIds as string[]);
          hmoMap = new Map((hmos || []).map((h: any) => [h.id, h.name]));
        }
        const patientIds = data.map(p => p.id);

const { data: bills } = await apiClient
  .from("billing")
  .select("patient_id, balance")
  .eq("clinic_id", cid)
  .in("patient_id", patientIds);

const balanceMap = new Map<string, number>();

(bills || []).forEach((bill: any) => {
  const current =
    balanceMap.get(bill.patient_id) || 0;

  balanceMap.set(
    bill.patient_id,
    current + (bill.balance || 0)
  );
});
        const rows = data.map((p: any) => ({
          ...p,
          hmo_name: p.active_hmo_id ? hmoMap.get(p.active_hmo_id) : undefined,
          balance: balanceMap.get(p.id) || 0,
        }));
        setPatients(rows);
        offlineStore.save(cacheKey, rows);
        setLoading(false);
      } catch {
        loadFromCache();
      }
    })();
  }, [cid, isOffline]);

  const filtered = patients.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search)
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="page-header">
  {filter === "thismonth"
    ? "Patients This Month"
    : "Patients"}
</h1>
        <Link to="/register">
          <Button size="sm" className="rounded-xl gap-1.5">
            <UserPlus size={14} /> New
          </Button>
        </Link>
      </div>

      <div className="sticky top-0 z-10 bg-background pb-3 mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search name or phone..." className="pl-9 rounded-xl bg-card" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <OptoLoader size={40} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={patients.length === 0 ? "No patients registered yet" : "No matching patients"}
          description={patients.length === 0 ? "Register your first patient to start building records." : "Try a different name or phone number."}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const isHmo = p.payment_type === "hmo";
            return (
              <div key={p.id} className="medical-card p-4 flex items-center gap-3 hover:border-primary/30 transition-all">
                <Link to={`/patient/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="relative shrink-0">
                    <div
                      className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full z-20 ${
                        p.balance > 0
                          ? "bg-red-500"
                          : isHmo
                          ? "bg-amber-500"
                          : "bg-green-500"
                      }`}
                    />
                    <div
  className="
  w-14
  h-14
  rounded-2xl
  flex
  items-center
  justify-center
  text-white
  shadow-md
  "
  style={{
    background:
      "linear-gradient(135deg,#2563EB 0%,#22D3EE 100%)"
  }}
>
                      <span className="text-lg font-bold text-white">
                        {(p.full_name || "?")[0]}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-bold truncate">
    {p.full_name}
  </p>

  {p.patient_number && (
    <span className="text-[11px] font-mono bg-primary/10 text-primary px-2 py-1 rounded-lg">
      {p.patient_number}
    </span>
  )}
</div>
                     <div className="flex items-center gap-2 mt-1 flex-wrap">
  <span className="text-xs text-muted-foreground">
    {p.gender}
  </span>

  <span className="text-xs text-muted-foreground">
    •
  </span>

  <span className="text-xs text-muted-foreground">
    {p.age} yrs
  </span>
</div>

<div className="flex items-center gap-2 mt-2 flex-wrap">
  <span
    className={`text-[11px] px-2 py-1 rounded-full font-medium ${
      isHmo
        ? "bg-accent/10 text-accent"
        : "bg-muted text-muted-foreground"
    }`}
  >
    {isHmo ? (p.hmo_name || "HMO") : "PRIVATE"}
  </span>

  <span className="text-xs text-muted-foreground">
    {p.phone}
  </span>
</div> 
                  </div>
                </Link>
                <div className="flex items-center gap-1 shrink-0">
                  {p.phone && (
                    <>
                      <a href={`tel:${p.phone}`} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Call">
                        <Phone size={14} className="text-success" />
                      </a>
                      <a
                        href={`https://wa.me/${p.phone.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
w-9
h-9
rounded-full
bg-green-50
flex
items-center
justify-center
hover:bg-green-100
transition-colors
"
                        title="WhatsApp"
                      >
                        <MessageCircle size={14} className="text-success" />
                      </a>
                    </>
                  )}
                  <Link
  to={`/patient/${p.id}`}
  className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
>
  <ChevronRight
    size={16}
    className="text-primary"
  />
</Link>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
