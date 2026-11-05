# blastoise: rendered from its Scarlet/Violet model (models/blastoise, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 강한 대포와 빔: 거북왕은 등껍질 포대로 쏜다.
#   blender -b models/blastoise/blastoise.blend -P scripts/render3d.py -- blastoise [anim ...]
#   python scripts/pixel3d.py blastoise
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'blastoise', 'height': 1.381, 'sprite_h': 62, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'jaw', 'hide': ['jet_mesh'], 'lean0': 45, 'shoot': 'cannon', 'pump': 'cannon', 'springs': {'tail_\\d+': (2.5, 0.35), '(left|right)_ear': (3.5, 0.35)}, 'eyes': [(24, 9, 27, 12), (21, 11, 23, 13)], 'cannons': ['left_feeler_b_01', 'right_feeler_b_01'], 'mouth_bone': 'left_feeler_b_02'}
globals().update(spec(CONFIG))
