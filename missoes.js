/* Samba da Tânia — Missões: uma trilha de minijogos curtos. Cada missão é uma situação de cartas pronta
   (mão, lixo, jogos já na mesa, as cartas que vêm do monte) com um objetivo e um limite de vezes.
   Destravam uma a uma e ficam mais difíceis. Os jogos de cima só mudam de cartas: o motor é o mesmo. */
(function (root) {
  'use strict';
  const RANK = { A: 1, J: 11, Q: 12, K: 13 };
  // 'KP' = Rei de paus, '10O' = 10 de ouros, '2E' = coringa 2, '*' = coringa (joker). Naipes: P paus, O ouros, C copas, E espadas.
  const carta = (t) => { if (t === '*') return { r: 0, s: 'J' }; const m = /^(10|[A2-9JQK])([POCE])$/.exec(t); if (!m) throw new Error('carta inválida: ' + t); return { r: RANK[m[1]] || +m[1], s: m[2] }; };

  // meta: lista de objetivos que precisam valer ao mesmo tempo. pts = pontos nos jogos da mesa; can = canastras (limpa: só as limpas);
  // lixo = pegou o lixo; morto = pegou o morto; bater = bateu.
  const LISTA = [
    { nome: 'Primeira descida', bot: 'facil', turnos: 1, obj: 'Baixe 75 pontos em jogos',
      dica: 'Para descer pela primeira vez a mesa pede 75 pontos. Compre 2 cartas, depois marque os três Reis, as três Damas e os três Valetes (cada trinca vale 30) e toque em Baixar.',
      mao: ['KP', 'KO', 'KC', 'QP', 'QO', 'QC', 'JP', 'JO', 'JC', '5P', '6E'], monte: ['8P', '9P'], meta: [{ t: 'pts', n: 75 }], premio: 30 },
    { nome: 'Fechar a canastra', bot: 'facil', turnos: 1, obj: 'Faça uma canastra limpa',
      dica: 'Você já tem 5 Reis na mesa. Marque os 2 Reis da sua mão e toque no jogo de Reis: com 7 cartas iguais, sem coringa, é uma canastra limpa (500).',
      mesa: [['KP', 'KO', 'KC', 'KE', 'KP']], mao: ['KO', 'KC', '4P', '5O', '8E', '9P', '10P', 'JE', 'QP', '7C', '6E'], monte: ['AP', '8O'], meta: [{ t: 'can', limpa: true, n: 1 }], premio: 40 },
    { nome: 'Pegue o lixo', bot: 'facil', turnos: 1, obj: 'Pegue o lixo e baixe um jogo com ele',
      dica: 'A carta de cima do lixo é um 9 e você tem dois 9. Antes de comprar, marque os 2 Noves e toque no lixo: tudo o que está lá vem para a sua mão.',
      mesa: [['AP', 'AO', 'AC', 'AE']], lixo: ['4P', '8O', '6C', '9E'], mao: ['9P', '9O', '5P', '7E', '10C', 'JP', 'QE', 'KP', '8C', '4O', '6P'], monte: ['10O', '5C'], meta: [{ t: 'lixo' }], premio: 50 },
    { nome: 'O coringa ajuda', bot: 'facil', turnos: 1, obj: 'Faça uma canastra (pode ser suja)',
      dica: 'Na mesa há 5 Damas. Você tem 1 Dama e um coringa (o 2). Junte as duas cartas ao jogo de Damas: 7 cartas com um coringa é canastra suja (300).',
      mesa: [['QP', 'QO', 'QC', 'QE', 'QP']], mao: ['QO', '2P', '4E', '5O', '8E', '9P', '10P', 'JE', 'KP', '7C', '6E'], monte: ['AP', '8O'], meta: [{ t: 'can', n: 1 }], premio: 60 },
    { nome: 'Descer com coringas', bot: 'normal', turnos: 1, obj: 'Baixe 120 pontos em jogos',
      dica: 'Os coringas completam jogos: 2 cartas iguais + 1 coringa já é um jogo. Monte as quatro trincas: Ases com o 2, Reis com o coringa, os 10s, e baixe todas juntas.',
      mao: ['AP', 'AO', '2P', 'KP', 'KO', '*', '10P', '10O', '10C', '4E', '7P'], monte: ['8P', '9P'], meta: [{ t: 'pts', n: 120 }], premio: 70 },
    { nome: 'Lixo e canastra', bot: 'normal', turnos: 1, obj: 'Pegue o lixo e faça uma canastra',
      dica: 'Você tem 5 Oitos na mesa e o 8 de cima do lixo. Marque os 2 Oitos da sua mão, toque no lixo e escolha o jogo de Oitos: o lixo inteiro vem e a canastra fecha.',
      mesa: [['8P', '8O', '8C', '8E', '8P']], lixo: ['JP', '5E', '9C', '8E'], mao: ['8P', '8O', '4P', '7E', '10C', 'QP', 'KE', '5C', '9O', '4O', '6P'], monte: ['AO', '7C'], meta: [{ t: 'lixo' }, { t: 'can', n: 1 }], premio: 80 },
    { nome: 'Duas de uma vez', bot: 'normal', turnos: 1, obj: 'Feche duas canastras na mesma vez',
      dica: 'Você tem 5 Seis e 5 Noves na mesa. Com os 4 cartas certas da sua mão, os dois jogos chegam a 7. Cuidado: o coringa serve, mas deixa a canastra suja.',
      mesa: [['6P', '6O', '6C', '6E', '6P'], ['9P', '9O', '9C', '9E', '9P']], mao: ['6C', '6E', '9C', '9E', '2P', '4O', '5O', '8E', '10P', 'JE', 'QP'], monte: ['AP', '7C'], meta: [{ t: 'can', n: 2 }], premio: 90 },
    { nome: 'Pegue o morto', bot: 'normal', turnos: 2, obj: 'Fique sem cartas na mão e pegue o morto',
      dica: 'Quem esvazia a mão pega o morto (11 cartas novas). Baixe tudo o que puder e descarte a última carta. As cartas do monte também precisam sair: junte o Rei à canastra e use os Noves.',
      mesa: [['KP', 'KO', 'KC', 'KE', 'KP', 'KO']], mao: ['9P', '9O', '9C', '4P'], monte: ['KE', '9E'], meta: [{ t: 'morto' }], premio: 100 },
    { nome: 'Bata!', bot: 'dificil', turnos: 1, obj: 'Bata: acabe a rodada sem cartas na mão',
      dica: 'Você já tem o morto, uma canastra limpa de Reis e uma suja de Cincos. Compre, acrescente o Rei e o Cinco que vierem, baixe os Noves e descarte a última carta.',
      mesa: [['KP', 'KO', 'KC', 'KE', 'KP', 'KO', 'KC'], ['5P', '5O', '5C', '5E', '5P', '2P', '5O']], morto: true, mao: ['9P', '9O', '9C', '4P'], monte: ['KE', '5C'], meta: [{ t: 'bater' }], premio: 120 },
    { nome: 'Dois turnos, 180 pontos', bot: 'dificil', turnos: 2, obj: 'Faça 180 pontos em jogos em 2 vezes',
      dica: 'Na 1ª vez baixe os Ases, os Reis e os Noves (150) e descarte um 4. Na 2ª, acrescente aos seus jogos as cartas que chegarem e termine com o último descarte.',
      mao: ['AP', 'AO', 'AC', 'AE', 'KP', 'KO', 'KC', 'KE', '9P', '9O', '4P'], monte: ['9C', '4O', 'AP', '9E'], meta: [{ t: 'pts', n: 180 }], premio: 150,
      // roteiro que resolve (só para o teste): 1ª vez baixa Ases, Reis e Noves; 2ª acrescenta o Ás e o 9
      solucao(S, g) {
        const A = (a) => { const r = S.act(g, g.turn, a); if (r.error) throw new Error(r.error); g = r.state; }; const id = (r, s) => g.hands[0].find((c) => c.r === r && (!s || c.s === s)).id;
        A({ a: 'draw' }); A({ a: 'draw' });
        A({ a: 'meld', groups: [g.hands[0].filter((c) => c.r === 1).map((c) => c.id), g.hands[0].filter((c) => c.r === 13).map((c) => c.id), g.hands[0].filter((c) => c.r === 9).map((c) => c.id)] });
        A({ a: 'discard', id: id(4) });
        for (let i = 0; i < 3 && g.turn !== 0; i++) { const r = S.botMove(g, g.turn, 'normal'); g = r.state; }
        A({ a: 'draw' }); A({ a: 'draw' });
        A({ a: 'addTo', ids: [id(1)], meldId: g.melds[0].find((x) => x.rank === 1).id }); A({ a: 'addTo', ids: [id(9)], meldId: g.melds[0].find((x) => x.rank === 9).id });
        return g;
      } },
  ];

  // Monta a rodada arrumada para a missão idx.
  function build(S, idx, myName) {
    const m = LISTA[idx];
    const g = S.newGame([{ name: myName || 'Você' }, { name: 'Tânia', bot: true, lvl: m.bot }], { mode: 'missao', rng: S.mulberry(7000 + idx) });
    let pool = g.hands.flat().concat(g.mortos.flat(), g.stock, g.reds.flat());
    const take = (t) => { const c = carta(t); const i = pool.findIndex((x) => x.r === c.r && x.s === c.s); if (i < 0) throw new Error('faltou carta ' + t); return pool.splice(i, 1)[0]; };
    const take2 = (list) => list.map(take);
    const mine = take2(m.mao); const meldCards = (m.mesa || []).map(take2); const lixo = take2(m.lixo || []); const monte = take2(m.monte || []);
    const ok = (c) => !S.isRed3(c) && !S.isBlack3(c) && !S.isWild(c) && c.r !== 1 && c.r !== 12 && c.r !== 13; // cartas de enchimento: sem figuras que atrapalhem
    const safe = () => { const i = pool.findIndex(ok); return pool.splice(i, 1)[0]; };
    const bot = []; while (bot.length < 11) bot.push(safe());
    const m1 = [], m2 = []; while (m1.length < 11) m1.push(safe()); while (m2.length < 11) m2.push(safe());
    const reds = pool.filter(S.isRed3); pool = pool.filter((c) => !S.isRed3(c));
    g.hands = [mine, bot]; g.mortos = [m1, m2]; g.reds = [[], []];
    const seq = []; for (let i = 0; i < monte.length; i += 2) seq.push(...monte.slice(i, i + 2), safe(), safe()); // 2 minhas, 2 do robô (que também compra do monte)
    g.stock = reds.concat(pool, seq.reverse()); // pop() tira o último: sai primeiro o 1º de "monte"
    g.discard = lixo; g.lock = null;
    meldCards.forEach((cs) => { const ml = S.classify(cs); ml.id = ++g.meldSeq; ml.zone = 0; g.melds[0].push(ml); });
    if (meldCards.length) g.descended[0] = true;
    if (m.morto) { g.mortoTaken[0] = true; g.mortos[0] = []; }
    g.turn = 0; g.step = 'draw'; g.dealer = 1; g.turnos = [0, 0];
    g.last = 'Missão ' + (idx + 1) + ': ' + m.nome + '. A sua vez.'; g.log = [{ t: g.last, s: null }]; g.logN = 1;
    return g;
  }

  // Confere o objetivo na tela do jogador: {done, fail, txt, resta}
  function avalia(S, v, idx) {
    const m = LISTA[idx]; const t = v.myTeam; const melds = (v.melds && v.melds[t]) || []; const st = (v.stats && v.stats[v.seat]) || {};
    const pts = melds.reduce((a, x) => a + S.meldPts(x), 0);
    const fim = v.phase !== 'playing';
    const partes = m.meta.map((o) => {
      if (o.t === 'pts') return { ok: pts >= o.n, txt: pts + ' de ' + o.n + ' pontos' };
      if (o.t === 'can') { const n = melds.filter((x) => x.canastra && (!o.limpa || x.clean)).length; return { ok: n >= (o.n || 1), txt: n + ' de ' + (o.n || 1) + (o.limpa ? ' canastra limpa' : ' canastra' + (o.n > 1 ? 's' : '')) }; }
      if (o.t === 'lixo') return { ok: (st.pile || 0) >= 1, txt: (st.pile || 0) >= 1 ? 'lixo pego' : 'pegue o lixo' };
      if (o.t === 'morto') return { ok: !!(v.mortoTaken && v.mortoTaken[t]), txt: v.mortoTaken && v.mortoTaken[t] ? 'morto pego' : 'pegue o morto' };
      if (o.t === 'bater') { const bateu = fim && v.roundResult && v.roundResult.outSeat === v.seat; return { ok: !!bateu, txt: bateu ? 'bateu!' : 'bata' }; }
      return { ok: false, txt: '' };
    });
    const done = partes.every((p) => p.ok);
    const usadas = (v.turnos && v.turnos[v.seat]) || 0; const resta = Math.max(0, m.turnos - usadas);
    const fail = !done && (resta <= 0 || fim);
    return { done, fail, resta, txt: m.obj + ' · ' + partes.map((p) => p.txt).join(' · ') + ' · ' + (resta === 1 ? 'última vez' : resta + ' vezes') };
  }

  const api = { LISTA, build, avalia, carta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Missoes = api;
})(typeof window !== 'undefined' ? window : globalThis);
