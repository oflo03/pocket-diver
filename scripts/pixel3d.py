# Turns the frames scripts/render3d.py rendered from a 3D model into the game's pixel-art sheet:
#   python scripts/pixel3d.py <species>               -> public/anim/<species>.png + src/anim/<species>.json
#   python scripts/pixel3d.py <species> preview DIR   -> DIR/<species>-preview.png (every frame, labelled, at 3x)
# Each K x K block of the render becomes one pixel: its colours are mapped to the palette of the species' Black/White
# sprite (so it sits with the other sprites) and the block takes its commonest one; lone dots can then be cleaned away
# (the species' DESPECKLE). Outlines are one dark pixel: round
# the silhouette, and along every edge where a nearer part overlaps a farther one (a leg in front of the chest);
# smaller steps (shell segments, the mustache over the chin) get a line in the next darker shade of their colour.
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = 0  # palette index of the outline colour (the darkest)
TRIM = None  # a species' TRIM: px of margin to cut every frame down to (None: keep CANVAS as it is)
ONLY = os.environ.get('PIXEL3D_ONLY', '').split(',') if os.environ.get('PIXEL3D_ONLY') else None  # preview just these
PAGE = 4000  # px: the tallest a sheet image gets before the frames go on to another
EDGE = 0.12  # metres of depth between neighbours that makes an outline between them, at most: a species' own is 1.5x its
# CREASE (scaled to its size), so an arm or leg lying against the body still gets its outline
CREASE = 0.025  # a smaller step (one shell segment over the next) draws a line one shade darker instead (a species' CREASE)


def lin(c): c = c / 255; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lab(rgb):
    r = lin(rgb) @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T / np.array([0.9505, 1, 1.089])
    f = np.where(r > 0.008856, np.cbrt(r), 7.787 * r + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


# Matching a rendered colour to the palette: lightness counts for less than hue (MATCH_L), so a colour in shadow goes
# to a darker shade of its own hue rather than to whatever palette colour is darkest near it (the outline black, a
# dark brown): the toon shadow step is deep, and matched plainly the shadows snapped to black. The outline colour is
# only matched by colours really that dark (MATCH_BLACK lightness or less); otherwise it is the outline's alone.
MATCH_L, MATCH_BLACK = 0.5, 100
# The toon steps (render3d, S.STEPS: 0.42 / 0.66 / 0.86 / 1.04 of the albedo) make a sprite far darker than its
# Black/White original, whose shading is a shade or two of each colour: with the light pass (render3d's frame_l) each
# pixel's step is known, and its colour is brightened to albedo x step ** SHADE_GAMMA (0.42 -> 0.62, 0.66 -> 0.80,
# 0.86 -> 0.92) before it is matched. Only the shading changes: a black part is black in the albedo and stays black.
SHADE_GAMMA = 0.55


def match(L_, pal):
    P = lab(pal); d = (((L_[..., None, :] - P) * np.array([MATCH_L, 1, 1])) ** 2).sum(-1)
    d[..., 0] = np.where(L_[..., 0] <= MATCH_BLACK, d[..., 0], np.inf)
    return np.argmin(d, -1)


def palette(sprite, shadows=False):
    im = np.array(Image.open(os.path.join(ROOT, sprite)).convert('RGBA'))
    cols, n = np.unique(im[im[..., 3] > 127][:, :3], axis=0, return_counts=True)
    pal = cols[np.argsort(-n)].astype(float)
    i = int(np.argmin(pal.sum(1))); pal[[0, i]] = pal[[i, 0]]  # darkest first: the outline
    if shadows:  # a darker shade for each colour the sprite has none for, so the shading of a rounded body survives
        L = lab(pal); extra = [c * 0.68 for c in pal[1:] if np.min(((L - lab((c * 0.68)[None])[0]) ** 2).sum(1)) > 120]
        if extra: pal = np.vstack([pal] + extra)
    return pal


def darker(pal):
    # each colour's next darker shade in the palette: the nearest in hue among the colours darker than it
    L = lab(pal); out = np.zeros(len(pal), int)
    for i, (l, a, b) in enumerate(L):
        cand = [j for j in range(len(pal)) if L[j, 0] < l - 8]
        out[i] = min(cand, key=lambda j: (L[j, 1] - a) ** 2 + (L[j, 2] - b) ** 2 + 0.3 * (L[j, 0] - (l - 20)) ** 2) if cand else OUT
    return out


def despeckle(out, rounds=2):
    # drawn sprites have no lone dots: a pixel with fewer than two of its eight neighbours in its own colour takes
    # the colour most of its neighbours have (empty space is not a colour; the silhouette is left alone)
    h, w = out.shape
    for _ in range(rounds):
        pad = np.pad(out, 1, constant_values=-1)
        nb = np.stack([pad[1 + dy:1 + dy + h, 1 + dx:1 + dx + w] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx], -1)
        same = (nb == out[..., None]).sum(-1)
        lone = (out >= 0) & (same < 2) & ((nb >= 0).sum(-1) >= 6)
        for y, x in zip(*np.nonzero(lone)):
            v = nb[y, x][nb[y, x] >= 0]; out[y, x] = np.bincount(v).argmax()
    return out


def sprite_face(sprite, pal, cfg):
    # the species' sprite face, ready to lay down: its pixels as palette indices (-1 clear), flipped to face right if
    # cfg['flip'], the box holding its eyes, nose and mouth, its two eye centres (screen-left first) and its skin colours
    im = np.array(Image.open(os.path.join(ROOT, sprite)).convert('RGBA')); h, w = im.shape[:2]
    idx = np.full((h, w), -1)
    for y, x in zip(*np.nonzero(im[..., 3] > 127)): idx[y, x] = int(np.argmin(((pal - im[y, x, :3]) ** 2).sum(-1)))
    (x0, y0, x1, y1), eyes = cfg['box'], [np.array(e, float) + 0.5 for e in cfg['eyes']]  # pixel centres
    if cfg.get('flip'): idx = idx[:, ::-1]; x0, x1 = w - 1 - x1, w - 1 - x0; eyes = [np.array([w - e[0], e[1]]) for e in eyes]
    eyes.sort(key=lambda e: e[0])
    near = lambda cs: {int(np.argmin(((pal - np.array(c, float)) ** 2).sum(-1))) for c in cs}
    return {'idx': idx, 'box': (x0, y0, x1, y1), 'eyes': eyes, 'skin': near(cfg['skin']), 'keep': near(cfg['skin']) | near(cfg.get('keep', ()))}


def lay_face(out, solid, zb, f, sf, span, facing_min=0.35):
    # the sprite's face laid over the render's (frames face right): its eyes on the frame's eyes (f: the two eyes,
    # screen-left first, their depth, how squarely the face turns to the camera), stretched along the line between them
    # as that line is (a turned head brings them closer, a tilted one tilts it) and across it to the head's size. Its
    # eyes, nose and mouth are always drawn; its skin only over the render's own features (to hide them). Nothing goes
    # where something is in front of the face, off the body, or when the face is turned away.
    ax, ay, bx, by, depth, facing = f; A, B = np.array([ax, ay]), np.array([bx, by])
    A_, B_ = sf['eyes']; ub = B_ - A_; Lb = np.linalg.norm(ub); uf = B - A; Lf = np.linalg.norm(uf)
    if facing < facing_min or Lf < 0.3 * span: return
    e, ef = ub / Lb, uf / Lf; n, nf = np.array([-e[1], e[0]]), np.array([-ef[1], ef[0]]); sa, k = Lf / Lb, span / Lb
    x0, y0, x1, y1 = sf['box']; h, w = out.shape
    corners = [A + ((np.array(c) - A_) @ e) * sa * ef + ((np.array(c) - A_) @ n) * k * nf for c in ((x0, y0), (x1 + 1, y0), (x0, y1 + 1), (x1 + 1, y1 + 1))]
    qx0, qy0 = np.floor(np.min(corners, 0)).astype(int); qx1, qy1 = np.ceil(np.max(corners, 0)).astype(int)
    for qy in range(max(0, qy0), min(h, qy1 + 1)):
        for qx in range(max(0, qx0), min(w, qx1 + 1)):
            if not solid[qy, qx] or zb[qy, qx] < depth - 0.05: continue
            d = np.array([qx + 0.5, qy + 0.5]) - A; pc = A_ + (d @ ef) / sa * e + (d @ nf) / k * n; px, py = int(np.floor(pc[0])), int(np.floor(pc[1]))
            if not (x0 <= px <= x1 and y0 <= py <= y1) or sf['idx'][py, px] < 0: continue
            c = sf['idx'][py, px]
            if c not in sf['skin'] or out[qy, qx] not in sf['keep']: out[qy, qx] = c


def shade_lift(col, light, scale):
    # the colour render brightened by its light step (SHADE_GAMMA above), as sRGB 0..255
    v = light.astype(float) / (65535 if light.dtype == np.uint16 or light.max() > 255 else 255)
    s = np.maximum(np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4), 0.05) * scale  # (stored sRGB-encoded)
    c = lin(col[..., :3].astype(float)) * s[..., None] ** (SHADE_GAMMA - 1)
    return 255 * np.clip(np.where(c <= 0.0031308, c * 12.92, 1.055 * np.maximum(c, 0) ** (1 / 2.4) - 0.055), 0, 1)


def pixelize(col, z, pal, K, depth, lift, clean=False, chroma=1.0, crease_at=CREASE, rims=(), face=None, eye=None, stamps=None, full=None, edge_at=EDGE,
             light=None, light_scale=1.25):
    a = col.astype(float); h, w = a.shape[0] // K, a.shape[1] // K
    solid = a[..., 3] > 127
    if light is not None: a = np.concatenate([shade_lift(col, light, light_scale), a[..., 3:]], -1)
    rgb = 255 * np.clip((a[..., :3] / 255) ** lift[0] * lift[1], 0, 1)  # the textures' baked shading is dim: lift it
    L_ = lab(rgb); L_[..., 1:] *= chroma  # pale textures read as grey against a sprite's saturated colours: push their hue
    idx = match(L_, pal); idx[~solid] = -1
    blocks = idx.reshape(h, K, w, K).transpose(0, 2, 1, 3).reshape(h, w, K * K)
    out = np.full((h, w), -1)
    cnt = np.stack([(blocks == c).sum(-1) for c in range(len(pal))], -1)
    keep = (blocks >= 0).sum(-1) * 2 >= K * K
    mode = cnt.argmax(-1)
    # thin dark lines in the texture (the gaps between shell segments) would lose the vote: a colour much darker than
    # the block's commonest one wins once it covers a quarter of the block
    L = lab(pal)[:, 0]; dark = np.where(cnt * 4 >= K * K, L[None, None, :], 1e9).argmin(-1)
    pick = np.where(L[dark] < L[mode] - 25, dark, mode)
    out[keep] = pick[keep]
    if clean: out = despeckle(out)
    zz = z.astype(float) / (65535 if z.dtype == np.uint16 or z.max() > 255 else 255)
    if zz.ndim == 3: zz = zz[..., 0]
    zz = np.where(zz <= 0.04045, zz / 12.92, ((zz + 0.055) / 1.055) ** 2.4) * (depth[1] - depth[0]) + depth[0]
    zz[~solid] = 1e9
    zb = zz.reshape(h, K, w, K).min(axis=(1, 3))
    S = out >= 0; edge = np.zeros_like(S); crease = np.zeros_like(S); grow = np.zeros_like(S)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        nz = np.roll(np.roll(zb, dy, 0), dx, 1); ns = np.roll(np.roll(S, dy, 0), dx, 1)
        edge |= S & ns & (nz - zb > edge_at); crease |= S & ns & (nz - zb > crease_at); grow |= ns
    crease &= ~edge
    # no crease or overlap line within two pixels of the silhouette: the surface curving away there is a steep depth step
    # too, and it drew a second outline (faint or black) just inside the real one
    rim1 = S & ~(np.roll(S, 1, 0) & np.roll(S, -1, 0) & np.roll(S, 1, 1) & np.roll(S, -1, 1)); near = rim1.copy()
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)): near |= S & np.roll(np.roll(rim1, dy, 0), dx, 1)
    crease &= ~near; edge &= ~near  # (the same for an overlap line: there it read as a second black outline)
    out[crease] = darker(pal)[out[crease]]
    if len(rims):  # parts (by colour) drawn with a dark rim: a scalchop flush with the body has no depth step to show
        part = np.isin(out, [int(np.argmin(((pal - c) ** 2).sum(-1))) for c in rims]); rim = np.zeros_like(part)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            n_ = np.roll(np.roll(out, dy, 0), dx, 1); rim |= part & (n_ >= 0) & ~np.isin(n_, out[part])
        dk = darker(pal); L = lab(pal)[:, 0]; once = dk[out[rim]]  # one shade darker, or two if that is still light
        out[rim] = np.where(L[once] < 45, once, dk[once])
    out[edge] = OUT; out[grow & ~S] = OUT
    if eye is not None:
        # eyes (render3d's eye pass) win their blocks, drawn as big as they are in the render: each eye (a connected patch
        # of it) takes as many blocks as its render pixels fill, those it covers most. Its dark part (pupil and iris: the
        # pixels darker than halfway between its lightest and darkest) takes as many of them, the darkest, in the outline
        # colour where dark or else the iris' own colour (pale irises the palette lacks, Squirtle's brown, would otherwise
        # vanish); the rest (the white) is the eye's commonest colour there. Its darkest block is always the outline
        # colour, so every eye has a pupil
        em = (eye[..., 0] if eye.ndim == 3 else eye) > 127
        em &= solid; eb = em.reshape(h, K, w, K).transpose(0, 2, 1, 3).reshape(h, w, K * K); cov = eb.sum(-1)
        Lr = L_[..., 0].reshape(h, K, w, K).transpose(0, 2, 1, 3).reshape(h, w, K * K)
        seen = np.zeros_like(S); found = []
        for y0, x0 in zip(*np.nonzero((cov > 0) & S)):
            if seen[y0, x0]: continue
            blob, todo = [], [(y0, x0)]; seen[y0, x0] = True
            while todo:
                y, x = todo.pop(); blob.append((y, x))
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and cov[ny, nx] > 0 and S[ny, nx]: seen[ny, nx] = True; todo.append((ny, nx))
            area = sum(cov[p] for p in blob)
            if area * 8 < K * K: continue  # a speck of eye at the edge of the head
            found.append((area, blob, sum(cov[p] * p[0] for p in blob) / area, sum(cov[p] * p[1] for p in blob) / area))
            on = sorted(blob, key=lambda p: -cov[p])[:max(1, round(area / (K * K)))]
            Ls = np.concatenate([Lr[p][eb[p]] for p in blob]); mid = (Ls.min() + Ls.max()) / 2
            if Ls.max() - Ls.min() < 25: nd = len(on) if Ls.mean() < 50 else 1  # all of one tone: all dark, or just a pupil
            else: nd = max(1, round((Ls < mid).sum() / (K * K)))
            shade = {p: Lr[p][eb[p]].mean() for p in on}
            for k, p in enumerate(sorted(on, key=lambda p: shade[p])):
                v = blocks[p][eb[p]]; v = v[v >= 0]
                if k < nd:
                    dv = blocks[p][eb[p] & (Lr[p] < mid)]; dv = dv[dv >= 0]
                    out[p] = OUT if k == 0 or shade[p] < 45 or not len(dv) else np.bincount(dv, minlength=len(pal)).argmax()
                else: out[p] = np.bincount(v, minlength=len(pal)).argmax()
        if stamps:  # the official sprite's eyes (sprite_eyes) in place of the rendered ones, largest on largest
            free = S & ~edge
            for r, ((area, blob, cy, cx), patch) in enumerate(zip(sorted(found, key=lambda f: -f[0]), stamps)):
                # mostly hidden (the head turned away): the rendered eye stays. full = each eye's area when it shows best
                # (eye_areas); the sprite's own eye may be drawn bigger than the render's
                if area < 0.35 * (full[r] if full and r < len(full) else len(patch) * K * K): continue
                inside = set(blob); ring = []
                for y, x in blob:
                    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and free[ny, nx] and (ny, nx) not in inside and out[ny, nx] != OUT: ring.append(out[ny, nx])
                if ring:  # the rendered eye goes under the skin round it
                    skin = np.bincount(ring).argmax()
                    for p in blob:
                        if free[p]: out[p] = skin
                for dx, dy, c in patch:
                    y, x = int(round(cy + dy)), int(round(cx + dx))
                    if 0 <= y < h and 0 <= x < w and free[y, x]: out[y, x] = c
    if face: lay_face(out, S, zb, *face)
    img = np.zeros((h, w, 4), np.uint8); m = out >= 0
    img[m, :3] = pal[out[m]].astype(np.uint8); img[m, 3] = 255
    return Image.fromarray(img)


EXPOSE = (0, 0.25, 0.45, 0.65)  # the see-through steps a long exposure's blur is drawn in (how long the body lit the pixel)


def exposure(cols, pal, K, lift, chroma, lights=None, light_scale=1.25):
    # a fast move's long exposure (render3d's frame_mJ, oldest first): the poses it passed through averaged as light on
    # film (in linear light, the later ones a little stronger, as the eye follows the move), cut to pixels by block
    # average; each pixel takes the palette colour nearest its average and the see-through step nearest how long the
    # body covered it. No outline and no block vote, so it reads as one blur rather than copies of the body
    acc = 0; tot = 0
    for j, c in enumerate(cols):
        if lights is not None and lights[j] is not None: c = np.concatenate([shade_lift(c, lights[j], light_scale), c[..., 3:]], -1)
        w = 0.4 + 0.6 * (j + 1) / len(cols); a = c[..., 3:4].astype(float) / 255
        acc = acc + w * np.concatenate([lin(c[..., :3].astype(float)) * a, a], -1); tot += w
    acc = acc / tot; h, w_ = acc.shape[0] // K, acc.shape[1] // K
    blk = acc.reshape(h, K, w_, K, 4).mean(axis=(1, 3)); A = blk[..., 3]
    C = blk[..., :3] / np.maximum(A[..., None], 1e-6)
    srgb = 255 * np.where(C <= 0.0031308, C * 12.92, 1.055 * np.maximum(C, 0) ** (1 / 2.4) - 0.055)
    rgb = 255 * np.clip((srgb / 255) ** lift[0] * lift[1], 0, 1)
    L_ = lab(rgb); L_[..., 1:] *= chroma
    idx = match(L_, pal)
    steps = np.array(EXPOSE); alpha = steps[np.argmin(np.abs(np.minimum(A, 1)[..., None] * 0.85 - steps), -1)]
    img = np.zeros((h, w_, 4), np.uint8); img[..., :3] = pal[idx].astype(np.uint8); img[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.fromarray(img)


def eye_areas(fdir, names, meta, K):
    # each eye's area (render pixels) when it shows best, largest eye first: over every frame, the eyes found as pixelize
    # finds them (connected patches of eye blocks), their areas ranked, and the 90th percentile of each rank
    ranks = []
    for n in names:
        for i in range(meta[n]['n']):
            ep = os.path.join(fdir, f'{n}_{i:03d}_eye.png')
            if not os.path.exists(ep): continue
            a = np.array(Image.open(os.path.join(fdir, f'{n}_{i:03d}_col.png')).convert('RGBA'))[..., 3] > 127
            em = (np.array(Image.open(ep).convert('L')) > 127) & a; h, w = em.shape[0] // K, em.shape[1] // K
            cov = em[:h * K, :w * K].reshape(h, K, w, K).sum(axis=(1, 3)); seen = np.zeros_like(cov, bool); areas = []
            for y0, x0 in zip(*np.nonzero(cov)):
                if seen[y0, x0]: continue
                todo, tot = [(y0, x0)], 0; seen[y0, x0] = True
                while todo:
                    y, x = todo.pop(); tot += cov[y, x]
                    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and cov[ny, nx]: seen[ny, nx] = True; todo.append((ny, nx))
                if tot * 8 >= K * K: areas.append(tot)
            for r, v in enumerate(sorted(areas, reverse=True)):
                if r == len(ranks): ranks.append([])
                ranks[r].append(v)
    return [float(np.percentile(r, 90)) for r in ranks]


def sprite_eyes(sprite, pal, boxes):
    # the eyes of the official sprite (SPRITE_EYES: a box round each, x0, y0, x1, y1 inclusive): each box's pixels but the skin
    # (the two commonest light colours just outside it), as (dx, dy, palette index) from the box's centre, flipped (the
    # sprite faces left, the frames right), largest eye first
    im = np.array(Image.open(os.path.join(ROOT, sprite)).convert('RGBA')).astype(int); h, w = im.shape[:2]
    idx = {tuple(c): i for i, c in enumerate(pal.astype(int))}; light = lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2] > 60; out = []
    for x0, y0, x1, y1 in boxes:
        cnt = {}
        for y in range(y0 - 1, y1 + 2):
            for x in range(x0 - 1, x1 + 2):
                if 0 <= y < h and 0 <= x < w and not (x0 <= x <= x1 and y0 <= y <= y1) and im[y, x, 3] > 127 and light(im[y, x, :3]):
                    cnt[tuple(im[y, x, :3])] = cnt.get(tuple(im[y, x, :3]), 0) + 1
        skin = set(sorted(cnt, key=cnt.get, reverse=True)[:2]); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        out.append([(cx - x, y - cy, idx[tuple(im[y, x, :3])]) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)
                    if im[y, x, 3] > 127 and tuple(im[y, x, :3]) not in skin])
    return sorted(out, key=len, reverse=True)


def main():
    species = sys.argv[1]
    spec = load(species); fdir = os.path.join(ROOT, 'models', species, 'frames')
    meta = json.load(open(os.path.join(fdir, 'frames.json'))); g = meta.pop('_')
    pal = palette(spec['SPRITE'], spec['SHADOWS']); global TRIM; TRIM = spec['TRIM']
    sf = sprite_face(spec['SPRITE'], pal, spec['FACE']) if spec['FACE'] else None
    st = sprite_eyes(spec['SPRITE'], pal, spec['SPRITE_EYES']) if spec['SPRITE_EYES'] else None
    names = [n for n in spec['ORDER'] if n in meta and (not ONLY or n in ONLY)]
    full = eye_areas(fdir, names, meta, g['K']) if st else None
    frames = []
    for n in names:
        for i in range(meta[n]['n']):
            col = np.array(Image.open(os.path.join(fdir, f'{n}_{i:03d}_col.png')).convert('RGBA'))
            z = np.array(Image.open(os.path.join(fdir, f'{n}_{i:03d}_z.png')))
            fc = (meta[n]['face'][i], sf, g['eye_span']) if sf and 'face' in meta[n] else None
            ep = os.path.join(fdir, f'{n}_{i:03d}_eye.png'); eye = np.array(Image.open(ep).convert('L')) if os.path.exists(ep) else None
            lp = os.path.join(fdir, f'{n}_{i:03d}_l.png'); light = np.array(Image.open(lp)) if os.path.exists(lp) else None
            if light is not None and light.ndim == 3: light = light[..., 0]
            f = pixelize(col, z, pal, g['K'], g['depth'], spec['LIFT'], spec['DESPECKLE'], spec['CHROMA'], spec['CREASE'], spec['RIMS'], fc, eye, st, full, spec['EDGE'],
                         light, g.get('light', 1.25))
            # a fast move's long exposure (render3d's samples since the last frame, frame_mJ): one blur behind the body as
            # it is now, drawn sharp on top
            j = 1
            while os.path.exists(os.path.join(fdir, f'{n}_{i:03d}_m{j}_col.png')): j += 1
            if j > 1:
                ms = [np.array(Image.open(os.path.join(fdir, f'{n}_{i:03d}_m{k}_col.png')).convert('RGBA')) for k in range(1, j)]
                def grey(path):
                    if not os.path.exists(path): return None
                    v = np.array(Image.open(path)); return v[..., 0] if v.ndim == 3 else v
                ls = [grey(os.path.join(fdir, f'{n}_{i:03d}_m{k}_l.png')) for k in range(1, j)] + [light]
                f = Image.alpha_composite(exposure(ms + [col], pal, g['K'], spec['LIFT'], spec['CHROMA'], ls, g.get('light', 1.25)), f)
            bb = f.getbbox(); fw, fh = f.size
            if bb and (bb[0] == 0 or bb[1] == 0 or bb[2] == fw or bb[3] == fh): raise SystemExit(f'{n} {i} touches the frame edge {bb}: widen CANVAS')
            frames.append((n, i, f))
    fw, fh = g['canvas']; ax, ay = g['anchor']
    if TRIM is not None:  # every frame cut to what all of them cover (and a margin), so CANVAS can be generous
        boxes = [f.getbbox() for _, _, f in frames if f.getbbox()]
        x0, y0 = max(0, min(b[0] for b in boxes) - TRIM), max(0, min(b[1] for b in boxes) - TRIM)
        x1, y1 = min(fw, max(b[2] for b in boxes) + TRIM), min(fh, max(b[3] for b in boxes) + TRIM)
        frames = [(n, i, f.crop((x0, y0, x1, y1))) for n, i, f in frames]; fw, fh, ax, ay = x1 - x0, y1 - y0, ax - x0, ay - y0
    if len(sys.argv) > 3 and sys.argv[2] == 'preview':
        cols, Z, lab_ = 10, 3, 12; rows = sum(math.ceil(meta[n]['n'] / cols) for n in names)
        sheet = Image.new('RGBA', (cols * fw * Z, rows * (fh * Z + lab_)), (36, 54, 72, 255)); d = ImageDraw.Draw(sheet); r, last = -1, None
        for n, i, f in frames:
            if n != last or i % cols == 0: r += 1; last = n
            x, y = (i % cols) * fw * Z, r * (fh * Z + lab_)
            d.line([(x, y + lab_ + ay * Z), (x + fw * Z, y + lab_ + ay * Z)], fill=(90, 110, 130, 255))
            sheet.alpha_composite(f.resize((fw * Z, fh * Z), Image.NEAREST), (x, y + lab_)); d.text((x + 3, y), f'{n} {i}', fill=(255, 255, 0, 255))
        sheet.save(os.path.join(sys.argv[3], f'{species}-preview.png')); print('preview', sheet.size); return
    # the sheet is split into pages no taller than PAGE px (phones refuse very large images); frame k is on page
    # k // per_page, at (k % per_page) in that page's grid
    cols = 12; per = cols * max(1, PAGE // fh); pages = [Image.new('RGBA', (cols * fw, math.ceil(min(per, len(frames) - p0) / cols) * fh), (0, 0, 0, 0))
                                                     for p0 in range(0, len(frames), per)]
    anims = {}
    for k, (n, i, f) in enumerate(frames):
        j = k % per; pages[k // per].alpha_composite(f, ((j % cols) * fw, (j // cols) * fh))
        a = anims.setdefault(n, {'fps': meta[n]['fps'], 'loop': meta[n]['loop'], 'frames': []}); a['frames'].append(k)
        if 'hit' in meta[n]: a['hit'] = meta[n]['hit']
        if 'hit2' in meta[n]: a['hit2'] = meta[n]['hit2']
        if 'hits' in meta[n]: a['hits'] = meta[n]['hits']
        if meta[n].get('wait'): a['wait'] = True
    names_ = [f'{species}.png'] + [f'{species}-{p}.png' for p in range(1, len(pages))]
    for img, nm in zip(pages, names_): img.save(os.path.join(ROOT, 'public', 'anim', nm), optimize=True)
    rest = next(f for n, i, f in frames if n == 'idle').getbbox()
    info = {'image': f'anim/{species}.png' if len(pages) == 1 else [f'anim/{nm}' for nm in names_], 'perPage': per, 'pixel': True, 'cols': cols, 'frame': [fw, fh], 'anchor': [ax, ay],
            'body': [rest[2] - rest[0], ay - rest[1]], 'mouth': [round(g['mouth'][0] - g['anchor'][0]), round(g['mouth'][1] - g['anchor'][1])], 'anims': anims}
    with open(os.path.join(ROOT, 'src', 'anim', f'{species}.json'), 'w') as f: json.dump(info, f, indent=1)
    print('sheet', len(pages), 'pages', [p.size for p in pages], len(frames), 'frames')


def load(species):
    # the species' settings for this step, read from scripts/<species>-3d.py without running Blender code
    path = os.path.join(ROOT, 'scripts', f'{species}-3d.py'); src = open(path, encoding='utf-8').read(); env = {'__file__': path}
    exec(compile(src, f'{species}-3d.py', 'exec'), env)
    return {'SPRITE': env['SPRITE'], 'LIFT': env.get('LIFT', (1, 1)), 'DESPECKLE': env.get('DESPECKLE', False), 'ORDER': list(env['ANIMS']),
            'CHROMA': env.get('CHROMA', 1.0), 'TRIM': env.get('TRIM'),
            'CREASE': env.get('CREASE', CREASE), 'EDGE': env.get('EDGE', min(EDGE, 1.5 * env.get('CREASE', CREASE))), 'RIMS': env.get('RIMS', ()), 'FACE': env.get('FACE'), 'SPRITE_EYES': env.get('SPRITE_EYES'), 'SHADOWS': env.get('SHADOWS', False)}


if __name__ == '__main__':
    main()
