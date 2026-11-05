# swampert: rendered from its Scarlet/Violet model (models/swampert, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 땅을 흔드는 중장갑: 늪짱이·대짱이는 어깨로 들이받는다.
#   blender -b models/swampert/swampert.blend -P scripts/render3d.py -- swampert [anim ...]
#   python scripts/pixel3d.py swampert
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'swampert', 'height': 1.531, 'sprite_h': 58, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_a', 'tail_b', 'tail_c'], 'jaw': 'jaw', 'hide': [], 'lean0': 57, 'dash': 'shoulder', 'springs': {'(left|right)_hair_\\d+': (2.4, 0.3), '(left|right)_feeler': (3.0, 0.35), 'tail_[abc]': (2.0, 0.35)}, 'eyes': [(24, 20, 26, 23)]}
globals().update(spec(CONFIG))
