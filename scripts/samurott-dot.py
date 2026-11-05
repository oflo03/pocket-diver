# Samurott animation sheet from its game sprite (public/sprites/samurott.png, the Black/White dot sprite), skinned
# on its own pixel grid by scripts/dotsprite.py:
#   python scripts/samurott-dot.py              -> public/anim/samurott.png + src/anim/samurott.json
#   python scripts/samurott-dot.py preview DIR  -> DIR/samurott-preview.png
# Coordinates are pixels of the sprite mirrored to face right (78x80).
# Two seamitars, one in each foreleg's bracer. Cutting moves draw both iaido-style: the paws cross in an X, the near
# (right) paw taking the far (left) leg's blade and the far paw the near leg's, and the draw itself is the cut; then
# they sheathe them the same way. Every other move leaves them in place.
import math, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dotsprite

NAME = 'samurott'
SRC = 'public/sprites/samurott.png'
MIRROR = True
PAD = (40, 46, 96, 44)  # room left, top, right, bottom for lunges, raised blades and the tail swing
PARTS = {
    # name: (polygon, pivot, a point down the limb (its axis), joint blend in px each side of the pivot)
    # each polygon reaches a little past the joint into the body, so the blend there bends instead of tearing
    'tail': ([(0, 32), (9, 30), (13, 30), (19, 35), (25, 32), (30, 35), (30, 46), (20, 46), (8, 43), (0, 38)], (25, 40), (5, 36), 3),
    'head': ([(26, 24), (34, 16), (42, 11), (50, 12), (62, 5), (76, -1), (78, 3), (71, 14), (77, 17), (78, 30), (69, 33),
              (69, 38), (62, 44), (44, 45), (36, 42), (27, 33)], (49, 42), (60, 20), 3),
    'hind': ([(10, 48), (20, 43), (28, 50), (25, 62), (21, 70), (15, 74), (13, 77), (5, 77), (5, 72), (9, 68), (10, 58)], (21, 52), (10, 74), 3),
    # the far (left) foreleg, cut along the belly's outline (x 58 and the diagonal under it): blue and shadowed leg,
    # the ridge down its back, the paw; it turns as one rigid piece about the top of its shoulder
    'front_far': ([(60, 44), (64, 44), (67, 50), (69, 55), (72, 62), (74, 68), (78, 72), (78, 77), (63, 77), (62, 74),
                   (58, 70), (54, 66), (53, 64), (56, 60), (59, 57), (59, 50)], (61, 47), (71, 72), 0.6),
    'front_near': ([(29, 44), (37, 43), (43, 48), (45, 57), (42, 66), (38, 72), (36, 76), (35, 80), (22, 80), (23, 75), (26, 70),
                    (27, 61), (28, 52)], (39, 51), (30, 77), 0.6),
    # the far (left) hind leg: the dark leg under the belly's bottom outline (row 65), with its paw
    'hind_far': ([(40, 66), (53, 66), (53, 73), (40, 73)], (46, 66), (47, 72), 0.6),
}
ORDER = ['tail', 'hind', 'hind_far', 'front_far', 'body', 'head', 'front_near']  # back to front
# the forelegs' shoulders (centre, radius, the leg's blue, outlined?): the far one sits behind the body, the near one's
# has no outline so it melts into the chest when the leg is at rest
CAPS = {'front_far': ((61, 56), 4, (33, 57, 99), True), 'hind_far': ((46, 66), 3, (16, 33, 74), True),
        'front_near': ((39, 51), 5, (33, 90, 156), False)}
TORSO_FILL = [(18, 40), (30, 36), (50, 40), (60, 44), (62, 52), (58, 64), (48, 68), (36, 70), (26, 68), (18, 60), (16, 50)]
TORSO = (40, 56)   # whole-body turns go around here
GROUND = 80        # feet line (under the near paw)
MOUTH = (68, 29)

PALE, CREAM, TAN, BROWN, OUT = (255, 239, 148, 255), (222, 206, 123, 255), (173, 148, 90, 255), (123, 99, 66, 255), (16, 16, 16, 255)
CREAMS = [PALE, CREAM, TAN, BROWN]  # what a sheathed blade is made of on the leg
HELD = [
    # Each foreleg's bracer has three shell segments; the top one, with its spike, IS the seamitar (the spike is the
    # handle). Drawing it, that piece vanishes from the leg and the paw holds the blade; the two segments under it are
    # the scabbard it comes out of.
    {   # 0: the far (left) foreleg's seamitar, top of the row down its back; drawn by the near (right) paw
        'sheath_leg': 'front_far', 'grip_leg': 'front_near',
        'on_leg': [(59, 44), (65, 44), (68, 52), (68, 57), (65, 58), (62, 54), (59, 48)], 'fill': [],
        'handle': (62, 48), 'sheath': (64, 54), 'reach_max': 135, 'grip_deg': math.degrees(math.atan2(-(77 - 51), 30 - 39)), 'sheath_deg': math.degrees(math.atan2(-(68 - 47), 72 - 61)), 'grip': (31, 74),
    },
    {   # 1: the near (right) foreleg's seamitar, the spike and the bracer's top segment; drawn by the far (left) paw
        'sheath_leg': 'front_near', 'grip_leg': 'front_far',
        'on_leg': [(30, 45), (37, 45), (37, 52), (42, 52), (42, 59), (27, 59), (27, 52), (30, 52)],
        'fill': [(28, 45), (42, 45), (42, 59), (28, 59)],
        # where the top shell and its spike were, the leg is bare blue down to the second shell's rim (row 60); the
        # leg's left outline (x 28) stays. Matches the anime: a drawn seamitar leaves blue foreleg over two shells.
        'paint': [([(29, 46), (37, 46), (37, 53), (41, 53), (41, 59), (29, 59)], (33, 90, 156)),
                  ([(28, 56), (28, 59), (28, 59), (28, 56)], (16, 16, 16))],
        'handle': (33, 50), 'sheath': (34, 58), 'reach_max': 110, 'grip_deg': math.degrees(math.atan2(-(72 - 47), 71 - 61)), 'sheath_deg': math.degrees(math.atan2(-(78 - 50), 29 - 39)), 'grip': (71, 73),
    },
]


def weapon():
    # A seamitar in the sprite's palette, pointing right from its origin, which is where the paw closes: the handle
    # (the bracer's spike) runs through the paw, the shell cuff sits just past the paw as the guard, then a long
    # double-edged blade, widest at the cuff and narrowing straight to the point like a long triangle, light on one face
    # and darker on the other with the ridge down the middle.
    img = Image.new('RGBA', (58, 13), (0, 0, 0, 0)); px = img.load(); cy = 6
    for x in range(1, 12):  # handle spike: a point behind the paw, a grip 3 px thick through it
        hw = 0 if x < 3 else 1
        for y in range(cy - hw - 1, cy + hw + 2): px[x, y] = OUT
        for y in range(cy - hw, cy + hw + 1): px[x, y] = PALE if y < cy else CREAM
    for x in range(11, 16):  # cuff / guard: the shell segment
        for y in range(cy - 5, cy + 6):
            px[x, y] = OUT if x in (11, 15) or y in (cy - 5, cy + 5) else PALE if y < cy else CREAM if y < cy + 3 else TAN
    for x in range(16, 54):  # blade: a long triangle
        hw = round(4.6 * (1 - (x - 16) / 38))
        px[x, cy - hw - 1] = OUT; px[x, cy + hw + 1] = OUT
        for y in range(cy - hw, cy + hw + 1): px[x, y] = PALE if y < cy else TAN if y == cy else CREAM
    px[54, cy] = OUT
    return img, (7, cy)


BLADE_FROM, BLADE_LEN = 9, 39  # the blade starts 9 px past the weapon's origin (the grip) and is 39 px long


S = math.sin; TAU = 2 * math.pi
def loop(fps, n, f): return {'fps': fps, 'n': n, 'pose': f}
def keys(fps, ks, hit=None, wait=False): return {'fps': fps, 'keys': ks, **({'hit': hit} if hit is not None else {}), 'wait': wait}

# Leg angles: + swings a paw forward (toward the head), - back.
# Drawing crosswise: the near paw reaches over to the far leg's handle while the far paw reaches behind to the near
# leg's; both blades slide out, then each paw brings its blade round. Sheathing runs the same in reverse.
# Iaido, crosswise: both paws cross in an X over the chest to take the handle on the other foreleg (reach -> 1; the
# far paw comes in front of the body to do it), take them (draw just above 0: each leg's top shell is gone), and the
# draw itself is the cut: the paws sweep back out while the blades come out of the handles and swing through.
# Sheathing crosses the paws again and the blades go back into the handles.
CROSS = {'reach0': 1, 'reach1': 1, 'head': 3, 'g': (-2, 1, 3), 'front': ('front_far',)}  # an X: far paw over the chest, near leg over it
def draw_cut(t0, cut_to, follow, wind=None):
    # cross the paws to the handles and take them; the arms swing back up while the blades come out (wind), then
    # swing down through the cut (cut_to) and follow through (follow). The blades ride on the arms.
    wind = wind or {'front_near': (150, 1, -6), 'front_far': (110, 0, -4), 'g': (-3, -1, 5), 'head': 3}
    return [(t0 + 0.12, {**CROSS}), (t0 + 0.16, {**CROSS, 'draw0': 0.02, 'draw1': 0.02}), (t0 + 0.2, {**CROSS, 'draw0': 0.02, 'draw1': 0.02, 'g': (-3, 1, 4)}),
            (t0 + 0.26, {**wind, 'draw0': 0.45, 'draw1': 0.45}),
            (t0 + 0.3, {**{k: v for k, v in wind.items() if k == 'head'}, 'front_near': (90, 1, -4), 'front_far': (65, 0, -3), 'sword0': 15, 'sword1': 10, 'g': (2, 0, -2), 'draw0': 0.85, 'draw1': 0.85}),
            (t0 + 0.34, {**cut_to, 'draw0': 1, 'draw1': 1}), (t0 + 0.42, {**follow, 'draw0': 1, 'draw1': 1})]
def sheathe(t0, held):  # from a pose holding both blades, cross again and put them back, ending standing
    return [(t0 + 0.12, {**CROSS, 'reach0': 0.6, 'reach1': 0.6, 'draw0': 0.4, 'draw1': 0.4}),
            (t0 + 0.2, {**CROSS, 'draw0': 0.1, 'draw1': 0.1}), (t0 + 0.24, {**CROSS, 'draw0': 0.02, 'draw1': 0.02}),
            (t0 + 0.27, {**CROSS}), (t0 + 0.4, {})]

# arm poses for the cuts (the blades lie along the arms): CUT_OUT ends the downward cut with the arms forward and
# low, FOLLOW carries them through, HOLD keeps the blades out in front
# (the wrists cock the blades a little forward off the arms' line, so they cut ahead rather than into the ground)
CUT_OUT = {'front_near': (35, 2, -2), 'front_far': (25, 1, -2), 'sword0': 30, 'sword1': 20, 'g': (6, -1, -6), 'head': -3}
FOLLOW = {'front_near': (15, 2, -1), 'front_far': (10, 1, -1), 'sword0': 30, 'sword1': 20, 'g': (8, -1, -7), 'head': -4}
HOLD = {'front_near': (60, 1, -3), 'front_far': (45, 0, -2), 'sword0': 30, 'sword1': 20, 'g': (4, 0, -3)}
RISE = {'front_near': (125, 1, -5), 'front_far': (95, 0, -4), 'sword0': 10, 'sword1': 10, 'g': (5, -1, -2), 'head': 2}  # an upward cut, arms swung up


def gait(t, swing, lift, back=0, fore=0):
    # four legs in diagonal pairs: near hind + far fore, near fore + far hind, half a cycle apart. Each leg swings
    # +-swing degrees (+ is toward the head) and lifts its paw `lift` px while it comes forward. back / fore offset
    # the hind and fore legs' resting angles (swimming trails the hind legs and reaches with the forelegs).
    out = {}
    for legs, ph in ((('hind', 'front_far'), 0), (('front_near', 'hind_far'), math.pi)):
        a = t * TAU + ph
        for leg in legs:
            rest = back if 'hind' in leg else fore
            k = 0.5 if leg == 'front_far' else 1  # the far foreleg steps half as wide: its shoulder is hidden behind the chest
            out[leg] = (rest + swing * k * S(a), 0, -lift * max(0.0, math.cos(a)))
    return out


ANIMS = {
    # breathing: the body rises a pixel, the head and tail drift
    'idle': loop(10, 16, lambda t: {'g': (0, -round(0.6 + 0.6 * S(t * TAU)), 0), 'head': (2 * S(t * TAU), 0, -round(0.5 + 0.5 * S(t * TAU))),
        'tail': 5 * S(t * TAU + 1)}),
    # walk: diagonal pairs step together (near hind with far fore, near fore with far hind); a leg lifts its paw while
    # it swings forward and plants it while it pushes back; the body bobs a pixel twice per cycle, the head nods
    'walk': loop(14, 12, lambda t: {'g': (0, -round(abs(S(t * TAU)) * 1.6), 0), 'head': (3 * S(t * 2 * TAU), 0, 0), 'tail': 8 * S(t * TAU),
        **gait(t, 16, 2.2)}),
    # swim: the body levelled out and leaning into the stroke, all four legs paddle in pairs, the tail sweeps
    'swim': loop(12, 12, lambda t: {'g': (0, -round(1.5 * S(t * TAU)), -7 + 2 * S(t * TAU)), 'head': (7 - 2 * S(t * TAU), 0, 0),
        'tail': 14 * S(t * TAU - 0.8), **gait(t, 20, 1.5, back=-12, fore=8)}),
    # floating in place: slow, small strokes
    'float': loop(8, 12, lambda t: {'g': (0, -round(1 + S(t * TAU)), -3), 'head': (3 + 2 * S(t * TAU), 0, 0), 'tail': 7 * S(t * TAU - 0.8),
        **gait(t, 8, 0.8, back=-6, fore=4)}),

    # 몸통박치기: crouch, then throw the whole body forward head-down
    'tackle': keys(30, [(0, {}), (0.08, {'g': (-3, 1, 3), 'head': 4}), (0.16, {'g': (-5, 2, 5), 'head': 6, 'hind': -8}),
        (0.22, {'g': (10, -1, -8), 'head': -6, 'hind': -24, 'front_near': 18, 'front_far': 18, 'tail': -10}),
        (0.3, {'g': (12, 0, -9), 'head': -7, 'hind': -26, 'front_near': 20, 'front_far': 20, 'tail': -12}),
        (0.42, {'g': (5, 0, -3), 'head': -2}), (0.55, {})], hit=0.22),
    # 물대포: draw the head back, then thrust it forward as the jet leaves the mouth
    'water_gun': keys(30, [(0, {}), (0.08, {'head': (6, -1, -1)}), (0.16, {'head': (10, -2, -2), 'g': (-1, 0, 2)}),
        (0.22, {'head': (-6, 3, 1), 'g': (1, 0, -2)}), (0.3, {'head': (-5, 2, 1), 'g': (0, 0, -1)}), (0.42, {'head': (-1, 1, 0)}), (0.55, {})], hit=0.22),
    # 셸블레이드: paws cross to the handles; the arms swing back up drawing the blades and come down through one big
    # cut with both; a beat, then sheathe
    'razor_shell': keys(30, [(0, {}), *draw_cut(0, CUT_OUT, FOLLOW), (0.58, {**HOLD, 'draw0': 1, 'draw1': 1}), *sheathe(0.58, HOLD)],
        hit=0.31, wait=True),
    # 연속자르기: the drawing cut down, then the arms swing straight back up through a second cut
    'fury_cutter': keys(30, [(0, {}), *draw_cut(0, CUT_OUT, FOLLOW), (0.5, {**RISE, 'draw0': 1, 'draw1': 1}),
        (0.64, {**HOLD, 'draw0': 1, 'draw1': 1}), *sheathe(0.64, HOLD)], hit=0.31, wait=True),
    # the next 연속자르기 in a chain: the blades are already out, so the arms cut at once
    'fury_cutter_chain': keys(30, [(0, {**HOLD, 'draw0': 1, 'draw1': 1}), (0.06, {**RISE, 'draw0': 1, 'draw1': 1}),
        (0.14, {**CUT_OUT, 'draw0': 1, 'draw1': 1}), (0.2, {**FOLLOW, 'draw0': 1, 'draw1': 1}), (0.34, {**HOLD, 'draw0': 1, 'draw1': 1}), *sheathe(0.34, HOLD)],
        hit=0.12),
    # 제비반환: paws cross to the handles, then a stretched dash: the arms swing forward level as the blades come out
    'aerial_ace': keys(30, [(0, {}), *draw_cut(0,
        {'front_near': (105, 3, -5), 'front_far': (70, 2, -4), 'g': (16, -1, -5), 'hind': -28, 'tail': -12, 'head': -5},
        {'front_near': (95, 3, -5), 'front_far': (62, 2, -4), 'g': (20, -1, -4), 'hind': -32, 'tail': -16, 'head': -5},
        wind={'front_near': (10, 0, 0), 'front_far': (-10, 0, 0), 'g': (-3, 2, 3), 'hind': 6}),
        (0.56, {**HOLD, 'draw0': 1, 'draw1': 1}), *sheathe(0.56, HOLD)], hit=0.31, wait=True),
    # 아쿠아테일: a full spin on the spot so the tail sweeps round in front and back again (the body turns round,
    # the tail whips out at the far side of the turn)
    'aqua_tail': keys(30, [(0, {}), (0.05, {'g': (0, -1, 0, 0.8), 'tail': -15, 'hind': -6}), (0.1, {'g': (0, -2, 0, 0.5), 'tail': 10}),
        (0.15, {'g': (0, -3, 0, -0.6), 'tail': 40}), (0.2, {'g': (0, -3, 0, -0.9), 'tail': 62, 'head': -4}),
        (0.25, {'g': (0, -3, 0, -1), 'tail': 70, 'head': -4}), (0.3, {'g': (0, -2, 0, -0.8), 'tail': 45}),
        (0.35, {'g': (0, -1, 0, -0.5), 'tail': 20}), (0.4, {'g': (0, 0, 0, 0.6), 'tail': 5}), (0.45, {'g': (0, 0, 0, 0.9)}), (0.55, {})], hit=0.25),
    # 하이드로펌프: braced, head thrust forward, the body shudders with the recoil (looped while the jet runs)
    'hydro_pump': loop(16, 8, lambda t: {'g': (-1 - round(abs(S(t * TAU))), 0, 2), 'head': (-5, 3, 1 if t * 8 % 2 < 1 else 0),
        'hind': -14, 'front_near': -10, 'front_far': 10, 'tail': -8}),
    # 하이드로캐논: gather with the head drawn back (held while the water ball grows), then the shot throws the body back
    'hydro_cannon': keys(20, [(0, {}), (0.12, {'g': (-2, 1, 4), 'head': (6, -2, 0)}), (0.3, {'g': (-3, 1, 6), 'head': (9, -3, 0)}),
        (0.48, {'g': (-3, 1, 6), 'head': (9, -3, 0)}), (0.54, {'g': (-8, -1, 10), 'head': (-7, 3, 1), 'front_near': 14, 'front_far': 14}),
        (0.7, {'g': (-6, 0, 7), 'head': -4}), (0.86, {'g': (-2, 0, 2)}), (1.0, {})], hit=0.52),
    # after 하이드로캐논 the user must recharge: the head hangs, heavy breathing
    'recharge': loop(8, 12, lambda t: {'g': (0, 1 + round(0.6 + 0.6 * S(t * TAU)), -3), 'head': (-12, 1, 2 + round(S(t * TAU))), 'tail': -12,
        'hind': 6, 'front_near': -4}),
    'hurt': keys(30, [(0, {'g': (-4, -1, 8), 'head': 8}), (0.1, {'g': (-3, 0, 5), 'head': 5}), (0.25, {})]),
}

if __name__ == '__main__':
    dotsprite.run(sys.modules[__name__], ANIMS)
