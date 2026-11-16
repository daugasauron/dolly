// Reading the ground ground.gdshader drew: a grid's own texture near the flyer, and the coarser
// grid's around it further off. Between, the two are blended by the distance from the flyer, which
// moves smoothly while the grids step: the land's detail comes and goes by degrees, never at once.
// The same happens with height: a grid's own detail gives way to the coarser grid's as the flyer
// rises, and past the last grid with a texture of its own the ground is the whole planet's.
uniform sampler2D ground : filter_linear, repeat_enable;
uniform sampler2D ground_beyond : filter_linear, repeat_enable;
uniform sampler2D planet_ground : filter_linear, repeat_enable; // the whole planet's, by longitude and latitude
uniform int source = 0; // 0: the grid's texture and the coarser grid's; 1: the grid's and the planet's; 2: the planet's alone
uniform float cell = 1.5;
uniform float cell_beyond = 6.0;
uniform float reach = 180.0; // the grid reaches at least this far from the flyer, wherever it stepped
uniform vec2 flyer; // where the flyer is over the ground

vec4 ground_in(sampler2D map, vec2 p, float size) {
	return textureLod(map, (p / size + 0.5) / vec2(textureSize(map, 0)), 0.0) + vec4(HEIGHT_KEPT, 0.0, 0.0, 0.0);
}

// The planet's ground at a chart's place.
vec4 ground_of_planet(vec2 p) {
	vec3 dir = anchor_frame * chart_dir(p);
	return textureLod(planet_ground, vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, acos(clamp(dir.y, -1.0, 1.0)) / 3.1415927), 0.0) + vec4(HEIGHT_KEPT, 0.0, 0.0, 0.0);
}

// How much of the ground at a place is the grid's own: all of it near the flyer, none past its
// reach, and none once the flyer is 300 of its cells high.
float ground_own(vec2 p) {
	if (source == 2) {
		return 0.0;
	}
	vec2 away = abs(p - flyer);
	return (1.0 - smoothstep(reach - cell_beyond * 4.0, reach, max(away.x, away.y))) * (1.0 - smoothstep(150.0 * cell, 300.0 * cell, altitude));
}

// How far apart the ground's points are at a place.
float ground_spacing(vec2 p) {
	return mix(cell_beyond, cell, ground_own(p));
}

vec4 ground_past(vec2 p) {
	return source == 0 ? ground_in(ground_beyond, p, cell_beyond) : ground_of_planet(p);
}

// x: the height, y: warmth, z: moisture, w: how much of a realm of wonders the place is.
vec4 ground_here(vec2 p) {
	float own = ground_own(p);
	vec4 beyond = ground_past(p);
	return own > 0.0 ? mix(beyond, ground_in(ground, p, cell), own) : beyond;
}

// How far the ground at a place stands over the ground around it: over zero on a spur or a
// knoll, under it in a gully or a hollow. The coarser texture is the finer one's mean, so it is
// their difference, near the flyer where the finer one is read.
float ground_relief(vec2 p) {
	float own = source == 0 ? ground_own(p) : 0.0;
	return own > 0.0 ? (ground_in(ground, p, cell).x - ground_in(ground_beyond, p, cell_beyond).x) * own : 0.0;
}

// The ground's normal in the chart, from the heights that far to each side.
vec3 ground_normal(vec2 p, float apart) {
	return normalize(vec3(ground_here(p - vec2(apart, 0.0)).x - ground_here(p + vec2(apart, 0.0)).x, 2.0 * apart,
		ground_here(p - vec2(0.0, apart)).x - ground_here(p + vec2(0.0, apart)).x));
}
