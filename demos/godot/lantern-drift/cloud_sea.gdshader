// The sea of clouds below the islands: domain-warped noise, its crests lit warm by the low sun
// and shaded by their own slopes, paling toward the horizon as the sky does. Its plane follows
// the glider; the pattern stays put in the world. Unshadowed: the low sun's long island shadows
// broke it into blocks.
shader_type spatial;
render_mode specular_disabled, shadows_disabled;
#include "res://noise.gdshaderinc"

uniform vec3 shade : source_color = vec3(0.27, 0.15, 0.32);
uniform vec3 crest : source_color = vec3(1.0, 0.66, 0.52);
uniform vec3 horizon : source_color = vec3(0.98, 0.6, 0.48);

varying vec3 world_position;

float clouds(vec2 p) {
	vec2 warp = vec2(fbm(p + vec2(0.0, TIME * 0.02), 3), fbm(p + vec2(5.2, 1.3), 3));
	return fbm(p + warp * 1.6, 5);
}

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = world_position.xz * 0.008 + vec2(TIME * 0.006, TIME * 0.015);
	float c = clouds(p);
	// The slope toward the sun, ahead of the glider (-z), lights a crest.
	float toward_sun = clouds(p + vec2(0.0, -0.02)) - c;
	float lit = smoothstep(0.38, 0.7, c);
	vec3 color = mix(shade, crest, lit) * (0.8 + clamp(toward_sun * 18.0, -0.3, 0.6));
	float far = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	ALBEDO = mix(color, horizon, pow(far, 4.0) * 0.8);
	ROUGHNESS = 1.0;
	EMISSION = crest * lit * 0.15;
}
