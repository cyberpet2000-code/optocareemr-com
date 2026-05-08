// Super-admin only: provisions a new clinic and invites an admin via email.
// - Does NOT auto-link the calling super_admin to the clinic.
// - Does NOT set any password (invite flow lets the admin set their own).
// - Creates a clinic_invites row with a unique token.
// - Sends a Supabase Auth invite email; the action link redirects to
//   /accept-invite?token=<token> where the user signs up / signs in and
//   is granted the clinic_admin role for the new clinic.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("getUser failed", userErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;
    console.log("Using existing authenticated user", { user_id: callerId });

    const admin = createClient(url, serviceKey);

    // Verify caller is super_admin
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "super_admin").maybeSingle();
    const { data: callerProfile } = await admin
      .from("profiles").select("is_super_admin, role").eq("id", callerId).maybeSingle();
    const isSuper = !!roleRow || !!callerProfile?.is_super_admin || callerProfile?.role === "super_admin";
    if (!isSuper) return json({ error: "Forbidden — super admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const clinic_name = String(body?.clinic_name ?? "").trim();
    const admin_full_name = String(body?.admin_full_name ?? "").trim();
    const admin_email = String(body?.admin_email ?? "").trim().toLowerCase();
    const origin: string =
      body?.origin ||
      req.headers.get("origin") ||
      "https://optocareemr.lovable.app";

    if (!clinic_name) return json({ error: "Clinic name is required" }, 400);
    if (!admin_full_name) return json({ error: "Admin full name is required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin_email)) {
      return json({ error: "Valid admin email is required" }, 400);
    }

    // 1) Idempotency check — return existing clinic if name (case-insensitive) already exists
    console.log("Checking for existing clinic by name", { clinic_name });
    const { data: existing, error: existingErr } = await admin
      .from("clinics")
      .select("id, name")
      .ilike("name", clinic_name)
      .maybeSingle();
    if (existingErr) {
      console.error("existing clinic lookup failed", existingErr);
    }

    let clinic: { id: string; name: string };
    let reused = false;

    if (existing) {
      console.log("Clinic already exists — reusing", { clinic_id: existing.id });
      clinic = existing as any;
      reused = true;
    } else {
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 14 * 86400000);
      console.log("Creating clinic", { clinic_name, admin_email });
      const { data: created, error: clinicErr } = await admin
        .from("clinics")
        .insert({
          name: clinic_name,
          email: admin_email,
          is_active: true,
          subscription_status: "trial",
          trial_start_date: trialStart.toISOString(),
          trial_end_date: trialEnd.toISOString(),
          setup_completed: false,
          onboarding_step: "welcome",
        })
        .select("id, name")
        .single();

      if (clinicErr || !created) {
        // If unique-index race condition, fall back to existing
        if ((clinicErr as any)?.code === "23505") {
          const { data: race } = await admin
            .from("clinics").select("id, name").ilike("name", clinic_name).maybeSingle();
          if (race) {
            clinic = race as any;
            reused = true;
          } else {
            return json({ error: clinicErr?.message || "Clinic insert failed" }, 400);
          }
        } else {
          console.error("clinic insert failed", clinicErr);
          return json({ error: clinicErr?.message || "Clinic insert failed" }, 400);
        }
      } else {
        clinic = created as any;
      }
    }

    // 2) Create the invite (token defaults to gen_random_uuid())
    console.log("Creating clinic_invites row", { clinic_id: clinic.id, email: admin_email });
    const { data: invite, error: invErr } = await admin
      .from("clinic_invites")
      .insert({
        clinic_id: clinic.id,
        email: admin_email,
        role: "clinic_admin",
        status: "pending",
        invited_by: callerId,
      } as any)
      .select("id, token")
      .single();

    if (invErr || !invite) {
      console.error("clinic_invites insert failed", invErr);
      if (!reused) {
        await admin.from("clinics").delete().eq("id", clinic.id).catch(() => {});
      }
      return json({ error: invErr?.message || "Failed to create invite" }, 400);
    }

    const acceptUrl = `${origin.replace(/\/$/, "")}/accept-invite?token=${invite.token}`;

    // 3) Send the invite email via Supabase Auth.
    //    inviteUserByEmail provisions a passwordless auth user (if none exists)
    //    and sends Supabase's branded invite email. The user clicks the link,
    //    sets their own password, then lands on /accept-invite?token=...
    let emailSent = false;
    let emailError: string | null = null;
    try {
      const { error: inviteErr } = await (admin as any).auth.admin.inviteUserByEmail(admin_email, {
        redirectTo: acceptUrl,
        data: {
          full_name: admin_full_name,
          clinic_id: clinic.id,
          clinic_name: clinic.name,
          invite_token: invite.token,
        },
      });
      if (inviteErr) {
        emailError = inviteErr.message || String(inviteErr);
        console.error("inviteUserByEmail failed", inviteErr);
      } else {
        emailSent = true;
        console.log("Invite email sent", { admin_email, clinic_id: clinic.id });
      }
    } catch (e) {
      emailError = (e as Error).message;
      console.error("inviteUserByEmail threw", e);
    }

    return json({
      ok: true,
      clinic_id: clinic.id,
      clinic_name: clinic.name,
      invite_token: invite.token,
      invite_link: acceptUrl,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (e) {
    console.error("create-clinic fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
