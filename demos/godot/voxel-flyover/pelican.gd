extends Node3D
## The pelican that powers the jets. It rides a bicycle that hangs under the board, and its
## pedalling runs by a chain from the chainring up to a shaft between the two engines, whose fans
## turn with it; main.gd lengthens the flames with every stroke. Built in the flyer's frame, which
## looks along -z; the bicycle and its rider are built at SIZE in a frame of their own (rig), the
## shaft and the fans where the jets are. The character is this game's own.

const Parts := preload("res://parts.gd")
const BRACKET := Vector3(0, -2.5, 0.1) # the cranks' axle
const CRANK := 0.28
const PEDAL := 0.42 # a pedal's distance from the bicycle's middle
const HIP := Vector3(0.2, -1.6, 0.3)
const THIGH := 0.62
const SHIN := 0.62
const RING := 0.2 # the chainring's radius
const SPROCKET := 0.13 # the shaft's
const RING_OUT := 0.3 # the chainring's distance from the bicycle's middle
const SIZE := 1.4 # of the bicycle and the bird, in the flyer's frame
const HANG := Vector3(0, 0.2, 0) # where the rig's own origin hangs
const SHAFT := Vector3(RING_OUT * SIZE, -0.3, 1.75) # where the chain meets the shaft between the jets
const LINK := 0.09 # a chain link and its gap
const REAR := Vector3(0, -2.6, 0.95)
const FRONT := Vector3(0, -2.6, -0.95)
const SEAT := Vector3(0, -1.74, 0.44)
const HEAD_TOP := Vector3(0, -1.62, -0.6)
const HEAD_LOW := Vector3(0, -1.98, -0.68)
const BARS := Vector3(0, -1.46, -0.56)
const JETS: Array[float] = [-0.95, 0.95]

var coats: Array[ShaderMaterial] = [] # its feathers' shells, which the wind lays back
var plumes: Array[ShaderMaterial] = [] # its long feathers, cloth in the wind
var angle := 0.0 # of the cranks
var rig := Node3D.new()
var cranks := Node3D.new()
var pedals: Array[Node3D] = []
var legs: Array[Array] = [] # for each side: thigh, shin, knee, foot
var wheels: Array[Node3D] = []
var fans: Array[Node3D] = []
var shaft := Node3D.new()
var chain: Array[ShaderMaterial] = []
var steer := Node3D.new() # the handlebar, its stem, the fork and the front wheel, which turn in the head tube
var wings: Array[Array] = [] # for each side: the upper wing, the forearm, the flight feathers' frame, the tip on the grip
var bird := Node3D.new()
var head := Node3D.new()
var pouch := Node3D.new()
var tube := CylinderMesh.new()
var ball := SphereMesh.new()
var disc := CylinderMesh.new()


func _init() -> void:
	tube.top_radius = 0.5
	tube.bottom_radius = 0.5
	tube.height = 1.0
	tube.radial_segments = 12
	tube.rings = 0
	ball.radial_segments = 24
	ball.rings = 12
	disc.top_radius = 1.0
	disc.bottom_radius = 1.0
	disc.height = 1.0
	disc.radial_segments = 40
	disc.rings = 0
	rig.scale = Vector3.ONE * SIZE
	rig.position = HANG
	add_child(rig)
	build_bicycle()
	build_drive()
	build_bird()
	pedal(0.0, 1.0, 0.0)


func rod(to: Node3D, material: Material, from: Vector3, end: Vector3, thick: float) -> MeshInstance3D:
	var instance := Parts.part(to, tube, material, Vector3.ZERO)
	Parts.lay(instance, from, end, thick)
	return instance


## A material of drive.gdshader: sectors around a turning part, or links along a chain.
static func drive(colour: Color, between: Color, links: float, around: bool) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = preload("res://drive.gdshader")
	material.set_shader_parameter("colour", colour)
	material.set_shader_parameter("between", between)
	material.set_shader_parameter("links", links)
	material.set_shader_parameter("around", around)
	return material


## A disc that turns about x, in sectors that show its turning. Returns the node to turn.
func turning(to: Node3D, place: Vector3, radius: float, thick: float, material: Material) -> Node3D:
	var hub := Node3D.new()
	hub.position = place
	to.add_child(hub)
	Parts.part(hub, disc, material, Vector3.ZERO, Vector3(0, 0, 90), Vector3(radius, thick, radius))
	return hub


func build_bicycle() -> void:
	var frame := Parts.paint(Color(1.0, 0.74, 0.08), 0.3)
	frame.metallic = 0.4
	var chrome := Parts.paint(Color(0.72, 0.74, 0.78), 0.25)
	chrome.metallic = 0.9
	var rubber := Parts.paint(Color(0.03, 0.03, 0.035), 0.9)
	rod(rig, frame, BRACKET, SEAT, 0.075)
	rod(rig, frame, SEAT, HEAD_TOP, 0.075)
	rod(rig, frame, BRACKET, HEAD_LOW, 0.085)
	rod(rig, frame, HEAD_LOW, HEAD_TOP + Vector3(0, 0.06, 0.012), 0.095)
	# What steers turns in the head tube: the stem and the handlebar with its grips, the fork
	# and the front wheel. Its parts are placed from the head tube's top.
	steer.position = HEAD_TOP
	rig.add_child(steer)
	rod(steer, chrome, Vector3.ZERO, BARS - HEAD_TOP, 0.05)
	rod(steer, chrome, BARS - HEAD_TOP - Vector3(0.38, 0, 0), BARS - HEAD_TOP + Vector3(0.38, 0, 0), 0.045)
	for side: float in [-1.0, 1.0]:
		var out := Vector3(side * 0.075, 0, 0)
		rod(rig, frame, BRACKET + out * 0.8, REAR + out, 0.05)
		rod(rig, frame, SEAT, REAR + out, 0.045)
		rod(steer, frame, HEAD_LOW + out - HEAD_TOP, FRONT + out - HEAD_TOP, 0.055)
		rod(steer, rubber, BARS - HEAD_TOP + Vector3(side * 0.26, 0, 0), BARS - HEAD_TOP + Vector3(side * 0.44, 0, 0), 0.07)
		# It hangs from the board by its rear axle, and by two rods from its head tube that
		# pass the rider's head and bill on either side.
		rod(self, chrome, rig.transform * (REAR + out), Vector3(side * 0.8, -0.2, 1.25), 0.05)
		rod(self, chrome, rig.transform * HEAD_TOP, Vector3(side * 0.85, -0.2, -1.25), 0.05)
	Parts.part(rig, ball, Parts.paint(Color(0.2, 0.09, 0.04), 0.5), SEAT + Vector3(0, 0.05, 0.06), Vector3.ZERO, Vector3(0.26, 0.09, 0.44))
	var tyre := TorusMesh.new()
	tyre.inner_radius = 0.42
	tyre.outer_radius = 0.5
	tyre.rings = 40
	tyre.ring_segments = 10
	var spokes := drive(Color(0.95, 0.9, 0.75), Color(0.05, 0.55, 0.6), 5.0, true)
	spokes.set_shader_parameter("metal", 0.0)
	spokes.set_shader_parameter("rough", 0.9)
	for place: Vector3 in [REAR, FRONT]:
		var wheel := turning(rig if place == REAR else steer, place if place == REAR else FRONT - HEAD_TOP, 0.43, 0.025, spokes)
		Parts.part(wheel, tyre, rubber, Vector3.ZERO, Vector3(0, 0, 90))
		Parts.part(wheel, tube, chrome, Vector3.ZERO, Vector3(0, 0, 90), Vector3(0.09, 0.17, 0.09))
		wheels.append(wheel)


## The cranks and their chainring, the chain up to the shaft, the shaft across to both jets,
## and a fan in each jet's intake.
func build_drive() -> void:
	var chrome := Parts.paint(Color(0.72, 0.74, 0.78), 0.25)
	chrome.metallic = 0.9
	var rubber := Parts.paint(Color(0.03, 0.03, 0.035), 0.9)
	var gold := Color(1.0, 0.72, 0.2)
	var dark := Color(0.04, 0.04, 0.05)
	cranks.position = BRACKET
	rig.add_child(cranks)
	turning(cranks, Vector3(RING_OUT, 0, 0), RING, 0.03, drive(gold, dark, 6.0, true))
	rod(cranks, chrome, Vector3(-PEDAL, 0, 0), Vector3(PEDAL, 0, 0), 0.05)
	for side: float in [-1.0, 1.0]:
		var end := Vector3(side * 0.36, 0, -side * CRANK)
		rod(cranks, chrome, Vector3(side * 0.36, 0, 0), end, 0.055)
		var pedal := Node3D.new()
		pedal.position = Vector3(side * PEDAL, 0, -side * CRANK)
		cranks.add_child(pedal)
		var tread := BoxMesh.new()
		tread.size = Vector3(0.18, 0.035, 0.24)
		Parts.part(pedal, tread, rubber, Vector3.ZERO)
		pedals.append(pedal)
	# The chain: two runs between the chainring and the shaft's sprocket, each a pair of crossed
	# ribbons whose links run with the cranks.
	var low := rig.transform * Vector3(RING_OUT, BRACKET.y, BRACKET.z)
	var along := SHAFT - low
	var across := Vector3(0, -along.z, along.y).normalized()
	var ribbon := PlaneMesh.new()
	ribbon.size = Vector2.ONE
	for way: float in [-1.0, 1.0]:
		var from := low + across * way * RING * SIZE
		var run := SHAFT + across * way * SPROCKET - from
		var links := drive(Color(0.75, 0.76, 0.8), dark, run.length() / LINK, false)
		links.set_meta("way", way)
		chain.append(links)
		var out := run.normalized().cross(Vector3.RIGHT)
		for pair: Array in [[Vector3.RIGHT, out], [out, Vector3.RIGHT]]:
			var face := Parts.part(self, ribbon, links, Vector3.ZERO)
			face.transform = Transform3D(Basis(pair[0] * 0.055, pair[1], run), from + run / 2.0)
			face.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shaft.position = Vector3(0, SHAFT.y, SHAFT.z)
	add_child(shaft)
	Parts.part(shaft, tube, drive(Color(0.8, 0.82, 0.86), Color(0.8, 0.1, 0.08), 2.0, true), Vector3.ZERO, Vector3(0, 0, 90), Vector3(0.075, JETS[1] - JETS[0], 0.075))
	turning(shaft, Vector3(SHAFT.x, 0, 0), SPROCKET, 0.03, drive(gold, dark, 4.0, true))
	var blades := drive(Color(0.82, 0.84, 0.88), Color(0.1, 0.1, 0.12), 6.0, true)
	for x in JETS:
		var fan := Node3D.new()
		fan.position = Vector3(x, -0.3, 1.19)
		add_child(fan)
		Parts.part(fan, disc, blades, Vector3.ZERO, Vector3(90, 0, 0), Vector3(0.2, 0.02, 0.2))
		Parts.part(fan, ball, chrome, Vector3(0, 0, -0.03), Vector3.ZERO, Vector3(0.11, 0.11, 0.16))
		fans.append(fan)


## A long feather: a strip of cape.gdshader's cloth from its root, along `way`, facing `face`.
func plume(to: Node3D, root: Vector3, way: Vector3, face: Vector3, size: Vector2, colour: Color, tip: Color) -> void:
	var strip := PlaneMesh.new()
	strip.size = Vector2.ONE
	strip.center_offset = Vector3(0, 0, 0.5)
	strip.subdivide_depth = 8
	var material := ShaderMaterial.new()
	material.shader = preload("res://cape.gdshader")
	material.set_shader_parameter("colour", colour)
	material.set_shader_parameter("tip", tip)
	material.set_shader_parameter("widens", Vector2(1.0, -0.85))
	material.set_shader_parameter("flaps", 0.3)
	material.set_shader_parameter("own", plumes.size() * 1.7)
	plumes.append(material)
	var feather := Parts.part(to, strip, material, Vector3.ZERO)
	way = way.normalized()
	var side := face.cross(way).normalized()
	feather.transform = Transform3D(Basis(side * size.x, way.cross(side), way * size.y), root)


func build_bird() -> void:
	var white := Color(0.97, 0.96, 0.93)
	var black := Color(0.03, 0.03, 0.04)
	var orange := Parts.paint(Color(1.0, 0.45, 0.08), 0.5)
	var plain := Parts.paint(white, 0.8)
	rig.add_child(bird)
	Parts.coated(coats, bird, ball, white, 0.1, Vector2(34, 46), Vector3(0, -1.36, 0.28), Vector3(-18, 0, 0), Vector3(0.62, 0.6, 1.0))
	Parts.coated(coats, bird, ball, white, 0.08, Vector2(30, 30), Vector3(0, -1.28, -0.1), Vector3.ZERO, Vector3(0.5, 0.52, 0.5))
	# The neck, in two bends up to the head.
	var bend := Vector3(0, -0.93, -0.42)
	head.position = Vector3(0, -0.72, -0.64)
	bird.add_child(head)
	Parts.lay(Parts.coated(coats, bird, tube, white, 0.035, Vector2(44, 30), Vector3.ZERO), Vector3(0, -1.22, -0.22), bend, 0.21)
	Parts.lay(Parts.coated(coats, bird, tube, white, 0.035, Vector2(44, 24), Vector3.ZERO), bend, head.position, 0.19)
	Parts.part(bird, ball, plain, bend, Vector3.ZERO, Vector3.ONE * 0.22)
	Parts.coated(coats, head, ball, white, 0.05, Vector2(40, 30), Vector3.ZERO, Vector3.ZERO, Vector3(0.34, 0.33, 0.38))
	for side: float in [-1.0, 1.0]:
		Parts.part(head, ball, Parts.paint(black, 0.1), Vector3(side * 0.135, 0.03, -0.1), Vector3.ZERO, Vector3.ONE * 0.075)
	# The bill, long and flat, and the pouch under it.
	var bill := Parts.part(head, ball, Parts.paint(Color(1.0, 0.78, 0.3), 0.4), Vector3.ZERO)
	Parts.lay(bill, Vector3(0, 0.0, -0.02), Vector3(0, -0.32, -1.12), 0.24)
	bill.scale.x *= 0.4
	pouch.position = Vector3(0, -0.06, -0.12)
	head.add_child(pouch)
	var sack := Parts.part(pouch, ball, orange, Vector3.ZERO)
	Parts.lay(sack, Vector3(0, -0.08, 0.1), Vector3(0, -0.4, -0.9), 0.36)
	sack.scale.z *= 0.6
	# A cyclist's cap in the cape's red.
	var red := Parts.paint(Color(0.8, 0.05, 0.08), 0.6)
	Parts.part(head, ball, red, Vector3(0, 0.1, 0.02), Vector3.ZERO, Vector3(0.36, 0.2, 0.38))
	Parts.part(head, ball, red, Vector3(0, 0.08, -0.2), Vector3(12, 0, 0), Vector3(0.25, 0.03, 0.24))
	# The wings reach forward to the handlebar and hold its grips: an upper wing from the
	# shoulder to the elbow and a forearm from there to the grip, laid each frame as the legs
	# are; black flight feathers trail from the elbow in the wind, and the wing's black tip
	# is closed around the grip. A fan of a tail.
	for side: float in [-1.0, 1.0]:
		var elbow := Node3D.new()
		rig.add_child(elbow)
		for feather in 4:
			plume(elbow, Vector3(side * 0.03, -0.02 - feather * 0.07, 0.02), Vector3(side * 0.2, -0.16 - feather * 0.05, 1.0), Vector3(side, 0.25, 0), Vector2(0.15, 0.66 - feather * 0.07), white, black)
		wings.append([Parts.coated(coats, rig, ball, white, 0.07, Vector2(30, 36), Vector3.ZERO), Parts.coated(coats, rig, ball, white, 0.06, Vector2(26, 30), Vector3.ZERO), elbow,
			Parts.part(rig, ball, Parts.paint(black, 0.5), Vector3.ZERO, Vector3.ZERO, Vector3(0.15, 0.12, 0.17))])
	for feather in 3:
		plume(bird, Vector3((feather - 1) * 0.1, -1.24, 0.7), Vector3((feather - 1) * 0.3, 0.22, 1.0), Vector3.UP, Vector2(0.17, 0.46), white, Color(0.55, 0.55, 0.6))
	for feather in 3:
		plume(head, Vector3((feather - 1) * 0.05, 0.02, 0.13), Vector3((feather - 1) * 0.25, 0.1, 1.0), Vector3.UP, Vector2(0.06, 0.3), white, white)
	# The legs, laid from hip to knee to pedal each frame, and webbed feet.
	for side: float in [-1.0, 1.0]:
		var leg: Array[MeshInstance3D] = [Parts.part(rig, tube, orange, Vector3.ZERO), Parts.part(rig, tube, orange, Vector3.ZERO),
			Parts.part(rig, ball, orange, Vector3.ZERO, Vector3.ZERO, Vector3.ONE * 0.1),
			Parts.part(rig, ball, orange, Vector3.ZERO, Vector3.ZERO, Vector3(0.22, 0.05, 0.34))]
		legs.append(leg)


## Lays a unit ball as a flat limb from one point to another: that wide, and that thick toward
## the side it is on.
func lay_flat(limb: Node3D, from: Vector3, to: Vector3, side: float, wide: float, thick: float) -> void:
	var along := to - from
	var up := along.normalized()
	var out := (Vector3(side, 0, 0) - up * up.x * side).normalized()
	limb.transform = Transform3D(Basis(out * thick, along, up.cross(out) * wide), (from + to) / 2.0)


## Turns the cranks: `fast` is the flight's speed over its cruise. Everything the pedalling
## drives turns by the cranks' angle, so nothing slips against anything else.
func pedal(delta: float, fast: float, turn: float) -> void:
	angle += TAU * 1.05 * fast * delta
	# Forward: the top of the chainring goes toward the front.
	cranks.rotation.x = -angle
	shaft.rotation.x = -angle * RING * SIZE / SPROCKET
	for links in chain:
		links.set_shader_parameter("run", links.get_meta("way") * angle * RING * SIZE / LINK)
	for fan in fans:
		fan.rotation.z = angle * 2.0
	for wheel in wheels:
		wheel.rotation.x = -angle * 1.5
	# The bird rocks on its saddle with each stroke, and its head keeps level against it.
	var rock := sin(angle)
	bird.position = Vector3(rock * 0.025, 0.012 * cos(angle * 2.0), 0)
	bird.rotation.z = rock * 0.05
	head.rotation = Vector3(0.05 * cos(angle * 2.0), 0, -rock * 0.07)
	pouch.rotation.z = rock * 0.1
	# The handlebar turns into the flight's turn, and the wings stay on its grips.
	steer.transform = Transform3D(Basis((HEAD_TOP - HEAD_LOW).normalized(), -turn * 0.35), HEAD_TOP)
	for index in 2:
		var side := index * 2.0 - 1.0
		var shoulder := bird.transform * Vector3(side * 0.29, -1.2, -0.04)
		var grip := steer.transform * (BARS - HEAD_TOP + Vector3(side * 0.35, 0.02, 0))
		var elbow := (shoulder + grip) / 2.0 + Vector3(side * 0.15, -0.05, 0.08)
		var wing: Array = wings[index]
		lay_flat(wing[0], shoulder + (shoulder - elbow) * 0.2, elbow + (elbow - shoulder) * 0.2, side, 0.34, 0.15)
		lay_flat(wing[1], elbow + (elbow - grip) * 0.2, grip + (grip - elbow) * 0.08, side, 0.25, 0.12)
		wing[2].position = elbow
		wing[3].position = grip
	for index in 2:
		var side := index * 2.0 - 1.0
		pedals[index].rotation.x = angle
		var foot := BRACKET + Vector3(side * PEDAL, 0.05, 0) + Basis(Vector3.RIGHT, -angle) * Vector3(0, 0, -side * CRANK)
		var hip := Vector3(side * HIP.x, HIP.y, HIP.z) + bird.position
		var reach := foot - hip
		var far := clampf(reach.length(), 0.1, THIGH + SHIN - 0.01)
		var along := reach.normalized()
		var to_knee := (THIGH * THIGH - SHIN * SHIN + far * far) / (2.0 * far)
		# The knee bends forward and a little outward.
		var forward := Vector3(side * 0.3, 0, -1.0)
		var bend := (forward - along * along.dot(forward)).normalized()
		var knee := hip + along * to_knee + bend * sqrt(maxf(THIGH * THIGH - to_knee * to_knee, 0.0))
		var leg: Array = legs[index]
		Parts.lay(leg[0], hip, knee, 0.085)
		Parts.lay(leg[1], knee, foot, 0.07)
		leg[2].position = knee
		leg[3].position = foot + Vector3(0, 0.02, -0.06)


## How hard the pelican is pushing, between 0 and 1: twice a turn of the cranks.
func stroke() -> float:
	return 0.5 + 0.5 * cos(angle * 2.0)
