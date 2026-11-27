import { supabase } from "./supabase.js";
import { translateErrorMessage } from "./error-translations.js";

const money = (value) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

// Converte valores digitados no padrão brasileiro (100,00 / 1.000,00)
// e também aceita o padrão decimal com ponto (100.00).
const parseMoney = (value) => {
  let raw = String(value ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!raw) return Number.NaN;

  if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    raw = raw.replace(/\./g, "");
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return Number.NaN;
  return Number(raw);
};

const dateTime = (value) =>
  value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const styles = `
  .cash-admin{display:grid;gap:22px;color:var(--text,#f4f5f7)}
  .cash-header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap}
  .cash-header h2{font-size:20px;margin:0 0 5px}
  .cash-muted{color:var(--muted,#9298a6);font-size:13px}
  .cash-status{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:30px;background:rgba(34,197,94,.12);color:#4ade80;font-size:12px;font-weight:700}
  .cash-status.closed{background:rgba(148,163,184,.12);color:#aeb7c5}
  .cash-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
  .cash-card,.cash-panel{background:var(--card,#11141d);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:14px;padding:18px;min-width:0}
  .cash-card small{display:block;color:var(--muted,#9298a6);font-size:12px;margin-bottom:10px}
  .cash-card strong{font-size:clamp(17px,2vw,23px);font-weight:750;overflow-wrap:anywhere}
  .cash-panel h3{font-size:15px;margin:0 0 16px}
  .cash-columns{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:16px}
  .cash-form{display:grid;gap:12px}
  .cash-form label{display:grid;gap:7px;color:var(--muted,#9298a6);font-size:12px}
  .cash-form input,.cash-form select{width:100%;min-height:43px;padding:10px 12px;border-radius:9px;border:1px solid var(--border,rgba(255,255,255,.12));background:var(--input,#0b0e15);color:var(--text,#f4f5f7);font:inherit;outline:none}
  .cash-form input:focus,.cash-form select:focus{border-color:var(--accent,#d9a441)}
  .cash-button{min-height:42px;padding:10px 15px;border:0;border-radius:9px;background:var(--accent,#d9a441);color:#17130a;font-weight:750;cursor:pointer}
  .cash-button:disabled{opacity:.55;cursor:wait}
  .cash-button.secondary{background:rgba(255,255,255,.08);color:var(--text,#f4f5f7)}
  .cash-button.danger{background:#a93242;color:white}
  .cash-table-wrap{overflow-x:auto}
  .cash-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:13px}
  .cash-table th,.cash-table td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--border,rgba(255,255,255,.07))}
  .cash-table th{color:var(--muted,#9298a6);font-size:11px;font-weight:650}
  .cash-table td:last-child,.cash-table th:last-child{text-align:right}
  .cash-tag{display:inline-block;padding:5px 8px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(255,255,255,.08)}
  .cash-tag.sale,.cash-tag.deposit{color:#4ade80;background:rgba(34,197,94,.1)}
  .cash-tag.expense,.cash-tag.withdrawal{color:#fb7185;background:rgba(244,63,94,.1)}
  .cash-empty{padding:25px 10px;text-align:center;color:var(--muted,#9298a6);font-size:13px}
  .cash-summary-line{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,rgba(255,255,255,.07));font-size:13px}
  .cash-summary-line:last-child{border:0}
  .cash-summary-line span{color:var(--muted,#9298a6)}
  .cash-summary-line strong{text-align:right}
  .cash-notice{padding:13px;border-radius:10px;background:rgba(217,164,65,.1);color:#e8c77e;font-size:12px;line-height:1.5}
  .cash-loading{padding:35px;text-align:center;color:var(--muted,#9298a6)}
  @media(max-width:900px){.cash-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cash-columns{grid-template-columns:1fr}}
  @media(max-width:520px){.cash-grid{grid-template-columns:1fr 1fr}.cash-card,.cash-panel{padding:14px}.cash-card strong{font-size:17px}}
`;

export function mountCashAdmin({ content, notify }) {
  let register = null;
  let transactions = [];
  let busy = false;

  let style = document.querySelector("#cash-admin-styles");
  if (!style) {
    style = document.createElement("style");
    style.id = "cash-admin-styles";
    style.textContent = styles;
    document.head.appendChild(style);
  }

  content.innerHTML = `
    <section class="cash-admin">
      <div class="cash-loading">Carregando controle de caixa...</div>
    </section>
  `;

  const root = content.querySelector(".cash-admin");

  function totals() {
    const result = {
      cash: 0,
      pix: 0,
      card: 0,
      expenses: 0,
      withdrawals: 0,
      deposits: 0,
    };

    for (const item of transactions) {
      const amount = Number(item.amount || 0);

      if (item.transaction_type === "sale") {
        if (item.payment_method === "cash") result.cash += amount;
        if (item.payment_method === "pix") result.pix += amount;
        if (item.payment_method === "card") result.card += amount;
      }

      if (item.transaction_type === "expense") result.expenses += amount;
      if (item.transaction_type === "withdrawal") result.withdrawals += amount;
      if (item.transaction_type === "deposit") result.deposits += amount;
    }

    const opening = Number(register?.opening_amount || 0);
    result.expected =
      opening +
      result.cash +
      result.deposits -
      result.expenses -
      result.withdrawals;

    return result;
  }

  async function loadData() {
    root.innerHTML = `<div class="cash-loading">Atualizando informações...</div>`;

    const { data: activeRegister, error: registerError } = await supabase
      .from("cash_registers")
      .select("id, opening_amount, opened_at, status")
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (registerError) throw registerError;

    register = activeRegister;
    transactions = [];

    if (register) {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select(
          "id, transaction_type, description, amount, payment_method, created_at, order_id",
        )
        .eq("cash_register_id", register.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      transactions = data || [];
    }

    await render();
  }

  function renderTransactions() {
    if (!transactions.length) {
      return `<tr><td colspan="5"><div class="cash-empty">Nenhuma movimentação registrada neste caixa.</div></td></tr>`;
    }

    const labels = {
      sale: "Venda",
      expense: "Despesa",
      withdrawal: "Retirada",
      deposit: "Suprimento",
    };

    return transactions
      .map(
        (item) => `
      <tr>
        <td>${dateTime(item.created_at)}</td>
        <td><span class="cash-tag ${escapeHTML(item.transaction_type)}">${labels[item.transaction_type] || "Movimentação"}</span></td>
        <td>${escapeHTML(item.description)}</td>
        <td>${escapeHTML(item.payment_method || "—")}</td>
        <td>${money(item.amount)}</td>
      </tr>
    `,
      )
      .join("");
  }

  async function render() {
    if (!register) {
      const { data: history, error } = await supabase
        .from("cash_registers")
        .select(
          "id, opening_amount, closing_amount, opened_at, closed_at, status",
        )
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      root.innerHTML = `
        <div class="cash-header">
          <div>
            <h2>Controle de caixa</h2>
            <div class="cash-muted">Abra um caixa para iniciar as operações.</div>
          </div>
          <span class="cash-status closed">● Caixa fechado</span>
        </div>

        <div class="cash-panel">
          <h3>Abrir novo caixa</h3>
          <form class="cash-form" data-form="open">
            <label>Valor inicial em dinheiro (R$)
              <input name="opening_amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="0,00" required>
            </label>
            <button class="cash-button" type="submit">Abrir caixa</button>
          </form>
        </div>

        <div class="cash-panel">
          <h3>Últimos caixas fechados</h3>
          <div class="cash-table-wrap">
            <table class="cash-table">
              <thead><tr><th>Abertura</th><th>Fechamento</th><th>Valor inicial</th><th>Valor contado</th></tr></thead>
              <tbody>
                ${
                  (history || []).length
                    ? history
                        .map(
                          (item) => `
                  <tr>
                    <td>${dateTime(item.opened_at)}</td>
                    <td>${dateTime(item.closed_at)}</td>
                    <td>${money(item.opening_amount)}</td>
                    <td>${money(item.closing_amount)}</td>
                  </tr>
                `,
                        )
                        .join("")
                    : `<tr><td colspan="4"><div class="cash-empty">Nenhum caixa fechado anteriormente.</div></td></tr>`
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
      return;
    }

    const t = totals();

    root.innerHTML = `
      <div class="cash-header">
        <div>
          <h2>Controle de caixa</h2>
          <div class="cash-muted">Aberto em ${dateTime(register.opened_at)}</div>
        </div>
        <span class="cash-status">● Caixa aberto</span>
      </div>

      <div class="cash-grid">
        <article class="cash-card">
          <small>Saldo esperado em dinheiro</small>
          <strong>${money(t.expected)}</strong>
        </article>
        <article class="cash-card">
          <small>Vendas em dinheiro</small>
          <strong>${money(t.cash)}</strong>
        </article>
        <article class="cash-card">
          <small>Vendas via Pix</small>
          <strong>${money(t.pix)}</strong>
        </article>
        <article class="cash-card">
          <small>Vendas no cartão</small>
          <strong>${money(t.card)}</strong>
        </article>
      </div>

      <div class="cash-columns">
        <section class="cash-panel">
          <h3>Movimentações manuais</h3>
          <form class="cash-form" data-form="movement">
            <label>Tipo de movimentação
              <select name="transaction_type" required>
                <option value="expense">Despesa</option>
                <option value="withdrawal">Retirada / sangria</option>
                <option value="deposit">Suprimento / entrada</option>
              </select>
            </label>
            <label>Descrição
              <input name="description" type="text" maxlength="160" placeholder="Ex.: Pagamento de fornecedor" required>
            </label>
            <label>Valor (R$)
              <input name="amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
            </label>
            <div class="cash-notice">As movimentações manuais são registradas em dinheiro e afetam o saldo físico do caixa.</div>
            <button class="cash-button" type="submit">Registrar movimentação</button>
          </form>
        </section>

        <section class="cash-panel">
          <h3>Conferência do caixa</h3>
          <div class="cash-summary-line"><span>Valor inicial</span><strong>${money(register.opening_amount)}</strong></div>
          <div class="cash-summary-line"><span>Vendas em dinheiro</span><strong>${money(t.cash)}</strong></div>
          <div class="cash-summary-line"><span>Suprimentos</span><strong>${money(t.deposits)}</strong></div>
          <div class="cash-summary-line"><span>Despesas</span><strong>− ${money(t.expenses)}</strong></div>
          <div class="cash-summary-line"><span>Retiradas</span><strong>− ${money(t.withdrawals)}</strong></div>
          <div class="cash-summary-line"><span>Saldo esperado</span><strong>${money(t.expected)}</strong></div>
          <form class="cash-form" data-form="close" style="margin-top:18px">
            <label>Dinheiro contado no caixa (R$)
              <input name="closing_amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" required>
            </label>
            <button class="cash-button danger" type="submit">Conferir e fechar caixa</button>
          </form>
        </section>
      </div>

      <section class="cash-panel">
        <div class="cash-header">
          <h3>Histórico de movimentações</h3>
          <button class="cash-button secondary" type="button" data-action="refresh">Atualizar</button>
        </div>
        <div class="cash-table-wrap">
          <table class="cash-table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Pagamento</th><th>Valor</th></tr></thead>
            <tbody>${renderTransactions()}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  async function submitOpen(form) {
    const amount = parseMoney(new FormData(form).get("opening_amount"));

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Informe um valor inicial válido.");
    }

    const { error } = await supabase.rpc("open_cash_register", {
      p_opening_amount: amount,
    });

    if (error) throw error;

    notify("Caixa aberto com sucesso.");
    await loadData();
  }

  async function submitMovement(form) {
    if (!register) throw new Error("Não existe um caixa aberto.");

    const values = new FormData(form);
    const type = values.get("transaction_type");
    const description = String(values.get("description") || "").trim();
    const amount = parseMoney(values.get("amount"));

    if (!["expense", "withdrawal", "deposit"].includes(type)) {
      throw new Error("Tipo de movimentação inválido.");
    }

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("Informe uma descrição e um valor válido.");
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;

    const { error } = await supabase.from("cash_transactions").insert({
      cash_register_id: register.id,
      transaction_type: type,
      description,
      amount,
      payment_method: "cash",
      created_by: userData.user.id,
    });

    if (error) throw error;

    notify("Movimentação registrada.");
    await loadData();
  }

  async function submitClose(form) {
    if (!register) throw new Error("Não existe um caixa aberto.");

    const rawAmount = new FormData(form).get("closing_amount");
    const amount = parseMoney(rawAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("Informe o valor contado corretamente.");
    }

    const expected = totals().expected;
    const confirmed = window.confirm(
      `Confirma o fechamento do caixa?\n\nSaldo esperado: ${money(expected)}\nValor contado: ${money(amount)}`,
    );

    if (!confirmed) return;

    const { data, error } = await supabase.rpc("close_cash_register", {
      p_register_id: register.id,
      p_closing_amount: amount,
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const difference = Number(result?.difference ?? amount - expected);
    const label =
      difference > 0
        ? `Sobra de ${money(difference)}`
        : difference < 0
          ? `Quebra de ${money(Math.abs(difference))}`
          : "Caixa sem diferença";

    notify(`Caixa fechado. ${label}.`);
    await loadData();
  }

  root.addEventListener("click", async (event) => {
    const button = event.target.closest('[data-action="refresh"]');
    if (!button || busy) return;

    busy = true;
    button.disabled = true;

    try {
      await loadData();
    } catch (error) {
      console.error(error);
      notify(error.message || "Não foi possível atualizar o caixa.");
    } finally {
      busy = false;
    }
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form || busy) return;

    event.preventDefault();
    busy = true;

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const action = form.dataset.form;

      if (action === "open") await submitOpen(form);
      if (action === "movement") await submitMovement(form);
      if (action === "close") await submitClose(form);
    } catch (error) {
      console.error(error);
      notify(error.message || "Não foi possível concluir a operação.");
    } finally {
      busy = false;
      if (button?.isConnected) button.disabled = false;
    }
  });

  loadData().catch((error) => {
    console.error(error);
    root.innerHTML = `
      <div class="cash-panel">
        <h3>Não foi possível carregar o caixa</h3>
        <p class="cash-muted">${escapeHTML(translateErrorMessage(error.message, "Verifique sua conexão e as permissões no Supabase."))}</p>
        <button class="cash-button secondary" type="button" data-action="refresh">Tentar novamente</button>
      </div>
    `;
  });
}
