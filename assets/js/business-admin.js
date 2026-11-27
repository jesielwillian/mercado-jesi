
import { supabase } from "./supabase.js";
import { translateErrorMessage } from "./error-translations.js";

const money = (v) => Number(v || 0).toLocaleString("pt-BR", {
  style: "currency", currency: "BRL"
});

const date = (v) => v ? new Date(v).toLocaleDateString("pt-BR") : "—";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[c]));

const css = `
.business-admin{display:grid;gap:18px;color:var(--text,#f4f5f7)}
.ba-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.ba-head h2{font-size:20px;margin:0}
.ba-muted{font-size:13px;color:var(--muted,#9298a6)}
.ba-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.ba-card,.ba-panel{min-width:0;padding:18px;border:1px solid var(--border,rgba(255,255,255,.08));border-radius:13px;background:var(--card,#11141d)}
.ba-card small{display:block;color:var(--muted,#9298a6);margin-bottom:9px}
.ba-card strong{font-size:clamp(18px,2vw,25px);overflow-wrap:anywhere}
.ba-panel h3{font-size:15px;margin:0 0 14px}
.ba-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ba-form label{display:grid;gap:6px;font-size:12px;color:var(--muted,#9298a6)}
.ba-form input,.ba-form select,.ba-form textarea{width:100%;min-height:42px;padding:10px 11px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:8px;background:var(--input,#0b0e15);color:var(--text,#f4f5f7);font:inherit}
.ba-form textarea{min-height:80px;resize:vertical}
.ba-form .wide{grid-column:1/-1}
.ba-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
.ba-btn{min-height:36px;padding:8px 12px;border:0;border-radius:8px;background:var(--accent,#d9a441);color:#17130a;font-weight:700;cursor:pointer}
.ba-btn.secondary{background:rgba(255,255,255,.09);color:var(--text,#f4f5f7)}
.ba-btn.danger{background:#a93242;color:white}
.ba-btn:disabled{opacity:.55;cursor:wait}
.ba-table-wrap{overflow-x:auto}
.ba-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:13px}
.ba-table th,.ba-table td{padding:11px 9px;text-align:left;border-bottom:1px solid var(--border,rgba(255,255,255,.07))}
.ba-table th{font-size:11px;color:var(--muted,#9298a6)}
.ba-empty{padding:22px;text-align:center;color:var(--muted,#9298a6);font-size:13px}
.ba-status{display:inline-block;padding:4px 8px;border-radius:20px;background:rgba(34,197,94,.12);color:#4ade80;font-size:11px}
.ba-status.off{background:rgba(148,163,184,.12);color:#aeb7c5}
.ba-note{font-size:12px;line-height:1.5;color:var(--muted,#9298a6)}
@media(max-width:850px){.ba-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.ba-grid{grid-template-columns:1fr}.ba-form{grid-template-columns:1fr}.ba-form .wide{grid-column:auto}.ba-card,.ba-panel{padding:14px}}
`;

function setup(content, title, notify) {
  let style = document.querySelector("#business-admin-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "business-admin-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }
  content.innerHTML = `<section class="business-admin"><div class="ba-head"><h2>${title}</h2><span class="ba-muted">Dados conectados ao Supabase</span></div><div class="ba-panel ba-empty">Carregando...</div></section>`;
  return content.querySelector(".business-admin");
}

function errorView(root, error, retry) {
  console.error(error);
  root.innerHTML = `<div class="ba-panel"><h3>Não foi possível carregar os dados</h3><p class="ba-note">${esc(translateErrorMessage(error?.message, "Verifique sua conexão e as permissões no Supabase."))}</p><button class="ba-btn secondary" data-action="retry">Tentar novamente</button></div>`;
  root.querySelector('[data-action="retry"]')?.addEventListener("click", retry);
}

function table(headers, rows, empty = "Nenhum registro encontrado.") {
  return `<div class="ba-table-wrap"><table class="ba-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}"><div class="ba-empty">${empty}</div></td></tr>`}</tbody></table></div>`;
}

function field(label, name, value="", type="text", extra="") {
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}

function localDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Aceita valores digitados em pt-BR (1.234,56) ou formato decimal (1234.56).
function parseCouponValue(raw) {
  let value = String(raw ?? "").trim().replace(/\s|R\$/gi, "");
  if (!value) return NaN;
  if (value.includes(",") && value.includes(".")) {
    value = value.lastIndexOf(",") > value.lastIndexOf(".")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  } else if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : NaN;
}

/* CUpons e ofertas */
export function mountCouponsAdmin({content, notify}) {
  const root = setup(content, "Cupons e ofertas", notify);
  let records = [];

  async function load() {
    const {data, error} = await supabase.from("coupons")
      .select("*").order("created_at", {ascending:false});
    if (error) throw error;
    records = data || [];
    render();
  }

  function render() {
    root.innerHTML = `
      <div class="ba-head"><h2>Cupons e ofertas</h2><span class="ba-muted">${records.length} cupons cadastrados</span></div>
      <section class="ba-panel">
        <h3 id="coupon-form-title">Cadastrar cupom</h3>
        <form class="ba-form" data-form="coupon">
          <input type="hidden" name="id">
          ${field("Código","code","","text",'required maxlength="40"')}
          <label>Tipo de desconto<select name="discount_type"><option value="percentage">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></select></label>
          ${field("Valor do desconto","discount_value","","text",'required inputmode="decimal" data-currency-mask="true" placeholder="Ex.: 10,00"')}
          ${field("Início da validade","starts_at","","datetime-local")}
          ${field("Fim da validade","expires_at","","datetime-local")}
          ${field("Limite de utilizações","usage_limit","","number",'min="1" step="1"')}
          <label class="wide"><span><input type="checkbox" name="active" checked style="width:auto;min-height:auto"> Cupom ativo</span></label>
          <div class="ba-actions wide"><button class="ba-btn" type="submit">Salvar cupom</button><button class="ba-btn secondary" type="button" data-action="clear">Limpar</button></div>
        </form>
      </section>
      <section class="ba-panel"><h3>Cupons cadastrados</h3>
        ${table(["Código","Desconto","Utilizações","Validade","Status","Ações"], records.map(c=>`
          <tr>
            <td><strong>${esc(c.code)}</strong></td>
            <td>${c.discount_type==="percentage" ? `${Number(c.discount_value)}%` : money(c.discount_value)}</td>
            <td>${Number(c.usage_count||0)} / ${c.usage_limit ?? "∞"}</td>
            <td>${date(c.starts_at)} — ${date(c.expires_at)}</td>
            <td><span class="ba-status ${c.active?"":"off"}">${c.active?"Ativo":"Inativo"}</span></td>
            <td><div class="ba-actions">
              <button class="ba-btn secondary" data-edit="${c.id}">Editar</button>
              <button class="ba-btn secondary" data-toggle="${c.id}">${c.active?"Desativar":"Ativar"}</button>
              <button class="ba-btn danger" data-delete="${c.id}">Excluir</button>
            </div></td>
          </tr>`).join(""))}
      </section>`;
    root.querySelector('[data-action="clear"]').addEventListener("click", clearForm);
    root.querySelector('[data-form="coupon"]').addEventListener("submit", save);
  }

  root.addEventListener("click", actions);

  function clearForm() {
    const form = root.querySelector('[data-form="coupon"]');
    if (!form) return;
    form.reset();
    form.elements.id.value = "";
    form.elements.active.checked = true;
    root.querySelector("#coupon-form-title").textContent = "Cadastrar cupom";
  }

  function actions(event) {
    const edit = event.target.closest("[data-edit]");
    const toggle = event.target.closest("[data-toggle]");
    const del = event.target.closest("[data-delete]");
    if (edit) {
      const c = records.find(x=>x.id===edit.dataset.edit);
      if (!c) return;
      const f = root.querySelector('[data-form="coupon"]');
      f.elements.id.value = c.id;
      f.elements.code.value = c.code;
      f.elements.discount_type.value = c.discount_type;
      f.elements.discount_value.value = c.discount_value;
      f.elements.starts_at.value = localDateTime(c.starts_at);
      f.elements.expires_at.value = localDateTime(c.expires_at);
      f.elements.usage_limit.value = c.usage_limit ?? "";
      f.elements.active.checked = c.active;
      root.querySelector("#coupon-form-title").textContent = "Editar cupom";
      f.scrollIntoView({behavior:"smooth",block:"start"});
    }
    if (toggle) changeStatus(toggle.dataset.toggle);
    if (del) remove(del.dataset.delete);
  }

  async function save(event) {
    event.preventDefault();
    const f = event.currentTarget;
    const submit = f.querySelector('[type="submit"]');
    if (submit?.disabled) return;

    const v = new FormData(f);
    const code = String(v.get("code") || "").trim().toUpperCase().replace(/\s+/g, "");
    const type = String(v.get("discount_type") || "");
    // Lê diretamente o campo para não depender da ordem da máscara global.
    const value = parseCouponValue(f.elements.discount_value.value);
    const limitRaw = String(v.get("usage_limit") || "").trim();
    const limit = limitRaw ? Number(limitRaw) : null;
    const start = String(v.get("starts_at") || "").trim();
    const end = String(v.get("expires_at") || "").trim();

    if (!code || !/^[A-Z0-9_-]{2,40}$/.test(code)) {
      notify("Informe um código de 2 a 40 caracteres (letras, números, hífen ou sublinhado).");
      f.elements.code.focus();
      return;
    }
    if (!['percentage', 'fixed'].includes(type) || !Number.isFinite(value) || value <= 0 || (type === 'percentage' && value > 100)) {
      notify(type === 'percentage'
        ? "Informe um desconto percentual entre 0,01% e 100%."
        : "Informe um valor de desconto válido, maior que zero.");
      f.elements.discount_value.focus();
      return;
    }
    if (limitRaw && (!Number.isSafeInteger(limit) || limit < 1)) {
      notify("O limite de utilizações deve ser um número inteiro maior que zero.");
      f.elements.usage_limit.focus();
      return;
    }
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
      notify("Confira as datas de validade do cupom.");
      return;
    }
    if (startDate && endDate && endDate <= startDate) {
      notify("A data final deve ser posterior à data inicial.");
      f.elements.expires_at.focus();
      return;
    }

    const payload = {
      code,
      discount_type: type,
      discount_value: value,
      starts_at: startDate ? startDate.toISOString() : null,
      expires_at: endDate ? endDate.toISOString() : null,
      usage_limit: limit,
      active: f.elements.active.checked
    };
    const id = String(v.get("id") || "").trim();

    try {
      if (submit) {
        submit.disabled = true;
        submit.textContent = id ? "Salvando alterações..." : "Cadastrando...";
      }
      const result = id
        ? await supabase.from("coupons").update(payload).eq("id", id)
        : await supabase.from("coupons").insert(payload);
      if (result.error) {
        const message = result.error.code === "23505"
          ? "Já existe um cupom com esse código. Escolha outro código."
          : translateErrorMessage(result.error.message, "Não foi possível salvar o cupom. Verifique os dados e as permissões.");
        notify(message);
        return;
      }
      notify("Cupom salvo com sucesso.");
      await load();
    } catch (error) {
      console.error("Erro ao salvar cupom:", error);
      notify(translateErrorMessage(error?.message, "Falha de conexão ao salvar o cupom. Tente novamente."));
    } finally {
      if (submit?.isConnected) {
        submit.disabled = false;
        submit.textContent = "Salvar cupom";
      }
    }
  }

  async function changeStatus(id) {
    const c = records.find(x=>x.id===id);
    if (!c) return;
    const {error} = await supabase.from("coupons").update({active:!c.active}).eq("id",id);
    if (error) return notify(error.message);
    notify("Status atualizado.");
    await load();
  }

  async function remove(id) {
    if (!confirm("Excluir este cupom?")) return;
    const {error} = await supabase.from("coupons").delete().eq("id",id);
    if (error) return notify(error.message);
    notify("Cupom excluído.");
    await load();
  }

  load().catch(e=>errorView(root,e,()=>load().catch(x=>errorView(root,x,load))));
}

/* FINANCEIRO */
export function mountFinanceAdmin({content, notify}) {
  const root = setup(content, "Financeiro", notify);
  let expenseRecords = [];

  async function load() {
    const now = new Date();
    const start = new Date(now.getFullYear(),now.getMonth(),1).toISOString();
    const end = new Date(now.getFullYear(),now.getMonth()+1,1).toISOString();

    const [payments, expenses] = await Promise.all([
      supabase.from("payments").select("id,amount,status,method,paid_at,created_at")
        .eq("status","paid").gte("paid_at",start).lt("paid_at",end).order("paid_at",{ascending:false}),
      supabase.from("expenses").select("*").gte("created_at",start).lt("created_at",end).order("created_at",{ascending:false})
    ]);
    if (payments.error) throw payments.error;
    if (expenses.error) throw expenses.error;

    expenseRecords = expenses.data || [];

    const income = (payments.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
    const costs = (expenses.data||[]).reduce((s,x)=>s+Number(x.amount||0),0);
    const rows = (expenses.data||[]).map(x=>`
      <tr><td>${esc(x.description)}</td><td>${esc(x.category||"—")}</td><td>${date(x.due_date)}</td><td>${x.paid_at?date(x.paid_at):"Pendente"}</td><td>${money(x.amount)}</td><td><button class="ba-btn secondary" data-paid="${x.id}">${x.paid_at?"Reabrir":"Marcar paga"}</button> <button class="ba-btn danger" data-delete="${x.id}">Excluir</button></td></tr>
    `).join("");

    root.innerHTML = `
      <div class="ba-head"><h2>Financeiro</h2><span class="ba-muted">Resumo do mês atual</span></div>
      <div class="ba-grid">
        <article class="ba-card"><small>Receitas confirmadas</small><strong>${money(income)}</strong></article>
        <article class="ba-card"><small>Despesas cadastradas</small><strong>${money(costs)}</strong></article>
        <article class="ba-card"><small>Resultado do período</small><strong>${money(income-costs)}</strong></article>
      </div>
      <section class="ba-panel"><h3>Registrar despesa</h3>
        <form class="ba-form" data-form="expense">
          ${field("Descrição","description","","text",'required maxlength="180"')}
          ${field("Categoria","category","","text",'maxlength="80"')}
          ${field("Valor (R$)","amount","","number",'required min="0.01" step="0.01"')}
          ${field("Vencimento","due_date","","date")}
          <div class="ba-actions wide"><button class="ba-btn" type="submit">Cadastrar despesa</button></div>
        </form>
      </section>
      <section class="ba-panel"><h3>Despesas do mês</h3>
        ${table(["Descrição","Categoria","Vencimento","Pagamento","Valor","Ações"],rows)}
      </section>
      <section class="ba-panel"><h3>Pagamentos recebidos no mês</h3>
        <p class="ba-note">Somente pagamentos com status confirmado são contabilizados. As vendas e movimentações do caixa não são alteradas por este módulo.</p>
        ${table(["Data","Forma","Valor"],(payments.data||[]).map(p=>`<tr><td>${date(p.paid_at)}</td><td>${esc(p.method)}</td><td>${money(p.amount)}</td></tr>`).join(""))}
      </section>`;

    root.querySelector('[data-form="expense"]').addEventListener("submit",async e=>{
      e.preventDefault();
      const v = new FormData(e.currentTarget);
      const amount = Number(v.get("amount"));
      const description = String(v.get("description")||"").trim();
      if (!description || !Number.isFinite(amount) || amount<=0) return notify("Informe descrição e valor válidos.");
      const {data:{user}} = await supabase.auth.getUser();
      const {error} = await supabase.from("expenses").insert({
        description, category:String(v.get("category")||"").trim()||null,
        amount, due_date:v.get("due_date")||null, created_by:user?.id
      });
      if (error) return notify(error.message);
      notify("Despesa cadastrada.");
      await load();
    });

  }

  root.addEventListener("click", async e => {
    const paid = e.target.closest("[data-paid]");
    const del = e.target.closest("[data-delete]");

    if (paid) {
      const row = expenseRecords.find(x => x.id === paid.dataset.paid);
      if (!row) return;
      const {error} = await supabase.from("expenses")
        .update({paid_at: row.paid_at ? null : new Date().toISOString()})
        .eq("id", row.id);
      if (error) return notify(error.message);
      notify("Despesa atualizada.");
      await load();
      return;
    }

    if (del) {
      if (!confirm("Excluir esta despesa?")) return;
      const {error} = await supabase.from("expenses").delete().eq("id", del.dataset.delete);
      if (error) return notify(error.message);
      notify("Despesa excluída.");
      await load();
    }
  });

  load().catch(e=>errorView(root,e,()=>load().catch(x=>errorView(root,x,load))));
}

/* RELATÓRIOS */
export function mountReportsAdmin({content, notify}) {
  const root = setup(content, "Relatórios", notify);

  async function load(from,to) {
    const start = from ? new Date(`${from}T00:00:00`).toISOString() : new Date(Date.now()-30*86400000).toISOString();
    const finish = to ? new Date(`${to}T23:59:59.999`).toISOString() : new Date().toISOString();
    if (new Date(start)>new Date(finish)) throw new Error("O período inicial deve ser anterior ao final.");

    const {data: inventoryData, error: inventoryError} = await supabase
      .from("inventory")
      .select("quantity,minimum_quantity,products(name,sku)")
      .limit(2000);
    if (inventoryError) throw inventoryError;

    const list = [];
    for (let offset = 0; ; offset += 1000) {
      const {data, error} = await supabase.from("orders")
        .select("id,order_number,status,total,created_at,customer_name")
        .gte("created_at", start)
        .lte("created_at", finish)
        .order("created_at", {ascending:false})
        .range(offset, offset + 999);
      if (error) throw error;
      list.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const products = [];
    for (let i = 0; i < list.length; i += 100) {
      const ids = list.slice(i, i + 100).map(order => order.id);
      for (let offset = 0; ids.length; offset += 1000) {
        const {data, error} = await supabase.from("order_items")
          .select("product_name,quantity,line_total,order_id")
          .in("order_id", ids)
          .range(offset, offset + 999);
        if (error) throw error;
        products.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
    }
    const total=list.reduce((s,o)=>s+Number(o.total||0),0);
    const completed=list.filter(o=>o.status==="completed").length;
    const reportStatusLabels={
      pending:"Pendente",
      confirmed:"Confirmado",
      preparing:"Em preparação",
      ready:"Pronto para retirada",
      out_for_delivery:"Saiu para entrega",
      completed:"Concluído",
      cancelled:"Cancelado",
      failed:"Falhou",
      paid:"Pago",
      refunded:"Estornado",
      processing:"Em processamento",
      shipped:"Enviado",
      delivered:"Entregue"
    };
    const counts={};
    for(const item of products){
      const key=item.product_name||"Produto";
      counts[key]=(counts[key]||0)+Number(item.quantity||0);
    }
    const best=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const low=(inventoryData||[]).filter(x=>Number(x.quantity)<=Number(x.minimum_quantity));

    root.innerHTML=`
      <div class="ba-head"><h2>Relatórios</h2><span class="ba-muted">Período selecionado</span></div>
      <section class="ba-panel"><form class="ba-form" data-form="period">
        ${field("Data inicial","from",from||"","date")}
        ${field("Data final","to",to||"","date")}
        <div class="ba-actions wide"><button class="ba-btn" type="submit">Aplicar período</button></div>
      </form></section>
      <div class="ba-grid">
        <article class="ba-card"><small>Pedidos no período</small><strong>${list.length}</strong></article>
        <article class="ba-card"><small>Valor total dos pedidos</small><strong>${money(total)}</strong></article>
        <article class="ba-card"><small>Pedidos concluídos</small><strong>${completed}</strong></article>
      </div>
      <section class="ba-panel"><h3>Produtos mais vendidos</h3>
        ${table(["Produto","Quantidade"],best.map(([name,qty])=>`<tr><td>${esc(name)}</td><td>${qty}</td></tr>`).join(""))}
      </section>
      <section class="ba-panel"><h3>Pedidos recentes do período</h3>
        ${table(["Pedido","Cliente","Data","Status","Total"],list.slice(0,100).map(o=>`<tr><td>#${o.order_number}</td><td>${esc(o.customer_name)}</td><td>${date(o.created_at)}</td><td>${esc(reportStatusLabels[o.status]||"Não identificado")}</td><td>${money(o.total)}</td></tr>`).join(""))}
      </section>
      <section class="ba-panel"><h3>Estoque no limite ou abaixo do mínimo</h3>
        ${table(["Produto","SKU","Saldo","Mínimo"],low.map(x=>`<tr><td>${esc(x.products?.name||"Produto")}</td><td>${esc(x.products?.sku||"—")}</td><td>${x.quantity}</td><td>${x.minimum_quantity}</td></tr>`).join(""))}
      </section>`;
    root.querySelector('[data-form="period"]').addEventListener("submit",e=>{
      e.preventDefault();
      const v=new FormData(e.currentTarget);
      load(v.get("from"),v.get("to")).catch(err=>notify(err.message));
    });
  }
  const today=new Date();
  const from=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10);
  load(from,today.toISOString().slice(0,10)).catch(e=>errorView(root,e,()=>load(from,today.toISOString().slice(0,10))));
}

/* USUÁRIOS E PERMISSÕES */
export function mountUsersAdmin({content, notify}) {
  const root=setup(content,"Usuários e permissões",notify);
  let currentUserId=null;
  let currentAuthUser=null;
  let records=[];

  async function load(){
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError)throw userError;
    currentAuthUser=user||null;
    currentUserId=user?.id;
    const {data,error}=await supabase.from("profiles")
      .select("id,full_name,phone,role,active,created_at")
      .order("created_at",{ascending:false}).limit(500);
    if(error)throw error;
    records=data||[];
    render();
  }

  function render(){
    const ownProfile=records.find(u=>u.id===currentUserId);
    const ownName=String(ownProfile?.full_name||"").trim();
    const ownPhone=String(ownProfile?.phone||currentAuthUser?.phone||"").trim();
    const email=currentAuthUser?.email||"";
    root.innerHTML=`
      <div class="ba-head"><h2>Usuários e permissões</h2><span class="ba-muted">${records.length} perfis</span></div>
      <section class="ba-panel">
        <div class="ba-head" style="margin-bottom:12px"><div><h3 style="margin:0 0 5px">Equipe e permissões</h3><p class="ba-note" style="margin:0">Defina o nível de acesso de cada pessoa. Proprietário e Administrador gerenciam usuários; os demais perfis acessam as rotinas operacionais.</p></div><button class="ba-btn primary" type="button" data-open-create><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Adicionar usuário</button></div>
        <div data-create-panel hidden style="margin:0 0 18px;padding:16px;border:1px solid var(--ba-border,#e5e7eb);border-radius:12px">
          <div class="ba-head" style="margin-bottom:12px"><strong>Novo usuário da equipe</strong><button class="ba-btn secondary" type="button" data-close-create aria-label="Fechar">Fechar</button></div>
          <form class="ba-form" data-form="create-user">
            <label class="ba-field"><span>Nome completo</span><input name="full_name" maxlength="120" autocomplete="name" required placeholder="Nome do funcionário"></label>
            <label class="ba-field"><span>E-mail de acesso</span><input name="email" type="email" maxlength="254" autocomplete="email" required placeholder="pessoa@email.com"></label>
            <label class="ba-field"><span>Telefone</span><input name="phone" type="tel" maxlength="20" autocomplete="tel" placeholder="(00) 00000-0000"></label>
            <label class="ba-field"><span>Senha inicial</span><input name="password" type="password" minlength="8" autocomplete="new-password" required placeholder="Mínimo de 8 caracteres"></label>
            <label class="ba-field"><span>Função</span><select name="role" required><option value="manager">Gerente</option><option value="employee">Funcionário</option><option value="operator">Operador / Caixa</option><option value="delivery">Entregador</option><option value="customer">Cliente</option><option value="admin">Administrador</option><option value="owner">Proprietário</option></select></label>
            <div class="ba-actions" style="align-self:end"><button class="ba-btn primary" type="submit">Criar usuário</button></div>
            <p class="ba-note wide" style="margin:0">A conta será criada no Supabase. Informe a senha inicial à pessoa por um canal seguro. Somente um Proprietário pode criar outro Proprietário.</p>
          </form>
        </div>
        <form class="ba-form" data-form="own-profile" style="margin:0 0 22px;padding:16px;border:1px solid var(--ba-border, #e5e7eb);border-radius:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px">
            <strong>Seus dados de perfil</strong><span class="ba-muted" style="font-size:12px">Complete seu nome e telefone para exibi-los na equipe.</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px">
            <label class="ba-field"><span>Nome completo</span><input name="full_name" type="text" maxlength="120" autocomplete="name" placeholder="Digite seu nome" value="${esc(ownName)}" required></label>
            <label class="ba-field"><span>Telefone</span><input name="phone" type="tel" maxlength="20" autocomplete="tel" placeholder="(00) 00000-0000" value="${esc(ownPhone)}"></label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px">
            <span class="ba-muted" style="font-size:12px">E-mail da conta: ${esc(email||"não disponível")}</span>
            <button class="ba-btn primary" type="submit">Salvar meus dados</button>
          </div>
        </form>
        ${table(["Nome","Telefone","Função","Status","Cadastro","Ações"],records.map(u=>{
          const isSelf=u.id===currentUserId;
          const displayName=String(u.full_name||"").trim()||(isSelf?(email||"Conta principal"):"Nome não informado");
          const displayPhone=String(u.phone||"").trim()||(isSelf?String(currentAuthUser?.phone||"").trim():"");
          return `
          <tr>
            <td>${esc(displayName)}</td><td>${esc(displayPhone||"Não informado")}</td>
            <td><select data-role="${u.id}" ${isSelf?'title="Alterar sua própria função pode remover seu acesso ao painel"':""}>
              ${[["owner","Proprietário"],["admin","Administrador"],["manager","Gerente"],["employee","Funcionário"],["operator","Operador / Caixa"],["delivery","Entregador"],["customer","Cliente"]].map(([value,label])=>`<option value="${value}" ${u.role===value?"selected":""}>${label}</option>`).join("")}
            </select>${isSelf?'<small class="ba-muted" style="display:block;margin-top:4px">Sua conta • alteração com confirmação</small>':""}</td>
            <td><span class="ba-status ${u.active?"":"off"}">${u.active?"Ativo":"Inativo"}</span></td>
            <td>${date(u.created_at)}</td>
            <td><button class="ba-btn secondary" data-active="${u.id}" ${isSelf?"disabled":""}>${u.active?"Desativar":"Ativar"}</button></td>
          </tr>`;
        }).join(""))}
      </section>`;

    root.querySelector('[data-form="own-profile"]').addEventListener("submit",async e=>{
      e.preventDefault();
      const form=new FormData(e.currentTarget);
      const full_name=String(form.get("full_name")||"").trim();
      const phone=String(form.get("phone")||"").trim();
      if(full_name.length<2){notify("Informe seu nome completo.");return;}
      const saveButton=e.currentTarget.querySelector('button[type="submit"]');
      saveButton.disabled=true;
      const {error}=await supabase.rpc("update_my_profile",{p_full_name:full_name,p_phone:phone||null});
      saveButton.disabled=false;
      if(error){notify(error.message);return;}
      notify("Seus dados foram atualizados.");
      await load();
    });

    root.querySelector("[data-open-create]")?.addEventListener("click",()=>{
      const panel=root.querySelector("[data-create-panel]");
      panel.hidden=false;
      panel.querySelector('input[name="full_name"]')?.focus();
    });
    root.querySelector("[data-close-create]")?.addEventListener("click",()=>{
      root.querySelector("[data-create-panel]").hidden=true;
    });
    root.querySelector('[data-form="create-user"]')?.addEventListener("submit",async e=>{
      e.preventDefault();
      const form=e.currentTarget;
      const values=new FormData(form);
      const payload={
        full_name:String(values.get("full_name")||"").trim(),
        email:String(values.get("email")||"").trim().toLowerCase(),
        phone:String(values.get("phone")||"").trim(),
        password:String(values.get("password")||""),
        role:String(values.get("role")||"employee")
      };
      if(payload.full_name.length<2){notify("Informe o nome completo.");return;}
      if(payload.password.length<8){notify("A senha inicial precisa ter pelo menos 8 caracteres.");return;}
      const submit=form.querySelector('button[type="submit"]');
      submit.disabled=true;
      const {data,error}=await supabase.functions.invoke("create-staff-user",{body:payload});
      submit.disabled=false;
      if(error){notify(data?.error||error.message||"Não foi possível criar o usuário.");return;}
      notify("Usuário criado com sucesso.");
      await load();
    });

    root.querySelectorAll("[data-role]").forEach(select=>select.addEventListener("change",async()=>{
      const id=select.dataset.role;
      const selectedRole=select.value;
      const target=records.find(u=>u.id===id);
      if(!target){await load();return;}
      const roleLabel={
        owner:"Proprietário",admin:"Administrador",manager:"Gerente",
        employee:"Funcionário",operator:"Operador / Caixa",
        delivery:"Entregador",customer:"Cliente"
      }[selectedRole]||selectedRole;
      const warning=id===currentUserId
        ? `ATENÇÃO: você está alterando a função da sua própria conta para "${roleLabel}".\\n\\nSe escolher Gerente, Funcionário, Operador, Entregador ou Cliente, poderá perder o acesso a este painel e talvez precise de outro administrador para recuperá-lo.\\n\\nDeseja continuar?`
        : `Alterar a função de ${target.full_name||"este usuário"} para ${roleLabel}?`;
      if(!confirm(warning)){await load();return;}
      const {error}=await supabase.from("profiles").update({role:select.value}).eq("id",id);
      if(error){notify(error.message);await load();return;}
      notify("Permissão atualizada.");
      await load();
    }));
  }

  root.addEventListener("click", async e => {
    const btn = e.target.closest("[data-active]");
    if (!btn) return;
    const u = records.find(x => x.id === btn.dataset.active);
    if (!u || u.id === currentUserId) return;
    if (!confirm(`${u.active ? "Desativar" : "Ativar"} este perfil?`)) return;

    const {error} = await supabase.from("profiles")
      .update({active: !u.active})
      .eq("id", u.id);
    if (error) return notify(error.message);
    notify("Status atualizado.");
    await load();
  });

  load().catch(e=>errorView(root,e,()=>load().catch(x=>errorView(root,x,load))));
}

/* CONFIGURAÇÕES DA LOJA */
export function mountSettingsAdmin({content, notify}) {
  const root=setup(content,"Configurações",notify);

  async function load(){
    const {data,error}=await supabase.from("store_settings").select("*").eq("id",true).maybeSingle();
    if(error)throw error;
    const s=data||{};
    root.innerHTML=`
      <div class="ba-head"><h2>Configurações da loja</h2><span class="ba-muted">Informações institucionais e entrega</span></div>
      <section class="ba-panel"><form class="ba-form" data-form="settings">
        ${field("Nome da loja","store_name",s.store_name||"Mercado Jesi")}
        ${field("CNPJ / documento","document",s.document||"")}
        ${field("E-mail","email",s.email||"","email")}
        ${field("Telefone","phone",s.phone||"")}
        ${field("WhatsApp","whatsapp",s.whatsapp||"")}
        ${field("Endereço","address",s.address||"")}
        <label class="wide">Horário de funcionamento<textarea name="opening_hours">${esc(s.opening_hours||"")}</textarea></label>
        ${field("Taxa de entrega (R$)","delivery_fee",s.delivery_fee??0,"number",'min="0" step="0.01"')}
        ${field("Valor mínimo para frete grátis (R$)","free_delivery_minimum",s.free_delivery_minimum??0,"number",'min="0" step="0.01"')}
        <label><span><input type="checkbox" name="delivery_enabled" ${s.delivery_enabled===false?"":"checked"} style="width:auto;min-height:auto"> Entrega habilitada</span></label>
        <label><span><input type="checkbox" name="pickup_enabled" ${s.pickup_enabled===false?"":"checked"} style="width:auto;min-height:auto"> Retirada habilitada</span></label>
        <div class="ba-actions wide"><button class="ba-btn" type="submit">Salvar configurações</button></div>
      </form></section>`;
    root.querySelector('[data-form="settings"]').addEventListener("submit",async e=>{
      e.preventDefault();
      const f=e.currentTarget;
      const v=new FormData(f);
      const fee=Number(v.get("delivery_fee"));
      const minimum=Number(v.get("free_delivery_minimum"));
      if(!String(v.get("store_name")||"").trim()||!Number.isFinite(fee)||fee<0||!Number.isFinite(minimum)||minimum<0)return notify("Confira o nome e os valores informados.");
      const {data:{user}}=await supabase.auth.getUser();
      const payload={
        id:true,store_name:String(v.get("store_name")).trim(),
        document:String(v.get("document")||"").trim()||null,
        email:String(v.get("email")||"").trim()||null,
        phone:String(v.get("phone")||"").trim()||null,
        whatsapp:String(v.get("whatsapp")||"").trim()||null,
        address:String(v.get("address")||"").trim()||null,
        opening_hours:String(v.get("opening_hours")||"").trim()||null,
        delivery_fee:fee,free_delivery_minimum:minimum,
        delivery_enabled:f.elements.delivery_enabled.checked,
        pickup_enabled:f.elements.pickup_enabled.checked,
        updated_by:user?.id,updated_at:new Date().toISOString()
      };
      const {error}=await supabase.from("store_settings").upsert(payload,{onConflict:"id"});
      if(error)return notify(error.message);
      notify("Configurações salvas.");
    });
  }
  load().catch(e=>errorView(root,e,()=>load().catch(x=>errorView(root,x,load))));
}
