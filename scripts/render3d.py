# Renders a species' animations from its 3D model (models/<species>/<species>.blend, made by scripts/dae2blend.py)
# for scripts/pixel3d.py to turn into pixel art. Runs inside Blender:
#   blender -b models/<species>/<species>.blend -P scripts/render3d.py -- <species> [anim ...]
# The animations live in scripts/<species>-3d.py (ANIMS, plus optional SETUP(scene, rig)). Every frame is rendered at
# K x the pixel size twice: flat toon colour (albedo x three light steps, emitted) and depth (for the outlines between
# overlapping parts), into models/<species>/frames/, with frames.json describing the animations.
#
# Poses: {bone: rotations, ...} where rotations are (axis, degrees) pairs or a list of them, about the model's own axes
# at rest: 'pitch' (+ swings a leg forward, tips a head up, swings a tail that points back down), 'yaw' (+ turns toward the model's left), 'roll'
# (+ tips toward the model's left: on a left leg it spreads the leg out). A bone's turn carries its children.
# 'root' = (dx, dy, dz) metres (dz forward, dy up), 'show' / 'hide' = mesh name parts to switch, '<bone>@scale' = scale
# (a number, or (x, y, z) along the bone's own axes). 'reach' = {paw bone: (other bone, 0..1[, along])} pulls
# that bone's head (a paw's wrist) by IK through its leg onto the other bone's head (or `along` the way from it to its
# child's head), the 0..1 blending from the posed leg to there. ('@bone', k, (x, y, z)) aims at a point fixed to that
# bone instead: its rest head moved by (x, y, z) metres along the model's axes; ('=', k, (x, y, z)) aims at the paw's own
# place in the standing pose moved by (x, y, z) and kept on the ground (feet that plant), ('~', ...) the same carried
# with the body (paddling). 'aim' = {paw: (blade bone, other bone, 0..1)} then turns the paw so the blade bone's
# length points at the other bone's head (a blade still in its scabbard points down the other foreleg). 'pole' =
# {paw: (x, y, z)} bends that reaching leg's elbow toward that direction (model axes, turned with the chest).
# ('_', k, (x, y, z)) aims at a spot that far above the ground at (x, z) (model axes): a flipper planted on the floor.
# 'level' = {paw: degrees} keeps those paws turned as in the standing pose (flat on the ground) whatever the leg does,
# bent that much more (+ curls the paw back, as a lifted paw does). 'point' = {blade bone: ((x, y, z), 0..1)} turns
# a held blade at its hilt to point that way (model axes, turned with the body), leaving the paw as it is. 'carry' =
# {bone: 0..1} moves a bone that has a 'carry' constraint (set up by the species' SETUP, e.g. a scalchop taken off the
# belly into a paw) that much onto its constraint's target. 'gather' = {bone: (other bone, 0..1)} turns a bone (after
# 'point') to aim at the other bone's head: strands of hair drawn in to where a tie holds them.
# S.SPRINGS = {bone name pattern: (hz, damping[, furthest swing[, weight]])}: soft parts (ears, tails, tongues, hair,
# feathers) that lag behind the body and overshoot as if they had weight, and droop or trail as the animation's 'field'
# pulls them (class Springs).
import bpy, importlib.util, json, math, os, re, sys
import numpy as np
from mathutils import Matrix, Vector, Quaternion

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = 4            # render scale over the final pixel art
PX = 0.02        # metres per final pixel (a species' PX overrides it)
AXES = {'pitch': (Vector((1, 0, 0)), -1), 'yaw': (Vector((0, 1, 0)), 1), 'roll': (Vector((0, 0, 1)), 1)}


def load_spec(species):
    spec = importlib.util.spec_from_file_location('spec', os.path.join(ROOT, 'scripts', f'{species}-3d.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m


def flatten(img, families):
    # the texture painted flat, like a cel drawing: every texel becomes the base colour of the family it is closest to
    # (blue body, cream shell, ...), so fur grain and the shading baked into the texture go; the light steps alone shade
    w, h = img.size; px = np.array(img.pixels[:], np.float32).reshape(-1, 4)
    fam = np.array(families, np.float32) / 255
    def lab(c):
        c = c[:, :3] if c.shape[1] > 3 else c
        r = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], np.float32).T / np.array([0.9505, 1, 1.089], np.float32)
        f = np.where(r > 0.008856, np.cbrt(r), 7.787 * r + 16 / 116)
        return np.stack([(116 * f[:, 1] - 16) * 0.35, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], -1)  # lightness counts less than hue
    lin = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    L = lab(lin(px[:, :3])); F = lab(lin(fam)); best = np.zeros(len(px), np.int32); bd = np.full(len(px), np.inf, np.float32)
    for i, f in enumerate(F):
        d = ((L - f) ** 2).sum(1); m = d < bd; bd[m] = d[m]; best[m] = i
    # then each texel takes the family most of the 5x5 texels round it have, so no grain is left at the edges
    lab_ = best.reshape(h, w); votes = np.zeros((len(fam), h, w), np.int16)
    for i in range(len(fam)):
        m = (lab_ == i).astype(np.int16); acc = np.zeros_like(m)
        for dy in range(-2, 3):
            for dx in range(-2, 3): acc += np.roll(np.roll(m, dy, 0), dx, 1)
        votes[i] = acc
    best = votes.argmax(0).ravel()
    out = np.concatenate([fam[best], px[:, 3:]], 1)
    flat = bpy.data.images.new(img.name + '_flat', w, h, alpha=True); flat.pixels[:] = out.ravel(); return flat


def toon(sc, families=None, steps=((0, 0.55), (0.25, 0.78), (0.7, 1.0))):
    # albedo (flattened to the species' families, if it lists them) x a stepped light (S.STEPS: shadow / half / lit ...),
    # emitted so nothing else shades it
    for m in bpy.data.materials:
        if not m.node_tree: continue
        nt = m.node_tree; tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
        if tex is None: continue
        if families: tex.image = flatten(tex.image, families)
        for n in list(nt.nodes):
            if n.name != tex.name: nt.nodes.remove(n)
        dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); s2r = nt.nodes.new('ShaderNodeShaderToRGB'); ramp = nt.nodes.new('ShaderNodeValToRGB')
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
        em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
        r = ramp.color_ramp; r.interpolation = 'CONSTANT'
        for i, (at, k) in enumerate(steps):  # (where on the light it starts, how bright)
            e = r.elements[i] if i < 2 else r.elements.new(at); e.position = at; e.color = (k, k, k, 1)
        nt.links.new(dif.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs['Color'], ramp.inputs['Factor'])
        nt.links.new(tex.outputs['Color'], mul.inputs[6]); nt.links.new(ramp.outputs['Color'], mul.inputs[7])
        nt.links.new(mul.outputs[2], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    # the light step alone (render3d's frame_l: which step each pixel is in, so pixel3d can shade by step without the albedo)
    lm = bpy.data.materials.new('light'); nt = lm.node_tree; nt.nodes.clear()
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse'); s2r = nt.nodes.new('ShaderNodeShaderToRGB'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial'); r = ramp.color_ramp; r.interpolation = 'CONSTANT'
    for i, (at, k) in enumerate(steps):
        e = r.elements[i] if i < 2 else r.elements.new(at); e.position = at; e.color = (k / LIGHT_SCALE, k / LIGHT_SCALE, k / LIGHT_SCALE, 1)
    nt.links.new(dif.outputs[0], s2r.inputs[0]); nt.links.new(s2r.outputs['Color'], ramp.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    global LIGHT_MAT; LIGHT_MAT = lm
    dm = bpy.data.materials.new('depth'); nt = dm.node_tree; nt.nodes.clear()
    cd = nt.nodes.new('ShaderNodeCameraData'); mr = nt.nodes.new('ShaderNodeMapRange'); em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    mr.inputs['From Min'].default_value = DEPTH[0]; mr.inputs['From Max'].default_value = DEPTH[1]
    nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value']); nt.links.new(mr.outputs['Result'], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface'])
    return dm


DEPTH = (4.0, 8.0)  # camera distances mapped to the depth image's black..white
LIGHT_SCALE = 1.25  # the light pass stores each step's brightness / this (the lit step is over 1)
LIGHT_MAT = None
CAM_DIST = 6.0


def aim_camera(cam, S, look):
    # place the camera so the world point `look` lands on the canvas' ANCHOR pixel
    W, H = S.CANVAS; rot = cam.rotation_euler.to_matrix(); right, up = rot.col[0], rot.col[1]
    az, el = math.radians(S.CAMERA[0]), math.radians(S.CAMERA[1])
    d = Vector((-math.cos(az) * math.cos(el), -math.sin(az) * math.cos(el), math.sin(el)))
    ax, ay = S.ANCHOR; cam.location = look + d * CAM_DIST - ((ax - W / 2) * PX * right + (H / 2 - ay) * PX * up)


def setup(sc, S):
    sc.render.engine = 'BLENDER_EEVEE'; sc.render.film_transparent = True; sc.render.filter_size = 0
    sc.eevee.taa_render_samples = 1; sc.view_settings.view_transform = 'Standard'
    W, H = S.CANVAS; sc.render.resolution_x, sc.render.resolution_y = W * K, H * K
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(W, H) * PX
    az, el = math.radians(S.CAMERA[0]), math.radians(S.CAMERA[1])
    d = Vector((-math.cos(az) * math.cos(el), -math.sin(az) * math.cos(el), math.sin(el)))  # from the model's right, toward its front
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); aim_camera(cam, S, Vector(S.LOOK))
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sc.collection.objects.link(sun); sun.data.energy = 4
    sun.rotation_euler = (-Vector(S.LIGHT).normalized()).to_track_quat('-Z', 'Y').to_euler()
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0, 0, 0)
    return toon(sc, getattr(S, 'FAMILIES', None), getattr(S, 'STEPS', ((0, 0.55), (0.25, 0.78), (0.7, 1.0))))


def apply(rig, pose, meshes, S):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
        if 'carry' in pb.constraints: pb.constraints['carry'].influence = min(1.0, pose.get('carry', {}).get(pb.name, 0))
    for name, v in pose.items():
        if name in ('root', 'show', 'hide', 'reach', 'aim', 'pole', 'level', 'point', 'gather', 'carry', 'ground') or name.startswith('_'): continue
        if name.endswith('@scale'):
            rig.pose.bones[name[:-6]].scale = (v, v, v) if isinstance(v, (int, float)) else v; continue
        pb = rig.pose.bones[name]; R = Matrix.Identity(3)
        for ax, deg in ([v] if isinstance(v[0], str) else v):
            axis, sgn = AXES[ax]; R = Matrix.Rotation(math.radians(deg * sgn), 3, axis) @ R
        M = pb.bone.matrix_local.to_3x3()
        pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion() @ pb.rotation_quaternion
    if 'root' in pose:  # whole-body shift, in the model's own axes (x left, y up, z forward)
        pb = rig.pose.bones[S.ROOT_BONE]; M = pb.bone.matrix_local.to_3x3()
        pb.location = M.inverted() @ Vector(pose['root'])
    shown = set(S.SHOWN) | set(pose.get('show') or ()); hidden = set(pose.get('hide') or ())
    for o in meshes:
        tag = next((t for t in S.SWITCHED if t in o.name), None)
        if tag: o.hide_render = not (tag in shown and tag not in hidden)


def extras(sc, rig, S):
    # what a species adds to its model (all optional):
    #   S.ADD_BONES = {name: (parent, (x, y, z))}: a bone with no vertices at that point (armature space), turned as its
    #     parent (a paw for a forearm that has none)
    #   S.CARRY = {bone: (paw, (dx, dy, dz)[, (X, Z)])}: a grip in that paw, offset from it, turned as the bone is at
    #     rest or so that the bone's X and Z axes point those ways (armature space); the bone gets a 'carry' constraint
    #     onto it (poses' 'carry'), so a scalchop on the body can be held
    #   S.BLADE_BONES = {side: (bone, along)}: a bone <side>_blade `along` metres out of that bone along its X, turned as
    #     it is: what that side cuts with (a held scalchop's fan edge), for 'point', Edge and Collide (S.BLADES)
    add, carry, blades = getattr(S, 'ADD_BONES', {}), getattr(S, 'CARRY', {}), getattr(S, 'BLADE_BONES', {})
    if not (add or carry or blades): return
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT'); eb = rig.data.edit_bones
    def like(name, src, head, parent):
        b = eb.new(name); b.head = Vector(head); b.tail = b.head + (src.tail - src.head); b.roll = src.roll; b.parent = parent; return b
    for name, (parent, at) in add.items(): like(name, eb[parent], at, eb[parent])
    for bone, (paw, off, *axes) in carry.items():
        g = like(f'{bone}_grip', eb[bone], eb[paw].head + Vector(off), eb[paw])
        if axes:
            X, Z = (Vector(v).normalized() for v in axes[0]); g.tail = g.head + Z.cross(X).normalized() * (g.tail - g.head).length; g.align_roll(Z)
    for side, (bone, along) in blades.items():
        c = eb[bone]; like(f'{side}_blade', c, c.head + c.matrix.to_3x3().col[0].normalized() * along, c)
    bpy.ops.object.mode_set(mode='OBJECT')
    for bone in carry:
        c = rig.pose.bones[bone].constraints.new('COPY_TRANSFORMS'); c.name = 'carry'; c.target = rig; c.subtarget = f'{bone}_grip'; c.influence = 0


def solve_leg(rig, paw, target, pole=None):
    # two-bone IK: turn the upper leg, then the forearm, so the paw bone's head lands on target (armature space), the
    # elbow staying on the side it was bent toward, or bent toward `pole` (model axes, turned with the chest)
    h = rig.pose.bones[paw]; e = h.parent; u_ = e.parent
    S, E, W = u_.head.copy(), e.head.copy(), h.head.copy()
    a, b = (E - S).length, (W - E).length; D = target - S
    d = min(max(D.length, abs(a - b) + 1e-4), a + b - 1e-4); u = D.normalized()
    if pole:
        c = u_.parent; R = c.matrix.to_3x3() @ c.bone.matrix_local.to_3x3().inverted(); E = S + R @ Vector(pole)
    side = (E - S) - u * (E - S).dot(u)
    if side.length < 1e-6: side = u.orthogonal()
    k = (a * a - b * b + d * d) / (2 * d); E2 = S + u * k + side.normalized() * math.sqrt(max(0.0, a * a - k * k))
    turn = lambda pb, at, v0, v1: setattr(pb, 'matrix', Matrix.Translation(at) @ v0.rotation_difference(v1).to_matrix().to_4x4() @ Matrix.Translation(-at) @ pb.matrix)
    turn(u_, S, E - S, E2 - S); bpy.context.view_layer.update()
    E1, W1 = e.head.copy(), h.head.copy()
    turn(e, E1, W1 - E1, S + u * d - E1); bpy.context.view_layer.update()


BASE_AT = {}  # every bone's head in the standing pose (armature space)
BASE_MAT = {}  # and its whole matrix (how it is turned)
MISSED = []  # reaches that fell short this frame (paw, metres), for --check
BODY = 'origin'  # the bone that carries the whole body (S.ROOT_BONE)
POINT_BY = {}  # blade bone -> the bone 'point' turns to aim it (S.POINT_BY; default the blade bone itself, at its hilt)


def gather(rig, pose):
    for b, (other, k) in pose.get('gather', {}).items():  # strands drawn in to a tie: aimed at another bone's head, in order
        if k <= 0: continue
        bl, o = rig.pose.bones[b], rig.pose.bones[other]
        q = Quaternion().slerp(bl.matrix.col[0].to_3d().rotation_difference(o.head - bl.head), min(1.0, k))
        bl.matrix = Matrix.Translation(bl.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-bl.head) @ bl.matrix
        bpy.context.view_layer.update()


def reach(rig, pose):
    # each reach aims at a point on the other leg, which itself moves when that leg reaches: settle in a few rounds
    goals = {b: v for b, v in pose.get('reach', {}).items() if v[1] > 0}
    for _ in range(3 if len(goals) > 1 else 1):
        for b, (other, k, *along) in goals.items():  # along: that far from the other bone's head toward its child's
            if other == '_':  # a spot on the ground (model axes, its height the ground's): a flipper planted in front
                at = Vector((along[0][0], FLOOR_Y + along[0][1], along[0][2]))
                w = rig.pose.bones[b].head.copy(); solve_leg(rig, b, w.lerp(at, min(1.0, k))); continue
            if other in ('=', '~'):  # the paw's own place in the standing pose, moved: '=' on the ground, '~' with the body
                at = BASE_AT[b] + Vector(along[0])
                if other == '~': o = rig.pose.bones[BODY]; at = o.matrix @ o.bone.matrix_local.inverted() @ at
                w = rig.pose.bones[b].head.copy(); solve_leg(rig, b, w.lerp(at, min(1.0, k))); continue
            o = rig.pose.bones[other.lstrip('@')]
            if other.startswith('@'):  # a point fixed to that bone: its rest head plus an offset (model axes), carried along
                at = o.matrix @ o.bone.matrix_local.inverted() @ (o.bone.head_local + Vector(along[0]))
            else: at = o.head.lerp(o.children[0].head, along[0]) if along else o.head
            w = rig.pose.bones[b].head.copy(); goal = w.lerp(at, min(1.0, k)); solve_leg(rig, b, goal, pose.get('pole', {}).get(b))
            if _ == (2 if len(goals) > 1 else 0) and k >= 0.99 and (rig.pose.bones[b].head - goal).length > 0.03:
                MISSED.append((b, (rig.pose.bones[b].head - goal).length))  # the last round fell short: the leg cannot reach
    for b, flex in pose.get('level', {}).items():  # paws kept turned as when standing (flat on the ground), bent by flex
        h = rig.pose.bones[b]; R = Matrix.Rotation(math.radians(-flex), 3, Vector((1, 0, 0))) @ BASE_MAT[b].to_3x3()
        h.matrix = Matrix.Translation(h.head) @ R.to_4x4(); bpy.context.view_layer.update()
    for b, (at, k) in pose.get('point', {}).items():  # blade bones turned at the hilt to point a way (model axes, with the body)
        if k <= 0: continue
        bl, o = rig.pose.bones[b], rig.pose.bones[BODY]; R = o.matrix.to_3x3() @ o.bone.matrix_local.to_3x3().inverted()
        q = Quaternion().slerp(bl.matrix.col[0].to_3d().rotation_difference(R @ Vector(at).normalized()), min(1.0, k))
        pv = rig.pose.bones[POINT_BY.get(b, b)]  # (a blade fixed to a shell in the paw turns with the paw)
        pv.matrix = Matrix.Translation(pv.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-pv.head) @ pv.matrix
        bpy.context.view_layer.update()
    gather(rig, pose)
    for b, (blade, other, k) in pose.get('aim', {}).items():  # then turn the paw so its blade points at a bone
        if k <= 0: continue
        h, bl, o = rig.pose.bones[b], rig.pose.bones[blade], rig.pose.bones[other]
        have = bl.matrix.col[0].to_3d(); want = o.head - bl.head
        q = Quaternion().slerp(have.rotation_difference(want), min(1.0, k))
        h.matrix = Matrix.Translation(h.head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h.head) @ h.matrix
        bpy.context.view_layer.update()


GROUND = 0.0  # the ground's height (world z): the standing pose's lowest point (main)
TALL = 1.0  # and how tall the standing pose is (main)
FLOOR_Y = 0.0  # the ground's height in the armature's own axes (main)
def pose(rig, q, meshes, S):
    # a pose put on: turns, then the reaches; with 'ground' the whole body is then moved up or down so its lowest point
    # (a planted foot) sits on the ground, for a walk on stiff legs whose height comes from how far apart the feet are
    apply(rig, q, meshes, S); bpy.context.view_layer.update(); reach(rig, q)
    if q.get('ground'):
        dg = bpy.context.evaluated_depsgraph_get()
        low = min((o.matrix_world @ v.co).z for o in meshes if not o.hide_render for v in o.evaluated_get(dg).data.vertices)
        r = q.get('root', (0, 0, 0)); q = {**q, 'root': (r[0], r[1] + GROUND - low, r[2])}
        apply(rig, q, meshes, S); bpy.context.view_layer.update(); reach(rig, q)


def lerp(a, b, k, S):
    # poses blend per bone by rotation (each listed axis turn is blended), root linearly; switches flip at the end
    k = k * k * (3 - 2 * k); out = {}
    for key in set(a) | set(b):
        va, vb = a.get(key), b.get(key)
        if key in ('show', 'hide'): out[key] = vb if k >= 0.999 else va if va is not None else (); continue
        if key in ('pole', 'gather'): out[key] = (vb if k >= 0.5 else va) or vb or va; continue
        if key in ('level', 'carry'):
            va, vb = va or {}, vb or {}
            out[key] = {r: va.get(r, vb.get(r)) + (vb.get(r, va.get(r)) - va.get(r, vb.get(r))) * k for r in set(va) | set(vb)}; continue
        if key == 'point':  # directions given at both ends turn from one to the other; one given alone fades in or out
            # (in the order given: a strand or an arm is pointed root first, or turning the root swings the rest away)
            va, vb = va or {}, vb or {}; out[key] = {}
            for r in dict.fromkeys([*va, *vb]):
                da, db = (Vector(x[r][0]).normalized() if r in x else None for x in (va, vb))
                d = da.slerp(db, k) if da is not None and db is not None and da.dot(db) > -0.99 else (db if db is not None else da)
                out[key][r] = (tuple(d), (va[r][1] if r in va else 0) + ((vb[r][1] if r in vb else 0) - (va[r][1] if r in va else 0)) * k)
            continue
        if key == 'aim':
            va, vb = va or {}, vb or {}
            out[key] = {r: (*(vb.get(r) or va.get(r))[:2], (va[r][2] if r in va else 0) + ((vb[r][2] if r in vb else 0) - (va[r][2] if r in va else 0)) * k) for r in set(va) | set(vb)}; continue
        if key == 'reach':
            va, vb = va or {}, vb or {}
            out[key] = {r: ((vb.get(r) or va.get(r))[0], va.get(r, (0, 0))[1] + (vb.get(r, (0, 0))[1] - va.get(r, (0, 0))[1]) * k, *(vb.get(r) or va.get(r))[2:]) for r in set(va) | set(vb)}; continue
        if key == 'root' or key.endswith('@scale'):
            d = (0, 0, 0) if key == 'root' else (1, 1, 1)
            va, vb = [d if v is None else (v, v, v) if isinstance(v, (int, float)) else tuple(v) for v in (va, vb)]
            out[key] = tuple(x + (y - x) * k for x, y in zip(va, vb)); continue
        la = [va] if va and isinstance(va[0], str) else list(va or []); lb = [vb] if vb and isinstance(vb[0], str) else list(vb or [])
        if [ax for ax, _ in la] == [ax for ax, _ in lb]:  # the same turns in the same order (merged poses repeat an axis): turn by turn
            out[key] = [(ax, da + (db - da) * k) for (ax, da), (_, db) in zip(la, lb)]; continue
        # else each axis's turns summed (a pose built with both() can list an axis twice: blending each entry to the
        # other side's total turned it twice over, a full spin into two)
        da, db = {}, {}
        for d_, l_ in ((da, la), (db, lb)):
            for ax, deg in l_: d_[ax] = d_.get(ax, 0) + deg
        axes = list(dict.fromkeys([ax for ax, _ in la] + [ax for ax, _ in lb]))
        out[key] = [(ax, da.get(ax, 0) + (db.get(ax, 0) - da.get(ax, 0)) * k) for ax in axes]
    return out


def turns(v): return [] if not v else [v] if isinstance(v[0], str) else list(v)


def on_base(base, pose):
    # an animation pose on top of the species' standing pose: turns add after the base's, the root shift adds
    out = dict(base)
    for k, v in pose.items():
        if k in ('reach', 'aim', 'pole', 'level', 'point', 'gather', 'carry'): out[k] = v
        elif k == 'root' and 'root' in base: out[k] = tuple(a + b for a, b in zip(base[k], v))
        elif k in base and k not in ('show', 'hide') and not k.endswith('@scale'): out[k] = turns(base[k]) + turns(v)
        else: out[k] = v
    return out


def frames_of(spec, S):
    if 'pose' in spec: return [spec['pose'](i / spec['n']) for i in range(spec['n'])]
    keys = spec['keys']; end = keys[-1][0]; n = int(round(end * spec['fps'])) + 1; out = []
    for i in range(n):
        t = i / spec['fps']; j = max(k for k in range(len(keys)) if keys[k][0] <= t + 1e-9)
        if j == len(keys) - 1: out.append(keys[j][1]); continue
        (t0, p0), (t1, p1) = keys[j], keys[j + 1]
        out.append(lerp(p0, p1, (t - t0) / (t1 - t0), S))
    return out


# a part moving SMEAR_PX final pixels or more between frames is smeared: the poses it passes through are sampled every
# SMEAR_STEP pixels of that motion (at most SMEAR_MAX), colour only, for pixel3d to expose as one long exposure
SMEAR_PX, SMEAR_STEP, SMEAR_MAX = 5, 2, 12
SWING = math.radians(35)  # the furthest a spring bone swings from where the pose puts it (less further down a chain)


class Springs:
    # soft parts (S.SPRINGS) lag behind the body and overshoot as if they had weight: each bone's tip is a damped spring
    # (hz: how stiff, damping: 1 settles without a wobble) pulled to where the pose puts it, a level of the hierarchy at a
    # time so the lower bones of a strand swing on the upper ones. A part with weight also bends, bone by bone, the way
    # the animation's field pulls (its 'field', model axes: down on land; in the water the drag of the stroke and a
    # little lift), so a tail or a long tongue droops and settles on the ground (its 'floor') and hair trails behind a
    # swimmer
    def __init__(self, rig, S):
        # S.SPRINGS = {bone name pattern: (hz, damping[, furthest swing in degrees[, weight]])}; a bone further down a
        # matched chain is softer (its tip swings more)
        self.rig, self.cfg = rig, {}
        for bn in rig.data.bones:
            for pat, (hz, z, *more) in getattr(S, 'SPRINGS', {}).items():
                if re.fullmatch(pat, bn.name):
                    self.cfg[bn.name] = (hz, z, math.radians(more[0]) if more else SWING, more[1] if len(more) > 1 else 0.0); break
        for n, (hz, z, most, wt) in list(self.cfg.items()):
            k, a = 0, rig.data.bones[n].parent
            while a is not None:
                k += a.name in self.cfg; a = a.parent
            self.cfg[n] = (hz * max(0.6, 0.85 ** k), z, most * 0.7 ** k, wt)  # (a long chain's tip still settles within a loop)
        depth = lambda b: 0 if b.parent is None else 1 + depth(b.parent)
        levels = {}
        for n in self.cfg: levels.setdefault(depth(rig.data.bones[n]), []).append(n)
        # a joint's X axis runs along its part (these rigs' bone tails do not): the tip is that far along it, to the next joint
        bn = rig.data.bones; self.len = {n: (bn[n].children[0].head_local - bn[n].head_local).length if bn[n].children else bn[n].length for n in self.cfg}
        self.levels = [levels[d] for d in sorted(levels)]; self.reset()
        self.W = rig.matrix_world.copy(); self.Wi = self.W.inverted(); self.up = (self.Wi.to_3x3() @ Vector((0, 0, 1))).normalized()

    def reset(self): self.p, self.v = {}, {}

    def step(self, dt, field=(0, 0, 0), floor=None):
        F = Vector(field)
        for level in self.levels:
            for n in level:
                pb = self.rig.pose.bones[n]; L = self.len[n]
                if L < 1e-6: continue
                hz, z, most, wt = self.cfg[n]
                head = pb.head.copy(); along = pb.matrix.col[0].to_3d().normalized()
                goal = head + (along + F * wt).normalized() * L  # (where the pose and the pull of the field put the tip)
                w = 2 * math.pi * hz; p, v = self.p.get(n, goal), self.v.get(n, Vector((0, 0, 0)))
                m = max(1, round(dt * 240)); h = dt / m
                for _ in range(m):
                    v = v + (w * w * (goal - p) - 2 * z * w * v) * h; p = p + v * h
                    u = (p - head).normalized(); p = head + u * L; v = v - u * v.dot(u)  # the bone keeps its length
                    if floor is not None and (self.W @ p).z < floor:  # it lies on the ground, not through it
                        pw = self.W @ p; pw.z = floor; p = self.Wi @ pw; v = v - self.up * min(0, v.dot(self.up))
                ug, u = (goal - head) / L, (p - head) / L; ang = ug.angle(u, 0)
                if ang > most and not (floor is not None and (self.W @ p).z <= floor + 1e-4):  # a soft part swings so far
                    p = head + ug.slerp(u, most / ang, ug.orthogonal()) * L; v = v * 0.5  # and no further (a hop would flip hair over the head)
                self.p[n], self.v[n] = p, v
                q = along.rotation_difference((p - head).normalized())
                pb.matrix = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ pb.matrix
            bpy.context.view_layer.update()


def holding(rig, held, side):  # a side with a scalchop (S.HELD: side -> carried bone) has it in its paw
    if side not in held: return True
    c = rig.pose.bones[held[side]].constraints.get('carry'); return bool(c) and c.influence > 0.5


class Collide:
    # Collision handling between the forelegs (forearm, paw, and a drawn blade) and the body. The body's solid parts
    # (S.SOLID: name -> bones; the first carries it) are each an ellipsoid fitted at rest to the vertices those bones
    # own, a little inside the surface. Every frame, after the pose and the reaches: a blade inside any part turns its
    # paw's wrist the least that frees it; a forearm or paw inside one is pushed out along the way out of that part,
    # re-solving its leg by IK. Touching a surface is fine (a thin skin is allowed); going into it is not.
    SKIN = 0.97

    def __init__(self, rig, meshes, S):
        self.rig = rig; self.blades = getattr(S, 'BLADES', {}); self.tip = getattr(S, 'BLADE_TIP', 0); dg = bpy.context.evaluated_depsgraph_get(); mw = rig.matrix_world.inverted()
        held = getattr(S, 'HELD', {}); self.held = {side: carrier for side, (carrier, _) in held.items()}
        own = {b: name for name, bones in S.SOLID.items() for b in bones}; pts = {name: [] for name in S.SOLID}; self.movers = {}
        for o in meshes:
            names = {g.index: g.name for g in o.vertex_groups}; ev = o.evaluated_get(dg).data; picked = []
            side = 'right' if o.name.find('right_sword_b') >= 0 else 'left' if 'left_sword_b' in o.name else None
            shell = {g: sd for sd, (_, pre) in held.items() for g in names.values() if g.startswith(pre)}  # a held scalchop's groups
            for v, ve in zip(o.data.vertices, ev.vertices):
                if not v.groups: continue
                top = names[max(v.groups, key=lambda g: g.weight).group]
                if top in own and not side: pts[own[top]].append(mw @ (o.matrix_world @ ve.co))
                elif side: picked.append((v.index, 'blade', side))
                elif top in shell: picked.append((v.index, 'blade', shell[top]))
                elif any(top.startswith(l) for l in S.LIMBS): picked.append((v.index, 'limb', top.split('_')[0]))
            self.movers[o.name] = picked
        self.parts = []; self.turned = {}
        for name, bones in S.SOLID.items():
            pb = rig.pose.bones[bones[0]]; inv = pb.bone.matrix_local.inverted(); local = [inv @ p for p in pts[name]]
            lo = Vector([min(p[i] for p in local) for i in range(3)]); hi = Vector([max(p[i] for p in local) for i in range(3)])
            self.parts.append((name, pb, (lo + hi) / 2, (hi - lo) / 2 * 0.88))

    def hits(self, meshes):
        # every mover point inside a part: (kind, side, part, how deep 0..1, the point and the part's centre, armature space)
        dg = bpy.context.evaluated_depsgraph_get(); mw = self.rig.matrix_world.inverted(); out = []
        frames = [(name, pb.matrix.copy(), c, r) for name, pb, c, r in self.parts]  # bone space -> armature, as posed
        for o in meshes:
            if o.hide_render or not self.movers.get(o.name): continue
            ev = o.evaluated_get(dg).data.vertices
            for i, kind, side in self.movers[o.name]:
                if kind == 'blade' and not holding(self.rig, self.held, side): continue  # a scalchop still on the body
                p = mw @ (o.matrix_world @ ev[i].co)
                for name, M, c, r in frames:
                    q = M.inverted() @ p - c; d = math.sqrt(sum((q[k] / r[k]) ** 2 for k in range(3)))
                    if d < self.SKIN: out.append((kind, side, name, 1 - d, p, M @ c))
        return out

    def resolve(self, rig, meshes):
        for _ in range(4):
            hits = self.hits(meshes)
            if not hits: return
            for side in {s for k, s, *_ in hits if k == 'blade'}:  # blades: the least wrist turn that frees them
                h = rig.pose.bones[f'{side}_hand']; base = h.matrix.copy(); best = None
                # first turn the blade within its own flat (about the flat's normal: the edge still leads), the way it
                # went last frame first so it does not jump; failing that, any way
                flat = rig.pose.bones[self.blades[side]].matrix.col[2].to_3d().normalized()
                axes = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
                if side in self.turned: axes.remove(self.turned[side]); axes.insert(0, self.turned[side])
                # (of the turns that free it, the one leaving the tip lowest: a blade escapes downward, not up past the head)
                bl = rig.pose.bones[self.blades[side]]
                for deg in (10, 20, 35, 50, 70, 90):
                    free = []
                    for axis in [tuple(flat), tuple(-flat)] * (deg <= 50) + axes:
                        R = Matrix.Rotation(math.radians(deg), 4, Vector(axis))
                        h.matrix = Matrix.Translation(h.head) @ R @ Matrix.Translation(-h.head) @ base; bpy.context.view_layer.update()
                        if not any(k == 'blade' and s == side for k, s, *_ in self.hits(meshes)):
                            free.append(((axis not in axes) * -10 + (bl.matrix @ Vector((self.tip, 0, 0))).y, axis, h.matrix.copy()))
                    if free:
                        _, axis, best = min(free, key=lambda f: f[0])
                        if axis in axes: self.turned[side] = axis
                        break
                h.matrix = best or base; bpy.context.view_layer.update()
            for side in {s for k, s, *_ in hits if k == 'limb'}:  # forearms and paws: pushed out of the part they are in
                k, s, name, deep, p, c = max((x for x in hits if x[0] == 'limb' and x[1] == side), key=lambda x: x[3])
                h = rig.pose.bones[f'{side}_hand']
                solve_leg(rig, f'{side}_hand', h.head + (p - c).normalized() * (0.02 + deep * 0.15))


class Edge:
    # A swung blade cuts with its edge, not its flat: each frame the paw twists about the blade's length so that the
    # edge (the blade bone's Y; its X runs along the blade, its Z is the flat's normal) faces the way the tip is
    # moving. Double-edged, so whichever edge needs less twist (and stays nearest the last frame's) leads; frames where
    # the tip hardly moves keep the last twist.
    def __init__(self, S): self.S = S; self.reset()
    def reset(self): self.tip, self.twist, self.score, self.after = {}, {}, [], []

    def _shown(self, rig, meshes, side):
        held = {sd: c for sd, (c, _) in getattr(self.S, 'HELD', {}).items()}
        if side in held: return holding(rig, held, side)
        return any(f'{side}_sword_b' in o.name and not o.hide_render for o in meshes)

    def apply(self, rig, meshes):
        for side, bone in getattr(self.S, 'BLADES', {}).items():
            if not self._shown(rig, meshes, side): self.tip.pop(side, None); self.twist.pop(side, None); continue
            b = rig.pose.bones[bone]; L = b.matrix.to_3x3(); x, y, z = (L.col[i].normalized() for i in range(3))
            th = self.twist.get(side, 0.0)
            if side in self.tip:
                m = b.matrix @ Vector((self.S.BLADE_TIP, 0, 0)) - self.tip[side]; m -= x * m.dot(x)
                if m.length > 0.015:
                    a = math.atan2(m.dot(z), m.dot(y)); self.score.append(abs(math.cos(a)))  # 1 = already edge first
                    th = min((a, a - math.pi, a + math.pi), key=lambda c: abs(c - self.twist[side]) if side in self.twist else abs(c))
            self.twist[side] = th
            if th:
                h = rig.pose.bones[f'{side}_hand']; at = b.head.copy()
                h.matrix = Matrix.Translation(at) @ Matrix.Rotation(th, 4, x) @ Matrix.Translation(-at) @ h.matrix
                bpy.context.view_layer.update()

    def record(self, rig, meshes):
        for side, bone in getattr(self.S, 'BLADES', {}).items():
            if not self._shown(rig, meshes, side): continue
            b = rig.pose.bones[bone]; tip = b.matrix @ Vector((self.S.BLADE_TIP, 0, 0))
            if side in self.tip:  # how edge-first the frame really ended up (after collisions too)
                L = b.matrix.to_3x3(); x, y = L.col[0].normalized(), L.col[1].normalized()
                m = tip - self.tip[side]; m -= x * m.dot(x)
                if m.length > 0.015: self.after.append(abs(m.normalized().dot(y)))
            self.tip[side] = tip


def eye_pass(meshes, S):
    # Eyes are small: at the pixel art's size a block's commonest colour is the skin round them and they melt away. So
    # every face with an eye material (S.EYES, a pattern on material names; lids, lashes and brows aside) is marked,
    # and a third render shows those faces white, the rest black, hidden behind whatever is in front as usual.
    pat = re.compile(getattr(S, 'EYES', r'eye'), re.I); skip = re.compile(r'lid|lash|brow', re.I); any_ = False
    for o in meshes:
        names = [sl.material.name if sl.material else '' for sl in o.material_slots]
        flags = [1.0 if pat.search(n) and not skip.search(n) else 0.0 for n in names]
        if not any(flags): continue
        a = o.data.attributes.get('eye') or o.data.attributes.new('eye', 'FLOAT', 'FACE')
        a.data.foreach_set('value', [flags[p.material_index] if p.material_index < len(flags) else 0.0 for p in o.data.polygons]); any_ = True
    if not any_: return None
    m = bpy.data.materials.new('eyepass'); nt = m.node_tree; nt.nodes.clear()
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = 'eye'
    em = nt.nodes.new('ShaderNodeEmission'); out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(at.outputs['Fac'], em.inputs['Color']); nt.links.new(em.outputs[0], out.inputs['Surface']); return m


def main():
    args = sys.argv[sys.argv.index('--') + 1:]; species = args[0]; S = load_spec(species)
    check, face_only, mouth_only = '--check' in args, '--face' in args, '--mouth' in args
    args = [a for a in args if a not in ('--check', '--face', '--mouth')]
    global PX; PX = getattr(S, 'PX', PX)
    sc = bpy.context.scene; rig = sc.objects['rig']
    depth = setup(sc, S)
    extras(sc, rig, S)  # the species' additions to the model (paws, grips, water blades), before any pose
    if hasattr(S, 'SETUP'): S.SETUP(sc, rig)
    meshes = [o for o in sc.objects if o.type == 'MESH']
    global BODY; BODY = S.ROOT_BONE; POINT_BY.update(getattr(S, 'POINT_BY', {}))
    apply(rig, getattr(S, 'BASE', {}), meshes, S); bpy.context.view_layer.update()
    BASE_AT.update({pb.name: pb.head.copy() for pb in rig.pose.bones}); BASE_MAT.update({pb.name: pb.matrix.copy() for pb in rig.pose.bones})
    # the ground is where the standing paws' soles are: that height goes on the canvas' ground line
    dg = bpy.context.evaluated_depsgraph_get()
    zs = [(o.matrix_world @ v.co).z for o in meshes if not o.hide_render for v in o.evaluated_get(dg).data.vertices]; ground = min(zs)
    global TALL; TALL = max(zs) - ground  # (how tall it stands)
    global FLOOR_Y; FLOOR_Y = (rig.matrix_world.inverted() @ Vector((0, 0, ground))).y
    aim_camera(sc.camera, S, Vector((S.LOOK[0], S.LOOK[1], ground)))
    global GROUND; GROUND = ground
    outdir = os.path.join(ROOT, 'models', species, 'frames'); os.makedirs(outdir, exist_ok=True)
    names = args[1:] or list(S.ANIMS)
    meta = {}
    if os.path.exists(os.path.join(outdir, 'frames.json')): meta = json.load(open(os.path.join(outdir, 'frames.json')))
    vl = sc.view_layers[0]
    solid = Collide(rig, meshes, S); edge = Edge(S)
    eyepass = eye_pass(meshes, S)  # where the eyes are, a third render: pixel3d keeps them from melting into the skin
    # S.FACE_BONE: per frame, where the two eyes are on the canvas (the model's right eye, screen-left, first), how deep,
    # and how squarely the face turns to the camera (1 = straight at it), so pixel3d can lay the sprite's face there
    from bpy_extras.object_utils import world_to_camera_view
    eyes = {sd: sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices) for o in meshes for sd in ('r', 'l') if f'{sd}_eye' in o.name}
    toward = sc.camera.matrix_world.to_3x3().col[2].normalized()  # the camera looks down its -Z
    def face():
        hb = rig.pose.bones[S.FACE_BONE]; M = rig.matrix_world @ hb.matrix @ hb.bone.matrix_local.inverted()
        uv = [world_to_camera_view(sc, sc.camera, M @ eyes[sd]) for sd in ('r', 'l')]
        return [round(c, 2) for u in uv for c in (u.x * S.CANVAS[0], (1 - u.y) * S.CANVAS[1])] + [
            round((uv[0].z + uv[1].z) / 2, 4), round((M.to_3x3() @ Vector((0, 0, 1))).normalized().dot(toward), 3)]
    faces = hasattr(S, 'FACE_BONE') and len(eyes) == 2
    def pose_frame(p, base, cut=False):
        q = on_base(base, p); pose(rig, q, meshes, S)
        if cut: edge.apply(rig, meshes)  # swung blades lead with the edge in the sword moves
        before = {f'{sd} {k} in {part}' for k, sd, part, *_ in solid.hits(meshes)}
        solid.resolve(rig, meshes); edge.record(rig, meshes); return before
    def mouth():  # where the mouth is at rest (pixels on the canvas), for moves that come out of it
        apply(rig, on_base(getattr(S, 'BASE', {}), {}), meshes, S); bpy.context.view_layer.update()
        mb = rig.pose.bones[S.MOUTH_BONE]; at = mb.matrix @ mb.bone.matrix_local.inverted() @ (mb.bone.head_local + Vector(getattr(S, 'MOUTH_OFFSET', (0, 0, 0))))
        m = world_to_camera_view(sc, sc.camera, rig.matrix_world @ at)
        return [m.x * S.CANVAS[0], (1 - m.y) * S.CANVAS[1]]
    if mouth_only:  # the mouth point alone, into the frames already rendered (no rendering)
        meta['_']['mouth'] = mouth(); json.dump(meta, open(os.path.join(outdir, 'frames.json'), 'w'), indent=1)
        print('mouth', [round(c - a) for c, a in zip(meta['_']['mouth'], S.ANCHOR)]); return
    if face_only:  # the face data alone, into the frames already rendered (no rendering)
        for name in names:
            edge.reset(); spec = S.ANIMS[name]; base = spec.get('base', getattr(S, 'BASE', {})); meta[name]['face'] = []
            for p in frames_of(spec, S): pose_frame(p, base, spec.get('cut')); meta[name]['face'].append(face())
        meta['_']['eye_span'] = (eyes['r'] - eyes['l']).length / PX
        json.dump(meta, open(os.path.join(outdir, 'frames.json'), 'w'), indent=1); print('faces', len(names)); return
    if check:  # pose every frame (collisions handled) and report any still going into the body; render nothing
        bad = fixed = 0
        for name in names:
            edge.reset(); base = S.ANIMS[name].get('base', getattr(S, 'BASE', {})); MISSED.clear()
            for i, p in enumerate(frames_of(S.ANIMS[name], S)):
                before = pose_frame(p, base, S.ANIMS[name].get('cut')); hits = solid.hits(meshes)
                for paw, d in MISSED: print(f'MISS {name} {i}: {paw} {d * 100:.0f} cm short of its target')
                MISSED.clear()
                if before: fixed += 1; print(f'FIXED {name} {i}:', ', '.join(sorted(before)))
                if hits:
                    bad += 1; who = {}
                    for k, sd, part, *_ in hits: who[f'{sd} {k} in {part}'] = who.get(f'{sd} {k} in {part}', 0) + 1
                    print(f'CLIP {name} {i}: {max(h[3] for h in hits):.2f} deep', who)
            if edge.score: print(f'EDGE {name}: swung blades edge-first {sum(edge.score) / len(edge.score):.2f} before the twist, '
                                f'{sum(edge.after) / len(edge.after):.2f} after (worst {min(edge.after):.2f}; 1 = edge, 0 = flat)')
        print('collisions handled in', fixed, 'frames; still going in:', bad); return
    springs = Springs(rig, S)
    for name in names:
        spec = S.ANIMS[name]; poses = frames_of(spec, S)
        edge.reset(); base = spec.get('base', getattr(S, 'BASE', {}))
        springs.reset(); dt = 1 / spec['fps']; fl = GROUND + 0.03 * TALL if spec.get('floor') else None  # (a little above the soles)
        jiggle = lambda: springs.step(dt, spec.get('field', (0, 0, 0)), fl)
        if springs.levels and 'pose' in spec:  # a loop is run through once first, so its first frame follows on from its last
            for p in poses: pose_frame(p, base, spec.get('cut')); jiggle(); gather(rig, p)
            edge.reset()
        meta[name] = {'fps': spec['fps'], 'loop': 'pose' in spec, 'n': len(poses), **({'hit': spec['hit']} if 'hit' in spec else {}), **({'hit2': spec['hit2']} if 'hit2' in spec else {}), **({'hits': spec['hits']} if 'hits' in spec else {}), **({'wait': True} if spec.get('wait') else {})}
        if faces: meta[name]['face'] = []
        for f in os.listdir(outdir):  # smear passes from an earlier render of this animation
            if re.fullmatch(rf'{re.escape(name)}_\d{{3}}_m\d+_(col|z|l)\.png', f): os.remove(os.path.join(outdir, f))
        def shoot(stem, depth_too=True):  # the colour, depth and light renders of the pose as it stands
            vl.material_override = None; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
            sc.render.filepath = os.path.join(outdir, f'{stem}_col.png'); bpy.ops.render.render(write_still=True)
            sc.render.image_settings.color_mode = 'BW'; sc.render.image_settings.color_depth = '16'
            if depth_too:  # depth as 16-bit grey (Pillow reads 16-bit RGBA as 8-bit, losing the depth to 2 cm steps)
                vl.material_override = depth; sc.render.filepath = os.path.join(outdir, f'{stem}_z.png'); bpy.ops.render.render(write_still=True)
            vl.material_override = LIGHT_MAT  # the light step, 16-bit grey (sRGB-encoded, as the depth is)
            sc.render.filepath = os.path.join(outdir, f'{stem}_l.png'); bpy.ops.render.render(write_still=True)
        prev = at0 = None
        for i, p in enumerate(poses):
            pose_frame(p, base, spec.get('cut'))
            # a fast move (an attack or a flinch with some part going further than SMEAR_PX between frames) is drawn as on
            # a long exposure: the poses it passes through since the last frame are rendered too (frame_mJ, colour only),
            # and pixel3d exposes them together into one blur trailing the body
            at = [Vector((u.x * S.CANVAS[0], u.y * S.CANVAS[1])) for u in (world_to_camera_view(sc, sc.camera, rig.matrix_world @ pb.head) for pb in rig.pose.bones)]
            if prev is not None and 'pose' not in spec:
                far = max((a - b).length for a, b in zip(at, at0))
                n = min(SMEAR_MAX, math.ceil(far / SMEAR_STEP)) if far >= SMEAR_PX else 0
                for j in range(1, n + 1):
                    pose_frame(lerp(prev, p, j / (n + 1), S), base, spec.get('cut')); shoot(f'{name}_{i:03d}_m{j}', False)
                if n: pose_frame(p, base, spec.get('cut'))
            prev, at0 = p, at
            jiggle(); gather(rig, p)  # (tied strands follow the swung hair)
            if faces: meta[name]['face'].append(face())
            shoot(f'{name}_{i:03d}')
            if eyepass:
                vl.material_override = eyepass; sc.render.image_settings.color_depth = '8'
                sc.render.filepath = os.path.join(outdir, f'{name}_{i:03d}_eye.png'); bpy.ops.render.render(write_still=True)
        print('rendered', name, len(poses))
    meta['_'] = {'K': K, 'depth': DEPTH, 'light': LIGHT_SCALE, 'canvas': S.CANVAS, 'anchor': S.ANCHOR, 'mouth': mouth(),
                 **({'eye_span': (eyes['r'] - eyes['l']).length / PX} if faces else {})}
    json.dump(meta, open(os.path.join(outdir, 'frames.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
