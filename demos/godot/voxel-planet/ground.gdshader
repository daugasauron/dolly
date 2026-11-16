// The ground of one grid, drawn into a texture of a texel for each of its points when the grids
// step after the flight: the height and the climate there. The terrain's and the trees' shaders
// read it (ground.gdshaderinc), so the terrain's function runs once for a point and not for every
// vertex and pixel of every pass. A point keeps its texel while the grid holds it: the texture
// wraps around the chart.
//
// With `whole` it is the ground of the whole planet instead, a texel for each step of longitude
// and latitude, drawn once in strips: what is far, and the planet seen from orbit, is read from
// it, so it is the same whatever chart the flight is in.
shader_type canvas_item;
render_mode blend_disabled;
#include "res://terrain.gdshaderinc"

uniform float cell = 1.0;
uniform float texels = 260.0;
uniform vec2 first; // the grid's first point, in cells
uniform bool whole = false;
uniform vec2 whole_size = vec2(4096.0, 2048.0);

void fragment() {
	vec3 planet;
	if (whole) {
		vec2 turn = (floor(FRAGCOORD.xy) + 0.5) / whole_size * vec2(6.2831853, 3.1415927);
		planet = vec3(-sin(turn.y) * cos(turn.x), cos(turn.y), -sin(turn.y) * sin(turn.x)) * RADIUS;
	} else {
		planet = planet_at((first + mod(floor(UV * texels) - first, texels)) * cell);
	}
	// The height is kept around the middle of what it may be: a half float is finer near zero.
	COLOR = vec4(terrain_on(planet) - HEIGHT_KEPT, climate_on(planet), realm_on(planet));
}
