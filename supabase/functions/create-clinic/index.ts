// Super-admin only: provisions a clinic and links the CURRENTLY AUTHENTICATED user
// as its clinic admin. Does NOT create a new auth user.
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

    // Resolve the caller from their JWT.
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      console.error("getUser failed", userErr);
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;
    const callerEmail = userData.user.email ?? null;

    const admin = createClient(url, serviceKey);

    // verify caller is super_admin
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "super_admin").maybeSingle();
    const { data: callerProfile } = await admin
      .from("profiles").select("is_super_admin, role, full_name, phone").eq("id", callerId).maybeSingle();
    const isSuper = !!roleRow || !!callerProfile?.is_super_admin || callerProfile?.role === "super_admin";
    if (!isSuper) return json({ error: "Forbidden — super admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const { clinic_name, phone } = body ?? {};

    if (!clinic_name || !String(clinic_name).trim()) {
      return json({ error: "Clinic name is required" }, 400);
    }

    // 1) Create clinic
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 14 * 86400000);
    const { data: clinic, error: clinicErr } = await admin
      .from("clinics")
      .insert({
        name: String(clinic_name).trim(),
        phone: phone || null,
        email: callerEmail,
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
      console.error("clinic insert failed", clinicErr);
      return json({ error: clinicErr?.message || "Clinic insert failed" }, 400);
    }

    // 2) Ensure caller has a profile (no duplicates — upsert by id).
    //    Do NOT overwrite their primary clinic_id if already set; only fill if null.
    const profilePayload: Record<string, unknown> = {
      id: callerId,
      full_name: callerProfile?.full_name || userData.user.user_metadata?.full_name || callerEmail,
      phone: callerProfile?.phone || phone || null,
    };
    if (!callerProfile) {
      profilePayload.clinic_id = clinic.id;
      profilePayload.role = callerProfile?.role || "super_admin";
    }
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profileErr) {
      console.error("profile upsert failed", profileErr);
      await admin.from("clinics").delete().eq("id", clinic.id).catch(() => {});
      return json({ error: profileErr.message }, 400);
    }

    // 3) Link caller to clinic via clinic_users (idempotent — supports multi-clinic membership)
    const { error: linkErr } = await admin
      .from("clinic_users")
      .upsert(
        { user_id: callerId, clinic_id: clinic.id, role: "admin" } as any,
        { onConflict: "user_id,clinic_id" },
      );
    if (linkErr) {
      console.error("clinic_users link failed", linkErr);
      await admin.from("clinics").delete().eq("id", clinic.id).catch(() => {});
      return json({ error: linkErr.message }, 400);
    }

    // 4) Grant clinic_admin role (ignore unique-conflict)
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: callerId, role: "admin" } as any);
    if (roleErr && !String(roleErr.message || "").toLowerCase().includes("duplicate")) {
      console.warn("user_roles insert warning", roleErr);
    }

    return json({ ok: true, clinic_id: clinic.id, user_id: callerId });
  } catch (e) {
    console.error("create-clinic fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
