import { supabase } from "./supabase.js";

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

const number = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

const money = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

const translateInventoryError = (message) => {
  const text = String(message || "");
  if (/inventory is not defined/i.test(text))
    return "Estoque não está definido. Atualize a página; se persistir, aplique a migration de movimentação de estoque no Supabase.";
  return text;
};

const movementLabels = {
  in: "Entrada",
  out: "Saída",
  adjustment: "Ajuste",
  sale: "Venda",
  return: "Devolução",
};

let content;
let notify;
let products = [];
let movements = [];
let selectedProduct = null;

function getStock(product) {
  const inventory = Array.isArray(product.inventory)
    ? product.inventory[0]
    : product.inventory;

  return {
    quantity: Number(inventory?.quantity || 0),
    minimum: Number(inventory?.minimum_quantity || 0),
  };
}

function render() {
  const query = (content.querySelector("#inventory-search")?.value || "")
    .trim()
    .toLocaleLowerCase("pt-BR");

  const filter = content.querySelector("#inventory-filter")?.value || "all";

  const filtered = products.filter((product) => {
    const stock = getStock(product);
    const matchesQuery = `${product.name} ${product.sku || ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(query);

    const matchesFilter =
      filter === "all" ||
      (filter === "low" && stock.quantity <= stock.minimum) ||
      (filter === "available" && stock.quantity > stock.minimum) ||
      (filter === "zero" && stock.quantity === 0);

    return matchesQuery && matchesFilter;
  });

  const total = products.length;
  const low = products.filter((product) => {
    const stock = getStock(product);
    return stock.quantity <= stock.minimum;
  }).length;

  const units = products.reduce(
    (sum, product) => sum + getStock(product).quantity,
    0,
  );

  content.querySelector("#inventory-products-count").textContent = total;
  content.querySelector("#inventory-low-count").textContent = low;
  content.querySelector("#inventory-units-count").textContent = number(units);

  const table = content.querySelector("#inventory-table-body");

  if (!filtered.length) {
    table.innerHTML = `
      <tr><td colspan="6" class="inventory-empty">
        ${
          query || filter !== "all"
            ? "Nenhum produto encontrado para esse filtro."
            : "Nenhum produto cadastrado."
        }
      </td></tr>`;
    return;
  }

  table.innerHTML = filtered
    .map((product) => {
      const stock = getStock(product);
      const isLow = stock.quantity <= stock.minimum;
      const status =
        stock.quantity === 0
          ? "Sem estoque"
          : isLow
            ? "Estoque baixo"
            : "Disponível";

      return `
      <tr>
        <td>
          <div class="inventory-product">
            <span class="inventory-product-icon">
              <i class="fa-solid fa-box" aria-hidden="true"></i>
            </span>
            <span>
              <b>${escapeHTML(product.name)}</b>
              <small>${escapeHTML(product.sku || "Sem SKU")}</small>
            </span>
          </div>
        </td>
        <td>${escapeHTML(product.unit || "un")}</td>
        <td><strong>${number(stock.quantity)}</strong></td>
        <td>${number(stock.minimum)}</td>
        <td>
          <span class="inventory-status ${isLow ? "is-low" : "is-ok"}">
            ${status}
          </span>
        </td>
        <td>
          <div class="inventory-actions">
            <button type="button" data-move="${escapeHTML(product.id)}">
              Movimentar
            </button>
            <button type="button" data-history="${escapeHTML(product.id)}">
              Histórico
            </button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

function renderPage() {
  content.innerHTML = `
    <style id="inventory-admin-styles">
      .inventory-toolbar {
        display:flex;justify-content:space-between;align-items:center;
        gap:18px;margin-bottom:24px;flex-wrap:wrap
      }
      .inventory-toolbar h2 {
        font-size:25px;margin:5px 0
      }
      .inventory-toolbar p {
        color:var(--muted,#9295a2);font-size:13px;margin:0
      }
      .inventory-summary {
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
        gap:14px;margin-bottom:22px
      }
      .inventory-summary-card {
        background:var(--panel,#0c0e16);
        border:1px solid var(--border,#252735);
        border-radius:13px;padding:19px
      }
      .inventory-summary-card small {
        display:block;color:var(--muted,#9295a2);font-size:12px
      }
      .inventory-summary-card strong {
        display:block;font-size:25px;margin-top:8px
      }
      .inventory-summary-card i {
        color:var(--accent,#f5b301);margin-right:7px
      }
      .inventory-panel {
        background:var(--panel,#0c0e16);
        border:1px solid var(--border,#252735);
        border-radius:13px;overflow:hidden
      }
      .inventory-list-toolbar {
        display:flex;justify-content:space-between;align-items:center;
        gap:12px;padding:17px;flex-wrap:wrap
      }
      .inventory-search {
        display:flex;align-items:center;gap:9px;flex:1;min-width:200px;
        max-width:440px;background:var(--input-bg,#080a10);
        border:1px solid var(--border,#252735);border-radius:8px;padding:0 12px
      }
      .inventory-search input {
        width:100%;height:42px;background:transparent;border:0;outline:0;
        color:inherit;font:inherit
      }
      .inventory-list-toolbar select,
      .inventory-modal select,
      .inventory-modal input,
      .inventory-modal textarea {
        background:var(--input-bg,#080a10);color:inherit;
        border:1px solid var(--border,#252735);border-radius:8px;
        padding:11px;font:inherit;width:100%;min-width:0
      }
      .inventory-list-toolbar select {width:auto;min-width:155px}
      .inventory-refresh,.inventory-primary {
        border:0;border-radius:8px;padding:11px 16px;
        background:var(--accent,#f5b301);color:#111;
        font-weight:700;cursor:pointer
      }
      .inventory-table-wrap {overflow-x:auto}
      .inventory-table {
        width:100%;border-collapse:collapse;min-width:760px
      }
      .inventory-table th {
        text-align:left;padding:13px 16px;font-size:10px;
        letter-spacing:.08em;color:var(--muted,#9295a2);
        border-top:1px solid var(--border,#252735);
        border-bottom:1px solid var(--border,#252735)
      }
      .inventory-table td {
        padding:14px 16px;border-bottom:1px solid var(--border,#252735);
        font-size:13px
      }
      .inventory-product {display:flex;align-items:center;gap:11px}
      .inventory-product-icon {
        display:grid;place-items:center;width:36px;height:36px;
        border-radius:9px;background:#ffffff0b;color:var(--accent,#f5b301)
      }
      .inventory-product b,.inventory-product small {display:block}
      .inventory-product small {
        color:var(--muted,#9295a2);font-size:11px;margin-top:4px
      }
      .inventory-status {
        display:inline-flex;padding:5px 9px;border-radius:20px;
        font-size:11px;font-weight:700
      }
      .inventory-status.is-low {background:#ff5b5b18;color:#ff7777}
      .inventory-status.is-ok {background:#27c98718;color:#38d99a}
      .inventory-actions {display:flex;gap:7px}
      .inventory-actions button {
        border:1px solid var(--border,#252735);border-radius:6px;
        padding:7px 9px;background:transparent;color:inherit;
        cursor:pointer;font-size:11px
      }
      .inventory-empty {
        text-align:center;padding:35px!important;
        color:var(--muted,#9295a2)
      }
      .inventory-modal-backdrop {
        position:fixed;inset:0;z-index:9999;background:#000b;
        display:grid;place-items:center;padding:18px
      }
      .inventory-modal {
        width:min(100%,510px);max-height:90vh;overflow:auto;
        background:var(--panel,#10121c);color:var(--text,#f5f5f5);
        border:1px solid var(--border,#303342);border-radius:15px;padding:23px
      }
      .inventory-modal h3 {margin:0 0 7px;font-size:19px}
      .inventory-modal p {
        color:var(--muted,#9295a2);font-size:12px;margin:0 0 20px
      }
      .inventory-form-grid {
        display:grid;grid-template-columns:1fr 1fr;gap:14px
      }
      .inventory-modal label {
        display:block;font-size:12px;margin-bottom:7px
      }
      .inventory-field {margin-bottom:14px;min-width:0}
      .inventory-modal textarea {resize:vertical;min-height:75px}
      .inventory-modal-actions {
        display:flex;justify-content:flex-end;gap:9px;margin-top:19px
      }
      .inventory-secondary {
        border:1px solid var(--border,#303342);border-radius:8px;
        padding:10px 15px;background:transparent;color:inherit;cursor:pointer
      }
      .inventory-history-item {
        padding:13px 0;border-bottom:1px solid var(--border,#303342);
        display:flex;justify-content:space-between;gap:12px;font-size:12px
      }
      .inventory-history-item small {
        display:block;color:var(--muted,#9295a2);margin-top:5px
      }
      .inventory-history-value {font-weight:700;white-space:nowrap}
      @media(max-width:650px) {
        .inventory-summary {grid-template-columns:1fr}
        .inventory-form-grid {grid-template-columns:1fr}
        .inventory-list-toolbar select {width:100%}
      }
    </style>

    <div class="inventory-toolbar">
      <div>
        <span class="eyebrow">CONTROLE OPERACIONAL</span>
        <h2>Estoque</h2>
        <p>Consulte saldos, registre movimentações e acompanhe produtos com estoque baixo.</p>
      </div>
      <button type="button" class="inventory-primary" id="inventory-new-movement">
        <i class="fa-solid fa-arrow-right-arrow-left"></i> Nova movimentação
      </button>
    </div>

    <section class="inventory-summary">
      <article class="inventory-summary-card">
        <small><i class="fa-solid fa-boxes-stacked"></i> Produtos cadastrados</small>
        <strong id="inventory-products-count">0</strong>
      </article>
      <article class="inventory-summary-card">
        <small><i class="fa-solid fa-triangle-exclamation"></i> Estoque baixo</small>
        <strong id="inventory-low-count">0</strong>
      </article>
      <article class="inventory-summary-card">
        <small><i class="fa-solid fa-cubes"></i> Unidades em estoque</small>
        <strong id="inventory-units-count">0</strong>
      </article>
    </section>

    <article class="inventory-panel">
      <div class="inventory-list-toolbar">
        <label class="inventory-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input id="inventory-search" type="search" placeholder="Buscar produto ou SKU...">
        </label>
        <select id="inventory-filter" aria-label="Filtrar estoque">
          <option value="all">Todos os produtos</option>
          <option value="low">Estoque baixo</option>
          <option value="zero">Sem estoque</option>
          <option value="available">Estoque normal</option>
        </select>
        <button type="button" class="inventory-refresh" id="inventory-refresh">
          <i class="fa-solid fa-rotate"></i> Atualizar
        </button>
      </div>
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>PRODUTO</th><th>UNIDADE</th><th>SALDO ATUAL</th>
              <th>MÍNIMO</th><th>SITUAÇÃO</th><th>AÇÕES</th>
            </tr>
          </thead>
          <tbody id="inventory-table-body">
            <tr><td colspan="6" class="inventory-empty">Carregando estoque...</td></tr>
          </tbody>
        </table>
      </div>
    </article>

    <div id="inventory-modal-root"></div>
  `;

  content.querySelector("#inventory-search").addEventListener("input", render);
  content.querySelector("#inventory-filter").addEventListener("change", render);
  content
    .querySelector("#inventory-refresh")
    .addEventListener("click", loadInventory);
  content
    .querySelector("#inventory-new-movement")
    .addEventListener("click", () => openMovement());
  content
    .querySelector("#inventory-table-body")
    .addEventListener("click", handleTableAction);
}

async function loadInventory() {
  const table = content.querySelector("#inventory-table-body");

  table.innerHTML = `
    <tr>
      <td colspan="6" class="inventory-empty">
        Carregando estoque...
      </td>
    </tr>`;

  try {
    if (!supabase) {
      throw new Error("Supabase não está configurado.");
    }

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        sku,
        unit,
        price,
        cost_price,
        active,
        inventory (
          quantity,
          minimum_quantity
        )
      `,
      )
      .eq("active", true)
      .order("name");

    if (error) {
      console.error("[ESTOQUE] Erro Supabase:", error);
      throw error;
    }

    console.log("[ESTOQUE] Produtos recebidos:", data);
    console.log("[ESTOQUE] Total recebido:", data?.length ?? 0);

    products = (data || []).map((product) => ({
      ...product,
      inventory: Array.isArray(product.inventory)
        ? product.inventory[0] || null
        : product.inventory || null,
    }));

    render();

    console.log(
      "[ESTOQUE] Total de unidades:",
      products.reduce((sum, product) => sum + getStock(product).quantity, 0),
    );
  } catch (error) {
    console.error("[ESTOQUE] Falha ao carregar:", error);

    products = [];

    table.innerHTML = `
      <tr>
        <td colspan="6" class="inventory-empty">
          Não foi possível carregar o estoque:
          ${escapeHTML(error.message)}
        </td>
      </tr>`;

    notify(
      `Erro ao carregar estoque: ${translateInventoryError(error.message)}`,
    );
  }
}

function openMovement(productId = "") {
  const product = products.find((item) => item.id === productId);
  selectedProduct = product || null;

  const options = products
    .map((item) => {
      const stock = getStock(item);
      return `
      <option value="${escapeHTML(item.id)}" ${item.id === productId ? "selected" : ""}>
        ${escapeHTML(item.name)} — saldo: ${number(stock.quantity)}
      </option>`;
    })
    .join("");

  content.querySelector("#inventory-modal-root").innerHTML = `
    <div class="inventory-modal-backdrop" data-close-modal>
      <section class="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-modal-title">
        <h3 id="inventory-modal-title">Nova movimentação</h3>
        <p>Registre uma entrada, saída ou ajuste de saldo.</p>

        <form id="inventory-movement-form">
          <div class="inventory-field">
            <label for="movement-product">Produto</label>
            <select id="movement-product" required>
              <option value="">Selecione um produto</option>
              ${options}
            </select>
          </div>

          <div class="inventory-form-grid">
            <div class="inventory-field">
              <label for="movement-type">Tipo de movimentação</label>
              <select id="movement-type" required>
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
                <option value="adjustment">Ajuste de saldo</option>
                <option value="return">Devolução</option>
              </select>
            </div>
            <div class="inventory-field">
              <label for="movement-quantity" id="movement-quantity-label">Quantidade</label>
              <input id="movement-quantity" type="number" min="0.001" step="0.001" required placeholder="0,000">
            </div>
          </div>

          <div class="inventory-field">
            <label for="movement-cost">Custo unitário (opcional)</label>
            <input id="movement-cost" type="number" min="0" step="0.01" placeholder="0,00">
          </div>

          <div class="inventory-field">
            <label for="movement-notes">Observações</label>
            <textarea id="movement-notes" maxlength="500" placeholder="Fornecedor, motivo ou detalhes da movimentação..."></textarea>
          </div>

          <div class="inventory-modal-actions">
            <button type="button" class="inventory-secondary" data-close-modal>Cancelar</button>
            <button type="submit" class="inventory-primary" id="movement-submit">Salvar movimentação</button>
          </div>
        </form>
      </section>
    </div>
  `;

  const root = content.querySelector("#inventory-modal-root");

  root
    .querySelector("#movement-product")
    .addEventListener("change", (event) => {
      selectedProduct =
        products.find((item) => item.id === event.target.value) || null;
    });

  root.querySelector("#movement-type").addEventListener("change", (event) => {
    const adjustment = event.target.value === "adjustment";
    root.querySelector("#movement-quantity-label").textContent = adjustment
      ? "Novo saldo final"
      : "Quantidade";
    root.querySelector("#movement-quantity").placeholder = adjustment
      ? "Informe o saldo final"
      : "0,000";
    root.querySelector("#movement-quantity").min = adjustment ? "0" : "0.001";
  });

  root
    .querySelector("#inventory-movement-form")
    .addEventListener("submit", saveMovement);

  root.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) closeModal();
  });
}

function closeModal() {
  content.querySelector("#inventory-modal-root").innerHTML = "";
  selectedProduct = null;
}

async function saveMovement(event) {
  event.preventDefault();

  const root = content.querySelector("#inventory-modal-root");
  const productId = root.querySelector("#movement-product").value;
  const type = root.querySelector("#movement-type").value;
  const quantity = Number(root.querySelector("#movement-quantity").value);
  const costValue = root.querySelector("#movement-cost").value;
  const notes = root.querySelector("#movement-notes").value.trim();
  const button = root.querySelector("#movement-submit");

  if (!productId) {
    notify("Selecione um produto.");
    return;
  }

  if (
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    (type !== "adjustment" && quantity <= 0)
  ) {
    notify("Informe uma quantidade válida.");
    return;
  }

  if (type === "adjustment" && quantity === 0) {
    notify(
      "O saldo final precisa ser maior que zero. Para zerar, registre uma saída.",
    );
    return;
  }

  button.disabled = true;
  button.textContent = "Salvando...";

  try {
    const { data, error } = await supabase.rpc("manage_stock", {
      p_product_id: productId,
      p_movement_type: type,
      p_quantity: quantity,
      p_unit_cost: costValue === "" ? null : Number(costValue),
      p_notes: notes || null,
    });

    if (error) throw error;

    closeModal();
    notify(`Movimentação registrada. Novo saldo: ${number(data)}.`);
    await loadInventory();
  } catch (error) {
    console.error("Erro ao movimentar estoque:", error);
    notify(
      translateInventoryError(error.message) ||
        "Não foi possível registrar a movimentação.",
    );
    button.disabled = false;
    button.textContent = "Salvar movimentação";
  }
}

async function showHistory(productId) {
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  const root = content.querySelector("#inventory-modal-root");
  root.innerHTML = `
    <div class="inventory-modal-backdrop" data-close-modal>
      <section class="inventory-modal" role="dialog" aria-modal="true">
        <h3>Histórico de movimentações</h3>
        <p>${escapeHTML(product.name)}</p>
        <div id="inventory-history-content">Carregando histórico...</div>
        <div class="inventory-modal-actions">
          <button type="button" class="inventory-secondary" data-close-modal>Fechar</button>
        </div>
      </section>
    </div>`;

  root.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) closeModal();
  });

  try {
    const { data, error } = await supabase
      .from("stock_movements")
      .select("id,movement_type,quantity,unit_cost,notes,created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const history = root.querySelector("#inventory-history-content");
    if (!history) return;

    if (!data?.length) {
      history.innerHTML = `<div class="inventory-empty">Nenhuma movimentação registrada.</div>`;
      return;
    }

    history.innerHTML = data
      .map((item) => {
        const date = new Date(item.created_at).toLocaleString("pt-BR");
        const positive = ["in", "return"].includes(item.movement_type);
        const label = movementLabels[item.movement_type] || item.movement_type;

        return `
        <div class="inventory-history-item">
          <span>
            <b>${escapeHTML(label)}</b>
            <small>${escapeHTML(date)}</small>
            <small>${escapeHTML(item.notes || "Sem observações")}</small>
          </span>
          <span class="inventory-history-value">
            ${positive ? "+" : item.movement_type === "out" || item.movement_type === "sale" ? "−" : ""}
            ${number(item.quantity)}
          </span>
        </div>`;
      })
      .join("");
  } catch (error) {
    console.error("Erro ao carregar histórico:", error);
    const history = root.querySelector("#inventory-history-content");
    if (history) {
      history.innerHTML = `
        <div class="inventory-empty">
          Erro ao carregar histórico: ${escapeHTML(error.message)}
        </div>`;
    }
  }
}

function handleTableAction(event) {
  const moveButton = event.target.closest("[data-move]");
  const historyButton = event.target.closest("[data-history]");

  if (moveButton) openMovement(moveButton.dataset.move);
  if (historyButton) showHistory(historyButton.dataset.history);
}

export async function mountInventoryAdmin(options = {}) {
  content = options.content || document.querySelector("#page-content");
  notify = options.notify || ((message) => console.log(message));

  if (!content) return;

  renderPage();
  await loadInventory();
}
