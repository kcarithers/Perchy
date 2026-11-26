#!/usr/bin/env python3
"""Paints the branch, background, and tail for the portrait bird and gives them the same painted
finish as the bird layers (see sprites.py). Writes into src/media. Run: python3 tools/scene.py"""
import cv2, numpy as np, pathlib
from PIL import Image
OUT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'media'
W, H, K, UP = 660, 825, 2, 60
rng = np.random.default_rng(7)

def finish(bgr, s=22, r=0.42):
    st = cv2.stylization(bgr, sigma_s=s, sigma_r=r); ep = cv2.edgePreservingFilter(bgr, flags=1, sigma_s=30, sigma_r=0.3)
    return cv2.addWeighted(st, 0.65, ep, 0.35, 0)

def noise(h, w, fx, fy, oct=3):
    out = np.zeros((h, w), np.float32)
    for o in range(oct):
        n = rng.random((max(2, int(h / (fy / 2 ** o))), max(2, int(w / (fx / 2 ** o))))).astype(np.float32)
        out += cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC) / 2 ** o
    out -= out.min(); return out / out.max()

def rgb(hexs): hexs = hexs.lstrip('#'); return np.array([int(hexs[i:i + 2], 16) for i in (4, 2, 0)], np.float32)   # BGR

def save(bgr, alpha, name, scale=1 / K, q=88):
    im = np.dstack([bgr[:, :, ::-1], alpha]).astype(np.uint8) if alpha is not None else bgr[:, :, ::-1].astype(np.uint8)
    im = Image.fromarray(im); im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    im.save(OUT / name, quality=q, method=6) if name.endswith('.webp') else im.save(OUT / name, quality=q)

# ---------- feathers ----------
def feather_poly(length, wid, n=40, tip=0.9):
    t = np.linspace(0, 1, n); half = wid * np.sqrt(np.clip(1 - t ** 5, 0, 1)) * np.clip(t * 5, 0, 1) ** 0.6 * (1 - 0.18 * t)
    up = np.stack([t * length, -half], 1); dn = np.stack([t[::-1] * length, half[::-1] * tip], 1)
    return np.vstack([up, dn])

def paint_feather(img, alpha, origin, ang, length, wid, base, edge=None, edge_w=3.0, shaft=True):
    h, w = alpha.shape; p = feather_poly(length, wid); c, s = np.cos(ang), np.sin(ang)
    q = (p @ np.array([[c, s], [-s, c]])) + origin
    m = np.zeros((h, w), np.uint8); cv2.fillPoly(m, [np.round(q * 8).astype(np.int32)], 255, lineType=cv2.LINE_AA, shift=3)
    ys, xs = np.where(m > 0)
    if not len(ys): return
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1; sub = m[y0:y1, x0:x1]
    dt = cv2.distanceTransform((sub > 127).astype(np.uint8), cv2.DIST_L2, 3); k = np.clip(dt / max(2.0, wid * 0.55), 0, 1)
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    u = (xx - origin[0]) * c + (yy - origin[1]) * s; v = -(xx - origin[0]) * s + (yy - origin[1]) * c
    barb = 0.5 + 0.5 * np.sin((u * 0.9 + np.abs(v) * 1.6) * 1.1)                       # fine barbs sweeping back from the shaft
    tex = noise(y1 - y0, x1 - x0, 14, 14)
    shade = 0.72 + 0.3 * k + 0.07 * (barb - 0.5) + 0.12 * (tex - 0.5) - 0.12 * np.clip(u / length, 0, 1)
    col = base[None, None, :] * shade[:, :, None]
    if edge is not None:
        e = np.clip(1 - dt / edge_w, 0, 1)[:, :, None] * 0.85; col = col * (1 - e) + edge[None, None, :] * e
    if shaft:
        sh = np.exp(-(v / 1.3) ** 2)[:, :, None] * 0.35 * (u > 6)[:, :, None]; col = col * (1 - sh) + (base * 1.5 + 40)[None, None, :] * sh
    a = (sub / 255.0)[:, :, None]
    img[y0:y1, x0:x1] = img[y0:y1, x0:x1] * (1 - a) + np.clip(col, 0, 255) * a
    alpha[y0:y1, x0:x1] = np.maximum(alpha[y0:y1, x0:x1], sub)

def layer(w, h, fill): return np.full((h, w, 3), rgb(fill), np.float32), np.zeros((h, w), np.uint8)

def soft(bgr):                     # feathers get no ink line: smooth the paint and blur a touch, like the body's plumage
    return cv2.GaussianBlur(cv2.edgePreservingFilter(bgr, flags=1, sigma_s=24, sigma_r=0.28), (0, 0), 1.1)

def tail():
    w, h = 220 * K, 250 * K; img, al = layer(w, h, '#2f6f9c'); o = np.array([w / 2, 6.0]); d = np.pi / 2
    for ang, ln, wd, colr in [(0.17, 150, 17, '#3c8fba'), (-0.17, 150, 17, '#3c8fba'), (0.085, 190, 16, '#2e719f'), (-0.085, 190, 16, '#2e719f'), (0.022, 226, 13, '#255a88'), (-0.022, 230, 13, '#224f7c')]:
        paint_feather(img, al, o, d + ang, ln * K, wd * K, rgb(colr), edge=rgb('#1f466c'), edge_w=1.2 * K)
    yy = np.mgrid[0:h, 0:w][0].astype(np.float32) / h; img *= (0.62 + 0.42 * np.clip(yy * 2.2, 0, 1))[:, :, None]      # in the branch's shadow near the top
    out = cv2.resize(np.dstack([soft(np.clip(img, 0, 255).astype(np.uint8)), cv2.GaussianBlur(al, (0, 0), 2.2)]), (w // K, h // K), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / 'tail.png'), out)                        # sprites.py recolours this for each bird

# ---------- background, twig, branch ----------
def scene():
    h, w = H * K, W * K; yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); X, Y = xx / K, yy / K
    t = (Y / H)[:, :, None]; top, mid, bot = rgb('#e4edcf'), rgb('#bfd4aa'), rgb('#8fb08b')
    bg = np.where(t < 0.5, top + (mid - top) * (t / 0.5), mid + (bot - mid) * ((t - 0.5) / 0.5)).astype(np.float32)
    def blob(cx, cy, rad, col, a):
        d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2) / rad; k = np.clip(1 - d, 0, 1); k = (k * k * (3 - 2 * k) * a)[:, :, None]
        bg[:] = bg * (1 - k) + rgb(col) * k
    blob(150, 120, 520, '#fff7d2', 0.85)
    for i in range(9): blob(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(110, 220), ['#548056', '#467454', '#7aa068'][i % 3], rng.uniform(0.25, 0.45))
    for i in range(30): blob(rng.uniform(0, W), rng.uniform(0, H * 0.9), rng.uniform(16, 58), ['#ffffec', '#e2f0aa', '#aad08c', '#ffeeb4'][i % 4], rng.uniform(0.14, 0.34))
    bg += (noise(h, w, 60, 60, 4)[:, :, None] - 0.5) * 16                                   # soft brushy mottling
    yc = lambda px: 672 - UP + 0.233 * (px - 220)
    v = (Y - yc(X)) / 47.0 + 0.09 * np.sin(X * 4 * np.pi / W) + (noise(h, w, 160, 30) - 0.5) * 0.08 * np.sin(np.pi * np.clip(X / W, 0, 1))   # wobble repeats every width so copies join end to end
    v0 = v   # -1 top edge, +1 bottom edge
    bmask = (np.abs(v) < 1).astype(np.uint8) * 255
    sh = cv2.GaussianBlur(np.roll(bmask, 28 * K, axis=0), (0, 0), 9 * K)[:, :, None] / 255.0 * 0.26
    bg = bg * (1 - sh) + rgb('#283c28') * sh
    # twig with leaves, behind the branch
    tw, ta = layer(w, h, '#6f5238')
    def stroke(pts, width, col):
        p = np.array(pts, np.float32) * K; tt = np.linspace(0, 1, 60)[:, None]
        c = (1 - tt) ** 2 * p[0] + 2 * (1 - tt) * tt * p[1] + tt ** 2 * p[2]
        m = np.zeros((h, w), np.uint8); cv2.polylines(m, [np.round(c).astype(np.int32)], False, 255, int(width * K), cv2.LINE_AA)
        a = (m / 255.0)[:, :, None]; tex = 0.82 + 0.36 * noise(h, w, 40, 8)[:, :, None]
        tw[:] = tw * (1 - a) + rgb(col) * tex * a; ta[:] = np.maximum(ta, m)
    stroke([(545, 720 - UP), (585, 600 - UP), (560, 470 - UP)], 11, '#73563b'); stroke([(572, 590 - UP), (615, 560 - UP), (640, 505 - UP)], 6, '#73563b')
    def leaf(lx, ly, ang, ln):
        t2 = np.linspace(0, 1, 40); half = ln * 0.3 * np.sin(np.pi * t2 ** 0.8)
        p = np.vstack([np.stack([t2 * ln, -half], 1), np.stack([t2[::-1] * ln, half[::-1]], 1)]); c, s = np.cos(ang), np.sin(ang)
        q = (p @ np.array([[c, s], [-s, c]]) + (lx, ly - UP)) * K
        m = np.zeros((h, w), np.uint8); cv2.fillPoly(m, [np.round(q).astype(np.int32)], 255, cv2.LINE_AA)
        u = ((X - lx) * c + (Y - (ly - UP)) * s) / ln; vv = (-(X - lx) * s + (Y - (ly - UP)) * c) / (ln * 0.3)
        vein = np.exp(-(vv * 9) ** 2) * 0.35 + 0.12 * (0.5 + 0.5 * np.sin((u * 26 - np.abs(vv) * 7)))
        shade = (0.86 + 0.3 * (0.5 - vv * 0.5) * 0.6 + 0.2 * (noise(h, w, 30, 30) - 0.5) - vein * 0.5)[:, :, None]
        col = (rgb('#8fbf6a') * (1 - np.clip(vv * 0.5 + 0.5, 0, 1))[:, :, None] + rgb('#4f8a4d') * np.clip(vv * 0.5 + 0.5, 0, 1)[:, :, None]) * shade
        a = (m / 255.0)[:, :, None]; tw[:] = tw * (1 - a) + col * a; ta[:] = np.maximum(ta, m)
    for a in [(560, 474, -1.9, 92), (566, 520, -0.5, 80), (563, 548, -2.7, 74), (640, 506, -1.2, 78), (612, 548, 0.1, 62)]: leaf(*a)
    a = (cv2.GaussianBlur(ta, (0, 0), 1.6) / 255.0)[:, :, None]; bg = bg * (1 - a) + tw * a
    bgf = finish(np.clip(bg, 0, 255).astype(np.uint8), 30, 0.45)
    save(cv2.GaussianBlur(bgf, (0, 0), 0.8), None, 'bg.jpg', q=84)
    # branch: rounded lighting, bark streaks and cracks, a knot, lichen
    u = (X - 220) + (Y - (672 - UP)) * 0.233
    light = np.clip(0.98 - 0.3 * v - 0.22 * np.clip(v, 0, 1) ** 2 + 0.1 * np.exp(-((v + 0.55) / 0.25) ** 2), 0.3, 1.3)
    streak = noise(h, w, 220, 7, 4); coarse = noise(h, w, 90, 26, 3)
    crack = np.clip((streak - 0.62) * 6, 0, 1) * 0.45
    col = rgb('#a5825c')[None, None, :] * (light * (0.8 + 0.3 * streak + 0.14 * (coarse - 0.5)) * (1 - crack))[:, :, None]
    col += (rgb('#c9b08a') - rgb('#a5825c'))[None, None, :] * np.clip(-v - 0.45, 0, 1)[:, :, None] * 0.9
    kd = np.sqrt(((u + 150) / 20) ** 2 + ((v * 47 - 8) / 11) ** 2); ring = np.exp(-((kd - 1) / 0.28) ** 2)
    col = col * (1 - 0.45 * ring[:, :, None]) * (1 - 0.25 * np.clip(1 - kd, 0, 1))[:, :, None]
    for i in range(12):
        lx, ly, r1 = rng.uniform(-320, 480), rng.uniform(-0.85, 0.6), rng.uniform(5, 11)
        d = np.sqrt(((u - lx) / r1) ** 2 + ((v - ly) * 47 / (r1 * 0.65)) ** 2); k = (np.clip(1.2 - d, 0, 1) * rng.uniform(0.3, 0.55))[:, :, None]
        col = col * (1 - k) + rgb('#c4d0aa') * k
    br = finish(np.clip(col, 0, 255).astype(np.uint8), 22, 0.42)
    save(br, cv2.GaussianBlur(bmask, (0, 0), 1.3), 'branch.webp')

if __name__ == '__main__':
    scene(); tail(); print('painted', [p.name for p in sorted(OUT.iterdir())])
