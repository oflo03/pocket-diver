// 사내 게시판 (GAME_DESIGN.md 3번): other departments' requests pinned at the base, taken and turned in there. Pure (no DOM,
// no game state but what it is handed) so scripts/check.mjs can run it.
import { price } from './rules.js';

export const BOARD_SIZE = 7, BOARD_TAKE = 3, BOARD_SWAP = 3; // posts up, taken at most at once, swapped out per trip home
export const BOARD_EXTRA = 3; // more of a taken post's species out in its area every trip
export const BOARD_REROLL = Math.ceil(BOARD_SIZE / 2); // posts turned in before the board can be drawn anew (free, the only way)
export const AREA_NAMES = ['얕은 영역', '중간 영역', '깊은 영역'];
// each area is split west / middle / east, each third with its own species (data.json area.bands)
export const BAND_NAMES = ['서쪽', '중앙', '동쪽'];
export const bandOf = (area, key) => area.bands?.findIndex(b => b.includes(key)) ?? -1;
// where a post's Pokemon lives, roughly: 1구역 서쪽 얕은 구간
export const postWhere = (p, data) => `${p.zone}구역${(b => (b >= 0 ? ' ' + BAND_NAMES[b] : ''))(bandOf(data.zones[p.zone][p.area], p.key))} ${AREA_NAMES[p.area].replace('영역', '구간')}`;
export const UNCAUGHT_WEIGHT = 4; // a species not caught yet is this many times likelier to be asked for (posts fill the 도감)
// each department's line on its post: a request from one department to another, so polite (the secretary alone talks down)
const DEPTS = {
  deliver: [['개발부', '신형 포획망 시험에 사용할 예정입니다. 협조 부탁드립니다.'], ['영업부', '거래처에 보낼 물량이 부족합니다. 도움 부탁드립니다.'],
    ['총무부', '사무실 수조가 비어 있습니다. 채워 주시면 감사하겠습니다.'], ['홍보부', '사보 촬영에 필요합니다. 협조 부탁드립니다.']],
  cond: [['연구부', '실험에 쓸 개체입니다. 상태가 좋은 개체로 부탁드립니다.'], ['개발부', '시제품 기준에 맞는 개체가 필요합니다. 조건을 확인해 주세요.'],
    ['영업부', '거래처 요구 조건이 까다롭습니다. 잘 부탁드립니다.']],
  hunt: [['경비부', '순찰 경로를 막고 있습니다. 정리 부탁드립니다.'], ['시설관리부', '해저 배관을 망가뜨리고 있습니다. 처리해 주시면 감사하겠습니다.']],
};
const COUNT = { deliver: { monster: [2, 3], super: [1, 2], hyper: [1, 1] }, hunt: { monster: [4, 6], super: [3, 4], hyper: [2, 2] } };
const URGENT_SECONDS = { deliver: 480, cond: 480, hunt: 360 };
const pick = a => a[Math.floor(Math.random() * a.length)];
const between = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));
const ivSum = iv => iv.hp + iv.atk + iv.def + iv.spd;
const AVG_IV = { hp: 15, atk: 15, def: 16, spd: 16 };
const round10 = n => Math.max(10, Math.round(n / 10) * 10);

// A new request from one of the open zones (mostly the newest): what to bring or bring down, from which department, its
// stars (deeper and harder is more; a hard condition or a time limit adds one) and reward (over what the catch would sell for).
// A condition is mild (the area's middle level, IVs 70) or hard (its top level, IVs 80, a shiny), for more.
// skip: species already on the board; caught: the 도감's caught species (the others come up more, UNCAUGHT_WEIGHT).
export function makePost(data, zones, id, skip = [], caught = {}) {
  const zone = Math.random() < 0.6 ? zones[zones.length - 1] : pick(zones);
  const areas = data.zones[zone], areaIdx = Math.floor(Math.random() * areas.length), area = areas[areaIdx];
  const pool = area.species.filter(k => !skip.includes(k));
  const from = pool.length ? pool : area.species, w = k => (caught[k] ? 1 : UNCAUGHT_WEIGHT);
  let roll = Math.random() * from.reduce((t, k) => t + w(k), 0), key = from[from.length - 1];
  for (const k of from) if ((roll -= w(k)) < 0) { key = k; break; }
  const s = data.species[key];
  const r = Math.random(), kind = r < 0.45 ? 'deliver' : r < 0.7 ? 'cond' : 'hunt';
  const urgent = Math.random() < 0.2;
  const level = Math.round((area.level[0] + area.level[1]) / 2), worth = price(s, { level, iv: AVG_IV });
  let n = 1, cond = null, reward;
  if (kind === 'cond') {
    const c = Math.random(), hard = Math.random() < 0.4, mult = hard ? 2.5 : 1.8;
    if (c < 0.05) { cond = { shiny: true, hard: true }; reward = price(s, { level, iv: AVG_IV, shiny: true }) * 1.5; }
    else if (c < 0.55) { cond = { lv: hard ? area.level[1] - 1 : level, hard }; reward = price(s, { level: cond.lv, iv: AVG_IV }) * mult; }
    else { cond = { iv: hard ? 80 : 70, hard }; reward = price(s, { level, iv: hard ? { hp: 21, atk: 21, def: 21, spd: 22 } : { hp: 17, atk: 17, def: 18, spd: 18 } }) * mult; }
  } else {
    n = between(COUNT[kind][s.rarity] ?? [1, 1]);
    reward = worth * n * (kind === 'hunt' ? 0.6 : 1.6);
  }
  const [dept] = pick(DEPTS[kind]);
  const g = (zone - 1) * areas.length + areaIdx; // 0..8 over the whole sea
  return {
    id, kind, dept, key, n, cond, zone, area: areaIdx, got: 0, taken: false,
    stars: 1 + Math.floor(g / 2) + (cond?.hard ? 1 : 0) + (urgent ? 1 : 0),
    reward: round10(reward * (urgent ? 1.8 : 1)), limit: urgent ? URGENT_SECONDS[kind] : null,
  };
}

// a Pokemon in the net that a delivery takes (never a boss)
export const qualifies = (p, m) => m.key === p.key && !m.boss
  && (!p.cond || (p.cond.lv ? m.level >= p.cond.lv : p.cond.iv ? ivSum(m.iv) >= p.cond.iv : !!m.shiny));

// the department's line (looked up, not kept in the save, so a rewording reaches posts already up)
export const postLine = p => DEPTS[p.kind].find(([d]) => d === p.dept)?.[1] ?? '';

// what the request asks, in a line
export function postGoal(p, data) {
  const name = data.species[p.key].name;
  if (p.kind === 'hunt') return `${name} ${p.n}마리 쓰러뜨리기`;
  if (!p.cond) return `${name} ${p.n}마리 납품`;
  return p.cond.lv ? `Lv.${p.cond.lv} 이상 ${name} 납품` : p.cond.iv ? `개체값 합계 ${p.cond.iv} 이상 ${name} 납품` : `빛나는 ${name} 납품`;
}

// A trip home: the untaken urgent posts and up to BOARD_SWAP of the oldest untaken ones come down, and new ones fill
// the board back up to BOARD_SIZE.
export function refresh(board, data, zones, caught) {
  const open = board.posts.filter(p => !p.taken);
  const old = new Set([...open.filter(p => p.limit), ...open.filter(p => !p.limit).slice(0, BOARD_SWAP)]);
  board.posts = board.posts.filter(p => !old.has(p));
  fill(board, data, zones, caught);
}

// the board drawn anew once BOARD_REROLL posts are turned in: every untaken post comes down
export function reroll(board, data, zones, caught) {
  board.posts = board.posts.filter(p => p.taken);
  board.done = 0;
  fill(board, data, zones, caught);
}

function fill(board, data, zones, caught) {
  while (board.posts.length < BOARD_SIZE) board.posts.push(makePost(data, zones, ++board.seq, board.posts.map(p => p.key), caught));
}
