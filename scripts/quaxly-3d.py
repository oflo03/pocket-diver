# quaxly: rendered from its Scarlet/Violet model (models/quaxly, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 춤추듯 이어지는 콤보 댄서: 발차기 돌진, 손바닥 밀기.
#   blender -b models/quaxly/quaxly.blend -P scripts/render3d.py -- quaxly [anim ...]
#   python scripts/pixel3d.py quaxly
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'quaxly', 'height': 0.495, 'sprite_h': 46, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg',), 'foot': '{s}_foot', 'spine': ['waist', 'spine'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail'], 'jaw': None, 'hide': ['lod'], 'lean0': 9, 'dash': 'kick', 'shoot': 'palm', 'springs': {'hair_\\d+': (2.5, 0.3), 'feeler_[ab](_\\d+)?': (2.5, 0.3), 'tail': (3.0, 0.35), '(left|right)_wing_\\d+': (3.0, 0.35)}, 'eyes': [(11, 16, 13, 19), (5, 16, 6, 17)]}
globals().update(spec(CONFIG))
