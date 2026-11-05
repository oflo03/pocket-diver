from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/player/manual-dewott-v1'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = Path('C:/Users/oFlo/.codex/generated_images/01a0f684-bcab-7fd2-9071-81f8952427c6/exec-5edfc431-64fe-4194-aa16-618bd9a2233a.png')
SIZE = (64, 64)
INK = '#172133'
BLUE = '#70c5d9'
LIGHT = '#95d9e5'
SHADE = '#4394b1'
DEEP = '#285478'
FUR = '#335f9c'
FURLIGHT = '#4277ae'
FURDARK = '#284770'
PAW = '#454550'
PAWLIGHT = '#62616b'

def layer():
    return Image.new('RGBA', SIZE)

def poly(im, points, color, outline=INK):
    ImageDraw.Draw(im).polygon(points, fill=color, outline=outline)

def line(im, points, fill, width=1):
    ImageDraw.Draw(im).line(points, fill=fill, width=width)

def crisp(im, colors=24):
    a = im.getchannel('A').point(lambda v: 255 if v >= 130 else 0)
    rgb = im.convert('RGB').quantize(colors=colors, dither=Image.Dither.NONE).convert('RGBA')
    rgb.putalpha(a)
    return rgb

# Preserve the approved head by extracting the actual original pixels.
source = Image.open(SOURCE).convert('RGBA')
mask = Image.new('L', source.size)
ImageDraw.Draw(mask).polygon([(395,0),(975,0),(975,590),(883,560),
    (850,583),(782,608),(688,607),(609,583),(558,553),(395,590)], fill=255)
mask = Image.composite(source.getchannel('A'), Image.new('L', source.size), mask)
source.putalpha(mask)
head = crisp(source.crop((395,10,975,613)).resize((30,31), Image.Resampling.LANCZOS), 24)
# Restore a consistent one-pixel silhouette after reducing the approved head.
ha = head.getchannel('A')
head_outline = Image.new('RGBA', head.size, INK)
head_outline.putalpha(ha.filter(ImageFilter.MaxFilter(3)))
head_outline.alpha_composite(head)
head = head_outline
# Pixel cleanup follows the original eye/nose/whisker positions, not a new face.
hd = ImageDraw.Draw(head)
hd.polygon([(14,20),(15,19),(16,20),(17,23),(16,25),(14,24)], fill=INK)
hd.rectangle((15,20,15,21), fill='#ffffff')
hd.polygon([(23,20),(24,19),(24,23),(22,24),(22,22)], fill=INK)
hd.point((23,21), fill='#ffffff')
hd.polygon([(19,24),(21,24),(22,25),(21,26),(19,26),(18,25)], fill='#303043')
hd.rectangle((19,24,20,25), fill='#e99596')
hd.point((21,25), fill='#bd666c')
hd.line([(18,28),(19,27),(20,27),(21,28)], fill=INK)

# Reuse the authentic segmented shell silhouette from the provided original art.
ref = Image.open(ROOT / 'art-references/dewott-original-art.png').convert('RGBA')
shellmask = Image.new('L', ref.size)
ImageDraw.Draw(shellmask).polygon([(151,492),(183,494),(197,513),(211,511),
    (218,524),(215,553),(204,579),(187,606),(169,621),(141,621),
    (116,605),(105,582),(106,550),(121,518)], fill=255)
ref.putalpha(shellmask)
shell = crisp(ref.crop((103,490,221,624)).resize((8,10), Image.Resampling.LANCZOS), 7)

def put_shell(im, xy, angle=0):
    piece = shell.rotate(angle, resample=Image.Resampling.NEAREST, expand=True)
    padded = Image.new('RGBA', (piece.width+2, piece.height+2))
    silhouette = Image.new('L', padded.size)
    silhouette.paste(piece.getchannel('A'), (1,1))
    outline = Image.new('RGBA', padded.size, INK)
    outline.putalpha(silhouette.filter(ImageFilter.MaxFilter(3)))
    padded.alpha_composite(outline)
    padded.alpha_composite(piece, (1,1))
    im.alpha_composite(padded, xy)

layers = []
rear = layer()
# The anatomical left arm is behind the torso. Its upper silhouette is exposed.
poly(rear, [(42,33),(36,34),(30,29),(26,26),(27,22),(31,22),(34,27),(41,28)], SHADE)
line(rear, [(30,24),(34,29),(39,31)], BLUE, 2)
put_shell(rear, (20,13), -25)
poly(rear, [(27,23),(25,22),(23,23),(23,26),(26,28),(30,26),(30,24)], PAW)
line(rear, [(24,24),(27,25)], PAWLIGHT)
line(rear, [(25,26),(27,27)], INK)
layers.append(('01-left-arm-behind', rear))

back = layer()
# Tail and two hind legs trail to the left, with no ground contact.
poly(back, [(24,32),(16,27),(8,25),(3,26),(2,29),(7,33),(16,36),(24,37)], PAW)
poly(back, [(4,27),(9,27),(18,31),(19,33),(11,31),(6,30)], PAWLIGHT, None)
poly(back, [(23,39),(18,39),(13,43),(8,43),(6,46),(8,49),(14,49),(21,45),(26,43)], SHADE)
poly(back, [(8,43),(6,44),(4,45),(5,48),(9,49),(13,47),(13,44)], PAW)
line(back, [(6,46),(9,46)], PAWLIGHT)
poly(back, [(26,43),(21,43),(16,47),(10,49),(9,52),(13,54),(19,52),(25,48),(29,46)], BLUE)
poly(back, [(12,48),(9,49),(7,51),(8,54),(12,55),(16,53),(17,50)], PAW)
line(back, [(9,51),(12,52)], PAWLIGHT)
layers.append(('02-tail-hindlegs', back))

body = layer()
poly(body, [(25,31),(34,28),(41,28),(48,31),(48,36),(43,40),(35,45),(26,45),(22,39)], BLUE)
poly(body, [(31,31),(38,29),(43,30),(40,33),(33,34),(28,35)], LIGHT, None)
poly(body, [(46,35),(42,39),(34,43),(28,44),(25,40),(34,39),(41,36)], SHADE, None)
# Empty waist fur: no shells remain attached on either hip.
poly(body, [(24,30),(28,32),(29,36),(33,39),(29,40),(31,44),(26,44),
    (26,48),(23,46),(19,49),(19,45),(14,46),(17,42),(12,41),(16,38),(16,33),(20,35)], FUR)
poly(body, [(23,33),(26,35),(27,39),(23,42),(18,43),(20,38),(19,35)], FURLIGHT, None)
poly(body, [(27,40),(29,43),(25,43),(25,46),(22,44),(19,47),(20,43)], FURDARK, None)
layers.append(('03-torso-empty-hips', body))

hl = layer()
hl.alpha_composite(head, (32,3))
layers.append(('04-approved-head', hl))

front = layer()
# Anatomical right shoulder, arm and fist visibly overlap the front of the body.
poly(front, [(42,33),(45,34),(44,39),(47,41),(51,42),(52,45),(49,48),
    (44,47),(39,43),(37,39),(38,35)], BLUE)
poly(front, [(39,35),(42,35),(41,39),(44,43),(47,44),(46,46),(42,44),(39,40)], LIGHT, None)
poly(front, [(43,38),(45,41),(50,43),(50,46),(46,46),(42,42)], SHADE, None)
put_shell(front, (51,42), 25)
poly(front, [(48,43),(51,42),(53,43),(54,45),(53,49),(50,50),(47,48),(47,45)], PAW)
line(front, [(49,44),(51,44),(52,45)], PAWLIGHT)
line(front, [(51,46),(53,46)], INK)
line(front, [(50,48),(52,48)], INK)
layers.append(('05-right-arm-in-front', front))

merged = layer()
for name, im in layers:
    im.save(OUT / f'{name}.png')
    merged.alpha_composite(im)
merged.save(OUT / '0502-swim-dual-shell-64.png')
small = merged.resize((48,48), Image.Resampling.NEAREST)
small.save(OUT / '0502-swim-dual-shell-48.png')

def checker(size):
    im = Image.new('RGB', size, '#182c3a')
    d = ImageDraw.Draw(im)
    for y in range(0,size[1],16):
        for x in range(0,size[0],16):
            if (x//16+y//16)%2:
                d.rectangle((x,y,x+15,y+15), fill='#1d3342')
    return im

preview = checker((1024,600))
preview.paste(merged.resize((512,512), Image.Resampling.NEAREST),(0,24), merged.resize((512,512), Image.Resampling.NEAREST))
preview.paste(small.resize((384,384),Image.Resampling.NEAREST),(588,88),small.resize((384,384),Image.Resampling.NEAREST))
d = ImageDraw.Draw(preview)
d.text((24,564),'64 x 64 / 8x',fill='#d4e8ed')
d.text((600,564),'48 x 48 / 8x',fill='#d4e8ed')
preview.save(OUT / 'comparison.png')
json.dump({'status':'manual static pose draft; not animation', 'species':'0502',
    'frames':{'64':[64,64], '48':[48,48]}, 'layers_back_to_front':[n for n,_ in layers],
    'head':'extracted from user-approved generated image; reduced to sprite resolution',
    'shells':'masked from original art reference and pixel reduced',
    'method':'local Pillow compositing and hand-specified pixel shapes; no generation service'},
    open(OUT/'manifest.json','w',encoding='utf-8'),ensure_ascii=False,indent=2)
print(OUT/'comparison.png')
