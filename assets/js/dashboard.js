import "./admin-selects.js";
import "./currency-mask.js";
import { supabase, isSupabaseConfigured } from "./supabase.js";
import { mountProductsAdmin } from "./products-admin.js";
import { mountMessagesAdmin } from "./messages-admin.js";
import { mountCategoriesAdmin } from "./categories-admin.js";
import { mountOrdersAdmin } from "./orders-admin.js";
import { mountInventoryAdmin } from "./inventory-admin.js";
import { mountPosAdmin } from "./pos-admin.js";
import { mountCashAdmin } from "./cash-admin.js";
import { mountCustomersAdmin } from "./customers-admin.js";
import { mountSuppliersAdmin } from "./suppliers-admin.js";
import {
  mountCouponsAdmin,
  mountFinanceAdmin,
  mountReportsAdmin,
  mountUsersAdmin,
  mountSettingsAdmin,
} from "./business-admin.js";

const pageTitle = document.querySelector("#page-title"),
  breadcrumb = document.querySelector("#breadcrumb-current"),
  content = document.querySelector("#page-content"),
  toast = document.querySelector("#dashboard-toast"),
  notificationButton = document.querySelector("#notification-button"),
  notificationPanel = document.querySelector("#notification-panel"),
  notificationList = document.querySelector("#notification-list"),
  notificationDot = document.querySelector("#notification-dot"),
  notificationMessagesButton = document.querySelector("#notification-messages");

let notificationCache = [];

function renderNotifications(items = []) {
  notificationCache = items;
  if (!notificationList) return;
  if (!items.length) {
    notificationList.innerHTML = `<div class="notification-empty"><i class="fa-regular fa-bell-slash"></i><span>Nenhuma novidade por enquanto.</span></div>`;
    return;
  }
  notificationList.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="notification-item" data-notification="messages"><i class="${item.icon}"></i><span><b>${item.title}</b><small>${item.text}</small></span></button>`,
    )
    .join("");
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
    renderNotifications(
      messages.map((item) => ({
        icon: "fa-solid fa-envelope",
        title: "Nova mensagem",
        text: `${item.name || "Cliente"} · ${item.subject || "Sem assunto"}`,
      })),
    );
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
document
  .querySelector("#notification-close")
  ?.addEventListener("click", closeNotifications);
notificationList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-notification]");
  if (!item) return;
  closeNotifications();
  showModule("messages");
});
notificationMessagesButton?.addEventListener("click", () => {
  closeNotifications();
  showModule("messages");
});
document.addEventListener("click", (event) => {
  if (!notificationPanel || notificationPanel.hidden) return;
  if (
    !event.target.closest("#notification-panel") &&
    !event.target.closest("#notification-button")
  )
    closeNotifications();
});

async function refreshNotificationState() {
  await loadNotifications();
}

function enhanceNumberInputs(root = document) {
  root
    .querySelectorAll('input[type="number"]:not([data-number-enhanced])')
    .forEach((input) => {
      input.dataset.numberEnhanced = "true";
      const wrapper = document.createElement("span");
      wrapper.className = "number-input-wrap";
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      const controls = document.createElement("span");
      controls.className = "number-input-actions";
      controls.innerHTML = `<button type="button" data-step="up" aria-label="Aumentar valor"><i class="fa-solid fa-chevron-up"></i></button><button type="button" data-step="down" aria-label="Diminuir valor"><i class="fa-solid fa-chevron-down"></i></button>`;
      wrapper.appendChild(controls);
      controls.addEventListener("click", (event) => {
        const button = event.target.closest("[data-step]");
        if (!button) return;
        const step =
            input.step && input.step !== "any" ? Number(input.step) : 1,
          min = input.min === "" ? -Infinity : Number(input.min),
          max = input.max === "" ? Infinity : Number(input.max),
          decimals = (String(step).split(".")[1] || "").length,
          current = input.value === "" ? 0 : Number(input.value);
        let next =
          button.dataset.step === "up" ? current + step : current - step;
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
  users: "Usuários e permissões",
  settings: "Configurações",
};

document.querySelector("#current-date").textContent = new Intl.DateTimeFormat(
  "pt-BR",
  { dateStyle: "full" },
).format(new Date());

function translateNotice(value) {
  let text = String(value ?? "");
  const translations = [
    [/inventory is not defined/gi, "estoque não está definido"],
    [/permission denied/gi, "permissão negada"],
    [/row-level security policy/gi, "política de segurança do banco (RLS)"],
    [/JWT expired/gi, "sua sessão expirou. Entre novamente"],
    [/invalid login credentials/gi, "e-mail ou senha incorretos"],
    [/failed to fetch/gi, "falha de conexão. Verifique sua internet"],
    [
      /duplicate key value violates unique constraint/gi,
      "este registro já existe",
    ],
    [
      /violates foreign key constraint/gi,
      "não é possível concluir: há registros relacionados",
    ],
    [
      /new row violates row-level security/gi,
      "a operação não foi autorizada pelas regras de acesso",
    ],
    [
      /relation .* does not exist/gi,
      "tabela não encontrada no Supabase. Verifique se aplicou as migrations",
    ],
    [
      /function .* does not exist/gi,
      "função não encontrada no Supabase. Aplique a migration pendente",
    ],
    [/network request failed/gi, "falha de comunicação com o servidor"],
  ];
  for (const [pattern, replacement] of translations)
    text = text.replace(pattern, replacement);
  return text;
}

function notify(text) {
  if (!toast) return;
  toast.textContent = translateNotice(text);
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

const formatMoney = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0),
  );
const formatDate = (value) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

async function loadOverview() {
  if (!supabase) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [
    recentOrdersResult,
    ordersCountResult,
    pendingOrdersResult,
    productsResult,
    inventoryResult,
    todaySalesResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("id,order_number,customer_name,total,status,created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null)
      .is("archived_at", null),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("inventory").select("quantity,minimum_quantity"),
    supabase
      .from("payments")
      .select("amount")
      .eq("status", "paid")
      .not("paid_at", "is", null)
      .gte("paid_at", today.toISOString())
      .lt("paid_at", tomorrow.toISOString()),
  ]);
  const results = {
    pedidos: ordersCountResult,
    pedidosPendentes: pendingOrdersResult,
    produtos: productsResult,
    estoque: inventoryResult,
    vendas: todaySalesResult,
    pedidosRecentes: recentOrdersResult,
  };
  const errors = Object.entries(results)
    .filter(([, result]) => result.error)
    .map(([name, result]) => ({ consulta: name, erro: result.error.message }));
  if (errors.length) console.error("Erros nas consultas do Supabase:", errors);

  const setMetric = (selector, value, error) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = error ? "—" : String(value);
  };

  setMetric(
    "#metric-orders",
    ordersCountResult.count ?? 0,
    ordersCountResult.error,
  );
  setMetric(
    "#orders-nav-count",
    pendingOrdersResult.count ?? 0,
    pendingOrdersResult.error,
  );

  const ordersBadge = document.querySelector("#orders-nav-count");
  if (ordersBadge && !pendingOrdersResult.error)
    ordersBadge.hidden = Number(pendingOrdersResult.count ?? 0) === 0;

  setMetric(
    "#metric-products",
    productsResult.count ?? 0,
    productsResult.error,
  );

  if (!inventoryResult.error && inventoryResult.data) {
    const inventory = inventoryResult.data;
    const totalStock = inventory.reduce(
      (total, item) => total + Number(item.quantity ?? 0),
      0,
    );
    const lowStock = inventory.filter(
      (item) =>
        Number(item.quantity ?? 0) <= Number(item.minimum_quantity ?? 0),
    ).length;
    setMetric("#metric-low-stock", lowStock, false);
    setMetric("#stock-nav-count", totalStock, false);
    setMetric("#metric-stock-units", totalStock, false);
    const stockBadge = document.querySelector("#stock-nav-count");
    if (stockBadge) stockBadge.hidden = totalStock === 0;
  } else {
    setMetric("#metric-low-stock", null, true);
    setMetric("#stock-nav-count", null, true);
    setMetric("#metric-stock-units", null, true);
  }

  if (!todaySalesResult.error && todaySalesResult.data) {
    const sales = todaySalesResult.data;
    const revenue = sales.reduce(
      (sum, payment) => sum + Number(payment.amount ?? 0),
      0,
    );
    const revenueEl = document.querySelector("#metric-revenue");
    const revenueNoteEl = document.querySelector("#metric-revenue-note");
    if (revenueEl) revenueEl.textContent = formatMoney(revenue);
    if (revenueNoteEl)
      revenueNoteEl.textContent = `${sales.length} pagamento(s) recebido(s) hoje`;
  } else {
    setMetric("#metric-revenue", null, true);
    setMetric("#metric-revenue-note", null, true);
  }

  const tbody = document.querySelector("#recent-orders");
  if (!recentOrdersResult.error && tbody) {
    const orders = recentOrdersResult.data ?? [];
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
      ? orders
          .map((order) => {
            const safe = (value) => String(value ?? "").replace(/[&<>"']/g, "");
            const status = statusLabels[order.status] || "Desconhecido";
            const statusClass =
              order.status === "pending"
                ? "pending"
                : ["preparing", "out_for_delivery"].includes(order.status)
                  ? "preparing"
                  : "done";
            return `<tr><td>#${safe(order.order_number)}</td><td>${safe(order.customer_name || "Cliente")}</td><td>${formatDate(order.created_at)}</td><td>${formatMoney(order.total)}</td><td><span class="status ${statusClass}">${status}</span></td></tr>`;
          })
          .join("")
      : '<tr><td colspan="5">Nenhum pedido registrado.</td></tr>';
  } else if (tbody) {
    tbody.innerHTML =
      '<tr><td colspan="5">Não foi possível carregar os pedidos.</td></tr>';
  }
  if (errors.length)
    notify("Falha ao consultar alguns dados. Verifique o console.");
}

function showModule(key) {
  const title = pageNames[key] || "Visão geral";
  pageTitle.textContent = title;
  breadcrumb.textContent = title;
  document
    .querySelectorAll(".nav-item")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.page === key),
    );
  if (key === "overview") {
    location.href = "./dashboard.html";
    return;
  }
  if (key === "orders") {
    mountOrdersAdmin({ content, notify });
    return;
  }
  if (key === "cash") {
    mountCashAdmin({ content, notify });
    return;
  }
  if (key === "customers") {
    mountCustomersAdmin({ content, notify });
    return;
  }
  if (key === "suppliers") {
    mountSuppliersAdmin({ content, notify });
    return;
  }
  if (key === "coupons") {
    mountCouponsAdmin({ content, notify });
    return;
  }
  if (key === "finance") {
    mountFinanceAdmin({ content, notify });
    return;
  }
  if (key === "reports") {
    mountReportsAdmin({ content, notify });
    return;
  }
  if (key === "users") {
    mountUsersAdmin({ content, notify });
    return;
  }
  if (key === "settings") {
    mountSettingsAdmin({ content, notify });
    return;
  }
  if (key === "pos") {
    mountPosAdmin({ content, notify });
    return;
  }
  if (key === "inventory") {
    mountInventoryAdmin({ content, notify });
    return;
  }
  if (key === "products") {
    mountProductsAdmin();
    return;
  }
  if (key === "categories") {
    mountCategoriesAdmin({ content, notify });
    return;
  }
  if (key === "messages") {
    mountMessagesAdmin({ notify });
    return;
  }

  const descriptions = {
    orders:
      "Acompanhe pedidos da loja virtual, atualize etapas de separação, retirada e entrega.",
    products:
      "Cadastre mercadorias, SKU, código de barras, unidade de venda, preço, custo e fotos.",
    categories:
      "Organize o catálogo em categorias e subcategorias para facilitar a navegação.",
    inventory:
      "Consulte saldo, estoque mínimo, validade, entradas, perdas e ajustes com histórico.",
    pos: "Registre vendas presenciais, identifique produtos, aplique descontos autorizados e finalize pagamentos.",
    cash: "Abertura e fechamento de caixa, sangrias, suprimentos e conferência por forma de pagamento.",
    customers:
      "Consulte clientes, contatos, endereços, pedidos e histórico de relacionamento.",
    messages:
      "Leia, organize, responda por e-mail, arquive e exclua as mensagens enviadas pelo formulário da loja.",
    suppliers:
      "Gerencie fornecedores, contatos, condições comerciais e compras.",
    coupons:
      "Crie cupons, campanhas, descontos por período e ofertas especiais.",
    finance: "Acompanhe receitas, despesas, contas e resultados operacionais.",
    reports:
      "Analise vendas por período, produtos, categorias, margem, estoque e desempenho.",
    users: "Gerencie funcionários, perfis de acesso e permissões por módulo.",
    settings:
      "Configure dados da loja, horários, entrega, retirada, pagamentos e identidade visual.",
  };

  content.innerHTML = `<div class="welcome-row"><div><span class="eyebrow">GESTÃO DO MERCADO JESI</span><h2>${title}</h2><p>${descriptions[key]}</p></div></div><article class="panel module-placeholder"><div class="panel-heading"><div><h3>Módulo ${title}</h3><p>Estrutura preparada para integração com o Supabase.</p></div><span class="status pending">Sem integração</span></div><p class="module-help">Este módulo ainda não possui operações conectadas ao banco. Não há dados fictícios nesta tela. Para habilitá-lo, é necessário implementar a tabela, as políticas RLS e as operações correspondentes no Supabase.</p><button class="text-button" id="module-back"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Voltar à visão geral</button></article>`;
  document
    .querySelector("#module-back")
    .addEventListener("click", () => showModule("overview"));
}

document.querySelector(".side-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-page]");
  if (button) showModule(button.dataset.page);
});
content.addEventListener("click", (event) => {
  const button = event.target.closest("[data-go]");
  if (button) showModule(button.dataset.go);
});
document
  .querySelector("#mobile-menu")
  .addEventListener("click", () =>
    document.querySelector("#sidebar").classList.toggle("open"),
  );

document.querySelector("#logout-button").addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
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
      .select("role,active")
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

guardAdmin();
setTimeout(refreshNotificationState, 1200);
setInterval(refreshNotificationState, 30000);
