import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")!;
const SITE_URL = (Deno.env.get("SITE_URL") || "").replace(/\/$/, "");

const CHECKOUT_SUSPENDED = Deno.env.get("CHECKOUT_SUSPENDED") === "true";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function validSiteUrl(value: string) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  // Permitir requisições CORS de preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Bloquear o checkout antes de qualquer operação.
  if (CHECKOUT_SUSPENDED) {
    return json(
      {
        error:
          "O checkout está temporariamente suspenso. Tente novamente mais tarde.",
      },
      503,
    );
  }

  // Validar o método HTTP.
  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  // Validar a configuração do checkout.
  if (!MP_ACCESS_TOKEN || !validSiteUrl(SITE_URL)) {
    return json(
      {
        error: "Checkout ainda não configurado. Peça ajuda ao mercado.",
      },
      503,
    );
  }

  try {
    const body = await req.json();

    const customer = body?.customer || {};
    // Normaliza as observações antes de encaminhá-las à função SQL.
    const notes = typeof body?.notes === "string"
      ? body.notes.trim().slice(0, 1000)
      : "";

    const items = Array.isArray(body?.items)
      ? body.items.map((item: any) => ({
          product_id: String(item.product_id || ""),
          quantity: Number(item.quantity),
        }))
      : [];

    const fulfillment = body?.fulfillment === "pickup" ? "pickup" : "delivery";

    const paymentMethod = ["pix", "card", "onsite_card"].includes(
      body?.payment_method,
    )
      ? body.payment_method
      : "";

    if (!paymentMethod) {
      return json({ error: "Escolha uma forma de pagamento válida." }, 400);
    }

    if (
      items.some(
        (item: any) =>
          !/^[0-9a-f-]{36}$/i.test(item.product_id) ||
          !Number.isFinite(item.quantity) ||
          item.quantity <= 0,
      )
    ) {
      return json(
        { error: "Confira os produtos e quantidades da sacola." },
        400,
      );
    }

    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      return json({ error: "Informe um e-mail válido." }, 400);
    }

    const clientIp = (
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown"
    )
      .split(",")[0]
      .trim();

    const phoneDigits = String(customer.phone || "").replace(/\D/g, "");

    const fingerprintBytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${clientIp}:${phoneDigits}`),
    );

    const fingerprint = [...new Uint8Array(fingerprintBytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const { data: allowed, error: limitError } = await db.rpc(
      "consume_checkout_rate_limit",
      {
        p_fingerprint: fingerprint,
      },
    );

    if (limitError) {
      console.error("ERRO RATE LIMIT:", limitError);
      throw new Error("RATE_LIMIT: " + limitError.message);
    }

    if (!allowed) {
      return json(
        {
          error:
            "Muitas tentativas de pedido. Aguarde 15 minutos e tente novamente.",
        },
        429,
      );
    }

    const { data: order, error: orderError } = await db.rpc(
      "create_store_order",
      {
        p_customer: customer,
        p_items: items,
        p_fulfillment: fulfillment,
        p_payment_method: paymentMethod,
        p_notes: notes || null,
        p_coupon_code: String(body?.coupon_code || "").slice(0, 40),
      },
    );

    if (orderError) {
      console.error("ERRO CREATE ORDER:", orderError);
      throw new Error("CREATE_ORDER: " + orderError.message);
    }

    const { data: trackingOrder, error: trackingError } = await db
      .from("orders")
      .select("tracking_code")
      .eq("id", order.order_id)
      .single();
    if (trackingError || !trackingOrder?.tracking_code) {
      console.error("TRACKING CODE ERROR:", trackingError);
      throw new Error("Não foi possível gerar o código seguro de acompanhamento.");
    }

    const queueHeaders = { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
    await Promise.all(["process-whatsapp-queue", "process-email-queue"].map(async (queueName) => {
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/${queueName}`, {
          method: "POST", headers: queueHeaders, body: "{}",
        });
        if (!response.ok) console.warn(`${queueName} returned HTTP ${response.status}`);
      } catch (error) {
        console.warn(`${queueName} skipped:`, error);
      }
    }));

    if (paymentMethod === "onsite_card") {
      return json({
        ok: true,
        order_id: order.order_id,
        order_number: order.order_number,
        tracking_code: trackingOrder.tracking_code,
        total: order.total,
        payment_method: "onsite_card",
        message: "Pedido registrado. O pagamento será feito na entrega.",
      });
    }

    const preferenceBody = {
      external_reference: order.order_id,

      items: [
        {
          id: `pedido-${order.order_number}`,
          title: `Pedido Mercado Jesi #${order.order_number}`,
          description: "Compra realizada na loja virtual Mercado Jesi",
          quantity: 1,
          currency_id: "BRL",
          unit_price: Number(order.total),
        },
      ],

      payer: {
        name: String(customer.name || "Cliente Mercado Jesi").slice(0, 100),
        email: customer.email || undefined,
      },

      payment_methods: {
        // Checkout Pro usa bank_transfer para Pix
        // e credit_card para crédito no Brasil.
        // O Mercado Pago mantém dinheiro em conta
        // habilitado por regra da plataforma.
        excluded_payment_types:
          paymentMethod === "pix"
            ? [
                { id: "credit_card" },
                { id: "debit_card" },
                { id: "prepaid_card" },
                { id: "ticket" },
              ]
            : [
                { id: "bank_transfer" },
                { id: "debit_card" },
                { id: "prepaid_card" },
                { id: "ticket" },
              ],
      },

      back_urls: {
        success: `${SITE_URL}/?checkout=success&order=${order.order_number}`,
        pending: `${SITE_URL}/?checkout=pending&order=${order.order_number}`,
        failure: `${SITE_URL}/?checkout=failure&order=${order.order_number}`,
      },

      auto_return: "approved",

      notification_url: `${SUPABASE_URL}/functions/v1/mercadopago-webhook`,

      statement_descriptor: "MERCADO JESI",

      metadata: {
        order_id: order.order_id,
        order_number: order.order_number,
      },
    };

    const mpResponse = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferenceBody),
      },
    );

    const preference = await mpResponse.json();

    if (!mpResponse.ok || !preference.init_point) {
      await db.rpc("cancel_store_order", {
        p_order_id: order.order_id,
        p_reason: "Falha ao criar cobrança no Mercado Pago.",
      });

      console.error("Mercado Pago preference error", preference);

      return json(
        {
          error: "Não foi possível iniciar o pagamento. Tente novamente.",
        },
        502,
      );
    }

    const { error: paymentUpdateError } = await db
      .from("payments")
      .update({
        provider_reference: preference.id,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order.order_id)
      .eq("provider", "mercadopago")
      .eq("payment_channel", "online");

    if (paymentUpdateError) {
      // Não liberar o estoque: a preferência já foi criada
      // no gateway e pode receber pagamento.
      console.error(
        "Não foi possível salvar a referência da preferência",
        paymentUpdateError,
      );

      return json(
        {
          error:
            "O pedido foi registrado, mas não foi possível abrir o pagamento. Entre em contato com o mercado informando o pedido #" +
            order.order_number +
            ".",
        },
        503,
      );
    }

    const IS_TEST = Deno.env.get("MERCADOPAGO_ENV") === "test";

    const checkoutUrl = IS_TEST
      ? preference.sandbox_init_point
      : preference.init_point;

    if (!checkoutUrl) {
      throw new Error("URL de checkout não retornada pelo Mercado Pago.");
    }

    return json({
      ok: true,
      order_id: order.order_id,
      order_number: order.order_number,
      tracking_code: trackingOrder.tracking_code,
      total: order.total,
      checkout_url: checkoutUrl,
      preference_id: preference.id,
    });
  } catch (error) {
    console.error("create-checkout", error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível finalizar o pedido.",
      },
      400,
    );
  }
});
