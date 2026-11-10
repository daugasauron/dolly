extends MeshInstance3D
## A ribbon behind a wingtip: the tip's last positions as a strip that thins and fades, turned to
## face the camera, rebuilt each frame in world space.

@export var tip: Node3D
@export var length := 16
@export var width := 0.05
@export var color := Color(1.0, 0.93, 0.85, 0.7)

var points: Array[Vector3] = []
var strip := ImmediateMesh.new()


func _ready() -> void:
	top_level = true
	mesh = strip
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.vertex_color_use_as_albedo = true
	material_override = material


func clear() -> void:
	points.clear()


# The tip's position each physics tick (60 a second), so the ribbon's length is a time.
func _physics_process(_delta: float) -> void:
	if tip:
		points.push_front(tip.global_position)
		if points.size() > length:
			points.pop_back()


func _process(_delta: float) -> void:
	if not is_visible_in_tree() or not tip:
		return
	global_transform = Transform3D.IDENTITY
	strip.clear_surfaces()
	if points.size() < 2:
		return
	var eye := get_viewport().get_camera_3d().global_position
	strip.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for i in points.size():
		var fade := 1.0 - float(i) / (points.size() - 1)
		var along := points[maxi(i - 1, 0)] - points[mini(i + 1, points.size() - 1)]
		var half := along.cross(eye - points[i]).normalized() * width * (0.3 + 0.7 * fade)
		strip.surface_set_color(Color(color, color.a * fade * fade))
		strip.surface_add_vertex(points[i] - half)
		strip.surface_set_color(Color(color, color.a * fade * fade))
		strip.surface_add_vertex(points[i] + half)
	strip.surface_end()
