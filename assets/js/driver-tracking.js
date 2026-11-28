import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Sessão isolada: o login do entregador não sobrescreve a sessão administrativa.
const isSupabaseConfigured = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20 && !SUPABASE_URL.includes('SEU-PROJETO');
const supabase = isSupabaseConfigured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'mercado-jesi-driver-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
}) : null;

const $ = (selector) => document.querySelector(selector);
let gpsWatchId = null;

function message(target, text, type = 'info') {
  const element = $(target);
  element.textContent = text;
  element.hidden = !text;
  element.classList.toggle('error', type === 'error');
  element.classList.toggle('success', type === 'success');
}

function statusLabel(status) {
  return ({ confirmed: 'Confirmado — aguardando preparo', preparing: 'Em preparação', ready: 'Pronto para iniciar', out_for_delivery: 'Em entrega' })[status] || status;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function addressLabel(value) {
  if (!value) return 'Endereço não informado';
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return value; }
  }
  if (typeof value !== 'object') return String(value);
  return [value.street || value.rua || value.address, value.number || value.numero, value.neighborhood || value.bairro, value.complement || value.complemento, value.city || value.cidade, value.state || value.estado].filter(Boolean).join(', ') || 'Endereço cadastrado no pedido';
}

function stopBrowserWatch() {
  if (gpsWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId = null;
}

async function sendPosition(orderId, position) {
  const { coords } = position;
  const { error } = await supabase.rpc('driver_update_delivery_location', {
    p_order_id: orderId,
    p_lat: coords.latitude,
    p_lng: coords.longitude,
    p_accuracy: coords.accuracy
  });
  if (error) message('#driver-message', `Não foi possível enviar a localização: ${error.message}`, 'error');
  else message('#driver-message', `Localização compartilhada. Precisão aproximada: ${Math.round(coords.accuracy)} m.`);
}

function beginGps(orderId) {
  if (!navigator.geolocation) {
    message('#driver-message', 'Este navegador não oferece geolocalização.', 'error');
    return;
  }
  stopBrowserWatch();
  message('#driver-message', 'Solicitando acesso à localização do dispositivo…');
  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => sendPosition(orderId, position),
    (error) => message('#driver-message', `GPS: ${error.message}. Confira a permissão de localização do navegador.`, 'error'),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
}

async function pauseGps(orderId) {
  stopBrowserWatch();
  const { error } = await supabase.rpc('driver_stop_delivery_location', { p_order_id: orderId });
  if (error) message('#driver-message', `O GPS foi pausado neste dispositivo, mas o servidor respondeu: ${error.message}`, 'error');
  else message('#driver-message', 'Compartilhamento de localização pausado. A entrega continua em andamento.');
  await loadDeliveries();
}

async function startDelivery(orderId) {
  message('#driver-message', 'Iniciando entrega…');
  const { error } = await supabase.rpc('driver_start_delivery', { p_order_id: orderId });
  if (error) {
    message('#driver-message', `Não foi possível iniciar a entrega: ${error.message}. Confirme se o pedido está atribuído a esta conta e com status “Pronto”.`, 'error');
    return;
  }
  beginGps(orderId);
  await loadDeliveries();
}

function renderDeliveries(deliveries) {
  const container = $('#driver-deliveries');
  if (!deliveries?.length) {
    container.innerHTML = '<div class="driver-empty">Nenhum pedido atribuído disponível no momento.</div>';
    return;
  }
  container.innerHTML = deliveries.map((order) => {
    const isReady = order.status === 'ready';
    const isOut = order.status === 'out_for_delivery';
    const statusClass = isReady ? 'ready' : isOut ? 'out' : '';
    const action = isReady
      ? `<button class="driver-btn primary gps-action-start" type="button" data-driver-start="${order.order_id}"><i class="fa-solid fa-route"></i> Iniciar entrega e GPS</button>`
      : isOut
        ? `<button class="driver-btn primary gps-action-resume" type="button" data-driver-resume="${order.order_id}"><i class="fa-solid fa-location-crosshairs"></i> Compartilhar / retomar GPS</button><button class="driver-btn danger gps-action-pause" type="button" data-driver-pause="${order.order_id}"><i class="fa-solid fa-pause"></i> Pausar GPS</button>`
        : '<button class="driver-btn outline gps-action-wait" type="button" disabled><i class="fa-solid fa-clock"></i> Aguardando pedido ficar pronto</button>';
    return `<article class="driver-order"><div class="driver-order-head"><h3>Pedido #${order.order_number}</h3><span class="driver-status ${statusClass}">${statusLabel(order.status)}</span></div><p><strong>Cliente:</strong> ${escapeHtml(order.customer_name || 'Não informado')}</p><p><strong>Entrega:</strong> ${escapeHtml(addressLabel(order.delivery_address))}</p><div class="driver-actions">${action}</div></article>`;
  }).join('');
}

async function loadDeliveries({ showUpdated = false } = {}) {
  const { data, error } = await supabase.rpc('driver_my_active_deliveries');
  if (error) {
    $('#driver-deliveries').innerHTML = '<div class="driver-empty">Não foi possível carregar os pedidos. Confirme a migração GPS e se esta conta possui perfil de entregador ativo.</div>';
    message('#driver-message', error.message, 'error');
    return false;
  }
  renderDeliveries(data);
  if (showUpdated) {
    const now = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
    message('#driver-message', `Pedidos atualizados com sucesso às ${now}.`, 'success');
  }
  return true;
}

async function showSession(user) {
  $('#driver-auth-card').classList.add('driver-hidden');
  $('#driver-panel').classList.remove('driver-hidden');
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  $('#driver-name').textContent = profile?.full_name || user.email || 'Entregador';
  await loadDeliveries();
}

$('#driver-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!isSupabaseConfigured || !supabase) {
    message('#driver-auth-message', 'O Supabase não está configurado neste projeto.', 'error');
    return;
  }
  const button = $('#driver-login');
  button.disabled = true;
  button.textContent = 'Entrando…';
  const { data, error } = await supabase.auth.signInWithPassword({ email: $('#driver-email').value.trim(), password: $('#driver-password').value });
  button.disabled = false;
  button.textContent = 'Entrar';
  if (error) {
    message('#driver-auth-message', error.message, 'error');
    return;
  }
  message('#driver-auth-message', 'Login realizado. Carregando suas entregas…');
  await showSession(data.user);
});

$('#driver-deliveries').addEventListener('click', async (event) => {
  const start = event.target.closest('[data-driver-start]');
  const resume = event.target.closest('[data-driver-resume]');
  const pause = event.target.closest('[data-driver-pause]');
  if (start) await startDelivery(start.dataset.driverStart);
  if (resume) beginGps(resume.dataset.driverResume);
  if (pause) await pauseGps(pause.dataset.driverPause);
});

$('#driver-refresh').addEventListener('click', async () => {
  const button = $('#driver-refresh');
  const originalContent = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<i class="fa-solid fa-rotate fa-spin" aria-hidden="true"></i> Atualizando…';
  try {
    await loadDeliveries({ showUpdated: true });
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = originalContent;
  }
});
$('#driver-logout').addEventListener('click', async () => {
  stopBrowserWatch();
  await supabase.auth.signOut();
  $('#driver-panel').classList.add('driver-hidden');
  $('#driver-auth-card').classList.remove('driver-hidden');
  $('#driver-password').value = '';
  message('#driver-auth-message', 'Você saiu da sua conta.');
});

if (supabase) supabase.auth.getSession().then(({ data }) => { if (data.session?.user) showSession(data.session.user); });
