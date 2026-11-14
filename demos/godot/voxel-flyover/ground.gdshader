// What stands in each cell of a grid of columns, drawn into a texture of a texel for each cell
// when the grid steps after the flight: the column's top, the climate, and the lowest top
// around it. The columns' and the trees' vertex stages read it, so the terrain's function
// runs once for a cell and not for every vertex of every pass. A cell keeps its texel while the
// grid holds it: the texture wraps around the world.
shader_type canvas_item;
render_mode blend_disabled;
#include "res://terrain.gdshaderinc"

uniform float cell = 1.0;
uniform float across = 256.0;
uniform vec2 first; // the grid's first cell, as columns and rows of the world's

void fragment() {
	vec2 at = first + mod(floor(UV * across) - first, across);
	// The lowest of the six columns around this one: its sides show no further down.
	float along = mod(at.y, 2.0);
	float low = min(column_top(at + vec2(-1.0, 0.0), cell), column_top(at + vec2(1.0, 0.0), cell));
	for (float row = -1.0; row < 2.0; row += 2.0) {
		low = min(low, min(column_top(at + vec2(along - 1.0, row), cell), column_top(at + vec2(along, row), cell)));
	}
	COLOR = vec4(column_top(at, cell), climate(hex_centre(at, cell)), low);
}
