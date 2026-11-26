const MONEY_NAMES = /(?:price|cost|amount|value|discount|tax|fee|total|payment|revenue|shipping|delivery|freight|subtotal|minimum|opening|closing|received|change|cash|pix|card|sale|profit|expense|income|balance)(?:$|_)/i;
const MONEY_IDS = /(?:price|cost|amount|value|discount|tax|fee|total|payment|revenue|shipping|delivery|freight|subtotal|minimum|opening|closing|received|change|cash|pix|card|sale|profit|expense|income|balance)/i;
const marked = new WeakSet();

function isMoneyInput(input) {
  if (!(input instanceof HTMLInputElement)) return false;
  if (input.type !== "number") return input.dataset.currencyMask === "true";
  return MONEY_NAMES.test(input.name || "") || MONEY_IDS.test(input.id || "");
}
function digitsToBR(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function normalizeToDecimal(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? (Number(digits) / 100).toFixed(2) : "";
}
function enhance(input) {
  if (!isMoneyInput(input) || marked.has(input)) return;
  marked.add(input);
  const initial = input.value;
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";
  input.dataset.currencyMask = "true";
  input.dataset.currencyFormatted = "true";
  if (initial !== "") {
    const numeric = Number(String(initial).replace(",", "."));
    input.value = Number.isFinite(numeric)
      ? numeric.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : digitsToBR(initial);
  }
  input.addEventListener("input", () => {
    const formatted = digitsToBR(input.value);
    input.value = formatted;
    input.dataset.currencyFormatted = "true";
  });
}
function scan(root = document) {
  if (root instanceof HTMLInputElement) enhance(root);
  root.querySelectorAll?.('input[type="number"],input[data-currency-mask="true"]').forEach(enhance);
}

// FormData e handlers existentes recebem um decimal padrão (ex.: 1234.56).
document.addEventListener("submit", event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const fields = [...form.querySelectorAll('input[data-currency-mask="true"]')];
  const previous = fields.map(input => input.value);
  fields.forEach(input => { input.value = normalizeToDecimal(input.value); });
  queueMicrotask(() => fields.forEach((input, index) => {
    if (document.activeElement !== input && input.isConnected) input.value = previous[index];
  }));
}, true);

scan();
const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType === Node.ELEMENT_NODE) scan(node);
})));
observer.observe(document.body, { childList: true, subtree: true });
