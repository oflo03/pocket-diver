// 조작법, drawn: a keyboard (only the keys the game uses, roughly where they sit on a real one) and a mouse, each part
// with what it does, coloured by kind (legend on top). Shown in the game menu's 설정 and on the title's 옵션.
const U = 46, GAP = 20; // a key's width (and height), the room between keys (their captions need it)
const KINDS = [['move', '이동'], ['act', '행동'], ['view', '지도'], ['skill', '기술'], ['menu', '창']];
// [x, y, width in keys, label, caption ('|' breaks it), kind]
const KEYS = [
  [20, 46, 1, 'Esc', '설정', 'menu'],
  [20, 136, 1.5, 'Tab', '포켓몬|다음 탭', 'menu'], [112, 136, 1, 'Q', '그물', 'act'], [178, 136, 1, 'W', '위|점프', 'move'],
  [244, 136, 1, 'E', '메뉴|대화', 'act'], [310, 136, 1, 'R', '자뭉열매', 'act'],
  [134, 226, 1, 'A', '왼쪽', 'move'], [200, 226, 1, 'S', '아래', 'move'], [266, 226, 1, 'D', '오른쪽', 'move'],
  [332, 226, 1, 'F', '지도|누르는 동안', 'view'],
  [20, 316, 2.2, 'Shift', '달리기|+클릭: 기술 3·4', 'skill'], [424, 316, 1, 'B', '기지 귀환', 'act'], [556, 316, 1, 'M', '지도|켜고 끄기', 'view'],
  [200, 406, 4.6, 'Space', '점프 · 물 밖으로 뛰기', 'move'],
];
const key = ([x, y, w, k, cap, kind]) => {
  const W = w * U + (w - 1) * GAP, cx = x + W / 2;
  return `<g class="kc ${kind}"><rect class="base" x="${x}" y="${y + 4}" width="${W}" height="${U}" rx="9"/><rect class="top" x="${x}" y="${y}" width="${W}" height="${U}" rx="9"/>
    <text x="${cx}" y="${y + 30}" class="k">${k}</text>${cap.split('|').map((c, i) => `<text x="${cx}" y="${y + U + 22 + i * 15}" class="cap${i ? ' dim' : ''}">${c}</text>`).join('')}</g>`;
};
// the mouse, its parts lit by what they do, labels to its right
const MOUSE = `<g class="mouse" transform="translate(110 40)">
  <path class="body" d="M600 150Q600 100 650 100Q700 100 700 150V300Q700 360 650 360Q600 360 600 300Z"/>
  <path class="lbtn" d="M650 100Q600 100 600 150V196H650Z"/><path class="rbtn" d="M650 100Q700 100 700 150V196H650Z"/>
  <rect class="wheel" x="642" y="124" width="16" height="40" rx="8"/>
  <path class="line" d="M622 150V70H730M678 172H730M658 144H700V236H730"/>
  <circle class="dot" cx="622" cy="150" r="3"/><circle class="dot" cx="678" cy="172" r="3"/><circle class="dot" cx="658" cy="144" r="3"/>
  <text x="738" y="68" class="t">좌클릭 · 기술 1</text><text x="738" y="86" class="t dim">+Shift: 기술 3</text>
  <text x="738" y="170" class="t">우클릭 · 기술 2</text><text x="738" y="188" class="t dim">+Shift: 기술 4</text>
  <text x="738" y="234" class="t">휠 굴리기 · 세트 바꾸기</text><text x="738" y="252" class="t dim">휠 클릭: 그물 (Q)</text>
  <text x="650" y="392" class="t mid">커서 쪽으로 조준</text></g>`;
export function controlsArt() {
  const legend = KINDS.map(([k, label], i) => `<g class="lg ${k}" transform="translate(${150 + i * 80} 24)"><rect width="14" height="14" rx="4" y="-11"/><text x="20" y="0">${label}</text></g>`).join('');
  return `<svg class="controls-art" viewBox="0 0 1000 486" role="img" aria-label="조작법">${legend}${KEYS.map(key).join('')}${MOUSE}</svg>`;
}
export const controlsNotes = () => `<ul class="notes"><li><b>기지</b>에서 E: 판매 · 게시판 · 강화 · 보스 상납</li><li>NPC 곁에 가면 말을 건다 (다시 말 걸기: E)</li>
  <li>대화: Space · Enter · 클릭으로 넘기기, ↑↓ · 숫자로 고르기, Esc로 끝내기</li><li>메뉴: Tab으로 다음 탭, 안쪽 페이지는 휠 (포켓몬 탭은 Space도)</li></ul>`;
