# froakie: rendered from its Scarlet/Violet model (models/froakie, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 치고 빠지는 닌자: 던지고 날아차기.
#   blender -b models/froakie/froakie.blend -P scripts/render3d.py -- froakie [anim ...]
#   python scripts/pixel3d.py froakie
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'froakie', 'height': 0.519, 'sprite_h': 35, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine'], 'neck': ['neck'], 'head': 'head', 'tail': [], 'jaw': None, 'hide': ['eye_b'], 'lean0': 5, 'shoot': 'throw', 'springs': {'feeler_[a-d](_\\d+)?': (2.4, 0.3)}, 'eyes': [(17, 5, 23, 11), (5, 5, 10, 11)]}
globals().update(spec(CONFIG))
