import { supabase } from "./supabase.js";

let orders = [];
let content;
let notify;

const statuses = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparação",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const money = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

const escapeHTML = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);

const formatDate = (value) => {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};

function addStyles() {
  if (document.querySelector("#orders-admin-styles")) return;

  const style = document.createElement("style");
  style.id = "orders-admin-styles";

  style.textContent = `
    .orders-admin { display:grid; gap:22px; }
    .orders-heading {
      display:flex; justify-content:space-between;
      align-items:center; gap:16px; flex-wrap:wrap;
    }
    .orders-heading h2 { margin:0 0 6px; font-size:1.35rem; }
    .orders-heading p { margin:0; color:var(--muted,#778078); }
    .orders-summary {
      display:flex; gap:12px; flex-wrap:wrap;
    }
    .orders-stat {
      flex:1; min-width:150px; padding:17px;
      background:var(--panel,#fff);
      border:1px solid var(--border,#e8ece8);
      border-radius:12px;
    }
    .orders-stat span {
      display:block; color:var(--muted,#778078);
      font-size:.82rem; margin-bottom:7px;
    }
    .orders-stat strong { font-size:1.35rem; }
    .orders-panel {
      padding:20px;
      background:var(--panel,#fff);
      border:1px solid var(--border,#e8ece8);
      border-radius:14px;
    }
    .orders-toolbar {
      display:flex; gap:12px; flex-wrap:wrap;
      margin-bottom:18px;
    }
    .orders-toolbar input,
    .orders-toolbar select {
      min-width:0; padding:11px 13px;
      border:1px solid var(--border,#dfe5df);
      border-radius:9px; background:var(--input-bg,#fff);
      color:inherit; font:inherit;
    }
    .orders-toolbar input { flex:1; min-width:220px; }
    .orders-btn {
      border:0; border-radius:9px; padding:10px 15px;
      font:inherit; font-weight:700; cursor:pointer;
    }
    .orders-btn-primary { background:#176b43; color:white; }
    .orders-table-wrap { overflow-x:auto; }
    .orders-table {
      width:100%; min-width:760px;
      border-collapse:collapse;
    }
    .orders-table th, .orders-table td {
      padding:13px 11px; text-align:left;
      border-bottom:1px solid var(--border,#edf0ed);
      font-size:.86rem;
    }
    .orders-table th {
      color:var(--muted,#778078);
      font-size:.73rem; letter-spacing:.04em;
    }
    .orders-table td strong { display:block; }
    .orders-muted {
      display:block; margin-top:4px;
      color:var(--muted,#778078); font-size:.78rem;
    }
    .orders-status {
      display:inline-flex; padding:5px 9px;
      border-radius:20px; font-size:.74rem;
      font-weight:700; white-space:nowrap;
    }
    .orders-status.pending { background:#fff3d6; color:#946200; }
    .orders-status.confirmed { background:#e7efff; color:#2455a5; }
    .orders-status.preparing { background:#f1eaff; color:#6941a5; }
    .orders-status.ready { background:#e1f5ed; color:#176b43; }
    .orders-status.out_for_delivery { background:#e4f4fa; color:#17617c; }
    .orders-status.completed { background:#e7f5ec; color:#176b43; }
    .orders-status.cancelled { background:#fff0f0; color:#b42318; }
    .orders-actions button {
      border:0; background:transparent; color:#176b43;
      font:inherit; font-weight:700; cursor:pointer;
    }
    .orders-empty {
      padding:30px 12px !important;
      text-align:center !important;
      color:var(--muted,#778078);
    }
    .orders-count {
      color:var(--muted,#778078);
      font-size:.84rem; margin-bottom:12px;
    }
    .order-modal-backdrop {
      position:fixed; inset:0; z-index:9999;
      display:grid; place-items:center;
      padding:18px; background:rgba(0,0,0,.65);
    }
    .order-modal {
      width:min(680px,100%); max-height:90vh;
      overflow:auto; padding:23px;
      background:var(--panel,#fff);
      color:var(--text,#202820);
      border:1px solid var(--border,#e8ece8);
      border-radius:16px;
      box-shadow:0 20px 70px rgba(0,0,0,.25);
    }
    .order-modal-header {
      display:flex; justify-content:space-between;
      align-items:center; gap:12px; margin-bottom:20px;
    }
    .order-modal-header h3 { margin:0; }
    .order-modal-close {
      border:0; background:transparent;
      font-size:1.5rem; cursor:pointer; color:inherit;
    }
    .order-detail-grid {
      display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
      gap:14px; margin-bottom:20px;
    }
    .order-detail-item {
      padding:12px; border-radius:9px;
      background:var(--input-bg,#f5f7f5);
    }
    .order-detail-item small {
      display:block; color:var(--muted,#778078);
      margin-bottom:5px;
    }
    .order-detail-item strong { overflow-wrap:anywhere; }
    .order-modal h4 { margin:20px 0 10px; }
    .order-items {
      width:100%; border-collapse:collapse;
    }
    .order-items td {
      padding:10px 5px;
      border-bottom:1px solid var(--border,#edf0ed);
      font-size:.86rem;
    }
    .order-items td:last-child { text-align:right; }
    .order-total {
      display:flex; justify-content:space-between;
      padding-top:15px; font-size:1.05rem;
      font-weight:800;
    }
    .order-status-control {
      display:grid; gap:8px; margin-top:20px;
    }
    .order-status-control select {
      width:100%; padding:12px;
      border:1px solid var(--border,#dfe5df);
      border-radius:9px; background:var(--input-bg,#fff);
      color:inherit; font:inherit;
    }
    @media(max-width:600px) {
      .orders-panel { padding:13px; }
      .orders-toolbar input { min-width:100%; }
      .order-detail-grid { grid-template-columns:1fr; }
      .order-modal { padding:17px; }
    }
  `;

  document.head.appendChild(style);
}

function render() {
  const query = (
    content.querySelector("#orders-search")?.value || ""
  ).trim().toLocaleLowerCase("pt-BR");

  const selectedStatus =
    content.querySelector("#orders-filter")?.value || "";
  const selectedView =
    content.querySelector("#orders-view")?.value || "active";

  const filtered = orders.filter((order) => {
    const matchesView = selectedView === "deleted"
      ? Boolean(order.deleted_at)
      : selectedView === "archived"
        ? !order.deleted_at && Boolean(order.archived_at)
        : !order.deleted_at && !order.archived_at;

    const matchesQuery =
      `${order.order_number} ${order.customer_name} ${order.customer_phone}`
        .toLocaleLowerCase("pt-BR")
        .includes(query);

    const matchesStatus =
      !selectedStatus || order.status === selectedStatus;

    return matchesView && matchesQuery && matchesStatus;
  });

  const tbody = content.querySelector("#orders-table-body");
  const count = content.querySelector("#orders-count");

  if (!tbody) return;

  count.textContent =
    `${filtered.length} pedido(s) encontrado(s)`;

  tbody.innerHTML = filtered.length
    ? filtered.map((order) => `
        <tr>
          <td><strong>#${escapeHTML(order.order_number)}</strong></td>
          <td>
            <strong>${escapeHTML(order.customer_name)}</strong>
            <span class="orders-muted">${escapeHTML(order.customer_phone)}</span>
          </td>
          <td>${formatDate(order.created_at)}</td>
          <td>${order.fulfillment === "delivery" ? "Entrega" : "Retirada"}</td>
          <td><strong>${money(order.total)}</strong></td>
          <td>
            <span class="orders-status ${escapeHTML(order.status)}">
              ${statuses[order.status] || escapeHTML(order.status)}
            </span>
          </td>
          <td class="orders-actions">
            <button type="button" data-order-details="${escapeHTML(order.id)}">
              Detalhes
            </button>
          </td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="7" class="orders-empty">
            ${query || selectedStatus
              ? "Nenhum pedido corresponde aos filtros."
              : "Nenhum pedido registrado ainda."}
          </td>
        </tr>
      `;
}

function renderPage() {
  content.innerHTML = `
    <div class="orders-admin">
      <div class="orders-heading">
        <div>
          <span class="eyebrow">OPERAÇÃO DA LOJA</span>
          <h2>Gerenciar pedidos</h2>
          <p>Acompanhe pedidos, clientes, entregas e andamento das vendas.</p>
        </div>
        <button type="button" class="orders-btn orders-btn-primary" id="refresh-orders">
          Atualizar pedidos
        </button>
      </div>

      <div class="orders-summary">
        <div class="orders-stat">
          <span>Total de pedidos</span>
          <strong id="orders-total">0</strong>
        </div>
        <div class="orders-stat">
          <span>Pendentes</span>
          <strong id="orders-pending">0</strong>
        </div>
        <div class="orders-stat">
          <span>Em andamento</span>
          <strong id="orders-progress">0</strong>
        </div>
        <div class="orders-stat">
          <span>Concluídos</span>
          <strong id="orders-completed">0</strong>
        </div>
      </div>

      <section class="orders-panel">
        <div class="orders-toolbar">
          <input
            id="orders-search"
            type="search"
            placeholder="Buscar por número, cliente ou telefone..."
          >
          <select id="orders-view" aria-label="Visualização dos pedidos">
            <option value="active">Pedidos ativos</option>
            <option value="archived">Pedidos arquivados</option>
            <option value="deleted">Pedidos excluídos</option>
          </select>
          <select id="orders-filter">
            <option value="">Todos os status</option>
            ${Object.entries(statuses).map(([value, label]) => `
              <option value="${value}">${label}</option>
            `).join("")}
          </select>
        </div>

        <div class="orders-count" id="orders-count">Carregando pedidos...</div>

        <div class="orders-table-wrap">
          <table class="orders-table">
            <thead>
              <tr>
                <th>PEDIDO</th>
                <th>CLIENTE</th>
                <th>DATA</th>
                <th>MODALIDADE</th>
                <th>TOTAL</th>
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody id="orders-table-body">
              <tr>
                <td colspan="7" class="orders-empty">Carregando...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div id="order-modal-root"></div>
    </div>
  `;

  content.querySelector("#refresh-orders")
    .addEventListener("click", loadOrders);

  content.querySelector("#orders-search")
    .addEventListener("input", render);

  content.querySelector("#orders-filter")
    .addEventListener("change", render);

  content.querySelector("#orders-view")
    .addEventListener("change", render);

  content.querySelector("#orders-table-body")
    .addEventListener("click", handleTableAction);

  content.querySelector("#order-modal-root")
    .addEventListener("click", handleModalClick);

  content.querySelector("#order-modal-root")
    .addEventListener("change", handleStatusChange);
}

function updateSummary() {
  const activeOrders = orders.filter(
    (order) => !order.deleted_at && !order.archived_at,
  );

  content.querySelector("#orders-total").textContent = activeOrders.length;

  content.querySelector("#orders-pending").textContent =
    activeOrders.filter((order) => order.status === "pending").length;

  content.querySelector("#orders-progress").textContent =
    activeOrders.filter((order) =>
      ["confirmed", "preparing", "ready", "out_for_delivery"]
        .includes(order.status)
    ).length;

  content.querySelector("#orders-completed").textContent =
    activeOrders.filter((order) => order.status === "completed").length;
}

async function loadOrders() {
  const tbody = content.querySelector("#orders-table-body");

  if (tbody) {
    tbody.innerHTML = `
      <tr><td colspan="7" class="orders-empty">Carregando pedidos...</td></tr>
    `;
  }

  try {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        fulfillment,
        subtotal,
        delivery_fee,
        discount,
        total,
        customer_name,
        customer_phone,
        delivery_address,
        notes,
        assigned_courier,
        courier_phone,
        delivery_notes,
        created_at,
        updated_at,
        archived_at,
        deleted_at,
        order_items (
          id,
          product_name,
          unit,
          quantity,
          unit_price,
          line_total
        ),
        payments (method,status,payment_channel,provider)
      `)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    orders = data || [];

    updateSummary();
    render();
  } catch (error) {
    console.error("Erro ao carregar pedidos:", error);

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="orders-empty">
            Não foi possível carregar os pedidos.
          </td>
        </tr>
      `;
    }

    notify(`Erro ao carregar pedidos: ${error.message || "verifique as permissões"}`);
  }
}

function formatAddress(address) {
  if (!address) return "Não informado";

  if (typeof address === "string") {
    return escapeHTML(address);
  }

  if (typeof address === "object") {
    return Object.values(address)
      .filter((value) => value !== null && value !== "")
      .map(escapeHTML)
      .join(", ") || "Não informado";
  }

  return "Não informado";
}

function openDetails(id) {
  const order = orders.find((item) => item.id === id);
  if (!order) return;

  const items = order.order_items || [];
  const root = content.querySelector("#order-modal-root");

  root.innerHTML = `
    <div class="order-modal-backdrop" data-modal-backdrop>
      <section class="order-modal" role="dialog" aria-modal="true"
        aria-label="Detalhes do pedido">
        <div class="order-modal-header">
          <h3>Pedido #${escapeHTML(order.order_number)}</h3>
          <button type="button" class="order-modal-close"
            data-close-modal aria-label="Fechar">×</button>
        </div>

        <div class="order-detail-grid">
          <div class="order-detail-item">
            <small>Cliente</small>
            <strong>${escapeHTML(order.customer_name)}</strong>
          </div>
          <div class="order-detail-item">
            <small>Telefone</small>
            <strong>${escapeHTML(order.customer_phone)}</strong>
          </div>
          <div class="order-detail-item">
            <small>Data do pedido</small>
            <strong>${formatDate(order.created_at)}</strong>
          </div>
          <div class="order-detail-item">
            <small>Modalidade</small>
            <strong>${order.fulfillment === "delivery" ? "Entrega" : "Retirada"}</strong>
          </div>
          <div class="order-detail-item" style="grid-column:1/-1">
            <small>Endereço</small>
            <strong>${formatAddress(order.delivery_address)}</strong>
          </div>
          <div class="order-detail-item" style="grid-column:1/-1">
            <small>Observações</small>
            <strong>${escapeHTML(order.notes || "Nenhuma observação")}</strong>
          </div>
        </div>

        <div class="order-detail-grid" style="margin-top:12px">
          <div class="order-detail-item">
            <small>Pagamento</small>
            <strong>${(() => { const p=(order.payments||[])[0]; return p ? ({pix:"Pix",card:"Cartão online",onsite_card:"Cartão na entrega",cash:"Dinheiro"}[p.method]||p.method)+` · ${{pending:"Pendente",paid:"Pago",failed:"Falhou",refunded:"Estornado"}[p.status]||p.status}` : "Não informado"; })()}</strong>
          </div>
          <div class="order-detail-item">
            <small>Entregador</small>
            <strong>${escapeHTML(order.assigned_courier || "Não atribuído")}</strong>
          </div>
        </div>
        ${order.fulfillment === "delivery" ? `
          <div class="order-status-control">
            <strong>Dados da entrega própria</strong>
            <input data-courier-name type="text" maxlength="120" placeholder="Nome do entregador" value="${escapeHTML(order.assigned_courier || "")}">
            <input data-courier-phone type="tel" maxlength="15" placeholder="Telefone do entregador" value="${escapeHTML(order.courier_phone || "")}">
            <textarea data-delivery-notes rows="2" maxlength="1000" placeholder="Instruções da entrega">${escapeHTML(order.delivery_notes || "")}</textarea>
            <button type="button" class="orders-btn orders-btn-primary" data-save-delivery="${escapeHTML(order.id)}">Salvar dados da entrega</button>
          </div>` : ""}
        ${(order.payments||[]).some(p=>p.payment_channel==="onsite"&&p.status!=="paid") ? `<button type="button" class="orders-btn orders-btn-primary" data-mark-onsite-paid="${escapeHTML(order.id)}">Confirmar cartão recebido na entrega</button>` : ""}

        <h4>Itens do pedido</h4>

        <table class="order-items">
          <tbody>
            ${items.length ? items.map((item) => `
              <tr>
                <td>
                  <strong>${escapeHTML(item.product_name)}</strong>
                  <small>${Number(item.quantity).toLocaleString("pt-BR")} ${escapeHTML(item.unit)}</small>
                </td>
                <td>${money(item.line_total)}</td>
              </tr>
            `).join("") : `
              <tr><td>Nenhum item encontrado.</td></tr>
            `}
          </tbody>
        </table>

        <div class="order-detail-grid" style="margin-top:18px">
          <div class="order-detail-item">
            <small>Subtotal</small>
            <strong>${money(order.subtotal)}</strong>
          </div>
          <div class="order-detail-item">
            <small>Taxa de entrega</small>
            <strong>${money(order.delivery_fee)}</strong>
          </div>
          <div class="order-detail-item">
            <small>Desconto</small>
            <strong>${money(order.discount)}</strong>
          </div>
          <div class="order-detail-item">
            <small>Total</small>
            <strong>${money(order.total)}</strong>
          </div>
        </div>

        <label class="order-status-control">
          <strong>Atualizar status do pedido</strong>
          <select data-status-id="${escapeHTML(order.id)}">
            ${Object.entries(statuses).map(([value, label]) => `
              <option value="${value}" ${order.status === value ? "selected" : ""}>
                ${label}
              </option>
            `).join("")}
          </select>
        </label>
      </section>
    </div>
  `;
}

function handleTableAction(event) {
  const button = event.target.closest("[data-order-details]");
  if (button) openDetails(button.dataset.orderDetails);
}

async function handleModalClick(event) {
  const saveDelivery = event.target.closest("[data-save-delivery]");
  const markPaid = event.target.closest("[data-mark-onsite-paid]");
  if (saveDelivery) {
    const root = event.currentTarget;
    const body = {
      order_id: saveDelivery.dataset.saveDelivery,
      action: "update_courier",
      courier_name: root.querySelector("[data-courier-name]")?.value || "",
      courier_phone: root.querySelector("[data-courier-phone]")?.value || "",
      delivery_notes: root.querySelector("[data-delivery-notes]")?.value || "",
      note: "Dados do entregador atualizados.",
    };
    saveDelivery.disabled = true;
    const { data, error } = await supabase.functions.invoke("manage-delivery", { body });
    if (error || data?.error) { notify(data?.error || error.message); saveDelivery.disabled = false; return; }
    const order = orders.find(item => item.id === body.order_id);
    if (order) Object.assign(order, { assigned_courier: body.courier_name, courier_phone: body.courier_phone, delivery_notes: body.delivery_notes });
    notify("Dados da entrega salvos.");
    openDetails(body.order_id);
    return;
  }
  if (markPaid) {
    markPaid.disabled = true;
    const { data, error } = await supabase.functions.invoke("manage-delivery", {
      body: { order_id: markPaid.dataset.markOnsitePaid, action: "mark_payment_received" },
    });
    if (error || data?.error) { notify(data?.error || error.message); markPaid.disabled = false; return; }
    notify("Pagamento presencial marcado como recebido.");
    await loadOrders();
    openDetails(markPaid.dataset.markOnsitePaid);
    return;
  }
  if (
    event.target.closest("[data-close-modal]") ||
    event.target.matches("[data-modal-backdrop]")
  ) {
    event.currentTarget.innerHTML = "";
  }
}

async function handleStatusChange(event) {
  const select = event.target.closest("[data-status-id]");
  if (!select) return;

  const order = orders.find((item) => item.id === select.dataset.statusId);
  const newStatus = select.value;

  if (!order || !statuses[newStatus] || order.status === newStatus) return;

  const previousStatus = order.status;
  select.disabled = true;

  try {
    const { data, error } = await supabase.functions.invoke("manage-delivery", {
      body: { order_id: order.id, status: newStatus, note: `Status alterado para ${statuses[newStatus]}.` },
    });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);

    order.status = newStatus;
    order.updated_at = new Date().toISOString();

    notify(`Pedido #${order.order_number}: ${statuses[newStatus]}.`);

    updateSummary();
    render();

    openDetails(order.id);
  } catch (error) {
    console.error("Erro ao atualizar pedido:", error);
    select.value = previousStatus;
    select.disabled = false;
    notify(`Não foi possível atualizar o pedido: ${error.message || "erro desconhecido"}`);
  }
}

export async function mountOrdersAdmin(options = {}) {
  content = options.content || document.querySelector("#page-content");
  notify = options.notify || (() => {});

  if (!supabase || !content) {
    notify("Supabase não está configurado.");
    return;
  }

  addStyles();
  renderPage();
  await loadOrders();
}
