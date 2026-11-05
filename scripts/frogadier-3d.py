# frogadier: rendered from its Scarlet/Violet model (models/frogadier, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 치고 빠지는 닌자: 던지고 날아차기.
#   blender -b models/frogadier/frogadier.blend -P scripts/render3d.py -- frogadier [anim ...]
#   python scripts/pixel3d.py frogadier
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'frogadier', 'height': 1.003, 'sprite_h': 50, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': [], 'jaw': None, 'hide': ['eyelid', 'eye_b'], 'lean0': 9, 'shoot': 'throw', 'dash': 'kick', 'springs': {'feeler_[a-h](_\\d+)?': (2.4, 0.3)}, 'eyes': [(15, 13, 20, 18)]}
globals().update(spec(CONFIG))
