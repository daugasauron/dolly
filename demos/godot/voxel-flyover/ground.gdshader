// The ground of one grid, drawn into a texture of a texel for each of its points when the grids
// step after the flight: the height and the climate there. The terrain's and the trees' shaders
// read it (ground.gdshaderinc), so the terrain's function runs once for a point and not for every
// vertex and pixel of every pass. A point keeps its texel while the grid holds it: the texture
// wraps around the world.
shader_type canvas_item;
render_mode blend_disabled;
#include "res://terrain.gdshaderinc"

uniform float cell = 1.0;
uniform float texels = 260.0;
uniform vec2 first; // the grid's first point, in cells

void fragment() {
	vec2 p = (first + mod(floor(UV * texels) - first, texels)) * cell;
	// The height is kept around the middle of what it may be: a half float is finer near zero.
	COLOR = vec4(terrain_height(p) - HEIGHT_KEPT, climate(p), realm_at(p));
}
