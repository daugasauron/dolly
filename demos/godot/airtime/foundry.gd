# The foundry at night around the course: a sea of molten metal under it, haze lit from below,
# embers, and each section's scenery: the loading yard's containers and gantry, the turbine
# hall, the reactor, the silos and the finish gate.
class_name Foundry
extends Node3D

const SEA := -16.0
var spinning: Array[Node3D] = []
var beacons: Array[Light3D] = []
var cores: Array[StandardMaterial3D] = []
var embers: GPUParticles3D
var rng := RandomNumberGenerator.new()


func material(color: Color, metallic := 0.6, roughness := 0.55, glow := Color.BLACK, energy := 0.0) -> StandardMaterial3D:
	var surface := StandardMaterial3D.new()
	surface.albedo_color = color
	surface.metallic = metallic
	surface.roughness = roughness
	if energy > 0:
		surface.emission_enabled = true
		surface.emission = glow
		surface.emission_energy_multiplier = energy
	return surface


func box(size: Vector3, at: Vector3, surface: Material, parent: Node3D = self) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.material_override = surface
	node.position = at
	parent.add_child(node)
	return node


func cylinder(radius: float, height: float, at: Vector3, surface: Material, parent: Node3D = self, sides := 24) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	mesh.radial_segments = sides
	node.mesh = mesh
	node.material_override = surface
	node.position = at
	parent.add_child(node)
	return node


func build(course: Course, metres: float) -> void:
	rng.seed = 1984
	environment()
	var centres: Array[Vector3] = []
	for pad in course.pads:
		centres.append((pad[0] + pad[1]) / 2 * metres)
	var sea := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(700, 700)
	plane.subdivide_width = 120
	plane.subdivide_depth = 120
	sea.mesh = plane
	var molten := ShaderMaterial.new()
	molten.shader = preload("res://molten.gdshader")
	sea.material_override = molten
	sea.position = Vector3(0, SEA, centres[16].z)
	add_child(sea)
	mist(centres[16].z)
	yard(centres.slice(0, 9))
	turbine_hall(centres.slice(8, 17))
	reactor(centres.slice(16, 25))
	silos(centres.slice(24, 33))
	skyline(centres[16].z)
	embers = ember_field()
	add_child(embers)


func environment() -> void:
	var world := WorldEnvironment.new()
	var settings := Environment.new()
	var sky_material := ShaderMaterial.new()
	sky_material.shader = preload("res://sky.gdshader")
	var sky := Sky.new()
	sky.sky_material = sky_material
	settings.background_mode = Environment.BG_SKY
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color(0.12, 0.14, 0.2)
	settings.ambient_light_energy = 0.6
	settings.tonemap_mode = Environment.TONE_MAPPER_ACES
	settings.tonemap_exposure = 1.05
	settings.glow_enabled = true
	settings.glow_intensity = 1.0
	settings.glow_bloom = 0.08
	settings.glow_hdr_threshold = 1.0
	settings.ssao_enabled = true
	settings.ssao_radius = 1.6
	settings.ssao_intensity = 1.8
	settings.fog_enabled = true
	settings.fog_light_color = Color(0.14, 0.09, 0.08)
	settings.fog_density = 0.004
	settings.fog_aerial_perspective = 0.3
	settings.fog_sky_affect = 0.2
	settings.volumetric_fog_enabled = true
	settings.volumetric_fog_density = 0.018
	settings.volumetric_fog_albedo = Color(0.5, 0.56, 0.66)
	settings.volumetric_fog_emission = Color(0.12, 0.04, 0.01)
	settings.volumetric_fog_emission_energy = 0.25
	settings.volumetric_fog_anisotropy = 0.55
	settings.volumetric_fog_length = 90.0
	settings.adjustment_enabled = true
	settings.adjustment_contrast = 1.1
	settings.adjustment_saturation = 1.12
	world.environment = settings
	add_child(world)
	# A cold moon through the smoke, and the sea's heat from below.
	var moon := DirectionalLight3D.new()
	moon.light_color = Color(0.62, 0.72, 1.0)
	moon.light_energy = 0.8
	moon.shadow_enabled = true
	moon.directional_shadow_max_distance = 90.0
	moon.rotation = Vector3(deg_to_rad(-38), deg_to_rad(28), 0)
	add_child(moon)
	var heat := DirectionalLight3D.new()
	heat.light_color = Color(1.0, 0.5, 0.2)
	heat.light_energy = 0.5
	heat.rotation = Vector3(deg_to_rad(75), deg_to_rad(-10), 0)
	add_child(heat)


# A glowing layer of fumes over the metal.
func mist(z: float) -> void:
	var volume := FogVolume.new()
	volume.size = Vector3(400, 10, 400)
	volume.position = Vector3(0, SEA + 3.0, z)
	var fog := FogMaterial.new()
	fog.density = 0.12
	fog.albedo = Color(1.0, 0.55, 0.3)
	fog.emission = Color(0.9, 0.3, 0.06)
	fog.height_falloff = 0.4
	volume.material = fog
	add_child(volume)


func ember_field() -> GPUParticles3D:
	var particles := GPUParticles3D.new()
	particles.amount = 600
	particles.lifetime = 7.0
	particles.preprocess = 7.0
	particles.visibility_aabb = AABB(Vector3(-40, -30, -40), Vector3(80, 60, 80))
	var process := ParticleProcessMaterial.new()
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	process.emission_box_extents = Vector3(35, 2, 35)
	process.direction = Vector3(0, 1, 0)
	process.spread = 20.0
	process.initial_velocity_min = 1.0
	process.initial_velocity_max = 3.0
	process.gravity = Vector3(0, 0.6, 0)
	process.turbulence_enabled = true
	process.turbulence_noise_strength = 1.5
	process.turbulence_noise_scale = 6.0
	process.scale_min = 0.02
	process.scale_max = 0.06
	particles.process_material = process
	particles.draw_pass_1 = Foundry.glow_quad(Color(5.0, 1.8, 0.4))
	return particles


# A round point of light for particles: a radial fade, added to what is behind it.
static func glow_quad(color: Color) -> QuadMesh:
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, 1))
	gradient.set_color(1, Color(1, 1, 1, 0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	var hot := StandardMaterial3D.new()
	hot.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	hot.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	hot.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	hot.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	hot.vertex_color_use_as_albedo = true
	hot.albedo_texture = texture
	hot.albedo_color = color
	var quad := QuadMesh.new()
	quad.size = Vector2(1, 1)
	quad.material = hot
	return quad


func follow(eye: Vector3) -> void:
	embers.global_position = Vector3(eye.x, SEA + 2.0, eye.z - 12.0)


func _process(delta: float) -> void:
	var time := Time.get_ticks_msec() / 1000.0
	for node in spinning:
		node.rotate_object_local(Vector3.UP, delta * float(node.get_meta("speed")))
	for index in beacons.size():
		beacons[index].light_energy = 4.0 if fmod(time + index * 0.37, 1.6) < 0.25 else 0.0
	for core in cores:
		core.emission_energy_multiplier = 3.0 + 1.5 * sin(time * 2.2)


# Section 1, the loading yard: stacked containers on piers, a gantry crane over the course and
# floodlight towers.
func yard(centres: Array[Vector3]) -> void:
	var paints := [Color(0.5, 0.12, 0.08), Color(0.06, 0.32, 0.34), Color(0.62, 0.45, 0.08), Color(0.08, 0.14, 0.32), Color(0.28, 0.3, 0.32)]
	var pier := material(Color(0.22, 0.22, 0.23), 0.2, 0.8)
	for centre in centres:
		for side in [-1, 1]:
			var x: float = side * rng.randf_range(16.0, 24.0)
			box(Vector3(16, 1.0, 9), Vector3(x, -3.5, centre.z), pier)
			cylinder(0.6, 12.0, Vector3(x - 6, -10, centre.z), pier)
			cylinder(0.6, 12.0, Vector3(x + 6, -10, centre.z), pier)
			for level in rng.randi_range(1, 4):
				for lane in 2:
					var paint: Color = paints[rng.randi() % paints.size()]
					box(Vector3(12.0, 2.55, 2.4), Vector3(x + rng.randf_range(-0.6, 0.6), -1.7 + level * 2.6, centre.z - 1.4 + lane * 2.8),
						material(paint, 0.55, 0.6))
	var steel := material(Color(0.7, 0.55, 0.12), 0.7, 0.45)
	var crane_z: float = centres[4].z
	for side in [-1, 1]:
		box(Vector3(1.0, 30, 1.0), Vector3(side * 14, -1, crane_z), steel)
	box(Vector3(30, 1.6, 1.6), Vector3(0, 14, crane_z), steel)
	box(Vector3(2.5, 2.0, 3.0), Vector3(-3, 12.4, crane_z), material(Color(0.2, 0.2, 0.22), 0.7, 0.4))
	var warning := material(Color(0.3, 0.05, 0.02), 0.1, 0.5, Color(1.0, 0.15, 0.05), 6.0)
	for side in [-1, 1]:
		box(Vector3(0.4, 0.4, 0.4), Vector3(side * 14, 14.9, crane_z), warning)
	for index in [2, 6]:
		var tower_x: float = 13.0 * (1 if index == 2 else -1)
		box(Vector3(0.5, 22, 0.5), Vector3(tower_x, 0, centres[index].z), material(Color(0.25, 0.25, 0.27)))
		var flood := SpotLight3D.new()
		flood.light_color = Color(1.0, 0.86, 0.66)
		flood.light_energy = 6.0
		flood.spot_range = 45.0
		flood.spot_angle = 32.0
		flood.position = Vector3(tower_x, 11.0, centres[index].z)
		flood.look_at_from_position(flood.position, Vector3(0, 0, centres[index].z - 10.0))
		add_child(flood)
		box(Vector3(1.4, 0.8, 0.5), flood.position, material(Color(0.9, 0.85, 0.7), 0.1, 0.4, Color(1.0, 0.85, 0.6), 8.0))


# Section 2, the turbine hall: walls with lit windows, turbine casings with spinning rotors and
# a crane rail overhead.
func turbine_hall(centres: Array[Vector3]) -> void:
	var concrete := material(Color(0.24, 0.24, 0.26), 0.05, 0.9)
	var window := material(Color(0.1, 0.2, 0.24), 0.1, 0.2, Color(0.35, 0.75, 0.9), 2.2)
	var casing := material(Color(0.12, 0.3, 0.36), 0.75, 0.35)
	var start: float = centres[0].z
	var end: float = centres[8].z
	var length := start - end
	for side in [-1, 1]:
		box(Vector3(2, 40, length + 30), Vector3(side * 26, 4, (start + end) / 2), concrete)
		for row in range(int(length / 9)):
			box(Vector3(0.3, 7, 4.5), Vector3(side * 24.9, 10, start - 8 - row * 9), window)
		for unit in 3:
			var z := start - 15 - unit * length / 3.0
			var body := cylinder(4.2, 16, Vector3(side * 16, -4, z), casing, self, 32)
			body.rotation = Vector3(deg_to_rad(90), 0, 0)
			var rotor := Node3D.new()
			rotor.position = Vector3(side * 16, -4, z + 8.2)
			rotor.set_meta("speed", 4.0 * side)
			add_child(rotor)
			spinning.append(rotor)
			for blade in 6:
				var vane := box(Vector3(0.5, 7.6, 0.2), Vector3.ZERO, material(Color(0.6, 0.62, 0.65), 0.9, 0.25), rotor)
				vane.rotation = Vector3(0, 0, blade * PI / 3)
			cylinder(4.4, 0.25, Vector3(side * 16, -4, z + 8.0), material(Color(0.1, 0.2, 0.2), 0.3, 0.4, Color(0.3, 0.9, 0.85), 3.0)).rotation = Vector3(deg_to_rad(90), 0, 0)
	box(Vector3(52, 1.2, 1.2), Vector3(0, 18, centres[4].z), material(Color(0.65, 0.5, 0.1), 0.7, 0.4))


# Section 3, the reactor: a pulsing core in a spinning ring, with pipes arching over the course.
func reactor(centres: Array[Vector3]) -> void:
	var core_material := material(Color(0.6, 0.9, 1.0), 0.0, 0.2, Color(0.45, 0.85, 1.0), 3.0)
	cores.append(core_material)
	var z: float = centres[4].z
	var housing := material(Color(0.2, 0.22, 0.25), 0.8, 0.4)
	cylinder(7.5, 34, Vector3(-30, 2, z), housing, self, 40)
	cylinder(4.0, 36, Vector3(-30, 2, z), core_material, self, 40)
	for band in 5:
		cylinder(7.8, 0.6, Vector3(-30, -10 + band * 6, z), core_material, self, 40)
	var ring_holder := Node3D.new()
	ring_holder.position = Vector3(-30, 6, z)
	ring_holder.set_meta("speed", 0.6)
	add_child(ring_holder)
	spinning.append(ring_holder)
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 11.0
	torus.outer_radius = 12.2
	torus.rings = 64
	ring.mesh = torus
	ring.material_override = material(Color(0.3, 0.3, 0.32), 0.9, 0.3, Color(0.4, 0.8, 1.0), 1.2)
	ring.rotation = Vector3(deg_to_rad(18), 0, 0)
	ring_holder.add_child(ring)
	var pipe := material(Color(0.45, 0.32, 0.18), 0.85, 0.35)
	for index in [1, 3, 5, 7]:
		var span: float = centres[index].z
		var arch := cylinder(0.7, 44, Vector3(-6, 13, span), pipe, self, 16)
		arch.rotation = Vector3(0, 0, deg_to_rad(90))
		cylinder(0.7, 30, Vector3(16, -1, span), pipe, self, 16)
	var light := OmniLight3D.new()
	light.light_color = Color(0.45, 0.85, 1.0)
	light.light_energy = 6.0
	light.omni_range = 40.0
	light.position = Vector3(-20, 4, z)
	add_child(light)


# Section 4, the silo run: tall silos with beacons, catwalks over the course, the finish gate.
func silos(centres: Array[Vector3]) -> void:
	var shell := material(Color(0.42, 0.43, 0.42), 0.55, 0.55)
	var red := material(Color(0.4, 0.04, 0.02), 0.1, 0.5, Color(1.0, 0.1, 0.05), 5.0)
	for index in range(0, centres.size(), 2):
		for side in [-1, 1]:
			var at := Vector3(side * rng.randf_range(15, 20), 2, centres[index].z)
			cylinder(5.5, 40, at, shell, self, 32)
			for band in 3:
				cylinder(5.56, 0.35, at + Vector3(0, -6 + band * 9, 0), material(Color(0.1, 0.12, 0.14), 0.3, 0.4, Color(0.7, 0.85, 1.0), 1.6), self, 32)
			cylinder(5.8, 1.0, at + Vector3(0, 20.5, 0), material(Color(0.3, 0.3, 0.3), 0.7, 0.4), self, 32)
			box(Vector3(0.5, 0.5, 0.5), at + Vector3(0, 21.4, 0), red)
			var beacon := OmniLight3D.new()
			beacon.light_color = Color(1.0, 0.1, 0.05)
			beacon.omni_range = 18.0
			beacon.position = at + Vector3(0, 21.8, 0)
			add_child(beacon)
			beacons.append(beacon)
		box(Vector3(30, 0.3, 1.6), Vector3(0, 12, centres[index].z), material(Color(0.3, 0.3, 0.32), 0.8, 0.5))
	var gate_material := material(Color(0.1, 0.3, 0.3), 0.3, 0.3, Color(0.33, 0.86, 0.8), 4.0)
	var finish: Vector3 = centres[centres.size() - 1]
	for side in [-1, 1]:
		box(Vector3(0.6, 9, 0.6), Vector3(finish.x + side * 5, finish.y + 4.5, finish.z - 2), gate_material)
	box(Vector3(10.6, 0.6, 0.6), Vector3(finish.x, finish.y + 9, finish.z - 2), gate_material)


# Chimneys on the horizon with their fires.
func skyline(z: float) -> void:
	var brick := material(Color(0.16, 0.1, 0.08), 0.0, 0.9)
	var fire := material(Color(0.5, 0.2, 0.05), 0.0, 0.5, Color(1.0, 0.45, 0.1), 6.0)
	for index in 9:
		var at := Vector3(rng.randf_range(-160, 160), 0, z + rng.randf_range(-170, 170))
		if absf(at.x) < 60:
			at.x = 60.0 * signf(at.x if at.x != 0 else 1.0)
		var height := rng.randf_range(40, 75)
		cylinder(2.5, height, at + Vector3(0, SEA + height / 2, 0), brick, self, 16)
		cylinder(2.7, 1.2, at + Vector3(0, SEA + height, 0), fire, self, 16)
