import "./admin-selects.js";
import "./currency-mask.js";
import { translateErrorMessage } from "./error-translations.js";
import { supabase, isSupabaseConfigured } from "./supabase.js";

const pageTitle = document.querySelector("#page-title");
const breadcrumb = document.querySelector("#breadcrumb-current");
const content = document.querySelector("#page-content");
const toast = document.querySelector("#dashboard-toast");

const notificationButton = document.querySelector("#notification-button");
const notificationPanel = document.querySelector("#notification-panel");
const notificationList = document.querySelector("#notification-list");
const notificationDot = document.querySelector("#notification-dot");
const notificationMessagesButton = document.querySelector("#notification-messages");

let notificationCache = [];

function renderNotifications(items = []) {
  notificationCache = items;
  if (!notificationList) return;

  notificationList.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "notification-empty";
    const icon = document.createElement("i");
    icon.className = "fa-regular fa-bell-slash";
    icon.setAttribute("aria-hidden", "true");
    const message = document.createElement("span");
    message.textContent = "Nenhuma novidade por enquanto.";
    empty.append(icon, message);
    notificationList.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "notification-item";
    button.dataset.notification = "messages";

    const icon = document.createElement("i");
    // A classe do ícone é definida internamente, nunca vem do banco.
    icon.className = "fa-solid fa-envelope";
    icon.setAttribute("aria-hidden", "true");

    const content = document.createElement("span");
    const title = document.createElement("b");
    const description = document.createElement("small");
    title.textContent = String(item.title ?? "Nova mensagem");
    description.textContent = String(item.text ?? "");
    content.append(title, description);
    button.append(icon, content);
    notificationList.appendChild(button);
  });
}

async function loadNotifications() {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from("contact_messages")
      .select("id,name,subject,created_at,status")
      .eq("status", "new")
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) throw error;

    const messages = data || [];
    if (notificationDot) notificationDot.hidden = messages.length === 0;

    const count = document.querySelector("#messages-nav-count");
    if (count) {
      count.textContent = String(messages.length);
      count.hidden = messages.length === 0;
    }

    renderNotifications(messages.map(item => ({
      icon: "fa-solid fa-envelope",
      title: "Nova mensagem",
      text: `${item.name || "Cliente"} · ${item.subject || "Sem assunto"}`,
    })));
  } catch (error) {
    console.warn("Não foi possível atualizar as notificações:", error);
  }
}

function openNotifications() {
  if (!notificationPanel || !notificationButton) return;
  notificationPanel.hidden = false;
  notificationButton.setAttribute("aria-expanded", "true");
  loadNotifications();
}

function closeNotifications() {
  if (!notificationPanel || !notificationButton) return;
  notificationPanel.hidden = true;
  notificationButton.setAttribute("aria-expanded", "false");
}

notificationButton?.addEventListener("click", () => {
  if (notificationPanel?.hidden) openNotifications();
  else closeNotifications();
});

document.querySelector("#notification-close")?.addEventListener("click", closeNotifications);

notificationList?.addEventListener("click", event => {
  const item = event.target.closest("[data-notification]");
  if (!item) return;
  closeNotifications();
  showModule("messages");
});

notificationMessagesButton?.addEventListener("click", () => {
  closeNotifications();
  showModule("messages");
});

document.addEventListener("click", event => {
  if (!notificationPanel || notificationPanel.hidden) return;
  if (!event.target.closest("#notification-panel") && !event.target.closest("#notification-button")) {
    closeNotifications();
  }
});

async function refreshNotificationState() {
  await loadNotifications();
}

function enhanceNumberInputs(root = document) {
  root.querySelectorAll('input[type="number"]:not([data-number-enhanced])').forEach(input => {
    input.dataset.numberEnhanced = "true";
    const wrapper = document.createElement("span");
    wrapper.className = "number-input-wrap";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const controls = document.createElement("span");
    controls.className = "number-input-actions";
    controls.innerHTML = `
      <button type="button" data-step="up" aria-label="Aumentar valor"><i class="fa-solid fa-chevron-up"></i></button>
      <button type="button" data-step="down" aria-label="Diminuir valor"><i class="fa-solid fa-chevron-down"></i></button>`;
    wrapper.appendChild(controls);

    controls.addEventListener("click", event => {
      const button = event.target.closest("[data-step]");
      if (!button) return;
      const step = input.step && input.step !== "any" ? Number(input.step) : 1;
      const min = input.min === "" ? -Infinity : Number(input.min);
      const max = input.max === "" ? Infinity : Number(input.max);
      const decimals = (String(step).split(".")[1] || "").length;
      const current = input.value === "" ? 0 : Number(input.value);
      let next = button.dataset.step === "up" ? current + step : current - step;
      next = Math.min(max, Math.max(min, next));
      input.value = decimals ? next.toFixed(decimals) : String(next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

const numberObserver = new MutationObserver(() => enhanceNumberInputs(content));
numberObserver.observe(content, { childList: true, subtree: true });
enhanceNumberInputs(document);

const pageNames = {
  overview: "Visão geral",
  orders: "Pedidos",
  "delivery-tracking": "Rastreamento de entregas",
  drivers: "Entregadores",
  products: "Produtos",
  categories: "Categorias",
  inventory: "Estoque",
  pos: "Frente de caixa (PDV)",
  cash: "Controle de caixa",
  customers: "Clientes",
  messages: "Mensagens",
  suppliers: "Fornecedores",
  coupons: "Cupons e ofertas",
  finance: "Financeiro",
  reports: "Relatórios",
  operations: "Operações avançadas",
  users: "Usuários e permissões",
  settings: "Configurações",
};

document.querySelector("#current-date").textContent = new Intl.DateTimeFormat(
  "pt-BR",
  {
    dateStyle: "full",
  },
).format(new Date());

function translateNotice(value) {
  return translateErrorMessage(value, "Não foi possível concluir a operação. Tente novamente.");
}

function notify(text) {
  toast.textContent = translateNotice(text);
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

const formatMoney = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));

const formatDate = (value) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

const localDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function loadSalesChart(days = 7) {
  const chart = document.querySelector("#sales-chart");
  if (!chart || !supabase) return;

  const period = Number(days) === 30 ? 30 : 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (period - 1));
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 1);

  chart.innerHTML = '<div class="sales-chart-loading"><span class="loading-dot"></span>Carregando movimentações confirmadas…</div>';

  try {
    const payments = [];
    // Busca todos os pagamentos confirmados do intervalo, sem limitar o resultado a 1.000 linhas.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("payments")
        .select("id,order_id,amount,paid_at")
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .gte("paid_at", startDate.toISOString())
        .lt("paid_at", endDate.toISOString())
        .order("paid_at", { ascending: true })
        .range(offset, offset + 999);
      if (error) throw error;
      payments.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const totals = new Map();
    for (let offset = 0; offset < period; offset += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + offset);
      totals.set(localDateKey(date), { date, value: 0 });
    }

    payments.forEach((payment) => {
      const paidAt = new Date(payment.paid_at);
      const key = localDateKey(paidAt);
      const day = totals.get(key);
      if (day) day.value += Number(payment.amount || 0);
    });

    const values = [...totals.entries()].map(([key, item]) => ({ key, ...item }));
    const totalReceived = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const maxValue = Math.max(...values.map((item) => item.value), 0);
    // Escala arredondada para não distorcer a comparação entre os dias.
    const scaleStep = maxValue > 0 ? Math.pow(10, Math.floor(Math.log10(maxValue))) / 2 : 1;
    const scaleMax = maxValue > 0 ? Math.ceil(maxValue / scaleStep) * scaleStep : 1;
    const currency = (value) => formatMoney(value);
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
    const dayNumber = new Intl.DateTimeFormat("pt-BR", { day: "2-digit" });
    const fullDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

    const axisLabels = [scaleMax, scaleMax / 2, 0];
    chart.innerHTML = `
      <div class="sales-chart-summary">
        <div><span class="sales-chart-kicker">TOTAL RECEBIDO</span><strong>${currency(totalReceived)}</strong></div>
        <span class="sales-chart-count"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>${payments.length} ${payments.length === 1 ? "pagamento" : "pagamentos"} confirmados</span>
      </div>
      <div class="chart-plot ${period === 30 ? "is-month" : ""}" role="group" aria-label="Vendas confirmadas nos últimos ${period} dias">
        <div class="chart-y-labels" aria-hidden="true">${axisLabels.map((value) => `<span>${currency(value)}</span>`).join("")}</div>
        <div class="chart-columns" tabindex="0" aria-label="Gráfico por dia. Use as setas para navegar pelos dias.">
          ${values.map((item) => {
            const height = maxValue > 0 ? (item.value / scaleMax) * 100 : 0;
            const label = `${fullDate.format(item.date)}: ${currency(item.value)}`;
            return `<div class="chart-column" title="${label}" aria-label="${label}">
              <div class="chart-bar-area"><span class="chart-bar${item.value > 0 ? " has-value" : ""}" style="height:${height.toFixed(2)}%"></span></div>
              <div class="chart-day-label"><span>${weekday.format(item.date).replace(".", "")}</span><small>${dayNumber.format(item.date)}</small></div>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="sales-chart-footnote"><span><i class="fa-solid fa-circle" aria-hidden="true"></i> Pagamentos confirmados</span><span>Valores agrupados pela data de recebimento</span></div>`;
  } catch (error) {
    console.error("Falha ao carregar gráfico de vendas:", error);
    chart.innerHTML = '<div class="empty-state compact"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><strong>Não foi possível carregar as vendas</strong><span>Confira a conexão e as permissões de leitura dos pagamentos.</span></div>';
  }
}

async function loadOverview() {
  if (!supabase) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [recentOrdersResult, ordersCountResult, productsResult, inventoryResult, todaySalesResult] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,customer_name,total,status,created_at,deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),

      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .is("archived_at", null),

      supabase.from("products").select("id", { count: "exact", head: true }),

      supabase.from("inventory").select("quantity,minimum_quantity"),

      supabase
        .from("payments")
        .select("amount")
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .gte("paid_at", today.toISOString()),
    ]);

  const errors = [
    recentOrdersResult.error,
    ordersCountResult.error,
    productsResult.error,
    inventoryResult.error,
    todaySalesResult.error,
  ].filter(Boolean);

  if (errors.length) {
    console.error("Falha ao carregar indicadores reais:", errors);
  }

  const orders = recentOrdersResult.data || [];
  const sales = todaySalesResult.data || [];
  const inventory = inventoryResult.data || [];

  const revenue = sales.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );

  const revenueEl = document.querySelector("#metric-revenue");
  const revenueNoteEl = document.querySelector("#metric-revenue-note");
  const ordersEl = document.querySelector("#metric-orders");
  const productsEl = document.querySelector("#metric-products");
  const stockEl = document.querySelector("#metric-low-stock");
  const tbody = document.querySelector("#recent-orders");

  if (!todaySalesResult.error) {
    if (revenueEl) revenueEl.textContent = formatMoney(revenue);
    if (revenueNoteEl) {
      revenueNoteEl.textContent = `${sales.length} pagamento(s) recebido(s) hoje`;
    }
  }

  if (!ordersCountResult.error && ordersEl) {
    ordersEl.textContent = String(ordersCountResult.count ?? 0);
  }

  const ordersNavCount = document.querySelector("#orders-nav-count");
  if (!ordersCountResult.error && ordersNavCount) {
    const totalOrders = Number(ordersCountResult.count ?? 0);
    ordersNavCount.textContent = String(totalOrders);
    ordersNavCount.hidden = totalOrders === 0;
  }

  if (!productsResult.error && productsEl) {
    productsEl.textContent = String(productsResult.count ?? 0);
  }

  if (!inventoryResult.error) {
    const totalStock = inventory.reduce(
      (total, item) => total + Number(item.quantity || 0),
      0,
    );

    if (stockEl) stockEl.textContent = String(totalStock);

    // O badge do menu Estoque mostra o total de unidades disponíveis,
    // usando a mesma fonte do indicador de estoque da visão geral.
    const stockNavCount = document.querySelector("#stock-nav-count");
    if (stockNavCount) {
      stockNavCount.textContent = String(totalStock);
      stockNavCount.hidden = totalStock === 0;
    }
  }

  if (!recentOrdersResult.error && tbody) {
    const statusLabels = {
      pending: "Pendente",
      confirmed: "Confirmado",
      preparing: "Em preparação",
      ready: "Pronto",
      out_for_delivery: "Saiu para entrega",
      completed: "Concluído",
      cancelled: "Cancelado",
    };

    tbody.innerHTML = orders.length
      ? orders.map((order) => {
          const safeOrderNumber = String(order.order_number ?? "").replace(/[&<>"']/g, "");
          const safeCustomerName = String(order.customer_name || "Cliente").replace(/[&<>"']/g, "");
          const status = statusLabels[order.status] || "Desconhecido";
          const statusClass = order.status === "pending"
            ? "pending"
            : ["preparing", "out_for_delivery"].includes(order.status)
              ? "preparing"
              : "done";

          return `
            <tr>
              <td>#${safeOrderNumber}</td>
              <td>${safeCustomerName}</td>
              <td>${formatDate(order.created_at)}</td>
              <td>${formatMoney(order.total)}</td>
              <td><span class="status ${statusClass}">${status}</span></td>
            </tr>
          `;
        }).join("")
      : '<tr><td colspan="5">Nenhum pedido registrado.</td></tr>';
  }

  await loadSalesChart(Number(document.querySelector("#sales-chart-period")?.value || 7));

  if (errors.length) {
    notify("Alguns indicadores não puderam ser atualizados. Consulte o console para identificar a consulta com erro.");
  }
}

const adminModuleLoaders = {
  "delivery-tracking": () => import("./delivery-tracking-admin.js"),
  drivers: () => import("./drivers-admin.js"),
  orders: () => import("./orders-admin.js"),
  cash: () => import("./cash-admin.js"),
  customers: () => import("./customers-admin.js"),
  suppliers: () => import("./suppliers-admin.js"),
  coupons: () => import("./business-admin.js"),
  finance: () => import("./business-admin.js"),
  reports: () => import("./business-admin.js"),
  users: () => import("./business-admin.js"),
  settings: () => import("./business-admin.js"),
  pos: () => import("./pos-admin.js"),
  inventory: () => import("./inventory-admin.js"),
  products: () => import("./products-admin.js"),
  categories: () => import("./categories-admin.js"),
  messages: () => import("./messages-admin.js"),
  operations: () => import("./operations-admin.js"),
};

const loadedAdminModules = new Map();
let moduleNavigationSequence = 0;

async function showModule(key) {
  const title = pageNames[key] || "Visão geral";
  const navigationSequence = ++moduleNavigationSequence;

  pageTitle.textContent = title;
  breadcrumb.textContent = title;

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === key);
  });

  if (key === "overview") {
    location.href = "./dashboard.html";
    return;
  }

  const loader = adminModuleLoaders[key];
  if (loader) {
    content.setAttribute("aria-busy", "true");
    content.innerHTML = '<div class="panel module-loading" role="status">Carregando módulo...</div>';

    try {
      let modulePromise = loadedAdminModules.get(key);
      if (!modulePromise) {
        modulePromise = loader();
        loadedAdminModules.set(key, modulePromise);
      }

      const module = await modulePromise;
      // Evita que um carregamento lento sobrescreva a tela escolhida depois.
      if (navigationSequence !== moduleNavigationSequence) return;

      const mounters = {
        "delivery-tracking": () => module.mountDeliveryTrackingAdmin({ content, notify }),
        drivers: () => module.mountDriversAdmin({ content, notify }),
        orders: () => module.mountOrdersAdmin({ content, notify }),
        cash: () => module.mountCashAdmin({ content, notify }),
        customers: () => module.mountCustomersAdmin({ content, notify }),
        suppliers: () => module.mountSuppliersAdmin({ content, notify }),
        coupons: () => module.mountCouponsAdmin({ content, notify }),
        finance: () => module.mountFinanceAdmin({ content, notify }),
        reports: () => module.mountReportsAdmin({ content, notify }),
        users: () => module.mountUsersAdmin({ content, notify }),
        settings: () => module.mountSettingsAdmin({ content, notify }),
        pos: () => module.mountPosAdmin({ content, notify }),
        inventory: () => module.mountInventoryAdmin({ content, notify }),
        products: () => module.mountProductsAdmin(),
        categories: () => module.mountCategoriesAdmin({ content, notify }),
        messages: () => module.mountMessagesAdmin({ notify }),
        operations: () => module.mountOperationsAdmin({ content, notify }),
      };

      mounters[key]();
    } catch (error) {
      loadedAdminModules.delete(key);
      console.error(`Erro ao carregar o módulo ${key}:`, error);
      if (navigationSequence === moduleNavigationSequence) {
        content.innerHTML = '<div class="panel module-error" role="alert">Não foi possível carregar este módulo. Atualize a página e tente novamente.</div>';
      }
    } finally {
      if (navigationSequence === moduleNavigationSequence) {
        content.removeAttribute("aria-busy");
      }
    }
    return;
  }

  const descriptions = {
    orders: "Acompanhe pedidos da loja virtual, atualize etapas de separação, retirada e entrega.",
    products: "Cadastre mercadorias, SKU, código de barras, unidade de venda, preço, custo e fotos.",
    categories: "Organize o catálogo em categorias e subcategorias para facilitar a navegação.",
    inventory: "Consulte saldo, estoque mínimo, validade, entradas, perdas e ajustes com histórico.",
    pos: "Registre vendas presenciais, identifique produtos, aplique descontos autorizados e finalize pagamentos.",
  };

  content.innerHTML = `
    <div class="module-intro">
      <div>
        <span class="eyebrow">GESTÃO DO MERCADO JESI</span>
        <h2>${title}</h2>
        <p>${descriptions[key] || "Área administrativa."}</p>
      </div>
    </div>
    <article class="panel module-placeholder">
      <div class="panel-heading">
        <div><h3>Módulo ${title}</h3><p>Estrutura preparada para integração com o Supabase.</p></div>
        <span class="status pending">Sem integração</span>
      </div>
      <p class="module-help">Este módulo ainda não possui operações conectadas ao banco. Não há dados fictícios nesta tela.</p>
      <button class="text-button" id="module-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Voltar à visão geral</button>
    </article>`;

  document.querySelector("#module-back")?.addEventListener("click", () => showModule("overview"));
}

document.querySelector(".side-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");

  if (button) {
    showModule(button.dataset.page);
  }
});

content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-go]");

  if (button) {
    showModule(button.dataset.go);
  }
});

document.querySelector("#mobile-menu").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("open");
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }

  location.href = "./index.html";
});

async function guardAdmin() {
  if (!isSupabaseConfigured || !supabase) {
    notify("Configure o Supabase antes de acessar os dados reais.");
    return;
  }

  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      location.href = "./index.html";
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", session.user.id)
      .single();

    if (profileError) {
      console.error("Erro ao consultar perfil administrativo:", profileError);

      notify("Não foi possível verificar suas permissões.");
      return;
    }

    if (
      !profile?.active ||
      !["owner", "admin", "manager", "operator"].includes(profile.role)
    ) {
      console.error("Perfil sem permissão administrativa:", profile);

      await supabase.auth.signOut();

      location.href = "./index.html";
      return;
    }

    document.querySelector("#admin-name").textContent = session.user.email;

    await loadOverview();
  } catch (error) {
    console.error("Erro ao inicializar o painel administrativo:", error);

    notify("Erro ao carregar o painel administrativo.");
  }
}

document.querySelector("#sales-chart-period")?.addEventListener("change", (event) => {
  loadSalesChart(Number(event.target.value) || 7);
});

guardAdmin();
setTimeout(refreshNotificationState, 1200);
setInterval(refreshNotificationState, 30000);
