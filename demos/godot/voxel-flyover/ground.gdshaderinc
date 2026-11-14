// Reading the ground ground.gdshader drew: a grid's own texture, and toward the grid's edge the
// coarser grid's around it, so that the two meet without a step.
uniform sampler2D ground : filter_linear, repeat_enable;
uniform sampler2D ground_beyond : filter_linear, repeat_enable;
uniform float cell = 1.5;
uniform float cell_beyond = 6.0;
uniform float reach = 192.0; // half the square the grid covers
uniform vec2 middle; // of the grids

vec4 ground_in(sampler2D map, vec2 p, float size) {
	return textureLod(map, (p / size + 0.5) / vec2(textureSize(map, 0)), 0.0);
}

// x: the height, y: warmth, z: moisture.
vec4 ground_here(vec2 p) {
	vec2 from_edge = reach - abs(p - middle);
	float own = smoothstep(0.0, cell_beyond * 2.0, min(from_edge.x, from_edge.y) - cell_beyond);
	vec4 beyond = ground_in(ground_beyond, p, cell_beyond);
	return own > 0.0 ? mix(beyond, ground_in(ground, p, cell), own) : beyond;
}

// The ground's normal, from the heights that far to each side.
vec3 ground_normal(vec2 p, float apart) {
	return normalize(vec3(ground_here(p - vec2(apart, 0.0)).x - ground_here(p + vec2(apart, 0.0)).x, 2.0 * apart,
		ground_here(p - vec2(0.0, apart)).x - ground_here(p + vec2(0.0, apart)).x));
}
