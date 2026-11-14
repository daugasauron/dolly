// The sea: its colour deepens with the ground under it, which the terrain's function gives, foam
// follows the shore's blocks, and two layers of ripples carry the sun's glitter and the sky.
shader_type spatial;
#include "res://terrain.gdshaderinc"

uniform vec3 shallow : source_color = vec3(0.1, 0.62, 0.6);
uniform vec3 deep : source_color = vec3(0.015, 0.12, 0.3);

varying vec3 world_position;

float ripples(vec2 p) {
	return noise(p * 0.22 + vec2(TIME * 0.35, TIME * 0.21)) + 0.5 * noise(p * 0.57 - vec2(TIME * 0.4, -TIME * 0.3))
		+ 0.25 * noise(p * 1.3 + vec2(-TIME * 0.5, TIME * 0.6));
}

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = world_position.xz;
	float ground = terrain_height(floor(p) + 0.5);
	float depth = max(SEA - ground, 0.0);
	float here = ripples(p);
	float distance_fade = 1.0 / (1.0 + length(VERTEX) * 0.012);
	vec2 slope = vec2(ripples(p + vec2(0.3, 0.0)) - here, ripples(p + vec2(0.0, 0.3)) - here) * 1.4 * distance_fade;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
	vec3 colour = mix(shallow, deep, 1.0 - exp(-depth * 0.16));
	// Foam where the water is a block deep or less, breathing with the ripples.
	float foam = smoothstep(1.6, 0.6, depth + (here - 0.9) * 1.2);
	colour = mix(colour, vec3(0.95, 0.98, 1.0), foam * 0.85);
	ALBEDO = colour;
	ROUGHNESS = mix(0.07, 0.6, foam);
	METALLIC = 0.0;
	SPECULAR = 0.7;
}
