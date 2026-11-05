// Map window (hold Tab) with fog of war: only 4x4-tile cells the player has been near are drawn.
import * as M from './map.js';

const CELL = 4;
const CW = Math.ceil(M.MAIN_COLS / CELL), CH = Math.ceil(M.MAIN_ROWS / CELL);
let PX = 2; // map pixels per tile, set by fitWidth() so the whole map width fits the window
export const fitWidth = w => { PX = w / M.MAIN_COLS; };
export const explored = new Uint8Array(CW * CH);

export function load(str) {
  if (!str) return;
  try { const b = atob(str); for (let i = 0; i < Math.min(b.length, explored.length); i++) explored[i] = b.charCodeAt(i); } catch { /* bad save: start unexplored */ }
}
export const dump = () => btoa(String.fromCharCode.apply(null, explored));

export function reveal(px, py, radiusTiles) {
  const tx = px / M.T, ty = py / M.T, r = radiusTiles;
  for (let cy = Math.floor((ty - r) / CELL); cy <= Math.floor((ty + r) / CELL); cy++)
    for (let cx = Math.floor((tx - r) / CELL); cx <= Math.floor((tx + r) / CELL); cx++) {
      if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) continue;
      const nx = Math.max(cx * CELL, Math.min(tx, cx * CELL + CELL)), ny = Math.max(cy * CELL, Math.min(ty, cy * CELL + CELL));
      if (Math.hypot(nx - tx, ny - ty) <= r) explored[cy * CW + cx] = 1;
    }
}
export const seenAt = (tx, ty) => !!explored[Math.floor(ty / CELL) * CW + Math.floor(tx / CELL)];

// 1px-per-tile picture of the main map, built once (only ever drawn in the main scene).
let terrain;
function buildTerrain() {
  terrain = document.createElement('canvas');
  terrain.width = M.COLS; terrain.height = M.ROWS;
  const c = terrain.getContext('2d'), img = c.createImageData(M.COLS, M.ROWS);
  for (let y = 0; y < M.ROWS; y++) {
    const z = M.zoneOfRow(y);
    for (let x = 0; x < M.COLS; x++) {
      const t = M.tileAt(x, y), i = (y * M.COLS + x) * 4;
      const [r, g, b] = t === M.WATER ? (z.mapWater ?? [30, 96, 146]) : t === M.STRUCT ? [150, 156, 168] : M.gateInfo(t) ? [200, 60, 70] : z.mapRock ?? [128, 116, 96];
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
}

export const viewRows = h => h / PX;
// screen point inside the map window -> map tile
export const pickTile = (box, top, sx, sy) => ({ tx: (sx - box.x) / PX, ty: top + (sy - box.y) / PX });

// box: the window on screen { x, y, w, h }; marks: [{ tx, ty, color, label, blink }]
export function draw(ctx, box, top, marks, now) {
  if (!terrain) buildTerrain();
  const W = box.w, H = box.h, rows = viewRows(H), offX = 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(box.x - 3, box.y - 3, W + 6, H + 6);
  ctx.strokeStyle = '#b02030'; ctx.lineWidth = 2; ctx.strokeRect(box.x - 1, box.y - 1, W + 2, H + 2);
  ctx.beginPath(); ctx.rect(box.x, box.y, W, H); ctx.clip(); ctx.translate(box.x, box.y);
  ctx.fillStyle = '#020508'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terrain, 0, top, M.COLS, rows, offX, 0, M.COLS * PX, H);
  ctx.fillStyle = '#020508';
  for (let cy = Math.floor(top / CELL); cy <= Math.floor((top + rows) / CELL); cy++)
    for (let cx = 0; cx < CW; cx++)
      if (!explored[cy * CW + cx]) ctx.fillRect(offX + cx * CELL * PX, (cy * CELL - top) * PX, CELL * PX, CELL * PX);
  ctx.font = '10px Galmuri9, monospace';
  ctx.textAlign = 'left';
  for (let m = 0; m <= M.ROWS * M.M_PER_TILE; m += 250) {
    const y = (m / M.M_PER_TILE - top) * PX;
    if (y < 0 || y > H) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(W - 30, y, 30, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillText(m + 'm', W - 30, y - 2);
  }
  ctx.textAlign = 'center';
  let hoverLabel = null;
  for (const k of marks) {
    if (k.blink && Math.floor(now * 3) % 2) continue;
    const x = offX + (k.tx + 0.5) * PX, y = (k.ty - top + 0.5) * PX;
    if (y < -10 || y > H + 10) continue;
    if (k.area) { // a rough area (조각 탐지): a pulsing dashed circle of k.area tiles, shown over the fog too
      const r = k.area * PX;
      ctx.save(); ctx.globalAlpha = 0.16 + 0.06 * Math.sin(now * 3); ctx.fillStyle = k.color;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
      ctx.strokeStyle = k.color; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#000'; ctx.fillText(k.label, x + 1, y + 4); ctx.fillStyle = k.color; ctx.fillText(k.label, x, y + 3);
      continue;
    }
    if (k.ring) {
      ctx.strokeStyle = k.hover ? '#fff' : '#7ec8ff'; ctx.lineWidth = k.hover ? 2 : 1;
      ctx.beginPath(); ctx.arc(x, y, (k.hover ? 9 : 6) + Math.sin(now * 4), 0, 7); ctx.stroke(); ctx.lineWidth = 1;
      if (k.hover) hoverLabel = { x, y, name: k.name };
      continue;
    }
    ctx.fillStyle = '#000'; ctx.fillRect(x - 3, y - 3, 6, 6);
    ctx.fillStyle = k.color; ctx.fillRect(x - 2, y - 2, 4, 4);
    const ly = y < 14 ? y + 13 : y - 6; // labels near the top edge go below the dot
    if (k.label) { ctx.fillStyle = '#000'; ctx.fillText(k.label, x + 1, ly + 1); ctx.fillStyle = k.color; ctx.fillText(k.label, x, ly); }
  }
  if (hoverLabel) { // the hovered teleport point's name, boxed so it stands out over the other labels
    const { x, y, name } = hoverLabel, w = ctx.measureText(name).width + 8, ly = y < 24 ? y + 12 : y - 22;
    ctx.fillStyle = '#b02030'; ctx.fillRect(x - w / 2, ly, w, 13);
    ctx.fillStyle = '#fff'; ctx.fillText(name, x, ly + 10);
  }
  ctx.restore();
}

