extends Node3D
## Lantern Drift: glide a paper lantern through rings of light over a sky archipelago at dusk.
## Each ring refills the lantern; rings taken in a row multiply their points. Behind the title
## the glider flies itself.
##
## `-- --autopilot SECONDS` flies one run by itself, prints what it saw and quits: Dolly's tests
## and the editor's own run of the project use it.

enum State { TITLE, PLAYING, PAUSED, OVER }

const Glider := preload("res://glider.gd")
const SAVE_PATH := "user://lantern-drift.cfg"
const START := Vector3(0, 26, 0)

var state := State.TITLE
var score := 0
var rings_points := 0
var rings := 0
var streak := 0
var best := 0
var runs := 0
var autopilot_seconds := 0.0
var elapsed := 0.0
var frames := 0
var shake := 0.0

@onready var glider: CharacterBody3D = $Glider
@onready var world: Node3D = $World
@onready var camera: Camera3D = $Camera
@onready var hud: CanvasLayer = $HUD
@onready var sound: Node = $Sound
@onready var sea: MeshInstance3D = $CloudSea
@onready var sun: DirectionalLight3D = $Sun
@onready var moon: DirectionalLight3D = $Moon
@onready var environment: Environment = $Environment.environment

# Sunset, dusk and night: the sky, the fog and the light as the run goes on.
const SKIES := [
	{ "top": Color(0.1, 0.08, 0.27), "horizon": Color(0.96, 0.5, 0.36), "below": Color(0.6, 0.3, 0.35),
		"fog": Color(0.86, 0.5, 0.46), "ambient": Color(0.55, 0.45, 0.7), "shade": Color(0.27, 0.15, 0.32),
		"crest": Color(1.0, 0.66, 0.52) },
	{ "top": Color(0.05, 0.04, 0.18), "horizon": Color(0.78, 0.3, 0.38), "below": Color(0.35, 0.15, 0.3),
		"fog": Color(0.55, 0.28, 0.42), "ambient": Color(0.4, 0.32, 0.6), "shade": Color(0.17, 0.09, 0.24),
		"crest": Color(0.85, 0.42, 0.48) },
	{ "top": Color(0.01, 0.015, 0.06), "horizon": Color(0.13, 0.11, 0.3), "below": Color(0.04, 0.04, 0.1),
		"fog": Color(0.12, 0.12, 0.26), "ambient": Color(0.2, 0.22, 0.42), "shade": Color(0.05, 0.06, 0.14),
		"crest": Color(0.42, 0.5, 0.75) },
]
var nightfall := 4200.0
var shown_dusk := -1.0


func _ready() -> void:
	# The game pauses; this script, which unpauses it, does not.
	process_mode = Node.PROCESS_MODE_ALWAYS
	for node in [glider, world, sound]:
		node.process_mode = Node.PROCESS_MODE_PAUSABLE
	var arguments := OS.get_cmdline_user_args()
	var at := arguments.find("--autopilot")
	if at >= 0 and at + 1 < arguments.size():
		autopilot_seconds = arguments[at + 1].to_float()
	# Night comes after this many units of flight (tests ask for it sooner).
	at = arguments.find("--nightfall")
	if at >= 0 and at + 1 < arguments.size():
		nightfall = arguments[at + 1].to_float()
	var saved := ConfigFile.new()
	if saved.load(SAVE_PATH) == OK:
		best = saved.get_value("scores", "best", 0)
	glider.crashed.connect(_on_crashed)
	world.ring_taken.connect(_on_ring_taken)
	if autopilot_seconds > 0.0:
		print("DRIFT adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())
		begin(State.PLAYING)
	else:
		begin(State.TITLE)


func begin(next: State) -> void:
	state = next
	score = 0
	rings_points = 0
	rings = 0
	streak = 0
	runs += 1
	world.reset(runs * 7919)
	set_dusk(0.0)
	glider.start(START)
	camera.global_position = START + Vector3(0, 4, 12)
	hud.show_state(state, best)


func _unhandled_input(event: InputEvent) -> void:
	if autopilot_seconds > 0.0:
		return
	var pressed: bool = event is InputEventKey and event.pressed and not event.echo
	var key: Key = event.physical_keycode if event is InputEventKey else KEY_NONE
	var click: bool = event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT
	match state:
		State.TITLE, State.OVER:
			if (pressed and key in [KEY_ENTER, KEY_KP_ENTER, KEY_SPACE]) or click:
				begin(State.PLAYING)
			elif pressed and key in [KEY_Q, KEY_ESCAPE]:
				get_tree().quit()
		State.PLAYING:
			if pressed and key in [KEY_ESCAPE, KEY_P]:
				set_paused(true)
		State.PAUSED:
			if (pressed and key in [KEY_ESCAPE, KEY_P, KEY_ENTER]) or click:
				set_paused(false)
			elif pressed and key == KEY_Q:
				get_tree().quit()


func set_paused(paused: bool) -> void:
	state = State.PAUSED if paused else State.PLAYING
	get_tree().paused = paused
	hud.show_state(state, best)


func _physics_process(delta: float) -> void:
	if state == State.PAUSED:
		return
	if state == State.PLAYING and autopilot_seconds <= 0.0:
		glider.steering = Vector2(
			Input.get_axis("ui_left", "ui_right") + key_axis(KEY_A, KEY_D),
			Input.get_axis("ui_down", "ui_up") + key_axis(KEY_S, KEY_W)).limit_length(1.0)
		glider.boosting = Input.is_physical_key_pressed(KEY_SPACE) or Input.is_physical_key_pressed(KEY_SHIFT)
	else:
		fly_by_itself()
	world.advance(glider.distance)


func key_axis(negative: Key, positive: Key) -> float:
	return float(Input.is_physical_key_pressed(positive)) - float(Input.is_physical_key_pressed(negative))


## Steers toward the next ring, as the title screen's and the tests' pilot.
func fly_by_itself() -> void:
	var ring: Area3D = world.next_ring_after(glider.global_position)
	var target: Vector3 = ring.global_position if ring else glider.global_position + glider.forward() * 50.0 + Vector3.UP * (26.0 - glider.global_position.y)
	var local := glider.global_basis.inverse() * (target - glider.global_position)
	glider.steering = Vector2(clampf(local.x * 0.12, -1, 1), clampf(local.y * 0.15, -1, 1))
	glider.boosting = false
	if state != State.PLAYING:
		glider.light = 1.0


func _process(delta: float) -> void:
	follow(delta)
	sea.global_position = Vector3(glider.global_position.x, sea.global_position.y, glider.global_position.z)
	if state == State.PLAYING:
		set_dusk(glider.distance / nightfall)
		score = int(glider.distance / 4.0) + rings_points
		hud.show_flight(score, glider.light, streak, glider.speed)
		sound.wind(glider.speed + (Glider.BOOST if glider.boosting else 0.0), glider.light)
	elif state == State.TITLE:
		sound.wind(glider.speed, 1.0)
	if autopilot_seconds > 0.0:
		watch(delta)



func _on_ring_taken(_ring: Area3D) -> void:
	if state != State.PLAYING:
		return
	streak += 1
	rings += 1
	rings_points += 100 * mini(streak, 8)
	glider.refill(0.3)
	sound.chime(streak)
	hud.pop("+%d" % (100 * mini(streak, 8)))


func _on_crashed(reason: String) -> void:
	shake = 1.0
	sound.crash()
	if state == State.TITLE:
		# Not inside the physics step that found the crash.
		begin.call_deferred(State.TITLE)
		return
	if autopilot_seconds > 0.0:
		print("DRIFT crashed ", reason)
	state = State.OVER
	if score > best:
		best = score
		var saved := ConfigFile.new()
		saved.set_value("scores", "best", best)
		saved.save(SAVE_PATH)
	hud.show_over(reason, score, best)


## From sunset (0) through dusk to night (1). The sky is redrawn only when the step shows.
func set_dusk(dusk: float) -> void:
	dusk = clampf(dusk, 0.0, 1.0)
	if absf(dusk - shown_dusk) < 0.01:
		return
	shown_dusk = dusk
	var at := dusk * (SKIES.size() - 1)
	var from: Dictionary = SKIES[mini(int(at), SKIES.size() - 2)]
	var to: Dictionary = SKIES[mini(int(at) + 1, SKIES.size() - 1)]
	var t := at - mini(int(at), SKIES.size() - 2)
	var look := func(key: String) -> Color: return (from[key] as Color).lerp(to[key], t)
	var sky: ShaderMaterial = environment.sky.sky_material
	sky.set_shader_parameter("top_color", look.call("top"))
	sky.set_shader_parameter("horizon_color", look.call("horizon"))
	sky.set_shader_parameter("below_color", look.call("below"))
	sky.set_shader_parameter("night", smoothstep(0.55, 1.0, dusk))
	var clouds: ShaderMaterial = sea.mesh.material
	clouds.set_shader_parameter("shade", look.call("shade"))
	clouds.set_shader_parameter("crest", look.call("crest"))
	clouds.set_shader_parameter("horizon", look.call("horizon"))
	environment.fog_light_color = look.call("fog")
	environment.ambient_light_color = look.call("ambient")
	environment.volumetric_fog_albedo = look.call("fog").lightened(0.2)
	# The sun sinks to the horizon and goes out; the moon takes over, without shadows.
	sun.rotation = Vector3(lerpf(-0.244, -0.02, smoothstep(0.0, 0.8, dusk)), PI, 0.0)
	sun.light_energy = 1.35 * (1.0 - smoothstep(0.45, 0.85, dusk))
	sun.light_color = Color(1, 0.7, 0.48).lerp(Color(1, 0.42, 0.3), smoothstep(0.2, 0.7, dusk))
	sun.visible = sun.light_energy > 0.01
	moon.light_energy = 0.45 * smoothstep(0.6, 1.0, dusk)
	moon.visible = moon.light_energy > 0.01


## The camera trails the glider, widening its view with speed and shaking after a crash.
func follow(delta: float) -> void:
	var behind := glider.global_transform * Vector3(0, 2.3, 8.2)
	var t := 1.0 - exp(-delta * 4.5)
	camera.global_position = camera.global_position.lerp(behind, t)
	camera.look_at(glider.global_position + glider.forward() * 14.0 + Vector3.UP * 1.2, Vector3.UP)
	var speed_ratio: float = inverse_lerp(Glider.BASE_SPEED, Glider.TOP_SPEED + Glider.BOOST, glider.speed + (Glider.BOOST if glider.boosting else 0.0))
	camera.fov = lerpf(camera.fov, 70.0 + 22.0 * speed_ratio, t)
	if shake > 0.0:
		shake = maxf(0.0, shake - delta * 1.5)
		camera.h_offset = randf_range(-1, 1) * shake * 0.4
		camera.v_offset = randf_range(-1, 1) * shake * 0.4


## For automated runs: frame rate, rings and score, then a look at the frame and quit.
func watch(delta: float) -> void:
	elapsed += delta
	frames += 1
	if elapsed < autopilot_seconds and state == State.PLAYING:
		return
	autopilot_seconds = 0.0
	print("DRIFT seconds %.1f frames %d fps %.1f rings %d score %d distance %d" % [
		elapsed, frames, frames / elapsed, rings, score, int(glider.distance)])
	var image := get_viewport().get_texture().get_image()
	if not image or image.is_empty():
		get_tree().quit()
		return
	var bright := 0
	var warm := 0
	for y in range(0, image.get_height(), 4):
		for x in range(0, image.get_width(), 4):
			var c := image.get_pixel(x, y)
			if c.get_luminance() > 0.9:
				bright += 1
			if c.r > c.b + 0.2:
				warm += 1
	print("DRIFT frame %dx%d bright %d warm %d" % [image.get_width(), image.get_height(), bright, warm])
	get_tree().quit()
