import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
const EXPIRATION_WINDOW_MS = 60_000;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function mpRequest(path: string, init: RequestInit = {}) {
  return await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function verifyNoGatewayPayment(orderId: string, payments: any[]) {
  const onlinePayments = payments.filter((payment) =>
    payment.provider === "mercadopago" && payment.payment_channel === "online"
  );

  if (!onlinePayments.length) return { ok: true as const };
  if (!MP_ACCESS_TOKEN) {
    return { ok: false as const, message: "Mercado Pago não está configurado no servidor. O pedido foi mantido por segurança." };
  }

  // A referência gravada pelo checkout é o ID da preferência, não o ID de um pagamento.
  for (const payment of onlinePayments) {
    if (!payment.provider_reference) {
      return { ok: false as const, message: "Não foi possível localizar a preferência de pagamento deste pedido. Arquive-o para preservar os registros." };
    }

    const searchUrl = `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=100`;
    const searchResponse = await mpRequest(searchUrl);
    if (!searchResponse.ok) {
      console.error("Mercado Pago payment search failed", searchResponse.status, await searchResponse.text());
      return { ok: false as const, message: "Não foi possível confirmar o estado da cobrança no Mercado Pago. Tente novamente; o pedido não foi excluído." };
    }

    const searchData = await searchResponse.json();
    const results = Array.isArray(searchData?.results) ? searchData.results : [];
    if (Number(searchData?.paging?.total || 0) > results.length) {
      return { ok: false as const, message: "O Mercado Pago retornou muitos registros para uma validação segura. O pedido foi mantido; arquive-o." };
    }

    // Não confia apenas no filtro da API: valida novamente a referência exata do pedido.
    const orderPayments = results.filter((item: any) =>
      String(item?.external_reference || "") === orderId
    );

    // Se o gateway já aprovou, sincroniza o pagamento no banco antes de bloquear a exclusão.
    // Isso corrige casos em que o webhook não chegou ou falhou.
    const approvedPayments = orderPayments.filter((item: any) =>
      String(item?.status || "").toLowerCase() === "approved"
    );

    for (const approved of approvedPayments) {
      const paymentId = String(approved?.id || "");
      const amount = Number(approved?.transaction_amount);
      const currency = String(approved?.currency_id || "");

      if (!paymentId || !Number.isFinite(amount) || amount <= 0 || currency !== "BRL") {
        return { ok: false as const, message: "O Mercado Pago confirmou uma aprovação, mas os dados retornados não passaram na validação. O pedido foi mantido; arquive-o e confira o pagamento." };
      }

      const { error: syncError } = await admin.rpc("apply_mercadopago_payment", {
        p_event_id: `admin-reconcile:${paymentId}:${crypto.randomUUID()}`,
        p_payment_id: paymentId,
        p_order_id: orderId,
        p_status: "approved",
        p_amount: amount,
        p_currency: currency,
      });

      if (syncError) {
        console.error("Mercado Pago approved payment reconciliation failed", {
          orderId,
          paymentId,
          message: syncError.message,
        });
        return { ok: false as const, message: "O pagamento consta como aprovado no Mercado Pago, mas não foi possível sincronizá-lo no banco. O pedido foi mantido; arquive-o e confira o histórico financeiro." };
      }
    }

    const financialOrActivePayment = orderPayments.find((item: any) =>
   
// Cancela cobranças pendentes diretamente no Mercado Pago.
const pendingPayments = orderPayments.filter((item: any) =>
  String(item?.status || "").toLowerCase() === "pending"
);

for (const pending of pendingPayments) {
  const paymentId = String(pending?.id || "");

  if (!paymentId) {
    return {
      ok: false as const,
      message: "Cobrança pendente sem identificador no Mercado Pago. O pedido foi mantido por segurança.",
    };
  }

  const cancelResponse = await mpRequest(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    },
  );

  if (!cancelResponse.ok) {
    console.error(
      "Mercado Pago pending payment cancellation failed",
      cancelResponse.status,
      await cancelResponse.text(),
    );

    return {
      ok: false as const,
      message: "Não foi possível cancelar a cobrança pendente no Mercado Pago. O pedido foi mantido.",
    };
  }

  const cancelledPayment = await cancelResponse.json();

  if (String(cancelledPayment?.status || "").toLowerCase() !== "cancelled") {
    return {
      ok: false as const,
      message: `O Mercado Pago não confirmou o cancelamento. Status atual: ${cancelledPayment?.status || "desconhecido"}.`,
    };
  }
}

// Qualquer status diferente dos estados finais seguros continua bloqueando.
const financialOrActivePayment = orderPayments.find((item: any) =>
  !["rejected", "cancelled", "pending"].includes(
    String(item?.status || "").toLowerCase()
  )
);

if (financialOrActivePayment) {
  const status = String(
    financialOrActivePayment.status || "desconhecido"
  ).toLowerCase();

  return {
    ok: false as const,
    message: `O Mercado Pago encontrou uma cobrança com status "${status}". O pedido não foi excluído; arquive-o para preservar o histórico financeiro.`,
  };
}

    const preferenceResponse = await mpRequest(`/checkout/preferences/${encodeURIComponent(payment.provider_reference)}`);
    if (preferenceResponse.status === 404) continue;
    if (!preferenceResponse.ok) {
      console.error("Mercado Pago preference lookup failed", preferenceResponse.status, await preferenceResponse.text());
      return { ok: false as const, message: "Não foi possível verificar se o link de pagamento ainda está ativo. O pedido foi mantido por segurança." };
    }

    const preference = await preferenceResponse.json();
    const expiresAt = preference?.expiration_date_to ? Date.parse(preference.expiration_date_to) : NaN;
    const alreadyExpired = preference?.expires === true && Number.isFinite(expiresAt) && expiresAt <= Date.now();

    if (!alreadyExpired) {
      // Fecha a janela de pagamento. A exclusão só é permitida em uma nova tentativa,
      // depois que o Mercado Pago confirmar que a preferência já expirou.
      if (preference?.expires !== true || !Number.isFinite(expiresAt)) {
        const from = new Date(Date.now()).toISOString();
        const to = new Date(Date.now() + EXPIRATION_WINDOW_MS).toISOString();
        const updateResponse = await mpRequest(`/checkout/preferences/${encodeURIComponent(payment.provider_reference)}`, {
          method: "PUT",
          body: JSON.stringify({
            expires: true,
            expiration_date_from: from,
            expiration_date_to: to,
          }),
        });

        if (!updateResponse.ok) {
          console.error("Mercado Pago preference expiration failed", updateResponse.status, await updateResponse.text());
          return { ok: false as const, message: "O Mercado Pago não permitiu expirar o link de pagamento. O pedido foi mantido; arquive-o." };
        }
      }

      const currentExpiry = preference?.expires === true && Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + EXPIRATION_WINDOW_MS;
      const seconds = Math.max(1, Math.ceil((currentExpiry - Date.now()) / 1000));
      return {
        ok: false as const,
        message: `O link de pagamento foi programado para expirar. Aguarde ${seconds} segundos e clique em Excluir novamente.`,
      };
    }
  }

  // Reconsulta pagamentos após a expiração da preferência para evitar excluir durante uma aprovação tardia.
  const finalSearch = await mpRequest(`/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=100`);
  if (!finalSearch.ok) {
    console.error("Mercado Pago final payment search failed", finalSearch.status, await finalSearch.text());
    return { ok: false as const, message: "Não foi possível fazer a verificação final no Mercado Pago. O pedido foi mantido." };
  }
  const finalData = await finalSearch.json();
  const finalResults = Array.isArray(finalData?.results) ? finalData.results : [];
 
const finalOrderPayments = finalResults.filter((item: any) =>
  String(item?.external_reference || "") === orderId
);

if (
  Number(finalData?.paging?.total || 0) > finalResults.length ||
  finalOrderPayments.some((item: any) =>
    !["rejected", "cancelled"].includes(
      String(item?.status || "").toLowerCase()
    )
  )
) {
  return {
    ok: false as const,
    message: "O Mercado Pago ainda possui uma cobrança ativa ou em processamento para este pedido. O pedido foi mantido.",
  };
}

  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization || !SUPABASE_ANON_KEY) return json({ error: "Sessão não autorizada." }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Sessão inválida. Entre novamente no painel." }, 401);

    const { data: staff, error: staffError } = await userClient.rpc("is_staff");
    if (staffError || staff !== true) return json({ error: "Acesso não autorizado." }, 403);

    const body = await req.json();
    const orderId = body?.order_id;
    if (!isUuid(orderId)) return json({ error: "ID do pedido inválido." }, 400);

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_number")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Pedido não encontrado." }, 404);

    const [{ data: payments, error: paymentsError }, { data: cashRows, error: cashError }] = await Promise.all([
      admin.from("payments").select("id,status,paid_at,provider,provider_reference,payment_channel").eq("order_id", orderId),
      admin.from("cash_transactions").select("id").eq("order_id", orderId),
    ]);
    if (paymentsError) throw paymentsError;
    if (cashError) throw cashError;

    if ((cashRows || []).length) {
      return json({ error: "Este pedido possui movimentação no caixa. Ele não pode ser excluído; arquive-o." }, 409);
    }

    const hasFinancialPayment = (payments || []).some((payment: any) =>
      payment.paid_at || ["paid", "refunded"].includes(payment.status)
    );
    if (hasFinancialPayment) {
      return json({ error: "Este pedido possui pagamento recebido ou estornado. O histórico financeiro será preservado; arquive-o." }, 409);
    }

    const gatewayCheck = await verifyNoGatewayPayment(orderId, payments || []);
    if (!gatewayCheck.ok) return json({ error: gatewayCheck.message }, 409);

    const { data: deleted, error: deleteError } = await admin.rpc(
      "delete_order_after_gateway_verification",
      { p_order_id: orderId },
    );
    if (deleteError) throw deleteError;
    if (deleted?.success !== true) {
      return json({ error: deleted?.error || "O banco não confirmou a exclusão." }, 409);
    }

    return json({ success: true, order_number: order.order_number });
  } catch (error) {
    console.error("delete-order-safely", error);
    return json({ error: error instanceof Error ? error.message : "Falha ao excluir o pedido." }, 500);
  }
});
