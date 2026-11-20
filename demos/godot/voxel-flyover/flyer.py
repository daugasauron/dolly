# Voxel Flyover's flyer, made by Blender: the surfboard, its two jets, the pelican pedalling its
# bicycle under the board for them, the chain and shaft that drive the jets' fans, and the corgi
# in sunglasses and a cape on the board, with their animations. It writes the glTF file the
# flyover reads when it starts (model.gd), MODEL or the path after "--":
#   blender -b --factory-startup --python flyer.py -- /usr/share/voxel-flyover/flyer.glb
# Run in Blender's window (the Text Editor's Run Script) it makes the flyer anew in the scene,
# where it can be looked at and changed, and writes MODEL.
# The animations: "pedal", TURNS turns of the cranks and all they drive (the legs, the chain, the
# shaft, the fans, the wheels, the pelican rocking on its saddle); "steer", the handlebar from
# full left to full right with the wings on its grips; "alive", a loop of the pelican looking
# about, blinking and clapping its bill, and the corgi panting, tilting its head and looking
# down at the pelican. The flyover seeks "pedal" by the cranks' angle and "steer" by the turn,
# and plays "alive". Parts with a coat of fur or feathers, and cloths in the wind (the cape, the
# tongue, the scarf, long feathers), carry their measures in their extras; the flyover draws
# those with its own shaders, a coat in the colours of its vertices too.
# Everything is placed in the flyover's frame, y up and looking along -z, and taken to Blender's
# axes as it is written.

import math
import sys

import bpy
from mathutils import Matrix, Vector

TAU = math.tau
FRAMES = 32  # a turn of the cranks, in frames
TURNS = 5  # the cranks' turns in "pedal", after which each of the chain's links is where it was
STEERS = 24  # "steer", from full left to full right
ALIVE = 240  # "alive": 8 s at 30 frames a second
SIZE = 1.4  # the bicycle and its rider, in the flyer's frame
HANG = Vector((0.0, 0.2, 0.0))  # where they hang
RING_TEETH = 12  # the chainring's teeth
SPROCKET_TEETH = 6  # the shaft's: the shaft and the fans turn twice for each turn of the cranks
WHEEL_RATIO = 2  # the wheels' turns for each of the cranks'
JETS = (-0.95, 0.95)
MODEL = "/usr/share/voxel-flyover/flyer.glb"  # where the flyover reads it
GODOT = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))  # a Godot vector's coordinates in Blender's


def V(x, y, z):
    return Vector((x, y, z))


# --- Materials --------------------------------------------------------------------------------

def linear(colour):
    """A colour as it is picked and as the flyover's shaders take it (sRGB), as Blender and glTF
    store it."""
    return tuple(c ** 2.2 for c in colour)


def paint(name, colour, rough=0.5, metal=0.0):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        shader = material.node_tree.nodes["Principled BSDF"]
        shader.inputs["Base Color"].default_value = (*linear(colour), 1.0)
        shader.inputs["Roughness"].default_value = rough
        shader.inputs["Metallic"].default_value = metal
        material.diffuse_color = (*linear(colour), 1.0)  # in Blender's solid view
    return material


# Colours, as they are picked (linear() gives them to Blender).
WHITE = (0.97, 0.95, 0.9)
TAN = (0.8, 0.46, 0.2)
BLACK = (0.03, 0.03, 0.04)
PAINTED = (1.0, 1.0, 1.0)  # a coat of its vertices' colours
SCARF = (0.05, 0.5, 0.62)  # the pelican's
CAPE = (0.8, 0.05, 0.08)  # the corgi's
TONGUE = (0.9, 0.38, 0.48)
GOLD = (1.0, 0.72, 0.2)
RED = (0.8, 0.05, 0.06)
STEEL = (0.55, 0.57, 0.6)
CREAM = (0.95, 0.9, 0.75)


def between(low, high, value):
    """0 below `low`, 1 above `high`, smoothly between."""
    x = min(max((value - low) / (high - low), 0.0), 1.0)
    return x * x * (3 - 2 * x)


def mix(first, second, amount):
    return tuple(a + (b - a) * amount for a, b in zip(first, second))


# --- Meshes, made in the flyover's frame ------------------------------------------------------

def mesh(name, verts, faces, uvs=None, smooth=True, colours=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata([GODOT @ v for v in verts], [], faces)
    if uvs:
        layer = data.uv_layers.new(name="UV")
        for polygon, corners in zip(data.polygons, uvs):
            for loop, uv in zip(polygon.loop_indices, corners):
                layer.data[loop].uv = uv
    if colours:
        layer = data.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        for value, colour in zip(layer.data, colours):
            value.color = (*linear(colour), 1.0)
    if smooth:
        data.shade_smooth()
    data.validate()
    return data


def loft(name, points, radii, up=V(0, 1, 0), around=16, caps=True, colours=None):
    """A tube through `points`, its cross-section at each an ellipse of `radii` (across, and
    toward `up`). Its UVs run around (u) and along (v), as a coat's hairs want them.
    `colours(v, angle)` gives each vertex a colour, by v from 0 to 1 along and its angle from
    across toward up."""
    rings = len(points)
    verts, faces, uvs, painted = [], [], [], []
    for i, point in enumerate(points):
        along = (points[min(i + 1, rings - 1)] - points[max(i - 1, 0)]).normalized()
        across = along.cross(up)
        if across.length < 1e-6:
            across = along.cross(V(0, 0, 1))
        across.normalize()
        upward = across.cross(along)
        for j in range(around):
            angle = TAU * j / around
            verts.append(point + across * radii[i][0] * math.cos(angle) + upward * radii[i][1] * math.sin(angle))
            if colours:
                painted.append(colours(i / (rings - 1), angle))
    for i in range(rings - 1):
        v0, v1 = i / (rings - 1), (i + 1) / (rings - 1)
        for j in range(around):
            k = (j + 1) % around
            faces.append((i * around + j, (i + 1) * around + j, (i + 1) * around + k, i * around + k))
            uvs.append(((j / around, v0), (j / around, v1), ((j + 1) / around, v1), ((j + 1) / around, v0)))
    if caps:
        for ring, v, backward in ((0, 0.0, True), (rings - 1, 1.0, False)):
            centre = len(verts)
            verts.append(points[ring])
            if colours:
                painted.append(colours(v, math.pi / 2))
            for j in range(around):
                face = (ring * around + j, ring * around + (j + 1) % around, centre)
                uv = ((j / around, v), ((j + 1) / around, v), ((j + 0.5) / around, v))
                faces.append(face if backward else face[::-1])
                uvs.append(uv if backward else uv[::-1])
    return mesh(name, verts, faces, uvs, colours=painted)


def body(name, semi, around=24, rings=14, shape=None, full=2.0, colours=None):
    """A rounded body along z, of semi-axes `semi`; `shape(t)`, t from -1 (ahead) to 1, gives
    factors of its width and height there and a lift of its middle, in its height's units. It
    is an ellipsoid at `full` 2, fuller toward a box above."""
    points, radii = [], []
    for i in range(rings + 1):
        t = -math.cos(math.pi * i / rings)
        s = max(1.0 - abs(t) ** full, 0.0) ** (1 / full)
        wide, high, lift = shape(t) if shape else (1.0, 1.0, 0.0)
        points.append(V(0, lift * semi[1], t * semi[2]))
        radii.append((max(semi[0] * s * wide, 1e-4), max(semi[1] * s * high, 1e-4)))
    return loft(name, points, radii, around=around, caps=False, colours=colours)


def rod(name, length, radius, around=12, tip=None):
    """A rod along y from 0 to `length`, tapering to `tip` if given."""
    return loft(name, [V(0, 0, 0), V(0, length, 0)], [(radius, radius), (tip or radius, tip or radius)],
                up=V(0, 0, -1), around=around)


def strip(name, length=1.0, width=1.0, along=8, across=1, colours=None):
    """A cloth for cape.gdshader: flat in y = 0, fixed along z = 0 and free to z = `length`.
    `colours(x, z)` paints its vertices."""
    verts, faces, uvs = [], [], []
    for i in range(along + 1):
        for j in range(across + 1):
            verts.append(V(width * (j / across - 0.5), 0, length * i / along))
    for i in range(along):
        for j in range(across):
            a = i * (across + 1) + j
            faces.append((a, a + 1, a + across + 2, a + across + 1))
            uvs.append(((j / across, i / along), ((j + 1) / across, i / along),
                        ((j + 1) / across, (i + 1) / along), (j / across, (i + 1) / along)))
    return mesh(name, verts, faces, uvs, smooth=False, colours=colours and [colours(v.x, v.z) for v in verts])


def gear(name, radius, thick, teeth, tooth, hole):
    """A toothed ring about x."""
    verts, faces = [], []
    count = teeth * 4
    for j in range(count):
        angle = TAU * (j + 0.5) / count
        r = radius + (tooth if j % 4 in (1, 2) else 0.0)
        for x in (-thick / 2, thick / 2):
            verts.append(V(x, r * math.cos(angle), r * math.sin(angle)))
            verts.append(V(x, hole * math.cos(angle), hole * math.sin(angle)))
    for j in range(count):
        a, b = j * 4, (j + 1) % count * 4
        faces += [(a + 1, b + 1, b, a), (a + 2, b + 2, b + 3, a + 3), (a, b, b + 2, a + 2), (a + 3, b + 3, b + 1, a + 1)]
    return mesh(name, verts, faces, smooth=False)


def ring(name, radius, thick, around=40, section=10, axis=V(1, 0, 0)):
    """A torus about `axis`."""
    axis = axis.normalized()
    first = V(0, 1, 0) if abs(axis.y) < 0.9 else V(1, 0, 0)
    first = (first - axis * axis.dot(first)).normalized()
    second = axis.cross(first)
    points = [(first * math.cos(TAU * i / around) + second * math.sin(TAU * i / around)) * radius for i in range(around + 1)]
    return loft(name, points, [(thick, thick)] * len(points), up=axis, around=section, caps=False)


def join(name, parts):
    """One mesh of several (mesh, placement) pairs, the placements in the flyover's frame."""
    verts, faces, uvs = [], [], []
    back = GODOT.transposed()
    for data, at in parts:
        first = len(verts)
        verts += [at @ (back @ vertex.co) for vertex in data.vertices]
        layer = data.uv_layers[0] if data.uv_layers else None
        for polygon in data.polygons:
            faces.append(tuple(first + v for v in polygon.vertices))
            uvs.append(tuple(tuple(layer.data[loop].uv) if layer else (0.0, 0.0) for loop in polygon.loop_indices))
        bpy.data.meshes.remove(data)
    return mesh(name, verts, faces, uvs)


# --- Objects ----------------------------------------------------------------------------------

def place(at=V(0, 0, 0), basis=None):
    matrix = (basis if basis is not None else Matrix.Identity(3)).to_4x4()
    matrix.translation = at
    return matrix


def turn(axis, angle):
    return Matrix.Rotation(angle, 3, Vector(axis))


def aim(along, up=V(0, 1, 0)):
    """A rotation that takes y to `along`, and z as near `up` as it goes."""
    y = along.normalized()
    x = y.cross(up)
    if x.length < 1e-6:
        x = y.cross(V(0, 0, 1))
    x.normalize()
    return Matrix((x, y, x.cross(y))).transposed()


def ahead(along, up=V(0, 1, 0)):
    """A rotation that takes -z, the way a part of the flyer looks, to `along`."""
    return aim(along, up) @ turn((1, 0, 0), math.pi / 2)


def obj(name, data, material=None, parent=None, at=V(0, 0, 0), basis=None, extras=None):
    thing = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(thing)
    if material is not None:
        data.materials.append(material)
    thing.parent = parent
    thing.rotation_mode = "QUATERNION"
    put(thing, place(at, basis))
    for key, value in (extras or {}).items():
        thing[key] = value
    return thing


def put(thing, matrix):
    """Places an object in its parent's frame, from a placement in the flyover's axes."""
    axes = GODOT.to_4x4()
    thing.matrix_basis = axes @ matrix @ axes.transposed()


def coat(colour, hair, hairs):
    return {"coat": {"colour": list(colour), "hair": hair, "hairs": list(hairs)}}


def cloth(colour, tip, widens=(1.0, -0.85), flaps=0.3, own=0.0):
    return {"cloth": {"colour": list(colour), "tip": list(tip), "widens": list(widens), "flaps": flaps, "own": own}}


feathers = 0  # each long feather's own phase in the wind


def feather(parent, root, way, face, size, colour, tip, widens=(1.0, -0.85), flaps=0.3, name="feather"):
    """A long feather, or another strip of cloth, from its root along `way`, its face toward `face`."""
    global feathers
    way = way.normalized()
    side = face.cross(way).normalized()
    basis = Matrix((side * size[0], way.cross(side), way * size[1])).transposed()
    feathers += 1
    return obj(name, strip(name, along=12), paint(f"{name} {colour}", colour, 0.6), parent, root, basis, cloth(colour, tip, widens, flaps, feathers * 1.7))


# --- The board and its jets -------------------------------------------------------------------

def build_board(root):
    """A surfboard: a pointed nose that lifts, a squared tail, a domed deck with a cream stripe
    down its middle and a red line each side of it, and three fins under the tail."""
    points, radii = [], []
    for i in range(41):
        t = i / 40  # nose to tail
        outline = math.sin(math.pi * (0.04 + 0.96 * t) ** 0.85) ** 0.6
        points.append(V(0, 0.32 * max(0.0, 0.32 - t) ** 2 / 0.1, -3.2 + 6.4 * t))
        radii.append((max(1.0 * outline + 0.12 * t * t, 0.03), max(0.15 * outline ** 0.5, 0.01)))
    board = obj("board", loft("board", points, radii, around=32), paint("board", (0.03, 0.42, 0.5), 0.2, 0.1), root)
    deck = [(p + V(0, r[1] * 0.9, 0), r) for p, r in zip(points, radii)][3:-2]
    obj("stripe", loft("stripe", [p for p, _ in deck], [(0.2 * min(1.0, r[0] * 3.0), 0.025) for _, r in deck], around=12),
        paint("cream", CREAM, 0.3), board)
    for side in (-1, 1):
        obj("pinline", loft("pinline", [p + V(side * 0.32 * min(1.0, r[0] * 3.0), -0.005, 0) for p, r in deck],
                            [(0.025, 0.02)] * len(deck), around=6), paint("red", RED, 0.4), board)
    steel = paint("steel", STEEL, 0.25, 0.85)
    for x, z, size in ((0.0, 2.65, 1.0), (-0.55, 2.25, 0.7), (0.55, 2.25, 0.7)):
        fin = loft("fin", [V(0, 0, -0.3 * size), V(0, -0.25 * size, -0.05 * size), V(0, -0.45 * size, 0.16 * size)],
                   [(0.035, 0.26 * size), (0.03, 0.2 * size), (0.012, 0.05 * size)], up=V(0, 0, 1), around=10)
        obj("fin", fin, steel, board, V(x, -0.08, z), turn((0, 1, 0), -x * 0.25))


def build_jets(root):
    """A jet under each rail: a red intake lip with a fan in it that the pelican drives, a steel
    nacelle with a red band and a cream stripe along its top, a nozzle of dark flaps, and a
    pylon up to the board. Returns the fans."""
    steel = paint("steel", STEEL, 0.25, 0.85)
    chrome = paint("chrome", (0.8, 0.82, 0.86), 0.15, 1.0)
    dark = paint("dark", (0.04, 0.04, 0.05), 0.35, 0.6)

    def livery(v, angle):
        band = between(0.56, 0.59, v) * (1 - between(0.69, 0.72, v))
        return mix(mix(STEEL, RED, band), CREAM, between(0.93, 0.97, math.sin(angle)) * (1 - band))

    fans = []
    for x in JETS:
        profile = through([(0.0, 0.3), (0.08, 0.34), (0.3, 0.36), (0.7, 0.34), (1.05, 0.29), (1.35, 0.25)], 26)
        shell = loft("nacelle", [V(0, 0, z) for z, _ in profile], [(r, r) for _, r in profile], around=32, caps=False,
                     colours=livery)
        jet = obj("jet", shell, paint("livery", (1.0, 1.0, 1.0), 0.25, 0.85), root, V(x, -0.3, 1.2))
        obj("intake", ring("intake", 0.3, 0.05, around=40, section=10, axis=V(0, 0, 1)), paint("red", RED, 0.4), jet)
        flaps = [(loft("liner", [V(0, 0, 0), V(0, 0, 0.4)], [(0.24, 0.24), (0.27, 0.27)], around=24, caps=False), place())]
        for flap in range(16):
            out = turn((0, 0, 1), TAU * flap / 16)
            flaps.append((loft("flap", [V(0, 0.25, 0), V(0, 0.3, 0.42)], [(0.055, 0.012), (0.05, 0.01)], up=V(0, 1, 0), around=4),
                          place(V(0, 0, 0), out)))
        obj("nozzle", join("nozzle", flaps), dark, jet, V(0, 0, 1.35))
        obj("pylon", loft("pylon", [V(0, 0.22, 0.25), V(0, 0.36, 0.6), V(0, 0.24, 1.15)], [(0.05, 0.08), (0.05, 0.14), (0.04, 0.06)],
                          up=V(1, 0, 0), around=10), steel, jet)
        fan = obj("fan", None, None, jet, V(0, 0, 0.02))
        blades = [(body("spinner", (0.08, 0.08, 0.12), around=12, rings=6), place(V(0, 0, 0.04)))]
        for blade in range(7):
            data = loft("blade", [V(0, 0.05, 0), V(0, 0.28, 0)], [(0.012, 0.075), (0.008, 0.05)], up=V(0, 0, 1), around=6)
            blades.append((data, place(V(0, 0, 0), turn((0, 0, 1), TAU * blade / 7) @ turn((0, 1, 0), 0.5))))
        obj("blades", join("blades", blades), chrome, fan)
        fans.append(fan)
    return fans


# --- The bicycle, its drive and the pelican, in the rig's frame (scaled by SIZE, hung at HANG) --

BRACKET = V(0, -2.5, 0.1)  # the cranks' axle
CRANK = 0.28
PEDAL = 0.42  # a pedal's distance from the bicycle's middle
HIP = V(0.2, -1.6, 0.3)
THIGH = 0.62
SHIN = 0.62
RING_OUT = 0.3  # the chainring's distance from the bicycle's middle
SHAFT = V(RING_OUT * SIZE, -0.3, 1.75)  # where the chain meets the shaft, in the flyer's frame
REAR = V(0, -2.6, 0.95)
FRONT = V(0, -2.6, -0.95)
SEAT = V(0, -1.74, 0.44)
HEAD_TOP = V(0, -1.62, -0.6)
HEAD_LOW = V(0, -1.98, -0.68)
BARS = V(0, -1.46, -0.56)
SHOULDER = V(0.29, -1.2, -0.04)
ARM = 0.32  # each of a wing's two bones
WHEEL = 0.5


def flyer_point(point):
    return HANG + point * SIZE


def chain_loop():
    """The chain's pitch and pulleys: its loop round the chainring and the shaft's sprocket is
    RING_TEETH * TURNS links long, so that after TURNS turns of the cranks each link is where it
    began."""
    low = flyer_point(V(RING_OUT, BRACKET.y, BRACKET.z))
    span = (SHAFT - low).length
    pitch = 0.1
    for _ in range(80):
        big, small = RING_TEETH * pitch / TAU, SPROCKET_TEETH * pitch / TAU
        beta = math.asin((big - small) / span)
        length = 2 * span * math.cos(beta) + big * (math.pi + 2 * beta) + small * (math.pi - 2 * beta)
        pitch = length / (RING_TEETH * TURNS)
    return pitch, big, small, low, beta, span


PITCH, RING, SPROCKET, CHAIN_LOW, BETA, SPAN = chain_loop()


def chain_at(s):
    """A point of the chain's loop, `s` along it: round the back of the chainring, up the run to
    the sprocket, round its front and down. The loop lies in the plane of the chainring."""
    axis = (SHAFT - CHAIN_LOW).normalized()
    normal = V(1, 0, 0).cross(axis)
    straight = SPAN * math.cos(BETA)
    wraps = (RING * (math.pi + 2 * BETA), SPROCKET * (math.pi - 2 * BETA))
    phi = math.pi / 2 - BETA  # where each run meets the pulleys, from the axis
    s %= 2 * straight + sum(wraps)

    def on(centre, radius, angle):
        return centre + (axis * math.cos(angle) + normal * math.sin(angle)) * radius

    if s < wraps[0]:
        return on(CHAIN_LOW, RING, phi + s / RING)
    s -= wraps[0]
    if s < straight:
        return on(CHAIN_LOW, RING, -phi).lerp(on(SHAFT, SPROCKET, -phi), s / straight)
    s -= straight
    if s < wraps[1]:
        return on(SHAFT, SPROCKET, -phi + s / SPROCKET)
    return on(SHAFT, SPROCKET, phi).lerp(on(CHAIN_LOW, RING, phi), (s - wraps[1]) / straight)


def build_bicycle(rig):
    """A yellow frame, a leather saddle, a chrome handlebar with black grips on a fork that
    steers, and spoked wheels. Returns the steering and the wheels."""
    frame_paint = paint("frame", (1.0, 0.7, 0.05), 0.25, 0.5)
    chrome = paint("chrome", (0.8, 0.82, 0.86), 0.15, 1.0)
    rubber = paint("rubber", (0.03, 0.03, 0.035), 0.9)
    tubes = []
    for a, b, r in ((BRACKET, SEAT, 0.04), (SEAT, HEAD_TOP, 0.04), (BRACKET, HEAD_LOW, 0.046),
                    (HEAD_LOW, HEAD_TOP + V(0, 0.06, 0.012), 0.052)):
        tubes.append((rod("tube", (b - a).length, r), place(a, aim(b - a))))
    for side in (-1, 1):
        out = V(side * 0.075, 0, 0)
        for a, b, r in ((BRACKET + out * 0.8, REAR + out, 0.024), (SEAT, REAR + out, 0.022)):
            tubes.append((rod("stay", (b - a).length, r), place(a, aim(b - a))))
    frame = obj("frame", join("frame", tubes), frame_paint, rig)
    obj("saddle", body("saddle", (0.13, 0.05, 0.22), shape=lambda t: (0.45 + 0.55 * (t + 1) / 2, 1.0, 0.0)),
        paint("leather", (0.25, 0.1, 0.04), 0.5), frame, SEAT + V(0, 0.05, 0.06))
    steer = obj("steer", None, None, rig, HEAD_TOP)
    bar = [V(t * 0.42, 0.04 * t * t, 0.06 * t * t) + BARS - HEAD_TOP for t in (i / 6 - 1 for i in range(13))]
    obj("bars", join("bars", [(rod("stem", (BARS - HEAD_TOP).length, 0.03), place(V(0, 0, 0), aim(BARS - HEAD_TOP))),
                              (loft("bar", bar, [(0.024, 0.024)] * 13, around=10), place())]), chrome, steer)
    for side in (-1, 1):
        obj("grip", loft("grip", [V(side * 0.28, 0, 0), V(side * 0.47, 0, 0)], [(0.042, 0.042)] * 2, around=10),
            rubber, steer, BARS - HEAD_TOP + V(0, 0.035, 0.05))
        blade = [HEAD_LOW - HEAD_TOP + V(side * 0.075, 0, 0) + (FRONT - HEAD_LOW) * (i / 6) + V(0, 0, -0.06 * math.sin(math.pi * i / 6))
                 for i in range(7)]
        obj("fork", loft("fork", blade, [(0.03, 0.03)] * 7, around=8), frame_paint, steer)
    wheels = []
    for name, centre, parent in (("rear", REAR, rig), ("front", FRONT - HEAD_TOP, steer)):
        wheel = obj(f"wheel_{name}", None, None, parent, centre)
        obj("tyre", ring("tyre", WHEEL - 0.045, 0.045, around=48, section=10), rubber, wheel)
        spokes = [(ring("rim", WHEEL - 0.1, 0.022, around=48, section=6), place()),
                  (loft("hub", [V(-0.09, 0, 0), V(0.09, 0, 0)], [(0.045, 0.045)] * 2, around=12), place())]
        for spoke in range(16):
            angle = TAU * spoke / 16
            hub = V(0.06 if spoke % 2 else -0.06, 0, 0)
            rim = V(0, (WHEEL - 0.1) * math.cos(angle), (WHEEL - 0.1) * math.sin(angle))
            spokes.append((rod("spoke", (rim - hub).length, 0.007, around=4), place(hub, aim(rim - hub, up=V(1, 0, 0)))))
        obj("spokes", join("spokes", spokes), chrome, wheel)
        wheels.append(wheel)
    return steer, wheels


def build_drive(root, rig):
    """The cranks with their chainring and pedals, the chain's links, the shaft across between
    the jets with its sprocket, and the rods the bicycle hangs from."""
    chrome = paint("chrome", (0.8, 0.82, 0.86), 0.15, 1.0)
    gold = paint("gold", GOLD, 0.2, 0.9)
    rubber = paint("rubber", (0.03, 0.03, 0.035), 0.9)
    cranks = obj("cranks", None, None, rig, BRACKET)
    obj("chainring", gear("chainring", (RING - 0.025) / SIZE, 0.025, RING_TEETH, 0.045 / SIZE, RING * 0.6 / SIZE), gold, cranks,
        V(RING_OUT, 0, 0))
    arms = [(loft("axle", [V(-PEDAL, 0, 0), V(PEDAL, 0, 0)], [(0.03, 0.03)] * 2, around=10), place())]
    pedals = []
    for side in (-1, 1):
        arms.append((loft("arm", [V(side * 0.36, 0, 0), V(side * 0.36, 0, -side * CRANK)], [(0.035, 0.02)] * 2,
                          up=V(1, 0, 0), around=8), place()))
        pedal = obj(f"pedal_{'L' if side < 0 else 'R'}", None, None, cranks, V(side * PEDAL, 0, -side * CRANK))
        obj("tread", loft("tread", [V(0, 0, -0.12), V(0, 0, 0.12)], [(0.09, 0.018)] * 2, around=8), rubber, pedal)
        pedals.append(pedal)
    obj("arms", join("arms", arms), chrome, cranks)
    # The links, alternately dark and bright, each kind one mesh.
    plates = []
    for material in (paint("dark", (0.04, 0.04, 0.05), 0.35, 0.6), chrome):
        plates.append(loft("link", [V(0, -PITCH * 0.45, 0), V(0, PITCH * 0.45, 0)], [(0.03, 0.02)] * 2, up=V(0, 0, -1), around=8))
        plates[-1].materials.append(material)
    links = [obj(f"link_{index:03}", plates[index % 2], None, root) for index in range(RING_TEETH * TURNS)]
    shaft = obj("shaft", None, None, root, V(0, SHAFT.y, SHAFT.z))
    obj("shaft_rod", loft("shaft", [V(JETS[0], 0, 0), V(JETS[1], 0, 0)], [(0.04, 0.04)] * 2, around=12), chrome, shaft)
    obj("sprocket", gear("sprocket", SPROCKET - 0.025, 0.03, SPROCKET_TEETH, 0.045, 0.03), gold, shaft, V(SHAFT.x, 0, 0))
    hangers = []
    for side in (-1, 1):
        out = V(side * 0.075, 0, 0)
        for a, b in ((flyer_point(REAR + out), V(side * 0.8, -0.1, 1.25)), (flyer_point(HEAD_TOP), V(side * 0.85, -0.1, -1.25))):
            hangers.append((rod("hanger", (b - a).length, 0.035), place(a, aim(b - a))))
    obj("hangers", join("hangers", hangers), chrome, root)
    return cranks, pedals, links, shaft


def build_pelican(rig):
    """The pelican: white, with a long yellow bill over an orange pouch, a red cyclist's cap with
    flying goggles on it, a scarf, black-tipped wings stretched forward to the handlebar, orange
    legs and webbed feet."""
    white = paint("white", WHITE, 0.8)
    bill = paint("bill", (1.0, 0.66, 0.1), 0.6)
    orange = paint("legs", (1.0, 0.5, 0.1), 0.6)
    red = paint("red", RED, 0.4)
    bird = obj("bird", None, None, rig)
    obj("body", body("body", (0.32, 0.31, 0.56), around=28, rings=16,
                     shape=lambda t: (1.0 - 0.18 * max(t, 0) ** 2, 1.0 + 0.1 * max(-t, 0), -0.12 * t * t)),
        white, bird, V(0, -1.33, 0.22), turn((1, 0, 0), math.radians(-14)), coat(WHITE, 0.09, (36, 48)))
    # The neck: an S up from the chest, back over itself and forward under the head.
    neck = [V(0, -1.2 + 0.5 * t, -0.18 - 0.48 * t + 0.14 * math.sin(TAU * 0.9 * t)) for t in (i / 12 for i in range(13))]
    obj("neck", loft("neck", neck, [(0.16 - 0.06 * i / 12, 0.17 - 0.07 * i / 12) for i in range(13)], around=18),
        white, bird, extras=coat(WHITE, 0.035, (44, 30)))
    # An aviator's scarf round the neck, its two ends streaming back over the shoulders.
    knot, way = neck[4], (neck[5] - neck[3]).normalized()
    obj("scarf", ring("scarf", 0.165, 0.035, around=32, section=8, axis=way), paint("scarf", SCARF, 0.6), bird, knot)
    behind = knot + V(0, -way.z, way.y) * 0.16
    for side, length in ((-1, 1.15), (1, 0.9)):
        feather(bird, behind + V(side * 0.04, 0, 0), V(side * 0.18, -0.3, 1.0), V(0, 1, 0), (0.14, length),
                SCARF, (0.2, 0.68, 0.78), (1.0, 0.0), 0.8, "scarf_end")
    head = obj("head", None, None, bird, V(0, -0.7, -0.66))
    look = obj("head_look", None, None, head)
    obj("skull", body("skull", (0.17, 0.16, 0.2), around=24, rings=12), white, look, extras=coat(WHITE, 0.04, (40, 30)))
    lids = []
    for side in (-1, 1):
        eye = obj("eye", body("eye", (0.05, 0.05, 0.05), around=12, rings=6), paint("iris", (0.95, 0.85, 0.3), 0.3), look,
                  V(side * 0.13, 0.04, -0.09))
        obj("pupil", body("pupil", (0.025, 0.03, 0.025), around=10, rings=6), paint("black", BLACK, 0.1), eye, V(side * 0.035, 0, -0.02))
        lids.append(obj(f"lid_{'L' if side < 0 else 'R'}", body("lid", (0.05, 0.05, 0.05), around=12, rings=6),
                        paint("lid", WHITE, 0.7), look, V(side * 0.13, 0.04, -0.09), Matrix.Diagonal((0.9, 0.9, 0.9))))
    # The bill: long and flat, hooked down at its tip; the lower mandible and the pouch hang from
    # a jaw that opens.
    upper = [V(0, 0.01 - 0.3 * t - 0.07 * max(0.0, t - 0.88) / 0.12, -0.12 - 1.0 * t) for t in (i / 14 for i in range(15))]
    obj("bill", loft("bill", upper, [(0.08 - 0.035 * i / 14, 0.035 - 0.015 * i / 14) for i in range(15)], around=14), bill, look)
    jaw = obj("jaw", None, None, look, V(0, -0.04, -0.12))
    lower = [V(0, -0.02 - 0.3 * t, -0.98 * t) for t in (i / 12 for i in range(13))]
    obj("mandible", loft("mandible", lower, [(0.07 - 0.03 * i / 12, 0.018) for i in range(13)], around=12), bill, jaw)
    sack = [V(0, -0.07 - 0.3 * t - 0.12 * math.sin(math.pi * t), -0.88 * t) for t in (i / 12 for i in range(13))]
    obj("pouch", loft("pouch", sack, [(0.06 - 0.02 * i / 12, 0.02 + 0.12 * math.sin(math.pi * i / 12)) for i in range(13)],
                      around=14), paint("pouch", (1.0, 0.45, 0.1), 0.5), jaw)
    # A red cyclist's cap, its little visor turned up.
    obj("cap", body("cap", (0.18, 0.11, 0.2), shape=lambda t: (1.0, 1.0, 0.0)), red, look, V(0, 0.1, 0.02))
    obj("visor", body("visor", (0.13, 0.015, 0.11)), red, look, V(0, 0.09, -0.19), turn((1, 0, 0), math.radians(18)))
    # Flying goggles pushed up on the cap: brass rims round amber lenses, on a black strap.
    brass = paint("brass", (0.85, 0.6, 0.25), 0.25, 0.9)
    facing = ahead(V(0, 0.75, -0.66))
    obj("strap", ring("strap", 0.2, 0.016, around=40, section=6, axis=V(0, 1, 0)), paint("black", BLACK, 0.1), look,
        V(0, 0.13, 0.02), turn((1, 0, 0), math.radians(20)))
    for side in (-1, 1):
        obj("goggle", ring("goggle", 0.058, 0.017, around=24, section=6, axis=V(0, 0, 1)), brass, look, V(side * 0.075, 0.19, -0.12), facing)
        obj("lens", body("lens", (0.05, 0.05, 0.016), around=16, rings=6), paint("amber", (0.9, 0.5, 0.1), 0.05, 0.6), look,
            V(side * 0.075, 0.19, -0.12), facing)
    for index in range(3):
        feather(look, V((index - 1) * 0.04, 0.12, 0.14), V((index - 1) * 0.25, 0.1, 1.0), V(0, 1, 0), (0.06, 0.3), WHITE, WHITE)
    for index in range(5):
        feather(bird, V((index - 2) * 0.07, -1.26, 0.72), V((index - 2) * 0.3, 0.22, 1.0), V(0, 1, 0), (0.17, 0.46),
                WHITE, (0.55, 0.55, 0.6))
    # The wings: an upper arm from the shoulder to the elbow and a forearm from there to the
    # grip, flight feathers along their trailing side, black-tipped, and the tips closed over the
    # grips. All hang from the bird; "steer" places them on the grips.
    wings = []
    for side in (-1, 1):
        name = "L" if side < 0 else "R"
        upper_arm = obj(f"arm_{name}", None, None, bird, V(side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        obj("arm", body("arm", (0.1, 0.05, ARM / 2), shape=lambda t: (1.0 - 0.3 * max(t, 0), 1.0, 0.0)), white, upper_arm,
            V(0, 0, -ARM / 2), extras=coat(WHITE, 0.045, (26, 30)))
        forearm = obj(f"forearm_{name}", None, None, bird)
        obj("forearm", body("forearm", (0.08, 0.04, ARM / 2), shape=lambda t: (1.0 - 0.3 * max(-t, 0), 1.0, 0.0)), white, forearm,
            V(0, 0, -ARM / 2), extras=coat(WHITE, 0.04, (22, 26)))
        hand = obj(f"hand_{name}", None, None, bird)
        for finger in range(3):
            feather(hand, V(side * (finger - 1) * 0.05, 0.03, 0.03), V(side * (finger - 1) * 0.25, -0.75, -1.0), V(0, 1, -0.6),
                    (0.075, 0.2), BLACK, BLACK)
        flights = []
        for index in range(8):
            along = index / 7
            flight = obj(f"flight_{name}{index}", None, None, bird)
            feather(flight, V(0, 0, 0), V(side * (0.25 - 0.1 * along), -0.55 + 0.2 * along, 1.0 - 0.5 * along), V(side, 0.3, 0),
                    (0.17, 0.62 - 0.3 * abs(along - 0.45)), WHITE, BLACK)
            flights.append(flight)
        wings.append((upper_arm, forearm, hand, flights))
    legs = []
    for side in (-1, 1):
        name = "L" if side < 0 else "R"
        thigh = obj(f"thigh_{name}", None, None, rig)
        obj("thigh", loft("thigh", [V(0, -0.02, 0), V(0, THIGH, 0)], [(0.085, 0.085), (0.05, 0.05)], up=V(0, 0, -1), around=12),
            orange, thigh)
        shin = obj(f"shin_{name}", None, None, rig)
        obj("shin", loft("shin", [V(0, -0.02, 0), V(0, SHIN, 0)], [(0.055, 0.055), (0.04, 0.04)], up=V(0, 0, -1), around=10), orange, shin)
        foot = obj(f"foot_{name}", None, None, rig)
        tips = [V(math.sin((toe - 1) * 0.4) * 0.22, 0, -math.cos((toe - 1) * 0.4) * 0.22) for toe in range(3)]
        web = [(rod("toe", 0.22, 0.022, around=6, tip=0.012), place(V(0, 0, 0), aim(tip))) for tip in tips]
        web.append((mesh("web", [V(0, 0, 0), *tips], [(0, 1, 2), (0, 2, 3), (0, 2, 1), (0, 3, 2)], smooth=False), place()))
        obj("web", join("web", web), orange, foot)
        legs.append((thigh, shin, foot))
    return bird, head, look, lids, jaw, wings, legs


# --- The corgi --------------------------------------------------------------------------------
# Its moving parts are where main.gd's ride() expects them, and as tall: a leg is a body two
# units tall at its middle, scaled to its length, as a capsule of Godot's is.

def bump(t, at, width):
    return math.exp(-((t - at) / width) ** 2)


def through(keys, count):
    """`count` tuples on a smooth curve (Catmull-Rom) through the tuples `keys`."""
    samples = []
    for i in range(count):
        x = i / (count - 1) * (len(keys) - 1)
        k = min(int(x), len(keys) - 2)
        f = x - k
        p0, p1, p2, p3 = (keys[max(k - 1, 0)], keys[k], keys[k + 1], keys[min(k + 2, len(keys) - 1)])
        samples.append(tuple(0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    return samples


def trunk_coat(v, angle):
    """A Pembroke's coat on its trunk, v from the chest to the rump: tan above, white under it,
    up over the chest and round the seat."""
    line = -0.3 + 1.4 * (1 - between(0.06, 0.3, v)) + 0.25 * between(0.86, 0.98, v)
    return mix(TAN, WHITE, between(-0.12, 0.12, line - math.sin(angle)))


def head_coat(v, angle):
    """Its head's, v from the back of the skull to the nose: tan, with a white blaze up the
    middle of the face, a white muzzle and white cheeks."""
    side, up = math.cos(angle), math.sin(angle)
    blaze = between(0.3, 0.42, v) * between(-0.04, 0.04, 0.1 + 0.4 * between(0.5, 0.85, v) - abs(side)) * between(-0.2, 0.1, up)
    cheeks = between(0.32, 0.5, v) * (1 - between(-0.4, -0.05, up))
    return mix(TAN, WHITE, max(blaze, cheeks, between(0.62, 0.72, v)))


def cape_colours(x, z):
    """The cape's: CAPE, with a gold paw print high on its back and a gold edge down each side;
    x across it from -0.5 to 0.5, z from the clasp. The toes are toward the clasp."""
    pads = (((0.0, 1.0), (0.17, 0.14)), ((-0.1, 0.77), (0.055, 0.07)), ((0.1, 0.77), (0.055, 0.07)),
            ((-0.21, 0.86), (0.05, 0.065)), ((0.21, 0.86), (0.05, 0.065)))
    paw = max(1 - between(0.75, 1.15, ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2) for (cx, cz), (rx, rz) in pads)
    return mix(CAPE, GOLD, max(paw, between(0.44, 0.47, abs(x))))


def build_corgi(root):
    """A Pembroke corgi standing on the board in sunglasses and a red cape, its tongue out."""
    tan, white = paint("tan", TAN, 0.8), paint("white", WHITE, 0.8)
    muzzle = paint("muzzle", WHITE, 0.8)
    gold = paint("gold", GOLD, 0.2, 0.9)
    dog = obj("dog", None, None, root, V(0, 0.09, 0.2))
    # Its trunk, a loaf: a deep chest, a tucked waist, round hips.
    trunk = body("trunk", (0.42, 0.44, 1.38), around=32, rings=26, full=2.6, colours=trunk_coat,
                 shape=lambda t: (1.0 - 0.1 * bump(t, 0.15, 0.4) + 0.04 * bump(t, 0.65, 0.25),
                                  1.0 + 0.1 * bump(t, -0.55, 0.35) - 0.1 * bump(t, 0.2, 0.4),
                                  -0.1 * bump(t, -0.55, 0.35) + 0.08 * bump(t, 0.2, 0.4)))
    obj("dog_body", trunk, tan, dog, V(0, 0.9, 0.3), extras=coat(PAINTED, 0.11, (150, 170)))
    neck = [V(0, 0.9, -0.55), V(0, 1.2, -0.8), V(0, 1.5, -0.98)]  # from inside the chest into the head
    obj("dog_neck", loft("neck", neck, [(0.26, 0.28), (0.33, 0.33), (0.3, 0.3)], up=V(0, 0, 1), around=24,
                         colours=lambda v, angle: mix(TAN, WHITE, between(-0.2, 0.2, -math.sin(angle)))),
        tan, dog, extras=coat(PAINTED, 0.12, (90, 30)))
    obj("dog_tail", body("tail", (0.15, 0.15, 0.22)), tan, dog, V(0, 1.0, 1.72), extras=coat(TAN, 0.12, (70, 35)))
    for index, (x, z) in enumerate(((-0.26, -0.6), (0.26, -0.6), (-0.26, 1.1), (0.26, 1.1))):
        leg = loft("leg", [V(0, -1.0, 0), V(0, -0.4, 0), V(0, 1.0, 0)], [(0.13, 0.14), (0.14, 0.15), (0.17, 0.18)], up=V(0, 0, -1), around=14)
        obj(f"dog_leg_{index}", leg, white, dog, V(x, 0.3, z), Matrix.Diagonal((1.0, 0.32, 1.0)), coat(WHITE, 0.05, (60, 50)))
        paw = body("paw", (0.16, 0.09, 0.22), shape=lambda t: (1.0, 1.0 - 0.3 * max(-t, 0), 0.0))
        obj(f"dog_paw_{index}", paw, muzzle, dog, V(x, 0.06, z - 0.08))
    head = obj("dog_head", None, None, dog, V(0, 1.62, -1.0))  # turned by main.gd as the corgi rides
    face = obj("dog_look", None, None, head)  # turned by "alive"
    # Its head, one surface from the back of the skull over the stop to the end of the muzzle:
    # (z, height of the middle, half width, half height).
    shape = through([(0.52, 0.02, 0.06, 0.06), (0.45, 0.02, 0.33, 0.33), (0.32, 0.03, 0.48, 0.45), (0.12, 0.03, 0.56, 0.5),
                     (-0.08, 0.0, 0.54, 0.47), (-0.25, -0.06, 0.45, 0.37), (-0.38, -0.11, 0.33, 0.27), (-0.5, -0.13, 0.27, 0.22),
                     (-0.65, -0.13, 0.25, 0.2), (-0.8, -0.12, 0.21, 0.17), (-0.9, -0.11, 0.14, 0.12), (-0.95, -0.1, 0.05, 0.05)], 30)
    obj("dog_skull", loft("head", [V(0, y, z) for z, y, _, _ in shape], [(w, h) for _, _, w, h in shape], around=32,
                          colours=head_coat), tan, face, extras=coat(PAINTED, 0.06, (190, 120)))
    obj("dog_nose", body("nose", (0.1, 0.075, 0.07)), paint("nose", (0.02, 0.02, 0.025), 0.25), face, V(0, -0.05, -0.92))
    jaw = obj("dog_jaw", None, None, face, V(0, -0.36, -0.2))
    obj("dog_chin", body("chin", (0.22, 0.08, 0.32)), muzzle, jaw, V(0, -0.04, -0.24), turn((1, 0, 0), math.radians(-5)))
    # The tongue: a strip of cloth out of the mouth's left side, trailing back in the wind.
    back = V(-0.8, -0.2, 1.0).normalized()
    across = V(-0.75, 0.65, 0.0).cross(back).normalized()
    obj("dog_tongue", strip("tongue", along=10, across=2), paint("tongue", TONGUE, 0.6), jaw, V(-0.06, 0.015, -0.48),
        Matrix((across * 0.24, back.cross(across), back * 0.85)).transposed(),
        cloth(TONGUE, (0.96, 0.5, 0.58), (1.0, -0.75), 0.3, 3.1))
    for index, x in enumerate((-1.0, 1.0)):
        ear = obj(f"dog_ear_{index}", None, None, face, V(x * 0.4, 0.3, 0.12))
        flap = loft("ear", [V(0, 0, 0), V(0, 0.45, 0), V(0, 0.84, 0)], [(0.3, 0.15), (0.2, 0.1), (0.02, 0.01)], up=V(0, 0, -1), around=16)
        obj("ear", flap, tan, ear, V(0, -0.02, 0), turn((0, 0, 1), math.radians(x * -16)), coat(TAN, 0.03, (40, 30)))
        inside = loft("inside", [V(0, 0, 0), V(0, 0.4, 0), V(0, 0.72, 0)], [(0.2, 0.06), (0.13, 0.04), (0.02, 0.01)],
                      up=V(0, 0, -1), around=12)
        obj("inside", inside, paint("pink", (0.9, 0.45, 0.5), 0.6), ear, V(0, 0.0, -0.08), turn((0, 0, 1), math.radians(x * -16)))
        # The sunglasses: dark mirrors in gold frames, a bridge over the nose, an arm to each ear.
        lens_turn = turn((0, 1, 0), math.radians(x * -16)) @ turn((1, 0, 0), math.radians(8))
        obj("lens", body("lens", (0.3, 0.21, 0.05)), paint("shades", (0.02, 0.03, 0.08), 0.04, 1.0), face, V(x * 0.29, 0.13, -0.53), lens_turn)
        obj("frame", ring("frame", 0.26, 0.025, around=32, section=6, axis=V(0, 0, 1)), gold, face, V(x * 0.29, 0.13, -0.52),
            lens_turn @ Matrix.Diagonal((1.15, 0.82, 1.0)))
        obj("temple", loft("temple", [V(0, 0, -0.3), V(0, 0, 0.32)], [(0.02, 0.025)] * 2, around=6), gold, face, V(x * 0.6, 0.17, -0.2))
    obj("bridge", loft("bridge", [V(-0.07, 0, 0), V(0.07, 0, 0)], [(0.03, 0.03)] * 2, around=8), gold, face, V(0, 0.2, -0.54))
    obj("clasp", body("clasp", (0.08, 0.08, 0.08)), gold, dog, V(0, 1.0, -1.02))
    obj("cape", strip("cape", length=2.5, along=80, across=48, colours=cape_colours), paint("cape", CAPE, 0.6), dog,
        V(0, 1.8, -0.45), turn((1, 0, 0), math.radians(-22)),
        cloth(PAINTED, PAINTED, (0.7, 0.45), 1.0))
    return face, jaw


# --- Animations -------------------------------------------------------------------------------

def bake(name, frames, pose, first=0):
    """Keys the placements `pose(phase)` gives, phase 0 to 1 over the frames from `first`, into
    one action, a slot of it for each object, which the export makes one animation of. The
    scene's frame 0 is the flyer at rest: `first` puts the pose of rest there."""
    things = list(pose(0.0))
    action = bpy.data.actions.new(name)
    for thing in things:
        data = thing.animation_data_create()
        data.action = action
        data.action_slot = action.slots.new(id_type="OBJECT", name=thing.name)
    paths = ("location", "rotation_quaternion", "scale")
    values = {thing: [] for thing in things}
    for frame in range(frames + 1):
        placements = pose(frame / frames)
        for thing in things:
            put(thing, placements[thing])
            values[thing].append([tuple(getattr(thing, path)) for path in paths])
    # Only what moves is keyed: what does not stays as it was put.
    for thing in things:
        for index, path in enumerate(paths):
            keys = [frame[index] for frame in values[thing]]
            if all(max(abs(a - b) for a, b in zip(key, keys[0])) < 1e-6 for key in keys):
                continue
            for frame, key in enumerate(keys):
                setattr(thing, path, key)
                thing.keyframe_insert(path, frame=first + frame)


def knee(hip, foot, first, second, bend):
    """Where a joint between two bones from `hip` to `foot` is, bending toward `bend`."""
    reach = foot - hip
    far = min(max(reach.length, 0.05), first + second - 0.005)
    along = reach.normalized()
    to_knee = (first * first - second * second + far * far) / (2 * far)
    out = (bend - along * along.dot(bend)).normalized()
    return hip + along * to_knee + out * math.sqrt(max(first * first - to_knee * to_knee, 0.0))


def main():
    out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else MODEL
    # Run again in Blender's window, it clears the scene and makes the flyer anew.
    for kind in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.actions):
        for thing in list(kind):
            kind.remove(thing)
    bpy.context.scene.render.fps = 30
    root = obj("flyer", None, extras={"pedal_turns": TURNS})
    build_board(root)
    fans = build_jets(root)
    rig = obj("rig", None, None, root, HANG, Matrix.Diagonal((SIZE, SIZE, SIZE)))
    steer, wheels = build_bicycle(rig)
    cranks, pedals, links, shaft = build_drive(root, rig)
    bird, head, look, lids, jaw, wings, legs = build_pelican(rig)
    dog_look, dog_jaw = build_corgi(root)

    def pedalling(phase):
        """The cranks at TURNS * phase turns. Forward is the top of the chainring going ahead."""
        angle = TAU * TURNS * phase
        spin = turn((1, 0, 0), -angle)
        poses = {cranks: place(BRACKET, spin), shaft: place(V(0, SHAFT.y, SHAFT.z), turn((1, 0, 0), -angle * RING_TEETH / SPROCKET_TEETH))}
        for side, pedal in zip((-1, 1), pedals):
            poses[pedal] = place(V(side * PEDAL, 0, -side * CRANK), turn((1, 0, 0), angle))
        for fan in fans:
            poses[fan] = place(V(0, 0, 0.02), turn((0, 0, 1), angle * RING_TEETH / SPROCKET_TEETH))
        for wheel, centre in zip(wheels, (REAR, FRONT - HEAD_TOP)):
            poses[wheel] = place(centre, turn((1, 0, 0), -angle * WHEEL_RATIO))
        for index, link in enumerate(links):
            s = (index - angle / TAU * RING_TEETH) * PITCH
            a, b = chain_at(s - PITCH * 0.25), chain_at(s + PITCH * 0.25)
            poses[link] = place((a + b) / 2, aim(b - a, up=V(1, 0, 0)))
        # The pelican rocks on its saddle with each stroke, its head keeping level against it.
        rock = math.sin(angle)
        sway = V(rock * 0.025, 0.012 * math.cos(angle * 2), 0)
        poses[bird] = place(sway, turn((0, 0, 1), rock * 0.05))
        poses[head] = place(V(0, -0.7, -0.66), turn((1, 0, 0), 0.05 * math.cos(angle * 2)) @ turn((0, 0, 1), -rock * 0.07))
        for side, (thigh, shin, foot) in zip((-1, 1), legs):
            on_pedal = BRACKET + V(side * PEDAL, 0.05, 0) + spin @ V(0, 0, -side * CRANK)
            hip = V(side * HIP.x, HIP.y, HIP.z) + sway
            bend = knee(hip, on_pedal, THIGH, SHIN, V(side * 0.3, 0, -1.0))
            poses[thigh] = place(hip, aim(bend - hip, up=V(0, 0, -1)))
            poses[shin] = place(bend, aim(on_pedal - bend, up=V(0, 0, -1)))
            poses[foot] = place(on_pedal + V(0, 0.02, -0.04))
        return poses

    bake("pedal", FRAMES * TURNS, pedalling)
    axis = (HEAD_TOP - HEAD_LOW).normalized()

    def steering(phase):
        """The handlebar turned (phase * 2 - 1) * 0.35 radians to the right, and the wings on its
        grips: the bird's frame at rest, as the shoulders' places in it are."""
        bars = turn(axis, -(phase * 2 - 1) * 0.35)
        poses = {steer: place(HEAD_TOP, bars)}
        for side, (upper_arm, forearm, hand, flights) in zip((-1, 1), wings):
            shoulder = V(side * SHOULDER.x, SHOULDER.y, SHOULDER.z)
            grip = HEAD_TOP + bars @ (BARS - HEAD_TOP + V(side * 0.36, 0.035, 0.05))
            elbow = knee(shoulder, grip, ARM, ARM, V(side * 0.7, 0.2, 0.3))
            poses[upper_arm] = place(shoulder, ahead(elbow - shoulder, up=V(side, 0.4, 0)))
            reach = (grip - elbow).length / ARM
            poses[forearm] = place(elbow, ahead(grip - elbow, up=V(side, 0.4, 0)) @ Matrix.Diagonal((1.0, 1.0, reach)))
            poses[hand] = place(grip)
            for index, flight in enumerate(flights):
                along = index / 7 * 2
                root = shoulder.lerp(elbow, along) if along < 1 else elbow.lerp(grip, along - 1)
                poses[flight] = place(root + V(0, -0.02, 0.03))
        return poses

    bake("steer", STEERS, steering, first=-STEERS // 2)

    def living(phase):
        """8 s: the pelican looks about, blinks at 1.2 s and 5.6 s, and claps its bill at 3.5 s;
        the corgi pants, tilts its head at 2 s and looks down at the pelican at 6 s."""
        seconds = phase * ALIVE / 30
        yaw = 0.35 * math.sin(TAU * phase) + 0.12 * math.sin(TAU * phase * 3)
        nod = 0.15 * math.sin(TAU * phase * 2 + 1.0) * math.sin(TAU * phase)
        poses = {look: place(V(0, 0, 0), turn((0, 1, 0), yaw) @ turn((1, 0, 0), nod))}
        shut = max(0.0, 1.0 - abs(seconds - 1.2) / 0.12) + max(0.0, 1.0 - abs(seconds - 5.6) / 0.12)
        for side, lid in zip((-1, 1), lids):
            poses[lid] = place(V(side * 0.13, 0.04, -0.09), Matrix.Diagonal([0.9 + 0.25 * shut] * 3))
        clap = math.sin(math.pi * (seconds - 3.3) / 1.2) if 3.3 < seconds < 4.5 else 0.0
        poses[jaw] = place(V(0, -0.04, -0.12), turn((1, 0, 0), -0.35 * clap * abs(math.sin(TAU * (seconds - 3.3) * 2))))
        poses[dog_jaw] = place(V(0, -0.36, -0.2), turn((1, 0, 0), -0.1 - 0.08 * math.sin(TAU * phase * 24)))
        tilt = between(1.6, 2.0, seconds) * (1 - between(2.8, 3.2, seconds))
        down = between(5.2, 5.7, seconds) * (1 - between(6.8, 7.3, seconds))
        poses[dog_look] = place(V(0, 0, 0), turn((0, 1, 0), 0.45 * down) @ turn((1, 0, 0), -0.4 * down) @ turn((0, 0, 1), 0.3 * tilt))
        return poses

    bake("alive", ALIVE, living)
    bpy.context.scene.frame_set(0)
    # An animation of each action, sampled for all its objects at once (by NLA track, each object
    # was sampled by itself: ten times as long).
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_extras=True, export_animation_mode="ACTIONS",
                              export_anim_slide_to_zero=True, export_vertex_color="ACTIVE")
    print("flyer.py: wrote", out)


main()
