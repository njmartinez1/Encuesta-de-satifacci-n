import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.1";

type Template = {
  subject: string;
  heading: string;
  intro: string;
  buttonText: string;
  footer: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SERVICE_ROLE_KEY") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const tenantId = Deno.env.get("M365_TENANT_ID") ?? "";
const clientId = Deno.env.get("M365_CLIENT_ID") ?? "";
const clientSecret = Deno.env.get("M365_CLIENT_SECRET") ?? "";
const senderEmail = Deno.env.get("M365_SENDER_EMAIL") ?? "";
const senderName = Deno.env.get("M365_SENDER_NAME") ?? "Encuestas Reinvented";
const appSiteUrl = Deno.env.get("APP_SITE_URL") ?? Deno.env.get("SITE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const processQueueUrl =
  Deno.env.get("PROCESS_MAGIC_LINK_URL") ??
  (supabaseUrl ? `${supabaseUrl}/functions/v1/process-magic-link-queue` : "");
const missingM365Config = [
  ["M365_TENANT_ID", tenantId],
  ["M365_CLIENT_ID", clientId],
  ["M365_CLIENT_SECRET", clientSecret],
  ["M365_SENDER_EMAIL", senderEmail],
].filter(([, value]) => !value);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const triggerQueueProcessor = async () => {
  if (!processQueueUrl || !anonKey) return;
  try {
    await fetch(processQueueUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Best-effort trigger; cron remains the fallback.
  }
};

const getAuthUserByEmail = async (email: string) => {
  const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });
  const data = await response.json().catch(() => null);
  console.log("ADMIN USERS STATUS", response.status);
  console.log("ADMIN USERS BODY", data);
  if (!response.ok) {
    throw new Error(data?.msg ?? data?.error ?? "Failed to query auth users.");
  }
  // Supabase can return { users: [] }, a user object, or an array depending on version
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  if (Array.isArray(data?.users)) {
    return data.users[0] ?? null;
  }
  return data?.user ?? data ?? null;
};

const getAuthUserById = async (userId: string) => {
  const url = `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.msg ?? data?.error ?? "Failed to query auth user by id.");
  }
  return data?.user ?? data ?? null;
};

const templates: Record<string, Template> = {
  "reinventedpuembo.edu.ec": {
    subject: "Acceso a Encuestas Reinvented - ReinventED Puembo",
    heading: "Acceso a Encuestas Reinvented",
    intro: "Usa el siguiente enlace para ingresar al sistema de evaluaciones.",
    buttonText: "Ingresar",
    footer: "Si no solicitaste este acceso, ignora este mensaje.",
  },
  "reinventedsantaclara.edu.ec": {
    subject: "Acceso a Encuestas Reinvented",
    heading: "Acceso a Encuestas Reinvented",
    intro: "Haz clic en el enlace para continuar con tu evaluación.",
    buttonText: "Continuar",
    footer: "Si no solicitaste este acceso, ignora este mensaje.",
  },
};

const defaultTemplate: Template = {
  subject: "Acceso a Encuestas Reinvented",
  heading: "Acceso a Encuestas Reinvented",
  intro: "Usa el siguiente enlace para ingresar al sistema.",
  buttonText: "Ingresar",
  footer: "Si no solicitaste este acceso, ignora este mensaje.",
};

const buildHtml = (template: Template, actionLink: string) => `
  <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
    <h2 style="margin: 0 0 12px;">${template.heading}</h2>
    <p style="margin: 0 0 16px;">${template.intro}</p>
    <p style="margin: 24px 0;">
      <a href="${actionLink}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">
        ${template.buttonText}
      </a>
    </p>
    <p style="font-size: 12px; color: #64748b;">${template.footer}</p>
  </div>
`;

let cachedGraphToken: { token: string; expiresAt: number } | null = null;

const getGraphToken = async () => {
  if (cachedGraphToken && Date.now() < cachedGraphToken.expiresAt - 60_000) {
    return cachedGraphToken.token;
  }
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("grant_type", "client_credentials");
  params.set("scope", "https://graph.microsoft.com/.default");

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data?.error_description ?? "Failed to get Graph token.");
  }
  const expiresIn = Number(data?.expires_in ?? 0);
  if (Number.isFinite(expiresIn) && expiresIn > 0) {
    cachedGraphToken = {
      token: data.access_token as string,
      expiresAt: Date.now() + expiresIn * 1000,
    };
  }
  return data.access_token as string;
};

  const sendEmail = async (to: string, subject: string, html: string) => {
  if (missingM365Config.length > 0) {
    const missing = missingM365Config.map(([key]) => key).join(", ");
    throw new Error(`Missing Microsoft 365 email configuration: ${missing}`);
  }

  const token = await getGraphToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          from: { emailAddress: { address: senderEmail, name: senderName } },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: "true",
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Send mail failed: ${errorText}`);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload: { email?: string; redirectTo?: string };
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = (payload.email ?? "").trim().toLowerCase();
    const rawRedirectTo = (payload.redirectTo ?? "").trim();
    const sanitizeRedirect = (value: string) => {
      if (!value) return value;
      try {
        const url = new URL(value);
        if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
          return "";
        }
      } catch {
        return "";
      }
      return value;
    };
    const redirectTo = appSiteUrl || sanitizeRedirect(rawRedirectTo);

    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profileData, error: profileError } = await adminClient
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      return new Response(JSON.stringify({ error: "Failed to check profile." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!profileData?.email || !profileData?.id) {
      return new Response(JSON.stringify({ error: "Tu cuenta no tiene acceso.", code: "profile_missing" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let authUser: { id?: string; email?: string } | null = null;
    try {
      authUser = await getAuthUserByEmail(email);
    } catch {
      authUser = null;
    }

    if (!authUser?.id) {
      try {
        authUser = await getAuthUserById(profileData.id);
      } catch {
        authUser = null;
      }
    }

    if (!authUser?.id) {
      return new Response(JSON.stringify({ error: "Tu cuenta no tiene acceso.", code: "auth_missing" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (authUser.email && authUser.email.toLowerCase() !== email) {
      return new Response(JSON.stringify({
        error: "El correo de Auth no coincide con Profiles. Contacta al administrador.",
        code: "auth_email_mismatch",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: queueError } = await adminClient
      .from("magic_link_queue")
      .insert({ email, redirect_to: redirectTo || null });

    if (queueError) {
      return new Response(JSON.stringify({ error: "Failed to queue magic link." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fire-and-forget to speed up delivery; cron remains the fallback.
    void triggerQueueProcessor();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-magic-link error", error);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
