# totodile: rendered from its Scarlet/Violet model (models/totodile, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 턱으로 물고 늘어지는 난투형: 돌진은 입을 크게 벌리고 문다.
#   blender -b models/totodile/totodile.blend -P scripts/render3d.py -- totodile [anim ...]
#   python scripts/pixel3d.py totodile
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'totodile', 'height': 0.579, 'sprite_h': 36, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'jaw', 'hide': [], 'lean0': 8, 'dash': 'bite', 'springs': {'tail_\\d+': (2.2, 0.3)}, 'eyes': [(13, 4, 17, 11)]}
globals().update(spec(CONFIG))
