const WRAPPER_CLASS = "admin-select";
let openSelect = null;

function closeSelect() {
  if (!openSelect) return;
  openSelect.classList.remove("is-open");
  openSelect.querySelector(".admin-select-trigger")?.setAttribute("aria-expanded", "false");
  document.querySelector(".admin-select-menu")?.remove();
  openSelect = null;
}

function enhanceSelect(select) {
  if (!(select instanceof HTMLSelectElement) || select.closest(`.${WRAPPER_CLASS}`)) return;
  if (select.multiple || select.size > 1) return;

  const wrapper = document.createElement("div");
  wrapper.className = WRAPPER_CLASS;
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "admin-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.disabled = select.disabled;
  wrapper.append(trigger);

  const sync = () => {
    const selected = select.selectedOptions[0];
    trigger.textContent = selected?.textContent?.trim() || "Selecione";
    trigger.disabled = select.disabled;
    wrapper.classList.toggle("is-disabled", select.disabled);
    trigger.title = trigger.textContent;
  };
  sync();

  const open = () => {
    if (select.disabled) return;
    if (openSelect === wrapper) return closeSelect();
    closeSelect();
    const menu = document.createElement("div");
    menu.className = "admin-select-menu";

    // Garante que o menu fique acima dos campos e do modal.
    menu.style.position = "fixed";
    menu.style.zIndex = "2147483647";
    menu.style.pointerEvents = "auto";

    menu.setAttribute("role", "listbox");
    menu.tabIndex = -1;
    select.querySelectorAll("option").forEach((option, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "admin-select-option";
      item.textContent = option.textContent.trim();
      item.disabled = option.disabled;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === select.value));
      if (option.value === select.value) item.classList.add("is-selected");
      item.addEventListener("click", () => {
        if (select.value !== option.value) {
          select.value = option.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        sync();
        closeSelect();
        trigger.focus();
      });
      menu.append(item);
    });
    const rect = trigger.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 190) - 8))}px`;
    menu.style.width = `${Math.max(rect.width, 190)}px`;
    menu.style.maxWidth = `calc(100vw - 16px)`;

    // Apenas os selects da área de mensagens abrem para cima.
    // Os demais mantêm a abertura para baixo, sempre a 4px do campo.
    const opensUp = Boolean(select.closest(".messages-panel") || select.id === "message-filter" || select.hasAttribute("data-status"));
    const availableSpace = opensUp
      ? Math.max(80, rect.top - 12)
      : Math.max(80, window.innerHeight - rect.bottom - 12);
    menu.style.maxHeight = `${Math.min(250, availableSpace)}px`;
    menu.style.overflowY = "auto";
    document.body.append(menu);
    const menuHeight = menu.getBoundingClientRect().height;
    menu.style.top = opensUp
      ? `${Math.max(8, rect.top - menuHeight - 4)}px`
      : `${Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4)}px`;
    wrapper.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    openSelect = wrapper;
    const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector(".admin-select-option:not(:disabled)");
    menu.focus({ preventScroll: true });
  };

  trigger.addEventListener("click", open);
  trigger.addEventListener("keydown", event => {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      open();
    }
  });
  select.addEventListener("change", sync);
  select.addEventListener("reset", sync);
  select.form?.addEventListener("reset", () => requestAnimationFrame(sync));
}

function enhanceWithin(root = document) {
  root.querySelectorAll?.("select").forEach(enhanceSelect);
}

document.addEventListener("click", event => {
  if (openSelect && !openSelect.contains(event.target) && !event.target.closest(".admin-select-menu")) closeSelect();
});
document.addEventListener("keydown", event => {
  if (!openSelect) return;
  const menu = document.querySelector(".admin-select-menu");
  const items = [...(menu?.querySelectorAll(".admin-select-option:not(:disabled)") || [])];
  const active = items.indexOf(document.activeElement);
  if (event.key === "Escape") {
    const trigger = openSelect.querySelector(".admin-select-trigger");
    closeSelect();
    trigger?.focus();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    items[Math.max(0, Math.min(items.length - 1, active + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
  } else if (event.key === "Home") {
    event.preventDefault(); items[0]?.focus();
  } else if (event.key === "End") {
    event.preventDefault(); items.at(-1)?.focus();
  }
});
window.addEventListener("scroll", event => {
  const menu = document.querySelector(".admin-select-menu");
  // A rolagem interna da lista não deve fechar o próprio menu.
  if (menu && (event.target === menu || menu.contains(event.target))) return;
  closeSelect();
}, true);
window.addEventListener("resize", closeSelect);

enhanceWithin();
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.matches?.("select")) enhanceSelect(node);
    enhanceWithin(node);
  }));
});
observer.observe(document.body, { childList: true, subtree: true });
