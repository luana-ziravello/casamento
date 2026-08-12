/* Confirmação de presença — integração real com Supabase (public.guests). */

const SUPABASE_URL = 'https://huggafwjjceoekgjzbxi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzOM_a4GHiAiiAThr5N0GA_ZV0bkE4D';

let confirmacaoClient = null;
function getConfirmacaoClient() {
  if (!confirmacaoClient && window.supabase) {
    confirmacaoClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return confirmacaoClient;
}

const form = document.getElementById('formBusca');
const campo = document.getElementById('campoFamilia');
const resultado = document.getElementById('resultado');
const naoEncontrado = document.getElementById('naoEncontrado');
const sucesso = document.getElementById('sucesso');

let todosConvidados = [];
let grupos = []; // grupos atualmente renderizados: [{ familia, convidados: [...] }]

function normalizar(texto) {
  return (texto ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function notificarConfirmacao(familia, convidados) {
  fetch(`${SUPABASE_URL}/functions/v1/notify-confirmacao`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` },
    body: JSON.stringify({ familia, convidados }),
  }).catch(() => { /* aviso por e-mail é best-effort, não bloqueia a confirmação */ });
}

function escaparHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

async function carregarConvidados() {
  const client = getConfirmacaoClient();
  if (!client) return;
  const { data, error } = await client
    .from('guests')
    .select('id, guest_name, family_name, confirmed');
  if (error) return;
  todosConvidados = data || [];
}

function iconeCheckSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="var(--rosa-texto)" stroke-width="1.4"/><path d="M8 12l3 3 6-6" stroke="var(--rosa-texto)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function grupoHtml(grupo, idx) {
  const linhas = grupo.convidados.map((c) => `
    <div class="convidado">
      <span class="convidado-nome">${escaparHtml(c.guest_name)}</span>
      <label class="toggle-presenca">
        <input type="checkbox" class="toggle-input" id="convidado-${idx}-${c.id}" data-guest-id="${c.id}">
        <span class="toggle-rotulo toggle-rotulo-nao">Não</span>
        <span class="toggle-trilho" aria-hidden="true"><span class="toggle-bolinha"></span></span>
        <span class="toggle-rotulo toggle-rotulo-sim">Sim</span>
      </label>
    </div>
  `).join('');

  return `
    <div class="grupo-familia" id="grupo-${idx}">
      <div class="familia-cabecalho">
        <h3>${escaparHtml(grupo.familia)}</h3>
        <p>Marque quem vai comparecer:</p>
      </div>
      <div>${linhas}</div>
      <div class="resultado-rodape">
        <span class="grupo-erro" id="grupoErro-${idx}"></span>
        <button class="btn btn-primario" type="button" onclick="confirmarGrupo(${idx})">Confirmar presença</button>
      </div>
    </div>
  `;
}

function buscar(termo) {
  sucesso.classList.remove('mostrar');
  const alvo = normalizar(termo);
  if (!alvo) return;

  const encontrados = todosConvidados.filter((c) =>
    normalizar(c.family_name).includes(alvo) || normalizar(c.guest_name).includes(alvo)
  );

  if (!encontrados.length) {
    resultado.classList.remove('mostrar');
    naoEncontrado.classList.add('mostrar');
    return;
  }

  naoEncontrado.classList.remove('mostrar');

  const porFamilia = new Map();
  encontrados.forEach((c) => {
    const chave = c.family_name || c.guest_name;
    if (!porFamilia.has(chave)) porFamilia.set(chave, []);
    porFamilia.get(chave).push(c);
  });

  grupos = [...porFamilia.entries()].map(([familia, convidados]) => ({ familia, convidados }));

  if (grupos.length > 1) {
    renderSeletorFamilias();
  } else {
    resultado.innerHTML = grupoHtml(grupos[0], 0);
  }
  resultado.classList.add('mostrar');
}

function renderSeletorFamilias() {
  const opcoes = grupos.map((g, i) => {
    const qtd = g.convidados.length;
    return `<option value="${i}">${escaparHtml(g.familia)} (${qtd} ${qtd === 1 ? 'pessoa' : 'pessoas'})</option>`;
  }).join('');
  resultado.innerHTML = `
    <div class="seletor-familia">
      <label for="seletorFamilia">Encontramos mais de uma família com esse nome — qual é a sua?</label>
      <select id="seletorFamilia" onchange="mostrarGrupoEscolhido(this.value)">${opcoes}</select>
    </div>
    <div id="grupoEscolhido"></div>
  `;
  mostrarGrupoEscolhido(0);
}

function mostrarGrupoEscolhido(idx) {
  const container = document.getElementById('grupoEscolhido');
  if (container) container.innerHTML = grupoHtml(grupos[Number(idx)], Number(idx));
}

async function confirmarGrupo(idx) {
  const grupoEl = document.getElementById(`grupo-${idx}`);
  const erroEl = document.getElementById(`grupoErro-${idx}`);
  if (!grupoEl) return;

  const client = getConfirmacaoClient();
  if (!client) {
    if (erroEl) erroEl.textContent = 'Não foi possível conectar agora. Tente novamente em instantes.';
    return;
  }

  const botao = grupoEl.querySelector('.resultado-rodape .btn');
  const checkboxes = [...grupoEl.querySelectorAll('input[type="checkbox"]')];
  if (botao) { botao.disabled = true; botao.textContent = 'Enviando…'; }
  if (erroEl) erroEl.textContent = '';

  const agora = new Date().toISOString();
  const atualizacoes = checkboxes.map((cb) =>
    client.from('guests').update({ confirmed: cb.checked, confirmed_at: agora }).eq('id', Number(cb.dataset.guestId))
  );

  const resultados = await Promise.all(atualizacoes);
  const comErro = resultados.some((r) => r.error);

  if (comErro) {
    if (erroEl) erroEl.textContent = 'Não foi possível salvar agora. Tente novamente em instantes.';
    if (botao) { botao.disabled = false; botao.textContent = 'Confirmar presença'; }
    return;
  }

  checkboxes.forEach((cb) => {
    const guestId = Number(cb.dataset.guestId);
    const alvo = todosConvidados.find((c) => c.id === guestId);
    if (alvo) alvo.confirmed = cb.checked;
  });

  const familiaNome = grupos[idx]?.familia || '';
  const resumoConvidados = checkboxes.map((cb) => {
    const guestId = Number(cb.dataset.guestId);
    const convidado = grupos[idx]?.convidados.find((c) => c.id === guestId);
    return { nome: convidado?.guest_name || '', confirmado: cb.checked };
  });
  notificarConfirmacao(familiaNome, resumoConvidados);
  grupoEl.innerHTML = `<p class="grupo-confirmado">${iconeCheckSvg()} Presença de <strong>${escaparHtml(familiaNome)}</strong> confirmada — obrigado!</p>`;

  // No modo com dropdown, só uma família fica visível por vez — confirmar essa já basta.
  const modoSeletor = !!document.getElementById('seletorFamilia');
  const confirmados = resultado.querySelectorAll('.grupo-confirmado').length;
  if (modoSeletor || confirmados >= grupos.length) {
    resultado.classList.remove('mostrar');
    sucesso.classList.add('mostrar');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  buscar(campo.value);
});

document.addEventListener('DOMContentLoaded', carregarConvidados);
