/* Samba da Tânia — Domingos: o ranking da turma que joga junto, pessoalmente, todo domingo.
   Ninguém precisa jogar no app: só sortear os times, anotar o placar de cada jogo e ver o ranking do ano.
   Vitória 3 pontos, empate 1, derrota 0 (quem vem mais, soma mais). Tudo sobre uma lista de jogos. */
(function (root) {
  'use strict';
  const PADRAO = {
    jogadores: ['Tânia', 'Marinho', 'Pedro', 'Marcelo', 'Osni', 'Dedé'],
    casais: [['Tânia', 'Marinho'], ['Pedro', 'Marcelo'], ['Osni', 'Dedé']],
    jogos: [], premio: '',
  };
  const anoDe = (j) => String(j.data || '').slice(0, 4);
  const resultado = (j) => (j.ptsA > j.ptsB ? 'A' : j.ptsB > j.ptsA ? 'B' : 'E');

  // Sorteia os times entre os presentes (4 viram 2×2, 6 viram 3×3; ímpar deixa um de fora). rng: 0..1
  function sorteio(presentes, rng) {
    rng = rng || Math.random; const a = presentes.slice();
    for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(rng() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; }
    const m = Math.floor(a.length / 2);
    return { A: a.slice(0, m), B: a.slice(m, 2 * m), fora: a.slice(2 * m) };
  }

  function ranking(jogos, ano) {
    const t = {};
    const g = (n) => (t[n] = t[n] || { nome: n, jogos: 0, v: 0, e: 0, d: 0, pro: 0, contra: 0, pts: 0, seq: 0 });
    jogos.filter((j) => !ano || anoDe(j) === String(ano)).slice().sort((x, y) => (x.data + x.id).localeCompare(y.data + y.id)).forEach((j) => {
      const r = resultado(j);
      [['A', j.timeA, j.ptsA, j.ptsB], ['B', j.timeB, j.ptsB, j.ptsA]].forEach(([lado, time, pro, contra]) => (time || []).forEach((n) => {
        const x = g(n); x.jogos++; x.pro += pro; x.contra += contra;
        if (r === 'E') { x.e++; x.pts += 1; x.seq = 0; } else if (r === lado) { x.v++; x.pts += 3; x.seq = x.seq > 0 ? x.seq + 1 : 1; } else { x.d++; x.seq = x.seq < 0 ? x.seq - 1 : -1; }
      }));
    });
    const lista = Object.values(t).map((x) => Object.assign(x, { aprov: x.jogos ? x.v / x.jogos : 0, saldo: x.pro - x.contra }));
    lista.sort((a, b) => b.pts - a.pts || b.aprov - a.aprov || b.saldo - a.saldo || a.nome.localeCompare(b.nome));
    return lista;
  }

  // Quem leva o quê no fim do ano.
  function premios(jogos, ano, casais) {
    const rk = ranking(jogos, ano); const js = jogos.filter((j) => anoDe(j) === String(ano));
    const out = [];
    if (!rk.length) return out;
    out.push({ id: 'campeao', ic: '🏆', nome: 'Campeão do ano', quem: rk[0].nome, det: rk[0].pts + ' pontos em ' + rk[0].jogos + ' jogos' });
    const minJ = Math.max(3, Math.ceil(Math.max(...rk.map((x) => x.jogos)) / 2));
    const ap = rk.filter((x) => x.jogos >= minJ).slice().sort((a, b) => b.aprov - a.aprov || b.jogos - a.jogos)[0];
    if (ap) out.push({ id: 'aprov', ic: '🎯', nome: 'Maior aproveitamento', quem: ap.nome, det: Math.round(ap.aprov * 100) + '% de vitórias (mín. ' + minJ + ' jogos)' });
    const pro = rk.slice().sort((a, b) => b.pro - a.pro)[0]; out.push({ id: 'pontos', ic: '💥', nome: 'Mais pontos feitos', quem: pro.nome, det: pro.pro + ' pontos somados' });
    const seq = rk.slice().sort((a, b) => b.seq - a.seq)[0]; if (seq.seq >= 2) out.push({ id: 'seq', ic: '🔥', nome: 'Sequência de vitórias (agora)', quem: seq.nome, det: seq.seq + ' seguidas' });
    // dupla de ouro: pares que jogaram juntos, melhor aproveitamento (mín. 3 jogos juntos)
    const pares = {};
    js.forEach((j) => { const r = resultado(j); [['A', j.timeA], ['B', j.timeB]].forEach(([lado, time]) => { const ts = (time || []).slice().sort(); for (let i = 0; i < ts.length; i++) for (let k = i + 1; k < ts.length; k++) { const key = ts[i] + ' e ' + ts[k]; const p = (pares[key] = pares[key] || { nome: key, j: 0, v: 0 }); p.j++; if (r === lado) p.v++; } }); });
    const dupla = Object.values(pares).filter((p) => p.j >= 3).sort((a, b) => b.v / b.j - a.v / a.j || b.j - a.j)[0];
    if (dupla) out.push({ id: 'dupla', ic: '🤝', nome: 'Dupla de ouro', quem: dupla.nome, det: dupla.v + ' vitórias em ' + dupla.j + ' jogos juntos' });
    // anfitriões: casas que mais receberam (um domingo = uma data)
    const datas = {}; js.forEach((j) => { if (j.casa != null) datas[j.data] = j.casa; });
    const cont = {}; Object.values(datas).forEach((c) => (cont[c] = (cont[c] || 0) + 1));
    const top = Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0];
    if (top != null && casais && casais[top]) out.push({ id: 'casa', ic: '🥟', nome: 'Casa que mais recebeu (coxinha de ouro)', quem: casais[top].join(' e '), det: cont[top] + ' domingos' });
    return out;
  }

  // De quem é o próximo domingo: o casal depois do último que recebeu.
  function proximaCasa(jogos, nCasais) {
    const com = jogos.filter((j) => j.casa != null).sort((a, b) => (a.data + a.id).localeCompare(b.data + b.id));
    return com.length ? (com[com.length - 1].casa + 1) % nCasais : 0;
  }

  function resumoTexto(jogos, ano) {
    const rk = ranking(jogos, ano);
    if (!rk.length) return 'Ranking ' + ano + ': ainda sem jogos.';
    const medalha = ['🥇', '🥈', '🥉'];
    return '🃏 Samba dos Domingos ' + ano + '\n' + rk.map((x, i) => (medalha[i] || (i + 1) + 'º') + ' ' + x.nome + ' · ' + x.pts + ' pts · ' + x.v + 'V ' + x.e + 'E ' + x.d + 'D').join('\n');
  }

  const api = { PADRAO, anoDe, resultado, sorteio, ranking, premios, proximaCasa, resumoTexto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Domingos = api;
})(typeof window !== 'undefined' ? window : globalThis);
