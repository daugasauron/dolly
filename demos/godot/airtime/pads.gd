# The course as it is shown: each pad a steel slab on a column out of the metal sea, amber-edged
# where it drops, a cyan deck with railings and a lamp at each checkpoint. A pad that is landed
# on flashes red, falls away and comes back; a landing throws sparks.
@tool
extends Node3D

const PLATE := preload("res://plate.gdshader")
const AMBER := Color(1.0, 0.62, 0.18)
const CYAN := Color(0.33, 0.86, 0.8)
const SEA := -16.0   # metres, where the columns stand

var metres := 0.025
var slabs: Array[MeshInstance3D] = []
var materials: Array[ShaderMaterial] = []
var homes: Array[Vector3] = []
var sparks: Array[GPUParticles3D] = []
var spark_next := 0


# In the editor the course stands as the game builds it (main.gd); what is built here is not the
# scene's and is not saved with it.
func _ready() -> void:
	if Engine.is_editor_hint():
		build(Course.new(), metres)


func build(course: Course, scale: float) -> void:
	metres = scale
	var steel := StandardMaterial3D.new()
	steel.albedo_color = Color(0.13, 0.14, 0.15)
	steel.metallic = 0.8
	steel.roughness = 0.5
	for index in Course.PADS:
		var low: Vector3 = course.pads[index][0] * metres
		var high: Vector3 = course.pads[index][1] * metres
		var size := high - low
		var centre := (low + high) / 2
		var checkpoint := Course.is_checkpoint(index)
		var slab := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = size
		slab.mesh = mesh
		var material := ShaderMaterial.new()
		material.shader = PLATE
		material.set_shader_parameter("rim", CYAN if checkpoint else AMBER)
		material.set_shader_parameter("size", size)
		material.set_shader_parameter("rim_width", 0.14 if checkpoint else 0.07)
		slab.material_override = material
		slab.position = centre
		add_child(slab)
		slabs.append(slab)
		materials.append(material)
		homes.append(centre)
		# The column the pad stands on, down into the sea.
		var column := MeshInstance3D.new()
		var cylinder := CylinderMesh.new()
		var thickness := 0.9 if checkpoint else 0.35
		cylinder.top_radius = thickness
		cylinder.bottom_radius = thickness * 1.25
		cylinder.height = low.y - SEA
		cylinder.radial_segments = 12
		column.mesh = cylinder
		column.material_override = steel
		column.position = Vector3(centre.x, (low.y + SEA) / 2, centre.z)
		add_child(column)
		if checkpoint:
			add_deck(index, low, high)
	for count in 6:
		var burst := sparks_burst()
		add_child(burst)
		sparks.append(burst)


# A checkpoint deck's railings, corner posts, lamp and number.
func add_deck(index: int, low: Vector3, high: Vector3) -> void:
	var glow := StandardMaterial3D.new()
	glow.albedo_color = CYAN * 0.4
	glow.emission_enabled = true
	glow.emission = CYAN
	glow.emission_energy_multiplier = 2.5
	var rail := StandardMaterial3D.new()
	rail.albedo_color = Color(0.5, 0.52, 0.53)
	rail.metallic = 0.9
	rail.roughness = 0.3
	var y := high.y
	for side in [-1, 1]:
		var bar := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.06, 0.06, high.z - low.z)
		bar.mesh = box
		bar.material_override = rail
		bar.position = Vector3((low.x + high.x) / 2 + side * (high.x - low.x) / 2, y + 1.0, (low.z + high.z) / 2)
		add_child(bar)
		for end in [-1, 1]:
			var post := MeshInstance3D.new()
			var pillar := BoxMesh.new()
			pillar.size = Vector3(0.12, 1.05, 0.12)
			post.mesh = pillar
			post.material_override = glow
			post.position = Vector3(bar.position.x, y + 0.52, (low.z + high.z) / 2 + end * (high.z - low.z) / 2)
			add_child(post)
	var lamp := OmniLight3D.new()
	lamp.light_color = CYAN
	lamp.light_energy = 2.2
	lamp.omni_range = 9.0
	lamp.position = Vector3((low.x + high.x) / 2, y + 2.2, (low.z + high.z) / 2)
	add_child(lamp)
	var number := Label3D.new()
	number.text = "%02d" % (index / 8 + 1) if index < Course.PADS - 1 else "FINISH"
	number.font_size = 180
	number.outline_size = 0
	number.modulate = CYAN
	number.shaded = false
	number.position = Vector3((low.x + high.x) / 2, y + 3.0, low.z + 0.2)
	add_child(number)


func sparks_burst() -> GPUParticles3D:
	var particles := GPUParticles3D.new()
	particles.one_shot = true
	particles.emitting = false
	particles.amount = 90
	particles.lifetime = 0.9
	particles.explosiveness = 0.95
	var process := ParticleProcessMaterial.new()
	process.direction = Vector3(0, 1, 0)
	process.spread = 75.0
	process.initial_velocity_min = 2.0
	process.initial_velocity_max = 6.5
	process.gravity = Vector3(0, -9.8, 0)
	process.scale_min = 0.03
	process.scale_max = 0.07
	process.color = Color(1.0, 0.7, 0.3)
	particles.process_material = process
	particles.draw_pass_1 = Foundry.glow_quad(Color(4.0, 2.2, 0.8))
	return particles


func reset() -> void:
	for index in slabs.size():
		slabs[index].position = homes[index]
		slabs[index].rotation = Vector3.ZERO
		slabs[index].visible = true


# Sparks where the feet came down, more the faster.
func landed(pad: int, speed: float) -> void:
	var burst := sparks[spark_next]
	spark_next = (spark_next + 1) % sparks.size()
	var top := homes[pad] + Vector3(0, slabs[pad].mesh.size.y / 2, 0)
	burst.position = top
	burst.amount_ratio = clampf(speed / 600.0, 0.25, 1.0)
	burst.restart()


func jumped(_pad: int) -> void:
	pass


func show_course(course: Course, _ground: int) -> void:
	for index in slabs.size():
		var material := materials[index]
		var left := course.cooldown[index]
		# The ticks before it goes: it flashes; then it falls and thins out; near its
		# return it rises back into place.
		var warning := left > Course.PAD_RETURN
		var fallen := course.fallen(index)
		var slab := slabs[index]
		material.set_shader_parameter("warn", 1.0 if warning else 0.0)
		if fallen == 0:
			slab.position = homes[index]
			slab.rotation = Vector3.ZERO
			material.set_shader_parameter("fade", 0.0)
			continue
		var seconds := fallen * Movement.STEP
		var back := (Course.PAD_RETURN - fallen) * Movement.STEP
		if back < 0.25:
			var rise := back / 0.25
			slab.position = homes[index] - Vector3(0, rise * 1.5, 0)
			slab.rotation = Vector3.ZERO
			material.set_shader_parameter("fade", rise)
		else:
			slab.position = homes[index] - Vector3(0, 0.5 * 9.8 * seconds * seconds, 0)
			slab.rotation = Vector3(seconds * 0.7, 0, seconds * 0.45)
			material.set_shader_parameter("fade", clampf((seconds - 0.25) / 0.45, 0, 1))
