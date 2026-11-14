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
	return textureLod(map, (p / size + 0.5) / vec2(textureSize(map, 0)), 0.0);
}

// x: the height, y: warmth, z: moisture.
vec4 ground_here(vec2 p) {
	vec2 away = abs(p - flyer);
	float own = 1.0 - smoothstep(reach - cell_beyond * 4.0, reach, max(away.x, away.y));
	vec4 beyond = ground_in(ground_beyond, p, cell_beyond);
	return own > 0.0 ? mix(beyond, ground_in(ground, p, cell), own) : beyond;
}

// The ground's normal, from the heights that far to each side.
vec3 ground_normal(vec2 p, float apart) {
	return normalize(vec3(ground_here(p - vec2(apart, 0.0)).x - ground_here(p + vec2(apart, 0.0)).x, 2.0 * apart,
		ground_here(p - vec2(0.0, apart)).x - ground_here(p + vec2(0.0, apart)).x));
}
