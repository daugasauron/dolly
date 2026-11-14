extends RefCounted
## What the flyer's characters are built of: painted primitives, and coats of fur or feathers.

const SHELLS := 18 # of a coat


static func paint(colour: Color, roughness: float, glow := 0.0) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = colour
	material.roughness = roughness
	material.emission_enabled = glow > 0.0
	material.emission = colour
	material.emission_energy_multiplier = glow
	return material


static func part(to: Node3D, mesh: Mesh, material: Material, place: Vector3, turn := Vector3.ZERO, size := Vector3.ONE) -> MeshInstance3D:
	var instance := MeshInstance3D.new()
	instance.mesh = mesh
	instance.material_override = material
	instance.position = place
	instance.rotation_degrees = turn
	instance.scale = size
	to.add_child(instance)
	return instance


## A part in a coat: the part itself, and over it its fur or feathers, the same mesh in SHELLS
## shells that fur.gdshader spreads along its normals. The coat's material joins `coats`, which
## the wind is told to.
static func coated(coats: Array[ShaderMaterial], to: Node3D, mesh: Mesh, colour: Color, hair: float, hairs: Vector2, place: Vector3, turn := Vector3.ZERO, size := Vector3.ONE) -> MeshInstance3D:
	var skin := part(to, mesh, paint(colour * 0.6, 0.8), place, turn, size)
	var shells := MultiMesh.new()
	shells.transform_format = MultiMesh.TRANSFORM_3D
	shells.mesh = mesh
	shells.instance_count = SHELLS
	for shell in SHELLS:
		shells.set_instance_transform(shell, Transform3D.IDENTITY)
	var fur := ShaderMaterial.new()
	fur.shader = preload("res://fur.gdshader")
	fur.set_shader_parameter("colour", colour)
	fur.set_shader_parameter("shells", float(SHELLS))
	fur.set_shader_parameter("hair", hair)
	fur.set_shader_parameter("hairs", hairs)
	coats.append(fur)
	var coat := MultiMeshInstance3D.new()
	coat.multimesh = shells
	coat.material_override = fur
	coat.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	skin.add_child(coat)
	return skin


## A rod of a unit mesh that stands along y (a cylinder or capsule of height 1), laid from one
## point to another in its parent's frame, that thick.
static func lay(rod: Node3D, from: Vector3, to: Vector3, thick: float) -> void:
	var along := to - from
	var up := along.normalized()
	var side := up.cross(Vector3.RIGHT if absf(up.x) < 0.9 else Vector3.UP).normalized()
	rod.transform = Transform3D(Basis(side * thick, along, side.cross(up) * thick), (from + to) / 2.0)
