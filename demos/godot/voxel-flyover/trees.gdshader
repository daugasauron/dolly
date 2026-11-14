// The trees: one tree of boxes for each plot of a grid that follows the flight. The vertex stage
// stands it on the ground of its plot, or leaves it out, and the climate picks its kind: oaks,
// in places in autumn colours, in blossom or glowing at night, pines in the cold, cactus in the desert.
shader_type spatial;
#include "res://terrain.gdshaderinc"

uniform float plot = 5.0;
uniform float night = 0.0;

varying vec3 world_position;
varying flat vec3 world_normal;
varying flat vec3 colour;
varying flat float glow;

void vertex() {
	colour = vec3(0.0);
	glow = 0.0;
	vec2 corner = floor(MODEL_MATRIX[3].xz / plot) * plot;
	float chance = hash(corner);
	vec2 centre = corner + floor(vec2(hash(corner + 91.0), hash(corner + 173.0)) * (plot - 1.0)) + 0.5;
	float top = floor(terrain_height(centre));
	vec2 weather = climate(centre);
	float warmth = weather.x;
	float moisture = weather.y;
	float snowline = SEA + 72.0 - (0.5 - warmth) * 70.0;
	bool desert = warmth > 0.58 && moisture < 0.47;
	bool cold = warmth < 0.4;
	float density = desert ? 0.07 : cold ? 0.45 : mix(0.12, 0.62, smoothstep(0.35, 0.62, moisture));
	bool leaf = COLOR.r > 0.5;
	if (top < SEA + 2.0 || top > snowline - 14.0 || chance > density || (desert && leaf)) {
		VERTEX = vec3(0.0);
	} else {
		float kind = hash(corner + 311.0);
		// A taller trunk for some; a pine is narrower and taller.
		if (VERTEX.y > 1.0) {
			VERTEX.y += floor(kind * 3.0) - (desert ? 2.0 : 0.0);
		}
		if (cold && leaf) {
			VERTEX.xz *= 0.6;
			VERTEX.y = 3.0 + (VERTEX.y - 3.0) * 1.7;
		}
		VERTEX += vec3(centre.x, top, centre.y) - MODEL_MATRIX[3].xyz;
		if (!leaf) {
			colour = desert ? vec3(0.3, 0.52, 0.2) : vec3(0.36, 0.24, 0.14);
		} else if (!desert && noise(centre / 210.0 + vec2(57.0, 201.0)) > 0.73) {
			// A grove whose leaves glow at night.
			colour = mix(vec3(0.05, 0.85, 0.8), vec3(0.7, 0.15, 1.0), kind);
			glow = 1.0;
		} else if (cold) {
			colour = NORMAL.y > 0.5 && top > snowline - 34.0 ? vec3(0.84, 0.88, 0.94) : vec3(0.07, 0.27, 0.17);
		} else if (noise(centre / 240.0 + vec2(7.0, 61.0)) > 0.62) {
			colour = kind < 0.4 ? vec3(0.9, 0.36, 0.08) : kind < 0.75 ? vec3(0.95, 0.66, 0.1) : vec3(0.7, 0.13, 0.1);
		} else if (noise(centre / 200.0 + vec2(131.0, 23.0)) > 0.66) {
			colour = mix(vec3(0.98, 0.56, 0.72), vec3(1.0, 0.78, 0.86), kind);
		} else {
			colour = mix(vec3(0.1, 0.4, 0.09), vec3(0.24, 0.52, 0.12), kind);
		}
	}
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = NORMAL;
}

void fragment() {
	ALBEDO = colour * (1.0 - 0.55 * glow * (1.0 - night)) * block_shade(world_position, world_normal, vec3(1.0), -VERTEX.z);
	EMISSION = colour * glow * (0.06 + 0.7 * night);
	ROUGHNESS = 0.9;
	SPECULAR = 0.2;
}
