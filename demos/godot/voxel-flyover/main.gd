extends Node3D
## Voxel Flyover: a corgi on a jet surfboard flies over an endless world, from dawn through the day
## into night, and under the board a pelican on a bicycle pedals for the jets. The world is a function (terrain.gdshaderinc): the GPU draws its ground into
## textures as the flight goes, raises grids of land to it and stands trees on it, and nothing of
## it is kept. The corgi flies itself until Enter takes the board.
##
## `-- --autopilot SECONDS` flies by itself, prints its frame rate, how even its frames were, the
## time a frame took and what the frame shows, and quits: Dolly's test uses it. `--day HOUR`
## starts at that hour of 24. Q prints how far the flight went and where the view was turned.

const Terrain := preload("res://terrain.gd")
const Parts := preload("res://parts.gd")
const Pelican := preload("res://pelican.gd")
## The grids of land around the flyer, each around the one before: cells across, a cell's width.
const RINGS := [[256, 1.5], [256, 6.0], [192, 24.0]]
## The grids follow the flight in steps of the coarsest cell, so every point stays where it is.
const STEP := 24.0
const PLOT := 4.0 # a tree's plot
## The trees' grids, each a ring around the flyer with less detail than the one inside it: plots
## across, a crown's rings, and how far out its trees fill in and thin out (trees.gdshader).
const GROVES := [
	[50, 12, Vector4(-2, -1, 64, 80)],
	[128, 5, Vector4(64, 80, 200, 232)],
	[216, 3, Vector4(200, 232, 380, 420)],
	[352, 1, Vector4(380, 420, 560, 690)],
]
## The trees that cast the shadows, in one grid of plain crowns: a shadow needs no more.
const SHADES := [128, 3, Vector4(-2, -1, 200, 232)]
const DAY_SECONDS := 120.0
const CRUISE := 30.0
const BOOST := 26.0
const CEILING := 190.0
const BEACON_PLOT := 180.0
const BEACON_REACH := 8.0
const START := Vector2(2250, 4750)
const WAKE := 64 # the places the wakes keep
const WAKE_APART := 1.2
## The camera's views while the corgi flies itself, each for SHOT_SECONDS: where it stands in the
## flyer's frame, where it looks, and its field of view.
const SHOTS := [
	[Vector3(4.6, 3.6, 9.5), Vector3(-2, -0.5, -25), 66.0],
	[Vector3(-10.5, -1.2, -6.0), Vector3(4, -1.4, 1), 56.0],
	[Vector3(-10.0, -3.4, -8.2), Vector3(0.6, -1.1, 0.4), 46.0],
	[Vector3(9, 26, 34), Vector3(0, -10, -70), 74.0],
	[Vector3(5.5, 0.6, -11.5), Vector3(-1, -0.4, 6), 58.0],
]
const SHOT_SECONDS := 13.0

var environment := Environment.new()
var sky_material := ShaderMaterial.new()
var sun := DirectionalLight3D.new()
var camera := Camera3D.new()
var materials: Array[ShaderMaterial] = [sky_material] # every one that draws the world
var lands: Array[MeshInstance3D] = []
var grounds: Array[SubViewport] = [] # each grid's ground, for the shaders to read
var groves: Array[MultiMeshInstance3D] = []
var water := MeshInstance3D.new()
var flyer := Node3D.new()
var dog := Node3D.new()
var head := Node3D.new()
var legs: Array[MeshInstance3D] = []
var paws: Array[MeshInstance3D] = []
var ears: Array[Node3D] = []
var tail: MeshInstance3D
var tongue: MeshInstance3D
var furs: Array[ShaderMaterial] = []
var cape_material := ShaderMaterial.new()
var pelican := Pelican.new()
var glows: Array[StandardMaterial3D] = [] # the jets' throats
var flutter := 0.0 # the phase of what flutters in the wind, which runs with the speed
var wakes: Array[ShaderMaterial] = []
var wake := PackedVector3Array()
var flames: Array[MeshInstance3D] = []
var searchlight := SpotLight3D.new()
var lamp := OmniLight3D.new()
var hud := CanvasLayer.new()
var title := Label.new()
var hint := Label.new()
var score := Label.new()
var engine := AudioStreamPlayer.new()
var bell := AudioStreamPlayer.new()
var leaving := false # after Q, or a flight by itself that has ended
var beacons := {} # plot -> its node, for the plots around the flyer
var lit := {} # plot -> where it stands (x, y) and the clock when it was lit (z)

var helm := false # the player's, after Enter or a click
var captured := false # the pointer, which the page gives the game at a click
var look := Vector2.ZERO # where the mouse has turned the view: around the flyer, and over it
var looked := Vector2.ZERO # the view on its way there
var shown_score := 0.0
var hint_until := 0.0 # the keys show for a while after the board changes hands
var day := 0.24
var heading := PI / 2.0 # east, along the coast
var turn := 0.0
var climb := 0.0
var speed := CRUISE
var flown := 0.0
var view: Vector3 = SHOTS[0][0]
var aim: Vector3 = SHOTS[0][1]
var autopilot_seconds := 0.0
var elapsed := 0.0
var frames := 0
var steady_from := 0
var gpu_milliseconds := 0.0
var cpu_milliseconds := 0.0
var frame_began := 0
var frame_milliseconds := PackedFloat32Array() # each steady frame's, for a flight by itself


func option(name: String, otherwise: float) -> float:
	var arguments := OS.get_cmdline_user_args()
	var at := arguments.find(name)
	return arguments[at + 1].to_float() if at >= 0 and at + 1 < arguments.size() else otherwise


func _ready() -> void:
	autopilot_seconds = option("--autopilot", 0.0)
	day = option("--day", day * 24.0) / 24.0
	build_light()
	for ring: Array in RINGS:
		grounds.append(build_ground(ring[0] + 4, ring[1]))
	var hole := 0.0
	for ring in RINGS.size():
		var across: int = RINGS[ring][0]
		var cell: float = RINGS[ring][1]
		var plane := PlaneMesh.new()
		plane.size = Vector2(across, across) * cell
		plane.subdivide_width = across - 1
		plane.subdivide_depth = across - 1
		var land := MeshInstance3D.new()
		land.mesh = plane
		land.material_override = reads_ground(preload("res://land.gdshader"), ring)
		materials[-1].set_shader_parameter("hole", hole)
		land.custom_aabb = AABB(Vector3(-across * cell / 2.0, 0, -across * cell / 2.0), Vector3(across * cell, 260, across * cell))
		land.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if ring < 2 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(land)
		lands.append(land)
		hole = across * cell / 2.0
	for grove: Array in GROVES + [SHADES]:
		groves.append(build_grid(tree_mesh(grove[1]), grove[0], PLOT, reads_ground(preload("res://trees.gdshader"), 0)))
		materials[-1].set_shader_parameter("ring", grove[2])
		groves[-1].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if grove == SHADES else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		materials[-1].set_shader_parameter("shrinks", grove == SHADES)
	var plane := PlaneMesh.new()
	plane.size = Vector2(8000, 8000)
	water.mesh = plane
	water.material_override = reads_ground(preload("res://water.gdshader"), 1)
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)
	build_flyer()
	camera.far = 3000.0
	camera.near = 0.3
	add_child(camera)
	build_hud()
	flyer.position = Vector3(START.x, Terrain.surface(START) + 30.0, START.y)
	camera.position = flyer.position + view
	wake.resize(WAKE)
	wake.fill(flyer.position)
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	if autopilot_seconds <= 0.0:
		# The page gives the pointer at a click, and takes it back at Escape.
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		print("FLYOVER adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())


## Tells every shader that draws the world.
func tell(parameter: String, value: Variant) -> void:
	for material in materials:
		material.set_shader_parameter(parameter, value)


func build_light() -> void:
	sky_material.shader = preload("res://sky.gdshader")
	var sky := Sky.new()
	sky.sky_material = sky_material
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.ambient_light_sky_contribution = 0.7
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_white = 6.0
	environment.glow_enabled = true
	environment.glow_intensity = 0.7
	environment.glow_strength = 1.1
	environment.glow_bloom = 0.06
	environment.glow_hdr_threshold = 1.0
	environment.ssao_enabled = true
	environment.ssao_radius = 1.6
	environment.ssao_intensity = 2.4
	# Haze that thickens toward the sea, in the sky's colour, and fog the light draws its shafts in.
	environment.fog_enabled = true
	environment.fog_mode = Environment.FOG_MODE_EXPONENTIAL
	environment.fog_density = 0.0006
	environment.fog_height = Terrain.SEA + 14.0
	environment.fog_height_density = 0.006
	environment.fog_aerial_perspective = 0.7
	environment.fog_sun_scatter = 0.12
	environment.fog_sky_affect = 0.0
	environment.volumetric_fog_enabled = true
	environment.volumetric_fog_density = 0.0011
	environment.volumetric_fog_anisotropy = 0.7
	environment.volumetric_fog_length = 260.0
	environment.volumetric_fog_sky_affect = 0.0
	environment.volumetric_fog_ambient_inject = 0.2
	environment.adjustment_enabled = true
	environment.adjustment_saturation = 1.2
	environment.adjustment_contrast = 1.1
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 420.0
	sun.light_volumetric_fog_energy = 1.3
	add_child(sun)


## A material of a shader that reads the ground of a grid of land, and of the coarser grid around it.
func reads_ground(shader: Shader, ring: int) -> ShaderMaterial:
	var beyond := mini(ring + 1, RINGS.size() - 1)
	var material := ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("ground", grounds[ring].get_texture())
	material.set_shader_parameter("ground_beyond", grounds[beyond].get_texture())
	material.set_shader_parameter("cell", RINGS[ring][1])
	material.set_shader_parameter("cell_beyond", RINGS[beyond][1])
	material.set_shader_parameter("reach", (RINGS[ring][0] * RINGS[ring][1] - STEP) / 2.0)
	materials.append(material)
	return material


## A square grid of one mesh, a plot for each; its shader places each instance by the plot it
## stands in, so the grid can follow the flight in steps.
func build_grid(mesh: Mesh, across: int, plot: float, material: Material) -> MultiMeshInstance3D:
	var grid := MultiMesh.new()
	grid.transform_format = MultiMesh.TRANSFORM_3D
	grid.mesh = mesh
	grid.instance_count = across * across
	var transforms := PackedFloat32Array()
	transforms.resize(across * across * 12)
	transforms.fill(0.0)
	var at := 0
	for z in across:
		for x in across:
			transforms[at] = 1.0
			transforms[at + 3] = (x - across / 2 + 0.5) * plot
			transforms[at + 5] = 1.0
			transforms[at + 10] = 1.0
			transforms[at + 11] = (z - across / 2 + 0.5) * plot
			at += 12
	grid.buffer = transforms
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = grid
	instance.material_override = material
	var half := (across / 2.0 + 1.0) * plot
	instance.custom_aabb = AABB(Vector3(-half, 0, -half), Vector3(half * 2.0, 280, half * 2.0))
	add_child(instance)
	return instance


## The ground of a grid of land as a texture, a texel for each of its points and two more around
## them, which ground.gdshader draws when the grids step.
func build_ground(texels: int, cell: float) -> SubViewport:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(texels, texels)
	viewport.use_hdr_2d = true
	viewport.transparent_bg = true
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	var points := ColorRect.new()
	points.size = viewport.size
	var material := ShaderMaterial.new()
	material.shader = preload("res://ground.gdshader")
	material.set_shader_parameter("cell", cell)
	material.set_shader_parameter("texels", float(texels))
	points.material = material
	viewport.add_child(points)
	add_child(viewport)
	return viewport


## A tree standing on y = 0 for trees.gdshader to shape: a ball of that many rings, around
## (0, 2, 0), for its crown, and under it a trunk up to 0.9, which the trees far off go without.
static func tree_mesh(rings: int) -> ArrayMesh:
	var crown := SphereMesh.new()
	crown.radius = 1.0
	crown.height = 2.0
	crown.radial_segments = rings + 3
	crown.rings = rings
	var tool := SurfaceTool.new()
	if rings >= 5:
		var trunk := CylinderMesh.new()
		trunk.top_radius = 0.7
		trunk.bottom_radius = 1.0
		trunk.height = 0.9
		trunk.radial_segments = 6
		trunk.rings = 0
		trunk.cap_top = false
		trunk.cap_bottom = false
		tool.append_from(trunk, 0, Transform3D(Basis.IDENTITY, Vector3(0, 0.45, 0)))
	tool.append_from(crown, 0, Transform3D(Basis.IDENTITY, Vector3(0, 2, 0)))
	return tool.commit()


## The flyer: a corgi in sunglasses and a cape, crouched on a surfboard that two small jets carry.
## It looks along -z. The character is this game's own.
func build_flyer() -> void:
	var tan_fur := Color(0.8, 0.46, 0.2)
	var white_fur := Color(0.97, 0.95, 0.9)
	var fur := Parts.paint(tan_fur, 0.75)
	var white := Parts.paint(white_fur, 0.8)
	var black := Parts.paint(Color(0.015, 0.015, 0.02), 0.08)
	var pink := Parts.paint(Color(0.9, 0.45, 0.5), 0.6)
	var steel := Parts.paint(Color(0.45, 0.47, 0.5), 0.3)
	steel.metallic = 0.8
	var dark := Parts.paint(Color(0.05, 0.05, 0.06), 0.4)
	dark.metallic = 0.6
	var shades := Parts.paint(Color(0.03, 0.04, 0.08), 0.04)
	shades.metallic = 1.0
	var gold := Parts.paint(Color(1.0, 0.72, 0.2), 0.25)
	gold.metallic = 0.9
	var ball := SphereMesh.new()
	ball.radial_segments = 28
	ball.rings = 14
	var rod := CapsuleMesh.new()
	rod.radial_segments = 28
	rod.rings = 6
	var point := CylinderMesh.new()
	point.top_radius = 0.0
	# The board: teal with a cream stripe, a fin under its tail.
	Parts.part(flyer, ball, Parts.paint(Color(0.05, 0.55, 0.6), 0.25), Vector3.ZERO, Vector3.ZERO, Vector3(2.0, 0.28, 6.4))
	Parts.part(flyer, ball, Parts.paint(Color(0.95, 0.9, 0.75), 0.3), Vector3(0, 0.03, 0), Vector3.ZERO, Vector3(0.5, 0.28, 6.1))
	Parts.part(flyer, point, steel, Vector3(0, -0.4, 2.3), Vector3(200, 0, 0), Vector3(0.12, 0.35, 0.7))
	# The jets, one under each rail: an intake's ring, a nozzle, and a flame with a white heart.
	var flame := StandardMaterial3D.new()
	flame.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flame.albedo_color = Color(0.25, 0.7, 1.6)
	var heart := flame.duplicate() as StandardMaterial3D
	heart.albedo_color = Color(1.6, 1.5, 1.2)
	var lip := TorusMesh.new()
	lip.inner_radius = 0.2
	lip.outer_radius = 0.33
	var nozzle := CylinderMesh.new()
	nozzle.top_radius = 0.2
	nozzle.bottom_radius = 0.3
	nozzle.height = 0.4
	for x: float in [-0.95, 0.95]:
		Parts.part(flyer, rod, steel, Vector3(x, -0.3, 1.9), Vector3(90, 0, 0), Vector3(0.55, 0.75, 0.55))
		Parts.part(flyer, lip, Parts.paint(Color(0.8, 0.1, 0.08), 0.4), Vector3(x, -0.3, 1.2), Vector3(90, 0, 0))
		Parts.part(flyer, nozzle, dark, Vector3(x, -0.3, 2.75), Vector3(90, 0, 0))
		glows.append(Parts.paint(Color(1.0, 0.7, 0.35), 0.4, 6.0))
		Parts.part(flyer, ball, glows[-1], Vector3(x, -0.3, 2.9), Vector3.ZERO, Vector3(0.34, 0.34, 0.12))
		for pair: Array in [[flame, 0.3, 0.7], [heart, 0.14, 0.4]]:
			flames.append(Parts.part(flyer, point, pair[0], Vector3(x, -0.3, 2.95 + pair[2]), Vector3(90, 0, 0), Vector3(pair[1], pair[2], pair[1])))
			flames[-1].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flyer.add_child(pelican)
	furs.append_array(pelican.coats)
	# The corgi: long and low, white in front and under, with a thick coat and large ears.
	flyer.add_child(dog)
	Parts.coated(furs, dog, rod, tan_fur, 0.11, Vector2(170, 150), Vector3(0, 0.95, 0.25), Vector3(90, 0, 0), Vector3(1.15, 1.25, 1.1))
	Parts.coated(furs, dog, ball, white_fur, 0.13, Vector2(150, 75), Vector3(0, 0.82, -0.55), Vector3.ZERO, Vector3(1.0, 0.95, 1.0))
	Parts.coated(furs, dog, ball, tan_fur, 0.15, Vector2(150, 75), Vector3(0, 0.98, 1.38), Vector3.ZERO, Vector3(1.0, 1.0, 0.8))
	Parts.coated(furs, dog, ball, white_fur, 0.16, Vector2(130, 65), Vector3(0, 0.72, 1.5), Vector3.ZERO, Vector3(0.8, 0.6, 0.6))
	tail = Parts.coated(furs, dog, ball, tan_fur, 0.1, Vector2(70, 35), Vector3(0, 1.3, 1.62), Vector3.ZERO, Vector3(0.3, 0.3, 0.42))
	for x: float in [-0.36, 0.36]:
		for z: float in [-0.6, 1.1]:
			legs.append(Parts.coated(furs, dog, rod, white_fur, 0.05, Vector2(60, 50), Vector3(x, 0.3, z), Vector3.ZERO, Vector3(0.3, 0.32, 0.3)))
			paws.append(Parts.part(dog, ball, white, Vector3(x, 0.06, z - 0.08), Vector3.ZERO, Vector3(0.34, 0.2, 0.46)))
	head.position = Vector3(0, 1.62, -1.0)
	dog.add_child(head)
	Parts.coated(furs, head, ball, tan_fur, 0.06, Vector2(190, 95), Vector3.ZERO, Vector3.ZERO, Vector3(1.12, 1.02, 1.05))
	Parts.coated(furs, head, ball, white_fur, 0.09, Vector2(120, 60), Vector3(0, -0.2, -0.08), Vector3.ZERO, Vector3(1.0, 0.7, 0.9))
	Parts.part(head, ball, white, Vector3(0, -0.14, -0.5), Vector3.ZERO, Vector3(0.56, 0.46, 0.8))
	Parts.part(head, ball, white, Vector3(0, 0.1, -0.36), Vector3(20, 0, 0), Vector3(0.22, 0.5, 0.5))
	Parts.part(head, ball, black, Vector3(0, -0.06, -0.9), Vector3.ZERO, Vector3(0.2, 0.15, 0.14))
	tongue = Parts.part(head, ball, pink, Vector3(0.12, -0.38, -0.7), Vector3(25, 0, 0), Vector3(0.2, 0.06, 0.36))
	var arm := BoxMesh.new()
	arm.size = Vector3(0.04, 0.05, 0.62)
	for x: float in [-1.0, 1.0]:
		var ear := Node3D.new()
		ear.position = Vector3(x * 0.4, 0.3, 0.12)
		head.add_child(ear)
		ears.append(ear)
		Parts.part(ear, point, fur, Vector3(0, 0.4, 0), Vector3(0, 0, x * -16), Vector3(0.6, 0.42, 0.3))
		Parts.part(ear, point, pink, Vector3(0, 0.38, -0.05), Vector3(0, 0, x * -16), Vector3(0.36, 0.32, 0.12))
		# The sunglasses: two dark mirrors in gold frames, a bar across the nose and an arm to each ear.
		Parts.part(head, ball, shades, Vector3(x * 0.29, 0.13, -0.53), Vector3(8, x * -16, 0), Vector3(0.6, 0.42, 0.1))
		Parts.part(head, lip, gold, Vector3(x * 0.29, 0.13, -0.52), Vector3(98, x * -16, 0), Vector3(0.95, 0.3, 0.68))
		Parts.part(head, arm, gold, Vector3(x * 0.6, 0.17, -0.2))
	var bar := BoxMesh.new()
	bar.size = Vector3(1.1, 0.05, 0.05)
	Parts.part(head, bar, gold, Vector3(0, 0.2, -0.52))
	# The cape, from a red collar.
	var collar := TorusMesh.new()
	collar.inner_radius = 0.48
	collar.outer_radius = 0.68
	Parts.part(dog, collar, Parts.paint(Color(0.8, 0.05, 0.08), 0.6), Vector3(0, 1.3, -0.62), Vector3(68, 0, 0))
	var cloth := PlaneMesh.new()
	cloth.size = Vector2(1.0, 2.5)
	cloth.center_offset = Vector3(0, 0, 1.25)
	cloth.subdivide_width = 6
	cloth.subdivide_depth = 20
	cape_material.shader = preload("res://cape.gdshader")
	Parts.part(dog, cloth, cape_material, Vector3(0, 1.8, -0.45), Vector3(-22, 0, 0))
	# The wakes, one from each jet: ribbons the shader lays along where the board has been.
	var ribbon := PlaneMesh.new()
	ribbon.subdivide_width = WAKE - 2
	ribbon.subdivide_depth = 0
	for aside: float in [-1.2, 1.2]:
		var wake_material := ShaderMaterial.new()
		wake_material.shader = preload("res://wake.gdshader")
		wake_material.set_shader_parameter("aside", aside)
		wakes.append(wake_material)
		var trail := Parts.part(self, ribbon, wake_material, Vector3.ZERO)
		trail.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
		trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# The headlight under the nose, and the searchlight it turns on the ground at night.
	var lantern := Parts.part(flyer, ball, Parts.paint(Color(1.0, 0.72, 0.3), 0.3, 6.0), Vector3(0, -0.2, -2.6), Vector3.ZERO, Vector3(0.3, 0.3, 0.3))
	# A lamp of its own keeps the corgi in sight at night.
	lamp.light_color = Color(1.0, 0.9, 0.75)
	lamp.omni_range = 7.0
	lamp.position = Vector3(-1.6, 3.0, -1.8)
	flyer.add_child(lamp)
	searchlight.light_color = Color(1.0, 0.86, 0.6)
	searchlight.spot_range = 150.0
	searchlight.spot_angle = 16.0
	searchlight.spot_attenuation = 0.6
	searchlight.shadow_enabled = false
	searchlight.light_volumetric_fog_energy = 6.0
	searchlight.position = lantern.position
	searchlight.rotation_degrees = Vector3(-32, 0, 0)
	flyer.add_child(searchlight)
	flyer.scale = Vector3.ONE * 1.25
	add_child(flyer)
	engine.stream = hum()
	engine.volume_db = -16.0
	add_child(engine)
	engine.play()
	bell.volume_db = -6.0
	add_child(bell)


## The corgi rides the board: it crouches lower the faster it goes and the harder it turns, leans
## and looks into its turns, and the air lays back its ears, cape and coat.
func ride(delta: float) -> void:
	var fast := speed / CRUISE
	flutter += delta * fast
	pelican.pedal(delta, fast)
	var crouch := clampf(0.05 + 0.14 * (fast - 1.0) / (BOOST / CRUISE) + 0.12 * absf(turn) + 0.015 * sin(elapsed * 2.1), 0.0, 0.3)
	dog.position = Vector3(0, 0.14 - crouch, 0.2)
	dog.rotation = Vector3(-crouch * 0.5 + climb * 0.008, 0.0, -turn * 0.22)
	head.rotation = Vector3(deg_to_rad(8.0) + crouch * 0.6, -turn * 0.45, turn * 0.15)
	for leg in legs:
		# From the paw on the board to the hip, which has come down.
		leg.position.y = 0.3 + crouch / 2.0
		leg.scale.y = 0.32 - crouch / 2.0
	for paw in paws:
		paw.position.y = 0.06 + crouch
	for side in 2:
		ears[side].rotation = Vector3(0.05 + 0.2 * fast + 0.06 * sin(elapsed * 23.0 + side * 2.0) * fast, 0.0, turn * 0.25)
	tail.rotation.y = sin(elapsed * 11.0) * 0.6
	tongue.rotation.z = 0.3 * sin(elapsed * 19.0) * fast
	# The jets burn as the pelican pushes: longer and brighter with each stroke of its legs.
	var push := pelican.stroke()
	for flame in flames:
		flame.scale.y = flame.scale.x * (1.3 + 1.4 * fast) * (0.8 + 0.5 * push)
		flame.position.z = 2.95 + flame.scale.y
	for glow in glows:
		glow.emission_energy_multiplier = 3.0 + 6.0 * push
	# The air comes from ahead, and from the outside of a turn.
	var air := flyer.global_basis * Vector3(turn * 0.5, 0.0, 0.9 * fast)
	for fur in furs:
		fur.set_shader_parameter("wind", air)
	for cloth: ShaderMaterial in pelican.plumes + [cape_material]:
		cloth.set_shader_parameter("phase", flutter)
		cloth.set_shader_parameter("lean", turn)
	# The wakes keep a place for every stretch flown, the newest at the board's tail.
	wake[0] = flyer.to_global(Vector3(0, -0.3, 3.0))
	if wake[0].distance_to(wake[1]) > WAKE_APART:
		wake.insert(1, wake[0])
		wake.resize(WAKE)
	for wake_material in wakes:
		wake_material.set_shader_parameter("path", wake)
		wake_material.set_shader_parameter("lead", wake[0].distance_to(wake[1]) / WAKE_APART)
		wake_material.set_shader_parameter("clock", elapsed)
		wake_material.set_shader_parameter("strokes", pelican.angle / PI)


## The jets' drone and the wind around them, made here: two seconds that loop.
static func hum() -> AudioStreamWAV:
	const RATE := 22050
	var count := RATE * 2
	var data := PackedByteArray()
	data.resize(count * 2)
	var air := 0.0
	var random := RandomNumberGenerator.new()
	random.seed = 7
	for i in count:
		var t := float(i) / RATE
		air = lerpf(air, random.randf_range(-1.0, 1.0), 0.04)
		# The noise fades at the loop's ends, where the drone carries it over.
		var value := air * 1.4 * sin(PI * t / 2.0) + 0.22 * sin(TAU * 55.0 * t) + 0.12 * sin(TAU * 110.5 * t) * (0.6 + 0.4 * sin(TAU * 6.0 * t))
		data.encode_s16(i * 2, int(clampf(value * 0.5, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.data = data
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = count
	return stream


func build_hud() -> void:
	add_child(hud)
	for label: Label in [title, hint, score]:
		label.add_theme_color_override("font_color", Color(1, 1, 1, 0.95))
		label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
		label.add_theme_constant_override("shadow_offset_x", 2)
		label.add_theme_constant_override("shadow_offset_y", 2)
		hud.add_child(label)
	title.text = "VOXEL FLYOVER"
	title.add_theme_font_size_override("font_size", 96)
	title.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	title.position.y = 110
	title.grow_horizontal = Control.GROW_DIRECTION_BOTH
	hint.add_theme_font_size_override("font_size", 28)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	hint.grow_horizontal = Control.GROW_DIRECTION_BOTH
	hint.grow_vertical = Control.GROW_DIRECTION_BEGIN
	hint.position.y -= 60
	# The score: the beacons lit, beside a beacon's crystal.
	score.add_theme_font_size_override("font_size", 44)
	score.position = Vector2(84, 26)
	var crystal := Polygon2D.new()
	crystal.polygon = PackedVector2Array([Vector2(0, -22), Vector2(14, 0), Vector2(0, 22), Vector2(-14, 0)])
	crystal.color = Color(1.0, 0.62, 0.15)
	crystal.position = Vector2(52, 58)
	hud.add_child(crystal)
	show_helm()


func show_helm() -> void:
	title.visible = not helm and autopilot_seconds <= 0.0
	hint.visible = autopilot_seconds <= 0.0
	hint_until = elapsed + 12.0
	hint.text = "The corgi flies itself. Enter or a click takes the board.    Q: quit" if not helm \
		else "Arrows or WASD steer, climb and dive    %s    Space: full speed    T: let the hours run    Esc: let go    Q: quit" % ("The mouse looks around" if captured else "Click: look around with the mouse")


func _input(event: InputEvent) -> void:
	if autopilot_seconds > 0.0:
		return
	if event is InputEventMouseMotion and captured:
		var motion := (event as InputEventMouseMotion).relative
		look.x += motion.x * 0.0035
		look.y = clampf(look.y + motion.y * 0.0035, -0.5, 1.0)
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match (event as InputEventKey).physical_keycode:
		KEY_ENTER, KEY_KP_ENTER:
			helm = true
		KEY_ESCAPE:
			helm = false
		KEY_Q:
			print("FLYOVER flown %d beacons %d view %d %d" % [int(flown), lit.size(), int(rad_to_deg(looked.x)), int(rad_to_deg(looked.y))])
			leave()
	show_helm()


## The pointer comes with a click on the page, which takes the board too, and goes at Escape,
## which lets go of it: the page keeps that key while it holds the pointer.
func hold_pointer() -> void:
	var now := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if now == captured:
		return
	captured = now
	helm = captured
	show_helm()


## Quits once the mixer has let go of the sounds, which Godot counts as leaked otherwise; no
## beacon rings meanwhile.
func leave() -> void:
	leaving = true
	engine.stop()
	bell.stop()
	await get_tree().create_timer(0.3).timeout
	get_tree().quit()


func key_axis(negative: Key, positive: Key) -> float:
	return float(Input.is_physical_key_pressed(positive)) - float(Input.is_physical_key_pressed(negative))


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	elapsed += delta
	hold_pointer()
	var hours := 8.0 if helm and Input.is_physical_key_pressed(KEY_T) else 1.0
	day = fposmod(day + delta * hours / DAY_SECONDS, 1.0)
	tell("clock", elapsed)
	set_day()
	fly(delta)
	tend_beacons(delta)
	follow(delta)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	hint.modulate.a = clampf(hint_until - elapsed, 0.0, 1.0)
	# The score swells as a beacon is lit.
	shown_score = lerpf(shown_score, lit.size(), 1.0 - exp(-delta * 6.0))
	score.text = str(lit.size())
	score.scale = Vector2.ONE * (1.0 + 0.5 * clampf(lit.size() - shown_score, 0.0, 1.0))
	if autopilot_seconds > 0.0:
		watch()


func fly(delta: float) -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var forward := Vector3(sin(heading), 0.0, -cos(heading))
	var ground := 0.0
	for step in 5:
		ground = maxf(ground, Terrain.surface(here + Vector2(forward.x, forward.z) * step * 20.0))
	var wanted_turn: float
	var wanted_climb: float
	var wanted_speed := CRUISE
	if helm:
		wanted_turn = Input.get_axis("ui_left", "ui_right") + key_axis(KEY_A, KEY_D)
		wanted_climb = (Input.get_axis("ui_down", "ui_up") + key_axis(KEY_S, KEY_W)) * 14.0
		if Input.is_physical_key_pressed(KEY_SPACE):
			wanted_speed += BOOST
		# The ground pushes the board up, and its ceiling holds it down.
		wanted_climb = maxf(wanted_climb, (ground + 14.0 - flyer.position.y) * 2.0)
		wanted_climb = minf(wanted_climb, (CEILING - flyer.position.y) * 2.0)
	else:
		# A wandering course at a steady height over the ground ahead, by way of the next beacon.
		wanted_turn = sin(flown * 0.0037) * 0.5 + sin(flown * 0.0013 + 1.0) * 0.4
		var height := ground + 22.0
		var beacon := beacon_ahead(forward)
		if beacon:
			var to := beacon.position - flyer.position
			wanted_turn = clampf(forward.signed_angle_to(Vector3(to.x, 0.0, to.z), Vector3.DOWN) * 2.5, -1.0, 1.0)
			if Vector2(to.x, to.z).length() < 110.0:
				height = maxf(ground + 10.0, beacon.position.y)
		wanted_climb = clampf((height - flyer.position.y) * 0.7, -9.0, 14.0)
	var ease := 1.0 - exp(-delta * 2.5)
	turn = lerpf(turn, clampf(wanted_turn, -1.0, 1.0), ease)
	climb = lerpf(climb, wanted_climb, ease)
	speed = lerpf(speed, wanted_speed, 1.0 - exp(-delta * 1.2))
	heading += turn * 0.55 * delta
	flown += speed * delta
	flyer.position += forward * speed * delta + Vector3.UP * climb * delta
	flyer.position.y = maxf(flyer.position.y, Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 10.0)
	# The board banks into its turns and noses up into its climbs.
	flyer.rotation = Vector3(climb * 0.02, -heading, -turn * 0.6)
	engine.pitch_scale = 0.8 + speed / CRUISE * 0.3
	ride(delta)
	var middle := Vector2(snappedf(flyer.position.x, STEP), snappedf(flyer.position.z, STEP))
	if lands[0].position.x != middle.x or lands[0].position.z != middle.y:
		for ring in RINGS.size():
			var cell: float = RINGS[ring][1]
			lands[ring].position = Vector3(middle.x, 0.0, middle.y)
			# The texture's first point is one before the grid's own, for the slopes at its edge.
			(grounds[ring].get_child(0) as ColorRect).material.set_shader_parameter("first", (middle / cell).round() - Vector2.ONE * (RINGS[ring][0] / 2 + 1))
			grounds[ring].render_target_update_mode = SubViewport.UPDATE_ONCE
		tell("middle", middle)
	var among := Vector2(snappedf(flyer.position.x, PLOT * 4.0), snappedf(flyer.position.z, PLOT * 4.0))
	for grove in groves:
		grove.position = Vector3(among.x, 0.0, among.y)
	tell("flyer", Vector2(flyer.position.x, flyer.position.z))
	water.position = Vector3(flyer.position.x, Terrain.SEA - 0.2, flyer.position.z)


## The beacon of a plot of the world: where it floats, or nothing where the plot's place is sea.
static func beacon_place(plot: Vector2i) -> Variant:
	var p := (Vector2(plot) + Vector2(0.15, 0.15) + Vector2(Terrain.cell_hash(plot.x, plot.y), Terrain.cell_hash(plot.y + 57, plot.x - 31)) * 0.7) * BEACON_PLOT
	var ground := Terrain.height(p)
	if ground < Terrain.SEA + 2.0 or ground > Terrain.SEA + 130.0:
		return null
	return Vector3(p.x, ground + 16.0, p.y)


## Keeps the beacons of the 25 plots around the flyer, which come into sight by degrees as it
## nears them, and lights the one it reaches.
func tend_beacons(delta: float) -> void:
	var middle := Vector2i((Vector2(flyer.position.x, flyer.position.z) / BEACON_PLOT).floor())
	for plot: Vector2i in beacons.keys():
		if absi(plot.x - middle.x) > 2 or absi(plot.y - middle.y) > 2:
			beacons[plot].queue_free()
			beacons.erase(plot)
	for x in range(middle.x - 2, middle.x + 3):
		for y in range(middle.y - 2, middle.y + 3):
			var plot := Vector2i(x, y)
			if not beacons.has(plot):
				var place: Variant = beacon_place(plot)
				if place != null:
					beacons[plot] = build_beacon(place, 1.0 if lit.has(plot) else 0.0)
	for plot: Vector2i in beacons:
		var beacon: Node3D = beacons[plot]
		beacon.get_child(0).rotate_y(delta * 1.3)
		var seen := 1.0 - smoothstep(230.0, 340.0, Vector2(beacon.position.x - flyer.position.x, beacon.position.z - flyer.position.z).length())
		# A beacon takes its light by degrees once it is lit.
		var alight: float = lerpf(beacon.get_meta("alight"), 1.0 if lit.has(plot) else 0.0, 1.0 - exp(-delta * 3.0))
		beacon.set_meta("alight", alight)
		var colour := Color(0.2, 0.8, 1.0).lerp(Color(1.0, 0.62, 0.15), alight)
		var glass := ((beacon.get_child(0).get_child(0) as MeshInstance3D).material_override as StandardMaterial3D)
		glass.albedo_color = colour
		glass.emission = colour
		glass.emission_energy_multiplier = lerpf(1.5, 2.5, alight)
		beacon.get_child(0).scale = Vector3.ONE * maxf(seen, 0.001)
		var shaft := (beacon.get_child(1) as MeshInstance3D).material_override as ShaderMaterial
		shaft.set_shader_parameter("colour", colour)
		shaft.set_shader_parameter("strength", lerpf(0.35, 0.7, alight) * seen)
		(beacon.get_child(2) as OmniLight3D).light_color = colour
		(beacon.get_child(2) as OmniLight3D).light_energy = lerpf(3.0, 8.0, alight) * seen
		if not leaving and not lit.has(plot) and beacon.position.distance_to(flyer.position) < BEACON_REACH:
			lit[plot] = Vector4(beacon.position.x, beacon.position.z, elapsed, 1.0)
			bell.stream = chime(440.0 * pow(2.0, [0, 2, 4, 7, 9, 12][(lit.size() - 1) % 6] / 12.0))
			bell.play()
	# The shaders run rings of light out from the four lit beacons nearest the flyer.
	var here := Vector2(flyer.position.x, flyer.position.z)
	var nearest := lit.values()
	nearest.sort_custom(func(a: Vector4, b: Vector4) -> bool: return Vector2(a.x, a.y).distance_to(here) < Vector2(b.x, b.y).distance_to(here))
	var pulses := PackedVector4Array()
	for i in 4:
		pulses.append(nearest[i] if i < nearest.size() else Vector4.ZERO)
	tell("pulses", pulses)


## A crystal that turns over the ground, a light, and a shaft of light seen from far off.
func build_beacon(place: Vector3, alight: float) -> Node3D:
	var colour := Color(0.2, 0.8, 1.0)
	var beacon := Node3D.new()
	beacon.position = place
	beacon.set_meta("alight", alight)
	var gem := Node3D.new()
	beacon.add_child(gem)
	var point := CylinderMesh.new()
	point.top_radius = 0.0
	point.bottom_radius = 1.5
	point.height = 2.2
	point.radial_segments = 6
	point.rings = 1
	var glass := Parts.paint(colour, 0.15, 1.5)
	Parts.part(gem, point, glass, Vector3(0, 1.1, 0))
	Parts.part(gem, point, glass, Vector3(0, -1.1, 0), Vector3(180, 0, 0))
	var column := CylinderMesh.new()
	column.top_radius = 0.9
	column.bottom_radius = 0.9
	column.height = 160.0
	column.radial_segments = 12
	column.cap_top = false
	column.cap_bottom = false
	var light := ShaderMaterial.new()
	light.shader = preload("res://shaft.gdshader")
	light.set_shader_parameter("colour", colour)
	Parts.part(beacon, column, light, Vector3(0, 64, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var glow := OmniLight3D.new()
	glow.light_color = colour
	glow.omni_range = 50.0
	beacon.add_child(glow)
	add_child(beacon)
	return beacon


## The nearest beacon not yet lit that lies ahead in the nine plots around, for the corgi flying
## itself.
func beacon_ahead(forward: Vector3) -> Node3D:
	var middle := Vector2i((Vector2(flyer.position.x, flyer.position.z) / BEACON_PLOT).floor())
	var nearest: Node3D = null
	for plot: Vector2i in beacons:
		var to: Vector3 = beacons[plot].position - flyer.position
		to.y = 0.0
		if absi(plot.x - middle.x) <= 1 and absi(plot.y - middle.y) <= 1 and not lit.has(plot) and to.length() > 12.0 and to.normalized().dot(forward) > 0.5 and (nearest == null or to.length() < (nearest.position - flyer.position).length()):
			nearest = beacons[plot]
	return nearest


## A bell's note, made here.
static func chime(frequency: float) -> AudioStreamWAV:
	const RATE := 22050
	var count := RATE
	var data := PackedByteArray()
	data.resize(count * 2)
	for i in count:
		var t := float(i) / RATE
		var tone := sin(TAU * frequency * t) + 0.45 * sin(TAU * frequency * 2.76 * t) * exp(-t * 6.0) + 0.25 * sin(TAU * frequency * 5.4 * t) * exp(-t * 11.0)
		data.encode_s16(i * 2, int(clampf(tone * exp(-t * 3.2) * minf(1.0, t * 400.0) * 0.45, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.data = data
	return stream


## The camera trails the board in the player's hands; while the corgi flies itself the camera
## glides from one of its views to the next, and never under the ground.
func follow(delta: float) -> void:
	var shot: Array = SHOTS[0 if helm else int(elapsed / SHOT_SECONDS) % SHOTS.size()]
	var glide := 1.0 - exp(-delta * 0.9)
	view = view.lerp(shot[0], glide)
	aim = aim.lerp(shot[1], glide)
	camera.fov = lerpf(camera.fov, shot[2], glide)
	# The mouse turns the view around the flyer while the player has the board; let go, the view
	# comes back the short way round.
	if not helm:
		look = Vector2(wrapf(look.x, -PI, PI), look.y).lerp(Vector2.ZERO, 1.0 - exp(-delta * 2.0))
		looked.x = wrapf(looked.x, look.x - PI, look.x + PI)
	looked = looked.lerp(look, 1.0 - exp(-delta * 14.0))
	var frame := Basis(Vector3.UP, -heading - looked.x) * Basis(Vector3.RIGHT, -looked.y)
	var place := camera.position.lerp(flyer.position + frame * view, 1.0 - exp(-delta * 5.0))
	place.y = maxf(place.y, Terrain.surface(Vector2(place.x, place.z)) + 6.0)
	camera.position = place
	camera.look_at(flyer.position + frame * aim)
	tell("eye", camera.position)


## The light of the hour: the sun's arc, then the moon's, in one light.
func set_day() -> void:
	var angle := TAU * (day - 0.25)
	var to_sun := Vector3(cos(angle), sin(angle) * 0.85, 0.42).normalized()
	var height := to_sun.y
	var sunlight := smoothstep(-0.03, 0.2, height)
	var night := smoothstep(0.02, 0.3, -height)
	var warm := Color(1.0, 0.42, 0.18).lerp(Color(1.0, 0.95, 0.86), smoothstep(0.0, 0.45, height))
	var to_light := to_sun if height > -0.06 else -to_sun
	sun.basis = Basis.looking_at(-to_light)
	if height > -0.06:
		sun.light_color = warm
		sun.light_energy = 1.9 * sunlight
	else:
		sun.light_color = Color(0.45, 0.6, 1.0)
		sun.light_energy = 0.7 * smoothstep(0.1, 0.35, -height)
	sky_material.set_shader_parameter("sun_direction", to_sun)
	sky_material.set_shader_parameter("sun_colour", warm)
	tell("night", night)
	tell("to_light", to_light)
	environment.ambient_light_color = Color(0.85, 0.82, 0.78).lerp(Color(0.15, 0.22, 0.5), night)
	environment.ambient_light_energy = lerpf(1.0, 0.55, night)
	environment.volumetric_fog_albedo = Color(0.75, 0.82, 1.0).lerp(warm, 0.5)
	searchlight.light_energy = 14.0 * night
	lamp.light_energy = 0.2 + 2.2 * night


## For automated runs: the frame rate once the first frames' pipelines are made, the time the
## GPU and the renderer's thread took for a frame, and what the frame shows, then quit.
func watch() -> void:
	frames += 1
	if frames == 120:
		steady_from = Time.get_ticks_msec()
	var now := Time.get_ticks_usec()
	if frames > 120:
		frame_milliseconds.append((now - frame_began) / 1000.0)
		var viewport := get_viewport().get_viewport_rid()
		gpu_milliseconds += RenderingServer.viewport_get_measured_render_time_gpu(viewport)
		cpu_milliseconds += RenderingServer.viewport_get_measured_render_time_cpu(viewport) + RenderingServer.get_frame_setup_time_cpu()
	frame_began = now
	if elapsed < autopilot_seconds:
		return
	autopilot_seconds = 0.0
	var steady := frames - 120
	print("FLYOVER seconds %.1f frames %d fps %.1f gpu %.1f cpu %.1f flown %d beacons %d" % [elapsed, frames, steady * 1000.0 / (Time.get_ticks_msec() - steady_from), gpu_milliseconds / steady, cpu_milliseconds / steady, int(flown), lit.size()])
	# How even the frames were: a hitch is a frame of over twice the median.
	frame_milliseconds.sort()
	var median := frame_milliseconds[steady / 2]
	print("FLYOVER frame times median %.1f p99 %.1f max %.1f hitches %d" % [median, frame_milliseconds[steady * 99 / 100], frame_milliseconds[-1], steady - frame_milliseconds.bsearch(median * 2.0, false)])
	var image := get_viewport().get_texture().get_image()
	if image and not image.is_empty():
		# The sky's pixels along the top, and how many colours the frame has.
		var sky := 0
		var colours := {}
		for y in range(0, image.get_height(), 8):
			for x in range(0, image.get_width(), 8):
				var c := image.get_pixel(x, y)
				colours[Vector3i(int(c.r * 15.0), int(c.g * 15.0), int(c.b * 15.0))] = true
				if y < image.get_height() / 8 and c.b > c.r + 0.1:
					sky += 1
		print("FLYOVER frame %dx%d sky %d colours %d" % [image.get_width(), image.get_height(), sky, colours.size()])
	leave()
