# greninja: rendered from its Scarlet/Violet model (models/greninja, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 치고 빠지는 닌자: 던지고 날아차기.
#   blender -b models/greninja/greninja.blend -P scripts/render3d.py -- greninja [anim ...]
#   python scripts/pixel3d.py greninja
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'greninja', 'height': 1.611, 'sprite_h': 65, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': [], 'jaw': None, 'hide': ['eyelid', 'eye_b'], 'lean0': 0, 'shoot': 'throw', 'dash': 'kick', 'springs': {'feeler_0[2-9]': (2.0, 0.45, 25, 0.5)}, 'eyes': [(22, 24, 26, 27)]}
globals().update(spec(CONFIG))
