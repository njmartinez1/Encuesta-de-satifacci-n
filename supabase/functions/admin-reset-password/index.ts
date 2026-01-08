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

  let payload: { user_id?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = (payload.user_id ?? "").trim();
  const password = (payload.password ?? "123456").trim();

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing user_id." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(userId);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "User not found." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const currentMetadata = userData.user.user_metadata ?? {};

  const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
    password,
    user_metadata: { ...currentMetadata, must_change_password: true },
  });

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
