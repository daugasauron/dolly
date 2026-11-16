extends Node3D
## Voxel Planet: Voxel Flyover's flight on a planet that can be left. A corgi on a jet surfboard,
## a pelican on a bicycle pedalling under it for the jets, flies over a world that is a sphere of
## 600,000 units: the land runs on to a curved horizon, and a board that keeps climbing leaves
## the air and sees the planet whole. The world is a function (terrain.gdshaderinc): the GPU
## draws its ground into textures as the flight goes, raises grids of land to it and stands
## trees on it. The game computes in a flat chart around an anchor on the planet, and the
## shaders carry every vertex onto the sphere (terrain.gdshaderinc's lift).
##
## `-- --autopilot SECONDS` flies by itself, prints its frame rate, how even its frames were, the
## time a frame took and what the frame shows, and quits: Dolly's test uses it. `--day HOUR`
## starts at that hour of 24, and `--tour SECOND` leaves the planet at that second of a flight by
## itself, looks at it from 900,000 units up (`--top`), and comes back; `--high HEIGHT` starts
## a flight by itself at that height and keeps it. Q prints how far the flight went and where
## the view was turned.

const Terrain := preload("res://terrain.gd")
const Landmarks := preload("res://landmarks.gd")
const Parts := preload("res://parts.gd")
const Pelican := preload("res://pelican.gd")
## The grids of land around the flyer, each around the one before: cells across, a cell's width.
## The first three are the flyover's; the others carry the land on to the horizon and round the
## planet (the last covers all of it from any place).
const RINGS := [[256, 1.5], [256, 6.0], [192, 24.0], [192, 96.0], [192, 384.0], [192, 1536.0], [192, 6144.0], [160, 24576.0]]
## The first so many grids have the ground in a texture of their own (ground.gdshader), drawn as
## they step; the others read the texture of the whole planet.
const OWN := 6
## A grid follows the flight in steps of the next coarser grid's cell (and no less than this),
## so every point stays where it is and a grid's rim lies on the next one's lines.
const STEP := 24.0
const PLANET_TEXELS := Vector2i(4096, 2048) # the whole planet's ground, by longitude and latitude
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
const CITY_REACH := 100 # the lots a town's buildings are drawn to, each way from the flyer
const CITY_NEAR := 33 # the lots that have the whole mesh
const CLOUD_CELL := 240.0 # a cell of the low clouds' grid (cloud.gdshader's)
const DAY_SECONDS := 120.0
const YEAR_DAYS := 3.0 # a year's seasons pass in so many days
const WIND := Vector2(0.93, 0.36) # the way the clouds drift, and the air with them
const CRUISE := 30.0
const BOOST := 26.0
const CEILING := 420.0 # the flight by itself stays under it
const SOARS_FROM := 420.0 # over this height, the flyover's ceiling, the board is faster the higher it is
const SOARS_BY := 110.0 # twice as fast this far over it, and so on: every 8 s of climbing multiply the height by e, and space is 80 s from the ground
const SPACE := 1.4e6 # the highest the board goes: the planet is a disc of 35 degrees from there
const AIR := 7000.0 # the height over which the air thins to 1/e (sky.gdshader's)
const LOWERED_STEP := 8192.0
const ANCHOR_FROM := 8000.0 # the chart's anchor moves only over this height, where nothing that stands on its lattice is seen
const ANCHOR_REACH := 120000.0 # and only once the flyer is this far from it
const BEACON_PLOT := 180.0
const BEACON_REACH := 11.0 # how near its beam the board lights a beacon, at any height of the beam
## Where on the planet the flight starts: on the equator at this longitude (radians), the chart's
## z toward the north pole. The sun goes round the pole, so the chart's x is east.
const START_LONGITUDE := 1.3177
const START := Vector2.ZERO
const WAKE := 64 # the places the wakes keep
const WAKE_APART := 1.2
## The camera's views: where it stands in the flyer's frame, what it aims at, its angle of view,
## and for how many seconds the flight by itself holds it. The first is the player's. By itself
## the camera shows the world, from wide views behind, beside, above and ahead of the flyer, and
## comes close to the flyers for a few seconds a round.
const SHOTS := [
	[Vector3(0, 3.6, 11.5), Vector3(0, -0.6, -1.5), 62.0, 0.0],
	[Vector3(0, 9, 30), Vector3(0, -2, -30), 68.0, 14.0],
	[Vector3(-34, 10, 6), Vector3(10, -4, -22), 64.0, 12.0],
	[Vector3(12, 30, 50), Vector3(0, -12, -80), 74.0, 13.0],
	[Vector3(-10.0, -3.0, -8.2), Vector3(0.6, -0.9, 0.4), 48.0, 5.0],
	[Vector3(20, 7, -40), Vector3(-6, -2, 20), 66.0, 11.0],
	[Vector3(-16, 16, 46), Vector3(4, -8, -70), 70.0, 13.0],
]
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
	[0.3, false, false, false, DirectionalLight3D.SHADOW_ORTHOGONAL, 90.0, 5, 2],
]
const FRAME_BUDGET := 14.0 # milliseconds of the GPU: over it the display's 60 a second are lost

var environment := Environment.new()
var sky_material := ShaderMaterial.new()
var sun := DirectionalLight3D.new()
var camera := Camera3D.new()
var materials: Array[ShaderMaterial] = [sky_material] # every one that draws the world
var lands: Array[MeshInstance3D] = []
var grounds: Array[SubViewport] = [] # each near grid's ground, for the shaders to read
var planet: SubViewport # the whole planet's ground
var planet_frames := 0 # the frames since it was drawn
var rebake := 0.0
var ground_life := Node3D.new() # the grids of what lives near the ground: trees, towns, clouds, boats, birds; not drawn from high up
var charts: Array[ShaderMaterial] = [] # the materials that draw the grounds: they are told the chart's anchor
var stale: Array[bool] = [true, true, true, true, true, true, true, true] # the grids whose grounds are to be drawn anew: all at the start and when the chart's anchor moves
var lowered := 0.0 # the height taken off everything drawn, once the flyer is high
var weather := Vector3.ZERO # how far a second moves the weather, in the planet's axes
var sun_frame := Basis.IDENTITY # the axes the sun's arc is given in, fixed to the planet: the start's
var scored := 0 # the beacons lit in charts left behind
var rings_run := false # the shaders have been told of lit beacons' rings
var tour := 0.0 # with --tour: the flight by itself leaves the planet at that second, looks, and comes back
var tour_phase := 0
var tour_held := 0.0
var tour_top := 900000.0 # how high the tour goes (--top)
var highest := 0.0 # the flyer was this high
var anchors := 0 # the chart's anchor moved so many times
var groves: Array[MultiMeshInstance3D] = []
var water := MeshInstance3D.new()
var cities: Array[MultiMeshInstance3D] = [] # the towns' buildings, a lot each: the near ones, and the far
var flyer := Node3D.new()
var dog := Node3D.new()
var head := Node3D.new()
var legs: Array[MeshInstance3D] = []
var paws: Array[MeshInstance3D] = []
var ears: Array[Node3D] = []
var tail: MeshInstance3D
var tongue := ShaderMaterial.new() # the corgi's, a cloth in the wind
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
var patter := AudioStreamPlayer.new() # the rain
var wash := AudioStreamPlayer.new() # the sea under a low flight
var chimes: Array[AudioStreamWAV] = [] # a note for each beacon lit, made before the flight
var leaving := false # after Q, or a flight by itself that has ended
var beacons := {} # plot -> its node, for the plots around the flyer
var thermals := {} # plot -> the column of warm air over the town there
var pushed := -100.0 # when a beacon last gave the board its push
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
var helm_shown := false # who had the board when the keys were last shown
var hint_until := 0.0 # the keys show for a while after the board changes hands
var day := 0.24
var year := 0.3 # 0 the first of spring, 0.25 of summer, 0.5 of autumn, 0.75 of winter
var falls := 0.0 # the rain or snow over the camera
var drifters: Array[MultiMeshInstance3D] = [] # the balloons, and the whales
var sparks: MultiMeshInstance3D # the fireworks over towns at night
var fireflies: MultiMeshInstance3D # over the warm wet land at night
var herds: MultiMeshInstance3D # the animals on the open land
var curtains: MultiMeshInstance3D # the rain seen from afar
var boats: MultiMeshInstance3D # the boats on the sea around the flyer
var birds_of_place: MultiMeshInstance3D # gulls over the coasts and geese over the land
var landmarks := {} # plot -> the landmark built there, or null
var baked := ShaderMaterial.new() # the landmarks' one material (baked.gdshader)
var gem_mesh: ArrayMesh # a beacon's gem, and its motes
var motes_mesh: ArrayMesh
var clouds: Array[MultiMeshInstance3D] = [] # the low clouds, and the mist
var clouded := 0.0 # how deep in a cloud the camera is
var mist_density := 0.006 # of the haze over the sea, at the sea
var falling := ShaderMaterial.new() # the drops and flakes around the camera
var shower := MultiMeshInstance3D.new()
var fallen: Array[Vector3] = [Vector3.ZERO, Vector3.ZERO] # how far the rain and the snow have fallen and drifted
var night_share := 0.0
var skim := 0.0 # how low the board is over the sea, between 0 and 1
var sea_heard := 0.0 # how loud the sea is
var pod: Array[Node3D] = [] # dolphins that leap beside a board that skims the sea
var pod_out := 0.0 # how far up from the deep they are, between 0 and 1
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
	add_child(ground_life)
	var up := Vector3(cos(START_LONGITUDE), 0.0, sin(START_LONGITUDE))
	Terrain.anchor = Basis(up.cross(Vector3.UP), up, Vector3.UP)
	weather = Terrain.anchor * Vector3(9.0, 0.0, 3.5)
	sun_frame = Terrain.anchor
	tour = option("--tour", 0.0)
	tour_top = option("--top", tour_top)
	rebake = option("--rebake", 0.0)
	for ring in OWN:
		grounds.append(build_ground(RINGS[ring][0] + 4, RINGS[ring][1]))
	build_planet()
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
		materials[-1].set_shader_parameter("seas", ring >= 3)
		land.custom_aabb = AABB(Vector3.ONE * -1e7, Vector3.ONE * 2e7)
		if ring >= 3:
			land.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# What reads the planet's ground waits until it is drawn.
		land.visible = ring < OWN
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
	# The towns' buildings: the lots within CITY_NEAR of the flyer each way have the whole
	# mesh, those beyond to CITY_REACH one with a plainer roof. The far lots are in the order
	# of their distance, so the first so many are those within a distance: a weak adapter
	# draws fewer (set_level).
	for far: bool in [false, true]:
		var town := build_grid(house_mesh(2 if far else 4), 2, Terrain.LOT, reads_ground(preload("res://city.gdshader"), 1))
		(town.material_override as ShaderMaterial).set_shader_parameter("coarse", far)
		var rings := PackedFloat32Array()
		for ring in range(CITY_NEAR if far else 0, CITY_REACH if far else CITY_NEAR):
			for x in range(-ring - 1, ring + 1):
				for z in range(-ring - 1, ring + 1):
					if maxi(x if x >= 0 else -x - 1, z if z >= 0 else -z - 1) == ring:
						rings.append_array([1, 0, 0, (x + 0.5) * Terrain.LOT, 0, 1, 0, 0, 0, 0, 1, (z + 0.5) * Terrain.LOT])
		town.multimesh.instance_count = rings.size() / 12
		town.multimesh.buffer = rings
		var half := CITY_REACH * Terrain.LOT
		town.custom_aabb = AABB(Vector3(-half, 0, -half), Vector3(half * 2.0, 500, half * 2.0))
		cities.append(town)
	var plane := PlaneMesh.new()
	plane.size = Vector2(8000, 8000)
	plane.subdivide_width = 79
	plane.subdivide_depth = 79
	water.mesh = plane
	water.custom_aabb = AABB(Vector3.ONE * -1e5, Vector3.ONE * 2e5)
	water.material_override = reads_ground(preload("res://water.gdshader"), 1)
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)
	build_pod()
	build_flyer()
	camera.far = 3.0e6
	camera.fov = fov_led
	camera.near = 0.3
	add_child(camera)
	build_hud()
	# The low clouds and the mist (cloud.gdshader): nine balls for each cell of a grid.
	for mist: bool in [false, true]:
		var puff := SphereMesh.new()
		puff.radial_segments = 12
		puff.rings = 6
		var bank := build_grid(puff, 13, CLOUD_CELL, reads_ground(preload("res://cloud.gdshader"), 2))
		(bank.material_override as ShaderMaterial).set_shader_parameter("mist", mist)
		# What is seen through is drawn in a fixed order, the curtains of rain first, then the
		# clouds, the mist, and all else by its distance: an order by distance would change
		# as the flight goes on, and with it the picture where two of them overlap.
		(bank.material_override as ShaderMaterial).render_priority = -2 if mist else -3
		some_each(bank, 9)
		clouds.append(bank)
	# The rain seen from afar (curtain.gdshader): a column for each cell of a grid.
	var column := CylinderMesh.new()
	column.top_radius = 1.0
	column.bottom_radius = 1.0
	column.height = 1.0
	column.radial_segments = 20
	column.rings = 3
	column.cap_top = false
	column.cap_bottom = false
	var veil := ShaderMaterial.new()
	veil.shader = preload("res://curtain.gdshader")
	veil.render_priority = -4
	materials.append(veil)
	curtains = build_grid(column, 13, 300.0, veil)
	curtains.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	curtains.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# The boats (afloat.gdshader) and the birds of a place (wings.gdshader): a grid each.
	boats = build_grid(boat_mesh(), 16, 180.0, reads_ground(preload("res://afloat.gdshader"), 2))
	boats.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var wing := PlaneMesh.new()
	wing.size = Vector2(1.6, 0.5)
	wing.subdivide_width = 6
	birds_of_place = build_grid(wing, 9, 360.0, reads_ground(preload("res://wings.gdshader"), 2))
	some_each(birds_of_place, 9)
	# Fireworks over towns at night (fireworks.gdshader): 48 sparks for each cell of a grid.
	sparks = build_grid(QuadMesh.new(), 15, 200.0, reads_ground(preload("res://fireworks.gdshader"), 2))
	some_each(sparks, 48)
	# Fireflies over the warm wet land at night (fireflies.gdshader): 12 for each cell of a grid.
	fireflies = build_grid(QuadMesh.new(), 13, 36.0, reads_ground(preload("res://fireflies.gdshader"), 0))
	some_each(fireflies, 12)
	# Herds on the open land (herd.gdshader).
	herds = build_grid(animal_mesh(), 9, 300.0, reads_ground(preload("res://herd.gdshader"), 1))
	some_each(herds, 9)
	# Balloons in the sky (aloft.gdshader) and whales in the deep sea (whale.gdshader).
	var round_ball := SphereMesh.new()
	round_ball.radial_segments = 16
	round_ball.rings = 12
	drifters.append(build_grid(round_ball, 7, 520.0, reads_ground(preload("res://aloft.gdshader"), 2)))
	drifters.append(build_grid(round_ball, 7, 420.0, reads_ground(preload("res://whale.gdshader"), 2)))
	var whales := drifters[1].multimesh.buffer
	var parts := PackedFloat32Array()
	for plot in whales.size() / 12:
		for part in 3:
			parts.append_array(whales.slice(plot * 12, plot * 12 + 12))
	drifters[1].multimesh.instance_count = parts.size() / 12
	drifters[1].multimesh.buffer = parts
	for drifter in drifters:
		drifter.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
		drifter.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# The rain and the snow: cards in a box of air around the camera (rain.gdshader).
	var card := QuadMesh.new()
	shower.multimesh = MultiMesh.new()
	shower.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	shower.multimesh.mesh = card
	shower.multimesh.instance_count = 9000
	falling.shader = preload("res://rain.gdshader")
	falling.render_priority = 2
	shower.material_override = falling
	shower.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	shower.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shower)
	flyer.position = Vector3(START.x, Terrain.surface(START) + 30.0, START.y)
	# With --high the flight by itself starts at that height and keeps it.
	var held_at := option("--high", 0.0)
	if held_at > 0.0:
		lowered = maxf(held_at - 8000.0, 0.0)
		flyer.position.y = held_at - lowered
		tour_phase = 2
		tour_held = -1e9
	baked.shader = preload("res://baked.gdshader")
	materials.append(baked)
	warm_up()
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
		print("PLANET adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())


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
	cities[0].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if level < 3 else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	cities[1].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	shower.multimesh.visible_instance_count = 9000 if level < 3 else 3600
	# How far a town's buildings are drawn: 1,600 units, less on a weak adapter.
	var lots: int = [CITY_REACH, CITY_REACH, 72, 52, 40, 33, 26][level]
	cities[0].multimesh.visible_instance_count = 4 * mini(lots, CITY_NEAR) * mini(lots, CITY_NEAR)
	cities[1].visible = lots > CITY_NEAR
	cities[1].multimesh.visible_instance_count = maxi(0, 4 * (lots * lots - CITY_NEAR * CITY_NEAR))
	tell("city_reach", lots * Terrain.LOT)
	# A weak adapter has the dawn's haze without its banks of mist.
	tell("sways", level < 2)
	herds.visible = level < 6
	clouds[1].visible = level < 5
	curtains.visible = level < 5
	# A weak adapter has simpler crowns near by: the next grid's.
	groves[0].multimesh.mesh = tree_mesh(GROVES[0 if level < 3 else 1][1])
	groves[1].multimesh.mesh = tree_mesh(GROVES[1 if level < 3 else 2][1], true)
	# The weakest level's second grid of trees ends sooner, where the land paints their crowns.
	var second: Vector4 = GROVES[1][2] if level < 6 else Vector4(64, 80, 150, 176)
	(groves[1].material_override as ShaderMaterial).set_shader_parameter("ring", second)
	tell("paint_from", (second.z if drawn == 2 else GROVES[drawn - 1][2].z) - 20.0)
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
		Engine.max_fps = 30 if mean < (27.0 if Engine.max_fps == 30 else 22.0) else 20 if mean < 36.0 else 12
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
	if ring < OWN:
		material.set_shader_parameter("ground", grounds[ring].get_texture())
	if beyond < OWN:
		material.set_shader_parameter("ground_beyond", grounds[beyond].get_texture())
	material.set_shader_parameter("planet_ground", planet.get_texture())
	material.set_shader_parameter("source", 0 if beyond < OWN else 1 if ring < OWN else 2)
	material.set_shader_parameter("cell", RINGS[ring][1])
	material.set_shader_parameter("cell_beyond", RINGS[beyond][1])
	material.set_shader_parameter("reach", (RINGS[ring][0] * RINGS[ring][1] - ring_step(ring)) / 2.0)
	materials.append(material)
	return material


## The step a grid follows the flight in.
static func ring_step(ring: int) -> float:
	return maxf(STEP, RINGS[mini(ring + 1, RINGS.size() - 1)][1])


## The whole planet's ground as a texture (ground.gdshader's `whole`), drawn once at the start.
func build_planet() -> void:
	planet = SubViewport.new()
	planet.size = PLANET_TEXELS
	planet.use_hdr_2d = true
	planet.transparent_bg = true
	planet.disable_3d = true
	planet.render_target_update_mode = SubViewport.UPDATE_ONCE
	var strip := ColorRect.new()
	strip.size = PLANET_TEXELS
	var material := ShaderMaterial.new()
	material.shader = preload("res://ground.gdshader")
	material.set_shader_parameter("whole", true)
	material.set_shader_parameter("whole_size", Vector2(PLANET_TEXELS))
	strip.material = material
	planet.add_child(strip)
	add_child(planet)


## Once the planet's ground is drawn, the far grids show.
func draw_planet() -> void:
	planet_frames += 1
	# With --rebake SECOND the planet's ground is drawn again then: that frame's time is its cost.
	if rebake > 0.0 and elapsed > rebake:
		rebake = 0.0
		planet.render_target_update_mode = SubViewport.UPDATE_ONCE
		print("PLANET rebake at frame ", planet_frames)
	if planet_frames == 3:
		for ring in range(OWN, RINGS.size()):
			lands[ring].visible = true


## Gives a grid so many instances for each of its plots (a shader tells them apart by their number).
func some_each(grid: MultiMeshInstance3D, each: int) -> void:
	var plots := grid.multimesh.buffer
	var all := PackedFloat32Array()
	for plot in plots.size() / 12:
		for copy in each:
			all.append_array(plots.slice(plot * 12, plot * 12 + 12))
	grid.multimesh.instance_count = all.size() / 12
	grid.multimesh.buffer = all
	grid.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	grid.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## An animal before herd.gdshader walks it: a body, a head on a neck toward -z, and four legs,
## of boxes, told apart by their colour's red (0 the body, 1 the head, 0.5 a leg) and a leg's
## pace by its green.
static func animal_mesh() -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	tool.set_normal(Vector3.UP)
	var box := func(middle: Vector3, size: Vector3, colour: Color) -> void:
		tool.set_color(colour)
		for face in 6:
			var axis := face / 2
			var out := Vector3.ZERO
			out[axis] = 1.0 if face % 2 == 0 else -1.0
			var one := Vector3.ZERO
			one[(axis + 1) % 3] = 1.0
			var two := Vector3.ZERO
			two[(axis + 2) % 3] = 1.0
			for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, -1), Vector2(1, 1), Vector2(-1, 1)]:
				tool.add_vertex(middle + (out + one * corner.x + two * corner.y) * size / 2.0)
	box.call(Vector3(0, 1.55, 0), Vector3(0.9, 0.9, 2.2), Color(0, 0, 0))
	box.call(Vector3(0, 2.1, -1.35), Vector3(0.45, 0.55, 0.8), Color(1, 0, 0))
	for leg in 4:
		box.call(Vector3(0.3 if leg % 2 == 0 else -0.3, 0.55, 0.8 if leg < 2 else -0.8), Vector3(0.2, 1.1, 0.2), Color(0.5, float((leg + leg / 2) % 2), 0))
	return tool.commit()


## A boat before afloat.gdshader sails it: a hull that narrows to its bow (toward -z), a mast, a
## three-cornered sail and a lamp at the bow, told apart by their colour's red.
static func boat_mesh() -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	tool.set_normal(Vector3.UP)
	var corners := func(points: Array, red: float) -> void:
		tool.set_color(Color(red, 0, 0))
		for index: int in ([0, 1, 2] if points.size() == 3 else [0, 1, 2, 0, 2, 3]):
			tool.add_vertex(points[index])
	var bow := Vector3(0, 0.9, -3.4)
	var keel := Vector3(0, -0.3, -2.6)
	for side: float in [-1.0, 1.0]:
		corners.call([Vector3(side * 0.9, 0.8, 2.6), Vector3(side * 0.9, 0.8, -0.8), bow], 0.0)
		corners.call([Vector3(side * 0.9, 0.8, 2.6), Vector3(side * 0.9, 0.8, -0.8), Vector3(side * 0.5, -0.3, -0.6), Vector3(side * 0.5, -0.3, 2.3)], 0.0)
		corners.call([Vector3(side * 0.9, 0.8, -0.8), bow, keel, Vector3(side * 0.5, -0.3, -0.6)], 0.0)
	corners.call([Vector3(-0.9, 0.8, 2.6), Vector3(0.9, 0.8, 2.6), Vector3(0.5, -0.3, 2.3), Vector3(-0.5, -0.3, 2.3)], 0.0)
	corners.call([Vector3(-0.9, 0.8, 2.6), Vector3(0.9, 0.8, 2.6), Vector3(0.9, 0.8, -0.8), Vector3(-0.9, 0.8, -0.8)], 0.0)
	corners.call([Vector3(-0.07, 0.8, -0.6), Vector3(0.07, 0.8, -0.6), Vector3(0.07, 6.4, -0.6), Vector3(-0.07, 6.4, -0.6)], 0.5)
	corners.call([Vector3(0, 6.2, -0.6), Vector3(0, 1.4, -0.6), Vector3(0, 1.6, 2.5)], 1.0)
	corners.call([Vector3(-0.15, 1.2, -3.0), Vector3(0.15, 1.2, -3.0), Vector3(0.15, 0.9, -3.0), Vector3(-0.15, 0.9, -3.0)], 0.75)
	return tool.commit()


## A building before city.gdshader shapes it: four walls of a unit box, and over them a roof of
## so many squares each way, marked by its colour.
static func house_mesh(squares: int) -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	tool.set_color(Color.BLACK)
	for side in 4:
		var out := Vector3.RIGHT.rotated(Vector3.UP, side * PI / 2.0)
		var along := Vector3.BACK.rotated(Vector3.UP, side * PI / 2.0)
		tool.set_normal(out)
		# A wall's top has a point at its middle and its top is marked (green): the vertex stage
		# raises it to the roof over it, so a gable is closed.
		for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, -1), Vector2(1, 1), Vector2(0, 1), Vector2(-1, -1), Vector2(0, 1), Vector2(-1, 1)]:
			tool.set_color(Color(0, 1, 0) if corner.y > 0 else Color.BLACK)
			tool.add_vertex(out * 0.5 + along * 0.5 * corner.x + Vector3.UP * 0.5 * corner.y)
	tool.set_color(Color.RED)
	tool.set_normal(Vector3.UP)
	for x in squares:
		for z in squares:
			for corner: Vector2 in [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 0), Vector2(1, 1), Vector2(0, 1)]:
				tool.add_vertex(Vector3((x + corner.x) / squares - 0.5, 0.5, (z + corner.y) / squares - 0.5))
	tool.index()
	return tool.commit()


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
	ground_life.add_child(instance)
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
	material.set_shader_parameter("anchor_frame", Terrain.anchor)
	charts.append(material)
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
	# The mouth: the lower jaw closed under the muzzle, and the tongue, a strip of the cape's
	# cloth that comes out of the mouth's left side and trails back in the wind.
	Parts.part(head, ball, white, Vector3(0, -0.4, -0.44), Vector3(-5, 0, 0), Vector3(0.46, 0.16, 0.66))
	var lick := PlaneMesh.new()
	lick.size = Vector2.ONE
	lick.center_offset = Vector3(0, 0, 0.5)
	lick.subdivide_width = 2
	lick.subdivide_depth = 10
	tongue.shader = preload("res://cape.gdshader")
	tongue.set_shader_parameter("colour", Color(0.9, 0.38, 0.48))
	tongue.set_shader_parameter("tip", Color(0.96, 0.5, 0.58))
	tongue.set_shader_parameter("widens", Vector2(1.0, -0.75))
	tongue.set_shader_parameter("flaps", 0.3)
	tongue.set_shader_parameter("own", 3.1)
	var back := Vector3(-0.8, -0.2, 1.0).normalized()
	var across := Vector3(-0.75, 0.65, 0.0).cross(back).normalized()
	Parts.part(head, lick, tongue, Vector3.ZERO).transform = Transform3D(Basis(across * 0.24, back.cross(across), back * 0.85), Vector3(-0.06, -0.345, -0.68))
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
	patter.stream = murmur(2.0, 0.85, 0.0)
	wash.stream = murmur(6.0, 0.05, 1.0)
	for weather: AudioStreamPlayer in [patter, wash]:
		weather.volume_db = -80.0
		add_child(weather)
		weather.play()
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
	# A gust that crosses the flyers (terrain.gdshaderinc's gust) lays the coats flatter and
	# throws the cape higher.
	var over := Vector2(flyer.position.x, flyer.position.z)
	var blown := Terrain.noise((over - WIND * elapsed * 14.0) / 60.0) * Terrain.noise((over - WIND * elapsed * 5.0) / 220.0 + Vector2(40.0, 40.0))
	var air := flyer.global_basis * Vector3(turn * 0.5, 0.0, 0.9 * fast) * (1.0 + 1.5 * blown)
	cape_material.set_shader_parameter("flaps", 1.0 + 1.2 * blown)
	for fur in furs:
		fur.set_shader_parameter("wind", air)
	for cloth: ShaderMaterial in pelican.plumes + [cape_material, tongue]:
		cloth.set_shader_parameter("phase", flutter)
		cloth.set_shader_parameter("lean", turn)
	# The wakes keep a place for every stretch flown, the newest at the board's tail: each exactly
	# a stretch from the one before, so the ribbon's pattern keeps its place as one is added.
	wake[0] = flyer.to_global(Vector3(0, -0.3, 3.0))
	if wake[0].distance_to(wake[1]) > WAKE * WAKE_APART:
		for place in range(1, WAKE):
			wake[place] = wake[0] + flyer.global_basis.z * place * WAKE_APART
	while wake[0].distance_to(wake[1]) > WAKE_APART:
		wake.insert(1, wake[1] + (wake[0] - wake[1]).normalized() * WAKE_APART)
		wake.resize(WAKE)
	for wake_material in wakes:
		wake_material.set_shader_parameter("path", wake)
		wake_material.set_shader_parameter("lead", wake[0].distance_to(wake[1]) / WAKE_APART)
		wake_material.set_shader_parameter("clock", elapsed)
		wake_material.set_shader_parameter("strokes", pelican.angle / PI)


## A loop of noise for the weather, made here. Of each sample `kept` is new: near 1 the noise
## is bright (rain), near 0 deep (the sea). With `swells` it comes and draws back every three
## seconds, and is still where the loop joins.
static func murmur(seconds: float, kept: float, swells: float) -> AudioStreamWAV:
	const RATE := 22050
	var count := int(RATE * seconds)
	var data := PackedByteArray()
	data.resize(count * 2)
	var air := 0.0
	var random := RandomNumberGenerator.new()
	random.seed = 11
	for i in count:
		air = lerpf(air, random.randf_range(-1.0, 1.0), kept)
		var value := air * 0.35 / sqrt(kept) * (1.0 - swells * (0.5 + 0.5 * cos(TAU * i / (RATE * 3.0))))
		data.encode_s16(i * 2, int(clampf(value, -1.0, 1.0) * 32767.0))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.data = data
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = count
	return stream


## Five dolphins of one mesh, hidden until the board skims the sea.
func build_pod() -> void:
	var dolphin := Node3D.new()
	var round := SphereMesh.new()
	round.radial_segments = 10
	round.rings = 5
	var grey := Parts.paint(Color(0.05, 0.08, 0.13), 0.25)
	Parts.part(dolphin, round, grey, Vector3.ZERO, Vector3.ZERO, Vector3(0.95, 0.95, 3.8))
	Parts.part(dolphin, round, Parts.paint(Color(0.45, 0.48, 0.52), 0.35), Vector3(0, -0.14, -0.2), Vector3.ZERO, Vector3(0.8, 0.75, 3.1))
	Parts.part(dolphin, round, grey, Vector3(0, -0.05, -2.0), Vector3.ZERO, Vector3(0.3, 0.26, 0.9))
	Parts.part(dolphin, Landmarks.cylinder(0.0, 0.5, 4), grey, Vector3(0, 0.65, 0.3), Vector3(-28, 0, 0), Vector3(0.3, 0.8, 1.0))
	Parts.part(dolphin, round, grey, Vector3(0, 0, 2.0), Vector3.ZERO, Vector3(1.5, 0.12, 0.55))
	var mesh := Parts.bake(dolphin)
	dolphin.free()
	for index in 5:
		var one := Node3D.new()
		Parts.part(one, mesh, baked, Vector3.ZERO).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		one.visible = false
		add_child(one)
		pod.append(one)


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
	title.text = "VOXEL PLANET"
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
	hint_until = elapsed + 7.0
	helm_shown = helm
	hint.text = "The corgi flies itself. Enter or a click takes the board.    Wheel or Z, X: zoom    Q: quit" if not helm \
		else "Arrows or WASD: steer, climb, dive    Keep climbing to leave the planet    %s    Wheel or Z, X: zoom    T: hours    Esc: let go    Q: quit" % ("Mouse: look" if captured else "Click: mouse look")


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
			print("PLANET flown %d beacons %d view %d %d" % [int(flown), scored + lit.size(), int(rad_to_deg(looked.x)), int(rad_to_deg(looked.y))])
			leave()
	if helm != helm_shown:
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
	patter.stop()
	wash.stop()
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
	draw_planet()
	fly(delta)
	set_day()
	# What lives near the ground has gone by degrees by 5,000 units up (the trees and towns
	# under the haze, the low clouds, beacons and landmarks by their height's share), and is
	# not drawn from over 9,000.
	if flyer.position.y + lowered < 6000.0:
		tend_beacons(delta)
		tend_landmarks()
	else:
		let_go()
	ground_life.visible = flyer.position.y + lowered < (9000.0 if ground_life.visible else 8000.0)
	flock.visible = flyer.position.y + lowered < (2600.0 if flock.visible else 2000.0)
	follow(delta)
	speed_lines.set_shader_parameter("rush", clampf((speed - CRUISE - 4.0) / 30.0, 0.0, 1.0))
	speed_lines.set_shader_parameter("clock", elapsed)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	hint.modulate.a = clampf(hint_until - elapsed, 0.0, 1.0)
	# The score swells as a beacon is lit.
	shown_score = lerpf(shown_score, scored + lit.size(), 1.0 - exp(-delta * 6.0))
	score.text = str(scored + lit.size())
	score.scale = Vector2.ONE * (1.0 + 0.5 * sin(PI * clampf(scored + lit.size() - shown_score, 0.0, 1.0)))
	if autopilot_seconds > 0.0:
		watch()


func fly(delta: float) -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var alt := flyer.position.y + lowered
	var soar := 1.0 + maxf(alt - SOARS_FROM, 0.0) / SOARS_BY
	var forward := Vector3(sin(heading), 0.0, -cos(heading))
	# What stands on the way of the next second and a half, along the turn the board is in: the
	# highest of it, and the climb that clears all of it in the time the board takes to reach it.
	var ground := 0.0
	var must := -INF
	var under := INF
	for step in 12:
		var time := step * 0.14
		var way := heading + turn * 0.55 * time / 2.0
		if alt > 3000.0:
			break
		var top := Terrain.roof(here + Vector2(sin(way), -cos(way)) * maxf(speed, 30.0) * soar * time)
		# An island that floats on the way is passed over or under, by where the board is.
		var isle := Terrain.island(here + Vector2(sin(way), -cos(way)) * maxf(speed, 30.0) * soar * time)
		if isle != Vector2.ZERO:
			if alt > (isle.x + isle.y) / 2.0:
				top = maxf(top, isle.y)
			else:
				under = minf(under, isle.x)
		ground = maxf(ground, top)
		must = maxf(must, (top + 5.0 - alt) / maxf(time, 0.25))
	var wanted_turn: float
	var wanted_climb: float
	# The flight keeps what it gains: a dive gives speed and a climb takes it, the wind at the
	# back gives a little, and low over the sea the board skims and runs faster still.
	var wanted_speed := CRUISE + clampf(-climb * 1.2, -9.0, 18.0) + 5.0 * WIND.dot(Vector2(forward.x, forward.z))
	var over_sea := Terrain.height(here) < Terrain.SEA
	skim = lerpf(skim, smoothstep(13.0, 8.5, alt - Terrain.SEA) if over_sea else 0.0, 1.0 - exp(-delta * 3.0))
	wanted_speed += 14.0 * skim
	tell("skims", Vector3(flyer.position.x, flyer.position.z, skim))
	# Dolphins come up beside a board that skims the sea, and leap along with it.
	pod_out = move_toward(pod_out, 1.0 if skim > 0.5 else 0.0, delta * 0.5)
	for index in pod.size():
		var one := pod[index]
		var phase := elapsed * 2.2 + index * 1.9
		var at := flyer.position + Vector3(-forward.z, 0, forward.x) * (index % 2 * 2 - 1) * (10.0 + 4.0 * (index / 2)) - forward * (5.0 * index - 14.0)
		one.visible = pod_out > 0.0 and Terrain.height(Vector2(at.x, at.z)) < Terrain.SEA - 2.5
		one.position = Vector3(at.x, Terrain.SEA - 1.6 + 3.4 * sin(phase) * pod_out - 4.0 * (1.0 - pod_out), at.z)
		one.rotation = Vector3(cos(phase) * 0.7, -heading, 0)
	# Where the wind meets a slope it rises, and carries the board up with it near the ground.
	var slope := (Terrain.height(here + WIND * 14.0) - Terrain.height(here - WIND * 14.0)) / 28.0
	var updraft := clampf(slope, 0.0, 1.0) * 9.0 * smoothstep(70.0, 20.0, alt - ground)
	if alt < 6000.0:
		updraft += tend_thermals()
	# A beacon's push: it comes on in under a second and wears off over the next six.
	var since := elapsed - pushed
	wanted_speed += BOOST * smoothstep(0.0, 0.7, since) * (1.0 - smoothstep(2.5, 6.5, since))
	wanted_speed += fly_flock(delta, forward)
	if helm:
		wanted_turn = Input.get_axis("ui_left", "ui_right") + key_axis(KEY_A, KEY_D)
		wanted_climb = (Input.get_axis("ui_down", "ui_up") + key_axis(KEY_S, KEY_W)) * 14.0
		# The ground pushes the board up, and its ceiling holds it down.
		wanted_climb = maxf(wanted_climb, (ground + (8.0 if over_sea else 14.0) - alt) * 2.0)
		# No ceiling but space's: the board climbs out of the air, and the planet falls away.
		wanted_climb = minf(wanted_climb, (SPACE - alt) / soar)
	elif tour_phase > 0:
		# The tour: up until the planet is whole, a look around it, and down again.
		wanted_turn = 0.25 if tour_phase == 2 else 0.0
		wanted_climb = 14.0 if tour_phase == 1 else 0.0 if tour_phase == 2 else -14.0
		if tour_phase == 1 and alt > tour_top:
			tour_phase = 2
		elif tour_phase == 2:
			tour_held += delta
			if tour_held > 14.0:
				tour_phase = 3
		elif tour_phase == 3 and alt < maxf(ground + 60.0, CEILING * 0.5):
			tour_phase = 0
		wanted_climb = maxf(wanted_climb, (ground + 24.0 - alt) * 0.7)
	else:
		if tour > 0.0 and elapsed > tour and tour_held == 0.0:
			tour_phase = 1
		# A wandering course at a steady height over the ground ahead, by way of the next beacon.
		wanted_turn = sin(flown * 0.0037) * 0.5 + sin(flown * 0.0013 + 1.0) * 0.4
		var height := ground + 22.0
		var beacon := beacon_ahead(forward)
		if beacon:
			var to := beacon.position - flyer.position
			wanted_turn = clampf(forward.signed_angle_to(Vector3(to.x, 0.0, to.z), Vector3.DOWN) * 2.5, -1.0, 1.0)
			if Vector2(to.x, to.z).length() < 110.0:
				height = maxf(ground + 10.0, beacon.position.y)
		wanted_climb = clampf((height - alt) * 0.7, -9.0, 14.0)
	if under < INF:
		wanted_climb = minf(wanted_climb, (under - 9.0 - alt) * 2.0)
		must = -INF
	var ease := 1.0 - exp(-delta * 2.5)
	turn = lerpf(turn, clampf(wanted_turn, -1.0, 1.0), ease)
	climb = lerpf(climb, wanted_climb, ease)
	if must > climb:
		climb = lerpf(climb, minf(must, 60.0), 1.0 - exp(-delta * 12.0))
	speed = lerpf(speed, wanted_speed, 1.0 - exp(-delta * 1.2))
	heading += turn * 0.55 * delta
	flown += speed * delta
	# High up a step is `soar` times longer. What follows the flyer (the camera, the wakes, the
	# birds) is carried along by all of the step but the board's own, so up there they see the
	# board fly as it does below, and the planet turn under it.
	var stride := (forward * speed + Vector3.UP * (climb + updraft)) * delta
	flyer.position += stride * soar
	carry(stride * (soar - 1.0))
	if alt < 3000.0:
		flyer.position.y = maxf(flyer.position.y, Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 10.0 - lowered)
	keep_low()
	move_anchor()
	highest = maxf(highest, flyer.position.y + lowered)
	# The board banks into its turns and noses up into its climbs.
	flyer.rotation = Vector3(clampf(climb, -20.0, 24.0) * 0.02, -heading, -turn * 0.6)
	engine.pitch_scale = 0.8 + speed / CRUISE * 0.3
	# No air carries the engines' sound in space.
	engine.volume_db = -16.0 - 50.0 * (1.0 - exp(-alt / (AIR * 3.0)))
	ride(delta)
	var high := flyer.position.y + lowered
	for ring in RINGS.size():
		var cell: float = RINGS[ring][1]
		var step := ring_step(ring)
		var middle := Vector2(snappedf(flyer.position.x, step), snappedf(flyer.position.z, step))
		# A grid with a texture of its own is not drawn once the flyer is 300 of its cells high:
		# by then it shows the coarser grid's ground (ground.gdshaderinc), which that grid then
		# draws itself, its square filled. Its ground is drawn anew when it is next seen.
		var shown := ring >= OWN or high < 300.0 * cell
		if lands[ring].position.x != middle.x or lands[ring].position.z != middle.y or stale[ring]:
			stale[ring] = not shown
			lands[ring].position = Vector3(middle.x, 0.0, middle.y)
			if ring < OWN and shown:
				# The texture's first point is one before the grid's own, for the slopes at its edge.
				(grounds[ring].get_child(0) as ColorRect).material.set_shader_parameter("first", (middle / cell).round() - Vector2.ONE * (RINGS[ring][0] / 2 + 1))
				grounds[ring].render_target_update_mode = SubViewport.UPDATE_ONCE
			if ring + 1 < RINGS.size():
				(lands[ring + 1].material_override as ShaderMaterial).set_shader_parameter("middle", middle)
		if ring < OWN:
			lands[ring].visible = shown
			(lands[ring + 1].material_override as ShaderMaterial).set_shader_parameter("hole", RINGS[ring][0] * cell / 2.0 if lands[ring].visible else 0.0)
	# The chart, and the flyer in it, for every vertex stage (terrain.gdshaderinc's lift).
	var over_ground := Vector2(flyer.position.x, flyer.position.z)
	tell("flyer_over", over_ground)
	tell("flyer_dir", Terrain.chart_dir(over_ground))
	tell("flyer_frame", Terrain.chart_frame(over_ground).transposed())
	tell("anchor_frame", Terrain.anchor)
	tell("lowered", lowered)
	tell("altitude", high)
	tell("drift", weather * elapsed)
	tell("weather_near", Terrain.weather(over_ground, weather * elapsed))
	var among := Vector2(snappedf(flyer.position.x, PLOT * 4.0), snappedf(flyer.position.z, PLOT * 4.0))
	for grove in groves:
		grove.position = Vector3(among.x, 0.0, among.y)
	for town in cities:
		town.position = Vector3(among.x, 0.0, among.y)
	boats.position = Vector3(snappedf(flyer.position.x, 180.0), 0.0, snappedf(flyer.position.z, 180.0))
	birds_of_place.position = Vector3(snappedf(flyer.position.x, 360.0), 0.0, snappedf(flyer.position.z, 360.0))
	curtains.position = Vector3(snappedf(flyer.position.x, 300.0), 0.0, snappedf(flyer.position.z, 300.0))
	herds.position = Vector3(snappedf(flyer.position.x, 300.0), 0.0, snappedf(flyer.position.z, 300.0))
	sparks.position = Vector3(snappedf(flyer.position.x, 200.0), 0.0, snappedf(flyer.position.z, 200.0))
	# Drawn through the first seconds too (no spark shows by day), so their pipeline is made before the flight.
	sparks.visible = level < 5 and (night_share > 0.01 or elapsed < 3.0)
	fireflies.position = Vector3(snappedf(flyer.position.x, 36.0), 0.0, snappedf(flyer.position.z, 36.0))
	fireflies.visible = sparks.visible
	drifters[0].position = Vector3(snappedf(flyer.position.x, 520.0), 0.0, snappedf(flyer.position.z, 520.0))
	drifters[1].position = Vector3(snappedf(flyer.position.x, 420.0), 0.0, snappedf(flyer.position.z, 420.0))
	# The clouds drift with the wind.
	tell("adrift", WIND * elapsed * 4.0)
	tell("flyer", Vector2(flyer.position.x, flyer.position.z))
	tell("flyer_at", flyer.position + Vector3(0.0, lowered, 0.0))
	water.position = Vector3(flyer.position.x, Terrain.SEA - 0.2, flyer.position.z)


## Moves what follows the flyer by that much.
func carry(by: Vector3) -> void:
	trail += by
	flock_at += by
	for bird in birds.size():
		birds[bird] += by
	for place in wake.size():
		wake[place] += by


## Once the flyer is high, a height is taken off everything drawn (the shaders' `lowered`), in
## steps: float32 has steps of a sixteenth of a unit at a million, which would shake a close
## view of the flyer by some pixels. The flyer's own height stays under 14,000.
func keep_low() -> void:
	var by := 0.0
	if flyer.position.y > 14000.0:
		by = floorf((flyer.position.y - 4000.0) / LOWERED_STEP) * LOWERED_STEP
	elif flyer.position.y < 2000.0 and lowered > 0.0:
		by = -minf(lowered, ceilf((2000.0 - flyer.position.y) / LOWERED_STEP) * LOWERED_STEP)
	if by != 0.0:
		lowered += by
		flyer.position.y -= by
		carry(Vector3.DOWN * by)


## High up, where nothing that stands on the chart's lattice is seen, the chart's anchor moves
## under the flyer once it is far from it: the new chart's axes are the old one's at that place,
## so the heading stays, and the flyer is at the new chart's origin. What kept a place in the
## old chart is let go, and the grids' grounds are drawn anew.
func move_anchor() -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	if flyer.position.y + lowered < ANCHOR_FROM or here.length() < ANCHOR_REACH:
		return
	Terrain.anchor = (Terrain.anchor * Terrain.chart_frame(here)).orthonormalized()
	Terrain.marks.clear()
	Terrain.slow_place = Vector3(INF, INF, INF)
	flyer.position -= Vector3(here.x, 0.0, here.y)
	carry(-Vector3(here.x, 0.0, here.y))
	for chart in charts:
		chart.set_shader_parameter("anchor_frame", Terrain.anchor)
	scored += lit.size()
	lit.clear()
	let_go()
	stale.fill(true)
	anchors += 1


## Frees what stands at places of the chart: the beacons, the thermals and the landmarks.
func let_go() -> void:
	if rings_run:
		# The rings of light from lit beacons are told by tend_beacons, which no longer runs.
		var none := PackedVector4Array()
		none.resize(8)
		tell("pulses", none)
		rings_run = false
	for kept: Dictionary in [beacons, thermals, landmarks]:
		for plot: Vector2i in kept:
			if kept[plot]:
				kept[plot].queue_free()
		kept.clear()


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


## What is first drawn late in a flight (a thermal over a town, a lighthouse's beam) would have
## its pipeline made then, in a frame of 160 ms. Each is drawn once at the start, unseen, in a
## card under the board, for three seconds.
func warm_up() -> void:
	var card := QuadMesh.new()
	card.size = Vector2.ONE * 0.01
	var air := ShaderMaterial.new()
	air.shader = preload("res://thermal.gdshader")
	var beam := StandardMaterial3D.new()
	beam.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	beam.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	beam.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	beam.cull_mode = BaseMaterial3D.CULL_DISABLED
	beam.albedo_color = Color(1, 1, 1, 0)
	var warm := Node3D.new()
	flyer.add_child(warm)
	for material: Material in [air, beam]:
		Parts.part(warm, card, material, Vector3(0, -0.2, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# A landmark's one mesh has its colours in its vertices: so has this grain of one.
	var grain := Node3D.new()
	var speck := BoxMesh.new()
	speck.size = Vector3.ONE * 0.01
	Parts.part(grain, speck, Parts.paint(Color.WHITE, 0.5), Vector3.ZERO)
	Parts.part(warm, Parts.bake(grain), baked, Vector3(0, -0.2, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	grain.free()
	get_tree().create_timer(3.0).timeout.connect(warm.queue_free)


## Keeps the landmarks of the 49 plots around the flyer: builds one a frame as plots come near,
## frees those left behind, and lets each grow out of the distance.
func tend_landmarks() -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var middle := Vector2i((here / Terrain.MARK_PLOT).floor())
	for plot: Vector2i in landmarks.keys():
		if absi(plot.x - middle.x) > 3 or absi(plot.y - middle.y) > 3:
			if landmarks[plot]:
				landmarks[plot].queue_free()
			landmarks.erase(plot)
	var built := false
	for x in range(middle.x - 3, middle.x + 4):
		for y in range(middle.y - 3, middle.y + 4):
			var plot := Vector2i(x, y)
			if built or landmarks.has(plot):
				continue
			var found := Terrain.landmark(plot)
			landmarks[plot] = null
			if not found.is_empty():
				var mark := Landmarks.build(found, baked)
				mark.set_meta("rests", mark.position.y)
				add_child(mark)
				landmarks[plot] = mark
				built = true
	for plot: Vector2i in landmarks:
		var mark: Node3D = landmarks[plot]
		if mark:
			Landmarks.tend(mark, elapsed, night_share, (1.0 - smoothstep(700.0, 880.0, Vector2(mark.position.x, mark.position.z).distance_to(here))) * (1.0 - smoothstep(3000.0, 5500.0, flyer.position.y)))


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
		var strength := (1.0 - night_share) * (1.0 - smoothstep(230.0, 340.0, apart)) * (1.0 - smoothstep(2500.0, 5000.0, flyer.position.y))
		var air := (column.get_child(0) as MeshInstance3D).material_override as ShaderMaterial
		air.set_shader_parameter("strength", strength)
		air.set_shader_parameter("clock", elapsed)
		if flyer.position.y < column.position.y + 170.0:
			rising += 13.0 * strength * (1.0 - smoothstep(6.0, 24.0, apart))
	return rising


## A beacon's gem and its motes are one mesh each, made of the first beacon's parts: gives the
## node that mesh in place of its parts, and returns it.
func one_mesh(of: Node3D, mesh: ArrayMesh, paint: Material) -> ArrayMesh:
	if mesh == null:
		mesh = Parts.bake(of)
	for part in of.get_children():
		of.remove_child(part)
		part.queue_free()
	Parts.part(of, mesh, paint, Vector3.ZERO).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mesh


## The beacon of a plot of the world: where it floats, or nothing where the plot's place is sea.
static func beacon_place(plot: Vector2i) -> Variant:
	var p := (Vector2(plot) + Vector2(0.15, 0.15) + Vector2(Terrain.cell_hash(plot.x, plot.y), Terrain.cell_hash(plot.y + 57, plot.x - 31)) * 0.7) * BEACON_PLOT
	var ground := Terrain.height(p)
	if ground < Terrain.SEA + 2.0 or ground > Terrain.SEA + 130.0:
		return null
	# Its gem floats clear of what stands around it, and never over the board's reach.
	var clear := ground
	for beside in 5:
		clear = maxf(clear, Terrain.roof(p + (Vector2.from_angle(beside * TAU / 4.0) * 14.0 if beside < 4 else Vector2.ZERO)))
	return Vector3(p.x, clear + 18.0, p.y)


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
		var own: float = beacon.get_meta("own")
		beacon.get_child(0).rotate_y(delta * (0.8 + own))
		beacon.get_child(0).position.y = 1.5 * sin(elapsed * 1.1 + own * 30.0)
		# Its motes circle it, faster once it is lit; as it is lit a ring of light bursts out of it.
		var motes := beacon.get_child(3) as Node3D
		motes.rotate_y(delta * (1.2 + 2.5 * float(beacon.get_meta("alight"))) * (1.0 if own > 0.5 else -1.0))
		motes.position.y = beacon.get_child(0).position.y
		var burst := beacon.get_child(4) as MeshInstance3D
		var bursting: float = elapsed - lit[plot].z if lit.has(plot) else 100.0
		burst.visible = bursting < 1.6
		burst.scale = Vector3.ONE * (1.0 + 26.0 * (1.0 - exp(-bursting * 2.2)))
		(burst.material_override as StandardMaterial3D).albedo_color.a = 0.8 * (1.0 - smoothstep(0.2, 1.6, bursting))
		var seen := (1.0 - smoothstep(230.0, 340.0, Vector2(beacon.position.x - flyer.position.x, beacon.position.z - flyer.position.z).length())) * (1.0 - smoothstep(2500.0, 5000.0, flyer.position.y))
		# A beacon takes its light by degrees once it is lit.
		var alight: float = lerpf(beacon.get_meta("alight"), 1.0 if lit.has(plot) else 0.0, 1.0 - exp(-delta * 3.0))
		beacon.set_meta("alight", alight)
		var colour: Color = (beacon.get_meta("hue") as Color).lerp(Color(1.0, 0.62, 0.15), alight)
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
		if not leaving and not lit.has(plot) and Vector2(beacon.position.x - flyer.position.x, beacon.position.z - flyer.position.z).length() < BEACON_REACH and flyer.position.y > beacon.position.y - 24.0 and flyer.position.y < beacon.position.y + 150.0:
			lit[plot] = Vector4(beacon.position.x, beacon.position.z, elapsed, 1.0)
			pushed = elapsed
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
		var strength := (1.0 - smoothstep(520.0, 760.0, Vector2(at.x, at.y).distance_to(here))) * (1.0 - smoothstep(2500.0, 5000.0, flyer.position.y))
		if strength > 0.0 and pulses.size() < 8:
			pulses.append(Vector4(at.x, at.y, elapsed - at.z, strength))
	pulses.resize(8)
	tell("pulses", pulses)
	rings_run = true


## A crystal that turns over the ground, a light, and a shaft of light seen from far off.
func build_beacon(place: Vector3, alight: float) -> Node3D:
	# Each beacon has a number of its own: its colour before it is lit, its gem's shape and turn.
	var own := Terrain.cell_hash(int(place.x), int(place.z))
	var colour: Color = [Color(0.2, 0.8, 1.0), Color(0.75, 0.3, 1.0), Color(0.25, 1.0, 0.5), Color(1.0, 0.35, 0.6)][int(own * 4.0) % 4]
	var beacon := Node3D.new()
	beacon.position = place
	beacon.set_meta("alight", alight)
	beacon.set_meta("own", own)
	beacon.set_meta("hue", colour)
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
	gem_mesh = one_mesh(gem, gem_mesh, glass)
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
	# Three motes that circle the gem, and the ring that bursts out of it as it is lit.
	var motes := Node3D.new()
	beacon.add_child(motes)
	var mote := SphereMesh.new()
	mote.radial_segments = 8
	mote.rings = 4
	for index in 3:
		Parts.part(motes, mote, glass, Vector3(cos(index * TAU / 3.0) * 4.5, 0.8 * sin(index * 2.0), sin(index * TAU / 3.0) * 4.5), Vector3.ZERO, Vector3.ONE * 0.7).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	motes_mesh = one_mesh(motes, motes_mesh, glass)
	var ring := TorusMesh.new()
	ring.inner_radius = 0.9
	ring.outer_radius = 1.0
	ring.rings = 32
	ring.ring_segments = 6
	var flash := StandardMaterial3D.new()
	flash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flash.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flash.cull_mode = BaseMaterial3D.CULL_DISABLED
	flash.albedo_color = Color(1.0, 0.8, 0.4, 0.0)
	var burst := Parts.part(beacon, ring, flash, Vector3.ZERO)
	burst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	burst.visible = false
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
	var shot: Array = SHOTS[0]
	if not helm:
		# The round of the flight's own views, by the time flown.
		var since := fmod(elapsed, 68.0)
		for index in range(1, SHOTS.size()):
			shot = SHOTS[index]
			since -= shot[3]
			if since < 0.0:
				break
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
	# From high up the camera looks down: the planet's rim lies under eye level by the dip of
	# the horizon. Most of the dip is added to the view's pitch, and from space more than
	# that, toward straight down: the flyer is then seen over the planet, which is near the
	# view's middle and round in it (a sphere at a wide view's edge is drawn out).
	var dip := acos(Terrain.RADIUS / (Terrain.RADIUS + maxf(flyer.position.y + lowered, 0.0)))
	var down := smoothstep(0.03, 0.9, dip)
	var frame := Basis(Vector3.UP, -turned - looked.x) * Basis(Vector3.RIGHT, -looked.y - dip * 0.9 * down - (PI / 2.0 - dip) * 0.6 * down * down)
	# A close view looks at the corgi, from its own height.
	var close := Vector3(0, 2.4, 0) * (1.0 - smoothstep(0.45, 1.0, zoomed)) * (1.0 if helm else 0.0)
	var place := trail + frame * (aim + close + (view - aim) * zoomed)
	# The ground and the roofs lift the camera before they are reached, by degrees: the highest
	# of where the camera is and will be in the next second and a half, and of what stands
	# around it, since a turn of the view moves it sideways. It rises faster than it settles.
	var ground := 0.0
	for step in 4:
		ground = maxf(ground, Terrain.roof(Vector2(place.x, place.z) + Vector2(sin(heading), -cos(heading)) * step * 15.0))
	for beside in 6:
		ground = maxf(ground, Terrain.roof(Vector2(place.x, place.z) + Vector2.from_angle(beside * TAU / 6.0) * 14.0))
	var over := place.y + lowered - ground - 6.0
	var wanted_lift := (sqrt(over * over + 9.0) - over) / 2.0
	lift = lerpf(lift, wanted_lift, 1.0 - exp(-delta * (9.0 if wanted_lift > lift else 3.0)))
	place.y += lift
	camera.position = place
	camera.look_at(flyer.position + frame * (aim + close))
	var eye_height := camera.position.y + lowered
	# Higher up the nearest thing drawn is the flyer, and the furthest the planet's other rim.
	camera.near = lerpf(0.3, 1.2, smoothstep(2000.0, 20000.0, eye_height))
	tell("eye", camera.position + Vector3(0.0, lowered, 0.0))
	# It rains, or in winter snows, where the cloud over the camera is deep.
	var cloud_over := Terrain.cloud_depth(Vector2(camera.position.x, camera.position.z), weather * elapsed)
	falls = lerpf(falls, smoothstep(0.66, 0.78, cloud_over) * (1.0 - smoothstep(Terrain.CLOUD_HEIGHT - 60.0, Terrain.CLOUD_HEIGHT, eye_height)), 1.0 - exp(-delta * 1.5))
	sky_material.set_shader_parameter("rains", falls)
	# Rain is heard (snow is not), and so is the sea under a low flight.
	patter.volume_db = linear_to_db(maxf(0.22 * falls * (1.0 - season_share(0.85)), 0.0001))
	var over_sea_by := flyer.position.y + lowered - Terrain.SEA
	var sea_near := (1.0 - smoothstep(14.0, 70.0, over_sea_by)) if Terrain.height(Vector2(flyer.position.x, flyer.position.z)) < Terrain.SEA + 1.5 else 0.0
	sea_heard = lerpf(sea_heard, sea_near, 1.0 - exp(-delta * 1.2))
	wash.volume_db = linear_to_db(maxf(0.35 * sea_heard, 0.0001))
	# In a cloud the air is white.
	# In a cloud the air is white: in a low cloud's ball, and on the way through the cloud
	# layer where cloud stands in it. The sky's shader shows the layer from under it and the
	# land's from over it; in it, it is this white.
	var in_layer := smoothstep(0.5, 0.7, cloud_over) * smoothstep(Terrain.CLOUD_HEIGHT - 110.0, Terrain.CLOUD_HEIGHT - 20.0, eye_height) * (1.0 - smoothstep(Terrain.CLOUD_HEIGHT + 40.0, Terrain.CLOUD_HEIGHT + 240.0, eye_height))
	clouded = lerpf(clouded, maxf(in_cloud(camera.position) if eye_height < 2500.0 else 0.0, in_layer), 1.0 - exp(-delta * 1.5))
	# The haze thins with height: from over it the far ranges stand clear, and in space there
	# is none between the eye and the planet but the planet's own (land.gdshader's veil).
	var thin := exp(-eye_height / 900.0)
	environment.fog_density = lerpf(0.00045 * thin + 0.00004 * exp(-eye_height / AIR), 0.01, clouded)
	environment.fog_height_density = mist_density * exp(-eye_height / 500.0)
	environment.volumetric_fog_density = 0.0011 * exp(-eye_height / 1500.0)
	sky_material.set_shader_parameter("eye_height", eye_height)
	# A drop falls 22 units a second and a flake 2.6. The wind carries them, and the flight
	# slants them back by no more than half of their fall, so on the screen they come down.
	shower.visible = falls > 0.004 or elapsed < 3.0
	shower.position = camera.position
	for kind in 2:
		var fall := 2.6 if kind == 1 else 22.0
		var way := Vector3(WIND.x, 0.0, WIND.y) * fall * 0.12 - Vector3(sin(heading), 0.0, -cos(heading)) * minf(speed * 0.3, fall * 0.5) + Vector3.DOWN * fall
		fallen[kind] = (fallen[kind] + way * delta).posmod(1320.0)
		falling.set_shader_parameter("fallen_snow" if kind == 1 else "fallen_rain", fallen[kind])
		falling.set_shader_parameter("way_snow" if kind == 1 else "way_rain", way)
	falling.set_shader_parameter("falls", falls)
	falling.set_shader_parameter("snows", season_share(0.85))


## How deep in a low cloud a place is, between 0 and 1, from a little outside it: cloud.gdshader's
## balls of the four cells nearest, computed here.
func in_cloud(place: Vector3) -> float:
	var adrift := WIND * elapsed * 4.0
	var deep := 0.0
	var first := ((Vector2(place.x, place.z) - adrift) / CLOUD_CELL - Vector2(0.5, 0.5)).floor()
	for cell in 4:
		var number := first + Vector2(cell % 2, cell / 2)
		var cover := smoothstep(0.53, 0.65, Terrain.fbm(number * 0.31 + Vector2(71.0, 19.0), 2))
		if cover <= 0.0:
			continue
		var x := int(number.x) * 16
		var y := int(number.y) * 16
		for puff in 9:
			var at := (number + Vector2(0.5, 0.5)) * CLOUD_CELL + adrift + (Vector2(Terrain.cell_hash(x + puff * 3, y + 5), Terrain.cell_hash(x + puff * 3 + 1, y + 6)) - Vector2(0.5, 0.5)) * CLOUD_CELL * 0.62
			var radius := (24.0 + 30.0 * Terrain.cell_hash(x + puff * 3 + 2, y + 7)) * cover
			var beside := Vector2(place.x, place.z).distance_to(at) / radius
			if beside > 1.6:
				continue
			var base := maxf(Terrain.SEA + 135.0 + 50.0 * Terrain.cell_hash(x + 9, y + 9) + 14.0 * Terrain.cell_hash(x + puff * 3 + 3, y + 8), Terrain.surface(at) + 50.0)
			var over := (place.y - base) / radius / (0.25 if place.y < base else 0.6)
			deep = maxf(deep, 1.6 - sqrt(beside * beside + over * over))
	return clampf(deep * 1.3, 0.0, 1.0)


## How much of a season it is, between 0 and 1: all of it within a tenth of a year of its
## middle, none of it a quarter of a year away.
func season_share(middle: float) -> float:
	return 1.0 - smoothstep(0.1, 0.25, absf(fposmod(year - middle + 0.5, 1.0) - 0.5))


## The light of the hour: the sun's arc, then the moon's, in one light.
func set_day() -> void:
	# The sun's arc is the flyover's at the place the flight started; the planet turns under
	# it, so elsewhere it is another hour, and from high up the sun is seen over the planet's
	# rim after the ground below has lost it.
	var angle := TAU * (day - 0.25)
	var sun_of_planet := sun_frame * Vector3(cos(angle), sin(angle) * 0.85, 0.42).normalized()
	var here := Vector2(flyer.position.x, flyer.position.z)
	var to_sun := (Terrain.anchor * Terrain.chart_frame(here)).transposed() * sun_of_planet
	var height := to_sun.y
	var dip := acos(Terrain.RADIUS / (Terrain.RADIUS + maxf(flyer.position.y + lowered, 0.0)))
	var seen := sin(minf(asin(clampf(height, -1.0, 1.0)) + dip, PI / 2.0))
	var out_of_air := 1.0 - exp(-maxf(flyer.position.y + lowered, 0.0) / AIR)
	var sunlight := smoothstep(-0.04, 0.12, seen)
	var low_sun := smoothstep(-0.25, 0.0, height) * (1.0 - smoothstep(0.05, 0.45, height))
	var night := smoothstep(0.02, 0.3, -height)
	var warm := Color(1.0, 0.42, 0.18).lerp(Color(1.0, 0.95, 0.86), smoothstep(0.0, 0.45, seen))
	var to_light := to_sun if seen > -0.06 else -to_sun
	sun.basis = Basis.looking_at(-to_light)
	if seen > -0.06:
		sun.light_color = warm
		sun.light_energy = 1.9 * sunlight
	else:
		# From out of the air the night side is dark but for its towns: the moon's light is the ground's.
		sun.light_color = Color(0.45, 0.6, 1.0)
		sun.light_energy = 0.7 * smoothstep(0.1, 0.35, -height) * lerpf(1.0, 0.1, out_of_air)
	# The seasons: each a share that rises and falls around its place in the year.
	tell("spring", season_share(0.1))
	tell("autumn", season_share(0.55))
	tell("winter", season_share(0.85))
	sky_material.set_shader_parameter("sun_direction", to_sun)
	sky_material.set_shader_parameter("sun_colour", warm)
	tell("night", night)
	night_share = night
	tell("to_light", to_light)
	tell("sun_way", Terrain.anchor.transposed() * sun_of_planet)
	sky_material.set_shader_parameter("sun_seen", seen)
	tell("handover", smoothstep(0.0, 0.1, absf(seen + 0.06)))
	environment.ambient_light_color = Color(0.85, 0.82, 0.78).lerp(Color(0.15, 0.22, 0.5), night)
	environment.ambient_light_energy = lerpf(1.0, 0.55, night) * lerpf(1.0, 0.12, out_of_air)
	environment.volumetric_fog_albedo = Color(0.75, 0.82, 1.0).lerp(warm, 0.5)
	# Mist lies low at dawn, and a little at dusk: the haze over the sea thickens, and the banks
	# of mist with it. The clouds take the light's colour and the sky's.
	var dawn := smoothstep(-0.1, 0.03, height) * (1.0 - smoothstep(0.08, 0.42, height)) * (1.0 if day < 0.5 else 0.4)
	mist_density = lerpf(0.006, 0.022, dawn)
	for bank in clouds:
		var cloud := bank.material_override as ShaderMaterial
		cloud.set_shader_parameter("thick", 0.2 + 0.8 * dawn)
		cloud.set_shader_parameter("light", (warm * (0.25 + 0.75 * sunlight)).lerp(Color(1.4, 0.55, 0.2), low_sun * 0.8).lerp(Color(0.2, 0.26, 0.42), night))
		cloud.set_shader_parameter("shade", Color(0.5, 0.56, 0.7).lerp(Color(0.32, 0.2, 0.42), low_sun * 0.85).lerp(Color(0.02, 0.03, 0.07), night))
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
	print("PLANET level %d scale %.2f gpu %.1f" % [level, LEVELS[level][0], RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())])
	print("PLANET seconds %.1f frames %d fps %.1f gpu %.1f cpu %.1f flown %d beacons %d" % [elapsed, frames, steady * 1000.0 / (Time.get_ticks_msec() - steady_from), gpu_milliseconds / steady, cpu_milliseconds / steady, int(flown), scored + lit.size()])
	print("PLANET highest %d anchors %d" % [int(highest), anchors])
	# How even the frames were: a hitch is a frame of over twice the median.
	frame_milliseconds.sort()
	var median := frame_milliseconds[steady / 2]
	print("PLANET frame times median %.1f p99 %.1f max %.1f hitches %d" % [median, frame_milliseconds[steady * 99 / 100], frame_milliseconds[-1], steady - frame_milliseconds.bsearch(median * 2.0, false)])
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
		print("PLANET frame %dx%d sky %d colours %d" % [image.get_width(), image.get_height(), sky, colours.size()])
	leave()
