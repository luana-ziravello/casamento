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
const portaoOlho = document.getElementById('portaoOlho');

const OLHO_ABERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
const OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.4 4.3M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 4-.9"/></svg>';

portaoOlho.innerHTML = OLHO_FECHADO;
portaoOlho.addEventListener('click', () => {
  const mostrar = portaoSenha.type === 'password';
  portaoSenha.type = mostrar ? 'text' : 'password';
  portaoOlho.innerHTML = mostrar ? OLHO_ABERTO : OLHO_FECHADO;
  portaoOlho.setAttribute('aria-pressed', String(mostrar));
  portaoOlho.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
  portaoSenha.focus();
});

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

/* ===== modais (mesmo padrão simples usado no site principal) ===== */
function abrirModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.add('aberta');
  document.body.style.overflow = 'hidden';
}
function fecharModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('aberta');
  document.body.style.overflow = '';
}
function fecharModalFora(event, id) {
  if (event.target.id === id) fecharModal(id);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.aberta').forEach((m) => fecharModal(m.id));
});

/* ===== navegação por abas ===== */
const fabAddFornecedor = document.getElementById('fabAddFornecedor');
document.querySelectorAll('.aba').forEach((aba) => {
  aba.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((a) => a.classList.toggle('ativa', a === aba));
    const alvo = aba.dataset.secao;
    document.querySelectorAll('.secao').forEach((s) => s.classList.toggle('ativa', s.id === `secao-${alvo}`));
    if (fabAddFornecedor) fabAddFornecedor.classList.toggle('visivel', alvo === 'fornecedores');
  });
});

/* ===== confirmações ===== */
let confConvidados = [];
let confFiltro = 'todos';

const LINK_CONFIRMACAO = 'https://luana-ziravello.github.io/casamento/#presentes-confirmacao';
const ICONE_WHATSAPP = '<svg viewBox="0 0 32 32" fill="#fff" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16.02 4C9.4 4 4 9.4 4 16.02c0 2.2.58 4.28 1.68 6.12L4 28l6.02-1.64a11.98 11.98 0 0 0 6 1.62h.01C22.65 27.98 28.05 22.58 28.05 15.96 28.05 9.4 22.65 4 16.02 4Zm0 21.98h-.01a9.94 9.94 0 0 1-5.07-1.39l-.36-.21-3.57.97.96-3.48-.24-.36a9.93 9.93 0 0 1-1.53-5.3C6.2 10.5 10.5 6.2 16.02 6.2a9.75 9.75 0 0 1 6.93 2.87 9.72 9.72 0 0 1 2.87 6.9c0 5.52-4.5 9.99-9.8 10.01Z"/><path d="M22.4 18.86c-.34-.17-2-1-2.31-1.1-.31-.12-.54-.17-.76.17-.23.34-.87 1.1-1.07 1.32-.2.23-.4.26-.73.09-.34-.17-1.43-.53-2.72-1.68-1.01-.9-1.68-2-1.88-2.34-.2-.34-.02-.52.15-.69.15-.15.34-.4.5-.6.17-.2.23-.34.34-.57.11-.23.06-.43-.03-.6-.09-.17-.76-1.85-1.05-2.53-.28-.66-.56-.57-.76-.58h-.65c-.23 0-.6.08-.91.43-.31.34-1.2 1.17-1.2 2.86s1.23 3.32 1.4 3.55c.17.23 2.42 3.7 5.88 5.18.82.35 1.46.56 1.96.72.82.26 1.57.22 2.16.13.66-.1 2-.82 2.28-1.6.28-.79.28-1.47.2-1.6-.08-.14-.31-.23-.65-.4Z"/></svg>';

function mensagemCobranca(nome) {
  return `Olá, ${nome}! Tudo bem? 😊\n\nSou a Roberta, assessora do casamento da Luana e do Heitor. Estamos organizando os últimos detalhes e vimos que a sua confirmação ainda não chegou.\n\nVocês conseguirão estar com a gente nesse dia tão especial? 💛 A confirmação é muito importante para conseguirmos organizar tudo direitinho.\n\nQuando puder, confirme sua presença pelo link abaixo:\n\n${LINK_CONFIRMACAO}\n\nVamos adorar contar com vocês! ✨`;
}

function linkWhatsAppConvidado(telefone, nomeCompleto, confirmed) {
  const numero = (telefone || '').replace(/\D/g, '');
  if (!numero) return '';
  // só manda o textão de cobrança pra quem ainda não respondeu — depois que
  // vira "sim" ou "não", o botão continua existindo, mas só como atalho pro
  // número, sem reabrir a cobrança de confirmação.
  if (confirmed === true || confirmed === false) return `https://wa.me/${numero}`;
  const primeiroNome = (nomeCompleto || '').trim().split(/\s+/)[0] || nomeCompleto;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagemCobranca(primeiroNome))}`;
}

function cartao(n, rotulo, classe) {
  return `<div class="cartao${classe ? ' ' + classe : ''}"><div class="n">${n}</div><div class="r">${rotulo}</div></div>`;
}

function renderConfirmacoes() {
  const cartoes = document.getElementById('confCartoes');
  const lista = document.getElementById('confLista');

  const sim = confConvidados.filter((c) => c.confirmed === true);
  const nao = confConvidados.filter((c) => c.confirmed === false);
  const sem = confConvidados.filter((c) => c.confirmed !== true && c.confirmed !== false);

  cartoes.innerHTML =
    cartao(sim.length, 'Confirmados', 'verde') +
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
      const linkWpp = linkWhatsAppConvidado(c.phone, c.guest_name, c.confirmed);
      const botaoWpp = linkWpp
        ? `<a class="linha-whatsapp" href="${linkWpp}" target="_blank" rel="noopener" aria-label="Chamar ${escaparHtml(c.guest_name)} no WhatsApp" title="Chamar no WhatsApp">${ICONE_WHATSAPP}</a>`
        : '';
      return `<div class="linha"><span>${escaparHtml(c.guest_name)}</span><span class="linha-direita">${botaoWpp}<span class="selo ${estado}">${rotulo}</span></span></div>`;
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
    .select('id, guest_name, family_name, confirmed, confirmed_at, phone')
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
    cartao(formatoPreco.format(totalAprovado), 'Recebido (aprovado)', 'destaque') +
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
    const remover = p.status === 'pending'
      ? `<button type="button" class="pedido-remover" data-id="${p.id}" aria-label="Remover este pedido em andamento" title="Remover">✕</button>`
      : '';
    return `
      <div class="pedido">
        <div class="pedido-topo">
          <span class="pedido-nome">${escaparHtml(p.giver_name || 'Sem nome')}</span>
          <span class="pedido-acoes">
            <span class="selo ${p.status}">${status}</span>
            ${remover}
          </span>
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

document.getElementById('presLista').addEventListener('click', async (e) => {
  const btn = e.target.closest('.pedido-remover');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const pedido = presPedidos.find((p) => p.id === id);
  const nome = pedido?.giver_name ? ` de ${pedido.giver_name}` : '';
  if (!confirm(`Remover o pedido em andamento${nome}? Só é possível remover pedidos que ninguém concluiu.`)) return;

  btn.disabled = true;
  const client = getClient();
  if (!client) { alert('Não foi possível conectar agora.'); btn.disabled = false; return; }

  // apaga os itens primeiro (a policy só permite enquanto o pedido está pending)
  const { error: erroItens } = await client.from('gift_order_items').delete().eq('order_id', id);
  const { error: erroPedido } = await client.from('gift_orders').delete().eq('id', id).eq('status', 'pending');
  if (erroItens || erroPedido) {
    alert('Não foi possível remover agora. O pedido pode já ter sido aprovado.');
    btn.disabled = false;
    return;
  }
  presPedidos = presPedidos.filter((p) => p.id !== id);
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

/* ===== álbum de fotos ===== */
async function carregarAlbum() {
  const client = getClient();
  const cartoes = document.getElementById('albumCartoes');
  const lista = document.getElementById('albumLista');
  if (!client) { lista.innerHTML = '<p class="estado">Não foi possível conectar.</p>'; return; }

  const [fotosRes, comentariosRes, reacoesRes] = await Promise.all([
    client.from('album_photos').select('id, author_name, caption, thumb_path, created_at').order('created_at', { ascending: false }),
    client.from('album_comments').select('id, photo_id, author_name, body, created_at').order('created_at', { ascending: false }),
    client.from('album_reactions').select('photo_id'),
  ]);

  if (fotosRes.error) { lista.innerHTML = '<p class="estado">Não foi possível carregar o álbum.</p>'; return; }

  const fotos = fotosRes.data || [];
  const comentarios = comentariosRes.data || [];
  const reacoes = reacoesRes.data || [];

  cartoes.innerHTML =
    cartao(fotos.length, 'Fotos', 'destaque') +
    cartao(comentarios.length, 'Comentários') +
    cartao(reacoes.length, 'Reações');

  if (!fotos.length) {
    lista.innerHTML = '<p class="estado">Nenhuma foto publicada ainda.</p>';
    return;
  }

  const comentariosPorFoto = new Map();
  comentarios.forEach((c) => {
    if (!comentariosPorFoto.has(c.photo_id)) comentariosPorFoto.set(c.photo_id, []);
    comentariosPorFoto.get(c.photo_id).push(c);
  });

  lista.innerHTML = fotos.map((f) => {
    const url = client.storage.from('album').getPublicUrl(f.thumb_path).data.publicUrl;
    const seusComentarios = comentariosPorFoto.get(f.id) || [];
    const comentariosHtml = seusComentarios.map((c) => `
      <div class="album-admin-comentario">
        <span><strong>${escaparHtml(c.author_name)}</strong> ${escaparHtml(c.body)}</span>
        <button type="button" class="pedido-remover" data-comentario="${c.id}" aria-label="Remover comentário" title="Remover">✕</button>
      </div>
    `).join('');
    return `
      <div class="pedido">
        <div class="pedido-topo">
          <div style="display:flex;gap:.7rem;align-items:center;">
            <img src="${url}" alt="" class="album-admin-thumb" loading="lazy">
            <div>
              <span class="pedido-nome">${escaparHtml(f.author_name)}</span>
              <div class="pedido-data">${fmtData(f.created_at)}</div>
            </div>
          </div>
          <span class="pedido-acoes">
            <button type="button" class="pedido-remover" data-foto-remover="${f.id}" aria-label="Remover esta foto" title="Remover foto">✕</button>
          </span>
        </div>
        ${f.caption ? `<div class="pedido-msg">${escaparHtml(f.caption)}</div>` : ''}
        ${comentariosHtml ? `<div class="album-admin-comentarios">${comentariosHtml}</div>` : ''}
      </div>
    `;
  }).join('');
}

document.getElementById('albumLista').addEventListener('click', async (e) => {
  const client = getClient();
  if (!client) return;

  const btnFoto = e.target.closest('[data-foto-remover]');
  if (btnFoto) {
    if (!confirm('Remover esta foto do álbum? Essa ação não pode ser desfeita.')) return;
    btnFoto.disabled = true;
    const id = Number(btnFoto.dataset.fotoRemover);
    const { data: foto } = await client.from('album_photos').select('storage_path, thumb_path').eq('id', id).single();
    if (foto) await client.storage.from('album').remove([foto.storage_path, foto.thumb_path].filter(Boolean));
    const { error } = await client.from('album_photos').delete().eq('id', id);
    if (error) { alert('Não foi possível remover agora.'); btnFoto.disabled = false; return; }
    carregarAlbum();
    return;
  }

  const btnComentario = e.target.closest('[data-comentario]');
  if (btnComentario) {
    if (!confirm('Remover este comentário?')) return;
    btnComentario.disabled = true;
    const { error } = await client.from('album_comments').delete().eq('id', Number(btnComentario.dataset.comentario));
    if (error) { alert('Não foi possível remover agora.'); btnComentario.disabled = false; return; }
    carregarAlbum();
  }
});

/* ===== fornecedores ===== */
let fornecedoresLista = [];

const ICONE_CONTRATO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>';
const ICONE_EDITAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function linkWhatsAppFornecedor(telefone) {
  const numero = (telefone || '').replace(/\D/g, '');
  return numero ? `https://wa.me/${numero}` : '';
}

function rotuloStatusFornecedor(f) {
  if (f.status !== 'pendente') return 'Quitado';
  if (!f.status_detalhe) return 'Pendente';
  return f.status_detalhe === 'total' ? 'Pendente (total)' : `Pendente · R$ ${f.status_detalhe}`;
}

function renderFornecedores() {
  const cartoes = document.getElementById('fornCartoes');
  const lista = document.getElementById('fornLista');

  const quitados = fornecedoresLista.filter((f) => f.status !== 'pendente');
  const pendentes = fornecedoresLista.filter((f) => f.status === 'pendente');
  const comContrato = fornecedoresLista.filter((f) => f.contrato_arquivo);

  cartoes.innerHTML =
    cartao(fornecedoresLista.length, 'Fornecedores', 'destaque') +
    cartao(quitados.length, 'Quitados', 'verde') +
    cartao(pendentes.length, 'Pendentes') +
    cartao(comContrato.length, 'Com contrato');

  if (!fornecedoresLista.length) {
    lista.innerHTML = '<p class="estado">Nenhum fornecedor cadastrado ainda.</p>';
    return;
  }

  lista.innerHTML = fornecedoresLista.map((f) => {
    const linkWpp = linkWhatsAppFornecedor(f.telefone);
    const botaoWpp = `<a class="forn-icone whatsapp${linkWpp ? '' : ' desativado'}" href="${linkWpp || '#'}" target="_blank" rel="noopener" aria-label="Chamar ${escaparHtml(f.empresa)} no WhatsApp" title="WhatsApp">${ICONE_WHATSAPP}</a>`;
    const botaoContrato = f.contrato_arquivo
      ? `<a class="forn-icone" href="${escaparHtml(f.contrato_arquivo)}" target="_blank" rel="noopener" aria-label="Abrir contrato de ${escaparHtml(f.empresa)}" title="Ver contrato">${ICONE_CONTRATO}</a>`
      : `<span class="forn-icone desativado" title="Sem contrato anexado">${ICONE_CONTRATO}</span>`;
    const botaoEditar = `<button type="button" class="forn-icone" data-editar-fornecedor="${f.id}" aria-label="Editar ${escaparHtml(f.empresa)}" title="Editar">${ICONE_EDITAR}</button>`;
    return `
      <div class="forn-linha">
        <button type="button" class="forn-info" data-abrir-fornecedor="${f.id}">
          <span class="forn-empresa">${escaparHtml(f.empresa)}</span>
          <span class="forn-servico">${escaparHtml(f.servico)}</span>
        </button>
        <div class="forn-acoes">
          <span class="selo ${f.status}">${rotuloStatusFornecedor(f)}</span>
          ${botaoContrato}
          ${botaoWpp}
          ${botaoEditar}
        </div>
      </div>
    `;
  }).join('');
}

async function carregarFornecedores() {
  const client = getClient();
  const lista = document.getElementById('fornLista');
  if (!client) { lista.innerHTML = '<p class="estado">Não foi possível conectar.</p>'; return; }
  const { data, error } = await client
    .from('fornecedores')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) { lista.innerHTML = '<p class="estado">Não foi possível carregar os fornecedores.</p>'; return; }
  fornecedoresLista = data || [];
  renderFornecedores();
}

function abrirDetalheFornecedor(id) {
  const f = fornecedoresLista.find((x) => x.id === id);
  if (!f) return;
  document.getElementById('fornDetalheServico').textContent = f.servico;
  document.getElementById('fornDetalheTitulo').textContent = f.empresa;

  const linkWpp = linkWhatsAppFornecedor(f.telefone);
  const reuniaoTexto = f.reuniao_data
    ? `Reunião marcada, agendado para ${escaparHtml(f.reuniao_data)}${f.reuniao_link ? ` — <a href="${escaparHtml(f.reuniao_link)}" target="_blank" rel="noopener">acessar link</a>` : ''}`
    : 'Nenhuma reunião agendada ainda.';

  document.getElementById('fornDetalheCorpo').innerHTML = `
    <div class="forn-detalhe-campo">
      <span class="forn-detalhe-rotulo">Responsável</span>
      <span class="forn-detalhe-valor">${escaparHtml(f.responsavel || '—')}</span>
    </div>
    <div class="forn-detalhe-campo">
      <span class="forn-detalhe-rotulo">Telefone</span>
      <span class="forn-detalhe-valor">${f.telefone ? `<a href="${linkWpp}" target="_blank" rel="noopener">${escaparHtml(f.telefone)}</a>` : '—'}</span>
    </div>
    <div class="forn-detalhe-campo">
      <span class="forn-detalhe-rotulo">Status</span>
      <span class="forn-detalhe-valor">${rotuloStatusFornecedor(f)}</span>
    </div>
    <div class="forn-detalhe-campo">
      <span class="forn-detalhe-rotulo">Reunião</span>
      <span class="forn-detalhe-valor">${reuniaoTexto}</span>
    </div>
    <div class="forn-toggle-linha">
      <span class="forn-detalhe-rotulo" style="margin:0">Confirmação enviada</span>
      <button type="button" class="forn-toggle-btn${f.confirmacao_enviada ? ' ativo' : ''}" data-toggle-forn="${f.id}" data-campo="confirmacao_enviada">${f.confirmacao_enviada ? 'Sim' : 'Não'}</button>
    </div>
    <div class="forn-toggle-linha">
      <span class="forn-detalhe-rotulo" style="margin:0">Confirmação recebida</span>
      <button type="button" class="forn-toggle-btn${f.confirmacao_recebida ? ' ativo' : ''}" data-toggle-forn="${f.id}" data-campo="confirmacao_recebida">${f.confirmacao_recebida ? 'Sim' : 'Não'}</button>
    </div>
  `;
  abrirModal('modalFornDetalhe');
}

document.getElementById('fornDetalheCorpo').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-toggle-forn]');
  if (!btn) return;
  const client = getClient();
  if (!client) return;
  const id = Number(btn.dataset.toggleForn);
  const campo = btn.dataset.campo;
  const f = fornecedoresLista.find((x) => x.id === id);
  if (!f) return;
  const novoValor = !f[campo];
  btn.disabled = true;
  const { error } = await client.from('fornecedores').update({ [campo]: novoValor }).eq('id', id);
  btn.disabled = false;
  if (error) { alert('Não foi possível salvar agora.'); return; }
  f[campo] = novoValor;
  abrirDetalheFornecedor(id);
});

/* ===== adicionar / editar fornecedor ===== */
const fornForm = document.getElementById('fornForm');
const fornFormErro = document.getElementById('fornFormErro');
const fornFormRemover = document.getElementById('fornFormRemover');

function abrirFormFornecedor(id) {
  const f = id ? fornecedoresLista.find((x) => x.id === id) : null;
  document.getElementById('fornFormTitulo').textContent = f ? 'Editar fornecedor' : 'Adicionar fornecedor';
  document.getElementById('fornFormId').value = f ? f.id : '';
  document.getElementById('fornFormServico').value = f ? f.servico : '';
  document.getElementById('fornFormEmpresa').value = f ? f.empresa : '';
  document.getElementById('fornFormResponsavel').value = f ? (f.responsavel || '') : '';
  document.getElementById('fornFormTelefone').value = f ? (f.telefone || '') : '';
  document.getElementById('fornFormStatus').value = f ? f.status : 'pendente';
  document.getElementById('fornFormStatusDetalhe').value = f ? (f.status_detalhe || '') : '';
  document.getElementById('fornFormReuniaoData').value = f ? (f.reuniao_data || '') : '';
  document.getElementById('fornFormReuniaoLink').value = f ? (f.reuniao_link || '') : '';
  fornFormErro.textContent = '';
  fornFormRemover.style.display = f ? 'block' : 'none';
  abrirModal('modalFornForm');
}

document.getElementById('fornLista').addEventListener('click', (e) => {
  const btnAbrir = e.target.closest('[data-abrir-fornecedor]');
  if (btnAbrir) { abrirDetalheFornecedor(Number(btnAbrir.dataset.abrirFornecedor)); return; }
  const btnEditar = e.target.closest('[data-editar-fornecedor]');
  if (btnEditar) { abrirFormFornecedor(Number(btnEditar.dataset.editarFornecedor)); }
});

fabAddFornecedor?.addEventListener('click', () => abrirFormFornecedor(null));

fornForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  fornFormErro.textContent = '';

  const servico = document.getElementById('fornFormServico').value.trim();
  const empresa = document.getElementById('fornFormEmpresa').value.trim();
  if (!servico || !empresa) {
    fornFormErro.textContent = 'Preencha ao menos o serviço e a empresa.';
    return;
  }

  const idBruto = document.getElementById('fornFormId').value;
  const id = idBruto ? Number(idBruto) : null;
  const payload = {
    servico,
    empresa,
    responsavel: document.getElementById('fornFormResponsavel').value.trim() || null,
    telefone: document.getElementById('fornFormTelefone').value.replace(/[^\d+]/g, '') || null,
    status: document.getElementById('fornFormStatus').value,
    status_detalhe: document.getElementById('fornFormStatusDetalhe').value.trim() || null,
    reuniao_data: document.getElementById('fornFormReuniaoData').value.trim() || null,
    reuniao_link: document.getElementById('fornFormReuniaoLink').value.trim() || null,
  };

  const botao = document.getElementById('fornFormSalvar');
  botao.disabled = true;
  botao.textContent = 'Salvando…';

  const client = getClient();
  if (!client) { fornFormErro.textContent = 'Não foi possível conectar agora.'; botao.disabled = false; botao.textContent = 'Salvar'; return; }

  let erro;
  if (id) {
    ({ error: erro } = await client.from('fornecedores').update(payload).eq('id', id));
  } else {
    payload.sort_order = fornecedoresLista.length + 1;
    ({ error: erro } = await client.from('fornecedores').insert(payload));
  }

  botao.disabled = false;
  botao.textContent = 'Salvar';

  if (erro) { fornFormErro.textContent = 'Não foi possível salvar agora. Tente novamente.'; return; }

  fecharModal('modalFornForm');
  carregarFornecedores();
});

fornFormRemover.addEventListener('click', async () => {
  const id = Number(document.getElementById('fornFormId').value);
  if (!id) return;
  const f = fornecedoresLista.find((x) => x.id === id);
  if (!confirm(`Remover o fornecedor "${f?.empresa || ''}"? Essa ação não pode ser desfeita.`)) return;

  const client = getClient();
  if (!client) return;
  fornFormRemover.disabled = true;
  const { error } = await client.from('fornecedores').delete().eq('id', id);
  fornFormRemover.disabled = false;
  if (error) { alert('Não foi possível remover agora.'); return; }

  fecharModal('modalFornForm');
  carregarFornecedores();
});

function carregarTudo() {
  carregarConfirmacoes();
  carregarPresentes();
  carregarRecados();
  carregarAlbum();
  carregarFornecedores();
}
