# Airtime's HUD: title and section, a mark per pad, the clock and the record, falls, the speed
# with its bar, sync, landing and peak speed, the controls, the crosshair, the cue to jump off a
# dropping pad, and the panel shown before the pointer is taken and at the finish.
extends CanvasLayer

const INK := Color(0.906, 0.922, 0.918)
const ACCENT := Color(1.0, 0.725, 0.322)
const CYAN := Color(0.33, 0.855, 0.804)
const MUTED := Color(0.569, 0.624, 0.675)
const PANEL := Color(0.04, 0.06, 0.08, 0.72)

var labels := {}
var marks: Array[ColorRect] = []
var speed_bar: ColorRect
var jump_bar: ColorRect
var panel: PanelContainer
var panel_title: Label
var panel_last: Label


func label(text: String, size: int, color: Color, parent: Control, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var node := Label.new()
	node.text = text
	node.horizontal_alignment = align
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	node.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	node.add_theme_constant_override("outline_size", 4)
	parent.add_child(node)
	return node


func bar(height: int, anchor_top: bool) -> Control:
	var strip := ColorRect.new()
	strip.color = PANEL
	strip.anchor_right = 1.0
	if anchor_top:
		strip.offset_bottom = height
	else:
		strip.anchor_top = 1.0
		strip.anchor_bottom = 1.0
		strip.offset_top = -height
	add_child(strip)
	var line := ColorRect.new()
	line.color = Color(ACCENT, 0.5)
	line.anchor_right = 1.0
	line.anchor_top = 1.0 if anchor_top else 0.0
	line.anchor_bottom = line.anchor_top
	line.offset_top = -1 if anchor_top else 0
	line.offset_bottom = 0 if anchor_top else 1
	strip.add_child(line)
	return strip


# A control `width` wide at (x, y) from the point of its parent its anchor names.
func place(node: Control, x: float, y: float, anchor_x := 0.0, anchor_y := 0.0, width := 0.0) -> void:
	node.anchor_left = anchor_x
	node.anchor_right = anchor_x
	node.anchor_top = anchor_y
	node.anchor_bottom = anchor_y
	node.offset_left = x
	node.offset_top = y
	node.offset_right = x + (width if width > 0 else node.get_combined_minimum_size().x)
	node.offset_bottom = y + node.get_combined_minimum_size().y


func _ready() -> void:
	var top := bar(64, true)
	place(label("A I R T I M E", 26, INK, top), 22, 6, 0.0, 0.0, 300)
	place(label("FOUNDRY / STRAFE TRIALS", 12, ACCENT, top), 24, 38, 0.0, 0.0, 300)
	labels.section = label("SECTION", 15, CYAN, top, HORIZONTAL_ALIGNMENT_CENTER)
	place(labels.section, -120, 10, 0.5, 0.0, 240)
	for index in Course.PADS:
		var mark := ColorRect.new()
		top.add_child(mark)
		place(mark, -99 + index * 6, 42, 0.5, 0.0, 3)
		mark.offset_bottom = mark.offset_top + (8 if Course.is_checkpoint(index) else 4)
		marks.append(mark)
	labels.clock = label("00.00", 20, INK, top, HORIZONTAL_ALIGNMENT_RIGHT)
	place(labels.clock, -330, 8, 1.0, 0.0, 308)
	labels.pads = label("PAD", 12, MUTED, top, HORIZONTAL_ALIGNMENT_RIGHT)
	place(labels.pads, -330, 38, 1.0, 0.0, 308)

	var bottom := bar(100, false)
	labels.speed = label("000", 44, ACCENT, bottom, HORIZONTAL_ALIGNMENT_CENTER)
	place(labels.speed, -80, 2, 0.5, 0.0, 160)
	place(label("UNITS / SECOND", 12, MUTED, bottom, HORIZONTAL_ALIGNMENT_CENTER), -80, 60, 0.5, 0.0, 160)
	var track := ColorRect.new()
	track.color = Color(0.18, 0.23, 0.27)
	track.anchor_right = 1.0
	track.anchor_top = 1.0
	track.anchor_bottom = 1.0
	track.offset_left = 22
	track.offset_right = -22
	track.offset_top = -16
	track.offset_bottom = -13
	bottom.add_child(track)
	speed_bar = ColorRect.new()
	speed_bar.size = Vector2(0, 3)
	track.add_child(speed_bar)
	labels.state = label("GROUND", 14, INK, bottom)
	place(labels.state, 22, 14, 0.0, 0.0, 300)
	labels.landing = label("LAND", 12, MUTED, bottom)
	place(labels.landing, 22, 40, 0.0, 0.0, 300)
	var hints := VBoxContainer.new()
	bottom.add_child(hints)
	place(hints, -250, 8, 1.0, 0.0, 230)
	label("WASD   SPACE / WHEEL JUMP", 12, INK, hints)
	label("R RESTART   F CHECKPOINT   Q EXIT", 11, MUTED, hints)
	label("1-4 PRACTICE A SECTION", 11, MUTED, hints)

	var cross := Control.new()
	cross.anchor_left = 0.5
	cross.anchor_top = 0.5
	cross.anchor_right = 0.5
	cross.anchor_bottom = 0.5
	add_child(cross)
	for shape in [Rect2(-7, -1, 14, 2), Rect2(-1, -7, 2, 14)]:
		var stroke := ColorRect.new()
		stroke.color = Color(INK, 0.85)
		stroke.position = shape.position
		stroke.size = shape.size
		cross.add_child(stroke)
	labels.jump = label("JUMP!", 18, ACCENT, cross, HORIZONTAL_ALIGNMENT_CENTER)
	labels.jump.position = Vector2(-40, 22)
	labels.jump.size.x = 80
	jump_bar = ColorRect.new()
	jump_bar.color = ACCENT
	jump_bar.position = Vector2(-32, 50)
	jump_bar.size = Vector2(64, 3)
	cross.add_child(jump_bar)

	panel = PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.03, 0.05, 0.07, 0.9)
	style.border_color = Color(ACCENT, 0.7)
	style.border_width_left = 3
	style.content_margin_left = 26
	style.content_margin_right = 26
	style.content_margin_top = 20
	style.content_margin_bottom = 20
	panel.add_theme_stylebox_override("panel", style)
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 0.5
	panel.anchor_bottom = 0.5
	panel.offset_left = -260
	panel.offset_right = 260
	panel.offset_top = -110
	panel.offset_bottom = 110
	add_child(panel)
	var lines := VBoxContainer.new()
	lines.add_theme_constant_override("separation", 6)
	panel.add_child(lines)
	panel_title = label("", 26, INK, lines)
	label("W to launch. In air, release W and strafe A / D", 14, MUTED, lines)
	label("while turning the mouse in the same direction.", 14, MUTED, lines)
	label("Amber pads drop on touch. Cyan decks are safe.", 14, INK, lines)
	panel_last = label("", 14, ACCENT, lines)
	ignore_mouse(self)


# The HUD only shows, and the mouse steers the view: a ColorRect, a Control or a panel stops
# mouse events by default, and one under the crosshair ate the captured mouse's motion.
func ignore_mouse(node: Node) -> void:
	if node is Control:
		node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in node.get_children():
		ignore_mouse(child)


func show_state(game: Node) -> void:
	var player: Movement.Player = game.player
	var speed := Movement.speed(player)
	labels.section.text = game.SECTIONS[game.checkpoint / 8]
	for index in marks.size():
		marks[index].color = CYAN if index <= game.furthest else INK if Course.is_checkpoint(index) else MUTED
	var record := "%.2f" % game.best if game.best > 0 else "--"
	labels.clock.text = "%05.2f  /  %s" % [game.elapsed, "PRACTICE" if game.practice else "BEST " + record]
	labels.pads.text = "PAD %02d/%02d    FALLS %d" % [game.furthest, Course.PADS - 1, game.deaths]
	labels.speed.text = "%03.0f" % speed
	var color := CYAN if speed > 300 else ACCENT
	labels.speed.add_theme_color_override("font_color", color)
	speed_bar.color = color
	speed_bar.size.x = (speed_bar.get_parent() as Control).size.x * minf(speed / 800.0, 1.0)
	var sync: float = 100.0 * game.gain_ticks / game.air_ticks if game.air_ticks else 0.0
	labels.state.text = "%s  |  SYNC %.0f%%" % ["AIR" if player.ground < 0 else "GROUND", sync]
	labels.landing.text = "LAND %.0f   PEAK %.0f" % [game.landing_speed, game.peak_speed]
	var ground := player.ground
	var dropping := ground >= 0 and not Course.is_checkpoint(ground)
	labels.jump.visible = dropping
	jump_bar.visible = dropping
	if dropping:
		jump_bar.size.x = 64.0 * maxi(game.course.cooldown[ground] - Course.PAD_RETURN, 0) / Course.PAD_DELAY
	panel.visible = not game.looking or game.finished
	panel_title.text = "COURSE COMPLETE  %.2f" % game.elapsed if game.finished else "CLICK TO TAKE THE MOUSE"
	panel_last.text = "R to race again. Q quits." if game.finished else "Escape gives the mouse back."
