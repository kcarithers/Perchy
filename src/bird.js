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
  const DEFAULT = {name: 'Sky blue', body: '#45bfe6', face: '#f7f7f3', marks: '#1d1d24', markAmt: 1, cheek: '#5a4fd0', cere: '#b98f66', tail: '', size: 1, build: 0.5, fluff: 0.25, tailLen: 1};
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
      for (const lw of [0.3, 0.2, 0.12]) { c.lineWidth = h * lw; c.beginPath(); c.ellipse(w / 2, h * 0.3, w * 0.44, h * 0.4, 0, 0.16 * PI, 0.84 * PI); c.stroke(); }
      barbs(c, w, h, r, col, 4, 0.08);
    },
    scallop(c, w, h, col, o, r) {                                // a dark feather with a pale edge: the wing pattern
      softTear(c, w, h, col); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = css(o.dark, 0.42); c.translate(0, -h * 0.03);
      for (let i = 0; i < 5; i++) { tear(c, w, h, 0.83 - i * 0.07); c.fill(); }
      c.translate(0, h * 0.03); barbs(c, w, h, r, o.dark, 5, 0.07);
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
      ['face', 'feather', 30, 38, face, {soft: 1}], ['bodyU', 'disc', 24, 24, mixc(body, [0, 0, 0], 0.04), {hard: 0.25}], ['faceU', 'disc', 24, 24, face, {hard: 0.25}], ['bar', 'bar', 30, 34, face, {dark}], ['mantle', 'bar', 40, 46, mixc(face, body, 0.15), {dark}],
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
  const PROF = [[-0.05, 0], [0.03, 9.5], [0.15, 19.5], [0.3, 24], [0.45, 26.8], [0.6, 26.6], [0.8, 23.6], [0.9, 21.4], [1, 18.6], [1.1, 16]];
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
  function headPt(th, ps, off) {                                // the skull's shape: a flattish crown, a forehead sloping to the cere, full cheeks, and a long underside that runs into the neck
    const d = headDir(th, ps), up = Math.max(0, d[1]), dn = Math.max(0, -d[1]);
    const fr = sstep(-0.25, 0.45, d[2]);
    const rx = 16.6 * (1 + 0.06 * dn - 0.06 * up) + off, ry = (d[1] > 0 ? 16.8 : 21 + 12.5 * fr) + off, rz = (d[2] > 0 ? 17 * (1 - 0.04 * up + 0.12 * dn) : 19.5 * (1 + 0.1 * dn - 0.08 * up)) + off;
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
    const r = rng(20261126), B = clamp(spec.build, 0, 1), list = [], TL = clamp(spec.tailLen, 0.6, 1.4);
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
      const SH = [sd * 17, 75, 0], WA = norm([sd * 0.8, -0.5, -0.33]), WN = norm([sd * 0.28, 0.42, 0.86]), WT = norm(cross(WN, [WA[0] * sd, WA[1] * sd, WA[2] * sd])), WL = 74;
      if (WT[1] > 0) { WT[0] = -WT[0]; WT[1] = -WT[1]; WT[2] = -WT[2]; }
      const open = (u, v, ang, lift) => { const ca = Math.cos(ang), sa = Math.sin(ang), ch0 = 46 * (1 - 0.3 * u); return {sx: SH[0] + WA[0] * u * WL + WT[0] * v * ch0 + WN[0] * lift, sy: SH[1] + WA[1] * u * WL + WT[1] * v * ch0 + WN[1] * lift, sz: SH[2] + WA[2] * u * WL + WT[2] * v * ch0 + WN[2] * lift, stx: WT[0] * ca + WA[0] * sa, sty: WT[1] * ca + WA[1] * sa, stz: WT[2] * ca + WA[2] * sa, snx: WN[0], sny: WN[1], snz: WN[2], sp: 1}; };
      for (let t = 0.83; t > 0.2;) {
        const k = (0.83 - t) / 0.63, l = 5.5 + 10.5 * k, w = l * 0.86, rad = prof(t, B) + 3, a0 = (88 - 30 * Math.sin(PI * Math.pow(Math.min(1, k * 1.15), 0.6))) * RAD, a1 = 172 * RAD, n = Math.max(2, Math.round((a1 - a0) * rad / (w * 0.52)));
        for (let i = 0; i <= n; i++) { const phi = a0 + (i + (r() - 0.5) * 0.4) / n * (a1 - a0); add(bone, bodyFrame(t + (r() - 0.5) * 0.01, sd * phi, 1 + 2.8 * Math.min(1, k * 2.5), B), w, l, 'scallop', Object.assign({bias: 3, lift: 0.1, fl: 0.6, br: 0.3}, open(0.02 + k * 0.84 + (r() - 0.5) * 0.05, (i / n) * 0.5, k * 0.6, 2.4 - (i / n) * 1.6), {sw: w * 1.25, sl: l * 1.25})); }
        t -= l * 0.4 / AXL;
      }
      for (let i = 0; i < 10; i++) {                              // secondaries
        const f = bodyFrame(0.56 - 0.036 * i, sd * (104 + 7 * i) * RAD, 4.2, B), tip = bodyFrame(0.2 - 0.026 * i, sd * (132 + 4.5 * i) * RAD, 4.6, B), d = sub(tip.p, f.p), L = Math.hypot(d[0], d[1], d[2]);
        add(bone, {p: f.p, n: f.n, t: norm(d)}, 8, L, 'second', Object.assign({anchor: 0.04, bias: 4 + i * 0.2, lift: 0, fl: 0.2, fan: sd * (i - 1) * 0.3, two: 1}, open(0.03 + i * 0.056, 0.4, 0.02 + i * 0.04, 0.6 - i * 0.08), {sl: 40 + i * 0.6, sw: 12.5}));
      }
      for (let i = 0; i < 10; i++) {                              // primaries, their tips crossing over the base of the tail
        const f = bodyFrame(0.44 - 0.024 * i, sd * (140 + 3.4 * i) * RAD, 4.8, B), tip = bodyPos(-0.46 + 0.04 * i, sd * 173 * RAD, 5 + i * 0.8, B), d = sub(tip, f.p), L = Math.hypot(d[0], d[1], d[2]);
        add(bone, {p: f.p, n: f.n, t: norm(d)}, 6.6, L, 'prim', Object.assign({anchor: 0.04, bias: 5 + i * 0.2, lift: 0, fl: 0.15, fan: sd * (i + 1) * 0.6, two: 1}, open(0.58 + i * 0.044, 0.42 - i * 0.03, 0.4 + i * 0.125, -0.2 - i * 0.1), {sl: 52 - i * 1.2, sw: 11.5}));
      }
    }
    // tail: long feathers from the rump, the middle pair longest
    const TD = norm([0, -0.8, -0.6]), TN = [0, -0.6, 0.8], rump = bodyPos(0.04, PI, -5, B);
    for (const [ix, len, bx] of [[0.3, 82, 0.8], [-0.3, 80, -0.8], [1, 63, 2.6], [-1, 63, -2.6], [2, 50, 4.4], [-2, 50, -4.4], [3, 38, 6], [-3, 38, -6]]) {
      const a = ix * 3.2 * RAD, d = norm([TD[0] + Math.sin(a), TD[1], TD[2]]);
      add(BONE.tail, {p: [rump[0] + bx, rump[1] + 3 - Math.abs(ix) * 0.6, rump[2] + 2 - Math.abs(ix) * 0.4], n: TN, t: d}, 7, len * TL, 'tail', {anchor: 0.03, lift: 0, fl: 0, fan: ix, two: 1, bias: -Math.abs(ix) * 0.6, v: Math.abs(Math.round(ix)) % V});
    }
    // neck: fills in between the head and the shoulders, and rides along when the head moves
    for (let la = -44; la <= 50; la += 9.4) for (let i = 0, n = Math.round(34 * Math.cos(la * RAD)); i < n; i++) {
      const lo = (i + r() * 0.5) / n * 2 * PI, cl = Math.cos(la * RAD), d = [Math.sin(lo) * cl, Math.sin(la * RAD), Math.cos(lo) * cl];
      const up = Math.max(0, d[1]) / 0.77, xr = lerp(20.2, 13.5, up), p = [d[0] * xr, 87 + d[1] * 17, 9 + d[2] * (d[2] > 0 ? lerp(14.5, 9, up) : 19)], nn = norm([d[0] / 20.2, d[1] / 17, d[2] / 18]), t = norm([-d[0] * d[1] * 0.6, -1 + d[1] * d[1], -0.25 - d[2] * d[1] * 0.6]);
      add(BONE.neck, {p, n: nn, t}, 6.8, 9, d[2] > 0.3 ? (d[1] > -0.25 ? 'face' : 'body') : 'mantle', {ao: d[2] > -0.2 ? 0.94 : 1, lift: 0.1});
    }
    // head: rings of small feathers spreading back from the beak, so the barring falls into lines the way it does on a real bird
    let ring = 0;
    for (let th = 9 * RAD; th < 152 * RAD; ring++) {
      const l0 = th < 0.5 ? 3.9 : 4.4, n = Math.max(6, Math.round(2 * PI * Math.sin(th) * 17.2 / (l0 * 0.5))), o0 = r() * 6.28;
      for (let i = 0; i < n; i++) {
        const ps = o0 + (i + (r() - 0.5) * 0.35) * 2 * PI / n, cp = Math.cos(ps), tj = th + (r() - 0.5) * 0.02, deg = tj / RAD;
        const lim = 60 + 10 * Math.pow(Math.max(0, cp), 1.3) + 85 * Math.pow(Math.max(0, -cp), 2) + noise(ps * 7, 3) * 2.5;
        const f = headFrame(tj, ps, 0); if (f.p[1] < -18.5 && f.p[2] < 3) continue;              // buried in the neck
        let mat = 'face', l = l0, w = l0 * 0.86;
        if (deg > lim) { if (cp < -0.8) { mat = 'face'; l = 6; w = 5; } else { mat = ring % 2 ? 'bar' : 'face'; w = l0; l = l0 * 0.92; } }
        const ap = Math.abs(((ps % (2 * PI)) + 3 * PI) % (2 * PI) - PI) / RAD;                 // 0 = up ... 180 = down
        const cd = Math.hypot((deg - 62) / 9, (ap - 124) * Math.sin(tj) / 13);
        if (cd < 1 && deg < lim + 4) { mat = 'cheek'; l = 5.2; w = 4; }
        add(1, f, w, l, mat, {lift: mat === 'body' ? 0.12 : 0.07, fl: 0.75, th: mat === 'face' && cp < -0.5 && deg > 45 ? 1 : 0, ao: cp < -0.75 && deg > 64 ? 0.92 : 1});
      }
      th += l0 * 0.43 / 17.2;
    }
    for (let th = 14 * RAD; th < 150 * RAD; th += 0.2) for (let i = 0, n = Math.max(5, Math.round(2 * PI * Math.sin(th) * 17 / 3.6)); i < n; i++) {
      const ps = (i + 0.5 * (Math.round(th * 5) % 2)) * 2 * PI / n, cp = Math.cos(ps), f = headFrame(th, ps, -1.3);
      if (f.p[1] < -18.5 && f.p[2] < 3) continue;
      add(1, f, 8, 8, 'faceU', {kind: 1, anchor: 0.5, lift: 0, fl: 0.7, bias: -2.5});
    }
    for (const sgn of [1, -1]) for (const [dp, dth] of [[12, 56], [35, 58], [56, 62]]) {       // the six throat spots
      const f = headFrame(dth * RAD, PI + sgn * dp * RAD, 1.2); add(1, f, 5.6, 6, 'spot', {kind: 1, anchor: 0.5, lift: 0, fl: 0.6, bias: 1.2, a: clamp(spec.markAmt * 4, 0, 1), th: 1});
    }
    for (const sgn of [1, -1]) { const e = headFrame(57 * RAD, sgn * 72 * RAD, 0.2); add(1, e, 1, 1, 'spot', {kind: 2, bias: 2.5, lift: 0, fl: 0.4, side: sgn}); }
    add(1, {p: [0, -5, 18], n: [0, 0, 1], t: [0, -1, 0]}, 1, 1, 'spot', {kind: 3, bias: 4, lift: 0, fl: 0, two: 1});     // the beak, drawn as one smooth piece
    for (const f of list) if (f.bone === 1 || f.bone === 2) { f.x *= HS; f.y *= HS; f.z *= HS; f.w *= HS; f.l *= HS; }
    S = list; NS = S.length; order = new Uint16Array(NS); depth = new Float32Array(NS); scr = new Float32Array(NS * 8); lens = new Float32Array(NS); wids = new Float32Array(NS);
  }

  // ----- pose: a set of springs, so every change of mind turns into a smooth movement -----
  const ch = {};
  const sp = (n, w, z, x) => { ch[n] = {x: x || 0, v: 0, t: x || 0, w, z}; };
  sp('perch', 9, 0.9); sp('byaw', 5.5, 0.9, -18); sp('bpitch', 8, 0.72); sp('broll', 8, 0.7); sp('by', 12, 0.65);
  sp('hyaw', 21, 0.78); sp('hpitch', 21, 0.78); sp('hroll', 17, 0.72); sp('hx', 15, 0.75); sp('hy', 15, 0.7); sp('hz', 14, 0.8);
  sp('jaw', 42, 1); sp('lid', 55, 1, 1); sp('fluff', 3.2, 1, 1); sp('ruffle', 9, 1); sp('throat', 30, 0.9);
  sp('tpitch', 10, 0.42); sp('tyaw', 10, 0.4); sp('tfan', 8, 0.8); sp('wingR', 6.5, 0.85); sp('wingL', 6.5, 0.85); sp('spR', 5.2, 0.88); sp('spL', 5.2, 0.88); sp('dim', 1.4, 1, 1); sp('angle', 5, 1);
  let held = false, T = 0, asleep = true, getEnv = () => 0, lively = 1, branchAngle = 0;
  const TOUCH_YAW = 85, TOUCH_PITCH = 40;
  const gaze = {yaw: 0, pitch: 0, roll: 0}; let baseYaw = -18, nextLook = 0, looks = 0, stillUntil = 0, sleekUntil = 0, nextBlink = 2, blinkUntil = 0, nextIdle = 4, fluffHold = 0, fluffHoldUntil = 0, act = null, queue = [], sleepSide = 1, breath = 0, lastAct = '';
  const feet = [{u: -11, from: 0, to: 0, p: 1, lift: 0}, {u: 11, from: 0, to: 0, p: 1, lift: 0}];
  let roam = 34;                                                // how far along the branch the bird may wander

  function look(big) {
    const wide = big || rnd() < 0.3;
    gaze.yaw = clamp((rnd() < 0.3 ? 0 : baseYaw * 0.5) + rr(-1, 1) * (wide ? 80 : 34), -88, 88);
    gaze.pitch = rr(-14, 16) + (rnd() < 0.12 ? rr(14, 28) : 0); gaze.roll = rnd() < 0.35 ? rr(-22, 22) : rr(-6, 6);
    if (Math.abs(gaze.yaw - baseYaw) > 50) baseYaw = clamp(lerp(baseYaw, gaze.yaw, 0.55), -42, 42);
    looks = looks > 0 ? looks - 1 : (rnd() < 0.4 ? 1 + Math.floor(rnd() * 2) : 0);     // birds often look in quick twos and threes
    nextLook = T + (looks > 0 ? rr(0.22, 0.5) : rr(0.6, 2.6) / lively);
  }
  const envl = (p, a, b) => Math.min(sstep(0, a, p), 1 - sstep(1 - b, 1, p));
  const ACTS = {
    shuffle: {make() { const dir = ch.perch.t > roam * 0.5 ? -1 : ch.perch.t < -roam * 0.5 ? 1 : (rnd() < 0.5 ? -1 : 1), steps = 2 + Math.floor(rnd() * 4); return {dur: steps * 0.36, steps, dir, from: ch.perch.t, len: rr(5.5, 7.5)}; },
      run(a, p, o) { const q = p * a.steps, i = Math.floor(q), f = q - i; o.perch = clamp(a.from + a.dir * a.len * (i + ease(f)), -roam, roam); o.broll -= a.dir * 2.6 * Math.sin(PI * f); o.by += 1.1 * Math.sin(PI * f); o.hyawW = a.dir * 28; } },
    bob: {make(e) { const en = clamp(e || 0.5, 0.3, 1.3), n = 3 + Math.round(3 * en); return {dur: n * 0.25, n, e: en}; },
      run(a, p, o) { const w = Math.sin(p * 2 * PI * a.n) * envl(p, 0.12, 0.2); o.hy += w * (4 + 5.5 * a.e); o.hpitch += w * (7 + 7 * a.e); o.bpitch += w * 3.2 * a.e; o.by += Math.min(0, w) * 1.6 * a.e; o.tpitch -= w * 7 * a.e; o.sleek = 0.3; } },
    yawn: {make() { return {dur: 2.1}; },
      run(a, p, o) { const k = Math.pow(Math.sin(PI * p), 0.8); o.jaw = 1.7 * k; o.hpitch -= 15 * k; o.hy += 3 * k; o.hz += 1.5 * k; o.lid = sstep(0.4, 0.75, k); o.fluffAdd = 0.25 * k; } },
    spread: {make() { return {dur: 3.6, side: rnd() < 0.5 ? -1 : 1}; },           // the one-sided wing stretch: a wing opens down and back, the tail fans toward it
      run(a, p, o) { const k = envl(p, 0.3, 0.3), s = a.side; o[s > 0 ? 'spR' : 'spL'] = k * (0.94 + 0.06 * Math.sin(p * 40)); o.broll += s * 5 * k; o.byaw = lerp(o.byaw, -s * 22, k); o.by += 1.2 * k; o.tfan = k; o.tyaw += s * 16 * k; o.hpitch += 6 * k; o.hyawW = s * 30; o.lidAdd = 0.3 * k; } },
    stretch: {make() { return {dur: 3.3, side: rnd() < 0.5 ? -1 : 1}; },
      run(a, p, o) { const k = envl(p, 0.3, 0.3), s = a.side; o[s > 0 ? 'wingR' : 'wingL'] = 0.16 * k; o.broll += s * 8 * k; o.byaw -= s * 12 * k; o.bpitch -= 4 * k; o.by += 2.2 * k; o.tfan = k; o.tyaw += s * 15 * k; o.hpitch -= 8 * k; o.hy += 3.5 * k; o.sleek = 0.35 * k; o.hyawW = -s * 22; o.lidAdd = 0.35 * k; } },
    shake: {make() { return {dur: 2.1}; },
      run(a, p, o) { const t = p * a.dur, e = envl(p, 0.2, 0.42), sh = sstep(0.5, 0.75, t) * (1 - sstep(1.15, 1.5, t)), os = Math.sin(t * 2 * PI * 8.5) * sh;
        o.fluffAdd = e * 0.9; o.broll += 5 * os; o.byaw += 4 * Math.cos(t * 2 * PI * 8.5) * sh; o.hroll -= 10 * Math.sin(t * 2 * PI * 8.5 - 0.9) * sh; o.hyaw += 8 * Math.sin(t * 2 * PI * 8.5 - 1.6) * sh; o.ruffle = Math.max(sh, e * 0.3); o.lid = sh > 0.3 ? 0.8 : 0; o.tfan = sh * 0.5; o.wingR = o.wingL = sh * 0.1; },
      end() { fluffHold = 0.4; fluffHoldUntil = T + rr(3, 7); queue.push(['tailwag']); } },
    tailwag: {make() { return {dur: 0.75}; },
      run(a, p, o) { const w = Math.sin(p * a.dur * 2 * PI * 6.5) * envl(p, 0.15, 0.35); o.tyaw += 17 * w; o.byaw -= 1.5 * w; } },
    preen: {make() { const chest = rnd() < 0.35; return {dur: rr(2.6, 4.4), side: rnd() < 0.5 ? -1 : 1, chest}; },
      run(a, p, o) { const e = envl(p, 0.2, 0.22), t = p * a.dur, nb = Math.sin(t * 2 * PI * 5.5) * (0.5 + 0.5 * Math.sin(t * 2 * PI * 0.8)), s = a.side;
        o.hold = e; o.hyawL = a.chest ? s * 20 : s * 122; o.hpitchL = (a.chest ? 60 : 30) + 5 * nb; o.hrollL = a.chest ? s * 6 : -s * 16; o.hy -= (a.chest ? 7 : 4) * e; o.hx += s * (a.chest ? 0 : 3) * e; o.hyaw += 4 * nb * e;
        o.jaw = 0.22 * (0.5 + 0.5 * nb) * e; o.lidAdd = 0.4 * e; o.fluffAdd = 0.3 * e; if (!a.chest) { o.byaw -= s * 8 * e; o[s > 0 ? 'wingR' : 'wingL'] = 0.14 * e; } } },
    peer: {make() { return {dur: 2.2, side: rnd() < 0.5 ? -1 : 1}; },
      run(a, p, o) { const e = envl(p, 0.2, 0.3); o.bpitch += 11 * e; o.hz += 5 * e; o.hold = e; o.hyawL = -ch.byaw.x; o.hpitchL = -4; o.hrollL = a.side * 24; o.sleek = 0.4 * e; o.by += 1.5 * e; } },
    turn: {make() { baseYaw = (baseYaw > 0 ? -1 : 1) * rr(14, 40); gaze.yaw = baseYaw * 1.3; return {dur: 0.7}; },
      run(a, p, o) { o.by += 2.2 * Math.sin(PI * p); } }
  };
  function start(name, arg) { const A = ACTS[name]; if (!A) return; if (act && ACTS[act.name].end) ACTS[act.name].end(act); act = Object.assign({name, t0: T}, A.make(arg)); lastAct = name; }
  const IDLE = [['shuffle', 3], ['preen', 3], ['peer', 2], ['turn', 1.6], ['tailwag', 1.5], ['shake', 1.1], ['stretch', 1], ['bob', 1], ['yawn', 0.7]];
  function pickIdle() { let tot = 0; for (const [n, w] of IDLE) if (n !== lastAct) tot += w; let x = rnd() * tot; for (const [n, w] of IDLE) if (n !== lastAct && (x -= w) <= 0) return n; return 'shuffle'; }

  function update(dt) {
    T += dt;
    const env = Math.min(1, getEnv() * 1.3), speaking = env > 0.06, L = lively, c = ch;
    if (!asleep && !held && T > nextLook && T > stillUntil && !(act && act.name === 'preen')) look(false);
    if (!asleep && !held && !act && queue.length) start(...queue.shift());
    if (!asleep && !held && !act && !speaking && T > nextIdle && T > stillUntil) { start(pickIdle()); }
    const rate = asleep ? 5 : 8.2; breath = Math.sin(T * rate) * (asleep ? 1.25 : 1);
    // what the bird would do left alone: breathe, shift its weight, keep its head busy
    const o = {perch: c.perch.t, byaw: baseYaw + 3.5 * noise(T * 0.31, 1) * L, bpitch: 1.6 * noise(T * 0.4, 2) * L, broll: 1.5 * noise(T * 0.27, 3) * L, by: 0.5 * noise(T * 0.5, 4) + 0.25 * breath,
      hyaw: 1.4 * noise(T * 1.5, 5), hpitch: 1.3 * noise(T * 1.2, 6) - 0.5 * breath, hroll: 1.6 * noise(T * 0.8, 7), hx: 0, hy: 0.35 * breath, hz: 0, jaw: 0, lid: 0, lidAdd: 0, fluffAdd: 0, sleek: 0, ruffle: 0, throat: 0,
      tpitch: 1.6 * breath + 1.5 * noise(T * 0.6, 8), tyaw: 2.5 * noise(T * 0.45, 9) * L, tfan: 0, wingR: 0, wingL: 0, spR: 0, spL: 0, hold: 0, hyawL: 0, hpitchL: 0, hrollL: 0, hyawW: null};
    if (act) { const p = (T - act.t0) / act.dur; if (p >= 1) { const A = ACTS[act.name]; act = null; if (A.end) A.end(); nextIdle = T + rr(1.8, 6) / L; } else ACTS[act.name].run(act, p, o); }
    // the head keeps its own line of sight while the body moves under it, as a real bird's does
    let gy = gaze.yaw; if (o.hyawW != null && T > stillUntil) gy = lerp(gy, o.hyawW, 0.5);
    let hyaw = clamp(gy - c.byaw.x, -128, 128) + o.hyaw, hpitch = gaze.pitch - 0.8 * c.bpitch.x + o.hpitch, hroll = gaze.roll - 0.8 * c.broll.x + o.hroll;
    if (o.hold) { hyaw = lerp(hyaw, o.hyawL + o.hyaw, o.hold); hpitch = lerp(hpitch, o.hpitchL, o.hold); hroll = lerp(hroll, o.hrollL, o.hold); }
    let fluff = spec.fluff + o.fluffAdd + (T < fluffHoldUntil ? fluffHold : 0) - (T < sleekUntil ? 0.3 : 0) - o.sleek, lid = Math.max(o.lid, T < blinkUntil ? 1 : 0, o.lidAdd);
    if (speaking) { o.jaw = Math.max(o.jaw, env * 0.75); hpitch -= 7 * env; o.hy += 1.6 * env; o.by -= 0.8 * env; o.tpitch += 6 * env; o.throat = env; }
    if (asleep) { hyaw = sleepSide * 124; hpitch = 16; hroll = -sleepSide * 6; o.hy = -5 + 0.5 * breath; o.hx = sleepSide * 2; o.by = -2.4 + 0.3 * breath; fluff = Math.max(fluff, 0.95); lid = 1; o.byaw = baseYaw; o.jaw = 0; o.tpitch = 2.2 * breath; o.tyaw = 0; }
    if (!asleep && T > nextBlink) { blinkUntil = T + 0.11; nextBlink = T + (rnd() < 0.2 ? 0.3 : rr(1.6, 5.5)); }
    const set = {perch: o.perch, byaw: o.byaw, bpitch: o.bpitch, broll: o.broll + branchAngle * 0.12, by: o.by, hyaw, hpitch, hroll, hx: o.hx, hy: o.hy, hz: o.hz, jaw: o.jaw, lid, fluff, ruffle: o.ruffle, throat: o.throat,
      tpitch: o.tpitch - 0.5 * c.bpitch.x, tyaw: o.tyaw - 0.09 * c.byaw.v - 0.25 * c.perch.v, tfan: o.tfan, wingR: o.wingR, wingL: o.wingL, spR: o.spR, spL: o.spL, dim: asleep ? 1 : 0, angle: branchAngle};
    const slow = asleep ? 0.33 : 1, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (const k in c) { const s = c[k], w = s.w * (k === 'dim' || k === 'angle' || k === 'lid' ? 1 : slow); s.t = set[k]; for (let i = 0; i < n; i++) { s.v += (w * w * (s.t - s.x) - 2 * s.z * w * s.v) * h; s.x += s.v * h; } }
    // feet: each one steps on its own when the body has moved far enough away from it
    const half = 11 * spec.size * Math.max(0.62, Math.cos(c.byaw.x * RAD));
    let worst = -1, we = 2.6; const moving = feet[0].p < 1 || feet[1].p < 1;
    for (let i = 0; i < 2; i++) { const f = feet[i], rest = c.perch.x + (i ? half : -half) + c.perch.v * 0.1; if (f.p < 1) { f.p = Math.min(1, f.p + dt / 0.15); f.u = lerp(f.from, f.to, ease(f.p)); f.lift = Math.sin(PI * f.p); } else { f.lift = 0; const e = Math.abs(rest - f.u) + (Math.sign(c.perch.v) === (i ? 1 : -1) ? 0.4 : 0); if (e > we) { we = e; worst = i; } } }
    if (worst >= 0 && !moving) { const f = feet[worst], rest = c.perch.x + (worst ? half : -half) + c.perch.v * 0.16; f.from = f.u; f.to = rest; f.p = 0; c.by.v -= 9; c.tpitch.v += 30; }
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
  function child(bone, local, piv, off) {                       // a part that turns about a point on its parent (the body)
    const b = M[0], q = M[bone], lp = app(local, piv), tl = [piv[0] + off[0] - lp[0], piv[1] + off[1] - lp[1], piv[2] + off[2] - lp[2]], w = app(b.m, tl), s = spec.size;
    mul(b.m, local, q.m); q.t[0] = b.t[0] + s * w[0]; q.t[1] = b.t[1] + s * w[1]; q.t[2] = b.t[2] + s * w[2];
  }
  function pose() {
    const c = ch, s = spec.size, an = c.angle.x * RAD;
    O[0] = c.perch.x * Math.cos(an); O[1] = c.perch.x * Math.sin(an) + (c.by.x + 0.5) * s; O[2] = 0;
    rot(c.byaw.x, c.bpitch.x, c.broll.x, M[0].m); M[0].t.set(O);
    const hoff = [c.hx.x, c.hy.x, c.hz.x], hl = rot(c.hyaw.x, c.hpitch.x, c.hroll.x, tmpA);
    // head: turns about a point low in the skull; the upper beak lifts a touch when the mouth opens
    const hp = [HC[0] + HPIV[0], HC[1] + HPIV[1], HC[2] + HPIV[2]];
    child(1, hl, hp, hoff); const hm = M[1], hcW = app(hm.m, HC); hm.t[0] += s * hcW[0]; hm.t[1] += s * hcW[1]; hm.t[2] += s * hcW[2];   // head feathers are stored relative to the head's centre
    // jaw: hangs from a hinge behind the beak
    const jl = rot(0, c.jaw.x * 21, 0, tmpB), hinge = [0, -8.6 * HS, 11 * HS], jh = app(jl, hinge), jt = [hinge[0] - jh[0], hinge[1] - jh[1], hinge[2] - jh[2]], jw = app(hm.m, jt);
    mul(hm.m, jl, M[2].m); M[2].t[0] = hm.t[0] + s * jw[0]; M[2].t[1] = hm.t[1] + s * jw[1]; M[2].t[2] = hm.t[2] + s * jw[2];
    child(3, rot(c.hyaw.x * 0.45, c.hpitch.x * 0.3, c.hroll.x * 0.45, tmpB), [0, 84, 9.5], [hoff[0] * 0.65, hoff[1] * 0.65, hoff[2] * 0.65]);
    child(4, rot(c.tyaw.x, -c.tpitch.x, 0, tmpB), [0, 6, -30], [0, 0, 0]);
    child(5, rot(26 * c.wingR.x, 0, 40 * c.wingR.x, tmpB), [15, 76, 0], [0, 0, 0]);
    child(6, rot(-26 * c.wingL.x, 0, -40 * c.wingL.x, tmpB), [-15, 76, 0], [0, 0, 0]);
  }
  const LX = -0.58, LY = 0.72, LZ = 0.38;
  function project() {
    const c = ch, s = spec.size, fluff = c.fluff.x, ruf = c.ruffle.x, thr = c.throat.x, jawOpen = c.jaw.x, fanT = c.tfan.x, wR = c.wingR.x, wL = c.wingL.x, spR = c.spR.x, spL = c.spL.x;
    let n = 0;
    for (let i = 0; i < NS; i++) {
      const f = S[i], b = M[f.bone], m = b.m;
      if (f.mouth && jawOpen < 0.08) continue;
      let lift = f.lift + f.fl * (0.3 * fluff + ruf * 0.55 * (0.5 + 0.5 * Math.sin(T * 31 + f.ph * 3))) + 0.02 * Math.sin(T * 1.7 + f.ph) + (f.th ? thr * 0.22 : 0);
      const dsp = f.fl * 2.6 * fluff + f.br * 1.0 * breath + (f.th ? thr * 1.1 : 0);
      let tx = f.tx, ty = f.ty, tz = f.tz;
      if (f.fan) { const a = f.fan * (f.bone === 4 ? 0.05 * fanT + 0.004 * breath : 0.075 * (f.bone === 5 ? wR : wL)); tx += a; }
      let fnx = f.nx, fny = f.ny, fnz = f.nz, px, py, pz, len = f.l, wid = f.w;
      const w = f.sp ? ease(clamp(f.bone === 5 ? spR : spL, 0, 1)) : 0;
      if (w > 0.002) {                                           // wing feathers slide from their folded place to their open one
        const u = 1 - w; fnx = fnx * u + f.snx * w; fny = fny * u + f.sny * w; fnz = fnz * u + f.snz * w; const nl = Math.hypot(fnx, fny, fnz) || 1; fnx /= nl; fny /= nl; fnz /= nl;
        tx = tx * u + f.stx * w; ty = ty * u + f.sty * w; tz = tz * u + f.stz * w; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
        px = (f.x + f.nx * dsp) * u + f.sx * w; py = (f.y + f.ny * dsp) * u + f.sy * w; pz = (f.z + f.nz * dsp) * u + f.sz * w; if (f.sl) len = f.l * u + f.sl * w; lift *= u; wid = f.sw ? f.w * u + f.sw * w : f.w;
      } else { px = f.x + f.nx * dsp; py = f.y + f.ny * dsp + (f.up ? jawOpen * 0.5 : 0); pz = f.z + f.nz * dsp; }
      const cl = Math.cos(lift), sl = Math.sin(lift); tx = tx * cl + fnx * sl; ty = ty * cl + fny * sl; tz = tz * cl + fnz * sl;
      const nz = m[6] * fnx + m[7] * fny + m[8] * fnz, both = f.two || w > 0.15;
      if (!both && nz < -0.32) continue;
      const nx = m[0] * fnx + m[1] * fny + m[2] * fnz, ny = m[3] * fnx + m[4] * fny + m[5] * fnz;
      const X = b.t[0] + s * (m[0] * px + m[1] * py + m[2] * pz), Y = b.t[1] + s * (m[3] * px + m[4] * py + m[5] * pz), Z = b.t[2] + s * (m[6] * px + m[7] * py + m[8] * pz);
      const TX = m[0] * tx + m[1] * ty + m[2] * tz, TY = m[3] * tx + m[4] * ty + m[5] * tz, TZ = m[6] * tx + m[7] * ty + m[8] * tz;
      let BX = ny * TZ - nz * TY, BY = nz * TX - nx * TZ;         // across the feather
      const o8 = i * 8; scr[o8] = X; scr[o8 + 1] = Y; scr[o8 + 2] = TX; scr[o8 + 3] = TY; scr[o8 + 4] = BX; scr[o8 + 5] = BY;
      let lit = 0.5 + 0.5 * (nx * LX + ny * LY + (both ? Math.abs(nz) : nz) * LZ); lit = Math.pow(lit, 1.25) * f.ao * 1.12 * (1 + 0.1 * Math.min(0, ny));
      scr[o8 + 6] = lit; scr[o8 + 7] = nz; lens[i] = len; wids[i] = wid;
      depth[i] = Z + f.bias * s; order[n++] = i;
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
        const tl = Math.hypot(tx, ty), bl = Math.hypot(bx, by), mt = f.two ? 0.12 : 0.42, mb = f.two ? 0.5 : 0.55;
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
    const a = sstep(0.04, 0.22, nz), s = spec.size * sc, R = 3.05 * HS * s, m = M[1].m, lid = clamp(ch.lid.x, 0, 1);
    // the eye's own "up" and "forward" on the head, as they fall on the screen
    let ux = m[1], uy = m[4], fx = m[2] * 0.8 - m[0] * f.side * 0.6, fy = m[5] * 0.8 - m[3] * f.side * 0.6;
    const fl = Math.max(0.3, Math.hypot(fx, fy)), ul = Math.max(0.5, Math.hypot(ux, uy)); if (Math.hypot(fx, fy) < 0.3) { fx = 0.3; fy = 0; } if (Math.hypot(ux, uy) < 0.5) { ux = 0; uy = 0.5; }
    g.setTransform(fx * R, -fy * R, -ux * R, uy * R, X, Y); g.globalAlpha = a;      // local y points down the head
    const face = palette.face, skin = shade(mixc(face, [122, 112, 118], 0.5), 0.56);
    let gr = g.createRadialGradient(0, 0, 0.6, 0, 0, 1.55); gr.addColorStop(0, css(skin, 0.8)); gr.addColorStop(0.72, css(skin, 0.5)); gr.addColorStop(1, css(skin, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1.55, 0, 7); g.fill();
    gr = g.createRadialGradient(0, 0.05, 0, 0, 0, 1); gr.addColorStop(0, '#050404'); gr.addColorStop(0.44, '#0b0808'); gr.addColorStop(0.62, '#3e2b20'); gr.addColorStop(0.78, '#4c3526'); gr.addColorStop(0.88, 'rgba(52,38,32,.85)'); gr.addColorStop(1, 'rgba(52,38,32,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
    if (lid > 0.02) {                                            // the lower lid rises, as a bird's does
      const lc = shade(mixc(face, [186, 180, 184], 0.22), 0.58), yTop = 1.45 - 2.9 * lid;
      g.save(); g.beginPath(); g.rect(-2, yTop, 4, 4); g.clip();
      gr = g.createRadialGradient(0, 0, 0.95, 0, 0, 1.6); gr.addColorStop(0, css(lc, 1)); gr.addColorStop(1, css(lc, 0)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1.6, 0, 7); g.fill(); g.restore();
      g.strokeStyle = 'rgba(60,50,48,' + (0.5 * Math.min(1, lid * 1.5)).toFixed(3) + ')'; g.lineWidth = 0.16; g.lineCap = 'round'; g.beginPath(); g.moveTo(-0.85, yTop + 0.1); g.quadraticCurveTo(0, yTop - 0.28 * (1 - lid) + 0.25 * lid, 0.85, yTop + 0.1); g.stroke();
    }
    if (lid < 0.7) {                                             // one small soft glint, always on the side the light comes from
      g.setTransform(1, 0, 0, 1, X - R * 0.26 * fl, Y - R * 0.34); g.globalAlpha = a * (1 - lid / 0.7) * 0.85;
      const r = R * 0.27; gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }
  // The beak, cere and lower mandible are small smooth meshes rather than feathers, so they keep a clean edge and a soft shine.
  const MESH = (() => {
    const out = [], bz = (u, a, b, c) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * b + u * u * c;
    function grid(bone, col, nu, nv, fn) { const v = []; for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) v.push(fn(i / nu, j / nv)); out.push({bone, col, nu, nv, v, w: new Float32Array(v.length * 4)}); }
    grid(1, [226, 200, 92], 16, 14, (u, q) => {                 // upper mandible: hooked, wide under the cere, coming to a point
      const cy = bz(u, -1.4, -3, -15.6), cz = bz(u, 16.2, 26.6, 19), T = norm([0, bz(u + 0.01, -1.4, -3, -15.6) - cy, bz(u + 0.01, 16.2, 26.6, 19) - cz]), N = [0, T[2], -T[1]];
      const w = 5.9 * Math.pow(1 - u, 0.6) + 0.05, d = 3.5 * Math.pow(1 - u, 0.6) + 0.05, al = (-118 + 236 * q) * RAD, sa = Math.sin(al), ca = Math.cos(al);
      return [w * sa, cy + N[1] * d * ca, cz + N[2] * d * ca, ...norm([sa / w, N[1] * ca / d + T[1] * 0.3 * u, N[2] * ca / d + T[2] * 0.3 * u])];
    });
    grid(2, [190, 166, 94], 6, 10, (u, q) => {                   // lower mandible: a small cup tucked under the hook
      const la = (-88 + 100 * u) * RAD, lo = (-110 + 220 * q) * RAD, d = [Math.sin(lo) * Math.cos(la), Math.sin(la), Math.cos(lo) * Math.cos(la)];
      return [d[0] * 3.5, -11 + d[1] * 2.6, 14.4 + d[2] * 2.7, ...norm([d[0] / 3.3, d[1] / 2.4, d[2] / 2.7])];
    });
    for (const sg of [1, -1]) grid(1, null, 9, 12, (u, q) => {    // cere: two soft lobes over the nostrils
      const la = (-70 + 160 * u) * RAD, lo = (-100 + 200 * q) * RAD, d = [Math.sin(lo) * Math.cos(la), Math.sin(la), Math.cos(lo) * Math.cos(la)];
      return [sg * 3 + d[0] * 3.9, 0.9 + d[1] * 2.7, 16.8 + d[2] * 2.9, ...norm([d[0] / 3.6, d[1] / 2.5, d[2] / 2.6])];
    });
    return out;
  })();
  const quads = [];
  function drawBeak() {
    const s = spec.size, ss = s * sc, HX = LX, HY = LY, HZ = LZ + 1, hl = Math.hypot(HX, HY, HZ), cere = hex(spec.cere);
    quads.length = 0;
    for (const ms of MESH) {
      const b = M[ms.bone], m = b.m, w = ms.w, col = ms.col || cere, lift = ms.bone === 1 && ms.col ? ch.jaw.x * 0.5 : 0;
      for (let i = 0; i < ms.v.length; i++) { const v = ms.v[i], x = v[0] * HS, y = v[1] * HS + lift, z = v[2] * HS;
        w[i * 4] = cx + (b.t[0] + s * (m[0] * x + m[1] * y + m[2] * z)) * sc; w[i * 4 + 1] = cy - (b.t[1] + s * (m[3] * x + m[4] * y + m[5] * z)) * sc; w[i * 4 + 2] = m[6] * x + m[7] * y + m[8] * z;
        const nx = m[0] * v[3] + m[1] * v[4] + m[2] * v[5], ny = m[3] * v[3] + m[4] * v[4] + m[5] * v[5], nz = m[6] * v[3] + m[7] * v[4] + m[8] * v[5];
        w[i * 4 + 3] = nz < -0.15 ? -1 : Math.pow(0.5 + 0.5 * (nx * LX + ny * LY + nz * LZ), 0.9) + 2 * Math.floor(100 * Math.pow(Math.max(0, (nx * HX + ny * HY + nz * HZ) / hl), 26)); }
      const W = ms.nv + 1;
      for (let i = 0; i < ms.nu; i++) for (let j = 0; j < ms.nv; j++) {
        const a = i * W + j, bq = a + 1, c = a + W + 1, d = a + W, la = w[a * 4 + 3], lb = w[bq * 4 + 3], lc = w[c * 4 + 3], ld = w[d * 4 + 3];
        if (la < 0 && lb < 0 && lc < 0 && ld < 0) continue;
        const dec = x => x < 0 ? [0.3, 0] : [x % 2, Math.floor(x / 2) / 100], A = dec(la), Bq = dec(lb), C = dec(lc), D = dec(ld), lit = (A[0] + Bq[0] + C[0] + D[0]) / 4, spc = (A[1] + Bq[1] + C[1] + D[1]) / 4;
        const tipk = ms.bone === 1 && ms.col ? i / ms.nu : 0, cc = mixc(shade(mixc(col, [150, 140, 110], tipk * tipk * 0.35), 0.06 + 0.8 * lit), [255, 252, 236], spc * 0.5);
        quads.push({z: (w[a * 4 + 2] + w[c * 4 + 2]) / 2, a, b: bq, c, d, w, col: css(cc)});
      }
    }
    quads.sort((p, q) => p.z - q.z);
    g.setTransform(1, 0, 0, 1, 0, 0); g.lineJoin = 'round';
    if (ch.jaw.x > 0.05) {                                       // the dark of the open mouth, between the two halves
      const m = M[1].m, t = M[1].t, j = M[2], p0 = [0, -11.8 * HS, 16.6 * HS], q0 = [0, -12.2 * HS, 16.8 * HS];
      const ax = cx + (t[0] + s * (m[0] * p0[0] + m[1] * p0[1] + m[2] * p0[2])) * sc, ay = cy - (t[1] + s * (m[3] * p0[0] + m[4] * p0[1] + m[5] * p0[2])) * sc, bx = cx + (j.t[0] + s * (j.m[0] * q0[0] + j.m[1] * q0[1] + j.m[2] * q0[2])) * sc, by = cy - (j.t[1] + s * (j.m[3] * q0[0] + j.m[4] * q0[1] + j.m[5] * q0[2])) * sc;
      g.strokeStyle = 'rgba(52,26,28,' + clamp(ch.jaw.x * 2.5, 0, 0.95).toFixed(3) + ')'; g.lineCap = 'round'; g.lineWidth = 3 * HS * ss; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    g.lineWidth = Math.max(0.7, 0.2 * ss);
    for (const q of quads) { const w = q.w; g.fillStyle = g.strokeStyle = q.col; g.beginPath(); g.moveTo(w[q.a * 4], w[q.a * 4 + 1]); g.lineTo(w[q.b * 4], w[q.b * 4 + 1]); g.lineTo(w[q.c * 4], w[q.c * 4 + 1]); g.lineTo(w[q.d * 4], w[q.d * 4 + 1]); g.closePath(); g.fill(); g.stroke(); }
    for (const sg of [1, -1]) {                                  // nostrils
      const m = M[1].m, t = M[1].t, p = [sg * 3.1 * HS, 1.2 * HS, 19.65 * HS], nz = m[6] * sg * 0.25 + m[7] * 0.1 + m[8] * 0.96; if (nz < 0.25) continue;
      const X = cx + (t[0] + s * (m[0] * p[0] + m[1] * p[1] + m[2] * p[2])) * sc, Y = cy - (t[1] + s * (m[3] * p[0] + m[4] * p[1] + m[5] * p[2])) * sc, r = 0.5 * HS * ss;
      const gr = g.createRadialGradient(X, Y, 0, X, Y, r); gr.addColorStop(0, 'rgba(46,28,24,' + (0.75 * nz).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(46,28,24,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, r, 0, 7); g.fill();
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
  function paintBg() {
    const c0 = document.createElement('canvas'); c0.width = 120; c0.height = 120; const c = c0.getContext('2d'), r = rng(5);
    let gr = c.createLinearGradient(0, 0, 80, 120); gr.addColorStop(0, '#c4dcb2'); gr.addColorStop(0.5, '#93bd95'); gr.addColorStop(1, '#5e8f7c'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120);
    const cols = ['210,232,170', '120,172,120', '70,128,104', '238,236,180', '96,150,132', '160,204,150'];
    for (let i = 0; i < 46; i++) { const x = r() * 120, y = r() * 120, a = 8 + r() * 26; gr = c.createRadialGradient(x, y, 0, x, y, a); const col = cols[Math.floor(r() * cols.length)]; gr.addColorStop(0, 'rgba(' + col + ',' + (0.2 + r() * 0.3) + ')'); gr.addColorStop(0.6, 'rgba(' + col + ',.12)'); gr.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120); }
    gr = c.createRadialGradient(34, 26, 0, 34, 26, 70); gr.addColorStop(0, 'rgba(255,250,214,.42)'); gr.addColorStop(1, 'rgba(255,250,214,0)'); c.fillStyle = gr; c.fillRect(0, 0, 120, 120);
    bgC = c0;
  }
  const FOOT = ['#cfa9a6', '#ead0cb', '#96706e', '#5e4f4c'];
  function footPt(i) { const an = ch.angle.x * RAD, f = feet[i], s = spec.size; return [f.u * Math.cos(an), f.u * Math.sin(an) + f.lift * 3.2 * s]; }
  function drawLegs() {                                         // only a short length of leg shows below the belly feathers, angled out to the foot
    const s = spec.size, m = M[0];
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1, a = [sd * 5, 13, 3], F = footPt(i);
      const ax = cx + (m.t[0] + s * (m.m[0] * a[0] + m.m[1] * a[1] + m.m[2] * a[2])) * sc, ay = cy - (m.t[1] + s * (m.m[3] * a[0] + m.m[4] * a[1] + m.m[5] * a[2])) * sc, fx = cx + F[0] * sc, fy = cy - (F[1] + 1.2 * s) * sc;
      g.setTransform(1, 0, 0, 1, 0, 0); g.lineCap = 'round';
      for (const [w, col, dx] of [[3.3, FOOT[2], 0.25], [2.7, FOOT[0], 0], [1, FOOT[1], -0.5]]) { g.strokeStyle = col; g.lineWidth = w * s * sc; g.beginPath(); g.moveTo(ax + dx * s * sc, ay); g.quadraticCurveTo((ax + fx) / 2 + sd * 0.8 * s * sc + dx * s * sc, (ay + fy) / 2, fx + dx * s * sc, fy); g.stroke(); }
    }
  }
  function toe(x0, y0, ang, len, curl, w) {                    // one toe: three padded joints bending over the round of the branch, then a claw
    const dx = Math.sin(ang), dy = Math.cos(ang); let x = x0, y = y0;
    const segs = [[0.4, 1], [0.34, 0.9], [0.26, 0.78]];
    g.fillStyle = 'rgba(30,18,14,.26)'; g.beginPath(); g.ellipse(x0 + dx * len * 0.5 + 0.7, y0 + dy * len * 0.5 + 0.8, w * 0.62, len * 0.56, -ang, 0, 7); g.fill();
    for (let k = 0; k < 3; k++) {
      const L = len * segs[k][0] * (k === 2 ? 0.75 * curl : 1), ww = w * segs[k][1], mx = x + dx * L / 2, my = y + dy * L / 2;
      const gr = g.createRadialGradient(mx - ww * 0.25, my - L * 0.15, 0, mx, my, Math.max(ww, L) * 0.75); gr.addColorStop(0, FOOT[1]); gr.addColorStop(0.55, FOOT[0]); gr.addColorStop(1, FOOT[2]);
      g.fillStyle = gr; g.beginPath(); g.ellipse(mx, my, ww * 0.54, L * 0.9, -ang, 0, 7); g.fill();
      x += dx * L; y += dy * L;
    }
    const nx = dy, ny = -dx, c = 2 * curl;                    // claw: a short dark hook curling under
    g.fillStyle = FOOT[3]; g.beginPath(); g.moveTo(x - nx * 0.5 - dx * 0.5, y - ny * 0.5 - dy * 0.5); g.quadraticCurveTo(x + dx * c * 0.6 - nx * 0.35, y + dy * c * 0.6 - ny * 0.35, x + dx * c - nx * 0.2 * Math.sign(ang || 1), y + dy * c); g.quadraticCurveTo(x + dx * c * 0.5 + nx * 0.45, y + dy * c * 0.5 + ny * 0.45, x + nx * 0.5 - dx * 0.5, y + ny * 0.5 - dy * 0.5); g.fill();
  }
  function drawToes() {                                         // the front pair of toes grips over the top of the branch (the back pair is hidden behind it)
    const s = spec.size * sc, an = ch.angle.x * RAD;
    for (let i = 0; i < 2; i++) {
      const F = footPt(i), f = feet[i], curl = 1 - 0.5 * f.lift, sd = i ? 1 : -1;
      g.setTransform(Math.cos(an) * s, -Math.sin(an) * s, Math.sin(an) * s, Math.cos(an) * s, cx + F[0] * sc, cy - F[1] * sc);
      toe(-1.1 + sd * 0.4, -1, -0.3 + sd * 0.12, 12.4 * curl, curl, 2.3); toe(1.1 + sd * 0.4, -1, 0.3 + sd * 0.12, 12.4 * curl, curl, 2.3);
      const gr = g.createRadialGradient(-0.6, -1.6, 0, 0, -0.8, 3.4); gr.addColorStop(0, FOOT[1]); gr.addColorStop(0.6, FOOT[0]); gr.addColorStop(1, FOOT[2]);
      g.fillStyle = gr; g.beginPath(); g.ellipse(sd * 0.4, -1.2, 2.1, 1.7, 0, 0, 7); g.fill();     // the pad where the toes meet
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
    drawLegs(); drawItems(split, n); drawToes();
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (ch.dim.x > 0.01) { g.fillStyle = 'rgba(8,12,34,' + (0.46 * ch.dim.x).toFixed(3) + ')'; g.fillRect(0, 0, cw, ch_); }
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1) * quality, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (w && h && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    cw = cv.width; ch_ = cv.height; sc = Math.min(cw / 150, ch_ / 262); cx = cw / 2; cy = ch_ * 0.75;
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
    for (const k of ['size', 'build', 'fluff', 'tailLen', 'markAmt']) spec[k] = +spec[k];
    spec.size = clamp(spec.size, 0.8, 1.2);
    buildAtlas(); if (!NS || old.build !== spec.build || old.tailLen !== spec.tailLen || old.markAmt !== spec.markAmt) build();
  }
  return {
    PRESETS, DEFAULT,
    init(canvas, opts) { cv = canvas; g = cv.getContext('2d'); getEnv = opts.getEnv; paintBg(); paintBranch(); setSpec(opts.spec || spec); branchAngle = opts.angle || 0; ch.angle.x = ch.angle.t = branchAngle; lively = opts.lively || 1; ch.hyaw.x = 124; ch.hpitch.x = 16; ch.hy.x = -5; },
    setSpec, getSpec: () => Object.assign({}, spec),
    setAngle(a) { branchAngle = clamp(+a || 0, -30, 30); }, setLively(l) { lively = clamp(+l || 1, 0.4, 2); },
    setVisible(on) { visible = on; if (on && !raf && !manual) { last = 0; raf = requestAnimationFrame(frame); } },
    setAsleep(a) { if (a === asleep) return; asleep = a; act = null; queue = []; if (a) sleepSide = rnd() < 0.5 ? -1 : 1; else { look(true); gaze.yaw = rr(-10, 10); nextIdle = T + 1.2; queue.push(['shake']); nextBlink = T + 0.6; } },
    // the real bird called: stop, turn to face it, cock the head, pull the feathers in
    notice() { if (asleep) return; if (act && act.name !== 'bob') act = null; gaze.yaw = rr(-9, 9); gaze.pitch = rr(-7, 2); gaze.roll = (rnd() < 0.5 ? -1 : 1) * rr(9, 22); stillUntil = T + 1.1; sleekUntil = T + 1.8; nextLook = T + 1.2; nextIdle = Math.max(nextIdle, T + 1.6); ch.by.v += 14; },
    // turn the head toward a touched spot (x, y from -1 to 1 across the picture, measured from the bird's head) and perk up
    touch(x, y) { if (asleep) return; if (act && act.name !== 'bob') act = null; queue = []; gaze.yaw = clamp(x * TOUCH_YAW, -78, 78); gaze.pitch = clamp(y * TOUCH_PITCH, -24, 30); gaze.roll = (x < 0 ? -1 : 1) * rr(6, 16); stillUntil = T + 1.3; sleekUntil = T + 1.6; nextLook = T + 1.5; nextIdle = Math.max(nextIdle, T + 2); ch.by.v += 18; },
    listenUp(sec) { if (asleep) return; gaze.yaw = (rnd() < 0.5 ? -1 : 1) * rr(30, 70); gaze.pitch = rr(-12, -2); gaze.roll = rr(-18, 18); stillUntil = Math.max(stillUntil, T + Math.min(sec, 2.5)); sleekUntil = T + sec; },
    actNow(type) { if (asleep || !ACTS[type]) return false; queue = []; start(type, type === 'bob' ? 1 : undefined); nextIdle = T + 6; return true; },
    startAct(type, now, energy) { if (!asleep && ACTS[type]) { if (act) queue = [[type, energy]]; else start(type, energy); } },
    test: {
      manual(seed) { manual = true; rnd = rng(seed || 1); resize(); },
      step(dt) { resize(); update(dt); draw(); },
      get ch() { return ch; }, get act() { return act; }, get T() { return T; }, start, feet, marks() { const m = M[1]; return {head: [m.t[0], m.t[1]], body: [M[0].t[0], M[0].t[1]], beak: [m.t[0] + spec.size * (m.m[2] * 20 - m.m[1] * 8), m.t[1] + spec.size * (m.m[5] * 20 - m.m[4] * 8)], tail: [M[4].t[0] + spec.size * (M[4].m[1] * -60 + M[4].m[2] * -45), M[4].t[1] + spec.size * (M[4].m[4] * -60 + M[4].m[5] * -45)]}; },
      setGaze(y, p, r) { gaze.yaw = y; gaze.pitch = p; gaze.roll = r; held = true; queue = []; }, setBase(y) { baseYaw = y; }, free() { held = false; nextLook = T; nextIdle = T + 1; }, count: () => NS
    }
  };
})();
