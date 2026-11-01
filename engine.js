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
      if (r === 2) continue; // o 2 é coringa: não existe jogo/canastra de coringa, a figura precisa de 2 cartas normais
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
    // memória da mesa (o que qualquer jogador atento sabe): figuras que cada um levou do lixo e as que descartou
    s.known = Array.from({ length: s.n }, () => []); s.discR = Array.from({ length: s.n }, () => []);
    s.dealer = (s.dealer + 1) % s.n;
    s.turn = (s.dealer + 1) % s.n; // direita de quem deu
    s.step = 'draw';
    s.phase = 'playing';
    s.roundResult = null; s.startedAt = Date.now(); s.turnos = Array(s.n).fill(0);
    s.last = 'Rodada ' + s.round + ' começou. Vez de ' + s.players[s.turn].name + '.';
    s.log = [{ t: s.last, s: null }]; s.logN = 1; s.lastSeat = null;
    return s;
  }
  function newGame(players, opts) {
    opts = opts || {};
    const n = players.length;
    const s = {
      players: players.map((p) => (p.lvl ? { name: p.name, bot: !!p.bot, lvl: p.lvl } : { name: p.name, bot: !!p.bot })),
      n, nTeams: 2, scores: opts.scores ? [+opts.scores[0] || 0, +opts.scores[1] || 0] : [0, 0], target: opts.target || TARGET, round: 0, dealer: n - 1, winner: null,
    };
    s.vantagem = s.scores.slice();
    if (opts.maxRounds) s.maxRounds = opts.maxRounds;
    if (opts.mode) s.mode = opts.mode;
    s.runId = Date.now().toString(36) + Array.from({ length: 4 }, () => 'abcdefghijklmnopqrstuvwxyz'[(Math.random() * 26) | 0]).join('');
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
    // fase/torneio/desafio/familia: o monte acabar encerra só a rodada; empate puxa outra rodada
    if (s.mode === 'fase' || s.mode === 'torneio' || s.mode === 'desafio' || s.mode === 'familia') {
      if (s.maxRounds) {
        if (s.round >= s.maxRounds && s.scores[0] !== s.scores[1]) { s.phase = 'gameEnd'; s.winner = s.scores.indexOf(max); }
      } else if (s.target <= 1) {
        if (res[0].total !== res[1].total) { s.phase = 'gameEnd'; s.winner = res[0].total > res[1].total ? 0 : 1; }
      } else if (max >= s.target && s.scores[0] !== s.scores[1]) { s.phase = 'gameEnd'; s.winner = s.scores.indexOf(max); }
      return;
    }
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
      if (!m) return { error: 'Esse jogo não vale: precisa de 3 ou mais cartas iguais, com pelo menos 2 cartas normais (coringa e 2 só completam, não formam jogo sozinhos).' };
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
    const forget = (c) => { const k = s.known && s.known[seat]; if (k) { const i = k.indexOf(c.r); if (i >= 0) k.splice(i, 1); } };
    const drop = (cards) => { for (const c of cards) { hand.splice(hand.findIndex((x) => x.id === c.id), 1); forget(c); } };
    const zone = Number.isInteger(a.zone) && a.zone >= 0 && a.zone < s.n && teamOf(s, a.zone) === t ? a.zone : seat;
    const lay = (ms) => {
      for (const m of ms) { m.id = ++s.meldSeq; m.zone = zone; s.melds[t].push(m); }
      if (ms.length && s.rstats) { const st = s.rstats[seat]; st.melds += ms.length; ms.forEach((m) => { if (m.canastra) st[m.black ? 'canB' : m.clean ? 'canL' : 'canS']++; }); if (!s.descended[t]) { st.descFirst++; if (s.firstDesc == null) s.firstDesc = t; } }
      s.descended[t] = true;
    };

    switch (a.a) {
      case 'draw': {
        if (s.step !== 'draw') return E('Você já comprou. Agora baixe jogos e descarte.');
        if (!s.stock.length) { s.last = s.mode && s.mode !== 'livre' ? 'O monte acabou. Fim da rodada.' : 'O monte acabou. Fim de jogo.'; endRound(s, null, true); return { state: s }; }
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
        hand.push(...pile); if (s.known) pile.forEach((c) => { if (!isWild(c)) s.known[seat].push(c.r); });
        const nrp = layReds(s, seat);
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
        if (s.discR) { s.discR[seat].push(c.r); if (s.discR[seat].length > 8) s.discR[seat].shift(); }
        if (s.turnos) s.turnos[seat] = (s.turnos[seat] || 0) + 1;
        s.last = name + ' descartou ' + cardName(c) + '.';
        const next = (s.turn + 1) % s.n;
        // coringa/2 tranca o lixo para TODOS até a vez de quem descartou; a tranca continua enquanto os outros descartam
        const seguraCoringa = s.lock && s.lock.type === 'wild' && s.lock.owner !== seat;
        s.lock = isBlack3(c) ? { type: 'black', seat: next } : isWild(c) ? { type: 'wild', owner: seat } : seguraCoringa ? s.lock : null;
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
      runId: s.runId || null, startedAt: s.startedAt || null, vantagem: s.vantagem || [0, 0], mode: s.mode || null, maxRounds: s.maxRounds || 0, turnos: s.turnos || [],
      roundWinner: s.roundResult ? (s.roundResult.teams[0].total === s.roundResult.teams[1].total ? -1 : s.roundResult.teams[0].total > s.roundResult.teams[1].total ? 0 : 1) : null,
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
    if (level === 'dificil') return hardPlan(s, seat, PARAMS.dificil);
    if (level === 'mestre') return hardPlan(s, seat, PARAMS.mestre);
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
  /* ---------- robô Difícil: joga como gente experiente, sem espiar a mão de ninguém ----------
     Usa só o que está à vista ou na memória de quem presta atenção: jogos na mesa, lixo, cartas que cada um
     levou do lixo (s.known) e o que cada um descartou (s.discR). Conta as cartas que faltam aparecer. */
  const COPIAS = 16; // 4 baralhos × 4 naipes de cada figura
  function unseenOf(s, seat, r) {
    let vis = 0;
    s.hands[seat].forEach((c) => { if (c.r === r) vis++; });
    s.melds.forEach((ms) => ms.forEach((m) => m.cards.forEach((c) => { if (c.r === r) vis++; })));
    s.discard.forEach((c) => { if (c.r === r) vis++; });
    if (r === 3) s.reds.forEach((rs) => (vis += rs.length));
    return Math.max(0, COPIAS - vis);
  }
  // Chance de o jogador "who" conseguir pegar o lixo se a carta de cima for da figura r (1 igual + coringa já serve).
  // chance de, sorteando h cartas de N (u delas "boas"), vir pelo menos 1 e pelo menos 2
  function hiper(N, u, h) {
    if (u <= 0 || h <= 0) return [0, 0];
    let p0 = 1; for (let i = 0; i < h; i++) p0 *= Math.max(0, N - u - i) / (N - i);
    const den = N - u - h + 1; const p1 = den > 0 ? p0 * (h * u) / den : 0;
    return [Math.max(0, 1 - p0), Math.max(0, 1 - p0 - p1)];
  }
  function perigo(s, me, who, r, exato) {
    const h = s.hands[who].length; if (!h) return 0;
    const pool = Math.max(20, s.stock.length + s.hands.reduce((a, x, i) => a + (i === me ? 0 : x.length), 0) + s.mortos.reduce((a, m) => a + m.length, 0));
    const u = unseenOf(s, me, r); const e = (u * h) / pool;
    const known = (s.known && s.known[who] ? s.known[who].filter((x) => x === r).length : 0);
    const descartou = s.discR && s.discR[who] && s.discR[who].slice(-4).includes(r);
    let p1 = 1 - Math.exp(-e), p2 = 1 - Math.exp(-e) * (1 + e); // ≥1 e ≥2 cópias
    if (exato) { const q = hiper(pool, u, h); p1 = q[0]; p2 = q[1]; }
    if (known >= 2) { p1 = 1; p2 = 1; } else if (known === 1) { p1 = 1; p2 = Math.max(p2, 1 - Math.exp(-e)); }
    if (descartou && known < 2) { p1 *= 0.5; p2 *= 0.3; }
    const pw = 1 - Math.pow(1 - 24 / 216, h); // ter pelo menos um coringa
    return Math.min(1, p2 + (p1 - p2) * pw);
  }
  const projecao = (s, t) => s.melds[t].reduce((a, m) => a + meldPts(m) + canastraBonus(m), 0) + s.reds[t].length * 100 - (s.mortoTaken[t] ? 0 : 100);
  // Parâmetros dos robôs fortes (ajustados por simulação: node sim-ajuste.js). Mestre = os mesmos movimentos com números afinados.
  const PARAMS = {
    dificil: { minPile: 1, pileWild: 2, wildDump: 14, parWild: 12, limpa4: 4, limpa6: 6, pairKeep: 30, meldKeep: 25, ptsW: 0.25, presBase: 8, presPer: 3, black3: -40, black3Pile: 2, wildCost: 70, jokerExtra: 20, lockPile: 6, lockCusto: 45, presMatch: 0, vivaW: 0, parceiroW: 0, hiper: 0, esconde: 0, escondeMao: 12, perigoMul: 1, aprende: 0, guardaPar: 0, guardaMao: 11 },
  };
  // Mestre: números afinados por simulação contra o Difícil (sim-ajuste.js). Joga limpo como o Difícil: só usa o que está à vista e na memória da mesa.
  PARAMS.mestre = Object.assign({}, PARAMS.dificil, {"minPile":1,"pileWild":2,"wildDump":14,"parWild":12,"limpa4":4,"limpa6":5,"pairKeep":30,"meldKeep":25,"ptsW":0.37,"presBase":8,"presPer":7.5,"black3":-40,"black3Pile":2,"wildCost":70,"jokerExtra":20,"lockPile":6,"lockCusto":0,"presMatch":0,"vivaW":8,"parceiroW":0,"hiper":0,"esconde":0,"escondeMao":12,"perigoMul":1.4,"aprende":0,"guardaPar":1,"guardaMao":11});
  function hardPlan(s, seat, P) {
    P = P || PARAMS.dificil;
    const hand = s.hands[seat]; const t = teamOf(s, seat); const o = 1 - t; const melds = s.melds[t];
    const need = needFor(s.scores[t]); const desc = s.descended[t];
    const used = new Set(melds.map((m) => m.rank));
    const n1 = (seat + 1) % s.n; // quem joga depois de mim (sempre adversário)
    // aprende com a mesa: quanto mais o outro time já levou do lixo nesta rodada, mais desconfiado (esconde cartas, entrega menos, tranca mais cedo)
    const levou = P.aprende && s.rstats ? s.rstats.reduce((a, st, i) => a + (teamOf(s, i) === o ? st.pile || 0 : 0), 0) : 0;
    const desconf = 1 + (P.aprende || 0) * Math.min(levou, 4);
    const oppAmeaca = s.mortoTaken[o] && s.melds[o].some((m) => m.canastra && m.clean) && s.hands.some((h, i) => teamOf(s, i) === o && h.length <= 4);
    if (s.step === 'draw') {
      const top = s.discard[s.discard.length - 1];
      if (top && !s.drawn && !s.owed && !lockedFor(s, seat) && s.pileTakes < 30 && !isWild(top) && !isBlack3(top)) {
        if (desc) {
          const same = hand.filter((c) => c.r === top.r);
          const jm = melds.find((x) => x.rank === top.r);
          if (same.length >= 2 && s.discard.length >= P.minPile) return { a: 'takePile', groups: [same.slice(0, 2).map((c) => c.id)], joinId: jm ? jm.id : undefined };
          const w = hand.find((c) => c.r === 2) || hand.find(isWild);
          if (same.length === 1 && w && s.discard.length >= P.pileWild) return { a: 'takePile', groups: [[same[0].id, w.id]], joinId: jm ? jm.id : undefined };
        } else {
          const gs = planGroups(hand.concat([top]), used, need, false);
          const gi = gs.findIndex((g) => g.some((c) => c.id === top.id));
          if (gi >= 0) {
            const ordered = [gs[gi]].concat(gs.filter((_, i) => i !== gi)).map((g) => g.filter((c) => c.id !== top.id).map((c) => c.id));
            if (ordered[0].length >= 2) return { a: 'takePile', groups: ordered };
          }
        }
      }
      return { a: 'draw' };
    }
    const nat = hand.filter((x) => !isWild(x) && !isBlack3(x));
    if (desc) {
      // 1) cartas naturais nos jogos do time
      // malícia: guarda na mão o par de uma figura que o time já tem na mesa (isca para levar o lixo quando alguém descartar essa figura), até a mão encher ou o jogo fechar a canastra
      const parNaMao = (c) => nat.filter((x) => x.r === c.r).length === 2;
      for (const c of nat) { const m = melds.find((x) => x.rank === c.r && !x.black); if (m && !(P.guardaPar && parNaMao(c) && m.cards.length < 6 && hand.length <= P.guardaMao && s.stock.length > 20 && !oppAmeaca)) return { a: 'addTo', meldId: m.id, ids: [c.id] }; }
      // 2) trincas naturais novas (limpas); par + coringa só quando a mão está grande ou o adversário ameaça bater
      const by = countBy(nat); const novos = [];
      for (const r in by) if (by[r].length >= 3 && !used.has(+r)) novos.push(by[r].map((c) => c.id));
      // malícia: trinca nova fica escondida na mão (isca para pegar o lixo quando alguém descartar a figura); só desce com a mão cheia, o monte acabando ou o outro time ameaçando
      const esconder = P.esconde && s.stock.length > P.esconde && hand.length <= P.escondeMao && !oppAmeaca;
      if (novos.length && !esconder) return { a: 'meld', groups: novos };
      const wilds = hand.filter(isWild);
      const temSuja = melds.some((m) => m.canastra && !m.clean), temLimpa = melds.some((m) => m.canastra && m.clean);
      // 3) coringa: fecha a canastra suja que falta para bater, ou despeja quando o outro time ameaça bater
      if (wilds.length) {
        const w = wilds.find((c) => c.r === 2) || wilds[0];
        if (!temSuja) { const alvo = melds.filter((m) => !m.canastra && !m.black && m.cards.length >= (temLimpa ? P.limpa4 : P.limpa6) && m.cards.length + wilds.length >= 7).sort((a, b) => b.cards.length - a.cards.length)[0]; if (alvo) return { a: 'addTo', meldId: alvo.id, ids: [w.id] }; }
        const vaiBater = s.mortoTaken[t] && temLimpa && temSuja;
        if (oppAmeaca || vaiBater || hand.length > P.wildDump) { const alvo = melds.find((m) => !m.black && (!m.clean || !m.canastra) && !(m.canastra && m.clean)) || melds.find((m) => !m.black && !m.clean); if (alvo) return { a: 'addTo', meldId: alvo.id, ids: [w.id] }; }
      }
      if (oppAmeaca || hand.length > P.parWild) {
        for (const r in by) if (by[r].length === 2 && !used.has(+r) && wilds.length) return { a: 'meld', groups: [by[r].map((c) => c.id).concat([wilds[0].id])] };
      }
    } else {
      const gs = planGroups(hand, used, need, false);
      if (gs.length) return { a: 'meld', groups: gs.map((g) => g.map((c) => c.id)) };
    }
    // descarte: o que menos ajuda o próximo adversário e menos me faz falta
    const by = countBy(nat); const pileN = s.discard.length;
    const temJogo = new Set(melds.map((m) => m.rank));
    const oppRanks = new Set(s.melds[o].map((m) => m.rank));
    const encaixam = P.presMatch ? s.discard.filter((x) => oppRanks.has(x.r)).length : 0;
    const presente = P.presBase + P.presPer * pileN + (P.presMatch || 0) * encaixam; // tamanho do presente que eu daria
    const opts = hand.map((c) => {
      let custo;
      if (isBlack3(c)) custo = P.black3 - pileN * P.black3Pile; // tranca o próximo e tira −100 da mão
      else if (isWild(c)) custo = P.wildCost + (c.r === 0 ? P.jokerExtra : 0);
      else {
        const k = by[c.r] ? by[c.r].length : 1;
        const guardar = (k >= 2 ? P.pairKeep : 0) + (temJogo.has(c.r) ? P.meldKeep : 0) + pts(c) * P.ptsW;
        const viva = P.vivaW ? (P.vivaW * Math.min(unseenOf(s, seat, c.r), 12) / 12) * (k >= 2 ? 1 : 0.5) : 0; // figura com muitas cópias ainda por aparecer vale guardar
        const pe = Math.min(1, perigo(s, seat, n1, c.r, P.hiper) * (P.perigoMul || 1) * desconf);
        custo = guardar + viva + pe * presente;
        // mesa de 4 ou 6: figura que o parceiro levou do lixo e ainda deve ter ajuda a ele (só pela memória da mesa, nunca pela mão dele)
        if (P.parceiroW && s.n >= 4 && s.known && (s.known[(seat + 2) % s.n] || []).includes(c.r)) custo -= P.parceiroW * (1 - pe);
      }
      return { c, custo };
    }).sort((a, b) => a.custo - b.custo);
    // lixo grande e todo descarte é perigoso: tranca com um 2 (coringa tranca até voltar a mim)
    const best = opts.find((x) => !isWild(x.c)) || opts[0];
    if (best && !isWild(best.c) && !isBlack3(best.c) && pileN >= Math.max(3, P.lockPile - (P.aprende ? levou : 0)) && best.custo > P.lockCusto) { const dois = hand.find((c) => c.r === 2); if (dois) return { a: 'discard', id: dois.id }; }
    if (!opts.length) return { a: 'draw' }; // mão vazia: nada a descartar (a regra recusa e o plano B assume)
    return { a: 'discard', id: (best || opts[0]).c.id };
  }

  // Jogada do robô já com plano B se a regra recusar a primeira ideia.
  function botMove(s, seat, level, forcar) {
    if (!forcar) level = (s.players[seat] && s.players[seat].lvl) || level;
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
    PARAMS, teamStats, newGame, nextRound, act, viewFor, botPlan, botMove, timeoutMove, suggestGroups, autoGroups, teamOf, teamSeats, canBater, mulberry, clone,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Samba = api;
})(typeof window !== 'undefined' ? window : globalThis);
