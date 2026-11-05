# sobble: rendered from its Scarlet/Violet model (models/sobble, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 원거리 저격 스파이: 인텔리레온은 손가락으로 겨눠 쏜다.
#   blender -b models/sobble/sobble.blend -P scripts/render3d.py -- sobble [anim ...]
#   python scripts/pixel3d.py sobble
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'sobble', 'height': 0.473, 'sprite_h': 46, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02', 'tail_03', 'tail_04', 'tail_05'], 'jaw': 'root_jaw', 'hide': ['tear_mesh'], 'lean0': -6, 'springs': {'feeler_[abc]_\\d+': (2.5, 0.3), '(left|right)_feeler_[ab](_\\d+)?': (2.5, 0.3), 'tail_\\d+': (2.0, 0.3)}, 'eyes': [(15, 19, 18, 25), (4, 20, 7, 25)]}
globals().update(spec(CONFIG))
