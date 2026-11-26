import { supabase } from "./supabase.js";

let categories = [];
let editing = null;
let content;
let notify;
let slugManuallyEdited = false;

const escapeHTML = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char],
  );

const createSlug = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function addStyles() {
  if (document.querySelector("#categories-admin-styles")) return;

  const style = document.createElement("style");
  style.id = "categories-admin-styles";
  style.textContent = `
    .categories-admin { display:grid; gap:22px; }
    .categories-admin .category-heading {
      display:flex; align-items:center; justify-content:space-between;
      gap:16px; flex-wrap:wrap;
    }
    .categories-admin .category-heading h2 {
      margin:0 0 6px; font-size:1.35rem;
    }
    .categories-admin .category-heading p {
      margin:0; color:var(--muted,#778078);
    }
    .categories-admin .category-panel {
      background:var(--panel,#fff); border:1px solid var(--border,#e8ece8);
      border-radius:14px; padding:22px;
    }
    .categories-admin .category-panel h3 {
      margin:0 0 18px; font-size:1rem;
    }
    .categories-admin .category-form {
      display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
      gap:15px;
    }
    .categories-admin .field { display:grid; gap:7px; }
    .categories-admin .field-full { grid-column:1/-1; }
    .categories-admin .field label {
      font-size:.84rem; font-weight:700;
    }
    .categories-admin .field input,
    .categories-admin .field textarea {
      width:100%; min-width:0; padding:12px 13px;
      border:1px solid var(--border,#dfe5df); border-radius:9px;
      background:var(--input-bg,#fff); color:inherit;
      font:inherit; outline:none;
    }
    .categories-admin .field input:focus,
    .categories-admin .field textarea:focus {
      border-color:#176b43;
      box-shadow:0 0 0 3px rgba(23,107,67,.10);
    }
    .categories-admin .field textarea {
      min-height:85px; resize:vertical;
    }
    .categories-admin .category-check {
      display:flex; align-items:center; gap:9px;
      font-size:.9rem; font-weight:600;
    }
    .categories-admin .category-actions {
      display:flex; gap:9px; flex-wrap:wrap;
      grid-column:1/-1; margin-top:3px;
    }
    .categories-admin .category-btn {
      border:0; border-radius:9px; padding:11px 16px;
      font:inherit; font-weight:700; cursor:pointer;
    }
    .categories-admin .category-btn-primary {
      background:#176b43; color:#fff;
    }
    .categories-admin .category-btn-secondary {
      background:#eef2ee; color:#344238;
    }
    .categories-admin .category-btn-danger {
      background:#fff0f0; color:#b42318;
    }
    .categories-admin .category-btn:disabled {
      opacity:.55; cursor:wait;
    }
    .categories-admin .category-table-wrap { overflow-x:auto; }
    .categories-admin .category-table {
      width:100%; border-collapse:collapse; min-width:650px;
    }
    .categories-admin .category-table th,
    .categories-admin .category-table td {
      padding:13px 12px; text-align:left;
      border-bottom:1px solid var(--border,#edf0ed);
      font-size:.88rem;
    }
    .categories-admin .category-table th {
      color:var(--muted,#778078); font-size:.75rem;
      letter-spacing:.04em;
    }
    .categories-admin .category-status {
      display:inline-flex; padding:5px 9px; border-radius:20px;
      font-size:.75rem; font-weight:700;
    }
    .categories-admin .status-active {
      color:#176b43; background:#e7f5ec;
    }
    .categories-admin .status-inactive {
      color:#737b75; background:#edf0ed;
    }
    .categories-admin .category-row-actions {
      display:flex; gap:7px; flex-wrap:wrap;
    }
    .categories-admin .category-row-actions button {
      border:0; background:transparent; color:#176b43;
      font:inherit; font-size:.82rem; font-weight:700; cursor:pointer;
      padding:5px;
    }
    .categories-admin .category-row-actions button[data-action="delete"] {
      color:#b42318;
    }
    .categories-admin .category-empty {
      padding:25px 12px; text-align:center;
      color:var(--muted,#778078);
    }
    .categories-admin .category-count {
      color:var(--muted,#778078); font-size:.85rem;
    }
    @media(max-width:650px) {
      .categories-admin .category-panel { padding:16px; }
      .categories-admin .category-form { grid-template-columns:1fr; }
      .categories-admin .field-full,
      .categories-admin .category-actions { grid-column:auto; }
    }
  `;
  document.head.appendChild(style);
}

function render() {
  const activeCount = categories.filter((item) => item.active).length;

  content.innerHTML = `
    <div class="categories-admin">
      <div class="category-heading">
        <div>
          <span class="eyebrow">ORGANIZAÇÃO DA LOJA</span>
          <h2>Gerenciar categorias</h2>
          <p>Organize os produtos por categorias e controle sua exibição na loja.</p>
        </div>
        <span class="category-count">
          ${categories.length} categorias · ${activeCount} ativas
        </span>
      </div>

      <section class="category-panel">
        <h3>${editing ? "Editar categoria" : "Nova categoria"}</h3>

        <form class="category-form" id="category-form">
          <div class="field">
            <label for="category-name">Nome *</label>
            <input id="category-name" name="name" maxlength="80"
              value="${escapeHTML(editing?.name || "")}"
              placeholder="Ex.: Mercearia" required>
          </div>

          <div class="field">
            <label for="category-slug">Slug</label>
            <input id="category-slug" name="slug" maxlength="100"
              value="${escapeHTML(editing?.slug || "")}"
              placeholder="Gerado automaticamente pelo nome">
          </div>

          <div class="field field-full">
            <label for="category-description">Descrição</label>
            <textarea id="category-description" name="description"
              maxlength="500"
              placeholder="Descrição opcional da categoria">${escapeHTML(editing?.description || "")}</textarea>
          </div>

          <div class="field">
            <label for="category-order">Ordem de exibição</label>
            <input id="category-order" name="sort_order" type="number"
              min="0" step="1"
              value="${Number.isInteger(editing?.sort_order) ? editing.sort_order : 0}">
          </div>

          <div class="field">
            <label>Status</label>
            <label class="category-check">
              <input type="checkbox" name="active"
                ${editing?.active !== false ? "checked" : ""}>
              Categoria ativa
            </label>
          </div>

          <div class="category-actions">
            <button class="category-btn category-btn-primary" type="submit">
              ${editing ? "Salvar alterações" : "Cadastrar categoria"}
            </button>
            ${
              editing
                ? `
              <button class="category-btn category-btn-secondary"
                type="button" data-action="cancel-edit">Cancelar</button>
            `
                : ""
            }
          </div>
        </form>
      </section>

      <section class="category-panel">
        <h3>Categorias cadastradas</h3>
        <div class="category-table-wrap">
          <table class="category-table">
            <thead>
              <tr>
                <th>NOME</th>
                <th>SLUG</th>
                <th>ORDEM</th>
                <th>STATUS</th>
                <th>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              ${
                categories.length
                  ? categories
                      .map(
                        (item) => `
                <tr>
                  <td><strong>${escapeHTML(item.name)}</strong></td>
                  <td>${escapeHTML(item.slug)}</td>
                  <td>${Number(item.sort_order) || 0}</td>
                  <td>
                    <span class="category-status ${item.active ? "status-active" : "status-inactive"}">
                      ${item.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td>
                    <div class="category-row-actions">
                      <button type="button" data-action="edit"
                        data-id="${escapeHTML(item.id)}">Editar</button>
                      <button type="button" data-action="toggle"
                        data-id="${escapeHTML(item.id)}">
                        ${item.active ? "Desativar" : "Ativar"}
                      </button>
                      <button type="button" data-action="delete"
                        data-id="${escapeHTML(item.id)}">Excluir</button>
                    </div>
                  </td>
                </tr>
              `,
                      )
                      .join("")
                  : `
                <tr><td colspan="5" class="category-empty">
                  Nenhuma categoria cadastrada.
                </td></tr>
              `
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;
}

async function loadCategories() {
  content.innerHTML = `
    <div class="category-panel">Carregando categorias...</div>
  `;

  const { data, error } = await supabase
    .from("categories")
    .select("id,name,slug,description,active,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Erro ao carregar categorias:", error);
    content.innerHTML = `
      <div class="category-panel">
        Não foi possível carregar as categorias. Verifique sua conexão e permissões.
      </div>
    `;
    notify("Erro ao carregar categorias: " + error.message);
    return;
  }

  categories = data || [];
  render();
}

async function handleSubmit(event) {
  event.preventDefault();

  const form = content.querySelector("#category-form");

  if (!form) {
    console.error("Formulário de categorias não encontrado.");
    notify("Erro ao localizar o formulário.");
    return;
  }

  const formData = new FormData(form);

  const name = String(formData.get("name") || "").trim();
  const slug = createSlug(String(formData.get("slug") || name));
  const description = String(formData.get("description") || "").trim();
  const sortOrder = Number(formData.get("sort_order") || 0);
  const active = formData.get("active") === "on";

  if (!name || !slug) {
    notify("Informe um nome válido para a categoria.");
    return;
  }

  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) {
    notify("Informe uma ordem válida.");
    return;
  }

  const payload = {
    name,
    slug,
    description: description || null,
    sort_order: sortOrder,
    active,
  };

  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  try {
    const result = editing
      ? await supabase.from("categories").update(payload).eq("id", editing.id)
      : await supabase.from("categories").insert(payload);

    if (result.error) {
      console.error("Erro ao salvar categoria:", result.error);

      const message =
        result.error.code === "23505"
          ? "Já existe uma categoria com esse nome ou slug."
          : result.error.code === "42501" ||
              /row-level security|permission denied/i.test(
                result.error.message || "",
              )
            ? "O Supabase bloqueou o cadastro por falta de permissão. Confira as políticas RLS e seu perfil."
            : `Falha ao salvar categoria: ${result.error.message || "erro desconhecido"} (código ${result.error.code || "sem código"}).`;

      notify(message);
      return;
    }

    editing = null;
    slugManuallyEdited = false;
    notify("Categoria salva com sucesso.");
    await loadCategories();
  } catch (error) {
    console.error("Erro inesperado ao salvar categoria:", error);
    notify("Erro inesperado: " + (error.message || "verifique o console."));
  } finally {
    submitButton.disabled = false;
  }
}

async function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "cancel-edit") {
    editing = null;
    slugManuallyEdited = false;
    render();
    return;
  }

  const category = categories.find((item) => item.id === id);
  if (!category) return;

  if (action === "edit") {
    editing = category;
    slugManuallyEdited = true;
    render();
    content.querySelector("#category-name")?.focus();
    return;
  }

  if (action === "toggle") {
    button.disabled = true;

    const { error } = await supabase
      .from("categories")
      .update({ active: !category.active })
      .eq("id", category.id);

    if (error) {
      console.error("Erro ao alterar status:", error);
      notify("Não foi possível alterar o status: " + error.message);
      button.disabled = false;
      return;
    }

    notify(category.active ? "Categoria desativada." : "Categoria ativada.");
    await loadCategories();
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(
      `Excluir a categoria "${category.name}"? Produtos vinculados deixarão de ter essa categoria associada.`,
    );

    if (!confirmed) return;

    button.disabled = true;

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", category.id);

    if (error) {
      console.error("Erro ao excluir categoria:", error);
      notify("Não foi possível excluir a categoria: " + error.message);
      button.disabled = false;
      return;
    }

    if (editing?.id === category.id) editing = null;

    notify("Categoria excluída.");
    await loadCategories();
  }
}

export async function mountCategoriesAdmin(options = {}) {
  content = options.content || document.querySelector("#page-content");
  notify = options.notify || (() => {});

  if (!supabase || !content) {
    notify("Supabase não está configurado.");
    return;
  }

  addStyles();

  if (!content.dataset.categoriesAdminBound) {
    content.addEventListener("input", (event) => {
      if (event.target.id === "category-slug") {
        slugManuallyEdited = true;
        return;
      }

      if (event.target.id === "category-name" && !slugManuallyEdited) {
        const slugInput = content.querySelector("#category-slug");
        if (slugInput) {
          slugInput.value = createSlug(event.target.value);
        }
      }
    });

    content.addEventListener("submit", (event) => {
      if (event.target.id === "category-form") {
        handleSubmit(event);
      }
    });

    content.addEventListener("click", handleAction);
    content.dataset.categoriesAdminBound = "true";
  }

  await loadCategories();
}
