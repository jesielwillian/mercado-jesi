import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "order_tracking";
const SITE_URL = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const digits = (value: string) => value.replace(/\D/g, "");
const statusLabel: Record<string, string> = {
  pending: "está aguardando confirmação",
  confirmed: "foi confirmado",
  preparing: "está em preparação",
  ready: "está pronto para retirada",
  out_for_delivery: "saiu para entrega",
  completed: "foi concluído",
  cancelled: "foi cancelado",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE}`) {
    return json({ error: "Acesso interno não autorizado." }, 401);
  }
  if (!TOKEN || !PHONE_ID || !SITE_URL) {
    return json({ error: "WhatsApp Business não configurado: informe token, número e SITE_URL." }, 503);
  }

  try {
    const { data: rows, error } = await db.from("whatsapp_notifications")
      .select("id,order_id,phone,event_type,attempts")
      .eq("status", "pending").lt("attempts", 5)
      .order("created_at", { ascending: true }).limit(20);
    if (error) throw error;

    let sent = 0, failed = 0;
    for (const row of rows || []) {
      const phone = digits(String(row.phone || ""));
      const { data: order, error: orderError } = await db.from("orders")
        .select("order_number,tracking_code,customer_name,status")
        .eq("id", row.order_id).single();
      if (orderError || !order || phone.length < 10 || !order.tracking_code) {
        await db.from("whatsapp_notifications").update({
          status: "failed", attempts: row.attempts + 1,
          last_error: orderError?.message || "Pedido, telefone ou código de rastreamento inválido",
        }).eq("id", row.id);
        failed++;
        continue;
      }

      const eventText = row.event_type === "order_created"
        ? "Recebemos seu pedido"
        : `Atualização: seu pedido ${statusLabel[order.status] || "foi atualizado"}`;
      const trackingUrl = `${SITE_URL}/rastreamento.html`;
      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: TEMPLATE,
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: [
            { type: "text", text: String(order.customer_name || "Cliente").slice(0, 100) },
            { type: "text", text: eventText },
            { type: "text", text: String(order.order_number) },
            { type: "text", text: String(order.tracking_code) },
            { type: "text", text: trackingUrl },
          ] }],
        },
      };

      const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        await db.from("whatsapp_notifications").update({
          status: row.attempts + 1 >= 5 ? "failed" : "pending",
          attempts: row.attempts + 1,
          last_error: String(result?.error?.message || `HTTP ${response.status}`).slice(0, 1000),
        }).eq("id", row.id);
        failed++;
        continue;
      }
      await db.from("whatsapp_notifications").update({
        status: "sent", attempts: row.attempts + 1,
        sent_at: new Date().toISOString(),
        provider_message_id: result?.messages?.[0]?.id || null,
        last_error: null,
      }).eq("id", row.id);
      sent++;
    }
    return json({ ok: true, processed: (rows || []).length, sent, failed });
  } catch (error) {
    console.error("process-whatsapp-queue", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao processar WhatsApp." }, 500);
  }
});
