# Shared animation library for the starter lines rendered from their Scarlet/Violet models. A species' spec
# (scripts/<species>-3d.py) is a small config handed to spec(), which returns everything scripts/render3d.py and
# scripts/pixel3d.py read (PX, CANVAS, ANIMS, ...). In these rigs every joint's X axis runs along its limb, so arms are
# posed by direction ('point', model axes: x left, y up, z forward), which fits rigs whose rest poses differ (T-pose,
# A-pose, arms forward); legs, spine, neck and tail are posed by turns on top of their rest pose (a frog stays
# crouched). Every distance is a share of the model's height, so one set of motions fits a 0.4 m Mudkip and a 2.8 m
# Primarina. Body plans: 'biped' (stands on two legs), 'quad' (on four: Mudkip), 'seal' (flippers, no legs: Popplio,
# Brionne), 'mermaid' (upright on a long tail: Primarina). A line's concept shows in its attacks (C['dash'], C['shoot']).
# Ears, tails, tongues, hair and feathers named in C['springs'] ({bone name pattern: (hz, damping[, furthest swing in degrees])}) swing after the
# body with weight of their own (render3d's Springs).
# C['eyes'] = boxes round the eyes in the official sprite (x0, y0, x1, y1), nearest first: pixel3d draws those eyes over the
# rendered ones (pixel3d.sprite_eyes).
import math

S = math.sin; C_ = math.cos; TAU = 2 * math.pi


def spec(C):
    H = C['height']; PX = H / C['sprite_h']; hp = C['sprite_h']
    plan = C.get('plan', 'biped')
    arms = C.get('arm', ('{s}_arm_01', '{s}_arm_02')); legs = C.get('leg', ('{s}_leg_01', '{s}_leg_02'))
    spine = C.get('spine', []); neck = C.get('neck', []); head = C.get('head', 'head'); tail = C.get('tail', [])
    jaw = C.get('jaw'); foot = C.get('foot', '{s}_foot')
    sgn = {'right': -1, 'left': 1}  # model x points to the left

    def m(*v): return tuple(x * H for x in v)

    def both(*poses):  # merge poses: per-bone dicts (point, reach, ...) merge, turns on one bone add up
        out = {}
        for p in poses:
            for k, v in p.items():
                if k in ('point', 'reach', 'level', 'pole', 'aim', 'gather', 'carry'): out[k] = {**out.get(k, {}), **v}
                elif k == 'root' and k in out: out[k] = tuple(a + b for a, b in zip(out[k], v))
                elif k in out and k not in ('ground', 'show', 'hide'): out[k] = turns(out[k]) + turns(v)
                else: out[k] = v
        return out

    def turns(v): return [] if not v else [v] if isinstance(v[0], str) else list(v)

    def spread(bones, axis, deg):  # one turn shared out along a chain
        return {b: (axis, deg / len(bones)) for b in bones} if bones else {}

    # ---- the parts ----
    lean0 = C.get('lean0', 0)  # how far forward it already leans standing (a hunched Feraligatr, a four-legged Mudkip)
    def body(lean=0, turn=0, tilt=0, fwd=0, up=0, level=False):
        # the whole body (waist) tipped forward by lean, turned toward its left by turn, rolled by tilt; moved fwd / up
        # (shares of the height). level: lean is how far from upright the body ends up (90 = lying level), whatever
        # its standing lean
        if level: lean -= lean0
        return {'waist': [('pitch', -lean), ('yaw', turn), ('roll', tilt)], 'root': m(0, up, fwd)}

    def bend(deg): return spread(spine[1:] or spine, 'pitch', -deg)  # the chest curled forward (+) / arched back (-)

    def look(deg, yaw=0):  # the head raised (+) or lowered, through the neck and head
        parts = neck + [head]
        return both(spread(parts, 'pitch', deg), spread(parts, 'yaw', yaw))

    def wag(pitch=0, yaw=0, wave=0, t=0):
        # the tail: raised (+ lowers a tail that points back: pitch + swings it down), swung sideways, and a wave
        # travelling down it (t: phase)
        out = {}
        for i, b in enumerate(tail):
            k = 1 / len(tail)
            out[b] = [('pitch', pitch * k + wave * S(t * TAU - i * 0.9) * k * 1.6), ('yaw', yaw * k)]
        return out

    def vec(side, el, az):  # a direction for a limb on that side: el up from level, az 0 = out sideways, 90 = forward
        e, a = math.radians(el), math.radians(az)
        return (sgn[side] * C_(e) * C_(a), S(e), C_(e) * S(a))

    def arm(side, el=-60, az=10, bend=20, fel=None):
        # the upper arm pointed el / az, the forearm swung forward from it by bend (and raised to fel, if given)
        up, fore = arms[0].format(s=side), arms[1].format(s=side) if len(arms) > 1 else None
        p = {up: (vec(side, el, az), 1)}
        if fore: p[fore] = (vec(side, el - bend * 0.3 if fel is None else fel, min(175, az + bend)), 1)
        return {'point': p}

    def arms2(el=-60, az=10, bend=20, del_=0, daz=0):  # both arms, the left one offset by del_ / daz
        return both(arm('right', el, az, bend), arm('left', el + del_, az + daz, bend))

    def leg(side, fwd=0, out=0, knee=0, ft=0):
        if not legs or plan in ('seal', 'mermaid'): return {}  # (no legs)
        sg = 1 if side == 'left' else -1
        p = {legs[0].format(s=side): [('pitch', fwd), ('roll', out * sg)]}
        if len(legs) > 1: p[legs[1].format(s=side)] = ('pitch', -knee)
        if foot: p[foot.format(s=side)] = ('pitch', ft)
        return p

    def mouth(open_):  # the jaw opened (degrees)
        return {jaw: ('pitch', -open_)} if jaw else {}

    stance = C.get('stance', (-65, 10, 20))  # standing arms: el, az, elbow
    # each arm its own way where the sprite holds them so (C['arms_pose'] standing, C['tread_pose'] treading water:
    # {side: (el, az, elbow[, forearm el])}): thin arms held along the side, or pointing at the camera in this 3/4 view, are lost
    AP = C.get('arms_pose', {'right': stance, 'left': stance}); TP = C.get('tread_pose', {'right': (-30, 30, 25), 'left': (-30, 30, 25)})
    STAND = both(arm('right', *AP['right']), arm('left', *AP['left']))
    WATER_ARMS = arms2(-35, 25, 25)

    # ---- standing and moving ----
    BASE = {**({head: ('yaw', -12)} if head else {})}  # the face turned a little toward the viewer, as sprites have it
    if C.get('tail_lift'): BASE = both(BASE, spread(tail, 'pitch', C['tail_lift']))  # a long tail carried up in an arc
    # a tail's own shape at rest, bone by bone (pitch degrees): Inteleon's comes down behind the legs and curls up at the tip
    if C.get('tail_shape'): BASE = both(BASE, {b: ('pitch', d) for b, d in C['tail_shape'].items()})
    # hair the rip keeps splayed out in its bind pose (Primarina's) falls down the back: each strand leaves the head
    # going back and curves down along its length, a little toward its own side; as the body leans forward it swings
    # back with it, so a swimmer's hair trails behind her
    # (an entry is (bone, its rest x: which side it falls to; a trailing _NN numbers it along its strand) or
    # (bone, (x, y, z)): that way, fixed). C['gather'] = [(bone, other bone)]: strands drawn in to the main one, each bone
    # aimed at a joint of it, as hair tied back (Primarina's, held by its pearl clasps)
    hair = C.get('drape', []); GATHER = {'gather': {b: (o, 1) for b, o in C.get('gather', [])}} if C.get('gather') else {}
    def drape(p):
        lean = -sum(d for ax, d in turns(p.get('waist')) if ax == 'pitch')
        out = {}
        for b, x in hair:
            if isinstance(x, (tuple, list)): out[b] = (x, 1); continue
            n = b.rsplit('_', 1)[-1]; i = int(n) - 1 if n.isdigit() else 0
            a = math.radians(max(5, min(90, 70 - 5 * i + 0.75 * lean)))  # from straight down toward the back
            out[b] = ((max(-0.2, min(0.2, x / H * 0.5)), -C_(a), -S(a)), 1)
        return both(p, {'point': out}, GATHER)

    def idle(t):
        a = t * TAU
        return both(STAND, {'root': m(0, 0.004 * S(a), 0)}, bend(1.5 * S(a)), look(2 * S(a - 0.6)), wag(0, 8 * S(a + 1), 4, t))

    def step(ph, duty=0.55):  # a leg's swing (+ forward) and lift (0..1) at this point of its cycle
        ph %= 1
        if ph < duty: return 22 - 44 * ph / duty, 0.0
        q = (ph - duty) / (1 - duty); q2 = q * q * (3 - 2 * q)
        return -22 + 44 * q2, math.sin(math.pi * q)

    def walk(t):
        a = t * TAU; out = {}
        for side, ph in (('left', 0.0), ('right', 0.5)):
            sw, lift = step(t + ph); out = both(out, leg(side, sw, 0, 30 * lift, -sw * 0.5 + 15 * lift))
        c = C_(a)
        return both(out, {'ground': True}, body(4, 4 * c, 4 * S(a - 1.9)), look(-2), wag(-5, 12 * S(a - 0.8), 6, t),
                    arm('right', AP['right'][0], AP['right'][1] + 22 * c, *AP['right'][2:]), arm('left', AP['left'][0], AP['left'][1] - 22 * c, *AP['left'][2:]))

    def tread(t):  # treading water: upright, a little forward, legs pedalling, arms sculling, a gentle bob
        a = t * TAU
        return both(body(10, 0, 0, 0, 0.06 + 0.012 * S(a)), leg('right', -15 + 15 * S(a), 6, 20), leg('left', -15 - 15 * S(a), 6, 20),
                    arm('right', TP['right'][0] - 10 * S(a), TP['right'][1] + 18 * S(a), *TP['right'][2:]),
                    arm('left', TP['left'][0] - 10 * S(a + math.pi), TP['left'][1] + 18 * S(a + math.pi), *TP['left'][2:]),
                    look(4), wag(10, 6 * S(a), 6, t))

    KICK = [(0.0, (-20, -10)), (0.25, (-35, -20)), (0.48, (-50, -25)), (0.58, (15, 10)), (0.68, (-8, 25)), (0.85, (-20, -10))]

    def cyc(t, ks):
        t %= 1; ks = ks + [(1, ks[0][1])]
        for (t0, v0), (t1, v1) in zip(ks, ks[1:]):
            if t < t1:
                q = (t - t0) / (t1 - t0); q = q * q * (3 - 2 * q)
                return tuple(x + (y - x) * q for x, y in zip(v0, v1))

    def swim(t, f=0):
        # belly down and level, head up to look ahead, legs trailing and fluttering (f: blending to the flat-out
        # dolphin kick), arms swept back along the sides
        a = t * TAU; g = 1 - f; kl, kt = cyc(2 * t, KICK)
        flutter = lambda ph: g * (-25 + 22 * S(2 * a + ph)) + f * kl
        return both(body(84 + 4 * f, 0, 0, -0.05, 0.28, True), look(48 - 6 * f), leg('right', flutter(0), 6, 15 * g), leg('left', flutter(math.pi), 6, 15 * g),
                    wag(30, 0, g * 14 + f * 4, t) if tail else {}, {tail[0]: ('pitch', f * kt)} if tail else {},
                    arm('right', -10 + 6 * S(a), -60 + 6 * S(a + 1) - 15 * f, 5), arm('left', -10 + 6 * S(a + math.pi), -60 + 6 * S(a + math.pi + 1) - 15 * f, 5))

    def mix(p, q, w):
        out = {}
        for k in dict.fromkeys([*p, *q]):
            if k == 'root':
                a, b = p.get(k, (0, 0, 0)), q.get(k, (0, 0, 0)); out[k] = tuple(x + (y - x) * w for x, y in zip(a, b)); continue
            if k == 'point':
                a, b = p.get(k, {}), q.get(k, {}); out[k] = {}
                for bone in dict.fromkeys([*a, *b]):
                    va, vb = (a.get(bone) or b.get(bone))[0], (b.get(bone) or a.get(bone))[0]
                    v = tuple(x + (y - x) * w for x, y in zip(va, vb)); n = math.sqrt(sum(x * x for x in v)) or 1
                    out[k][bone] = (tuple(x / n for x in v), 1)
                continue
            if k in ('ground', 'gather'): out[k] = p.get(k) or q.get(k); continue
            ta, tb = {}, {}
            for ax, d in turns(p.get(k)): ta[ax] = ta.get(ax, 0) + d
            for ax, d in turns(q.get(k)): tb[ax] = tb.get(ax, 0) + d
            out[k] = [(ax, ta.get(ax, 0) + (tb.get(ax, 0) - ta.get(ax, 0)) * w) for ax in dict.fromkeys([*ta, *tb])]
        return out

    # ---- body plans other than two legs ----
    if plan == 'quad':
        # on four legs: the forelegs are the arms, posed by turns like the hind legs (pitch + swings them forward)
        def fore(side, fwd=0, knee=0):
            return {arms[0].format(s=side): ('pitch', fwd), **({arms[1].format(s=side): ('pitch', knee)} if len(arms) > 1 else {})}
        STAND = {}
        def idle(t):
            a = t * TAU
            return both({'root': m(0, 0.006 * S(a), 0)}, look(3 * S(a - 0.6)), wag(0, 14 * S(a + 1), 6, t))
        def walk(t):
            out = {}
            for side, ph in (('left', 0.0), ('right', 0.5)):
                sw, lift = step(t + ph); out = both(out, leg(side, sw, 0, 25 * lift, -sw * 0.4))
                sw2, lift2 = step(t + ph + 0.5); out = both(out, fore(side, sw2 * 0.9, 30 * lift2))
            return both(out, {'ground': True}, look(-2 + 2 * S(2 * t * TAU)), wag(0, 16 * S(t * TAU), 8, t))
        def tread(t):
            a = t * TAU
            return both(body(-8, 0, 0, 0, 0.1 + 0.03 * S(a)), fore('right', 20 + 45 * S(a), 40), fore('left', 20 - 45 * S(a), 40),
                        leg('right', -30 - 35 * S(a), 0, 30), leg('left', -30 + 35 * S(a), 0, 30), look(10), wag(-10, 14 * S(a), 14, t))
        def swim(t, f=0):
            # level and stretched out, the forelegs reaching forward and pulling back in turn, the hind legs kicking back,
            # the tail sculling; flat out the strokes are bigger and the legs trail longer
            a = t * TAU; k = 1 + 0.5 * f
            return both(body(-4 + 6 * f, 0, 0, 0, 0.2 + 0.02 * S(2 * a)), fore('right', 45 + 40 * k * S(a), 30 - 25 * S(a)), fore('left', 45 + 40 * k * S(a + math.pi), 30 - 25 * S(a + math.pi)),
                        leg('right', -85 + 25 * k * S(a + math.pi), 0, 10), leg('left', -85 + 25 * k * S(a), 0, 10),
                        look(12 - 6 * f), wag(-25, 18 * S(a), 22 + 10 * f, t))
        WATER_ARMS = {}
    if plan in ('seal', 'mermaid'):
        # no legs (the front flippers are arms, not legs): on land a seal, and a mermaid the same way, sits up like a sea
        # lion, the hind end and tail lying on the ground and the chest raised on the front flippers planted out to the
        # sides, and moves by galumphing from there, the chest heaving up as the flippers swing forward and dropping onto
        # them as the hind end is drawn after. In the water both swim by waving the body and tail
        def flip(side, el=-40, az=-20):  # a front flipper (the arm), posed by direction
            return arm(side, el, az, 10)
        STAND = both(flip('right', -55, 15), flip('left', -55, 15))
        SIT = 38  # how far the body leans from upright, sitting up on land
        HAND = C.get('hand', '{s}_hand')
        # the tail lying back along the ground and each front flipper planted flat on the ground ahead, out to its side
        # (render3d reaches it there by IK); the body is then set down so its lowest point (the tail) is on the ground
        TAILBACK = {'point': {b: ((0, -0.12, -1), 1) for b in tail}}
        def plant(side, z, lift=0.0):
            return {'reach': {HAND.format(s=side): ('_', 1, m(sgn[side] * 0.16, lift, z))}, 'level': {HAND.format(s=side): 0}}
        def idle(t):
            a = t * TAU
            return both({'ground': True}, body(SIT + 2 * S(a), 0, 0, 0, 0, True), look(SIT - 30 + 3 * S(a - 0.6)), bend(-6 + 2 * S(a)),
                        plant('right', 0.27), plant('left', 0.27), TAILBACK)
        def walk(t):
            a = t * TAU; s_ = S(a); up = max(0.0, s_)
            return both({'ground': True}, body(SIT - 12 * s_, 3 * S(2 * a), 0, 0.015 * S(a - math.pi / 2), 0, True), look(SIT - 30 + 10 * s_),
                        bend(-6 - 4 * s_), plant('right', 0.27 + 0.06 * s_, 0.05 * up), plant('left', 0.27 + 0.06 * s_, 0.05 * up), TAILBACK)
        def tread(t):
            a = t * TAU
            return both(body(10, 0, 0, 0, 0.06 + 0.015 * S(a)), flip('right', -20 + 15 * S(a), 30 + 20 * S(a)), flip('left', -20 + 15 * S(a + math.pi), 30 + 20 * S(a + math.pi)),
                        look(6), wag(10, 0, 14, t))
        def swim(t, f=0):
            a = t * TAU
            return both(body(84 + 4 * f, 0, 0, -0.05, 0.25, True), look(50 - 6 * f), bend(8 * S(a)), wag(-20, 0, 26 + 18 * f, t),
                        flip('right', -10 + 12 * S(a), -55 + 25 * S(a)), flip('left', -10 + 12 * S(a), -55 + 25 * S(a)))
        WATER_ARMS = both(flip('right', -25, 30), flip('left', -25, 30))

    # 순간이동 (귀환, NPC에게, 포탈로): gathering itself before it vanishes: upright and still in the water, head bowed,
    # the paws (flippers, forelegs) drawn together before the chest, legs drawn up, breathing slow and deep as it rises
    # a little
    def focus(t):
        br = S(t * TAU)
        if plan == 'quad':
            return both(body(-6, 0, 0, 0, 0.1 + 0.015 * br), fore('right', 35, 55), fore('left', 35, 55), leg('right', 40, 0, 45), leg('left', 40, 0, 45),
                        look(-14 + 2 * br), wag(-10, 0, 4, t))
        if plan in ('seal', 'mermaid'):
            return both(body(12, 0, 0, 0, 0.07 + 0.015 * br), look(-18 + 2 * br), bend(6 + 2 * br), arms2(-35 + 3 * br, 60, 80), wag(20, 0, 5, t))
        # (upright whatever its standing lean: a hunched Swampert straightens up too)
        # (a flipper of one bone cannot fold its paw in: held down along the side and a little forward instead)
        hands = arms2(-25 + 4 * br, 70, 75) if len(arms) > 1 else arms2(-65 + 4 * br, 35, 0)
        return both(body(4, 0, 0, 0, 0.07 + 0.012 * br, True), look(-16 + 2 * br), bend(4 + 2 * br), hands,
                    leg('right', 35, 8, 70, 20), leg('left', 35, 8, 70, 20), wag(25, 0, 4, t))

    WATER = both(BASE, tread(0))

    # ---- attacks (on the floating pose, slowed outside their strikes, as the Oshawott line's) ----
    SLOW = 1.7
    def slowed(ks, strikes):
        def warp(t):
            out_, last = 0.0, 0.0
            for a_, b_ in sorted(strikes):
                if t <= a_: return out_ + (t - last) * SLOW
                out_ += (a_ - last) * SLOW
                if t <= b_: return out_ + (t - a_)
                out_ += b_ - a_; last = b_
            return out_ + (t - last) * SLOW
        return [(warp(t), p) for t, p in ks], warp
    def attack(ks, hit, strikes, fps=30, hits=None):  # hits: every strike's time, for a combo that lands several
        ks, warp = slowed(ks, strikes)
        return {'fps': fps, 'keys': ks, 'hit': round(warp(hit), 3), 'wait': False, 'base': WATER,
                **({'hits': [round(warp(h), 3) for h in hits]} if hits else {})}
    def loop(fps, n, f, base=None): return {'fps': fps, 'n': n, 'pose': f, **({'base': base} if base else {})}

    R0 = both(WATER_ARMS, tread(0))  # the attacks start and end floating

    def dash(style):
        # 돌진: drawn back, then thrown forward along the charge, held through it, a jolt, and back. The style is the
        # line's: 'ram' head first, 'bite' jaws wide open, 'shoulder' a shoulder charge with the arms braced, 'drill'
        # spinning on its long axis, 'kick' feet first, 'jet' torpedo straight (flippers back)
        gather = both(R0, body(-12, 0, 0, -0.06), look(-10), arms2(-20, -20, 30), wag(15))
        lean = {'kick': 30, 'shoulder': 70}.get(style, 72)
        go = both(body(lean, 0, 0, 0.25, 0.05, True), look(-6 if style != 'bite' else 10), arms2(-15, -75, 5), leg('right', -40, 0, 10), leg('left', -40, 0, 10), wag(45))
        if style == 'bite': go = both(go, mouth(45))
        if style == 'shoulder':  # level, the near shoulder leading, that arm braced forward across the chest, the other swept back
            go = both(body(lean, -20, 0, 0.25, 0.05, True), look(6, 10), arm('right', -40, 60, 60), arm('left', -20, -75, 5), leg('right', -40, 0, 10), leg('left', -40, 0, 10), wag(45))
        if style == 'kick': go = both(body(30, 0, 0, 0.25, 0.08, True), look(-5), arms2(10, -60, 10), leg('right', 85, 0, 0, 20), leg('left', -20, 0, 70))
        ks = [(0, R0), (0.08, gather), (0.14, go)]
        if style == 'drill':  # turns over once along the charge
            for i, tt in enumerate((0.2, 0.26, 0.33, 0.4)): ks.append((tt, both(go, {'waist': [('roll', 90 * (i + 1))]}, {'root': m(0, 0, 0.05)})))
        else:
            ks += [(0.3, both(go, {'root': m(0, 0, 0.03)})), (0.4, go)]
        jolt = both(R0, body(20, 0, 0, 0.12), look(12))
        ks += [(0.47, jolt), (0.58, both(R0, body(5))), (0.7, R0)]
        return attack(ks, 0.16, [(0.08, 0.47)])

    # the shell's cannons (C['cannons'], Blastoise's), aimed by direction, and their water jets (C['jet'], meshes hidden till fired)
    guns = lambda d, k=1: {'point': {b: (d, k) for b in C.get('cannons', [])}} if C.get('cannons') else {}
    JETS = {'show': C['jet']} if C.get('jet') else {}

    def shoot(style):
        # a shot: 'mouth' head drawn back then thrust, 'cannon' braced low and the shell's cannons forward, 'throw' an
        # arm swung over to throw, 'sing' head up and arms opened wide, 'finger' one arm out level and steady, 'palm'
        # both palms pushed out
        if style == 'cannon':  # (a shell with cannons, C['cannons']: they swing to the front, and the water jets show as it fires)
            ks = [(0, R0), (0.1, both(R0, body(-8, 0, 0, -0.03), look(-6), arms2(-50, 30, 40), guns((0, 0.35, 1)))),
                  (0.18, both(body(25, 0, 0, -0.04, -0.02), look(-14), arms2(-55, 60, 40), leg('right', 10, 0, 30), leg('left', 10, 0, 30), guns((0, 0.05, 1)), JETS)),
                  (0.24, both(body(15, 0, 0, -0.08, -0.01), look(-10), arms2(-55, 60, 40), leg('right', 10, 0, 30), leg('left', 10, 0, 30), guns((0, 0.3, 1)), JETS)),
                  (0.34, both(R0, body(10, 0, 0, -0.04), guns((0, 0.3, 1), 0.5))), (0.5, R0)]
        elif style == 'throw':
            ks = [(0, R0), (0.1, both(R0, body(-10, 30), arm('right', 60, -60, 60), arm('left', -20, 70, 10))),
                  (0.18, both(body(-12, 40), look(4), arm('right', 80, -90, 80), arm('left', -10, 80, 10))),
                  (0.24, both(body(20, -30, 0, 0.05), look(-6), arm('right', -10, 95, 0), arm('left', -40, -30, 20))),
                  (0.34, both(R0, body(10, -15))), (0.5, R0)]
        elif style == 'sing':
            ks = [(0, R0), (0.1, both(R0, body(-5), look(-8), arms2(-30, 60, 40))),
                  (0.18, both(body(-12, 0, 0, 0, 0.02), look(26), arms2(30, 20, 5), mouth(30))),
                  (0.24, both(body(-14, 0, 0, 0, 0.03), look(30), arms2(40, 10, 5), mouth(35))),
                  (0.34, both(R0, look(12), arms2(0, 20, 10))), (0.5, R0)]
        elif style == 'finger':
            ks = [(0, R0), (0.1, both(R0, body(0, 25), look(0, -10), arm('right', -5, 70, 5))),
                  (0.18, both(body(0, 35), look(-4, -25), arm('right', 0, 90, 0), arm('left', -60, 10, 30))),
                  (0.24, both(body(-4, 30, 0, -0.02), look(-2, -25), arm('right', 6, 92, 0), arm('left', -60, 10, 30))),
                  (0.34, both(R0, body(0, 15))), (0.5, R0)]
        elif style == 'palm':
            ks = [(0, R0), (0.1, both(R0, body(-6, 0, 0, -0.03), arms2(-20, 10, 80))),
                  (0.18, both(body(-8, 0, 0, -0.04), look(-4), arms2(-10, 20, 100))),
                  (0.24, both(body(18, 0, 0, 0.06), look(-8), arms2(0, 90, 0))),
                  (0.34, both(R0, body(8, 0, 0, 0.03))), (0.5, R0)]
        else:
            ks = [(0, R0), (0.1, both(R0, look(12), bend(-5), {'root': m(0, 0, -0.03)})),
                  (0.18, both(R0, look(16), bend(-7), arms2(10, 50, 40), {'root': m(0, 0, -0.04)}, mouth(10))),
                  (0.24, both(R0, look(-14), bend(6), arms2(0, 30, 10), {'root': m(0, 0, 0.05)}, mouth(35))),
                  (0.34, both(R0, look(-8), {'root': m(0, 0, 0.03)})), (0.5, R0)]
        return attack(ks, 0.24, [(0.18, 0.34)])

    def spin():
        # 아쿠아테일: power gathered, then let go in one turn. The body winds up the other way, crouched, the tail cocked
        # round toward the front, and holds it a beat; then it unwinds in one fast full turn, the tail whipping out
        # round it, a little past, and settles back (it ends at 360: back at 0 it would unwind)
        coil = lambda deg, k: both(R0, {'waist': [('pitch', 8 * k), ('yaw', deg)]}, bend(8 * k), look(-6 * k), wag(-25 * k, 35 * k), arms2(-40, 60, 60), {'root': m(0, -0.03 * k, 0)})
        w = lambda deg, tp, ty, up=0: both(R0, {'waist': [('pitch', -10), ('yaw', deg)]}, bend(0), look(0), wag(tp, ty), arms2(-10, 0, 10), {'root': m(0, up, 0)})
        ks = [(0, R0), (0.14, coil(-40, 0.8)), (0.26, coil(-55, 1)),
              (0.3, w(20, -40, 20)), (0.34, w(120, -45, -35)), (0.38, w(230, -45, -40, 0.02)), (0.42, w(330, -40, -30)), (0.46, w(380, -25, -15)),
              (0.56, w(360, -10, -5)), (0.72, both(R0, {'waist': [('pitch', 0), ('yaw', 360)]}))]
        return attack(ks, 0.36, [(0.26, 0.46)])

    def pump(style):
        def f(t):
            j = 1 if t * 8 % 2 < 1 else 0
            if style == 'cannon':
                return both(R0, body(22, 0, 0, -0.04 - 0.01 * abs(S(t * TAU))), look(-12 + j), arms2(-55, 60, 40), leg('right', 10, 0, 30), leg('left', 10, 0, 30),
                            guns((0, 0.05 + 0.04 * j, 1)), JETS)
            if style == 'finger':
                return both(R0, body(-4, 30, 0, -0.02 - 0.01 * abs(S(t * TAU))), look(-2 + j, -25), arm('right', 4 + j, 92, 0), arm('left', -60, 10, 30))
            return both(R0, {'root': m(0, -0.01, -0.012 - 0.012 * abs(S(t * TAU)))}, look(-12 + j), mouth(30), arms2(0, 60, 30), leg('right', -10, 15), leg('left', -10, 15))
        return loop(16, 8, f, base=WATER)

    def recharge(t):
        a = t * TAU
        return both(STAND if plan != 'quad' else {}, {'root': m(0, -0.02 - 0.006 * S(a), 0)}, bend(10 + 3 * S(a)), look(-16 + 3 * S(a)), wag(10),
                    arms2(-75, 25, 10) if plan not in ('quad',) else {})

    HURT = [(0, both(STAND, body(-14, 0, 0, -0.08, 0.02), look(12), arms2(-10, -10, 10))), (0.1, both(STAND, body(-8, 0, 0, -0.05), look(6))), (0.25, STAND)]

    ANIMS = {
        'idle': loop(10, 16, idle),
        'walk': loop(14, 12, walk),
        'float': loop(8, 12, tread), 'swim_slow': loop(12, 18, lambda t: mix(tread(t), swim(t), 0.5)),
        'swim': loop(12, 18, swim), 'swim_mid': loop(12, 18, lambda t: swim(t, 0.5)), 'swim_fast': loop(12, 18, lambda t: swim(t, 1)),
        'dash': dash(C.get('dash', 'ram')),
        'shoot': shoot(C.get('shoot', 'mouth')),
        'tail': spin(),
        'pump': pump(C.get('pump', 'mouth')),
        'recharge': loop(8, 12, recharge),
        'hurt': {'fps': 30, 'keys': HURT},
        'focus': loop(8, 16, focus),
    }
    if hair or GATHER:  # the hair hangs in every frame
        for k, A in ANIMS.items():
            if 'pose' in A: A['pose'] = (lambda f: lambda t: drape(f(t)))(A['pose'])
            else: A['keys'] = [(t, drape(p)) for t, p in A['keys']]
    for k, f in C.get('anims', {}).items():  # a species' own motions (given the library's parts)
        ANIMS[k] = f(dict(both=both, body=body, bend=bend, look=look, wag=wag, arm=arm, arms2=arms2, leg=leg, mouth=mouth, m=m,
                          attack=attack, loop=loop, R0=R0, STAND=STAND, WATER=WATER, spread=spread, tail=tail))
    # what pulls on the soft parts with weight (render3d Springs, model axes): on land they hang down and rest on the
    # ground; in the water they hardly weigh anything, lift a little at rest and trail behind as hard as the stroke drives
    LAND = {'field': (0, -1, 0), 'floor': True}
    FIELDS = {'idle': LAND, 'walk': LAND, 'recharge': LAND, 'hurt': LAND, 'float': {'field': (0, 0.05, -0.4)},
              'swim_slow': {'field': (0, -0.1, -2.5)}, 'swim': {'field': (0, -0.1, -3.5)}, 'swim_mid': {'field': (0, -0.1, -4.5)},
              'swim_fast': {'field': (0, -0.1, -5.5)}, 'dash': {'field': (0, 0, -5.5)}, 'shoot': {'field': (0, 0.02, -1.5)},
              'tail': {'field': (0, 0.02, -1.5)}, 'pump': {'field': (0, 0.02, -1.5)}, 'focus': {'field': (0, 0.05, -0.4)}}
    for k, v in FIELDS.items():
        if k in ANIMS: ANIMS[k].update(v)

    w, h = math.ceil(hp * C.get('canvas', (3.2, 2.6))[0]), math.ceil(hp * C.get('canvas', (3.2, 2.6))[1])
    return {
        'PX': PX, 'CANVAS': (w, h), 'ANCHOR': (round(w * 0.46), round(h * 0.7)), 'TRIM': 2, 'LOOK': (0, 0, 0),
        # lit from the upper right of the screen and a little in front, in four steps; the colours lifted only a little
        # (whites stay white) onto the sprite's palette with a shadow shade added per colour (SHADOWS), so the body's roundness shows
        'CAMERA': C.get('camera', (55, 14)), 'LIGHT': C.get('light', (0.29, -0.81, 0.8)), 'STEPS': ((0, 0.42), (0.3, 0.66), (0.6, 0.86), (0.88, 1.04)), 'SHADOWS': True,
        'SPRITE': f"public/sprites/{C['sp']}.png", 'FAMILIES': None, 'LIFT': C.get('lift', (0.92, 1.06)), 'CHROMA': C.get('chroma', 1.25),
        'DESPECKLE': True, 'CREASE': 0.02 * H / 0.5, 'RIMS': [], 'ROOT_BONE': 'origin', 'MOUTH_BONE': C.get('mouth_bone', jaw or head), 'MOUTH_OFFSET': C.get('mouth_offset', (0, 0, 0)),
        'SOLID': {}, 'LIMBS': [], 'SWITCHED': C.get('hide', []), 'SHOWN': [], 'FACE': None, 'SPRINGS': C.get('springs', {}), 'SPRITE_EYES': C.get('eyes'),
        'BASE': BASE, 'ANIMS': ANIMS,
    }
