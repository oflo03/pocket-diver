// Dumps both maps as character grids for scripts/render-map.py.
// Run: node scripts/dump-map.mjs map.json && python scripts/render-map.py map.json
import { writeFileSync } from 'node:fs';
import * as M from '../src/map.js';

const dump = name => {
  M.setScene(name);
  const grid = [];
  for (let y = 0; y < M.ROWS; y++) {
    let row = '';
    for (let x = 0; x < M.COLS; x++) {
      const t = M.tileAt(x, y), g = M.gateInfo(t);
      row += t === M.WATER ? '.' : g ? (g.kind === 'boss' ? 'B' : 'E') : '#';
    }
    grid.push(row);
  }
  return { cols: M.COLS, rows: M.ROWS, base: M.BASE, grid };
};

const out = { tutorial: dump('tutorial'), main: dump('main'), zones: M.ZONES, npcs: M.NPCS, T: M.T, mpt: M.M_PER_TILE };
writeFileSync(process.argv[2] ?? 'map.json', JSON.stringify(out));
