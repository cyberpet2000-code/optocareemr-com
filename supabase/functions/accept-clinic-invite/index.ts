// Authenticated user accepts a clinic invite by token.
// Validates the authenticated identity, invitation, email, expiry and
// permitted role before creating clinic-scoped membership/role.
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

    const admin = createClient(url, serviceKey);

    let inviteSource: "clinic_invites" | "invites" | null = null;
    let inviteId: string | null = null;
    let inviteEmail = "";
    let inviteRole = "admin";
    let clinicId: string | null = null;
    let invitedBy: string | null = null;
    let alreadyAccepted = false;
    let inviteExpiresAt: string | null = null;

    const { data: ci, error: ciErr } = await admin
      .from("clinic_invites")
      .select("id, clinic_id, email, role, status, expires_at, invited_by")
      .eq("token", token)
      .maybeSingle();

    if (ciErr) {
      return fail("invite_lookup", `clinic_invites lookup failed: ${ciErr.message}`, 500);
    }

    if (ci) {
      inviteSource = "clinic_invites";
      inviteId = ci.id;
      inviteEmail = (ci.email || "").toLowerCase().trim();
      inviteRole = ci.role || "admin";
      clinicId = ci.clinic_id;
      invitedBy = ci.invited_by || null;
      alreadyAccepted = ci.status === "accepted";
      inviteExpiresAt = ci.expires_at || null;
    } else {
      const { data: legacy, error: legacyErr } = await admin
        .from("invites")
        .select("id, clinic_id, email, role, accepted")
        .eq("token", token)
        .maybeSingle();
      if (legacyErr) {
        return fail("invite_lookup", `legacy invites lookup failed: ${legacyErr.message}`, 500);
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

    if (!inviteSource || !inviteId) {
      return fail("invite_lookup", "Invite not found for the provided token", 404);
    }
    if (alreadyAccepted) {
      return fail("invite_status", "Invite has already been used", 409);
    }
    if (inviteExpiresAt && new Date(inviteExpiresAt).getTime() < Date.now()) {
      if (inviteSource === "clinic_invites") {
        await admin.from("clinic_invites").update({ status: "expired" }).eq("id", inviteId);
      }
      return fail("invite_expired", "This invite has expired. Please ask your super admin for a new one.", 410);
    }
    if (inviteEmail && inviteEmail !== userEmail) {
      return fail("email_check", "Signed-in email does not match the invited email.");
    }
    if (!clinicId) return fail("invite_clinic", "Invite has no associated clinic", 400);

    const normalizedRole = inviteRole === "clinic_admin" ? "admin" : inviteRole;
    const standardRoles = new Set(["admin", "doctor", "nurse", "receptionist"]);
    if (!standardRoles.has(normalizedRole) && normalizedRole !== "super_admin") {
      return fail("invite_role", "This invitation contains an invalid role", 400);
    }

    // Super Admin can only be granted from the current invitation system
    // and only when the invitation was issued by a verified Super Admin.
    if (normalizedRole === "super_admin") {
      if (inviteSource !== "clinic_invites" || !invitedBy) {
        return fail("invite_role", "Super Admin invitations must use the current invitation system.");
      }

      const { data: inviterRole } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", invitedBy)
        .eq("role", "super_admin")
        .maybeSingle();

      const { data: inviterProfile } = await admin
        .from("profiles")
        .select("is_super_admin, role")
        .eq("id", invitedBy)
        .maybeSingle();

      if (
        !inviterRole &&
        inviterProfile?.is_super_admin !== true &&
        inviterProfile?.role !== "super_admin"
      ) {
        return fail("invite_role", "Super Admin invitation was not issued by a verified Super Admin.");
      }
    }

    const { data: clinicRow, error: clinicErr } = await admin
      .from("clinics")
      .select("id, name, setup_completed")
      .eq("id", clinicId)
      .maybeSingle();
    if (clinicErr) return fail("clinic_lookup", clinicErr.message, 500);
    if (!clinicRow) return fail("clinic_lookup", "Clinic no longer exists", 404);

    const { data: existingProfile, error: profileSelErr } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profileSelErr) return fail("profile_lookup", profileSelErr.message, 500);

    if (!existingProfile) {
      const profilePayload: Record<string, unknown> = {
        id: userId,
        full_name: userData.user.user_metadata?.full_name || userEmail,
        clinic_id: clinicId,
        role: normalizedRole,
      };
      const { error: profileInsErr } = await admin.from("profiles").insert(profilePayload as any);
      if (profileInsErr) return fail("profile_create", profileInsErr.message, 500);
    }

    const { data: existingMembership } = await admin
      .from("clinic_users")
      .select("id")
      .eq("user_id", userId)
      .eq("clinic_id", clinicId)
      .maybeSingle();

    const { error: linkErr } = await admin
      .from("clinic_users")
      .upsert(
        { user_id: userId, clinic_id: clinicId, role: normalizedRole } as any,
        { onConflict: "user_id,clinic_id" },
      );
    if (linkErr) return fail("membership_insert", `clinic_users upsert failed: ${linkErr.message}`, 500);

    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: normalizedRole, clinic_id: clinicId } as any);
    if (roleErr && !String(roleErr.message || "").toLowerCase().includes("duplicate")) {
      return fail("role_insert", `user_roles insert failed: ${roleErr.message}`, 500);
    }

    if (inviteSource === "clinic_invites") {
      await admin.from("clinic_invites").update({ status: "accepted" }).eq("id", inviteId);
    } else {
      await admin.from("invites").update({ accepted: true }).eq("id", inviteId);
    }

    await admin.from("activity_logs").insert({
      user_id: userId,
      clinic_id: clinicId,
      action: "invite_accepted",
      table_name: "clinic_invites",
      record_id: inviteId,
    } as any);

    return json({
      ok: true,
      success: true,
      clinic_id: clinicId,
      clinic_name: clinicRow.name,
      setup_completed: !!clinicRow.setup_completed,
      role: normalizedRole,
    });
  } catch (e) {
    console.error("[accept-clinic-invite:fatal]", e);
    return json({ success: false, step: "unhandled", error: (e as Error).message }, 500);
  }
});