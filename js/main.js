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
