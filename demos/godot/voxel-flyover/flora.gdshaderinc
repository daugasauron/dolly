// What grows where: the tree of a plot, and its crown's colour. trees.gdshader stands the trees by
// it, and land.gdshader paints the same crowns on the ground where the trees are too far to draw.
const float PLOT = 4.0;

// The tree a plot may hold: xy its place, z its lot (it stands where its lot is under the
// climate's share of trees), w a number of its own between 0 and 1.
vec4 plot_tree(vec2 p) {
	vec2 corner = floor(p / PLOT) * PLOT;
	return vec4(corner + vec2(hash(corner + 91.0), hash(corner + 173.0)) * PLOT, hash(corner), hash(corner + 311.0));
}

bool is_desert(float warmth, float moisture) {
	return warmth > 0.57 && moisture < 0.47;
}

bool is_cold(float warmth) {
	return warmth < 0.42;
}

// The share of plots that hold a tree.
float tree_share(float warmth, float moisture) {
	return is_desert(warmth, moisture) ? 0.12 : is_cold(warmth) ? 0.5 : mix(0.1, 0.7, smoothstep(0.35, 0.62, moisture));
}

// How much of a marsh a place is, between 0 and 1: wet ground a little above the sea. Few
// trees stand in it.
float marsh_at(float height, float moisture) {
	return smoothstep(0.56, 0.63, moisture) * smoothstep(SEA + 7.0, SEA + 4.5, height);
}

// Where trees grow: above the shore, below the bare heights.
bool grows(float height, float warmth) {
	return height > SEA + 2.0 && height < SEA + 62.0 - (0.5 - warmth) * 70.0;
}

float tree_size(float own) {
	return 0.75 + 0.7 * own;
}

// How wide a crown is, for a tree of size 1.
float crown_width(float warmth, float moisture) {
	return is_desert(warmth, moisture) ? 0.34 : is_cold(warmth) ? 1.2 : 2.2;
}

// A crown's colour, and in a how much of its own light it has: desert spires a little, the
// groves that glow at night all of it. The season turns it by degrees: more groves blossom in
// spring and more turn in autumn, each tree in its own time, and in winter the broad crowns
// are bare and every crown carries snow.
vec4 crown_colour(vec2 place, float own, float warmth, float moisture) {
	if (is_desert(warmth, moisture)) {
		return vec4(mix(vec3(1.0, 0.45, 0.2), vec3(0.95, 0.2, 0.45), own), 0.35);
	}
	if (noise(place / 190.0 + vec2(57.0, 201.0)) > 0.66) {
		return vec4(mix(vec3(0.05, 0.85, 0.9), vec3(0.65, 0.2, 1.0), own), 1.0);
	}
	vec3 snowy = vec3(0.62, 0.68, 0.78);
	if (is_cold(warmth)) {
		return vec4(mix(mix(vec3(0.01, 0.09, 0.08), vec3(0.03, 0.15, 0.1), own), snowy, winter * 0.55), 0.0);
	}
	vec3 leaves = mix(vec3(0.02, 0.2, 0.1), vec3(0.12, 0.3, 0.05), own);
	vec3 turned = own < 0.4 ? vec3(0.8, 0.2, 0.02) : own < 0.75 ? vec3(0.85, 0.45, 0.03) : vec3(0.45, 0.03, 0.05);
	vec3 blossom = mix(vec3(0.9, 0.3, 0.45), vec3(1.0, 0.6, 0.7), own);
	float turns = mix(0.6, 0.12, autumn) + (own - 0.5) * 0.12;
	float blooms = mix(0.64, 0.3, spring) + (own - 0.5) * 0.12;
	leaves = mix(leaves, blossom, smoothstep(blooms - 0.05, blooms + 0.05, noise(place / 200.0 + vec2(131.0, 23.0))));
	leaves = mix(leaves, turned, smoothstep(turns - 0.05, turns + 0.05, noise(place / 240.0 + vec2(7.0, 61.0))));
	return vec4(mix(leaves, mix(vec3(0.3, 0.24, 0.2), snowy, 0.5), winter * 0.85), 0.0);
}
