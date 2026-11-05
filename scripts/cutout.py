# Cut-out animation sheets from one official artwork, with Pillow, numpy and scipy (used by scripts/oshawott-sheet.py and
# dewott-sheet.py). Samurott is built from its dot sprite instead (scripts/samurott-dot.py, scripts/dotsprite.py).
# A species script defines its parts and poses and calls run(module, ANIMS):
#   python scripts/<species>-sheet.py              -> public/anim/<species>.webp + src/anim/<species>.json
#   python scripts/<species>-sheet.py preview DIR  -> DIR/<species>-preview.png, every animation labelled (to check poses)
# Every frame is a pose: a whole-body shift / turn / stretch ('g') plus a turn (and optional shift) per part.
# Positive angles turn counter-clockwise on screen (Pillow's convention). The art faces right; the game mirrors it.
#
# Species module fields:
#   NAME, SRC, MIRROR, OUT_SCALE, PAD (canvas margin left, top, right, bottom in source px)
#   PARTS     name -> (polygon, pivot, under); the first part listed takes pixels two polygons share, and the later one
#             paints that spot in from its own colours (so a whisker over an arm is not cut twice). 'under' (or None) is
#             where a part drawn behind the body carries on beneath it, painted in the same way, so turning it never opens
#             a gap at the joint (the head under the collar, a tail root, the tops of the feet)
#   FILL      parts whose overlap with TORSO_FILL is painted over on the body, so moving them shows body, not a hole
#   ORDER     draw order, back to front: part names, 'body', and HELD keys (where that held blade is drawn)
#   HELD      pose key -> (arm, grip, shell part, hinge, tip): with the key in a pose, the shell leaves its spot and the
#             arm's paw holds it at grip (hinge in the paw, tip outward) with a water blade from the tip; the pose value
#             is the blade's direction on screen (0 forward, 90 up)
#   BLADE     (length, half width at the base) of that water blade, source px
#   PAINT     optional [(polygon, rgb)]: inside it the body is painted flat instead (a chest hidden under an arm)
#   TORSO (whole-body turn centre), TORSO_FILL (the torso's outline, on its black line), GROUND (feet line),
#   MOUTH (where water moves leave)
import json, math, os, sys
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps
from scipy.ndimage import gaussian_filter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLEAR = (0, 0, 0, 0)


def poly_mask(poly, size):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon(poly, fill=255); return m


def fill(img, m):
    # paint the masked pixels in smoothly from the colours around them (normalised Gaussian blur, coarse to fine);
    # black outline pixels are not used as a source, so a filled spot takes the colour around it, not a smear of line
    a = np.asarray(img, dtype=float); mk = np.asarray(m) > 0
    w = ((a[..., 3] > 200) & (a[..., :3].sum(-1) > 150) & ~mk).astype(float)
    col, have = None, None
    for s in (40, 20, 10, 5, 2.5):
        wb = gaussian_filter(w, s)
        est = np.stack([gaussian_filter(a[..., i] * w, s) for i in range(3)], -1) / np.maximum(wb, 1e-9)[..., None]
        if col is None: col, have = est, wb > 1e-4
        else: col = np.where((wb > 0.3)[..., None], est, col)
    out = a.copy(); out[mk, :3] = col[mk]; out[mk, 3] = np.where(have[mk], 255, 0)
    return Image.fromarray(out.round().clip(0, 255).astype(np.uint8), 'RGBA')


def drop_specks(img, min_px=80):
    # remove small islands left on a layer by the cuts (bits of outline between parts)
    img = img.copy(); px = img.load(); w, h = img.size; seen = set()
    for y0 in range(h):
        for x0 in range(w):
            if px[x0, y0][3] < 20 or (x0, y0) in seen: continue
            comp, stack = [], [(x0, y0)]; seen.add((x0, y0))
            while stack:
                x, y = stack.pop(); comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3] >= 20:
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(comp) < min_px:
                for x, y in comp: px[x, y] = CLEAR
    return img


def oval(cx, cy, rx, ry, n=20):  # an ellipse as a polygon (handy for 'under' regions: a round root turns without corners)
    return [(cx + rx * math.cos(i / n * 2 * math.pi), cy + ry * math.sin(i / n * 2 * math.pi)) for i in range(n)]


def rot_point(p, c, deg):  # where p lands after turning deg (counter-clockwise on screen) around c
    a = math.radians(deg); x, y = p[0] - c[0], p[1] - c[1]
    return (c[0] + x * math.cos(a) + y * math.sin(a), c[1] - x * math.sin(a) + y * math.cos(a))


def water_blade(length, half):
    # Razor Shell's blade as the anime draws it: a long, gently curved blade of glowing water from the shell's rim,
    # cyan with a white edge and bubbles. Local frame: +x from the base at the origin, the tip bending up (-y).
    # Drawn at 2x and shrunk for smooth edges.
    S2 = 2; ox, oy = 8, half + length * 0.22 + 8
    size = ((length + 16) * S2, round(oy + half + 8) * S2)
    im = Image.new('RGBA', size, CLEAR); d = ImageDraw.Draw(im)
    def edge(side, grow=0.0, n=24):
        pts = []
        for i in range(n + 1):
            s = i / n; cx, cy = s * length, -0.18 * length * s * s          # centre line, bending up toward the tip
            w = half * (1 - s ** 1.7) * (1.0 + 0.25 * math.sin(math.pi * s)) + grow * (1 - 0.6 * s)
            nx, ny = 0.36 * s, 1.0                                          # normal, roughly down (leading edge)
            k = math.hypot(nx, ny); pts.append(((ox + cx + side * w * nx / k) * S2, (oy + cy + side * w * ny / k) * S2))
        return pts
    tip = ((ox + length + 3) * S2, (oy - 0.18 * length - 1) * S2)
    d.polygon(edge(-1, 2.5) + [tip] + edge(1, 2.5)[::-1], fill=(28, 110, 180, 255))     # deep blue rim (reads on water)
    d.polygon(edge(-1) + [tip] + edge(1)[::-1], fill=(120, 214, 248, 235))               # the water
    d.polygon(edge(0.15) + edge(0.85)[::-1], fill=(196, 242, 255, 245))                  # light band by the cutting edge
    d.line(edge(0.7)[1:-3], fill=(255, 255, 255, 255), width=2 * S2)                     # white shine along the edge
    for s, off, r in ((0.2, -0.35, 2.2), (0.38, -0.1, 1.6), (0.55, -0.4, 1.4), (0.3, 0.2, 1.2), (0.7, -0.15, 1.1)):
        cx, cy = ox + s * length, oy - 0.18 * length * s * s + off * half
        d.ellipse([(cx - r) * S2, (cy - r) * S2, (cx + r) * S2, (cy + r) * S2], fill=(255, 255, 255, 230))
    return im.resize((size[0] // S2, size[1] // S2), Image.LANCZOS), (ox, round(oy))


class Rig:
    def __init__(self, C):
        self.C = C
        src = Image.open(os.path.join(ROOT, C.SRC)).convert('RGBA')
        self.src = ImageOps.mirror(src) if C.MIRROR else src
        W0, H0 = self.src.size; L, T, R, B = C.PAD
        self.cw, self.ch = W0 + L + R, H0 + T + B
        self.layers = self.cut()

    def on_canvas(self, img):
        c = Image.new('RGBA', (self.cw, self.ch), CLEAR); c.alpha_composite(img, self.C.PAD[:2]); return c

    def turn(self, img, deg, c):
        return img.rotate(deg, resample=Image.BICUBIC, center=(c[0] + self.C.PAD[0], c[1] + self.C.PAD[1])) if deg else img

    @staticmethod
    def shift(img, dx, dy):
        return img.transform(img.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), resample=Image.BICUBIC) if dx or dy else img

    def cut(self):
        C, src = self.C, self.src; size = src.size; empty = Image.new('RGBA', size, CLEAR)
        solid = src.getchannel('A').point(lambda v: 255 if v > 10 else 0)
        out, taken, cut = {}, Image.new('L', size, 0), Image.new('L', size, 0)
        for name, (poly, pivot, under) in C.PARTS.items():
            m = poly_mask(poly, size)
            own = ImageChops.subtract(m, taken)
            grow = ImageChops.multiply(m, taken)                      # an earlier part has these pixels
            if under: grow = ImageChops.lighter(grow, ImageChops.multiply(ImageChops.subtract(poly_mask(under, size), m), solid))
            layer = Image.composite(src, empty, own)
            if grow.getbbox(): layer = fill(layer, grow)
            out[name] = drop_specks(layer, 30)
            cut.paste(255, mask=own); taken.paste(255, mask=m)
        body = Image.composite(empty, src, cut)
        # where a limb or a shell covered the torso, the body is painted in from around it
        torso, holes = poly_mask(C.TORSO_FILL, size), Image.new('L', size, 0)
        for name in C.FILL: holes.paste(255, mask=ImageChops.multiply(poly_mask(C.PARTS[name][0], size).filter(ImageFilter.MaxFilter(3)), torso))
        for poly, col in getattr(C, 'PAINT', []):  # flat base colours where the surroundings would give the wrong one
            spot = ImageChops.multiply(holes, poly_mask(poly, size))
            body.paste(tuple(col) + (255,), mask=spot); holes = ImageChops.subtract(holes, spot)
        body = fill(body, holes)
        # and its outline is drawn back along TORSO_FILL where a limb had covered it
        edge = Image.new('RGBA', size, CLEAR); ImageDraw.Draw(edge).line(C.TORSO_FILL + C.TORSO_FILL[:1], fill=(32, 36, 48, 255), width=3, joint='curve')
        body = Image.composite(edge, body, ImageChops.multiply(edge.getchannel('A'), holes.filter(ImageFilter.MaxFilter(7))))
        out['body'] = drop_specks(body)
        for key, (arm, grip, shell, hinge, tip) in C.HELD.items():
            out[key] = self.held(out[shell], grip, hinge, tip)
        return out

    def held(self, shell, grip, hinge, tip):
        # the shell turned so hinge -> tip points forward with the hinge on the grip, the water blade out of its tip,
        # on the padded canvas (the blade reaches far past the art); render turns it around the grip
        P = self.C.PAD; g = (grip[0] + P[0], grip[1] + P[1])
        reach = math.hypot(tip[0] - hinge[0], tip[1] - hinge[1])
        ang = math.degrees(math.atan2(-(tip[1] - hinge[1]), tip[0] - hinge[0]))
        sh = Image.new('RGBA', (self.cw, self.ch), CLEAR); sh.alpha_composite(shell, (g[0] - hinge[0], g[1] - hinge[1]))
        sh = sh.rotate(-ang, resample=Image.BICUBIC, center=g)
        blade, (bx, by) = water_blade(*self.C.BLADE)
        big = Image.new('RGBA', (self.cw, self.ch), CLEAR)
        big.alpha_composite(blade, (round(g[0] + reach * 0.8) - bx, g[1] - by))  # starts just inside the shell's rim
        big.alpha_composite(sh)
        return big

    def render(self, pose):
        C = self.C; frame = Image.new('RGBA', (self.cw, self.ch), CLEAR)
        drawn = [k for k in C.HELD if k in pose]; away = {C.HELD[k][2] for k in drawn}
        def arg(name):
            v = pose.get(name, 0)
            return (v, 0, 0) if not isinstance(v, tuple) else (tuple(v) + (0, 0))[:3]
        for name in C.ORDER:
            if name == 'body': frame.alpha_composite(self.on_canvas(self.layers['body'])); continue
            if name in C.HELD:
                if name not in drawn: continue
                arm, grip = C.HELD[name][:2]; ad, adx, ady = arg(arm)
                gx, gy = rot_point(grip, C.PARTS[arm][1], ad)  # the grip rides on the paw, then the blade turns on the grip
                frame.alpha_composite(self.shift(self.turn(self.layers[name], pose[name], grip), gx - grip[0] + adx, gy - grip[1] + ady))
                continue
            if name in away: continue
            deg, dx, dy = arg(name)
            frame.alpha_composite(self.shift(self.turn(self.on_canvas(self.layers[name]), deg, C.PARTS[name][1]), dx, dy))
        gx, gy, gdeg, gsx, gsy = tuple(pose.get('g', ())) + (0, 0, 0, 1, 1)[len(pose.get('g', ())):]
        if gsx != 1 or gsy != 1:  # stretch around the feet under the torso, so a squash keeps the feet down
            cx, cy = C.TORSO[0] + C.PAD[0], C.GROUND + C.PAD[1]
            frame = frame.transform(frame.size, Image.AFFINE, (1 / gsx, 0, cx - cx / gsx, 0, 1 / gsy, cy - cy / gsy), resample=Image.BICUBIC)
        frame = self.shift(self.turn(frame, gdeg, C.TORSO), gx, gy)
        return frame.resize((round(self.cw * C.OUT_SCALE), round(self.ch * C.OUT_SCALE)), Image.LANCZOS)


def build(C, anims, preview_dir=None):
    rig = Rig(C); k = C.OUT_SCALE; P = C.PAD
    names = list(anims)
    frames = [(n, i, rig.render(p)) for n in names for i, p in enumerate(anims[n][2])]
    fw, fh = frames[0][2].size
    for n, i, f in frames:  # a blade or a lunge running off the frame gets cut off in the game: widen PAD or tame the pose
        bb = f.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
        if bb and (bb[0] == 0 or bb[1] == 0 or bb[2] == fw or bb[3] == fh): print('clipped:', n, i, bb, (fw, fh))
    if preview_dir:
        cols, lab = 8, 14
        rows = sum(math.ceil(len(anims[n][2]) / cols) for n in names)
        sheet = Image.new('RGBA', (cols * fw, rows * (fh + lab)), (36, 54, 72, 255)); d = ImageDraw.Draw(sheet); r, last = -1, None
        for n, i, f in frames:
            if n != last or i % cols == 0: r += 1; last = n
            x, y = (i % cols) * fw, r * (fh + lab)
            gy = y + lab + (C.GROUND + P[1]) * k
            d.line([(x, gy), (x + fw, gy)], fill=(120, 140, 160, 255))
            sheet.alpha_composite(f, (x, y + lab)); d.text((x + 3, y + 1), f'{n} {i}', fill=(255, 255, 0, 255))
        path = os.path.join(preview_dir, f'{C.NAME}-preview.png'); sheet.save(path); print('preview', path, sheet.size, (fw, fh)); return
    cols = 10; rows = math.ceil(len(frames) / cols)
    sheet = Image.new('RGBA', (cols * fw, rows * fh), CLEAR); meta = {}
    for j, (n, i, f) in enumerate(frames):
        sheet.alpha_composite(f, ((j % cols) * fw, (j // cols) * fh))
        fps, loop, _ = anims[n]
        meta.setdefault(n, {'fps': fps, 'loop': loop, 'frames': []})['frames'].append(j)
    os.makedirs(os.path.join(ROOT, 'public', 'anim'), exist_ok=True); os.makedirs(os.path.join(ROOT, 'src', 'anim'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'public', 'anim', f'{C.NAME}.webp'), quality=92, method=6)
    bb = rig.src.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    info = {'image': f'anim/{C.NAME}.webp', 'cols': cols, 'frame': [fw, fh],
            # where the body sits in a frame (torso x, feet line) and the body's own size, for scale and hitbox
            'anchor': [round((C.TORSO[0] + P[0]) * k, 1), round((C.GROUND + P[1]) * k, 1)],
            'body': [round((bb[2] - bb[0]) * k, 1), round((C.GROUND - bb[1]) * k, 1)],
            # the mouth (water moves leave from here), from the anchor, in sheet px
            'mouth': [round((C.MOUTH[0] - C.TORSO[0]) * k, 1), round((C.MOUTH[1] - C.GROUND) * k, 1)], 'anims': meta}
    with open(os.path.join(ROOT, 'src', 'anim', f'{C.NAME}.json'), 'w') as f: json.dump(info, f, indent=1)
    print('sheet', sheet.size, len(frames), 'frames')


def run(C, anims):
    build(C, anims, sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == 'preview' else None)
