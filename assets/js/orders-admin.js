import { supabase } from "./supabase.js";
let orders = [],
  content,
  notify;
const selectedOrderIds = new Set();
const statuses = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparação",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const money = (v) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(v || 0),
  );
const escapeHTML = (v = "") =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const formatDate = (v) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(v))
    : "—";
function hasFinancialHistory(o) {
  const p = o.payments || [];
  return (
    (o.cash_transactions || []).length > 0 ||
    p.some((x) => x.paid_at || ["paid", "refunded"].includes(x.status))
  );
}
function addStyles() {
  if (document.querySelector("#orders-admin-styles")) return;
  const s = document.createElement("style");
  s.id = "orders-admin-styles";
  s.textContent = `
.orders-admin{display:grid;gap:22px}.orders-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}.orders-heading h2{margin:0 0 6px;font-size:1.35rem}.orders-heading p{margin:0;color:var(--muted,#778078)}.orders-summary{display:flex;gap:12px;flex-wrap:wrap}.orders-stat{flex:1;min-width:150px;padding:17px;background:var(--panel,#fff);border:1px solid var(--border,#e8ece8);border-radius:12px}.orders-stat span{display:block;color:var(--muted,#778078);font-size:.82rem;margin-bottom:7px}.orders-stat strong{font-size:1.35rem}.orders-panel{padding:20px;background:var(--panel,#fff);border:1px solid var(--border,#e8ece8);border-radius:14px}.orders-toolbar{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}.orders-toolbar input,.orders-toolbar select{min-width:0;padding:11px 13px;border:1px solid var(--border,#dfe5df);border-radius:9px;background:var(--input-bg,#fff);color:inherit;font:inherit}.orders-toolbar input{flex:1;min-width:220px}.orders-btn{border:0;border-radius:9px;padding:10px 15px;font:inherit;font-weight:700;cursor:pointer}.orders-btn-primary{background:#176b43;color:white}.orders-table-wrap{overflow-x:auto}.orders-table{width:100%;min-width:760px;border-collapse:collapse}.orders-table th,.orders-table td{padding:13px 11px;text-align:left;border-bottom:1px solid var(--border,#edf0ed);font-size:.86rem}.orders-table th{color:var(--muted,#778078);font-size:.73rem;letter-spacing:.04em}.orders-table td strong{display:block}.orders-muted{display:block;margin-top:4px;color:var(--muted,#778078);font-size:.78rem}.orders-status{display:inline-flex;padding:5px 9px;border-radius:20px;font-size:.74rem;font-weight:700;white-space:nowrap}.orders-status.pending{background:#fff3d6;color:#946200}.orders-status.confirmed{background:#e7efff;color:#2455a5}.orders-status.preparing{background:#f1eaff;color:#6941a5}.orders-status.ready{background:#e1f5ed;color:#176b43}.orders-status.out_for_delivery{background:#e4f4fa;color:#17617c}.orders-status.completed{background:#e7f5ec;color:#176b43}.orders-status.cancelled{background:#fff0f0;color:#b42318}.orders-actions{display:flex;align-items:center;gap:8px;white-space:nowrap}.orders-actions button{border:0;background:transparent;color:#176b43;font:inherit;font-weight:700;cursor:pointer}.orders-actions .orders-delete-btn,.orders-actions .orders-archive-btn,.orders-actions .orders-restore-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:7px 11px;border-radius:8px;font-size:.78rem;font-weight:800;transition:background .18s ease,border-color .18s ease,transform .18s ease}.orders-actions .orders-delete-btn{border:1px solid #f2caca;background:#fff5f5;color:#b42318}.orders-actions .orders-delete-btn:hover{background:#feecec;border-color:#e9aaaa;transform:translateY(-1px)}.orders-actions .orders-archive-btn{border:1px solid #d8e4f4;background:#f3f7fd;color:#2455a5}.orders-actions .orders-archive-btn:hover{background:#e8f0fc;border-color:#b9cceb;transform:translateY(-1px)}.orders-actions .orders-restore-btn{border:1px solid #cce8d7;background:#effaf3;color:#176b43}.orders-actions .orders-restore-btn:hover{background:#e1f5e9;border-color:#a8d9bb;transform:translateY(-1px)}.orders-actions button:disabled{opacity:.55;cursor:wait;transform:none}.orders-financial-lock{display:inline-flex;align-items:center;gap:5px;padding:7px 9px;border-radius:8px;background:#f4f5f6;color:#697586;font-size:.74rem;font-weight:800}.orders-empty{padding:30px 12px!important;text-align:center!important;color:var(--muted,#778078)}.orders-count{color:var(--muted,#778078);font-size:.84rem;margin-bottom:12px}.orders-bulk-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.orders-bulk-info{color:var(--muted,#778078);font-size:.84rem}.orders-bulk-buttons{display:flex;gap:9px;flex-wrap:wrap}.orders-bulk-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 14px;border:1px solid;border-radius:9px;font:inherit;font-size:.82rem;font-weight:800;cursor:pointer;transition:background .18s ease}.orders-bulk-btn:disabled{opacity:.45;cursor:not-allowed}.orders-bulk-archive{border-color:#d8e4f4;background:#f3f7fd;color:#2455a5}.orders-bulk-archive:hover:not(:disabled){background:#e8f0fc}.orders-bulk-delete{border-color:#f2caca;background:#fff5f5;color:#b42318}.orders-bulk-delete:hover:not(:disabled){background:#feecec}.orders-select-order{width:16px;height:16px;cursor:pointer;accent-color:#2455a5;vertical-align:middle}.order-modal-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.65)}.order-modal{width:min(680px,100%);max-height:90vh;overflow:auto;padding:23px;background:var(--panel,#fff);color:var(--text,#202820);border:1px solid var(--border,#e8ece8);border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.25)}.order-modal-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}.order-modal-header h3{margin:0}.order-modal-close{border:0;background:transparent;font-size:1.5rem;cursor:pointer;color:inherit}.order-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:20px}.order-detail-item{padding:12px;border-radius:9px;background:var(--input-bg,#f5f7f5)}.order-detail-item small{display:block;color:var(--muted,#778078);margin-bottom:5px}.order-detail-item strong{overflow-wrap:anywhere}.order-modal h4{margin:20px 0 10px}.order-items{width:100%;border-collapse:collapse}.order-items td{padding:10px 5px;border-bottom:1px solid var(--border,#edf0ed);font-size:.86rem}.order-items td:last-child{text-align:right}.order-total{display:flex;justify-content:space-between;padding-top:15px;font-size:1.05rem;font-weight:800}.order-status-control{display:grid;gap:8px;margin-top:20px}.order-status-control select{width:100%;padding:12px;border:1px solid var(--border,#dfe5df);border-radius:9px;background:var(--input-bg,#fff);color:inherit;font:inherit}@media(max-width:600px){.orders-panel{padding:13px}.orders-toolbar input{min-width:100%}.order-detail-grid{grid-template-columns:1fr}.order-modal{padding:17px}.orders-bulk-buttons{width:100%}.orders-bulk-btn{flex:1}}
`;
  document.head.appendChild(s);
}
function render() {
  const q = (content.querySelector("#orders-search")?.value || "")
      .trim()
      .toLocaleLowerCase("pt-BR"),
    status = content.querySelector("#orders-filter")?.value || "",
    view = content.querySelector("#orders-view")?.value || "active";
  const filtered = orders.filter(
    (o) =>
      (view === "archived" ? Boolean(o.archived_at) : !o.archived_at) &&
      `${o.order_number} ${o.customer_name} ${o.customer_phone}`
        .toLocaleLowerCase("pt-BR")
        .includes(q) &&
      (!status || o.status === status),
  );
  const tbody = content.querySelector("#orders-table-body"),
    count = content.querySelector("#orders-count");
  if (!tbody) return;
  count.textContent = `${filtered.length} pedido(s) encontrado(s)`;
  updateBulkControls(filtered);
  tbody.innerHTML = filtered.length
    ? filtered
        .map(
          (o) =>
            `<tr><td>${view === "active" ? `<input type="checkbox" class="orders-select-order" data-select-order="${escapeHTML(o.id)}" aria-label="Selecionar pedido #${escapeHTML(o.order_number)}" ${selectedOrderIds.has(o.id) ? "checked" : ""}>` : ""}<strong>#${escapeHTML(o.order_number)}</strong></td><td><strong>${escapeHTML(o.customer_name)}</strong><span class="orders-muted">${escapeHTML(o.customer_phone)}</span></td><td>${formatDate(o.created_at)}</td><td>${o.fulfillment === "delivery" ? "Entrega" : "Retirada"}</td><td><strong>${money(o.total)}</strong></td><td><span class="orders-status ${escapeHTML(o.status)}">${statuses[o.status] || escapeHTML(o.status)}</span></td><td class="orders-actions"><button type="button" data-order-details="${escapeHTML(o.id)}">Detalhes</button>${view === "active" ? (hasFinancialHistory(o) ? `<button type="button" class="orders-archive-btn" data-order-archive="${escapeHTML(o.id)}" title="Arquivar e preservar o histórico financeiro"><i class="fa-solid fa-box-archive" aria-hidden="true"></i>Arquivar</button>` : `<button type="button" class="orders-delete-btn" data-order-delete="${escapeHTML(o.id)}" title="Excluir pedido após validação do pagamento"><i class="fa-solid fa-trash-can" aria-hidden="true"></i>Excluir</button>`) : `<button type="button" class="orders-restore-btn" data-order-restore="${escapeHTML(o.id)}" title="Restaurar pedido"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Restaurar</button>${hasFinancialHistory(o) ? `<span class="orders-financial-lock" title="Pedido protegido por histórico financeiro"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>Protegido</span>` : `<button type="button" class="orders-delete-btn" data-order-delete="${escapeHTML(o.id)}" title="Excluir definitivamente este pedido"><i class="fa-solid fa-trash-can" aria-hidden="true"></i>Excluir</button>`}`}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="orders-empty">${q || status ? "Nenhum pedido corresponde aos filtros." : "Nenhum pedido registrado ainda."}</td></tr>`;
}
function renderPage() {
  content.innerHTML = `<div class="orders-admin"><div class="orders-heading"><div><span class="eyebrow">OPERAÇÃO DA LOJA</span><h2>Gerenciar pedidos</h2><p>Acompanhe pedidos, clientes, entregas e andamento das vendas.</p></div><button type="button" class="orders-btn orders-btn-primary" id="refresh-orders">Atualizar pedidos</button></div><div class="orders-summary"><div class="orders-stat"><span>Total de pedidos</span><strong id="orders-total">0</strong></div><div class="orders-stat"><span>Pendentes</span><strong id="orders-pending">0</strong></div><div class="orders-stat"><span>Em andamento</span><strong id="orders-progress">0</strong></div><div class="orders-stat"><span>Concluídos</span><strong id="orders-completed">0</strong></div></div><section class="orders-panel"><div class="orders-toolbar"><input id="orders-search" type="search" placeholder="Buscar por número, cliente ou telefone..."><select id="orders-view" aria-label="Visualização dos pedidos"><option value="active">Pedidos ativos</option><option value="archived">Pedidos arquivados</option></select><select id="orders-filter"><option value="">Todos os status</option>${Object.entries(
    statuses,
  )
    .map(([v, l]) => `<option value="${v}">${l}</option>`)
    .join(
      "",
    )}</select></div><div class="orders-bulk-actions" id="orders-bulk-actions"><span class="orders-bulk-info" id="orders-bulk-info">Selecione os pedidos que deseja arquivar ou excluir.</span><div class="orders-bulk-buttons"><button type="button" class="orders-bulk-btn orders-bulk-archive" id="orders-bulk-archive" disabled><i class="fa-solid fa-box-archive" aria-hidden="true"></i>Arquivar selecionados</button><button type="button" class="orders-bulk-btn orders-bulk-delete" id="orders-bulk-delete" disabled><i class="fa-solid fa-trash-can" aria-hidden="true"></i>Excluir selecionados</button></div></div><div class="orders-count" id="orders-count">Carregando pedidos...</div><div class="orders-table-wrap"><table class="orders-table"><thead><tr><th><input type="checkbox" class="orders-select-order" id="orders-select-all" aria-label="Selecionar todos os pedidos visíveis"> PEDIDO</th><th>CLIENTE</th><th>DATA</th><th>MODALIDADE</th><th>TOTAL</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody id="orders-table-body"><tr><td colspan="7" class="orders-empty">Carregando...</td></tr></tbody></table></div></section><div id="order-modal-root"></div></div>`;
  content
    .querySelector("#refresh-orders")
    .addEventListener("click", loadOrders);
  content.querySelector("#orders-search").addEventListener("input", render);
  content.querySelector("#orders-filter").addEventListener("change", render);
  content.querySelector("#orders-view").addEventListener("change", () => {
    selectedOrderIds.clear();
    render();
  });
  content
    .querySelector("#orders-table-body")
    .addEventListener("click", handleTableAction);
  content
    .querySelector(".orders-table-wrap")
    .addEventListener("change", handleSelectionChange);
  content
    .querySelector("#orders-bulk-archive")
    .addEventListener("click", archiveSelectedOrders);
  content
    .querySelector("#orders-bulk-delete")
    .addEventListener("click", deleteSelectedOrders);
  content
    .querySelector("#order-modal-root")
    .addEventListener("click", handleModalClick);
  content
    .querySelector("#order-modal-root")
    .addEventListener("change", handleStatusChange);
}
function updateBulkControls(filtered = []) {
  const container = content.querySelector("#orders-bulk-actions"),
    archive = content.querySelector("#orders-bulk-archive"),
    del = content.querySelector("#orders-bulk-delete"),
    info = content.querySelector("#orders-bulk-info"),
    all = content.querySelector("#orders-select-all");
  if (!container || !archive || !del || !info) return;
  const active = content.querySelector("#orders-view")?.value === "active";
  container.hidden = !active;
  if (!active) return;
  const eligible = filtered.filter((o) => !o.archived_at),
    selected = eligible.filter((o) => selectedOrderIds.has(o.id)),
    archiveCount = selected.filter(hasFinancialHistory).length,
    deleteCount = selected.filter((o) => !hasFinancialHistory(o)).length;
  archive.disabled = archiveCount === 0;
  del.disabled = deleteCount === 0;
  info.textContent = `${selected.length} selecionado(s): ${archiveCount} para arquivar e ${deleteCount} para excluir`;
  if (all) {
    all.checked =
      eligible.length > 0 && eligible.every((o) => selectedOrderIds.has(o.id));
    all.indeterminate =
      selected.length > 0 && selected.length < eligible.length;
  }
}
function handleSelectionChange(e) {
  const t = e.target;
  if (t.id === "orders-select-all") {
    content.querySelectorAll("[data-select-order]").forEach((c) => {
      if (t.checked) selectedOrderIds.add(c.dataset.selectOrder);
      else selectedOrderIds.delete(c.dataset.selectOrder);
    });
    render();
    return;
  }
  const c = t.closest("[data-select-order]");
  if (!c) return;
  if (c.checked) selectedOrderIds.add(c.dataset.selectOrder);
  else selectedOrderIds.delete(c.dataset.selectOrder);
  render();
}
async function archiveSelectedOrders() {
  const list = orders.filter(
    (o) =>
      selectedOrderIds.has(o.id) && !o.archived_at && hasFinancialHistory(o),
  );
  if (!list.length) {
    notify(
      "Nenhum pedido com histórico financeiro foi selecionado para arquivamento.",
    );
    return;
  }
  if (
    !window.confirm(
      `Arquivar ${list.length} pedido(s) selecionado(s)?\n\nOs pedidos sairão da lista de ativos, mas continuarão salvos no banco. Pagamentos e registros financeiros serão preservados.`,
    )
  )
    return;
  setBulkBusy(true, "Arquivando...");
  let ok = 0;
  const errors = [];
  for (const o of list) {
    try {
      const { data, error } = await supabase.rpc(
        "archive_order_preserving_financial_history",
        { p_order_id: o.id },
      );
      if (error) throw error;
      if (data?.success !== true)
        throw new Error(data?.error || "O banco não confirmou o arquivamento.");
      o.archived_at = data.archived_at || new Date().toISOString();
      selectedOrderIds.delete(o.id);
      ok++;
    } catch (e) {
      console.error(`Erro ao arquivar pedido #${o.order_number}:`, e);
      errors.push(`#${o.order_number}: ${e.message || "erro desconhecido"}`);
    }
  }
  setBulkBusy(false);
  updateSummary();
  render();
  notify(
    errors.length
      ? `${ok} pedido(s) arquivado(s). ${errors.length} falha(s): ${errors.join(" | ")}`
      : `${ok} pedido(s) arquivado(s). Histórico financeiro preservado.`,
  );
}
async function deleteSelectedOrders() {
  const list = orders.filter(
    (o) =>
      selectedOrderIds.has(o.id) && !o.archived_at && !hasFinancialHistory(o),
  );
  if (!list.length) {
    notify(
      "Nenhum pedido sem histórico financeiro foi selecionado para exclusão.",
    );
    return;
  }
  if (
    !window.confirm(
      `Excluir permanentemente ${list.length} pedido(s) selecionado(s)?\n\nCada pedido será validado no Mercado Pago antes da exclusão. Pedidos com pagamento recebido ou movimentação no caixa não serão excluídos.`,
    )
  )
    return;
  setBulkBusy(true, "Excluindo...");
  let ok = 0;
  const errors = [];
  for (const o of list) {
    try {
      const { data, error } = await supabase.functions.invoke(
        "delete-order-safely",
        { body: { order_id: o.id } },
      );
      if (error) {
        let msg = data?.error;
        if (!msg && error.context?.clone) {
          try {
            msg = (await error.context.clone().json())?.error;
          } catch (_) {}
        }
        throw new Error(
          msg ||
            error.message ||
            "Não foi possível validar a cobrança no Mercado Pago.",
        );
      }
      if (data?.success !== true)
        throw new Error(data?.error || "O banco não confirmou a exclusão.");
      orders = orders.filter((x) => x.id !== o.id);
      selectedOrderIds.delete(o.id);
      ok++;
    } catch (e) {
      console.error(`Erro ao excluir pedido #${o.order_number}:`, e);
      errors.push(`#${o.order_number}: ${e.message || "erro desconhecido"}`);
    }
  }
  setBulkBusy(false);
  updateSummary();
  render();
  notify(
    errors.length
      ? `${ok} pedido(s) excluído(s). ${errors.length} falha(s): ${errors.join(" | ")}`
      : `${ok} pedido(s) excluído(s) permanentemente.`,
  );
}
function setBulkBusy(busy, label = "") {
  const a = content.querySelector("#orders-bulk-archive"),
    d = content.querySelector("#orders-bulk-delete");
  if (a) {
    a.disabled = busy || a.disabled;
    a.innerHTML =
      busy && label === "Arquivando..."
        ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Arquivando...'
        : '<i class="fa-solid fa-box-archive" aria-hidden="true"></i>Arquivar selecionados';
  }
  if (d) {
    d.disabled = busy || d.disabled;
    d.innerHTML =
      busy && label === "Excluindo..."
        ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Excluindo...'
        : '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>Excluir selecionados';
  }
  content
    .querySelectorAll(".orders-select-order")
    .forEach((c) => (c.disabled = busy));
}
function updateSummary() {
  const a = orders.filter((o) => !o.deleted_at && !o.archived_at);
  content.querySelector("#orders-total").textContent = a.length;
  content.querySelector("#orders-pending").textContent = a.filter(
    (o) => o.status === "pending",
  ).length;
  content.querySelector("#orders-progress").textContent = a.filter((o) =>
    ["confirmed", "preparing", "ready", "out_for_delivery"].includes(o.status),
  ).length;
  content.querySelector("#orders-completed").textContent = a.filter(
    (o) => o.status === "completed",
  ).length;
}
async function loadOrders() {
  const tbody = content.querySelector("#orders-table-body");
  if (tbody)
    tbody.innerHTML =
      '<tr><td colspan="7" class="orders-empty">Carregando pedidos...</td></tr>';
  try {
    const { data, error } = await supabase
      .from("orders")
      .select(
        `id,order_number,status,fulfillment,subtotal,delivery_fee,discount,total,customer_name,customer_phone,delivery_address,notes,assigned_courier,courier_phone,delivery_notes,created_at,updated_at,archived_at,order_items(id,product_name,unit,quantity,unit_price,line_total),payments(method,status,payment_channel,provider,paid_at),cash_transactions(id)`,
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    orders = data || [];
    const valid = new Set(orders.map((o) => o.id));
    selectedOrderIds.forEach((id) => {
      if (!valid.has(id)) selectedOrderIds.delete(id);
    });
    updateSummary();
    render();
  } catch (e) {
    console.error("Erro ao carregar pedidos:", e);
    if (tbody)
      tbody.innerHTML =
        '<tr><td colspan="7" class="orders-empty">Não foi possível carregar os pedidos.</td></tr>';
    notify(
      `Erro ao carregar pedidos: ${e.message || "verifique as permissões"}`,
    );
  }
}
function formatAddress(a) {
  if (!a) return "Não informado";
  if (typeof a === "string") return escapeHTML(a);
  if (typeof a === "object")
    return (
      Object.values(a)
        .filter((v) => v !== null && v !== "")
        .map(escapeHTML)
        .join(", ") || "Não informado"
    );
  return "Não informado";
}
function openDetails(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  const items = o.order_items || [],
    root = content.querySelector("#order-modal-root");
  root.innerHTML = `<div class="order-modal-backdrop" data-modal-backdrop><section class="order-modal" role="dialog" aria-modal="true" aria-label="Detalhes do pedido"><div class="order-modal-header"><h3>Pedido #${escapeHTML(o.order_number)}</h3><button type="button" class="order-modal-close" data-close-modal aria-label="Fechar">×</button></div><div class="order-detail-grid"><div class="order-detail-item"><small>Cliente</small><strong>${escapeHTML(o.customer_name)}</strong></div><div class="order-detail-item"><small>Telefone</small><strong>${escapeHTML(o.customer_phone)}</strong></div><div class="order-detail-item"><small>Data do pedido</small><strong>${formatDate(o.created_at)}</strong></div><div class="order-detail-item"><small>Modalidade</small><strong>${o.fulfillment === "delivery" ? "Entrega" : "Retirada"}</strong></div><div class="order-detail-item" style="grid-column:1/-1"><small>Endereço</small><strong>${formatAddress(o.delivery_address)}</strong></div><div class="order-detail-item" style="grid-column:1/-1"><small>Observações</small><strong>${escapeHTML(o.notes || "Nenhuma observação")}</strong></div></div><div class="order-detail-grid" style="margin-top:12px"><div class="order-detail-item"><small>Pagamento</small><strong>${(() => {
    const p = (o.payments || [])[0];
    return p
      ? ({
          pix: "Pix",
          card: "Cartão online",
          onsite_card: "Cartão na entrega",
          cash: "Dinheiro",
        }[p.method] || p.method) +
          ` · ${{ pending: "Pendente", paid: "Pago", failed: "Falhou", refunded: "Estornado" }[p.status] || p.status}`
      : "Não informado";
  })()}</strong></div><div class="order-detail-item"><small>Entregador</small><strong>${escapeHTML(o.assigned_courier || "Não atribuído")}</strong></div></div>${o.fulfillment === "delivery" ? `<div class="order-status-control"><strong>Dados da entrega própria</strong><input data-courier-name type="text" maxlength="120" placeholder="Nome do entregador" value="${escapeHTML(o.assigned_courier || "")}"><input data-courier-phone type="tel" maxlength="15" placeholder="Telefone do entregador" value="${escapeHTML(o.courier_phone || "")}"><textarea data-delivery-notes rows="2" maxlength="1000" placeholder="Instruções da entrega">${escapeHTML(o.delivery_notes || "")}</textarea><button type="button" class="orders-btn orders-btn-primary" data-save-delivery="${escapeHTML(o.id)}">Salvar dados da entrega</button></div>` : ""}${(o.payments || []).some((p) => p.payment_channel === "onsite" && p.status !== "paid") ? `<button type="button" class="orders-btn orders-btn-primary" data-mark-onsite-paid="${escapeHTML(o.id)}">Confirmar cartão recebido na entrega</button>` : ""}<h4>Itens do pedido</h4><table class="order-items"><tbody>${items.length ? items.map((i) => `<tr><td><strong>${escapeHTML(i.product_name)}</strong><small>${Number(i.quantity).toLocaleString("pt-BR")} ${escapeHTML(i.unit)}</small></td><td>${money(i.line_total)}</td></tr>`).join("") : "<tr><td>Nenhum item encontrado.</td></tr>"}</tbody></table><div class="order-detail-grid" style="margin-top:18px"><div class="order-detail-item"><small>Subtotal</small><strong>${money(o.subtotal)}</strong></div><div class="order-detail-item"><small>Taxa de entrega</small><strong>${money(o.delivery_fee)}</strong></div><div class="order-detail-item"><small>Desconto</small><strong>${money(o.discount)}</strong></div><div class="order-detail-item"><small>Total</small><strong>${money(o.total)}</strong></div></div><label class="order-status-control"><strong>Atualizar status do pedido</strong><select data-status-id="${escapeHTML(o.id)}">${Object.entries(
    statuses,
  )
    .map(
      ([v, l]) =>
        `<option value="${v}" ${o.status === v ? "selected" : ""}>${l}</option>`,
    )
    .join("")}</select></label></section></div>`;
}
async function handleTableAction(e) {
  const ab = e.target.closest("[data-order-archive]");
  if (ab) {
    const o = orders.find((x) => x.id === ab.dataset.orderArchive);
    if (!o) return;
    if (
      !window.confirm(
        `Arquivar o pedido #${o.order_number}?\n\nO pedido sairá da lista de ativos, mas continuará salvo no banco com todos os pagamentos e registros financeiros.`,
      )
    )
      return;
    ab.disabled = true;
    ab.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Arquivando...';
    try {
      const { data, error } = await supabase.rpc(
        "archive_order_preserving_financial_history",
        { p_order_id: o.id },
      );
      if (error) throw error;
      if (data?.success !== true)
        throw new Error(data?.error || "O banco não confirmou o arquivamento.");
      o.archived_at = data.archived_at || new Date().toISOString();
      selectedOrderIds.delete(o.id);
      updateSummary();
      render();
      notify(
        `Pedido #${o.order_number} arquivado. Histórico financeiro preservado.`,
      );
    } catch (err) {
      console.error("Erro ao arquivar pedido:", err);
      ab.disabled = false;
      ab.innerHTML =
        '<i class="fa-solid fa-box-archive" aria-hidden="true"></i>Arquivar';
      notify(err.message || "Não foi possível arquivar o pedido.");
    }
    return;
  }
  const rb = e.target.closest("[data-order-restore]");
  if (rb) {
    const o = orders.find((x) => x.id === rb.dataset.orderRestore);
    if (!o) return;
    if (
      !window.confirm(
        `Restaurar o pedido #${o.order_number}?\n\nEle voltará para a lista de pedidos ativos. O histórico financeiro será mantido.`,
      )
    )
      return;
    rb.disabled = true;
    rb.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Restaurando...';
    try {
      const { data, error } = await supabase.rpc("restore_archived_order", {
        p_order_id: o.id,
      });
      if (error) throw error;
      if (data?.success !== true)
        throw new Error(data?.error || "O banco não confirmou a restauração.");
      o.archived_at = null;
      updateSummary();
      render();
      notify(`Pedido #${o.order_number} restaurado para os pedidos ativos.`);
    } catch (err) {
      console.error("Erro ao restaurar pedido:", err);
      rb.disabled = false;
      rb.innerHTML =
        '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Restaurar';
      notify(err.message || "Não foi possível restaurar o pedido.");
    }
    return;
  }
  const db = e.target.closest("[data-order-delete]");
  if (db) {
    const o = orders.find((x) => x.id === db.dataset.orderDelete);
    if (!o) return;
    if (
      !window.confirm(
        `Excluir permanentemente o pedido #${o.order_number}?\n\nA cobrança online será verificada e, se ainda estiver aberta, será expirada. Pedidos com pagamento recebido ou movimentação no caixa não podem ser excluídos.`,
      )
    )
      return;
    db.disabled = true;
    db.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>Excluindo...';
    try {
      const { data, error } = await supabase.functions.invoke(
        "delete-order-safely",
        { body: { order_id: o.id } },
      );
      if (error) {
        let msg = data?.error;
        if (!msg && error.context?.clone) {
          try {
            msg = (await error.context.clone().json())?.error;
          } catch (_) {}
        }
        throw new Error(
          msg ||
            error.message ||
            "Não foi possível validar a cobrança no Mercado Pago.",
        );
      }
      if (data?.success !== true)
        throw new Error(data?.error || "O banco não confirmou a exclusão.");
      orders = orders.filter((x) => x.id !== o.id);
      selectedOrderIds.delete(o.id);
      updateSummary();
      render();
      notify(`Pedido #${o.order_number} excluído permanentemente.`);
    } catch (err) {
      console.error("Erro ao excluir pedido:", err);
      db.disabled = false;
      db.innerHTML =
        '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>Excluir';
      notify(err.message || "Não foi possível excluir o pedido.");
    }
    return;
  }
  const detail = e.target.closest("[data-order-details]");
  if (detail) openDetails(detail.dataset.orderDetails);
}
async function handleModalClick(e) {
  const save = e.target.closest("[data-save-delivery]"),
    paid = e.target.closest("[data-mark-onsite-paid]");
  if (save) {
    const root = e.currentTarget,
      body = {
        order_id: save.dataset.saveDelivery,
        action: "update_courier",
        courier_name: root.querySelector("[data-courier-name]")?.value || "",
        courier_phone: root.querySelector("[data-courier-phone]")?.value || "",
        delivery_notes:
          root.querySelector("[data-delivery-notes]")?.value || "",
        note: "Dados do entregador atualizados.",
      };
    save.disabled = true;
    const { data, error } = await supabase.functions.invoke("manage-delivery", {
      body,
    });
    if (error || data?.error) {
      notify(data?.error || error.message);
      save.disabled = false;
      return;
    }
    const o = orders.find((x) => x.id === body.order_id);
    if (o)
      Object.assign(o, {
        assigned_courier: body.courier_name,
        courier_phone: body.courier_phone,
        delivery_notes: body.delivery_notes,
      });
    notify("Dados da entrega salvos.");
    openDetails(body.order_id);
    return;
  }
  if (paid) {
    paid.disabled = true;
    const id = paid.dataset.markOnsitePaid,
      { data, error } = await supabase.functions.invoke("manage-delivery", {
        body: { order_id: id, action: "mark_payment_received" },
      });
    if (error || data?.error) {
      notify(data?.error || error.message);
      paid.disabled = false;
      return;
    }
    notify("Pagamento presencial marcado como recebido.");
    await loadOrders();
    openDetails(id);
    return;
  }
  if (
    e.target.closest("[data-close-modal]") ||
    e.target.matches("[data-modal-backdrop]")
  )
    e.currentTarget.innerHTML = "";
}
async function getEdgeFunctionErrorMessage(error, data) {
  if (data?.error) return data.error;
  const r = error?.context;
  if (r && typeof r.clone === "function") {
    try {
      const p = await r.clone().json();
      if (p?.error) return p.error;
      if (p?.message) return p.message;
    } catch {}
  }
  return error?.message || "Erro desconhecido ao atualizar o pedido.";
}
async function handleStatusChange(e) {
  const s = e.target.closest("[data-status-id]");
  if (!s) return;
  const o = orders.find((x) => x.id === s.dataset.statusId),
    next = s.value;
  if (!o || !statuses[next] || o.status === next) return;
  const previous = o.status;
  s.disabled = true;
  try {
    const { data, error } = await supabase.functions.invoke("manage-delivery", {
      body: {
        order_id: o.id,
        status: next,
        note: `Status alterado para ${statuses[next]}.`,
      },
    });
    if (error) throw new Error(await getEdgeFunctionErrorMessage(error, data));
    if (data?.error) throw new Error(data.error);
    o.status = next;
    o.updated_at = new Date().toISOString();
    notify(`Pedido #${o.order_number}: ${statuses[next]}.`);
    updateSummary();
    render();
    openDetails(o.id);
  } catch (err) {
    console.error("Erro ao atualizar pedido:", err);
    s.value = previous;
    s.disabled = false;
    notify(
      `Não foi possível atualizar o pedido: ${err.message || "erro desconhecido"}`,
    );
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
