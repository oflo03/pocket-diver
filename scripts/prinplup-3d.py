# prinplup: rendered from its Scarlet/Violet model (models/prinplup, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 버티며 반격하는 강철 기사: 팽태자·엠페르트는 회전하며 부리로 뚫는다.
#   blender -b models/prinplup/prinplup.blend -P scripts/render3d.py -- prinplup [anim ...]
#   python scripts/pixel3d.py prinplup
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'prinplup', 'height': 0.804, 'sprite_h': 57, 'arm': ('{s}_arm',), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'lower_jaw', 'hide': [], 'lean0': 0, 'dash': 'drill', 'springs': {'tail_\\d+': (3.0, 0.35)}, 'eyes': [(23, 13, 26, 16), (16, 13, 19, 16)]}
globals().update(spec(CONFIG))
