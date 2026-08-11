/* Recados para nós — integração real com Supabase (public.recados). */

const SUPABASE_URL = 'https://huggafwjjceoekgjzbxi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzOM_a4GHiAiiAThr5N0GA_ZV0bkE4D';

let recadosClient = null;
function getRecadosClient() {
  if (!recadosClient && window.supabase) {
    recadosClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return recadosClient;
}

function escaparHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function cartaoRecadoHtml(r) {
  return `
    <article class="recado-card">
      <span class="recado-aspas" aria-hidden="true">&ldquo;</span>
      <p class="recado-mensagem">${escaparHtml(r.mensagem)}</p>
      <p class="recado-nome">${escaparHtml(r.nome)}</p>
    </article>
  `;
}

/* ===== carrossel automático de um cartão por vez, com fade ===== */
let recadosLista = [];
let recadosIndice = 0;
let recadosTimer = null;
const RECADOS_INTERVALO = 6000;

function renderPontos() {
  const pontos = document.getElementById('recadosPontos');
  if (!pontos) return;
  if (recadosLista.length <= 1) { pontos.innerHTML = ''; return; }
  pontos.innerHTML = recadosLista
    .map((_, i) => `<button type="button" class="recados-ponto${i === recadosIndice ? ' ativo' : ''}" aria-label="Ver recado ${i + 1}" data-indice="${i}"></button>`)
    .join('');
  pontos.querySelectorAll('.recados-ponto').forEach((btn) => {
    btn.addEventListener('click', () => irParaRecado(Number(btn.dataset.indice)));
  });
}

function mostrarRecadoAtual(imediato) {
  const trilho = document.getElementById('recadosTrilho');
  if (!trilho || !recadosLista.length) return;
  const html = cartaoRecadoHtml(recadosLista[recadosIndice]);
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (imediato || reduzMovimento) {
    trilho.innerHTML = html;
    requestAnimationFrame(() => trilho.querySelector('.recado-card')?.classList.add('ativo'));
  } else {
    const atual = trilho.querySelector('.recado-card');
    if (atual) atual.classList.remove('ativo');
    setTimeout(() => {
      trilho.innerHTML = html;
      requestAnimationFrame(() => trilho.querySelector('.recado-card')?.classList.add('ativo'));
    }, 420);
  }
  renderPontos();
}

function irParaRecado(indice) {
  if (!recadosLista.length) return;
  recadosIndice = ((indice % recadosLista.length) + recadosLista.length) % recadosLista.length;
  mostrarRecadoAtual(false);
  reiniciarAutoplay();
}

function avancarRecado() { irParaRecado(recadosIndice + 1); }
function voltarRecado() { irParaRecado(recadosIndice - 1); }

function pararAutoplay() { if (recadosTimer) { clearInterval(recadosTimer); recadosTimer = null; } }
function iniciarAutoplay() {
  pararAutoplay();
  if (recadosLista.length <= 1) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  recadosTimer = setInterval(() => irParaRecado(recadosIndice + 1), RECADOS_INTERVALO);
}
function reiniciarAutoplay() { iniciarAutoplay(); }

function renderRecados(lista) {
  const trilho = document.getElementById('recadosTrilho');
  const pontos = document.getElementById('recadosPontos');
  recadosLista = lista;
  recadosIndice = 0;
  if (!trilho) return;
  if (!lista.length) {
    trilho.innerHTML = '<p class="recados-estado">Seja a primeira pessoa a deixar um recado para Luana &amp; Heitor.</p>';
    if (pontos) pontos.innerHTML = '';
    pararAutoplay();
    return;
  }
  mostrarRecadoAtual(true);
  iniciarAutoplay();
}

async function carregarRecados() {
  const trilho = document.getElementById('recadosTrilho');
  if (trilho) trilho.innerHTML = '<p class="recados-estado">Carregando recados…</p>';
  pararAutoplay();

  const client = getRecadosClient();
  if (!client) {
    if (trilho) trilho.innerHTML = '<p class="recados-estado">Não foi possível carregar os recados agora.</p>';
    return;
  }

  const { data, error } = await client
    .from('recados')
    .select('id, nome, mensagem, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    if (trilho) trilho.innerHTML = '<p class="recados-estado">Não foi possível carregar os recados agora.</p>';
    return;
  }
  renderRecados(data || []);
}

document.addEventListener('DOMContentLoaded', () => {
  const btnAnterior = document.getElementById('recadoAnterior');
  const btnProximo = document.getElementById('recadoProximo');
  const viewport = document.getElementById('recadosViewport');
  if (btnAnterior) btnAnterior.addEventListener('click', voltarRecado);
  if (btnProximo) btnProximo.addEventListener('click', avancarRecado);
  if (viewport) {
    viewport.addEventListener('pointerenter', pararAutoplay);
    viewport.addEventListener('pointerleave', iniciarAutoplay);
    viewport.addEventListener('focusin', pararAutoplay);
    viewport.addEventListener('focusout', iniciarAutoplay);
  }

  const form = document.getElementById('formRecado');
  const erroEl = document.getElementById('recadoErro');
  const submitBtn = document.getElementById('recadoSubmitBtn');
  const confirmacaoEl = document.getElementById('recadosConfirmacao');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      erroEl.textContent = '';
      erroEl.classList.remove('mostrar');

      const nome = form.nome.value.trim();
      const mensagem = form.mensagem.value.trim();
      if (!nome || !mensagem) {
        erroEl.textContent = 'Preencha seu nome e uma mensagem antes de enviar.';
        erroEl.classList.add('mostrar');
        return;
      }

      const client = getRecadosClient();
      if (!client) {
        erroEl.textContent = 'Não foi possível conectar agora. Tente novamente em instantes.';
        erroEl.classList.add('mostrar');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
      const textoOriginal = submitBtn.textContent;
      submitBtn.textContent = 'Enviando…';

      const { error } = await client.from('recados').insert({ nome, mensagem });

      submitBtn.disabled = false;
      submitBtn.removeAttribute('aria-busy');
      submitBtn.textContent = textoOriginal;

      if (error) {
        erroEl.textContent = 'Não foi possível enviar seu recado agora. Tente novamente em instantes.';
        erroEl.classList.add('mostrar');
        return;
      }

      form.reset();
      fecharModal('modalRecado');
      carregarRecados();
      if (confirmacaoEl) {
        confirmacaoEl.textContent = 'Obrigado! Seu recado foi publicado.';
        confirmacaoEl.classList.add('mostrar');
        setTimeout(() => confirmacaoEl.classList.remove('mostrar'), 4500);
      }
    });
  }

  carregarRecados();
});
