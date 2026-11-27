import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STAFF_ROLES = new Set(["owner", "admin", "manager", "employee", "operator", "delivery"]);
const SAFE_FINAL_STATUSES = new Set(["rejected", "cancelled"]);

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function mpRequest(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Mercado Pago API error", response.status, payload);
    throw new Error("Não foi possível validar ou encerrar a cobrança no Mercado Pago. O pedido foi mantido.");
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão necessária." }, 401);

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: profile, error: profileError } = await admin
      .from("profiles").select("role,active").eq("id", authData.user.id).single();
    if (profileError || !profile?.active || !STAFF_ROLES.has(profile.role)) {
      return json({ error: "Você não tem permissão para excluir pedidos." }, 403);
    }

    const body = await req.json();
    const orderId = String(body.order_id || "");
    if (!isUuid(orderId)) return json({ error: "Pedido inválido." }, 400);

    const { data: order, error: orderError } = await admin
      .from("orders").select("id,order_number").eq("id", orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Pedido não encontrado." }, 404);

    const [{ data: payments, error: paymentsError }, { data: cashRows, error: cashError }] = await Promise.all([
      admin.from("payments")
        .select("id,status,method,payment_channel,provider,provider_reference,paid_at")
        .eq("order_id", orderId),
      admin.from("cash_transactions").select("id").eq("order_id", orderId),
    ]);
    if (paymentsError) throw paymentsError;
    if (cashError) throw cashError;
    if ((cashRows || []).length) {
      return json({ error: "Este pedido possui movimentações no caixa. Ele não pode ser excluído; arquive-o para preservar o histórico." }, 409);
    }

    const paymentRows = payments || [];
    if (paymentRows.some((p) => p.status === "paid" || p.status === "refunded" || p.paid_at)) {
      return json({ error: "Este pedido possui pagamento confirmado ou histórico financeiro. Ele não pode ser excluído; arquive-o." }, 409);
    }

    const onlineRows = paymentRows.filter((p) => p.payment_channel === "online");
    const preferences = new Set<string>();
    for (const payment of onlineRows) {
      if (payment.provider !== "mercadopago" || !payment.provider_reference) {
        return json({ error: "Existe uma cobrança online sem referência verificável do Mercado Pago. Por segurança, o pedido não foi excluído." }, 409);
      }
      preferences.add(String(payment.provider_reference));
    }

    if (preferences.size) {
      if (!MP_ACCESS_TOKEN) {
        return json({ error: "A integração do Mercado Pago não está configurada no servidor. O pedido foi mantido." }, 503);
      }

      // Primeiro invalida cada link de checkout. Se a API não confirmar, aborta.
      for (const preferenceId of preferences) {
        await mpRequest(
          `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(preferenceId)}`,
          {
            method: "PUT",
            body: JSON.stringify({ expires: true, expiration_date_to: new Date().toISOString() }),
          },
        );
      }

      // Só depois de encerrar os links, consulta pagamentos efetivamente criados.
      const searchUrl = new URL("https://api.mercadopago.com/v1/payments/search");
      searchUrl.searchParams.set("external_reference", orderId);
      searchUrl.searchParams.set("sort", "date_created");
      searchUrl.searchParams.set("criteria", "desc");
      searchUrl.searchParams.set("limit", "100");
      const result = await mpRequest(searchUrl.toString(), { method: "GET" });
      const foundPayments = Array.isArray(result.results) ? result.results : [];
      const total = Number(result.paging?.total ?? foundPayments.length);

      // Não assume ausência se a consulta estiver truncada ou retornar status desconhecido.
      if (total > foundPayments.length) {
        return json({ error: "O Mercado Pago retornou mais pagamentos do que foi possível conferir. O pedido foi mantido." }, 409);
      }
      const unsafePayment = foundPayments.find((payment: { status?: string }) =>
        !SAFE_FINAL_STATUSES.has(String(payment.status || ""))
      );
      if (unsafePayment) {
        return json({ error: "O Mercado Pago encontrou uma cobrança ativa ou com histórico financeiro. O pedido não foi excluído; arquive-o." }, 409);
      }
    }

    // A função SQL repete as verificações financeiras sob lock antes do DELETE.
    const { data: deletion, error: deletionError } = await admin.rpc(
      "delete_order_after_gateway_verification",
      { p_order_id: orderId },
    );
    if (deletionError) {
      console.error("Safe order delete RPC error", deletionError);
      return json({ error: deletionError.message || "O banco bloqueou a exclusão do pedido." }, 409);
    }
    if (deletion?.success !== true) {
      return json({ error: deletion?.error || "O banco não confirmou a exclusão." }, 409);
    }

    return json({ success: true, order_number: order.order_number });
  } catch (error) {
    console.error("delete-order-safely", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao validar a exclusão. O pedido foi mantido." }, 502);
  }
});
