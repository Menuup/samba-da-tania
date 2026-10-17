/* Samba da Tânia — nuvem: conta (anônima ou Google) e histórico de partidas no Firebase.
   Só entra em ação se cloud-config.js tiver um objeto em window.SAMBA_FIREBASE; com null, tudo
   fica no aparelho como sempre. Erro de rede nunca chega ao jogo: vira status 'erro' e tenta
   de novo em 30 s. A regra de fusão do perfil (mergeProfile) é pura e testada em test-cloud.js. */
(function () {
  'use strict';
  const Cloud = {};
  const cfg = window.SAMBA_FIREBASE;
  Cloud.enabled = !!cfg && typeof cfg === 'object';

  // Chaves no aparelho: 'profile' e 'profile_synced' seguem o fx.js (sem prefixo);
  // 'ucode' e a fila seguem o index.html (prefixo ?ns= da URL, usado nos testes).
  const NS = (() => { try { return new URLSearchParams(location.search).get('ns') || ''; } catch (e) { return ''; } })();
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const K = { profile: 'profile', synced: 'profile_synced', ucode: NS + 'ucode', queue: NS + 'match_queue', dev: NS + 'cloud_dev' };
  const rnd = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // Id deste aparelho, gerado uma vez: a nuvem guarda por aparelho o que já foi somado.
  const devId = () => { let d = ls.get(K.dev, null); if (typeof d !== 'string' || !d) { d = rnd(); ls.set(K.dev, d); } return d; };
  const validCode = (c) => typeof c === 'string' && /^[A-Z2-9]{6}$/.test(c);
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const obj = (o) => (o && typeof o === 'object' ? o : {});

  /* ---------- lógica pura (sem Firebase) ---------- */
  // delta = local − synced por campo (nunca negativo); merged = cloud + delta.
  // Só campos numéricos contam; nome, datas e afins passam batido.
  Cloud.mergeProfile = (local, synced, cloud) => {
    local = obj(local); synced = obj(synced); cloud = obj(cloud);
    const num = (o, k) => (isNum(o[k]) ? o[k] : 0);
    const keys = new Set();
    [local, synced, cloud].forEach((o) => Object.keys(o).forEach((k) => { if (isNum(o[k])) keys.add(k); }));
    const merged = {}, delta = {};
    keys.forEach((k) => {
      const d = Math.max(0, num(local, k) - num(synced, k));
      if (d > 0) delta[k] = d;
      merged[k] = num(cloud, k) + d;
    });
    return { merged, delta };
  };
  // Foto (data:) não sobe para a nuvem: vira a palavra 'foto'.
  Cloud.cleanAvatar = (a) => (typeof a === 'string' && a && !a.startsWith('data:') && a.length <= 8 && !/[<>&"]/.test(a) ? a : 'foto');
  // Monta o registro de uma partida a partir da tela (v) que o index.html recebe no fim do jogo.
  Cloud.matchFromView = (v, xp) => {
    if (!v || !Array.isArray(v.players)) return null;
    const rr = obj(v.roundResult); const n = (p) => String((p && p.name) || '').slice(0, 14);
    return {
      code: v.code || 'solo', round: +v.round || 0, rodadas: +v.round || 0,
      players: v.players.slice(0, 6).map((p) => ({ name: n(p), team: +obj(p).team || 0 })),
      scores: [+(v.scores && v.scores[0]) || 0, +(v.scores && v.scores[1]) || 0],
      myTeam: v.myTeam == null ? null : +v.myTeam, winner: v.winner == null ? null : +v.winner,
      xp: isNum(xp) ? xp : 0, baterPor: rr.outSeat != null && v.players[rr.outSeat] ? n(v.players[rr.outSeat]) : null,
    };
  };

  /* ---------- estado ---------- */
  let auth = null, db = null, user = null, status = 'off';
  let initP = null, anonP = null, syncing = null, flushing = null, retryT = null, lastName = null, gen = 0;
  const listeners = [];
  const publicUser = () => (user ? { uid: user.uid, anonymous: !!user.isAnonymous, name: user.displayName || null, email: user.email || null, photo: user.photoURL || null } : null);
  const notify = (extra) => { const ev = Object.assign({ user: publicUser(), status }, extra || {}); listeners.forEach((cb) => { try { cb(ev); } catch (e) {} }); };
  const setStatus = (s) => { status = s; notify(); };
  const ready = () => !!(Cloud.enabled && auth && db);
  const ts = () => firebase.firestore.FieldValue.serverTimestamp();
  const userRef = (uid) => db.collection('users').doc(uid || user.uid);
  const liveStatus = () => (user ? (user.isAnonymous ? 'anonimo' : 'google') : 'conectando');

  Cloud.status = () => status;
  Cloud.user = publicUser;
  Cloud.uid = () => (user ? user.uid : null);
  // O ouvinte recebe {user, status} já na hora, e depois a cada mudança (às vezes com ucode ou profile junto).
  Cloud.onChange = (cb) => {
    if (typeof cb !== 'function') return () => {};
    listeners.push(cb); try { cb({ user: publicUser(), status }); } catch (e) {}
    return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); };
  };

  function fail(e) {
    try { console.warn('[nuvem]', (e && (e.code || e.message)) || e); } catch (x) {}
    if (status !== 'erro') setStatus('erro');
    clearTimeout(retryT); retryT = setTimeout(retry, 30000);
  }
  function ok() { if (status === 'erro' && user) setStatus(liveStatus()); }
  function retry() {
    clearTimeout(retryT); retryT = null;
    if (!Cloud.enabled) return;
    if (!auth || !db) { initP = null; Cloud.init(); return; }
    if (!auth.currentUser) { signInAnon(); return; }
    onAuth(auth.currentUser);
  }
  if (typeof window.addEventListener === 'function') window.addEventListener('online', () => { if (status === 'erro') retry(); });

  /* ---------- scripts do Firebase, só quando precisa ---------- */
  const GS = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const loading = {};
  function script(name) {
    const src = GS + name;
    if (!loading[src]) loading[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = () => res(); s.onerror = () => { delete loading[src]; s.remove(); rej(new Error('não carregou ' + name)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  async function loadFirebase() {
    if (window.firebase && firebase.auth && firebase.firestore) return;
    await script('firebase-app-compat.js');
    await Promise.all([script('firebase-auth-compat.js'), script('firebase-firestore-compat.js')]);
  }

  /* ---------- conta ---------- */
  Cloud.init = () => {
    if (!Cloud.enabled) { status = 'off'; notify(); return Promise.resolve(false); }
    if (initP) return initP;
    initP = (async () => {
      setStatus('conectando');
      try {
        await loadFirebase();
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        auth = firebase.auth(); db = firebase.firestore();
        try { db.settings({ ignoreUndefinedProperties: true }); } catch (e) {}
        try { auth.useDeviceLanguage(); } catch (e) {}
        auth.onAuthStateChanged(onAuth, fail);
        await finishRedirect();
        if (!auth.currentUser) await signInAnon();
        return true;
      } catch (e) { initP = null; fail(e); return false; }
    })();
    return initP;
  };
  function signInAnon() {
    if (!ready() || auth.currentUser) return Promise.resolve();
    if (!anonP) anonP = auth.signInAnonymously().catch(fail).then(() => { anonP = null; });
    return anonP;
  }
  function onAuth(u) {
    user = u || null; gen++;
    if (!u) { setStatus('conectando'); setTimeout(() => { if (auth && !auth.currentUser) signInAnon(); }, 50); return; }
    setStatus(liveStatus());
    afterLogin(u.uid, gen);
  }
  // Primeira coisa ao entrar numa conta: o código de amigo segue a conta, a fila sobe, o perfil se funde.
  async function afterLogin(uid, g) {
    try {
      const ref = userRef(uid); const snap = await ref.get();
      if (g !== gen) return;
      const d = obj(snap.exists && snap.data());
      const mine = ls.get(K.ucode, null);
      if (validCode(d.ucode) && d.ucode !== mine) { ls.set(K.ucode, d.ucode); notify({ ucode: d.ucode }); }
      else if (!validCode(d.ucode) && validCode(mine)) await ref.set({ ucode: mine, updatedAt: ts() }, { merge: true });
      if (lastName) await Cloud.saveName(lastName.name, lastName.avatar);
      await flushQueue();
      const merged = await Cloud.syncProfile();
      if (g === gen && merged) { ok(); notify({ profile: merged }); }
    } catch (e) { fail(e); }
  }
  const inUse = (e) => !!e && (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use' || e.code === 'auth/provider-already-linked');
  const noPopup = (e) => !!e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment' || e.code === 'auth/web-storage-unsupported');
  const cancelled = (e) => !!e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request' || e.code === 'auth/user-cancelled');
  // Volta de um login por redirecionamento (celular onde o popup não abre).
  async function finishRedirect() {
    try { await auth.getRedirectResult(); }
    catch (e) {
      if (inUse(e) && e.credential) await auth.signInWithCredential(e.credential);
      else if (e && e.code !== 'auth/no-auth-event') console.warn('[nuvem] redirect', e.code || e);
    }
  }
  Cloud.signInGoogle = async () => {
    if (!ready()) return null;
    const prov = new firebase.auth.GoogleAuthProvider(); const u = auth.currentUser;
    setStatus('conectando');
    try {
      if (u && u.isAnonymous) {
        try { await u.linkWithPopup(prov); onAuth(auth.currentUser); }
        catch (e) {
          // A conta Google já existe: entra nela e o perfil dela manda (afterLogin soma só o que está pendente).
          if (inUse(e)) { if (e.credential) await auth.signInWithCredential(e.credential); else await auth.signInWithPopup(prov); }
          else if (noPopup(e)) { await u.linkWithRedirect(prov); return null; }
          else throw e;
        }
      } else {
        try { await auth.signInWithPopup(prov); }
        catch (e) { if (noPopup(e)) { await auth.signInWithRedirect(prov); return null; } throw e; }
      }
      if (auth.currentUser) { user = auth.currentUser; if (status === 'conectando') setStatus(liveStatus()); }
      return publicUser();
    } catch (e) {
      if (cancelled(e)) { user = auth.currentUser; setStatus(liveStatus()); return null; }
      fail(e); return null;
    }
  };
  // Sai da conta e vira um anônimo novo; o perfil do aparelho fica e sobe inteiro para a conta nova.
  Cloud.signOut = async () => {
    if (!ready()) return false;
    try { setStatus('conectando'); await auth.signOut(); return true; } catch (e) { fail(e); return false; }
  };

  /* ---------- perfil ---------- */
  // 'profile_synced' guarda, por conta, a última cópia que subiu e o token dessa subida:
  // trocar de conta não conta em dobro. O mesmo token vai para a nuvem em sync[aparelho].
  function rememberSynced(uid, p, tok) {
    const all = obj(ls.get(K.synced, {})); delete all[uid]; all[uid] = { p, tok };
    const ks = Object.keys(all); while (ks.length > 6) delete all[ks.shift()];
    ls.set(K.synced, all);
  }
  // Aceita o formato antigo (só o perfil) e o novo ({p, tok}).
  const readSynced = (uid) => { const s = obj(ls.get(K.synced, {}))[uid]; return s && s.p ? { p: obj(s.p), tok: s.tok || null } : { p: obj(s), tok: null }; };
  const numsOnly = (p) => Cloud.mergeProfile(p, {}, {}).merged;
  let dirty = false;
  Cloud.syncProfile = (localProfile) => {
    if (!ready() || !user) return Promise.resolve(null);
    // Já tem uma sincronia em voo: o que mudou agora sobe numa rodada seguinte, encadeada.
    if (syncing) { dirty = true; return syncing.then(() => (dirty ? Cloud.syncProfile() : null)); }
    dirty = false;
    const uid = user.uid; const dev = devId(); const tok = rnd();
    const local0 = Object.assign({}, obj(ls.get(K.profile, {})), obj(localProfile));
    const p = (async () => {
      try {
        const mine = readSynced(uid); const ref = userRef(uid);
        const r = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref); const data = obj(snap.exists && snap.data());
          const cloud = data.profile || null; const s = obj(obj(data.sync)[dev]);
          // De onde parte o delta deste aparelho:
          //  - conta sem perfil: tudo o que há no aparelho sobe inteiro;
          //  - a nuvem tem uma subida deste aparelho que ele nunca viu confirmada (ack perdido):
          //    o que subiu já conta, e só o jogado desde a base daquela subida entra;
          //  - normal: a última cópia confirmada neste aparelho.
          let synced;
          if (!cloud) synced = {};
          else if (s.tok && s.tok !== mine.tok) synced = obj(s.base);
          else synced = mine.p;
          const res = Cloud.mergeProfile(local0, synced, cloud);
          const up = { profile: res.merged, sync: {}, updatedAt: ts() };
          up.sync[dev] = { base: numsOnly(local0), tok };
          tx.set(ref, up, { merge: true });
          return res;
        });
        if (!user || user.uid !== uid) return null;
        // O que foi jogado enquanto a sincronia corria fica pendente para a próxima.
        const now = obj(ls.get(K.profile, {}));
        const fresh = Cloud.mergeProfile(now, local0, r.merged).merged;
        ls.set(K.profile, Object.assign({}, now, fresh));
        rememberSynced(uid, r.merged, tok);
        if (Object.keys(Cloud.mergeProfile(now, local0, r.merged).delta).length) {
          dirty = true; setTimeout(() => { if (dirty && !syncing) Cloud.syncProfile(); }, 0);
        }
        ok(); return fresh;
      } catch (e) { fail(e); return null; }
    })();
    syncing = p;
    p.finally(() => { if (syncing === p) syncing = null; }).catch(() => {});
    return p;
  };
  Cloud.saveName = async (name, avatar) => {
    lastName = { name, avatar };
    if (!ready() || !user) return false;
    try {
      const doc = { name: String(name || '').slice(0, 14), avatar: Cloud.cleanAvatar(avatar), updatedAt: ts() };
      const mine = ls.get(K.ucode, null); if (validCode(mine)) doc.ucode = mine;
      await userRef().set(doc, { merge: true }); ok(); return true;
    } catch (e) { fail(e); return false; }
  };

  /* ---------- histórico de partidas ---------- */
  const queue = () => { const q = ls.get(K.queue, []); return Array.isArray(q) ? q : []; };
  function flushQueue() {
    if (!ready() || !user) return Promise.resolve(false);
    if (flushing) return flushing;
    // A promise é guardada depois de criada e limpa de fora: com a fila vazia o corpo termina
    // antes da atribuição, e um finally lá dentro deixaria 'flushing' preso para sempre.
    const p = (async () => {
      try {
        let q = queue();
        while (q.length && user) {
          const it = q[0]; const data = Object.assign({}, it, { at: ts() }); delete data.id;
          await userRef().collection('matches').doc(it.id).set(data);
          q = queue().filter((x) => x.id !== it.id); ls.set(K.queue, q);
        }
        ok(); return true;
      } catch (e) { fail(e); return false; }
    })();
    flushing = p;
    p.finally(() => { if (flushing === p) flushing = null; }).catch(() => {});
    return p;
  }
  // Sempre passa pela fila: sem rede o registro espera no aparelho e sobe na próxima chance.
  Cloud.saveMatch = (rec) => {
    if (!Cloud.enabled || !rec || typeof rec !== 'object') return Promise.resolve(false);
    let it; try { it = JSON.parse(JSON.stringify(rec)); } catch (e) { return Promise.resolve(false); }
    // O id vem de quem chamou quando existe (a cópia local usa o mesmo), para as listas se fundirem.
    if (typeof it.id !== 'string' || !/^[a-z0-9]{6,24}$/.test(it.id)) it.id = rnd();
    it.clientAt = Date.now();
    const q = queue(); q.push(it); if (q.length > 200) q.splice(0, q.length - 200); ls.set(K.queue, q);
    return flushQueue();
  };
  Cloud.listMatches = async (n) => {
    n = Math.max(1, Math.min(200, +n || 30));
    const pend = queue().reverse().map((it) => Object.assign({}, it, { at: it.clientAt, pending: true }));
    if (!ready() || !user) return pend.slice(0, n);
    try {
      const snap = await userRef().collection('matches').orderBy('at', 'desc').limit(n).get();
      const rows = snap.docs.map((d) => { const x = obj(d.data()); return Object.assign({}, x, { id: d.id, at: x.at && x.at.toMillis ? x.at.toMillis() : (x.clientAt || 0) }); });
      ok(); return pend.concat(rows).slice(0, n);
    } catch (e) { fail(e); return pend.slice(0, n); }
  };

  window.Cloud = Cloud;
})();
