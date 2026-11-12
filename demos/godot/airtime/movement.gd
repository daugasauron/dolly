# Airtime's movement, as demos/bhop's bhop-movement.h has it, in its own units (one unit an
# inch, y up): the same constants, the same 100 Hz tick and the same order of steps, so a run
# with the same inputs ends where the C game's does.
class_name Movement

const STEP := 0.01
const RADIUS := 16.0
const HEIGHT := 72.0
const GRAVITY := 800.0
const RUN_SPEED := 250.0


class Player:
	var position := Vector3.ZERO
	var velocity := Vector3.ZERO
	var ground := -1
	var jump_queue := 0
	var jumps := 0


static func speed(player: Player) -> float:
	return Vector2(player.velocity.x, player.velocity.z).length()


# GoldSrc's projection-limited acceleration: only the air projection is capped at 30; the
# acceleration uses the full wish speed.
static func accelerate(player: Player, yaw: float, forward: float, side: float, air: bool) -> void:
	var length := sqrt(forward * forward + side * side)
	if length == 0:
		return
	var x := (sin(yaw) * forward + cos(yaw) * side) / length
	var z := (-cos(yaw) * forward + sin(yaw) * side) / length
	var projection := player.velocity.x * x + player.velocity.z * z
	var available := (30.0 if air else RUN_SPEED) - projection
	var acceleration := minf(available, (10.0 if air else 5.0) * RUN_SPEED * STEP)
	if acceleration <= 0:
		return
	player.velocity.x += x * acceleration
	player.velocity.z += z * acceleration


# The first box the player's box meets moving by `delta`: fraction, normal and index (-1).
static func sweep(position: Vector3, delta: Vector3, boxes: Array) -> Array:
	var best_fraction := 1.0
	var best_normal := Vector3.ZERO
	var best_box := -1
	for index in boxes.size():
		var low: Vector3 = boxes[index][0]
		var high: Vector3 = boxes[index][1]
		if low.x >= high.x or low.y >= high.y or low.z >= high.z:
			continue
		var enter := -INF
		var leave := INF
		var normal := Vector3.ZERO
		var intersects := true
		for axis in 3:
			var lower: float = low[axis] - (HEIGHT if axis == 1 else RADIUS)
			var upper: float = high[axis] + (0.0 if axis == 1 else RADIUS)
			if absf(delta[axis]) < 1e-8:
				if position[axis] <= lower or position[axis] >= upper:
					intersects = false
					break
				continue
			var first: float = (lower - position[axis]) / delta[axis]
			var last: float = (upper - position[axis]) / delta[axis]
			var sign := -1.0
			if first > last:
				var swap := first
				first = last
				last = swap
				sign = 1.0
			if first > enter:
				enter = first
				normal = Vector3.ZERO
				normal[axis] = sign
			leave = minf(leave, last)
			if enter > leave:
				intersects = false
				break
		if intersects and enter >= 0 and enter < best_fraction and leave >= 0:
			best_fraction = enter
			best_box = index
			best_normal = normal
	return [best_fraction, best_normal, best_box]


static func slide(player: Player, boxes: Array) -> void:
	var remaining := STEP
	for bump in 4:
		if remaining <= 0:
			break
		var delta := player.velocity * remaining
		var hit := sweep(player.position, delta, boxes)
		var fraction: float = hit[0]
		var normal: Vector3 = hit[1]
		player.position += delta * fraction + normal * 0.01
		if hit[2] < 0:
			break
		remaining *= 1 - fraction
		var inward := player.velocity.dot(normal)
		if inward < 0:
			player.velocity -= normal * inward


static func find_ground(player: Player, boxes: Array) -> void:
	player.ground = -1
	if player.velocity.y > 0:
		return
	var hit := sweep(player.position, Vector3(0, -2, 0), boxes)
	var normal: Vector3 = hit[1]
	if hit[2] >= 0 and normal.y > 0.7:
		player.position.y -= 2 * hit[0] - 0.01
		player.velocity.y = 0
		player.ground = hit[2]


static func tick(player: Player, yaw: float, forward: float, side: float, boxes: Array) -> void:
	find_ground(player, boxes)
	if player.jump_queue > 0 and player.ground >= 0:
		player.velocity.y = sqrt(2 * GRAVITY * 45)
		player.ground = -1
		player.jump_queue = 0
		player.jumps += 1
	if player.jump_queue > 0:
		player.jump_queue -= 1
	if player.ground >= 0:
		var current := speed(player)
		if current > 0:
			var retained := maxf(0, current - maxf(75, current) * 4 * STEP) / current
			player.velocity.x *= retained
			player.velocity.z *= retained
	accelerate(player, yaw, forward, side, player.ground < 0)
	if player.ground >= 0 and speed(player) > RUN_SPEED:
		var scale := RUN_SPEED / speed(player)
		player.velocity.x *= scale
		player.velocity.z *= scale
	player.velocity.y -= GRAVITY * STEP / 2
	slide(player, boxes)
	player.velocity.y -= GRAVITY * STEP / 2
	find_ground(player, boxes)
