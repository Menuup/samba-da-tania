/* Samba da Tânia — O Matemático: guarda um resumo de cada rodada jogada contra robôs e mostra, com contas, de onde vem a diferença
   entre você e eles (canastras, lixo, batidas, pontos que sobram na mão...). Tudo no aparelho; nada sai sem a pessoa copiar o relatório. */
(function (root) {
  'use strict';
  const COMP = [['meldPts', 'Pontos dos jogos baixados', 1], ['bonus', 'Bônus de canastras', 1], ['bater', 'Bônus de bater', 1], ['redPts', 'Três vermelhos', 1], ['handPts', 'Cartas que sobraram na mão', -1], ['penalty', 'Morto não pego', -1]];
  const EST = [['pile', 'Lixos levados', 'lixos'], ['canL', 'Canastras limpas', 'limpas'], ['canS', 'Canastras sujas', 'sujas'], ['melds', 'Jogos baixados', 'jogos'], ['reds', 'Três vermelhos', 'vermelhos'], ['draws', 'Cartas compradas', 'compras']];
  // Médias por cadeira de um robô Mestre contra outro Mestre (simulação de 150 rodadas, sim-base.js): a régua para comparar.
  const BASE = { mestre: { '1x1': { rodada: 2246, pile: 1.7, canL: 1.6, canS: 1.9, melds: 7.8, vezes: 24, bateu: 0.48 }, '2x2': { rodada: 2492, pile: 1.0, canL: 1.0, canS: 1.1, melds: 3.9, vezes: 11, bateu: 0.53 } } };

  // Guarda o resumo de uma rodada a partir da vista da tela (v). Devolve o registro ou null.
  function registro(v, extra) {
    if (!v || (v.phase !== 'roundEnd' && v.phase !== 'gameEnd') || !v.roundResult || !v.players) return null;
    const bots = v.players.filter((p) => p.bot).length; const humanos = v.players.length - bots;
    const teams = v.roundResult.teams; const seat = v.seat; const mt = v.myTeam;
    const outros = v.players.map((p, i) => i).filter((i) => v.players[i].team !== mt);
    const st = v.stats || []; const soma = (ids, k) => ids.reduce((a, i) => a + ((st[i] && st[i][k]) || 0), 0);
    const r = { id: (v.runId || '') + ':' + v.round, t: Date.now(), n: v.players.length, solo: !!v.solo, bots, humanos, lvl: (extra && extra.lvl) || null, mesa: v.players.length === 2 ? '1x1' : v.players.length === 4 ? '2x2' : v.players.length === 6 ? '3x3' : 'solo',
      eu: teams[mt], contra: outros.length ? { meldPts: 0, bonus: 0, bater: 0, redPts: 0, handPts: 0, penalty: 0, total: 0 } : null, jogo: v.phase === 'gameEnd', ganhouJogo: v.phase === 'gameEnd' ? v.winner === mt : null };
    // adversários: média por time adversário (em 2x2 é o time inteiro; no solo, a média dos dois)
    const outT = teams.map((x, i) => i).filter((i) => i !== mt);
    if (r.contra) outT.forEach((i) => { for (const k in r.contra) r.contra[k] += teams[i][k] / outT.length; });
    r.estEu = {}; r.estOutros = {};
    EST.forEach(([k]) => { r.estEu[k] = (st[seat] && st[seat][k]) || 0; r.estOutros[k] = outros.length ? soma(outros, k) / outros.length : 0; });
    const tv = v.turnos || []; r.vezesEu = tv[seat] || 0; r.vezesOutros = outros.length ? outros.reduce((a, i) => a + (tv[i] || 0), 0) / outros.length : 0;
    r.bateuEu = v.roundResult.outSeat != null && v.players[v.roundResult.outSeat].team === mt; r.bateuOutro = v.roundResult.outSeat != null && !r.bateuEu; r.monte = !!v.roundResult.stockOut;
    r.ganhou = teams[mt].total > Math.max(...outT.map((i) => teams[i].total));
    r.log = ((extra && extra.log) || v.log || []).slice(-120).map((x) => x.t || x);
    return r;
  }
  // Só rodadas de pessoa contra robôs entram na conta.
  const validas = (lista) => (lista || []).filter((r) => r.humanos === 1 && r.bots >= 1 && r.contra);
  const media = (lista, f) => (lista.length ? lista.reduce((a, r) => a + f(r), 0) / lista.length : 0);

  // As contas: média por rodada de cada coisa, a diferença contra os robôs e quanto cada coisa explica da vantagem.
  function analisar(lista) {
    const L = validas(lista); const n = L.length; if (!n) return { n: 0 };
    const comps = COMP.map(([k, nome, sinal]) => { const eu = media(L, (r) => sinal * r.eu[k]), ro = media(L, (r) => sinal * r.contra[k]); return { k, nome, eu, ro, dif: eu - ro }; });
    const totalEu = media(L, (r) => r.eu.total), totalRo = media(L, (r) => r.contra.total), vant = totalEu - totalRo;
    const ests = EST.map(([k, nome, curto]) => { const eu = media(L, (r) => r.estEu[k]), ro = media(L, (r) => r.estOutros[k]); return { k, nome, curto, eu, ro, dif: eu - ro }; });
    const vitorias = L.filter((r) => r.ganhou).length;
    const jogos = L.filter((r) => r.jogo); const jogosG = jogos.filter((r) => r.ganhouJogo).length;
    const bateuEu = L.filter((r) => r.bateuEu).length, bateuOutro = L.filter((r) => r.bateuOutro).length;
    const vezesEu = media(L.filter((r) => r.bateuEu), (r) => r.vezesEu), vezesOutro = media(L.filter((r) => r.bateuOutro), (r) => r.vezesOutros);
    const sobraRobo = media(L.filter((r) => r.bateuEu), (r) => -r.contra.handPts);
    // frases: as 4 maiores diferenças em pontos, em português
    const ordem = comps.slice().sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
    const frases = [];
    ordem.slice(0, 4).forEach((c) => { if (Math.abs(c.dif) < 30) return; frases.push(`${c.dif > 0 ? '✅' : '⚠️'} ${c.nome}: você ${Math.round(c.eu)} por rodada, eles ${Math.round(c.ro)} (${c.dif > 0 ? '+' : ''}${Math.round(c.dif)}).`); });
    const lixo = ests.find((e) => e.k === 'pile'); if (lixo && Math.abs(lixo.dif) >= 0.3) frases.push(`${lixo.dif > 0 ? '✅' : '⚠️'} Lixo: você leva ${lixo.eu.toFixed(1)} vezes por rodada, eles ${lixo.ro.toFixed(1)}.`);
    if (bateuEu + bateuOutro) frases.push(`${bateuEu >= bateuOutro ? '✅' : '⚠️'} Quem bate: você ${bateuEu} de ${bateuEu + bateuOutro} rodadas${vezesEu ? ` (em média na vez ${vezesEu.toFixed(0)})` : ''}; eles ${bateuOutro}${vezesOutro ? ` (na vez ${vezesOutro.toFixed(0)})` : ''}.`);
    if (bateuEu && sobraRobo > 40) frases.push(`🧮 Quando você bate, sobram em média ${Math.round(sobraRobo)} pontos na mão dos robôs: é pontuação que eles perdem sem ter descartado.`);
    // a regra de ouro: o que mais pesa na diferença
    const maior = comps.filter((c) => c.dif > 0).sort((a, b) => b.dif - a.dif)[0];
    const resumo = maior ? `O que mais separa você dos robôs: ${maior.nome.toLowerCase()} (+${Math.round(maior.dif)} por rodada).` : 'Você e os robôs estão parelhos nas contas.';
    return { n, vitorias, pct: Math.round(100 * vitorias / n), jogos: jogos.length, jogosG, totalEu, totalRo, vant, comps, ests, bateuEu, bateuOutro, vezesEu, vezesOutro, frases, resumo };
  }
  const guardar = (lista, r) => { if (!r) return lista; if (lista.some((x) => x.id === r.id)) return lista; const o = lista.concat([r]); return o.slice(-80); };
  // Relatório para colar numa conversa: a análise e as últimas rodadas com o que aconteceu.
  function relatorio(lista) {
    const a = analisar(lista); const L = validas(lista).slice(-6);
    return JSON.stringify({ versao: 1, quando: new Date().toISOString(), analise: { n: a.n, pct: a.pct, vant: Math.round(a.vant || 0), comps: (a.comps || []).map((c) => [c.k, Math.round(c.eu), Math.round(c.ro)]), ests: (a.ests || []).map((e) => [e.k, +e.eu.toFixed(2), +e.ro.toFixed(2)]), bateu: [a.bateuEu, a.bateuOutro] }, rodadas: L.map((r) => ({ mesa: r.mesa, lvl: r.lvl, eu: r.eu.total, contra: Math.round(r.contra.total), ganhou: r.ganhou, bateuEu: r.bateuEu, vezes: [r.vezesEu, Math.round(r.vezesOutros)], log: r.log.slice(-60) })) });
  }
  const api = { COMP, EST, BASE, registro, validas, analisar, guardar, relatorio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Analise = api;
})(typeof window !== 'undefined' ? window : globalThis);
