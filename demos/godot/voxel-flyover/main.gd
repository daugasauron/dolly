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
const YEAR_DAYS := 3.0 # a year's seasons pass in so many days
const WIND := Vector2(0.93, 0.36) # the way the clouds drift, and the air with them
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
	[Vector3(0, 3.6, 11.5), Vector3(0, -0.6, -1.5), 62.0],
	[Vector3(-10.5, -1.2, -6.0), Vector3(4, -1.4, 1), 56.0],
	[Vector3(-10.0, -3.4, -8.2), Vector3(0.6, -1.1, 0.4), 46.0],
	[Vector3(9, 26, 34), Vector3(0, -10, -70), 74.0],
	[Vector3(5.5, 0.6, -11.5), Vector3(-1, -0.4, 6), 58.0],
]
const SHOT_SECONDS := 10.0
## What an adapter draws, from all of it down: the share of the frame's width and height the
## scene is drawn at (and scaled up from, smoothly), whether a pixel has four samples (WebGPU
## knows one or four; with one the edges are smoothed after), whether the fog has its shafts
## and the ground its ambient occlusion, the shadows' cascades and reach, the shells of a coat,
## and how many of the trees' grids are drawn, past which their crowns are painted on the land.
## The game starts at the first and goes down while a frame takes the GPU longer than
## FRAME_BUDGET, so a weak adapter draws the same picture, softer, at an even rate.
const LEVELS := [
	[1.0, true, true, true, DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS, 420.0, 18, 4],
	[0.8, true, false, true, DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS, 420.0, 14, 4],
	[0.7, false, false, false, DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS, 300.0, 10, 3],
	[0.6, false, false, false, DirectionalLight3D.SHADOW_ORTHOGONAL, 160.0, 8, 2],
	[0.55, false, false, false, DirectionalLight3D.SHADOW_ORTHOGONAL, 120.0, 6, 2],
	[0.5, false, false, false, DirectionalLight3D.SHADOW_ORTHOGONAL, 90.0, 5, 2],
	[0.4, false, false, false, DirectionalLight3D.SHADOW_ORTHOGONAL, 90.0, 5, 2],
]
const FRAME_BUDGET := 14.0 # milliseconds of the GPU: over it the display's 60 a second are lost

var environment := Environment.new()
var sky_material := ShaderMaterial.new()
var sun := DirectionalLight3D.new()
var camera := Camera3D.new()
var materials: Array[ShaderMaterial] = [sky_material] # every one that draws the world
var lands: Array[MeshInstance3D] = []
var grounds: Array[SubViewport] = [] # each grid's ground, for the shaders to read
var groves: Array[MultiMeshInstance3D] = []
var water := MeshInstance3D.new()
var city: MultiMeshInstance3D # a building for each lot around the flyer
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
var fires: Array[ShaderMaterial] = [] # the flames' light and its heart
var searchlight := SpotLight3D.new()
var lamp := OmniLight3D.new()
var hud := CanvasLayer.new()
var title := Label.new()
var hint := Label.new()
var score := Label.new()
var engine := AudioStreamPlayer.new()
var bell := AudioStreamPlayer.new()
var chimes: Array[AudioStreamWAV] = [] # a note for each beacon lit, made before the flight
var leaving := false # after Q, or a flight by itself that has ended
var beacons := {} # plot -> its node, for the plots around the flyer
var thermals := {} # plot -> the column of warm air over the town there
var rush := 0.0 # the push a beacon gives the board that lights it, which wears off
var speed_lines := ShaderMaterial.new() # the streaks of the air at speed
var flock := MultiMeshInstance3D.new() # birds that fly along with the board for a while
var flock_at := Vector3.ZERO # where their leader is
var flock_with := 0.0 # how long they have flown with the board
var birds: Array[Vector3] = []
var lit := {} # plot -> where it stands (x, y) and the clock when it was lit (z)

var helm := false # the player's, after Enter or a click
var captured := false # the pointer, which the page gives the game at a click
var look := Vector2.ZERO # where the mouse has turned the view: around the flyer, and over it
var looked := Vector2.ZERO # the view on its way there
var looks_from := 0.0 # the mouse turns the view from then on, a moment after its capture
var trail := Vector3.ZERO # the flyer's place and heading as the camera follows them, a little late
var turned := heading
var lift := 0.0 # of the camera over the ground under and ahead of it
var zoom := 1.0 # the camera's distance, as a share of its view's: the wheel, or Z and X
var zoomed := 1.0 # on its way there
var shown_score := 0.0
var hint_until := 0.0 # the keys show for a while after the board changes hands
var day := 0.24
var year := 0.3 # 0 the first of spring, 0.25 of summer, 0.5 of autumn, 0.75 of winter
var falls := 0.0 # the rain or snow over the camera
var falling := ShaderMaterial.new() # the drops and flakes around the camera
var shower := MultiMeshInstance3D.new()
var fallen: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO] # how far the rain and the snow have fallen and drifted
var night_share := 0.0
var skim := 0.0 # how low the board is over the sea, between 0 and 1
var heading := PI / 2.0 # east, along the coast
var turn := 0.0
var climb := 0.0
var speed := CRUISE
var flown := 0.0
var view: Vector3 = SHOTS[0][0]
var aim: Vector3 = SHOTS[0][1]
var view_led: Vector3 = view # what the view follows on its way to the next: it sets off gently
var aim_led: Vector3 = aim
var fov_led := 66.0
var autopilot_seconds := 0.0
var elapsed := 0.0
var frames := 0
var steady_from := 0
var gpu_milliseconds := 0.0
var cpu_milliseconds := 0.0
var frame_began := 0
var level := 0
var coats: Array[MultiMeshInstance3D] = [] # the fur's and feathers' shells
var gpu_window := 0.0 # the GPU's milliseconds over the frames counted since the level was set
var gpu_frames := -8 # the first frames after a change are not counted
var calm_windows := 0
var frame_milliseconds := PackedFloat32Array() # each steady frame's, for a flight by itself


func option(name: String, otherwise: float) -> float:
	var arguments := OS.get_cmdline_user_args()
	var at := arguments.find(name)
	return arguments[at + 1].to_float() if at >= 0 and at + 1 < arguments.size() else otherwise


func _ready() -> void:
	autopilot_seconds = option("--autopilot", 0.0)
	day = option("--day", day * 24.0) / 24.0
	year = option("--season", year)
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
		# Every grid casts shadows: a low sun lays a far mountain's over the land near by, and it
		# would come at once as a finer grid stepped under the mountain.
		add_child(land)
		lands.append(land)
		hole = across * cell / 2.0
	for grove: Array in GROVES + [SHADES]:
		groves.append(build_grid(tree_mesh(grove[1]), grove[0], PLOT, reads_ground(preload("res://trees.gdshader"), 0)))
		materials[-1].set_shader_parameter("ring", grove[2])
		groves[-1].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_SHADOWS_ONLY if grove == SHADES else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		materials[-1].set_shader_parameter("sinks", grove == SHADES or grove == GROVES[-1])
	city = build_grid(BoxMesh.new(), 66, Terrain.LOT, reads_ground(preload("res://city.gdshader"), 0))
	var plane := PlaneMesh.new()
	plane.size = Vector2(8000, 8000)
	water.mesh = plane
	water.material_override = reads_ground(preload("res://water.gdshader"), 1)
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)
	build_flyer()
	camera.far = 3000.0
	camera.fov = fov_led
	camera.near = 0.3
	add_child(camera)
	build_hud()
	# The rain and the snow: cards in a box of air around the camera (rain.gdshader).
	var card := QuadMesh.new()
	shower.multimesh = MultiMesh.new()
	shower.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	shower.multimesh.mesh = card
	shower.multimesh.instance_count = 9000
	falling.shader = preload("res://rain.gdshader")
	shower.material_override = falling
	shower.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	shower.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shower)
	flyer.position = Vector3(START.x, Terrain.surface(START) + 30.0, START.y)
	trail = flyer.position
	camera.position = flyer.position + view
	wake.resize(WAKE)
	wake.fill(flyer.position)
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	for coat in flyer.find_children("*", "MultiMeshInstance3D", true, false):
		coats.append(coat)
	set_level(int(option("--level", 0.0)))
	if autopilot_seconds <= 0.0:
		# The page gives the pointer at a click, and takes it back at Escape.
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		print("FLYOVER adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())


## Sets what the adapter draws (LEVELS).
func set_level(to: int) -> void:
	level = clampi(to, 0, LEVELS.size() - 1)
	var what: Array = LEVELS[level]
	get_viewport().scaling_3d_scale = what[0]
	get_viewport().msaa_3d = Viewport.MSAA_4X if what[1] else Viewport.MSAA_DISABLED
	get_viewport().screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED if what[1] else Viewport.SCREEN_SPACE_AA_FXAA
	environment.volumetric_fog_enabled = what[2]
	environment.ssao_enabled = what[3]
	sun.directional_shadow_mode = what[4]
	sun.directional_shadow_max_distance = what[5]
	# A weak adapter has a smaller map for its shadows and a smaller sky to light the scene by.
	RenderingServer.directional_shadow_atlas_set_size(4096 if level < 2 else 2048, true)
	environment.sky.radiance_size = Sky.RADIANCE_SIZE_256 if level < 2 else Sky.RADIANCE_SIZE_64
	for coat in coats:
		coat.multimesh.visible_instance_count = what[6]
		(coat.material_override as ShaderMaterial).set_shader_parameter("shells", float(what[6]))
	# The trees' grids that are drawn: the last of them sinks its trees into the ground where the
	# land takes over with painted crowns, and the shadows' trees go with the far grids.
	var drawn: int = what[7]
	for grove in GROVES.size():
		groves[grove].visible = grove < drawn
		(groves[grove].material_override as ShaderMaterial).set_shader_parameter("sinks", grove == drawn - 1)
	groves[-1].visible = drawn == GROVES.size()
	city.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if level < 3 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shower.multimesh.visible_instance_count = 9000 if level < 3 else 3600
	# A weak adapter has simpler crowns near by: the next grid's.
	groves[0].multimesh.mesh = tree_mesh(GROVES[0 if level < 3 else 1][1])
	groves[1].multimesh.mesh = tree_mesh(GROVES[1 if level < 3 else 2][1], true)
	tell("paint_from", GROVES[drawn - 1][2].z - 20.0)
	gpu_window = 0.0
	gpu_frames = -8
	calm_windows = 0


## Follows what the adapter manages: a level down when 20 frames took the GPU over the budget
## on average (more when far over), a level up after a minute well under it. Below the last
## level the rate is held even at what the adapter can draw. Where the browser has no GPU
## timer, the time between frames stands in.
func pace(delta: float) -> void:
	var gpu := RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())
	gpu_frames += 1
	if gpu_frames <= 0:
		return
	gpu_window += gpu if gpu > 0.0 else maxf(delta * 1000.0 - 6.0, 0.0)
	if gpu_frames < 20 and gpu_window < 1500.0:
		return
	var mean := gpu_window / gpu_frames
	gpu_window = 0.0
	gpu_frames = 0
	if mean > FRAME_BUDGET and level < LEVELS.size() - 1:
		set_level(level + (4 if mean > FRAME_BUDGET * 8.0 else 3 if mean > FRAME_BUDGET * 5.0 else 2 if mean > FRAME_BUDGET * 2.5 else 1))
	elif mean > FRAME_BUDGET:
		# Even at the rate the adapter holds: a half, a third or a quarter of the display's.
		Engine.max_fps = 30 if mean < 24.0 else 20 if mean < 36.0 else 12
	elif mean < FRAME_BUDGET * 0.35 and level > 0:
		calm_windows += 1
		if calm_windows > 120:
			set_level(level - 1)
	else:
		calm_windows = 0


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
static func tree_mesh(rings: int, stem := rings >= 5) -> ArrayMesh:
	var crown := SphereMesh.new()
	crown.radius = 1.0
	crown.height = 2.0
	crown.radial_segments = rings + 3
	crown.rings = rings
	var tool := SurfaceTool.new()
	if stem:
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
	var flame := ShaderMaterial.new()
	flame.shader = preload("res://flame.gdshader")
	var heart := flame.duplicate() as ShaderMaterial
	heart.set_shader_parameter("colour", Color(1.6, 1.5, 1.2))
	fires = [flame, heart]
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
	# The corgi: long, low and slim, white in front and under, with a thick coat and large ears.
	flyer.add_child(dog)
	Parts.coated(furs, dog, rod, tan_fur, 0.1, Vector2(140, 150), Vector3(0, 0.92, 0.25), Vector3(90, 0, 0), Vector3(0.8, 1.3, 0.86))
	Parts.coated(furs, dog, ball, white_fur, 0.12, Vector2(125, 70), Vector3(0, 0.84, -0.6), Vector3.ZERO, Vector3(0.76, 0.84, 0.9))
	Parts.coated(furs, dog, ball, tan_fur, 0.13, Vector2(125, 70), Vector3(0, 0.95, 1.42), Vector3.ZERO, Vector3(0.76, 0.84, 0.7))
	Parts.coated(furs, dog, ball, white_fur, 0.14, Vector2(110, 60), Vector3(0, 0.74, 1.52), Vector3.ZERO, Vector3(0.6, 0.5, 0.5))
	tail = Parts.coated(furs, dog, ball, tan_fur, 0.1, Vector2(70, 35), Vector3(0, 1.24, 1.64), Vector3.ZERO, Vector3(0.28, 0.28, 0.4))
	for x: float in [-0.26, 0.26]:
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
	# The mouth, a little open: the lower jaw under the muzzle, dark between them, and the
	# tongue, which lies in the jaw from the back of the mouth and hangs over its front.
	var mouth := Parts.paint(Color(0.12, 0.02, 0.03), 0.6)
	Parts.part(head, ball, mouth, Vector3(0, -0.34, -0.48), Vector3.ZERO, Vector3(0.4, 0.1, 0.62))
	Parts.part(head, ball, white, Vector3(0, -0.45, -0.44), Vector3(-12, 0, 0), Vector3(0.46, 0.16, 0.66))
	tongue = Parts.part(head, ball, pink, Vector3(0, -0.39, -0.66), Vector3(-16, 0, 0), Vector3(0.2, 0.045, 0.5))
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
	# The cape, from a gold clasp at the throat.
	# The cape's clasp, at the throat.
	Parts.part(dog, ball, gold, Vector3(0, 1.0, -1.02), Vector3.ZERO, Vector3.ONE * 0.16)
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
	for note: int in [0, 2, 4, 7, 9, 12]:
		chimes.append(chime(440.0 * pow(2.0, note / 12.0)))
	add_child(bell)


## The corgi rides the board: it crouches lower the faster it goes and the harder it turns, leans
## and looks into its turns, and the air lays back its ears, cape and coat.
func ride(delta: float) -> void:
	var fast := speed / CRUISE
	flutter += delta * fast
	pelican.pedal(delta, fast, turn)
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
	tongue.rotation.x = deg_to_rad(-16.0) + 0.05 * sin(elapsed * 5.0)
	# The jets burn as the pelican pushes: longer and brighter with each stroke of its legs.
	var push := pelican.stroke()
	for flame in flames:
		flame.scale.y = flame.scale.x * (1.4 + 1.4 * fast) * (0.88 + 0.24 * push)
		flame.position.z = 2.95 + flame.scale.y
	for glow in glows:
		glow.emission_energy_multiplier = 4.5 + 3.0 * push
	for fire in fires:
		fire.set_shader_parameter("strokes", pelican.angle / PI)
	# The air comes from ahead, and from the outside of a turn.
	var air := flyer.global_basis * Vector3(turn * 0.5, 0.0, 0.9 * fast)
	for fur in furs:
		fur.set_shader_parameter("wind", air)
	for cloth: ShaderMaterial in pelican.plumes + [cape_material]:
		cloth.set_shader_parameter("phase", flutter)
		cloth.set_shader_parameter("lean", turn)
	# The wakes keep a place for every stretch flown, the newest at the board's tail: each exactly
	# a stretch from the one before, so the ribbon's pattern keeps its place as one is added.
	wake[0] = flyer.to_global(Vector3(0, -0.3, 3.0))
	while wake[0].distance_to(wake[1]) > WAKE_APART:
		wake.insert(1, wake[1] + (wake[0] - wake[1]).normalized() * WAKE_APART)
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
	hint.add_theme_font_size_override("font_size", 24)
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
	# The air at speed, over the scene and under the words; it takes no part in the mouse.
	var streaks := ColorRect.new()
	streaks.set_anchors_preset(Control.PRESET_FULL_RECT)
	streaks.mouse_filter = Control.MOUSE_FILTER_IGNORE
	speed_lines.shader = preload("res://speed.gdshader")
	streaks.material = speed_lines
	hud.add_child(streaks)
	hud.move_child(streaks, 0)
	show_helm()


func show_helm() -> void:
	title.visible = not helm and autopilot_seconds <= 0.0
	hint.visible = autopilot_seconds <= 0.0
	hint_until = elapsed + 12.0
	hint.text = "The corgi flies itself. Enter or a click takes the board.    Wheel or Z, X: zoom    Q: quit" if not helm \
		else "Arrows or WASD: steer, climb, dive    %s    Wheel or Z, X: zoom    Space: full speed    T: hours    Esc: let go    Q: quit" % ("Mouse: look" if captured else "Click: mouse look")


func _input(event: InputEvent) -> void:
	if autopilot_seconds > 0.0:
		return
	# A browser may report the pointer's way to where it was captured as its first motion: the
	# first moments' are left.
	if event is InputEventMouseMotion and captured and elapsed > looks_from:
		var motion := (event as InputEventMouseMotion).relative
		look.x += motion.x * 0.0035
		look.y = clampf(look.y + motion.y * 0.0035, -0.5, 1.0)
	if event is InputEventMouseButton and event.pressed:
		match (event as InputEventMouseButton).button_index:
			MOUSE_BUTTON_WHEEL_UP:
				zoom = maxf(zoom / 1.12, 0.45)
			MOUSE_BUTTON_WHEEL_DOWN:
				zoom = minf(zoom * 1.12, 3.2)
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
	looks_from = elapsed + 0.25
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
	pace(delta)
	var hours := 8.0 if helm and Input.is_physical_key_pressed(KEY_T) else 1.0
	day = fposmod(day + delta * hours / DAY_SECONDS, 1.0)
	year = fposmod(year + delta * hours / DAY_SECONDS / YEAR_DAYS, 1.0)
	tell("clock", elapsed)
	set_day()
	fly(delta)
	tend_beacons(delta)
	follow(delta)
	speed_lines.set_shader_parameter("rush", clampf((speed - CRUISE - 4.0) / 30.0, 0.0, 1.0))
	speed_lines.set_shader_parameter("clock", elapsed)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	hint.modulate.a = clampf(hint_until - elapsed, 0.0, 1.0)
	# The score swells as a beacon is lit.
	shown_score = lerpf(shown_score, lit.size(), 1.0 - exp(-delta * 6.0))
	score.text = str(lit.size())
	score.scale = Vector2.ONE * (1.0 + 0.5 * sin(PI * clampf(lit.size() - shown_score, 0.0, 1.0)))
	if autopilot_seconds > 0.0:
		watch()


func fly(delta: float) -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var forward := Vector3(sin(heading), 0.0, -cos(heading))
	# What stands on the way of the next second and a half, along the turn the board is in: the
	# highest of it, and the climb that clears all of it in the time the board takes to reach it.
	var ground := 0.0
	var must := -INF
	for step in 12:
		var time := step * 0.14
		var way := heading + turn * 0.55 * time / 2.0
		var top := Terrain.roof(here + Vector2(sin(way), -cos(way)) * maxf(speed, 30.0) * time)
		ground = maxf(ground, top)
		must = maxf(must, (top + 5.0 - flyer.position.y) / maxf(time, 0.25))
	var wanted_turn: float
	var wanted_climb: float
	# The flight keeps what it gains: a dive gives speed and a climb takes it, the wind at the
	# back gives a little, and low over the sea the board skims and runs faster still.
	var wanted_speed := CRUISE + clampf(-climb * 1.2, -9.0, 18.0) + 5.0 * WIND.dot(Vector2(forward.x, forward.z))
	var over_sea := Terrain.height(here) < Terrain.SEA
	skim = lerpf(skim, smoothstep(13.0, 8.5, flyer.position.y - Terrain.SEA) if over_sea else 0.0, 1.0 - exp(-delta * 3.0))
	wanted_speed += 14.0 * skim
	tell("skims", Vector3(flyer.position.x, flyer.position.z, skim))
	# Where the wind meets a slope it rises, and carries the board up with it near the ground.
	var slope := (Terrain.height(here + WIND * 14.0) - Terrain.height(here - WIND * 14.0)) / 28.0
	var updraft := clampf(slope, 0.0, 1.0) * 9.0 * smoothstep(70.0, 20.0, flyer.position.y - ground)
	updraft += tend_thermals()
	rush = maxf(rush - delta * 0.4, 0.0)
	wanted_speed += 16.0 * rush * rush
	wanted_speed += fly_flock(delta, forward)
	if helm:
		wanted_turn = Input.get_axis("ui_left", "ui_right") + key_axis(KEY_A, KEY_D)
		wanted_climb = (Input.get_axis("ui_down", "ui_up") + key_axis(KEY_S, KEY_W)) * 14.0
		if Input.is_physical_key_pressed(KEY_SPACE):
			wanted_speed += BOOST
		# The ground pushes the board up, and its ceiling holds it down.
		wanted_climb = maxf(wanted_climb, (ground + (8.0 if over_sea else 14.0) - flyer.position.y) * 2.0)
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
	if must > climb:
		climb = lerpf(climb, minf(must, 60.0), 1.0 - exp(-delta * 12.0))
	speed = lerpf(speed, wanted_speed, 1.0 - exp(-delta * 1.2))
	heading += turn * 0.55 * delta
	flown += speed * delta
	flyer.position += forward * speed * delta + Vector3.UP * (climb + updraft) * delta
	flyer.position.y = maxf(flyer.position.y, Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 10.0)
	# The board banks into its turns and noses up into its climbs.
	flyer.rotation = Vector3(clampf(climb, -20.0, 24.0) * 0.02, -heading, -turn * 0.6)
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
	city.position = Vector3(among.x, 0.0, among.y)
	tell("flyer", Vector2(flyer.position.x, flyer.position.z))
	tell("flyer_at", flyer.position)
	water.position = Vector3(flyer.position.x, Terrain.SEA - 0.2, flyer.position.z)


## The flock: sixteen birds that wait ahead of the board, fall in behind it in a wedge when it
## comes by, fly with it for a quarter of a minute, in which their company carries it a little
## faster, and then peel away to wait ahead again. Returns the speed they give.
func fly_flock(delta: float, forward: Vector3) -> float:
	if birds.is_empty():
		var wings := PlaneMesh.new()
		wings.size = Vector2(1.6, 0.5)
		wings.subdivide_width = 6
		var feathers := ShaderMaterial.new()
		feathers.shader = preload("res://bird.gdshader")
		flock.multimesh = MultiMesh.new()
		flock.multimesh.transform_format = MultiMesh.TRANSFORM_3D
		flock.multimesh.mesh = wings
		flock.multimesh.instance_count = 16
		flock.material_override = feathers
		flock.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
		add_child(flock)
		flock_at = flyer.position + forward * 420.0 + Vector3(60, 14, 0)
		for bird in 16:
			birds.append(flock_at)
	(flock.material_override as ShaderMaterial).set_shader_parameter("clock", elapsed)
	var apart := flock_at.distance_to(flyer.position)
	var together := flock_with > 0.0 and flock_with < 16.0
	if together or (flock_with == 0.0 and apart < 70.0):
		flock_with += delta
		flock_at = flock_at.lerp(flyer.position + Vector3.UP * 3.0 - forward * 9.0, 1.0 - exp(-delta * 1.6))
	elif flock_with >= 16.0:
		# Away, up and to the side; once far behind, they wait ahead again.
		flock_at += (forward * 0.6 + Vector3(forward.z, 0.5, -forward.x)).normalized() * speed * 0.9 * delta
		if apart > 380.0:
			flock_with = 0.0
			flock_at = flyer.position + forward * 520.0 + Vector3(forward.z, 0.0, -forward.x) * 50.0 + Vector3.UP * 12.0
			birds.fill(flock_at)
	else:
		# Waiting: a slow circle, at a height that clears the ground.
		flock_at.y = lerpf(flock_at.y, Terrain.surface(Vector2(flock_at.x, flock_at.z)) + 40.0, 1.0 - exp(-delta))
		if apart > 700.0:
			flock_at = flyer.position + forward * 520.0 + Vector3(forward.z, 0.0, -forward.x) * 50.0 + Vector3.UP * 12.0
			birds.fill(flock_at)
	var side := Vector3(forward.z, 0.0, -forward.x)
	# In rain or snow the birds close up and fly low.
	var huddle := 1.0 - 0.5 * falls
	for bird in birds.size():
		# A wedge behind the leader: each bird a place back and out, alternately left and right.
		var row := (bird + 1) / 2
		var slot := flock_at - forward * row * 2.4 * huddle + side * row * 2.0 * huddle * (1.0 if bird % 2 == 0 else -1.0) + Vector3.UP * (0.5 * sin(elapsed * 1.3 + bird) - 2.5 * falls)
		birds[bird] = birds[bird].lerp(slot, 1.0 - exp(-delta * (5.0 - row * 0.3)))
		flock.multimesh.set_instance_transform(bird, Transform3D(Basis(Vector3.UP, -heading), birds[bird]))
	return 5.0 * smoothstep(0.0, 2.0, flock_with) * (1.0 - smoothstep(14.0, 16.0, flock_with))


## Keeps the thermals of the plots around the flyer: over a town, by day, a column of warm air
## rises, which shows faintly from afar as beacons do. Returns the lift of those the flyer is in.
func tend_thermals() -> float:
	var middle := Vector2i((Vector2(flyer.position.x, flyer.position.z) / BEACON_PLOT).floor())
	for plot: Vector2i in thermals.keys():
		if absi(plot.x - middle.x) > 2 or absi(plot.y - middle.y) > 2:
			thermals[plot].queue_free()
			thermals.erase(plot)
	for x in range(middle.x - 2, middle.x + 3):
		for y in range(middle.y - 2, middle.y + 3):
			var plot := Vector2i(x, y)
			if not thermals.has(plot):
				var p := (Vector2(plot) + Vector2(0.2, 0.2) + Vector2(Terrain.cell_hash(plot.x + 19, plot.y), Terrain.cell_hash(plot.y, plot.x + 43)) * 0.6) * BEACON_PLOT
				var ground := Terrain.height(p)
				var column := Node3D.new()
				column.position = Vector3(p.x, ground, p.y)
				if Terrain.town(p, ground) > 0.4:
					var sides := CylinderMesh.new()
					sides.top_radius = 26.0
					sides.bottom_radius = 14.0
					sides.height = 170.0
					sides.radial_segments = 24
					sides.cap_top = false
					sides.cap_bottom = false
					var air := ShaderMaterial.new()
					air.shader = preload("res://thermal.gdshader")
					Parts.part(column, sides, air, Vector3(0, 85, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				add_child(column)
				thermals[plot] = column
	var rising := 0.0
	for plot: Vector2i in thermals:
		var column: Node3D = thermals[plot]
		if column.get_child_count() == 0:
			continue
		var apart := Vector2(column.position.x - flyer.position.x, column.position.z - flyer.position.z).length()
		var strength := (1.0 - night_share) * (1.0 - smoothstep(230.0, 340.0, apart))
		var air := (column.get_child(0) as MeshInstance3D).material_override as ShaderMaterial
		air.set_shader_parameter("strength", strength)
		air.set_shader_parameter("clock", elapsed)
		if flyer.position.y < column.position.y + 170.0:
			rising += 13.0 * strength * (1.0 - smoothstep(6.0, 24.0, apart))
	return rising


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
		# The crystal draws in before the camera, which may fly through it.
		beacon.get_child(0).scale = Vector3.ONE * maxf(seen * smoothstep(5.0, 22.0, beacon.position.distance_to(camera.position)), 0.001)
		var shaft := (beacon.get_child(1) as MeshInstance3D).material_override as ShaderMaterial
		shaft.set_shader_parameter("colour", colour)
		shaft.set_shader_parameter("strength", lerpf(0.35, 0.7, alight) * seen)
		(beacon.get_child(2) as OmniLight3D).light_color = colour
		(beacon.get_child(2) as OmniLight3D).light_energy = lerpf(3.0, 8.0, alight) * seen
		if not leaving and not lit.has(plot) and beacon.position.distance_to(flyer.position) < BEACON_REACH:
			lit[plot] = Vector4(beacon.position.x, beacon.position.z, elapsed, 1.0)
			rush = 1.0
			bell.stream = chimes[(lit.size() - 1) % chimes.size()]
			bell.play()
	# The shaders run rings of light out from the lit beacons around the flyer, every nine seconds
	# each. A beacon's rings fade with its distance from the flyer, so none comes or goes at once;
	# of more than eight around, the last lit have theirs.
	var here := Vector2(flyer.position.x, flyer.position.z)
	var pulses := PackedVector4Array()
	var newest := lit.values()
	newest.reverse()
	for at: Vector4 in newest:
		var strength := 1.0 - smoothstep(520.0, 760.0, Vector2(at.x, at.y).distance_to(here))
		if strength > 0.0 and pulses.size() < 8:
			pulses.append(Vector4(at.x, at.y, elapsed - at.z, strength))
	pulses.resize(8)
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
	# Each follows a point that follows the next view, so the camera neither sets off nor arrives
	# at once.
	var glide := 1.0 - exp(-delta * 1.7)
	view_led = view_led.lerp(shot[0], glide)
	aim_led = aim_led.lerp(shot[1], glide)
	fov_led = lerpf(fov_led, shot[2], glide)
	view = view.lerp(view_led, glide)
	aim = aim.lerp(aim_led, glide)
	camera.fov = lerpf(camera.fov, fov_led, glide)
	# The mouse turns the view around the flyer while the player has the board; let go, the view
	# comes back the short way round.
	if not helm:
		# Let go, the view and its zoom come back.
		zoom = lerpf(zoom, 1.0, 1.0 - exp(-delta * 1.0))
		look = Vector2(wrapf(look.x, -PI, PI), look.y).lerp(Vector2.ZERO, 1.0 - exp(-delta * 2.0))
		looked.x = wrapf(looked.x, look.x - PI, look.x + PI)
	looked = looked.lerp(look, 1.0 - exp(-delta * 14.0))
	# The camera follows the flyer's place and heading a little late, and turns about it exactly:
	# a straight way between two places around the flyer would cut through it. Zoomed in it is
	# less late, or the flyer would be out of the middle of a close view.
	var late := 1.0 - exp(-delta * 5.0 / (minf(zoomed, 1.0) * minf(zoomed, 1.0)))
	trail = trail.lerp(flyer.position, late)
	turned = lerp_angle(turned, heading, late)
	zoom = clampf(zoom * exp(key_axis(KEY_Z, KEY_X) * delta * 1.2), 0.45, 3.2)
	zoomed = lerpf(zoomed, zoom, 1.0 - exp(-delta * 6.0))
	var frame := Basis(Vector3.UP, -turned - looked.x) * Basis(Vector3.RIGHT, -looked.y)
	var place := trail + frame * (aim + (view - aim) * zoomed)
	# The ground and the roofs lift the camera before they are reached, by degrees: the highest
	# of where the camera is and will be in the next second and a half, and of what stands
	# around it, since a turn of the view moves it sideways. It rises faster than it settles.
	var ground := 0.0
	for step in 4:
		ground = maxf(ground, Terrain.roof(Vector2(place.x, place.z) + Vector2(sin(heading), -cos(heading)) * step * 15.0))
	for beside in 6:
		ground = maxf(ground, Terrain.roof(Vector2(place.x, place.z) + Vector2.from_angle(beside * TAU / 6.0) * 14.0))
	var over := place.y - ground - 6.0
	var wanted_lift := (sqrt(over * over + 9.0) - over) / 2.0
	lift = lerpf(lift, wanted_lift, 1.0 - exp(-delta * (9.0 if wanted_lift > lift else 3.0)))
	place.y += lift
	camera.position = place
	camera.look_at(flyer.position + frame * aim)
	tell("eye", camera.position)
	# It rains, or in winter snows, where the cloud over the camera is deep.
	var above := (Vector2(camera.position.x, camera.position.z) + Vector2(9.0, 3.5) * elapsed) / 1000.0
	falls = lerpf(falls, smoothstep(0.66, 0.78, Terrain.fbm(above + Vector2(31.0, 7.0), 3)), 1.0 - exp(-delta * 1.5))
	sky_material.set_shader_parameter("rains", falls)
	# A drop falls 22 units a second and a flake 2.6. The wind carries them, and the flight
	# slants them back by no more than half of their fall, so on the screen they come down.
	shower.visible = falls > 0.004
	shower.position = camera.position
	for kind in 2:
		var fall := 2.6 if kind == 1 else 22.0
		var way := Vector3(WIND.x, 0.0, WIND.y) * fall * 0.12 - Vector3(sin(heading), 0.0, -cos(heading)) * minf(speed * 0.3, fall * 0.5) + Vector3.DOWN * fall
		fallen[kind] = (fallen[kind] + way * delta).posmod(1320.0)
		falling.set_shader_parameter("fallen_snow" if kind == 1 else "fallen_rain", fallen[kind])
		falling.set_shader_parameter("way_snow" if kind == 1 else "way_rain", way)
	falling.set_shader_parameter("falls", falls)
	falling.set_shader_parameter("snows", season_share(0.85))


## How much of a season it is, between 0 and 1: all of it within a tenth of a year of its
## middle, none of it a quarter of a year away.
func season_share(middle: float) -> float:
	return 1.0 - smoothstep(0.1, 0.25, absf(fposmod(year - middle + 0.5, 1.0) - 0.5))


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
	# The seasons: each a share that rises and falls around its place in the year.
	tell("spring", season_share(0.1))
	tell("autumn", season_share(0.55))
	tell("winter", season_share(0.85))
	sky_material.set_shader_parameter("sun_direction", to_sun)
	sky_material.set_shader_parameter("sun_colour", warm)
	tell("night", night)
	night_share = night
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
	print("FLYOVER level %d scale %.2f gpu %.1f" % [level, LEVELS[level][0], RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())])
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
