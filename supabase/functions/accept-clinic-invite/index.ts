// Authenticated user accepts a clinic invite by token.
// Validates the email matches, then assigns clinic_admin (admin) role.
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

    const { data: invite, error: invErr } = await admin
      .from("invites")
      .select("id, clinic_id, email, role, accepted")
      .eq("token", token)
      .maybeSingle();
    if (invErr || !invite) return json({ error: "Invite not found or expired" }, 404);
    if (invite.accepted) return json({ error: "Invite already used" }, 409);

    const inviteEmail = (invite.email || "").toLowerCase();
    if (inviteEmail && inviteEmail !== userEmail) {
      return json({ error: `This invite is for ${invite.email}. Sign in with that email to accept.` }, 403);
    }

    const role = invite.role || "admin";
    const clinicId = invite.clinic_id;
    if (!clinicId) return json({ error: "Invite has no clinic" }, 400);

    // Get clinic name for response
    const { data: clinicRow } = await admin.from("clinics").select("id, name, setup_completed").eq("id", clinicId).maybeSingle();
    if (!clinicRow) return json({ error: "Clinic no longer exists" }, 404);

    // Link membership (idempotent)
    const { error: linkErr } = await admin
      .from("clinic_users")
      .upsert({ user_id: userId, clinic_id: clinicId, role } as any, { onConflict: "user_id,clinic_id" });
    if (linkErr) {
      console.error("clinic_users link failed", linkErr);
      return json({ error: linkErr.message }, 400);
    }

    // Assign role in user_roles (scoped to clinic)
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role, clinic_id: clinicId } as any);
    if (roleErr && !String(roleErr.message || "").toLowerCase().includes("duplicate")) {
      console.error("user_roles insert failed", roleErr);
      return json({ error: roleErr.message }, 400);
    }

    // Ensure profile exists
    const { data: existingProfile } = await admin.from("profiles").select("id, clinic_id").eq("id", userId).maybeSingle();
    const profilePayload: Record<string, unknown> = { id: userId };
    if (!existingProfile) {
      profilePayload.full_name = userData.user.user_metadata?.full_name || userEmail;
      profilePayload.clinic_id = clinicId;
      profilePayload.role = role;
    }
    await admin.from("profiles").upsert(profilePayload, { onConflict: "id" });

    // Mark invite accepted
    await admin.from("invites").update({ accepted: true } as any).eq("id", invite.id);

    console.log("Invite accepted", { user_id: userId, clinic_id: clinicId, role });
    return json({
      ok: true,
      clinic_id: clinicId,
      clinic_name: clinicRow.name,
      setup_completed: !!clinicRow.setup_completed,
      role,
    });
  } catch (e) {
    console.error("accept-clinic-invite fatal", e);
    return json({ error: (e as Error).message }, 500);
  }
});
