// Battle sound effects: short CC0 clips in public/sfx/<name>.mp3 (credits in public/sfx/README.md), played through WebAudio.
// play(name) is safe to call every frame; the same sound plays at most once per GAP seconds so multi-hits don't pile up.
// move(m) picks a move's sound from its effect or shape (data.json); hit(m, ...) is the blow landing.
const GAP = 0.04;
const NAMES = ['slash', 'cross', 'blade', 'ram', 'jab', 'bite', 'stream', 'bubbles', 'orb', 'blast', 'homing', 'ray', 'bolt',
  'snipe', 'channel', 'pulse', 'wave', 'quake', 'sound', 'focus', 'drop', 'leaf', 'ring', 'heal',
  'hit', 'heavy', 'crit', 'hurt', 'faint', 'net', 'catch', 'escape', 'levelup', 'berry', 'down'];
let ctx = null, out = null, volume = 0.6;
const buffers = {}, lastAt = {};

// the clips load at once; the AudioContext may only play after a click or key, so it resumes on the first one
export function init(baseUrl) {
  ctx = new AudioContext(); out = ctx.createGain(); out.gain.value = volume; out.connect(ctx.destination);
  for (const n of NAMES)
    fetch(`${baseUrl}sfx/${n}.mp3`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { buffers[n] = b; }).catch(() => {});
  const start = () => { if (ctx.state === 'suspended') ctx.resume(); };
  addEventListener('pointerdown', start);
  addEventListener('keydown', start);
}

export function setVolume(v) { volume = v; if (out) out.gain.value = v; }

// vol scales this one sound (a wild Pokemon's moves play quieter with distance); throttled per name and per loudness.
// Each play is pitched a little up or down so repeats don't sound copy-pasted.
export function play(name, vol = 1) {
  if (!ctx || ctx.state !== 'running' || volume <= 0 || vol <= 0 || !buffers[name]) return;
  const now = ctx.currentTime, key = vol < 1 ? name + '~' : name;
  if (now - (lastAt[key] ?? -1) < GAP) return;
  lastAt[key] = now;
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffers[name];
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  g.gain.value = vol;
  src.connect(g).connect(out);
  src.start();
}

// the sound a move makes as it goes off: its effect when that has its own sound, else its shape
const FX_SOUND = { blast: 'blast', homing: 'homing', channel: 'channel', snipe: 'snipe', quake: 'quake', sound: 'sound', uproar: 'sound', heal: 'heal', spout: 'stream', origin: 'channel' };
const SHAPE_SOUND = { beam: 'snipe' };
export function move(m, vol = 1) {
  play(FX_SOUND[m.fx] ?? SHAPE_SOUND[m.shape] ?? (NAMES.includes(m.shape) ? m.shape : 'orb'), vol);
}

// 위기: HP at half or less, a two-note beep every ALARM_EVERY s (synthesized, no clip), as long as on keeps coming true
const ALARM_EVERY = 0.85;
let alarmAt = 0;
export function alarm(on) {
  if (!on || !ctx || ctx.state !== 'running' || volume <= 0) { alarmAt = 0; return; }
  const now = ctx.currentTime;
  if (now < alarmAt) return;
  alarmAt = now + ALARM_EVERY;
  [[1180, 0], [880, 0.09]].forEach(([hz, t]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = hz;
    g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(0.09, now + t + 0.005); g.gain.setValueAtTime(0.09, now + t + 0.06); g.gain.linearRampToValueAtTime(0, now + t + 0.075);
    o.connect(g).connect(out); o.start(now + t); o.stop(now + t + 0.08);
  });
}

export function hit(m, crit, onPlayer) {
  play(onPlayer ? 'hurt' : crit ? 'crit' : m.power >= 90 ? 'heavy' : 'hit');
}
