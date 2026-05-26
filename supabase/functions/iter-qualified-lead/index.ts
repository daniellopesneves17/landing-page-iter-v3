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
};

const labelMap = {
  profissao: {
    medico: "Medico",
    saude: "Profissional da Saude",
    empresario: "Empresario",
    outro: "Outro Perfil",
  },
  renda: {
    ate10k: "Ate R$ 10.000",
    "10k20k": "R$ 10.001 a R$ 20.000",
    "20k30k": "R$ 20.001 a R$ 30.000",
    "30k50k": "R$ 30.001 a R$ 50.000",
    acima50k: "Acima de R$ 50.000",
  },
  desafio: {
    dividas: "Sair das dividas",
    fluxo: "Organizar o fluxo de caixa",
    investir: "Investir melhor o que tenho",
    proteger: "Proteger familia e patrimonio",
    visao: "Visao completa de tudo",
  },
  urgencia: {
    agora: "Agora - ja esta na hora",
    meses: "Nos proximos meses",
    pesquisando: "Ainda estou pesquisando",
  },
} as const;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function labelFor<T extends keyof typeof labelMap>(field: T, value?: string) {
  const labels = labelMap[field] as Record<string, string>;
  return value ? labels[value] ?? value : "Nao informado";
}

function isQualifiedLead(payload: LeadPayload) {
  return payload.profissao === "medico" && payload.renda !== "ate10k";
}

function buildNotificationMessage(payload: LeadPayload) {
  return [
    "Novo lead qualificado ITER",
    "",
    `Nome: ${payload.nome || "Nao informado"}`,
    `WhatsApp: ${payload.whatsapp || "Nao informado"}`,
    `E-mail: ${payload.email || "Nao informado"}`,
    `Profissao: ${labelFor("profissao", payload.profissao)}`,
    `Renda mensal: ${labelFor("renda", payload.renda)}`,
    `Maior desafio: ${labelFor("desafio", payload.desafio)}`,
    `Urgencia: ${labelFor("urgencia", payload.urgencia)}`,
    `Enviado em: ${payload.timestamp || new Date().toISOString()}`,
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
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (!isQualifiedLead(payload)) {
    return jsonResponse({ notified: false, reason: "Lead is not qualified" });
  }

  const serverUrl = Deno.env.get("UAZAPI_SERVER_URL") ||
    (Deno.env.get("UAZAPI_SUBDOMAIN")
      ? `https://${Deno.env.get("UAZAPI_SUBDOMAIN")}.uazapi.com`
      : "");
  const token = Deno.env.get("UAZAPI_INSTANCE_TOKEN");
  const notifyNumber = Deno.env.get("ITER_NOTIFY_NUMBER") || "553899478257";

  if (!serverUrl || !token || !notifyNumber) {
    return jsonResponse({
      error: "Edge Function is missing UAZAPI_SERVER_URL/UAZAPI_SUBDOMAIN, UAZAPI_INSTANCE_TOKEN, or ITER_NOTIFY_NUMBER secrets.",
    }, 500);
  }

  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/send/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify({
      number: notifyNumber,
      text: buildNotificationMessage(payload),
      linkPreview: false,
      async: true,
    }),
  });

  const text = await response.text();
  let uazapiResponse: unknown = text;
  try {
    uazapiResponse = JSON.parse(text);
  } catch {
    uazapiResponse = text;
  }

  if (!response.ok) {
    return jsonResponse({
      notified: false,
      error: "Uazapi request failed",
      status: response.status,
      details: uazapiResponse,
    }, 502);
  }

  return jsonResponse({
    notified: true,
    status: response.status,
    uazapi: uazapiResponse,
  });
});
