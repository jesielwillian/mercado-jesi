import { supabase } from "./supabase.js";

const form = document.querySelector("#track-form");
const result = document.querySelector("#track-result");
let activeTrackingCode = "";
let refreshTimer = null;

try {
  const saved = JSON.parse(
    localStorage.getItem("mercado_jesi_tracking") || "null",
  );
  if (saved?.tracking_code && form)
    form.elements.tracking_code.value = saved.tracking_code;
} catch (error) {
  console.warn("Não foi possível recuperar o código salvo:", error);
}

const labels = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Em preparação",
  ready: "Pronto para entrega",
  out_for_delivery: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const esc = (value) =>
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
const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "medium",
      })
    : "Aguardando atualização";

function stopRefresh() {
  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = null;
}
function showMessage(message, isError = false) {
  result.classList.remove("hidden");
  result.innerHTML = `<p${isError ? ' class="track-error"' : ""}>${esc(message)}</p>`;
}
function mapMarkup(location) {
  if (!location)
    return `<section class="track-live-wait"><strong><i class="fa-solid fa-location-dot"></i> Mapa ainda não disponível</strong><p>O mapa será exibido assim que o entregador iniciar a entrega e ativar o compartilhamento do GPS.</p></section>`;
  const lat = Number(location.latitude),
    lng = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
  const delta = 0.006;
  const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
  const external = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  return `<section class="track-live-map"><div class="track-map-heading"><strong><i class="fa-solid fa-truck-fast"></i> Entregador em rota</strong><span>GPS atualizado: ${esc(dateTime(location.recorded_at))}</span></div><iframe title="Localização atual do entregador no mapa" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${embed}"></iframe><a href="${external}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-location-dot"></i> Abrir mapa ampliado</a></section>`;
}
function renderTracking(data) {
  const status = labels[data.status] || data.status || "Status não informado";
  const events = Array.isArray(data.events) ? data.events : [];
  const location = data.fulfillment === "delivery" ? data.location : null;
  result.innerHTML = `
    <div class="track-status">Pedido #${esc(data.order_number)} — ${esc(status)}</div>
    <p class="track-summary">Total do pedido: ${money(data.total)}</p>
    ${mapMarkup(location)}
    ${events.length ? `<div class="track-timeline">${events.map((item) => `<div class="track-event"><strong>${esc(labels[item.status] || item.status || "Atualização")}</strong><small>${esc(item.note || "Atualização do pedido")} · ${esc(dateTime(item.created_at))}</small></div>`).join("")}</div>` : "<p>Seu pedido ainda não possui atualizações registradas.</p>"}
    <p class="track-auto-refresh"><i class="fa-solid fa-rotate"></i> Atualizamos o rastreamento automaticamente a cada 15 segundos.</p>`;
  result.classList.remove("hidden");
}

async function fetchTracking(code, { quiet = false } = {}) {
  // Mantém a consulta dos dados, status e histórico do pedido.
  const { data, error } = await supabase.rpc(
    "get_public_order_tracking_by_code",
    { p_tracking_code: code },
  );

  if (error) throw error;

  if (!data?.found) {
    stopRefresh();
    if (!quiet) {
      showMessage(
        "Código não encontrado. Confira o código gerado na compra e tente novamente.",
        true,
      );
    }
    return false;
  }

  // Consulta separadamente a posição GPS do entregador.
  const { data: gpsData, error: gpsError } = await supabase.rpc(
    "track_order_by_code",
    { p_tracking_code: code },
  );

  if (gpsError) throw gpsError;

  const gps = Array.isArray(gpsData) ? gpsData[0] : gpsData;

  data.location =
    gps?.tracking_active && gps?.latitude != null && gps?.longitude != null
      ? {
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy_m: gps.accuracy_m,
          recorded_at: gps.recorded_at,
        }
      : null;

  renderTracking(data);

  if (data.status === "completed" || data.status === "cancelled") {
    stopRefresh();
  }

  return true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  stopRefresh();
  const submitButton = form.querySelector('[type="submit"]');
  const originalButton = submitButton.innerHTML;
  const code = String(new FormData(form).get("tracking_code") || "").trim();
  if (!code) return;
  activeTrackingCode = code;
  submitButton.disabled = true;
  submitButton.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Consultando...';
  showMessage("Consultando seu pedido...");
  try {
    const found = await fetchTracking(code);
    if (found) {
      refreshTimer = window.setInterval(() => {
        fetchTracking(activeTrackingCode, { quiet: true }).catch((error) =>
          console.warn("Falha ao atualizar rastreamento:", error),
        );
      }, 10000);
    }
  } catch (error) {
    console.error("Erro ao consultar pedido:", error);
    showMessage(
      "Não foi possível consultar o pedido agora. Tente novamente em instantes.",
      true,
    );
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalButton;
  }
});
window.addEventListener("pagehide", stopRefresh);
