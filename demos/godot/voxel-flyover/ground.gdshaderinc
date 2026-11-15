// Reading the ground ground.gdshader drew: a grid's own texture near the flyer, and the coarser
// grid's around it further off. Between, the two are blended by the distance from the flyer, which
// moves smoothly while the grids step: the land's detail comes and goes by degrees, never at once.
uniform sampler2D ground : filter_linear, repeat_enable;
uniform sampler2D ground_beyond : filter_linear, repeat_enable;
uniform float cell = 1.5;
uniform float cell_beyond = 6.0;
uniform float reach = 180.0; // the grid reaches at least this far from the flyer, wherever it stepped
uniform vec2 flyer; // where the flyer is over the ground

vec4 ground_in(sampler2D map, vec2 p, float size) {
	return textureLod(map, (p / size + 0.5) / vec2(textureSize(map, 0)), 0.0) + vec4(HEIGHT_KEPT, 0.0, 0.0, 0.0);
}

// How much of the ground at a place is the grid's own: all of it near the flyer, none past its reach.
float ground_own(vec2 p) {
	vec2 away = abs(p - flyer);
	return 1.0 - smoothstep(reach - cell_beyond * 4.0, reach, max(away.x, away.y));
}

// How far apart the ground's points are at a place.
float ground_spacing(vec2 p) {
	return mix(cell_beyond, cell, ground_own(p));
}

// x: the height, y: warmth, z: moisture.
vec4 ground_here(vec2 p) {
	float own = ground_own(p);
	vec4 beyond = ground_in(ground_beyond, p, cell_beyond);
	return own > 0.0 ? mix(beyond, ground_in(ground, p, cell), own) : beyond;
}

// How far the ground at a place stands over the ground around it: over zero on a spur or a
// knoll, under it in a gully or a hollow. The coarser texture is the finer one's mean, so it is
// their difference, near the flyer where the finer one is read.
float ground_relief(vec2 p) {
	float own = ground_own(p);
	return own > 0.0 ? (ground_in(ground, p, cell).x - ground_in(ground_beyond, p, cell_beyond).x) * own : 0.0;
}

// The ground's normal, from the heights that far to each side.
vec3 ground_normal(vec2 p, float apart) {
	return normalize(vec3(ground_here(p - vec2(apart, 0.0)).x - ground_here(p + vec2(apart, 0.0)).x, 2.0 * apart,
		ground_here(p - vec2(0.0, apart)).x - ground_here(p + vec2(0.0, apart)).x));
}
