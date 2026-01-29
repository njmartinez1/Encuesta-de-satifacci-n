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

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SERVICE_ROLE_KEY.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

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

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    }
  );

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

const backoffMinutes = (attempts: number) => {
  if (attempts <= 1) return 1;
  if (attempts === 2) return 5;
  if (attempts === 3) return 15;
  return 30;
};

serve(async () => {
  const missing = [
    ["M365_TENANT_ID", tenantId],
    ["M365_CLIENT_ID", clientId],
    ["M365_CLIENT_SECRET", clientSecret],
    ["M365_SENDER_EMAIL", senderEmail],
    ["APP_SITE_URL", appSiteUrl],
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    const keys = missing.map(([key]) => key).join(", ");
    return new Response(JSON.stringify({ error: `Missing config: ${keys}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: queueRows, error } = await adminClient
    .from("magic_link_queue")
    .select("id, email, redirect_to, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to load queue." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: { id: string; status: string; error?: string }[] = [];

  for (const row of queueRows || []) {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email) continue;

    try {
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: appSiteUrl,
          shouldCreateUser: false,
        },
      });

      if (linkError) {
        throw new Error(linkError.message);
      }

      const actionLink =
        (linkData as any)?.properties?.action_link ??
        (linkData as any)?.action_link;
      if (!actionLink) {
        throw new Error("Missing action link.");
      }

      const domain = email.split("@")[1] ?? "";
      const template = templates[domain] ?? defaultTemplate;
      const html = buildHtml(template, actionLink);

      await sendEmail(email, template.subject, html);

      await adminClient
        .from("magic_link_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);

      results.push({ id: row.id, status: "sent" });
    } catch (err) {
      const attempts = Number(row.attempts ?? 0) + 1;
      const delayMinutes = backoffMinutes(attempts);
      const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();

      await adminClient
        .from("magic_link_queue")
        .update({
          status: attempts >= 5 ? "failed" : "pending",
          attempts,
          last_error: err instanceof Error ? err.message : "Send failed",
          next_attempt_at: nextAttempt,
        })
        .eq("id", row.id);

      results.push({
        id: row.id,
        status: attempts >= 5 ? "failed" : "pending",
        error: err instanceof Error ? err.message : "Send failed",
      });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
