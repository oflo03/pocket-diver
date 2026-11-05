// Animation sheets for player species: scripts/render3d.py + pixel3d.py render each one's 3D model as pixel art
// (pixel: true, drawn crisp).
// A sheet holds named animations (idle, walk, swim, float, one per shared move motion, recharge, hurt, their '_drawn'
// versions, sheathe, and the sword motions' '_iai' versions) as frame indices in a grid. A big sheet is split into pages: 'image' is then a list and
// frame k is frame k % perPage of page k // perPage. Frames face right; 'anchor' is the body's centre x and feet line
// in a frame, 'body' its width and height.
// every sheet in src/anim, by species
const SHEETS = Object.fromEntries(Object.entries(import.meta.glob('./anim/*.json', { eager: true, import: 'default' }))
  .map(([path, sheet]) => [path.slice(7, -5), sheet]));
const images = {};

export const has = key => !!SHEETS[key];
export const info = key => SHEETS[key];
// sheet px -> world px for a sprite `size` px across its larger side (as plain sprites are sized)
export const scale = (key, size) => size / Math.max(...SHEETS[key].body);

function image(key, base, page) {
  const src = [].concat(SHEETS[key].image)[page], id = key + page;
  if (!images[id]) images[id] = Object.assign(new Image(), { src: base + src });
  return images[id].naturalWidth ? images[id] : null;
}

// how long a one-shot animation runs, in seconds
export const duration = (key, name) => { const a = SHEETS[key]?.anims[name]; return a ? a.frames.length / a.fps : 0; };

// Draws the animation frame at time t (seconds since it started; loops wrap, one-shots hold their last frame) with the
// feet at (x, y) and the body's larger side `size` world px. Returns false while the sheet is still loading.
export function draw(ctx, key, base, name, t, x, y, size, flip, tilt = 0, alpha = 1) {
  const s = SHEETS[key], a = s?.anims[name];
  if (!a) return false;
  const n = a.frames.length, i = a.loop ? Math.floor(t * a.fps) % n : Math.min(n - 1, Math.floor(t * a.fps));
  const per = s.perPage ?? Infinity, k0 = a.frames[(i + n) % n], f = k0 % per, img = image(key, base, Math.floor(k0 / per));
  if (!img) return false;
  const [fw, fh] = s.frame, k = scale(key, size);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  if (tilt) { ctx.translate(0, -s.body[1] * k * 0.45); ctx.rotate(tilt); ctx.translate(0, s.body[1] * k * 0.45); } // tilt around the body's middle
  const zoom = k * Math.hypot(ctx.getTransform().a, ctx.getTransform().b); // sheet px -> screen px
  ctx.imageSmoothingEnabled = !(s.pixel && zoom >= 1); ctx.imageSmoothingQuality = 'high'; // dot sheets stay crisp when enlarged
  ctx.drawImage(img, (f % s.cols) * fw, Math.floor(f / s.cols) * fh, fw, fh, -s.anchor[0] * k, -s.anchor[1] * k, fw * k, fh * k);
  ctx.restore();
  return true;
}
