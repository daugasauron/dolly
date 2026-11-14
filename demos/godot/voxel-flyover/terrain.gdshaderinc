// The world as a function of the place: every shader that draws it and terrain.gd, which flies
// over it, compute the same heights. The hash is integer arithmetic, so both agree exactly.
const float SEA = 24.0;

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

float ridge(vec2 p) {
	float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
	return n * n;
}

// The ground's height before it is cut into blocks: sea and continents, hills, and ranges of
// ridged mountains where the land allows them.
float terrain_height(vec2 p) {
	float land = smoothstep(0.36, 0.52, fbm(p / 520.0, 3));
	float hills = fbm(p / 130.0 + vec2(17.0, 5.0), 4);
	float ranges = smoothstep(0.4, 0.62, fbm(p / 640.0 + vec2(80.0, 31.0), 2));
	float peaks = ridge(p / 230.0 + vec2(40.0, 12.0)) * (0.55 + 0.45 * ridge(p / 90.0 + vec2(9.0, 77.0)));
	return SEA - 13.0 + land * 16.0 + hills * 22.0 * (0.35 + land) + peaks * 85.0 * land * ranges;
}

// x: warmth, y: moisture, both between 0 and 1.
vec2 climate(vec2 p) {
	return vec2(fbm(p / 900.0 + vec2(211.0, 57.0), 2), fbm(p / 560.0 + vec2(13.0, 143.0), 2));
}

// How a block's face is told from its neighbours': each block a shade of its own, and darker
// edges, both fading with distance, where they would only flicker.
float block_shade(vec3 world_position, vec3 normal, vec3 size, float distance) {
	vec3 block = floor((world_position - normal * 0.5) / size);
	vec3 within = fract(world_position / size);
	vec3 to_edge = min(within, 1.0 - within) + abs(normal);
	float edge = min(to_edge.x, min(to_edge.y, to_edge.z));
	float near = 1.0 - smoothstep(50.0, 150.0, distance);
	float own = hash(block.xz + block.y * 37.0);
	return (0.9 + 0.2 * own * near) * mix(1.0, 0.8 + 0.2 * smoothstep(0.0, 0.07, edge), near);
}
