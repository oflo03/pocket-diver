# Turns the reference painting (three swimming poses on a transparent background) into clean game sprites:
# crop each character, shrink to a native pixel grid, snap colours to a fixed palette, harden alpha and redraw a 1px outline.
# Run: python scripts/swim-from-ref.py <reference.webp>  -> public/sprites/swim/<key>.png, docs/swim-sprites.png
import sys, pathlib
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FACTOR = 6  # reference px per sprite px
OUTLINE = (22, 28, 52)

PALETTE = {
    'oshawott': [(250, 251, 252), (214, 222, 232), (96, 196, 196), (66, 156, 168), (44, 76, 140), (30, 52, 104),
                 (232, 212, 140), (196, 168, 96), (128, 84, 56), (22, 28, 52)],
    'dewott': [(96, 172, 232), (64, 132, 204), (44, 76, 140), (30, 52, 104), (36, 40, 60), (232, 212, 140),
               (196, 168, 96), (250, 251, 252), (214, 120, 120), (22, 28, 52)],
    'samurott': [(40, 76, 152), (28, 54, 112), (160, 172, 200), (122, 136, 170), (220, 196, 140), (184, 156, 100),
                 (250, 251, 252), (206, 212, 226), (196, 64, 52), (36, 40, 60), (22, 28, 52)],
}


def snap(img, palette):
    a = np.asarray(img).astype(int)
    pal = np.array(palette)
    rgb = a[..., :3].reshape(-1, 1, 3)
    idx = ((rgb - pal[None]) ** 2).sum(-1).argmin(1)
    out = pal[idx].reshape(a.shape[0], a.shape[1], 3)
    alpha = np.where(a[..., 3] > 140, 255, 0)
    return np.dstack([out, alpha]).astype(np.uint8)


def clean(arr):
    """Drop isolated opaque pixels and re-outline the silhouette."""
    a = arr.copy()
    h, w = a.shape[:2]
    op = a[..., 3] > 0
    for y in range(h):
        for x in range(w):
            if op[y, x]:
                n = sum(op[y + dy, x + dx] for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= y + dy < h and 0 <= x + dx < w)
                if n <= 1:
                    a[y, x, 3] = 0
    a = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    op = a[..., 3] > 0
    edge = np.zeros_like(op)
    edge[1:-1, 1:-1] = ~op[1:-1, 1:-1] & (op[:-2, 1:-1] | op[2:, 1:-1] | op[1:-1, :-2] | op[1:-1, 2:])
    a[edge] = (*OUTLINE, 255)
    return a


def components(mask):
    """4-connected components of a boolean mask, largest first."""
    h, w = mask.shape
    seen = np.zeros_like(mask)
    comps = []
    for y, x in zip(*np.where(mask)):
        if seen[y, x]:
            continue
        stack, comp = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            comp.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        comps.append(comp)
    return sorted(comps, key=len, reverse=True)


def is_color(a, c):
    return (a[..., 3] > 0) & (a[..., :3] == c).all(-1)


# Design corrections against the official designs (Bulbapedia descriptions).
def fix_oshawott(a):
    brown = is_color(a, (128, 84, 56))
    face = brown.copy(); face[:, :38] = False
    nose = components(face)[0]  # the reference painted a big brown patch; the real nose is a small dark-orange oval
    for y, x in nose:
        a[y, x, :3] = (250, 251, 252)
    cy = round(sum(p[0] for p in nose) / len(nose)); cx = round(sum(p[1] for p in nose) / len(nose))
    for dx in range(-2, 2):
        a[cy, cx + dx, :3] = (218, 116, 52)
        a[cy + 1, cx + dx, :3] = (176, 84, 40)
    a[is_color(a, (128, 84, 56))] = (198, 146, 104, 255)  # leftover dots read as cheek freckles
    # the head is plain white: snap tan/teal speckles left by colour snapping to the light shading tone
    head = np.zeros(a.shape[:2], bool); head[2:24, 20:55] = True
    for c in ((196, 168, 96), (232, 212, 140), (66, 156, 168), (96, 196, 196)):
        a[head & is_color(a, c)] = (214, 222, 232, 255)
    return a


def fix_dewott(a):
    a[is_color(a, (214, 120, 120))] = (210, 64, 64, 255)  # nose is red, not pink
    whisk = np.zeros(a.shape[:2], bool); whisk[26:42, 44:76] = True  # whiskers are white, not cream
    for c in ((232, 212, 140), (196, 168, 96)):
        a[whisk & is_color(a, c)] = (250, 251, 252, 255)
    tail = np.zeros(a.shape[:2], bool); tail[:60, :26] = True  # flat tail is black, not navy
    for c in ((30, 52, 104), (44, 76, 140)):
        a[tail & is_color(a, c)] = (36, 40, 60, 255)
    return a


def fix_samurott(a):
    red = is_color(a, (196, 64, 52))
    keep = np.zeros_like(red); keep[28:39, 108:119] = True; keep[34:43, 119:128] = True  # eye and nose only
    stray = red & ~keep  # colour-snapping noise on the helmet and body
    for y, x in zip(*np.where(stray)):
        a[y, x, :3] = (184, 156, 100) if y < 60 else (28, 54, 112)
    return a


FIXES = {'oshawott': fix_oshawott, 'dewott': fix_dewott, 'samurott': fix_samurott}


def build(ref):
    im = Image.open(ref).convert('RGBA')
    al = np.asarray(im)[..., 3] > 128
    cols = al.any(0)
    spans, start = [], None
    for x, v in enumerate(cols):
        if v and start is None: start = x
        if not v and start is not None: spans.append((start, x)); start = None
    spans = [s for s in spans if s[1] - s[0] > 30]
    sprites = {}
    for key, (x0, x1) in zip(['oshawott', 'dewott', 'samurott'], spans):
        rows = np.where(al[:, x0:x1].any(1))[0]
        crop = im.crop((x0, rows.min(), x1, rows.max() + 1))
        small = crop.resize((max(1, crop.width // FACTOR), max(1, crop.height // FACTOR)), Image.BOX)
        sprites[key] = clean(FIXES[key](snap(small, PALETTE[key])))
    return sprites


if __name__ == '__main__':
    sprites = build(sys.argv[1])
    out = ROOT / 'public' / 'sprites' / 'swim'
    out.mkdir(parents=True, exist_ok=True)
    for k, a in sprites.items():
        Image.fromarray(a).save(out / f'{k}.png')
    # 6x preview sheet on a water background
    S, pad = 6, 24
    ims = [Image.fromarray(a) for a in sprites.values()]
    W = sum(i.width * S + pad for i in ims) + pad
    H = max(i.height for i in ims) * S + pad * 2
    sheet = Image.new('RGBA', (W, H), (30, 96, 146, 255))
    x = pad
    for i in ims:
        big = i.resize((i.width * S, i.height * S), Image.NEAREST)
        sheet.alpha_composite(big, (x, H - pad - big.height))
        x += big.width + pad
    (ROOT / 'docs').mkdir(exist_ok=True)
    sheet.save(ROOT / 'docs' / 'swim-sprites.png')
    print({k: a.shape[1::-1] for k, a in sprites.items()})
