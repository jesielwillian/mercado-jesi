import { supabase } from "./supabase.js";
import { translateErrorMessage } from "./error-translations.js";

let content;
let notify;
let suppliers = [];
let editingSupplier = null;
let busy = false;

const escapeHTML = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("pt-BR") : "—";

function addStyles() {
  if (document.querySelector("#suppliers-admin-styles")) return;

  const style = document.createElement("style");
  style.id = "suppliers-admin-styles";
  style.textContent = `
    .suppliers-admin{display:grid;gap:22px}
    .suppliers-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .suppliers-heading h2{margin:0 0 6px;font-size:1.35rem}
    .suppliers-heading p{margin:0;color:var(--muted,#9298a6)}
    .suppliers-panel{padding:20px;background:var(--panel,#11141d);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:14px;min-width:0}
    .suppliers-toolbar{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;align-items:center}
    .suppliers-toolbar input,.suppliers-toolbar select{flex:1;min-width:180px;padding:11px 13px;border:1px solid var(--border,#dfe5df);border-radius:9px;background:var(--input-bg,transparent);color:inherit;font:inherit}
    .suppliers-btn{border:0;border-radius:9px;padding:10px 15px;font:inherit;font-weight:700;cursor:pointer}
    .suppliers-btn:disabled{opacity:.55;cursor:wait}
    .suppliers-primary{background:#176b43;color:#fff}
    .suppliers-secondary{background:rgba(148,163,184,.14);color:inherit}
    .suppliers-danger{background:rgba(220,38,38,.12);color:#ef7777}
    .suppliers-table-wrap{overflow-x:auto}
    .suppliers-table{width:100%;min-width:760px;border-collapse:collapse}
    .suppliers-table th,.suppliers-table td{padding:13px 11px;text-align:left;border-bottom:1px solid var(--border,rgba(255,255,255,.08));font-size:.86rem}
    .suppliers-table th{color:var(--muted,#9298a6);font-size:.76rem;text-transform:uppercase;letter-spacing:.04em}
    .suppliers-actions{display:flex;gap:7px;flex-wrap:wrap}
    .suppliers-actions button{padding:7px 9px;font-size:.78rem}
    .suppliers-empty{padding:25px;text-align:center;color:var(--muted,#9298a6)}
    .suppliers-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .suppliers-field{display:grid;gap:7px}
    .suppliers-field-full{grid-column:1/-1}
    .suppliers-field label{font-size:.84rem;font-weight:700}
    .suppliers-field input,.suppliers-field textarea,.suppliers-field select{width:100%;min-width:0;padding:12px 13px;border:1px solid var(--border,#dfe5df);border-radius:9px;background:var(--input-bg,transparent);color:inherit;font:inherit}
    .suppliers-field textarea{min-height:100px;resize:vertical}
    .suppliers-field input:focus,.suppliers-field textarea:focus,.suppliers-field select:focus,.suppliers-toolbar input:focus,.suppliers-toolbar select:focus{outline:2px solid rgba(23,107,67,.35);border-color:#176b43}
    .suppliers-form-actions{display:flex;gap:9px;flex-wrap:wrap;grid-column:1/-1}
    .suppliers-status{display:inline-flex;padding:5px 9px;border-radius:20px;font-size:.75rem;font-weight:700}
    .suppliers-status.active{background:rgba(22,163,74,.13);color:#4ade80}
    .suppliers-status.inactive{background:rgba(148,163,184,.14);color:#a1a1aa}
    .suppliers-muted{color:var(--muted,#9298a6)}
    @media(max-width:650px){.suppliers-form{grid-template-columns:1fr}.suppliers-field-full,.suppliers-form-actions{grid-column:auto}.suppliers-panel{padding:15px}}
  `;
  document.head.appendChild(style);
}

function filteredSuppliers() {
  const query = content.querySelector("#suppliers-search")?.value
    .trim()
    .toLocaleLowerCase("pt-BR") || "";

  const status = content.querySelector("#suppliers-filter")?.value || "all";

  return suppliers.filter((supplier) => {
    const matchesQuery = [
      supplier.name,
      supplier.document,
      supplier.phone,
      supplier.email,
    ].some((value) =>
      String(value || "").toLocaleLowerCase("pt-BR").includes(query)
    );

    const matchesStatus =
      status === "all" ||
      (status === "active" && supplier.active) ||
      (status === "inactive" && !supplier.active);

    return matchesQuery && matchesStatus;
  });
}

function renderRows() {
  const rows = filteredSuppliers();
  const target = content.querySelector("#suppliers-rows");
  const count = content.querySelector("#suppliers-count");

  if (!target) return;

  if (count) count.textContent = `${rows.length} fornecedor(es)`;

  target.innerHTML = rows.length
    ? rows.map((supplier) => `
        <tr>
          <td><strong>${escapeHTML(supplier.name)}</strong></td>
          <td>${escapeHTML(supplier.document || "—")}</td>
          <td>${escapeHTML(supplier.phone || "—")}</td>
          <td>${escapeHTML(supplier.email || "—")}</td>
          <td>
            <span class="suppliers-status ${supplier.active ? "active" : "inactive"}">
              ${supplier.active ? "Ativo" : "Inativo"}
            </span>
          </td>
          <td>
            <div class="suppliers-actions">
              <button class="suppliers-btn suppliers-secondary" data-action="edit" data-id="${supplier.id}">Editar</button>
              <button class="suppliers-btn suppliers-secondary" data-action="toggle" data-id="${supplier.id}">
                ${supplier.active ? "Desativar" : "Ativar"}
              </button>
              <button class="suppliers-btn suppliers-danger" data-action="delete" data-id="${supplier.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="6"><div class="suppliers-empty">Nenhum fornecedor encontrado.</div></td></tr>`;
}

function render() {
  content.innerHTML = `
    <section class="suppliers-admin">
      <div class="suppliers-heading">
        <div>
          <h2>Fornecedores</h2>
          <p>Cadastre e gerencie os contatos dos seus fornecedores.</p>
        </div>
        <button class="suppliers-btn suppliers-primary" data-action="new">＋ Novo fornecedor</button>
      </div>

      <section class="suppliers-panel" id="suppliers-form-panel" hidden>
        <h3 id="suppliers-form-title">Novo fornecedor</h3>
        <form class="suppliers-form" data-form="supplier">
          <div class="suppliers-field suppliers-field-full">
            <label for="supplier-name">Nome do fornecedor *</label>
            <input id="supplier-name" name="name" maxlength="180" required>
          </div>

          <div class="suppliers-field">
            <label for="supplier-document">CPF / CNPJ ou documento</label>
            <input id="supplier-document" name="document" maxlength="40">
          </div>

          <div class="suppliers-field">
            <label for="supplier-phone">Telefone</label>
            <input id="supplier-phone" name="phone" type="tel" maxlength="30" placeholder="(00) 00000-0000">
          </div>

          <div class="suppliers-field">
            <label for="supplier-email">E-mail</label>
            <input id="supplier-email" name="email" type="email" maxlength="180">
          </div>

          <div class="suppliers-field">
            <label for="supplier-active">Situação</label>
            <select id="supplier-active" name="active">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>

          <div class="suppliers-field suppliers-field-full">
            <label for="supplier-notes">Observações</label>
            <textarea id="supplier-notes" name="notes" maxlength="3000" placeholder="Condições comerciais, prazos, informações importantes..."></textarea>
          </div>

          <div class="suppliers-form-actions">
            <button class="suppliers-btn suppliers-primary" type="submit">Salvar fornecedor</button>
            <button class="suppliers-btn suppliers-secondary" type="button" data-action="cancel">Cancelar</button>
          </div>
        </form>
      </section>

      <section class="suppliers-panel">
        <div class="suppliers-toolbar">
          <input id="suppliers-search" type="search" placeholder="Buscar por nome, documento, telefone ou e-mail..." aria-label="Buscar fornecedores">
          <select id="suppliers-filter" aria-label="Filtrar situação">
            <option value="all">Todos os fornecedores</option>
            <option value="active">Somente ativos</option>
            <option value="inactive">Somente inativos</option>
          </select>
          <span id="suppliers-count" class="suppliers-muted"></span>
        </div>

        <div class="suppliers-table-wrap">
          <table class="suppliers-table">
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Documento</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="suppliers-rows"></tbody>
          </table>
        </div>
      </section>
    </section>
  `;

  renderRows();
}

async function loadSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, document, phone, email, notes, active, created_at")
    .order("name", { ascending: true });

  if (error) throw error;

  suppliers = data || [];
  render();
}

function openForm(supplier = null) {
  editingSupplier = supplier;

  const panel = content.querySelector("#suppliers-form-panel");
  const form = panel.querySelector("form");

  form.reset();

  content.querySelector("#suppliers-form-title").textContent =
    supplier ? "Editar fornecedor" : "Novo fornecedor";

  if (supplier) {
    form.elements.name.value = supplier.name || "";
    form.elements.document.value = supplier.document || "";
    form.elements.phone.value = supplier.phone || "";
    form.elements.email.value = supplier.email || "";
    form.elements.notes.value = supplier.notes || "";
    form.elements.active.value = String(supplier.active);
  } else {
    form.elements.active.value = "true";
  }

  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.name.focus();
}

async function saveSupplier(form) {
  const values = new FormData(form);

  const payload = {
    name: String(values.get("name") || "").trim(),
    document: String(values.get("document") || "").trim() || null,
    phone: String(values.get("phone") || "").trim() || null,
    email: String(values.get("email") || "").trim() || null,
    notes: String(values.get("notes") || "").trim() || null,
    active: values.get("active") === "true",
  };

  if (!payload.name) {
    throw new Error("Informe o nome do fornecedor.");
  }

  const request = editingSupplier
    ? supabase.from("suppliers").update(payload).eq("id", editingSupplier.id)
    : supabase.from("suppliers").insert(payload);

  const { error } = await request;
  if (error) throw error;

  notify(editingSupplier ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
  editingSupplier = null;
  await loadSuppliers();
}

async function toggleSupplier(id) {
  const supplier = suppliers.find((item) => item.id === id);
  if (!supplier) return;

  const { error } = await supabase
    .from("suppliers")
    .update({ active: !supplier.active })
    .eq("id", id);

  if (error) throw error;

  notify(supplier.active ? "Fornecedor desativado." : "Fornecedor ativado.");
  await loadSuppliers();
}

async function deleteSupplier(id) {
  const supplier = suppliers.find((item) => item.id === id);
  if (!supplier) return;

  const confirmed = window.confirm(
    `Excluir o fornecedor "${supplier.name}"? Essa operação não pode ser desfeita.`
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id);

  if (error) throw error;

  notify("Fornecedor excluído.");
  await loadSuppliers();
}

export function mountSuppliersAdmin({ content: target, notify: showNotify }) {
  content = target;
  notify = showNotify;
  editingSupplier = null;
  busy = false;

  addStyles();

  content.innerHTML = `
    <section class="suppliers-panel suppliers-empty">Carregando fornecedores...</section>
  `;

  if (!content.dataset.suppliersAdminEventsBound) {
    content.addEventListener("click", handleClick);
    content.addEventListener("submit", handleSubmit);
    content.addEventListener("input", handleInput);
    content.addEventListener("change", handleInput);
    content.dataset.suppliersAdminEventsBound = "true";
  }

  loadSuppliers().catch((error) => {
    console.error(error);
    content.innerHTML = `
      <section class="suppliers-panel">
        <h3>Não foi possível carregar os fornecedores</h3>
        <p class="suppliers-muted">${escapeHTML(translateErrorMessage(error.message, "Verifique sua conexão e as permissões no Supabase."))}</p>
        <button class="suppliers-btn suppliers-secondary" data-action="retry">Tentar novamente</button>
      </section>
    `;
  });
}

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || busy) return;

  const { action, id } = button.dataset;

  if (action === "new") {
    openForm();
    return;
  }

  if (action === "cancel") {
    editingSupplier = null;
    content.querySelector("#suppliers-form-panel").hidden = true;
    return;
  }

  if (action === "edit") {
    const supplier = suppliers.find((item) => item.id === id);
    if (supplier) openForm(supplier);
    return;
  }

  if (!["toggle", "delete", "retry"].includes(action)) return;

  busy = true;
  button.disabled = true;

  try {
    if (action === "toggle") await toggleSupplier(id);
    if (action === "delete") await deleteSupplier(id);
    if (action === "retry") await loadSuppliers();
  } catch (error) {
    console.error(error);
    notify(error.message || "Não foi possível concluir a operação.");
  } finally {
    busy = false;
  }
}

async function handleSubmit(event) {
  const form = event.target.closest('form[data-form="supplier"]');
  if (!form || busy) return;

  event.preventDefault();
  busy = true;

  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;

  try {
    await saveSupplier(form);
  } catch (error) {
    console.error(error);
    notify(error.message || "Não foi possível salvar o fornecedor.");
  } finally {
    busy = false;
    if (button?.isConnected) button.disabled = false;
  }
}

function handleInput(event) {
  if (["suppliers-search", "suppliers-filter"].includes(event.target.id)) {
    renderRows();
  }
}
