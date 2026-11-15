// The sea, a mirror for the sky: its colour deepens with the ground under it, which the ground's
// texture gives, and ripples break the reflection. Foam follows the shore and glows at night, as
// do the rings from lit beacons that cross the water.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

uniform vec3 shallow : source_color = vec3(0.05, 0.5, 0.48);
uniform vec3 deep : source_color = vec3(0.004, 0.035, 0.1);
uniform vec3 skims; // the flyer low over the sea: its place (xy) and how low, between 0 and 1 (z)

varying vec3 world_position;

// Three sizes of ripple; a pixel that covers `wide` of the sea sees the mean of those finer than it.
float ripples(vec2 p, float wide) {
	return noise(p * 0.11 + vec2(clock * 0.3, clock * 0.17)) * (1.0 - smoothstep(2.0, 6.0, wide))
		+ 0.5 * noise(p * 0.37 - vec2(clock * 0.4, -clock * 0.3)) * (1.0 - smoothstep(0.6, 1.8, wide))
		+ 0.25 * noise(p * 1.1 + vec2(-clock * 0.5, clock * 0.6)) * (1.0 - smoothstep(0.2, 0.6, wide));
}

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = world_position.xz;
	float depth = max(SEA - ground_here(p).x, 0.0);
	float wide = max(length(dFdx(p)), length(dFdy(p)));
	float here = ripples(p, wide);
	float calm = 1.0 / (1.0 + length(VERTEX) * 0.01);
	vec2 slope = vec2(ripples(p + vec2(0.4, 0.0), wide) - here, ripples(p + vec2(0.0, 0.4), wide) - here) * 0.9 * calm;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
	float foam = smoothstep(1.5, 0.3, depth + (ripples(p, 0.0) - 0.9) * 1.1 * (1.0 - smoothstep(0.5, 3.0, wide)));
	// The flyer's spray: the sea under it is beaten white, and a ring runs out from it.
	float under = distance(p, skims.xy);
	float ring = under - 9.0 - 2.5 * sin(clock * 5.0);
	foam = max(foam, skims.z * max(exp(-under * under / 30.0), 0.6 * exp(-ring * ring / 5.0)));
	// Rain pocks the sea.
	foam = max(foam, 0.25 * rain_on(p) * smoothstep(0.7, 0.9, noise(p * 1.7 + vec2(clock * 0.9, -clock * 0.7))) * (1.0 - smoothstep(0.3, 1.0, wide)));
	vec3 colour = mix(shallow, deep, 1.0 - exp(-depth * 0.2)) * cloud_shade(world_position);
	ALBEDO = mix(colour, vec3(0.9, 0.95, 1.0), foam * 0.8);
	// The ripples a pixel no longer shows still spread the light it reflects.
	ROUGHNESS = mix(0.04 + 0.3 * smoothstep(0.15, 2.5, wide), 0.5, foam);
	SPECULAR = 0.8;
	EMISSION = vec3(0.1, 0.7, 0.9) * foam * here * night * 0.9 + vec3(1.0, 0.55, 0.16) * pulse_light(p) * (0.4 + 0.8 * night);
}
