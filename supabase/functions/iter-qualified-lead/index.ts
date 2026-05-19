import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadPayload = {
  profissao?: string;
  renda?: string;
  desafio?: string;
  urgencia?: string;
  nome?: string;
  whatsapp?: string;
  email?: string;
  timestamp?: string;
  isICP?: boolean;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeDigits(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function formatNotificationText(lead: Required<LeadPayload>) {
  return [
    "Novo lead qualificado - ITER",
    "",
    `Nome: ${lead.nome}`,
    `WhatsApp: ${lead.whatsapp}`,
    `E-mail: ${lead.email}`,
    `Profissao: ${lead.profissao}`,
    `Renda: ${lead.renda}`,
    `Desafio: ${lead.desafio}`,
    `Urgencia: ${lead.urgencia}`,
    `Enviado em: ${lead.timestamp}`,
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: LeadPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const requiredFields = ["profissao", "renda", "desafio", "urgencia", "nome", "whatsapp", "email", "timestamp"] as const;
  for (const field of requiredFields) {
    if (!payload[field] || typeof payload[field] !== "string") {
      return jsonResponse({ error: `Missing field: ${field}` }, 400);
    }
  }

  const lead = payload as Required<LeadPayload>;
  const isICP = typeof payload.isICP === "boolean"
    ? payload.isICP
    : !((lead.profissao !== "medico") && (lead.renda === "ate10k"));

  if (!isICP) {
    return jsonResponse({ notified: false, skipped: true, reason: "lead_not_qualified" });
  }

  const subdomain = Deno.env.get("UAZAPI_SUBDOMAIN");
  const token = Deno.env.get("UAZAPI_INSTANCE_TOKEN");
  const notifyNumber = normalizeDigits(Deno.env.get("ITER_NOTIFY_NUMBER"));

  if (!subdomain || !token || !notifyNumber) {
    return jsonResponse({
      error: "Edge Function is missing UAZAPI_SUBDOMAIN, UAZAPI_INSTANCE_TOKEN, or ITER_NOTIFY_NUMBER secrets.",
    }, 503);
  }

  const response = await fetch(`https://${subdomain}.uazapi.com/send/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({
      number: notifyNumber,
      text: formatNotificationText(lead),
      async: false,
    }),
  });

  let result: unknown = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }

  if (!response.ok) {
    return jsonResponse({
      error: "Uazapi request failed",
      status: response.status,
      details: result,
    }, 502);
  }

  return jsonResponse({
    notified: true,
    provider: "uazapi",
    result,
  });
});
