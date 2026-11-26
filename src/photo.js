// Portrait bird: an illustration of Kyle's own budgie. Its layers (two body poses, two head poses, beak, feet) were cut from his
// footage and given a painted finish; the branch and background are drawn here. It is moved like a puppet. Same interface as the painted Bird so the app can drive either.
const Photo = (() => {
  const W = 660, H = 825, HEAD = [225, 176.25], FEET = [335, 800], BEAK_TOP = 309.75, MX = 322.5, UP = 60, G = 14;
  // Poses: 0 = turned to its right, 1 = facing us, 2 = turned to its left (pose 0 mirrored). Feet stay put in all three.
  const POSE = [
    {head: 'headA', beak: 'beakA', body: 'bodyA', cx: 352.5, tip: [308, 374], eyes: [[375.75, 268.5, 8, 8]], lidFrom: [[12, 25]]},
    {head: 'headB', beak: 'beakB', body: 'bodyB', cx: 369.75, tip: [355.5, 374], eyes: [[295, 273, 3.5, 7], [417.5, 264, 6, 8]], lidFrom: [[15, 13], [3, 27]]}
  ];
  const img = {}, rnd = (a, b) => a + Math.random() * (b - a);
  let cv, g, getEnv = () => 0, ready = false, visible = false, asleep = true, raf = 0, last = 0, dpr = 1;
  const s = {rot: 0, hx: 0, hy: 0, open: 0, lid: 1, fluff: 1, dim: 1, pose: 0, from: 0, fade: 1, t: 0, px: 0, hop: 0, lean: 0, wing: 0, yawn: 0};
  const SLOPE = 0.233, ease = p => p * p * (3 - 2 * p);
  const tg = {rot: 4, hx: 0, hy: 5};
  let nextLook = 0, nextBlink = 0, blinkEnd = 0, stillUntil = 0, act = null, nextShake = 0, fluffUntil = 0, nextIdle = 0;
  const DUR = {bob: 900, shake: 650, stretch: 2800, yawn: 1600};

  function load(media) {
    return Promise.all(Object.entries(media).map(([k, src]) => new Promise((ok, no) => { const i = new Image(); i.onload = () => { img[k] = i; ok(); }; i.onerror = no; i.src = src; }))).then(() => { POSE.forEach(buildMesh); ready = true; });
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
  function drawWing(e) {                                       // painted wing sprite, hinged at the shoulder and tucked behind the body at rest
    g.save(); g.translate(432, 418); g.rotate(1.5 - 0.72 * e); g.scale(0.35 + 0.65 * e, 0.45 + 0.55 * e); g.drawImage(img.wing, -30, -150); g.restore();
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
    // dark copy of the beak (the mouth's shadow) and, for each eye, a patch of nearby face feathers to close it with
    const dk = document.createElement('canvas'); dk.width = im.width; dk.height = im.height; let c = dk.getContext('2d');
    c.drawImage(img[P.beak], 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#24130f'; c.fillRect(0, 0, dk.width, dk.height); P.dark = dk;
    P.lids = P.eyes.map(([ex, ey, rx, ry], i) => {
      const R = Math.ceil(Math.max(rx, ry) + 7), [ox, oy] = P.lidFrom[i], pc = document.createElement('canvas'); pc.width = pc.height = R * 2; c = pc.getContext('2d');
      c.drawImage(im, -(ex + ox - HEAD[0] - R), -(ey + oy - HEAD[1] - R));
      const gr = c.createRadialGradient(R, R, R * 0.45, R, R, R); gr.addColorStop(0, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in'; c.fillStyle = gr; c.fillRect(0, 0, R * 2, R * 2);
      c.drawImage(im, -(ex - HEAD[0] - R), -(ey - HEAD[1] - R)); return {pc, R};      // never spill past the head's own edge
    });
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
    const bk = img[P.beak], [tpx, tpy] = P.tip, d = 1 + 4.6 * Math.min(1.7, o);
    if (o > 0.03) {                                            // open beak, built from the beak itself: lower mandible drops, a soft shadow opens between
      g.globalAlpha = alpha * Math.min(1, o * 6);
      g.save(); g.translate(tpx, tpy + d); g.scale(0.74, 0.44); g.translate(-tpx, -tpy); g.drawImage(bk, HEAD[0], HEAD[1]); g.restore();
      g.globalAlpha *= 0.92; g.drawImage(P.dark, HEAD[0], HEAD[1] + d * 0.55);
      g.globalAlpha = alpha;
    }
    g.save(); g.translate(0, BEAK_TOP); g.scale(1, 1 - 0.06 * Math.min(1.3, o)); g.translate(0, -BEAK_TOP - o); g.drawImage(bk, HEAD[0], HEAD[1]); g.restore();
    for (const [ex, ey, rx, ry] of P.eyes) {                   // soft glossy bead: warm dark iris fading into a darker pupil, one small soft glint
      g.save(); g.translate(ex, ey); g.scale(1, ry / rx);
      const R = rx + 1.2, bead = g.createRadialGradient(0, 0.3, 0, 0, 0, R);
      bead.addColorStop(0, '#060505'); bead.addColorStop(0.42, '#0d0a09'); bead.addColorStop(0.72, '#3b2c24'); bead.addColorStop(0.9, '#241b17'); bead.addColorStop(1, 'rgba(36,27,23,0)');
      g.fillStyle = bead; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
      const gl = g.createRadialGradient(-rx * 0.28, -rx * 0.34, 0, -rx * 0.28, -rx * 0.34, Math.max(1.6, rx * 0.34));
      gl.addColorStop(0, 'rgba(255,255,255,.8)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(-rx * 0.28, -rx * 0.34, Math.max(1.6, rx * 0.34), 0, 7); g.fill();
      g.restore();
    }
    if (s.lid > 0.05) P.eyes.forEach(([ex, ey, rx, ry], i) => {   // closed eye: real face feathers drawn over it, then a faint soft lash line
      const L = P.lids[i]; g.save(); g.globalAlpha = alpha * Math.min(1, s.lid * 1.3);
      g.drawImage(L.pc, ex - L.R, ey - L.R); g.drawImage(L.pc, ex - L.R, ey - L.R);
      g.translate(ex, ey); g.strokeStyle = 'rgba(26,21,19,.85)'; g.lineWidth = 1.6; g.lineCap = 'round'; g.shadowColor = 'rgba(30,25,22,.5)'; g.shadowBlur = 1.5 * (cv.width / W);
      g.beginPath(); g.moveTo(-rx * 0.8, -0.5); g.quadraticCurveTo(0, ry * 0.55, rx * 0.8, -0.5); g.stroke();
      g.restore(); g.globalAlpha = alpha;
    });
    g.restore(); g.globalAlpha = 1;
  }
  function drawBird(pose, alpha) {                           // body and head for one pose; pose 2 is pose 0 mirrored
    const P = POSE[pose === 2 ? 0 : pose];
    g.save(); if (pose === 2) { g.translate(2 * MX, 0); g.scale(-1, 1); }
    if (s.wing > 0.02) drawWing(s.wing);
    g.globalAlpha = alpha; g.drawImage(img[P.body], 0, 0); drawHead(P, alpha);
    g.restore();
  }
  function drawTail(sway) {                                  // painted tail sprite hanging behind the branch
    g.save(); g.translate(332, 700); g.rotate(sway); g.drawImage(img.tail, -110, -3); g.restore();
  }
  function draw() {
    const cw = cv.width, ch = cv.height, sc = Math.max(cw / W, ch / H);
    g.setTransform(sc, 0, 0, sc, (cw - W * sc) / 2, (ch - H * sc) * 0.42);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img.bg, 0, 0, W, H);
    const bx = s.px, by = s.px * SLOPE, lean = s.hx * 0.0016 + s.lean, pose = s.fade < 0.5 ? s.from : s.pose;
    // the tail is part of the bird: it leans, turns and shuffles with the body, but is painted before the branch so it hangs behind it
    g.save(); g.translate(bx, by + s.hop - 40 - UP); g.translate(FEET[0], FEET[1]); g.rotate(lean); g.translate(-FEET[0], -FEET[1]);
    if (pose === 2) { g.translate(2 * MX, 0); g.scale(-1, 1); }
    g.translate(pose === 1 ? 6 : 0, 0); drawTail((pose === 1 ? 0 : 0.07) + Math.sin(s.t * 0.9) * 0.012); g.restore();
    g.drawImage(img.branch, 0, 0, W, H);
    g.save(); g.translate(220 + bx, 672 - UP + by); g.rotate(Math.atan(SLOPE)); g.fillStyle = 'rgba(30,24,20,.28)'; g.beginPath(); g.ellipse(85, -27, 118, 15, 0, 0, 7); g.fill(); g.restore();
    g.translate(bx, by + s.hop - 40 - UP);
    const breath = Math.sin(s.t * (asleep ? 1.6 : 2.6)) * 0.004, sx = 1 + 0.035 * s.fluff, sy = 1 + breath + 0.012 * s.fluff;
    g.save(); g.translate(FEET[0], FEET[1]); g.rotate(lean); g.scale(sx, sy); g.translate(-FEET[0], -FEET[1]);
    if (s.fade < 1) { drawBird(s.from, 1); drawBird(s.pose, s.fade); } else drawBird(s.pose, 1);
    g.restore();
    g.save(); g.shadowColor = 'rgba(30,20,12,.55)'; g.shadowBlur = 7 * (cv.width / W); g.shadowOffsetX = 2 * (cv.width / W); g.shadowOffsetY = 4 * (cv.width / W); g.drawImage(img.feet, 0, 0); g.restore();
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
