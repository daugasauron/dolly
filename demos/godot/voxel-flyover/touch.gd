extends Control
## What is drawn over the game for the hand that flies, and the game's controls on a
## touchscreen. While the player has the board, a small ring marks where it is headed, a dot in
## it where the stick is, and a bar at the left how far the throttle is open; while a chain of
## rings goes on, an arc around the score's ring shows the time left for the next. The first
## touch of a touchscreen takes the board. Then a thumb on the left third of the screen slides
## the throttle up and down; a thumb on the right is the stick, pushed from where it went down
## (a tenth of the screen's shorter side is all the way) and back to the middle when it is
## lifted; a second finger on the right with it zooms, as the two move apart or together; and the
## ring with a cross at the top right, which shows once a finger has touched the screen, gives
## the board back. Sizes go by the screen's shorter side.

var game: Node3D
var active := false # a finger has touched the screen
var stick := Vector2.ZERO # where the thumb holds the stick
var stick_finger := -1
var stick_from := Vector2.ZERO # where it went down
var throttle_finger := -1
var pinch_finger := -1
var pinched := 0.0 # how far apart the two fingers that zoom were
var fingers := {} # index -> where each finger is
var shown := 0.0
var headed := Vector2.ZERO # where on the screen the board is headed
var headed_shown := false # the camera sees that way
var chain_left := 0.0 # the share of a chain's time for its next ring that is left
var touches := 0 # counted, for the game's report


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func unit() -> float:
	return maxf(minf(size.x, size.y), 1.0)


## The ring that gives the board back.
func back() -> Vector2:
	return Vector2(size.x - unit() * 0.1, unit() * 0.1)


## The throttle's bar: its foot, and its length up the screen.
func bar() -> Array:
	return [Vector2(unit() * 0.09, size.y - unit() * 0.16), unit() * 0.5] if active else [Vector2(unit() * 0.05, size.y - unit() * 0.2), unit() * 0.22]


func holds_stick() -> bool:
	return stick_finger >= 0


func touched(event: InputEventScreenTouch) -> void:
	if not event.pressed:
		fingers.erase(event.index)
		if event.index == stick_finger or event.index == pinch_finger:
			stick_finger = -1
			pinch_finger = -1
			stick = Vector2.ZERO
		if event.index == throttle_finger:
			throttle_finger = -1
		return
	active = true
	touches += 1
	fingers[event.index] = event.position
	if not game.helm:
		game.helm = true
	elif event.position.distance_to(back()) < unit() * 0.085:
		game.helm = false
		stick_finger = -1
		pinch_finger = -1
		throttle_finger = -1
		stick = Vector2.ZERO
	elif event.position.x < size.x / 3.0:
		throttle_finger = event.index
	elif stick_finger < 0:
		stick_finger = event.index
		stick_from = event.position
	elif pinch_finger < 0:
		# A second finger with the stick's: the two zoom, and the stick is in the middle meanwhile.
		pinch_finger = event.index
		pinched = 0.0
		stick = Vector2.ZERO


func dragged(event: InputEventScreenDrag) -> void:
	if not fingers.has(event.index):
		return
	fingers[event.index] = event.position
	if event.index == throttle_finger:
		game.throttle = clampf(game.throttle - event.relative.y / bar()[1], 0.0, 1.0)
	elif pinch_finger >= 0 and (event.index == stick_finger or event.index == pinch_finger):
		var apart: float = (fingers[stick_finger] as Vector2).distance_to(fingers[pinch_finger])
		if pinched > 0.0 and apart > 1.0:
			game.zoom = clampf(game.zoom * pinched / apart, 0.45, 3.2)
		pinched = apart
	elif event.index == stick_finger:
		var pushed := (event.position - stick_from) / (unit() * 0.1)
		stick = Vector2(pushed.x, -pushed.y).limit_length(1.0)


func _process(delta: float) -> void:
	var wanted := 1.0 if game.helm else 0.0
	if shown > 0.0 or wanted > 0.0 or chain_left > 0.0:
		shown = move_toward(shown, wanted, delta * 3.0)
		queue_redraw()


func _draw() -> void:
	var wide := maxf(unit() * 0.0035, 1.5)
	if chain_left > 0.0:
		# Around the score's ring (main.gd's build_hud).
		draw_arc(Vector2(52, 58), 25.0, -PI / 2.0, -PI / 2.0 + TAU * chain_left, 48, Color(1.0, 0.72, 0.3, 0.9), 4.0, true)
	if shown <= 0.0:
		return
	var pale := Color(1, 1, 1, 0.34 * shown)
	var mark := unit() * 0.012
	if headed_shown:
		draw_arc(headed, mark, 0.0, TAU, 24, Color(1, 1, 1, 0.5 * shown), wide, true)
		draw_circle(headed + Vector2(game.stick.x, -game.stick.y) * mark * 2.2, wide * 1.2, Color(1, 1, 1, 0.6 * shown))
	var foot: Vector2 = bar()[0]
	var length: float = bar()[1]
	draw_line(foot, foot - Vector2(0, length), pale, wide * (3.0 if active else 1.5), true)
	draw_line(foot, foot - Vector2(0, length * game.throttle), Color(1.0, 0.72, 0.3, 0.7 * shown), wide * (3.0 if active else 1.5), true)
	if not active:
		return
	var ring := unit() * 0.042
	draw_arc(back(), ring, 0.0, TAU, 32, pale, wide * 1.7, true)
	draw_circle(back(), ring, Color(1, 1, 1, 0.12 * shown))
	for way: float in [-1.0, 1.0]:
		draw_line(back() + Vector2(-ring, -ring * way) * 0.38, back() + Vector2(ring, ring * way) * 0.38, pale, wide * 1.7, true)
	# The stick: where the thumb went down, or where it waits for one.
	var base := stick_from if holds_stick() else Vector2(size.x - unit() * 0.26, size.y - unit() * 0.24)
	draw_arc(base, unit() * 0.1, 0.0, TAU, 40, pale, wide, true)
	draw_circle(base + Vector2(stick.x, -stick.y) * unit() * 0.1, unit() * 0.035, Color(1, 1, 1, (0.3 if holds_stick() else 0.12) * shown))
