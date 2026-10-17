/* Samba da Tânia — motor do jogo (regras da Tânia, pontuação e robôs).
   Sem dependência de tela nem de rede: roda no navegador e no Node (testes).

   Regras implementadas (conforme o quadro preenchido):
   - 2, 4 ou 6 jogadores; times pares/ímpares (cadeira % 2). 4 baralhos com todos os coringas (216 cartas).
   - 11 cartas por jogador, 2 mortos de 11 (um por time). Coringas: jokers e todos os 2.
   - Na vez: comprar 2 cartas (+1 por cada 3 vermelho na mão) ou pegar o lixo; baixar; descartar 1.
   - Só se baixa "lavadeira" (3+ cartas iguais; mínimo 2 naturais, o resto pode ser coringa).
   - Para descer a primeira vez na rodada: pontos mínimos conforme a pontuação do time.
   - Pegar o lixo exige usar a carta de cima num jogo. 3 preto tranca o próximo; coringa tranca todos até a vez de quem descartou.
   - Canastra = 7+ cartas: limpa 500, suja 300, de 3 preto 1000. Bater: morto pego + 1 limpa + 1 suja.
   - Acabar o monte encerra o jogo. Meta: 10.000 pontos. */
(function (root) {
  'use strict';

  const SUITS = ['P', 'O', 'C', 'E']; // paus, ouros, copas, espadas
  const SYM = { P: '♣', O: '♦', C: '♥', E: '♠', J: '★' };
  const RN = ['★', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const TARGET = 10000;

  const isWild = (c) => c.r === 0 || c.r === 2;
  const isBlack3 = (c) => c.r === 3 && (c.s === 'P' || c.s === 'E');
  const isRed3 = (c) => c.r === 3 && (c.s === 'C' || c.s === 'O');
  const pts = (c) => (c.r === 0 ? 50 : c.r <= 2 && c.r >= 1 ? 20 : c.r <= 7 ? 5 : 10);
  const handPenalty = (c) => (isBlack3(c) ? 100 : pts(c));
  const cardName = (c) => (c.r === 0 ? 'Coringa' : RN[c.r] + SYM[c.s]);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function makeDeck() {
    const d = []; let id = 0;
    for (let k = 0; k < 4; k++) {
      for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: id++, r, s });
      d.push({ id: id++, r: 0, s: 'J' });
      d.push({ id: id++, r: 0, s: 'J' });
    }
    return d; // 216 cartas
  }

  /* ---------- jogos (lavadeiras) ---------- */
  // Devolve null se as cartas não formam uma lavadeira válida.
  function classify(cards) {
    if (cards.length < 3) return null;
    let best = null;
    for (let r = 1; r <= 13; r++) {
      const nat = cards.filter((c) => c.r === r);
      if (nat.length < 2) continue;
      const oth = cards.filter((c) => c.r !== r);
      if (!oth.every(isWild)) continue;
      if (nat.some(isBlack3) && !(nat.every(isBlack3) && cards.length >= 7 && !oth.length)) continue;
      if (!best || oth.length < best.wilds) {
        best = { rank: r, cards: nat.concat(oth), wilds: oth.length, wildIds: oth.map((c) => c.id) };
      }
    }
    if (!best) return null;
    best.canastra = best.cards.length >= 7;
    best.clean = best.wilds === 0;
    best.black = best.rank === 3 && best.cards.some(isBlack3);
    return best;
  }
  const meldPts = (m) => (m.black ? 0 : m.cards.reduce((a, c) => a + pts(c), 0));
  const canastraBonus = (m) => (!m.canastra ? 0 : m.black ? 1000 : m.clean ? 500 : 300);

  // Pontos mínimos para descer conforme a pontuação do time.
  function needFor(score) {
    if (score < 2000) return { min: 75, canastra: false };
    if (score < 4000) return { min: 90, canastra: false };
    if (score < 6000) return { min: 120, canastra: false };
    if (score < 8000) return { min: 0, canastra: true };
    return { min: 200, canastra: false };
  }

  /* ---------- partida ---------- */
  const teamOf = (s, seat) => seat % 2;
  const teamSeats = (s, t) => { const r = []; for (let i = 0; i < s.n; i++) if (teamOf(s, i) === t) r.push(i); return r; };
  const canBater = (s, t) => s.mortoTaken[t] && s.melds[t].some((m) => m.canastra && m.clean) && s.melds[t].some((m) => m.canastra && !m.clean);

  function startRound(s, rng) {
    rng = rng || Math.random;
    s.round++;
    const deck = shuffle(makeDeck(), rng);
    s.hands = []; s.mortos = [];
    for (let i = 0; i < s.n; i++) s.hands.push(deck.splice(0, 11));
    for (let t = 0; t < 2; t++) s.mortos.push(deck.splice(0, 11));
    s.discard = [];
    s.stock = deck;
    s.mortoTaken = [false, false];
    s.descended = [false, false];
    s.melds = [[], []];
    // estatísticas por jogador: da rodada (rstats) e do jogo inteiro (gstats)
    const zero = () => ({ draws: 0, pile: 0, melds: 0, canL: 0, canS: 0, canB: 0, bater: 0, reds: 0, descFirst: 0 });
    s.rstats = Array.from({ length: s.n }, zero);
    if (!s.gstats) s.gstats = Array.from({ length: s.n }, zero);
    s.firstDesc = null;
    s.reds = [[], []];
    for (let i = 0; i < s.n; i++) layReds(s, i);
    s.meldSeq = 0; s.pileTakes = 0; s.lock = null; s.turnNo = 0; s.drawn = 0; s.owed = 0;
    s.dealer = (s.dealer + 1) % s.n;
    s.turn = (s.dealer + 1) % s.n; // direita de quem deu
    s.step = 'draw';
    s.phase = 'playing';
    s.roundResult = null;
    s.last = 'Rodada ' + s.round + ' começou. Vez de ' + s.players[s.turn].name + '.';
    s.log = [{ t: s.last, s: null }]; s.logN = 1; s.lastSeat = null;
    return s;
  }
  function newGame(players, opts) {
    opts = opts || {};
    const n = players.length;
    const s = {
      players: players.map((p) => ({ name: p.name, bot: !!p.bot })),
      n, nTeams: 2, scores: [0, 0], target: opts.target || TARGET, round: 0, dealer: n - 1, winner: null,
    };
    return startRound(s, opts.rng);
  }

  // 3 vermelhos saem da mão e ficam na mesa à vista de todos; cada um traz 1 carta do monte no lugar.
  // deferred: a carta de reposição fica "devida" e o jogador compra tocando no monte (uma por toque).
  function layReds(s, seat, deferred) {
    const t = teamOf(s, seat); const hand = s.hands[seat]; let n = 0;
    for (;;) {
      const i = hand.findIndex(isRed3);
      if (i < 0) break;
      s.reds[t].push(hand.splice(i, 1)[0]); n++;
      if (deferred) s.owed = (s.owed || 0) + 1;
      else if (s.stock.length) hand.push(s.stock.pop());
    }
    if (n && s.rstats) s.rstats[seat].reds += n;
    return n;
  }
  function takeMorto(s, seat) {
    const t = teamOf(s, seat);
    s.hands[seat] = s.hands[seat].concat(s.mortos[t]); s.mortos[t] = []; s.mortoTaken[t] = true;
    layReds(s, seat);
  }

  function endRound(s, outSeat, stockOut) {
    const res = [];
    if (outSeat != null && s.rstats) s.rstats[outSeat].bater = 1;
    for (let t = 0; t < 2; t++) {
      let mp = 0, bonus = 0, handPts = 0;
      for (const m of s.melds[t]) { mp += meldPts(m); bonus += canastraBonus(m); }
      for (const seat of teamSeats(s, t)) for (const c of s.hands[seat]) handPts += handPenalty(c);
      const bater = outSeat != null && teamOf(s, outSeat) === t ? 100 : 0;
      const penalty = s.mortoTaken[t] ? 0 : 100;
      // 3 vermelhos: +100 cada; se alguém bateu e o time não tem nenhuma canastra, −100 cada
      const noCanastra = outSeat != null && !s.melds[t].some((m) => m.canastra);
      const redPts = s.reds[t].length * (noCanastra ? -100 : 100);
      const total = mp + bonus + bater + redPts - handPts - penalty;
      s.scores[t] += total;
      res.push({ meldPts: mp, bonus, bater, redPts, handPts, penalty, total });
    }
    if (s.rstats && s.gstats) s.rstats.forEach((r, i) => { for (const k in r) s.gstats[i][k] += r[k]; });
    s.roundResult = { outSeat, stockOut: !!stockOut, teams: res };
    s.phase = 'roundEnd';
    const max = Math.max(...s.scores);
    if (stockOut || (max >= s.target && s.scores[0] !== s.scores[1])) {
      s.phase = 'gameEnd';
      s.winner = s.scores[0] === s.scores[1] ? -1 : s.scores.indexOf(max);
    }
  }

  // Erro de regra ao esvaziar/quase esvaziar a mão; null se está tudo certo.
  function afterHand(s, seat) {
    const t = teamOf(s, seat); const hand = s.hands[seat];
    const msg = 'Para bater o time precisa ter pego o morto, ter uma canastra limpa e uma suja.';
    if (hand.length === 0) {
      if (!s.mortoTaken[t]) { takeMorto(s, seat); s.last += ' e pegou o morto'; return null; }
      if (canBater(s, t)) { endRound(s, seat); s.last += ' e BATEU!'; return null; }
      return msg;
    }
    if (hand.length === 1 && s.mortoTaken[t] && !canBater(s, t)) return 'Assim você ficaria com uma carta só e sem poder bater. ' + msg;
    return null;
  }

  // Valida grupos novos (arrays de cartas) para o time; devolve { melds } ou { error }.
  function checkNewMelds(s, t, groups, ignoreRank) {
    const out = []; const seen = new Set();
    for (const g of groups) {
      const m = classify(g);
      if (!m) return { error: 'Esse jogo não vale: precisa de 3 ou mais cartas iguais (pelo menos 2 naturais, o resto pode ser coringa).' };
      out.push(m);
    }
    if (!s.descended[t] && out.length) {
      const need = needFor(s.scores[t]);
      if (need.canastra) { if (!out.some((m) => m.canastra)) return { error: 'Com a pontuação do seu time, para descer precisa de uma canastra (7 cartas iguais).' }; }
      else {
        const total = out.reduce((a, m) => a + meldPts(m), 0);
        if (total < need.min) return { error: 'Para descer precisa de ' + need.min + ' pontos; você tem ' + total + '.' };
      }
    }
    return { melds: out };
  }

  const lockedFor = (s, seat) => !!s.lock && ((s.lock.type === 'black' && s.lock.seat === seat) || (s.lock.type === 'wild' && s.lock.owner !== seat));

  // Executa uma jogada. Devolve { state } ou { error }. Nunca altera o estado recebido.
  function actInner(s0, seat, a) {
    const s = clone(s0);
    const E = (m) => ({ error: m });
    if (s.phase !== 'playing') return E('A rodada não está em andamento.');
    if (s.turn !== seat) return E('Ainda não é a sua vez.');
    const hand = s.hands[seat]; const t = teamOf(s, seat); const name = s.players[seat].name;
    const pickGroups = (groups) => {
      const used = new Set(); const out = [];
      for (const ids of groups) {
        if (!Array.isArray(ids) || !ids.length) return null;
        const g = [];
        for (const id of ids) { const c = hand.find((x) => x.id === id); if (!c || used.has(id)) return null; used.add(id); g.push(c); }
        out.push(g);
      }
      return out;
    };
    const drop = (cards) => { for (const c of cards) hand.splice(hand.findIndex((x) => x.id === c.id), 1); };
    const zone = Number.isInteger(a.zone) && a.zone >= 0 && a.zone < s.n && teamOf(s, a.zone) === t ? a.zone : seat;
    const lay = (ms) => {
      for (const m of ms) { m.id = ++s.meldSeq; m.zone = zone; s.melds[t].push(m); }
      if (ms.length && s.rstats) { const st = s.rstats[seat]; st.melds += ms.length; ms.forEach((m) => { if (m.canastra) st[m.black ? 'canB' : m.clean ? 'canL' : 'canS']++; }); if (!s.descended[t]) { st.descFirst++; if (s.firstDesc == null) s.firstDesc = t; } }
      s.descended[t] = true;
    };

    switch (a.a) {
      case 'draw': {
        if (s.step !== 'draw') return E('Você já comprou. Agora baixe jogos e descarte.');
        if (!s.stock.length) { s.last = 'O monte acabou. Fim de jogo.'; endRound(s, null, true); return { state: s }; }
        // uma carta por toque: primeiro as de reposição dos 3 vermelhos que saíram, depois as 2 da vez
        const repo = (s.owed || 0) > 0;
        hand.push(s.stock.pop());
        if (s.rstats) s.rstats[seat].draws++;
        if (repo) s.owed--; else s.drawn = (s.drawn || 0) + 1;
        const nth = s.drawn;
        const nr = layReds(s, seat, true);
        if (s.drawn >= 2 && !s.owed) { s.step = 'play'; s.drawn = 0; s.owed = 0; }
        s.last = name + (repo ? ' virou a carta de reposição do 3 vermelho' : ' virou a ' + nth + 'ª carta do monte') + (nr ? ' e saiu ' + (nr > 1 ? nr + ' três vermelhos' : 'um 3 vermelho') + ': foi para a mesa e dá ' + (nr > 1 ? nr + ' cartas' : 'uma carta') + ' a mais' : '') + '.';
        return { state: s };
      }
      case 'takePile': {
        if (s.step !== 'draw') return E('Você já comprou nesta vez.');
        if (s.drawn || s.owed) return E('Você já virou uma carta do monte: continue comprando do monte.');
        if (!s.discard.length) return E('O lixo está vazio.');
        if (lockedFor(s, seat)) return E('O lixo está trancado para você nesta vez.');
        const top = s.discard[s.discard.length - 1];
        const groups = pickGroups(a.groups || []);
        if (!groups) return E('Cartas inválidas.');
        if (!groups.length) return E('Marque na mão 2 cartas iguais à carta de cima do lixo (coringa vale como a carta).');
        if (s.descended[t] && groups.length !== 1) return E('Com seu time já descido, baixe só o jogo que usa a carta de cima: ela mais 2 cartas iguais da sua mão.');
        // o jogo que usa a carta de cima pode vir em qualquer posição; os outros jogos marcados descem junto (na 1ª descida somam pontos)
        const ti = groups.findIndex((g) => g.length >= 2 && classify(g.concat([top])));
        if (ti < 0) return E('Nenhum dos jogos marcados combina com a carta de cima do lixo: precisa de 2 cartas da sua mão iguais a ela (um coringa vale).');
        const newGroups = groups.map((g, i) => (i === ti ? g.concat([top]) : g));
        const first = classify(newGroups[ti]);
        // joinId: encaixa no jogo que o time já tem; sem joinId, faz um jogo novo
        const existing = a.joinId != null ? s.melds[t].find((x) => x.id === a.joinId && x.rank === first.rank) : null;
        if (a.joinId != null && !existing) return E('Esse jogo não é do seu time ou não é da mesma figura.');
        let merged = null;
        if (existing) {
          merged = classify(existing.cards.concat(newGroups[ti]));
          if (!merged || merged.rank !== existing.rank) return E('Essas cartas não encaixam no seu jogo de ' + RN[existing.rank] + '.');
        }
        const chk = checkNewMelds(s, t, merged ? newGroups.filter((_, i) => i !== ti) : newGroups, null);
        if (chk.error) return E(chk.error);
        s.discard.pop();
        const k = s.discard.length + 1;
        const pile = s.discard; s.discard = [];
        for (const g of groups) drop(g);
        hand.push(...pile); const nrp = layReds(s, seat);
        if (merged) { merged.id = existing.id; merged.zone = existing.zone; s.melds[t][s.melds[t].indexOf(existing)] = merged; if (merged.canastra && !existing.canastra && s.rstats) s.rstats[seat][merged.black ? 'canB' : merged.clean ? 'canL' : 'canS']++; }
        lay(chk.melds);
        s.step = 'play'; s.lock = null; s.pileTakes++; s.tookPile = true;
        if (s.rstats) s.rstats[seat].pile++;
        s.last = name + ' pegou o lixo (' + k + (k === 1 ? ' carta: ' : ' cartas: ') + [top].concat(pile).slice(0, 14).map(cardName).join(' ') + (k > 14 ? ' …' : '') + ') e baixou ' + newGroups[ti].map(cardName).join(' ') + (nrp ? ' e pôs ' + nrp + ' três vermelho' + (nrp > 1 ? 's' : '') + ' na mesa (comprou ' + nrp + ' no lugar)' : '') + '.';
        const er = afterHand(s, seat); if (er) return E(er);
        return { state: s };
      }
      case 'meld': {
        if (s.step !== 'play') return E('Primeiro compre uma carta.');
        const groups = pickGroups(a.groups || (a.ids ? [a.ids] : []));
        if (!groups || !groups.length) return E('Cartas inválidas.');
        const chk = checkNewMelds(s, t, groups, null);
        if (chk.error) return E(chk.error);
        for (const g of groups) drop(g);
        lay(chk.melds);
        s.last = name + ' baixou ' + groups.map((g, i) => 'jogo de ' + RN[chk.melds[i].rank] + ' (' + g.map(cardName).join(' ') + ')').join(' e ') + '.';
        const er = afterHand(s, seat); if (er) return E(er);
        return { state: s };
      }
      case 'addTo': {
        if (s.step !== 'play') return E('Primeiro compre uma carta.');
        const groups = pickGroups([a.ids]);
        if (!groups) return E('Cartas inválidas.');
        const cards = groups[0];
        const m = s.melds[t].find((x) => x.id === a.meldId);
        if (!m) return E('Esse jogo não é do seu time.');
        const nm = classify(m.cards.concat(cards));
        if (!nm || nm.rank !== m.rank) return E('Essas cartas não encaixam nesse jogo.');
        drop(cards);
        nm.id = m.id; nm.zone = m.zone; s.melds[t][s.melds[t].indexOf(m)] = nm;
        if (nm.canastra && !m.canastra && s.rstats) s.rstats[seat][nm.black ? 'canB' : nm.clean ? 'canL' : 'canS']++;
        s.last = name + ' acrescentou ' + cards.map(cardName).join(' ') + ' ao jogo de ' + RN[m.rank] + (nm.canastra && !m.canastra ? ' e fez CANASTRA' : '') + '.';
        const er = afterHand(s, seat); if (er) return E(er);
        return { state: s };
      }
      case 'discard': {
        if (s.step !== 'play') return E('Primeiro compre uma carta.');
        const c = hand.find((x) => x.id === a.id);
        if (!c) return E('Carta inválida.');
        if (hand.length === 1 && s.mortoTaken[t] && !canBater(s, t)) return E('Para bater o time precisa de uma canastra limpa e uma suja.');
        drop([c]); s.discard.push(c);
        s.last = name + ' descartou ' + cardName(c) + '.';
        const next = (s.turn + 1) % s.n;
        s.lock = isBlack3(c) ? { type: 'black', seat: next } : isWild(c) ? { type: 'wild', owner: seat } : null;
        if (hand.length === 0) {
          if (!s.mortoTaken[t]) { takeMorto(s, seat); s.last += ' e pegou o morto.'; }
          else { endRound(s, seat); s.last += ' e BATEU!'; return { state: s }; }
        }
        s.turn = next; s.step = 'draw'; s.turnNo = (s.turnNo || 0) + 1; s.tookPile = false;
        return { state: s };
      }
      default: return E('Jogada desconhecida.');
    }
  }

  // Toda jogada fica registrada no histórico que todos veem na mesa.
  function act(s0, seat, a) {
    const r = actInner(s0, seat, a);
    if (r.state && r.state.last !== s0.last) { r.state.log = (r.state.log || []).concat([{ t: r.state.last, s: seat }]).slice(-40); r.state.logN = (r.state.logN || 0) + 1; r.state.lastSeat = seat; }
    return r;
  }

  function nextRound(s0, rng) {
    if (s0.phase !== 'roundEnd') return { error: 'A rodada ainda não acabou.' };
    return { state: startRound(clone(s0), rng) };
  }

  // Tudo o que um jogador pode ver (a mão dos outros fica escondida).
  function viewFor(s, seat) {
    const t = teamOf(s, seat);
    return {
      phase: s.phase, n: s.n, nTeams: 2, round: s.round, target: s.target,
      scores: s.scores, seat, myTeam: t,
      players: s.players.map((p, i) => ({ name: p.name, bot: p.bot, team: teamOf(s, i), count: s.hands[i].length })),
      hand: s.hands[seat],
      stockCount: s.stock.length,
      drawCount: 2, drawn: s.drawn || 0, owed: s.owed || 0, tookPile: !!s.tookPile, reds: s.reds,
      discardTop: s.discard.length ? s.discard[s.discard.length - 1] : null,
      discardCount: s.discard.length,
      pileLocked: lockedFor(s, seat) && s.discard.length > 0,
      lockType: s.lock ? s.lock.type : null,
      mortoTaken: s.mortoTaken, descended: s.descended,
      need: [needFor(s.scores[0]), needFor(s.scores[1])],
      melds: s.melds,
      stats: s.rstats || [], gstats: s.gstats || [], firstDesc: s.firstDesc == null ? null : s.firstDesc,
      turn: s.turn, step: s.step, last: s.last, lastSeat: s.lastSeat == null ? null : s.lastSeat, log: (s.log || []).slice(-30), logN: s.logN || 0,
      roundResult: s.roundResult, winner: s.winner,
    };
  }

  /* ---------- robôs ---------- */
  const countBy = (cards) => { const m = {}; cards.forEach((c) => (m[c.r] = m[c.r] || []).push(c)); return m; };

  // Monta grupos de lavadeiras com as cartas da mão; ranks já usados ficam de fora.
  function planGroups(hand, usedRanks, need, descended, force) {
    const nat = hand.filter((c) => !isWild(c) && !isBlack3(c));
    const wilds = hand.filter(isWild).slice();
    const by = countBy(nat);
    const groups = [];
    for (const r in by) if (by[r].length >= 3 && !usedRanks.has(+r)) groups.push(by[r].slice());
    const total = () => groups.reduce((a, g) => a + g.reduce((x, c) => x + pts(c), 0), 0);
    const enough = () => (need.canastra ? groups.some((g) => g.length >= 7) : total() >= need.min);
    if (!descended && !enough()) {
      if (need.canastra) {
        const big = groups.slice().sort((a, b) => b.length - a.length)[0];
        if (big) while (big.length < 7 && wilds.length) big.push(wilds.pop());
      } else {
        const pairs = Object.keys(by).filter((r) => by[r].length === 2 && !usedRanks.has(+r)).sort((a, b) => pts(by[b][0]) - pts(by[a][0]));
        for (const r of pairs) { if (enough() || !wilds.length) break; groups.push(by[r].concat([wilds.pop()])); }
        // reforça grupos com coringas para bater a meta
        for (const g of groups) { while (!enough() && wilds.length && g.length < 8) g.push(wilds.pop()); if (enough()) break; }
      }
      if (!enough() && !force) return [];
    } else if (descended && hand.length > 9) {
      for (const r of Object.keys(by)) if (by[r].length === 2 && !usedRanks.has(+r) && wilds.length > 1) groups.push(by[r].concat([wilds.pop()]));
    }
    return groups.filter((g) => classify(g));
  }
  function discardOrder(hand) {
    const by = countBy(hand.filter((c) => !isWild(c)));
    return hand.map((c) => {
      let k;
      if (isBlack3(c)) k = -50;
      else if (isWild(c)) k = 100;
      else if (isRed3(c)) k = 40;
      else k = (by[c.r] ? by[c.r].length : 1) * 10 - pts(c) * 0.1;
      return { id: c.id, k };
    }).sort((a, b) => a.k - b.k).map((x) => x.id);
  }
  function botPlan(s, seat, level) {
    level = level || 'normal';
    const hand = s.hands[seat]; const t = teamOf(s, seat); const melds = s.melds[t];
    const need = needFor(s.scores[t]); const desc = s.descended[t];
    const used = new Set(melds.map((m) => m.rank));
    if (s.step === 'draw') {
      const top = s.discard[s.discard.length - 1];
      if (level !== 'facil' && top && !s.drawn && !lockedFor(s, seat) && s.pileTakes < 25 && !isWild(top) && !isBlack3(top)) {
        if (desc) {
          const same = hand.filter((c) => c.r === top.r);
          const jm = melds.find((x) => x.rank === top.r);
          if (same.length >= 2) return { a: 'takePile', groups: [same.map((c) => c.id)], joinId: jm ? jm.id : undefined };
          // difícil: uma igual + coringa também serve, se o lixo valer a pena
          if (level === 'dificil' && same.length === 1 && s.discard.length >= 3) { const w = hand.find(isWild); if (w) return { a: 'takePile', groups: [[same[0].id, w.id]], joinId: jm ? jm.id : undefined }; }
        } else {
          const gs = planGroups(hand.concat([top]), used, need, false);
          const gi = gs.findIndex((g) => g.some((c) => c.id === top.id));
          if (gi >= 0) {
            const ordered = [gs[gi]].concat(gs.filter((_, i) => i !== gi)).map((g, i) => g.filter((c) => c.id !== top.id).map((c) => c.id));
            if (ordered[0].length >= 2) return { a: 'takePile', groups: ordered };
          }
        }
      }
      return { a: 'draw' };
    }
    if (desc) {
      for (const c of hand.filter((x) => !isWild(x) && !isBlack3(x))) {
        const m = melds.find((x) => x.rank === c.r);
        if (m) return { a: 'addTo', meldId: m.id, ids: [c.id] };
      }
      const gs = planGroups(hand, used, need, true);
      if (gs.length) return { a: 'meld', groups: gs.map((g) => g.map((c) => c.id)) };
    } else {
      const gs = planGroups(hand, used, need, false);
      if (gs.length) return { a: 'meld', groups: gs.map((g) => g.map((c) => c.id)) };
    }
    const order = discardOrder(hand);
    if (level === 'facil') { const pick = order.slice(0, 3); return { a: 'discard', id: pick[Math.floor(Math.random() * pick.length)] }; }
    if (level === 'dificil') {
      // não entrega carta que o outro time já tem jogo na mesa
      const oppRanks = new Set(s.melds[1 - t].map((m) => m.rank));
      const safe = order.filter((id) => { const c = hand.find((x) => x.id === id); return c && !isWild(c) && !oppRanks.has(c.r); });
      if (safe.length) return { a: 'discard', id: safe[0] };
    }
    return { a: 'discard', id: order[0] };
  }
  // Jogada do robô já com plano B se a regra recusar a primeira ideia.
  function botMove(s, seat, level) {
    let r = act(s, seat, botPlan(s, seat, level));
    if (!r.error) return r;
    if (s.step === 'draw') return act(s, seat, { a: 'draw' });
    for (const id of discardOrder(s.hands[seat])) { r = act(s, seat, { a: 'discard', id }); if (!r.error) return r; }
    return r;
  }

  // Jogada automática quando o tempo do jogador acaba: compra e descarta a carta menos útil.
  function timeoutMove(s0, seat) {
    let s = s0; const name = s.players[seat].name;
    for (let i = 0; i < 12 && s.step === 'draw'; i++) {
      const r = act(s, seat, { a: 'draw' });
      if (r.error) return r;
      s = r.state;
      if (s.phase !== 'playing') { s.last = 'Tempo esgotado. ' + s.last; if (s.log && s.log.length) s.log[s.log.length - 1].t = s.last; return { state: s }; }
    }
    for (const id of discardOrder(s.hands[seat])) {
      const r = act(s, seat, { a: 'discard', id });
      if (!r.error) { r.state.last = 'Tempo esgotado para ' + name + '. ' + r.state.last; if (r.state.log && r.state.log.length) r.state.log[r.state.log.length - 1].t = r.state.last; return r; }
    }
    return { error: 'sem jogada possível' };
  }

  // Se as cartas marcadas não formam um jogo só, tenta separar em vários jogos (uma figura por jogo).
  // Devolve a lista de grupos de cartas, ou null se não der.
  function autoGroups(cards) {
    if (cards.length < 3) return null;
    if (classify(cards)) return [cards];
    const nat = cards.filter((c) => !isWild(c)); const wild = cards.filter(isWild);
    const by = {}; nat.forEach((c) => (by[c.r] = by[c.r] || []).push(c));
    const gs = Object.values(by).map((g) => g.slice());
    if (!gs.length || gs.some((g) => g.length < 2)) return null;
    const w = wild.slice();
    for (const g of gs) if (g.length < 3) { if (!w.length) return null; g.push(w.pop()); }
    while (w.length) gs[0].push(w.pop());
    return gs.every((g) => classify(g)) ? gs : null;
  }

  // Sugestão para o jogador: todos os jogos que dá para montar com a mão (mesmo que ainda não cheguem nos pontos).
  const suggestGroups = (hand, melds, need, descended) => planGroups(hand, new Set(melds.map((m) => m.rank)), need, descended, true).map((g) => g.map((c) => c.id));

  // Soma das estatísticas dos jogadores de um time (da rodada: stats; do jogo: gstats).
  const teamStats = (list, players, t) => { const o = {}; (list || []).forEach((st, i) => { if (players[i] && players[i].team === t || (!players[i].team && i % 2 === t)) for (const k in st) o[k] = (o[k] || 0) + st[k]; }); return o; };

  const api = {
    SUITS, SYM, RN, TARGET, isWild, isBlack3, isRed3, pts, cardName, makeDeck, classify, meldPts, canastraBonus, needFor,
    teamStats, newGame, nextRound, act, viewFor, botPlan, botMove, timeoutMove, suggestGroups, autoGroups, teamOf, teamSeats, canBater, mulberry, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Samba = api;
})(typeof window !== 'undefined' ? window : globalThis);
