// The world as a function of the place on a planet: ground.gdshader draws it for the shaders,
// and terrain.gd, which flies over it, computes the same heights. The hash is integer
// arithmetic, so both agree.
//
// The game computes in a flat chart: x and z are distances along the ground from the chart's
// anchor, a point of the planet. The slow fields of the world (heights, climate, towns, clouds)
// are evaluated at the point of the sphere a chart's place is (planet_at), in three dimensions,
// so they are the same from every chart and have no seam. What stands on a lattice (plots, lots,
// fields) keeps the chart's two. Every vertex stage carries its chart place onto the sphere,
// relative to the flyer (lift).
const float SEA = 24.0;
const float CLOUD_HEIGHT = 520.0;
const float LOT = 16.0; // a building's lot
const float HEIGHT_KEPT = 110.0; // the height the ground's textures keep as zero
const float RADIUS = 600000.0; // the planet's, at the height the chart calls zero

// What main.gd tells every shader each frame.
uniform float clock = 0.0; // seconds flown
uniform float night = 0.0;
// The season, as three shares between 0 and 1 that rise and fall through the year.
uniform float spring = 0.0;
uniform float autumn = 0.0;
uniform float winter = 0.0;
uniform vec3 to_light = vec3(0.0, 1.0, 0.0); // toward the sun, or the moon once it has set
uniform float handover = 1.0; // 0 at the moment the sun hands over to the moon, 1 away from it: what the light's side lights fades through it
// The lit beacons around the flyer: where each stands (xy), how long ago its ring set off (z),
// how long ago it was lit (z), and how strong its rings are (w), which is less the further it
// is from the flyer.
uniform vec4 pulses[8];
// The chart on the planet, and the flyer in it.
uniform mat3 anchor_frame = mat3(1.0); // the chart's x, up and z at its anchor, in the planet's axes
uniform mat3 flyer_frame = mat3(1.0); // from the anchor's axes to the flyer's, whose up is Godot's
uniform vec3 flyer_dir = vec3(0.0, 1.0, 0.0); // toward the ground under the flyer, in the anchor's axes
uniform vec2 flyer_over; // the flyer's place in the chart
uniform float lowered = 0.0; // the height taken off everything drawn, once the flyer is high
uniform float altitude = 0.0; // the flyer's
uniform vec3 drift; // how far the weather has moved through the planet's axes
uniform vec3 eye; // where the camera is, in the chart: x, its height, z
const float AIR = 7000.0; // the height over which the air thins to 1/e

// The direction of a chart's place from the planet's middle, in the anchor's axes: as far
// round the sphere from the anchor as the place is from the chart's origin.
vec3 chart_dir(vec2 q) {
	float far = length(q);
	float angle = min(far / RADIUS, 3.138);
	float scale = far > 1.0 ? sin(angle) / far : 1.0 / RADIUS;
	return vec3(q.x * scale, cos(angle), q.y * scale);
}

// The chart's x, up and z at a place, in the anchor's axes.
mat3 chart_frame(vec2 q) {
	float far = length(q);
	if (far < 1.0) {
		return mat3(1.0);
	}
	vec2 out_of = q / far;
	float angle = min(far / RADIUS, 3.138);
	vec3 outward = vec3(out_of.x * cos(angle), -sin(angle), out_of.y * cos(angle));
	vec3 across = vec3(-out_of.y, 0.0, out_of.x);
	return mat3(out_of.x * outward - out_of.y * across, vec3(out_of.x * sin(angle), cos(angle), out_of.y * sin(angle)), out_of.y * outward + out_of.x * across);
}

// The point of the planet a chart's place is, in the planet's axes.
vec3 planet_at(vec2 q) {
	return anchor_frame * chart_dir(q) * RADIUS;
}

// Where a chart's place (x, its height, z) is drawn, with `lowered` taken off its height: on the
// sphere, seen from the flyer, whose own place stays where the chart has it. Near the flyer the
// ground falls away by the square of the distance, computed without the difference of two
// large numbers; far off the place is turned from the anchor's axes into the flyer's, where
// float32's steps of a few hundredths of a unit are nothing.
vec3 lift(vec3 at) {
	vec2 away = at.xz - flyer_over;
	float far = length(away);
	float beyond = smoothstep(1700.0, 2250.0, far);
	float high = at.y;
	vec3 near_by = vec3(0.0);
	vec3 far_off = vec3(0.0);
	if (beyond < 1.0) {
		float angle = far / RADIUS;
		float half_sine = sin(angle * 0.5);
		float wider = (far > 1.0 ? sin(angle) / angle : 1.0) * (1.0 + high / RADIUS);
		near_by = vec3(flyer_over.x + away.x * wider, high - lowered - 2.0 * (RADIUS + high) * half_sine * half_sine, flyer_over.y + away.y * wider);
	}
	if (beyond > 0.0) {
		vec3 dir = chart_dir(at.xz);
		vec3 from_flyer = flyer_frame * (RADIUS * (dir - flyer_dir) + high * dir);
		far_off = vec3(flyer_over.x + from_flyer.x, from_flyer.y - lowered, flyer_over.y + from_flyer.z);
	}
	return mix(near_by, far_off, beyond);
}

// A direction of the chart at a place (a normal, an up), as it is drawn.
vec3 lift_way(vec2 q, vec3 way) {
	return flyer_frame * (chart_frame(q) * way);
}

float hash(vec2 cell) {
	uvec2 p = uvec2(ivec2(cell)) * uvec2(1597334673u, 3812015801u);
	uint n = (p.x ^ p.y) * 1597334673u;
	n ^= n >> 15u;
	n *= 2246822519u;
	n ^= n >> 13u;
	return float(n >> 8u) * (1.0 / 16777216.0);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = p - i;
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// A fractal sum between 0 and 1, each octave turned so the lattice does not show.
float fbm(vec2 p, int octaves) {
	float sum = 0.0;
	float weight = 0.5;
	float total = 0.0;
	for (int octave = 0; octave < octaves; octave++) {
		sum += noise(p) * weight;
		total += weight;
		p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.02 + vec2(3.1, 1.7);
		weight *= 0.5;
	}
	return sum / total;
}

// The same sum for a pixel that covers `wide` of p's units: an octave finer than the pixel would
// shimmer as the flight moves it, so it gives its mean, a half, by degrees.
float fbm_seen(vec2 p, int octaves, float wide) {
	float sum = 0.0;
	float weight = 0.5;
	float total = 0.0;
	for (int octave = 0; octave < octaves; octave++) {
		float seen = 1.0 - smoothstep(0.2, 0.55, wide);
		sum += mix(0.5, noise(p), seen) * weight;
		total += weight;
		p = vec2(0.8 * p.x - 0.6 * p.y, 0.6 * p.x + 0.8 * p.y) * 2.02 + vec2(3.1, 1.7);
		wide *= 2.02;
		weight *= 0.5;
	}
	return sum / total;
}

float hash3(vec3 cell) {
	uvec3 p = uvec3(ivec3(cell)) * uvec3(1597334673u, 3812015801u, 2798796415u);
	uint n = (p.x ^ p.y ^ p.z) * 1597334673u;
	n ^= n >> 15u;
	n *= 2246822519u;
	n ^= n >> 13u;
	return float(n >> 8u) * (1.0 / 16777216.0);
}

// Noise in three dimensions, for a field on the sphere. A cut through it varies less than the
// flat noise does (eight corners are blended for four), so it is spread about its middle by
// SPREAD to have the flat noise's deviation: the world's thresholds were set on that.
const float SPREAD = 1.16;

float noise3(vec3 p) {
	vec3 i = floor(p);
	vec3 f = p - i;
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float low = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
	float high = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
	return 0.5 + (mix(low, high, u.z) - 0.5) * SPREAD;
}

float fbm3(vec3 p, int octaves) {
	float sum = 0.0;
	float weight = 0.5;
	float total = 0.0;
	for (int octave = 0; octave < octaves; octave++) {
		sum += noise3(p) * weight;
		total += weight;
		p = vec3(0.8 * p.y + 0.6 * p.z, -0.8 * p.x + 0.36 * p.y - 0.48 * p.z, -0.6 * p.x - 0.48 * p.y + 0.64 * p.z) * 2.02 + vec3(3.1, 1.7, 5.3);
		weight *= 0.5;
	}
	return sum / total;
}

float ridge3(vec3 p) {
	float n = 1.0 - abs(noise3(p) * 2.0 - 1.0);
	return n * n;
}

// How much of a noise is seen where it is read every `wide` of its cells: all of it up to
// half a cell, none of it from a cell and a half. What is not seen is its mean: a ground read
// coarsely (a far grid's, the whole planet's) is the mean of the finer ground, and neither
// sparkles nor changes when the points it is read at move.
float seen_share(float wide) {
	return 1.0 - smoothstep(0.5, 1.5, wide);
}

float fbm3_seen(vec3 p, int octaves, float wide) {
	float sum = 0.0;
	float weight = 0.5;
	float total = 0.0;
	for (int octave = 0; octave < octaves; octave++) {
		float share = seen_share(wide);
		sum += (share > 0.0 ? mix(0.5, noise3(p), share) : 0.5) * weight;
		total += weight;
		p = vec3(0.8 * p.y + 0.6 * p.z, -0.8 * p.x + 0.36 * p.y - 0.48 * p.z, -0.6 * p.x - 0.48 * p.y + 0.64 * p.z) * 2.02 + vec3(3.1, 1.7, 5.3);
		wide *= 2.02;
		weight *= 0.5;
	}
	return sum / total;
}

float ridge3_seen(vec3 p, float wide) {
	float share = seen_share(wide);
	return share > 0.0 ? mix(0.4, ridge3(p), share) : 0.4;
}

// A slow field of the world: two octaves of noise at a size of its own, placed by itself. The
// fields' sizes have no common measure (1.9, 2.7, 7.3, 11, 19 and 53 thousand units, and
// those of the planet's own: 140 to 260 thousand), so their combinations do not come round
// again. Half of a field is under 0.5, a tenth over 0.73, a twentieth over 0.78, a hundredth
// over 0.86: what is rare is a threshold on one.
float slow3(vec3 planet, float size, vec3 place) {
	return fbm3(planet / size + place, 2);
}

float slow3_seen(vec3 planet, float size, vec3 place, float wide) {
	return fbm3_seen(planet / size + place, 2, wide / size);
}

// The planet's own fields, seen from orbit: x its continents and oceans (210 thousand units),
// y its belts of mountains (140 thousand, a contour of a noise, so they are chains).
vec2 planet_fields(vec3 planet) {
	float chain = abs(fbm3(planet / 140000.0 + vec3(91.0, 17.0, 44.0), 2) - 0.5);
	return vec2(fbm3(planet / 210000.0 + vec3(5.0, 71.0, 23.0), 3), 1.0 - smoothstep(0.015, 0.06, chain));
}

// How much of a massif a place is: a country of high mountains, rare (a fiftieth of the land
// is over 140 units there), 19 thousand units a field; less rare along the planet's belts.
float massif_on(vec3 planet, float belt) {
	return smoothstep(0.81, 0.9, slow3(planet, 19000.0, vec3(8.0, 97.0, 31.0)) + 0.17 * belt);
}

// How much of a realm of wonders a place is: a rare kind of world, 53 thousand units a field,
// where most groves glow at night, the ground's veins are bright, the surf is alight and
// mushrooms, crystals and floating islands are many.
float realm_on(vec3 planet) {
	return smoothstep(0.72, 0.82, slow3(planet, 53000.0, vec3(10.0, 28.0, 66.0)));
}

// How far from a river's middle a place is, as a share of a noise whose contour the river
// follows: a river is under 0.012 of it and its valley under 0.1. The contour meanders with a
// second noise.
float river_on(vec3 planet) {
	vec3 bend = planet / 310.0;
	vec3 q = planet / 900.0 + 0.35 * vec3(noise3(bend + vec3(7.0, 3.0, 11.0)), noise3(bend + vec3(51.0, 23.0, 5.0)), noise3(bend + vec3(19.0, 88.0, 61.0)));
	return abs(noise3(q + vec3(140.0, 77.0, 9.0)) - 0.5);
}

// The ground's height. Seas and continents come at four sizes: the planet's continents and
// oceans (inside a continent most is land, in an ocean little), seas and lands of 7.3 thousand units in them, lands of 2.7 thousand in those, and the
// coasts, bays and islands of 520; in an ocean only the highest of the last stand out, as
// islands. On the land, hills, and ranges of mountains whose spurs stand on their crests and
// whose gullies on their spurs; the relief of a region (1.9 thousand units) makes its ranges
// low or high, and in a massif they are more than twice as high on a raised base. Rivers at the
// sea's level run in valleys through the low land, widen into lakes in some stretches, and
// narrow to their springs in the hills. terrain.gd computes the same.
// The ground is read every `wide` units (a grid's cell, the planet's texel; 0 for the ground itself).
float terrain_on(vec3 planet, float wide) {
	vec2 globe = planet_fields(planet);
	float shift = (slow3_seen(planet, 7300.0, vec3(34.0, 62.0, 15.0), wide) - 0.5) * 0.9 + (slow3_seen(planet, 2700.0, vec3(104.0, 42.0, 77.0), wide) - 0.5) * 0.5 + (smoothstep(0.4, 0.6, globe.x) - 0.5) * 0.8;
	float relief = mix(0.22, 1.0, smoothstep(0.3, 0.5, slow3_seen(planet, 1900.0, vec3(38.0, 77.0, 53.0), wide)));
	float massif = massif_on(planet, globe.y);
	float land = smoothstep(0.36, 0.52, fbm3_seen(planet / 520.0 + vec3(0.0, 13.0, 29.0), 3, wide / 520.0) + shift);
	float hills = fbm3_seen(planet / 130.0 + vec3(17.0, 5.0, 43.0), 4, wide / 130.0);
	float ranges = smoothstep(0.56, 0.73, fbm3_seen(planet / 640.0 + vec3(80.0, 31.0, 7.0), 2, wide / 640.0) + 0.3 * massif);
	vec3 q = planet / 260.0 + vec3(40.0, 12.0, 67.0);
	float crest = ridge3_seen(q, wide / 260.0);
	float spur = ridge3_seen(q * 2.3 + vec3(9.0, 77.0, 21.0), wide / 113.0) * crest;
	float peaks = crest * 0.6 + spur * 0.3 + ridge3_seen(q * 5.1 + vec3(3.0, 41.0, 58.0), wide / 51.0) * spur * 0.16;
	float height = SEA - 13.0 - 24.0 * smoothstep(-0.05, -0.3, shift) + land * (16.0 + 45.0 * massif) + hills * 20.0 * (0.35 + land) + peaks * 125.0 * land * ranges * (relief + 1.5 * massif);
	// A river is some tens of units wide: a ground read more coarsely has none.
	float gate = (1.0 - smoothstep(SEA + 45.0, SEA + 90.0, height)) * step(SEA - 2.5, height) * (1.0 - smoothstep(30.0, 150.0, wide));
	if (gate > 0.0) {
		float lake = 0.05 * smoothstep(0.6, 0.72, noise3(planet / 1300.0 + vec3(61.0, 9.0, 33.0)));
		float valley = smoothstep((0.012 + lake) * gate, 0.1 + lake, river_on(planet));
		height = mix(height, SEA - 2.5 + (height - SEA + 2.5) * valley, gate);
	}
	return height;
}

// x: warmth, y: moisture, both between 0 and 1 away from the poles. Each has its region of 19
// and of 11 thousand units and its part of the planet: cold countries and hot ones, wet ones
// and dry, deserts and forests seen from orbit, and the cold of the poles.
vec2 climate_on(vec3 planet, float wide) {
	float polar = smoothstep(0.7, 0.98, abs(planet.y) / RADIUS);
	return vec2(fbm3_seen(planet / 900.0 + vec3(211.0, 57.0, 3.0), 2, wide / 900.0) + (slow3(planet, 19000.0, vec3(37.0, 14.0, 82.0)) - 0.5) * 0.55 + (fbm3(planet / 260000.0 + vec3(13.0, 49.0, 7.0), 2) - 0.5) * 0.3 - 0.55 * polar,
		fbm3_seen(planet / 560.0 + vec3(13.0, 143.0, 71.0), 2, wide / 560.0) + (slow3(planet, 11000.0, vec3(89.0, 44.0, 26.0)) - 0.5) * 0.45 + (fbm3(planet / 190000.0 + vec3(67.0, 3.0, 39.0), 2) - 0.5) * 0.4);
}

// How settled a place is: over 0.58 a town stands, and around it, from 0.5, its fields lie.
// How settled a region is (6.1 thousand units): its towns are more and larger, and from orbit
// its lights are seen at night.
float peopled_on(vec3 planet) {
	return fbm3(planet / 6100.0 + vec3(71.0, 220.0, 12.0), 2);
}

float settled_on(vec3 planet) {
	return fbm3(planet / 760.0 + vec3(400.0, 109.0, 55.0), 2) + (peopled_on(planet) - 0.5) * 0.2;
}

// The culture of a region, a slow field of 5.1 thousand units: which kinds of towns it builds.
float culture_on(vec3 planet) {
	return slow3(planet, 5100.0, vec3(3.0, 8.0, 47.0));
}

// The same fields at a chart's place.
float terrain_height(vec2 p) {
	return terrain_on(planet_at(p), 0.0);
}

vec2 climate(vec2 p) {
	return climate_on(planet_at(p), 0.0);
}

float realm_at(vec2 p) {
	return realm_on(planet_at(p));
}

float settled(vec2 p) {
	return settled_on(planet_at(p));
}

float town_at(vec2 p, float height) {
	return smoothstep(0.58, 0.66, settled(p)) * smoothstep(SEA + 4.5, SEA + 8.0, height) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, height));
}

// How much of a place is farmed: the fields around a town, on its low land. Few trees stand
// in them.
float farmed_at(vec2 p, float height) {
	return smoothstep(0.49, 0.53, settled(p)) * smoothstep(SEA + 4.5, SEA + 8.0, height) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, height));
}

// Where no tree stands for a town: the town itself and a margin around it.
float town_near(vec2 p, float height) {
	return smoothstep(0.56, 0.575, settled(p)) * smoothstep(SEA + 2.5, SEA + 4.0, height) * (1.0 - smoothstep(SEA + 62.0, SEA + 70.0, height));
}

// Whether a lot is a stretch of road: every fifth line of lots one way and every sixth the
// other is an avenue, so a town is blocks of four lots by five.
bool road_lot(vec2 corner) {
	ivec2 lot = ivec2(floor(corner / LOT + 0.5));
	return (lot.x % 5 + 5) % 5 == 0 || (lot.y % 6 + 6) % 6 == 0;
}

// The kind of town a place has, by its climate, its ground and the culture of its region (a
// slow field of 5.1 thousand units): 0 a city of towers, 1 a town of gabled houses in timber
// frame under tiled roofs, 2 a desert town of mud-brick cubes and domes, 3 a village of dark
// timber under steep roofs of turf in the cold, 4 a town of white walls under wide tiled roofs
// with upturned eaves, 6 a whitewashed town with blue domes on a warm coast, 7 round thatched
// huts on the savanna. terrain.gd computes the same.
int town_kind(vec2 p, float height) {
	vec2 air = climate(p);
	if (air.x > 0.57 && air.y < 0.47) {
		return 2;
	}
	if (air.x < 0.42) {
		return 3;
	}
	float culture = culture_on(planet_at(p));
	if (culture > 0.6) {
		return 0;
	}
	if (air.x > 0.52 && air.y < 0.57) {
		return 7;
	}
	if (air.x > 0.5 && height < SEA + 13.0) {
		return 6;
	}
	return culture < 0.42 ? 4 : 1;
}

// Whether a stilt village stands at a place: off the shore of a settled coast in a warm wet
// land, where the water is shallow. Its houses stand on posts over the water (kind 5).
bool stilts_at(vec2 p, float height) {
	if (height < SEA - 4.5 || height > SEA + 1.5 || settled(p) < 0.6) {
		return false;
	}
	vec2 air = climate(p);
	return air.x > 0.5 && air.y > 0.5;
}

// How tall the walls of a lot's building are, where the town's share is that and its kind is
// that: none on a road, on a lot left open (one in ten in a city, more in a town or a village),
// or at a town's thin edge; a city's towers have 4 to 20 storeys of 3 units, taller toward its
// middle, a town's houses 3 to 5 and a village's 2 or 3. terrain.gd computes the same.
float building_height(vec2 corner, float town, int kind) {
	float open = kind == 0 ? 0.1 : (kind == 1 || kind == 4) ? 0.2 : 0.32;
	if (town < 0.1 || road_lot(corner) || hash(corner + 13.0) < open) {
		return 0.0;
	}
	float lot = hash(corner + 7.0);
	float storeys = kind == 0 ? floor(4.0 + 11.0 * lot * lot * lot + 5.0 * town * hash(corner + 17.0)) : (kind == 3 || kind == 7) ? floor(2.0 + 1.9 * lot) : floor(3.0 + 2.9 * lot);
	return 3.0 * storeys + 1.0;
}

// How deep the cloud layer is over a place: cloud shows from a half, and rain falls from 0.68.
// The layer covers the planet: its clouds of a thousand units drift through the weather of
// whole regions (90 thousand units), which makes the bands and clearings seen from orbit.
// The weather is swirled by a slower noise, so its fronts curl. Seen from so far that a pixel
// covers `wide` units, the clouds finer than that give their mean, and the weather remains.
float weather_on(vec3 planet) {
	vec3 q = planet / 90000.0 + vec3(4.0, 27.0, 13.0);
	q += 0.7 * vec3(noise3(q * 0.6 + vec3(11.0, 0.0, 5.0)), noise3(q * 0.6 + vec3(37.0, 9.0, 0.0)), noise3(q * 0.6 + vec3(0.0, 71.0, 3.0)));
	return (fbm3(q, 3) - 0.5) * 0.55;
}

// The weather at a chart's place: near the flyer it is the flyer's own, which main.gd tells (it
// changes little over some thousand units); far off it is computed.
uniform float weather_near = 0.0;

float weather_at(vec2 p) {
	float away = distance(p, flyer_over);
	if (away < 3000.0) {
		return weather_near;
	}
	return mix(weather_near, weather_on(planet_at(p) + drift), smoothstep(3000.0, 6000.0, away));
}

float cloud_depth_seen(vec2 p, int octaves, float wide) {
	return fbm3_seen((planet_at(p) + drift) / 1000.0 + vec3(31.0, 7.0, 59.0), octaves, wide / 1000.0) + weather_at(p);
}

float cloud_depth(vec2 p, int octaves) {
	return cloud_depth_seen(p, octaves, 0.0);
}

// How much cloud stands over a place of the cloud layer, between 0 and 1.
float cloud_cover(vec2 p, int octaves) {
	return smoothstep(0.5, 0.7, cloud_depth(p, octaves));
}

// The same where a pixel covers `wide` units: the share of the clouds it cannot tell apart.
float cloud_cover_seen(vec2 p, int octaves, float wide) {
	return smoothstep(0.5, 0.7, cloud_depth_seen(p, octaves, wide)) * mix(1.0, 0.8, smoothstep(400.0, 1500.0, wide));
}

// The wind's gusts at a place, between 0 and 1: bands some 60 units wide that cross the land
// and the sea with the wind, stronger in patches of some 220 units that drift after them.
float gust(vec2 p) {
	return noise((p - vec2(0.93, 0.36) * clock * 14.0) / 60.0) * noise((p - vec2(0.93, 0.36) * clock * 5.0) / 220.0 + 40.0);
}

// How hard it rains (or in winter snows) on a place, between 0 and 1: under the deep of a cloud.
float rain_on(vec2 p) {
	return smoothstep(0.66, 0.78, cloud_depth(p, 3));
}

// The clouds' shade on a place of the ground, along the light.
float cloud_shade_seen(vec3 place, float wide) {
	vec2 under = place.xz + to_light.xz * (CLOUD_HEIGHT - place.y) / max(to_light.y, 0.12);
	// A light at the horizon casts no cloud's shade: it fades before the sun hands over to the moon.
	return 1.0 - 0.55 * cloud_cover_seen(under, 3, wide) * smoothstep(0.03, 0.16, to_light.y);
}

float cloud_shade(vec3 place) {
	return cloud_shade_seen(place, 0.0);
}

// How hard it rained on a place three quarters of a minute ago: the cloud has drifted on since,
// and the ground it left is still wet.
float rained_on(vec2 p) {
	return rain_on(p - vec2(9.0, 3.5) * 45.0);
}

// The warmth of the lit beacons on a place, between 0 and 1: it spreads from a beacon in the
// seconds after it is lit, to some 90 units around, where the snow melts and the ground flowers.
float beacon_warmth(vec2 p) {
	float warmth = 0.0;
	for (int i = 0; i < 8; i++) {
		float spread = min(pulses[i].z * 14.0, 90.0);
		warmth = max(warmth, min(pulses[i].w * 3.0, 1.0) * (1.0 - smoothstep(spread * 0.5, spread + 1.0, distance(p, pulses[i].xy))));
	}
	return warmth;
}

// The light of the rings that run out from lit beacons, every nine seconds each.
float pulse_light(vec2 p) {
	float light = 0.0;
	for (int i = 0; i < 8; i++) {
		if (pulses[i].w > 0.0) {
			float age = mod(pulses[i].z, 9.0);
			float radius = age * 75.0;
			float behind = radius - distance(p, pulses[i].xy);
			float off = behind / (6.0 + radius * 0.04);
			// The ring's front, and behind it a glow that the ground it has passed keeps for a while.
			float ring = max(exp(-off * off), behind > 0.0 ? 0.4 * exp(-behind / (40.0 + radius * 0.15)) : 0.0);
			// A ring grows out of nothing in its first half second, and is gone before the next sets off.
			light += ring * exp(-age * 0.45) * smoothstep(0.0, 0.5, age) * (1.0 - smoothstep(7.0, 9.0, age)) * pulses[i].w;
		}
	}
	return light;
}

// How much of the night a place has, between 0 and 1, by the sun over its own horizon: the
// planet has a day side and a night side.
uniform vec3 sun_way = vec3(0.0, 1.0, 0.0); // toward the sun, in the anchor's axes

float night_at(vec2 p) {
	return smoothstep(0.02, 0.3, -dot(chart_dir(p), sun_way));
}

// What lies between a high eye and the ground or the sea, laid over the surface's own look: the
// cloud layer, where the way from the eye passes through it (the sky's shader shows it from
// under), and from out of the air the planet's own air, thin straight down and thick toward the
// rim. `up_seen` and `to_eye_seen` are the place's up and the way to the eye as the camera sees
// them. Returns how much of the surface's own normal gives way to the planet's.
float from_above(vec3 place, float wide, vec3 up_seen, vec3 to_eye_seen, inout vec3 albedo, inout vec3 emission, inout float roughness, inout float specular) {
	float level = 0.0;
	float over_clouds = smoothstep(CLOUD_HEIGHT + 30.0, CLOUD_HEIGHT + 260.0, eye.y);
	if (over_clouds > 0.0) {
		vec3 to_eye = normalize(eye - place);
		float flat_near = 1.0 - smoothstep(8000.0, 30000.0, distance(place.xz, eye.xz));
		vec2 through = place.xz + to_eye.xz * max(CLOUD_HEIGHT - place.y, 0.0) / max(to_eye.y, 0.2) * flat_near;
		float cover = cloud_cover_seen(through, wide > 400.0 ? 3 : 5, wide) * over_clouds;
		albedo = mix(albedo, vec3(0.82, 0.84, 0.88), cover);
		emission *= 1.0 - cover;
		roughness = mix(roughness, 1.0, cover);
		specular = mix(specular, 0.1, cover);
		level = cover;
	}
	float out_of_air = 1.0 - exp(-max(eye.y, 0.0) / AIR);
	if (out_of_air > 0.01) {
		// The air a ray from the ground passes through, in heights of the air: 1 straight up,
		// 11.6 along the ground (a planet of 86 such heights).
		float air_mass = 11.6 / (11.6 * max(dot(up_seen, to_eye_seen), 0.0) + 1.0) * out_of_air;
		float veil = 1.0 - exp(-air_mass * 0.13);
		albedo = mix(albedo, vec3(0.3, 0.5, 0.95), veil);
		emission *= 1.0 - 0.6 * veil;
		roughness = mix(roughness, 1.0, veil);
		specular *= 1.0 - veil;
		level = max(level, veil);
	}
	return level;
}

// How far a place on the ground is from the flyer, by the ground and by the flyer's height over
// what lives near it: what is drawn around the flyer (trees, houses, boats, birds) goes by
// degrees as the flyer climbs, as it does with distance along the ground.
float far_from(vec2 place) {
	return length(vec2(distance(place, flyer_over), max(altitude - 150.0, 0.0)));
}
