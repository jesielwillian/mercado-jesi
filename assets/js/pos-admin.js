import { supabase } from "./supabase.js";
import { translateErrorMessage } from "./error-translations.js";

let content;
let notify;
let products = [];
let cart = [];
let register = null;
let lastSale = null;

const money = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

const formatMoneyInput = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return `R$ ${amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const parseMoney = (value) => {
  let normalized = String(value ?? "")
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/[\s\u00a0]/g, "");

  if (!normalized) return Number.NaN;

  // Formato brasileiro: 1.234,56 -> 1234.56
  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) {
    // Inteiro com separador de milhar: 1.234 -> 1234
    normalized = normalized.replace(/\./g, "");
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
};

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const stockOf = (product) => {
  const inventory = Array.isArray(product.inventory)
    ? product.inventory[0]
    : product.inventory;

  return Number(inventory?.quantity || 0);
};

function addStyles() {
  if (document.querySelector("#pos-admin-styles")) return;

  const style = document.createElement("style");
  style.id = "pos-admin-styles";

  style.textContent = `
    .pos-admin { display:grid; gap:20px; }
    .pos-heading {
      display:flex; justify-content:space-between;
      align-items:center; gap:14px; flex-wrap:wrap;
    }
    .pos-heading h2 { margin:0 0 5px; font-size:1.4rem; }
    .pos-heading p { margin:0; color:var(--muted,#778078); }
    .pos-register-status {
      display:flex; align-items:center; gap:8px;
      padding:10px 14px; border-radius:9px;
      background:var(--panel,#fff);
      border:1px solid var(--border,#e5e9e5);
      font-size:.85rem; font-weight:700;
    }
    .pos-dot {
      width:9px; height:9px; border-radius:50%;
      background:#dc8b27;
    }
    .pos-dot.open { background:#20a568; }
    .pos-layout {
      display:grid; grid-template-columns:minmax(0,1.5fr) minmax(310px,.85fr);
      gap:18px; align-items:start;
    }
    .pos-panel {
      min-width:0; padding:20px;
      background:var(--panel,#fff);
      border:1px solid var(--border,#e5e9e5);
      border-radius:14px;
    }
    .pos-panel h3 { margin:0 0 15px; font-size:1rem; }
    .pos-search {
      display:flex; gap:9px; margin-bottom:16px;
    }
    .pos-search input {
      width:100%; min-width:0; padding:13px 14px;
      border:1px solid var(--border,#dfe5df);
      border-radius:9px; background:var(--input-bg,#fff);
      color:inherit; font:inherit; outline:none;
    }
    .pos-search input:focus,
    .pos-field input:focus,
    .pos-field select:focus {
      border-color:var(--primary,#176b43);
    }
    .pos-product-list {
      display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px; max-height:570px; overflow:auto;
    }
    .pos-product {
      display:flex; flex-direction:column; align-items:flex-start;
      gap:7px; padding:13px; text-align:left;
      border:1px solid var(--border,#e5e9e5);
      background:var(--input-bg,#fff); color:inherit;
      border-radius:10px; cursor:pointer; min-width:0;
    }
    .pos-product:hover { border-color:var(--primary,#176b43); }
    .pos-product:disabled { opacity:.45; cursor:not-allowed; }
    .pos-product strong {
      font-size:.88rem; line-height:1.35;
      overflow-wrap:anywhere;
    }
    .pos-product small { color:var(--muted,#778078); }
    .pos-product b { color:var(--primary,#176b43); }
    .pos-empty {
      grid-column:1/-1; padding:30px 12px;
      text-align:center; color:var(--muted,#778078);
    }
    .pos-cart { display:grid; gap:14px; }
    .pos-cart-list {
      display:grid; gap:10px; max-height:310px;
      overflow:auto;
    }
    .pos-cart-item {
      display:grid; grid-template-columns:minmax(0,1fr) auto;
      gap:8px; padding-bottom:11px;
      border-bottom:1px solid var(--border,#e5e9e5);
    }
    .pos-cart-item strong { display:block; font-size:.86rem; }
    .pos-cart-item small { color:var(--muted,#778078); }
    .pos-cart-controls {
      display:flex; align-items:center; gap:8px; margin-top:10px;
    }
    .pos-cart-controls button {
      display:inline-grid; place-items:center;
      width:34px; height:34px; flex:0 0 34px;
      padding:0; border:1px solid #dce8df; border-radius:11px;
      background:linear-gradient(180deg,#fff 0%,#f5f9f6 100%);
      color:#286344; font-size:18px; font-weight:700; line-height:1;
      cursor:pointer; box-shadow:0 2px 5px rgba(22,75,45,.06);
      transition:background .18s ease,border-color .18s ease,color .18s ease,
        box-shadow .18s ease,transform .18s ease;
    }
    .pos-cart-controls button:hover {
      background:#eaf5ed; border-color:#9fc8aa;
      box-shadow:0 4px 10px rgba(22,75,45,.12); transform:translateY(-1px);
    }
    .pos-cart-controls button:active { transform:scale(.96); }
    .pos-cart-controls button:focus-visible {
      outline:3px solid rgba(47,128,80,.2); outline-offset:2px;
    }
    .pos-cart-controls input {
      width:76px; height:36px; padding:0 8px;
      border:1px solid #dce8df; border-radius:11px;
      background:#fff; color:#203128; font-size:13px; font-weight:700;
      font-variant-numeric:tabular-nums; text-align:center;
      box-shadow:inset 0 1px 2px rgba(20,50,30,.04);
    }
    .pos-cart-controls input:focus {
      outline:none; border-color:#5b9b70;
      box-shadow:0 0 0 3px rgba(47,128,80,.12);
    }
    .pos-cart-controls .pos-remove {
      color:#b94b4b; border-color:#f0dddd;
      background:linear-gradient(180deg,#fff 0%,#fff7f6 100%);
    }
    .pos-cart-controls .pos-remove:hover {
      color:#a83232; border-color:#e5aaaa; background:#fff0ee;
    }
    .pos-line-total { font-size:.86rem; font-weight:700; white-space:nowrap; }
    .pos-field { display:grid; gap:6px; min-width:0; }
    .pos-field span { font-size:.78rem; font-weight:700; }
    .pos-field input, .pos-field select {
      width:100%; min-width:0; padding:10px 11px;
      border:1px solid var(--border,#dfe5df);
      border-radius:8px; background:var(--input-bg,#fff);
      color:inherit; font:inherit;
    }
    .pos-fields { display:grid; grid-template-columns:1fr 1fr; gap:11px; }
    .pos-field-wide { grid-column:1/-1; }
    .pos-totals { display:grid; gap:9px; }
    .pos-total-row {
      display:flex; justify-content:space-between; gap:10px;
      font-size:.88rem;
    }
    .pos-total-final {
      padding-top:12px; border-top:1px solid var(--border,#e5e9e5);
      font-size:1.2rem; font-weight:800;
    }
    .pos-primary, .pos-secondary {
      border:0; border-radius:9px; padding:12px 16px;
      font:inherit; font-weight:750; cursor:pointer;
    }
    .pos-primary { background:linear-gradient(135deg,#1d7549,#176b43); color:white; border:1px solid #176b43; }
    .pos-secondary {
      background:var(--input-bg,#f1f4f1);
      color:inherit; border:1px solid var(--border,#dfe5df);
    }
    .pos-primary:disabled { opacity:.72; cursor:not-allowed; }
    .pos-checkout { width:100%; }
    .pos-change {
      padding:10px; border-radius:8px;
      background:var(--input-bg,#f3f6f3);
      font-size:.85rem; display:flex; justify-content:space-between;
    }
    .pos-cash-gate {
      max-width:520px; margin:25px auto; text-align:center;
    }
    .pos-cash-gate h3 { margin-bottom:8px; }
    .pos-cash-gate p { color:var(--muted,#778078); }
    .pos-cash-gate form {
      display:flex; gap:10px; align-items:end;
      text-align:left; margin-top:20px;
    }
    .pos-cash-gate .pos-field { flex:1; }
    .pos-receipt-backdrop {
      position:fixed; inset:0; z-index:10000;
      display:grid; place-items:center; padding:18px;
      background:#0009;
    }
    .pos-receipt {
      width:min(420px,100%); max-height:90vh; overflow:auto;
      padding:24px; border-radius:12px;
      background:#fff; color:#171717;
    }
    .pos-receipt h3 { text-align:center; margin:0 0 5px; }
    .pos-receipt p { text-align:center; margin:5px 0 18px; font-size:.85rem; }
    .pos-receipt-row {
      display:flex; justify-content:space-between;
      gap:10px; padding:7px 0;
      border-bottom:1px dashed #ddd; font-size:.86rem;
    }
    .pos-receipt-actions {
      display:flex; gap:9px; margin-top:18px;
    }
    .pos-receipt-actions button { flex:1; }
    @media(max-width:900px) {
      .pos-layout { grid-template-columns:1fr; }
      .pos-product-list { max-height:390px; }
    }
    @media(max-width:520px) {
      .pos-panel { padding:14px; }
      .pos-product-list { grid-template-columns:1fr 1fr; }
      .pos-cash-gate form { flex-direction:column; align-items:stretch; }
      .pos-fields { grid-template-columns:1fr; }
      .pos-field-wide { grid-column:auto; }
    }
    @media print {
      body * { visibility:hidden !important; }
      #pos-receipt-root, #pos-receipt-root * { visibility:visible !important; }
      #pos-receipt-root {
        position:absolute; inset:0; background:white;
      }
      .pos-receipt {
        width:100%; max-height:none; overflow:visible;
        box-shadow:none; margin:0 auto;
      }
      .pos-receipt-actions { display:none !important; }
    }
  `;

  document.head.appendChild(style);
}

function renderPage() {
  content.innerHTML = `
    <div class="pos-admin">
      <header class="pos-heading">
        <div>
          <span class="eyebrow">OPERAÇÃO DA LOJA</span>
          <h2>Frente de caixa</h2>
          <p>Registre vendas presenciais e acompanhe o carrinho.</p>
        </div>
        <div class="pos-register-status" id="pos-register-status">
          <span class="pos-dot"></span>
          Verificando caixa...
        </div>
      </header>
      <div id="pos-main">
        <div class="pos-panel pos-empty">Carregando frente de caixa...</div>
      </div>
      <div id="pos-receipt-root"></div>
    </div>
  `;
}

async function loadRegister() {
  const { data, error } = await supabase
    .from("cash_registers")
    .select("id,opening_amount,opened_at,opened_by")
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  register = data;
  updateRegisterStatus();
}

function updateRegisterStatus() {
  const element = content.querySelector("#pos-register-status");
  if (!element) return;

  element.innerHTML = register
    ? `<span class="pos-dot open"></span> Caixa aberto`
    : `<span class="pos-dot"></span> Caixa fechado`;
}

function renderCashGate() {
  content.querySelector("#pos-main").innerHTML = `
    <section class="pos-panel pos-cash-gate">
      <span class="eyebrow">CONTROLE DE CAIXA</span>
      <h3>Abra o caixa para começar</h3>
      <p>Informe o valor inicial disponível no caixa físico.</p>
      <form id="pos-open-form">
        <label class="pos-field">
          <span>Fundo de caixa (R$)</span>
          <input name="opening_amount" type="text" inputmode="decimal"
            autocomplete="off" placeholder="R$ 0,00" value="R$ 0,00" required>
        </label>
        <button class="pos-primary" type="submit">Abrir caixa</button>
      </form>
    </section>
  `;

  const form = content.querySelector("#pos-open-form");
  const openingInput = form.querySelector('[name="opening_amount"]');

  openingInput.addEventListener("input", () => {
    openingInput.value = formatMoneyInput(openingInput.value);
  });
  form.addEventListener("submit", openRegister);
}

async function openRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = form.querySelector("button");
  const amount = parseMoney(new FormData(form).get("opening_amount"));

  if (!Number.isFinite(amount) || amount < 0) {
    notify("Informe um valor inicial válido.");
    return;
  }

  button.disabled = true;
  button.textContent = "Abrindo caixa...";

  try {
    const { error } = await supabase.rpc("open_cash_register", {
      p_opening_amount: amount,
    });

    if (error) throw error;

    notify("Caixa aberto com sucesso.");
    await loadRegister();
    await renderPOS();
  } catch (error) {
    console.error(error);
    notify(`Não foi possível abrir o caixa: ${error.message}`);
    button.disabled = false;
    button.textContent = "Abrir caixa";
  }
}

async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,sku,barcode,unit,price,active,inventory(quantity)")
    .eq("active", true)
    .order("name");

  if (error) throw error;

  products = (data || []).map((product) => ({
    ...product,
    stock: stockOf(product),
  }));
}

function renderPOSInterface() {
  if (!register) {
    renderCashGate();
    return;
  }

  content.querySelector("#pos-main").innerHTML = `
    <div class="pos-layout">
      <section class="pos-panel">
        <h3>Produtos</h3>
        <div class="pos-search">
          <input id="pos-search" type="search"
            placeholder="Buscar produto, SKU ou código de barras..."
            autocomplete="off">
        </div>
        <div class="pos-product-list" id="pos-product-list"></div>
      </section>

      <section class="pos-panel">
        <h3>Venda atual</h3>
        <div class="pos-cart">
          <div class="pos-cart-list" id="pos-cart-list"></div>

          <form id="pos-checkout-form">
            <div class="pos-fields">
              <label class="pos-field pos-field-wide">
                <span>Cliente</span>
                <input name="customer_name" maxlength="140"
                  value="Consumidor final">
              </label>

              <label class="pos-field pos-field-wide">
                <span>Telefone (opcional)</span>
                <input name="customer_phone" type="tel" maxlength="15" autocomplete="tel"
                  placeholder="(00) 00000-0000">
              </label>

              <label class="pos-field">
                <span>Desconto (R$)</span>
                <input name="discount" id="pos-discount"
                  type="number" min="0" step="0.01" value="0">
              </label>

              <label class="pos-field">
                <span>Pagamento</span>
                <select name="payment_method" id="pos-payment">
                  <option value="cash">Dinheiro</option>
                  <option value="pix">Pix</option>
                  <option value="card">Cartão</option>
                </select>
              </label>

              <label class="pos-field pos-field-wide" id="pos-received-field">
                <span>Valor recebido (R$)</span>
                <input name="received" id="pos-received"
                  type="number" min="0" step="0.01" placeholder="0,00">
              </label>
            </div>

            <div class="pos-totals">
              <div class="pos-total-row">
                <span>Subtotal</span>
                <strong id="pos-subtotal">${money(0)}</strong>
              </div>
              <div class="pos-total-row">
                <span>Desconto</span>
                <strong id="pos-discount-label">${money(0)}</strong>
              </div>
              <div class="pos-total-row pos-total-final">
                <span>Total</span>
                <strong id="pos-total">${money(0)}</strong>
              </div>
              <div class="pos-change" id="pos-change" hidden>
                <span>Troco</span><strong>${money(0)}</strong>
              </div>
            </div>

            <button class="pos-primary pos-checkout" id="pos-finish"
              type="submit" disabled>Finalizar venda</button>
          </form>
        </div>
      </section>
    </div>
  `;

  content
    .querySelector("#pos-search")
    .addEventListener("input", (event) =>
      renderProductList(event.target.value),
    );

  content
    .querySelector("#pos-product-list")
    .addEventListener("click", handleProductClick);

  content
    .querySelector("#pos-search")
    .addEventListener("keydown", handleBarcodeEnter);

  content
    .querySelector("#pos-cart-list")
    .addEventListener("click", handleCartClick);

  content
    .querySelector("#pos-cart-list")
    .addEventListener("change", handleCartQuantityChange);

  content
    .querySelector("#pos-discount")
    .addEventListener("input", updateTotals);

  content
    .querySelector("#pos-payment")
    .addEventListener("change", updatePaymentFields);

  content
    .querySelector("#pos-received")
    .addEventListener("input", updateTotals);

  content
    .querySelector("#pos-checkout-form")
    .addEventListener("submit", finalizeSale);

  renderProductList();
  renderCart();
  updatePaymentFields();
}

function renderProductList(query = "") {
  const list = content.querySelector("#pos-product-list");
  if (!list) return;

  const normalized = query.trim().toLocaleLowerCase("pt-BR");

  const filtered = products.filter((product) =>
    `${product.name} ${product.sku || ""} ${product.barcode || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalized),
  );

  list.innerHTML = filtered.length
    ? filtered
        .map(
          (product) => `
      <button type="button" class="pos-product"
        data-add-product="${escapeHTML(product.id)}"
        ${product.stock <= 0 ? "disabled" : ""}>
        <strong>${escapeHTML(product.name)}</strong>
        <small>${escapeHTML(product.sku || product.barcode || product.unit)}</small>
        <b>${money(product.price)}</b>
        <small>Estoque: ${product.stock.toLocaleString("pt-BR")}</small>
      </button>
    `,
        )
        .join("")
    : `<div class="pos-empty">Nenhum produto encontrado.</div>`;
}

function addProductToCart(product) {
  if (!product || product.stock <= 0) {
    notify("Produto sem estoque disponível.");
    return;
  }

  const existing = cart.find((item) => item.id === product.id);
  const step = ["kg", "l"].includes(product.unit) ? 0.001 : 1;

  if (existing) {
    if (existing.quantity + step > product.stock) {
      notify("Quantidade maior que o estoque disponível.");
      return;
    }
    existing.quantity = Number((existing.quantity + step).toFixed(3));
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  renderCart();
}

function handleProductClick(event) {
  const button = event.target.closest("[data-add-product]");
  if (!button) return;

  const product = products.find((item) => item.id === button.dataset.addProduct);
  addProductToCart(product);
}

function handleBarcodeEnter(event) {
  if (event.key !== "Enter") return;

  event.preventDefault();

  const barcode = event.currentTarget.value.trim();
  if (!barcode) return;

  const product = products.find(
    (item) => String(item.barcode || "").trim() === barcode
  );

  if (!product) {
    notify("Nenhum produto encontrado com esse código de barras.");
    return;
  }

  addProductToCart(product);
  event.currentTarget.value = "";
  renderProductList("");
}

function handleCartClick(event) {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;

  const item = cart.find((product) => product.id === button.dataset.productId);
  if (!item) return;

  const step = ["kg", "l"].includes(item.unit) ? 0.001 : 1;
  const action = button.dataset.cartAction;

  if (action === "increase") {
    if (item.quantity + step > item.stock) {
      notify("Quantidade maior que o estoque disponível.");
      return;
    }
    item.quantity = Number((item.quantity + step).toFixed(3));
  }

  if (action === "decrease") {
    item.quantity = Number((item.quantity - step).toFixed(3));
    if (item.quantity <= 0) {
      cart = cart.filter((product) => product.id !== item.id);
    }
  }

  if (action === "remove") {
    cart = cart.filter((product) => product.id !== item.id);
  }

  renderCart();
}

function handleCartQuantityChange(event) {
  const input = event.target.closest("[data-cart-quantity]");
  if (!input) return;

  const item = cart.find((product) => product.id === input.dataset.cartQuantity);
  if (!item) return;

  const raw = input.value.trim().replace(",", ".");
  const quantity = Number(raw);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    notify("Informe uma quantidade válida.");
    renderCart();
    return;
  }

  if (quantity > item.stock) {
    notify("Quantidade maior que o estoque disponível.");
    renderCart();
    return;
  }

  item.quantity = Number(quantity.toFixed(3));
  renderCart();
}

function totals() {
  const subtotal = cart.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0,
  );

  const discountInput = content.querySelector("#pos-discount");
  const discount = Math.max(0, parseMoney(discountInput?.value || 0));

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    total: Number(Math.max(0, subtotal - discount).toFixed(2)),
  };
}

function renderCart() {
  const list = content.querySelector("#pos-cart-list");
  if (!list) return;

  list.innerHTML = cart.length
    ? cart.map((item) => {
        return `
          <div class="pos-cart-item">
            <div>
              <strong>${escapeHTML(item.name)}</strong>
              <small>${money(item.price)} / ${escapeHTML(item.unit)}</small>
              <div class="pos-cart-controls">
                <button type="button" data-cart-action="decrease"
                  data-product-id="${escapeHTML(item.id)}">−</button>
                <input
                  type="text"
                  inputmode="decimal"
                  aria-label="Quantidade de ${escapeHTML(item.name)}"
                  data-cart-quantity="${escapeHTML(item.id)}"
                  value="${item.quantity}"
                  style="width:76px;text-align:center"
                >
                <button type="button" data-cart-action="increase"
                  data-product-id="${escapeHTML(item.id)}">+</button>
                <button type="button" class="pos-remove"
                  data-cart-action="remove"
                  data-product-id="${escapeHTML(item.id)}"
                  aria-label="Remover produto">×</button>
              </div>
            </div>
            <span class="pos-line-total">${money(item.price * item.quantity)}</span>
          </div>
        `;
      }).join("")
    : `<div class="pos-empty">Adicione produtos para iniciar a venda.</div>`;

  updateTotals();
}

function updateTotals() {
  const values = totals();

  const subtotal = content.querySelector("#pos-subtotal");
  if (!subtotal) return;

  content.querySelector("#pos-subtotal").textContent = money(values.subtotal);
  content.querySelector("#pos-discount-label").textContent = money(
    values.discount,
  );
  content.querySelector("#pos-total").textContent = money(values.total);

  const finish = content.querySelector("#pos-finish");
  const discountInput = content.querySelector("#pos-discount");
  const discountValid = values.discount <= values.subtotal;
  const totalValid = values.total > 0;

  const payment = content.querySelector("#pos-payment")?.value;
  const received = parseMoney(content.querySelector("#pos-received")?.value || 0);
  const receivedValid = payment !== "cash" || received >= values.total;

  finish.disabled =
    !cart.length || !discountValid || !totalValid || !receivedValid;

  const change = content.querySelector("#pos-change");
  if (payment === "cash" && received >= values.total && values.total > 0) {
    change.hidden = false;
    change.querySelector("strong").textContent = money(received - values.total);
  } else {
    change.hidden = true;
  }

  if (discountInput) {
    discountInput.setCustomValidity(
      discountValid ? "" : "O desconto não pode superar o subtotal.",
    );
  }
}

function updatePaymentFields() {
  const payment = content.querySelector("#pos-payment")?.value;
  const field = content.querySelector("#pos-received-field");

  if (!field) return;

  field.hidden = payment !== "cash";

  const input = content.querySelector("#pos-received");
  input.required = payment === "cash";

  if (payment !== "cash") input.value = "";

  updateTotals();
}

async function finalizeSale(event) {
  event.preventDefault();

  if (!register || !cart.length) {
    notify("Abra o caixa e adicione produtos antes de finalizar.");
    return;
  }

  const form = event.currentTarget;
  const values = new FormData(form);
  const calculated = totals();
  const paymentMethod = values.get("payment_method");
  const received = Number(values.get("received") || 0);

  if (calculated.discount > calculated.subtotal || calculated.total <= 0) {
    notify("Confira o subtotal e o desconto.");
    return;
  }

  if (paymentMethod === "cash" && received < calculated.total) {
    notify("O valor recebido é menor que o total.");
    return;
  }

  const button = form.querySelector("#pos-finish");
  button.disabled = true;
  button.textContent = "Processando venda...";

  const reference = crypto.randomUUID();

  try {
    const payload = {
      p_items: cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      })),
      p_payment_method: paymentMethod,
      p_discount: calculated.discount,
      p_customer_name: String(values.get("customer_name") || "").trim(),
      p_customer_phone: String(values.get("customer_phone") || "").trim(),
      p_reference: reference,
    };

    const { data, error } = await supabase.rpc("finalize_pos_sale", payload);
    if (error) throw error;

    lastSale = {
      ...data,
      items: [...cart],
      paymentMethod,
      received,
      change: paymentMethod === "cash" ? received - calculated.total : 0,
      customer: String(values.get("customer_name") || "Consumidor final"),
    };

    cart = [];
    await loadProducts();
    renderPOS();
    showReceipt(lastSale);

    notify(
      data.already_processed
        ? "Esta venda já havia sido registrada."
        : "Venda finalizada com sucesso.",
    );
  } catch (error) {
    console.error(error);
    notify(`Não foi possível finalizar: ${error.message || "erro no PDV"}`);
    button.disabled = false;
    button.textContent = "Finalizar venda";
  }
}

function showReceipt(sale) {
  const root = content.querySelector("#pos-receipt-root");

  root.innerHTML = `
    <div class="pos-receipt-backdrop">
      <section class="pos-receipt" role="dialog" aria-modal="true">
        <h3>Mercado Jesi</h3>
        <p>Comprovante de venda presencial</p>
        <div class="pos-receipt-row">
          <span>Pedido</span><strong>#${escapeHTML(sale.order_number)}</strong>
        </div>
        <div class="pos-receipt-row">
          <span>Cliente</span><strong>${escapeHTML(sale.customer)}</strong>
        </div>
        ${sale.items
          .map(
            (item) => `
          <div class="pos-receipt-row">
            <span>${escapeHTML(item.name)} × ${item.quantity}</span>
            <strong>${money(item.price * item.quantity)}</strong>
          </div>
        `,
          )
          .join("")}
        <div class="pos-receipt-row">
          <span>Total</span><strong>${money(sale.total)}</strong>
        </div>
        <div class="pos-receipt-row">
          <span>Pagamento</span>
          <strong>${{ cash: "Dinheiro", pix: "Pix", card: "Cartão" }[sale.paymentMethod]}</strong>
        </div>
        ${
          sale.paymentMethod === "cash"
            ? `
          <div class="pos-receipt-row">
            <span>Recebido</span><strong>${money(sale.received)}</strong>
          </div>
          <div class="pos-receipt-row">
            <span>Troco</span><strong>${money(sale.change)}</strong>
          </div>
        `
            : ""
        }
        <div class="pos-receipt-actions">
          <button type="button" class="pos-secondary" data-receipt-close>Fechar</button>
          <button type="button" class="pos-primary" data-receipt-print>Imprimir</button>
        </div>
      </section>
    </div>
  `;

  root
    .querySelector("[data-receipt-close]")
    .addEventListener("click", () => (root.innerHTML = ""));

  root
    .querySelector("[data-receipt-print]")
    .addEventListener("click", () => window.print());
}

async function renderPOS() {
  updateRegisterStatus();

  if (!register) {
    renderCashGate();
    return;
  }

  renderPOSInterface();
}

export async function mountPosAdmin(options = {}) {
  content = options.content || document.querySelector("#page-content");
  notify = options.notify || ((message) => console.log(message));

  if (!content || !supabase) {
    notify("Supabase não está disponível.");
    return;
  }

  addStyles();
  renderPage();

  try {
    await loadRegister();
    await loadProducts();
    renderPOS();
  } catch (error) {
    console.error(error);
    content.querySelector("#pos-main").innerHTML = `
      <div class="pos-panel pos-empty">
        Não foi possível carregar o PDV: ${escapeHTML(translateErrorMessage(error.message))}
      </div>
    `;
    notify("Erro ao carregar a frente de caixa.");
  }
}
