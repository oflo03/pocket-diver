# inteleon: rendered from its Scarlet/Violet model (models/inteleon, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 원거리 저격 스파이: 인텔리레온은 손가락으로 겨눠 쏜다.
#   blender -b models/inteleon/inteleon.blend -P scripts/render3d.py -- inteleon [anim ...]
#   python scripts/pixel3d.py inteleon
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'inteleon', 'height': 2.1, 'sprite_h': 80, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02', 'spine_03'], 'neck': ['neck_01', 'neck_02', 'neck_03'], 'head': 'head', 'tail': ['tail_01', 'tail_02', 'tail_03', 'tail_04', 'tail_05', 'tail_06', 'tail_07', 'tail_08'], 'jaw': 'jaw', 'hide': ['mantleopen', 'eye_offset', '00_00_eye_mesh'], 'lean0': -3, 'shoot': 'finger', 'pump': 'finger', 'canvas': (3.8, 3.4), 'springs': {'tail_\\d+': (3.0, 0.6, 12, 0.05), '(left|right)_cloth_[a-d](_\\d+)?': (2.0, 0.35), 'feeler_[a-d](_\\d+)?': (3.0, 0.4)}, 'eyes': [(20, 19, 24, 21)], 'tail_shape': {'tail_07': -26, 'tail_08': -26, 'tail_09': -26, 'tail_10': -26, 'tail_11': -26, 'tail_12': -26, 'tail_13': -32, 'tail_14': -32, 'tail_15': -32, 'tail_16': -32, 'tail_17': -32, 'tail_18': -32}}
globals().update(spec(CONFIG))
