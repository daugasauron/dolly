# Airtime's Foundry course (bhop-course.h): 33 pads in four sections of eight, a safe
# checkpoint deck at every eighth; any other pad drops PAD_DELAY ticks after a landing and
# comes back PAD_RETURN ticks later.
class_name Course

const PADS := 33
const PAD_DELAY := 10
const PAD_RETURN := 200
const X := [0, 0, 48, 110, 160, 180, 140, 70, 0,
	-60, -130, -180, -160, -100, -20, 60, 120,
	180, 220, 190, 120, 40, -40, -120, -180,
	-200, -150, -80, 0, 80, 150, 190, 180]
const TOP := [0, 0, 0, 16, 16, 32, 32, 48, 48,
	32, 16, 0, -16, -16, 0, 0, 0,
	0, 16, 16, 32, 32, 48, 48, 64,
	64, 80, 80, 96, 96, 112, 112, 128]

var pads: Array = []  # [low, high] in Airtime's units
var cooldown := PackedInt32Array()
var collapses := 0


static func is_checkpoint(pad: int) -> bool:
	return pad >= 0 and pad < PADS and pad % 8 == 0


func _init() -> void:
	cooldown.resize(PADS)
	var z := 0.0
	for index in PADS:
		var section := (index - 1) / 8 if index else 0
		if index:
			z -= 400 if index == 1 else 220 + section * 10
		var width := 512.0 if index == 0 else 224.0 if is_checkpoint(index) else 88.0 - section * 8
		var depth := (512.0 if index == 0 else 256.0) if is_checkpoint(index) else width
		pads.append([Vector3(X[index] - width / 2, TOP[index] - 32, z - depth / 2),
			Vector3(X[index] + width / 2, TOP[index], z + depth / 2)])


func reset() -> void:
	cooldown.fill(0)


# How far a pad has dropped: 0 while it stands, else ticks since it fell (to PAD_RETURN).
func fallen(pad: int) -> int:
	var left := cooldown[pad]
	return PAD_RETURN - left if left > 0 and left <= PAD_RETURN else 0


func tick(player: Movement.Player, yaw: float, forward: float, side: float) -> void:
	var solid := []
	for index in PADS:
		if cooldown[index]:
			cooldown[index] -= 1
			if cooldown[index] == PAD_RETURN:
				collapses += 1
		var low: Vector3 = pads[index][0]
		var high: Vector3 = pads[index][1]
		if cooldown[index] > 0 and cooldown[index] <= PAD_RETURN:
			high = Vector3(high.x, low.y, high.z)
		solid.append([low, high])
	Movement.tick(player, yaw, forward, side, solid)
	var pad := player.ground
	if pad >= 0 and not is_checkpoint(pad) and not cooldown[pad]:
		cooldown[pad] = PAD_DELAY + PAD_RETURN
