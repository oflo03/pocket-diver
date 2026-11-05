// Move effects modelled on the mainline move animations, drawn on the world canvas (world px, already offset by the
// camera; the game draws them on a layer of their own and turns it into pixel art, pixelate below). Each takes the fx record f, its screen position (x, y) and progress p (0..1). f.seed keeps the random
// spray of one effect stable from frame to frame.
const WATER = { deep: '#1f6fe0', mid: '#3d95ff', light: '#9fdcff', foam: '#ffffff' };
const rnd = (seed, i) => { const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453; return v - Math.floor(v); };
const ease = p => 1 - (1 - p) ** 3;
const clamp01 = v => Math.max(0, Math.min(1, v));
// how grand an effect is: f.tier (0..1, from the level the move is learned at: 5 -> 0, 100 -> 1; src/main.js
// moveTier) makes it bigger and busier; effects without one are middling
const tier = f => f.tier ?? 0.3;
const grow = f => 1 + 0.55 * tier(f);

// Effects are drawn smooth on a layer of their own, then turned into pixel art like the sprites: each colour channel
// stepped to six levels, and alpha made hard: a pixel is either solid or clear, partial alpha dithered through a 4x4
// ordered (Bayer) pattern, so a see-through glow becomes a checker of solid pixels as in hand-made sprites.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(b => (b + 0.5) * 16);
export function pixelate(c) {
  const { width: w, height: h } = c.canvas; if (!w || !h) return;
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let y = 0, i = 0; y < h; y++) {
    const row = (y & 3) * 4;
    for (let x = 0; x < w; x++, i += 4) {
      const a = d[i + 3]; if (!a) continue;
      if (a < BAYER[row + (x & 3)]) { d[i + 3] = 0; continue; }
      d[i] = Math.round(d[i] / 51) * 51; d[i + 1] = Math.round(d[i + 1] / 51) * 51; d[i + 2] = Math.round(d[i + 2] / 51) * 51; d[i + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
}

// a crescent along a circle from a0 to a1 (radius r), thickest in the middle
function crescent(ctx, x, y, r, a0, a1, thick) {
  const n = 18;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (a1 - a0) * i / n, w = thick * Math.sin(Math.PI * i / n);
    ctx.lineTo(x + Math.cos(a) * (r - w), y + Math.sin(a) * (r - w));
  }
  ctx.closePath(); ctx.fill();
}

function droplets(ctx, x, y, seed, n, spread, dist, ang, size, p, color = WATER.light, gravity = 0) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = ang + (rnd(seed, i) - 0.5) * spread, d = dist * (0.4 + rnd(seed, i + 50) * 0.6) * ease(p);
    const s = size * (0.5 + rnd(seed, i + 99) * 0.6) * (1 - p * 0.7);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d + gravity * p * p, Math.max(0.3, s), 0, 7); ctx.fill();
  }
}

// 셸블레이드: two water crescents cut down through the front, spray flung off the edge, a scallop glint at the end
export function shellSlash(ctx, f, x, y, p) {
  // the arc covers the hit zone in front: centred 0.3 of the reach ahead, 0.6 of it in radius
  x += Math.cos(f.ang) * f.reach * 0.3; y += Math.sin(f.ang) * f.reach * 0.3;
  const r = f.reach * 0.6 * grow(f), sweep = ease(Math.min(1, p / 0.55)), a0 = f.ang - 1.35, a1 = a0 + 2.5 * sweep;
  ctx.save();
  ctx.globalAlpha = 1 - Math.max(0, (p - 0.55) / 0.45);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(61,149,255,0.55)'; crescent(ctx, x, y, r * 1.08, a0, a1, r * 0.34);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = WATER.light; crescent(ctx, x, y, r, a0 + 0.1, a1, r * 0.22);
  ctx.fillStyle = WATER.foam; crescent(ctx, x, y, r * 1.0, a0 + 0.2, a1, r * 0.07);
  ctx.fillStyle = 'rgba(159,220,255,0.6)'; crescent(ctx, x, y, r * 0.72, a0 + 0.35, a1 - 0.1, r * 0.12); // second, inner cut
  const ex = x + Math.cos(a1) * r, ey = y + Math.sin(a1) * r;
  droplets(ctx, ex, ey, f.seed, 9, 1.2, r * 0.5, a1 + Math.PI / 2, 1.6, p, WATER.light, 10);
  if (p > 0.45) { // scallop glint
    const q = (p - 0.45) / 0.55, cx = x + Math.cos(f.ang) * r * 0.8, cy = y + Math.sin(f.ang) * r * 0.8, s = 6 * (1 - q * 0.4);
    ctx.globalAlpha = 1 - q; ctx.fillStyle = '#ffe27a';
    ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.6);
    for (let i = 0; i <= 6; i++) { const a = Math.PI + Math.PI * i / 6; ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b8862a'; ctx.lineWidth = 0.6;
    for (let i = 1; i < 6; i++) { const a = Math.PI + Math.PI * i / 6; ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.6); ctx.lineTo(cx + Math.cos(a) * s * 0.9, cy + Math.sin(a) * s * 0.9); ctx.stroke(); }
  }
  ctx.restore();
}

// 연속자르기: a sharp scythe crescent, alternating up and down cuts, larger (and doubled) as the chain grows
export function scythe(ctx, f, x, y, p) {
  x += Math.cos(f.ang) * f.reach * 0.3; y += Math.sin(f.ang) * f.reach * 0.3;
  const r = f.reach * 0.6 * grow(f), flip = f.n % 2 ? -1 : 1, sweep = ease(Math.min(1, p / 0.5));
  const a0 = f.ang - 1.1 * flip, a1 = a0 + 2.1 * flip * sweep;
  ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (p - 0.5) / 0.5);
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(160,220,70,0.5)'; crescent(ctx, x, y, r * 1.06, lo, hi, r * 0.3);
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#c8f070'; crescent(ctx, x, y, r, lo, hi, r * 0.16);
  ctx.fillStyle = '#ffffff'; crescent(ctx, x, y, r, lo, hi, r * 0.05);
  for (let k = 1; k <= f.n; k++) { ctx.fillStyle = `rgba(200,240,112,${0.45 / k})`; crescent(ctx, x, y, r * (1 - k * 0.16), lo + 0.1, hi - 0.1, r * 0.1); }
  ctx.restore();
}

// 제비반환: crossing white cuts on the target with a light-blue flash, opening fast
export function aceSlash(ctx, f, x, y, p) {
  const s = 18 * grow(f) * ease(Math.min(1, p / 0.4)), c = Math.cos(f.ang), sn = Math.sin(f.ang);
  ctx.save(); ctx.globalAlpha = 1 - p;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(160,200,255,0.5)'; ctx.beginPath(); ctx.arc(x, y, 6 + 14 * p, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
  for (const [w, col] of [[3, 'rgba(160,200,255,0.8)'], [1.2, '#ffffff']]) {
    ctx.lineWidth = w * (1 - p * 0.5); ctx.strokeStyle = col;
    for (const tw of [0.55, -0.55]) {
      const dx = Math.cos(f.ang + tw) * s, dy = Math.sin(f.ang + tw) * s;
      ctx.beginPath(); ctx.moveTo(x - dx, y - dy); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    }
  }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6; // the streak of the pass
  ctx.beginPath(); ctx.moveTo(x - c * 30, y - sn * 30); ctx.lineTo(x + c * 30 * (1 - p), y + sn * 30 * (1 - p)); ctx.stroke();
  ctx.restore();
}

// 아쿠아테일: a big water ring swung around the body, spray flung outward, a wave ring spreading to the reach
export function tailWave(ctx, f, x, y, p) {
  const r = f.reach * (0.85 + 0.35 * tier(f)), spin = ease(Math.min(1, p / 0.6)), a0 = f.ang + Math.PI * 0.8, a1 = a0 - Math.PI * 1.9 * spin;
  ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (p - 0.6) / 0.4);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(61,149,255,0.45)'; crescent(ctx, x, y, r * 0.85, a1, a0, r * 0.32);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = WATER.mid; crescent(ctx, x, y, r * 0.8, a1, a0, r * 0.2);
  ctx.fillStyle = WATER.light; crescent(ctx, x, y, r * 0.8, a1 + 0.15, a0 - 0.1, r * 0.1);
  ctx.fillStyle = WATER.foam; crescent(ctx, x, y, r * 0.8, a1 + 0.3, a0 - 0.3, r * 0.035);
  ctx.globalAlpha = (1 - p) * 0.7; ctx.strokeStyle = WATER.light; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, r * (0.5 + 0.5 * ease(p)), 0, 7); ctx.stroke();
  for (let i = 0; i < 3; i++) droplets(ctx, x, y, f.seed + i, 6, Math.PI * 2, r * 1.05, 0, 1.5, p, i ? WATER.light : WATER.foam, 8);
  ctx.restore();
}

// water hitting something: a ring and a burst of droplets thrown back toward where the water came from
export function splash(ctx, f, x, y, p) {
  const s = f.size ?? 8;
  ctx.save(); ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = WATER.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, s * (0.4 + p), s * (0.25 + p * 0.6), 0, 0, 7); ctx.stroke();
  droplets(ctx, x, y, f.seed, 8, 2.2, s * 1.6, (f.ang ?? -Math.PI / 2) + Math.PI, s * 0.2, p, WATER.foam, s * 0.8);
  droplets(ctx, x, y, f.seed + 7, 6, 2.6, s * 1.2, (f.ang ?? -Math.PI / 2) + Math.PI, s * 0.16, p, WATER.light, s * 0.8);
  ctx.restore();
}

// 하이드로캐논 burst: a water dome swelling out, two rings, heavy spray falling back
export function bigSplash(ctx, f, x, y, p) {
  const r = f.reach * grow(f);
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * ease(p));
  g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.6, `rgba(159,220,255,${0.5 * (1 - p)})`); g.addColorStop(1, `rgba(61,149,255,${0.7 * (1 - p)})`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r * ease(p)), 0, 7); ctx.fill();
  ctx.globalAlpha = 1 - p; ctx.strokeStyle = WATER.foam; ctx.lineWidth = 2.5 * (1 - p) + 0.5;
  ctx.beginPath(); ctx.arc(x, y, r * ease(p), 0, 7); ctx.stroke();
  ctx.strokeStyle = WATER.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r * 0.65 * ease(Math.min(1, p * 1.3)), 0, 7); ctx.stroke();
  droplets(ctx, x, y, f.seed, 22, Math.PI * 2, r * 1.2, 0, 2.4, p, WATER.foam, r * 0.5);
  droplets(ctx, x, y, f.seed + 3, 18, Math.PI * 2, r * 0.9, 0, 2, p, WATER.light, r * 0.4);
  ctx.restore();
}

// 하이드로캐논 charge: water drawn in a spiral to the mouth, the ball growing there
export function charge(ctx, f, x, y, p) {
  ctx.save();
  for (let i = 0; i < 10; i++) {
    const a = rnd(f.seed, i) * 7 + p * 6, d = 26 * (1 - ((p * 1.6 + rnd(f.seed, i + 20)) % 1));
    ctx.globalAlpha = 0.8; ctx.fillStyle = i % 3 ? WATER.light : WATER.foam;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.1, 0, 7); ctx.fill();
  }
  const r = (2 + 6 * ease(p)) * grow(f);
  ctx.globalAlpha = 1; waterBall(ctx, x, y, r, f.t * 8);
  ctx.restore();
}

function waterBall(ctx, x, y, r, spin) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#e8f8ff'); g.addColorStop(0.45, WATER.light); g.addColorStop(1, WATER.deep);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(0.5, r * 0.12);
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x, y, r * (0.55 + i * 0.25), spin + i * 2, spin + i * 2 + 1.6); ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(61,149,255,0.35)'; ctx.beginPath(); ctx.arc(x, y, r * 1.4, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

// 몸통박치기: speed lines streaming off behind the charging body
export function speedLines(ctx, f, x, y, p) {
  const c = Math.cos(f.ang), s = Math.sin(f.ang);
  ctx.save(); ctx.globalAlpha = 0.8 * (1 - p); ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const off = (rnd(f.seed, i) - 0.5) * 22, back = 8 + rnd(f.seed, i + 9) * 10, len = 10 + rnd(f.seed, i + 19) * 14;
    ctx.lineWidth = 0.6 + rnd(f.seed, i + 29);
    const bx = x - c * back - s * off, by = y - s * back + c * off;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - c * len, by - s * len); ctx.stroke();
  }
  ctx.restore();
}

// a body blow landing: a white star burst and ring
export function burst(ctx, f, x, y, p) {
  const s = (f.size ?? 12) * (0.6 + 0.6 * ease(p));
  ctx.save(); ctx.globalAlpha = 1 - p; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + f.seed, r = i % 2 ? s * 0.35 : s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffe9a0'; ctx.beginPath(); ctx.arc(x, y, s * 0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, s * 1.2, 0, 7); ctx.stroke();
  ctx.restore();
}

// ---- shots and beams ----
// 물대포 and other water jets: a tapered stream along the recent path, white core, droplets peeling off
export function jet(ctx, s, ox, oy, now) {
  const pts = [...(s.trail ?? []), [s.x, s.y]].map(([px, py]) => [px - ox, py - oy]);
  if (pts.length < 2) pts.unshift([pts[0][0] - Math.cos(s.ang) * 10, pts[0][1] - Math.sin(s.ang) * 10]);
  ctx.save(); ctx.lineCap = 'round';
  const k = grow(s);
  for (const [w, col] of [[s.r * 1.6 * k, 'rgba(61,149,255,0.45)'], [s.r * k, WATER.mid], [s.r * 0.45 * k, WATER.light], [s.r * 0.15 * k, WATER.foam]]) {
    ctx.strokeStyle = col;
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = w * (0.35 + 0.65 * i / (pts.length - 1));
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  }
  const [hx, hy] = pts[pts.length - 1];
  ctx.fillStyle = WATER.foam;
  for (let i = 0; i < 3; i++) {
    const a = s.ang + Math.PI + (Math.sin(now * 20 + i * 2) * 0.6), d = 3 + i * 3;
    ctx.beginPath(); ctx.arc(hx + Math.cos(a) * d, hy + Math.sin(a) * d, 0.7, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// 하이드로캐논 shot: a big spinning water ball with a short wake
export function cannonShot(ctx, s, ox, oy, now) {
  const x = s.x - ox, y = s.y - oy;
  ctx.save();
  (s.trail ?? []).forEach(([px, py], i, a) => {
    ctx.globalAlpha = 0.25 * (i + 1) / a.length; ctx.fillStyle = WATER.light;
    ctx.beginPath(); ctx.arc(px - ox, py - oy, s.r * (0.4 + 0.5 * (i + 1) / a.length), 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1; waterBall(ctx, x, y, s.r * grow(s), now * 10);
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(159,220,255,0.6)'; ctx.lineWidth = 1.2; // a churning ring round it
  ctx.beginPath(); ctx.arc(x, y, s.r * grow(s) * (1.35 + 0.1 * Math.sin(now * 30)), now * 9, now * 9 + 4); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

// 하이드로펌프: a thick, churning column of water from the mouth; foam rings run along it, spray at both ends
export function pumpBeam(ctx, b, x0, y0, half, now) {
  const c = Math.cos(b.ang), s = Math.sin(b.ang), x1 = x0 + c * b.len, y1 = y0 + s * b.len;
  const fade = Math.min(1, b.t / 0.12, (b.m.channel - b.t) / 0.2), w = half * 2 * fade * (0.8 + 0.5 * tier(b)), wob = Math.sin(now * 40) * 1.2;
  ctx.save(); ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(61,149,255,0.35)'; ctx.lineWidth = w * 1.7 + wob;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  for (const [k, col] of [[1, WATER.mid], [0.6, WATER.light], [0.2, WATER.foam]]) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.8, w * k + wob * k);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.8; // churning foam bands running out along the jet
  for (let d = (now * 260) % 14; d < b.len - 4; d += 14) {
    const px = x0 + c * d, py = y0 + s * d, ww = w * 0.5 * (0.7 + 0.3 * Math.sin(d * 0.7 + now * 30));
    ctx.beginPath(); ctx.moveTo(px - s * ww, py + c * ww); ctx.quadraticCurveTo(px + c * 3, py + s * 3, px + s * ww, py - c * ww); ctx.stroke();
  }
  ctx.fillStyle = WATER.foam; // spray at the mouth and where it hits
  for (let i = 0; i < 5; i++) {
    const a = b.ang + Math.PI + (Math.sin(now * 31 + i * 1.7)) * 1.2, d = half * (1 + (now * 5 + i * 0.37) % 1 * 1.5);
    ctx.beginPath(); ctx.arc(x0 + Math.cos(a) * d * 0.6, y0 + Math.sin(a) * d * 0.6, 0.8, 0, 7); ctx.fill();
    const a2 = b.ang + Math.PI + Math.sin(now * 23 + i * 2.3) * 1.4, d2 = half * (1.2 + (now * 4 + i * 0.29) % 1 * 2);
    ctx.beginPath(); ctx.arc(x1 + Math.cos(a2) * d2, y1 + Math.sin(a2) * d2, 1.1, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---- type colours and the effects of the moves added later (베어가르기 ... 성스러운칼, the dashes, 파도타기) ----
// Each type's glow (drawn additively), main colour, light colour and core, so a move reads as its type at a glance.
const TYPE = {
  water: { glow: 'rgba(61,149,255,0.5)', main: '#3d95ff', light: '#9fdcff', core: '#ffffff' },
  normal: { glow: 'rgba(220,226,240,0.45)', main: '#d8dce8', light: '#f4f6ff', core: '#ffffff' },
  bug: { glow: 'rgba(150,210,40,0.5)', main: '#8cc832', light: '#d4f478', core: '#f8ffe0' },
  dark: { glow: 'rgba(120,70,170,0.5)', main: '#4a2c66', light: '#a77fd8', core: '#e8d8ff', deep: '#160a22' },
  fighting: { glow: 'rgba(255,130,50,0.55)', main: '#ff7a2e', light: '#ffc870', core: '#fff6d8' },
  flying: { glow: 'rgba(150,190,255,0.5)', main: '#8fb4ff', light: '#d8e6ff', core: '#ffffff' },
  ground: { glow: 'rgba(210,160,80,0.5)', main: '#b8843e', light: '#ecd09a', core: '#fff0d0', deep: '#6a4a1e' },
};
export const tint = type => TYPE[type] ?? TYPE.normal;

// a type-coloured cut: an additive glow crescent, the main crescent, a light inner edge and a white core line
function cut(ctx, x, y, r, a0, a1, thick, c) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = c.glow; crescent(ctx, x, y, r * 1.07, lo, hi, thick * 1.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = c.main; crescent(ctx, x, y, r, lo, hi, thick);
  ctx.fillStyle = c.light; crescent(ctx, x, y, r, lo + 0.08, hi - 0.04, thick * 0.55);
  ctx.fillStyle = c.core; crescent(ctx, x, y, r, lo + 0.16, hi - 0.1, thick * 0.18);
}
// four-pointed glints thrown out from a point
function sparks(ctx, x, y, seed, n, dist, size, p, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const a = rnd(seed, i) * 7, d = dist * (0.3 + 0.7 * rnd(seed, i + 40)) * ease(p), s = size * (1 - p);
    ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(a);
    ctx.fillRect(-s, -s * 0.18, s * 2, s * 0.36); ctx.fillRect(-s * 0.18, -s, s * 0.36, s * 2); ctx.restore();
  }
}

// 베어가르기: one wide sweeping cut across the whole front, silver-white, a glint where it ends
export function sweepCut(ctx, f, x, y, p) {
  const c = tint(f.type ?? 'normal'), r = f.reach * 0.75 * grow(f), sw = ease(Math.min(1, p / 0.5)), a0 = f.ang - 1.7, a1 = a0 + 3.2 * sw;
  ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (p - 0.5) / 0.5);
  cut(ctx, x, y, r, a0, a1, r * 0.22, c);
  ctx.globalAlpha *= 0.5; cut(ctx, x, y, r * 0.78, a0 + 0.3, a1 - 0.2, r * 0.1, c); // a second, inner trail
  if (p > 0.35) sparks(ctx, x + Math.cos(a1) * r, y + Math.sin(a1) * r, f.seed, 3, 8, 3, (p - 0.35) / 0.65, c.core);
  ctx.restore();
}

// 깜짝베기: a quick rising cut out of a smear of shadow: dark violet crescent with a black edge, purple sparks
export function nightCut(ctx, f, x, y, p) {
  const c = tint('dark'), r = f.reach * 0.7 * grow(f), sw = ease(Math.min(1, p / 0.35)), k = Math.cos(f.ang) >= 0 ? 1 : -1;
  const a0 = f.ang + 1.3 * k, a1 = a0 - 2.6 * sw * k;
  ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (p - 0.4) / 0.6);
  for (let i = 0; i < 5; i++) { // shadow puffs left along the cut
    const a = a0 + (a1 - a0) * (i / 4), q = Math.min(1, p * 1.6);
    ctx.fillStyle = `rgba(22,10,34,${0.35 * (1 - q)})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.12 * (1 + q), 0, 7); ctx.fill();
  }
  ctx.fillStyle = c.deep; crescent(ctx, x, y, r * 1.04, Math.min(a0, a1), Math.max(a0, a1), r * 0.3);
  cut(ctx, x, y, r, a0, a1, r * 0.2, c);
  sparks(ctx, x + Math.cos(a1) * r, y + Math.sin(a1) * r, f.seed, 4, 12, 2.4, p, c.light);
  ctx.restore();
}

// 시저크로스: two long, nearly straight green cuts crossing diagonally ahead (an X), a flash where they cross
export function xCut(ctx, f, x, y, p) {
  const c = tint('bug'), d = f.reach * 0.55, cx = x + Math.cos(f.ang) * d, cy = y + Math.sin(f.ang) * d;
  const half = f.reach * 0.42 * grow(f), R = half * 2.4, span = 2 * Math.asin(half / R), sw = ease(Math.min(1, p / 0.4));
  ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (p - 0.5) / 0.5);
  for (const k of [1, -1]) { // each cut runs at 45 degrees off the aim, bowing slightly outward
    const th = f.ang + k * Math.PI / 4, nx = Math.cos(th + Math.PI / 2) * k, ny = Math.sin(th + Math.PI / 2) * k, phi = Math.atan2(ny, nx);
    const ox = cx - nx * R * Math.cos(span / 2), oy = cy - ny * R * Math.cos(span / 2);
    const a0 = phi - span / 2, a1 = a0 + span * sw;
    cut(ctx, ox, oy, R, a0, a1, half * 0.2, c);
  }
  if (p > 0.3) { // the crossing flashes
    const q = (p - 0.3) / 0.7; ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(212,244,120,${0.8 * (1 - q)})`; ctx.beginPath(); ctx.arc(cx, cy, 3 + 8 * q, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; sparks(ctx, cx, cy, f.seed, 5, 14, 2.6, q, c.core);
  }
  ctx.restore();
}

// 에어슬래시: a rising pale-blue cut whose edge flies on (airBlade); wind streaks peel off it
export function airCut(ctx, f, x, y, p) {
  const c = tint('flying'), r = f.reach * 0.65 * grow(f), sw = ease(Math.min(1, p / 0.4)), k = Math.cos(f.ang) >= 0 ? 1 : -1;
  const a0 = f.ang + 1.2 * k, a1 = a0 - 2.4 * sw * k;
  ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (p - 0.45) / 0.55);
  cut(ctx, x, y, r, a0, a1, r * 0.18, c);
  ctx.strokeStyle = c.light; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = a0 + (a1 - a0) * rnd(f.seed, i), rr = r * (1.1 + 0.25 * rnd(f.seed, i + 9));
    ctx.beginPath(); ctx.arc(x, y, rr, a - 0.25, a + 0.05); ctx.stroke();
  }
  ctx.restore();
}
export function airBlade(ctx, s, ox, oy, now) {
  const c = tint('flying'), x = s.x - ox, y = s.y - oy, r = 9 * grow(s);
  ctx.save(); ctx.translate(x, y); ctx.rotate(s.ang); ctx.scale(1.6, 1.6); // a big blade (its hit radius 10 px matches)
  for (let i = 1; i <= 3; i++) { // fading wake behind it
    ctx.globalAlpha = 0.18 * (4 - i); ctx.fillStyle = c.light; crescent(ctx, -i * 5, 0, r, -1.2, 1.2, r * 0.3);
  }
  ctx.globalAlpha = 1; cut(ctx, 0, 0, r, -1.25, 1.25, r * 0.42, c);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) { const yy = (i - 1) * 4; ctx.beginPath(); ctx.moveTo(-6, yy); ctx.lineTo(-16 - ((now * 60 + i * 7) % 8), yy); ctx.stroke(); }
  ctx.restore();
}

// 성스러운칼: a pillar of light marks the spot ahead, then a giant sword of light drops point first out of it and sticks
// in the ground: a cross of light flares, rays and two ground rings spread, golden motes rise; the blade lingers glowing
export function sacredCut(ctx, f, x, y, p) {
  const c = tint('fighting'), g = grow(f), d = f.reach * 0.62, cx = x + Math.cos(f.ang) * d, gy = y + Math.sin(f.ang) * d + 6;
  const L = f.reach * 0.85 * g, W = Math.max(2.5, L * 0.12), drop = ease(clamp01((p - 0.12) / 0.2)), q = clamp01((p - 0.3) / 0.7);
  const fade = 1 - clamp01((p - 0.72) / 0.28);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 * fade; // the pillar, narrowing once the blade is in
  const pw = W * (0.4 + 1.0 * clamp01(p / 0.15)) * (1 - 0.5 * q);
  ctx.fillStyle = c.glow; ctx.fillRect(cx - pw, gy - L * 1.6, pw * 2, L * 1.6);
  ctx.fillStyle = 'rgba(255,236,190,0.55)'; ctx.fillRect(cx - pw * 0.4, gy - L * 1.6, pw * 0.8, L * 1.6);
  if (p < 0.2) sparks(ctx, cx, gy - L * 0.8, f.seed + 5, 6, L * 0.6 * (1 - p / 0.2), 2.2, 0.5, c.core); // light gathering
  const tip = gy + 3 - L * 1.2 * (1 - drop); // the blade, point down, sliding in from above
  const blade = (w, col) => {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx, tip); ctx.lineTo(cx - w, tip - L * 0.24); ctx.lineTo(cx - w, tip - L);
    ctx.lineTo(cx + w, tip - L); ctx.lineTo(cx + w, tip - L * 0.24); ctx.closePath(); ctx.fill();
  };
  ctx.globalAlpha = fade; blade(W * 1.9, c.glow); // a blade of white-gold light over the orange glow, so it stands out
  ctx.globalCompositeOperation = 'source-over'; blade(W, '#ffb43a'); blade(W * 0.7, '#ffe9a8'); blade(W * 0.32, '#ffffff');
  ctx.fillStyle = '#ffd36a'; ctx.fillRect(cx - W * 2.6, tip - L - W * 0.6, W * 5.2, W * 1.1); // cross guard, grip, pommel
  ctx.fillStyle = '#fff6d8'; ctx.fillRect(cx - W * 2.6, tip - L - W * 0.6, W * 5.2, W * 0.35);
  ctx.fillStyle = '#b8642a'; ctx.fillRect(cx - W * 0.4, tip - L - W * 2.9, W * 0.8, W * 2.3);
  ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(cx, tip - L - W * 3.2, W * 0.6, 0, 7); ctx.fill();
  if (q > 0) { // the strike
    const e = ease(q);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - q) ** 1.5; ctx.fillStyle = c.core; // cross of light
    ctx.fillRect(cx - L * 1.3 * e, gy - 1.5, L * 2.6 * e, 3); ctx.fillRect(cx - 1.5, gy - L * 1.5 * e, 3, L * 1.7 * e);
    ctx.fillStyle = c.glow; ctx.beginPath(); ctx.arc(cx, gy, 6 + L * 0.5 * e, 0, 7); ctx.fill();
    ctx.strokeStyle = c.light; ctx.lineCap = 'round'; // rays
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2 + f.seed, r0 = 5 + 18 * e, r1 = r0 + (i % 2 ? 10 : 22) + 30 * e;
      ctx.lineWidth = i % 2 ? 1 : 2.2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, gy + Math.sin(a) * r0 * 0.7);
      ctx.lineTo(cx + Math.cos(a) * r1, gy + Math.sin(a) * r1 * 0.7); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1 - q; // two rings over the ground
    ctx.strokeStyle = c.core; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, gy, 6 + L * 1.1 * e, 3 + L * 0.3 * e, 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = c.main; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, gy, 4 + L * 0.65 * e, 2 + L * 0.18 * e, 0, 0, 7); ctx.stroke();
    for (let i = 0; i < 16; i++) { // golden motes rising
      const mx = cx + (rnd(f.seed, i) - 0.5) * L * 1.4, my = gy - e * L * (0.3 + 0.9 * rnd(f.seed, i + 30)), ms = 1.2 + rnd(f.seed, i + 60) * 1.4;
      ctx.fillStyle = i % 3 ? '#ffd36a' : c.core; ctx.fillRect(mx - ms / 2, my - ms / 2, ms, ms);
    }
  }
  ctx.restore();
}

// dashes: an effect riding in front of the charging body (f.follow) along f.ang; p runs over the dash. They grow with
// the move's level: 몸통박치기 a plain push, 아쿠아제트 a water sheath, 드릴라이너 a drill, 파도타기 a wave, 메가혼 a lance.
// They come to a sharp point ahead and trail off behind: their backs fade out (a gradient, which the pixel layer
// dithers away) instead of stopping short.
const clear = col => col.startsWith('#') ? col + '00' : col.replace(/[\d.]+\)$/, '0)'); // the same colour, see-through
const fadeBack = (ctx, x0, x1, col, hold = 0.5) => { // a fill solid from x0 to part way, fading out by x1
  const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, col); g.addColorStop(hold, col); g.addColorStop(1, clear(col)); return g;
};
// a pointed shock front: a chevron whose point leads at x = tip and whose two arms sweep back len, out to ±spread,
// thinning to nothing and fading out toward their ends
function chevron(ctx, tip, len, spread, thick, col) {
  ctx.fillStyle = fadeBack(ctx, tip, tip - len, col, 0.35); ctx.beginPath(); ctx.moveTo(tip, 0);
  ctx.quadraticCurveTo(tip - len * 0.35, -spread * 0.9, tip - len, -spread);
  ctx.quadraticCurveTo(tip - len * 0.4, -spread * 0.9 + thick, tip - thick * 2.2, 0);
  ctx.quadraticCurveTo(tip - len * 0.4, spread * 0.9 - thick, tip - len, spread);
  ctx.quadraticCurveTo(tip - len * 0.35, spread * 0.9, tip, 0); ctx.closePath(); ctx.fill();
}
// 몸통박치기: a pointed shock front pushed ahead of the head, its arms sweeping back past the body and fading, a second
// one inside it pulsing, speed lines and dust puffs streaming off behind
export function rush(ctx, f, x, y, p) {
  speedLines(ctx, f, x, y, p);
  const c = tint(f.type ?? 'normal'), s = (f.size ?? 12) * grow(f), t = f.t, pulse = 1 + 0.08 * Math.sin(t * 40);
  ctx.save(); ctx.translate(x, y); ctx.rotate(f.ang); ctx.globalAlpha = 0.95 * (1 - p);
  ctx.globalCompositeOperation = 'lighter'; chevron(ctx, s * 1.55, s * 4.2, s * 1.25 * pulse, s * 0.55, c.glow);
  ctx.globalCompositeOperation = 'source-over';
  chevron(ctx, s * 1.45, s * 3.8, s * 1.1, s * 0.28, c.light); chevron(ctx, s * 1.4, s * 3.0, s * 0.95, s * 0.11, c.core);
  chevron(ctx, s * 0.95, s * 2.6, s * 0.8 * pulse, s * 0.12, c.light); // the inner front
  for (let i = 0; i < 5; i++) { // dust puffs kicked back
    const u = (t * 3 + rnd(f.seed, i)) % 1, py = (rnd(f.seed, i + 4) - 0.5) * s * 1.4;
    ctx.globalAlpha = 0.5 * (1 - u) * (1 - p); ctx.fillStyle = c.light;
    ctx.beginPath(); ctx.arc(-s * (0.9 + 1.4 * u), py, 1.5 + u * 3, 0, 7); ctx.fill();
  }
  ctx.restore();
}
// 아쿠아제트: a pointed sheath of water round the front of the body, a twin water ribbon spiralling round it, bubbles
// streaming behind and spray flung off the point
export function aquaJet(ctx, f, x, y, p) {
  const c = tint('water'), g = grow(f), s = (f.size ?? 12) * g, t = f.t * 30;
  ctx.save(); ctx.translate(x, y); ctx.rotate(f.ang); ctx.globalAlpha = Math.min(1, (1 - p) * 2.5);
  const sheath = (k, col) => { // pointed ahead, tapering behind into a tail that fades
    ctx.fillStyle = fadeBack(ctx, s * 2.4 * k, -s * 2.9, col, 0.45); ctx.beginPath(); ctx.moveTo(s * 2.4 * k, 0);
    ctx.quadraticCurveTo(s * 0.3, -s * 1.1 * k, -s * 0.8, -s * 0.85 * k); ctx.quadraticCurveTo(-s * 2.0, -s * 0.5 * k, -s * 2.9, 0);
    ctx.quadraticCurveTo(-s * 2.0, s * 0.5 * k, -s * 0.8, s * 0.85 * k); ctx.quadraticCurveTo(s * 0.3, s * 1.1 * k, s * 2.4 * k, 0); ctx.closePath(); ctx.fill();
  };
  ctx.globalCompositeOperation = 'lighter'; sheath(1.2, c.glow); ctx.globalCompositeOperation = 'source-over';
  sheath(1, 'rgba(61,149,255,0.5)'); sheath(0.72, 'rgba(159,220,255,0.4)'); sheath(0.35, 'rgba(255,255,255,0.45)');
  ctx.lineCap = 'round'; // the twin ribbon: each strand drawn thick where it passes in front, thin behind
  for (let i = 0; i < 2; i++) {
    const ph = t * 0.4 + i * Math.PI;
    for (let u = 0; u < 1; u += 0.05) {
      const a = ph + u * 6.5, x0 = s * 2.2 - u * s * 4.4, x1 = x0 - s * 0.2, env = s * 0.95 * Math.sin(Math.PI * u) * (1 - 0.5 * u);
      ctx.globalAlpha = Math.min(1, (1 - p) * 2.5) * (1 - u * u); // the ribbon thins out down the tail
      const front = Math.cos(a) > 0; ctx.strokeStyle = front ? c.core : c.main; ctx.lineWidth = front ? 1.6 : 0.8;
      ctx.beginPath(); ctx.moveTo(x0, env * Math.sin(a)); ctx.lineTo(x1, env * Math.sin(a + 0.35)); ctx.stroke();
    }
  }
  for (let i = 0; i < 10; i++) { // bubbles shed behind
    const u = (t * 0.05 + rnd(f.seed, i)) % 1; ctx.globalAlpha = (1 - u) * 0.85; ctx.strokeStyle = c.light; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(-s * 0.9 - u * s * 2.6, (rnd(f.seed, i + 7) - 0.5) * s * 1.6 * (0.6 + u), 1 + rnd(f.seed, i + 3) * 1.6, 0, 7); ctx.stroke();
  }
  ctx.globalAlpha = Math.min(1, (1 - p) * 2.5); // spray off the point
  for (let i = 0; i < 6; i++) {
    const u = (t * 0.08 + rnd(f.seed, i + 20)) % 1, a = (rnd(f.seed, i + 30) - 0.5) * 2.4;
    ctx.fillStyle = c.core; ctx.fillRect(s * 2.3 + Math.cos(a) * u * s - 0.7, Math.sin(a) * u * s - 0.7, 1.4, 1.4);
  }
  ctx.restore();
}
// 드릴라이너: a big spinning drill of earth ahead of the head, bands racing round it, sparks off the point, rock chips
// thrown back in arcs and a dust cloud rolling behind
export function drill(ctx, f, x, y, p) {
  const c = tint('ground'), g = grow(f), s = (f.size ?? 12) * g, spin = f.t * 40, tip = s * 3.4, base = s * 1.0, w = s * 0.85;
  ctx.save(); ctx.translate(x, y); ctx.rotate(f.ang); ctx.globalAlpha = Math.min(1, (1 - p) * 2.5);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = fadeBack(ctx, base, -s * 2.6, c.glow, 0.2); // the wake off the drill's base
  ctx.beginPath(); ctx.moveTo(base, -w - 3); ctx.quadraticCurveTo(-s * 0.8, -w * 0.9, -s * 2.6, 0); ctx.quadraticCurveTo(-s * 0.8, w * 0.9, base, w + 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.glow;
  ctx.beginPath(); ctx.moveTo(tip + 5, 0); ctx.lineTo(base - 2, -w - 4); ctx.lineTo(base - 2, w + 4); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = c.deep; ctx.beginPath(); ctx.moveTo(tip, 0); ctx.lineTo(base, -w); ctx.lineTo(base, w); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.main; ctx.beginPath(); ctx.moveTo(tip, 0); ctx.lineTo(base, -w); ctx.lineTo(base, w * 0.35); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.light; ctx.beginPath(); ctx.moveTo(tip, 0); ctx.lineTo(base, -w); ctx.lineTo(base, -w * 0.35); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 5; i++) { // spiral bands racing to the point
    const u = (spin * 0.05 + i / 5) % 1, xx = base + (tip - base) * u, hw = w * (1 - u);
    ctx.strokeStyle = i % 2 ? c.deep : c.core; ctx.lineWidth = 1.4 * (1 - u) + 0.5;
    ctx.beginPath(); ctx.moveTo(xx - 3 * (1 - u), -hw); ctx.lineTo(xx + 3 * (1 - u), hw); ctx.stroke();
  }
  ctx.fillStyle = c.core; // sparks off the point
  for (let i = 0; i < 6; i++) {
    const u = (f.t * 6 + rnd(f.seed, i)) % 1, a = (rnd(f.seed, i + 9) - 0.5) * 2.6, d = u * s * 1.3;
    ctx.globalAlpha = (1 - u) * (1 - p); ctx.fillRect(tip + Math.cos(a) * d - 0.8, Math.sin(a) * d - 0.8, 1.6, 1.6);
  }
  for (let i = 0; i < 12; i++) { // rock chips thrown back and out in arcs
    const u = (f.t * 2.5 + rnd(f.seed, i)) % 1, side = rnd(f.seed, i + 5) < 0.5 ? -1 : 1, sz = 1.4 + rnd(f.seed, i + 15) * 1.8;
    ctx.fillStyle = i % 3 ? c.main : c.deep; ctx.globalAlpha = (1 - u) * 0.95;
    ctx.fillRect(base - u * s * 2.2, side * (w + u * s * 1.4 - u * u * s * 0.6), sz, sz);
  }
  for (let i = 0; i < 5; i++) { // the dust cloud behind
    const u = (f.t * 1.8 + rnd(f.seed, i + 40)) % 1; ctx.globalAlpha = 0.35 * (1 - u) * (1 - p); ctx.fillStyle = c.light;
    ctx.beginPath(); ctx.arc(-s * (0.6 + 1.6 * u), (rnd(f.seed, i + 50) - 0.5) * s, 2 + u * s * 0.7, 0, 7); ctx.fill();
  }
  ctx.restore();
}
// 메가혼: the horn becomes a huge glowing green lance; rings of force peel back off it, energy streaks converge on
// its point, a star flares there and leaf-green motes stream behind
export function hornCharge(ctx, f, x, y, p) {
  const c = tint('bug'), g = grow(f), s = (f.size ?? 12) * g, tip = s * 3.4, base = s * 0.9, pulse = 1 + 0.15 * Math.sin(f.t * 40);
  ctx.save(); ctx.translate(x, y); ctx.rotate(f.ang); const al = Math.min(1, (1 - p) * 2.5); ctx.globalAlpha = al;
  const spear = (w, col, l) => { // the lance, tapering on behind its base into a tail that fades
    ctx.fillStyle = fadeBack(ctx, tip * l, -s * 2.2, col, 0.55); ctx.beginPath(); ctx.moveTo(tip * l, 0);
    ctx.quadraticCurveTo(base + s * 0.7, -w, base, -w * 0.45); ctx.quadraticCurveTo(-s * 0.6, -w * 0.3, -s * 2.2, 0);
    ctx.quadraticCurveTo(-s * 0.6, w * 0.3, base, w * 0.45); ctx.quadraticCurveTo(base + s * 0.7, w, tip * l, 0); ctx.closePath(); ctx.fill();
  };
  ctx.globalCompositeOperation = 'lighter'; spear(s * 1.15 * pulse, c.glow, 1.1); ctx.globalCompositeOperation = 'source-over';
  spear(s * 0.7, c.main, 1); spear(s * 0.42, c.light, 0.97); spear(s * 0.14, c.core, 0.94);
  for (let i = 0; i < 4; i++) { // rings of force peeling back along the lance
    const u = (f.t * 2.2 + i / 4) % 1, rx = base + (tip - base) * (1 - u), ry = s * (0.5 + 0.9 * u);
    ctx.globalAlpha = al * (1 - u); ctx.strokeStyle = i % 2 ? c.light : c.core; ctx.lineWidth = 1.4 - u;
    ctx.beginPath(); ctx.ellipse(rx, 0, Math.max(0.5, ry * 0.25), ry, 0, 0, 7); ctx.stroke();
  }
  ctx.strokeStyle = c.light; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; // streaks converging on the point
  for (let i = 0; i < 8; i++) {
    const u = (f.t * 3 + rnd(f.seed, i)) % 1, a = (rnd(f.seed, i + 3) - 0.5) * 2.4, r0 = s * (2.8 - 1.8 * u);
    ctx.globalAlpha = u * al; ctx.beginPath(); ctx.moveTo(tip + Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(tip + Math.cos(a) * (r0 - 6), Math.sin(a) * (r0 - 6)); ctx.stroke();
  }
  ctx.globalAlpha = al; ctx.globalCompositeOperation = 'lighter'; // the star on the point
  const st = s * 0.9 * pulse; ctx.fillStyle = c.core;
  ctx.fillRect(tip - st, -0.8, st * 2, 1.6); ctx.fillRect(tip - 0.8, -st * 0.7, 1.6, st * 1.4);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 8; i++) { // motes streaming behind
    const u = (f.t * 2 + rnd(f.seed, i + 20)) % 1; ctx.globalAlpha = (1 - u) * al; ctx.fillStyle = i % 2 ? c.main : c.light;
    ctx.fillRect(-s * (0.5 + 2.2 * u), (rnd(f.seed, i + 30) - 0.5) * s * 1.5, 1.6, 1.6);
  }
  ctx.restore();
}
// 파도타기: a big see-through wave rising behind the body and curling over it, a second swell under it, foam along
// the crest, spray flung ahead and a trail of foam behind
export function surfWave(ctx, f, x, y, p) {
  const c = tint('water'), s = (f.size ?? 12) * 1.6 * grow(f), rise = ease(Math.min(1, p / 0.3)), fade = 1 - Math.max(0, (p - 0.75) / 0.25);
  const dir = Math.cos(f.ang) >= 0 ? 1 : -1, t = f.t * 8, H = s * 2.1 * rise, back = -s * 1.5, crest = s * 0.9;
  ctx.save(); ctx.translate(x, y + s * 0.5); ctx.scale(dir, 1); ctx.globalAlpha = 0.75 * fade;
  const wave = (k, col, dx = 0) => { // up from behind, over the top, curling down in front
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(back * 1.2 + dx, 0);
    ctx.bezierCurveTo(back + dx, -H * 0.9 * k, -s * 0.2 + dx, -H * 1.1 * k, crest + dx, -H * 0.75 * k);
    ctx.quadraticCurveTo(crest + s * 0.5 + dx, -H * 0.55 * k, crest + s * 0.2 + dx, -H * 0.3 * k);
    ctx.quadraticCurveTo(crest - s * 0.3 + dx, -H * 0.5 * k, -s * 0.2 + dx, -H * 0.55 * k);
    ctx.quadraticCurveTo(-s * 0.9 + dx, -H * 0.3 * k, -s * 0.8 + dx, 0); ctx.closePath(); ctx.fill();
  };
  ctx.globalCompositeOperation = 'lighter'; wave(1.08, 'rgba(61,149,255,0.2)'); ctx.globalCompositeOperation = 'source-over';
  wave(0.5, 'rgba(31,111,224,0.3)', s * 0.5); // the swell under the body
  wave(1, 'rgba(61,149,255,0.32)'); wave(0.86, 'rgba(159,220,255,0.18)');
  ctx.strokeStyle = c.core; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; // foam along the crest
  ctx.beginPath(); ctx.moveTo(-s * 0.5, -H * 1.0); ctx.quadraticCurveTo(crest * 0.7, -H * 1.03, crest, -H * 0.75);
  ctx.quadraticCurveTo(crest + s * 0.5, -H * 0.55, crest + s * 0.2, -H * 0.32); ctx.stroke();
  ctx.strokeStyle = c.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 0.3, -H * 0.85); ctx.quadraticCurveTo(crest * 0.6, -H * 0.88, crest * 0.95, -H * 0.66); ctx.stroke();
  ctx.fillStyle = c.core;
  for (let i = 0; i < 12; i++) { // spray flung ahead off the curl
    const a = rnd(f.seed, i) * 2 - 0.4, u = (t * 0.2 + rnd(f.seed, i + 4)) % 1; ctx.globalAlpha = (1 - u) * fade;
    ctx.fillRect(crest + s * 0.3 + Math.cos(a) * u * s * 1.2 - 0.8, -H * 0.55 - Math.sin(a) * u * s * 0.8 - 0.8, 1.6, 1.6);
  }
  for (let i = 0; i < 10; i++) { // foam trail behind
    const u = (t * 0.25 + rnd(f.seed, i + 9)) % 1; ctx.globalAlpha = (1 - u) * 0.85 * fade; ctx.fillStyle = i % 2 ? c.light : c.core;
    ctx.beginPath(); ctx.arc(back - u * s * 1.8, -u * s * 0.3 * rnd(f.seed, i), 1.3 + rnd(f.seed, i + 2), 0, 7); ctx.fill();
  }
  ctx.restore();
}

// 물의파동: a ring of water pulsing as it travels: two rippling rings, the outer one fainter
export function pulseRing(ctx, s, ox, oy, now) {
  const c = tint('water'), x = s.x - ox, y = s.y - oy, r = s.r * grow(s) * (1 + 0.15 * Math.sin(now * 25));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = c.glow; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = c.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.stroke();
  ctx.strokeStyle = c.light; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  ctx.strokeStyle = c.core; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, r * 1.6, now * 6, now * 6 + 1.2); ctx.stroke();
  ctx.restore();
}

// a hit landing, in the move's type colours: a star burst and a ring
export function typeHit(ctx, f, x, y, p) {
  const c = tint(f.type), s = (f.size ?? 10) * grow(f) * (0.6 + 0.6 * ease(p));
  ctx.save(); ctx.globalAlpha = 1 - p;
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = c.glow; ctx.beginPath(); ctx.arc(x, y, s * 1.1, 0, 7); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = c.light; ctx.beginPath();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + f.seed, r = i % 2 ? s * 0.35 : s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.core; ctx.beginPath(); ctx.arc(x, y, s * 0.28, 0, 7); ctx.fill();
  ctx.strokeStyle = c.main; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, s * 1.25, 0, 7); ctx.stroke();
  ctx.restore();
}
