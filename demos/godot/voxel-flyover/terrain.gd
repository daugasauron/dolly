extends RefCounted
## terrain.gdshaderinc's world, computed here for the flight: the same hash, noise and heights.

const SEA := 24.0
const MASK := 0xFFFFFFFF


static func cell_hash(x: int, y: int) -> float:
	var px := ((x & MASK) * 1597334673) & MASK
	var py := ((y & MASK) * 3812015801) & MASK
	var n := ((px ^ py) * 1597334673) & MASK
	n ^= n >> 15
	n = (n * 2246822519) & MASK
	n ^= n >> 13
	return float(n >> 8) / 16777216.0


static func noise(p: Vector2) -> float:
	var i := p.floor()
	var f := p - i
	var u := f * f * f * (f * (f * 6.0 - Vector2(15, 15)) + Vector2(10, 10))
	var x := int(i.x)
	var y := int(i.y)
	return lerpf(lerpf(cell_hash(x, y), cell_hash(x + 1, y), u.x), lerpf(cell_hash(x, y + 1), cell_hash(x + 1, y + 1), u.x), u.y)


static func fbm(p: Vector2, octaves: int) -> float:
	var sum := 0.0
	var weight := 0.5
	var total := 0.0
	for octave in octaves:
		sum += noise(p) * weight
		total += weight
		p = Vector2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.02 + Vector2(3.1, 1.7)
		weight *= 0.5
	return sum / total


static func ridge(p: Vector2) -> float:
	var n := 1.0 - absf(noise(p) * 2.0 - 1.0)
	return n * n


## terrain.gdshaderinc's slow field.
static func slow(p: Vector2, size: float, turn: float, place: Vector2) -> float:
	return fbm(Vector2(cos(turn) * p.x - sin(turn) * p.y, sin(turn) * p.x + cos(turn) * p.y) / size + place, 2)


## The slow fields a height is made with, x: the seas' shift, y: the relief, z: the massif. They
## change little over a hundred units, so the heights around a place share them.
static var slow_place := Vector2(INF, INF)
static var slow_fields := Vector3.ZERO


static func slow_here(p: Vector2) -> Vector3:
	if p.distance_squared_to(slow_place) > 2500.0:
		slow_place = p
		slow_fields = Vector3((slow(p, 7300.0, 0.7, Vector2(34.0, 62.0)) - 0.5) * 0.9 + (slow(p, 2700.0, 1.9, Vector2(104.0, 42.0)) - 0.5) * 0.5,
			lerpf(0.3, 1.0, smoothstep(0.3, 0.5, slow(p, 1900.0, 2.6, Vector2(38.0, 77.0)))),
			smoothstep(0.72, 0.83, slow(p, 19000.0, 0.3, Vector2(64.0, 22.0))))
	return slow_fields


static func height(p: Vector2) -> float:
	var fields := slow_here(p)
	var massif := fields.z
	var land := smoothstep(0.36, 0.52, fbm(p / 520.0, 3) + fields.x)
	var hills := fbm(p / 130.0 + Vector2(17.0, 5.0), 4)
	var ranges := smoothstep(0.36, 0.58, fbm(p / 640.0 + Vector2(80.0, 31.0), 2) + 0.3 * massif)
	var q := p / 260.0 + Vector2(40.0, 12.0)
	var crest := ridge(q)
	var spur := ridge(q * 2.3 + Vector2(9.0, 77.0)) * crest
	var peaks := crest * 0.6 + spur * 0.3 + ridge(q * 5.1 + Vector2(3.0, 41.0)) * spur * 0.16
	var high := SEA - 13.0 - 24.0 * smoothstep(-0.05, -0.3, fields.x) + land * (16.0 + 45.0 * massif) + hills * 22.0 * (0.35 + land) + peaks * 125.0 * land * ranges * (fields.y + 1.5 * massif)
	if high < SEA - 2.5 or high > SEA + 90.0:
		return high
	var gate := 1.0 - smoothstep(SEA + 45.0, SEA + 90.0, high)
	var w := p / 900.0 + 0.35 * Vector2(noise(p / 310.0 + Vector2(7.0, 3.0)), noise(p / 310.0 + Vector2(51.0, 23.0)))
	var valley := smoothstep(0.012 * gate, 0.1, absf(noise(w + Vector2(140.0, 77.0)) - 0.5))
	return lerpf(high, SEA - 2.5 + (high - SEA + 2.5) * valley, gate)


## The surface a flight stays above: the ground or the sea.
static func surface(p: Vector2) -> float:
	return maxf(height(p), SEA)


const LOT := 16.0


## terrain.gdshaderinc's town_at.
static func town(p: Vector2, ground: float) -> float:
	return smoothstep(0.58, 0.66, fbm(p / 760.0 + Vector2(400.0, 109.0), 2)) * smoothstep(SEA + 4.5, SEA + 8.0, ground) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, ground))


## terrain.gdshaderinc's climate. x: warmth, y: moisture.
static func climate(p: Vector2) -> Vector2:
	return Vector2(fbm(p / 900.0 + Vector2(211.0, 57.0), 2) + (slow(p, 19000.0, 1.3, Vector2(37.0, 14.0)) - 0.5) * 0.55,
		fbm(p / 560.0 + Vector2(13.0, 143.0), 2) + (slow(p, 11000.0, 2.2, Vector2(89.0, 44.0)) - 0.5) * 0.45)


## terrain.gdshaderinc's town_kind.
static func town_kind(p: Vector2, ground: float) -> int:
	var air := climate(p)
	if air.x > 0.57 and air.y < 0.47:
		return 2
	if air.x < 0.42:
		return 3
	var culture := slow(p, 5100.0, 1.1, Vector2(3.0, 8.0))
	if culture > 0.6:
		return 0
	if air.x > 0.52 and air.y < 0.57:
		return 7
	if air.x > 0.5 and ground < SEA + 13.0:
		return 6
	return 4 if culture < 0.42 else 1


## The top of the building that stands on the lot at a corner (terrain.gdshaderinc's
## building_height, city.gdshader's steep lots, and the most a roof of its kind rises), or -INF
## where none does.
static func building_top(corner: Vector2) -> float:
	var centre := corner + Vector2(LOT, LOT) / 2.0
	var ground := height(centre)
	var share := town(centre, ground)
	var lot := Vector2i((corner / LOT + Vector2(0.5, 0.5)).floor())
	if posmod(lot.x, 5) == 0 or posmod(lot.y, 6) == 0:
		return -INF
	if share < 0.1:
		# A stilt village's house (terrain.gdshaderinc's stilts_at), with its roof.
		if ground < SEA - 4.5 or ground > SEA + 1.5 or settled(centre) < 0.6 or cell_hash(int(corner.x) + 13, int(corner.y) + 13) < 0.45:
			return -INF
		var air := climate(centre)
		return SEA + 2.5 + 3.0 * floorf(1.0 + 1.9 * cell_hash(int(corner.x) + 7, int(corner.y) + 7)) + 1.0 + 7.0 if air.x > 0.5 and air.y > 0.5 else -INF
	var kind := town_kind(centre, ground)
	if cell_hash(int(corner.x) + 13, int(corner.y) + 13) < (0.1 if kind == 0 else 0.2 if kind == 1 or kind == 4 else 0.32):
		return -INF
	if absf(height(centre + Vector2(LOT / 2.0, 0)) - height(centre - Vector2(LOT / 2.0, 0))) + absf(height(centre + Vector2(0, LOT / 2.0)) - height(centre - Vector2(0, LOT / 2.0))) > 9.0:
		return -INF
	var own := cell_hash(int(corner.x) + 7, int(corner.y) + 7)
	if kind == 0:
		return ground + 3.0 * floorf(4.0 + 11.0 * own * own * own + 5.0 * share * cell_hash(int(corner.x) + 17, int(corner.y) + 17)) + 1.0
	return ground + 3.0 * floorf(2.0 + 1.9 * own if kind == 3 or kind == 7 else 3.0 + 2.9 * own) + 1.0 + 10.0


const MARK_PLOT := 260.0 # a plot of the world has one landmark at most
enum { LIGHTHOUSE, WINDMILL, TOWER, ARCH, MUSHROOMS, STONES, CRYSTALS, GATE, FLOATING }
static var marks := {} # plot -> its landmark, found once


## How settled a place is (terrain.gdshaderinc's): a town over 0.58, its fields from 0.5.
static func settled(p: Vector2) -> float:
	return fbm(p / 760.0 + Vector2(400.0, 109.0), 2)


## The landmark of a plot of the world, by what its place is: [where, the height of its foot,
## its kind, the kind of its town, how far it rises, how wide it is, a number of its own]; empty
## where the plot has none. Most plots have none; in a realm of wonders (a slow field of 53
## thousand units over 0.72, a tenth of the world) mushrooms, crystals and floating islands are
## six times as frequent. landmarks.gd builds them.
static func landmark(plot: Vector2i) -> Array:
	if marks.has(plot):
		return marks[plot]
	if marks.size() > 600:
		marks.clear()
	var found: Array = []
	var own := cell_hash(plot.x + 71, plot.y + 37)
	var chance := cell_hash(plot.x + 15, plot.y + 83)
	var p := (Vector2(plot) + Vector2(0.2, 0.2) + Vector2(cell_hash(plot.x + 5, plot.y + 90), cell_hash(plot.x + 60, plot.y + 12)) * 0.6) * MARK_PLOT
	var ground := height(p)
	var wonder := 1.0 + 5.0 * smoothstep(0.72, 0.82, slow(p, 53000.0, 0.9, Vector2(65.0, 80.0)))
	if ground < SEA:
		if chance < 0.04 * wonder:
			found = [p, SEA + 215.0 + 60.0 * own, FLOATING, 0, 0.0, 0.0, own]
	else:
		var air := climate(p)
		var share := town(p, ground)
		var people := settled(p)
		var around := [height(p + Vector2(50, 0)), height(p - Vector2(50, 0)), height(p + Vector2(0, 50)), height(p - Vector2(0, 50))]
		var level: bool = absf(around[0] - around[1]) + absf(around[2] - around[3]) < 22.0
		if share > 0.5:
			if chance < 0.8:
				p = (p / LOT).floor() * LOT + Vector2(LOT, LOT) / 2.0
				ground = height(p)
				var kind := town_kind(p, ground)
				found = [p, ground, TOWER, kind, [82.0, 34.0, 33.0, 29.0, 38.0, 0.0, 23.0, 19.0][kind], 8.0, own]
		elif level and ground > SEA + 2.0 and ground < SEA + 10.0 and around.min() < SEA - 1.0:
			if chance < 0.75:
				found = [p, ground, LIGHTHOUSE, 0, 31.0, 5.0, own]
		elif level and people > 0.5 and people < 0.58 and ground < SEA + 46.0:
			if chance < 0.7:
				found = [p, ground, WINDMILL, 0, 27.0, 12.0, own]
		elif level and air.x > 0.57 and air.y < 0.47:
			if chance < 0.4:
				found = [p, ground, ARCH, 0, 1.05 * (18.0 + 22.0 * own), 20.0 + 24.0 * own, own]
		elif air.y > 0.6 and ground < SEA + 8.0 and people < 0.5:
			if chance < 0.45 * wonder:
				found = [p, ground, MUSHROOMS, 0, 34.0, 18.0, own]
		elif level and air.x < 0.42 and ground < SEA + 70.0 and chance < 0.3:
			found = [p, ground, STONES, 0, 9.0, 13.0, own]
		elif ground > SEA + 60.0 and ground < SEA + 140.0 and chance < 0.25 * wonder:
			found = [p, ground, CRYSTALS, 0, 28.0, 13.0, own]
		elif chance < 0.05 * wonder:
			found = [p, maxf(ground + 190.0, SEA + 230.0) + 40.0 * own, FLOATING, 0, 0.0, 0.0, own]
		elif level and chance < 0.14 and ground < SEA + 50.0:
			found = [p, ground, GATE, 0, 12.0, 7.0, own]
	marks[plot] = found
	return found


## What a flight looks ahead for: the surface, the roof of the building whose lot the place is
## in, or the top of the landmark that stands there.
static func roof(p: Vector2) -> float:
	var top := maxf(surface(p), building_top((p / LOT).floor() * LOT))
	var mark := landmark(Vector2i((p / MARK_PLOT).floor()))
	if not mark.is_empty() and mark[2] != FLOATING and p.distance_to(mark[0]) < mark[5] + 4.0:
		top = maxf(top, mark[1] + mark[4])
	return top
