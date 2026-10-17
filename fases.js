/* Samba da Tânia — "A Casa da Tânia": 48 fases em 6 cômodos, como dados.
   Ajustar vantagem, robôs ou objetivo é só mexer nesta tabela. Os códigos (R1/R2/R3/M3) nunca aparecem na tela.
   Fases.config(id) monta a partida contra robôs; Fases.avaliar(v, acc) diz as estrelas; Fases.registrar paga no livro (Eco). */
(function (root) {
  'use strict';

  // tipos de objetivo: [tipo, n]
  const TXT = {
    jogar: () => 'Terminar a rodada',
    vrod: () => 'Vencer a rodada',
    vjogo: () => 'Vencer o jogo',
    vrods: (n, f) => (n === 2 && f === 'R2' ? 'Vencer as 2 rodadas' : 'Vencer ' + n + ' das ' + (f === 'R3' ? 3 : 2) + ' rodadas'),
    can: (n, f) => (n === 1 ? 'Fazer 1 canastra' : n + ' canastras' + (f !== 'R1' ? ' no jogo' : '')),
    canL: (n, f) => (n === 1 ? '1 canastra limpa' : n + ' canastras limpas' + (f !== 'R1' ? ' no jogo' : '')),
    canS: () => '1 canastra suja',
    bater: (n, f) => (f === 'R1' ? 'Bater' : 'Bater ' + n + '×'),
    lixo: (n) => 'Pegar o lixo ' + n + '×',
    red: (n, f) => (n === 1 ? '1 três vermelho' : n + ' três vermelhos' + (f !== 'R1' ? ' no jogo' : '')),
    desce: (n, f) => (f === 'R1' ? 'Descer primeiro' : 'Descer primeiro nas ' + n + ' rodadas'),
    pts: (n, f) => n.toLocaleString('pt-BR') + '+ pontos' + (f === 'R1' ? ' na rodada' : ' numa rodada'),
    naodesce: () => 'O robô não desce',
  };
  const FORMATO = {
    R1: { tela: 'Uma rodada · uns 10 min', opts: { target: 1 } },
    R2: { tela: '2 rodadas · uns 20 min', opts: { maxRounds: 2 } },
    R3: { tela: '3 rodadas · uns 35 min', opts: { maxRounds: 3 } },
    M3: { tela: 'Até 3.000 · uns 20 min', opts: { target: 3000 } },
  };
  // [mesa, adversários, parceiros, vantagem, formato, nome, obj1, obj2, obj3]
  const F = 'facil', N = 'normal', D = 'dificil';
  const SALAS = [
    { n: 1, nome: 'Cozinha', tema: 0, moedas: 50, gems3: 1, taca: 'Panela de Ouro', enfeite: { id: 'v_xadrez', txt: 'verso "Xadrez da Cozinha"' }, chefe: 'Dona Nit', fases: [
      [2, F, null, 0, 'R1', 'Café da manhã', ['jogar'], ['can', 1], ['vrod']],
      [2, F, null, 0, 'R1', 'Pão na chapa', ['lixo', 1], ['vrod'], ['lixo', 2]],
      [2, F, null, 0, 'R1', 'Bule de café', ['vrod'], ['canL', 1], ['pts', 2000]],
      [2, F, null, 0, 'R1', 'Doce de leite', ['vrod'], ['red', 1], ['red', 2]],
      [2, F, null, 0, 'R1', 'Panela no fogo', ['vrod'], ['desce', 1], ['canS', 1]],
      [2, F, null, 0, 'R1', 'Fogão aceso', ['vrod'], ['bater', 1], ['pts', 2500]],
      [2, N, null, 0, 'R1', 'Duas panelas', ['vrod'], ['can', 2], ['canL', 2]],
      [2, N, null, 0, 'R2', 'A Cozinheira', ['vjogo'], ['bater', 1], ['pts', 3000]],
    ] },
    { n: 2, nome: 'Sala de estar', tema: 2, moedas: 60, gems3: 1, taca: 'Porta-retratos de Prata', enfeite: { id: 'm_tapete', txt: 'mesa "Tapete da Sala"' }, chefe: 'Zé', fases: [
      [4, F, N, 0, 'R1', 'Sofá', ['vrod'], ['can', 1], ['canL', 1]],
      [4, F, N, 0, 'R1', 'Televisão', ['vrod'], ['lixo', 2], ['pts', 3000]],
      [4, F, N, 0, 'R1', 'Porta-retratos', ['vrod'], ['red', 2], ['red', 3]],
      [4, N, N, 0, 'R1', 'Tapete', ['vrod'], ['can', 2], ['bater', 1]],
      [4, N, N, 0, 'R1', 'Rádio velho', ['vrod'], ['canS', 1], ['canL', 2]],
      [4, N, N, 0, 'R1', 'Cristaleira', ['vrod'], ['desce', 1], ['pts', 3500]],
      [4, N, N, 0, 'R1', 'Visita', ['vrod'], ['can', 3], ['bater', 1]],
      [4, N, N, 0, 'R2', 'O Vizinho', ['vjogo'], ['can', 4], ['bater', 1]],
    ] },
    { n: 3, nome: 'Varanda', tema: 8, moedas: 70, gems3: 1, taca: 'Regador Dourado', enfeite: { id: 'm_varanda', txt: 'mesa "Madeira da Varanda"' }, chefe: 'Seu Tião', especial: true, fases: [
      [4, N, N, 0, 'R1', 'Rede', ['vrod'], ['lixo', 2], ['canL', 1]],
      [4, N, N, 0, 'R1', 'Samambaia', ['vrod'], ['can', 2], ['bater', 1]],
      [4, N, N, 0, 'R1', 'Chá da tarde', ['vrod'], ['lixo', 3], ['pts', 3500]],
      [4, N, N, 0, 'R2', 'Vento', ['vjogo'], ['red', 3], ['vrods', 2]],
      [4, N, N, 0, 'R1', 'Pôr do sol', ['vrod'], ['desce', 1], ['bater', 1]],
      [4, N, F, 0, 'R1', 'Jardim', ['vrod'], ['canL', 2], ['can', 3]],
      [4, N, N, 0, 'M3', 'Festa junina', ['vjogo'], ['bater', 1], ['canL', 3]],
      [4, D, N, 0, 'R3', 'O Compadre', ['vjogo'], ['bater', 2], ['pts', 4000]],
    ] },
    { n: 4, nome: 'Quintal', tema: 9, moedas: 80, gems3: 1, taca: 'Espeto de Ouro', enfeite: { id: 'v_flores', txt: 'verso "Flores do Quintal"' }, chefe: 'Marlene', fases: [
      [6, N, N, 0, 'R1', 'Churrasqueira', ['vrod'], ['can', 2], ['lixo', 1]],
      [6, N, N, 0, 'R1', 'Varal', ['vrod'], ['can', 3], ['bater', 1]],
      [6, N, N, 0, 'R1', 'Mangueira', ['vrod'], ['red', 3], ['red', 4]],
      [6, N, F, 0, 'R1', 'Cachorro', ['vrod'], ['lixo', 3], ['canL', 2]],
      [6, D, N, 0, 'R1', 'Horta', ['vrod'], ['desce', 1], ['pts', 3500]],
      [6, D, N, 0, 'R1', 'Piscina de plástico', ['vrod'], ['can', 4], ['bater', 1]],
      [6, D, N, 0, 'R2', 'Aniversário', ['vjogo'], ['vrods', 2], ['bater', 2]],
      [6, D, N, 500, 'R3', 'A Comadre', ['vjogo'], ['can', 6], ['pts', 4000]],
    ] },
    { n: 5, nome: 'Clube', tema: 5, moedas: 90, gems3: 2, taca: 'Carteirinha Dourada', enfeite: { id: 'm_clube', txt: 'mesa "Piscina do Clube"' }, chefe: 'Lúcia', fases: [
      [2, D, null, 300, 'R1', 'Portaria', ['vrod'], ['canL', 1], ['bater', 1]],
      [4, D, N, 300, 'R1', 'Salão de jogos', ['vrod'], ['can', 3], ['pts', 3500]],
      [4, D, N, 500, 'R1', 'Quadra', ['vrod'], ['lixo', 2], ['canL', 2]],
      [6, D, N, 500, 'R1', 'Bar do clube', ['vrod'], ['red', 3], ['bater', 1]],
      [4, D, N, 500, 'R2', 'Baile', ['vjogo'], ['desce', 2], ['bater', 1]],
      [6, D, N, 500, 'R2', 'Piscina', ['vjogo'], ['can', 5], ['bater', 2]],
      [4, D, F, 600, 'R1', 'Campeonato interno', ['vrod'], ['canL', 2], ['pts', 4000]],
      [2, D, null, 1000, 'R3', 'A Presidente', ['vjogo'], ['bater', 2], ['pts', 3000]],
    ] },
    { n: 6, nome: 'Salão de Festas', tema: 6, moedas: 100, gems3: 2, taca: 'Taça Dona da Casa', enfeite: { id: 't_dona', txt: 'título "Dona da Casa"' }, chefe: 'A Festa', fases: [
      [4, D, N, 600, 'R1', 'Decoração', ['vrod'], ['canL', 2], ['bater', 1]],
      [6, D, N, 600, 'R1', 'Bolo', ['vrod'], ['can', 4], ['lixo', 3]],
      [4, D, N, 1000, 'R2', 'Música', ['vjogo'], ['bater', 1], ['pts', 4000]],
      [2, D, null, 600, 'R1', 'Brinde', ['vrod'], ['canL', 2], ['naodesce']],
      [6, D, N, 1000, 'R2', 'Dança', ['vjogo'], ['vrods', 2], ['bater', 2]],
      [4, D, N, 1000, 'R3', 'Fotos', ['vjogo'], ['canL', 5], ['bater', 2]],
      [4, D, F, 600, 'R1', 'Parabéns', ['vrod'], ['desce', 1], ['pts', 4000]],
      [6, D, N, 1500, 'R3', 'A Festa da Tânia', ['vjogo'], ['vrods', 2], ['bater', 2]],
    ] },
  ];
  // limiares de pontos por tamanho de mesa (provisórios até a simulação)
  const LIMIARES = { 2: [2000, 2500, 3000], 4: [3000, 3500, 4000], 6: [3500, 4000, 4500] };
  const NOMES_ADV = ['Zé', 'Marlene', 'Seu Tião', 'Lúcia', 'Cida', 'Beto'];
  const NOMES_PARC = ['Dona Nit', 'Rita', 'Jorge', 'Neusa'];
  const LV_ADJ = { facil: 'distraído', normal: '', dificil: 'afiado' };

  const FASES = [];
  SALAS.forEach((s) => s.fases.forEach((f, i) => {
    const id = s.n + '.' + (i + 1); const chefe = i === 7;
    FASES.push({ id, sala: s.n, idx: i + 1, chefe, mesa: f[0], adv: f[1], parc: f[2], vant: f[3], formato: f[4], nome: f[5], obj: [f[6], f[7], f[8]],
      moedas: s.moedas * (chefe ? 2 : 1), gems3: s.gems3 + (chefe ? 1 : 0) });
  }));
  const byId = (id) => FASES.find((f) => f.id === id) || null;
  const objTxt = (f, k) => { const o = f.obj[k]; return TXT[o[0]](o[1], f.formato); };

  // Quem senta onde: cadeira 0 é você; times alternam (pares contra ímpares).
  function seats(f, myName) {
    const n = f.mesa; const ps = [{ name: myName || 'Você', bot: false }];
    let adv, parc;
    if (f.id === '6.8') { adv = ['Lúcia', 'Marlene', 'Seu Tião']; parc = ['Dona Nit', 'Zé']; }
    else {
      const sala = SALAS[f.sala - 1];
      adv = NOMES_ADV.filter((x) => x !== sala.chefe); if (f.chefe) adv = [sala.chefe].concat(adv);
      else adv = adv.slice((f.idx - 1) % 3).concat(adv.slice(0, (f.idx - 1) % 3));
      parc = NOMES_PARC.filter((x) => x !== sala.chefe && adv.indexOf(x) < 0);
      if (f.sala === 1 && !f.chefe) adv = ['Dona Nit'].concat(adv); // na cozinha quem joga com você é a Dona Nit
    }
    let a = 0, p = 0;
    for (let i = 1; i < n; i++) {
      if (i % 2) ps.push({ name: adv[a++], bot: true, lvl: f.adv });
      else ps.push({ name: parc[p++], bot: true, lvl: f.parc || 'normal' });
    }
    return ps;
  }
  function config(id, myName) {
    const f = byId(id); if (!f) return null;
    const players = seats(f, myName);
    const opts = Object.assign({ mode: 'fase' }, FORMATO[f.formato].opts);
    if (f.vant) opts.scores = [0, f.vant];
    return { fase: f, players, opts, ctx: { mode: 'fase', id: f.id, lvl: f.adv } };
  }
  function cartao(f, myName) {
    const ps = seats(f, myName);
    const nm = (p) => p.name + (LV_ADJ[p.lvl] ? ' (' + LV_ADJ[p.lvl] + ')' : '');
    const contra = ps.filter((p, i) => i % 2).map(nm), com = ps.filter((p, i) => i && !(i % 2)).map(nm);
    const lista = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : a[0] || '');
    let tempo = FORMATO[f.formato].tela; if (f.formato === 'R1' && f.mesa === 6) tempo = 'Uma rodada · uns 15 min';
    return {
      titulo: f.id + ' · ' + f.nome, tempo,
      quem: f.id === '6.8' ? 'Contra: ' + lista(contra) + ' · Dona Nit e Zé vieram ajudar você' : 'Contra: ' + lista(contra) + (com.length ? ' · Com você: ' + lista(com) : ''),
      vantagem: f.vant ? 'Eles começam na frente, com ' + f.vant.toLocaleString('pt-BR') + ' pontos. Dá para virar.' : '',
      longa: f.formato === 'R3' ? 'Essa fase leva uns 35 minutos. Dá para parar e continuar depois.' : '',
      objetivos: [0, 1, 2].map((k) => objTxt(f, k)),
      frase: 'As três estrelas: tudo isso numa partida só.',
      empate: f.formato === 'R1' ? 'Se a rodada empatar, joga-se outra.' : '',
    };
  }

  /* ---------- acumulado da partida (por roundEnd) ---------- */
  // acc: { rounds:[{pts, won, desc}], key } guardado junto do run da fase.
  function acumular(acc, v) {
    acc = acc || { rounds: [] };
    if (!v.roundResult) return acc;
    const k = (v.runId || '') + ':' + v.round; if (acc.rounds.some((r) => r.k === k)) return acc;
    const t = v.myTeam; const rt = v.roundResult.teams;
    acc.rounds.push({ k, pts: rt[t].total, won: rt[t].total > rt[1 - t].total, desc: v.firstDesc === t, oppDesc: !!(v.descended && v.descended[1 - t]) });
    return acc;
  }
  function teamSum(list, players, t) { const o = {}; (list || []).forEach((st, i) => { if (players[i] && players[i].team === t) for (const k in st) o[k] = (o[k] || 0) + st[k]; }); return o; }
  // Estrelas: ⭐ = obj1; ⭐⭐ = obj1 e obj2; ⭐⭐⭐ = os três, na mesma partida.
  function avaliar(f, v, acc) {
    if (typeof f === 'string') f = byId(f);
    acc = acumular(acc, v);
    const t = v.myTeam; const gs = teamSum(v.gstats, v.players, t); const rs = acc.rounds;
    const fim = v.phase === 'gameEnd';
    const one = (o) => {
      const n = o[1] || 1;
      switch (o[0]) {
        case 'jogar': return rs.length >= 1;
        case 'vrod': return fim && (v.winner === t);
        case 'vjogo': return fim && v.winner === t;
        case 'vrods': return rs.filter((r) => r.won).length >= n;
        case 'can': return (gs.canL || 0) + (gs.canS || 0) + (gs.canB || 0) >= n;
        case 'canL': return (gs.canL || 0) >= n;
        case 'canS': return (gs.canS || 0) >= n;
        case 'bater': return (gs.bater || 0) >= n;
        case 'lixo': return (gs.pile || 0) >= n;
        case 'red': return (gs.reds || 0) >= n;
        case 'desce': return rs.filter((r) => r.desc).length >= n;
        case 'pts': return rs.some((r) => r.pts >= n);
        case 'naodesce': return fim && rs.length > 0 && rs.every((r) => !r.oppDesc);
        default: return false;
      }
    };
    const checks = f.obj.map(one);
    const stars = checks[0] ? (checks[1] ? (checks[2] ? 3 : 2) : 1) : 0;
    return { stars, checks, acc };
  }

  /* ---------- mapa: o que está aberto ---------- */
  const starsOf = (E, id) => (E.has('estrela:' + id + ':3') ? 3 : E.has('estrela:' + id + ':2') ? 2 : E.has('estrela:' + id + ':1') ? 1 : 0);
  const salaStars = (E, n) => FASES.filter((f) => f.sala === n).reduce((a, f) => a + starsOf(E, f.id), 0);
  const salaAberta = (E, n) => n === 1 || starsOf(E, (n - 1) + '.8') >= 1;
  const salaCompleta = (E, n) => FASES.filter((f) => f.sala === n).every((f) => starsOf(E, f.id) >= 1);
  function aberta(E, id) {
    const f = byId(id); if (!f || !salaAberta(E, f.sala)) return false;
    return f.chefe ? salaStars(E, f.sala) >= 7 : true;
  }
  function barra(E, n) {
    const s = SALAS[n - 1]; const st = salaStars(E, n);
    const chefe = n === 6 ? 'A Festa da Tânia' : s.chefe;
    if (st < 7) return 'Junte 7 estrelas para chamar ' + (n === 6 ? 'A Festa da Tânia' : (s.chefe === 'Zé' || s.chefe === 'Seu Tião' ? 'o ' : 'a ') + s.chefe) + ': ' + st + ' de 7';
    if (starsOf(E, n + '.8') < 1) return n < 6 ? 'Vença ' + (s.chefe === 'Zé' || s.chefe === 'Seu Tião' ? 'o ' : 'a ') + s.chefe + ' para abrir ' + (['a ', 'a ', 'o ', 'o ', 'o '][n - 1]) + SALAS[n].nome : 'Vença ' + chefe + '!';
    return st + ' de 24 estrelas neste cômodo';
  }
  function proxima(E) {
    for (const f of FASES) if (aberta(E, f.id) && starsOf(E, f.id) === 0) return f;
    for (const f of FASES) if (aberta(E, f.id) && starsOf(E, f.id) < 3) return f;
    return FASES[0];
  }

  /* ---------- registrar o resultado no livro (no fim do jogo) ---------- */
  // Idempotente: cada estrela, 3 estrelas, cômodo e taça têm chave única no livro.
  function registrar(E, id, v, acc) {
    const f = byId(id); if (!f || v.phase !== 'gameEnd') return null;
    const r = avaliar(f, v, acc); const out = { stars: r.stars, checks: r.checks, coins: 0, gems: 0, lines: [], novas: 0, tacas: [] };
    const k = 'fimfase:' + (v.runId || '') ;
    if (!E.has(k)) { E.mark(k, f.id); if (v.winner === v.myTeam) E.camp('wins', f.id); }
    for (let s = 1; s <= r.stars; s++) {
      const e = E.grant('estrela:' + f.id + ':' + s, f.moedas, 0, f.nome);
      if (e) { out.coins += f.moedas; out.novas++; }
    }
    if (r.stars === 3) { const e = E.grant('tres:' + f.id, 0, f.gems3, f.nome); if (e) { out.gems += f.gems3; out.lines.push('Façanha! +' + f.gems3 + ' diamante' + (f.gems3 > 1 ? 's' : '')); } }
    const sala = SALAS[f.sala - 1];
    if (salaCompleta(E, f.sala)) {
      const e = E.grant('sala:' + f.sala, 300, 0, sala.nome);
      if (e) { out.coins += 300; out.tacas.push(sala.taca); E.grant('premio_item:' + sala.enfeite.id, 0, 0, sala.enfeite.txt); out.lines.push('Cômodo completo! +300 moedas, ' + sala.taca + ' e ' + sala.enfeite.txt); }
    }
    if (salaStars(E, f.sala) >= 24) { const e = E.grant('perfeito:' + f.sala, 0, 5, sala.nome); if (e) { out.gems += 5; out.lines.push('Cômodo perfeito! +5 diamantes'); } }
    if (f.id === '6.8' && v.winner === v.myTeam) {
      const e = E.grant('festa68', 2000, 10, 'A Festa da Tânia');
      if (e) { out.coins += 2000; out.gems += 10; E.grant('premio_item:t_dona', 0, 0, 'Dona da Casa'); E.grant('premio_item:m_tania', 0, 0, 'Mesa da Tânia'); out.lines.push('Dona da Casa! +2.000 moedas, +10 diamantes e a Mesa da Tânia'); }
    }
    if (f.sala === 3 && salaCompleta(E, 3) && !E.has('especial_sala3')) out.escolherPresente = true;
    return out;
  }

  const api = { SALAS, FASES, FORMATO, LIMIARES, byId, objTxt, config, cartao, seats, avaliar, acumular, starsOf, salaStars, salaAberta, salaCompleta, aberta, barra, proxima, registrar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Fases = api;
})(typeof window !== 'undefined' ? window : globalThis);
