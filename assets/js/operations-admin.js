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
          "'": "&#39;",
        })[c],
    ),
  dateBR = (value) =>
    value
      ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`))
      : "—",
  ean13Svg = (code) => {
    const L = [
        "0001101",
        "0011001",
        "0010011",
        "0111101",
        "0100011",
        "0110001",
        "0101111",
        "0111011",
        "0110111",
        "0001011",
      ],
      G = [
        "0100111",
        "0110011",
        "0011011",
        "0100001",
        "0011101",
        "0111001",
        "0000101",
        "0010001",
        "0001001",
        "0010111",
      ],
      R = [
        "1110010",
        "1100110",
        "1101100",
        "1000010",
        "1011100",
        "1001110",
        "1010000",
        "1000100",
        "1001000",
        "1110100",
      ],
      parity = [
        "LLLLLL",
        "LLGLGG",
        "LLGGLG",
        "LLGGGL",
        "LGLLGG",
        "LGGLLG",
        "LGGGLL",
        "LGLGLG",
        "LGLGGL",
        "LGGLGL",
      ];
    if (!/^\d{13}$/.test(code)) return "";
    const sum = [...code.slice(0, 12)].reduce(
      (total, d, i) => total + Number(d) * (i % 2 ? 3 : 1),
      0,
    );
    if ((10 - (sum % 10)) % 10 !== Number(code[12])) return "";
    const pattern = parity[Number(code[0])];
    let bits = "101";
    for (let i = 0; i < 6; i++)
      bits += (pattern[i] === "L" ? L : G)[Number(code[i + 1])];
    bits += "01010";
    for (let i = 7; i < 13; i++) bits += R[Number(code[i])];
    bits += "101";
    const bars = [...bits]
      .map((bit, i) =>
        bit === "1" ? `<rect x="${i + 9}" y="0" width="1" height="48"/>` : "",
      )
      .join("");
    return `<svg viewBox="0 0 113 62" role="img" aria-label="Código de barras ${code}" style="width:100%;max-width:190px;height:58px"><g fill="#111">${bars}</g><text x="56.5" y="60" text-anchor="middle" font-size="8" fill="#111">${code}</text></svg>`;
  },
  statusLabels = {
    pending: "Pendente",
    confirmed: "Confirmado",
    preparing: "Em preparação",
    ready: "Pronto",
    out_for_delivery: "Saiu para entrega",
    completed: "Concluído",
    cancelled: "Cancelado",
  },
  purchaseStatusLabels = {
    draft: "Rascunho",
    pending: "Pendente",
    ordered: "Pedido realizado",
    partially_received: "Recebido parcialmente",
    received: "Recebido",
    cancelled: "Cancelado",
    canceled: "Cancelado",
  },
  statuses = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "completed",
  ];
function styles() {
  if (document.querySelector("#operations-admin-styles")) return;
  const style = document.createElement("style");
  style.id = "operations-admin-styles";
  style.textContent = `.ops-admin{display:grid;gap:18px}.ops-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.ops-head h2{margin:0}.ops-tabs{display:flex;gap:7px;flex-wrap:wrap}.ops-tabs button,.ops-btn{border:1px solid var(--line,#e5ece6);background:#fff;color:var(--ink,#293b30);border-radius:9px;padding:8px 12px;font:inherit;font-size:12px;cursor:pointer}.ops-tabs button.active,.ops-btn.primary{background:var(--green,#347b59);border-color:var(--green,#347b59);color:#fff}.ops-panel{background:#fff;border:1px solid var(--line,#e5ece6);border-radius:14px;padding:16px;min-width:0}.ops-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ops-field{display:grid;gap:5px;font-size:12px}.ops-field input,.ops-field select,.ops-field textarea,.ops-search{width:100%;min-height:36px;border:1px solid var(--line,#e5ece6);border-radius:8px;padding:8px 10px;font:inherit;font-size:12px;background:#fff;color:var(--ink,#293b30)}.ops-table{width:100%;border-collapse:collapse;font-size:12px}.ops-table th,.ops-table td{text-align:left;padding:10px 8px;border-bottom:1px solid #edf1ed;vertical-align:middle}.ops-table th{color:#718078;font-size:10px;letter-spacing:.04em}.ops-muted{color:#718078;font-size:11px}.ops-alert{padding:10px 12px;background:#fff6e8;border:1px solid #f3dfb8;border-radius:9px;color:#76531b;font-size:12px}.ops-kanban{display:grid;grid-template-columns:repeat(3,minmax(230px,1fr));gap:12px;overflow:auto}.ops-lane{background:#f6f8f6;border-radius:12px;padding:10px;min-height:180px}.ops-lane h3{font-size:13px;margin:2px 4px 10px}.ops-order{background:#fff;border:1px solid #e5ece6;border-radius:10px;padding:10px;margin-bottom:8px;display:grid;gap:6px}.ops-order select{width:100%;padding:6px;border:1px solid #e5ece6;border-radius:7px;font-size:11px}.ops-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.barcode-hero{position:relative;overflow:hidden;margin-top:2px;border:1px solid #d7e6e6;border-radius:20px;background:linear-gradient(135deg,#fff 0%,#f4f9f9 58%,#eaf3f3 100%);padding:24px;box-shadow:0 16px 42px rgba(36,88,92,.07)}.barcode-hero:before{content:"";position:absolute;width:260px;height:260px;right:-110px;top:-140px;border-radius:50%;background:radial-gradient(circle,rgba(47,111,115,.13),rgba(47,111,115,0) 68%);pointer-events:none}.barcode-top{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}.barcode-title{display:flex;align-items:flex-start;gap:14px}.barcode-icon{width:48px;height:48px;flex:0 0 48px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(145deg,#3b7c80,#2f6f73);color:#e0f1f1;font-size:19px;box-shadow:0 10px 22px rgba(47,111,115,.14)}.barcode-title h3{margin:0;font-size:16px;letter-spacing:-.025em;color:#263e40}.barcode-title p{margin:5px 0 0;color:#7b898c;font-size:10px;line-height:1.55}.barcode-live{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid #d7e6e6;border-radius:999px;background:#fff;color:#2f6f73;font-size:9px;font-weight:800;white-space:nowrap}.barcode-live i{font-size:7px;color:#6da8aa;animation:barcodePulse 2s ease-in-out infinite}@keyframes barcodePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.72)}}.barcode-workspace{position:relative;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:18px;align-items:stretch}.barcode-search-card,.barcode-camera-card{background:rgba(255,255,255,.86);border:1px solid #dce8e8;border-radius:16px;padding:16px}.barcode-label{display:block;margin:0 0 9px;color:#53676a;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.barcode-input-row{display:grid;grid-template-columns:1fr auto;gap:8px}.barcode-input-wrap{position:relative}.barcode-input-wrap i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#789498;font-size:13px;pointer-events:none}.barcode-input{width:100%;height:44px;border:1px solid #d5e3e5;border-radius:11px;padding:0 12px 0 36px;background:#fbfdfd;color:#263e40;font:inherit;font-size:12px;outline:none;transition:.2s}.barcode-input:focus{border-color:#5f9699;box-shadow:0 0 0 4px rgba(47,111,115,.1);background:#fff}.barcode-search-btn{height:44px;padding:0 16px;border:0;border-radius:11px;background:#2f6f73;color:#fff;font:inherit;font-size:10px;font-weight:800;cursor:pointer;box-shadow:0 8px 18px rgba(47,111,115,.13)}.barcode-search-btn:hover{background:#24585c;transform:translateY(-1px)}.barcode-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}.barcode-action{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;padding:0 12px;border:1px solid #d7e6e6;border-radius:10px;background:#fff;color:#405b60;font:inherit;font-size:9px;font-weight:800;cursor:pointer}.barcode-action:hover:not(:disabled){background:#f0f7f7;border-color:#b9d2d3;color:#2f6f73;transform:translateY(-1px)}.barcode-action:disabled{opacity:.48;cursor:not-allowed}.barcode-hint{display:flex;align-items:flex-start;gap:8px;margin:14px 0 0;color:#849195;font-size:9px;line-height:1.55}.barcode-hint i{margin-top:1px;color:#2f6f73}.barcode-camera-card{display:flex;flex-direction:column;min-height:190px}.barcode-camera-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}.barcode-camera-head strong{font-size:10px;color:#405b60}.barcode-camera-head span{font-size:8px;color:#9aa7a9}.barcode-camera-frame{position:relative;min-height:150px;flex:1;display:grid;place-items:center;overflow:hidden;border-radius:13px;background:linear-gradient(145deg,#f3f8f8 0%,#e8f2f2 100%);box-shadow:inset 0 0 0 1px #d5e4e4}.barcode-camera-frame:before,.barcode-camera-frame:after{content:"";position:absolute;width:28px;height:28px;border-color:#6da8aa;border-style:solid;z-index:3;pointer-events:none}.barcode-camera-frame:before{left:16px;top:16px;border-width:2px 0 0 2px}.barcode-camera-frame:after{right:16px;bottom:16px;border-width:0 2px 2px 0}.barcode-camera-frame .scan-line{position:absolute;left:18px;right:18px;top:50%;height:1px;background:linear-gradient(90deg,transparent,#6da8aa,transparent);box-shadow:0 0 10px rgba(47,111,115,.22);z-index:4;opacity:.8;animation:barcodeScan 2.4s ease-in-out infinite}@keyframes barcodeScan{0%,100%{transform:translateY(-42px);opacity:.15}50%{transform:translateY(42px);opacity:1}}.barcode-camera-frame video{width:100%;height:100%;min-height:150px;object-fit:cover;border-radius:13px}.barcode-camera-empty{position:absolute;z-index:2;text-align:center;color:#718286;font-size:9px;line-height:1.55;padding:18px}.barcode-camera-empty i{display:block;font-size:24px;color:#5d9699;margin-bottom:8px}.barcode-result{margin-top:18px}.barcode-result:empty{display:none}.barcode-result .ops-stat{display:grid;grid-template-columns:1fr auto;gap:5px 14px;align-items:center;background:#f6fafa;border:1px solid #dce8e8;border-radius:14px;padding:14px 16px}.barcode-result .ops-stat strong:first-child{font-size:14px;color:#263e40}.barcode-result .ops-stat strong:last-child{grid-column:2;grid-row:1 / span 2;font-size:18px;color:#2f6f73}.barcode-result .ops-stat span{font-size:9px;color:#7b898c}.barcode-result .ops-alert{margin:0}.ops-camera{max-width:480px;width:100%;border-radius:12px;background:#dcecef;display:block}.ops-label-sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ops-label{border:1px dashed #888;padding:12px;min-height:85px;display:grid;align-content:center;text-align:center;break-inside:avoid}.ops-label strong{font-size:14px}.ops-label small{font-size:10px}.ops-stat{border:1px solid #e5ece6;border-radius:10px;padding:12px}.ops-stat strong{display:block;font-size:20px}.ops-stat span{color:#718078;font-size:11px}.ops-history-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.ops-history-head h3{margin:0}.ops-clear-history{border:1px solid #ead7d7;background:#fff8f8;color:#b45151;border-radius:9px;padding:8px 12px;font:inherit;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px}.ops-clear-history:hover{background:#b45151;color:#fff;border-color:#b45151}#ops-purchase-items{margin-top:24px;padding-top:10px;line-height:1.8;display:block}#ops-purchase-cost{text-align:right}@media(max-width:900px){.barcode-workspace{grid-template-columns:1fr}.barcode-camera-card{min-height:230px}}@media(max-width:760px){.barcode-hero{padding:17px}.barcode-top{gap:12px}.barcode-live{display:none}.barcode-title h3{font-size:14px}.barcode-title p{font-size:9px}.barcode-icon{width:42px;height:42px;flex-basis:42px;border-radius:13px}.barcode-input-row{grid-template-columns:1fr}.barcode-search-btn{width:100%}.barcode-camera-card{min-height:220px}.ops-grid{grid-template-columns:1fr}.ops-kanban{grid-template-columns:repeat(3,250px)}.ops-table-wrap{overflow:auto}.ops-label-sheet{grid-template-columns:repeat(2,1fr)}.ops-history-head{align-items:flex-start;flex-direction:column}.ops-clear-history{width:100%;justify-content:center}}@media print{body *{visibility:hidden!important}.ops-label-sheet,.ops-label-sheet *{visibility:visible!important}.ops-label-sheet{position:absolute;inset:0;grid-template-columns:repeat(3,1fr)}.ops-label{border:1px solid #bbb}}`;
  document.head.append(style);
}
export function mountOperationsAdmin({ content, notify = () => {} }) {
  styles();
  content.innerHTML = `<section class="ops-admin"><header class="ops-head"><div><span class="eyebrow">GESTÃO E AUTOMAÇÃO</span><h2>Operações avançadas</h2><p class="ops-muted">Compras, validade, atendimento, etiquetas, fidelidade e leitura de produtos.</p></div><button class="ops-btn" id="ops-refresh"><i class="fa-solid fa-rotate"></i> Atualizar</button></header><nav class="ops-tabs" aria-label="Operações avançadas"><button class="active" data-tab="purchases">Compras</button><button data-tab="lots">Validade e lotes</button><button data-tab="kanban">Separação de pedidos</button><button data-tab="barcode">Código de barras</button><button data-tab="labels">Etiquetas</button><button data-tab="loyalty">Fidelidade</button></nav><div id="ops-view"></div></section>`;
  const view = content.querySelector("#ops-view");
  let active = "purchases",
    realtime = null,
    products = [],
    suppliers = [];
  const loadBase = async () => {
      const [p, s] = await Promise.all([
        supabase
          .from("products")
          .select("id,name,barcode,sku,price,cost_price,unit")
          .eq("active", true)
          .order("name")
          .limit(1000),
        supabase
          .from("suppliers")
          .select("id,name")
          .eq("active", true)
          .order("name"),
      ]);
      if (p.error) throw p.error;
      if (s.error) throw s.error;
      products = p.data || [];
      suppliers = s.data || [];
    },
    productOptions = (selected = "") =>
      products
        .map(
          (p) =>
            `<option value="${p.id}" ${p.id === selected ? "selected" : ""}>${esc(p.name)}${p.barcode ? ` · ${esc(p.barcode)}` : ""}</option>`,
        )
        .join(""),
    tab = (name) => {
      active = name;
      content
        .querySelectorAll("[data-tab]")
        .forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
      render().catch((error) => {
        console.error(error);
        view.innerHTML = `<div class="ops-alert">Não foi possível carregar esta área: ${esc(error.message)}</div>`;
      });
    };
  async function renderPurchases() {
    const { data: orders, error } = await supabase
      .from("purchase_orders")
      .select(
        "id,status,expected_at,subtotal,created_at,suppliers(name),purchase_order_items(id,product_id,quantity,received_quantity,unit_cost,expiry_date,products(name))",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    view.innerHTML = `<div class="ops-panel"><h3>Novo pedido de compra</h3><form id="ops-purchase-form" class="ops-grid"><label class="ops-field">Fornecedor<select name="supplier_id" required><option value="">Selecione</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label><label class="ops-field">Previsão de entrega<input name="expected_at" type="date"></label><label class="ops-field">Observações<input name="notes" maxlength="500"></label><div class="ops-field"><span>Produto</span><select id="ops-purchase-product">${productOptions()}</select></div><label class="ops-field">Quantidade<input id="ops-purchase-qty" type="number" min="0.001" step="0.001" value="1"></label><label class="ops-field">Custo unitário (R$)<input id="ops-purchase-cost" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"></label><label class="ops-field">Validade (opcional)<input id="ops-purchase-expiry" type="date"></label><label class="ops-field">Código do lote<input id="ops-purchase-lot" maxlength="80" placeholder="Lote do fabricante"></label><div class="ops-actions"><button class="ops-btn" type="button" id="ops-add-purchase-item">Adicionar item</button><button class="ops-btn primary" type="submit">Salvar pedido de compra</button></div></form><div id="ops-purchase-items" class="ops-muted">Nenhum item adicionado.</div></div><div class="ops-panel"><div class="ops-history-head"><div><h3>Pedidos de compra recentes</h3><p class="ops-muted">Histórico dos pedidos de compra realizados.</p></div><button class="ops-clear-history" type="button" id="ops-clear-purchases"><i class="fa-solid fa-trash-can"></i> Limpar histórico</button></div><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>FORNECEDOR</th><th>DATA</th><th>STATUS</th><th>ITENS</th><th>VALOR</th><th>AÇÃO</th></tr></thead><tbody>${(orders || []).map((o) => `<tr><td>${esc(o.suppliers?.name || "Fornecedor")}</td><td>${dateBR(o.expected_at)}</td><td>${esc(purchaseStatusLabels[o.status] || o.status)}</td><td>${(o.purchase_order_items || []).length}</td><td>${money(o.subtotal)}</td><td>${o.status === "received" ? "Recebido" : `<button class="ops-btn primary" data-receive-purchase="${o.id}">Receber e atualizar estoque</button>`}</td></tr>`).join("") || '<tr><td colspan="6">Nenhum pedido de compra cadastrado.</td></tr>'}</tbody></table></div><p class="ops-muted">O recebimento é atômico: atualiza estoque, custo e lote de validade em uma única transação.</p></div>`;
    const items = [],
      itemsRoot = view.querySelector("#ops-purchase-items"),
      costInput = view.querySelector("#ops-purchase-cost");
    const formatCost = (value) => {
        let raw = String(value ?? "")
          .replace(/^R\$\s*/, "")
          .replace(/[^\d,.]/g, "");
        if (!raw) return "";
        if (raw.includes(",") || raw.includes(".")) {
          const normalized = raw.replace(/\./g, ",");
          let parts = normalized.split(","),
            integer = parts.shift() || "0",
            decimal = parts.join("").replace(/\D/g, "").slice(0, 2);
          integer = integer.replace(/\D/g, "").replace(/^0+(?=\d)/, "") || "0";
          integer = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
          return `R$ ${integer},${decimal}`;
        }
        const digits = raw.replace(/\D/g, "");
        if (!digits) return "";
        const padded = digits.padStart(3, "0"),
          decimal = padded.slice(-2),
          integer = (
            padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0"
          ).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return `R$ ${integer},${decimal}`;
      },
      parseCost = (value) => {
        let raw = String(value ?? "")
          .replace(/^R\$\s*/, "")
          .trim();
        if (!raw) return 0;
        if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
        else if (raw.includes(".")) {
          const parts = raw.split(".");
          if (parts.length > 2) raw = raw.replace(/\./g, "");
          else if (parts[1]?.length === 3) raw = raw.replace(".", "");
        }
        const n = Number(raw.replace(/[^\d.-]/g, ""));
        return Number.isFinite(n) ? n : 0;
      };
    costInput.addEventListener("input", () => {
      const old = costInput.value,
        pos = costInput.selectionStart || old.length;
      costInput.value = formatCost(old);
      const diff = costInput.value.length - old.length;
      requestAnimationFrame(() => {
        try {
          const p = Math.max(0, Math.min(costInput.value.length, pos + diff));
          costInput.setSelectionRange(p, p);
        } catch {}
      });
    });
    costInput.addEventListener("blur", () => {
      const n = parseCost(costInput.value);
      if (n > 0) costInput.value = money(n);
    });
    costInput.addEventListener("keydown", (e) => {
      if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
    });
    const renderItems = () => {
      itemsRoot.innerHTML = items.length
        ? items
            .map(
              (i, index) =>
                `${esc(i.product_name)}: <strong>${i.quantity}</strong> × <strong>${money(i.unit_cost)}</strong>${i.lot_code ? ` · Lote ${esc(i.lot_code)}` : ""}${i.expiry_date ? ` · Validade ${dateBR(i.expiry_date)}` : ""} <button type="button" class="ops-btn" data-remove-purchase-item="${index}" style="padding:4px 8px;font-size:10px"><i class="fa-solid fa-trash"></i></button>`,
            )
            .join("<br>")
        : "Nenhum item adicionado.";
    };
    view
      .querySelector("#ops-add-purchase-item")
      .addEventListener("click", () => {
        const product = products.find(
            (p) => p.id === view.querySelector("#ops-purchase-product").value,
          ),
          qty = Number(
            String(view.querySelector("#ops-purchase-qty").value || "").replace(
              ",",
              ".",
            ),
          ),
          cost = parseCost(costInput.value);
        if (!product) {
          notify("Selecione um produto.");
          return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          notify("Informe uma quantidade válida.");
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
          expiry_date: view.querySelector("#ops-purchase-expiry").value || null,
          lot_code:
            view.querySelector("#ops-purchase-lot").value.trim() || null,
        });
        renderItems();
        costInput.value = "";
        view.querySelector("#ops-purchase-lot").value = "";
        view.querySelector("#ops-purchase-expiry").value = "";
        notify("Item adicionado ao pedido.");
      });
    view.addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove-purchase-item]");
      if (!button) return;
      items.splice(Number(button.dataset.removePurchaseItem), 1);
      renderItems();
    });
    view
      .querySelector("#ops-clear-purchases")
      .addEventListener("click", async () => {
        if (
          !confirm(
            "Tem certeza que deseja limpar o histórico de pedidos de compra?\n\nEssa ação removerá os pedidos registrados.",
          )
        )
          return;
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
          const ids = ordersToDelete.map((item) => item.id),
            { error: itemError } = await supabase
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
          const currentButton = view.querySelector("#ops-clear-purchases");
          if (currentButton) {
            currentButton.disabled = false;
            currentButton.innerHTML =
              '<i class="fa-solid fa-trash-can"></i> Limpar histórico';
          }
        }
      });
    view
      .querySelector("#ops-purchase-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          const form = new FormData(e.currentTarget);
          if (!form.get("supplier_id")) {
            notify("Selecione um fornecedor.");
            return;
          }
          if (!items.length) {
            notify("Adicione ao menos um item.");
            return;
          }
          const invalid = items.find(
            (i) =>
              !i.product_id ||
              !Number.isFinite(i.quantity) ||
              i.quantity <= 0 ||
              !Number.isFinite(i.unit_cost) ||
              i.unit_cost <= 0,
          );
          if (invalid) {
            notify("Existe um item com quantidade ou custo inválido.");
            return;
          }
          const total = items.reduce(
              (sum, item) =>
                sum + Number(item.quantity) * Number(item.unit_cost),
              0,
            ),
            { data: userData, error: userError } =
              await supabase.auth.getUser();
          if (userError) throw userError;
          const { data: po, error: poError } = await supabase
            .from("purchase_orders")
            .insert({
              supplier_id: form.get("supplier_id"),
              expected_at: form.get("expected_at") || null,
              notes: form.get("notes") || null,
              created_by: userData?.user?.id || null,
              subtotal: total,
              status: "draft",
            })
            .select("id")
            .single();
          if (poError) throw poError;
          const { error: itemError } = await supabase
            .from("purchase_order_items")
            .insert(
              items.map((i) => ({
                purchase_order_id: po.id,
                product_id: i.product_id,
                quantity: i.quantity,
                received_quantity: 0,
                unit_cost: i.unit_cost,
                expiry_date: i.expiry_date || null,
                lot_code: i.lot_code || null,
              })),
            );
          if (itemError) {
            await supabase.from("purchase_orders").delete().eq("id", po.id);
            throw itemError;
          }
          notify("Pedido de compra salvo com sucesso.");
          await renderPurchases();
        } catch (error) {
          console.error("Erro ao salvar pedido:", error);
          notify(
            error?.message || "Não foi possível salvar o pedido de compra.",
          );
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
    const { data, error } = await supabase
      .from("inventory_lots")
      .select(
        "id,lot_code,quantity_received,quantity_remaining,expiry_date,received_at,products(name,sku)",
      )
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw error;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeLots = (data || []).filter(
        (l) => Number(l.quantity_remaining) > 0,
      ),
      expired = activeLots.filter(
        (l) => l.expiry_date && new Date(`${l.expiry_date}T00:00:00`) < today,
      ),
      soon = activeLots.filter(
        (l) =>
          l.expiry_date &&
          new Date(`${l.expiry_date}T00:00:00`) - today < 30 * 864e5 &&
          new Date(`${l.expiry_date}T00:00:00`) >= today,
      );
    view.innerHTML = `<div class="ops-grid"><div class="ops-stat"><span>Lotes com saldo</span><strong>${activeLots.length}</strong></div><div class="ops-stat"><span>Vencidos</span><strong>${expired.length}</strong></div><div class="ops-stat"><span>Vencem em até 30 dias</span><strong>${soon.length}</strong></div></div>${expired.length ? '<div class="ops-alert">Atenção: existem lotes vencidos com saldo. Faça a conferência física e registre a baixa apropriada no estoque.</div>' : ""}<div class="ops-panel"><h3>Rastreabilidade por lote</h3><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>PRODUTO</th><th>LOTE</th><th>RECEBIDO</th><th>SALDO DO LOTE</th><th>VALIDADE</th><th>SITUAÇÃO</th></tr></thead><tbody>${
      activeLots
        .map((l) => {
          const d = l.expiry_date
              ? new Date(`${l.expiry_date}T00:00:00`)
              : null,
            state =
              d && d < today
                ? "Vencido"
                : d && d - today < 30 * 864e5
                  ? "Próximo do vencimento"
                  : "Regular";
          return `<tr><td>${esc(l.products?.name)}</td><td>${esc(l.lot_code || "—")}</td><td>${l.quantity_received}</td><td>${l.quantity_remaining}</td><td>${dateBR(l.expiry_date)}</td><td>${state}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="6">Nenhum lote registrado. Lotes são criados automaticamente no recebimento de compras.</td></tr>'
    }</tbody></table></div></div>`;
  }
  async function renderKanban() {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id,order_number,status,total,customer_name,customer_phone,fulfillment,created_at",
      )
      .is("archived_at", null)
      .in("status", statuses)
      .order("created_at", { ascending: true })
      .limit(150);
    if (error) throw error;
    view.innerHTML = `<div class="ops-panel"><div class="ops-head"><div><h3>Quadro de separação</h3><p class="ops-muted">Atualizações em tempo real enquanto esta tela estiver aberta.</p></div><span class="ops-muted">${(data || []).length} pedidos ativos</span></div><div class="ops-kanban">${[
      ["pending", "confirmed"],
      ["preparing", "ready"],
      ["out_for_delivery", "completed"],
    ]
      .map(
        (group, index) =>
          `<section class="ops-lane"><h3>${["Entrada e confirmação", "Separação e pronto", "Entrega e conclusão"][index]}</h3>${
            (data || [])
              .filter((o) => group.includes(o.status))
              .map(
                (o) =>
                  `<article class="ops-order"><strong>#${o.order_number} · ${money(o.total)}</strong><span>${esc(o.customer_name)}</span><small class="ops-muted">${o.fulfillment === "delivery" ? "Entrega" : "Retirada"} · ${new Date(o.created_at).toLocaleString("pt-BR")}</small><select data-kanban-status="${o.id}" aria-label="Status do pedido #${o.order_number}">${statuses.map((s) => `<option value="${s}" ${o.status === s ? "selected" : ""}>${statusLabels[s]}</option>`).join("")}</select><a class="ops-muted" target="_blank" rel="noopener" href="https://wa.me/${String(o.customer_phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${o.customer_name}, sobre seu pedido #${o.order_number} no Mercado Jesi.`)}">Abrir WhatsApp</a></article>`,
              )
              .join("") || '<p class="ops-muted">Nenhum pedido nesta etapa.</p>'
          }</section>`,
      )
      .join("")}</div></div>`;
    view.querySelectorAll("[data-kanban-status]").forEach((select) =>
      select.addEventListener("change", async () => {
        const { error: updateError } = await supabase
          .from("orders")
          .update({
            status: select.value,
            updated_at: new Date().toISOString(),
          })
          .eq("id", select.dataset.kanbanStatus);
        if (updateError) throw updateError;
        notify("Status do pedido atualizado.");
        await renderKanban();
      }),
    );
  }
  async function renderBarcode() {
    view.innerHTML = `<div class="ops-panel barcode-hero"><div class="barcode-top"><div class="barcode-title"><span class="barcode-icon"><i class="fa-solid fa-barcode"></i></span><div><span class="eyebrow">LEITURA INTELIGENTE</span><h3>Localizar produto por código de barras</h3><p>Consulte rapidamente preço, SKU e informações do produto usando leitor USB, digitação ou câmera.</p></div></div><span class="barcode-live"><i class="fa-solid fa-circle"></i> Leitor pronto</span></div><div class="barcode-workspace"><div class="barcode-search-card"><label class="barcode-label" for="ops-barcode-input">Código do produto</label><div class="barcode-input-row"><div class="barcode-input-wrap"><i class="fa-solid fa-barcode"></i><input class="barcode-input" id="ops-barcode-input" placeholder="Bipe ou digite o código de barras" inputmode="numeric" autocomplete="off"></div><button class="barcode-search-btn" id="ops-barcode-search"><i class="fa-solid fa-magnifying-glass"></i> Pesquisar</button></div><div class="barcode-actions"><button class="barcode-action" id="ops-camera-start"><i class="fa-solid fa-camera"></i> Abrir câmera</button><button class="barcode-action" id="ops-camera-stop" disabled><i class="fa-solid fa-stop"></i> Parar câmera</button></div><p class="barcode-hint"><i class="fa-solid fa-circle-info"></i><span>Aponte o leitor USB para o campo ou use a câmera. A leitura pela câmera depende do suporte do navegador ao <b>BarcodeDetector</b>.</span></p></div><div class="barcode-camera-card"><div class="barcode-camera-head"><strong><i class="fa-solid fa-camera-retro"></i> Scanner visual</strong><span>EAN · UPC · CODE 128</span></div><div class="barcode-camera-frame"><video class="ops-camera" id="ops-camera" playsinline hidden></video><span class="scan-line"></span><div class="barcode-camera-empty" id="ops-camera-empty"><i class="fa-solid fa-expand"></i>Abra a câmera para iniciar a leitura</div></div></div></div><div id="ops-barcode-result" class="barcode-result"></div></div>`;
    const input = view.querySelector("#ops-barcode-input"),
      result = view.querySelector("#ops-barcode-result"),
      video = view.querySelector("#ops-camera");
    let stream = null,
      raf = 0,
      detector = null;
    async function lookup() {
      const code = input.value.trim();
      if (!code) return;
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,barcode,price,cost_price,unit")
        .eq("barcode", code)
        .maybeSingle();
      if (error) throw error;
      result.innerHTML = data
        ? `<div class="ops-stat"><strong>${esc(data.name)}</strong><span>Código ${esc(data.barcode || "—")} · SKU ${esc(data.sku || "—")} · ${esc(data.unit)}</span><strong>${money(data.price)}</strong></div>`
        : '<div class="ops-alert">Nenhum produto encontrado com este código.</div>';
    }
    view.querySelector("#ops-barcode-search").addEventListener("click", lookup);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        lookup();
      }
    });
    view
      .querySelector("#ops-camera-start")
      .addEventListener("click", async () => {
        if (!("BarcodeDetector" in window)) {
          notify(
            "Este navegador não oferece leitura de código pela câmera. Use leitor USB ou digite o código.",
          );
          return;
        }
        try {
          detector = new BarcodeDetector({
            formats: [
              "ean_13",
              "ean_8",
              "upc_a",
              "upc_e",
              "code_128",
              "code_39",
              "itf",
            ],
          });
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          video.srcObject = stream;
          video.hidden = false;
          view.querySelector("#ops-camera-empty").hidden = true;
          await video.play();
          view.querySelector("#ops-camera-stop").disabled = false;
          const scan = async () => {
            if (!stream) return;
            try {
              const codes = await detector.detect(video);
              if (codes.length) {
                input.value = codes[0].rawValue;
                await lookup();
                stop();
                return;
              }
            } catch {}
            raf = requestAnimationFrame(scan);
          };
          scan();
        } catch (error) {
          notify(`Não foi possível abrir a câmera: ${error.message}`);
        }
      });
    function stop() {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.pause();
      video.srcObject = null;
      video.hidden = true;
      view.querySelector("#ops-camera-empty").hidden = false;
      view.querySelector("#ops-camera-stop").disabled = true;
      activeCameraStop = null;
    }
    activeCameraStop = stop;
    view.querySelector("#ops-camera-stop").addEventListener("click", stop);
  }
  async function renderLabels() {
    view.innerHTML = `<div class="ops-panel"><h3>Imprimir etiquetas de preço</h3><div class="ops-grid"><label class="ops-field">Produto<select id="ops-label-product">${productOptions()}</select></label><label class="ops-field">Quantidade de etiquetas<input id="ops-label-qty" type="number" min="1" max="100" value="1"></label><div class="ops-field" style="align-content:end"><button class="ops-btn primary" id="ops-label-add">Adicionar à folha</button></div></div><div class="ops-actions" style="margin:14px 0"><button class="ops-btn" id="ops-label-print">Imprimir etiquetas</button><button class="ops-btn" id="ops-label-clear">Limpar</button></div><div class="ops-label-sheet" id="ops-label-sheet"></div><p class="ops-muted">Impressão via navegador. Ajuste escala e papel na caixa de impressão conforme sua etiqueta física.</p></div>`;
    const sheet = view.querySelector("#ops-label-sheet");
    view.querySelector("#ops-label-add").addEventListener("click", () => {
      const p = products.find(
          (x) => x.id === view.querySelector("#ops-label-product").value,
        ),
        qty = Math.min(
          100,
          Math.max(1, Number(view.querySelector("#ops-label-qty").value) || 1),
        );
      if (!p) return;
      for (let i = 0; i < qty; i++) {
        const label = document.createElement("div");
        label.className = "ops-label";
        const name = document.createElement("strong");
        name.textContent = p.name;
        const price = document.createElement("b");
        price.textContent = money(p.price);
        const code = document.createElement("div"),
          barcode = ean13Svg(String(p.barcode || ""));
        if (barcode) code.innerHTML = barcode;
        else {
          const text = document.createElement("small");
          text.textContent = p.barcode || p.sku || "";
          code.append(text);
        }
        label.append(name, price, code);
        sheet.append(label);
      }
    });
    view
      .querySelector("#ops-label-print")
      .addEventListener("click", () => window.print());
    view
      .querySelector("#ops-label-clear")
      .addEventListener("click", () => sheet.replaceChildren());
  }
  async function renderLoyalty() {
    const { data, error } = await supabase
      .from("loyalty_accounts")
      .select(
        "id,points_balance,lifetime_points,customers(full_name,phone,email)",
      )
      .order("points_balance", { ascending: false })
      .limit(500);
    if (error) throw error;
    view.innerHTML = `<div class="ops-panel"><h3>Programa de fidelidade</h3><p class="ops-muted">Regra inicial: 1 ponto a cada R$ 10 em pedidos concluídos. O banco concede pontos uma única vez por pedido.</p><div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>CLIENTE</th><th>TELEFONE</th><th>PONTOS DISPONÍVEIS</th><th>PONTOS ACUMULADOS</th></tr></thead><tbody>${(data || []).map((a) => `<tr><td>${esc(a.customers?.full_name)}</td><td>${esc(a.customers?.phone || "—")}</td><td><strong>${a.points_balance}</strong></td><td>${a.lifetime_points}</td></tr>`).join("") || '<tr><td colspan="4">Ainda não há clientes com pontos. Os pontos são creditados automaticamente após pedidos concluídos vinculados a um cadastro de cliente.</td></tr>'}</tbody></table></div></div>`;
  }
  async function render() {
    if (!supabase) {
      view.innerHTML =
        '<div class="ops-alert">Configure a conexão com o Supabase para usar este módulo.</div>';
      return;
    }
    await loadBase();
    if (active === "purchases") return renderPurchases();
    if (active === "lots") return renderLots();
    if (active === "kanban") return renderKanban();
    if (active === "barcode") return renderBarcode();
    if (active === "labels") return renderLabels();
    if (active === "loyalty") return renderLoyalty();
  }
  content
    .querySelectorAll("[data-tab]")
    .forEach((button) =>
      button.addEventListener("click", () => tab(button.dataset.tab)),
    );
  content
    .querySelector("#ops-refresh")
    .addEventListener("click", () => render().catch((e) => notify(e.message)));
  content.querySelectorAll("[data-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      if (realtime) {
        supabase.removeChannel(realtime);
        realtime = null;
      }
      activeCameraStop?.();
      activeCameraStop = null;
      if (button.dataset.tab === "kanban")
        realtime = supabase
          .channel("ops-orders-live")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders" },
            () => {
              if (active === "kanban") renderKanban().catch(console.error);
            },
          )
          .subscribe();
    }),
  );
  const root = content.querySelector(".ops-admin"),
    cleanupObserver = new MutationObserver(() => {
      if (!content.contains(root)) {
        if (realtime) supabase.removeChannel(realtime);
        activeCameraStop?.();
        cleanupObserver.disconnect();
      }
    });
  cleanupObserver.observe(content, { childList: true });
  render().catch((error) => {
    console.error(error);
    view.innerHTML = `<div class="ops-alert">${esc(error.message || "Falha ao carregar operações.")}. Verifique se a migration 0021 foi aplicada.</div>`;
  });
}
