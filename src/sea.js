// The open water behind everything, as pixel art at the rock's dot scale (rock.js ART): the depth colour falls in flat
// bands with short dithered steps between them instead of a smooth gradient, two hazy layers of far-off rock drift
// behind at parallax (coral heads on the coast, broken pillars in the deep, jagged spires in the trench), and near
// the surface a net of caustic light ripples over it all. Everything is cached textures; per frame it is a few
// pattern fills.
import * as M from './map.js';
import { ART } from './rock.js';

// depth colour stops: [tile row, colour]
const STOPS = [[0, '#2b9ad2'], [18, '#1d80c0'], [60, '#14619f'], [150, '#0d4d86'], [252, '#0a3967'], [480, '#082b51'],
  [752, '#0b1a3c'], [1100, '#0e1131'], [1502, '#06050f']];
const BAND = 9; // world px per colour band

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const rgb = h => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const STOP_RGB = STOPS.map(([t, c]) => [t * M.T, rgb(c)]);
function colourAt(wy) { // the smooth depth colour at a world y
  if (wy <= 0) return STOP_RGB[0][1];
  for (let i = 1; i < STOP_RGB.length; i++) {
    const [y1, c1] = STOP_RGB[i], [y0, c0] = STOP_RGB[i - 1];
    if (wy <= y1) { const t = (wy - y0) / (y1 - y0); return c0.map((v, j) => Math.round(v + (c1[j] - v) * t)); }
  }
  return STOP_RGB[STOP_RGB.length - 1][1];
}

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

// ---- depth bands: one 8 x STRIP art px strip per vertical slice of the map, repeated across the view ----
const STRIP = 256, strips = new Map();
function strip(k) {
  let cv = strips.get(k);
  if (cv) return cv;
  cv = canvas(8, STRIP);
  const ctx = cv.getContext('2d'), img = ctx.createImageData(8, STRIP);
  for (let y = 0; y < STRIP; y++) {
    const wy = (k * STRIP + y) * ART, b = wy / BAND, i = Math.floor(b), f = b - i;
    const ca = colourAt(i * BAND), cb = colourAt((i + 1) * BAND), g = Math.max(0, (f - 0.72) / 0.28); // flat, then a short dither into the next band
    for (let x = 0; x < 8; x++) {
      const c = g > BAYER[(y & 3) * 4 + (x & 3)] ? cb : ca, o = (y * 8 + x) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (strips.size > 200) strips.delete(strips.keys().next().value);
  strips.set(k, cv);
  return cv;
}

// ---- far rock: a seamless tile of hazy silhouettes per zone, shaded light on top ----
const FAR = 320; // art px per side of a far-rock tile
function wrapNoise(x, y, p, s) { // value noise that repeats every p cells
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(((a % p) + p) % p, ((b % p) + p) % p, s);
  const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// zone looks: how the silhouettes are shaped (cells across the tile in x and y) and their tint
const FARS = {
  1: { px: 6, py: 2, thresh: 0.56, body: [4, 30, 60], rim: [150, 230, 255] }, // rounded coral heads
  2: { px: 7, py: 2, thresh: 0.6, body: [2, 10, 26], rim: [110, 200, 210] }, // tall broken pillars
  3: { px: 9, py: 2, thresh: 0.62, body: [6, 2, 18], rim: [200, 150, 255] }, // jagged spires
};
const farTiles = {};
function farTile(zone, layer) {
  const key = zone * 2 + layer;
  if (farTiles[key]) return farTiles[key];
  const F = FARS[zone], cv = canvas(FAR, FAR), ctx = cv.getContext('2d'), img = ctx.createImageData(FAR, FAR), s = zone * 13 + layer * 5;
  const solid = (x, y) => {
    const n = wrapNoise(x / FAR * F.px, y / FAR * F.py, layer ? F.px : F.px, s) * 0.65 + wrapNoise(x / FAR * F.px * 3, y / FAR * F.py * 3, F.px * 3, s + 1) * 0.35;
    const fall = (1 - Math.cos((y / FAR) * Math.PI * 2)) / 2; // a band of rock across the middle of each tile row, open water above and below
    const rough = wrapNoise(x / FAR * 40, y / FAR * 40, 40, s + 2) * 0.08; // ragged edges, not soft blobs
    return n * 0.55 + fall * 0.6 + rough > F.thresh + 0.29;
  };
  const a = layer ? 0.2 : 0.12; // the near layer is denser
  for (let y = 0; y < FAR; y++) for (let x = 0; x < FAR; x++) {
    if (!solid(x, y)) continue;
    const o = (y * FAR + x) * 4, top = !solid(x, y - 1) || !solid(x, y - 2);
    const c = top ? F.rim : F.body;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = Math.round((top ? a * 0.5 : a) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return (farTiles[key] = cv);
}

// ---- caustics: a seamless net of light lines, drawn twice drifting against each other ----
const CAU = 160;
let causticTile = null;
function caustics() {
  if (causticTile) return causticTile;
  const cv = canvas(CAU, CAU), ctx = cv.getContext('2d'), img = ctx.createImageData(CAU, CAU), N = 5, C = CAU / N;
  const pt = (i, j) => { const a = ((i % N) + N) % N, b = ((j % N) + N) % N; return [(i + 0.2 + hash(a, b, 61) * 0.6) * C, (j + 0.2 + hash(a, b, 62) * 0.6) * C]; };
  for (let y = 0; y < CAU; y++) for (let x = 0; x < CAU; x++) {
    const gx = Math.floor(x / C), gy = Math.floor(y / C);
    let d1 = 1e9, d2 = 1e9;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const [px, py] = pt(gx + k, gy + j), d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    if (d2 - d1 > 1.4) continue;
    const o = (y * CAU + x) * 4;
    img.data[o] = 210; img.data[o + 1] = 245; img.data[o + 2] = 255; img.data[o + 3] = d2 - d1 < 0.7 ? 255 : 140;
  }
  ctx.putImageData(img, 0, 0);
  return (causticTile = cv);
}

// fill the view with a texture repeated at art scale, shifted by (sx, sy) world px
function tiled(ctx, cv, sx, sy, W, H) {
  const pat = ctx.createPattern(cv, 'repeat'), k = ART;
  pat.setTransform(new DOMMatrix([k, 0, 0, k, -sx, -sy]));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
}

const zoneOf = wy => (M.scene === 'tutorial' ? 1 : M.zoneOfRow(Math.max(0, Math.floor(wy / M.T))).id);
export function draw(ctx, ox, oy, W, H, now) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  // depth bands, in world space so they stay put as the camera moves
  const k0 = Math.floor(oy / ART / STRIP), k1 = Math.floor((oy + H) / ART / STRIP);
  for (let k = Math.max(0, k0); k <= k1; k++) {
    const top = k * STRIP * ART - oy, pat = ctx.createPattern(strip(k), 'repeat-x');
    pat.setTransform(new DOMMatrix([ART, 0, 0, ART, -ox % (8 * ART), top]));
    ctx.fillStyle = pat;
    ctx.fillRect(0, Math.max(0, top), W, Math.min(H, top + STRIP * ART) - Math.max(0, top));
  }
  if (oy < 0) { const c = colourAt(0); ctx.fillStyle = `rgb(${c})`; ctx.fillRect(0, 0, W, -oy); } // above the map top
  // far rock, two layers at parallax; near a zone boundary the next zone's look fades in
  const z = zoneOf(oy + H / 2), zNext = zoneOf(oy + H / 2 + 12 * M.T);
  for (const [layer, par] of [[0, 0.25], [1, 0.5]]) {
    const fx = ox * par, fy = oy * par + layer * 70;
    ctx.globalAlpha = Math.min(1, Math.max(0, (oy + H) / 300)); // no far rock up in the bright shallows by the base
    tiled(ctx, farTile(z, layer), fx, fy, W, H);
    if (zNext !== z) { ctx.globalAlpha *= 0.5; tiled(ctx, farTile(zNext, layer), fx, fy, W, H); }
  }
  ctx.globalAlpha = 1;
  // caustics fade out over the first ~30 tiles
  const fade = Math.max(0, 1 - Math.max(0, oy) / 480);
  if (fade > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.07 * fade;
    tiled(ctx, caustics(), ox * 0.9 + now * 6, oy * 0.9 + now * 2, W, H);
    tiled(ctx, caustics(), ox * 0.9 - now * 5 + 37, oy * 0.9 + now * 3 + 53, W, H);
  }
  ctx.restore();
}
