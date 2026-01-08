import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing auth token." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: adminProfile, error: adminProfileError } = await adminClient
    .from("profiles")
    .select("is_admin")
    .eq("id", authData.user.id)
    .single();

  if (adminProfileError || !adminProfile?.is_admin) {
    return new Response(JSON.stringify({ error: "Forbidden." }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: { password?: string };
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const password = (payload.password ?? "123456").trim();
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "Password must be at least 6 characters." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let page = 1;
  const perPage = 200;
  let updated = 0;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const users = data?.users ?? [];
    if (users.length === 0) break;

    for (const user of users) {
      const currentMetadata = user.user_metadata ?? {};
      const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: { ...currentMetadata, must_change_password: true },
      });
      if (updateError) {
        return new Response(JSON.stringify({ error: updateError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      updated += 1;
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return new Response(
    JSON.stringify({ updated }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
