// Sanity checks for the generated main map: passage width, reachability of treasures/NPCs/bosses/portals.
// Run: node scripts/map-check.mjs
import * as M from '../src/map.js';
M.setScene('main');
const W = M.COLS, H = M.ROWS, water = (x, y) => y >= 0 && x >= 0 && x < W && y < H && M.tileAt(x, y) === M.WATER;
let narrow = 0;
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  if (!water(x, y)) continue;
  let ok = false;
  for (let oy = -2; oy <= 0 && !ok; oy++) for (let ox = -2; ox <= 0 && !ok; ox++) {
    let all = true;
    for (let dy = 0; dy < 3 && all; dy++) for (let dx = 0; dx < 3 && all; dx++) if (!water(x + ox + dx, y + oy + dy)) all = false;
    ok = all;
  }
  if (!ok) narrow++;
}
// flood ignoring gates (they open during play)
const pass = (x, y) => x >= 0 && x < W && y >= 0 && y < H && M.tileAt(x, y) !== M.ROCK;
const seen = new Uint8Array(W * H), q = [[M.ZONES[0].entry.x, 1]];
seen[W + M.ZONES[0].entry.x] = 1;
while (q.length) {
  const [x, y] = q.pop();
  for (const [a, b] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) if (pass(a, b) && !seen[b * W + a]) { seen[b * W + a] = 1; q.push([a, b]); }
}
const reach = (x, y) => !!seen[y * W + x];
const bad = [];
for (const z of M.ZONES) {
  z.treasures.forEach((t, i) => reach(t.x, t.y) || bad.push(`treasure ${z.id}-${i}`));
  const b = z.bossRoom;
  reach((b.x0 + b.x1) >> 1, (b.y0 + b.y1) >> 1) || bad.push('boss ' + z.id);
  if (z.portal && !reach(z.portal.x, z.portal.y)) bad.push('portal ' + z.id);
}
for (const n of M.NPCS) reach(n.x, n.y) || bad.push('npc ' + n.key);
let open = 0;
for (let i = 0; i < W * H; i++) if (seen[i]) open++;
console.log({ narrow, unreachable: bad, reachableTiles: open });
