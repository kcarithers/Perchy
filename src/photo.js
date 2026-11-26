// Photo bird: Kyle's own budgie, cut out of his footage into layers (background, body, two head poses, beak)
// and moved like a puppet. Same interface as the painted Bird so the app can drive either.
const Photo = (() => {
  const W = 660, H = 825, HEAD = [225, 176.25], PIV = [352.5, 390], FEET = [335, 800], BEAK_TOP = 309.75;
  const POSE = [
    {head: 'headA', beak: 'beakA', tip: [308, 374], eyes: [[375.75, 268.5, 8, 8]]},
    {head: 'headB', beak: 'beakB', tip: [355.5, 374], eyes: [[295, 273, 3.5, 7], [417.5, 264, 6, 8]]}
  ];
  const img = {}, rnd = (a, b) => a + Math.random() * (b - a);
  let cv, g, getEnv = () => 0, ready = false, visible = false, asleep = true, raf = 0, last = 0, dpr = 1;
  const s = {rot: 0, hx: 0, hy: 0, open: 0, lid: 1, fluff: 1, dim: 1, pose: 0, from: 0, fade: 1, t: 0};
  const tg = {rot: 4, hx: 0, hy: 5};
  let nextLook = 0, nextBlink = 0, blinkEnd = 0, stillUntil = 0, act = null, nextShake = 0, fluffUntil = 0;

  function load(media) {
    return Promise.all(Object.entries(media).map(([k, src]) => new Promise((ok, no) => { const i = new Image(); i.onload = () => { img[k] = i; ok(); }; i.onerror = no; i.src = src; }))).then(() => { ready = true; });
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
    if (act) {
      const p = (now - act.t0) / act.dur;
      if (p >= 1) act = null;
      else if (act.type === 'bob') hy += Math.sin(p * Math.PI * 8) * 6 * (1 - p * 0.3);
      else if (act.type === 'shake') { rot += Math.sin(p * Math.PI * 14) * 6 * Math.sin(p * Math.PI); hx += Math.sin(p * Math.PI * 14 + 1) * 3 * Math.sin(p * Math.PI); }
    }
    if (speaking) { hy -= 3 * env; rot -= 1.5 * env; }
    s.rot += (rot - s.rot) * k; s.hx += (hx - s.hx) * k; s.hy += (hy - s.hy) * k;
    s.open += (env - s.open) * (1 - Math.exp(-dt * 30));
    s.fade = Math.min(1, s.fade + dt / 0.09);
    if (!asleep && now > nextBlink) { blinkEnd = now + 150; nextBlink = now + rnd(2, 6.5) * 1000; }
    const lidT = asleep ? 1 : (now < blinkEnd ? 1 : 0);
    s.lid += (lidT - s.lid) * (1 - Math.exp(-dt * (asleep ? 4 : 40)));
    if (!asleep && now > nextShake) { act = {type: 'shake', t0: now, dur: 650}; fluffUntil = now + rnd(4, 9) * 1000; nextShake = now + rnd(35, 90) * 1000; }
    const fl = asleep ? 1 : (now < fluffUntil ? 0.7 : (act && act.type === 'shake' ? 1 : 0));
    s.fluff += (fl - s.fluff) * (1 - Math.exp(-dt * 2.5));
    s.dim += ((asleep ? 1 : 0) - s.dim) * (1 - Math.exp(-dt * 1.5));
  }
  function drawHead(p, alpha) {
    const P = POSE[p], o = s.open;
    g.globalAlpha = alpha; g.drawImage(img[P.head], HEAD[0], HEAD[1]);
    if (o > 0.03) {                                            // open mouth: dark gap under the lifted tip, lower mandible beneath it
      const [tx, ty] = P.tip, drop = 2 + 7 * o;
      g.globalAlpha = alpha * Math.min(1, o * 5);
      g.fillStyle = '#b7a468'; g.beginPath(); g.ellipse(tx, ty - 10 + drop * 0.5, 10.5, 5 + drop * 0.5, 0, 0, 7); g.fill();
      g.fillStyle = '#26100f'; g.beginPath(); g.ellipse(tx, ty - 11 + drop * 0.42, 9.3, 4.4 + drop * 0.42, 0, 0, 7); g.fill();
      g.globalAlpha = alpha;
    }
    g.save(); g.translate(0, BEAK_TOP); g.scale(1, 1 - 0.12 * o); g.translate(0, -BEAK_TOP - 1.5 * o); g.drawImage(img[P.beak], HEAD[0], HEAD[1]); g.restore();
    if (s.lid > 0.03) for (const [ex, ey, rx, ry] of P.eyes) {   // closed lid: a soft grey patch over the eye and its ring, with a dark crease
      g.save(); g.translate(ex, ey); g.scale(1, ry / rx); g.globalAlpha = alpha * Math.min(1, s.lid * 1.2);
      const R = rx + 4.5, gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, '#96938d'); gr.addColorStop(0.6, '#8f8c87'); gr.addColorStop(1, 'rgba(143,140,135,0)');
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
    g.drawImage(img.bg, 0, 0);
    const breath = Math.sin(s.t * (asleep ? 1.6 : 2.6)) * 0.004, sx = 1 + 0.035 * s.fluff, sy = 1 + breath + 0.012 * s.fluff;
    const lean = s.hx * 0.0016;
    g.save(); g.translate(FEET[0], FEET[1]); g.rotate(lean); g.scale(sx, sy); g.translate(-FEET[0], -FEET[1]);
    g.drawImage(img.body, 0, 0);
    g.save(); g.translate(PIV[0], PIV[1]); g.scale(1 / sx, 1 / sy);                                    // the head keeps its own size
    g.translate(s.hx, s.hy + 3 * s.fluff); g.rotate(s.rot * Math.PI / 180); g.scale(1 + 0.012 * s.fluff, 1 + 0.012 * s.fluff); g.translate(-PIV[0], -PIV[1]);
    if (s.fade < 1) { drawHead(s.from, 1); drawHead(s.pose, s.fade); } else drawHead(s.pose, 1);
    g.restore(); g.restore();
    if (s.dim > 0.01) { g.fillStyle = 'rgba(8,12,34,' + (0.5 * s.dim).toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
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
    setAsleep(a) { asleep = a; if (!a) { nextLook = performance.now() + 500; nextBlink = performance.now() + 900; } },
    notice() { const now = performance.now(); setPose(1, now); tg.rot = rnd(4, 8) * (Math.random() < 0.5 ? -1 : 1); tg.hx = 0; tg.hy = -3; stillUntil = now + 900; nextLook = now + 1200; },
    listenUp(sec) { stillUntil = Math.max(stillUntil, performance.now() + sec * 1000); },
    startAct(type, now) { if (type === 'bob' || type === 'shake') act = {type, t0: now, dur: type === 'bob' ? 900 : 650}; }
  };
})();
