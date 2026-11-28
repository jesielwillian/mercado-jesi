import { supabase } from "./supabase.js";
const esc = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export async function mountDriversAdmin({ content } = {}) {
  content.innerHTML = `
    <div class="drivers-admin-wrap">
      <section class="drivers-admin-hero"><div><span class="drivers-admin-kicker">EQUIPE DE OPERAÇÃO</span><h2>Gestão de entregadores</h2><p>Consulte os entregadores cadastrados e acesse a central de entregas.</p></div><a class="drivers-admin-primary" href="../entregador.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir painel do entregador</a></section>
      <section class="drivers-admin-stats"><article><span class="drivers-stat-icon"><i class="fa-solid fa-motorcycle"></i></span><div><small>Entregadores cadastrados</small><strong id="drivers-total">—</strong></div></article><article><span class="drivers-stat-icon is-active"><i class="fa-solid fa-user-check"></i></span><div><small>Contas ativas</small><strong id="drivers-active">—</strong></div></article></section>
      <section class="panel drivers-admin-panel"><div class="panel-heading"><div><h3>Equipe de entregas</h3><p>Perfis com função de entregador no Mercado Jesi.</p></div><button class="drivers-admin-refresh" id="drivers-refresh"><i class="fa-solid fa-rotate"></i> Atualizar</button></div><div id="drivers-feedback" class="drivers-admin-feedback" role="status">Carregando entregadores…</div><div class="table-wrap"><table class="orders-table"><thead><tr><th>ENTREGADOR</th><th>TELEFONE</th><th>SITUAÇÃO</th><th>ACESSO</th></tr></thead><tbody id="drivers-rows"></tbody></table></div></section>
    </div>`;
  const load = async () => {
    const feedback = content.querySelector('#drivers-feedback');
    const rows = content.querySelector('#drivers-rows');
    feedback.textContent = 'Consultando equipe…';
    const { data, error } = await supabase.from('profiles').select('id,full_name,phone,active').eq('role','delivery').order('created_at',{ascending:false});
    if (error) { feedback.textContent = `Não foi possível carregar os entregadores: ${error.message}`; rows.innerHTML=''; return; }
    const list = data || [];
    content.querySelector('#drivers-total').textContent = String(list.length);
    content.querySelector('#drivers-active').textContent = String(list.filter(x=>x.active).length);
    feedback.textContent = list.length ? `${list.length} entregador(es) encontrado(s).` : 'Nenhum entregador cadastrado ainda.';
    rows.innerHTML = list.map(x=>`<tr><td><strong>${esc(x.full_name || 'Entregador')}</strong></td><td>${esc(x.phone || '—')}</td><td><span class="drivers-admin-status ${x.active?'active':'inactive'}">${x.active?'Ativo':'Inativo'}</span></td><td><a class="drivers-admin-open" href="../entregador.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir central</a></td></tr>`).join('') || '<tr><td colspan="4" class="drivers-admin-empty">Nenhum perfil de entregador encontrado.</td></tr>';
  };
  content.querySelector('#drivers-refresh').addEventListener('click',load);
  await load();
}
