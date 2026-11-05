# croconaw: rendered from its Scarlet/Violet model (models/croconaw, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 턱으로 물고 늘어지는 난투형: 돌진은 입을 크게 벌리고 문다.
#   blender -b models/croconaw/croconaw.blend -P scripts/render3d.py -- croconaw [anim ...]
#   python scripts/pixel3d.py croconaw
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'croconaw', 'height': 1.066, 'sprite_h': 58, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine'], 'neck': [], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'jaw', 'hide': ['eyelid'], 'lean0': -4, 'dash': 'bite', 'springs': {'tail_\\d+': (2.0, 0.3), 'tongue_\\d+': (3.0, 0.3)}, 'eyes': [(15, 15, 19, 18), (20, 19, 21, 20)]}
globals().update(spec(CONFIG))
