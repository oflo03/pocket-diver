// Static map for zones 1~3. Built from a fixed seed so every visit is identical (GAME_DESIGN.md 6번).
// ponytail: generated instead of hand-drawn in Tiled; swap buildMap() for a Tiled JSON loader once the levels are designed.

export const T = 16; // px per tile
export const M_PER_TILE = 4; // depth meters per tile: zone 1 = 0~1000m, zone 2 = 1000~3000m, zone 3 = 3000~6000m
// Two separate maps: the tutorial fish farm and the main sea. setScene() swaps which one the live bindings point at.
const MAIN = { cols: 240, rows: 1502 };
const FARM_MAP = { cols: 52, rows: 22 };
export const MAIN_COLS = MAIN.cols, MAIN_ROWS = MAIN.rows;
// The marine base floats at the top-left of the main sea, over a shallow shore whose seaward side slopes down
// to the right. Its main deck is a one-way platform the player can jump up through and land on (handled in
// main.js, not as tiles); the buildings are background art drawn by drawRig().
export const STRUCT = 3;
export const RIG = {
  deck: { x0: 2, x1: 14 }, // tile columns of the walkable main deck
  shore: 11, // last land column one tile under the waterline; the shore slopes away under the base
};
export const DECK_TOP = -18; // px, the deck surface the player stands on
// x/y = where the player spawns (standing on the dock), reach = x range where E opens the base menu
export const MAIN_BASE = { x: 8 * T, y: -14, reach: [0, 18 * T], deck: RIG.deck };
export let COLS, ROWS, BASE, scene;
let B; // the map being built or played

export const WATER = 0, ROCK = 1;
// Gate tiles carry their zone: 10 + id is the boss-room door, 20 + id is the floor hatch down to the next zone.
export const bossGate = id => 10 + id;
export const exitGate = id => 20 + id;
export const gateInfo = t => (t >= 20 ? { kind: 'exit', zone: t - 20 } : t >= 10 ? { kind: 'boss', zone: t - 10 } : null);

export const TUTORIAL_POOL = { x0: 1, x1: 32, y0: 1, y1: 14 }; // the farm tank in the tutorial map
// the farm's base floats in a small harbour right of the tank (same art and deck size as the main one)
const TUTORIAL_BASE = { x: 41 * T, y: -4, reach: [34 * T, 49 * T], deck: { x0: 35, x1: 47 } };

// terrain: 'islands' = scattered rocks (rock where noise > thresh), 'maze' = mostly rock cut by winding channels.
export const ZONES = [
  {
    id: 1, name: '구역 1 연안', y0: 0, y1: 251, piece: '빨강 조각', color: '#ff3040', xMin: 2,
    terrain: { kind: 'islands', freq: 0.11, thresh: 0.72 }, // only small rocks near the shore
    entry: { x: 123, y: 0 },
    treasures: [{ x: 16, y: 100 }, { x: 204, y: 140, deep: true }, { x: 44, y: 212 }],
    bossRoom: { x0: 111, x1: 135, y0: 223, y1: 247 }, bossDoor: { x0: 118, x1: 128 }, shape: 'round', // circle r=12
    // [species, how many, HP share]: the share multiplies that boss's HP and is its width on the boss bar (Manaphy 2 : Phione 1 : 1 : 1)
    bosses: [['manaphy', 1, 2], ['phione', 3]], bossLevel: 30, areaCounts: [100, 80, 60],
  },
  {
    id: 2, name: '구역 2 심해', y0: 252, y1: 751, piece: '초록 조각', color: '#30e070', xMin: 2,
    terrain: { kind: 'islands', freq: 0.08, thresh: 0.6 },
    rockTop: 'hsl(170,28%,34%)', rockBody: 'hsl(220,16%,22%)', mapWater: [18, 52, 86], mapRock: [70, 86, 92],
    entry: { x: 123, y: 252 }, portal: { x: 123, y: 258 }, // right under the zone 1 boss room; base warps here once zone 1 is offered
    treasures: [{ x: 212, y: 342 }, { x: 10, y: 380 }, { x: 112, y: 567, deep: true }, { x: 164, y: 692, deep: true }],
    bossRoom: { x0: 3, x1: 43, y0: 703, y1: 743 }, bossDoor: { x0: 18, x1: 28 }, shape: 'round', // circle r=20, against the left wall
    solidRects: [{ x0: 172, y0: 706, x1: 239, y1: 751 }], // bottom-right corner filled in per the guide
    bosses: [['lugia', 1]], bossLevel: 60, areaCounts: [80, 64, 48],
    shinyGift: true, // the one zone whose first trip guarantees a shiny (GAME_DESIGN.md 8번)
  },
  {
    id: 3, name: '구역 3 해구', y0: 752, y1: 1501, piece: '파랑 조각', color: '#4a8cff', xMin: 2,
    terrain: { kind: 'maze', freq: 0.055 }, // dense maze that tightens with depth
    rockTop: 'hsl(265,26%,34%)', rockBody: 'hsl(255,18%,18%)', mapWater: [16, 26, 64], mapRock: [76, 64, 104],
    entry: { x: 23, y: 752 }, portal: { x: 23, y: 758 }, // right under the zone 2 boss room
    treasures: [{ x: 60, y: 830 }, { x: 204, y: 960, deep: true }, { x: 28, y: 1110 }, { x: 180, y: 1260, deep: true }, { x: 70, y: 1400 }],
    bossRoom: { x0: 180, x1: 224, y0: 1450, y1: 1494 }, bossDoor: { x0: 197, x1: 207 }, cave: true, // open hall, corners rounded
    bossWrap: 16, // nothing next to Kyogre's hall: a thick rock mass all around it
    solidRects: [{ x0: 0, y0: 1430, x1: 157, y1: 1501 }], // the old boss corner is solid rock now
    bosses: [['kyogre', 1]], bossLevel: 90, areaCounts: [40, 32, 24], // the trench is sparse (GAME_DESIGN.md 8번)
  },
];
export const zoneOfRow = ty => ZONES.find(z => ty <= z.y1) ?? ZONES[ZONES.length - 1];

// Non-battle upgrade NPCs, each in its own small cave (positions from the map revision guide).
export const NPCS = [
  { key: 'uxie', name: '유크시', kind: 'ev', x: 224, y: 21 }, // low enough that its cave stays inside the map
  { key: 'mesprit', name: '엠라이트', kind: 'iv', x: 228, y: 607 },
  { key: 'azelf', name: '아그놈', kind: 'luck', x: 118, y: 1125 },
];

const SEED = 4242;
function hash(i, j) {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + SEED) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const inside = (x, y) => x >= 0 && x < B.cols && y >= 0 && y < B.rows;
const set = (x, y, v) => { if (inside(x, y)) B.cells[y * B.cols + x] = v; };
const get = (x, y) => (inside(x, y) ? B.cells[y * B.cols + x] : ROCK);
const carve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, WATER); };
const fill = (x0, y0, x1, y1, v = ROCK) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, v); };
const disc = (cx, cy, r, v) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, v); };

// The main shaft winds from the zone entry down to the boss door so the boss is always reachable.
const shaftX = (z, y) => {
  const y1 = z.bossRoom.y0 - 4, t = Math.min(1, Math.max(0, (y - z.entry.y) / (y1 - z.entry.y)));
  const door = (z.bossDoor.x0 + z.bossDoor.x1) / 2;
  return Math.round(z.entry.x + (door - z.entry.x) * t + Math.sin(y * 0.05) * 18 * Math.sin(t * Math.PI));
};

// Ragged cliff walls on both sides instead of a straight edge.
const wallLeft = (y, z) => 1 + Math.floor(noise(y * 0.035, 3 + z.id * 11) * 9 + noise(y * 0.12, 5) * 3);
const wallRight = (y, z) => 1 + Math.floor(noise(y * 0.035, 17 + z.id * 11) * 9 + noise(y * 0.12, 23) * 3);

function rockAt(z, x, y) {
  const t = z.terrain, f = t.freq, k = z.id * 97;
  if (t.kind === 'islands') return noise(x * f + k, y * f) * 0.7 + noise(x * f * 2.6, y * f * 2.6 + k) * 0.3 > t.thresh;
  // maze: open water only along the ridge lines of two noise fields; channels narrow as the trench gets deeper
  const depth = (y - z.y0) / (z.y1 - z.y0);
  const ridge = n => 1 - Math.abs(n * 2 - 1);
  const a = ridge(noise(x * f + k, y * f)), b = ridge(noise(x * f * 1.7 + 50, y * f * 1.7 + k));
  const open = a > 0.8 + depth * 0.06 || b > 0.86 + depth * 0.05;
  return !open;
}

// Cellular-automata smoothing (3x3 majority) inside a box, to round off jagged rock edges.
function smoothBox(x0, y0, x1, y1, passes) {
  for (let p = 0; p < passes; p++) {
    const copy = B.cells.slice();
    const g = (x, y) => (inside(x, y) ? copy[y * B.cols + x] : ROCK);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!inside(x, y) || copy[y * B.cols + x] > ROCK) continue; // leave gates alone
        let rock = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g(x + dx, y + dy) !== WATER) rock++;
        if (rock >= 6) B.cells[y * B.cols + x] = ROCK;
        else if (rock <= 3) B.cells[y * B.cols + x] = WATER;
      }
  }
}

// Natural treasure cave: an irregular rock mass with one winding passage that circles the pocket
// (laps = how many times it goes around) before reaching it, so the piece feels tucked deep inside.
function treasureCave(t, laps, R, outAng, room = [2.5, 2]) {
  for (let y = t.y - R - 7; y <= t.y + R + 7; y++)
    for (let x = t.x - R - 7; x <= t.x + R + 7; x++) {
      const a = Math.atan2(y - t.y, x - t.x);
      const edge = R + (noise(Math.cos(a) * 1.6 + t.x, Math.sin(a) * 1.6 + t.y) - 0.5) * 10;
      if (Math.hypot(x - t.x, y - t.y) <= edge) set(x, y, ROCK);
    }
  // spiral from the outer edge inward; radius shrinks from R-1 to 2 over `laps` turns, with a noisy wobble
  const steps = Math.ceil(laps * 120);
  let px = null, py = null;
  for (let i = 0; i <= steps; i++) {
    // uneven turning speed and a slow radial wander keep it from looking like a drawn spiral
    const k = i / steps, ang = outAng + (k + (noise(i * 0.025, t.x * 0.1) - 0.5) * 0.25) * laps * Math.PI * 2;
    const r = (R + 2) * (1 - k) + room[0] * k + (noise(i * 0.04, t.y * 0.1) - 0.5) * 5;
    const x = Math.round(t.x + Math.cos(ang) * r), y = Math.round(t.y + Math.sin(ang) * r);
    if (x === px && y === py) continue;
    px = x; py = y;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (ox * ox + oy * oy <= 1) set(x + ox, y + oy, WATER);
  }
  ellipse(t.x, t.y, room[0], room[1], WATER);
  smoothBox(t.x - R - 7, t.y - R - 7, t.x + R + 7, t.y + R + 7, 2);
  ellipse(t.x, t.y, room[0], room[1], WATER);
  carve(t.x - 1, t.y - 1, t.x + 1, t.y + 1); // the pocket itself always stays open
  return { x: Math.round(t.x + Math.cos(outAng) * (R + 4)), y: Math.round(t.y + Math.sin(outAng) * (R + 4)) };
}

const ellipse = (cx, cy, rx, ry, v) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, v);
};

// Narrow 1-tile tunnel from (x, y) toward the shaft until it meets water that is already reachable.
function tunnel(x, y, z, reach) {
  const goal = shaftX(z, y);
  const dir = Math.sign(goal - x) || 1;
  let wob = 0;
  const open3 = (cx, cy) => carve(cx - 1, cy - 1, cx + 1, cy + 1); // entrances are at least 3 tiles wide
  for (let i = 0; i < 300 && !(reach(x, y) && get(x, y) === WATER); i++) {
    open3(x, y);
    if (i % 5 === 4) { wob = Math.round(noise(x * 0.3, y * 0.3) * 2 - 1); y += wob; open3(x, y); }
    x += dir;
  }
}

function floodFrom(x0, y0) {
  const seen = new Uint8Array(B.cols * B.rows);
  const st = [[x0, y0]];
  seen[y0 * B.cols + x0] = 1;
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny) || seen[ny * B.cols + nx]) continue;
      const t = get(nx, ny);
      if (t === ROCK) continue; // gates count as passable: they open during play
      seen[ny * B.cols + nx] = 1;
      st.push([nx, ny]);
    }
  }
  return (x, y) => inside(x, y) && !!seen[y * B.cols + x];
}

function buildZone(z) {
  for (let y = z.y0; y <= z.y1; y++) {
    const wl = wallLeft(y, z), wr = B.cols - 1 - wallRight(y, z);
    for (let x = 0; x < B.cols; x++) {
      const floor = z.y1 - 7 + Math.floor(noise(x * 0.06, 9 + z.id * 40) * 6);
      const rock = y > z.y0 + 6 && rockAt(z, x, y);
      B.cells[y * B.cols + x] = x <= wl || x >= wr || y >= floor || rock ? ROCK : WATER;
    }
  }
  // filled-in areas get a wavy, noise-driven border instead of a straight cut, then a smoothing pass
  for (const r of z.solidRects ?? []) {
    const wave = (v, seed) => (noise(v * 0.05, seed) - 0.5) * 18 + (noise(v * 0.15, seed + 3) - 0.5) * 5;
    for (let y = r.y0 - 12; y <= r.y1; y++)
      for (let x = r.x0 - 12; x <= r.x1 + 12; x++) {
        const top = y >= r.y0 + wave(x, 31 + z.id);
        const left = r.x0 <= 0 || x >= r.x0 + wave(y, 47 + z.id);
        const right = r.x1 >= B.cols - 1 || x <= r.x1 + wave(y, 59 + z.id);
        if (top && left && right) set(x, y, ROCK);
      }
    smoothBox(r.x0 - 14, r.y0 - 14, r.x1 + 14, r.y1, 2);
  }
  const b = z.bossRoom, d = z.bossDoor;
  const shaftW = z.terrain.kind === 'maze' ? 1 : 3; // the trench keeps its maze, only a thin guaranteed path
  for (let y = z.entry.y; y < b.y0 - 3; y++) { const cx = shaftX(z, y); carve(cx - shaftW, y, cx + shaftW, y); }
  // boss room: wrapped in a thick, irregular rock mass that blends into the surrounding terrain,
  // then the room itself, the ceiling gate and the antechamber are cut back out
  const dist = roomDistance(z);
  const wrap = z.bossWrap ?? 5, pad = wrap + 13;
  for (let y = b.y0 - pad; y <= Math.min(z.y1, b.y1 + pad); y++)
    for (let x = b.x0 - pad; x <= b.x1 + pad; x++)
      if (dist(x, y) <= wrap + noise(x * 0.09 + z.id * 13, y * 0.09) * 9) set(x, y, ROCK);
  smoothBox(b.x0 - pad - 2, b.y0 - pad - 2, b.x1 + pad + 2, Math.min(z.y1, b.y1 + pad + 2), 2);
  for (let y = b.y0 - pad - 2; y < b.y0 - 3; y++) { const cx = shaftX(z, y); carve(cx - shaftW, y, cx + shaftW, y); }
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (dist(x, y) <= 0) set(x, y, WATER);
  // a straight, door-wide throat into the room keeps the entrance symmetric (a circle's top row is only a tile or two)
  carve(d.x0, b.y0, d.x1, b.y0 + 4);
  fill(d.x0, b.y0 - 3, d.x1, b.y0 - 1, bossGate(z.id));
  carve(d.x0 - 2, b.y0 - 8, d.x1 + 2, b.y0 - 4);
}

// Signed distance (in tiles) to the boss room wall: negative inside, positive outside.
function roomDistance(z) {
  const b = z.bossRoom;
  if (z.shape === 'round') {
    const cx = (b.x0 + b.x1) >> 1, cy = (b.y0 + b.y1) >> 1, r = (b.x1 - b.x0) >> 1;
    return (x, y) => Math.hypot(x - cx, y - cy) - r;
  }
  if (z.cave) { // rectangle with rounded corners
    const rc = 5, cx0 = b.x0 + rc, cx1 = b.x1 - rc, cy0 = b.y0 + rc, cy1 = b.y1 - rc;
    return (x, y) => {
      const qx = x < cx0 ? cx0 : x > cx1 ? cx1 : x, qy = y < cy0 ? cy0 : y > cy1 ? cy1 : y;
      if (qx === x && qy === y) return -Math.min(x - b.x0, b.x1 - x, y - b.y0, b.y1 - y) - 1;
      return Math.hypot(x - qx, y - qy) - rc;
    };
  }
  return (x, y) => Math.max(b.x0 - x, x - b.x1, b.y0 - y, y - b.y1);
}

// Treasure caves: every piece sits in a natural rock mass reached by one winding passage.
// 'deep' pieces get a big mass and a passage that circles the pocket about one and a half times.
function hideTreasures() {
  const reach = floodFrom(ZONES[0].entry.x, 1);
  for (const z of ZONES)
    for (const t of z.treasures) {
      const dir = Math.sign(shaftX(z, t.y) - t.x) || 1;
      // every cave gets its own size: deep ones R 10~17 with 1.2~2 laps, the rest R 5~9 with 0.4~0.9 laps
      const h1 = hash(t.x, t.y * 7), h2 = hash(t.y, t.x * 3);
      const [R, laps] = t.deep ? [10 + Math.round(h1 * 7), 1.2 + h2 * 0.8] : [5 + Math.round(h1 * 4), 0.4 + h2 * 0.5];
      const exit = treasureCave(t, laps, R, dir > 0 ? 0 : Math.PI);
      tunnel(exit.x, exit.y, z, reach);
    }
}

// Every water tile must sit inside some NxN block of water, so no passage is narrower than N tiles.
// Where that fails, the NxN block around the tile with the least rock gets carved open (never into the outer walls).
const PASSAGE = 3;
function widen(n = PASSAGE) {
  const W = B.cols, c = B.cells;
  const open = (x, y) => inside(x, y) && c[y * W + x] !== ROCK;
  for (let y = 1; y < B.rows - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (c[y * W + x] !== WATER) continue;
      let best = null, bestRock = n * n + 1;
      for (let oy = 1 - n; oy <= 0; oy++) for (let ox = 1 - n; ox <= 0; ox++) {
        const bx = x + ox, by = y + oy;
        if (bx < 1 || by < 0 || bx + n > W - 1 || by + n > B.rows - 1) continue;
        let rock = 0;
        for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (!open(bx + dx, by + dy)) rock++;
        if (rock === 0) { best = null; bestRock = 0; break; }
        if (rock < bestRock) { bestRock = rock; best = [bx, by]; }
      }
      if (best) for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) if (c[(best[1] + dy) * W + best[0] + dx] === ROCK) c[(best[1] + dy) * W + best[0] + dx] = WATER;
    }
}

// Rock thinner than 2 tiles (spikes, single-tile diagonal chains, specks) is washed away, so every wall is a solid
// mass that the slope cuts can round off cleanly. Only plain rock goes; gates and the outer walls stay.
function thicken(kept = () => false) {
  const W = B.cols, c = B.cells, rock = (x, y) => !inside(x, y) || c[y * W + x] !== WATER;
  for (let pass = 0; pass < 3; pass++) {
    const kill = [];
    for (let y = 1; y < B.rows - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (c[y * W + x] !== ROCK || kept(x, y)) continue;
      const h = rock(x - 1, y) || rock(x + 1, y), v = rock(x, y - 1) || rock(x, y + 1);
      const n = rock(x - 1, y) + rock(x + 1, y) + rock(x, y - 1) + rock(x, y + 1);
      if (n <= 1 || !h || !v) kill.push(y * W + x); // dangling, or only one tile thick in some direction
    }
    for (const i of kill) c[i] = WATER;
  }
}

// NPC homes: like a treasure cave, but the winding passage ends in a proper chamber where the NPC floats.
function npcHomes() {
  const reach = floodFrom(ZONES[0].entry.x, 1);
  for (const n of NPCS) {
    const z = zoneOfRow(n.y), dir = Math.sign(shaftX(z, n.y) - n.x) || 1;
    const exit = treasureCave(n, 0.9, 15, dir > 0 ? 0 : Math.PI, [8, 6]);
    tunnel(exit.x, exit.y, z, reach);
  }
}

function buildMain() {
  B = MAIN; B.cells = new Uint8Array(B.cols * B.rows);
  ZONES.forEach(buildZone);
  carve(1, 0, B.cols - 2, 5);
  // the shore under the dock: flat at the waterline, then the seaward side curves down and to the right
  // before falling back into the left wall (with a little noise and smoothing so it reads as natural ground)
  for (let y = 1; y < 70; y++) { // starts a tile down so the floating base's pontoons clear it
    // open sea under the pier: from the waterline the shore drops diagonally, then curves down as before
    const e = y <= 5 ? RIG.shore + y * 2 : y <= 18 ? 19 + 6 * Math.sqrt((y - 3) / 15) : 25 - (y - 18) * 0.55;
    const edge = Math.round(e + (noise(y * 0.15, 911) - 0.5) * 3);
    if (edge < 1) break;
    fill(1, y, edge, y);
  }
  smoothBox(0, 0, 36, 72, 2);
  carve(1, 0, 36, 0);
  // each boss room has a hatch in its floor that drops into the next zone's entry
  for (let i = 0; i + 1 < ZONES.length; i++) {
    const a = ZONES[i], n = ZONES[i + 1], cx = n.entry.x;
    carve(cx - 2, a.bossRoom.y1 + 1, cx + 2, n.y0 + 4);
    fill(cx - 2, a.bossRoom.y1 + 1, cx + 2, a.bossRoom.y1 + 2, exitGate(a.id));
  }
  retouch(); // before the hand-shaped caves, whose thin spiral walls are meant to stay
  npcHomes();
  hideTreasures();
  // treasure caves may have sealed part of a zone's route; re-open the shaft where the boss became unreachable
  let reach = floodFrom(ZONES[0].entry.x, 1);
  for (const z of ZONES) {
    const d = z.bossDoor;
    if (reach((d.x0 + d.x1) >> 1, z.bossRoom.y0 - 5)) continue;
    for (let y = z.entry.y + 1; y < z.bossRoom.y0 - 3; y++) { const cx = shaftX(z, y); for (let x = cx - 1; x <= cx + 1; x++) if (get(x, y) === ROCK) set(x, y, WATER); }
  }
  widen();
  // boss areas are mirror-symmetric: approach, door, room, floor hatch and the drop to the next zone.
  // First water wins (only opens space), then dead pockets are filled, then rock wins so a pocket filled on one
  // side is filled on the other too, and a last prune clears anything that left stranded.
  const boxes = ZONES.map((z, i) => {
    const b = z.bossRoom, next = ZONES[i + 1], cx = (b.x0 + b.x1) >> 1;
    return [cx, b.y0 - 16, next ? next.y0 + 12 : Math.min(z.y1, b.y1 + 4), Math.min(((b.x1 - b.x0) >> 1) + 12, cx - 1, B.cols - 2 - cx)];
  });
  for (const box of boxes) mirrorBox(...box, WATER);
  prune();
  for (const box of boxes) mirrorBox(...box, ROCK);
  widen(); // rock-wins mirroring can leave 1-tile gaps; re-widen, then mirror (water wins) so it stays symmetric
  for (const box of boxes) mirrorBox(...box, WATER);
  prune();
  despike(boxes);
  zoneWalls();
  widen();
  for (const box of boxes) mirrorBox(...box, WATER);
  prune();
}

// Zones are sealed from each other by a thick, wavy band of rock along each boundary; the only way through is the
// hatch shaft under the boss room (gate included), which is left exactly as carved.
function zoneWalls() {
  for (let i = 0; i + 1 < ZONES.length; i++) {
    const a = ZONES[i], n = ZONES[i + 1], cx = n.entry.x;
    for (let x = 1; x < B.cols - 1; x++) {
      const top = a.y1 - 3 - Math.round(noise(x * 0.09, 700 + i) * 4), bottom = n.y0 + 3 + Math.round(noise(x * 0.09, 720 + i) * 4);
      for (let y = top; y <= bottom; y++) {
        if (Math.abs(x - cx) <= 2 && y > a.bossRoom.y1) continue; // the hatch shaft down to the next zone
        if (get(x, y) === WATER) set(x, y, ROCK);
      }
    }
    // the shaft itself is open from the boss room floor, through the hatch, down into the next zone
    for (let y = a.bossRoom.y1 - 4; y <= n.y0 + 8; y++)
      for (let x = cx - 2; x <= cx + 2; x++) if (get(x, y) === ROCK) set(x, y, WATER);
  }
}

// Rounds the natural terrain to suit the organic tileset: specks and small rocks go, then a majority smoothing
// turns jagged edges into blobs, then anything still one tile thick is washed away. Boss rooms (and their doors
// and shafts) are left exactly as built.
function retouch() {
  const W = B.cols, c = B.cells;
  const keep = ZONES.map(z => { const b = z.bossRoom; return { x0: b.x0 - 4, x1: b.x1 + 4, y0: b.y0 - 18, y1: b.y1 + 4 }; });
  for (let i = 0; i + 1 < ZONES.length; i++) { // and the hatch shafts down to the next zone
    const cx = ZONES[i + 1].entry.x;
    keep.push({ x0: cx - 4, x1: cx + 4, y0: ZONES[i].bossRoom.y1, y1: ZONES[i + 1].y0 + 10 });
  }
  const kept = (x, y) => keep.some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  // small rock islands (under 14 tiles) dissolve into water
  const seen = new Uint8Array(W * B.rows);
  for (let i = 0; i < c.length; i++) {
    if (seen[i] || c[i] !== ROCK) continue;
    const comp = [i], q = [i];
    seen[i] = 1;
    let touchesWall = false;
    while (q.length && comp.length < 14) {
      const j = q.pop(), x = j % W, y = (j / W) | 0;
      if (x <= 1 || x >= W - 2 || y >= B.rows - 2) touchesWall = true;
      for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < c.length && !seen[k] && c[k] === ROCK) { seen[k] = 1; comp.push(k); q.push(k); }
    }
    if (comp.length < 14 && !q.length && !touchesWall && !comp.some(j => kept(j % W, (j / W) | 0))) for (const j of comp) c[j] = WATER;
  }
  // majority smoothing outside the boss areas
  for (let pass = 0; pass < 3; pass++) {
    const copy = c.slice();
    for (let y = 1; y < B.rows - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (copy[i] > ROCK || kept(x, y)) continue;
      let rock = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (copy[i + dy * W + dx] !== WATER) rock++;
      if (rock >= 6) c[i] = ROCK; else if (rock <= 3) c[i] = WATER;
    }
  }
  // morphological open (rounds bumps, drops anything under 3 tiles thick) then close (fills nicks and notches)
  const morph = grow => {
    const copy = c.slice();
    for (let y = 1; y < B.rows - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (copy[i] > ROCK || kept(x, y)) continue;
      const n = [i - 1, i + 1, i - W, i + W].filter(k => copy[k] !== WATER).length;
      if (grow && copy[i] === WATER && n > 0) c[i] = ROCK;
      if (!grow && copy[i] === ROCK && n < 4) c[i] = WATER;
    }
  };
  morph(false); morph(true); morph(true); morph(false);
  thicken();
}

// Last touch after the caves and widening (whose carving leaves slivers): one-tile-thick rock and tiles poking out
// with water on three sides become water, so nothing is left for the slope cuts to turn into thorns.
// Caves and boss areas are left alone.
function despike(boxes) {
  const W = B.cols, c = B.cells;
  const safe = [...ZONES.flatMap(z => z.treasures.map(t => [t.x, t.y, 12])), ...NPCS.map(n => [n.x, n.y, 12])];
  const kept = (x, y) => safe.some(([sx, sy, r]) => Math.abs(x - sx) <= r && Math.abs(y - sy) <= r)
    || boxes.some(([cx, y0, y1, hw]) => y >= y0 && y <= y1 && Math.abs(x - cx) <= hw + 1);
  thicken(kept);
  for (let pass = 0; pass < 3; pass++) {
    const kill = [];
    for (let y = 1; y < B.rows - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (c[y * W + x] !== ROCK || kept(x, y)) continue;
      const open = (c[y * W + x - 1] === WATER) + (c[y * W + x + 1] === WATER) + (c[(y - 1) * W + x] === WATER) + (c[(y + 1) * W + x] === WATER);
      if (open >= 3) kill.push(y * W + x);
    }
    if (!kill.length) break;
    for (const i of kill) c[i] = WATER;
  }
}

// no dead pockets: any water the player can never reach (sealed channels, cut-off rooms) becomes rock
function prune() {
  const reach = floodFrom(ZONES[0].entry.x, 1);
  for (let y = 0; y < B.rows; y++)
    for (let x = 0; x < B.cols; x++)
      if (B.cells[y * B.cols + x] === WATER && !reach(x, y)) B.cells[y * B.cols + x] = ROCK;
}

// Make a box symmetric about column cx: where the two sides differ (water vs rock), both become `wins`.
function mirrorBox(cx, y0, y1, half, wins) {
  for (let y = y0; y <= y1; y++)
    for (let d = 1; d <= half; d++) {
      const l = get(cx - d, y), r = get(cx + d, y);
      if (l === r || l > ROCK || r > ROCK) continue; // leave gates alone
      set(cx - d, y, wins); set(cx + d, y, wins);
    }
}

// Tutorial fish farm: one walled tank next to the base, nothing else.
function buildFarm() {
  B = FARM_MAP; B.cells = new Uint8Array(B.cols * B.rows).fill(ROCK);
  const p = TUTORIAL_POOL;
  carve(p.x0, p.y0, p.x1, p.y1);
  carve(1, 0, B.cols - 2, 0);
  carve(34, 0, B.cols - 2, 2); // harbour under the base
}

buildFarm();
buildMain();
export function setScene(name) {
  scene = name;
  B = name === 'tutorial' ? FARM_MAP : MAIN;
  COLS = B.cols; ROWS = B.rows;
  BASE = name === 'tutorial' ? TUTORIAL_BASE : MAIN_BASE;
}
setScene('main');

export const tileAt = (x, y) => {
  // above the surface the outer columns are invisible walls, so you cannot walk off the map's left or right end
  if (y < 0) return x <= 0 || x >= COLS - 1 ? ROCK : WATER;
  return x < 0 || x >= COLS || y >= ROWS ? ROCK : B.cells[y * COLS + x];
};

// isOpen(gate) decides whether a gate tile ({ kind, zone }) lets you through.
// Rock corners that face open water diagonally are cut at 45 degrees (drawn and collided as a slope), so staircase
// terrain reads as diagonal walls. Bits: 1 = top-left, 2 = top-right, 4 = bottom-left, 8 = bottom-right corner cut away.
export const CUT_NW = 1, CUT_NE = 2, CUT_SW = 4, CUT_SE = 8;
const cutCache = { main: null, tutorial: null };
export function cutAt(x, y) {
  if (tileAt(x, y) !== ROCK || y < 0) return 0;
  const c = cutCache[scene] ??= new Int8Array(COLS * ROWS).fill(-1), i = y * COLS + x;
  if (c[i] >= 0) return c[i];
  const w = (dx, dy) => tileAt(x + dx, y + dy) === WATER;
  let m = 0;
  if (w(0, -1) && w(-1, 0) && w(-1, -1)) m |= CUT_NW;
  if (w(0, -1) && w(1, 0) && w(1, -1)) m |= CUT_NE;
  if (w(0, 1) && w(-1, 0) && w(-1, 1)) m |= CUT_SW;
  if (w(0, 1) && w(1, 0) && w(1, 1)) m |= CUT_SE;
  if (m & (m - 1)) m = 0; // two or more cuts would leave a thorn: such a nub stays a plain block
  return (c[i] = m);
}
// Does the part of a cell covered by [x0,x1]x[y0,y1] (local px, 0..size) touch the rock left after the cuts?
export function cutHits(m, x0, y0, x1, y1, size = T) {
  if (m & CUT_NW && x1 + y1 <= size) return false;
  if (m & CUT_NE && y1 - x0 <= 0) return false;
  if (m & CUT_SW && x1 - y0 <= 0) return false;
  if (m & CUT_SE && x0 + y0 >= size) return false;
  return true;
}

// ---------- fine grid ----------
// Terrain is drawn and collided on a grid of quarter tiles (SUB x SUB per tile, ST px each) so walls are finer than
// the 16px gameplay tiles: the tile map is split, convex corners are rounded off and inner corners filled, then the
// 45-degree cuts are worked out per quarter tile. Gameplay (spawns, crawling, props, the map screen) stays on tiles.
export const SUB = 2, ST = T / SUB;
const subCache = { main: null, tutorial: null };
function subGrid() {
  if (subCache[scene]) return subCache[scene];
  const W = COLS * SUB, H = ROWS * SUB, g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = B.cells[((y / SUB) | 0) * COLS + ((x / SUB) | 0)];
  const at = (a, x, y) => (y < 0 ? WATER : x < 0 || x >= W || y >= H ? ROCK : a[y * W + x]);
  for (const round of [true, false]) {
    const copy = g.slice();
    for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
      const t = copy[y * W + x];
      if (t > ROCK) continue; // gates keep their exact shape
      let rock = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(copy, x + dx, y + dy) !== WATER) rock++;
      if (round && t === ROCK && rock <= 4) g[y * W + x] = WATER; // convex corner
      if (!round && t === WATER && rock >= 6 && y > 0) g[y * W + x] = ROCK; // inner corner
    }
  }
  // no horns: rock only one fine cell thick (across or down) or poking out with water on three sides is washed away,
  // so the 45-degree cuts never turn a sliver into a spike
  for (let pass = 0; pass < 3; pass++) {
    const copy = g.slice(), kill = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (copy[y * W + x] !== ROCK) continue;
      const wl = at(copy, x - 1, y) === WATER, wr = at(copy, x + 1, y) === WATER, wu = at(copy, x, y - 1) === WATER, wd = at(copy, x, y + 1) === WATER;
      if ((wl && wr) || (wu && wd) || wl + wr + wu + wd >= 3) kill.push(y * W + x);
    }
    if (!kill.length) break;
    for (const i of kill) g[i] = WATER;
  }
  return (subCache[scene] = { g, W, H });
}
export function subAt(x, y) {
  if (y < 0) return tileAt(Math.floor(x / SUB), -1);
  const { g, W, H } = subGrid();
  return x < 0 || x >= W || y >= H ? ROCK : g[y * W + x];
}
export function subSolid(x, y, isOpen) {
  const t = subAt(x, y);
  if (t === WATER) return false;
  const gi = gateInfo(t);
  return !gi || !isOpen(gi);
}
const subCutCache = { main: null, tutorial: null };
export function subCut(x, y) {
  if (y < 0 || subAt(x, y) !== ROCK) return 0;
  const { W, H } = subGrid(), c = subCutCache[scene] ??= new Int8Array(W * H).fill(-1), i = y * W + x;
  if (c[i] >= 0) return c[i];
  const w = (dx, dy) => subAt(x + dx, y + dy) === WATER;
  let m = 0;
  if (w(0, -1) && w(-1, 0) && w(-1, -1)) m |= CUT_NW;
  if (w(0, -1) && w(1, 0) && w(1, -1)) m |= CUT_NE;
  if (w(0, 1) && w(-1, 0) && w(-1, 1)) m |= CUT_SW;
  if (w(0, 1) && w(1, 0) && w(1, 1)) m |= CUT_SE;
  if (m & (m - 1)) m = 0;
  return (c[i] = m);
}

export function solid(x, y, isOpen) {
  const t = tileAt(x, y);
  if (t === WATER) return false;
  const g = gateInfo(t);
  return !g || !isOpen(g);
}

export const depthOf = py => Math.max(0, (py / T) * M_PER_TILE);
export const inRect = (tx, ty, r) => tx >= r.x0 && tx <= r.x1 && ty >= r.y0 && ty <= r.y1;
