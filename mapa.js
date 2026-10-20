/* Samba da Tânia — o tabuleiro: o mapa ilustrado da Casa da Tânia, com as 48 fases num caminho que serpenteia por 6 cômodos.
   Só desenha e leva o toque até quem chamou: as regras de abrir fase, estrelas e prêmios continuam em fases.js e eco.js.
   Uso: Mapa.abrir({ FA, EC, THEMES, avatar: (px) => html, aoEscolher: (id) => {}, aoFechar: () => {}, aviso: (txt) => {} }). */
(function (root) {
  'use strict';

  const ROW = 96, TOPO = 64, XS = [24, 60, 80, 54, 24, 42, 74, 50]; // altura entre casas, folga em cima, posição (%) de cada casa; a 8ª é o chefe, no meio
  const CHEFES = { 'Dona Nit': '👩‍🍳', 'Zé': '🧔', 'Seu Tião': '👴', 'Marlene': '👩‍🦱', 'Lúcia': '💃' };
  // cenário de cada cômodo: piso, cores, enfeites nas bordas ([emoji, x%, y(px), tamanho, giro]) e a marca d'água grande no meio
  const CENAS = [
    { piso: 'xadrez', c1: '#f6ead6', c2: '#e8d2ad', tinta: '#5a3a1a', marca: '🍳', deco: [['🥘', 92, 60, 34, 8], ['☕', 6, 190, 30, -8], ['🍞', 93, 300, 30, 10], ['🧂', 6, 410, 28, -12], ['🥄', 92, 520, 28, 25], ['🍅', 7, 610, 30, 0], ['🧅', 93, 700, 28, -10]] },
    { piso: 'madeira', c1: '#b97a45', c2: '#9c6535', tinta: '#fff4e0', marca: '🛋️', tapete: '#8f2f5a', deco: [['📺', 92, 70, 34, 0], ['🖼️', 6, 170, 30, -6], ['📻', 93, 290, 30, 8], ['🪴', 6, 400, 32, 0], ['🕰️', 92, 520, 30, 0], ['🕯️', 6, 620, 28, 0], ['📚', 93, 710, 28, 6]] },
    { piso: 'madeira', c1: '#c9a06a', c2: '#b48850', tinta: '#4a2f12', marca: '🪑', deco: [['🪴', 92, 60, 36, 0], ['🌻', 6, 180, 32, 0], ['🌿', 93, 300, 30, 10], ['☕', 6, 410, 28, 0], ['🧺', 92, 520, 30, 0], ['🦋', 7, 620, 28, 10], ['🌤️', 92, 710, 30, 0]] },
    { piso: 'grama', c1: '#5fa85a', c2: '#4d9449', tinta: '#fff', marca: '🌳', deco: [['🍖', 92, 60, 32, 0], ['🐕', 6, 190, 34, 0], ['🧺', 93, 300, 30, 0], ['🌼', 6, 410, 28, 0], ['🛝', 92, 520, 32, 0], ['🌷', 7, 620, 28, 0], ['🐓', 93, 710, 30, 0]] },
    { piso: 'agua', c1: '#35a8c9', c2: '#1d86a8', tinta: '#fff', marca: '🏊', deco: [['🎾', 92, 60, 30, 0], ['🏆', 6, 190, 32, 0], ['🩴', 93, 300, 28, 10], ['🍹', 6, 410, 30, 0], ['⛱️', 92, 520, 34, 0], ['🥇', 7, 620, 30, 0], ['🏖️', 93, 710, 30, 0]] },
    { piso: 'confete', c1: '#2b1250', c2: '#4a1f7a', tinta: '#fff', marca: '🎉', deco: [['🎈', 92, 60, 36, 8], ['🎂', 6, 190, 36, -6], ['🪩', 93, 300, 34, 0], ['🥂', 6, 410, 30, 0], ['🎁', 92, 520, 32, 0], ['🎶', 7, 620, 30, 0], ['🎊', 93, 710, 30, 0]] },
  ];
  const PISO = {
    xadrez: (c) => `conic-gradient(${c.c1} 25%, ${c.c2} 0 50%, ${c.c1} 0 75%, ${c.c2} 0) 0 0/72px 72px`,
    madeira: (c) => `repeating-linear-gradient(0deg, ${c.c1} 0 52px, ${c.c2} 52px 55px)`,
    grama: (c) => `radial-gradient(circle at 25% 35%, ${c.c2} 3px, transparent 4px) 0 0/34px 34px, radial-gradient(circle at 75% 75%, #ffffff30 2px, transparent 3px) 0 0/46px 46px, ${c.c1}`,
    agua: (c) => `repeating-radial-gradient(circle at 20% 0, transparent 0 16px, #ffffff2e 17px 19px), linear-gradient(${c.c1}, ${c.c2})`,
    confete: (c) => `radial-gradient(circle at 15% 25%, #ff5d8f 3px, transparent 4px) 0 0/90px 90px, radial-gradient(circle at 60% 70%, #ffd166 3px, transparent 4px) 0 0/110px 110px, radial-gradient(circle at 85% 35%, #4cc9f0 3px, transparent 4px) 0 0/130px 130px, linear-gradient(${c.c1}, ${c.c2})`,
  };

  const CSS = `
#mapa{position:fixed;inset:0;z-index:50;background:#1b0a14;color:#fff;display:flex;flex-direction:column;font-family:inherit}
#mapa .mp-top{flex:none;display:flex;align-items:center;gap:10px;padding:max(8px,env(safe-area-inset-top)) 12px 8px;background:#2a0c1cf2;border-bottom:2px solid #f2c14e66;z-index:3}
#mapa .mp-top h2{margin:0;font:800 20px Georgia,serif;color:#f2c14e;flex:1}
#mapa .mp-top b{font-size:17px}
#mapa .mp-top button{padding:8px 12px;font-size:16px}
#mapa .mp-rol{position:relative;flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;scroll-behavior:smooth;padding-bottom:calc(30px + env(safe-area-inset-bottom))}
#mapa .mp-faixa{position:relative;margin:0;padding:14px 16px 12px;background:linear-gradient(#000a,#0000);z-index:2;text-align:center}
#mapa .mp-faixa h3{margin:0;font:800 26px Georgia,serif;text-shadow:0 2px 8px #000}
#mapa .mp-faixa h3 i{font-style:normal;display:inline-flex;width:34px;height:34px;border-radius:50%;background:#f2c14e;color:#3b0f26;align-items:center;justify-content:center;font:800 19px Georgia,serif;margin-right:8px;vertical-align:3px}
#mapa .mp-faixa p{margin:4px 0 0;font-size:14px;opacity:.92;text-shadow:0 1px 4px #000}
#mapa .mp-cena{position:relative;overflow:hidden;margin:0 0 0;border-top:6px solid #0006;border-bottom:6px solid #0006}
#mapa .mp-cena.tranca{filter:grayscale(.75) brightness(.62)}
#mapa .mp-marca{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:min(78vw,340px);opacity:.14;pointer-events:none;line-height:1}
#mapa .mp-tapete{position:absolute;left:12%;right:12%;top:90px;bottom:90px;border-radius:30px;border:6px double #f2c14e99;opacity:.55;pointer-events:none}
#mapa .mp-deco{position:absolute;pointer-events:none;transform:translate(-50%,-50%);filter:drop-shadow(0 3px 3px #0006);line-height:1}
#mapa svg.mp-trilha{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
#mapa .mp-no{position:absolute;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;padding:0;border:4px solid #fff;display:flex;align-items:center;justify-content:center;font:800 24px Georgia,serif;background:#fff;color:#3b0f26;box-shadow:0 5px 0 #0005,0 8px 14px #0006;cursor:pointer;z-index:2;touch-action:manipulation}
#mapa .mp-no.chefe{width:78px;height:78px;border-color:#f2c14e;font-size:38px;background:linear-gradient(#fff6d6,#f2c14e)}
#mapa .mp-no.feita{background:linear-gradient(#9cf0b0,#34b36a);color:#08381c;border-color:#fff}
#mapa .mp-no.feita.chefe{background:linear-gradient(#ffe9a6,#f2a83a)}
#mapa .mp-no.agora{background:linear-gradient(#ffe38a,#f2c14e);animation:mpPulso 1.4s ease-in-out infinite}
#mapa .mp-no.fechada{background:#7d7480;color:#e7e0ea;border-color:#c9c0cf;font-size:22px;cursor:default;box-shadow:0 3px 0 #0005}
@keyframes mpPulso{0%,100%{box-shadow:0 5px 0 #0005,0 0 0 0 #f2c14ecc}50%{box-shadow:0 5px 0 #0005,0 0 0 14px #f2c14e00}}
#mapa .mp-rot{position:absolute;transform:translate(-50%,0);text-align:center;width:112px;pointer-events:none;z-index:2;line-height:1.15}
#mapa .mp-rot .es{display:block;font-size:17px;letter-spacing:2px;color:#ffd24d;text-shadow:0 1px 3px #000,0 0 6px #000}
#mapa .mp-rot .es .of{color:#ffffffb0;text-shadow:0 1px 2px #000,0 0 3px #000}
#mapa .mp-rot .nm{display:block;font-size:12px;font-weight:700;color:var(--tinta,#fff);text-shadow:0 1px 3px #0009,0 0 5px #0007;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#mapa .mp-eu{position:absolute;width:42px;height:42px;transform:translate(-50%,-100%);z-index:4;pointer-events:none;transition:left .9s cubic-bezier(.4,.1,.2,1),top .9s cubic-bezier(.4,.1,.2,1)}
#mapa .mp-eu>div{animation:mpPula 1.1s ease-in-out infinite;filter:drop-shadow(0 4px 4px #0008)}
#mapa .mp-eu .av{border:3px solid #f2c14e!important;box-shadow:0 0 0 2px #fff}
#mapa .mp-eu::after{content:'';position:absolute;left:50%;bottom:-8px;width:0;height:0;border:8px solid transparent;border-top-color:#f2c14e;transform:translateX(-50%)}
@keyframes mpPula{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
#mapa .mp-porta{position:relative;z-index:2;text-align:center;padding:16px 20px;background:linear-gradient(#0000,#000a 30%,#000a 70%,#0000)}
#mapa .mp-porta .pt{font-size:46px;line-height:1;display:block;filter:drop-shadow(0 3px 4px #000)}
#mapa .mp-porta b{display:block;margin-top:2px;font-size:15px}
#mapa .mp-porta.aberta b{color:#9cf0b0}
#mapa .mp-fim{text-align:center;padding:20px;font:800 22px Georgia,serif;color:#f2c14e}
@media(prefers-reduced-motion:reduce){#mapa .mp-no.agora,#mapa .mp-eu>div{animation:none}#mapa .mp-rol{scroll-behavior:auto}#mapa .mp-eu{transition:none}}
`;

  // curva suave (Catmull-Rom → Bézier) passando por todos os pontos
  function suave(p) {
    if (p.length < 2) return '';
    let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
      const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], c2 = [c[0] - (e[0] - b[0]) / 6, c[1] - (e[1] - b[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${c[0].toFixed(1)} ${c[1].toFixed(1)}`;
    }
    return d;
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[<>&"]/g, '');
  let estilo = null;
  function injeta() { if (estilo) return; estilo = document.createElement('style'); estilo.textContent = CSS; document.head.appendChild(estilo); }

  // Posição de cada casa de um cômodo (em pixels dentro da cena). Cômodos pares espelham o caminho para a trilha ir e vir.
  function pontos(sala, W) {
    return XS.map((x, i) => [((sala % 2 ? x : 100 - x) / 100) * W, TOPO + i * ROW + 30]);
  }

  const M = { el: null, ctx: null };
  M.fechar = () => { if (M.el) { M.el.remove(); M.el = null; } };
  M.abrir = (ctx) => {
    injeta(); M.fechar(); M.ctx = ctx;
    const { FA, EC } = ctx;
    const el = document.createElement('div'); el.id = 'mapa'; M.el = el;
    const estrelasTotal = FA.FASES.reduce((a, f) => a + FA.starsOf(EC, f.id), 0);
    const prox = FA.proxima(EC);
    el.innerHTML = `<div class="mp-top"><button class="sec" id="mpx" aria-label="Voltar">←</button><h2>A Casa da Tânia</h2><b>⭐ ${estrelasTotal}/144</b><button class="sec" id="mpdif" aria-label="Dificuldade dos robôs">🎚️</button><button id="mpaqui" aria-label="Onde estou">📍</button></div><div class="mp-rol"></div>`;
    document.body.appendChild(el);
    const rol = el.querySelector('.mp-rol'); const W = Math.min(rol.clientWidth || innerWidth, 560);
    const H = TOPO + 8 * ROW + 20;
    let posProx = null; const pos = {}; // posição absoluta (dentro de .mp-rol) de cada fase, para o peão

    FA.SALAS.forEach((s, si) => {
      const cena = CENAS[si]; const aberta = FA.salaAberta(EC, s.n); const sala = si + 1;
      const fases = FA.FASES.filter((f) => f.sala === s.n); const P = pontos(sala, W);
      const feitas = fases.map((f) => FA.starsOf(EC, f.id) >= 1);
      const wrap = document.createElement('section'); wrap.dataset.sala = s.n;
      wrap.innerHTML = `<div class="mp-faixa"><h3><i>${s.n}</i>${esc(s.nome)}${aberta ? '' : ' 🔒'}</h3><p>${aberta ? esc(FA.barra(EC, s.n)) : 'Abre quando você vencer o chefe do cômodo anterior'}</p></div>`;
      const cn = document.createElement('div'); cn.className = 'mp-cena' + (aberta ? '' : ' tranca'); cn.style.height = H + 'px'; cn.style.background = PISO[cena.piso](cena); cn.style.setProperty('--tinta', cena.tinta);
      if (cena.tapete) cn.insertAdjacentHTML('beforeend', `<div class="mp-tapete" style="background:${cena.tapete}"></div>`);
      cn.insertAdjacentHTML('beforeend', `<div class="mp-marca">${cena.marca}</div>`);
      cena.deco.forEach(([e, x, y, sz, rot]) => cn.insertAdjacentHTML('beforeend', `<div class="mp-deco" style="left:${x}%;top:${y}px;font-size:${sz}px;transform:translate(-50%,-50%) rotate(${rot}deg)">${e}</div>`));
      // trilha: pontilhado claro por tudo; ouro até a última casa vencida
      const ult = feitas.lastIndexOf(true); const ate = Math.min(7, ult + 1);
      const caminho = suave(P), caminhoOuro = ult >= 0 ? suave(P.slice(0, ate + 1)) : '';
      cn.insertAdjacentHTML('beforeend', `<svg class="mp-trilha" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${caminho}" fill="none" stroke="#0004" stroke-width="16" stroke-linecap="round" stroke-dasharray="1 20" transform="translate(0 4)"/><path d="${caminho}" fill="none" stroke="#ffffffcc" stroke-width="12" stroke-linecap="round" stroke-dasharray="1 20"/>${caminhoOuro ? `<path d="${caminhoOuro}" fill="none" stroke="#ffd24d" stroke-width="14" stroke-linecap="round" stroke-dasharray="1 18"/>` : ''}</svg>`);
      fases.forEach((f, i) => {
        const st = FA.starsOf(EC, f.id); const livre = FA.aberta(EC, f.id); const agora = prox.id === f.id;
        const cls = ['mp-no', f.chefe ? 'chefe' : '', st ? 'feita' : '', agora ? 'agora' : '', livre ? '' : 'fechada'].join(' ').replace(/ +/g, ' ').trim();
        const rosto = f.chefe ? (s.n === 6 ? '👑' : CHEFES[s.chefe] || '⭐') : (i + 1);
        const [x, y] = P[i]; pos[f.id] = [x, y + si * 0, si];
        const b = document.createElement('button'); b.className = cls; b.style.left = x + 'px'; b.style.top = y + 'px'; b.dataset.f = f.id;
        b.setAttribute('aria-label', `Fase ${f.id}, ${f.nome}, ${st} de 3 estrelas${livre ? '' : ', fechada'}`);
        b.innerHTML = livre || st ? rosto : '🔒';
        cn.appendChild(b);
        const r = document.createElement('div'); r.className = 'mp-rot'; r.style.left = x + 'px'; r.style.top = (y + (f.chefe ? 44 : 33)) + 'px';
        r.innerHTML = `<span class="es">${'★'.repeat(st)}<span class="of">${'★'.repeat(3 - st)}</span></span><span class="nm">${esc(f.nome)}</span>`;
        cn.appendChild(r);
      });
      wrap.appendChild(cn);
      // porta para o próximo cômodo
      if (s.n < 6) {
        const prox2 = FA.SALAS[s.n]; const abre = FA.salaAberta(EC, s.n + 1);
        wrap.insertAdjacentHTML('beforeend', `<div class="mp-porta ${abre ? 'aberta' : ''}"><span class="pt">${abre ? '🚪' : '🔐'}</span><b>${abre ? 'Porta aberta: ' + esc(prox2.nome) : esc(FA.barra(EC, s.n))}</b></div>`);
      } else wrap.insertAdjacentHTML('beforeend', `<div class="mp-fim">${FA.starsOf(EC, '6.8') >= 1 ? '👑 Dona da Casa!' : '🎉 A Festa da Tânia espera por você'}</div>`);
      rol.appendChild(wrap);
      if (!aberta) cn.querySelectorAll('.mp-no').forEach((b) => (b.disabled = false));
    });

    // posição absoluta do peão: soma a altura dos cômodos anteriores
    const absoluta = (id) => {
      const f = FA.byId(id); const c = el.querySelector(`.mp-no[data-f="${id}"]`); if (!c) return null;
      const r = c.getBoundingClientRect(), rr = rol.getBoundingClientRect();
      return { x: r.left - rr.left + r.width / 2, y: r.top - rr.top + rol.scrollTop + (f && f.chefe ? 2 : 6) };
    };
    const eu = document.createElement('div'); eu.className = 'mp-eu'; eu.innerHTML = `<div>${ctx.avatar(38)}</div>`; rol.appendChild(eu);
    const ponha = (id) => { const a = absoluta(id); if (a) { eu.style.left = a.x + 'px'; eu.style.top = a.y + 'px'; } return a; };
    const antes = ctx.ultimo && FA.byId(ctx.ultimo) ? ctx.ultimo : null;
    if (antes && antes !== prox.id) { ponha(antes); setTimeout(() => ponha(prox.id), 450); } else ponha(prox.id);
    const centra = (id, suaveRol) => { const a = absoluta(id); if (a) rol.scrollTo({ top: Math.max(0, a.y - rol.clientHeight * 0.45), behavior: suaveRol ? 'smooth' : 'auto' }); };
    rol.style.scrollBehavior = 'auto'; centra(prox.id, false); rol.style.scrollBehavior = '';

    el.querySelector('#mpx').onclick = () => { M.fechar(); if (ctx.aoFechar) ctx.aoFechar(); };
    el.querySelector('#mpdif').onclick = () => { if (ctx.dificuldade) ctx.dificuldade(); };
    el.querySelector('#mpaqui').onclick = () => centra(prox.id, true);
    el.querySelectorAll('.mp-no').forEach((b) => (b.onclick = () => {
      const id = b.dataset.f; const f = FA.byId(id);
      if (!FA.aberta(EC, id)) return ctx.aviso(!FA.salaAberta(EC, f.sala) ? 'Este cômodo abre quando você vencer o chefe do anterior.' : FA.barra(EC, f.sala));
      if (ctx.aoEscolher) ctx.aoEscolher(id);
    }));
    if (ctx.guardaUltimo) ctx.guardaUltimo(prox.id);
    return el;
  };

  root.Mapa = M;
})(typeof window !== 'undefined' ? window : globalThis);
