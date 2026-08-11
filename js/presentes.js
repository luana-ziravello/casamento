/* Lista de presentes — dados reais vindos do Supabase (public.gifts) e pagamento via Mercado Pago. */

const SUPABASE_URL = 'https://huggafwjjceoekgjzbxi.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BzOM_a4GHiAiiAThr5N0GA_ZV0bkE4D';

let presentesClient = null;
function getPresentesClient() {
  if (!presentesClient && window.supabase) {
    presentesClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return presentesClient;
}

const PALETA = {
  coral: '#FF6A2E',
  rosa: '#FF2D82',
  dourado: '#C89638',
  tinta: '#3A2A1E',
};

const CORES_ROTATIVAS = [PALETA.coral, PALETA.rosa, PALETA.dourado];

const ICONES = [
  `<rect x="46" y="60" width="68" height="46" rx="4"/><rect x="46" y="60" width="68" height="14" rx="2"/><line x1="80" y1="60" x2="80" y2="106"/><path d="M80 60 Q64 40 54 50 Q50 58 62 60Z"/><path d="M80 60 Q96 40 106 50 Q110 58 98 60Z"/>`,
  `<path d="M46 92 L46 58 L80 34 L114 58 L114 92 Z"/><path d="M68 92 L68 70 L92 70 L92 92"/>`,
  `<path d="M56 42 L56 70 Q56 84 70 84 L90 84 Q104 84 104 70 L104 42"/><path d="M64 42 L64 60 M80 42 L80 60 M96 42 L96 60"/><path d="M80 84 L80 104"/>`,
  `<circle cx="80" cy="62" r="26"/><path d="M68 62 L77 71 L94 52"/>`,
  `<path d="M80 100 L80 60"/><path d="M80 60 C60 60 52 44 56 28 C72 28 84 40 80 60 Z"/><path d="M80 66 C100 66 108 50 104 34 C88 34 76 46 80 66 Z"/>`,
];

const formatoPreco = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

let PRESENTES = [];
let PRESENTES_DADOS = new Set(); // ids de presentes já pagos (status approved)
let presenteSelecionadoIndice = null;

function ilustracaoAquarela(cor, iconeSvg, seed) {
  return `<svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
    <defs><filter id="wc${seed}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>
    <ellipse cx="76" cy="86" rx="52" ry="42" fill="${cor}" opacity="0.15" filter="url(#wc${seed})"/>
    <ellipse cx="100" cy="58" rx="30" ry="24" fill="${cor}" opacity="0.12" filter="url(#wc${seed})"/>
    <g stroke="${PALETA.tinta}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">${iconeSvg}</g>
  </svg>`;
}

function corParaIndice(i) { return CORES_ROTATIVAS[i % CORES_ROTATIVAS.length]; }
function iconeParaIndice(i) { return ICONES[i % ICONES.length]; }

function montarGrade() {
  const grade = document.getElementById('gradePresentes');
  if (!grade) return;
  if (!PRESENTES.length) {
    grade.innerHTML = '<p class="recados-estado">Não foi possível carregar a lista de presentes agora.</p>';
    return;
  }
  grade.innerHTML = '';
  PRESENTES.forEach((p, i) => {
    const cor = corParaIndice(i);
    const dado = PRESENTES_DADOS.has(p.id);
    const card = document.createElement('div');
    card.className = 'presente' + (dado ? ' dado' : '');
    card.innerHTML = `
      <div class="presente-ilustracao" style="background: radial-gradient(circle at 50% 45%, var(--tinta-clara) 35%, var(--areia-1) 100%)">
        ${ilustracaoAquarela(cor, iconeParaIndice(i), i)}
      </div>
      <div class="presente-corpo">
        ${dado ? '<span class="presente-selo">Já presenteado</span>' : ''}
        <h3 class="presente-nome">${p.name}</h3>
        <div class="presente-rodape">
          <span class="presente-preco">${formatoPreco.format(p.price)}</span>
          <button class="presentear-btn" onclick="abrirModalPresente(${i})" ${dado ? 'disabled' : ''}>${dado ? 'Presenteado' : 'Presentear'}</button>
        </div>
      </div>
    `;
    grade.appendChild(card);
  });
}

function abrirModalPresente(i) {
  presenteSelecionadoIndice = i;
  const p = PRESENTES[i];
  const cor = corParaIndice(i);
  const ilustracao = document.getElementById('modalIlustracao');
  ilustracao.innerHTML = ilustracaoAquarela(cor, iconeParaIndice(i), 'm' + i);
  ilustracao.style.background = 'radial-gradient(circle at 50% 45%, var(--tinta-clara) 35%, var(--areia-1) 100%)';
  ilustracao.style.border = '1px solid var(--linha)';
  ilustracao.style.padding = '10px';
  document.getElementById('modalPresenteNome').textContent = p.name;
  document.getElementById('modalPreco').textContent = formatoPreco.format(p.price);

  const erroEl = document.getElementById('modalErroPagamento');
  erroEl.textContent = '';
  erroEl.classList.remove('mostrar');
  const btn = document.getElementById('btnPagarPresente');
  btn.disabled = false;
  btn.textContent = 'Pagar com Mercado Pago';

  abrirModal('modalPresente');
}

async function pagarPresenteAtual() {
  if (presenteSelecionadoIndice === null) return;
  const presente = PRESENTES[presenteSelecionadoIndice];
  const btn = document.getElementById('btnPagarPresente');
  const erroEl = document.getElementById('modalErroPagamento');

  erroEl.textContent = '';
  erroEl.classList.remove('mostrar');
  btn.disabled = true;
  btn.textContent = 'Preparando pagamento…';

  try {
    const resposta = await fetch(`${SUPABASE_URL}/functions/v1/mp-create-preference`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ giftId: presente.id }),
    });
    const dados = await resposta.json();

    if (!resposta.ok || !dados.checkoutUrl) {
      throw new Error(dados?.error || 'Não foi possível iniciar o pagamento.');
    }

    window.location.href = dados.checkoutUrl;
  } catch (erro) {
    erroEl.textContent = 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.';
    erroEl.classList.add('mostrar');
    btn.disabled = false;
    btn.textContent = 'Pagar com Mercado Pago';
  }
}

function mostrarBannerPagamento() {
  const container = document.getElementById('bannerPagamento');
  if (!container) return;
  const params = new URLSearchParams(window.location.search);
  const status = params.get('pagamento');
  if (!status) return;

  const mensagens = {
    aprovado: { classe: 'aprovado', texto: 'Pagamento aprovado! Muito obrigado pelo carinho — o presente já foi registrado.' },
    pendente: { classe: '', texto: 'Recebemos seu pagamento e estamos aguardando a confirmação. Assim que aprovado, o presente é atualizado aqui.' },
    recusado: { classe: 'recusado', texto: 'Não foi possível concluir esse pagamento. Fique à vontade para tentar novamente.' },
  };
  const info = mensagens[status];
  if (!info) return;

  container.innerHTML = `<div class="banner-pagamento ${info.classe}">${info.texto}</div>`;
  window.history.replaceState({}, '', window.location.pathname);
}

async function carregarPresentesDados() {
  const client = getPresentesClient();
  if (!client) return;
  const { data, error } = await client
    .from('gift_orders')
    .select('gift_id, status')
    .eq('status', 'approved');
  if (error) return;
  PRESENTES_DADOS = new Set((data || []).map((o) => o.gift_id));
}

async function carregarPresentes() {
  const grade = document.getElementById('gradePresentes');
  if (grade) grade.innerHTML = '<p class="recados-estado">Carregando presentes…</p>';

  const client = getPresentesClient();
  if (!client) {
    if (grade) grade.innerHTML = '<p class="recados-estado">Não foi possível carregar a lista de presentes agora.</p>';
    return;
  }

  const [presentesRes] = await Promise.all([
    client.from('gifts').select('id, name, price, active, sort_order').eq('active', true).order('sort_order', { ascending: true }),
    carregarPresentesDados(),
  ]);

  if (presentesRes.error) {
    if (grade) grade.innerHTML = '<p class="recados-estado">Não foi possível carregar a lista de presentes agora.</p>';
    return;
  }
  PRESENTES = presentesRes.data || [];
  montarGrade();
}

mostrarBannerPagamento();
carregarPresentes();
