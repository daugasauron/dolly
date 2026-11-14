// The ground: one box for each column of blocks, which the vertex stage raises to the terrain's
// height there, so the grid that follows the flight is an endless world. The fragment stage
// colours each block by its climate, height and depth under the surface.
shader_type spatial;
#include "res://terrain.gdshaderinc"

uniform float cell = 1.0;
// The far grid leaves out the square the near grid draws.
uniform vec2 hole_centre;
uniform float hole = 0.0;

varying vec3 world_position;
varying flat vec3 world_normal;
varying flat vec4 column; // the top, warmth, moisture, and a number of the column's own

void vertex() {
	vec2 centre = (floor(MODEL_MATRIX[3].xz / cell) + 0.5) * cell;
	float top = floor(terrain_height(centre));
	vec2 from_hole = abs(centre - hole_centre);
	if (top < SEA || max(from_hole.x, from_hole.y) < hole) {
		VERTEX = vec3(0.0);
	} else {
		VERTEX.y = VERTEX.y > 0.0 ? top : SEA - 2.0;
	}
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = NORMAL;
	column = vec4(top, climate(centre), hash(centre));
}

vec3 surface_colour(float top, float warmth, float moisture, float own) {
	float t = warmth + (own - 0.5) * 0.05;
	float m = moisture + (own - 0.5) * 0.05;
	float snowline = SEA + 72.0 - (0.5 - t) * 70.0 + own * 3.0;
	if (top > snowline) {
		return vec3(0.84, 0.88, 0.94);
	}
	if (top > snowline - 16.0 + own * 4.0) {
		return vec3(0.42, 0.42, 0.46);
	}
	if (top < SEA + 2.0) {
		return vec3(0.87, 0.79, 0.55);
	}
	if (t > 0.58 && m < 0.47) {
		return vec3(0.86, 0.6, 0.36);
	}
	if (t < 0.4) {
		return mix(vec3(0.47, 0.55, 0.36), vec3(0.27, 0.43, 0.27), smoothstep(0.35, 0.65, m));
	}
	return mix(vec3(0.56, 0.66, 0.22), vec3(0.22, 0.56, 0.16), smoothstep(0.35, 0.62, m));
}

void fragment() {
	float top = column.x;
	vec3 size = vec3(cell, 1.0, cell);
	float block_y = floor(world_position.y - world_normal.y * 0.5);
	float depth = top - world_position.y;
	vec3 surface = surface_colour(top, column.y, column.z, column.w);
	vec3 colour = surface;
	bool desert = surface.r > 0.8 && surface.b < 0.4;
	if (world_normal.y < 0.5 && depth > 0.3) {
		if (desert) {
			// Bands of sandstone.
			float band = hash(vec2(block_y, 3.0));
			colour = mix(vec3(0.78, 0.42, 0.25), vec3(0.93, 0.7, 0.45), band);
		} else if (surface.b > 0.9) {
			colour = depth < 2.0 ? surface : vec3(0.44, 0.45, 0.5);
		} else {
			colour = depth < 3.0 + column.w * 2.0 && surface.g > surface.b ? vec3(0.45, 0.31, 0.2) : vec3(0.44, 0.44, 0.47);
		}
		colour *= mix(0.62, 1.0, exp(-depth * 0.22));
	}
	colour *= block_shade(world_position, world_normal, size, -VERTEX.z);
	ALBEDO = colour;
	ROUGHNESS = surface.b > 0.9 ? 0.55 : 0.95;
	SPECULAR = 0.25;
}
