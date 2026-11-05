// How enclosed each treasure is: share of rock in the 13x13 tiles around it (hidden caves are mostly rock).
import * as M from '../src/map.js';
M.setScene('main');
for (const z of M.ZONES) z.treasures.forEach((t, i) => {
  let rock = 0;
  for (let y = t.y - 6; y <= t.y + 6; y++) for (let x = t.x - 6; x <= t.x + 6; x++) if (M.tileAt(x, y) !== M.WATER) rock++;
  console.log(`${z.id}-${i}`, (rock / 169).toFixed(2));
});
