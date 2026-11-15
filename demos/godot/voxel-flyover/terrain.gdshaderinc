// The world as a function of the place: ground.gdshader draws it for the shaders, and terrain.gd,
// which flies over it, computes the same heights. The hash is integer arithmetic, so both agree.
const float SEA = 24.0;
const float CLOUD_HEIGHT = 520.0;
const float LOT = 16.0; // a building's lot
const float HEIGHT_KEPT = 110.0; // the height the ground's textures keep as zero

// What main.gd tells every shader each frame.
uniform float clock = 0.0; // seconds flown
uniform float night = 0.0;
// The season, as three shares between 0 and 1 that rise and fall through the year.
uniform float spring = 0.0;
uniform float autumn = 0.0;
uniform float winter = 0.0;
uniform vec3 to_light = vec3(0.0, 1.0, 0.0); // toward the sun, or the moon once it has set
// The lit beacons around the flyer: where each stands (xy), how long ago its ring set off (z),
// how long ago it was lit (z), and how strong its rings are (w), which is less the further it
// is from the flyer.
uniform vec4 pulses[8];

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

float ridge(vec2 p) {
	float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
	return n * n;
}

// A slow field of the world: two octaves of noise at a size of its own, turned and placed by
// itself. The fields' sizes have no common measure (1.9, 2.7, 7.3, 11, 19 and 53 thousand
// units), so their combinations do not come round again. Half of a field is under 0.5, a tenth
// over 0.73, a twentieth over 0.78, a hundredth over 0.86: what is rare is a threshold on one.
float slow(vec2 p, float size, float turn, vec2 place) {
	return fbm(vec2(cos(turn) * p.x - sin(turn) * p.y, sin(turn) * p.x + cos(turn) * p.y) / size + place, 2);
}

// How much of a massif a place is: a country of high mountains, rare, 19 thousand units a field.
float massif_at(vec2 p) {
	return smoothstep(0.72, 0.83, slow(p, 19000.0, 0.3, vec2(64.0, 22.0)));
}

// How far from a river's middle a place is, as a share of a noise whose contour the river
// follows: a river is under 0.012 of it and its valley under 0.1. The contour meanders with a
// second noise.
float river_at(vec2 p) {
	vec2 q = p / 900.0 + 0.35 * vec2(noise(p / 310.0 + vec2(7.0, 3.0)), noise(p / 310.0 + vec2(51.0, 23.0)));
	return abs(noise(q + vec2(140.0, 77.0)) - 0.5);
}

// The ground's height. Seas and continents come at three sizes: oceans and continents of 7.3
// thousand units, lands of 2.7 thousand in them, and the coasts, bays and islands of 520; in an
// ocean only the highest of the last stand out, as islands. On the land, hills, and ranges of
// mountains whose spurs stand on their crests and whose gullies on their spurs; the relief of a
// region (1.9 thousand units) makes its ranges low or high, and in a massif they are more than
// twice as high on a raised base. Rivers at the sea's level run in valleys through the low
// land and narrow to their springs in the hills. terrain.gd computes the same.
float terrain_height(vec2 p) {
	float shift = (slow(p, 7300.0, 0.7, vec2(34.0, 62.0)) - 0.5) * 0.9 + (slow(p, 2700.0, 1.9, vec2(104.0, 42.0)) - 0.5) * 0.5;
	float relief = mix(0.3, 1.0, smoothstep(0.3, 0.5, slow(p, 1900.0, 2.6, vec2(38.0, 77.0))));
	float massif = massif_at(p);
	float land = smoothstep(0.36, 0.52, fbm(p / 520.0, 3) + shift);
	float hills = fbm(p / 130.0 + vec2(17.0, 5.0), 4);
	float ranges = smoothstep(0.36, 0.58, fbm(p / 640.0 + vec2(80.0, 31.0), 2) + 0.3 * massif);
	vec2 q = p / 260.0 + vec2(40.0, 12.0);
	float crest = ridge(q);
	float spur = ridge(q * 2.3 + vec2(9.0, 77.0)) * crest;
	float peaks = crest * 0.6 + spur * 0.3 + ridge(q * 5.1 + vec2(3.0, 41.0)) * spur * 0.16;
	float height = SEA - 13.0 - 24.0 * smoothstep(-0.05, -0.3, shift) + land * (16.0 + 45.0 * massif) + hills * 22.0 * (0.35 + land) + peaks * 125.0 * land * ranges * (relief + 1.5 * massif);
	float gate = (1.0 - smoothstep(SEA + 45.0, SEA + 90.0, height)) * step(SEA - 2.5, height);
	if (gate > 0.0) {
		float valley = smoothstep(0.012 * gate, 0.1, river_at(p));
		height = mix(height, SEA - 2.5 + (height - SEA + 2.5) * valley, gate);
	}
	return height;
}

// x: warmth, y: moisture, both between 0 and 1. Each has its region of 19 and of 11 thousand
// units: cold countries and hot ones, wet ones and dry.
vec2 climate(vec2 p) {
	return vec2(fbm(p / 900.0 + vec2(211.0, 57.0), 2) + (slow(p, 19000.0, 1.3, vec2(37.0, 14.0)) - 0.5) * 0.55,
		fbm(p / 560.0 + vec2(13.0, 143.0), 2) + (slow(p, 11000.0, 2.2, vec2(89.0, 44.0)) - 0.5) * 0.45);
}

// How settled a place is: over 0.58 a town stands, and around it, from 0.5, its fields lie.
float settled(vec2 p) {
	return fbm(p / 760.0 + vec2(400.0, 109.0), 2);
}

// How much of a town stands at a place whose ground is that high, between 0 and 1: on the low
// land of some plains, thinning toward its outskirts. terrain.gd computes the same.
float town_at(vec2 p, float height) {
	return smoothstep(0.58, 0.66, settled(p)) * smoothstep(SEA + 4.5, SEA + 8.0, height) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, height));
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
	float culture = slow(p, 5100.0, 1.1, vec2(3.0, 8.0));
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
float cloud_depth(vec2 p, int octaves) {
	vec2 q = (p + vec2(9.0, 3.5) * clock) / 1000.0;
	return fbm(q + vec2(31.0, 7.0), octaves);
}

// How much cloud stands over a place of the cloud layer, between 0 and 1.
float cloud_cover(vec2 p, int octaves) {
	return smoothstep(0.5, 0.7, cloud_depth(p, octaves));
}

// How hard it rains (or in winter snows) on a place, between 0 and 1: under the deep of a cloud.
float rain_on(vec2 p) {
	return smoothstep(0.66, 0.78, cloud_depth(p, 3));
}

// The clouds' shade on a place of the ground, along the light.
float cloud_shade(vec3 place) {
	vec2 under = place.xz + to_light.xz * (CLOUD_HEIGHT - place.y) / max(to_light.y, 0.12);
	// A light at the horizon casts no cloud's shade: it fades before the sun hands over to the moon.
	return 1.0 - 0.55 * cloud_cover(under, 3) * smoothstep(0.03, 0.16, to_light.y);
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
