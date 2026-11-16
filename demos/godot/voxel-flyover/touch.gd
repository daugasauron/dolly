extends Control
## The game's controls on a touchscreen, which show once a finger has touched it. The first touch
## takes the board. Then the left thumb has a stick, which stands where the thumb comes down on
## the lower left of the screen: sideways it steers, up it climbs (and keeps climbing, out of the
## air), down it dives. A finger anywhere else turns the view, two of them moving apart or
## together zoom, and the ring at the top right gives the board back. Sizes go by the screen's
## shorter side, so the controls are a thumb's in portrait and in landscape.

var game: Node3D
var active := false # a finger has touched the screen
var stick := Vector2.ZERO # the thumb's: x to the right, y down, each between -1 and 1
var stick_finger := -1
var stick_base := Vector2.ZERO
var gazes := {} # the fingers that turn the view: index -> where each is
var pinched := 0.0 # how far apart two of them were
var shown := 0.0
var touches := 0 # counted, for the game's report


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func unit() -> float:
	return minf(size.x, size.y)


## Where the stick rests while no thumb holds it.
func home() -> Vector2:
	return Vector2(unit() * 0.24, size.y - unit() * 0.26)


func reach() -> float:
	return unit() * 0.12


## The ring that gives the board back.
func back() -> Vector2:
	return Vector2(size.x - unit() * 0.1, unit() * 0.1)


func touched(event: InputEventScreenTouch) -> void:
	var at := event.position
	if not event.pressed:
		if event.index == stick_finger:
			stick_finger = -1
			stick = Vector2.ZERO
		gazes.erase(event.index)
		pinched = 0.0
		return
	active = true
	touches += 1
	if not game.helm:
		game.helm = true
	elif at.distance_to(back()) < unit() * 0.085:
		game.helm = false
		stick_finger = -1
		stick = Vector2.ZERO
		gazes.clear()
	elif stick_finger < 0 and at.x < size.x * 0.45 and at.y > size.y * 0.4:
		stick_finger = event.index
		# The stick stands under the thumb, all of it on the screen.
		stick_base = at.clamp(Vector2.ONE * reach() * 1.2, size - Vector2.ONE * reach() * 1.2)
		stick = ((at - stick_base) / reach()).limit_length(1.0)
	else:
		gazes[event.index] = at
		pinched = 0.0


func dragged(event: InputEventScreenDrag) -> void:
	if event.index == stick_finger:
		stick = ((event.position - stick_base) / reach()).limit_length(1.0)
	elif gazes.has(event.index):
		gazes[event.index] = event.position
		if gazes.size() >= 2:
			var fingers := gazes.values()
			var apart: float = (fingers[0] as Vector2).distance_to(fingers[1])
			if pinched > 0.0 and apart > 1.0:
				game.zoom = clampf(game.zoom * pinched / apart, 0.45, 3.2)
			pinched = apart
		else:
			# As far round for a drag across the screen's shorter side as the mouse turns it for 1,080 pixels.
			var turn := 0.0035 * 1080.0 / unit()
			game.look.x += event.relative.x * turn
			game.look.y = clampf(game.look.y + event.relative.y * turn, -0.5, 1.0)


## The stick's push past a small dead middle, as the keys' axes are: x turns, y climbs (up).
func push() -> Vector2:
	var pushed := stick.length()
	if pushed < 0.14:
		return Vector2.ZERO
	return stick / pushed * ((pushed - 0.14) / 0.86) * Vector2(1.0, -1.0)


func _process(delta: float) -> void:
	var wanted := 1.0 if active and game.helm else 0.0
	if shown != wanted or stick_finger >= 0:
		shown = move_toward(shown, wanted, delta * 3.0)
		queue_redraw()


func _draw() -> void:
	if shown <= 0.0:
		return
	var pale := Color(1, 1, 1, 0.34 * shown)
	var faint := Color(1, 1, 1, 0.12 * shown)
	var wide := maxf(unit() * 0.006, 2.0)
	var base := stick_base if stick_finger >= 0 else home()
	draw_arc(base, reach(), 0.0, TAU, 48, pale, wide, true)
	draw_circle(base, reach(), faint)
	# Up and down on the stick are the climb and the dive: two small marks say so.
	for way: float in [-1.0, 1.0]:
		var tip := base + Vector2(0, way * reach() * 0.82)
		draw_polyline(PackedVector2Array([tip + Vector2(-reach() * 0.14, -way * reach() * 0.14), tip, tip + Vector2(reach() * 0.14, -way * reach() * 0.14)]), pale, wide, true)
	draw_circle(base + stick * reach(), reach() * 0.42, Color(1, 1, 1, (0.5 if stick_finger >= 0 else 0.26) * shown))
	# The ring that gives the board back: a ring with a cross.
	var ring := unit() * 0.042
	draw_arc(back(), ring, 0.0, TAU, 32, pale, wide, true)
	draw_circle(back(), ring, faint)
	for way: float in [-1.0, 1.0]:
		draw_line(back() + Vector2(-ring, -ring * way) * 0.38, back() + Vector2(ring, ring * way) * 0.38, pale, wide, true)
