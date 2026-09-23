import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, MessageSquare } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { useClinic } from "@/hooks/useClinic";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

type StaffNotification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  notification_type: string;
  read_at: string | null;
  created_at: string;
};

export default function Notifications() {
  const { effectiveClinicId } = useClinic();
  const navigate = useNavigate();
  const [items, setItems] = useState<StaffNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!effectiveClinicId) return;
    setLoading(true);
    const { data, error } = await apiClient
      .from("staff_notifications")
      .select("id,title,body,link,notification_type,read_at,created_at")
      .eq("clinic_id", effectiveClinicId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) setItems((data || []) as StaffNotification[]);
    setLoading(false);
  }, [effectiveClinicId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!effectiveClinicId) return;
    const channel = apiClient
      .channel(`staff-notifications-${effectiveClinicId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_notifications", filter: `clinic_id=eq.${effectiveClinicId}` },
        () => void load()
      )
      .subscribe();
    return () => { apiClient.removeChannel(channel); };
  }, [effectiveClinicId, load]);

  const markRead = async (id: string) => {
    await apiClient.from("staff_notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setItems(current => current.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  };

  const markAllRead = async () => {
    const unread = items.filter(item => !item.read_at).map(item => item.id);
    if (unread.length) {
      await apiClient.from("staff_notifications").update({ read_at: new Date().toISOString() }).in("id", unread);
      setItems(current => current.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })));
    }
  };

  const openNotification = async (item: StaffNotification) => {
    if (!item.read_at) await markRead(item.id);
    navigate(item.link || "/dashboard");
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

      {loading ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Loading notifications…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 font-medium">No notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">You’re all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openNotification(item)}
              className={`w-full rounded-2xl border p-4 text-left transition hover:bg-muted/40 ${item.read_at ? "bg-card" : "bg-primary/5 border-primary/20"}`}
            >
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
                  {item.notification_type === "feedback_received" ? <MessageSquare size={18} /> : <Bell size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{item.title}</p>
                    {!item.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString("en-GB")}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
