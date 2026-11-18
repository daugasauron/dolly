extends Node3D
## Voxel Flyover: a flight over a planet that can be left. A corgi on a jet surfboard,
## a pelican on a bicycle pedalling under it for the jets, flies over a world that is a sphere of
## 600,000 units: the land runs on to a curved horizon, and a board that keeps climbing leaves
## the air and sees the planet whole. It flies as a fighter does, and courses of rings to fly
## through lie where the flying is good. The world is a function (terrain.gdshaderinc): the GPU
## draws its ground into textures as the flight goes, raises grids of land to it and stands
## trees on it. The game computes in a flat chart around an anchor on the planet, and the
## shaders carry every vertex onto the sphere (terrain.gdshaderinc's lift).
##
## `-- --autopilot SECONDS` flies by itself, prints its frame rate, how even its frames were, the
## time a frame took and what the frame shows, and quits: Dolly's test uses it. `--day HOUR`
## starts at that hour of 24, and `--tour SECOND` leaves the planet at that second of a flight by
## itself, looks at it from 900,000 units up (`--top`), and comes back; `--high HEIGHT` starts
## a flight by itself at that height and keeps it; `--ring SIDE` starts it before a ring of the
## course nearest the start, headed through it along the course's way (1) or against it (-1).
## Q prints how far the flight went, the rings, and how the board was flying.

const Terrain := preload("res://terrain.gd")
const Landmarks := preload("res://landmarks.gd")
const Parts := preload("res://parts.gd")
const Pelican := preload("res://pelican.gd")
const Touch := preload("res://touch.gd")
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
const CRUISE := 30.0 # the speed the corgi flies itself at, and the start's
## The board flies as an arcade's fighter does (handle): the stick pitches and rolls it, the
## rudder yaws it, the throttle sets the thrust. In level flight a full throttle holds 50 units
## a second against the drag; a climb costs speed and a dive gives it.
const GRAVITY := 9.8
const THRUST := 10.0 # units a second each second, at a full throttle
const DRAG := 0.004 # times the speed squared
const LIFT_SPEED := 22.0 # under it the wings lift less than the board weighs, and its nose falls
const PITCH_RATE := 1.2 # radians a second with the stick all the way, at a speed of 28 and over
const ROLL_RATE := 2.6
const YAW_RATE := 0.5
const STICK_PIXELS := 150.0 # the mouse's way that pushes the stick all the way
const STICK_BACK := 0.3 # seconds in which the stick springs back to the middle by 1/e
const CEILING := 420.0 # the flight by itself stays under it
const SOARS_FROM := 420.0 # over this height, the flyover's ceiling, the board is faster the higher it is
const SOARS_BY := 110.0 # twice as fast this far over it, and so on: every 8 s of climbing multiply the height by e, and space is 80 s from the ground
const SPACE := 1.4e6 # the highest the board goes: the planet is a disc of 35 degrees from there
const AIR := 7000.0 # the height over which the air thins to 1/e (sky.gdshader's)
const LOWERED_STEP := 8192.0
const ANCHOR_FROM := 8000.0 # the chart's anchor moves only over this height, where nothing that stands on its lattice is seen
const ANCHOR_REACH := 120000.0 # and only once the flyer is this far from it
const RING_PLOT := 300.0 # a plot of the world has one course of rings at most
enum { CLIMB, VALLEY, COAST, OPEN_SEA, STREET } # the kinds of course (course_start)
const CHAIN_TIME := 3.0 # seconds from a ring to the next for a chain to go on; 0.1 less for each ring of it, to 2
const RING_BOOST := 8.0 # what a ring adds to the speed, and 1.5 more for each ring of its chain before it, to 12 more
const NO_RING := Vector3i(0, 0, -1)
## Where on the planet the flight starts: on the equator at this longitude (radians), the chart's
## z toward the north pole. The sun goes round the pole, so the chart's x is east.
const START_LONGITUDE := 1.3177
const START := Vector2.ZERO
const WAKE := 64 # the places the wakes keep
const WAKE_APART := 1.2
## The camera's views: where it stands in the flyer's frame, what it aims at, its angle of view,
## and for how many seconds the flight by itself holds it. The first is the player's: from
## behind and over the flyer it looks the way the board is headed, so what the board will
## reach is in the middle of the screen, over the corgi's ears. By itself the camera shows the
## world, from wide views behind, beside, above and ahead of the flyer, and comes close to the
## flyers for a few seconds a round.
const SHOTS := [
	[Vector3(0, 5.0, 15.0), Vector3(0, 5.0, -200.0), 66.0, 0.0],
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
	[0.27, false, false, false, DirectionalLight3D.SHADOW_ORTHOGONAL, 90.0, 5, 2],
]
const FRAME_BUDGET := 14.0 # milliseconds of the GPU: over it the display's 60 a second are lost
const LATE := 21.0 # milliseconds: a frame this long missed one of the display's

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
var rings_run := false # the shaders have been told of passed rings' light on the ground
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
var touch := Touch.new() # the controls on a touchscreen
var title := Label.new()
var hint := Label.new()
var score := Label.new()
var streak := Label.new() # the chain going on, under the score
var gain := Label.new() # what the last ring added to the score
var engine := AudioStreamPlayer.new()
var bell := AudioStreamPlayer.new()
var patter := AudioStreamPlayer.new() # the rain
var wash := AudioStreamPlayer.new() # the sea under a low flight
var chimes: Array[AudioStreamWAV] = [] # a note for each ring of a chain, made before the flight
var leaving := false # after Q, or a flight by itself that has ended
var chains := {} # plot -> its course of rings (course_step), for the plots around the flyer
var laying := {} # the course being laid, a ring a frame
var near_first: Array[Vector2i] = [] # the 25 plots around the flyer's, the nearest first
var hoops := MultiMesh.new() # every ring of `chains`
var laid := PackedFloat32Array() # its instances, 20 numbers each (lay_rings)
var hoop_of := {} # a ring (plot, and its place in the course as z) -> its instance of `hoops`
var burst := MeshInstance3D.new() # the ring of light that leaves a ring as it is passed
var burst_at := -100.0
var points := 0 # the score: each ring passed counts as many as the rings of its chain so far
var passes := 0 # the rings passed
var against := 0 # of them, flown through against their course's way
var chain := 0 # the rings passed one after another, each in time for the next
var chain_ends := 0.0 # the clock when it is over unless another ring is passed
var longest := 0 # the longest chain of the flight
var onward := NO_RING # the next ring of the course the chain is in, the way it is flown
var gained_at := -100.0 # the clock when the last ring was passed, for the words that show it
var scraped := false # the board touched the ground or a roof this frame
var glints: Array[Vector4] = [] # the last eight rings passed, the newest first: where (x, y) and the clock then (z)
var was := Vector3.ZERO # where the flyer was a frame ago
var speed_lines := ShaderMaterial.new() # the streaks of the air at speed
var flock := MultiMeshInstance3D.new() # birds that fly along with the board for a while
var flock_at := Vector3.ZERO # where their leader is
var flock_with := 0.0 # how long they have flown with the board
var birds: Array[Vector3] = []
var lit := {} # the rings passed in this chart: plot, and the ring's place in its chain as z

var helm := false # the player's, after a click or a touch
var captured := false # the pointer, which the page gives the game at a click
var steer := Vector2.ZERO # the way the mouse has gone since the last frame, in pixels
var steers_from := 0.0 # the mouse steers from then on, a moment after its capture
var attitude := Basis(Vector3.UP, -PI / 2.0) # the board's axes: its nose is -z, east at the start
var stick := Vector2.ZERO # x rolls to the right, y pitches the nose up; within a circle of 1
var rudder := 0.0 # yaws the nose to the right
var throttle := 0.36 # of the thrust: the cruise's in level flight
var pitch := 0.0 # of the nose: up from level, in radians
var trail := Vector3.ZERO # the flyer's place as the camera follows it, a little late
var seen := Basis(Vector3.UP, -PI / 2.0) # the axes the camera follows, on their way to the board's
var rush := 0.0 # the speed's share over the cruise, evened: the streaks and the angle of view widen with it
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
var heading := PI / 2.0 # of the nose, around from north: east, along the coast
var turn := 0.0 # how fast the heading turns, a share of 0.55 radians a second
var climb := 0.0
var speed := CRUISE
var flown := 0.0
var view: Vector3 = SHOTS[0][0]
var aim: Vector3 = SHOTS[0][1]
var view_led: Vector3 = view # what the view follows on its way to the next: it sets off gently
var aim_led: Vector3 = aim
var fov_led := 66.0
var fov_seen := 66.0 # the angle of view on its way there
var autopilot_seconds := 0.0
var elapsed := 0.0
var step := 1.0 / 60.0 # of the flight, a frame: the last frames' time, evened
var frames := 0
var steady_from := 0
var gpu_milliseconds := 0.0
var cpu_milliseconds := 0.0
var frame_began := 0
var level := 0
var coats: Array[MultiMeshInstance3D] = [] # the fur's and feathers' shells
var timed_frames := 0 # the frames the GPU has been timed for; -1 while it is not timed
var timed_for := 0.0 # and the seconds
var gpu_cost := INF # the least of their milliseconds
var second_ends := 1.0 # the second whose late frames are being counted
var second_frames := 0
var late_frames := 0
var asks_after := 0.0 # late frames next have the GPU timed after this,
var climbs_after := 0.0 # and a level under the first after this
var held := false # a level has held: the adapter's is found
var tried_from := 0.0 # the answer at the level below, while the level above it is tried
var dearer: Array[float] = [1.2, 2.7, 1.8, 1.2, 1.15, 2.0] # what a level costs, in the next one's: as measured on two adapters, until this one tells
var reporting := false # a flight by itself is timing the GPU for its report
var reported_frames := 0
var steady_seconds := 0.0
var frame_milliseconds := PackedFloat32Array() # each steady frame's, for a flight by itself


func option(name: String, otherwise: float) -> float:
	var arguments := OS.get_cmdline_user_args()
	var at := arguments.find(name)
	return arguments[at + 1].to_float() if at >= 0 and at + 1 < arguments.size() else otherwise


func _ready() -> void:
	# A screen held upright (a phone's): the game fills it, in its shape, with no more pixels than
	# 1080 by 1920 and no taller than a surface of gpu@0 may be. A screen that lies on its side keeps
	# the game's 1920 by 1080, which the page fits into it.
	var page := DisplayServer.screen_get_size()
	if page.x > 0 and float(page.y) / page.x > 1.1:
		var fit := minf(1.0, minf(sqrt(1080.0 * 1920.0 / float(page.x * page.y)), 2304.0 / page.y))
		get_window().size = Vector2i(maxi(int(page.x * fit) / 2 * 2, 2), maxi(int(page.y * fit) / 2 * 2, 2))
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
			# A ring's lots: its two rows, and its two columns between them.
			for at in range(-ring - 1, ring + 1):
				for edge: int in [-ring - 1, ring]:
					rings.append_array([1, 0, 0, (at + 0.5) * Terrain.LOT, 0, 1, 0, 0, 0, 0, 1, (edge + 0.5) * Terrain.LOT])
					if at != -ring - 1 and at != ring:
						rings.append_array([1, 0, 0, (edge + 0.5) * Terrain.LOT, 0, 1, 0, 0, 0, 0, 1, (at + 0.5) * Terrain.LOT])
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
	build_rings()
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
	if option("--ring", 0.0) != 0.0:
		start_at_ring(option("--ring", 0.0))
	baked.shader = preload("res://baked.gdshader")
	materials.append(baked)
	# Every kind of landmark and of town's tower is built once here: a kind's first build reads its
	# parts' shapes back from the GPU (Parts.arrays_of), which was a frame of 100 ms in the flight
	# that came upon it.
	for kind in 22:
		Landmarks.build([Vector2.ZERO, 0.0, kind if kind < 14 else Terrain.TOWER, maxi(kind - 14, 0), 30.0, 10.0, 0.5], baked).free()
	warm_up()
	trail = flyer.position
	was = flyer.position
	camera.position = flyer.position + view
	wake.resize(WAKE)
	wake.fill(flyer.position)
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	for coat in flyer.find_children("*", "MultiMeshInstance3D", true, false):
		coats.append(coat)
	set_level(int(option("--level", 0.0)))
	if autopilot_seconds <= 0.0:
		# The page gives the pointer at a click, and takes it back at Escape.
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.emulate_touch_from_mouse else Input.MOUSE_MODE_CAPTURED
	else:
		print("FLYOVER adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())


## Sets what the adapter draws (LEVELS).
func set_level(to: int) -> void:
	level = clampi(to, 0, LEVELS.size() - 1)
	if autopilot_seconds > 0.0:
		print("FLYOVER level %d at %.1f s" % [level, elapsed])
	var what: Array = LEVELS[level]
	get_viewport().scaling_3d_scale = what[0]
	get_viewport().msaa_3d = Viewport.MSAA_4X if what[1] else Viewport.MSAA_DISABLED
	get_viewport().screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED if what[1] else Viewport.SCREEN_SPACE_AA_FXAA
	environment.volumetric_fog_enabled = what[2]
	environment.ssao_enabled = what[3]
	sun.directional_shadow_mode = what[4]
	sun.directional_shadow_max_distance = what[5]
	# The weakest level has no shadows of the sun: they are the 2 ms a frame that an even 30 a
	# second on an integrated GPU lacks since the world is a planet.
	sun.shadow_enabled = level < LEVELS.size() - 1
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


## Times the GPU from the next frame on, or no longer.
func time_gpu(on: bool) -> void:
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), on or reporting)
	timed_frames = 0 if on else -1
	timed_for = 0.0
	gpu_cost = INF


## Follows what the adapter manages (LEVELS). A frame whose GPU time is asked for waits for the
## GPU (Godot reads its timestamps back), which takes a fast adapter from 56 frames a second to
## 35: so the GPU is timed only for an answer. At the start; when most of a second's frames
## came late; and below the first level every ten seconds, for whether the level above would
## fit. The answer is the least of fourteen frames: another program on the GPU makes frames
## long, not every one of them, and the picture does not change for that. At the start the
## game goes down while the answer is over the budget (more levels when far over). Once a
## level has held, it is left only for an answer half as much again over the budget: the game
## is rather slower than softer. Under the last level the rate is held even at what the
## adapter draws. A level up is tried when the answer, times what that level costs more, is
## under the budget; a level that then proves too much has told what it costs, and is tried
## again when that would fit. Where the browser has no GPU timer, the time between frames
## stands in.
func pace(delta: float) -> void:
	if timed_frames < 0:
		second_frames += 1
		late_frames += int(delta * 1000.0 > LATE)
		if elapsed < second_ends:
			return
		var late := late_frames * 2 > second_frames
		second_ends = elapsed + 1.0
		second_frames = 0
		late_frames = 0
		if (late and elapsed > asks_after) or (level > 0 and elapsed > climbs_after):
			time_gpu(true)
		return
	timed_frames += 1
	timed_for += delta
	# The first frames' answers are of the frames before.
	if timed_frames > 6:
		var gpu := RenderingServer.viewport_get_measured_render_time_gpu(get_viewport().get_viewport_rid())
		gpu_cost = minf(gpu_cost, gpu if gpu > 0.0 else maxf(delta * 1000.0 - 6.0, 0.0))
	if timed_frames < 20 and (timed_frames < 10 or timed_for < 1.5):
		return
	var last := LEVELS.size() - 1
	var down := level
	if level < last and gpu_cost > FRAME_BUDGET * (1.5 if held and tried_from == 0.0 else 1.0):
		down = level + (1 if tried_from > 0.0 else 4 if gpu_cost > FRAME_BUDGET * 8.0 else 3 if gpu_cost > FRAME_BUDGET * 5.0 else 2 if gpu_cost > FRAME_BUDGET * 2.5 else 1)
		if remakes(down):
			down = 1
	if down != level:
		if tried_from > 0.0:
			dearer[level] = gpu_cost / tried_from
		set_level(down)
		tried_from = 0.0
		time_gpu(true)
		return
	held = true
	tried_from = 0.0
	# Even at the rate the adapter holds: a half, a third or a quarter of the display's.
	Engine.max_fps = 0 if level < last or gpu_cost <= FRAME_BUDGET else 30 if gpu_cost < (27.0 if Engine.max_fps == 30 else 24.0) else 20 if gpu_cost < 36.0 else 12
	if level > 0 and gpu_cost * dearer[level - 1] < FRAME_BUDGET * 0.9 and elapsed > climbs_after and not remakes(level - 1):
		tried_from = gpu_cost
		set_level(level - 1)
		time_gpu(true)
		return
	asks_after = elapsed + 30.0
	climbs_after = elapsed + 10.0
	second_ends = elapsed + 1.0
	time_gpu(false)


## Whether going to that level now would make every pipeline anew. From the third level on a
## pixel has one sample where it had four, and a pipeline is made for its samples: the first
## change between the two was 5.8 s without a frame in Chrome. It is made in a flight's first
## ten seconds, among its loading, and not after: the game stays on the side it is on.
func remakes(to: int) -> bool:
	return elapsed > 10.0 and (level < 2) != (to < 2)


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
		print("FLYOVER rebake at frame ", planet_frames)
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
	for note: int in [0, 2, 4, 7, 9, 12, 14, 16, 19]:
		chimes.append(chime(440.0 * pow(2.0, note / 12.0)))
	add_child(bell)


## The corgi rides the board: it crouches lower the faster it goes and the harder it turns, leans
## and looks into its turns, and the air lays back its ears, cape and coat.
func ride(delta: float) -> void:
	var fast := speed / CRUISE
	# The pelican pedals for the thrust: as fast as the throttle is open.
	var effort := 0.4 + 1.6 * throttle
	flutter += delta * fast
	pelican.pedal(delta, effort, turn)
	var crouch := clampf(0.05 + 0.14 * (fast - 1.0) + 0.12 * absf(turn) + 0.015 * sin(elapsed * 2.1), 0.0, 0.3)
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
		flame.scale.y = flame.scale.x * (1.4 + 1.4 * effort) * (0.88 + 0.24 * push)
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
	for label: Label in [title, hint, score, streak, gain]:
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
	# The score: the rings passed, beside a ring.
	score.add_theme_font_size_override("font_size", 44)
	score.position = Vector2(84, 26)
	var ring := Line2D.new()
	for corner in 25:
		ring.add_point(Vector2.from_angle(corner * TAU / 24.0) * 17.0)
	ring.width = 5.0
	ring.default_color = Color(1.0, 0.62, 0.15)
	ring.position = Vector2(52, 58)
	hud.add_child(ring)
	# The chain going on, in amber under the score (touch.gd draws its time left around the ring),
	# and what a ring added, over the middle of the screen.
	streak.add_theme_font_size_override("font_size", 34)
	streak.add_theme_color_override("font_color", Color(1.0, 0.72, 0.3))
	streak.position = Vector2(34, 92)
	gain.add_theme_font_size_override("font_size", 40)
	gain.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	gain.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	gain.grow_horizontal = Control.GROW_DIRECTION_BOTH
	gain.modulate.a = 0.0
	# The air at speed, over the scene and under the words; it takes no part in the mouse.
	var streaks := ColorRect.new()
	streaks.set_anchors_preset(Control.PRESET_FULL_RECT)
	streaks.mouse_filter = Control.MOUSE_FILTER_IGNORE
	speed_lines.shader = preload("res://speed.gdshader")
	streaks.material = speed_lines
	hud.add_child(streaks)
	hud.move_child(streaks, 0)
	touch.game = self
	hud.add_child(touch)
	# With --touch the mouse is a finger, for trying the touch controls at a desk.
	Input.emulate_touch_from_mouse = option("--touch", 0.0) > 0.0
	show_helm()


func show_helm() -> void:
	title.visible = not helm and autopilot_seconds <= 0.0
	hint.visible = autopilot_seconds <= 0.0
	hint_until = elapsed + 9.0
	helm_shown = helm
	if touch.active:
		# A phone's screen is small: larger words, in lines that fit it upright.
		hint.add_theme_font_size_override("font_size", 38)
		hint.text = "The corgi flies itself.\nA touch takes the board." if not helm \
			else "Left thumb: throttle    Right thumb: stick\nChain the rings    Two fingers: zoom\nKeep climbing to leave the planet"
		return
	hint.text = "The corgi flies itself. A click or a touch takes the board.    Q: quit" if not helm \
		else "Mouse or arrows: pitch and roll    A D: rudder    W S: throttle    Wheel: zoom\nChain the rings, each in time for the next    Climb to leave the planet    T: hours    Esc: let go    Q: quit"


func _input(event: InputEvent) -> void:
	if autopilot_seconds > 0.0:
		return
	# A browser may report the pointer's way to where it was captured as its first motion: the
	# first moments' are left.
	if event is InputEventMouseMotion and captured and elapsed > steers_from:
		steer += (event as InputEventMouseMotion).relative
	if event is InputEventScreenTouch:
		touch.touched(event)
		if helm != helm_shown:
			show_helm()
	elif event is InputEventScreenDrag:
		touch.dragged(event)
	if event is InputEventMouseButton and event.pressed:
		match (event as InputEventMouseButton).button_index:
			MOUSE_BUTTON_WHEEL_UP:
				zoom = maxf(zoom / 1.12, 0.45)
			MOUSE_BUTTON_WHEEL_DOWN:
				zoom = minf(zoom * 1.12, 3.2)
	if not (event is InputEventKey and event.pressed and not event.echo):
		return
	match (event as InputEventKey).physical_keycode:
		KEY_ESCAPE:
			helm = false
		KEY_Q:
			print("FLYOVER flown %d rings %d score %d helm %d high %d heading %d pitch %d bank %d speed %d throttle %.2f zoom %.2f touches %d" % [int(flown), passes, points, int(helm), int(flyer.position.y + lowered), int(rad_to_deg(heading)), int(rad_to_deg(pitch)), int(rad_to_deg(bank())), int(speed), throttle, zoom, touch.touches])
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
	steers_from = elapsed + 0.25
	helm = captured
	show_helm()


## Quits once the mixer has let go of the sounds, which Godot counts as leaked otherwise; no
## ring chimes meanwhile.
func leave() -> void:
	leaving = true
	engine.stop()
	bell.stop()
	patter.stop()
	wash.stop()
	await get_tree().create_timer(0.3).timeout
	get_tree().quit()


func _process(delta: float) -> void:
	pace(delta)
	# The page shows the frames evenly, one at each of the display's, but they are made unevenly:
	# one waits for room in the GPU's queue and the next does not. A step of the flight is so
	# the time of the last frames together, and what moves, moves evenly.
	step = lerpf(step, minf(delta, 0.1), 0.1)
	delta = step
	elapsed += delta
	hold_pointer()
	var hours := 8.0 if helm and Input.is_physical_key_pressed(KEY_T) else 1.0
	day = fposmod(day + delta * hours / DAY_SECONDS, 1.0)
	year = fposmod(year + delta * hours / DAY_SECONDS / YEAR_DAYS, 1.0)
	tell("clock", elapsed)
	draw_planet()
	fly(delta)
	set_day()
	# What lives near the ground has gone by degrees by 5,000 units up (the trees and towns
	# under the haze, the low clouds, rings and landmarks by their height's share), and is
	# not drawn from over 9,000.
	if flyer.position.y + lowered < 6000.0:
		tend_rings()
		tend_landmarks()
	else:
		let_go()
	ground_life.visible = flyer.position.y + lowered < (9000.0 if ground_life.visible else 8000.0)
	flock.visible = flyer.position.y + lowered < (2600.0 if flock.visible else 2000.0)
	follow(delta)
	speed_lines.set_shader_parameter("rush", rush)
	speed_lines.set_shader_parameter("clock", elapsed)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	hint.modulate.a = clampf(hint_until - elapsed, 0.0, 1.0)
	show_score(delta)
	if autopilot_seconds > 0.0:
		watch()


## The score swells as a ring is passed, what the ring added rises from the middle of the screen
## and fades, and the chain going on shows under the score until it is over.
func show_score(delta: float) -> void:
	shown_score = lerpf(shown_score, points, 1.0 - exp(-delta * 6.0))
	score.text = str(points)
	score.scale = Vector2.ONE * (1.0 + 0.5 * sin(PI * clampf((points - shown_score) / maxf(chain, 1.0), 0.0, 1.0)))
	var since := elapsed - gained_at
	gain.modulate.a = 1.0 - smoothstep(0.5, 1.2, since)
	gain.position.y = get_viewport().get_visible_rect().size.y * 0.36 - 40.0 * smoothstep(0.0, 1.2, since)
	var going := elapsed < chain_ends and chain > 1
	if going:
		streak.text = "chain %d" % chain
	streak.modulate.a = move_toward(streak.modulate.a, 1.0 if going else 0.0, delta * (8.0 if going else 1.5))
	touch.chain_left = clampf((chain_ends - elapsed) / chain_time(chain), 0.0, 1.0) if chain > 0 else 0.0


func fly(delta: float) -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var alt := flyer.position.y + lowered
	var soar := 1.0 + maxf(alt - SOARS_FROM, 0.0) / SOARS_BY
	var was_heading := heading
	orient()
	turn = lerpf(turn, clampf(wrapf(heading - was_heading, -PI, PI) / maxf(delta, 0.001) / 0.55, -1.0, 1.0), 1.0 - exp(-delta * 6.0))
	var forward := Vector3(sin(heading), 0.0, -cos(heading))
	# What stands on the way, along the turn the board is in: the highest of it, and the climb
	# that clears all of it in the time the board takes to reach it. The flight by itself looks a
	# second and a half ahead, the player's hand is helped for the last 0.7 s.
	var ground := 0.0
	var must := -INF
	var under := INF
	for step in (6 if helm else 12):
		var time := step * 0.14
		var way := heading + turn * 0.55 * time / 2.0
		if alt > 3000.0:
			break
		var ahead := here + Vector2(sin(way), -cos(way)) * speed * cos(pitch) * soar * time
		var top := Terrain.roof(ahead)
		# An island that floats on the way is passed over or under, by where the board is.
		var isle := Terrain.island(ahead)
		if isle != Vector2.ZERO:
			if alt > (isle.x + isle.y) / 2.0:
				top = maxf(top, isle.y)
			else:
				under = minf(under, isle.x)
		ground = maxf(ground, top)
		must = maxf(must, (top + 5.0 - alt) / maxf(time, 0.25))
	# Low over the sea the board skims, and dolphins come up beside it and leap along with it.
	var over_sea := Terrain.ground(here) < Terrain.SEA
	skim = lerpf(skim, smoothstep(13.0, 8.5, alt - Terrain.SEA) if over_sea else 0.0, 1.0 - exp(-delta * 3.0))
	tell("skims", Vector3(flyer.position.x, flyer.position.z, skim))
	pod_out = move_toward(pod_out, 1.0 if skim > 0.5 else 0.0, delta * 0.5)
	for index in pod.size():
		var one := pod[index]
		var phase := elapsed * 2.2 + index * 1.9
		var at := flyer.position + Vector3(-forward.z, 0, forward.x) * (index % 2 * 2 - 1) * (10.0 + 4.0 * (index / 2)) - forward * (5.0 * index - 14.0)
		one.visible = pod_out > 0.0 and Terrain.ground(Vector2(at.x, at.z)) < Terrain.SEA - 2.5
		one.position = Vector3(at.x, Terrain.SEA - 1.6 + 3.4 * sin(phase) * pod_out - 4.0 * (1.0 - pod_out), at.z)
		one.rotation = Vector3(cos(phase) * 0.7, -heading, 0)
	fly_flock(delta, forward)
	if helm:
		steer_by_hand(delta)
	else:
		fly_itself(delta, alt, ground, must if under == INF else -INF, under, forward)
	steer = Vector2.ZERO
	handle(delta)
	# The ground pushes the nose up before it is reached: in the player's hands, as late as that,
	# it is a scrape.
	var nose := -attitude.z
	scraped = false
	if under == INF and must > speed * nose.y:
		var needed := asin(clampf(must / speed, -0.9, 0.95)) - asin(clampf(nose.y, -1.0, 1.0))
		var across := nose.cross(Vector3.UP)
		if across.length() > 0.05:
			attitude = Basis(across.normalized(), needed * (1.0 - exp(-delta * 12.0))) * attitude
		scraped = helm and needed > 0.25
	nose = -attitude.z
	climb = speed * nose.y
	flown += speed * delta
	# High up a step is `soar` times longer: the one place the board is faster, by its height
	# alone. What follows the flyer (the camera, the wakes, the birds) is carried along by all
	# of the step but the board's own, so up there they see the board fly as it does below,
	# and the planet turn under it.
	var stride := nose * speed * delta
	was = flyer.position
	flyer.position += stride * soar
	carry(stride * (soar - 1.0))
	# The board does not go under ten units over the ground or the sea: held there, its nose comes
	# level, and if it came down onto it, it scraped.
	var least := Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 10.0 - lowered if alt < 3000.0 else -INF
	if flyer.position.y < least:
		flyer.position.y = least
		if nose.y < 0.0:
			attitude = Basis(nose.cross(Vector3.UP).normalized(), -asin(nose.y) * (1.0 - exp(-delta * 8.0))) * attitude
			scraped = scraped or (helm and climb < -4.0)
	# A scrape ends the chain and costs speed.
	if scraped:
		speed -= 12.0 * delta
		chain_ends = minf(chain_ends, elapsed)
	attitude = attitude.orthonormalized()
	orient()
	# No ceiling but space's: the board climbs out of the air, and the planet falls away.
	flyer.position.y = minf(flyer.position.y, SPACE - lowered)
	keep_low()
	move_anchor()
	highest = maxf(highest, flyer.position.y + lowered)
	flyer.quaternion = attitude.get_rotation_quaternion()
	engine.pitch_scale = 0.75 + 0.25 * throttle + speed / CRUISE * 0.2
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
	tell("realm_near", Terrain.realm(over_ground))
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


## The heading and the pitch of the board's nose.
func orient() -> void:
	var nose := -attitude.z
	if Vector2(nose.x, nose.z).length() > 0.01:
		heading = atan2(nose.x, -nose.z)
	pitch = asin(clampf(nose.y, -1.0, 1.0))


## How far the board is rolled to the right, in radians, from wings level: to PI on its back.
func bank() -> float:
	return atan2(-attitude.x.y, attitude.y.y)


## The board flies as an arcade's fighter does. The stick turns it about its own axes, pitch and
## roll, and the rudder yaws it, as fast as its speed allows. It flies the way its nose points,
## at a speed that the thrust raises, the air's drag lowers, a climb costs and a dive gives. Its
## wings' lift bends its way toward the board's top, as much as its weight bends it across its
## way toward the ground: with the wings level and the stick in the middle it flies straight;
## banked, the lift turns it and the nose drops a little; slower than LIFT_SPEED the lift is less
## and the nose falls, and a board that hangs nose up tips over.
func handle(delta: float) -> void:
	var authority := clampf(speed / 28.0, 0.3, 1.0)
	var spin := Vector3(stick.y * PITCH_RATE, -rudder * YAW_RATE, -stick.x * ROLL_RATE) * authority * delta
	if spin.length() > 0.0:
		attitude = attitude * Basis(spin.normalized(), spin.length())
	var nose := -attitude.z
	var weight := Vector3.DOWN * GRAVITY
	speed = maxf(speed + (THRUST * throttle - DRAG * speed * speed + weight.dot(nose)) * delta, 5.0)
	var lifts := sqrt(maxf(1.0 - nose.y * nose.y, 0.0)) * minf(speed * speed / (LIFT_SPEED * LIFT_SPEED), 1.0)
	var bends := attitude.y * GRAVITY * lifts + weight - nose * weight.dot(nose)
	var by := bends.length() * delta / maxf(speed, 8.0)
	if by > 1e-6 and nose.cross(bends).length() > 1e-6:
		attitude = Basis(nose.cross(bends).normalized(), by) * attitude
	if speed < 12.0 and nose.y > 0.7:
		attitude = attitude * Basis(Vector3.RIGHT, -(12.0 - speed) / 12.0 * 1.5 * delta)


## The player's hand. The mouse pushes the stick, which springs back to the middle, and so do the
## arrows; a thumb on a touchscreen holds it where it is, and sets the throttle (touch.gd). A and
## D are the rudder, W and S open and close the throttle.
func steer_by_hand(delta: float) -> void:
	if touch.holds_stick():
		stick = touch.stick
	else:
		var keys := Vector2(key_axis(KEY_LEFT, KEY_RIGHT), key_axis(KEY_DOWN, KEY_UP))
		stick = (stick + Vector2(steer.x, -steer.y) / STICK_PIXELS + keys * delta * 5.0).limit_length(1.0) * exp(-delta / STICK_BACK)
	rudder = lerpf(rudder, key_axis(KEY_A, KEY_D), 1.0 - exp(-delta * 6.0))
	throttle = clampf(throttle + key_axis(KEY_S, KEY_W) * delta * 0.5, 0.0, 1.0)


func key_axis(minus: Key, plus: Key) -> float:
	return float(Input.is_physical_key_pressed(plus)) - float(Input.is_physical_key_pressed(minus))


## The corgi flies itself: a wandering course at a steady height over the ground ahead, by way
## of the rings, or the tour off the planet and back. It aims the board as a hand would, and
## opens the throttle for the speed it wants.
func fly_itself(delta: float, alt: float, ground: float, must: float, under: float, forward: Vector3) -> void:
	var wanted_turn := 0.0
	var wanted_climb := 0.0
	var wanted_speed := CRUISE
	var aim := Vector3.ZERO
	if tour_phase > 0:
		# The tour: up until the planet is whole, a look around it, and down again.
		wanted_turn = 0.25 if tour_phase == 2 else 0.0
		wanted_climb = 17.0 if tour_phase == 1 else 0.0 if tour_phase == 2 else -14.0
		wanted_speed = 36.0
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
		wanted_turn = sin(flown * 0.0037) * 0.5 + sin(flown * 0.0013 + 1.0) * 0.4
		wanted_climb = clampf((ground + 22.0 - alt) * 0.7, -9.0, 14.0)
		var ring: Variant = ring_ahead(forward)
		if ring != null:
			aim = ring - flyer.position
			wanted_speed = 36.0
	if under < INF:
		wanted_climb = minf(wanted_climb, (under - 9.0 - alt) * 2.0)
		aim = Vector3.ZERO
	if aim == Vector3.ZERO:
		var way := heading + clampf(wanted_turn, -1.0, 1.0) * 0.33
		var rise := asin(clampf(wanted_climb / speed, -0.9, 0.9))
		aim = Vector3(sin(way) * cos(rise), sin(rise), -cos(way) * cos(rise))
	# Over what stands in the way.
	aim = aim.normalized()
	if must > speed * aim.y:
		var flat := Vector2(aim.x, aim.z).normalized()
		var rise := asin(clampf(must / speed, -0.9, 0.95))
		aim = Vector3(flat.x * cos(rise), sin(rise), flat.y * cos(rise))
	aim_at(aim)
	throttle = clampf((DRAG * wanted_speed * wanted_speed + GRAVITY * maxf(aim.y, -0.3)) / THRUST + (wanted_speed - speed) * 0.08, 0.0, 1.0)


## The stick and the rudder that turn the board toward a way: the nose is pitched and yawed at
## it, and the wings are rolled to lay it over the board's top, or level once it is nearly ahead.
func aim_at(way: Vector3) -> void:
	var seen_from := attitude.inverse() * way
	var off := acos(clampf(-seen_from.z, -1.0, 1.0))
	stick.y = clampf(atan2(seen_from.y, -seen_from.z) * 6.0, -1.0, 1.0)
	rudder = clampf(atan2(seen_from.x, -seen_from.z) * 8.0, -1.0, 1.0)
	stick.x = clampf(lerpf(attitude.x.y * 2.0, seen_from.x * 6.0, clampf(off / 0.35, 0.0, 1.0)), -1.0, 1.0)


## With --ring SIDE a flight by itself starts 70 units before a ring of the course nearest the
## start, headed through it: along its course's way at its first ring (1), against it at its last (-1).
func start_at_ring(side: float) -> void:
	for plot in near_first:
		var course := course_start(plot)
		if course.is_empty():
			continue
		while not course_step(course):
			pass
		chains[plot] = course.rings
		var ring: Array = course.rings[0 if side > 0.0 else -1]
		var way: Vector3 = ring[1] * signf(side)
		flyer.position = ring[0] - way * 70.0
		flyer.position.y = maxf(flyer.position.y, Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 10.0)
		attitude = Basis.looking_at(ring[0] - flyer.position)
		seen = attitude
		orient()
		lay_rings()
		return


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
	Terrain.forget()
	flyer.position -= Vector3(here.x, 0.0, here.y)
	was = flyer.position
	carry(-Vector3(here.x, 0.0, here.y))
	for chart in charts:
		chart.set_shader_parameter("anchor_frame", Terrain.anchor)
	glints.clear()
	let_go()
	stale.fill(true)
	anchors += 1


## Forgets what stands at places of the chart: the rings and the landmarks.
func let_go() -> void:
	if rings_run:
		# The light that runs out over the ground from passed rings is told by tend_rings, which no longer runs.
		var none := PackedVector4Array()
		none.resize(8)
		tell("pulses", none)
		rings_run = false
	laying.clear()
	if not chains.is_empty():
		chains.clear()
		lit.clear()
		onward = NO_RING
		lay_rings()
	for plot: Vector2i in landmarks:
		if landmarks[plot]:
			landmarks[plot].queue_free()
	landmarks.clear()


## The flock: sixteen birds that wait ahead of the board, fall in behind it in a wedge when it
## comes by, fly with it for a quarter of a minute, and then peel away to wait ahead again.
func fly_flock(delta: float, forward: Vector3) -> void:
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
		flock_at.y = lerpf(flock_at.y, Terrain.surface(Vector2(flock_at.x, flock_at.z)) + 40.0 - lowered, 1.0 - exp(-delta))
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


## What is first drawn late in a flight (a lighthouse's beam, a landmark) would have its
## pipeline made then, in a frame of 160 ms. Each is drawn once at the start, unseen, in a card
## under the board, for three seconds.
func warm_up() -> void:
	var card := QuadMesh.new()
	card.size = Vector2.ONE * 0.01
	var beam := StandardMaterial3D.new()
	beam.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	beam.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	beam.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	beam.cull_mode = BaseMaterial3D.CULL_DISABLED
	beam.albedo_color = Color(1, 1, 1, 0)
	var warm := Node3D.new()
	flyer.add_child(warm)
	Parts.part(warm, card, beam, Vector3(0, -0.2, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
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


## The start of the course of rings of a plot of the world, or none: course_step lays its rings.
## Nine plots of 300 units in ten have one, of the kind its place has: a street through a town,
## a slalom along a coast, a run low over the open sea, a slalom along a valley between hills or
## mountains; on open land a climb that turns, or a slalom over the fields.
static func course_start(plot: Vector2i) -> Dictionary:
	if Terrain.cell_hash(plot.x + 101, plot.y + 59) < 0.1:
		return {}
	var p := (Vector2(plot) + Vector2(0.2, 0.2) + Vector2(Terrain.cell_hash(plot.x, plot.y), Terrain.cell_hash(plot.y + 57, plot.x - 31)) * 0.6) * RING_PLOT
	var own := Terrain.cell_hash(plot.x + 9, plot.y + 77)
	var way := Terrain.cell_hash(plot.x + 7, plot.y + 3) * TAU
	var ground := Terrain.height(p)
	var lowest := ground
	var highest := ground
	for side in 4:
		var height := Terrain.height(p + Vector2.from_angle(side * TAU / 4.0) * 120.0)
		lowest = minf(lowest, height)
		highest = maxf(highest, height)
	var kind := CLIMB if own > 0.35 else VALLEY
	if Terrain.town(p, ground) > 0.5:
		# Along an avenue: every fifth column of lots and every sixth row is one (terrain.gd's building_top).
		kind = STREET
		if Terrain.cell_hash(plot.x + 3, plot.y + 11) < 0.5:
			p.y = roundf((p.y - 8.0) / 96.0) * 96.0 + 8.0
			way = PI / 2.0 if own < 0.5 else PI * 1.5
		else:
			p.x = roundf((p.x - 8.0) / 80.0) * 80.0 + 8.0
			way = 0.0 if own < 0.5 else PI
	elif lowest < Terrain.SEA and highest > Terrain.SEA + 1.0:
		kind = COAST
	elif highest < Terrain.SEA:
		kind = OPEN_SEA
	elif highest - lowest > 40.0:
		kind = VALLEY
	return {"plot": plot, "kind": kind, "at": Vector3(p.x, -INF, p.y), "way": way, "rings": [], "own": own,
		"count": [5, 7, 7, 6, 5][kind] + int(Terrain.cell_hash(plot.x + 61, plot.y + 5) * 3.99),
		"bend": (0.2 + 0.18 * Terrain.cell_hash(plot.x + 23, plot.y + 41)) * (1.0 if own > 0.67 else -1.0)}


## Lays the next ring of a course, and says whether that was its last: a ring a frame, since each
## looks at the ground in a few places. For each ring its middle, the way through it, how wide
## it is, and its colour. A ring hangs clear of what stands under it and beside it.
## - A climb's rings are 85 units apart, up a way that steepens from 15 to 34 degrees and round a
##   bend that tightens, each narrower than the one before.
## - A slalom's are 80 units apart, low and to either side of its way, which goes on the way its
##   kind likes best of three ahead: the valley's lowest ground, the coast's line; the sea's
##   weaves, and every third of its rings stands higher.
## - A street's are 60 units apart along it, between the houses, every other one a little higher;
##   the last, where the town ends or the course does, rises over the roofs.
static func course_step(course: Dictionary) -> bool:
	var rings: Array = course.rings
	var ring := rings.size()
	var kind: int = course.kind
	var at: Vector3 = course.at
	var way: float = course.way
	var along := Vector3(sin(way), 0.0, -cos(way))
	var wide := 6.5 - 0.3 * mini(ring, 5) if kind == CLIMB else 5.0 if kind == STREET else 6.0
	var place := Vector2(at.x, at.z)
	if kind == VALLEY or kind == COAST or kind == OPEN_SEA:
		place += Vector2(-along.z, along.x) * (8.0 if ring % 2 == 0 else -8.0)
	var last: bool = ring == course.count - 1 or (kind == STREET and Terrain.town(place, Terrain.height(place)) < 0.35)
	var clear := hang(place, along, wide)
	match kind:
		CLIMB:
			at.y = maxf(at.y, clear + 3.0)
		STREET:
			at.y = clear + (3.0 if ring % 2 == 1 else 0.0)
			if last and ring > 0:
				for beside: float in [-24.0, 24.0]:
					clear = maxf(clear, hang(place + Vector2(-along.z, along.x) * beside, along, wide))
				at.y = clear + 4.0
		OPEN_SEA:
			at.y = clear + (14.0 if ring % 3 == 2 else 0.0)
		_:
			at.y = clear
	rings.append([Vector3(place.x, at.y, place.y), along, wide, [0, 2, 3, 0, 1][kind]])
	if last:
		# Each ring faces the way from the ring before it to the ring after it.
		for each in rings.size():
			var from: Vector3 = rings[maxi(each - 1, 0)][0]
			var to: Vector3 = rings[mini(each + 1, rings.size() - 1)][0]
			if from != to:
				rings[each][1] = (to - from).normalized()
		return true
	match kind:
		CLIMB:
			way += course.bend * (1.0 + 0.25 * ring)
			var rise := minf(0.26 + 0.08 * ring, 0.6)
			at += Vector3(sin(way) * cos(rise), sin(rise), -cos(way) * cos(rise)) * 85.0
		STREET:
			at += along * 60.0
		OPEN_SEA:
			way += 0.5 * sin(ring * 1.7 + course.own * TAU)
			at += Vector3(sin(way), 0.0, -cos(way)) * 80.0
		_:
			var best := INF
			var chosen := way
			for turn: float in [-0.4, 0.0, 0.4]:
				var height := Terrain.height(Vector2(at.x, at.z) + Vector2(sin(way + turn), -cos(way + turn)) * 80.0)
				var liked := (height if kind == VALLEY else absf(height - Terrain.SEA)) + absf(turn) * 6.0
				if liked < best:
					best = liked
					chosen = way + turn
			way = chosen
			at += Vector3(sin(way), 0.0, -cos(way)) * 80.0
	course.at = at
	course.way = way
	return false


## How high a ring's middle hangs at a place, to be clear of what stands under it and beside it:
## a board that flies through it low is over its least height over the ground. The ground is the
## world's own height there: the flight's lattice (Terrain.ground) would compute four for each
## place this far ahead of it.
static func hang(place: Vector2, along: Vector3, wide: float) -> float:
	var beside := Vector2(-along.z, along.x) * wide
	var surface := maxf(Terrain.height(place), Terrain.SEA)
	var top := Terrain.over(place, surface)
	for side: Vector2 in [place + beside, place - beside]:
		top = maxf(top, Terrain.over(side, maxf(Terrain.height(side), Terrain.SEA)))
	return maxf(top + 6.0 + wide, surface + 15.0)


## The rings: a hoop of glass with three motes that circle it, drawn as one mesh for all of
## them (ring.gdshader), and the ring of light that bursts out of one as it is passed.
func build_rings() -> void:
	for at in 25:
		near_first.append(Vector2i(at % 5 - 2, at / 5 - 2))
	near_first.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.length_squared() < b.length_squared())
	var hoop := TorusMesh.new()
	hoop.inner_radius = 0.955
	hoop.outer_radius = 1.045
	hoop.rings = 64
	hoop.ring_segments = 6
	var mote := SphereMesh.new()
	mote.radial_segments = 8
	mote.rings = 4
	# One mesh: the hoop, and the motes on it, which the shader knows by their second UV and
	# carries round the hoop.
	var arrays := Parts.arrays_of(hoop)
	var beads := Parts.arrays_of(mote)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX].duplicate()
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL].duplicate()
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX].duplicate()
	var marks := PackedVector2Array()
	marks.resize(vertices.size())
	for bead in 3:
		var first := vertices.size()
		for vertex: Vector3 in beads[Mesh.ARRAY_VERTEX]:
			vertices.append(vertex)
			marks.append(Vector2(1.0, bead))
		normals.append_array(beads[Mesh.ARRAY_NORMAL])
		for index: int in beads[Mesh.ARRAY_INDEX]:
			indices.append(first + index)
	var both := []
	both.resize(Mesh.ARRAY_MAX)
	both[Mesh.ARRAY_VERTEX] = vertices
	both[Mesh.ARRAY_NORMAL] = normals
	both[Mesh.ARRAY_TEX_UV2] = marks
	both[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, both)
	hoops.transform_format = MultiMesh.TRANSFORM_3D
	hoops.use_colors = true
	hoops.use_custom_data = true
	hoops.mesh = mesh
	var glass := ShaderMaterial.new()
	glass.shader = preload("res://ring.gdshader")
	materials.append(glass)
	var all := MultiMeshInstance3D.new()
	all.multimesh = hoops
	all.material_override = glass
	all.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	all.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ground_life.add_child(all)
	var flash := StandardMaterial3D.new()
	flash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flash.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flash.cull_mode = BaseMaterial3D.CULL_DISABLED
	flash.albedo_color = Color(1.0, 0.8, 0.4, 0.0)
	burst.mesh = hoop
	burst.material_override = flash
	burst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ground_life.add_child(burst)


## How a ring glows: [how bright, how far it has turned to a passed ring's amber, the clock when
## the chain's time for it runs out]. Every ring not yet passed counts, from either side; the
## next of the course that a chain is in beats, faster as the chain's time runs out; a passed
## ring is a faint amber until its course is left behind.
func ring_glow(plot: Vector2i, ring: int) -> Array:
	var id := Vector3i(plot.x, plot.y, ring)
	if lit.has(id):
		return [0.5, 1.0, 0.0]
	if id == onward and elapsed < chain_ends:
		return [2.6, 0.0, chain_ends]
	return [1.4, 0.0, 0.0]


## Notes how a ring glows from now on, for the shader, which takes it there by degrees from
## how it glowed. The instances are kept here: the engine would read them back from the GPU.
func set_ring(id: Vector3i) -> void:
	if not hoop_of.has(id):
		return
	var at: int = hoop_of[id] * 20
	var glow := ring_glow(Vector2i(id.x, id.y), id.z)
	laid[at + 15] = laid[at + 16]
	laid[at + 16] = glow[0]
	laid[at + 17] = glow[1]
	laid[at + 18] = elapsed
	laid[at + 19] = glow[2]


## Lays every ring of `chains` out as an instance of `hoops`: its place, turned so the hoop's
## axis is the way through it, as wide as it is; in its colour its hue; in its custom data how
## it glows (set_ring).
func lay_rings() -> void:
	laid.clear()
	hoop_of.clear()
	for plot: Vector2i in chains:
		var course: Array = chains[plot]
		for ring in course.size():
			var at: Vector3 = course[ring][0]
			var through: Vector3 = course[ring][1]
			var wide: float = course[ring][2]
			var side := through.cross(Vector3.UP).normalized() * wide
			var up := side.cross(through).normalized() * wide
			var glow := ring_glow(plot, ring)
			hoop_of[Vector3i(plot.x, plot.y, ring)] = laid.size() / 20
			laid.append_array([side.x, through.x * wide, up.x, at.x, side.y, through.y * wide, up.y, at.y, side.z, through.z * wide, up.z, at.z,
				0.0, 0.0, course[ring][3], glow[0], glow[0], glow[1], -100.0, glow[2]])
	hoops.instance_count = laid.size() / 20
	if not laid.is_empty():
		hoops.buffer = laid


## Keeps the courses of the 25 plots around the flyer, laying a ring a frame as plots come near,
## and sees which ring the board has flown through since the last frame, from either side.
func tend_rings() -> void:
	var middle := Vector2i((Vector2(flyer.position.x, flyer.position.z) / RING_PLOT).floor())
	var relaid := false
	for plot: Vector2i in chains.keys():
		if absi(plot.x - middle.x) > 2 or absi(plot.y - middle.y) > 2:
			for ring in chains[plot].size():
				lit.erase(Vector3i(plot.x, plot.y, ring))
			chains.erase(plot)
			relaid = true
	if laying.is_empty():
		for near in near_first:
			if not chains.has(middle + near):
				laying = course_start(middle + near)
				if laying.is_empty():
					chains[middle + near] = []
				break
	elif course_step(laying):
		var plot: Vector2i = laying.plot
		if absi(plot.x - middle.x) <= 2 and absi(plot.y - middle.y) <= 2:
			chains[plot] = laying.rings
			relaid = true
		laying = {}
	if relaid:
		lay_rings()
	var glows := false
	# A chain whose time ran out is over, and its next ring no longer beats.
	if chain > 0 and elapsed >= chain_ends:
		chain = 0
		var was_onward := onward
		onward = NO_RING
		set_ring(was_onward)
		glows = true
	var flew := flyer.position - was
	var reach := flew.length() + 7.0
	for plot: Vector2i in chains:
		var course: Array = chains[plot]
		for ring in course.size():
			var at: Vector3 = course[ring][0]
			if at.distance_squared_to(was) > reach * reach:
				continue
			var through: Vector3 = course[ring][1]
			var before := (was - at).dot(through)
			var after := (flyer.position - at).dot(through)
			if before * after > 0.0 or before == after or (was + flew * (before / (before - after))).distance_to(at) > course[ring][2]:
				continue
			if not leaving and not lit.has(Vector3i(plot.x, plot.y, ring)):
				pass_ring(plot, ring, after > before)
				glows = true
	if glows:
		hoops.buffer = laid
	# The ring of light that bursts out of a ring passed.
	var bursting := elapsed - burst_at
	burst.visible = bursting < 1.6
	burst.scale = Vector3.ONE * (6.0 + 26.0 * (1.0 - exp(-bursting * 2.2)))
	(burst.material_override as StandardMaterial3D).albedo_color.a = 0.8 * (1.0 - smoothstep(0.2, 1.6, bursting))
	# The shaders run rings of light out over the ground from the last eight rings passed,
	# every nine seconds each. They fade with a ring's distance from the flyer, so none comes
	# or goes at once.
	var here := Vector2(flyer.position.x, flyer.position.z)
	var pulses := PackedVector4Array()
	for at in glints:
		pulses.append(Vector4(at.x, at.y, elapsed - at.z, (1.0 - smoothstep(520.0, 760.0, Vector2(at.x, at.y).distance_to(here))) * (1.0 - smoothstep(2500.0, 5000.0, flyer.position.y))))
	pulses.resize(8)
	tell("pulses", pulses)
	rings_run = true


## A ring flown through: it is spent; the chain goes on if it came in time, or starts again; the
## score gains as many as the chain has rings, and the board as much speed as the chain has
## earned. The next ring of its course, the way it was flown, is the one to make for, and a note
## rises with the chain.
func pass_ring(plot: Vector2i, ring: int, along: bool) -> void:
	var course: Array = chains[plot]
	var id := Vector3i(plot.x, plot.y, ring)
	lit[id] = true
	passes += 1
	if not along:
		against += 1
	chain = chain + 1 if elapsed < chain_ends else 1
	longest = maxi(longest, chain)
	points += chain
	chain_ends = elapsed + chain_time(chain)
	speed += RING_BOOST + 1.5 * mini(chain - 1, 8)
	gained_at = elapsed
	gain.text = "+%d" % chain
	var was_onward := onward
	var next := ring + (1 if along else -1)
	onward = Vector3i(plot.x, plot.y, next) if next >= 0 and next < course.size() and not lit.has(Vector3i(plot.x, plot.y, next)) else NO_RING
	for each: Vector3i in [id, was_onward, onward]:
		set_ring(each)
	var at: Vector3 = course[ring][0]
	var through: Vector3 = course[ring][1]
	glints.push_front(Vector4(at.x, at.z, elapsed, 1.0))
	glints.resize(mini(glints.size(), 8))
	bell.stream = chimes[mini(chain - 1, chimes.size() - 1)]
	bell.play()
	burst.transform = Transform3D(Basis(through.cross(Vector3.UP).normalized(), through, through.cross(Vector3.UP).normalized().cross(through)), at)
	burst_at = elapsed


## Seconds from a ring to the next for a chain of so many rings to go on.
static func chain_time(rings: int) -> float:
	return maxf(CHAIN_TIME - 0.1 * (rings - 1), 2.0)


## The ring the corgi flying itself makes for, or none: the next of the course its chain is in,
## or the nearest ring not yet passed that lies ahead and faces it, from either side.
func ring_ahead(forward: Vector3) -> Variant:
	if onward != NO_RING and elapsed < chain_ends and chains.has(Vector2i(onward.x, onward.y)):
		return chains[Vector2i(onward.x, onward.y)][onward.z][0]
	var nearest: Variant = null
	var nearest_far := 450.0
	for plot: Vector2i in chains:
		var course: Array = chains[plot]
		for ring in course.size():
			var to: Vector3 = course[ring][0] - flyer.position
			to.y = 0.0
			var far := to.length()
			if far > 12.0 and far < nearest_far and to.dot(forward) > 0.5 * far and absf(to.dot(course[ring][1])) > 0.5 * far and not lit.has(Vector3i(plot.x, plot.y, ring)):
				nearest = course[ring][0]
				nearest_far = far
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
	# A screen held upright takes its angle of view across: the flyer and the land beside it
	# stay in it, and it sees further up and down.
	var upright := get_viewport().get_visible_rect().size.aspect() < 1.0
	camera.keep_aspect = Camera3D.KEEP_WIDTH if upright else Camera3D.KEEP_HEIGHT
	# The faster the board, the wider the view and the more streaks of air.
	rush = lerpf(rush, clampf((speed - 34.0) / 30.0, 0.0, 1.0), 1.0 - exp(-delta * 3.0))
	fov_seen = lerpf(fov_seen, fov_led, glide)
	camera.fov = (fov_seen + 10.0 * rush) * (0.82 if upright else 1.0)
	if not helm:
		# Let go, the zoom comes back.
		zoom = lerpf(zoom, 1.0, 1.0 - exp(-delta * 1.0))
	# The camera follows the flyer's place a little late, and turns about it: a straight way
	# between two places around the flyer would cut through it. Zoomed in it is less late, or the
	# flyer would be out of the middle of a close view. In the player's hands it follows the
	# board's axes, rolled with it, a moment late, so a roll or a pull shows on the board before
	# the world turns; while the corgi flies itself, it follows the heading alone, upright.
	var late := 1.0 - exp(-delta * 5.0 / (minf(zoomed, 1.0) * minf(zoomed, 1.0)))
	trail = trail.lerp(flyer.position, late)
	seen = seen.slerp(attitude if helm else Basis(Vector3.UP, -heading), 1.0 - exp(-delta * 7.0) if helm else late).orthonormalized()
	zoomed = lerpf(zoomed, zoom, 1.0 - exp(-delta * 6.0))
	# From high up the camera looks down: the planet's rim lies under eye level by the dip of
	# the horizon. Most of the dip is added to the view's pitch, and from space more than
	# that, toward straight down: the flyer is then seen over the planet, which is near the
	# view's middle and round in it (a sphere at a wide view's edge is drawn out).
	var dip := acos(Terrain.RADIUS / (Terrain.RADIUS + maxf(flyer.position.y + lowered, 0.0)))
	var down := smoothstep(0.03, 0.9, dip)
	var seen_heading := atan2(-seen.z.x, seen.z.z)
	var frame := Basis(Vector3(cos(seen_heading), 0.0, sin(seen_heading)), -dip * 0.9 * down - (PI / 2.0 - dip) * 0.6 * down * down) * seen
	var place := trail + frame * view * zoomed
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
	camera.look_at(flyer.position + frame * aim, frame.y)
	# Where the board is headed, for the mark the hand steers by.
	var headed := flyer.position - attitude.z * 300.0
	touch.headed_shown = not camera.is_position_behind(headed)
	touch.headed = camera.unproject_position(headed)
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
	var sea_near := (1.0 - smoothstep(14.0, 70.0, over_sea_by)) if Terrain.ground(Vector2(flyer.position.x, flyer.position.z)) < Terrain.SEA + 1.5 else 0.0
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


## For automated runs: the frame rate and how even the frames were, once the first frames'
## pipelines are made; then, over the flight's last second and a half, the time the GPU and the
## renderer's thread take for a frame (asking it makes frames longer, so those are not among
## the frames counted); and what the frame shows, then quit.
func watch() -> void:
	frames += 1
	if frames == 120:
		steady_from = Time.get_ticks_msec()
	var now := Time.get_ticks_usec()
	var viewport := get_viewport().get_viewport_rid()
	if reporting:
		reported_frames += 1
		if reported_frames > 8:
			gpu_milliseconds += RenderingServer.viewport_get_measured_render_time_gpu(viewport)
			cpu_milliseconds += RenderingServer.viewport_get_measured_render_time_cpu(viewport) + RenderingServer.get_frame_setup_time_cpu()
	elif frames > 120:
		frame_milliseconds.append((now - frame_began) / 1000.0)
		if elapsed > autopilot_seconds - 1.5:
			steady_seconds = (Time.get_ticks_msec() - steady_from) / 1000.0
			reporting = true
			RenderingServer.viewport_set_measure_render_time(viewport, true)
	frame_began = now
	if elapsed < autopilot_seconds:
		return
	autopilot_seconds = 0.0
	var steady := frame_milliseconds.size()
	var timed := maxi(reported_frames - 8, 1)
	print("FLYOVER level %d scale %.2f" % [level, LEVELS[level][0]])
	print("FLYOVER seconds %.1f frames %d fps %.1f gpu %.1f cpu %.1f flown %d rings %d against %d score %d longest %d" % [elapsed, frames, steady / steady_seconds, gpu_milliseconds / timed, cpu_milliseconds / timed, int(flown), passes, against, points, longest])
	print("FLYOVER highest %d anchors %d" % [int(highest), anchors])
	# How even the frames were: the long ones are counted against the median.
	frame_milliseconds.sort()
	var median := frame_milliseconds[steady / 2]
	print("FLYOVER frame times median %.1f p95 %.1f p99 %.1f max %.1f over2x %d over4x %d" % [median, frame_milliseconds[steady * 95 / 100], frame_milliseconds[steady * 99 / 100], frame_milliseconds[-1], steady - frame_milliseconds.bsearch(median * 2.0, false), steady - frame_milliseconds.bsearch(median * 4.0, false)])
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
