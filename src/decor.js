// Seabed dressing: sprite props cut from CC0 packs (assets/ocean: "Waterworld tileset" by coem, "2D Pixelart corals"
// by pezleha) plus hand-drawn kelp, shells, starfish, tube worms, glowing life, marine snow and light shafts.
// Every prop is picked per tile by a fixed hash, so the sea looks the same on every visit.
import * as M from './map.js';
import SHEET from './deco-sheet.json';

const img = new Image();
export function load(base) { img.src = `${base}deco/sheet.png`; }

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// What grows on the seabed per zone (weights). Sprite names come from the sheet; the rest are drawn in code.
const FLOOR = {
  farm: [['reeds1', 3], ['reeds2', 3], ['kelp', 2], ['pebbles', 1], ['shell', 1]],
  1: [['kelp', 4], ['reeds1', 3], ['reeds2', 3], ['tuft', 2], ['coral-pink', 2], ['coral-orange', 2], ['coral-red', 1], ['coral-white', 1],
    ['stones', 1], ['pebbles', 1], ['star', 2], ['shell', 2]],
  2: [['kelp-dark', 2], ['coral-teal', 2], ['coral-gray', 2], ['coral-violet', 1], ['spikes', 2], ['boulder', 1], ['stones', 1],
    ['pillar', 1], ['slab', 1], ['anemone', 3]],
  3: [['tube', 3], ['glowcap', 3], ['spikes', 2], ['coral-gray', 1], ['pillar-moss', 1], ['slab-moss', 1], ['tablet', 1], ['boulder', 1]],
};
const DENSITY = { farm: 0.3, 1: 0.32, 2: 0.24, 3: 0.22 };
const CEILING = { 2: [['drip', 1]], 3: [['glowvine', 1]] }, CEILING_DENSITY = { 2: 0.06, 3: 0.12 };
const WIDE = new Set(['slab', 'slab-moss', 'tablet']); // two tiles wide: need floor on the right too
const GLOWS = new Set(['glowcap', 'tube', 'glowvine']);

function pick(list, r) {
  let total = 0;
  for (const [, w] of list) total += w;
  r *= total;
  for (const [k, w] of list) if ((r -= w) < 0) return k;
  return list[0][0];
}

const water = (tx, ty) => ty < 0 || M.tileAt(tx, ty) === M.WATER;
const rock = (tx, ty) => ty >= 0 && M.tileAt(tx, ty) === M.ROCK;
const cache = new Map();
// { floor, ceil } props for a rock tile, or null
function decoAt(tx, ty) {
  const key = M.scene + ':' + tx + ',' + ty;
  if (cache.has(key)) return cache.get(key);
  let d = null;
  if (rock(tx, ty) && ty >= 1) {
    const cut = M.cutAt(tx, ty); // props only on flat floor / flat ceiling, not on diagonal corners
    const zone = M.scene === 'tutorial' ? 'farm' : M.zoneOfRow(ty).id;
    if (water(tx, ty - 1) && !(cut & 3) && hash(tx, ty, 1) < DENSITY[zone]) {
      let k = pick(FLOOR[zone], hash(tx, ty, 2));
      if (WIDE.has(k) && !(rock(tx + 1, ty) && water(tx + 1, ty - 1) && water(tx + 1, ty - 2))) k = 'stones';
      if ((k === 'pillar' || k === 'pillar-moss') && !water(tx, ty - 2)) k = 'boulder';
      d = { floor: k };
    } else if (water(tx, ty + 1) && !(cut & 12) && CEILING[zone] && hash(tx, ty, 3) < CEILING_DENSITY[zone]) d = { ceil: pick(CEILING[zone], hash(tx, ty, 4)) };
  }
  cache.set(key, d);
  return d;
}
// scene change: the farm and the main sea share tile coordinates
export const reset = () => cache.clear();

function sprite(ctx, k, cx, by, flip) { // bottom-centred at (cx, by)
  const s = SHEET[k];
  if (!s || !img.complete) return;
  // no rounding: cx/by already sit on the tile grid, and rounding here made props shimmer against the scrolling rock
  const x = cx - Math.floor(s[2] / 2), y = by - s[3];
  if (flip) { ctx.save(); ctx.translate(x + s[2], y); ctx.scale(-1, 1); ctx.drawImage(img, s[0], s[1], s[2], s[3], 0, 0, s[2], s[3]); ctx.restore(); }
  else ctx.drawImage(img, s[0], s[1], s[2], s[3], x, y, s[2], s[3]);
}

function kelp(ctx, cx, by, h, now, seed, dark) {
  const n = 3 + Math.floor(h * 4); // segments of 6px
  let x = cx;
  for (let i = 0; i < n; i++) {
    const y = by - i * 6, sway = Math.sin(now * 1.4 + seed * 9 + i * 0.6) * (i * 0.6);
    x = cx + Math.round(sway);
    ctx.fillStyle = dark ? '#1f5a52' : '#3f8f43'; ctx.fillRect(x, y - 6, 2, 6);
    ctx.fillStyle = dark ? '#2b7a6a' : '#5cb34f';
    if (i > 0) ctx.fillRect(x + (i & 1 ? 2 : -3), y - 4, 3, 2); // leaves on alternating sides
  }
  ctx.fillStyle = dark ? '#2b7a6a' : '#7ccc5a'; ctx.fillRect(x - 1, by - n * 6 - 2, 4, 3);
}

function procedural(ctx, k, cx, by, now, r) {
  if (k === 'kelp' || k === 'kelp-dark') return kelp(ctx, cx, by, r, now, r, k === 'kelp-dark');
  if (k === 'star') { // starfish lying on the sand
    ctx.fillStyle = r < 0.5 ? '#ff8a3c' : '#e8506a';
    ctx.fillRect(cx - 1, by - 5, 2, 5); ctx.fillRect(cx - 4, by - 3, 8, 2); ctx.fillRect(cx - 3, by - 1, 2, 1); ctx.fillRect(cx + 1, by - 1, 2, 1);
    ctx.fillStyle = '#ffd0a0'; ctx.fillRect(cx, by - 3, 1, 1);
    return;
  }
  if (k === 'shell') {
    ctx.fillStyle = '#f2dcc8'; ctx.fillRect(cx - 3, by - 3, 6, 3); ctx.fillRect(cx - 2, by - 4, 4, 1);
    ctx.fillStyle = '#c99a86'; ctx.fillRect(cx - 2, by - 3, 1, 3); ctx.fillRect(cx, by - 4, 1, 4); ctx.fillRect(cx + 2, by - 3, 1, 3);
    return;
  }
  if (k === 'anemone') { // swaying tentacles on a stubby base
    ctx.fillStyle = '#7a3a6a'; ctx.fillRect(cx - 3, by - 3, 6, 3);
    ctx.fillStyle = r < 0.5 ? '#e070c0' : '#b080ff';
    for (let i = -3; i <= 3; i += 2) { const s = Math.round(Math.sin(now * 2 + i + r * 7) * 1.5); ctx.fillRect(cx + i + s, by - 8, 1, 5); }
    return;
  }
  if (k === 'tube') { // tube worms with red plumes
    for (let i = 0; i < 3; i++) {
      const x = cx - 4 + i * 4, h = 6 + Math.floor(hash(i, Math.floor(r * 999)) * 7);
      ctx.fillStyle = '#d8d4c8'; ctx.fillRect(x, by - h, 2, h);
      ctx.fillStyle = '#e83848'; ctx.fillRect(x - 1, by - h - 2 + Math.round(Math.sin(now * 3 + i) * 0.6), 4, 2);
    }
    return;
  }
  if (k === 'glowcap') { // bioluminescent bulbs; the glow pass lights them
    ctx.fillStyle = '#284a5a'; ctx.fillRect(cx - 1, by - 5, 1, 5); ctx.fillRect(cx + 2, by - 8, 1, 8);
    ctx.fillStyle = r < 0.5 ? '#6af0ff' : '#b8ff6a'; ctx.fillRect(cx - 2, by - 7, 3, 2); ctx.fillRect(cx + 1, by - 10, 3, 2);
  }
}

function ceiling(ctx, k, cx, ty, now, r) {
  if (k === 'drip') { // short stalactite
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx - 2, ty, 4, 3); ctx.fillRect(cx - 1, ty + 3, 2, 3); ctx.fillRect(cx, ty + 6, 1, 2);
    return;
  }
  if (k === 'glowvine') { // dangling glowing strand
    const len = 8 + Math.floor(r * 16);
    for (let i = 0; i < len; i += 2) { ctx.fillStyle = '#2a5a6a'; ctx.fillRect(cx + Math.round(Math.sin(now + i * 0.3 + r * 5)), ty + i, 1, 2); }
    ctx.fillStyle = '#6af0ff'; ctx.fillRect(cx - 1 + Math.round(Math.sin(now + len * 0.3 + r * 5)), ty + len, 3, 3);
  }
}

// Props on every visible rock tile (props stand up to ~4 tiles tall, so rows a little below the view are checked too).
export function draw(ctx, ox, oy, W, H, now) {
  const T = M.T, tx0 = Math.floor(ox / T) - 1, ty0 = Math.max(0, Math.floor(oy / T) - 1);
  const tx1 = tx0 + Math.ceil(W / T) + 2, ty1 = Math.floor(oy / T) + Math.ceil(H / T) + 5;
  ctx.imageSmoothingEnabled = false;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = decoAt(tx, ty);
    if (!d) continue;
    const r = hash(tx, ty, 5), cx = tx * T + 8 - ox + Math.round((r - 0.5) * 6);
    if (d.floor) {
      const by = ty * T - oy;
      if (WIDE.has(d.floor)) sprite(ctx, d.floor, tx * T + 16 - ox, by, false);
      else if (SHEET[d.floor]) sprite(ctx, d.floor, cx, by, r < 0.5);
      else procedural(ctx, d.floor, cx, by, now, r);
    } else ceiling(ctx, d.ceil, cx, (ty + 1) * T - oy, now, r);
  }
}

// After the darkness layer: soft light around glowing life so it shines in the deep.
export function drawGlow(ctx, ox, oy, W, H, now) {
  const T = M.T, tx0 = Math.floor(ox / T) - 1, ty0 = Math.max(0, Math.floor(oy / T) - 1);
  const tx1 = tx0 + Math.ceil(W / T) + 2, ty1 = Math.floor(oy / T) + Math.ceil(H / T) + 2;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = decoAt(tx, ty), k = d && (d.floor ?? d.ceil);
    if (!k || !GLOWS.has(k)) continue;
    const r = hash(tx, ty, 5), cx = tx * T + 8 - ox + Math.round((r - 0.5) * 6);
    const cy = d.floor ? ty * T - oy - (k === 'tube' ? 10 : 7) : (ty + 1) * T - oy + 14;
    const a = 0.22 + Math.sin(now * 2 + r * 20) * 0.08, rad = k === 'tube' ? 10 : 14;
    const color = k === 'tube' ? '255,80,90' : r < 0.5 || k === 'glowvine' ? '90,230,255' : '180,255,110';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${color},${a})`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  ctx.restore();
}

// Ambient water: light shafts and rising bubbles near the surface, drifting marine snow deeper down.
export function ambient(ctx, ox, oy, W, H, now, depthM) {
  if (oy < 400) { // light shafts fade out over the first ~25 tiles
    const fade = Math.max(0, 1 - Math.max(0, oy) / 400);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 97 - ox * 0.3) % (W + 120) + W + 120) % (W + 120) - 60, top = Math.max(0, -oy), w = 14 + (i % 3) * 8;
      const a = (0.05 + Math.sin(now * 0.7 + i * 1.7) * 0.025) * fade;
      ctx.fillStyle = `rgba(200,240,255,${a})`;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, top); ctx.lineTo(x + w + 60, H); ctx.lineTo(x + 50, H); ctx.fill();
    }
    ctx.restore();
  }
  const deep = depthM > 600, n = deep ? 36 : 14;
  for (let i = 0; i < n; i++) {
    const px = (((hash(i, 7) * (W + 40) - ox * (deep ? 0.6 : 0.9)) % (W + 40)) + W + 40) % (W + 40) - 20;
    if (deep) { // marine snow sinks slowly with a little wobble
      const py = (((hash(i, 8) * (H + 20) + now * (4 + hash(i, 9) * 6) - oy * 0.6) % (H + 20)) + H + 20) % (H + 20) - 10;
      ctx.fillStyle = `rgba(220,235,255,${0.25 + hash(i, 6) * 0.3})`; ctx.fillRect(Math.round(px + Math.sin(now + i) * 2), Math.round(py), 1, 1);
    } else if (oy > -60) { // bubbles rise
      const py = H - (((hash(i, 8) * (H + 20) + now * (14 + hash(i, 9) * 10) + oy * 0.9) % (H + 20)) + H + 20) % (H + 20) + 10;
      if (py + oy < 4) continue; // not above the surface
      ctx.strokeStyle = 'rgba(220,245,255,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(Math.round(px + Math.sin(now * 2 + i) * 2), Math.round(py), 1 + (i % 2), 0, 7); ctx.stroke();
    }
  }
}
