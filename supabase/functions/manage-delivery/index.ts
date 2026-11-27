import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
async function processNotificationQueues() {
  const headers = { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  await Promise.all(["process-whatsapp-queue", "process-email-queue"].map(async (name) => {
    try {
      const response = await fetch(`${URL}/functions/v1/${name}`, { method: "POST", headers, body: "{}" });
      if (!response.ok) console.warn(`${name} returned HTTP ${response.status}`);
    } catch (error) {
      console.warn(`${name} could not be processed:`, error);
    }
  }));
}

const allowed = new Set([
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
]);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")
    return json({ error: "Método não permitido." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!token) return json({ error: "Sessão necessária." }, 401);
    const { data: authData, error: authError } =
      await admin.auth.getUser(token);
    if (authError || !authData.user)
      return json({ error: "Sessão inválida." }, 401);
    const { data: profile } = await admin
      .from("profiles")
      .select("role,active")
      .eq("id", authData.user.id)
      .single();
    if (
      !profile?.active ||
      !["owner", "admin", "manager", "operator"].includes(profile.role)
    ) {
      return json(
        { error: "Você não tem permissão para gerenciar entregas." },
        403,
      );
    }
    const body = await req.json();
    const orderId = String(body.order_id || "");
    const status = String(body.status || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId))
      return json({ error: "Pedido inválido." }, 400);
    const { data: current, error: readError } = await admin
      .from("orders")
      .select("id,status,fulfillment")
      .eq("id", orderId)
      .single();
    if (readError || !current)
      return json({ error: "Pedido não encontrado." }, 404);

    if (body.action === "update_courier") {
      if (current.fulfillment !== "delivery")
        return json({ error: "Este pedido não é de entrega." }, 409);
      const courierPatch = {
        assigned_courier: String(body.courier_name || "").slice(0, 120),
        courier_phone: String(body.courier_phone || "")
          .replace(/\D/g, "")
          .slice(0, 13),
        delivery_notes: String(body.delivery_notes || "").slice(0, 1000),
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin
        .from("orders")
        .update(courierPatch)
        .eq("id", orderId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "mark_payment_received") {
      const { data: payment, error: paymentError } = await admin
        .from("payments")
        .select("id,method,status")
        .eq("order_id", orderId)
        .eq("payment_channel", "onsite")
        .maybeSingle();
      if (paymentError || !payment || payment.method !== "onsite_card")
        return json(
          { error: "Este pedido não possui pagamento presencial pendente." },
          409,
        );
      if (payment.status === "paid")
        return json({ ok: true, already_paid: true });
      const { error: paidError } = await admin
        .from("payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      if (paidError) throw paidError;
      return json({ ok: true, payment_received: true });
    }

    if (!allowed.has(status)) return json({ error: "Status inválido." }, 400);
    if (status === "cancelled") {
      const { error } = await admin.rpc("cancel_store_order", {
        p_order_id: orderId,
        p_reason: String(body.note || "Cancelado pela equipe"),
      });
      if (error) return json({ error: error.message }, 409);
      await processNotificationQueues();
      return json({ ok: true });
    }
    if (status === "completed") {
      const { data: onsitePayment } = await admin
        .from("payments")
        .select("status")
        .eq("order_id", orderId)
        .eq("payment_channel", "onsite")
        .maybeSingle();
      if (onsitePayment && onsitePayment.status !== "paid") {
        return json(
          {
            error:
              "Registre o recebimento do cartão na entrega antes de concluir o pedido.",
          },
          409,
        );
      }
    }
    const { data: onlinePayment } = await admin
      .from("payments")
      .select("status,payment_channel")
      .eq("order_id", orderId)
      .eq("payment_channel", "online")
      .maybeSingle();
    if (
      onlinePayment &&
      onlinePayment.status !== "paid" &&
      [
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed",
      ].includes(status)
    ) {
      return json(
        {
          error:
            "O pagamento online ainda não foi confirmado pelo Mercado Pago.",
        },
        409,
      );
    }
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (body.courier_name !== undefined)
      patch.assigned_courier = String(body.courier_name).slice(0, 120);
    if (body.courier_phone !== undefined)
      patch.courier_phone = String(body.courier_phone)
        .replace(/\D/g, "")
        .slice(0, 13);
    if (body.delivery_notes !== undefined)
      patch.delivery_notes = String(body.delivery_notes).slice(0, 1000);
    if (status === "completed") patch.delivered_at = new Date().toISOString();
    const { error: updateError } = await admin
      .from("orders")
      .update(patch)
      .eq("id", orderId);
    if (updateError) throw updateError;
    await admin.from("order_status_history").insert({
      order_id: orderId,
      old_status: current.status,
      new_status: status,
      note: String(body.note || "Atualização da equipe").slice(0, 500),
      changed_by: authData.user.id,
    });
    await processNotificationQueues();
    return json({ ok: true });
  } catch (error) {
    console.error("manage-delivery", error);
    return json({ error: "Não foi possível atualizar a entrega." }, 500);
  }
});
