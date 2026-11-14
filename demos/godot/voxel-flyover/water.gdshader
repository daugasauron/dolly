// The sea, a mirror for the sky: its colour deepens with the ground under it, which the ground's
// texture gives, and ripples break the reflection. Foam follows the shore and glows at night, as
// do the rings from lit beacons that cross the water.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

uniform vec3 shallow : source_color = vec3(0.05, 0.5, 0.48);
uniform vec3 deep : source_color = vec3(0.004, 0.035, 0.1);

varying vec3 world_position;

float ripples(vec2 p) {
	return noise(p * 0.11 + vec2(clock * 0.3, clock * 0.17)) + 0.5 * noise(p * 0.37 - vec2(clock * 0.4, -clock * 0.3))
		+ 0.25 * noise(p * 1.1 + vec2(-clock * 0.5, clock * 0.6));
}

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = world_position.xz;
	float depth = max(SEA - ground_here(p).x, 0.0);
	float here = ripples(p);
	float calm = 1.0 / (1.0 + length(VERTEX) * 0.01);
	vec2 slope = vec2(ripples(p + vec2(0.4, 0.0)) - here, ripples(p + vec2(0.0, 0.4)) - here) * 0.9 * calm;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
	float foam = smoothstep(1.5, 0.3, depth + (here - 0.9) * 1.1);
	vec3 colour = mix(shallow, deep, 1.0 - exp(-depth * 0.2)) * cloud_shade(world_position);
	ALBEDO = mix(colour, vec3(0.9, 0.95, 1.0), foam * 0.8);
	ROUGHNESS = mix(0.04, 0.5, foam);
	SPECULAR = 0.8;
	EMISSION = vec3(0.1, 0.7, 0.9) * foam * here * night * 0.9 + vec3(1.0, 0.55, 0.16) * pulse_light(p) * (0.4 + 0.8 * night);
}
