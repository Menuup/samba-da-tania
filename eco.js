/* Samba da Tânia — economia do jogo: moedas, diamantes, livro-razão, presente do dia e missões.
   Sem dinheiro de verdade em nada. A carteira é sempre a soma do livro-razão (nunca um número guardado).
   Cada lançamento leva um hash encadeado com o anterior: editar um saldo exige reescrever a cadeia.
   Roda no navegador (window.Eco) e no Node (testes: Eco.create({ storage, ns, now })). */
(function (root) {
  'use strict';

  const SAL = 'samba-da-tania-63';
  // Constantes da economia num lugar só (ajustar aqui). Moedas e diamantes só valem dentro do jogo.
  const CFG = {
    INICIAL_MOEDAS: 630, INICIAL_DIAMANTES: 3,
    ENTRADAS_MESA: [50, 100, 200, 500], ENTRADA_MIN: 50,   // mesa online valendo moedas (robôs e treino: grátis)
    COFRINHO_ABAIXO_DE: 50, COFRINHO_HORAS: 3, COFRINHO_MOEDAS: 300,
    BONUS_HORAS: 4, BONUS_MOEDAS: 60, BONUS_ACUMULA: 1,
    // Giro da Sorte: só duplas (4 cadeiras pagam; a casa paga as dos robôs). Prêmio total = entrada × roleta,
    // dividido pela dupla vencedora. Média 3,717x sobre 4 entradas: a casa devolve 92,9%.
    GIRO_ENTRADAS: [50, 100, 200, 500], GIRO_ALVO: 1500, GIRO_CADEIRAS: 4, GIRO_ROBO: 'dificil', GIRO_VANTAGEM: 100, // a dupla dos robôs começa com 100 pontos
    GIRO_PESOS: [[2, 55.1], [3, 28], [5, 10], [10, 5], [25, 1.5], [100, 0.4]],
  };
  const H20 = 20 * 3600 * 1000;
  const FRASE = 'Moeda você ganha jogando. Diamante é raro: vem de façanha e compra o que é especial.';

  // FNV-1a 32 bits, em hexadecimal: rápido, síncrono e igual em qualquer aparelho.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const dayKey = (t) => { const d = new Date(t); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
  // segunda-feira da semana (chave da "semana cheia")
  const weekKey = (t) => { const d = new Date(t); const wd = (d.getDay() + 6) % 7; d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - wd); return dayKey(d.getTime()); };

  /* ---------- tabelas (iguais ao spec) ---------- */
  const PAGA = { facil: 40, normal: 60, dificil: 60, vantagem: 80, vantagemVenceu: 20 };
  const EXTRA = { venceu: 30, bateu: 20, limpa: 10, limpaMax: 5, red: 5, redMax: 4, jogo: 60, familia: 20, familiaDia: 3 };
  const TETO_RODADAS = 8;
  const DUR_MIN = 240 * 1000;
  const MISSOES = {
    pequena: { coins: 30, xp: 20, banco: [
      { id: 'p_rodada', txt: 'Jogue 1 rodada', k: 'rodadas', n: 1 },
      { id: 'p_lixo', txt: 'Pegue o lixo 1 vez', k: 'pile', n: 1 },
      { id: 'p_canastra', txt: 'Faça 1 canastra', k: 'can', n: 1 },
      { id: 'p_red', txt: 'Ponha 1 três vermelho na mesa', k: 'reds', n: 1 },
      { id: 'p_desce', txt: 'Desça primeiro 1 vez', k: 'descFirst', n: 1 },
    ] },
    media: { coins: 50, xp: 30, banco: [
      { id: 'm_vence', txt: 'Vença 1 rodada', k: 'venceu', n: 1 },
      { id: 'm_limpa', txt: 'Faça 1 canastra limpa', k: 'canL', n: 1 },
      { id: 'm_lixo2', txt: 'Pegue o lixo 2 vezes', k: 'pile', n: 2 },
      { id: 'm_desafio', txt: 'Jogue o Desafio do Dia', k: 'desafio', n: 1 },
      { id: 'm_seis', txt: 'Jogue uma mesa de 6 pessoas', k: 'seis', n: 1 },
      { id: 'm_3000', txt: 'Faça 3.000 pontos numa rodada', k: 'pontos', n: 3000, max: true },
    ] },
    grande: { coins: 80, xp: 50, banco: [
      { id: 'g_bate', txt: 'Bata 1 vez', k: 'bater', n: 1 },
      { id: 'g_limpas', txt: 'Faça 2 canastras limpas numa rodada', k: 'canLRodada', n: 2, max: true },
      { id: 'g_jogo', txt: 'Vença um jogo inteiro', k: 'jogo', n: 1 },
      { id: 'g_3rod', txt: 'Jogue 3 rodadas', k: 'rodadas', n: 3 },
      { id: 'g_familia', txt: 'Jogue com alguém da família', k: 'familia', n: 1 },
    ] },
  };
  const TAM = ['pequena', 'media', 'grande'];
  // títulos fixados em níveis 5/10/20/35 (FX.title)
  const TITULO_NIVEIS = [5, 10, 20, 35];

  function create(cfg) {
    cfg = cfg || {};
    const ns = cfg.ns || '';
    const now = cfg.now || (() => Date.now());
    const store = cfg.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const KEY = ns + 'eco';
    const fresh = () => ({ v: 1, ledger: [], missions: null, campaign: { tries: {}, abandons: {}, wins: {} }, equip: {}, seen: {} });
    const read = () => {
      try { const raw = store && store.getItem(KEY); if (!raw) return null; const o = JSON.parse(raw); return o && Array.isArray(o.ledger) ? o : null; } catch (e) { return null; }
    };
    const write = (st) => { try { if (store) store.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
    const state = () => read() || fresh();
    const lastH = (L) => (L.length ? L[L.length - 1].h : '0');
    const entryHash = (prev, e) => hash(prev + '|' + e.t + '|' + e.code + '|' + e.coins + '|' + e.gems + '|' + (e.ref || '') + '|' + SAL);

    // Confere a cadeia inteira; devolve o índice do primeiro lançamento quebrado ou -1.
    function verify(L) {
      let prev = '0';
      for (let i = 0; i < L.length; i++) { if (L[i].h !== entryHash(prev, L[i])) return i; prev = L[i].h; }
      return -1;
    }
    function baseKeys(L) { const b = L.length && L[0].code === 'base' ? L[0] : null; return b && Array.isArray(b.keys) ? b.keys : []; }
    function hasIn(L, code) { return L.some((e) => e.code === code) || baseKeys(L).includes(code); }

    const E = {
      CFG, FRASE, PAGA, EXTRA, MISSOES, TETO_RODADAS, hash, dayKey, weekKey,
      onChange: null,
      frozen: false,
    };
    const changed = () => { if (typeof E.onChange === 'function') try { E.onChange(); } catch (e) {} };

    E.raw = () => state();
    E.ledger = () => state().ledger.slice();
    E.ok = () => verify(state().ledger) < 0;
    // Carteira = soma do livro. Se a cadeia quebrou, só vale o que está antes da quebra.
    E.wallet = () => {
      const L = state().ledger; const bad = verify(L); const upto = bad < 0 ? L.length : bad;
      let coins = 0, gems = 0;
      for (let i = 0; i < upto; i++) { coins += L[i].coins; gems += L[i].gems; }
      return { coins, gems, ok: bad < 0 };
    };
    E.has = (code) => hasIn(state().ledger, code);
    E.count = (prefix, day) => state().ledger.filter((e) => e.code.indexOf(prefix) === 0 && (!day || e.day === day)).length;
    E.find = (prefix) => state().ledger.filter((e) => e.code.indexOf(prefix) === 0);
    // Relógio do celular voltou? Congela os ganhos (só joga).
    E.clockBack = () => { const L = state().ledger; return L.length > 0 && now() < L[L.length - 1].t - 60000; };

    // Lançamento novo: relê o livro, confere a chave única e só então grava com o hash encadeado.
    function post(code, coins, gems, ref, allowNeg) {
      const st = state(); const L = st.ledger;
      if (hasIn(L, code)) return null;
      const t = now();
      if (L.length && t < L[L.length - 1].t - 60000) { E.frozen = true; return null; }
      if (!allowNeg) { coins = Math.max(0, coins | 0); gems = Math.max(0, gems | 0); }
      const e = { t, day: dayKey(t), code: String(code), coins: coins | 0, gems: gems | 0, ref: ref == null ? '' : String(ref).slice(0, 60) };
      e.h = entryHash(lastH(L), e);
      L.push(e);
      if (L.length > 500) compact(st);
      write(st); changed();
      return e;
    }
    // Compactação: os lançamentos antigos viram um lançamento "base" com o saldo e as chaves únicas.
    function compact(st) {
      const L = st.ledger; const keep = L.slice(-200); const old = L.slice(0, L.length - 200);
      let coins = 0, gems = 0; const keys = baseKeys(old).slice();
      old.forEach((e) => { coins += e.coins; gems += e.gems; if (e.code !== 'base' && !/^rodada:|^familia:/.test(e.code)) keys.push(e.code); });
      const base = { t: old.length ? old[old.length - 1].t : now(), day: '', code: 'base', coins, gems, ref: 'compactado', keys };
      base.h = entryHash('0', base);
      const out = [base]; let prev = base.h;
      keep.forEach((e) => { const n = Object.assign({}, e); n.h = entryHash(prev, n); prev = n.h; out.push(n); });
      st.ledger = out;
    }
    E.grant = (code, coins, gems, ref) => post(code, coins || 0, gems || 0, ref, false);
    // Gasto: só sai se houver saldo. Devolve o lançamento ou null.
    E.spend = (code, coins, gems, ref) => {
      const w = E.wallet(); coins = coins | 0; gems = gems | 0;
      if (w.coins < coins || w.gems < gems) return null;
      return post(code, -coins, -gems, ref, true);
    };
    E.mark = (code, ref) => post(code, 0, 0, ref, false); // registro sem valor (ex.: "Desafio iniciado")

    /* ---------- carteira inicial e prêmio de veterano ---------- */
    // profile: FX.profile(). Devolve { msg, kind } para a tela mostrar uma vez, ou null.
    E.init = (profile, saveClaim) => {
      const st = read();
      if (st && st.ledger.length) return null;
      profile = profile || {};
      if (profile.ecoClaimedAt) {
        write(fresh()); E.mark('apagada', profile.ecoClaimedAt);
        return { kind: 'apagada', msg: "Sua carteira foi apagada neste celular. Use 'Levar meu jogo para outro celular' para recuperar." };
      }
      write(fresh());
      E.grant('inicial', CFG.INICIAL_MOEDAS, CFG.INICIAL_DIAMANTES, 'carteira inicial');
      let msg = null;
      const rounds = +profile.rounds || 0, wins = +profile.wins || 0, xp = +profile.xp || 0;
      if (rounds > 0 && xp >= 10 * rounds) {
        const coins = Math.min(2000, rounds * 20 + wins * 100);
        const lvl = typeof cfg.level === 'function' ? cfg.level(xp) : 1;
        const gems = Math.min(5, Math.max(0, lvl - 1));
        E.grant('veterano', coins, gems, rounds + ' rodadas');
        msg = { kind: 'veterano', coins, gems, msg: 'Você já jogou ' + rounds + ' rodadas antes de existir moeda. Toma o que é seu.' };
      }
      if (typeof saveClaim === 'function') try { saveClaim(now()); } catch (e) {}
      return msg;
    };

    /* ---------- presente do dia ---------- */
    // Pode abrir hoje? (1 por dia, com 20 h desde o anterior)
    E.giftReady = () => {
      if (E.clockBack()) return false;
      const gs = E.find('presente:'); const t = now();
      if (gs.some((g) => g.day === dayKey(t))) return false;
      return !gs.length || t - gs[gs.length - 1].t >= H20;
    };
    E.giftCount = () => E.find('presente:').length + (baseKeys(state().ledger).filter((k) => k.indexOf('presente:') === 0).length);
    E.openGift = () => {
      if (!E.giftReady()) return null;
      const t = now(); const e = E.grant('presente:' + dayKey(t), 60, 0, 'presente do dia');
      if (!e) return null;
      const n = E.giftCount(); let big = null;
      if (n % 7 === 0) big = E.grant('presente_grande:' + n, 200, 2, 'presente grande');
      const faltam = 7 - (n % 7);
      return { coins: 60, big: !!big, n, faltam: faltam === 7 ? 7 : faltam,
        msg: big ? 'Presente grande! 200 moedas e 2 diamantes.' : 'Presente de hoje: 60 moedas. Faltam ' + faltam + ' para o presente grande.' };
    };

    /* ---------- missões diárias ---------- */
    function rollMissions(t) {
      const d = dayKey(t); let seed = +d; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      return { day: d, t, list: TAM.map((sz) => { const b = MISSOES[sz].banco; const m = b[Math.floor(rnd() * b.length) % b.length]; return { id: m.id, size: sz, txt: m.txt, k: m.k, n: m.n, max: !!m.max, prog: 0 }; }) };
    }
    E.missions = () => {
      const st = state(); const t = now(); const d = dayKey(t);
      if (!st.missions || (st.missions.day !== d && t - st.missions.t >= H20 && !E.clockBack())) { st.missions = rollMissions(t); write(st); }
      return st.missions.list.map((m) => Object.assign({}, m, { done: E.has('missao:' + st.missions.day + ':' + m.size), coins: MISSOES[m.size].coins, xp: MISSOES[m.size].xp }));
    };
    // Avança as missões com o que aconteceu na rodada (ev). Devolve as que ficaram completas agora.
    E.progress = (ev) => {
      E.missions();
      const st = state(); const ms = st.missions; const done = [];
      ms.list.forEach((m) => {
        const val = +ev[m.k] || 0; if (!val) return;
        m.prog = m.max ? Math.max(m.prog, val) : m.prog + val;
      });
      write(st);
      ms.list.forEach((m) => {
        if (m.prog < m.n) return;
        const e = E.grant('missao:' + ms.day + ':' + m.size, MISSOES[m.size].coins, 0, m.txt);
        if (e) done.push({ txt: m.txt, coins: MISSOES[m.size].coins, xp: MISSOES[m.size].xp });
      });
      if (TAM.every((sz) => E.has('missao:' + ms.day + ':' + sz))) {
        const e = E.grant('missoes3:' + ms.day, 40, 0, 'as 3 missões do dia'); if (e) done.push({ txt: 'As 3 missões do dia', coins: 40, xp: 0 });
      }
      // semana cheia: 15 missões de segunda a domingo
      const wk = weekKey(now()); const days = []; for (let i = 0; i < 7; i++) { const x = new Date(+wk.slice(0, 4), +wk.slice(4, 6) - 1, +wk.slice(6) + i, 12); days.push(dayKey(x.getTime())); }
      const nWeek = E.find('missao:').filter((e) => days.includes(e.code.split(':')[1])).length;
      if (nWeek >= 15) { const e = E.grant('semana:' + wk, 0, 2, 'semana cheia'); if (e) done.push({ txt: 'Semana cheia', coins: 0, gems: 2 }); }
      return done;
    };

    /* ---------- pagamento da rodada (resultado gravado no motor) ---------- */
    // v: vista do jogador (viewFor), ctx: { mode, id, lvl, humanos }. Idempotente por runId:round.
    E.settle = (v, ctx) => {
      ctx = ctx || {};
      if (!v || !v.roundResult || (v.phase !== 'roundEnd' && v.phase !== 'gameEnd')) return null;
      const mode = ctx.mode || 'livre';
      const run = v.runId || ctx.runId || 'semid';
      const key = 'rodada:' + run + ':' + v.round;
      const out = { key, coins: 0, lines: [], msg: '', missions: [], paid: false };
      if (E.has(key) || E.has('nopay:' + run + ':' + v.round)) { out.repeat = true; return out; }
      if (mode === 'treino' || mode === 'premio' || mode === 'mm') { E.mark('nopay:' + run + ':' + v.round, mode); return out; }
      const t = v.myTeam; const rr = v.roundResult;
      const pl = v.players || [];
      const team = (list) => { const o = {}; (list || []).forEach((st, i) => { if (pl[i] && pl[i].team === t) for (const k in st) o[k] = (o[k] || 0) + st[k]; }); return o; };
      const rs = team(v.stats);
      const venceu = v.roundWinner != null ? v.roundWinner === t : rr.teams[t].total > rr.teams[1 - t].total;
      const bateu = rr.outSeat != null && pl[rr.outSeat] && pl[rr.outSeat].team === t;
      const humanos = ctx.humanos || 1;
      // missões contam sempre (mesmo rodada que não paga)
      const ev = { rodadas: 1, pile: rs.pile || 0, can: (rs.canL || 0) + (rs.canS || 0) + (rs.canB || 0), canL: rs.canL || 0, canLRodada: rs.canL || 0, reds: (v.reds && v.reds[t] ? v.reds[t].length : 0),
        descFirst: v.firstDesc === t ? 1 : 0, venceu: venceu ? 1 : 0, bater: bateu ? 1 : 0, pontos: rr.teams[t].total, jogo: v.phase === 'gameEnd' && v.winner === t ? 1 : 0,
        seis: v.n === 6 ? 1 : 0, desafio: mode === 'desafio' && v.phase === 'gameEnd' ? 1 : 0, familia: humanos >= 2 ? 1 : 0 };
      if (E.clockBack()) { E.frozen = true; out.msg = 'O relógio do celular voltou. Os ganhos ficam parados até ele acertar.'; return out; }
      const st0 = v.roundStartedAt || v.startedAt || ctx.roundStartedAt; const dur = st0 ? now() - st0 : 0;
      const turnosOk = ctx.online ? ((v.turnos && v.turnos[v.seat]) || 0) >= 0.6 * (ctx.turnosEsperados || 0) : true;
      out.missions = E.progress(ev);
      if (dur < DUR_MIN || !turnosOk) {
        E.mark('nopay:' + run + ':' + v.round, 'curta');
        out.msg = 'Essa rodada foi rápida demais para valer moeda. As estrelas valem.'; return out;
      }
      if (E.count('rodada:', dayKey(now())) >= TETO_RODADAS) {
        E.mark('nopay:' + run + ':' + v.round, 'cheia');
        out.msg = 'Hoje você já encheu a carteira. Amanhã tem mais.'; return out;
      }
      const vant = v.vantagem && v.vantagem[1 - t] > 0;
      const lvl = ctx.lvl || 'normal';
      let base = vant ? PAGA.vantagem : (PAGA[lvl] || PAGA.normal);
      const nome = vant ? 'Robôs na frente' : 'contra ' + ({ facil: 'Fácil', normal: 'Normal', dificil: 'Difícil' }[lvl] || 'Normal');
      out.lines.push(['Rodada ' + nome, base]);
      if (vant && venceu) { base += PAGA.vantagemVenceu; out.lines.push(['Virou a vantagem', PAGA.vantagemVenceu]); }
      let c = base;
      if (venceu) { c += EXTRA.venceu; out.lines.push(['Venceu', EXTRA.venceu]); }
      if (bateu) { c += EXTRA.bateu; out.lines.push(['Bateu', EXTRA.bateu]); }
      const lim = Math.min(EXTRA.limpaMax, rs.canL || 0); if (lim) { c += lim * EXTRA.limpa; out.lines.push([lim + (lim > 1 ? ' canastras limpas' : ' canastra limpa'), lim * EXTRA.limpa]); }
      const red = Math.min(EXTRA.redMax, ev.reds); if (red) { c += red * EXTRA.red; out.lines.push([red + ' três vermelho' + (red > 1 ? 's' : ''), red * EXTRA.red]); }
      if (ev.jogo) { c += EXTRA.jogo; out.lines.push(['Jogo vencido', EXTRA.jogo]); }
      if (humanos >= 2 && E.count('familia:', dayKey(now())) < EXTRA.familiaDia) { const f = E.grant('familia:' + run + ':' + v.round, EXTRA.familia, 0, 'mesa com a família'); if (f) out.lines.push(['Mesa com a família', EXTRA.familia]); c += 0; out.familia = !!f; }
      const e = E.grant(key, c, 0, mode + (ctx.id ? ' ' + ctx.id : ''));
      out.paid = !!e; out.coins = c + (out.familia ? EXTRA.familia : 0);
      out.msg = out.lines.map((l) => l[0] + ': ' + l[1]).join(' · ') + ' = ' + out.coins;
      return out;
    };

    /* ---------- níveis e títulos (XP continua no FX) ---------- */
    E.onLevelUp = (before, after) => {
      const got = [];
      for (let L = before + 1; L <= after; L++) {
        const e = E.grant('nivel:' + L, 60, L % 5 === 0 ? 1 : 0, 'nível ' + L);
        if (e) got.push(e);
        if (TITULO_NIVEIS.includes(L)) { const t = E.grant('titulo:' + L, 0, 3, 'título novo'); if (t) got.push(t); }
      }
      return got;
    };

    /* ---------- loja ---------- */
    E.owned = (id) => E.has('loja:' + id) || E.has('premio_item:' + id);
    E.buy = (item) => {
      if (!item || E.owned(item.id) && !item.repeat) return { error: 'Você já tem este item.' };
      const code = item.repeat ? 'loja:' + item.id + ':' + now() : 'loja:' + item.id;
      const e = E.spend(code, item.coins || 0, item.gems || 0, item.name);
      if (!e) return { error: item.gems ? 'Faltam diamantes para este item.' : 'Faltam moedas para este item.' };
      if (item.give) E.grant('saquinho:' + now(), item.give, 0, item.name);
      return { ok: true };
    };
    E.equip = (slot, id) => { const st = state(); st.equip = st.equip || {}; if (id == null) delete st.equip[slot]; else st.equip[slot] = id; write(st); changed(); };
    E.equipped = () => Object.assign({}, state().equip || {});

    /* ---------- campanha: tentativas, abandonos, vitórias (diagnóstico) ---------- */
    E.camp = (kind, id) => { const st = state(); const c = st.campaign = st.campaign || { tries: {}, abandons: {}, wins: {} }; c[kind] = c[kind] || {}; c[kind][id] = (c[kind][id] || 0) + 1; write(st); };
    E.campaign = () => Object.assign({ tries: {}, abandons: {}, wins: {} }, state().campaign || {});
    // Marca "já vi" para a liberação aos poucos das novidades.
    E.seen = (k, set) => { const st = state(); st.seen = st.seen || {}; if (set) { st.seen[k] = now(); write(st); } return !!st.seen[k]; };
    // Primeiro dia de jogo (para o Presente e as Missões aparecerem só no 2º dia).
    E.firstDay = () => { const L = state().ledger; const e = L.find((x) => x.code === 'inicial' || x.code === 'apagada' || x.code === 'base'); return e ? (e.day || dayKey(e.t)) : dayKey(now()); };
    E.today = () => dayKey(now());
    // Código de diagnóstico em texto (tentativas, abandonos, vitórias, saldo).
    /* ---------- Banca da família (modo dono, com PIN local guardado só como hash) ---------- */
    const pinHash = (pin) => hash(SAL + ':pin:' + String(pin)) + hash(String(pin) + ':' + SAL);
    E.hasPin = () => !!state().pinH;
    E.setPin = (pin) => { pin = String(pin || ''); if (!/^\d{4,8}$/.test(pin)) return { error: 'O PIN precisa ter de 4 a 8 números.' }; const st = state(); if (st.pinH) return { error: 'O PIN já foi criado.' }; st.pinH = pinHash(pin); write(st); return { ok: true }; };
    let bancaAberta = false;
    E.unlock = (pin) => { const st = state(); bancaAberta = !!st.pinH && st.pinH === pinHash(pin); return bancaAberta; };
    E.lock = () => { bancaAberta = false; };
    E.bancaOpen = () => bancaAberta;
    // Credita (valor > 0) ou debita (valor < 0) moedas, com motivo obrigatório. Vai para o livro como 'banca'.
    E.banca = (valor, motivo) => {
      if (!bancaAberta) return { error: 'Abra a Banca com o PIN primeiro.' };
      valor = Math.trunc(+valor || 0); motivo = String(motivo || '').trim();
      if (!valor) return { error: 'Escreva quantas moedas.' };
      if (motivo.length < 3) return { error: 'Escreva o motivo.' };
      if (valor < 0 && E.wallet().coins + valor < 0) return { error: 'A carteira não tem tantas moedas.' };
      const e = post('banca:' + now() + ':' + Math.random().toString(36).slice(2, 6), valor, 0, motivo, true);
      return e ? { ok: true } : { error: 'Não deu para lançar agora.' };
    };

    /* ---------- Mesas valendo moedas (entrada de cada um; o time vencedor divide o prêmio da mesa) ---------- */
    E.ENTRADAS = CFG.ENTRADAS_MESA;

    /* ---------- Cofrinho (carteira baixa) e bônus de horas em horas ---------- */
    // Cofrinho: com menos de 50 moedas, um relógio de 3 h começa; ao zerar, um toque dá 300 moedas.
    E.cofrinho = () => {
      const st = state(); const w = E.wallet(); const t = now();
      if (w.coins >= CFG.COFRINHO_ABAIXO_DE) { if (st.cofreDesde) { delete st.cofreDesde; write(st); } return { ativo: false }; }
      if (!st.cofreDesde) { st.cofreDesde = t; write(st); }
      const falta = Math.max(0, st.cofreDesde + CFG.COFRINHO_HORAS * 3600000 - t);
      return { ativo: true, falta, pronto: falta === 0, moedas: CFG.COFRINHO_MOEDAS };
    };
    E.abrirCofrinho = () => {
      const c = E.cofrinho(); if (!c.pronto) return null;
      const e = E.grant('cofrinho:' + now(), CFG.COFRINHO_MOEDAS, 0, 'cofrinho');
      if (e) { const st = state(); delete st.cofreDesde; write(st); }
      return e ? { coins: CFG.COFRINHO_MOEDAS } : null;
    };
    // Bônus de 4 em 4 horas (acumula no máximo 1): conta desde o último bônus pego.
    E.bonus = () => {
      const bs = E.find('bonus:'); const t = now(); const per = CFG.BONUS_HORAS * 3600000;
      const ref = bs.length ? bs[bs.length - 1].t : (E.find('inicial')[0] || { t })['t'];
      const falta = Math.max(0, ref + per - t);
      return { pronto: falta === 0 && !E.clockBack(), falta, moedas: CFG.BONUS_MOEDAS };
    };
    E.pegarBonus = () => { const b = E.bonus(); if (!b.pronto) return null; const e = E.grant('bonus:' + now(), CFG.BONUS_MOEDAS, 0, 'bônus'); return e ? { coins: CFG.BONUS_MOEDAS } : null; };
    E.mesaEntrada = (runId, valor) => {
      valor = valor | 0; if (!valor) return { ok: true, valor: 0 }; if (!E.ENTRADAS.includes(valor)) return { error: 'Entrada inválida.' };
      if (E.has('mesa_entrada:' + runId)) return { ok: true, valor, repeat: true };
      const e = E.spend('mesa_entrada:' + runId, valor, 0, 'entrada da mesa');
      return e ? { ok: true, valor } : { error: 'Sem moedas para a entrada desta mesa.' };
    };
    // Fim do jogo: quem pagou e está no time vencedor recebe a parte dele.
    E.mesaFim = (v, valor) => {
      valor = valor | 0; const run = v && v.runId; if (!valor || !run || v.phase !== 'gameEnd') return null;
      const n = v.n || (v.players || []).length; const total = valor * n;
      const winners = (v.players || []).filter((p) => p.team === v.winner).length || 1;
      const parte = v.winner === -1 ? valor : Math.floor(total / winners);
      const pagou = E.has('mesa_entrada:' + run);
      const ganhou = v.winner === -1 || v.winner === v.myTeam;
      let e = null;
      if (pagou && ganhou) e = E.grant('mesa_premio:' + run, parte, 0, v.winner === -1 ? 'empate: entrada de volta' : 'prêmio da mesa');
      // Rei da Mesa: cada celular anota o saldo de cada jogador nesta mesa
      if (!E.has('rei:' + run)) {
        E.mark('rei:' + run);
        const st = state(); const mk = dayKey(now()).slice(0, 6); st.rei = st.rei || {}; const R = st.rei[mk] = st.rei[mk] || {};
        (v.players || []).forEach((p) => { const nm = String(p.name || '?').slice(0, 14); const net = v.winner === -1 ? 0 : p.team === v.winner ? parte - valor : -valor; R[nm] = (R[nm] || 0) + net; });
        write(st);
      }
      return { parte: pagou && ganhou ? parte : 0, pagou, ganhou, paid: !!e };
    };
    // Ranking do mês: moedas ganhas nas mesas valendo moedas (quem este celular viu jogar).
    E.reiDaMesa = (mk) => { mk = mk || dayKey(now()).slice(0, 6); const R = (state().rei || {})[mk] || {}; return Object.keys(R).map((n) => ({ name: n, coins: R[n] })).sort((a, b) => b.coins - a.coins); };
    // Moedas que entraram no mês por jogar (sem banca, sem carteira inicial).
    E.ganhosDoMes = (mk) => { mk = mk || dayKey(now()).slice(0, 6); return state().ledger.filter((e) => e.coins > 0 && (e.day || '').slice(0, 6) === mk && !/^(banca|inicial|veterano|base)/.test(e.code)).reduce((a, e) => a + e.coins, 0); };

    /* ---------- Giro da Sorte (só moedas do jogo) ---------- */
    E.giroSortear = (rnd) => { const P = CFG.GIRO_PESOS; const tot = P.reduce((a, p) => a + p[1], 0); let x = (rnd ? rnd() : Math.random()) * tot; for (const p of P) { x -= p[1]; if (x < 0) return p[0]; } return P[0][0]; };
    // Entra: paga a entrada e grava o multiplicador sorteado no livro, com o runId.
    E.giroEntrar = (runId, entrada, rnd) => {
      entrada = entrada | 0; if (!CFG.GIRO_ENTRADAS.includes(entrada)) return { error: 'Entrada inválida.' };
      const old = E.find('giro:' + runId)[0]; if (old) return { ok: true, mult: +old.ref.split('x')[0], repeat: true };
      if (!E.spend('giro_entrada:' + runId, entrada, 0, 'entrada do Giro da Sorte')) return { error: 'Faltam moedas para esta entrada.' };
      const mult = E.giroSortear(rnd); E.mark('giro:' + runId, mult + 'x' + entrada);
      return { ok: true, mult, premio: entrada * mult };
    };
    E.giroMult = (runId) => { const e = E.find('giro:' + runId)[0]; return e ? { mult: +e.ref.split('x')[0], entrada: +e.ref.split('x')[1] } : null; };
    E.giroMedia = () => { const P = CFG.GIRO_PESOS; const t = P.reduce((a, p) => a + p[1], 0); return P.reduce((a, p) => a + p[0] * p[1], 0) / t; };
    // Fim: o prêmio total é dividido pela dupla vencedora (cada um leva a metade); se vencer a dupla dos robôs, fica com a casa.
    E.giroFim = (v) => {
      const g = v && E.giroMult(v.runId); if (!g || v.phase !== 'gameEnd' || v.winner !== v.myTeam) return null;
      const total = g.entrada * g.mult; const parte = Math.floor(total / 2);
      return E.grant('giro_premio:' + v.runId, parte, 0, 'Giro da Sorte ' + g.mult + 'x') ? { premio: parte, total, mult: g.mult } : null;
    };

    E.diagnostico = () => { const w = E.wallet(); const c = E.campaign(); return JSON.stringify({ w: [w.coins, w.gems, w.ok], n: state().ledger.length, t: c.tries, a: c.abandons, v: c.wins }); };
    return E;
  }

  const api = { create, hash, FRASE, CFG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    let ns = '';
    try { ns = new URLSearchParams(location.search).get('ns') || ''; } catch (e) {}
    const lvl = (xp) => (root.FX && root.FX.level ? root.FX.level(xp) : Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1);
    root.Eco = create({ ns, level: lvl });
    root.Eco.create = create;
    // Duas abas: quando a outra aba grava, esta atualiza a carteira.
    try { root.addEventListener('storage', (e) => { if (e.key === ns + 'eco' && typeof root.Eco.onChange === 'function') root.Eco.onChange(); }); } catch (e) {}
  }
})(typeof window !== 'undefined' ? window : globalThis);
