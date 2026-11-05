// Rock drawn with the "Underwater Diving" tileset by ansimuz (CC0, assets/underwater-diving), recoloured per zone
// (public/terrain/rock-<zone>.png), on the fine quarter-tile grid (map.js subAt): every 16px sheet cell is drawn into
// an 8px cell, so the art is twice as fine as the gameplay tiles. Each cell picks the piece matching which sides face
// water (mossy floor lip, ceiling underside, left/right wall) or continues the nearest edge inward; 45-degree cuts
// (map.js subCut) are clipped to a triangle and wear the floor lip sheared along the diagonal.
import * as M from './map.js';
import * as Rock from './rock.js';
import PROPS from './terrain-props.json';

const sheets = {}, props = {};
export function load(base) {
  for (const z of [1, 2, 3]) {
    sheets[z] = Object.assign(new Image(), { src: `${base}terrain/rock-${z}.png` });
    props[z] = Object.assign(new Image(), { src: `${base}terrain/props-${z}.png` }); // totems and chain (same pack)
  }
}
export const ready = () => [1, 2, 3].every(z => sheets[z]?.complete && sheets[z].naturalWidth);

// cells (16px) in the tileset
const TOP = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // columns of the floor strip: row 6 = moss lumps above, row 7 = lip
const CEIL = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]; // columns of the ceiling strip, underside in row 4
const WALL = [2, 3, 4]; // rows of the wall pieces: left edge in column 13, right edge in column 19
const SRC = 16;

const mod = (a, n) => ((a % n) + n) % n;

// All rock in view, painted by rock.js in chunks and cached; a chunk is repainted when a gate in it opens or shuts.
// Chunks around the view are painted ahead by rock-worker.js; one that is on screen and still missing (first frame,
// a warp) is painted here at once. Chunk edges are snapped to device pixels so neighbours meet without hairlines.
const chunks = new Map(), MAX_CHUNKS = 120, AHEAD = 2, IN_FLIGHT = 4;
let worker = null, pending = 0, jobs = 0;
const jobFor = new Map(); // job id -> chunk id
function canvasOf(px, size = Rock.CA) {
  if (!px) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  cv.getContext('2d').putImageData(new ImageData(px, size, size), 0, 0);
  return cv;
}
function startWorker() {
  try { worker = new Worker(new URL('./rock-worker.js', import.meta.url), { type: 'module' }); } catch { worker = false; return; }
  worker.onmessage = ({ data: { id, px } }) => {
    pending--;
    const cid = jobFor.get(id), c = chunks.get(cid);
    jobFor.delete(id);
    if (c && c.job === id) { c.cv = canvasOf(px); c.job = 0; c.done = true; }
  };
  worker.onerror = () => { worker = false; }; // fall back to painting on the main thread
}
const keyOf = (gates, isOpen) => gates.map(g => (isOpen(g) ? 1 : 0)).join('');
export function draw(ctx, ox, oy, W, H, scale, isOpen) {
  if (worker === null) startWorker();
  const C = Rock.CHUNK, snap = v => Math.round(v * scale) / scale;
  const cx0 = Math.floor(ox / C), cy0 = Math.max(0, Math.floor(oy / C)), cx1 = Math.floor((ox + W) / C), cy1 = Math.floor((oy + H) / C);
  ctx.imageSmoothingEnabled = false;
  for (let cy = cy0 - AHEAD; cy <= cy1 + AHEAD; cy++) for (let cx = cx0 - AHEAD; cx <= cx1 + AHEAD; cx++) {
    if (cy < 0) continue;
    const id = `${M.scene}:${cx},${cy}`, visible = cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1;
    let c = chunks.get(id);
    if (!c) { const gates = Rock.gatesIn(cx, cy); c = { gates, key: keyOf(gates, isOpen), cv: null, done: false, job: 0 }; }
    const key = keyOf(c.gates, isOpen);
    if (key !== c.key) { c.key = key; c.done = false; c.job = 0; } // a gate changed: repaint (keep the old picture meanwhile)
    if (!c.done) {
      if (visible && (!c.cv || !worker)) { c.cv = canvasOf(Rock.paintChunk(cx, cy, isOpen)); c.done = true; c.job = 0; }
      else if (worker && !c.job && pending < IN_FLIGHT) {
        c.job = ++jobs; jobFor.set(c.job, id); pending++;
        worker.postMessage({ id: c.job, scene: M.scene, cx, cy, gates: c.gates.map(g => ({ ...g, open: isOpen(g) })) });
      }
    }
    chunks.delete(id); chunks.set(id, c); // most recently used last
    if (!visible || !c.cv) continue;
    const l = snap(cx * C - ox), t = snap(cy * C - oy);
    ctx.drawImage(c.cv, l, t, snap((cx + 1) * C - ox) - l, snap((cy + 1) * C - oy) - t);
  }
  while (chunks.size > MAX_CHUNKS) chunks.delete(chunks.keys().next().value);
}

// The old tileset path, kept for reference until the painted rock is settled.
export function drawTiles(ctx, ox, oy, W, H, scale, isOpen) {
  const S = M.ST, x0 = Math.floor(ox / S) - 1, y0 = Math.max(0, Math.floor(oy / S) - 1);
  const x1 = Math.floor((ox + W) / S) + 1, y1 = Math.floor((oy + H) / S) + 2;
  const snap = v => Math.round(v * scale) / scale;
  ctx.imageSmoothingEnabled = false;
  for (let cy = y0; cy <= y1; cy++) {
    const [za, zb, mix] = zoneMix(cy), img = sheets[za], over = sheets[zb];
    for (let cx = x0; cx <= x1; cx++) {
      if (M.subAt(cx, cy) !== M.ROCK) continue;
      const l = snap(cx * S - ox), t = snap(cy * S - oy), r = snap((cx + 1) * S - ox), b = snap((cy + 1) * S - oy);
      cellAt(ctx, img, cx, cy, l, t, r - l, b - t, isOpen);
      if (mix > 0) { // near a zone boundary the next zone's colouring fades in over the old one
        ctx.globalAlpha = mix;
        cellAt(ctx, over, cx, cy, l, t, r - l, b - t, isOpen);
        ctx.globalAlpha = 1;
      }
    }
  }
}

// Which zone sheets a fine row uses: [base zone, next zone, how much of the next to lay over (0..1)].
// Around each boundary the rock colour crossfades over BLEND tiles instead of switching on one row.
const BLEND = 12;
function zoneMix(cy) {
  const ty = cy / M.SUB;
  if (M.scene === 'tutorial') return [1, 1, 0];
  for (let i = 0; i + 1 < M.ZONES.length; i++) {
    const edge = M.ZONES[i].y1 + 1, d = ty - (edge - BLEND / 2);
    if (d >= 0 && d < BLEND) return [M.ZONES[i].id, M.ZONES[i + 1].id, d / BLEND];
  }
  return [M.zoneOfRow(Math.floor(ty)).id, 0, 0];
}

function cellAt(ctx, img, cx, cy, x, y, w, h, isOpen) {
  // sheet cell (c, r) into this screen cell; sub-rectangles in sheet px (sx, sy, sw, sh) for half pieces
  const cell = (c, r, sx = 0, sy = 0, sw = SRC, sh = SRC, dx = x, dy = y) =>
    ctx.drawImage(img, c * SRC + sx, r * SRC + sy, sw, sh, dx + (sx / SRC) * w, dy + (sy / SRC) * h, (sw / SRC) * w, (sh / SRC) * h);
  const water = (dx, dy) => { // open gates (a hatch after its boss was offered) read as water, so walls beside them get edges
    const t = M.subAt(cx + dx, cy + dy), g = t > M.ROCK && M.gateInfo(t);
    return t === M.WATER || (g && isOpen(g));
  };
  const n = water(0, -1), s = water(0, 1), wl = water(-1, 0), e = water(1, 0);
  const top = TOP[mod(cx, TOP.length)], ceil = CEIL[mod(cx, CEIL.length)], wall = WALL[mod(cy, WALL.length)];
  const cut = M.subCut(cx, cy);
  if (cut) {
    // what is left of the square after the cut corner, filled with the neighbouring floor/ceiling texture,
    // then the diagonal surface: the sheet's floor lip (or ceiling underside) sheared column by column
    const corners = [[0, 0, M.CUT_NW], [w, 0, M.CUT_NE], [w, h, M.CUT_SE], [0, h, M.CUT_SW]].filter(c => !(cut & c[2]));
    ctx.save(); ctx.beginPath();
    corners.forEach(([px, py], i) => (i ? ctx.lineTo(x + px, y + py) : ctx.moveTo(x + px, y + py)));
    ctx.closePath(); ctx.clip();
    if (cut & (M.CUT_NW | M.CUT_NE)) cell(top, 7); else cell(ceil, 4);
    ctx.restore();
    const k = w / SRC; // screen px per sheet px
    for (let i = 0; i < SRC; i++) {
      const px = x + i * k, up = cut & (M.CUT_NW | M.CUT_NE);
      const along = cut & (M.CUT_NW | M.CUT_SE) ? SRC - i : i; // surface height in sheet px at this column
      if (up) ctx.drawImage(img, top * SRC + i, 104, 1, 24, px, y + (along - 8) * k, k, 24 * k);
      else ctx.drawImage(img, ceil * SRC + i, 56, 1, 24, px, y + (along - 18) * k, k, 24 * k);
    }
    return;
  }
  if (n && s) { cell(top, 7, 0, 0, SRC, SRC / 2); cell(ceil, 4, 0, SRC / 2, SRC, SRC / 2); }
  else if (n) cell(top, 7);
  else if (s) cell(ceil, 4);
  else if (wl && e) { cell(13, wall, 0, 0, SRC / 2, SRC); cell(19, wall, SRC / 2, 0, SRC / 2, SRC); }
  else if (wl) cell(13, wall);
  else if (e) cell(19, wall);
  else { // interior: plain dark rock, with the nearest edge piece continued inward and fading out over a few cells,
    // the way the sheet itself fades its edges, so there are no hard dark rectangles
    cell(1 + mod(cx, 5), 1);
    const dist = (dx, dy) => { for (let d = 2; d <= 6; d++) if (water(dx * d, dy * d)) return d; return 9; };
    const dn = dist(0, -1), ds = dist(0, 1), dw = dist(-1, 0), de = dist(1, 0), m = Math.min(dn, ds, dw, de);
    if (m < 9) {
      const base = ctx.globalAlpha; // multiply, so the zone crossfade still applies
      ctx.globalAlpha = base * [1, 1, 1, 0.8, 0.55, 0.35, 0.18][m];
      if (m === dn) cell(top, 6 + Math.min(dn, 4));
      else if (m === ds) cell(ceil, 5 - Math.min(ds, 3));
      else if (m === dw) cell(12 + Math.min(dw, 3), wall);
      else cell(20 - Math.min(de, 3), wall);
      ctx.globalAlpha = base;
    }
  }
  if (n) cell(top, 6, 0, 0, SRC, SRC, x, y - h); // moss lumps that poke up into the water above the floor
}

// ---------- hatch & boss doors ----------
// Closed gates are painted with the rock (rock.js sealPixel: a pile of boulders with glowing cracks); open gates are
// water. The chunks holding a gate are repainted when it opens.

// Dressing around each hatch shaft: two totems guarding the hatch on the boss-room floor and chains hanging under it.
export function drawHatches(ctx, ox, oy, W, H, isOpen) {
  if (M.scene !== 'main') return;
  const T = M.T;
  for (let i = 0; i + 1 < M.ZONES.length; i++) {
    const a = M.ZONES[i], n = M.ZONES[i + 1], cx = (n.entry.x + 0.5) * T - ox, gy = (a.bossRoom.y1 + 1) * T - oy;
    if (cx < -120 || cx > W + 120 || gy < -260 || gy > H + (n.y0 - a.bossRoom.y1 + 12) * T) continue;
    const top = props[a.id];
    const prop = (img, k, x, by, scale, flip) => { // bottom-centred at (x, by)
      const [sx, sy, sw, sh] = PROPS[k], w = sw * scale, h = sh * scale;
      ctx.save(); ctx.translate(x - w / 2 + (flip ? w : 0), by - h);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); ctx.restore();
    };
    ctx.imageSmoothingEnabled = true; // these props are shrunk from large art
    prop(top, 'totem', cx - 4 * T, gy + 2, 0.25, false);
    prop(top, 'totem-moss', cx + 4 * T, gy + 2, 0.25, true);
    if (!isOpen({ kind: 'exit', zone: a.id })) for (const dx of [-2.2, 2.2]) { // chains hold the closed hatch
      const [sx, sy, sw, sh] = PROPS.chain;
      ctx.drawImage(top, sx, sy, sw, sh, cx + dx * T - 2, gy + 2 * T, 4, 40);
    }
    ctx.imageSmoothingEnabled = false;
  }
}
