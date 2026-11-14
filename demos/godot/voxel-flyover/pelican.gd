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
	pedal(0.0, 1.0)


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
	rod(rig, chrome, HEAD_TOP, BARS, 0.05)
	rod(rig, chrome, BARS - Vector3(0.38, 0, 0), BARS + Vector3(0.38, 0, 0), 0.045)
	for side: float in [-1.0, 1.0]:
		var out := Vector3(side * 0.075, 0, 0)
		rod(rig, frame, BRACKET + out * 0.8, REAR + out, 0.05)
		rod(rig, frame, SEAT, REAR + out, 0.045)
		rod(rig, frame, HEAD_LOW + out, FRONT + out, 0.055)
		rod(rig, rubber, BARS + Vector3(side * 0.28, 0, 0), BARS + Vector3(side * 0.42, 0, 0), 0.07)
		# It hangs from the board by its rear axle, and by its head tube.
		rod(self, chrome, rig.transform * (REAR + out), Vector3(side * 0.8, -0.2, 1.25), 0.05)
	rod(self, chrome, rig.transform * HEAD_TOP, Vector3(0, -0.1, -1.3), 0.055)
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
		var wheel := turning(rig, place, 0.43, 0.025, spokes)
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
	# The wings, half folded, with black flight feathers that trail in the wind; a fan of a tail.
	for side: float in [-1.0, 1.0]:
		Parts.coated(coats, bird, ball, white, 0.09, Vector2(26, 44), Vector3(side * 0.33, -1.3, 0.3), Vector3(-18, 0, side * -8.0), Vector3(0.16, 0.46, 0.82))
		for feather in 4:
			plume(bird, Vector3(side * 0.39, -1.2 - feather * 0.09, 0.5), Vector3(side * 0.12, -0.1 - feather * 0.04, 1.0), Vector3(side, 0.25, 0), Vector2(0.15, 0.62 - feather * 0.06), white, black)
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


## Turns the cranks: `fast` is the flight's speed over its cruise. Everything the pedalling
## drives turns by the cranks' angle, so nothing slips against anything else.
func pedal(delta: float, fast: float) -> void:
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
