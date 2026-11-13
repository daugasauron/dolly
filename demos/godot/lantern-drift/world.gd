@tool
extends Node3D
## The sky archipelago, built in slices ahead of the glider and cleared behind it. Rings follow a
## meandering course; islands crowd around it, some close enough to thread between.

signal ring_taken(ring: Area3D)

const ISLAND := preload("res://island.tscn")
const RING := preload("res://ring.tscn")
const SLICE := 40.0
const AHEAD := 640.0
const BEHIND := 90.0
const CLEAR_START := 70.0
const LANTERN_SHADER := preload("res://sky_lantern.gdshader")

static var lantern_mesh: CylinderMesh

var rng := RandomNumberGenerator.new()
var built_to := 0.0
var next_ring := 0.0
var rings: Array[Area3D] = []


## The course's centre at a distance flown, heading toward -z.
static func course(distance: float) -> Vector3:
	return Vector3(sin(distance * 0.0042) * 75.0 + sin(distance * 0.0125 + 1.3) * 24.0,
		26.0 + sin(distance * 0.0075) * 13.0, -distance)


## In the editor the first stretch of the course stands as a run starts it (main.gd), so the scene
## shows the islands and rings; what is built here is not the scene's and is not saved with it.
func _ready() -> void:
	if Engine.is_editor_hint():
		reset(7919)
		advance(0.0)


func reset(seed_value: int) -> void:
	for child in get_children():
		child.free()
	rings.clear()
	rng.seed = seed_value
	built_to = 0.0
	next_ring = 90.0


## Builds up to AHEAD past `distance` and frees what lies more than BEHIND behind it.
func advance(distance: float) -> void:
	while built_to < distance + AHEAD:
		build_slice(built_to, built_to + SLICE)
		built_to += SLICE
	for child in get_children():
		if child.position.z > -distance + BEHIND:
			if child is Area3D:
				rings.erase(child)
			child.queue_free()


## The nearest ring ahead of a point that is not yet taken.
func next_ring_after(at: Vector3) -> Area3D:
	for ring in rings:
		if not ring.collected and ring.position.z < at.z - 4.0:
			return ring
	return null


func build_slice(from: float, to: float) -> void:
	while next_ring < to:
		var ring: Area3D = RING.instantiate()
		var at := course(next_ring) + Vector3(rng.randf_range(-6, 6), rng.randf_range(-4, 4), 0)
		add_child(ring)
		ring.position = at
		ring.look_at(course(next_ring + 30.0), Vector3.UP)
		ring.taken.connect(func(taken: Area3D) -> void: ring_taken.emit(taken))
		rings.append(ring)
		next_ring += rng.randf_range(62.0, 90.0)

	for i in rng.randi_range(3, 5):
		var d := rng.randf_range(from, to)
		if d < CLEAR_START:
			continue
		var centre := course(d)
		var radius := rng.randf_range(6.0, 22.0)
		var side := -1.0 if rng.randf() < 0.5 else 1.0
		# Mostly beside the course; one in five close enough to fly past.
		var gap := radius + (rng.randf_range(10.0, 15.0) if rng.randf() < 0.2 else rng.randf_range(16.0, 190.0))
		spawn_island(centre + Vector3(side * gap, rng.randf_range(-26.0, 14.0), 0.0), radius)

	for i in rng.randi_range(1, 3):
		var d := rng.randf_range(from, to)
		if d < CLEAR_START:
			continue
		var centre := course(d)
		var offset := Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(14.0, 34.0)
		spawn_island(centre + Vector3(offset.x, offset.y, 0.0), rng.randf_range(1.8, 3.6))

	spawn_lanterns(from, to)


## Sky lanterns released by someone below, drifting around the course: one draw for a slice.
func spawn_lanterns(from: float, to: float) -> void:
	if not lantern_mesh:
		lantern_mesh = CylinderMesh.new()
		lantern_mesh.top_radius = 0.6
		lantern_mesh.bottom_radius = 0.45
		lantern_mesh.height = 1.25
		lantern_mesh.radial_segments = 8
		lantern_mesh.rings = 1
		var glow := ShaderMaterial.new()
		glow.shader = LANTERN_SHADER
		lantern_mesh.material = glow
	var lanterns := MultiMesh.new()
	lanterns.transform_format = MultiMesh.TRANSFORM_3D
	lanterns.mesh = lantern_mesh
	lanterns.instance_count = rng.randi_range(5, 10)
	var middle := course((from + to) / 2.0)
	for i in lanterns.instance_count:
		var d := rng.randf_range(from, to)
		var around := Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(14.0, 90.0)
		var at := course(d) + Vector3(around.x, around.y * 0.5 + 10.0, 0.0) - middle
		lanterns.set_instance_transform(i, Transform3D(Basis.from_scale(Vector3.ONE * rng.randf_range(0.8, 1.6)), at))
	var drift := MultiMeshInstance3D.new()
	drift.multimesh = lanterns
	drift.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	drift.position = middle
	add_child(drift)


func spawn_island(at: Vector3, radius: float) -> void:
	var island: StaticBody3D = ISLAND.instantiate()
	island.position = at
	island.rotation.y = rng.randf() * TAU
	island.build(rng, radius)
	add_child(island)
