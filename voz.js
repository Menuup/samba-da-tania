/* Samba da Tânia — voz e vídeo opcionais na mesa online (chamadas de mídia do PeerJS, malha entre as pessoas).
   Começa tudo desligado; a permissão só é pedida ao tocar em 🎤 ou 📷. Vídeo baixo (320x240, 15 qps).
   Sem câmera, sem microfone ou com permissão recusada, o jogo segue normal. */
(function (root) {
  'use strict';
  const V = { mic: false, cam: false, soVoz: false, local: null, calls: {}, remotes: {}, peer: null, seatOf: {}, falando: {}, onChange: null, precisaToque: false };
  const box = () => { let b = document.getElementById('vozbox'); if (!b) { b = document.createElement('div'); b.id = 'vozbox'; b.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:0;bottom:0'; document.body.appendChild(b); } return b; };
  const changed = () => { if (typeof V.onChange === 'function') try { V.onChange(); } catch (e) {} };
  const msgErro = (e) => (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Sem permissão para o microfone ou a câmera. Dá para liberar nas configurações do navegador.' : e && e.name === 'NotFoundError' ? 'Não achei microfone ou câmera neste aparelho.' : 'Não deu para ligar agora. O jogo continua normal.');

  // Liga a escuta de chamadas no peer da mesa (anfitrião ou convidado).
  V.attach = (peer) => {
    if (!peer || V.peer === peer) return; V.peer = peer;
    peer.on('call', (call) => {
      try { call.answer(V.local || undefined); } catch (e) { return; }
      hook(call);
    });
  };
  function hook(call) {
    const id = call.peer;
    if (V.calls[id] && V.calls[id] !== call) try { V.calls[id].close(); } catch (e) {}
    V.calls[id] = call;
    call.on('stream', (st) => { addRemote(id, st); });
    call.on('close', () => { if (V.calls[id] === call) { delete V.calls[id]; dropRemote(id); } });
    call.on('error', () => {});
  }
  function addRemote(id, st) {
    let r = V.remotes[id];
    if (!r) { const a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', ''); box().appendChild(a); r = V.remotes[id] = { audio: a }; }
    r.stream = st; r.audio.srcObject = st;
    const p = r.audio.play(); if (p && p.catch) p.catch(() => { V.precisaToque = true; changed(); });
    watchSpeak(id, st); changed();
  }
  function dropRemote(id) { const r = V.remotes[id]; if (!r) return; try { r.audio.srcObject = null; r.audio.remove(); } catch (e) {} if (r.stop) r.stop(); delete V.remotes[id]; delete V.falando[id]; changed(); }
  // Quem está falando: um medidor simples de volume por pessoa.
  let ac = null;
  function watchSpeak(id, st) {
    const r = V.remotes[id]; if (r.stop) r.stop();
    if (!st.getAudioTracks().length) return;
    try { ac = ac || new (root.AudioContext || root.webkitAudioContext)(); const src = ac.createMediaStreamSource(st); const an = ac.createAnalyser(); an.fftSize = 256; src.connect(an); const d = new Uint8Array(an.frequencyBinCount);
      const t = setInterval(() => { an.getByteFrequencyData(d); let s = 0; for (let i = 0; i < d.length; i++) s += d[i]; const f = s / d.length > 18; if (f !== !!V.falando[id]) { V.falando[id] = f; paintSpeak(); } }, 300);
      r.stop = () => { clearInterval(t); try { src.disconnect(); } catch (e) {} };
    } catch (e) {}
  }
  // Toque para liberar o som (iPhone).
  V.liberarSom = () => { V.precisaToque = false; Object.values(V.remotes).forEach((r) => { try { r.audio.play(); } catch (e) {} }); if (ac && ac.state === 'suspended') ac.resume(); changed(); };

  async function pegar(video) {
    const md = navigator.mediaDevices; if (!md || !md.getUserMedia) throw { name: 'NotFoundError' };
    return md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 }, facingMode: 'user' } : false });
  }
  // Liga/desliga a câmera e o microfone. Religa as chamadas quando muda o que se envia.
  async function setMedia(mic, cam) {
    const precisaVideo = cam && !V.soVoz;
    const tem = V.local; const temVideo = tem && tem.getVideoTracks().length > 0;
    if ((mic || precisaVideo) && (!tem || (precisaVideo && !temVideo))) {
      const st = await pegar(precisaVideo);
      if (tem) tem.getTracks().forEach((t) => t.stop());
      V.local = st; V.mic = mic; V.cam = precisaVideo; applyEnabled(); recall(); changed(); return;
    }
    if (!mic && !precisaVideo) { if (tem) tem.getTracks().forEach((t) => t.stop()); V.local = null; V.mic = false; V.cam = false; recall(); changed(); return; }
    V.mic = mic; V.cam = precisaVideo; applyEnabled(); changed();
  }
  function applyEnabled() { if (!V.local) return; V.local.getAudioTracks().forEach((t) => (t.enabled = V.mic)); V.local.getVideoTracks().forEach((t) => (t.enabled = V.cam)); }
  V.toggleMic = () => setMedia(!V.mic, V.cam).catch((e) => { if (root.toast) root.toast(msgErro(e)); });
  V.toggleCam = () => setMedia(V.mic || !V.cam, !V.cam).catch((e) => { if (root.toast) root.toast(msgErro(e)); });
  V.setSoVoz = (on) => { V.soVoz = !!on; if (on && V.cam) setMedia(V.mic, false).catch(() => {}); changed(); };

  // Lista de pessoas da mesa: [{ seat, peerId }]. Quem tem cadeira menor liga para quem tem maior;
  // quem acabou de ligar a mídia liga para todos.
  let lista = []; let meuSeat = -1;
  V.setPeers = (list, mySeat) => {
    lista = (list || []).filter((x) => x && x.peerId); meuSeat = mySeat;
    V.seatOf = {}; lista.forEach((x) => (V.seatOf[x.peerId] = x.seat));
    const ids = new Set(lista.map((x) => x.peerId));
    Object.keys(V.calls).forEach((id) => { if (!ids.has(id)) { try { V.calls[id].close(); } catch (e) {} delete V.calls[id]; dropRemote(id); } });
    if (V.local) lista.forEach((x) => { if (x.seat !== meuSeat && !V.calls[x.peerId] && meuSeat < x.seat) callTo(x.peerId); });
  };
  function callTo(id) { if (!V.peer || !V.peer.open || id === V.peer.id) return; try { const c = V.peer.call(id, V.local); if (c) hook(c); } catch (e) {} }
  function recall() { Object.keys(V.calls).forEach((id) => { try { V.calls[id].close(); } catch (e) {} delete V.calls[id]; }); if (V.local) lista.forEach((x) => { if (x.seat !== meuSeat) callTo(x.peerId); }); }

  // Desenha o vídeo redondo no lugar do avatar de cada cadeira (chamado depois de cada desenho da mesa).
  V.decorate = () => {
    if (typeof document === 'undefined') return;
    const bySeat = {}; Object.keys(V.remotes).forEach((id) => { if (V.seatOf[id] != null) bySeat[V.seatOf[id]] = V.remotes[id].stream; });
    if (V.local && V.cam && meuSeat >= 0) bySeat[meuSeat] = V.local;
    document.querySelectorAll('.seat[data-seat]').forEach((el) => {
      const s = +el.dataset.seat; const st = bySeat[s]; const av = el.querySelector('.av');
      if (st && st.getVideoTracks().length && av && av.tagName !== 'VIDEO') {
        const vd = document.createElement('video'); vd.className = 'av vid'; vd.muted = true; vd.autoplay = true; vd.setAttribute('playsinline', ''); vd.setAttribute('muted', '');
        vd.style.cssText = (av.getAttribute('style') || '') + ';object-fit:cover;transform:' + (s === meuSeat ? 'scaleX(-1)' : 'none');
        vd.srcObject = st; av.replaceWith(vd); const p = vd.play(); if (p && p.catch) p.catch(() => {});
      }
    });
    paintSpeak();
  };
  function paintSpeak() {
    if (typeof document === 'undefined') return;
    const on = {}; Object.keys(V.falando).forEach((id) => { if (V.falando[id] && V.seatOf[id] != null) on[V.seatOf[id]] = true; });
    document.querySelectorAll('.seat[data-seat]').forEach((el) => el.classList.toggle('fala', !!on[+el.dataset.seat]));
  }
  V.active = () => !!V.local || Object.keys(V.remotes).length > 0;
  // Sair da mesa: fecha tudo e solta câmera e microfone.
  V.stop = () => {
    Object.keys(V.calls).forEach((id) => { try { V.calls[id].close(); } catch (e) {} }); V.calls = {};
    Object.keys(V.remotes).forEach(dropRemote);
    if (V.local) V.local.getTracks().forEach((t) => t.stop()); V.local = null; V.mic = false; V.cam = false; V.peer = null; lista = []; meuSeat = -1; changed();
  };
  root.Voz = V;
})(typeof window !== 'undefined' ? window : globalThis);
