import { supabase, isSupabaseConfigured } from "./supabase.js";
import {
  localProductsList,
  cleanLocalImageUrl,
  cleanRemoteImageUrl,
} from "./product-store.js";
import { formatBrazilPhone } from "./phone-mask.js";
import { translateErrorMessage } from "./error-translations.js";
const grid = document.querySelector("#product-grid"),
  count = document.querySelector("#result-count"),
  cartCount = document.querySelector("#cart-count"),
  searchForm = document.querySelector("#search-form"),
  searchInput = document.querySelector("#search-input"),
  toast = document.querySelector("#toast"),
  drawer = document.querySelector("#cart-drawer"),
  backdrop = document.querySelector("#drawer-backdrop"),
  cartItems = document.querySelector("#cart-items"),
  CART_STORAGE_KEY = "mercado-jesi:cart:v1";
let products = [],
  cart = restoreCart(),
  storeSettings = {
    delivery_fee: 0,
    free_delivery_minimum: 0,
    delivery_enabled: true,
    pickup_enabled: true,
  };
function restoreCart() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY),
      parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 100)
      .map((item) => ({
        id: String(item?.id || "").slice(0, 100),
        name: String(item?.name || "Produto").slice(0, 180),
        price: Number.isFinite(Number(item?.price))
          ? Math.max(0, Number(item.price))
          : 0,
        qty: Math.min(99, Math.max(1, Math.floor(Number(item?.qty) || 1))),
        unit: String(item?.unit || "un.").slice(0, 30),
        category_name: String(item?.category_name || "Mercado").slice(0, 100),
        image_url: "",
      }))
      .filter((item) => item.id);
  } catch (error) {
    console.warn("Não foi possível recuperar a sacola salva:", error);
    return [];
  }
}
function persistCart() {
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify(
        cart.map(({ id, name, price, qty, unit, category_name }) => ({
          id,
          name,
          price,
          qty,
          unit,
          category_name,
        })),
      ),
    );
  } catch (error) {
    console.warn("Não foi possível salvar a sacola neste navegador:", error);
  }
}
document.querySelector("#year").textContent = new Date().getFullYear();
const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0),
  escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  displayUnit = (value) => (value === "pack" ? "pac" : value || "un.");
function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2300);
}
function showTrackingReceipt({
  order_number,
  phone,
  tracking_code,
  state = "success",
  checkout_url = "",
}) {
  if (!order_number || !tracking_code) return;
  document.querySelector("#order-tracking-receipt")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "order-tracking-receipt";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "tracking-receipt-title");
  const heading =
      state === "failure"
        ? "Pedido registrado"
        : state === "pending"
          ? "Pedido recebido!"
          : "Compra recebida!",
    description =
      state === "failure"
        ? "O pagamento não foi concluído. Seu pedido continua registrado. Você pode tentar novamente ou entrar em contato com a loja."
        : state === "pending"
          ? "Seu pedido foi registrado e aguarda a confirmação do pagamento. Guarde seu código para acompanhar tudo."
          : "Seu pedido foi registrado com sucesso! Agora você pode acompanhar cada etapa da entrega.",
    paymentAction = checkout_url
      ? `<a class="receipt-btn receipt-payment" href="${escapeHtml(checkout_url)}"><i class="fa-solid fa-credit-card"></i> Continuar pagamento</a>`
      : "",
    icon = state === "failure" ? "fa-circle-exclamation" : "fa-check";
  overlay.innerHTML = `<style>
#order-tracking-receipt{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:rgba(8,18,13,.72);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);animation:receiptFade .25s ease}
#order-tracking-receipt *{box-sizing:border-box}
#order-tracking-receipt .receipt-card{position:relative;width:min(100%,470px);max-height:calc(100dvh - 36px);overflow-y:auto;padding:32px;border:1px solid rgba(255,255,255,.8);border-radius:25px;background:linear-gradient(145deg,#fff 0%,#f8fbf8 100%);box-shadow:0 30px 100px rgba(0,0,0,.3);color:#183b2b;animation:receiptEnter .35s cubic-bezier(.2,.8,.2,1)}
#order-tracking-receipt .receipt-close{position:absolute;top:17px;right:17px;width:36px;height:36px;display:grid;place-items:center;border:1px solid #e7eee8;border-radius:12px;background:#f5f8f5;color:#637268;font-size:19px;cursor:pointer;transition:.2s}
#order-tracking-receipt .receipt-close:hover{background:#e9f2eb;color:#176b45;transform:rotate(90deg)}
#order-tracking-receipt .receipt-brand{display:flex;align-items:center;gap:9px;margin-bottom:25px;color:#244c36;font-size:11px;font-weight:800;letter-spacing:2px}
#order-tracking-receipt .receipt-brand i{color:#18834f;font-size:17px}
#order-tracking-receipt .receipt-success{width:58px;height:58px;display:grid;place-items:center;border:1px solid #d7eddd;border-radius:19px;background:linear-gradient(145deg,#e9f8ed,#dff2e4);color:#16804b;font-size:25px;box-shadow:0 7px 20px rgba(22,128,75,.09)}
#order-tracking-receipt .receipt-success.warning{border-color:#f3dfc3;background:#fff5e7;color:#c27a20}
#order-tracking-receipt h2{margin:19px 0 9px;color:#173c29;font-size:26px;font-weight:800;letter-spacing:-.8px;line-height:1.2}
#order-tracking-receipt .receipt-description{margin:0;color:#69776d;font-size:14px;line-height:1.7}
#order-tracking-receipt .receipt-order{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:23px 0 12px;padding:13px 15px;border:1px solid #e8eee9;border-radius:13px;background:#fff}
#order-tracking-receipt .receipt-order span{color:#7b887e;font-size:12px}
#order-tracking-receipt .receipt-order strong{color:#254b34;font-size:14px}
#order-tracking-receipt .receipt-code{padding:18px;border:1px solid #dcebe0;border-radius:17px;background:linear-gradient(145deg,#f2f9f3,#f8fbf8)}
#order-tracking-receipt .receipt-code-label{display:flex;align-items:center;gap:7px;margin-bottom:11px;color:#54715d;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
#order-tracking-receipt .receipt-code-label i{color:#18834f}
#order-tracking-receipt .receipt-code strong{display:block;overflow-wrap:anywhere;user-select:all;color:#174c30;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:clamp(15px,4vw,19px);font-weight:800;letter-spacing:.6px;line-height:1.6}
#order-tracking-receipt .receipt-copy{width:100%;min-height:44px;display:flex;align-items:center;justify-content:center;gap:9px;margin-top:15px;border:1px solid #cfe2d3;border-radius:11px;background:#fff;color:#176b45;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s,border .2s,transform .2s}
#order-tracking-receipt .receipt-copy:hover{border-color:#176b45;background:#edf7ef;transform:translateY(-1px)}
#order-tracking-receipt .receipt-copy.copied{border-color:#b8e0c3;background:#e4f6e8;color:#14713d}
#order-tracking-receipt .receipt-hint{display:flex;align-items:flex-start;gap:9px;margin:17px 0 0;color:#77847a;font-size:12px;line-height:1.6}
#order-tracking-receipt .receipt-hint i{margin-top:2px;color:#4c9566}
#order-tracking-receipt .receipt-actions{display:grid;grid-template-columns:1fr;gap:10px;margin-top:22px}
#order-tracking-receipt .receipt-btn{min-height:49px;display:flex;align-items:center;justify-content:center;gap:9px;padding:12px 16px;border:1px solid transparent;border-radius:12px;font-size:13px;font-weight:800;text-align:center;text-decoration:none;cursor:pointer;transition:transform .2s,filter .2s}
#order-tracking-receipt .receipt-btn:hover{filter:brightness(.97);transform:translateY(-2px)}
#order-tracking-receipt .receipt-primary{background:linear-gradient(135deg,#167548,#0e6039);box-shadow:0 7px 17px rgba(22,117,72,.2);color:#fff}
#order-tracking-receipt .receipt-payment{border-color:#dce8df;background:#fff;color:#28563a}
#order-tracking-receipt .receipt-footer{margin:19px 0 0;color:#9aa59c;font-size:10px;text-align:center;letter-spacing:.4px}
#order-tracking-receipt .receipt-card::-webkit-scrollbar{width:5px}
#order-tracking-receipt .receipt-card::-webkit-scrollbar-thumb{border-radius:10px;background:#c9d9cd}
@keyframes receiptFade{from{opacity:0}to{opacity:1}}
@keyframes receiptEnter{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:480px){#order-tracking-receipt{padding:12px}#order-tracking-receipt .receipt-card{padding:25px 20px;border-radius:21px;max-height:calc(100dvh - 24px)}#order-tracking-receipt h2{font-size:23px}#order-tracking-receipt .receipt-code{padding:15px}}
@media(prefers-reduced-motion:reduce){#order-tracking-receipt,#order-tracking-receipt *{animation:none!important;transition:none!important}}
</style>
<section class="receipt-card">
<button class="receipt-close" type="button" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
<div class="receipt-brand"><i class="fa-solid fa-basket-shopping"></i> MERCADO JESI</div>
<div class="receipt-success ${state === "failure" ? "warning" : ""}"><i class="fa-solid ${icon}"></i></div>
<h2 id="tracking-receipt-title">${escapeHtml(heading)}</h2>
<p class="receipt-description">${escapeHtml(description)}</p>
<div class="receipt-order"><span>Número do pedido</span><strong>#${escapeHtml(order_number)}</strong></div>
<div class="receipt-code">
<div class="receipt-code-label"><i class="fa-solid fa-location-dot"></i> Seu código de rastreamento</div>
<strong id="receipt-tracking-code">${escapeHtml(tracking_code)}</strong>
<button class="receipt-copy" type="button" data-copy-tracking><i class="fa-regular fa-copy"></i><span>Copiar código</span></button>
</div>
<p class="receipt-hint"><i class="fa-solid fa-shield-halved"></i><span>Guarde este código. Com ele você poderá acompanhar as atualizações e visualizar a localização do entregador quando a entrega estiver em andamento.</span></p>
<div class="receipt-actions">${paymentAction}<a class="receipt-btn receipt-primary" href="./rastreamento.html"><i class="fa-solid fa-map-location-dot"></i> Acompanhar meu pedido</a></div>
<p class="receipt-footer">MERCADO JESI · SUA COMPRA, NOSSA PRIORIDADE</p>
</section>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".receipt-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  const copyButton = overlay.querySelector("[data-copy-tracking]");
  copyButton.addEventListener("click", async () => {
    const label = copyButton.querySelector("span");
    try {
      await navigator.clipboard.writeText(String(tracking_code));
      label.textContent = "Código copiado com sucesso!";
      copyButton.classList.add("copied");
      copyButton.querySelector("i").className = "fa-solid fa-check";
    } catch {
      const field = document.createElement("textarea");
      field.value = String(tracking_code);
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      label.textContent = copied
        ? "Código copiado com sucesso!"
        : "Selecione e copie o código acima";
      if (copied) {
        copyButton.classList.add("copied");
        copyButton.querySelector("i").className = "fa-solid fa-check";
      }
    }
  });
  overlay.querySelector(".receipt-close").focus();
}
function openCart() {
  drawer.classList.add("open");
  backdrop.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}
function closeCart() {
  drawer.classList.remove("open");
  backdrop.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}
function renderCart() {
  persistCart();
  cartCount.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
  cartItems.innerHTML = cart.length
    ? cart
        .map(
          (item) =>
            `<div class="cart-line"><div><b>${escapeHtml(item.name)}</b><small>${item.qty} × ${money(item.price)}</small></div><strong>${money(item.qty * item.price)}</strong></div>`,
        )
        .join("")
    : '<p class="empty-cart">Sua sacola está vazia.</p>';
  document.querySelector("#cart-subtotal").textContent = money(
    cart.reduce((sum, item) => sum + item.qty * item.price, 0),
  );
}
function renderProducts(items) {
  count.textContent = `${items.length} produto(s)`;
  if (!items.length) {
    grid.innerHTML = '<div class="loading">Nenhum produto encontrado.</div>';
    return;
  }
  grid.innerHTML = items
    .map(
      (p) =>
        `<article class="product-card"><div class="product-image">${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">` : '<i class="fa-solid fa-bag-shopping" aria-hidden="true"></i>'}</div><div class="product-info"><span class="product-category">${escapeHtml(p.category_name || "Mercado")}</span><h3>${escapeHtml(p.name)}</h3><div class="product-bottom"><span class="price">${money(p.price)} <small class="unit">/${escapeHtml(displayUnit(p.unit))}</small></span><button class="add-button" data-add="${p.id}" ${p.available === false ? "disabled" : ""}>Adicionar <span class="add-button-plus" aria-hidden="true">+</span></button></div></div></article>`,
    )
    .join("");
}
async function loadProducts() {
  if (!isSupabaseConfigured) {
    try {
      const local = await localProductsList();
      products = await Promise.all(
        local
          .filter((product) => product.active !== false)
          .map(async (product) => ({
            ...product,
            image_url: await cleanLocalImageUrl(product),
            available: Number(product.stock || 0) > 0,
            category_name: product.category_name || "Mercado",
          })),
      );
      renderProducts(products);
      if (!products.length) {
        grid.innerHTML =
          '<div class="loading">Os produtos cadastrados no painel aparecerão aqui. Acesse o painel administrativo para adicionar o primeiro produto.</div>';
        count.textContent = "Catálogo vazio";
      }
    } catch (error) {
      console.error(error);
      grid.innerHTML =
        '<div class="loading">Não foi possível acessar o catálogo local deste navegador.</div>';
    }
    return;
  }
  const { data, error } = await supabase
    .from("storefront_products")
    .select("id,name,price,unit,image_path,category_name,available")
    .order("name");
  if (error) {
    grid.innerHTML =
      '<div class="loading">Falha ao carregar catálogo. Verifique a migration e as políticas RLS.</div>';
    count.textContent = "Erro ao carregar";
    console.error(error);
    return;
  }
  products = await Promise.all(
    (data || []).map(async (product) => {
      const sourceUrl = product.image_path
        ? supabase.storage
            .from("product-images")
            .getPublicUrl(product.image_path).data.publicUrl + "?v=2"
        : "";
      return { ...product, image_url: await cleanRemoteImageUrl(sourceUrl) };
    }),
  );
  renderProducts(products);
}
grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  const p = products.find((item) => item.id === button.dataset.add);
  if (!p) return;
  const existing = cart.find((item) => item.id === p.id);
  if (existing) {
    if (existing.qty >= 99) {
      notify("Limite de 99 unidades por produto atingido.");
      return;
    }
    existing.qty++;
  } else cart.push({ ...p, qty: 1 });
  renderCart();
  notify(`${p.name} adicionado à sacola.`);
});
searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const q = searchInput.value.trim().toLocaleLowerCase("pt-BR");
  renderProducts(
    products.filter((p) =>
      `${p.name} ${p.category_name || ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(q),
    ),
  );
});
document.querySelector("#category-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  document
    .querySelectorAll(".category-card")
    .forEach((el) => el.classList.toggle("active", el === button));
  renderProducts(
    products.filter((p) => p.category_name === button.dataset.category),
  );
});
document.querySelector("#cart-button").addEventListener("click", openCart);
document.querySelector("#cart-close").addEventListener("click", closeCart);
backdrop.addEventListener("click", closeCart);
document
  .querySelector("#checkout-button")
  .addEventListener("click", async () => {
    await loadStoreSettings();
    openCheckout();
  });
async function loadStoreSettings() {
  if (!supabase) return;
  const { data } = await supabase
    .from("store_settings")
    .select(
      "delivery_fee,free_delivery_minimum,delivery_enabled,pickup_enabled",
    )
    .eq("id", true)
    .maybeSingle();
  if (data) storeSettings = { ...storeSettings, ...data };
}
function openCheckout() {
  if (!cart.length) {
    notify("Adicione produtos à sacola antes de continuar.");
    return;
  }
  const root = document.createElement("div");
  root.className = "checkout-overlay";
  root.id = "checkout-overlay";
  const deliveryOptions = [
    storeSettings.delivery_enabled
      ? '<option value="delivery">Receber em casa</option>'
      : "",
    storeSettings.pickup_enabled
      ? '<option value="pickup">Retirar na loja</option>'
      : "",
  ].join("");
  root.innerHTML = `<section class="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><div class="checkout-head"><div><span class="eyebrow">MERCADO JESI</span><h2 id="checkout-title">Finalizar pedido</h2></div><button type="button" class="checkout-close" aria-label="Fechar">×</button></div><form id="store-checkout-form" class="checkout-form"><div class="checkout-section"><h3>Seus dados</h3><div class="checkout-fields"><label>Nome completo<input name="name" autocomplete="name" maxlength="120" required></label><label>Telefone<input name="phone" type="tel" autocomplete="tel" placeholder="(18) 99999-9999" required></label><label class="checkout-wide">E-mail para receber o rastreamento (opcional)<input name="email" type="email" autocomplete="email" maxlength="254" placeholder="voce@email.com"></label></div></div><div class="checkout-section"><h3>Como deseja receber?</h3><label class="checkout-wide">Recebimento<select name="fulfillment" id="checkout-fulfillment" required>${deliveryOptions}</select></label><div id="checkout-address" class="checkout-fields"><label>CEP<input name="postal_code" inputmode="numeric" maxlength="9" placeholder="00000-000"></label><label>Rua / Avenida<input name="street" autocomplete="street-address" maxlength="160" required></label><label>Número<input name="number" maxlength="20" required></label><label>Complemento<input name="complement" maxlength="100"></label><label>Bairro<input name="neighborhood" maxlength="100" required></label><label>Cidade<input name="city" maxlength="100" required></label><label>Estado (UF)<input name="state" maxlength="2" placeholder="SP"></label></div><p class="checkout-shipping" id="checkout-shipping-note"></p></div><div class="checkout-section"><h3>Cupom de desconto</h3><label class="checkout-wide">Código do cupom<input name="coupon_code" maxlength="40" autocomplete="off" placeholder="Ex.: BEMVINDO"></label></div><div class="checkout-section"><h3>Forma de pagamento</h3><div class="checkout-payment"><label><input type="radio" name="payment_method" value="pix" checked> Pix pelo Mercado Pago</label><label><input type="radio" name="payment_method" value="card"> Cartão de crédito pelo Mercado Pago</label><label><input type="radio" name="payment_method" value="onsite_card"> Cartão presencial (entrega ou retirada)</label></div></div><label class="checkout-wide">Observações (opcional)<textarea name="notes" rows="2" maxlength="1000" placeholder="Referência, preferência ou instrução para a entrega"></textarea></label><div class="checkout-total"><span>Total estimado</span><strong id="checkout-total"></strong></div><p class="checkout-error" id="checkout-error" role="alert"></p><button class="primary-button checkout-submit" type="submit">Confirmar pedido</button><small class="checkout-privacy"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>O preço e a disponibilidade serão confirmados pelo sistema antes de registrar o pedido.</span></small></form></section>`;
  document.body.appendChild(root);
  const form = root.querySelector("#store-checkout-form"),
    fulfillment = form.elements.fulfillment,
    subtotal = cart.reduce(
      (sum, item) => sum + item.qty * Number(item.price),
      0,
    ),
    address = root.querySelector("#checkout-address"),
    shippingNote = root.querySelector("#checkout-shipping-note"),
    totalEl = root.querySelector("#checkout-total");
  function updateFulfillment() {
    const delivery = fulfillment.value === "delivery";
    address.hidden = !delivery;
    address
      .querySelectorAll("input")
      .forEach(
        (input) =>
          (input.required =
            delivery &&
            ["street", "number", "neighborhood", "city"].includes(input.name)),
      );
    const fee =
      delivery &&
      !(
        storeSettings.free_delivery_minimum > 0 &&
        subtotal >= Number(storeSettings.free_delivery_minimum)
      )
        ? Number(storeSettings.delivery_fee || 0)
        : 0;
    totalEl.textContent = money(subtotal + fee);
    shippingNote.textContent = delivery
      ? fee
        ? `Taxa de entrega estimada: ${money(fee)}. O valor será confirmado no pedido.`
        : "Entrega grátis para este valor de compra."
      : "Retirada na loja sem taxa de entrega.";
  }
  fulfillment.addEventListener("change", updateFulfillment);
  updateFulfillment();
  form.elements.phone.addEventListener(
    "input",
    (event) => (event.target.value = formatBrazilPhone(event.target.value)),
  );
  const cepInput = form.elements.postal_code;
  cepInput?.addEventListener("blur", async () => {
    const cep = String(cepInput.value || "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Falha ao consultar CEP");
      const addressData = await response.json();
      if (addressData.erro) {
        notify("CEP não encontrado.");
        return;
      }
      for (const [field, value] of [
        ["street", addressData.logradouro],
        ["neighborhood", addressData.bairro],
        ["city", addressData.localidade],
        ["state", addressData.uf],
      ])
        if (value && !form.elements[field].value)
          form.elements[field].value = value;
      form.elements.number?.focus();
    } catch (error) {
      console.warn("Consulta de CEP indisponível:", error);
    }
  });
  root
    .querySelector(".checkout-close")
    .addEventListener("click", () => root.remove());
  root.addEventListener("click", (event) => {
    if (event.target === root) root.remove();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!supabase) {
      root.querySelector("#checkout-error").textContent =
        "A loja precisa estar conectada ao Supabase para receber pedidos online.";
      return;
    }
    const button = form.querySelector(".checkout-submit"),
      errorEl = root.querySelector("#checkout-error");
    button.disabled = true;
    button.textContent = "Registrando pedido...";
    errorEl.textContent = "";
    const values = Object.fromEntries(new FormData(form).entries()),
      customer = {
        name: String(values.name || "").trim(),
        phone: String(values.phone || "").trim(),
        email: String(values.email || "").trim() || null,
      },
      orderNotes = String(values.notes || "")
        .trim()
        .slice(0, 1000);
    if (values.fulfillment === "delivery")
      customer.address = {
        postal_code: String(values.postal_code || "").replace(/\D/g, ""),
        street: values.street,
        number: values.number,
        complement: values.complement,
        neighborhood: values.neighborhood,
        city: values.city,
        state: values.state,
      };
    try {
      const { data, error } = await supabase.functions.invoke(
        "create-checkout",
        {
          body: {
            customer,
            items: cart.map((item) => ({
              product_id: item.id,
              quantity: item.qty,
            })),
            fulfillment: values.fulfillment,
            payment_method: values.payment_method,
            coupon_code: String(values.coupon_code || "")
              .trim()
              .toUpperCase(),
            notes: orderNotes,
          },
        },
      );
      if (error) {
        let message = data?.error || error.message || "Falha ao enviar pedido.";
        try {
          const response = await error.context?.json();
          message = response?.error || message;
        } catch {}
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.tracking_code || !data?.order_number) {
        console.error("Resposta inválida do create-checkout:", data);
        throw new Error(
          "O pedido foi registrado, mas o código de rastreamento não foi retornado. Informe o problema ao mercado.",
        );
      }
      const trackingInfo = {
        order_number: data.order_number,
        phone: customer.phone,
        tracking_code: data.tracking_code,
        checkout_url: data.checkout_url || "",
      };
      localStorage.setItem(
        "mercado_jesi_tracking",
        JSON.stringify(trackingInfo),
      );
      closeCart();
      root.remove();
      if (data.checkout_url) {
        showTrackingReceipt({ ...trackingInfo, state: "pending" });
        return;
      }
      cart = [];
      renderCart();
      showTrackingReceipt({ ...trackingInfo, state: "success" });
    } catch (err) {
      errorEl.textContent = translateErrorMessage(
        err.message,
        "Não foi possível registrar o pedido.",
      );
      button.disabled = false;
      button.textContent = "Tentar novamente";
    }
  });
}
function showCheckoutReturn() {
  const params = new URLSearchParams(location.search),
    state = params.get("checkout"),
    number = params.get("order");
  if (!state) return;
  if (state === "success") {
    cart = [];
    renderCart();
  }
  let tracking = null;
  try {
    tracking = JSON.parse(
      localStorage.getItem("mercado_jesi_tracking") || "null",
    );
  } catch {}
  if (tracking && String(tracking.order_number) === String(number || "")) {
    showTrackingReceipt({
      ...tracking,
      state,
      checkout_url: state === "success" ? "" : tracking.checkout_url || "",
    });
  } else {
    const messages = {
      success: `Pagamento recebido para o pedido #${number || ""}.`,
      pending: `Pagamento pendente para o pedido #${number || ""}.`,
      failure: `O pagamento do pedido #${number || ""} não foi concluído. Se necessário, fale com o mercado.`,
    };
    notify(messages[state] || "Retorno do pagamento recebido.");
  }
  history.replaceState({}, document.title, location.pathname + location.hash);
}
loadStoreSettings();
loadProducts();
renderCart();
showCheckoutReturn();
(() => {
  const button = document.getElementById("back-to-top");
  if (!button) return;
  const updateVisibility = () =>
    button.classList.toggle("is-visible", window.scrollY > 320);
  button.addEventListener("click", () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    }),
  );
  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
})();
