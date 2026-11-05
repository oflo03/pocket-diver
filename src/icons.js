// Move icons: a little 16x16 picture of what each move does, drawn once with canvas shapes in the move's colours,
// then turned into pixel art (alpha cut hard, a dark outline round the shapes) and kept as a data URL for <img>
// (shown blown up, unsmoothed, in the HUD and the equip screen). Moves without a drawing get a plain type-coloured orb.
const SIZE = 16, OUTLINE = [11, 22, 34];
const WHITE = '#ffffff', SHELL = '#ecd28c', SHELL_DARK = '#a8853e';
const cache = {};

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const lighter = (c, k = 0.5) => '#' + hex(c).map(v => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')).join('');
const darker = (c, k = 0.4) => '#' + hex(c).map(v => Math.round(v * (1 - k)).toString(16).padStart(2, '0')).join('');

function line(g, x0, y0, x1, y1, w, col) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
function dot(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
function ring(g, x, y, r, w, col) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
function poly(g, pts, col) { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); }
function arc(g, x, y, r, a0, a1, w, col) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r, a0, a1); g.stroke(); }
const deg = d => (d * Math.PI) / 180;

// each draws on a 16x16 canvas; c = the move's type colour, l = a lighter one
const DRAW = {
  tackle(g, c, l) { // 몸통박치기: speed lines into an impact star
    for (const y of [5, 8, 11]) line(g, 1, y, 5, y, 1.3, l);
    const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 2.4 : 5.4; pts.push([10.5 + Math.cos(a) * r, 8 + Math.sin(a) * r]); }
    poly(g, pts, c); dot(g, 10.5, 8, 1.6, WHITE);
  },
  'water-gun'(g, c, l) { // 물대포: a jet shooting up and across, spray off its end
    line(g, 2, 13.5, 12, 4.5, 3.4, c); line(g, 2.5, 13, 12, 4.5, 1.2, WHITE); dot(g, 14.2, 2.4, 1.3, l); dot(g, 13.8, 6.4, 1.1, l); dot(g, 10.5, 1.8, 0.9, l);
  },
  'razor-shell'(g, c, l) { // 셸블레이드: the scalchop with a water blade out of it
    line(g, 8, 9, 15, 1.5, 2.6, l); line(g, 8, 9, 15, 1.5, 1, WHITE);
    g.fillStyle = SHELL; g.beginPath(); g.moveTo(6, 13); g.arc(6, 13, 5.5, Math.PI, Math.PI * 2); g.closePath(); g.fill();
    for (const a of [200, 235, 270, 305, 340]) line(g, 6, 13, 6 + Math.cos(deg(a)) * 5, 13 + Math.sin(deg(a)) * 5, 0.8, SHELL_DARK);
  },
  'fury-cutter'(g, c) { // 연속자르기: three cuts one after another
    for (const d of [0, 3.5, 7]) { line(g, 1.5 + d, 11 + d * 0.3, 7.5 + d, 2 + d * 0.3, 2, c); line(g, 2 + d, 10.5 + d * 0.3, 7.2 + d, 2.6 + d * 0.3, 0.7, WHITE); }
  },
  'water-pulse'(g, c, l) { // 물의파동: rings rippling out
    ring(g, 8, 8, 6.3, 1.6, c); ring(g, 8, 8, 3.6, 1.4, l); dot(g, 8, 8, 1.3, WHITE);
  },
  'aerial-ace'(g, c) { // 제비반환: a swallow-quick cross cut
    line(g, 2.5, 3, 13.5, 13, 2.2, c); line(g, 13.5, 3, 2.5, 13, 2.2, c); line(g, 3, 3.5, 13, 12.5, 0.8, WHITE); line(g, 13, 3.5, 3, 12.5, 0.8, WHITE);
    poly(g, [[8, 1], [9.4, 4], [8, 3.2], [6.6, 4]], WHITE);
  },
  'aqua-jet'(g, c, l) { // 아쿠아제트: a drop of water shooting ahead, trailing lines
    poly(g, [[8, 3.2], [15.2, 8], [8, 12.8]], c); dot(g, 8, 8, 4.8, c); dot(g, 6.8, 6.4, 1.5, WHITE);
    line(g, 0.5, 5, 3, 5, 1, l); line(g, 0, 8, 2.5, 8, 1, l); line(g, 0.5, 11, 3, 11, 1, l);
  },
  slash(g, c) { // 베어가르기: one wide sweeping cut
    arc(g, 1, 15, 13, deg(-88), deg(-4), 3, c); arc(g, 1, 15, 13, deg(-80), deg(-12), 1, WHITE);
  },
  'night-slash'(g) { // 깜짝베기: a dark crescent cut out of nowhere
    const p = '#a77fd8';
    dot(g, 8, 8, 6.5, p); g.globalCompositeOperation = 'destination-out'; dot(g, 11, 5.5, 5.6, '#000'); g.globalCompositeOperation = 'source-over';
    line(g, 3, 12, 6, 13.5, 0.8, WHITE);
  },
  'aqua-tail'(g, c, l) { // 아쿠아테일: the tail swung round as a wave
    g.strokeStyle = c; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(2, 13); g.bezierCurveTo(1, 4, 14, 12, 14, 3); g.stroke();
    g.strokeStyle = WHITE; g.lineWidth = 1; g.beginPath(); g.moveTo(2.5, 12); g.bezierCurveTo(2, 5, 13.5, 11, 13.5, 3.5); g.stroke(); dot(g, 14.5, 2, 1, l);
  },
  'x-scissor'(g, c) { // 시저크로스: two blades crossing in an X
    line(g, 3, 3, 13, 13, 3.2, c); line(g, 13, 3, 3, 13, 3.2, c); line(g, 3.5, 3.5, 12.5, 12.5, 1, WHITE); line(g, 12.5, 3.5, 3.5, 12.5, 1, WHITE);
  },
  'drill-run'(g, c) { // 드릴라이너: a drill point turning
    const d = darker(c);
    poly(g, [[1.5, 3.5], [15.5, 8], [1.5, 12.5]], c); poly(g, [[1.5, 3.5], [15.5, 8], [1.5, 7.2]], lighter(c, 0.4));
    line(g, 5.5, 5, 5.5, 11, 1, d); line(g, 9.5, 6.3, 9.5, 9.7, 1, d);
  },
  'hydro-pump'(g, c, l) { // 하이드로펌프: a thick column of water blasting out
    g.fillStyle = c; g.fillRect(4, 5, 12, 6); g.fillStyle = WHITE; g.fillRect(4, 7, 12, 2); dot(g, 3.2, 8, 3.2, l); dot(g, 3.2, 8, 1.3, WHITE);
  },
  'air-slash'(g, c, l) { // 에어슬래시: blades of air flying out
    arc(g, 1, 8, 7, deg(-55), deg(55), 2.2, c); arc(g, -3, 8, 12, deg(-35), deg(35), 1.6, l); line(g, 7.2, 4.5, 7.8, 6, 0.7, WHITE);
  },
  surf(g, c, l) { // 파도타기: a wave curling over
    g.fillStyle = c; g.beginPath(); g.moveTo(0, 15.5); g.lineTo(0, 10); g.bezierCurveTo(3, 3, 10, 0.5, 14.5, 4.5); g.quadraticCurveTo(10.5, 4.5, 10, 8); g.quadraticCurveTo(9, 12, 7, 15.5); g.closePath(); g.fill();
    g.strokeStyle = WHITE; g.lineWidth = 1.2; g.beginPath(); g.moveTo(1.5, 9); g.bezierCurveTo(4, 4, 9.5, 2, 13.5, 4.5); g.stroke(); dot(g, 15, 6.5, 0.9, l);
  },
  megahorn(g, c) { // 메가혼: a great horn
    g.fillStyle = c; g.beginPath(); g.moveTo(2.5, 15.5); g.quadraticCurveTo(4, 6, 14.5, 1); g.quadraticCurveTo(9, 8, 8.5, 15.5); g.closePath(); g.fill();
    g.strokeStyle = lighter(c, 0.55); g.lineWidth = 1; g.beginPath(); g.moveTo(4.5, 14); g.quadraticCurveTo(6, 7, 13, 2.2); g.stroke();
  },
  'sacred-sword'(g) { // 성스러운칼: a shining sword
    line(g, 8, 1.5, 8, 10.5, 3, '#dfe8f4'); line(g, 8, 2, 8, 10, 1, WHITE); line(g, 4, 11, 12, 11, 2, '#ffd23c'); line(g, 8, 12, 8, 15, 2, '#9a6a34');
  },
  'hydro-cannon'(g, c, l) { // 하이드로캐논: a huge ball of water
    dot(g, 8, 8, 6.8, c); dot(g, 8.6, 8.6, 4.2, l); dot(g, 6, 5.8, 1.7, WHITE); arc(g, 8, 8, 6.8, deg(30), deg(120), 1, darker(c, 0.3));
  },
};
function orb(g, c, l) { dot(g, 8, 8, 5.5, c); dot(g, 8.5, 8.5, 3, l); dot(g, 6.5, 6.5, 1.3, WHITE); }

// alpha cut hard and a 1px dark outline round what is left, so the little drawing reads as pixel art
function pixelate(g) {
  const img = g.getImageData(0, 0, SIZE, SIZE), d = img.data, solid = i => d[i * 4 + 3] === 255;
  for (let i = 0; i < SIZE * SIZE; i++) d[i * 4 + 3] = d[i * 4 + 3] >= 110 ? 255 : 0;
  const edge = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const i = y * SIZE + x;
    if (!solid(i) && ((x > 0 && solid(i - 1)) || (x < SIZE - 1 && solid(i + 1)) || (y > 0 && solid(i - SIZE)) || (y < SIZE - 1 && solid(i + SIZE)))) edge.push(i);
  }
  for (const i of edge) { d.set(OUTLINE, i * 4); d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
}

// the icon's data URL for a move key, in the move's type colour
export function moveIcon(key, color = '#8aa6bd') {
  const id = key + color;
  if (cache[id]) return cache[id];
  const c = document.createElement('canvas'); c.width = c.height = SIZE;
  const g = c.getContext('2d');
  (DRAW[key] ?? orb)(g, color, lighter(color));
  pixelate(g);
  return (cache[id] = c.toDataURL());
}
export const hasIcon = key => key in DRAW;
