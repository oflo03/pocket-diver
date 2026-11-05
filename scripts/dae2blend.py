# Imports a Pokémon Scarlet/Violet model ripped as COLLADA (.dae, from The Models Resource) into Blender, which
# dropped its own COLLADA importer in 5.0: the skeleton becomes an armature at its bind pose, every mesh is skinned to
# it with its vertex groups, and each material gets its albedo texture (eyes: their layer-mask colours baked in).
# The model is Y-up in metres; the armature object turns it Z-up.
#   blender -b --factory-startup -P scripts/dae2blend.py -- models/samurott/pm0503_00_00.dae models/samurott/samurott.blend [--zup]
# (Units come from the file's <unit>; --zup for the rips whose up is already Z, e.g. Quaxly and Quaquaval.)
import bpy, json, math, os, re, sys
import numpy as np
import xml.etree.ElementTree as ET
from mathutils import Matrix, Vector

NS = {'c': 'http://www.collada.org/2005/11/COLLADASchema'}
BONE_LEN = 0.04


def arr(el, kind=float): return np.array(el.text.split(), kind)


def mat4(text): return np.array(text.split(), float).reshape(4, 4)


def load(path, out, zup=None):
    root = ET.parse(path).getroot(); folder = os.path.dirname(os.path.abspath(path))
    byid = {e.get('id'): e for e in root.iter() if e.get('id')}
    # joints: name -> (parent name, world matrix in the scene)
    joints = {}; sid = {}; nodew = {}  # sid: a joint's sid -> its name (some rips' skins list joints by sid); nodew: every node's world matrix
    def local(node):
        # a node's transform: a <matrix>, or <translate> / <rotate> / <scale> steps applied in order
        L = np.eye(4)
        for t in node:
            tag = t.tag.split('}')[1]; v = np.array(t.text.split(), float) if t.text else None
            if tag == 'matrix': L = L @ v.reshape(4, 4)
            elif tag == 'translate': T = np.eye(4); T[:3, 3] = v; L = L @ T
            elif tag == 'scale': L = L @ np.diag([*v, 1])
            elif tag == 'rotate':
                ax = v[:3] / (np.linalg.norm(v[:3]) or 1); a = math.radians(v[3]); c, s = math.cos(a), math.sin(a); x, y, z = ax
                R = np.eye(4); R[:3, :3] = [[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                                            [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                                            [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]]; L = L @ R
        return L
    def walk(node, parent, pw):
        w = pw @ local(node); nodew[node] = w
        name = parent
        if node.get('type') == 'JOINT':
            joints[node.get('name')] = (parent, w); name = node.get('name')
            if node.get('sid'): sid[node.get('sid')] = name
        for ch in node.findall('c:node', NS): walk(ch, name, w)
    for n in root.find('.//c:visual_scene', NS).findall('c:node', NS): walk(n, None, np.eye(4))
    # the bind pose (inverse of each skin's inverse-bind matrix) wins over the scene pose where a skin gives one
    bind = {}
    for skin in root.iter('{%s}skin' % NS['c']):
        names = [sid.get(n, n) for n in skin.find('.//c:Name_array', NS).text.split()]
        mats = arr(skin.find(".//c:source[@id='%s']/c:float_array" % skin.find("c:joints/c:input[@semantic='INV_BIND_MATRIX']", NS).get('source')[1:], NS)).reshape(-1, 4, 4)
        for n, m in zip(names, mats): bind.setdefault(n, np.linalg.inv(m))
    world = {n: bind.get(n, w) for n, (p, w) in joints.items()}
    # some rips are in other units (inches): everything to metres
    u = root.find('c:asset/c:unit', NS); unit = float(u.get('meter', 1)) if u is not None else 1.0
    if unit != 1: world = {n: np.vstack([np.c_[w[:3, :3], w[:3, 3] * unit], w[3]]) for n, w in world.items()}
    # a Z-up rip (its <up_axis>, or --zup) is turned into the Y-up layout the others have (x, z, -y), so every rig shares
    # one set of axes (some put a turn on the scene's root node that only makes sense together with the meshes' nodes)
    ua = root.find('c:asset/c:up_axis', NS)
    if zup is None: zup = ua is not None and ua.text.strip() == 'Z_UP'
    C = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]], float) if zup else np.eye(4)
    world = {n: C @ w for n, w in world.items()}

    arm = bpy.data.armatures.new('rig'); ao = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(ao)
    ao.rotation_euler = (math.pi / 2, 0, 0)  # Y-up -> Z-up
    bpy.context.view_layer.objects.active = ao; bpy.ops.object.mode_set(mode='EDIT')
    for n, (p, _) in joints.items():
        w = world[n]; eb = arm.edit_bones.new(n)
        r = w[:3, :3] / np.linalg.norm(w[:3, :3], axis=0); t = w[:3, 3]
        eb.head = Vector(t); eb.tail = Vector(t + r[:, 1] * BONE_LEN); eb.align_roll(Vector(r[:, 2]))
    for n, (p, _) in joints.items():
        if p: arm.edit_bones[n].parent = arm.edit_bones[p]
    bpy.ops.object.mode_set(mode='OBJECT')

    mats = {}
    mat_txt = [f for f in os.listdir(folder) if f.endswith('_mat.txt')]
    # rips without a _mat.txt name their textures in the COLLADA itself: material -> effect -> sampler -> surface -> image
    images = {i.get('id'): os.path.basename(i.find('c:init_from', NS).text or '') for i in root.iter('{%s}image' % NS['c']) if i.find('c:init_from', NS) is not None}
    # a triangle list names its material by a symbol, bound to the material where the mesh is instanced
    bound = {i.get('symbol'): i.get('target', '')[1:] for i in root.iter('{%s}instance_material' % NS['c'])}
    def dae_texture(name):
        ms = {x.get('id'): x for x in root.iter('{%s}material' % NS['c'])}
        m = ms.get(bound.get(name)) or ms.get(name) or next((x for x in ms.values() if x.get('name') == name), None)
        ie = m.find('c:instance_effect', NS) if m is not None else None
        eff = byid.get(ie.get('url')[1:]) if ie is not None else None
        params = {p.get('sid'): p for p in eff.iter('{%s}newparam' % NS['c'])} if eff is not None else {}
        # an eye whose own texture is blank (its colours lived in layer masks the rip lost): the ripper's baked eye beside it
        part = name.replace('-material', ''); part = part.split('_', 1)[-1] if part.startswith(('l_', 'r_')) else part
        if 'eye' in part:
            baked = next((f for f in sorted(os.listdir(folder)) if re.search(rf'_{part}_lym_ba[c]?ked\.png$', f)), None)
            if baked: return baked
        for t in (eff.iter('{%s}texture' % NS['c']) if eff is not None else ()):
            s = params.get(t.get('texture')); src = s.find('.//c:source', NS).text if s is not None and s.find('.//c:source', NS) is not None else None
            surf = params.get(src); img = surf.find('.//c:init_from', NS).text if surf is not None and surf.find('.//c:init_from', NS) is not None else t.get('texture')
            f = images.get(img, img)
            if f and os.path.exists(os.path.join(folder, f)): return f
        # a missing file (a misspelt baked eye): the part's own albedo, e.g. l_eye-material -> *_eye_alb.png
        part = name.replace('-material', '').split('_', 1)[-1] if name.startswith(('l_', 'r_')) else name.replace('-material', '')
        part = part.rsplit('_', 1)[0] if part.split('_')[-1].isdigit() else part
        return next((f for f in sorted(os.listdir(folder)) if f.endswith(f'_{part}_alb.png')), '')
    def material(name):
        if name in mats: return mats[name]
        if not mat_txt:
            m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(folder, dae_texture(name))); t.interpolation = 'Closest'
            nt.links.new(t.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color']); mats[name] = m; return m
        info = next((m for m in json.load(open(os.path.join(folder, mat_txt[0]), encoding='utf-8')) if m['name'] == name), {})
        tex = info.get('BaseColorMap', '') + '.png'; img = os.path.join(folder, tex)
        if 'LayerMaskMap' in info: img = bake_layers(folder, info, out)
        m = bpy.data.materials.new(name); m.use_nodes = True
        nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(img); t.interpolation = 'Closest'
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        mats[name] = m; return m

    for node in root.find('.//c:visual_scene', NS).iter('{%s}node' % NS['c']):
        ic = node.find('c:instance_controller', NS)
        if ic is None: continue
        skin = byid[ic.get('url')[1:]].find('c:skin', NS); geo = byid[skin.get('source')[1:]]
        mesh = geo.find('c:mesh', NS)
        vsrc = byid[mesh.find('c:vertices/c:input[@semantic="POSITION"]', NS).get('source')[1:]]
        pos = arr(vsrc.find('c:float_array', NS)).reshape(-1, 3)
        bsm = nodew.get(node, np.eye(4)) @ mat4(skin.find('c:bind_shape_matrix', NS).text)  # (the node the skin sits on, then its bind shape)
        pos = (np.c_[pos, np.ones(len(pos))] @ bsm.T)[:, :3] * unit @ C[:3, :3].T
        faces, uvs, mat_names, loop_uv = [], None, [], []
        for tri in mesh.findall('c:triangles', NS):
            ins = tri.findall('c:input', NS); stride = max(int(i.get('offset')) for i in ins) + 1
            p = arr(tri.find('c:p', NS), int).reshape(-1, stride)
            vo = next(int(i.get('offset')) for i in ins if i.get('semantic') == 'VERTEX')
            tin = next((i for i in ins if i.get('semantic') == 'TEXCOORD'), None)
            if tin is not None:  # (some rips store u, v, w: take the accessor's stride, keep u and v)
                src = byid[tin.get('source')[1:]]; acc = src.find('.//c:accessor', NS); st = int(acc.get('stride', 2)) if acc is not None else 2
                uvs = arr(src.find('c:float_array', NS)).reshape(-1, st)[:, :2]; loop_uv += list(p[:, int(tin.get('offset'))])
            faces += [tuple(f) for f in p[:, vo].reshape(-1, 3)]; mat_names += [tri.get('material')] * (len(p) // 3)
        me = bpy.data.meshes.new(node.get('name')); me.from_pydata(pos.tolist(), [], faces); me.update()
        if uvs is not None:
            uvl = me.uv_layers.new(name='uv'); uvl.data.foreach_set('uv', uvs[loop_uv].ravel())
        names = sorted(set(mat_names), key=mat_names.index)
        for n in names: me.materials.append(material(n))
        me.polygons.foreach_set('material_index', [names.index(n) for n in mat_names])
        me.shade_smooth()
        ob = bpy.data.objects.new(node.get('name'), me); bpy.context.scene.collection.objects.link(ob); ob.parent = ao
        jn = [sid.get(n, n) for n in skin.find('.//c:Name_array', NS).text.split()]
        vw = skin.find('c:vertex_weights', NS); wsrc = vw.find("c:input[@semantic='WEIGHT']", NS).get('source')[1:]
        wts = arr(byid[wsrc].find('c:float_array', NS)); vc = arr(vw.find('c:vcount', NS), int); v = arr(vw.find('c:v', NS), int).reshape(-1, 2)
        groups = {n: ob.vertex_groups.new(name=n) for n in jn}; k = 0
        for vi, c in enumerate(vc):
            for ji, wi in v[k:k + c]: groups[jn[ji]].add([vi], float(wts[wi]), 'REPLACE')
            k += c
        mod = ob.modifiers.new('rig', 'ARMATURE'); mod.object = ao
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out))


def bake_layers(folder, info, out):
    # eyes: the albedo tinted by the layer colours through the layer mask's R, G, B channels (sclera, iris, its rim)
    lymi = bpy.data.images.load(os.path.join(folder, info['LayerMaskMap'] + '.png'))
    w, h = lymi.size; lym = np.array(lymi.pixels[:]).reshape(h, w, 4)
    ai = bpy.data.images.load(os.path.join(folder, info['BaseColorMap'] + '.png')); aw, ah = ai.size
    base = np.array(ai.pixels[:]).reshape(ah, aw, 4)
    ys = (np.arange(h) * ah // h); xs = (np.arange(w) * aw // w); col = base[ys][:, xs, :3].copy()
    for k in range(3):  # the mask's alpha is solid everywhere in these rips, so a fourth layer would paint it all over
        c = info.get(f'BaseColorLayer{k + 1}')
        if not c: continue
        c = np.array([float(x) for x in c.strip('()').split(',')[:3]]); m = lym[..., k:k + 1]
        if k == 0 and c.min() > 0.3: c = np.ones(3)  # a grey sclera drawn white, as sprites do (grey reads as a shut eye in pixel art); dark eyes stay
        col = col * (1 - m) + c * m
    img = bpy.data.images.new(info['name'] + '_baked', w, h, alpha=True)
    img.pixels[:] = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], -1).ravel()
    path = os.path.join(os.path.dirname(os.path.abspath(out)), info['name'] + '_baked.png')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save(); return path


if __name__ == '__main__':
    a = sys.argv[sys.argv.index('--') + 1:]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    load(a[0], a[1], True if '--zup' in a else None)
    print('saved', a[1])
