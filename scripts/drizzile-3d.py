# drizzile: rendered from its Scarlet/Violet model (models/drizzile, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 원거리 저격 스파이: 인텔리레온은 손가락으로 겨눠 쏜다.
#   blender -b models/drizzile/drizzile.blend -P scripts/render3d.py -- drizzile [anim ...]
#   python scripts/pixel3d.py drizzile
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'drizzile', 'height': 0.89, 'sprite_h': 53, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck_01', 'neck_02'], 'head': 'head', 'tail': ['tail_01', 'tail_02', 'tail_03', 'tail_04', 'tail_05', 'tail_06', 'tail_07', 'tail_08'], 'jaw': 'root_jaw', 'hide': ['tonguelong', 'tongueshort', 'bomb'], 'lean0': -6, 'shoot': 'throw', 'springs': {'hair_[abc]_\\d+': (2.5, 0.3), 'feeler_\\d+': (2.5, 0.3), 'tail_\\d+': (1.8, 0.3)}, 'eyes': [(12, 15, 17, 18)],
          # its thin arms held as on its sprite: the near one bent with the green hand out in front, the far one back
          # behind it (hanging down or out to the side they were lost against its body)
          'arms_pose': {'right': (-35, 75, 30, -10), 'left': (-40, -80, 20)}, 'tread_pose': {'right': (-20, 70, 30, -5), 'left': (-30, -70, 20)}}
globals().update(spec(CONFIG))
