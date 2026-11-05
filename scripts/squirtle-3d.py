# squirtle: rendered from its Scarlet/Violet model (models/squirtle, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 강한 대포와 빔: 거북왕은 등껍질 포대로 쏜다.
#   blender -b models/squirtle/squirtle.blend -P scripts/render3d.py -- squirtle [anim ...]
#   python scripts/pixel3d.py squirtle
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'squirtle', 'height': 0.439, 'sprite_h': 39, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist'], 'neck': [], 'head': 'head', 'tail': ['tail_01', 'tail_02', 'tail_03'], 'jaw': 'jaw', 'hide': [], 'lean0': 28, 'springs': {'tail_\\d+': (2.2, 0.3)}, 'eyes': [(14, 7, 17, 11), (6, 7, 6, 10)]}
globals().update(spec(CONFIG))
