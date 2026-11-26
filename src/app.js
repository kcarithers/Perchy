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
const DEFAULTS = {set: {vol: 50, answer: true, callOut: true, flock: true, quiet: false, show: true, real: true, sens: 55}, n: 0, pitch: 3100, answered: 0, fav: {}, day: {key: '', count: 0}};
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
    // the distant flock: quieter and with the top end rolled off, as far-off sound is
    far = ctx.createGain(); far.gain.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4600; lp.Q.value = 0.4;
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
// Telling a budgie from everything else. A budgie call is a burst of sound between about 2 and 5.5 kHz whose pitch
// jumps around quickly. Speech has a voice underneath it (energy below 1.2 kHz) and hissy consonants, a whistle holds
// a steady or smoothly sliding pitch, and knocks and clicks are over in a moment. Only the first gets an answer.
function detect() {
  const an = Mic.an; if (!an) return;
  an.getFloatFrequencyData(Mic.fd);
  const binHz = ctx.sampleRate / an.fftSize, fd = Mic.fd;
  const l0 = Math.floor(150 / binHz), l1 = Math.floor(1200 / binHz), i0 = Math.floor(1000 / binHz), i1 = Math.floor(1900 / binHz), i2 = Math.ceil(5600 / binHz), i3 = Math.min(fd.length - 1, Math.ceil(9000 / binHz));
  let band = 0, total = 0, cen = 0, low = 0, logSum = 0, pk = i1, pv = -Infinity;
  for (let i = l0; i < l1; i++) low += Math.pow(10, fd[i] / 10);
  for (let i = i0; i <= i3; i++) {
    const db = Math.max(fd[i], -160), p = Math.pow(10, db / 10); total += p;
    if (i >= i1 && i <= i2) { band += p; cen += p * i; logSum += db; if (db > pv) { pv = db; pk = i; } }
  }
  const nb = i2 - i1 + 1, bandDb = 10 * Math.log10(band + 1e-16), lowDb = 10 * Math.log10(low + 1e-16), ratio = band / (total + 1e-16), freq = cen / (band + 1e-16) * binHz;
  const flat = Math.pow(10, logSum / nb / 10) / (band / nb + 1e-16); // near 0 for a clear tone, about 0.5 for hiss
  const now = performance.now(), suppressed = now < outputUntil + 260;
  if (bandDb < -125) return; // the microphone hasn't started delivering sound yet
  if (Mic.floor == null) { Mic.floor = bandDb + 3; Mic.lowFloor = lowDb + 3; }
  const lowEx = lowDb - Mic.lowFloor; // how far the voice range has risen above the room's usual level
  Mic.lowFloor += (lowDb - Mic.lowFloor) * (lowDb < Mic.lowFloor ? 0.2 : 0.01);
  Mic.lowHist.push(suppressed ? 0 : lowEx); if (Mic.lowHist.length > 18) Mic.lowHist.shift();
  const margin = 15 - 9 * (S.set.sens / 100);
  const active = !suppressed && bandDb > Mic.floor + margin && ratio > 0.5 && bandDb > -80;
  // the room's usual level: follows quickly when nothing is going on, and creeps up under a sound that never stops
  if (!suppressed) Mic.floor += (bandDb - Mic.floor) * (bandDb < Mic.floor ? 0.2 : (Mic.cur ? 0.004 : 0.02));
  Mic.level += (bandDb - Mic.level) * 0.3;
  $('#levelBar').style.width = clamp((Mic.level + 95) / 65 * 100, 0, 100) + '%';
  $('#levelTxt').textContent = suppressed ? 'Perchy is calling' : (active || Mic.cur ? 'hearing something' : 'listening');
  let c = Mic.cur;
  if (active) {
    if (!c) c = Mic.cur = {start: now, last: now, fsum: 0, n: 0, syl: 1, inGap: false, flats: [], pks: [], low: Math.max(...Mic.lowHist)};
    if (c.inGap) { c.syl++; c.inGap = false; }
    c.last = now; c.n++; c.loud = Math.max(c.loud || 0, bandDb - Mic.floor); c.fsum += freq; c.flats.push(flat); c.pks.push(pk * binHz);
  }
  if (c) {
    c.low = Math.max(c.low, lowEx);
    const gap = now - c.last;
    if (gap > 50) c.inGap = true;
    if (gap > 300 || suppressed || now - c.start > 3500) finishCall();
  }
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
function judge(c) {
  if (c.n < 5) return 'click';                                   // under about 100 ms
  const f = c.fsum / c.n; if (f < 2200 || f > 4400) return 'a jingle or rattle';   // outside a budgie's range
  if (c.low >= 15) return 'a voice or a thump';                    // the voice range was active just before or during it
  if (median(c.flats) >= 0.4) return 'a hiss or speech';           // noise-like, not a call
  const jumps = []; for (let i = 1; i < c.pks.length; i++) jumps.push(Math.abs(c.pks[i] - c.pks[i - 1]));
  if (median(jumps) < 200) return 'a whistle or steady tone';      // budgie pitch never sits still this long
  return null;
}
function finishCall() {
  const c = Mic.cur; Mic.cur = null;
  if (!c) return;
  const why = judge(c);
  if (Mic.log) Mic.log.push({t: Math.round(c.start), dur: Math.round(c.last - c.start + 20), n: c.n, flat: +median(c.flats).toFixed(3), low: +c.low.toFixed(1), why});
  if (why) { if (why !== 'click') { Mic.ignored++; $('#lastIgnored').textContent = why.charAt(0).toUpperCase() + why.slice(1) + ' · ' + new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) + ' · ' + Mic.ignored + ' so far'; } return; }
  onCall({pitch: c.fsum / c.n, syl: clamp(c.syl, 1, 9), dur: (c.last - c.start) / 1000 + 0.02, loud: c.loud || 0}, false);
}

// ---------- conversation ----------
let recentCalls = [];
let awake = false, wakeLock = null, lastReplyAt = 0, pending = null, streak = 0, lastHeardAt = 0, missedCallOuts = 0, nextCallOut = 0, nextFlock = 0;
function describe(f) { return kHz(f.pitch) + ' · ' + f.syl + (f.syl === 1 ? ' note' : ' notes') + ' · ' + f.dur.toFixed(2) + ' s'; }
function setCap(t) { $('#cap').textContent = t; }
function onCall(f, pretend) {
  const now = Date.now();
  Bird.notice(); Photo.notice(); setCap('Heard your bird');
  $('#lastCall').textContent = describe(f) + (pretend ? ' (pretend)' : '');
  if (!pretend) {
    S.n++; S.pitch += (f.pitch - S.pitch) * (S.n < 8 ? 0.3 : 0.08);
    if (S.day.key !== dayKey()) S.day = {key: dayKey(), count: 0};
    S.day.count++;
    // a call soon after one of Perchy's counts as an answer, and that call gets used more
    if (pending && now > pending.t && now - pending.t < 6000) { S.fav[pending.id] = (S.fav[pending.id] || 0) + 1; S.answered++; streak++; missedCallOuts = 0; }
    else if (now - lastSoundEnd > 12000) streak = 0;
  }
  // an excited bird bobs: loud, long or rapid-fire calls make Perchy bob its head, harder the more worked up things are
  recentCalls = recentCalls.filter(t => now - t < 8000); recentCalls.push(now);
  const excite = (f.loud > 26 ? 1 : 0) + (f.dur > 0.7 ? 1 : 0) + (recentCalls.length >= 3 ? 1 : 0) + (streak >= 2 ? 1 : 0);
  if (awake && excite && Math.random() < 0.3 + 0.22 * excite) setTimeout(() => Photo.startAct('bob', performance.now(), 0.35 + 0.28 * excite), rand(900, 1500));
  pending = null; lastHeardAt = now; scheduleCallOut();
  if (quietNow()) $('#lastReply').textContent = 'Quiet hours, not answering';
  else if (S.set.answer && (awake || pretend) && now - lastReplyAt > 1600 && now > lastSoundEnd + 300) {
    lastReplyAt = now;
    // budgies answer a contact call fast, within about half a second
    setTimeout(() => reply(f), rand(240, 620));
  }
  save(); renderTiles();
}
function reply(f) {
  if (!bufs.size) return;
  // answer in kind: a chirp for a chirp, a phrase for a longer call, and a burst of chatter once the two of you get going
  let kind = (f.dur < 0.5 && f.syl <= 2) ? 'chirp' : 'phrase';
  if (kind === 'chirp' && Math.random() < 0.3) kind = 'phrase';
  if (streak >= 3 && Math.random() < 0.35) kind = 'chatter';
  const target = f.pitch * 0.6 + S.pitch * 0.4;
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
  const clip = choose(Math.random() < 0.7 ? 'chirp' : 'phrase', S.pitch); if (!clip) return;
  const d = say(clip, {level: manual ? 0.95 : rand(0.55, 0.75), rate: rand(0.98, 1.02)});
  pending = {id: clip.id, t: Date.now() + d * 1000};
  $('#lastReply').textContent = 'Called out · ' + kHz(clip.pitch) + ' · ' + d.toFixed(2) + ' s';
  if (!manual) missedCallOuts++;
}
function scheduleCallOut() { nextCallOut = Date.now() + (missedCallOuts > 5 ? rand(150, 300) : rand(40, 95)) * 1000; }
function playFlock() {
  const ids = [...bedBufs.keys()]; if (!ids.length) return;
  const buf = bedBufs.get(pick(ids)), src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rand(0.98, 1.02);
  const g = ctx.createGain(); g.gain.value = rand(0.7, 1); src.connect(g); g.connect(far); src.start();
  markOutput(buf.duration * 1000 + 150); Bird.listenUp(buf.duration); Photo.listenUp(buf.duration);
  setCap('A flock passing'); setTimeout(() => { if (awake) setCap(quietNow() ? 'Quiet hours' : 'Listening'); }, buf.duration * 1000);
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
  const clip = choose(Math.random() < 0.6 ? 'chirp' : 'phrase', rand(2800, 3300)); if (!clip) return;
  const d = say(clip, {level: 0.5, far: true});
  setTimeout(() => onCall({pitch: clip.pitch, syl: clip.n, dur: clip.dur}, true), d * 1000 + 60);
}

// ---------- screen ----------
function setStatus() {
  const p = $('#statusPill');
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
    awake = false; stopListening(); Bird.setAsleep(true); Real.sync(); setCap('Dozing');
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    $('#wakeBtn').textContent = 'Wake Perchy'; setStatus(); return;
  }
  ensureAudio(); awake = true; Bird.setAsleep(false); Real.sync();
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
bind('#quietOn', 'quiet', on => { setStatus(); toast(on ? 'Perchy will stay quiet from 8:30 PM to 7 AM' : 'Perchy will make sounds at any hour'); });
// Photo bird (made from Kyle's own budgie) is the default; the painted bird is the fallback and the alternative.
const Real = (() => {
  const box = $('#photo').parentElement; let ok = true;
  const on = () => ok && st.real !== false && st.show;
  function sync() {
    const use = on(); box.classList.toggle('real', use); $('#birdPick').hidden = !use;
    $('#stage').style.visibility = st.show && !use ? 'visible' : 'hidden'; Bird.setVisible(st.show && !use);
    Photo.setVisible(use); Photo.setAsleep(!awake);
  }
  Photo.init($('#photo'), window.PERCHY_MEDIA, {getEnv: voiceEnv}).catch(() => { ok = false; sync(); });
  return {sync};
})();
const showBird = on => { $('#hiddenMsg').hidden = on; Real.sync(); };
bind('#showBird', 'show', showBird);
if (st.real === undefined) st.real = true;
bind('#realBird', 'real', () => Real.sync());
// Full screen: fill the window with just the bird, and ask the browser for true full screen where it allows it (iPhones do not)
const stageBox = $('#photo').parentElement;
function setSolo(on) {
  document.body.classList.toggle('solo', on); $('#soloBtn').textContent = on ? '✕' : '⤢';
  $('#soloBtn').setAttribute('aria-label', on ? 'Leave full screen' : 'Show only the bird, full screen'); $('#soloBtn').title = on ? 'Leave full screen' : 'Full screen';
  try { if (on && stageBox.requestFullscreen && !document.fullscreenElement) stageBox.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
}
$('#soloBtn').onclick = () => setSolo(!document.body.classList.contains('solo'));
$('#fullBtn').onclick = () => setSolo(true);
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('solo')) setSolo(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('solo')) setSolo(false); });
// Bird picker
function pickBird(b) { st.bird = b; Photo.setBird(b); document.querySelectorAll('#birdPick button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.bird === b))); $('#photo').setAttribute('aria-label', 'Perchy, a ' + b + ' budgie on a branch'); }
document.querySelectorAll('#birdPick button').forEach(x => { x.onclick = () => { pickBird(x.dataset.bird); save(); }; });
pickBird(['blue', 'green', 'yellow'].includes(st.bird) ? st.bird : 'blue');

Bird.init($('#stage'), {getEnv: voiceEnv});
showBird(st.show); renderTiles(); setStatus();
setInterval(tick, 1000);
window.__perchy = {S, Mic, LIB, Photo, state: () => ({awake, streak, heard: S.n, answered: S.answered, lastCall: $('#lastCall').textContent, lastReply: $('#lastReply').textContent})};
