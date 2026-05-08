// Authenticated user accepts a clinic invite by token.
// Reads from clinic_invites (preferred), falls back to legacy `invites` table.
// Validates email match, links membership, assigns clinic-scoped role.
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
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized — please sign in" }, 401);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const userId = userData.user.id;
    const userEmail = (userData.user.email || "").toLowerCase();

    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body?.token;
    if (!token) return json({ error: "Token required" }, 400);

    const admin = createClient(url, serviceKey);

    // Try clinic_invites first
    let inviteSource: "clinic_invites" | "invites" | null = null;
    let inviteId: string | null = null;
    let inviteEmail = "";
    let inviteRole = "admin";
    let clinicId: string | null = null;
    let alreadyAccepted = false;

    const { data: ci } = await admin
      .from("clinic_invites")
      .select("id, clinic_id, email, role, status")
      .eq("token", token)
      .maybeSingle();

    if (ci) {
      inviteSource = "clinic_invites";
      inviteId = ci.id;
      inviteEmail = (ci.email || "").toLowerCase();
      inviteRole = ci.role || "admin";
      clinicId = ci.clinic_id;
      alreadyAccepted = ci.status === "accepted";
    } else {
      const { data: legacy } = await admin
        .from("invites")
        .select("id, clinic_id, email, role, accepted")
        .eq("token", token)
        .maybeSingle();
      if (legacy) {
        inviteSource = "invites";
        inviteId = legacy.id;
        inviteEmail = (legacy.email || "").toLowerCase();
        inviteRole = legacy.role || "admin";
        clinicId = legacy.clinic_id;
        alreadyAccepted = !!legacy.accepted;
      }
    }

    if (!inviteSource || !inviteId) return json({ error: "Invite not found or expired" }, 404);
    if (alreadyAccepted) return json({ error: "Invite already used" }, 409);
    if (inviteEmail && inviteEmail !== userEmail) {
      return json({ error: `This invite is for ${inviteEmail}. Sign in with that email to accept.` }, 403);
    }
    if (!clinicId) return json({ error: "Invite has no clinic" }, 400);

    // Normalize role: "clinic_admin" → "admin" for clinic_users; keep original for user_roles
    const membershipRole = inviteRole === "clinic_admin" ? "admin" : inviteRole;
    const scopedRole = inviteRole === "clinic_admin" ? "admin" : inviteRole;

    const { data: clinicRow } = await admin.from("clinics")
      .select("id, name, setup_completed").eq("id", clinicId).maybeSingle();
    if (!clinicRow) return json({ error: "Clinic no longer exists" }, 404);

    // Link membership
    const { error: linkErr } = await admin
      .from("clinic_users")
      .upsert({ user_id: userId, clinic_id: clinicId, role: membershipRole } as any,
        { onConflict: "user_id,clinic_id" });
    if (linkErr) {
      console.error("clinic_users link failed", linkErr);
      return json({ error: linkErr.message }, 400);
    }

    // Scoped role in user_roles
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: scopedRole, clinic_id: clinicId } as any);
    if (roleErr && !String(roleErr.message || "").toLowerCase().includes("duplicate")) {
      console.error("user_roles insert failed", roleErr);
      return json({ error: roleErr.message }, 400);
    }

    // Ensure profile
    const { data: existingProfile } = await admin.from("profiles")
      .select("id").eq("id", userId).maybeSingle();
    const profilePayload: Record<string, unknown> = { id: userId };
    if (!existingProfile) {
      profilePayload.full_name = userData.user.user_metadata?.full_name || userEmail;
      profilePayload.clinic_id = clinicId;
      profilePayload.role = scopedRole;
    }
    await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });

    // Mark invite accepted
    if (inviteSource === "clinic_invites") {
      await admin.from("clinic_invites").update({ status: "accepted" } as any).eq("id", inviteId);
    } else {
      await admin.from("invites").update({ accepted: true } as any).eq("id", inviteId);
    }

    console.log("Invite accepted", { user_id: userId, clinic_id: clinicId, role: scopedRole, source: inviteSource });
    return json({
      ok: true,
      clinic_id: clinicId,
      clinic_name: clinicRow.name,
      setup_completed: !!clinicRow.setup_completed,
      role: scopedRole,
    });
  } catch (e) {
    console.error("accept-clinic-invite fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
