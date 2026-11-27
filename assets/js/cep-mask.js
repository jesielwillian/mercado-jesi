// Máscara global de CEP: formata visualmente e normaliza para oito dígitos.
const formatCEP = value => { const digits = String(value || "").replace(/\D/g, "").slice(0, 8); return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; };
const applyCEP = input => { if (!(input instanceof HTMLInputElement)) return; input.value = formatCEP(input.value); input.inputMode = "numeric"; input.maxLength = 9; input.autocomplete ||= "postal-code"; };
document.querySelectorAll('input[name*="cep" i], input[id*="cep" i], input[name*="postal_code" i], input[id*="postal_code" i]').forEach(applyCEP);
document.addEventListener("input", event => { const el = event.target; if (el instanceof HTMLInputElement && /cep|postal_code/i.test(`${el.name} ${el.id}`)) applyCEP(el); });
document.addEventListener("paste", event => { const el = event.target; if (el instanceof HTMLInputElement && /cep|postal_code/i.test(`${el.name} ${el.id}`)) requestAnimationFrame(() => applyCEP(el)); });
