# brionne: rendered from its Scarlet/Violet model (models/brionne, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 노래하는 디바: 노래하듯 소리를 낸다.
#   blender -b models/brionne/brionne.blend -P scripts/render3d.py -- brionne [anim ...]
#   python scripts/pixel3d.py brionne
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'brionne', 'height': 1.059, 'sprite_h': 55, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': (), 'foot': None, 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'lower_jaw', 'hide': [], 'lean0': 0, 'shoot': 'sing', 'plan': 'seal', 'springs': {'(left|right)_feeler_\\d+': (2.2, 0.3), 'feeler_[a-o]_\\d+': (3.0, 0.35), '(left_|right_)?tail_\\d+': (2.5, 0.3)}, 'eyes': [(20, 16, 24, 22)]}
globals().update(spec(CONFIG))
