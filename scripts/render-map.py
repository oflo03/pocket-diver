# Renders the current map layout (main sea + tutorial farm) to docs/map-overview.png.
# Run: node scripts/dump-map.mjs <json> && python scripts/render-map.py <json>   (needs Pillow; Korean labels use Malgun Gothic)
import json, sys, pathlib
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
data = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
game = json.loads((ROOT / 'src' / 'data.json').read_text(encoding='utf-8'))
main, tut, zones, mpt = data['main'], data['tutorial'], data['zones'], data['mpt']

S = 3  # px per tile
LEFT, RIGHT, TOP = 80, 330, 60
font = lambda n: ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', n)
bold = lambda n: ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', n)
W = LEFT + main['cols'] * S + RIGHT
H = TOP + main['rows'] * S + 40
img = Image.new('RGB', (W, H), (8, 12, 20))
d = ImageDraw.Draw(img)

WATER = {1: (30, 96, 146), 2: (18, 52, 86), 3: (16, 26, 64)}
ROCK = {1: (128, 116, 96), 2: (70, 86, 92), 3: (76, 64, 104)}
zone_of = lambda y: next(z for z in zones if y <= z['y1']) if y <= zones[-1]['y1'] else zones[-1]

def paint(grid, ox, oy, s, pick):
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            d.rectangle([ox + x * s, oy + y * s, ox + x * s + s - 1, oy + y * s + s - 1], fill=pick(ch, y))

def main_color(ch, y):
    z = zone_of(y)['id']
    return {'.': WATER[z], '#': ROCK[z], 'B': (210, 50, 60), 'E': (240, 200, 40)}[ch]

paint(main['grid'], LEFT, TOP, S, main_color)
X = lambda tx: LEFT + tx * S
Y = lambda ty: TOP + ty * S

def label(x, y, text, color, f=None, anchor='lm'):
    f = f or font(14)
    d.text((x + 1, y + 1), text, fill=(0, 0, 0), font=f, anchor=anchor)
    d.text((x, y), text, fill=color, font=f, anchor=anchor)

# depth ruler
for m in range(0, main['rows'] * mpt + 1, 250):
    y = Y(m / mpt)
    d.line([LEFT - 8, y, LEFT, y], fill=(150, 160, 170))
    label(LEFT - 12, y, f'{m}m', (170, 180, 190), font(12), 'rm')

d.text((LEFT, 18), '로켓단 해양수산부 맵 구조 (본 바다)', fill=(232, 246, 255), font=bold(22))

for z in zones:
    zid = z['id']
    # zone header and area bands
    y0 = Y(z['y0'])
    d.line([LEFT, y0, X(main['cols']), y0], fill=(255, 255, 255), width=2)
    areas = game['zones'][str(zid)]
    label(X(main['cols']) + 12, y0 + 12, f"{z['name']}  {areas[0]['depth'][0]}~{areas[-1]['depth'][1]}m", tuple(int(z['color'][i:i + 2], 16) for i in (1, 3, 5)), bold(16))
    for i, a in enumerate(game['zones'][str(zid)]):
        ay = Y(a['depth'][0] / mpt)
        if i:
            for x in range(LEFT, X(main['cols']), 10):
                d.line([x, ay, x + 5, ay], fill=(200, 200, 200))
        label(X(main['cols']) + 12, Y((a['depth'][0] + a['depth'][1]) / 2 / mpt), f"{['얕은', '중간', '깊은'][i]} 영역  Lv.{a['level'][0]}~{a['level'][1]}  ({len(a['species'])}종)", (190, 200, 210), font(13))
    zc = tuple(int(z['color'][i:i + 2], 16) for i in (1, 3, 5))
    # treasures
    for i, t in enumerate(z['treasures']):
        cx, cy = X(t['x'] + 0.5), Y(t['y'] + 0.5)
        d.polygon([(cx, cy - 9), (cx + 6, cy), (cx, cy + 9), (cx - 6, cy)], fill=zc, outline=(255, 255, 255))
        label(cx + 10, cy, f"{z['piece']} {i + 1}", zc, font(13))
    # boss room
    b = z['bossRoom']
    (d.ellipse if z.get('shape') == 'round' else d.rounded_rectangle if z.get('cave') else d.rectangle)([X(b['x0']), Y(b['y0']), X(b['x1'] + 1), Y(b['y1'] + 1)], outline=(255, 90, 100), width=2, **({'radius': 21} if z.get('cave') else {}))
    names = ' + '.join(f"{game['species'][k]['name']}{'' if n == 1 else ' ×' + str(n)}" for k, n in z['bosses'])
    label(X(b['x0']) + 4, Y(b['y0']) + 14, f"보스방: {names} (Lv.{z['bossLevel']})", (255, 150, 160), bold(13))
    dd = z['bossDoor']
    label(X(dd['x1'] + 2), Y(b['y0'] - 2), f"보스 문 ({z['piece']} {len(z['treasures'])}개)", (255, 120, 130), font(12))
    if zid < len(zones):
        nxt = zones[zid]
        label(X(nxt['entry']['x']) + 8, Y(z['bossRoom']['y1'] + 2), f"구역 {zid + 1} 입구 (보스방 바닥)", (250, 210, 60), bold(13))
    if z.get('portal'):
        p = z['portal']
        cx, cy = X(p['x'] + 0.5), Y(p['y'] + 0.5)
        d.ellipse([cx - 7, cy - 11, cx + 7, cy + 11], outline=(200, 144, 255), width=3)
        label(cx - 12, cy, '포탈 (기지에서 이동)', (210, 170, 255), bold(13), 'rm')

# upgrade NPCs
NPC_KIND = {'ev': '노력치 강화', 'iv': '개체값 강화', 'luck': '운 강화 (포획률·급소)'}
for n in data.get('npcs', []):
    cx, cy = X(n['x'] + 0.5), Y(n['y'] + 0.5)
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(255, 220, 90), outline=(0, 0, 0))
    label(cx - 10, cy, f"{n['name']} ({NPC_KIND[n['kind']]})", (255, 225, 120), bold(13), 'rm')

# base on the surface
bx = LEFT + main['base']['x'] / data['T'] * S
d.rectangle([bx - 10, TOP - 10, bx + 10, TOP], fill=(210, 40, 50))
label(bx + 14, TOP - 6, '로켓단 해상기지', (255, 120, 130), bold(14))

# legend
lx, ly = X(main['cols']) + 12, Y(1550 / mpt)  # free gap between zone 2's area labels
items = [((30, 96, 146), '물'), ((128, 116, 96), '바위'), ((210, 50, 60), '보스 문 (조각을 다 모으면 열림)'),
         ((240, 200, 40), '다음 구역 문 (보스를 바치면 열림)')]
label(lx, ly - 20, '범례', (232, 246, 255), bold(15))
for i, (c, t) in enumerate(items):
    d.rectangle([lx, ly + i * 22, lx + 14, ly + i * 22 + 14], fill=c)
    label(lx + 22, ly + i * 22 + 7, t, (210, 220, 230), font(13))

# tutorial farm inset
ts = 5
tx0, ty0 = X(main['cols']) + 12, ly + 130
label(tx0, ty0 - 16, '튜토리얼 맵 (별도, 양식장)', (232, 246, 255), bold(15))
paint(tut['grid'], tx0, ty0, ts, lambda ch, y: {'.': (30, 96, 146), '#': (128, 116, 96)}[ch])
tbx = tx0 + tut['base']['x'] / data['T'] * ts
d.rectangle([tbx - 6, ty0 - 6, tbx + 6, ty0], fill=(210, 40, 50))
label(tx0, ty0 + tut['rows'] * ts + 12, '잉어킹 3마리를 팔면 대리 승진, 본 바다로 이동', (190, 200, 210), font(12))

out = ROOT / 'docs' / 'map-overview.png'
out.parent.mkdir(exist_ok=True)
img.save(out)
print(out, img.size)
