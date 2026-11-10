/* Samba da Tânia — Mata-mata da Casa (chave de 8 duplas contra robôs) e tabela do Campeonato da Família.
   Tudo como dados e funções puras sobre um objeto "t" (o torneio), guardado pela tela no aparelho.
   Dinheiro só pelo livro (Eco): inscrição ao entrar, prêmio uma vez por torneio. As partidas dos outros
   rodam em silêncio no motor (simularUma), uma por vez, fora do fio da tela. Vocabulário: inscrição e prêmio. */
(function (root) {
  'use strict';

  // prêmios: [campeão, vice, semifinal, quartas]
  const NIVEIS = {
    bronze: { id: 'bronze', nome: 'Bronze', insc: 200, premios: [700, 300, 100, 50], lvl: 'normal', adv: ['normal', 'normal'], parc: 'normal', vant: 0, abre: 2 }, // 19/10: medido com jogadora Normal: ~47% por partida
    prata: { id: 'prata', nome: 'Prata', insc: 500, premios: [1750, 750, 250, 125], lvl: 'normal', adv: ['dificil', 'normal'], parc: 'normal', vant: 0, abre: 3 }, // jogadora Difícil: ~49% por partida
    ouro: { id: 'ouro', nome: 'Ouro', insc: 1500, premios: [5250, 2250, 750, 375], lvl: 'dificil', adv: ['mestre', 'dificil'], parc: 'dificil', vant: 0, abre: 5, taca: true }, // jogadora Difícil: ~44% por partida (vantagem não pesa em partida de uma rodada)
  };
  const DUPLAS = [['Tânia', 'Marinho'], ['Dedé', 'Osni'], ['Pedro', 'Marcelo'], ['Cida', 'Beto'], ['Rita', 'Jorge'], ['Neusa', 'Toninho'], ['Vera', 'Chico']];
  const PARCEIROS = ['Tereza', 'Dirce', 'Ivone'];
  const RODADAS = ['Quartas de final', 'Semifinal', 'Final'];
  const COLOC = { 1: 'Campeã', 2: 'Vice', 3: 'Semifinal', 4: 'Quartas' };
  const MAX_INSC_DIA = 3;

  // Parceiro: um robô com nome que não está em nenhuma dupla adversária desta chave.
  function criar(nivel, myName, id) {
    const N = NIVEIS[nivel]; if (!N) return null;
    const usados = new Set(DUPLAS.flat());
    const parc = PARCEIROS.find((n) => !usados.has(n) && n !== myName) || 'Tereza';
    const duplas = [{ nomes: [myName || 'Você', parc], voce: true }].concat(DUPLAS.map((d) => ({ nomes: d.slice(), voce: false })));
    const t = { id: id || Date.now().toString(36), nivel, rodada: 0, status: 'andamento', coloc: 0, jogos: [], duplas, meu: null };
    t.jogos.push(pares([0, 1, 2, 3, 4, 5, 6, 7]));
    return t;
  }
  const pares = (ids) => { const out = []; for (let i = 0; i < ids.length; i += 2) out.push({ a: ids[i], b: ids[i + 1], w: null, placar: null, runId: null }); return out; };
  const nivel = (t) => NIVEIS[t.nivel];
  const rodadaAtual = (t) => t.jogos[t.rodada] || [];
  // A partida da jogadora nesta rodada (ou null se já caiu / já acabou).
  function minhaPartida(t) {
    if (t.status !== 'andamento') return null;
    return rodadaAtual(t).find((j) => j.a === 0 || j.b === 0) || null;
  }
  const adversario = (t, j) => t.duplas[j.a === 0 ? j.b : j.a];
  // Montagem da partida dela: uma rodada, duplas, robôs do nível (parceiro do mesmo nível), vantagem por partida.
  function configPartida(t, myName) {
    const j = minhaPartida(t); if (!j || j.w != null) return null;
    const N = nivel(t); const adv = adversario(t, j); const parc = t.duplas[0].nomes[1];
    const players = [{ name: myName || t.duplas[0].nomes[0], bot: false }, { name: adv.nomes[0], bot: true, lvl: N.adv[0] }, { name: parc, bot: true, lvl: N.parc }, { name: adv.nomes[1], bot: true, lvl: N.adv[1] }];
    const opts = { target: 1, mode: 'torneio' }; if (N.vant) opts.scores = [0, N.vant];
    return { players, opts, ctx: { mode: 'mm', id: t.id, lvl: N.lvl }, rodada: RODADAS[t.rodada], contra: adv.nomes.join(' e ') };
  }
  // Resultado da partida dela, pela view do fim do jogo. Idempotente por runId.
  function registrar(t, v) {
    const j = minhaPartida(t); if (!j || !v || v.phase !== 'gameEnd' || v.winner == null || v.winner < 0) return null;
    if (j.runId === v.runId && j.w != null) return { repeat: true };
    j.runId = v.runId; const venceu = v.winner === v.myTeam;
    j.w = venceu ? 0 : (j.a === 0 ? j.b : j.a);
    // placar sempre como [vencedor, perdedor], igual às partidas simuladas (a chave lê assim)
    j.placar = venceu ? [v.scores[v.myTeam], v.scores[1 - v.myTeam]] : [v.scores[1 - v.myTeam], v.scores[v.myTeam]];
    if (!venceu) { t.status = 'fim'; t.coloc = 4 - t.rodada; }
    else if (t.rodada === 2) { t.status = 'fim'; t.coloc = 1; }
    return { venceu, coloc: t.coloc, fim: t.status === 'fim' };
  }
  // Desistir no meio = derrota nesta rodada (sem reembolso).
  function desistir(t) {
    if (t.status !== 'andamento') return t;
    const j = minhaPartida(t); if (j && j.w == null) { j.w = j.a === 0 ? j.b : j.a; j.placar = null; }
    t.status = 'fim'; t.coloc = 4 - t.rodada; t.desistiu = true;
    // desistir antes de jogar a 1ª partida não paga nada (senão a 1ª inscrição grátis de cada nível rendia a consolação sem jogar)
    if (t.rodada === 0) t.semPremio = true;
    return t;
  }
  // Simula UMA partida pendente entre duplas de robôs (50–150 ms). Devolve true se simulou algo.
  function simularUma(t, S, rng) {
    const j = rodadaAtual(t).find((x) => x.w == null && x.a !== 0 && x.b !== 0); if (!j) return false;
    const N = nivel(t); const A = t.duplas[j.a].nomes, B = t.duplas[j.b].nomes;
    const ps = [{ name: A[0], bot: true, lvl: N.adv[0] }, { name: B[0], bot: true, lvl: N.adv[0] }, { name: A[1], bot: true, lvl: N.adv[1] }, { name: B[1], bot: true, lvl: N.adv[1] }];
    rng = rng || S.mulberry((Date.now() ^ (j.a * 131 + j.b * 17)) >>> 0);
    let g = S.newGame(ps, { target: 1, mode: 'torneio', rng });
    for (let i = 0; i < 20000 && g.phase !== 'gameEnd'; i++) {
      if (g.phase === 'roundEnd') { g = S.nextRound(g, rng).state; continue; }
      const r = S.botMove(g, g.turn); if (r.error) break; g = r.state;
    }
    if (g.phase !== 'gameEnd') { g.winner = rng() < 0.5 ? 0 : 1; g.scores = [0, 0]; }
    j.w = g.winner === 0 ? j.a : j.b; j.placar = g.winner === 0 ? [g.scores[0], g.scores[1]] : [g.scores[1], g.scores[0]];
    return true;
  }
  const pendentes = (t) => rodadaAtual(t).filter((x) => x.w == null && x.a !== 0 && x.b !== 0).length;
  // Quando a rodada inteira acabou, monta a próxima (ou encerra, se ela já caiu).
  function avancar(t) {
    const R = rodadaAtual(t); if (!R.length || R.some((x) => x.w == null)) return false;
    if (t.rodada >= 2) { if (t.status === 'andamento') { t.status = 'fim'; t.coloc = R[0].w === 0 ? 1 : 2; } return false; }
    t.jogos.push(pares(R.map((x) => x.w))); t.rodada++;
    if (t.status === 'fim') { // ela já caiu: as outras partidas seguem só para a chave ficar inteira
      t.jogos[t.rodada].forEach((x) => { if (x.a === 0 || x.b === 0) x.w = x.a === 0 ? x.b : x.a; });
    }
    return true;
  }
  const premio = (t) => (t.status === 'fim' && t.coloc && !t.semPremio ? nivel(t).premios[t.coloc - 1] : 0);
  const campeao = (t) => { const F = t.jogos[2]; return F && F[0] && F[0].w != null ? t.duplas[F[0].w] : null; };

  /* ---------- livro ---------- */
  const inscricoesHoje = (E) => E.find('inscricao:').filter((e) => e.day === E.today() && e.coins < 0).length;
  // Inscrição ao entrar: a primeira de cada nível é grátis ("Hoje a casa paga"); 3 pagas por dia.
  function inscrever(E, t) {
    const N = nivel(t); const code = 'casapaga:mm_' + t.nivel;
    if (!E.has(code)) { E.mark(code, t.id); return { ok: true, gratis: true }; }
    if (inscricoesHoje(E) >= MAX_INSC_DIA) return { error: 'Amanhã de novo' };
    const e = E.spend('inscricao:mm_' + t.nivel + ':' + t.id, N.insc, 0, 'Mata-mata ' + N.nome);
    return e ? { ok: true, gratis: false } : { error: 'Faltam moedas para esta inscrição.' };
  }
  const gratis = (E, nivelId) => !E.has('casapaga:mm_' + nivelId);
  // Prêmio uma vez por torneio; Taça do Mata-mata (Ouro) e Moldura Troféu para quem vence.
  function pagar(E, t) {
    if (t.status !== 'fim') return null;
    const N = nivel(t); const c = premio(t); const out = { coins: 0, lines: [], taca: false };
    if (c) { const e = E.grant('mm_premio:' + t.id, c, 0, 'Mata-mata ' + N.nome + ' · ' + COLOC[t.coloc]); if (e) { out.coins = c; out.lines.push(COLOC[t.coloc] + ' do Mata-mata ' + N.nome + ': +' + c + ' moedas'); } else out.repeat = true; }
    if (t.coloc === 1) {
      if (E.grant('premio_item:f_trofeu', 0, 0, 'Moldura Troféu')) out.lines.push('Moldura Troféu liberada na Loja');
      if (N.taca && E.mark('taca:mm:' + t.id, E.today())) { out.taca = true; out.lines.push('Taça do Mata-mata!'); }
    }
    return out;
  }

  // Esperança de retorno: n chaves sorteadas com probabilidade p de vencer cada partida (sem diamante).
  function ev(nivelId, p, n, rnd) {
    const N = NIVEIS[nivelId]; rnd = rnd || Math.random; let tot = 0;
    for (let i = 0; i < n; i++) { let r = 0; while (r < 3 && rnd() < p) r++; tot += r === 3 ? N.premios[0] : N.premios[3 - r]; }
    return tot / n / N.insc;
  }

  /* ---------- Campeonato da Família: tabela por pessoa ---------- */
  // jogos: [{ players:[{name, team}], scores:[a,b], winner, bater:[0/1 por cadeira] }]
  // vitória 3 pts, cada batida +1, saldo de pontos desempata.
  function tabelaFamilia(jogos) {
    const T = {};
    (jogos || []).forEach((g) => {
      (g.players || []).forEach((p, i) => {
        const nm = p.name; const r = T[nm] = T[nm] || { name: nm, pts: 0, v: 0, bat: 0, saldo: 0, bot: !!p.bot };
        const meu = g.scores[p.team], deles = g.scores[1 - p.team];
        if (g.winner === p.team) { r.pts += 3; r.v++; }
        const b = (g.bater && g.bater[i]) || 0; r.pts += b; r.bat += b;
        r.saldo += meu - deles;
      });
    });
    return Object.values(T).sort((a, b) => b.pts - a.pts || b.saldo - a.saldo || a.name.localeCompare(b.name)).map((r, i) => Object.assign(r, { pos: i + 1 }));
  }
  // Rotação "cada um com cada um" (4 pessoas): 3 jogos, cada um joga uma vez com cada parceiro.
  // Cadeiras pares formam um time: [A,B,C,D] → (A,C)x(B,D); [A,B,D,C] → (A,D)x(B,C); [A,C,B,D] → (A,B)x(C,D).
  function rotacao(lobby0, k) {
    const L = lobby0; if (L.length !== 4) return L.slice();
    return [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3]][k % 3].map((i) => L[i]);
  }
  // Fecha o campeonato: tabela de todos e colocação só entre as pessoas (robô completa a mesa, mas não ganha prêmio).
  function campFechar(jogos) {
    const tab = tabelaFamilia(jogos); let k = 0;
    tab.forEach((r) => { r.posP = r.bot ? 0 : ++k; });
    return { tabela: tab, pessoas: k };
  }
  // Cada celular confere: os placares que ele viu batem com os jogos que a anfitriã mandou?
  // vistos: { [jogo]: "nome:pontos|nome:pontos..." } guardados por este celular no fim de cada jogo.
  const assinatura = (g) => (g.players || []).map((p) => p.name + ':' + g.scores[p.team]).join('|');
  function campConfere(vistos, jogos) {
    if (!vistos || !jogos || !jogos.length) return false;
    return jogos.every((g, i) => vistos[i] === undefined || vistos[i] === assinatura(g)) && Object.keys(vistos).length > 0;
  }
  const FORMATOS = { todos: { id: 'todos', nome: 'Cada um com cada um', jogos: 3, target: 1, pessoas: [4], tempo: 'uns 40 min' }, duplas: { id: 'duplas', nome: 'Em duplas até 5.000', jogos: 1, target: 5000, pessoas: [4, 6], tempo: 'uns 35 min' } };


  /* ---------- Liga da Família: pontos corridos (todos contra todos, 1×1) e depois as finais ----------
     Quem quiser entra (pessoas e robôs). Cada duelo vale uma rodada; a final vale 3 rodadas somadas.
     Vitória 3 pontos, empate 1. Classificação: pontos, saldo, pontos feitos, confronto direto. Os 4 melhores vão às
     semifinais (1º×4º e 2º×3º); com 3 participantes é final direta (1º×2º); com 2 é só a final. */
  function ligaCalendario(ids) {
    const a = ids.slice(); if (a.length % 2) a.push(null); const n = a.length, out = [];
    for (let r = 0; r < n - 1; r++) {
      for (let i = 0; i < n / 2; i++) { const x = a[i], y = a[n - 1 - i]; if (x != null && y != null) out.push([x, y]); }
      a.splice(1, 0, a.pop()); // gira todos menos o primeiro
    }
    return out;
  }
  function ligaCriar(pessoas, nome) {
    const p = pessoas.map((x) => ({ id: x.id, name: x.name, bot: !!x.bot }));
    const L = { id: Date.now().toString(36), nome: nome || 'Liga da Família', p, jogos: [], fase: 'liga', fim: null };
    if (p.length < 2) return L;
    if (p.length === 2) { L.fase = 'final'; L.jogos.push({ k: 'final', a: p[0].id, b: p[1].id, res: null }); return L; }
    ligaCalendario(p.map((x) => x.id)).forEach(([a, b]) => L.jogos.push({ k: 'liga', a, b, res: null }));
    return L;
  }
  const vencedorDe = (res, a, b, pos) => (res.pa > res.pb ? a : res.pb > res.pa ? b : (pos[a] || 99) <= (pos[b] || 99) ? a : b); // empate no mata-mata: passa quem foi melhor na liga
  function ligaTabela(L) {
    const T = {}; L.p.forEach((x) => (T[x.id] = { id: x.id, name: x.name, bot: x.bot, j: 0, v: 0, e: 0, d: 0, pts: 0, pro: 0, contra: 0, saldo: 0 }));
    L.jogos.filter((g) => g.k === 'liga' && g.res).forEach((g) => {
      const A = T[g.a], B = T[g.b], r = g.res; A.j++; B.j++; A.pro += r.pa; A.contra += r.pb; B.pro += r.pb; B.contra += r.pa;
      if (r.pa > r.pb) { A.v++; A.pts += 3; B.d++; } else if (r.pb > r.pa) { B.v++; B.pts += 3; A.d++; } else { A.e++; B.e++; A.pts++; B.pts++; }
    });
    const lista = Object.values(T); lista.forEach((x) => (x.saldo = x.pro - x.contra));
    const h2h = (x, y) => { const g = L.jogos.find((q) => q.k === 'liga' && q.res && ((q.a === x.id && q.b === y.id) || (q.a === y.id && q.b === x.id))); if (!g) return 0; const px = g.a === x.id ? g.res.pa : g.res.pb, py = g.a === x.id ? g.res.pb : g.res.pa; return py - px; };
    lista.sort((x, y) => y.pts - x.pts || y.saldo - x.saldo || y.pro - x.pro || h2h(x, y) || x.name.localeCompare(y.name));
    return lista.map((x, i) => Object.assign(x, { pos: i + 1 }));
  }
  const ligaProximo = (L) => L.jogos.findIndex((g) => !g.res);
  // Registra o resultado do jogo i e abre a fase seguinte quando a atual acaba. res = { pa, pb } (pontos de cada lado).
  function ligaRegistrar(L, i, res) {
    const g = L.jogos[i]; if (!g || g.res) return L; g.res = { pa: res.pa | 0, pb: res.pb | 0, wo: !!res.wo };
    if (L.jogos.some((x) => !x.res)) return L;
    const tab = ligaTabela(L); const pos = {}; tab.forEach((x) => (pos[x.id] = x.pos));
    if (L.fase === 'liga') {
      if (tab.length >= 4) { L.fase = 'semi'; L.jogos.push({ k: 'semi', a: tab[0].id, b: tab[3].id, res: null }, { k: 'semi', a: tab[1].id, b: tab[2].id, res: null }); }
      else { L.fase = 'final'; L.jogos.push({ k: 'final', a: tab[0].id, b: tab[1].id, res: null }); }
    } else if (L.fase === 'semi') {
      const s = L.jogos.filter((x) => x.k === 'semi'); L.fase = 'final';
      L.jogos.push({ k: 'final', a: vencedorDe(s[0].res, s[0].a, s[0].b, pos), b: vencedorDe(s[1].res, s[1].a, s[1].b, pos), res: null });
    } else if (L.fase === 'final') {
      const f = L.jogos.find((x) => x.k === 'final'); const c = vencedorDe(f.res, f.a, f.b, pos); const v = c === f.a ? f.b : f.a;
      const semis = L.jogos.filter((x) => x.k === 'semi').map((s) => { const w = vencedorDe(s.res, s.a, s.b, pos); return w === s.a ? s.b : s.a; }).sort((x, y) => (pos[x] || 99) - (pos[y] || 99));
      L.fase = 'fim'; L.fim = { campeao: c, vice: v, terceiro: semis[0] || null, tabela: tab };
    }
    return L;
  }
  const ligaNome = (L, id) => { const x = L.p.find((q) => q.id === id); return x ? x.name : '?'; };

  const api = { ligaCalendario, ligaCriar, ligaTabela, ligaProximo, ligaRegistrar, ligaNome, NIVEIS, DUPLAS, RODADAS, COLOC, FORMATOS, MAX_INSC_DIA, criar, minhaPartida, adversario, configPartida, registrar, desistir, simularUma, pendentes, avancar, premio, campeao, inscrever, gratis, inscricoesHoje, pagar, ev, tabelaFamilia, rotacao, rodadaAtual, campFechar, campConfere, assinatura };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Torneios = api;
})(typeof window !== 'undefined' ? window : globalThis);
