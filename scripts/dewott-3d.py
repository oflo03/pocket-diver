# Dewott's animations, posed on its Scarlet/Violet model (models/dewott, see scripts/dae2blend.py) and rendered by
# scripts/render3d.py, then turned into the game's pixel-art sheet by scripts/pixel3d.py:
#   blender -b models/dewott/dewott.blend -P scripts/render3d.py -- dewott [anim ...]
#   python scripts/pixel3d.py dewott            -> public/anim/dewott.png + src/anim/dewott.json
# The model stands on two legs (leg_01, leg_02, foot) with its arms out like a T (arm_01, arm_02, hand, fingers). A
# scalchop sits on each thigh: the bone <side>_feeler_a, its head at the knob it is held by, its fan along X. To draw
# them, 'carry' constraints move each onto a grip in its paw (knob in the fist, fan up), and it cuts with the
# scalchops themselves (their fan's rim). Dewott always draws and uses both.
import math

PX = 0.014                   # metres per pixel: the model (0.8 m) about as tall as the Black/White sprite
CANVAS = (140, 124)           # generous: pixel3d trims every frame to what they all cover (TRIM)
ANCHOR = (66, 96)
TRIM = 2
LOOK = (0, 0.0, 0)
CAMERA = (55, 14)            # more toward the front than Samurott's, so both eyes show as on the sprite
LIGHT = (0.29, -0.81, 0.8)  # toward the light (world): the upper right of the screen, a little in front
STEPS = ((0, 0.42), (0.3, 0.66), (0.6, 0.86), (0.88, 1.04))  # light steps: shadow, dim, half, lit
SPRITE = 'public/sprites/dewott.png'
FAMILIES = None
LIFT = (0.92, 1.06)          # the colours lifted a little (whites stay white); the palette gets shadow shades: SHADOWS
SHADOWS = True
CHROMA = 1.4                 # the model's pale cyan pushed toward the sprite's teal (pixel3d)
DESPECKLE = False
CREASE = 0.02                # the depth step that draws a darker line (pixel3d)
RIMS = [(239, 214, 140), (198, 148, 41)]  # the scalchop's colours: drawn with a dark rim (it lies flush on the body)
ROOT_BONE = 'origin'
MOUTH_BONE = 'head'
MOUTH_OFFSET = (0, 0.09, 0.14)  # from the head bone's head (inside the skull) to the mouth
SOLID = {'chest': ['spine_01', 'waist'], 'upper': ['spine_02'], 'head': ['head'], 'hips': ['hips']}
LIMBS = [f'{s}_{b}' for s in ('right', 'left') for b in ('arm_02', 'hand', 'index', 'middle', 'ring')]
BLADES = {'right': 'right_blade', 'left': 'left_blade'}  # a bone at each scalchop's fan edge (X out of the fan, Y along its rim)
POINT_BY = {'right_blade': 'right_hand', 'left_blade': 'left_hand'}  # aiming a scalchop turns the paw holding it
BLADE_TIP = 0.0
HELD = {'right': ('right_feeler_a', 'right_feeler'), 'left': ('left_feeler_a', 'left_feeler')}  # carried bone, its groups
SWITCHED = []
SHOWN = []
UPRIGHT = ((0, 1, 0), (0, 0, 1))  # a held scalchop's fan up and its face forward, with the arm out to the side
CARRY = {'right_feeler_a': ('right_hand', (-0.025, 0, 0.01), UPRIGHT), 'left_feeler_a': ('left_hand', (0.025, 0, 0.01), UPRIGHT)}
BLADE_BONES = {'right': ('right_feeler_a', 0.1), 'left': ('left_feeler_a', 0.1)}
FACE_BONE = 'head'           # render3d records where the eyes are each frame; pixel3d lays the sprite's face there:
FACE = {'box': (11, 15, 21, 25), 'eyes': ((11.5, 17), (19.5, 17.5)), 'flip': True,  # its eyes, nose and mouth (sprite px;
        'skin': [(82, 189, 189), (33, 140, 148)]}  # the whiskers stay the model's); its skin


# Poses are built from limbs given by direction. arm(): el raises the arm from hanging at the side (0 = straight out
# sideways, 90 = straight up, - down), az swings it round from out to the side (0) to forward (90) and across the
# front (180); twist turns it about its own length, elbow bends the forearm forward. Mirrored for the left arm.
# leg(): fwd swings it forward, out spreads it, knee + bends the shin back, foot + lifts the toes.
def arm(side, el=0, az=0, twist=0, elbow=0):
    sg = 1 if side == 'right' else -1
    return {f'{side}_arm_01': [('pitch', twist), ('roll', -el * sg), ('yaw', az * sg)], f'{side}_arm_02': ('yaw', elbow * sg)}
def leg(side, fwd=0, out=0, knee=0, foot=0):
    sg = 1 if side == 'left' else -1
    return {f'{side}_leg_01': [('pitch', fwd), ('roll', out * sg)], f'{side}_leg_02': ('pitch', -knee), f'{side}_foot': ('pitch', foot + knee * 0.5)}
def both(*poses):  # merge poses: switches add up, per-bone settings (reach, carry, ...) merge, anything else from the later one
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = list(out.get(k, [])) + list(v) if k in ('show', 'hide') else {**out.get(k, {}), **v} if k in ('reach', 'aim', 'point', 'level', 'pole', 'carry') else v
    return out
def other(side): return 'left' if side == 'right' else 'right'
def mirror(at): return (-at[0], at[1], at[2])


# Standing: the tail off the ground. The arms are left out of the base poses (arm() turns are from the model's rest,
# so they would add up): every animation sets them, standing (ARMS_L) or floating (ARMS_W) when idle.
BASE = {'tail_01': ('pitch', 8)}
ARMS_L = both(arm('right', -60, 20, 0, 20), arm('left', -60, 20, 0, 20))
ARMS_W = both(arm('right', -30, 25, 0, 20), arm('left', -30, 25, 0, 20))
# floating in the water (the attacks start and end here): body tipped a little forward, legs trailing back
FLOAT_REST = both({'root': (0, 0.05, 0), 'origin': ('pitch', -10), 'head': ('pitch', 6)},
                  leg('right', -20, 5, 15, -30), leg('left', -20, 5, 15, -30), {'tail_01': ('pitch', -5)})
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


# --- 발도 / 납도 ---------------------------------------------------------------------------------------------------
# Sheathed (납도), the scalchops sit on the thighs. Drawn (발도), one in each paw, knob in the fist; held en garde,
# the paws forward and low, the right one's fan pointing forward and up, the left lower.
def held(side): return {'carry': {f'{side}_feeler_a': 1}}
def blade(side, at, k=1): return {'point': {f'{side}_blade': (at, k)}}  # a scalchop's fan turned (with its paw) to point that way
def garde(side): return both(arm(side, -15, 65, 0, 35), held(side), blade(side, (0, 0.7, 1) if side == 'right' else (0, 0.25, 1)))
DRAWN = both(garde('right'), garde('left'))
# lying in the water (or diving), the scalchops held out behind, the arms swept back and apart like a Naruto run
# (model axes, the body lying: down along it is behind, its back is up)
def trail(side):
    sg = 1 if side == 'right' else -1
    return both(arm(side, -60, -30, 0, 0), held(side), blade(side, (-0.43 * sg, -0.87, -0.25)))
DRAWN_SWIM = both(trail('right'), trail('left'))
# swimming, the arms already trail and sway (swim): drawn, the paws only hold the scalchops out behind
SWIM_HOLD = both(held('right'), held('left'), blade('right', (-0.43, -0.87, -0.25)), blade('left', (0.43, -0.87, -0.25)))
def thigh(side):  # the paw at its scalchop on the thigh
    return {'reach': {f'{side}_hand': ('@hips', 1, (-0.09 if side == 'right' else 0.09, -0.04, 0.1))}}


def step(ph, stride, lift, duty=0.6):
    # where a foot is (up, forward) at this point of its cycle, and how far through its lift (0 planted .. 1 top):
    # planted, it slides back under the body as the body passes over it (the world moves, the sprite does not)
    ph %= 1
    if ph < duty: return 0.0, stride / 2 - stride * ph / duty, 0.0
    q = (ph - duty) / (1 - duty); q2 = q * q * (3 - 2 * q); up = math.sin(math.pi * q)
    return lift * up, -stride / 2 + stride * q2, up
def stride_on(t, foot, stride, lift, sink, pole, crouch):
    # two feet on the ground by IK, a half cycle apart (each planted where it lands until it lifts), and the body
    # sinking as the feet change over (both down, legs bent) and rising over each planted foot, never quite to full
    # height (crouch: the legs keep slack to reach a foot planted ahead or behind)
    reach, level = {}, {}
    for side, ph in (('left', 0.0), ('right', 0.5)):
        up, z, u = step(t + ph, stride, lift)
        reach[f'{side}_{foot}'] = ('=', 1, (0, up, z)); level[f'{side}_{foot}'] = 30 * u
    rise = 0.5 * (1 + math.cos(4 * math.pi * (t - 0.3)))  # 1 over a planted foot (t 0.3, 0.8), 0 as they change
    return {'root': (0, -crouch - sink * (1 - rise), 0), 'reach': reach, 'level': level, 'pole': {f'{s}_{foot}': pole for s in ('left', 'right')}}
def walk(t):
    # upright strides on planted feet (stride_on): the body bobs down and up over them, sways toward the planted one,
    # the head going with it; the arms swing against the legs, the tail sways
    a = t * TAU; c = math.cos(a)
    return both(stride_on(t, 'foot', 0.16, 0.05, 0.035, (0, -0.3, 1), 0.02), {'origin': ('roll', 4 * S(a - 1.9)), 'spine_02': ('yaw', -6 * c),
                 'head': ('roll', -2 * S(a - 1.9)), 'tail_01': ('yaw', 10 * S(a - 0.8))},
                arm('right', -60, 20 + 30 * c, 0, 20), arm('left', -60, 20 - 30 * c, 0, 20))
def cyc(t, ks):
    # a value keyed round the cycle ([(t, v), ...] from t = 0, v a number or a tuple), eased from key to key, wrapping
    t %= 1; ks = ks + [(1, ks[0][1])]
    for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
        if t < t1:
            q = (t - t0) / (t1 - t0); q = q * q * (3 - 2 * q)
            return tuple(a + (b - a) * q for a, b in zip(v0, v1)) if isinstance(v0, tuple) else v0 + (v1 - v0) * q
# 잠영's dolphin kick, twice a cycle: (legs, knees, feet, hips, tail). From the glide (legs in line) the legs drift up, the
# knees drop and the shins fold up (cocked), then hips and legs snap down together in one frame, straight, the feet
# whipping and the tail lashing down after them, and glide again
KICK = [(0.0, (-12, 5, -40, 0, 0)), (0.25, (-28, 10, -45, -3, -8)), (0.48, (0, 75, -25, -8, -14)), (0.58, (25, 0, -70, 10, -4)),
        (0.68, (-5, 5, -50, 4, 20)), (0.85, (-12, 5, -40, 0, 0))]
def swim(t, f=0):
    # belly down, kicking: the body level, the head up to look ahead, the legs trailing and fluttering in turn, the arms trailing back
    # along the body (as a Naruto run) and swaying gently in turn. f blends to 잠영 (Shift, flat out): the arms closer in, the body
    # lower and in line, the flutter giving way to the dolphin kick (KICK). The head and the chest hold still; only the hips
    # (legs, tail, thigh shells) move.
    a = t * TAU; g = 1 - f
    kl, kk, kf, kh, kt = cyc(2 * t, KICK); kt2 = cyc(2 * t - 0.06, KICK)[4]
    flutter = lambda ph: g * (-30 + 25 * S(2 * a + ph)) + f * kl
    return both({'root': (0, 0.24, -0.2), 'origin': ('pitch', -72 - 8 * f), 'spine_02': ('pitch', 15), 'head': ('pitch', 40),
                 'hips': ('pitch', g * 2 * S(2 * a + 0.5) + f * kh),
                 'tail_01': ('pitch', 72 + g * 12 * S(2 * a + 1) + f * kt), 'tail_02': ('pitch', g * 12 * S(2 * a) + f * 1.3 * kt2)},
                leg('right', flutter(0), 5, 20 * g + kk * f, -40 * g + kf * f), leg('left', flutter(math.pi), 5, 20 * g + kk * f, -40 * g + kf * f),
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
    a = t * TAU
    return both(FLOAT_REST, {'root': (0, 0.05 + 0.012 * S(a), 0)}, leg('right', -20 + 15 * S(a), 5, 15 + 15 * S(a), -30),
                leg('left', -20 - 15 * S(a), 5, 15 - 15 * S(a), -30),
                arm('right', -30 - 8 * S(a), 25 + 15 * S(a), 0, 20), arm('left', -30 - 8 * S(a + math.pi), 25 + 15 * S(a + math.pi), 0, 20))


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
def iai(ks, hit):
    # the same cut used with the scalchops on the thighs: the paws snatch them off first and swing on into the wind-up
    # (the draw is the cut)
    first = next(t for t, _ in ks if t > 0)
    return [(0, ARMS_W), (first * 0.45, both(ARMS_W, thigh('right'), thigh('left'))), *((t, p) for t, p in ks if t > 0)]
def attack(fps, ks, hit, strikes, wait=False, cut=False, hit2=None, drawing=False):
    ks, warp = slowed(iai(ks, hit) if drawing else ks, strikes)
    return {**keys(fps, ks, hit=round(warp(hit), 3), wait=wait, base=WATER), **({'cut': True} if cut else {}),
            **({'hit2': round(warp(hit2), 3)} if hit2 is not None else {})}
def scaled(ks, k): return [(t * k, p) for t, p in ks]


def swing(side, el, az, at, elbow=10, twist=0): return both(arm(side, el, az, twist, elbow), held(side), blade(side, at))
def pair(el, az, at, elbow=10): return both(swing('right', el, az, at, elbow), swing('left', el, az, mirror(at), elbow))
def body(lean=0, turn=0, fwd=0, up=0):  # lean + tips forward, turn + toward the model's left, fwd / up metres
    return {'origin': [('pitch', -lean), ('yaw', turn)], 'root': (0, up, fwd)}
D = DRAWN
# The head is big: the scalchops are raised with the arms lifted out to the sides, leaning outward, clear of it.
UP = (-0.5, 0.8, -0.4)
# Every cut is thrown from the body: the wind-up draws the body back (leaning back, twisted away), the strike leads
# with the body (leaning in, turning into the cut, the weight moving forward) and the arms follow it through, the
# follow-through carries on past, and the body springs back a little before settling (the key after the strike).
# 내려찍기 (셸블레이드, 성스러운칼): both scalchops raised high at the sides, the body rearing back, then one heavy chop
# down together in front with the whole body falling into it
CHOP = [(0, D), (0.16, both(body(-18, 0, -0.04, 0.02), pair(60, -10, UP))), (0.22, both(body(-8, 0, -0.01, 0.02), pair(45, 30, (-0.3, 1, 0.2)))),
        (0.27, both(body(20, 0, 0.07), pair(5, 80, (0, -0.1, 1)))), (0.36, both(body(28, 0, 0.09, -0.02), pair(-40, 90, (0, -0.7, 1)))),
        (0.46, both(body(8, 0, 0.03), pair(-30, 85, (0, -0.6, 1)))), (0.62, D)]
# X자 베기 (시저크로스): both scalchops raised up and out, then brought down crossing in front in an X, the body behind it
X_CUT = [(0, D), (0.16, both(body(-16, 0, -0.03, 0.02), pair(60, 20, (-0.6, 0.8, 0.2)))), (0.22, both(body(-6, 0, 0, 0.02), pair(40, 60, (-0.3, 0.6, 0.8)))),
         (0.27, both(body(18, 0, 0.08), pair(0, 120, (0.5, -0.3, 1)))), (0.35, both(body(24, 0, 0.09, -0.02), pair(-30, 140, (0.7, -0.6, 0.5)))),
         (0.45, both(body(8, 0, 0.03), pair(-20, 130, (0.6, -0.5, 0.6)))), (0.62, D)]
# 연속 베기 (연속자르기): the right scalchop cuts down, then the left; the body twists away from each cut and swings
# into it, and the twist that ends one cut is the wind-up of the next
def cut_by(side, t0):
    o = other(side); sg = 1 if side == 'right' else -1; m = (lambda v: v) if side == 'right' else mirror
    return [(t0 + 0.12, both(body(-10, -22 * sg, -0.02), swing(side, 60, -10, m(UP)), garde(o))),
            (t0 + 0.2, both(body(14, 14 * sg, 0.05), swing(side, 0, 90, m((0, -0.2, 1))), garde(o))),
            (t0 + 0.26, both(body(16, 26 * sg, 0.05), swing(side, -40, 110, m((0.2, -0.8, 0.6))), garde(o)))]
FURY = [(0, D), *cut_by('right', 0), *cut_by('left', 0.2), (0.7, D)]
# 가로베기 (베어가르기): the body wound far round with both scalchops swung back on its right, then it unwinds in one
# wide sweep across, turning on past the front
SWEEP = [(0, D), (0.15, both(body(-6, -45, -0.02), swing('right', 10, -30, (-0.7, 0.1, -0.7)), swing('left', -20, 105, (-0.7, -0.1, -0.5), 40))),
         (0.21, both(body(2, -18, 0.03), swing('right', 5, 40, (-0.7, 0, 0.7)), swing('left', -10, 95, (-0.5, -0.1, 0.8), 30))),
         (0.26, both(body(8, 15, 0.06), swing('right', 0, 100, (0, -0.05, 1)), swing('left', 0, 70, (0.2, -0.1, 1)))),
         (0.34, both(body(10, 45, 0.06), swing('right', 0, 125, (0.8, 0, 0.5), 30), swing('left', 0, 10, (0.8, 0, 0.4)))),
         (0.44, both(body(4, 22, 0.03), swing('right', 0, 110, (0.6, 0, 0.7), 30), swing('left', 0, 30, (0.6, 0, 0.6)))), (0.6, D)]
# 올려베기 (깜짝베기, 에어슬래시): crouched low with both scalchops behind, then the body springs up and back, carrying
# one rising cut up and forward
RISE = [(0, D), (0.16, both(body(18, 0, -0.01, -0.05), pair(-50, 60, (0, -0.8, -0.5)))), (0.22, both(body(8, 0, 0.02, -0.02), pair(-20, 90, (0, -0.3, 1)))),
        (0.26, both(body(-12, 0, 0.04, 0.05), pair(30, 70, (0, 0.6, 1)))), (0.34, both(body(-18, 0, 0.03, 0.06), pair(55, 0, (-0.4, 1, -0.2)))),
        (0.44, both(body(-6, 0, 0.01, 0.02), pair(40, 20, (-0.3, 0.9, 0.2)))), (0.6, D)]
# 돌진 베기 (제비반환): gathered and twisted with both scalchops drawn back, then a lunge forward, the body unwinding
# as both slash through
LUNGE = {**leg('right', -35, 0, 20), **leg('left', -35, 0, 20)}
DASH_CUT = [(0, D), (0.16, both(body(-6, -25, -0.06, -0.02), pair(30, -40, (-0.3, 0.3, -1)))),
            (0.22, both(body(28, 0, 0.24), pair(10, 30, (-0.3, 0, 1)), LUNGE)), (0.28, both(body(28, 15, 0.33), pair(0, 110, (0.3, -0.1, 1)), LUNGE)),
            (0.36, both(body(18, 30, 0.31), pair(-20, 125, (0.8, -0.3, 0.4), 30))), (0.46, both(body(6, 12, 0.14), pair(-10, 110, (0.6, -0.2, 0.6), 30))), (0.64, D)]

BOTH = {  # everything with a sheathed and a drawn version; several moves share one motion (src/main.js MOVE_ANIM)
    'idle': loop(10, 16, lambda t: {'root': (0, 0.004 * S(t * TAU), 0), 'spine_02': ('pitch', 1.5 * S(t * TAU)),
        'head': ('pitch', 2 * S(t * TAU - 0.6)), 'tail_01': [('yaw', 6 * S(t * TAU + 1)), ('pitch', 3 * S(t * TAU))], **ARMS_L}),
    'walk': loop(14, 12, walk),
    # 헤엄 as a blend space over speed (src/main.js swimStroke): 물속 대기, halfway from it to swimming, swimming, halfway
    # to flat out, flat out. All share one 1.5 s cycle (float's 12 frames at 8 fps, the others' 18 at 12), so moving
    # from one to the next carries on from the same point in the stroke
    'float': loop(8, 12, tread), 'swim_slow': loop(12, 18, lambda t: mix(tread(t), swim(t), 0.5)),
    'swim': loop(12, 18, swim), 'swim_mid': loop(12, 18, lambda t: swim(t, 0.5)), 'swim_fast': loop(12, 18, lambda t: swim(t, 1)),
    # 돌진 (몸통박치기, 아쿠아제트, 드릴라이너, 메가혼, 파도타기): a headbutt. Drawn back with the chin tucked, then the
    # body thrown forward level and the head, in line with it, rammed in crown first (arms and legs swept back), driving on through the
    # impact, the head jolted back by it, and a recovery
    'dash': attack(30, [(0, ARMS_W), (0.08, both(body(-14, 0, -0.05, -0.02), {'head': ('pitch', -12), 'tail_01': ('pitch', -10)}, arm('right', -40, -30), arm('left', -40, -30))),
        (0.14, both(body(68, 0, 0.16, 0.08), {'head': ('pitch', -8), 'spine_02': ('pitch', 0), 'tail_01': ('pitch', 50)}, arm('right', -30, -70), arm('left', -30, -70),
                    leg('right', -40, 0, 10, -40), leg('left', -40, 0, 10, -40))),
        (0.2, both(body(72, 0, 0.21, 0.07), {'head': ('pitch', -12), 'spine_02': ('pitch', -3), 'tail_01': ('pitch', 58)}, arm('right', -30, -75), arm('left', -30, -75),
                   leg('right', -45, 0, 20, -45), leg('left', -45, 0, 20, -45))),
        (0.3, both(body(72, 0, 0.23, 0.07), {'head': ('pitch', -12), 'spine_02': ('pitch', -3), 'tail_01': ('pitch', 54)}, arm('right', -30, -75), arm('left', -30, -75),
                   leg('right', -42, 0, 15, -42), leg('left', -42, 0, 15, -42))),
        (0.4, both(body(70, 0, 0.23, 0.07), {'head': ('pitch', -10), 'spine_02': ('pitch', -2), 'tail_01': ('pitch', 50)}, arm('right', -30, -72), arm('left', -30, -72),
                   leg('right', -40, 0, 12, -40), leg('left', -40, 0, 12, -40))),
        (0.47, both(body(48, 0, 0.16, 0.08), {'head': ('pitch', 4), 'tail_01': ('pitch', 30)}, arm('right', -20, -50), arm('left', -20, -50),
                    leg('right', -25, 0, 10, -25), leg('left', -25, 0, 10, -25))),
        (0.58, both(ARMS_W, body(12, 0, 0.06))), (0.7, ARMS_W)], hit=0.16, strikes=[(0.08, 0.47)]),
    # 입에서 발사 (물대포, 물의파동, 하이드로캐논): the head drawn back and the chest filled, then the head thrust forward
    'shoot': attack(30, [(0, ARMS_W), (0.1, both(ARMS_W, {'head': ('pitch', 12), 'spine_02': ('pitch', 5), 'root': (0, 0, -0.02)})),
        (0.18, both({'head': ('pitch', 16), 'spine_02': ('pitch', 7), 'root': (0, 0, -0.03)}, arm('right', 0, 50, 0, 50), arm('left', 0, 50, 0, 50))),
        (0.24, both({'head': ('pitch', -14), 'spine_02': ('pitch', -8), 'root': (0, 0, 0.04)}, arm('right', -10, 30), arm('left', -10, 30))),
        (0.34, both(ARMS_W, {'head': ('pitch', -8), 'root': (0, 0, 0.03)})), (0.5, ARMS_W)], hit=0.24, strikes=[(0.18, 0.34)]),
    # 아쿠아테일: one slow full turn on the spot, the tail held out and whipping round (it ends at 360: back at 0 it would unwind)
    'tail': attack(30, [(0, ARMS_W), (0.14, {**ARMS_W, 'origin': [('pitch', -5), ('yaw', -40)], 'spine_01': ('pitch', -6), 'tail_01': [('pitch', -10), ('yaw', 35)], 'root': (0, -0.015, 0)}),
        (0.26, {**ARMS_W, 'origin': [('pitch', -7), ('yaw', -55)], 'spine_01': ('pitch', -8), 'tail_01': [('pitch', -12), ('yaw', 40)], 'root': (0, -0.02, 0)}),
        (0.3, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 20)], 'spine_01': ('pitch', 0), 'tail_01': [('pitch', 35), ('yaw', 20)]}),
        (0.34, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 120)], 'tail_01': [('pitch', 40), ('yaw', -30)], 'tail_02': ('yaw', -20)}),
        (0.38, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 230)], 'tail_01': [('pitch', 40), ('yaw', -40)], 'tail_02': ('yaw', -30), 'root': (0, 0.02, 0)}),
        (0.42, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 330)], 'tail_01': [('pitch', 35), ('yaw', -30)], 'tail_02': ('yaw', -20)}),
        (0.46, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 380)], 'tail_01': [('pitch', 15), ('yaw', -10)]}),
        (0.56, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 360)], 'tail_01': [('pitch', 5), ('yaw', -3)]}), (0.7, {**ARMS_W, 'origin': [('pitch', 0), ('yaw', 360)]})], hit=0.36, strikes=[(0.26, 0.46)]),
    # 하이드로펌프: braced, head thrust forward, the body shuddering with the recoil (loops while the jet runs)
    'pump': loop(16, 8, base=WATER, f=lambda t: both({'root': (0, -0.01, -0.008 - 0.008 * abs(S(t * TAU))), 'head': ('pitch', -12),
        'spine_02': ('pitch', -4 + (1 if t * 8 % 2 < 1 else 0)), 'tail_01': ('pitch', -6)}, arm('right', -10, 60, 0, 40), arm('left', -10, 60, 0, 40),
        leg('right', -10, 15, 10), leg('left', -10, 15, 10))),
    # after 하이드로캐논: slumped, head hanging, panting
    'recharge': loop(8, 12, lambda t: both({'root': (0, -0.02 - 0.006 * S(t * TAU), 0), 'spine_01': ('pitch', -8 + 2 * S(t * TAU)),
        'spine_02': ('pitch', -6), 'head': ('pitch', -16 + 3 * S(t * TAU)), 'tail_01': ('pitch', -8)}, arm('right', -75, 30, 0, 10), arm('left', -75, 30, 0, 10),
        leg('right', 10, 0, 20), leg('left', 10, 0, 20))),
    'hurt': keys(30, [(0, both({'origin': ('pitch', 12), 'root': (0, 0.01, -0.06), 'head': ('pitch', 10)}, arm('right', -20, -10), arm('left', -20, -10))),
        (0.1, {'origin': ('pitch', 7), 'root': (0, 0, -0.04), 'head': ('pitch', 6), **ARMS_L}), (0.25, ARMS_L)]),
    # 순간이동 (귀환, NPC에게, 포탈로): gathering itself before it vanishes: upright, head bowed, paws together before the
    # chest, legs drawn up, breathing slow and deep as it rises a little
    'focus': loop(8, 16, lambda t: both({'root': (0, 0.06 + 0.008 * S(t * TAU), 0), 'spine_01': ('pitch', -3 - 1.5 * S(t * TAU)),
        'head': ('pitch', -14 + 2 * S(t * TAU)), 'tail_01': ('pitch', -15)},
        arm('right', -25, 75, 0, 75), arm('left', -25, 75, 0, 75), leg('right', 40, 8, 60), leg('left', 40, 8, 60))),
}
SWORD = {  # motion: (keys, hit, strike windows, second hit) — the same moves as Samurott's, with both scalchops
    'chop': (CHOP, 0.27, [(0.22, 0.36)], None), 'x_cut': (X_CUT, 0.27, [(0.22, 0.35)], None),
    'fury': (FURY, 0.2, [(0.16, 0.26), (0.36, 0.46)], 0.4), 'sweep': (SWEEP, 0.26, [(0.21, 0.34)], None),
    'rise': (RISE, 0.26, [(0.22, 0.34)], None), 'dash_cut': (DASH_CUT, 0.28, [(0.2, 0.36)], None),
}
# 납도: the right paw sets its scalchop back on the right thigh, then the left
def sheathe_one(side, t0, rest, keep):
    return [(t0 + 0.14, both(rest, keep, garde(side))), (t0 + 0.24, both(rest, keep, garde(side), arm(side, -40, 40, 0, 30))),
            (t0 + 0.36, both(rest, keep, thigh(side), held(side))), (t0 + 0.44, both(rest, keep, thigh(side), {'carry': {f'{side}_feeler_a': 0}}))]
def sheathing(arms):
    return [(0, both(arms, DRAWN)), *sheathe_one('right', 0, arms, garde('left')), *sheathe_one('left', 0.44, arms, {}), (1.05, arms)]
def leaning(p):  # the body tipped well forward (a dive): its 'forward and up' points at the ground
    o = p.get('origin'); return sum(-d for ax, d in ([o] if o and isinstance(o[0], str) else o or []) if ax == 'pitch') > 40
def drawn(spec, hold=DRAWN):
    if 'pose' in spec: f = spec['pose']; return {**spec, 'pose': lambda t: both(f(t), hold)}
    return {**spec, 'keys': [(t, both(p, DRAWN_SWIM if leaning(p) else hold)) for t, p in spec['keys']]}
ANIMS = {
    **BOTH, **{f'{n}_drawn': drawn(s, SWIM_HOLD if n.startswith('swim') else DRAWN) for n, s in BOTH.items()},
    'sheathe': keys(24, sheathing(ARMS_L)), 'sheathe_swim': keys(24, sheathing(ARMS_W), base=WATER),
    **{n: attack(30, ks, hit=h, strikes=st, wait=True, cut=True, hit2=h2) for n, (ks, h, st, h2) in SWORD.items()},
    **{f'{n}_iai': attack(30, ks, hit=h, strikes=st, wait=True, cut=True, hit2=h2, drawing=True) for n, (ks, h, st, h2) in SWORD.items()},
    'fury_chain': attack(30, scaled(FURY, 0.75), hit=0.15, hit2=0.3, strikes=[(0.12, 0.2), (0.27, 0.35)], cut=True),
}
