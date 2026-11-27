import { supabase } from "./supabase.js";
let activeCameraStop = null;
const money = (value) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value || 0)),
  esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    ),
  dateBR = (value) => {
    if (!value) return "—";
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString("pt-BR");
  },
  statusLabels = {
    pending: "Pendente",
    paid: "Pago",
    processing: "Em processamento",
    ready: "Pronto",
    shipped: "Enviado",
    delivered: "Entregue",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    draft: "Rascunho",
    ordered: "Pedido realizado",
    partially_received: "Recebido parcialmente",
    received: "Recebido",
  },
  purchaseStatusLabels = {
    draft: "Rascunho",
    received: "Recebido",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    pending: "Pendente",
    ordered: "Pedido realizado",
    partially_received: "Recebido parcialmente",
  };
function styles() {
  const style = document.createElement("style");
  style.dataset.operationsStyles = "true";
  style.textContent = `.ops-shell{display:grid;gap:20px}.ops-panel{background:#fff;border:1px solid #e7ece8;border-radius:18px;padding:22px;box-shadow:0 8px 24px rgba(28,52,38,.05)}.ops-panel h3{margin:0 0 16px;font-size:17px;color:#20352b}.ops-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ops-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.ops-field{display:grid;gap:7px;color:#506057;font-size:12px;font-weight:700}.ops-field input,.ops-field select,.ops-field textarea{width:100%;box-sizing:border-box;border:1px solid #dce5df;border-radius:11px;background:#fbfdfb;color:#20352b;padding:11px 12px;font:inherit;outline:none;transition:.2s}.ops-field input:focus,.ops-field select:focus,.ops-field textarea:focus{border-color:#8eb7a0;box-shadow:0 0 0 3px rgba(86,145,110,.1);background:#fff}.ops-field textarea{min-height:90px;resize:vertical}.ops-actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}.ops-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid #dce5df;border-radius:10px;background:#fff;color:#31533f;font:inherit;font-size:12px;font-weight:800;cursor:pointer;transition:.2s ease}.ops-btn:hover{transform:translateY(-1px);box-shadow:0 7px 16px rgba(30,70,45,.09)}.ops-btn.primary{background:#315f46;border-color:#315f46;color:#fff}.ops-btn.primary:hover{background:#264b37;border-color:#264b37}.ops-btn.danger{background:#fff8f8;border-color:#ead7d7;color:#b45151}.ops-btn.danger:hover{background:#b45151;border-color:#b45151;color:#fff}.ops-btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}.ops-muted{margin:6px 0 0;color:#7a8780;font-size:11px;line-height:1.6}.ops-table-wrap{overflow:auto}.ops-table{width:100%;border-collapse:collapse;min-width:760px}.ops-table th{padding:11px 10px;text-align:left;font-size:10px;letter-spacing:.05em;color:#7a8780;border-bottom:1px solid #e7ece8}.ops-table td{padding:13px 10px;border-bottom:1px solid #edf1ed;color:#34483d;font-size:12px;vertical-align:middle}.ops-table tr:last-child td{border-bottom:0}.ops-section-heading{display:flex;justify-content:space-between;align-items:center;gap:18px;margin:0 0 16px}.ops-section-heading h3{margin:0}.ops-section-heading p{margin:5px 0 0}.ops-clear-history{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid #ead7d7;border-radius:10px;background:#fff8f8;color:#b45151;font:inherit;font-size:11px;font-weight:800;cursor:pointer;transition:.2s ease}.ops-clear-history:hover{background:#b45151;border-color:#b45151;color:#fff;transform:translateY(-1px);box-shadow:0 8px 18px rgba(180,81,81,.16)}.ops-clear-history:disabled{opacity:.6;cursor:not-allowed;transform:none}.ops-items{margin-top:12px}.ops-camera{position:relative;overflow:hidden;border-radius:18px;background:#dcebed;border:1px solid #d6e4e2;min-height:270px;display:grid;place-items:center}.ops-camera video{width:100%;height:100%;max-height:420px;object-fit:cover;display:block}.ops-camera-empty{padding:30px;text-align:center;color:#60746b;font-size:13px}.ops-badge{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;background:#eef5ef;color:#315f46;font-size:10px;font-weight:800}.ops-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.ops-stat{padding:15px;border:1px solid #e7ece8;border-radius:14px;background:#fbfdfb}.ops-stat strong{display:block;margin-top:5px;font-size:19px;color:#21392b}.ops-kanban{display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:14px;overflow:auto}.ops-column{background:#f8faf8;border:1px solid #e7ece8;border-radius:15px;padding:12px}.ops-column h4{margin:0 0 10px;font-size:12px;color:#385446}.ops-card{padding:12px;margin-bottom:8px;border:1px solid #e4ebe6;border-radius:12px;background:#fff}.ops-card:last-child{margin-bottom:0}.ops-labels{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}.ops-label{padding:16px;border:1px dashed #cbd9d0;border-radius:12px;background:#fbfdfb}.ops-barcode{font-family:monospace;letter-spacing:2px;font-size:20px;text-align:center;padding:10px}.ops-empty{padding:28px;text-align:center;color:#7a8780}@media(max-width:900px){.ops-grid,.ops-grid-3,.ops-stat-grid{grid-template-columns:1fr 1fr}.ops-kanban{grid-template-columns:repeat(4,280px)}}@media(max-width:640px){.ops-grid,.ops-grid-3,.ops-stat-grid{grid-template-columns:1fr}.ops-panel{padding:16px}.ops-section-heading{align-items:flex-start;flex-direction:column}.ops-clear-history{width:100%}}`;
  document.head.appendChild(style);
}
export function mountOperationsAdmin({ content, notify = () => {} }) {
  styles();
  let view = content;
  view.innerHTML = `<div class="ops-shell"><div class="ops-panel"><h2 style="margin:0;color:#20352b">Operações Avançadas</h2><p class="ops-muted">Compras, estoque, lotes, pedidos, códigos, fidelidade e etiquetas.</p></div><div id="ops-content"></div></div>`;
  view = view.querySelector("#ops-content");
  let currentTab = "purchases";
  const tabs = [
    ["purchases", "Compras", "fa-cart-shopping"],
    ["lots", "Lotes", "fa-boxes-stacked"],
    ["kanban", "Pedidos", "fa-table-columns"],
    ["barcode", "Código de barras", "fa-barcode"],
    ["labels", "Etiquetas", "fa-tags"],
    ["loyalty", "Fidelidade", "fa-star"],
  ];
  function tabsHTML() {
    return `<div class="ops-panel" style="padding:10px"><div class="ops-actions">${tabs.map(([id, label, icon]) => `<button type="button" class="ops-btn ${currentTab === id ? "primary" : ""}" data-ops-tab="${id}"><i class="fa-solid ${icon}"></i>${label}</button>`).join("")}</div></div>`;
  }
  async function renderPurchases() {
    const { data: orders, error } = await supabase
      .from("purchase_orders")
      .select(
        `id,status,expected_at,subtotal,created_at,suppliers(name),purchase_order_items(id,product_id,quantity,received_quantity,unit_cost,expiry_date,lot_code,products(name))`,
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const { data: suppliers, error: supplierError } = await supabase
      .from("suppliers")
      .select("id,name")
      .order("name");
    if (supplierError) throw supplierError;
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id,name")
      .order("name");
    if (productError) throw productError;
    view.innerHTML = `${tabsHTML()}<div class="ops-panel"><h3>Novo pedido de compra</h3><form id="ops-purchase-form"><div class="ops-grid"><label class="ops-field">Fornecedor<select name="supplier_id" id="ops-purchase-supplier" required><option value="">Selecione...</option>${(suppliers || []).map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join("")}</select></label><label class="ops-field">Previsão de entrega<input name="expected_at" type="date"></label></div><label class="ops-field" style="margin-top:14px">Observações<textarea name="notes" placeholder="Observações do pedido"></textarea></label><div class="ops-grid" style="margin-top:14px"><label class="ops-field">Produto<select id="ops-purchase-product"><option value="">Selecione...</option>${(products || []).map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join("")}</select></label><label class="ops-field">Quantidade<input id="ops-purchase-qty" type="number" min="0.001" step="0.001" value="1"></label></div><div class="ops-grid" style="margin-top:14px"><label class="ops-field">Custo unitário (R$)<input id="ops-purchase-cost" type="number" min="0.01" step="0.01" inputmode="decimal" value="" placeholder="0,00" required></label><label class="ops-field">Validade (opcional)<input id="ops-purchase-expiry" type="date"></label></div><label class="ops-field" style="margin-top:14px">Código do lote<input id="ops-purchase-lot" type="text" placeholder="Ex.: LOTE-001"></label><div class="ops-actions" style="margin-top:14px"><button type="button" class="ops-btn" id="ops-add-purchase-item"><i class="fa-solid fa-plus"></i>Adicionar item</button></div><div id="ops-purchase-items" class="ops-items"></div><div class="ops-actions" style="margin-top:18px"><button type="submit" class="ops-btn primary"><i class="fa-solid fa-floppy-disk"></i>Salvar pedido de compra</button></div></form></div><div class="ops-panel"><div class="ops-section-heading"><div><h3>Pedidos de compra recentes</h3><p class="ops-muted">Histórico dos pedidos de compra realizados.</p></div><button type="button" class="ops-clear-history" id="ops-clear-purchases"><i class="fa-solid fa-trash-can"></i>Limpar histórico</button></div><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>FORNECEDOR</th><th>DATA</th><th>STATUS</th><th>ITENS</th><th>VALOR</th><th>AÇÃO</th></tr></thead><tbody>${(orders || []).map((order) => `<tr><td>${esc(order.suppliers?.name || "Fornecedor")}</td><td>${dateBR(order.expected_at)}</td><td><span class="ops-badge">${esc(purchaseStatusLabels[order.status] || order.status)}</span></td><td>${(order.purchase_order_items || []).length}</td><td>${money(order.subtotal)}</td><td>${order.status === "received" ? "Recebido" : `<button class="ops-btn primary" data-receive-purchase="${order.id}"><i class="fa-solid fa-box-open"></i>Receber e atualizar estoque</button>`}</td></tr>`).join("") || `<tr><td colspan="6"><div class="ops-empty">Nenhum pedido de compra cadastrado.</div></td></tr>`}</tbody></table></div><p class="ops-muted">O recebimento é atômico: atualiza estoque, custo e lote de validade em uma única transação.</p></div>`;
    view.querySelectorAll("[data-ops-tab]").forEach((button) =>
      button.addEventListener("click", async () => {
        currentTab = button.dataset.opsTab;
        await render();
      }),
    );
    view
      .querySelector("#ops-clear-purchases")
      ?.addEventListener("click", async () => {
        const confirmed = confirm(
          "Tem certeza que deseja limpar o histórico de pedidos de compra?\\n\\nEssa ação removerá os pedidos registrados.",
        );
        if (!confirmed) return;
        const button = view.querySelector("#ops-clear-purchases");
        try {
          button.disabled = true;
          button.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Limpando...';
          const { data: ordersToDelete, error: loadError } = await supabase
            .from("purchase_orders")
            .select("id");
          if (loadError) throw loadError;
          if (!ordersToDelete?.length) {
            notify("O histórico já está vazio.");
            return;
          }
          const ids = ordersToDelete.map((item) => item.id);
          const { error: itemError } = await supabase
            .from("purchase_order_items")
            .delete()
            .in("purchase_order_id", ids);
          if (itemError) throw itemError;
          const { error: orderError } = await supabase
            .from("purchase_orders")
            .delete()
            .in("id", ids);
          if (orderError) throw orderError;
          notify("Histórico de pedidos de compra limpo com sucesso.");
          await renderPurchases();
        } catch (error) {
          console.error("Erro ao limpar histórico:", error);
          notify(error?.message || "Não foi possível limpar o histórico.");
        } finally {
          const button = view.querySelector("#ops-clear-purchases");
          if (button) {
            button.disabled = false;
            button.innerHTML =
              '<i class="fa-solid fa-trash-can"></i> Limpar histórico';
          }
        }
      });
    const items = [];
    const productSelect = view.querySelector("#ops-purchase-product"),
      qtyInput = view.querySelector("#ops-purchase-qty"),
      costInput = view.querySelector("#ops-purchase-cost"),
      expiryInput = view.querySelector("#ops-purchase-expiry"),
      lotInput = view.querySelector("#ops-purchase-lot"),
      addButton = view.querySelector("#ops-add-purchase-item"),
      itemsRoot = view.querySelector("#ops-purchase-items"),
      purchaseForm = view.querySelector("#ops-purchase-form");
    addButton.addEventListener("click", () => {
      const product = products.find((item) => item.id === productSelect.value),
        qty = Number(String(qtyInput.value || "").replace(",", ".")),
        cost = Number(String(costInput.value || "").replace(",", "."));
      if (!product) {
        notify("Selecione um produto.");
        productSelect.focus();
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        notify("Informe uma quantidade válida.");
        qtyInput.focus();
        return;
      }
      if (!Number.isFinite(cost) || cost <= 0) {
        notify("Informe um custo unitário maior que R$ 0,00.");
        costInput.focus();
        return;
      }
      items.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_cost: cost,
        expiry_date: expiryInput.value || null,
        lot_code: lotInput.value.trim() || null,
      });
      itemsRoot.innerHTML = items
        .map(
          (item, index) =>
            `<div style="padding:8px 0;border-bottom:1px solid #edf1ed;display:flex;justify-content:space-between;align-items:center;gap:10px">${esc(item.product_name)}: <strong>${item.quantity}</strong> × <strong>${money(item.unit_cost)}</strong>${item.lot_code ? ` · Lote ${esc(item.lot_code)}` : ""}${item.expiry_date ? ` · Validade ${dateBR(item.expiry_date)}` : ""}<button type="button" class="ops-btn danger" data-remove-purchase-item="${index}" style="min-height:32px;padding:0 9px"><i class="fa-solid fa-trash"></i></button></div>`,
        )
        .join("");
      view.querySelectorAll("[data-remove-purchase-item]").forEach((button) =>
        button.addEventListener("click", () => {
          items.splice(Number(button.dataset.removePurchaseItem), 1);
          itemsRoot.innerHTML = items
            .map(
              (item, index) =>
                `<div style="padding:8px 0;border-bottom:1px solid #edf1ed;display:flex;justify-content:space-between;align-items:center;gap:10px">${esc(item.product_name)}: <strong>${item.quantity}</strong> × <strong>${money(item.unit_cost)}</strong>${item.lot_code ? ` · Lote ${esc(item.lot_code)}` : ""}${item.expiry_date ? ` · Validade ${dateBR(item.expiry_date)}` : ""}<button type="button" class="ops-btn danger" data-remove-purchase-item="${index}" style="min-height:32px;padding:0 9px"><i class="fa-solid fa-trash"></i></button></div>`,
            )
            .join("");
        }),
      );
      costInput.value = "";
      lotInput.value = "";
      expiryInput.value = "";
      notify("Item adicionado ao pedido.");
    });
    purchaseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const form = new FormData(event.currentTarget),
          supplierId = String(form.get("supplier_id") || "").trim();
        if (!supplierId) {
          notify("Selecione um fornecedor.");
          return;
        }
        if (!items.length) {
          notify("Adicione ao menos um item ao pedido.");
          return;
        }
        const invalidItem = items.find(
          (item) =>
            !item.product_id ||
            !Number.isFinite(item.quantity) ||
            item.quantity <= 0 ||
            !Number.isFinite(item.unit_cost) ||
            item.unit_cost <= 0,
        );
        if (invalidItem) {
          notify("Existe um item com quantidade ou custo inválido.");
          return;
        }
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        const createdBy = userData?.user?.id || null,
          total = items.reduce(
            (sum, item) =>
              sum +
              (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
            0,
          );
        const { data: purchaseOrder, error: purchaseOrderError } =
          await supabase
            .from("purchase_orders")
            .insert({
              supplier_id: supplierId,
              expected_at: form.get("expected_at") || null,
              notes: String(form.get("notes") || "").trim() || null,
              created_by: createdBy,
              subtotal: total,
              status: "draft",
            })
            .select("id")
            .single();
        if (purchaseOrderError) {
          console.error("Erro ao criar pedido de compra:", purchaseOrderError);
          notify(
            `Não foi possível salvar o pedido: ${purchaseOrderError.message}`,
          );
          return;
        }
        const purchaseItems = items.map((item) => ({
          purchase_order_id: purchaseOrder.id,
          product_id: item.product_id,
          quantity: item.quantity,
          received_quantity: 0,
          unit_cost: item.unit_cost,
          expiry_date: item.expiry_date || null,
          lot_code: item.lot_code || null,
        }));
        const { error: itemError } = await supabase
          .from("purchase_order_items")
          .insert(purchaseItems);
        if (itemError) {
          console.error("Erro ao salvar itens da compra:", itemError);
          await supabase
            .from("purchase_orders")
            .delete()
            .eq("id", purchaseOrder.id);
          notify(`Não foi possível salvar os itens: ${itemError.message}`);
          return;
        }
        notify("Pedido de compra salvo com sucesso.");
        await renderPurchases();
      } catch (error) {
        console.error("Erro inesperado ao salvar compra:", error);
        notify(error?.message || "Não foi possível salvar o pedido de compra.");
      }
    });
    view.querySelectorAll("[data-receive-purchase]").forEach((button) =>
      button.addEventListener("click", async () => {
        if (
          !confirm(
            "Confirmar recebimento integral? O estoque será atualizado e os lotes serão registrados.",
          )
        )
          return;
        button.disabled = true;
        try {
          const { data, error } = await supabase.rpc("receive_purchase_order", {
            p_purchase_order_id: button.dataset.receivePurchase,
          });
          if (error) throw error;
          if (!data?.success)
            throw new Error("O banco não confirmou o recebimento.");
          notify("Compra recebida e estoque atualizado.");
          await renderPurchases();
        } catch (error) {
          console.error(error);
          notify(`Não foi possível receber a compra: ${error.message}`);
          button.disabled = false;
        }
      }),
    );
  }
  async function renderLots() {
    const { data: lots, error } = await supabase
      .from("inventory_lots")
      .select("id,lot_code,expiry_date,quantity,unit_cost,products(name)")
      .order("expiry_date", { ascending: true })
      .limit(200);
    if (error) throw error;
    view.innerHTML = `${tabsHTML()}<div class="ops-panel"><h3>Lotes e validade</h3><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>PRODUTO</th><th>LOTE</th><th>VALIDADE</th><th>QUANTIDADE</th><th>CUSTO</th></tr></thead><tbody>${(lots || []).map((lot) => `<tr><td>${esc(lot.products?.name || "Produto")}</td><td>${esc(lot.lot_code || "—")}</td><td>${dateBR(lot.expiry_date)}</td><td>${Number(lot.quantity || 0)}</td><td>${money(lot.unit_cost)}</td></tr>`).join("") || `<tr><td colspan="5"><div class="ops-empty">Nenhum lote cadastrado.</div></td></tr>`}</tbody></table></div></div>`;
    view.querySelectorAll("[data-ops-tab]").forEach((button) =>
      button.addEventListener("click", async () => {
        currentTab = button.dataset.opsTab;
        await render();
      }),
    );
  }
  async function renderKanban() {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("id,status,total,created_at,customer_name")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const groups = {
      pending: [],
      paid: [],
      processing: [],
      ready: [],
      shipped: [],
      delivered: [],
      cancelled: [],
    };
    (orders || []).forEach((order) =>
      (groups[order.status] || groups.pending).push(order),
    );
    const columns = [
      ["pending", "Pendentes"],
      ["paid", "Pagos"],
      ["processing", "Em processamento"],
      ["ready", "Prontos"],
      ["shipped", "Enviados"],
      ["delivered", "Entregues"],
      ["cancelled", "Cancelados"],
    ];
    view.innerHTML = `${tabsHTML()}<div class="ops-panel"><h3>Kanban de pedidos</h3><div class="ops-kanban">${columns.map(([status, label]) => `<div class="ops-column"><h4>${label} <span class="ops-badge">${groups[status].length}</span></h4>${groups[status].map((order) => `<div class="ops-card"><strong>#${esc(order.id).slice(0, 8)}</strong><div class="ops-muted">${esc(order.customer_name || "Cliente")}</div><div style="margin-top:7px;font-weight:800">${money(order.total)}</div></div>`).join("") || `<div class="ops-muted">Nenhum pedido.</div>`}</div>`).join("")}</div></div>`;
    view.querySelectorAll("[data-ops-tab]").forEach((button) =>
      button.addEventListener("click", async () => {
        currentTab = button.dataset.opsTab;
        await render();
      }),
    );
  }
  async function renderBarcode() {
    view.innerHTML = `${tabsHTML()}<div class="ops-panel"><h3>Leitor de código de barras</h3><p class="ops-muted">Use a câmera do dispositivo para leitura de códigos.</p><div class="ops-camera" id="ops-camera"><div class="ops-camera-empty"><i class="fa-solid fa-camera" style="font-size:32px"></i><div style="margin-top:10px">A câmera ficará disponível aqui.</div></div></div><div class="ops-actions" style="margin-top:14px"><button class="ops-btn primary" id="ops-start-camera"><i class="fa-solid fa-camera"></i>Iniciar câmera</button><button class="ops-btn" id="ops-stop-camera"><i class="fa-solid fa-stop"></i>Parar câmera</button></div></div>`;
    view.querySelectorAll("[data-ops-tab]").forEach((button) =>
      button.addEventListener("click", async () => {
        currentTab = button.dataset.opsTab;
        stopCamera();
        await render();
      }),
    );
    view
      .querySelector("#ops-start-camera")
      ?.addEventListener("click", startCamera);
    view
      .querySelector("#ops-stop-camera")
      ?.addEventListener("click", stopCamera);
  }
  async function startCamera() {
    const camera = view.querySelector("#ops-camera");
    if (!navigator.mediaDevices?.getUserMedia) {
      notify("Seu navegador não oferece acesso à câmera.");
      return;
    }
    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        }),
        video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.width = "100%";
      video.style.maxHeight = "420px";
      video.style.objectFit = "cover";
      camera.innerHTML = "";
      camera.appendChild(video);
      video.srcObject = stream;
      activeCameraStop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (video.srcObject) video.srcObject = null;
      };
    } catch (error) {
      console.error(error);
      notify("Não foi possível acessar a câmera.");
    }
  }
  function stopCamera() {
    if (activeCameraStop) {
      activeCameraStop();
      activeCameraStop = null;
    }
    const camera = view.querySelector("#ops-camera");
    if (camera)
      camera.innerHTML = `<div class="ops-camera-empty"><i class="fa-solid fa-camera" style="font-size:32px"></i><div style="margin-top:10px">A câmera está parada.</div></div>`;
  }
  async function renderLabels() {
    const { data: products, error } = await supabase
      .from("products")
      .select("id,name,barcode,price")
      .order("name")
      .limit(200);
    if (error) throw error;
    view.innerHTML = `${tabsHTML()}<div class="ops-panel"><h3>Etiquetas de produtos</h3><div class="ops-labels">${(products || []).map((product) => `<div class="ops-label"><strong>${esc(product.name)}</strong><div class="ops-barcode">${esc(product.barcode || "SEM CÓDIGO")}</div><div style="text-align:center;font-weight:800">${money(product.price)}</div></div>`).join("") || `<div class="ops-empty">Nenhum produto cadastrado.</div>`}</div></div>`;
    view.querySelectorAll("[data-ops-tab]").forEach((button) =>
      button.addEventListener("click", async () => {
        currentTab = button.dataset.opsTab;
        await render();
      }),
    );
  }
  async function renderLoyalty() {
    const { data, error } = await supabase
      .from("loyalty_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    view.innerHTML = `${tabsHTML()}<div class="ops-panel"><h3>Fidelidade</h3><div class="ops-grid"><div class="ops-stat"><span class="ops-muted">Pontos por R$ 1</span><strong>${Number(data?.points_per_currency || 1)}</strong></div><div class="ops-stat"><span class="ops-muted">Valor de cada ponto</span><strong>${money(data?.point_value || 0)}</strong></div><div class="ops-stat"><span class="ops-muted">Mínimo para resgate</span><strong>${Number(data?.minimum_redeem_points || 0)} pontos</strong></div><div class="ops-stat"><span class="ops-muted">Status</span><strong>${data?.enabled === false ? "Desativado" : "Ativo"}</strong></div></div></div>`;
    view.querySelectorAll("[data-ops-tab]").forEach((button) =>
      button.addEventListener("click", async () => {
        currentTab = button.dataset.opsTab;
        await render();
      }),
    );
  }
  async function render() {
    try {
      if (currentTab === "purchases") await renderPurchases();
      else if (currentTab === "lots") await renderLots();
      else if (currentTab === "kanban") await renderKanban();
      else if (currentTab === "barcode") await renderBarcode();
      else if (currentTab === "labels") await renderLabels();
      else if (currentTab === "loyalty") await renderLoyalty();
    } catch (error) {
      console.error("Erro nas operações:", error);
      view.innerHTML = `${tabsHTML()}<div class="ops-panel"><div class="ops-empty"><i class="fa-solid fa-triangle-exclamation"></i><br>Não foi possível carregar esta área.<br><small>${esc(error?.message || "Erro desconhecido")}</small></div></div>`;
      view.querySelectorAll("[data-ops-tab]").forEach((button) =>
        button.addEventListener("click", async () => {
          currentTab = button.dataset.opsTab;
          await render();
        }),
      );
    }
  }
  render();
  return () => stopCamera();
}
