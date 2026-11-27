import { supabase } from './supabase.js';

const form = document.querySelector('#track-form');
const result = document.querySelector('#track-result');

const labels = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  preparing: 'Em preparação',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para entrega',
  completed: 'Concluído',
  cancelled: 'Cancelado'
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const money = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const dateTime = value => value
  ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'Data não informada';

function showMessage(message, isError = false) {
  result.classList.remove('hidden');
  result.innerHTML = `<p${isError ? ' class="track-error"' : ''}>${esc(message)}</p>`;
}

form.addEventListener('submit', async event => {
  event.preventDefault();

  const submitButton = form.querySelector('[type="submit"]');
  const originalButton = submitButton.innerHTML;
  const values = new FormData(form);

  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Consultando...';
  result.classList.remove('hidden');
  result.innerHTML = '<p>Estamos consultando as informações do seu pedido...</p>';

  try {
    const { data, error } = await supabase.rpc('get_public_order_tracking', {
      p_order_number: Number(values.get('order_number')),
      p_phone: String(values.get('phone')).trim(),
      p_tracking_code: String(values.get('tracking_code')).trim()
    });

    if (error) throw error;

    if (!data?.found) {
      showMessage('Não encontramos um pedido com esses dados. Confira as informações e tente novamente.', true);
      return;
    }

    const status = labels[data.status] || data.status || 'Status não informado';
    const events = Array.isArray(data.events) ? data.events : [];

    result.innerHTML = `
      <div class="track-status">Pedido #${esc(data.order_number)} — ${esc(status)}</div>
      <p>Cliente: ${esc(data.customer_name)} · Total: ${money(data.total)}</p>
      ${events.length ? `
        <div class="track-timeline">
          ${events.map(item => `
            <div class="track-event">
              <strong>${esc(labels[item.status] || item.status || 'Atualização')}</strong>
              <small>${esc(item.note || 'Atualização do pedido')} · ${esc(dateTime(item.created_at))}</small>
            </div>
          `).join('')}
        </div>
      ` : '<p>Seu pedido ainda não possui atualizações registradas.</p>'}
    `;
  } catch (error) {
    console.error('Erro ao consultar pedido:', error);
    showMessage('Não foi possível consultar o pedido agora. Tente novamente em instantes.', true);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = originalButton;
  }
});
