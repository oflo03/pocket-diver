import './style.css';
import data from './data.json';
import * as R from './rules.js';
import * as M from './map.js';
import * as UI from './ui.js';
import * as MapView from './minimap.js';
import * as Title from './title.js';
import * as Cloud from './cloud.js';
import * as Stats from './analytics.js';
import * as Decor from './decor.js';
import * as Terrain from './terrain.js';
import * as Sea from './sea.js';
import * as Tribute from './tribute.js';
import * as Anim from './anim.js';
import * as FX from './effects.js';
import * as BGM from './bgm.js';
import * as SFX from './sfx.js';
import * as Board from './board.js';
import { TIPS, RADIO } from './tips.js';
import * as Cutscene from './cutscene.js';

// View: the camera shows viewH world px of height (120, growing up to 1.5x as the player evolves) and is widened to
// the window's shape, so the game fills the whole screen with no side bars. The canvas is the window's size and the
// world is drawn through a scale transform (screen px per world px), so sprites are resampled once at display size.
const BASE_VIEW_H = 120;
let W = 320, H = BASE_VIEW_H, SCALE = 1, viewH = BASE_VIEW_H * 1.2;
const MAP_BOX = { w: 248, h: 156, x: 0, y: 0 }; // the Tab map window, centred in the view
const cv = document.getElementById('game');
let ctx = cv.getContext('2d'); // (render points it at the effects layer while the effects draw)
const dark = document.createElement('canvas');
// the moves' shots, beams and effects are drawn on their own layer at FX_RES px per world px (about a sprite pixel)
// and turned into pixel art there (FX.pixelate) before going on the screen
const FX_RES = 2.5, fxLayer = document.createElement('canvas'), fxCtx = fxLayer.getContext('2d', { willReadFrequently: true });
const dctx = dark.getContext('2d');
function resizeCanvas() {
  cv.width = dark.width = innerWidth; cv.height = dark.height = innerHeight;
  cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
  applyView();
}
function applyView() {
  SCALE = innerHeight / viewH; H = viewH; W = innerWidth / SCALE;
  MAP_BOX.w = Math.round(H * 1.38); MAP_BOX.h = Math.round(H * 0.86);
  MAP_BOX.x = (W - MAP_BOX.w) / 2; MAP_BOX.y = (H - MAP_BOX.h) / 2;
  MapView.fitWidth(MAP_BOX.w);
  fxLayer.width = Math.ceil(W * FX_RES); fxLayer.height = Math.ceil(H * FX_RES);
  const hud = document.getElementById('hud'), zoom = Math.max(1, innerHeight / 760); // the HUD grows with tall windows, staying readable
  hud.style.zoom = zoom; hud.style.setProperty('--hud-zoom', zoom);
}
addEventListener('resize', resizeCanvas);
resizeCanvas();
// Evolving widens the view (x1.2, x1.4, x1.6 of BASE_VIEW_H for the three stages) and the player's reach
// (x1, x1.25, x1.5).
const stage = () => Math.max(0, R.LINES[S.line]?.species.indexOf(S.species) ?? 0);
const VIEW_GROWTH = [1.2, 1.4, 1.6], STAGE_GROWTH = [1, 1.25, 1.5];
const stageGrowth = () => STAGE_GROWTH[stage()] ?? 1;
// Player ranges keep their base distances and grow with evolution by the same factor.
const rangeK = stageGrowth;

const TYPE_COLOR = {
  normal: '#d8cfa8', water: '#4a9cff', poison: '#b45ad8', electric: '#ffd23c', ice: '#8ee8ff', rock: '#b89a5a',
  ground: '#d8b060', psychic: '#ff6aa8', ghost: '#8a72d8', dark: '#6a5a58', dragon: '#7a6aff', bug: '#9ac83a',
  grass: '#5ac85a', flying: '#a0b8ff', fighting: '#e0603a', steel: '#a8b0c0', fairy: '#ffa8d8', fire: '#ff7a3a',
};
// Wild behaviour: state is calm / hostile / flee. temper decides how a mon reacts to seeing or being hit by the player.
const DETECT = 130, LEASH = DETECT * 2; // once chasing or fleeing, it keeps going until the player is twice the detect range away
const ON_HIT = { aggro: 'hostile', mildAggro: 'hostile', mildMild: 'calm', mildFlee: 'flee', fleeAggro: 'hostile', fleeFlee: 'flee' };
const FLEES_ON_SIGHT = { fleeAggro: true, fleeFlee: true };
const NET_SPEED = 260, NET_TTL = 0.5;
const SPRINT_MULT = 1.5, STAMINA_REFILL = 4; // stamina 0..1: lasts R.staminaSeconds, refills from empty in 4s
// its gauge shows under the player while it is not full, and STAMINA_HIDE s after it fills up (fading the last FADE of it)
const STAMINA_HIDE = 0.9, STAMINA_FADE = 0.3;
const FARM_LEVEL = [3, 7];
const FARM_FOE = 'goldeen'; // the fish farm's second step: one that fights back (caught and sold, the training ends)
const farmStep2 = () => S.rank === 0 && S.karpSold >= 3;
const WARP_SECONDS = 3; // teleporting from anywhere but the base takes this long, standing still and unhurt
const warp = { t: 0, active: false };

// ---------- save ----------
// which of the 3 save slots this run plays; null = on the title screen (nothing runs or saves)
const SLOT = Title.currentSlot();
const SAVE_KEY = Title.saveKey(SLOT ?? 0);
// Starting moves: everything the line learns by level 5, equipped in order. S.equip holds both move sets one after the
// other (R.SLOTS each); S.set is the one the keys fire.
function starterKit(line) {
  const learned = R.LINES[line].learnset.filter(([lv]) => lv <= 5).map(([, k]) => k);
  return {
    line, species: R.LINES[line].species[0], learned, set: 0, equip: Array.from({ length: R.SLOTS * R.SETS }, (_, i) => learned[i] ?? null),
    pp: Object.fromEntries(learned.map(k => [k, data.moves[k].pp])),
  };
}

function newGame() {
  return {
    ...starterKit('oshawott'), needsStarter: true, level: 5, exp: R.expForLevel(5), iv: R.starterIV(), ev: { hp: 0, atk: 0, def: 0, spd: 0 },
    hp: null, ppLevel: 0,
    money: 0, rank: 0, karpSold: 0, treasures: [], offered: {}, bag: [], tiedNet: null,
    seen: {}, caught: {}, upgrades: { net: 0, lamp: 0, stamina: 0, sets: 0, berry: 0, charm: 0, exp: 0, radar: 0 }, berries: 0, luck: { catch: 0, crit: 0 }, metNpc: {}, playTime: 0,
  };
}
let S;
try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { S = null; }
if (!S?.species) S = newGame(); // missing or corrupted save
// saves from the zone-1-only build stored treasure indices and a single boss flag
S.treasures = S.treasures.map(t => (typeof t === 'number' ? '1-' + t : t));
S.offered ??= S.bossesOffered ? { 1: true } : {};
delete S.bossesOffered;
S.luck ??= { catch: 0, crit: 0 };
S.upgrades.stamina ??= 0;
S.upgrades.sets ??= 0; // 기술 세트 bought at the base (one to start)
S.upgrades.berry ??= 0; // 열매주머니 size
S.upgrades.charm ??= 0; // 빛나는 부적
S.upgrades.exp ??= 0; // 학습 장치
S.upgrades.radar ??= 0; // 보스 탐지기 (0 or 1)
S.berries ??= R.berryCount(S.upgrades.berry); // 자뭉열매 left on this dive
const setsOpen = () => 1 + S.upgrades.sets;
S.metNpc ??= {};
S.tips ??= {}; S.radio ??= {}; // 업무 매뉴얼 pages seen (coach), 나옹's 무전 tips given
S.tribute ??= []; // bosses waiting to be offered
S.shinyGift ??= {}; // zones whose one guaranteed shiny has already spawned
S.rank = R.rankOf(S);
delete S.rankVer;
S.line ??= R.lineOf(S.species) ?? 'oshawott';
S.tracked ??= {};
S.alphas ??= {}; S.alphaSeen ??= {}; S.alphaPos ??= {}; // 우두머리: caught (for good), met (the story told), each one's den
S.alphaPost ??= {}; S.alphaPaid ??= {}; // (its old 현상수배 poster: taken), reported (the bonus paid)
S.story ??= {};
S.keys ??= {}; S.gemSent ??= {}; // per zone: its boss room's key made; a gem handed in for analysis
for (const z in S.offered) if (S.offered[z]) S.keys[z] = true; // story scenes seen (magmaOp: 작전 1 after 루기아)
S.task ??= {}; S.postsDone ??= 0; // 개인 업무: each zone's step (taskOf); posts turned in, all told
for (const m of [...S.bag, ...(S.tiedNet?.mons ?? [])]) if (m.alpha) m.boss = true; // (caught before 우두머리 were kept like bosses)
// saves from before the bag marked a caught 우두머리 (alpha): one caught but neither reported nor in hand (the net taken on
// an arrest) goes back to its den
if (!S.alphaFix) {
  S.alphaFix = true;
  const ALPHA_KEYS = { 1: 'wishiwashi', 2: 'dhelmise', 3: 'gyarados' };
  for (const z in S.alphas) if (!S.alphaPaid[z] && ![...S.bag, ...S.tribute, ...(S.tiedNet?.mons ?? [])].some(m => m.key === ALPHA_KEYS[z])) delete S.alphas[z];
} // play-stat milestones this save has already sent (src/analytics.js)
// a milestone goes to the stats hub once per save; clear: it is the game's end
function mark(name, clear = false) {
  if (S.tracked[name]) return;
  S.tracked[name] = 1;
  Stats.milestone(name, S.line, S.level, Math.round(S.playTime / 60), clear);
}
S.pieceHints ??= {}; // 조각 탐지 bought at the base: piece id -> { tx, ty } (the centre of the circle marked on the map)
S.guide ??= S.rank >= 1 ? { all: true } : {}; // 조작 안내: the steps done (guideStep); a save from before it knows the controls
S.wanted ??= 0; S.wantedAt ??= 0; // 수배도 (stars, as a number) and when it last went up (S.playTime)
// 게시판: posts (Board), seq (the last post's number), main (zones whose 본사 지시 was taken). A save from before it has
// taken every zone's up to the one being worked on.
if (!S.board) {
  S.board = { posts: [], seq: 0, main: {} };
  if (S.rank >= 1) for (const z of M.ZONES) { S.board.main[z.id] = true; if (!S.offered[z.id]) break; }
}
// 샤프니아·샤크니아 are kept for the story (out of the sea since): posts already up for them come down
const STORY_ONLY = new Set(['carvanha', 'sharpedo']);
S.board.posts = S.board.posts.filter(p => !STORY_ONLY.has(p.key));
// the learnset moved moves earlier: whatever the line now learns at or under this level is learned (kept in learnset order)
{
  const order = R.LINES[S.line].learnset.map(([, k]) => k), at = k => (order.includes(k) ? order.indexOf(k) : order.length);
  for (const [lv, k] of R.LINES[S.line].learnset)
    if (lv <= S.level && !S.learned.includes(k)) { S.learned.push(k); S.pp[k] = R.maxPP(data.moves[k].pp, S.ppLevel ?? 0); }
  S.learned.sort((a, b) => at(a) - at(b));
}
// the move slots grew from two to four, then to two sets of four: pad old saves, and fill the new slots with moves
// already learned
S.equip = [...S.equip, ...Array(R.SLOTS * R.SETS).fill(null)].slice(0, R.SLOTS * R.SETS);
S.set ??= 0;
if (S.set >= setsOpen()) S.set = 0;
for (const k of S.learned) if (!S.equip.includes(k) && S.equip.includes(null)) S.equip[S.equip.indexOf(null)] = k;
for (const k in S.ev) S.ev[k] = Math.min(S.ev[k], R.EV_MAX); // ev is now an effort level 0~10
MapView.load(S.explored);
MapView.reveal(M.MAIN_BASE.x, 0, 14); // the base is known from day one
M.setScene(S.rank >= 1 ? 'main' : 'tutorial'); // interns live in the separate fish-farm map
function save() {
  S.hp = P.hp;
  S.pos = { scene: M.scene, x: P.x, feet: P.y + P.hh }; // feet, so a hitbox that changes on load keeps them in place
  S.explored = MapView.dump();
  if (!SLOT) return;
  S.savedAt = Date.now(); // cloud and local copies of a slot: the newer wins (src/cloud.js)
  const json = JSON.stringify(S);
  try { localStorage.setItem(SAVE_KEY, json); } catch { /* private mode: play without saving */ }
  Cloud.push(SLOT, json, S.savedAt);
}

// ---------- entities ----------
const sp = key => data.species[key];
// Drawn size follows real height, compressed (h^0.7) so a 14.5m Wailord and a 0.3m Manaphy both fit on screen.
const sizePx = s => clamp(Math.round(24 * s.height ** 0.7), 12, 180);
// Hitbox from the drawn sprite: width inset 20% (fins, tails and whiskers stick out), full height so the
// bottom of the box is where the feet are drawn. Before the image loads, a square estimate from the size.
const shinyOdds = zone => R.SHINY_ODDS[zone] * R.charmMult(S.upgrades.charm); // 빛나는 부적 multiplies it
function spriteBox(key, shiny) {
  const size = sizePx(sp(key)), img = sprite(key, shiny);
  if (Anim.has(key)) { const [bw, bh] = Anim.info(key).body, k = Anim.scale(key, size); return { hw: bw * k * 0.4, hh: bh * k * 0.5, ready: true }; } // animated: the sheet's body
  if (!img) return { hw: size * 0.35, hh: size * 0.35, ready: false };
  const k = size / Math.max(img.width, img.height);
  return { hw: img.width * k * 0.4, hh: img.height * k * 0.5, ready: true };
}
// distance from a point to an entity's hitbox (0 inside)
const boxDist = (t, x, y) => Math.hypot(Math.max(0, Math.abs(x - t.x) - t.hw), Math.max(0, Math.abs(y - t.y) - t.hh));

const PLAYER_BOX_W = 0.75, PLAYER_BOX_H = 0.75;
const P = {
  isPlayer: true, x: M.BASE.x, y: M.BASE.y, vx: 0, vy: 0, face: 1, drawn: false, lastMoveAt: -99,
  // the player's box is slimmer than the sprite; drawPlayer stands the sprite's feet on the box bottom
  get hw() { return spriteBox(S.species).hw * PLAYER_BOX_W; },
  get hh() { return spriteBox(S.species).hh * PLAYER_BOX_H; },
  cd: {}, ppWait: {}, cast: 0, castMove: null, castAng: 0, netCd: 0, hp: 0, stamina: 1, winded: false, // ppWait: s a move has sat at 0 PP
  act: null, locoT: 0, lean: 0, recharge: 0, fury: null, // act: the one-shot animation playing; lean: a charge's tilt; recharge: 하이드로캐논's rest
  // the abilities' state: charge (메가런처: a pulse move held), rampage (역린 / 난동부리기 running), empowered (승기: hit since
  // the last move), lastType (변환자재: the type last used), moxie (자기과신: when each stack runs out)
  charge: null, rampage: null, empowered: false, lastType: null, moxie: [],
  get level() { return S.level; },
  get stats() { return R.stats(sp(S.species), S.level, S.iv, S.ev); },
  get r() { return Math.max(this.hw, this.hh); },
};
P.hp = S.hp ?? P.stats.hp;

let wilds = [], shots = [], fx = [], numbers = [];
let needsReset = true, bossSpawned = {};
let faintedAt = 0; // performance.now() of a faint whose dark screen is up (0: none); the world holds still until a key or click
const paused = () => UI.talking() || Tribute.active() || !!faintedAt || Cutscene.active() || !!menu; // conversations, the scenes, the faint screen and the game menu stop the game
const blocked = () => !!menu || mapOpen || paused(); // menus and the map keep the world running but take the player's input
const piecesIn = z => S.treasures.filter(t => t.startsWith(z.id + '-')).length;
const bossGateOpen = z => !!S.keys[z.id]; // the boss room opens on the key made from the zone's pieces (baseGems)
const zoneById = id => M.ZONES.find(z => z.id === id);
// 보스전: stepping right into an open boss room starts it: the bosses come out and the door shuts (no way out, no 귀환)
// until every one of them is caught; fainting ends it too. arena = { zone, mons: [the bosses that came out] }
let arena = null;
// boss doors open with all of the zone's pieces (and shut behind the player for the fight), exit doors once the zone's
// bosses were offered and the next zone exists
const gateOpen = g => (g.kind === 'boss' ? bossGateOpen(zoneById(g.zone)) && arena?.zone !== g.zone : !!S.offered[g.zone] && !!zoneById(g.zone + 1));
// rooms are the bosses' alone: no other Pokemon spawns or swims into one (door rows included)
const inBossRoom = (b, x, y) => M.ZONES.some(z => {
  const r = z.bossRoom;
  return x + b.hw > r.x0 * M.T && x - b.hw < (r.x1 + 1) * M.T && y + b.hh > (r.y0 - 3) * M.T && y - b.hh < (r.y1 + 1) * M.T;
});
const solid = (tx, ty) => M.solid(tx, ty, gateOpen);
const zoneUnlocked = z => (z.id === 1 ? S.rank >= 1 : !!S.offered[z.id - 1]);

const fitBox = b => ({ hw: b.hw, hh: b.hh, r: Math.max(b.hw, b.hh), boxed: b.ready });
const scaledBox = (b, k) => ({ ...b, hw: b.hw * k, hh: b.hh * k });

function makeWild(key, level, x, y, opts = {}) {
  const s = sp(key);
  const iv = opts.iv ?? R.randomIV();
  const stats = R.stats(s, level, iv, undefined, opts.boss ? { ...R.BOSS_MULT[opts.zone], hp: R.BOSS_MULT[opts.zone].hp * (opts.share ?? 1) } : opts.mult);
  return {
    key, level, iv, shiny: opts.shiny ?? Math.random() < shinyOdds(opts.zone ?? 1), boss: !!opts.boss, keepOut: !opts.boss, share: opts.share ?? 1,
    police: !!opts.police, // 돌핀맨 (해양경찰): see updateWanted
    zone: opts.zone ?? 1, // (the fish farm counts as zone 1)
    x, y, vx: 0, vy: 0, scale: opts.scale ?? 1, ...fitBox(scaledBox(spriteBox(key, opts.shiny), opts.scale ?? 1)),
    stats, hp: stats.hp, temper: s.temper, motion: s.motion, move: s.move,
    state: opts.boss ? 'hostile' : 'calm', cd: opts.boss ? data.moves[s.move].cooldown + 0.6 : 0, cast: 0, castAng: 0, wanderT: 0, wx: 0, wy: 0,
    fainted: 0, netted: 0,
  };
}

// share of open water in the 7x7 square around a tile: high inside caverns, low in corridors
function openness(tx, ty) {
  let n = 0;
  for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) if (!solid(x, y)) n++;
  return n / 49;
}

function waterTileIn(x0, x1, y0, y1, needFloor, tries = 40, minOpen = 0, box = { hw: 6, hh: 6 }) {
  for (let i = 0; i < tries; i++) {
    const tx = x0 + Math.floor(Math.random() * (x1 - x0 + 1));
    let ty = y0 + Math.floor(Math.random() * (y1 - y0 + 1));
    if (solid(tx, ty) || M.ZONES.some(z => M.inRect(tx, ty, z.bossRoom))) continue;
    if (M.scene === 'main' && M.NPCS.some(n => Math.hypot(tx - n.x, ty - n.y) < NPC_CLEAR)) continue; // NPC chambers stay empty
    if (minOpen && openness(tx, ty) < minOpen) continue;
    if (needFloor) {
      while (ty < y1 && !solid(tx, ty + 1)) ty++;
      if (!solid(tx, ty + 1)) continue;
    }
    const x = tx * M.T + M.T / 2, y = needFloor ? (ty + 1) * M.T - box.hh - 0.5 : ty * M.T + M.T / 2;
    if (hitsTiles(box, x, y)) continue; // the whole sprite has to fit
    return { x, y };
  }
  return null;
}

// Every trip from the base re-rolls the wild population (GAME_DESIGN.md 6번).
function spawnWilds() {
  wilds = [];
  bossSpawned = {};
  if (M.scene === 'tutorial') {
    // step 1: four 잉어킹 (three to sell, one spare); step 2 (farmStep2): only FARM_FOE, two of them, after the player on
    // sight, so the first attack to read and dodge comes here
    const pool = M.TUTORIAL_POOL, two = farmStep2();
    for (let i = 0; i < (two ? 2 : 4); i++) {
      const p = waterTileIn(pool.x0 + 1, pool.x1 - 1, 3, pool.y1, false);
      if (!p) continue;
      const w = makeWild(two ? FARM_FOE : 'magikarp', two ? FARM_LEVEL[0] : rand(FARM_LEVEL[0], FARM_LEVEL[1]), p.x, p.y);
      if (two) w.temper = 'aggro'; // (a 콘치 is calm till hit in the sea; this one goes for the player on sight, every time)
      wilds.push(w);
    }
    return;
  }
  for (const z of M.ZONES) {
    if (!zoneUnlocked(z)) continue;
    // the first trip into a shinyGift zone (zone 2) guarantees one shiny: a random spawn slot (or the next one that finds water) gets it
    let giftAt = !z.shinyGift || S.shinyGift[z.id] ? Infinity : Math.floor(Math.random() * z.areaCounts.reduce((a, b) => a + b, 0)), slot = 0;
    data.zones[z.id].forEach((area, i) => {
      const r0 = Math.max(z.y0, Math.floor(area.depth[0] / M.M_PER_TILE)) + (i === 0 ? 6 : 0);
      const r1 = Math.min(z.y1, Math.floor(area.depth[1] / M.M_PER_TILE) - 1);
      // the taken posts' species turn up BOARD_EXTRA more each (a level condition: down where it is met, at least at it)
      const extra = takenPosts().filter(q => q.zone === z.id && q.area === i).flatMap(q => Array(Board.BOARD_EXTRA).fill(q));
      for (let n = 0; n < z.areaCounts[i] + extra.length; n++) {
        const post = extra[n - z.areaCounts[i]], lv = post?.cond?.lv;
        // the area's west / middle / east thirds take turns, each with its own species (a post's Pokemon: where it lives)
        const band = post ? Board.bandOf(area, post.key) : n % 3, bx = bandX(z, band);
        const key = post ? post.key : pickByRarity(area.bands?.[band] ?? area.species, CRAWL_WEIGHT[z.id] ?? 1);
        const top = lv ? Math.min(r1, Math.floor((area.depth[0] + (lv - area.level[0]) / (area.level[1] - area.level[0]) * (area.depth[1] - area.depth[0])) / M.M_PER_TILE)) : r0;
        // in the trench maze, Pokemon live in the caverns rather than the corridors
        const shiny = slot++ >= giftAt || Math.random() < shinyOdds(z.id);
        const p = waterTileIn(bx[0], bx[1], Math.max(r0, top), r1, sp(key).motion !== 'swim', z.terrain.kind === 'maze' ? 150 : 40, z.terrain.kind === 'maze' ? 0.85 : 0, spriteBox(key, shiny));
        if (!p) continue;
        wilds.push(makeWild(key, Math.max(levelAt(z, p.y), lv ?? 0), p.x, p.y, { zone: z.id, shiny }));
        if (shiny && giftAt !== Infinity) { giftAt = Infinity; S.shinyGift[z.id] = true; save(); }
      }
    });
    spawnAlpha(z);
  }
  policeCd = 5; mightyT = 0; // the trip's 돌핀맨 turns up a little after setting out (updateWanted)
}
// the wild level at a point of a zone: its area's range, higher the deeper it is
function levelAt(z, y) {
  const areas = data.zones[z.id], here = M.depthOf(y), a = areas.find(a => here < a.depth[1]) ?? areas[areas.length - 1];
  const t = clamp((here - a.depth[0]) / (a.depth[1] - a.depth[0]), 0, 1);
  return clamp(Math.round(a.level[0] + t * (a.level[1] - a.level[0]) + rand(-1, 1)), a.level[0], a.level[1]);
}

// Rarer tiers spawn less often (RARITY weights).
const CRAWL_WEIGHT = { 1: 0.25 }; // per zone (GAME_DESIGN.md 6번)
// crawl: how much a Pokemon that walks the floor counts against one that swims (zone 1's floor was crowded, its water empty)
// a zone's columns in thirds: west (0), middle (1), east (2); -1 is the whole width
function bandX(z, band) {
  const x0 = z.xMin, x1 = M.COLS - 2, w = (x1 - x0 + 1) / 3;
  return band < 0 ? [x0, x1] : [Math.round(x0 + w * band), Math.round(x0 + w * (band + 1)) - 1];
}
function pickByRarity(keys, crawl = 1) {
  const weight = k => R.RARITY[sp(k).rarity].weight * (sp(k).motion === 'swim' ? 1 : crawl);
  const total = keys.reduce((n, k) => n + weight(k), 0);
  let roll = Math.random() * total;
  for (const k of keys) if ((roll -= weight(k)) < 0) return k;
  return keys[keys.length - 1];
}

function heldCount(key) {
  return [...S.bag, ...S.tribute, ...(S.tiedNet?.mons ?? [])].filter(m => m.key === key).length;
}
// bosses brought home wait in the tribute slots (S.tribute), not in the net
const storedCount = key => [...S.bag, ...S.tribute].filter(m => m.key === key).length;
const zoneBossesHeld = (z, inBagOnly) =>
  z.bosses.every(([key, n]) => (inBagOnly ? storedCount(key) : heldCount(key)) >= n);
const bossNames = z => z.bosses.map(([key, n]) => sp(key).name + ' ' + n + '마리').join('와 ');
// 조각 탐지: the zone being worked on (its pieces not all found yet), how many are missing, how many of those are marked,
// and the index of the next one to mark (undefined once all are)
function pieceHintFor() {
  const z = goalZone();
  if (!z || S.rank < 1 || !analysed(z) || bossGateOpen(z)) return null;
  const missing = z.treasures.map((t, i) => i).filter(i => !S.treasures.includes(z.id + '-' + i));
  const marked = missing.filter(i => S.pieceHints[z.id + '-' + i]);
  return { z, missing: missing.length, marked: marked.length, next: missing.find(i => !S.pieceHints[z.id + '-' + i]) };
}

// ponytail: boss patterns are still 🔴미정 in the design doc, so bosses reuse the aggressive wild AI with boosted stats.
// The bosses not caught yet come out in the middle of the room and the door shuts behind the player (보스전).
// bosses are drawn bigger than their real height says: 마나피 clearly the leader of its 피오네
const BOSS_SCALE = { manaphy: 2.8, phione: 1.7, lugia: 1.35, kyogre: 1.3 };
function startBossFight(z) {
  bossSpawned[z.id] = true;
  tip('boss');
  const r = z.bossRoom, cx = ((r.x0 + r.x1) / 2) * M.T, cy = ((r.y0 + r.y1) / 2) * M.T, mons = [];
  let i = 0;
  for (const [key, n, share] of z.bosses)
    for (let k = heldCount(key); k < n; k++, i++)
      mons.push(makeWild(key, z.bossLevel, cx + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 70, cy, { boss: true, zone: z.id, share, scale: BOSS_SCALE[key] }));
  for (const w of mons) if (BOSS_AI[w.key]) Object.assign(w, { ai: BOSS_AI[w.key], cd: 1.2 });
  if (!mons.length) return; // all caught already (waiting in a tied net, say): nothing to fight, the door stays open
  wilds.push(...mons);
  arena = { zone: z.id, mons };
  if (z.id === 1) startSquad(); // 마나피 and its 피오네 fight as one formation
  shake = Math.max(shake, 5); UI.flash('slam');
  toast(`쾅! 문이 닫혔다. ${josa(bossNames(z), '을/를')} 모두 포획하라`, 'warn');
}
// the fight is over once every boss of the zone is held (caught now or before): the door opens again
function endBossFightIfWon() {
  if (!arena || !zoneBossesHeld(zoneById(arena.zone))) return false;
  arena = null;
  return true;
}

// ---------- 루기아·가이오가의 방 ----------
// their own patterns (BOSS_AI, played through alphaAct like a 우두머리's), the room's own things (hazards: vortex
// pillars, expanding rings, lightning marks, the tidal wall; 루기아's current) and a harder phase low on HP
const BOSS_AI = {
  lugia: { patterns: ['aero', 'twister', 'dive'], range: 420, keep: 130, gap: 1.8, phase: { at: 0.5, windup: 0.85, cd: 0.8, text: '루기아가 폭풍을 일으킨다! 해류가 거칠어졌다' } },
  kyogre: { patterns: ['pulse', 'surf', 'thunder', 'tidal'], range: 460, keep: 110, gap: 2.2, phase: { at: 0.5, windup: 0.85, cd: 0.8, text: '가이오가가 원시회귀했다! 바다가 폭주한다' } },
};
const ringGap = h => Math.max(0.4, RING_GAP_PX / Math.max(h.r, 1)); // half the gap, as an angle: always RING_GAP_PX wide on each side
const RING_GAP_PX = 40;
let hazards = [], current = null; // current: the flow in 루기아's room { ang, t, flip }
const roomPx = () => { const r = zoneById(arena.zone).bossRoom; return { x0: r.x0 * M.T, x1: (r.x1 + 1) * M.T, y0: r.y0 * M.T, y1: (r.y1 + 1) * M.T }; };
const roomCentre = () => { const b = roomPx(); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; };
const roomRadius = () => { const b = roomPx(); return (b.x1 - b.x0) / 2; };
function updateBossRoom(dt) {
  if (!arena) { if (hazards || current) for (const w of wilds) if (w.ai) { w.hide = false; w.dash = null; } hazards = []; current = null; return; }
  for (const w of arena.mons) if (w.ai && !w.phased && !w.fainted && !w.netted && w.hp < w.stats.hp * w.ai.phase.at) { // into the hard phase
    w.phased = true; w.cd = 0.3; shake = Math.max(shake, 8); UI.flash('slam'); toast(w.ai.phase.text, 'warn'); SFX.play('channel');
    fx.push({ kind: 'quake', x: w.x, y: w.y, color: w.key === 'kyogre' ? '#ff6050' : '#c8e0ff', t: 0, dur: 0.8, reach: 90, follow: w });
  }
  for (const w of arena.mons) if (w.dazed > 0) w.dazed -= dt;
  const lugia = arena.zone === 2 && arena.mons.find(w => w.key === 'lugia' && wilds.includes(w) && !w.fainted && !w.netted);
  if (lugia) { // the flow in its room: turned by a beat of its wings, more often in the storm
    if (!current || (current.t -= dt) <= 0) {
      current = { ang: Math.random() * 7, t: lugia.phased ? 3 : 6, flip: 0.6 };
      fx.push({ kind: 'sweep', x: lugia.x, y: lugia.y, color: TYPE_COLOR.flying, t: 0, dur: 0.4, reach: 80, follow: lugia }); SFX.play('wave', 0.6);
    }
    current.flip = Math.max(0, current.flip - dt);
    const f = (lugia.phased ? 95 : 60) * dt; P.vx += Math.cos(current.ang) * f; P.vy += Math.sin(current.ang) * f;
  } else current = null;
  for (const h of hazards) {
    const w = h.owner;
    if (h.kind === 'vortex') {
      h.t += dt; if (h.t < h.warm) continue;
      const dx = h.x - P.x, dy = h.y - P.y, d = Math.hypot(dx, dy) || 1;
      if (d < h.r) { const f = 500 * (1 - d / h.r) * dt; P.vx += dx / d * f; P.vy += dy / d * f; }
      if (d < 16 && (h.tick = (h.tick ?? 0) - dt) <= 0) { h.tick = 0.6; hit(w, P, ALPHA_MOVES.twister); }
      h.dead = h.t > h.warm + h.life;
    } else if (h.kind === 'ring') {
      if ((h.delay -= dt) > 0) continue;
      h.r += h.v * dt;
      const d = Math.hypot(P.x - h.x, P.y - h.y), a = Math.atan2(P.y - h.y, P.x - h.x);
      const inGap = h.gaps.some(g => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < ringGap(h));
      if (!h.hitDone && Math.abs(d - h.r) < h.width + P.hw && !inGap) { h.hitDone = true; hit(w, P, ALPHA_MOVES.pulse); shove(a, 220); }
      h.dead = h.r > roomRadius() * 2.2;
    } else if (h.kind === 'mark') {
      h.t += dt;
      if (h.t >= h.max) {
        h.dead = true; alphaArea(w, h.x, h.y, h.r, h.move, 0);
        fx.push({ kind: 'ray', x: h.x, y: h.y - 220, ang: Math.PI / 2, len: 220, half: 3, color: '#fff7a0', t: 0, dur: 0.25 });
        fx.push({ kind: 'quake', x: h.x, y: h.y, color: TYPE_COLOR.electric, t: 0, dur: 0.3, reach: h.r }); shake = Math.max(shake, 3); SFX.play('snipe', 0.7);
      }
    } else if (h.kind === 'wave') {
      if ((h.delay -= dt) > 0) continue;
      h.x += h.dir * h.v * dt;
      if (!h.hitDone && Math.abs(P.x - h.x) < 12 + P.hw && Math.abs(P.y - h.gapY) > h.gapHalf - P.hh) { h.hitDone = true; hit(w, P, ALPHA_MOVES.tidal); shove(h.dir > 0 ? 0 : Math.PI, 360); }
      h.dead = h.dir > 0 ? h.x > h.b.x1 + 20 : h.x < h.b.x0 - 20;
    }
  }
  hazards = hazards.filter(h => !h.dead && wilds.includes(h.owner) && !h.owner.fainted && !h.owner.netted);
}
function drawBossRoom(ox, oy, now) {
  if (!arena) return;
  ctx.save();
  if (current) { // the flow: faint streaks drifting along it
    const b = roomPx(), W0 = b.x1 - b.x0, H0 = b.y1 - b.y0, c = Math.cos(current.ang), sn = Math.sin(current.ang), mod = (v, m) => ((v % m) + m) % m;
    ctx.strokeStyle = `rgba(220, 240, 255, ${0.2 + current.flip * 0.5})`; ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const run = now * 70 + i * 37;
      const x = b.x0 + mod((i * 0.618 % 1) * W0 + c * run, W0), y = b.y0 + mod((i * 0.271 % 1) * H0 + sn * run, H0);
      ctx.beginPath(); ctx.moveTo(x - ox, y - oy); ctx.lineTo(x - ox + c * 16, y - oy + sn * 16); ctx.stroke();
    }
  }
  for (const w of arena.mons) {
    if (w.fainted || w.netted || !wilds.includes(w)) continue;
    if (w.phased && w.key === 'kyogre') { // 원시회귀: a red glow round it
      ctx.fillStyle = `rgba(255, 70, 50, ${0.16 + 0.08 * Math.sin(now * 6)})`; ctx.beginPath(); ctx.arc(w.x - ox, w.y - oy, Math.max(w.hw, w.hh) + 18, 0, 7); ctx.fill();
    }
    if (w.dazed > 0) { ctx.fillStyle = '#ffe060'; for (let i = 0; i < 3; i++) { const a = now * 5 + i * 2.1; ctx.fillRect(w.x - ox + Math.cos(a) * 16 - 2, w.y - oy - w.hh - 8 + Math.sin(a) * 4 - 2, 4, 4); } }
  }
  for (const h of hazards) {
    const x = h.x - ox, y = h.y - oy;
    if (h.kind === 'vortex') {
      const on = h.t >= h.warm, k = on ? 1 : h.t / h.warm;
      ctx.strokeStyle = on ? 'rgba(210, 235, 255, 0.75)' : 'rgba(255, 60, 80, 0.6)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x, y, (8 + i * 9) * k, now * (4 + i), now * (4 + i) + 4.2); ctx.stroke(); }
      if (on) { ctx.fillStyle = 'rgba(200, 230, 255, 0.08)'; ctx.beginPath(); ctx.arc(x, y, h.r, 0, 7); ctx.fill(); }
    } else if (h.kind === 'ring') {
      const R0 = Math.max(h.r, 1), half = ringGap(h), gs = [...h.gaps].sort((p, q) => p - q);
      if (h.delay > 0) { // still to come: where its gaps will be, as green lanes from its middle
        ctx.fillStyle = 'rgba(80, 255, 140, 0.12)';
        for (const g of gs) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 150, g - 0.3, g + 0.3); ctx.closePath(); ctx.fill(); }
        continue;
      }
      for (let i = 0; i < gs.length; i++) { // the ring between the gaps
        const a0 = gs[i] + half, a1 = (i + 1 < gs.length ? gs[i + 1] : gs[0] + Math.PI * 2) - half;
        ctx.beginPath(); ctx.arc(x, y, R0, a0, a1);
        ctx.strokeStyle = 'rgba(90, 170, 255, 0.8)'; ctx.lineWidth = h.width * 2; ctx.stroke();
        ctx.strokeStyle = 'rgba(230, 245, 255, 0.9)'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80, 255, 140, 0.9)'; // the gaps' edges marked bright green, and the gap itself tinted
      for (const g of gs) {
        for (const e of [g - half, g + half]) { ctx.save(); ctx.translate(x + Math.cos(e) * R0, y + Math.sin(e) * R0); ctx.rotate(e); ctx.fillRect(-h.width - 2, -2, h.width * 2 + 4, 4); ctx.restore(); }
        ctx.beginPath(); ctx.arc(x, y, R0, g - half, g + half); ctx.strokeStyle = 'rgba(80, 255, 140, 0.25)'; ctx.lineWidth = h.width * 2; ctx.stroke();
      }
    } else if (h.kind === 'mark') {
      const k = h.t / h.max, blink = k > 0.7 && Math.floor(now * 20) % 2;
      ctx.fillStyle = 'rgba(255, 230, 60, 0.14)'; ctx.beginPath(); ctx.arc(x, y, h.r, 0, 7); ctx.fill();
      ctx.fillStyle = blink ? 'rgba(255, 255, 220, 0.45)' : 'rgba(255, 220, 60, 0.3)'; ctx.beginPath(); ctx.arc(x, y, h.r * k, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 230, 80, 0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, h.r, 0, 7); ctx.stroke();
    } else if (h.kind === 'wave') {
      const b = h.b, top = b.y0 - oy, gy0 = h.gapY - h.gapHalf - oy, gy1 = h.gapY + h.gapHalf - oy, bot = b.y1 - oy;
      if (h.delay > 0) { // the warning: the side it comes from in red, the safe gap in green
        const wx = (h.dir > 0 ? b.x0 : b.x1 - 24) - ox; ctx.fillStyle = 'rgba(255, 40, 60, 0.28)'; ctx.fillRect(wx, top, 24, gy0 - top); ctx.fillRect(wx, gy1, 24, bot - gy1);
        ctx.fillStyle = 'rgba(80, 255, 140, 0.3)'; ctx.fillRect(b.x0 - ox, gy0, b.x1 - b.x0, gy1 - gy0);
      } else {
        const wx = x - 12; ctx.fillStyle = 'rgba(40, 120, 255, 0.6)'; ctx.fillRect(wx, top, 24, gy0 - top); ctx.fillRect(wx, gy1, 24, bot - gy1);
        const fx0 = h.dir > 0 ? wx + 18 : wx; ctx.fillStyle = 'rgba(230, 245, 255, 0.85)'; ctx.fillRect(fx0, top, 6, gy0 - top); ctx.fillRect(fx0, gy1, 6, bot - gy1);
      }
    }
  }
  ctx.restore();
}

// ---------- 마나피 편대 (zone 1's boss fight) ----------
// 마나피 and its three 피오네 fight as one formation: the squad picks the formation and the pattern, each member swims to
// its own slot in it (never all on one spot). Three patterns, never the same twice running:
//   surround  spread out round the player (wide) and fire at it from every side, twice
//   volley    the base formation (mid) round the room's middle: they take turns, interlocking, for VOLLEY_S without a break
//   beam      all gathered close (tight), power drawn in, then one thick beam for BEAM_S that keeps turning to the player
const SQUAD_MOVES = { bubble: { name: '거품 세례', type: 'water', power: 45 }, volley: { name: '물대포 연사', type: 'water', power: 28 }, beam: { name: '합동 물빔', type: 'water', power: 26 } };
const FORM = { mid: 70, wide: 110, tight: 36 }; // px from the formation's centre to each slot
const VOLLEY_S = 5, BEAM_S = 5, SQUAD_TURN = 0.7; // s, s, rad/s the beam can turn after the player
let squad = null; // { form, rot, t, pattern, phase, last, ... }
const squadOn = () => !!(squad && arena?.zone === 1);
const squadMembers = () => (arena?.mons ?? []).filter(m => wilds.includes(m) && !m.fainted && !m.netted);
function squadCentre() { const r = zoneById(1).bossRoom; return { x: ((r.x0 + r.x1) / 2 + 0.5) * M.T, y: ((r.y0 + r.y1) / 2 + 0.5) * M.T }; }
function squadShot(w, ang, speed, key, r = 5) {
  const m = SQUAD_MOVES[key];
  shots.push({ x: w.x + Math.cos(ang) * w.hw, y: w.y + Math.sin(ang) * w.hh, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ang, ttl: 1.6, r,
    owner: w, move: m, color: TYPE_COLOR.water, shape: 'orb', hitSet: new Set() });
}
const SQUAD_PATTERNS = {
  surround: {
    start() { squad.form = 'wide'; squad.phase = 'move'; squad.t = 1.4; squad.rounds = 2; },
    tick(dt, ms) {
      if ((squad.t -= dt) > 0) return;
      if (squad.phase === 'move' || squad.phase === 'gap') { // everyone aims at the player: the lines show where it will come from
        squad.phase = 'aim'; squad.t = 0.8;
        for (const w of ms) { w.castAng = Math.atan2(P.y - w.y, P.x - w.x); w.cast = w.castMax = 0.8; w.tele = { kind: 'line', follow: true, ang: w.castAng, len: Math.hypot(P.x - w.x, P.y - w.y) + 30, half: 5 }; }
      } else if (squad.phase === 'aim') { // and all fire at once
        for (const w of ms) { w.tele = null; for (const da of [-0.12, 0, 0.12]) squadShot(w, w.castAng + da, 230, 'bubble'); }
        SFX.play('orb');
        if (--squad.rounds > 0) { squad.phase = 'gap'; squad.t = 0.6; } else squadRest(1.6);
      }
    },
  },
  volley: {
    start() { squad.form = 'mid'; squad.phase = 'set'; squad.t = 1; squad.k = 0; },
    tick(dt, ms) {
      squad.t -= dt;
      if (squad.phase === 'set') { if (squad.t <= 0) { squad.phase = 'fire'; squad.t = VOLLEY_S; squad.next = 0; } return; }
      if ((squad.next -= dt) <= 0) { // the next one in turn fires, so the shots never stop
        const w = ms[squad.k++ % ms.length]; squad.next = 0.16;
        squadShot(w, Math.atan2(P.y - w.y, P.x - w.x) + (Math.random() - 0.5) * 0.12, 250, 'volley', 4); SFX.play('stream', 0.6);
      }
      if (squad.t <= 0) squadRest(1.4);
    },
  },
  beam: {
    start() { squad.form = 'tight'; squad.phase = 'gather'; squad.t = 1.8; squad.beamAng = Math.atan2(P.y - squadCentre().y, P.x - squadCentre().x); },
    tick(dt, ms) {
      squad.t -= dt; const c = squadCentre(), want = Math.atan2(P.y - c.y, P.x - c.x);
      let da = ((want - squad.beamAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      squad.beamAng += clamp(da, -SQUAD_TURN * dt, SQUAD_TURN * dt); // it follows the player, slowly enough to be outswum
      if (squad.phase === 'gather') { if (squad.t <= 0) { squad.phase = 'fire'; squad.t = BEAM_S; squad.tick = 0; shake = Math.max(shake, 5); SFX.play('channel'); } return; }
      const cos = Math.cos(squad.beamAng), sin = Math.sin(squad.beamAng); squad.beamLen = rayLength(c.x, c.y, cos, sin, 360);
      if ((squad.tick -= dt) <= 0) { squad.tick = 0.25; hitLine(ms[0], c.x, c.y, cos, sin, squad.beamLen, 11, SQUAD_MOVES.beam); }
      shake = Math.max(shake, 1.5);
      if (squad.t <= 0) squadRest(2.2); // spent: the longest opening
    },
  },
};
function squadRest(s) { squad.pattern = null; squad.phase = null; squad.form = 'mid'; squad.t = s; }
function startSquad() { squad = { form: 'mid', rot: 0, t: 1.6, pattern: null, last: null }; }
function updateSquad(dt) {
  if (!squadOn()) { squad = null; return; }
  const ms = squadMembers(); if (!ms.length) return;
  squad.rot += dt * (squad.form === 'wide' ? 0.5 : 0.35);
  const c = squad.form === 'wide' ? P : squadCentre(), r = FORM[squad.form];
  ms.forEach((w, i) => { const a = squad.rot + i * Math.PI * 2 / ms.length; w.slot = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r * 0.85 }; });
  if (squad.pattern) return SQUAD_PATTERNS[squad.pattern].tick(dt, ms);
  if ((squad.t -= dt) > 0) return;
  const pool = Object.keys(SQUAD_PATTERNS).filter(k => k !== squad.last);
  squad.pattern = squad.last = pool[Math.floor(Math.random() * pool.length)];
  SQUAD_PATTERNS[squad.pattern].start();
}
// a member's turn: swim to its slot (no pattern of its own); its aim line counts down with the squad's
function squadMove(w, dt) {
  if (w.cast > 0) w.cast -= dt;
  const dx = w.slot.x - w.x, dy = w.slot.y - w.y, d = Math.hypot(dx, dy);
  if (d > 3) steer(w, Math.atan2(dy, dx), Math.min(220, 30 + d * 3), dt);
  w.vx *= 0.9; w.vy *= 0.9;
}
// the beam and the power drawn in for it, from the formation's middle
function drawSquad(ox, oy, now) {
  if (!squadOn() || squad.pattern !== 'beam') return;
  const c = squadCentre(), x = c.x - ox, y = c.y - oy;
  ctx.save();
  if (squad.phase === 'gather') {
    const k = 1 - squad.t / 1.8; ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const r = 70 * (1 - ((k * 2 + i / 4) % 1)); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
    ctx.translate(x, y); ctx.rotate(squad.beamAng); ctx.fillStyle = 'rgba(255, 40, 60, 0.18)'; ctx.fillRect(0, -11, 360, 22); // where it will go
  } else {
    ctx.translate(x, y); ctx.rotate(squad.beamAng); const L = squad.beamLen ?? 300, j = Math.sin(now * 40) * 1.5;
    ctx.fillStyle = 'rgba(40, 110, 255, 0.55)'; ctx.fillRect(0, -13 - j, L, 26 + 2 * j);
    ctx.fillStyle = '#5ab4ff'; ctx.fillRect(0, -8, L, 16); ctx.fillStyle = '#dff4ff'; ctx.fillRect(0, -3, L, 6);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 12 + j * 2, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---------- 수배도 and 해양경찰 (돌핀맨; GAME_DESIGN.md 3번) ----------
const POLICE = 'palafin', MIGHTY = 'palafin-hero';
const wantedStars = () => Math.floor(S.wanted + 1e-6);
let policeCd = 0, mightyT = 0; // s until the next 돌핀맨 comes; s until the 마이티폼 is back after one vanished
function addWanted(n) {
  if (M.scene !== 'main') return;
  const before = wantedStars();
  S.wanted = Math.min(R.WANTED_MAX, S.wanted + n); S.wantedAt = S.playTime;
  const now = wantedStars();
  if (now > before) tip('wanted');
  if (now > before) toast(`수배도 ★${now} · ` + (now >= R.WANTED_MIGHTY ? '돌핀맨을 1분 안에 처리하지 않으면 마이티폼이 온다' : now >= R.WANTED_CALL ? '돌핀맨이 출동한다' : '돌핀맨이 보면 쫓아온다'), 'warn');
}
// the stars wear off. Out at sea there is one 돌핀맨 at a time, near the player: caught or gone, the next comes
// POLICE_RESPAWN s later (calm on patrol, or already after the player from WANTED_CALL). From WANTED_MIGHTY, a 돌핀맨
// left out for MIGHTY_AFTER s vanishes and comes back MIGHTY_RETURN s later as the 마이티폼 (still the only one out).
function updateWanted(dt) {
  if (S.playTime - S.wantedAt > R.WANTED_HOLD) S.wanted = Math.max(0, S.wanted - dt * R.WANTED_DECAY * (atBase() ? 2 : 1));
  if (M.scene !== 'main' || arena || needsReset || P.y < 40) return;
  const stars = wantedStars(), cop = wilds.find(w => w.police);
  if (mightyT > 0) { // the 마이티폼 on its way
    if ((mightyT -= dt) <= 0 && callPolice(MIGHTY)) { toast('마이티폼 돌핀맨이 체포하러 왔다!', 'warn'); UI.flash('slam'); shake = Math.max(shake, 5); }
    else if (mightyT <= 0) mightyT = 0.5; // no water clear around the player yet: soon
    return;
  }
  if (!cop) {
    if ((policeCd -= dt) > 0) return;
    const w = callPolice(POLICE, stars >= R.WANTED_CALL);
    policeCd = w ? R.POLICE_RESPAWN : 1;
    return;
  }
  policeCd = R.POLICE_RESPAWN; // counts from when it is gone
  if (cop.key !== POLICE || cop.fainted || cop.netted) return;
  cop.outT = stars >= R.WANTED_MIGHTY ? (cop.outT ?? 0) + dt : 0;
  if (cop.outT >= R.MIGHTY_AFTER) { // left alone too long: it goes, and the 마이티폼 is coming
    wilds.splice(wilds.indexOf(cop), 1);
    fx.push({ kind: 'bigsplash', x: cop.x, y: cop.y, reach: 26, t: 0, dur: 0.6, seed: seed() });
    toast('돌핀맨이 사라졌다… 무언가 온다', 'warn');
    mightyT = R.MIGHTY_RETURN;
  }
}
// a 돌핀맨 coming in from out of sight (the 마이티폼 always after the player, a plain one when chase says so)
function callPolice(key, chase = true) {
  const tx = Math.floor(P.x / M.T), ty = Math.floor(P.y / M.T), z = M.zoneOfRow(ty);
  for (let i = 0; i < 12; i++) {
    const p = waterTileIn(Math.max(z.xMin, tx - 16), Math.min(M.COLS - 2, tx + 16), Math.max(z.y0 + 2, ty - 12), Math.min(z.y1, ty + 12), false, 20, 0, spriteBox(key, false));
    if (!p || Math.hypot(p.x - P.x, p.y - P.y) < 150) continue;
    const mighty = key === MIGHTY, lv = levelAt(z, p.y);
    const w = makeWild(key, mighty ? Math.min(100, Math.max(lv, S.level) + 3) : clamp(S.level + rand(-1, 1), 1, 100), p.x, p.y, { zone: z.id, police: true, mult: mighty ? R.MIGHTY_MULT : undefined }); // the plain one: the player's level, give or take one
    if (mighty || chase) becomeHostile(w);
    wilds.push(w);
    return w;
  }
  return null;
}

// ---------- 게시판 (Board) ----------
const goalZone = () => M.ZONES.find(z => !S.offered[z.id]);
// ---------- 개인 업무 (GAME_DESIGN.md 11번) ----------
// Each zone's own line of work, one step at a time, on the board's first card (it is not a post): solve TASK_POSTS
// posts, catch the zone's 우두머리 and report it, TASK_POSTS posts more, bring back one strange gem (analysed by the
// 연구부: it belongs to the zone's boss), bring them all back (made into the boss room's key), catch the boss and offer it.
// S.task[zone] = { step, from } (from: S.postsDone when the step began)
const TASK_POSTS = 3;
const T = { POSTS1: 0, ALPHA: 1, POSTS2: 2, PIECE: 3, PIECES: 4, BOSS: 5, DONE: 6 };
function taskOf(z) {
  if (!S.task[z.id]) { // a save from before the 개인 업무: as far as its 본사 지시 had come
    const all = piecesIn(z) >= z.treasures.length, step = S.offered[z.id] ? T.DONE : !S.board.main[z.id] ? T.POSTS1 : all ? T.BOSS : piecesIn(z) ? T.PIECES : T.PIECE;
    if (step >= T.BOSS) S.keys[z.id] = true; if (step >= T.PIECES) S.gemSent[z.id] = true;
    S.task[z.id] = { step, from: S.postsDone };
  }
  return S.task[z.id];
}
const piecesOut = z => zoneUnlocked(z); // a zone's pieces are out there from the start (just strange gems, till analysed)
const analysed = z => taskOf(z).step >= T.PIECES; // the gem appraised: its pieces have a name, 조각 탐지 can look for them
function nextStep(z, line) {
  const t = taskOf(z);
  t.step++; t.from = S.postsDone;
  if (t.step === T.PIECE && S.gemSent[z.id]) { t.step = T.PIECES; line = TASK_LINES[z.id].appraise; } // a gem already handed in: its analysis is back now
  save(); if (t.step === T.PIECES) tip('pieces');
  toast(`개인 업무 · ${taskLabel(z, t.step)}`, 'good');
  if (line) mentorSays(line);
}
// what the current step asks, one line
function taskLabel(z, step = taskOf(z).step) {
  const t = taskOf(z), a = ALPHAS[z.id];
  return [`게시판 공고 ${TASK_POSTS}개 해결`, `우두머리 ${sp(a.key).name} 포획`, `게시판 공고 ${TASK_POSTS}개 해결`, '수상한 보석 하나 가져오기',
    `${z.piece} ${z.treasures.length}개 모아 오기`, `${bossNames(z)} 포획해 상납`, '완료'][step] ?? '';
}
const taskPosts = z => Math.min(TASK_POSTS, S.postsDone - taskOf(z).from);
// something on the card to do at the base: report the 우두머리, offer the bosses (gems are handed in on arrival, baseGems)
function taskReady(z) {
  const step = taskOf(z).step;
  return step === T.ALPHA ? !!S.alphas[z.id] : step === T.BOSS ? zoneBossesHeld(z, true) : false;
}
// 나옹's lines as the steps move on (the 우두머리's own lines are its intro and outro in ALPHAS)
const TASK_LINES = {
  1: { alpha: '공고 처리 잘했다옹. 다음 개인 업무다옹. 연안에서 약어리 떼가 어부들 그물을 찢고 다닌다옹. 무리의 우두머리를 잡아 오라옹. 굴은 지도(F)에 표시해 뒀다옹.',
    posts2: '다음은 다시 게시판 공고 3개다옹. 다른 부서에 얼굴 좀 팔아 두라옹.',
    piece: '요즘 연안 바닥에서 빨갛게 빛나는 보석이 나온다는 소문이다옹. 하나만 주워 와 보라옹. 연구부에 분석을 맡겨 보겠다옹.',
    appraise: '분석 결과가 나왔다옹. 이 빨간 조각, 바다의 왕자 마나피가 남긴 거라옹. 조각을 전부 모아 오면 연구부가 마나피가 숨은 방의 열쇠로 만들어 준다옹. 남은 조각도 다 모아 오라옹. 마나피는 보스께 바친다옹.' },
  2: { alpha: '심해 일도 손에 익었냐옹. 침몰선에서 우리 잠수정 셋을 끌고 들어간 닻이 있다옹. 타타륜이다옹. 잡아 오라옹. 굴은 지도에 표시해 뒀다옹.',
    posts2: '다음은 다시 게시판 공고 3개다옹. 심해 부서들이 일손이 모자란다옹.',
    piece: '심해 잠수정이 초록빛 보석을 봤다고 한다옹. 하나 가져와 보라옹.',
    appraise: '분석 결과다옹. 이 초록 조각에서 루기아의 깃털과 같은 파장이 나온다옹. 조각을 다 모아 오면 루기아가 잠든 방의 열쇠를 만들어 준다옹. 전부 모아 오라옹.' },
  3: { alpha: '해구까지 왔냐옹. 분노로 몸이 붉게 물든 갸라도스가 있다옹. 보스께서 직접 보고 싶어 하신다옹. 잡아 오라옹.',
    posts2: '마지막으로 공고 3개만 더 처리하라옹. 해구 부서는 다들 겁먹었다옹.',
    piece: '해구 바닥에서 파랗게 빛나는 보석이 발견됐다옹. 하나 가져와 보라옹.',
    appraise: '분석 결과다옹. 이 파란 조각, 바다를 넓혔다는 가이오가의 것이다옹. 전부 모아 오면 가이오가가 잠든 곳의 열쇠를 만들어 준다옹. 이게 마지막 업무다옹.' },
};
const takenPosts = () => S.board.posts.filter(p => p.taken);
// how far a taken post has come: the ones brought down, or the ones in the net that it would take
const postHave = p => Math.min(p.n, p.kind === 'hunt' ? p.got : S.bag.filter(m => Board.qualifies(p, m)).length);
// something to do on the board (E at the base opens it then): a 지시 to take or to report, a post ready to turn in
const boardDue = () => S.rank >= 1 && (!!goalZone() && taskReady(goalZone()) || takenPosts().some(p => postHave(p) >= p.n)
  || Object.keys(ALPHAS).some(z => S.alphas[z] && !S.alphaPaid[z]));
function refreshBoard() { if (S.rank >= 1) Board.refresh(S.board, data, M.ZONES.filter(zoneUnlocked).map(z => z.id), S.caught); }

// ---------- input ----------
const keys = {};
const HOLD_STEP_MS = 220; // a held key moves a conversation on at most this often
let holdAt = 0;
let jumpQueued = false;
const mouse = { x: W / 2, y: H / 2, btn: [false, false, false] };
addEventListener('keydown', e => {
  if (!SLOT) return; // the title screen handles its own keys
  if (Cutscene.active()) { e.preventDefault(); if (e.code === 'Escape') Cutscene.skip(); return; } // a cutscene takes every key; Esc skips it
  if (faintedAt) { e.preventDefault(); if (!e.repeat) wakeAtBase(); return; }
  if (e.repeat) { // holding Enter or Space fast-forwards a conversation and keeps answering (e.g. buying again)
    if ((e.code === 'Enter' || e.code === 'Space') && UI.talking()) {
      e.preventDefault();
      const now = performance.now();
      if (now - holdAt >= HOLD_STEP_MS) { holdAt = now; UI.advance(true); }
    }
    return;
  }
  if (UI.talking()) { // a conversation takes every key: Esc ends it, choice keys answer, any other key advances
    e.preventDefault();
    if (e.code === 'Escape') UI.endTalk();
    else if (UI.asking() && (e.code === 'ArrowUp' || e.code === 'KeyW')) UI.moveChoice(-1);
    else if (UI.asking() && (e.code === 'ArrowDown' || e.code === 'KeyS')) UI.moveChoice(1);
    else if (UI.asking() && /^Digit[1-9]$/.test(e.code)) UI.choose(+e.code.slice(5) - 1);
    else UI.advance(e.code === 'Enter' || e.code === 'Space'); // Enter and Space also pick the highlighted answer
    return;
  }
  keys[e.code] = true;
  if (e.key === 'Shift') hudT = 0; // the move bar shows at once which two moves a click fires now
  // with no window up: Tab opens 포켓몬 상태, Esc the 시스템 page; with one up: Tab moves to its next tab (Shift+Tab
  // back), Esc closes it. F: the map while held, M: on and off (the fish farm has none).
  if (e.code === 'Tab') { e.preventDefault(); if (menu) UI.cycleTab(e.shiftKey ? -1 : 1); else if (!S.needsStarter) { openPause('status'); guideDone('status'); } }
  if (e.code === 'KeyF' && !menu && M.scene !== 'tutorial') openMap();
  if (e.code === 'KeyM' && !menu && M.scene !== 'tutorial') mapOpen ? closeMap() : openMap(); // M: the map on, M again off
  // B: 귀환. Starts the 3 s teleport to the base the map also offers (moving or getting hit cancels it); B again cancels
  if (e.code === 'KeyB' && !blocked()) { if (warp.active) warp.active = false; else if (!atBase() && warpPoints()[0]) startWarp(warpPoints()[0]); }
  if (e.code === 'KeyQ' && !blocked()) throwNet(); // the net, like a wheel click (for a trackpad or a mouse without one)
  if (e.code === 'KeyR' && !blocked()) eatBerry();
  if (e.code === 'Space' && menu && UI.cycleSub(e.shiftKey ? -1 : 1)) e.preventDefault(); // 포켓몬 상태: the next page
  if ((e.code === 'Space' || e.code === 'KeyW') && !blocked()) { if (e.code === 'Space') e.preventDefault(); jumpQueued = true; }
  if (e.code === 'Escape' && !S.needsStarter) mapOpen ? closeMap() : menu ? UI.closeOverlay() || closeMenu() : openPause('system');

  // debug keys: dev server only, never in the Firebase build
  if (import.meta.env.DEV && e.code === 'KeyP' && S.level < 100) { gainExp(R.expForLevel(S.level + 1) - S.exp); save(); }
  if (import.meta.env.DEV && e.code === 'KeyK') { S.money += 10000; save(); toast('[디버그] ₽10000 추가', 'good'); }
  if (import.meta.env.DEV && e.code === 'KeyO') { debugBright = !debugBright; if (debugBright) actions.revealMap(); toast(debugBright ? '[디버그] 전부 보이기 켬' : '[디버그] 전부 보이기 끔'); }
  // E opens and closes the game menu: at the base on 포획망 (with the base's selling and upgrades) or the 게시판, elsewhere on
  // the page it was last left on; by an NPC it talks to them instead
  if (e.code === 'KeyE' && !S.needsStarter) {
    if (menu) closeMenu();
    else if (atBase()) { storeBosses(); openPause(boardDue() ? 'board' : 'net'); guideDone('base'); }
    else if (nearNpc()) talkNpc(nearNpc());
    else { closeMap(); openMenu('pause'); }
  }
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.key === 'Shift') hudT = 0;
  if (e.code === 'KeyF') closeMap(); // the map shows only while F is held
});
cv.addEventListener('contextmenu', e => e.preventDefault());
// a click anywhere outside the box also moves a conversation on (the box handles its own clicks), or wakes from a faint
addEventListener('mousedown', e => {
  if (!SLOT) return;
  if (faintedAt) { e.preventDefault(); wakeAtBase(); }
  else if (UI.talking() && !e.target.closest?.('#dialog, #menu')) { e.preventDefault(); UI.advance(); }
});
addEventListener('mousemove', e => UI.peek(e.clientX, e.clientY));
cv.addEventListener('mousemove', e => {
  // the map has its own pointer; aim and camera hold still behind the map, menus and conversations
  const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
  if (!r.width || !r.height) return; // (a canvas not laid out: no aim to take from it)
  mapMouse.x = x; mapMouse.y = y;
  if (!blocked()) { mouse.x = x; mouse.y = y; }
});
cv.addEventListener('mousedown', e => {
  if (mapOpen) { if (e.button === 0) clickMap(); return; } // with the map up, a click only picks a teleport point
  if (blocked()) return;
  mouse.btn[e.button] = true;
  if (e.button === 1) { e.preventDefault(); throwNet(); } // wheel click (or Q) throws the net
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  if (!mapOpen) { if (!blocked()) swapSet(); return; } // in play the wheel swaps the move set
  mapTop = clamp(mapTop + Math.sign(e.deltaY) * 30, 0, M.ROWS - MapView.viewRows(MAP_BOX.h));
}, { passive: false });
addEventListener('mouseup', e => { mouse.btn[e.button] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.btn = [false, false, false]; });

// ---------- helpers ----------
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cam = { x: 0, y: 0 };
const aimAngle = () => Math.atan2(mouse.y + cam.y - P.y, mouse.x + cam.x - P.x);
const toast = (text, kind) => UI.toast(text, kind);
// Korean particle that fits the word's last syllable: josa('피오네', '을/를') -> '피오네를'
function josa(word, pair) {
  const c = word.charCodeAt(word.length - 1), jong = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0;
  const [withFinal, without] = pair.split('/');
  return word + (pair === '으로/로' ? (jong && jong !== 8 ? '으로' : '로') : jong ? withFinal : without); // ㄹ takes 로
}
const atBase = () => P.y < 10 && P.x >= M.BASE.reach[0] && P.x <= M.BASE.reach[1];
const capacity = () => R.netCapacity(S.upgrades.net);
const bagCount = () => S.bag.filter(m => !m.boss).length;

// Collision runs on the fine (quarter-tile) terrain grid, slopes included, so bodies touch exactly what is drawn.
function hitsTiles(b, x, y) {
  if (b.keepOut && M.scene === 'main' && inBossRoom(b, x, y)) return true; // wild Pokemon stay out of boss rooms
  const S = M.ST;
  for (let cx = Math.floor((x - b.hw) / S); cx <= Math.floor((x + b.hw) / S); cx++)
    for (let cy = Math.floor((y - b.hh) / S); cy <= Math.floor((y + b.hh) / S); cy++) {
      if (!M.subSolid(cx, cy, gateOpen)) continue;
      const cut = M.subCut(cx, cy);
      if (!cut) return true;
      const lx = cx * S, ly = cy * S; // slope cell: test the box against what is left of it
      if (M.cutHits(cut, Math.max(0, x - b.hw - lx), Math.max(0, y - b.hh - ly), Math.min(S, x + b.hw - lx), Math.min(S, y + b.hh - ly), S)) return true;
    }
  return false;
}
// point test with slopes (shots, rays)
function solidPoint(px, py) {
  const S = M.ST, cx = Math.floor(px / S), cy = Math.floor(py / S);
  if (!M.subSolid(cx, cy, gateOpen)) return false;
  const cut = M.subCut(cx, cy), lx = px - cx * S, ly = py - cy * S;
  return !cut || M.cutHits(cut, lx, ly, lx, ly, S);
}
// One-way dock in the main sea: you pass through it from below and land on it from above.
const onDeckX = (x, margin = 0) => x >= M.BASE.deck.x0 * M.T - margin && x <= (M.BASE.deck.x1 + 1) * M.T + margin;
const onDeck = () => onDeckX(P.x) && Math.abs(P.y + P.hh - M.DECK_TOP) < 0.5;
let lastHH = null;
const CLIMB_SPEED = 55; // px/s up the side of the base
function movePlayer(dt) {
  // the box can change size (sprite finished loading, evolution): keep the feet where they were
  if (lastHH !== null && lastHH !== P.hh) P.y += lastHH - P.hh;
  lastHH = P.hh;
  const prevBottom = P.y + P.hh;
  moveBody(P, dt);
  if (P.vy >= 0 && onDeckX(P.x) && prevBottom <= M.DECK_TOP + 0.5 && P.y + P.hh > M.DECK_TOP) { P.y = M.DECK_TOP - P.hh; P.vy = 0; }
}

// Axis-separated move that stops flush against what it hits (square tiles and 45-degree slopes alike):
// a short binary search finds the furthest free point, so feet rest on the floor line within a hair.
function moveBody(b, dt) {
  const stop = (free, from, to) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (free(from + (to - from) * m)) lo = m; else hi = m; }
    return from + (to - from) * lo;
  };
  const nx = b.x + b.vx * dt;
  if (!hitsTiles(b, nx, b.y)) b.x = nx;
  else { b.x = stop(x => !hitsTiles(b, x, b.y), b.x, nx); b.vx = 0; }
  const ny = b.y + b.vy * dt;
  if (!hitsTiles(b, b.x, ny)) b.y = ny;
  else { b.y = stop(y => !hitsTiles(b, b.x, y), b.y, ny); b.vy = 0; }
}

// ---------- combat ----------
// Special move behaviour (player only; wild Pokemon use the plain shape). See scripts' MECH table / GAME_DESIGN.md 4번.
const RAY_RANGE = 170, DROP_RANGE = 130, FOCUS_RADIUS = 14, HOMING_TURN = 4;
const BEAM_TICK = 0.2, BEAM_TOTAL = 1.5, BEAM_RANGE = 190, BEAM_HALF = 6, BEAM_TURN = 2.5;
const DASH_SPEED = 384, DASH_TIME = 0.275, BLAST_RADIUS = 34, WALL_RADIUS = 70; // a dash covers DASH_SPEED * DASH_TIME (~106 px)
let bursts = []; // delayed actions: multi-shot shuriken, combo hits
const SHURIKEN_GAP = 0.12; // s between 물수리검's five stars: long enough to swing the aim from one to the next

function hitAround(src, x, y, radius, m, mult = 1, um = useMult) {
  for (const t of targetsOf(src)) if (boxDist(t, x, y) <= radius) hit(src, t, m, mult, um);
}

// Where a targeted move lands: the cursor for the player, the player for wilds, capped at range along the aim.
function aimPoint(src, ang, range) {
  const tx = src.isPlayer ? mouse.x + cam.x : P.x, ty = src.isPlayer ? mouse.y + cam.y : P.y;
  const d = Math.min(range, Math.hypot(tx - src.x, ty - src.y));
  return { x: src.x + Math.cos(ang) * d, y: src.y + Math.sin(ang) * d };
}
// How far a straight line gets before rock.
function rayLength(x0, y0, cos, sin, range) {
  let len = 0;
  while (len < range && !solidPoint(x0 + cos * len, y0 + sin * len)) len += 4;
  return len;
}
// Everything whose box touches the segment from (x0,y0) along the angle for len, within half of the line.
function hitLine(src, x0, y0, cos, sin, len, half, m, mult = 1) {
  for (const t of targetsOf(src)) {
    const along = Math.max(0, Math.min(len, (t.x - x0) * cos + (t.y - y0) * sin));
    if (boxDist(t, x0 + cos * along, y0 + sin * along) <= half) hit(src, t, m, mult);
  }
}

// ---- the Oshawott line's moves, after the mainline games (player only; wild users keep the plain shapes) ----
// Ranges grow with evolution (rangeK). Every hit also knocks the target back a little.
let shake = 0; // screen shake in world px, eased out in update
const seed = () => Math.random() * 1000;
function knock(t, ang, v) { if (!t.isPlayer && !t.boss) { t.vx += Math.cos(ang) * v; t.vy += Math.sin(ang) * v; } }
// where water leaves the mouth (the sheet knows it; otherwise the front edge toward the aim)
function mouthPos(ang) {
  if (!Anim.has(S.species)) return { x: P.x + Math.cos(ang) * P.hw, y: P.y + Math.sin(ang) * P.hh };
  const a = Anim.info(S.species), k = Anim.scale(S.species, sizePx(sp(S.species)));
  return { x: P.x + P.face * a.mouth[0] * k, y: P.y + P.hh + a.mouth[1] * k };
}
// where a shot or beam starts: 거북왕 fires from its shell cannon (the sheet's mouth point is the muzzle), everyone else from
// the front edge of the body toward the aim
const CANNON_SPECIES = new Set(['blastoise']);
// (ang: the way it goes from there)
function muzzle(src, ang) {
  if (src.isPlayer && CANNON_SPECIES.has(S.species)) { const o = mouthPos(ang); o.ang = aimFrom(o, ang); return o; }
  return { x: src.x + Math.cos(ang) * src.hw, y: src.y + Math.sin(ang) * src.hh, ang };
}
// a shot leaving the mouth or a cannon, off the body's middle, aims at the point the player aimed at (at the cursor's
// distance) so it still crosses the cursor
function aimFrom(o, ang) {
  const d = Math.max(60, Math.hypot(mouse.x + cam.x - P.x, mouse.y + cam.y - P.y));
  return Math.atan2(P.y + Math.sin(ang) * d - o.y, P.x + Math.cos(ang) * d - o.x);
}
// targets in front: within reach of the front edge and inside the cone around the aim
function inFront(ang, reach, cone) {
  const fx0 = P.x + Math.cos(ang) * P.hw, fy0 = P.y + Math.sin(ang) * P.hh;
  return targetsOf(P).filter(t => {
    if (boxDist(t, fx0, fy0) > reach) return false;
    let da = Math.abs(Math.atan2(t.y - P.y, t.x - P.x) - ang);
    if (da > Math.PI) da = 2 * Math.PI - da;
    return da < cone || boxDist(t, P.x, P.y) < 4;
  });
}
const ACE_MIN = 60, ACE_RANGE = 130, FURY_CHAIN = 1.6, CANNON_RECHARGE = 1.6; // 제비반환 flashes ACE_MIN..ACE_RANGE px (x rangeK)
// a charge of `dist` px with the effect `kind` riding in front of the body; slam: it stops on the first body it hits
function dashWith(m, ang, dist, kind, slam = false) {
  P.dash = { t: dist * rangeK() / DASH_SPEED, ang, m, hit: new Set(), slam, hitFx: m.type };
  fx.push({ kind, follow: P, ang, type: m.type, size: Math.max(P.hw, P.hh) * 1.3, t: 0, dur: P.dash.t + 0.15, seed: seed() });
}
// a cut in front (reach px, cone half-angle), drawn as the effect `kind`; every target struck takes a hit in the
// move's colours and a little knock back. Returns the ones struck.
function cutFront(m, ang, reach, cone, kind, dur = 0.42) {
  const r = reach * rangeK(), struck = inFront(ang, r, cone);
  fx.push({ kind, follow: P, ang, reach: r + P.hw, type: m.type, t: 0, dur, seed: seed() });
  for (const t of struck) { hit(P, t, m); knock(t, ang, 140); fx.push({ kind: 'typehit', x: t.x, y: t.y, type: m.type, size: 9, t: 0, dur: 0.3, seed: seed() }); }
  return struck;
}
const PLAYER_MOVES = {
  // 몸통박치기: a short charge with the whole body behind a white pressure wave; stops on the first body it slams into
  tackle(m, ang) { dashWith(m, ang, 64, 'rush', true); },
  // 아쿠아제트 / 드릴라이너 / 메가혼 / 파도타기: charges with their effect riding in front (파도타기: a wave over the body)
  'aqua-jet'(m, ang) { dashWith(m, ang, 80, 'aquajet'); },
  'drill-run'(m, ang) { dashWith(m, ang, 90, 'drill'); },
  megahorn(m, ang) { dashWith(m, ang, 95, 'horn', true); },
  surf(m, ang) { dashWith(m, ang, 90, 'surf'); },
  // 물의파동: a rippling ring of water from the mouth
  'water-pulse'(m, ang, color) {
    const o = mouthPos(ang), v = 200;
    shots.push({ x: o.x, y: o.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ang, ttl: 220 * rangeK() / v, r: 5, owner: P, move: m, color,
      shape: 'pulse', splash: 8, hitSet: new Set() });
  },
  // the cuts, each in its type's colours: 베어가르기 one wide sweep, 깜짝베기 a quick shadowed cut, 시저크로스 an X,
  // 에어슬래시 a rising cut whose edge flies on, 성스러운칼 a great blade of light brought down
  slash(m, ang) { cutFront(m, ang, 44, 1.6, 'sweepcut'); },
  'night-slash'(m, ang) { cutFront(m, ang, 36, 1.0, 'nightcut'); },
  'x-scissor'(m, ang) { cutFront(m, ang, 40, 1.1, 'xcut'); },
  'air-slash'(m, ang, color) {
    const struck = cutFront(m, ang, 30, 1.1, 'aircut'), v = 260;
    shots.push({ x: P.x + Math.cos(ang) * P.hw, y: P.y + Math.sin(ang) * P.hh, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ang,
      ttl: 220 * rangeK() / v, r: 10, owner: P, move: m, color, shape: 'airblade', hitSet: new Set(struck) }); // the cut ones are not hit twice
  },
  'sacred-sword'(m, ang) { cutFront(m, ang, 46, 0.9, 'sacred', 0.85); shake = Math.max(shake, 4); },
  // 물대포: a fast jet of water from the mouth that splashes on what it hits
  'water-gun'(m, ang, color) {
    const o = mouthPos(ang), v = 380;
    shots.push({ x: o.x, y: o.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ang, ttl: 240 * rangeK() / v, r: 4.5, owner: P, move: m, color,
      shape: 'jet', trail: [], splash: 9, push: 90, hitSet: new Set() });
  },
  // 셸블레이드: a big cut with the drawn seamitar, sweeping the whole front
  'razor-shell'(m, ang, color) {
    const reach = 40 * rangeK();
    fx.push({ kind: 'shell', follow: P, ang, reach: reach + P.hw, t: 0, dur: 0.4, seed: seed() });
    for (const t of inFront(ang, reach, 1.3)) { hit(P, t, m); knock(t, ang, 160); fx.push({ kind: 'splash', x: t.x, y: t.y, ang, size: 10, t: 0, dur: 0.35, seed: seed() }); }
  },
  // 연속자르기: each hit chained within FURY_CHAIN seconds doubles the power (40 -> 80 -> 160)
  'fury-cutter'(m, ang) {
    const n = P.fury && S.playTime - P.fury.at < FURY_CHAIN && P.fury.hit ? Math.min(P.fury.n + 1, 2) : 0;
    const reach = 32 * rangeK() * (1 + 0.15 * n), struck = inFront(ang, reach, 1.1);
    fx.push({ kind: 'scythe', follow: P, ang, reach: reach + P.hw, n, t: 0, dur: 0.32, seed: seed() });
    for (const t of struck) { hit(P, t, m, 2 ** n); knock(t, ang, 120); }
    P.fury = { n, at: S.playTime, hit: struck.length > 0 };
    if (n && struck.length) numbers.push({ x: P.x, y: P.y - P.hh - 8, text: '연속 ×' + 2 ** n, t: 0, color: '#c8f070' });
  },
  // 제비반환: picks the target nearest the mouse pointer (in range and in sight) and flashes that way past it, at least
  // ACE_MIN and at most ACE_RANGE (short of rock), cutting only what lies on the way. With no target in range it flashes
  // toward the pointer.
  'aerial-ace'(m, ang) {
    const min = ACE_MIN * rangeK(), max = ACE_RANGE * rangeK(), px = mouse.x + cam.x, py = mouse.y + cam.y;
    const t = targetsOf(P).filter(t => {
      const d = Math.hypot(t.x - P.x, t.y - P.y), a = Math.atan2(t.y - P.y, t.x - P.x);
      return d < max + t.r && rayLength(P.x, P.y, Math.cos(a), Math.sin(a), d) >= d - t.r; // no cutting through rock
    }).sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))[0];
    const a = t ? Math.atan2(t.y - P.y, t.x - P.x) : ang, c = Math.cos(a), sn = Math.sin(a), x0 = P.x, y0 = P.y;
    const want = clamp(t ? Math.hypot(t.x - P.x, t.y - P.y) + t.hw + P.hw + 8 : Math.hypot(px - P.x, py - P.y), min, max);
    let len = rayLength(x0, y0, c, sn, want); // stop short of rock, then back off until the body fits (and stays in the water)
    while (len > 0 && (hitsTiles(P, x0 + c * len, y0 + sn * len) || (y0 > 0 && y0 + sn * len <= 0))) len -= 4;
    len = Math.max(0, len);
    P.x = x0 + c * len; P.y = y0 + sn * len; P.vx = c * 120; P.vy = sn * 120;
    const struck = targetsOf(P).filter(o => { const along = clamp((o.x - x0) * c + (o.y - y0) * sn, 0, len); return boxDist(o, x0 + c * along, y0 + sn * along) <= P.hh; });
    for (const o of struck) { hit(P, o, m); knock(o, a, 120); fx.push({ kind: 'ace', x: o.x, y: o.y, ang: a, t: 0, dur: 0.4 }); }
    fx.push({ kind: 'after', x0, y0, x1: P.x, y1: P.y, face: P.face, t: 0, dur: 0.35 });
    shake = Math.max(shake, struck.length ? 2 + struck.length : 1);
  },
  // 아쿠아테일: the tail swung around like a breaking wave: hits everything around the body
  'aqua-tail'(m, ang) {
    const r = 44 * rangeK();
    fx.push({ kind: 'tail', follow: P, ang, reach: r, t: 0, dur: 0.5, seed: seed() });
    for (const t of targetsOf(P)) if (boxDist(t, P.x, P.y) <= r) { hit(P, t, m); knock(t, Math.atan2(t.y - P.y, t.x - P.x), 220); }
    shake = Math.max(shake, 2);
  },
  // 하이드로펌프: a thick, high-pressure column held for its channel time; pushes targets and the user back
  'hydro-pump'(m, ang, color) {
    P.beam = { m, ang, t: 0, tick: 0, len: 0, color, half: 9, range: 240 * rangeK(), push: 70, pump: true };
  },
  // 해수스파우팅: three jets fanned out, as strong as the user is healthy (full HP: full power)
  'water-spout'(m, ang, color) {
    const o = mouthPos(ang), v = 340, k = P.hp / P.stats.hp;
    ang = aimFrom(o, ang);
    for (const da of [-0.22, 0, 0.22])
      shots.push({ x: o.x, y: o.y, vx: Math.cos(ang + da) * v, vy: Math.sin(ang + da) * v, ang: ang + da, ttl: 230 * rangeK() / v, r: 6, owner: P, move: m, color,
        shape: 'jet', trail: [], splash: 12, push: 120, mult: 0.6 * k, hitSet: new Set() });
    shake = Math.max(shake, 2);
  },
  // 근원의파동: five beams of light-blue water fanned out; every foe any of them touches is hit once
  'origin-pulse'(m, ang) {
    const o = mouthPos(ang), struck = new Set();
    ang = aimFrom(o, ang);
    for (let i = -2; i <= 2; i++) {
      const a = ang + i * 0.16, c = Math.cos(a), sn = Math.sin(a), len = rayLength(o.x, o.y, c, sn, 200 * rangeK());
      for (const t of targetsOf(P)) { const along = clamp((t.x - o.x) * c + (t.y - o.y) * sn, 0, len); if (boxDist(t, o.x + c * along, o.y + sn * along) <= 6) struck.add(t); }
      fx.push({ kind: 'ray', x: o.x, y: o.y, ang: a, len, half: 4, color: '#5ad0ff', t: 0, dur: 0.45 });
    }
    for (const t of struck) { hit(P, t, m); knock(t, Math.atan2(t.y - P.y, t.x - P.x), 160); }
    shake = Math.max(shake, 3);
  },
  // 하이드로캐논: a huge water ball that bursts wide; the user then has to recharge (no moves, barely moves)
  'hydro-cannon'(m, ang, color) {
    const o = mouthPos(ang), v = 250;
    ang = aimFrom(o, ang);
    shots.push({ x: o.x, y: o.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ang, ttl: 280 * rangeK() / v, r: 9, owner: P, move: m, color,
      shape: 'cannon', fx: 'blast', blastR: 60 * rangeK(), trail: [], hitSet: new Set() });
    P.vx -= Math.cos(ang) * 160; P.vy -= Math.sin(ang) * 160;
    P.recharge = CANNON_RECHARGE; shake = Math.max(shake, 3);
  },
};

// how grand a move's effects are (FX tier): by the level the player's line learns it, 5 -> 0 .. 100 -> 1
function moveTier(key) {
  const lv = R.LINES[S.line]?.learnset.find(([, k]) => k === key)?.[0];
  return lv == null ? 0.3 : clamp((lv - 5) / 95, 0, 1);
}
// a move used: everything it spawns right away (effects, shots, a dash, a beam) is tagged with its tier
// useMult: what the user's abilities add to every hit of the move being used (메가런처's charge, 변환자재, 승기), set while
// it fires and carried by the shots, dash, beam, rampage or shockwave it leaves running
let useMult = 1;
const WILD_HEAR = 320;
function fire(src, key, ang, opts = {}) {
  const f0 = fx.length, s0 = shots.length, dash = P.dash, beam = P.beam, rage = P.rampage, q0 = quakes.length;
  if (src.isPlayer) useMult = opts.useMult ?? 1;
  fireMove(src, key, ang, opts);
  // the move's sound, once it really goes off (a volley or combo only queues its strikes here: each makes its own);
  // a wild Pokemon's is quieter the further it is, and silent off past WILD_HEAR
  if (fx.length > f0 || shots.length > s0 || P.dash !== dash || P.beam !== beam || P.rampage !== rage || quakes.length > q0)
    SFX.move(data.moves[key], src.isPlayer ? 1 : 0.6 * Math.max(0, 1 - Math.hypot(src.x - P.x, src.y - P.y) / WILD_HEAR));
  if (!src.isPlayer) return;
  const t = moveTier(key);
  for (let i = f0; i < fx.length; i++) fx[i].tier ??= t;
  for (let i = s0; i < shots.length; i++) { shots[i].tier ??= t; shots[i].useMult ??= useMult; }
  for (let i = q0; i < quakes.length; i++) quakes[i].useMult = useMult;
  if (P.dash && P.dash !== dash) { P.dash.tier = t; P.dash.useMult = useMult; }
  if (P.beam && P.beam !== beam) { P.beam.tier = t; P.beam.useMult = useMult; }
  if (P.rampage && P.rampage !== rage) P.rampage.useMult = useMult;
  useMult = 1;
  if (CANNON_SPECIES.has(S.species) && (shots.length > s0 || (P.beam && P.beam !== beam) || fx.slice(f0).some(f => f.kind === 'ray'))) {
    const o = mouthPos(ang); // 거북왕's cannon goes off: water bursting out of the barrel
    fx.push({ kind: 'muzzle', x: o.x, y: o.y, ang, t: 0, dur: 0.3, seed: seed() }); shake = Math.max(shake, 1.5);
  }
}
function fireMove(src, key, ang, opts = {}) {
  const m = data.moves[key];
  const color = TYPE_COLOR[m.type];
  if (src.isPlayer && m.selfCost && !opts.single) { // 철제광선: the beam costs the user half their HP (never the last point)
    const c = Math.min(P.hp - 1, Math.round(P.stats.hp * m.selfCost));
    P.hp -= c; numbers.push({ x: P.x, y: P.y - P.hh - 4, text: '' + c, t: 0, color: '#ff8080' });
  }
  if (src.isPlayer && PLAYER_MOVES[key]) return PLAYER_MOVES[key](m, ang, color, opts);
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const special = src.isPlayer ? m.fx : null;
  if (special === 'heal') { // 아쿠아링 0.4, 날개쉬기 0.5 of the max HP
    P.hp = Math.min(P.stats.hp, P.hp + Math.round(P.stats.hp * (m.heal ?? 0.4)));
    fx.push({ kind: 'heal', x: P.x, y: P.y, t: 0, dur: 0.8, follow: P });
    return;
  }
  if (special === 'multi' && !opts.single) { // water shuriken: one use, five stars in a row, each thrown at the pointer as it is then
    for (let i = 0; i < 5; i++) bursts.push({ at: i * SHURIKEN_GAP, run: () => fire(src, key, aimAngle(), { single: true, useMult }) });
    return;
  }
  if (special === 'volley' && !opts.single) { // 고드름침: two to five icicles in a quick row
    const n = rand(2, 5);
    for (let i = 0; i < n; i++) bursts.push({ at: i * 0.09, run: () => fire(src, key, aimAngle(), { single: true, useMult }) });
    return;
  }
  if (special === 'combo' && !opts.single) {
    // strikes in a row: m.hits gives each one's share of the power (default three at 45%); with the final form's own combo
    // motion (opts.hitTimes) each lands on its strike in the animation, else 0.12 s apart
    const ks = m.hits ?? [0.45, 0.45, 0.45], at = opts.hitTimes ?? ks.map((_, i) => i * 0.12), um = useMult;
    ks.forEach((k, i) => bursts.push({ at: at[i] - at[0], run: () => src.isPlayer ? comboBlow(key, m, k, um) : fire(src, key, aimAngle(), { single: true, mult: k, useMult: um }) }));
    return;
  }
  if (special === 'uproar' && !opts.single) { // 소란피기: a roar that keeps going: four sound waves, each 50%
    for (let i = 0; i < 4; i++) bursts.push({ at: i * 0.5, run: () => fire(src, key, aimAngle(), { single: true, mult: 0.5, useMult }) });
    return;
  }
  if (special === 'rampage') { startRampage(m); return; }
  if (special === 'dash' || special === 'wall' || special === 'uturn') {
    P.dash = { t: DASH_TIME, ang, m, hit: new Set(), wall: special === 'wall', uturn: special === 'uturn' };
    fx.push({ kind: 'ram', x: src.x, y: src.y, ang, color, t: 0, dur: DASH_TIME, reach: 14, follow: src });
    return;
  }
  if (special === 'channel') { // thick beam held for a few seconds; it slowly follows the cursor
    P.beam = { m, ang, t: 0, tick: 0, len: 0, color };
    return;
  }
  if (special === 'quake') {
    const qr = m.reach * stageGrowth();
    hitAround(src, src.x, src.y, qr, m);
    fx.push({ kind: 'quake', x: src.x, y: src.y, color, t: 0, dur: 0.5, reach: qr });
    if (S.species === 'swampert') startTerrainWave(m); // the final form's own: a shockwave running along the ground too
    return;
  }
  // ---- forms from the original move animations; these work for wild Pokemon too ----
  if (m.shape === 'ray' || m.shape === 'bolt') { // instant line that stops at rock
    const o = muzzle(src, ang), x0 = o.x, y0 = o.y, oc = Math.cos(o.ang), os = Math.sin(o.ang);
    const len = rayLength(x0, y0, oc, os, src.isPlayer ? RAY_RANGE * rangeK() : RAY_RANGE), half = m.power >= 90 ? 5 : 3;
    hitLine(src, x0, y0, oc, os, len, half, m, opts.mult);
    fx.push({ kind: m.shape, x: x0, y: y0, ang: o.ang, len, half, color, t: 0, dur: 0.25 });
    return;
  }
  if (m.shape === 'pulse') { // aura radiating all around the user
    const pr = m.reach * (src.isPlayer ? stageGrowth() : 1);
    hitAround(src, src.x, src.y, pr, m, opts.mult);
    fx.push({ kind: 'quake', x: src.x, y: src.y, color, t: 0, dur: 0.4, reach: pr, follow: src });
    return;
  }
  if (m.shape === 'focus') { // force that bursts right at the target spot
    const p = aimPoint(src, ang, src.isPlayer ? 120 * rangeK() : 120);
    hitAround(src, p.x, p.y, FOCUS_RADIUS, m, opts.mult);
    fx.push({ kind: 'focus', x: p.x, y: p.y, color, t: 0, dur: 0.35, reach: FOCUS_RADIUS });
    return;
  }
  if (m.shape === 'drop') { // rocks fall from above onto the target spot (rock slide drops three)
    const p = aimPoint(src, ang, src.isPlayer ? DROP_RANGE * rangeK() : DROP_RANGE), n = m.power >= 70 ? 3 : 1;
    for (let i = 0; i < n; i++)
      shots.push({ x: p.x + (i - (n - 1) / 2) * 14, y: p.y - 60 - i * 12, vx: 0, vy: 240, ang: Math.PI / 2, ttl: (66 + i * 12) / 240, r: 5,
        owner: src, move: m, color, shape: 'rock', noclip: true, mult: n > 1 ? 0.5 : 1, hitSet: new Set() });
    return;
  }
  if (m.shape === 'bubbles') { // a spray of bubbles, each a share of the power
    for (let i = 0; i < 4; i++) {
      const a = ang + (Math.random() - 0.5) * 0.5, sp2 = 150 + Math.random() * 50;
      shots.push({ x: src.x + cos * src.hw, y: src.y + sin * src.hh, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, ang: a, ttl: src.isPlayer ? 0.7 * rangeK() : 0.7, r: 3,
        owner: src, move: m, color, shape: 'bubble', mult: 0.35, hitSet: new Set() });
    }
    return;
  }
  if (m.reach) { // melee: reach comes per move from data.json
    const reach = m.reach * (src.isPlayer ? stageGrowth() : 1); // evolved bodies reach further
    const fx0 = src.x + cos * src.hw, fy0 = src.y + sin * src.hh; // front edge of the attacker
    if (m.shape === 'ram') { src.vx += cos * 220; src.vy += sin * 220; }
    if (special === 'aoe') { // sweeping strike: everything around, no facing check
      fx.push({ kind: 'sweep', x: src.x, y: src.y, ang, color, t: 0, dur: 0.25, reach: reach + src.hw, follow: src });
      hitAround(src, src.x, src.y, reach + Math.max(src.hw, src.hh), m, opts.mult);
      return;
    }
    if (m.shape !== 'bite') fx.push({ kind: m.shape, x: src.x, y: src.y, ang, color, t: 0, dur: 0.25, reach, follow: src });
    const cone = m.shape === 'jab' ? 0.45 : 1.2; // a jab only reaches straight ahead
    const struck = [];
    for (const t of targetsOf(src)) {
      const dx = t.x - src.x, dy = t.y - src.y;
      if (boxDist(t, fx0, fy0) > reach) continue;
      let da = Math.abs(Math.atan2(dy, dx) - ang);
      if (da > Math.PI) da = 2 * Math.PI - da;
      if (da < cone || boxDist(t, src.x, src.y) < 4) { hit(src, t, m, opts.mult); struck.push(t); }
    }
    if (m.shape === 'bite') { // the jaws close on whoever was bitten (on the empty spot in front on a miss)
      const t = struck[0], size = t ? Math.max(12, Math.max(t.hw, t.hh) * 1.3) : 12;
      fx.push({ kind: 'bite', x: t ? t.x : fx0 + cos * reach * 0.7, y: t ? t.y : fy0 + sin * reach * 0.7, follow: t, size, ang, color, type: m.type, t: 0, dur: 0.46 });
      if (t && src.isPlayer) shake = Math.max(shake, m.power >= 80 ? 3 : 2);
    }
    return;
  }
  let speed = { stream: 240, orb: 170, beam: 420, wave: 150, blade: 260, ring: 170, leaf: 150 }[m.shape];
  let ttl = m.shape === 'beam' ? 0.35 : 0.8, r = m.shape === 'wave' ? 6 : m.power >= 100 ? 6 : 4;
  if (special === 'snipe') { speed = 760; ttl = 0.6; r = 2; } // long, thin and fast
  if (special === 'fast' || special === 'volley') { speed = 460; ttl = 0.55; r = 3; } // 얼음뭉치, 고드름침: quick small shards
  if (special === 'sound' || special === 'uproar') { ttl = 1.0; r = 8; } // wide ring that passes through rock
  if (special === 'multi') { speed = 300; ttl = 0.6; r = 3; }
  if (special === 'blast') { speed = 200; r = 7; }
  if (src.isPlayer) ttl *= rangeK(); // evolved: shots fly further
  const o = muzzle(src, ang);
  shots.push({
    x: o.x, y: o.y, vx: Math.cos(o.ang) * speed, vy: Math.sin(o.ang) * speed, ang: o.ang,
    ttl, r, owner: src, move: m, color, shape: special === 'multi' ? 'star' : special === 'snipe' ? 'snipe' : m.shape, hitSet: new Set(),
    fx: special === 'uproar' ? 'sound' : special ?? (m.fx === 'blast' || m.fx === 'homing' ? m.fx : null), // bombs and homing moves behave the same for wilds
    mult: opts.mult,
  });
}

// Channelled beam: re-aims toward the cursor at a capped turn rate, stops at rock, and hits everything on it
// every BEAM_TICK; over the whole channel each target takes BEAM_TOTAL times the move's single-hit power.
function updateBeam(dt) {
  const b = P.beam;
  b.t += dt;
  let d = aimAngle() - b.ang;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  b.ang += Math.max(-BEAM_TURN * dt, Math.min(BEAM_TURN * dt, d));
  const cos = Math.cos(b.ang), sin = Math.sin(b.ang);
  const o = b.pump ? mouthPos(b.ang) : muzzle(P, b.ang);
  b.x0 = o.x; b.y0 = o.y;
  b.len = rayLength(b.x0, b.y0, cos, sin, b.range ?? BEAM_RANGE * rangeK());
  if (b.pump) { P.vx -= cos * 140 * dt; P.vy -= sin * 140 * dt; } // the jet pushes its user back
  b.tick -= dt;
  if (b.tick <= 0) {
    b.tick += BEAM_TICK;
    const half = b.half ?? BEAM_HALF;
    for (const t of targetsOf(P)) { // hitLine, plus the push along the jet
      const along = Math.max(0, Math.min(b.len, (t.x - b.x0) * cos + (t.y - b.y0) * sin));
      if (boxDist(t, b.x0 + cos * along, b.y0 + sin * along) <= half) { hit(P, t, b.m, BEAM_TOTAL * BEAM_TICK / b.m.channel, b.useMult ?? 1); if (b.push) knock(t, b.ang, b.push); }
    }
  }
  if (b.t >= b.m.channel) P.beam = null;
}

// Player dash: fixed velocity along the aim, hits what it passes once; a wall dash ends in a shockwave on impact.
function updateDash(dt) {
  const d = P.dash;
  if (!d) return;
  d.t -= dt;
  P.vx = Math.cos(d.ang) * DASH_SPEED; P.vy = Math.sin(d.ang) * DASH_SPEED;
  const x0 = P.x, y0 = P.y;
  movePlayer(dt);
  for (const t of targetsOf(P)) if (!d.hit.has(t) && boxDist(t, P.x, P.y) <= d.m.reach * stageGrowth()) {
    d.hit.add(t); hit(P, t, d.m, d.mult ?? 1, d.useMult ?? 1);
    if (d.hitFx && !d.slam) { knock(t, d.ang, 140); fx.push({ kind: 'typehit', x: t.x, y: t.y, type: d.hitFx, size: 10, t: 0, dur: 0.3, seed: seed(), tier: d.tier }); }
    if (d.slam) { // 몸통박치기 / 메가혼 land: knock the target away, bounce back a little and stop
      knock(t, d.ang, 220); shake = Math.max(shake, 2);
      fx.push({ kind: d.m.type === 'normal' ? 'burst' : 'typehit', type: d.m.type, x: (P.x + t.x) / 2, y: (P.y + t.y) / 2, size: 12, t: 0, dur: 0.3, seed: seed(), tier: d.tier });
      d.t = 0; P.vx = -Math.cos(d.ang) * 90; P.vy = -Math.sin(d.ang) * 90; P.dash = null; return;
    }
  }
  const blocked = Math.hypot(P.x - x0, P.y - y0) < DASH_SPEED * dt * 0.4;
  if (d.wall && blocked) {
    hitAround(P, P.x, P.y, WALL_RADIUS, d.m, 1.5, d.useMult ?? 1);
    fx.push({ kind: 'quake', x: P.x, y: P.y, color: TYPE_COLOR[d.m.type], t: 0, dur: 0.5, reach: WALL_RADIUS });
    d.t = 0;
  }
  if (d.t <= 0 || (blocked && !d.wall)) {
    P.dash = null; P.vx *= 0.3; P.vy *= 0.3;
    if (d.uturn) P.dash = { ...d, t: DASH_TIME, ang: d.ang + Math.PI, uturn: false }; // U-turn: hit, then dash back (same hit set)
  }
}

// a combo's blows (웨이니발's 3연타 and the other many-hit moves) are aimed one by one, unlike 장크로다일's rampage: each
// goes for the foe nearest the pointer within COMBO_REACH (and in sight), lunging to it and striking only it, so the
// player picks a target for every blow in the beat before it; with none there the blow goes out toward the pointer
const COMBO_REACH = 70;
function comboBlow(key, m, mult, um) {
  const px = mouse.x + cam.x, py = mouse.y + cam.y, reach = COMBO_REACH * rangeK();
  const inReach = targetsOf(P).filter(t => {
    const dd = Math.hypot(t.x - P.x, t.y - P.y), a = Math.atan2(t.y - P.y, t.x - P.x);
    return dd <= reach + t.r && rayLength(P.x, P.y, Math.cos(a), Math.sin(a), dd) >= dd - t.r;
  });
  const t = inReach.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py))[0];
  if (!t) return fire(P, key, aimAngle(), { single: true, mult, useMult: um });
  const ang = Math.atan2(t.y - P.y, t.x - P.x), gap = Math.max(0, Math.hypot(t.x - P.x, t.y - P.y) - t.r - Math.max(P.hw, P.hh));
  P.castAng = ang; P.face = Math.cos(ang) >= 0 ? 1 : -1; // the body turns to each foe it strikes
  // a quick lunge that can strike only this foe (updateDash hits it once it is in reach)
  P.dash = { t: Math.min(0.25, gap / DASH_SPEED), ang, m, mult, useMult: um, hit: new Set(targetsOf(P).filter(o => o !== t)), hitFx: m.type };
  fx.push({ kind: m.shape, x: P.x, y: P.y, ang, color: TYPE_COLOR[m.type], t: 0, dur: 0.25, reach: m.reach, follow: P, tier: moveTier(key) });
  SFX.move(m);
}

// 역린 / 난동부리기 (장크로다일's own): about 5 s out of the player's control: three times it charges at a random foe in sight
// nearby (a random way with none) and lays into everything around where it lands, each blow at the move's full power
const RAMPAGE_RUNS = 3, RAMPAGE_DASH = 0.8, RAMPAGE_REST = 1.1, RAMPAGE_FIND = 200, RAMPAGE_AREA = 46;
function startRampage(m) { P.rampage = { m, left: RAMPAGE_RUNS, phase: 'rest', t: 0.15, at: 0, ang: P.castAng }; }
function updateRampage(dt) {
  const r = P.rampage;
  r.at += dt; r.t -= dt;
  if (r.phase === 'dash') {
    if (r.target && !r.target.fainted && !r.target.netted) r.ang = Math.atan2(r.target.y - P.y, r.target.x - P.x); // it runs the foe down
    P.vx = Math.cos(r.ang) * DASH_SPEED * 0.9; P.vy = Math.sin(r.ang) * DASH_SPEED * 0.9;
    movePlayer(dt);
    if (r.t > 0 && !(r.target && boxDist(r.target, P.x, P.y) < RAMPAGE_AREA / 2)) return;
    const area = RAMPAGE_AREA * rangeK(); // lands: everything around takes the blow
    for (const t of targetsOf(P)) if (boxDist(t, P.x, P.y) <= area) { hit(P, t, r.m, 1, r.useMult ?? 1); knock(t, Math.atan2(t.y - P.y, t.x - P.x), 240); }
    fx.push({ kind: 'sweep', x: P.x, y: P.y, ang: r.ang, color: TYPE_COLOR[r.m.type], t: 0, dur: 0.35, reach: area, follow: P });
    shake = Math.max(shake, 4); P.vx *= 0.2; P.vy *= 0.2;
    r.phase = 'rest'; r.t = RAMPAGE_REST; r.left--;
    return;
  }
  movePlayer(dt);
  if (r.t > 0) return;
  if (r.left <= 0) { P.rampage = null; return; }
  const near = targetsOf(P).filter(t => {
    const d = Math.hypot(t.x - P.x, t.y - P.y), a = Math.atan2(t.y - P.y, t.x - P.x);
    return d < RAMPAGE_FIND * rangeK() && rayLength(P.x, P.y, Math.cos(a), Math.sin(a), d) >= d - t.r;
  });
  r.target = near[Math.floor(Math.random() * near.length)] ?? null;
  r.ang = r.target ? Math.atan2(r.target.y - P.y, r.target.x - P.x) : Math.random() * 2 * Math.PI;
  SFX.play('ram');
  r.phase = 'dash'; r.t = r.target ? RAMPAGE_DASH : RAMPAGE_DASH / 2; // at a foe: until it gets there (at most RAMPAGE_DASH s)
}
// 지진 (대짱이's own): besides the ring round the body, a shockwave runs along the ground from the nearest rock both ways,
// following every slope and wall (like Qiyana's ultimate in League of Legends) and striking what is near the ground it
// passes. It spreads over the open cells touching rock (breadth first, so in order of distance along the ground).
const QUAKE_SPEED = 360, QUAKE_RUN = 280, QUAKE_NEAR = 22, QUAKE_FIND = 120;
let quakes = [];
function startTerrainWave(m) {
  let best = null; // the nearest rock, by rays all round
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a), len = rayLength(P.x, P.y, c, sn, QUAKE_FIND * rangeK());
    if (len < QUAKE_FIND * rangeK() && (!best || len < best.len)) best = { len, c, sn };
  }
  if (!best) return; // nothing near: the ring alone
  const G = M.ST, open = (x, y) => !M.subSolid(x, y, gateOpen);
  const ground = (x, y) => open(x, y) && (!open(x + 1, y) || !open(x - 1, y) || !open(x, y + 1) || !open(x, y - 1));
  let sx = Math.floor((P.x + best.c * Math.max(0, best.len - 2)) / G), sy = Math.floor((P.y + best.sn * Math.max(0, best.len - 2)) / G);
  if (!ground(sx, sy)) {
    const near = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (ground(sx + dx, sy + dy)) near.push([sx + dx, sy + dy, Math.hypot(dx, dy)]);
    if (!near.length) return;
    near.sort((a, b) => a[2] - b[2]); [sx, sy] = near[0];
  }
  const max = Math.round(QUAKE_RUN * rangeK() / G), seen = new Set([sx + ',' + sy]), cells = [[sx, sy, 0]];
  for (let i = 0; i < cells.length; i++) {
    const [x, y, d] = cells[i];
    if (d >= max) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (seen.has(k) || !ground(x + dx, y + dy)) continue;
      seen.add(k); cells.push([x + dx, y + dy, d + 1]);
    }
  }
  quakes.push({ m, cells, t: 0, i: 0, hit: new Set(), G, color: TYPE_COLOR[m.type] });
}
function updateQuakes(dt) {
  for (const q of quakes) {
    q.t += dt;
    const reach = q.t * QUAKE_SPEED / q.G;
    while (q.i < q.cells.length && q.cells[q.i][2] <= reach) {
      const [cx, cy, d] = q.cells[q.i++], x = (cx + 0.5) * q.G, y = (cy + 0.5) * q.G;
      for (const t of targetsOf(P)) if (!q.hit.has(t) && boxDist(t, x, y) <= QUAKE_NEAR) { q.hit.add(t); hit(P, t, q.m, 1, q.useMult ?? 1); knock(t, -Math.PI / 2, 160); }
      if (d % 3 === 0) fx.push({ kind: 'rubble', x, y, color: q.color, t: 0, dur: 0.5, seed: seed() });
    }
  }
  quakes = quakes.filter(q => q.i < q.cells.length);
}

function targetsOf(src) {
  if (src.isPlayer) return wilds.filter(w => !w.fainted && !w.netted);
  return [P];
}

function hit(src, dst, m, mult = 1, um = useMult) {
  const crit = (src.isPlayer && m.alwaysCrit) || Math.random() < (src.isPlayer ? R.CRIT_TABLE[S.luck.crit] : R.CRIT_CHANCE); // 수류연타: always
  const far = src.isPlayer && passive() === 'sniper' ? sniperReach(dst) : 0;
  if (src.isPlayer) mult *= um * abilityMult(m, far);
  let dmg = R.damage(src.level, Math.max(1, Math.round(m.power * mult)), src.stats.atk, dst.stats.def, crit);
  dst.hpLag = Math.max(dst.hpLag ?? dst.hp, dst.hp); dst.lagHold = LAG_HOLD; // the bar's yellow part stays behind a moment
  const dealt = Math.min(dst.hp, dmg); // what drain and recoil go by: the HP it really took
  dst.hp = Math.max(0, dst.hp - dmg);
  numbers.push({ x: dst.x, y: dst.y - dst.hh - 4, text: crit ? dmg + '!' : '' + dmg, t: 0, color: dst.isPlayer ? '#ff8080' : crit ? '#ffe060' : '#fff' });
  fx.push({ kind: 'impact', x: dst.x, y: dst.y, color: TYPE_COLOR[m.type], t: 0, dur: 0.2, reach: m.power >= 90 ? 12 : 7 });
  SFX.hit(m, crit, dst.isPlayer);
  if (src.isPlayer) {
    if (m.drain) heal(Math.round(dealt * m.drain)); // 드레인키스
    if (m.recoil) { const c = Math.min(P.hp - 1, Math.round(dealt * m.recoil)); P.hp -= c; numbers.push({ x: P.x, y: P.y - P.hh - 4, text: '' + c, t: 0, color: '#ff8080' }); } // 이판사판태클
    if (passive() === 'rough-skin' && isContact(m)) roughSkin(dst); // 까칠한피부: what it strikes body to body
    if (far >= 0.35) snipeHit(dst, far);
  }
  if (dst.isPlayer) {
    P.hitBy = src; // (a 돌핀맨's blow that brings the player down is an arrest: playerFaint)
    if (passive() === 'competitive' && dmg > 0) P.empowered = true; // 승기
    if (passive() === 'rough-skin' && m.reach) roughSkin(src); // 까칠한피부: a foe that strikes it body to body
    P.hurtAt = S.playTime; if (!P.act && !P.beam && !P.rampage) playAct(inState('hurt'));
    // feel the big ones only: a third of the HP or more at once reddens the screen's edge, shakes it and stops time a beat
    const share = dmg / P.stats.hp;
    if (share >= 1 / 3) { UI.flash('hurt'); shake = Math.max(shake, 6); hitStop = Math.max(hitStop, 0.07); }
    else if (share >= 0.15) shake = Math.max(shake, 2.5);
    return;
  }
  dst.flashT = 0.08; // the sprite flashes white
  if (crit) shake = Math.max(shake, 1.5);
  provoke(dst);
  if (dst.hp <= 0) knockedOut(dst, src);
}
// 작전 1 「따라와」: the 마그마단 소탕전 cutscene, once, right after 루기아 is offered
function playMagmaOp() {
  if (S.story.magmaOp) return;
  S.story.magmaOp = true; save();
  Cutscene.play({ base: import.meta.env.BASE_URL, species: S.species, speciesName: sp(S.species).name, sound: n => SFX.play(n) });
}
const AUTO_CATCH = 1; // s after a boss or 우두머리 goes down that it is caught by itself
function knockedOut(dst, src) {
  if (dst.fainted) return;
  // a fainted boss stays down (no countdown) until caught; when the player faints (or goes home) the next trip out
  // re-rolls the sea, and an uncaught boss is back whole in its room
  dst.fainted = dst.boss || dst.alpha ? Infinity : R.FAINT_CATCH_SECONDS;
  dst.cast = 0; dst.tele = null; dst.dash = null;
  SFX.play('faint');
  if (dst.boss || dst.alpha) { UI.flash('down'); shake = Math.max(shake, 6); hitStop = Math.max(hitStop, 0.12); dst.autoCatch = S.playTime + AUTO_CATCH; } // a boss going down lands hard, and is caught a beat later
  // 자기과신: every foe the player brings down adds a stack for 10 s, at most three at once (a new one leaves the others' time)
  if (src?.isPlayer && passive() === 'moxie' && moxieStacks() < 3) P.moxie.push(S.playTime + 10);
  if (!src?.isPlayer) return;
  huntDown(dst);
}
// 토벌 posts: one of their species brought down by the player (or caught without being brought down first)
function huntDown(w) {
  for (const p of takenPosts()) if (p.kind === 'hunt' && p.key === w.key && p.got < p.n && ++p.got === p.n) toast(`${p.dept} 의뢰 달성 · 기지 게시판에 보고하자`, 'good');
}

// ---- 특성: each line's ability, on its final form only; the forms before it have 급류 (data.json species passive) ----
const passive = () => sp(S.species).passive;
const PULSE_MOVES = new Set(['water-pulse', 'aura-sphere', 'dark-pulse', 'dragon-pulse', 'origin-pulse']); // 메가런처's
const isDashMove = m => m.shape === 'ram' || ['dash', 'wall', 'uturn', 'rampage'].includes(m.fx);
const isContact = m => !!m.reach || isDashMove(m);
const isSound = m => m.fx === 'sound' || m.fx === 'uproar';
const moxieStacks = () => P.moxie.filter(t => t > S.playTime).length;
function abilityMult(m, far) {
  const a = passive();
  let k = 1;
  if (a === 'sharpness' && SLICING.has(m)) k *= R.SHARPNESS; // 예리함
  if (a === 'torrent' && m.type === 'water' && P.hp <= P.stats.hp / 3) k *= 1.5; // 급류
  if (a === 'swift-swim' && isDashMove(m)) k *= 1.3; // 쓱쓱
  if (a === 'liquid-voice' && isSound(m)) k *= 1.5; // 촉촉보이스
  if (a === 'moxie') k *= 1 + 0.15 * moxieStacks(); // 자기과신
  return k * (1 + far); // 스나이퍼
}
// 스나이퍼: how far the target is, 0 (40 px or less) .. 1 (90% of the way from the player to the screen's edge that way)
function sniperReach(t) {
  const dx = t.x - P.x, dy = t.y - P.y, d = Math.hypot(dx, dy);
  if (d <= 40) return 0;
  const c = dx / d, sn = dy / d, px = P.x - cam.x, py = P.y - cam.y;
  const edge = Math.min(c > 0 ? (W - px) / c : c < 0 ? -px / c : Infinity, sn > 0 ? (H - py) / sn : sn < 0 ? -py / sn : Infinity);
  return clamp((d - 40) / Math.max(1, edge * 0.9 - 40), 0, 1);
}
// a long shot lands harder the further it flew: a bigger burst, and from about two thirds of the way a ring, a shake
// and a beat of hit stop
function snipeHit(t, far) {
  const big = far >= 0.7;
  fx.push({ kind: 'snipehit', x: t.x, y: t.y, big, t: 0, dur: big ? 0.5 : 0.35, seed: seed() });
  shake = Math.max(shake, big ? 3.5 : 1.5);
  if (big) { hitStop = Math.max(hitStop, 0.05); numbers.push({ x: t.x, y: t.y - t.hh - 12, text: '저격!', t: 0, color: '#ffe060' }); }
}
// 까칠한피부: a foe touching it takes a twelfth of the player's max HP, each foe at most every 0.5 s
function roughSkin(w) {
  if (!w || w.isPlayer || w.fainted || w.netted || S.playTime - (w.roughAt ?? -9) < 0.5) return;
  w.roughAt = S.playTime;
  const dmg = Math.max(1, Math.round(P.stats.hp / 12));
  w.hpLag = Math.max(w.hpLag ?? w.hp, w.hp); w.lagHold = LAG_HOLD; w.hp = Math.max(0, w.hp - dmg); w.flashT = 0.08;
  numbers.push({ x: w.x, y: w.y - w.hh - 4, text: '' + dmg, t: 0, color: '#c8f0a0' });
  fx.push({ kind: 'spikes', x: w.x, y: w.y, t: 0, dur: 0.3, seed: seed() });
  provoke(w);
  if (w.hp <= 0) knockedOut(w, P);
}
function heal(n) {
  if (n <= 0) return;
  P.hp = Math.min(P.stats.hp, P.hp + n);
  numbers.push({ x: P.x, y: P.y - P.hh - 4, text: '+' + n, t: 0, color: '#80ff9a' });
}
// R: eat a 자뭉열매 from the pouch (not at full HP, so one is never wasted)
function eatBerry() {
  if (S.berries <= 0) return toast(S.upgrades.berry ? '자뭉열매가 떨어졌다 · 기지에 돌아가면 다시 채워진다' : '열매주머니가 없다 · 기지 강화에서 살 수 있다', 'warn');
  if (P.hp >= P.stats.hp) return toast('체력이 가득 차 있다');
  S.berries--;
  SFX.play('berry');
  guideDone('berry');
  heal(Math.min(P.stats.hp - P.hp, Math.max(1, Math.round(P.stats.hp * R.BERRY_HEAL))));
  fx.push({ kind: 'heal', x: P.x, y: P.y, t: 0, dur: 0.8, follow: P });
  hudT = 0;
  save();
}
// HP bars (player, aimed-at mon, boss bar) show the HP just lost in yellow: it holds LAG_HOLD s after the last hit, then
// slides down to what is left, so a combo reads as one chunk
const LAG_HOLD = 0.45;
let hitStop = 0; // s the world holds still after a heavy blow (drawing goes on)
function updateLag(o, dt) {
  if (o.hpLag === undefined || o.hp >= o.hpLag) { o.hpLag = o.hp; return; }
  if ((o.lagHold -= dt) > 0) return;
  o.hpLag = Math.max(o.hp, o.hpLag - Math.max(o.stats.hp * 0.2, (o.hpLag - o.hp) * 2.2) * dt);
}

function provoke(w) {
  if (w.boss || ON_HIT[w.temper] === 'calm') return;
  if (ON_HIT[w.temper] === 'hostile') becomeHostile(w); else w.state = ON_HIT[w.temper];
}
// Turning hostile starts the move cooldown, so the first attack comes one cooldown later, not instantly.
function becomeHostile(w) {
  if (w.state === 'hostile') return;
  w.state = 'hostile';
  w.cd = data.moves[w.move].cooldown + 0.6;
}

// Player animation per move (sheet animation name, frame where the hit lands); other moves borrow a close one.
// moves -> the sheet motion they play (similar moves share one; their effects tell them apart) and a fallback hit frame
const MOVE_ANIM = {
  tackle: ['dash', 2], 'aqua-jet': ['dash', 2], 'drill-run': ['dash', 2], megahorn: ['dash', 2], surf: ['dash', 2],
  'water-gun': ['shoot', 2], 'water-pulse': ['shoot', 2], 'hydro-cannon': ['shoot', 2], 'aqua-tail': ['tail', 2], 'hydro-pump': ['pump', 0],
  'razor-shell': ['chop', 3], 'sacred-sword': ['chop', 3], 'x-scissor': ['x_cut', 2], 'fury-cutter': ['fury', 1], slash: ['sweep', 2],
  'night-slash': ['rise', 2], 'air-slash': ['rise', 2], 'aerial-ace': ['dash_cut', 1],
  'rapid-spin': ['tail', 2], 'water-spout': ['pump', 0], 'muddy-water': ['pump', 0], earthquake: ['tail', 2], bulldoze: ['tail', 2],
  // the final forms' own motions (other forms fall back to the usual one): 엠페르트's flippers raised to heal, 웨이니발's one
  // three-blow combo for its three-hit moves
  roost: ['heal', 2], 'aqua-ring': ['heal', 2], 'aqua-step': ['combo3', 2], 'triple-axel': ['combo3', 2], 'close-combat': ['combo3', 2], 'surging-strikes': ['combo3', 2],
};
// the motion a move falls back to when the sheet lacks its own: a sweep round the body spins (tail), other close moves
// lunge (or cut, for the blade line), ranged ones shoot; heals and rampages play none (a rampage has its own loop)
function moveMotion(key, m) {
  const [base, hitFrame] = MOVE_ANIM[key] ?? [];
  if (base && (hasAnim(base) || hasAnim(base + '_drawn') || hasAnim(base + '_iai'))) return [base, hitFrame];
  if (m.fx === 'heal' || m.fx === 'rampage') return [null, 0];
  return [m.fx === 'aoe' ? 'tail' : m.reach ? (hasAnim('chop') ? 'chop' : 'dash') : 'shoot', 2];
}
// a move's motion plays at ACT_RATE (sheet time per real second; hurt and sheathe at 1), and the move lands with it
const ACT_RATE = 0.8;
function playAct(name, t = 0, rate = 1) {
  if (!hasAnim(name)) return;
  P.act = { name, t, rate, dur: Math.max(Anim.duration(S.species, name), 0.05 - t) }; // a wind-up started early (t < 0) holds until the move fires
}
// 발도 / 납도 (Dewott and Samurott): their blades are out (P.drawn) or in. A blade move used with them in draws as it
// cuts (its '<name>_iai' version: the blades come out of the paws during the wind-up, and the player can still move
// meanwhile); they stay out, whatever moves follow, until SHEATHE_AFTER s pass with no move used, then go back in.
// Animations come in both states where the sheet has them ('<name>_drawn'); sheathing faces the way the player moves.
const BLADE_LINE = new Set(['dewott', 'samurott']); // (Oshawott learns no cutting move before it evolves)
const BLADE_MOVES = new Set(['razor-shell', 'fury-cutter', 'aerial-ace', 'slash', 'night-slash', 'x-scissor', 'air-slash', 'sacred-sword']);
// 특성 예리함 (the Oshawott line): the cutting moves (all of them slicing moves in the mainline) hit R.SHARPNESS x as hard
const SLICING = new Set([...BLADE_MOVES].map(k => data.moves[k]));
const sharp = m => sp(S.species).passive === 'sharpness' && SLICING.has(m);
const SHEATHE_AFTER = 10;
const hasAnim = name => Anim.has(S.species) && !!Anim.info(S.species).anims[name];
const inState = name => (P.drawn && hasAnim(name + '_drawn') ? name + '_drawn' : name);
const unaimed = name => name.startsWith('hurt') || name.startsWith('sheathe'); // not an attack's own motion
// 기술 세트: the mouse wheel swaps which set the four buttons fire. Cooldowns run per move, so a strong move cooling
// in one set is no reason to wait: the other set is a key away. (A wheel turn sends several events: one swap a beat.)
let swappedAt = 0;
function swapSet() {
  const now = performance.now();
  if (now - swappedAt < 250) return;
  if (setsOpen() < 2) return; // the second set is bought at the base
  swappedAt = now; S.set = (S.set + 1) % setsOpen(); guideDone('set');
  hudT = 0; // the HUD redraws on the next frame, so the swap animation starts at once
}
function tryUseMove(slot, btn) {
  const key = S.equip[S.set * R.SLOTS + slot];
  if (!key || P.cast > 0 || P.beam || P.recharge > 0 || P.rampage || P.charge || (P.cd[key] ?? 0) > 0) return;
  if ((S.pp[key] ?? 0) <= 0) { toast(data.moves[key].name + '의 PP가 다 떨어졌다'); P.cd[key] = 1; return; }
  // 메가런처: a pulse move is held to gather power and goes off when the button is let go (update)
  if (passive() === 'mega-launcher' && PULSE_MOVES.has(key)) { P.charge = { key, btn, t: 0 }; return; }
  useMove(key, 1);
}
// how much a charge adds: x1 at once, up to x2 after CHARGE_FULL s
const CHARGE_FULL = 2;
function useMove(key, um) {
  const m = data.moves[key];
  guideDone('skill');
  if (passive() === 'protean') { if (P.lastType && P.lastType !== m.type) um *= 1.2; P.lastType = m.type; } // 변환자재
  if (passive() === 'competitive' && P.empowered) { um *= 1.5; P.empowered = false; } // 승기: spent on this move
  P.castOpts = { useMult: um };
  S.pp[key]--;
  P.cd[key] = R.moveCooldown(m);
  P.castAng = aimAngle();
  P.lastMoveAt = S.playTime;
  const [base, hitFrame] = moveMotion(key, m);
  const sheet = Anim.has(S.species) && Anim.info(S.species).anims;
  const chained = key === 'fury-cutter' && P.fury && S.playTime - P.fury.at < FURY_CHAIN && P.fury.hit; // blade still out
  const bladed = BLADE_LINE.has(S.species) && BLADE_MOVES.has(key);
  // a blade move with the blades in draws as it cuts
  const iai = bladed && !P.drawn && hasAnim(base + '_iai');
  if (bladed) P.drawn = true;
  P.castFree = iai; // drawing does not stop the player
  const anim = !base ? null : chained && sheet?.fury_chain ? 'fury_chain' : iai ? base + '_iai' : bladed ? base : inState(base);
  let lead = m.delay;
  if (anim && sheet?.[anim]) {
    const a = sheet[anim], hit = a.hit ?? hitFrame / a.fps;
    lead = Math.max(lead, hit / ACT_RATE); // every move goes off when its motion strikes (the wind-up plays first)
    playAct(anim, hit - lead * ACT_RATE, ACT_RATE);
    // 연속자르기's animation cuts twice: the second blade's cut is the chain's next strike
    if (a.hit2 != null) bursts.push({ at: lead + (a.hit2 - hit) / ACT_RATE, run: () => fire(P, key, P.castAng, P.castOpts) });
    // a combo motion (웨이니발's) lands each strike on its own beat in the animation
    if (a.hits && m.fx === 'combo') P.castOpts.hitTimes = a.hits.map(h => (h - a.hits[0]) / ACT_RATE);
  }
  if (key === 'hydro-cannon') fx.push({ kind: 'charge', t: 0, dur: lead, seed: Math.random() * 99, mouth: true, tier: moveTier(key) });
  if (lead > 0) { P.cast = lead; P.castMove = key; }
  else fire(P, key, P.castAng, P.castOpts);
}

function throwNet() {
  if (P.netCd > 0 || P.y < 0 || P.recharge > 0) return;
  guideDone('net');
  const a = aimAngle();
  P.netCd = 0.8;
  SFX.play('net');
  shots.push({ x: P.x, y: P.y, vx: Math.cos(a) * NET_SPEED, vy: Math.sin(a) * NET_SPEED, ang: a, ttl: NET_TTL, r: 6, net: true, owner: P, hitSet: new Set() });
}

function resolveNet(w, sure = false) { // sure: a downed boss or 우두머리, caught by itself
  w.netted = 0;
  if (!sure && Math.random() >= R.catchChance(w.hp, w.stats.hp, S.level, w.level, S.luck.catch)) {
    provoke(w);
    SFX.play('escape');
    toast(josa(sp(w.key).name, '이/가') + ' 그물에서 빠져나왔다!');
    return;
  }
  if (w.fainted) guideDone('down');
  else huntDown(w); // caught standing counts for a 토벌 too (one brought down first was counted then)
  wilds.splice(wilds.indexOf(w), 1);
  // a 우두머리 is kept like a boss (not sold, out of the net's count, set aside at the base) and only handed over by its report
  S.bag.push({ key: w.key, level: w.level, iv: w.iv, shiny: w.shiny, boss: w.boss || !!w.alpha, ...(w.alpha ? { alpha: w.zone } : {}) });
  S.caught[w.key] = (S.caught[w.key] ?? 0) + 1;
  SFX.play('catch');
  toast((w.shiny ? '★ ' : '') + sp(w.key).name + ' Lv.' + w.level + ' 포획!', 'good');
  if (w.shiny) Stats.shiny(w.key, w.zone);
  gainExp(wildExp(w));
  addWanted(w.police ? R.WANTED_GAIN.policeCatch : R.WANTED_GAIN.catch); // the 수배도 rises only by catching
  if (w.alpha) { // 우두머리 caught: gone for good; the bonus waits on the board
    S.alphas[w.zone] = true; save();
    Stats.count(`alpha_${w.zone}`);
    toast(`우두머리 ${sp(w.key).name} 확보 · 기지 게시판에 보고하면 수당이 나온다`, 'good');
  }
  for (const p of takenPosts()) if (p.kind !== 'hunt' && Board.qualifies(p, S.bag.at(-1)) && S.bag.filter(m => Board.qualifies(p, m)).length === p.n)
    toast(`${p.dept} 의뢰 물량을 채웠다 · 기지 게시판에 납품하자`, 'good');
  const z = M.ZONES.find(z => z.bosses.some(([key]) => key === w.key));
  if (w.boss && z && zoneBossesHeld(z)) {
    if (endBossFightIfWon()) { shake = Math.max(shake, 4); UI.flash('win'); }
    toast('보스를 모두 잡았다 · 문이 열렸다. B로 기지에 돌아가 상납하자', 'good');
  }
}

const wildExp = w => Math.round(R.expGain(sp(w.key).baseExp, w.level, w.zone) * R.expMult(S.upgrades.exp) * (w.alpha ? 3 : 1)); // 학습 장치 adds to it; a 우두머리 x3
function gainExp(n) {
  S.exp += n;
  while (S.level < 100 && S.exp >= R.expForLevel(S.level + 1)) {
    const before = P.stats.hp;
    S.level++;
    SFX.play('levelup');
    toast('레벨 업! Lv.' + S.level, 'good');
    const evo = R.evolveOf(S.species);
    if (evo && S.level >= evo[0]) {
      const from = sp(S.species).name;
      S.species = evo[1];
      mark(`evolve${stage() + 1}`);
      toast(`${josa(from, '은/는')} ${josa(sp(S.species).name, '으로/로')} 진화했다!`, 'good');
      fx.push({ kind: 'evolve', x: P.x, y: P.y, t: 0, dur: 1.2, follow: P });
    }
    P.hp += P.stats.hp - before;
    for (const [lv, key] of R.LINES[S.line].learnset) {
      if (lv !== S.level || S.learned.includes(key)) continue;
      S.learned.push(key);
      S.pp[key] = R.maxPP(data.moves[key].pp, S.ppLevel);
      const free = S.equip.slice(0, setsOpen() * R.SLOTS).indexOf(null); // into an open set only
      if (free >= 0) S.equip[free] = key;
      toast(josa(data.moves[key].name, '을/를') + ' 배웠다!', 'good');
    }
  }
}

// Fainting: the world stops under a dark screen. Nets still flying go nowhere and netted Pokemon slip out, so nothing is
// caught after the fall; the net full of catches stays tied where the player fell. A key or click (wakeAtBase) goes home.
function playerFaint() {
  SFX.play('down');
  Stats.count(M.scene === 'tutorial' ? 'faint_farm' : `faint_zone_${M.zoneOfRow(Math.floor(Math.max(0, P.y) / M.T)).id + 1}`);
  shots = shots.filter(s => !(s.net && s.owner === P));
  for (const w of wilds) w.netted = 0;
  // brought down by a 돌핀맨: arrested, the net taken (nothing left tied), a fine paid, the 수배도 cleared
  const arrested = !!P.hitBy?.police && S.playTime - (P.hurtAt ?? -9) < 1, fine = arrested ? Math.floor(S.money * R.ARREST_FINE) : 0;
  const tied = !arrested && S.bag.length > 0;
  if (tied) S.tiedNet = { x: P.x, y: P.y, mons: S.bag, left: R.TIED_NET_SECONDS, scene: M.scene };
  if (arrested) { S.money -= fine; S.wanted = 0; Stats.count('arrest'); }
  const freed = arrested ? releaseAlphas(S.bag) : []; // a 우두머리 in the confiscated net goes free (back in its den next trip)
  S.bag = [];
  for (const k in keys) keys[k] = false;
  mouse.btn = [false, false, false]; warp.active = false; P.beam = null; P.charge = null;
  closeMap(); closeMenu();
  faintedAt = performance.now(); faintTip = arrested ? 'arrest' : tied ? 'faint' : null;
  if (arrested) UI.faintScreen(`포획망을 몰수당했다${fine ? ` · 벌금 ₽${fine.toLocaleString()}` : ''}${freed.length ? ` · 우두머리 ${freed.join(', ')}도 풀려났다` : ''}`, true);
  else UI.faintScreen(tied ? '포획망은 쓰러진 자리에 남겨 두었다' : '');
}
let faintTip = null; // the 업무 매뉴얼 page waking up brings: 'faint' (a net left tied), 'arrest'
const FAINT_HOLD_MS = 1500; // a key mashed mid-fight doesn't skip the screen at once
function wakeAtBase() {
  if (performance.now() - faintedAt < FAINT_HOLD_MS) return;
  faintedAt = 0;
  UI.faintScreen(null);
  arena = null; // the boss fight is lost: the door opens, and the next trip out brings the uncaught bosses back whole
  placeAtBase(); P.cast = 0;
  arriveAtBase();
  if (faintTip) tip(faintTip);
  if ((S.faints = (S.faints ?? 0) + 1) >= 2) radio('faint2');
}

// Leaving the tutorial: swap to the main map and start at its base.
function enterMainSea() {
  closeMenu();
  M.setScene('main');
  wilds = []; shots = []; fx = [];
  placeAtBase();
  needsReset = true;
  refreshBoard();
}

// Base spawn: on the main dock the feet stand on the planks; in the tutorial the player floats at the surface.
function placeAtBase() {
  P.x = M.BASE.x; P.vx = P.vy = 0; P.beam = null;
  P.y = M.DECK_TOP - P.hh - 0.5;
  lastHH = P.hh; // if the sprite loads later and the box grows, movePlayer keeps these feet on the deck
}

// bosses caught out at sea go straight into the tribute slots once home
function storeBosses() {
  S.tribute.push(...S.bag.filter(m => m.boss));
  S.bag = S.bag.filter(m => !m.boss);
}
function arriveAtBase() {
  if (!needsReset) refreshBoard(); // back from a trip: the board changes
  storeBosses();
  P.hp = P.stats.hp;
  for (const k of S.learned) S.pp[k] = R.maxPP(data.moves[k].pp, S.ppLevel);
  S.berries = R.berryCount(S.upgrades.berry);
  needsReset = true;
  save();
}

// ---------- base actions (called from UI) ----------
const OFFER_LINES = {
  // the secretary stays dry: what was brought, the promotion, where to go next
  1: '...정말 잡아 왔군. 마나피에 피오네 셋까지. 보스께서 흡족해하신다. 오늘부터 대리다. '
    + '다음은 심해다. 마나피가 있던 방 바닥 한가운데의 해치로 내려가거나, 지도(F)에서 심해 포탈을 눌러라. 다음 지시는 게시판에 붙여 두었다.',
  2: '루기아를 잡아 왔다. 이 부서에서 처음 있는 일이다. 오늘부터 과장이다. '
    + '남은 건 해구의 가이오가다. 심해 왼쪽 아래, 루기아가 있던 방 바닥의 해치를 열어 두었다. 지도의 해구 포탈로도 갈 수 있다. 지시는 게시판에 있다.',
  3: '...가이오가를 보스 앞에 데려온 건 네가 처음이다. 보스께서 네 이름을 물으셨다. '
    + '오늘부터 해양수산부 부장이다. 이 바다 전체를 네게 맡기신다.',
};

const actions = {
  sell(i) {
    const m = S.bag[i];
    if (!m || m.boss || !atBase()) return; // the base buys
    const v = R.price(sp(m.key), m);
    S.money += v;
    S.bag.splice(i, 1);
    if (m.key === 'magikarp' && S.rank === 0 && S.karpSold < 3 && ++S.karpSold === 3) { // step 1 done: the tank gets the 콘치
      wilds = []; needsReset = true;
      mentorSays('잉어킹은 합격이다옹. 다음은 진짜 연습이다옹. 수조에 콘치가 들어와서 치어를 잡아먹고 있다옹. '
        + '이 녀석은 보자마자 덤빈다옹. 덤비기 전에 몸이 깜빡이고 바닥에 빨간 표시가 뜬다옹. 그 밖으로 피하면서 잡아서 팔아 오라옹.');
    }
    if (m.key === FARM_FOE && farmStep2()) {
      S.rank = 1;
      mark('tutorial');
      enterMainSea();
      toast('교육 완료 · 사원으로 승진했다', 'good');
      mentorSays('교육 끝이다옹! 오늘부터 사원이다옹. 이제부터 진짜 바다로 나간다옹. '
        + '기지 메뉴(E)에 게시판이랑 강화 탭이 생겼다옹. 게시판 맨 앞에 네 개인 업무가 붙어 있다옹. 처음엔 다른 부서 공고 3개 처리다옹. '
        + '번 돈은 강화 탭에서 장비 올리는 데 쓰라옹. 모르는 게 생기면 메뉴의 매뉴얼 탭을 보라옹.');
    }
    save();
  },
  sellAll() { for (let i = S.bag.length - 1; i >= 0; i--) if (!S.bag[i].boss) actions.sell(i); },
  // several at once (indices into the bag); highest index first so the rest stay valid
  sellMany(list) { for (const i of [...list].sort((a, b) => b - a)) actions.sell(i); },
  upgradeNet() {
    const lv = S.upgrades.net, cost = R.netUpgradeCost(lv);
    if (lv >= R.NET_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.net++; save();
  },
  // Paid upgrades. A stat change keeps the current HP gap the same.
  buyStat(field, stat) {
    const npc = field === 'ev' ? 'ev' : 'iv';
    const lv = S[field][stat], max = npc === 'ev' ? R.EV_MAX : R.IV_MAX, cost = npc === 'ev' ? R.evCost(lv) : R.ivCost(lv);
    if (lv >= max || S.money < cost) return;
    const before = P.stats.hp;
    S.money -= cost; S[field][stat]++;
    P.hp += P.stats.hp - before;
    save();
  },
  buyLuck(kind) {
    const lv = S.luck[kind], cost = R.luckCost(lv);
    if (lv >= R.LUCK_MAX || S.money < cost) return;
    S.money -= cost; S.luck[kind]++; save();
  },
  buyPP() {
    const lv = S.ppLevel, cost = R.ppCost(lv);
    if (lv >= R.PP_MAX || S.money < cost || !atBase()) return;
    S.money -= cost; S.ppLevel++;
    for (const k of S.learned) S.pp[k] = R.maxPP(data.moves[k].pp, S.ppLevel);
    save();
  },
  upgradeStamina() {
    const lv = S.upgrades.stamina, cost = R.staminaUpgradeCost(lv);
    if (lv >= R.STAMINA_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.stamina++; save();
  },
  upgradeBerry() { // bought at the base, so the pouch fills up to its new size right away
    const lv = S.upgrades.berry, cost = R.berryUpgradeCost(lv);
    if (lv >= R.BERRY_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.berry++; S.berries = R.berryCount(S.upgrades.berry); save();
  },
  upgradeCharm() {
    const lv = S.upgrades.charm, cost = R.charmUpgradeCost(lv);
    if (lv >= R.CHARM_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.charm++; save();
  },
  upgradeExp() {
    const lv = S.upgrades.exp, cost = R.expUpgradeCost(lv);
    if (lv >= R.EXP_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.exp++; save();
  },
  buyBossRadar() {
    if (S.upgrades.radar || S.money < R.BOSS_RADAR_COST || !atBase()) return;
    S.money -= R.BOSS_RADAR_COST; S.upgrades.radar = 1; save();
  },
  upgradeSets() {
    const lv = S.upgrades.sets, cost = R.setUpgradeCost(lv);
    if (lv >= R.SET_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.sets++; save();
  },
  // 조각 탐지 (base, 강화 tab): one missing piece of the zone being worked on gets a circle on the map around it (its
  // centre off the piece by up to 60% of the radius) until the piece is picked up
  buyPieceHint() {
    const h = pieceHintFor(), cost = h && R.pieceHintCost(h.z.id);
    if (h?.next === undefined || S.money < cost || !atBase()) return;
    const t = h.z.treasures[h.next], a = Math.random() * Math.PI * 2, d = Math.random() * R.PIECE_HINT_RADIUS * 0.6;
    S.money -= cost;
    S.pieceHints[h.z.id + '-' + h.next] = { tx: Math.round(t.x + Math.cos(a) * d), ty: Math.round(t.y + Math.sin(a) * d) };
    toast(`지도(F)에 ${h.z.piece}의 대략적인 위치를 표시했다`, 'good');
    save();
  },
  upgradeLamp() {
    const lv = S.upgrades.lamp, cost = R.lampUpgradeCost(lv);
    if (lv >= R.LAMP_UPGRADES || S.money < cost || !atBase()) return;
    S.money -= cost; S.upgrades.lamp++; save();
  },
  offerBosses() {
    const z = M.ZONES.find(z => !S.offered[z.id] && zoneBossesHeld(z, true));
    if (!z || !atBase()) return;
    for (const [key, n] of z.bosses)
      for (let k = 0; k < n; k++) {
        const from = S.tribute.some(m => m.key === key) ? S.tribute : S.bag;
        from.splice(from.findIndex(m => m.key === key), 1);
      }
    S.offered[z.id] = true; taskOf(z).step = T.DONE;
    mark(`offer${z.id + 1}`);
    if (M.ZONES.every(g => S.offered[g.id])) mark('clear', true);
    S.rank = Math.max(S.rank, Math.min(z.id + 1, R.RANKS.length - 1));
    toast(`${josa(bossNames(z), '을/를')} 바쳤다! ${josa(R.RANKS[S.rank], '으로/로')} 승진!`, 'good');
    toast(`해상기지가 ${josa(BASE_STAGE_NAMES[baseStage() - 1], '으로/로')} 업그레이드됐다!`, 'good');
    // the offering scene plays first; any key then brings the secretary's talk, and the scene closes with it.
    // The base menu steps aside meanwhile so the next zone's silhouettes don't show through the fade, and comes back after.
    closeMenu();
    Tribute.show(z.id, S.species, import.meta.env.BASE_URL, { title: `${z.name} 보스 상납`, sub: `${josa(R.RANKS[S.rank], '으로/로')} 승진!` },
      () => bossSays(OFFER_LINES[z.id], () => { Tribute.hide(); if (z.id === 2) playMagmaOp(); })); // (the menu stays closed after); after 루기아, 작전 1
    save();
  },
  // 게시판 (at the base): take the 본사 지시 of the zone being worked on, take a post (BOARD_TAKE at most; an urgent one's
  // clock starts), turn one in (a delivery hands over the cheapest Pokemon that fit), or drop one
  acceptPost(id) {
    const p = S.board.posts.find(p => p.id === id);
    if (!p || p.taken || takenPosts().length >= Board.BOARD_TAKE || !atBase()) return;
    p.taken = true;
    if (p.limit) p.deadline = S.playTime + p.limit;
    save();
  },
  turnInPost(id) {
    const p = S.board.posts.find(p => p.id === id);
    if (!p?.taken || postHave(p) < p.n || !atBase()) return;
    if (p.kind !== 'hunt') {
      const give = new Set(S.bag.filter(m => Board.qualifies(p, m)).sort((a, b) => R.price(sp(a.key), a) - R.price(sp(b.key), b)).slice(0, p.n));
      S.bag = S.bag.filter(m => !give.has(m));
    }
    S.money += p.reward;
    S.board.posts.splice(S.board.posts.indexOf(p), 1);
    S.board.done = (S.board.done ?? 0) + 1; S.postsDone++;
    Stats.count('board_' + p.kind);
    SFX.play('catch');
    toast(`${p.dept} 의뢰 완료 · ₽${p.reward.toLocaleString()}`, 'good');
    save();
    const z = goalZone(), t = z && taskOf(z);
    if (t && (t.step === T.POSTS1 || t.step === T.POSTS2) && taskPosts(z) >= TASK_POSTS) nextStep(z, TASK_LINES[z.id][t.step === T.POSTS1 ? 'alpha' : 'piece']);
  },
  reportAlpha(zid) {
    const a = ALPHAS[zid];
    if (!a || !S.alphas[zid] || S.alphaPaid[zid] || !atBase()) return;
    for (const list of [S.tribute, S.bag]) { const i = list.findIndex(m => m.alpha == zid); if (i >= 0) { list.splice(i, 1); break; } } // handed over
    S.alphaPaid[zid] = true; S.money += a.reward;
    SFX.play('catch');
    save();
    const z = zoneById(+zid);
    if (taskOf(z).step === T.ALPHA) nextStep(z, a.outro + ' ' + TASK_LINES[z.id].posts2); // (the 개인 업무's step)
    else mentorSays(a.outro);
  },
  dropPost(id) {
    const p = S.board.posts.find(p => p.id === id);
    if (!p?.taken) return;
    S.board.posts.splice(S.board.posts.indexOf(p), 1);
    save();
  },
  bribePress() { // 언론 조작: a star off the 수배도
    const stars = Math.ceil(S.wanted - 1e-6), cost = R.bribeCost(stars);
    if (!stars || S.money < cost || !atBase()) return;
    S.money -= cost; S.wanted = Math.max(0, S.wanted - 1);
    toast(`언론 조작 · 수배도 ★${wantedStars()}`, 'good');
    save();
  },
  rerollBoard() {
    if ((S.board.done ?? 0) < Board.BOARD_REROLL || !atBase()) return;
    Board.reroll(S.board, data, M.ZONES.filter(zoneUnlocked).map(z => z.id), S.caught);
    toast('공고를 새로 뽑았다', 'good');
    save();
  },
  chooseStarter(line) {
    if (!S.needsStarter || !R.LINES[line] || !R.ENABLED_LINES.includes(line)) return;
    Object.assign(S, starterKit(line));
    S.needsStarter = false;
    P.hp = P.stats.hp;
    closeMenu();
    save();
    // the secretary keeps it short: the fish farm is only training (the controls come up on screen one at a time,
    // guideStep); the real job comes after it (actions.sell)
    mentorSays('로켓단 해양수산부 현장 담당 나옹이다옹. 오늘부터 네 사수다옹. 바다에 나가기 전에 교육부터 받는다옹. '
      + '먼저 기지 옆 양식장에서 잉어킹 세 마리를 잡아서 기지에 팔아라옹.');
  },
  // 자동 배치 (상태 > 기술): the open sets filled again from the moves learned, newest first but mixed (R.autoEquip)
  autoEquip() {
    const kind = k => (BLADE_MOVES.has(k) ? 'cut' : MOVE_ANIM[k]?.[0] === 'dash' ? 'dash' : data.moves[k].reach ? 'body' : 'shot');
    R.autoEquip(S.learned, data.moves, kind, setsOpen()).forEach((k, i) => { S.equip[i] = k; });
    save();
  },
  // put a move in a slot (0..7 over both sets), or empty it (key null); a move already in another slot swaps with it
  equip(slot, key) {
    if (!(slot >= 0 && slot < R.SLOTS * setsOpen()) || (key !== null && !S.learned.includes(key))) return;
    const was = key === null ? -1 : S.equip.indexOf(key);
    if (was >= 0) S.equip[was] = S.equip[slot];
    S.equip[slot] = key;
    save();
  },
  menu(name) { openMenu(name); },
  toggleOption(k) { Title.setOption(k, !Title.options[k]); }, // (설정 > 일반's switches)
  tabShown(tab) { if (tab === 'board' || tab === 'upgrade') tip(tab); }, // (the UI says which tab of the game menu is up)
  // debug: light up the whole map screen (fog of war off), dev server only
  revealMap() {
    if (!import.meta.env.DEV) return;
    MapView.explored.fill(1);
    save();
    toast('[디버그] 지도를 전부 밝혔다', 'good');
  },
  toTitle() {
    save();
    Title.leaveToTitle();
  },
};

let menu = null;
let mapOpen = false, mapTop = 0;
const mapMouse = { x: 0, y: 0 };
function openMap() { guideDone('map'); mapOpen = true; mapTop = clamp(Math.floor(P.y / M.T) - MapView.viewRows(MAP_BOX.h) / 2, 0, M.ROWS - MapView.viewRows(MAP_BOX.h)); }
function closeMap() { mapOpen = false; }
const nearNpc = () => M.scene === 'main' && M.NPCS.find(n => Math.hypot(P.x - (n.x + 0.5) * M.T, P.y - (n.y + 0.5) * M.T) < NPC_TALK_RADIUS);
const NPC_CLEAR = 12; // tiles around an NPC (its chamber and the mouth of its passage) where no wild Pokemon spawns
const NPC_TALK_RADIUS = 80; // walking this close starts the conversation

// the game menu, open on one of its pages (Tab: 포켓몬 상태, Esc: 시스템)
function openPause(tab) { closeMap(); UI.pauseTab(tab); openMenu('pause'); }
function openMenu(name) { menu = name; UI.openMenu(name, view()); }
function closeMenu() { menu = null; UI.closeMenu(); }

// ---------- NPC conversations ----------
// Upgrade NPCs sell their help through dialogue: pick an answer, pay, and the talk comes back to the same question.
const STAT_NAMES = { hp: '체력', atk: '공격력', def: '방어력', spd: '속도' };
// hello = first meeting, back = later visits, both alternating NPC (them) and player (me) lines before the question
const NPC_TALK = {
  ev: {
    hello: [['them', '…처음 보는 얼굴이군. 나는 유크시다.'], ['me', '더 강해지는 방법을 찾고 있어.'], ['them', '몸 쓰는 법이라면 알려 주겠다.']],
    back: [['them', '또 왔군.'], ['me', '단련하러 왔어.']],
    about: [['them', '노력 레벨은 능력치마다 0에서 10단계까지 있다. 한 단계마다 그 능력치가 오른다.'],
      ['them', '레벨이 높을수록 더 크게 오른다. Lv.50이면 한 단계에 약 +1.5다. 한 번 올린 것은 사라지지 않는다.']],
    ask: '무엇을 단련하겠나?', again: '또 무엇을?', more: '한 번 더 하겠나?', bye: '또 오너라.',
    // every upgrade at its max: a closing talk instead of the upgrade question
    maxed: [['them', '…이제 더 알려 줄 것이 없다.'], ['me', '덕분에 많이 강해졌어.'], ['them', '잘 써라.']],
  },
  iv: {
    hello: [['them', '앗, 손님이다! 나는 엠라이트야.'], ['me', '잠든 재능을 깨워 준다고 들었어.'], ['them', '응, 깨워 줄게!']],
    back: [['them', '또 왔구나!'], ['me', '재능을 깨우러 왔어.']],
    about: [['them', '개체값은 타고난 재능이야. 능력치마다 0부터 31까지 있어!'],
      ['them', '1 오를 때마다 Lv.50에서 능력치가 +1쯤 올라. 한 번은 작아도 31까지 다 깨우면 노력 레벨을 다 올린 것보다 커!']],
    ask: '어떤 재능을 깨워 볼까?', again: '또 깨워 볼래?', more: '한 번 더?', bye: '또 와!',
    maxed: [['them', '재능이 전부 깨어났어! 더 깨울 게 없어.'], ['me', '고마워.'], ['them', '그래도 가끔 놀러 와!']],
  },
  luck: {
    hello: [['them', '…누구냐. 나는 아그놈.'], ['me', '운을 좋게 해 준다고 들었어.'], ['them', '…좋다. 끌어올려 주지.']],
    back: [['them', '…또 너냐.'], ['me', '운을 올리러 왔어.']],
    about: [['them', '…포획 운은 그물에서 빠져나갈 확률을 한 단계마다 15%씩 줄인다.'],
      ['them', '급소 운은 급소에 맞힐 확률이다. 1/24에서 시작해서 마지막 단계면 1/6.']],
    ask: '무엇을 원하지?', again: '더 있나?', more: '한 번 더 하겠나.', bye: '…가라.',
    maxed: [['them', '…더 끌어올릴 운이 없다.'], ['me', '그래?'], ['them', '그래. …가라.']],
  },
};
const portrait = path => `${import.meta.env.BASE_URL}sprites/${path}.png`;
// the boss never shows up in person: Persian (Giovanni's partner), the boss's secretary, speaks for the boss, with its portrait
// a speech closes the game menu first and leaves it closed after (the 업무 매뉴얼 pages, about a menu tab, are not speeches)
const bossSays = (text, onEnd = null) => { closeMenu(); UI.dialog('보스 비서 페르시온', text, portrait('npc/boss'), onEnd); }; // only at a tribute
// everything else (the farm, the radio, the 우두머리) comes from Meowth, the player's senior in the field
const mentorSays = (text, onEnd = null) => { closeMenu(); UI.dialog('선배 나옹', text, portrait('npc/meowth'), onEnd); };
function npcOffers(n) {
  if (n.kind === 'luck') return [['catch', '포획 운'], ['crit', '급소 운']].map(([k, label]) => {
    const lv = S.luck[k];
    return { label, lv, max: R.LUCK_MAX, cost: R.luckCost(lv), buy: () => actions.buyLuck(k), done: `좋다. ${label} ${lv}→${lv + 1}단계.` };
  });
  const field = n.kind, max = field === 'ev' ? R.EV_MAX : R.IV_MAX;
  return Object.entries(STAT_NAMES).map(([k, name]) => {
    const lv = S[field][k];
    return { label: name, lv, max, cost: field === 'ev' ? R.evCost(lv) : R.ivCost(lv), buy: () => actions.buyStat(field, k),
      done: field === 'ev' ? `좋아. ${name} 노력 레벨 ${lv}→${lv + 1}.` : `짜잔! ${name} 개체값 ${lv}→${lv + 1}!` };
  });
}
// lead: lines before the question (null = greeting); bought: index of the upgrade just bought, which is asked about
// again right away with that answer highlighted, so holding Enter keeps buying it; focus: answer to highlight
function talkNpc(n, lead = null, bought = null, focus = bought) {
  const t = NPC_TALK[n.kind], first = !S.metNpc[n.key];
  S.metNpc[n.key] = true; S.tips.npc = true; // (its 매뉴얼 page: the talk itself explains it)
  const line = ([side, text]) => side === 'me'
    ? { who: sp(S.species).name, img: portrait(S.species), text, me: true }
    : { who: n.name, img: portrait('npc/' + n.key), text };
  const offers = npcOffers(n);
  if (offers.every(o => o.lv >= o.max)) { // nothing left to sell: (the last purchase, then) the closing talk, no answers
    return UI.talk(n.name, [...(bought !== null ? [['them', lastDone[n.key]]] : []), ...t.maxed].map(line));
  }
  const ask = bought !== null ? `${lastDone[n.key]} ${t.more}` : lead ? t.again : t.ask;
  const pages = [...(bought !== null ? [] : lead ?? (first ? [...t.hello, ...t.about] : t.back)), ['them', ask]].map(line);
  const choices = offers.map((o, i) => ({
    label: o.lv >= o.max ? `${o.label} 최대` : `${o.label} ${o.lv}→${o.lv + 1} · ₽${o.cost}`,
    disabled: o.lv >= o.max,
    run: () => {
      // short of money: say so, and keep this answer highlighted so a held Enter cannot drift onto another upgrade
      if (S.money < o.cost) return talkNpc(n, [['them', `돈이 모자란다. ₽${o.cost} 필요하다.`], ['me', '돈을 더 모아 와야겠네.']], null, i);
      o.buy();
      lastDone[n.key] = o.done;
      talkNpc(n, null, i);
    },
  }));
  choices.push({ label: '설명 다시 듣기', run: () => talkNpc(n, t.about) });
  choices.push({ label: '그만둘래', run: () => UI.talk(n.name, [line(['me', '오늘은 이만 갈게.']), line(['them', t.bye])]) });
  UI.talk(n.name, pages, choices, null, focus);
}
const lastDone = {}; // what the last purchase from each NPC did, for the "again?" line

// ---------- update ----------
let hintShown = {}, lastNpc = null, debugBright = false; // debugBright: dev-only O key, no depth darkness
function hintOnce(id, text) { if (!hintShown[id]) { hintShown[id] = true; toast(text); } }
// 조작 안내: the controls come up on screen one at a time, each when it is first of use, and go once the player has
// done it (S.guide keeps the steps done). The first step not done whose moment has come shows, a beat after the last went.
const GUIDE = [
  // a Pokemon down near the player: the net now (shown every time until one downed is caught that way)
  { id: 'down', keys: ['Q'], text: '쓰러졌다! 몇 초 안에 그물 던지기 · 쓰러진 포켓몬은 반드시 잡힌다', when: () => wilds.some(w => w.fainted && !w.netted && Math.hypot(w.x - P.x, w.y - P.y) < 220) },
  { id: 'move', keys: ['W', 'A', 'S', 'D'], text: '헤엄치기', when: () => true },
  { id: 'skill', keys: ['좌클릭', '우클릭'], text: '기술 · 마우스로 조준', when: () => true },
  { id: 'net', keys: ['Q'], text: '그물 던지기 · 체력이 낮을수록 잘 잡힌다', when: () => S.guide.skill },
  // browser / extension mouse gestures grab right-button drags; the page cannot turn them off, so say how (goes by itself)
  { id: 'gesture', keys: ['우클릭'], text: '마우스 제스처가 대신 반응하면 브라우저·확장 프로그램 설정에서 이 사이트만 꺼 주세요', when: () => !!S.equip[S.set * R.SLOTS + 1] }, // once there is a right-click move
  { id: 'dodge', keys: ['W', 'A', 'S', 'D'], text: '빨간 표시 = 곧 공격이 올 자리 · 밖으로 피하기', when: () => dodgeTime() && (!!dodgeCheck || wilds.some(w => w.tele && w.cast > 0)) },
  { id: 'berry', keys: ['R'], text: '자뭉열매 먹기 · 체력 회복', when: () => S.berries > 0 && P.hp < P.stats.hp * 0.6 },
  { id: 'base', keys: ['E'], text: '기지 메뉴 · 잡은 포켓몬 팔기', when: () => atBase() && S.bag.length > 0 },
  { id: 'map', keys: ['F', 'M'], text: '지도 · F는 누르는 동안, M은 켜고 끄기', when: () => M.scene === 'main' },
  { id: 'return', keys: ['B'], text: '어디서든 기지로 귀환', when: () => M.scene === 'main' && P.y > 160 },
  { id: 'sprint', keys: ['Shift'], text: '빠르게 헤엄치기', when: () => M.scene === 'main' && P.y > 40 },
  { id: 'jump', keys: ['Space'], text: '물 밖으로 뛰어오르기', when: () => M.scene === 'main' && P.y > 0 && P.y < 14 },
  { id: 'status', keys: ['Tab'], text: '포켓몬 상태 · 기술 배치', when: () => S.learned.length > R.SLOTS },
  { id: 'set', keys: ['휠'], text: '기술 세트 바꾸기', when: () => setsOpen() > 1 },
];
let guideGap = 0; // s before the next step may show
const guideHeld = {}; // s a held step (moving, sprinting) has been done for
function guideDone(id) { if (!S.guide.all && !S.guide[id]) { S.guide[id] = true; guideGap = 1.2; } }
function guideHold(id, on, dt, need = 0.6) { if (on && (guideHeld[id] = (guideHeld[id] ?? 0) + dt) >= need) guideDone(id); }
function guideStep() {
  if (S.guide.all || guideGap > 0 || S.needsStarter || blocked()) return null;
  return GUIDE.find(g => !S.guide[g.id] && g.when()) ?? null;
}
// 업무 매뉴얼 (TIPS): a system's page comes up the first time the player meets it, as a conversation that stops the game
// (queued while another one is up), and stays in the 매뉴얼 tab. 무전 (RADIO): 나옹's tips in a corner, each once.
const tipQueue = [];
const dodgeTime = () => M.scene !== 'tutorial' || farmStep2(); // (the 잉어킹 step leaves dodging for later)
let dodgeCheck = null; // an attack that came near the player: if it lands no hit by .at, the dodge is learned
let coachT = 0;
const RICH_AT = 3000; // money that makes 나옹 point at the 강화 tab
function tip(id) { if (!S.tips[id] && !tipQueue.includes(id)) tipQueue.push(id); }
function radio(id) { if (S.radio[id]) return; S.radio[id] = true; save(); UI.radio(RADIO[id], portrait('npc/meowth')); }
// a queued 업무 매뉴얼 page comes up once nothing else is (a page about a menu tab comes up over the menu: frame calls this
// even while the menu has the game stopped)
function flushTips() {
  if (!tipQueue.length || UI.talking() || Tribute.active() || faintedAt || Cutscene.active() || S.needsStarter) return;
  const id = tipQueue.shift(), t = TIPS[id];
  S.tips[id] = true; save();
  UI.talk('', t.lines.map(text => ({ who: '업무 매뉴얼 · ' + t.title, text, tip: true })));
}
// at the base: the first gem of the zone being worked on is handed in for analysis (its result comes with the 개인
// 업무's gem step); once analysed, all its pieces brought back are made into the key to the boss room
function baseGems() {
  const z = goalZone(); if (!z || S.rank < 1 || !atBase() || UI.talking()) return;
  const t = taskOf(z);
  if (piecesIn(z) && !S.gemSent[z.id]) {
    S.gemSent[z.id] = true; save();
    if (t.step === T.PIECE) nextStep(z, '이 반짝이는 돌, 연구부에 바로 넘겼다옹. 마침 결과가 나왔다옹. ' + TASK_LINES[z.id].appraise);
    else mentorSays('그 반짝이는 돌, 수상하다옹. 연구부에 분석을 맡겨 보겠다옹. 결과가 나오면 알려 주겠다옹.');
    return;
  }
  if (t.step === T.PIECES && piecesIn(z) >= z.treasures.length) {
    S.keys[z.id] = true; mark(`gate${z.id + 1}`);
    nextStep(z, `${z.piece} ${z.treasures.length}개를 연구부에 넘겼더니 열쇠로 만들어 줬다옹. ${KEY_PLACE[z.id]} 그 이상한 구조물, 그게 ${bossNames(z).split(' ')[0]}의 방 문이었다옹. 이 열쇠로 열린다옹.`);
    radio('gate');
  }
}
const KEY_PLACE = { 1: '연안 바닥의', 2: '심해의', 3: '해구 깊은 곳의' };
function updateCoach(dt) {
  if (dodgeCheck && S.playTime > dodgeCheck.at) { if (P.hurtAt === dodgeCheck.hurt) guideDone('dodge'); dodgeCheck = null; }
  if ((coachT -= dt) > 0) return;
  coachT = 0.5;
  if (bagCount() >= capacity()) tip('bag');
  if (M.scene !== 'main' || S.rank < 1) return;
  const z = M.zoneOfRow(Math.floor(Math.max(0, P.y) / M.T)), deep = data.zones[z.id][2];
  if (z.id === 1 && deep && M.depthOf(P.y) >= deep.depth[0]) radio('deep');
  if (P.hp < P.stats.hp * 0.3 && !S.berries && !atBase()) radio('lowhp');
  if (!atBase() && S.money >= RICH_AT) radio('rich');
  if (wilds.some(w => w.police && w.state === 'hostile' && Math.hypot(w.x - P.x, w.y - P.y) < 260)) radio('cop');
  if (!S.radio.post && takenPosts().some(p => postHave(p) >= p.n)) radio('post');
}

// the fish farm, step by step (the HUD's quest line): catch three, bring them to the base, sell them there
function tutorialQuest() {
  if (farmStep2()) { // step 2: the 콘치
    const name = sp(FARM_FOE).name;
    if (!S.bag.some(m => m.key === FARM_FOE)) return { title: '신입 교육 2', text: `덤비는 ${josa(name, '을/를')} 잡기`, note: '빨간 표시 밖으로 피하기' };
    if (!atBase()) return { title: '신입 교육 2', text: '오른쪽 기지로 돌아가기' };
    return { title: '신입 교육 2', text: `기지에서 ${name} 팔기`, note: 'E → 포획망에서 판매' };
  }
  const have = S.bag.filter(m => m.key === 'magikarp').length, got = S.karpSold + have;
  if (got < 3) return { title: '신입 교육', text: '양식장의 잉어킹 잡기', progress: [got, 3] };
  if (!atBase()) return { title: '신입 교육', text: '오른쪽 기지로 돌아가기' };
  return { title: '신입 교육', text: '기지에서 잉어킹 팔기', progress: [S.karpSold, 3], note: 'E → 포획망에서 판매' };
}

// the HUD's quest line puts what needs doing right now over the goal: a net left tied, a full net, posts to report
function urgentQuest() {
  if (S.tiedNet) { const t = Math.max(0, Math.ceil(S.tiedNet.left));
    return { title: '포획망 회수', text: '쓰러진 자리의 포획망 회수', note: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} 남음 · 지도(F)에 노란 표시` }; }
  if (!atBase() && bagCount() >= capacity()) return { title: '포획망 가득', text: '기지로 돌아가 팔기', note: 'B 귀환 → E → 포획망' };
  const n = takenPosts().filter(p => postHave(p) >= p.n).length + Object.keys(ALPHAS).filter(z => S.alphas[z] && !S.alphaPaid[z]).length;
  if (n) return { title: '의뢰 보고', text: `기지 게시판에 보고하기 · ${n}건`, note: atBase() ? 'E → 게시판' : 'B 귀환 → E → 게시판' };
  return null;
}

// the HUD's quest line for the 개인 업무's step
function taskQuest(z) {
  const t = taskOf(z), a = ALPHAS[z.id], title = `${z.name} · 개인 업무`;
  switch (t.step) {
    case T.POSTS1: case T.POSTS2: return { title, text: taskLabel(z), progress: [taskPosts(z), TASK_POSTS], note: '기지 E → 게시판에서 공고 받기' };
    case T.ALPHA: return S.alphas[z.id] ? { title, text: '기지 게시판에 우두머리 보고하기', note: 'B 귀환 → E → 게시판' }
      : { title, text: `우두머리 ${sp(a.key).name} 포획`, note: '지도(F)에 굴 표시 · 쓰러뜨리면 저절로 잡힌다' };
    case T.PIECE: return piecesIn(z) ? { title, text: '기지로 보석 가져가기', note: 'B 귀환 · 도착하면 넘긴다' }
      : { title, text: '수상한 보석 하나 가져오기', note: `${z.name} 어딘가에서 빛나고 있다` };
    case T.PIECES: return piecesIn(z) >= z.treasures.length ? { title, text: `기지로 ${z.piece} 가져가기`, note: 'B 귀환 · 열쇠로 만들어 준다' }
      : { title, text: `${z.piece} 모으기`, progress: [piecesIn(z), z.treasures.length],
      note: z.treasures.some((_, i) => S.pieceHints[z.id + '-' + i]) ? '지도(F)에 탐지 범위' : '다 모아 오면 열쇠로 만들어 준다' };
    default: return zoneBossesHeld(z, true) ? { title, text: '기지로 돌아가 보스 바치기', note: 'B 귀환 → E → 게시판에서 상납' }
      : { title, text: `${bossNames(z)} 포획`, note: '보스 방에서 쓰러뜨리면 저절로 잡힌다' };
  }
}
// the board's 개인 업무 card: the steps so far (the ones ahead hidden), what to do now, and the button for it
function taskView(z) {
  const t = taskOf(z), a = ALPHAS[z.id], ready = taskReady(z);
  const steps = [0, 1, 2, 3, 4, 5].map(i => i > t.step ? '???' : i === T.PIECE && t.step > T.PIECE ? `수상한 보석 분석 (${z.piece})` : taskLabel(z, i)
    + (i === t.step && (i === T.POSTS1 || i === T.POSTS2) ? ` ${taskPosts(z)}/${TASK_POSTS}` : i === t.step && i === T.PIECES ? ` ${piecesIn(z)}/${z.treasures.length}` : ''));
  const keys = t.step === T.ALPHA ? [a.key] : t.step >= T.BOSS ? [...new Set(z.bosses.map(([k]) => k))] : [];
  const act = !ready ? null : t.step === T.ALPHA ? ['보고하기', 'reportAlpha', [z.id]] : ['상납하기', 'offerBosses', []];
  const quote = [`${z.name}의 일부터 익혀라옹. 게시판 공고를 처리하라옹.`, TASK_LINES[z.id].alpha, TASK_LINES[z.id].posts2, TASK_LINES[z.id].piece,
    TASK_LINES[z.id].appraise, `${bossNames(z)}. 보스께 바칠 녀석이다옹.`][t.step];
  return { zone: z.name, color: z.color, step: t.step, steps, keys, shiny: t.step === T.ALPHA && !!a.shiny, held: t.step === T.ALPHA ? !!S.alphas[z.id] : zoneBossesHeld(z), ready, act, quote,
    reward: t.step === T.ALPHA ? `₽${a.reward.toLocaleString()}` : t.step >= T.BOSS ? '승진' : '' };
}

function update(dt) {
  S.playTime += dt;
  const inWater = P.y > 0;
  const input = blocked() ? {} : keys; // with a menu or the map up, held keys do nothing
  let ix = (input.KeyD ? 1 : 0) - (input.KeyA ? 1 : 0);
  let iy = (input.KeyS ? 1 : 0) - (input.KeyW ? 1 : 0);
  if ((P.cast > 0 && !P.castFree) || P.beam || P.rampage) ix = iy = 0; // no movement during cast delay (unless drawing), a channelled beam or a rampage
  // Shift sprints while stamina lasts; running dry leaves the player winded until it is full again
  const sprint = (input.ShiftLeft || input.ShiftRight) && (ix || iy) && !P.winded && P.stamina > 0;
  P.stamina = Math.max(0, Math.min(1, P.stamina + (sprint ? -dt / R.staminaSeconds(S.upgrades.stamina) : dt / STAMINA_REFILL)));
  if (P.stamina <= 0) P.winded = true;
  else if (P.winded && P.stamina >= 1) P.winded = false;
  P.staminaFull = P.stamina < 1 ? 0 : (P.staminaFull ?? STAMINA_HIDE) + dt; // s since it last filled up
  const vmax = R.moveSpeed(P.stats.spd) * (sprint ? SPRINT_MULT : 1) * (P.recharge > 0 ? 0.35 : 1) // recharging after 하이드로캐논: barely moves
    * (passive() === 'swift-swim' ? 1.5 : 1) * (P.charge ? 0.45 : 1); // 쓱쓱: 1.5x; gathering a 메가런처 shot: slowly
  updateWarp(ix || iy, dt);
  guideGap = Math.max(0, guideGap - dt); guideHold('move', ix || iy, dt); guideHold('sprint', sprint && inWater, dt);
  const step = guideStep();
  guideHold('gesture', step?.id === 'gesture', dt, 7);
  updateCoach(dt);
  baseGems();
  SFX.alarm(P.hp > 0 && P.hp <= P.stats.hp / 2 && !atBase()); // 위기 beeps (update stops while paused, and so do they)
  UI.guide(step);
  const len = Math.hypot(ix, iy) || 1;
  if (inWater) {
    P.vx += (ix / len) * vmax * 6 * dt;
    P.vy += (iy / len) * vmax * 6 * dt + 12 * dt;
    const drag = Math.pow(0.04, dt);
    P.vx *= drag; P.vy *= drag;
    const sp2 = Math.hypot(P.vx, P.vy), cap = vmax * 1.6; // ram lunges may exceed vmax briefly
    if (sp2 > cap) { P.vx *= cap / sp2; P.vy *= cap / sp2; }
  } else {
    P.vy += 500 * dt;
    // on the ground the feet grip: full speed or a stop in a few frames, no sliding; in the air steering is looser
    const acc = ((onDeck() || hitsTiles(P, P.x, P.y + 1)) ? 14 : 4) * vmax * dt;
    P.vx += clamp(ix * vmax - P.vx, -acc, acc);
  }
  // holding W against the base from the surface climbs up its side like a ladder, then steps onto the deck
  const climbing = input.KeyW && P.cast <= 0 && !P.dash && P.y < 10 && P.y + P.hh > M.DECK_TOP + 0.5 && onDeckX(P.x, 16);
  // Space / W: jump when standing on ground or the dock, or leap out of the water at the surface
  if (jumpQueued && P.cast <= 0 && !climbing) {
    if (!inWater && (onDeck() || hitsTiles(P, P.x, P.y + 1))) P.vy = -260;
    else if (inWater && P.y < 10) { P.vy = -330; guideDone('jump'); }
  }
  jumpQueued = false;
  if (climbing) {
    P.vx = P.vy = 0;
    if (!onDeckX(P.x)) P.x += (P.x < M.BASE.deck.x0 * M.T ? 1 : -1) * CLIMB_SPEED * dt;
    P.y = Math.max(M.DECK_TOP - P.hh, P.y - CLIMB_SPEED * dt);
    lastHH = P.hh;
  } else if (P.rampage) updateRampage(dt); else if (P.dash) updateDash(dt); else movePlayer(dt);
  // a charge tilts the whole body along the way it goes, so the head (Samurott's horn) points where it rams; eased in and out
  const rush = P.dash ?? (P.rampage?.phase === 'dash' ? P.rampage : null);
  const lean = rush ? Math.atan2(Math.sin(rush.ang), Math.abs(Math.cos(rush.ang))) : 0;
  P.lean = (P.lean ?? 0) + (lean - (P.lean ?? 0)) * Math.min(1, dt * 14);
  for (const b of bursts) b.at -= dt;
  for (const b of bursts.filter(b => b.at <= 0)) b.run();
  bursts = bursts.filter(b => b.at > 0);
  // facing: an attack faces where it goes (the cursor when it was used; a steered beam or a dash its own way),
  // otherwise the player faces the way they move and keeps that facing when they stop
  const aimed = P.beam ? P.beam.ang : P.dash ? P.dash.ang : P.rampage ? P.rampage.ang : P.charge ? aimAngle()
    : P.act ? (unaimed(P.act.name) ? null : P.castAng) : P.cast > 0 ? P.castAng : null;
  if (aimed !== null && aimed !== undefined) P.face = Math.cos(aimed) >= 0 ? 1 : -1;
  else if (ix) P.face = ix;

  for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
  // a move at 0 PP gets one back after PP_REGEN_SECONDS
  for (const k of S.learned) {
    if ((S.pp[k] ?? 0) > 0) { delete P.ppWait[k]; continue; }
    if ((P.ppWait[k] = (P.ppWait[k] ?? 0) + dt) >= R.PP_REGEN_SECONDS) { S.pp[k] = 1; delete P.ppWait[k]; toast(josa(data.moves[k].name, '이/가') + ' PP를 1 되찾았다'); }
  }
  P.netCd = Math.max(0, P.netCd - dt);
  P.recharge = Math.max(0, P.recharge - dt);
  const pace = P.y > 0 ? Math.hypot(P.vx, P.vy) / 90 : Math.abs(P.vx) / 70; // walk and swim cycles keep pace with the speed
  P.locoT += dt * clamp(pace, 0.6, 1.8);
  // a leap out of the water keeps the water's motions until the feet come down on the deck or the ground
  if (P.y > 0) P.wet = true; else if (onDeck() || hitsTiles(P, P.x, P.y + 1)) P.wet = false;
  shake = Math.max(0, shake - dt * 24);
  if (P.act && (P.act.t += dt * P.act.rate) >= P.act.dur) P.act = null;
  // the blades go back in after a while with no move used
  if (P.drawn && !P.act && !(P.cast > 0) && !P.beam && !P.dash && S.playTime - P.lastMoveAt >= SHEATHE_AFTER) {
    P.drawn = false; playAct(P.y > 0 ? 'sheathe_swim' : 'sheathe');
  }
  if (P.cast > 0) {
    P.cast -= dt;
    if (P.cast <= 0) fire(P, P.castMove, P.castAng, P.castOpts);
  }
  if (P.beam) updateBeam(dt);
  if (P.charge) { // 메가런처: let go (or the game took the input) and the gathered shot goes off
    P.charge.t += dt;
    if (!mouse.btn[P.charge.btn] || blocked()) { const c = P.charge; P.charge = null; P.castAng = aimAngle(); useMove(c.key, 1 + Math.min(c.t, CHARGE_FULL) / CHARGE_FULL); }
  }
  if (!blocked()) {
    const shift = keys.ShiftLeft || keys.ShiftRight; // Shift+click: the set's third and fourth moves
    if (mouse.btn[0]) tryUseMove(shift ? 2 : 0, 0);
    if (mouse.btn[2]) tryUseMove(shift ? 3 : 1, 2);
  }
  // 까칠한피부: swimming into a foe hurts it too
  if (passive() === 'rough-skin') for (const w of targetsOf(P)) if (Math.abs(w.x - P.x) < w.hw + P.hw && Math.abs(w.y - P.y) < w.hh + P.hh) roughSkin(w);
  updateQuakes(dt);

  // walking into an NPC's circle starts the talk by itself; inside it, E talks again
  const npc = nearNpc() || null;
  if (npc && npc !== lastNpc && !blocked()) talkNpc(npc);
  lastNpc = npc;
  if (atBase()) {
    if (needsReset === false || P.hp < P.stats.hp) arriveAtBase();
  }
  if (needsReset && P.y > 24) { spawnWilds(); needsReset = false; }

  const tx = Math.floor(P.x / M.T), ty = Math.floor(P.y / M.T);
  if (M.scene === 'main' && P.y > 0) { const zid = M.zoneOfRow(ty).id; if (!S.tracked['zone' + (zid + 1)]) mark('zone' + (zid + 1)); if (zid > 1) radio('zone' + zid); }
  if (M.scene === 'main') for (const z of M.ZONES) {
    if (piecesOut(z)) z.treasures.forEach((t, i) => {
      const id = z.id + '-' + i;
      if (S.treasures.includes(id) || Math.hypot(P.x - (t.x + 0.5) * M.T, P.y - (t.y + 0.5) * M.T) > 14) return;
      S.treasures.push(id);
      delete S.pieceHints[id]; // its 조각 탐지 circle goes off the map
      toast(analysed(z) ? `${z.piece} 획득! ${piecesIn(z)}/${z.treasures.length}` : '수상한 보석을 주웠다', 'good');
      if (analysed(z)) tip('pieces');
      save();
    });
    const b = z.bossRoom, d = z.bossDoor;
    // the fight starts once the door is open and the whole body is past it (so the door never shuts on the player)
    if (!bossSpawned[z.id] && !S.offered[z.id] && bossGateOpen(z) && M.inRect(tx, ty, b) && P.y - P.hh > b.y0 * M.T + 2) startBossFight(z);
    if (z.exit && Math.abs(tx - z.exit.x) < 3 && ty >= z.exit.y0 - 6 && ty <= z.exit.y1 && !gateOpen({ kind: 'exit', zone: z.id }))
      hintOnce('exit' + z.id, '굳게 닫힌 해치다. 보스를 바치면 열린다');
  }

  updateWanted(dt);
  // an urgent post not turned in by its deadline is gone
  for (const p of takenPosts()) if (p.deadline && S.playTime > p.deadline) {
    S.board.posts.splice(S.board.posts.indexOf(p), 1);
    toast(`긴급 의뢰 실패 · ${p.dept} (${Board.postGoal(p, data)})`, 'warn');
  }

  if (S.tiedNet) {
    S.tiedNet.left -= dt;
    if ((S.tiedNet.scene ?? 'main') === M.scene && Math.hypot(P.x - S.tiedNet.x, P.y - S.tiedNet.y) < 16) {
      S.bag.push(...S.tiedNet.mons);
      toast('묶어 둔 포획망을 회수했다!', 'good');
      S.tiedNet = null;
    } else if (S.tiedNet.left <= 0) {
      const freed = releaseAlphas(S.tiedNet.mons);
      toast('묶어 둔 포획망이 풀려 포켓몬이 도망쳤다...' + (freed.length ? ` 우두머리 ${freed.join(', ')}도` : ''), 'warn');
      S.tiedNet = null;
    }
  }

  updateLag(P, dt);
  for (const w of wilds) { updateLag(w, dt); w.flashT = Math.max(0, (w.flashT ?? 0) - dt); }
  updateSquad(dt); updateBossRoom(dt);
  for (const w of [...wilds]) updateWild(w, dt);
  updateShots(dt);
  for (const f of fx) f.t += dt;
  fx = fx.filter(f => f.t < f.dur);
  for (const n of numbers) { n.t += dt; n.y -= 20 * dt; }
  numbers = numbers.filter(n => n.t < 0.8);

  for (const w of wilds) if (!S.seen[w.key] && Math.hypot(w.x - P.x, w.y - P.y) < 120) S.seen[w.key] = 1;
  if (M.scene === 'main') MapView.reveal(P.x, P.y, Math.max(5, R.lampRadius(S.upgrades.lamp) / M.T));
  if (P.hp <= 0) playerFaint();
}

// ---------- teleport (map points: base, met NPCs, unlocked zone portals) ----------
// From the base a teleport is instant; anywhere else you stand still and unhurt for WARP_SECONDS first.
function warpPoints() {
  if (M.scene !== 'main') return [];
  const pts = [{ name: '해상기지', tx: Math.floor(M.BASE.x / M.T), ty: 0, go: () => { placeAtBase(); arriveAtBase(); } }];
  for (const n of M.NPCS) if (S.metNpc[n.key])
    pts.push({ name: n.name, tx: n.x, ty: n.y, go: () => { P.x = (n.x + 0.5) * M.T; P.y = (n.y + 0.5) * M.T + 20; } });
  for (const z of M.ZONES) if (z.portal && S.offered[z.id - 1])
    pts.push({ name: z.name + ' 포탈', tx: z.portal.x, ty: z.portal.y, go: () => { P.x = (z.portal.x + 0.5) * M.T; P.y = (z.portal.y + 0.5) * M.T; } });
  return pts;
}
// the teleport point under the map cursor, if any
function hoveredWarp() {
  const { tx, ty } = MapView.pickTile(MAP_BOX, mapTop, mapMouse.x, mapMouse.y);
  const pick = warpPoints().map(p => ({ p, d: Math.hypot(p.tx - tx, p.ty - ty) })).sort((a, b) => a.d - b.d)[0];
  return pick && pick.d <= 8 ? pick.p : null;
}
function clickMap() {
  const p = hoveredWarp();
  if (p) { closeMap(); startWarp(p); return; }
  if (import.meta.env.DEV && M.scene === 'main') debugWarp(); // debug: anywhere on the map, instantly
}
// debug teleport: the nearest open spot (where the body fits) to the clicked map point
function debugWarp() {
  const { tx, ty } = MapView.pickTile(MAP_BOX, mapTop, mapMouse.x, mapMouse.y);
  for (let r = 0; r <= 12; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (Math.floor(tx) + dx + 0.5) * M.T, y = (Math.floor(ty) + dy + 0.5) * M.T;
      if (y > 0 && !hitsTiles(P, x, y)) {
        closeMap();
        P.x = x; P.y = y; P.vx = P.vy = 0; P.beam = null; P.dash = null; warp.active = false;
        toast('[디버그] 순간이동', 'good');
        return;
      }
    }
  toast('[디버그] 그 근처에는 들어갈 곳이 없다', 'warn');
}
function startWarp(p) {
  if (arena) { toast('보스전 중에는 빠져나갈 수 없다!', 'warn'); return; }
  if (atBase() || M.scene !== 'main') return finishWarp(p);
  Object.assign(warp, { active: true, t: 0, from: S.playTime, target: p });
  guideDone('return');
}
function finishWarp(p) {
  warp.active = false;
  P.vx = P.vy = 0; P.beam = null; P.dash = null;
  fx.push({ kind: 'warp', x: P.x, y: P.y, t: 0, dur: 0.45 });
  p.go();
  fx.push({ kind: 'warp', x: P.x, y: P.y, t: 0, dur: 0.6, arrive: true });
  toast(josa(p.name, '으로/로') + ' 이동했다', 'good');
}
function updateWarp(moving, dt) {
  if (!warp.active) return;
  if (moving || P.cast > 0 || (P.hurtAt ?? -1) >= warp.from) {
    warp.active = false;
    toast('순간이동이 취소됐다', 'warn');
    return;
  }
  warp.t += dt;
  if (warp.t >= WARP_SECONDS) finishWarp(warp.target);
}

// Fleeing: look around and pick the way with the most open water (or ground) that also leads away from the player.
// When every way away is short (backed into a corner), the open way past the player wins and the mon bolts (panic).
const FLEE_RETHINK = 0.3, FLEE_LOOK = 72, FLEE_HOP = 200, FLEE_HOP_TILES = 3; // hop: 200px/s up against 300px/s² gravity, about 4 tiles
function clearAlong(w, ang) { // free distance for the body along a direction, up to FLEE_LOOK
  const cx = Math.cos(ang), cy = Math.sin(ang);
  for (let s = 6; s <= FLEE_LOOK; s += 6) if (hitsTiles(w, w.x + cx * s, w.y + cy * s) || w.y + cy * s < 12) return s - 6;
  return FLEE_LOOK;
}
function clearWalk(w, dir) { // how far a fleeing walker can go: it drops off ledges and hops walls up to FLEE_HOP_TILES
  for (let s = 6; s <= FLEE_LOOK; s += 6) if (hitsTiles(w, w.x + dir * s, w.y - FLEE_HOP_TILES * M.T)) return s - 6;
  return FLEE_LOOK;
}
function pickFlee(w, dx, dy) {
  const away = Math.atan2(-dy, -dx);
  if (w.motion === 'crawl') {
    const score = dir => { const c = clearWalk(w, dir); return 2 * c / FLEE_LOOK + (dir === -Math.sign(dx || 1) ? 0.8 : 0) + (dir === w.fleeDir ? 0.15 : 0) - (c < 12 ? 3 : 0); };
    w.fleeDir = score(-1) > score(1) ? -1 : 1;
    w.panic = w.fleeDir === Math.sign(dx || 1); // running toward (past) the player
    return;
  }
  let best = away, bestScore = -Infinity, bestClear = 0;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, clear = clearAlong(w, a);
    const along = -(dx * Math.cos(a) + dy * Math.sin(a)); // >0 heads away from the player
    const side = Math.abs(dx * Math.sin(a) - dy * Math.cos(a)); // how wide it passes the player when heading toward them
    const score = 1.5 * clear / FLEE_LOOK + 0.8 * Math.cos(a - away) - (along < 0 && side < 20 ? 0.8 : 0) - (clear < 12 ? 3 : 0) // a blocked way never wins
      + (w.fleeAng !== undefined && Math.cos(a - w.fleeAng) > 0.9 ? 0.15 : 0);
    if (score > bestScore) { bestScore = score; best = a; bestClear = clear; }
  }
  w.fleeAng = best;
  w.panic = Math.cos(best - away) < 0 && bestClear > 24; // the way out leads back past the player
}

function steer(w, ang, speed, dt) {
  w.vx += Math.cos(ang) * speed * 4 * dt;
  w.vy += Math.sin(ang) * speed * 4 * dt;
}

// ---------- 우두머리 (a side story, one per zone) ----------
// Each zone has one 우두머리: a big, red-glowing Pokemon in a den of its own, with three patterns of its own (each wound up
// and marked like any wild attack). The secretary radios in when the player first comes near (alphaSeen). Each one is also
// a 현상수배 pinned on the board once its zone opens (taken: its den on the map, a side quest); caught, it is reported
// there for the bonus (alphaPaid). Caught is for good (S.alphas); a trip that ends without the catch brings it back whole.
// Down, it stays down (like a boss) until netted, and a net on a downed one always holds.
const ALPHAS = {
  1: { key: 'wishiwashi', school: true, level: 28, scale: 1.6, mult: { hp: 7, atk: 1.3, def: 1.3 }, reward: 6000, patterns: ['rush', 'spray', 'whirl'],
    intro: '무전이다옹. 네 앞의 물고기 떼, 약어리 무리다옹. 연안 어부들 그물을 전부 찢어 놓은 놈들이다옹. 떼를 흩어 놓고 우두머리를 잡아 오라옹. 본사 지시는 아니다옹. 수당은 따로 나온다옹.',
    poster: '연안 어부들의 그물을 찢고 다니는 약어리 무리. 떼를 흩어 놓고 우두머리를 잡아 와라.',
    outro: '약어리 우두머리 확보 확인이다옹. 수당 ₽6,000 입금했다옹. 어부들이 한동안 조용하겠다옹.' },
  2: { key: 'dhelmise', level: 58, scale: 1.4, mult: { hp: 5, atk: 1.6, def: 1.6 }, reward: 18000, patterns: ['slam', 'spin', 'chain'],
    intro: '그 닻에서 떨어지라옹! …이미 늦었다옹. 타타륜이다옹. 침몰선에서 우리 잠수정 셋을 끌고 들어간 놈이다옹. 닻이 떨어지는 자리를 잘 보라옹.',
    poster: '심해 침몰선에서 우리 잠수정 셋을 끌고 들어간 닻의 주인. 타타륜을 잡아 와라.',
    outro: '타타륜 확보다옹. 잠수정 셋의 빚은 갚았다옹. 수당 ₽18,000이다옹. …잘했다옹.' },
  3: { key: 'gyarados', shiny: true, level: 88, scale: 1.25, mult: { hp: 5, atk: 2, def: 2 }, reward: 45000, patterns: ['hyper', 'thrash', 'storm'],
    intro: '붉은 갸라도스다옹. 분노가 끝까지 차오른 갸라도스는 몸이 붉게 물든다옹. 보스께서 직접 보고 싶어 하신다옹. 입이 빛나면 피하라옹. 파괴광선이다옹.',
    poster: '해구 깊은 곳의 붉은 갸라도스. 보스께서 직접 보고 싶어 하신다.',
    outro: '붉은 갸라도스 확보다옹! 보스께서 흡족해하신다옹. 수당 ₽45,000이다옹. 이건 네 이름으로 올려 두었다옹.' },
};
const ALPHA_IV_MIN = 25; // a 우두머리 caught is a strong one
// the patterns' blows (power and type, for the damage roll and the hit sound)
const ALPHA_MOVES = {
  rush: { name: '떼 돌진', type: 'water', power: 75 }, spray: { name: '물대포 세례', type: 'water', power: 40 }, whirl: { name: '소용돌이', type: 'water', power: 80 },
  slam: { name: '닻 내려찍기', type: 'steel', power: 110 }, spin: { name: '닻 회전', type: 'ghost', power: 75 }, chain: { name: '그림자 갈고리', type: 'ghost', power: 50 },
  hyper: { name: '파괴광선', type: 'normal', power: 140 }, thrash: { name: '몸부림', type: 'dragon', power: 70 }, storm: { name: '폭풍', type: 'flying', power: 85 },
  // (the bosses' patterns: a hit takes about a third of the HP of a player at the boss's level, see GAME_DESIGN.md)
  aero: { name: '에어로블라스트', type: 'flying', power: 80 }, twister: { name: '회오리', type: 'flying', power: 25 }, dive: { name: '내리꽂기', type: 'flying', power: 70 },
  pulse: { name: '근원의파동', type: 'water', power: 35 }, surf: { name: '파도타기', type: 'water', power: 40 }, thunder: { name: '뇌우', type: 'electric', power: 35 }, tidal: { name: '해일', type: 'water', power: 45 },
};
// each pattern: its wind-up (s), the cooldown after, the area it marks (telegraph shapes) and what it does when it goes
const ALPHA_PATTERNS = {
  // 루기아: a thick locked beam / whirlwind pillars at the room's edge pulling the player in / gone up, then down on its shadow
  aero: { windup: 0.85, cd: 1.8, tele: (w, ang) => { const o = muzzle(w, ang); return { kind: 'line', x: o.x, y: o.y, ang: o.ang, len: rayLength(o.x, o.y, Math.cos(o.ang), Math.sin(o.ang), 420), half: 13 }; },
    go: (w, t) => {
      hitLine(w, t.x, t.y, Math.cos(t.ang), Math.sin(t.ang), t.len, t.half, ALPHA_MOVES.aero);
      fx.push({ kind: 'ray', x: t.x, y: t.y, ang: t.ang, len: t.len, half: t.half, color: '#e8f4ff', t: 0, dur: 0.45 }); shake = Math.max(shake, 6); SFX.play('channel');
    } },
  twister: { windup: 0.5, cd: 2.4, tele: () => null,
    go: w => {
      const n = w.phased ? 3 : 2, c = roomCentre(), R0 = roomRadius() * 0.72, a0 = Math.random() * 7;
      for (let i = 0; i < n; i++) { const a = a0 + i * Math.PI * 2 / n; hazards.push({ kind: 'vortex', owner: w, x: c.x + Math.cos(a) * R0, y: c.y + Math.sin(a) * R0, r: 120, t: 0, warm: 0.9, life: 4.5 }); }
      SFX.play('wave');
    } },
  dive: { windup: 1.5, cd: 2, tele: w => { w.hide = true; return { kind: 'circle', x: P.x, y: P.y, r: Math.max(w.hw, w.hh) + 18 }; },
    during: (w, dt) => { if (w.cast > 0.45) { const k = Math.min(1, dt * 4); w.tele.x += (P.x - w.tele.x) * k; w.tele.y += (P.y - w.tele.y) * k; } }, // the shadow follows, then locks
    go: (w, t) => {
      w.hide = false; const c = roomCentre(), d = Math.hypot(t.x - c.x, t.y - c.y), lim = roomRadius() - Math.max(w.hw, w.hh) - 4, k = d > lim ? lim / d : 1;
      w.x = c.x + (t.x - c.x) * k; w.y = c.y + (t.y - c.y) * k; w.vx = w.vy = 0;
      alphaArea(w, t.x, t.y, t.r, 'dive', 300); fx.push({ kind: 'quake', x: t.x, y: t.y, color: TYPE_COLOR.flying, t: 0, dur: 0.5, reach: t.r + 10 }); shake = Math.max(shake, 8); SFX.play('quake'); w.rest = 0.7;
    } },
  // 가이오가: rings rolling out with a gap to slip through / a surf charge (dazed when it hits the wall) / lightning on
  // marked spots / a tidal wall across the room with one gap
  pulse: { windup: 0.7, cd: 2.2, tele: w => ({ kind: 'circle', follow: true, r: Math.max(w.hw, w.hh) + 26 }),
    go: w => {
      const sets = w.phased ? 2 : 1;
      // each ring has two wide gaps (opposite each other), the next ring's turned a little further, so there is a lane to weave along
      for (let s2 = 0; s2 < sets; s2++) { let g = Math.atan2(P.y - w.y, P.x - w.x) + (Math.random() - 0.5);
        for (let i = 0; i < 3; i++, g += (Math.random() < 0.5 ? -1 : 1) * 0.7)
          hazards.push({ kind: 'ring', owner: w, x: w.x, y: w.y, r: Math.max(w.hw, w.hh), v: 95, delay: s2 * 2 + i * 0.7, gaps: [g, g + Math.PI], width: 6, hitDone: false }); }
      fx.push({ kind: 'quake', x: w.x, y: w.y, color: TYPE_COLOR.water, t: 0, dur: 0.5, reach: 60, follow: w }); SFX.play('sound');
    } },
  surf: { windup: 0.9, cd: 2, tele: (w, ang) => ({ kind: 'line', follow: true, ang, len: rayLength(w.x, w.y, Math.cos(ang), Math.sin(ang), 520), half: w.hh * 0.8 }),
    go: (w, t) => { w.dash = { ang: t.ang, v: 400, t: t.len / 400 + 0.3, move: 'surf', stun: 1.8 }; fx.push({ kind: 'bigsplash', x: w.x, y: w.y, reach: 40, t: 0, dur: 0.6, seed: seed() }); SFX.play('ram'); } },
  thunder: { windup: 0.4, cd: 2, tele: () => null,
    go: w => {
      const n = w.phased ? 7 : 5;
      for (let i = 0; i < n; i++) { const a = Math.random() * 7, d = i ? 30 + Math.random() * 90 : 0; hazards.push({ kind: 'mark', owner: w, x: P.x + Math.cos(a) * d, y: P.y + Math.sin(a) * d, r: 26, t: 0, max: 1 + i * 0.18, move: 'thunder' }); }
    } },
  tidal: { windup: 0.4, cd: 2.6, tele: () => null,
    go: w => {
      const b = roomPx(), fromLeft = P.x > (b.x0 + b.x1) / 2, gapY = b.y0 + 50 + Math.random() * (b.y1 - b.y0 - 100);
      hazards.push({ kind: 'wave', owner: w, x: fromLeft ? b.x0 : b.x1, dir: fromLeft ? 1 : -1, v: 150, delay: 1.1, gapY, gapHalf: 26, b, hitDone: false });
      SFX.play('wave');
    } },
  // 약어리 (무리): the whole school rushes along a line / sprays a fan of water / opens a whirlpool where the player is
  rush: { windup: 0.8, cd: 1.6, tele: (w, ang) => ({ kind: 'line', follow: true, ang, len: 170, half: w.hh * 0.8 }),
    go: (w, t) => { w.dash = { ang: t.ang, v: 340, t: 170 / 340, move: 'rush' }; SFX.play('ram'); } },
  spray: { windup: 0.7, cd: 1.4, tele: (w, ang) => ({ kind: 'cone', follow: true, ang, r: 160, half: 0.45 }),
    go: (w, t) => { for (let i = 0; i < 7; i++) alphaShot(w, t.ang + (i - 3) * 0.14, 210, 0.75, 4, 'spray', 'orb'); SFX.play('stream'); } },
  whirl: { windup: 1.0, cd: 1.8, tele: () => ({ kind: 'circle', x: P.x, y: P.y, r: 34 }),
    go: (w, t) => { alphaArea(w, t.x, t.y, t.r, 'whirl', 0); fx.push({ kind: 'bigsplash', x: t.x, y: t.y, reach: t.r, t: 0, dur: 0.6, seed: seed() }); SFX.play('wave'); } },
  // 타타륜: the anchor slams down where the player stands / sweeps all around / a shadow chain hooks and drags the player in
  slam: { windup: 0.9, cd: 1.6, tele: () => ({ kind: 'circle', x: P.x, y: P.y, r: 30 }),
    go: (w, t) => { alphaArea(w, t.x, t.y, t.r, 'slam', 0); fx.push({ kind: 'quake', x: t.x, y: t.y, color: TYPE_COLOR.steel, t: 0, dur: 0.45, reach: t.r }); shake = Math.max(shake, 5); SFX.play('quake'); } },
  spin: { windup: 0.8, cd: 1.6, tele: w => ({ kind: 'circle', follow: true, r: Math.max(w.hw, w.hh) + 42 }),
    go: (w, t) => { alphaArea(w, w.x, w.y, t.r, 'spin', 260); fx.push({ kind: 'sweep', x: w.x, y: w.y, color: TYPE_COLOR.ghost, t: 0, dur: 0.35, reach: t.r, follow: w }); SFX.play('slash'); } },
  chain: { windup: 0.6, cd: 1.3, tele: (w, ang) => ({ kind: 'line', follow: true, ang, len: rayLength(w.x, w.y, Math.cos(ang), Math.sin(ang), 210), half: 5 }),
    go: (w, t) => {
      const c = Math.cos(t.ang), sn = Math.sin(t.ang), along = clamp((P.x - w.x) * c + (P.y - w.y) * sn, 0, t.len);
      if (boxDist(P, w.x + c * along, w.y + sn * along) <= t.half) { hit(w, P, ALPHA_MOVES.chain); shove(t.ang + Math.PI, 340); } // hooked: dragged in
      fx.push({ kind: 'ray', x: w.x, y: w.y, ang: t.ang, len: t.len, half: 2, color: TYPE_COLOR.ghost, t: 0, dur: 0.3 }); SFX.play('snipe');
    } },
  // 붉은 갸라도스: a long 파괴광선 (then a rest) / three charges in a row / a storm blowing out all around it
  hyper: { windup: 1.1, cd: 2.2, tele: (w, ang) => { const o = muzzle(w, ang); return { kind: 'line', x: o.x, y: o.y, ang: o.ang, len: rayLength(o.x, o.y, Math.cos(o.ang), Math.sin(o.ang), 280), half: 9 }; },
    go: (w, t) => {
      hitLine(w, t.x, t.y, Math.cos(t.ang), Math.sin(t.ang), t.len, t.half, ALPHA_MOVES.hyper);
      fx.push({ kind: 'ray', x: t.x, y: t.y, ang: t.ang, len: t.len, half: t.half, color: '#ffe8a0', t: 0, dur: 0.4 });
      shake = Math.max(shake, 6); w.rest = 1.6; SFX.play('channel'); // spent: it rests a moment after (the opening)
    } },
  thrash: { windup: 0.55, cd: 1.8, tele: (w, ang) => ({ kind: 'line', follow: true, ang, len: 120, half: w.hh * 0.7 }),
    go: (w, t) => {
      w.thrashLeft = (w.thrashLeft ?? 3) - 1;
      w.dash = { ang: t.ang, v: 360, t: 120 / 360, move: 'thrash', then: () => { if (w.thrashLeft > 0) startPattern(w, 'thrash', 0.4); else w.thrashLeft = null; } };
      SFX.play('ram');
    } },
  storm: { windup: 1.0, cd: 2, tele: w => ({ kind: 'circle', follow: true, r: Math.max(w.hw, w.hh) + 56 }),
    go: (w, t) => {
      alphaArea(w, w.x, w.y, t.r, 'storm', 320);
      for (let i = 0; i < 10; i++) alphaShot(w, i * Math.PI / 5, 190, 0.8, 4, 'storm', 'wave');
      fx.push({ kind: 'quake', x: w.x, y: w.y, color: TYPE_COLOR.flying, t: 0, dur: 0.5, reach: t.r, follow: w }); shake = Math.max(shake, 4); SFX.play('sound');
    } },
};
const shove = (ang, v) => { P.vx += Math.cos(ang) * v; P.vy += Math.sin(ang) * v; };
// a pattern's blow on the player if inside the circle, pushing them out by push
function alphaArea(w, x, y, r, key, push) {
  if (boxDist(P, x, y) > r) return;
  hit(w, P, ALPHA_MOVES[key]);
  if (push) shove(Math.atan2(P.y - y, P.x - x), push);
}
function alphaShot(w, ang, speed, ttl, r, key, shape) {
  const m = ALPHA_MOVES[key];
  shots.push({ x: w.x + Math.cos(ang) * w.hw, y: w.y + Math.sin(ang) * w.hh, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, ang, ttl, r,
    owner: w, move: m, color: TYPE_COLOR[m.type], shape, hitSet: new Set() });
}
function startPattern(w, key, windup) {
  const def = ALPHA_PATTERNS[key];
  w.pattern = key; w.castAng = Math.atan2(P.y - w.y, P.x - w.x);
  w.cast = w.castMax = windup ?? def.windup;
  w.tele = def.tele(w, w.castAng);
  w.cd = def.cd;
}
function spawnAlpha(z) {
  const a = ALPHAS[z.id];
  if (!a || S.alphas[z.id] || taskOf(z).step < T.ALPHA) return; // out from its 개인 업무 step on
  const box = a.school ? schoolBox() : scaledBox(spriteBox(a.key, !!a.shiny), a.scale);
  let pos = S.alphaPos[z.id];
  if (!pos) { // its den: an open spot in the zone's lower half, kept for good (the map never changes)
    const p = waterTileIn(z.xMin, M.COLS - 2, z.y0 + Math.floor((z.y1 - z.y0) * 0.4), z.y1 - 4, sp(a.key).motion !== 'swim', 400, 0.8, box)
      ?? waterTileIn(z.xMin, M.COLS - 2, z.y0 + 10, z.y1 - 4, sp(a.key).motion !== 'swim', 400, 0.5, box);
    if (!p) return;
    pos = S.alphaPos[z.id] = { x: p.x, y: p.y };
  }
  const iv = Object.fromEntries(Object.entries(R.randomIV()).map(([k, v]) => [k, Math.max(ALPHA_IV_MIN, v)]));
  const w = makeWild(a.key, a.level, pos.x, pos.y, { zone: z.id, shiny: !!a.shiny, mult: a.mult, iv, scale: a.school ? 1 : a.scale });
  Object.assign(w, { alpha: a, home: { ...pos }, temper: 'aggro', cd: 0.8 });
  if (a.school) Object.assign(w, { school: true, ...fitBox({ ...box, ready: true }) });
  wilds.push(w);
}
// a 우두머리's turn while hostile: rushing along a dash, resting after 파괴광선, winding up a pattern, or closing in
// and picking the next pattern (never the same twice in a row). Returns the walking speed it wants (crawlers).
function alphaAct(w, dt, dx, dy, d, speed) {
  if (w.dash) {
    const k = w.dash;
    k.t -= dt; w.vx = Math.cos(k.ang) * k.v; w.vy = Math.sin(k.ang) * k.v;
    if (!k.hit && boxDist(P, w.x, w.y) < 4) { k.hit = true; hit(w, P, ALPHA_MOVES[k.move]); shove(k.ang, 240); }
    const wall = hitsTiles(w, w.x + Math.cos(k.ang) * 3, w.y + Math.sin(k.ang) * 3);
    if (k.t <= 0 || wall) {
      w.dash = null; w.vx *= 0.2; w.vy *= 0.2;
      if (wall && k.stun) { w.rest = k.stun; w.dazed = k.stun; shake = Math.max(shake, 7); fx.push({ kind: 'quake', x: w.x, y: w.y, color: '#ffffff', t: 0, dur: 0.5, reach: 50 }); SFX.play('quake'); } // into the wall: dazed, the opening
      k.then?.();
    }
    return 0;
  }
  if (w.rest > 0) { w.rest -= dt; return 0; }
  if (w.cast > 0) {
    ALPHA_PATTERNS[w.pattern].during?.(w, dt);
    w.cast -= dt;
    if (w.cast <= 0) { const t = w.tele; w.tele = null; ALPHA_PATTERNS[w.pattern].go(w, t); }
    return 0;
  }
  const ai = w.alpha ?? w.ai, fast = w.ai && w.phased ? w.ai.phase : null;
  const busy = w.ai && hazards.some(h => h.owner === w && h.kind !== 'vortex'); // a boss waits till its rings, bolts and waves are gone
  if (busy && w.cd < 0.4) w.cd = 0.4;
  if (w.cd <= 0 && d < (ai.range ?? 200)) {
    const pool = ai.patterns.filter(k => k !== w.lastPattern);
    w.lastPattern = pool[Math.floor(Math.random() * pool.length)];
    startPattern(w, w.lastPattern, fast && ALPHA_PATTERNS[w.lastPattern].windup * fast.windup);
    if (w.ai) w.cd = (w.cd + w.ai.gap) * (fast ? fast.cd : 1); // the boss's breather between patterns
    return 0;
  }
  if (d > (ai.keep ?? 70)) { steer(w, Math.atan2(dy, dx), speed, dt); return Math.sign(dx) * speed; }
  return 0;
}
// the school breaks up when worn down: one small 약어리 left, which flees (and is the one to catch)
function breakSchool(w) {
  w.school = false; w.cast = 0; w.tele = null; w.dash = null; w.state = 'flee'; w.temper = 'fleeFlee';
  Object.assign(w, fitBox(scaledBox(spriteBox(w.key, w.shiny), w.scale = 1.6)));
  fx.push({ kind: 'bigsplash', x: w.x, y: w.y, reach: 40, t: 0, dur: 0.7, seed: seed() });
  toast('약어리 무리가 흩어졌다 · 우두머리가 도망친다', 'warn');
}
// 우두머리 that leave the player's hands before they are reported (the net confiscated, a tied net come undone) are free
// again: back in their dens next trip. Returns their names.
function releaseAlphas(mons) {
  const names = [];
  for (const m of mons) if (m.alpha && !S.alphaPaid[m.alpha]) { delete S.alphas[m.alpha]; names.push(sp(m.key).name); }
  return names;
}
// the school (어군폼) is its own sprite, drawn SCHOOL_PX across; its box follows that size
const SCHOOL_KEY = 'wishiwashi-school', SCHOOL_PX = 84;
const schoolBox = () => { const img = sprite(SCHOOL_KEY, false), k = img ? SCHOOL_PX / Math.max(img.width, img.height) : 0;
  return img ? { hw: img.width * k * 0.4, hh: img.height * k * 0.45 } : { hw: 32, hh: 30 }; };

// Wild attacks are read before they land: every one winds up for at least WILD_WINDUP s (bosses BOSS_WINDUP) with the
// aim locked, the body blinking and drawing back, a big ! over the head, and the area it will hit marked on the water
// in red, filling up as the wind-up runs out. Step out of the mark and it misses.
const WILD_WINDUP = 0.45, BOSS_WINDUP = 0.6;
const SHOT_SPEED = { stream: 240, orb: 170, beam: 420, wave: 150, blade: 260, ring: 170, leaf: 150 }; // as fireMove's
// the area a wild's move will hit, fired at ang from where it stands now: a cone (melee), a line (shots, rays, a
// charge) or a circle (rocks dropped on a spot)
function telegraph(w, m, ang) {
  if (m.shape === 'drop') { const p = aimPoint(w, ang, DROP_RANGE); return { kind: 'circle', x: p.x, y: p.y, r: m.power >= 70 ? 26 : 14 }; }
  if (m.shape === 'ram') return { kind: 'line', follow: true, ang, len: m.reach + w.hw + 60, half: Math.max(w.hw, w.hh) };
  if (m.reach) return { kind: 'cone', follow: true, ang, r: m.reach + Math.max(w.hw, w.hh), half: m.shape === 'jab' ? 0.45 : 1.2 };
  const o = muzzle(w, ang);
  if (m.shape === 'ray' || m.shape === 'bolt') return { kind: 'line', x: o.x, y: o.y, ang: o.ang, len: rayLength(o.x, o.y, Math.cos(o.ang), Math.sin(o.ang), RAY_RANGE), half: m.power >= 90 ? 5 : 3 };
  const speed = SHOT_SPEED[m.shape] ?? 200, r = m.shape === 'wave' ? 6 : m.power >= 100 ? 6 : 4;
  return { kind: 'line', x: o.x, y: o.y, ang: o.ang, len: rayLength(o.x, o.y, Math.cos(o.ang), Math.sin(o.ang), speed * (m.shape === 'beam' ? 0.35 : 0.8)), half: r };
}
function drawTelegraph(w, ox, oy, now) {
  const t = w.tele, k = 1 - Math.max(0, w.cast) / (w.castMax || 1); // 0 when it starts, 1 as it fires
  ctx.save();
  ctx.translate((t.follow ? w.x : t.x) - ox, (t.follow ? w.y : t.y) - oy); // melee marks move with the attacker
  const shape = (fill) => { // the whole area (fill = 1) or the part filled so far
    ctx.beginPath();
    if (t.kind === 'circle') ctx.arc(0, 0, t.r * fill, 0, 7);
    else if (t.kind === 'cone') { ctx.moveTo(0, 0); ctx.arc(0, 0, t.r * fill, t.ang - t.half, t.ang + t.half); ctx.closePath(); }
    else { ctx.rotate(t.ang); ctx.rect(0, -t.half, t.len * fill, t.half * 2); ctx.rotate(-t.ang); }
  };
  const blink = k > 0.7 && Math.floor(now * 20) % 2; // the last moments flash
  ctx.fillStyle = 'rgba(255, 40, 60, 0.16)'; shape(1); ctx.fill();
  ctx.fillStyle = blink ? 'rgba(255, 230, 230, 0.4)' : 'rgba(255, 40, 60, 0.32)'; shape(k); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 70, 90, 0.85)'; ctx.lineWidth = 1; shape(1); ctx.stroke();
  ctx.restore();
}

function updateWild(w, dt) {
  if (w.school && !w.schoolFit && sprite(SCHOOL_KEY, false)) { w.schoolFit = true; Object.assign(w, fitBox({ ...schoolBox(), ready: true })); }
  if (!w.boxed && !w.school) {
    const b = scaledBox(spriteBox(w.key, w.shiny), w.scale ?? 1);
    if (b.ready && !hitsTiles(b, w.x, w.motion === 'swim' ? w.y : w.y + w.hh - b.hh)) {
      if (w.motion !== 'swim') w.y += w.hh - b.hh; // keep the feet where they were
      Object.assign(w, fitBox(b));
    }
  }
  if (w.autoCatch && S.playTime >= w.autoCatch && !w.netted) { // the downed boss caught by itself
    w.autoCatch = 0; fx.push({ kind: 'netwrap', x: w.x, y: w.y, t: 0, dur: 1, follow: w, r: w.r }); resolveNet(w, true); return;
  }
  if (w.fainted) {
    w.fainted -= dt;
    w.vx *= 0.9; w.vy = w.vy * 0.9 + 6 * dt;
    if (!w.netted && w.fainted <= 0) {
      wilds.splice(wilds.indexOf(w), 1);
      gainExp(wildExp(w)); // exp arrives when the fainted mon disappears
      return;
    }
  }
  if (w.netted) {
    w.netted -= dt;
    w.vx = w.vy = 0;
    if (w.netted <= 0) resolveNet(w);
    return;
  }
  if (w.fainted) { moveBody(w, dt); return; }

  const dx = P.x - w.x, dy = P.y - w.y, d = Math.hypot(dx, dy);
  const speed = R.moveSpeed(w.stats.spd) * 0.75;
  const m = data.moves[w.move];
  if (w.state === 'calm') {
    if (d < DETECT && P.y > 0) {
      if (w.police) { if (wantedStars() >= R.WANTED_HOSTILE) becomeHostile(w); } // 돌핀맨: only a wanted player
      else if (w.temper === 'aggro') becomeHostile(w);
      else if (FLEES_ON_SIGHT[w.temper]) w.state = 'flee';
    }
  } else if (!w.boss && w.key !== MIGHTY && d > LEASH * (w.police ? 2 : 1)) w.state = 'calm'; // the police chase further, the 마이티폼 for good
  if (w.alpha && !S.alphaSeen[w.zone] && d < 170 && P.y > 0) { S.alphaSeen[w.zone] = true; save(); mentorSays(w.alpha.intro); tip('alpha'); } // the radio call
  if (w.school && w.hp < w.stats.hp * 0.25) breakSchool(w);
  if (w.alpha && w.state === 'calm' && Math.hypot(w.home.x - w.x, w.home.y - w.y) > 48) steer(w, Math.atan2(w.home.y - w.y, w.home.x - w.x), R.moveSpeed(w.stats.spd) * 0.5, dt); // back to its den
  const hostile = w.state === 'hostile';
  if (w.state !== 'flee') w.panic = false;
  let wantX = 0; // horizontal speed the mon is trying to walk at (crawlers on the ground)
  const prevVx = w.vx;
  w.cd -= dt;
  if (w.boss && w.slot && squadOn()) squadMove(w, dt); // a member of the 마나피 formation
  else if ((w.alpha && hostile && (w.school || !w.alpha.school)) || (w.ai && hostile && arena?.zone === w.zone)) wantX = alphaAct(w, dt, dx, dy, d, speed);
  else if (w.cast > 0) {
    w.cast -= dt;
    if (w.cast <= 0) { w.tele = null; fire(w, w.move, w.castAng); if (dodgeTime() && Math.hypot(w.x - P.x, w.y - P.y) < 300) dodgeCheck ??= { at: S.playTime + 0.7, hurt: P.hurtAt }; }
  } else if (hostile) {
    const range = m.reach ? m.reach + w.hw + P.hw : 120;
    if (d > range * 0.8) { steer(w, Math.atan2(dy, dx), speed, dt); wantX = Math.sign(dx) * speed; }
    else if (w.cd <= 0) {
      w.cd = m.cooldown + 0.6;
      w.castAng = Math.atan2(dy, dx);
      w.cast = w.castMax = Math.max(m.delay, w.boss ? BOSS_WINDUP : WILD_WINDUP);
      w.tele = telegraph(w, m, w.castAng);
      if (dodgeTime() && Math.hypot(w.x - P.x, w.y - P.y) < 300) tip('dodge');
    }
  } else if (w.state === 'flee') {
    w.fleeT = (w.fleeT ?? 0) - dt;
    if (w.fleeT <= 0) { w.fleeT = FLEE_RETHINK; pickFlee(w, dx, dy); }
    const run = speed * (w.panic ? 1.6 : 1.3); // a cornered mon bolts past the player
    if (w.motion === 'crawl') wantX = w.fleeDir * run;
    else steer(w, w.fleeAng, run, dt);
  } else {
    w.wanderT -= dt;
    if (w.wanderT <= 0) {
      w.wanderT = 1 + Math.random() * 2;
      const a = Math.random() * Math.PI * 2, idle = w.motion === 'crawl' && Math.random() < 0.35; // walkers stop and look around now and then
      w.wx = idle ? 0 : Math.cos(a); w.wy = Math.sin(a) * 0.5;
    }
    w.vx += w.wx * speed * dt; w.vy += w.wy * speed * dt;
    wantX = w.wx * speed * 0.45;
  }
  if (w.motion === 'crawl') w.vy += 300 * dt;
  const drag = Math.pow(0.08, dt);
  if (w.motion === 'crawl' && hitsTiles(w, w.x, w.y + 1)) {
    // walking on the ground: speed follows what the mon wants within a few frames, so it never skates
    const acc = speed * 10 * dt;
    w.vx = prevVx + clamp(wantX - prevVx, -acc, acc);
  } else if (w.motion === 'crawl' && w.state === 'flee') w.vx = wantX; // a fleeing walker keeps running through a hop or a fall
  else w.vx *= drag;
  if (w.motion !== 'crawl') w.vy *= drag;
  const cap = w.dash ? w.dash.v : speed * (w.state === 'flee' ? (w.panic ? 1.6 : 1.3) : 1); // a 우두머리's charge goes past it
  if (Math.abs(w.vx) > cap) w.vx = Math.sign(w.vx) * cap;
  if (w.motion === 'swim' && Math.abs(w.vy) > cap) w.vy = Math.sign(w.vy) * cap;
  // floor crawlers never fall off a ledge, but can climb or drop a single tile
  const grounded = w.motion === 'crawl' && hitsTiles(w, w.x, w.y + 1);
  if (grounded && w.vx) {
    const dir = Math.sign(w.vx), ax = Math.floor((w.x + dir * (w.hw + 1)) / M.T);
    const foot = Math.floor((w.y + w.hh + 1) / M.T); // row of the floor tile under the body
    const turn = () => { w.vx = 0; w.wx = -w.wx; };
    if (hitsTiles(w, w.x + dir * 2, w.y)) {
      // climb only as high as the ground ahead needs (a slope pixel, a half-tile ledge, up to one tile), so the
      // body never pops up a whole tile and drops back down again
      let lift = 1;
      while (lift <= M.T && hitsTiles(w, w.x + dir * 2, w.y - lift)) lift++;
      if (lift <= M.T && !hitsTiles(w, w.x, w.y - lift)) { w.y -= lift; w.vy = 0; }
      else if (w.state === 'flee') w.vy = -FLEE_HOP; // a fleeing walker hops over the wall instead of turning back
      else turn();
    } else if (w.state !== 'flee' && !solid(ax, foot) && !solid(ax, foot + 1)) turn(); // more than one tile down (a fleeing one just drops)
  }
  moveBody(w, dt);
  if (grounded && w.vy >= 0 && !hitsTiles(w, w.x, w.y + 1)) { // walking down a slope or a small ledge: stay on the ground
    for (let d = 2; d <= M.ST; d++) if (hitsTiles(w, w.x, w.y + d)) { w.y += d - 1; w.vy = 0; break; }
  }
  if (w.y < 12) { w.y = 12; w.vy = Math.abs(w.vy); }
}

// Cannon shell: hits everything in a small radius where it lands.
function explode(s) {
  if (s.blastR) { // 하이드로캐논: a wide burst that throws everything out of it
    for (const t of targetsOf(s.owner)) if (boxDist(t, s.x, s.y) <= s.blastR) { hit(s.owner, t, s.move, 1, s.useMult ?? 1); knock(t, Math.atan2(t.y - s.y, t.x - s.x), 260); }
    fx.push({ kind: 'bigsplash', x: s.x, y: s.y, reach: s.blastR, t: 0, dur: 0.6, seed: seed() });
    shake = Math.max(shake, 6);
    return;
  }
  hitAround(s.owner, s.x, s.y, BLAST_RADIUS, s.move, 1, s.useMult ?? 1);
  fx.push({ kind: 'quake', x: s.x, y: s.y, color: s.color, t: 0, dur: 0.35, reach: BLAST_RADIUS });
}

function updateShots(dt) {
  for (const s of shots) {
    s.ttl -= dt;
    if (s.fx === 'homing') { // curve toward the nearest target in front
      const t = targetsOf(s.owner).filter(t => Math.hypot(t.x - s.x, t.y - s.y) < 150).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (t) {
        let d = Math.atan2(t.y - s.y, t.x - s.x) - s.ang;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.ang += Math.max(-HOMING_TURN * dt, Math.min(HOMING_TURN * dt, d));
        const v = Math.hypot(s.vx, s.vy); s.vx = Math.cos(s.ang) * v; s.vy = Math.sin(s.ang) * v;
      }
    }
    if (s.trail) { s.trail.push([s.x, s.y]); if (s.trail.length > 6) s.trail.shift(); }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.shape === 'wave') s.r += (s.fx === 'sound' ? 60 : 30) * dt;
    if (s.fx !== 'sound' && !s.noclip && solidPoint(s.x, s.y)) {
      if (s.fx === 'blast') explode(s);
      if (s.splash) fx.push({ kind: 'splash', x: s.x, y: s.y, ang: s.ang, size: s.splash, t: 0, dur: 0.35, seed: seed() });
      s.ttl = 0; continue;
    }
    if (s.net) {
      // a boss or 우두머리 still standing can't be netted: the net goes through it (brought down, it is caught by itself)
      if (wilds.some(w => (w.boss || w.alpha) && !w.fainted && boxDist(w, s.x, s.y) < s.r)) hintOnce('bossnet', '보스와 우두머리는 그물이 통하지 않는다 · 쓰러뜨리면 저절로 잡힌다');
      const w = wilds.find(w => !w.netted && !((w.boss || w.alpha) && !w.fainted) && boxDist(w, s.x, s.y) < s.r);
      if (w) {
        s.ttl = 0;
        if (!w.boss && bagCount() >= capacity()) { toast('포획망이 가득 찼다 · 기지에서 팔고 오자', 'warn'); continue; }
        w.netted = 1;
        fx.push({ kind: 'netwrap', x: w.x, y: w.y, t: 0, dur: 1, follow: w, r: w.r });
      }
      continue;
    }
    for (const t of targetsOf(s.owner)) {
      if (s.hitSet.has(t) || boxDist(t, s.x, s.y) > s.r) continue;
      s.hitSet.add(t);
      if (s.fx === 'blast') { explode(s); s.ttl = 0; break; }
      hit(s.owner, t, s.move, s.mult ?? 1, s.useMult ?? 1);
      if (s.splash) fx.push({ kind: 'splash', x: s.x, y: s.y, ang: s.ang, size: s.splash, t: 0, dur: 0.35, seed: seed() });
      if (s.push) knock(t, s.ang, s.push);
      if (s.shape !== 'wave') { s.ttl = 0; break; }
    }
  }
  shots = shots.filter(s => s.ttl > 0);
}

// ---------- render ----------
function render() {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  dctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const targetH = BASE_VIEW_H * (VIEW_GROWTH[stage()] ?? 1); // ease the zoom out after an evolution
  if (Math.abs(viewH - targetH) > 0.05) { viewH += (targetH - viewH) * 0.04; applyView(); }
  // look-ahead camera: aim at the point 1/3 of the way from the player to the cursor (2/3 from the cursor), eased in
  const tx = P.x + (mouse.x - W / 2) * 0.5 - W / 2, ty = P.y + (mouse.y - H / 2) * 0.5 - H / 2;
  cam.x += (clamp(tx, 0, M.COLS * M.T - W) - cam.x) * 0.15;
  cam.y += (clamp(ty, -150, M.ROWS * M.T - H) - cam.y) * 0.15;
  // snap the camera to screen pixels, not world pixels: whole-world-pixel steps (SCALE screen px each) made slow drifts stutter
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0; // big hits shake the view
  const ox = Math.round((cam.x + sx) * SCALE) / SCALE, oy = Math.round((cam.y + sy) * SCALE) / SCALE;
  const depthM = M.depthOf(P.y);

  Sea.draw(ctx, ox, oy, W, H, performance.now() / 1000); // depth bands, far rock, caustics
  if (-oy > 0) {
    const sky = ctx.createLinearGradient(0, 0, 0, -oy);
    sky.addColorStop(0, '#7cc6f0'); sky.addColorStop(1, '#d8f0ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, -oy);
  }

  Decor.ambient(ctx, ox, oy, W, H, performance.now() / 1000, depthM); // light shafts and particles sit behind the rock
  const tx0 = Math.floor(ox / M.T), ty0 = Math.floor(oy / M.T);
  for (let ty = Math.max(0, ty0); ty <= ty0 + Math.ceil(H / M.T) + 1; ty++) {
    const k = Math.min(1, ty / 250), zr = M.zoneOfRow(ty);
    for (let tx = tx0; tx <= tx0 + Math.ceil(W / M.T) + 1; tx++) {
      const t = M.tileAt(tx, ty);
      if (t === M.WATER || t === M.STRUCT) continue; // the base is drawn by drawRig()
      const sx = tx * M.T - ox, sy = ty * M.T - oy;
      const gate = M.gateInfo(t);
      if (gate) {
        if (gateOpen(gate)) continue;
        if (Terrain.ready()) continue; // painted with the rock by Terrain (rock.js sealPixel)
        const z = zoneById(gate.zone);
        if (gate.kind === 'boss') {
          ctx.fillStyle = '#c03040'; ctx.fillRect(sx, sy, M.T, M.T);
          ctx.fillStyle = z.color; ctx.fillRect(sx + 6, sy + 2, 4, 12);
        } else { ctx.fillStyle = '#5a5a70'; ctx.fillRect(sx, sy, M.T, M.T); ctx.fillStyle = '#ffd23c'; ctx.fillRect(sx, sy + 6, M.T, 4); }
        continue;
      }
      if (Terrain.ready()) continue; // rock is drawn by Terrain on the fine grid below
      const top = M.tileAt(tx, ty - 1) === M.WATER; // plain block until the tileset has loaded
      ctx.fillStyle = zr.rockTop
        ? (top ? zr.rockTop : zr.rockBody)
        : top ? `hsl(${40 - k * 25},${38 - k * 18}%,${52 - k * 34}%)` : `hsl(210,${22 - k * 10}%,${30 - k * 20}%)`;
      ctx.fillRect(sx, sy, M.T, M.T);
    }
  }
  if (Terrain.ready()) { Terrain.draw(ctx, ox, oy, W, H, SCALE, gateOpen); Terrain.drawHatches(ctx, ox, oy, W, H, gateOpen); }

  // seabed props and ambient water, then the surface, farm buoys and marine base
  const now = performance.now() / 1000;
  Decor.draw(ctx, ox, oy, W, H, now);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let x = 0; x < W; x += 4) if (M.tileAt(Math.floor((x + ox) / M.T), 0) !== M.STRUCT) ctx.fillRect(x, Math.round(Math.sin((x + ox) * 0.05 + now * 2) * 1.5) - oy, 4, 2);
  if (M.scene === 'tutorial') for (let x = M.TUTORIAL_POOL.x0; x <= M.TUTORIAL_POOL.x1; x += 4) { ctx.fillStyle = '#ff9a3a'; ctx.fillRect(x * M.T - ox, -4 - oy, 6, 5); }
  drawRig(ox, oy);

  if (M.scene === 'main') for (const z of M.ZONES) if (piecesOut(z)) z.treasures.forEach((t, i) => {
    if (S.treasures.includes(z.id + '-' + i)) return;
    const x = (t.x + 0.5) * M.T - ox, y = (t.y + 0.5) * M.T - oy; // (the crystal bobs in its own frames)
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) return;
    drawPiece(x, y, z.id, now, i);
  });
  if (M.scene === 'main') for (const n of M.NPCS) drawNpc(n, (n.x + 0.5) * M.T - ox, (n.y + 0.5) * M.T - oy, now);
  if (M.scene === 'main') for (const z of M.ZONES) if (z.portal) drawPortal(z, (z.portal.x + 0.5) * M.T - ox, (z.portal.y + 0.5) * M.T - oy, now);
  const netHere = S.tiedNet && (S.tiedNet.scene ?? 'main') === M.scene;
  if (netHere) drawNet(S.tiedNet.x - ox, S.tiedNet.y - oy, 9, '#ffe080', 0, true);

  for (const w of wilds) if (w.tele && w.cast > 0 && !w.netted && !w.fainted) drawTelegraph(w, ox, oy, now);
  drawSquad(ox, oy, now); drawBossRoom(ox, oy, now);
  for (const w of wilds) drawWild(w, ox, oy, now);
  drawPlayer(P.x - ox, P.y - oy, now);
  drawStamina(P.x - ox, P.y + P.hh + 4 - oy);
  if (warp.active) {
    const px = P.x - ox, py = P.y - oy, p = warp.t / WARP_SECONDS;
    // gathering itself: motes of light drawn in to the body from all round, and a glow growing on it as the time runs
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = 12 + 10 * p, g = ctx.createRadialGradient(px, py, 2, px, py, gr);
    g.addColorStop(0, `rgba(150,215,255,${0.2 + 0.45 * p})`); g.addColorStop(1, 'rgba(150,215,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, gr, 0, 7); ctx.fill();
    ctx.fillStyle = '#dcf2ff';
    for (let i = 0; i < 12; i++) {
      const run = warp.t * 0.9 + i / 12, q = run % 1, a = i * 2.4 + Math.floor(run) * 1.7, d = 36 * (1 - q * q);
      ctx.globalAlpha = q * (0.35 + 0.65 * p); ctx.fillRect(px + Math.cos(a) * d - 1, py + Math.sin(a) * d - 1, 2, 2);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 18, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#7ec8ff'; ctx.beginPath(); ctx.arc(px, py, 18, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
    ctx.font = '10px Galmuri9, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#7ec8ff';
    ctx.fillText(warp.target.name + ' ' + (WARP_SECONDS - warp.t).toFixed(1), px, py - 22);
  }
  if (shots.length || P.beam || fx.length) { // on the effects layer, then as pixel art over the scene
    const screen = ctx; ctx = fxCtx; ctx.setTransform(FX_RES, 0, 0, FX_RES, 0, 0); ctx.clearRect(0, 0, W, H);
    for (const s of shots) drawShot(s, ox, oy);
    if (P.beam) drawBeam(P.beam, ox, oy);
    for (const f of fx) if (f.kind !== 'after') drawFx(f, ox, oy);
    ctx = screen; FX.pixelate(fxCtx);
    for (const f of fx) if (f.kind === 'after') drawFx(f, ox, oy); // afterimages are the sprite itself
    ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(fxLayer, 0, 0, fxLayer.width / FX_RES, fxLayer.height / FX_RES); ctx.restore();
    // a charge's effect wraps the whole body: the body shows through it, a little faded
    if (Anim.has(S.species) && fx.some(f => f.follow === P && CHARGE_FX.has(f.kind))) drawAnimatedPlayer(P.x - ox, P.y - oy, 0.6);
  }

  // depth darkness with a headlamp cone toward the cursor
  // darkness eases in and levels off (~0.44 at 1000m, ~0.73 at 3000m, ~0.8 by 6000m) so the lamp always matters but never blinds
  const dk = debugBright || depthM < 40 ? 0 : 0.8 * (1 - Math.exp(-(depthM - 40) / 1200));
  if (dk > 0) {
    dctx.globalCompositeOperation = 'source-over';
    dctx.clearRect(0, 0, W, H);
    dctx.fillStyle = `rgba(0,4,14,${dk})`; dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = 'destination-out';
    const a = aimAngle(), lr = R.lampRadius(S.upgrades.lamp);
    const lx = P.x - ox + Math.cos(a) * lr * 0.5, ly = P.y - oy + Math.sin(a) * lr * 0.5;
    for (const [x, y, r] of [[lx, ly, lr], [P.x - ox, P.y - oy, 56]]) {
      const lg = dctx.createRadialGradient(x, y, 4, x, y, r);
      lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = lg; dctx.beginPath(); dctx.arc(x, y, r, 0, 7); dctx.fill();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(dark, 0, 0); ctx.restore();
  }
  Decor.drawGlow(ctx, ox, oy, W, H, now);

  // cursor and damage numbers draw above the dark layer; no cursor while talking or in a menu
  if (!blocked()) drawCursor(mouse.x, mouse.y);
  for (const f of fx) if (f.kind === 'shiny') drawShiny(f, ox, oy); // shiny sparkles shine through the dark
  ctx.font = '10px Galmuri9, monospace'; ctx.textAlign = 'center';
  if (Title.options.damageNumbers) for (const n of numbers) { ctx.fillStyle = '#000'; ctx.fillText(n.text, n.x - ox + 1, n.y - oy + 1); ctx.fillStyle = n.color; ctx.fillText(n.text, n.x - ox, n.y - oy); }
  if (netHere) drawNetMarker(S.tiedNet.x - ox, S.tiedNet.y - oy, now);
  if (mapOpen) {
    MapView.draw(ctx, MAP_BOX, mapTop, mapMarks(), now);
    // map cursor: an arrow pointer over the map window
    const mx = Math.round(mapMouse.x), my = Math.round(mapMouse.y);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my + 10); ctx.lineTo(mx + 3, my + 7); ctx.lineTo(mx + 7, my + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

}

function mapMarks() {
  const seen = (tx, ty) => MapView.seenAt(tx, ty);
  const marks = [{ tx: Math.floor(M.BASE.x / M.T), ty: 0, color: '#ff5060', label: '기지' }];
  for (const z of M.ZONES) {
    if (z.portal && seen(z.portal.x, z.portal.y)) marks.push({ tx: z.portal.x, ty: z.portal.y, color: '#c890ff', label: '포탈' });
    const d = z.bossDoor, by = z.bossRoom.y0 - 2;
    // 보스 탐지기: the boss still to be offered (the zone the quest is on) shows even before its room is found
    if ((S.upgrades.radar && z === M.ZONES.find(g => !S.offered[g.id])) || seen((d.x0 + d.x1) >> 1, by)) marks.push({ tx: (d.x0 + d.x1) >> 1, ty: by, color: '#ff8080', label: S.offered[z.id] ? '' : 'BOSS' });
    if (z.exit && seen(z.exit.x, z.exit.y1)) marks.push({ tx: z.exit.x, ty: z.exit.y1 - 4, color: '#ffd23c', label: '구역 ' + (z.id + 1) });
  }
  for (const zid of Object.keys(ALPHAS)) if ((S.alphaSeen[zid] || taskOf(zoneById(+zid)).step === T.ALPHA) && !S.alphas[zid] && S.alphaPos[zid])
    marks.push({ tx: Math.floor(S.alphaPos[zid].x / M.T), ty: Math.floor(S.alphaPos[zid].y / M.T), color: '#ff3050', label: '우두머리' });
  for (const n of M.NPCS) if (S.metNpc[n.key] || debugBright) marks.push({ tx: n.x, ty: n.y, color: '#ffdc5a', label: n.name });
  for (const z of M.ZONES) z.treasures.forEach((t, i) => { // 조각 탐지: a circle the piece is somewhere inside
    const h = S.pieceHints[z.id + '-' + i];
    if (h && !S.treasures.includes(z.id + '-' + i)) marks.push({ tx: h.tx, ty: h.ty, area: R.PIECE_HINT_RADIUS, color: z.color, label: z.piece + ' 근처' });
  });
  if (debugBright) for (const z of M.ZONES) z.treasures.forEach((t, i) => { // debug O: every piece still out there
    if (!S.treasures.includes(z.id + '-' + i)) marks.push({ tx: t.x, ty: t.y, color: z.color, label: z.piece });
  });
  if (S.tiedNet && (S.tiedNet.scene ?? 'main') === 'main') marks.push({ tx: Math.floor(S.tiedNet.x / M.T), ty: Math.floor(S.tiedNet.y / M.T), color: '#ffe080', label: '포획망' });
  const hover = hoveredWarp();
  for (const p of warpPoints()) marks.push({ tx: p.tx, ty: p.ty, ring: true, name: p.name, hover: p.name === hover?.name }); // clickable teleport points
  marks.push({ tx: Math.floor(P.x / M.T), ty: Math.floor(Math.max(0, P.y) / M.T), color: '#ffffff', label: '나', blink: true });
  return marks;
}

// 보물 조각: a crystal turning in its own light with motes round it, played from a strip of 45 frames (56x48, 15 fps)
// per zone colour (public/fx/piece-<zone>.png, rendered from pixelfx's ice/ice-crystal, recoloured; see its README).
// Each piece starts at its own point of the loop so neighbours don't turn in step.
const PIECE_FW = 56, PIECE_FH = 48, PIECE_FRAMES = 45, PIECE_FPS = 15;
const pieceSheets = {};
function drawPiece(x, y, zone, now, i) {
  const img = pieceSheets[zone] ??= Object.assign(new Image(), { src: `${import.meta.env.BASE_URL}fx/piece-${zone}.png` });
  if (!img.complete || !img.naturalWidth) return;
  const f = Math.floor(now * PIECE_FPS + i * 13) % PIECE_FRAMES;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, f * PIECE_FW, 0, PIECE_FW, PIECE_FH, Math.round(x - PIECE_FW / 2), Math.round(y - PIECE_FH / 2), PIECE_FW, PIECE_FH);
  ctx.restore();
}

// Points at the dropped net from the screen edge (or labels it on screen, since the dark layer can hide it).
function drawNetMarker(nx, ny, now) {
  const px = P.x - cam.x, py = P.y - cam.y;
  const meters = Math.round(Math.hypot(nx - px, ny - py) / M.T * M.M_PER_TILE);
  const left = Math.max(0, S.tiedNet.left);
  const label = `${meters}m ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  const pad = 14;
  const onScreen = nx > pad && nx < W - pad && ny > pad && ny < H - pad;
  let x = nx, y = ny - 14;
  if (!onScreen) {
    // walk from the player toward the net until the ray leaves the padded screen box
    const dx = nx - px, dy = ny - py;
    const t = Math.min(
      dx > 0 ? (W - pad - px) / dx : dx < 0 ? (pad - px) / dx : Infinity,
      dy > 0 ? (H - pad - py) / dy : dy < 0 ? (pad - py) / dy : Infinity,
    );
    x = px + dx * t; y = py + dy * t;
    const ang = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#ffe080'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // keep the text inside the screen, on the side away from the edge
    x = clamp(x - Math.cos(ang) * 22, 26, W - 26);
    y = clamp(y - Math.sin(ang) * 14, 10, H - 6);
  } else if (Math.floor(now * 2) % 2) {
    ctx.strokeStyle = '#ffe080'; ctx.beginPath(); ctx.arc(nx, ny, 13, 0, 7); ctx.stroke();
  }
  ctx.font = '10px Galmuri9, monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#000'; ctx.fillText(label, x + 1, y + 1);
  ctx.fillStyle = left < 60 ? '#ff8060' : '#ffe080'; ctx.fillText(label, x, y);
}

// Main-sea base: floating base art (assets/bases), one stage per boss offering. The images in public/base are
// the originals at 0.66x; deckY / anchorX are original-pixel positions of the deck surface and the platform centre.
const BASE_ART = { scale: 0.15, src: 0.66, anchorX: 700, deckY: [643, 645, 688, 698] };
const BASE_STAGE_NAMES = ['낡은 기지', '보강 기지', '전문 해양 기지', '최첨단 기지'];
const baseStage = () => Math.min(4, 1 + M.ZONES.filter(z => S.offered[z.id]).length);
const baseImgs = [1, 2, 3, 4].map(n => Object.assign(new Image(), { src: `${import.meta.env.BASE_URL}base/stage-${n}.png` }));
function drawRig(ox, oy) {
  const n = baseStage(), img = baseImgs[n - 1];
  if (!img.complete || !img.naturalWidth) return;
  const k = BASE_ART.scale / BASE_ART.src, w = img.naturalWidth * k, h = img.naturalHeight * k;
  const deckCenter = (M.BASE.deck.x0 + M.BASE.deck.x1 + 1) / 2 * M.T;
  const x = deckCenter - BASE_ART.anchorX * BASE_ART.scale - ox, y = M.DECK_TOP - BASE_ART.deckY[n - 1] * BASE_ART.scale - oy;
  ctx.imageSmoothingEnabled = true; // downscaled painting, not tile pixels
  // above the waterline in full, below it faded into the sea
  for (const [y0, y1, alpha] of [[y, -oy, 1], [-oy, y + h, 0.5]]) {
    if (y1 <= y0) continue;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y0, w, y1 - y0); ctx.clip();
    ctx.globalAlpha = alpha; ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled = false;
}

// Upgrade NPCs float in their caves; they cannot be attacked or caught.
function drawNpc(n, x, y, now) {
  if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
  const img = sprite('npc/' + n.key, false);
  const by = y + Math.sin(now * 2) * 2;
  if (img) drawSprite(img, x, by, false, false, 1, 22);
  else { ctx.fillStyle = '#ffdc5a'; ctx.beginPath(); ctx.arc(x, by, 6, 0, 7); ctx.fill(); }
  if (Math.hypot(P.x - (n.x + 0.5) * M.T, P.y - (n.y + 0.5) * M.T) < 40) {
    ctx.font = '10px Galmuri9, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText(n.name, x + 1, by - 15); ctx.fillStyle = '#ffe080'; ctx.fillText(n.name, x, by - 16);
  }
}

function drawPortal(z, x, y, now) {
  if (x < -30 || x > W + 30 || y < -30 || y > H + 30) return;
  const on = !!S.offered[z.id - 1];
  ctx.strokeStyle = on ? '#c890ff' : '#555a66'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y, 10, 16, 0, 0, 7); ctx.stroke();
  if (on) for (let i = 0; i < 3; i++) {
    const a = now * 3 + i * 2.1;
    ctx.fillStyle = '#f0d8ff'; ctx.fillRect(Math.round(x + Math.cos(a) * 6) - 1, Math.round(y + Math.sin(a) * 11) - 1, 2, 2);
  }
  ctx.lineWidth = 1;
}

// Cast net: a faint tinted body, diamond mesh with knots bulging slightly outward, a two-tone rope rim and lead
// sinkers around the edge. spin turns it (thrown nets tumble), tied adds the drawstring knot on top.
function drawNet(x, y, r, color, spin = 0, tied = false) {
  const cell = Math.max(2.2, r / 3), n = Math.ceil(r / cell) + 1;
  ctx.save(); ctx.translate(x, y); ctx.rotate(spin);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.globalAlpha = 0.18; ctx.fillStyle = color; ctx.fill();
  ctx.save(); ctx.clip();
  // mesh lines bowed outward so it reads as a round, filled net rather than a flat grid
  const bow = (u, v) => { const d = Math.hypot(u, v) / r, k = 1 + 0.12 * (1 - d * d); return [u * k, v * k]; };
  ctx.globalAlpha = 0.85; ctx.strokeStyle = color; ctx.lineWidth = 0.45;
  for (const dir of [1, -1]) for (let i = -n; i <= n; i++) {
    ctx.beginPath();
    for (let j = -n; j <= n; j++) {
      const u = (i + j) * cell / 1.4142, v = dir * (j - i) * cell / 1.4142, [px, py] = bow(u, v);
      j === -n ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.fillStyle = color; // knots
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const [px, py] = bow((i + j) * cell / 1.4142, (j - i) * cell / 1.4142);
    if (px * px + py * py < r * r) ctx.fillRect(px - 0.35, py - 0.35, 0.7, 0.7);
  }
  ctx.restore();
  ctx.globalAlpha = 1; // rope rim: dark outer twist, light inner strand
  ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#d8b878'; ctx.lineWidth = 0.5; ctx.setLineDash([0.9, 0.6]); ctx.stroke(); ctx.setLineDash([]);
  const weights = Math.max(5, Math.round(r * 0.6));
  for (let i = 0; i < weights; i++) { // lead sinkers with a small highlight
    const a = (i / weights) * Math.PI * 2, wx = Math.cos(a) * r, wy = Math.sin(a) * r;
    ctx.fillStyle = '#3a3f48'; ctx.beginPath(); ctx.arc(wx, wy, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#aab4c0'; ctx.fillRect(wx - 0.5, wy - 0.6, 0.45, 0.45);
  }
  if (tied) { // drawstring gathered into a knot with two loose ends
    ctx.rotate(-spin);
    ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-1.5, -r - 1); ctx.quadraticCurveTo(-3, -r - 3, -2.5, -r - 4.5);
    ctx.moveTo(1.5, -r - 1); ctx.quadraticCurveTo(3, -r - 3, 2.5, -r - 4.5); ctx.stroke();
    ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.arc(0, -r - 0.8, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Static PokeAPI front sprites (scripts/fetch-sprites.py), drawn at half size; shapes are the fallback while loading.
const sprites = {};
function sprite(key, shiny) {
  const id = shiny ? key + '-shiny' : key;
  if (!sprites[id]) { sprites[id] = new Image(); sprites[id].src = `${import.meta.env.BASE_URL}sprites/${id}.png`; }
  return sprites[id].naturalWidth ? sprites[id] : null;
}
// 물기 (as in the main games, seen from the side): two rows of glowing fangs made of the move's type (just the fangs:
// the upper ones down, the lower ones up, set so they interlock), swing open on a hinge at the back, then snap
// shut on the bitten Pokemon (SNAP of the way in) with streaks and shards flying out, shudder, swing apart and fade.
// Pixel art: each angle is rotated pixel by pixel (nearest) and outlined after, so it stays crisp; frames are cached per
// color. They face the way the bite went (mirrored).
const BITE_SNAP = 0.3, BITE_HOLD = 0.62, BITE_GAPE = 0.8, BITE_STEPS = 12;
const BITE_COLOR = { dark: '#8a62c8' }; // the dark type's own color is too dull to glow
// a row of fangs in bite-line coords (y = 0 where the rows meet, y < 0 up); every tip reaches 2 px past the bite line,
// so the roots of the bigger fangs sit higher
// fangs: [x, width, length]; each tapers to a point that curves a little toward the front
function jawMap(fangs) {
  const m = new Map(), put = (x, y, c) => m.set(x + ',' + y, [x, y, c]);
  for (const [x0, w, flen] of fangs) for (let r = 0, top = 2 - flen; r < flen; r++) {
    const k = r / flen, half = (w / 2) * (1 - k), c = x0 + w / 2 - 0.5 + k * k * 1.2;
    const a = Math.round(c - half + 0.25), b = Math.round(c + half - 0.25);
    for (let x = a; x <= b; x++) if (r || (x !== a && x !== b)) put(x, top + r, x === a ? 'l' : x === b ? 'd' : 'm'); // rounded root
    if (b - a >= 2) put(a + 1, top + r, r < flen * 0.6 ? 'h' : 'm'); // a glint down each fang
  }
  return [...m.values()];
}
// small at the back (by the hinge, the attacker's side), growing toward the front; gaps between, so each fang stands alone
const UPPER_JAW = jawMap([[1, 4, 6], [6, 4, 7], [11, 5, 9], [17, 5, 10], [23, 5, 12], [29, 6, 14], [36, 6, 16]]);
const LOWER_JAW = jawMap([[3, 4, 5], [8, 4, 6], [14, 4, 7], [20, 5, 9], [26, 5, 10], [33, 5, 12]]).map(([x, y, c]) => [x, -y, c]);
const biteFrames = {};
const mixHex = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
// the jaw turned by ang about its hinge (hx, hy), painted from the base color, as a canvas plus where its corner sits
function jawFrame(map, ang, hx, hy, color) {
  const pal = { h: mixHex(color, '#ffffff', 0.85), l: mixHex(color, '#ffffff', 0.55), m: mixHex(color, '#ffffff', 0.2), d: mixHex(color, '#000000', 0.25) };
  const edge = mixHex(color, '#000000', 0.6);
  const src = new Map(map.map(([x, y, c]) => [x + ',' + y, c])), cos = Math.cos(ang), sin = Math.sin(ang);
  const pts = map.map(([x, y]) => [hx + (x - hx) * cos - (y - hy) * sin, hy + (x - hx) * sin + (y - hy) * cos]);
  const x0 = Math.floor(Math.min(...pts.map(p => p[0]))) - 2, y0 = Math.floor(Math.min(...pts.map(p => p[1]))) - 2;
  const W = Math.ceil(Math.max(...pts.map(p => p[0]))) - x0 + 3, H = Math.ceil(Math.max(...pts.map(p => p[1]))) - y0 + 3;
  const cell = new Map();
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { // each pixel takes the source pixel it came from
    const dx = x0 + i - hx, dy = y0 + j - hy, sx = Math.round(hx + dx * cos + dy * sin), sy = Math.round(hy - dx * sin + dy * cos);
    const c = src.get(sx + ',' + sy); if (c) cell.set(i + ',' + j, c);
  }
  const cv2 = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv2.getContext('2d');
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = cell.get(i + ',' + j);
    if (c) { g.fillStyle = pal[c]; g.fillRect(i, j, 1, 1); }
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => cell.has(i + a + ',' + (j + b)))) { g.fillStyle = edge; g.fillRect(i, j, 1, 1); }
  }
  return { cv: cv2, x: x0, y: y0 };
}
function drawBite(f, x, y, p) {
  const color = BITE_COLOR[f.type] ?? f.color, light = mixHex(color, '#ffffff', 0.7);
  const close = p < BITE_SNAP ? (p / BITE_SNAP) ** 2 : 1, open = p > BITE_HOLD ? (p - BITE_HOLD) / (1 - BITE_HOLD) : 0;
  const step = Math.round(Math.min(1, BITE_GAPE * (1 - close) + 0.5 * open) / BITE_GAPE * BITE_STEPS); // quantized angle
  const ang = step / BITE_STEPS * BITE_GAPE;
  const up = biteFrames[color + 'u' + step] ??= jawFrame(UPPER_JAW, -ang, -1, -6, color); // hinged just behind the back fangs
  const dn = biteFrames[color + 'd' + step] ??= jawFrame(LOWER_JAW, ang, -1, 6, color);
  const shudder = p >= BITE_SNAP && p < BITE_HOLD ? Math.round(Math.random() * 2 - 1) : 0, dir = Math.cos(f.ang ?? 0) < 0 ? -1 : 1;
  const alpha = Math.min(1, p / 0.1) * (1 - open), cx = Math.round(x), cy = Math.round(y);
  f.seed ??= Math.floor(Math.random() * 233280);
  let seed = f.seed; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280); // same streaks every frame
  if (p >= BITE_SNAP) { // behind the jaws: streaks flung out sideways and shards of the type, from where they met
    const k = Math.min(1, (p - BITE_SNAP) / (1 - BITE_SNAP));
    ctx.save(); ctx.globalAlpha = 1 - k;
    ctx.fillStyle = light;
    for (let i = 0; i < 14; i++) {
      const a = (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.9, r0 = 10 + k * 40 * (0.6 + rnd()), L = 6 + rnd() * 12;
      for (let d = 0; d < L; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * (r0 + d)), Math.round(cy + Math.sin(a) * (r0 + d)), 1, 1);
    }
    for (let i = 0; i < 8; i++) { // shards: little diamonds tumbling out
      const a = rnd() * Math.PI * 2, r = 8 + k * 34 * (0.5 + rnd()), sx = Math.round(cx + Math.cos(a) * r), sy = Math.round(cy + Math.sin(a) * r + k * k * 10);
      ctx.fillStyle = mixHex(color, '#ffffff', 0.4); ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.restore();
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx + shudder, cy); ctx.scale(dir, 1);
  const ox = -21; // centre the 42 px rows on the target
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * 0.35; ctx.filter = 'blur(2px)'; // the glow around them
  ctx.drawImage(dn.cv, ox + dn.x, dn.y); ctx.drawImage(up.cv, ox + up.x, up.y);
  ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.globalAlpha = alpha * 0.92; // a little see-through
  ctx.drawImage(dn.cv, ox + dn.x, dn.y);
  ctx.drawImage(up.cv, ox + up.x, up.y);
  ctx.restore();
  if (p >= BITE_SNAP && p < BITE_SNAP + 0.14) { // the flash where they met
    ctx.fillStyle = '#fff'; ctx.globalAlpha = 1 - (p - BITE_SNAP) / 0.14;
    ctx.fillRect(cx - 3, cy - 1, 6, 2); ctx.fillRect(cx - 1, cy - 3, 2, 6); ctx.globalAlpha = 1;
  }
}

// Front sprites face left, so flip when facing right. bottom=true sits the sprite on the floor.
function drawSprite(img, x, y, faceRight, bottom, alpha = 1, size = Math.max(img.width, img.height) / 2) {
  const k = size / Math.max(img.width, img.height);
  const w = img.width * k, h = img.height * k;
  // nearest-neighbour when enlarging keeps pixel edges; smooth filtering when shrinking avoids dropped pixels
  ctx.imageSmoothingEnabled = k * SCALE < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, bottom ? y - h / 2 : y);
  if (faceRight) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return h;
}

// a sweat drop (pixel art, world px), the mark of a fleeing mon; it sways by a pixel
const SWEAT = ['..oo..', '.oLLo.', '.oWLo.', 'oLWLLo', 'oWLLDo', 'oLLLDo', '.oDDo.', '..oo..'];
const SWEAT_INK = { o: '#173a5e', L: '#8fd0ff', W: '#ffffff', D: '#4a90d8' };
// painted once on a canvas of its own and drawn whole, unsmoothed: dot by dot at the view's fractional scale the
// edges between the dots were blended and showed as seams
const sweatImg = (() => {
  const c = document.createElement('canvas'); c.width = SWEAT[0].length; c.height = SWEAT.length; const g = c.getContext('2d');
  SWEAT.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { g.fillStyle = SWEAT_INK[ch]; g.fillRect(i, j, 1, 1); } }));
  return c;
})();
function drawSweat(x, y, lean) {
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x), Math.round(y));
  if (lean < 0) { ctx.translate(sweatImg.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(sweatImg, 0, 0); ctx.restore();
}
function drawWild(w, ox, oy, now) {
  const s = sp(w.key), winding = w.cast > 0 && !w.fainted && !w.netted;
  const back = winding ? 3 * Math.sin(Math.min(1, 1 - w.cast / (w.castMax || 1)) * Math.PI * 0.5) : 0; // draws back as it winds up
  const x = w.x - ox - (winding ? Math.round(Math.cos(w.castAng) * back) : 0);
  let y = w.y - oy - (winding ? Math.round(Math.sin(w.castAng) * back) : 0);
  if (x < -100 || x > W + 100 || y < -100 || y > H + 100) return; // big sprites reach up to 180px
  if (w.fainted && !w.netted && Math.floor(now * 10) % 2) return;
  if (w.shiny && !w.sparkled && x > 0 && x < W && y > 0 && y < H) { w.sparkled = true; fx.push({ kind: 'shiny', t: 0, dur: 1.4, follow: w }); }
  const img = w.school ? sprite(SCHOOL_KEY, false) : sprite(w.key, w.shiny);
  let top;
  if (img) {
    const onFloor = w.motion !== 'swim';
    const bob = onFloor && Math.abs(w.vx) > 4 ? -Math.abs(Math.sin(now * 14)) * 1.2 : 0; // little steps while walking
    const aura = w.alpha && !w.fainted ? ` drop-shadow(0 0 2px #ff2a40) drop-shadow(0 0 ${3 + Math.round(Math.sin(now * 4) + 1)}px rgba(255, 40, 64, 0.75))` : ''; // 우두머리: a red glow
    const flash = w.flashT > 0 ? 'brightness(2.6)' : winding && Math.floor(now * 14) % 2 ? 'brightness(1.8) saturate(0.6)' : ''; // hit: white; winding up: blinks
    ctx.filter = (flash + aura).trim() || 'none';
    const faceR = w.dash ? Math.cos(w.dash.ang) > 0 : winding ? Math.cos(w.castAng) > 0 : w.vx > 0;
    const h = drawSprite(img, x, onFloor ? y + w.hh + bob : y, faceR, onFloor, w.fainted ? 0.5 : w.hide ? 0.12 : 1, w.school ? SCHOOL_PX : sizePx(s) * (w.scale ?? 1));
    ctx.filter = 'none';
    if (onFloor) y = y + w.hh - h / 2;
    top = y - h / 2;
  } else {
    ctx.fillStyle = w.fainted ? '#888' : w.shiny ? '#ffd860' : TYPE_COLOR[s.types[0]];
    ctx.beginPath(); ctx.ellipse(x, y, w.r, w.r * 0.75, 0, 0, 7); ctx.fill();
    top = y - w.r;
  }
  if (w.shiny && !w.fainted && Math.floor(now * 4) % 2) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 8, top, 2, 2); ctx.fillRect(x - 9, top + 4, 2, 2); }
  if (w.netted) drawNet(x, y + Math.sin(now * 30) * 1.5, w.r + 4, '#e8f4ff', Math.sin(now * 30) * 0.08, true);
  if (w.fainted && !w.netted) { if (!w.boss) { ctx.textAlign = 'center'; ctx.fillStyle = '#ffe060'; ctx.fillText(Math.ceil(w.fainted) + '', x, top - 3); } } // its seconds left (a boss stays down)
  else if (!w.netted && w.state === 'hostile') {
    // state mark over the head: a small faint ! while it is angry, a big one that pops and blinks while it winds up an
    // attack (so a big ! means it is about to hit); a sweat drop by the head while fleeing, nothing when calm
    const hp = w.hp < w.stats.hp ? 4 : 0;
    ctx.textAlign = 'center';
    if (winding) {
      const k = 1 - w.cast / (w.castMax || 1), size = Math.round(18 - 6 * Math.min(1, k * 4)); // pops big, settles
      ctx.font = `bold ${size}px Galmuri9, monospace`;
      ctx.fillStyle = '#000'; ctx.fillText('!', x + 1, top - 4 - hp + 1);
      ctx.fillStyle = Math.floor(now * 14) % 2 ? '#ffe040' : '#ff3030'; ctx.fillText('!', x, top - 4 - hp);
    } else {
      ctx.globalAlpha = 0.6; ctx.font = 'bold 8px Galmuri9, monospace';
      ctx.fillStyle = '#ff5050'; ctx.fillText('!', x, top - 3 - hp);
      ctx.globalAlpha = 1;
    }
    ctx.font = '10px Galmuri9, monospace';
  } else if (!w.netted && w.state === 'flee') drawSweat(x + w.r * 0.6, top - 4 + Math.round(Math.sin(now * 9)), Math.cos(now * 4.5) < 0 ? -1 : 1);
  const lag = w.hpLag ?? w.hp;
  if ((w.hp < w.stats.hp && !w.fainted) || lag > w.hp) {
    ctx.fillStyle = '#300'; ctx.fillRect(x - 11, top - 5, 22, 3);
    ctx.fillStyle = '#ffd23c'; ctx.fillRect(x - 10, top - 4, 20 * lag / w.stats.hp, 2); // just lost, sliding down after the hit
    ctx.fillStyle = w.hp <= w.stats.hp / 4 ? '#ff5a4a' : '#5f5'; ctx.fillRect(x - 10, top - 4, 20 * w.hp / w.stats.hp, 2);
  }
  if (w.alpha) { // its title over the bar
    ctx.font = '10px Galmuri9, monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = '#000'; ctx.fillText('우두머리 ' + s.name, x + 1, top - 15);
    ctx.fillStyle = '#ff6070'; ctx.fillText('우두머리 ' + s.name, x, top - 16);
  }
}

// Which sheet animation the player shows and how far into it: a move or hurt one-shot, the 하이드로펌프 loop or the
// recharge, else locomotion: swim / float in the water, walk / idle on the deck or ground.
// 헤엄 as a blend space over speed, from treading water up: 물속 대기, a slow stroke, the plain stroke, one between, and the
// flat-out one (Shift), by how fast the player swims against their unhurried top speed (the water caps it at 1.6x the
// move speed; sprinting, 1.5x that). All share one cycle on P.locoT, so a change of stroke carries on from the same
// point in it.
function swimStroke(speed) {
  const u = speed / (1.6 * R.moveSpeed(P.stats.spd)), w = clamp((u - 1.05) / (SPRINT_MULT - 1.1), 0, 1);
  const name = u < 0.15 ? 'float' : u < 0.55 ? 'swim_slow' : w > 0.67 ? 'swim_fast' : w > 0.33 ? 'swim_mid' : 'swim';
  return hasAnim(name) ? name : u < 0.15 ? 'float' : 'swim';
}
function playerAnim() {
  if (P.rampage) return [hasAnim('rampage') ? 'rampage' : inState('dash'), P.rampage.at]; // 장크로다일 thrashes all through it
  if (P.beam) return [inState('pump'), P.beam.t];
  if (P.act) return [P.act.name, Math.max(0, P.act.t)];
  if (P.recharge > 0) return [inState('recharge'), S.playTime];
  if (warp.active && hasAnim('focus')) return [inState('focus'), warp.t]; // 순간이동: gathering itself
  const speed = Math.hypot(P.vx, P.vy);
  if (P.y > 0 || P.wet) return [inState(swimStroke(speed)), P.locoT];
  return [inState(Math.abs(P.vx) > 8 ? 'walk' : 'idle'), P.locoT];
}
// swimming leans the body into the stroke (nose up when rising, down when diving)
const swimTilt = () => (P.y > 0 && !P.act && !P.beam && Math.hypot(P.vx, P.vy) > 25 ? clamp(Math.atan2(P.vy, Math.abs(P.vx)) * 0.7, -0.7, 0.7) : 0);
function drawAnimatedPlayer(x, y, alpha = 1, frame = playerAnim()) {
  return Anim.draw(ctx, S.species, import.meta.env.BASE_URL, frame[0], frame[1], x, y + P.hh, sizePx(sp(S.species)), P.face < 0, P.lean + swimTilt(), alpha);
}
// 제비반환: ghost images of the body strung along the path it flashed through
function drawAfterimages(f, ox, oy, p) {
  for (let i = 1; i <= 4; i++) {
    const k = i / 5, x = f.x0 + (f.x1 - f.x0) * k - ox, y = f.y0 + (f.y1 - f.y0) * k - oy;
    if (Anim.has(S.species)) drawAnimatedPlayer(x, y, (1 - p) * 0.12 * i, ['dash_cut', 0.34]); // the lunge frame
  }
  ctx.save(); ctx.globalAlpha = 0.8 * (1 - p); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(f.x0 - ox, f.y0 - oy); ctx.lineTo(f.x1 - ox, f.y1 - oy); ctx.stroke(); ctx.restore();
}

// marks of the abilities on the body: 승기's red aura while a hit has charged it, 변환자재's glow in the type last used,
// and the shot 메가런처 is gathering at the muzzle
function drawAbilityMarks(x, y, now, front) {
  const a = passive(), r = Math.max(P.hw, P.hh);
  const glow = (color, k) => {
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.7);
    g.addColorStop(0, color + 'aa'); g.addColorStop(1, color + '00');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, 7); ctx.fill(); ctx.restore();
  };
  if (!front) {
    if (a === 'competitive' && P.empowered) glow('#ff3020', 0.55 + 0.25 * Math.sin(now * 9));
    if (a === 'protean' && P.lastType) glow(TYPE_COLOR[P.lastType] ?? '#ffffff', 0.45 + 0.1 * Math.sin(now * 4));
    return;
  }
  if (a === 'competitive' && P.empowered) { // embers rising off the body
    ctx.fillStyle = '#ff5030';
    for (let i = 0; i < 4; i++) { const q = (now * 0.9 + i / 4) % 1; ctx.globalAlpha = 1 - q; ctx.fillRect(x + Math.sin(i * 2.3 + now * 3) * r * 0.8, y + r * 0.6 - q * r * 2, 1.5, 1.5); }
    ctx.globalAlpha = 1;
  }
  if (P.charge) {
    const o = mouthPos(aimAngle()), k = Math.min(P.charge.t, CHARGE_FULL) / CHARGE_FULL, col = TYPE_COLOR[data.moves[P.charge.key].type];
    const ox = o.x - P.x + x, oy = o.y - P.y + y, rr = 2 + 6 * k + Math.sin(now * 30) * 0.6;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(ox, oy, rr + 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.arc(ox, oy, rr * 0.5, 0, 7); ctx.fill();
    if (k >= 1) { ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now * 20); ctx.beginPath(); ctx.arc(ox, oy, rr + 4, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
}
// the body's own light for 승기 (red, flickering) and 변환자재 (the type last used): a glow hugging its outline
function auraFilter(now) {
  const a = passive(), px = k => (k * SCALE).toFixed(1) + 'px';
  if (a === 'competitive' && P.empowered) return `drop-shadow(0 0 ${px(1.2)} #ff3020) drop-shadow(0 0 ${px(2.5 + Math.sin(now * 9))} #ff2010)`;
  if (a === 'protean' && P.lastType) { const c = TYPE_COLOR[P.lastType] ?? '#ffffff'; return `drop-shadow(0 0 ${px(1)} ${c}) drop-shadow(0 0 ${px(2 + 0.5 * Math.sin(now * 4))} ${c})`; }
  return 'none';
}
// 기력 gauge under the player: yellow while it lasts; run dry, it is a black bar refilling in red and can't be used till full
function drawStamina(x, y) {
  const t = P.staminaFull ?? STAMINA_HIDE;
  if (t >= STAMINA_HIDE) return;
  const W2 = 16, x0 = Math.round(x - W2 / 2), y0 = Math.round(y); // a thin line, no frame
  ctx.globalAlpha = Math.min(1, (STAMINA_HIDE - t) / STAMINA_FADE);
  ctx.fillStyle = P.winded ? '#1a0608' : 'rgba(30, 30, 20, 0.6)'; ctx.fillRect(x0, y0, W2, 1);
  ctx.fillStyle = P.winded ? '#e0303a' : '#ffd23c'; ctx.fillRect(x0, y0, Math.round(W2 * P.stamina), 1);
  ctx.globalAlpha = 1;
}
function drawPlayer(x, y, now) {
  drawAbilityMarks(x, y, now, false);
  ctx.filter = auraFilter(now);
  const drawn = Anim.has(S.species) && drawAnimatedPlayer(x, y);
  ctx.filter = 'none';
  drawAbilityMarks(x, y, now, true);
  if (drawn) { // animated sheet
    if (P.y > 0 && Math.floor(now * 3) % 3 === 0) { ctx.fillStyle = 'rgba(220,245,255,0.6)'; ctx.fillRect(x + P.face * 8, y - P.hh - 3 - (now * 20) % 6, 2, 2); }
    return;
  }
  const img = sprite(S.species, false);
  let h = P.r * 2;
  const walking = P.y <= 0 && Math.abs(P.vx) > 4 && (onDeck() || hitsTiles(P, P.x, P.y + 1));
  const bob = walking ? -Math.abs(Math.sin(now * 14)) * 1.2 : 0; // steps while walking on the deck or ground
  if (img) h = drawSprite(img, x, y + P.hh + bob, P.face > 0, true, 1, sizePx(sp(S.species))); // feet on the hitbox bottom
  else { ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.ellipse(x, y, P.r, P.r * 0.8, 0, 0, 7); ctx.fill(); }
  y += P.hh - h / 2; // sprite centre, for the cast ring and bubbles
  if (P.cast > 0) { ctx.strokeStyle = '#ffe060'; ctx.beginPath(); ctx.arc(x, y, h / 2 + 3, 0, 7); ctx.stroke(); }
  if (P.y > 0 && Math.floor(now * 3) % 3 === 0) { ctx.fillStyle = 'rgba(220,245,255,0.6)'; ctx.fillRect(x + P.face * 4, y - h / 2 - 3 - (now * 20) % 6, 2, 2); }
}

// Aim cursor: a translucent Poke Ball (red top, white bottom, band and button) slowly spinning, in world px.
function drawCursor(x, y) {
  const r = 5;
  ctx.save(); ctx.globalAlpha = 0.7;
  ctx.translate(x, y); ctx.rotate(performance.now() / 1000 * Math.PI); // half a turn per second
  ctx.fillStyle = '#e83030'; ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fill();
  ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawBeam(b, ox, oy) {
  if (b.pump) return FX.pumpBeam(ctx, b, b.x0 - ox, b.y0 - oy, b.half, performance.now() / 1000);
  const x0 = b.x0 - ox, y0 = b.y0 - oy, x1 = x0 + Math.cos(b.ang) * b.len, y1 = y0 + Math.sin(b.ang) * b.len;
  const fade = Math.min(1, b.t / 0.15, (b.m.channel - b.t) / 0.2), w = BEAM_HALF * 2 * fade;
  ctx.lineCap = 'round';
  for (const [width, style] of [[w + 4 + Math.sin(b.t * 40) * 1.5, b.color + '66'], [w, b.color], [w * 0.35, '#fff']]) {
    ctx.lineWidth = Math.max(1, width); ctx.strokeStyle = style;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.lineCap = 'butt'; ctx.lineWidth = 1;
}

function drawShot(s, ox, oy) {
  const x = s.x - ox, y = s.y - oy;
  if (s.net) { // opens from a bundle to full size in the first moments of flight, tumbling as it goes
    const open = Math.min(1, (NET_TTL - s.ttl) / 0.12);
    drawNet(x, y, 2 + 5 * open, '#e8f4ff', s.ttl * 9); return;
  }
  ctx.fillStyle = s.color; ctx.strokeStyle = s.color;
  if (s.shape === 'star') { // shuriken
    ctx.save(); ctx.translate(x, y); ctx.rotate(performance.now() / 60);
    ctx.fillRect(-4, -1, 8, 2); ctx.fillRect(-1, -4, 2, 8); ctx.restore(); return;
  }
  if (s.shape === 'rock') { // falling boulder
    ctx.fillStyle = '#7a6448'; ctx.fillRect(x - 5, y - 4, 10, 8); ctx.fillStyle = s.color; ctx.fillRect(x - 4, y - 5, 7, 6); return;
  }
  if (s.shape === 'bubble' || s.shape === 'ring') { // hollow bubble / pulsing water ring
    const r = s.shape === 'ring' ? s.r + Math.sin(performance.now() / 50) : s.r;
    ctx.lineWidth = s.shape === 'ring' ? 2 : 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x - 1, y - r + 1, 1, 1); return;
  }
  if (s.shape === 'blade') { // crescent flying edge-first
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x - Math.cos(s.ang) * 4, y - Math.sin(s.ang) * 4, 7, s.ang - 1.2, s.ang + 1.2); ctx.stroke(); ctx.lineWidth = 1; return;
  }
  if (s.shape === 'leaf') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(s.ang + performance.now() / 120);
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 2, 0, 0, 7); ctx.fill(); ctx.restore(); return;
  }
  if (s.shape === 'snipe') {
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - Math.cos(s.ang) * 60, y - Math.sin(s.ang) * 60); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 2, 2); return;
  }
  if (s.shape === 'jet') return FX.jet(ctx, s, ox, oy, performance.now() / 1000);
  if (s.shape === 'pulse') return FX.pulseRing(ctx, s, ox, oy, performance.now() / 1000);
  if (s.shape === 'airblade') return FX.airBlade(ctx, s, ox, oy, performance.now() / 1000);
  if (s.shape === 'cannon') return FX.cannonShot(ctx, s, ox, oy, performance.now() / 1000);
  if (s.shape === 'stream' || s.shape === 'beam') {
    ctx.lineWidth = s.r; ctx.beginPath();
    const tail = s.shape === 'beam' ? 40 : 14;
    ctx.moveTo(x - Math.cos(s.ang) * tail, y - Math.sin(s.ang) * tail); ctx.lineTo(x, y); ctx.stroke(); ctx.lineWidth = 1;
  } else if (s.shape === 'wave') {
    ctx.beginPath(); ctx.arc(x, y, s.r, s.ang - 1, s.ang + 1); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x, y, s.r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 1, y - 2, 2, 2);
  }
}

// Shiny sparkle (mainline style): a ring of four-point stars bursting out, then a few twinkles drifting up.
function drawShiny(f, ox, oy) {
  const p = f.t / f.dur, x = f.follow.x - ox, y = f.follow.y - oy, r = (f.follow.r ?? 10) + 4;
  const star = (sx, sy, k, a) => {
    ctx.globalAlpha = a; ctx.fillStyle = '#fffbe0';
    ctx.beginPath(); ctx.moveTo(sx, sy - k); ctx.lineTo(sx + k * 0.25, sy - k * 0.25); ctx.lineTo(sx + k, sy); ctx.lineTo(sx + k * 0.25, sy + k * 0.25);
    ctx.lineTo(sx, sy + k); ctx.lineTo(sx - k * 0.25, sy + k * 0.25); ctx.lineTo(sx - k, sy); ctx.lineTo(sx - k * 0.25, sy - k * 0.25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(sx - k * 0.15, sy - k * 0.15, k * 0.3, k * 0.3);
  };
  ctx.save();
  const burst = Math.min(1, p / 0.45), out = 1 - Math.pow(1 - burst, 2); // eased outward burst in the first half
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + p * 1.5, d = r * (0.3 + out);
    star(x + Math.cos(a) * d, y + Math.sin(a) * d, (i % 2 ? 2 : 3.2) * (1 - burst * 0.6), 1 - burst * 0.9);
  }
  if (p > 0.3) for (let i = 0; i < 4; i++) { // twinkles over the body
    const q = (p - 0.3) / 0.7, tw = Math.abs(Math.sin((q * 3 + i * 0.37) * Math.PI));
    star(x + Math.cos(i * 2.1) * r * 0.6, y + Math.sin(i * 1.7) * r * 0.5 - q * 6, 2.4 * tw, (1 - q) * tw);
  }
  ctx.globalAlpha = Math.max(0, 0.5 - p) ; ctx.fillStyle = '#fff6c0'; // flash
  ctx.beginPath(); ctx.arc(x, y, r * (0.6 + p), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const MOVE_FX = { shell: FX.shellSlash, scythe: FX.scythe, ace: FX.aceSlash, tail: FX.tailWave, splash: FX.splash, bigsplash: FX.bigSplash,
  sweepcut: FX.sweepCut, nightcut: FX.nightCut, xcut: FX.xCut, aircut: FX.airCut, sacred: FX.sacredCut, typehit: FX.typeHit,
  rush: FX.rush, aquajet: FX.aquaJet, drill: FX.drill, horn: FX.hornCharge, surf: FX.surfWave,
  speed: FX.speedLines, burst: FX.burst, charge: FX.charge };
const CHARGE_FX = new Set(['rush', 'aquajet', 'drill', 'horn', 'surf']); // the ones riding on the charging body
function drawFx(f, ox, oy) {
  if (f.kind === 'shiny') return; // drawn above the dark layer (drawShiny)
  const p = f.t / f.dur;
  if (f.kind === 'after') return drawAfterimages(f, ox, oy, p);
  if (f.mouth) { const o = mouthPos(P.castAng); return FX.charge(ctx, f, o.x - ox, o.y - oy, p); }
  const x = (f.follow ? f.follow.x : f.x) - ox, y = (f.follow ? f.follow.y : f.y) - oy;
  if (MOVE_FX[f.kind]) return MOVE_FX[f.kind](ctx, f, x, y, p);
  ctx.strokeStyle = f.color ?? '#fff'; ctx.fillStyle = f.color ?? '#fff';
  if (f.kind === 'slash') {
    ctx.lineWidth = 3 * (1 - p) + 1; ctx.beginPath(); ctx.arc(x, y, f.reach, f.ang - 1.1 + p * 0.6, f.ang + 0.2 + p * 1.1); ctx.stroke(); ctx.lineWidth = 1;
  } else if (f.kind === 'bite') {
    drawBite(f, x, y, p);
  } else if (f.kind === 'ram') {
    ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.arc(x, y, 8 + p * 6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  } else if (f.kind === 'impact') {
    ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.arc(x, y, f.reach * (0.5 + p), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  } else if (f.kind === 'sweep') {
    ctx.globalAlpha = 1 - p; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, f.reach * (0.6 + p * 0.4), 0, 7); ctx.stroke(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
  } else if (f.kind === 'quake') {
    ctx.globalAlpha = 1 - p; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, f.reach * p, 0, 7); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, f.reach * p * 0.6, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  } else if (f.kind === 'ray' || f.kind === 'bolt') { // instant line, fading out
    const c = Math.cos(f.ang), s = Math.sin(f.ang);
    ctx.globalAlpha = 1 - p; ctx.lineCap = 'round';
    if (f.kind === 'bolt') { // zigzag lightning
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y);
      for (let d = 10; d < f.len; d += 10) { const j = (d / 10) % 2 ? 4 : -4; ctx.lineTo(x + c * d - s * j, y + s * d + c * j); }
      ctx.lineTo(x + c * f.len, y + s * f.len); ctx.stroke();
    } else for (const [w, st] of [[f.half * 2 + 2, f.color + '66'], [f.half * 2, f.color], [Math.max(1, f.half * 0.6), '#fff']]) {
      ctx.lineWidth = w * (1 - p * 0.5); ctx.strokeStyle = st; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + c * f.len, y + s * f.len); ctx.stroke();
    }
    ctx.lineCap = 'butt'; ctx.lineWidth = 1; ctx.globalAlpha = 1;
  } else if (f.kind === 'focus') { // psychic burst collapsing onto the spot
    ctx.globalAlpha = 1 - p; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, f.reach * (1.6 - p), 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, f.reach * 0.5 * (1 - p) + 2, 0, 7); ctx.fill(); ctx.lineWidth = 1; ctx.globalAlpha = 1;
  } else if (f.kind === 'jab') { // straight thrust
    const c = Math.cos(f.ang), s = Math.sin(f.ang), d = f.reach * (0.4 + p * 0.6);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + c * 6, y + s * 6); ctx.lineTo(x + c * d, y + s * d); ctx.stroke(); ctx.lineWidth = 1;
  } else if (f.kind === 'cross') { // X-shaped double slash
    const c = Math.cos(f.ang), s = Math.sin(f.ang), cx = x + c * f.reach * 0.7, cy = y + s * f.reach * 0.7, k = 8 * (1 - p * 0.3);
    ctx.lineWidth = 2; ctx.globalAlpha = 1 - p; ctx.beginPath();
    ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k); ctx.stroke();
    ctx.lineWidth = 1; ctx.globalAlpha = 1;
  } else if (f.kind === 'warp') { // 순간이동: a column of light where the body vanishes (narrowing) or appears (widening out)
    const k = f.arrive ? 1 - p : p, w = f.arrive ? 3 + 9 * p : 10 * (1 - p) + 1;
    ctx.globalAlpha = 1 - k * 0.9 - (f.arrive ? 0 : p * 0.1); ctx.fillStyle = '#dcf2ff';
    ctx.fillRect(x - w / 2, y - 40, w, 60);
    ctx.strokeStyle = '#9fd8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 6 + 22 * p, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  } else if (f.kind === 'muzzle') { // 거북왕's cannon firing: a burst of water and spray out of the barrel
    const c = Math.cos(f.ang), sn = Math.sin(f.ang);
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#e8f8ff';
    ctx.beginPath(); ctx.arc(x + c * 3, y + sn * 3, 3 + p * 7, 0, 7); ctx.fill();
    ctx.fillStyle = '#7ad0ff';
    for (let i = 0; i < 5; i++) { const a = f.ang + (i - 2) * 0.35, d = 4 + p * (10 + i * 2); ctx.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1, 2, 2); }
    ctx.globalAlpha = 1;
  } else if (f.kind === 'rubble') { // the ground shockwave passing: chips thrown up and a puff of dust
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#8a6a48';
    for (let i = 0; i < 3; i++) { const a = f.seed + i * 2.1, h = Math.sin(p * Math.PI) * (5 + i * 3); ctx.fillRect(x + Math.cos(a) * 4 - 1, y - h, 2, 2); }
    ctx.globalAlpha = (1 - p) * 0.5; ctx.beginPath(); ctx.arc(x, y, 3 + p * 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  } else if (f.kind === 'snipehit') { // 스나이퍼: a long shot's hit, a cross of light (and a ring for the longest)
    const k = f.big ? 1.6 : 1;
    ctx.globalAlpha = 1 - p; ctx.fillStyle = '#fff6c0';
    ctx.fillRect(x - 10 * k * (1 - p * 0.5), y - 1, 20 * k * (1 - p * 0.5), 2); ctx.fillRect(x - 1, y - 10 * k * (1 - p * 0.5), 2, 20 * k * (1 - p * 0.5));
    if (f.big) { ctx.strokeStyle = '#ffe060'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6 + p * 18, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
    ctx.globalAlpha = 1;
  } else if (f.kind === 'spikes') { // 까칠한피부: the hide's spikes bite
    ctx.globalAlpha = 1 - p; ctx.strokeStyle = '#c8f0a0';
    for (let i = 0; i < 5; i++) { const a = f.seed + i * 1.257, d0 = 4 + p * 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0); ctx.lineTo(x + Math.cos(a) * (d0 + 5), y + Math.sin(a) * (d0 + 5)); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (f.kind === 'heal') {
    ctx.fillStyle = `rgba(120,255,150,${1 - p})`;
    for (let i = 0; i < 6; i++) ctx.fillRect(x + Math.cos(i + p * 4) * 12 - 1, y - p * 20 + Math.sin(i * 2) * 6, 2, 2);
  } else if (f.kind === 'evolve') {
    ctx.fillStyle = `rgba(255,255,255,${1 - p})`; ctx.beginPath(); ctx.arc(x, y, 6 + p * 30, 0, 7); ctx.fill();
  }
}

// ---------- view model for HUD / menus ----------
// the boss bar for a 우두머리 being fought (out of a boss room): one stretch, its name and level
function alphaBar() {
  const w = wilds.find(w => w.alpha && (w.state === 'hostile' || w.fainted) && Math.hypot(w.x - P.x, w.y - P.y) < 320);
  return w && { title: '우두머리 ' + sp(w.key).name, level: w.level, segs: [{ name: sp(w.key).name, share: 1, hp: w.hp, lag: w.hpLag ?? w.hp, max: w.stats.hp, caught: false, down: !!w.fainted }] };
}
function view() {
  const st = P.stats, here = M.depthOf(P.y);
  const z = M.zoneOfRow(Math.floor(P.y / M.T));
  const areaIdx = data.zones[z.id].findIndex(a => here < a.depth[1]);
  const area = ['얕은 영역', '중간 영역', '깊은 영역'][areaIdx < 0 ? 2 : areaIdx];
  const goal = M.ZONES.find(z => !S.offered[z.id]);
  const near = wilds
    .filter(w => boxDist(w, mouse.x + cam.x, mouse.y + cam.y) < 6)
    .sort((a, b) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y))[0];
  return {
    S, data, st, hp: P.hp, hpLag: P.hpLag ?? P.hp, stamina: P.stamina, winded: P.winded, depth: here,
    place: M.scene === 'tutorial' ? '양식장' : P.y <= 0 ? '해상기지 앞 수면' : z.name + ' · ' + area,
    zone: z, pieces: piecesIn(z),
    capacity: capacity(), bagCount: bagCount(), expNow: S.exp - R.expForLevel(S.level), expNext: R.expForLevel(S.level + 1) - R.expForLevel(S.level),
    berries: S.berries, berryMax: R.berryCount(S.upgrades.berry),
    cd: P.cd, sets: setsOpen(), shift: !!(keys.ShiftLeft || keys.ShiftRight), locked: P.recharge > 0, typeColor: TYPE_COLOR, target: near && { rarity: R.RARITY[sp(near.key).rarity].name, name: (near.alpha ? '우두머리 ' : '') + sp(near.key).name, level: near.level, hp: near.hp, lag: near.hpLag ?? near.hp, max: near.stats.hp, shiny: near.shiny, boss: near.boss, fainted: near.fainted, caught: !!S.caught[near.key] },
    // 보스전: the boss bar along the top, one stretch per boss as wide as its HP share (Manaphy 2 : Phione 1 : 1 : 1)
    bossBar: (!arena && alphaBar()) || arena && (z => ({
      title: [...new Set(arena.mons.map(m => sp(m.key).name))].join(' · '), level: z.bossLevel,
      segs: arena.mons.map(m => ({ name: sp(m.key).name, share: m.share, hp: m.hp, lag: m.hpLag ?? m.hp, max: m.stats.hp, caught: !wilds.includes(m), down: !!m.fainted })),
    }))(zoneById(arena.zone)),
    // the current goal as a quest: a title, what to do, its progress (done, of) and a note
    quest: (S.rank >= 1 && urgentQuest()) || (S.rank === 0 ? tutorialQuest()
      : !goal ? { title: '임무 완료', text: '해양수산부 부장 달성' }
      : taskQuest(goal)),
    // the posts taken, under the quest card: whose, what, how far, the time left on an urgent one
    // (a 우두머리 left behind by a save from before the 개인 업무, past its step)
    sideQuests: [...Object.keys(ALPHAS).filter(z => !S.alphaPaid[z] && zoneUnlocked(zoneById(+z)) && taskOf(zoneById(+z)).step > T.ALPHA).map(z => ({ id: 'a' + z, title: '우두머리',
      text: S.alphas[z] ? '기지 게시판에 보고하기' : `우두머리 ${sp(ALPHAS[z].key).name} 포획`, progress: [S.alphas[z] ? 1 : 0, 1], left: null })),
      ...takenPosts().map(p => ({ id: p.id, title: p.dept + (p.limit ? ' · 긴급' : ''), text: Board.postGoal(p, data), progress: [postHave(p), p.n],
      left: p.deadline ? Math.max(0, p.deadline - S.playTime) : null }))],
    wanted: S.rank >= 1 ? S.wanted : 0,
    // 게시판: the 본사 지시 of the zone being worked on (its steps), then the posts
    board: S.rank >= 1 && {
      task: goal && taskView(goal),
      alphaLeft: Object.keys(ALPHAS).filter(z => S.alphas[z] && !S.alphaPaid[z] && taskOf(zoneById(+z)).step !== T.ALPHA).map(Number), // (a leftover to report)
      posts: S.board.posts.map(p => ({ ...p, line: Board.postLine(p), name: sp(p.key).name, goal: Board.postGoal(p, data), where: Board.postWhere(p, data),
        have: p.taken ? postHave(p) : 0, left: p.deadline ? Math.max(0, p.deadline - S.playTime) : null })),
      taken: takenPosts().length, max: Board.BOARD_TAKE, done: S.board.done ?? 0, reroll: Board.BOARD_REROLL,
    },
    base: import.meta.env.BASE_URL,
    rankName: R.RANKS[S.rank],
    lines: Object.entries(R.LINES).filter(([key]) => R.ENABLED_LINES.includes(key)).map(([key, l]) => ({ key, name: l.name, final: sp(l.species[2]).name, concept: l.concept, evolve: l.evolve, stats: sp(l.species[2]) })),
    prices: S.bag.map(m => (m.boss ? 0 : R.price(sp(m.key), m))),
    atBase: atBase(), npc: nearNpc() || null, dev: import.meta.env.DEV,
    hint: (h => h && { piece: h.z.piece, color: h.z.color, missing: h.missing, marked: h.marked, cost: R.pieceHintCost(h.z.id), more: h.next !== undefined })(pieceHintFor()),
    manual: Object.entries(TIPS).map(([id, t]) => ({ id, title: t.title, lines: t.lines, seen: !!(t.always || S.tips[id]) })),
    ppWait: P.ppWait, sharp: sp(S.species).passive === 'sharpness' ? [...BLADE_MOVES] : [],
  };
}

// ---------- loop ----------
let last = performance.now(), saveT = 0, hudT = 0;
function frame(nowMs) {
  const dt = Math.min(1 / 30, (nowMs - last) / 1000);
  last = nowMs;
  if (!paused()) { if (hitStop > 0) hitStop -= dt; else update(dt); }
  flushTips();
  render();
  const alphaFight = wilds.some(w => w.alpha && w.state === 'hostile' && !w.fainted && Math.hypot(w.x - P.x, w.y - P.y) < 320); // a 우두머리 after the player
  BGM.play(Cutscene.active() ? 'boss' : M.scene === 'tutorial' ? 'farm' : wilds.some(w => w.boss || (w.key === MIGHTY && w.state === 'hostile')) ? 'boss' : alphaFight ? 'alpha' : atBase() ? 'base' : 'zone' + M.zoneOfRow(Math.floor(P.y / M.T)).id);
  hudT -= dt; saveT -= dt;
  // the HUD redraws 10 times a second, 30 while an HP bar's yellow part slides down
  if (hudT <= 0) { hudT = P.hpLag > P.hp || wilds.some(w => w.hpLag > w.hp) ? 1 / 30 : 0.1; UI.hud(view()); }
  if (saveT <= 0) { saveT = 5; save(); }
  requestAnimationFrame(frame);
}
BGM.init(import.meta.env.BASE_URL);
SFX.init(import.meta.env.BASE_URL);
Title.applySound();
if (!SLOT) Title.show({ data, ranks: R.RANKS, lines: R.LINES, enabled: R.ENABLED_LINES, base: import.meta.env.BASE_URL });
else {
  UI.init(actions, view, closeMenu);
  Decor.load(import.meta.env.BASE_URL);
  Terrain.load(import.meta.env.BASE_URL);
  for (const k of Object.keys(data.species)) { sprite(k, false); sprite(k, true); }
  // continue where the last session ended (same map), otherwise from the base deck
  if (S.pos?.scene === M.scene) { P.x = S.pos.x; P.y = S.pos.feet - P.hh; lastHH = P.hh; }
  if (S.pos?.scene !== M.scene || hitsTiles(P, P.x, P.y)) placeAtBase(); // the map changed under an old save: back to the deck
  // new slot: the starter was picked on the title screen; the in-game picker is only a fallback
  const starter = Title.takeStarter();
  if (S.needsStarter && starter) actions.chooseStarter(starter);
  if (!S.needsStarter) Stats.playStart(!!starter, S.line);
  if (S.needsStarter) openMenu('starter');
  if (!S.board.posts.length) refreshBoard(); // (a save from before the board)
  requestAnimationFrame(frame);
  addEventListener('beforeunload', save);
}
// every purchase counts on the stats hub (up_<what>; the NPCs' as npc_<what>)
for (const [name, key] of [['upgradeNet', 'up_net'], ['buyPP', 'up_pp'], ['upgradeStamina', 'up_stamina'], ['upgradeBerry', 'up_berry'], ['upgradeLamp', 'up_lamp'],
  ['upgradeSets', 'up_sets'], ['upgradeCharm', 'up_charm'], ['upgradeExp', 'up_exp'], ['buyBossRadar', 'up_radar'], ['buyPieceHint', 'up_hint'],
  ['buyStat', a => `npc_${a[0]}`], ['buyLuck', a => `npc_luck_${a[0]}`]]) {
  const f = actions[name];
  actions[name] = (...a) => { const m = S.money; f(...a); if (S.money < m) Stats.count(typeof key === 'function' ? key(a) : key); };
}
// Dev-only handle: the preview pane throttles rAF, so checks drive frames by hand with step().
if (import.meta.env.DEV) window.__pd = {
  S, P, keys, mouse, cam, actions, warp, wilds: () => wilds, shots: () => shots, gainExp, makeWild, view, fire,
  fx: () => fx, quakes: () => quakes, numbers: () => numbers, tryUseMove, arena: () => arena, hazards: () => hazards, bossFight: id => startBossFight(zoneById(id)),
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) if (!paused()) update(dt); render(); UI.hud(view()); },
};
