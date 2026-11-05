import { rankOf } from './rules.js';
import * as Cloud from './cloud.js';
import { controlsArt, controlsNotes } from './controls.js';
import * as BGM from './bgm.js';
import * as SFX from './sfx.js';
// Title screen and main menu: Google sign-in first when cloud saves are on (src/cloud.js), then 플레이 (3 save slots ->
// starter pick for new slots), 도감, 옵션.
// The chosen slot (and, for a new slot, the starter) live in sessionStorage; starting or leaving a game reloads the page
// so each run starts clean.
const SLOTS = 3;
const SLOT_KEY = 'pocket-diver-slot';
const STARTER_KEY = 'pocket-diver-starter';
const OPTIONS_KEY = 'pocket-diver-options';
const LEGACY_KEY = 'pocket-diver-save'; // single save from before slots existed -> slot 1

export const saveKey = slot => `pocket-diver-save-${slot}`;

const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: k => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const session = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
  del: k => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

export function currentSlot() {
  const s = Number(session.get(SLOT_KEY)) || null;
  return s && s >= 1 && s <= SLOTS ? s : null;
}
// starter picked on the title screen for a brand-new slot (read once by the game)
export function takeStarter() {
  const line = session.get(STARTER_KEY);
  session.del(STARTER_KEY);
  return line;
}
function enter(slot, starter) {
  session.set(SLOT_KEY, String(slot));
  if (starter) session.set(STARTER_KEY, starter);
  location.reload();
}
export async function leaveToTitle() {
  session.del(SLOT_KEY);
  await Cloud.within(Cloud.flush(), 3000).catch(() => {}); // the last save goes up first (unless offline)
  location.reload();
}

// ---------- options ----------
const DEFAULTS = { damageNumbers: true, bgmVolume: 50, sfxVolume: 60, uiStatus: 100, uiQuest: 100, uiBar: 100 }; // volumes and the HUD parts' sizes in %
export const options = { ...DEFAULTS, ...(JSON.parse(store.get(OPTIONS_KEY) || '{}')) };
if (options.bgm === false) options.bgmVolume = 0; // the old on/off switch
delete options.bgm;
const saveOptions = () => store.set(OPTIONS_KEY, JSON.stringify(options));

// 사운드: one slider each for the music and the battle sounds, on the title's 옵션 and the game's 시스템 page alike
// the sliders' 100% is half the files' own loudness (full loudness was far too loud), so the useful range spreads over
// the whole slider; saves from before this (no soundScale) had their volumes doubled so they sound as they did
const SOUND_SCALE = 0.5;
if (!options.soundScale) {
  if (store.get(OPTIONS_KEY)) { options.bgmVolume = Math.min(100, options.bgmVolume * 2); options.sfxVolume = Math.min(100, options.sfxVolume * 2); }
  options.soundScale = SOUND_SCALE; saveOptions();
}
export function applySound() { BGM.setVolume(options.bgmVolume / 100 * SOUND_SCALE); SFX.setVolume(options.sfxVolume / 100 * SOUND_SCALE); }
// HUD 크기: the status card, the goal card and the move bar each scale by their own --ui-* (style.css)
const UI_SIZES = [['uiStatus', '상태 카드', 'status'], ['uiQuest', '목표 카드', 'quest'], ['uiBar', '기술 바', 'bar']];
export function applyUi() { for (const [k, , css] of UI_SIZES) document.documentElement.style.setProperty('--ui-' + css, options[k] / 100); }
delete options.uiScale; // (one slider for all three, before)
applyUi();
const slider = (k, label, min, max) =>
  `<div class="opt"><span>${label}</span><span class="vol"><input type="range" min="${min}" max="${max}" step="5" value="${options[k]}" data-vol="${k}"><b>${options[k]}%</b></span></div>`;
export const soundRows = () => slider('bgmVolume', '배경음악', 0, 100) + slider('sfxVolume', '효과음', 0, 100);
export const uiRows = () => UI_SIZES.map(([k, label]) => slider(k, label, 60, 160)).join('');
// an on/off option: on the title it is a data-toggle, in the game menu a data-act (toggleOption)
export const switchRow = (k, label, inGame = false) => `<div class="opt"><span>${label}</span><button ${inGame ? `data-act="toggleOption" data-args='["${k}"]'` : `data-toggle="${k}"`} class="switch ${options[k] ? 'on' : ''}" aria-pressed="${options[k]}"><i></i></button></div>`;
export function setOption(k, v) { options[k] = v; saveOptions(); }
addEventListener('input', e => {
  const k = e.target.dataset?.vol;
  if (!k) return;
  options[k] = +e.target.value;
  e.target.nextElementSibling.textContent = options[k] + '%';
  saveOptions();
  if (k.startsWith('ui')) return applyUi();
  applySound();
  if (k === 'sfxVolume') SFX.play('hit'); // a sample at the new level
});

// ---------- menu ----------
const ICON = {
  google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
  dex: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="10" r="3" fill="currentColor"/><path d="M8 16h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  opt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="8" cy="17" r="2.4" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  ball: '<svg class="ball" viewBox="0 0 16 16" aria-label="잡음"><circle cx="8" cy="8" r="6.5" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/><path d="M1.5 8a6.5 6.5 0 0 1 13 0z" fill="#e0405a" stroke="#1a1a1a" stroke-width="1.5"/><circle cx="8" cy="8" r="2" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/></svg>',
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const loadSave = slot => { try { return JSON.parse(store.get(saveKey(slot))); } catch { return null; } };

function slotInfo(slot, data, ranks) {
  const s = loadSave(slot);
  if (!s?.species || s.needsStarter) return null;
  const mins = Math.floor((s.playTime ?? 0) / 60);
  return {
    name: data.species[s.species]?.name ?? s.species, species: s.species, level: s.level,
    rank: ranks[rankOf(s)] ?? ranks[0], time: `${Math.floor(mins / 60)}시간 ${mins % 60}분`, money: s.money ?? 0,
    pieces: (s.treasures ?? []).length,
  };
}

export function show({ data, ranks, lines, enabled, base }) {
  if (!store.get(saveKey(1)) && store.get(LEGACY_KEY)) { store.set(saveKey(1), store.get(LEGACY_KEY)); store.del(LEGACY_KEY); }
  const el = document.getElementById('title');
  el.classList.remove('hidden');
  BGM.play('title');
  // bubbles rising through the background, each with its own size, place, speed and delay
  const bubbles = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 53) % 100}%;--s:${0.5 + ((i * 7) % 10) / 8};--d:${9 + (i * 5) % 9}s;--w:${-((i * 3.7) % 12)}s"></i>`).join('');
  el.innerHTML = `<div class="title-fx">${bubbles}</div><img class="logo" src="${base}ui/logo.png" alt="로켓단 해양수산부"><div class="title-body"></div><div class="title-modal hidden"></div>`;
  const body = el.querySelector('.title-body'), modal = el.querySelector('.title-modal');
  let view = 'main', pendingSlot = null, account = null, note = '', working = false, optTab = 'general', optStart = 'general';
  const OPT_TABS = [['general', '일반'], ['display', '디스플레이'], ['sound', '사운드'], ['keys', '조작법']];
  const sprite = key => `${base}sprites/${key}.png`;
  const artImg = (key, alt) => `<img class="pixel" src="${sprite(key)}" alt="${esc(alt)}">`; // the game's own dot sprite, blown up

  const views = {
    main: () => `<nav class="title-buttons">
        <button class="tb primary" data-go="slots"${working ? ' disabled' : ''}>${ICON.play}<span><b>${working ? esc(note || '접속 중…') : '플레이'}</b></span></button>
        <button class="tb" data-modal="dex">${ICON.dex}<span><b>도감</b></span></button>
        <button class="tb" data-modal="options">${ICON.opt}<span><b>옵션</b></span></button>
        ${!account && !Cloud.enabled ? '<p class="title-note">세이브는 이 브라우저에만 저장됩니다</p>' : ''}${note && !working ? `<p class="title-note">${esc(note)}</p>` : ''}</nav>
      ${!account ? (Cloud.enabled && !working ? `<div class="account"><button class="link" data-login>Google 계정으로 로그인</button></div>` : '')
        : account.isAnonymous ? `<div class="account guest"><span class="avatar">?</span><span class="who">게스트</span>
          <button class="link-google" data-login title="이 세이브를 Google 계정에 묶어 다른 기기에서도 이어 하기">${ICON.google}Google 계정 연결</button></div>`
        : `<div class="account"><span class="avatar">${esc((account.displayName || account.email || '?')[0].toUpperCase())}</span>
          <span class="who">${esc(account.email ?? account.displayName ?? '')}</span><button class="link" data-logout>로그아웃</button></div>`}`,
    // three tall save cards: a filled one shows its Pokemon's artwork, name, level, rank, money, pieces and play time
    slots: () => `<div class="title-panel big"><div class="panel-head"><h2>세이브 선택</h2><span class="dim">카드를 눌러 이어하기 · 빈 칸은 새 게임</span><button class="x" data-go="main" title="뒤로 (Esc)">✕</button></div>
      <div class="slots">${[1, 2, 3].map((n, i) => {
      const info = slotInfo(n, data, ranks), no = `<span class="slot-no">SLOT 0${n}</span>`;
      if (!info) return `<div class="slot-card empty" data-new="${n}" style="--i:${i}">${no}<div class="plus"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></div><b>새 게임</b><small>스타팅 포켓몬 고르기</small></div>`;
      return `<div class="slot-card tilt" data-play="${n}" style="--i:${i}">${no}<button data-del="${n}" class="del" title="삭제">삭제</button>
        <div class="slot-art">${artImg(info.species, info.name)}</div>
        <div class="slot-info"><div class="slot-name"><b>${esc(info.name)}</b><span class="lv">Lv.${info.level}</span></div><span class="rank">${esc(info.rank)}</span>
          <dl class="slot-stats"><div><dt>돈</dt><dd>₽${info.money.toLocaleString()}</dd></div><div><dt>조각</dt><dd>${info.pieces}개</dd></div><div><dt>플레이</dt><dd>${info.time}</dd></div></dl>
          <span class="slot-go">이어하기 →</span></div></div>`;
    }).join('')}</div></div>`,
    starter: () => `<div class="title-panel big pick"><div class="panel-head"><h2>함께할 포켓몬</h2><span class="dim">슬롯 ${pendingSlot} · 새 게임</span><button class="x" data-go="slots" title="뒤로 (Esc)">✕</button></div>
      <div class="starters">${Object.entries(lines).map(([key, l], i) => {
      return enabled.includes(key) ? `<button class="starter tilt" data-starter="${key}" style="--i:${i}"><div class="st-art">${artImg(l.species[0], l.name)}</div><b>${esc(l.name)}</b></button>`
        : `<button class="starter off" disabled style="--i:${i}"><div class="st-art">${artImg(l.species[0], l.name)}</div><b>${esc(l.name)}</b><small>준비 중</small></button>`;
    }).join('')}</div></div>`,
  };
  const modals = {
    // three inner tabs: 일반 (switches), 디스플레이 (the HUD sizes), 사운드 (volumes)
    options: () => `<div class="panel-head"><h2>옵션</h2><button class="x" data-close title="닫기 (Esc)">✕</button></div>
        <div class="subtabs opt-tabs">${OPT_TABS.map(([k, label]) => `<button class="${optTab === k ? 'on' : ''}" data-otab="${k}">${label}</button>`).join('')}</div>
        ${optTab === 'keys' ? `<div class="controls">${controlsArt()}${controlsNotes()}</div>` : optTab === 'display' ? uiRows() : optTab === 'sound' ? soundRows()
          : `${switchRow('damageNumbers', '데미지 숫자 표시')}<div class="opt"><span>처음 설정 안내</span><button class="link" data-setup>다시 보기</button></div>`}`,
    // 처음 설정: what the page itself cannot do for the player (browser fullscreen, the browser's mouse gestures)
    setup: () => `<div class="panel-head"><h2>처음 설정</h2><button class="x" data-close title="닫기 (Esc)">✕</button></div>
        <ol class="setup">
          <li><b>전체화면 (F11)</b><p>F11을 누르면 브라우저가 전체화면이 되어 더 넓게 플레이할 수 있습니다. 다시 누르면 돌아옵니다.</p></li>
          <li><b>마우스 제스처 끄기</b><p>이 게임은 우클릭으로 기술을 씁니다. 웨일 같은 브라우저나 확장 프로그램의 마우스 제스처가 켜져 있으면 우클릭을 누른 채 움직일 때 제스처가 먼저 반응합니다.</p>
            <p>브라우저(또는 확장 프로그램) 설정의 마우스 제스처에서 이 사이트를 예외로 추가하거나 제스처를 꺼 주세요. 웹페이지가 대신 꺼 줄 수는 없습니다.</p></li>
        </ol>
        <div class="setup-foot"><button class="tb primary small" data-close>확인</button></div>`,
    // the title dex merges every slot: met or caught in any save counts; caught ones carry a 몬스터볼 mark (no counts)
    dex: () => {
      const seen = {}, caught = {};
      for (let n = 1; n <= SLOTS; n++) { const s = loadSave(n); Object.assign(seen, s?.seen); Object.assign(caught, s?.caught); }
      const list = Object.entries(data.species).filter(([, s]) => !s.playable).sort((a, b) => a[1].id - b[1].id);
      const nSeen = list.filter(([k]) => seen[k] || caught[k]).length, nCaught = list.filter(([k]) => caught[k]).length;
      return `<div class="panel-head"><h2>도감</h2><span class="dim">모든 세이브 합산 · 발견 <b>${nSeen}</b> · 포획 <b>${nCaught}</b> / ${list.length}</span><button class="x" data-close title="닫기 (Esc)">✕</button></div>
        <div class="dex">${list.map(([k, s]) => `<div class="${caught[k] ? 'caught' : seen[k] ? 'seen' : ''}">${caught[k] || seen[k] ? `<img src="${sprite(k)}" alt="">` : '<span class="unknown">?</span>'}<small>${String(s.id).padStart(4, '0')}</small> ${caught[k] || seen[k] ? esc(s.name) : '???'}${caught[k] ? ICON.ball : ''}</div>`).join('')}</div>`;
    },
  };

  let shown = 'main';
  const render = () => {
    el.classList.toggle('compact', view !== 'main'); // logo shrinks to the top-left once you press 플레이
    body.classList.toggle('after-logo', shown === 'main' && view !== 'main'); // the save panel waits for the logo to move
    body.innerHTML = views[view]();
    shown = view;
  };
  const openModal = name => { if (modal.classList.contains('hidden')) optStart = optTab; modal.dataset.name = name; modal.innerHTML = `<div class="title-panel tp-${name}${name === 'options' && optTab === 'keys' ? ' wide' : ''}">${modals[name]()}</div>`; modal.classList.remove('hidden'); };
  const closeModal = () => { if (modal.dataset.name === 'setup' && !options.setupSeen) setOption('setupSeen', true); modal.classList.add('hidden'); };

  // signed in: the slots sync, then the menu opens
  const signedIn = async u => {
    note = '세이브 동기화 중…'; render();
    try { await Cloud.within(Cloud.sync(SLOTS, saveKey, store), 10000); note = ''; } catch (e) { console.warn(e); note = '세이브를 동기화하지 못했습니다 · 이 기기에 있는 세이브로 이어집니다'; }
    account = u; view = 'main'; render();
  };
  const busy = async (msg, work) => {
    working = true; note = msg; render();
    try { await work(); } catch (e) { console.warn(e); note = e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request' ? '' : `${msg.replace(' 중…', '')}에 실패했습니다 · 잠시 후 다시 시도해 주세요`; }
    working = false; render();
  };

  el.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-modal],[data-close],[data-play],[data-new],[data-del],[data-starter],[data-toggle],[data-login],[data-logout],[data-otab],[data-setup]');
    if (!t) { if (e.target === modal) closeModal(); return; }
    const d = t.dataset;
    if (d.login !== undefined) busy('Google 계정 연결 중…', async () => { const u = await Cloud.signIn(); if (u) await signedIn(u); });
    // before forgetting this account's local saves, anything newer here goes up; offline, stay signed in
    if (d.logout !== undefined) busy('로그아웃 중…', async () => {
      await Cloud.within(Cloud.sync(SLOTS, saveKey, store), 10000);
      await Cloud.signOut(); Cloud.forget(SLOTS, saveKey, store);
      account = await Cloud.user(); note = ''; view = 'main'; render(); // a fresh guest account
    });
    if (d.del !== undefined) {
      e.stopPropagation();
      // confirm() is silently blocked in some embedded browsers, so the button itself asks twice
      if (t.dataset.armed) { store.del(saveKey(+d.del)); Cloud.remove(+d.del).catch(console.warn); render(); return; }
      t.dataset.armed = '1';
      t.textContent = '한 번 더 누르면 삭제'; t.classList.add('armed');
      setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = '삭제'; t.classList.remove('armed'); } }, 3000);
      return;
    }
    if (d.go && !(working && d.go === 'slots')) { view = d.go; render(); } // (the saves are still being fetched)
    if (d.modal) openModal(d.modal);
    if (d.close !== undefined) closeModal();
    if (d.play) enter(+d.play);
    if (d.new) { pendingSlot = +d.new; view = 'starter'; render(); }
    if (d.starter) { // the old cloud copy goes too, or the next sync would bring it back
      store.del(saveKey(pendingSlot));
      const slot = pendingSlot;
      Cloud.within(Cloud.remove(slot), 5000).catch(console.warn).then(() => enter(slot, d.starter));
    }
    if (d.otab) { optTab = d.otab; openModal('options'); }
    if (d.setup !== undefined) openModal('setup');
    if (d.toggle) { options[d.toggle] = !options[d.toggle]; saveOptions(); openModal('options'); }
  });
  addEventListener('keydown', e => {
    if (e.code === 'Tab' && optionsUp()) { e.preventDefault(); return stepOptTab(e.shiftKey ? -1 : 1); } // (Shift+Tab back)
    if (e.code !== 'Escape') return;
    if (!modal.classList.contains('hidden')) closeModal();
    else if (view === 'starter') { view = 'slots'; render(); }
    else if (view !== 'main') { view = 'main'; render(); }
  });
  // 옵션's inner tabs: Tab / Shift+Tab, or the wheel (one tab a beat: a turn sends several events)
  const optionsUp = () => !modal.classList.contains('hidden') && modal.dataset.name === 'options';
  // Tab goes once round from the tab the window opened on, then closes it; Shift+Tab and the wheel just go round (close: false)
  const stepOptTab = (dir, close = true) => {
    const i = OPT_TABS.findIndex(([k]) => k === optTab), next = OPT_TABS[(i + dir + OPT_TABS.length) % OPT_TABS.length][0];
    if (close && dir > 0 && next === optStart) return closeModal();
    optTab = next;
    openModal('options');
  };
  let wheelAt = 0;
  modal.addEventListener('wheel', e => {
    if (!optionsUp() || !e.deltaY) return;
    e.preventDefault();
    if (performance.now() - wheelAt < 250) return;
    wheelAt = performance.now(); stepOptTab(Math.sign(e.deltaY), false);
  }, { passive: false });
  // cards (.tilt) lean toward the pointer while it is over them
  el.addEventListener('pointermove', e => {
    for (const c of el.querySelectorAll('.tilt')) {
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, on = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      c.style.setProperty('--ry', on ? `${((x - 0.5) * 14).toFixed(2)}deg` : '0deg');
      c.style.setProperty('--rx', on ? `${((0.5 - y) * 10).toFixed(2)}deg` : '0deg');
      c.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`); c.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    }
  });
  render();
  if (!options.setupSeen) openModal('setup'); // the first visit
  if (Cloud.enabled) busy('접속 중…', async () => { const u = await Cloud.user(); if (u) await signedIn(u); else { note = ''; render(); } });
}
