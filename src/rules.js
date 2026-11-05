// Pure game rules from GAME_DESIGN.md (7, 8, 10번). No DOM here so scripts/check.mjs can run it.

export const RANKS = ['인턴', '사원', '대리', '과장', '부장'];
// The rank always follows progress: 인턴 until the tutorial is done, then 사원 plus one step per zone boss offered.
// Worked out on every load, so saves from the four-rank version (인턴 대리 과장 부장) come out right too.
export const rankOf = s => ((s.rank ?? 0) >= 1 ? Math.min(RANKS.length - 1, 1 + Object.keys(s.offered ?? {}).length) : 0);
export const CRIT_CHANCE = 1 / 24;
export const CRIT_MULT = 1.5;
export const SHINY_ODDS = { 1: 1 / 500, 2: 1 / 300, 3: 1 / 100 };
export const FAINT_CATCH_SECONDS = 5;
export const TIED_NET_SECONDS = 300;

// 수배도 (GAME_DESIGN.md 3번): 0~5 stars kept as a number. Only catching raises it, a little (a 돌핀맨 caught, more);
// fighting does not. It holds WANTED_HOLD s after the last rise, then wears off slowly (twice as fast at the base) and stays
// through a trip home. At WANTED_HOSTILE stars a 돌핀맨 that sees the player chases them, from WANTED_CALL it comes in
// already after them, and from WANTED_MIGHTY one left out too long comes back as the 마이티폼.
export const WANTED_MAX = 5, WANTED_HOLD = 30, WANTED_DECAY = 1 / 300; // decay: stars per s (one in 5 minutes)
export const WANTED_GAIN = { catch: 0.1, policeCatch: 0.5 }; // per Pokemon caught
export const WANTED_HOSTILE = 1, WANTED_CALL = 3, WANTED_MIGHTY = 4;
// one 돌핀맨 out at a time, near the player; caught (or gone), the next comes POLICE_RESPAWN s later. At WANTED_CALL it
// comes already after the player. At WANTED_MIGHTY, one left out for MIGHTY_AFTER s goes and comes back as the 마이티폼.
export const POLICE_RESPAWN = 30, MIGHTY_AFTER = 60, MIGHTY_RETURN = 3;
export const MIGHTY_MULT = { hp: 2.5 };
// 언론 조작 (강화 page): pay to bring the 수배도 down a star; dearer the more stars there are
export const bribeCost = stars => 4000 * stars;
export const ARREST_FINE = 0.1; // share of the money taken when a 돌핀맨 brings the player down (and the net with it)

// Stat term: individual values count double and each effort level (0~10, Legends-Arceus style, no total cap) adds 3,
// so a perfect IV (+62) outweighs maxed effort (+30).
const calc = (base, iv, ev, level) => Math.floor((2 * base + 2 * iv + 3 * ev) * level / 100);
export const hpStat = (base, iv, ev, level) => calc(base, iv, ev, level) + level + 10;
export const otherStat = (base, iv, ev, level) => calc(base, iv, ev, level) + 5;

const NO_EV = { hp: 0, atk: 0, def: 0, spd: 0 };

// Bosses by zone: multipliers on their stats (speed stays as it is).
export const BOSS_MULT = { 1: { hp: 2, atk: 1, def: 1 }, 2: { hp: 3, atk: 1.5, def: 1.5 }, 3: { hp: 4, atk: 2, def: 2 } };
// mult: per-stat multipliers (a BOSS_MULT entry), 1 where missing
export function stats(sp, level, iv, ev = NO_EV, mult = {}) {
  const k = s => mult[s] ?? 1;
  return {
    hp: Math.round(hpStat(sp.hp, iv.hp, ev.hp, level) * k('hp')),
    atk: Math.round(otherStat(sp.atk, iv.atk, ev.atk, level) * k('atk')),
    def: Math.round(otherStat(sp.def, iv.def, ev.def, level) * k('def')),
    spd: Math.round(otherStat(sp.spd, iv.spd, ev.spd, level) * k('spd')),
  };
}

// Mainline formula with only the critical-hit modifier (no STAB, type chart or random roll).
export function damage(level, power, atk, def, crit) {
  const base = Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * power * atk / def) / 50) + 2;
  return crit ? Math.floor(base * CRIT_MULT) : base;
}

// Gen 1~4 wild-battle experience, by the zone the mon lives in: zone 1 (and the fish farm) as in the mainline, deeper
// x1.5 (sweeping a zone once or twice gets the player to its boss's level)
export const EXP_MULT = { 1: 1, 2: 1.5, 3: 1.5 };
export const expGain = (baseExp, level, zone = 1) => Math.floor(baseExp * level / 7 * (EXP_MULT[zone] ?? 1));

// ponytail: only the medium-slow curve; every playable starter line uses it. Add other curves if a non-starter becomes playable.
export const expForLevel = n => (n <= 1 ? 0 : Math.floor(1.2 * n ** 3 - 15 * n ** 2 + 100 * n - 140));

// Max PP grows by 0.5x of base per PP-NPC quest, 4 steps, 3x total.
export const maxPP = (basePP, ppLevel) => Math.floor(basePP * (1 + 0.5 * ppLevel));
// 특성 예리함 (the Oshawott line): its cutting moves hit this much harder
export const SHARPNESS = 1.3;
// a move out of PP gets one back after this long (s), so a long trip never leaves it dead for good
export const PP_REGEN_SECONDS = 60;
// Four moves on each of two sets (left / right click, Shift + left / right; the mouse wheel swaps the set). The player's wait
// after a move grows with its power, so the moves get used in turn rather than the strongest spammed: 0.8 s at power
// 40 up to about 10 s at 150 (never shorter than the move's own cooldown in data.json, which wild Pokemon keep using).
export const SLOTS = 4, SETS = 2;
// one set to start; the second is bought at the base (기지 강화)
export const SET_UPGRADES = SETS - 1;
export const setUpgradeCost = level => 2000 * (level + 1);
// 자동 배치: which learned moves go in which slots of `sets` open sets. Picks the newest moves learned while keeping a mix
// of kinds (kindOf: cut, shot, dash, body), types and quick / slow cooldowns; deals them into the sets snake-wise by
// cooldown so each set has quick and slow ones; in a set, the quickest goes on left click, a shot (no reach) on right
// click, the slower ones on Shift. Returns the slots in order (null where there is nothing to put).
export function autoEquip(learned, moves, kindOf, sets) {
  const cd = k => moveCooldown(moves[k]), slow = k => cd(k) >= 3, type = k => moves[k].type;
  const pick = [], n = Math.min(sets * SLOTS, learned.length);
  while (pick.length < n) {
    const same = (k, f) => pick.filter(q => f(q) === f(k)).length;
    const score = (k, age) => -0.6 * age - 1.2 * same(k, kindOf) - 0.7 * same(k, type) - 1.5 * same(k, slow);
    pick.push(learned.map((k, i) => [k, learned.length - 1 - i]).filter(([k]) => !pick.includes(k))
      .map(([k, age]) => [k, score(k, age)]).sort((a, b) => b[1] - a[1])[0][0]);
  }
  pick.sort((a, b) => cd(a) - cd(b));
  const bySet = Array.from({ length: sets }, () => []);
  pick.forEach((k, i) => { const c = i % sets; bySet[Math.floor(i / sets) % 2 ? sets - 1 - c : c].push(k); });
  return bySet.flatMap(ks => {
    const rest = [...ks], take = (f = () => true) => { const i = rest.findIndex(f); return i < 0 ? null : rest.splice(i, 1)[0]; };
    const left = take(), right = take(k => !moves[k].reach) ?? take();
    return [left, right, take(), take()];
  });
}
export const moveCooldown = m => Math.max(m.cooldown, Math.round((0.8 + Math.max(0, (m.power ?? 0) - 40) * 9 / 110) * 10) / 10);

// Movement speed grows with the speed stat (offset so level 5 is not a crawl); capped only at the very top.
export const moveSpeed = spd => Math.min(320, 40 + spd * 1.1);

// Chance a net holds. A fainted mon is always caught. Otherwise: the HP knocked off, times CATCH_BASE, times the
// level gap (x1 at the same level, +-0.1 per level, never below LEVEL_FLOOR), capped at 1; then each luck step cuts
// the chance of slipping out by CATCH_MULT.
export const CATCH_BASE = 0.75, LEVEL_STEP = 0.1, LEVEL_FLOOR = 0.1;
export const levelFactor = (myLevel, wildLevel) => Math.max(LEVEL_FLOOR, 1 + LEVEL_STEP * (myLevel - wildLevel));
export function catchChance(hp, maxHp, myLevel, wildLevel, luck = 0) {
  if (hp <= 0) return 1;
  const c = Math.min(1, CATCH_BASE * (1 - hp / maxHp) * levelFactor(myLevel, wildLevel));
  return 1 - (1 - c) * CATCH_MULT ** luck;
}

// Rarity tiers come from the mainline catch rate (>=120 monster, 46~119 super, <=45 hyper).
// weight = relative spawn chance inside an area, price = sell multiplier, shinyBonus = flat ₽ added to a shiny's price.
export const RARITY = {
  monster: { name: '몬스터', weight: 6, price: 1, shinyBonus: 30000 },
  super: { name: '슈퍼', weight: 3, price: 2.5, shinyBonus: 40000 },
  hyper: { name: '하이퍼', weight: 1, price: 6, shinyBonus: 50000 },
};

const ivSum = iv => iv.hp + iv.atk + iv.def + iv.spd;
// a shiny sells for 5x the normal price plus a flat bonus by rarity (₽30000 / 40000 / 50000)
export const price = (sp, mon) => {
  const p = Math.round(mon.level * sp.baseExp / 10 * (1 + ivSum(mon.iv) / 124) * RARITY[sp.rarity].price);
  return mon.shiny ? p * 5 + RARITY[sp.rarity].shinyBonus : p;
};

export const randomIV = () => {
  const r = () => Math.floor(Math.random() * 32);
  return { hp: r(), atk: r(), def: r(), spd: r() };
};

// The player's starting IVs: one value from each band, bands dealt to the four stats in random order.
export const STARTER_IV_BANDS = [[20, 30], [12, 19], [6, 11], [0, 5]];
export function starterIV() {
  const bands = [...STARTER_IV_BANDS].sort(() => Math.random() - 0.5);
  const roll = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
  return { hp: roll(bands[0]), atk: roll(bands[1]), def: roll(bands[2]), spd: roll(bands[3]) };
}

// Playable water starters in generation order (GAME_DESIGN.md 4번). Evolution levels are the mainline ones. Every line learns 18
// moves, all of them ones it can learn in Scarlet/Violet (level-up, TM or egg; Blastoise's 근원의파동 is the one exception, by
// request), the last at Lv.82 before the last boss (90): about eight by the zone 1 boss (30), fourteen by zone 2's (60).
// All lines are medium-slow.
export const LINES = {
  squirtle: { name: '꼬부기', species: ['squirtle', 'wartortle', 'blastoise'], evolve: [16, 36], concept: '강한 대포와 빔',
    learnset: [[5, 'tackle'], [7, 'water-gun'], [9, 'rapid-spin'], [12, 'bite'], [16, 'water-pulse'], [21, 'aura-sphere'], [25, 'dark-pulse'], [30, 'aqua-tail'],
      [36, 'flash-cannon'], [39, 'dragon-pulse'], [43, 'ice-beam'], [49, 'hydro-pump'], [53, 'water-spout'], [57, 'wave-crash'],
      [63, 'focus-blast'], [70, 'origin-pulse'], [76, 'hyper-beam'], [82, 'hydro-cannon']] },
  totodile: { name: '리아코', species: ['totodile', 'croconaw', 'feraligatr'], evolve: [18, 30], concept: '돌진과 광역 근접 공격',
    learnset: [[5, 'scratch'], [7, 'water-gun'], [11, 'bite'], [14, 'aqua-jet'], [18, 'ice-fang'], [22, 'metal-claw'], [26, 'waterfall'], [30, 'crunch'],
      [34, 'slash'], [38, 'psychic-fangs'], [42, 'liquidation'], [47, 'dragon-claw'], [52, 'thrash'], [57, 'aqua-tail'],
      [63, 'superpower'], [69, 'hydro-pump'], [75, 'outrage'], [82, 'hydro-cannon']] },
  mudkip: { name: '물짱이', species: ['mudkip', 'marshtomp', 'swampert'], evolve: [16, 36], concept: '돌진·지진, 벽에 부딪히면 충격파',
    learnset: [[5, 'tackle'], [7, 'water-gun'], [9, 'mud-shot'], [12, 'body-slam'], [16, 'bulldoze'], [20, 'flip-turn'], [25, 'waterfall'], [30, 'take-down'],
      [36, 'earthquake'], [39, 'brick-break'], [42, 'muddy-water'], [46, 'body-press'], [51, 'high-horsepower'], [56, 'hydro-pump'],
      [62, 'double-edge'], [68, 'liquidation'], [75, 'stone-edge'], [82, 'hydro-cannon']] },
  piplup: { name: '팽도리', species: ['piplup', 'prinplup', 'empoleon'], evolve: [16, 36], concept: '회복기, 엠페르트는 받는 피해 절반',
    learnset: [[5, 'pound'], [7, 'water-gun'], [11, 'aqua-jet'], [14, 'bubble-beam'], [16, 'metal-claw'], [21, 'brine'], [25, 'aerial-ace'], [29, 'aqua-ring'],
      [36, 'flash-cannon'], [40, 'roost'], [44, 'drill-peck'], [48, 'dual-wingbeat'], [52, 'liquidation'], [57, 'hydro-pump'],
      [63, 'steel-beam'], [69, 'ice-beam'], [75, 'wave-crash'], [82, 'hydro-cannon']] },
  // every move by Lv.82, under the last boss (90): zone 1 (to 30) brings eight, zone 2 (to 60) six more, zone 3 the last four
  oshawott: { name: '수댕이', species: ['oshawott', 'dewott', 'samurott'], evolve: [17, 36], concept: '가리비칼로 베는 근접형',
    learnset: [[5, 'tackle'], [7, 'water-gun'], [11, 'aqua-jet'], [14, 'water-pulse'], [17, 'razor-shell'], [21, 'fury-cutter'], [25, 'aerial-ace'],
      [29, 'night-slash'], [33, 'aqua-tail'], [36, 'slash'], [41, 'x-scissor'], [46, 'drill-run'], [51, 'air-slash'], [56, 'hydro-pump'],
      [62, 'surf'], [68, 'megahorn'], [75, 'sacred-sword'], [82, 'hydro-cannon']] },
  froakie: { name: '개구마르', species: ['froakie', 'frogadier', 'greninja'], evolve: [16, 36], concept: '물수리검 연타 (PP 1당 5발)',
    learnset: [[5, 'pound'], [7, 'water-gun'], [10, 'quick-attack'], [13, 'mud-shot'], [16, 'water-shuriken'], [21, 'aerial-ace'], [25, 'night-slash'], [29, 'low-kick'],
      [36, 'dark-pulse'], [39, 'u-turn'], [43, 'extrasensory'], [47, 'rock-slide'], [52, 'ice-beam'], [57, 'hydro-pump'],
      [63, 'gunk-shot'], [69, 'grass-knot'], [75, 'surf'], [82, 'hydro-cannon']] },
  popplio: { name: '누리공', species: ['popplio', 'brionne', 'primarina'], evolve: [17, 34], concept: '벽을 통과하는 광역 음파',
    learnset: [[5, 'pound'], [7, 'water-gun'], [9, 'aqua-jet'], [12, 'disarming-voice'], [15, 'icy-wind'], [17, 'bubble-beam'], [22, 'draining-kiss'], [27, 'alluring-voice'],
      [34, 'sparkling-aria'], [38, 'psychic-noise'], [44, 'hyper-voice'], [48, 'dazzling-gleam'], [51, 'moonblast'], [58, 'hydro-pump'],
      [63, 'uproar'], [69, 'ice-beam'], [75, 'surf'], [82, 'hydro-cannon']] },
  sobble: { name: '울머기', species: ['sobble', 'drizzile', 'inteleon'], evolve: [16, 35], concept: '긴 사거리의 얇고 강한 저격',
    learnset: [[5, 'pound'], [7, 'water-gun'], [10, 'ice-shard'], [12, 'water-pulse'], [16, 'sucker-punch'], [20, 'mud-shot'], [25, 'icicle-spear'], [30, 'u-turn'],
      [35, 'snipe-shot'], [39, 'dark-pulse'], [43, 'liquidation'], [47, 'shadow-ball'], [52, 'air-slash'], [57, 'hydro-pump'],
      [63, 'ice-beam'], [69, 'blizzard'], [75, 'hyper-beam'], [82, 'hydro-cannon']] },
  quaxly: { name: '꾸왁스', species: ['quaxly', 'quaxwell', 'quaquaval'], evolve: [16, 36], concept: '연속 콤보 격투',
    learnset: [[5, 'pound'], [7, 'water-gun'], [9, 'double-hit'], [12, 'wing-attack'], [16, 'aqua-jet'], [19, 'low-kick'], [23, 'aqua-cutter'], [28, 'air-slash'],
      [36, 'aqua-step'], [39, 'triple-axel'], [43, 'acrobatics'], [47, 'liquidation'], [52, 'mega-kick'], [57, 'hydro-pump'],
      [62, 'hurricane'], [65, 'surging-strikes'], [68, 'close-combat'], [75, 'wave-crash'], [82, 'hydro-cannon']] },
};
// the lines a new game can start with (all of them: every line has its animation sheet)
export const ENABLED_LINES = Object.keys(LINES);
export const lineOf = species => Object.keys(LINES).find(k => LINES[k].species.includes(species));
// [level, next species] for a species that can still evolve
export function evolveOf(species) {
  const l = LINES[lineOf(species)], i = l ? l.species.indexOf(species) : -1;
  return i >= 0 && i < l.evolve.length ? [l.evolve[i], l.species[i + 1]] : null;
}

// ---- NPC and shop upgrades (all paid with money) ----
export const EV_MAX = 10; // effort level per stat (Uxie)
export const evCost = level => 400 * (level + 1);
export const IV_MAX = 31; // Mesprit raises one IV by 1
export const ivCost = iv => 200 * (iv + 1);
export const LUCK_MAX = 4; // Azelf: catch and crit, 4 steps each
export const CATCH_MULT = 0.85; // net escape chance x0.85 per catch step
export const CRIT_TABLE = [1 / 24, 1 / 16, 1 / 12, 1 / 8, 1 / 6];
export const luckCost = level => 8000 * (level + 1);
export const PP_MAX = 4; // base shop: +0.5x base PP per step, 3x at max
export const ppCost = level => 1500 * (level + 1);

// 조각 탐지 (base): marks roughly where one of the zone's missing pieces is, a circle of this many tiles around it
export const pieceHintCost = zone => [0, 300, 3000, 10000][zone] ?? 10000;
export const PIECE_HINT_RADIUS = 16;

export const NET_UPGRADES = 5;
export const netCapacity = level => 5 + level;
export const netUpgradeCost = level => 150 * (level + 1);
export const LAMP_UPGRADES = 4;
export const lampRadius = level => 70 + 20 * level;
export const lampUpgradeCost = level => 120 * (level + 1);
// Stamina: how long Shift sprinting lasts. Refill speeds up by the same factor, so an empty bar still fills in the same time.
export const STAMINA_UPGRADES = 4;
export const staminaSeconds = level => 3 + 0.75 * level;
export const staminaUpgradeCost = level => 200 * (level + 1);
// 열매주머니: how many 자뭉열매 (Oran Berries) a dive carries, 0 to 5; refilled at the base. R eats one for this share of max HP.
export const BERRY_UPGRADES = 5;
export const berryCount = level => level; // none until the first pouch upgrade
export const berryUpgradeCost = level => 300 * (level + 1);
// 빛나는 부적 (Shiny Charm): each level adds the base shiny odds once more (x2, x3, x4); dear, as a shiny sells for ₽30000+
export const CHARM_UPGRADES = 3;
export const charmMult = level => 1 + level;
export const charmUpgradeCost = level => [10000, 25000, 50000][level];
// 학습 장치 (Exp. Share): +10% exp from every wild per level
export const EXP_UPGRADES = 3;
export const expMult = level => 1 + 0.1 * level;
export const expUpgradeCost = level => [2000, 5000, 10000][level];
// 보스 탐지기: bought once, it marks the room of the boss still to be offered on the map, found or not
export const BOSS_RADAR_COST = 5000;
export const BERRY_HEAL = 0.3;
