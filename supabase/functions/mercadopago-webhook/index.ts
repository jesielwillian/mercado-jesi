import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
const MP_WEBHOOK_SECRET = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifySignature(req: Request, dataId: string) {
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  if (!parts.ts || !parts.v1 || !requestId || !dataId || !MP_WEBHOOK_SECRET) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const expected = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(expected, parts.v1);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Método não permitido." }, 405);
  try {
    const url = new URL(req.url);
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dataId = url.searchParams.get("data.id") || url.searchParams.get("id") || payload?.data?.id || "";
    const type = url.searchParams.get("type") || payload?.type || "";
    if (type && type !== "payment") return json({ received: true, ignored: true });
    if (!dataId) return json({ received: true, ignored: true });
    if (!await verifySignature(req, String(dataId))) return json({ error: "Assinatura inválida." }, 401);

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const payment = await mpResponse.json();
    if (!mpResponse.ok) throw new Error("Não foi possível consultar o pagamento no Mercado Pago.");
    const orderId = String(payment.external_reference || payment.metadata?.order_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Referência de pedido inválida.");

    const { error } = await db.rpc("apply_mercadopago_payment", {
      p_event_id: String(payload?.id || `${dataId}:${payment.status}:${payment.date_last_updated || ""}`),
      p_payment_id: String(payment.id),
      p_order_id: orderId,
      p_status: String(payment.status),
      p_amount: Number(payment.transaction_amount),
      p_currency: String(payment.currency_id),
    });
    if (error) throw error;
    return json({ received: true });
  } catch (error) {
    console.error("mercadopago-webhook", error);
    return json({ error: "Falha ao processar notificação." }, 500);
  }
});
