/* Samba da Tânia — efeitos: som, vibração, movimento das cartas, cenas e perfil (XP).
   Nada de regra aqui: tudo é derivado da diferença entre a tela anterior e a nova. */
(function () {
  'use strict';
  const FX = {};
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const q = (s) => document.querySelector(s);
  const R = (el) => (el ? el.getBoundingClientRect() : null);
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- som (sintetizado no aparelho, sem arquivo) ---------- */
  let ctx = null;
  FX.muted = ls.get('fxmute', false);
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  document.addEventListener('pointerdown', () => ac(), { passive: true });
  function tone(f, type, dur, gain, delay, slide) {
    const c = ac(); if (!c) return; const t0 = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain || 0.2, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function noise(dur, gain, delay, hp) {
    const c = ac(); if (!c) return; const t0 = c.currentTime + (delay || 0);
    const n = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf; const g = c.createGain(); g.gain.value = gain || 0.15;
    const f = c.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = hp || 1200;
    src.connect(f).connect(g).connect(c.destination); src.start(t0);
  }
  const SOUNDS = {
    flip: () => { noise(0.06, 0.12, 0, 2500); tone(1400, 'triangle', 0.05, 0.05, 0.01); },
    place: () => { noise(0.08, 0.2); tone(160, 'sine', 0.1, 0.12); },
    deal: () => { noise(0.04, 0.1, 0, 3000); },
    pile: () => { for (let i = 0; i < 4; i++) noise(0.05, 0.12, i * 0.06, 2500); tone(220, 'sine', 0.15, 0.1, 0.25); },
    turn: () => { tone(880, 'sine', 0.12, 0.18); tone(1320, 'sine', 0.22, 0.18, 0.12); },
    tick: () => { tone(1000, 'sine', 0.03, 0.06); },
    red3: () => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 'triangle', 0.25, 0.14, i * 0.07)); },
    canastra: () => { [523, 659, 784].forEach((f) => tone(f, 'triangle', 0.6, 0.12)); tone(1047, 'triangle', 0.8, 0.14, 0.15); },
    bater: () => { noise(0.3, 0.3); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 'square', 0.25, 0.07, 0.1 + i * 0.09)); },
    drum: () => { noise(0.25, 0.3); tone(90, 'sine', 0.3, 0.25, 0, 40); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 'triangle', 0.5, 0.14, i * 0.12)); tone(1319, 'triangle', 1.0, 0.16, 0.5); },
    lose: () => { [659, 587, 523, 440].forEach((f, i) => tone(f, 'sine', 0.4, 0.12, i * 0.18)); },
    lock: () => { tone(200, 'square', 0.06, 0.1); tone(140, 'square', 0.1, 0.1, 0.07); noise(0.05, 0.1, 0, 4000); },
    levelup: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 'triangle', 0.35, 0.14, i * 0.1)); },
  };
  FX.sound = (name, delay) => { if (FX.muted || !SOUNDS[name]) return; if (delay) setTimeout(SOUNDS[name], delay); else SOUNDS[name](); };
  FX.toggleMute = () => { FX.muted = !FX.muted; ls.set('fxmute', FX.muted); if (!FX.muted) FX.sound('flip'); return FX.muted; };
  FX.buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  /* ---------- voo de carta (clone fixo, independente da tela) ---------- */
  FX.center = () => {
    const t = R(q('.felt')) || { left: innerWidth / 2 - 23, top: innerHeight / 2 - 34, width: 46, height: 68 };
    return { left: t.left + t.width / 2 - 23, top: t.top + t.height / 2 - 34, width: 46, height: 68 };
  };
  FX.fly = (from, to, o) => {
    o = o || {};
    if (!from || !to || reduced()) { if (o.onEnd) setTimeout(o.onEnd, 0); return; }
    const w = o.w || to.width || 46, h = o.h || to.height || 68;
    const el = document.createElement('div'); el.className = 'flyc' + (o.cls ? ' ' + o.cls : '');
    const back = '<div class="card back" style="width:100%;height:100%"></div>';
    const face = o.html ? o.html.replace('class="card', 'style="width:100%;height:100%" class="card') : back;
    el.innerHTML = o.flip ? back : face;
    el.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:70;pointer-events:none;will-change:transform`;
    document.body.appendChild(el);
    const fx = from.left + from.width / 2 - w / 2, fy = from.top + from.height / 2 - h / 2;
    const tx = to.left + to.width / 2 - w / 2, ty = to.top + to.height / 2 - h / 2;
    const dur = o.duration || 380, delay = o.delay || 0, lift = o.lift == null ? -26 : o.lift;
    const a = el.animate([
      { transform: `translate(${fx}px,${fy}px) scale(${o.fromScale || 1}) rotateY(${o.flip ? 180 : 0}deg)`, opacity: 1 },
      { transform: `translate(${(fx + tx) / 2}px,${(fy + ty) / 2 + lift}px) scale(${o.midScale || 1.12}) rotateY(${o.flip ? 90 : 0}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${tx}px,${ty}px) scale(${o.toScale || 1}) rotateY(0deg)`, opacity: o.fade ? 0 : 1 },
    ], { duration: dur, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
    if (o.flip) setTimeout(() => { el.innerHTML = face; }, delay + dur / 2);
    a.onfinish = () => { el.remove(); if (o.onEnd) o.onEnd(); };
    setTimeout(() => { if (el.parentNode) { el.remove(); if (o.onEnd) o.onEnd(); } }, delay + dur + 250);
  };
  // Etiqueta grande que cresce no centro e some ("+100", "CANASTRA +500").
  FX.label = (text, cls, dur) => {
    if (reduced()) return;
    const el = document.createElement('div'); el.className = 'fxlabel ' + (cls || ''); el.textContent = text;
    document.body.appendChild(el);
    el.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-90%) scale(1)', opacity: 0 }], { duration: dur || 1400, easing: 'ease-out', fill: 'forwards' }).onfinish = () => el.remove();
    setTimeout(() => el.remove(), (dur || 1400) + 100);
  };

  /* ---------- o que a tela tinha antes de redesenhar ---------- */
  FX.snapshot = () => {
    const s = { hand: new Map(), seats: [], melds: new Map() };
    document.querySelectorAll('.hand .card[data-id]').forEach((e) => s.hand.set(+e.dataset.id, R(e)));
    document.querySelectorAll('.seat[data-seat]').forEach((e) => (s.seats[+e.dataset.seat] = R(e)));
    document.querySelectorAll('.meld[data-m]').forEach((e) => s.melds.set(+e.dataset.m, R(e)));
    s.stock = R(q('#stock .card')); s.pile = R(q('#pile .card')); s.zoneMine = R(q('.sz.mine')); s.zoneOpp = R(q('.sz.opp'));
    s.redMine = R(q('.sz.mine .rd3')); s.redOpp = R(q('.sz.opp .rd3')); s.table = R(q('.felt')); s.handArea = R(q('.hand')); s.mortos = R(q('.mortos'));
    return s;
  };

  /* ---------- cenas ---------- */
  let tbTimer = null;
  FX.turnBanner = (v, delay) => {
    if (v.phase !== 'playing') return;
    const show = () => {
      const old = q('#tb'); if (old) old.remove();
      const me = v.turn === v.seat; const p = v.players[v.turn];
      const el = document.createElement('div'); el.id = 'tb'; el.className = me ? 'me' : '';
      const av = FX.avHtml && FX.avatars ? FX.avHtml(FX.avatars()[v.turn], 30) : '';
      el.innerHTML = av + '<span></span>'; el.lastChild.textContent = me ? 'Sua vez!' : 'Vez de ' + p.name;
      const t = R(q('.felt')); el.style.top = (t ? t.top + t.height * 0.5 : innerHeight * 0.4) + 'px';
      document.body.appendChild(el);
      el.animate([{ transform: 'translate(-50%,-50%) translateY(-24px) scale(.9)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.18 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'translate(-50%,-50%) translateY(-14px)', opacity: 0 }], { duration: me ? 1700 : 1300, easing: 'ease-out', fill: 'forwards' }).onfinish = () => el.remove();
      if (me) { FX.sound('turn'); FX.buzz(200); } else FX.sound('tick');
    };
    clearTimeout(tbTimer); tbTimer = setTimeout(show, delay || 0);
  };
  FX.deal = (v, now) => {
    const from = now.stock || FX.center(); const n = v.n; let k = 0;
    for (let r = 0; r < 5; r++) for (let i = 0; i < n; i++) {
      const seat = (v.seat + 1 + i) % n; const to = now.seats[seat] || FX.center();
      FX.fly(from, to, { duration: 300, delay: k * 55, toScale: 0.5, fade: true, w: 34, h: 50, lift: -10 });
      if (k % 2 === 0) FX.sound('deal', k * 55);
      k++;
    }
    if (now.mortos) for (let i = 0; i < 2; i++) FX.fly(from, now.mortos, { duration: 380, delay: k * 55 + i * 120, toScale: 0.6, fade: true, w: 34, h: 50 });
    return k * 55 + 500;
  };
  FX.red3Scene = (c, from, to, delay, cardHtml) => {
    setTimeout(() => {
      const ctr = FX.center(); const big = { left: ctr.left - 23, top: ctr.top - 34, width: 92, height: 136 };
      FX.fly(from, big, { html: cardHtml(c), duration: 450, toScale: 1, w: 92, h: 136, cls: 'red3', lift: -10 });
      setTimeout(() => { FX.label('3 vermelho  +100', 'red'); FX.sound('red3'); FX.buzz([60, 40, 60]); }, 420);
      setTimeout(() => FX.fly(big, to || FX.center(), { html: cardHtml(c), duration: 520, toScale: 0.35, fade: true, w: 92, h: 136, cls: 'red3' }), 1150);
    }, delay || 0);
  };
  FX.canastraScene = (m, el, mine, delay) => {
    setTimeout(() => {
      if (el) { el.classList.add('cflash'); setTimeout(() => el.classList.remove('cflash'), 1400); }
      const bonus = m.black ? 1000 : m.clean ? 500 : 300;
      FX.label('CANASTRA ' + (m.black ? 'PRETA' : m.clean ? 'LIMPA' : 'SUJA') + '  +' + bonus, 'gold', 1600);
      FX.sound('canastra'); FX.buzz([80, 40, 80]);
      if (mine && FX.confetti) FX.confetti(1800);
    }, delay || 0);
  };
  FX.endScene = (v) => {
    const rr = v.roundResult; const out = rr && rr.outSeat != null;
    const myOut = out && v.players[rr.outSeat].team === v.myTeam;
    const gameEnd = v.phase === 'gameEnd'; const iWon = gameEnd && v.winner === v.myTeam;
    const el = document.createElement('div'); el.className = 'bigs ' + (myOut || iWon ? 'win' : '');
    const b = document.createElement('b'); b.textContent = gameEnd ? (v.winner === -1 ? 'Empate!' : iWon ? 'Vitória!' : 'Fim de jogo') : (out ? 'Bateu!' : 'O monte acabou');
    const s = document.createElement('span'); s.textContent = out ? v.players[rr.outSeat].name : (rr && rr.stockOut ? 'conta-se o que está na mesa' : '');
    el.appendChild(b); el.appendChild(s); document.body.appendChild(el);
    b.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 700, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => el.remove(); }, 1600);
    FX.sound(gameEnd ? (iWon ? 'win' : v.winner === -1 ? 'drum' : 'lose') : (myOut ? 'bater' : 'drum'));
    if (myOut || iWon) { FX.buzz([120, 60, 120, 60, 200]); if (FX.confetti) FX.confetti(iWon ? 5000 : 2500); }
  };

  /* ---------- perfil e XP (fica no aparelho) ---------- */
  FX.profile = () => Object.assign({ xp: 0, games: 0, wins: 0, rounds: 0, canastras: 0, baters: 0, reds: 0 }, ls.get('profile', {}));
  FX.level = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
  FX.xpFor = (L) => 40 * (L - 1) * (L - 1);
  FX.title = (L) => (L >= 35 ? 'Lenda' : L >= 20 ? 'Grão-Mestre' : L >= 10 ? 'Mestre' : L >= 5 ? 'Jogador' : 'Aprendiz');
  FX.lastGain = null; FX.awarded = null;
  FX.award = (v) => {
    const key = (v.code || 'solo') + ':' + v.round + ':' + v.phase; if (FX.awarded === key) return; FX.awarded = key;
    const p = FX.profile(); const rr = v.roundResult; const t = v.myTeam; const lines = [];
    let gain = 10; lines.push(['Rodada jogada', 10]); p.rounds++;
    const can = (v.melds[t] || []).filter((m) => m.canastra);
    if (can.length) { const g = can.reduce((a, m) => a + (m.black ? 40 : m.clean ? 25 : 15), 0); gain += g; lines.push([can.length + (can.length > 1 ? ' canastras' : ' canastra'), g]); p.canastras += can.length; }
    if (rr && rr.outSeat != null && v.players[rr.outSeat].team === t) { gain += 100; lines.push(['Seu time bateu', 100]); p.baters++; }
    const reds = ((v.reds && v.reds[t]) || []).length; if (reds) { gain += reds * 5; lines.push([reds + ' três vermelho' + (reds > 1 ? 's' : ''), reds * 5]); p.reds += reds; }
    if (v.phase === 'gameEnd') { p.games++; if (v.winner === t) { gain += 50; lines.push(['Vitória', 50]); p.wins++; } }
    const before = FX.level(p.xp); p.xp += gain; const after = FX.level(p.xp);
    ls.set('profile', p); FX.lastGain = { gain, lines, levelUp: after > before, level: after, xp: p.xp };
    if (after > before) setTimeout(() => FX.sound('levelup'), 1800);
  };
  FX.profileHtml = (compact) => {
    const p = FX.profile(); const L = FX.level(p.xp); const a = FX.xpFor(L), b = FX.xpFor(L + 1); const pct = Math.round(100 * (p.xp - a) / (b - a));
    const bar = `<div class="xpbar"><i style="width:${pct}%"></i></div>`;
    if (compact) return `<div class="xp"><b>Nível ${L} · ${FX.title(L)}</b> <small>${p.xp} XP · faltam ${b - p.xp} para o nível ${L + 1}</small>${bar}</div>`;
    return `<div class="card-box prof"><div class="pt1"><b>Nível ${L}</b><span class="ttl">${FX.title(L)}</span><small>${p.xp} XP · faltam ${b - p.xp} para o nível ${L + 1}</small></div>${bar}<div class="pst"><span><b>${p.games}</b>jogos</span><span><b>${p.wins}</b>vitórias</span><span><b>${p.canastras}</b>canastras</span><span><b>${p.baters}</b>batidas</span><span><b>${p.reds}</b>3 verm.</span></div></div>`;
  };
  FX.gainHtml = () => {
    const g = FX.lastGain; if (!g) return '';
    return `<div class="xp gain"><b>+${g.gain} XP</b> <small>${g.lines.map((l) => l[0] + ' +' + l[1]).join(' · ')}</small>${g.levelUp ? `<div class="lvup">Subiu para o nível ${g.level}: ${FX.title(g.level)}!</div>` : ''}${FX.profileHtml(true)}</div>`;
  };
  // Números que sobem até o valor final (placar do fim da rodada).
  FX.countUp = (root) => {
    if (reduced()) return;
    root.querySelectorAll('td b, .xp.gain > b').forEach((el, i) => {
      const txt = el.textContent; const m = txt.match(/-?\d+/); if (!m) return;
      const target = +m[0]; const pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length);
      const t0 = performance.now(), dur = 900 + i * 60;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); el.textContent = pre + Math.round(target * e) + post; if (k < 1) requestAnimationFrame(step); };
      el.textContent = pre + '0' + post; requestAnimationFrame(step);
    });
  };

  /* ---------- a diferença entre a tela anterior e a nova vira movimento ---------- */
  FX.prevView = null;
  FX.after = (v, before) => {
    const pv = FX.prevView; const now = FX.snapshot(); before = before || now;
    const playing = v.phase === 'playing'; const me = v.seat;
    const seatRect = (i, s) => (s.seats[i] || s.table || FX.center());
    const cardHtml = (c) => (FX.cardHtml ? FX.cardHtml(c, '') : '<div class="card"></div>');
    try {
      if (playing && (!pv || pv.phase !== 'playing' || pv.round !== v.round) && (v.logN || 0) <= 1) {
        const d = FX.deal(v, now); FX.turnBanner(v, d); FX.prevView = v; return;
      }
      if (!pv || pv.code !== v.code) { if (playing) FX.turnBanner(v, 300); FX.prevView = v; return; }
      if (!playing) { if (pv.phase === 'playing') { FX.endScene(v); FX.award(v); } FX.prevView = v; return; }
      if (pv.phase !== 'playing' || pv.round !== v.round) { FX.turnBanner(v, 200); FX.prevView = v; return; }
      const actor = v.lastSeat != null ? v.lastSeat : pv.turn;
      // compra do monte
      const drawn = (pv.stockCount || 0) - (v.stockCount || 0);
      if (drawn > 0) {
        if (actor === me) {
          const fresh = v.hand.filter((c) => !pv.hand.some((p) => p.id === c.id));
          fresh.forEach((c, k) => {
            const el = q(`.hand .card[data-id="${c.id}"]`); const to = R(el) || now.handArea || FX.center();
            if (el) el.classList.add('fxhide');
            FX.fly(before.stock || now.stock || FX.center(), to, { html: cardHtml(c), flip: true, duration: 420, delay: k * 90, onEnd: () => { if (el) el.classList.remove('fxhide'); } });
          });
          FX.sound('flip');
        } else {
          for (let k = 0; k < Math.min(drawn, 3); k++) FX.fly(before.stock || now.stock || FX.center(), seatRect(actor, now), { duration: 380, delay: k * 110, toScale: 0.5, fade: true, w: 34, h: 50 });
          FX.sound('flip');
        }
      }
      // 3 vermelho novo na mesa
      for (const t of [0, 1]) {
        const a = ((pv.reds && pv.reds[t]) || []).length, b = ((v.reds && v.reds[t]) || []).length;
        if (b > a) {
          const mineT = t === v.myTeam; const target = (mineT ? now.redMine : now.redOpp) || (mineT ? now.zoneMine : now.zoneOpp) || FX.center();
          v.reds[t].slice(a).forEach((c, k) => FX.red3Scene(c, actor === me ? (before.stock || now.stock || FX.center()) : seatRect(actor, now), target, 500 + k * 1500, cardHtml));
        }
      }
      // descarte ou lixo levado
      if (v.discardCount === (pv.discardCount || 0) + 1 && v.discardTop) {
        const top = v.discardTop;
        const from = actor === me ? (before.hand.get(top.id) || now.handArea || FX.center()) : seatRect(actor, now);
        const pileEl = q('#pile .card'); if (pileEl) pileEl.classList.add('fxhide');
        FX.fly(from, now.pile || FX.center(), { html: cardHtml(top), duration: 380, onEnd: () => { if (pileEl) pileEl.classList.remove('fxhide'); } });
        FX.sound('place');
      } else if ((pv.discardCount || 0) > 0 && v.discardCount === 0) {
        const k = Math.min(pv.discardCount, 8); const to = actor === me ? (now.handArea || FX.center()) : seatRect(actor, now);
        for (let i = 0; i < k; i++) FX.fly(before.pile || now.pile || FX.center(), to, { html: i === 0 && pv.discardTop ? cardHtml(pv.discardTop) : undefined, duration: 360, delay: i * 70, toScale: actor === me ? 0.9 : 0.5, fade: true, w: 34, h: 50 });
        FX.sound('pile');
      }
      // jogos baixados ou aumentados
      for (const t of [0, 1]) {
        const prevM = new Map(((pv.melds && pv.melds[t]) || []).map((m) => [m.id, m]));
        ((v.melds && v.melds[t]) || []).forEach((m) => {
          const pm = prevM.get(m.id); const added = pm ? m.cards.filter((c) => !pm.cards.some((x) => x.id === c.id)) : m.cards;
          if (!added.length) return;
          const el = q(`.meld[data-m="${m.id}"]`); const to = R(el) || (t === v.myTeam ? now.zoneMine : now.zoneOpp) || FX.center();
          added.slice(0, 7).forEach((c, k) => {
            const from = actor === me ? (before.hand.get(c.id) || before.pile || now.handArea || FX.center()) : seatRect(actor, now);
            FX.fly(from, to, { html: cardHtml(c), duration: 400, delay: k * 70, toScale: 0.6, fade: true, w: 34, h: 50 });
          });
          FX.sound('place', 120);
          if (m.canastra && !(pm && pm.canastra)) FX.canastraScene(m, el, t === v.myTeam, 350 + Math.min(added.length, 7) * 70);
        });
      }
      if (v.pileLocked && !pv.pileLocked) FX.sound('lock');
      if (v.turn !== pv.turn) FX.turnBanner(v, 250);
    } catch (e) { console.warn('fx', e); }
    FX.prevView = v;
  };
  window.FX = FX;
})();
