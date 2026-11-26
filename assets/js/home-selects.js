const SELECTOR = "#checkout-fulfillment, #contact-form select[name=\"subject\"]";
let active = null;

function closeMenu() {
  if (!active) return;
  active.wrapper.classList.remove("is-open");
  active.trigger.setAttribute("aria-expanded", "false");
  active.menu.remove();
  active = null;
}

function enhance(select) {
  if (!(select instanceof HTMLSelectElement) || select.dataset.homeEnhanced) return;
  select.dataset.homeEnhanced = "true";
  const wrapper = document.createElement("span");
  wrapper.className = "home-select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "home-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || select.name || "Selecionar opção");
  wrapper.append(trigger);

  const sync = () => {
    trigger.textContent = select.selectedOptions[0]?.textContent?.trim() || "Selecione uma opção";
    trigger.classList.toggle("is-placeholder", !select.value);
    trigger.disabled = select.disabled;
  };
  sync();

  trigger.addEventListener("click", () => {
    if (active?.select === select) return closeMenu();
    closeMenu();
    const menu = document.createElement("div");
    menu.className = "home-select-menu";
    menu.setAttribute("role", "listbox");
    select.querySelectorAll("option").forEach(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "home-select-option";
      item.textContent = option.textContent.trim();
      item.disabled = option.disabled;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === select.value));
      if (option.value === select.value) item.classList.add("is-selected");
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        select.dispatchEvent(new Event("input", { bubbles: true }));
        sync();
        closeMenu();
        trigger.focus();
      });
      menu.append(item);
    });
    const rect = trigger.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.zIndex = "2147483647";
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = `${Math.max(40, window.innerHeight - rect.bottom - 12)}px`;
    document.body.append(menu);
    menu.style.top = `${rect.bottom + 4}px`;
    wrapper.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
    active = { select, wrapper, trigger, menu };
  });
  select.addEventListener("change", sync);
}

document.querySelectorAll(SELECTOR).forEach(enhance);
document.addEventListener("click", event => {
  if (active && !active.wrapper.contains(event.target) && !active.menu.contains(event.target)) closeMenu();
});
document.addEventListener("keydown", event => {
  if (!active) return;
  if (event.key === "Escape") { closeMenu(); active?.trigger.focus(); }
});
window.addEventListener("scroll", () => { if (active) closeMenu(); }, true);
window.addEventListener("resize", closeMenu);

const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.matches?.(SELECTOR)) enhance(node);
  node.querySelectorAll?.(SELECTOR).forEach(enhance);
})));
observer.observe(document.body, { childList: true, subtree: true });
