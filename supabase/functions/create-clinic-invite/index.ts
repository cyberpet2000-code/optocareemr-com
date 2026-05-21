// Super-admin only: creates an invite for a clinic admin and returns a shareable link.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  console.log("FUNCTION STARTED");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(url, anon, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData, error: userErr } =
      await userClient.auth.getUser();

    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callerId = userData.user.id;

    const admin = createClient(url, serviceKey);

    // Parse body
    const body = await req.json().catch(() => ({}));

    const clinic_id: string | undefined = body?.clinic_id;
    const emailRaw: string | undefined = body?.email;
    const role: string = (body?.role || "admin").toString();
    const full_name: string | undefined =
      (body?.full_name || "").toString().trim() || undefined;

    const ALLOWED_ROLES = new Set([
      "admin",
      "doctor",
      "nurse",
      "receptionist",
    ]);

    // Verify permissions
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_super_admin, role")
      .eq("id", callerId)
      .maybeSingle();

    const isSuper =
      !!callerProfile?.is_super_admin ||
      callerProfile?.role === "super_admin";

    let isClinicAdmin = false;

    if (!isSuper && clinic_id) {
      const { data: adminRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerId)
        .eq("clinic_id", clinic_id)
        .eq("role", "admin")
        .maybeSingle();

      isClinicAdmin = !!adminRow;
    }

    if (!isSuper && !isClinicAdmin) {
      return json({ error: "Forbidden" }, 403);
    }

    if (
      !ALLOWED_ROLES.has(role) &&
      !(isSuper && role === "super_admin")
    ) {
      return json({ error: "Invalid role" }, 400);
    }

    // App URL
    const APP_URL =
      Deno.env.get("APP_URL") || "https://optocareemr.com";

    // Validation
    if (!clinic_id) {
      return json({ error: "clinic_id is required" }, 400);
    }

    const email = emailRaw?.trim().toLowerCase();

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return json({ error: "Valid email required" }, 400);
    }

    // Verify clinic
    const { data: clinicRow } = await admin
      .from("clinics")
      .select("id, name")
      .eq("id", clinic_id)
      .maybeSingle();

    if (!clinicRow) {
      return json({ error: "Clinic not found" }, 404);
    }

    // Create invite
    const expires_at = new Date(
      Date.now() + 48 * 60 * 60 * 1000
    ).toISOString();

    const token = crypto.randomUUID();

    const { data: invite, error: invErr } = await admin
      .from("clinic_invites")
      .insert({
        clinic_id,
        email,
        role,
        status: "pending",
        token,
        expires_at,
        invited_by: callerId,
      })
      .select("id, token")
      .single();

    if (invErr || !invite) {
      console.error("invite insert failed", invErr);

      return json(
        {
          error:
            invErr?.message || "Failed to create invite",
        },
        400
      );
    }

    // Activity log
    await admin.from("activity_logs").insert({
      user_id: callerId,
      clinic_id,
      action: "invite_sent",
      table_name: "clinic_invites",
      record_id: invite.id,
    });

    const link = `${APP_URL}/accept-invite?token=${invite.token}`;

    console.log("Invite created", {
      clinic_id,
      email,
      role,
      full_name,
      invite_id: invite.id,
      link,
    });

    return json({
      ok: true,
      invite_id: invite.id,
      token: invite.token,
      link,
      clinic_name: clinicRow.name,
    });
  } catch (e) {
    console.error("create-clinic-invite fatal", e);

    return json(
      {
        error: (e as Error).message,
      },
      500
    );
  }
});
