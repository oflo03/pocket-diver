// Background music (GAME_DESIGN.md 13.6): one looping track per place, read from public/bgm/<name>.mp3.
// Names: title, farm, base, zone1, zone2, zone3, boss, alpha (a 우두머리 fight); a missing file just stays silent.
// Browsers block sound until the first click or key, so the current track retries then.
const FADE_SECONDS = 1;
let base = '', name = null, cur = null, volume = 0.5;

export function init(baseUrl) {
  base = baseUrl;
  const resume = () => { if (volume > 0 && cur?.paused) cur.play().catch(() => {}); };
  addEventListener('pointerdown', resume);
  addEventListener('keydown', resume);
}

// 0..1; 0 stops the music
export function setVolume(v) {
  volume = v;
  if (!cur) return;
  cur.volume = v;
  if (v > 0) cur.play().catch(() => {}); else cur.pause();
}

// switch tracks (no-op if it is already playing); the old one fades out
export function play(next) {
  if (next === name) return;
  name = next;
  if (cur) fadeOut(cur);
  cur = new Audio(`${base}bgm/${next}.mp3`);
  cur.loop = true;
  cur.volume = volume;
  if (volume > 0) cur.play().catch(() => {});
}

function fadeOut(a) {
  const step = a.volume / (FADE_SECONDS * 20);
  const t = setInterval(() => {
    a.volume = Math.max(0, a.volume - step);
    if (a.volume === 0) { a.pause(); clearInterval(t); }
  }, 50);
}
