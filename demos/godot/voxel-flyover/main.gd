extends Node3D
## Voxel Flyover: a flight over a planet that can be left. A corgi on a jet surfboard,
## a pelican on a bicycle pedalling under it for the jets, flies over a world that is a sphere of
## 600,000 units: the land runs on to a curved horizon, and a board that keeps climbing leaves
## the air and sees the planet whole. The keys steer it and the mouse looks around; its way goes
## through chains of small clouds that climb, each boosting twice the last, out of the air. The
## world is a function (terrain.gdshaderinc): the GPU draws its ground into textures as the
## flight goes, raises grids of land to it and stands trees on it. The game computes in a flat
## chart around an anchor on the planet, and the shaders carry every vertex onto the sphere
## (terrain.gdshaderinc's lift).
##
## `-- --autopilot SECONDS` flies by itself, prints its frame rate, how even its frames were, the
## time a frame took and what the frame shows, and quits: Dolly's test uses it. `--day HOUR`
## starts at that hour of 24, and `--tour SECOND` leaves the planet at that second of a flight by
## itself, looks at it from 900,000 units up (`--top`), and comes back; `--high HEIGHT` starts
## a flight by itself at that height and keeps it; `--cloud 1` starts it before the first cloud of
## the chain nearest the start, headed through it, and `--chain 1` flies on through the chains,
## with `--aside RADII` that far to the right of each cloud's middle. Q prints how far the flight went, the clouds, and how the board was flying.

const Terrain := preload("res://terrain.gd")
const Landmarks := preload("res://landmarks.gd")
const Parts := preload("res://parts.gd")
const Model := preload("res://model.gd")
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
const MOON_TEXELS := Vector2i(2048, 1024) # the moon's
## The moon: a second world, a third of the planet's radius, its middle this far from the planet's, to
## the west-north-west of the start, 26 degrees over its horizon there (half lit at nine in the morning).
## The distance is the game's, not the scale of the ground.
const MOON_DISTANCE := 2.0e6
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
const CRUISE := 30.0 # the board's one speed in the air near the ground
const LOOKS := 0.0035 # radians the view turns for a pixel of the mouse's way
const STEEPEST := 1.5 # the pitch, up or down: 86 degrees, almost straight
const PITCHES := 0.9 # radians a second the nose rises or falls at most while a key or the stick is held
const CEILING := 420.0 # the flight by itself stays under it
const SOARS_FROM := 420.0 # over this height, the flyover's ceiling, the board is faster the higher it is
const SOARS_BY := 110.0 # twice as fast this far over it, and so on: every 8 s of climbing multiply the height by e, and space is 80 s from the ground
const SPACE := 1.4e6 # the highest the board goes: the planet is a disc of 35 degrees from there
const AIR := 7000.0 # the height over which the air thins to 1/e (sky.gdshader's)
const LOWERED_STEP := 8192.0
const ANCHOR_FROM := 8000.0 # the chart's anchor moves only over this height, where nothing that stands on its lattice is seen
const ANCHOR_REACH := 120000.0 # and only once the flyer is this far from it
const CLOUD_PLOT := 1200.0 # a plot of the world has one chain of clouds at most (chain_start)
const CHAIN_SHARE := 0.7 # of the plots
const CHAIN := 6 # clouds in a chain
const CLOUD_LINK := 3.5 # seconds from a cloud to the next of its chain, flown straight at the chain's boost
const LAST_LINK := 4.5 # and to the last, over the air, at most
const CHAIN_TIME := 5.0 # seconds from a cloud to the next for a chain to go on
const CLOUD_BOOST := 20.0 # the speed the first cloud of a chain adds to the cruise; each next doubles it
const BOOST_FADES := 2.5 # seconds in which a boost wears off to 1/e
const CLOUD_SIZE := 7.0 # a cloud's radius where the board is not faster for its height
const CLOUD_REACH := 1.6 # a cloud is flown through within so many of its radii of its middle: its drawn ball's furthest bulge (wisp.gdshader)
const CHAIN_TOP := 60000.0 # no cloud is higher: over the air, and under the anchor's moves at any distance a chain spans
const CARRIED := Vector2i(1 << 30, 0) # the plot that names the chain the board is in once the chart's anchor has moved
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
var moon_whole: SubViewport # the whole moon's
var moon_at := Vector3.ZERO # the moon's middle, in the planet's axes
var on_moon := false # the flight is near the moon (cross_bodies)
var crossings := 0 # from one world to the other
var crossed_at := -100.0 # the clock then
var sun_of_planet := Vector3.UP # the way to the sun, in the planet's axes (set_day)
var planet_frames := 0 # the frames since it was drawn
var rebake := 0.0
var ground_life := Node3D.new() # the grids of what lives near the ground: trees, towns, clouds, boats, birds; not drawn from high up
var charts: Array[ShaderMaterial] = [] # the materials that draw the grounds: they are told the chart's anchor
var stale: Array[bool] = [true, true, true, true, true, true, true, true] # the grids whose grounds are to be drawn anew: all at the start and when the chart's anchor moves
var lowered := 0.0 # the height taken off everything drawn, once the flyer is high
var weather := Vector3.ZERO # how far a second moves the weather, in the planet's axes
var sun_frame := Basis.IDENTITY # the axes the sun's arc is given in, fixed to the planet: the start's
var tour := 0.0 # with --tour: the flight by itself leaves the planet at that second, looks, and comes back
var tour_phase := 0
var tour_held := 0.0
var tour_top := 900000.0 # how high the tour goes (--top)
var voyage := 0.0 # with --moon: the flight by itself goes to the moon at that second, flies over it, and comes back
var voyage_phase := 0 # 1 out to the moon, 2 down to it, 3 over it, 4 out to the planet, 5 down to it, 6 home
var voyage_held := 0.0 # seconds over the moon
var moon_lowest := INF # the least height over the moon's ground the flight came to
var home_lowest := INF # and over the planet's after it
var highest := 0.0 # the flyer was this high
var anchors := 0 # the chart's anchor moved so many times
var groves: Array[MultiMeshInstance3D] = []
var water := MeshInstance3D.new()
var cities: Array[MultiMeshInstance3D] = [] # the towns' buildings, a lot each: the near ones, and the far
var flyer := Node3D.new()
var model := Model.new() # the board, its jets, the pelican and the corgi, as Blender made them
var dog: Node3D
var head: Node3D
var legs: Array[MeshInstance3D] = []
var paws: Array[MeshInstance3D] = []
var ears: Array[Node3D] = []
var tail: MeshInstance3D
var furs: Array[ShaderMaterial] = []
var cape_material: ShaderMaterial
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
var gain := Label.new() # what the last cloud added to the score
var engine := AudioStreamPlayer.new()
var bell := AudioStreamPlayer.new()
var patter := AudioStreamPlayer.new() # the rain
var wash := AudioStreamPlayer.new() # the sea under a low flight
var chimes: Array[AudioStreamWAV] = [] # a note for each cloud of a chain, made before the flight
var leaving := false # after Q, or a flight by itself that has ended
var chains := {} # plot -> its chain of clouds (chain_start), or none, for the plots around the flyer
var near_first: Array[Vector2i] = [] # the 25 plots around the flyer's, the nearest first
var wisps := MultiMesh.new() # every cloud of `chains`
var spires := MultiMeshInstance3D.new() # the spires of an old world near the flight (terrain.gd's)
var spires_from := Vector2.INF # where the flyer was when they were placed
var laid := PackedFloat32Array() # its instances, 20 numbers each (lay_wisps)
var burst := MeshInstance3D.new() # the light that leaves a cloud as it is flown through
var burst_at := -100.0
var burst_wide := 1.0 # the radius of that cloud
var points := 0 # the score: each cloud flown through counts as many as the clouds of its chain so far
var passes := 0 # the clouds flown through
var taken := PackedStringArray() # each of them, for the report: the chain it made, and the boost it gave
var chain := 0 # the clouds flown through one after another, each in time for the next
var chain_ends := 0.0 # the clock when it is over unless another cloud is flown through
var longest := 0 # the longest chain of the flight
var onward_chain := {} # the chain whose next cloud is the one to make for, or none
var chasing := false # with --chain the corgi flying itself flies on through the chains it meets
var aside := 0.0 # with --aside, so many radii to the right of each cloud's middle
var gained_at := -100.0 # the clock when the last cloud was flown through, for the words that show it
var glints: Array[Vector4] = [] # the last eight clouds flown through, the newest first: where (x, y) and the clock then (z)
var was := Vector3.ZERO # where the flyer was a frame ago
var speed_lines := ShaderMaterial.new() # the streaks of the air at speed
var flock := MultiMeshInstance3D.new() # birds that fly along with the board for a while
var flock_at := Vector3.ZERO # where their leader is
var flock_with := 0.0 # how long they have flown with the board
var birds: Array[Vector3] = []

var helm := false # the player's, after a click or a touch
var captured := false # the pointer, which the page gives the game at a click
var rearm_at := INF # after L, when the pointer is asked for again, to be captured at the next click
var look := Vector2.ZERO # where the mouse has turned the view: around the flyer, and over it
var looked := Vector2.ZERO # the view on its way there
var moved_since := false # the mouse has moved since the pointer was captured
var pitch := 0.0 # of the heading: up from level, in radians
var pitching := 0.0 # how fast the pitch changes, in radians a second
var boost := 0.0 # the speed the last cloud gave, wearing off
var board_turn := Quaternion.IDENTITY # the board as it is seen, on its way to its axes
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
	moon_at = (Terrain.anchor * Vector3(-0.7, 0.66, 0.27)).normalized() * MOON_DISTANCE
	tour = option("--tour", 0.0)
	tour_top = option("--top", tour_top)
	voyage = option("--moon", 0.0)
	rebake = option("--rebake", 0.0)
	for ring in OWN:
		grounds.append(build_ground(RINGS[ring][0] + 4, RINGS[ring][1]))
	planet = build_whole(false)
	moon_whole = build_whole(true)
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
	(water.material_override as ShaderMaterial).set_shader_parameter("ground_far", grounds[3].get_texture())
	(water.material_override as ShaderMaterial).set_shader_parameter("cell_far", RINGS[3][1])
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)
	build_pod()
	build_flyer()
	build_wisps()
	build_spires()
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
	chasing = option("--chain", 0.0) > 0.0
	aside = option("--aside", 0.0)
	if option("--cloud", 0.0) > 0.0:
		start_at_cloud()
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
		# The page gives the pointer at a click; L gives it back (and the browser at its Escape).
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


## The ground of a whole world as a texture (ground.gdshader's `whole`), drawn once at the start:
## the planet's, which the far grids read and the sky shows from the moon, and the moon's.
func build_whole(moon: bool) -> SubViewport:
	var texels := MOON_TEXELS if moon else PLANET_TEXELS
	var whole := SubViewport.new()
	whole.size = texels
	whole.use_hdr_2d = true
	whole.transparent_bg = true
	whole.disable_3d = true
	whole.render_target_update_mode = SubViewport.UPDATE_ONCE
	var strip := ColorRect.new()
	strip.size = texels
	var material := ShaderMaterial.new()
	material.shader = preload("res://ground.gdshader")
	material.set_shader_parameter("whole", true)
	material.set_shader_parameter("whole_size", Vector2(texels))
	material.set_shader_parameter("on_moon", moon)
	material.set_shader_parameter("body_radius", Terrain.MOON_RADIUS if moon else Terrain.PLANET_RADIUS)
	strip.material = material
	whole.add_child(strip)
	add_child(whole)
	return whole


## Where a place of the chart, at a height, is in the planet's axes, with the planet's middle at 0.
func universe_at(here: Vector2, height: float) -> Vector3:
	return (moon_at if on_moon else Vector3.ZERO) + Terrain.anchor * Terrain.chart_dir(here) * (Terrain.radius + height)


## Once the board is nearer the other world's ground than this one's, the flight is near that one:
## its chart takes the flight, its ground the grids', and this one is seen in the sky. The new
## chart's anchor is under the board, its axes the old one's there laid on the new up; what the
## flight carries (the way the board flies, the camera, the board as it is seen) is turned from the
## old chart's axes into the new one's, so nothing seen moves. Its up is the other way, so the board
## and the camera then turn over to it by degrees (turning_over).
func cross_bodies() -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var alt := flyer.position.y + lowered
	if alt < 0.5 * Terrain.radius:
		return
	var at := universe_at(here, alt)
	var other_middle := Vector3.ZERO if on_moon else moon_at
	var other_radius := Terrain.PLANET_RADIUS if on_moon else Terrain.MOON_RADIUS
	var other_alt := at.distance_to(other_middle) - other_radius
	if other_alt >= alt:
		return
	var before := Terrain.anchor * Terrain.chart_frame(here)
	var up := (at - other_middle).normalized()
	var east := before.x - up * before.x.dot(up)
	if east.length() < 0.1:
		east = before.z.cross(up)
	east = east.normalized()
	var anchor := Basis(east, up, east.cross(up))
	var turned := anchor.transposed() * before
	var nose := turned * -axes().z
	on_moon = not on_moon
	Terrain.on_moon = on_moon
	Terrain.radius = other_radius
	Terrain.anchor = anchor
	Terrain.forget()
	var old := flyer.position
	flyer.position = Vector3(0.0, other_alt - lowered, 0.0)
	was = flyer.position
	pitch = clampf(asin(clampf(nose.y, -1.0, 1.0)), -STEEPEST, STEEPEST)
	heading = atan2(nose.x, -nose.z)
	seen = (turned * seen).orthonormalized()
	board_turn = (turned.get_rotation_quaternion() * board_turn).normalized()
	trail = flyer.position + turned * (trail - old)
	for place in wake.size():
		wake[place] = flyer.position + turned * (wake[place] - old)
	flock_at = flyer.position
	for chart in charts:
		chart.set_shader_parameter("anchor_frame", Terrain.anchor)
		chart.set_shader_parameter("on_moon", on_moon)
		chart.set_shader_parameter("body_radius", Terrain.radius)
	tell("on_moon", on_moon)
	tell("body_radius", Terrain.radius)
	tell("planet_ground", (moon_whole if on_moon else planet).get_texture())
	sky_material.set_shader_parameter("on_moon", on_moon)
	sky_material.set_shader_parameter("body_radius", Terrain.radius)
	chains.clear()
	onward_chain = {}
	lay_wisps()
	glints.clear()
	let_go()
	spires.multimesh.instance_count = 0
	Terrain.spires.clear()
	stale.fill(true)
	spires_from = Vector2.INF
	crossings += 1
	crossed_at = elapsed


## The worlds in the sky (sky.gdshader): the other one always, and the one the flight is near once
## it is so high over it that the far grids, which draw it, go by degrees (from four fifths of its
## radius to nineteen twentieths, over where grid 5 shows again on the way down): the sky draws it
## behind them meanwhile, as they draw it from nearer.
func set_bodies() -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var alt := flyer.position.y + lowered
	var sky_axes := Terrain.anchor * Terrain.chart_frame(here)
	var at := universe_at(here, alt)
	var near_middle := moon_at if on_moon else Vector3.ZERO
	var far_middle := Vector3.ZERO if on_moon else moon_at
	var to_far := sky_axes.transposed() * (far_middle - at)
	var to_near := sky_axes.transposed() * (near_middle - at)
	var near_shown := smoothstep(0.8, 0.95, alt / Terrain.radius)
	sky_material.set_shader_parameter("sky_axes", sky_axes)
	sky_material.set_shader_parameter("far_way", to_far.normalized())
	sky_material.set_shader_parameter("far_distance", to_far.length())
	sky_material.set_shader_parameter("far_radius", Terrain.PLANET_RADIUS if on_moon else Terrain.MOON_RADIUS)
	sky_material.set_shader_parameter("far_ground", (planet if on_moon else moon_whole).get_texture())
	sky_material.set_shader_parameter("near_way", to_near.normalized())
	sky_material.set_shader_parameter("near_distance", to_near.length())
	sky_material.set_shader_parameter("near_ground", (moon_whole if on_moon else planet).get_texture())
	sky_material.set_shader_parameter("near_shown", near_shown)
	for ring in range(5, RINGS.size()):
		(lands[ring].material_override as ShaderMaterial).set_shader_parameter("solid", 1.0 - near_shown)
		lands[ring].visible = (lands[ring].visible if ring < OWN else planet_frames >= 3) and near_shown < 1.0


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


## The flyer: a corgi in sunglasses and a cape, crouched on a surfboard that two small jets carry,
## and a pelican on a bicycle under it pedalling for the jets, as Blender made them (model.gd).
## Here the jets' flames and throats, the wakes and the lights are added to it. It looks along
## -z. The characters are this game's own.
func build_flyer() -> void:
	flyer.add_child(model)
	dog = model.dog
	head = model.dog_head
	legs = model.legs
	paws = model.paws
	ears = model.ears
	tail = model.tail
	cape_material = model.cape
	furs = model.coats
	var ball := SphereMesh.new()
	ball.radial_segments = 28
	ball.rings = 14
	var point := CylinderMesh.new()
	point.top_radius = 0.0
	# Each jet's flame, with a white heart, and its glowing throat.
	var flame := ShaderMaterial.new()
	flame.shader = preload("res://flame.gdshader")
	var heart := flame.duplicate() as ShaderMaterial
	heart.set_shader_parameter("colour", Color(1.6, 1.5, 1.2))
	fires = [flame, heart]
	for x: float in [-0.95, 0.95]:
		glows.append(Parts.paint(Color(1.0, 0.7, 0.35), 0.4, 6.0))
		Parts.part(flyer, ball, glows[-1], Vector3(x, -0.3, 2.9), Vector3.ZERO, Vector3(0.34, 0.34, 0.12))
		for pair: Array in [[flame, 0.3, 0.7], [heart, 0.14, 0.4]]:
			flames.append(Parts.part(flyer, point, pair[0], Vector3(x, -0.3, 2.95 + pair[2]), Vector3(90, 0, 0), Vector3(pair[1], pair[2], pair[1])))
			flames[-1].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
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
	flutter += delta * fast
	model.pedal(delta, fast, turn)
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
	var push := model.stroke()
	for flame in flames:
		flame.scale.y = flame.scale.x * (1.4 + 1.4 * fast) * (0.88 + 0.24 * push)
		flame.position.z = 2.95 + flame.scale.y
	for glow in glows:
		glow.emission_energy_multiplier = 4.5 + 3.0 * push
	for fire in fires:
		fire.set_shader_parameter("strokes", model.angle / PI)
	# The air comes from ahead, and from the outside of a turn.
	# A gust that crosses the flyers (terrain.gdshaderinc's gust) lays the coats flatter and
	# throws the cape higher.
	var over := Vector2(flyer.position.x, flyer.position.z)
	var blown := Terrain.noise((over - WIND * elapsed * 14.0) / 60.0) * Terrain.noise((over - WIND * elapsed * 5.0) / 220.0 + Vector2(40.0, 40.0))
	var air := flyer.global_basis * Vector3(turn * 0.5, 0.0, 0.9 * fast) * (1.0 + 1.5 * blown)
	cape_material.set_shader_parameter("flaps", 1.0 + 1.2 * blown)
	for fur in furs:
		fur.set_shader_parameter("wind", air)
	for cloth: ShaderMaterial in model.plumes + [cape_material]:
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
		wake_material.set_shader_parameter("strokes", model.angle / PI)


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
	# The score: the clouds flown through, beside a round.
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
	# and what a cloud added, over the middle of the screen.
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
	print("FLYOVER helm %d pointer %d heading %d pitch %d view %d %d" % [int(helm), int(captured), int(rad_to_deg(heading)), int(rad_to_deg(pitch)), int(rad_to_deg(looked.x)), int(rad_to_deg(looked.y))])
	title.visible = not helm and autopilot_seconds <= 0.0
	hint.visible = autopilot_seconds <= 0.0
	hint_until = elapsed + 9.0
	helm_shown = helm
	if touch.active:
		# A phone's screen is small: larger words, in lines that fit it upright.
		hint.add_theme_font_size_override("font_size", 38)
		hint.text = "The corgi flies itself.\nA touch takes the board." if not helm \
			else "Left thumb: steer, up to climb, down to dive\nA finger elsewhere: look    Two fingers: zoom\nChain the clouds, climb out of the air to the moon"
		return
	hint.text = "The corgi flies itself. Enter, a click or a touch takes the board.    Wheel or Z, X: zoom    Q: quit" if not helm \
		else "Arrows or WASD: steer, climb, dive    %s    Wheel or Z, X: zoom    T: hours    L: let go    Q: quit\nChain the clouds: each in time boosts twice the last    Climb out of the air to the moon" % ("Mouse: look" if captured else "Click: mouse look")


func _input(event: InputEvent) -> void:
	if autopilot_seconds > 0.0:
		return
	# A browser may report the pointer's way to where it was captured as its first motion, when
	# the mouse next moves (Firefox, 2026-11-18: 320 and 115 pixels for a move of 8 up): it is left.
	if event is InputEventMouseMotion and captured:
		if moved_since:
			turn_view((event as InputEventMouseMotion).relative * LOOKS)
		moved_since = true
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
		KEY_ENTER, KEY_KP_ENTER:
			helm = true
		KEY_L:
			# L lets go of the board and gives the pointer back: it is asked to be free, and a moment
			# later to be captured again at the next click, which takes the board again (hold_pointer).
			# Asked for both in one frame, the page may see only the second (it reads the game's
			# request as it changes, by a Worker that may wake after both): the pointer stayed held.
			helm = false
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			rearm_at = elapsed + 0.3
		KEY_Q:
			print("FLYOVER flown %d clouds %d score %d helm %d high %d heading %d pitch %d view %d %d speed %d zoom %.2f touches %d" % [int(flown), passes, points, int(helm), int(flyer.position.y + lowered), int(rad_to_deg(heading)), int(rad_to_deg(pitch)), int(rad_to_deg(looked.x)), int(rad_to_deg(looked.y)), int(speed), zoom, touch.touches])
			leave()
	if helm != helm_shown:
		show_helm()


## The pointer comes with a click on the page, which takes the board too. It goes at L, or when
## the browser ends the capture by itself (at its Escape): either way the board is let go.
func hold_pointer() -> void:
	if elapsed > rearm_at:
		rearm_at = INF
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	var now := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if now == captured:
		return
	captured = now
	moved_since = false
	helm = captured
	show_helm()


func key_axis(negative: Key, positive: Key) -> float:
	return float(Input.is_physical_key_pressed(positive)) - float(Input.is_physical_key_pressed(negative))


## The mouse, or a finger on a touchscreen, turns the view around the flyer and over it, by
## radians; the heading it leaves as it is.
func turn_view(by: Vector2) -> void:
	look.x += by.x
	look.y = clampf(look.y + by.y, -1.2, 1.2)


## Quits once the mixer has let go of the sounds, which Godot counts as leaked otherwise; no
## cloud chimes meanwhile.
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
	# under the haze, the low clouds and the landmarks by their height's share), and is
	# not drawn from over 9,000.
	tend_wisps()
	if flyer.position.y + lowered < 6000.0:
		tend_landmarks()
	else:
		let_go()
	# The spires are seen from higher up, and go by degrees from 25,000 to 40,000 units (spire.gdshader).
	if flyer.position.y + lowered < 40000.0 and not on_moon:
		tend_spires()
	# The moon has none of the planet's life, its sea, its weather or its clouds.
	ground_life.visible = not on_moon and flyer.position.y + lowered < (9000.0 if ground_life.visible else 8000.0)
	flock.visible = not on_moon and flyer.position.y + lowered < (2600.0 if flock.visible else 2000.0)
	follow(delta)
	speed_lines.set_shader_parameter("rush", rush)
	speed_lines.set_shader_parameter("clock", elapsed)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	hint.modulate.a = clampf(hint_until - elapsed, 0.0, 1.0)
	show_score(delta)
	if autopilot_seconds > 0.0:
		watch()


## The score swells as a cloud is flown through, what it added rises from the middle of the screen
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
	touch.chain_left = clampf((chain_ends - elapsed) / CHAIN_TIME, 0.0, 1.0) if chain > 0 else 0.0


func fly(delta: float) -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var alt := flyer.position.y + lowered
	var soar := soar_at(alt)
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
	var over_sea := not on_moon and Terrain.ground(here) < Terrain.SEA
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
	# The board has one speed, and a cloud's boost over it, which wears off.
	boost *= exp(-delta / BOOST_FADES)
	speed = lerpf(speed, CRUISE + boost, 1.0 - exp(-delta * 4.0))
	var turned_by := 0.0
	if helm:
		# The arrows, WASD or the left thumb's stick (touch.gd) steer: sideways they turn the
		# heading, up and down they raise and lower the nose, the longer the further, to almost
		# straight up or down. Let go, the board flies level again.
		var thumb: Vector2 = touch.push()
		var raised := clampf(Input.get_axis("ui_down", "ui_up") + key_axis(KEY_S, KEY_W) + thumb.y, -1.0, 1.0)
		turned_by = hand(delta, Input.get_axis("ui_left", "ui_right") + key_axis(KEY_A, KEY_D) + thumb.x, raised * STEEPEST)
	else:
		turned_by = fly_itself(delta, alt, ground, under, forward)
	# The ground pushes the board's nose up before it is reached.
	if under == INF and must > speed * sin(pitch):
		pitch = lerpf(pitch, asin(clampf(must / speed, -0.9, 0.95)), 1.0 - exp(-delta * 12.0))
	heading = wrapf(heading + turned_by, -PI, PI)
	climb = speed * sin(pitch)
	flown += speed * delta
	# High up a step is `soar` times longer: the one place the board is faster, by its height
	# alone. What follows the flyer (the camera, the wakes, the birds) is carried along by all
	# of the step but the board's own, so up there they see the board fly as it does below,
	# and the planet turn under it.
	var stride := -axes().z * speed * delta
	was = flyer.position
	flyer.position += stride * soar
	carry(stride * (soar - 1.0))
	# The board does not go under ten units over the ground or the sea: held there, its nose comes level.
	var least := Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 10.0 - lowered if alt < 3000.0 else -INF
	if flyer.position.y < least:
		flyer.position.y = least
		pitch = maxf(pitch, pitch * exp(-delta * 8.0))
	# No ceiling but space's: the board climbs out of the air, and the planet falls away.
	flyer.position.y = minf(flyer.position.y, SPACE - lowered)
	keep_low()
	move_anchor()
	cross_bodies()
	highest = maxf(highest, flyer.position.y + lowered)
	# The board banks into its turns, its nose where it is headed: at once, and for
	# three seconds after a crossing by degrees, as it turns over to the new world's up (turning_over).
	var wanted := (axes() * Basis(Vector3.FORWARD, turn * 0.6)).get_rotation_quaternion()
	board_turn = board_turn.slerp(wanted, 1.0 - exp(-delta * 2.5)) if turning_over() else wanted
	flyer.quaternion = board_turn
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
		# draws itself, its square filled. Its ground is drawn anew when it is next seen, and it is
		# seen from the frame after, once that drawing shows (after a crossing to the other world, the
		# texture it kept is that world's).
		var shown := ring >= OWN or high < 300.0 * cell
		var waking := ring < OWN and shown and stale[ring] and not lands[ring].visible
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
			lands[ring].visible = shown and not waking
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
	# The near sea stands in for grid 2, which draws no sea; once grid 2 is hidden (7,200 units up)
	# its texture is not drawn any more, and grid 3, which fills its square, draws the sea itself.
	water.visible = lands[2].visible and not on_moon


## The hand on the board, the player's or the corgi's as it chases clouds: the turn, a share of
## 0.55 radians a second, comes in by degrees, and the nose rises or falls toward a pitch no faster
## than PITCHES. The heading's turn this frame is returned.
func hand(delta: float, turning: float, pitch_to: float) -> float:
	turn = lerpf(turn, clampf(turning, -1.0, 1.0), 1.0 - exp(-delta * 2.5))
	pitching = lerpf(pitching, clampf((pitch_to - pitch) * 2.5, -PITCHES, PITCHES), 1.0 - exp(-delta * 4.0))
	pitch = clampf(pitch + pitching * delta, -STEEPEST, STEEPEST)
	return turn * 0.55 * delta


## The board's axes: its nose (-z) where it is headed, its top up from it.
func axes() -> Basis:
	return Basis(Vector3.UP, -heading) * Basis(Vector3.RIGHT, pitch)


## For three seconds after a crossing (cross_bodies) the board and the camera turn over to the new
## world's up by degrees, not at once.
func turning_over() -> bool:
	return elapsed < crossed_at + 3.0


## How far toward the crossing to the other world the board is: its height over this one's ground,
## a share of its heights over both: 0 on this ground, a half where it crosses (cross_bodies).
func crossing_share() -> float:
	var alt := flyer.position.y + lowered
	var other := universe_at(Vector2(flyer.position.x, flyer.position.z), alt).distance_to(Vector3.ZERO if on_moon else moon_at) - (Terrain.PLANET_RADIUS if on_moon else Terrain.MOON_RADIUS)
	return alt / maxf(alt + other, 1.0)


## The corgi flies itself: a wandering course at a steady height over the ground ahead, by way
## of the clouds, the tour off the planet and back, or the voyage to the moon and back. It turns the heading and the pitch as a
## hand would, by degrees; the heading's turn this frame is returned.
func fly_itself(delta: float, alt: float, ground: float, under: float, forward: Vector3) -> float:
	var wanted_turn := 0.0
	var wanted_climb := 0.0
	if voyage > 0.0 and elapsed > voyage and voyage_phase == 0:
		voyage_phase = 1
	var over_ground := alt - Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) if voyage_phase >= 2 else INF
	if on_moon:
		moon_lowest = minf(moon_lowest, over_ground)
	elif voyage_phase == 6:
		home_lowest = minf(home_lowest, over_ground)
	if voyage_phase == 3:
		voyage_held += delta
		if voyage_held > 15.0:
			voyage_phase = 4
	if voyage_phase in [1, 2, 4, 5]:
		return voyage_step(delta, alt, forward)
	if tour_phase > 0:
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
		wanted_turn = sin(flown * 0.0037) * 0.5 + sin(flown * 0.0013 + 1.0) * 0.4
		wanted_climb = clampf((ground + 22.0 - alt) * 0.7, -9.0, 14.0)
		var cloud: Variant = wisp_ahead(forward)
		if cloud != null:
			var to: Vector3 = cloud - flyer.position - Vector3(0.0, lowered, 0.0)
			if chasing:
				var wide: float = onward_chain.clouds[onward_chain.next][1] if not onward_chain.is_empty() else CLOUD_SIZE
				return chase(to + Vector3(-to.z, 0.0, to.x).normalized() * wide * aside, delta)
			var far := Vector2(to.x, to.z).length()
			wanted_turn = clampf(forward.signed_angle_to(Vector3(to.x, 0.0, to.z), Vector3.DOWN) * 2.5, -1.0, 1.0)
			# It climbs to a cloud as the way to it rises, and no steeper than the corgi dares.
			if far < 130.0:
				wanted_climb = clampf(to.y / maxf(far, 1.0) * speed + to.y * 0.4, -12.0, 26.0)
	if under < INF:
		wanted_climb = minf(wanted_climb, (under - 9.0 - alt) * 2.0)
	var ease := 1.0 - exp(-delta * 2.5)
	turn = lerpf(turn, clampf(wanted_turn, -1.0, 1.0), ease)
	pitch = lerpf(pitch, asin(clampf(wanted_climb / speed, -0.9, 0.9)), ease)
	pitching = 0.0
	return turn * 0.55 * delta


## With --chain the corgi flies at the cloud ahead as a player holds the keys: hard over until it
## is nearly headed there (hand). The heading's turn this frame is returned.
func chase(to: Vector3, delta: float) -> float:
	return hand(delta, wrapf(atan2(to.x, -to.z) - heading, -PI, PI) * 4.0, clampf(asin(clampf(to.normalized().y, -1.0, 1.0)), -STEEPEST, STEEPEST))


## With --moon the corgi flies to the moon and back: out toward the moon's middle, as fast as a
## chain's boost would take it; down to its ground, toward a place halfway between the one under it
## and the one under the sun, so it comes down by day; over it for fifteen seconds; out toward the
## planet's middle; and down to the planet's day side. The heading's turn this frame is returned
## while it is on its way.
func voyage_step(delta: float, alt: float, forward: Vector3) -> float:
	var here := Vector2(flyer.position.x, flyer.position.z)
	var bound_for_moon := voyage_phase <= 3
	if (voyage_phase == 1 or voyage_phase == 4) and on_moon == bound_for_moon:
		voyage_phase += 1
	var sky_axes := Terrain.anchor * Terrain.chart_frame(here)
	var at := universe_at(here, alt)
	if voyage_phase == 1 or voyage_phase == 4:
		boost = maxf(boost, 160.0)
		# Up first, as the other world may be under the horizon, and toward it the higher the board is.
		var toward := (sky_axes.transposed() * ((moon_at if bound_for_moon else Vector3.ZERO) - at)).normalized()
		return chase(toward + Vector3.UP * 2.0 * (1.0 - smoothstep(0.0, 0.3 * Terrain.radius, alt)), delta)
	if alt - Terrain.surface(here) < 250.0:
		voyage_phase += 1
		return chase(forward, delta)
	if alt > 2000.0:
		boost = maxf(boost, 160.0)
	# High up toward the day side; near the ground steeply down, under the board.
	if alt < 0.05 * Terrain.radius:
		return chase(forward + Vector3.DOWN * 3.0, delta)
	var middle := moon_at if on_moon else Vector3.ZERO
	var by_day := middle + ((at - middle).normalized() + sun_of_planet).normalized() * Terrain.radius
	return chase(sky_axes.transposed() * (by_day - at), delta)


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
		was.y -= by
		carry(Vector3.DOWN * by)


## High up, where nothing that stands on the chart's lattice is seen, the chart's anchor moves
## under the flyer once it is far from it: the new chart's axes are the old one's at that place,
## so the heading stays, and the flyer is at the new chart's origin. What kept a place in the
## old chart is let go, but for the chain of clouds the board is in, which is carried into the new
## one, and the grids' grounds are drawn anew.
func move_anchor() -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	if flyer.position.y + lowered < ANCHOR_FROM or here.length() < ANCHOR_REACH:
		return
	var old_anchor := Terrain.anchor
	Terrain.anchor = (Terrain.anchor * Terrain.chart_frame(here)).orthonormalized()
	Terrain.forget()
	flyer.position -= Vector3(here.x, 0.0, here.y)
	was -= Vector3(here.x, 0.0, here.y)
	carry(-Vector3(here.x, 0.0, here.y))
	for chart in charts:
		chart.set_shader_parameter("anchor_frame", Terrain.anchor)
	glints.clear()
	let_go()
	rechart_wisps(old_anchor)
	stale.fill(true)
	spires_from = Vector2.INF
	anchors += 1


## Forgets what stands at places of the chart: the landmarks.
func let_go() -> void:
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


## The spires of an old world: one mesh (landmarks.gd's spire_mesh) for all of them, placed where
## terrain.gd finds them and carried onto the sphere by their shader, so they are seen from far
## off and from high up, not with what lives near the ground.
func build_spires() -> void:
	spires.multimesh = MultiMesh.new()
	spires.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	spires.multimesh.mesh = Landmarks.spire_mesh()
	var stone := ShaderMaterial.new()
	stone.shader = preload("res://spire.gdshader")
	materials.append(stone)
	spires.material_override = stone
	spires.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	add_child(spires)


## Keeps the spires within 24,000 units of the flight: placed anew every 1,500 units flown, and at
## once when the chart's anchor has moved, so each stays where it stands on the planet. Their
## instances are written whole, as the clouds' are.
func tend_spires() -> void:
	var here := Vector2(flyer.position.x, flyer.position.z)
	if here.distance_to(spires_from) < 1500.0:
		return
	spires_from = here
	Terrain.spires = Terrain.spires_near(Terrain.planet_at(here), 24000.0)
	var placed := PackedFloat32Array()
	for spire in Terrain.spires:
		var turned := Basis(Vector3.UP, spire.x * 0.01).scaled(Vector3.ONE * spire.w)
		placed.append_array([turned.x.x, turned.y.x, turned.z.x, spire.x, turned.x.y, turned.y.y, turned.z.y, spire.y, turned.x.z, turned.y.z, turned.z.z, spire.z])
	spires.multimesh.instance_count = Terrain.spires.size()
	if not placed.is_empty():
		spires.multimesh.buffer = placed


## The clouds to fly through, in chains. Seven plots of 1,200 units in ten have one of CHAIN
## clouds. The first hangs 40 to 200 units over what stands under it, and is the one there is until
## it is flown through. Then the rest are laid from there (lay_chain), as a hand on the keys flies
## them (hand): from the way the board flew through, each next cloud is where it arrives in
## CLOUD_LINK seconds (the last, in up to LAST_LINK, over the air) at the boost the chain has
## earned, up a way that steepens from 30 to 45 degrees by 5 degrees a cloud, turned by 20 to 60
## degrees at each, at six tenths of the hand's fastest turn and climb. The boost doubles with each
## cloud of a chain, and the board is faster the higher it is, so a chain climbs ever faster, and its
## sixth cloud is over the air. A chain is the plot it starts in, the heading of the way it was
## first laid for, the side it turns to first, its clouds (a middle in the chart with its height,
## not the height taken off, and a radius: CLOUD_SIZE times how much faster the board is there;
## those not laid yet are where the first is, of no radius), and which of them is its next.
static func chain_start(plot: Vector2i) -> Dictionary:
	if Terrain.cell_hash(plot.x + 101, plot.y + 59) > CHAIN_SHARE:
		return {}
	var place := (Vector2(plot) + Vector2(0.2, 0.2) + Vector2(Terrain.cell_hash(plot.x, plot.y), Terrain.cell_hash(plot.y + 57, plot.x - 31)) * 0.6) * CLOUD_PLOT
	var at := Vector3(place.x, Terrain.roof(place) + 40.0 + 160.0 * Terrain.cell_hash(plot.x + 9, plot.y + 77), place.y)
	var clouds := [[at, cloud_size(at.y)]]
	for index in range(1, CHAIN):
		clouds.append([at, 0.0])
	return {"plot": plot, "heading": Terrain.cell_hash(plot.x + 7, plot.y + 3) * TAU, "clouds": clouds, "next": 0, "first": 0,
		"side": 1.0 if Terrain.cell_hash(plot.x + 3, plot.y + 11) < 0.5 else -1.0}


## Lays a chain's clouds after its first, flown through at that heading, pitch and speed by a chain
## of so many clouds, up to CHAIN of them: a flight a twentieth of a second at a time, as fly()
## flies it, the boost wearing off and the speed going toward it.
static func lay_chain(chain_at: Dictionary, heading: float, pitch: float, speed: float, chained: int) -> void:
	var plot: Vector2i = chain_at.plot
	var at: Vector3 = chain_at.clouds[0][0]
	var way := heading
	var side: float = chain_at.side
	var turn := 0.0
	var pitching := 0.0
	var step := 0.05
	for index in range(1, CHAIN):
		var count := chained + index - 1
		if count >= CHAIN:
			chain_at.clouds[index] = [at, 0.0]
			continue
		var rise := deg_to_rad(30.0 + 5.0 * mini(count - 1, 3) + 15.0 * Terrain.cell_hash(plot.x + 13 * index, plot.y - 7 * index))
		var boost := chain_boost(count)
		var last := count >= CHAIN - 1
		var time := 0.0
		while (time < CLOUD_LINK or (last and time < LAST_LINK and at.y < 55000.0)) and at.y < CHAIN_TOP:
			boost *= exp(-step / BOOST_FADES)
			speed = lerpf(speed, CRUISE + boost, 1.0 - exp(-step * 4.0))
			turn = lerpf(turn, clampf(wrapf(way - heading, -PI, PI) * 4.0, -0.6, 0.6), 1.0 - exp(-step * 2.5))
			heading += turn * 0.55 * step
			pitching = lerpf(pitching, clampf((rise - pitch) * 2.5, -PITCHES * 0.6, PITCHES * 0.6), 1.0 - exp(-step * 4.0))
			pitch += pitching * step
			at += Vector3(sin(heading) * cos(pitch), sin(pitch), -cos(heading) * cos(pitch)) * speed * step * soar_at(at.y)
			time += step
		at.y = minf(at.y, CHAIN_TOP)
		if at.y < 6000.0:
			at.y = maxf(at.y, Terrain.height(Vector2(at.x, at.z)) + 40.0)
		chain_at.clouds[index] = [at, cloud_size(at.y)]
		way += side * deg_to_rad(20.0 + 40.0 * Terrain.cell_hash(plot.x - 5 * index, plot.y + 17 * index))
		if Terrain.cell_hash(plot.x + 29 * index, plot.y + 31) < 0.6:
			side = -side


## How much faster the board is at a height (fly): 1 under SOARS_FROM.
static func soar_at(height: float) -> float:
	return 1.0 + maxf(height - SOARS_FROM, 0.0) / SOARS_BY


static func cloud_size(height: float) -> float:
	return CLOUD_SIZE * soar_at(height)


## The speed the cloud that makes a chain of so many gives: it doubles with each cloud.
static func chain_boost(clouds: int) -> float:
	return CLOUD_BOOST * pow(2.0, clampi(clouds, 1, CHAIN) - 1)


## The clouds: one mesh for all of them (wisp.gdshader), a ball of radius 1 and five sparks that
## whirl around it, which the shader knows by their second UV, drawn again as a haze of light
## around each (halo.gdshader); and the burst of light that leaves
## one as it is flown through.
func build_wisps() -> void:
	for at in 25:
		near_first.append(Vector2i(at % 5 - 2, at / 5 - 2))
	near_first.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.length_squared() < b.length_squared())
	var ball := SphereMesh.new()
	ball.radial_segments = 32
	ball.rings = 16
	var puff := SphereMesh.new()
	puff.radial_segments = 8
	puff.rings = 4
	var arrays := Parts.arrays_of(ball)
	var puffs := Parts.arrays_of(puff)
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX].duplicate()
	var normals: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL].duplicate()
	var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX].duplicate()
	var marks := PackedVector2Array()
	marks.resize(vertices.size())
	for small in 5:
		var first := vertices.size()
		for vertex: Vector3 in puffs[Mesh.ARRAY_VERTEX]:
			vertices.append(vertex)
			marks.append(Vector2(1.0, small))
		normals.append_array(puffs[Mesh.ARRAY_NORMAL])
		for index: int in puffs[Mesh.ARRAY_INDEX]:
			indices.append(first + index)
	var all := []
	all.resize(Mesh.ARRAY_MAX)
	all[Mesh.ARRAY_VERTEX] = vertices
	all[Mesh.ARRAY_NORMAL] = normals
	all[Mesh.ARRAY_TEX_UV2] = marks
	all[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, all)
	wisps.transform_format = MultiMesh.TRANSFORM_3D
	wisps.use_colors = true
	wisps.use_custom_data = true
	wisps.mesh = mesh
	var look := ShaderMaterial.new()
	look.shader = preload("res://wisp.gdshader")
	materials.append(look)
	var drawn := MultiMeshInstance3D.new()
	drawn.multimesh = wisps
	drawn.material_override = look
	drawn.custom_aabb = AABB(Vector3.ONE * -1e7, Vector3.ONE * 2e7)
	drawn.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(drawn)
	var haze := ShaderMaterial.new()
	haze.shader = preload("res://halo.gdshader")
	materials.append(haze)
	var hazes := MultiMeshInstance3D.new()
	hazes.multimesh = wisps
	hazes.material_override = haze
	hazes.custom_aabb = drawn.custom_aabb
	hazes.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(hazes)
	var flash := StandardMaterial3D.new()
	flash.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flash.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flash.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flash.albedo_color = Color(1.0, 0.85, 0.6, 0.0)
	var shell := SphereMesh.new()
	shell.radial_segments = 24
	shell.rings = 12
	burst.mesh = shell
	burst.material_override = flash
	burst.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(burst)


## How a cloud glows: how bright (x), and the clock when the chain's time for it runs out (y). Each chain
## shows its next cloud: its first until that is flown through, and then the one after the last
## flown through. The next cloud of the chain the board is in beats, faster as the chain's time
## runs out, and the one after it shows faintly. The others are not there (none of them, 0): those
## flown through, and those to come. Every cloud that is there counts (counts).
func wisp_glow(chain_at: Dictionary, index: int) -> Vector2:
	if chain_at.clouds[index][1] == 0.0:
		return Vector2.ZERO
	var going := elapsed < chain_ends and is_same(onward_chain, chain_at)
	if index == chain_at.next:
		return Vector2(2.6, chain_ends) if going else Vector2(1.4, 0.0)
	if going and index == chain_at.next + 1:
		return Vector2(0.45, 0.0)
	return Vector2.ZERO


## Whether a cloud is there to be flown through (wisp_glow).
func counts(chain_at: Dictionary, index: int) -> bool:
	return index < CHAIN and wisp_glow(chain_at, index).x > 0.0


## Notes how a cloud glows from now on, for the shader, which takes it there by degrees from how
## it glowed. The instances are kept here: the engine would read them back from the GPU.
func set_wisp(chain_at: Dictionary, index: int) -> void:
	if chain_at.is_empty() or index < 0 or index >= CHAIN:
		return
	var at: int = (chain_at.first + index) * 20
	var glow := wisp_glow(chain_at, index)
	laid[at + 15] = laid[at + 16]
	laid[at + 16] = glow.x
	laid[at + 18] = elapsed
	laid[at + 19] = glow.y


## Lays every cloud of `chains` out as an instance of `wisps`: its middle, as wide as it is; in
## its colour its place in its chain; in its custom data how it glows (set_wisp).
func lay_wisps() -> void:
	laid.clear()
	for plot: Vector2i in chains:
		var chain_at: Dictionary = chains[plot]
		if chain_at.is_empty():
			continue
		chain_at.first = laid.size() / 20
		for index in CHAIN:
			var at: Vector3 = chain_at.clouds[index][0]
			var wide: float = chain_at.clouds[index][1]
			var glow := wisp_glow(chain_at, index)
			laid.append_array([wide, 0.0, 0.0, at.x, 0.0, wide, 0.0, at.y, 0.0, 0.0, wide, at.z,
				index, 0.0, 0.0, glow.x, glow.x, 0.0, -100.0, glow.y])
	wisps.instance_count = laid.size() / 20
	if not laid.is_empty():
		wisps.buffer = laid


## Keeps the chains of the 25 plots around the flyer, starting one a frame while it is low enough
## to meet them, and the chain the board is in wherever it goes; and sees which cloud the board has
## flown through since the last frame.
func tend_wisps() -> void:
	var middle := Vector2i((Vector2(flyer.position.x, flyer.position.z) / CLOUD_PLOT).floor())
	var relaid := false
	for plot: Vector2i in chains.keys():
		if (absi(plot.x - middle.x) > 2 or absi(plot.y - middle.y) > 2) and not is_same(chains[plot], onward_chain):
			chains.erase(plot)
			relaid = true
	if flyer.position.y + lowered < 6000.0 and not on_moon:
		for near in near_first:
			if not chains.has(middle + near):
				chains[middle + near] = chain_start(middle + near)
				relaid = relaid or not chains[middle + near].is_empty()
				break
	if relaid:
		lay_wisps()
	var glows := false
	# A chain whose time ran out is over: its next cloud stays, a cloud to start a chain at.
	if chain > 0 and elapsed >= chain_ends:
		chain = 0
		var was_onward := onward_chain
		onward_chain = {}
		for index in CHAIN:
			set_wisp(was_onward, index)
		glows = true
	# The way flown since the last frame, in the chart with the heights not taken off: a cloud that
	# is there and whose middle is nearer to it than its reach is flown through.
	var from := was + Vector3(0.0, lowered, 0.0)
	var flew := flyer.position + Vector3(0.0, lowered, 0.0) - from
	for plot: Vector2i in chains:
		var chain_at: Dictionary = chains[plot]
		if chain_at.is_empty() or leaving:
			continue
		for index: int in [chain_at.next, chain_at.next + 1]:
			if not counts(chain_at, index):
				continue
			var at: Vector3 = chain_at.clouds[index][0]
			var along := clampf((at - from).dot(flew) / maxf(flew.length_squared(), 1e-6), 0.0, 1.0)
			if (from + flew * along).distance_to(at) < chain_at.clouds[index][1] * CLOUD_REACH:
				pass_wisp(chain_at, index)
				glows = true
				break
	if glows:
		wisps.buffer = laid
	# The burst of light that leaves a cloud flown through.
	var bursting := elapsed - burst_at
	burst.visible = bursting < 1.6
	burst.scale = Vector3.ONE * burst_wide * (1.2 + 3.0 * (1.0 - exp(-bursting * 2.2)))
	(burst.material_override as StandardMaterial3D).albedo_color.a = 0.35 * (1.0 - smoothstep(0.2, 1.6, bursting))
	# The shaders run rings of light out over the ground from the last eight clouds flown
	# through, every nine seconds each. They fade with a cloud's distance from the flyer, so
	# none comes or goes at once, and with the flyer's height.
	var here := Vector2(flyer.position.x, flyer.position.z)
	var pulses := PackedVector4Array()
	for at in glints:
		pulses.append(Vector4(at.x, at.y, elapsed - at.z, (1.0 - smoothstep(520.0, 760.0, Vector2(at.x, at.y).distance_to(here))) * (1.0 - smoothstep(2500.0, 5000.0, flyer.position.y + lowered))))
	pulses.resize(8)
	tell("pulses", pulses)


## A cloud flown through: the chain goes on if it came in time, or starts again; the score gains
## as many as the chain has clouds, and the board the boost of a chain of so many, twice the
## last's. The cloud after it is the one to make for. If the board did not come along this chain
## (a first cloud, a chain let lapse, or another chain's), the rest of it is laid anew from here,
## the way the board goes (lay_chain). A note rises with the chain.
func pass_wisp(chain_at: Dictionary, index: int) -> void:
	var along := elapsed < chain_ends and is_same(chain_at, onward_chain)
	passes += 1
	chain = chain + 1 if elapsed < chain_ends else 1
	taken.append("%d/%d" % [chain, int(chain_boost(chain))])
	if not along:
		chain_at.clouds[0] = chain_at.clouds[index]
		index = 0
		lay_chain(chain_at, heading, pitch, speed, chain)
	chain_at.next = index + 1
	longest = maxi(longest, chain)
	points += chain
	chain_ends = elapsed + CHAIN_TIME
	boost = chain_boost(chain)
	gained_at = elapsed
	gain.text = "+%d" % chain
	onward_chain = chain_at if counts(chain_at, chain_at.next) else {}
	if along:
		for each in CHAIN:
			set_wisp(chain_at, each)
	else:
		lay_wisps()
	var at: Vector3 = chain_at.clouds[index][0]
	glints.push_front(Vector4(at.x, at.z, elapsed, 1.0))
	glints.resize(mini(glints.size(), 8))
	bell.stream = chimes[mini(chain - 1, chimes.size() - 1)]
	bell.play()
	burst.position = at - Vector3(0.0, lowered, 0.0)
	burst_wide = chain_at.clouds[index][1]
	burst_at = elapsed


## The cloud the corgi flying itself makes for, or none, as a place in the chart with its height:
## with --chain the next of the chain it is in; else the nearest next cloud of a chain that lies
## ahead.
func wisp_ahead(forward: Vector3) -> Variant:
	if chasing and not onward_chain.is_empty():
		return onward_chain.clouds[onward_chain.next][0]
	var nearest: Variant = null
	var nearest_far := 1500.0
	for plot: Vector2i in chains:
		var chain_at: Dictionary = chains[plot]
		if chain_at.is_empty() or not counts(chain_at, chain_at.next):
			continue
		var to: Vector3 = chain_at.clouds[chain_at.next][0] - flyer.position
		to.y = 0.0
		var far := to.length()
		if far > 12.0 and far < nearest_far and to.dot(forward) > 0.5 * far:
			nearest = chain_at.clouds[chain_at.next][0]
			nearest_far = far
	return nearest


## With --cloud 1 a flight starts 120 units before the first cloud of the chain nearest the start,
## headed through it along the chain's first way.
func start_at_cloud() -> void:
	for plot in near_first:
		var chain_at := chain_start(plot)
		if chain_at.is_empty():
			continue
		chains[plot] = chain_at
		var first: Vector3 = chain_at.clouds[0][0]
		heading = chain_at.heading
		pitch = 0.0
		flyer.position = first - Vector3(sin(heading), 0.0, -cos(heading)) * 120.0
		seen = axes()
		lay_wisps()
		return


## Carries the chain the board is in into a new chart (move_anchor): each cloud stays where it is
## on the planet. The others are let go.
func rechart_wisps(old_anchor: Basis) -> void:
	var kept := onward_chain
	chains.clear()
	if not kept.is_empty():
		var new_anchor := Terrain.anchor
		for cloud: Array in kept.clouds:
			var at: Vector3 = cloud[0]
			Terrain.anchor = old_anchor
			var planet := Terrain.planet_at(Vector2(at.x, at.z))
			Terrain.anchor = new_anchor
			var there := Terrain.chart_of(planet)
			cloud[0] = Vector3(there.x, at.y, there.y)
		chains[CARRIED] = kept
	lay_wisps()


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
		# Let go, the view and its zoom come back, the view the short way round.
		zoom = lerpf(zoom, 1.0, 1.0 - exp(-delta * 1.0))
		look = Vector2(wrapf(look.x, -PI, PI), look.y).lerp(Vector2.ZERO, 1.0 - exp(-delta * 2.0))
		looked.x = wrapf(looked.x, look.x - PI, look.x + PI)
	looked = looked.lerp(look, 1.0 - exp(-delta * 14.0))
	zoom = clampf(zoom * exp(key_axis(KEY_Z, KEY_X) * delta * 1.2), 0.45, 3.2)
	# The camera follows the flyer's place and axes a little late, and turns about it: a straight
	# way between two places around the flyer would cut through it. Zoomed in it is less late, or
	# the flyer would be out of the middle of a close view. In the player's hands it follows the
	# heading and the pitch, and the mouse turns the view from there; while the corgi flies itself,
	# it follows the heading alone, upright. After a crossing to the other world it turns over to
	# the new up by degrees (turning_over).
	var late := 1.0 - exp(-delta * 5.0 / (minf(zoomed, 1.0) * minf(zoomed, 1.0)))
	trail = trail.lerp(flyer.position, late)
	seen = seen.slerp(axes() if helm else Basis(Vector3.UP, -heading), 1.0 - exp(-delta * 2.5) if turning_over() else late).orthonormalized()
	zoomed = lerpf(zoomed, zoom, 1.0 - exp(-delta * 6.0))
	# The mouse's view: around the up, and over or under the flyer up to almost straight.
	var seen_pitch := asin(clampf(-seen.z.y, -1.0, 1.0))
	var looked_round := Basis(Vector3.UP, -looked.x) * seen * Basis(Vector3.RIGHT, -clampf(looked.y, seen_pitch - 1.5, seen_pitch + 1.5))
	# From high up the camera looks down: the planet's rim lies under eye level by the dip of
	# the horizon. Most of the dip is added to the view's pitch, and from space more than
	# that, toward straight down: the flyer is then seen over the planet, which is near the
	# view's middle and round in it (a sphere at a wide view's edge is drawn out). Toward the
	# crossing to the other world (cross_bodies) it looks down less, and there not at all:
	# neither world draws it down there, so it does not turn from the one to the other.
	var dip := acos(Terrain.radius / (Terrain.radius + maxf(flyer.position.y + lowered, 0.0)))
	var down := smoothstep(0.03, 0.9, dip) * (1.0 - smoothstep(0.35, 0.5, crossing_share()))
	var frame := Basis(Vector3(looked_round.x.x, 0.0, looked_round.x.z).normalized(), -dip * 0.9 * down - (PI / 2.0 - dip) * 0.6 * down * down) * looked_round
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
	# The next cloud of the chain going on, if it is off the screen: the way to it from the middle.
	touch.next_way = Vector2.ZERO
	if not onward_chain.is_empty() and elapsed < chain_ends:
		var next: Vector3 = onward_chain.clouds[onward_chain.next][0] - Vector3(0.0, lowered, 0.0)
		var seen_at := camera.unproject_position(next)
		var middle := get_viewport().get_visible_rect().size / 2.0
		if camera.is_position_behind(next) or absf(seen_at.x - middle.x) > middle.x * 0.92 or absf(seen_at.y - middle.y) > middle.y * 0.92:
			var to := camera.global_basis.inverse() * (next - camera.position)
			touch.next_way = Vector2(to.x, -to.y).normalized()
	var eye_height := camera.position.y + lowered
	# Higher up the nearest thing drawn is the flyer, and the furthest the planet's other rim.
	camera.near = lerpf(0.3, 1.2, smoothstep(2000.0, 20000.0, eye_height))
	tell("eye", camera.position + Vector3(0.0, lowered, 0.0))
	# It rains, or in winter snows, where the cloud over the camera is deep.
	var cloud_over := 0.0 if on_moon else Terrain.cloud_depth(Vector2(camera.position.x, camera.position.z), weather * elapsed)
	falls = lerpf(falls, smoothstep(0.66, 0.78, cloud_over) * (1.0 - smoothstep(Terrain.CLOUD_HEIGHT - 60.0, Terrain.CLOUD_HEIGHT, eye_height)), 1.0 - exp(-delta * 1.5))
	sky_material.set_shader_parameter("rains", falls)
	# Rain is heard (snow is not), and so is the sea under a low flight.
	patter.volume_db = linear_to_db(maxf(0.22 * falls * (1.0 - season_share(0.85)), 0.0001))
	var over_sea_by := flyer.position.y + lowered - Terrain.SEA
	var sea_near := (1.0 - smoothstep(14.0, 70.0, over_sea_by)) if not on_moon and Terrain.ground(Vector2(flyer.position.x, flyer.position.z)) < Terrain.SEA + 1.5 else 0.0
	sea_heard = lerpf(sea_heard, sea_near, 1.0 - exp(-delta * 1.2))
	wash.volume_db = linear_to_db(maxf(0.35 * sea_heard, 0.0001))
	# In a cloud the air is white.
	# In a cloud the air is white: in a low cloud's ball, and on the way through the cloud
	# layer where cloud stands in it. The sky's shader shows the layer from under it and the
	# land's from over it; in it, it is this white.
	var in_layer := smoothstep(0.5, 0.7, cloud_over) * smoothstep(Terrain.CLOUD_HEIGHT - 110.0, Terrain.CLOUD_HEIGHT - 20.0, eye_height) * (1.0 - smoothstep(Terrain.CLOUD_HEIGHT + 40.0, Terrain.CLOUD_HEIGHT + 240.0, eye_height))
	clouded = lerpf(clouded, maxf(in_cloud(camera.position) if eye_height < 2500.0 and not on_moon else 0.0, in_layer), 1.0 - exp(-delta * 1.5))
	# The haze thins with height: from over it the far ranges stand clear, and in space there
	# is none between the eye and the planet but the planet's own (land.gdshader's veil).
	var thin := exp(-eye_height / 900.0)
	# The moon has no air: no haze, no mist, no fog.
	var air_here := 0.0 if on_moon else 1.0
	environment.fog_density = lerpf(0.00045 * thin + 0.00004 * exp(-eye_height / AIR), 0.01, clouded) * air_here
	environment.fog_height_density = mist_density * exp(-eye_height / 500.0) * air_here
	environment.volumetric_fog_density = 0.0011 * exp(-eye_height / 1500.0) * air_here
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
	sun_of_planet = sun_frame * Vector3(cos(angle), sin(angle) * 0.85, 0.42).normalized()
	var here := Vector2(flyer.position.x, flyer.position.z)
	var to_sun := (Terrain.anchor * Terrain.chart_frame(here)).transposed() * sun_of_planet
	var height := to_sun.y
	var dip := acos(Terrain.radius / (Terrain.radius + maxf(flyer.position.y + lowered, 0.0)))
	var seen := sin(minf(asin(clampf(height, -1.0, 1.0)) + dip, PI / 2.0))
	# The other world hides the sun too where it stands before it, by degrees at its rim.
	var from := universe_at(here, maxf(flyer.position.y + lowered, 0.0))
	var to_other := (Vector3.ZERO if on_moon else moon_at) - from
	var along := to_other.dot(sun_of_planet)
	if along > 0.0:
		var other_radius := Terrain.PLANET_RADIUS if on_moon else Terrain.MOON_RADIUS
		seen = lerpf(seen, -0.1, smoothstep(other_radius * 1.02, other_radius * 0.98, (to_other - sun_of_planet * along).length()))
	var out_of_air := 1.0 if on_moon else 1.0 - exp(-maxf(flyer.position.y + lowered, 0.0) / AIR)
	var sunlight := smoothstep(-0.04, 0.12, seen)
	var low_sun := smoothstep(-0.25, 0.0, height) * (1.0 - smoothstep(0.05, 0.45, height))
	var night := smoothstep(0.02, 0.3, -height)
	# The moon has no air to redden the sun.
	var warm := Color(1.0, 0.98, 0.95) if on_moon else Color(1.0, 0.42, 0.18).lerp(Color(1.0, 0.95, 0.86), smoothstep(0.0, 0.45, seen))
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
	set_bodies()
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
	print("FLYOVER seconds %.1f frames %d fps %.1f gpu %.1f cpu %.1f flown %d clouds %d score %d longest %d" % [elapsed, frames, steady / steady_seconds, gpu_milliseconds / timed, cpu_milliseconds / timed, int(flown), passes, points, longest])
	print("FLYOVER taken %s" % " ".join(taken))
	print("FLYOVER highest %d anchors %d" % [int(highest), anchors])
	print("FLYOVER moon crossings %d lowest %d home %d" % [crossings, int(minf(moon_lowest, 999999.0)), int(minf(home_lowest, 999999.0))])
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
