extends RefCounted
## What the flyer's characters are built of: painted primitives, and coats of fur or feathers.

const SHELLS := 18 # of a coat

static var shapes := {} # arrays_of's


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


## A primitive mesh's arrays. The engine reads them back from the GPU, some 10 ms each time (a
## landmark's dozen parts cost a frame of 100 ms as it came near), so they are kept by the
## primitive's kind and measures.
static func arrays_of(mesh: PrimitiveMesh) -> Array:
	var shape := mesh.get_class()
	for property in mesh.get_property_list():
		if property.usage & PROPERTY_USAGE_STORAGE:
			shape += "|" + str(mesh.get(property.name))
	if not shapes.has(shape):
		shapes[shape] = mesh.get_mesh_arrays()
	return shapes[shape]


## Makes one mesh of the painted parts under a node (those under `apart` are left as they are)
## and frees the parts: a thing of many parts that stands still costs the renderer as one. A
## part's colour goes into its vertices, with alpha 1 where its paint glows.
static func bake(root: Node3D, apart: Array = []) -> ArrayMesh:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var colours := PackedColorArray()
	var indices := PackedInt32Array()
	for found in root.find_children("*", "MeshInstance3D", true, false):
		var part := found as MeshInstance3D
		var paint := part.material_override as StandardMaterial3D
		var place := part.transform
		var above := part.get_parent()
		var kept := false
		while above != root:
			kept = kept or apart.has(above)
			place = (above as Node3D).transform * place
			above = above.get_parent()
		if kept or paint == null or paint.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
			continue
		var arrays := arrays_of(part.mesh as PrimitiveMesh)
		var first := vertices.size()
		# A part's points and normals are moved all at once; the normals' lengths are left to the
		# fragment stage, which makes them one.
		vertices.append_array(place * (arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array))
		normals.append_array(Transform3D(place.basis.inverse().transposed(), Vector3.ZERO) * (arrays[Mesh.ARRAY_NORMAL] as PackedVector3Array))
		var colour := PackedColorArray()
		colour.resize(vertices.size() - first)
		colour.fill(Color(paint.albedo_color, 1.0 if paint.emission_enabled else 0.0))
		colours.append_array(colour)
		for index: int in arrays[Mesh.ARRAY_INDEX]:
			indices.append(first + index)
		part.get_parent().remove_child(part)
		part.queue_free()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colours
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
