extends Node3D
## Voxel Flyover: an airship's flight over an endless world of blocks, from dawn through the day
## into night. The world is a function (terrain.gdshaderinc): the GPU's vertex stage raises a grid
## of boxes that follows the airship into its ground, trees and clouds, and nothing of it is kept.
## The airship flies itself until Enter takes the helm.
##
## `-- --autopilot SECONDS` flies by itself, prints its frame rate and what its frame shows, and
## quits: Dolly's test uses it. `--day HOUR` starts at that hour of 24, `--scale FACTOR` renders
## the 3D view smaller and `--plain` leaves out SSAO and the volumetric fog.

const Terrain := preload("res://terrain.gd")
const NEAR := 256 # columns across the near grid, one unit each
const FAR := 256 # columns across the far grid, FAR_CELL units each
const FAR_CELL := 4.0
const PLOT := 5.0 # a tree's plot
const PLOTS := 80
const CLOUD_CELL := 16.0
const CLOUDS := 64
const CLOUD_HEIGHT := 196.0
const DAY_SECONDS := 120.0
const CRUISE := 30.0
const BOOST := 26.0
const CEILING := 180.0
const BEACON_PLOT := 220.0
const BEACON_REACH := 8.0
const START := Vector2(281, 2156)

var environment := Environment.new()
var sky_material := ShaderMaterial.new()
var sun := DirectionalLight3D.new()
var camera := Camera3D.new()
var followers: Array[MultiMeshInstance3D] = []
var far_material: ShaderMaterial
var clouds: MultiMeshInstance3D
var water := MeshInstance3D.new()
var ship := Node3D.new()
var propeller: MeshInstance3D
var searchlight := SpotLight3D.new()
var lamp := OmniLight3D.new()
var hud := CanvasLayer.new()
var title := Label.new()
var hint := Label.new()
var gauge := Label.new()
var engine := AudioStreamPlayer.new()
var bell := AudioStreamPlayer.new()
var beacons := {} # plot -> its node, for the plots around the airship
var lit := {} # plot -> true
var trees_material: ShaderMaterial

var helm := false # the player's, after Enter
var day := 0.24
var heading := 0.0
var turn := 0.0
var climb := 0.0
var speed := CRUISE
var flown := 0.0
var wind := Vector2.ZERO
var view_swing := 0.0
var autopilot_seconds := 0.0
var elapsed := 0.0
var frames := 0
var steady_from := 0


func option(name: String, otherwise: float) -> float:
	var arguments := OS.get_cmdline_user_args()
	var at := arguments.find(name)
	return arguments[at + 1].to_float() if at >= 0 and at + 1 < arguments.size() else otherwise


func _ready() -> void:
	autopilot_seconds = option("--autopilot", 0.0)
	day = option("--day", day * 24.0) / 24.0
	get_viewport().scaling_3d_scale = option("--scale", 1.0)
	build_light("--plain" in OS.get_cmdline_user_args())
	var columns := preload("res://columns.gdshader")
	followers.append(build_grid(BoxMesh.new(), NEAR, 1.0, columns, true))
	followers.append(build_grid(BoxMesh.new(), FAR, FAR_CELL, columns, false))
	far_material = followers[1].material_override
	far_material.set_shader_parameter("hole", NEAR / 2.0)
	followers.append(build_grid(tree_mesh(), PLOTS, PLOT, preload("res://trees.gdshader"), true))
	trees_material = followers[2].material_override
	clouds = build_grid(BoxMesh.new(), CLOUDS, CLOUD_CELL, preload("res://clouds.gdshader"), true)
	(clouds.multimesh.mesh as BoxMesh).size = Vector3(CLOUD_CELL, 5.0, CLOUD_CELL)
	var plane := PlaneMesh.new()
	plane.size = Vector2(2400, 2400)
	water.mesh = plane
	var water_material := ShaderMaterial.new()
	water_material.shader = preload("res://water.gdshader")
	water.material_override = water_material
	water.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(water)
	build_ship()
	camera.fov = 68.0
	camera.far = 1100.0
	camera.near = 0.3
	add_child(camera)
	build_hud()
	ship.position = Vector3(START.x, Terrain.surface(START) + 30.0, START.y)
	camera.position = ship.position + Vector3(0, 5, 14)
	if autopilot_seconds > 0.0:
		print("FLYOVER adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())


func build_light(plain: bool) -> void:
	sky_material.shader = preload("res://sky.gdshader")
	var sky := Sky.new()
	sky.sky_material = sky_material
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.ambient_light_sky_contribution = 0.45
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	environment.tonemap_white = 6.0
	environment.glow_enabled = true
	environment.glow_intensity = 0.7
	environment.glow_bloom = 0.05
	environment.glow_hdr_threshold = 1.1
	environment.ssao_enabled = not plain
	environment.ssao_radius = 2.0
	environment.ssao_intensity = 2.2
	environment.fog_enabled = true
	environment.fog_mode = Environment.FOG_MODE_DEPTH
	environment.fog_depth_begin = 220.0
	environment.fog_depth_end = 600.0
	environment.fog_depth_curve = 1.4
	environment.fog_aerial_perspective = 1.0
	environment.fog_sky_affect = 0.0
	environment.fog_density = 1.0
	environment.volumetric_fog_enabled = not plain
	environment.volumetric_fog_density = 0.0016
	environment.volumetric_fog_anisotropy = 0.65
	environment.volumetric_fog_length = 220.0
	environment.volumetric_fog_sky_affect = 0.0
	environment.volumetric_fog_ambient_inject = 0.3
	environment.adjustment_enabled = true
	environment.adjustment_saturation = 1.12
	environment.adjustment_contrast = 1.05
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 320.0
	sun.light_volumetric_fog_energy = 1.4
	add_child(sun)


## A square grid of one mesh, a plot of `cell` units for each; its shader places each instance by
## the plot it stands in, so the grid can follow the flight in steps of a plot.
func build_grid(mesh: Mesh, across: int, cell: float, shader: Shader, shadows: bool) -> MultiMeshInstance3D:
	if mesh is BoxMesh:
		mesh.size = Vector3(cell, 1.0, cell)
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
			transforms[at + 3] = (x - across / 2 + 0.5) * cell
			transforms[at + 5] = 1.0
			transforms[at + 10] = 1.0
			transforms[at + 11] = (z - across / 2 + 0.5) * cell
			at += 12
	grid.buffer = transforms
	var material := ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("cell", cell)
	material.set_shader_parameter("plot", cell)
	var instance := MultiMeshInstance3D.new()
	instance.multimesh = grid
	instance.material_override = material
	instance.custom_aabb = AABB(Vector3(-across * cell / 2, -20, -across * cell / 2), Vector3(across * cell, 260, across * cell))
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(instance)
	return instance


## One mesh of boxes, each [centre, size, colour].
static func boxes(parts: Array) -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	for part: Array in parts:
		var centre: Vector3 = part[0]
		var half: Vector3 = part[1] / 2.0
		tool.set_color(part[2])
		for axis in 3:
			for side: float in [-1.0, 1.0]:
				var normal := Vector3.ZERO
				normal[axis] = side
				var u := Vector3.ZERO
				u[(axis + 1) % 3] = 1.0
				var v := normal.cross(u)
				var corners: Array[Vector3] = []
				for corner: Vector2 in [Vector2(-1, -1), Vector2(-1, 1), Vector2(1, 1), Vector2(1, -1)]:
					corners.append(centre + (normal + u * corner.x + v * corner.y) * half)
				for index: int in [0, 1, 2, 0, 2, 3]:
					tool.set_normal(normal)
					tool.add_vertex(corners[index])
	return tool.commit()


## An oak of blocks, standing on y = 0: red marks its leaves for trees.gdshader.
static func tree_mesh() -> ArrayMesh:
	var trunk := Color.BLACK
	var leaf := Color.RED
	return boxes([
		[Vector3(0, 2.5, 0), Vector3(1, 5, 1), trunk],
		[Vector3(0, 5, 0), Vector3(5, 2, 5), leaf],
		[Vector3(0, 6.5, 0), Vector3(3, 1, 3), leaf],
		[Vector3(0, 7.5, 0), Vector3(1, 1, 1), leaf],
	])


func build_ship() -> void:
	var cream := Color(0.95, 0.9, 0.78)
	var red := Color(0.82, 0.16, 0.12)
	var wood := Color(0.42, 0.26, 0.14)
	var dark := Color(0.16, 0.14, 0.14)
	var parts := [
		[Vector3(0, 1.75, 0), Vector3(2.0, 1.5, 5.0), cream],
		[Vector3(0, 1.75, -1.5), Vector3(2.1, 1.6, 0.5), red],
		[Vector3(0, 1.75, 1.5), Vector3(2.1, 1.6, 0.5), red],
		[Vector3(0, 1.75, -2.75), Vector3(1.5, 1.0, 0.5), cream],
		[Vector3(0, 1.75, -3.125), Vector3(1.0, 0.5, 0.25), red],
		[Vector3(0, 1.75, 2.75), Vector3(1.5, 1.0, 0.5), cream],
		[Vector3(0, 0.25, 0), Vector3(1.0, 0.5, 2.5), wood],
		[Vector3(0, 0.55, 0), Vector3(1.1, 0.1, 2.6), dark],
		[Vector3(0, 2.75, 2.5), Vector3(0.14, 1.0, 1.0), red],
		[Vector3(0, 1.75, 2.6), Vector3(3.2, 0.14, 0.8), red],
	]
	for x: float in [-0.4, 0.4]:
		for z: float in [-0.9, 0.9]:
			parts.append([Vector3(x, 0.8, z), Vector3(0.1, 0.5, 0.1), dark])
	var paint := StandardMaterial3D.new()
	paint.vertex_color_use_as_albedo = true
	paint.roughness = 0.7
	var hull := MeshInstance3D.new()
	hull.mesh = boxes(parts)
	hull.material_override = paint
	ship.add_child(hull)
	propeller = MeshInstance3D.new()
	propeller.mesh = boxes([[Vector3.ZERO, Vector3(1.7, 0.16, 0.06), dark], [Vector3.ZERO, Vector3(0.16, 1.7, 0.06), dark]])
	propeller.material_override = paint
	propeller.position = Vector3(0, 0.3, 1.4)
	ship.add_child(propeller)
	# The lamp under the bow, and the searchlight it turns on the ground at night.
	var glass := StandardMaterial3D.new()
	glass.albedo_color = Color(1.0, 0.8, 0.4)
	glass.emission_enabled = true
	glass.emission = Color(1.0, 0.72, 0.3)
	glass.emission_energy_multiplier = 5.0
	var lantern := MeshInstance3D.new()
	lantern.mesh = BoxMesh.new()
	lantern.mesh.size = Vector3(0.36, 0.36, 0.36)
	lantern.material_override = glass
	lantern.position = Vector3(0, -0.1, -1.1)
	ship.add_child(lantern)
	lamp.light_color = Color(1.0, 0.7, 0.35)
	lamp.omni_range = 9.0
	lamp.position = lantern.position
	ship.add_child(lamp)
	searchlight.light_color = Color(1.0, 0.86, 0.6)
	searchlight.spot_range = 150.0
	searchlight.spot_angle = 16.0
	searchlight.spot_attenuation = 0.6
	searchlight.shadow_enabled = false
	searchlight.light_volumetric_fog_energy = 6.0
	searchlight.position = lantern.position
	searchlight.rotation_degrees = Vector3(-32, 0, 0)
	ship.add_child(searchlight)
	add_child(ship)
	engine.stream = hum()
	engine.volume_db = -16.0
	add_child(engine)
	engine.play()
	bell.volume_db = -6.0
	add_child(bell)


## The engine's drone and the wind around it, made here: two seconds that loop.
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
	hint.text = "Arrows or WASD steer, climb and dive    Space: full speed    T: let the hours run    Esc: let go    Q: quit" if helm \
		else "The airship flies itself. Enter takes the helm.    Q: quit"


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
	set_day()
	fly(delta)
	tend_beacons(delta)
	follow(delta)
	title.modulate.a = clampf(9.0 - elapsed, 0.0, 1.0)
	gauge.text = "%02d:%02d    altitude %d    speed %d    beacons lit %d" % [int(day * 24.0), int(fposmod(day * 24.0, 1.0) * 60.0), int(ship.position.y - Terrain.SEA), int(speed), lit.size()]
	if autopilot_seconds > 0.0:
		watch()


func fly(delta: float) -> void:
	var here := Vector2(ship.position.x, ship.position.z)
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
		# The ground pushes the airship up, and the clouds' floor holds it down.
		wanted_climb = maxf(wanted_climb, (ground + 7.0 - ship.position.y) * 2.0)
		wanted_climb = minf(wanted_climb, (CEILING - ship.position.y) * 2.0)
	else:
		# A wandering course at a steady height over the ground ahead, by way of the next beacon.
		wanted_turn = sin(flown * 0.0037) * 0.5 + sin(flown * 0.0013 + 1.0) * 0.4
		var height := ground + 20.0
		var beacon := beacon_ahead(forward)
		if beacon:
			var to := beacon.position - ship.position
			wanted_turn = clampf(forward.signed_angle_to(Vector3(to.x, 0.0, to.z), Vector3.DOWN) * 2.5, -1.0, 1.0)
			if Vector2(to.x, to.z).length() < 110.0:
				height = maxf(ground + 8.0, beacon.position.y - 1.0)
		wanted_climb = clampf((height - ship.position.y) * 0.7, -9.0, 14.0)
	var ease := 1.0 - exp(-delta * 2.5)
	turn = lerpf(turn, clampf(wanted_turn, -1.0, 1.0), ease)
	climb = lerpf(climb, wanted_climb, ease)
	speed = lerpf(speed, wanted_speed, 1.0 - exp(-delta * 1.2))
	heading += turn * 0.55 * delta
	flown += speed * delta
	ship.position += forward * speed * delta + Vector3.UP * climb * delta
	ship.rotation = Vector3(climb * 0.012, -heading, -turn * 0.35)
	propeller.rotation.z += delta * speed * 0.9
	engine.pitch_scale = 0.8 + speed / CRUISE * 0.3
	# The grids follow in steps of the largest plot they share, so every block stays where it is.
	for follower in followers:
		follower.position = Vector3(snappedf(ship.position.x, 20.0), 0.0, snappedf(ship.position.z, 20.0))
	far_material.set_shader_parameter("hole_centre", Vector2(followers[0].position.x, followers[0].position.z))
	wind += Vector2(3.0, 1.2) * delta
	clouds.position = Vector3(snappedf(ship.position.x - wind.x, CLOUD_CELL) + wind.x, CLOUD_HEIGHT, snappedf(ship.position.z - wind.y, CLOUD_CELL) + wind.y)
	(clouds.material_override as ShaderMaterial).set_shader_parameter("drift", wind)
	water.position = Vector3(ship.position.x, Terrain.SEA - 0.2, ship.position.z)


## The beacon of a plot of the world: where it floats, or nothing where the plot's place is sea.
static func beacon_place(plot: Vector2i) -> Variant:
	var p := (Vector2(plot) + Vector2(0.15, 0.15) + Vector2(Terrain.cell_hash(plot.x, plot.y), Terrain.cell_hash(plot.y + 57, plot.x - 31)) * 0.7) * BEACON_PLOT
	var ground := Terrain.height(p)
	if ground < Terrain.SEA + 2.0 or ground > Terrain.SEA + 90.0:
		return null
	return Vector3(p.x, ground + 16.0, p.y)


## Keeps the beacons of the nine plots around the airship, and lights the one it reaches.
func tend_beacons(delta: float) -> void:
	var middle := Vector2i((Vector2(ship.position.x, ship.position.z) / BEACON_PLOT).floor())
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
		if not lit.has(plot) and beacon.position.distance_to(ship.position + Vector3.UP) < BEACON_REACH:
			lit[plot] = true
			beacon.queue_free()
			beacons[plot] = build_beacon(beacon.position, true)
			bell.stream = chime(440.0 * pow(2.0, [0, 2, 4, 7, 9, 12][(lit.size() - 1) % 6] / 12.0))
			bell.play()


func build_beacon(place: Vector3, alight: bool) -> Node3D:
	var colour := Color(1.0, 0.72, 0.2) if alight else Color(0.25, 0.85, 1.0)
	var glass := StandardMaterial3D.new()
	glass.albedo_color = colour
	glass.emission_enabled = true
	glass.emission = colour
	glass.emission_energy_multiplier = 4.0
	var gem := MeshInstance3D.new()
	gem.mesh = BoxMesh.new()
	gem.mesh.size = Vector3(2.4, 2.4, 2.4)
	gem.material_override = glass
	gem.rotation = Vector3(atan(1.0 / sqrt(2.0)), 0.0, PI / 4.0)
	# A shaft of light from the ground up, seen from far off.
	var light := StandardMaterial3D.new()
	light.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	light.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	light.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	light.albedo_color = Color(colour, 0.5 if alight else 0.22)
	var shaft := MeshInstance3D.new()
	shaft.mesh = BoxMesh.new()
	shaft.mesh.size = Vector3(1.0, 150.0, 1.0)
	shaft.material_override = light
	shaft.position.y = 59.0
	shaft.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var glow := OmniLight3D.new()
	glow.light_color = colour
	glow.light_energy = 6.0 if alight else 3.0
	glow.omni_range = 46.0
	var beacon := Node3D.new()
	beacon.position = place
	beacon.add_child(gem)
	beacon.add_child(shaft)
	beacon.add_child(glow)
	add_child(beacon)
	return beacon


## The nearest beacon not yet lit that lies ahead, for the airship flying itself.
func beacon_ahead(forward: Vector3) -> Node3D:
	var nearest: Node3D = null
	for plot: Vector2i in beacons:
		var to: Vector3 = beacons[plot].position - ship.position
		to.y = 0.0
		if not lit.has(plot) and to.length() > 12.0 and to.normalized().dot(forward) > 0.5 and (nearest == null or to.length() < (nearest.position - ship.position).length()):
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


## The camera trails the airship; while it flies itself the view swings slowly around it.
func follow(delta: float) -> void:
	view_swing = lerpf(view_swing, 0.0 if helm else sin(elapsed * 0.09) * 1.1, 1.0 - exp(-delta * 2.0))
	var behind := Basis(Vector3.UP, -heading + view_swing) * Vector3(0, 5.5, 17.0)
	camera.position = camera.position.lerp(ship.position + behind, 1.0 - exp(-delta * 5.0))
	var ahead := Basis(Vector3.UP, -heading) * Vector3(0, -3.0, -30.0)
	camera.look_at(ship.position + ahead * cos(view_swing))


## The light of the hour: the sun's arc, then the moon's, in one light.
func set_day() -> void:
	var angle := TAU * (day - 0.25)
	var to_sun := Vector3(cos(angle), sin(angle) * 0.85, 0.42).normalized()
	var height := to_sun.y
	var sunlight := smoothstep(-0.03, 0.2, height)
	var night := smoothstep(0.02, 0.3, -height)
	var warm := Color(1.0, 0.45, 0.2).lerp(Color(1.0, 0.95, 0.86), smoothstep(0.0, 0.45, height))
	if height > -0.06:
		sun.basis = Basis.looking_at(-to_sun)
		sun.light_color = warm
		sun.light_energy = 1.35 * sunlight
	else:
		sun.basis = Basis.looking_at(to_sun)
		sun.light_color = Color(0.5, 0.65, 1.0)
		sun.light_energy = 0.55 * smoothstep(0.1, 0.35, -height)
	sky_material.set_shader_parameter("sun_direction", to_sun)
	sky_material.set_shader_parameter("sun_colour", warm)
	sky_material.set_shader_parameter("aurora_phase", elapsed * 0.25)
	environment.ambient_light_color = Color(0.85, 0.82, 0.78).lerp(Color(0.2, 0.3, 0.6), night)
	environment.ambient_light_energy = lerpf(0.9, 0.8, night)
	environment.volumetric_fog_albedo = Color(0.75, 0.82, 1.0).lerp(warm, 0.5)
	searchlight.light_energy = 14.0 * night
	trees_material.set_shader_parameter("night", night)
	lamp.light_energy = 1.0 + 3.0 * night


## For automated runs: the frame rate once the first frames' pipelines are made, and what the
## frame shows, then quit.
func watch() -> void:
	frames += 1
	if frames == 120:
		steady_from = Time.get_ticks_msec()
	if elapsed < autopilot_seconds:
		return
	autopilot_seconds = 0.0
	print("FLYOVER seconds %.1f frames %d fps %.1f flown %d beacons %d" % [elapsed, frames, (frames - 120) * 1000.0 / (Time.get_ticks_msec() - steady_from), int(flown), lit.size()])
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
