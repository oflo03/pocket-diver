// Boss tribute scene: full-screen picture shown after a zone boss is offered.
// Sequence: the screen fades to black, dissolves to white, and the white burns away to reveal the office picture
// (slow push-in, light rays and a glow behind the boss, rising sparkles, the player sliding in, a title banner).
// Any key or click then calls onReady (the secretary's talk), which opens over the full picture; hide() fades it out.
// Fixed office background (assets/rewards/modular-v1), the zone's bosses in the net, and the player's Pokemon in front.
// Layout comes from the art's manifest (src/tribute.json, boxes in canvas px). Species without generated art yet use
// their game sprite in the player's spot.
import SCENE from './tribute.json';

const el = () => document.getElementById('tribute');
const pct = (v, of) => `${(v / of) * 100}%`;
const BLACK_MS = 700, WHITE_MS = 900, REVEAL_MS = 1600; // fade to black, dissolve to white, white burns away
let state = null; // null | 'intro' (keys swallowed) | 'ready' (next key continues) | 'talk'
let onReadyCb = null, timers = [];

export const active = () => state !== null && state !== 'talk';

export function show(zone, species, base, { title, sub }, onReady) {
  const [W, H] = SCENE.canvas, boss = SCENE.bosses[zone], me = SCENE.players[species];
  const img = (src, [l, t, w, h], flip, cls = '') =>
    `<img class="${cls}" src="${base}${src}" alt="" style="left:${pct(l, W)};top:${pct(t, H)};width:${pct(w, W)};height:${pct(h, H)};${flip ? 'transform:scaleX(-1);' : ''}">`;
  // fallback: the game sprite standing where the player art would (bottom at the shared floor line, about 880px)
  const fallback = `<img class="sprite me" src="${base}sprites/${species}.png" alt="" style="left:${pct(60, W)};top:${pct(480, H)};width:${pct(400, W)};height:${pct(400, H)};transform:scaleX(-1);">`; // sprites face left; turn toward the boss
  const glow = boss ? `<div class="boss-glow" style="left:${pct(boss.box[0] + boss.box[2] / 2, W)};top:${pct(boss.box[1] + boss.box[3] / 2, H)}"></div>` : '';
  const sparks = Array.from({ length: 28 }, () =>
    `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 6).toFixed(2)}s;animation-duration:${(4 + Math.random() * 4).toFixed(2)}s;--s:${(0.5 + Math.random()).toFixed(2)}"></i>`).join('');
  el().innerHTML = `<div class="tribute-bg" style="background-image:url(${base}${SCENE.bg})"></div>
    <div class="tribute-frame" style="aspect-ratio:${W}/${H}">
      <div class="push">
        <img src="${base}${SCENE.bg}" alt="" style="left:0;top:0;width:100%;height:100%">
        <div class="rays"></div>${glow}
        ${boss ? img(boss.file, boss.box, boss.flipX, 'boss') : ''}
        ${me ? `<div class="me-wrap">${img(me.file, me.box, me.flipX, 'me')}</div>` : fallback}
        <div class="sparks">${sparks}</div>
        <div class="vignette"></div>
      </div>
    </div>
    <div class="banner"><div class="banner-title">${title}</div><div class="banner-sub">${sub}</div></div>
    <div class="curtain"></div>`;
  const t = el();
  t.className = 'intro';
  onReadyCb = onReady;
  state = 'intro';
  timers.forEach(clearTimeout);
  timers = [ // the curtain's own animation runs black -> white -> clear; the picture appears under the white
    setTimeout(() => t.classList.add('reveal'), BLACK_MS + WHITE_MS),
    setTimeout(() => { t.classList.add('ready'); state = 'ready'; }, BLACK_MS + WHITE_MS + REVEAL_MS + 900),
  ];
}

function proceed() {
  state = 'talk';
  el().classList.add('talk');
  const cb = onReadyCb; onReadyCb = null;
  cb?.();
}

export function hide() {
  timers.forEach(clearTimeout);
  const t = el();
  t.classList.add('out');
  timers = [setTimeout(() => { t.className = 'hidden'; t.innerHTML = ''; }, 600)];
  state = null;
}

// the scene owns the keyboard and mouse until the talk starts: keys during the intro do nothing, then any key continues
const swallow = e => {
  if (!active()) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (state === 'ready' && (e.type === 'keydown' || e.type === 'mousedown')) proceed();
};
for (const type of ['keydown', 'mousedown', 'click', 'contextmenu', 'wheel']) // key/mouse ups pass so nothing stays held
  addEventListener(type, swallow, { capture: true, passive: false });
