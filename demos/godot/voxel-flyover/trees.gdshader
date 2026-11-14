// What grows: one tree of faceted cones for each plot of a grid that follows the flight. The vertex
// stage stands it on the column of its place, or leaves it out, and the climate shapes it: firs
// in the cold, wide parasol trees in the wet, in places in blossom or in autumn colours, shards of
// crystal in the desert, and groves whose crowns glow at night.
shader_type spatial;
#include "res://terrain.gdshaderinc"

uniform sampler2D ground_fine : filter_nearest;
uniform sampler2D ground_coarse : filter_nearest;
uniform float across = 256.0;
uniform float plot = 4.0;
// The rectangle the finest columns stand in; beyond it a tree stands on a coarser column.
uniform vec2 fine_centre;
uniform vec2 fine;
uniform float coarse = 4.0;
// How far from the grid's middle the trees end.
uniform float reach = 250.0;

varying flat vec3 colour;
varying flat float glow;
varying float height;

void vertex() {
	vec2 corner = floor(MODEL_MATRIX[3].xz / plot) * plot;
	float chance = hash(corner);
	vec2 place = corner + vec2(hash(corner + 91.0), hash(corner + 173.0)) * plot;
	vec2 from_fine = fine - abs(place - fine_centre);
	float cell = min(from_fine.x, from_fine.y) > 2.0 ? 1.0 : coarse;
	vec2 at = hex_cell(place, cell);
	vec2 centre = hex_centre(at, cell);
	ivec2 texel = ivec2(mod(at, across));
	vec4 here = cell > 1.0 ? texelFetch(ground_coarse, texel, 0) : texelFetch(ground_fine, texel, 0);
	float top = here.x;
	float warmth = here.y;
	float moisture = here.z;
	float snowline = SEA + 70.0 - (0.5 - warmth) * 70.0;
	bool desert = warmth > 0.57 && moisture < 0.47;
	bool cold = warmth < 0.42;
	float density = desert ? 0.1 : cold ? 0.5 : mix(0.1, 0.7, smoothstep(0.35, 0.62, moisture));
	bool crown = COLOR.r > 0.5;
	float kind = hash(corner + 311.0);
	float edge = distance(centre, NODE_POSITION_WORLD.xz) / reach;
	float size = (0.75 + 0.7 * kind) * (cell > 1.0 ? 1.5 : 1.0) * smoothstep(1.0, 0.8, edge);
	colour = vec3(0.0);
	glow = 0.0;
	height = VERTEX.y;
	if (top < SEA + 2.0 || top > snowline - 14.0 || chance > density || size <= 0.0 || (desert && !crown)) {
		VERTEX = vec3(0.0);
	} else {
		bool lit = !desert && noise(centre / 190.0 + vec2(57.0, 201.0)) > 0.66;
		if (crown) {
			float low = 2.0; // where the crown begins on the trunk
			if (desert) {
				// A shard: the crown alone, narrow and leaning.
				VERTEX.y = (VERTEX.y - low) * 1.5;
				VERTEX.xz *= 0.3;
				VERTEX.xz += VERTEX.y * (vec2(hash(corner + 7.0), hash(corner + 13.0)) - 0.5) * 0.7;
			} else if (cold) {
				VERTEX.xz *= 0.7;
				VERTEX.y = low + (VERTEX.y - low) * 1.35;
			} else {
				VERTEX.xz *= 1.55;
				VERTEX.y = low + 0.8 + (VERTEX.y - low) * 0.5;
			}
			// The wind.
			VERTEX.xz += sin(clock * 1.4 + centre.x * 0.21 + centre.y * 0.17) * 0.035 * height;
			if (desert) {
				colour = mix(vec3(1.0, 0.45, 0.2), vec3(0.95, 0.2, 0.45), kind);
				glow = 0.35;
			} else if (lit) {
				colour = mix(vec3(0.05, 0.85, 0.9), vec3(0.65, 0.2, 1.0), kind);
				glow = 1.0;
			} else if (cold) {
				colour = mix(vec3(0.01, 0.09, 0.08), vec3(0.03, 0.15, 0.1), kind);
			} else if (noise(centre / 240.0 + vec2(7.0, 61.0)) > 0.6) {
				colour = kind < 0.4 ? vec3(0.8, 0.2, 0.02) : kind < 0.75 ? vec3(0.85, 0.45, 0.03) : vec3(0.45, 0.03, 0.05);
			} else if (noise(centre / 200.0 + vec2(131.0, 23.0)) > 0.64) {
				colour = mix(vec3(0.9, 0.3, 0.45), vec3(1.0, 0.6, 0.7), kind);
			} else {
				colour = mix(vec3(0.02, 0.2, 0.1), vec3(0.12, 0.3, 0.05), kind);
			}
		} else {
			colour = lit ? vec3(0.1, 0.11, 0.16) : vec3(0.1, 0.06, 0.04);
		}
		colour *= cloud_shade(vec3(centre.x, top, centre.y));
		VERTEX = VERTEX * size + vec3(centre.x, top - 0.2, centre.y) - MODEL_MATRIX[3].xyz;
	}
}

void fragment() {
	// A crown is lighter toward its tip, and a glowing one keeps its colour for the night.
	float up = smoothstep(1.5, 6.0, height);
	ALBEDO = colour * mix(0.75, 1.15, up) * (1.0 - 0.5 * glow);
	EMISSION = colour * glow * (0.1 + 1.5 * night) * mix(0.5, 1.0, up);
	ROUGHNESS = glow > 0.2 ? 0.25 : 0.8;
	SPECULAR = 0.4;
	BACKLIGHT = colour * 0.3;
}
