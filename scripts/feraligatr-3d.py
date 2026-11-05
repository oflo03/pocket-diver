# feraligatr: rendered from its Scarlet/Violet model (models/feraligatr, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 턱으로 물고 늘어지는 난투형: 돌진은 입을 크게 벌리고 문다.
#   blender -b models/feraligatr/feraligatr.blend -P scripts/render3d.py -- feraligatr [anim ...]
#   python scripts/pixel3d.py feraligatr
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'feraligatr', 'height': 2.051, 'sprite_h': 72, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail_01', 'tail_02', 'tail_03', 'tail_04'], 'jaw': 'jaw', 'hide': [], 'lean0': 45, 'dash': 'bite', 'springs': {'tail_\\d+': (1.8, 0.35), 'tongue_\\d+': (3.0, 0.3)}, 'eyes': [(25, 16, 29, 19), (16, 21, 19, 23)]}
import math


def rampage(P):
    # 역린 / 난동부리기 (the final form's own motion): thrashing wildly, the body twisting side to side and pitching, the
    # arms flailing in turn, the jaws snapping and the tail lashing; looped while the rampage runs
    S, TAU = math.sin, 2 * math.pi
    def f(t):
        a = t * TAU
        return P['both'](P['body'](28 + 12 * S(2 * a), 32 * S(a), 14 * S(2 * a + 1), 0.03 * S(2 * a), 0.02 * abs(S(2 * a))),
                         P['look'](12 * S(2 * a + 0.5), -22 * S(a)), P['mouth'](20 + 22 * abs(S(3 * a))),
                         P['arm']('right', 25 * S(2 * a), 55 + 55 * S(2 * a), 40), P['arm']('left', -25 * S(2 * a), 55 - 55 * S(2 * a), 40),
                         P['leg']('right', 30 * S(2 * a), 8, 30), P['leg']('left', -30 * S(2 * a), 8, 30), P['wag'](8, 45 * S(a + 1.5), 20, t))
    return P['loop'](14, 12, f, base=P['WATER'])

CONFIG['anims'] = {**CONFIG.get('anims', {}), 'rampage': rampage}
globals().update(spec(CONFIG))
