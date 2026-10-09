/* ==========================================================================
   Som do "Novo recorde!!!!": caixa registradora + chuva de moedinhas.
   Sintetizado com Web Audio (nenhum arquivo de áudio, nada de terceiros).
   SomRecorde.tocar(contexto, inicioEmSegundos) funciona com AudioContext
   (ao vivo) ou OfflineAudioContext (para gerar uma prévia em arquivo).
   ========================================================================== */
window.SomRecorde = (function () {
  function ruido(ctx, duracao) {
    const n = Math.max(1, Math.floor(ctx.sampleRate * duracao));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Um "tim" metálico: parciais inarmônicas de moeda + estalo curto de batida.
  function moeda(ctx, destino, t, freq, volume, decaimento, pan) {
    const saida = ctx.createGain();
    saida.gain.value = volume;
    let no = saida;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      saida.connect(p);
      no = p;
    }
    no.connect(destino);

    [[1, 1], [2.76, 0.55], [5.4, 0.32], [8.93, 0.18]].forEach(([mult, amp], i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * mult, t);
      const g = ctx.createGain();
      const dec = decaimento / (1 + i * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(saida);
      o.start(t);
      o.stop(t + dec + 0.02);
    });

    const estalo = ctx.createBufferSource();
    estalo.buffer = ruido(ctx, 0.02);
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'highpass';
    filtro.frequency.value = 3500;
    const ge = ctx.createGain();
    ge.gain.setValueAtTime(0.35, t);
    ge.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
    estalo.connect(filtro).connect(ge).connect(saida);
    estalo.start(t);
  }

  // "Tchin-tchin" da caixa registradora: mecânica (ruído) + sino duplo.
  function caixaRegistradora(ctx, destino, t) {
    const mec = ctx.createBufferSource();
    mec.buffer = ruido(ctx, 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    const gm = ctx.createGain();
    gm.gain.setValueAtTime(0.5, t);
    gm.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    mec.connect(bp).connect(gm).connect(destino);
    mec.start(t);

    [[2093, 0], [2637, 0.07], [3136, 0.07]].forEach(([f, atraso]) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      const ti = t + 0.09 + atraso;
      g.gain.setValueAtTime(0.0001, ti);
      g.gain.exponentialRampToValueAtTime(0.32, ti + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, ti + 1.3);
      o.connect(g).connect(destino);
      o.start(ti);
      o.stop(ti + 1.35);
    });
  }

  // Farfalhar de notas de dinheiro.
  function notas(ctx, destino, t) {
    const n = ctx.createBufferSource();
    n.buffer = ruido(ctx, 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2500, t);
    bp.frequency.linearRampToValueAtTime(5200, t + 0.8);
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.15);
    g.gain.linearRampToValueAtTime(0.06, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    n.connect(bp).connect(g).connect(destino);
    n.start(t);
  }

  function tocar(ctx, inicio, destino) {
    const t0 = inicio ?? ctx.currentTime + 0.05;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp).connect(destino || ctx.destination);

    caixaRegistradora(ctx, master, t0);
    notas(ctx, master, t0 + 0.25);

    // chuva de moedinhas: começa em rajada e vai rareando; cada moeda quica
    const total = 34;
    for (let i = 0; i < total; i++) {
      const p = i / total;
      const t = t0 + 0.35 + Math.pow(p, 1.6) * 2.1 + Math.random() * 0.05;
      const freq = 2300 + Math.random() * 2400;
      const vol = 0.16 + Math.random() * 0.12;
      const pan = Math.random() * 1.6 - 0.8;
      let atraso = 0.09 + Math.random() * 0.06;
      let tq = t;
      let v = vol;
      for (let q = 0; q < 3; q++) {   // quiques cada vez mais baixos e rápidos
        moeda(ctx, master, tq, freq * (1 + q * 0.01), v, 0.32 - q * 0.08, pan);
        tq += atraso;
        atraso *= 0.62;
        v *= 0.45;
      }
    }
    return t0 + 3.4; // duração aproximada
  }

  return { tocar, duracao: 3.4 };
})();
