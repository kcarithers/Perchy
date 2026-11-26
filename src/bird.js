// ---------- the bird: a painted budgie on a branch, animated like a live one ----------
// Parts are painted once into off-screen sprites (feathers, barring, shading) and then posed every frame.
const Bird = (() => {
  const TAU = Math.PI * 2;
  const rnd = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  function sprite(x0, y0, x1, y1, res, paint) {
    const c = document.createElement('canvas');
    c.width = Math.ceil((x1 - x0) * res); c.height = Math.ceil((y1 - y0) * res);
    const g = c.getContext('2d'); g.scale(res, res); g.translate(-x0, -y0); paint(g, res);
    return {c, x0, y0, w: x1 - x0, h: y1 - y0};
  }
  const put = (g, s) => g.drawImage(s.c, s.x0, s.y0, s.w, s.h);
  function softFill(g, path, fill, res, blur = 1.6) {
    g.save(); g.shadowColor = typeof fill === 'string' ? fill : 'rgba(110,185,230,.9)'; g.shadowBlur = blur * res; g.fillStyle = fill; g.fill(path); g.restore();
  }

  // ----- painters (bird-local units; the feet grip the perch at 0,0 and up is negative y) -----
  const BODY = 'M-13,-128 C-38,-125 -48,-90 -43,-55 C-39,-28 -26,-7 -4,-3 C14,0 32,-5 41,-19 C49,-46 46,-94 28,-124 C16,-134 -2,-134 -13,-128 Z';
  function paintBody(g, res) {
    const p = new Path2D(BODY), r = rnd(11);
    const base = g.createLinearGradient(-48, -90, 46, -44);
    base.addColorStop(0, '#9be2f8'); base.addColorStop(.45, '#62c9ef'); base.addColorStop(1, '#2f9bcc');
    softFill(g, p, base, res, 2);
    g.globalCompositeOperation = 'source-atop';
    // the yellow of the throat runs down into the green breast
    let gr = g.createRadialGradient(-18, -128, 4, -18, -122, 52);
    gr.addColorStop(0, 'rgba(250,251,248,1)'); gr.addColorStop(.5, 'rgba(226,243,251,.7)'); gr.addColorStop(1, 'rgba(180,228,248,0)');
    g.fillStyle = gr; g.fillRect(-70, -140, 140, 80);
    // feather scallops, laid like shingles from the neck down
    g.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      const y = -132 + (i / 1500) * 134, x = -56 + r() * 106, s = 3.2 + r() * 3.4;
      const flow = 1.15 + (x + 10) * 0.004 + (y + 60) * 0.002; // feathers sweep down and back
      g.save(); g.translate(x, y); g.rotate(flow - Math.PI / 2);
      g.beginPath(); g.arc(0, 0, s, 0.12 * Math.PI, 0.88 * Math.PI);
      g.strokeStyle = `rgba(14,70,112,${0.025 + r() * 0.05})`; g.lineWidth = 0.8; g.stroke();
      g.beginPath(); g.arc(0, 1.1, s, 0.2 * Math.PI, 0.8 * Math.PI);
      g.strokeStyle = `rgba(228,247,255,${0.03 + r() * 0.05})`; g.lineWidth = 1.4; g.stroke();
      g.restore();
    }
    // fine barbs
    for (let i = 0; i < 900; i++) {
      const x = -56 + r() * 106, y = -132 + r() * 134, l = 3 + r() * 5, a = 1.1 + r() * 0.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.strokeStyle = r() < .5 ? 'rgba(16,74,116,.09)' : 'rgba(232,248,255,.1)'; g.lineWidth = 0.6; g.stroke();
    }
    // mantle: the barring of the head carries on over the upper back
    gr = g.createRadialGradient(20, -116, 3, 18, -112, 36);
    gr.addColorStop(0, 'rgba(238,242,245,.95)'); gr.addColorStop(.6, 'rgba(212,228,238,.7)'); gr.addColorStop(1, 'rgba(180,218,238,0)');
    g.fillStyle = gr; g.fillRect(-20, -140, 80, 80);
    for (let rad = 30; rad < 84; rad += 3.4) {
      const k = (rad - 30) / 54; g.beginPath();
      for (let a = 0.05; a <= 1.2; a += 0.04) { const rr = rad + Math.sin(a * 17 + rad) * 0.8, x = -22 + Math.cos(a) * rr, y = -150 + Math.sin(a) * rr; a === 0.05 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = `rgba(34,36,24,${0.75 * Math.sin(Math.min(1, k * 1.5) * Math.PI * 0.5) * (1 - k * 0.55)})`; g.lineWidth = 1.5 + k * 0.6; g.stroke();
    }
    // light from the upper left, shade under the belly and along the back
    gr = g.createRadialGradient(-30, -84, 4, -24, -76, 58);
    gr.addColorStop(0, 'rgba(240,252,255,.42)'); gr.addColorStop(1, 'rgba(240,252,255,0)');
    g.fillStyle = gr; g.fillRect(-70, -140, 140, 150);
    gr = g.createLinearGradient(0, -34, 6, 2);
    gr.addColorStop(0, 'rgba(10,50,84,0)'); gr.addColorStop(1, 'rgba(10,50,84,.5)');
    g.fillStyle = gr; g.fillRect(-70, -40, 140, 50);
    gr = g.createLinearGradient(8, -70, 50, -52);
    gr.addColorStop(0, 'rgba(10,48,82,0)'); gr.addColorStop(1, 'rgba(10,48,82,.42)');
    g.fillStyle = gr; g.fillRect(-70, -140, 140, 150);
    // brighter, slightly turquoise rump by the tail
    gr = g.createRadialGradient(38, -22, 2, 38, -22, 22);
    gr.addColorStop(0, 'rgba(120,205,255,.5)'); gr.addColorStop(1, 'rgba(120,205,255,0)');
    g.fillStyle = gr; g.fillRect(10, -50, 50, 50);
  }

  // Wing is painted lying flat: u runs from the shoulder (0) to the tip (140), v across.
  const WING = 'M0,2 C8,-19 42,-25 74,-18 C100,-12 126,-5 141,3 C122,7 98,14 72,18 C42,23 8,20 0,2 Z';
  function paintWing(g, res) {
    const p = new Path2D(WING), r = rnd(5);
    softFill(g, p, '#2f3238', res, 1.2);
    g.globalCompositeOperation = 'source-atop';
    // flight feathers: long dark blades with yellow-green edges
    for (let i = 0; i < 8; i++) {
      const v0 = -15 + i * 4.6, tip = 141 - (7 - i) * 10.5, tv = 3 + (i - 7) * 0.5;
      g.beginPath(); g.moveTo(48, v0 - 3); g.quadraticCurveTo(tip - 30, v0 - 1 + (tv - v0) * .5, tip, tv);
      g.quadraticCurveTo(tip - 28, v0 + 7 + (tv - v0) * .45, 46, v0 + 6); g.closePath();
      const gr = g.createLinearGradient(48, 0, tip, 0); gr.addColorStop(0, '#2b2e24'); gr.addColorStop(1, '#1b1d18');
      g.fillStyle = gr; g.fill();
      g.beginPath(); g.moveTo(48, v0 + 6); g.quadraticCurveTo(tip - 28, v0 + 7 + (tv - v0) * .45, tip, tv);
      g.strokeStyle = i > 3 ? 'rgba(228,236,240,.9)' : 'rgba(168,198,218,.75)'; g.lineWidth = i > 3 ? 1.5 : 1; g.stroke();
      g.beginPath(); g.moveTo(52, v0 + 1.5); g.quadraticCurveTo(tip - 30, v0 + 3 + (tv - v0) * .5, tip - 4, tv);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = .6; g.stroke();
    }
    // coverts: black-centred feathers with yellow fringes, small at the shoulder and larger further down
    const rows = [];
    for (let u = 4; u < 84;) { const s = 3.1 + u * 0.062; rows.push([u, s]); u += s * 1.12; }
    rows.reverse().forEach(([u, s], ri) => {
      const half = 22 * Math.sin(Math.min(1, u / 60) * Math.PI / 2) * (u > 60 ? 1 - (u - 60) / 120 : 1) + 2;
      for (let v = -half - s; v <= half + s; v += s * 1.55) {
        const vv = v + (ri % 2 ? s * 0.78 : 0) + (r() - .5) * 1.2, uu = u + (r() - .5) * 1.4;
        g.save(); g.translate(uu, vv); g.rotate((vv / 40) + (r() - .5) * .12);
        g.beginPath(); g.ellipse(0, 0, s * 1.08, s * 0.86, 0, 0, TAU);
        g.fillStyle = u < 30 ? '#f5f6f3' : (u < 58 ? '#e6ecee' : '#cfdfe9'); g.fill();
        g.beginPath(); g.ellipse(-s * 0.22, 0, s * 1.0, s * (0.7 + r() * 0.08), 0, 0, TAU);
        g.fillStyle = '#1f2126'; g.fill();
        g.beginPath(); g.moveTo(-s, 0); g.lineTo(s * .5, 0); g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = .5; g.stroke();
        g.restore();
      }
    });
    // shading: darker toward the back edge, soft light along the middle
    let gr = g.createLinearGradient(0, -24, 0, 22);
    gr.addColorStop(0, 'rgba(0,0,0,.34)'); gr.addColorStop(.4, 'rgba(0,0,0,0)'); gr.addColorStop(.7, 'rgba(255,255,220,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.18)');
    g.fillStyle = gr; g.fillRect(-5, -30, 150, 60);
  }

  // Tail lies flat too: base at 0, tip at 128.
  function paintTail(g, res) {
    const feather = (len, v0, w, c0, c1, band) => {
      g.beginPath(); g.moveTo(-6, v0 - w); g.quadraticCurveTo(len * .6, v0 * .5 - w * .9, len, v0 * .12);
      g.quadraticCurveTo(len * .6, v0 * .5 + w * .9, -6, v0 + w); g.closePath();
      const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, c0);
      if (band) { gr.addColorStop(.3, c0); gr.addColorStop(.42, '#eef3f5'); gr.addColorStop(.66, '#dde7ee'); gr.addColorStop(.8, c1); }
      gr.addColorStop(1, c1);
      g.save(); g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 1.5 * res; g.fillStyle = gr; g.fill(); g.restore();
      g.beginPath(); g.moveTo(0, v0); g.quadraticCurveTo(len * .6, v0 * .5, len - 2, v0 * .12);
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = .6; g.stroke();
    };
    feather(62, -9, 6, '#2b7fae', '#1b3f63', true); feather(62, 9, 6, '#2b7fae', '#1b3f63', true);
    feather(84, -6, 5.6, '#2a74a8', '#1a3a66', true); feather(84, 6, 5.6, '#2a74a8', '#1a3a66', true);
    feather(124, -2.6, 5.2, '#23508c', '#12244c'); feather(128, 2.6, 5.2, '#2a5a9a', '#152a56');
  }

  const HEAD = 'M-29,7 C-33,-10 -25,-30 -5,-33 C16,-35 33,-21 33,-1 C34,17 34,32 30,46 L-24,46 C-28,34 -29,20 -29,7 Z';
  function paintHead(g, res) {
    const p = new Path2D(HEAD), r = rnd(23);
    const base = g.createLinearGradient(-26, -30, 26, 40);
    base.addColorStop(0, '#ffffff'); base.addColorStop(.5, '#f5f6f4'); base.addColorStop(1, '#e6ebee');
    softFill(g, p, base, res, 1.6);
    g.globalCompositeOperation = 'source-atop';
    // nape shades toward the green of the back
    let gr = g.createLinearGradient(8, 0, 34, 30);
    gr.addColorStop(0, 'rgba(200,222,236,0)'); gr.addColorStop(1, 'rgba(140,196,228,.7)');
    g.fillStyle = gr; g.fillRect(-40, -40, 80, 90);
    // fine dark barring over the crown and nape; the face stays clear yellow
    g.lineCap = 'round';
    for (let rad = 33; rad < 80; rad += 2.8) {
      const k = (rad - 33) / 47, a0 = -1.38 + k * 0.5, a1 = 0.3 + k * 0.42;
      g.beginPath();
      for (let a = a0; a <= a1; a += 0.03) {
        const rr = rad + Math.sin(a * 23 + rad) * 0.45 + (r() - .5) * 0.4, x = -34 + Math.cos(a) * rr, y = 6 + Math.sin(a) * rr;
        a === a0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.strokeStyle = `rgba(34,34,22,${0.35 + Math.min(1, k * 2.5) * 0.5})`; g.lineWidth = 0.85 + k * 0.7; g.stroke();
    }
    // soft feather texture on the face
    for (let i = 0; i < 380; i++) {
      const x = -30 + r() * 62, y = -34 + r() * 78, l = 2 + r() * 4, a = 0.5 + r() * 0.9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.strokeStyle = r() < .5 ? 'rgba(110,130,150,.08)' : 'rgba(255,255,255,.12)'; g.lineWidth = .6; g.stroke();
    }
    // light on the forehead, shade under the chin and at the back
    gr = g.createRadialGradient(-12, -18, 2, -10, -14, 30);
    gr.addColorStop(0, 'rgba(255,255,225,.5)'); gr.addColorStop(1, 'rgba(255,255,225,0)');
    g.fillStyle = gr; g.fillRect(-40, -40, 80, 90);
    gr = g.createLinearGradient(-10, 22, -4, 46);
    gr.addColorStop(0, 'rgba(80,104,128,0)'); gr.addColorStop(1, 'rgba(80,104,128,.3)');
    g.fillStyle = gr; g.fillRect(-40, 10, 80, 40);
    // violet cheek patch and the black throat spots
    g.save(); g.translate(-13, 18); g.rotate(0.5);
    gr = g.createRadialGradient(0, 0, 1, 0, 0, 8.5);
    gr.addColorStop(0, '#4144c8'); gr.addColorStop(.7, '#2d2fa0'); gr.addColorStop(1, 'rgba(45,47,160,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 8.5, 5, 0, 0, TAU); g.fill(); g.restore();
    [[-19, 29.5, 2.3], [-9.5, 33.5, 2.8], [1.5, 34.5, 2.7], [12, 32, 2.2]].forEach(([x, y, s]) => {
      g.beginPath(); g.ellipse(x, y, s, s * 1.12, 0.2, 0, TAU); g.fillStyle = '#1b1b16'; g.fill();
    });
    // fade the bottom edge so the neck melts into the breast and back
    g.globalCompositeOperation = 'destination-out';
    gr = g.createLinearGradient(0, 38, 0, 47); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(-40, 37, 80, 14);
  }
  function drawBeak(g, open) {
    // inside of the mouth, seen only when the beak opens
    if (open > 0.03) { g.beginPath(); g.moveTo(-23, 5); g.lineTo(-33, 9 + open * 4); g.lineTo(-24, 11 + open * 5); g.closePath(); g.fillStyle = '#3a1f1c'; g.fill(); }
    // lower mandible drops, upper lifts a touch
    g.save(); g.translate(-21, 7); g.rotate(-open * 0.5); g.translate(21, -7);
    g.beginPath(); g.moveTo(-21, 6.5); g.bezierCurveTo(-26, 7, -30, 10, -30.5, 15); g.bezierCurveTo(-27, 16.5, -23, 14, -20.5, 9.5); g.closePath();
    let gr = g.createLinearGradient(-30, 8, -21, 14); gr.addColorStop(0, '#b9a765'); gr.addColorStop(1, '#8f7f4c');
    g.fillStyle = gr; g.fill(); g.restore();
    g.save(); g.translate(-22, 0); g.rotate(open * 0.1); g.translate(22, 0);
    g.beginPath(); g.moveTo(-22, -2); g.bezierCurveTo(-31, -3, -38, 3, -34.5, 15.5); g.bezierCurveTo(-33, 10.5, -28.5, 7.5, -21.5, 7.5); g.closePath();
    gr = g.createLinearGradient(-36, 0, -24, 10); gr.addColorStop(0, '#f4dc78'); gr.addColorStop(.6, '#e2c148'); gr.addColorStop(1, '#b8952e');
    g.fillStyle = gr; g.fill();
    g.beginPath(); g.moveTo(-30, -1); g.quadraticCurveTo(-35.5, 3, -34.3, 12); g.strokeStyle = 'rgba(255,255,240,.55)'; g.lineWidth = 1; g.stroke();
    // blue cere with its nostril
    gr = g.createRadialGradient(-28.5, -6, .5, -27, -4, 7); gr.addColorStop(0, '#f3e2c8'); gr.addColorStop(.6, '#dcbd94'); gr.addColorStop(1, '#b8946a');
    g.beginPath(); g.ellipse(-26.5, -4, 6.2, 4.6, -0.35, 0, TAU); g.fillStyle = gr; g.fill();
    g.beginPath(); g.ellipse(-28, -4.2, 1.3, 1, -0.3, 0, TAU); g.fillStyle = 'rgba(96,64,44,.8)'; g.fill();
    g.restore();
  }
  function drawEye(g, lid, pin) {
    const x = -9.5, y = -7.5, R = 5;
    g.beginPath(); g.arc(x, y, R + 0.8, 0, TAU); g.fillStyle = 'rgba(84,90,98,.45)'; g.fill();
    g.save(); g.beginPath(); g.arc(x, y, R, 0, TAU); g.clip();
    g.fillStyle = '#eceadb'; g.fillRect(x - R, y - R, R * 2, R * 2);
    g.beginPath(); g.arc(x, y, lerp(4.05, 2.9, pin), 0, TAU); g.fillStyle = '#0c0c0c'; g.fill();
    g.beginPath(); g.arc(x - 1.7, y - 1.9, 1.25, 0, TAU); g.fillStyle = 'rgba(255,255,255,.95)'; g.fill();
    g.beginPath(); g.arc(x + 1.6, y + 2, .6, 0, TAU); g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
    if (lid > 0.01) { // birds mostly blink upward with the lower lid
      const h = R * 2 * lid;
      g.fillStyle = '#d9dcd8'; g.fillRect(x - R, y + R - h * 0.8, R * 2, h); g.fillRect(x - R, y - R, R * 2, h * 0.22);
      g.beginPath(); g.moveTo(x - R, y + R - h * 0.8); g.lineTo(x + R, y + R - h * 0.8); g.strokeStyle = 'rgba(70,60,20,.6)'; g.lineWidth = .8; g.stroke();
    }
    g.restore();
  }
  function drawFoot(g, x, lift) {
    g.save(); g.translate(x, -lift);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // short leg into the belly feathers
    g.beginPath(); g.moveTo(1, -15); g.lineTo(0, -3); g.strokeStyle = '#b39da3'; g.lineWidth = 4.6; g.stroke();
    // two toes forward over the perch, one seen behind
    [[-6.5, 5.4], [-1.2, 5.6], [5.5, 4.8]].forEach(([dx, w], i) => {
      g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(dx * 0.9, -5.5, dx, 1.5); g.quadraticCurveTo(dx * 1.02, 6, dx * 0.9, 9);
      g.strokeStyle = i === 2 ? '#a8939a' : '#cdb7bc'; g.lineWidth = w; g.stroke();
      g.strokeStyle = 'rgba(60,58,70,.45)'; g.lineWidth = .7;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(dx - w / 2 + .6, -1 + k * 3); g.lineTo(dx + w / 2 - .6, -1.4 + k * 3); g.stroke(); }
      g.beginPath(); g.moveTo(dx * 0.9, 9); g.quadraticCurveTo(dx * 0.86, 12.5, dx * 0.7, 14); g.strokeStyle = '#3d3a40'; g.lineWidth = 1.5; g.stroke();
    });
    g.restore();
  }

  // ----- scene: soft out-of-focus garden light and a real-looking branch -----
  function paintScene(g, W, H, perchY, k) {
    const r = rnd(77);
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#dcebc9'); gr.addColorStop(.45, '#b4d3a2'); gr.addColorStop(1, '#7fa979');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const cols = ['236,246,200', '250,244,190', '150,204,134', '104,168,104', '214,238,206', '86,146,96'];
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = r() * H, rad = (0.05 + r() * 0.16) * Math.max(W, H), c = cols[Math.floor(r() * cols.length)], a = 0.1 + r() * 0.24;
      gr = g.createRadialGradient(x, y, rad * 0.2, x, y, rad);
      gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(.75, `rgba(${c},${a * .8})`); gr.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    gr = g.createRadialGradient(W * .2, H * .12, 0, W * .2, H * .12, W * .6);
    gr.addColorStop(0, 'rgba(255,250,214,.5)'); gr.addColorStop(1, 'rgba(255,250,214,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .8);
    gr.addColorStop(0, 'rgba(20,40,24,0)'); gr.addColorStop(1, 'rgba(20,40,24,.32)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function paintBranch(g, W, H, perchY, k) {
    const r = rnd(31), T = 17 * k, yc = perchY + T * 0.42;
    const yAt = x => yc + Math.sin(x / W * 2.2 + 0.4) * 5 * k + (x / W - .5) * 9 * k;
    const trace = (dy) => { g.beginPath(); for (let x = -20; x <= W + 20; x += 12) { const y = yAt(x) + dy; x === -20 ? g.moveTo(x, y) : g.lineTo(x, y); } };
    g.lineCap = 'round';
    // a side twig heading off behind
    g.beginPath(); g.moveTo(W * .78, yAt(W * .78)); g.quadraticCurveTo(W * .86, yAt(W * .8) - 30 * k, W * .97, yAt(W * .8) - 58 * k);
    g.strokeStyle = '#5a4532'; g.lineWidth = T * .42; g.stroke();
    g.strokeStyle = '#7b6248'; g.lineWidth = T * .2; g.stroke();
    g.save(); g.shadowColor = 'rgba(20,30,20,.35)'; g.shadowBlur = 10 * k; g.shadowOffsetY = 5 * k;
    trace(0); g.strokeStyle = '#4e3b2a'; g.lineWidth = T; g.stroke(); g.restore();
    trace(-T * .12); g.strokeStyle = '#6f573f'; g.lineWidth = T * .72; g.stroke();
    trace(-T * .26); g.strokeStyle = '#8d7355'; g.lineWidth = T * .36; g.stroke();
    trace(-T * .36); g.strokeStyle = 'rgba(214,190,150,.5)'; g.lineWidth = T * .1; g.stroke();
    for (let i = 0; i < 150; i++) { // bark
      const x = r() * W, dy = (r() - .5) * T * .8, l = (6 + r() * 22) * k;
      g.beginPath(); g.moveTo(x, yAt(x) + dy); g.lineTo(x + l, yAt(x + l) + dy + (r() - .5) * 2 * k);
      g.strokeStyle = r() < .6 ? 'rgba(40,28,18,.3)' : 'rgba(220,200,165,.2)'; g.lineWidth = (0.6 + r()) * k; g.stroke();
    }
    for (let i = 0; i < 4; i++) { const x = W * (.1 + r() * .8), y = yAt(x) + (r() - .5) * T * .3; g.beginPath(); g.ellipse(x, y, 3.4 * k, 2.2 * k, 0, 0, TAU); g.fillStyle = 'rgba(46,32,20,.5)'; g.fill(); }
  }

  // ----- the rig -----
  const B = {
    cv: null, g: null, W: 0, H: 0, k: 1, perchY: 0, parts: null, scene: null, raf: 0, last: 0,
    visible: true, asleep: true, getEnv: () => 0,
    v: {head: 0, hx: 0, hy: 0, turn: 1, fluff: 1, lean: 0, crouch: 0, tail: 0, wing: 0, wingLen: 1, lid: 0.9, pin: 0, beak: 0, step: 0, hop: 0, puff: 0, dusk: 1},
    look: {head: 0, hx: 0, hy: 0, turn: 1}, nextLook: 0, nextBlink: 0, blinkUntil: 0, nextAct: 0, act: null, alertUntil: 0, listenUntil: 0, excite: 0, env: 0, peekUntil: 0, nextPeek: 0,
    init(cv, opts = {}) {
      this.cv = cv; this.g = cv.getContext('2d'); Object.assign(this, opts);
      new ResizeObserver(() => this.resize()).observe(cv); this.resize();
      document.addEventListener('visibilitychange', () => this.run());
      this.nextAct = performance.now() + 6000; this.run();
    },
    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
      if (W === this.W && H === this.H) return;
      this.W = this.cv.width = W; this.H = this.cv.height = H;
      this.k = Math.min(W / 300, H / 318); this.perchY = H * 0.5 + 58 * this.k;
      const res = Math.min(4, Math.max(1, this.k * 1.15));
      this.parts = {
        body: sprite(-62, -142, 60, 8, res, paintBody), wing: sprite(-6, -32, 148, 30, res, paintWing),
        tail: sprite(-10, -20, 134, 20, res, paintTail), head: sprite(-40, -42, 42, 52, res, paintHead)
      };
      const sc = document.createElement('canvas'); sc.width = W; sc.height = H;
      const sg = sc.getContext('2d'); paintScene(sg, W, H, this.perchY, this.k); this.scene = sc;
      const br = document.createElement('canvas'); br.width = W; br.height = H;
      paintBranch(br.getContext('2d'), W, H, this.perchY, this.k); this.branch = br;
      this.draw(performance.now());
    },
    run() {
      cancelAnimationFrame(this.raf);
      if (document.hidden || !this.visible) { this.draw(performance.now()); return; }
      const loop = now => { this.draw(now); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    },
    setVisible(v) { this.visible = v; this.run(); },
    setAsleep(a) { this.asleep = a; if (!a) { this.alertUntil = performance.now() + 900; this.act = null; this.nextAct = performance.now() + 5000; } },
    // the app tells the bird what is going on
    notice() { const n = performance.now(); this.alertUntil = n + 1300; this.look = {head: (Math.random() < .5 ? -0.3 : 0.26), hx: -2, hy: -7, turn: 1}; this.nextLook = n + 900; if (this.act && this.act.type !== 'step') this.act = null; this.excite = Math.min(1, this.excite + 0.34); },
    listenUp(sec) { this.listenUntil = performance.now() + sec * 1000; },
    startAct(type, now) {
      const d = {preen: 3400, shake: 1700, step: 900, stretch: 2300, wag: 700, bob: 1300, scratch: 1500}[type];
      this.act = {type, t0: now, dur: d, dir: this.v.step > 14 ? -1 : this.v.step < -14 ? 1 : (Math.random() < .5 ? -1 : 1), from: this.v.step, n: 2 + Math.floor(Math.random() * 3)};
    },
    update(now, dt) {
      const v = this.v, T = {head: this.look.head, hx: this.look.hx, hy: this.look.hy, turn: this.look.turn, fluff: 0.05, lean: 0, crouch: 0, tail: 0, wing: 0, wingLen: 1, lid: 0, pin: 0, puff: 0};
      let headRate = 26, hop = 0, step = v.step;
      const env = this.env = this.getEnv(), speaking = env > 0.04;
      this.excite = Math.max(0, this.excite - dt * 0.05);
      if (this.asleep) {
        // dozing: fluffed up, eyes closed, head sunk into the shoulders, with the odd sleepy peek
        if (now > this.nextPeek) { this.peekUntil = now + 900 + Math.random() * 900; this.nextPeek = now + 9000 + Math.random() * 14000; }
        Object.assign(T, {head: 0.1, hx: 2, hy: 9, turn: 1, fluff: 1, lid: now < this.peekUntil ? 0.45 : 0.93, crouch: 3}); headRate = 3; this.act = null;
      } else {
        if (now > this.nextLook) { // heads move in quick jumps, then hold still
          const far = Math.random() < 0.3;
          this.look = {head: (Math.random() - .55) * (far ? 0.62 : 0.3), hx: (Math.random() - .5) * 5, hy: (Math.random() - .6) * 5, turn: 0.9 + Math.random() * 0.1};
          this.nextLook = now + (Math.random() < 0.3 ? 180 + Math.random() * 250 : 600 + Math.random() * 2400);
        }
        if (now > this.nextBlink) { this.blinkUntil = now + 120; this.nextBlink = now + 1600 + Math.random() * 4200; }
        if (now < this.blinkUntil) T.lid = 1;
        if (now < this.listenUntil && !speaking) { T.head += 0.3; T.hy -= 5; T.fluff = 0.03; }
        if (now < this.alertUntil) { T.pin = 1; T.fluff = 0; T.hy -= 3; }
        if (!this.act && now > this.nextAct && !speaking && now > this.alertUntil) {
          const pool = ['preen', 'preen', 'shake', 'step', 'step', 'stretch', 'wag', 'scratch'];
          this.startAct(pool[Math.floor(Math.random() * pool.length)], now);
          this.nextAct = now + 7000 + Math.random() * 13000;
        }
        const a = this.act;
        if (a) {
          const p = (now - a.t0) / a.dur;
          if (p >= 1 || (speaking && a.type !== 'bob' && a.type !== 'step')) this.act = null;
          else if (a.type === 'preen') { // nibble through the breast feathers
            const inOut = ease(clamp(p * 5, 0, 1)) * ease(clamp((1 - p) * 5, 0, 1));
            T.head = -0.95 * inOut + Math.sin(now / 55) * 0.05 * inOut; T.hx = -3 * inOut + Math.sin(now / 410) * 3 * inOut; T.hy = 21 * inOut + Math.sin(now / 300) * 3 * inOut;
            T.fluff = 0.45; T.lid = 0.35 * inOut; v.beak = Math.max(v.beak, (0.2 + 0.2 * Math.sin(now / 45)) * inOut); headRate = 14;
          } else if (a.type === 'shake') { // fluff right up, shake it all out, settle
            const up = ease(clamp(p / 0.25, 0, 1)), sh = p > 0.25 && p < 0.62 ? 1 : 0, down = ease(clamp((1 - p) / 0.35, 0, 1));
            T.fluff = Math.min(up, down) * 1.15; v.lean = sh * Math.sin(now / 11) * 0.055; T.head += sh * Math.sin(now / 11 + 1.5) * 0.16; v.tail = sh * Math.sin(now / 11 + 3) * 0.1; T.lid = sh ? 0.8 : 0; T.wing = sh * 0.06;
          } else if (a.type === 'step') { // shuffle sideways along the perch
            const q = p * a.n, i = Math.floor(q), f = q - i;
            step = a.from + a.dir * 9 * (i + ease(clamp(f * 1.6, 0, 1))); hop = Math.sin(clamp(f * 1.6, 0, 1) * Math.PI) * 3.2; T.lean = a.dir * 0.035 * Math.sin(f * Math.PI);
          } else if (a.type === 'stretch') { // one wing and the leg under it stretched down and back
            const s = ease(clamp(p * 3, 0, 1)) * ease(clamp((1 - p) * 3.4, 0, 1));
            T.wing = 0.1 * s; T.wingLen = 1 + 0.26 * s; T.lean = 0.07 * s; T.head += 0.18 * s; T.hy -= 3 * s; T.lid = 0.3 * s; T.tail = -0.08 * s;
          } else if (a.type === 'wag') v.tail = Math.sin(now / 22) * 0.1 * Math.sin(p * Math.PI);
          else if (a.type === 'bob') { const s = Math.sin(p * Math.PI); T.hy += Math.sin(now / 62) * 7 * s; T.head += Math.sin(now / 62) * 0.1 * s; T.pin = 1; headRate = 30; }
          else if (a.type === 'scratch') { const s = ease(clamp(p * 4, 0, 1)) * ease(clamp((1 - p) * 4, 0, 1)); T.head = 0.5 * s + Math.sin(now / 30) * 0.06 * s; T.hy = 6 * s; T.lid = 0.6 * s; T.lean = -0.05 * s; T.fluff = 0.4; }
        }
        if (speaking) { // calling: beak, throat, a lift of the head and a dip of the tail on each note
          T.head += 0.1 + 0.16 * env; T.hy -= 2 + 5 * env; T.hx -= 2 * env; T.puff = env; T.tail += 0.09 * env; T.fluff = 0.05; T.crouch = -1.5 * env; T.pin = 0.7;
        }
      }
      const sm = (key, rate) => { v[key] += (T[key] - v[key]) * (1 - Math.exp(-dt * rate)); };
      sm('head', headRate); sm('hx', headRate); sm('hy', headRate); sm('turn', 14); sm('fluff', 3.2); sm('lean', 9); sm('crouch', 10);
      sm('tail', 16); sm('wing', 7); sm('wingLen', 7); sm('lid', 34); sm('pin', 9); sm('puff', 30);
      v.beak += ((speaking ? clamp(env * 1.5, 0, 1) : 0) - v.beak) * (1 - Math.exp(-dt * 38));
      v.step = step; v.hop = hop;
      v.dusk += ((this.asleep ? 1 : 0) - v.dusk) * (1 - Math.exp(-dt * 1.4));
    },
    draw(now) {
      const g = this.g; if (!g || !this.parts) return;
      const dt = clamp((now - (this.last || now)) / 1000, 0, 0.05); this.last = now;
      this.update(now, dt);
      const {W, H, k, v} = this, P = this.parts;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.scene, 0, 0);
      const breath = Math.sin(now / (this.asleep ? 900 : 430)), bx = 1 + 0.012 * breath + 0.13 * v.fluff, by = 1 + 0.03 * v.fluff;
      const ox = W / 2 - 4 * k + v.step * k, oy = this.perchY;
      g.setTransform(k, 0, 0, k, ox, oy);
      g.translate(0, -v.hop);
      // tail hangs behind the perch and bobs a hair with each breath
      g.save(); g.rotate(v.lean); g.translate(0, v.crouch);
      g.save(); g.translate(37, -24); g.rotate(1.02 + v.tail + breath * 0.008 - v.fluff * 0.03); put(g, P.tail); g.restore();
      g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.branch, 0, 0);
      g.setTransform(k, 0, 0, k, ox, oy);
      // feet stay planted while the body moves over them
      const lift = v.hop * 1.2;
      drawFoot(g, 10, lift * 0.7); drawFoot(g, -9, lift);
      g.translate(0, -v.hop); g.rotate(v.lean); g.translate(0, v.crouch + v.fluff * 2.5);
      // body, swelling when fluffed
      g.save(); g.translate(-2, -60); g.scale(bx, by); g.translate(2, 60);
      g.shadowColor = 'rgba(14,40,20,.28)'; g.shadowBlur = 9 * k; g.shadowOffsetY = 3 * k; put(g, P.body); g.restore();
      // folded wing
      g.save(); g.translate(-1 + v.fluff * 3, -112); g.rotate(1.085 + v.wing); g.scale(v.wingLen, 1 + v.fluff * 0.06);
      g.shadowColor = 'rgba(10,30,14,.4)'; g.shadowBlur = 5 * k; g.shadowOffsetX = -1.5 * k; g.shadowOffsetY = 1.5 * k; put(g, P.wing); g.restore();
      // head on its short neck
      g.save(); g.translate(-11 + v.hx, -141 + v.hy + v.fluff * 7); g.rotate(v.head); g.scale(0.94 * v.turn * (1 + v.fluff * 0.05), 0.94 * (1 + v.fluff * 0.03));
      if (v.puff > 0.02) { g.save(); g.translate(-6, 22); g.scale(1 + v.puff * 0.07, 1 + v.puff * 0.05); g.translate(6, -22); }
      g.save(); g.shadowColor = 'rgba(30,50,70,.25)'; g.shadowBlur = 4 * k; put(g, P.head); g.restore();
      if (v.puff > 0.02) g.restore();
      drawBeak(g, v.beak); drawEye(g, v.lid, v.pin);
      g.restore();
      // evening light while asleep
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (v.dusk > 0.01) { g.fillStyle = `rgba(14,22,48,${0.5 * v.dusk})`; g.fillRect(0, 0, W, H); }
    }
  };
  return B;
})();
