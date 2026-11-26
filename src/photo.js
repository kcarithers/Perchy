// Portrait bird: an illustration of Kyle's own budgie. Its layers (two body poses, two head poses, beak, feet) were cut from his
// footage and given a painted finish; the branch and background are drawn here. It is moved like a puppet. Same interface as the painted Bird so the app can drive either.
const Photo = (() => {
  const W = 660, H = 825, HEAD = [225, 176.25], FEET = [335, 800], BEAK_TOP = 309.75, MX = 322.5, UP = 60, G = 14;
  // Poses: 0 = turned to its right, 1 = facing us, 2 = turned to its left (pose 0 mirrored). Feet stay put in all three.
  const POSE = [
    {head: 'headA', beak: 'beakA', body: 'bodyA', cx: 352.5, tip: [308, 374], eyes: [[375.75, 268.5, 8, 8]]},
    {head: 'headB', beak: 'beakB', body: 'bodyB', cx: 369.75, tip: [355.5, 374], eyes: [[295, 273, 3.5, 7], [417.5, 264, 6, 8]]}
  ];
  const img = {}, rnd = (a, b) => a + Math.random() * (b - a);
  let cv, g, getEnv = () => 0, ready = false, visible = false, asleep = true, raf = 0, last = 0, dpr = 1;
  const s = {rot: 0, hx: 0, hy: 0, open: 0, lid: 1, fluff: 1, dim: 1, pose: 0, from: 0, fade: 1, t: 0, px: 0, hop: 0, lean: 0, wing: 0, yawn: 0};
  const SLOPE = 0.233, ease = p => p * p * (3 - 2 * p);
  const tg = {rot: 4, hx: 0, hy: 5};
  let nextLook = 0, nextBlink = 0, blinkEnd = 0, stillUntil = 0, act = null, nextShake = 0, fluffUntil = 0, nextIdle = 0;
  const DUR = {bob: 900, shake: 650, stretch: 2800, yawn: 1600};

  let scene = null, branch = null;
  function paintScene() {                                    // soft garden light and a branch, drawn once
    const c = document.createElement('canvas'), k = 2; c.width = W * k; c.height = H * k;
    let x = c.getContext('2d'); x.scale(k, k);
    let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647, rr = (a, b) => a + r() * (b - a);
    let gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#e4edcf'); gr.addColorStop(0.5, '#bfd4aa'); gr.addColorStop(1, '#8fb08b');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    gr = x.createRadialGradient(150, 120, 10, 150, 120, 520); gr.addColorStop(0, 'rgba(255,247,210,.85)'); gr.addColorStop(1, 'rgba(255,247,210,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    const blob = (cx, cy, rad, rgb, a) => { const q = x.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad); q.addColorStop(0, `rgba(${rgb},${a})`); q.addColorStop(0.7, `rgba(${rgb},${a * 0.75})`); q.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = q; x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill(); };
    for (let i = 0; i < 9; i++) blob(rr(0, W), rr(0, H), rr(110, 220), ['84,128,86', '70,116,84', '122,160,104'][i % 3], rr(0.25, 0.45));
    for (let i = 0; i < 30; i++) blob(rr(0, W), rr(0, H * 0.9), rr(16, 58), ['255,255,236', '226,240,170', '170,208,140', '255,238,180'][i % 4], rr(0.14, 0.34));
    const c2 = document.createElement('canvas'); c2.width = W * k; c2.height = H * k; const bg = x;
    const yc = px => 672 - UP + 0.233 * (px - 220), top = [], bot = [];
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
    x.save(); x.translate(0, -UP); twig(); x.restore();
    x = c2.getContext('2d'); x.scale(k, k); branch = c2;                 // the branch is its own layer so the tail can hang behind it
    x.beginPath(); top.forEach(([a, b], i) => x[i ? 'lineTo' : 'moveTo'](a, b)); bot.slice().reverse().forEach(([a, b]) => x.lineTo(a, b)); x.closePath();
    x.save(); x.clip();
    x.translate(220, 672 - UP); x.rotate(Math.atan(0.233));
    gr = x.createLinearGradient(0, -50, 0, 52); gr.addColorStop(0, '#c9a47a'); gr.addColorStop(0.22, '#a98560'); gr.addColorStop(0.62, '#7f5f42'); gr.addColorStop(1, '#4f3a29');
    x.fillStyle = gr; x.fillRect(-400, -70, 1000, 140);
    for (let i = 0; i < 70; i++) { const bx = rr(-320, 520), by = rr(-44, 46), len = rr(30, 120); x.strokeStyle = by < -20 ? `rgba(255,236,200,${rr(0.08, 0.2)})` : `rgba(48,32,20,${rr(0.1, 0.28)})`; x.lineWidth = rr(1, 2.6); x.beginPath(); x.moveTo(bx, by); x.quadraticCurveTo(bx + len / 2, by + rr(-4, 4), bx + len, by + rr(-2, 2)); x.stroke(); }
    x.fillStyle = 'rgba(52,35,22,.5)'; x.beginPath(); x.ellipse(-150, 8, 20, 11, 0.1, 0, 7); x.fill(); x.fillStyle = 'rgba(120,92,64,.9)'; x.beginPath(); x.ellipse(-150, 8, 12, 6, 0.1, 0, 7); x.fill();
    for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(196,208,170,${rr(0.25, 0.5)})`; x.beginPath(); x.ellipse(rr(-320, 480), rr(-40, 30), rr(4, 11), rr(3, 7), rr(0, 3), 0, 7); x.fill(); }
    x.restore();
    return c;
  }
  function load(media) {
    return Promise.all(Object.entries(media).map(([k, src]) => new Promise((ok, no) => { const i = new Image(); i.onload = () => { img[k] = i; ok(); }; i.onerror = no; i.src = src; }))).then(() => { scene = paintScene(); POSE.forEach(buildMesh); ready = true; });
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
  }
  function setPose(p, now) { if (Math.abs(p - s.pose) === 2) p = 1; if (p === s.pose || s.fade < 1) return; s.from = s.pose; s.pose = p; s.fade = 0; }
  function look(now, big) {
    tg.rot = rnd(-7, 7) * (big ? 1 : 0.7); tg.hx = rnd(-4, 4); tg.hy = rnd(-3, 2);
    if (Math.random() < (big ? 0.6 : 0.3)) setPose(s.pose === 1 ? (Math.random() < 0.5 ? 0 : 2) : 1, now);
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
      const p = Math.max(0, (now - act.t0) / act.dur);
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
    s.open += ((asleep ? 0 : Math.max(env, yawn * 1.6)) - s.open) * (1 - Math.exp(-dt * 30));
    s.hop = hop; s.lean = lean; s.wing = wing; s.yawn = yawn;
    s.fade = Math.min(1, s.fade + dt / 0.09);
    if (!asleep && now > nextBlink) { blinkEnd = now + 150; nextBlink = now + rnd(2, 6.5) * 1000; }
    const lidT = asleep || now < blinkEnd || yawn > 0.45 ? 1 : 0;
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
  // The head is a mesh: cells above the chin move rigidly, cells at the neck stay with the body, and the ones
  // between bend, so the head never slides off its shoulders.
  function buildMesh(P) {
    const im = img[P.head], cols = Math.ceil(im.width / G), rows = Math.ceil(im.height / G);
    const t = document.createElement('canvas'); t.width = im.width; t.height = im.height; const tx = t.getContext('2d'); tx.drawImage(im, 0, 0);
    const a = tx.getImageData(0, 0, im.width, im.height).data;
    const wt = (px, py) => { const c = 436 - 0.01 * (px - P.cx) * (px - P.cx), v = Math.max(0, Math.min(1, (c - py + 6) / 58)); return v * v * (3 - 2 * v); };
    const V = []; for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) { const px = HEAD[0] + i * G, py = HEAD[1] + j * G; V.push({x: px, y: py, w: wt(px, py), u: px, v: py}); }
    const cells = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      let any = false; for (let y = j * G; y < Math.min(im.height, j * G + G) && !any; y += 2) for (let xx = i * G; xx < Math.min(im.width, i * G + G); xx += 2) if (a[(y * im.width + xx) * 4 + 3] > 6) { any = true; break; }
      if (!any) continue;
      const q = [V[j * (cols + 1) + i], V[j * (cols + 1) + i + 1], V[(j + 1) * (cols + 1) + i + 1], V[(j + 1) * (cols + 1) + i]];
      const lo = Math.min(...q.map(v => v.w)), hi = Math.max(...q.map(v => v.w));
      cells.push({q, kind: lo > 0.999 ? 2 : hi < 0.001 ? 0 : 1});
    }
    P.mesh = {V, cells, piv: [P.cx, 390]};
  }
  function tri(im, A, B, C) {
    const mx = (A.u + B.u + C.u) / 3, my = (A.v + B.v + C.v) / 3, ex = (p, q) => { const dx = p - mx, dy = q - my, d = Math.hypot(dx, dy) || 1; return [p + dx / d * 0.9, q + dy / d * 0.9]; };
    g.save(); g.beginPath(); g.moveTo(...ex(A.u, A.v)); g.lineTo(...ex(B.u, B.v)); g.lineTo(...ex(C.u, C.v)); g.closePath(); g.clip();
    const d = (B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y);
    const m11 = ((B.u - A.u) * (C.y - A.y) - (C.u - A.u) * (B.y - A.y)) / d, m21 = ((C.u - A.u) * (B.x - A.x) - (B.u - A.u) * (C.x - A.x)) / d;
    const m12 = ((B.v - A.v) * (C.y - A.y) - (C.v - A.v) * (B.y - A.y)) / d, m22 = ((C.v - A.v) * (B.x - A.x) - (B.v - A.v) * (C.x - A.x)) / d;
    g.transform(m11, m12, m21, m22, A.u - m11 * A.x - m21 * A.y, A.v - m12 * A.x - m22 * A.y); g.drawImage(im, HEAD[0], HEAD[1]); g.restore();
  }
  function rectClip(cells, kind) { g.beginPath(); for (const c of cells) if (c.kind === kind) g.rect(c.q[0].x - 0.6, c.q[0].y - 0.6, G + 1.2, G + 1.2); g.clip(); }
  function drawHead(P, alpha) {
    const o = s.open, M = P.mesh, im = img[P.head], [px, py] = M.piv;
    const r = s.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), sc = 1 + 0.012 * s.fluff, tx = s.hx, ty = s.hy + 3 * s.fluff;
    for (const v of M.V) { if (!v.w) { v.u = v.x; v.v = v.y; continue; } const dx = (v.x - px) * sc, dy = (v.y - py) * sc; v.u = v.x + v.w * (px + dx * cs - dy * sn + tx - v.x); v.v = v.y + v.w * (py + dx * sn + dy * cs + ty - v.y); }
    g.globalAlpha = alpha;
    g.save(); rectClip(M.cells, 0); g.drawImage(im, HEAD[0], HEAD[1]); g.restore();
    for (const c of M.cells) if (c.kind === 1) { tri(im, c.q[0], c.q[1], c.q[2]); tri(im, c.q[0], c.q[2], c.q[3]); }
    g.save(); g.translate(px + tx, py + ty); g.rotate(r); g.scale(sc, sc); g.translate(-px, -py);
    g.save(); rectClip(M.cells, 2); g.drawImage(im, HEAD[0], HEAD[1]); g.restore();
    if (o > 0.03) {                                            // open beak: the lower mandible drops a little, leaving a slim dark gap tucked under the tip
      const [mx, my] = P.tip, gap = 1.5 + 3.2 * Math.min(1.7, o);
      g.globalAlpha = alpha * Math.min(1, o * 5);
      g.fillStyle = '#26100f'; g.beginPath(); g.ellipse(mx, my - 5, 9, gap, 0, 0, 7); g.fill();
      g.fillStyle = '#bfa85c'; g.strokeStyle = '#6d5a2a'; g.lineWidth = 1; g.beginPath(); g.ellipse(mx, my - 5 + gap * 0.55, 9.5, 2.2 + gap * 0.5, 0, 0.12, Math.PI - 0.12); g.closePath(); g.fill(); g.stroke();
      g.globalAlpha = alpha;
    }
    g.save(); g.translate(0, BEAK_TOP); g.scale(1, 1 - 0.1 * Math.min(1.3, o)); g.translate(0, -BEAK_TOP - 1.5 * o); g.drawImage(img[P.beak], HEAD[0], HEAD[1]); g.restore();
    if (s.lid > 0.05) for (const [ex, ey, rx, ry] of P.eyes) {   // closed eye: the eye blends into the face feathers and a dark curved lash line remains
      g.save(); g.translate(ex, ey); g.globalAlpha = alpha * Math.min(1, s.lid * 1.3);
      const R = Math.max(rx, ry) + 3.5, gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, '#6f6a65'); gr.addColorStop(0.55, '#6a6560'); gr.addColorStop(1, 'rgba(106,101,96,0)');
      g.save(); g.scale(Math.min(1, (rx + 3.5) / R), 1); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill(); g.restore();
      g.strokeStyle = '#12100e'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-rx - 0.5, -1); g.quadraticCurveTo(0, ry * 0.75, rx + 0.5, -1); g.stroke();
      g.restore(); g.globalAlpha = alpha;
    }
    g.restore(); g.globalAlpha = 1;
  }
  function drawBird(pose, alpha) {                           // body and head for one pose; pose 2 is pose 0 mirrored
    const P = POSE[pose === 2 ? 0 : pose];
    g.save(); if (pose === 2) { g.translate(2 * MX, 0); g.scale(-1, 1); }
    if (s.wing > 0.02) drawWing(s.wing);
    g.globalAlpha = alpha; g.drawImage(img[P.body], 0, 0); drawHead(P, alpha);
    g.restore();
  }
  function drawTail(sway) {                                  // long tail feathers hanging behind the branch
    g.save(); g.translate(332, 596); g.rotate(sway);
    const feather = (ang, len, wid, fill) => { g.save(); g.rotate(ang);
      g.beginPath(); g.moveTo(-wid, 0); g.bezierCurveTo(-wid, len * 0.5, -wid * 0.55, len * 0.9, 0, len); g.bezierCurveTo(wid * 0.55, len * 0.9, wid, len * 0.5, wid, 0); g.closePath();
      g.fillStyle = fill; g.fill(); g.strokeStyle = '#14263f'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = 'rgba(190,225,245,.5)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(0, 12); g.lineTo(0, len - 14); g.stroke(); g.restore(); };
    feather(0.2, 150, 13, '#3a9fd0'); feather(-0.2, 150, 13, '#3a9fd0'); feather(0.1, 188, 12, '#2877b0'); feather(-0.1, 188, 12, '#2877b0');
    feather(0.025, 226, 10, '#1d4d86'); feather(-0.025, 228, 10, '#1b4379');
    g.restore();
  }
  function draw() {
    const cw = cv.width, ch = cv.height, sc = Math.max(cw / W, ch / H);
    g.setTransform(sc, 0, 0, sc, (cw - W * sc) / 2, (ch - H * sc) * 0.42);
    g.imageSmoothingQuality = 'high';
    g.drawImage(scene, 0, 0, W, H);
    const bx = s.px, by = s.px * SLOPE;
    g.save(); g.translate(bx, by + s.hop * 0.5); drawTail(-s.lean * 1.6 + Math.sin(s.t * 0.9) * 0.012 + (s.fade < 1 ? 0 : (s.pose - 1) * 0.05)); g.restore();
    g.drawImage(branch, 0, 0, W, H);
    g.save(); g.translate(220 + bx, 672 - UP + by); g.rotate(Math.atan(SLOPE)); g.fillStyle = 'rgba(30,24,20,.28)'; g.beginPath(); g.ellipse(85, -27, 118, 15, 0, 0, 7); g.fill(); g.restore();
    g.translate(bx, by + s.hop - 40 - UP);
    const breath = Math.sin(s.t * (asleep ? 1.6 : 2.6)) * 0.004, sx = 1 + 0.035 * s.fluff, sy = 1 + breath + 0.012 * s.fluff;
    g.save(); g.translate(FEET[0], FEET[1]); g.rotate(s.hx * 0.0016 + s.lean); g.scale(sx, sy); g.translate(-FEET[0], -FEET[1]);
    if (s.fade < 1) { drawBird(s.from, 1); drawBird(s.pose, s.fade); } else drawBird(s.pose, 1);
    g.restore();
    g.drawImage(img.feet, 0, 0);
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
    setAsleep(a) { asleep = a; if (a) { if (act && act.type === 'shuffle') s.px = act.from + act.dist; act = null; } if (!a) { nextIdle = performance.now() + rnd(5, 10) * 1000; nextLook = performance.now() + 500; nextBlink = performance.now() + 900; } },
    notice() { const now = performance.now(); setPose(1, now); tg.rot = rnd(4, 8) * (Math.random() < 0.5 ? -1 : 1); tg.hx = 0; tg.hy = -3; stillUntil = now + 900; nextLook = now + 1200; },
    listenUp(sec) { stillUntil = Math.max(stillUntil, performance.now() + sec * 1000); },
    startAct(type, now) { begin(type, now); },
    pose(p, rot, hx, hy, holdMs) { s.from = s.pose; s.pose = p; s.fade = 1; tg.rot = rot; tg.hx = hx; tg.hy = hy; stillUntil = nextLook = nextIdle = performance.now() + (holdMs || 3000); }   // for testing
  };
})();
