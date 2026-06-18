// Sign URL or delete an archive
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "clinic-archives";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Invalid session" }, 401);

    const { data: profile } = await admin.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_super_admin) return json({ error: "Super admin required" }, 403);

    const { action, archive_id } = await req.json();
    if (!archive_id) return json({ error: "archive_id required" }, 400);

    const { data: archive } = await admin.from("clinic_archives").select("*").eq("id", archive_id).single();
    if (!archive) return json({ error: "Not found" }, 404);

    if (action === "download") {
      if (!archive.storage_path) return json({ error: "Archive not ready" }, 400);
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(archive.storage_path, 600);
      if (error) return json({ error: error.message }, 500);
      return json({ url: data.signedUrl });
    }

    if (action === "delete") {
      if (archive.storage_path) {
        await admin.storage.from(BUCKET).remove([archive.storage_path]);
      }
      await admin.from("clinic_archives").update({ status: "deleted", storage_path: null }).eq("id", archive_id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message || "Unhandled" }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
