#!/usr/bin/env python3
"""Cuts the portrait bird's layers (bodies, heads, beaks, feet, leg tufts, tail) for each colour into src/media/<colour>/.
Needs the two source frames f_09.png, f_02.png and their cut-outs bird_09.png, bird_02.png (not in the repo) in the
current directory, and src/media/tail.png from tools/scene.py. Run from that directory: python3 tools/sprites.py"""
import cv2, numpy as np, pathlib
from PIL import Image
MEDIA = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'media' if (pathlib.Path(__file__).resolve().parent.name == 'tools') else pathlib.Path('/home/user/perchy/src/media')
S = 0.75; CX, CY, CW, CH = 100, 480, 880, 1100      # stage crop in frame coords
HX, HY, HW, HH = 400, 715, 370, 400                  # head sprite rect

def paint(rgb):   # painterly look: flatten fine photo texture, keep the feather pattern, lift colour a little
    y0, y1, x0, x1 = 650, 1650, 250, 850; c = rgb[y0:y1, x0:x1]
    st = cv2.stylization(c, sigma_s=24, sigma_r=0.42); ep = cv2.edgePreservingFilter(c, flags=1, sigma_s=30, sigma_r=0.3)
    o = cv2.addWeighted(st, 0.65, ep, 0.35, 0)
    hsv = cv2.cvtColor(o, cv2.COLOR_BGR2HSV).astype(np.float32); hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.18, 0, 255); hsv[:, :, 2] = np.clip(hsv[:, :, 2] * 1.04 + 4, 0, 255)
    out = rgb.copy(); out[y0:y1, x0:x1] = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR); return out

def load(n, dx=0, dy=0):
    raw = cv2.imread(f'f_{n}.png'); a = np.array(Image.open(f'bird_{n}.png'))[:, :, 3]
    M = np.float32([[1, 0, dx], [0, 1, dy]]); h, w = a.shape; raw = cv2.warpAffine(raw, M, (w, h))
    return raw, paint(raw), cv2.warpAffine(a, M, (w, h))

def recolor(bgr, kind, keep=None, upto=None):
    """Blue bird to green (yellow face, black and yellow barring) or yellow (pale markings). keep: mask left untouched (beak, feet)."""
    if kind == 'blue': return bgr
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32); H, Sa, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    body = (H >= 82) & (H <= 112) & (Sa > 55) & (V > 92); cheek = (H > 112) & (H < 140) & (Sa > 60); white = (Sa < 70) & (V > 135); dark = (V < 120) & ~body
    if upto is not None: white &= upto
    if kind == 'green':
        H[body] = H[body] - 44; Sa[body] = np.clip(Sa[body] * 0.84, 0, 255); V[body] = V[body] * 0.9
        H[white] = 27; Sa[white] = np.clip(150 - (V[white] - 200) * 0.6, 90, 190); V[white] = np.clip(V[white] * 0.99, 0, 255)
    else:
        H[body] = 27; Sa[body] = np.clip(Sa[body] * 0.8, 0, 200); V[body] = np.clip(V[body] * 1.1 + 22, 0, 255)
        H[white] = 29; Sa[white] = 55
        Sa[cheek] *= 0.14; V[cheek] = V[cheek] + (228 - V[cheek]) * 0.75
        d = dark & ~cheek; V[d] = V[d] + (206 - V[d]) * 0.66; H[d] = 24; Sa[d] = np.clip(Sa[d] * 0.5 + 30, 0, 120)
    out = cv2.cvtColor(np.clip(hsv, 0, 255).astype(np.uint8), cv2.COLOR_HSV2BGR)
    out = cv2.GaussianBlur(out, (0, 0), 0.6)
    if keep is not None: k = (cv2.GaussianBlur(keep, (0, 0), 2) / 255.0)[:, :, None]; out = (out * (1 - k) + bgr * k).astype(np.uint8)
    return out

rawA, A, aA = load('09'); rawB, B, aB = load('02', -5, 3)
yy, xx = np.mgrid[0:A.shape[0], 0:A.shape[1]].astype(np.float32)
curve = lambda cx: 1062 - 0.0075 * (xx - cx) ** 2

def save(rgb, alpha, rect, path, q=90):
    x, y, w, h = rect; im = np.dstack([rgb[y:y + h, x:x + w, ::-1], alpha[y:y + h, x:x + w]]).astype(np.uint8)
    Image.fromarray(im).resize((round(w * S), round(h * S)), Image.LANCZOS).save(path, quality=q, method=6)

def beakmask(rgb, box):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_BGR2HSV); x0, y0, x1, y1 = box
    m = ((hsv[:, :, 0] >= 17) & (hsv[:, :, 0] <= 48) & (hsv[:, :, 1] > 70)).astype(np.uint8) * 255
    b = np.zeros_like(m); b[y0:y1, x0:x1] = 255; m = cv2.bitwise_and(m, b)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); k = 1 + np.argmax(st[1:, 4]); return cv2.GaussianBlur((lab == k).astype(np.uint8) * 255, (5, 5), 0)

def feetmask(raw, al):   # the pale legs and toes, plus the blue leg band
    hsv = cv2.cvtColor(raw, cv2.COLOR_BGR2HSV); H, Sa, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    pale = (Sa < 105) & (V > 105); band = (H >= 104) & (H <= 125) & (Sa > 120); m = np.zeros(al.shape, np.uint8)
    for (x0, y0, x1, y1), useband in [((340, 1332, 440, 1535), False), ((560, 1372, 685, 1598), True)]:
        sel = pale[y0:y1, x0:x1] | (band[y0:y1, x0:x1] if useband else False)
        if useband: sel[70:, :] &= pale[y0 + 70:y1, x0:x1]
        sub = (sel & (al[y0:y1, x0:x1] > 20)).astype(np.uint8) * 255
        sub = cv2.morphologyEx(sub, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)); sub = cv2.morphologyEx(sub, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        k, lab, st, _ = cv2.connectedComponentsWithStats(sub); big = 1 + np.argmax(st[1:, 4]); m[y0:y1, x0:x1] = (lab == big).astype(np.uint8) * 255
    return cv2.dilate(m, np.ones((7, 7), np.uint8))

bkA, bkB = beakmask(A, (463, 893, 562, 996)), beakmask(B, (523, 893, 624, 994))
cereA = np.zeros_like(bkA); cereA[840:900, 455:570] = 255; cereB = np.zeros_like(bkB); cereB[840:900, 515:630] = 255     # the tan cere above the beak
fmA, fmB = feetmask(rawA, aA), feetmask(rawB, aB)
upper = yy < 1320                                                                                                   # white turns yellow only above the legs
# feet are shared by every colour
frgb = np.clip(A.astype(np.float32) * np.array([0.80, 0.80, 0.86]) + np.array([10, 6, 14]), 0, 255).astype(np.uint8)
save(frgb, cv2.GaussianBlur(np.minimum(fmA, aA), (0, 0), 1.2), (CX, CY, CW, CH), MEDIA / 'feet.webp')
tail = cv2.imread(str(MEDIA / 'tail.png'), cv2.IMREAD_UNCHANGED)

for kind in ('blue', 'green', 'yellow'):
    out = MEDIA / kind; out.mkdir(exist_ok=True)
    for tag, src, al, cx, bk, cere, fm in [('A', A, aA, 570, bkA, cereA, fmA), ('B', B, aB, 593, bkB, cereB, fmB)]:
        rgb = recolor(src, kind, keep=np.maximum(np.maximum(bk, cere), fm), upto=upper)
        c = curve(cx); f = np.clip((c + 38 - yy) / 48, 0, 1); f = f * f * (3 - 2 * f)
        save(rgb, (al * f).astype(np.uint8), (HX, HY, HW, HH), out / f'head{tag}.webp')
        save(rgb, bk, (HX, HY, HW, HH), out / f'beak{tag}.webp')
        if tag == 'A':   # feather tufts where the legs meet the belly, made from real belly feathers; drawn behind the body so no gap can open
            la = np.zeros(al.shape, np.float32); lrgb = rgb.copy()
            for (cx_, cy_, rx_, ry_) in [(400, 1340, 25, 34), (592, 1388, 25, 32)]:
                e = np.clip((1 - np.sqrt(((xx - cx_) / rx_) ** 2 + ((yy - cy_) / ry_) ** 2)) * 2.2, 0, 1)
                srcp = np.roll(np.roll(rgb, -(1290 - cy_), axis=0), -(470 - cx_), axis=1); m = e > 0
                lrgb[m] = (srcp[m] * 0.86).astype(np.uint8); la = np.maximum(la, e * 255)
            save(lrgb, la.astype(np.uint8), (CX, CY, CW, CH), out / 'legs.webp')
        core = ((al > 128) & (fm == 0)).astype(np.uint8) * 255
        core = cv2.morphologyEx(core, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
        core = cv2.morphologyEx(core, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
        balpha = np.where(fm > 0, np.minimum(al, cv2.GaussianBlur(core, (0, 0), 1.5)), al)
        brgb = cv2.inpaint(rgb, cv2.dilate(fm, np.ones((5, 5), np.uint8)), 7, cv2.INPAINT_TELEA)
        g = np.clip((yy - (c - 60)) / 33, 0, 1); g = g * g * (3 - 2 * g)          # the head mesh covers everything above the neck
        save(brgb, (balpha * g).astype(np.uint8), (CX, CY, CW, CH), out / f'body{tag}.webp')
    t = recolor(np.ascontiguousarray(tail[:, :, :3]), 'yellow' if kind == 'yellow' else 'blue')
    Image.fromarray(np.dstack([t[:, :, ::-1], tail[:, :, 3]])).save(out / 'tail.webp', quality=90, method=6)
print('cut', sorted(p.name for p in MEDIA.iterdir()))
