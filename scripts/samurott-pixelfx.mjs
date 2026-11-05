// Overpaints the Samurott animation sheet with pixelfx (https://github.com/patch-gg/pixelfx, checked out next to
// this project as ../pixelfx): cleans and relights the sprite pixels, repaints the blade smears as glowing water
// trails, and bakes water effects (bubbles, hit sparks, spray, dash streaks) into the frames.
// Writes assets/player/pixelfx-samurott/: samurott-pixel*.png (body), samurott-effects*.png (effects alone, same layout)
// and samurott-pixelfx.json. Does not touch the game's sheet.
//   node scripts/samurott-pixelfx.mjs            bake everything
//   node scripts/samurott-pixelfx.mjs look a,b,c  also write look.png with those global frame indices (orig | new)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFrame, clearFrame, composite, painterFor, Particles, Lights, P, Rng, sparkle, hex } from '../../pixelfx/src/core/index.js';
import { encodePNG } from '../../pixelfx/tools/lib/png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/player/pixelfx-samurott');
const sheet = JSON.parse(readFileSync(join(ROOT, 'src/anim/samurott.json'), 'utf8'));
const [FW, FH] = sheet.frame, [AX, AY] = sheet.anchor, COLS = sheet.cols, PER = sheet.perPage;
const MOUTH = [AX + sheet.mouth[0], AY + sheet.mouth[1]];

const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
// minimal PNG reader: 8-bit RGBA, not interlaced (what pixel3d.py writes)
function decodePNG(buf) {
  let i = 8, w, h; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('ascii', i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 6 || data[12]) throw new Error('need 8-bit RGBA PNG'); }
    if (type === 'IDAT') idat.push(data);
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), S = w * 4, out = new Uint8Array(S * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (S + 1)], src = raw.subarray(y * (S + 1) + 1, (y + 1) * (S + 1)), o = y * S;
    for (let x = 0; x < S; x++) {
      const a = x >= 4 ? out[o + x - 4] : 0, b = y ? out[o - S + x] : 0, c = x >= 4 && y ? out[o - S + x - 4] : 0;
      const v = src[x];
      out[o + x] = f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c);
    }
  }
  return { w, h, data: out };
}
const pages = sheet.image.map(p => decodePNG(readFileSync(join(ROOT, 'public', p))));
function source(g) { // frame g as ABGR Uint32 (pixelfx's color format)
  const pg = pages[Math.floor(g / PER)], j = g % PER, x0 = (j % COLS) * FW, y0 = Math.floor(j / COLS) * FH, px = new Uint32Array(FW * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const s = ((y0 + y) * pg.w + x0 + x) * 4, d = pg.data;
    px[y * FW + x] = (d[s + 3] << 24 | d[s + 2] << 16 | d[s + 1] << 8 | d[s]) >>> 0;
  }
  return px;
}

// ---- the sprite's palette as ramps (dark to bright), from the sheet itself ----
const C = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
const OUTLINE = C(16, 16, 16);
const RAMPS = {
  blue: [C(16, 33, 74), C(33, 57, 99), C(33, 90, 156), C(58, 128, 196)],
  shell: [C(83, 67, 44), C(123, 99, 66), C(173, 148, 90), C(222, 206, 123), C(246, 236, 170)],
  fur: [C(134, 134, 140), C(198, 198, 206), C(255, 255, 255)],
  chest: [C(90, 115, 115), C(132, 165, 165), C(170, 204, 200)],
  claw: [C(74, 74, 74), C(134, 134, 140)],
  red: [C(145, 55, 67), C(214, 82, 99)],
};
const WHERE = new Map(); // color -> [family, step]
for (const [fam, r] of Object.entries(RAMPS)) r.forEach((c, k) => WHERE.has(c) || WHERE.set(c, [fam, k]));
WHERE.set(C(134, 134, 140), ['fur', 0]);
const NAVY = C(14, 18, 46);
// outline shades: a little deeper than each ramp's darkest, tinted, never black
const OL = { blue: C(14, 26, 62), shell: C(66, 50, 32), fur: C(70, 76, 108), chest: C(56, 76, 84), claw: C(40, 40, 52) };
const OL_SET = new Set(Object.values(OL));
const FAMILY_RANK = ['fur', 'chest', 'shell', 'claw', 'blue']; // light to dark
const step = (c, d) => { const w = WHERE.get(c); if (!w) return c; const r = RAMPS[w[0]]; return r[Math.max(0, Math.min(r.length - 1, w[1] + d))]; };
const darkest = c => { const w = WHERE.get(c); return w ? RAMPS[w[0]][0] : NAVY; };
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]], N8 = [...N4, [1, -1], [1, 1], [-1, 1], [-1, -1]];

// ---- 1. polish the opaque pixels: despeckle, round off outline corners, selective outline, rim light ----
function polish(src) {
  const at = (a, x, y) => x < 0 || y < 0 || x >= FW || y >= FH ? 0 : a[y * FW + x];
  const solid = c => c >>> 24 === 255;
  let px = src.map(c => solid(c) ? c : 0); // smears (translucent) are repainted separately
  // despeckle: a lone pixel whose 4 neighbours mostly agree on a colour of the same family takes it (eyes kept)
  let nx = px.slice();
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const c = px[y * FW + x], w = WHERE.get(c);
    if (!w || w[0] === 'red' || c === C(255, 255, 255)) continue;
    const ns = N4.map(([dx, dy]) => at(px, x + dx, y + dy));
    if (ns.includes(c)) continue;
    const tally = new Map();
    for (const n of ns) if (WHERE.get(n)?.[0] === w[0]) tally.set(n, (tally.get(n) ?? 0) + 1);
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 3) nx[y * FW + x] = best[0];
  }
  px = nx;
  // outline corners: a silhouette outline pixel that only makes an outward L-corner bump is dropped
  nx = px.slice();
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    if (px[y * FW + x] !== OUTLINE) continue;
    const o = N4.map(([dx, dy]) => at(px, x + dx, y + dy));
    const isO = o.map(c => c === OUTLINE), empty = o.map(c => c === 0);
    for (let k = 0; k < 4; k++) {
      const a = k, b = (k + 1) % 4, c2 = (k + 2) % 4, d = (k + 3) % 4;
      if (isO[a] && isO[b] && empty[c2] && empty[d]) { nx[y * FW + x] = 0; break; }
    }
  }
  px = nx;
  // outlines: no black. Every outline pixel takes a deep shade of the part it wraps (coloured outline), so the
  // silhouette reads by hue instead of a heavy black line. Thick black runs are filled inward pass by pass.
  const fam = new Array(FW * FH).fill(null);
  for (let k = 0; k < px.length; k++) { const w = WHERE.get(px[k]); if (w && w[0] !== 'red') fam[k] = w[0]; }
  const deepest = f => FAMILY_RANK.indexOf(f);
  nx = px.slice();
  for (let pass = 0, left = true; pass < 6 && left; pass++) {
    left = false;
    const got = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const i = y * FW + x;
      if (px[i] !== OUTLINE || fam[i]) continue;
      const tally = new Map();
      for (const [dx, dy] of N8) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= FW || y + dy >= FH) continue;
        const f = fam[(y + dy) * FW + x + dx]; if (f) tally.set(f, (tally.get(f) ?? 0) + (dx && dy ? 1 : 2));
      }
      if (!tally.size) { left = true; continue; }
      // between two parts the darker part's shade wins, so creases stay creases
      const f = [...tally].sort((p, q) => q[1] - p[1] || deepest(q[0]) - deepest(p[0]))[0][0];
      got.push([i, f]);
    }
    for (const [i, f] of got) fam[i] = f;
  }
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const i = y * FW + x;
    if (px[i] !== OUTLINE) continue;
    const f = fam[i] ?? 'blue', edge = N4.some(([dx, dy]) => !at(px, x + dx, y + dy));
    // silhouette: the outline shade, a step lighter on the lit top-left; inside: the part's own darkest step
    const lit = edge && (!at(px, x, y - 1) || !at(px, x - 1, y)) && at(px, x, y + 1) && at(px, x + 1, y);
    nx[i] = edge ? (lit ? RAMPS[f][0] : OL[f]) : RAMPS[f][0];
  }
  px = nx;
  // big flat masses of the darkest shade (toon shadow) lift a step, keeping a 1 px dark rim where they meet light
  nx = px.slice();
  for (let y = 1; y < FH - 1; y++) for (let x = 1; x < FW - 1; x++) {
    const i = y * FW + x, c = px[i], w = WHERE.get(c);
    if (!w || w[1] !== 0 || (w[0] !== 'blue' && w[0] !== 'shell')) continue;
    if (N8.every(([dx, dy]) => px[(y + dy) * FW + x + dx] === c || OL[w[0]] === px[(y + dy) * FW + x + dx])) nx[i] = RAMPS[w[0]][1];
  }
  px = nx;
  // rim light: the first pixel under a top silhouette edge goes one step brighter (left edges too gave stripy legs)
  nx = px.slice();
  const isOL = c => OL_SET.has(c) || (WHERE.get(c)?.[1] === 0);
  for (let y = 2; y < FH; y++) for (let x = 2; x < FW; x++) {
    const i = y * FW + x, c = px[i], w = WHERE.get(c);
    if (!w || w[0] === 'red' || w[1] === 0) continue;
    if (!px[i - 2 * FW] && isOL(px[i - FW])) nx[i] = step(c, 1);
  }
  return nx;
}

// ---- 2. effects ----
const W = { deep: hex('#0e2e5a'), mid: hex('#1c76bc'), bright: hex('#36a2e0'), pale: hex('#78ccf4'), foam: hex('#c4ecff'), white: hex('#ffffff') };
const SPARKS = ['#ffffff', '#c4ecff', '#78ccf4', '#36a2e0'];
const WATERY = /float|swim|focus|recharge|dash|shoot|tail|pump|hurt|chop|cut|fury|sweep|rise/; // everything that happens in water

// smear pixels (translucent ghosts of the blade) become a water trail: freshest ghost white-hot, older ones cool to blue
function smear(p, src, light) {
  const pts = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const a = src[y * FW + x] >>> 24;
    if (!a || a === 255) continue;
    const lx = x - AX, ly = y - AY;
    if (a >= 150) { p.px(lx, ly, W.white); p.light(lx, ly, W.pale, 0.3 * light); }
    else if (a >= 100) { p.px(lx, ly, W.foam); p.light(lx, ly, W.bright, 0.18 * light); }
    else { p.blend(lx, ly, (x + y) % 3 ? W.pale : W.bright, 0.38); p.light(lx, ly, W.mid, 0.08 * light); }
    pts.push([x, y, Math.hypot(lx, ly + 50)]);
  }
  if (!pts.length) return null;
  // the blade's tip end of the trail: the fifth of it farthest from the body, where hit sparks fly from
  pts.sort((a, b) => b[2] - a[2]);
  const tip = pts.slice(0, Math.max(1, pts.length / 5 | 0));
  return [tip.reduce((s, q) => s + q[0], 0) / tip.length, tip.reduce((s, q) => s + q[1], 0) / tip.length];
}

// bubbles from the mouth and the body: a pure function of phase, so loops wrap without a seam
function bubbles(p, phase, count, rng) {
  for (let k = 0; k < count; k++) {
    const u = (phase + rng[k].off) % 1, s = rng[k];
    const x = s.x0 + Math.sin(u * 6.283 * s.wob + s.ph) * 1.5 - AX, y = s.y0 - u * s.rise - AY;
    const r = s.r * (0.7 + 0.5 * u), a = u > 0.85 ? (1 - u) / 0.15 : 1;
    if (r < 1.2) { p.dot(x, y, W.foam, a); continue; }
    p.ring(x, y, r, 1, W.pale, 0.8 * a);
    p.dot(x - 0.6 * r, y - 0.6 * r, W.white, a);
    p.light(x, y, W.bright, 0.1 * a);
  }
}
const bubbleSeeds = (seed, n) => { const R = new Rng(seed); return Array.from({ length: n }, (_, k) => {
  const fromMouth = k % 3 !== 2;
  return { off: k / n + R.range(-0.04, 0.04), x0: (fromMouth ? MOUTH[0] + R.range(-2, 4) : AX - 30 + R.range(-6, 6)), y0: (fromMouth ? MOUTH[1] - 2 : AY - 46),
    rise: R.range(50, 80), wob: R.int ? R.int(1, 3) : 1 + (k % 2), ph: R.range(0, 6.28), r: R.range(0.8, 2.6) };
}); };

function bake(name, a) {
  const n = a.frames.length, dt = 1 / a.fps, R = new Rng(name.length * 977 + n);
  const ps = new Particles({ rng: R, sparks: SPARKS }), lights = new Lights();
  const seeds = bubbleSeeds(n * 31 + name.length, /float|focus/.test(name) ? 4 : 3);
  const hits = [a.hit, a.hit2].filter(h => h != null).map(h => Math.round(h * a.fps));
  const blade = /chop|cut|fury|sweep|rise|sheathe/.test(name);
  const frame = createFrame(FW, FH), out = { body: [], fx: [] };
  let lastTrail = null;
  for (let i = 0; i < n; i++) {
    const g = a.frames[i], src = source(g), sprite = polish(src);
    clearFrame(frame);
    const p = painterFor(frame); p.place(AX, AY);
    const t = i * dt;
    if (i) { for (let s = 0; s < 4; s++) ps.update(dt / 4); lights.update(dt); }
    // the effects layer only: the body goes to its own sheet, so the game can play either without the other
    ps.draw(p, 'back');
    if (WATERY.test(name) && !/^(dash|shoot|tail|pump|hurt)/.test(name) && !blade) bubbles(p, a.loop ? i / n : t / 2.4, seeds.length, seeds);
    const body = new Uint8ClampedArray(FW * FH * 4);
    for (let k = 0; k < sprite.length; k++) { const c = sprite[k]; if (c) body.set([c & 255, c >> 8 & 255, c >> 16 & 255, 255], k * 4); }
    out.body.push(body);
    // hurt: the first two frames flash pale (a white silhouette laid over the body)
    if (/^hurt/.test(name) && i < 2) for (let k = 0; k < sprite.length; k++) if (sprite[k]) p.blend(k % FW - AX, (k / FW | 0) - AY, W.white, i ? 0.45 : 1);
    const trail = smear(p, src, 1) ?? lastTrail;
    lastTrail = trail ?? lastTrail;
    // the blade tip: the shell-coloured pixel farthest in front of and below the chest (horn excluded)
    let tip = null, best = 0;
    if (blade) for (let y = AY - 40; y < FH; y++) for (let x = AX; x < FW; x++) {
      const w = WHERE.get(sprite[y * FW + x]); if (w?.[0] !== 'shell') continue;
      const d = Math.hypot(x - AX, y - (AY - 50)); if (d > best) { best = d; tip = [x, y]; }
    }
    // cues
    for (const h of hits) if (i === h) {
      const [cx, cy] = blade ? (tip ?? trail ?? [AX + 46, AY - 20]) : /tail/.test(name) && trail ? trail : /shoot|pump/.test(name) ? MOUTH : [AX + 46, AY - 40];
      const lx = cx - AX, ly = cy - AY, dir = /tail/.test(name) ? -1 : 1;
      lights.add(lx, ly, 18, W.pale, 0.55, 0.25);
      for (let k = 0; k < 16; k++) {
        const ang = R.range(-1.3, 1.3) + (dir < 0 ? Math.PI : 0), sp = R.range(70, 220);
        ps.spawn(P.SPARK, lx, ly, Math.cos(ang) * sp, Math.sin(ang) * sp - 30, R.range(0.15, 0.4));
      }
      for (let k = 0; k < 5; k++) ps.spawn(P.VAPOUR, lx + R.range(-6, 6), ly + R.range(-6, 6), R.range(-15, 25) * dir, R.range(-20, -5), R.range(0.5, 0.9), W.foam, R.range(2, 4));
    }
    const sinceHit = hits.length ? i - hits[0] : -1;
    if (blade) for (const h of hits) if (i >= h && i < h + 3) { // glint on the blade edge for three frames
      const [cx, cy] = tip ?? trail ?? [AX + 40, AY - 20];
      sparkle(p, cx - AX, cy - AY, 5 - (i - h) * 1.5, W.white, W.pale, 0.6);
    }
    if (/^shoot/.test(name) && sinceHit >= 0 && sinceHit < 6) { // muzzle burst and a spray of droplets
      const mx = MOUTH[0] - AX + 4, my = MOUTH[1] - AY, k = 1 - sinceHit / 6;
      p.disc(mx, my, 2 + 5 * k, W.foam, 0.7 * k); p.circle(mx, my, 2 + 2 * k, W.white); p.glow(mx, my, 14, W.pale, 0.5 * k);
      for (let j = 0; j < 4; j++) ps.spawn(P.SPARK, mx, my, R.range(120, 260), R.range(-50, 50), R.range(0.12, 0.3));
    }
    if (/^pump/.test(name)) { // a steady spray at the mouth, pure in phase so the loop wraps
      const mx = MOUTH[0] - AX + 3, my = MOUTH[1] - AY;
      for (let j = 0; j < 14; j++) {
        const u = ((i / n) * 2 + j / 14) % 1, spread = ((j * 7) % 5 - 2) * 3;
        const x = mx + u * 34, y = my + spread * u + u * u * 6;
        p.px(x, y, u < 0.3 ? W.white : u < 0.65 ? W.foam : W.pale);
        if (u < 0.6) p.px(x - 1, y, W.pale);
      }
      p.disc(mx + 2, my, 3.5, W.foam, 0.6); p.glow(mx, my, 12, W.pale, 0.35);
    }
    if (/^dash/.test(name) && !/cut/.test(name) && sinceHit > -3 && sinceHit < 10) { // speed streaks behind the body
      const k = sinceHit < 0 ? (sinceHit + 3) / 3 : 1 - sinceHit / 10;
      for (let j = 0; j < 7; j++) {
        const y = -58 + j * 8 + ((j * 5) % 3), len = (14 + ((j * 11) % 13)) * k, x = -34 - ((j * 13) % 7);
        p.line(x - len, y, x - len * 0.4, y, W.bright);
        p.line(x - len * 0.4, y, x, y, W.foam);
        p.px(x, y, W.white); p.light(x, y, W.pale, 0.2 * k);
      }
    }
    lights.draw(p);
    ps.draw(p, 'front');
    out.fx.push(composite(frame, new Uint8ClampedArray(FW * FH * 4), null));
  }
  return out;
}

// ---- 3. bake every animation and write sheets laid out like the game's ----
mkdirSync(OUT, { recursive: true });
const total = Math.max(...Object.values(sheet.anims).flatMap(a => a.frames)) + 1, baked = { body: new Array(total), fx: new Array(total) };
for (const [name, a] of Object.entries(sheet.anims)) { const r = bake(name, a); a.frames.forEach((g, k) => { baked.body[g] = r.body[k]; baked.fx[g] = r.fx[k]; }); }
function writeSheets(frames, stem) {
  const files = [];
  for (let pg = 0; pg * PER < total; pg++) {
    const cnt = Math.min(PER, total - pg * PER), rows = Math.ceil(cnt / COLS), w = COLS * FW, h = rows * FH, rgba = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < cnt; j++) {
      const f = frames[pg * PER + j]; if (!f) continue;
      const x0 = (j % COLS) * FW, y0 = Math.floor(j / COLS) * FH;
      for (let y = 0; y < FH; y++) rgba.set(f.subarray(y * FW * 4, (y + 1) * FW * 4), ((y0 + y) * w + x0) * 4);
    }
    const file = `${stem}${pg ? '-' + pg : ''}.png`;
    writeFileSync(join(OUT, file), encodePNG(w, h, rgba));
    files.push(file);
  }
  return files;
}
// image: the overpainted body; effects: the effects alone, same layout, drawn over the body
const images = writeSheets(baked.body, 'samurott-pixel'), effects = writeSheets(baked.fx, 'samurott-effects');
writeFileSync(join(OUT, 'samurott-pixelfx.json'), JSON.stringify({ ...sheet, image: images, effects, original: sheet.image.map(p => '/' + p) }));
console.log(`baked ${total} frames into ${images.length} body + ${effects.length} effect sheets`);

if (process.argv[2] === 'look') { // orig | new, 3x, over game water
  const ids = process.argv[3].split(',').map(Number), Z = 3, w = FW * Z * ids.length, h = FH * Z * 2, img = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) img.set([11, 53, 80, 255], k * 4);
  ids.forEach((g, k) => {
    const o = source(g), b = baked.body[g].slice(), e = baked.fx[g];
    for (let q = 0; q < FW * FH; q++) { const a = e[q * 4 + 3] / 255; if (!a) continue; if (!b[q * 4 + 3]) { b.set(e.subarray(q * 4, q * 4 + 4), q * 4); continue; } for (let ch = 0; ch < 3; ch++) b[q * 4 + ch] = e[q * 4 + ch] * a + b[q * 4 + ch] * (1 - a); }
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) for (const [row, getc] of [[0, () => [o[y * FW + x] & 255, o[y * FW + x] >> 8 & 255, o[y * FW + x] >> 16 & 255, o[y * FW + x] >>> 24]], [1, () => [...b.subarray((y * FW + x) * 4, (y * FW + x) * 4 + 4)]]]) {
      const [r, gg, bb, a] = getc(); if (!a) continue;
      for (let zy = 0; zy < Z; zy++) for (let zx = 0; zx < Z; zx++) {
        const d = (((row * FH + y) * Z + zy) * w + (k * FW + x) * Z + zx) * 4, f = a / 255;
        img[d] = r * f + img[d] * (1 - f); img[d + 1] = gg * f + img[d + 1] * (1 - f); img[d + 2] = bb * f + img[d + 2] * (1 - f);
      }
    }
  });
  writeFileSync(join(OUT, 'look.png'), encodePNG(w, h, img));
}
