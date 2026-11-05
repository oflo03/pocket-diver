# piplup: rendered from its Scarlet/Violet model (models/piplup, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 버티며 반격하는 강철 기사: 팽태자·엠페르트는 회전하며 부리로 뚫는다.
#   blender -b models/piplup/piplup.blend -P scripts/render3d.py -- piplup [anim ...]
#   python scripts/pixel3d.py piplup
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'piplup', 'height': 0.387, 'sprite_h': 35, 'arm': ('{s}_arm',), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine'], 'neck': ['neck'], 'head': 'head', 'tail': [], 'jaw': 'lower_jaw', 'hide': [], 'lean0': 5, 'springs': {'feeler_a_\\d+': (3.0, 0.3), '(left|right)_feeler_[ab](_\\d+)?': (3.0, 0.35)}, 'eyes': [(10, 11, 13, 15)]}
globals().update(spec(CONFIG))
