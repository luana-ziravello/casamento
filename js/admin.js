/* Painel dos noivos — visão de confirmações, presentes e recados.
   Área restrita por senha conferida no próprio navegador.

   ── COMO TROCAR A SENHA ──────────────────────────────────────────────
   A senha NÃO fica salva aqui em texto puro, só o hash SHA-256 dela.
   Para definir uma nova senha, abra o console do navegador (F12) e rode:

       crypto.subtle.digest('SHA-256', new TextEncoder().encode('SUA-NOVA-SENHA'))
         .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))

   Copie o valor impresso e cole em ADMIN_PASSWORD_SHA256 abaixo.

   Senha atual: luana-heitor-1010
   Observação: esta é uma proteção simples (só esconde a página). Os dados
   das tabelas continuam acessíveis pela chave pública do Supabase.
   ─────────────────────────────────────────────────────────────────────── */

const ADMIN_PASSWORD_SHA256 = 'ee3f889ad08f3f9119a1236e205a2b854f83ad4d167990f1badcf3de46626c17';
const CHAVE_SESSAO = 'painel-noivos-ok';

const SUPABASE_URL = 'https://huggafwjjceoekgjzbxi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzOM_a4GHiAiiAThr5N0GA_ZV0bkE4D';

let adminClient = null;
function getClient() {
  if (!adminClient && window.supabase) {
    adminClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return adminClient;
}

const formatoPreco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatoData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function escaparHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : formatoData.format(d);
}

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/* ===== portão de senha ===== */
const portao = document.getElementById('portao');
const painel = document.getElementById('painel');
const portaoForm = document.getElementById('portaoForm');
const portaoSenha = document.getElementById('portaoSenha');
const portaoErro = document.getElementById('portaoErro');

function abrirPainel() {
  portao.classList.add('escondido');
  painel.classList.add('visivel');
  carregarTudo();
}

portaoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  portaoErro.textContent = '';
  const hash = await sha256Hex(portaoSenha.value);
  if (hash === ADMIN_PASSWORD_SHA256) {
    try { sessionStorage.setItem(CHAVE_SESSAO, '1'); } catch { /* segue sem persistir na sessão */ }
    abrirPainel();
  } else {
    portaoErro.textContent = 'Senha incorreta.';
    portaoSenha.select();
  }
});

document.getElementById('btnSair').addEventListener('click', () => {
  try { sessionStorage.removeItem(CHAVE_SESSAO); } catch { /* nada a limpar */ }
  location.reload();
});

try {
  if (sessionStorage.getItem(CHAVE_SESSAO) === '1') abrirPainel();
} catch { /* sessionStorage indisponível: mostra o portão normalmente */ }

/* ===== navegação por abas ===== */
document.querySelectorAll('.aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((a) => a.classList.toggle('ativa', a === aba));
    const alvo = aba.dataset.secao;
    document.querySelectorAll('.secao').forEach((s) => s.classList.toggle('ativa', s.id === `secao-${alvo}`));
  });
});

/* ===== confirmações ===== */
let confConvidados = [];
let confFiltro = 'todos';

function cartao(n, rotulo, destaque) {
  return `<div class="cartao${destaque ? ' destaque' : ''}"><div class="n">${n}</div><div class="r">${rotulo}</div></div>`;
}

function renderConfirmacoes() {
  const cartoes = document.getElementById('confCartoes');
  const lista = document.getElementById('confLista');

  const sim = confConvidados.filter((c) => c.confirmed === true);
  const nao = confConvidados.filter((c) => c.confirmed === false);
  const sem = confConvidados.filter((c) => c.confirmed !== true && c.confirmed !== false);

  cartoes.innerHTML =
    cartao(sim.length, 'Confirmados', true) +
    cartao(nao.length, 'Não vão') +
    cartao(sem.length, 'Sem resposta') +
    cartao(confConvidados.length, 'Convidados');

  const filtrados = confConvidados.filter((c) => {
    if (confFiltro === 'sim') return c.confirmed === true;
    if (confFiltro === 'nao') return c.confirmed === false;
    if (confFiltro === 'sem') return c.confirmed !== true && c.confirmed !== false;
    return true;
  });

  if (!filtrados.length) {
    lista.innerHTML = '<p class="estado">Nenhum convidado nesse filtro.</p>';
    return;
  }

  const grupos = new Map();
  filtrados.forEach((c) => {
    const chave = c.family_name || c.guest_name || '—';
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(c);
  });

  const nomesOrdenados = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  lista.innerHTML = nomesOrdenados.map((nome) => {
    const membros = grupos.get(nome).slice().sort((a, b) => (a.guest_name || '').localeCompare(b.guest_name || '', 'pt-BR'));
    const linhas = membros.map((c) => {
      const estado = c.confirmed === true ? 'sim' : c.confirmed === false ? 'nao' : 'sem';
      const rotulo = estado === 'sim' ? 'Confirmado' : estado === 'nao' ? 'Não vai' : 'Sem resposta';
      return `<div class="linha"><span>${escaparHtml(c.guest_name)}</span><span class="selo ${estado}">${rotulo}</span></div>`;
    }).join('');
    return `<div class="grupo"><div class="grupo-titulo">${escaparHtml(nome)}</div>${linhas}</div>`;
  }).join('');
}

document.getElementById('confFiltros').addEventListener('click', (e) => {
  const btn = e.target.closest('.filtro');
  if (!btn) return;
  confFiltro = btn.dataset.f;
  document.querySelectorAll('#confFiltros .filtro').forEach((b) => b.classList.toggle('ativo', b === btn));
  renderConfirmacoes();
});

async function carregarConfirmacoes() {
  const client = getClient();
  const lista = document.getElementById('confLista');
  if (!client) { lista.innerHTML = '<p class="estado">Não foi possível conectar.</p>'; return; }
  const { data, error } = await client
    .from('guests')
    .select('id, guest_name, family_name, confirmed, confirmed_at')
    .order('family_name', { ascending: true });
  if (error) { lista.innerHTML = '<p class="estado">Não foi possível carregar as confirmações.</p>'; return; }
  confConvidados = data || [];
  renderConfirmacoes();
}

/* ===== presentes ===== */
let presPedidos = [];
let presFiltro = 'todos';

const ROTULO_STATUS = { approved: 'Aprovado', pending: 'Pendente', rejected: 'Recusado', cancelled: 'Cancelado' };

function renderPresentes() {
  const cartoes = document.getElementById('presCartoes');
  const lista = document.getElementById('presLista');

  const aprovados = presPedidos.filter((p) => p.status === 'approved');
  const pendentes = presPedidos.filter((p) => p.status === 'pending');
  const totalAprovado = aprovados.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const totalPendente = pendentes.reduce((s, p) => s + Number(p.total_amount || 0), 0);

  cartoes.innerHTML =
    cartao(formatoPreco.format(totalAprovado), 'Recebido (aprovado)', true) +
    cartao(aprovados.length, 'Pedidos aprovados') +
    cartao(formatoPreco.format(totalPendente), 'Aguardando') +
    cartao(pendentes.length, 'Pedidos pendentes');

  const filtrados = presPedidos.filter((p) => presFiltro === 'todos' || p.status === presFiltro);
  if (!filtrados.length) {
    lista.innerHTML = '<p class="estado">Nenhum pedido nesse filtro.</p>';
    return;
  }

  lista.innerHTML = filtrados.map((p) => {
    const itens = (p.gift_order_items || []).map((i) =>
      `<li><span>${escaparHtml(i.gift_name)}</span><span>${formatoPreco.format(Number(i.price || 0))}</span></li>`
    ).join('');
    const msg = p.giver_message
      ? `<div class="pedido-msg">${escaparHtml(p.giver_message)}</div>`
      : '';
    const status = ROTULO_STATUS[p.status] || p.status;
    return `
      <div class="pedido">
        <div class="pedido-topo">
          <span class="pedido-nome">${escaparHtml(p.giver_name || 'Sem nome')}</span>
          <span class="selo ${p.status}">${status}</span>
        </div>
        <div class="pedido-data">${fmtData(p.created_at)}</div>
        <ul class="pedido-itens">${itens}</ul>
        <div class="pedido-total"><span>Total</span><span>${formatoPreco.format(Number(p.total_amount || 0))}</span></div>
        ${msg}
      </div>
    `;
  }).join('');
}

document.getElementById('presFiltros').addEventListener('click', (e) => {
  const btn = e.target.closest('.filtro');
  if (!btn) return;
  presFiltro = btn.dataset.f;
  document.querySelectorAll('#presFiltros .filtro').forEach((b) => b.classList.toggle('ativo', b === btn));
  renderPresentes();
});

async function carregarPresentes() {
  const client = getClient();
  const lista = document.getElementById('presLista');
  if (!client) { lista.innerHTML = '<p class="estado">Não foi possível conectar.</p>'; return; }
  const { data, error } = await client
    .from('gift_orders')
    .select('id, total_amount, status, giver_name, giver_message, created_at, gift_order_items(gift_name, price)')
    .order('created_at', { ascending: false });
  if (error) { lista.innerHTML = '<p class="estado">Não foi possível carregar os presentes.</p>'; return; }
  presPedidos = data || [];
  renderPresentes();
}

/* ===== recados ===== */
async function carregarRecados() {
  const client = getClient();
  const lista = document.getElementById('recLista');
  const cartoes = document.getElementById('recCartoes');
  if (!client) { lista.innerHTML = '<p class="estado">Não foi possível conectar.</p>'; return; }
  const { data, error } = await client
    .from('recados')
    .select('id, nome, mensagem, created_at')
    .order('created_at', { ascending: false });
  if (error) { lista.innerHTML = '<p class="estado">Não foi possível carregar os recados.</p>'; return; }

  const recados = data || [];
  cartoes.innerHTML = cartao(recados.length, 'Recados', true);

  if (!recados.length) {
    lista.innerHTML = '<p class="estado">Nenhum recado ainda.</p>';
    return;
  }
  lista.innerHTML = recados.map((r) => `
    <div class="recado">
      <div class="recado-cab">
        <span class="recado-de">${escaparHtml(r.nome)}</span>
        <span class="recado-quando">${fmtData(r.created_at)}</span>
      </div>
      <p class="recado-txt">${escaparHtml(r.mensagem)}</p>
    </div>
  `).join('');
}

function carregarTudo() {
  carregarConfirmacoes();
  carregarPresentes();
  carregarRecados();
}
