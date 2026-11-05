# Oshawott's animations, posed on its Scarlet/Violet model (models/oshawott, see scripts/dae2blend.py) and rendered by
# scripts/render3d.py, then turned into the game's pixel-art sheet by scripts/pixel3d.py:
#   blender -b models/oshawott/oshawott.blend -P scripts/render3d.py -- oshawott [anim ...]
#   python scripts/pixel3d.py oshawott            -> public/anim/oshawott.png + src/anim/oshawott.json
# The model stands on two short legs (leg_01, foot, toe); its arms are arm_01 (upper arm) and arm_02 (forearm and paw),
# with no hand bone, so one is added at each paw (for the collision handling). Oshawott learns no cutting move before
# it evolves, so it never draws its scalchop: no sword motions, drawn versions or sheathing.
import math

PX = 0.013                   # metres per pixel: the model (0.5 m) about as tall as the Black/White sprite
CANVAS = (110, 90)            # generous: pixel3d trims every frame to what they all cover (TRIM)
ANCHOR = (50, 66)
TRIM = 2
LOOK = (0, 0.0, 0)
CAMERA = (55, 14)            # more toward the front than Samurott's, so both eyes show as on the sprite
LIGHT = (0.29, -0.81, 0.8)  # toward the light (world): the upper right of the screen, a little in front
STEPS = ((0, 0.42), (0.3, 0.66), (0.6, 0.86), (0.88, 1.04))  # light steps: shadow, dim, half, lit
SPRITE = 'public/sprites/oshawott.png'
FAMILIES = None
LIFT = (0.92, 1.06)          # the colours lifted a little (whites stay white); the palette gets shadow shades: SHADOWS
SHADOWS = True
CHROMA = 1.6                 # the model's pale cyan pushed toward the sprite's teal (pixel3d)
DESPECKLE = False
CREASE = 0.02                # the depth step that draws a darker line (pixel3d)
RIMS = [(239, 206, 132)]  # the scalchop's colours: drawn with a dark rim (it lies flush on the body)
ROOT_BONE = 'origin'
MOUTH_BONE = 'right_teeth'
SOLID = {'chest': ['spine_01', 'spine_02', 'waist'], 'neck': ['neck'], 'head': ['head']}
LIMBS = ['right_arm_02', 'left_arm_02']
SWITCHED = []
SHOWN = []
ADD_BONES = {'right_hand': ('right_arm_02', (-0.176, 0.19, 0.003)), 'left_hand': ('left_arm_02', (0.176, 0.19, 0.003))}  # paws
FACE_BONE = 'head'           # render3d records where the eyes are each frame; pixel3d lays the sprite's face there:
FACE = {'box': (3, 7, 19, 15), 'eyes': ((5, 9.5), (17, 10)), 'flip': True,  # its eyes, nose and mouth (sprite px)
        'skin': [(255, 255, 255), (198, 198, 206)], 'keep': [(140, 140, 156)]}  # its skin; the render's own skin too


# Poses are built from limbs given by direction. arm(): el raises the arm from hanging at the side (0 = straight out
# sideways, 90 = straight up, past 90 back over the head, - down), az swings it round from out to the side (0) to
# forward (90) and across the front (180); twist turns it about its own length, elbow bends the forearm forward.
# Mirrored for the left arm. leg(): fwd swings it forward, out spreads it, foot + lifts the toes.
def arm(side, el=0, az=0, twist=0, elbow=0):
    sg = 1 if side == 'right' else -1
    return {f'{side}_arm_01': [('pitch', twist), ('roll', -el * sg), ('yaw', az * sg)], f'{side}_arm_02': ('yaw', elbow * sg)}
def leg(side, fwd=0, out=0, foot=0):
    sg = 1 if side == 'left' else -1
    return {f'{side}_leg_01': [('pitch', fwd), ('roll', out * sg)], f'{side}_foot': ('pitch', foot)}
def both(*poses):  # merge poses: switches add up, per-bone settings (reach, carry, ...) merge, anything else from the later one
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = list(out.get(k, [])) + list(v) if k in ('show', 'hide') else {**out.get(k, {}), **v} if k in ('reach', 'aim', 'point', 'level', 'pole', 'carry') else v
    return out


# Standing: the tail lifted off the ground, the face turned a little toward the viewer, the scalchop a third bigger
# (as the sprite has it). The arms are left out of the base poses (arm() turns are from the model's
# rest, so they would add up): every animation sets them, standing (ARMS_L) or floating (ARMS_W) when idle.
BASE = {'tail_01': ('pitch', 10), 'head': ('yaw', -20), 'feeler_01@scale': 1.35}  # the face turned a little toward the viewer, as sprites have it, so both eyes show
ARMS_L = both(arm('right', -35, 15, 0, 15), arm('left', -35, 15, 0, 15))
ARMS_W = both(arm('right', -10, 20, 0, 10), arm('left', -10, 20, 0, 10))

# Floating in the water (the attacks start and end here): body tipped a little forward, legs trailing back, arms out.
FLOAT_REST = both({'root': (0, 0.04, 0), 'origin': ('pitch', -12), 'neck': ('pitch', 8)},
                  leg('right', -20, 5, -30), leg('left', -20, 5, -30), {'tail_01': ('pitch', -5)})
def _turns(v): return [] if not v else [v] if isinstance(v[0], str) else list(v)
def added(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = tuple(x + y for x, y in zip(a[k], v)) if k == 'root' and k in a else _turns(a[k]) + _turns(v) if k in a else v
    return out
WATER = added(BASE, FLOAT_REST)

S = math.sin; TAU = 2 * math.pi
def loop(fps, n, f, base=None): return {'fps': fps, 'n': n, 'pose': f, **({'base': base} if base else {})}
def keys(fps, ks, hit=None, wait=False, base=None):
    return {'fps': fps, 'keys': ks, **({'hit': hit} if hit is not None else {}), 'wait': wait, **({'base': base} if base else {})}


def step(ph, stride, lift, duty=0.6):
    # where a foot is (up, forward) at this point of its cycle, and how far through its lift (0 planted .. 1 top):
    # planted, it slides back under the body as the body passes over it (the world moves, the sprite does not)
    ph %= 1
    if ph < duty: return 0.0, stride / 2 - stride * ph / duty, 0.0
    q = (ph - duty) / (1 - duty); q2 = q * q * (3 - 2 * q); up = math.sin(math.pi * q)
    return lift * up, -stride / 2 + stride * q2, up
LEG = 0.09  # hip to the ground when standing (m): the legs are one bone each, hip to ankle, with no knee
def walk(t):
    # a waddle on planted feet with stiff little legs: a planted foot stays where it landed while the body passes over
    # it (the leg tilting over it), and the body sits on whichever foot is down ('ground'), so it rides up over the
    # planted foot and drops as the feet change over with the legs spread; the lifted foot swings through with its toes up; the body rolls toward the planted foot, the
    # head going with it, the arms swinging against the legs, the tail swaying
    a = t * TAU; c = math.cos(a); legs = {}
    for side, ph in (('left', 0.0), ('right', 0.5)):
        up, z, u = step(t + ph, 0.2, 0.0)
        th = math.degrees(math.atan2(z, LEG)); legs.update(leg(side, th, 0, -th + 30 * u))  # the foot kept flat, toes up when lifted
    return both(legs, {'ground': True, 'origin': ('roll', 6 * S(a - 1.9)), 'spine_01': ('yaw', 5 * c),
                       'neck': ('roll', -3 * S(a - 1.9)), 'tail_01': [('pitch', -15), ('yaw', 10 * S(a - 0.8))]},
                arm('right', -35, 15 + 25 * c, 0, 15), arm('left', -35, 15 - 25 * c, 0, 15))
def cyc(t, ks):
    # a value keyed round the cycle ([(t, v), ...] from t = 0, v a number or a tuple), eased from key to key, wrapping
    t %= 1; ks = ks + [(1, ks[0][1])]
    for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
        if t < t1:
            q = (t - t0) / (t1 - t0); q = q * q * (3 - 2 * q)
            return tuple(a + (b - a) * q for a, b in zip(v0, v1)) if isinstance(v0, tuple) else v0 + (v1 - v0) * q
# 잠영's dolphin kick, twice a cycle: (legs, feet, tail). From the glide (legs in line) the legs drift up and cock, then
# snap down together in one frame, the feet whipping and the tail lashing down after them, and glide again
KICK = [(0.0, (-20, -50, 0)), (0.25, (-40, -55, -10)), (0.48, (-55, -30, -15)), (0.58, (15, -75, -5)), (0.68, (-10, -60, 22)), (0.85, (-20, -50, 0))]
def swim(t, f=0):
    # belly down, kicking: the body level, the head up to look ahead, the legs trailing and fluttering in turn, the tail beating with them, the arms
    # trailing back along the body and swaying gently in turn. f blends to 잠영 (Shift, flat out): the arms closer in, the body lower and in line,
    # the flutter giving way to the dolphin kick (KICK). The head and the body hold still; only the legs and the tail move (the tail hangs off
    # spine_01, so the spine stays put).
    a = t * TAU; g = 1 - f
    kl, kf, kt = cyc(2 * t, KICK); kt2 = cyc(2 * t - 0.06, KICK)[2]
    flutter = lambda ph: g * (-45 + 25 * S(2 * a + ph)) + f * kl
    return both({'root': (0, 0.16, -0.12), 'origin': ('pitch', -72 - 8 * f), 'neck': ('pitch', 38 - 8 * f), 'head': ('pitch', 20 - 2 * f),
                 'tail_01': ('pitch', 72 + g * 12 * S(2 * a + 1) + f * kt), 'tail_02': ('pitch', g * 12 * S(2 * a) + f * 1.3 * kt2)},
                leg('right', flutter(0), 8, -40 * g + kf * f), leg('left', flutter(math.pi), 8, -40 * g + kf * f),
                arm('right', -20 + 8 * S(a), -45 + 8 * S(a + 1)), arm('left', -20 + 8 * S(a + math.pi), -45 + 8 * S(a + math.pi + 1)))
def mix(p, q, w):
    # two poses blended, w of the way from p to q (for the in-between strokes of the swim blend space): each bone's
    # turns summed per axis and lerped (a missing one is no turn), shifts lerped
    def turns(v):
        out = {}
        for ax, d in ([] if not v else [v] if isinstance(v[0], str) else v): out[ax] = out.get(ax, 0) + d
        return out
    out = {}
    for k in dict.fromkeys([*p, *q]):
        if k == 'root':
            a, b = p.get(k, (0, 0, 0)), q.get(k, (0, 0, 0)); out[k] = tuple(x + (y - x) * w for x, y in zip(a, b)); continue
        a, b = turns(p.get(k)), turns(q.get(k))
        out[k] = [(ax, a.get(ax, 0) + (b.get(ax, 0) - a.get(ax, 0)) * w) for ax in dict.fromkeys([*a, *b])]
    return out
def tread(t):
    # treading water: upright, legs pedalling slowly, arms sculling, a gentle bob
    a = t * TAU
    return both(FLOAT_REST, {'root': (0, 0.04 + 0.01 * S(a), 0)}, leg('right', -20 + 15 * S(a), 5, -30), leg('left', -20 - 15 * S(a), 5, -30),
                arm('right', -10 - 8 * S(a), 20 + 15 * S(a), 0, 10), arm('left', -10 - 8 * S(a + math.pi), 20 + 15 * S(a + math.pi), 0, 10))


# Attacks: on the floating pose, slowed outside their strikes (as Samurott's); hit = when the move lands.
SLOW = 1.7
def slowed(ks, strikes, k=SLOW):
    def warp(t):
        out_, last = 0.0, 0.0
        for a, b in sorted(strikes):
            if t <= a: return out_ + (t - last) * k
            out_ += (a - last) * k
            if t <= b: return out_ + (t - a)
            out_ += b - a; last = b
        return out_ + (t - last) * k
    return [(warp(t), p) for t, p in ks], warp
def attack(fps, ks, hit, strikes):
    ks, warp = slowed(ks, strikes)
    return keys(fps, ks, hit=round(warp(hit), 3), base=WATER)
def body(lean=0, turn=0, fwd=0, up=0):  # lean + tips forward, turn + toward the model's left, fwd / up metres
    return {'origin': [('pitch', -lean), ('yaw', turn)], 'root': (0, up, fwd)}


ANIMS = {  # several moves share one motion (src/main.js MOVE_ANIM)
    'idle': loop(10, 16, lambda t: {'root': (0, 0.003 * S(t * TAU), 0), 'spine_01': ('pitch', 1.5 * S(t * TAU)),
        'neck': ('pitch', 2 * S(t * TAU - 0.6)), 'tail_01': [('yaw', 6 * S(t * TAU + 1)), ('pitch', 3 * S(t * TAU))], **ARMS_L}),
    'walk': loop(14, 12, walk),
    # 헤엄 as a blend space over speed (src/main.js swimStroke): 물속 대기, halfway from it to swimming, swimming, halfway
    # to flat out, flat out. All share one 1.5 s cycle (float's 12 frames at 8 fps, the others' 18 at 12), so moving
    # from one to the next carries on from the same point in the stroke
    'float': loop(8, 12, tread), 'swim_slow': loop(12, 18, lambda t: mix(tread(t), swim(t), 0.5)),
    'swim': loop(12, 18, swim), 'swim_mid': loop(12, 18, lambda t: swim(t, 0.5)), 'swim_fast': loop(12, 18, lambda t: swim(t, 1)),
    # 돌진 (몸통박치기, 아쿠아제트, 드릴라이너, 메가혼, 파도타기): a headbutt. Drawn back with the chin tucked, then the
    # body thrown forward level and the big head, in line with it, rammed in crown first (arms and legs swept back), driving on through the
    # impact, the head jolted back by it, and a recovery
    'dash': attack(30, [(0, ARMS_W), (0.08, both(body(-14, 0, -0.04, -0.02), {'neck': ('pitch', -12), 'tail_01': ('pitch', -10)}, arm('right', 0, -30), arm('left', 0, -30))),
        (0.14, both(body(68, 0, 0.12, 0.06), {'neck': ('pitch', -8), 'spine_02': ('pitch', 0), 'tail_01': ('pitch', 50)}, arm('right', -20, -70), arm('left', -20, -70),
                    leg('right', -40, 0, -40), leg('left', -40, 0, -40))),
        (0.2, both(body(72, 0, 0.16, 0.05), {'neck': ('pitch', -12), 'spine_02': ('pitch', -3), 'tail_01': ('pitch', 58)}, arm('right', -20, -75), arm('left', -20, -75),
                   leg('right', -45, 0, -45), leg('left', -45, 0, -45))),
        (0.3, both(body(72, 0, 0.17, 0.05), {'neck': ('pitch', -12), 'spine_02': ('pitch', -3), 'tail_01': ('pitch', 54)}, arm('right', -20, -75), arm('left', -20, -75),
                   leg('right', -42, 0, -42), leg('left', -42, 0, -42))),
        (0.4, both(body(70, 0, 0.17, 0.05), {'neck': ('pitch', -10), 'spine_02': ('pitch', -2), 'tail_01': ('pitch', 50)}, arm('right', -20, -72), arm('left', -20, -72),
                   leg('right', -40, 0, -40), leg('left', -40, 0, -40))),
        (0.47, both(body(48, 0, 0.11, 0.06), {'neck': ('pitch', 4), 'tail_01': ('pitch', 30)}, arm('right', -10, -50), arm('left', -10, -50),
                    leg('right', -25, 0, -25), leg('left', -25, 0, -25))),
        (0.58, both(ARMS_W, body(12, 0, 0.05))), (0.7, ARMS_W)], hit=0.16, strikes=[(0.08, 0.47)]),
    # 입에서 발사 (물대포, 물의파동, 하이드로캐논): the head drawn back and the chest filled, then the head thrust forward
    'shoot': attack(30, [(0, ARMS_W), (0.1, both(ARMS_W, {'neck': ('pitch', 12), 'spine_01': ('pitch', 5), 'root': (0, 0, -0.02)})),
        (0.18, both({'neck': ('pitch', 16), 'spine_01': ('pitch', 7), 'root': (0, 0, -0.025)}, arm('right', 15, 50, 0, 40), arm('left', 15, 50, 0, 40))),
        (0.24, both({'neck': ('pitch', -14), 'head': ('pitch', -6), 'spine_01': ('pitch', -6), 'root': (0, 0, 0.03)}, arm('right', 5, 30), arm('left', 5, 30))),
        (0.34, both(ARMS_W, {'neck': ('pitch', -8), 'root': (0, 0, 0.02)})), (0.5, ARMS_W)], hit=0.24, strikes=[(0.18, 0.34)]),
    # 아쿠아테일: one slow full turn on the spot, the tail held out and whipping round (it ends at 360: back at 0 it would unwind)
    'tail': attack(30, [(0, ARMS_W), (0.14, {**ARMS_W, 'origin': [('pitch', -5), ('yaw', -40)], 'spine_01': ('pitch', -6), 'tail_01': [('pitch', -10), ('yaw', 35)], 'root': (0, -0.015, 0)}),
        (0.26, {**ARMS_W, 'origin': [('pitch', -7), ('yaw', -55)], 'spine_01': ('pitch', -8), 'tail_01': [('pitch', -12), ('yaw', 40)], 'root': (0, -0.02, 0)}),
        (0.3, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 20)], 'spine_01': ('pitch', 0), 'tail_01': [('pitch', 35), ('yaw', 20)]}),
        (0.34, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 120)], 'tail_01': [('pitch', 40), ('yaw', -30)], 'tail_02': ('yaw', -20)}),
        (0.38, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 230)], 'tail_01': [('pitch', 40), ('yaw', -40)], 'tail_02': ('yaw', -30), 'root': (0, 0.015, 0)}),
        (0.42, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 330)], 'tail_01': [('pitch', 35), ('yaw', -30)], 'tail_02': ('yaw', -20)}),
        (0.46, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 380)], 'tail_01': [('pitch', 15), ('yaw', -10)]}),
        (0.56, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 360)], 'tail_01': [('pitch', 5), ('yaw', -3)]}), (0.7, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 360)]})], hit=0.36, strikes=[(0.26, 0.46)]),
    # 하이드로펌프: braced, head thrust forward, the body shuddering with the recoil (loops while the jet runs)
    'pump': loop(16, 8, base=WATER, f=lambda t: both({'root': (0, -0.01, -0.006 - 0.006 * abs(S(t * TAU))), 'neck': ('pitch', -12),
        'head': ('pitch', -4 + (1 if t * 8 % 2 < 1 else 0)), 'tail_01': ('pitch', -6)}, arm('right', 0, 60, 0, 30), arm('left', 0, 60, 0, 30),
        leg('right', -10, 15), leg('left', -10, 15))),
    # after 하이드로캐논: slumped, head hanging, panting
    'recharge': loop(8, 12, lambda t: both({'root': (0, -0.012 - 0.004 * S(t * TAU), 0), 'spine_01': ('pitch', -8 + 2 * S(t * TAU)),
        'neck': ('pitch', -14 + 3 * S(t * TAU)), 'head': ('pitch', -6), 'tail_01': ('pitch', -8)}, arm('right', -60, 30, 0, 10), arm('left', -60, 30, 0, 10))),
    'hurt': keys(30, [(0, both({'origin': ('pitch', 12), 'root': (0, 0.01, -0.05), 'neck': ('pitch', 10)}, arm('right', 0, -10), arm('left', 0, -10))),
        (0.1, {'origin': ('pitch', 7), 'root': (0, 0, -0.03), 'neck': ('pitch', 6), **ARMS_L}), (0.25, ARMS_L)]),
    # 순간이동 (귀환, NPC에게, 포탈로): gathering itself before it vanishes: upright, head bowed, paws together before the
    # chest, legs drawn up, breathing slow and deep as it rises a little
    'focus': loop(8, 16, lambda t: both({'root': (0, 0.05 + 0.006 * S(t * TAU), 0), 'spine_01': ('pitch', -3 - 1.5 * S(t * TAU)),
        'neck': ('pitch', -12 + 2 * S(t * TAU)), 'head': ('pitch', -6), 'tail_01': ('pitch', -15)},
        arm('right', -20, 75, 0, 70), arm('left', -20, 75, 0, 70), leg('right', 40, 8, 10), leg('left', 40, 8, 10))),
}
