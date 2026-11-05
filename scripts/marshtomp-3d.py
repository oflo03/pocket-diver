# marshtomp: rendered from its Scarlet/Violet model (models/marshtomp, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 땅을 흔드는 중장갑: 늪짱이·대짱이는 어깨로 들이받는다.
#   blender -b models/marshtomp/marshtomp.blend -P scripts/render3d.py -- marshtomp [anim ...]
#   python scripts/pixel3d.py marshtomp
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'marshtomp', 'height': 0.705, 'sprite_h': 56, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': [], 'head': 'head', 'tail': [], 'jaw': 'jaw', 'hide': [], 'lean0': -2, 'dash': 'shoulder', 'springs': {'hair': (3.0, 0.3), '(left|right)_tail_\\d+': (2.2, 0.3)}, 'eyes': [(24, 20, 26, 22), (15, 19, 17, 21)]}
globals().update(spec(CONFIG))
