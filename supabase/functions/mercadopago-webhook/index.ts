import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function verifySignature(req: Request, dataId: string): Promise<boolean> {
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";

  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );

  if (!parts.ts || !parts.v1 || !requestId || !dataId || !MP_WEBHOOK_SECRET) {
    return false;
  }

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(manifest),
  );

  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return constantTimeEqual(expected, parts.v1);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Método não permitido." }, 405);
  }

  try {
    if (!MP_ACCESS_TOKEN || !SERVICE_ROLE_KEY || !MP_WEBHOOK_SECRET) {
      throw new Error("Variáveis de ambiente obrigatórias não configuradas.");
    }

    const url = new URL(req.url);

    const payload =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const dataId = String(
      url.searchParams.get("data.id") ||
        payload?.data?.id ||
        url.searchParams.get("id") ||
        "",
    );

    const type = (
      url.searchParams.get("type") ||
      payload?.type ||
      ""
    ).toLowerCase();

    const topic = (
      url.searchParams.get("topic") ||
      payload?.topic ||
      ""
    ).toLowerCase();

    // Ignora notificações que não sejam de pagamento.
    if (topic === "merchant_order" || (type && !type.startsWith("payment"))) {
      return json({ received: true, ignored: true });
    }

    if (!dataId) {
      return json({ received: true, ignored: true });
    }

    // Valida a assinatura antes de consultar ou alterar dados.
    const signatureValid = await verifySignature(req, dataId);

    if (!signatureValid) {
      console.error("Webhook rejeitado: assinatura inválida.");
      return json({ error: "Assinatura inválida." }, 401);
    }

    // Consulta os dados oficiais do pagamento no Mercado Pago.
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    const payment = await mpResponse.json().catch(() => null);

    if (!mpResponse.ok) {
      console.error("MERCADO PAGO API ERROR:", {
        httpStatus: mpResponse.status,
        error: payment?.error,
        message: payment?.message,
        cause: payment?.cause,
      });

      throw new Error(
        `Mercado Pago retornou HTTP ${mpResponse.status}: ${
          payment?.message || payment?.error || "Erro desconhecido"
        }`,
      );
    }

    if (!payment?.id || !payment?.status) {
      throw new Error("Resposta inválida do Mercado Pago.");
    }

    const orderId = String(
      payment.external_reference || payment.metadata?.order_id || "",
    );

    if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
      throw new Error("Referência de pedido inválida.");
    }

    const amount = Number(payment.transaction_amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Valor do pagamento inválido.");
    }

    const eventId = String(
      payload?.id ||
        `${dataId}:${payment.status}:${payment.date_last_updated || ""}`,
    );

    // Atualiza o pedido por meio da função SQL existente.
    const { error } = await db.rpc("apply_mercadopago_payment", {
      p_event_id: eventId,
      p_payment_id: String(payment.id),
      p_order_id: orderId,
      p_status: String(payment.status),
      p_amount: amount,
      p_currency: String(payment.currency_id),
    });

    if (error) {
      console.error("SUPABASE RPC ERROR:", error);
      throw error;
    }

    const queueHeaders = { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
    await Promise.all(["process-whatsapp-queue", "process-email-queue"].map(async (queueName) => {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/${queueName}`, {
          method: "POST", headers: queueHeaders, body: "{}",
        });
        if (!response.ok) console.warn(`${queueName} returned HTTP ${response.status}`);
      } catch (queueError) {
        console.warn(`${queueName} skipped:`, queueError);
      }
    }));

    console.log("Pagamento processado:", {
      paymentId: payment.id,
      orderId,
      status: payment.status,
      amount,
    });

    return json({ received: true, processed: true });
  } catch (error) {
    console.error("MERCADOPAGO WEBHOOK ERROR:", error);

    return json({ error: "Falha ao processar notificação." }, 500);
  }
});
