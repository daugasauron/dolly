// The world as a function of the place: ground.gdshader draws it for the shaders, and terrain.gd,
// which flies over it, computes the same heights. The hash is integer arithmetic, so both agree.
const float SEA = 24.0;
const float CLOUD_HEIGHT = 520.0;

// What main.gd tells every shader each frame.
uniform float clock = 0.0; // seconds flown
uniform float night = 0.0;
uniform vec3 to_light = vec3(0.0, 1.0, 0.0); // toward the sun, or the moon once it has set
// The lit beacons around the flyer: where each stands (xy), how long ago its ring set off (z),
// and how strong its rings are (w), which is less the further it is from the flyer.
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

// The ground's height: sea and continents, hills, and ranges of mountains where the land allows
// them, whose spurs stand on their crests and whose gullies on their spurs.
float terrain_height(vec2 p) {
	float land = smoothstep(0.36, 0.52, fbm(p / 520.0, 3));
	float hills = fbm(p / 130.0 + vec2(17.0, 5.0), 4);
	float ranges = smoothstep(0.36, 0.58, fbm(p / 640.0 + vec2(80.0, 31.0), 2));
	vec2 q = p / 260.0 + vec2(40.0, 12.0);
	float crest = ridge(q);
	float spur = ridge(q * 2.3 + vec2(9.0, 77.0)) * crest;
	float peaks = crest * 0.6 + spur * 0.3 + ridge(q * 5.1 + vec2(3.0, 41.0)) * spur * 0.16;
	return SEA - 13.0 + land * 16.0 + hills * 22.0 * (0.35 + land) + peaks * 125.0 * land * ranges;
}

// x: warmth, y: moisture, both between 0 and 1.
vec2 climate(vec2 p) {
	return vec2(fbm(p / 900.0 + vec2(211.0, 57.0), 2), fbm(p / 560.0 + vec2(13.0, 143.0), 2));
}

// How much cloud stands over a place of the cloud layer, between 0 and 1.
float cloud_cover(vec2 p, int octaves) {
	vec2 q = (p + vec2(9.0, 3.5) * clock) / 1000.0;
	return smoothstep(0.5, 0.7, fbm(q + vec2(31.0, 7.0), octaves));
}

// The clouds' shade on a place of the ground, along the light.
float cloud_shade(vec3 place) {
	vec2 under = place.xz + to_light.xz * (CLOUD_HEIGHT - place.y) / max(to_light.y, 0.12);
	// A light at the horizon casts no cloud's shade: it fades before the sun hands over to the moon.
	return 1.0 - 0.55 * cloud_cover(under, 3) * smoothstep(0.03, 0.16, to_light.y);
}

// The light of the rings that run out from lit beacons, every nine seconds each.
float pulse_light(vec2 p) {
	float light = 0.0;
	for (int i = 0; i < 8; i++) {
		if (pulses[i].w > 0.0) {
			float age = pulses[i].z;
			float radius = age * 75.0;
			float off = (distance(p, pulses[i].xy) - radius) / (5.0 + radius * 0.03);
			// A ring grows out of nothing in its first half second, and is gone before the next sets off.
			light += exp(-off * off) * exp(-age * 0.45) * smoothstep(0.0, 0.5, age) * (1.0 - smoothstep(7.0, 9.0, age)) * pulses[i].w;
		}
	}
	return light;
}
