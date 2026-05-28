// Authenticated user accepts a clinic invite by token.
// Reads from clinic_invites (preferred), falls back to legacy `invites` table.
// Validates email match, links membership, assigns clinic-scoped role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

type StepError = { step: string; error: string; details?: unknown };

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

  const fail = (step: string, error: string, status = 403, details?: unknown) => {
    const payload: StepError & { success: false } = { success: false, step, error };
    if (details !== undefined) payload.details = details;
    console.error("[accept-clinic-invite:fail]", payload);
    return json(payload, status);
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail("auth_header", "Missing Bearer token — please sign in again", 401);
    }

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return fail("auth_user", userErr?.message ?? "Could not resolve authenticated user", 401);
    }

    const userId = userData.user.id;
    const userEmail = (userData.user.email || "").toLowerCase().trim();

    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;
    if (!token) return fail("token_missing", "Token required", 400);

    console.log("[accept-clinic-invite:start]", {
      token_prefix: token.slice(0, 8),
      user_id: userId,
      user_email: userEmail,
    });

    const admin = createClient(url, serviceKey);

    // ---- Invite lookup --------------------------------------------------
    let inviteSource: "clinic_invites" | "invites" | null = null;
    let inviteId: string | null = null;
    let inviteEmail = "";
    let inviteRole = "admin";
    let clinicId: string | null = null;
    let alreadyAccepted = false;
    let inviteExpiresAt: string | null = null;

    const { data: ci, error: ciErr } = await admin
      .from("clinic_invites")
      .select("id, clinic_id, email, role, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (ciErr) {
      return fail("invite_lookup", `clinic_invites lookup failed: ${ciErr.message}`, 500, ciErr);
    }

    if (ci) {
      inviteSource = "clinic_invites";
      inviteId = ci.id;
      inviteEmail = (ci.email || "").toLowerCase().trim();
      inviteRole = ci.role || "admin";
      clinicId = ci.clinic_id;
      alreadyAccepted = ci.status === "accepted";
      inviteExpiresAt = (ci as any).expires_at || null;
    } else {
      const { data: legacy, error: legacyErr } = await admin
        .from("invites")
        .select("id, clinic_id, email, role, accepted")
        .eq("token", token)
        .maybeSingle();
      if (legacyErr) {
        return fail("invite_lookup", `legacy invites lookup failed: ${legacyErr.message}`, 500, legacyErr);
      }
      if (legacy) {
        inviteSource = "invites";
        inviteId = legacy.id;
        inviteEmail = (legacy.email || "").toLowerCase().trim();
        inviteRole = legacy.role || "admin";
        clinicId = legacy.clinic_id;
        alreadyAccepted = !!legacy.accepted;
      }
    }

    console.log("[accept-clinic-invite:invite]", {
      inviteSource,
      inviteId,
      inviteEmail,
      inviteRole,
      clinicId,
      alreadyAccepted,
      inviteExpiresAt,
    });

    if (!inviteSource || !inviteId) {
      return fail("invite_lookup", "Invite not found for the provided token", 404);
    }
    if (alreadyAccepted) {
      return fail("invite_status", "Invite has already been used", 409);
    }
    if (inviteExpiresAt && new Date(inviteExpiresAt).getTime() < Date.now()) {
      if (inviteSource === "clinic_invites") {
        await admin.from("clinic_invites").update({ status: "expired" } as any).eq("id", inviteId);
      }
      return fail("invite_expired", "This invite has expired. Please ask your super admin for a new one.", 410);
    }
    if (inviteEmail && inviteEmail !== userEmail) {
      return fail(
        "email_check",
        `Signed-in email (${userEmail}) does not match invited email (${inviteEmail}). Sign in with the invited email.`,
      );
    }
    if (!clinicId) {
      return fail("invite_clinic", "Invite has no associated clinic", 400);
    }

    // ---- Normalize roles ------------------------------------------------
    const membershipRole = inviteRole === "clinic_admin" ? "admin" : inviteRole;
    const scopedRole = inviteRole === "clinic_admin" ? "admin" : inviteRole;

    const { data: clinicRow, error: clinicErr } = await admin
      .from("clinics")
      .select("id, name, setup_completed")
      .eq("id", clinicId)
      .maybeSingle();
    if (clinicErr) return fail("clinic_lookup", clinicErr.message, 500, clinicErr);
    if (!clinicRow) return fail("clinic_lookup", "Clinic no longer exists", 404);

    // ---- Ensure profile FIRST (clinic_users.user_id FK -> profiles.id) --
    const { data: existingProfile, error: profileSelErr } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileSelErr) {
      return fail("profile_lookup", profileSelErr.message, 500, profileSelErr);
    }
    if (!existingProfile) {
      const profilePayload: Record<string, unknown> = {
        id: userId,
        full_name: userData.user.user_metadata?.full_name || userEmail,
        clinic_id: clinicId,
        role: scopedRole,
      };
      const { error: profileInsErr } = await admin
        .from("profiles")
        .insert(profilePayload as any);
      if (profileInsErr) {
        return fail("profile_create", profileInsErr.message, 500, profileInsErr);
      }
    }

    // ---- Membership -----------------------------------------------------
    const { data: existingMembership } = await admin
      .from("clinic_users")
      .select("id")
      .eq("user_id", userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const { error: linkErr } = await admin
      .from("clinic_users")
      .upsert(
        { user_id: userId, clinic_id: clinicId, role: membershipRole } as any,
        { onConflict: "user_id,clinic_id" },
      );
    if (linkErr) {
      return fail("membership_insert", `clinic_users upsert failed: ${linkErr.message}`, 500, linkErr);
    }

    // ---- Scoped role ----------------------------------------------------
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: scopedRole, clinic_id: clinicId } as any);
    if (roleErr && !String(roleErr.message || "").toLowerCase().includes("duplicate")) {
      return fail("role_insert", `user_roles insert failed: ${roleErr.message}`, 500, roleErr);
    }

    // ---- Mark invite accepted -------------------------------------------
    if (inviteSource === "clinic_invites") {
      await admin.from("clinic_invites").update({ status: "accepted" } as any).eq("id", inviteId);
    } else {
      await admin.from("invites").update({ accepted: true } as any).eq("id", inviteId);
    }

    await admin.from("activity_logs").insert({
      user_id: userId,
      clinic_id: clinicId,
      action: "invite_accepted",
      table_name: "clinic_invites",
      record_id: inviteId,
    } as any);

    console.log("[accept-clinic-invite:ok]", {
      user_id: userId,
      clinic_id: clinicId,
      role: scopedRole,
      source: inviteSource,
      membership_existed: !!existingMembership,
    });

    return json({
      ok: true,
      success: true,
      clinic_id: clinicId,
      clinic_name: clinicRow.name,
      setup_completed: !!clinicRow.setup_completed,
      role: scopedRole,
    });
  } catch (e) {
    console.error("[accept-clinic-invite:fatal]", e);
    return json(
      { success: false, step: "unhandled", error: (e as Error).message },
      500,
    );
  }
});
