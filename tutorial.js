/* Samba da Tânia — partida de treino guiada: ensina os TOQUES no celular (quem joga já sabe as regras).
   Comprar tocando no monte, 3 vermelho, marcar e baixar, juntar a um jogo, arrastar para ordenar a mão,
   descartar e pegar o lixo. As cartas vêm arrumadas para cada passo acontecer. 100 moedas na primeira vez. */
(function (root) {
  'use strict';
  const T = { ativo: false, passo: 0, ordenou: false, lixoPronto: false, fim: false };
  const PASSOS = [
    { id: 'monte', txt: 'Toque no MONTE (a pilha virada, no meio da mesa) para virar a 1ª carta.' },
    { id: 'red3', txt: 'Saiu um 3 vermelho! Ele foi sozinho para a mesa e vale 100. Toque no monte de novo para buscar as cartas que faltam.' },
    { id: 'descer', txt: 'Toque nos 4 Ases da sua mão para marcar (eles sobem). Depois toque em BAIXAR.' },
    { id: 'juntar', txt: 'Ainda sobrou um Ás na mão. Marque esse Ás e toque no seu jogo de Ás, na mesa.' },
    { id: 'ordenar', txt: 'Para arrumar a mão: segure uma carta com o dedo e arraste para outro lugar.' },
    { id: 'descartar', txt: 'Para terminar a vez: marque UMA carta e toque em DESCARTAR.' },
    { id: 'espera', txt: 'Agora é a vez da Dona Nit. Espere um pouquinho…' },
    { id: 'lixo', txt: 'Olhe o LIXO: tem um Rei em cima, e você tem 2 Reis. Marque os 2 Reis e toque em PEGAR O LIXO.' },
    { id: 'desc2', txt: 'Todas as cartas do lixo vieram para a sua mão. Agora descarte UMA carta.' },
    { id: 'fim', txt: 'Pronto! Você aprendeu todos os toques. Pode continuar jogando esta partida ou voltar ao início.' },
  ];

  // Monta a partida arrumada: você começa; 5 Ases e 2 Reis na mão; um 3♥ em cima do monte.
  function build(S, myName) {
    const g = S.newGame([{ name: myName || 'Você' }, { name: 'Dona Nit', bot: true, lvl: 'normal' }], { mode: 'treino' });
    let pool = g.hands.flat().concat(g.mortos.flat(), g.stock, g.reds.flat());
    const take = (r, s) => { const i = pool.findIndex((c) => c.r === r && (!s || c.s === s)); return i < 0 ? null : pool.splice(i, 1)[0]; };
    const mine = [take(1, 'P'), take(1, 'O'), take(1, 'C'), take(1, 'E'), take(1, 'P'), take(13, 'P'), take(13, 'O')].filter(Boolean);
    const red3 = take(3, 'C'); const kTop = take(13, 'C');
    const safe = () => { const i = pool.findIndex((c) => !S.isRed3(c) && c.r !== 1 && c.r !== 13 && !S.isWild(c) && !S.isBlack3(c)); return pool.splice(i, 1)[0]; };
    while (mine.length < 11) mine.push(safe());
    const bot = []; while (bot.length < 11) bot.push(safe());
    const m1 = [], m2 = []; while (m1.length < 11) m1.push(safe()); while (m2.length < 11) m2.push(safe());
    const fundo = pool.filter((c) => S.isRed3(c)); pool = pool.filter((c) => !S.isRed3(c));
    g.hands = [mine, bot]; g.mortos = [m1, m2]; g.reds = [[], []];
    const prox = safe(); g.stock = fundo.concat(pool, [prox, red3]); // pop() tira o último: primeiro sai o 3♥
    g.kTop = kTop; g.turn = 0; g.step = 'draw';
    g.last = 'Treino: a sua vez primeiro.'; g.log = [{ t: g.last, s: null }]; g.logN = 1;
    Object.assign(T, { ativo: true, passo: 0, ordenou: false, lixoPronto: false, fim: false });
    return g;
  }
  // Antes da 2ª vez dela: põe o Rei guardado em cima do lixo, destrancado.
  function prep(g) {
    if (!T.ativo || T.passo !== 6 || g.turn !== 0 || g.phase !== 'playing' || !g.kTop || T.lixoPronto) return false;
    g.discard.push(g.kTop); g.kTop = null; g.lock = null; T.lixoPronto = true; T.passo = 7; return true;
  }
  // Acompanha a tela e devolve o texto do passo atual.
  function update(v) {
    if (!T.ativo || !v || !v.hand) return null;
    const me = v.turn === v.seat && v.phase === 'playing';
    const melds = (v.melds && v.melds[v.myTeam]) || [];
    const ases = melds.find((m) => m.rank === 1);
    if (T.passo === 0 && (v.owed || (v.reds && v.reds[v.myTeam].length))) T.passo = 1;
    if (T.passo <= 1 && v.step === 'play') T.passo = 2;
    if (T.passo === 2 && ases) T.passo = ases.cards.length >= 5 ? 4 : 3;
    if (T.passo === 3 && ases && ases.cards.length >= 5) T.passo = 4;
    if (T.passo === 4 && T.ordenou) T.passo = 5;
    if (T.passo === 5 && !me) T.passo = 6;
    if (T.passo === 7 && v.stats && v.stats[v.seat] && v.stats[v.seat].pile >= 1) T.passo = 8;
    if (T.passo === 8 && !me) { T.passo = 9; T.fim = true; }
    if (v.phase !== 'playing' && T.passo < 9) { T.passo = 9; T.fim = true; }
    return PASSOS[T.passo].txt;
  }
  const api = { PASSOS, state: T, build, prep, update, onReorder: () => { T.ordenou = true; }, stop: () => { T.ativo = false; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tutorial = api;
})(typeof window !== 'undefined' ? window : globalThis);
