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
    .select('id, guest_name, family_name, confirmed, search_group, search_aliases');
  if (error) return;
  todosConvidados = data || [];
}

function pilhaBusca(c) {
  return normalizar([c.guest_name, c.family_name, c.search_aliases].filter(Boolean).join(' '));
}

function chaveGrupo(c) {
  return c.search_group || c.family_name || c.guest_name;
}

function iconeCheckSvg() {
  return '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="var(--rosa-texto)" stroke-width="1.4"/><path d="M8 12l3 3 6-6" stroke="var(--rosa-texto)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function grupoHtml(grupo, idx) {
  const linhas = grupo.convidados.map((c) => `
    <div class="convidado">
      <span class="convidado-nome">${escaparHtml(c.guest_name)}</span>
      <label class="toggle-presenca">
        <input type="checkbox" class="toggle-input" id="convidado-${idx}-${c.id}" data-guest-id="${c.id}" ${c.confirmed === true ? 'checked' : ''}>
        <span class="toggle-rotulo toggle-rotulo-nao">Não</span>
        <span class="toggle-trilho" aria-hidden="true"><span class="toggle-bolinha"></span></span>
        <span class="toggle-rotulo toggle-rotulo-sim">Sim</span>
      </label>
    </div>
  `).join('');

  const rotuloBotao = grupo.convidados.length > 1 ? 'Salvar confirmações' : 'Confirmar presença';

  return `
    <div class="grupo-familia" id="grupo-${idx}">
      <div class="familia-cabecalho">
        <h3>${escaparHtml(grupo.familia)}</h3>
        <p>Marque quem vai comparecer:</p>
      </div>
      <div>${linhas}</div>
      <div class="resultado-rodape">
        <span class="grupo-erro" id="grupoErro-${idx}"></span>
        <button class="btn btn-primario" type="button" onclick="confirmarGrupo(${idx})">${rotuloBotao}</button>
      </div>
    </div>
  `;
}

function mensagemResultadoHtml(convidados) {
  const confirmados = convidados.filter((c) => c.confirmado);
  const naoConfirmados = convidados.filter((c) => !c.confirmado);

  if (!naoConfirmados.length) {
    return `<div class="grupo-resultado grupo-resultado-positivo">${iconeCheckSvg()}<p>Presença confirmada! Mal podemos esperar para celebrar esse dia com vocês. 💛</p></div>`;
  }

  if (!confirmados.length) {
    return `<div class="grupo-resultado grupo-resultado-negativo"><p>É uma pena que vocês não poderão estar conosco nesse dia. Sentiremos a falta de vocês, mas agradecemos muito pelo carinho!</p></div>`;
  }

  const listaConfirmados = confirmados.map((c) => `<li>${escaparHtml(c.nome)} <span class="marca-sim">✓</span></li>`).join('');
  const listaNao = naoConfirmados.map((c) => `<li>${escaparHtml(c.nome)}</li>`).join('');
  const rotuloNao = naoConfirmados.length > 1 ? 'Não poderão comparecer' : 'Não poderá comparecer';

  return `
    <div class="grupo-resultado grupo-resultado-misto">
      <p class="grupo-resultado-rotulo">Confirmados</p>
      <ul class="grupo-resultado-lista">${listaConfirmados}</ul>
      <p class="grupo-resultado-rotulo">${rotuloNao}</p>
      <ul class="grupo-resultado-lista grupo-resultado-lista-nao">${listaNao}</ul>
      <p class="grupo-resultado-mensagem">Obrigada por confirmar! Ficamos muito felizes em saber quem estará conosco para celebrar esse dia tão especial.</p>
    </div>
  `;
}

function buscar(termo) {
  sucesso.classList.remove('mostrar');
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return;

  // bate se TODAS as palavras digitadas aparecem em algum lugar (nome, família ou termos de
  // busca/apelidos) — assim "Márcia Alves" já vai direto pro grupo certo, sem ambiguidade,
  // e apelidos/variações cadastrados (ex.: "Zé" pro José) também encontram o grupo certo.
  const encontrados = todosConvidados.filter((c) => {
    const pilha = pilhaBusca(c);
    return palavras.every((p) => pilha.includes(p));
  });

  if (!encontrados.length) {
    resultado.classList.remove('mostrar');
    naoEncontrado.classList.add('mostrar');
    return;
  }

  naoEncontrado.classList.remove('mostrar');

  // expande cada acerto pro grupo (household) inteiro — não só quem bateu com o termo.
  const chavesEncontradas = new Set(encontrados.map(chaveGrupo));
  const porGrupo = new Map();
  chavesEncontradas.forEach((chave) => {
    const membros = todosConvidados.filter((c) => chaveGrupo(c) === chave);
    const familia = membros[0]?.family_name || membros[0]?.guest_name || '';
    porGrupo.set(chave, { familia, convidados: membros });
  });

  grupos = [...porGrupo.values()];

  if (grupos.length > 1) {
    renderSeletorFamilias();
  } else {
    resultado.innerHTML = grupoHtml(grupos[0], 0);
  }
  resultado.classList.add('mostrar');
}

function renderSeletorFamilias() {
  // se mais de um grupo do resultado tiver o mesmo nome de família, mostra os nomes
  // de quem está em cada um pra dar pra diferenciar (ex.: duas famílias "Alves" distintas).
  const contagemFamilia = {};
  grupos.forEach((g) => { contagemFamilia[g.familia] = (contagemFamilia[g.familia] || 0) + 1; });

  const pilulas = grupos.map((g, i) => {
    const precisaDesambiguar = contagemFamilia[g.familia] > 1;
    const detalhe = precisaDesambiguar
      ? `<span class="pilula-detalhe">${escaparHtml(g.convidados.map((c) => c.guest_name).join(', '))}</span>`
      : '';
    return `<button type="button" class="pilula-grupo" id="pilula-${i}" onclick="mostrarGrupoEscolhido(${i})"><span>${escaparHtml(g.familia)}${detalhe}</span><span class="pilula-mais" aria-hidden="true">+</span></button>`;
  }).join('');

  resultado.innerHTML = `
    <div class="selecao-grupos">
      <p class="selecao-grupos-label">Encontramos mais de uma opção — qual é a sua?</p>
      <div class="selecao-grupos-lista">${pilulas}</div>
    </div>
    <div id="grupoEscolhido"></div>
  `;
}

function mostrarGrupoEscolhido(idx) {
  idx = Number(idx);
  document.querySelectorAll('.pilula-grupo').forEach((btn, i) => btn.classList.toggle('ativa', i === idx));
  const container = document.getElementById('grupoEscolhido');
  if (container) container.innerHTML = grupoHtml(grupos[idx], idx);
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
  const rotuloOriginal = botao ? botao.textContent : 'Confirmar presença';
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
    if (botao) { botao.disabled = false; botao.textContent = rotuloOriginal; }
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
  grupoEl.innerHTML = mensagemResultadoHtml(resumoConvidados);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  buscar(campo.value);
});

document.addEventListener('DOMContentLoaded', carregarConvidados);
