/* ==========================================================================
   Votação — brincadeira da gravata.

   O servidor (Supabase) é a referência de tudo:
   - liberação pública em 10/10/2026 às 18h (America/Sao_Paulo);
   - início e fim do timer de 20 minutos (registrados no banco pelo botão
     "Iniciar votação", que só o administrador consegue acionar);
   - nome de quem tem a maior contribuição APROVADA pelo Mercado Pago.
   O relógio do celular só é usado com a diferença medida em relação ao servidor.

   O público só recebe nome do líder e horários — nunca valores.
   Prévia/controle: votacao.html?admin
   ========================================================================== */

(function () {
  const CFG = window.SITE_CONFIG || {};
  const SUPABASE_URL = CFG.SUPABASE_URL;
  const CHAVE = CFG.SUPABASE_PUBLISHABLE_KEY;
  const FN = `${SUPABASE_URL}/functions/v1`;
  const CHAVE_SENHA = 'votacao-senha-admin';
  const CHAVE_NOME = 'votacao-nome';
  const CHAVE_CONTRIBUICOES = 'votacao-minhas-contribuicoes';
  const VALOR_MIN = 1;
  const VALOR_MAX = 10000;

  const params = new URLSearchParams(location.search);
  const modoAdmin = params.has('admin');
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('votacaoApp'),
    indisponivel: $('votacaoIndisponivel'),
    indisponivelTitulo: $('indisponivelTitulo'),
    indisponivelTexto: $('indisponivelTexto'),
    timer: $('votacaoTimer'),
    timerRotulo: $('timerRotulo'),
    digitos: $('timerDigitos'),
    mensagem: $('votacaoMensagem'),
    lider: $('votacaoLider'),
    form: $('formContribuicao'),
    nome: $('campoNome'),
    valor: $('campoValor'),
    botao: $('btnContribuir'),
    erro: $('votacaoErro'),
    banner: $('bannerPagamento'),
    camada: $('camadaVotos'),
    adminSecao: $('adminVotacao'),
    adminLogin: $('adminLogin'),
    adminLoginForm: $('adminLoginForm'),
    adminSenha: $('adminSenha'),
    adminOlho: $('adminOlho'),
    adminLoginErro: $('adminLoginErro'),
    adminPainel: $('adminPainel'),
    adminTag: $('adminTag'),
    adminStatus: $('adminStatus'),
    adminErro: $('adminErro'),
    adminLista: $('adminLista'),
    btnIniciar: $('btnIniciarVotacao'),
    btnConferir: $('btnConferirPagamentos'),
    btnAtualizar: $('btnAtualizarAdmin'),
    btnReiniciar: $('btnReiniciarVotacao'),
    btnSair: $('btnSairAdmin'),
  };

  /* ------------------------------------------------------------------ estado */
  let estado = null;          // último estado vindo do servidor
  let offsetRelogio = 0;      // horaServidor - Date.now()
  let melhorRtt = Infinity;
  let fase = 'carregando';    // carregando | indisponivel | aguardando | aberta | encerrada
  let enviando = false;
  let liderAtual;             // undefined = ainda não desenhado
  let timerPoll = null;
  let timerLiberacao = null;
  let canal = null;

  const agoraServidor = () => Date.now() + offsetRelogio;

  function lerSenha() { try { return sessionStorage.getItem(CHAVE_SENHA) || ''; } catch { return ''; } }
  function salvarSenha(s) { try { s ? sessionStorage.setItem(CHAVE_SENHA, s) : sessionStorage.removeItem(CHAVE_SENHA); } catch { /* segue */ } }
  let senhaAdmin = modoAdmin ? lerSenha() : '';

  function medirRelogio(agoraIso, t0, t1) {
    const servidor = Date.parse(agoraIso);
    if (Number.isNaN(servidor)) return;
    const rtt = t1 - t0;
    // usa a medição de menor latência (mais precisa); renova se ficar muito antiga
    if (rtt <= melhorRtt || rtt < 400) {
      melhorRtt = Math.min(melhorRtt, rtt);
      offsetRelogio = servidor - (t0 + rtt / 2);
    }
  }

  /* ------------------------------------------------------------- servidor */
  async function buscarEstadoPublico() {
    const t0 = Date.now();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/votacao_estado_publico`, {
      method: 'POST',
      headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const t1 = Date.now();
    if (!res.ok) throw new Error('estado indisponível');
    const dados = await res.json();
    medirRelogio(dados.agora, t0, t1);
    return dados;
  }

  async function chamarAdmin(acao, extra) {
    const t0 = Date.now();
    const res = await fetch(`${FN}/votacao-admin`, {
      method: 'POST',
      headers: {
        apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json',
        'x-votacao-senha': senhaAdmin,
      },
      body: JSON.stringify({ acao, ...(extra || {}) }),
      cache: 'no-store',
    });
    const t1 = Date.now();
    const dados = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const e = new Error(dados.error || 'Senha incorreta.');
      e.naoAutorizado = true;
      throw e;
    }
    if (!res.ok) throw new Error(dados.error || 'Não foi possível concluir agora.');
    if (dados.estado?.agora) medirRelogio(dados.estado.agora, t0, t1);
    return dados;
  }

  async function atualizarEstado() {
    try {
      if (modoAdmin && senhaAdmin) {
        const dados = await chamarAdmin('estado');
        aplicarEstado(dados.estado);
        desenharAdmin(dados);
      } else {
        aplicarEstado(await buscarEstadoPublico());
      }
    } catch (err) {
      if (err.naoAutorizado) { sairAdmin('Sua sessão expirou. Entre de novo.'); return; }
      if (!estado) mostrarIndisponivel('Não foi possível carregar a votação', 'Verifique sua conexão e tente recarregar a página.');
    } finally {
      agendarAtualizacao();
    }
  }

  function agendarAtualizacao() {
    clearTimeout(timerPoll);
    if (document.hidden) return;
    // Realtime cuida das mudanças; a consulta periódica é só uma rede de segurança.
    const ms = fase === 'aberta' ? 8000 : fase === 'aguardando' ? 5000 : 30000;
    timerPoll = setTimeout(atualizarEstado, ms);
  }

  function conectarRealtime() {
    if (canal || !window.supabase || !SUPABASE_URL) return;
    try {
      const cliente = window.supabase.createClient(SUPABASE_URL, CHAVE);
      // A tabela votacao_estado só tem horários e o nome do líder — sem valores.
      canal = cliente.channel('votacao-estado')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votacao_estado' }, () => atualizarEstado())
        .subscribe();
    } catch { canal = null; }
  }

  /* ------------------------------------------------------------- telas */
  function mostrarIndisponivel(titulo, texto) {
    fase = 'indisponivel';
    pararVotos();
    el.indisponivelTitulo.textContent = titulo;
    el.indisponivelTexto.textContent = texto;
    el.indisponivel.hidden = false;
    el.app.hidden = true;
  }

  function aplicarEstado(novo) {
    estado = novo;
    const podeVer = novo.liberada || (modoAdmin && senhaAdmin);
    if (!podeVer) {
      mostrarIndisponivel('A votação ainda não está disponível', 'Ela abre no dia da festa. Até lá!');
      agendarLiberacao(novo.liberacao);
      return;
    }
    el.indisponivel.hidden = true;
    el.app.hidden = false;
    document.querySelectorAll('[data-menu-votacao]').forEach((li) => { li.hidden = false; });
    if (novo.liberada) conectarRealtime();
    desenharLider(novo.lider_nome);
    tick();
  }

  // Se a página ficar aberta antes das 18h, ela se libera sozinha no horário.
  function agendarLiberacao(liberacaoIso) {
    clearTimeout(timerLiberacao);
    const falta = Date.parse(liberacaoIso) - agoraServidor();
    if (!(falta > 0)) return;
    timerLiberacao = setTimeout(atualizarEstado, Math.min(falta + 1500, 2 ** 31 - 1));
  }

  function desenharLider(nome) {
    const n = nome || null;
    if (n === liderAtual) return;
    const trocou = liderAtual !== undefined;
    liderAtual = n;
    el.lider.textContent = '';
    if (!n) {
      const s = document.createElement('span');
      s.className = 'votacao-lider-vazio';
      s.textContent = 'Quem vai inaugurar a brincadeira?';
      el.lider.appendChild(s);
      return;
    }
    const texto = document.createElement('span');
    texto.className = 'votacao-lider-texto';
    texto.textContent = 'A maior contribuição até agora é de:';
    const nomeEl = document.createElement('strong');
    nomeEl.className = 'votacao-lider-nome' + (trocou && !reduzMovimento.matches ? ' trocou' : '');
    nomeEl.textContent = n;
    el.lider.append(texto, nomeEl);
  }

  function formatarTempo(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function definirFase(nova) {
    if (nova === fase) return;
    const anterior = fase;
    fase = nova;
    el.timer.classList.toggle('encerrada', nova === 'encerrada');
    if (nova === 'aguardando') {
      el.timerRotulo.textContent = 'Tempo da votação';
      el.mensagem.textContent = 'A votação começará em instantes!';
    } else if (nova === 'aberta') {
      el.timerRotulo.textContent = 'Tempo restante';
      el.mensagem.textContent = 'A votação está aberta. Participe!';
    } else if (nova === 'encerrada') {
      el.timerRotulo.textContent = 'Tempo esgotado';
      el.mensagem.textContent = 'Votação encerrada! Obrigada por participar desse momento com a gente.';
    }
    atualizarFormulario();
    if (nova === 'aberta') iniciarVotos(); else pararVotos();
    // logo depois de encerrar, busca o destaque final (pagamentos aprovados no último segundo)
    if (anterior === 'aberta' && nova === 'encerrada') setTimeout(atualizarEstado, 2500);
    agendarAtualizacao();
  }

  function atualizarFormulario() {
    const aberta = fase === 'aberta';
    el.botao.disabled = !aberta || enviando;
    el.nome.disabled = fase === 'encerrada';
    el.valor.disabled = fase === 'encerrada';
    if (!enviando) {
      el.botao.textContent = fase === 'encerrada' ? 'Votação encerrada' : 'Pagar';
    }
  }

  function tick() {
    if (!estado || el.app.hidden) return;
    const inicio = estado.inicio ? Date.parse(estado.inicio) : null;
    const fim = estado.fim ? Date.parse(estado.fim) : null;
    const agora = agoraServidor();
    if (!inicio || !fim || agora < inicio) {
      el.digitos.textContent = '20:00';
      el.timer.classList.remove('urgente');
      definirFase('aguardando');
    } else if (agora < fim) {
      const resta = fim - agora;
      el.digitos.textContent = formatarTempo(resta);
      el.timer.classList.toggle('urgente', resta <= 60000);
      definirFase('aberta');
    } else {
      el.digitos.textContent = '00:00';
      el.timer.classList.remove('urgente');
      definirFase('encerrada');
    }
  }
  setInterval(tick, 250);

  /* ------------------------------------------------- animação "+1 voto" */
  // Puramente decorativa: não lê nem altera dados, não conta nada.
  // Cada "+1 voto" sobe do pé ao topo da tela como um balão: deriva lateral
  // irregular (soma de ondas com frequências e fases sorteadas), velocidade que
  // varia, leve balanço e inclinação acompanhando o vento.
  const CORES = ['var(--rosa-texto)', 'var(--coral-texto)', '#A87A22'];
  const MAX_BALOES = 12;
  const PROTEGIDOS = '#campoNome, #campoValor, #btnContribuir, #votacaoErro, #adminVotacao, #navbar, #navLinks.is-open, .whatsapp-flutuante';
  let timerVotos = null;
  let quadro = null;
  let baloes = [];

  const sorteio = (min, max) => min + Math.random() * (max - min);

  function areasProtegidas() {
    const rects = [];
    document.querySelectorAll(PROTEGIDOS).forEach((n) => {
      if (n.hidden || n.offsetParent === null && getComputedStyle(n).position !== 'fixed') return;
      const r = n.getBoundingClientRect();
      if (r.width && r.height) rects.push(r);
    });
    return rects;
  }

  function sobrepoe(r, rects, folga) {
    return rects.some((p) => r.left < p.right + folga && r.right > p.left - folga && r.top < p.bottom + folga && r.bottom > p.top - folga);
  }

  // Nasce quase sempre nas laterais (faixa de ~1/4 da tela de cada lado);
  // só de vez em quando um balão cruza mais perto do centro.
  function posicaoLateral(vw, largura) {
    const max = Math.max(8, vw - largura - 8);
    if (Math.random() < 0.1) return sorteio(8, max);
    const faixa = Math.max(30, vw * 0.24);
    return Math.random() < 0.5 ? sorteio(8, Math.min(max, 8 + faixa)) : sorteio(Math.max(8, max - faixa), max);
  }

  function soltarVoto() {
    if (fase !== 'aberta' || reduzMovimento.matches || document.hidden || baloes.length >= MAX_BALOES) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const no = document.createElement('div');
    no.className = 'voto-flutuante';
    const texto = document.createElement('span');
    texto.className = 'voto-flutuante-texto';
    texto.textContent = '+1 voto';
    const fio = document.createElement('span');
    fio.className = 'voto-flutuante-fio';
    no.append(texto, fio);
    no.style.setProperty('--tam', `${sorteio(0.8, 1.15).toFixed(2)}rem`);
    no.style.setProperty('--cor', CORES[Math.floor(Math.random() * CORES.length)]);
    el.camada.appendChild(no);

    const largura = no.offsetWidth || 80;
    baloes.push({
      no,
      largura,
      altura: no.offsetHeight || 46,
      x0: posicaoLateral(vw, largura),
      faixa: Math.max(30, vw * 0.24),
      y0: vh + sorteio(10, 60),
      inicio: performance.now(),
      duracao: sorteio(7000, 12500),           // tempo para atravessar a tela
      subida: vh + 140,
      // vento: duas ondas lentas + uma rápida, com fases sorteadas
      a1: sorteio(14, 34), f1: sorteio(0.18, 0.35), p1: sorteio(0, Math.PI * 2),
      a2: sorteio(6, 16), f2: sorteio(0.45, 0.8), p2: sorteio(0, Math.PI * 2),
      a3: sorteio(2, 6), f3: sorteio(1.4, 2.4), p3: sorteio(0, Math.PI * 2),
      deriva: sorteio(-20, 20),                // tendência geral para um lado
      ritmo: sorteio(0.12, 0.3),               // variação da velocidade de subida
      pRitmo: sorteio(0, Math.PI * 2),
      opacidade: 0,
    });
    if (!quadro) quadro = requestAnimationFrame(animar);
  }

  function animar(agora) {
    quadro = null;
    const vw = window.innerWidth;
    const rects = areasProtegidas();
    baloes = baloes.filter((b) => {
      const t = (agora - b.inicio) / 1000;
      const prog = (agora - b.inicio) / b.duracao;
      if (prog >= 1) { b.no.remove(); return false; }
      // subida com velocidade irregular (rajadas e calmarias)
      const subidaProg = prog + b.ritmo * Math.sin(prog * Math.PI * 2 + b.pRitmo) * 0.08 * Math.sin(prog * Math.PI);
      const y = b.y0 - b.subida * subidaProg;
      const onda = (w, f, p) => w * Math.sin(t * f * Math.PI * 2 + p);
      let x = b.x0 + b.deriva * prog + onda(b.a1, b.f1, b.p1) + onda(b.a2, b.f2, b.p2) + onda(b.a3, b.f3, b.p3);
      const centro = (vw - b.largura) / 2;
      if (Math.abs(b.x0 - centro) > b.faixa * 0.6) {
        // balão de lateral não avança além de ~1/3 da tela em direção ao meio
        const limite = vw * 0.34;
        x = b.x0 < centro ? Math.min(x, limite - b.largura * 0.5) : Math.max(x, vw - limite - b.largura * 0.5);
      }
      x = Math.min(Math.max(x, 4), vw - b.largura - 4);
      // inclinação acompanha o movimento lateral
      const vel = b.a1 * b.f1 * Math.cos(t * b.f1 * Math.PI * 2 + b.p1) + b.a2 * b.f2 * Math.cos(t * b.f2 * Math.PI * 2 + b.p2);
      const giro = Math.max(-14, Math.min(14, vel * 0.35));
      const escala = 1 + 0.04 * Math.sin(t * 1.7 + b.p3);

      // some ao passar sobre campos/botão; aparece e desaparece suave nas pontas
      const caixa = { left: x, right: x + b.largura, top: y, bottom: y + b.altura };
      const pontas = Math.min(1, prog / 0.08, (1 - prog) / 0.12);
      // começa a sumir um pouco antes de encostar no campo/botão
      const perto = sobrepoe(caixa, rects, 22);
      const alvo = perto ? 0 : 0.95 * pontas;
      b.opacidade = perto ? Math.min(b.opacidade, b.opacidade * 0.4) : b.opacidade + (alvo - b.opacidade) * 0.12;
      if (sobrepoe(caixa, rects, 0)) b.opacidade = 0;

      b.no.style.opacity = b.opacidade.toFixed(3);
      b.no.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${giro.toFixed(2)}deg) scale(${escala.toFixed(3)})`;
      return true;
    });
    if (baloes.length) quadro = requestAnimationFrame(animar);
  }

  function proximoVoto() {
    soltarVoto();
    // intervalos variados: às vezes vários balões juntos, às vezes calmaria
    const ms = Math.random() < 0.25 ? sorteio(250, 600) : sorteio(900, 2200);
    timerVotos = setTimeout(proximoVoto, ms);
  }

  function iniciarVotos() {
    if (timerVotos || reduzMovimento.matches) return;
    // começa já com alguns balões no meio do caminho
    for (let i = 0; i < 3; i++) {
      soltarVoto();
      const b = baloes[baloes.length - 1];
      if (b) b.inicio -= sorteio(0.15, 0.6) * b.duracao;
    }
    proximoVoto();
  }

  function pararVotos() {
    clearTimeout(timerVotos);
    timerVotos = null;
    if (quadro) cancelAnimationFrame(quadro);
    quadro = null;
    baloes = [];
    el.camada.textContent = '';
  }

  reduzMovimento.addEventListener?.('change', () => { if (reduzMovimento.matches) pararVotos(); else if (fase === 'aberta') iniciarVotos(); });

  /* -------------------------------------------------- contribuição */
  function valorDigitado(bruto) {
    let s = String(bruto || '').replace(/R\$|\s/gi, '');
    if (!s || !/^[\d.,]+$/.test(s)) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const n = Math.round(Number(s) * 100) / 100;
    return Number.isFinite(n) ? n : null;
  }

  const fmtBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  el.valor.addEventListener('input', () => {
    // deixa só números, vírgula e ponto
    const limpo = el.valor.value.replace(/[^\d.,]/g, '');
    if (limpo !== el.valor.value) el.valor.value = limpo;
  });
  el.valor.addEventListener('blur', () => {
    const v = valorDigitado(el.valor.value);
    if (v != null) el.valor.value = fmtBRL.format(v);
  });

  function mostrarErro(msg) {
    el.erro.textContent = msg || '';
    el.erro.classList.toggle('mostrar', !!msg);
  }

  function lembrarContribuicao(id) {
    try {
      const lista = JSON.parse(localStorage.getItem(CHAVE_CONTRIBUICOES) || '[]').filter((x) => typeof x === 'string');
      lista.unshift(id);
      localStorage.setItem(CHAVE_CONTRIBUICOES, JSON.stringify(lista.slice(0, 10)));
    } catch { /* segue */ }
  }

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarErro('');
    if (fase !== 'aberta' || enviando) return;

    const nome = el.nome.value.replace(/\s+/g, ' ').trim();
    if (nome.length < 2) { mostrarErro('Preencha seu nome para participar.'); el.nome.focus(); return; }
    const valor = valorDigitado(el.valor.value);
    if (valor == null) { mostrarErro('Digite um valor válido, por exemplo 50 ou 50,00.'); el.valor.focus(); return; }
    if (valor < VALOR_MIN || valor > VALOR_MAX) {
      mostrarErro(`O valor precisa ficar entre R$ ${fmtBRL.format(VALOR_MIN)} e R$ ${fmtBRL.format(VALOR_MAX)}.`);
      el.valor.focus();
      return;
    }

    enviando = true;
    el.botao.disabled = true;
    el.botao.textContent = 'Abrindo o Mercado Pago…';
    try { localStorage.setItem(CHAVE_NOME, nome); } catch { /* segue */ }

    try {
      const headers = { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' };
      if (modoAdmin && senhaAdmin) headers['x-votacao-senha'] = senhaAdmin; // prévia antes da liberação
      const res = await fetch(`${FN}/votacao`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          acao: 'contribuir',
          nome,
          valor: valor.toFixed(2),
          siteBaseUrl: location.href.split(/[?#]/)[0].replace(/[^/]*$/, ''),
        }),
      });
      const dados = await res.json().catch(() => ({}));
      if (!res.ok || !dados.checkoutUrl) {
        if (dados.codigo === 'encerrada' || dados.codigo === 'nao_iniciada') atualizarEstado();
        throw new Error(dados.error || 'Não foi possível abrir o Mercado Pago agora. Tente novamente.');
      }
      lembrarContribuicao(dados.contribuicaoId);
      location.href = dados.checkoutUrl;
    } catch (err) {
      mostrarErro(err.message);
      enviando = false;
      atualizarFormulario();
    }
  });

  try { el.nome.value = localStorage.getItem(CHAVE_NOME) || ''; } catch { /* segue */ }

  /* ------------------------------------- retorno do Mercado Pago */
  // Voltar para a página NÃO significa pagamento aprovado: a confirmação é
  // sempre conferida no servidor, que consulta a API do Mercado Pago.
  const MENSAGENS_RETORNO = {
    verificando: ['', 'Recebemos seu retorno do Mercado Pago. Estamos aguardando a confirmação oficial do pagamento…'],
    aprovado: ['aprovado', 'Pagamento confirmado pelo Mercado Pago. Obrigada pela contribuição!'],
    pendente: ['', 'Seu pagamento ainda está em processamento no Mercado Pago. O destaque é atualizado assim que ele for aprovado.'],
    recusado: ['recusado', 'O Mercado Pago não aprovou esse pagamento. Se quiser, tente novamente.'],
    cancelado: ['recusado', 'Esse pagamento foi cancelado no Mercado Pago.'],
    nao_encontrado: ['', 'Ainda não recebemos a confirmação do Mercado Pago. Se você concluiu o pagamento, o destaque é atualizado assim que ele for confirmado.'],
  };

  function mostrarBanner(chave) {
    const [classe, texto] = MENSAGENS_RETORNO[chave] || MENSAGENS_RETORNO.verificando;
    el.banner.textContent = '';
    const div = document.createElement('div');
    div.className = 'banner-pagamento' + (classe ? ' ' + classe : '');
    div.textContent = texto;
    el.banner.appendChild(div);
  }

  async function conferirRetorno(id) {
    mostrarBanner('verificando');
    const esperas = [0, 3000, 6000, 10000, 15000, 25000];
    let ultimo = 'nao_encontrado';
    for (const espera of esperas) {
      await new Promise((r) => setTimeout(r, espera));
      try {
        const res = await fetch(`${FN}/votacao`, {
          method: 'POST',
          headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'conferir', contribuicaoId: id }),
        });
        const dados = await res.json().catch(() => ({}));
        if (dados.status) ultimo = dados.status;
      } catch { /* tenta de novo */ }
      if (ultimo === 'aprovado' || ultimo === 'recusado' || ultimo === 'cancelado') break;
    }
    mostrarBanner(ultimo);
    atualizarEstado();
  }

  const retornoId = params.get('contribuicao');
  if (retornoId && /^[0-9a-f-]{36}$/i.test(retornoId)) {
    // limpa a URL (mantém ?admin para a prévia)
    history.replaceState({}, '', location.pathname + (modoAdmin ? '?admin' : ''));
    conferirRetorno(retornoId);
  }

  /* ---------------------------------------------- administrador */
  const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const fmtDataHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const fmtReais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const MOTIVOS = {
    aprovado_apos_encerramento: 'aprovado depois do encerramento — fora do resultado',
    aprovado_antes_do_inicio: 'aprovado antes do início — fora do resultado',
    valor_divergente: 'valor pago diferente do escolhido — fora do resultado',
    rodada_anterior: 'de uma rodada anterior',
    moeda: 'moeda diferente de BRL',
  };

  function textoSimples(tag, classe, texto) {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    n.textContent = texto;
    return n;
  }

  function desenharAdmin(dados) {
    const e = dados.estado;
    const contribs = dados.contribuicoes || [];
    el.adminTag.textContent = e.liberada ? 'Votação liberada ao público' : 'Prévia — ainda não liberada ao público';

    const agora = agoraServidor();
    let situacao;
    if (!e.inicio) situacao = 'Aguardando início.';
    else if (agora < Date.parse(e.fim)) situacao = `Em andamento — termina às ${fmtHora.format(new Date(e.fim))}.`;
    else situacao = `Encerrada às ${fmtHora.format(new Date(e.fim))}.`;

    const aprovados = contribs.flatMap((c) => (c.votacao_pagamentos || []).filter((p) => p.elegivel));
    const totalValido = aprovados.reduce((s, p) => s + Number(p.valor_pago || 0), 0);

    el.adminStatus.textContent = '';
    el.adminStatus.append(
      textoSimples('div', '', `Liberação no menu: ${fmtDataHora.format(new Date(e.liberacao))} (${e.liberada ? 'já liberada' : 'ainda não'}).`),
      textoSimples('div', '', `Rodada ${e.rodada}. ${situacao}`),
      textoSimples('div', '', `Contribuições aprovadas válidas: ${aprovados.length} · total ${fmtReais.format(totalValido)}.`),
    );
    const liderLinha = document.createElement('div');
    liderLinha.append('Destaque atual: ');
    liderLinha.appendChild(textoSimples('strong', '', e.lider_nome || '—'));
    el.adminStatus.appendChild(liderLinha);

    el.btnIniciar.disabled = !!e.inicio;
    el.btnIniciar.textContent = e.inicio ? 'Votação já iniciada' : 'Iniciar votação';

    el.adminLista.textContent = '';
    if (!contribs.length) {
      el.adminLista.appendChild(textoSimples('p', '', 'Nenhuma contribuição nesta rodada ainda.'));
      return;
    }
    contribs.forEach((c) => {
      const pags = c.votacao_pagamentos || [];
      const item = document.createElement('div');
      item.className = 'admin-item';
      item.appendChild(textoSimples('span', 'admin-item-nome', c.nome));
      item.appendChild(textoSimples('span', 'admin-item-valor', fmtReais.format(Number(c.valor))));
      const info = document.createElement('div');
      info.className = 'admin-item-info';
      if (c.previa) info.appendChild(textoSimples('span', 'selo previa', 'prévia'));
      if (!pags.length) {
        info.appendChild(textoSimples('span', 'selo pendente', 'sem pagamento'));
        info.append(`checkout aberto às ${fmtHora.format(new Date(c.criado_em))}`);
      }
      pags.forEach((p) => {
        let selo; let classe;
        if (p.elegivel) { selo = 'conta'; classe = 'conta'; }
        else if (p.status === 'approved') { selo = 'aprovado'; classe = 'fora'; }
        else if (p.status === 'pending' || p.status === 'in_process' || p.status === 'authorized') { selo = 'pendente'; classe = 'pendente'; }
        else { selo = p.status; classe = 'recusado'; }
        info.appendChild(textoSimples('span', `selo ${classe}`, selo));
        const partes = [];
        if (p.aprovado_em) partes.push(`aprovado às ${fmtHora.format(new Date(p.aprovado_em))}`);
        if (p.motivo && MOTIVOS[p.motivo]) partes.push(MOTIVOS[p.motivo]);
        partes.push(`pagamento ${p.mp_payment_id}`);
        info.append(partes.join(' · ') + ' ');
      });
      item.appendChild(info);
      el.adminLista.appendChild(item);
    });
  }

  function mostrarErroAdmin(msg) { el.adminErro.textContent = msg || ''; }

  function sairAdmin(msg) {
    senhaAdmin = '';
    salvarSenha('');
    el.adminPainel.hidden = true;
    el.adminLogin.hidden = false;
    el.adminLoginErro.textContent = msg || '';
    estado = null;
    atualizarEstado();
  }

  async function acaoAdmin(botao, acao, extra) {
    mostrarErroAdmin('');
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Aguarde…';
    try {
      const dados = await chamarAdmin(acao, extra);
      aplicarEstado(dados.estado);
      desenharAdmin(dados);
      return dados;
    } catch (err) {
      if (err.naoAutorizado) sairAdmin('Sua sessão expirou. Entre de novo.');
      else mostrarErroAdmin(err.message);
      return null;
    } finally {
      botao.textContent = textoOriginal;
      botao.disabled = false;
      if (botao === el.btnIniciar && estado?.inicio) {
        botao.disabled = true;
        botao.textContent = 'Votação já iniciada';
      }
    }
  }

  if (modoAdmin) {
    el.adminSecao.hidden = false;
    if (senhaAdmin) el.adminPainel.hidden = false; else el.adminLogin.hidden = false;

    // olho para mostrar/ocultar a senha digitada (mesmos ícones do painel dos noivos)
    const OLHO_ABERTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    const OLHO_FECHADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 5.2A9.5 9.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.4 4.3M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.3 9.3 0 0 0 4-.9"/></svg>';
    el.adminOlho.innerHTML = OLHO_FECHADO;
    el.adminOlho.addEventListener('click', () => {
      const mostrar = el.adminSenha.type === 'password';
      el.adminSenha.type = mostrar ? 'text' : 'password';
      el.adminOlho.innerHTML = mostrar ? OLHO_ABERTO : OLHO_FECHADO;
      el.adminOlho.setAttribute('aria-pressed', String(mostrar));
      el.adminOlho.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      el.adminSenha.focus();
    });

    el.adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      el.adminLoginErro.textContent = '';
      senhaAdmin = el.adminSenha.value;
      try {
        await chamarAdmin('entrar');
        salvarSenha(senhaAdmin);
        el.adminSenha.value = '';
        el.adminSenha.type = 'password';
        el.adminOlho.innerHTML = OLHO_FECHADO;
        el.adminOlho.setAttribute('aria-pressed', 'false');
        el.adminOlho.setAttribute('aria-label', 'Mostrar senha');
        el.adminLogin.hidden = true;
        el.adminPainel.hidden = false;
        atualizarEstado();
      } catch (err) {
        senhaAdmin = '';
        el.adminLoginErro.textContent = err.message;
      }
    });

    el.btnIniciar.addEventListener('click', () => {
      if (estado?.inicio) return;
      if (!confirm('Iniciar a votação agora? O timer de 20 minutos começa para todos e não pode ser pausado.')) return;
      acaoAdmin(el.btnIniciar, 'iniciar');
    });
    el.btnConferir.addEventListener('click', async () => {
      const dados = await acaoAdmin(el.btnConferir, 'conferir');
      if (dados) mostrarErroAdmin(`Conferência feita: ${dados.pagamentosEncontrados} pagamento(s) encontrado(s) no Mercado Pago.`);
    });
    el.btnAtualizar.addEventListener('click', () => acaoAdmin(el.btnAtualizar, 'estado'));
    el.btnReiniciar.addEventListener('click', () => {
      const resposta = prompt('Reiniciar abre uma nova rodada: o timer volta a 20:00 e o destaque é zerado (o histórico continua guardado). Para confirmar, digite REINICIAR');
      if (resposta == null) return;
      if (resposta.trim() !== 'REINICIAR') { mostrarErroAdmin('Reinício cancelado: a confirmação não confere.'); return; }
      acaoAdmin(el.btnReiniciar, 'reiniciar', { confirmacao: 'REINICIAR' });
    });
    el.btnSair.addEventListener('click', () => sairAdmin(''));
  }

  /* --------------------------------------------------------- início */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarEstado();
    else { clearTimeout(timerPoll); }
  });

  if (modoAdmin && !senhaAdmin) {
    // tela de login sem consultar nada
    el.indisponivel.hidden = true;
  } else {
    atualizarEstado();
  }
})();
