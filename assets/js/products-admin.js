import { supabase } from "./supabase.js";
import { localProductsList, localProductSave, localProductDelete, localImageUrl } from "./product-store.js";

const content = document.querySelector("#page-content");
const toast = document.querySelector("#dashboard-toast");
const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

function parseMoneyInput(value) {
  if (value === null || value === undefined) return null;
  let raw = String(value).trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!raw) return null;

  // Formato brasileiro (1.234,56) ou decimal com ponto (1234.56).
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else raw = raw.replace(/[^0-9.-]/g, "");

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const slugify = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let products = [];
let categories = [];
let editingId = null;
let selectedImage = null;
let previewUrl = null;

function notify(message) {
  let translated = String(message ?? "");
  translated = translated.replace(/inventory is not defined/ig, "estoque não está definido")
    .replace(/permission denied/ig, "permissão negada")
    .replace(/row-level security policy/ig, "política de segurança do banco (RLS)")
    .replace(/failed to fetch/ig, "falha de conexão. Verifique sua internet")
    .replace(/invalid login credentials/ig, "e-mail ou senha incorretos");
  if (!toast) {
    console.warn("[Mercado Jesi]", translated);
    return;
  }
  toast.textContent = translated;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function productImage(product) {
  if (product.local) return localImageUrl(product);
  if (product.image_url) return product.image_url;
  if (product.storage_path && supabase) return supabase.storage.from("product-images").getPublicUrl(product.storage_path).data.publicUrl;
  return "";
}

function render() {
  const query = (content.querySelector("#product-search")?.value || "").trim().toLocaleLowerCase("pt-BR");
  const filtered = products.filter(product => `${product.name} ${product.sku || ""} ${product.category_name || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  const table = content.querySelector("#products-table-body");
  const count = content.querySelector("#products-total");
  if (!table) return;
  if (count) {
    count.textContent = `${products.length} produto(s) cadastrado(s)`;
  }
  if (!filtered.length) {
    table.innerHTML = `<tr><td colspan="6" class="products-empty">${query ? "Nenhum produto corresponde à busca." : "Nenhum produto cadastrado. Clique em “Adicionar produto” para começar."}</td></tr>`;
    return;
  }
  table.innerHTML = filtered.map(product => {
    const image = productImage(product);
    return `<tr>
      <td><div class="product-cell">${image ? `<img src="${escapeHTML(image)}" alt="">` : `<span class="product-thumb-placeholder"><i class="fa-solid fa-bag-shopping" aria-hidden="true"></i></span>`}<span><b>${escapeHTML(product.name)}</b><small>${escapeHTML(product.sku || "Sem SKU")}</small></span></div></td>
      <td>${escapeHTML(product.category_name || "—")}</td>
      <td class="price-cell">${money(product.price)}</td>
      <td>${Number(product.stock ?? product.quantity ?? 0).toLocaleString("pt-BR")}</td>
      <td><span class="product-status ${product.active ? "is-active" : "is-inactive"}">${product.active ? "Ativo" : "Inativo"}</span></td>
      <td><div class="product-actions"><button type="button" data-edit="${escapeHTML(product.id)}" aria-label="Editar ${escapeHTML(product.name)}">Editar</button><button type="button" class="delete-action" data-delete="${escapeHTML(product.id)}" aria-label="Excluir ${escapeHTML(product.name)}">Excluir</button></div></td>
    </tr>`;
  }).join("");
}

function renderPage() {
  content.innerHTML = `
    <div class="products-toolbar"><div><span class="eyebrow">CATÁLOGO DA LOJA</span><h2>Produtos</h2><p>Cadastre mercadorias, imagens, preços e controle de estoque.</p></div><button class="primary-button" id="add-product">＋ Adicionar produto</button></div>
    <section class="products-summary"><div><span class="summary-icon"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></span><span><b id="products-total">0 produto(s) cadastrado(s)</b><small>Catálogo do Mercado Jesi</small></span></div><span class="storage-mode" id="storage-mode"></span></section>
    <article class="panel products-panel"><div class="products-list-toolbar"><label class="product-search">⌕ <input id="product-search" type="search" placeholder="Buscar por nome, SKU ou categoria..."></label><button type="button" class="secondary-button" id="refresh-products">Atualizar</button></div>
      <div class="table-wrap"><table class="products-table"><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>PREÇO</th><th>ESTOQUE</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody id="products-table-body"><tr><td colspan="6" class="products-empty">Carregando produtos...</td></tr></tbody></table></div>
    </article>
    <div id="product-modal-root"></div>`;
  content.querySelector("#storage-mode").textContent = "";
  content.querySelector("#add-product").addEventListener("click", () => openForm());
  content.querySelector("#refresh-products").addEventListener("click", loadProducts);
  content.querySelector("#product-search").addEventListener("input", render);
  content.querySelector("#products-table-body").addEventListener("click", handleTableAction);
}

async function loadProducts() {
  try {
    if (supabase) {
      const { data, error } = await supabase.from("products").select("id,name,slug,description,sku,barcode,unit,price,cost_price,active,featured,category_id,categories(name),inventory(quantity,minimum_quantity),product_images(storage_path,alt_text,sort_order)").order("name");
      if (error) throw error;
      products = (data || []).map(item => ({
        ...item,
        category_name: item.categories?.name || "",
        stock: (Array.isArray(item.inventory) ? item.inventory[0] : item.inventory)?.quantity ?? 0,
        minimum_stock: (Array.isArray(item.inventory) ? item.inventory[0] : item.inventory)?.minimum_quantity ?? 0,
        storage_path: item.product_images?.sort((a,b) => a.sort_order-b.sort_order)[0]?.storage_path || "",
        local: false
      }));
      const storageMode = content.querySelector("#storage-mode");
      if (storageMode) {
        storageMode.textContent = "Sincronizado com Supabase";
      }
    } else {
      products = (await localProductsList()).map(item => ({ ...item, local: true }));
      const storageMode = content.querySelector("#storage-mode");
      if (storageMode) {
        storageMode.textContent = "Modo local · dados neste navegador";
      }
    }
    render();
  } catch (error) {
    console.error(error);
    notify(`Não foi possível carregar os produtos: ${error.message || "verifique a conexão"}`);
  }
}

async function loadCategories() {
  if (!supabase) {
    categories = ["Mercearia", "Bebidas", "Hortifruti", "Limpeza", "Higiene", "Padaria", "Laticínios", "Congelados", "Açougue", "Pet"].map(name => ({ id: slugify(name), name }));
    return categories;
  }
  const { data, error } = await supabase.from("categories").select("id,name").eq("active", true).order("sort_order");
  if (error) throw error;
  categories = data || [];
  return categories;
}

function openForm(product = null) {
  editingId = product?.id || null;
  selectedImage = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = product ? productImage(product) : null;
  const categoryOptions = categories.map(category => `<option value="${escapeHTML(category.id)}" ${product?.category_id === category.id ? "selected" : ""}>${escapeHTML(category.name)}</option>`).join("");
  const root = content.querySelector("#product-modal-root");
  root.innerHTML = `<div class="product-modal-backdrop" id="product-modal-backdrop"><section class="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
    <header class="product-modal-header"><div><span class="eyebrow">CATÁLOGO</span><h3 id="product-form-title">${product ? "Editar produto" : "Adicionar produto"}</h3></div><button type="button" class="modal-close" id="close-product-modal" aria-label="Fechar">×</button></header>
    <form id="product-form" class="product-form"><div class="product-form-grid">
      <div class="form-field field-wide"><span>Nome do produto *</span><input aria-label="Nome do produto" name="name" required maxlength="140" placeholder="Ex.: Arroz tipo 1 5kg" value="${escapeHTML(product?.name || "")}"></div>
      <div class="form-field"><span>Categoria</span><select aria-label="Categoria" name="category_id">${categoryOptions}</select></div>
      <div class="form-field"><span>Unidade de venda</span><select aria-label="Unidade de venda" name="unit">${[["un","Unidade"],["kg","Quilograma (kg)"],["g","Grama (g)"],["l","Litro (L)"],["ml","Mililitro (ml)"],["pack","Pacote" ]].map(([value,label])=>`<option value="${value}" ${(product?.unit||"un")===value?"selected":""}>${label}</option>`).join("")}</select></div>
      <div class="form-field"><span>Preço de venda (R$) *</span><input aria-label="Preço de venda em reais" name="price" type="text" inputmode="decimal" data-currency-mask="true" required placeholder="0,00" value="${product?.price ?? ""}"></div>
      <div class="form-field"><span>Preço de custo (R$)</span><input aria-label="Preço de custo em reais" name="cost_price" type="text" inputmode="decimal" data-currency-mask="true" placeholder="0,00" value="${product?.cost_price ?? ""}"></div>
      <div class="form-field"><span>Estoque atual</span><div class="number-input-wrap"><input aria-label="Estoque atual" name="stock" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-integer-stock value="${Math.max(0, Math.trunc(Number(product?.stock) || 0))}"><div class="number-input-actions"><button type="button" data-number-step="1" aria-label="Aumentar estoque atual">▲</button><button type="button" data-number-step="-1" aria-label="Diminuir estoque atual">▼</button></div></div></div>
      <div class="form-field"><span>Estoque mínimo</span><div class="number-input-wrap"><input aria-label="Estoque mínimo" name="minimum_stock" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" data-integer-stock value="${Math.max(0, Math.trunc(Number(product?.minimum_stock) || 0))}"><div class="number-input-actions"><button type="button" data-number-step="1" aria-label="Aumentar estoque mínimo">▲</button><button type="button" data-number-step="-1" aria-label="Diminuir estoque mínimo">▼</button></div></div></div>
      <div class="form-field"><span>SKU / Código interno</span><input aria-label="SKU ou código interno" name="sku" maxlength="60" placeholder="Ex.: MER-0001" value="${escapeHTML(product?.sku || "")}"></div>
      <div class="form-field"><span>Código de barras</span><input aria-label="Código de barras" name="barcode" maxlength="60" inputmode="numeric" value="${escapeHTML(product?.barcode || "")}"></div>
      <div class="form-field field-wide"><span>Descrição</span><textarea aria-label="Descrição" name="description" rows="3" maxlength="1000" placeholder="Informações sobre o produto">${escapeHTML(product?.description || "")}</textarea></div>
      <div class="form-field field-wide"><span>Imagem do produto</span><label class="image-upload" for="product-image-input"><input id="product-image-input" type="file" accept="image/jpeg,image/png,image/webp"><span class="upload-preview" id="upload-preview">${previewUrl ? `<img src="${escapeHTML(previewUrl)}" alt="Prévia da imagem">` : "＋"}</span><span><b>Selecionar imagem</b><small>JPG, PNG ou WebP · até 5 MB</small></span></label></div>
      <label class="form-check"><input name="active" type="checkbox" ${product?.active !== false ? "checked" : ""}><span>Produto ativo na loja</span></label>
      <label class="form-check"><input name="featured" type="checkbox" ${product?.featured ? "checked" : ""}><span>Destacar na vitrine</span></label>
    </div><footer class="product-form-footer"><button type="button" class="secondary-button" id="cancel-product">Cancelar</button><button type="submit" class="primary-button" id="save-product">${product ? "Salvar alterações" : "Cadastrar produto"}</button></footer></form>
  </section></div>`;
  const close = () => { root.innerHTML = ""; if (previewUrl && !selectedImage) URL.revokeObjectURL(previewUrl); previewUrl = null; };
  root.querySelector("#close-product-modal").addEventListener("click", close);
  root.querySelector("#cancel-product").addEventListener("click", close);
  // O modal só fecha pelos botões explícitos; cliques fora do formulário não descartam o cadastro.
  root.querySelector("#product-image-input").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) { notify("Use JPG, PNG ou WebP com no máximo 5 MB."); event.target.value = ""; return; }
    selectedImage = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    root.querySelector("#upload-preview").innerHTML = `<img src="${previewUrl}" alt="Prévia da imagem">`;
  });
  root.querySelectorAll(".number-input-wrap").forEach(wrapper => {
    const input = wrapper.querySelector("input[data-integer-stock]");
    wrapper.querySelectorAll("[data-number-step]").forEach(button => {
      button.addEventListener("click", () => {
        const step = Number(button.dataset.numberStep);
        const current = Number.parseInt(input.value, 10) || 0;
        input.value = String(Math.max(0, current + step));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    input.addEventListener("input", () => {
      if (input.value && !/^\d+$/.test(input.value)) {
        input.value = input.value.replace(/\D/g, "");
      }
    });
  });
  root.querySelector("#product-form").addEventListener("submit", event => saveForm(event, product, close));
  root.querySelector("[name=name]").focus();
}

async function saveForm(event, original, close) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const salePrice = parseMoneyInput(values.price);
  const costPrice = values.cost_price === "" ? null : parseMoneyInput(values.cost_price);
  if (salePrice === null) {
    notify("Informe um preço de venda válido, maior ou igual a zero. Ex.: 12,99.");
    form.elements.price.focus();
    return;
  }
  if (values.cost_price !== "" && costPrice === null) {
    notify("Informe um preço de custo válido, maior ou igual a zero.");
    form.elements.cost_price.focus();
    return;
  }
  const stockValue = values.stock === "" ? 0 : Number(values.stock);
  const minimumStockValue = values.minimum_stock === "" ? 0 : Number(values.minimum_stock);
  if (!Number.isInteger(stockValue) || stockValue < 0) {
    notify("O estoque atual deve ser um número inteiro maior ou igual a zero.");
    form.elements.stock.focus();
    return;
  }
  if (!Number.isInteger(minimumStockValue) || minimumStockValue < 0) {
    notify("O estoque mínimo deve ser um número inteiro maior ou igual a zero.");
    form.elements.minimum_stock.focus();
    return;
  }
  const submit = form.querySelector("#save-product");
  submit.disabled = true;
  submit.textContent = "Salvando...";
  const imageFile = selectedImage;
  const category = categories.find(item => item.id === values.category_id);
  const product = {
    name: values.name.trim(), slug: original?.slug || `${slugify(values.name)}-${crypto.randomUUID().slice(0,8)}`,
    description: values.description.trim() || null, category_id: values.category_id || null,
    sku: values.sku.trim() || null, barcode: values.barcode.trim() || null,
    unit: values.unit, price: salePrice, cost_price: costPrice,
    active: form.elements.active.checked, featured: form.elements.featured.checked
  };
  try {
    if (supabase) {
      let saved;
      if (original) {
        const { data, error } = await supabase.from("products").update(product).eq("id", original.id).select("id").single();
        if (error) throw error;
        saved = data;
      } else {
        const { data, error } = await supabase.from("products").insert(product).select("id").single();
        if (error) throw error;
        saved = data;
      }
      if (imageFile) {
        const { data: oldImages } = await supabase.from("product_images").select("storage_path").eq("product_id", saved.id);
        if (oldImages?.length) {
          await supabase.storage.from("product-images").remove(oldImages.map(item => item.storage_path));
          const { error: removeError } = await supabase.from("product_images").delete().eq("product_id", saved.id);
          if (removeError) throw removeError;
        }
        const extension = imageFile.name.split(".").pop().toLowerCase();
        const path = `${saved.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("product-images").upload(path, imageFile, { upsert: false, contentType: imageFile.type });
        if (uploadError) throw uploadError;
        const { error: imageError } = await supabase.from("product_images").insert({ product_id: saved.id, storage_path: path, alt_text: product.name, sort_order: 0 });
        if (imageError) throw imageError;
      }
      const { error: stockError } = await supabase.from("inventory").upsert({ product_id: saved.id, quantity: Number(values.stock || 0), minimum_quantity: Number(values.minimum_stock || 0) }, { onConflict: "product_id" });
      if (stockError) throw stockError;
    } else {
      const localProduct = {
        id: original?.id || crypto.randomUUID(), ...product,
        category_name: category?.name || original?.category_name || "",
        stock: Number(values.stock || 0), minimum_stock: Number(values.minimum_stock || 0),
        image: imageFile || original?.image || null, local: true
      };
      await localProductSave(localProduct);
    }
    close();
    notify(original ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
    await loadProducts();
  } catch (error) {
    console.error(error);
    notify(`Erro ao salvar: ${error.message || "tente novamente"}`);
    submit.disabled = false;
    submit.textContent = original ? "Salvar alterações" : "Cadastrar produto";
  }
}

async function handleTableAction(event) {
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-delete]");
  if (edit) {
    const product = products.find(item => item.id === edit.dataset.edit);
    if (product) openForm(product);
  }
  if (remove) {
    const product = products.find(item => item.id === remove.dataset.delete);
    if (!product || !confirm(`Excluir o produto “${product.name}”? Essa ação não pode ser desfeita.`)) return;
    try {
      if (supabase) {
        const { error } = await supabase.from("products").delete().eq("id", product.id);
        if (error) throw error;
      } else {
        await localProductDelete(product.id);
      }
      notify("Produto excluído.");
      await loadProducts();
    } catch (error) { notify(`Não foi possível excluir: ${error.message || "erro"}`); }
  }
}

export async function mountProductsAdmin() {
  renderPage();
  try { await loadCategories(); } catch (error) { console.error(error); notify("Não foi possível carregar categorias. Você ainda pode cadastrar sem categoria."); }
  await loadProducts();
}
