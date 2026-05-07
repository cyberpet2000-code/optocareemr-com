// Super-admin only: provisions auth user + clinic + profile atomically
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(url, serviceKey);

    // verify caller is super_admin
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "super_admin").maybeSingle();
    const { data: profileRow } = await admin
      .from("profiles").select("is_super_admin, role").eq("id", callerId).maybeSingle();
    const isSuper = !!roleRow || !!profileRow?.is_super_admin || profileRow?.role === "super_admin";
    if (!isSuper) return json({ error: "Forbidden — super admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const { clinic_name, admin_full_name, admin_email, admin_password, phone } = body ?? {};

    if (!clinic_name || !admin_full_name || !admin_email || !admin_password) {
      return json({ error: "Missing required fields" }, 400);
    }
    if (String(admin_password).length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Resolve auth user: reuse if exists, otherwise create
    let newUserId: string | null = null;
    let userWasCreated = false;

    const emailLower = String(admin_email).toLowerCase();
    // Look up existing user by email (paginate defensively)
    try {
      for (let page = 1; page <= 20 && !newUserId; page++) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) { console.error("listUsers error", listErr); break; }
        const found = list?.users?.find((u: any) => (u.email || "").toLowerCase() === emailLower);
        if (found) { newUserId = found.id; break; }
        if (!list?.users || list.users.length < 200) break;
      }
    } catch (e) {
      console.error("user lookup failed", e);
    }

    if (!newUserId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: admin_email,
        password: admin_password,
        email_confirm: true,
        user_metadata: { full_name: admin_full_name },
      });
      if (createErr || !created.user) {
        console.error("createUser failed", createErr);
        return json({ error: createErr?.message || "User create failed" }, 400);
      }
      newUserId = created.user.id;
      userWasCreated = true;
    } else {
      console.log("Reusing existing auth user", newUserId);
      // Ensure existing user is not already attached to a clinic as admin
      const { data: existingProfile } = await admin
        .from("profiles").select("clinic_id, role").eq("id", newUserId).maybeSingle();
      if (existingProfile?.clinic_id) {
        return json({ error: "This user is already assigned to a clinic" }, 409);
      }
    }

    // Create clinic
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 14 * 86400000);
    const { data: clinic, error: clinicErr } = await admin
      .from("clinics")
      .insert({
        name: clinic_name,
        phone: phone || null,
        email: admin_email,
        is_active: true,
        subscription_status: "trial",
        trial_start_date: trialStart.toISOString(),
        trial_end_date: trialEnd.toISOString(),
        setup_completed: false,
        onboarding_step: "welcome",
      })
      .select("id")
      .single();
    if (clinicErr || !clinic) {
      if (userWasCreated) await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      console.error("clinic insert failed", clinicErr);
      return json({ error: clinicErr?.message || "Clinic insert failed" }, 400);
    }

    // Upsert profile
    await admin.from("profiles").upsert({
      id: newUserId,
      full_name: admin_full_name,
      role: "admin",
      clinic_id: clinic.id,
      phone: phone || null,
    });

    // Insert user_roles row
    await admin.from("user_roles").insert({ user_id: newUserId, role: "admin" }).then(() => {}, () => {});

    return json({ ok: true, clinic_id: clinic.id, user_id: newUserId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  function json(b: unknown, status = 200) {
    return new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
