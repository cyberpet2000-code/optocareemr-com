import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "@/lib/apiClient";
import { useAccess } from "@/hooks/useAccess";
import { useRole } from "@/hooks/useRole";
import { normalizeWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Users, Megaphone, MessageCircle, UserPlus, CheckCircle2, Clock3, Pause, Play, Send, UserRound, CalendarDays, AlertCircle } from "lucide-react";

type Campaign = {
  id: string;
  name: string;
  campaign_date: string | null;
  message_template: string;
  status: string;
  created_at: string;
};

type Recipient = {
  id: string;
  full_name: string | null;
  phone: string;
  normalized_phone: string;
  status: string;
  patient_id: string | null;
  contact_id: string | null;
  sent_at: string | null;
};

type Lead = {
  id: string;
  full_name: string | null;
  phone: string;
  status: string;
  campaign_id: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
};

const statuses = [
  ["new", "New"],
  ["interested", "Interested"],
  ["appointment_requested", "Appointment requested"],
  ["appointment_booked", "Appointment booked"],
  ["attended", "Attended"],
  ["converted", "Converted"],
  ["follow_up", "Follow up"],
  ["no_response", "No response"],
  ["lost", "Lost"],
];

function interpolate(template: string, recipient: Recipient, clinicName: string, campaignDate?: string | null, clinicAddress = "", clinicWhatsApp = "", clinicEmail = "", clinicOpeningHours = "") {
  const formattedDate = campaignDate
    ? new Date(campaignDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  return template
    .replaceAll("{{patient_name}}", recipient.full_name || "there")
    .replaceAll("{{clinic_name}}", clinicName)
    .replaceAll("{{campaign_date}}", formattedDate)
    .replaceAll("{{clinic_address}}", clinicAddress)
    .replaceAll("{{clinic_whatsapp}}", clinicWhatsApp)
    .replaceAll("{{clinic_email}}", clinicEmail)
    .replaceAll("{{clinic_hours}}", clinicOpeningHours);
}

export default function Outreach() {
  const { effectiveClinicId } = useAccess();
  const { isDoctor, isReceptionist, isAdmin, isSuperAdmin } = useRole();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<"campaign" | "leads">("campaign");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [currentRecipientId, setCurrentRecipientId] = useState<string | null>(null);
  const [sendMode, setSendMode] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("World Sight Day 2026");
  const [campaignDate, setCampaignDate] = useState("2026-10-08");
  const [message, setMessage] = useState("Hello {{patient_name}} 👋\n\nWorld Sight Day is October 8, 2026. {{clinic_name}} invites you to prioritize your eye health with an eye examination.\n\nTo book your appointment:\n📞 WhatsApp/Call: {{clinic_whatsapp}}\n📍 {{clinic_address}}\n✉️ {{clinic_email}}\n\nWe look forward to seeing you.\n\n{{clinic_name}}");
  const [externalText, setExternalText] = useState("");
  const [audience, setAudience] = useState<"patients" | "external" | "both">("both");
  const [clinicName, setClinicName] = useState("Cedar Eye Clinic");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicWhatsApp, setClinicWhatsApp] = useState("+2348067092463");
  const [clinicEmail, setClinicEmail] = useState("cedaeyeclinic@gmail.com");
  const [clinicOpeningHours, setClinicOpeningHours] = useState("Monday–Friday, 9:00 AM–5:00 PM; Saturday, 10:00 AM–3:00 PM");
  const [bookingLead, setBookingLead] = useState<Lead | null>(null);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingReason, setBookingReason] = useState("Eye examination");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState({
    patientCount: 0,
    externalCount: 0,
    duplicateCount: 0,
    invalidCount: 0,
    optedOutCount: 0,
    total: 0,
    sample: [] as { full_name: string | null; phone: string }[],
  });

  const canUse = isAdmin || isReceptionist || isDoctor || isSuperAdmin;

  const load = async () => {
    if (!effectiveClinicId || !canUse) return;
    setLoading(true);
    const [campaignRes, leadRes] = await Promise.all([
      apiClient.from("outreach_campaigns").select("*").eq("clinic_id", effectiveClinicId).order("created_at", { ascending: false }),
      apiClient.from("outreach_leads").select("*").eq("clinic_id", effectiveClinicId).order("created_at", { ascending: false }).limit(200),
    ]);
    const rows = (campaignRes.data || []) as Campaign[];
    setCampaigns(rows);
    setLeads((leadRes.data || []) as Lead[]);
    if (!selected && rows[0]) setSelected(rows[0]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [effectiveClinicId, canUse]);

  useEffect(() => {
    if (!effectiveClinicId || !selected) return;
    let cancelled = false;
    (async () => {
      const { data } = await apiClient.from("outreach_recipients").select("id,full_name,phone,normalized_phone,status,patient_id,contact_id,sent_at").eq("campaign_id", selected.id).order("created_at", { ascending: true }).limit(5000);
      if (!cancelled) setRecipients((data || []) as Recipient[]);
    })();
    return () => { cancelled = true; };
  }, [effectiveClinicId, selected?.id]);

  useEffect(() => {
    if (!effectiveClinicId) return;
    apiClient.from("clinics").select("name,email,address,whatsapp_phone,phone,outreach_opening_hours").eq("id", effectiveClinicId).maybeSingle().then(({ data }) => {
      if (data?.name) setClinicName(data.name);
      if (data?.address) setClinicAddress(data.address);
      if (data?.whatsapp_phone) setClinicWhatsApp(data.whatsapp_phone);
      else if (data?.phone) setClinicWhatsApp(data.phone);
      if (data?.email) setClinicEmail(data.email);
      if (data?.outreach_opening_hours) setClinicOpeningHours(data.outreach_opening_hours);
    });
  }, [effectiveClinicId]);

  const counts = useMemo(() => ({
    total: recipients.length,
    sent: recipients.filter(r => r.status === "sent").length,
    ready: recipients.filter(r => r.status === "ready" || r.status === "opened").length,
    skipped: recipients.filter(r => r.status === "skipped").length,
  }), [recipients]);

  const current = (currentRecipientId ? recipients.find(r => r.id === currentRecipientId) : null)
    || recipients.find(r => r.status === "opened")
    || recipients.find(r => r.status === "ready")
    || null;

  const parseExternalContacts = () => {
    const parsed: { full_name: string | null; phone: string; normalized_phone: string }[] = [];
    const seen = new Set<string>();
    let invalid = 0;
    for (const raw of externalText.split(/\n|,/)) {
      const value = raw.trim();
      if (!value) continue;
      const parts = value.split(/\t|;/).map(v => v.trim()).filter(Boolean);
      const phone = parts.length > 1 ? parts[parts.length - 1] : value;
      const fullName = parts.length > 1 ? parts.slice(0, -1).join(" ") : null;
      const normalized = normalizeWhatsAppNumber(phone);
      if (!normalized) { invalid++; continue; }
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      parsed.push({ full_name: fullName, phone, normalized_phone: normalized });
    }
    return { parsed, invalid };
  };

  const prepareReview = async () => {
    if (!effectiveClinicId || !name.trim() || !message.trim()) return;
    setReviewLoading(true);
    try {
      let patientCount = 0;
      const patientPhones = new Set<string>();
      if (audience === "patients" || audience === "both") {
        const { data } = await apiClient.from("patients").select("id,full_name,phone").eq("clinic_id", effectiveClinicId).not("phone", "is", null).limit(5000);
        for (const p of data || []) {
          const normalized = normalizeWhatsAppNumber(p.phone);
          if (normalized) patientPhones.add(normalized);
        }
        patientCount = patientPhones.size;
      }

      const external = parseExternalContacts();
      let duplicateCount = 0;
      let optedOutCount = 0;
      let existingContacts: any[] = [];
      if (audience === "external" || audience === "both") {
        const numbers = external.parsed.map(x => x.normalized_phone);
        if (numbers.length) {
          const { data: existing } = await apiClient
            .from("outreach_contacts")
            .select("normalized_phone,opted_out")
            .eq("clinic_id", effectiveClinicId)
            .in("normalized_phone", numbers);
          existingContacts = existing || [];
          const existingMap = new Map(existingContacts.map((x: any) => [x.normalized_phone, x]));
          for (const x of external.parsed) {
            if (patientPhones.has(x.normalized_phone)) duplicateCount++;
            else if (existingMap.get(x.normalized_phone)?.opted_out) optedOutCount++;
          }
        }
      }
      const usableExternal = external.parsed.filter(x => !patientPhones.has(x.normalized_phone) && !existingContacts.find((y: any) => y.normalized_phone === x.normalized_phone)?.opted_out);
      const externalCount = usableExternal.length;
      const total = patientCount + externalCount;
      setReview({
        patientCount,
        externalCount,
        duplicateCount,
        invalidCount: external.invalid,
        optedOutCount,
        total,
        sample: usableExternal.slice(0, 5).map(x => ({ full_name: x.full_name, phone: x.phone })),
      });
      setShowCreate(false);
      setShowReview(true);
    } catch (e) {
      console.error("Campaign review failed", e);
    } finally {
      setReviewLoading(false);
    }
  };

  const createCampaign = async () => {
    if (!effectiveClinicId || !name.trim() || !message.trim()) return;
    setCreating(true);
    try {
      const { data: campaign, error } = await apiClient.from("outreach_campaigns").insert({
        clinic_id: effectiveClinicId,
        name: name.trim(),
        campaign_date: campaignDate || null,
        message_template: message.trim(),
        status: "ready",
      }).select("*").single();
      if (error || !campaign) throw error || new Error("Campaign could not be created");

      const rows: any[] = [];
      if (audience === "patients" || audience === "both") {
        const { data: patients } = await apiClient.from("patients").select("id,full_name,phone").eq("clinic_id", effectiveClinicId).not("phone", "is", null).order("created_at", { ascending: false }).limit(5000);
        for (const p of patients || []) {
          const normalized = normalizeWhatsAppNumber(p.phone);
          if (normalized) rows.push({ campaign_id: campaign.id, patient_id: p.id, full_name: p.full_name, phone: p.phone, normalized_phone: normalized, status: "ready" });
        }
      }
      if (audience === "external" || audience === "both") {
        const seen = new Set(rows.map(r => r.normalized_phone));
        const { parsed } = parseExternalContacts();
        for (const item of parsed) {
          if (seen.has(item.normalized_phone)) continue;
          const { data: existingContact } = await apiClient
            .from("outreach_contacts")
            .select("id,opted_out")
            .eq("clinic_id", effectiveClinicId)
            .eq("normalized_phone", item.normalized_phone)
            .maybeSingle();
          if (existingContact?.opted_out) continue;
          seen.add(item.normalized_phone);
          const { data: contact } = await apiClient.from("outreach_contacts").upsert({
            clinic_id: effectiveClinicId, full_name: item.full_name, phone: item.phone, normalized_phone: item.normalized_phone, source: "campaign",
          }, { onConflict: "clinic_id,normalized_phone" }).select("id").single();
          rows.push({ campaign_id: campaign.id, contact_id: contact?.id || null, full_name: item.full_name, phone: item.phone, normalized_phone: item.normalized_phone, status: "ready" });
        }
      }
      if (rows.length) {
        for (let i = 0; i < rows.length; i += 500) {
          await apiClient.from("outreach_recipients").insert(rows.slice(i, i + 500));
        }
      }
      setShowCreate(false);
      setShowReview(false);
      setExternalText("");
      setSelected(campaign as Campaign);
      setCurrentRecipientId(null);
      setSendMode(true);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const openNext = async () => {
    if (!selected || !current || sending || selected.status === "paused") return;
    setSending(true);
    try {
      const url = whatsappLink(current.phone, interpolate(selected.message_template, current, clinicName, selected.campaign_date, clinicAddress, clinicWhatsApp, clinicEmail, clinicOpeningHours));
      if (!url) return;
      await apiClient.from("outreach_recipients").update({ status: "opened" }).eq("id", current.id);
      window.open(url, "_blank", "noopener,noreferrer");
      setRecipients(prev => prev.map(r => r.id === current.id ? { ...r, status: "opened" } : r));
      setCurrentRecipientId(current.id);
    } finally {
      setSending(false);
    }
  };

  const markSent = async () => {
    if (!current || current.status !== "opened") return;
    const sentAt = new Date().toISOString();
    await apiClient.from("outreach_recipients").update({ status: "sent", sent_at: sentAt }).eq("id", current.id);
    setRecipients(prev => prev.map(r => r.id === current.id ? { ...r, status: "sent", sent_at: sentAt } : r));
    const next = recipients.find(r => r.id !== current.id && r.status === "ready");
    setCurrentRecipientId(next?.id || null);
    if (!next) setSendMode(false);
  };

  const skip = async () => {
    if (!current) return;
    await apiClient.from("outreach_recipients").update({ status: "skipped" }).eq("id", current.id);
    setRecipients(prev => prev.map(r => r.id === current.id ? { ...r, status: "skipped" } : r));
    const next = recipients.find(r => r.id !== current.id && r.status === "ready");
    setCurrentRecipientId(next?.id || null);
    if (!next) setSendMode(false);
  };

  const pauseCampaign = async () => {
    if (!selected) return;
    const nextStatus = selected.status === "paused" ? "ready" : "paused";
    await apiClient.from("outreach_campaigns").update({ status: nextStatus }).eq("id", selected.id);
    setSelected({ ...selected, status: nextStatus });
    setCampaigns(prev => prev.map(c => c.id === selected.id ? { ...c, status: nextStatus } : c));
  };

  const createLead = async (r: Recipient) => {
    if (!effectiveClinicId || !selected) return;
    const { data } = await apiClient.from("outreach_leads").insert({
      clinic_id: effectiveClinicId,
      contact_id: r.contact_id,
      patient_id: r.patient_id,
      full_name: r.full_name,
      phone: r.phone,
      normalized_phone: r.normalized_phone,
      campaign_id: selected.id,
      status: "new",
    }).select("*").single();
    if (data) setLeads(prev => [data as Lead, ...prev]);
  };

  const bookLeadAppointment = async () => {
    if (!effectiveClinicId || !bookingLead || !bookingDate || !bookingTime) return;
    setBookingSaving(true);
    try {
      const { error } = await apiClient.from("appointments").insert({
        clinic_id: effectiveClinicId,
        patient_id: bookingLead.patient_id || null,
        outreach_lead_id: bookingLead.id,
        appointment_date: bookingDate,
        appointment_time: bookingTime,
        reason: bookingReason || null,
        status: "pending",
        source: "outreach",
      });
      if (error) throw error;
      await apiClient.from("outreach_leads").update({ status: "appointment_booked", next_follow_up_at: null }).eq("id", bookingLead.id);
      setLeads(prev => prev.map(l => l.id === bookingLead.id ? { ...l, status: "appointment_booked", next_follow_up_at: null } : l));
      setBookingLead(null);
      setBookingDate("");
      setBookingTime("");
      setBookingReason("Eye examination");
    } catch (e) {
      console.error("Failed to book outreach appointment", e);
    } finally {
      setBookingSaving(false);
    }
  };

  const updateLead = async (lead: Lead, status: string) => {
    await apiClient.from("outreach_leads").update({ status }).eq("id", lead.id);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status } : l));
  };

  if (!canUse) return <div className="p-6">Outreach access is not available for this role.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary"><Megaphone size={20}/><span className="text-sm font-semibold">OptoCare Outreach</span></div>
          <h1 className="text-2xl lg:text-3xl font-bold mt-1">Campaigns & Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Reach existing patients and external contacts without turning prospects into patients prematurely.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Megaphone className="w-4 h-4 mr-2"/> New Campaign</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-card p-4"><div className="text-xs text-muted-foreground">Campaigns</div><div className="text-2xl font-bold mt-1">{campaigns.length}</div></div>
        <div className="rounded-2xl border bg-card p-4"><div className="text-xs text-muted-foreground">Leads</div><div className="text-2xl font-bold mt-1">{leads.length}</div></div>
        <div className="rounded-2xl border bg-card p-4"><div className="text-xs text-muted-foreground">Appointments requested</div><div className="text-2xl font-bold mt-1">{leads.filter(l => l.status === "appointment_requested" || l.status === "appointment_booked").length}</div></div>
        <div className="rounded-2xl border bg-card p-4"><div className="text-xs text-muted-foreground">Converted</div><div className="text-2xl font-bold mt-1">{leads.filter(l => l.status === "converted").length}</div></div>
      </div>

      <div className="flex gap-2 border-b">
        <button className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === "campaign" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("campaign")}>Campaigns</button>
        <button className={`px-3 py-2 text-sm font-medium border-b-2 ${tab === "leads" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab("leads")}>Leads</button>
      </div>

      {tab === "leads" ? (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2"><Users size={18}/><div><div className="font-semibold">Lead pipeline</div><div className="text-xs text-muted-foreground">Prospects stay here until they actually become patients.</div></div></div>
          {leads.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No leads yet. Create a lead from a campaign recipient when someone expresses interest.</div> :
          <div className="divide-y">{leads.map(lead => <div key={lead.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="min-w-0 flex-1"><div className="font-medium">{lead.full_name || "Unnamed lead"}</div><div className="text-xs text-muted-foreground">{lead.phone}</div>{lead.notes && <div className="text-xs mt-1">{lead.notes}</div>}</div>
            <select value={lead.status} onChange={e => void updateLead(lead, e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">{statuses.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
            <a href={whatsappLink(lead.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-9 px-3 rounded-md border text-sm"><MessageCircle size={15} className="mr-2"/> WhatsApp</a>
            {(lead.status === "new" || lead.status === "interested" || lead.status === "appointment_requested" || lead.status === "follow_up") && (
              <Button size="sm" variant="outline" onClick={() => setBookingLead(lead)}>
                <CalendarDays className="w-4 h-4 mr-2"/> Book appointment
              </Button>
            )}
          </div>)}</div>}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[300px_1fr] gap-4">
          <div className="rounded-2xl border bg-card p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 pb-1">Campaigns</div>
            {loading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> : campaigns.length === 0 ? <div className="p-3 text-sm text-muted-foreground">No campaigns yet.</div> :
            campaigns.map(c => <button key={c.id} onClick={() => setSelected(c)} className={`w-full text-left rounded-xl p-3 transition-colors ${selected?.id === c.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"}`}><div className="font-medium truncate">{c.name}</div><div className="text-xs text-muted-foreground mt-1">{c.campaign_date || "No date"} · {c.status}</div></button>)}
          </div>

          <div className="space-y-4">
            {!selected ? <div className="rounded-2xl border bg-card p-10 text-center"><Megaphone className="mx-auto mb-3 opacity-50"/><div className="font-semibold">Create your first campaign</div></div> :
            <>
              <div className="rounded-2xl border bg-card p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div><div className="text-xs text-muted-foreground">Campaign</div><h2 className="text-xl font-bold">{selected.name}</h2><div className="text-sm text-muted-foreground mt-1">{selected.campaign_date ? `Event date: ${selected.campaign_date}` : ""}</div></div>
                  <div className="flex flex-wrap gap-2 text-xs items-center">
    <span className="px-2 py-1 rounded-full bg-primary/10 text-primary">{counts.sent} sent</span>
    <span className="px-2 py-1 rounded-full bg-muted">{counts.ready} remaining</span>
    <span className="px-2 py-1 rounded-full border">{selected.status === "paused" ? "Paused" : "Ready"}</span>
    {counts.ready > 0 && (
      <Button size="sm" onClick={() => setSendMode(true)} disabled={selected.status === "paused"}>
        <Send className="w-3.5 h-3.5 mr-1.5"/> Begin Sending
      </Button>
    )}
    <Button size="sm" variant="outline" onClick={() => void pauseCampaign()} disabled={!counts.ready && selected.status !== "paused"}>
      {selected.status === "paused" ? <Play className="w-3.5 h-3.5 mr-1.5"/> : <Pause className="w-3.5 h-3.5 mr-1.5"/>}
      {selected.status === "paused" ? "Resume" : "Pause"}
    </Button>
  </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                  <div className="p-3 rounded-xl bg-muted/50"><div className="text-xs text-muted-foreground">Recipients</div><div className="text-lg font-bold">{counts.total}</div></div>
                  <div className="p-3 rounded-xl bg-muted/50"><div className="text-xs text-muted-foreground">Sent</div><div className="text-lg font-bold">{counts.sent}</div></div>
                  <div className="p-3 rounded-xl bg-muted/50"><div className="text-xs text-muted-foreground">Remaining</div><div className="text-lg font-bold">{counts.ready}</div></div>
                  <div className="p-3 rounded-xl bg-muted/50"><div className="text-xs text-muted-foreground">Skipped</div><div className="text-lg font-bold">{counts.skipped}</div></div>
                </div>
              </div>

              {sendMode && (
                <div className="rounded-2xl border-2 border-primary/20 bg-card p-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-primary font-semibold"><Send size={17}/> Ready to send</div>
                      <div className="text-sm text-muted-foreground mt-1">Work through the queue one recipient at a time. WhatsApp opens with the message prepared.</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSendMode(false)}>Close sending</Button>
                  </div>
                  {current ? (
                    <div className="mt-4 p-4 rounded-xl bg-muted/50">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Current recipient</div>
                      <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><UserRound size={18}/></div><div><div className="font-semibold">{current.full_name || "Unnamed contact"}</div><div className="text-xs text-muted-foreground">{current.phone}</div></div></div>
                      <div className="mt-4 text-sm whitespace-pre-wrap bg-background rounded-xl border p-4">{interpolate(selected.message_template, current, clinicName, selected.campaign_date, clinicAddress, clinicWhatsApp, clinicEmail, clinicOpeningHours)}</div>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button onClick={() => void openNext()} disabled={sending || selected.status === "paused"}><MessageCircle className="w-4 h-4 mr-2"/> Open WhatsApp</Button>
                        <Button variant="outline" onClick={() => void markSent()} disabled={current.status !== "opened"}><CheckCircle2 className="w-4 h-4 mr-2"/> Mark sent & next</Button>
                        <Button variant="ghost" onClick={() => void skip()} disabled={selected.status === "paused"}><Pause className="w-4 h-4 mr-2"/> Skip</Button>
                        {current.contact_id && <Button variant="outline" onClick={() => void createLead(current)}><UserPlus className="w-4 h-4 mr-2"/> Create lead</Button>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-3">OptoCare prepares the message and opens WhatsApp. A staff member still presses Send. After sending, return here and tap “Mark sent & next”.</div>
                      <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: counts.total ? ((counts.sent / counts.total) * 100) + "%" : "0%" }} /></div>
                      <div className="text-xs text-muted-foreground mt-1">{counts.total ? Math.round((counts.sent / counts.total) * 100) : 0}% complete</div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border bg-muted/30 p-6 text-center">
                      <CheckCircle2 className="mx-auto mb-2 text-primary" size={24}/>
                      <div className="font-semibold">Campaign sending complete</div>
                      <div className="text-sm text-muted-foreground mt-1">There are no remaining recipients in this loaded queue.</div>
                      <Button className="mt-3" variant="outline" onClick={() => setSendMode(false)}>Close</Button>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="p-4 border-b flex items-center gap-2"><Clock3 size={17}/><div><div className="font-semibold">Recipient queue</div><div className="text-xs text-muted-foreground">Progress is saved, so you can stop and continue later.</div></div></div>
                <div className="max-h-[420px] overflow-auto divide-y" data-oc-scroll>{recipients.slice(0, 300).map(r => <div key={r.id} className={"p-3 flex items-center gap-3 " + (current?.id === r.id ? "bg-primary/5" : "")}><div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{r.full_name || "Unnamed contact"}</div><div className="text-xs text-muted-foreground">{r.phone}</div></div><span className="text-xs capitalize">{r.status}</span>{r.status === "sent" && <CheckCircle2 size={16} className="text-success"/>}{(r.status === "ready" || r.status === "opened") && <button className="text-xs text-primary" onClick={() => setCurrentRecipientId(r.id)}>Select</button>}</div>)}</div>
              </div>
            </>
            }
          </div>
        </div>
      )}


      {showReview && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-2xl max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl bg-card border shadow-2xl flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-primary"><Megaphone size={19}/><span className="text-sm font-semibold">Campaign review</span></div>
              <h2 className="text-xl font-bold mt-1">{name}</h2>
              <p className="text-sm text-muted-foreground mt-1">{campaignDate ? "Event date: " + new Date(campaignDate + "T00:00:00").toLocaleDateString("en-GB", {day:"2-digit", month:"long", year:"numeric"}) : "No event date"}</p>
            </div>
            <button onClick={() => setShowReview(false)} className="text-muted-foreground">✕</button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl border bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Existing patients</div><div className="text-2xl font-bold">{review.patientCount}</div></div>
            <div className="rounded-xl border bg-muted/40 p-3"><div className="text-xs text-muted-foreground">External contacts</div><div className="text-2xl font-bold">{review.externalCount}</div></div>
            <div className="rounded-xl border bg-muted/40 p-3"><div className="text-xs text-muted-foreground">Total to send</div><div className="text-2xl font-bold">{review.total}</div></div>
          </div>

          <div className="mt-3 rounded-xl border bg-background p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary"/> Duplicate/existing-patient numbers excluded: <strong>{review.duplicateCount}</strong></div>
            <div className="flex items-center gap-2"><AlertCircle size={16}/> Invalid numbers excluded: <strong>{review.invalidCount}</strong></div>
            <div className="flex items-center gap-2"><Pause size={16}/> Opted-out contacts excluded: <strong>{review.optedOutCount}</strong></div>
          </div>

          <div className="mt-4 rounded-xl border bg-muted/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Message preview</div>
            <div className="whitespace-pre-wrap text-sm bg-background rounded-xl border p-4">{interpolate(message, { id:"preview", full_name: review.sample[0]?.full_name || "there", phone: review.sample[0]?.phone || "", normalized_phone:"", status:"ready", patient_id:null, contact_id:null, sent_at:null }, clinicName, campaignDate, clinicAddress, clinicWhatsApp, clinicEmail, clinicOpeningHours)}</div>
            <div className="text-xs text-muted-foreground mt-2">Personalization will use each recipient's name automatically.</div>
          </div>

          {review.sample.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">External contacts preview</div>
              <div className="space-y-1">{review.sample.map((s,i) => <div key={i} className="flex justify-between text-sm rounded-lg bg-muted/30 px-3 py-2"><span>{s.full_name || "Unnamed"}</span><span className="text-muted-foreground">{s.phone}</span></div>)}</div>
            </div>
          )}

          <div className="mt-5 rounded-xl bg-warning/10 border border-warning/20 p-3 text-xs">
            <strong>WhatsApp-assisted sending:</strong> OptoCare will prepare and open each WhatsApp message. A staff member must still press Send. No automatic WhatsApp API sending occurs.
          </div>

          </div>
          <div className="shrink-0 border-t bg-card/95 backdrop-blur p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
            <Button className="w-full h-11" onClick={() => void createCampaign()} disabled={creating || review.total === 0}><Send className="w-4 h-4 mr-2"/>{creating ? "Creating campaign…" : "Create & Prepare Sending"}</Button>
            <Button className="w-full mt-2" variant="outline" onClick={() => { setShowReview(false); setShowCreate(true); }}>Back to edit</Button>
          </div>
        </div>
      </div>}


      {bookingLead && <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-card border shadow-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">Book appointment</h2>
              <p className="text-sm text-muted-foreground mt-1">{bookingLead.full_name || "Unnamed lead"} · {bookingLead.phone}</p>
            </div>
            <button onClick={() => setBookingLead(null)} className="text-muted-foreground">✕</button>
          </div>
          <div className="space-y-3 mt-5">
            <Input type="date" value={bookingDate} onChange={e => setBookingDate(e.target.value)} />
            <Input type="time" value={bookingTime} onChange={e => setBookingTime(e.target.value)} />
            <Input value={bookingReason} onChange={e => setBookingReason(e.target.value)} placeholder="Reason" />
            <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              This creates an appointment linked to the outreach lead. An external prospect is not turned into a patient just by booking.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBookingLead(null)}>Cancel</Button>
              <Button onClick={() => void bookLeadAppointment()} disabled={bookingSaving || !bookingDate || !bookingTime}>
                {bookingSaving ? "Booking..." : "Confirm appointment"}
              </Button>
            </div>
          </div>
        </div>
      </div>}

      {showCreate && <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full max-w-2xl max-h-[calc(100dvh-5rem)] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl bg-card border shadow-2xl flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Create outreach campaign</h2><p className="text-sm text-muted-foreground mt-1">Existing patients and external contacts can be combined without creating premature patient records.</p></div><button onClick={() => setShowCreate(false)} className="text-muted-foreground shrink-0">✕</button></div>
            <div className="grid gap-4 mt-5">
          <div><label className="text-sm font-medium">Campaign name</label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="grid sm:grid-cols-2 gap-3"><div><label className="text-sm font-medium">Campaign/event date</label><Input type="date" value={campaignDate} onChange={e => setCampaignDate(e.target.value)} /></div><div><label className="text-sm font-medium">Audience</label><select value={audience} onChange={e => setAudience(e.target.value as any)} className="w-full h-10 rounded-md border bg-background px-3 text-sm"><option value="patients">OptoCare patients</option><option value="external">External contacts</option><option value="both">Patients + external</option></select></div></div>
          {(audience === "external" || audience === "both") && <div><label className="text-sm font-medium">External contacts</label><Textarea rows={6} value={externalText} onChange={e => setExternalText(e.target.value)} placeholder={"John Doe\t0803...\nMary Smith\t+234...\n0805..."} /><p className="text-xs text-muted-foreground mt-1">One per line. You can use Name + phone separated by a tab or semicolon, or phone only. Duplicates are removed.</p></div>}
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="text-sm font-semibold">Clinic contact details</div>
            <div className="text-xs text-muted-foreground mt-1">These are pulled from the clinic profile and will be available in the campaign message.</div>
            <div className="grid gap-1.5 mt-3 text-sm">
              <div>📍 {clinicAddress || "Address not configured"}</div>
              <div>📞 {clinicWhatsApp || "Phone not configured"}</div>
              <div>✉️ {clinicEmail || "Email not configured"}</div>
              <div>🕘 {clinicOpeningHours || "Opening hours not configured"}</div>
            </div>
          </div>
          <div><label className="text-sm font-medium">WhatsApp message</label><Textarea rows={10} value={message} onChange={e => setMessage(e.target.value)} /><p className="text-xs text-muted-foreground mt-1">Available: {"{{patient_name}}"}, {"{{clinic_name}}"}, {"{{campaign_date}}"}, {"{{clinic_address}}"}, {"{{clinic_whatsapp}}"}, {"{{clinic_email}}"}, {"{{clinic_hours}}"}</p></div>
          <div className="rounded-xl bg-warning/10 border border-warning/20 p-3 text-xs text-warning">This version does not use WhatsApp API. It prepares each message and opens WhatsApp; staff must press Send.</div>
            </div>
          </div>
          <div className="shrink-0 border-t bg-card/95 backdrop-blur p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4">
            <Button className="w-full h-11" onClick={() => void prepareReview()} disabled={reviewLoading || !name.trim() || !message.trim()}>{reviewLoading ? "Preparing review…" : "Review campaign"}</Button>
            <Button className="w-full mt-2" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      </div>}
    </div>
  );
}
