import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Invalid token" }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerProfile } = await adminClient
      .from("user_profiles").select("role").eq("id", caller.id).maybeSingle();
    if (callerProfile?.role !== "admin") return json({ error: "Admin access required" }, 403);

    const body = await req.json();
    const { action, user_id, password, email } = body;

    if (!user_id) return json({ error: "user_id is required" }, 400);

    // ── Delete user ────────────────────────────────────────────────────────────
    if (action === "delete") {
      const { error: delErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (delErr) return json({ error: delErr.message }, 400);
      // user_profiles row will cascade-delete via FK
      return json({ success: true });
    }

    // ── Update email / password in auth.users ──────────────────────────────────
    const authUpdate: Record<string, unknown> = {};
    if (password) {
      if (password.length < 6) return json({ error: "A senha deve ter no mínimo 6 caracteres." }, 400);
      authUpdate.password = password;
    }
    if (email) authUpdate.email = email;

    if (Object.keys(authUpdate).length > 0) {
      const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id, authUpdate);
      if (authErr) return json({ error: authErr.message }, 400);
    }

    // Also persist email in user_profiles so it can be displayed
    if (email) {
      await adminClient.from("user_profiles").update({ email }).eq("id", user_id);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
