# Skinned animation for pixel-art sprites, kept pixel-art.
# The sprite is upscaled 8x with Scale2x (three passes, so edges stay clean), every 8x pixel is moved by a blend of
# its bones' transforms (linear blend skinning: a limb's pixels follow the limb fully past its joint and blend with the
# body around the joint, so a turned leg bends there instead of coming apart), and each 8x8 block is sampled back at
# its centre. The original palette and single-pixel outlines survive.
# Held weapons (Samurott's seamitars) are separate little sprites: the paw reaches the handle on the other leg, the
# piece that is the weapon vanishes from that leg and the blade comes out of the handle as the paw pulls it away.
#   python scripts/<species>-dot.py              -> public/anim/<species>.png + src/anim/<species>.json
#   python scripts/<species>-dot.py preview DIR  -> DIR/<species>-preview.png (every frame, labelled, at 3x)
#
# Pose fields (all optional): 'g' = whole body (dx, dy, deg, x-squeeze: -1 is turned round); a bone name = deg or
# (deg, dx, dy); 'front' = bones drawn last; per weapon i 'reach<i>' (0..1) bends its paw onto the handle, 'draw<i>'
# = how far it is out (0 sheathed; above 0 it is in the paw, its blade coming out until PULLED, while it turns from
# down its scabbard to lying along the arm that holds it) and 'sword<i>' = a wrist turn off the arm's line (degrees).
# A drawn blade moves with its arm: swing the leg to swing the blade. Degrees turn counter-clockwise on screen; offsets are
# sprite pixels. Keyframed animations are interpolated with smoothstep to as many frames as
# their fps asks for; looping ones are functions of t in [0, 1).
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import label

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLEAR = (0, 0, 0, 0)
UP = 8


def scale2x(a):
    pad = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode='edge')
    P = a; A = pad[:-2, 1:-1]; D = pad[2:, 1:-1]; C = pad[1:-1, :-2]; B = pad[1:-1, 2:]
    eq = lambda x, y: np.all(x == y, axis=2)
    ac, ab, cd, bd = eq(A, C), eq(A, B), eq(C, D), eq(B, D)
    e0 = np.where((ac & ~cd & ~ab)[..., None], A, P)
    e1 = np.where((ab & ~ac & ~bd)[..., None], B, P)
    e2 = np.where((cd & ~bd & ~ac)[..., None], C, P)
    e3 = np.where((bd & ~ab & ~cd)[..., None], D, P)
    h, w, _ = a.shape
    out = np.zeros((h * 2, w * 2, 4), np.uint8)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e0, e1, e2, e3
    return out


def up8(a):
    a = a.copy(); a[a[..., 3] < 128] = 0; a[a[..., 3] >= 128, 3] = 255
    for _ in range(3): a = scale2x(a)
    return a


def poly_mask(shape, poly):
    m = Image.new('L', (shape[1], shape[0]), 0)
    if poly: ImageDraw.Draw(m).polygon(poly, fill=255, outline=255)
    return np.array(m) > 0


def fill_from_neighbours(a, mask, avoid=()):
    # paint masked pixels with the commonest colour among solid neighbours, ring by ring (keeps the palette);
    # colours in `avoid` are never spread (a removed shell's own colours must not grow back as a blob)
    a = a.copy(); h, w = mask.shape; todo = set(zip(*np.nonzero(mask))); avoid = {tuple(c[:3]) for c in avoid}
    for _ in range(60):
        if not todo: break
        done = []
        for y, x in todo:
            cols = [tuple(a[y + dy, x + dx]) for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1))
                    if 0 <= y + dy < h and 0 <= x + dx < w and (y + dy, x + dx) not in todo and a[y + dy, x + dx, 3] > 0]
            cols = [c for c in cols if c[:3] not in avoid] or [c for c in cols if c[:3] != (16, 16, 16)]
            cols = [c for c in cols if c[:3] != (16, 16, 16)] or cols  # prefer body colour over outline
            if cols: done.append(((y, x), max(set(cols), key=cols.count)))
        for (y, x), c in done: a[y, x] = c; todo.discard((y, x))
    return a


def affine(deg, cx, cy, dx, dy):
    # turn deg (counter-clockwise on screen) around (cx, cy), then shift: a 3x3 matrix on (x, y, 1)
    a = math.radians(deg); c, s = math.cos(a), math.sin(a)
    return np.array([[c, s, cx - c * cx - s * cy + dx], [-s, c, cy + s * cx - c * cy + dy], [0, 0, 1.0]])


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


class Rig:
    def __init__(self, S):
        self.S = S
        src = Image.open(os.path.join(ROOT, S.SRC)).convert('RGBA')
        if S.MIRROR: src = ImageOps.mirror(src)
        w, h = src.size; L, T, R, B = S.PAD
        self.size = (w + L + R, h + T + B); self.off = (L, T); self.src = src
        P = lambda p: (p[0] + L, p[1] + T); self.P = P
        base = np.zeros((self.size[1], self.size[0], 4), np.uint8); base[T:T + h, L:L + w] = np.array(src)
        base[base[..., 3] < 128] = 0; base[base[..., 3] >= 128, 3] = 255
        shape = base.shape[:2]
        # weights: a limb pixel follows its bone fully once it is `joint` px past the joint line, half on the line;
        # the joint line goes through the pivot, across the limb's axis (pivot -> axis_to)
        ys, xs = np.mgrid[0:shape[0], 0:shape[1]]
        wts = {}
        for name, (poly, pivot, axis_to, joint) in S.PARTS.items():
            inside = poly_mask(shape, [P(p) for p in poly])
            px, py = P(pivot); ax, ay = axis_to[0] - pivot[0], axis_to[1] - pivot[1]; n = math.hypot(ax, ay); ax, ay = ax / n, ay / n
            wts[name] = np.where(inside, smoothstep(-joint, joint, (xs - px) * ax + (ys - py) * ay), 0.0)
        total = sum(wts.values()); over = total > 1
        for k in list(wts): wts[k] = np.where(over, wts[k] / np.maximum(total, 1e-9), wts[k])
        wts['body'] = 1 - sum(wts[k] for k in S.PARTS)
        self.order = S.ORDER; self.wts = wts
        self.layer = np.argmax(np.stack([wts[b] for b in self.order], -1), -1)  # each pixel draws in its strongest bone's layer
        creams = {tuple(c[:3]) for c in S.CREAMS}
        def without(a, which):  # the sprite with the given weapons gone from their bracers
            a = a.copy()
            for i, H in enumerate(S.HELD):
                if i not in which: continue
                # the weapon piece: its shell colours inside the outline polygon, plus its own outline where that only
                # separated it from the leg (an outline that will face empty space stays: it is the leg's edge)
                region = poly_mask(shape, [P(p) for p in H['on_leg']]); fillable = poly_mask(shape, [P(p) for p in H['fill']])
                cream = np.array([[tuple(a[y, x, :3]) in creams for x in range(shape[1])] for y in range(shape[0])])
                gone = region & cream & (a[..., 3] > 0)
                empty = (a[..., 3] == 0) | (gone & ~fillable)
                dark = region & np.all(a[..., :3] < 40, -1) & (a[..., 3] > 0)
                near = lambda m: np.pad(m, 1)[:-2, 1:-1] | np.pad(m, 1)[2:, 1:-1] | np.pad(m, 1)[1:-1, :-2] | np.pad(m, 1)[1:-1, 2:]
                for _ in range(2): gone |= dark & near(gone) & ~near(empty) & fillable
                a[gone] = 0
                a = fill_from_neighbours(a, gone & fillable, avoid=list(creams) + [(16, 16, 16)])
                for poly, rgb in H.get('paint', ()):  # hand-set: what the bare leg looks like where the piece was
                    a[poly_mask(shape, [P(p) for p in poly])] = (*rgb[:3], 255)
            return a
        # the torso as it is behind the limbs (limbs and both weapons taken away, its outline painted in), drawn
        # underneath everything: it only shows where a limb has moved off, and must never show a weapon there
        limbs = np.zeros(shape, bool)
        for name in S.PARTS: limbs |= wts[name] > 0.5
        back = without(base, range(len(S.HELD))); back[limbs] = 0
        self.back = fill_from_neighbours(back, limbs & poly_mask(shape, [P(p) for p in S.TORSO_FILL]))
        # the sprite for each combination of weapons out of their bracers
        self.variants = {key: without(base, [i for i in range(len(S.HELD)) if key >> i & 1]) for key in range(1 << len(S.HELD))}
        self.pts = {k: self._points(v) for k, v in self.variants.items()}
        self.back_pts = self._points(self.back, back=True)
        # rigid limbs (joint blend under 1 px) are turned as whole 8x images sampled back from the frame, the proper
        # RotSprite way, so a turned leg has no gaps or speckle; their joint heads sit behind them
        self.rigid = [b for b, part in S.PARTS.items() if part[3] < 1]
        lay8 = np.kron(self.layer, np.ones((UP, UP), int))
        self.rigid8 = {key: {b: self._layer8(v, lay8 == self.order.index(b)) for b in self.rigid} for key, v in self.variants.items()}
        self.cap8 = {}
        for name, ((cx, cy), r, fill, ring) in getattr(S, 'CAPS', {}).items():
            cap = np.zeros_like(base); ccx, ccy = P((cx, cy))
            for y in range(shape[0]):
                for x in range(shape[1]):
                    d = math.hypot(x - ccx, y - ccy)
                    if d <= r: cap[y, x] = (16, 16, 16, 255) if ring and d > r - 1 else (*fill[:3], 255)
            self.cap8[name] = Image.fromarray(up8(cap))
        img, origin = S.weapon()
        self.weapon8 = Image.fromarray(up8(np.array(img))); self.worigin = origin

    def _layer8(self, a, mask8):
        a8 = up8(a); a8[~mask8] = 0; return Image.fromarray(a8)

    def turn8(self, img8, m):
        # sample an 8x image back through the 1x-canvas transform m (pixel centres line up across the 8x scale)
        C = np.array([[UP, 0, (UP - 1) / 2], [0, UP, (UP - 1) / 2], [0, 0, 1.0]])
        inv = np.linalg.inv(C @ m @ np.linalg.inv(C))
        return np.array(img8.transform(img8.size, Image.AFFINE, tuple(inv[:2].ravel()), resample=Image.NEAREST))

    def _points(self, a, back=False):
        # every solid 8x pixel: where it sits (in 1x units), its colour, its bone weights and its layer
        a8 = up8(a); ys, xs = np.nonzero(a8[..., 3] > 0)
        sx, sy = (xs + 0.5) / UP - 0.5, (ys + 0.5) / UP - 0.5
        h, w = a.shape[:2]
        x0 = np.clip(np.floor(sx).astype(int), 0, w - 2); y0 = np.clip(np.floor(sy).astype(int), 0, h - 2)
        fx, fy = np.clip(sx - x0, 0, 1), np.clip(sy - y0, 0, 1)
        if back:
            W = np.zeros((len(xs), len(self.order))); W[:, self.order.index('body')] = 1; layer = np.full(len(xs), -1)
        else:
            W = np.stack([self.wts[b][y0, x0] * (1 - fx) * (1 - fy) + self.wts[b][y0, x0 + 1] * fx * (1 - fy)
                          + self.wts[b][y0 + 1, x0] * (1 - fx) * fy + self.wts[b][y0 + 1, x0 + 1] * fx * fy for b in self.order], -1)
            W /= np.maximum(W.sum(-1, keepdims=True), 1e-9)
            layer = self.layer[np.clip(np.floor(sy + 0.5).astype(int), 0, h - 1), np.clip(np.floor(sx + 0.5).astype(int), 0, w - 1)]
        return {'x': sx, 'y': sy, 'c': a8[ys, xs], 'W': W, 'layer': layer}

    def mats(self, pose):
        gx, gy, gdeg, gsx = garg(pose)
        tc = self.P(self.S.TORSO)
        # whole body: squeezed sideways around the torso (gsx < 0 is the body turned round, for spins), turned, shifted
        G = affine(gdeg, tc[0], tc[1], gx, gy) @ np.array([[gsx, 0, tc[0] - gsx * tc[0]], [0, 1, 0], [0, 0, 1.0]])
        M = {'body': G}
        for b in self.S.PARTS:
            deg, dx, dy = arg(pose, b); pv = self.P(self.S.PARTS[b][1])
            M[b] = G @ affine(deg, pv[0], pv[1], dx, dy)
        # reaching: 'reach<i>' bends the paw that draws weapon i toward that weapon's handle (on the other leg),
        # turning the leg about its shoulder to point at it and stretching the rest; 1 = the paw is on the handle
        for i, H in [(i, H) for _ in range(4) for i, H in enumerate(self.S.HELD)]:  # a few rounds: each reach moves the other's handle
            r = pose.get(f'reach{i}', 0)
            if r <= 0: continue
            leg = H['grip_leg']; pv = np.array(self.P(self.S.PARTS[leg][1])); gp = np.array(self.P(H['grip']))
            Gi = np.linalg.inv(G); hx, hy, _ = Gi @ M[H['sheath_leg']] @ np.array([*self.P(H['handle']), 1.0])
            want = np.array([hx, hy]) - pv; have = gp - pv
            ik = math.degrees(math.atan2(-want[1], want[0]) - math.atan2(-have[1], have[0]))
            deg0, dx0, dy0 = arg(pose, leg)
            ik = deg0 + max(-H.get('reach_max', 180), min(H.get('reach_max', 180), (ik - deg0 + 180) % 360 - 180))
            end = affine(ik, pv[0], pv[1], 0, 0) @ np.array([*gp, 1.0])
            dx1, dy1 = hx - end[0], hy - end[1]
            k = min(1.0, REACH_STRETCH / max(1e-9, math.hypot(dx1, dy1))); dx1, dy1 = dx1 * k, dy1 * k  # never pull a leg long
            M[leg] = G @ affine(deg0 + (ik - deg0) * r, pv[0], pv[1], dx0 + (dx1 - dx0) * r, dy0 + (dy1 - dy0) * r)
        return M

    def paint(self, pts, M, sel, canvas, under=False):
        # move the chosen pixels by their blended bone transforms and write them at 8x (2x2 footprint: no holes)
        x, y, W, c = pts['x'][sel], pts['y'][sel], pts['W'][sel], pts['c'][sel]
        X = np.zeros_like(x); Y = np.zeros_like(y)
        for j, b in enumerate(self.order):
            m = M[b]; wj = W[:, j]
            X += wj * (m[0, 0] * x + m[0, 1] * y + m[0, 2]); Y += wj * (m[1, 0] * x + m[1, 1] * y + m[1, 2])
        X = np.round((X + 0.5) * UP - 0.5).astype(int); Y = np.round((Y + 0.5) * UP - 0.5).astype(int)
        H8, W8 = canvas.shape[:2]
        for k, (ox, oy) in enumerate(((0, 0), (1, 0), (0, 1), (1, 1))):
            xx, yy = X + ox, Y + oy; ok = (xx >= 0) & (yy >= 0) & (xx < W8) & (yy < H8)
            xx, yy, cc = xx[ok], yy[ok], c[ok]
            if k or under: free = canvas[yy, xx, 3] == 0; xx, yy, cc = xx[free], yy[free], cc[free]  # under: only empty spots
            canvas[yy, xx] = cc

    def weapon_layer(self, i, pose, M):
        # The paw holds the weapon by its handle from the moment it is drawn (draw > 0). While draw runs up to PULLED
        # the blade comes out of the handle (the hidden part of it is still in the scabbard), and the whole time it
        # turns from pointing down its scabbard to the pose's direction.
        H = self.S.HELD[i]; d = pose.get(f'draw{i}', 0)
        def at(bone, p): # a point carried by a bone (1x canvas coords) and how far that bone has turned
            q = M[bone] @ np.array([*self.P(p), 1.0]); return (q[0], q[1]), math.degrees(math.atan2(-M[bone][1, 0], M[bone][0, 0]))
        # the scabbard's direction from the body and that leg's own pose (not a reach the leg may be making itself)
        G = M['body']; turned = math.degrees(math.atan2(-G[1, 0], G[0, 0])) + arg(pose, H['sheath_leg'])[0]
        sheath_deg = H['sheath_deg'] + turned
        pos, arm = at(H['grip_leg'], H['grip'])
        target = H['grip_deg'] + arm + pose.get(f'sword{i}', 0)  # along the arm, plus the wrist
        deg = sheath_deg + ((target - sheath_deg + 180) % 360 - 180) * float(smoothstep(0, 1, d))
        canvas = Image.new('RGBA', (self.size[0] * UP, self.size[1] * UP), CLEAR)
        canvas.alpha_composite(self.weapon8, (round(pos[0] * UP - self.worigin[0] * UP), round(pos[1] * UP - self.worigin[1] * UP)))
        canvas = np.array(canvas.rotate(deg, resample=Image.NEAREST, center=(pos[0] * UP, pos[1] * UP)))
        if d < PULLED: # only as much blade as has come out so far
            a = math.radians(deg); reach = self.S.BLADE_FROM + self.S.BLADE_LEN * d / PULLED
            ys, xs = np.mgrid[0:canvas.shape[0], 0:canvas.shape[1]]
            canvas[(xs - pos[0] * UP) * math.cos(a) - (ys - pos[1] * UP) * math.sin(a) > reach * UP] = 0
        return canvas, d

    def render(self, pose):
        S = self.S; M = self.mats(pose)
        out = [i for i in range(len(S.HELD)) if pose.get(f'draw{i}', 0) > 0]
        key = sum(1 << i for i in out); pts = self.pts[key]
        frame = np.zeros((self.size[1] * UP, self.size[0] * UP, 4), np.uint8)
        self.paint(self.back_pts, M, np.ones(len(self.back_pts['x']), bool), frame)
        weapons = {i: self.weapon_layer(i, pose, M) for i in out}
        def put(img): a = img[..., 3] > 0; frame[a] = img[a]
        # draw order: back to front, except bones a pose brings to the front (a far paw reaching across the chest)
        order = [b for b in self.order if b not in pose.get('front', ())] + list(pose.get('front', ()))
        for b in order:
            j = self.order.index(b)
            for i, (img, d) in weapons.items(): # a weapon goes just under the paw holding it
                if S.HELD[i]['grip_leg'] == b: put(img)
            if b in self.rigid:
                layer = self.turn8(self.rigid8[key][b], M[b])
                if b in self.cap8:  # joint head behind the leg
                    cap = self.turn8(self.cap8[b], M[b]); free = layer[..., 3] == 0; layer[free] = cap[free]
            else:
                layer = np.zeros_like(frame); self.paint(pts, M, pts['layer'] == j, layer)
            put(layer)
        return Image.fromarray(tidy(np.ascontiguousarray(frame[UP // 2::UP, UP // 2::UP])))


def tidy(a):
    # clean what the blend leaves at the joints: lone pixels go, pinholes close, and stray outline dots inside the body
    # (a dark pixel with no transparency around it and no other dark pixel next to it) take the colour around them
    solid = a[..., 3] > 0; dark = solid & np.all(a[..., :3] < 40, -1)
    pad = lambda m: np.pad(m, 1)
    def nb4(m): p = pad(m); return p[:-2, 1:-1].astype(int) + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]
    def nb8(m): p = pad(m); return nb4(m) + p[:-2, :-2] + p[:-2, 2:] + p[2:, :-2] + p[2:, 2:]
    a = a.copy()
    lab, n = label(solid)  # crumbs: bits of a few pixels cut loose from the body
    if n: sizes = np.bincount(lab.ravel()); a[(sizes < 5)[lab] & solid] = 0
    solid = a[..., 3] > 0
    fix = (~solid & (nb4(solid) >= 3)) | (dark & (nb8(solid) == 8) & (nb8(dark) == 0))
    h, w = solid.shape
    for y, x in zip(*np.nonzero(fix)):
        cols = [tuple(a[y + dy, x + dx]) for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)) if 0 <= y + dy < h and 0 <= x + dx < w and a[y + dy, x + dx, 3] > 0]
        if cols: a[y, x] = max(set(cols), key=cols.count)
    return a


REACH_STRETCH = 6  # px a reaching leg may shift beyond turning, so it never stretches or tears
PULLED = 0.35  # how far into 'draw' the whole blade is out


def garg(pose):
    g = tuple(pose.get('g', ()))
    return (g + (0, 0, 0, 1)[len(g):])[:4]


def arg(pose, name):
    v = pose.get(name, 0)
    return (v, 0, 0) if not isinstance(v, (tuple, list)) else (tuple(v) + (0, 0))[:3]


def lerp_pose(a, b, k):
    k = k * k * (3 - 2 * k); out = {}
    for key in set(a) | set(b):
        if key.startswith('sword'):
            va, vb = a.get(key, b.get(key)), b.get(key, a.get(key))
            out[key] = va + ((vb - va + 180) % 360 - 180) * k; continue
        if key.startswith(('draw', 'reach')): out[key] = a.get(key, 0) + (b.get(key, 0) - a.get(key, 0)) * k; continue
        if key == 'front': out[key] = a.get(key, ()) if k < 0.5 else b.get(key, ()); continue
        va, vb = (garg(a), garg(b)) if key == 'g' else (arg(a, key), arg(b, key))
        out[key] = tuple(va[i] + (vb[i] - va[i]) * k for i in range(len(va)))
    return out


def frames_of(spec):
    if 'pose' in spec: return [spec['pose'](i / spec['n']) for i in range(spec['n'])]
    keys = spec['keys']; end = keys[-1][0]; n = int(round(end * spec['fps'])) + 1; out = []
    for i in range(n):
        t = i / spec['fps']; j = max(k for k in range(len(keys)) if keys[k][0] <= t + 1e-9)
        if j == len(keys) - 1: out.append(keys[j][1]); continue
        (t0, p0), (t1, p1) = keys[j], keys[j + 1]
        out.append(lerp_pose(p0, p1, (t - t0) / (t1 - t0)))
    return out


def run(S, ANIMS):
    rig = Rig(S)
    names = list(ANIMS)
    frames = [(n, i, rig.render(p)) for n in names for i, p in enumerate(frames_of(ANIMS[n]))]
    fw, fh = rig.size
    for n, i, f in frames: # nothing may touch the frame's edge, or it would be cut off in the game
        bb = f.getbbox()
        if bb and (bb[0] == 0 or bb[1] == 0 or bb[2] == fw or bb[3] == fh): raise SystemExit(f'{n} {i} touches the frame edge {bb}; widen PAD')
    if len(sys.argv) > 2 and sys.argv[1] == 'preview':
        cols, Z, lab = 12, 3, 12; rows = sum(math.ceil(len(frames_of(ANIMS[n])) / cols) for n in names)
        sheet = Image.new('RGBA', (cols * fw * Z, rows * (fh * Z + lab)), (36, 54, 72, 255)); d = ImageDraw.Draw(sheet); r, last = -1, None
        for n, i, f in frames:
            if n != last or i % cols == 0: r += 1; last = n
            x, y = (i % cols) * fw * Z, r * (fh * Z + lab)
            gy = y + lab + (S.GROUND + rig.off[1]) * Z
            d.line([(x, gy), (x + fw * Z, gy)], fill=(90, 110, 130, 255))
            sheet.alpha_composite(f.resize((fw * Z, fh * Z), Image.NEAREST), (x, y + lab)); d.text((x + 3, y), f'{n} {i}', fill=(255, 255, 0, 255))
        sheet.save(os.path.join(sys.argv[2], f'{S.NAME}-preview.png')); print('preview', sheet.size); return
    cols = 12; rows = math.ceil(len(frames) / cols)
    sheet = Image.new('RGBA', (cols * fw, rows * fh), CLEAR); meta = {}
    for k, (n, i, f) in enumerate(frames):
        sheet.alpha_composite(f, ((k % cols) * fw, (k // cols) * fh))
        spec = ANIMS[n]; a = meta.setdefault(n, {'fps': spec['fps'], 'loop': 'pose' in spec, 'frames': []})
        a['frames'].append(k)
        if 'hit' in spec: a['hit'] = spec['hit']
        if spec.get('wait'): a['wait'] = True
    sheet.save(os.path.join(ROOT, 'public', 'anim', f'{S.NAME}.png'), optimize=True)
    bb = rig.src.getbbox(); L, T = rig.off
    info = {'image': f'anim/{S.NAME}.png', 'pixel': True, 'cols': cols, 'frame': [fw, fh],
            'anchor': [S.TORSO[0] + L, S.GROUND + T], 'body': [bb[2] - bb[0], S.GROUND - bb[1]],
            'mouth': [S.MOUTH[0] - S.TORSO[0], S.MOUTH[1] - S.GROUND], 'anims': meta}
    with open(os.path.join(ROOT, 'src', 'anim', f'{S.NAME}.json'), 'w') as f: json.dump(info, f, indent=1)
    print('sheet', sheet.size, len(frames), 'frames')
