# Oshawott animation sheet: cut-out parts of the official artwork (PokeAPI official-artwork/501, saved in
# assets/player/reference/oshawott-official), mirrored to face right, posed and rendered by scripts/cutout.py:
#   python scripts/oshawott-sheet.py              -> public/anim/oshawott.webp + src/anim/oshawott.json
#   python scripts/oshawott-sheet.py preview DIR  -> DIR/oshawott-preview.png
# Polygons and pivots are in the mirrored 475x475 image's pixels.
# Only cutting moves draw the scalchop ('sword' in a pose): it leaves the belly and the front paw holds it, a curved
# water blade out of its rim (as Razor Shell looks in the anime).
import math, sys
import cutout

NAME = 'oshawott'
SRC = 'assets/player/reference/oshawott-official/official-artwork-501.png'
MIRROR = True
OUT_SCALE = 0.3
PAD = (60, 70, 250, 90)
PARTS = {
    # name: (polygon, pivot, under: where it carries on behind the body, see scripts/cutout.py)
    # the back arm, folded over the belly (its paw rests on the scalchop)
    'arm_back': ([(146, 268), (160, 259), (182, 257), (205, 261), (225, 270), (240, 282), (246, 296), (245, 308), (235, 318),
                  (205, 318), (180, 312), (160, 305), (148, 292)], (165, 282), None),
    # the front arm, held out forward
    'arm_front': ([(314, 260), (345, 259), (372, 264), (398, 272), (407, 282), (406, 293), (396, 300), (372, 307), (345, 314),
                   (332, 314), (322, 300), (316, 282)], (328, 286), None),
    # the head down to the top of the shell collar (the collar stays on the body and covers the chin)
    'head': ([(147, 232), (133, 220), (120, 200), (109, 172), (106, 145), (97, 112), (95, 90), (102, 80), (125, 70), (147, 58),
              (165, 42), (195, 28), (235, 20), (275, 24), (305, 35), (315, 42), (340, 45), (357, 48), (365, 75), (366, 110),
              (370, 145), (365, 180), (357, 205), (348, 222), (337, 218), (322, 226), (318, 234), (305, 226), (285, 228),
              (274, 238), (268, 252), (258, 254), (244, 252), (240, 240), (228, 229), (212, 228), (200, 238), (196, 232),
              (185, 221), (167, 220), (155, 228)], (250, 240), [(172, 218), (326, 218), (322, 248), (250, 256), (176, 250)]),
    # the scalchop on the belly (traced from its colour; hinge tab at the bottom)
    'shell': ([(315, 331), (312, 337), (307, 342), (302, 345), (297, 348), (291, 349), (294, 357), (294, 365), (290, 369), (283, 371),
               (277, 372), (272, 374), (267, 379), (261, 380), (255, 380), (248, 376), (245, 369), (242, 362), (241, 355), (237, 353),
               (231, 351), (224, 348), (219, 344), (216, 337), (217, 331), (218, 324), (221, 318), (228, 315), (236, 313), (239, 310),
               (240, 304), (242, 299), (246, 295), (251, 293), (256, 292), (262, 291), (267, 291), (272, 291), (278, 291), (283, 292),
               (288, 294), (294, 296), (298, 299), (303, 303), (308, 307), (311, 312), (315, 318), (316, 324)], (267, 375), None),
    # the flat tail, behind the body
    'tail': ([(64, 342), (74, 326), (98, 315), (125, 312), (150, 317), (160, 321), (158, 345), (160, 372), (168, 394), (140, 385),
              (112, 375), (90, 366), (68, 357)], (162, 352), cutout.oval(165, 356, 24, 38)),
    # the feet, below the body's bottom edge
    'foot_back': ([(141, 448), (146, 432), (160, 415), (175, 403), (185, 406), (200, 410), (214, 413), (218, 425), (217, 446),
                   (207, 454), (158, 455)], (195, 410), cutout.oval(197, 406, 26, 12)),
    'foot_front': ([(274, 415), (290, 416), (305, 412), (320, 406), (330, 404), (342, 420), (350, 437), (345, 450), (300, 451),
                    (283, 444), (276, 430)], (305, 410), cutout.oval(303, 405, 30, 12)),
}
FILL = ['arm_back', 'arm_front', 'shell']
# drawn back to front; the front paw grips over the scalchop's hinge
ORDER = ['tail', 'foot_back', 'foot_front', 'head', 'body', 'shell', 'arm_back', 'sword', 'arm_front']
HELD = {'sword': ('arm_front', (396, 288), 'shell', (267, 375), (270, 292))}
BLADE = (150, 28)
TORSO = (250, 330)  # whole-body turns go around here
# the torso's outline, on its black line: where an arm or the scalchop covered it, the body is painted in
TORSO_FILL = [(152, 256), (200, 256), (250, 258), (300, 256), (336, 256), (342, 280), (346, 312), (348, 350), (338, 384), (300, 407),
              (250, 413), (200, 407), (166, 392), (156, 360), (151, 320), (150, 285)]
GROUND = 451        # bottom of the feet: the feet line the game puts on the hitbox bottom
MOUTH = (258, 207)

S = math.sin; TAU = 2 * math.pi
def cyc(n, f): return [f(i / n) for i in range(n)]
def atk(fps, frames): return (fps, False, frames)

# ---------- animations: name -> (fps, loop, poses) ----------
# Arm angles: + lifts the paw (counter-clockwise), - lowers it. Tail: + swings it down, - up over the back.
# 'sword' is the drawn blade's direction on screen (0 forward, 90 straight up, -90 down); only 셸블레이드,
# 연속자르기 and 제비반환 draw it. Oshawott itself only learns 몸통박치기 and 물대포 before it evolves; the other moves
# are here so every move has an animation.
ANIMS = {
    # standing still: slow breath, head and tail drift, the paws sway a little
    'idle': (8, True, cyc(8, lambda t: {'g': (0, -1.5 * S(t * TAU), 0, 1 + 0.008 * S(t * TAU), 1 - 0.015 * S(t * TAU)),
        'head': (1.5 * S(t * TAU), 0, -1.5 * S(t * TAU)), 'tail': 5 * S(t * TAU + 1), 'arm_front': 4 * S(t * TAU + 0.5),
        'arm_back': -3 * S(t * TAU + 0.5)})),
    # walk: a waddle, the body rocking side to side over the stepping feet, arms swinging
    'walk': (12, True, cyc(8, lambda t: {'g': (0, -3 * abs(S(t * TAU)), 3 * S(t * TAU)), 'head': (2 * S(t * 2 * TAU), 0, 0),
        'tail': 8 * S(t * TAU), 'arm_front': 14 * S(t * TAU), 'arm_back': -12 * S(t * TAU),
        'foot_back': (12 * S(t * TAU), 0, -5 * max(0, S(t * TAU))), 'foot_front': (-12 * S(t * TAU), 0, -5 * max(0, -S(t * TAU)))})),
    # swim: leaning into the stroke, arms paddling, feet kicking, the tail sweeping
    'swim': (10, True, cyc(8, lambda t: {'g': (0, -2 * S(t * TAU), -14 + 3 * S(t * TAU)), 'head': (8 - 2 * S(t * TAU), 0, 0),
        'tail': 15 * S(t * TAU - 0.8), 'arm_front': 15 + 30 * S(t * TAU), 'arm_back': -5 - 28 * S(t * TAU + 0.5),
        'foot_back': 20 * S(t * TAU), 'foot_front': -20 * S(t * TAU)})),
    # floating still in the water: slow, small strokes
    'float': (6, True, cyc(8, lambda t: {'g': (0, -3 * S(t * TAU), -4), 'head': (3 + 1.5 * S(t * TAU), 0, -1.5 * S(t * TAU)),
        'tail': 8 * S(t * TAU - 0.8), 'arm_front': 8 + 12 * S(t * TAU), 'arm_back': -10 * S(t * TAU + 0.5),
        'foot_back': 8 * S(t * TAU), 'foot_front': -8 * S(t * TAU)})),
    # 몸통박치기: crouch, then throw the whole body forward head first, arms swept back
    'tackle': atk(14, [{'g': (-12, 5, 4, 0.95, 1.04), 'head': 5, 'arm_front': 20, 'arm_back': 10},
        {'g': (-20, 8, 6, 0.92, 1.06), 'head': 7, 'arm_front': 28, 'arm_back': 14},
        {'g': (45, -2, -14, 1.08, 0.95), 'head': -8, 'arm_front': -50, 'arm_back': -30, 'tail': -15, 'foot_back': -25},
        {'g': (58, 0, -16, 1.1, 0.93), 'head': -10, 'arm_front': -55, 'arm_back': -35, 'tail': -18, 'foot_back': -30},
        {'g': (26, 0, -6), 'head': -4, 'arm_front': -20}, {'g': (6, 0, 0)}]),
    # 물대포: draw the head back, then thrust it forward as the jet leaves the mouth
    'water_gun': atk(14, [{'head': (8, -5, -2)}, {'head': (12, -8, -3), 'g': (-5, 0, 2), 'arm_front': 10},
        {'head': (-6, 10, 2), 'g': (4, 0, -2), 'arm_front': -15}, {'head': (-5, 8, 2), 'g': (-3, 0, 0), 'arm_front': -10},
        {'head': (-2, 3, 0)}, {}]),
    # 셸블레이드: take the scalchop off the belly, lift it high in front of the head, then one big cut down in front
    # (the big head leaves no room to hold it back over the shoulder)
    'razor_shell': atk(16, [{'arm_front': 35, 'sword': 80, 'g': (-5, 0, 3)}, {'arm_front': 60, 'sword': 85, 'g': (-8, -3, 7), 'arm_back': 10},
        {'arm_front': 70, 'sword': 92, 'g': (-10, -5, 9), 'arm_back': 15}, {'arm_front': 40, 'sword': 40, 'g': (12, -2, -4)},
        {'arm_front': 0, 'sword': -30, 'g': (22, 0, -8), 'arm_back': -15}, {'arm_front': -25, 'sword': -55, 'g': (18, 0, -6)},
        {'arm_front': -15, 'sword': -65, 'g': (8, 0, -2)}, {}]),
    # 연속자르기: a quick cut down, then straight back up, ready to chain the next one
    'fury_cutter': atk(18, [{'arm_front': 65, 'sword': 85, 'g': (-4, -3, 5)}, {'arm_front': 0, 'sword': -25, 'g': (12, 0, -5)},
        {'arm_front': 40, 'sword': 40, 'g': (8, 0, -2)}, {'arm_front': 65, 'sword': 85, 'g': (6, -2, 3)},
        {'arm_front': 30, 'sword': 30}]),
    # 제비반환: low crouch with the blade held back, then a stretched dash cut with the blade level
    'aerial_ace': atk(16, [{'arm_front': -40, 'sword': -160, 'g': (-8, 7, 4, 0.96, 1.03)},
        {'arm_front': 10, 'sword': 0, 'g': (36, -2, -8, 1.12, 0.92), 'tail': -15, 'head': -6, 'arm_back': -40, 'foot_back': -30},
        {'arm_front': 12, 'sword': -8, 'g': (44, -2, -7, 1.14, 0.92), 'tail': -18, 'head': -6, 'arm_back': -45, 'foot_back': -34},
        {'arm_front': -10, 'sword': -20, 'g': (22, 0, -2)}, {'arm_front': -20, 'sword': -40}]),
    # 아쿠아테일: wind the tail down under, then whip it up and over the back
    'aqua_tail': atk(16, [{'tail': 22, 'g': (4, 0, 4)}, {'tail': 35, 'g': (6, 2, 6)}, {'tail': -30, 'g': (-4, -4, -8)},
        {'tail': -50, 'g': (-8, -6, -12)}, {'tail': -35, 'g': (-5, -2, -6)}, {'tail': -8}]),
    # 하이드로펌프: braced, head thrust forward, the body shudders with the recoil (looped while the jet runs)
    'hydro_pump': (16, True, cyc(4, lambda t: {'g': (-4 - 2 * S(t * TAU), 1.5 * S(t * 2 * TAU), 3), 'head': (-4, 8, 2),
        'arm_front': -20, 'arm_back': -30, 'tail': 8, 'foot_back': -8})),
    # 하이드로캐논: gather with the head drawn back, then the shot throws the body back
    'hydro_cannon': atk(12, [{'g': (-6, 3, 4, 0.96, 1.03), 'head': (8, -5, 0)}, {'g': (-10, 4, 6, 0.94, 1.05), 'head': (10, -8, 0)},
        {'g': (-28, -3, 10), 'head': (-6, 10, 2), 'arm_front': 30, 'arm_back': 30}, {'g': (-22, 0, 7)}, {'g': (-8, 0, 3)}]),
    # after 하이드로캐논 the user has to recharge: head hangs, arms droop, heavy breathing
    'recharge': (6, True, cyc(4, lambda t: {'g': (0, 3 + 1.5 * S(t * TAU), -3, 1.01, 0.98), 'head': (-10, 3, 8 + 2 * S(t * TAU)),
        'tail': 10, 'arm_front': -35, 'arm_back': -20})),
    'hurt': atk(12, [{'g': (-16, -3, 8), 'head': 8, 'arm_front': 30, 'arm_back': 20}, {'g': (-10, 0, 5), 'head': 5, 'arm_front': 15}, {}]),
}

if __name__ == '__main__':
    cutout.run(sys.modules[__name__], ANIMS)
