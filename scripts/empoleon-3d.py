# empoleon: rendered from its Scarlet/Violet model (models/empoleon, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 버티며 반격하는 강철 기사: 팽태자·엠페르트는 회전하며 부리로 뚫는다.
#   blender -b models/empoleon/empoleon.blend -P scripts/render3d.py -- empoleon [anim ...]
#   python scripts/pixel3d.py empoleon
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'empoleon', 'height': 1.629, 'sprite_h': 77, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail'], 'jaw': 'jaw', 'hide': [], 'lean0': 0, 'dash': 'drill', 'springs': {'tail': (3.0, 0.35)}, 'eyes': [(39, 17, 42, 18), (34, 17, 35, 18)]}
import math


def heal(P):
    # 날개쉬기 / 아쿠아링 (the final form's own motion): the flippers spread wide and raised, chest out and head up, held,
    # then folded back
    up = P['both'](P['R0'], P['body'](-8, 0, 0, 0, 0.03), P['look'](22), P['arms2'](30, 15, 10))
    hold = P['both'](P['R0'], P['body'](-12, 0, 0, 0, 0.045), P['look'](28), P['arms2'](42, 5, 5))
    return P['attack']([(0, P['R0']), (0.2, up), (0.55, hold), (0.8, P['R0'])], 0.3, [(0.2, 0.55)])

CONFIG['anims'] = {**CONFIG.get('anims', {}), 'heal': heal}
globals().update(spec(CONFIG))
