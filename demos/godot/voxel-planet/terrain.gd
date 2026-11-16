extends RefCounted
## terrain.gdshaderinc's world, computed here for the flight: the same chart, hash, noise and heights.

const SEA := 24.0
const CLOUD_HEIGHT := 520.0
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


const RADIUS := 600000.0 # the planet's
## The chart's anchor on the planet: the chart's x, up and z there, in the planet's axes.
static var anchor := Basis.IDENTITY


## terrain.gdshaderinc's chart_dir: the direction of a chart's place from the planet's middle,
## in the anchor's axes.
static func chart_dir(p: Vector2) -> Vector3:
	var far := p.length()
	var angle := minf(far / RADIUS, 3.138)
	var scale := sin(angle) / far if far > 1.0 else 1.0 / RADIUS
	return Vector3(p.x * scale, cos(angle), p.y * scale)


## terrain.gdshaderinc's chart_frame: the chart's x, up and z at a place, in the anchor's axes.
static func chart_frame(p: Vector2) -> Basis:
	var far := p.length()
	if far < 1.0:
		return Basis.IDENTITY
	var out_of := p / far
	var angle := minf(far / RADIUS, 3.138)
	var outward := Vector3(out_of.x * cos(angle), -sin(angle), out_of.y * cos(angle))
	var across := Vector3(-out_of.y, 0.0, out_of.x)
	return Basis(out_of.x * outward - out_of.y * across, Vector3(out_of.x * sin(angle), cos(angle), out_of.y * sin(angle)), out_of.y * outward + out_of.x * across)


## The point of the planet a chart's place is, in the planet's axes.
static func planet_at(p: Vector2) -> Vector3:
	return anchor * chart_dir(p) * RADIUS


static func cell_hash3(x: int, y: int, z: int) -> float:
	var n := ((((x & MASK) * 1597334673) & MASK) ^ (((y & MASK) * 3812015801) & MASK) ^ (((z & MASK) * 2798796415) & MASK))
	n = (n * 1597334673) & MASK
	n ^= n >> 15
	n = (n * 2246822519) & MASK
	n ^= n >> 13
	return float(n >> 8) / 16777216.0


const SPREAD := 1.16


static func noise3(p: Vector3) -> float:
	var i := p.floor()
	var f := p - i
	var ux := f.x * f.x * f.x * (f.x * (f.x * 6.0 - 15.0) + 10.0)
	var uy := f.y * f.y * f.y * (f.y * (f.y * 6.0 - 15.0) + 10.0)
	var uz := f.z * f.z * f.z * (f.z * (f.z * 6.0 - 15.0) + 10.0)
	var x := int(i.x)
	var y := int(i.y)
	var z := int(i.z)
	var low := lerpf(lerpf(cell_hash3(x, y, z), cell_hash3(x + 1, y, z), ux), lerpf(cell_hash3(x, y + 1, z), cell_hash3(x + 1, y + 1, z), ux), uy)
	var high := lerpf(lerpf(cell_hash3(x, y, z + 1), cell_hash3(x + 1, y, z + 1), ux), lerpf(cell_hash3(x, y + 1, z + 1), cell_hash3(x + 1, y + 1, z + 1), ux), uy)
	return 0.5 + (lerpf(low, high, uz) - 0.5) * SPREAD


static func fbm3(p: Vector3, octaves: int) -> float:
	var sum := 0.0
	var weight := 0.5
	var total := 0.0
	for octave in octaves:
		sum += noise3(p) * weight
		total += weight
		p = Vector3(0.8 * p.y + 0.6 * p.z, -0.8 * p.x + 0.36 * p.y - 0.48 * p.z, -0.6 * p.x - 0.48 * p.y + 0.64 * p.z) * 2.02 + Vector3(3.1, 1.7, 5.3)
		weight *= 0.5
	return sum / total


static func ridge3(p: Vector3) -> float:
	var n := 1.0 - absf(noise3(p) * 2.0 - 1.0)
	return n * n


## terrain.gdshaderinc's slow field.
static func slow3(planet: Vector3, size: float, place: Vector3) -> float:
	return fbm3(planet / size + place, 2)


## The slow fields a height is made with, x: the seas' shift, y: the relief, z: the massif. They
## change little over a hundred units, so the heights around a place share them.
static var slow_place := Vector3(INF, INF, INF)
static var slow_fields := Vector3.ZERO


static func slow_here(planet: Vector3) -> Vector3:
	if planet.distance_squared_to(slow_place) > 2500.0:
		slow_place = planet
		var continent := fbm3(planet / 210000.0 + Vector3(5.0, 71.0, 23.0), 3)
		var belt := 1.0 - smoothstep(0.015, 0.06, absf(fbm3(planet / 140000.0 + Vector3(91.0, 17.0, 44.0), 2) - 0.5))
		slow_fields = Vector3((slow3(planet, 7300.0, Vector3(34.0, 62.0, 15.0)) - 0.5) * 0.9 + (slow3(planet, 2700.0, Vector3(104.0, 42.0, 77.0)) - 0.5) * 0.5 + (smoothstep(0.4, 0.6, continent) - 0.5) * 0.8,
			lerpf(0.22, 1.0, smoothstep(0.3, 0.5, slow3(planet, 1900.0, Vector3(38.0, 77.0, 53.0)))),
			smoothstep(0.81, 0.9, slow3(planet, 19000.0, Vector3(8.0, 97.0, 31.0)) + 0.17 * belt))
	return slow_fields


## terrain.gdshaderinc's terrain_on: the ground's height at a point of the planet.
static func height_on(planet: Vector3) -> float:
	var fields := slow_here(planet)
	var massif := fields.z
	var land := smoothstep(0.36, 0.52, fbm3(planet / 520.0 + Vector3(0.0, 13.0, 29.0), 3) + fields.x)
	var hills := fbm3(planet / 130.0 + Vector3(17.0, 5.0, 43.0), 4)
	var ranges := smoothstep(0.56, 0.73, fbm3(planet / 640.0 + Vector3(80.0, 31.0, 7.0), 2) + 0.3 * massif)
	var q := planet / 260.0 + Vector3(40.0, 12.0, 67.0)
	var crest := ridge3(q)
	var spur := ridge3(q * 2.3 + Vector3(9.0, 77.0, 21.0)) * crest
	var peaks := crest * 0.6 + spur * 0.3 + ridge3(q * 5.1 + Vector3(3.0, 41.0, 58.0)) * spur * 0.16
	var high := SEA - 13.0 - 24.0 * smoothstep(-0.05, -0.3, fields.x) + land * (16.0 + 45.0 * massif) + hills * 20.0 * (0.35 + land) + peaks * 125.0 * land * ranges * (fields.y + 1.5 * massif)
	if high < SEA - 2.5 or high > SEA + 90.0:
		return high
	var gate := 1.0 - smoothstep(SEA + 45.0, SEA + 90.0, high)
	var bend := planet / 310.0
	var w := planet / 900.0 + 0.35 * Vector3(noise3(bend + Vector3(7.0, 3.0, 11.0)), noise3(bend + Vector3(51.0, 23.0, 5.0)), noise3(bend + Vector3(19.0, 88.0, 61.0)))
	var lake := 0.05 * smoothstep(0.6, 0.72, noise3(planet / 1300.0 + Vector3(61.0, 9.0, 33.0)))
	var valley := smoothstep((0.012 + lake) * gate, 0.1 + lake, absf(noise3(w + Vector3(140.0, 77.0, 9.0)) - 0.5))
	return lerpf(high, SEA - 2.5 + (high - SEA + 2.5) * valley, gate)


## The ground's height at a chart's place.
static func height(p: Vector2) -> float:
	return height_on(planet_at(p))


## terrain.gdshaderinc's cloud_depth, where the weather has moved that far.
static func cloud_depth(p: Vector2, drift: Vector3) -> float:
	return fbm3((planet_at(p) + drift) / 1000.0 + Vector3(31.0, 7.0, 59.0), 3) + weather(p, drift)


## terrain.gdshaderinc's weather_on at a chart's place: the weather of its region.
static func weather(p: Vector2, drift: Vector3) -> float:
	var q := (planet_at(p) + drift) / 90000.0 + Vector3(4.0, 27.0, 13.0)
	q += 0.7 * Vector3(noise3(q * 0.6 + Vector3(11.0, 0.0, 5.0)), noise3(q * 0.6 + Vector3(37.0, 9.0, 0.0)), noise3(q * 0.6 + Vector3(0.0, 71.0, 3.0)))
	return (fbm3(q, 3) - 0.5) * 0.55


## The surface a flight stays above: the ground or the sea.
static func surface(p: Vector2) -> float:
	return maxf(height(p), SEA)


const LOT := 16.0


## terrain.gdshaderinc's town_at.
static func town(p: Vector2, ground: float) -> float:
	return smoothstep(0.58, 0.66, settled(p)) * smoothstep(SEA + 4.5, SEA + 8.0, ground) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, ground))


## terrain.gdshaderinc's climate. x: warmth, y: moisture.
static func climate(p: Vector2) -> Vector2:
	var planet := planet_at(p)
	var polar := smoothstep(0.7, 0.98, absf(planet.y) / RADIUS)
	return Vector2(fbm3(planet / 900.0 + Vector3(211.0, 57.0, 3.0), 2) + (slow3(planet, 19000.0, Vector3(37.0, 14.0, 82.0)) - 0.5) * 0.55 + (fbm3(planet / 260000.0 + Vector3(13.0, 49.0, 7.0), 2) - 0.5) * 0.3 - 0.55 * polar,
		fbm3(planet / 560.0 + Vector3(13.0, 143.0, 71.0), 2) + (slow3(planet, 11000.0, Vector3(89.0, 44.0, 26.0)) - 0.5) * 0.45 + (fbm3(planet / 190000.0 + Vector3(67.0, 3.0, 39.0), 2) - 0.5) * 0.4)


## terrain.gdshaderinc's town_kind.
static func town_kind(p: Vector2, ground: float) -> int:
	var air := climate(p)
	if air.x > 0.57 and air.y < 0.47:
		return 2
	if air.x < 0.42:
		return 3
	var culture := slow3(planet_at(p), 5100.0, Vector3(3.0, 8.0, 47.0))
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
		# Three towers in ten end in a point (city.gdshader's roof_rise): as high as half of
		# its narrower side, times 0.7 to 2.1.
		var point := 0.0
		if cell_hash(int(corner.x) + 33, int(corner.y) + 33) < 0.3:
			point = (0.7 + 1.4 * cell_hash(int(corner.x) + 35, int(corner.y) + 35)) * 0.5 * LOT * (0.5 + 0.3 * minf(cell_hash(int(corner.x) + 11, int(corner.y) + 11), cell_hash(int(corner.x) + 19, int(corner.y) + 19)))
		return ground + 3.0 * floorf(4.0 + 11.0 * own * own * own + 5.0 * share * cell_hash(int(corner.x) + 17, int(corner.y) + 17)) + 1.0 + point
	return ground + 3.0 * floorf(2.0 + 1.9 * own if kind == 3 or kind == 7 else 3.0 + 2.9 * own) + 1.0 + 10.0


const MARK_PLOT := 260.0 # a plot of the world has one landmark at most
enum { LIGHTHOUSE, WINDMILL, TOWER, ARCH, MUSHROOMS, STONES, CRYSTALS, GATE, FLOATING, WRECK, KEEP, MOUND, OLD_TREE, CONE }
static var marks := {} # plot -> its landmark, found once


## How settled a place is (terrain.gdshaderinc's): a town over 0.58, its fields from 0.5.
static func settled(p: Vector2) -> float:
	var planet := planet_at(p)
	return fbm3(planet / 760.0 + Vector3(400.0, 109.0, 55.0), 2) + (fbm3(planet / 6100.0 + Vector3(71.0, 220.0, 12.0), 2) - 0.5) * 0.2


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
	var wonder := 1.0 + 5.0 * smoothstep(0.72, 0.82, slow3(planet_at(p), 53000.0, Vector3(10.0, 28.0, 66.0)))
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
		elif ground < SEA + 2.2 and people < 0.5 and chance > 0.72:
			found = [p, ground, WRECK, 0, 15.0, 8.0, own]
		elif level and people > 0.5 and people < 0.58 and ground < SEA + 46.0:
			if chance < 0.7:
				found = [p, ground, WINDMILL, 0, 27.0, 12.0, own]
		elif level and air.x > 0.5 and air.y < 0.52 and people < 0.45 and ground > SEA + 6.0 and ground < SEA + 40.0 and chance > 0.93:
			found = [p, ground, CONE, 0, 46.0, 58.0, own]
		elif level and air.x > 0.57 and air.y < 0.47:
			if chance < 0.4:
				found = [p, ground, ARCH, 0, 1.05 * (18.0 + 22.0 * own), 20.0 + 24.0 * own, own]
		elif air.y > 0.6 and ground < SEA + 8.0 and people < 0.5:
			if chance < 0.45 * wonder:
				found = [p, ground, MUSHROOMS, 0, 34.0, 18.0, own]
		elif level and air.x < 0.42 and ground < SEA + 70.0 and chance < 0.3:
			found = [p, ground, STONES, 0, 9.0, 13.0, own]
		elif level and ground > SEA + 22.0 and ground < SEA + 60.0 and people < 0.56 and chance > 0.8:
			found = [p, ground, KEEP, 0, 19.0, 12.0, own]
		elif level and air.x > 0.6 and air.y >= 0.57 and people < 0.5 and ground < SEA + 30.0 and chance > 0.78:
			found = [p, ground, MOUND, 0, 27.0, 18.0, own]
		elif level and air.x > 0.42 and air.x <= 0.6 and air.y > 0.52 and people < 0.5 and ground < SEA + 40.0 and chance > 0.86:
			found = [p, ground, OLD_TREE, 0, 50.0, 14.0, own]
		elif ground > SEA + 60.0 and ground < SEA + 140.0 and chance < 0.25 * wonder:
			found = [p, ground, CRYSTALS, 0, 28.0, 13.0, own]
		elif chance < 0.05 * wonder:
			found = [p, maxf(ground + 190.0, SEA + 230.0) + 40.0 * own, FLOATING, 0, 0.0, 0.0, own]
		elif level and chance < 0.14 and ground < SEA + 50.0:
			found = [p, ground, GATE, 0, 12.0, 7.0, own]
	marks[plot] = found
	return found


## The island that floats over a place: Vector2(its underside, its top with its trees), or
## Vector2.ZERO where none does. landmarks.gd's island is as wide as twice 30 to 70 units.
static func island(p: Vector2) -> Vector2:
	var mark := landmark(Vector2i((p / MARK_PLOT).floor()))
	if mark.is_empty() or mark[2] != FLOATING:
		return Vector2.ZERO
	var across: float = 30.0 + 40.0 * mark[6]
	if p.distance_to(mark[0]) > across + 8.0:
		return Vector2.ZERO
	return Vector2(mark[1] - 0.85 * across - 4.0, mark[1] + 18.0)


## What a flight looks ahead for: the surface, the roof of the building whose lot the place is
## in, or the top of the landmark that stands there.
static func roof(p: Vector2) -> float:
	var top := maxf(surface(p), building_top((p / LOT).floor() * LOT))
	var mark := landmark(Vector2i((p / MARK_PLOT).floor()))
	if not mark.is_empty() and mark[2] != FLOATING and p.distance_to(mark[0]) < mark[5] + 4.0:
		top = maxf(top, mark[1] + mark[4])
	return top
