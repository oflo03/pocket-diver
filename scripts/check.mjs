// Run: npm run check. Fails loudly if a rule formula drifts from GAME_DESIGN.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../src/rules.js';
import * as Board from '../src/board.js';

const data = JSON.parse(readFileSync(new URL('../src/data.json', import.meta.url)));
const osha = data.species.oshawott;

// GAME_DESIGN.md 8번 example: oshawott Lv10, IV 15, effort level 0 -> 34 / 20 / 17 / 17 (IV counts double)
assert.deepEqual(osha.hp + '/' + osha.atk + '/' + osha.def + '/' + osha.spd, '55/63/45/45');
const iv15 = { hp: 15, atk: 15, def: 15, spd: 15 };
assert.deepEqual(R.stats(osha, 10, iv15), { hp: 34, atk: 20, def: 17, spd: 17 });
// bosses by zone: HP x2 / x3 / x4, attack and defence x1 / x1.5 / x2, speed as it is
assert.deepEqual(R.stats(osha, 10, iv15, undefined, R.BOSS_MULT[1]), { hp: 68, atk: 20, def: 17, spd: 17 });
assert.deepEqual(R.stats(osha, 10, iv15, undefined, R.BOSS_MULT[2]), { hp: 102, atk: 30, def: 26, spd: 17 });
assert.deepEqual(R.stats(osha, 10, iv15, undefined, R.BOSS_MULT[3]), { hp: 136, atk: 40, def: 34, spd: 17 });
// every move of a line comes before its last boss (Lv.90)
assert.ok(R.LINES.oshawott.learnset.every(([lv]) => lv < 90));
// a perfect IV must matter more than maxed effort levels
const lv50 = (iv, ev) => R.stats(osha, 50, { hp: iv, atk: iv, def: iv, spd: iv }, { hp: ev, atk: ev, def: ev, spd: ev }).atk;
assert.ok(lv50(31, 0) - lv50(0, 0) > lv50(0, R.EV_MAX) - lv50(0, 0));

assert.equal(R.damage(50, 100, 100, 100, false), 46);
assert.equal(R.damage(50, 100, 100, 100, true), 69);
// accuracy -> cast delay: (100 - acc) * 0.02s (hydro pump 80 -> 0.4s, aerial ace never misses -> 0s)
assert.equal(data.moves['hydro-pump'].delay, 0.4);
assert.equal(data.moves['aerial-ace'].delay, 0);
assert.equal(R.expForLevel(5), 135);
assert.equal(R.expForLevel(1), 0);
assert.equal(R.maxPP(5, 4), 15);
assert.equal(R.maxPP(35, 1), 52);
// catching: fainted is certain; full HP never holds without luck; x1 at the same level, +-0.1 per level, floor 0.1
assert.equal(R.catchChance(0, 50, 5, 40), 1);
assert.equal(R.catchChance(50, 50, 10, 10), 0);
assert.equal(R.catchChance(25, 50, 10, 10), 0.375);
assert.equal(R.levelFactor(13, 10), 1.3);
assert.equal(R.levelFactor(7, 10), 0.7);
assert.equal(R.levelFactor(1, 40), 0.1);
assert.equal(R.catchChance(5, 50, 30, 10), 1); // far above it, a nearly beaten mon is a sure catch
const karp = data.species.magikarp;
const mon = { level: 5, iv: { hp: 0, atk: 0, def: 0, spd: 0 }, shiny: false };
// a shiny: 5x the normal price plus a flat bonus by rarity (GAME_DESIGN.md 8번)
assert.equal(R.price(karp, { ...mon, shiny: true }), R.price(karp, mon) * 5 + R.RARITY[karp.rarity].shinyBonus);
// same stats, rarer tier sells for more
assert.ok(R.price({ ...karp, rarity: 'hyper' }, mon) > R.price({ ...karp, rarity: 'super' }, mon));
assert.ok(R.price({ ...karp, rarity: 'super' }, mon) > R.price({ ...karp, rarity: 'monster' }, mon));
for (const [k, s] of Object.entries(data.species)) assert.ok(R.RARITY[s.rarity] && s.height > 0, k + ' rarity/height');

// Every wild species referenced by a zone exists and has a known move.
for (const zone of Object.values(data.zones))
  for (const area of zone)
    for (const key of area.species) {
      assert.ok(data.species[key], key);
      assert.ok(data.moves[data.species[key].move], key + ' move');
    }
for (const [line, l] of Object.entries(R.LINES)) {
  for (const [, key] of l.learnset) assert.ok(data.moves[key], line + ' ' + key);
  for (const k of l.species) assert.ok(data.species[k], line + ' ' + k);
  assert.ok(l.learnset.some(([lv]) => lv <= 5), line + ' needs a starting move');
}
assert.deepEqual(R.evolveOf('totodile'), [18, 'croconaw']);
assert.equal(R.evolveOf('samurott'), null);

// starter IVs: exactly one value from each band
for (let i = 0; i < 200; i++) {
  const v = Object.values(R.starterIV()).sort((a, b) => b - a);
  R.STARTER_IV_BANDS.forEach(([a, b], k) => assert.ok(v[k] >= a && v[k] <= b, JSON.stringify(v)));
}

// cloud save sync (src/cloud.js): per slot the newer copy wins; an unowned local save the cloud replaces is backed up
const { syncPlan } = await import('../src/cloud.js');
const sv = at => JSON.stringify({ species: 'oshawott', savedAt: at });
assert.deepEqual(syncPlan(3,
  { 1: { data: sv(200), savedAt: 200 }, 2: { data: sv(100), savedAt: 100 }, 3: { data: sv(50), savedAt: 50 } },
  { 1: sv(100), 2: sv(300), 3: sv(50) }, true),
[{ n: 1, down: true, backup: false }, { n: 2, up: true, at: 300 }]); // same save in slot 3: nothing
assert.deepEqual(syncPlan(2, { 1: { data: sv(200), savedAt: 200 } }, { 1: JSON.stringify({ species: 'oshawott' }), 2: sv(10) }, false),
  [{ n: 1, down: true, backup: true }, { n: 2, up: true, at: 10 }]); // a save from before sign-in: kept aside, and uploaded where the cloud has none

// 게시판: a full board of different species from the open zones, the police never wanted, urgent posts timed; a trip home
// keeps the taken posts and swaps some of the rest; a delivery takes only what fits
const board = { posts: [], seq: 0, main: {} }, hardness = new Set();
for (let i = 0; i < 40; i++) {
  Board.refresh(board, data, [1, 2]);
  assert.equal(board.posts.length, Board.BOARD_SIZE);
  assert.equal(new Set(board.posts.map(p => p.key)).size, board.posts.length, 'one post per species');
  for (const p of board.posts) {
    assert.ok([1, 2].includes(p.zone) && data.zones[p.zone][p.area].species.includes(p.key) && p.key !== 'palafin', p.key);
    assert.ok(p.reward >= 10 && p.stars >= 1 && p.stars <= 7 && p.n >= 1 && (p.limit === null) === !p.limit, JSON.stringify(p));
    assert.ok(Board.postGoal(p, data).includes(data.species[p.key].name) && /(니다|세요)\.$/.test(Board.postLine(p)), p.dept); // polite: one department to another
    const a = data.zones[p.zone][p.area], c = p.cond; // a condition is mild or hard
    if (c) hardness.add(c.hard), assert.ok(c.shiny ? c.hard : c.lv ? c.lv === (c.hard ? a.level[1] - 1 : Math.round((a.level[0] + a.level[1]) / 2)) : c.iv === (c.hard ? 80 : 70), JSON.stringify(p));
  }
  board.posts[0].taken = true;
}
assert.ok(board.posts.filter(p => p.taken).length >= 1 && board.seq > Board.BOARD_SIZE && hardness.size === 2);
// drawing the board anew keeps the taken posts, puts up new ones for the rest and starts the count over
const kept = board.posts.filter(p => p.taken).map(p => p.id), was = board.seq;
board.done = Board.BOARD_REROLL;
Board.reroll(board, data, [1, 2]);
assert.ok(board.posts.length === Board.BOARD_SIZE && board.done === 0 && board.posts.every(p => kept.includes(p.id) || p.id > was));
const post = { key: 'magikarp', n: 1, kind: 'cond', cond: { lv: 10 } }, iv = { hp: 0, atk: 0, def: 0, spd: 0 };
assert.ok(Board.qualifies(post, { key: 'magikarp', level: 10, iv }) && !Board.qualifies(post, { key: 'magikarp', level: 9, iv }));
assert.ok(!Board.qualifies(post, { key: 'magikarp', level: 30, iv, boss: true }) && !Board.qualifies(post, { key: 'feebas', level: 30, iv }));
assert.ok(Board.qualifies({ ...post, cond: { iv: 80 } }, { key: 'magikarp', level: 1, iv: { hp: 20, atk: 20, def: 20, spd: 20 } }));
assert.ok(!Board.qualifies({ ...post, cond: { shiny: true } }, { key: 'magikarp', level: 1, iv }));
assert.ok(!data.zones[2].some(a => a.species.includes('palafin')) && data.species['palafin-hero'], '돌핀맨 is the police now');

console.log('rules ok');
