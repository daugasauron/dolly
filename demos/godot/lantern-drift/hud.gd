extends CanvasLayer
## The flight's score, streak and lantern meter, and the title, pause and game-over panels.

enum State { TITLE, PLAYING, PAUSED, OVER }

@onready var flight: Control = $Flight
@onready var score_label: Label = $Flight/Score
@onready var streak_label: Label = $Flight/Streak
@onready var meter: ProgressBar = $Flight/Meter
@onready var pop_label: Label = $Flight/Pop
@onready var panel: Control = $Panel
@onready var heading: Label = $Panel/Lines/Heading
@onready var detail: Label = $Panel/Lines/Detail
@onready var action: Label = $Panel/Lines/Action
@onready var hint: Label = $Panel/Lines/Hint

var pop_tween: Tween


func show_state(state: int, best: int) -> void:
	flight.visible = state == State.PLAYING or state == State.PAUSED
	panel.visible = state != State.PLAYING
	match state:
		State.TITLE:
			heading.text = "LANTERN DRIFT"
			detail.text = "Fly through the rings of light to keep your lantern burning." + \
				("\nBest: %d" % best if best > 0 else "")
			action.text = "Enter or click to take off"
			hint.text = "Arrows or WASD steer · Space boosts · Esc pauses · Q quits"
		State.PAUSED:
			heading.text = "PAUSED"
			detail.text = ""
			action.text = "Esc to fly on"
			hint.text = "Q quits"


func show_flight(score: int, light: float, streak: int, _speed: float) -> void:
	score_label.text = str(score)
	streak_label.text = "%d rings in a row" % streak if streak > 1 else ""
	meter.value = light
	meter.modulate = Color(1, 0.45, 0.4) if light < 0.25 and int(Time.get_ticks_msec() / 250) % 2 == 0 else Color.WHITE


func show_over(reason: String, score: int, best: int) -> void:
	flight.visible = false
	panel.visible = true
	heading.text = str(score)
	detail.text = reason + ("\nA new best!" if score >= best and score > 0 else "\nBest: %d" % best)
	action.text = "Enter or click to fly again"
	hint.text = "Q quits"


func pop(text: String) -> void:
	pop_label.text = text
	pop_label.modulate = Color.WHITE
	pop_label.position.y = pop_label.get_parent_area_size().y * 0.5 - 130.0
	if pop_tween:
		pop_tween.kill()
	pop_tween = create_tween().set_parallel()
	pop_tween.tween_property(pop_label, "modulate:a", 0.0, 0.9).set_delay(0.25)
	pop_tween.tween_property(pop_label, "position:y", pop_label.position.y - 50.0, 1.15)
