// ---------- helpers ----------
const $ = s => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const kHz = f => (f / 1000).toFixed(1) + ' kHz';
const dayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

// ---------- saved state (this device only) ----------
const DEFAULTS = {set: {vol: 50, answer: true, callOut: true, flock: true, ownVoice: true, quiet: false, show: true, sens: 55, bird: 'sky', angle: 8, lively: 1, bg: '', cere: '', birds: []}, n: 0, pitch: 3100, answered: 0, fav: {}, day: {key: '', count: 0}};
let S = JSON.parse(JSON.stringify(DEFAULTS));
try { const raw = JSON.parse(localStorage.getItem('perchy.v3') || 'null'); if (raw) { Object.assign(S, raw); S.set = Object.assign({}, DEFAULTS.set, raw.set || {}); } } catch (e) {}
let saveT;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem('perchy.v3', JSON.stringify(S)); } catch (e) {} }, 300); }

// ---------- sound ----------
const LIB = window.PERCHY_SOUNDS || {calls: [], beds: []};
let ctx = null, master = null, voice = null, far = null, voiceAn = null, envBuf = null;
let outputUntil = 0;          // performance.now() until which Perchy's own sound is in the air
let lastSoundEnd = 0;         // Date.now() when Perchy's last call ended
const bufs = new Map(), bedBufs = new Map(); let loading = null; const recent = [];
function ensureAudio() {
  if (!ctx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: 'interactive'});
    const lim = ctx.createDynamicsCompressor(); // only a safety limiter: calls keep their natural attack
    lim.threshold.value = -5; lim.knee.value = 4; lim.ratio.value = 14; lim.attack.value = 0.002; lim.release.value = 0.12;
    master = ctx.createGain(); master.connect(lim); lim.connect(ctx.destination);
    voice = ctx.createGain(); voice.connect(master);
    voiceAn = ctx.createAnalyser(); voiceAn.fftSize = 512; voice.connect(voiceAn); envBuf = new Float32Array(voiceAn.fftSize);
    // the flock in the distance: a little quieter, with only the very top rolled off, as sound a few trees away is
    far = ctx.createGain(); far.gain.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7500; lp.Q.value = 0.4;
    far.connect(lp); lp.connect(master);
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function applyVolume() { if (master) master.gain.value = Math.pow(S.set.vol / 100, 1.6) * 1.5; }
function markOutput(ms) { outputUntil = Math.max(outputUntil, performance.now() + ms); }
function decode(b64) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Promise(res => ctx.decodeAudioData(u8.buffer, b => res(b), () => res(null)));
}
function loadSounds() {
  if (loading) return loading;
  ensureAudio();
  loading = Promise.all([
    ...LIB.calls.map(c => decode(c.b64).then(b => { if (b) bufs.set(c.id, b); })),
    ...LIB.beds.map(c => decode(c.b64).then(b => { if (b) bedBufs.set(c.id, b); }))
  ]);
  return loading;
}
// How open the beak should be right now, taken from the sound actually playing.
function voiceEnv() {
  if (!voiceAn) return 0;
  voiceAn.getFloatTimeDomainData(envBuf);
  let s = 0; for (let i = 0; i < envBuf.length; i++) s += envBuf[i] * envBuf[i];
  return clamp(Math.sqrt(s / envBuf.length) * 4.5, 0, 1);
}
function say(clip, opts = {}) {
  const buf = bufs.get(clip.id); if (!buf) return 0;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const rate = opts.rate || 1; src.playbackRate.value = rate;
  const g = ctx.createGain(); g.gain.value = opts.level == null ? 1 : opts.level;
  src.connect(g); g.connect(opts.far ? far : voice); src.start();
  const d = buf.duration / rate;
  markOutput(d * 1000 + 80);
  if (!opts.far) lastSoundEnd = Date.now() + d * 1000;
  recent.push(clip.id); if (recent.length > 7) recent.shift();
  return d;
}
// Pick a real call that suits the moment: near the bird's pitch, not one just used, and more often the ones your bird answers.
function choose(kind, pitch) {
  let pool = LIB.calls.filter(c => bufs.has(c.id) && c.kind === kind && !recent.includes(c.id));
  if (!pool.length) pool = LIB.calls.filter(c => bufs.has(c.id) && c.kind === kind);
  if (!pool.length) return null;
  const scored = pool.map(c => ({c, s: Math.abs(Math.log(c.pitch / pitch)) * 5 - Math.log1p(S.fav[c.id] || 0) * 0.3 + Math.random() * 0.45}));
  scored.sort((a, b) => a.s - b.s);
  return scored[Math.floor(Math.random() * Math.min(4, scored.length))].c;
}

// A soft warble made from real runs of notes. Budgies answer warble with warble. Rather than piecing single notes together
// (which sounded choppy), Perchy plays an unbroken stretch of several notes from one real recording, with the bird's own
// rhythm and the faint sound of the air between notes, and sometimes runs straight on into a second stretch.
let RUNS = null;
function warble(o = {}) {
  if (!RUNS) {
    RUNS = [];
    for (const c of LIB.calls) { const N = c.notes || []; if (N.length < (c.kind === 'own' ? 1 : 2)) continue;
      for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++) { const a = Math.max(0, N[i][0] - 0.03), b = Math.min(c.dur, N[j][1] + 0.06); if (b - a > 3.2) break; RUNS.push({c, a, b, n: j - i + 1}); } }
  }
  // with "your bird's own warble" on, Perchy warbles in your bird's voice a little over half the time, otherwise in a wild bird's
  const own = RUNS.filter(r => bufs.has(r.c.id) && r.c.kind === 'own'), wild = RUNS.filter(r => bufs.has(r.c.id) && r.c.kind !== 'own');
  if (!own.length && !wild.length) return 0;
  const useOwn = S.set.ownVoice && own.length > 0, lean = rand(0.35, 0.75);   // how much of this warble is in your bird's voice
  const target = o.pitch || S.pitch, want = o.sec || rand(1.2, 2.4), lvl = o.level == null ? 0.7 : o.level, t0 = ctx.currentTime + 0.03;
  let t = 0, last = null;
  for (let k = 0; k < 3 && t < want - 0.4; k++) {
    // a run that fits the time left and is near the wanted pitch, from a different recording than the last one
    const ok = useOwn && (Math.random() < lean || !wild.length) ? own : wild.length ? wild : own;
    const left = want - t, fit = ok.filter(r => r.c !== (last && last.c) && r.b - r.a <= left + 0.5 && r.b - r.a >= Math.min(0.6, left));
    const pool = fit.length ? fit : ok; let r = pick(pool);
    for (let i = 0; i < 10 && Math.abs(Math.log(r.c.pitch / target)) > 0.08; i++) r = pick(pool);
    last = r;
    // a little different every time: wild notes lean toward your bird's pitch, your bird's own song sometimes drops a touch lower and slower
    const rate = r.c.kind === 'own' ? (Math.random() < 0.3 ? rand(0.9, 0.96) : rand(0.97, 1.04)) : clamp(target / r.c.pitch, 0.95, 1.05) * rand(0.98, 1.02), len = r.b - r.a, d = len / rate, s0 = t0 + t, lv = lvl * rand(0.8, 1);
    const src = ctx.createBufferSource(); src.buffer = bufs.get(r.c.id); src.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, s0); g.gain.linearRampToValueAtTime(lv, s0 + 0.03); g.gain.setValueAtTime(lv, s0 + d - 0.06); g.gain.linearRampToValueAtTime(0, s0 + d);
    src.connect(g); g.connect(voice); src.start(s0, r.a, len);
    t += d + (Math.random() < 0.6 ? rand(-0.04, 0.12) : rand(0.25, 0.5));   // mostly runs straight on, sometimes a short breath
  }
  // now and then a budgie slips a word it has picked up into its warble
  if (o.words !== false && PHRASES.length && Math.random() < 0.22) t += sayPhrase(null, {at: t0 + t + rand(0.05, 0.3) - ctx.currentTime, level: lvl * 1.1}) + 0.3;
  markOutput(t * 1000 + 80); lastSoundEnd = Date.now() + t * 1000;
  return t;
}
const isWarble = f => f.dur > 1.1 || f.syl >= 4;

// ---------- your phrases ----------
// Budgies copy words in a voice of their own: high, quick and a little breathy and raspy. Perchy records you saying a phrase
// and turns it into that: it plays your recording faster (which also raises it), drops the deep chest part of the voice,
// and adds a breathy layer rebuilt from noise shaped by your voice, band by band.
// Everything stays on this device.
let PHRASES = [];   // {id, text, buf}
const DB = {db: null, open() { return this.db || (this.db = new Promise(res => { try { const r = indexedDB.open('perchy', 1); r.onupgradeneeded = () => r.result.createObjectStore('phrases', {keyPath: 'id'}); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } })); },
  async all() { const db = await this.open(); if (!db) return []; return new Promise(res => { const q = db.transaction('phrases').objectStore('phrases').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); },
  async put(v) { const db = await this.open(); if (db) db.transaction('phrases', 'readwrite').objectStore('phrases').put(v); },
  async del(id) { const db = await this.open(); if (db) db.transaction('phrases', 'readwrite').objectStore('phrases').delete(id); }};
async function budgify(buf) {
  const sr = 44100, d = buf.getChannelData(0);
  let pk = 0; for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
  let a = 0, b = d.length - 1; const thr = pk * 0.08; while (a < b && Math.abs(d[a]) < thr) a++; while (b > a && Math.abs(d[b]) < thr) b--;
  a = Math.max(0, a - Math.round(buf.sampleRate * 0.03)); b = Math.min(d.length, b + Math.round(buf.sampleRate * 0.08));
  const cut = new AudioBuffer({length: Math.max(1, b - a), sampleRate: buf.sampleRate, numberOfChannels: 1}); cut.copyToChannel(d.slice(a, b), 0);
  const speed = 1.7, dur = cut.duration / speed + 0.15, oc = new OfflineAudioContext(1, Math.ceil(dur * sr), sr);
  const src = oc.createBufferSource(); src.buffer = cut; src.playbackRate.value = speed;
  const nb = oc.createBuffer(1, Math.ceil(dur * sr), sr), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const noise = oc.createBufferSource(); noise.buffer = nb;
  const buzz = oc.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 610;
  const wob = oc.createOscillator(), wobG = oc.createGain(); wob.frequency.value = 23; wobG.gain.value = 40; wob.connect(wobG); wobG.connect(buzz.frequency);
  const carrier = oc.createGain(), nG = oc.createGain(), bG = oc.createGain(); nG.gain.value = 1; bG.gain.value = 0;
  noise.connect(nG); nG.connect(carrier); buzz.connect(bG); bG.connect(carrier);
  const abs = oc.createWaveShaper(), curve = new Float32Array(1025); for (let i = 0; i < curve.length; i++) curve[i] = Math.abs(i / 512 - 1); abs.curve = curve;
  const out = oc.createGain(), breath = oc.createGain(); breath.gain.value = 0.35; breath.connect(out); out.connect(oc.destination);
  const N = 18, lo = 260, hi = 5200;
  for (let k = 0; k < N; k++) {
    const f = lo * Math.pow(hi / lo, k / (N - 1));
    if (f * 1.2 < 1100) continue;                                  // nothing deep: a budgie's voice has no chest
    const an = oc.createBiquadFilter(); an.type = 'bandpass'; an.frequency.value = f; an.Q.value = 5;
    const sh = oc.createWaveShaper(); sh.curve = curve;
    const env = oc.createBiquadFilter(); env.type = 'lowpass'; env.frequency.value = 35; env.Q.value = 0.5;
    const syn = oc.createBiquadFilter(); syn.type = 'bandpass'; syn.frequency.value = Math.min(9500, f * 1.2); syn.Q.value = 5;
    const vca = oc.createGain(); vca.gain.value = 0;
    src.connect(an); an.connect(sh); sh.connect(env); env.connect(vca.gain);
    carrier.connect(syn); syn.connect(vca); vca.connect(breath);
  }
  const clear = oc.createBiquadFilter(), clear2 = oc.createBiquadFilter(), cg = oc.createGain(); cg.gain.value = 1;
  for (const h of [clear, clear2]) { h.type = 'highpass'; h.frequency.value = 1050; h.Q.value = 0.7; }
  src.connect(clear); clear.connect(clear2); clear2.connect(cg); cg.connect(out);
  src.start(); noise.start(); buzz.start(); wob.start();
  const r = await oc.startRendering(), x = r.getChannelData(0);
  let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  const g = m ? 0.85 / m : 1, fn = Math.round(sr * 0.02); for (let i = 0; i < x.length; i++) x[i] *= g * Math.min(1, i / fn, (x.length - 1 - i) / fn);
  return r;
}
function sayPhrase(p, o = {}) {
  if (!PHRASES.length || !ctx) return 0; p = p || pick(PHRASES);
  const src = ctx.createBufferSource(); src.buffer = p.buf; src.playbackRate.value = rand(0.97, 1.04);
  const g = ctx.createGain(); g.gain.value = o.level == null ? 0.8 : o.level; src.connect(g); g.connect(voice);
  src.start(ctx.currentTime + Math.max(0, o.at || 0)); const d = p.buf.duration / src.playbackRate.value;
  if (!o.at) { markOutput(d * 1000 + 80); lastSoundEnd = Date.now() + d * 1000; }
  return d;
}
function renderPhrases() {
  const ul = $('#phraseList'); ul.innerHTML = '';
  if (!PHRASES.length) { const li = document.createElement('li'); li.innerHTML = '<span class="muted small">No phrases yet</span>'; ul.append(li); return; }
  for (const p of PHRASES) {
    const li = document.createElement('li'), t = document.createElement('span'); t.textContent = p.text;
    const play = document.createElement('button'); play.className = 'btn'; play.textContent = '▶ Hear it'; play.onclick = () => { ensureAudio(); sayPhrase(p, {level: 0.9}); };
    const del = document.createElement('button'); del.className = 'btn ghost'; del.textContent = 'Delete'; del.onclick = () => { PHRASES = PHRASES.filter(q => q !== p); DB.del(p.id); renderPhrases(); };
    li.append(t, play, del); ul.append(li);
  }
}
async function loadPhrases() {
  const rows = await DB.all(); ensureAudio();
  PHRASES = rows.map(r => { const b = ctx.createBuffer(1, r.pcm.length, r.sr); b.copyToChannel(r.pcm, 0); return {id: r.id, text: r.text, buf: b}; });
  renderPhrases();
}
const Rec = {mr: null, stream: null, chunks: [], t: 0, stopT: 0, busy: false};
async function recStart() {
  if (Rec.mr || Rec.busy) return;
  if (!$('#phraseText').value.trim()) { toast('Type the phrase first'); $('#phraseText').focus(); return; }
  if (!window.MediaRecorder || !navigator.mediaDevices) { toast("This browser can't record here"); return; }
  ensureAudio();
  try { Rec.stream = await navigator.mediaDevices.getUserMedia({audio: true}); } catch (e) { toast('Allow the microphone to record a phrase'); return; }
  Rec.chunks = []; Rec.mr = new MediaRecorder(Rec.stream); Rec.mr.ondataavailable = e => { if (e.data.size) Rec.chunks.push(e.data); };
  Rec.mr.onstop = recDone; Rec.mr.start(); Rec.t = Date.now(); Rec.listening = true;
  $('#recBtn').classList.add('rec'); $('#recBtn').textContent = 'Recording… let go to stop';
  Rec.stopT = setTimeout(recStop, 4000);
}
function recStop() { clearTimeout(Rec.stopT); if (Rec.mr && Rec.mr.state !== 'inactive') Rec.mr.stop(); }
async function recDone() {
  const mr = Rec.mr; Rec.mr = null; Rec.stream.getTracks().forEach(t => t.stop()); Rec.busy = true;
  $('#recBtn').classList.remove('rec'); $('#recBtn').textContent = 'Making the budgie version…';
  try {
    if (Date.now() - Rec.t < 400) throw new Error('short');
    const raw = await new Blob(Rec.chunks, {type: mr.mimeType}).arrayBuffer(), buf = await ctx.decodeAudioData(raw), out = await budgify(buf);
    const text = $('#phraseText').value.trim(), id = 'p' + Date.now().toString(36), pcm = out.getChannelData(0).slice();
    DB.put({id, text, sr: out.sampleRate, pcm}); PHRASES.push({id, text, buf: out}); if (PHRASES.length > 8) { DB.del(PHRASES[0].id); PHRASES.shift(); }
    $('#phraseText').value = ''; renderPhrases(); sayPhrase(PHRASES[PHRASES.length - 1], {level: 0.9});
  } catch (e) { toast(e.message === 'short' ? 'Hold the button while you speak' : "That recording didn't work. Try again"); }
  Rec.busy = false; Rec.listening = false; $('#recBtn').textContent = 'Hold to record';
}

// ---------- quiet hours ----------
function quietNow() {
  if (!S.set.quiet) return false;
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  return m >= 20 * 60 + 30 || m < 7 * 60;
}

// ---------- listening ----------
const Mic = {stream: null, an: null, timer: null, fd: null, floor: null, lowFloor: null, lowHist: [], cur: null, on: false, level: -100, ignored: 0, log: null};
async function startListening() {
  ensureAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { micUnavailable(); return false; }
  try {
    Mic.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
  } catch (e) { micUnavailable(); return false; }
  const src = ctx.createMediaStreamSource(Mic.stream);
  Mic.an = ctx.createAnalyser(); Mic.an.fftSize = 1024; Mic.an.smoothingTimeConstant = 0;
  src.connect(Mic.an); Mic.fd = new Float32Array(Mic.an.frequencyBinCount);
  Mic.floor = null; Mic.lowHist = []; Mic.timer = setInterval(detect, 20); Mic.on = true; $('#micNote').hidden = true;
  return true;
}
function stopListening() {
  clearInterval(Mic.timer); Mic.timer = null; Mic.on = false; Mic.cur = null;
  if (Mic.stream) Mic.stream.getTracks().forEach(t => t.stop());
  Mic.stream = null; $('#levelBar').style.width = '0'; $('#levelTxt').textContent = 'mic off';
}
function micUnavailable() {
  const n = $('#micNote'); n.hidden = false;
  n.textContent = "Perchy can't use the microphone here, so it can't hear your bird. Open this page in Safari or Chrome on the phone or tablet by the cage and allow the microphone. Calling out and the distant flock still work, and “Try a pretend call” shows how answering sounds.";
}
// Telling a budgie from everything else. Budgies make two kinds of sound worth answering: contact calls (short, about
// 0.1-0.3 s, sweeping fast between about 2 and 4 kHz) and warble, the long chattering song a budgie sings when it feels
// social, which mixes call-like notes, buzzy noisy notes and clicks, and reaches down to about 1 kHz. What sets people
// apart is the voice underneath speech: a human voice puts most of its energy below about 500 Hz, where a budgie makes
// almost nothing. A whistle holds a steady or smoothly sliding pitch, a hiss is noisy from start to end with no notes in
// it, and knocks and clicks are over in a moment.
function detect() {
  const an = Mic.an; if (!an) return;
  an.getFloatFrequencyData(Mic.fd);
  const binHz = ctx.sampleRate / an.fftSize, fd = Mic.fd, B = hz => Math.round(hz / binHz);
  const l0 = Math.max(1, B(90)), l1 = B(480), i0 = B(1150), i2 = B(6500), i3 = Math.min(fd.length - 1, B(9500));
  let band = 0, all = 0, cen = 0, low = 0, logSum = 0, pk = i0, pv = -Infinity;
  for (let i = l0; i < i3; i++) {
    const db = Math.max(fd[i], -160), p = Math.pow(10, db / 10); all += p;
    if (i < l1) low += p;
    else if (i >= i0 && i <= i2) { band += p; cen += p * i; logSum += db; if (db > pv) { pv = db; pk = i; } }
  }
  const nb = i2 - i0 + 1, bandDb = 10 * Math.log10(band + 1e-16), lowDb = 10 * Math.log10(low + 1e-16), ratio = band / (all + 1e-16), freq = cen / (band + 1e-16) * binHz;
  const flat = Math.pow(10, logSum / nb / 10) / (band / nb + 1e-16); // near 0 for a clear note, about 0.5 for hiss
  const now = performance.now(), suppressed = now < outputUntil + 260;
  if (bandDb < -125) return; // the microphone hasn't started delivering sound yet
  if (Mic.floor == null) { Mic.floor = bandDb + 3; Mic.lowFloor = lowDb + 3; }
  const lowEx = lowDb - Mic.lowFloor, lowRel = lowDb - bandDb; // voice range: above the room's usual level, and against the bird's range
  // the room's usual rumble, as an average that a single loud moment barely moves (a fan or traffic wobbles by a few dB; a voice jumps 15 dB or more)
  if (!suppressed) Mic.lowFloor += (lowDb - Mic.lowFloor) * (lowDb < Mic.lowFloor ? 0.03 : 0.006);
  const voicy = !suppressed && lowEx > 12 && lowRel > -4;   // a voice (or a thump) is sounding in this moment
  Mic.lowHist.push(voicy ? 1 : 0); if (Mic.lowHist.length > 15) Mic.lowHist.shift();
  const margin = 15 - 9 * (S.set.sens / 100);
  const active = !suppressed && bandDb > Mic.floor + margin && ratio > 0.3 && bandDb > -82;
  // the room's usual level: follows quickly when nothing is going on, and creeps up under a sound that never stops
  if (!suppressed) Mic.floor += (bandDb - Mic.floor) * (bandDb < Mic.floor ? 0.2 : (Mic.cur ? 0.004 : 0.02));
  Mic.level += (bandDb - Mic.level) * 0.3;
  $('#levelBar').style.width = clamp((Mic.level + 95) / 65 * 100, 0, 100) + '%';
  $('#levelTxt').textContent = suppressed ? 'Perchy is calling' : (active || Mic.cur ? 'hearing something' : 'listening');
  let c = Mic.cur;
  if (active) {
    if (!c) c = Mic.cur = {start: now, last: now, fsum: 0, n: 0, syl: 1, inGap: false, flats: [], pks: [], voice: Mic.lowHist.reduce((a, b) => a + b, 0), nv: 0, va: 0, fr: 0};
    if (c.inGap) { c.syl++; c.inGap = false; }
    c.last = now; c.n++; c.loud = Math.max(c.loud || 0, bandDb - Mic.floor); c.fsum += freq; c.flats.push(flat); c.pks.push(pk * binHz);
    if (voicy) c.nv++;
  }
  if (c) {
    c.fr++; if (voicy) c.va++;                                        // voice anywhere in the stretch, gaps included
    const gap = now - c.last;
    if (gap > 45) c.inGap = true;
    if (gap > 320 || suppressed || now - c.start > 6000) finishCall();
  }
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function judge(c) {
  if (c.n < 4) return 'click';                                                     // under about 80 ms
  const f = c.fsum / c.n; if (f < 1500 || f > 5200) return 'a jingle or rattle';   // outside a budgie's range
  if (c.voice >= 3 || c.va / c.fr > 0.2 || c.nv / c.n > 0.25) return 'a voice or a thump';               // a voice sounded just before or through it
  const tonal = c.flats.filter(x => x < 0.25).length / c.n;
  if (median(c.flats) >= 0.45 && tonal < 0.15) return 'a hiss or rustle';           // noisy from start to end, no notes in it
  let big = 0; for (let i = 1; i < c.pks.length; i++) if (Math.abs(c.pks[i] - c.pks[i - 1]) > 250) big++;
  if (c.syl <= 2 && c.last - c.start > 380 && big / (c.pks.length - 1) < 0.15) return 'a whistle or steady tone';   // a budgie's pitch never holds or glides this long
  return null;
}
function finishCall() {
  const c = Mic.cur; Mic.cur = null;
  if (!c || Rec.listening) return;    // you are recording a phrase: not a call
  const why = judge(c);
  if (Mic.log) Mic.log.push({t: Math.round(c.start), dur: Math.round(c.last - c.start + 20), n: c.n, syl: c.syl, f: Math.round(c.fsum / c.n), flat: +median(c.flats).toFixed(3), voice: c.voice, nv: c.nv, va: c.va, fr: c.fr, jf: +(c.pks.slice(1).filter((p, i) => Math.abs(p - c.pks[i]) > 250).length / Math.max(1, c.pks.length - 1)).toFixed(2), jm: median(c.pks.slice(1).map((p, i) => Math.abs(p - c.pks[i]))), why});
  if (why) { if (why !== 'click') { Mic.ignored++; $('#lastIgnored').textContent = why.charAt(0).toUpperCase() + why.slice(1) + ' · ' + new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) + ' · ' + Mic.ignored + ' so far'; } return; }
  onCall({pitch: c.fsum / c.n, syl: clamp(c.syl, 1, 9), dur: (c.last - c.start) / 1000 + 0.02, loud: c.loud || 0}, false);
}

// ---------- conversation ----------
let recentCalls = [];
let awake = false, wakeLock = null, lastReplyAt = 0, pending = null, streak = 0, lastHeardAt = 0, missedCallOuts = 0, nextCallOut = 0, nextFlock = 0;
function describe(f) { return (isWarble(f) ? 'Warble' : 'Call') + ' · ' + kHz(f.pitch) + ' · ' + f.syl + (f.syl === 1 ? ' note' : ' notes') + ' · ' + f.dur.toFixed(2) + ' s'; }
function setCap(t) { $('#cap').textContent = t; }
function onCall(f, pretend) {
  const now = Date.now();
  Bird.notice(); setCap('Heard your bird');
  $('#lastCall').textContent = describe(f) + (pretend ? ' (pretend)' : '');
  if (!pretend) {
    S.n++; S.pitch += (f.pitch - S.pitch) * (S.n < 8 ? 0.3 : 0.08);
    if (S.day.key !== dayKey()) S.day = {key: dayKey(), count: 0};
    S.day.count++;
    // a call soon after one of Perchy's counts as an answer, and that call gets used more
    if (pending && now > pending.t && now - pending.t < 6000) { if (pending.id != null) S.fav[pending.id] = (S.fav[pending.id] || 0) + 1; S.answered++; streak++; missedCallOuts = 0; }
    else if (now - lastSoundEnd > 12000) streak = 0;
  }
  // an excited bird bobs: loud, long or rapid-fire calls make Perchy bob its head, harder the more worked up things are
  recentCalls = recentCalls.filter(t => now - t < 8000); recentCalls.push(now);
  const excite = (f.loud > 26 ? 1 : 0) + (f.dur > 0.7 ? 1 : 0) + (recentCalls.length >= 3 ? 1 : 0) + (streak >= 2 ? 1 : 0);
  if (awake && excite && Math.random() < 0.3 + 0.22 * excite) setTimeout(() => Bird.startAct('bob', performance.now(), 0.35 + 0.28 * excite), rand(900, 1500));
  pending = null; lastHeardAt = now; scheduleCallOut();
  if (quietNow()) $('#lastReply').textContent = 'Quiet hours, not answering';
  else if (S.set.answer && (awake || pretend) && now - lastReplyAt > 1600 && now > lastSoundEnd + 300) {
    lastReplyAt = now;
    // a contact call gets a quick answer, within about half a second; warble is joined once your bird pauses
    setTimeout(() => reply(f), isWarble(f) ? rand(350, 800) : rand(240, 620));
  }
  save(); renderTiles();
}
function reply(f, tries = 0) {
  if (!bufs.size) return;
  const target = f.pitch * 0.6 + S.pitch * 0.4;
  if (isWarble(f)) {
    // Your bird is warbling, which budgies do when they feel sociable. Join in softly once it pauses, but not after every
    // burst: sometimes just listen, the way a flockmate would. If it has started again, wait for the next gap.
    if (Mic.cur && tries < 3) { setTimeout(() => reply(f, tries + 1), 500); return; }
    if (Mic.cur || Math.random() < 0.25) { $('#lastReply').textContent = 'Listening to your bird warble'; return; }
    const d = warble({pitch: target, sec: clamp(f.dur * rand(0.5, 1), 0.8, 3), level: rand(0.5, 0.75)});
    pending = {id: null, t: Date.now() + d * 1000};
    if (Math.random() < 0.4) setTimeout(() => Bird.startAct('bob', performance.now()), rand(200, 600));
    $('#lastReply').textContent = 'Warbled back · ' + kHz(target) + ' · ' + d.toFixed(2) + ' s';
    setCap('Warbling along'); setTimeout(() => { if (awake) setCap(quietNow() ? 'Quiet hours' : 'Listening'); }, d * 1000 + 700);
    return;
  }
  // answer in kind: a chirp for a chirp, a phrase for a longer call, and a burst of chatter once the two of you get going
  let kind = (f.dur < 0.5 && f.syl <= 2) ? 'chirp' : 'phrase';
  if (kind === 'chirp' && Math.random() < 0.3) kind = 'phrase';
  if (streak >= 3 && Math.random() < 0.35) kind = 'chatter';
  const clip = choose(kind, target) || choose('chirp', target); if (!clip) return;
  const rate = clamp(target / clip.pitch, 0.95, 1.05); // lean a little toward your bird's pitch, as flockmates do
  const d = say(clip, {rate, level: rand(0.8, 1)});
  pending = {id: clip.id, t: Date.now() + d * 1000};
  if (streak >= 2 && Math.random() < 0.5) setTimeout(() => { Bird.startAct('bob', performance.now()); }, d * 1000 + 100);
  $('#lastReply').textContent = ({chirp: 'Chirp', phrase: 'Phrase', chatter: 'Chatter'})[clip.kind] + ' · ' + kHz(clip.pitch * rate) + ' · ' + d.toFixed(2) + ' s';
  setCap('Answering'); setTimeout(() => { if (awake) setCap(quietNow() ? 'Quiet hours' : 'Listening'); }, d * 1000 + 700);
}
function callOut(manual) {
  if (!bufs.size) return;
  // Unprompted calls follow Perchy's mood: drowsy or busy grooming it mostly keeps quiet and calls softly when it does;
  // in a sociable or playful spell it sometimes warbles to itself, the sound a contented budgie makes.
  const mood = manual ? '' : Bird.mood, quiet = mood === 'sleepy' || mood === 'grooming';
  if (quiet && Math.random() < 0.6) return;
  if ((mood === 'social' || mood === 'playful') && PHRASES.length && Math.random() < 0.15) {
    const d = sayPhrase(null, {level: rand(0.55, 0.75)}); pending = {id: null, t: Date.now() + d * 1000}; missedCallOuts++;
    $('#lastReply').textContent = 'Said one of your phrases · ' + d.toFixed(2) + ' s'; return;
  }
  if ((mood === 'social' || mood === 'playful') && Math.random() < 0.45) {
    const d = warble({sec: rand(1, 2.2), level: rand(0.35, 0.55)}); pending = {id: null, t: Date.now() + d * 1000}; missedCallOuts++;
    $('#lastReply').textContent = 'Warbled to itself · ' + d.toFixed(2) + ' s'; return;
  }
  const clip = choose(Math.random() < 0.7 ? 'chirp' : 'phrase', S.pitch); if (!clip) return;
  const d = say(clip, {level: manual ? 0.95 : quiet ? rand(0.35, 0.5) : rand(0.55, 0.75), rate: rand(0.98, 1.02)});
  pending = {id: clip.id, t: Date.now() + d * 1000};
  $('#lastReply').textContent = 'Called out · ' + kHz(clip.pitch) + ' · ' + d.toFixed(2) + ' s';
  if (!manual) missedCallOuts++;
}
function scheduleCallOut() { nextCallOut = Date.now() + (missedCallOuts > 5 ? rand(150, 300) : rand(40, 95)) * 1000; }
function playFlock() {
  const ids = [...bedBufs.keys()]; if (!ids.length) return;
  // a random 8 to 14 second stretch of a longer real flock recording, so it is rarely the same twice, faded in and out
  const buf = bedBufs.get(pick(ids)), len = Math.min(buf.duration, rand(8, 14)), off = rand(0, buf.duration - len), now = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rand(0.98, 1.02);
  const g = ctx.createGain(), lv = rand(0.7, 1); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(lv, now + 1.5); g.gain.setValueAtTime(lv, now + len - 2); g.gain.linearRampToValueAtTime(0, now + len);
  src.connect(g); g.connect(far); src.start(now, off, len);
  markOutput(len * 1000 + 150); Bird.listenUp(len);
  setCap('A flock passing'); setTimeout(() => { if (awake) setCap(quietNow() ? 'Quiet hours' : 'Listening'); }, len * 1000);
}
// Once a second: the gentle things Perchy does unprompted.
function tick() {
  setStatus();
  if (!awake || quietNow() || !bufs.size) return;
  const now = Date.now(), busy = performance.now() < outputUntil + 1500 || Mic.cur || now - lastHeardAt < 5000;
  if (busy) return;
  if (S.set.flock && now > nextFlock) { playFlock(); nextFlock = now + rand(150, 300) * 1000; nextCallOut = Math.max(nextCallOut, now + 25000); return; }
  if (S.set.callOut && now > nextCallOut) { callOut(false); scheduleCallOut(); }
}
async function pretendCall() {
  await loadSounds();
  const r = Math.random(), clip = choose(r < 0.45 ? 'chirp' : r < 0.7 ? 'phrase' : 'chatter', rand(2800, 3300)); if (!clip) return;
  const d = say(clip, {level: 0.5, far: true});
  setTimeout(() => onCall({pitch: clip.pitch, syl: clip.n, dur: clip.dur}, true), d * 1000 + 60);
}

// ---------- screen ----------
function setStatus() {
  const p = $('#statusPill'); if (!p) return;
  if (!awake) { p.className = 'pill'; p.textContent = 'Asleep'; return; }
  if (quietNow()) { p.className = 'pill quiet'; p.textContent = 'Quiet hours'; return; }
  p.className = 'pill on'; p.textContent = Mic.on ? 'Listening' : 'Awake, mic off';
}
function renderTiles() {
  const today = S.day.key === dayKey() ? S.day.count : 0;
  const top = Object.entries(S.fav).sort((a, b) => b[1] - a[1])[0], favClip = top && LIB.calls.find(c => String(c.id) === top[0]);
  $('#tiles').innerHTML = [
    [today, 'Calls heard today'], [S.answered, 'Times your bird answered'],
    [S.n ? kHz(S.pitch) : '–', "Your bird's usual pitch"], [favClip ? ({chirp: 'Chirp', phrase: 'Phrase', chatter: 'Chatter'})[favClip.kind] + ' ' + favClip.id : '–', 'Its favorite call']
  ].map(([v, k]) => `<div class="tile"><b>${v}</b><span>${k}</span></div>`).join('');
}
async function wake() {
  if (awake) {
    awake = false; stopListening(); Bird.setAsleep(true); setCap('Dozing');
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    $('#wakeBtn').textContent = 'Wake Perchy'; setStatus(); return;
  }
  ensureAudio(); awake = true; Bird.setAsleep(false);
  $('#wakeBtn').textContent = 'Put Perchy to sleep'; setCap('Waking up'); setStatus();
  await loadSounds();
  if (!awake) return;
  if (!quietNow()) { const c = choose('phrase', S.pitch); if (c) say(c, {level: 0.8}); }
  nextFlock = Date.now() + rand(45, 75) * 1000; missedCallOuts = 0; scheduleCallOut();
  await startListening();
  requestWakeLock(); setStatus(); setCap(quietNow() ? 'Quiet hours' : (Mic.on ? 'Listening' : 'Awake'));
}
async function requestWakeLock() { try { if (navigator.wakeLock && awake) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden && awake) { requestWakeLock(); if (ctx && ctx.state === 'suspended') ctx.resume(); } });

const st = S.set;
$('#wakeBtn').onclick = wake;
$('#simBtn').onclick = pretendCall;
$('#callOutBtn').onclick = async () => { await loadSounds(); callOut(true); };
$('#vol').value = st.vol; $('#vol').oninput = e => { st.vol = +e.target.value; applyVolume(); save(); };
$('#sens').value = st.sens; $('#sens').oninput = e => { st.sens = +e.target.value; save(); };
const bind = (id, key, after) => { $(id).checked = st[key]; $(id).onchange = e => { st[key] = e.target.checked; save(); if (after) after(st[key]); }; };
bind('#answerBack', 'answer'); bind('#callOut', 'callOut', on => { if (on) scheduleCallOut(); });
bind('#bgFlock', 'flock', on => { if (on) nextFlock = Date.now() + 8000; });
bind('#ownVoice', 'ownVoice');
{ const b = $('#recBtn');
  b.addEventListener('pointerdown', e => { e.preventDefault(); recStart(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (Rec.mr) { if (Date.now() - Rec.t < 400) setTimeout(recStop, 400); else recStop(); } });
  b.addEventListener('contextmenu', e => e.preventDefault()); }
renderPhrases(); loadPhrases();
bind('#quietOn', 'quiet', on => { setStatus(); toast(on ? 'Perchy will stay quiet from 8:30 PM to 7 AM' : 'Perchy will make sounds at any hour'); });
const showBird = on => { $('#hiddenMsg').hidden = on; $('#stage').style.visibility = on ? 'visible' : 'hidden'; Bird.setVisible(on); };
bind('#showBird', 'show', showBird);
// Full screen: fill the window with just the bird, and ask the browser for true full screen where it allows it (iPhones do not)
const stageBox = $('#stage').parentElement;
function setSolo(on) {
  document.body.classList.toggle('solo', on); $('#soloBtn').textContent = on ? '✕' : '⤢';
  $('#soloBtn').setAttribute('aria-label', on ? 'Leave full screen' : 'Show only the bird, full screen'); $('#soloBtn').title = on ? 'Leave full screen' : 'Full screen';
  if (!on) setSheet('');
  try { if (on && stageBox.requestFullscreen && !document.fullscreenElement) stageBox.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
}
// In full screen the close button needs a held press, so a peck cannot close it
let holdT = 0, capBack = '';
$('#soloBtn').onclick = () => { if (!document.body.classList.contains('solo')) setSolo(true); };
$('#soloBtn').addEventListener('pointerdown', e => {
  if (!document.body.classList.contains('solo')) return;
  e.preventDefault(); clearTimeout(holdT); $('#soloBtn').classList.add('holding');
  holdT = setTimeout(() => { holdT = 0; $('#soloBtn').classList.remove('holding'); setSolo(false); }, 700);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('#soloBtn').addEventListener(ev, () => {
  if (!holdT) return; clearTimeout(holdT); holdT = 0; $('#soloBtn').classList.remove('holding');
  if (document.body.classList.contains('solo')) { const c = $('#cap'); if (c.textContent !== 'Hold ✕ to leave') capBack = c.textContent; c.textContent = 'Hold ✕ to leave'; setTimeout(() => { if (c.textContent === 'Hold ✕ to leave') c.textContent = capBack; }, 1800); }
});
$('#soloBtn').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && document.body.classList.contains('solo')) { e.preventDefault(); setSolo(false); } });
$('#fullBtn').onclick = () => setSolo(true);
// Settings in full screen: a row of small topic icons along the bottom. A held press on one opens a short strip with only that topic's
// controls, and the bird moves up into the space that is left. A touch on the bird, or on the lit icon, closes it without making a call.
const homes = []; let topic = '', sheetAt = 0;
const wideMq = matchMedia('(min-aspect-ratio:5/4)');
function fitStage() { $('#stage').style.height = topic && !wideMq.matches ? Math.max(120, stageBox.clientHeight - $('#sheet').offsetHeight) + 'px' : ''; }
function setSheet(t) {
  t = t || ''; if (t === topic) return;
  while (homes.length) { const [el, mark] = homes.pop(); mark.replaceWith(el); }
  if (t) for (const el of document.querySelectorAll('[data-topic="' + t + '"]')) { const mark = document.createComment('ctl'); el.before(mark); homes.push([el, mark]); $('#sheetBody').append(el); }
  topic = t; document.body.classList.toggle('sheet-open', !!t); $('#sheet').setAttribute('aria-hidden', t ? 'false' : 'true');
  for (const b of $('#tbar').children) b.classList.toggle('on', b.dataset.t === t);
  if (t) { $('#sheetBody').scrollTop = 0; sheetAt = Date.now(); }
  fitStage();
}
if (window.ResizeObserver) new ResizeObserver(fitStage).observe($('#sheet'));
addEventListener('resize', fitStage);
let gearT = 0;
const HINT = 'Hold an icon to open it';
for (const b of $('#tbar').children) {
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); clearTimeout(gearT); gearT = 0;
    if (topic) { setSheet(b.dataset.t === topic ? '' : b.dataset.t); return; }      // already open: a tap switches topic or closes
    b.classList.add('holding'); gearT = setTimeout(() => { gearT = 0; b.classList.remove('holding'); setSheet(b.dataset.t); }, 600);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => {
    if (!gearT) return; clearTimeout(gearT); gearT = 0; b.classList.remove('holding');
    const c = $('#cap'); if (c.textContent !== HINT) capBack = c.textContent; c.textContent = HINT; setTimeout(() => { if (c.textContent === HINT) c.textContent = capBack; }, 1800);
  });
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet(b.dataset.t === topic ? '' : b.dataset.t); } });
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('solo')) setSolo(false); });
document.addEventListener('keydown', e => { if (e.key !== 'Escape' || !document.body.classList.contains('solo')) return; if (topic) setSheet(''); else setSolo(false); });
// ---------- touch to call ----------
// A touch anywhere on the picture (a finger, or your bird's beak) makes Perchy look at the spot and call.
// One call at a time: quick repeated pecks do not stack calls. In the page a touch counts when it lifts without sliding, so scrolling still works; in full screen it counts the moment it lands.
let touchBusy = 0, touchDown = null;
async function touched(e) {
  const r = $('#stage').getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  if (!awake) { if (Date.now() > touchBusy) { touchBusy = Date.now() + 1500; wake(); } return; }
  Bird.touch((x - 0.5) * 2, (y - 0.36) * 2);
  if (Date.now() < touchBusy) return;
  touchBusy = Date.now() + 1200; await loadSounds(); if (!awake || !bufs.size) return;
  const clip = choose(Math.random() < 0.75 ? 'chirp' : 'phrase', S.pitch); if (!clip) return;
  const d = say(clip, {level: 0.95, rate: rand(0.98, 1.02)});
  pending = {id: clip.id, t: Date.now() + d * 1000}; touchBusy = Date.now() + Math.max(900, d * 1000 + 350);
  nextCallOut = Math.max(nextCallOut, Date.now() + 25000);
  $('#lastReply').textContent = 'Touched · ' + kHz(clip.pitch) + ' · ' + d.toFixed(2) + ' s';
}
const onStage = e => e.target === $('#stage');
stageBox.addEventListener('pointerdown', e => {
  if (!onStage(e) || e.button > 0) return;
  if (document.body.classList.contains('sheet-open')) { e.preventDefault(); touchDown = null; if (Date.now() - sheetAt > 400) setSheet(''); return; }
  if (document.body.classList.contains('solo')) { e.preventDefault(); touched(e); touchDown = null; } else touchDown = {id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now()};
});
stageBox.addEventListener('pointerup', e => {
  const d = touchDown; touchDown = null;
  if (d && d.id === e.pointerId && onStage(e) && Date.now() - d.t < 700 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 14) touched(e);
});
stageBox.addEventListener('pointercancel', () => { touchDown = null; });
stageBox.addEventListener('contextmenu', e => e.preventDefault());
// ---------- choosing and designing the bird ----------
// A bird is a short list of settings (colours, markings, size, build...). Presets are built in; your own are kept on this device.
if (!Array.isArray(st.birds)) st.birds = [];
if ({blue: 1, green: 1, yellow: 1}[st.bird]) st.bird = st.bird === 'blue' ? 'sky' : st.bird;   // names used by the earlier version
const allBirds = () => [...Bird.PRESETS, ...st.birds];
const SPEC_KEYS = ['body', 'face', 'marks', 'cheek', 'cere', 'markAmt', 'size', 'build', 'fluff', 'tailLen', 'barStart', 'cap'];
function fillControls(sp) { document.querySelectorAll('#custom [data-k]').forEach(el => { el.value = sp[el.dataset.k]; }); }
const CERE0 = '#5b86d8';                                        // the cere is its own choice (blue unless you change it); a variety never changes it
if (!/^#[0-9a-f]{6}$/i.test(st.cere || '')) { const mine = st.birds.find(b => b.id === st.bird); st.cere = mine && mine.cere ? mine.cere : CERE0; }
function renderBirds() {
  for (const [sel, list, none] of [['#birdPick', Bird.PRESETS, 'Choose a variety'], ['#myPick', st.birds, st.birds.length ? 'Choose a saved bird' : 'None saved yet']]) {
    const box = $(sel), here = !st.edited && list.some(b => b.id === st.bird); box.innerHTML = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = none; o0.disabled = list.length > 0; box.append(o0);
    for (const b of list) { const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; box.append(o); }
    box.value = here ? st.bird : ''; box.classList.toggle('on', here); box.disabled = !list.length;
  }
  const mine = st.birds.some(b => b.id === st.bird); $('#delBird').hidden = !mine;
  document.querySelectorAll('#cereChips button').forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === st.cere.toLowerCase())); $('#cerePick').value = st.cere;
}
function chooseBird(id) {
  const b = allBirds().find(x => x.id === id) || Bird.PRESETS[0], own = st.birds.includes(b);
  const cur = st.spec || Bird.getSpec(), keep = {};
  if (!own && cur) for (const k of ['size', 'build', 'fluff', 'tailLen', 'barStart', 'cap']) if (cur[k] !== undefined) keep[k] = cur[k];   // a variety changes colours only; size and shape stay as you set them
  if (own && b.cere) st.cere = b.cere;                         // one of your own birds brings the cere it was saved with
  st.bird = b.id; st.spec = Object.assign({}, b, keep, {cere: st.cere}); st.edited = false; Bird.setSpec(st.spec); fillControls(Bird.getSpec()); $('#birdName').value = own ? b.name : '';
  $('#stage').setAttribute('aria-label', 'Perchy, a ' + b.name.toLowerCase() + ' budgie on a branch'); renderBirds(); save();
}
for (const sel of ['#birdPick', '#myPick']) $(sel).onchange = e => { if (e.target.value) chooseBird(e.target.value); };
function setCere(c) { st.cere = c; st.spec = Object.assign({}, Bird.getSpec(), st.spec || {}, {cere: c}); Bird.setSpec(st.spec); renderBirds(); save(); }
document.querySelectorAll('#cereChips button').forEach(b => { b.onclick = () => setCere(b.dataset.c); });
$('#cerePick').oninput = e => setCere(e.target.value);
let specT;
document.querySelectorAll('#custom [data-k]').forEach(el => { el.oninput = () => {
  const k = el.dataset.k; st.spec = Object.assign({}, Bird.getSpec(), st.spec || {}, {[k]: el.type === 'range' ? +el.value : el.value}); if (k === 'body' || k === 'face') st.spec.tail = '';
  st.edited = true; clearTimeout(specT); specT = setTimeout(() => { Bird.setSpec(st.spec); renderBirds(); save(); }, 40);
}; });
$('#custBtn').onclick = () => { const open = $('#custom').hidden; $('#custom').hidden = !open; $('#custBtn').setAttribute('aria-expanded', String(open)); $('#custBtn').textContent = open ? 'Done' : 'Customize'; };
$('#saveBird').onclick = () => {
  const name = $('#birdName').value.trim() || 'My bird ' + (st.birds.length + 1), b = Object.assign({}, Bird.getSpec(), {name, id: 'my' + Date.now().toString(36)});
  st.birds.push(b); if (st.birds.length > 12) st.birds.shift(); chooseBird(b.id); toast(name + ' saved');
};
$('#delBird').onclick = () => { st.birds = st.birds.filter(b => b.id !== st.bird); chooseBird('sky'); };
$('#lively').value = st.lively; $('#lively').oninput = e => { st.lively = +e.target.value; Bird.setLively(st.lively); save(); };
function setBg(c) { st.bg = c; Bird.setBg(c); save(); document.querySelectorAll('#bgChips button').forEach(b => b.classList.toggle('on', (b.dataset.c || '') === c)); if (c) $('#bgPick').value = c; }
document.querySelectorAll('#bgChips button').forEach(b => { b.onclick = () => setBg(b.dataset.c || ''); });
$('#bgPick').oninput = e => setBg(e.target.value);
$('#angle').value = st.angle; $('#angle').oninput = e => { st.angle = +e.target.value; Bird.setAngle(st.angle); save(); };

// A button for every movement, so each can be seen on demand
for (const [label, act] of [['Spread wing', 'spread'], ['Stretch', 'stretch'], ['Shuffle', 'shuffle'], ['Preen', 'preen'], ['Yawn', 'yawn'], ['Ruffle and shake', 'shake'], ['Tail wag', 'tailwag'], ['Peer', 'peer'], ['Turn around', 'turn'], ['Head bob', 'bob'], ['Beak grind', 'grind'], ['Raise forehead', 'puff'], ['Look at your bird', 'notice'], ['Chirp', 'chirp']]) {
  const b = document.createElement('button'); b.className = 'btn'; b.textContent = label; $('#actBtns').append(b);
  b.onclick = async () => {
    if (!awake) { toast('Wake Perchy first'); return; }
    if (act === 'chirp') { await loadSounds(); callOut(true); } else if (act === 'notice') Bird.notice(); else Bird.actNow(act);
  };
}

if (st.spec) st.spec.cere = st.cere;
Bird.init($('#stage'), {getEnv: voiceEnv, spec: st.spec || Object.assign({}, allBirds().find(b => b.id === st.bird) || Bird.PRESETS[0], {cere: st.cere}), angle: st.angle, lively: st.lively});
setBg(st.bg || '');
fillControls(Bird.getSpec()); renderBirds();
showBird(st.show); renderTiles(); setStatus();
setInterval(tick, 1000);
window.__perchy = {S, Mic, LIB, Bird, warble, callOut, loadSounds, budgify, sayPhrase, phrases: () => PHRASES, out: () => voice, ctx: () => ctx, state: () => ({awake, streak, heard: S.n, answered: S.answered, lastCall: $('#lastCall').textContent, lastReply: $('#lastReply').textContent})};
