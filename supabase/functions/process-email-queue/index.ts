import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "";
const SITE_URL = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[c] || c));
const labels: Record<string, string> = {
  pending: "Aguardando confirmação", confirmed: "Confirmado", preparing: "Em preparação",
  ready: "Pronto", out_for_delivery: "Saiu para entrega", completed: "Concluído", cancelled: "Cancelado",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  if (req.headers.get("Authorization") !== `Bearer ${SERVICE}`) {
    return json({ error: "Acesso interno não autorizado." }, 401);
  }
  if (!RESEND_KEY || !EMAIL_FROM || !SITE_URL) {
    return json({ error: "E-mail não configurado: informe RESEND_API_KEY, EMAIL_FROM e SITE_URL." }, 503);
  }

  try {
    const { data: rows, error } = await db.from("email_notifications")
      .select("id,order_id,email,event_type,attempts")
      .eq("status", "pending").lt("attempts", 5)
      .order("created_at", { ascending: true }).limit(20);
    if (error) throw error;

    let sent = 0, failed = 0;
    for (const row of rows || []) {
      const { data: order, error: orderError } = await db.from("orders")
        .select("order_number,tracking_code,customer_name,status,total,fulfillment")
        .eq("id", row.order_id).single();
      if (orderError || !order || !row.email || !order.tracking_code) {
        await db.from("email_notifications").update({
          status: "failed", attempts: row.attempts + 1,
          last_error: orderError?.message || "E-mail ou dados do pedido ausentes",
        }).eq("id", row.id);
        failed++;
        continue;
      }

      const created = row.event_type === "order_created";
      const subject = created
        ? `Recebemos seu pedido #${order.order_number} — Mercado Jesi`
        : `Atualização do pedido #${order.order_number} — Mercado Jesi`;
      const eventText = created
        ? "Recebemos seu pedido. Acompanhe o andamento e consulte as próximas atualizações pelo link abaixo."
        : `O status do seu pedido foi atualizado para: ${labels[order.status] || order.status}.`;
      const trackingUrl = `${SITE_URL}/rastreamento.html`;
      const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f7f4;font-family:Arial,sans-serif;color:#183b2b;padding:28px 12px"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e4ece5;border-radius:18px;padding:28px"><p style="font-size:12px;letter-spacing:2px;color:#24734e;font-weight:bold">MERCADO JESI</p><h1 style="font-size:23px">Olá, ${esc(order.customer_name)}!</h1><p style="line-height:1.6">${esc(eventText)}</p><div style="background:#f3f7f3;border-radius:12px;padding:18px;margin:22px 0"><p style="margin:0 0 8px">Pedido <strong>#${esc(order.order_number)}</strong></p><p style="margin:0 0 8px">Status: <strong>${esc(labels[order.status] || order.status)}</strong></p><p style="margin:0">Código de rastreamento:</p><p style="font-size:19px;word-break:break-all;font-weight:bold;margin:7px 0 0">${esc(order.tracking_code)}</p></div><p><a href="${esc(trackingUrl)}" style="display:inline-block;background:#176b45;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:bold">Acompanhar pedido</a></p><p style="font-size:12px;color:#6b7b70;line-height:1.5">Para consultar, informe o número do pedido, o telefone utilizado na compra e o código acima.</p></main></body></html>`;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: [row.email], subject, html }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        await db.from("email_notifications").update({
          status: row.attempts + 1 >= 5 ? "failed" : "pending",
          attempts: row.attempts + 1,
          last_error: String(result?.message || result?.error || `HTTP ${response.status}`).slice(0, 1000),
        }).eq("id", row.id);
        failed++;
        continue;
      }
      await db.from("email_notifications").update({
        status: "sent", attempts: row.attempts + 1,
        sent_at: new Date().toISOString(), provider_message_id: result?.id || null, last_error: null,
      }).eq("id", row.id);
      sent++;
    }
    return json({ ok: true, processed: (rows || []).length, sent, failed });
  } catch (error) {
    console.error("process-email-queue", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao processar e-mail." }, 500);
  }
});
