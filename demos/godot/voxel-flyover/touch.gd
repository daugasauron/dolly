extends Control
## What is drawn over the game for the hand that steers, and the game's controls on a
## touchscreen. While the player has the board a small ring marks where it is headed: the
## point the mouse, or a finger's drag, moves. The first touch of a touchscreen takes the
## board; then a finger's drag steers as the mouse does, two fingers moving apart or together
## zoom, and the ring with a cross at the top right, which shows once a finger has touched the
## screen, gives the board back. Sizes go by the screen's shorter side.

var game: Node3D
var active := false # a finger has touched the screen
var fingers := {} # index -> where each finger is
var pinched := 0.0 # how far apart two of them were
var shown := 0.0
var headed := Vector2.ZERO # where on the screen the board is headed
var headed_shown := false # the camera sees that way
var touches := 0 # counted, for the game's report


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func unit() -> float:
	return maxf(minf(size.x, size.y), 1.0)


## The ring that gives the board back.
func back() -> Vector2:
	return Vector2(size.x - unit() * 0.1, unit() * 0.1)


func touched(event: InputEventScreenTouch) -> void:
	if not event.pressed:
		fingers.erase(event.index)
		pinched = 0.0
		return
	active = true
	touches += 1
	if not game.helm:
		game.helm = true
	elif event.position.distance_to(back()) < unit() * 0.085:
		game.helm = false
		fingers.clear()
	else:
		fingers[event.index] = event.position
		pinched = 0.0


func dragged(event: InputEventScreenDrag) -> void:
	if not fingers.has(event.index):
		return
	fingers[event.index] = event.position
	if fingers.size() >= 2:
		var two := fingers.values()
		var apart: float = (two[0] as Vector2).distance_to(two[1])
		if pinched > 0.0 and apart > 1.0:
			game.zoom = clampf(game.zoom * pinched / apart, 0.45, 3.2)
		pinched = apart
	else:
		# A drag across the screen's shorter side steers as far as the mouse does in 1,080 pixels.
		game.steer += event.relative * 1080.0 / unit()


func _process(delta: float) -> void:
	var wanted := 1.0 if game.helm else 0.0
	if shown > 0.0 or wanted > 0.0:
		shown = move_toward(shown, wanted, delta * 3.0)
		queue_redraw()


func _draw() -> void:
	if shown <= 0.0:
		return
	var pale := Color(1, 1, 1, 0.34 * shown)
	var wide := maxf(unit() * 0.0035, 1.5)
	if headed_shown:
		draw_arc(headed, unit() * 0.012, 0.0, TAU, 24, Color(1, 1, 1, 0.5 * shown), wide, true)
	if not active:
		return
	var ring := unit() * 0.042
	draw_arc(back(), ring, 0.0, TAU, 32, pale, wide * 1.7, true)
	draw_circle(back(), ring, Color(1, 1, 1, 0.12 * shown))
	for way: float in [-1.0, 1.0]:
		draw_line(back() + Vector2(-ring, -ring * way) * 0.38, back() + Vector2(ring, ring * way) * 0.38, pale, wide * 1.7, true)
