extends Node3D
## The flyer as Blender makes it (flyer.py): the surfboard and its two jets, the pelican
## pedalling its bicycle under the board for them, and the corgi in sunglasses and a cape on the
## board. It is read from a glTF file when the game starts (MODEL, or the file `--model` names),
## so a model Blender saves there shows on the next start. Of its animations, "pedal" follows the
## cranks' angle, "steer" the flight's turn, and "alive" plays by itself; main.gd's ride() moves
## the corgi's parts, which this finds by their names. A part whose extras ask for a coat gets
## fur.gdshader's shells over it, a cloth cape.gdshader's wind.

const Parts := preload("res://parts.gd")
const MODEL := "/usr/share/voxel-flyover/flyer.glb"
const SHELLS := 18 # of a coat

var coats: Array[ShaderMaterial] = [] # the fur and feathers, which the wind is told to
var plumes: Array[ShaderMaterial] = [] # the cloths but the cape: the pelican's long feathers and its scarf
var cape: ShaderMaterial
var skin := StandardMaterial3D.new() # under every coat
var dog: Node3D
var dog_head: Node3D
var legs: Array[MeshInstance3D] = []
var paws: Array[MeshInstance3D] = []
var ears: Array[Node3D] = []
var tail: MeshInstance3D
var angle := 0.0 # of the cranks
var turns := 1.0 # the cranks' turns in "pedal"
var pedalling := AnimationPlayer.new()
var steering := AnimationPlayer.new()


func _init() -> void:
	var path := MODEL
	var arguments := OS.get_cmdline_user_args()
	if arguments.has("--model"):
		path = arguments[arguments.find("--model") + 1]
	var document := GLTFDocument.new()
	var state := GLTFState.new()
	var error := document.append_from_file(path, state)
	if error != OK:
		OS.crash("The flyer's model %s cannot be read: %s" % [path, error_string(error)])
	var scene := document.generate_scene(state)
	add_child(scene)
	turns = scene.find_child("flyer", true, false).get_meta("extras", {}).get("pedal_turns", 1)
	for part in scene.find_children("*", "MeshInstance3D", true, false):
		dress(part)
	dog = named(scene, "dog")
	dog_head = named(scene, "dog_head")
	tail = named(scene, "dog_tail")
	for index in 4:
		legs.append(named(scene, "dog_leg_%d" % index))
		paws.append(named(scene, "dog_paw_%d" % index))
	for index in 2:
		ears.append(named(scene, "dog_ear_%d" % index))
	var player := scene.find_child("AnimationPlayer", true, false) as AnimationPlayer
	player.get_animation("alive").loop_mode = Animation.LOOP_LINEAR
	player.play("alive")
	# "pedal" and "steer" move other parts than "alive" and each other, each by a player of its
	# own that is only ever sought.
	for helper: Array in [[pedalling, "pedal"], [steering, "steer"]]:
		var other: AnimationPlayer = helper[0]
		player.get_parent().add_child(other)
		other.add_animation_library("", player.get_animation_library(""))
		other.play(helper[1])
		other.pause()
	pedal(0.0, 1.0, 0.0)


static func named(scene: Node, name: String) -> Node:
	var found := scene.find_child(name, true, false)
	if found == null:
		OS.crash("The flyer's model has no part named %s" % name)
	return found


## Gives a part what its extras ask for: a coat of fur or feathers in SHELLS shells over its skin,
## or cape.gdshader's cloth.
func dress(part: MeshInstance3D) -> void:
	# glTF multiplies a material's colour by its mesh's vertex colours (the jets' livery); Godot's
	# import does not.
	var mesh := part.mesh as ArrayMesh
	for surface in mesh.get_surface_count():
		# A mesh without them has white ones (Parts.lit).
		var material := mesh.surface_get_material(surface) as BaseMaterial3D
		if material:
			Parts.lit(material)
	var extras: Dictionary = part.get_meta("extras", {})
	if extras.has("coat"):
		var coat: Dictionary = extras["coat"]
		# Under it the skin is the colours of the mesh's vertices, as the coat is, darker.
		skin.albedo_color = Color(0.6, 0.6, 0.6)
		skin.vertex_color_use_as_albedo = true
		skin.roughness = 0.8
		part.material_override = skin
		var shells := MultiMesh.new()
		shells.transform_format = MultiMesh.TRANSFORM_3D
		shells.mesh = part.mesh
		shells.instance_count = SHELLS
		for shell in SHELLS:
			shells.set_instance_transform(shell, Transform3D.IDENTITY)
		var fur := ShaderMaterial.new()
		fur.shader = preload("res://fur.gdshader")
		fur.set_shader_parameter("shells", float(SHELLS))
		fur.set_shader_parameter("hair", coat["hair"])
		fur.set_shader_parameter("hairs", Vector2(coat["hairs"][0], coat["hairs"][1]))
		coats.append(fur)
		var shell := MultiMeshInstance3D.new()
		shell.multimesh = shells
		shell.material_override = fur
		shell.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		part.add_child(shell)
	if extras.has("cloth"):
		var measures: Dictionary = extras["cloth"]
		var material := ShaderMaterial.new()
		material.shader = preload("res://cape.gdshader")
		material.set_shader_parameter("widens", Vector2(measures["widens"][0], measures["widens"][1]))
		material.set_shader_parameter("flaps", measures["flaps"])
		material.set_shader_parameter("own", measures["own"])
		part.material_override = material
		if part.name == "cape":
			cape = material
		else:
			plumes.append(material)


## Turns the cranks: `fast` is how fast, 1 at the cruise's throttle; and turns the handlebar,
## the wings on its grips, into the flight's turn.
func pedal(delta: float, fast: float, turn: float) -> void:
	angle += TAU * 1.05 * fast * delta
	pedalling.seek(fposmod(angle / (TAU * turns), 1.0) * pedalling.current_animation_length, true)
	steering.seek((clampf(turn, -1.0, 1.0) * 0.5 + 0.5) * steering.current_animation_length, true)


## How hard the pelican is pushing, between 0 and 1: twice a turn of the cranks.
func stroke() -> float:
	return 0.5 + 0.5 * cos(angle * 2.0)
