# quaquaval: rendered from its Scarlet/Violet model (models/quaquaval, scripts/dae2blend.py) by scripts/render3d.py with the shared
# starter motions (scripts/starter3d.py), then scripts/pixel3d.py. Line concept: 춤추듯 이어지는 콤보 댄서: 발차기 돌진, 손바닥 밀기.
#   blender -b models/quaquaval/quaquaval.blend -P scripts/render3d.py -- quaquaval [anim ...]
#   python scripts/pixel3d.py quaquaval
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from starter3d import spec

CONFIG = {'sp': 'quaquaval', 'height': 2.019, 'sprite_h': 80, 'arm': ('{s}_arm_01', '{s}_arm_02'), 'leg': ('{s}_leg_01', '{s}_leg_02'), 'foot': '{s}_foot', 'spine': ['waist', 'spine_01', 'spine_02'], 'neck': ['neck'], 'head': 'head', 'tail': ['tail'], 'jaw': 'jaw', 'hide': ['lod', 'eyelid', 'gel_mesh'], 'lean0': -10, 'dash': 'kick', 'shoot': 'palm', 'springs': {'hair_a_\\d+|hair_[bc](_\\d+)?|(left|right)_hair': (2.5, 0.3), '(left|right)_claw_[abc]': (2.2, 0.3), '(left|right)_horn': (3.0, 0.35), '(left|right)_skirt': (2.5, 0.35), 'tail|cloth_\\d+|center_cloth|(left|right)_cloth_[ab](_\\d+)?': (2.0, 0.3)}, 'eyes': [(28, 20, 34, 22)]}
import math


def dance(P):
    # its own idle, as in the games: a samba step in place (two bounces a loop), hips swaying, one arm raised and the
    # other out low, the three wing feathers on each forearm rippling one after another
    S, TAU = math.sin, 2 * math.pi
    def idle(t):
        a = t * TAU; b = abs(S(a))
        ripple = {f'{s}_claw_{c}': ('pitch', 14 * S(2 * a - i * 0.9 + (0 if s == 'right' else math.pi)))
                  for s in ('left', 'right') for i, c in enumerate('abc')}
        return P['both'](P['body'](4, 10 * S(a), 5 * S(a), 0, -0.012 * b), P['look'](3 * S(a), -6 * S(a)),
                         P['arm']('right', 10 + 12 * S(a), 70 + 15 * S(a), 30), P['arm']('left', -25 - 10 * S(a), 15 - 15 * S(a), 35),
                         P['leg']('right', 8 * S(a), 4, 15 + 15 * b), P['leg']('left', -8 * S(a), 4, 15 + 15 * b), ripple)
    return P['loop'](12, 24, idle)


CONFIG['anims'] = {'idle': dance}
def combo3(P):
    # 3연타 (the final form's own, shared by 아쿠아스텝, 트리플악셀, 인파이트 and 수류연타; their effects tell them apart): a
    # dancer's combo, each blow landing as its strike: a lunging palm thrust, a high kick with the other leg as the hips
    # turn, then a rising spin (one turn) that ends in a high kick, and down to land. Between the blows it settles into a
    # bouncing guard for a beat (about half a second in the game), while the player picks the next foe
    b, R0, arm, leg, body, look = P['both'], P['R0'], P['arm'], P['leg'], P['body'], P['look']
    wind = b(R0, body(-8, 20, 0, -0.03), arm('right', -10, -30, 90), arm('left', -20, 40, 60), leg('right', -15, 0, 30))
    palm = b(body(15, -15, 0, 0.07), look(-6), arm('right', 0, 90, 0), arm('left', -30, -30, 40), leg('right', -25, 0, 20), leg('left', 20, 0, 30))
    chamber = b(R0, body(0, -25, 0, 0.05, 0.01), arm('right', -20, 40, 70), arm('left', 10, -40, 20), leg('left', 45, 0, 90))
    kick = b(body(-12, -35, -10, 0.06, 0.02), look(4), arm('right', 20, -50, 20), arm('left', 30, 30, 20), leg('left', 100, 25, 0, 10), leg('right', -10, 0, 30))
    tuck = lambda turn, up: b(R0, body(0, turn, 0, 0.05, up), arm('right', -30, 70, 60), arm('left', -30, 70, 60), leg('right', 20, 0, 70), leg('left', 20, 0, 70))
    high = b(body(-15, 360, 0, 0.08, 0.08), look(8), leg('right', 115, 0, 0, 10), leg('left', 30, 0, 60), arm('right', 60, -20, 10), arm('left', 60, -20, 10))
    guard = lambda turn, dip: b(R0, body(4, turn, 0, 0.02, -dip), look(-4), arm('right', -20, 60, 80), arm('left', -20, 60, 80), leg('right', 10, 0, 40), leg('left', 10, 0, 40))
    ks = [(0, R0), (0.07, wind), (0.13, palm), (0.17, b(palm, body(-5, 0, 0, -0.02))), (0.23, guard(-10, 0.02)), (0.3, guard(-15, 0)),
          (0.36, chamber), (0.42, kick), (0.47, b(kick, body(5, 0, 0, -0.02))), (0.53, guard(-20, 0.02)), (0.6, guard(-10, 0)),
          (0.64, tuck(0, 0.05)), (0.67, tuck(120, 0.09)), (0.7, tuck(240, 0.1)), (0.73, high),
          (0.81, b(R0, body(5, 360, 0, 0.05, 0.02), leg('right', 30, 0, 40))), (0.95, b(R0, body(0, 360)))]
    return P['attack'](ks, 0.13, [(0.07, 0.17), (0.36, 0.47), (0.62, 0.78)], hits=[0.13, 0.42, 0.73])

CONFIG['anims'] = {**CONFIG.get('anims', {}), 'combo3': combo3}
globals().update(spec(CONFIG))
