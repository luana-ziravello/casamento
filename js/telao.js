/* ==========================================================================
   Telão da votação (telao.html) — para espelhar na festa.

   Mostra só o que é público: nome de quem tem a maior contribuição aprovada,
   cronômetro sincronizado com o servidor e os balões "+1 voto" (decorativos).
   Quando o nome do líder muda, abre o "Novo recorde!!!!" por alguns segundos.
   ========================================================================== */

(function () {
  const CFG = window.SITE_CONFIG || {};
  const SUPABASE_URL = CFG.SUPABASE_URL;
  const CHAVE = CFG.SUPABASE_PUBLISHABLE_KEY;
  const URL_VOTACAO = new URL('votacao.html', location.href).href;
  const DURACAO_RECORDE = 6500;

  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (id) => document.getElementById(id);
  const el = {
    espera: $('telaEspera'),
    esperaTitulo: $('esperaTitulo'),
    esperaTexto: $('esperaTexto'),
    tela: $('telaPrincipal'),
    lider: $('liderBloco'),
    cronometro: $('cronometro'),
    digitos: $('cronometroDigitos'),
    status: $('cronometroStatus'),
    camada: $('camadaVotos'),
    recorde: $('recorde'),
    recordeNome: $('recordeNome'),
    confete: $('confete'),
    qr: $('qrParticipe'),
    btnTelaCheia: $('btnTelaCheia'),
    btnSom: $('btnSom'),
  };

  let estado = null;
  let offsetRelogio = 0;
  let melhorRtt = Infinity;
  let fase = 'carregando';
  let liderAtual;              // undefined = ainda não desenhado (não comemora na carga da página)
  let filaRecordes = [];
  let mostrandoRecorde = false;
  let timerPoll = null;
  let timerLiberacao = null;
  let canal = null;

  const agoraServidor = () => Date.now() + offsetRelogio;

  /* -------------------------------------------------------- servidor */
  async function buscarEstado() {
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
    const servidor = Date.parse(dados.agora);
    const rtt = t1 - t0;
    if (!Number.isNaN(servidor) && (rtt <= melhorRtt || rtt < 400)) {
      melhorRtt = Math.min(melhorRtt, rtt);
      offsetRelogio = servidor - (t0 + rtt / 2);
    }
    return dados;
  }

  async function atualizar() {
    try {
      aplicar(await buscarEstado());
    } catch {
      if (!estado) mostrarEspera('Conectando…', 'Verifique a internet deste computador.');
    } finally {
      clearTimeout(timerPoll);
      // o Realtime avisa na hora; esta consulta é a rede de segurança
      timerPoll = setTimeout(atualizar, fase === 'aberta' ? 4000 : 10000);
    }
  }

  function conectarRealtime() {
    if (canal || !window.supabase) return;
    try {
      const cliente = window.supabase.createClient(SUPABASE_URL, CHAVE);
      canal = cliente.channel('telao-votacao')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votacao_estado' }, () => atualizar())
        .subscribe();
    } catch { canal = null; }
  }

  function mostrarEspera(titulo, texto) {
    fase = 'indisponivel';
    pararVotos();
    el.esperaTitulo.textContent = titulo;
    el.esperaTexto.textContent = texto;
    el.espera.hidden = false;
    el.tela.hidden = true;
  }

  function aplicar(novo) {
    estado = novo;
    if (!novo.liberada) {
      mostrarEspera('A votação abre na festa', 'Esta tela se atualiza sozinha.');
      clearTimeout(timerLiberacao);
      const falta = Date.parse(novo.liberacao) - agoraServidor();
      if (falta > 0) timerLiberacao = setTimeout(atualizar, Math.min(falta + 1500, 2 ** 31 - 1));
      return;
    }
    el.espera.hidden = true;
    el.tela.hidden = false;
    conectarRealtime();
    trocarLider(novo.lider_nome || null);
    tick();
  }

  /* ------------------------------------------------------ líder e recorde */
  function desenharLider(nome) {
    el.lider.textContent = '';
    if (!nome) {
      const p = document.createElement('p');
      p.className = 'lider-vazio';
      p.textContent = 'Quem vai inaugurar a brincadeira?';
      el.lider.appendChild(p);
      return;
    }
    const rotulo = document.createElement('p');
    rotulo.className = 'lider-rotulo';
    rotulo.textContent = 'A maior contribuição até agora é de:';
    const n = document.createElement('p');
    n.className = 'lider-nome';
    n.textContent = nome;
    el.lider.append(rotulo, n);
    caberNome(n, 0.34);
  }

  // Reduz a fonte até o nome caber em até ~1/3 da altura da tela (nomes longos).
  function caberNome(no, fracaoAltura) {
    no.style.fontSize = '';
    const limite = innerHeight * fracaoAltura;
    let tam = parseFloat(getComputedStyle(no).fontSize);
    for (let i = 0; i < 30 && no.scrollHeight > limite && tam > 24; i++) {
      tam *= 0.92;
      no.style.fontSize = `${tam}px`;
    }
  }
  addEventListener('resize', () => {
    const n = el.lider.querySelector('.lider-nome');
    if (n) caberNome(n, 0.34);
    if (el.recorde.classList.contains('ativo')) caberNome(el.recordeNome, 0.32);
  });

  function trocarLider(nome) {
    if (nome === liderAtual) return;
    const primeiraCarga = liderAtual === undefined;
    liderAtual = nome;
    if (primeiraCarga || !nome) {
      desenharLider(nome);
      return;
    }
    // nova maior contribuição: comemora e depois mostra normalmente
    filaRecordes.push(nome);
    if (!mostrandoRecorde) proximoRecorde();
  }

  function proximoRecorde() {
    const nome = filaRecordes.shift();
    if (!nome) { mostrandoRecorde = false; desenharLider(liderAtual); return; }
    mostrandoRecorde = true;
    el.recordeNome.textContent = nome;
    caberNome(el.recordeNome, 0.32);
    el.recorde.classList.remove('ativo');
    void el.recorde.offsetWidth; // reinicia as animações
    el.recorde.classList.add('ativo');
    soltarConfete();
    tocarSomRecorde();
    // se vierem vários recordes seguidos, encurta cada comemoração
    const dur = filaRecordes.length ? 3500 : DURACAO_RECORDE;
    setTimeout(() => {
      el.recorde.classList.remove('ativo');
      desenharLider(liderAtual);
      setTimeout(proximoRecorde, 600);
    }, dur);
  }

  function soltarConfete() {
    if (reduzMovimento.matches) return;
    el.confete.textContent = '';
    const cores = ['#F46B30', '#E82F5D', '#E8B84B', '#FFC94D', '#FEF8E0'];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 160; i++) {
      const c = document.createElement('i');
      const w = 0.6 + Math.random() * 1.1;
      c.style.cssText = `left:${Math.random() * 100}vw;--w:${w}vh;--h:${w * (1.6 + Math.random())}vh;` +
        `--c:${cores[i % cores.length]};--d:${(2.6 + Math.random() * 2.6).toFixed(2)}s;--a:${(Math.random() * 1.2).toFixed(2)}s;` +
        `--x:${((Math.random() - .5) * 30).toFixed(1)}vw;--r:${Math.round((Math.random() - .5) * 1440)}deg`;
      frag.appendChild(c);
    }
    el.confete.appendChild(frag);
    setTimeout(() => { el.confete.textContent = ''; }, 6500);
  }

  /* ------------------------------------------------------------ cronômetro */
  function formatar(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function definirFase(nova) {
    if (nova === fase) return;
    const anterior = fase;
    fase = nova;
    el.cronometro.classList.toggle('encerrada', nova === 'encerrada');
    if (nova === 'aguardando') el.status.textContent = 'A votação começará em instantes!';
    if (nova === 'aberta') el.status.textContent = 'Tempo para participar';
    if (nova === 'encerrada') el.status.textContent = 'Votação encerrada! Obrigada por participar desse momento com a gente.';
    if (nova === 'aberta') iniciarVotos(); else pararVotos();
    if (anterior === 'aberta' && nova === 'encerrada') setTimeout(atualizar, 2500);
  }

  function tick() {
    if (!estado || el.tela.hidden) return;
    const inicio = estado.inicio ? Date.parse(estado.inicio) : null;
    const fim = estado.fim ? Date.parse(estado.fim) : null;
    const agora = agoraServidor();
    if (!inicio || !fim || agora < inicio) {
      el.digitos.textContent = '20:00';
      el.cronometro.classList.remove('urgente');
      definirFase('aguardando');
    } else if (agora < fim) {
      el.digitos.textContent = formatar(fim - agora);
      el.cronometro.classList.toggle('urgente', fim - agora <= 60000);
      definirFase('aberta');
    } else {
      el.digitos.textContent = '00:00';
      el.cronometro.classList.remove('urgente');
      definirFase('encerrada');
    }
  }
  setInterval(tick, 250);

  /* ------------------------------------------- balões "+1 voto" (decorativos) */
  const CORES = ['#F46B30', '#E82F5D', '#FFC94D', '#E8B84B'];
  const MAX_BALOES = 16;
  const PROTEGIDOS = '#liderBloco, #cronometro, .participe, .controles';
  let timerVotos = null;
  let quadro = null;
  let baloes = [];
  const sorteio = (min, max) => min + Math.random() * (max - min);

  function posicaoLateral(vw, largura) {
    const max = Math.max(8, vw - largura - 8);
    const faixa = vw * 0.2;
    return Math.random() < 0.5 ? sorteio(8, Math.min(max, 8 + faixa)) : sorteio(Math.max(8, max - faixa), max);
  }

  function retangulos() {
    return [...document.querySelectorAll(PROTEGIDOS)].map((n) => n.getBoundingClientRect()).filter((r) => r.width && r.height);
  }

  function sobrepoe(r, rects, folga) {
    return rects.some((p) => r.left < p.right + folga && r.right > p.left - folga && r.top < p.bottom + folga && r.bottom > p.top - folga);
  }

  function soltarVoto() {
    if (fase !== 'aberta' || reduzMovimento.matches || document.hidden || baloes.length >= MAX_BALOES) return;
    const vw = innerWidth;
    const vh = innerHeight;
    const no = document.createElement('div');
    no.className = 'voto-flutuante';
    const texto = document.createElement('span');
    texto.className = 'voto-flutuante-texto';
    texto.textContent = '+1 voto';
    const fio = document.createElement('span');
    fio.className = 'voto-flutuante-fio';
    no.append(texto, fio);
    no.style.setProperty('--tam', `${sorteio(2.8, 4.4).toFixed(2)}vh`);
    no.style.setProperty('--cor', CORES[Math.floor(Math.random() * CORES.length)]);
    el.camada.appendChild(no);
    const largura = no.offsetWidth || 120;
    baloes.push({
      no, largura, altura: no.offsetHeight || 80,
      x0: posicaoLateral(vw, largura),
      y0: vh + sorteio(10, 60),
      subida: vh + 200,
      inicio: performance.now(),
      duracao: sorteio(8000, 14000),
      a1: sorteio(0.012, 0.03) * vw, f1: sorteio(0.15, 0.3), p1: sorteio(0, 6.28),
      a2: sorteio(0.005, 0.014) * vw, f2: sorteio(0.4, 0.75), p2: sorteio(0, 6.28),
      a3: sorteio(0.002, 0.005) * vw, f3: sorteio(1.3, 2.2), p3: sorteio(0, 6.28),
      deriva: sorteio(-0.02, 0.02) * vw,
      ritmo: sorteio(0.12, 0.3), pRitmo: sorteio(0, 6.28),
      opacidade: 0,
    });
    if (!quadro) quadro = requestAnimationFrame(animar);
  }

  function animar(agora) {
    quadro = null;
    const vw = innerWidth;
    const rects = retangulos();
    baloes = baloes.filter((b) => {
      const t = (agora - b.inicio) / 1000;
      const prog = (agora - b.inicio) / b.duracao;
      if (prog >= 1) { b.no.remove(); return false; }
      const y = b.y0 - b.subida * (prog + b.ritmo * 0.08 * Math.sin(prog * 6.28 + b.pRitmo) * Math.sin(prog * Math.PI));
      const onda = (a, f, p) => a * Math.sin(t * f * 6.28 + p);
      let x = b.x0 + b.deriva * prog + onda(b.a1, b.f1, b.p1) + onda(b.a2, b.f2, b.p2) + onda(b.a3, b.f3, b.p3);
      x = Math.min(Math.max(x, 4), vw - b.largura - 4);
      const vel = b.a1 * b.f1 * Math.cos(t * b.f1 * 6.28 + b.p1) + b.a2 * b.f2 * Math.cos(t * b.f2 * 6.28 + b.p2);
      const giro = Math.max(-14, Math.min(14, vel * 0.3));
      const escala = 1 + 0.04 * Math.sin(t * 1.7 + b.p3);
      const caixa = { left: x, right: x + b.largura, top: y, bottom: y + b.altura };
      const pontas = Math.min(1, prog / 0.08, (1 - prog) / 0.12);
      const perto = sobrepoe(caixa, rects, 20);
      b.opacidade = perto ? b.opacidade * 0.4 : b.opacidade + (0.95 * pontas - b.opacidade) * 0.12;
      b.no.style.opacity = b.opacidade.toFixed(3);
      b.no.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${giro.toFixed(2)}deg) scale(${escala.toFixed(3)})`;
      return true;
    });
    if (baloes.length) quadro = requestAnimationFrame(animar);
  }

  function proximoVoto() {
    soltarVoto();
    timerVotos = setTimeout(proximoVoto, Math.random() < 0.3 ? sorteio(200, 500) : sorteio(700, 1700));
  }

  function iniciarVotos() {
    if (timerVotos || reduzMovimento.matches) return;
    for (let i = 0; i < 5; i++) {
      soltarVoto();
      const b = baloes[baloes.length - 1];
      if (b) b.inicio -= sorteio(0.1, 0.7) * b.duracao;
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

  /* ------------------------------------------------ QR code para participar */
  function desenharQR() {
    if (typeof window.qrcode !== 'function') { el.qr.hidden = true; return; }
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(URL_VOTACAO);
      qr.make();
      el.qr.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    } catch { el.qr.hidden = true; }
  }

  /* ---------------------------------------------- telão: tela cheia e cursor */
  /* ------------------------------------------- som do recorde (moedinhas) */
  // Navegadores só liberam áudio depois de um clique na página: o clique em
  // "Tela cheia" ou em "Ativar som" liga o som.
  let audio = null;
  let somLigado = false;
  function ligarSom() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      audio.resume?.();
      somLigado = true;
    } catch { somLigado = false; }
    atualizarBotaoSom();
  }
  function atualizarBotaoSom() {
    el.btnSom.textContent = somLigado ? 'Som ligado' : 'Ativar som';
    el.btnSom.setAttribute('aria-pressed', String(somLigado));
    el.btnSom.classList.toggle('pede-atencao', !somLigado);
  }
  function tocarSomRecorde() {
    if (!somLigado || !audio || !window.SomRecorde) return;
    try { audio.resume?.(); window.SomRecorde.tocar(audio); } catch { /* sem som */ }
  }
  el.btnSom.addEventListener('click', () => {
    if (somLigado) { somLigado = false; atualizarBotaoSom(); return; }
    ligarSom();
    tocarSomRecorde(); // toca uma vez para conferir o volume
  });
  atualizarBotaoSom();

  el.btnTelaCheia.addEventListener('click', () => {
    if (!somLigado) ligarSom();
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    el.btnTelaCheia.textContent = document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia';
  });

  let timerCursor = null;
  function mostrarCursor() {
    document.body.classList.remove('cursor-oculto');
    clearTimeout(timerCursor);
    timerCursor = setTimeout(() => document.body.classList.add('cursor-oculto'), 2500);
  }
  ['mousemove', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, mostrarCursor, { passive: true }));
  mostrarCursor();

  // mantém a tela do computador acesa enquanto o telão estiver aberto
  let travaTela = null;
  async function manterTelaAcesa() {
    try { travaTela = await navigator.wakeLock?.request('screen'); } catch { travaTela = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { manterTelaAcesa(); atualizar(); }
  });

  desenharQR();
  manterTelaAcesa();
  atualizar();
})();
