# popplio: rendered from its Scarlet/Violet model (models/popplio, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 노래하는 디바: 노래하듯 소리를 낸다.
#   blender -b models/popplio/popplio.blend -P scripts/render3d.py -- popplio [anim ...]
#   python scripts/pixel3d.py popplio
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'popplio', 'height': 0.484, 'sprite_h': 39, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': (), 'foot': None, 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'lower_jaw', 'hide': [], 'lean0': 27, 'shoot': 'sing', 'plan': 'seal', 'springs': {'(left|right)_ear_\\d+': (3.0, 0.35), '(center|left|right)_feeler_[abc]_\\d+': (3.0, 0.35), 'tail_\\d+': (2.5, 0.3)}, 'eyes': [(18, 7, 22, 13)]}
globals().update(spec(CONFIG))
