import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY.");
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

  let payload: { email?: string; name?: string; role?: string; is_admin?: boolean };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const name = (payload.name ?? "").trim();
  const role = (payload.role ?? "").trim();
  const isAdmin = Boolean(payload.is_admin);

  if (!email || !name || !role) {
    return new Response(JSON.stringify({ error: "Missing required fields." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: "123456",
    email_confirm: true,
    user_metadata: { full_name: name, must_change_password: true },
  });

  if (createError || !createData?.user?.id) {
    return new Response(JSON.stringify({ error: createError?.message ?? "Failed to create user." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = createData.user.id;

  await adminClient.from("allowed_emails").upsert({ email });

  await adminClient.from("profiles").upsert({
    id: userId,
    email,
    name,
    role,
    is_admin: isAdmin,
  });

  return new Response(
    JSON.stringify({
      profile: { id: userId, email, name, role, is_admin: isAdmin },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
