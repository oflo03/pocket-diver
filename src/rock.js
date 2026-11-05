// Rock painted as pixel art straight from the map, chunk by chunk, instead of stamping tileset pieces per cell: every
// art pixel is worked out from world position (distance to water, which side faces it, a pattern of rounded lumps
// laid in world space), so there are no seams between cells or chunks and no repeating tiles. One art pixel is ART
// world px, about the size of the player's sprite pixels (~0.37 world px), so rock and player read at the same scale.
// The look keeps the old tileset's idea: soft, lumpy sponge-and-coral rock, pitted with pores, bright where it meets
// the water and dark inside; green moss on the coast, cold teal on dark violet in the deep sea, mauve on maroon in
// the trench. Light comes from above: top faces carry a thick bright crust, undersides stay in shadow. The outline
// is wobbled a little by noise so the 8px collision grid and its 45-degree cuts don't show as straight lines.
// Near a zone boundary the two zones' colours meet in noisy patches.
import * as M from './map.js';

export const ART = 0.4; // world px per art px
const SUBA = M.ST / ART; // art px per fine cell (20)
export const CHUNK = 8 * M.T; // world px per chunk side
export const CA = CHUNK / ART; const MARGIN = 2 * SUBA, FA = CA + MARGIN * 2; // chunk art size, margin, full working size

const hex = h => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
// per zone: one ramp from the dark inside of the rock to its brightest crust, lump size, extras
const STYLES = {
  1: { ramp: ['#0a1413', '#10221e', '#163126', '#1e472e', '#2c6634', '#478f3b', '#78bb4a', '#b4de72'], lump: 15, pores: 0.35 },
  2: { ramp: ['#0b0a15', '#141223', '#1c1b33', '#222b45', '#284258', '#2e5e6e', '#47888b', '#82bfb3'], lump: 17, pores: 0.25, drips: true },
  3: { ramp: ['#0e060f', '#1c0b1b', '#2b1128', '#3d1938', '#562758', '#713f7c', '#9362a4', '#c59ade'], lump: 16, pores: 0.4, drips: true, glow: '#7ff0ff' },
};
const PAL = Object.fromEntries(Object.entries(STYLES).map(([k, s]) => [k, { ...s, ramp: s.ramp.map(hex), glow: s.glow && hex(s.glow) }]));
const TOP = 7; // brightest ramp step

const hash = (x, y, s = 0) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// smooth value noise in [0, 1)
function smoothNoise(x, y, s = 7) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s), b = hash(x0 + 1, y0, s), c = hash(x0, y0 + 1, s), d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// zone pair and mix for a world row (the same 12-tile crossfade as before, now in patches)
const BLEND = 12;
function zoneAt(wy) {
  if (M.scene === 'tutorial') return [1, 1, 0];
  const ty = wy / M.T;
  for (let i = 0; i + 1 < M.ZONES.length; i++) {
    const edge = M.ZONES[i].y1 + 1, d = ty - (edge - BLEND / 2);
    if (d >= 0 && d < BLEND) return [M.ZONES[i].id, M.ZONES[i + 1].id, d / BLEND];
  }
  const z = M.zoneOfRow(Math.max(0, Math.floor(ty))).id;
  return [z, z, 0];
}

// 0 water, 1 rock, 2 closed gate (a sealed pile of boulders, see sealPixel)
const WOBBLE = 3.2; // art px the outline may move each way (about 1.3 world px; collision stays on the grid)
function state(ax, ay, isOpen) {
  // a gate fills its own cells exactly where it meets rock, and gets the wobble only where it faces water
  const gt = M.subAt(Math.floor(ax / SUBA), Math.floor(ay / SUBA));
  const wx = ax + (smoothNoise(ax / 7, ay / 7, 41) - 0.5) * 2 * WOBBLE, wy = ay + (smoothNoise(ax / 7, ay / 7, 43) - 0.5) * 2 * WOBBLE;
  const sx = Math.floor(wx / SUBA), sy = Math.floor(wy / SUBA);
  if (sy < 0) return 0;
  const t = M.subAt(sx, sy);
  if (ay >= 0 && gt > M.ROCK) { const g = M.gateInfo(gt); return (g && isOpen(g)) || t === M.WATER ? 0 : 2; }
  if (t === M.WATER) return 0;
  if (t !== M.ROCK) { const g = M.gateInfo(t); return g && isOpen(g) ? 0 : 2; }
  const cut = M.subCut(sx, sy);
  if (!cut) return 1;
  const lx = wx - sx * SUBA, ly = wy - sy * SUBA;
  if (cut & M.CUT_NW && lx + ly < SUBA) return 0;
  if (cut & M.CUT_NE && ly < lx) return 0;
  if (cut & M.CUT_SW && lx < ly) return 0;
  if (cut & M.CUT_SE && lx + ly > SUBA) return 0;
  return 1;
}

// the gates whose open state changes this chunk's picture (closed = solid, open = water)
export function gatesIn(cx, cy) {
  const out = [], t0x = Math.floor((cx * CHUNK - MARGIN * ART) / M.T), t0y = Math.floor((cy * CHUNK - MARGIN * ART) / M.T);
  const n = Math.ceil(FA * ART / M.T) + 1;
  for (let ty = t0y; ty <= t0y + n; ty++) for (let tx = t0x; tx <= t0x + n; tx++) {
    const g = ty >= 0 && M.gateInfo(M.tileAt(tx, ty));
    if (g && !out.some(o => o.kind === g.kind && o.zone === g.zone)) out.push(g);
  }
  return out;
}

// Paints chunk (cx, cy): CA x CA RGBA bytes, or null when there is no rock in it. Pure (no DOM), so it also runs
// in rock-worker.js.
export function paintChunk(cx, cy, isOpen) {
  const ax0 = Math.round(cx * CHUNK / ART) - MARGIN, ay0 = Math.round(cy * CHUNK / ART) - MARGIN;
  const N = FA * FA, st = new Uint8Array(N);
  let any = false;
  // fine cells whose whole 3x3 neighbourhood is plain rock or plain water can't be reached by the wobble or a cut:
  // their pixels skip the per-pixel work
  const s0x = Math.floor(ax0 / SUBA) - 1, s0y = Math.floor(ay0 / SUBA) - 1, SN = Math.ceil(FA / SUBA) + 3, plain = new Int8Array(SN * SN).fill(-1);
  for (let j = 0; j < SN; j++) for (let k = 0; k < SN; k++) {
    const sx = s0x + k, sy = s0y + j, t = sy < 0 ? M.WATER : M.subAt(sx, sy);
    if (t > M.ROCK || (t === M.ROCK && M.subCut(sx, sy))) continue;
    let same = true;
    for (let dy = -1; dy <= 1 && same; dy++) for (let dx = -1; dx <= 1; dx++) {
      const u = sy + dy < 0 ? M.WATER : M.subAt(sx + dx, sy + dy);
      if (u !== t || (u === M.ROCK && M.subCut(sx + dx, sy + dy))) { same = false; break; }
    }
    if (same) plain[j * SN + k] = t === M.ROCK ? 1 : 0;
  }
  feats.clear();
  for (let y = 0; y < FA; y++) for (let x = 0; x < FA; x++) {
    const ax = ax0 + x, ay = ay0 + y, pl = plain[(Math.floor(ay / SUBA) - s0y) * SN + Math.floor(ax / SUBA) - s0x];
    if ((st[y * FA + x] = pl >= 0 ? pl : state(ax, ay, isOpen)) === 1) any = true;
  }
  if (!any) return null;
  const sol = new Uint8Array(N);
  for (let i = 0; i < N; i++) sol[i] = st[i] !== 0 ? 1 : 0;
  // runs: how far up / down to the other state (water vs solid), capped; row by row for speed
  const CAP = 64, up = new Uint8Array(N), dn = new Uint8Array(N);
  up.fill(CAP, 0, FA);
  for (let i = FA; i < N; i++) { const p = up[i - FA] + 1; up[i] = sol[i] === sol[i - FA] ? (p < CAP ? p : CAP) : 1; }
  dn.fill(CAP, N - FA);
  for (let i = N - FA - 1; i >= 0; i--) { const p = dn[i + FA] + 1; dn[i] = sol[i] === sol[i + FA] ? (p < CAP ? p : CAP) : 1; }
  // chamfer distance from water for solid pixels (how deep into the rock), in thirds of a pixel (3 straight, 4 diagonal)
  const D = new Uint16Array(N);
  for (let i = 0; i < N; i++) D[i] = sol[i] ? 999 : 0;
  for (let y = 1; y < FA; y++) for (let x = 1, i = y * FA + 1; x < FA - 1; x++, i++) {
    let v = D[i]; if (!v) continue;
    const a = D[i - 1] + 3, b = D[i - FA] + 3, c = D[i - FA - 1] + 4, d = D[i - FA + 1] + 4;
    if (a < v) v = a; if (b < v) v = b; if (c < v) v = c; if (d < v) v = d;
    D[i] = v;
  }
  for (let y = FA - 2; y >= 0; y--) for (let x = FA - 2, i = y * FA + x; x >= 1; x--, i--) {
    let v = D[i]; if (!v) continue;
    const a = D[i + 1] + 3, b = D[i + FA] + 3, c = D[i + FA + 1] + 4, d = D[i + FA - 1] + 4;
    if (a < v) v = a; if (b < v) v = b; if (c < v) v = c; if (d < v) v = d;
    D[i] = v;
  }
  const dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = D[i] / 3;
  const depthAt = (ax, ay) => { const x = Math.round(ax) - ax0, y = Math.round(ay) - ay0; return x < 0 || y < 0 || x >= FA || y >= FA ? 40 : dist[y * FA + x]; };

  const px = new Uint8ClampedArray(CA * CA * 4);
  for (let y = 0; y < CA; y++) {
    const ay = ay0 + MARGIN + y, [za, zb, mix] = zoneAt(ay * ART);
    for (let x = 0; x < CA; x++) {
      const ax = ax0 + MARGIN + x, i = (y + MARGIN) * FA + x + MARGIN;
      const P = PAL[mix && mix > smoothNoise(ax / 26, ay / 26, 77) * 0.9 + 0.05 ? zb : za]; // zones meet in patches, not a checkerboard
      const c = st[i] === 1 ? rockPixel(P, ax, ay, up[i], dn[i], dist[i], depthAt) : st[i] === 0 ? waterPixel(P, ax, ay, up[i], dn[i], st, i) : sealPixel(P, ax, ay, st, i, dist[i]);
      if (!c) continue;
      const o = (y * CA + x) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
  }
  return px;
}

// thickness of the bright crust on top faces at an art column: lumpy, 3 to 7 px
const crustAt = ax => 3 + Math.round(smoothNoise(ax / 5, 0, 17) * 4);

function rockPixel(P, ax, ay, u, d, depth, depthAt) {
  const R = P.ramp;
  if (d === 1 || depth <= 1) return u === 1 ? R[TOP - 1] : R[1]; // outline: dark, except along the lit top
  // top faces: a thick crust of moss / growth, brightest on top, with a soft dark rim along its lower edge
  const crust = crustAt(ax);
  if (u <= crust) {
    if (u === 1) return hash(ax, ay, 3) > 0.75 ? R[TOP] : R[TOP - 1];
    if (u === crust) return R[3];
    return u === 2 ? R[TOP - 1] : hash(ax, ay, 5) > 0.8 ? R[TOP - 1] : R[TOP - 2];
  }
  if (d <= 3) return R[d === 2 ? 1 : 2]; // undersides in shadow
  if (depth > 44) return R[1]; // too deep for any lump to show (see lumps)
  return lumps(P, ax, ay, depthAt, d);
}

// a lump's centre, size and id, cached while a chunk is painted (zones differ in lump size, hence C in the key)
const feats = new Map();
function feat(cx, cy, C) {
  const key = (cx * 4096 + cy) * 64 + C;
  let f = feats.get(key);
  if (!f) feats.set(key, f = [(cx + 0.2 + hash(cx, cy, 1) * 0.6) * C, (cy + 0.2 + hash(cx, cy, 2) * 0.6) * C, 0.75 + hash(cx, cy, 6) * 0.5, hash(cx, cy, 4)]);
  return f;
}

// Inside: rounded lumps packed together, each shaded like a little ball lit from the top-left, the gaps between
// them dark; some lumps carry a pore. Tone falls off with depth (read at a lump's centre, so a lump is one piece):
// the outer lumps are bright, a few lumps in the rock is just its dark inside.
function lumps(P, ax, ay, depthAt, below) {
  const R = P.ramp, C = P.lump, gx = Math.floor(ax / C), gy = Math.floor(ay / C);
  let d1 = 1e9, d2 = 1e9, fx = 0, fy = 0, id = 0, cpx = 0, cpy = 0, rad = 1;
  for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const f = feat(gx + k, gy + j, C), dx = ax + 0.5 - f[0], dy = ay + 0.5 - f[1], dd = Math.hypot(dx, dy) / f[2];
    if (dd < d1) { d2 = d1; d1 = dd; fx = dx; fy = dy; id = f[3]; cpx = f[0]; cpy = f[1]; rad = f[2]; } else if (dd < d2) d2 = dd;
  }
  const depth = depthAt(cpx, cpy);
  // lumps over open water (undersides, overhangs) stay in shadow
  const base = Math.max(0.5, 5.4 - depth / 6.5) + (id < 0.2 ? -0.8 : 0) - (below < 18 ? (18 - below) / 7 : 0);
  if (base < 0.9) return R[1]; // deep inside: the rock's plain dark body
  if (d2 - d1 < 1.6) return R[Math.max(0, Math.floor(base) - 2)]; // the gap between two lumps
  if (base < 1.5) return R[1]; // the last lumps before the dark, showing only by their gaps
  const nx = fx / (C * 0.55 * rad), ny = fy / (C * 0.55 * rad), lit = -(nx * 0.6 + ny * 0.8);
  let tone = Math.floor(base + (lit > 0.35 ? 1 : lit < -0.25 ? -1 : 0) + (lit > 0.7 ? 0.6 : 0));
  // a pore: a small dark pit below-right of the lump's centre, its lower lip catching light
  if (id > 1 - P.pores) {
    const pr = 1.4 + hash(Math.floor(cpx), Math.floor(cpy), 8) * 1.4, qx = fx - C * 0.12, qy = fy - C * 0.1, q = Math.hypot(qx, qy);
    if (q < pr) return R[Math.max(0, tone - 3)];
    if (q < pr + 1 && qy > 0) tone++;
  }
  if (P.glow && depth > 4 && depth < 30 && hash(ax, ay, 9) > 0.9975) return P.glow; // trench: glowing flecks
  return R[Math.max(0, Math.min(TOP - 1, tone))];
}

// water just outside the rock: tufts poking up from top faces, drips hanging under ledges
function waterPixel(P, ax, ay, u, d, st, i) {
  if (d <= 3 && st[i + d * FA] === 1) { // rock d px below
    const h = hash(ax, 21) > 0.72 ? 1 + Math.floor(hash(ax, 23) * 3) : 0;
    if (d <= h) return d === h ? P.ramp[TOP] : P.ramp[TOP - 1];
  }
  if (P.drips && u <= 5 && st[i - u * FA] === 1) { // rock u px above
    const h = hash(ax >> 1, 31) > 0.84 ? 1 + Math.floor(hash(ax >> 1, 33) * 5) : 0;
    if (u <= h) return u === h ? P.ramp[3] : P.ramp[1];
  }
  return null;
}


// A closed boss door or hatch: the passage is choked with big loose boulders, brighter than the rock around them
// (they sit in front of it), and the cracks between them glow in the zone's colour, the seal that breaks when the
// boss is taken. Where the pile meets the rock there is a dark crevice; where it meets water, the rock's outline.
const SEAL = 22; // boulder size, art px
const glows = new Map();
function glowRamp(P, zone) {
  const k = P.ramp[0].join() + zone;
  if (!glows.has(k)) {
    const z = M.ZONES.find(o => o.id === zone), c = hex(z?.color ?? '#ffffff'), mixc = (a, b, t) => a.map((v, j) => Math.round(v + (b[j] - v) * t));
    glows.set(k, [mixc(P.ramp[0], c, 0.3), mixc(P.ramp[0], c, 0.6), c, mixc(c, [255, 255, 255], 0.55)]);
  }
  return glows.get(k);
}
function sealPixel(P, ax, ay, st, i, depth) {
  const R = P.ramp, near = [st[i - 1], st[i + 1], st[i - FA], st[i + FA]];
  if (near.includes(0)) return st[i - FA] === 0 ? R[TOP - 2] : R[1]; // facing water: lit on top, dark elsewhere
  if (near.includes(1)) return R[0]; // the crevice against the rock
  const g = M.gateInfo(M.subAt(Math.floor(ax / SUBA), Math.floor(ay / SUBA))), G = glowRamp(P, g?.zone ?? 1);
  const gx = Math.floor(ax / SEAL), gy = Math.floor(ay / SEAL);
  let d1 = 1e9, d2 = 1e9, fx = 0, fy = 0, id = 0, id2 = 0;
  for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const cx = gx + k, cy = gy + j, r = 0.8 + hash(cx, cy, 56) * 0.4;
    const dx = ax + 0.5 - (cx + 0.2 + hash(cx, cy, 51) * 0.6) * SEAL, dy = ay + 0.5 - (cy + 0.2 + hash(cx, cy, 52) * 0.6) * SEAL, dd = Math.hypot(dx, dy) / r;
    if (dd < d1) { d2 = d1; id2 = id; d1 = dd; fx = dx; fy = dy; id = hash(cx, cy, 54); } else if (dd < d2) { d2 = dd; id2 = hash(cx, cy, 54); }
  }
  // only some cracks (one in three pairs of boulders) let the seal's light through, the rest are dark crevices
  const gap = d2 - d1, glowing = hash(Math.round(Math.min(id, id2) * 1e6), Math.round(Math.max(id, id2) * 1e6), 57) < 0.34;
  if (gap < 1.5) return glowing ? (gap < 0.6 ? G[2] : G[1]) : R[0];
  // each boulder shaded round: a lit cap towards the top-left, a shadowed rim towards the bottom-right
  const r = Math.hypot(fx, fy) / (SEAL * 0.5), lit = -(fx * 0.6 + fy * 0.8) / (SEAL * 0.5), base = 3.4 + (id < 0.3 ? -0.8 : 0) - Math.min(1.5, depth / 30);
  const tone = Math.floor(base + (lit > 0.2 && r < 0.75 ? 1 : 0) + (lit > 0.45 && r < 0.6 ? 0.8 : 0) - (lit < -0.15 && r > 0.45 ? 1 : 0));
  return R[Math.max(1, Math.min(TOP - 1, tone))];
}
