@tool
extends StaticBody3D
## A floating island: a grassy top over a rock that tapers to a point, pines on top and, on some,
## glowing crystals or a waterfall off the edge. The meshes and materials are shared by every
## island and scaled per island.

static var top_mesh: CylinderMesh
static var rock_mesh: CylinderMesh
static var pine_mesh: CylinderMesh
static var crystal_mesh: PrismMesh
static var crystal_materials: Array[StandardMaterial3D] = []
static var falling_water: ParticleProcessMaterial
static var spray: QuadMesh


static func make_shared() -> void:
	if top_mesh:
		return
	var grass := ShaderMaterial.new()
	grass.shader = load("res://island_grass.gdshader")
	top_mesh = CylinderMesh.new()
	top_mesh.top_radius = 1.0
	top_mesh.bottom_radius = 0.96
	top_mesh.height = 1.0
	top_mesh.radial_segments = 9
	top_mesh.rings = 1
	top_mesh.material = grass

	var rock := ShaderMaterial.new()
	rock.shader = load("res://island_rock.gdshader")
	rock_mesh = CylinderMesh.new()
	rock_mesh.top_radius = 1.0
	rock_mesh.bottom_radius = 0.08
	rock_mesh.height = 1.0
	rock_mesh.radial_segments = 9
	rock_mesh.rings = 3
	rock_mesh.material = rock

	var needles := StandardMaterial3D.new()
	needles.albedo_color = Color(0.16, 0.36, 0.3)
	needles.roughness = 1.0
	pine_mesh = CylinderMesh.new()
	pine_mesh.top_radius = 0.0
	pine_mesh.bottom_radius = 1.0
	pine_mesh.height = 2.8
	pine_mesh.radial_segments = 6
	pine_mesh.rings = 1
	pine_mesh.material = needles

	crystal_mesh = PrismMesh.new()
	crystal_mesh.size = Vector3(0.9, 3.2, 0.9)
	for hue in [0.52, 0.8, 0.12]:
		var glow := StandardMaterial3D.new()
		glow.albedo_color = Color.from_hsv(hue, 0.5, 1.0)
		glow.emission_enabled = true
		glow.emission = Color.from_hsv(hue, 0.75, 1.0)
		glow.emission_energy_multiplier = 3.0
		crystal_materials.append(glow)

	falling_water = ParticleProcessMaterial.new()
	falling_water.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	falling_water.emission_box_extents = Vector3(0.2, 0.1, 1.4)
	falling_water.direction = Vector3(1, -0.2, 0)
	falling_water.spread = 6.0
	falling_water.initial_velocity_min = 2.0
	falling_water.initial_velocity_max = 3.5
	falling_water.gravity = Vector3(0, -9.0, 0)
	falling_water.scale_min = 0.6
	falling_water.scale_max = 1.2
	var widen := Curve.new()
	widen.add_point(Vector2(0, 0.5))
	widen.add_point(Vector2(1, 3.0))
	var widening := CurveTexture.new()
	widening.curve = widen
	falling_water.scale_curve = widening
	var fade := Gradient.new()
	fade.set_color(0, Color(0.9, 0.95, 1.0, 0.75))
	fade.set_color(1, Color(1.0, 0.85, 0.85, 0.0))
	var fading := GradientTexture1D.new()
	fading.gradient = fade
	falling_water.color_ramp = fading
	var dot := GradientTexture2D.new()
	dot.fill = GradientTexture2D.FILL_RADIAL
	dot.fill_from = Vector2(0.5, 0.5)
	dot.fill_to = Vector2(0.5, 0.0)
	var falloff := Gradient.new()
	falloff.set_color(0, Color.WHITE)
	falloff.set_color(1, Color(1, 1, 1, 0))
	dot.gradient = falloff
	var mist := StandardMaterial3D.new()
	mist.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mist.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mist.vertex_color_use_as_albedo = true
	mist.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mist.albedo_texture = dot
	spray = QuadMesh.new()
	spray.size = Vector2(1.5, 1.5)
	spray.material = mist


func build(rng: RandomNumberGenerator, radius: float) -> void:
	make_shared()
	var depth := radius * rng.randf_range(1.1, 1.7)
	add_part(top_mesh, Vector3(0, 0, 0), Vector3(radius, 1.4, radius))
	add_part(rock_mesh, Vector3(0, -0.7 - depth / 2.0, 0), Vector3(radius * 0.97, depth, radius * 0.97))

	var top := CollisionShape3D.new()
	top.shape = CylinderShape3D.new()
	top.shape.radius = radius
	top.shape.height = 1.6
	add_child(top)
	var core := CollisionShape3D.new()
	core.shape = CylinderShape3D.new()
	core.shape.radius = radius * 0.5
	core.shape.height = depth * 0.8
	core.position.y = -0.7 - depth * 0.4
	add_child(core)

	var pines := MultiMesh.new()
	pines.transform_format = MultiMesh.TRANSFORM_3D
	pines.mesh = pine_mesh
	pines.instance_count = rng.randi_range(2, 3 + int(radius / 3.0))
	for i in pines.instance_count:
		var at := Vector2.from_angle(rng.randf() * TAU) * radius * sqrt(rng.randf()) * 0.8
		var size := rng.randf_range(0.8, 1.7)
		var basis := Basis.from_scale(Vector3(size, size * rng.randf_range(0.9, 1.5), size))
		pines.set_instance_transform(i, Transform3D(basis, Vector3(at.x, 0.7 + 1.4 * basis.y.y, at.y)))
	var grove := MultiMeshInstance3D.new()
	grove.multimesh = pines
	add_child(grove)

	if radius > 11.0 and rng.randf() < 0.4:
		add_waterfall(radius)

	if rng.randf() < 0.35:
		var material: StandardMaterial3D = crystal_materials[rng.randi() % crystal_materials.size()]
		for i in rng.randi_range(1, 3):
			var crystal := add_part(crystal_mesh, Vector3.ZERO, Vector3.ONE * rng.randf_range(0.7, 1.4))
			var at := Vector2.from_angle(rng.randf() * TAU) * radius * rng.randf_range(0.2, 0.7)
			crystal.position = Vector3(at.x, 0.7 + 1.4 * crystal.scale.y, at.y)
			crystal.rotation = Vector3(rng.randf_range(-0.3, 0.3), rng.randf() * TAU, rng.randf_range(-0.3, 0.3))
			crystal.material_override = material
			crystal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func add_waterfall(radius: float) -> void:
	var fall := GPUParticles3D.new()
	fall.process_material = falling_water
	fall.draw_pass_1 = spray
	fall.amount = 120
	fall.lifetime = 3.2
	fall.position = Vector3(radius * 0.92, 0.6, 0)
	fall.visibility_aabb = AABB(Vector3(-4, -55, -4), Vector3(16, 60, 8))
	fall.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(fall)


func add_part(mesh: Mesh, at: Vector3, size: Vector3) -> MeshInstance3D:
	var part := MeshInstance3D.new()
	part.mesh = mesh
	part.position = at
	part.scale = size
	add_child(part)
	return part
