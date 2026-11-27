import { supabase } from "./supabase.js";
import { listLocalMessages, updateLocalMessage, deleteLocalMessage } from "./contact-store.js";
import { translateErrorMessage } from "./error-translations.js";

const content = document.querySelector("#page-content");
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const dateTime = value => new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(value));
let messages = [];
let filter = "all";
let notify = (message) => console.warn(message);

function render() {
  const visible = messages.filter(item => filter === "all" || item.status === filter);
  content.innerHTML = `
    <div class="messages-toolbar"><div><span class="eyebrow">RELACIONAMENTO COM CLIENTES</span><h2>Mensagens recebidas</h2><p>Mensagens enviadas pelo formulário de contato da loja.</p></div><button class="secondary-button" id="refresh-messages">↻ Atualizar</button></div>
    <div class="messages-summary"><div><b>${messages.length}</b><span>Total de mensagens</span></div><div><b>${messages.filter(m=>m.status==="new").length}</b><span>Não lidas</span></div><div><b>${messages.filter(m=>m.status==="read").length}</b><span>Em atendimento</span></div><div><b>${messages.filter(m=>m.status==="replied").length}</b><span>Respondidas</span></div></div>
    <article class="panel messages-panel"><div class="messages-filters"><label for="message-filter">Filtrar mensagens</label><select id="message-filter"><option value="all" ${filter==="all"?"selected":""}>Todas</option><option value="new" ${filter==="new"?"selected":""}>Não lidas</option><option value="read" ${filter==="read"?"selected":""}>Em atendimento</option><option value="replied" ${filter==="replied"?"selected":""}>Respondidas</option><option value="archived" ${filter==="archived"?"selected":""}>Arquivadas</option></select></div>
    ${visible.length ? `<div class="messages-list">${visible.map(item=>`<article class="message-card ${item.status==="new"?"is-new":""}"><div class="message-card-top"><div><span class="message-status status-${escapeHTML(item.status)}">${({new:"Não lida",read:"Em atendimento",replied:"Respondida",archived:"Arquivada"})[item.status]||"Não lida"}</span><h3>${escapeHTML(item.subject)}</h3><p class="message-sender">${escapeHTML(item.name)} · <a href="mailto:${escapeHTML(item.email)}">${escapeHTML(item.email)}</a>${item.phone?` · <a href="tel:${escapeHTML(item.phone.replace(/[^+\d]/g,""))}">${escapeHTML(item.phone)}</a>`:""}</p></div><time>${dateTime(item.created_at)}</time></div><p class="message-body">${escapeHTML(item.message).replace(/\n/g,"<br>")}</p><div class="message-actions"><a class="secondary-button" href="mailto:${encodeURIComponent(item.email)}?subject=${encodeURIComponent("Re: "+item.subject)}">Responder por e-mail <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></a><select data-status="${escapeHTML(item.id)}" aria-label="Status da mensagem"><option value="new" ${item.status==="new"?"selected":""}>Não lida</option><option value="read" ${item.status==="read"?"selected":""}>Em atendimento</option><option value="replied" ${item.status==="replied"?"selected":""}>Respondida</option><option value="archived" ${item.status==="archived"?"selected":""}>Arquivada</option></select><button class="delete-message" data-delete-message="${escapeHTML(item.id)}">Excluir</button></div></article>`).join("")}</div>` : `<div class="messages-empty"><span>✉</span><b>Nenhuma mensagem por aqui</b><p>Quando alguém preencher o formulário de contato, a mensagem aparecerá nesta área.</p></div>`}</article>`;
  content.querySelector("#refresh-messages").addEventListener("click", loadMessages);
  content.querySelector("#message-filter").addEventListener("change", event => { filter=event.target.value; render(); });
  content.querySelectorAll("[data-status]").forEach(select => select.addEventListener("change", () => changeStatus(select.dataset.status, select.value)));
  content.querySelectorAll("[data-delete-message]").forEach(button => button.addEventListener("click", () => removeMessage(button.dataset.deleteMessage)));
}

async function loadMessages() {
  try {
    if (supabase) {
      const { data, error } = await supabase.from("contact_messages").select("id,name,email,phone,subject,message,status,created_at").order("created_at", { ascending:false });
      if (error) throw error;
      messages = data || [];
    } else messages = await listLocalMessages();
    render();
  } catch (error) {
    console.error(error);
    content.innerHTML = `<article class="panel messages-empty"><b>Não foi possível carregar as mensagens.</b><p>${escapeHTML(translateErrorMessage(error.message, "Verifique a configuração do Supabase e as políticas de acesso."))}</p><button class="secondary-button" id="retry-messages">Tentar novamente</button></article>`;
    content.querySelector("#retry-messages").addEventListener("click", loadMessages);
  }
}

async function changeStatus(id, status) {
  try {
    if (supabase) {
      const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
      if (error) throw error;
    } else await updateLocalMessage(id, { status });
    const item = messages.find(message => message.id === id);
    if (item) item.status = status;
    render();
  } catch (error) { notify(`Não foi possível atualizar: ${error.message || "erro desconhecido"}`); }
}

async function removeMessage(id) {
  if (!confirm("Excluir esta mensagem permanentemente?")) return;
  try {
    if (supabase) {
      const { error } = await supabase.from("contact_messages").delete().eq("id", id);
      if (error) throw error;
    } else await deleteLocalMessage(id);
    messages = messages.filter(item => item.id !== id);
    render();
  } catch (error) { notify(`Não foi possível excluir: ${error.message || "erro desconhecido"}`); }
}

export function mountMessagesAdmin(options = {}) { notify = options.notify || notify; loadMessages(); }
