# Plays the course for a test or a recording: `--autopilot SECONDS` runs that long, then prints
# what the run reached and quits (0 plays on). It aims at the next pad, jumps the tick it lands,
# strafes in the air for speed, with the view along the velocity as a player's is, and brakes
# when it would land past the pad.
extends Node

var game: Node
var seconds := 0.0
var aim := 1
var flip := 0


func _init(owner_game: Node, run_seconds: float) -> void:
	game = owner_game
	seconds = run_seconds


var frames := 0


func _ready() -> void:
	if seconds > 0:
		print("AIRTIME adapter ", RenderingServer.get_video_adapter_name(), " ", RenderingServer.get_current_rendering_method())
		get_tree().create_timer(seconds).timeout.connect(finish)


func _process(_delta: float) -> void:
	frames += 1


# What the run reached, the frame rate, and how much of the last frame is lit and how much is
# the metal's or a lamp's colour: a frame that draws the foundry has both.
func finish() -> void:
	var player: Movement.Player = game.player
	print("AIRTIME seconds %.1f frames %d fps %.1f ticks %d jumps %d falls %d pad %d peak %.0f elapsed %.2f finished %d" % [
		seconds, frames, frames / seconds, game.ticks, player.jumps, game.deaths, game.furthest, game.peak_speed,
		game.elapsed, int(game.finished)])
	var image := get_viewport().get_texture().get_image()
	if image and not image.is_empty():
		var bright := 0
		var warm := 0
		for y in range(0, image.get_height(), 8):
			for x in range(0, image.get_width(), 8):
				var c := image.get_pixel(x, y)
				if c.get_luminance() > 0.5:
					bright += 1
				if c.r > c.b + 0.2:
					warm += 1
		print("AIRTIME frame %dx%d bright %d warm %d" % [image.get_width(), image.get_height(), bright, warm])
	get_tree().quit()


# The input of the next tick, from the state the game is in.
func steer() -> void:
	var player: Movement.Player = game.player
	var course: Course = game.course
	if game.finished:
		return
	if player.ground >= 0:
		aim = player.ground + 1
	aim = clampi(maxi(aim, game.checkpoint + 1), 1, Course.PADS - 1)
	var low: Vector3 = course.pads[aim][0]
	var high: Vector3 = course.pads[aim][1]
	var target := Vector3((low.x + high.x) / 2, high.y, (low.z + high.z) / 2)
	var offset := Vector2(target.x - player.position.x, target.z - player.position.z)
	var keys: Dictionary = game.keys
	for key in keys:
		keys[key] = false
	player.jump_queue = 2
	var velocity := Vector2(player.velocity.x, player.velocity.z)
	var speed := velocity.length()
	if player.ground >= 0 or speed < 30:
		game.yaw = atan2(offset.x, -offset.y)
		keys.forward = true
		return
	# When the feet come down to the pad's top, and how far that carries them: short of the
	# pad's near edge it strafes for speed, past its far edge it brakes, between it keeps going.
	var fall := player.position.y - high.y
	var reach := player.velocity.y * player.velocity.y + 2 * Movement.GRAVITY * fall
	if reach < 0:
		reach = 0.0
	var landing := (player.velocity.y + sqrt(reach)) / Movement.GRAVITY
	var heading := velocity / speed
	var half := minf(high.x - low.x, high.z - low.z) / 2 + Movement.RADIUS * 0.5
	var carried := speed * landing
	if carried > offset.length() + half - 6:
		game.yaw = atan2(heading.x, -heading.y)
		keys.backward = true
		return
	# Strafe toward the pad: the wish direction just short of square to the velocity, on the
	# side the pad is; straight on, alternate sides.
	var toward := offset.normalized()
	var cross := heading.x * toward.y - heading.y * toward.x
	var side := signf(cross)
	if absf(cross) < 0.03:
		flip += 1
		side = 1.0 if (flip / 18) % 2 == 0 else -1.0
	var angle := acos(clampf(5.0 / speed, -1.0, 1.0))
	var wish := heading.rotated(angle * side)
	if side > 0:
		game.yaw = atan2(wish.y, wish.x)
		keys.right = true
	else:
		game.yaw = atan2(-wish.y, -wish.x)
		keys.left = true
