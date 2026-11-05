// 작전 1 「따라와」 (마그마단 소탕전): the cutscene after 루기아 is offered (docs/OPERATION_SEQUENCES.md, M1~M7). Drawn in
// code at 480 x 270 with the game's sprites, trainer sprites (public/cutscene) and pixelfx effects (src/vendor/pixelfx.js),
// each shot framed by its own camera; the lines show in the game's talk box style with the speaker's picture. play() runs
// it over everything with the game paused; Esc skips to the end.
import * as PFX from './vendor/pixelfx.js';

const W = 480, H = 270, SEA = 128; // the scene's px; the water line
let OS = 1; // output px per scene px: the canvas is as big as it shows, so a camera zoom never resamples twice
let g = null, out = null, wc = null, cv = null, me = 'squirtle', meName = '', sfx = () => {};
// the game's sound for each effect as it starts (src/sfx.js names), and for the impact frames and the evolution
const FX_SOUND = new Map(); let lastHit = -1;
const img = {};
// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const k01 = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const tint = {};
function silhouette(key, color) {
  const id = key + color; if (tint[id]) return tint[id];
  const s = img[key], c = document.createElement('canvas'); c.width = s.width; c.height = s.height;
  const x = c.getContext('2d'); x.drawImage(s, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return (tint[id] = c);
}
// a sprite by its bottom centre; flip faces a Pokemon right (they look left); white: a white silhouette over it, 0..1
function spr(key, cx, by, { flip = false, alpha = 1, white = 0, scale = 1, dark = 0 } = {}) {
  if (scale === 0.5 && img[key + '-half']?.width) { key += '-half'; scale = 1; } // a proper half-size picture, outline and all
  const s = img[key]; if (!s?.complete || !s.width) return;
  const w = s.width * scale, h = s.height * scale, x = Math.round(cx - w / 2), y = Math.round(by - h);
  g.save(); g.globalAlpha = alpha;
  if (flip) { g.translate(x + w, y); g.scale(-1, 1); g.translate(-x, -y); }
  g.drawImage(s, x, y, w, h);
  if (white > 0) { g.globalAlpha = alpha * white; g.drawImage(silhouette(key, '#ffffff'), x, y, w, h); }
  if (dark > 0) { g.globalAlpha = alpha * dark; g.drawImage(silhouette(key, '#1a0e14'), x, y, w, h); } // far away, in haze
  g.restore();
}
// pixelfx effects: one live instance per id, stepped to tl (seconds since it started); scrubbing back starts it over
const FXC = {};
function fx(id, mod, tl, x, y, { scale = 1, size, origin, ...opts } = {}) {
  const m = mod.meta; if (tl < 0 || (!m.loop && tl >= m.duration)) return;
  const sz = size ?? m.size, org = origin ?? m.origin;
  let e = FXC[id];
  if (!e || tl < e.t - 1e-6) {
    e = FXC[id] = { inst: PFX.createFx(mod, { ...opts, x: org[0], y: org[1] }), t: 0, frame: PFX.createFrame(sz[0], sz[1]),
      cv: Object.assign(document.createElement('canvas'), { width: sz[0], height: sz[1] }) };
    e.ctx = e.cv.getContext('2d'); e.img = e.ctx.createImageData(sz[0], sz[1]);
    if (tl < 0.15) sfx(FX_SOUND.get(mod) ?? 'blast'); // it is starting now (not a rebuild part way through)
  }
  while (e.t < tl - 1e-6) { const d = Math.min(1 / 30, tl - e.t); e.inst.update(d); e.t += d; }
  PFX.clearFrame(e.frame); e.inst.draw(e.frame); PFX.composite(e.frame, e.img.data, null); e.ctx.putImageData(e.img, 0, 0);
  g.drawImage(e.cv, Math.round(x - org[0] * scale), Math.round(y - org[1] * scale), sz[0] * scale, sz[1] * scale);
}
const PAL = PFX.PAL;

// ---------- the world ----------
function sky(heat = 1) { // dusk; the Magma side (right) burns, smoke over the volcano
  const bands = ['#1e1a34', '#2c1e3c', '#402440', '#5a2a3c', '#7a3434', '#9a4430', '#b0502c'];
  for (let i = 0; i < bands.length; i++) rect(0, i * (SEA / bands.length), W, SEA / bands.length + 1, bands[i]);
  g.save(); g.globalAlpha = 0.45 * heat; const gr = g.createLinearGradient(W, 0, W * 0.45, 0); gr.addColorStop(0, '#ff5a1a'); gr.addColorStop(1, 'rgba(255,90,26,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, SEA); g.restore();
  seed = 7; for (let i = 0; i < 40; i++) rect(rnd() * W * 0.6, rnd() * SEA * 0.4, 1, 1, '#c9b8d8');
}
function volcano(t) { // the far volcano behind the Magma coast, its plume rolling up
  g.fillStyle = '#2a1418'; g.beginPath(); g.moveTo(330, SEA); g.lineTo(400, 34); g.lineTo(430, 30); g.lineTo(480, 70); g.lineTo(480, SEA); g.fill();
  rect(404, 30, 22, 3, '#ff8a2a'); rect(408, 28, 14, 2, '#ffd25a');
  seed = 19; for (let i = 0; i < 16; i++) { const k = ((t * 0.08 + rnd()) % 1), r = 6 + k * 22, x = 415 + Math.sin(i + t * 0.3) * 8 - k * 60, y = 26 - k * 70;
    g.save(); g.globalAlpha = 0.55 * (1 - k); g.fillStyle = i % 2 ? '#3a2a30' : '#4a3438'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); }
}
function magmaLand(t, top = 92) { // the Magma coast: a rocky shelf at the water (그란돈 stands on it), then the lava-cut cliff
  g.fillStyle = '#1c0e0c'; g.beginPath(); g.moveTo(300, SEA + 14); g.lineTo(306, SEA - 4); g.lineTo(356, SEA - 6); g.lineTo(364, top + 8); g.lineTo(378, top); g.lineTo(W, top - 6); g.lineTo(W, SEA + 14); g.fill();
  g.fillStyle = '#3a1c14'; for (let y = top + 6; y < SEA + 10; y += 7) rect(360 + (y - top) * -0.4, y, W, 2, '#2e1610');
  rect(378, top, W - 378, 3, '#5a2c1c');
  for (const [x0, ph] of [[392, 0], [428, 1.7], [458, 3.1]]) { // lava running down the face
    for (let y = top + 3; y < SEA + 6; y++) { const w = 2 + (Math.sin(y * 0.3 + t * 4 + ph) > 0.6 ? 1 : 0); rect(x0 + Math.sin(y * 0.12 + ph) * 3, y, w, 1, (y + Math.floor(t * 20)) % 6 < 3 ? '#ff7a2a' : '#ffc04a'); }
  }
  // the Magma base: a hide tent and the banner
  g.fillStyle = '#5a1a16'; g.beginPath(); g.moveTo(440, top - 6); g.lineTo(460, top - 26); g.lineTo(480, top - 6); g.fill(); rect(448, top - 30, 1, 12, '#888'); rect(449, top - 30, 9, 6, '#c8282a');
}
function rocketFleet(t, bob = 1) { // the Rocket ships on the left: black hulls, a red stripe, the R flags
  for (const [x, w, h] of [[-10, 120, 22], [96, 70, 16]]) {
    const y = SEA - 6 + Math.sin(t * 1.2 + x) * bob;
    g.fillStyle = '#16181e'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - 10, y + h); g.lineTo(x + 8, y + h); g.fill();
    rect(x + 4, y + 4, w - 10, 2, '#c8283a'); rect(x + 14, y - 14, w * 0.36, 14, '#22262e'); rect(x + 16, y - 12, w * 0.3, 3, '#ffd88a');
    rect(x + 16 + w * 0.3, y - 28, 1, 14, '#888'); rect(x + 17 + w * 0.3, y - 28, 9, 6, '#1a1a22'); rect(x + 20 + w * 0.3, y - 27, 2, 4, '#e0303a');
  }
}
function aquaSub(t) { // the Aqua submarine surfaced between the fleet and the reef
  const y = SEA + 2 + Math.sin(t * 1.4) * 1;
  g.fillStyle = '#1e3f7a'; g.beginPath(); g.ellipse(160, y, 34, 9, 0, Math.PI, 0); g.fill(); rect(126, y, 68, 3, '#16305e');
  rect(150, y - 18, 16, 12, '#2a58a0'); rect(152, y - 16, 12, 2, '#bfe6ff'); rect(164, y - 24, 1, 8, '#888'); rect(165, y - 24, 8, 5, '#2f78c8'); rect(167, y - 23, 3, 2, '#ffffff');
}
const MAN = { rocket: ['rocket-m', 'rocket-f'], aqua: ['aqua-m', 'aqua-f'], magma: ['magma-m', 'magma-f'] }; // the game's own trainer sprites
// a crowd of one side's people standing on a line, some cheering; face: 1 right, -1 left (the people look right as drawn)
function crowd(kind, x0, x1, by, n, { s = 1, face = 1, t = 0, cheer = 0.3, sd = 3 } = {}) {
  seed = sd; const list = [];
  for (let i = 0; i < n; i++) list.push([x0 + (x1 - x0) * (i + rnd() * 0.6) / n, rnd(), rnd()]);
  for (const [x, a, b] of list) {
    const up = a < cheer && Math.sin(t * 6 + b * 9) > 0; // cheering: a hop
    spr(MAN[kind][b < 0.4 ? 1 : 0], x, by - (up ? 2 : 0), { scale: s, flip: face < 0 });
  }
}
function reef(t) { // the black reef in the middle
  const base = SEA + 60, peak = SEA - 32;
  g.fillStyle = '#0b0b10'; g.beginPath(); g.moveTo(196, base); g.lineTo(210, SEA - 8); g.lineTo(226, peak + 6); g.lineTo(240, peak); g.lineTo(256, peak + 9);
  g.lineTo(270, SEA - 14); g.lineTo(292, base); g.closePath(); g.fill();
  rect(226, peak + 6, 3, 10, '#26262e'); rect(240, peak, 3, 8, '#26262e'); rect(256, peak + 9, 2, 8, '#26262e');
}
function water(top = SEA, shift = 0) {
  const bands = ['#1f5a8a', '#1a4c78', '#163f66', '#123354', '#0e2843', '#0a1e33'], h = (H - top) / bands.length;
  for (let i = 0; i < bands.length; i++) rect(0, top + i * h, W, h + 1, bands[Math.min(5, i + shift)]);
}
function surface(t, top = SEA) { for (let x = 0; x < W; x += 2) rect(x, top - 1 + Math.round(Math.sin(x * 0.08 + t * 2.2) * 1.2), 2, 2, '#8fd0ff'); }
function veil(top = SEA, a = 0.42) { g.save(); g.globalAlpha = a; rect(0, top + 1, W, H - top, '#0e3a63'); g.restore(); }
function bubbles(t, x0, x1, y0, y1, n = 20, s = 3) {
  seed = s; for (let i = 0; i < n; i++) { const x = x0 + rnd() * (x1 - x0), sp = 10 + rnd() * 20, ph = rnd() * 50, y = y1 - ((t * sp + ph) % (y1 - y0)); rect(x + Math.sin(t * 3 + i) * 1.5, y, 2, 2, '#9fd8ff'); }
}
function fliers(t, key, n, x0, x1, y0, y1, sd = 5) { // bats and gas clouds over the fleet
  seed = sd; for (let i = 0; i < n; i++) { const x = x0 + rnd() * (x1 - x0) + Math.sin(t * 1.5 + i) * 6, y = y0 + rnd() * (y1 - y0) + Math.sin(t * 3 + i * 2) * 3; spr(key, x, y, { scale: 0.5 }); }
}
function shake(a) { if (a > 0) g.translate(Math.round((Math.random() - 0.5) * a), Math.round((Math.random() - 0.5) * a)); }
function flash(a, c = '#ffffff') { if (a > 0) { g.save(); g.globalAlpha = clamp(a, 0, 1); rect(0, 0, W, H, c); g.restore(); } }
function fade(a) { flash(a, '#000000'); }
// the whole field: who stands where (pos: overrides for the Pokemon); flames: Magma flame pillars going up
function battlefield(t, { heat = 1, groudon = [340, SEA - 4], lugia = [120, 104], kyogre = [210, 232], carvanha = [150, 222], player = [240, SEA - 30], magmaBack = 0 } = {}) {
  sky(heat); volcano(t); magmaLand(t);
  rocketFleet(t); fliers(t, 'golbat', 4, 10, 160, 40, 80, 5); fliers(t, 'koffing', 2, 30, 120, 70, 92, 8);
  crowd('rocket', 8, 92, SEA - 6, 10, { s: 0.5, t, sd: 2 }); crowd('rocket', 104, 156, SEA - 6, 5, { s: 0.5, t, sd: 4 });
  aquaSub(t); crowd('aqua', 146, 172, SEA - 4, 3, { s: 0.5, t, sd: 6 });
  crowd('magma', 384 + magmaBack * 60, 474 + magmaBack * 60, 92, 12, { s: 0.5, face: -1, t, sd: 9 });
  spr('camerupt', 410 + magmaBack * 60, 92, { scale: 0.5 }); spr('numel', 450 + magmaBack * 60, 92, { scale: 0.5 });
  reef(t); water();
  if (lugia) spr('lugia', lugia[0], lugia[1] + Math.sin(t * 1.6) * 3, { flip: true });
  if (groudon) spr('groudon', groudon[0], groudon[1]);
  if (player) spr(me, player[0], player[1], { flip: true });
  if (kyogre) spr('kyogre', kyogre[0], kyogre[1], { flip: true });
  if (carvanha) spr('carvanha', carvanha[0], carvanha[1] + Math.sin(t * 3) * 2, { flip: true });
  spr('wailmer', 120, SEA + 60, { flip: true, alpha: 0.9 });
  bubbles(t, 100, 360, SEA + 10, H, 18); veil(); surface(t);
}
// close-shot backdrops
function skyClose(t, drift = 30) {
  const bands = ['#241c3c', '#34204a', '#4a2850', '#6a3048', '#8a3a3a'];
  for (let i = 0; i < bands.length; i++) rect(0, i * (H / bands.length), W, H / bands.length + 1, bands[i]);
  for (const [sp, y0, c, n] of [[drift * 0.5, 40, '#5a3a5e', 6], [drift, 150, '#7a4a62', 5], [drift * 1.8, 230, '#9a5a6a', 4]]) {
    seed = y0; for (let i = 0; i < n; i++) { const w = 60 + rnd() * 90, x = ((rnd() * (W + w) - t * sp) % (W + w) + W + w) % (W + w) - w, y = y0 + rnd() * 30; rect(x, y, w, 8, c); rect(x + 10, y - 6, w * 0.6, 6, c); }
  }
}
function lavaBack(t) {
  const bands = ['#2a0e0e', '#481410', '#6a1c10', '#8e2a10', '#b84414', '#e06a1a'];
  for (let i = 0; i < bands.length; i++) rect(0, i * (H / bands.length), W, H / bands.length + 1, bands[i]);
  seed = 77; for (let i = 0; i < 40; i++) { const x = rnd() * W, sp = 20 + rnd() * 40, y = H - ((t * sp + rnd() * H) % H); rect(x + Math.sin(t * 2 + i) * 3, y, 2, 2, i % 3 ? '#ffb04a' : '#ffe08a'); }
}
function deepBack(t, dark = 0) {
  const bands = ['#174a78', '#123e68', '#0e3358', '#0b2948', '#08203a', '#061830'];
  for (let i = 0; i < bands.length; i++) rect(0, i * (H / bands.length), W, H / bands.length + 1, bands[Math.min(5, i + dark)]);
  g.save(); g.globalAlpha = 0.12; g.fillStyle = '#bfe6ff';
  for (let i = 0; i < 5; i++) { const x = 40 + i * 100 + Math.sin(t * 0.6 + i) * 10; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 30, 0); g.lineTo(x - 40, H); g.lineTo(x - 80, H); g.fill(); }
  g.restore(); bubbles(t, 0, W, 0, H, 26, 41);
  rect(0, H - 22, W, 22, '#0a1626'); seed = 52; for (let i = 0; i < 30; i++) rect(rnd() * W, H - 22 - rnd() * 4, 3 + rnd() * 8, 4, '#12223a'); // the seabed
}
function radialBack(t, a, b) {
  rect(0, 0, W, H, a); g.save(); g.translate(W / 2, H / 2); g.fillStyle = b;
  for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8 + t * 0.15); g.beginPath(); g.moveTo(0, 0); g.lineTo(400, -30); g.lineTo(400, 30); g.fill(); }
  g.restore();
}
function gatherRings(x, y, k, color = '#9fd8ff') {
  g.save(); g.strokeStyle = color; g.lineWidth = 2;
  for (let i = 0; i < 4; i++) { const r = 90 * (1 - ((k * 2 + i / 4) % 1)); g.globalAlpha = 0.8; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
  g.restore();
}
function deck(y, c = '#262b34') { rect(0, y, W, H - y, c); rect(0, y, W, 3, '#4a5260'); for (let x = 0; x < W; x += 24) rect(x, y + 3, 1, H - y, '#1a1e26'); rect(0, y - 6, W, 2, '#5a6270'); for (let x = 6; x < W; x += 30) rect(x, y - 6, 2, 6, '#5a6270'); }


// ---------- the big scenes' own backdrops: the volcano slope behind 그란돈 ----------
const slopeY = x => 250 - (x - 60) * 0.42; // the slope rises to the right, the player stands on it
function slopeBack(t, dust = 0) {
  lavaBack(t); g.fillStyle = '#2a1418'; g.beginPath(); g.moveTo(180, 120); g.lineTo(330, 10); g.lineTo(380, 6); g.lineTo(W, 60); g.lineTo(W, H); g.fill(); // the cone behind
  rect(330, 6, 50, 4, '#ff8a2a');
  g.fillStyle = '#1c0e0c'; g.beginPath(); g.moveTo(0, H); g.lineTo(0, slopeY(0)); g.lineTo(W, slopeY(W)); g.lineTo(W, H); g.fill();
  for (let i = 1; i < 6; i++) { g.strokeStyle = i % 2 ? '#2e1610' : '#3a1c14'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, slopeY(0) + i * 12); g.lineTo(W, slopeY(W) + i * 12); g.stroke(); }
  g.strokeStyle = '#5a2c1c'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, slopeY(0)); g.lineTo(W, slopeY(W)); g.stroke();
  for (const [x0, ph] of [[120, 0], [380, 2]]) for (let y = slopeY(x0) + 4; y < H; y++) rect(x0 + Math.sin(y * 0.12 + ph) * 4, y, 2, 1, (y + Math.floor(t * 20)) % 6 < 3 ? '#ff7a2a' : '#ffc04a');
  if (dust) { g.save(); g.globalAlpha = dust * 0.5; rect(0, 0, W, H, '#5a4a40'); g.restore(); }
}
function slopeFar(t) { // the same mountain far off across the water, smoke and dust going up off it
  g.fillStyle = '#2a1418'; g.beginPath(); g.moveTo(250, 180); g.lineTo(380, 60); g.lineTo(420, 56); g.lineTo(W, 110); g.lineTo(W, 180); g.fill();
  seed = 23; for (let i = 0; i < 14; i++) { const k = ((t * 0.2 + rnd()) % 1); g.save(); g.globalAlpha = 0.6 * (1 - k); g.fillStyle = '#6a5a50'; g.beginPath(); g.arc(360 + rnd() * 90 - k * 30, 150 - k * 80, 8 + k * 18, 0, 7); g.fill(); g.restore(); }
}
function groudonBack(cx, by, scale) { // 그란돈 from behind: its shape in black with the lava light along one edge
  const s = img.groudon; if (!s?.width) return; const w = s.width * scale, h = s.height * scale, x = Math.round(cx - w / 2), y = Math.round(by - h);
  g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(silhouette('groudon', '#ffd25a'), -5, -2, w, h); g.drawImage(silhouette('groudon', '#ff7a2a'), -3, -1, w, h); g.drawImage(silhouette('groudon', '#ff7a2a'), 3, 0, w, h); g.drawImage(silhouette('groudon', '#1a0a0a'), 0, 0, w, h); g.restore();
}
function cracks(tl, x, y) { // glowing cracks running out along the slope from where the blow landed
  const k = ease(k01(tl, 0.7, 1.6)); g.strokeStyle = '#ffb04a'; g.lineWidth = 2;
  seed = 61; for (let i = 0; i < 7; i++) { const a = -Math.PI + rnd() * Math.PI, len = (30 + rnd() * 80) * k; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len * 0.5 + rnd() * 8, y + Math.sin(a) * len * 0.3); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5); g.stroke(); }
}
function rock(x, y, r, rot) { // a boulder lit from the upper left
  const pts = [0, 1, 2, 3, 4, 5, 6, 7].map(i => { const a = rot + i * Math.PI / 4, rr = r * (0.8 + 0.2 * Math.sin(i * 2.7)); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; });
  const path = () => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); };
  g.fillStyle = '#120a08'; g.save(); g.translate(2, 2); path(); g.fill(); g.restore();
  g.fillStyle = '#4a3028'; path(); g.fill();
  g.save(); path(); g.clip(); g.fillStyle = '#6a4636'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.7, 0, 7); g.fill(); g.fillStyle = '#26160f'; g.beginPath(); g.arc(x + r * 0.5, y + r * 0.5, r * 0.6, 0, 7); g.fill(); g.restore();
}


// where the moves come out: 가이오가's jaw and 루기아's beak, for a sprite flipped to face right (bottom centre cx, by; scale s)
const mouthK = (cx, by, s) => [cx + 17 * s, by - 7 * s], mouthL = (cx, by, s) => [cx + 15 * s, by - 15 * s];
// a thick beam (pixelfx water-jet, scaled up) from a mouth at an angle, with a flash where it leaves
function beam(id, tl, x, y, angle, pal, scale = 3, len = 130) {
  if (tl < 0) return; const S = 2 * (len + 30);
  fx(id, PFX.waterJet, tl, x, y, { scale, angle, palette: pal, length: len, size: [S, S], origin: [S / 2, S / 2] });
  const r = 7 + 3 * Math.sin(tl * 30); g.save(); g.globalAlpha = 0.85; g.fillStyle = pal[5]; g.beginPath(); g.arc(x, y, r * 1.6, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
}
function slab(x, y, w, h, rot) { // a slab of rock torn up as a shield
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = '#120a08'; g.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
  g.fillStyle = '#4a3028'; g.beginPath(); g.moveTo(-w / 2, -h / 2 + 8); g.lineTo(-w / 4, -h / 2); g.lineTo(w / 2, -h / 2 + 6); g.lineTo(w / 2 - 4, h / 2); g.lineTo(-w / 2 + 6, h / 2); g.fill();
  g.fillStyle = '#6a4636'; g.fillRect(-w / 2 + 4, -h / 2 + 8, 10, h - 20); g.fillStyle = '#26160f'; g.fillRect(w / 2 - 14, -h / 2 + 10, 8, h - 20);
  g.strokeStyle = '#ff8a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -h / 2 + 20); g.lineTo(4, -10); g.lineTo(-4, 14); g.lineTo(6, h / 2 - 16); g.stroke(); // the glowing seam
  g.restore();
}
// the mountain coming down at x px: a moving front of rubble, rocks bounding ahead, dust, its shadow taking the light; a huge rock last
function landslide(tl, px, player = true) {
  const k = ease(k01(tl, 0, 5.6)), fx0 = W + 60 - (W + 60 - px - 40) * k;
  g.save(); g.globalAlpha = 0.45 * k; rect(0, 0, W, H, '#120806'); g.restore(); // the light going as it comes over
  const top = x => slopeY(x) - 110 - 26 * Math.sin(x * 0.05 + tl * 2) - (x - fx0) * 0.15;
  g.fillStyle = '#2a1a14'; g.beginPath(); g.moveTo(fx0, slopeY(fx0) + 4); // the mass of rubble sliding down
  for (let x = fx0; x <= W + 20; x += 10) g.lineTo(x, top(x)); g.lineTo(W + 20, H); g.lineTo(fx0, H); g.fill();
  seed = 81; for (let i = 0; i < 26; i++) { const x = fx0 + rnd() * (W - fx0 + 20), y = top(x) + rnd() * (slopeY(x) - top(x)); rock(x, y, 8 + rnd() * 20, tl * (1 + rnd() * 2) + i); }
  seed = 83; for (let i = 0; i < 7; i++) { const x = fx0 - 20 - rnd() * 70, by = slopeY(x) - 12 - Math.abs(Math.sin(tl * 5 + i)) * 26; rock(x, by, 8 + rnd() * 12, tl * 4 + i); } // ones bounding out ahead
  for (let i = 0; i < 3; i++) fx('lsd' + i, PFX.dirtBlast, (tl + i * 0.9) % 3, fx0 + i * 30, slopeY(fx0 + i * 30), { scale: 2, seed: i + 4 });
  if (player) { g.save(); g.globalAlpha = 0.5; g.fillStyle = '#000'; g.beginPath(); g.ellipse(px, slopeY(px) + 2, 24 + 30 * k, 6 + 4 * k, -0.4, 0, 7); g.fill(); g.restore(); spr(me, px, slopeY(px) + 2, { flip: true }); }
  const big = ease(k01(tl, 3.4, 6)); if (big > 0) rock(px + 40 - 30 * big, slopeY(px) - 160 + 100 * big, 56, tl * 1.5); // the house-sized one, right over them
}

// ---------- the camera ----------
const shot = keys => t => {
  let i = 0; while (i < keys.length - 2 && t >= keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1] ?? a, k = b === a ? 0 : ease(k01(t, a[0], b[0]));
  return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
};
const within = (t, spans) => spans.some(([a, b]) => t >= a && t < b);
function speedLines(cx, cy) {
  out.save(); out.globalAlpha = 0.55; out.strokeStyle = '#e8f6ff'; out.lineWidth = 1;
  seed = 31 + Math.floor(performance.now() / 70);
  for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, r0 = 70 + rnd() * 60, r1 = r0 + 40 + rnd() * 120;
    out.beginPath(); out.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); out.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); out.stroke(); }
  out.restore();
}
function frameWorld(c, t) {
  const sh = c.shotAt(t);
  let [cx, cy, z, rot] = sh.cam ? sh.cam(t) : [W / 2, H / 2, 1, 0];
  z *= 1 + Math.abs(rot) * 1.4;
  const hw = W / 2 / z, hh = H / 2 / z; cx = clamp(cx, hw, W - hw); cy = clamp(cy, hh, H - hh);
  out.setTransform(OS, 0, 0, OS, 0, 0); out.fillStyle = '#000'; out.fillRect(0, 0, W, H);
  out.imageSmoothingEnabled = false; out.translate(W / 2, H / 2); out.rotate(rot); out.scale(z, z); out.translate(-cx, -cy); out.drawImage(wc, 0, 0);
  out.setTransform(OS, 0, 0, OS, 0, 0);
  if (sh.speed && within(t, sh.speed)) speedLines(W / 2, H / 2);
  if (sh.hit && sh.hit.some(h => t >= h && t < h + 0.09)) { out.save(); out.globalCompositeOperation = 'difference'; out.fillStyle = '#fff'; out.fillRect(0, 0, W, H); out.restore(); }
  out.fillStyle = '#000'; out.fillRect(0, 0, W, 18); out.fillRect(0, H - 18, W, 18);
}

// ---------- the cuts (M1..M6 of docs/OPERATION_SEQUENCES.md): a few screens each, hard cuts between ----------
const name = () => meName;
const KY = { flip: true };
const JET = (pal, len = 150) => ({ palette: pal, length: len, size: [len + 40, 80], origin: [14, 40] });
const CUTS = [
  { id: 'M1', title: '옆에 선다', dur: 13,
    lines: [[3.4, '아강 (무전)', 'aqua', '아쿠아단 배치 완료. 가이오가는 수로를 맡는다.'], [9.3, '페르시온 (무전)', 'rocket', '로켓단 배치 완료. 루기아는 상공을 맡는다.'], [11.6, '비주기 (무전)', 'rocket', '루기아, 들어가라.']],
    shots: [
      { to: 3, cam: shot([[0, 280, 150, 1.05, 0], [3, 290, 140, 1.15, 0]]), draw(t, tl) { // the Magma side: 그란돈 roars over its people
        lavaBack(t); fx('m1fp1', PFX.flamePillar, tl + 0.6, 110, 214, { scale: 1 }); fx('m1fp2', PFX.flamePillar, tl, 440, 214, { scale: 1 });
        spr('groudon', 290, 300, { scale: 3 });
        rect(0, 214, W, H - 214, '#1c0e0c'); rect(0, 214, W, 3, '#5a2c1c');
        crowd('magma', 10, 470, 264, 9, { s: 1, face: -1, t, cheer: 0.6, sd: 11 }); spr('camerupt', 60, 252, { flip: false }); spr('torkoal', 420, 252); } },
      { to: 6.2, cam: shot([[3, 240, 150, 1.05, 0.02], [6.2, 250, 150, 1.15, 0.02]]), draw(t, tl) { // the Aqua boat: 아강 gives the word
        skyClose(t, 20); water(180); surface(t, 180); rect(0, 168, W, 16, '#1e3f7a'); rect(0, 168, W, 3, '#3a6aa8'); rect(0, 184, W, 4, '#16305e');
        spr('wailmer', 400, 214, { flip: true });
        crowd('aqua', 220, 470, 170, 7, { s: 1, t, cheer: 0.5, sd: 13 }); spr('archie', 150, 172); spr('sharpedo', 470, 220, { flip: true }); } },
      { to: 9, cam: shot([[6.2, 200, 150, 1, 0], [9, 250, 150, 1.12, 0]]), draw(t, tl) { // under the water: 가이오가 comes up beside 샤프니아
        deepBack(t); const kx = -60 + 270 * ease(k01(tl, 0, 2)), nudge = tl > 2.2 && tl < 2.6 ? -8 : 0;
        spr('kyogre', kx, 196, { ...KY, scale: 2 }); spr('carvanha', 360 + nudge, 200 + Math.sin(t * 3) * 3, { flip: true, scale: 2 });
        if (tl > 2.5) fx('m1sp', PFX.waveCrash, tl - 2.5, kx + 50, 110, { scale: 1 }); } },
      { to: 11.4, cam: shot([[9, 240, 140, 1, 0.03], [11.4, 250, 140, 1.1, 0.03]]), draw(t) { // the Rocket deck, 루기아 overhead
        skyClose(t, 50); spr('lugia', 300, 150 + Math.sin(t * 2) * 5, { flip: true, scale: 2 }); fliers(t, 'golbat', 5, 20, 460, 40, 110, 17);
        deck(200); crowd('rocket', 10, 470, 204, 11, { s: 1, t, cheer: 0.5, sd: 21 }); } },
      { to: 13, cam: shot([[11.4, 240, 135, 1.25, 0], [13, 240, 135, 1, 0]]), draw(t) { battlefield(t); fade(k01(t, 12.4, 13)); } },
    ] },
  { id: 'M2', title: '뚫리지 않는 방어', dur: 14,
    lines: [[0.4, '아강 (무전)', 'aqua', '가이오가, 근원의파동!'], [5.8, '비주기 (무전)', 'rocket', '막혔군. 루기아, 위에서 쳐라.'], [10.4, '샤프니아', 'friend', '안 통해… 저 녀석, 다 막고 있어!']],
    shots: [
      { to: 3.6, speed: [[1.6, 2.4]], hit: [2.4], cam: shot([[0, 240, 140, 1.2, 0.04], [2.4, 240, 140, 1.3, 0.04], [3.6, 240, 140, 1.05, 0]]), draw(t, tl) { // 가이오가 lets 근원의파동 go, from its mouth
        radialBack(t, '#0b1e48', '#13306a'); const [mx, my] = mouthK(150, 200, 2); spr('kyogre', 150, 200, { ...KY, scale: 2 });
        if (tl < 1.6) gatherRings(mx, my, tl); else beam('m2jet', tl - 1.6, mx, my, 0, PAL.water); } },
      { to: 5.6, hit: [4.1], cam: shot([[3.6, 260, 160, 1.3, -0.05], [5.6, 270, 150, 1.1, -0.03]]), draw(t, tl) { // a wall of rock goes up and the wave breaks on it
        g.save(); shake(tl > 0.4 && tl < 1.2 ? 6 : 0); lavaBack(t); spr('groudon', 390, 300, { scale: 3 });
        for (let i = 0; i < 5; i++) fx('m2wall' + i, PFX.earthSpike, tl + 0.4 - i * 0.06, 120 + i * 44, H - 14, { scale: 2, seed: i + 2 });
        rect(0, H - 14, W, 14, '#1c0e0c');
        beam('m2jet2', tl, -30, 150, 0, PAL.water); fx('m2pl', PFX.plasma, tl - 0.5, 210, 150, { scale: 2, palette: PAL.water }); g.restore(); } },
      { to: 8.4, speed: [[5.6, 8.4]], cam: shot([[5.6, 240, 135, 1, 0.1], [8.4, 240, 135, 1.2, 0.12]]), draw(t, tl) { // 루기아 dives and fires from its beak
        radialBack(t, '#2a1e48', '#3e2e6a'); const lx = 170 + 20 * tl, ly = 190 + 12 * tl, [mx, my] = mouthL(lx, ly, 2);
        spr('lugia', lx, ly, { flip: true, scale: 2 }); if (tl > 1) beam('m2ab', tl - 1, mx, my, 0.35, PAL.arcane); else gatherRings(mx, my, tl, '#d8c8ff'); } },
      { to: 11, hit: [8.9], cam: shot([[8.4, 300, 130, 1.4, 0.05], [11, 300, 140, 1.2, 0]]), draw(t, tl) { // 그란돈 brings up a slab of rock and the beam breaks on it
        g.save(); shake(tl > 0.5 && tl < 1.3 ? 6 : 0); lavaBack(t); spr('groudon', 360, 300, { scale: 3 });
        const up = ease(k01(tl, 0, 0.45)); slab(250, 250 - 130 * up, 70, 150, -0.25);         // the slab, torn up from the ground in front of its chest
        fx('m2sl', PFX.dirtBlast, tl, 250, H - 10, { scale: 1 });
        beam('m2ab2', tl - 0.3, -20, 10, 0.4, PAL.arcane); fx('m2hit', PFX.plasma, tl - 0.5, 230, 110, { scale: 2, palette: PAL.arcane });
        if (tl > 0.6) { seed = 91; for (let i = 0; i < 14; i++) { const a = Math.PI + (rnd() - 0.5) * 1.6, d = (tl - 0.6) * (60 + rnd() * 120); rect(230 + Math.cos(a) * d, 110 + Math.sin(a) * d, 4, 2, '#e0d0ff'); } } // the beam thrown back off it
        g.restore(); } },
      { to: 14, cam: shot([[11, 300, 120, 1.2, 0], [14, 330, 110, 1.4, 0]]), draw(t, tl) { // again, both at once from the wide: still nothing gets through
        battlefield(t, { heat: 1.3 });
        fx('m2wall2', PFX.earthSpike, tl + 0.2, 312, SEA, { scale: 1, seed: 9 }); fx('m2pl3', PFX.plasma, tl - 0.4, 312, SEA - 20, { scale: 1, palette: PAL.water });
        fx('m2pl4', PFX.plasma, tl - 1.2, 340, 50, { scale: 1, palette: PAL.arcane }); fade(k01(t, 13.4, 14)); } },
    ] },
  { id: 'M3', title: '무너지는 산', dur: 16,
    lines: [[0.4, () => name(), 'me', '내가 저 녀석 뒤로 돌아갈게. 눈을 끌면 그때 쏴!'], [6, '샤프니아', 'friend', '위험해!'], [12.4, () => name(), 'me', '…!']],
    shots: [
      { to: 3, cam: shot([[0, 240, 160, 1.15, 0], [3, 280, 150, 1.25, 0]]), draw(t, tl) { // round its back, low by the water: 그란돈's legs dark and huge on the left, the player climbing out onto the rocks
        slopeBack(t); water(214); surface(t, 214); g.fillStyle = '#140a08'; g.beginPath(); g.moveTo(200, H); g.lineTo(260, 210); g.lineTo(W, 190); g.lineTo(W, H); g.fill();
        const k = ease(k01(tl, 0.2, 2.6)); spr(me, 230 + 170 * k, 236 - 40 * k, { flip: true, scale: 2 });
        if (tl < 1.2) fx('m3sp0', PFX.splash, tl, 240, 216);
        groudonBack(40, H + 60, 4); } },
      { to: 5.5, cam: shot([[3, 260, 150, 1.05, 0.03], [5.5, 280, 140, 1.18, 0.03]]), draw(t, tl) { // over its shoulder: its back filling the left, the player small on the slope beyond, firing
        slopeBack(t); spr(me, 330, slopeY(330) + 2, { flip: false });
        if (tl > 1) beam('m3sh', tl - 1, 316, slopeY(330) - 24, Math.PI + 0.3, PAL.water, 2);
        groudonBack(130, H + 90, 4); } },
      { to: 7.5, cam: shot([[5.5, 300, 120, 2, -0.04], [7.5, 310, 115, 2.4, -0.06]]), draw(t, tl) { // it turns: the eye on the player
        lavaBack(t); spr('groudon', 300, 300, { scale: 3, flip: tl > 0.5 }); } },
      { to: 10, hit: [8.2, 8.9], cam: shot([[7.5, 300, 170, 1.4, 0.06], [8.2, 300, 170, 1.6, -0.06], [10, 300, 160, 1.3, 0]]), draw(t, tl) { // its fists come down on the mountain
        g.save(); shake(tl > 0.6 && tl < 2 ? 8 : 0); slopeBack(t, 0.3);
        spr('groudon', 150, 150 + 60 * ease(k01(tl, 0.3, 0.7)) - 20 * k01(tl, 0.7, 1.4), { scale: 2, flip: true });
        fx('m3gs', PFX.groundSlam, tl - 0.7, 250, slopeY(250), { scale: 2 }); fx('m3qk', PFX.quake, tl - 0.8, 360, slopeY(360), { scale: 2 });
        cracks(tl, 260, slopeY(260)); g.restore(); } },
      { to: 16, hit: [15.6], cam: shot([[10, 300, 135, 1, 0.04], [13, 300, 135, 1.12, 0.06], [15.6, 300, 140, 1.4, 0.08], [16, 300, 140, 1.5, 0.08]]), draw(t, tl) { // the slope coming down on the player: half the mountain sliding, rocks the size of houses, its shadow over everything
        g.save(); shake(4); slopeBack(t, 0.5); landslide(tl, 300); g.restore(); } },
    ] },
  { id: 'M4', title: '더 빠르게', dur: 12,
    lines: [[0.5, '샤프니아', 'friend', '안 돼… 여기서는 못 닿아!'], [3.4, '샤프니아', 'friend', '더 빨리. 더 빨리!']],
    shots: [
      { to: 3, cam: shot([[0, 240, 150, 1, 0], [3, 260, 140, 1.15, 0]]), draw(t, tl) { // from the water: 샤프니아 already swimming, the slope coming down far off
        skyClose(t, 10); slopeFar(t); water(180); surface(t, 180);
        fx('m4db', PFX.dirtBlast, tl, 400, 150, { scale: 1 }); spr('carvanha', 100 + 40 * tl, 214 + Math.sin(t * 9) * 2, { flip: true, scale: 2 });
        fx('m4wk0', PFX.waveCrash, tl, 80 + 40 * tl, 182); veil(180, 0.3); } },
      { to: 9, speed: [[3, 9]], hit: [6.6], cam: shot([[3, 200, 170, 1.3, -0.04], [6, 240, 170, 1.4, -0.04], [9, 280, 165, 1.3, -0.04]]), draw(t, tl) { // swimming flat out, it changes on the way: the light pulses, burns white, and 샤크니아 comes out of it still swimming
        deepBack(t, 2); const x = 170 + 120 * (tl / 6), y = 200 + Math.sin(tl * 9) * 3;
        const wv = tl < 1.6 ? 0 : tl < 3.2 ? 0.45 + 0.45 * Math.sin(tl * 16) : tl < 4.2 ? 1 : 1 - k01(tl, 4.2, 5);
        for (let i = 1; i < 4; i++) rect(x - 40 - i * 26, y - 30 + Math.sin(tl * 9 + i) * 4, 18, 2, '#9fd8ff'); // the water streaming off it
        spr(tl < 3.7 ? 'carvanha' : 'sharpedo', x, y, { flip: true, scale: 2, white: wv });
        fx('m4ev', PFX.plasma, tl - 3.2, x, y - 50, { scale: 2, palette: PAL.ice }); bubbles(t * 3, x - 160, x - 20, y - 70, y, 24, 63); } },
      { to: 12, speed: [[9, 12]], cam: shot([[9, 240, 160, 1, -0.2], [12, 260, 120, 1.3, -0.25]]), draw(t, tl) { // faster and faster, slanting up at the surface
        deepBack(t, 1); const k = ease(k01(tl, 0, 2.6)), x = 40 + 360 * k, y = 250 - 170 * k;
        for (let i = 1; i < 6; i++) spr('sharpedo', x - i * 24, y + i * 12, { flip: true, scale: 2, alpha: 0.16 });
        beam('m4wk', tl, x - 30, y - 40, Math.PI - 0.45, PAL.water, 2);
        spr('sharpedo', x, y, { flip: true, scale: 2 }); } },
    ] },
  { id: 'M5', title: '샤크니아', dur: 14,
    lines: [[8.6, () => name(), 'me', '…너, 그 모습.'], [11.2, '샤크니아', 'friend', '늦을 뻔했잖아. 숨부터 쉬어.']],
    shots: [
      { to: 2.6, speed: [[0, 2.6]], hit: [0.3], cam: shot([[0, 240, 200, 1.6, 0.06], [2.6, 240, 120, 1.15, 0.03]]), draw(t, tl) { // out of the water: from the surface, 샤크니아 bursting up into the sky
        skyClose(t, 40); water(200); surface(t, 200);
        fx('m5gy', PFX.geyser, tl + 1.2, 240, 206, { scale: 2 }); fx('m5wc', PFX.waveCrash, tl, 240, 206, { scale: 2 });
        spr('sharpedo', 240, 230 - 200 * ease(k01(tl, 0, 1.8)), { scale: 2, flip: true }); } },
      { to: 4.6, hit: [3.6], cam: shot([[2.6, 300, 140, 1.25, -0.08], [3.6, 300, 140, 1.45, 0.06], [4.6, 300, 140, 1.15, 0]]), draw(t, tl) { // in under the mountain coming down: it takes the player as it lands on the spot
        g.save(); shake(tl > 1 && tl < 1.8 ? 9 : 4); slopeBack(t, 0.5);
        landslide(5.6 + tl, 300, tl < 0.7);
        const sx = 120 + 280 * ease(k01(tl, 0, 1.4)), sy = slopeY(300) - 40 - 50 * Math.sin(Math.PI * k01(tl, 0, 1.4));
        if (tl > 1) fx('m5db', PFX.dirtBlast, tl - 1, 300, slopeY(300) + 4, { scale: 2 });
        spr('sharpedo', sx, sy + 30, { flip: true, scale: 2 }); if (tl > 0.7) spr(me, sx + 4, sy - 26, { flip: true, scale: 2 }); g.restore(); } },
      { to: 7.2, speed: [[4.6, 7.2]], cam: shot([[4.6, 240, 135, 1, 0.1], [7.2, 240, 135, 1.15, 0.06]]), draw(t, tl) { // the long arc back down to the water, the dust going up behind
        skyClose(t, 260); slopeFar(t); const x = 80 + 320 * k01(tl, 0, 2.6), y = 120 + 90 * k01(tl, 0, 2.6) ** 2;
        spr('sharpedo', x, y + 30, { flip: true, scale: 2 }); spr(me, x + 4, y - 26, { flip: true, scale: 2 }); } },
      { to: 14, cam: shot([[7.2, 130, 128, 2.4, 0], [14, 130, 128, 2.7, 0]]), draw(t, tl) { // their heads above the water
        battlefield(t, { carvanha: null, player: null, kyogre: [220, 232] }); fx('m5sp', PFX.waveCrash, tl, 130, SEA + 4); spr(me, 120, SEA + 8, { flip: true }); spr('sharpedo', 142, SEA + 24, { flip: true });
        veil(SEA + 4, 0.25); surface(t); fade(k01(t, 13.4, 14)); } },
    ] },
  { id: 'M6', title: '두 줄기의 공격', dur: 12,
    lines: [[0.2, () => name(), 'me', '지금이야!'], [2, '비주기 (무전)', 'rocket', '루기아, 쏴라!'], [3.2, '아강 (무전)', 'aqua', '가이오가, 함께 간다!']],
    shots: [
      { to: 1.8, cam: shot([[0, 130, 128, 2.6, 0], [1.8, 130, 126, 2.9, 0]]), draw(t) {
        battlefield(t, { carvanha: null, player: null }); spr(me, 120, SEA + 8, { flip: true }); spr('sharpedo', 142, SEA + 24, { flip: true }); veil(SEA + 4, 0.25); surface(t); } },
      { to: 4.6, speed: [[2.6, 4.6]], cam: shot([[1.8, 240, 135, 1.15, 0], [4.6, 240, 135, 1, 0]]), draw(t, tl) { // above and below the line at once: 루기아 from the sky, 가이오가 from the deep
        skyClose(t, 80); rect(0, 135, W, H - 135, '#0e3358'); deepBack(t, 2); g.save(); g.beginPath(); g.rect(0, 0, W, 135); g.clip(); skyClose(t, 80); g.restore();
        rect(0, 133, W, 3, '#8fd0ff');
        spr('lugia', 110, 130, { flip: true }); spr('kyogre', 110, 250, KY);
        const [lx, ly] = mouthL(110, 130, 1), [kx, ky] = mouthK(110, 250, 1);
        if (tl > 0.8) { beam('m6a', tl - 0.8, lx, ly, 0.12, PAL.arcane); beam('m6k', tl - 0.8, kx, ky, -0.2, PAL.water); } else { gatherRings(lx, ly, tl, '#d8c8ff'); gatherRings(kx, ky, tl); } } },
      { to: 7.4, hit: [4.8], cam: shot([[4.6, 340, 90, 1.8, 0], [7.4, 340, 110, 1.3, 0]]), draw(t, tl) { // both land on 그란돈 together
        g.save(); shake(tl > 0.2 && tl < 1.4 ? 7 : 0); battlefield(t, { heat: 1.4, groudon: [340 + 24 * ease(k01(tl, 0.2, 1.8)), SEA - 4] });
        fx('m6pl', PFX.plasma, tl, 340, 90, { scale: 2, palette: PAL.water }); fx('m6pl2', PFX.plasma, tl - 0.15, 350, 70, { scale: 2, palette: PAL.arcane }); fx('m6ex', PFX.smallExplosion, tl - 0.3, 340, SEA - 4); g.restore(); } },
      { to: 12, cam: shot([[7.4, 300, 150, 1.05, 0], [12, 340, 140, 1.25, 0]]), draw(t, tl) { // 그란돈 turns its back and goes off into the smoke
        lavaBack(t); const k = ease(k01(tl, 0.2, 3.6));
        spr('groudon', 300 + 140 * k, 300 - 40 * k, { scale: 3 - Math.round(k), flip: true, alpha: 1 - 0.6 * k01(tl, 2.4, 4) });
        g.save(); g.globalAlpha = 0.6 * k; rect(0, 0, W, H, '#3a2a30'); g.restore(); fade(k01(tl, 4, 4.6)); } },
    ] },
  { id: 'M7', title: '마그마단 소탕', dur: 16,
    lines: [[1.2, '비주기', 'rocket', '마그마단은 여기까지다.'], [4, '아강', 'aqua', '바다를 메우겠다는 꿈은 접어라, 마적.'],
      [7, '마적', '', '…그란돈이 물러난 이상, 할 말은 없다.'], [10, '샤크니아', 'friend', '(작게) 우리 보스들이 나란히 서 있는 건 처음 봐.'],
      [12.2, () => name(), 'me', '…오래가진 않을 것 같지만.'], [14.4, '페르시온', 'rocket', '접안 명부는 본사로 넘겨라.']],
    shots: [
      { to: 16, cam: shot([[0, 240, 160, 1, 0], [3, 210, 190, 1.5, 0], [6.4, 360, 190, 1.6, 0], [9.4, 90, 150, 2.4, 0], [13.6, 90, 150, 2.5, 0], [14.2, 150, 190, 1.7, 0], [16, 240, 160, 1.05, 0]]),
        draw(t, tl) { // on the Magma shore: 마적 and his people in front of 비주기 and 아강 with their ranks; the two friends far back by the water
          lavaBack(t * 0.3); g.save(); g.globalAlpha = 0.5; rect(0, 0, W, H, '#2a1c2a'); g.restore();
          water(150); surface(t, 150);
          g.fillStyle = '#1c0e0c'; g.beginPath(); g.moveTo(110, 176); g.lineTo(130, 156); g.lineTo(W, 150); g.lineTo(W, H); g.lineTo(80, H); g.fill(); rect(130, 154, W - 130, 3, '#5a2c1c');
          spr(me, 74, 162, { flip: true, dark: 0.2 }); spr('sharpedo', 100, 176, { flip: true, dark: 0.2 });
          crowd('rocket', 140, 214, 168, 7, { s: 0.5, sd: 41 }); crowd('aqua', 218, 270, 168, 5, { s: 0.5, sd: 43 });
          crowd('magma', 300, 474, 168, 14, { s: 0.5, face: -1, cheer: 0, sd: 47 }); // the Magma ranks behind, still
          spr('persian', 128, 238); spr('giovanni', 180, 240, { flip: true }); spr('archie', 236, 240, { flip: true }); // turned toward 마적
          spr('maxie', 336, 240); spr('magma-m', 400, 240, { flip: true, dark: 0.2 }); spr('magma-f', 446, 240, { flip: true, dark: 0.2 });
          fade(1 - k01(tl, 0, 0.8)); fade(k01(tl, 15.4, 16)); } },
    ] },
];
for (const c of CUTS) {
  let from = 0; for (const s of c.shots) { s.from = from; from = s.to; }
  c.shotAt = t => c.shots.find(s => t < s.to) ?? c.shots[c.shots.length - 1];
  c.draw = t => { const s = c.shotAt(t); s.draw(t, t - s.from); fade(1 - k01(t - s.from, 0, 0.12)); };
}
const START = []; { let s = 0; for (const c of CUTS) { START.push(s); s += c.dur; } }
const TOTAL = CUTS.reduce((s, c) => s + c.dur, 0);

// ---------- playing it ----------
// the sprites it draws: the game's own where they exist, the rest from public/cutscene
const GAME_SPRITES = ['lugia', 'kyogre', 'carvanha', 'sharpedo', 'wailmer'];
const HALF = ['golbat', 'koffing', 'camerupt', 'numel', 'rocket-m', 'rocket-f', 'aqua-m', 'aqua-f', 'magma-m', 'magma-f']; // drawn at half size, from their own pictures
const CUT_SPRITES = ['groudon', 'golbat', 'koffing', 'camerupt', 'numel', 'torkoal', 'rocket-m', 'rocket-f', 'aqua-m', 'aqua-f', 'magma-m', 'magma-f', 'archie', 'maxie', 'giovanni'];
// who speaks, by the start of the speaker label: the picture by the line
const FACE = [['아강', 'cutscene/archie'], ['비주기', 'cutscene/giovanni'], ['페르시온', 'sprites/npc/boss'], ['샤프니아', 'sprites/carvanha'], ['샤크니아', 'sprites/sharpedo'], ['마적', 'cutscene/maxie']];
let state = null; // { T, last, onEnd, el, shown }
export const active = () => !!state;

export function play({ base, species, speciesName, onEnd, sound = () => {} }) {
  me = species; meName = speciesName; sfx = sound; lastHit = -1;
  for (const [mod, n] of [[PFX.earthSpike, 'quake'], [PFX.groundSlam, 'quake'], [PFX.quake, 'quake'], [PFX.waterJet, 'stream'], [PFX.plasma, 'blast'],
    [PFX.smallExplosion, 'blast'], [PFX.flamePillar, 'channel'], [PFX.geyser, 'wave'], [PFX.waveCrash, 'wave'], [PFX.splash, 'wave'], [PFX.dirtBlast, 'drop'], [PFX.boulder, 'drop']]) FX_SOUND.set(mod, n);
  for (const k of GAME_SPRITES) load(k, `${base}sprites/${k}.png`);
  for (const k of CUT_SPRITES) load(k, `${base}cutscene/${k}.png`);
  for (const k of HALF) load(k + '-half', `${base}cutscene/${k}-half.png`);
  load('persian', `${base}sprites/npc/boss.png`); load(me, `${base}sprites/${me}.png`);
  for (const k in FXC) delete FXC[k];
  const el = document.createElement('div'); el.id = 'cutscene';
  el.innerHTML = `<div class="cs-frame"><canvas width="${W}" height="${H}"></canvas><div class="cs-cap"></div></div><div class="cs-skip">Esc 건너뛰기</div><div class="cs-talk hidden"></div>`;
  document.body.append(el);
  cv = el.querySelector('canvas'); out = cv.getContext('2d');
  wc = Object.assign(document.createElement('canvas'), { width: W, height: H }); g = wc.getContext('2d');
  g.imageSmoothingEnabled = false; out.imageSmoothingEnabled = false;
  state = { T: 0, last: performance.now(), onEnd, el, shown: '', base };
  requestAnimationFrame(frame);
}
export function skip() { if (state) state.T = TOTAL; }
function load(k, src) { if (img[k]?.src.endsWith(src)) return; img[k] = new Image(); img[k].src = src; }
function frame(now) {
  if (!state) return;
  const st = state, dt = Math.min(0.1, (now - st.last) / 1000); st.last = now; st.T += dt;
  const pw = Math.round(cv.clientWidth * devicePixelRatio); // the canvas follows the size it shows at
  if (pw && cv.width !== pw) { cv.width = pw; cv.height = Math.round(pw * H / W); out.imageSmoothingEnabled = false; } OS = cv.width / W;
  if (st.T >= TOTAL) return finish();
  const i = (() => { let i = 0; while (i < CUTS.length - 1 && st.T >= START[i + 1]) i++; return i; })(), c = CUTS[i], t = st.T - START[i];
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); c.draw(t); frameWorld(c, t);
  const sh = c.shotAt(t), h = (sh.hit ?? []).find(h => t >= h && t < h + 0.1);
  if (h !== undefined && START[i] + h !== lastHit) { lastHit = START[i] + h; sfx(c.id === 'M4' ? 'levelup' : 'heavy'); } // an impact (in M4, the change)
  st.el.querySelector('.cs-cap').textContent = `${c.id} · ${c.title}`;
  const line = [...c.lines].reverse().find(l => t >= l[0] && t < l[0] + 4.6), key = line ? c.id + line[0] : '';
  const talk = st.el.querySelector('.cs-talk');
  if (key !== st.shown) {
    st.shown = key; st.typedAt = t; talk.classList.toggle('hidden', !line);
    if (line) {
      const who = typeof line[1] === 'function' ? line[1]() : line[1], mine = line[2] === 'me';
      const face = mine ? `sprites/${me}` : FACE.find(([n]) => who.startsWith(n))?.[1];
      talk.classList.toggle('me', mine);
      talk.innerHTML = `${face ? `<div class="portrait"><img src="${st.base}${face}.png" alt=""></div>` : ''}<div class="talk-body"><b>${who}</b><p></p></div>`;
    }
  }
  if (line) talk.querySelector('p').textContent = line[3].slice(0, Math.floor((t - st.typedAt) * 26) + 1);
  requestAnimationFrame(frame);
}
function finish() {
  const st = state; state = null; st.el.remove(); st.onEnd?.();
}
