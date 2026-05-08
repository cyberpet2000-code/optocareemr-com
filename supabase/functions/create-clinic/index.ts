// Super-admin only: provisions auth user + clinic + profile atomically.
// Reuses an existing auth user when the email is already registered.
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

  // Lookup user by email via the admin REST API (listUsers supports an email filter).
  async function findUserIdByEmail(email: string): Promise<string | null> {
    try {
      const r = await fetch(
        `${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      );
      if (r.ok) {
        const body = await r.json();
        const list = Array.isArray(body) ? body : body?.users ?? [];
        const lower = email.toLowerCase();
        const found = list.find((u: any) => (u?.email || "").toLowerCase() === lower);
        if (found?.id) return found.id;
      } else {
        console.warn("admin users filter HTTP", r.status, await r.text());
      }
    } catch (e) {
      console.warn("admin users filter failed", e);
    }
    return null;
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

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

    const email = String(admin_email).trim();

    // 1) Resolve auth user — reuse existing if email is registered, else create.
    let userId: string | null = await findUserIdByEmail(email);
    let userWasCreated = false;

    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: admin_password,
        email_confirm: true,
        user_metadata: { full_name: admin_full_name },
      });

      if (createErr || !created?.user) {
        // Common race: user/profile got created by another path; try to recover the id.
        const msg = (createErr?.message || "").toLowerCase();
        const looksDuplicate =
          msg.includes("already") || msg.includes("registered") ||
          msg.includes("duplicate") || msg.includes("exists");
        if (looksDuplicate) {
          userId = await findUserIdByEmail(email);
        }
        if (!userId) {
          console.error("createUser failed", createErr);
          return json({ error: createErr?.message || "User create failed" }, 400);
        }
      } else {
        userId = created.user.id;
        userWasCreated = true;
      }
    }

    // 2) Guard: if existing user is already an admin of another clinic, refuse.
    const { data: existingProfile } = await admin
      .from("profiles").select("clinic_id, role").eq("id", userId).maybeSingle();
    if (!userWasCreated && existingProfile?.clinic_id) {
      return json({ error: "This user is already assigned to a clinic" }, 409);
    }

    // 3) Create clinic
    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 14 * 86400000);
    const { data: clinic, error: clinicErr } = await admin
      .from("clinics")
      .insert({
        name: clinic_name,
        phone: phone || null,
        email,
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
      // Rollback: only delete the user if we created them in this call.
      if (userWasCreated && userId) {
        await admin.auth.admin.deleteUser(userId).catch((e) => console.warn("rollback deleteUser failed", e));
      }
      return json({ error: clinicErr?.message || "Clinic insert failed" }, 400);
    }

    // 4) Upsert profile (avoids duplicate-key on existing users / triggers)
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: admin_full_name,
          role: "admin",
          clinic_id: clinic.id,
          phone: phone || null,
        },
        { onConflict: "id" },
      );
    if (profileErr) {
      console.error("profile upsert failed", profileErr);
      // Rollback created clinic + new user
      await admin.from("clinics").delete().eq("id", clinic.id).catch(() => {});
      if (userWasCreated && userId) {
        await admin.auth.admin.deleteUser(userId).catch(() => {});
      }
      return json({ error: profileErr.message }, 400);
    }

    // 5) Link via clinic_users (idempotent)
    await admin
      .from("clinic_users")
      .upsert({ user_id: userId, clinic_id: clinic.id, role: "admin" } as any, {
        onConflict: "user_id,clinic_id",
      })
      .then(
        () => {},
        (e) => console.warn("clinic_users link failed", e),
      );

    // 6) Grant admin role (ignore unique-conflict)
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: "admin" } as any);
    if (roleErr && !String(roleErr.message || "").toLowerCase().includes("duplicate")) {
      console.warn("user_roles insert warning", roleErr);
    }

    return json({ ok: true, clinic_id: clinic.id, user_id: userId, reused_user: !userWasCreated });
  } catch (e) {
    console.error("create-clinic fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
