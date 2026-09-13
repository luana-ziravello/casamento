/* Álbum de fotos colaborativo — feed, publicação, reações e comentários.
   Integração real com Supabase (public.album_photos / album_comments / album_reactions
   e o bucket de Storage "album"). */

(function () {
  'use strict';

  const cfg = window.SITE_CONFIG;
  if (!cfg) return;

  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_KEY = cfg.SUPABASE_PUBLISHABLE_KEY;
  const BUCKET = 'album';
  const PAGE_SIZE = 24;
  const MAX_FILES = 10;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const FULL_MAX_DIM = 1920;
  const THUMB_MAX_DIM = 480;
  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const HEIC_TYPES = ['image/heic', 'image/heif'];
  const NOME_MAGICO_ADMIN = 'admin-1010';
  const NOME_EXIBICAO_ADMIN = 'Luana & Heitor';
  const CHAVE_DEVICE = 'album-device-id';
  const CHAVE_NOME = 'album-nome';

  let client = null;
  function getClient() {
    if (!client && window.supabase) client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return client;
  }

  function escaparHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function gerarUuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function sanitizarTexto(valor, limite) {
    return (valor || '').replace(/\s+/g, ' ').trim().slice(0, limite);
  }

  function contemLink(texto) {
    return /https?:\/\/|www\./i.test(texto);
  }

  function obterDeviceId() {
    try {
      let id = localStorage.getItem(CHAVE_DEVICE);
      if (!id) { id = gerarUuid(); localStorage.setItem(CHAVE_DEVICE, id); }
      return id;
    } catch {
      return gerarUuid();
    }
  }
  function obterNomeSalvo() {
    try { return localStorage.getItem(CHAVE_NOME) || ''; } catch { return ''; }
  }
  function salvarNomeLocal(nome) {
    try { localStorage.setItem(CHAVE_NOME, nome); } catch { /* segue sem persistir: nome vale só nesta sessão */ }
  }

  const formatoDataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function formatarData(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : formatoDataHora.format(d);
  }

  const deviceId = obterDeviceId();
  let nomeAtual = '';

  /* ===== elementos ===== */
  const elIndisponivel = document.getElementById('albumIndisponivel');
  const elApp = document.getElementById('albumApp');
  const feedGrid = document.getElementById('feedGrid');
  const feedSentinela = document.getElementById('feedSentinela');
  const feedEstadoTopo = document.getElementById('feedEstadoTopo');
  const feedNomeAtual = document.getElementById('feedNomeAtual');
  const btnTrocarNome = document.getElementById('btnTrocarNome');

  const modalNome = document.getElementById('modalNome');
  const formNome = document.getElementById('formNome');
  const campoNome = document.getElementById('campoNome');
  const erroNome = document.getElementById('erroNome');

  const modalFoto = document.getElementById('modalFoto');
  const btnFecharLightbox = document.getElementById('btnFecharLightbox');
  const btnFotoAnterior = document.getElementById('btnFotoAnterior');
  const btnFotoProxima = document.getElementById('btnFotoProxima');
  const lightboxImagem = document.getElementById('lightboxImagem');
  const lightboxCaixa = document.querySelector('.album-lightbox-caixa');
  const lightboxAutor = document.getElementById('lightboxAutor');
  const lightboxData = document.getElementById('lightboxData');
  const lightboxLegenda = document.getElementById('lightboxLegenda');
  const btnReagir = document.getElementById('btnReagir');
  const lightboxContagemReacoes = document.getElementById('lightboxContagemReacoes');
  const btnBaixarFoto = document.getElementById('btnBaixarFoto');
  const listaComentarios = document.getElementById('listaComentarios');
  const formComentario = document.getElementById('formComentario');
  const campoComentario = document.getElementById('campoComentario');
  const erroComentario = document.getElementById('erroComentario');

  const btnAbrirComposer = document.getElementById('btnAbrirComposer');
  const modalComposer = document.getElementById('modalComposer');
  const btnFecharComposer = document.getElementById('btnFecharComposer');
  const btnTirarFoto = document.getElementById('btnTirarFoto');
  const btnEscolherGaleria = document.getElementById('btnEscolherGaleria');
  const inputCamera = document.getElementById('inputCamera');
  const inputGaleria = document.getElementById('inputGaleria');
  const erroComposer = document.getElementById('erroComposer');
  const previewsComposer = document.getElementById('previewsComposer');
  const btnPublicar = document.getElementById('btnPublicar');

  const albumToast = document.getElementById('albumToast');

  /* ===== overlays ===== */
  const focoAoAbrir = {};
  function abrirOverlay(overlay, foco) {
    focoAoAbrir[overlay.id] = document.activeElement;
    overlay.classList.add('aberta');
    document.body.style.overflow = 'hidden';
    if (foco) foco.focus();
  }
  function fecharOverlay(overlay) {
    overlay.classList.remove('aberta');
    if (!document.querySelector('.modal-overlay.aberta')) document.body.style.overflow = '';
    const anterior = focoAoAbrir[overlay.id];
    if (anterior && typeof anterior.focus === 'function') anterior.focus();
    delete focoAoAbrir[overlay.id];
  }

  /* ===== nome do convidado ===== */
  let modoAdmin = false;
  function nomeExibicao() {
    return modoAdmin ? NOME_EXIBICAO_ADMIN : nomeAtual;
  }
  function atualizarRotuloNome() {
    modoAdmin = nomeAtual.trim().toLowerCase() === NOME_MAGICO_ADMIN;
    document.body.classList.toggle('album-modo-admin', modoAdmin);
    feedEstadoTopo.hidden = !nomeAtual;
    feedNomeAtual.textContent = nomeExibicao();
  }

  let permiteFecharModalNome = false;
  function abrirModalNome(paraTrocar) {
    permiteFecharModalNome = !!paraTrocar;
    campoNome.value = paraTrocar ? nomeAtual : '';
    erroNome.textContent = '';
    erroNome.classList.remove('mostrar');
    abrirOverlay(modalNome, campoNome);
  }

  formNome.addEventListener('submit', (e) => {
    e.preventDefault();
    const valor = sanitizarTexto(campoNome.value, 60);
    if (!valor) {
      erroNome.textContent = 'Digite um nome para continuar.';
      erroNome.classList.add('mostrar');
      return;
    }
    salvarNomeLocal(valor);
    nomeAtual = valor;
    atualizarRotuloNome();
    fecharOverlay(modalNome);
  });

  modalNome.addEventListener('click', (e) => {
    if (e.target === modalNome && permiteFecharModalNome) fecharOverlay(modalNome);
  });

  btnTrocarNome.addEventListener('click', () => abrirModalNome(true));

  /* ===== efeito de rolagem do hero ===== */
  (function () {
    const hero = document.getElementById('albumHero');
    const conteudo = document.getElementById('albumHeroConteudo');
    const imgFundo = hero ? hero.querySelector('.hero-fundo img') : null;
    if (!hero || !conteudo) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let ticking = false;
    function aplicar() {
      const altura = hero.offsetHeight || window.innerHeight;
      const progresso = Math.min(1, Math.max(0, window.scrollY / (altura * 0.82)));
      conteudo.style.opacity = String(1 - progresso);
      conteudo.style.transform = `translateY(${progresso * 34}px)`;
      if (imgFundo) imgFundo.style.transform = `scale(${1 - progresso * 0.07})`;
      document.body.classList.toggle('album-rolou', progresso > 0.4);
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(aplicar); ticking = true; }
    }, { passive: true });
    aplicar();
  })();

  (function () {
    const btn = document.getElementById('btnRolarParaFeed');
    const feedSecao = document.getElementById('feedSecao');
    if (!btn || !feedSecao) return;
    btn.addEventListener('click', () => {
      const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      feedSecao.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
    });
  })();

  /* ===== barra de progresso de leitura ===== */
  (function () {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      bar.style.width = max > 0 ? `${(h.scrollTop / max) * 100}%` : '0%';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  })();

  /* ===== feed ===== */
  let feedItems = [];
  let feedOffset = 0;
  let feedTemMais = true;
  let feedCarregando = false;

  function urlPublica(caminho) {
    const supa = getClient();
    return supa.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  }

  function cardHtml(foto) {
    const proporcao = foto.width && foto.height ? `${foto.width} / ${foto.height}` : '1 / 1';
    const rotulo = `Ver foto de ${escaparHtml(foto.author_name)} em tamanho grande`;
    return `
      <figure class="album-card" data-id="${foto.id}" tabindex="0" role="button" aria-label="${rotulo}" style="aspect-ratio:${proporcao}">
        <img src="${urlPublica(foto.thumb_path)}" alt="" loading="lazy" decoding="async">
        <button type="button" class="album-card-excluir" data-excluir-foto="${foto.id}" aria-label="Excluir esta foto">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </figure>
    `;
  }

  function marcarCarregadaAoTerminar(container) {
    container.querySelectorAll('img').forEach((img) => {
      if (img.complete) { img.classList.add('album-carregada'); return; }
      img.addEventListener('load', () => img.classList.add('album-carregada'), { once: true });
    });
  }

  function renderEstadoVazio() {
    feedGrid.innerHTML = `
      <div class="album-feed-vazio" style="column-span: all;">
        <p>A história começa pelo primeiro olhar.</p>
        <button class="btn btn-secundario" type="button" id="btnPublicarPrimeira">Publicar a primeira foto</button>
      </div>
    `;
    const btn = document.getElementById('btnPublicarPrimeira');
    if (btn) btn.addEventListener('click', () => abrirComposer());
  }

  function renderAdicionarCards(fotos, noInicio) {
    const html = fotos.map(cardHtml).join('');
    if (noInicio) feedGrid.insertAdjacentHTML('afterbegin', html);
    else feedGrid.insertAdjacentHTML('beforeend', html);
    marcarCarregadaAoTerminar(feedGrid);
  }

  async function carregarFeed(inicial) {
    if (feedCarregando || (!feedTemMais && !inicial)) return;
    feedCarregando = true;
    const supa = getClient();
    const { data, error } = await supa
      .from('album_photos')
      .select('id, author_name, caption, storage_path, thumb_path, width, height, created_at')
      .order('created_at', { ascending: false })
      .range(feedOffset, feedOffset + PAGE_SIZE - 1);
    feedCarregando = false;

    if (error) {
      if (inicial) feedGrid.innerHTML = '<p class="album-feed-erro">Não foi possível carregar o álbum agora. Verifique sua conexão e tente novamente.</p>';
      return;
    }

    const novos = data || [];
    feedTemMais = novos.length === PAGE_SIZE;
    feedOffset += novos.length;
    feedItems = feedItems.concat(novos);

    if (inicial && !novos.length) { renderEstadoVazio(); return; }
    renderAdicionarCards(novos, false);
  }

  function recarregarFeedDoInicio() {
    feedItems = [];
    feedOffset = 0;
    feedTemMais = true;
    feedGrid.innerHTML = '';
    carregarFeed(true);
  }

  async function excluirFotoDoFeed(id, botao) {
    if (!confirm('Excluir esta foto do álbum? Essa ação não pode ser desfeita.')) return;
    botao.disabled = true;
    const supa = getClient();
    const { data: foto } = await supa.from('album_photos').select('storage_path, thumb_path').eq('id', id).single();
    if (foto) await supa.storage.from(BUCKET).remove([foto.storage_path, foto.thumb_path].filter(Boolean));
    const { error } = await supa.from('album_photos').delete().eq('id', id);
    if (error) { alert('Não foi possível excluir agora. Tente novamente.'); botao.disabled = false; return; }
    feedItems = feedItems.filter((f) => f.id !== id);
    const card = feedGrid.querySelector(`.album-card[data-id="${id}"]`);
    if (card) card.remove();
    if (!feedItems.length && !feedGrid.querySelector('.album-card')) renderEstadoVazio();
  }

  feedGrid.addEventListener('click', (e) => {
    const botaoExcluir = e.target.closest('[data-excluir-foto]');
    if (botaoExcluir) {
      e.stopPropagation();
      excluirFotoDoFeed(Number(botaoExcluir.dataset.excluirFoto), botaoExcluir);
      return;
    }
    const card = e.target.closest('.album-card');
    if (card) abrirLightbox(Number(card.dataset.id));
  });
  feedGrid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.album-card');
    if (!card) return;
    e.preventDefault();
    abrirLightbox(Number(card.dataset.id));
  });

  function assinarRealtime() {
    const supa = getClient();
    supa.channel('album-feed-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'album_photos' }, (payload) => {
        const foto = payload.new;
        if (foto.status !== 'visible') return;
        if (feedItems.some((f) => f.id === foto.id)) return;
        feedItems.unshift(foto);
        feedOffset += 1;
        if (feedGrid.querySelector('.album-feed-vazio')) feedGrid.innerHTML = '';
        renderAdicionarCards([foto], true);
      })
      .subscribe();
  }

  /* ===== lightbox ===== */
  let fotoAbertaId = null;
  let fotoAbertaUrl = '';

  function indiceAtual() {
    return feedItems.findIndex((f) => f.id === fotoAbertaId);
  }

  function atualizarBotoesNavegacao() {
    const i = indiceAtual();
    btnFotoAnterior.hidden = i <= 0;
    btnFotoProxima.hidden = i === feedItems.length - 1 && !feedTemMais;
  }

  function renderizarLightboxBase(foto) {
    fotoAbertaUrl = urlPublica(foto.storage_path);
    lightboxImagem.src = fotoAbertaUrl;
    lightboxImagem.alt = foto.caption ? foto.caption : `Foto de ${foto.author_name}`;
    lightboxAutor.textContent = foto.author_name;
    lightboxData.textContent = `· ${formatarData(foto.created_at)}`;
    if (foto.caption) { lightboxLegenda.textContent = foto.caption; lightboxLegenda.hidden = false; }
    else { lightboxLegenda.hidden = true; }
    listaComentarios.innerHTML = '<p class="album-comentarios-estado">Carregando comentários…</p>';
    btnReagir.setAttribute('aria-pressed', 'false');
    btnReagir.disabled = false;
    lightboxContagemReacoes.textContent = '';
    campoComentario.value = '';
    erroComentario.textContent = '';
    erroComentario.classList.remove('mostrar');
    atualizarBotoesNavegacao();
  }

  function renderComentarios(lista) {
    if (!lista.length) {
      listaComentarios.innerHTML = '<p class="album-comentarios-estado">Seja a primeira pessoa a comentar.</p>';
      return;
    }
    listaComentarios.innerHTML = lista.map((c) => `
      <div class="album-comentario">
        <strong>${escaparHtml(c.author_name)}</strong>
        <span class="album-comentario-quando">${formatarData(c.created_at)}</span>
        <p>${escaparHtml(c.body)}</p>
      </div>
    `).join('');
  }

  async function carregarDetalhesFoto(id) {
    const supa = getClient();
    const [comentariosRes, reacoesRes] = await Promise.all([
      supa.from('album_comments').select('id, author_name, body, created_at').eq('photo_id', id).order('created_at', { ascending: true }),
      supa.from('album_reactions').select('device_id').eq('photo_id', id),
    ]);
    if (fotoAbertaId !== id) return;
    renderComentarios(comentariosRes.data || []);
    const reacoes = reacoesRes.data || [];
    const jaReagi = reacoes.some((r) => r.device_id === deviceId);
    btnReagir.setAttribute('aria-pressed', String(jaReagi));
    lightboxContagemReacoes.textContent = reacoes.length ? String(reacoes.length) : '';
  }

  function abrirLightbox(id) {
    const foto = feedItems.find((f) => f.id === id);
    if (!foto) return;
    fotoAbertaId = id;
    renderizarLightboxBase(foto);
    abrirOverlay(modalFoto, btnFecharLightbox);
    carregarDetalhesFoto(id);
  }

  function fecharLightbox() {
    fotoAbertaId = null;
    lightboxImagem.src = '';
    lightboxCaixa.classList.remove('tela-cheia');
    fecharOverlay(modalFoto);
  }

  lightboxImagem.addEventListener('click', () => {
    if (!fotoAbertaId) return;
    lightboxCaixa.classList.toggle('tela-cheia');
  });

  async function navegarFoto(delta) {
    const i = indiceAtual();
    if (i === -1) return;
    let alvo = i + delta;
    if (alvo < 0) return;
    if (alvo >= feedItems.length) {
      if (!feedTemMais) return;
      await carregarFeed(false);
      if (alvo >= feedItems.length) return;
    }
    const foto = feedItems[alvo];
    fotoAbertaId = foto.id;
    renderizarLightboxBase(foto);
    carregarDetalhesFoto(foto.id);
  }

  btnFecharLightbox.addEventListener('click', fecharLightbox);
  modalFoto.addEventListener('click', (e) => { if (e.target === modalFoto) fecharLightbox(); });
  btnFotoAnterior.addEventListener('click', () => navegarFoto(-1));
  btnFotoProxima.addEventListener('click', () => navegarFoto(1));

  btnReagir.addEventListener('click', async () => {
    if (!fotoAbertaId) return;
    const supa = getClient();
    const pressionado = btnReagir.getAttribute('aria-pressed') === 'true';
    btnReagir.disabled = true;
    try {
      if (pressionado) {
        await supa.from('album_reactions').delete().eq('photo_id', fotoAbertaId).eq('device_id', deviceId);
        btnReagir.setAttribute('aria-pressed', 'false');
        const atual = Number(lightboxContagemReacoes.textContent || '0');
        lightboxContagemReacoes.textContent = atual > 1 ? String(atual - 1) : '';
      } else {
        await supa.from('album_reactions').insert({ photo_id: fotoAbertaId, device_id: deviceId });
        btnReagir.setAttribute('aria-pressed', 'true');
        const atual = Number(lightboxContagemReacoes.textContent || '0');
        lightboxContagemReacoes.textContent = String(atual + 1);
      }
    } finally {
      btnReagir.disabled = false;
    }
  });

  const btnBaixarFotoTexto = document.getElementById('btnBaixarFotoTexto');
  btnBaixarFoto.addEventListener('click', async () => {
    if (!fotoAbertaUrl) return;
    const textoOriginal = btnBaixarFotoTexto.textContent;
    btnBaixarFoto.disabled = true;
    btnBaixarFotoTexto.textContent = 'Baixando…';
    try {
      const resposta = await fetch(fotoAbertaUrl);
      if (!resposta.ok) throw new Error('download falhou');
      const blob = await resposta.blob();
      const nomeArquivo = `foto-luana-e-heitor-${fotoAbertaId}.jpg`;

      const arquivo = new File([blob], nomeArquivo, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } catch (e) {
      if (e && e.name !== 'AbortError') window.open(fotoAbertaUrl, '_blank', 'noopener');
    } finally {
      btnBaixarFoto.disabled = false;
      btnBaixarFotoTexto.textContent = textoOriginal;
    }
  });

  let enviandoComentario = false;
  formComentario.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviandoComentario || !fotoAbertaId) return;
    erroComentario.classList.remove('mostrar');

    const texto = sanitizarTexto(campoComentario.value, 300);
    if (!texto) {
      erroComentario.textContent = 'Escreva algo antes de enviar.';
      erroComentario.classList.add('mostrar');
      return;
    }
    if (contemLink(texto)) {
      erroComentario.textContent = 'Não é permitido incluir links nos comentários.';
      erroComentario.classList.add('mostrar');
      return;
    }

    enviandoComentario = true;
    const botao = formComentario.querySelector('button[type="submit"]');
    botao.disabled = true;
    const textoOriginal = botao.textContent;
    botao.textContent = 'Enviando…';

    const supa = getClient();
    const idFoto = fotoAbertaId;
    const { error } = await supa.from('album_comments').insert({ photo_id: idFoto, device_id: deviceId, author_name: nomeExibicao(), body: texto });

    botao.disabled = false;
    botao.textContent = textoOriginal;
    enviandoComentario = false;

    if (error) {
      erroComentario.textContent = 'Não foi possível enviar seu comentário agora. Tente novamente.';
      erroComentario.classList.add('mostrar');
      return;
    }
    campoComentario.value = '';
    if (fotoAbertaId === idFoto) carregarDetalhesFoto(idFoto);
  });

  /* ===== teclado global (lightbox / composer) ===== */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalComposer.classList.contains('aberta')) { fecharComposerTotal(); return; }
      if (lightboxCaixa.classList.contains('tela-cheia')) { lightboxCaixa.classList.remove('tela-cheia'); return; }
      if (modalFoto.classList.contains('aberta')) { fecharLightbox(); return; }
      if (modalNome.classList.contains('aberta') && permiteFecharModalNome) { fecharOverlay(modalNome); return; }
    }
    if (modalFoto.classList.contains('aberta') && document.activeElement !== campoComentario) {
      if (e.key === 'ArrowRight') navegarFoto(1);
      if (e.key === 'ArrowLeft') navegarFoto(-1);
    }
  });

  /* ===== composer: preparo de imagem (orientação EXIF + compressão) ===== */
  async function decodificarImagem(file) {
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' });
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function desenharRedimensionado(bitmap, maxDim) {
    const w = bitmap.width || bitmap.naturalWidth;
    const h = bitmap.height || bitmap.naturalHeight;
    const escala = Math.min(1, maxDim / Math.max(w, h));
    const largura = Math.max(1, Math.round(w * escala));
    const altura = Math.max(1, Math.round(h * escala));
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
    return { canvas, largura, altura };
  }

  function canvasParaBlob(canvas, tipo, qualidade) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar imagem.'))), tipo, qualidade);
    });
  }

  async function prepararImagem(file) {
    const ehHeic = HEIC_TYPES.includes(file.type) || /\.(heic|heif)$/i.test(file.name);
    let bitmap;
    try {
      bitmap = await decodificarImagem(file);
    } catch {
      if (ehHeic) {
        throw new Error('Formato HEIC/HEIF não suportado neste navegador. Nas configurações de Câmera do iPhone, mude para "Mais Compatível" (JPEG) e tente de novo.');
      }
      throw new Error('Não foi possível abrir esta imagem.');
    }
    const largOriginal = bitmap.width || bitmap.naturalWidth;
    const altOriginal = bitmap.height || bitmap.naturalHeight;
    if (!largOriginal || !altOriginal) throw new Error('Não foi possível ler esta imagem.');

    const cheia = desenharRedimensionado(bitmap, FULL_MAX_DIM);
    const mini = desenharRedimensionado(bitmap, THUMB_MAX_DIM);
    if (bitmap.close) bitmap.close();

    const [blobCheio, blobMini] = await Promise.all([
      canvasParaBlob(cheia.canvas, 'image/jpeg', 0.82),
      canvasParaBlob(mini.canvas, 'image/jpeg', 0.75),
    ]);

    return { blobCheio, blobMini, largura: cheia.largura, altura: cheia.altura };
  }

  /* ===== composer: estado e UI ===== */
  let arquivosSelecionados = [];
  let publicando = false;

  function limiteAtingido() { return arquivosSelecionados.length >= MAX_FILES; }

  function mostrarErroComposer(msg) {
    erroComposer.textContent = msg;
    erroComposer.hidden = false;
    setTimeout(() => { erroComposer.hidden = true; }, 4500);
  }

  function atualizarBotaoPublicar() {
    const prontos = arquivosSelecionados.filter((a) => a.status === 'pronto').length;
    btnPublicar.disabled = publicando || prontos === 0;
  }

  function renderPreviews() {
    previewsComposer.innerHTML = arquivosSelecionados.map((item) => {
      let status = '';
      if (item.status === 'processando') status = '<div class="album-preview-status">Processando…</div>';
      else if (item.status === 'enviando') status = '<div class="album-preview-status">Enviando…</div>';
      else if (item.status === 'erro') status = `<div class="album-preview-status album-preview-erro"><span>${escaparHtml(item.mensagemErro || 'Erro')}</span><button type="button" data-retry="${item.id}">Tentar novamente</button></div>`;
      return `
        <div class="album-preview-item" data-id="${item.id}">
          ${item.previewUrl ? `<img src="${item.previewUrl}" alt="">` : ''}
          ${status}
          <button type="button" class="album-preview-remover" data-remover="${item.id}" aria-label="Remover esta foto">✕</button>
        </div>
      `;
    }).join('');
    atualizarBotaoPublicar();
  }

  previewsComposer.addEventListener('click', (e) => {
    const remover = e.target.closest('[data-remover]');
    if (remover) { removerArquivo(remover.dataset.remover); return; }
    const retry = e.target.closest('[data-retry]');
    if (retry) {
      const item = arquivosSelecionados.find((a) => a.id === retry.dataset.retry);
      if (item && item.blobCheio) { item.status = 'pronto'; item.mensagemErro = ''; renderPreviews(); }
    }
  });

  function removerArquivo(id) {
    const idx = arquivosSelecionados.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const [removido] = arquivosSelecionados.splice(idx, 1);
    if (removido.previewUrl) URL.revokeObjectURL(removido.previewUrl);
    renderPreviews();
  }

  async function processarArquivo(item) {
    const nomeArquivo = item.file.name || '';
    const tipoValido = ACCEPTED_TYPES.includes(item.file.type)
      || HEIC_TYPES.includes(item.file.type)
      || /\.(heic|heif|jpe?g|png|webp)$/i.test(nomeArquivo);
    if (!tipoValido) {
      item.status = 'erro';
      item.mensagemErro = 'Formato não suportado.';
      renderPreviews();
      return;
    }
    if (item.file.size > MAX_FILE_BYTES) {
      item.status = 'erro';
      item.mensagemErro = 'Arquivo maior que 10 MB.';
      renderPreviews();
      return;
    }
    try {
      const preparado = await prepararImagem(item.file);
      item.blobCheio = preparado.blobCheio;
      item.blobMini = preparado.blobMini;
      item.largura = preparado.largura;
      item.altura = preparado.altura;
      item.previewUrl = URL.createObjectURL(preparado.blobCheio);
      item.status = 'pronto';
    } catch (e) {
      item.status = 'erro';
      item.mensagemErro = (e && e.message) || 'Não foi possível processar esta imagem.';
    }
    renderPreviews();
  }

  function adicionarArquivos(fileList) {
    const restante = MAX_FILES - arquivosSelecionados.length;
    if (restante <= 0) { mostrarErroComposer(`Você pode enviar no máximo ${MAX_FILES} fotos por publicação.`); return; }
    const arr = Array.from(fileList).slice(0, restante);
    if (fileList.length > restante) mostrarErroComposer(`Você pode enviar no máximo ${MAX_FILES} fotos por publicação.`);
    arr.forEach((file) => {
      const item = { id: gerarUuid(), file, status: 'processando', mensagemErro: '' };
      arquivosSelecionados.push(item);
      renderPreviews();
      processarArquivo(item);
    });
  }

  btnTirarFoto.addEventListener('click', () => {
    if (limiteAtingido()) { mostrarErroComposer(`Limite de ${MAX_FILES} fotos por publicação.`); return; }
    inputCamera.click();
  });
  btnEscolherGaleria.addEventListener('click', () => {
    if (limiteAtingido()) { mostrarErroComposer(`Limite de ${MAX_FILES} fotos por publicação.`); return; }
    inputGaleria.click();
  });
  inputCamera.addEventListener('change', () => { adicionarArquivos(inputCamera.files); inputCamera.value = ''; });
  inputGaleria.addEventListener('change', () => { adicionarArquivos(inputGaleria.files); inputGaleria.value = ''; });

  function abrirComposer() {
    abrirOverlay(modalComposer, btnTirarFoto);
  }
  function fecharComposerTotal() {
    if (publicando) return;
    arquivosSelecionados.forEach((a) => { if (a.previewUrl) URL.revokeObjectURL(a.previewUrl); });
    arquivosSelecionados = [];
    erroComposer.hidden = true;
    renderPreviews();
    fecharOverlay(modalComposer);
  }
  btnAbrirComposer.addEventListener('click', abrirComposer);
  btnFecharComposer.addEventListener('click', fecharComposerTotal);
  modalComposer.addEventListener('click', (e) => { if (e.target === modalComposer) fecharComposerTotal(); });

  function mostrarToast(msg) {
    albumToast.textContent = msg;
    albumToast.hidden = false;
    requestAnimationFrame(() => albumToast.classList.add('mostrar'));
    setTimeout(() => {
      albumToast.classList.remove('mostrar');
      setTimeout(() => { albumToast.hidden = true; }, 320);
    }, 3200);
  }

  btnPublicar.addEventListener('click', async () => {
    if (publicando) return;
    const prontos = arquivosSelecionados.filter((a) => a.status === 'pronto');
    if (!prontos.length) return;

    publicando = true;
    btnPublicar.disabled = true;
    const textoOriginal = btnPublicar.textContent;
    btnPublicar.textContent = 'Publicando…';

    const supa = getClient();
    let algumSucesso = false;

    for (const item of prontos) {
      item.status = 'enviando';
      renderPreviews();
      try {
        const ano = new Date().getFullYear();
        const base = `${ano}/${deviceId.slice(0, 8)}/${item.id}`;
        const caminhoCheio = `${base}-full.jpg`;
        const caminhoMini = `${base}-thumb.jpg`;

        const up1 = await supa.storage.from(BUCKET).upload(caminhoCheio, item.blobCheio, { contentType: 'image/jpeg', upsert: false });
        if (up1.error) throw up1.error;
        const up2 = await supa.storage.from(BUCKET).upload(caminhoMini, item.blobMini, { contentType: 'image/jpeg', upsert: false });
        if (up2.error) throw up2.error;

        const { error: erroInsert } = await supa.from('album_photos').insert({
          device_id: deviceId,
          author_name: nomeExibicao(),
          caption: null,
          storage_path: caminhoCheio,
          thumb_path: caminhoMini,
          width: item.largura,
          height: item.altura,
        });
        if (erroInsert) throw erroInsert;

        item.status = 'concluido';
        algumSucesso = true;
      } catch {
        item.status = 'erro';
        item.mensagemErro = 'Falha ao enviar. Toque em publicar novamente para tentar de novo.';
      }
      renderPreviews();
    }

    arquivosSelecionados = arquivosSelecionados.filter((a) => a.status !== 'concluido');
    renderPreviews();
    publicando = false;
    btnPublicar.textContent = textoOriginal;
    atualizarBotaoPublicar();

    if (algumSucesso) {
      if (!arquivosSelecionados.length) fecharOverlay(modalComposer);
      mostrarToast('Seu olhar agora faz parte da nossa história.');
      recarregarFeedDoInicio();
    }
  });

  /* ===== inicialização ===== */
  document.addEventListener('DOMContentLoaded', () => {
    if (!cfg.PHOTO_ALBUM_ENABLED) {
      elIndisponivel.hidden = false;
      return;
    }
    elApp.hidden = false;

    nomeAtual = obterNomeSalvo();
    atualizarRotuloNome();
    if (!nomeAtual) abrirModalNome(false);

    carregarFeed(true);
    assinarRealtime();

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { if (entry.isIntersecting) carregarFeed(false); });
      }, { rootMargin: '400px 0px' });
      io.observe(feedSentinela);
    }
  });
})();
