document.documentElement.classList.add('js');

/* ===== nav: fundo sólido ao rolar + menu mobile ===== */
(function () {
  const nav = document.querySelector('.nav');
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!nav) return;

  const onScroll = () => nav.classList.toggle('is-solid', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }
})();

/* ===== barra de progresso de leitura ===== */
(function () {
  const bar = document.getElementById('scrollProgress');
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = max > 0 ? `${(scrolled / max) * 100}%` : '0%';
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
})();

/* ===== scroll reveal ===== */
(function () {
  const items = document.querySelectorAll('[data-reveal]');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('em-vista'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('em-vista');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  items.forEach((el) => io.observe(el));
})();

/* ===== contagem regressiva ===== */
(function () {
  const el = document.getElementById('countdown');
  if (!el) return;
  const target = new Date(el.dataset.target).getTime();
  const dias = document.getElementById('cd-days');
  const horas = document.getElementById('cd-hours');
  const mins = document.getElementById('cd-mins');
  const segs = document.getElementById('cd-secs');

  function tick() {
    const diff = Math.max(0, target - Date.now());
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    if (dias) dias.textContent = String(d);
    if (horas) horas.textContent = String(h).padStart(2, '0');
    if (mins) mins.textContent = String(m).padStart(2, '0');
    if (segs) segs.textContent = String(s).padStart(2, '0');
  }
  tick();
  setInterval(tick, 1000);
})();

/* ===== botão do álbum de fotos (troca "Confirmar presença" quando ativado) ===== */
(function () {
  const btn = document.getElementById('ctaConfirmarPresenca');
  if (!btn || !window.SITE_CONFIG) return;
  window.SITE_CONFIG.albumEstaNoAr().then((noAr) => {
    if (!noAr) return;
    btn.textContent = 'Álbum de fotos';
    btn.setAttribute('href', 'album.html');
  });
})();

/* ===== modais (traje / padrinhos / recado / etc.) ===== */
const __ultimoFocoModal = {};
function abrirModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  __ultimoFocoModal[id] = document.activeElement;
  overlay.classList.add('aberta');
  document.body.style.overflow = 'hidden';
  const alvo = overlay.querySelector('[data-foco-inicial]') || overlay.querySelector('.modal-fechar');
  if (alvo) alvo.focus();
}
function fecharModal(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;
  overlay.classList.remove('aberta');
  document.body.style.overflow = '';
  const opener = __ultimoFocoModal[id];
  if (opener && typeof opener.focus === 'function') opener.focus();
  delete __ultimoFocoModal[id];
}
function fecharModalFora(event, id) {
  if (event.target.id === id) fecharModal(id);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.aberta').forEach((m) => fecharModal(m.id));
});
function teclaLinha(event, fn) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fn(); }
}

/* ===== presenças especiais (padrinhos, madrinhas e família) ===== */
const PADRINHOS = [
  { nome: 'Alice e Marcelo', foto: 'imagens/padrinhos/alice-marcelo.jpg', posicao: 'center 28%', relacao: 'Tios da noiva', descricao: 'Presenças queridas que sempre acompanharam sua história com muito carinho.' },
  { nome: 'Amanda e Wesley', foto: 'imagens/padrinhos/amanda-wesley.jpg', posicao: 'center 20%', relacao: 'Irmã e cunhado da noiva', descricao: 'Vieram da Irlanda para viver de perto esse momento tão especial conosco.' },
  { nome: 'Anne e Edu', foto: 'imagens/padrinhos/anne-edu.jpg', posicao: 'center 30%', relacao: 'Familiares do noivo', descricao: 'Pessoas muito queridas, que ocupam um lugar especial em nossa família.' },
  { nome: 'Bete', foto: 'imagens/padrinhos/bete.jpg', posicao: 'center 18%', relacao: 'Mãe da noiva', descricao: 'Seu porto seguro, maior exemplo de força e amor por toda a vida.' },
  { nome: 'Deive e Walace', foto: 'imagens/padrinhos/deive-walace.jpg', posicao: 'center 42%', relacao: 'Melhores amigos da noiva', descricao: 'Amigos de uma vida inteira e companheiros de incontáveis histórias.' },
  { nome: 'Hélio e Liliane', foto: 'imagens/padrinhos/helio-liliane.jpg', posicao: 'center 35%', relacao: 'Tios e padrinhos do noivo', descricao: 'Parte importante da sua história e exemplos de amor, cuidado e família.' },
  { nome: 'João', foto: 'imagens/padrinhos/joao.jpg', posicao: 'center 22%', relacao: 'Melhor amigo do noivo', descricao: 'Parceiro de vida, de boas histórias e de momentos inesquecíveis.' },
  { nome: 'Lorella', foto: 'imagens/padrinhos/lorella.jpg', posicao: 'center 15%', relacao: 'Melhor amiga do noivo', descricao: 'Uma amizade cheia de carinho, cumplicidade e boas lembranças.' },
  { nome: 'Márcia e Maurício', foto: 'imagens/padrinhos/marcia-mauricio.jpg', posicao: 'center 38%', relacao: 'Tios e padrinhos da noiva', descricao: 'Sempre presentes, cercando sua vida de amor, cuidado e carinho.' },
  { nome: 'Maria', foto: 'imagens/padrinhos/maria.jpg', posicao: 'center 40%', relacao: 'Avó da noiva', descricao: 'A raiz da família e uma fonte inesgotável de amor, força e ternura.' },
  { nome: 'Sandra', foto: 'imagens/padrinhos/sandra.jpg', posicao: 'center 48%', relacao: 'Mãe do noivo', descricao: 'Presença de amor, cuidado e acolhimento em cada etapa da sua caminhada.' },
  { nome: 'Sofia e Zoe', foto: 'imagens/padrinhos/sofia-zoe.jpg', posicao: 'center 45%', relacao: 'Melhores amigas do noivo', descricao: 'Amizades especiais que deixam sua vida muito mais leve e feliz.' },
  { nome: 'Thaís', foto: 'imagens/padrinhos/thais.jpg', posicao: 'center 18%', relacao: 'Prima da noiva', descricao: 'Uma presença muito querida em tantos capítulos da sua história.' },
];

function montarPadrinhos() {
  const lista = document.getElementById('padrinhosLista');
  if (!lista) return;
  lista.innerHTML = PADRINHOS.map((p, i) => `
    <div class="padrinho">
      <div class="padrinho-avatar" role="button" tabindex="0" aria-label="Ver foto de ${p.nome} em tamanho grande" onclick="abrirFotoPadrinho(${i})" onkeydown="teclaLinha(event, () => abrirFotoPadrinho(${i}))">
        <img src="${p.foto}" alt="" style="object-position:${p.posicao}">
      </div>
      <div class="padrinho-info">
        <h4>${p.nome}</h4>
        <span class="padrinho-relacao">${p.relacao}</span>
      </div>
    </div>
  `).join('');
}

function abrirFotoPadrinho(indice) {
  const p = PADRINHOS[indice];
  if (!p) return;
  const img = document.getElementById('imagemFotoPadrinho');
  const titulo = document.getElementById('tituloFotoPadrinho');
  const relacao = document.getElementById('relacaoFotoPadrinho');
  const descricao = document.getElementById('descricaoFotoPadrinho');
  if (!img || !titulo) return;
  img.src = p.foto;
  img.alt = p.nome;
  img.style.objectPosition = p.posicao || 'center';
  titulo.textContent = p.nome;
  if (relacao) relacao.textContent = p.relacao || '';
  if (descricao) descricao.textContent = p.descricao || '';
  abrirModal('modalFotoPadrinho');
}

document.addEventListener('DOMContentLoaded', montarPadrinhos);
