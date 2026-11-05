// DOM HUD and menus drawn over the low-res canvas so Korean text stays sharp.
import { moveIcon } from './icons.js';
import { soundRows, uiRows, switchRow } from './title.js';
import { controlsArt, controlsNotes } from './controls.js';
import { stats as statsAt, RARITY, EV_MAX, evCost, IV_MAX, ivCost, LUCK_MAX, CATCH_MULT, CRIT_TABLE, luckCost, PP_MAX, ppCost, maxPP, moveCooldown, SLOTS, netCapacity, netUpgradeCost, NET_UPGRADES, lampRadius, lampUpgradeCost, LAMP_UPGRADES, staminaSeconds, staminaUpgradeCost, STAMINA_UPGRADES, berryCount, berryUpgradeCost, BERRY_UPGRADES, BERRY_HEAL, CHARM_UPGRADES, charmMult, charmUpgradeCost, EXP_UPGRADES, expMult, expUpgradeCost, BOSS_RADAR_COST, bribeCost, SET_UPGRADES, setUpgradeCost, PP_REGEN_SECONDS, SHARPNESS } from './rules.js';

const $ = id => document.getElementById(id);
let actions, getView, onClose;
const TURNS = '[data-ui="upnav"], [data-ui="upgo"]'; // what turns the 강화 carousel

export function init(a, v, close) {
  actions = a; getView = v; onClose = close;
  $('menu').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'), ui = e.target.closest('[data-ui]');
    if (!b && ui?.matches(TURNS)) return; // (turned on the press: pointerdown below)
    if (!(b && ui?.contains(b)) && uiClick(ui, false)) return; // a button inside a clickable box (a 강화 card) does its own thing
    if (!b) return;
    if (b.dataset.act === 'sellMany' || b.dataset.act === 'sell') baseUi.picked.clear(); // bag indices shift after a sale
    if (b.dataset.act === 'close') return onClose();
    actions[b.dataset.act](...JSON.parse(b.dataset.args ?? '[]'));
    if (!$('menu').classList.contains('hidden')) openMenu($('menu').dataset.name, getView());
  });
  // holo cards (.tilt) lean toward the pointer while it is over them, the foil's shine following it
  $('menu').addEventListener('pointermove', e => {
    for (const el of $('menu').querySelectorAll('.tilt')) {
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      el.classList.toggle('live', inside);
      el.style.setProperty('--ry', inside ? `${((x - 0.5) * 20).toFixed(2)}deg` : '0deg');
      el.style.setProperty('--rx', inside ? `${((0.5 - y) * 16).toFixed(2)}deg` : '0deg');
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`); el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    }
  });
  $('menu').addEventListener('contextmenu', e => { e.preventDefault(); uiClick(e.target.closest('[data-ui]'), true); });
  // 강화: the arrows and the side cards turn the carousel on the press, not the click (a click is lost when the release
  // lands off the element); the press takes no focus and selects no text
  $('menu').addEventListener('pointerdown', e => {
    const el = e.button === 0 && !e.target.closest('[data-act]') && e.target.closest(TURNS);
    if (!el || el.disabled) return;
    e.preventDefault();
    uiClick(el, false);
  });
  // 포켓몬 상태: the wheel turns its pages (a page long enough to scroll, like the move list, scrolls instead)
  let wheelAt = 0;
  $('menu').addEventListener('wheel', e => {
    if ($('menu').dataset.name === 'pause' && pauseUi.tab === 'upgrade') { // 강화: the wheel turns the cards
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < 180 || !(e.deltaY || e.deltaX)) return;
      wheelAt = now; spinUpgrades(pauseUi.up + Math.sign(e.deltaY || e.deltaX));
      return;
    }
    if ($('menu').dataset.name === 'pause' && pauseUi.tab === 'system') { // 설정: the wheel steps through its inner tabs
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < 250 || !e.deltaY) return;
      wheelAt = now;
      const i = SYS_TABS.findIndex(([k]) => k === pauseUi.sys);
      pauseUi.sys = SYS_TABS[(i + Math.sign(e.deltaY) + SYS_TABS.length) % SYS_TABS.length][0];
      openMenu('pause', getView());
      return;
    }
    if ($('menu').dataset.name !== 'pause' || pauseUi.tab !== 'status') return;
    const page = e.target.closest('.sum-page');
    if (page && page.scrollHeight > page.clientHeight + 1) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 250 || !e.deltaY) return; // one wheel turn sends several events: one page a beat
    wheelAt = now; cycleSub(Math.sign(e.deltaY));
  }, { passive: false });
  // the equip board: a move icon dragged onto a slot goes there (swapping with the slot it came from, if any); a slot's
  // icon dragged back onto the list of moves empties the slot
  const target = e => e.target.closest('[data-slot], [data-pool]');
  $('menu').addEventListener('dragstart', e => {
    const el = e.target.closest('[data-move]');
    if (!el) return;
    e.dataTransfer.setData('text/plain', JSON.stringify({ key: el.dataset.move, from: el.dataset.slot ?? null }));
    e.dataTransfer.effectAllowed = 'move';
  });
  $('menu').addEventListener('dragover', e => { const t = target(e); if (t) { e.preventDefault(); t.classList.add('over'); } });
  $('menu').addEventListener('dragleave', e => target(e)?.classList.remove('over'));
  $('menu').addEventListener('drop', e => {
    const t = target(e);
    if (!t) return;
    e.preventDefault();
    let d; try { d = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (t.dataset.slot !== undefined) actions.equip(+t.dataset.slot, d.key);
    else if (d.from !== null) actions.equip(+d.from, null);
    pauseUi.pick = null;
    openMenu($('menu').dataset.name, getView());
  });
  addEventListener('keydown', e => { // 강화: ←→ (or A·D) turn the cards
    if ($('menu').classList.contains('hidden') || $('menu').dataset.name !== 'pause' || pauseUi.tab !== 'upgrade') return;
    const d = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }[e.code];
    if (d) { e.preventDefault(); spinUpgrades(pauseUi.up + d); }
  });
  $('dialog').addEventListener('click', e => {
    const c = e.target.closest('[data-choice]');
    if (c) choose(+c.dataset.choice); else advance();
  });
}

// clicks that only change the menu's own view (tabs, which Pokemon is shown, which are ticked)
function uiClick(el, right) {
  if (!el) return false;
  const kind = el.dataset.ui, val = el.dataset.v;
  if (kind === 'upnav') { spinUpgrades(pauseUi.up + +val); return true; }
  if (kind === 'upgo') { if (+val !== pauseUi.up) spinUpgrades(+val); return true; } // a side card turns to the front
  if (kind === 'ptab') pauseUi.tab = val;
  if (kind === 'tippick') pauseUi.tipPick = val;
  if (kind === 'sys') pauseUi.sys = val;
  if (kind === 'dexpick') pauseUi.dexPick = val;
  if (kind === 'bpick') boardUi.pick = val === 'main' ? val : +val;
  if (kind === 'mon') {
    const i = +val, m = getView().S.bag[i];
    baseUi.focus = i;
    if (right && m && !m.boss && getView().atBase) baseUi.picked.has(i) ? baseUi.picked.delete(i) : baseUi.picked.add(i);
  }
  if (kind === 'pickall') getView().S.bag.forEach((m, i) => { if (!m.boss) baseUi.picked.add(i); });
  if (kind === 'pickmove') pauseUi.pick = pauseUi.pick === val ? null : val;
  if (kind === 'sub') pauseUi.sub = val;
  if (kind === 'subnav') stepSub(+val);
  if (kind === 'slot') {
    if (pauseUi.pick) actions.equip(+val, pauseUi.pick);
    else if (right) actions.equip(+val, null); // right click empties a slot
    pauseUi.pick = null;
  }
  openMenu($('menu').dataset.name, getView());
  return true;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const btn = (label, act, args = [], disabled = false) =>
  `<button data-act="${act}" data-args='${JSON.stringify(args)}' ${disabled ? 'disabled' : ''}>${label}</button>`;
const w100 = (v, max) => Math.max(0, Math.min(100, (v / max) * 100));
// lag: the HP the bar still shows in yellow behind the fill (just lost, sliding down)
const bar = (v, max, cls, lag = v) => `<div class="bar ${cls}">${lag > v ? `<i style="width:${w100(lag, max)}%"></i>` : ''}<div style="width:${w100(v, max)}%"></div></div>`;

// The battle HUD: the player's status top right, the aimed-at wild Pokemon top centre, the four equipped moves along
// the bottom (each with its key, type colour, PP and a clock wipe for its cooldown), the key a nearby thing answers
// to above them and the controls below.
const SLOT_KEYS = ['좌클릭', '우클릭', 'Shift+좌', 'Shift+우'];
const SHOWN = [2, 0, 1, 3]; // the slots in on-screen order: Shift+좌, 좌, 우, Shift+우 (new moves fill 좌, 우, Shift+좌, Shift+우)
const typeColor = (v, m) => v.typeColor[m.type] ?? '#8aa6bd';
const keyLabel = i => `<span class="key${i % SLOTS > 1 ? ' cap' : ''}">${SLOT_KEYS[i % SLOTS]}</span>`;
// live: the two slots a click fires right now (left / right click, or with Shift held the Shift pair), lit; the other two dimmed
function moveSlot(v, k, i) {
  const live = (i % SLOTS < 2) !== v.shift ? ' live' : ' idle';
  if (!k) return `<div class="move empty${live}">${keyLabel(i)}<span class="ic"></span><div class="txt"><b class="name">비어 있음</b></div></div>`;
  const m = v.data.moves[k], cd = v.cd[k] ?? 0, pp = v.S.pp[k] ?? 0, max = maxPP(m.pp, v.S.ppLevel);
  const state = pp <= 0 ? 'nopp' : v.locked ? 'locked' : cd > 0 ? 'cooling' : 'ready';
  return `<div class="move ${state}${live}" style="--type:${typeColor(v, m)};--cd:${cd > 0 ? Math.min(1, cd / moveCooldown(m)) : 0}">
    ${keyLabel(i)}<img class="ic" src="${moveIcon(k, typeColor(v, m))}" alt=""><div class="txt"><b class="name">${esc(m.name)}</b><span class="pp${pp <= max / 4 ? ' low' : ''}">PP ${pp}/${max}${pp <= 0 && v.ppWait[k] !== undefined ? ` · ${Math.ceil(PP_REGEN_SECONDS - v.ppWait[k])}초` : ''}</span></div>
    ${cd > 0 ? `<span class="secs">${cd < 10 ? cd.toFixed(1) : Math.ceil(cd)}</span>` : ''}</div>`;
}
// the two move sets as a deck: the one the keys fire in front, the other smaller and dimmer just above it, its lower
// edge tucked behind the front row. The two rows are kept from one HUD update to the next (only their cards are
// redrawn), so when F or the wheel swaps them the CSS moves each row to its new place: the back one comes down and
// forward, the front one goes up and back, and they trade places in depth halfway through.
const setCards = (v, s) => SHOWN.map(i => moveSlot(v, v.S.equip[s * SLOTS + i], i)).join('');
let hudParts = null;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function hud(v) {
  const { S, data, st } = v, t = v.target;
  const prompt = v.atBase ? '기지' : v.npc ? esc(v.npc.name) : '';
  if (!hudParts) {
    $('hud').innerHTML = '<div class="hud-left"></div><div class="hud-quest hidden"></div><div class="hud-panels"></div><div class="boss-slot"></div><div class="hotbar"><div class="hud-guide"></div><div class="hud-prompt"></div><div class="deck"><div class="moves"></div><div class="moves"></div><div class="berry-slot"></div></div></div>';
    hudParts = { left: $('hud').querySelector('.hud-left'), quest: $('hud').querySelector('.hud-quest'), guide: $('hud').querySelector('.hud-guide'), panels: $('hud').querySelector('.hud-panels'), boss: $('hud').querySelector('.boss-slot'), prompt: $('hud').querySelector('.hud-prompt'), deck: $('hud').querySelector('.deck'), rows: [...$('hud').querySelectorAll('.deck .moves')], berry: $('hud').querySelector('.berry-slot') };
  }
  // the boss bar keeps its element through the fight (only its inside is redrawn), so it slides in once
  const bossOn = !!v.bossBar;
  if (hudParts.boss.classList.contains('bossbar') !== bossOn) hudParts.boss.className = bossOn ? 'panel bossbar boss-slot' : 'boss-slot';
  hudParts.boss.innerHTML = bossOn ? bossBar(v.bossBar) : '';
  hudParts.prompt.innerHTML = prompt ? `<div class="prompt"><span class="key cap">E</span>${prompt}</div>` : '';
  hudParts.deck.classList.toggle('single', v.sets < 2); // with one set there is no row behind
  // 자뭉열매: beside the move bar, R eats one; the count goes red when the pouch is empty
  hudParts.berry.className = `berry-slot${v.berries ? '' : ' empty'}${v.berryMax ? '' : ' hidden'}`; // no pouch bought yet: no slot
  hudParts.berry.innerHTML = `<span class="key cap">R</span><div class="ic">${ICONS.berry}</div><span class="count">${v.berries}/${v.berryMax}</span>`;
  hudParts.rows.forEach((row, s) => { row.className = `moves ${s === S.set ? 'front' : 'back'}`; row.innerHTML = s < v.sets ? setCards(v, s) : ''; });
  hudLeft(v);
  hudParts.panels.innerHTML = `${v.bossBar ? '' : t ? `<div class="panel target${t.boss ? ' boss' : ''}">
      <div class="who">${t.shiny ? '<span class="gold">★</span>' : ''}<b>${esc(t.name)}</b>${t.caught ? BALL : ''}<span class="lv">Lv.${t.level}</span><span class="tag">${t.boss ? 'BOSS' : t.rarity}</span></div>
      ${t.fainted ? '<div class="caught-hint">쓰러짐 · 지금 그물을 던지면 잡힌다</div>' : `<div class="meter"><span>HP</span>${bar(t.hp, t.max, t.hp <= t.max / 4 ? 'hp low' : 'hp', t.lag)}<em></em></div>`}
    </div>` : ''}`;
}
// Top left: the status card (name, level, rank, HP / 기력 / EXP), the facts as tiles, and the current goal as a quest
// card. The tiles and the card are built once and kept, so a changed value can bump, money / net / piece counts show the
// change rising off them, and a new goal flips in with a shine sweeping over it; the bars are redrawn each update.
const FACT_ICONS = {
  depth: '<svg viewBox="0 0 16 16"><path d="M8 2v9m-3.5-3.5L8 11l3.5-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 14c1.5-1 2.5-1 4 0s2.5 1 4 0 2.5-1 4 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  place: '<svg viewBox="0 0 16 16"><path d="M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="8" cy="6.5" r="1.8" fill="currentColor"/></svg>',
  net: '<svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 5h8M2 7.5h10M3 10h8M5 2v10M7.5 1.5v11M10 2v10" stroke="currentColor" stroke-width=".9" opacity=".7"/><path d="M11 11l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  piece: '<svg viewBox="0 0 16 16"><path d="M8 1.5l5.5 6.5L8 14.5 2.5 8z" fill="currentColor"/><path d="M8 1.5L5.5 8 8 14.5" fill="none" stroke="#fff" stroke-width=".9" opacity=".5"/></svg>',
  money: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 11.5V4.5h2.6a2 2 0 0 1 0 4H6m0 1.2h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  tied: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 6v3.2l2 1.4M6 1.5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const QUEST_ICON = '<svg viewBox="0 0 16 16"><path d="M3 1.5v13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3.5 2h9l-2 3 2 3h-9z" fill="currentColor"/></svg>';
let leftParts = null, last = {};
const bump = el => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }; // replay the pop
function rise(el, n, fmt) { // the change floating up off a tile
  const d = document.createElement('span');
  d.className = `delta ${n > 0 ? 'up' : 'down'}`; d.textContent = (n > 0 ? '+' : '−') + fmt(Math.abs(n));
  el.append(d); setTimeout(() => d.remove(), 1300);
}
function hudLeft(v) {
  const { S, data, st } = v;
  if (!leftParts) {
    const tile = (k, label, wide = '') => `<div class="fact ${k}${wide}"><i>${FACT_ICONS[k]}</i><span class="lbl">${label}</span><b class="val"></b></div>`;
    hudParts.left.innerHTML = `<div class="panel status"><div class="who"></div><div class="meters"></div><div class="wanted hidden"></div>
        <div class="facts">${tile('depth', '수심')}${tile('net', '포획망')}${tile('place', '구역', ' wide')}${tile('piece', '보물')}${tile('money', '돈')}${tile('tied', '묶인 망', ' wide')}</div></div>`;
    hudParts.quest.innerHTML = `<div class="quest-card"><div class="q-head"><i>${QUEST_ICON}</i><span>현재 목표</span><em class="q-new">NEW</em></div>
        <b class="q-title"></b><p class="q-text"></p><div class="q-prog"><div class="q-bar"><div></div></div><span class="q-count"></span></div><p class="q-note"></p></div><div class="q-side"></div>`;
    const q = s => hudParts.left.querySelector(s) ?? hudParts.quest.querySelector(s);
    leftParts = { who: q('.who'), meters: q('.meters'), wanted: q('.wanted'), side: q('.q-side'), card: q('.quest-card'), title: q('.q-title'), text: q('.q-text'), prog: q('.q-prog'), fill: q('.q-bar > div'), count: q('.q-count'), note: q('.q-note') };
    for (const k of Object.keys(FACT_ICONS)) leftParts[k] = q(`.fact.${k}`);
  }
  const P = leftParts;
  P.who.innerHTML = `<b>${esc(data.species[S.species].name)}</b><span class="lv">Lv.${S.level}</span><span class="rank">${v.rankName}</span>`;
  // HP as in the main games: green, yellow at half or less, red at a fifth or less (기력 is a gauge under the player)
  P.meters.innerHTML = `<div class="meter hp-row"><span>HP</span>${bar(v.hp, st.hp, v.hp <= st.hp / 5 ? 'hp low' : v.hp <= st.hp / 2 ? 'hp mid' : 'hp', v.hpLag)}<em>${v.hp}/${st.hp}</em></div>
    <div class="meter"><span>EXP</span>${bar(v.expNow, v.expNext, 'exp')}<em></em></div>`;
  // a tile's value: set it, and when it changed (and was shown before) pop it, with the change rising off for counts
  const put = (k, text, num, fmt = String) => {
    const el = P[k], val = el.querySelector('.val');
    if (val.innerHTML === text) return;
    val.innerHTML = text;
    if (last[k] !== undefined) { bump(el); if (num !== undefined && num !== last[k]) rise(el, num - last[k], fmt); }
    last[k] = num ?? text;
  };
  // 수배도: five stars, the ones earned lit (red and blinking once the 돌핀맨 chase); out of sight at none
  const stars = Math.floor(v.wanted + 1e-6), wanted = v.wanted > 0.01 ? `<span>수배</span><b>${'★'.repeat(stars)}<i>${'★'.repeat(5 - stars)}</i></b>` : '';
  if (P.wanted.innerHTML !== wanted) { P.wanted.innerHTML = wanted; P.wanted.classList.toggle('hidden', !wanted); P.wanted.classList.toggle('hot', stars >= 1); }
  P.depth.querySelector('.val').textContent = `${Math.round(v.depth)}m`; // changes all the time: no pop
  put('place', esc(v.place));
  put('net', `${v.bagCount}<small>/${v.capacity}</small>`, v.bagCount);
  P.net.classList.toggle('full', v.bagCount >= v.capacity);
  P.piece.style.setProperty('--zone', v.zone.color);
  put('piece', `${v.pieces}<small>/${v.zone.treasures.length}</small>`, v.pieces);
  put('money', `₽${S.money.toLocaleString()}`, S.money, n => '₽' + n.toLocaleString());
  P.tied.classList.toggle('hidden', !S.tiedNet);
  if (S.tiedNet) P.tied.querySelector('.val').textContent = clock(S.tiedNet.left);
  // the quest card (top right): kept out of sight while someone is talking (the secretary hands out the goal), then a
  // new goal flips in (NEW tag); progress fills its bar and pops its count
  hudParts.quest.classList.toggle('hidden', !!talkState);
  if (talkState) return;
  const side = v.sideQuests.map(q => `<div class="side-q${q.progress[0] >= q.progress[1] ? ' done' : ''}"><b>${esc(q.title)}</b>${q.left !== null ? `<em>${clock(q.left)}</em>` : ''}
      <p>${esc(q.text)}</p><div class="q-prog"><div class="q-bar"><div style="width:${w100(...q.progress)}%"></div></div><span class="q-count">${q.progress[0]} / ${q.progress[1]}</span></div></div>`).join('');
  if (P.side.innerHTML !== side) P.side.innerHTML = side;
  // the side quests stay folded under the goal; hovering the goal shows them
  const q = v.quest, key = q.title + '|' + q.text;
  if (key !== last.quest) {
    P.title.textContent = q.title; P.text.textContent = q.text;
    P.card.classList.remove('renew'); void P.card.offsetWidth; P.card.classList.add('renew');
    last.quest = key;
  }
  P.prog.classList.toggle('hidden', !q.progress);
  if (q.progress) {
    const [n, of] = q.progress, txt = `${n} / ${of}`;
    P.fill.style.width = `${w100(n, of)}%`;
    P.card.classList.toggle('done', n >= of);
    if (P.count.textContent !== txt) { if (P.count.textContent) bump(P.count); P.count.textContent = txt; }
  } else P.card.classList.remove('done');
  P.note.textContent = q.note ?? '';
  P.note.classList.toggle('hidden', !q.note);
}
// The status card and the goal card unfold while the pointer is over them (.peek), without taking the pointer: aim and
// clicks still go to the game under them
export function peek(x, y) {
  if (!hudParts) return;
  for (const el of [hudParts.left, hudParts.quest]) {
    const r = el.getBoundingClientRect(), on = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (el.classList.contains('peek') !== on) el.classList.toggle('peek', on);
  }
}
// 조작 안내 over the move bar: one step's keys (as key caps) and what they do; redrawn only when the step changes, so it
// slides in once
let guideId = null;
export function guide(g) {
  if (!hudParts || (g?.id ?? null) === guideId) return;
  guideId = g?.id ?? null;
  hudParts.guide.innerHTML = g ? `<div class="guide">${g.keys.map(k => `<span class="key cap">${esc(k)}</span>`).join('')}<span class="what">${esc(g.text)}</span></div>` : '';
}
// 보스전: name and level over one long bar along the top, split into a stretch per boss as wide as its HP share; each
// stretch drains (yellow trailing) on its own, a downed boss's says 쓰러짐 (throw the net), a caught one's 포획
function bossBar(b) {
  const segs = b.segs.map(s => `<div class="bseg${s.caught ? ' caught' : s.down ? ' down' : ''}" style="flex:${s.share}">
      ${s.caught ? '<div class="bar boss"></div>' : bar(s.hp, s.max, 'boss', s.lag)}<small>${esc(s.name)}${s.caught ? ' · 포획' : s.down ? ' · 쓰러짐' : ''}</small></div>`).join('');
  return `<div class="who"><span class="tag">BOSS</span><b>${esc(b.title)}</b><span class="lv">Lv.${b.level}</span></div><div class="segs">${segs}</div>`;
}

// short screen effects over everything: hurt (red edge, a heavy blow on the player), down (white, a boss goes down),
// slam (the boss door shutting), win (gold, every boss caught)
// the faint screen: dark, says the player fled to the base (or, arrested, was sent back there); note: an extra line (or
// ''), null takes it down
export function faintScreen(note, arrested = false) {
  let el = $('faint');
  if (!el) { el = document.createElement('div'); el.id = 'faint'; document.body.append(el); }
  if (note !== null) el.innerHTML = (arrested ? `<div class="big">체포됐다</div><p>돌핀맨에게 붙잡혀 해상기지로 넘겨졌다</p>`
      : `<div class="big">눈앞이 캄캄해졌다…</div><p>정신을 잃기 직전, 간신히 해상기지로 도망쳤다</p>`)
    + `${note ? `<p class="dim">${esc(note)}</p>` : ''}<div class="press">아무 키나 눌러 기지에서 깨어나기</div>`;
  el.classList.toggle('show', note !== null);
  document.body.classList.toggle('fainted', note !== null);
}
export function flash(kind) {
  let el = $('flash');
  if (!el) { el = document.createElement('div'); el.id = 'flash'; document.body.append(el); }
  el.className = '';
  void el.offsetWidth; // restart the animation
  el.className = kind;
}

// the sheet springs in when the menu opens, and a page slides in when it changes (not on every redraw: clicks redraw it)
let shownPage = null;
export function openMenu(name, v) {
  const m = $('menu'), opening = m.classList.contains('hidden');
  if (opening) pauseUi.startTab = pauseUi.tab; // (Tab goes once round from here, cycleTab)
  m.dataset.name = name;
  m.classList.remove('hidden');
  const body = { status, starter, pause }[name](v);
  const page = name === 'pause' ? [pauseUi.tab, pauseUi.sub, pauseUi.sys].join('/') : name;
  const fresh = opening || page !== shownPage;
  shownPage = page;
  m.innerHTML = `<div class="sheet${name === 'pause' ? ' big' : ''}${opening ? ' opening' : ''}${fresh ? ' fresh' : ''}">${body}${name === 'starter' || name === 'pause' ? '' : `<div class="foot">${btn('닫기', 'close')}</div>`}</div>`;
}
export function closeMenu() { $('menu').classList.add('hidden'); }

// a holo card: a picture on a card in its type colours (c1, c2) that leans toward the pointer (see init), with a foil
// shine and a label along its foot; pixel: the picture is a sprite (scaled without smoothing)
const holo = (src, alt, colors, label, cls = '', pixel = false, fallback = '') => `<div class="holo tilt ${cls}" style="--c1:${colors[0]};--c2:${colors[1] ?? colors[0]}">
  <div class="holo-card"><div class="holo-bg"></div><img class="holo-art${pixel ? ' pixel' : ''}" src="${src}"${fallback ? ` onerror="this.onerror=null;this.src='${fallback}'"` : ''} alt="${esc(alt)}">
    <div class="holo-foil"></div>${label}</div></div>`;
const typeColors = (v, s) => s.types.map(t => v.typeColor[t] ?? '#8aa6bd');
const typeChips = (v, s) => s.types.map(t => `<span class="type" style="--type:${v.typeColor[t] ?? '#8aa6bd'}">${TYPE_KO[t] ?? t}</span>`).join(' ');

// ---------- 포획망 (and, at the base, selling and the upgrades) ----------
// UI-only state: which bag slot is shown in the detail panel, which are ticked for selling.
const baseUi = { focus: 0, picked: new Set() };
const spriteUrl = (v, key, shiny) => `${v.base}sprites/${key}${shiny ? '-shiny' : ''}.png`;
// a row of text tabs inside a page (kind: the data-ui the clicks go to)
const subTabs = (list, cur, kind) => `<div class="subtabs">${list.map(([k, label]) => `<button class="${cur === k ? 'on' : ''}" data-ui="${kind}" data-v="${k}">${label}</button>`).join('')}</div>`;
// the 포획망 page: what is in the net, anywhere; at the base it also sells (bosses are offered from the 게시판's 본사 지시)
function netTab(v) {
  const head = `<div class="page-head"><span class="dim">포획망 <b class="${v.bagCount >= v.capacity ? 'warn' : ''}">${v.bagCount}/${v.capacity}</b>칸</span></div>`;
  return `<div class="net-page">${head}${sellTab(v, v.atBase)}</div>`;
}

// IV chart: the four stats on the corners of a square (체력 top, 공격 right, 방어 bottom, 속도 left), out of 31
// the same square for any four-stat values (the status tab's 능력치 / 개체값 / 노력 레벨): each out of max, a number
// or one per stat; cls colours the shape
function squareChart(vals, max, cls = '') {
  const R = 64, c = 80, keys = ['hp', 'atk', 'def', 'spd'], top = k => (typeof max === 'number' ? max : max[k]);
  const dir = { hp: [0, -1], atk: [1, 0], def: [0, 1], spd: [-1, 0] };
  const pt = (k, f) => [c + dir[k][0] * R * f, c + dir[k][1] * R * f];
  const ring = f => keys.map(k => pt(k, f).join(',')).join(' ');
  const grid = [0.25, 0.5, 0.75].map(f => `<polygon points="${ring(f)}" class="grid"/>`).join('');
  const shape = keys.map(k => pt(k, Math.max(0.04, Math.min(1, vals[k] / top(k)))).join(',')).join(' ');
  const label = (k, name, x, y, anchor) => `<text x="${x}" y="${y}" text-anchor="${anchor}">${name} ${vals[k]}</text>`;
  return `<svg class="iv ${cls}" viewBox="-34 -20 228 200"><polygon points="${ring(1)}" class="frame"/>${grid}
    <line x1="${c}" y1="${c - R}" x2="${c}" y2="${c + R}" class="grid"/><line x1="${c - R}" y1="${c}" x2="${c + R}" y2="${c}" class="grid"/>
    <polygon points="${shape}" class="val"/>
    ${label('hp', '체력', c, c - R - 6, 'middle')}${label('atk', '공격', c + R + 4, c + 4, 'start')}${label('def', '방어', c, c + R + 14, 'middle')}${label('spd', '속도', c - R - 4, c + 4, 'end')}</svg>`;
}
const ivChart = iv => squareChart(iv, IV_MAX);

// the net's Pokemon: a grid, the one clicked shown large with its 개체값 and price; at the base (canSell) a sell button,
// right-click to tick several and sell them together
function sellTab(v, canSell) {
  const { S, data } = v, bag = S.bag;
  for (const i of [...baseUi.picked]) if (!bag[i] || bag[i].boss || !canSell) baseUi.picked.delete(i);
  if (!bag.length) return '<p class="dim empty-note">포획망이 비어 있다 · 바다에서 포켓몬을 잡아 오자</p>';
  if (!bag[baseUi.focus]) baseUi.focus = 0;
  const cells = bag.map((m, i) => `<div class="mon-cell ${i === baseUi.focus ? 'focus' : ''} ${m.boss ? 'locked' : ''}" data-ui="mon" data-v="${i}" title="${esc(data.species[m.key].name)}">
      <img src="${spriteUrl(v, m.key, m.shiny)}" alt="">${m.shiny ? '<span class="shiny">★</span>' : ''}<span class="lv">Lv.${m.level}</span>
      ${baseUi.picked.has(i) ? '<span class="check">✔</span>' : ''}${m.boss ? '<span class="ribbon">판매 불가</span>' : ''}</div>`).join('');
  const m = bag[baseUi.focus], s = data.species[m.key], ivSum = m.iv.hp + m.iv.atk + m.iv.def + m.iv.spd;
  const detail = `<div class="mon-detail">
      ${holo(spriteUrl(v, m.key, m.shiny), s.name, m.shiny ? ['#ffd23c', '#ff9ad8'] : typeColors(v, s),
        `<div class="holo-label"><b>${m.shiny ? '<span class="gold">★</span> ' : ''}${esc(s.name)} <small>Lv.${m.level}</small></b><span class="dim">${RARITY[s.rarity].name} 등급${m.boss ? ' · <span class="red">보스</span>' : ''}</span></div>`, 'small', true)}
      <div class="detail-row">
        <div class="iv-box">${ivChart(m.iv)}</div>
        <div class="sell-box"><p class="iv-sum">개체값<br>${ivSum}/124</p>${m.boss ? '<p class="red">판매 불가</p>' : `<p class="price">₽${v.prices[baseUi.focus]}</p>${canSell ? btn('판매', 'sell', [baseUi.focus]) : ''}`}</div>
      </div>
    </div>`;
  const picked = [...baseUi.picked], total = picked.reduce((t, i) => t + v.prices[i], 0);
  return `<div class="sell-wrap"><div class="sell-left">
      <div class="mon-grid">${cells}</div>
      ${canSell ? `<div class="sell-foot"><span>선택 ${picked.length}마리 · <b>₽${total}</b></span>
        <button data-ui="pickall">전체 선택</button>${btn('선택한 포켓몬 판매', 'sellMany', [picked], !picked.length)}</div>` : ''}
    </div>${detail}</div>`;
}

// simple drawn icons for the upgrade cards
const ICONS = {
  net: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="none" stroke="#9fd0ff" stroke-width="3"/><path d="M14 22h36M10 32h44M14 42h36M22 12v40M32 8v48M42 12v40" stroke="#6aa8e0" stroke-width="2"/><path d="M50 50l10 10" stroke="#c8a060" stroke-width="5"/></svg>`,
  pp: `<svg viewBox="0 0 64 64"><rect x="20" y="16" width="24" height="40" rx="6" fill="#1e4466" stroke="#9fd0ff" stroke-width="3"/><rect x="26" y="8" width="12" height="8" fill="#9fd0ff"/><rect x="24" y="30" width="16" height="22" rx="3" fill="#4a9cff"/><path d="M34 22l-6 12h6l-4 10 10-14h-6l4-8z" fill="#ffd23c"/></svg>`,
  stamina: `<svg viewBox="0 0 64 64"><path d="M10 44c8-2 14-8 18-16l6 4c-4 8-6 14-6 22" fill="none" stroke="#9fd0ff" stroke-width="5" stroke-linecap="round"/><circle cx="40" cy="14" r="7" fill="#9fd0ff"/><path d="M28 28l14 2 8 10" fill="none" stroke="#9fd0ff" stroke-width="5" stroke-linecap="round"/><path d="M4 30h12M2 38h10M6 22h10" stroke="#ffd23c" stroke-width="3" stroke-linecap="round"/><rect x="38" y="50" width="22" height="8" rx="3" fill="#1e4466" stroke="#9fd0ff" stroke-width="2"/><rect x="40" y="52" width="13" height="4" fill="#ffd23c"/></svg>`,
  sets: `<svg viewBox="0 0 64 64"><rect x="14" y="8" width="38" height="26" rx="4" fill="#1e4466" stroke="#6aa8e0" stroke-width="3"/><rect x="10" y="26" width="44" height="30" rx="4" fill="#0f2a40" stroke="#9fd0ff" stroke-width="3"/><path d="M18 46l6-10 4 6 6-10 6 14" fill="none" stroke="#ffd23c" stroke-width="3" stroke-linejoin="round"/></svg>`,
  lamp: `<svg viewBox="0 0 64 64"><path d="M30 26L62 10v44L30 38z" fill="rgba(255,230,140,0.35)"/><rect x="8" y="22" width="22" height="20" rx="5" fill="#2a3a4a" stroke="#9fd0ff" stroke-width="3"/><circle cx="30" cy="32" r="6" fill="#ffe680"/><path d="M8 26c-6 0-6 12 0 12" stroke="#b02030" stroke-width="4" fill="none"/></svg>`,
  berry: `<svg viewBox="0 0 64 64"><path d="M32 14c-4-6-10-8-16-6 2 6 8 9 16 6z" fill="#5cc860"/><path d="M32 14c4-7 11-9 17-6-2 7-9 10-17 6z" fill="#3fa848"/><circle cx="32" cy="38" r="20" fill="#3a78e0" stroke="#9fd0ff" stroke-width="3"/><circle cx="25" cy="31" r="5" fill="#a8d0ff" opacity="0.8"/><path d="M32 18v6" stroke="#2a6a30" stroke-width="3" stroke-linecap="round"/></svg>`,
  charm: `<svg viewBox="0 0 64 64"><path d="M32 4v10" stroke="#c8a060" stroke-width="3"/><circle cx="32" cy="6" r="3" fill="none" stroke="#c8a060" stroke-width="2"/><path d="M32 14l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#ffd23c" stroke="#fff3b0" stroke-width="2" stroke-linejoin="round"/><path d="M50 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM12 40l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#9fd0ff"/></svg>`,
  exp: `<svg viewBox="0 0 64 64"><rect x="10" y="14" width="44" height="34" rx="6" fill="#1e4466" stroke="#9fd0ff" stroke-width="3"/><rect x="16" y="20" width="32" height="18" rx="2" fill="#0a1c30"/><path d="M20 34l7-8 6 5 9-9" fill="none" stroke="#5fe07a" stroke-width="3" stroke-linejoin="round"/><path d="M38 22h5v5" fill="none" stroke="#5fe07a" stroke-width="3"/><rect x="24" y="48" width="16" height="6" fill="#6aa8e0"/><text x="32" y="45" text-anchor="middle" font-size="7" fill="#ffd23c" font-family="sans-serif" font-weight="bold">EXP</text></svg>`,
  boss: `<svg viewBox="0 0 64 64"><rect x="6" y="8" width="52" height="44" rx="5" fill="#0f2a40" stroke="#6aa8e0" stroke-width="3"/><path d="M12 20h14M30 20h22M12 30h8M24 30h28M12 40h20M36 40h16" stroke="#2f5f86" stroke-width="2"/><circle cx="40" cy="30" r="10" fill="rgba(255,80,96,0.25)" stroke="#ff5060" stroke-width="2"/><path d="M35 33l2-7 3 4 3-4 2 7z" fill="#ffd23c"/><path d="M32 56l8-6 8 6" fill="#6aa8e0"/></svg>`,
  press: `<svg viewBox="0 0 64 64"><rect x="8" y="12" width="44" height="40" rx="3" fill="#e8e2d0" stroke="#9fd0ff" stroke-width="2"/><rect x="14" y="18" width="32" height="8" fill="#2a2a2a"/><path d="M14 32h14M14 38h14M14 44h14" stroke="#555" stroke-width="2"/><rect x="32" y="31" width="14" height="14" fill="#7a8a9a"/><path d="M52 20h4v28a4 4 0 0 1-4 4" fill="none" stroke="#9fd0ff" stroke-width="2"/><path d="M38 34l6 8M44 34l-6 8" stroke="#ff3040" stroke-width="3" stroke-linecap="round"/></svg>`,
  radar: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#0f2a40" stroke="#6aa8e0" stroke-width="3"/><circle cx="32" cy="32" r="16" fill="none" stroke="#2f5f86" stroke-width="2"/><path d="M32 32L52 16" stroke="#9fd0ff" stroke-width="3" stroke-linecap="round"/><path d="M32 32L52 16A26 26 0 0 1 58 32z" fill="rgba(159,208,255,0.25)"/><path d="M40 40l4 -6 4 6 -4 6z" fill="#ff3040" stroke="#fff" stroke-width="1.5"/><circle cx="44" cy="40" r="9" fill="none" stroke="#ff3040" stroke-width="2" stroke-dasharray="3 2"/></svg>`,
};
function upgradeCard(icon, title, now, next, lv, max, act, cost, money) {
  const pips = Array.from({ length: max }, (_, i) => `<span class="pip ${i < lv ? 'on' : ''}"></span>`).join('');
  return `<div class="up-card"><div class="up-lv">${lv < max ? `Lv.${lv}` : 'MAX'}</div><div class="up-icon">${ICONS[icon]}</div><h3>${title}</h3><p class="up-now">${now}</p>
    <div class="pips">${pips}</div>
    ${lv < max ? `<p class="dim">다음: ${next}</p>${btn(`강화 ₽${cost.toLocaleString()}`, act, [], money < cost)}` : '<p class="gold">최대 강화</p>'}</div>`;
}
function upgradeTab(v) {
  const { S } = v, net = S.upgrades.net, lamp = S.upgrades.lamp, sta = S.upgrades.stamina, pp = S.ppLevel;
  const cards = [
    upgradeCard('net', '포획망', `용량 ${netCapacity(net)}칸`, `${netCapacity(net + 1)}칸`, net, NET_UPGRADES, 'upgradeNet', netUpgradeCost(net), S.money),
    upgradeCard('pp', '기술 PP', `PP ×${1 + 0.5 * pp}`, `×${1 + 0.5 * (pp + 1)}`, pp, PP_MAX, 'buyPP', ppCost(pp), S.money),
    upgradeCard('stamina', '스태미나', `달리기 ${staminaSeconds(sta)}초`, `${staminaSeconds(sta + 1)}초`, sta, STAMINA_UPGRADES, 'upgradeStamina', staminaUpgradeCost(sta), S.money),
    upgradeCard('berry', '열매주머니', S.upgrades.berry ? `자뭉열매 ${berryCount(S.upgrades.berry)}개 · 하나에 체력 ${Math.round(BERRY_HEAL * 100)}%` : `아직 없음 · 자뭉열매 하나에 체력 ${Math.round(BERRY_HEAL * 100)}%`, `${berryCount(S.upgrades.berry + 1)}개`, S.upgrades.berry, BERRY_UPGRADES, 'upgradeBerry', berryUpgradeCost(S.upgrades.berry), S.money),
    upgradeCard('lamp', '헤드램프', `밝히는 범위 ${lampRadius(lamp)}`, `${lampRadius(lamp + 1)}`, lamp, LAMP_UPGRADES, 'upgradeLamp', lampUpgradeCost(lamp), S.money),
    upgradeCard('sets', '기술 세트', `${1 + S.upgrades.sets}세트 (${(1 + S.upgrades.sets) * SLOTS}칸)`, `${2 + S.upgrades.sets}세트 (${(2 + S.upgrades.sets) * SLOTS}칸)`, S.upgrades.sets, SET_UPGRADES, 'upgradeSets', setUpgradeCost(S.upgrades.sets), S.money),
    upgradeCard('charm', '빛나는 부적', `이로치 확률 ×${charmMult(S.upgrades.charm)}`, `×${charmMult(S.upgrades.charm + 1)}`, S.upgrades.charm, CHARM_UPGRADES, 'upgradeCharm', charmUpgradeCost(S.upgrades.charm), S.money),
    upgradeCard('exp', '학습 장치', `경험치 +${Math.round((expMult(S.upgrades.exp) - 1) * 100)}%`, `+${Math.round((expMult(S.upgrades.exp + 1) - 1) * 100)}%`, S.upgrades.exp, EXP_UPGRADES, 'upgradeExp', expUpgradeCost(S.upgrades.exp), S.money),
    upgradeCard('boss', '보스 탐지기', S.upgrades.radar ? '지금 가야 할 보스 방을 지도에 표시' : '보스 방을 찾아야 지도에 나온다', '지금 가야 할 보스 방을 지도(F)에 표시', S.upgrades.radar, 1, 'buyBossRadar', BOSS_RADAR_COST, S.money),
    hintCard(v),
    pressCard(v),
  ];
  pauseUi.up = Math.max(0, Math.min(cards.length - 1, pauseUi.up));
  const placed = cards.map((c, i) => c.replace('class="up-card"', `class="up-card${i === pauseUi.up ? ' front' : ''}" data-ui="upgo" data-v="${i}" style="${cardPose(i, pauseUi.up)}"`));
  return `<div class="up-wheel"><div class="up-stage">${placed.join('')}</div>
      <button class="up-nav prev" data-ui="upnav" data-v="-1" aria-label="이전"${pauseUi.up === 0 ? ' disabled' : ''}>‹</button><button class="up-nav next" data-ui="upnav" data-v="1" aria-label="다음"${pauseUi.up === cards.length - 1 ? ' disabled' : ''}>›</button>
      <div class="up-dots">${cards.map((_, i) => `<span class="${i === pauseUi.up ? 'on' : ''}"></span>`).join('')}</div></div>
    <p class="dim up-help">휠 · ←→ · 옆 카드 클릭으로 넘기기</p>`;
}
// 강화 carousel: tall cards in a row, the chosen one in front; the others turn away to its sides and fade with distance.
// The row has a first and a last card (it does not wrap round).
function cardPose(i, cur) {
  const off = i - cur;
  const a = Math.abs(off);
  return `transform: translateX(${off * 78}%) translateZ(${-a * 120}px) rotateY(${-Math.sign(off) * Math.min(a, 2) * 32}deg);`
    + `opacity: ${a > 2 ? 0 : 1 - a * 0.25}; z-index: ${10 - a}; filter: brightness(${1 - a * 0.25});`;
}
// turns the carousel without rebuilding the menu, so the cards glide to their new places
function spinUpgrades(to) {
  const cards = [...document.querySelectorAll('.up-stage .up-card')], n = cards.length;
  if (!n) return;
  pauseUi.up = Math.max(0, Math.min(n - 1, to)); // stops at the ends
  cards.forEach((c, i) => { c.style.cssText = cardPose(i, pauseUi.up); c.classList.toggle('front', i === pauseUi.up); });
  document.querySelectorAll('.up-dots span').forEach((d, i) => d.classList.toggle('on', i === pauseUi.up));
  document.querySelector('.up-nav.prev').disabled = pauseUi.up === 0;
  document.querySelector('.up-nav.next').disabled = pauseUi.up === n - 1;
}
// 언론 조작: pay the papers to bring the 수배도 down a star at a time (dearer with more stars)
function pressCard(v) {
  const stars = Math.ceil(v.S.wanted - 1e-6), cost = bribeCost(stars);
  const body = !stars ? '<p class="up-now">수배도 없음</p><p class="dim">수배도가 오르면 여기서 낮출 수 있다</p>'
    : `<p class="up-now">수배도 ${'★'.repeat(stars)}</p><p class="dim">기사를 내려 수배도를 ★1 낮춘다</p>${btn(`수배도 내리기 ₽${cost.toLocaleString()}`, 'bribePress', [], v.S.money < cost)}`;
  return `<div class="up-card"><div class="up-icon">${ICONS.press}</div><h3>언론 조작</h3>${body}</div>`;
}
// 조각 탐지: pay to have one missing piece of the zone in hand circled on the map (it goes when the piece is picked up)
function hintCard(v) {
  const h = v.hint;
  const body = !h ? '<p class="dim">찾을 조각이 남아 있지 않다</p>'
    : `<p class="up-now">${esc(h.piece)} ${h.missing}개 남음 · 표시 ${h.marked}개</p>
      ${h.more ? `<p class="dim">조각 하나의 대략적인 범위를 지도(F)에 표시</p>${btn(`탐지 ₽${h.cost.toLocaleString()}`, 'buyPieceHint', [], v.S.money < h.cost)}` : '<p class="gold">남은 조각을 모두 표시했다</p>'}`;
  return `<div class="up-card"><div class="up-icon">${ICONS.radar}</div><h3>조각 탐지</h3>${body}</div>`;
}

// ---------- 게시판: the company's corkboard, the 본사 지시 pinned first and the departments' posts after it (a card each:
// whose, what kind, the Pokemon as a silhouette, its stars), the picked card's details and buttons beside it ----------
const boardUi = { pick: 'main' };
const KIND_NAME = { deliver: '납품', cond: '조건 납품', hunt: '토벌' };
const KIND_ICON = {
  deliver: '<svg viewBox="0 0 16 16"><path d="M2 5l6-3 6 3v7l-6 3-6-3z" fill="currentColor"/><path d="M2 5l6 3 6-3M8 8v7" stroke="#0006" stroke-width="1.2" fill="none"/></svg>',
  cond: '<svg viewBox="0 0 16 16"><path d="M8 1l2 5 5 .5-4 3.5 1.3 5L8 12.3 3.7 15 5 10 1 6.5 6 6z" fill="currentColor"/></svg>',
  hunt: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 0v5M8 11v5M0 8h5M11 8h5" stroke="currentColor" stroke-width="2"/></svg>',
  urgent: '<svg viewBox="0 0 16 16"><circle cx="8" cy="9" r="6" fill="currentColor"/><path d="M8 5.5V9l2.5 1.5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M6 1.5h4" stroke="currentColor" stroke-width="2"/></svg>',
};
const tier = n => (n >= 6 ? 't3' : n >= 4 ? 't2' : '');
const tilt = id => ((id * 37) % 7 - 3) * 0.6;
const minutes = s => `${Math.ceil(s / 60)}분`;
// a Pokemon on the board shows only once it is in the 도감 (met or caught); until then it is a black shape
const known = (v, k) => !!(v.S.seen[k] || v.S.caught[k]);
function boardCard(v, p) {
  const ready = p.taken && p.have >= p.n;
  return `<div class="bcard ${tier(p.stars)}${p.taken ? ' taken' : ''}${ready ? ' ready' : ''}${boardUi.pick === p.id ? ' on' : ''}" style="--tilt:${tilt(p.id)}deg" data-ui="bpick" data-v="${p.id}">
    <i class="pin"></i><span class="dept">${esc(p.dept)}</span><span class="kind${p.limit ? ' urgent' : ''}" title="${p.limit ? '긴급' : KIND_NAME[p.kind]}">${KIND_ICON[p.limit ? 'urgent' : p.kind]}</span>
    <img class="sil${known(v, p.key) ? ' lit' : ''}" src="${spriteUrl(v, p.key)}" alt="">
    <span class="stars">${'★'.repeat(p.stars)}</span>${ready ? '<b class="stamp ok">완료</b>' : p.taken ? '<b class="stamp">수락</b>' : ''}</div>`;
}
// 개인 업무: the zone's own line of work (not a post), pinned first; its target's shape, lit once caught
function taskCard(v, m) {
  if (!m) return `<div class="bcard main done" style="--tilt:-1deg"><i class="pin"></i><span class="dept">개인 업무</span><p class="m-title">임무 완료</p><p class="m-zone">해양수산부 부장</p></div>`;
  return `<div class="bcard main taken${m.ready ? ' ready' : ''}${boardUi.pick === 'main' ? ' on' : ''}" style="--tilt:-1deg;--zone:${m.color}" data-ui="bpick" data-v="main">
    <i class="pin"></i><span class="dept">개인 업무</span><span class="kind">R</span><p class="m-title">${esc(m.zone)}</p>
    <div class="m-sils">${m.keys.length ? m.keys.map(k => `<img class="sil${m.held ? ' lit' : ''}" src="${spriteUrl(v, k, m.shiny)}" alt="">`).join('') : `<p class="m-zone">${esc(m.steps[m.step])}</p>`}</div>
    ${m.ready ? '<b class="stamp ok">보고</b>' : `<b class="stamp">${m.step + 1}단계</b>`}</div>`;
}
function boardDetail(v, b) {
  const away = v.atBase ? '' : '<p class="warn">기지에서만 받고 넘길 수 있다</p>';
  if (boardUi.pick === 'main') {
    const m = b.task;
    if (!m) return '<p class="dim">모든 구역의 보스를 바쳤다</p>';
    return `<h3><span class="tag main">개인 업무</span>${esc(m.zone)}</h3>
      <p class="quote">"${esc(m.quote)}"</p>
      <ol class="bsteps">${m.steps.map((t, i) => `<li class="${i < m.step ? 'done' : i === m.step ? 'now' : 'later'}">${esc(t)}</li>`).join('')}</ol>
      ${m.reward ? `<p class="reward">보상 · ${m.reward}</p>` : ''}${m.act ? away + btn(m.act[0], m.act[1], m.act[2], !v.atBase) : ''}
      ${b.alphaLeft.map(z => btn('우두머리 보고하기', 'reportAlpha', [z], !v.atBase)).join('')}`;
  }
  const p = b.posts.find(p => p.id === boardUi.pick);
  if (!p) return '<p class="dim">왼쪽에서 공고를 고르면 여기에 보인다</p>';
  const full = !p.taken && b.taken >= b.max;
  return `<h3><span class="tag">${esc(p.dept)}</span>${KIND_NAME[p.kind]}${p.cond?.hard ? ' <span class="tag urgent">까다로움</span>' : ''}${p.limit ? ' <span class="tag urgent">긴급</span>' : ''}</h3>
    <div class="bpic${known(v, p.key) ? '' : ' dark'}"><img src="${spriteUrl(v, p.key)}" alt=""></div>
    <p class="req">${esc(p.goal)}</p><p class="dim">${esc(p.name)} · ${esc(p.where)}</p>
    <p class="quote">"${esc(p.line)}"</p>
    <p class="reward">보상 ₽${p.reward.toLocaleString()}</p>
    ${p.limit ? `<p class="warn">${p.left !== null ? `남은 시간 ${clock(p.left)}` : `제한 시간 ${minutes(p.limit)} (받는 순간부터)`}</p>` : ''}
    ${p.taken ? `<div class="q-prog"><div class="q-bar"><div style="width:${w100(p.have, p.n)}%"></div></div><span class="q-count">${p.have} / ${p.n}</span></div>` : ''}
    ${away}${full ? `<p class="warn">한 번에 ${b.max}개까지 받을 수 있다</p>` : ''}
    <div class="brow">${!p.taken ? btn('받기', 'acceptPost', [p.id], full || !v.atBase)
      : `${btn(p.kind === 'hunt' ? '보고하기' : '납품하기', 'turnInPost', [p.id], p.have < p.n || !v.atBase)}${btn('포기', 'dropPost', [p.id])}`}</div>`;
}
function boardTab(v) {
  const b = v.board;
  if (boardUi.pick !== 'main' && !b.posts.some(p => p.id === boardUi.pick)) boardUi.pick = 'main';
  const draw = b.done >= b.reroll; // free, and only after half the board's worth is turned in
  return `<div class="board-page"><div class="page-head"><span class="dim">받은 의뢰 <b>${b.taken}/${b.max}</b> · 기지로 돌아올 때마다 공고가 바뀐다</span>
    <span class="dim">해결 <b>${Math.min(b.done, b.reroll)}/${b.reroll}</b></span>${btn('공고 새로 뽑기', 'rerollBoard', [], !draw || !v.atBase)}</div>
    <div class="board-wrap"><div class="cork">${taskCard(v, b.task)}${b.posts.map(p => boardCard(v, p)).join('')}</div><aside class="bdetail">${boardDetail(v, b)}</aside></div></div>`;
}

const pct = x => Math.round(x * 1000) / 10 + '%';

function starter(v) {
  return `<h2>함께할 스타팅 포켓몬을 골라라</h2><p class="dim">최종 진화 종족값: 체력/공격/방어/속도</p>
    <table>${v.lines.map(l => `<tr><td><b>${esc(l.name)}</b> → ${esc(l.final)}</td><td>${esc(l.concept)}</td>
      <td class="dim">진화 Lv.${l.evolve.join('/')} · ${l.stats.hp}/${l.stats.atk}/${l.stats.def}/${l.stats.spd}</td><td>${btn('선택', 'chooseStarter', [l.key])}</td></tr>`).join('')}</table>`;
}

// 포켓몬 상태, laid out like the mainline summary screen: across the top a row of icon tabs (◀ ▶ step through them) over
// one page of details at a time (◀ ▶, Space / Shift+Space or the wheel step through them); on the right the Pokemon's name
// and level over its big picture: its dot sprite, blown up.
const SUB_TABS = [['info', '정보'], ['stat', '능력치'], ['iv', '개체값'], ['ev', '노력 레벨'], ['moves', '기술']];
const SUB_ICONS = {
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M3 12h6m6 0h6" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  stat: '<svg viewBox="0 0 24 24"><path d="M12 2l10 10-10 10L2 12z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 6l5 6-5 7-7-7z" fill="currentColor"/></svg>',
  iv: '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.6L21 9.5l-5 4.4 1.5 6.8L12 17l-5.5 3.7L8 13.9 3 9.5l6.4-.9z" fill="currentColor"/></svg>',
  ev: '<svg viewBox="0 0 24 24"><path d="M4 20h4v-7H4zm6 0h4V9h-4zm6 0h4V4h-4z" fill="currentColor"/></svg>',
  moves: '<svg viewBox="0 0 24 24"><path d="M4 20L18 6m-3-3l6 0 0 6M20 20L6 6m3-3L3 3l0 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
};
const TYPE_KO = { normal: '노말', fire: '불꽃', water: '물', grass: '풀', electric: '전기', ice: '얼음', fighting: '격투', poison: '독', ground: '땅',
  flying: '비행', psychic: '에스퍼', bug: '벌레', rock: '바위', ghost: '고스트', dragon: '드래곤', dark: '악', steel: '강철', fairy: '페어리' };
const STAT_KO = [['hp', '체력'], ['atk', '공격'], ['def', '방어'], ['spd', '속도']];
// the species' ability (최종 진화에서만 계열 특성, 그 전은 급류): name, what it does
const PASSIVES = {
  sharpness: ['예리함', `베는 기술의 위력이 ${SHARPNESS}배`],
  torrent: ['급류', '체력이 1/3 이하일 때 물 타입 기술의 위력이 1.5배'],
  'mega-launcher': ['메가런처', '파동 기술(물의파동·파동탄·악의파동·용의파동·근원의파동)은 누르고 있으면 모았다가 떼면 쏜다. 모은 시간(최대 2초)에 따라 위력 1~2배'],
  'rough-skin': ['까칠한피부', '몸이 닿은 적에게 최대 체력의 1/12 피해(적마다 0.5초에 한 번)'],
  'swift-swim': ['쓱쓱', '이동 속도 1.5배, 돌진 기술의 위력 1.3배'],
  competitive: ['승기', '맞으면 다음 기술 한 번의 위력이 1.5배(그동안 몸에 붉은 기운)'],
  protean: ['변환자재', '직전에 쓴 기술과 다른 타입의 기술은 위력 1.2배(몸이 직전 타입의 색으로 빛남)'],
  'liquid-voice': ['촉촉보이스', '소리 기술의 위력이 1.5배'],
  sniper: ['스나이퍼', '멀리서 맞힐수록 위력이 세진다(화면 끝 가까이에서 2배)'],
  moxie: ['자기과신', '적을 쓰러뜨릴 때마다 10초 동안 공격 +15%(최대 3번)'],
};
const rows = list => `<table class="sum-rows">${list.map(([k, val]) => `<tr><th>${k}</th><td>${val}</td></tr>`).join('')}</table>`;
const playTime = s => `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
function sumInfo(v) {
  const { S, data } = v, s = data.species[S.species];
  const types = typeChips(v, s);
  const passive = PASSIVES[s.passive];
  return rows([['이름', esc(s.name)], ['타입', types], ...(passive ? [['특성', `<b>${passive[0]}</b> <small class="dim">${passive[1]}</small>`]] : []),
    ['직급', v.rankName], ['레벨', `Lv.${S.level}`], ['현재 경험치', S.exp.toLocaleString()],
    ['다음 레벨까지', `<div class="next">앞으로 ${(v.expNext - v.expNow).toLocaleString()}</div>${bar(v.expNow, v.expNext, 'exp')}`],
    ['운', `포획률 ${S.luck.catch}/${LUCK_MAX} · 급소 ${pct(CRIT_TABLE[S.luck.crit])}`], ['플레이 시간', playTime(S.playTime)]]);
}
// a stat page: the big square, then each stat's value (out of max where that means something)
const statPage = (vals, max, cls, note, out) => `<div class="stat-page">${squareChart(vals, max, cls + ' big')}<p class="dim">${note}</p>
  ${rows(STAT_KO.map(([k, name]) => [name, out ? `${vals[k]} <small class="dim">/ ${typeof max === 'number' ? max : max[k]}</small>` : vals[k]]))}</div>`;
function sumStat(v) {
  // 능력치 against the most this species can reach (Lv.100, every 개체값 31 and 노력 레벨 maxed), so the square fills as it grows
  const all = n => ({ hp: n, atk: n, def: n, spd: n }), best = statsAt(v.data.species[v.S.species], 100, all(IV_MAX), all(EV_MAX));
  return statPage(v.st, best, 'stat', 'Lv.100에 개체값·노력 레벨을 모두 채웠을 때가 꽉 찬 칸', false);
}
const sumIv = v => statPage(v.S.iv, IV_MAX, 'ivs', `합계 ${v.S.iv.hp + v.S.iv.atk + v.S.iv.def + v.S.iv.spd} / ${IV_MAX * 4}`, true);
const sumEv = v => statPage(v.S.ev, EV_MAX, 'evs', `합계 ${v.S.ev.hp + v.S.ev.atk + v.S.ev.def + v.S.ev.spd} / ${EV_MAX * 4}`, true);
function status(v) {
  const { S, data } = v, s = data.species[S.species], sub = pauseUi.sub;
  const tabs = SUB_TABS.map(([k, label]) => `<button class="${sub === k ? 'on' : ''}" data-ui="sub" data-v="${k}">${SUB_ICONS[k]}<span>${label}</span></button>`).join('');
  const page = { info: sumInfo, stat: sumStat, iv: sumIv, ev: sumEv, moves: equipBoard }[sub](v);
  // the 기술 page takes the whole width (no card), so both sets and every move fit without scrolling
  const card = sub === 'moves' ? '' : `<aside class="sum-card">${holo(spriteUrl(v, S.species), s.name, typeColors(v, s),
    `<div class="holo-label"><small>No.${String(s.id).padStart(4, '0')} · ${v.rankName}</small><b>${esc(s.name)} <span class="lv">Lv.${S.level}</span></b><div class="types">${typeChips(v, s)}</div></div>`,
    'big', true)}</aside>`;
  return `<div class="summary${card ? '' : ' wide'}">${card}<section class="sum-main">
    <div class="sum-bar"><div class="seg">${tabs}</div>${sub === 'moves' ? `<button class="auto" data-act="autoEquip" title="최근에 배운 기술 위주로, 베기·발사·돌진과 타입, 빠르고 느린 쿨타임이 섞이게">자동 배치</button>` : ''}</div>
    <div class="sum-page">${page}</div></section></div>`;
}

// 기술 장착: the two sets of four slots on top (the one in use marked), every learned move below as an icon tile. Drag
// a tile onto a slot (or click a tile, then a slot); drag between slots to swap them; drag a slot back onto the list
// (or right-click it) to empty it.
function equipBoard(v) {
  const { S, data } = v;
  const slot = i => {
    const k = S.equip[i], m = k && data.moves[k];
    return `<div class="eslot${k ? '' : ' empty'}${pauseUi.pick ? ' armed' : ''}" data-ui="slot" data-v="${i}" data-slot="${i}"${k ? ` draggable="true" data-move="${k}" style="--type:${typeColor(v, m)}"` : ''}>
      ${keyLabel(i)}${k ? `<img src="${moveIcon(k, typeColor(v, m))}" alt=""><b>${esc(m.name)}</b>` : '<em>비어 있음</em>'}</div>`;
  };
  const lock = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>';
  const sets = [0, 1].map(s => s >= v.sets ? `<div class="eset locked">${lock}</div>`
    : `<div class="eset${S.set === s ? ' on' : ''}"><div class="eslots">${SHOWN.map(i => slot(s * SLOTS + i)).join('')}</div></div>`).join('');
  const tiles = S.learned.map(k => {
    const m = data.moves[k], at = S.equip.slice(0, v.sets * SLOTS).indexOf(k);
    // two short lines so the whole list fits at once: name (PP in the corner), then power and cooldown; near or far on hover
    return `<div class="mtile${at >= 0 ? ' equipped' : ''}${pauseUi.pick === k ? ' picked' : ''}" draggable="true" data-move="${k}" data-ui="pickmove" data-v="${k}" style="--type:${typeColor(v, m)}" title="${m.reach ? '근접' : '원거리'}">
      <img src="${moveIcon(k, typeColor(v, m))}" alt=""><div><b>${esc(m.name)}</b><small>위력 ${v.sharp.includes(k) ? `<i class="sharp" title="예리함: ${SHARPNESS}배">${Math.round(m.power * SHARPNESS)}</i>` : m.power} · 쿨 ${moveCooldown(m)}초</small></div>
      <span class="pp">PP ${S.pp[k]}/${maxPP(m.pp, S.ppLevel)}</span></div>`;
  }).join('');
  return `<div class="eboard">${sets}</div><div class="mpool" data-pool="1">${tiles}</div>`;
}

// the next (dir 1) or previous (-1) page of 포켓몬 상태
function stepSub(dir) {
  const i = SUB_TABS.findIndex(([k]) => k === pauseUi.sub);
  pauseUi.sub = SUB_TABS[(i + dir + SUB_TABS.length) % SUB_TABS.length][0];
}
// Space while 포켓몬 상태 is up: its next page (Shift+Space back); true when it took the key
export function cycleSub(dir) {
  if ($('menu').classList.contains('hidden') || $('menu').dataset.name !== 'pause' || pauseUi.tab !== 'status') return false;
  stepSub(dir); openMenu('pause', getView()); // redrawn, so a button the click left focused cannot take the Space too
  return true;
}

// Esc in play: the game menu
// the game menu's page: which it is (no argument), or set it before opening (Tab: 포켓몬 상태, Esc: 시스템)
export function pauseTab(tab) { if (tab) pauseUi.tab = tab; return pauseUi.tab; }
// Tab with the game menu up: its next (or previous) tab
// Tab goes once round from the tab the menu opened on, then closes it (no endless loop); Shift+Tab goes back round
export function cycleTab(dir) {
  if ($('menu').classList.contains('hidden') || $('menu').dataset.name !== 'pause') return;
  const list = pauseTabs(getView()), i = list.findIndex(([k]) => k === pauseUi.tab);
  const next = list[(i + dir + list.length) % list.length][0];
  if (dir > 0 && next === pauseUi.startTab) return onClose();
  pauseUi.tab = next;
  openMenu('pause', getView());
}

// The game menu (Tab: 상태, Esc: 시스템; at the base, E: 포획망). The base adds its own: selling and the boss tribute in
// 포획망, and the 강화 tab. Its tabs stand in a column on the left, 시스템 at the foot of it.
const pauseUi = { tab: 'status', sub: 'info', pick: null, dexPick: null, tipPick: null, up: 0, sys: 'general' }; // sub: the inner tab of 포켓몬; pick: the move clicked on the equip board, waiting for a slot; dexPick: the 도감 entry shown; up: the 강화 card in front; sys: 설정's inner tab
const pauseTabs = v => [['status', '포켓몬'], ['net', '포획망'], ...(v.board ? [['board', '게시판']] : []), ...(v.atBase ? [['upgrade', '강화']] : []), ['dex', '도감'], ['manual', '매뉴얼'], ['system', '설정']];
const TAB_ICONS = {
  status: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 12h6.2m5.6 0H21" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  net: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 8h12M3.5 12h15M5 15.5h12M8 4v14M11 3v16M14 4v14" stroke="currentColor" stroke-width="1.3" opacity=".7"/><path d="M17 17l5 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  upgrade: '<svg viewBox="0 0 24 24"><path d="M12 3l7 7h-4v6H9v-6H5z" fill="currentColor"/><path d="M5 20h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  board: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="6" y="8" width="5" height="6" fill="currentColor"/><rect x="13" y="9" width="5" height="4" fill="currentColor" opacity=".7"/><circle cx="12" cy="5" r="1.8" fill="currentColor"/></svg>',
  manual: '<svg viewBox="0 0 24 24"><path d="M4 4.5C7 3.5 9.5 3.8 12 5.5c2.5-1.7 5-2 8-1V19c-3-1-5.5-.7-8 1-2.5-1.7-5-2-8-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 5.5V20" stroke="currentColor" stroke-width="2"/></svg>',
  dex: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="10" r="3" fill="currentColor"/><path d="M8 16h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  system: '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
function pause(v) {
  const list = pauseTabs(v);
  if (!list.some(([k]) => k === pauseUi.tab)) pauseUi.tab = 'net'; // left the base with 강화 up
  const tabs = list.map(([k, label]) => `<button class="tab${pauseUi.tab === k ? ' on' : ''}" data-ui="ptab" data-v="${k}">${TAB_ICONS[k]}<span>${label}</span></button>`).join('');
  const body = { status, net: netTab, board: boardTab, upgrade: upgradeTab, dex, manual, system }[pauseUi.tab](v);
  actions.tabShown(pauseUi.tab);
  return `<header class="menu-head"><div class="brand"><b>R</b><span>로켓단<br>해양수산부</span></div><nav class="tabs">${tabs}</nav>
      <div class="head-right"><span class="money">₽${v.S.money.toLocaleString()}</span><button class="x" data-act="close" title="닫기 (Esc)">✕</button></div></header>
    <main class="tab-body" data-tab="${pauseUi.tab}">${body}</main>`;
}
// 설정: the game's buttons and switches (일반), the HUD sizes (디스플레이), the volumes (사운드), the controls drawn out
// (조작법); the wheel steps through them
const SYS_TABS = [['general', '일반'], ['display', '디스플레이'], ['sound', '사운드'], ['keys', '조작법']];
function system(v) {
  const head = `<div class="page-head">${subTabs(SYS_TABS, pauseUi.sys, 'sys')}</div>`;
  if (pauseUi.sys === 'keys') return `<div class="system-page">${head}<div class="controls">${controlsArt()}${controlsNotes()}</div></div>`;
  if (pauseUi.sys === 'display') return `<div class="system-page">${head}<section class="pane sys-one"><h3>HUD 크기</h3><div class="sound-set">${uiRows()}</div></section></div>`;
  if (pauseUi.sys === 'sound') return `<div class="system-page">${head}<section class="pane sys-one"><h3>볼륨</h3><div class="sound-set">${soundRows()}</div></section></div>`;
  return `<div class="system-page">${head}<div class="sys-grid">
    <section class="pane"><h3>게임</h3><div class="pause-menu">${btn('계속하기', 'close')}${btn('저장하고 타이틀로', 'toTitle')}${v.dev ? btn('[디버그] 지도 밝히기', 'revealMap') : ''}</div></section>
    <section class="pane"><h3>표시</h3><div class="sound-set">${switchRow('damageNumbers', '데미지 숫자 표시', true)}</div></section></div></div>`;
}
// Esc with the menu up: closes the 도감 window if it is open (true), else leaves it to close the menu
export function closeOverlay() { return false; } // (no window over the menu any more: 도감 is a tab)

// 도감, like the mainline one: every species in number order, the ones met with their picture and a 몬스터볼 mark on
// the ones caught (no counts); clicking one shows it on a holo card with its number, name, types, rarity, height and
// base stats
const BALL = '<svg class="ball" viewBox="0 0 16 16" aria-label="잡음"><circle cx="8" cy="8" r="6.5" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/><path d="M1.5 8a6.5 6.5 0 0 1 13 0z" fill="#e0405a" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/></svg>';
function dex(v) {
  const { S, data } = v;
  const list = Object.entries(data.species).sort((a, b) => a[1].id - b[1].id), met = k => S.seen[k] || S.caught[k];
  const caught = list.filter(([k]) => S.caught[k]).length, seen = list.filter(([k]) => met(k)).length;
  const no = s => String(s.id).padStart(4, '0');
  const entries = list.map(([k, s]) => `<div class="${S.caught[k] ? 'caught' : met(k) ? 'seen' : ''}${pauseUi.dexPick === k ? ' on' : ''}" data-ui="dexpick" data-v="${k}">
    ${met(k) ? `<img src="${spriteUrl(v, k)}" alt="">` : '<span class="unknown">?</span>'}<small>${no(s)}</small> ${met(k) ? esc(s.name) : '???'}${S.caught[k] ? BALL : ''}</div>`).join('');
  const k = pauseUi.dexPick, s = k && data.species[k];
  const detail = !s ? '<p class="dim dex-empty">왼쪽 목록에서 포켓몬을 고르면 여기에 보인다</p>'
    : !met(k) ? `<div class="dex-unknown"><span class="unknown">?</span><h3>${no(s)} ???</h3><p class="dim">아직 만나지 못했다</p></div>`
    : `${holo(spriteUrl(v, k), s.name, typeColors(v, s), `<div class="holo-label"><small>No.${no(s)}</small><b>${esc(s.name)}${S.caught[k] ? BALL : ''}</b><div class="types">${typeChips(v, s)}</div></div>`, 'small', true)}
      ${rows([['등급', RARITY[s.rarity]?.name ?? s.rarity], ['키', `${s.height}m`]])}
      <p class="dim">종족값</p>${squareChart({ hp: s.hp, atk: s.atk, def: s.def, spd: s.spd }, 150, 'base')}`;
  return `<div class="dex-page"><div class="page-head"><span class="dim">발견 <b>${seen}</b> · 포획 <b>${caught}</b> / ${list.length}</span></div>
    <div class="dex-wrap"><div class="dex">${entries}</div><div class="dex-detail">${detail}</div></div></div>`;
}

// 매뉴얼: every system's page the player has met (the rest locked), the one picked shown on the right
function manual(v) {
  const list = v.manual, seen = list.filter(t => t.seen);
  if (!seen.some(t => t.id === pauseUi.tipPick)) pauseUi.tipPick = seen[0]?.id;
  const t = list.find(t => t.id === pauseUi.tipPick);
  const items = list.map(t => t.seen ? `<div class="${pauseUi.tipPick === t.id ? 'on' : ''}" data-ui="tippick" data-v="${t.id}">${esc(t.title)}</div>`
    : '<div class="locked">???</div>').join('');
  return `<div class="manual-page"><div class="page-head"><span class="dim">업무 매뉴얼 <b>${seen.length}</b> / ${list.length} · 새 시스템을 만나면 늘어난다</span></div>
    <div class="manual-wrap"><div class="manual-list">${items}</div><div class="manual-detail">${t ? `<h3>${esc(t.title)}</h3>${t.lines.map(l => `<p>${esc(l)}</p>`).join('')}` : ''}</div></div></div>`;
}

// 무전: 나옹's line in the corner for a while, the game going on; one after another if several come
const radioQueue = [];
let radioBusy = false;
export function radio(text, img) {
  radioQueue.push([text, img]);
  if (!radioBusy) nextRadio();
}
function nextRadio() {
  let el = $('radio');
  if (!el) { el = document.createElement('div'); el.id = 'radio'; document.body.append(el); }
  const r = radioQueue.shift();
  radioBusy = !!r;
  el.classList.toggle('show', !!r);
  if (!r) return;
  el.innerHTML = `<img src="${r[1]}" alt=""><div><b>선배 나옹 · 무전</b><p>${esc(r[0])}</p></div>`;
  setTimeout(nextRadio, 2500 + r[0].length * 70);
}

export function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 3200);
}

// Conversations stop the game until they end. Pages advance on click / Space / Enter / E; the last page can offer
// answer choices (click or number keys), shown at the box's top-right. A choice's run() may start the next conversation.
// A page is a string (said by the default speaker) or { who, img, text, me }; img is a portrait, me puts it on the right.
let talkState = null, typeTimer = null, onTalkEnd = null; // onTalkEnd: called once when the conversation closes
const TYPE_MS = 30; // typewriter speed per character
export const talking = () => !!talkState;
export function talk(who, pages, choices = null, img = null, sel = null, onEnd = null) {
  onTalkEnd = onEnd;
  talkState = { pages: pages.map(p => (typeof p === 'string' ? { who, img, text: p } : p)), choices, i: 0, sel: 0 };
  // highlight the requested answer (e.g. the one just bought, so Enter buys it again), else the first that can be picked
  if (choices) talkState.sel = sel !== null && choices[sel] && !choices[sel].disabled ? sel : Math.max(0, choices.findIndex(c => !c.disabled));
  renderTalk();
}
export const asking = () => !!talkState?.choices && talkState.i === talkState.pages.length - 1;
// Esc: end the conversation right away, without answering.
export function endTalk() { talkState = null; renderTalk(); }
// Draws the current page and types its text out; the prompt (and any choices) appear once the text is complete.
function renderTalk() {
  clearInterval(typeTimer);
  const d = $('dialog'), t = talkState;
  if (!t) {
    d.classList.add('hidden');
    const end = onTalkEnd; onTalkEnd = null; end?.();
    return;
  }
  const p = t.pages[t.i];
  d.classList.toggle('me', !!p.me);
  d.classList.toggle('tip', !!p.tip); // a 업무 매뉴얼 page
  d.innerHTML = `${p.img ? `<div class="portrait"><img src="${p.img}" alt=""></div>` : ''}
    <div class="talk-body"><b>${esc(p.who)}</b><p></p></div><div class="next"></div>`;
  d.classList.remove('hidden');
  const el = d.querySelector('p');
  const start = performance.now();
  t.typing = true;
  typeTimer = setInterval(() => { // by elapsed time, so a throttled timer catches up instead of slowing down
    const shown = Math.floor((performance.now() - start) / TYPE_MS);
    el.textContent = p.text.slice(0, shown);
    if (shown >= p.text.length) finishTyping();
  }, TYPE_MS);
}
function finishTyping() {
  clearInterval(typeTimer);
  const d = $('dialog'), t = talkState;
  t.typing = false;
  d.querySelector('p').textContent = t.pages[t.i].text;
  d.querySelector('.next').textContent = asking() ? '↑↓ · ⏎' : '... ⏎';
  if (asking()) renderChoices();
}
function renderChoices() {
  const d = $('dialog'), t = talkState;
  d.querySelector('.choices')?.remove();
  d.insertAdjacentHTML('beforeend', `<div class="choices">${t.choices.map((c, i) =>
    `<button data-choice="${i}" class="${i === t.sel ? 'sel' : ''}" ${c.disabled ? 'disabled' : ''}>${i === t.sel ? '▶' : '　'} ${i + 1}. ${esc(c.label)}</button>`).join('')}</div>`);
}
// Up/Down move the highlighted answer (skipping ones that can't be picked).
export function moveChoice(dir) {
  const t = talkState;
  if (!asking() || t.typing) return;
  const n = t.choices.length;
  for (let k = 1; k <= n; k++) {
    const i = (t.sel + dir * k + n * k) % n;
    if (!t.choices[i].disabled) { t.sel = i; break; }
  }
  renderChoices();
}
// Any key / click: finish the typing, else next page. On a question only Enter or Space (confirm = true) picks the
// highlighted answer; other keys leave it waiting.
export function advance(enter = false) {
  const t = talkState;
  if (!t) return;
  if (t.typing) return finishTyping();
  if (asking()) { if (enter) choose(t.sel); return; }
  if (++t.i < t.pages.length) return renderTalk();
  talkState = null; renderTalk();
}
export function choose(i) {
  const t = talkState, c = t?.choices?.[i];
  if (!c || c.disabled || !asking() || t.typing) return;
  talkState = null;
  c.run?.();
  renderTalk();
}
// One-off speech: long text is split into pages of two sentences.
export function dialog(who, text, img = null, onEnd = null) {
  const s = text.split(/(?<=[.!?])\s+/), pages = [];
  for (let i = 0; i < s.length; i += 2) pages.push(s.slice(i, i + 2).join(' '));
  talk(who, pages, null, img, null, onEnd);
}
