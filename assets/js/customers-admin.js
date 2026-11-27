import { supabase } from "./supabase.js";
import { translateErrorMessage } from "./error-translations.js";

let content;
let notify;
let customers = [];
let editingCustomer = null;
let busy = false;

const escapeHTML = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("pt-BR")
    : "—";

const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const orderStatuses = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparação",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function addStyles() {
  if (document.querySelector("#customers-admin-styles")) return;

  const style = document.createElement("style");
  style.id = "customers-admin-styles";
  style.textContent = `
    .customers-admin{display:grid;gap:22px}
    .customers-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .customers-heading h2{margin:0 0 6px;font-size:1.35rem}
    .customers-heading p{margin:0;color:var(--muted,#9298a6)}
    .customers-panel{padding:20px;background:var(--panel,#11141d);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:14px;min-width:0}
    .customers-toolbar{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
    .customers-toolbar input{flex:1;min-width:220px;padding:11px 13px;border:1px solid var(--border,#dfe5df);border-radius:9px;background:var(--input-bg,transparent);color:inherit;font:inherit}
    .customers-btn{border:0;border-radius:9px;padding:10px 15px;font:inherit;font-weight:700;cursor:pointer}
    .customers-btn:disabled{opacity:.55;cursor:wait}
    .customers-primary{background:#176b43;color:#fff}
    .customers-secondary{background:rgba(148,163,184,.14);color:inherit}
    .customers-danger{background:rgba(220,38,38,.12);color:#ef7777}
    .customers-table-wrap{overflow-x:auto}
    .customers-table{width:100%;min-width:700px;border-collapse:collapse}
    .customers-table th,.customers-table td{padding:13px 11px;text-align:left;border-bottom:1px solid var(--border,rgba(255,255,255,.08));font-size:.86rem}
    .customers-table th{color:var(--muted,#9298a6);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em}
    .customers-table td:last-child{white-space:nowrap}
    .customers-actions{display:flex;gap:7px;flex-wrap:wrap}
    .customers-actions button{padding:7px 9px;font-size:.78rem}
    .customers-empty{padding:25px;text-align:center;color:var(--muted,#9298a6)}
    .customers-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .customers-field{display:grid;gap:7px}
    .customers-field-full{grid-column:1/-1}
    .customers-field label{font-size:.84rem;font-weight:700}
    .customers-field input{width:100%;min-width:0;padding:12px 13px;border:1px solid var(--border,#dfe5df);border-radius:9px;background:var(--input-bg,transparent);color:inherit;font:inherit}
    .customers-field input:focus,.customers-toolbar input:focus{outline:2px solid rgba(23,107,67,.35);border-color:#176b43}
    .customers-form-actions{display:flex;gap:9px;flex-wrap:wrap;grid-column:1/-1}
    .customers-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    .customers-detail-block{min-width:0}
    .customers-detail-block h4{margin:0 0 12px}
    .customers-detail-item{padding:11px 0;border-bottom:1px solid var(--border,rgba(255,255,255,.08));font-size:.86rem;line-height:1.5}
    .customers-detail-item:last-child{border-bottom:0}
    .customers-muted{color:var(--muted,#9298a6)}
    @media(max-width:650px){.customers-form,.customers-details{grid-template-columns:1fr}.customers-field-full,.customers-form-actions{grid-column:auto}.customers-panel{padding:15px}}
  `;
  document.head.appendChild(style);
}

function filteredCustomers() {
  const query = content.querySelector("#customers-search")?.value
    .trim()
    .toLocaleLowerCase("pt-BR") || "";

  return customers.filter((customer) =>
    [customer.full_name, customer.email, customer.phone]
      .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query))
  );
}

function renderRows() {
  const rows = filteredCustomers();
  const target = content.querySelector("#customers-rows");
  const count = content.querySelector("#customers-count");

  if (!target) return;

  if (count) count.textContent = `${rows.length} cliente(s)`;

  target.innerHTML = rows.length
    ? rows.map((customer) => `
        <tr>
          <td><strong>${escapeHTML(customer.full_name)}</strong></td>
          <td>${escapeHTML(customer.email || "—")}</td>
          <td>${escapeHTML(customer.phone || "—")}</td>
          <td>${formatDate(customer.created_at)}</td>
          <td>
            <div class="customers-actions">
              <button class="customers-btn customers-secondary" data-action="details" data-id="${customer.id}">Detalhes</button>
              <button class="customers-btn customers-secondary" data-action="edit" data-id="${customer.id}">Editar</button>
              <button class="customers-btn customers-danger" data-action="delete" data-id="${customer.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="5"><div class="customers-empty">Nenhum cliente encontrado.</div></td></tr>`;
}

function render() {
  content.innerHTML = `
    <section class="customers-admin">
      <div class="customers-heading">
        <div>
          <h2>Clientes</h2>
          <p>Cadastre clientes e consulte seus contatos, endereços e pedidos.</p>
        </div>
        <button class="customers-btn customers-primary" data-action="new">＋ Novo cliente</button>
      </div>

      <section class="customers-panel" id="customers-form-panel" hidden>
        <h3 id="customers-form-title">Novo cliente</h3>
        <form class="customers-form" data-form="customer">
          <div class="customers-field customers-field-full">
            <label for="customer-name">Nome completo *</label>
            <input id="customer-name" name="full_name" maxlength="160" required>
          </div>
          <div class="customers-field">
            <label for="customer-email">E-mail</label>
            <input id="customer-email" name="email" type="email" maxlength="180">
          </div>
          <div class="customers-field">
            <label for="customer-phone">Telefone</label>
            <input id="customer-phone" name="phone" type="tel" maxlength="30" placeholder="(00) 00000-0000">
          </div>
          <div class="customers-form-actions">
            <button class="customers-btn customers-primary" type="submit">Salvar cliente</button>
            <button class="customers-btn customers-secondary" type="button" data-action="cancel">Cancelar</button>
          </div>
        </form>
      </section>

      <section class="customers-panel" id="customers-details-panel" hidden></section>

      <section class="customers-panel">
        <div class="customers-toolbar">
          <input id="customers-search" type="search" placeholder="Buscar por nome, e-mail ou telefone..." aria-label="Buscar clientes">
          <span id="customers-count" class="customers-muted"></span>
        </div>
        <div class="customers-table-wrap">
          <table class="customers-table">
            <thead>
              <tr><th>Cliente</th><th>E-mail</th><th>Telefone</th><th>Cadastro</th><th>Ações</th></tr>
            </thead>
            <tbody id="customers-rows"></tbody>
          </table>
        </div>
      </section>
    </section>
  `;

  renderRows();
}

async function loadCustomers() {
  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, email, phone, created_at")
    .order("full_name", { ascending: true });

  if (error) throw error;

  customers = data || [];
  render();
}

function openForm(customer = null) {
  editingCustomer = customer;
  const panel = content.querySelector("#customers-form-panel");
  const form = panel.querySelector("form");

  form.reset();

  content.querySelector("#customers-form-title").textContent =
    customer ? "Editar cliente" : "Novo cliente";

  if (customer) {
    form.elements.full_name.value = customer.full_name || "";
    form.elements.email.value = customer.email || "";
    form.elements.phone.value = customer.phone || "";
  }

  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.full_name.focus();
}

async function showDetails(id) {
  const customer = customers.find((item) => item.id === id);
  if (!customer) return;

  const panel = content.querySelector("#customers-details-panel");
  panel.hidden = false;
  panel.innerHTML = `<p class="customers-muted">Carregando dados do cliente...</p>`;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  const [addressResult, orderResult] = await Promise.all([
    supabase
      .from("addresses")
      .select("id, label, recipient, postal_code, street, number, complement, neighborhood, city, state, is_default")
      .eq("customer_id", id)
      .order("is_default", { ascending: false }),
    supabase
      .from("orders")
      .select("id, order_number, status, total, fulfillment, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (addressResult.error) throw addressResult.error;
  if (orderResult.error) throw orderResult.error;

  const addresses = addressResult.data || [];
  const orders = orderResult.data || [];

  panel.innerHTML = `
    <div class="customers-heading">
      <div>
        <h3>${escapeHTML(customer.full_name)}</h3>
        <p>${escapeHTML(customer.email || "Sem e-mail")} · ${escapeHTML(customer.phone || "Sem telefone")}</p>
      </div>
      <button class="customers-btn customers-secondary" data-action="close-details">Fechar</button>
    </div>
    <div class="customers-details" style="margin-top:20px">
      <div class="customers-detail-block">
        <h4>Endereços (${addresses.length})</h4>
        ${addresses.length ? addresses.map((address) => `
          <div class="customers-detail-item">
            <strong>${escapeHTML(address.label || "Endereço")}</strong>
            ${address.is_default ? '<span class="customers-muted"> · Principal</span>' : ""}
            <br>${escapeHTML(address.recipient)}
            <br>${escapeHTML(address.street)}, ${escapeHTML(address.number)}
            ${address.complement ? ` - ${escapeHTML(address.complement)}` : ""}
            <br>${escapeHTML(address.neighborhood || "")}
            <br>${escapeHTML([address.city, address.state].filter(Boolean).join(" / ") || "Cidade não informada")}
            <br><span class="customers-muted">CEP: ${escapeHTML(address.postal_code || "—")}</span>
          </div>
        `).join("") : '<p class="customers-muted">Nenhum endereço cadastrado.</p>'}
      </div>
      <div class="customers-detail-block">
        <h4>Últimos pedidos (${orders.length})</h4>
        ${orders.length ? orders.map((order) => `
          <div class="customers-detail-item">
            <strong>Pedido #${escapeHTML(order.order_number)}</strong>
            <br>${escapeHTML(orderStatuses[order.status] || order.status)}
            · ${escapeHTML(order.fulfillment === "delivery" ? "Entrega" : "Retirada")}
            <br>${money(order.total)} · ${formatDate(order.created_at)}
          </div>
        `).join("") : '<p class="customers-muted">Nenhum pedido vinculado a este cliente.</p>'}
      </div>
    </div>
  `;
}

async function saveCustomer(form) {
  const values = new FormData(form);
  const payload = {
    full_name: String(values.get("full_name") || "").trim(),
    email: String(values.get("email") || "").trim() || null,
    phone: String(values.get("phone") || "").trim() || null,
  };

  if (!payload.full_name) {
    throw new Error("Informe o nome do cliente.");
  }

  const request = editingCustomer
    ? supabase.from("customers").update(payload).eq("id", editingCustomer.id)
    : supabase.from("customers").insert(payload);

  const { error } = await request;
  if (error) throw error;

  notify(editingCustomer ? "Cliente atualizado." : "Cliente cadastrado.");
  editingCustomer = null;
  await loadCustomers();
}

async function deleteCustomer(id) {
  const customer = customers.find((item) => item.id === id);
  if (!customer) return;

  const confirmed = window.confirm(
    `Excluir o cliente "${customer.full_name}"? Os endereços vinculados também serão excluídos. Os pedidos permanecerão no sistema, mas perderão o vínculo com este cadastro.`
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("customers")
    .delete()
    .eq("id", id);

  if (error) throw error;

  notify("Cliente excluído.");
  await loadCustomers();
}

export function mountCustomersAdmin({ content: target, notify: showNotify }) {
  content = target;
  notify = showNotify;
  editingCustomer = null;

  addStyles();

  content.innerHTML = `
    <section class="customers-admin">
      <div class="customers-panel customers-empty">Carregando clientes...</div>
    </section>
  `;

  if (!content.dataset.customersAdminEventsBound) {
    content.addEventListener("click", handleClick);
    content.addEventListener("submit", handleSubmit);
    content.addEventListener("input", handleInput);
    content.dataset.customersAdminEventsBound = "true";
  }

  loadCustomers().catch((error) => {
    console.error(error);
    content.innerHTML = `
      <section class="customers-panel">
        <h3>Não foi possível carregar os clientes</h3>
        <p class="customers-muted">${escapeHTML(translateErrorMessage(error.message, "Verifique sua conexão e as permissões no Supabase."))}</p>
        <button class="customers-btn customers-secondary" data-action="retry">Tentar novamente</button>
      </section>
    `;
  });
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || busy) return;

  const { action, id } = button.dataset;

  try {
    if (action === "new") openForm();
    if (action === "cancel") {
      editingCustomer = null;
      content.querySelector("#customers-form-panel").hidden = true;
    }
    if (action === "close-details") {
      content.querySelector("#customers-details-panel").hidden = true;
    }
    if (action === "edit") {
      const customer = customers.find((item) => item.id === id);
      if (customer) openForm(customer);
    }
    if (action === "details") await showDetails(id);
    if (action === "delete") {
      busy = true;
      button.disabled = true;
      await deleteCustomer(id);
    }
    if (action === "retry") {
      busy = true;
      await loadCustomers();
    }
  } catch (error) {
    console.error(error);
    notify(error.message || "Não foi possível concluir a operação.");
  } finally {
    busy = false;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest('form[data-form="customer"]');
  if (!form || busy) return;

  event.preventDefault();
  busy = true;

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  try {
    await saveCustomer(form);
  } catch (error) {
    console.error(error);
    notify(error.message || "Não foi possível salvar o cliente.");
  } finally {
    busy = false;
    if (button?.isConnected) button.disabled = false;
  }
}

function handleInput(event) {
  if (event.target.id === "customers-search") renderRows();
}
