// Máscara brasileira para telefones com DDD (fixo e celular).
export function formatBrazilPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  const ddd = digits.slice(0, 2);
  const number = digits.slice(2);
  if (number.length <= 4) return `(${ddd}) ${number}`;
  if (digits.length <= 10) return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
}

function applyPhoneMask(input) {
  const start = input.selectionStart;
  const before = input.value;
  input.value = formatBrazilPhone(before);
  if (document.activeElement === input && start !== null) {
    const delta = input.value.length - before.length;
    const position = Math.max(0, Math.min(input.value.length, start + delta));
    try { input.setSelectionRange(position, position); } catch { /* input sem seleção */ }
  }
  input.maxLength = 15;
  input.inputMode = 'tel';
  input.autocomplete ||= 'tel';
}

document.querySelectorAll('input[type="tel"], input[name*="phone" i], input[id*="phone" i], input[name*="telefone" i], input[id*="telefone" i]').forEach(applyPhoneMask);
document.addEventListener('input', event => {
  const input = event.target;
  if (input instanceof HTMLInputElement && (input.type === 'tel' || /phone|telefone/i.test(`${input.name} ${input.id}`))) applyPhoneMask(input);
});
