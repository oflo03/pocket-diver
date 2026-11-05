# Dewott animation sheet: cut-out parts of the official artwork (PokeAPI official-artwork/502, saved in
# assets/player/reference/dewott-official), which already faces right (tail behind, the far arm thrown forward),
# posed and rendered by scripts/cutout.py:
#   python scripts/dewott-sheet.py              -> public/anim/dewott.webp + src/anim/dewott.json
#   python scripts/dewott-sheet.py preview DIR  -> DIR/dewott-preview.png
# Polygons and pivots are in the 475x475 image's pixels.
# Only cutting moves draw the scalchops ('sword', 'sword2' in a pose): both leave the hips (which go bare) and each
# paw holds one, a curved water blade out of its rim, as Dewott uses Razor Shell in the anime.
import math, sys
import cutout

NAME = 'dewott'
SRC = 'assets/player/reference/dewott-official/official-artwork-502.png'
MIRROR = False
OUT_SCALE = 0.4
PAD = (70, 90, 190, 80)
PARTS = {
    # name: (polygon, pivot, under: where it carries on behind the body, see scripts/cutout.py)
    # the scalchops on the hips (traced from their colour; hinge at the top, where the paw takes them)
    'shell_near': ([(216, 334), (214, 338), (213, 341), (211, 345), (209, 348), (207, 351), (205, 354), (202, 357), (199, 358), (195, 358),
                    (191, 358), (188, 361), (185, 363), (180, 366), (175, 368), (170, 369), (164, 369), (159, 367), (156, 363), (154, 357),
                    (154, 351), (154, 346), (154, 342), (154, 338), (156, 334), (157, 330), (158, 326), (160, 323), (162, 320), (164, 317),
                    (165, 314), (168, 311), (171, 310), (174, 307), (177, 303), (180, 301), (185, 299), (189, 298), (194, 298), (200, 298),
                    (204, 300), (206, 305), (208, 310), (212, 313), (217, 315), (218, 320), (218, 325), (217, 329)], (200, 302), None),
    'shell_far': ([(343, 325), (344, 328), (345, 331), (346, 334), (347, 338), (348, 343), (348, 349), (346, 353), (341, 353), (336, 352),
                   (331, 349), (327, 346), (324, 346), (322, 346), (319, 346), (316, 344), (314, 342), (312, 341), (310, 339), (309, 337),
                   (308, 335), (306, 333), (305, 330), (304, 328), (304, 325), (303, 322), (303, 319), (302, 316), (302, 312), (303, 308),
                   (304, 305), (309, 304), (309, 298), (312, 295), (317, 296), (321, 296), (324, 298), (327, 302), (330, 304), (332, 307),
                   (334, 309), (335, 311), (337, 313), (338, 315), (339, 316), (340, 318), (341, 320), (342, 323)], (315, 298), None),
    # the head with its crest, ears and whiskers, down to the chin (the right whisker's lower prong lies over the far arm)
    'head': ([(246, 15), (256, 38), (267, 62), (280, 88), (286, 96), (302, 100), (318, 108), (314, 128), (309, 148), (310, 165),
              (343, 145), (349, 148), (345, 154), (311, 172), (310, 200), (328, 209), (332, 216), (324, 223), (300, 216), (270, 208),
              (262, 213), (250, 219), (230, 222), (212, 221), (194, 216), (180, 209), (150, 218), (136, 216), (140, 207), (170, 193),
              (150, 172), (126, 146), (128, 139), (137, 139), (156, 152), (158, 138), (160, 124), (157, 104), (165, 96), (190, 95),
              (215, 86), (232, 83), (237, 52), (243, 20)], (238, 212), None),
    # the near arm, folded across the chest toward the far hip; the far arm, thrown forward at shoulder height
    'arm_near': ([(219, 240), (232, 231), (268, 230), (284, 243), (292, 252), (302, 257), (316, 260), (326, 257), (332, 267),
                  (339, 280), (334, 291), (326, 297), (305, 296), (282, 289), (255, 283), (230, 273), (219, 262)], (226, 252), None),
    'arm_far': ([(258, 214), (282, 207), (305, 202), (322, 197), (338, 191), (352, 192), (361, 200), (358, 210), (363, 222),
                 (348, 227), (333, 227), (318, 233), (300, 241), (285, 249), (272, 254), (266, 235)], (268, 228), None),
    # the tail, behind the near scalchop and the fur skirt
    'tail': ([(92, 338), (100, 322), (118, 312), (140, 305), (158, 304), (166, 309), (163, 330), (160, 350), (162, 362), (150, 369),
              (130, 367), (110, 359), (96, 350)], (163, 336), cutout.oval(172, 336, 18, 26)),
    # the legs below the fur skirt
    'leg_near': ([(148, 392), (178, 391), (205, 388), (208, 397), (196, 410), (182, 420), (178, 436), (177, 453), (150, 456), (117, 455),
                  (113, 446), (124, 436), (146, 422)], (178, 394), cutout.oval(178, 388, 28, 12)),
    'leg_far': ([(286, 385), (312, 382), (338, 381), (345, 392), (352, 405), (362, 418), (366, 430), (356, 435), (318, 435), (302, 425),
                 (298, 410), (290, 398)], (315, 388), cutout.oval(314, 381, 28, 10)),
}
FILL = ['head', 'arm_near', 'arm_far', 'shell_near', 'shell_far']
# drawn back to front; each paw grips over its scalchop's hinge, the head covers the far arm (as in the art)
ORDER = ['tail', 'leg_far', 'leg_near', 'body', 'shell_far', 'shell_near', 'sword2', 'arm_far', 'head', 'sword', 'arm_near']
HELD = {'sword': ('arm_near', (310, 274), 'shell_near', (200, 302), (163, 366)),
        'sword2': ('arm_far', (341, 209), 'shell_far', (315, 298), (342, 350))}
BLADE = (170, 22)
TORSO = (245, 320)  # whole-body turns go around here
# the torso and fur skirt's outline, on its black line: where the head, an arm or a scalchop covered it, the body is
# painted in
TORSO_FILL = [(211, 211), (262, 211), (272, 250), (286, 266), (300, 288), (330, 296), (348, 310), (352, 335), (352, 358), (330, 368),
              (300, 375), (260, 382), (205, 388), (160, 384), (150, 370), (152, 340), (160, 310), (185, 292), (196, 285), (205, 265),
              (211, 245)]
# the chest under the folded arm is light blue (painting it in from around would bring in the dark fur skirt)
PAINT = [([(211, 211), (262, 211), (272, 250), (286, 266), (298, 290), (262, 298), (240, 284), (205, 280)], (139, 210, 223))]
GROUND = 452        # bottom of the near foot: the feet line the game puts on the hitbox bottom
MOUTH = (222, 205)

S = math.sin; TAU = 2 * math.pi
def cyc(n, f): return [f(i / n) for i in range(n)]
def atk(fps, frames): return (fps, False, frames)

# ---------- animations: name -> (fps, loop, poses) ----------
# Arm angles: + lifts the paw (counter-clockwise), - lowers it. Tail: + swings it down, - up.
# 'sword' / 'sword2' are the near / far blade's direction on screen (0 forward, 90 straight up, -90 down); only
# 셸블레이드, 연속자르기 and 제비반환 draw them, always both (Dewott fights with a scalchop in each paw).
def both(near, far, a, b, **rest):  # a pose with both scalchops drawn: arm angles, then blade directions
    return {'arm_near': near, 'arm_far': far, 'sword': a, 'sword2': b, **rest}

ANIMS = {
    # standing still: slow breath, head and tail drift, the forward paw stays on guard
    'idle': (8, True, cyc(8, lambda t: {'g': (0, -1.5 * S(t * TAU), 0, 1 + 0.006 * S(t * TAU), 1 - 0.012 * S(t * TAU)),
        'head': (1.5 * S(t * TAU), 0, -1.5 * S(t * TAU)), 'tail': 5 * S(t * TAU + 1), 'arm_far': 4 * S(t * TAU + 0.5),
        'arm_near': -3 * S(t * TAU + 0.5)})),
    # walk: the legs step in turn, the body bobs twice per cycle, arms and tail swing
    'walk': (12, True, cyc(8, lambda t: {'g': (0, -3 * abs(S(t * TAU)), 2 * S(t * TAU)), 'head': (2 * S(t * 2 * TAU), 0, 0),
        'tail': 8 * S(t * TAU), 'arm_far': 12 * S(t * TAU), 'arm_near': -10 * S(t * TAU),
        'leg_near': (16 * S(t * TAU), 0, -5 * max(0, S(t * TAU))), 'leg_far': (-14 * S(t * TAU), 0, -5 * max(0, -S(t * TAU)))})),
    # swim: leaning into the stroke, arms pulling, legs kicking, the tail sweeping
    'swim': (10, True, cyc(8, lambda t: {'g': (0, -2 * S(t * TAU), -16 + 3 * S(t * TAU)), 'head': (8 - 2 * S(t * TAU), 0, 0),
        'tail': 14 * S(t * TAU - 0.8), 'arm_far': 10 + 28 * S(t * TAU), 'arm_near': -5 - 25 * S(t * TAU + 0.5),
        'leg_near': 20 * S(t * TAU), 'leg_far': -20 * S(t * TAU)})),
    # floating still in the water: slow, small strokes
    'float': (6, True, cyc(8, lambda t: {'g': (0, -3 * S(t * TAU), -4), 'head': (3 + 1.5 * S(t * TAU), 0, -1.5 * S(t * TAU)),
        'tail': 8 * S(t * TAU - 0.8), 'arm_far': 6 + 10 * S(t * TAU), 'arm_near': -8 * S(t * TAU + 0.5),
        'leg_near': 8 * S(t * TAU), 'leg_far': -8 * S(t * TAU)})),
    # 몸통박치기: crouch, then throw the whole body forward shoulder first
    'tackle': atk(14, [{'g': (-12, 5, 4, 0.95, 1.04), 'head': 5, 'arm_far': 20, 'arm_near': 10},
        {'g': (-20, 8, 6, 0.92, 1.06), 'head': 7, 'arm_far': 26, 'arm_near': 14},
        {'g': (45, -2, -14, 1.08, 0.95), 'head': -8, 'arm_far': -40, 'arm_near': -20, 'tail': -15, 'leg_near': -25},
        {'g': (58, 0, -16, 1.1, 0.93), 'head': -10, 'arm_far': -45, 'arm_near': -25, 'tail': -18, 'leg_near': -30},
        {'g': (26, 0, -6), 'head': -4, 'arm_far': -15}, {'g': (6, 0, 0)}]),
    # 물대포: draw the head back, then thrust it forward as the jet leaves the mouth
    'water_gun': atk(14, [{'head': (8, -5, -2)}, {'head': (12, -8, -3), 'g': (-5, 0, 2), 'arm_far': 10},
        {'head': (-6, 10, 2), 'g': (4, 0, -2), 'arm_far': -15}, {'head': (-5, 8, 2), 'g': (-3, 0, 0), 'arm_far': -10},
        {'head': (-2, 3, 0)}, {}]),
    # 셸블레이드: both scalchops off the hips and raised high, then both cut down in front
    'razor_shell': atk(16, [both(25, 30, 100, 110, g=(-5, 0, 3)), both(45, 55, 95, 105, g=(-8, -3, 7)),
        both(50, 62, 92, 100, g=(-10, -5, 9)), both(35, 30, 30, 40, g=(12, -2, -4)),
        both(-5, -10, -30, -20, g=(22, 0, -8)), both(-25, -30, -55, -45, g=(18, 0, -6)),
        both(-15, -20, -65, -55, g=(8, 0, -2)), {}]),
    # 연속자르기: the paws cut in turn, one coming down while the other goes back up
    'fury_cutter': atk(18, [both(50, -20, 92, -40, g=(-4, -3, 5)), both(-10, 55, -30, 95, g=(12, 0, -5)),
        both(30, 30, 40, 50, g=(8, 0, -2)), both(50, -20, 92, -40, g=(6, -2, 3)), both(30, 10, 30, 10)]),
    # 제비반환: low crouch with the blades held back, then a stretched dash cut with both blades level
    'aerial_ace': atk(16, [both(-30, -40, -150, -160, g=(-8, 7, 4, 0.96, 1.03)),
        both(10, 5, 0, 8, g=(36, -2, -8, 1.12, 0.92), tail=-15, head=-6, leg_near=-30),
        both(12, 6, -8, 2, g=(44, -2, -7, 1.14, 0.92), tail=-18, head=-6, leg_near=-34),
        both(-10, -15, -20, -15, g=(22, 0, -2)), both(-20, -25, -40, -35)]),
    # 아쿠아테일: wind the tail down, then whip it up and over the back
    'aqua_tail': atk(16, [{'tail': 22, 'g': (4, 0, 4)}, {'tail': 35, 'g': (6, 2, 6)}, {'tail': -30, 'g': (-4, -4, -8)},
        {'tail': -50, 'g': (-8, -6, -12)}, {'tail': -35, 'g': (-5, -2, -6)}, {'tail': -8}]),
    # 하이드로펌프: braced, head thrust forward, the body shudders with the recoil (looped while the jet runs)
    'hydro_pump': (16, True, cyc(4, lambda t: {'g': (-4 - 2 * S(t * TAU), 1.5 * S(t * 2 * TAU), 3), 'head': (-4, 8, 2),
        'arm_far': -20, 'arm_near': -20, 'tail': 8, 'leg_near': -8})),
    # 하이드로캐논: gather with the head drawn back, then the shot throws the body back
    'hydro_cannon': atk(12, [{'g': (-6, 3, 4, 0.96, 1.03), 'head': (8, -5, 0)}, {'g': (-10, 4, 6, 0.94, 1.05), 'head': (10, -8, 0)},
        {'g': (-28, -3, 10), 'head': (-6, 10, 2), 'arm_far': 30, 'arm_near': 20}, {'g': (-22, 0, 7)}, {'g': (-8, 0, 3)}]),
    # after 하이드로캐논 the user has to recharge: head hangs, arms droop, heavy breathing
    'recharge': (6, True, cyc(4, lambda t: {'g': (0, 3 + 1.5 * S(t * TAU), -3, 1.01, 0.98), 'head': (-10, 3, 8 + 2 * S(t * TAU)),
        'tail': 10, 'arm_far': -35, 'arm_near': -15})),
    'hurt': atk(12, [{'g': (-16, -3, 8), 'head': 8, 'arm_far': 30, 'arm_near': 15}, {'g': (-10, 0, 5), 'head': 5, 'arm_far': 15}, {}]),
}

if __name__ == '__main__':
    cutout.run(sys.modules[__name__], ANIMS)
