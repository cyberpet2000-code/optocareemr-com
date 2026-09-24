import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, MessageSquare, CalendarDays, CreditCard, Package, FileText, ShieldAlert, Users, ClipboardCheck, ChevronRight } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type StaffNotification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  notification_type: string;
  category: string;
  priority: "information" | "attention" | "urgent";
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  expires_at: string | null;
  patient_name?: string | null;
  patient_id?: string | null;
};

export default function Notifications() {
  const { effectiveClinicId } = useClinic();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [patientNames, setPatientNames] = useState<Record<string, { name: string; id: string }>>({});

  const load = useCallback(async () => {
    if (!effectiveClinicId || !user?.id) return;
    setLoading(true);
    const { data, error } = await apiClient
      .from("staff_notifications")
      .select("id,title,body,link,notification_type,category,priority,entity_type,entity_id,read_at,created_at,expires_at")
      .eq("clinic_id", effectiveClinicId)
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) {
      const rows = (data || []) as StaffNotification[];
      setItems(rows);

      // Resolve patient names for patient-related notifications, including
      // older notifications created before patient_name was added.
      const feedbackIds = rows.filter(n => n.entity_type === "feedback_response").map(n => n.entity_id).filter(Boolean) as string[];
      const appointmentIds = rows.filter(n => n.entity_type === "appointment").map(n => n.entity_id).filter(Boolean) as string[];
      const patientIds = rows.filter(n => n.category === "patient" && n.entity_id).map(n => n.entity_id!) ;
      const resolved: Record<string, { name: string; id: string }> = {};

      if (feedbackIds.length) {
        const { data: feedbackRows } = await apiClient.from("feedback_responses").select("id,patient_id").in("id", feedbackIds);
        const ids = (feedbackRows || []).map((r: any) => r.patient_id).filter(Boolean);
        if (ids.length) {
          const { data: patients } = await apiClient.from("patients").select("id,full_name").in("id", ids);
          (patients || []).forEach((p: any) => resolved[`feedback:${feedbackRows?.find((r: any) => r.patient_id === p.id)?.id}`] = { name: p.full_name, id: p.id });
        }
      }
      if (appointmentIds.length) {
        const { data: appointments } = await apiClient.from("appointments").select("id,patient_id").in("id", appointmentIds);
        const ids = (appointments || []).map((r: any) => r.patient_id).filter(Boolean);
        if (ids.length) {
          const { data: patients } = await apiClient.from("patients").select("id,full_name").in("id", ids);
          (patients || []).forEach((p: any) => {
            const appointment = appointments?.find((a: any) => a.patient_id === p.id);
            if (appointment) resolved[`appointment:${appointment.id}`] = { name: p.full_name, id: p.id };
          });
        }
      }
      if (patientIds.length) {
        const { data: patients } = await apiClient.from("patients").select("id,full_name").in("id", patientIds);
        (patients || []).forEach((p: any) => resolved[`patient:${p.id}`] = { name: p.full_name, id: p.id });
      }
      setPatientNames(resolved);
    }
    setLoading(false);
  }, [effectiveClinicId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!effectiveClinicId || !user?.id) return;
    const channel = apiClient
      .channel(`staff-notifications-${effectiveClinicId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_notifications", filter: `clinic_id=eq.${effectiveClinicId}` },
        (payload: any) => {
          if (payload?.new?.recipient_user_id === user.id) void load();
        }
      )
      .subscribe();
    return () => { apiClient.removeChannel(channel); };
  }, [effectiveClinicId, load, user?.id]);

  const visibleItems = useMemo(() => {
    const now = Date.now();
    const active = items.filter(item => !item.expires_at || new Date(item.expires_at).getTime() > now);
    return filter === "all" ? active : active.filter(item => item.category === filter);
  }, [filter, items]);

  const iconFor = (item: StaffNotification) => {
    if (item.category === "appointments") return <CalendarDays size={18} />;
    if (item.category === "billing") return <CreditCard size={18} />;
    if (item.category === "inventory") return <Package size={18} />;
    if (item.category === "hmo") return <ClipboardCheck size={18} />;
    if (item.category === "feedback") return <MessageSquare size={18} />;
    if (item.category === "staff") return <Users size={18} />;
    if (item.category === "system") return <ShieldAlert size={18} />;
    if (item.category === "patient") return <FileText size={18} />;
    return <Bell size={18} />;
  };

  const markRead = async (id: string) => {
    if (!effectiveClinicId || !user?.id) return;
    const readAt = new Date().toISOString();
    const { error } = await apiClient
      .from("staff_notifications")
      .update({ read_at: readAt })
      .eq("id", id)
      .eq("clinic_id", effectiveClinicId)
      .eq("recipient_user_id", user.id);
    if (error) return;
    setItems(current => current.filter(item => item.id !== id));
    window.dispatchEvent(new CustomEvent("optocare:notifications:read", { detail: { count: 1 } }));
  };

  const markAllRead = async () => {
    if (!effectiveClinicId || !user?.id) return;
    const readAt = new Date().toISOString();
    const { error } = await apiClient
      .from("staff_notifications")
      .update({ read_at: readAt })
      .eq("clinic_id", effectiveClinicId)
      .eq("recipient_user_id", user.id)
      .is("read_at", null);
    if (error) return;
    setItems([]);
    window.dispatchEvent(new CustomEvent("optocare:notifications:read-all"));
  };

  const getPatientContext = (item: StaffNotification) => {
    if (item.entity_type === "feedback_response") return patientNames[`feedback:${item.entity_id}`] || null;
    if (item.entity_type === "appointment") return patientNames[`appointment:${item.entity_id}`] || null;
    if (item.category === "patient" && item.entity_id) return patientNames[`patient:${item.entity_id}`] || null;
    return null;
  };

  const openNotification = (item: StaffNotification) => {
    // Navigate immediately; marking read must never block opening the notification.
    const fallbackByCategory: Record<string, string> = {
      appointments: "/appointments",
      billing: "/billing",
      inventory: "/inventory",
      hmo: "/hmos",
      feedback: "/feedback",
      staff: "/admin/roles",
      patient: item.entity_id ? "/patient/" + item.entity_id : "/patients",
      system: "/super-admin/system-health",
    };
    const patient = getPatientContext(item);
    const target = patient ? `/patient/${patient.id}` : item.link || fallbackByCategory[item.category] || "/dashboard";
    if (!item.read_at) void markRead(item.id);
    navigate(target);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">Important updates for your clinic and your role.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void markAllRead()} disabled={!items.some(item => !item.read_at)}>
          <CheckCheck size={15} className="mr-1.5" /> Mark all read
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["all","patient","appointments","billing","hmo","inventory","feedback","staff","system"].map(category => (
          <button key={category} type="button" onClick={() => setFilter(category)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition ${filter === category ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
            {category === "all" ? "All" : category.replace(/_/g, " ").replace(/^./, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading notifications…</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">No notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">You’re all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => openNotification(item)}
              aria-label={`Open notification: ${item.title}`}
              className={`w-full rounded-2xl border p-4 text-left transition hover:bg-muted/40 active:scale-[0.995] cursor-pointer ${item.read_at ? "bg-card" : item.priority === "urgent" ? "bg-destructive/5 border-destructive/30" : "bg-primary/5 border-primary/20"}`}
            >
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
                  {iconFor(item)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{item.title}</p>
                    {!item.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  {getPatientContext(item) && (
                    <p className="mt-1 text-xs font-semibold text-primary">Patient: {getPatientContext(item)?.name}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString("en-GB")}</p>
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                      Open <ChevronRight size={13} />
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
