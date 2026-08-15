/* Lista de presentes — dados reais vindos do Supabase (public.gifts), carrinho e pagamento via Mercado Pago. */

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
  coral: '#F46B30',
  rosa: '#E82F5D',
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
const CHAVE_CARRINHO = 'carrinho-presentes-luana-heitor';

let PRESENTES = [];
let carrinho = new Set(); // ids selecionados
let ordenacao = 'preco-desc';
let filtroPreco = { min: 0, max: 0 };
let limitesPreco = { min: 0, max: 0 };

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
function presentePorId(id) { return PRESENTES.find((p) => p.id === id); }

/* ===== fotos reais (Unsplash) por presente — id do presente no banco -> id da foto no Unsplash ===== */
const IMAGENS_PRESENTES = {
  1: '1630784392728-8aa0a1c07d7e', 2: '1605117012605-b68dedd4accc', 3: '1610821165540-80c084d50fd3',
  4: '1680206893968-01fe5583f6b5', 5: '1638780506095-3d61a4f0edd6', 6: '1668585419087-55097ab1d520',
  7: '1536392706976-e486e2ba97af', 8: '1561239905-d620f213c5f7', 9: '1582379492269-199bcdc53cba',
  10: '1533616688419-b7a585564566', 11: '1493711662062-fa541adb3fc8', 12: '1600728619239-d2a73f7aa541',
  13: '1707063017149-a3cd268776c4', 14: '1593504049359-74330189a345', 15: '1636714507452-48716cfa1818',
  16: '1610632380989-680fe40816c6', 17: '1505740420928-5e560c06d30e', 18: '1547595628-c61a29f496f0',
  19: '1619695662967-3e739a597f47', 20: '1626218174358-7769486c4b79', 21: '1683624328172-88fb24625ec1',
  22: '1605497788044-5a32c7078486', 23: '1562673478-900ecbd319cf', 24: '1571115637435-26e423673f7b',
  25: '1582735689369-4fe89db7114c', 26: '1590610994353-7b0e7546e681', 27: '1621318551436-68573392fd5c',
  28: '1580116270858-8a0d62b15426', 29: '1590610994353-7b0e7546e681', 30: '1595944356863-e624f8234e1e',
  31: '1580116270858-8a0d62b15426', 32: '1678572823447-45fc146df43c', 33: '1562673478-900ecbd319cf',
  34: '1621318551436-68573392fd5c', 35: '1583847268964-b28dc8f51f92', 36: '1709429790175-b02bb1b19207',
  37: '1583847268964-b28dc8f51f92', 38: '1641924676578-ed2792eb24de', 39: '1772800562154-2a321e304f19',
  40: '1561239905-d620f213c5f7', 41: '1600728619239-d2a73f7aa541', 42: '1600725935160-f67ee4f6084a',
  43: '1601598851547-4302969d0614', 44: '1621523132966-19f711d565d1', 45: '1515377905703-c4788e51af15',
  46: '1772800562154-2a321e304f19', 47: '1602516793068-35b73edf3368', 48: '1608354580875-30bd4168b351',
  49: '1566759996874-04d713cc224a', 50: '1414235077428-338989a2e8c0', 51: '1618773928121-c32242e63f39',
  52: '1602516793068-35b73edf3368', 53: '1502301197179-65228ab57f78', 54: '1619695662967-3e739a597f47',
  55: '1558317374-067fb5f30001', 56: '1721617864119-611e4544ff07', 57: '1602516793068-35b73edf3368',
  58: '1502301197179-65228ab57f78', 59: '1540961403310-79825242906e', 60: '1414235077428-338989a2e8c0',
  61: '1566759996874-04d713cc224a', 62: '1414235077428-338989a2e8c0', 63: '1626266061368-46a8f578ddd6',
  64: '1618773928121-c32242e63f39', 65: '1602516793068-35b73edf3368', 66: '1536392706976-e486e2ba97af',
  67: '1566759996874-04d713cc224a', 68: '1583847268964-b28dc8f51f92', 69: '1721617864119-611e4544ff07',
};

/* ===== fotos próprias enviadas por vocês — têm prioridade sobre as do Unsplash ===== */
const IMAGENS_LOCAIS = {
  1: 'imagens/presentes/varal.jpg',
  2: 'imagens/presentes/jarra-le-creuset.jpg',
  3: 'imagens/presentes/conjunto-copos.jpg',
  5: 'imagens/presentes/organizadores-casa.jpg',
  8: 'imagens/presentes/cafe-manha-lua-mel.jpg',
  9: 'imagens/presentes/sobremesa-lua-mel.jpg',
  11: 'imagens/presentes/brawl-pass.jpg',
  12: 'imagens/presentes/delivery-pos-festa.jpg',
  13: 'imagens/presentes/cinema.jpg',
  15: 'imagens/presentes/aromatizadores.jpg',
  17: 'imagens/presentes/spotify.jpg',
  18: 'imagens/presentes/garrafa-vinho.jpg',
  19: 'imagens/presentes/spa.jpg',
  20: 'imagens/presentes/heitor-nerd.jpg',
  23: 'imagens/presentes/forminha-gelo.jpg',
  25: 'imagens/presentes/pregador-embalagem.jpg',
  26: 'imagens/presentes/porta-esponja.jpg',
  29: 'imagens/presentes/tapete-pia.jpg',
  30: 'imagens/presentes/porta-chave.jpg',
  31: 'imagens/presentes/porta-tempero.jpg',
  39: 'imagens/presentes/fonte-agua.jpg',
  43: 'imagens/presentes/compra-mercado.jpg',
  45: 'imagens/presentes/massagem-pes.jpg',
  46: 'imagens/presentes/mordomia-gato.jpg',
  48: 'imagens/presentes/cafeteira.jpg',
  52: 'imagens/presentes/fundo-emergencial.jpg',
  54: 'imagens/presentes/spa.jpg',
  55: 'imagens/presentes/robo-aspirador.jpg',
  57: 'imagens/presentes/decoracao-impulsiva.jpg',
  58: 'imagens/presentes/excesso-bagagem.jpg',
  76: 'imagens/presentes/tapete-chique.jpg',
  77: 'imagens/presentes/cortinas.jpg',
  78: 'imagens/presentes/panela-eletrica.jpg',
  79: 'imagens/presentes/utensilios-cozinha.jpg',
  81: 'imagens/presentes/ferro-passar.jpg',
  82: 'imagens/presentes/caixa-ferramentas.jpg',
  83: 'imagens/presentes/porta-retrato.jpg',
  85: 'imagens/presentes/cervejeira.jpg',
  86: 'imagens/presentes/microondas.jpg',
  88: 'imagens/presentes/cepo-facas.jpg',
  89: 'imagens/presentes/jogo-panelas.jpg',
  91: 'imagens/presentes/batedeira.jpg',
  92: 'imagens/presentes/faqueiro.jpg',
  93: 'imagens/presentes/fogao.jpg',
  96: 'imagens/presentes/capacete.jpg',
  97: 'imagens/presentes/peugeot.jpg',
  98: 'imagens/presentes/liquidificador.jpg',
  99: 'imagens/presentes/corinthians.jpg',
  100: 'imagens/presentes/pedido-casamento.jpg',
  101: 'imagens/presentes/airfryer.jpg',
  102: 'imagens/presentes/jogo-de-lencol.jpg',
  103: 'imagens/presentes/mensalidade-pos.jpg',
  104: 'imagens/presentes/fusca-azul.jpg',
  105: 'imagens/presentes/suborno.jpg',
};

function imagemPresenteUrl(id) {
  if (IMAGENS_LOCAIS[id]) return IMAGENS_LOCAIS[id];
  const fotoId = IMAGENS_PRESENTES[id];
  if (!fotoId) return null;
  return `https://images.unsplash.com/photo-${fotoId}?w=500&h=500&fit=crop&auto=format&q=75`;
}

/* ===== persistência simples do carrinho (sobrevive a reload) ===== */
function salvarCarrinho() {
  try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify([...carrinho])); } catch { /* localStorage indisponível, segue sem persistir */ }
}
function restaurarCarrinho() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) || '[]');
    carrinho = new Set(salvo.filter((id) => Number.isInteger(id)));
  } catch { carrinho = new Set(); }
}

/* ===== ordenação e filtro de faixa de preço ===== */
function inicializarFiltroPreco() {
  const precos = PRESENTES.map((p) => Number(p.price));
  if (!precos.length) return;
  limitesPreco.min = Math.floor(Math.min(...precos) / 10) * 10;
  limitesPreco.max = Math.ceil(Math.max(...precos) / 10) * 10;
  filtroPreco.min = limitesPreco.min;
  filtroPreco.max = limitesPreco.max;

  const inputMin = document.getElementById('filtroPrecoMin');
  const inputMax = document.getElementById('filtroPrecoMax');
  if (!inputMin || !inputMax) return;
  [inputMin, inputMax].forEach((el) => {
    el.min = String(limitesPreco.min);
    el.max = String(limitesPreco.max);
    el.step = '10';
  });
  inputMin.value = String(limitesPreco.min);
  inputMax.value = String(limitesPreco.max);
  atualizarVisualFiltroPreco();
}

function aoMoverFiltroPreco() {
  const inputMin = document.getElementById('filtroPrecoMin');
  const inputMax = document.getElementById('filtroPrecoMax');
  if (!inputMin || !inputMax) return;
  let min = Number(inputMin.value);
  let max = Number(inputMax.value);
  // impede que os dois cabos do range se cruzem
  if (min > max) {
    if (document.activeElement === inputMax) { max = min; inputMax.value = String(max); }
    else { min = max; inputMin.value = String(min); }
  }
  filtroPreco.min = min;
  filtroPreco.max = max;
  atualizarVisualFiltroPreco();
  montarGrade();
}

function atualizarVisualFiltroPreco() {
  const { min, max } = limitesPreco;
  const amplitude = Math.max(max - min, 1);
  const pctMin = ((filtroPreco.min - min) / amplitude) * 100;
  const pctMax = ((filtroPreco.max - min) / amplitude) * 100;
  const preenchido = document.getElementById('filtroPrecoPreenchido');
  if (preenchido) {
    preenchido.style.left = pctMin + '%';
    preenchido.style.right = (100 - pctMax) + '%';
  }
  const valores = document.getElementById('filtroPrecoValores');
  if (valores) valores.textContent = `${formatoPreco.format(filtroPreco.min)} – ${formatoPreco.format(filtroPreco.max)}`;
}

function aoMudarOrdenacao(valor) {
  ordenacao = valor;
  montarGrade();
}

function presentesVisiveis() {
  let lista = PRESENTES.filter((p) => {
    const preco = Number(p.price);
    return preco >= filtroPreco.min && preco <= filtroPreco.max;
  });
  if (ordenacao === 'preco-asc') lista = [...lista].sort((a, b) => Number(a.price) - Number(b.price));
  else if (ordenacao === 'preco-desc') lista = [...lista].sort((a, b) => Number(b.price) - Number(a.price));
  return lista;
}

function montarGrade() {
  const grade = document.getElementById('gradePresentes');
  if (!grade) return;
  if (!PRESENTES.length) {
    grade.innerHTML = '<p class="recados-estado">Não foi possível carregar a lista de presentes agora.</p>';
    return;
  }
  const visiveis = presentesVisiveis();
  if (!visiveis.length) {
    grade.innerHTML = '<p class="recados-estado">Nenhum presente encontrado nessa faixa de preço.</p>';
    return;
  }
  grade.innerHTML = '';
  visiveis.forEach((p) => {
    const i = PRESENTES.indexOf(p);
    const cor = corParaIndice(i);
    const selecionado = carrinho.has(p.id);
    const fotoUrl = imagemPresenteUrl(p.id);
    const conteudoIlustracao = fotoUrl
      ? `<img src="${fotoUrl}" alt="${p.name}" loading="lazy" decoding="async">`
      : ilustracaoAquarela(cor, iconeParaIndice(i), i);
    const card = document.createElement('div');
    card.className = 'presente' + (selecionado ? ' selecionado' : '');
    card.innerHTML = `
      <div class="presente-ilustracao"${fotoUrl ? '' : ' style="background: radial-gradient(circle at 50% 45%, var(--tinta-clara) 35%, var(--areia-1) 100%)"'}>
        ${conteudoIlustracao}
      </div>
      <div class="presente-corpo">
        <h3 class="presente-nome">${p.name}</h3>
        <div class="presente-rodape">
          <span class="presente-preco">${formatoPreco.format(p.price)}</span>
          <button class="presentear-btn${selecionado ? ' esta-selecionado' : ''}" onclick="alternarCarrinho(${p.id})">
            ${selecionado ? 'Remover' : 'Presentear'}
          </button>
        </div>
      </div>
    `;
    grade.appendChild(card);
  });
}

function alternarCarrinho(id) {
  if (carrinho.has(id)) carrinho.delete(id);
  else carrinho.add(id);
  salvarCarrinho();
  montarGrade();
  atualizarCarrinhoFlutuante();
  if (document.getElementById('modalCarrinho').classList.contains('aberta')) montarListaCarrinho();
}

function totalCarrinho() {
  return [...carrinho].reduce((soma, id) => soma + Number(presentePorId(id)?.price || 0), 0);
}

function atualizarCarrinhoFlutuante() {
  const barra = document.getElementById('carrinhoFlutuante');
  const qtd = carrinho.size;
  document.getElementById('carrinhoFlutuanteQtd').textContent = String(qtd);
  document.getElementById('carrinhoFlutuanteTotal').textContent = formatoPreco.format(totalCarrinho());
  barra.classList.toggle('mostrar', qtd > 0);
}

function montarListaCarrinho() {
  const lista = document.getElementById('carrinhoLista');
  if (!carrinho.size) {
    lista.innerHTML = '<p class="carrinho-vazio">Seu carrinho está vazio.</p>';
  } else {
    lista.innerHTML = [...carrinho].map((id) => {
      const p = presentePorId(id);
      if (!p) return '';
      return `
        <div class="carrinho-item">
          <span class="carrinho-item-nome">${p.name}</span>
          <span class="carrinho-item-preco">${formatoPreco.format(p.price)}</span>
          <button class="carrinho-item-remover" onclick="alternarCarrinho(${p.id})" aria-label="Remover ${p.name}">✕</button>
        </div>
      `;
    }).join('');
  }
  document.getElementById('carrinhoTotalValor').textContent = formatoPreco.format(totalCarrinho());
  const btnPagar = document.getElementById('btnPagarCarrinho');
  btnPagar.disabled = carrinho.size === 0;
}

function abrirCarrinho() {
  const erroEl = document.getElementById('modalErroPagamento');
  erroEl.textContent = '';
  erroEl.classList.remove('mostrar');
  const btn = document.getElementById('btnPagarCarrinho');
  btn.disabled = carrinho.size === 0;
  btn.textContent = 'Pagar com Mercado Pago';
  montarListaCarrinho();
  abrirModal('modalCarrinho');
}

async function pagarCarrinho() {
  if (!carrinho.size) return;
  const btn = document.getElementById('btnPagarCarrinho');
  const erroEl = document.getElementById('modalErroPagamento');
  const campoNome = document.getElementById('carrinhoNomePresenteador');
  const campoMensagem = document.getElementById('carrinhoMensagemPresenteador');

  erroEl.textContent = '';
  erroEl.classList.remove('mostrar');

  const giverName = campoNome.value.trim();
  if (!giverName) {
    erroEl.textContent = 'Preencha seu nome antes de continuar.';
    erroEl.classList.add('mostrar');
    campoNome.focus();
    return;
  }

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
      body: JSON.stringify({
        giftIds: [...carrinho],
        siteBaseUrl: window.location.href.replace(/[^/]*$/, ''),
        giverName,
        giverMessage: campoMensagem.value.trim(),
      }),
    });
    const dados = await resposta.json();

    if (!resposta.ok || !dados.checkoutUrl) {
      throw new Error(dados?.error || 'Não foi possível iniciar o pagamento.');
    }

    localStorage.removeItem(CHAVE_CARRINHO);
    window.location.href = dados.checkoutUrl;
  } catch (erro) {
    erroEl.textContent = erro.message || 'Não foi possível iniciar o pagamento agora. Tente novamente em instantes.';
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
    aprovado: { classe: 'aprovado', texto: 'Pagamento aprovado! Muito obrigado pelo carinho — os presentes já foram registrados.' },
    pendente: { classe: '', texto: 'Recebemos seu pagamento e estamos aguardando a confirmação. Assim que aprovado, os presentes são atualizados aqui.' },
    recusado: { classe: 'recusado', texto: 'Não foi possível concluir esse pagamento. Fique à vontade para tentar novamente.' },
  };
  const info = mensagens[status];
  if (!info) return;

  container.innerHTML = `<div class="banner-pagamento ${info.classe}">${info.texto}</div>`;
  window.history.replaceState({}, '', window.location.pathname);
}

async function carregarPresentes() {
  const grade = document.getElementById('gradePresentes');
  if (grade) grade.innerHTML = '<p class="recados-estado">Carregando presentes…</p>';

  const client = getPresentesClient();
  if (!client) {
    if (grade) grade.innerHTML = '<p class="recados-estado">Não foi possível carregar a lista de presentes agora.</p>';
    return;
  }

  const { data, error } = await client
    .from('gifts')
    .select('id, name, price, active, sort_order')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    if (grade) grade.innerHTML = '<p class="recados-estado">Não foi possível carregar a lista de presentes agora.</p>';
    return;
  }
  PRESENTES = data || [];
  inicializarFiltroPreco();
  montarGrade();
  atualizarCarrinhoFlutuante();
}

restaurarCarrinho();
mostrarBannerPagamento();
carregarPresentes();
