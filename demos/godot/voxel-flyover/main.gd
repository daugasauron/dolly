extends Node3D
## Voxel Flyover: a corgi on a jet surfboard flies over an endless world, from dawn through the day
## into night. The world is a function (terrain.gdshaderinc): the GPU draws its ground into
## textures as the flight goes, raises grids of land to it and stands trees on it, and nothing of
## it is kept. The corgi flies itself until Enter takes the board.
##
## `-- --autopilot SECONDS` flies by itself, prints its frame rate, the time a frame took and what
## the frame shows, and quits: Dolly's test uses it. `--day HOUR` starts at that hour of 24.

const Terrain := preload("res://terrain.gd")
## The grids of land around the flyer, each around the one before: cells across, a cell's width.
const RINGS := [[256, 1.5], [256, 6.0], [192, 24.0]]
## The grids follow the flight in steps of the coarsest cell, so every point stays where it is.
const STEP := 24.0
const PLOT := 4.0 # a tree's plot
## The trees' grids, the finer in the middle of the coarser: plots across, a crown's rings.
const GROVES := [[50, 12], [128, 5]]
const DAY_SECONDS := 120.0
const CRUISE := 30.0
const BOOST := 26.0
const CEILING := 190.0
const BEACON_PLOT := 180.0
const BEACON_REACH := 8.0
const START := Vector2(2000, -400)
const WAKE := 64 # the places the wake keeps
const WAKE_APART := 1.2
## The camera's views while the corgi flies itself, each for SHOT_SECONDS: where it stands in the
## flyer's frame, where it looks, and its field of view.
const SHOTS := [
	[Vector3(4.6, 3.6, 9.5), Vector3(-2, -0.5, -25), 66.0],
	[Vector3(-9, 1.2, -5.5), Vector3(4, 0.4, 1), 56.0],
	[Vector3(9, 26, 34), Vector3(0, -10, -70), 74.0],
	[Vector3(5.5, 1.8, -11.5), Vector3(-1, 1.0, 6), 58.0],
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
var cape_material := ShaderMaterial.new()
var wake_material := ShaderMaterial.new()
var wake := PackedVector3Array()
var tail: MeshInstance3D
var flames: Array[MeshInstance3D] = []
var searchlight := SpotLight3D.new()
var lamp := OmniLight3D.new()
var hud := CanvasLayer.new()
var title := Label.new()
var hint := Label.new()
var gauge := Label.new()
var engine := AudioStreamPlayer.new()
var bell := AudioStreamPlayer.new()
var beacons := {} # plot -> its node, for the plots around the flyer
var lit := {} # plot -> where it stands (x, y) and the clock when it was lit (z)

var helm := false # the player's, after Enter
var hint_until := 0.0 # the keys show for a while after the board changes hands
var day := 0.24
var heading := PI / 2.0 # east, over the bay
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
	for grove: Array in GROVES:
		groves.append(build_grid(tree_mesh(grove[1]), grove[0], PLOT, reads_ground(preload("res://trees.gdshader"), 0)))
		materials[-1].set_shader_parameter("plot", PLOT)
		materials[-1].set_shader_parameter("near", GROVES[0][0] * PLOT / 2.0)
		materials[-1].set_shader_parameter("coarse", grove != GROVES[0])
		materials[-1].set_shader_parameter("end", grove[0] * PLOT / 2.0 - PLOT)
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
	if autopilot_seconds > 0.0:
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
	material.set_shader_parameter("reach", RINGS[ring][0] * RINGS[ring][1] / 2.0)
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


## A tree standing on y = 0 for trees.gdshader to shape: a trunk up to 0.9, and over it a ball
## of that many rings, around (0, 2, 0), for its crown.
static func tree_mesh(rings: int) -> ArrayMesh:
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.7
	trunk.bottom_radius = 1.0
	trunk.height = 0.9
	trunk.radial_segments = 6
	trunk.rings = 0
	trunk.cap_top = false
	trunk.cap_bottom = false
	var crown := SphereMesh.new()
	crown.radius = 1.0
	crown.height = 2.0
	crown.radial_segments = rings + 2
	crown.rings = rings
	var tool := SurfaceTool.new()
	tool.append_from(trunk, 0, Transform3D(Basis.IDENTITY, Vector3(0, 0.45, 0)))
	tool.append_from(crown, 0, Transform3D(Basis.IDENTITY, Vector3(0, 2, 0)))
	return tool.commit()


static func paint(colour: Color, roughness: float, glow := 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = colour
	material.roughness = roughness
	material.emission_enabled = glow > 0.0
	material.emission = colour
	material.emission_energy_multiplier = glow
	return material


func part(to: Node3D, mesh: Mesh, material: Material, place: Vector3, turn := Vector3.ZERO, size := Vector3.ONE) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	instance.position = place
	instance.rotation_degrees = turn
	instance.scale = size
	to.add_child(instance)
	return instance


## The flyer: a corgi in sunglasses and a cape, standing on a surfboard that two small jets carry.
## It looks along -z.
func build_flyer() -> void:
	var fur := paint(Color(0.85, 0.47, 0.16), 0.75)
	var white := paint(Color(0.95, 0.93, 0.88), 0.8)
	var black := paint(Color(0.015, 0.015, 0.02), 0.08)
	var pink := paint(Color(0.9, 0.45, 0.5), 0.6)
	var steel := paint(Color(0.45, 0.47, 0.5), 0.3)
	steel.metallic = 0.8
	var ball := SphereMesh.new()
	var rod := CapsuleMesh.new()
	var point := CylinderMesh.new()
	point.top_radius = 0.0
	# The board: teal with a cream stripe, a fin under its tail.
	part(flyer, ball, paint(Color(0.05, 0.55, 0.6), 0.25), Vector3.ZERO, Vector3.ZERO, Vector3(2.0, 0.28, 6.4))
	part(flyer, ball, paint(Color(0.95, 0.9, 0.75), 0.3), Vector3(0, 0.03, 0), Vector3.ZERO, Vector3(0.5, 0.28, 6.1))
	part(flyer, point, steel, Vector3(0, -0.4, 2.3), Vector3(200, 0, 0), Vector3(0.12, 0.35, 0.7))
	# The jets, one under each rail, and their flames.
	var flame := StandardMaterial3D.new()
	flame.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	flame.albedo_color = Color(0.25, 0.7, 1.6)
	for x: float in [-0.95, 0.95]:
		part(flyer, rod, steel, Vector3(x, -0.3, 1.9), Vector3(90, 0, 0), Vector3(0.55, 0.75, 0.55))
		part(flyer, ball, paint(Color(1.0, 0.7, 0.35), 0.4, 6.0), Vector3(x, -0.3, 2.62), Vector3.ZERO, Vector3(0.38, 0.38, 0.2))
		flames.append(part(flyer, point, flame, Vector3(x, -0.3, 3.5), Vector3(90, 0, 0), Vector3(0.3, 0.7, 0.3)))
		flames[-1].cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# The corgi: long and low, white in front and under, with large ears.
	var dog := Node3D.new()
	dog.position = Vector3(0, 0.14, 0.2)
	flyer.add_child(dog)
	part(dog, rod, fur, Vector3(0, 0.95, 0.25), Vector3(90, 0, 0), Vector3(1.15, 1.25, 1.1))
	part(dog, ball, white, Vector3(0, 0.82, -0.55), Vector3.ZERO, Vector3(1.0, 0.95, 1.0))
	part(dog, ball, fur, Vector3(0, 0.98, 1.38), Vector3.ZERO, Vector3(1.0, 1.0, 0.8))
	part(dog, ball, white, Vector3(0, 0.72, 1.5), Vector3.ZERO, Vector3(0.8, 0.6, 0.6))
	tail = part(dog, ball, fur, Vector3(0, 1.3, 1.62), Vector3.ZERO, Vector3(0.3, 0.3, 0.42))
	for x: float in [-0.36, 0.36]:
		for z: float in [-0.6, 1.1]:
			part(dog, rod, white, Vector3(x, 0.3, z), Vector3.ZERO, Vector3(0.3, 0.32, 0.3))
			part(dog, ball, white, Vector3(x, 0.06, z - 0.08), Vector3.ZERO, Vector3(0.34, 0.2, 0.46))
	var head := Node3D.new()
	head.position = Vector3(0, 1.62, -1.0)
	head.rotation_degrees.x = 8.0
	dog.add_child(head)
	part(head, ball, fur, Vector3.ZERO, Vector3.ZERO, Vector3(1.12, 1.02, 1.05))
	part(head, ball, white, Vector3(0, -0.14, -0.5), Vector3.ZERO, Vector3(0.56, 0.46, 0.8))
	part(head, ball, white, Vector3(0, 0.1, -0.36), Vector3(20, 0, 0), Vector3(0.22, 0.5, 0.5))
	part(head, ball, black, Vector3(0, -0.06, -0.9), Vector3.ZERO, Vector3(0.2, 0.15, 0.14))
	part(head, ball, pink, Vector3(0, -0.36, -0.72), Vector3(25, 0, 0), Vector3(0.2, 0.06, 0.3))
	for x: float in [-1.0, 1.0]:
		part(head, point, fur, Vector3(x * 0.4, 0.62, 0.12), Vector3(-8, 0, x * -16), Vector3(0.6, 0.4, 0.3))
		part(head, point, pink, Vector3(x * 0.4, 0.6, 0.07), Vector3(-8, 0, x * -16), Vector3(0.32, 0.32, 0.12))
		# The sunglasses: two dark lenses and a bar across the nose.
		part(head, ball, black, Vector3(x * 0.25, 0.13, -0.47), Vector3(8, x * -14, 0), Vector3(0.44, 0.3, 0.1))
	var bar := BoxMesh.new()
	bar.size = Vector3(0.96, 0.05, 0.05)
	part(head, bar, black, Vector3(0, 0.2, -0.45))
	# The cape, from a red collar.
	var collar := TorusMesh.new()
	collar.inner_radius = 0.42
	collar.outer_radius = 0.6
	part(dog, collar, paint(Color(0.8, 0.05, 0.08), 0.6), Vector3(0, 1.3, -0.62), Vector3(68, 0, 0))
	var cloth := PlaneMesh.new()
	cloth.size = Vector2(1.0, 2.5)
	cloth.center_offset = Vector3(0, 0, 1.25)
	cloth.subdivide_width = 4
	cloth.subdivide_depth = 16
	cape_material.shader = preload("res://cape.gdshader")
	part(dog, cloth, cape_material, Vector3(0, 1.72, -0.5), Vector3(-22, 0, 0))
	# The wake, a ribbon the shader lays along where the board has been.
	var ribbon := PlaneMesh.new()
	ribbon.subdivide_width = WAKE - 2
	ribbon.subdivide_depth = 0
	wake_material.shader = preload("res://wake.gdshader")
	var trail := part(self, ribbon, wake_material, Vector3.ZERO)
	trail.custom_aabb = AABB(Vector3.ONE * -1e6, Vector3.ONE * 2e6)
	trail.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# The headlight under the nose, and the searchlight it turns on the ground at night.
	var lantern := part(flyer, ball, paint(Color(1.0, 0.72, 0.3), 0.3, 6.0), Vector3(0, -0.2, -2.6), Vector3.ZERO, Vector3(0.3, 0.3, 0.3))
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
	for label: Label in [title, hint, gauge]:
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
	gauge.add_theme_font_size_override("font_size", 26)
	gauge.position = Vector2(36, 28)
	show_helm()


func show_helm() -> void:
	title.visible = not helm and autopilot_seconds <= 0.0
	hint.visible = autopilot_seconds <= 0.0
	hint_until = elapsed + 12.0
	hint.text = "Arrows or WASD steer, climb and dive    Space: full speed    T: let the hours run    Esc: let go    Q: quit" if helm \
		else "The corgi flies itself. Enter takes the board.    Q: quit"


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey and event.pressed and not event.echo) or autopilot_seconds > 0.0:
		return
	match (event as InputEventKey).physical_keycode:
		KEY_ENTER, KEY_KP_ENTER:
			helm = true
		KEY_ESCAPE:
			helm = false
		KEY_Q:
			leave()
	show_helm()


## Quits once the mixer has let go of the sounds, which Godot counts as leaked otherwise.
func leave() -> void:
	engine.stop()
	bell.stop()
	await get_tree().create_timer(0.3).timeout
	get_tree().quit()


func key_axis(negative: Key, positive: Key) -> float:
	return float(Input.is_physical_key_pressed(positive)) - float(Input.is_physical_key_pressed(negative))


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	elapsed += delta
	var hours := 8.0 if helm and Input.is_physical_key_pressed(KEY_T) else 1.0
	day = fposmod(day + delta * hours / DAY_SECONDS, 1.0)
	tell("clock", elapsed)
	set_day()
	fly(delta)
	tend_beacons(delta)
	follow(delta)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	hint.modulate.a = clampf(hint_until - elapsed, 0.0, 1.0)
	gauge.text = "%02d:%02d    altitude %d    speed %d    beacons lit %d" % [int(day * 24.0), int(fposmod(day * 24.0, 1.0) * 60.0), int(flyer.position.y - Terrain.SEA), int(speed), lit.size()]
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
		wanted_climb = maxf(wanted_climb, (ground + 9.0 - flyer.position.y) * 2.0)
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
	flyer.position.y = maxf(flyer.position.y, Terrain.surface(Vector2(flyer.position.x, flyer.position.z)) + 5.0)
	# The board banks into its turns and noses up into its climbs; the corgi's tail wags.
	flyer.rotation = Vector3(climb * 0.02, -heading, -turn * 0.6)
	tail.rotation.y = sin(elapsed * 11.0) * 0.6
	for flame in flames:
		flame.scale.y = (0.6 + 0.5 * speed / CRUISE) * (0.9 + 0.2 * sin(elapsed * 47.0))
	cape_material.set_shader_parameter("speed", speed / CRUISE)
	engine.pitch_scale = 0.8 + speed / CRUISE * 0.3
	# The wake keeps a place for every stretch flown, the newest at the board's tail.
	wake[0] = flyer.to_global(Vector3(0, 0, 2.9))
	if wake[0].distance_to(wake[1]) > WAKE_APART:
		wake.insert(1, wake[0])
		wake.resize(WAKE)
	wake_material.set_shader_parameter("path", wake)
	wake_material.set_shader_parameter("lead", wake[0].distance_to(wake[1]) / WAKE_APART)
	wake_material.set_shader_parameter("clock", elapsed)
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
	tell("near_middle", among)
	water.position = Vector3(flyer.position.x, Terrain.SEA - 0.2, flyer.position.z)


## The beacon of a plot of the world: where it floats, or nothing where the plot's place is sea.
static func beacon_place(plot: Vector2i) -> Variant:
	var p := (Vector2(plot) + Vector2(0.15, 0.15) + Vector2(Terrain.cell_hash(plot.x, plot.y), Terrain.cell_hash(plot.y + 57, plot.x - 31)) * 0.7) * BEACON_PLOT
	var ground := Terrain.height(p)
	if ground < Terrain.SEA + 2.0 or ground > Terrain.SEA + 130.0:
		return null
	return Vector3(p.x, ground + 16.0, p.y)


## Keeps the beacons of the nine plots around the flyer, and lights the one it reaches.
func tend_beacons(delta: float) -> void:
	var middle := Vector2i((Vector2(flyer.position.x, flyer.position.z) / BEACON_PLOT).floor())
	for plot: Vector2i in beacons.keys():
		if absi(plot.x - middle.x) > 1 or absi(plot.y - middle.y) > 1:
			beacons[plot].queue_free()
			beacons.erase(plot)
	for x in range(middle.x - 1, middle.x + 2):
		for y in range(middle.y - 1, middle.y + 2):
			var plot := Vector2i(x, y)
			if not beacons.has(plot):
				var place: Variant = beacon_place(plot)
				if place != null:
					beacons[plot] = build_beacon(place, lit.has(plot))
	for plot: Vector2i in beacons:
		var beacon: Node3D = beacons[plot]
		beacon.get_child(0).rotate_y(delta * 1.3)
		if not lit.has(plot) and beacon.position.distance_to(flyer.position) < BEACON_REACH:
			lit[plot] = Vector4(beacon.position.x, beacon.position.z, elapsed, 1.0)
			beacon.queue_free()
			beacons[plot] = build_beacon(beacon.position, true)
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
func build_beacon(place: Vector3, alight: bool) -> Node3D:
	var colour := Color(1.0, 0.62, 0.15) if alight else Color(0.2, 0.8, 1.0)
	var beacon := Node3D.new()
	beacon.position = place
	var gem := Node3D.new()
	beacon.add_child(gem)
	var point := CylinderMesh.new()
	point.top_radius = 0.0
	point.bottom_radius = 1.5
	point.height = 2.2
	point.radial_segments = 6
	point.rings = 1
	var glass := paint(colour, 0.15, 2.5 if alight else 1.5)
	part(gem, point, glass, Vector3(0, 1.1, 0))
	part(gem, point, glass, Vector3(0, -1.1, 0), Vector3(180, 0, 0))
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
	light.set_shader_parameter("strength", 0.7 if alight else 0.35)
	part(beacon, column, light, Vector3(0, 64, 0)).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var glow := OmniLight3D.new()
	glow.light_color = colour
	glow.light_energy = 8.0 if alight else 3.0
	glow.omni_range = 50.0
	beacon.add_child(glow)
	add_child(beacon)
	return beacon


## The nearest beacon not yet lit that lies ahead, for the corgi flying itself.
func beacon_ahead(forward: Vector3) -> Node3D:
	var nearest: Node3D = null
	for plot: Vector2i in beacons:
		var to: Vector3 = beacons[plot].position - flyer.position
		to.y = 0.0
		if not lit.has(plot) and to.length() > 12.0 and to.normalized().dot(forward) > 0.5 and (nearest == null or to.length() < (nearest.position - flyer.position).length()):
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
	var frame := Basis(Vector3.UP, -heading)
	var place := camera.position.lerp(flyer.position + frame * view, 1.0 - exp(-delta * 5.0))
	place.y = maxf(place.y, Terrain.surface(Vector2(place.x, place.z)) + 6.0)
	camera.position = place
	camera.look_at(flyer.position + frame * aim)


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
	if frames > 120:
		var viewport := get_viewport().get_viewport_rid()
		gpu_milliseconds += RenderingServer.viewport_get_measured_render_time_gpu(viewport)
		cpu_milliseconds += RenderingServer.viewport_get_measured_render_time_cpu(viewport) + RenderingServer.get_frame_setup_time_cpu()
	if elapsed < autopilot_seconds:
		return
	autopilot_seconds = 0.0
	var steady := frames - 120
	print("FLYOVER seconds %.1f frames %d fps %.1f gpu %.1f cpu %.1f flown %d beacons %d" % [elapsed, frames, steady * 1000.0 / (Time.get_ticks_msec() - steady_from), gpu_milliseconds / steady, cpu_milliseconds / steady, int(flown), lit.size()])
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
