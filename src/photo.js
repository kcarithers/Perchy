// Portrait bird: an illustration of Kyle's own budgie. Its layers (body, two head poses, beak) were cut from his
// footage and given a painted finish; the branch and background are drawn here. It is moved like a puppet. Same interface as the painted Bird so the app can drive either.
const Photo = (() => {
  const W = 660, H = 825, HEAD = [225, 176.25], PIV = [352.5, 390], FEET = [335, 800], BEAK_TOP = 309.75;
  const POSE = [
    {head: 'headA', beak: 'beakA', tip: [308, 374], eyes: [[375.75, 268.5, 8, 8]]},
    {head: 'headB', beak: 'beakB', tip: [355.5, 374], eyes: [[295, 273, 3.5, 7], [417.5, 264, 6, 8]]}
  ];
  const img = {}, rnd = (a, b) => a + Math.random() * (b - a);
  let cv, g, getEnv = () => 0, ready = false, visible = false, asleep = true, raf = 0, last = 0, dpr = 1;
  const s = {rot: 0, hx: 0, hy: 0, open: 0, lid: 1, fluff: 1, dim: 1, pose: 0, from: 0, fade: 1, t: 0, px: 0, hop: 0, lean: 0, wing: 0, yawn: 0};
  const SLOPE = 0.233, ease = p => p * p * (3 - 2 * p);
  const tg = {rot: 4, hx: 0, hy: 5};
  let nextLook = 0, nextBlink = 0, blinkEnd = 0, stillUntil = 0, act = null, nextShake = 0, fluffUntil = 0, nextIdle = 0;
  const DUR = {bob: 900, shake: 650, stretch: 2800, yawn: 1600};

  let scene = null;
  function paintScene() {                                    // soft garden light and a branch, drawn once
    const c = document.createElement('canvas'), k = 2; c.width = W * k; c.height = H * k;
    const x = c.getContext('2d'); x.scale(k, k);
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647, rr = (a, b) => a + r() * (b - a);
    let gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#e4edcf'); gr.addColorStop(0.5, '#bfd4aa'); gr.addColorStop(1, '#8fb08b');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    gr = x.createRadialGradient(150, 120, 10, 150, 120, 520); gr.addColorStop(0, 'rgba(255,247,210,.85)'); gr.addColorStop(1, 'rgba(255,247,210,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    const blob = (cx, cy, rad, rgb, a) => { const q = x.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(0.7, `rgba(${rgb},${a * 0.75})`); q.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = q; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill(); };
    for (let i = 0; i < 9; i++) blob(rr(0, W), rr(0, H), rr(110, 220), ['84,128,86', '70,116,84', '122,160,104'][i % 3], rr(0.25, 0.45));
    for (let i = 0; i < 30; i++) blob(rr(0, W), rr(0, H * 0.9), rr(16, 58), ['255,255,236', '226,240,170', '170,208,140', '255,238,180'][i % 4], rr(0.14, 0.34));
    const yc = px => 672 + 0.233 * (px - 220), top = [], bot = [];
    for (let px = -40; px <= W + 40; px += 20) { top.push([px, yc(px) - 47 + Math.sin(px * 0.021) * 4 + rr(-1.5, 1.5)]); bot.push([px, yc(px) + 47 + Math.sin(px * 0.017 + 2) * 5 + rr(-1.5, 1.5)]); }
    x.fillStyle = 'rgba(40,60,40,.22)'; x.beginPath(); top.forEach(([a, b], i) => x[i ? 'lineTo' : 'moveTo'](a, b + 26)); bot.slice().reverse().forEach(([a, b]) => x.lineTo(a, b + 30)); x.fill();
    const twig = () => {                                      // a leafy twig rising behind the branch
      x.strokeStyle = '#6f5238'; x.lineWidth = 11; x.lineCap = 'round'; x.beginPath(); x.moveTo(545, 720); x.quadraticCurveTo(585, 600, 560, 470); x.stroke();
      x.lineWidth = 6; x.beginPath(); x.moveTo(572, 590); x.quadraticCurveTo(615, 560, 640, 505); x.stroke();
      const leaf = (lx, ly, ang, len) => { x.save(); x.translate(lx, ly); x.rotate(ang); const q = x.createLinearGradient(0, -len * 0.3, 0, len * 0.3); q.addColorStop(0, '#8fbf6a'); q.addColorStop(1, '#4f8a4d'); x.fillStyle = q;
        x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(len * 0.3, -len * 0.42, len * 0.8, -len * 0.3, len, 0); x.bezierCurveTo(len * 0.8, len * 0.3, len * 0.3, len * 0.42, 0, 0); x.fill();
        x.strokeStyle = 'rgba(40,84,44,.55)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(2, 0); x.lineTo(len * 0.92, 0); x.stroke(); x.restore(); };
      leaf(560, 474, -1.9, 92); leaf(566, 520, -0.5, 80); leaf(563, 548, -2.7, 74); leaf(640, 506, -1.2, 78); leaf(612, 548, 0.1, 62);
    };
    twig();
    x.beginPath(); top.forEach(([a, b], i) => x[i ? 'lineTo' : 'moveTo'](a, b)); bot.slice().reverse().forEach(([a, b]) => x.lineTo(a, b)); x.closePath();
    x.save(); x.clip();
    x.translate(220, 672); x.rotate(Math.atan(0.233));
    gr = x.createLinearGradient(0, -50, 0, 52); gr.addColorStop(0, '#c9a47a'); gr.addColorStop(0.22, '#a98560'); gr.addColorStop(0.62, '#7f5f42'); gr.addColorStop(1, '#4f3a29');
    x.fillStyle = gr; x.fillRect(-400, -70, 1000, 140);
    for (let i = 0; i < 70; i++) { const bx = rr(-320, 520), by = rr(-44, 46), len = rr(30, 120); x.strokeStyle = by < -20 ? `rgba(255,236,200,${rr(0.08, 0.2)})` : `rgba(48,32,20,${rr(0.1, 0.28)})`; x.lineWidth = rr(1, 2.6); x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + len / 2, by + rr(-4, 4), bx + len, by + rr(-2, 2)); x.stroke(); }
    x.fillStyle = 'rgba(52,35,22,.5)'; x.beginPath(); x.ellipse(-150, 8, 20, 11, 0.1, 0, 7); x.fill(); x.fillStyle = 'rgba(120,92,64,.9)'; x.beginPath(); x.ellipse(-150, 8, 12, 6, 0.1, 0, 7); x.fill();
    for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(196,208,170,${rr(0.25, 0.5)})`; x.beginPath(); x.ellipse(rr(-320, 480), rr(-40, 30), rr(4, 11), rr(3, 7), rr(0, 3), 0, 7); x.fill(); }
    x.restore();
    return c;
  }
  function load(media) {
    return Promise.all(Object.entries(media).map(([k, src]) => new Promise((ok, no) => { const i = new Image(); i.onload = () => { img[k] = i; ok(); }; i.onerror = no; i.src = src; }))).then(() => { scene = paintScene(); ready = true; });
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  }
  function setPose(p, now) { if (p === s.pose) return; s.from = s.pose; s.pose = p; s.fade = 0; }
  function look(now, big) {
    tg.rot = rnd(-7, 7) * (big ? 1 : 0.7); tg.hx = rnd(-4, 4); tg.hy = rnd(-3, 2);
    if (Math.random() < (big ? 0.6 : 0.3)) setPose(1 - s.pose, now);
    nextLook = now + rnd(0.7, 3.6) * 1000;
  }
  function update(now, dt) {
    s.t += dt;
    const env = Math.min(1, getEnv() * 1.3), speaking = env > 0.06;
    if (asleep) { tg.rot = 5; tg.hx = 1; tg.hy = 6; setPose(0, now); }
    else if (!speaking && now > stillUntil && now > nextLook && !act) look(now, Math.random() < 0.3);
    const k = 1 - Math.exp(-dt * (asleep ? 3 : 16));
    let rot = tg.rot, hx = tg.hx, hy = tg.hy;
    let hop = 0, lean = 0, wing = 0, yawn = 0;
    if (!asleep && !speaking && !act && now > nextIdle && now > stillUntil) {
      begin(['shuffle', 'shuffle', 'stretch', 'yawn'][Math.floor(Math.random() * 4)], now); nextIdle = now + rnd(9, 24) * 1000;
    }
    if (act) {
      const p = (now - act.t0) / act.dur;
      if (p >= 1) { if (act.type === 'shuffle') s.px = act.from + act.dist; act = null; }
      else if (act.type === 'shuffle') {                       // sidestep along the branch in little hops
        const q = p * act.steps, i = Math.floor(q), f = q - i;
        s.px = act.from + act.dist * (i + ease(f)) / act.steps; hop = -5 * Math.sin(Math.PI * f); lean = Math.sign(act.dist) * 0.035 * Math.sin(Math.PI * f); hx += Math.sign(act.dist) * 3;
      }
      else if (act.type === 'stretch') {                       // one wing fans out and down, the body leans away
        wing = p < 0.3 ? ease(p / 0.3) : p > 0.72 ? ease((1 - p) / 0.28) : 1; lean = -0.03 * wing; rot -= 5 * wing; hx -= 3 * wing;
      }
      else if (act.type === 'yawn') { yawn = Math.pow(Math.sin(Math.PI * p), 0.7); hy -= 6 * yawn; rot -= 4 * yawn; }
      else if (act.type === 'bob') hy += Math.sin(p * Math.PI * 8) * 6 * (1 - p * 0.3);
      else if (act.type === 'shake') { rot += Math.sin(p * Math.PI * 14) * 6 * Math.sin(p * Math.PI); hx += Math.sin(p * Math.PI * 14 + 1) * 3 * Math.sin(p * Math.PI); }
    }
    if (speaking) { hy -= 3 * env; rot -= 1.5 * env; }
    s.rot += (rot - s.rot) * k; s.hx += (hx - s.hx) * k; s.hy += (hy - s.hy) * k;
    s.open += (Math.max(env, yawn * 1.6) - s.open) * (1 - Math.exp(-dt * 30));
    s.hop = hop; s.lean = lean; s.wing = wing; s.yawn = yawn;
    s.fade = Math.min(1, s.fade + dt / 0.09);
    if (!asleep && now > nextBlink) { blinkEnd = now + 150; nextBlink = now + rnd(2, 6.5) * 1000; }
    const lidT = asleep ? 1 : (now < blinkEnd ? 1 : 0.75 * yawn);
    s.lid += (lidT - s.lid) * (1 - Math.exp(-dt * (asleep ? 4 : 40)));
    if (!asleep && now > nextShake) { act = {type: 'shake', t0: now, dur: 650}; fluffUntil = now + rnd(4, 9) * 1000; nextShake = now + rnd(35, 90) * 1000; }
    const fl = asleep ? 1 : (now < fluffUntil ? 0.7 : (act && act.type === 'shake' ? 1 : 0));
    s.fluff += (fl - s.fluff) * (1 - Math.exp(-dt * 2.5));
    s.dim += ((asleep ? 1 : 0) - s.dim) * (1 - Math.exp(-dt * 1.5));
  }
  function begin(type, now) {
    if (type === 'shuffle') {
      const dir = s.px > 50 ? -1 : s.px < -70 ? 1 : (Math.random() < 0.5 ? -1 : 1), steps = 2 + Math.floor(Math.random() * 4);
      act = {type, t0: now, dur: steps * 270, steps, from: s.px, dist: dir * steps * rnd(15, 21)};
    } else if (DUR[type]) act = {type, t0: now, dur: DUR[type]};
  }
  function drawWing(e) {                                       // drawn behind the body, hinged at the shoulder
    g.save(); g.translate(432, 418); g.rotate(1.5 - 0.72 * e); g.scale(0.35 + 0.65 * e, 0.5 + 0.5 * e);
    const feather = (ang, len, wid, fill, edge) => { g.save(); g.rotate(ang * e);
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(len * 0.3, -wid, len * 0.85, -wid * 0.9, len, 0); g.bezierCurveTo(len * 0.85, wid * 0.8, len * 0.3, wid, 0, 0);
      g.fillStyle = fill; g.fill(); g.strokeStyle = edge; g.lineWidth = 2; g.stroke(); g.restore(); };
    for (let i = 0; i < 9; i++) feather(-0.52 + i * 0.14, 300 - Math.abs(i - 2.5) * 16, 22, i % 2 ? '#48566b' : '#3d4a5e', '#dfe7ee');
    for (let i = 0; i < 8; i++) feather(-0.5 + i * 0.155, 165 - Math.abs(i - 3) * 9, 19, '#23272e', '#f1f4f2');
    for (let i = 0; i < 6; i++) feather(-0.44 + i * 0.19, 92, 17, '#2b3038', '#e9eef0');
    g.fillStyle = '#35b3e6'; g.beginPath(); g.ellipse(18, 6, 34, 26, 0.3, 0, 7); g.fill();
    g.restore();
  }
  function drawHead(p, alpha) {
    const P = POSE[p], o = s.open;
    g.globalAlpha = alpha; g.drawImage(img[P.head], HEAD[0], HEAD[1]);
    if (o > 0.03) {                                            // open mouth: dark gap under the lifted tip, lower mandible beneath it
      const [tx, ty] = P.tip, drop = 2 + 7 * o;                  // o runs past 1 during a yawn
      g.globalAlpha = alpha * Math.min(1, o * 5);
      g.fillStyle = '#b7a468'; g.beginPath(); g.ellipse(tx, ty - 10 + drop * 0.5, 10.5 + 3 * Math.max(0, o - 1), 5 + drop * 0.5, 0, 0, 7); g.fill();
      g.fillStyle = '#26100f'; g.beginPath(); g.ellipse(tx, ty - 11 + drop * 0.42, 9.3 + 3 * Math.max(0, o - 1), 4.4 + drop * 0.42, 0, 0, 7); g.fill();
      g.globalAlpha = alpha;
    }
    g.save(); g.translate(0, BEAK_TOP); g.scale(1, 1 - 0.12 * Math.min(1.3, o)); g.translate(0, -BEAK_TOP - 1.5 * o); g.drawImage(img[P.beak], HEAD[0], HEAD[1]); g.restore();
    if (s.lid > 0.03) for (const [ex, ey, rx, ry] of P.eyes) {   // closed lid: a soft grey patch over the eye and its ring, with a dark crease
      g.save(); g.translate(ex, ey); g.scale(1, ry / rx); g.globalAlpha = alpha * Math.min(1, s.lid * 1.2);
      const R = rx + 4.5, gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, '#7b7873'); gr.addColorStop(0.6, '#75726d'); gr.addColorStop(1, 'rgba(117,114,109,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
      g.strokeStyle = 'rgba(38,35,33,.8)'; g.lineWidth = 1.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-rx * 0.8, -0.5); g.quadraticCurveTo(0, rx * 0.5, rx * 0.8, -0.5); g.stroke();
      g.restore(); g.globalAlpha = alpha;
    }
    g.globalAlpha = 1;
  }
  function draw() {
    const cw = cv.width, ch = cv.height, sc = Math.max(cw / W, ch / H);
    g.setTransform(sc, 0, 0, sc, (cw - W * sc) / 2, (ch - H * sc) * 0.42);
    g.imageSmoothingQuality = 'high';
    g.drawImage(scene, 0, 0, W, H);
    g.translate(0, -40);
    g.save(); g.translate(220 + s.px, 672 + s.px * SLOPE); g.rotate(Math.atan(SLOPE)); g.fillStyle = 'rgba(30,24,20,.28)'; g.beginPath(); g.ellipse(85, -27, 118, 15, 0, 0, 7); g.fill(); g.restore();
    g.translate(s.px, s.px * SLOPE + s.hop);
    const breath = Math.sin(s.t * (asleep ? 1.6 : 2.6)) * 0.004, sx = 1 + 0.035 * s.fluff, sy = 1 + breath + 0.012 * s.fluff;
    const lean = s.hx * 0.0016 + s.lean;
    g.save(); g.translate(FEET[0], FEET[1]); g.rotate(lean); g.scale(sx, sy); g.translate(-FEET[0], -FEET[1]);
    if (s.wing > 0.02) drawWing(s.wing);
    g.drawImage(img.body, 0, 0);
    g.save(); g.translate(PIV[0], PIV[1]); g.scale(1 / sx, 1 / sy);                                    // the head keeps its own size
    g.translate(s.hx, s.hy + 3 * s.fluff); g.rotate(s.rot * Math.PI / 180); g.scale(1 + 0.012 * s.fluff, 1 + 0.012 * s.fluff); g.translate(-PIV[0], -PIV[1]);
    if (s.fade < 1) { drawHead(s.from, 1); drawHead(s.pose, s.fade); } else drawHead(s.pose, 1);
    g.restore(); g.restore();
    if (s.dim > 0.01) { g.fillStyle = 'rgba(8,12,34,' + (0.5 * s.dim).toFixed(3) + ')'; g.setTransform(1, 0, 0, 1, 0, 0); g.fillRect(0, 0, cw, ch); }
  }
  function frame(now) {
    raf = 0; if (!visible || !ready) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    resize(); update(now, dt); draw(); raf = requestAnimationFrame(frame);
  }
  return {
    init(canvas, media, opts) { cv = canvas; g = cv.getContext('2d'); getEnv = opts.getEnv; nextShake = performance.now() + 20000; return load(media).then(() => { if (visible) this.setVisible(true); }); },
    get ready() { return ready; },
    setVisible(on) { visible = on; if (on && ready && !raf) { last = 0; raf = requestAnimationFrame(frame); } },
    setAsleep(a) { asleep = a; if (!a) { nextIdle = performance.now() + rnd(5, 10) * 1000; nextLook = performance.now() + 500; nextBlink = performance.now() + 900; } },
    notice() { const now = performance.now(); setPose(1, now); tg.rot = rnd(4, 8) * (Math.random() < 0.5 ? -1 : 1); tg.hx = 0; tg.hy = -3; stillUntil = now + 900; nextLook = now + 1200; },
    listenUp(sec) { stillUntil = Math.max(stillUntil, performance.now() + sec * 1000); },
    startAct(type, now) { begin(type, now); }
  };
})();
