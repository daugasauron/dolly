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


static func height(p: Vector2) -> float:
	var land := smoothstep(0.36, 0.52, fbm(p / 520.0, 3))
	var hills := fbm(p / 130.0 + Vector2(17.0, 5.0), 4)
	var ranges := smoothstep(0.36, 0.58, fbm(p / 640.0 + Vector2(80.0, 31.0), 2))
	var q := p / 260.0 + Vector2(40.0, 12.0)
	var crest := ridge(q)
	var spur := ridge(q * 2.3 + Vector2(9.0, 77.0)) * crest
	var peaks := crest * 0.6 + spur * 0.3 + ridge(q * 5.1 + Vector2(3.0, 41.0)) * spur * 0.16
	return SEA - 13.0 + land * 16.0 + hills * 22.0 * (0.35 + land) + peaks * 125.0 * land * ranges


## The surface a flight stays above: the ground or the sea.
static func surface(p: Vector2) -> float:
	return maxf(height(p), SEA)


const LOT := 16.0


## terrain.gdshaderinc's town_at.
static func town(p: Vector2, ground: float) -> float:
	return smoothstep(0.58, 0.66, fbm(p / 760.0 + Vector2(400.0, 109.0), 2)) * smoothstep(SEA + 2.5, SEA + 6.0, ground) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, ground))


## What a flight looks ahead for: the surface, or the roof of the building whose lot the place
## is in (city.gdshader's).
static func roof(p: Vector2) -> float:
	var corner := (p / LOT).floor() * LOT
	var centre := corner + Vector2(LOT, LOT) / 2.0
	var ground := height(centre)
	var share := town(centre, ground)
	if share <= 0.05 or cell_hash(int(corner.x) + 13, int(corner.y) + 13) < 0.22:
		return surface(p)
	var lot := cell_hash(int(corner.x) + 7, int(corner.y) + 7)
	return maxf(surface(p), ground + (3.0 + 34.0 * lot * lot * lot + 8.0 * share) * smoothstep(0.05, 0.6, share))
