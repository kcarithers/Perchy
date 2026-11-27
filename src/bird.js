// ---------- the bird: a budgie built entirely from numbers ----------
// Nothing here is a picture. The bird is a small 3D model made of a few thousand feathers, each one placed on a
// body, head, wing or tail whose shape and colours come from a handful of settings (the "spec"). Every frame the
// skeleton is posed, each feather is turned to follow it, lit, and painted back to front. Because the pose is driven
// by springs, every movement has real in-between frames: nothing ever jumps from one picture to another.
const Bird = (() => {
  const PI = Math.PI, RAD = PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = t => t * t * (3 - 2 * t);
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  let rnd = rng((Date.now() ^ 0x5bd1e995) | 0);
  const rr = (a, b) => a + rnd() * (b - a);
  const noise = (t, k) => Math.sin(t + k * 12.9898) * 0.5 + Math.sin(t * 2.17 + k * 78.233) * 0.3 + Math.sin(t * 4.31 + k * 37.719) * 0.2;

  // ----- what a bird is made of: every one of these can be changed in the app -----
  const DEFAULT = {name: 'Sky blue', body: '#45bfe6', face: '#f7f7f3', marks: '#1d1d24', markAmt: 1, cheek: '#5a4fd0', cere: '#b98f66', tail: '', size: 1, build: 0.5, fluff: 0.25, tailLen: 1, barStart: 0.85, cap: 0};
  const PRESETS = [
    {id: 'sky', name: 'Sky blue', body: '#45bfe6', face: '#f7f7f3', cheek: '#5a4fd0', cere: '#b98f66'},
    {id: 'green', name: 'Green', body: '#6cc83f', face: '#f6e254', cheek: '#5b52cc', cere: '#5b86d8'},
    {id: 'yellow', name: 'Yellow', body: '#f5dc48', face: '#f8e65c', cheek: '#f3f1ea', cere: '#d6a391', markAmt: 0.06, tail: '#f4eccb'},
    {id: 'cobalt', name: 'Cobalt', body: '#3f6fdc', face: '#f7f7f3', cheek: '#5b3fc4', cere: '#5b86d8'},
    {id: 'violet', name: 'Violet', body: '#7d62d6', face: '#f7f7f3', cheek: '#5a35b8', cere: '#5b86d8'},
    {id: 'grey', name: 'Grey', body: '#97a1ab', face: '#f7f7f3', cheek: '#69788a', cere: '#b98f66', tail: '#30343c'},
    {id: 'white', name: 'White', body: '#f3f3ee', face: '#fbfbf8', cheek: '#f0f0f4', cere: '#dba99b', markAmt: 0, tail: '#f4f2ea'}
  ].map(p => Object.assign({}, DEFAULT, p));
  let spec = Object.assign({}, PRESETS[0]);

  // ----- colour -----
  const hex = h => { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a) => 'rgba(' + Math.round(clamp(c[0], 0, 255)) + ',' + Math.round(clamp(c[1], 0, 255)) + ',' + Math.round(clamp(c[2], 0, 255)) + ',' + (a == null ? 1 : a) + ')';
  // light and shade the way a painter mixes them: shadows go cooler and deeper, lights go warm and pale
  function shade(c, k) {
    if (k < 0.62) { const u = Math.pow(k / 0.62, 0.9); return [c[0] * lerp(0.47, 1, u), c[1] * lerp(0.52, 1, u), c[2] * lerp(0.68, 1, u)]; }
    return mixc(c, [255, 252, 240], 0.34 * (k - 0.62) / 0.38);
  }

  // ----- the sprite sheet: one soft brush mark per material, light level and variant -----
  const K = 10, V = 3;
  const MATS = {};                                              // name -> {y, w, h}
  let atlas = null;
  function tear(c, w, h, s) {                                   // a feather-shaped brush mark, base at the top
    const bx = w / 2, by = h * 0.06, H = h * 0.9 * s, W = w * 0.5 * s;
    c.beginPath(); c.moveTo(bx, by);
    c.bezierCurveTo(bx - W * 1.15, by + H * 0.22, bx - W * 1.05, by + H, bx, by + H);
    c.bezierCurveTo(bx + W * 1.05, by + H, bx + W * 1.15, by + H * 0.22, bx, by); c.closePath();
  }
  function softTear(c, w, h, col, a) { c.fillStyle = css(col, a || 0.36); for (let i = 0; i < 6; i++) { tear(c, w, h, 1 - i * 0.085); c.fill(); } }
  function barbs(c, w, h, r, col, n, a) {
    c.lineWidth = Math.max(0.6, w / 34); c.lineCap = 'round';
    for (let i = 0; i < n; i++) { const x = w * (0.18 + 0.64 * r()), y0 = h * (0.1 + 0.5 * r()), l = h * (0.15 + 0.3 * r()); c.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,' + a + ')' : css(shade(col, 0.3), a * 1.2); c.beginPath(); c.moveTo(x, y0); c.lineTo(x + (x - w / 2) * 0.12, y0 + l); c.stroke(); }
  }
  const painters = {
    feather(c, w, h, col, o, r) {
      softTear(c, w, h, col); c.globalCompositeOperation = 'source-atop';
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, css(shade(col, 0.45), o.soft ? 0.07 : 0.2)); gr.addColorStop(0.55, css(col, 0)); gr.addColorStop(1, 'rgba(255,255,255,.09)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h); barbs(c, w, h, r, col, o.soft ? 3 : 7, o.soft ? 0.035 : 0.07);
    },
    bar(c, w, h, col, o, r) {                                    // a pale feather with a dark band near its tip: rows of these make the barring
      softTear(c, w, h, col); c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = css(o.dark, 0.5); c.lineCap = 'round';
      if (o.flat) for (const lw of [0.2, 0.13, 0.08]) { c.lineWidth = h * lw; c.beginPath(); c.ellipse(w / 2, h * 0.34, w * 0.4, h * 0.13, 0, 0.04 * PI, 0.96 * PI); c.stroke(); }   // a thinner, straighter band that joins its neighbours into a long line
      else for (const lw of [0.3, 0.2, 0.12]) { c.lineWidth = h * lw; c.beginPath(); c.ellipse(w / 2, h * 0.3, w * 0.44, h * 0.4, 0, 0.16 * PI, 0.84 * PI); c.stroke(); }
      barbs(c, w, h, r, col, 4, 0.08);
    },
    scallop(c, w, h, col, o, r) {                                // a dark feather with a pale edge: the wing pattern
      softTear(c, w, h, col); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = css(o.dark, 0.36); c.translate(0, -h * 0.06);
      for (let i = 0; i < 5; i++) { tear(c, w, h, 0.7 - i * 0.075); c.fill(); }
      c.translate(0, h * 0.06); barbs(c, w, h, r, o.dark, 5, 0.07);
    },
    blade(c, w, h, col, o, r) {                                  // a long flight feather
      const bx = w / 2;
      for (let i = 0; i < 5; i++) {
        const s = 1 - i * 0.12, W = w * 0.46 * s; c.fillStyle = css(i < 2 && o.edge ? o.edge : col, 0.4);
        c.beginPath(); c.moveTo(bx, h * 0.01); c.bezierCurveTo(bx - W, h * 0.2, bx - W, h * 0.8, bx, h * 0.985); c.bezierCurveTo(bx + W, h * 0.8, bx + W, h * 0.2, bx, h * 0.01); c.fill();
      }
      c.globalCompositeOperation = 'source-atop';
      const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, css(shade(col, 0.4), 0.3)); gr.addColorStop(0.5, 'rgba(255,255,255,.1)'); gr.addColorStop(1, css(shade(col, 0.35), 0.35));
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = css(shade(col, 0.95), 0.4); c.lineWidth = Math.max(0.8, w / 16); c.beginPath(); c.moveTo(bx, h * 0.03); c.lineTo(bx, h * 0.95); c.stroke();
      c.lineWidth = 0.7;
      for (let i = 0; i < 26; i++) { const y = h * (0.06 + 0.86 * r()), sd = r() < 0.5 ? -1 : 1; c.strokeStyle = css(shade(col, r() < 0.5 ? 0.35 : 0.9), 0.16); c.beginPath(); c.moveTo(bx, y); c.lineTo(bx + sd * w * 0.4, y + h * 0.05); c.stroke(); }
    },
    disc(c, w, h, col, o) {                                      // a smooth dab: beak, cere, spots
      const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2), e = o.hard || 0.55;
      gr.addColorStop(0, css(col, 1)); gr.addColorStop(e, css(col, 1)); gr.addColorStop(1, css(col, 0));
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    }
  };
  let palette = {};
  function buildAtlas() {
    const s = spec, body = hex(s.body), face = hex(s.face), amt = clamp(s.markAmt, 0, 1);
    const dark = mixc(face, hex(s.marks), amt), tail = s.tail ? hex(s.tail) : mixc(mixc(body, [16, 44, 96], 0.72), face, 1 - Math.min(1, amt * 3));
    const flight = mixc(mixc(face, body, 0.25), mixc(hex(s.marks), [70, 76, 90], 0.25), amt);
    palette = {body, face, dark, tail};
    const defs = [
      ['body', 'feather', 44, 58, body, {}], ['belly', 'feather', 44, 58, mixc(body, [255, 255, 255], 0.1), {}],
      ['face', 'feather', 30, 38, face, {soft: 1}], ['bodyU', 'disc', 24, 24, mixc(body, [0, 0, 0], 0.04), {hard: 0.25}], ['faceU', 'disc', 24, 24, face, {hard: 0.25}], ['bar', 'bar', 30, 34, face, {dark}], ['hbar', 'bar', 30, 34, face, {dark, flat: 1}], ['mantle', 'bar', 40, 46, mixc(face, body, 0.15), {dark}],
      ['scallop', 'scallop', 40, 50, mixc(face, body, 0.12), {dark}], ['cheek', 'feather', 30, 38, mixc(face, hex(s.cheek), 0.94), {}],
      ['spot', 'disc', 20, 20, mixc(face, hex(s.marks), Math.min(1, amt * 1.2)), {hard: 0.5}],
      ['cere', 'disc', 20, 20, hex(s.cere), {hard: 0.5}], ['beak', 'disc', 20, 20, [208, 186, 98], {hard: 0.35}], ['beak2', 'disc', 20, 20, [186, 160, 88], {hard: 0.35}],
      ['mouth', 'disc', 20, 20, [58, 30, 30], {hard: 0.5}], ['nostril', 'disc', 12, 12, mixc(hex(s.cere), [40, 24, 20], 0.6), {hard: 0.3}],
      ['tail', 'blade', 26, 150, tail, {edge: mixc(tail, face, 0.25)}], ['prim', 'blade', 26, 120, flight, {edge: mixc(flight, face, 0.55)}], ['second', 'blade', 30, 80, flight, {edge: mixc(flight, face, 0.75)}]
    ];
    let y = 0, wmax = 0; for (const d of defs) { MATS[d[0]] = {y, w: d[2], h: d[3], id: d[0]}; y += d[3] + 2; wmax = Math.max(wmax, (d[2] + 2) * K * V); }
    atlas = document.createElement('canvas'); atlas.width = wmax; atlas.height = y;
    const c = atlas.getContext('2d'), r = rng(7);
    for (const [name, kind, w, h, col, o] of defs) for (let v = 0; v < V; v++) for (let k = 0; k < K; k++) {
      const m = MATS[name], j = (w < 34 ? [1, 0.985, 1.012] : [1, 0.96, 1.035])[v], base = [col[0] * j, col[1] * j * (v === 1 ? 1.01 : 1), col[2] * j];
      const oo = Object.assign({}, o); if (o.dark) oo.dark = shade(o.dark, 0.3 + 0.5 * k / (K - 1)); if (o.edge) oo.edge = shade(o.edge, 0.12 + 0.92 * k / (K - 1));
      c.save(); c.translate((v * K + k) * (w + 2), m.y); c.beginPath(); c.rect(0, 0, w, h); c.clip();
      painters[kind](c, w, h, shade(base, 0.04 + 0.84 * k / (K - 1)), oo, r); c.restore();
    }
  }

  // ----- the model -----
  // Bird space: x to the bird's side, y up, z forward (out through the chest). The feet grip the perch at 0,0,0.
  const AX0 = [0, 4, -34], AXD = [0, 0.8762, 0.4819], AXL = 91.3, FR = [0, -0.4819, 0.8762];   // body axis from rump to neck, and "front" across it
  const HS = 1.0, HC = [0, 97.5, 14], HPIV = [0, -9.5, -3.2], HR = [16.6, 16.7, 17.6];                        // head centre, the point it turns about, its radii
  const PROF = [[-0.05, 0], [0.03, 9.5], [0.15, 19.5], [0.3, 24], [0.45, 26.8], [0.6, 26.6], [0.8, 22.8], [0.9, 19.6], [1, 16.6], [1.1, 14.5]];
  let S = [], NS = 0;                                           // the feathers ("surfels")
  let order = null, depth = null, scr = null, lens = null, wids = null;
  function prof(t, build) {
    let i = 0; while (i < PROF.length - 2 && t > PROF[i + 1][0]) i++;
    const a = PROF[i], b = PROF[i + 1], u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1), r = lerp(a[1], b[1], ease(u) * 0.5 + u * 0.5);
    return r * (1 + (build - 0.5) * 0.34 * Math.sin(PI * clamp(t, 0, 1)));
  }
  function bodyPos(t, phi, off, build) {
    const r = prof(t, build) + off, c = 5 * Math.sin(PI * clamp(t, 0, 1)), cs = Math.cos(phi), d = c + r * cs * (cs < 0 ? 0.86 : 1), sx = r * 1.05 * Math.sin(phi), a = t * AXL;
    return [sx, AX0[1] + AXD[1] * a + FR[1] * d, AX0[2] + AXD[2] * a + FR[2] * d];
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function bodyFrame(t, phi, off, build) {
    const p = bodyPos(t, phi, off, build), dt = sub(bodyPos(t + 0.01, phi, off, build), bodyPos(t - 0.01, phi, off, build)), dp = sub(bodyPos(t, phi + 0.02, off, build), bodyPos(t, phi - 0.02, off, build));
    let n = norm(cross(dp, dt)); const out = sub(p, [0, AX0[1] + AXD[1] * t * AXL, AX0[2] + AXD[2] * t * AXL]);
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    return {p, n, t: norm([-dt[0], -dt[1], -dt[2]])};
  }
  function headDir(th, ps) {                                     // th: angle away from the beak, ps: angle round the face (0 = up)
    const P = [0, -0.12, 0.9928], U = [0, 0.9928, 0.12], ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ps), sp = Math.sin(ps);
    return [st * sp, P[1] * ct + st * cp * U[1], P[2] * ct + st * cp * U[2]];
  }
  let CAP = 0;
  const capW = d => sstep(lerp(-0.25, 0.2, sstep(0.25, 0.85, d[2])), 0.62, d[1]) * sstep(-0.5, 0.35, d[2]);
  const barLim = (cp, ps) => { const a = clamp(spec.barStart, 0, 1), add = lerp(-40, 54, a); return 60 + (add >= 0 ? add * Math.pow(Math.max(0, cp), 1.6) : add * sstep(0.2, 0.85, cp)) + 85 * Math.pow(Math.max(0, -cp), 2) + noise(ps * 7, 3) * 2.5; };
  function headPt(th, ps, off) {                                // the skull's shape: a flattish crown, a forehead sloping to the cere, full cheeks, and a long underside that runs into the neck
    const d = headDir(th, ps), up = Math.max(0, d[1]), dn = Math.max(0, -d[1]);
    const fr = sstep(-0.25, 0.45, d[2]);
    const cw = CAP * capW(d);                                     // a show bird's forehead: the front of the crown swells up, out and forward over the cere
    const rx = 15.5 * (1 + 0.06 * dn - 0.06 * up) * (1 + 0.12 * cw) + off, ry = (d[1] > 0 ? 16.8 * (1 + 0.26 * cw) : 21 + 7.2 * fr) + off, rz = (d[2] > 0 ? 17 * (1 - 0.04 * up - 0.24 * dn) * (1 + 0.3 * cw) : 19.5 * (1 + 0.1 * dn - 0.08 * up)) + off;
    const h = Math.max(1e-4, 1 - d[1] * d[1]), box = Math.pow(h, d[1] > 0 ? -0.16 : -0.3 * fr - 0.05);       // squares the dome's shoulders, and keeps the bib nearly as wide as the face
    return [d[0] * rx * box, d[1] * ry, d[2] * rz * (d[2] > 0 ? box : 1)];
  }
  function headFrame(th, ps, off) {
    const p = headPt(th, ps, off), a = sub(headPt(th + 0.03, ps, off), headPt(th - 0.03, ps, off)), b = sub(headPt(th, ps + 0.03, off), headPt(th, ps - 0.03, off));
    let n = norm(cross(a, b)); if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
    return {p, n, t: norm(a)};
  }
  const BONE = {body: 0, head: 1, jaw: 2, neck: 3, tail: 4, wingR: 5, wingL: 6};
  function build() {
    const r = rng(20261126), B = clamp(spec.build, 0, 1), list = [], TL = clamp(spec.tailLen, 0.6, 1.4); CAP = clamp(spec.cap, 0, 1);
    const add = (bone, f, w, l, mat, o) => list.push(Object.assign({bone, x: f.p[0], y: f.p[1], z: f.p[2], nx: f.n[0], ny: f.n[1], nz: f.n[2], tx: f.t[0], ty: f.t[1], tz: f.t[2], w, l, m: MATS[mat], v: Math.floor(r() * V), kind: 0, anchor: 0.22, lift: 0.14, fl: 1, br: 0, ph: r() * 6.283, ao: 1, bias: 0, fan: 0, two: 0, a: 1}, o || {}));
    // body: rows of feathers from the neck down to the rump
    for (let t = 1.03; t > -0.035;) {
      const l = t > 0.86 ? 8.5 : t < 0.14 ? 9 : 12.5, w = l * 0.74, rad = Math.max(2, prof(t, B)), n = Math.max(5, Math.round(2 * PI * rad / (w * 0.5))), o0 = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const phi = o0 + (i + (r() - 0.5) * 0.5) * 2 * PI / n, tt = t + (r() - 0.5) * 0.012, f = bodyFrame(tt, phi, 0, B), cs = Math.cos(phi);
        if (tt > 0.835 && cs > -0.35) continue;
        const back = (cs < -0.5 && tt > 0.6) || (cs < 0.3 && tt > 0.8), mat = back ? 'mantle' : (cs > 0.2 && tt < 0.6 ? 'belly' : 'body');
        add(0, f, back ? w * 0.9 : w, back ? l * 0.72 : l, mat, {br: Math.sin(PI * clamp(tt, 0, 1)) * (0.55 + 0.45 * cs), ao: tt > 0.86 ? lerp(1, 0.8, sstep(0.86, 1, tt)) * (cs > 0 ? 1 : 1.1) : 1, th: tt > 0.86 && cs > 0.3 ? 1 : 0});
      }
      t -= l * 0.36 / AXL;
    }
    for (let t = 0.98; t > -0.02; t -= 0.075) { const rad = Math.max(3, prof(t, B)), n = Math.max(4, Math.round(2 * PI * rad / 7.5)); for (let i = 0; i < n; i++) { const phi = (i + (t * 40 % 1)) * 2 * PI / n; const deep = t > 0.88 && Math.cos(phi) > 0.15; add(0, bodyFrame(t, phi, deep ? -5.5 : -1.6, B), 15, 15, 'bodyU', {kind: 1, anchor: 0.5, lift: 0, fl: 1, bias: -3, ao: deep ? 0.8 : 1, br: Math.sin(PI * clamp(t, 0, 1)) * 0.6}); } }
    // folded wings: scalloped feathers lying over the sides and back, then the long flight feathers
    for (const sd of [1, -1]) {
      const bone = sd > 0 ? BONE.wingR : BONE.wingL;
      // the same feathers have a second home: laid out as an open wing, reaching out, down and back from the shoulder
      const SH = [sd * 19, 75, -3], WA = norm([sd * 0.84, -0.44, -0.4]), WN = norm([sd * 0.28, 0.42, 0.86]), WT = norm(cross(WN, [WA[0] * sd, WA[1] * sd, WA[2] * sd])), WL = 74;
      if (WT[1] > 0) { WT[0] = -WT[0]; WT[1] = -WT[1]; WT[2] = -WT[2]; }
      const open = (u, v, ang, lift) => { const ca = Math.cos(ang), sa = Math.sin(ang), ch0 = 46 * (1 - 0.3 * u); return {sx: SH[0] + WA[0] * u * WL + WT[0] * v * ch0 + WN[0] * lift, sy: SH[1] + WA[1] * u * WL + WT[1] * v * ch0 + WN[1] * lift, sz: SH[2] + WA[2] * u * WL + WT[2] * v * ch0 + WN[2] * lift, stx: WT[0] * ca + WA[0] * sa, sty: WT[1] * ca + WA[1] * sa, stz: WT[2] * ca + WA[2] * sa, snx: WN[0], sny: WN[1], snz: WN[2], sp: 1, su: clamp(u, 0, 1)}; };
      for (let t = 0.83; t > 0.2;) {
        const k = (0.83 - t) / 0.63, l = 5.5 + 10.5 * k, w = l * 0.86, rad = prof(t, B) + 3, a0 = (88 - 30 * Math.sin(PI * Math.pow(Math.min(1, k * 1.15), 0.6))) * RAD, a1 = 179 * RAD, n = Math.max(2, Math.round((a1 - a0) * rad / (w * 0.52)));
        for (let i = 0; i <= n; i++) { const phi = a0 + (i + (r() - 0.5) * 0.4) / n * (a1 - a0); add(bone, bodyFrame(t + (r() - 0.5) * 0.01, sd * phi, 1 + 2.8 * Math.min(1, k * 2.5), B), k < 0.3 && r() > k / 0.3 ? w * 0.9 : w, k < 0.3 && r() > k / 0.3 ? l * 0.8 : l, r() > k / 0.26 ? 'bar' : 'scallop', Object.assign({bias: 3, lift: 0.1, fl: 0.6, br: 0.3}, open(0.02 + k * 0.84 + (r() - 0.5) * 0.05, (i / n) * 0.5, k * 0.6, 2.4 - (i / n) * 1.6), {sw: w * 1.25, sl: l * 1.25})); }
        t -= l * 0.4 / AXL;
      }
      for (let i = 0; i < 10; i++) {                              // secondaries
        const f = bodyFrame(0.56 - 0.036 * i, sd * (104 + 7 * i) * RAD, 4.2, B), tip = bodyFrame(0.2 - 0.026 * i, sd * (132 + 4.5 * i) * RAD, 4.6, B), d = sub(tip.p, f.p), L = Math.hypot(d[0], d[1], d[2]);
        add(bone, {p: f.p, n: f.n, t: norm(d)}, 8, L, 'second', Object.assign({anchor: 0.04, bias: 4 + i * 0.2, lift: 0, fl: 0.2, fan: sd * (i - 1) * 0.3, two: 1}, open(0.03 + i * 0.056, 0.4, 0.02 + i * 0.04, 0.6 - i * 0.08), {sl: 42 + i * 0.6, sw: 16}));
      }
      for (let i = 0; i < 10; i++) {                              // primaries, their tips crossing over the base of the tail
        const f = bodyFrame(0.44 - 0.024 * i, sd * (140 + 3.4 * i) * RAD, 4.8, B), tip = bodyPos(-0.46 + 0.04 * i, sd * 173 * RAD, 5 + i * 0.8, B), d = sub(tip, f.p), L = Math.hypot(d[0], d[1], d[2]);
        add(bone, {p: f.p, n: f.n, t: norm(d)}, 6.6, L, 'prim', Object.assign({anchor: 0.04, bias: 5 + i * 0.2, lift: 0, fl: 0.15, fan: sd * (i + 1) * 0.6, two: 1}, open(0.58 + i * 0.044, 0.42 - i * 0.03, 0.4 + i * 0.125, -0.2 - i * 0.1), {sl: 54 - i * 1.2, sw: 14.5}));
      }
    }
    // tail: long feathers from the rump, the middle pair longest
    const TD = norm([0, -0.8, -0.6]), TN = [0, -0.6, 0.8], rump = bodyPos(0.04, PI, -5, B);
    for (const [ix, len, bx] of [[0.3, 82, 0.8], [-0.3, 80, -0.8], [1, 63, 2.6], [-1, 63, -2.6], [2, 50, 4.4], [-2, 50, -4.4], [3, 38, 6], [-3, 38, -6]]) {
      const a = ix * 3.2 * RAD, d = norm([TD[0] + Math.sin(a), TD[1], TD[2]]);
      add(BONE.tail, {p: [rump[0] + bx, rump[1] + 3 - Math.abs(ix) * 0.6, rump[2] + 2 - Math.abs(ix) * 0.4], n: TN, t: d}, 7, len * TL, 'tail', {anchor: 0.03, lift: 0, fl: 0, fan: ix, two: 1, lag: 0.35 + 0.65 * len / 82, bias: -Math.abs(ix) * 0.6, v: Math.abs(Math.round(ix)) % V});
    }
    // neck: a sleeve of feathers from inside the back of the head down to the shoulders. Its top matches the head and its foot
    // matches the back, so the nape is one line from crown to back; it follows the head part-way when the head moves.
    const NK = (y, lo) => { const q = clamp((106 - y) / 36, 0, 1), cz = lerp(13.2, 0.8, q), xr = lerp(11.5, 20.6, Math.pow(q, 0.75)), zb = lerp(12.5, 19.4, Math.pow(q, 0.75)), zf = lerp(9, 14, q), cl = Math.cos(lo); return [Math.sin(lo) * xr, y, cz + cl * (cl > 0 ? zf : zb)]; };
    // its rows slope: higher at the back than at the sides, steeply near the head and levelling out at the shoulders, so the head's
    // diagonal barring carries on down the neck and turns level only where it meets the back
    const SP = (y0, lo) => { const s = 0.85 * Math.pow(clamp((y0 - 70) / 36, 0, 1), 1.2); return NK(y0 - s * (NK(y0, lo)[2] - 8), lo); };
    for (let y = 106, row = 0; y > 70; row++) {
      const q0 = (106 - y) / 36, small = q0 < 0.5, l = lerp(4.2, 5.4, Math.min(1, q0 * 2)) + (small ? 0 : 6 * (q0 - 0.5)), w = lerp(6, 6.8, Math.min(1, q0 * 2)) + (small ? 0 : 3 * (q0 - 0.5)), n = Math.round(2 * PI * lerp(17, 22, q0) / (w * 0.46)), o0 = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const lo = o0 + (i + (r() - 0.5) * 0.3) * 2 * PI / n, cl = Math.cos(lo), y0 = y + (r() - 0.5) * 0.2, P0 = SP(y0, lo), yy = P0[1]; if (yy > 108) continue;
        const q = clamp((106 - yy) / 36, 0, 1), rw = norm(sub(SP(y0, lo + 0.04), P0)), dn = sub(SP(y0 - 1, lo), P0), dr = dn[0] * rw[0] + dn[1] * rw[1] + dn[2] * rw[2], t = norm([dn[0] - dr * rw[0], dn[1] - dr * rw[1], dn[2] - dr * rw[2]]);
        let nn = norm(cross(rw, t)); if (nn[0] * P0[0] + nn[2] * (P0[2] - 8) < 0) nn = [-nn[0], -nn[1], -nn[2]];
        const edge = lerp(0.55, -0.15, sstep(0.42, 0.95, q)) + 0.06 * noise(yy * 0.9, 5);                       // the blue of the breast rises in a wedge toward the cheek
        const nm = cl > edge ? 'body' : r() > (q - 0.6) * 2.6 ? (q < 0.8 ? 'hbar' : 'bar') : 'scallop';
        add(BONE.neck, {p: P0, n: nn, t}, nm === 'scallop' ? w * 1.05 : w, nm === 'scallop' ? l * 1.25 : l, nm, {lift: nm === 'hbar' ? 0.03 : 0.08, fl: nm === 'hbar' ? 0.45 : 0.8, thin: nm === 'hbar' ? 1 : 0, anchor: nm === 'hbar' ? 0.36 : 0.22, bias: nm === 'body' ? -1 : 0, sk: sstep(70, 102, yy)});
        if (nm === 'hbar' && i % 2 === 0) add(BONE.neck, {p: [P0[0] - nn[0] * 1.3, P0[1] - nn[1] * 1.3, P0[2] - nn[2] * 1.3], n: nn, t}, 8, 8, 'faceU', {kind: 1, anchor: 0.5, lift: 0, fl: 0.7, bias: -2.5, sk: sstep(70, 102, yy)});   // a pale underlayer, so the stretched neck never shows through
      }
      y -= l * 0.42;
    }
    // head: rings of small feathers spreading back from the beak, so the barring falls into lines the way it does on a real bird
    let ring = 0; const CK = 1 + 0.4 * CAP;
    for (let th = 9 * RAD; th < 174 * RAD; ring++) {
      const l0 = th < 0.5 ? 3.9 : 4.4, n = Math.max(6, Math.round(2 * PI * Math.sin(th) * 17.2 / (l0 * 0.5))), o0 = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const ps = o0 + (i + (r() - 0.5) * 0.35) * 2 * PI / n, cp = Math.cos(ps), tj = th + (r() - 0.5) * 0.008 + 0.03 * noise(ps * 4.3 + ring * 1.7, ring * 0.37) * sstep(0.9, 1.15, th), deg = tj / RAD;
        const lim = barLim(cp, ps);
        const f = headFrame(tj, ps, 0); if (f.p[1] < -18.5 && f.p[2] < 3) continue;              // buried in the neck
        if (Math.abs(f.p[0]) < 4.4 && f.p[1] > -10.6 && f.p[1] < -0.5 && f.p[2] > 8) continue;      // the beak's own ground: no feathers across it or in the mouth
        let mat = 'face', l = l0, w = l0 * 0.86;
        if (deg > lim) { if (cp < -0.8) { mat = 'face'; l = 6; w = 5; } else mat = 'bar'; }
        const ap = Math.abs(((ps % (2 * PI)) + 3 * PI) % (2 * PI) - PI) / RAD;                 // 0 = up ... 180 = down
        const cd = Math.hypot((deg - 62) / (9 * CK), (ap - 124) * Math.sin(tj) / (13 * CK));
        if (cd < 1 && deg < lim + 4) { mat = 'cheek'; l = 5.2; w = 4; }
        if (mat === 'bar') continue;                                 // the barred feathers are laid in their own rows below
        const hd0 = headDir(tj, ps), cw = CAP * capW(hd0), top = sstep(0.15, 0.5, hd0[1]); add(1, f, w * (1 + 0.6 * cw), l * (1 + 0.45 * cw), mat, {lift: (mat === 'body' ? 0.12 : 0.07) - 0.035 * top, fl: lerp(0.75, 0.36, top), th: mat === 'face' && cp < -0.5 && deg > 45 ? 1 : 0, ao: cp < -0.75 && deg > 64 ? 0.92 : 1});
      }
      th += l0 * 0.43 / 17.2;
    }
    // the barring: rows of feathers ringing a line that runs from the forehead back and down through the neck, so the bars cross the crown
    // and sweep diagonally down and back over the side of the head, as on a real budgie, and flatten out toward the nape
    const TILT = lerp(9, 32, sstep(0.05, 0.45, clamp(spec.barStart, 0, 1))) * RAD, P2 = [0, Math.sin(TILT), Math.cos(TILT)], U2 = [0, Math.cos(TILT), -Math.sin(TILT)];
    const tilted = (t2, s2) => { const ct = Math.cos(t2), st = Math.sin(t2), d = [st * Math.sin(s2), P2[1] * ct + st * Math.cos(s2) * U2[1], P2[2] * ct + st * Math.cos(s2) * U2[2]]; return [Math.acos(clamp(-0.12 * d[1] + 0.9928 * d[2], -1, 1)), Math.atan2(d[0], 0.9928 * d[1] + 0.12 * d[2])]; };
    for (let t2 = 4 * RAD, row = 0; t2 < 177 * RAD; row++) {
      const l0 = 3.7, n = Math.max(6, Math.round(2 * PI * Math.sin(t2) * 17.2 / (l0 * 0.5))), o0 = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const s2 = o0 + (i + (r() - 0.5) * 0.2) * 2 * PI / n, tj = t2 + (r() - 0.5) * 0.004 + 0.022 * noise(s2 * 3.1 + row * 1.7, row * 0.37), [th, ps] = tilted(tj, s2), deg = th / RAD, cp = Math.cos(ps);
        const lim = barLim(cp, ps);
        if (deg <= lim || cp < -0.8) continue;
        const ap = Math.abs(((ps % (2 * PI)) + 3 * PI) % (2 * PI) - PI) / RAD; if (Math.hypot((deg - 62) / (9 * CK), (ap - 124) * Math.sin(th) / (13 * CK)) < 1 && deg < lim + 4) continue;
        const f = headFrame(th, ps, 0); if (f.p[1] < -18.5 && f.p[2] < 3) continue;
        if (f.p[2] < 3 && r() < 0.5 * sstep(-13, -18.5, f.p[1])) continue;      // the hood thins out into the neck feathers rather than ending at an edge
        const a = tilted(tj - 0.03, s2), b = tilted(tj + 0.03, s2), d = sub(headPt(b[0], b[1], 0), headPt(a[0], a[1], 0)), dn = d[0] * f.n[0] + d[1] * f.n[1] + d[2] * f.n[2];
        f.t = norm([d[0] - dn * f.n[0], d[1] - dn * f.n[1], d[2] - dn * f.n[2]]);
        if (f.p[1] < 6.4 && Math.abs(f.p[0]) < 7 && f.p[2] > 8) continue;                         // nothing across the cere
        const cw = CAP * capW(headDir(th, ps)); add(1, f, l0 * 1.6 * (1 + 0.35 * cw), l0 * 0.95 * (1 + 0.5 * cw), r() < 0.03 ? 'face' : 'hbar', {lift: 0.03, fl: 0.45, thin: 1, anchor: 0.36});
      }
      t2 += l0 * 0.43 / 17.2;
    }
    for (let th = 14 * RAD; th < 176 * RAD; th += 0.2) for (let i = 0, n = Math.max(5, Math.round(2 * PI * Math.sin(th) * 17 / 3.6)); i < n; i++) {
      const ps = (i + 0.5 * (Math.round(th * 5) % 2)) * 2 * PI / n, cp = Math.cos(ps), f = headFrame(th, ps, -1.3);
      if (f.p[1] < -18.5 && f.p[2] < 3) continue;
      add(1, f, 8, 8, 'faceU', {kind: 1, anchor: 0.5, lift: 0, fl: 0.7, bias: -2.5});
    }
    for (const sgn of [1, -1]) for (const [dp, dth] of [[12, 56], [35, 58], [56, 62]]) {       // the six throat spots
      const f = headFrame(dth * RAD, PI + sgn * dp * RAD, 1.2); add(1, f, 5.6 * (1 + 0.5 * CAP), 6 * (1 + 0.5 * CAP), 'spot', {kind: 1, anchor: 0.5, lift: 0, fl: 0.6, bias: 1.2, a: clamp(spec.markAmt * 4, 0, 1), th: 1});
    }
    for (const sgn of [1, -1]) { const e = headFrame(57 * RAD, sgn * 72 * RAD, 0.2); add(1, e, 1, 1, 'spot', {kind: 2, bias: 2.5, lift: 0, fl: 0.4, side: sgn}); }
    add(1, {p: [0, -5, 16.5], n: [0, 0, 1], t: [0, -1, 0]}, 1, 1, 'spot', {kind: 3, bias: 7, lift: 0, fl: 0, two: 1});     // the beak, drawn as one smooth piece
    // the back of the head is skin, not a shell: feathers low on the nape follow the head only part-way, so the neck bends and stretches
    for (const f of list) if (f.bone === 1 && (f.kind === 0 || f.m === MATS.faceU)) {
      const pale = f.m === MATS.face || f.m === MATS.faceU || f.m === MATS.cheek, w = lerp(1, sstep(74, 102, f.y * HS + HC[1]), pale ? sstep(-3, -10, f.z) : sstep(3, -7, f.z));   // the face itself stays in one piece
      if (w < 0.995) { f.x = f.x * HS + HC[0]; f.y = f.y * HS + HC[1]; f.z = f.z * HS + HC[2]; f.w *= HS; f.l *= HS; f.sk = w; f.skh = 1; }
    }
    for (const f of list) if (f.bone === 1 || f.skh) f.hd = 1;
    for (const f of list) if (f.bone === 1 && !f.skh && !f.kind) f.fh = sstep(2, 8, f.y) * sstep(-3, 6, f.z) * (1 - sstep(7, 13, Math.abs(f.x)));   // the forehead and front of the crown
    for (const f of list) if ((f.bone === 1 || f.bone === 2) && !f.skh) { f.x *= HS; f.y *= HS; f.z *= HS; f.w *= HS; f.l *= HS; }
    S = list; NS = S.length; order = new Uint16Array(NS); depth = new Float32Array(NS); scr = new Float32Array(NS * 8); lens = new Float32Array(NS); wids = new Float32Array(NS);
  }

  // ----- pose: a set of springs, so every change of mind turns into a smooth movement -----
  const ch = {};
  const sp = (n, w, z, x) => { ch[n] = {x: x || 0, v: 0, t: x || 0, w, z}; };
  sp('perch', 9, 0.9); sp('byaw', 4.2, 0.95, -18); sp('bpitch', 6.5, 0.85); sp('broll', 7, 0.85); sp('by', 9.5, 0.8);
  sp('hyaw', 21, 0.88); sp('hpitch', 20, 0.88); sp('hroll', 17, 0.85); sp('hx', 15, 0.75); sp('hy', 15, 0.7); sp('hz', 14, 0.8);
  sp('jaw', 42, 1); sp('lid', 55, 1, 1); sp('fluff', 3.2, 1, 1); sp('ruffle', 9, 1); sp('throat', 30, 0.9);
  sp('tpitch', 10, 0.42); sp('tyaw', 10, 0.4); sp('tfan', 8, 0.8); sp('wingR', 6.5, 0.85); sp('wingL', 6.5, 0.85); sp('spR', 5.2, 0.88); sp('spL', 5.2, 0.88); sp('dim', 1.4, 1, 1); sp('angle', 5, 1); sp('bx', 8, 0.85); sp('crest', 4.5, 1); sp('fore', 7, 0.8);
  let held = false, T = 0, asleep = true, getEnv = () => 0, lively = 1, branchAngle = 0;
  const TOUCH_YAW = 85, TOUCH_PITCH = 40;
  const gaze = {yaw: 0, pitch: 0, roll: 0, ext: 0};
  const post = {byaw: 0, bpitch: 0, broll: 0, by: 0, hy: 0}; let nextPost = 3, nextMicro = 2.5, freezeUntil = 0, micro = null, bphase = 0, gq = [], calm = 1; let baseYaw = -18, nextLook = 0, looks = 0, stillUntil = 0, sleekUntil = 0, nextBlink = 2, blinkUntil = 0, nextIdle = 4, fluffHold = 0, fluffHoldUntil = 0, act = null, queue = [], sleepSide = 1, breath = 0, lastAct = '';
  const feet = [{u: -11, from: 0, to: 0, p: 1, lift: 0, flex: 1, grip: 1, tk: 0, tkT: 0}, {u: 11, from: 0, to: 0, p: 1, lift: 0, flex: 1, grip: 1, tk: 0, tkT: 0}];
  const FAST = {byaw: 0, broll: 0, hyaw: 0, hroll: 0, tyaw: 0, bx: 0};   // quick shakes and wags, added straight onto the pose (the springs would swallow anything this fast)
  let foreUntil = 0;
  let tlag = 0, tailBend = 0, mood = 'relaxed', moodUntil = 8, moodAt = 0, sleptAt = 0, heard = 0, heardAt = -99, tuckSide = 0;
  let roam = 34;                                                // how far along the branch the bird may wander

  // Moods: what the bird feels like doing. Each one sets how it carries itself and which movements are likely next,
  // so behaviour comes in runs (a spell of grooming, a nosy spell, a drowsy spell) instead of unrelated clips.
  const MOODS = {
    relaxed: {fl: 0.1, ext: -0.5, look: 0.8, idle: 0.8, micro: 1, crest: 0.25, dur: [12, 28], acts: {preen: 3, shuffle: 1.5, tailwag: 1.4, shake: 1.1, stretch: 1, spread: 0.7, yawn: 0.7, peer: 1, turn: 1, bob: 0.3, grind: 0.8}, next: {relaxed: 1.5, curious: 2, grooming: 3, sleepy: 1.7, playful: 1.2}},
    alert: {fl: -0.25, ext: 2.6, look: 1.6, idle: 0.3, micro: 0.4, oneEye: 0.5, dur: [3, 7], acts: {peer: 3, turn: 1.2, shuffle: 1}, next: {curious: 3, relaxed: 2, social: 1.5}},
    curious: {fl: -0.08, ext: 1.4, look: 1.4, idle: 1, micro: 1, oneEye: 0.55, dur: [8, 18], acts: {peer: 4, shuffle: 2.5, turn: 2, bob: 1, tailwag: 1, preen: 0.5}, next: {relaxed: 3, playful: 2, social: 1}},
    social: {fl: 0.12, ext: 1, look: 1.2, idle: 1.2, micro: 1, oneEye: 0.5, crest: 1, dur: [9, 20], acts: {bob: 4, peer: 2, shuffle: 2, tailwag: 1.5, turn: 1, preen: 0.6, grind: 0.6}, next: {relaxed: 2.5, playful: 2, curious: 1}},
    playful: {fl: 0, ext: 0.8, look: 1.5, idle: 1.7, micro: 1.3, dur: [8, 16], acts: {bob: 3, shuffle: 4, turn: 2.5, tailwag: 2, stretch: 1, peer: 1.5, spread: 0.6, shake: 0.8}, next: {relaxed: 3, curious: 1.5, grooming: 1}},
    grooming: {fl: 0.28, ext: -0.5, look: 0.5, idle: 1.6, micro: 0.7, crest: 0.4, dur: [10, 22], acts: {preen: 8, shake: 1.5, tailwag: 1.2, stretch: 1, spread: 1}, next: {relaxed: 4, sleepy: 1}},
    sleepy: {fl: 0.5, ext: -2, look: 0.3, idle: 0.4, micro: 0.5, lid: 0.42, crest: 0.7, dur: [10, 24], acts: {yawn: 2.5, grind: 3, preen: 1, stretch: 1, shake: 0.5}, next: {relaxed: 3, grooming: 1}}
  };
  const LIVELY_MOODS = {curious: 1, playful: 1, social: 1};
  function pickW(tab, skip, bias) { let tot = 0; const w = k => tab[k] * (bias ? bias(k) : 1); for (const k in tab) if (k !== skip) tot += w(k); let x = rnd() * tot; for (const k in tab) if (k !== skip && (x -= w(k)) <= 0) return k; for (const k in tab) return k; }
  function setMood(m, d) { if (m !== mood) { moodAt = T; tuckSide = rnd() < 0.5 ? 0 : 1; } mood = m; const M = MOODS[m]; moodUntil = T + (d || rr(M.dur[0], M.dur[1])); }
  // Where the head points. A budgie looks in quick darts with the head held dead still between them, and it studies
  // anything interesting with one eye, so many looks turn the head side-on to the viewer instead of facing it.
  const NOLOOK = {preen: 1, shake: 1, tailwag: 1, yawn: 1, grind: 1, stretch: 1, spread: 1};      // moves the bird gives its whole attention to
  function look(big) {
    const prev = {yaw: gaze.yaw, pitch: gaze.pitch, roll: gaze.roll}, wide = big || rnd() < 0.18 * lively, r = rnd(); gq.length = 0;
    if (!big && r < (MOODS[mood].oneEye || 0.3)) { const sd = rnd() < 0.5 ? -1 : 1; gaze.yaw = sd * rr(44, 70); gaze.pitch = rr(-9, 8); gaze.roll = sd * rr(3, 20) * (rnd() < 0.75 ? 1 : -1); }
    else {
      gaze.yaw = clamp((rnd() < 0.3 ? 0 : baseYaw * 0.5) + rr(-1, 1) * (wide ? 66 : 30), -76, 76);
      gaze.pitch = rr(-14, 16) + (rnd() < 0.12 ? rr(14, 28) : 0); gaze.roll = rnd() < 0.35 ? rr(-22, 22) : rr(-6, 6);
    }
    gaze.ext = rr(-1.4, 2.2) + (wide ? 1.2 : 0) - 0.05 * gaze.pitch;
    if (Math.abs(gaze.yaw - baseYaw) > 50) baseYaw = clamp(lerp(baseYaw, gaze.yaw, 0.4), -38, 38);
    looks = looks > 0 ? looks - 1 : (rnd() < 0.28 ? 1 + Math.floor(rnd() * 2) : 0);     // birds often look in quick twos and threes
    nextLook = T + (looks > 0 ? rr(0.22, 0.5) : (rnd() < 0.16 ? rr(3, 6) : rr(0.6, 2.6)) / (lively * MOODS[mood].look));
    const now = {yaw: gaze.yaw, pitch: gaze.pitch, roll: gaze.roll};
    if (!looks && rnd() < 0.1 && Math.abs(now.yaw - prev.yaw) > 25) { gq.push({t: T + rr(0.3, 0.45), set: prev}, {t: T + rr(0.75, 0.95), set: now}); nextLook = Math.max(nextLook, T + 1.6); }   // a double take
    else if (rnd() < 0.34) gq.push({t: T + rr(0.16, 0.36), d: [rr(-7, 7), rr(-5, 5), rr(-9, 9)]});                 // a small correction just after landing
  }
  function posture() { const L = lively; post.byaw = rr(-3.5, 3.5) * L; post.bpitch = rr(-1.8, 2.2); post.broll = rr(-1.6, 1.6); post.by = rr(-0.8, 0.5); nextPost = T + rr(3, 9) / L; }
  // The small things a resting bird never quite stops doing, picked one at a time at irregular moments.
  const MICRO = [['fore', 1.6], ['toe', 2.2], ['beak', 2], ['tail', 2], ['tilt', 2], ['post', 1.6], ['still', 1.6], ['settle', 1.4], ['neck', 1.2], ['fan', 0.9], ['wing', 0.8], ['slowblink', 0.8]];
  function doMicro() {
    let tot = 0; for (const m of MICRO) tot += m[1]; let x = rnd() * tot, k = 'toe'; for (const m of MICRO) if ((x -= m[1]) <= 0) { k = m[0]; break; }
    const c = ch, sd = rnd() < 0.5 ? -1 : 1;
    if (k === 'toe') { const f = feet[rnd() < 0.5 ? 0 : 1]; if (f.p >= 1) f.flex = 0; }
    else if (k === 'beak') micro = {k, t0: T, dur: rr(0.5, 1.5), hz: rr(5, 8)};
    else if (k === 'fan') micro = {k, t0: T, dur: rr(0.7, 1.3)};
    else if (k === 'tail') c.tyaw.v += sd * rr(60, 150);
    else if (k === 'tilt') { gaze.roll = sd * rr(14, 28); gaze.ext += 0.8; nextLook = Math.max(nextLook, T + rr(0.7, 1.6)); }
    else if (k === 'post') posture();
    else if (k === 'still') { freezeUntil = T + rr(2, 5); nextLook = Math.max(nextLook, T + rr(1.2, 3)); }
    else if (k === 'settle') { fluffHold = 0.2; fluffHoldUntil = T + rr(1.5, 3.2); c.ruffle.v += 2.2; c.tpitch.v += 20; }
    else if (k === 'neck') post.hy = rr(-2.4, 2.2);
    else if (k === 'wing') { c.wingR.v += rr(0.8, 1.4); c.wingL.v += rr(0.8, 1.4); c.by.v += 5; }
    else if (k === 'slowblink') blinkUntil = T + rr(0.35, 0.8);
    else if (k === 'fore') foreUntil = T + rr(1.5, 4);
  }
  const envl = (p, a, b) => Math.min(sstep(0, a, p), 1 - sstep(1 - b, 1, p));
  const bump = (x, a, b) => x <= a || x >= b ? 0 : Math.sin(PI * (x - a) / (b - a));
  // Where the beak goes for each place a budgie grooms (s is the side it reaches round to).
  const PREEN = {
    chest: {yaw: 18, pitch: 62, roll: 6, hy: -7, hx: 0, byaw: 0, wing: 0, tyaw: 0, bp: 2},
    belly: {yaw: 26, pitch: 74, roll: 10, hy: -9.5, hx: 1, byaw: 0, wing: 0, tyaw: 0, bp: 5},
    shoulder: {yaw: 96, pitch: 40, roll: -10, hy: -3.5, hx: 2, byaw: -5, wing: 0.06, tyaw: 0, bp: 0},
    wing: {yaw: 120, pitch: 32, roll: -16, hy: -4, hx: 3, byaw: -9, wing: 0.16, tyaw: 6, bp: 0},
    back: {yaw: 132, pitch: 10, roll: -20, hy: -1.5, hx: 2, byaw: -13, wing: 0, tyaw: 8, bp: -3},
    tail: {yaw: 128, pitch: 50, roll: -18, hy: -8, hx: 4, byaw: -22, wing: 0.1, tyaw: 34, bp: 6}
  };
  const ACTS = {
    // sidestepping: the feet do the walking (see the foot code); the head looks where it is going first
    shuffle: {make() { const dir = ch.perch.t > roam * 0.5 ? -1 : ch.perch.t < -roam * 0.5 ? 1 : (rnd() < 0.5 ? -1 : 1), steps = 1 + Math.floor(rnd() * 5), per = rr(0.4, 0.54), lens = []; let tot = 0; for (let i = 0; i < steps; i++) { const l = rr(4.6, 7.6) * (i === steps - 1 ? 0.7 : 1); lens.push(l); tot += l; } return {dur: 0.3 + steps * per, lead: 0.3 / (0.3 + steps * per), steps, dir, from: ch.perch.t, lens, pause: steps > 2 && rnd() < 0.35 ? 1 + Math.floor(rnd() * (steps - 2)) : -1}; },
      run(a, p, o) { const q = clamp((p - a.lead) / (1 - a.lead), 0, 1) * a.steps, i = Math.min(a.steps - 1, Math.floor(q)), f = q - i; let d = 0; for (let k = 0; k < i; k++) d += a.lens[k]; d += a.lens[i] * ease(clamp(f * 1.25, 0, 1));
        o.perch = clamp(a.from + a.dir * d, -roam, roam); o.hyawW = a.dir * 30; o.sleek += 0.12; } },
    // head bobbing: a run of bobs that speeds up and dies away, each one a slightly different size, the head tracing a loop up-and-forward
    bob: {make(e) { const en = clamp(e || rr(0.4, 0.9), 0.3, 1.3), n = 3 + Math.round(rr(1, 4) * en), bobs = []; let t = 0; for (let i = 0; i < n; i++) { const d = rr(0.2, 0.3) * (1 - 0.25 * Math.sin(PI * i / n)); bobs.push({t, d, a: (0.55 + 0.45 * Math.sin(PI * (i + 0.6) / n)) * rr(0.75, 1.15)}); t += d; } return {dur: t + 0.12, bobs, e: en, i: 0}; },
      run(a, p, o) { const t = p * a.dur; while (a.i < a.bobs.length - 1 && t > a.bobs[a.i].t + a.bobs[a.i].d) a.i++; const b = a.bobs[a.i], ph = clamp((t - b.t) / b.d, 0, 1), w = Math.sin(2 * PI * ph) * b.a, c2 = (Math.cos(2 * PI * ph) - 1) * -0.5 * b.a, E = a.e;
        o.hy += w * (4 + 5.5 * E); o.hz += c2 * (1.6 + 2 * E); o.hpitch += w * (7 + 7 * E); o.bpitch += w * 3.2 * E; o.by += Math.min(0, w) * 1.6 * E; o.tpitch -= w * 7 * E; o.sleek += 0.3; o.crest = 1; o.fore = 1; } },
    // yawn: a breath in, the neck stretches up, the beak opens wide and holds with the eyes squeezed, then shuts and the bird swallows
    yawn: {make() { const hold = rr(0.45, 1); return {dur: 1.75 + hold, hold, twist: rr(-9, 9)}; },
      run(a, p, o) { const t = p * a.dur, k = sstep(0.3, 0.95, t) * (1 - sstep(0.95 + a.hold, 1.4 + a.hold, t)), ant = bump(t, 0, 0.42), tr = Math.sin(t * 38) * 0.03 * k;
        o.jaw = (3.5 + tr) * k + 0.2 * bump(t, a.dur - 0.33, a.dur - 0.08); o.hpitch -= 24 * k + 3 * ant; o.hroll += a.twist * k; o.hy += 5 * k + 1.2 * ant; o.hz += 2 * k; o.by += 1 * k; o.bpitch -= 3 * k; o.lid = sstep(0.35, 0.75, k); o.fluffAdd += 0.22 * k; o.throat = 0.5 * k; o.by += 0.8 * ant; } },
    // the one-sided stretch: weight goes onto the other foot, the wing opens from the shoulder outward with the tail fanned toward it and the leg on that side drawn up, a held tremble, then it folds from the tip in
    spread: {make() { const hold = rr(0.5, 1.3); return {dur: 2.5 + hold, hold, side: rnd() < 0.5 ? -1 : 1, amp: rr(0.86, 1)}; },
      run(a, p, o) { const t = p * a.dur, s = a.side, k = ease(sstep(0.3, 1.25, t)) * (1 - ease(sstep(1.25 + a.hold, a.dur - 0.1, t))), ant = bump(t, 0, 0.45), tr = bump(t, 1.1, 1.4 + a.hold) * Math.sin(t * 31) * 0.035;
        o[s > 0 ? 'spR' : 'spL'] = k * a.amp + tr; o.bx -= s * (2.6 * k - 1 * ant); o.broll += s * (1.8 * k - 1.2 * ant); o.byaw = lerp(o.byaw, s * 12, k); o.by += 1.2 * k - 1 * ant; o.tfan = k; o.tyaw -= s * 30 * k; o.hpitch += 4 * k; o.hy += 1.5 * k; o.hyawW = s * 30; o.lidAdd = Math.max(o.lidAdd, 0.35 * k); o.leg = s > 0 ? 1 : 0; o.legK = sstep(0.25, 0.8, k); } },
    // the tall stretch: a small crouch first, then up on the toes with the neck long, one shoulder lifted and the tail swung out, held, and eased back down
    stretch: {make() { const h1 = rr(0.35, 0.8), h2 = rr(0.6, 1.2); return {dur: 4.1 + h1 + h2, h1, h2, amp: rr(0.9, 1.1), lean: rr(-1, 1)}; },
      run(a, p, o) { const t = p * a.dur, e1 = 1.1 + a.h1, k1 = ease(sstep(0.35, 1.1, t)) * (1 - ease(sstep(e1, e1 + 0.7, t))) * a.amp, s2 = e1 + 0.35, e2 = s2 + 0.8 + a.h2, k2 = ease(sstep(s2, s2 + 0.8, t)) * (1 - ease(sstep(e2, a.dur - 0.05, t))) * a.amp, ant = bump(t, 0, 0.5), tr = bump(t, s2 + 0.7, e2 + 0.2) * Math.sin(t * 29);
        // first up on the toes with the neck long, then a deep forward bow with both wings lifted off the back and the tail fanned
        o.by += 5 * k1 - 1.8 * ant - 1.8 * k2; o.hy += 6 * k1 - 1.5 * ant - 1.5 * k2; o.hpitch -= 11 * k1 - 4 * ant + 9 * k2; o.bpitch += -6 * k1 + 3 * ant + 17 * k2; o.broll += a.lean * 4 * k1; o.sleek += 0.35 * k1 + 0.2 * k2; o.tyaw += a.lean * 10 * k1;
        o.wingR = o.wingL = 0.55 * k2 + 0.012 * tr; o.hz += 4 * k2; o.tpitch -= 12 * k2; o.tfan = Math.max(0.5 * k1, 0.85 * k2); o.lidAdd = Math.max(o.lidAdd, 0.4 * Math.max(k1, k2)); } },
    // the ruffle: every feather stands up first, then a fast whole-body shake that the head and tail trail behind, then a slow settle
    shake: {make() { return {dur: rr(2.2, 2.8), hz: rr(7.5, 9.5), amp: rr(0.8, 1.15), len: rr(0.55, 0.95)}; },
      run(a, p, o) { const t = p * a.dur, e = sstep(0, 0.6, t) * (1 - sstep(0.85 + a.len, a.dur, t)), sh = sstep(0.62, 0.85, t) * (1 - sstep(0.65 + a.len, 1 + a.len, t)) * a.amp, w = t * 2 * PI * a.hz, os = Math.sin(w) * sh;
        o.fluffAdd += e * 0.9; o.crest = 1; FAST.broll = 1.5 * os; FAST.byaw = 1.3 * Math.cos(w) * sh; FAST.hroll = -3 * Math.sin(w - 0.9) * sh; FAST.hyaw = 2.4 * Math.sin(w - 1.6) * sh; FAST.tyaw = 14 * Math.sin(w - 2.3) * sh; o.ruffle = Math.max(sh, e * 0.3); o.lid = sh > 0.3 ? 0.8 : 0; o.tfan = sh * 0.5; o.wingR = o.wingL = sh * 0.1 + 0.03 * e; o.by += 1.2 * e - 0.8 * sh; o.hy -= 1.5 * e; },
      end() { fluffHold = 0.4; fluffHoldUntil = T + rr(3, 7); if (rnd() < 0.75) queue.push(['tailwag']); } },
    // tail wag: driven from the rump, the hips rocking the other way and the long feathers trailing behind the base
    tailwag: {make() { return {dur: rr(1.1, 1.9), hz: rr(3.8, 4.8), amp: rr(0.8, 1.15)}; },
      run(a, p, o) { const e = envl(p, 0.12, 0.3), w = Math.sin(p * a.dur * 2 * PI * a.hz) * e * a.amp; FAST.tyaw = 40 * w; FAST.byaw = -3.2 * w; FAST.hyaw = 3.2 * w; FAST.broll = 0.9 * w; FAST.hroll = -0.9 * w; FAST.bx = -0.35 * w; o.tfan = Math.max(o.tfan || 0, 0.6 * e); o.tpitch += 8 * e; } },
    // preening: a run of one to three places, the beak working each with bursts of nibbling and slow pulls along a feather, sometimes stopping to look up between them
    preen: {make() { const side = rnd() < 0.5 ? -1 : 1, n = 1 + Math.floor(rnd() * 3), segs = []; let t = 0.25, last = '';
        for (let i = 0; i < n; i++) { let k; do k = pickW({chest: 2.2, belly: 1, shoulder: 2, wing: 2.4, back: 1.4, tail: 1.3}); while (k === last); last = k; const d = rr(1.3, 2.7); segs.push({k, t, d, s: rnd() < 0.7 ? side : -side, pull: rnd() < 0.55, hz: rr(5, 8), on: rr(0.45, 0.9), off: rr(0.15, 0.4)}); t += d; if (i < n - 1 && rnd() < 0.35) t += rr(0.5, 1); else t += 0.12; }
        return {dur: t + 0.2, segs, i: 0}; },
      run(a, p, o) { const t = p * a.dur; while (a.i < a.segs.length - 1 && t >= a.segs[a.i + 1].t - 0.1) a.i++; const g = a.segs[a.i], u = t - g.t, on = u >= 0 && u < g.d, e = on ? Math.min(sstep(0, 0.3, u), 1 - sstep(g.d - 0.25, g.d, u)) : 0, P = PREEN[g.k], s = g.s;
        const cyc = (u % (g.on + g.off)) / (g.on + g.off), burst = on && cyc < g.on / (g.on + g.off) ? Math.sin(PI * cyc * (g.on + g.off) / g.on) : 0, nb = Math.sin(u * 2 * PI * g.hz) * burst, pu = g.pull ? (u % 0.85) / 0.85 : 0, pull = g.pull ? (pu < 0.8 ? ease(pu / 0.8) : 1 - (pu - 0.8) / 0.2) * (1 - burst) : 0;
        o.hold = sstep(0, 0.6, e) ; o.hyawL = s * P.yaw + 3 * nb; o.hpitchL = P.pitch + 4.5 * nb - 9 * pull; o.hrollL = s * P.roll + 5 * pull; o.hy += (P.hy + 1.6 * pull) * e; o.hx += s * P.hx * e; o.hz += 1.2 * pull * e; o.byaw += s * P.byaw * e; o.bpitch += P.bp * e; o.tyaw += s * P.tyaw * e; if (P.tyaw > 20) o.tfan = 0.45 * e;
        if (P.wing) o[s > 0 ? 'wingR' : 'wingL'] = P.wing * e; o.jaw = (0.24 * (0.5 + 0.5 * nb) * burst + 0.06 * (pull > 0.05 ? 1 : 0)) * e; o.lidAdd = Math.max(o.lidAdd, 0.4 * e); o.fluffAdd += 0.3 * sstep(0, 0.4, t) * (1 - sstep(a.dur - 0.4, a.dur, t)); o.crest = Math.max(o.crest, 0.5); } },
    // peering: the neck reaches toward the viewer and the head turns side-on to study it with one eye, holds dead still, and often swaps to the other eye
    peer: {make() { const swap = rnd() < 0.5; return {dur: rr(1.9, 2.6) + (swap ? 1 : 0), side: rnd() < 0.5 ? -1 : 1, swap, ang: rr(46, 64), tilt: rr(8, 24), reach: rr(0.8, 1.15)}; },
      run(a, p, o) { const t = p * a.dur, e = envl(p, 0.16, 0.22), sd = a.swap && t > a.dur * 0.5 ? -a.side : a.side; o.bpitch += 11 * e * a.reach; o.hz += 5.5 * e * a.reach; o.hy += 1.5 * e; o.hold = e; o.hyawL = -ch.byaw.x + sd * a.ang; o.hpitchL = -3; o.hrollL = sd * a.tilt; o.sleek += 0.4 * e; o.by += 1.5 * e; o.tpitch += 5 * e; o.still = 1; } },
    turn: {make() { const to = (baseYaw > 0 ? -1 : 1) * rr(14, 40); gq.length = 0; gaze.yaw = to * 1.5; gaze.pitch = rr(-6, 6); gaze.roll = rr(-8, 8); nextLook = Math.max(nextLook, T + 1.1); return {dur: 1.05, to}; },     // the head goes first, then the feet and body come round under it
      run(a, p, o) { if (p > 0.3 && !a.done) { a.done = true; baseYaw = a.to; } o.by += 2.2 * Math.sin(PI * sstep(0.3, 1, p)); } },
    puff: {make() { return {dur: rr(2.4, 3.6)}; }, run(a, p, o) { const e = envl(p, 0.14, 0.3); o.fore = e > 0.3 ? 1 : 0; o.crest = Math.max(o.crest, e); o.hpitch += 3 * e; o.hy += 0.8 * e; } },   // the forehead feathers lifted in a little crest, as a chatty or pleased budgie does
    // beak grinding: the contented, drowsy sound-and-motion of a settled budgie; eyes half shut, feathers loose, the lower beak working in tiny strokes
    grind: {make() { return {dur: rr(2.6, 5.2), hz: rr(5, 6.5)}; },
      run(a, p, o) { const e = envl(p, 0.15, 0.2), t = p * a.dur, g = 0.5 + 0.5 * Math.sin(t * 2 * PI * a.hz); o.jaw = (0.07 + 0.07 * g) * e; o.hx += 0.25 * Math.sin(t * 2 * PI * a.hz + 1) * e; o.lidAdd = Math.max(o.lidAdd, 0.6 * e); o.fluffAdd += 0.25 * e; o.crest = 1; o.fore = e; o.hy -= 1 * e; o.throat = 0.25 * g * e; } }
  };
  function start(name, arg) { const A = ACTS[name]; if (!A) return; if (act && ACTS[act.name].end) ACTS[act.name].end(); act = Object.assign({name, t0: T}, A.make(arg)); lastAct = name; }
  function update(dt) {
    T += dt;
    const env = Math.min(1, getEnv() * 1.3), speaking = env > 0.06, L = lively, c = ch;
    if (!asleep && !held && !act && T > moodUntil) setMood(pickW(MOODS[mood].next, null, k => LIVELY_MOODS[k] ? lively : k === 'sleepy' ? 1 / (lively * lively) : 1));
    const MD = MOODS[mood], idle = !asleep && !held && T > stillUntil;
    while (gq.length && T >= gq[0].t) { const q = gq.shift(); if (!idle && !q.force) continue; if (q.set) { gaze.yaw = q.set.yaw; gaze.pitch = q.set.pitch; gaze.roll = q.set.roll; } else { gaze.yaw = clamp(gaze.yaw + q.d[0], -88, 88); gaze.pitch += q.d[1]; gaze.roll += q.d[2]; } }
    if (idle && T > nextLook && !(act && NOLOOK[act.name])) look(false);
    if (idle && !act && T > nextPost && T > freezeUntil) posture();
    if (idle && !act && !speaking && T > nextMicro && T > freezeUntil) { nextMicro = T + rr(1.1, 4.2) / ((0.45 + 0.55 * L) * MD.micro); doMicro(); }
    calm += ((T < freezeUntil && !act ? 0 : 1) - calm) * Math.min(1, dt * 3);
    if (!asleep && !held && !act && queue.length) start(...queue.shift());
    if (!asleep && !held && !act && !speaking && T > nextIdle && T > stillUntil && T > freezeUntil) { start(pickW(MD.acts, lastAct)); }
    const rate = (asleep ? 5 : 8.2) * (1 + 0.22 * noise(T * 0.11, 11)); bphase += dt * rate; breath = (Math.sin(bphase) + 0.18 * Math.sin(2 * bphase + 0.6)) * (asleep ? 1.25 : 1);   // never quite regular
    // what the bird would do left alone: breathe, shift its weight, keep its head busy
    const q = calm * L;                                          // the body holds a posture and corrects it now and then, with only a trace of drift between
    const o = {perch: c.perch.t, byaw: baseYaw + post.byaw + 1.3 * noise(T * 0.31, 1) * q, bpitch: post.bpitch + 0.7 * noise(T * 0.4, 2) * q, broll: post.broll + 0.6 * noise(T * 0.27, 3) * q, by: post.by + 0.25 * breath,
      hyaw: 0.3 * noise(T * 1.5, 5) * calm, hpitch: 0.3 * noise(T * 1.2, 6) * calm - 0.4 * breath, hroll: 0.3 * noise(T * 0.8, 7) * calm, hx: 0, hy: 0.3 * breath + gaze.ext + post.hy, hz: 0, jaw: 0, lid: 0, lidAdd: 0, fluffAdd: 0, sleek: 0, ruffle: 0, throat: 0,
      tpitch: 1.6 * breath + 1.2 * noise(T * 0.6, 8) * calm, tyaw: 1.6 * noise(T * 0.45, 9) * q, tfan: 0, wingR: 0, wingL: 0, spR: 0, spL: 0, hold: 0, hyawL: 0, hpitchL: 0, hrollL: 0, hyawW: null, bx: 0, crest: MD.crest || 0, fore: T < foreUntil ? 1 : 0, leg: -1, legK: 0};
    o.hy += MD.ext * (T < stillUntil ? 0.3 : 1); o.lidAdd = MD.lid || 0; o.fluffAdd = MD.fl;
    if (micro) { const p = (T - micro.t0) / micro.dur; if (p >= 1 || act || asleep) micro = null; else { const e = envl(p, 0.25, 0.3); if (micro.k === 'beak') o.jaw = 0.15 * e * (0.5 + 0.5 * Math.sin(T * 2 * PI * micro.hz)); else { o.tfan = 0.5 * e; o.tpitch += 4 * e; } } }
    FAST.byaw = FAST.broll = FAST.hyaw = FAST.hroll = FAST.tyaw = FAST.bx = 0;
    if (act) { const p = (T - act.t0) / act.dur; if (p >= 1) { const A = ACTS[act.name], was = act; act = null; if (A.end) A.end(was); nextIdle = T + (rnd() < 0.22 ? rr(0.25, 0.9) : rr(1.8, 6) / (L * MOODS[mood].idle)); } else ACTS[act.name].run(act, p, o); }
    // the head keeps its own line of sight while the body moves under it, as a real bird's does
    let gy = gaze.yaw; if (o.hyawW != null && T > stillUntil) gy = lerp(gy, o.hyawW, 0.5);
    let hyaw = clamp(gy - c.byaw.x, -128, 128) + o.hyaw, hpitch = gaze.pitch - 0.8 * c.bpitch.x + o.hpitch, hroll = gaze.roll - 0.8 * c.broll.x + o.hroll;
    if (o.hold) { hyaw = lerp(hyaw, o.hyawL + o.hyaw, o.hold); hpitch = lerp(hpitch, o.hpitchL, o.hold); hroll = lerp(hroll, o.hrollL, o.hold); }
    let fluff = spec.fluff + o.fluffAdd + (T < fluffHoldUntil ? fluffHold : 0) - (T < sleekUntil ? 0.3 : 0) - o.sleek, lid = Math.max(o.lid, T < blinkUntil ? 1 : 0, o.lidAdd);
    if (speaking) { o.jaw = Math.max(o.jaw, env * 0.75); hpitch -= 7 * env; o.hy += 1.6 * env; o.by -= 0.8 * env; o.tpitch += 6 * env; o.throat = env; }
    // the head stays put in space while the body sways and bumps under it
    o.hx += clamp(95 * Math.sin((c.broll.x - branchAngle * 0.12) * RAD) * 0.6, -8, 8); o.hy -= clamp(0.045 * c.by.v, -2.5, 2.5);
    o.tyaw -= 1.1 * (c.broll.x - branchAngle * 0.12);             // and the tail swings out against a lean
    if (asleep) { hyaw = sleepSide * 124; hpitch = 16; hroll = -sleepSide * 6; o.hy = -5 + 0.5 * breath; o.hx = sleepSide * 2; o.by = -2.4 + 0.3 * breath; fluff = Math.max(fluff, 0.95); lid = 1; o.byaw = baseYaw; o.jaw = 0; o.tpitch = 2.2 * breath; o.tyaw = 0; }
    if (!asleep && T > nextBlink) { blinkUntil = T + 0.11; nextBlink = T + (rnd() < 0.2 ? 0.3 : rr(1.6, 5.5)); }
    // one foot drawn up into the belly feathers: for the wing-and-leg stretch, and to rest on one leg when drowsy or asleep
    const rest1 = (asleep ? T - sleptAt > 5 : mood === 'sleepy' && (!act || act.name === 'grind') && T - moodAt > 4) && !speaking;
    for (let i = 0; i < 2; i++) feet[i].tkT = Math.max(o.leg === i ? o.legK : 0, rest1 && tuckSide === i && feet[0].p >= 1 && feet[1].p >= 1 ? 1 : 0);
    let shift = 0; for (let i = 0; i < 2; i++) { const f = feet[i], sd = i ? -1 : 1; if (f.p < 1) shift += sd * (f.p < 0 ? sstep(-0.6, 0, f.p) : 1 - sstep(0.55, 1, f.p)); shift += sd * 2.4 * ease(f.tk) * (o.leg === i ? 0 : 1); }
    o.bx += 1.7 * shift; o.broll -= 1.6 * clamp(shift, -1.6, 1.6);
    const set = {perch: o.perch, bx: o.bx, crest: o.crest, fore: o.fore, byaw: o.byaw, bpitch: o.bpitch, broll: o.broll + branchAngle * 0.12, by: o.by, hyaw, hpitch, hroll, hx: o.hx, hy: o.hy, hz: o.hz, jaw: o.jaw, lid, fluff, ruffle: o.ruffle, throat: o.throat,
      tpitch: o.tpitch - 0.5 * c.bpitch.x, tyaw: o.tyaw - 0.09 * c.byaw.v - 0.25 * c.perch.v, tfan: o.tfan, wingR: o.wingR, wingL: o.wingL, spR: o.spR, spL: o.spL, dim: asleep ? 1 : 0, angle: branchAngle};
    const slow = asleep ? 0.33 : 1, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (const k in c) { const s = c[k], w = s.w * (k === 'dim' || k === 'angle' || k === 'lid' ? 1 : slow); s.t = set[k]; for (let i = 0; i < n; i++) { s.v += (w * w * (s.t - s.x) - 2 * s.z * w * s.v) * h; s.x += s.v * h; } }
    { const ty = c.tyaw.x + FAST.tyaw; tlag += (ty - tlag) * Math.min(1, dt * 14); tailBend = clamp((tlag - ty) * RAD * 1.1, -0.45, 0.45); }   // the long tail feathers trail behind the rump
    // feet: each one steps on its own when the body has moved far enough away from it
    const half = 11 * spec.size * Math.max(0.62, Math.cos(c.byaw.x * RAD));
    let worst = -1, we = 2.6; const moving = feet[0].p < 1 || feet[1].p < 1;
    for (let i = 0; i < 2; i++) {
      const f = feet[i], rest = c.perch.x + (i ? half : -half) + c.perch.v * 0.1;
      f.tk = clamp(f.tk + Math.sign(f.tkT - f.tk) * dt / 0.55, Math.min(f.tk, f.tkT), Math.max(f.tk, f.tkT)); if (f.tk > 0.02) { if (f.tk < 0.06 && f.tkT === 0) f.grip = 0; continue; }
      if (f.flex < 1) f.flex = Math.min(1, f.flex + dt / 0.5); if (f.grip < 1) f.grip = Math.min(1, f.grip + dt / 0.22);
      if (f.p < 1) {                                             // below zero the foot is still down while the weight moves off it
        const was = f.p; f.p = Math.min(1, f.p + dt / 0.15);
        if (was < 0 && f.p >= 0) { f.from = f.u; f.to = c.perch.x + (i ? half : -half) + c.perch.v * 0.16; }
        if (f.p > 0) { f.u = lerp(f.from, f.to, ease(f.p)); f.lift = Math.sin(PI * f.p); if (f.p >= 1) { f.grip = 0; f.lift = 0; c.by.v -= 5; } }
      } else { f.lift = 0; const e = Math.abs(rest - f.u) + (Math.sign(c.perch.v) === (i ? 1 : -1) ? 0.4 : 0); if (e > we) { we = e; worst = i; } }
    }
    if (worst >= 0 && !moving && feet[1 - worst].tk < 0.02) { const f = feet[worst]; f.p = -0.6; f.flex = 1; c.by.v -= 7; c.tpitch.v += 30; }
  }

  // ----- drawing -----
  let cv, g, visible = false, raf = 0, last = 0, manual = false, bgC = null, branchC = null, cw = 0, ch_ = 0, sc = 1, cx = 0, cy = 0;
  const M = [0, 1, 2, 3, 4, 5, 6].map(() => ({m: new Float64Array(9), t: new Float64Array(3)}));
  function rot(yaw, pitch, roll, out) {
    const cy_ = Math.cos(yaw * RAD), sy = Math.sin(yaw * RAD), cp = Math.cos(pitch * RAD), spn = Math.sin(pitch * RAD), cr = Math.cos(roll * RAD), sr = Math.sin(roll * RAD);
    // Ry * Rx * Rz
    out[0] = cy_ * cr + sy * spn * sr; out[1] = -cy_ * sr + sy * spn * cr; out[2] = sy * cp;
    out[3] = cp * sr; out[4] = cp * cr; out[5] = -spn;
    out[6] = -sy * cr + cy_ * spn * sr; out[7] = sy * sr + cy_ * spn * cr; out[8] = cy_ * cp;
    return out;
  }
  const mul = (a, b, o) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return o; };
  const app = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  const tmpA = new Float64Array(9), tmpB = new Float64Array(9);
  const O = [0, 0, 0];                                          // where the body's perch point is, in stage units
  const NL = 12, SK = [], BL = {m: new Float64Array(9), t: new Float64Array(3)}; for (let i = 0; i <= NL; i++) SK.push({m: new Float64Array(9), t: new Float64Array(3)});
  function child(bone, local, piv, off, q0) {                       // a part that turns about a point on its parent (the body)
    const b = M[0], q = q0 || M[bone], lp = app(local, piv), tl = [piv[0] + off[0] - lp[0], piv[1] + off[1] - lp[1], piv[2] + off[2] - lp[2]], w = app(b.m, tl), s = spec.size;
    mul(b.m, local, q.m); q.t[0] = b.t[0] + s * w[0]; q.t[1] = b.t[1] + s * w[1]; q.t[2] = b.t[2] + s * w[2];
  }
  function pose() {
    const c = ch, s = spec.size, an = c.angle.x * RAD;
    const px = c.perch.x + c.bx.x + FAST.bx; O[0] = px * Math.cos(an); O[1] = px * Math.sin(an) + (c.by.x - 6.5) * s; O[2] = 0;
    rot(c.byaw.x + FAST.byaw, c.bpitch.x, c.broll.x + FAST.broll, M[0].m); M[0].t.set(O);
    const hoff = [c.hx.x, c.hy.x, c.hz.x], hyw = c.hyaw.x + FAST.hyaw, hrl = c.hroll.x + FAST.hroll, hl = rot(hyw, c.hpitch.x, hrl, tmpA);
    // head: turns about a point low in the skull; the upper beak lifts a touch when the mouth opens
    const hp = [HC[0] + HPIV[0], HC[1] + HPIV[1], HC[2] + HPIV[2]];
    child(1, hl, hp, hoff); const hm = M[1], hcW = app(hm.m, HC); hm.t[0] += s * hcW[0]; hm.t[1] += s * hcW[1]; hm.t[2] += s * hcW[2];   // head feathers are stored relative to the head's centre
    // jaw: hangs from a hinge behind the beak
    const jl = rot(0, c.jaw.x * 13, 0, tmpB), hinge = [0, -7.4 * HS, 5 * HS], jh = app(jl, hinge), jt = [hinge[0] - jh[0], hinge[1] - jh[1], hinge[2] - jh[2]], jw = app(hm.m, jt);
    mul(hm.m, jl, M[2].m); M[2].t[0] = hm.t[0] + s * jw[0]; M[2].t[1] = hm.t[1] + s * jw[1]; M[2].t[2] = hm.t[2] + s * jw[2];
    for (let k = 0; k <= NL; k++) {                               // the neck: a run of in-between poses from the shoulders (0) to the skull (1)
      const w = k / NL, u = 1 - w;
      child(0, rot(hyw * w, c.hpitch.x * w, hrl * w, tmpB), [hp[0] * w, 84 * u + hp[1] * w, 9.5 * u + hp[2] * w], [hoff[0] * w, hoff[1] * w, hoff[2] * w], SK[k]);
    }
    child(4, rot(c.tyaw.x + FAST.tyaw, -c.tpitch.x, 0, tmpB), [0, 6, -30], [0, 0, 0]);
    child(5, rot(26 * c.wingR.x, 0, 40 * c.wingR.x, tmpB), [15, 76, 0], [0, 0, 0]);
    child(6, rot(-26 * c.wingL.x, 0, -40 * c.wingL.x, tmpB), [-15, 76, 0], [0, 0, 0]);
  }
  const LX = -0.58, LY = 0.72, LZ = 0.38;
  function project() {
    const c = ch, s = spec.size, fluff = c.fluff.x, ruf = c.ruffle.x, thr = c.throat.x, jawOpen = c.jaw.x, fanT = c.tfan.x, crest = c.crest.x, fore = c.fore.x, wR = c.wingR.x, wL = c.wingL.x, spR = c.spR.x, spL = c.spL.x;
    let n = 0;
    for (let i = 0; i < NS; i++) {
      const f = S[i]; let b = M[f.bone];
      if (f.sk >= 0) { const a = f.sk * NL, k = Math.min(NL - 1, a | 0), u = a - k, A = SK[k], B2 = SK[k + 1]; for (let j = 0; j < 9; j++) BL.m[j] = A.m[j] + (B2.m[j] - A.m[j]) * u; for (let j = 0; j < 3; j++) BL.t[j] = A.t[j] + (B2.t[j] - A.t[j]) * u; b = BL; }
      const m = b.m;
      if (f.mouth && jawOpen < 0.08) continue;
      let lift = f.lift + f.fl * (0.3 * fluff + ruf * 0.55 * (0.5 + 0.5 * Math.sin(T * 31 + f.ph * 3))) + 0.02 * Math.sin(T * 1.7 + f.ph) + (f.th ? thr * 0.22 : 0) + (f.hd ? crest * 0.2 * f.fl : 0) + (f.fh ? fore * 0.5 * f.fh : 0);
      const dsp = f.fl * 2.6 * fluff + f.br * 1.0 * breath + (f.th ? thr * 1.1 : 0) + (f.fh ? fore * 1.5 * f.fh : 0);
      let tx = f.tx, ty = f.ty, tz = f.tz;
      if (f.fan) { const a = f.fan * (f.bone === 4 ? 0.05 * fanT + 0.004 * breath : 0.075 * (f.bone === 5 ? wR : wL)); tx += a; }
      if (f.bone === 4) tx += tz * tailBend * f.lag;
      let fnx = f.nx, fny = f.ny, fnz = f.nz, px, py, pz, len = f.l, wid = f.w;
      const w = f.sp ? ease(clamp((f.bone === 5 ? spR : spL) * 1.55 - f.su * 0.55, 0, 1)) : 0;     // the wing opens from the shoulder outward and folds from the tip in
      if (w > 0.002) {                                           // wing feathers slide from their folded place to their open one
        const u = 1 - w; fnx = fnx * u + f.snx * w; fny = fny * u + f.sny * w; fnz = fnz * u + f.snz * w; const nl = Math.hypot(fnx, fny, fnz) || 1; fnx /= nl; fny /= nl; fnz /= nl;
        tx = tx * u + f.stx * w; ty = ty * u + f.sty * w; tz = tz * u + f.stz * w; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        px = (f.x + f.nx * dsp) * u + f.sx * w; py = (f.y + f.ny * dsp) * u + f.sy * w; pz = (f.z + f.nz * dsp) * u + f.sz * w; if (f.sl) len = f.l * u + f.sl * w; lift *= u; wid = f.sw ? f.w * u + f.sw * w : f.w;
      } else { px = f.x + f.nx * dsp; py = f.y + f.ny * dsp + (f.up ? jawOpen * 0.5 : 0); pz = f.z + f.nz * dsp; }
      if (f.two && f.bone !== 4 && w <= 0.002) wid = f.w * (1 + 1.5 * (f.bone === 5 ? wR : wL));     // a lifted wing shows the breadth of its flight feathers
      const cl = Math.cos(lift), sl = Math.sin(lift); tx = tx * cl + fnx * sl; ty = ty * cl + fny * sl; tz = tz * cl + fnz * sl;
      const nz = m[6] * fnx + m[7] * fny + m[8] * fnz, both = f.two || w > 0.15 || (f.bone === 5 ? wR > 0.08 : f.bone === 6 && wL > 0.08);   // a wing held away from the body shows its underside too
      if (!both && nz < (f.thin ? 0.1 : -0.32)) continue;       // fine barred feathers seen edge-on at the outline are left out, so their bars do not stick out as ticks
      const nx = m[0] * fnx + m[1] * fny + m[2] * fnz, ny = m[3] * fnx + m[4] * fny + m[5] * fnz;
      const X = b.t[0] + s * (m[0] * px + m[1] * py + m[2] * pz), Y = b.t[1] + s * (m[3] * px + m[4] * py + m[5] * pz), Z = b.t[2] + s * (m[6] * px + m[7] * py + m[8] * pz);
      const TX = m[0] * tx + m[1] * ty + m[2] * tz, TY = m[3] * tx + m[4] * ty + m[5] * tz, TZ = m[6] * tx + m[7] * ty + m[8] * tz;
      let BX = ny * TZ - nz * TY, BY = nz * TX - nx * TZ;         // across the feather
      const o8 = i * 8; scr[o8] = X; scr[o8 + 1] = Y; scr[o8 + 2] = TX; scr[o8 + 3] = TY; scr[o8 + 4] = BX; scr[o8 + 5] = BY;
      let lit = 0.5 + 0.5 * (nx * LX + ny * LY + (both ? Math.abs(nz) : nz) * LZ); lit = Math.pow(lit, 1.25) * f.ao * 1.12 * (1 + 0.1 * Math.min(0, ny));
      scr[o8 + 6] = lit; scr[o8 + 7] = nz; lens[i] = len; wids[i] = wid;
      depth[i] = Z + (f.bias - 16 * w) * s; order[n++] = i;    // an open wing sorts behind the body, so the belly always covers its root
    }
    const ord = order.subarray(0, n); ord.sort((a, b2) => depth[a] - depth[b2]);
    return n;
  }
  function drawItems(from, to) {
    const s = spec.size * sc;
    for (let q = from; q < to; q++) {
      const i = order[q], f = S[i], o8 = i * 8, X = cx + scr[o8] * sc, Y = cy - scr[o8 + 1] * sc;
      if (f.kind === 2) { drawEye(f, X, Y, o8); continue; }
      if (f.kind === 3) { drawBeak(); continue; }
      let tx = scr[o8 + 2], ty = scr[o8 + 3], bx = scr[o8 + 4], by = scr[o8 + 5];
      const m = f.m, k = clamp(Math.round(scr[o8 + 6] * (K - 1) + (f.kind || f.bone === 1 ? 0 : (f.v - 1) * 0.35)), 0, K - 1), sx = (f.v * K + k) * (m.w + 2);
      if (f.kind === 1) {                                      // smooth dab: a disc lying on the surface
        const tl = Math.hypot(tx, ty), bl = Math.hypot(bx, by), mn = 0.45;
        if (tl < mn) { if (tl < 0.01) { tx = 0; ty = mn; } else { tx *= mn / tl; ty *= mn / tl; } } if (bl < mn) { if (bl < 0.01) { bx = mn; by = 0; } else { bx *= mn / bl; by *= mn / bl; } }
      } else {
        const tl = Math.hypot(tx, ty), bl = Math.hypot(bx, by), mt = f.two ? 0.12 : f.thin ? 0.16 : 0.42, mb = f.two ? 0.5 : f.thin ? 0.14 : 0.55;
        if (tl < mt) { if (tl < 0.01) { tx = 0; ty = -mt; } else { tx *= mt / tl; ty *= mt / tl; } } if (bl < mb) { if (bl < 0.01) { bx = mb; by = 0; } else { bx *= mb / bl; by *= mb / bl; } }
      }
      if (f.a < 1 || f.mouth) g.globalAlpha = f.mouth ? clamp(ch.jaw.x * 3, 0, 1) : f.a;
      g.setTransform(bx * wids[i] * s, -by * wids[i] * s, tx * lens[i] * s, -ty * lens[i] * s, X, Y);
      g.drawImage(atlas, sx, m.y, m.w, m.h, -0.5, -f.anchor, 1, 1);
      if (f.a < 1 || f.mouth) g.globalAlpha = 1;
    }
  }
  function drawEye(f, X, Y, o8) {                                // a soft dark bead set in the side of the head
    const nz = scr[o8 + 7]; if (nz < 0.04) return;
    const a = sstep(0.04, 0.22, nz), s = spec.size * sc, R = 2.8 * HS * s, m = M[1].m, lid = clamp(ch.lid.x, 0, 1);
    // the eye's own "up" and "forward" on the head, as they fall on the screen
    let ux = m[1], uy = m[4], fx = m[2] * 0.8 - m[0] * f.side * 0.6, fy = m[5] * 0.8 - m[3] * f.side * 0.6;
    const fl = Math.max(0.3, Math.hypot(fx, fy)), ul = Math.max(0.5, Math.hypot(ux, uy)); if (Math.hypot(fx, fy) < 0.3) { fx = 0.3; fy = 0; } if (Math.hypot(ux, uy) < 0.5) { ux = 0; uy = 0.5; }
    g.setTransform(fx * R, -fy * R, -ux * R, uy * R, X, Y); g.globalAlpha = a;      // local y points down the head
    const face = palette.face, skin = shade(mixc(face, [112, 108, 122], 0.55), 0.6);
    // a narrow ring of bare lid skin, then the eye itself: a big dark pupil inside a thin pale iris, shaded from above by the brow
    let gr = g.createRadialGradient(0, 0, 0.8, 0, 0, 1.32); gr.addColorStop(0, css(skin, 0.85)); gr.addColorStop(0.55, css(skin, 0.55)); gr.addColorStop(1, css(skin, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1.32, 0, 7); g.fill();
    gr = g.createRadialGradient(0, 0.03, 0, 0, 0, 1); gr.addColorStop(0, '#060505'); gr.addColorStop(0.58, '#0b0909'); gr.addColorStop(0.68, '#5e5954'); gr.addColorStop(0.75, '#969088'); gr.addColorStop(0.85, '#8e877e'); gr.addColorStop(0.92, '#6b635d'); gr.addColorStop(0.97, 'rgba(84,76,76,.6)'); gr.addColorStop(1, 'rgba(84,76,76,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
    gr = g.createLinearGradient(0, -1, 0, 0.5); gr.addColorStop(0, 'rgba(10,8,12,.5)'); gr.addColorStop(0.5, 'rgba(10,8,12,.14)'); gr.addColorStop(1, 'rgba(10,8,12,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 0.93, 0, 7); g.fill();
    if (lid > 0.02) {                                            // the lower lid rises, as a bird's does
      const lc = shade(mixc(face, [186, 180, 184], 0.22), 0.58), yTop = 1.45 - 2.9 * lid;
      g.save(); g.beginPath(); g.rect(-2, yTop, 4, 4); g.clip();
      gr = g.createRadialGradient(0, 0, 0.95, 0, 0, 1.6); gr.addColorStop(0, css(lc, 1)); gr.addColorStop(1, css(lc, 0)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1.6, 0, 7); g.fill(); g.restore();
      g.strokeStyle = 'rgba(60,50,48,' + (0.5 * Math.min(1, lid * 1.5)).toFixed(3) + ')'; g.lineWidth = 0.16; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.85, yTop + 0.1); g.quadraticCurveTo(0, yTop - 0.28 * (1 - lid) + 0.25 * lid, 0.85, yTop + 0.1); g.stroke();
    }
    if (lid < 0.7) {                                             // one small soft glint, always on the side the light comes from
      g.setTransform(1, 0, 0, 1, X - R * 0.26 * fl, Y - R * 0.34); g.globalAlpha = a * (1 - lid / 0.7) * 0.85;
      const r = R * 0.2; gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  // The beak, cere and lower mandible are small smooth meshes rather than feathers, so they keep a clean edge and a soft shine.
  const MESH = (() => {
    const out = [], bz = (u, a, b, c) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * b + u * u * c;
    function grid(bone, col, nu, nv, fn) { const v = []; for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) v.push(fn(i / nu, j / nv)); out.push({bone, col, nu, nv, v, w: new Float32Array(v.length * 4)}); }
    grid(1, [230, 204, 118], 32, 26, (u, q) => {                 // upper mandible: hooked, wide under the cere, coming to a point
      const cy = bz(u, -2.4, -5.6, -11.3), cz = bz(u, 15.6, 19.2, 16.2), T = norm([0, bz(u + 0.01, -2.4, -5.6, -11.3) - cy, bz(u + 0.01, 15.6, 19.2, 16.2) - cz]), N = [0, T[2], -T[1]];
      const tipR = Math.sqrt(Math.min(1, (1 - u) * 5)), w = 4.5 * Math.pow(1 - Math.pow(u, 1.8), 0.66) * tipR + 0.05, d = 4.1 * (1 - 0.62 * u) * tipR + 0.05, al = (-118 + 236 * q) * RAD, sa = Math.sin(al), ca = Math.cos(al);
      return [w * sa, cy + N[1] * d * ca, cz + N[2] * d * ca, ...norm([sa / w, N[1] * ca / d + T[1] * 0.3 * u, N[2] * ca / d + T[2] * 0.3 * u])];
    });
    grid(2, [212, 188, 110], 12, 18, (u, q) => {                   // lower mandible: a small cup tucked under the hook
      const la = (-88 + 150 * u) * RAD, lo = (-92 + 184 * q) * RAD, d = [Math.sin(lo) * Math.cos(la), Math.sin(la), Math.cos(lo) * Math.cos(la)];
      return [d[0] * 2.5, -9.2 + d[1] * 1.3, 13.7 + d[2] * 2.3, ...norm([d[0] / 4.6, d[1] / 3.6, d[2] / 3.6])];
    });
    grid(1, null, 22, 44, (u, q) => {                            // cere: two soft rounded swellings side by side, each holding a nostril, with a shallow crease between
      const la = (-80 + 170 * u) * RAD, lo = (-100 + 200 * q) * RAD, cl = Math.pow(Math.cos(la), 0.62), d = [Math.sin(lo) * cl, Math.sin(la), Math.cos(lo) * cl];
      const x = d[0] * 5.5, ax = Math.abs(x), mid = Math.exp(-x * x / 2), lobe = Math.exp(-(ax - 2.6) * (ax - 2.6) / 4.5), dip = 1 - 0.2 * mid * Math.max(0, d[1]) - 0.06 * mid * Math.max(0, -d[1]);
      return [x, 2 + d[1] * 3.3 * dip * (0.9 + 0.12 * lobe), 14.6 + d[2] * 2.2 * (0.9 + 0.16 * lobe - 0.1 * mid), ...norm([d[0] / 5.5 + Math.sign(x) * 0.1 * (ax - 2.6) / 2.6 * lobe - Math.sign(x) * 0.08 * mid * Math.min(1, ax), d[1] / 2.6, d[2] / 2.6])];
    });
    return out;
  })();
  const quads = [];
  function drawBeak() {
    const s = spec.size, ss = s * sc, HX = LX, HY = LY, HZ = LZ + 1, hl = Math.hypot(HX, HY, HZ), cere = hex(spec.cere);
    quads.length = 0;
    for (const ms of MESH) {
      const b = M[ms.bone], m = b.m, w = ms.w, col = ms.col || cere, lift = ms.bone === 1 && ms.col ? ch.jaw.x * 0.65 : 0;
      for (let i = 0; i < ms.v.length; i++) { const v = ms.v[i], x = v[0] * HS, y = v[1] * HS + lift, z = v[2] * HS;
        w[i * 4] = cx + (b.t[0] + s * (m[0] * x + m[1] * y + m[2] * z)) * sc; w[i * 4 + 1] = cy - (b.t[1] + s * (m[3] * x + m[4] * y + m[5] * z)) * sc; w[i * 4 + 2] = m[6] * x + m[7] * y + m[8] * z;
        const nx = m[0] * v[3] + m[1] * v[4] + m[2] * v[5], ny = m[3] * v[3] + m[4] * v[4] + m[5] * v[5], nz = m[6] * v[3] + m[7] * v[4] + m[8] * v[5];
        w[i * 4 + 3] = nz < -0.15 ? -1 : Math.pow(0.5 + 0.5 * (nx * LX + ny * LY + nz * LZ), 0.9) + 2 * Math.floor(100 * Math.pow(Math.max(0, (nx * HX + ny * HY + nz * HZ) / hl), 26)); }
      const W = ms.nv + 1;
      for (let i = 0; i < ms.nu; i++) for (let j = 0; j < ms.nv; j++) {
        const a = i * W + j, bq = a + 1, c = a + W + 1, d = a + W, la = w[a * 4 + 3], lb = w[bq * 4 + 3], lc = w[c * 4 + 3], ld = w[d * 4 + 3];
        if (la < 0 && lb < 0 && lc < 0 && ld < 0) continue;
        const dec = x => x < 0 ? [0.3, 0] : [x % 2, Math.floor(x / 2) / 100], A = dec(la), Bq = dec(lb), C = dec(lc), D = dec(ld), lit = (A[0] + Bq[0] + C[0] + D[0]) / 4, spc = (A[1] + Bq[1] + C[1] + D[1]) / 4;
        let base = col, occ = 1;
        if (ms.bone === 1 && ms.col) {                             // horn: a touch olive and shaded under the cere, paler and faintly grey toward the tip, with fine streaks running its length
          const u = i / ms.nu, st = 0.5 + 0.5 * Math.sin(j * 2.7 + 1.3 * Math.sin(j * 0.9));
          base = mixc(mixc(col, [170, 160, 104], 0.45 * (1 - sstep(0, 0.22, u))), [238, 226, 186], 0.5 * sstep(0.5, 1, u)); base = mixc(base, [190, 164, 92], 0.06 * st * (1 - 0.6 * u)); occ = lerp(0.7, 1, sstep(0, 0.18, u));
        } else if (!ms.col) {                                      // cere: waxy, paler round each nostril, a darker crease between the two lobes
          const v = ms.v[a], dx = Math.abs(v[0]) - 2.35, dy = v[1] - 2.2, nr = Math.exp(-(dx * dx + dy * dy) / 2.2) * (v[2] > 14.5 ? 1 : 0);
          base = mixc(mixc(col, [255, 250, 244], 0.12 * nr), [40, 30, 40], 0.16 * Math.exp(-v[0] * v[0] / 0.5) + 0.05 * noise(v[0] * 2.3 + 7, v[1] * 2.3)); occ = lerp(0.82, 1, sstep(-1.6, 0.6, v[1]));
        } else occ = 0.8;
        const cc = mixc(shade(base, (0.06 + 0.8 * lit) * occ), [255, 252, 236], spc * (ms.col ? 0.55 : 0.4));
        quads.push({z: (w[a * 4 + 2] + w[c * 4 + 2]) / 2, a, b: bq, c, d, w, col: css(cc)});
      }
    }
    quads.sort((p, q) => p.z - q.z);
    g.setTransform(1, 0, 0, 1, 0, 0); g.lineJoin = 'round';
    if (ch.jaw.x > 0.05) {                                       // the open mouth: one dark shape running from the corners of the mouth, under the upper beak, down to the rim of the lower one
      const up = ch.jaw.x * 0.65, P = [], pt = (b, x, y, z) => { const m = b.m, t = b.t; x *= HS; y *= HS; z *= HS; P.push([cx + (t[0] + s * (m[0] * x + m[1] * y + m[2] * z)) * sc, cy - (t[1] + s * (m[3] * x + m[4] * y + m[5] * z)) * sc]); };
      for (const sd of [-1, 1]) { pt(M[1], sd * 3.1, -8.7, 11.6); pt(M[1], sd * 2.7, -9.3 + up, 14.2); pt(M[1], sd * 1.2, -10.1 + up, 16); pt(M[2], sd * 2.4, -9.3, 12.6); pt(M[2], sd * 2.3, -9.4, 15); pt(M[2], 0, -9.7, 15.8); }
      P.sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]); const cr = (o, a, b2) => (a[0] - o[0]) * (b2[1] - o[1]) - (a[1] - o[1]) * (b2[0] - o[0]), H = [];
      for (const q of P) { while (H.length >= 2 && cr(H[H.length - 2], H[H.length - 1], q) <= 0) H.pop(); H.push(q); } const lo = H.length + 1;
      for (let i = P.length - 2; i >= 0; i--) { const q = P[i]; while (H.length >= lo && cr(H[H.length - 2], H[H.length - 1], q) <= 0) H.pop(); H.push(q); }
      g.fillStyle = 'rgba(58,26,30,' + clamp(ch.jaw.x * 2.5, 0, 0.97).toFixed(3) + ')'; g.beginPath(); g.moveTo(H[0][0], H[0][1]); for (const q of H) g.lineTo(q[0], q[1]); g.closePath(); g.fill();
      if (ch.jaw.x > 0.9) { let mx = 0, my = 0; for (const q of H) { mx += q[0]; my += q[1]; } mx /= H.length; my /= H.length; g.fillStyle = 'rgba(150,92,96,' + clamp((ch.jaw.x - 0.9) * 0.8, 0, 0.75).toFixed(3) + ')'; g.beginPath(); g.ellipse(mx, my + 0.6 * HS * ss, 1.1 * HS * ss, 0.8 * HS * ss, 0, 0, 7); g.fill(); }   // a glimpse of tongue
    }
    g.lineWidth = Math.max(0.5, 0.1 * ss);
    for (const q of quads) { const w = q.w; g.fillStyle = g.strokeStyle = q.col; g.beginPath(); g.moveTo(w[q.a * 4], w[q.a * 4 + 1]); g.lineTo(w[q.b * 4], w[q.b * 4 + 1]); g.lineTo(w[q.c * 4], w[q.c * 4 + 1]); g.lineTo(w[q.d * 4], w[q.d * 4 + 1]); g.closePath(); g.fill(); g.stroke(); }
    for (const sg of [1, -1]) {                                  // nostrils
      const m = M[1].m, t = M[1].t, p = [sg * 2.35 * HS, 2.2 * HS, 16.95 * HS], nz = m[6] * sg * 0.25 + m[7] * 0.1 + m[8] * 0.96; if (nz < 0.25) continue;
      const X = cx + (t[0] + s * (m[0] * p[0] + m[1] * p[1] + m[2] * p[2])) * sc, Y = cy - (t[1] + s * (m[3] * p[0] + m[4] * p[1] + m[5] * p[2])) * sc, r = 0.38 * HS * ss, sq = clamp(nz * 1.15, 0.35, 1);
      g.save(); g.translate(X, Y); g.scale(sq, 1);                 // a round hole with a soft raised rim, narrowing as the head turns away
      let gr = g.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.9); gr.addColorStop(0, 'rgba(255,250,244,' + (0.06 * nz).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,250,244,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 1.9, 0, 7); g.fill();
      gr = g.createRadialGradient(0, r * 0.15, 0, 0, 0, r); gr.addColorStop(0, 'rgba(40,24,26,' + (0.85 * nz).toFixed(2) + ')'); gr.addColorStop(0.6, 'rgba(46,28,28,' + (0.6 * nz).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(46,28,24,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore();
    }
  }
  let quality = 1, slowAvg = 0.016, slowAt = 0;
  const RB = 7.6;                                               // half the branch's thickness
  function paintBranch() {
    const res = 3, L = 1500, Hh = 44, c0 = document.createElement('canvas'); c0.width = L * res; c0.height = Hh * res;
    const c = c0.getContext('2d'), r = rng(31); c.scale(res, res);
    const top = x => Hh / 2 - RB + 0.7 * Math.sin(x * 0.021) + 0.45 * Math.sin(x * 0.067 + 1) + 0.2 * Math.sin(x * 0.19), bot = x => Hh / 2 + RB + 0.8 * Math.sin(x * 0.017 + 2) + 0.4 * Math.sin(x * 0.081) + 0.2 * Math.sin(x * 0.23);
    c.beginPath(); c.moveTo(0, top(0)); for (let x = 0; x <= L; x += 4) c.lineTo(x, top(x)); for (let x = L; x >= 0; x -= 4) c.lineTo(x, bot(x)); c.closePath(); c.save(); c.clip();
    let gr = c.createLinearGradient(0, Hh / 2 - RB, 0, Hh / 2 + RB); gr.addColorStop(0, '#c2a680'); gr.addColorStop(0.3, '#a2835e'); gr.addColorStop(0.7, '#6f573f'); gr.addColorStop(1, '#43342a');
    c.fillStyle = gr; c.fillRect(0, 0, L, Hh); c.lineCap = 'round';
    for (let i = 0; i < 2600; i++) {                             // bark: many thin strokes running with the grain
      const x = r() * L, y = Hh / 2 + (r() * 2 - 1) * RB, l = 6 + r() * 34, lt = r() < 0.42, wv = (r() - 0.5) * 1.6;
      c.strokeStyle = lt ? 'rgba(232,212,176,' + (0.05 + r() * 0.13) + ')' : 'rgba(44,30,20,' + (0.06 + r() * 0.16) + ')'; c.lineWidth = 0.3 + r() * 0.8;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y + wv, x + l, y + (r() - 0.5) * 0.8); c.stroke();
    }
    for (let i = 0; i < 9; i++) {                                // knots
      const x = 60 + r() * (L - 120), y = Hh / 2 + (r() - 0.4) * RB, a = 2 + r() * 2.4;
      for (let k = 3; k > 0; k--) { c.strokeStyle = 'rgba(50,34,24,' + (0.16 + 0.07 * k) + ')'; c.lineWidth = 0.5; c.beginPath(); c.ellipse(x, y, a * k * 0.5, a * k * 0.3, 0.1, 0, 7); c.stroke(); }
      c.fillStyle = 'rgba(48,32,24,.5)'; c.beginPath(); c.ellipse(x, y, a * 0.35, a * 0.22, 0.1, 0, 7); c.fill();
    }
    for (let i = 0; i < 60; i++) { const x = r() * L, y = Hh / 2 - RB + r() * RB, a = 2 + r() * 7; gr = c.createRadialGradient(x, y, 0, x, y, a); gr.addColorStop(0, 'rgba(176,190,150,.22)'); gr.addColorStop(1, 'rgba(176,190,150,0)'); c.fillStyle = gr; c.fillRect(x - a, y - a, 2 * a, 2 * a); }   // lichen
    gr = c.createLinearGradient(0, Hh / 2 - RB, 0, Hh / 2 + RB); gr.addColorStop(0, 'rgba(255,240,206,.34)'); gr.addColorStop(0.22, 'rgba(255,240,206,0)'); gr.addColorStop(0.62, 'rgba(20,12,18,0)'); gr.addColorStop(1, 'rgba(20,12,24,.5)');
    c.fillStyle = gr; c.fillRect(0, 0, L, Hh); c.restore();
    branchC = {c: c0, L, H: Hh};
  }
  let bgCol = '';
  function paintBg() {
    if (bgCol) {                                                // a chosen colour: the same soft out-of-focus look, in that colour
      const b = hex(bgCol), c0 = document.createElement('canvas'); c0.width = 120; c0.height = 120; const c = c0.getContext('2d'), r = rng(5), k = v => v.map(Math.round).join(',');
      let gr = c.createLinearGradient(0, 0, 80, 120); gr.addColorStop(0, 'rgb(' + k(mixc(b, [255, 255, 255], 0.3)) + ')'); gr.addColorStop(0.5, 'rgb(' + k(b) + ')'); gr.addColorStop(1, 'rgb(' + k(mixc(b, [20, 26, 40], 0.3)) + ')'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120);
      const cols = [mixc(b, [255, 255, 255], 0.35), mixc(b, [20, 26, 40], 0.18), mixc(b, [20, 26, 40], 0.34), mixc(b, [255, 250, 220], 0.45), b, mixc(b, [255, 255, 255], 0.18)].map(k);
      for (let i = 0; i < 46; i++) { const x = r() * 120, y = r() * 120, a = 8 + r() * 26; gr = c.createRadialGradient(x, y, 0, x, y, a); const col = cols[Math.floor(r() * cols.length)]; gr.addColorStop(0, 'rgba(' + col + ',' + (0.2 + r() * 0.3) + ')'); gr.addColorStop(0.6, 'rgba(' + col + ',.12)'); gr.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120); }
      gr = c.createRadialGradient(34, 26, 0, 34, 26, 70); gr.addColorStop(0, 'rgba(255,250,224,.3)'); gr.addColorStop(1, 'rgba(255,250,224,0)'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120);
      bgC = c0; return;
    }
    const c0 = document.createElement('canvas'); c0.width = 120; c0.height = 120; const c = c0.getContext('2d'), r = rng(5);
    let gr = c.createLinearGradient(0, 0, 80, 120); gr.addColorStop(0, '#c4dcb2'); gr.addColorStop(0.5, '#93bd95'); gr.addColorStop(1, '#5e8f7c'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120);
    const cols = ['210,232,170', '120,172,120', '70,128,104', '238,236,180', '96,150,132', '160,204,150'];
    for (let i = 0; i < 46; i++) { const x = r() * 120, y = r() * 120, a = 8 + r() * 26; gr = c.createRadialGradient(x, y, 0, x, y, a); const col = cols[Math.floor(r() * cols.length)]; gr.addColorStop(0, 'rgba(' + col + ',' + (0.2 + r() * 0.3) + ')'); gr.addColorStop(0.6, 'rgba(' + col + ',.12)'); gr.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120); }
    gr = c.createRadialGradient(34, 26, 0, 34, 26, 70); gr.addColorStop(0, 'rgba(255,250,214,.42)'); gr.addColorStop(1, 'rgba(255,250,214,0)'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120);
    bgC = c0;
  }
  const FOOT = ['#dcc0bb', '#f4e5e0', '#a88682', '#5e4f4c'];
  function footPt(i) { const an = ch.angle.x * RAD, f = feet[i], s = spec.size, P = [f.u * Math.cos(an), f.u * Math.sin(an) + (f.lift * 3.2 + 0.7 * Math.sin(PI * f.flex)) * s]; if (f.tk <= 0) return P;
    const m = M[0], a = [(i ? 1 : -1) * 4, 15, 4], k = ease(f.tk); return [lerp(P[0], m.t[0] + s * (m.m[0] * a[0] + m.m[1] * a[1] + m.m[2] * a[2]), k), lerp(P[1], m.t[1] + s * (m.m[3] * a[0] + m.m[4] * a[1] + m.m[5] * a[2]), k) + 2.5 * s * Math.sin(PI * k)]; }
  function drawLegs() {                                         // only a short length of leg shows below the belly feathers, angled out to the foot
    const s = spec.size, m = M[0];
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1, a = [sd * 5, 13, 3], F = footPt(i);
      const ax = cx + (m.t[0] + s * (m.m[0] * a[0] + m.m[1] * a[1] + m.m[2] * a[2])) * sc, ay = cy - (m.t[1] + s * (m.m[3] * a[0] + m.m[4] * a[1] + m.m[5] * a[2])) * sc, fx = cx + F[0] * sc, fy = cy - (F[1] + 1.2 * s) * sc;
      g.setTransform(1, 0, 0, 1, 0, 0); g.lineCap = 'round';
      for (const [w, col, dx] of [[4.6, FOOT[2], 0.25], [3.9, FOOT[0], 0], [1.5, FOOT[1], -0.6]]) { g.strokeStyle = col; g.lineWidth = w * s * sc; g.beginPath(); g.moveTo(ax + dx * s * sc, ay); g.quadraticCurveTo((ax + fx) / 2 + sd * 0.8 * s * sc + dx * s * sc, (ay + fy) / 2, fx + dx * s * sc, fy); g.stroke(); }
    }
  }
  // One front toe, seen from the front: a single jointed finger that comes over the top of the branch, runs down its face and hooks under.
  // It is drawn round the branch's curve (so it shortens at the top and again as it goes under), shaded darker toward the underside,
  // with a crease at each joint and a dark claw curling out of sight.
  function toe(x0, y0, ang, curl, w) {
    const tn = Math.tan(ang), top = y0, R = RB - top / 2, A1 = 146 * (0.5 + 0.5 * curl), N = 14, Y = a => top + R * (1 - Math.cos(a * RAD)), X = y => x0 + tn * (y - y0);
    const hw = t => w * 0.5 * (1 - 0.34 * t * t) * (1 - 0.11 * Math.cos(2 * PI * t * 4) * (t > 0.06 ? 1 : 0));   // padded between the joints, pinched at them
    const y1 = Y(A1), ye = Y(Math.min(178, A1 + 26));
    // its shadow on the bark
    g.fillStyle = 'rgba(30,18,14,.2)'; g.beginPath(); g.moveTo(X(top) + hw(0) + 0.9, top + 0.6); for (let i = 1; i <= N; i++) { const t = i / N, y = Y(A1 * t); g.lineTo(X(y) + hw(t) + 1.1, y + 0.5); } for (let i = N; i >= 0; i--) { const t = i / N, y = Y(A1 * t); g.lineTo(X(y) - hw(t) * 0.4, y + 0.5); } g.fill();
    // the claw first, so the toe overlaps its root
    g.fillStyle = FOOT[3]; g.beginPath(); g.moveTo(X(y1) - hw(1) * 0.85, y1 - 1.4); g.quadraticCurveTo(X(ye) - hw(1) * 0.5, (y1 + ye) / 2 + 0.4, X(ye), ye + 0.5); g.quadraticCurveTo(X(ye) + hw(1) * 0.5, (y1 + ye) / 2 + 0.4, X(y1) + hw(1) * 0.85, y1 - 1.4); g.fill();
    // the toe
    g.beginPath(); g.moveTo(X(top) - hw(0), top); for (let i = 1; i <= N; i++) { const t = i / N, y = Y(A1 * t); g.lineTo(X(y) - hw(t), y); }
    g.quadraticCurveTo(X(y1), y1 + hw(1) * 1.1, X(y1) + hw(1), y1); for (let i = N - 1; i >= 0; i--) { const t = i / N, y = Y(A1 * t); g.lineTo(X(y) + hw(t), y); } g.quadraticCurveTo(X(top), top - hw(0) * 0.9, X(top) - hw(0), top);
    const mixh = (c, t) => 'rgb(' + mixc(hex(c), [70, 46, 46], t).map(Math.round).join(',') + ')', gr = g.createLinearGradient(0, top - 1, 0, y1 + 1);
    gr.addColorStop(0, FOOT[1]); gr.addColorStop(0.16, FOOT[1]); gr.addColorStop(0.4, FOOT[0]); gr.addColorStop(0.72, mixh(FOOT[2], 0.25)); gr.addColorStop(1, mixh(FOOT[2], 0.78));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    const sg = g.createLinearGradient(X((top + y1) / 2) - w * 0.5, 0, X((top + y1) / 2) + w * 0.5, 0); sg.addColorStop(0, 'rgba(255,246,240,.28)'); sg.addColorStop(0.45, 'rgba(255,246,240,0)'); sg.addColorStop(1, 'rgba(96,60,60,.42)');
    g.fillStyle = sg; g.fillRect(x0 - w * 2 - 14, top - 2, w * 4 + 28, y1 - top + 6);          // round across its width
    g.strokeStyle = 'rgba(120,78,76,.6)'; g.lineWidth = 0.34; g.lineCap = 'round';
    for (let k = 1; k < 16; k++) { const t = k / 16, main = k % 4 === 0, y = Y(A1 * t), h = hw(t), bow = 0.75 * Math.cos(A1 * t * RAD) ; g.strokeStyle = main ? 'rgba(112,70,70,.7)' : 'rgba(128,88,86,.26)'; g.lineWidth = main ? 0.4 : 0.22; g.beginPath(); g.moveTo(X(y) - h, y); g.quadraticCurveTo(X(y), y - bow * 1.6, X(y) + h, y); g.stroke(); }   // joint creases, bowed the way the toe bends
    g.restore();
  }
  function drawToes() {                                         // the front pair of toes on each foot lie side by side over the top of the branch (the back pair is hidden behind it)
    const s = spec.size * sc, an = ch.angle.x * RAD;
    for (let i = 0; i < 2; i++) {
      const F = footPt(i), f = feet[i], sd = i ? 1 : -1, sq = 0.09 * Math.sin(PI * f.grip), fx = k => 0.34 * Math.sin(PI * clamp(f.flex * 1.5 - k * 0.5, 0, 1)), curl = 1 - 0.5 * f.lift + sq - fx(0), curl2 = 1 - 0.5 * f.lift + sq - fx(1), tks = 1 - 0.45 * ease(f.tk);
      g.setTransform(Math.cos(an) * s * tks, -Math.sin(an) * s * tks, Math.sin(an) * s * tks, Math.cos(an) * s * tks, cx + F[0] * sc, cy - F[1] * sc);
      const open = 0.16 * (1 - Math.min(curl, curl2)) + 0.3 * f.lift;                       // the toes part a little as the foot opens
      toe(-1.7 - open + sd * 0.3, -1.5, -0.04 - open * 0.3 + sd * 0.05, curl, 3.6); toe(1.7 + open + sd * 0.3, -1.5, 0.04 + open * 0.3 + sd * 0.05, curl2, 3.6);
      const gr = g.createRadialGradient(sd * 0.3 - 0.6, -2.2, 0, sd * 0.3, -1.4, 3.6); gr.addColorStop(0, FOOT[1]); gr.addColorStop(0.6, FOOT[0]); gr.addColorStop(1, FOOT[2]);
      g.fillStyle = gr; g.beginPath(); g.ellipse(sd * 0.3, -1.9, 3.3, 1.9, 0, 0, 7); g.fill();     // the pad where the toes meet, on the crest of the branch
    }
  }
  function draw() {
    const an = ch.angle.x * RAD;
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const bs = Math.max(cw, ch_) * 1.15; g.drawImage(bgC, (cw - bs) / 2, (ch_ - bs) / 2, bs, bs);
    pose(); const n = project();
    let split = 0; while (split < n && depth[order[split]] < -1.5) split++;
    drawItems(0, split);
    g.setTransform(Math.cos(an) * sc, -Math.sin(an) * sc, Math.sin(an) * sc, Math.cos(an) * sc, cx, cy);
    g.drawImage(branchC.c, -branchC.L / 2, -branchC.H / 2 + RB, branchC.L, branchC.H);
    const sh = g.createRadialGradient(ch.perch.x, 2, 0, ch.perch.x, 2, 34 * spec.size); sh.addColorStop(0, 'rgba(24,16,22,.42)'); sh.addColorStop(1, 'rgba(24,16,22,0)');
    g.save(); g.beginPath(); g.rect(-branchC.L / 2, 0.4, branchC.L, RB * 2 - 0.6); g.clip(); g.fillStyle = sh; g.scale(1, 0.5); g.fillRect(ch.perch.x - 60, -20, 120, 80); g.restore();
    drawLegs(); drawToes(); drawItems(split, n);      // the belly feathers lie over the tops of the feet
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ch.dim.x > 0.01) { g.fillStyle = 'rgba(8,12,34,' + (0.46 * ch.dim.x).toFixed(3) + ')'; g.fillRect(0, 0, cw, ch_); }
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * quality, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    cw = cv.width; ch_ = cv.height; sc = Math.min(cw / 118, ch_ / 192); cx = cw / 2; cy = ch_ * 0.775;
    roam = clamp(cw / sc / 2 - 44, 4, 60);
  }
  function frame(now) {
    raf = 0; if (!visible || manual) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    // if this device cannot keep up, paint a little less finely rather than let the motion stutter
    if (dt > 0) { slowAvg += (dt - slowAvg) * 0.05; if (slowAvg > 0.027 && quality > 0.5 && now > slowAt + 2500) { quality -= 0.17; slowAt = now; slowAvg = 0.016; } }
    resize(); update(dt); draw(); raf = requestAnimationFrame(frame);
  }
  function setSpec(s) {
    const old = spec; spec = Object.assign({}, DEFAULT, s);
    for (const k of ['size', 'build', 'fluff', 'tailLen', 'markAmt', 'barStart', 'cap']) spec[k] = +spec[k];
    spec.size = clamp(spec.size, 0.8, 1.2);
    buildAtlas(); if (!NS || old.build !== spec.build || old.tailLen !== spec.tailLen || old.markAmt !== spec.markAmt || old.barStart !== spec.barStart || old.cap !== spec.cap) build();
  }
  return {
    PRESETS, DEFAULT,
    get mood() { return mood; },
    init(canvas, opts) { cv = canvas; g = cv.getContext('2d'); getEnv = opts.getEnv; paintBg(); paintBranch(); setSpec(opts.spec || spec); branchAngle = opts.angle || 0; ch.angle.x = ch.angle.t = branchAngle; lively = opts.lively || 1; ch.hyaw.x = 124; ch.hpitch.x = 16; ch.hy.x = -5; },
    setSpec, getSpec: () => Object.assign({}, spec),
    setBg(c) { bgCol = /^#[0-9a-f]{6}$/i.test(c || '') ? c : ''; paintBg(); }, setAngle(a) { branchAngle = clamp(+a || 0, -30, 30); }, setLively(l) { lively = clamp(+l || 1, 0.4, 2); },
    setVisible(on) { visible = on; if (on && !raf && !manual) { last = 0; raf = requestAnimationFrame(frame); } },
    setAsleep(a) { if (a === asleep) return; asleep = a; act = null; queue = []; gq.length = 0; micro = null; freezeUntil = 0; if (a) { sleepSide = rnd() < 0.5 ? -1 : 1; sleptAt = T; tuckSide = rnd() < 0.5 ? 0 : 1; } else { setMood('relaxed', rr(8, 14)); look(true); gaze.yaw = rr(-10, 10); nextIdle = T + 1.2; queue.push(['shake']); nextBlink = T + 0.6; } },
    // the real bird called: stop, turn to face it, cock the head, pull the feathers in
    // No two reactions quite alike: usually a freeze with one eye or the face turned to the sound and the neck up, sometimes a lean
    // toward it, and when calls come thick and fast only a glance (it has got used to them). Then a sociable spell follows.
    notice() {
      if (asleep) return; heard = heard * Math.exp(-(T - heardAt) / 25) + 1; heardAt = T; gq.length = 0; freezeUntil = 0; micro = null;
      const sd = rnd() < 0.5 ? -1 : 1, used = heard > 3.5 && rnd() < 0.5, r = rnd();
      if (used) { gaze.yaw = clamp(gaze.yaw + sd * rr(20, 45), -80, 80); gaze.roll = sd * rr(4, 12); gaze.ext = 1.2; stillUntil = T + rr(0.4, 0.7); nextLook = T + rr(0.5, 1); nextIdle = Math.max(nextIdle, T + 1); if (mood === 'sleepy') setMood('relaxed'); return; }
      if (act && act.name !== 'bob') act = null;
      if (r < 0.5) { gaze.yaw = sd * rr(40, 64); gaze.roll = sd * rr(6, 20); } else if (r < 0.8) { gaze.yaw = rr(-9, 9); gaze.roll = sd * rr(9, 24); } else { gaze.yaw = sd * rr(16, 30); gaze.roll = -sd * rr(10, 18); }
      gaze.pitch = rr(-8, 3); gaze.ext = rr(2.4, 3.6); const hold = rr(0.8, 1.5); stillUntil = T + hold; sleekUntil = T + hold + rr(0.5, 1); nextLook = T + hold + 0.1; nextIdle = Math.max(nextIdle, T + hold + rr(0.4, 1.2)); ch.by.v += rr(9, 16);
      if (rnd() < 0.35) gq.push({t: T + hold * 0.5, d: [rr(-6, 6), rr(-3, 3), -sd * rr(14, 30)], force: 1});            // a second tilt while it listens
      if (rnd() < 0.3) queue.push(['peer']);
      setMood('social', rr(10, 20));
    },
    // turn the head toward a touched spot (x, y from -1 to 1 across the picture, measured from the bird's head) and perk up
    touch(x, y) { if (asleep) return; if (act && act.name !== 'bob') act = null; queue = []; gq.length = 0; freezeUntil = 0; gaze.ext = 2; if (mood !== 'social') setMood('curious', rr(8, 14)); gaze.yaw = clamp(x * TOUCH_YAW, -78, 78); gaze.pitch = clamp(y * TOUCH_PITCH, -24, 30); gaze.roll = (x < 0 ? -1 : 1) * rr(6, 16); stillUntil = T + 1.3; sleekUntil = T + 1.6; nextLook = T + 1.5; nextIdle = Math.max(nextIdle, T + 2); ch.by.v += 18; },
    listenUp(sec) { if (asleep) return; gq.length = 0; gaze.ext = 2.5; gaze.yaw = (rnd() < 0.5 ? -1 : 1) * rr(30, 70); gaze.pitch = rr(-12, -2); gaze.roll = rr(-18, 18); stillUntil = Math.max(stillUntil, T + Math.min(sec, 2.5)); sleekUntil = T + sec; },
    actNow(type) { if (asleep || !ACTS[type]) return false; queue = []; start(type, type === 'bob' ? 1 : undefined); nextIdle = T + 6; return true; },
    startAct(type, now, energy) { if (!asleep && ACTS[type]) { if (act) queue = [[type, energy]]; else start(type, energy); } },
    test: {
      manual(seed) { manual = true; rnd = rng(seed || 1); resize(); },
      step(dt) { resize(); update(dt); draw(); },
      get ch() { return ch; }, get act() { return act; }, get T() { return T; }, get mood() { return mood; }, setMood, start, feet, marks() { const m = M[1]; return {head: [m.t[0], m.t[1]], body: [M[0].t[0], M[0].t[1]], beak: [m.t[0] + spec.size * (m.m[2] * 20 - m.m[1] * 8), m.t[1] + spec.size * (m.m[5] * 20 - m.m[4] * 8)], tail: [M[4].t[0] + spec.size * (M[4].m[1] * -60 + M[4].m[2] * -45), M[4].t[1] + spec.size * (M[4].m[4] * -60 + M[4].m[5] * -45)]}; },
      setGaze(y, p, r) { gq.length = 0; gaze.ext = 0; gaze.yaw = y; gaze.pitch = p; gaze.roll = r; held = true; queue = []; }, setBase(y) { baseYaw = y; }, free() { held = false; nextLook = T; nextIdle = T + 1; }, count: () => NS
    }
  };
})();
