import { useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, Send } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { normalizeWhatsAppNumber, whatsappLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export type WhatsAppTemplateKey =
  | "glasses_ready"
  | "order_ready"
  | "payment_reminder"
  | "appointment_reminder"
  | "appointment_reschedule"
  | "feedback"
  | "visit_thank_you"
  | "inquiry_thank_you"
  | "follow_up"
  | "bring_frame"
  | "waiting_for_frame"
  | "frame_received"
  | "contact_lens_ready"
  | "birthday"
  | "recall_first"
  | "recall_reminder";

type Template = {
  key: WhatsAppTemplateKey;
  label: string;
  group: string;
  build: (v: TemplateValues) => string;
};

type TemplateValues = {
  clinicName: string;
  patientName: string;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  feedbackLink?: string | null;
};

const templates: Template[] = [
  {
    key: "glasses_ready",
    label: "👓 Glasses Ready",
    group: "Optical Orders",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

We are pleased to inform you that your glasses are ready for collection at ${clinicName}.

You can visit us during our working hours to pick them up.

Our working hours:
Monday–Friday: 9:00 AM–5:00 PM
Saturday: 10:00 AM–3:00 PM

Thank you for choosing ${clinicName}.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "order_ready",
    label: "📦 Order Ready for Collection",
    group: "Optical Orders",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

Your order is ready for collection at ${clinicName}.

Please visit us during our working hours to collect your order.

Our working hours:
Monday–Friday: 9:00 AM–5:00 PM
Saturday: 10:00 AM–3:00 PM

Thank you for choosing ${clinicName}.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "payment_reminder",
    label: "💳 Payment Reminder",
    group: "Account",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

This is a friendly reminder regarding the outstanding payment on your account with ${clinicName}.

Kindly contact or visit us to complete the outstanding payment so we can proceed with your order/service where applicable.

Thank you for your understanding.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "appointment_reminder",
    label: "📅 Appointment Reminder",
    group: "Appointments",
    build: ({ clinicName, patientName, appointmentDate, appointmentTime }) => `${clinicName}

Hello ${patientName},

This is a reminder of your appointment at ${clinicName} on ${appointmentDate || "[Appointment Date]"} at ${appointmentTime || "[Appointment Time]"}.

We look forward to seeing you.

If you are unable to make it, please contact us so we can assist you with rescheduling.

Thank you.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "appointment_reschedule",
    label: "🔄 Appointment Rescheduling",
    group: "Appointments",
    build: ({ clinicName, patientName, appointmentDate, appointmentTime }) => `${clinicName}

Hello ${patientName},

We understand that plans can change. If you are unable to attend your appointment scheduled for ${appointmentDate || "[Appointment Date]"} at ${appointmentTime || "[Appointment Time]"}, please let us know and we will be happy to help you reschedule.

📅 To reschedule your appointment or make an enquiry, simply reply to this message or contact us.

Thank you,
${clinicName}`,
  },
  {
    key: "visit_thank_you",
    label: "🙏 Thank You for Visiting",
    group: "Patient Engagement",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

Thank you for visiting ${clinicName} for your eye care.

We truly appreciate your trust in us and hope you were satisfied with your experience.

If you have any questions or need further assistance, please feel free to contact us.

We look forward to caring for you again.

${clinicName}`,
  },
  {
    key: "inquiry_thank_you",
    label: "💬 Thank You for Your Enquiry",
    group: "Patient Engagement",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

Thank you for contacting ${clinicName}. We appreciate your enquiry and are happy to assist you.

If you would like to book an appointment or have any further questions, simply reply to this message or contact us.

We look forward to assisting you.

${clinicName}`,
  },
  {
    key: "feedback",
    label: "💬 Patient Feedback",
    group: "Patient Engagement",
    build: ({ clinicName, patientName, feedbackLink }) => `${clinicName}

Hello ${patientName},

Thank you for visiting ${clinicName}. We value your experience and would appreciate a few moments of your time to share your feedback about your recent visit.

Share your feedback:
${feedbackLink || "[Feedback Link]"}

Thank you for choosing ${clinicName}.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "follow_up",
    label: "🔄 Follow-up Reminder",
    group: "Appointments",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

This is a reminder from ${clinicName} regarding your recommended follow-up.

Kindly contact us or visit the clinic to schedule your follow-up appointment.

We look forward to seeing you.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "recall_first",
    label: "👁️ Recall — First Message",
    group: "Recalls",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

Your routine eye check-up is due. 👁️

Reply YES and we’ll help you book a convenient appointment.

Thank you,
${clinicName}`,
  },
  {
    key: "recall_reminder",
    label: "🔔 Recall — Reminder",
    group: "Recalls",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

Just a reminder that your routine eye check-up is due. 👁️

Reply YES if you’d like us to book your appointment.

Thank you,
${clinicName}`,
  },
  {
    key: "bring_frame",
    label: "🖼️ Please Bring Your Frame",
    group: "Optical Orders",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

We are ready to proceed with your glasses. Kindly remember to bring your frame to ${clinicName} so we can proceed with fitting your lenses.

Please bring the frame at your earliest convenience.

Thank you for choosing ${clinicName}.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "waiting_for_frame",
    label: "🕐 Waiting for Your Frame",
    group: "Optical Orders",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

We are still waiting for you to bring your frame to ${clinicName} so we can proceed with your glasses order.

Kindly bring the frame to the clinic when convenient so we can continue with your order.

Please contact us if you have any questions.

Thank you.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "birthday",
    label: "🎂 Birthday Greeting",
    group: "Patient Engagement",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

Wishing you a very happy birthday! 🎂

We appreciate you choosing ${clinicName} for your eye care and wish you a wonderful, healthy and happy year ahead.

Have a beautiful birthday celebration!

*Powered by OptoCare-EMR*`,
  },
  {
    key: "contact_lens_ready",
    label: "👁️ Contact Lens Ready",
    group: "Contact Lens",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

We are pleased to inform you that your contact lenses are ready for collection at ${clinicName}.

You can visit us during our working hours to pick them up.

Our working hours:
Monday–Friday: 9:00 AM–5:00 PM
Saturday: 10:00 AM–3:00 PM

Thank you for choosing ${clinicName}.

*Powered by OptoCare-EMR*`,
  },
  {
    key: "frame_received",
    label: "👓 Frame Received — Order Proceeding",
    group: "Optical Orders",
    build: ({ clinicName, patientName }) => `${clinicName}

Hello ${patientName},

We have received your frame at ${clinicName} and can now proceed with your glasses order.

We will notify you once your glasses are ready for collection.

Thank you for choosing ${clinicName}.

*Powered by OptoCare-EMR*`,
  },
];

export type PatientWhatsAppMessagesProps = {
  clinicId: string;
  clinicName: string;
  patientId: string;
  patientName: string;
  phone: string | null | undefined;
  visitId?: string | null;
  feedbackLink?: string | null;
  appointmentDate?: string | null;
  appointmentTime?: string | null;
  canUse?: boolean;
};

export function PatientWhatsAppMessages({
  clinicId,
  clinicName,
  patientId,
  patientName,
  phone,
  visitId = null,
  feedbackLink = null,
  appointmentDate = null,
  appointmentTime = null,
  canUse = true,
}: PatientWhatsAppMessagesProps) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<WhatsAppTemplateKey>("glasses_ready");
  const [message, setMessage] = useState("");
  const [communicationId, setCommunicationId] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const values = useMemo<TemplateValues>(() => ({
    clinicName: clinicName || "Clinic",
    patientName: patientName || "Patient",
    appointmentDate,
    appointmentTime,
    feedbackLink,
  }), [clinicName, patientName, appointmentDate, appointmentTime, feedbackLink]);

  const availableTemplates = useMemo(
    () => templates.filter((template) => template.key !== "feedback" || !!feedbackLink),
    [feedbackLink],
  );

  const selectedTemplate = availableTemplates.find((template) => template.key === selectedKey) || availableTemplates[0];

  if (!canUse) return null;

  const openPreview = () => {
    if (!normalizeWhatsAppNumber(phone)) {
      toast.error("This patient does not have a valid WhatsApp number.");
      return;
    }
    const template = selectedTemplate || templates[0];
    setSelectedKey(template.key);
    setMessage(template.build(values));
    setCommunicationId(null);
    setOpen(true);
  };

  const selectTemplate = (key: WhatsAppTemplateKey) => {
    const template = templates.find((item) => item.key === key);
    if (!template) return;
    setSelectedKey(key);
    setMessage(template.build(values));
    setCommunicationId(null);
  };

  const prepareWhatsApp = async () => {
    const normalized = normalizeWhatsAppNumber(phone);
    if (!normalized || !message.trim()) {
      toast.error("A valid WhatsApp number and message are required.");
      return;
    }
    setPreparing(true);
    try {
      const { data, error } = await (apiClient as any)
        .from("patient_communications")
        .insert({
          clinic_id: clinicId,
          patient_id: patientId,
          visit_id: visitId,
          template_key: selectedTemplate?.key || selectedKey,
          template_label: selectedTemplate?.label || "WhatsApp message",
          recipient_phone: `+${normalized}`,
          message_body: message.trim(),
        })
        .select("id")
        .single();

      if (error) throw error;

      const link = whatsappLink(phone, message.trim());
      if (!link) throw new Error("Unable to create WhatsApp link.");
      window.open(link, "_blank", "noopener,noreferrer");
      setCommunicationId(data.id);
      toast.success("WhatsApp opened with the message ready. Press Send in WhatsApp.");
    } catch (error: any) {
      console.error("WhatsApp communication error:", error);
      toast.error(error?.message || "Unable to prepare WhatsApp message.");
    } finally {
      setPreparing(false);
    }
  };

  const confirmSent = async () => {
    if (!communicationId) return;
    setConfirming(true);
    try {
      const { error } = await (apiClient as any)
        .from("patient_communications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", communicationId);

      if (error) throw error;
      setOpen(false);
      setCommunicationId(null);
      toast.success("WhatsApp communication marked as sent.");
      window.dispatchEvent(new CustomEvent("optocare:whatsapp-sent", {
        detail: { clinicId, patientId, visitId },
      }));
    } catch (error: any) {
      console.error("WhatsApp communication confirmation error:", error);
      toast.error(error?.message || "Unable to mark message as sent.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={openPreview}>
        <MessageCircle size={15} />
        WhatsApp
      </Button>

      <Dialog open={open} onOpenChange={(next) => !preparing && !confirming && setOpen(next)}>
        <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle size={18} />
              WhatsApp message
            </DialogTitle>
            <DialogDescription>
              Preview the message for {patientName}. You can edit it before opening WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Patient</div>
              <div className="mt-1 text-sm font-semibold">{patientName}</div>
              <div className="text-xs text-muted-foreground">{phone || "No phone number"}</div>
            </div>

            <div className="space-y-1.5">
              <div className="text-sm font-medium">Message template</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableTemplates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => selectTemplate(template.key)}
                    className={`rounded-xl border p-3 text-left transition ${
                      selectedTemplate?.key === template.key
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-xs font-semibold">{template.label}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{template.group}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Preview / edit</div>
                <span className="text-[10px] text-muted-foreground">Prepared → Send → Confirm</span>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={12}
                className="rounded-2xl text-sm leading-6"
              />
            </div>

            <div className="rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
              OptoCare can open WhatsApp with the message pre-filled. The front desk still presses <strong>Send</strong> in WhatsApp. After sending, return here and confirm it so the communication appears in the Daily Front Desk Report.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={preparing || confirming}>Close</Button>
            {communicationId ? (
              <Button type="button" onClick={() => void confirmSent()} disabled={confirming}>
                {confirming ? <CheckCircle2 size={15} className="mr-1 animate-pulse" /> : <CheckCircle2 size={15} className="mr-1" />}
                Mark as Sent
              </Button>
            ) : (
              <Button type="button" onClick={() => void prepareWhatsApp()} disabled={preparing || !message.trim()}>
                {preparing ? <Send size={15} className="mr-1 animate-pulse" /> : <Send size={15} className="mr-1" />}
                Open WhatsApp
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const WHATSAPP_MESSAGE_TEMPLATES = templates;
