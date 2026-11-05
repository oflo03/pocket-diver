# quaxwell: rendered from its Scarlet/Violet model (models/quaxwell, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 춤추듯 이어지는 콤보 댄서: 발차기 돌진, 손바닥 밀기.
#   blender -b models/quaxwell/quaxwell.blend -P scripts/render3d.py -- quaxwell [anim ...]
#   python scripts/pixel3d.py quaxwell
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'quaxwell', 'height': 1.157, 'sprite_h': 61, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'jaw', 'hide': ['eyelid'], 'lean0': -1, 'dash': 'kick', 'shoot': 'palm', 'springs': {'(center_|left_|right_)?hair(_[ab])?(_\\d+)?': (2.5, 0.3), 'tail_\\d+': (3.0, 0.35), '(center|left|right)_wing': (3.0, 0.35)}, 'eyes': [(21, 18, 24, 20), (13, 18, 15, 20)]}
globals().update(spec(CONFIG))
