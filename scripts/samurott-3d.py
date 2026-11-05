# Samurott's animations, posed on its Scarlet/Violet model (models/samurott, see scripts/dae2blend.py) and rendered by
# scripts/render3d.py, then turned into the game's pixel-art sheet by scripts/pixel3d.py:
#   blender -b models/samurott/samurott.blend -P scripts/render3d.py -- samurott [anim ...]
#   python scripts/pixel3d.py samurott            -> public/anim/samurott.png + src/anim/samurott.json
# The model's forelegs are arm_01 (shoulder to elbow), arm_02 (forearm, in the bracer), hand (paw). Each bracer's
# top shell with its spike is the seamitar (mesh sword_a, on feeler_b down the forearm); drawn, it is a long blade
# held in the paw (mesh sword_b, on the hand's feeler_a). Cutting moves cross-draw: the paws cross in an X, each
# takes the seamitar off the other foreleg (both sword_a vanish, both sword_b appear) and the draw is the cut.
import math

CANVAS = (240, 200)          # pixels per frame (drawn blades reach well forward)
ANCHOR = (96, 144)           # the ground under the body's centre lands here
LOOK = (0, 0.0, 0)           # that ground point, world metres
CAMERA = (45, 18)            # degrees round from the model's right side toward its front, and down
LIGHT = (0.14, -0.85, 0.8)  # toward the light (world): the upper right of the screen, a little in front
STEPS = ((0, 0.42), (0.3, 0.66), (0.6, 0.86), (0.88, 1.04))  # light steps: shadow, dim, half, lit
SPRITE = 'public/sprites/samurott.png'  # its palette is the sheet's
FAMILIES = None  # flatten the textures to these base colours (a list of RGB), or None for the model's own textures
LIFT = (0.92, 1.06)          # the colours lifted a little (whites stay white); the palette gets shadow shades: SHADOWS
SHADOWS = True
DESPECKLE = False           # clean lone dots out of the pixel art (pixel3d.despeckle)
ROOT_BONE = 'origin'
MOUTH_BONE = 'jaw'
# the body's solid parts that forelegs and blades must not go through (each carried by its first bone; see render3d.Collide)
SOLID = {'chest': ['spine_02', 'spine_01', 'waist'], 'neck': ['neck_01', 'neck_02'], 'head': ['head', 'jaw', 'hair'], 'horn': ['feeler']}
LIMBS = ['right_arm_02', 'right_hand', 'right_thumb', 'right_index', 'left_arm_02', 'left_hand', 'left_thumb', 'left_index']
BLADES = {'right': 'right_feeler_a_01', 'left': 'left_feeler_a_01'}  # the bone each paw's drawn blade rides on (X along it, Y to the edges)
BLADE_TIP = 1.2  # metres along it: where its tip's motion is measured
SWITCHED = ['left_sword_a', 'left_sword_b', 'right_sword_a', 'right_sword_b']
SHOWN = ['left_sword_a', 'right_sword_a']

# Standing (the model's rest pose has its legs spread out like an A and stands on its claw tips): legs drawn in under
# the body like pillars, the hind knees bent a little forward, the front paws straight in line with the leg and only
# their black claws bent forward flat on the ground, the hind feet (one bone, claws and all) bent just enough to
# stand; head carried high and a third bigger, like the Black/White sprite.
WRIST_FLAT = 0   # how far the front paws bend at the wrist (none: the blue paw stays straight)
CLAW = 80        # the front paws' black claws (index_01) bent forward to lie on the ground
WATER_CLAW = -40  # off the water poses' claws (half curled while the paws hang or paddle)
FOOT_FLAT = 20   # the hind feet bent to stand
BASE = {
    'spine_01': ('pitch', 3), 'neck_01': [('pitch', 14), ('yaw', 8)], 'head': [('pitch', -10), ('yaw', 10)], 'head@scale': 1.3,
    'tail_01': ('pitch', 14),
    'right_arm_01': [('roll', 18), ('pitch', -8)], 'left_arm_01': [('roll', -18), ('pitch', -8)],
    'right_arm_02': ('pitch', 10), 'left_arm_02': ('pitch', 10),
    'right_hand': ('pitch', WRIST_FLAT), 'left_hand': ('pitch', WRIST_FLAT), 'right_index_01': ('pitch', CLAW), 'left_index_01': ('pitch', CLAW),
    'right_leg_01': [('roll', 24), ('pitch', 14)], 'left_leg_01': [('roll', -24), ('pitch', 14)],
    'right_leg_02': ('pitch', -28), 'left_leg_02': ('pitch', -28),
    'right_foot': ('pitch', FOOT_FLAT), 'left_foot': ('pitch', FOOT_FLAT),
    'right_upper_eyelid_a_01': ('pitch', 25), 'left_upper_eyelid_a_01': ('pitch', 25),  # eyes wide open
    'right_lower_eyelid_a': ('pitch', -15), 'left_lower_eyelid_a': ('pitch', -15),
}

# Attacks are mostly used in the water, so they start and end floating as in 물속 대기 (the float loop's average pose):
# body raised, forelegs hanging forward, hind legs back, paws pointing down. Their poses are laid on this instead of
# the standing pose.
FLOAT_WRIST = 24 - WRIST_FLAT  # the floating paws hang 24 degrees off the leg in all
FLOAT_REST = {'root': (0, 0.05, 0), 'origin': ('pitch', 3), 'neck_01': ('pitch', 8),
              'right_arm_01': ('pitch', 25), 'left_arm_01': ('pitch', 25), 'right_arm_02': ('pitch', -9), 'left_arm_02': ('pitch', -9),
              'right_hand': ('pitch', FLOAT_WRIST), 'left_hand': ('pitch', FLOAT_WRIST),
              'right_index_01': ('pitch', WATER_CLAW), 'left_index_01': ('pitch', WATER_CLAW),
              'right_leg_01': ('pitch', -25), 'left_leg_01': ('pitch', -25), 'right_leg_02': ('pitch', 4), 'left_leg_02': ('pitch', 4),
              'right_foot': ('pitch', 41 - FOOT_FLAT), 'left_foot': ('pitch', 41 - FOOT_FLAT)}
def _turns(v): return [] if not v else [v] if isinstance(v[0], str) else list(v)
def added(a, b):  # pose b laid on pose a: turns follow a's, shifts add (as render3d.on_base does)
    out = dict(a)
    for k, v in b.items():
        out[k] = tuple(x + y for x, y in zip(a[k], v)) if k == 'root' and k in a else _turns(a[k]) + _turns(v) if k in a else v
    return out
WATER = added(BASE, FLOAT_REST)

S = math.sin; TAU = 2 * math.pi
def loop(fps, n, f, base=None): return {'fps': fps, 'n': n, 'pose': f, **({'base': base} if base else {})}
def keys(fps, ks, hit=None, wait=False, base=None):
    return {'fps': fps, 'keys': ks, **({'hit': hit} if hit is not None else {}), 'wait': wait, **({'base': base} if base else {})}


def rear(r, yaw=0, fwd=0.0):
    # the chest lifted r degrees off the forelegs onto the hind legs (which bend under it), turned yaw degrees toward
    # the model's left (- turns its chest toward the camera), shifted fwd metres forward
    return {'origin': ('yaw', yaw), 'spine_01': ('pitch', r), 'neck_01': ('pitch', -r * 0.6), 'right_leg_01': ('pitch', r * 0.8),
            'left_leg_01': ('pitch', r * 0.8), 'right_leg_02': ('pitch', -r * 0.4), 'left_leg_02': ('pitch', -r * 0.4),
            'tail_01': ('pitch', -r * 0.4), 'root': (0, -0.01 * r / 10, fwd - 0.04 * r / 30)}


# The seamitars. 'L' is the one on the left foreleg (drawn by the right paw: it shows as the blade in the right paw),
# 'R' the one on the right foreleg (drawn by the left paw). blade(side, k) has it out of its bracer and in the other
# paw, k of its blade showing (0.05 = just the hilt in the paw, 1 = all of it).
TAKES = {'L': ('right', 'left'), 'R': ('left', 'right')}  # seamitar: (paw that draws it, foreleg it sits on)
def blade(side, k):
    paw, leg = TAKES[side]
    return {'hide': [f'{leg}_sword_a'], 'show': [f'{paw}_sword_b'], f'{paw}_feeler_a_02@scale': (k, 1, 1)}
def both(*poses):  # merge poses: switches add up, per-paw settings (reach, aim, ...) merge, anything else from the later one
    out = {}
    for p in poses:
        for k, v in p.items():
            out[k] = list(out.get(k, [])) + list(v) if k in ('show', 'hide') else {**out.get(k, {}), **v} if k in ('reach', 'aim', 'point', 'level', 'pole') else v
    return out
def grab(side, k=1):  # the drawing paw onto the hilt (the top of the spike on the other foreleg)
    paw, leg = TAKES[side]
    return {'reach': {f'{paw}_hand': (f'{leg}_feeler_b_01', k, 0.6)}}


def arm(side, pitch, roll=0, fore=0, wrist=None, land=False):
    # a foreleg's pose by side ('right' / 'left'); roll + spreads it out to its own side, so it mirrors. The angles
    # are from the standing pose; poses laid on the floating pose (land=False) take its foreleg bend back out.
    sg = -1 if side == 'right' else 1; up, fo = (0, 0) if land else (FLOAT_REST['right_arm_01'][1], FLOAT_REST['right_arm_02'][1])
    p = {f'{side}_arm_01': [('pitch', pitch - up), ('roll', roll * sg)], f'{side}_arm_02': ('pitch', fore - fo)}
    if wrist: p[f'{side}_hand'] = [(a, d * (sg if a != 'pitch' else 1)) for a, d in wrist]
    return p
def other(side): return 'left' if side == 'right' else 'right'
def sword_of(paw): return 'L' if paw == 'right' else 'R'  # the seamitar a paw draws: the other foreleg's


def grip(p, land=False):  # the paw's claws closed round a hilt (70 degrees in all, on land or floating)
    return {f'{p}_index_01': ('pitch', 70 - CLAW - (0 if land else WATER_CLAW)), f'{p}_index_02': ('pitch', 60), f'{p}_thumb_01': ('pitch', -60), f'{p}_thumb_02': ('pitch', -50)}
def sheathed_aim(p, k=1):  # the held blade pointing down the other foreleg, the way it lies in the bracer
    return {'aim': {f'{p}_hand': (f'{p}_feeler_a_01', f'{other(p)}_hand', k)}}
def holding(p, k=1, land=False):  # the paw straightened to hold the blade (from flat on land, from hanging when floating)
    return both(blade(sword_of(p), k), grip(p, land), {f'{p}_hand': ('pitch', -WRIST_FLAT - (0 if land else FLOAT_WRIST))})


def shoulder(side, inward, fwd=0):  # a shoulder blade pushed in toward the chest's middle and forward
    return {f'{side}_shoulder': [('yaw', inward * (1 if side == 'right' else -1)), ('pitch', fwd)]}


# --- 발도 / 납도: the seamitars out or in -------------------------------------------------------------------------
# Samurott has two states. Sheathed (납도), both seamitars lie in the forelegs' bracers. Drawn (발도), both are out,
# one in each paw, their blades held pointing forward from the paws (the blade turns at the hilt, so a paw on the
# ground stays flat). The game draws when a sword move is used while sheathed, and sheathes after 10 s without moves;
# every animation that is not a draw, a sheathe or a sword move comes in both states ('<name>' and '<name>_drawn').
FORWARD = (0, -0.25, 1)  # where drawn blades point at rest: forward and a little down (model axes)
def point(side, k=1, at=FORWARD):  # a paw's drawn blade turned to point that way (with the body)
    return {'point': {f'{side}_feeler_a_01': (at, k)}}
def out(side, k=1, land=False):  # a paw holding the other foreleg's seamitar, blade all the way out, pointing forward
    return both(blade(sword_of(side), k), grip(side, land), point(side))
DRAWN = both(out('right', land=True), out('left', land=True))
DOWNWARD = (0, -0.4, 1)  # in the water the blades point lower, clear of the head as the forelegs stroke
DRAWN_WATER = both(out('right'), out('left'), point('right', 1, DOWNWARD), point('left', 1, DOWNWARD))
# in 잠영 the blades trail back along the flanks, clear of the forelegs pressed back (평영 strokes with them pointing low, as DRAWN_WATER)
DRAWN_SWIM = both(out('right'), out('left'), point('right', 1, (-0.2, 0.1, -1)), point('left', 1, (0.2, 0.1, -1)))
def hind_down(): return {'reach': {f: ('=', 1, (0, 0, 0)) for f in ('right_foot', 'left_foot')}, 'level': {'right_foot': 0, 'left_foot': 0}}


# One paw putting its blade back (the draw run backwards): blade raised and turned back down toward the bracer, the
# hilt set on it, the blade sliding in until only the hilt shows, let go (the shell is whole again), the leg back down.
def sheathe_one(p, t0, land, keep=None):
    o = other(p); sw = sword_of(p); keep = keep or {}; L = land
    under = both(keep, hind_down()) if land else keep
    put = both(under, rear(12), arm(o, 25, -40, 0, land=L), shoulder(o, 25, 10), arm(p, 60, -10, 60, land=L), shoulder(p, 20),
               {'reach': {f'{p}_hand': (f'{TAKES[sw][1]}_feeler_b_01', 1, 0.05 if land else 0.2), **under.get('reach', {})}, 'pole': {f'{p}_hand': (0, -0.5, 1)}})
    rest = {'reach': {f'{p}_hand': ('=', 1, (0, 0, 0)), **under.get('reach', {})}, 'level': {f'{p}_hand': 0, **under.get('level', {})}} if land else {}
    return [
        (t0 + 0.12, both(under, rear(8), arm(o, 20, -30, 0, land=L), shoulder(o, 15, 10), arm(p, 70, 30, 40, land=L), shoulder(p, 15),
                         holding(p, 0.8, land=L), sheathed_aim(p, 0.5))),
        (t0 + 0.22, both(put, holding(p, 0.5, land=L), sheathed_aim(p))), (t0 + 0.3, both(put, holding(p, 0.05, land=L), sheathed_aim(p))),
        (t0 + 0.34, put), (t0 + 0.48, both(under, rear(2), rest)),
    ]
# 납도: the right paw puts the left foreleg's seamitar back first, then the left paw the right one; on land and in water.
def sheathing(land):
    return [(0, DRAWN if land else DRAWN_WATER), *sheathe_one('right', 0, land, keep=out('left', land=land)), *sheathe_one('left', 0.5, land), (1.1, {})]


# Sword moves, with both blades. They swing the forelegs; the paws straighten to hold the blades (held), the blades
# ride with them (no 'point') and lead with the edge (render3d.Edge). Each starts and ends drawn; used sheathed, the
# game plays its '_iai' version, where the blades come out of the paws during the wind-up (see iai below).
def held(side, k=1): return both(holding(side, k), point(side, 0))
def swing(side, pitch, roll=0, fore=0): return both(arm(side, pitch, roll, fore), held(side))
def pair(pitch, roll=0, fore=0): return both(swing('right', pitch, roll, fore), swing('left', pitch, roll, fore))
DW = DRAWN_WATER
# Every cut is thrown from the body: the wind-up gathers it (rearing up onto the hind legs, drawn back, twisted away),
# the strike leads with it (the chest dropping and lunging forward, turning into the cut) and the forelegs follow it
# through, the follow-through carries on past, and the body springs back a little before settling.
# 내려찍기 (셸블레이드, 성스러운칼): both blades raised together as the body rears, then one heavy chop down side by side
# with the chest slamming down and forward behind it
RAZOR = [(0, DW), (0.16, both(rear(24, 0, -0.04), pair(115, 15, 40))), (0.22, both(rear(14, 0, 0.03), pair(80, 5, 20))),
         (0.27, both(rear(-4, 0, 0.17), pair(35, 0, 0))), (0.36, both(rear(-8, 0, 0.19), pair(15, -5, -10))),
         (0.46, both(rear(2, 0, 0.09), pair(25, 0, 0))), (0.62, DW)]
# X자 베기 (시저크로스): both forelegs rise up and out as the body rears, then come down crossing so the blades cut an X
X_CUT = [(0, DW), (0.16, both(rear(22, 0, -0.03), pair(105, 40, 40))), (0.22, both(rear(14, 0, 0.04), pair(85, 20, 20))),
         (0.27, both(rear(-2, 0, 0.15), pair(50, -20, 0))), (0.35, both(rear(-6, 0, 0.16), pair(25, -35, -10))),
         (0.45, both(rear(2, 0, 0.07), pair(35, -25, 0))), (0.62, DW)]
# 연속 베기 (연속자르기): the right blade cuts down, then the left; the body twists away from each cut and swings into
# it, and the twist that ends one cut is the wind-up of the next
def cut_by(side, t0):
    o = other(side); sg = 1 if side == 'right' else -1
    return [(t0 + 0.12, both(rear(14, -18 * sg, -0.02), swing(side, 110, 30, 40), out(o))),
            (t0 + 0.2, both(rear(-2, 10 * sg, 0.1), swing(side, 50, 50, 0), out(o))),
            (t0 + 0.26, both(rear(-4, 18 * sg, 0.1), swing(side, 25, 65, -10), out(o)))]
FURY = [(0, DW), *cut_by('right', 0), *cut_by('left', 0.2), (0.7, DW)]
# 돌진 베기 (제비반환): both blades swept back as the body gathers, twisted, then a long dash unwinding as both swing through
LEGS_BACK = {'right_leg_01': ('pitch', -30), 'left_leg_01': ('pitch', -30)}
ACE = [(0, DW), (0.16, both(rear(12, 18, -0.08), pair(-20, 30, 10))), (0.22, both(rear(-6, 0, 0.34), pair(40, 10, 0), LEGS_BACK)),
       (0.28, both(rear(-6, -12, 0.46), pair(85, -10, 10), LEGS_BACK)), (0.36, both(rear(-2, -22, 0.42), pair(60, -25, 0))),
       (0.46, both(rear(2, -8, 0.2), pair(45, -15, 0))), (0.64, DW)]
# 가로베기 (베어가르기): the body wound far round with both blades swung out to the side, then it unwinds in one wide
# sweep across the front, turning on past it
SLASH = [(0, DW), (0.15, both(rear(8, 35, -0.02), pair(30, 70, 10))), (0.21, both(rear(4, 8, 0.07), pair(60, 30, 0))),
         (0.26, both(rear(0, -30, 0.12), pair(75, -30, 0))), (0.34, both(rear(-2, -42, 0.12), pair(60, -50, -10))),
         (0.44, both(rear(2, -20, 0.06), pair(55, -35, 0))), (0.6, DW)]
# 올려베기 (깜짝베기, 에어슬래시): crouched with the blades low and back, then the body springs up, carrying one rising
# cut up and forward
AIR = [(0, DW), (0.16, both(rear(-6, 0, -0.03), pair(-5, 30, 30))), (0.22, both(rear(8, 0, 0.05), pair(70, 15, 10))),
       (0.26, both(rear(20, 0, 0.09), pair(120, 10, 20))), (0.34, both(rear(24, 0, 0.04), pair(135, 20, 30))),
       (0.44, both(rear(10, 0, 0.02), pair(110, 15, 20))), (0.6, DW)]

def iai(ks, hit):
    # the same cut used with the blades in: it starts sheathed and the blades grow out of the paws through the
    # wind-up (the draw is the cut)
    out_ = []
    for t, p in ks:
        if t == 0: out_.append((0, {})); continue
        k = max(0.05, min(1.0, t / (hit * 0.85)))
        out_.append((t, both(p, {f'{s_}_feeler_a_02@scale': (k, 1, 1) for s_ in ('right', 'left')}) if k < 1 else p))
    return out_


def scaled(ks, k): return [(t * k, p) for t, p in ks]


# Wind-ups and recoveries play slower so they read (grabbing the hilt, drawing, sheathing, gathering, settling); the
# strikes themselves (`strikes`: (from, to) seconds of the keys as written) keep their speed. The hit moves with them.
SLOW = 1.7
def slowed(ks, strikes, hit, k=SLOW):
    def warp(t):
        out_, last = 0.0, 0.0
        for a, b in sorted(strikes):
            if t <= a: return out_ + (t - last) * k
            out_ += (a - last) * k
            if t <= b: return out_ + (t - a)
            out_ += b - a; last = b
        return out_ + (t - last) * k
    return [(warp(t), p) for t, p in ks], warp
def attack(fps, ks, hit, strikes, wait=False, cut=False, hit2=None, drawing=False):
    # an attack, slowed outside its strikes, on the floating pose; hit2: a second strike that lands too (연속자르기);
    # drawing: the iai version (from sheathed)
    ks, warp = slowed(iai(ks, hit) if drawing else ks, strikes, hit)
    return {**keys(fps, ks, hit=round(warp(hit), 3), wait=wait, base=WATER), **({'cut': True} if cut else {}),
            **({'hit2': round(warp(hit2), 3)} if hit2 is not None else {})}
def drawn(spec, water=False):
    # the same animation with both seamitars out, pointing forward (lower in the water): keyed poses get the blades
    # laid over them, looping ones are wrapped. Paddling ('paddle') the blades point low ahead only partway (0.6), so
    # they swing with the paddling paws rather than holding one direction while the forelegs move under them.
    paddling = both(out('right'), out('left'), point('right', 0.6, DOWNWARD), point('left', 0.6, DOWNWARD))
    hold = {'swim': DRAWN_SWIM, 'paddle': paddling}.get(water, DRAWN_WATER) if water else DRAWN
    if 'pose' in spec: f = spec['pose']; return {**spec, 'pose': lambda t: both(f(t), hold)}
    return {**spec, 'keys': [(t, both(p, hold)) for t, p in spec['keys']]}


# On land the paws are flat on the ground: each is held where it stands by IK (elbows bent back, hind knees forward),
# turned flat as in the standing pose. Walking is a four-beat walk like a big cat's (left hind, left fore, right hind,
# right fore, a quarter cycle apart): a paw stays planted while the body passes over it, then lifts, curling back,
# and swings forward to plant again; the body rolls a little toward the planted side and bobs, the head nods.
PAWS = {'left_foot': 0.0, 'left_hand': 0.25, 'right_foot': 0.5, 'right_hand': 0.75}
POLES = {'right_hand': (0, -0.3, -1), 'left_hand': (0, -0.3, -1), 'right_foot': (0, -0.3, 1), 'left_foot': (0, -0.3, 1)}
PLANTED = {'reach': {paw: ('=', 1, (0, 0, 0)) for paw in PAWS}, 'pole': POLES, 'level': {paw: 0 for paw in PAWS}}
def step(ph, stride, lift, duty=0.65):
    # where a paw is (forward, up) at this point of its cycle, and how far through its lift (0 planted .. 1 top)
    ph %= 1
    if ph < duty: return 0.0, stride / 2 - stride * ph / duty, 0.0  # planted, passing back under the body
    q = (ph - duty) / (1 - duty); q2 = q * q * (3 - 2 * q); up = math.sin(math.pi * q)
    return lift * up, -stride / 2 + stride * q2, up
def walk(t):
    reach, level = {}, {}
    for paw, ph in PAWS.items():
        fore = 'hand' in paw; y, z, up = step(t + ph, 0.26, 0.06 if fore else 0.05)
        reach[paw] = ('=', 1, (0, y, z)); level[paw] = (60 if fore else 35) * up
    # the body sinks about 2 px as a hind paw plants (t = 0, 0.5) and rises again as it passes over the planted paws, the
    # neck dipping with it so the head rides the body; the paws stay where they are planted (the '=' reaches)
    sink = 0.5 + 0.5 * math.cos(2 * t * TAU)  # 1 at a hind paw's plant, 0 between
    return {'root': (0, -0.04 * sink, 0), 'spine_01': [('roll', 1.5 * S(t * TAU)), ('pitch', 0.6 * S(2 * t * TAU))],
            'neck_01': ('pitch', -2.5 * sink), 'tail_01': ('yaw', 6 * S(t * TAU)), 'tail_02': ('yaw', 5 * S(t * TAU - 0.8)),
            'reach': reach, 'pole': POLES, 'level': level}
def paddle(t, k, rise, f=0):
    # dog paddle: the forelegs take turns reaching forward and pulling down and back, curling the paw on the way
    # forward; the hind legs kick in turn; the body floats level, the tail sweeps. f blends toward swimming flat out
    # (Shift): bigger, longer strokes and kicks, the body stretched level with the hind legs trailing, head low and
    # forward, the tail sweeping wider
    k *= 1 + 0.4 * f
    o = {'root': (0, rise + 0.01 * S(t * TAU), 0.03 * f), 'origin': ('pitch', 3 - 5 * f + 1.5 * S(2 * t * TAU)),
         'neck_01': ('pitch', 8 - 8 * f - 2 * S(2 * t * TAU)), 'tail_01': ('yaw', (12 + 10 * f) * S(t * TAU - 0.8)), 'tail_02': ('yaw', (10 + 8 * f) * S(t * TAU - 1.6))}
    for side, ph in (('right', 0.0), ('left', 0.5)):
        a = (t + ph) * TAU
        o[f'{side}_arm_01'] = ('pitch', 25 + 10 * f + 35 * k * S(a)); o[f'{side}_arm_02'] = ('pitch', -45 * k * (0.5 + 0.5 * math.cos(a)))
        o[f'{side}_hand'] = ('pitch', 30 - WRIST_FLAT - 30 * k * (0.5 + 0.5 * math.cos(a)))  # 30 degrees off the leg, curling
        o[f'{side}_index_01'] = ('pitch', WATER_CLAW)
        b = a + math.pi / 2
        o[f'{side}_leg_01'] = ('pitch', -25 - 15 * f + 22 * k * S(b)); o[f'{side}_leg_02'] = ('pitch', 20 * k * (0.5 + 0.5 * math.cos(b)))
        o[f'{side}_foot'] = ('pitch', 45 - FOOT_FLAT - 20 * k * (0.5 + 0.5 * math.cos(b)))
    return o
def cyc(t, ks):
    # a value keyed round the cycle ([(t, v), ...] from t = 0, v a number or a tuple), eased from key to key, wrapping
    t %= 1; ks = ks + [(1, ks[0][1])]
    for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
        if t < t1:
            q = (t - t0) / (t1 - t0); q = q * q * (3 - 2 * q)
            return tuple(a + (b - a) * q for a, b in zip(v0, v1)) if isinstance(v0, tuple) else v0 + (v1 - v0) * q
# 잠영's dolphin kick, once a cycle: (hip, knee, foot, hips, tail, forward). From the glide (hind legs straight back in line)
# the legs drift up, the knees drop and the shins fold up (cocked), then hips and legs snap down together in one frame,
# straight, the feet whipping and the tail lashing down after them, the body surging forward, and glide again
KICK = [(0.0, (-85, 20, -75, 0, 0, 0.05)), (0.25, (-92, 5, -80, -3, -4, 0.05)), (0.48, (-78, -55, -95, -6, -10, 0.04)),
        (0.58, (-62, 25, -50, 8, 6, 0.07)), (0.68, (-80, 25, -70, 3, 14, 0.075)), (0.85, (-86, 20, -76, 0, 2, 0.06))]
def dive(t):
    # 빠른 헤엄 = 잠영 (Shift, flat out): the body one straight line, the head lowered in line with it, the forelegs
    # pressed back along the belly, the hind legs straight back together beating the dolphin kick (KICK)
    l1, l2, foot, hips, t1, z = cyc(t, KICK); t2 = 1.2 * cyc(t - 0.06, KICK)[4]
    o = {'root': (0, 0.07, z), **{b: ('pitch', d) for b, d in (('origin', -5), ('spine_01', 0), ('neck_01', -18), ('neck_02', -6), ('head', 4),
                                                                 ('hips', hips), ('tail_01', t1), ('tail_02', t2))}}
    for side in ('right', 'left'):
        o[f'{side}_shoulder'] = ('pitch', 0)
        o[f'{side}_arm_01'] = [('pitch', -80), ('roll', 0)]; o[f'{side}_arm_02'] = ('pitch', -10)
        o[f'{side}_hand'] = ('pitch', -20 - WRIST_FLAT); o[f'{side}_index_01'] = ('pitch', WATER_CLAW)
        o[f'{side}_leg_01'] = [('pitch', l1), ('roll', 0)]; o[f'{side}_leg_02'] = ('pitch', l2)
        o[f'{side}_foot'] = ('pitch', foot - FOOT_FLAT)
    return o
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
BRACED = {**arm('right', -10, 0, 0), **arm('left', 10, 0, 0), 'right_leg_01': ('pitch', -12), 'left_leg_01': ('pitch', -12)}


BOTH = {  # everything that has a sheathed and a drawn version; several moves share one motion (src/main.js MOVE_ANIM)
    # breathing: the chest rises and falls, the head bobs, the tail drifts; the paws stay put
    'idle': loop(10, 16, lambda t: {'root': (0, 0.006 * S(t * TAU), 0), 'spine_01': ('pitch', 1.2 * S(t * TAU)),
        'neck_01': ('pitch', 1.5 * S(t * TAU - 0.6)), 'tail_01': [('yaw', 5 * S(t * TAU + 1)), ('pitch', 2 * S(t * TAU))], **PLANTED}),
    'walk': loop(14, 12, walk),
    # 헤엄 as a blend space over speed (src/main.js swimStroke): 물속 대기 (a gentle paddle), a slow paddle, the dog
    # paddle, one halfway to 잠영, and 잠영. All share one 1.5 s cycle (float's 12 frames at 8 fps, the others' 18 at
    # 12), so moving from one to the next carries on from the same point in the stroke
    'float': loop(8, 12, lambda t: paddle(t, 0.4, 0.05)), 'swim_slow': loop(12, 18, lambda t: paddle(t, 0.7, 0.06)),
    'swim': loop(12, 18, lambda t: paddle(t, 1, 0.07)), 'swim_mid': loop(12, 18, lambda t: mix(paddle(t, 1, 0.07), dive(t), 0.5)),
    'swim_fast': loop(12, 18, dive),
    # 돌진 (몸통박치기, 아쿠아제트, 드릴라이너, 메가혼, 파도타기; the effects tell them apart): a ram with the horn on
    # its brow. A short gather with the head up, then the whole body thrown forward with the head lowered until the horn
    # points straight ahead, level with the way it charges (measured on the model), legs swept back; held there through the whole charge (a good third of the
    # motion, so the ram reads), then the head jolted back up by the impact, and a recovery
    'dash': attack(30, [(0, {}), (0.08, {'root': (0, -0.04, -0.07), 'origin': ('pitch', 8), 'neck_01': ('pitch', 14), 'head': ('pitch', 6)}),
        (0.14, {'root': (0, -0.01, 0.12), 'origin': ('pitch', -14), 'neck_01': ('pitch', -33), 'head': ('pitch', -13), **arm('right', -40), **arm('left', -40),
                'right_leg_01': ('pitch', -36), 'left_leg_01': ('pitch', -36), 'tail_01': ('pitch', 8)}),
        (0.2, {'root': (0, -0.015, 0.19), 'origin': ('pitch', -16), 'neck_01': ('pitch', -34), 'head': ('pitch', -12), **arm('right', -45), **arm('left', -45),
                'right_leg_01': ('pitch', -40), 'left_leg_01': ('pitch', -40), 'tail_01': ('pitch', 14)}),
        (0.3, {'root': (0, -0.015, 0.22), 'origin': ('pitch', -16), 'neck_01': ('pitch', -34), 'head': ('pitch', -12), **arm('right', -45), **arm('left', -45),
                'right_leg_01': ('pitch', -40), 'left_leg_01': ('pitch', -40), 'tail_01': ('pitch', 12)}),
        (0.4, {'root': (0, -0.01, 0.22), 'origin': ('pitch', -13), 'neck_01': ('pitch', -32), 'head': ('pitch', -12), **arm('right', -42), **arm('left', -42),
                'right_leg_01': ('pitch', -37), 'left_leg_01': ('pitch', -37), 'tail_01': ('pitch', 10)}),
        (0.47, {'root': (0, 0.0, 0.16), 'origin': ('pitch', -2), 'neck_01': ('pitch', -2), 'head': ('pitch', 4), **arm('right', -20), **arm('left', -20),
                'right_leg_01': ('pitch', -22), 'left_leg_01': ('pitch', -22)}),
        (0.58, {'root': (0, 0, 0.05), 'origin': ('pitch', -2)}), (0.7, {})], hit=0.16, strikes=[(0.08, 0.47)]),
    # 입에서 발사 (물대포, 물의파동, 하이드로캐논): the head drawn back and the chest gathered, then a push of head and forelegs
    'shoot': attack(30, [(0, {}), (0.1, {'neck_01': ('pitch', 10), 'spine_01': ('pitch', 4), 'root': (0, 0, -0.03)}),
        (0.18, {'neck_01': ('pitch', 14), 'spine_01': ('pitch', 6), 'root': (0, 0, -0.04), **arm('right', 40, 10, 30), **arm('left', 40, 10, 30)}),
        (0.24, {'neck_01': ('pitch', -12), 'head': ('pitch', -8), 'jaw': ('pitch', -22), 'spine_01': ('pitch', -4), 'root': (0, 0, 0.05),
                **arm('right', 10, 30, -10), **arm('left', 10, 30, -10)}),
        (0.34, {'neck_01': ('pitch', -8), 'jaw': ('pitch', -14), 'root': (0, 0, 0.04)}), (0.5, {})], hit=0.24, strikes=[(0.18, 0.34)]),
    # 아쿠아테일: one slow full turn on the spot, the tail held out and whipping round (it ends at 360: back at 0 it would unwind)
    'tail': attack(30, [(0, {}), (0.14, {'origin': [('pitch', -4), ('yaw', -40)], 'neck_01': ('pitch', -6), 'tail_01': [('pitch', -8), ('yaw', 35)], 'root': (0, -0.03, 0)}),
        (0.26, {'origin': [('pitch', -6), ('yaw', -55)], 'neck_01': ('pitch', -8), 'tail_01': [('pitch', -10), ('yaw', 40)], 'root': (0, -0.04, 0)}),
        (0.3, {'origin': [('pitch', 0), ('yaw', 20)], 'neck_01': ('pitch', 0), 'tail_01': [('pitch', 20), ('yaw', 20)]}),
        (0.34, {'origin': [('pitch', 0), ('yaw', 120)], 'tail_01': [('pitch', 25), ('yaw', -30)], 'tail_02': ('yaw', -20)}),
        (0.38, {'origin': [('pitch', 0), ('yaw', 230)], 'tail_01': [('pitch', 25), ('yaw', -40)], 'tail_02': ('yaw', -30), 'root': (0, 0.02, 0)}),
        (0.42, {'origin': [('pitch', 0), ('yaw', 330)], 'tail_01': [('pitch', 20), ('yaw', -30)], 'tail_02': ('yaw', -20)}),
        (0.46, {'origin': [('pitch', 0), ('yaw', 380)], 'tail_01': [('pitch', 10), ('yaw', -10)]}),
        (0.56, {'origin': [('pitch', 0), ('yaw', 360)], 'tail_01': [('pitch', 3), ('yaw', -3)]}), (0.7, {'origin': [('pitch', 0), ('yaw', 360)]})], hit=0.36, strikes=[(0.26, 0.46)]),
    # 하이드로펌프: braced, head thrust forward, the body shuddering with the recoil (loops while the jet runs)
    'pump': loop(16, 8, base=WATER, f=lambda t: {'root': (0, -0.02, -0.01 - 0.01 * abs(S(t * TAU))), 'origin': ('pitch', 3),
        'neck_01': ('pitch', -10), 'head': ('pitch', -4 + (1 if t * 8 % 2 < 1 else 0)), 'jaw': ('pitch', -18), 'tail_01': ('pitch', -6), **BRACED}),
    # after 하이드로캐논 the user must recharge: head hanging, heavy breathing
    'recharge': loop(8, 12, lambda t: {'root': (0, -0.03 - 0.008 * S(t * TAU), 0), 'spine_01': ('pitch', -4 + 1.5 * S(t * TAU)),
        'neck_01': ('pitch', -18 + 3 * S(t * TAU)), 'head': ('pitch', -6), 'tail_01': ('pitch', -12), **PLANTED}),
    'hurt': keys(30, [(0, {'origin': ('pitch', 10), 'root': (0, 0.01, -0.08), 'neck_01': ('pitch', 12)}),
        (0.1, {'origin': ('pitch', 6), 'root': (0, 0, -0.05), 'neck_01': ('pitch', 8)}), (0.25, {})]),
    # 순간이동 (귀환, NPC에게, 포탈로): gathering itself before it vanishes: still in the water, head bowed low, forelegs
    # drawn in under the chest and the hind legs tucked, breathing slow and deep
    'focus': loop(8, 16, base=WATER, f=lambda t: {'root': (0, 0.02 + 0.01 * S(t * TAU), 0), 'spine_01': ('pitch', -1.5 * S(t * TAU)),
        'neck_01': ('pitch', -16 + 2 * S(t * TAU)), 'head': ('pitch', -6), 'tail_01': ('pitch', -10),
        **arm('right', 5, -8, -50), **arm('left', 5, -8, -50),
        'right_leg_01': ('pitch', 30), 'left_leg_01': ('pitch', 30), 'right_leg_02': ('pitch', 30), 'left_leg_02': ('pitch', 30)}),
}

SWORD = {  # motion: (keys, hit, strike windows, second hit) — 내려찍기 셸블레이드·성스러운칼, X자 시저크로스, 연속 연속자르기,
    # 가로베기 베어가르기, 올려베기 깜짝베기·에어슬래시, 돌진 베기 제비반환
    'chop': (RAZOR, 0.27, [(0.22, 0.36)], None), 'x_cut': (X_CUT, 0.27, [(0.22, 0.35)], None),
    'fury': (FURY, 0.2, [(0.16, 0.26), (0.36, 0.46)], 0.4), 'sweep': (SLASH, 0.26, [(0.21, 0.34)], None),
    'rise': (AIR, 0.26, [(0.22, 0.34)], None), 'dash_cut': (ACE, 0.28, [(0.2, 0.36)], None),
}
ANIMS = {
    **BOTH, **{f'{name}_drawn': drawn(spec, water='swim' if name == 'swim_fast' else 'paddle' if name in ('float', 'swim_slow', 'swim', 'swim_mid') else name not in ('idle', 'walk', 'recharge', 'hurt')) for name, spec in BOTH.items()},
    # 납도 on land and in the water (the game faces it the way the player moves)
    'sheathe': keys(24, scaled(sheathing(True), 0.9)), 'sheathe_swim': keys(24, scaled(sheathing(False), 0.9), base=WATER),
    # the sword moves with both blades: from drawn, and from sheathed drawing as they cut ('_iai'); both end drawn
    **{n: attack(30, ks, hit=h, strikes=st, wait=True, cut=True, hit2=h2) for n, (ks, h, st, h2) in SWORD.items()},
    **{f'{n}_iai': attack(30, ks, hit=h, strikes=st, wait=True, cut=True, hit2=h2, drawing=True) for n, (ks, h, st, h2) in SWORD.items()},
    'fury_chain': attack(30, scaled(FURY, 0.75), hit=0.15, hit2=0.3, strikes=[(0.12, 0.2), (0.27, 0.35)], cut=True),
}
