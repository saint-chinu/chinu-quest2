"""新カード7枚のカードアート生成（Pillow + numpy）。

    python3 tools/gen_card_art.py

チヌクエスト2のカードは背景を `background-size: cover` で敷き、上から
linear-gradient(rgba(0,0,0,.12) → rgba(0,0,0,.72)) を重ねる（main.js の
renderCardEl）。なので
  ・縦長 2:3（既存の描き下ろしは 1024x1536）
  ・見せ場は上寄り（下部は暗幕で潰れる）
  ・全体を暗めに作ると overlay 後に沈むので、主題はしっかり明るく
を守る。出力は <id>.jpg で、battleCards.js の item()/spell() の既定パス
(/images/card-art/<id>.jpg) にそのまま乗る。
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 768, 1152
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public', 'images', 'card-art')
rng = np.random.default_rng(20260824)


# ---------- 下地 ----------

def radial(c_in, c_out, cx=0.5, cy=0.42, radius=0.78, power=1.0):
    """中心から外へ向かう放射グラデーション。"""
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (xs / W - cx) * (W / H)
    dy = ys / H - cy
    t = np.clip(np.sqrt(dx * dx + dy * dy) / radius, 0, 1) ** power
    t = t[..., None]
    a = np.array(c_in, np.float32)
    b = np.array(c_out, np.float32)
    return a * (1 - t) + b * t


def vertical(stops):
    """[(位置0-1, 色), ...] の縦グラデーション。"""
    ys = np.linspace(0, 1, H, dtype=np.float32)
    pos = np.array([s[0] for s in stops], np.float32)
    cols = np.array([s[1] for s in stops], np.float32)
    out = np.stack([np.interp(ys, pos, cols[:, i]) for i in range(3)], axis=-1)
    return np.repeat(out[:, None, :], W, axis=1)


def grain(arr, amount=6.0, scale=2):
    """フラットなベクター感を消すための粒子。"""
    small = rng.normal(0, amount, (H // scale, W // scale, 1)).astype(np.float32)
    noise = np.array(Image.fromarray(
        np.clip(small[..., 0] + 128, 0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32)
    return arr + (noise - 128)[..., None]


def vignette(arr, strength=0.55, radius=0.95):
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    dx = (xs / W - 0.5) * (W / H)
    dy = ys / H - 0.45
    t = np.clip(np.sqrt(dx * dx + dy * dy) / radius, 0, 1) ** 2.0
    return arr * (1 - strength * t)[..., None]


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')


# ---------- 前景レイヤー ----------

def layer():
    return Image.new('RGBA', (W, H), (0, 0, 0, 0))


def over(base_img, lay):
    return Image.alpha_composite(base_img.convert('RGBA'), lay).convert('RGB')


def glow(base_img, lay, radius=40, strength=1.0):
    """レイヤーをぼかして加算合成する（発光）。"""
    blurred = lay.filter(ImageFilter.GaussianBlur(radius))
    a = np.array(base_img.convert('RGB'), np.float32)
    b = np.array(blurred, np.float32)
    add = b[..., :3] * (b[..., 3:4] / 255.0) * strength
    return to_img(a + add)


def poly(d, pts, fill=None, outline=None, width=1):
    d.polygon([(float(x), float(y)) for x, y in pts], fill=fill, outline=outline, width=width)


def ring(d, cx, cy, r, w, color):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)


def shade(color, f):
    return tuple(int(max(0, min(255, c * f))) for c in color[:3]) + (color[3:] or (255,))


# ---------- 1. ロシアンルーレット ----------

def russian_roulette():
    bg = radial((78, 20, 26), (14, 4, 7), cy=0.40, radius=0.85, power=0.85)
    base = to_img(vignette(grain(bg), 0.5))

    cx, cy, R = W / 2, H * 0.42, 268
    lay = layer()
    d = ImageDraw.Draw(lay)
    # シリンダー本体（外周から内側へ、明→暗の同心円で金属の丸みを作る）
    for i in range(60):
        t = i / 59
        r = R * (1 - 0.30 * t)
        f = 0.42 + 0.72 * (1 - t) ** 1.6
        c = (int(126 * f), int(132 * f), int(146 * f), 255)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    ring(d, cx, cy, R, 7, (204, 212, 226, 255))
    ring(d, cx, cy, R - 10, 3, (36, 38, 46, 255))

    # 6つの薬室。ひとつだけ金の弾が入っている。
    live = 1
    chamber_r, orbit = 62, 158
    for i in range(6):
        a = -math.pi / 2 + i * math.pi / 3
        px, py = cx + orbit * math.cos(a), cy + orbit * math.sin(a)
        d.ellipse([px - chamber_r - 5, py - chamber_r - 5, px + chamber_r + 5, py + chamber_r + 5],
                  fill=(28, 29, 35, 255))
        if i == live:
            for k in range(26):
                t = k / 25
                r = chamber_r * (1 - 0.5 * t)
                f = 0.55 + 0.75 * t
                d.ellipse([px - r, py - r, px + r, py + r],
                          fill=(int(198 * f), int(150 * f), int(52 * f), 255))
            d.ellipse([px - 20, py - 26, px - 2, py - 6], fill=(255, 238, 190, 255))
        else:
            for k in range(20):
                t = k / 19
                r = chamber_r * (1 - 0.55 * t)
                v = int(20 * (1 - t))
                d.ellipse([px - r, py - r, px + r, py + r], fill=(v, v, v + 2, 255))
    # 中心のハブとネジ
    d.ellipse([cx - 46, cy - 46, cx + 46, cy + 46], fill=(96, 102, 114, 255))
    d.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=(52, 56, 66, 255))
    for i in range(6):
        a = i * math.pi / 3
        d.line([cx + 12 * math.cos(a), cy + 12 * math.sin(a),
                cx + 26 * math.cos(a), cy + 26 * math.sin(a)], fill=(150, 158, 172, 255), width=5)
    img = over(base, lay)

    # 装填された1発だけを光らせる
    hot = layer()
    hd = ImageDraw.Draw(hot)
    a = -math.pi / 2 + live * math.pi / 3
    px, py = cx + orbit * math.cos(a), cy + orbit * math.sin(a)
    hd.ellipse([px - 74, py - 74, px + 74, py + 74], fill=(150, 104, 26, 255))
    img = glow(img, hot, 55, 1.05)

    # 左上からのスポットライト
    sp = layer()
    ImageDraw.Draw(sp).ellipse([-160, -320, W * 0.95, H * 0.34], fill=(46, 30, 26, 255))
    img = glow(img, sp, 150, 0.9)
    return img


# ---------- 2. ダイヤモンドの盾 ----------

def shield_outline(cx, cy, w, h):
    """ヒーターシールドの輪郭。上辺は水平、下は尖る。"""
    pts = [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2)]
    for i in range(1, 40):
        t = i / 39
        x = cx + (w / 2) * math.cos(t * math.pi / 2) ** 0.62
        y = cy - h / 2 + h * (0.30 + 0.70 * t)
        pts.append((x, y))
    pts.append((cx, cy + h / 2))
    for i in range(38, 0, -1):
        t = i / 39
        x = cx - (w / 2) * math.cos(t * math.pi / 2) ** 0.62
        y = cy - h / 2 + h * (0.30 + 0.70 * t)
        pts.append((x, y))
    return pts


def diamond_shield():
    bg = radial((26, 74, 122), (3, 10, 26), cy=0.42, radius=0.88, power=0.9)
    base = to_img(vignette(grain(bg, 5), 0.5))

    cx, cy = W / 2, H * 0.43
    outline = shield_outline(cx, cy, 470, 610)
    girdle_y = cy - 150
    tip = (cx, cy + 305)

    lay = layer()
    d = ImageDraw.Draw(lay)
    poly(d, outline, fill=(40, 92, 148, 255))

    def facet(pts, f, seed=0.0):
        f = f + seed
        c = (int(28 + 200 * f), int(74 + 172 * f), int(120 + 132 * f), 255)
        poly(d, pts, fill=c, outline=(16, 46, 84, 255), width=3)

    # 下半分: ガードルから先端へ扇状に落ちるパビリオン面
    lower = [p for p in outline if p[1] >= girdle_y]
    for i in range(len(lower) - 1):
        t = abs((i / max(1, len(lower) - 2)) * 2 - 1)
        facet([lower[i], lower[i + 1], tip], 0.20 + 0.62 * t ** 1.3, float(rng.uniform(-.05, .05)))
    # ガードル上のクラウン面（左右対称のカイト）
    top_y = cy - 305
    xs = [cx - 235, cx - 141, cx - 47, cx + 47, cx + 141, cx + 235]
    table = [cx - 118, cx + 118]
    for i in range(5):
        t = abs((i / 4) * 2 - 1)
        facet([(xs[i], top_y), (xs[i + 1], top_y),
               (cx + (xs[i + 1] - cx) * 0.52, girdle_y), (cx + (xs[i] - cx) * 0.52, girdle_y)],
              0.44 + 0.52 * (1 - t))
    # 左右の肩から girdle へ落ちる面
    for sgn in (-1, 1):
        facet([(cx + sgn * 235, top_y), (cx + sgn * 235, cy - 250),
               (cx + sgn * 122, girdle_y), (cx + sgn * 122 * 0.52, girdle_y)], 0.30)
    # テーブル面（一番明るい平面）
    poly(d, [(table[0], top_y), (table[1], top_y),
             (cx + 62, girdle_y), (cx - 62, girdle_y)],
         fill=(214, 242, 255, 255), outline=(255, 255, 255, 255), width=3)
    poly(d, [(table[0], top_y), (cx, top_y), (cx - 62, girdle_y)], fill=(240, 251, 255, 255))
    poly(d, outline, outline=(226, 246, 255, 255), width=9)
    img = over(base, lay)

    # 屈折のきらめきと外周の冷光
    sp = layer()
    sd = ImageDraw.Draw(sp)
    for px, py, s_ in ((cx - 74, cy - 262, 52), (cx + 132, cy - 96, 34), (cx - 148, cy + 76, 28)):
        sd.line([px - s_, py, px + s_, py], fill=(214, 240, 255, 255), width=5)
        sd.line([px, py - s_, px, py + s_], fill=(214, 240, 255, 255), width=5)
    rim = layer()
    poly(ImageDraw.Draw(rim), outline, outline=(64, 158, 228, 255), width=18)
    img = glow(img, rim, 50, 0.95)
    img = glow(img, sp, 12, 1.3)
    return img


# ---------- 3. 札束ガード ----------

def banknote(d, cx, cy, ang, w=250, h=118):
    ca, sa = math.cos(ang), math.sin(ang)
    def R(x, y):
        return (cx + x * ca - y * sa, cy + x * sa + y * ca)
    poly(d, [R(-w / 2, -h / 2), R(w / 2, -h / 2), R(w / 2, h / 2), R(-w / 2, h / 2)],
         fill=(206, 214, 186, 255), outline=(104, 116, 90, 255), width=3)
    poly(d, [R(-w / 2 + 10, -h / 2 + 10), R(w / 2 - 10, -h / 2 + 10),
             R(w / 2 - 10, h / 2 - 10), R(-w / 2 + 10, h / 2 - 10)],
         outline=(150, 162, 128, 255), width=2)
    ox, oy = R(0, 0)
    r = h * 0.30
    d.ellipse([ox - r, oy - r, ox + r, oy + r], fill=(226, 232, 208, 255), outline=(150, 162, 128, 255), width=3)
    d.ellipse([ox - r * 0.5, oy - r * 0.5, ox + r * 0.5, oy + r * 0.5], fill=(178, 190, 156, 255))
    for k in (-1, 1):
        for j in range(3):
            yy = k * (h * 0.22 + j * 7)
            d.line([R(-w / 2 + 22, yy), R(-w * 0.20, yy)], fill=(150, 162, 128, 255), width=2)
            d.line([R(w * 0.20, yy), R(w / 2 - 22, yy)], fill=(150, 162, 128, 255), width=2)
    # 帯封
    poly(d, [R(-w / 2, -15), R(w / 2, -15), R(w / 2, 15), R(-w / 2, 15)], fill=(196, 56, 56, 255))
    poly(d, [R(-w / 2, -15), R(w / 2, -15), R(w / 2, -9), R(-w / 2, -9)], fill=(228, 100, 100, 255))


def satsutaba_guard():
    bg = radial((30, 86, 62), (5, 15, 13), cy=0.44, radius=0.88, power=0.9)
    base = to_img(vignette(grain(bg, 5), 0.5))

    cx, cy = W / 2, H * 0.50
    lay = layer()
    d = ImageDraw.Draw(lay)
    # 手前へせり出す札束の壁（3段・互い違い）
    rows = ((cy + 150, (-1.0, 0.0, 1.0), 0.10), (cy + 44, (-0.5, 0.5), -0.07), (cy - 58, (-1.0, 0.0, 1.0), 0.06))
    for ry, cols, tilt in rows:
        for c in cols:
            banknote(d, cx + c * 216, ry, tilt * (1 if c >= 0 else -1))
    img = over(base, lay)

    # 受け止められた刃（右上から差し込み、札の手前で止まる）
    bl = layer()
    bd = ImageDraw.Draw(bl)
    tipx, tipy = cx + 62, cy - 96
    poly(bd, [(cx + 352, cy - 470), (cx + 424, cy - 424), (tipx + 44, tipy + 16), (tipx, tipy)],
         fill=(150, 164, 184, 255), outline=(244, 250, 255, 255), width=5)
    poly(bd, [(cx + 352, cy - 470), (cx + 392, cy - 444), (tipx + 20, tipy + 6), (tipx, tipy)],
         fill=(230, 240, 252, 255))
    img = over(img, bl)

    # 衝突の火花と、舞い上がる札
    fly = layer()
    fd = ImageDraw.Draw(fly)
    for px, py, a in ((cx - 250, cy - 300, -0.9), (cx + 250, cy - 250, 0.7),
                      (cx - 60, cy - 340, 0.3), (cx + 130, cy - 400, -0.4)):
        banknote(fd, px, py, a, w=138, h=66)
    img = over(img, fly)

    sp = layer()
    sd = ImageDraw.Draw(sp)
    sd.ellipse([tipx - 92, tipy - 82, tipx + 92, tipy + 82], fill=(138, 116, 40, 255))
    for _ in range(22):
        px = float(rng.uniform(tipx - 210, tipx + 190))
        py = float(rng.uniform(tipy - 160, tipy + 130))
        s_ = float(rng.uniform(4, 13))
        sd.ellipse([px - s_, py - s_, px + s_, py + s_], fill=(196, 166, 66, 255))
    img = glow(img, sp, 40, 1.05)
    return img


# ---------- 4. 鋼体 ----------

def kotai():
    bg = radial((34, 58, 84), (6, 10, 18), cy=0.42, radius=0.84, power=0.95)
    base = to_img(vignette(grain(bg, 5), 0.5))

    cx, cy = W / 2, H * 0.43
    lay = layer()
    d = ImageDraw.Draw(lay)
    # 背後の魔法陣
    for r, w in ((300, 5), (272, 2), (198, 3)):
        ring(d, cx, cy, r, w, (96, 176, 226, 190))
    for i in range(36):
        a = i * math.pi / 18
        r0, r1 = (276, 296) if i % 3 == 0 else (282, 292)
        d.line([cx + r0 * math.cos(a), cy + r0 * math.sin(a),
                cx + r1 * math.cos(a), cy + r1 * math.sin(a)], fill=(140, 202, 240, 220), width=4)
    poly(d, [(cx + 232 * math.cos(i * 2 * math.pi / 3 - math.pi / 2),
              cy + 232 * math.sin(i * 2 * math.pi / 3 - math.pi / 2)) for i in range(3)],
         outline=(110, 186, 232, 170), width=3)

    # 六角の鋼板。上から下へ明→暗で厚みを出す。
    hexpts = [(cx + 176 * math.cos(i * math.pi / 3 - math.pi / 2),
               cy + 200 * math.sin(i * math.pi / 3 - math.pi / 2)) for i in range(6)]
    poly(d, [(x, y + 22) for x, y in hexpts], fill=(28, 36, 48, 255))
    for k in range(46):
        t = k / 45
        pts = [(cx + (x - cx) * (1 - 0.02 * t), cy + (y - cy) * (1 - 0.02 * t)) for x, y in hexpts]
        f = 0.96 - 0.42 * t
        poly(d, pts, fill=(int(150 * f), int(164 * f), int(182 * f), 255))
    poly(d, hexpts, outline=(226, 240, 255, 255), width=7)
    # 面取りとリベット
    poly(d, [(cx + 118 * math.cos(i * math.pi / 3 - math.pi / 2),
              cy + 134 * math.sin(i * math.pi / 3 - math.pi / 2)) for i in range(6)],
         outline=(206, 222, 240, 200), width=4)
    for i in range(6):
        a = i * math.pi / 3 - math.pi / 2
        px, py = cx + 148 * math.cos(a), cy + 168 * math.sin(a)
        d.ellipse([px - 13, py - 13, px + 13, py + 13], fill=(196, 210, 228, 255))
        d.ellipse([px - 7, py - 7, px + 7, py + 7], fill=(96, 106, 122, 255))
    img = over(base, lay)

    # 立ち上る光
    up = layer()
    ud = ImageDraw.Draw(up)
    for i in range(7):
        px = cx + float(rng.uniform(-210, 210))
        h = float(rng.uniform(140, 320))
        ud.line([px, cy + 150, px, cy + 150 - h], fill=(40, 118, 168, 255), width=int(rng.uniform(8, 22)))
    circ = layer()
    ring(ImageDraw.Draw(circ), cx, cy, 300, 8, (48, 128, 186, 255))
    img = glow(img, up, 40, 0.9)
    img = glow(img, circ, 38, 0.95)
    return img


# ---------- 5. パンデミック ----------

def zombie_silhouette(d, cx, base_y, s, color):
    """うつむき気味・両腕を垂らした立ち姿。3体とも同じ型＝「均された」ことを見せる。"""
    lean = 10 * s
    hx, hy_ = cx + lean, base_y - 254 * s
    d.ellipse([hx - 31 * s, hy_ - 32 * s, hx + 31 * s, hy_ + 32 * s], fill=color)   # 頭
    d.rectangle([hx - 12 * s, hy_ + 22 * s, hx + 12 * s, hy_ + 46 * s], fill=color)  # 首
    poly(d, [(cx - 44 * s + lean, base_y - 208 * s), (cx + 44 * s + lean, base_y - 208 * s),
             (cx + 33 * s, base_y - 84 * s), (cx - 33 * s, base_y - 84 * s)], fill=color)
    # 力なく垂れた両腕
    for sgn, drop in ((-1, 0), (1, 14)):
        sx = cx + sgn * 40 * s + lean
        ex = cx + sgn * 62 * s + lean
        poly(d, [(sx - sgn * 6 * s, base_y - 206 * s), (sx + sgn * 16 * s, base_y - 200 * s),
                 (ex + sgn * 13 * s, base_y - (108 + drop) * s),
                 (ex - sgn * 9 * s, base_y - (104 + drop) * s)], fill=color)
    poly(d, [(cx - 31 * s, base_y - 92 * s), (cx - 6 * s, base_y - 92 * s),
             (cx - 10 * s, base_y), (cx - 34 * s, base_y)], fill=color)
    poly(d, [(cx + 6 * s, base_y - 92 * s), (cx + 31 * s, base_y - 92 * s),
             (cx + 29 * s, base_y), (cx + 6 * s, base_y)], fill=color)
    return (hx, hy_ - 2 * s, s)


def pandemic():
    bg = radial((96, 42, 138), (10, 3, 22), cy=0.38, radius=0.92, power=0.85)
    base = to_img(vignette(grain(bg, 5), 0.42))

    cx, cy = W / 2, H * 0.40
    rings = layer()
    rd = ImageDraw.Draw(rings)
    for r in range(80, 520, 46):
        rd.ellipse([cx - r, cy - r * 0.40, cx + r, cy + r * 0.40],
                   outline=(190, 122, 250, max(30, 210 - r // 3)), width=5)
    img = over(base, rings.filter(ImageFilter.GaussianBlur(2)))

    far = layer()
    fd = ImageDraw.Draw(far)
    for x, s_ in ((cx - 330, 0.58), (cx - 192, 0.62), (cx + 192, 0.62), (cx + 330, 0.58)):
        zombie_silhouette(fd, x, cy + 196, s_, (36, 17, 56, 255))
    img = over(img, far.filter(ImageFilter.GaussianBlur(6)))

    # 瘴気は手前の3体より"奥"に敷く。ここで被せてしまうと目の光まで沈む。
    fog = layer()
    fgd = ImageDraw.Draw(fog)
    for _ in range(20):
        px = float(rng.uniform(-60, W + 60))
        py = float(rng.uniform(cy - 100, cy + 400))
        r = float(rng.uniform(110, 250))
        fgd.ellipse([px - r, py - r * 0.55, px + r, py + r * 0.55], fill=(126, 62, 196, 62))
    img = over(img, fog.filter(ImageFilter.GaussianBlur(52)))

    near = layer()
    nd = ImageDraw.Draw(near)
    heads = [zombie_silhouette(nd, cx + dx, cy + 292, s_, (11, 4, 20, 255))
             for dx, s_ in ((-198, 0.94), (0, 1.08), (198, 0.94))]
    img = over(img, near)

    eyes = layer()
    ed = ImageDraw.Draw(eyes)
    for hx, hy_, s_ in heads:
        for off in (-13 * s_, 13 * s_):
            ed.ellipse([hx + off - 8 * s_, hy_ - 6 * s_, hx + off + 8 * s_, hy_ + 6 * s_],
                       fill=(186, 246, 128, 255))
    img = glow(img, eyes, 18, 1.8)
    img = over(img, eyes)
    return img


# ---------- 6. ホライズン ----------

def horizon():
    base = to_img(vignette(grain(vertical([
        (0.00, (12, 14, 42)), (0.26, (46, 34, 86)), (0.42, (146, 74, 92)),
        (0.50, (224, 148, 78)), (0.57, (78, 46, 66)), (1.00, (10, 9, 22)),
    ]), 5), 0.40))

    hy = H * 0.56           # 地面
    level_h = 150           # 均された高さ
    ly = hy - level_h       # ホライズン（均一化ライン）

    sun = layer()
    ImageDraw.Draw(sun).ellipse([W / 2 - 150, hy - 150, W / 2 + 150, hy + 150], fill=(150, 96, 34, 255))
    img = glow(base, sun, 70, 0.7)

    heights = [318, 92, 246, 58, 176, 132, 210, 74]
    bw, gap, x0 = 62, 22, 42

    # 均される前の姿を、透けた輪郭として残す
    ghost = layer()
    gd = ImageDraw.Draw(ghost)
    for i, h in enumerate(heights):
        if h <= level_h:
            continue
        x = x0 + i * (bw + gap)
        poly(gd, [(x, ly), (x + bw, ly), (x + bw, hy - h), (x, hy - h)],
             fill=(226, 176, 96, 46), outline=(238, 198, 122, 150), width=3)
    img = over(img, ghost)

    towers = layer()
    td = ImageDraw.Draw(towers)
    for i, h in enumerate(heights):
        x = x0 + i * (bw + gap)
        # 均された後はどれも ly まで。元より低かった塔は、足された分を明るく残す。
        poly(td, [(x, hy), (x + bw, hy), (x + bw, ly), (x, ly)], fill=(17, 12, 26, 255))
        if h < level_h:
            poly(td, [(x, hy - h), (x + bw, hy - h), (x + bw, ly), (x, ly)], fill=(72, 44, 78, 255))
            poly(td, [(x, hy - h - 3), (x + bw, hy - h - 3), (x + bw, hy - h + 3), (x, hy - h + 3)],
                 fill=(150, 104, 128, 255))
        poly(td, [(x, ly), (x + bw, ly), (x + bw, ly + 10), (x, ly + 10)], fill=(66, 46, 70, 255))
    img = over(img, towers)

    line = layer()
    ld = ImageDraw.Draw(line)
    ld.rectangle([0, ly - 6, W, ly + 6], fill=(255, 226, 150, 255))
    for i, h in enumerate(heights):
        x = x0 + i * (bw + gap)
        ld.rectangle([x - 9, ly - 13, x + bw + 9, ly + 13], fill=(255, 248, 214, 255))
    img = glow(img, line, 30, 0.85)
    img = over(img, line)   # 芯は必ずくっきり残す

    beam = layer()
    ImageDraw.Draw(beam).rectangle([0, ly - 3, W, ly + 3], fill=(130, 98, 44, 255))
    img = glow(img, beam, 110, 0.8)
    return img


# ---------- 7. 遅延行為 ----------

def delay_tactics():
    bg = radial((104, 82, 46), (16, 12, 8), cy=0.44, radius=0.88, power=0.95)
    base = to_img(vignette(grain(bg, 6), 0.5))

    cx, cy = W / 2, H * 0.50
    lay = layer()
    d = ImageDraw.Draw(lay)

    def paper_stack(sx, sy, count, w=210, h=13):
        for i in range(count):
            y = sy - i * (h - 2)
            off = float(rng.uniform(-9, 9))
            poly(d, [(sx + off, y), (sx + w + off, y - 5), (sx + w + off, y + h - 5), (sx + off, y + h)],
                 fill=(214, 206, 182, 255) if i % 2 else (232, 226, 206, 255),
                 outline=(146, 138, 116, 255))
    paper_stack(cx - 330, cy + 210, 22)
    paper_stack(cx + 110, cy + 210, 30)
    paper_stack(cx - 118, cy + 250, 15, w=232, h=15)

    # 砂時計
    gx, gy, gw, gh = cx + 24, cy - 70, 156, 306
    frame = (96, 66, 36, 255)
    poly(d, [(gx - gw / 2 - 16, gy - gh / 2 - 20), (gx + gw / 2 + 16, gy - gh / 2 - 20),
             (gx + gw / 2 + 16, gy - gh / 2), (gx - gw / 2 - 16, gy - gh / 2)], fill=frame)
    poly(d, [(gx - gw / 2 - 16, gy + gh / 2), (gx + gw / 2 + 16, gy + gh / 2),
             (gx + gw / 2 + 16, gy + gh / 2 + 20), (gx - gw / 2 - 16, gy + gh / 2 + 20)], fill=frame)
    glass = [(gx - gw / 2, gy - gh / 2), (gx + gw / 2, gy - gh / 2), (gx + 12, gy),
             (gx + gw / 2, gy + gh / 2), (gx - gw / 2, gy + gh / 2), (gx - 12, gy)]
    poly(d, glass, fill=(198, 214, 224, 96), outline=(232, 244, 252, 235), width=5)
    # 上の砂はまだ たっぷり残っている＝止まったまま
    poly(d, [(gx - gw / 2 + 12, gy - gh / 2 + 14), (gx + gw / 2 - 12, gy - gh / 2 + 14),
             (gx + 8, gy - 8), (gx - 8, gy - 8)], fill=(216, 170, 78, 255))
    poly(d, [(gx - 58, gy + gh / 2 - 12), (gx + 58, gy + gh / 2 - 12),
             (gx + 30, gy + gh / 2 - 62), (gx - 30, gy + gh / 2 - 62)], fill=(216, 170, 78, 255))
    d.line([gx, gy - 4, gx, gy + 54], fill=(230, 194, 112, 255), width=5)

    # 決裁されないままの朱印
    poly(d, [(cx - 322, cy + 96), (cx - 110, cy + 84), (cx - 106, cy + 122), (cx - 318, cy + 134)],
         fill=(228, 222, 202, 255), outline=(150, 142, 120, 255))
    ring(d, cx - 214, cy + 108, 52, 11, (208, 58, 50, 240))
    d.line([cx - 246, cy + 108, cx - 182, cy + 108], fill=(208, 58, 50, 240), width=10)
    d.line([cx - 214, cy + 76, cx - 214, cy + 140], fill=(208, 58, 50, 240), width=10)
    img = over(base, lay)

    sand = layer()
    ImageDraw.Draw(sand).line([gx, gy - 4, gx, gy + 54], fill=(150, 112, 40, 255), width=8)
    img = glow(img, sand, 22, 1.0)
    return img


CARDS = {
    'russianRoulette': russian_roulette,
    'diamondShield': diamond_shield,
    'satsutabaGuard': satsutaba_guard,
    'kotai': kotai,
    'pandemic': pandemic,
    'horizon': horizon,
    'delayTactics': delay_tactics,
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in CARDS.items():
        path = os.path.join(OUT, f'{name}.jpg')
        fn().save(path, 'JPEG', quality=90, optimize=True, progressive=True)
        print(f'{name}.jpg  {os.path.getsize(path) // 1024}KB')
