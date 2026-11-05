# wartortle: rendered from its Scarlet/Violet model (models/wartortle, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 강한 대포와 빔: 거북왕은 등껍질 포대로 쏜다.
#   blender -b models/wartortle/wartortle.blend -P scripts/render3d.py -- wartortle [anim ...]
#   python scripts/pixel3d.py wartortle
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'wartortle', 'height': 1.338, 'sprite_h': 57, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist'], 'neck': [], 'head': 'head', 'tail': ['tail_01', 'tail_02', 'tail_03', 'tail_04'], 'jaw': 'jaw', 'hide': [], 'lean0': 21, 'springs': {'(left|right)_ear_\\d+': (3.0, 0.3), 'tail_\\d+': (2.0, 0.35)}, 'eyes': [(21, 20, 23, 24), (10, 20, 12, 24)]}
globals().update(spec(CONFIG))
