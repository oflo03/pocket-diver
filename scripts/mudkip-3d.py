# mudkip: rendered from its Scarlet/Violet model (models/mudkip, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 땅을 흔드는 중장갑: 늪짱이·대짱이는 어깨로 들이받는다.
#   blender -b models/mudkip/mudkip.blend -P scripts/render3d.py -- mudkip [anim ...]
#   python scripts/pixel3d.py mudkip
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'mudkip', 'height': 0.402, 'sprite_h': 42, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02'], 'jaw': 'jaw', 'hide': [], 'lean0': 61, 'plan': 'quad', 'springs': {'feeler_\\d+': (2.8, 0.3), 'tail_\\d+': (2.5, 0.3)}, 'eyes': [(8, 22, 10, 24), (15, 23, 17, 24)]}
globals().update(spec(CONFIG))
