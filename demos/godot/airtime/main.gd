# Airtime: Foundry. The game of demos/bhop's bhop.c on Godot: its course, movement, timer,
# checkpoints, practice sections and controls, ticked at 100 Hz in Airtime's units (movement.gd,
# course.gd); what it shows is Godot's (foundry.gd, pads.gd, hud.gd).
extends Node3D

const METRES := 0.025          # One Airtime unit, in metres.
const EYE := 64.0              # Eye height above the feet, units.
const LOOK := 0.0011           # Radians a CSS pixel of mouse motion turns, as Airtime.
const TURN := 1.6              # Radians a second the arrow keys turn.
const RECORD := "user://foundry-record.txt"
const SECTIONS := ["01 / LOADING YARD", "02 / TURBINE HALL", "03 / REACTOR", "04 / SILO RUN", "FINISH"]

var course := Course.new()
var player := Movement.Player.new()
var checkpoint := 0
var furthest := 0
var deaths := 0
var finished := false
var practice := false
var ticks := 0
var air_ticks := 0
var gain_ticks := 0
var yaw := 0.0
var pitch := -0.06
var turned := Vector2.ZERO     # How far the mouse has turned the view, radians right and up.
var elapsed := 0.0
var best := 0.0
var peak_speed := 0.0
var landing_speed := 0.0
var looking := false
var keys := {"forward": false, "backward": false, "left": false, "right": false, "turn_left": false, "turn_right": false}
var previous := Vector3.ZERO   # The feet at the last two ticks, for the camera between them.
var current := Vector3.ZERO
var autopilot: Node = null

@onready var camera: Camera3D = $Camera
@onready var pads: Node3D = $Pads
@onready var hud: CanvasLayer = $Hud


func _ready() -> void:
	if FileAccess.file_exists(RECORD):
		var value := FileAccess.get_file_as_string(RECORD).strip_edges().to_float()
		if is_finite(value) and value > 0:
			best = value
	$Foundry.build(course, METRES)
	pads.build(course, METRES)
	respawn(true)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	var arguments := OS.get_cmdline_user_args()
	var index := arguments.find("--autopilot")
	if index >= 0:
		autopilot = preload("res://autopilot.gd").new(self, float(arguments[index + 1]) if index + 1 < arguments.size() else 0.0)
		add_child(autopilot)


func respawn(restart: bool) -> void:
	if restart:
		checkpoint = 0
		furthest = 0
		deaths = 0
		finished = false
		practice = false
		ticks = 0
		player.jumps = 0
		air_ticks = 0
		gain_ticks = 0
		elapsed = 0
		peak_speed = 0
		landing_speed = 0
		course.collapses = 0
	course.reset()
	var low: Vector3 = course.pads[checkpoint][0]
	var high: Vector3 = course.pads[checkpoint][1]
	var jumps := player.jumps
	player = Movement.Player.new()
	player.jumps = jumps
	player.position = Vector3((low.x + high.x) / 2, high.y + 0.01, (low.z + high.z) / 2 + (115 if checkpoint == 0 else 40))
	player.ground = checkpoint
	var here := (low + high) / 2
	var next_pad: Array = course.pads[checkpoint + (1 if checkpoint < Course.PADS - 1 else 0)]
	var there: Vector3 = (next_pad[0] + next_pad[1]) / 2
	yaw = atan2(there.x - here.x, here.z - there.z)
	pitch = -0.06
	for key in keys:
		keys[key] = false
	previous = player.position
	current = player.position
	pads.reset()


func _physics_process(_delta: float) -> void:
	if autopilot:
		autopilot.steer()
	previous = current
	if looking and not finished:
		tick()
	current = player.position


# Airtime's tick(): one step of the course and the game's bookkeeping.
func tick() -> void:
	yaw += (float(keys.turn_right) - float(keys.turn_left)) * Movement.STEP * TURN
	var grounded := player.ground >= 0
	var before := Movement.speed(player)
	var landed_before := player.ground
	course.tick(player, yaw, float(keys.forward) - float(keys.backward), float(keys.right) - float(keys.left))
	ticks += 1
	var speed := Movement.speed(player)
	peak_speed = maxf(peak_speed, speed)
	if not grounded and (keys.left or keys.right or keys.forward or keys.backward):
		air_ticks += 1
		if speed > before + 0.001:
			gain_ticks += 1
	if player.position.z < -180 or elapsed > 0:
		elapsed += Movement.STEP
	var pad := player.ground
	if not grounded and pad >= 0:
		landing_speed = speed
		pads.landed(pad, speed)
	if grounded and pad < 0 and landed_before >= 0:
		pads.jumped(landed_before)
	furthest = maxi(furthest, pad)
	if pad > checkpoint and Course.is_checkpoint(pad):
		checkpoint = pad
	if pad == Course.PADS - 1 and not finished:
		finished = true
		if not autopilot:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		if not practice and (best == 0 or elapsed < best):
			best = elapsed
			var file := FileAccess.open(RECORD, FileAccess.WRITE)
			if file:
				file.store_string("%.3f\n" % best)
	if player.position.y < -200:
		deaths += 1
		respawn(false)


func _process(_delta: float) -> void:
	# The game runs while it has the pointer, as Airtime's does (in Dolly, from the click
	# that captures it to Escape).
	var captured := autopilot != null or Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if looking and not captured:
		for key in keys:
			keys[key] = false
	looking = captured
	var feet := previous.lerp(current, Engine.get_physics_interpolation_fraction())
	camera.position = (feet + Vector3(0, EYE, 0)) * METRES
	camera.rotation = Vector3(pitch, -yaw, 0)
	# A little more of the world at speed; the movement is Airtime's whatever is shown.
	var speed := Movement.speed(player)
	camera.fov = lerpf(camera.fov, 74.0 + clampf((speed - 250.0) / 450.0, 0, 1) * 14.0, 0.08)
	pads.show_course(course, player.ground)
	$Foundry.follow(camera.global_position)
	hud.show_state(self)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT and not looking and not finished:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		elif event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN] and looking:
			player.jump_queue = 2
	elif event is InputEventMouseMotion and looking:
		# The pointer's own pixels, as Airtime turns, which the stretch to 1280 by 720 leaves unscaled.
		var motion: Vector2 = event.screen_relative
		yaw += motion.x * LOOK
		pitch = clampf(pitch - motion.y * LOOK, -1.48, 1.48)
		turned += Vector2(motion.x, -motion.y) * LOOK
	elif event is InputEventKey and not event.echo:
		var down: bool = event.pressed
		match event.physical_keycode:
			KEY_W: keys.forward = down
			KEY_S: keys.backward = down
			KEY_A: keys.left = down
			KEY_D: keys.right = down
			KEY_LEFT: keys.turn_left = down
			KEY_RIGHT: keys.turn_right = down
		if not down:
			return
		match event.physical_keycode:
			KEY_SPACE:
				if looking:
					player.jump_queue = 2
			KEY_R:
				respawn(true)
				Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			KEY_F:
				deaths += 1
				respawn(false)
			KEY_Q:
				print("AIRTIME view %d %d" % [roundi(rad_to_deg(turned.x)), roundi(rad_to_deg(turned.y))])
				get_tree().quit()
			KEY_ESCAPE:
				if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
					Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			KEY_1, KEY_2, KEY_3, KEY_4:
				checkpoint = (event.physical_keycode - KEY_1) * 8
				furthest = checkpoint
				finished = false
				practice = true
				elapsed = 0
				respawn(false)


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		for key in keys:
			keys[key] = false
