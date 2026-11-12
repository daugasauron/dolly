// The metal sea under the course: flowing, crusting and glowing.
shader_type spatial;
render_mode cull_disabled;
#include "res://noise.gdshaderinc"

uniform vec3 hot : source_color = vec3(1.0, 0.55, 0.12);
uniform vec3 white : source_color = vec3(1.0, 0.86, 0.55);
uniform vec3 crust : source_color = vec3(0.05, 0.025, 0.02);

varying vec3 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float swell = fbm(world.xz * 0.05 + TIME * 0.03);
	VERTEX.y += (swell - 0.5) * 0.9;
}

void fragment() {
	vec2 flow = world.xz * 0.09 + vec2(TIME * 0.02, -TIME * 0.035);
	float heat = fbm(flow + fbm(flow * 1.7 - TIME * 0.05) * 1.6);
	float veins = smoothstep(0.42, 0.62, heat);
	float core = smoothstep(0.66, 0.8, heat);
	ALBEDO = mix(crust, crust * 2.0, veins);
	ROUGHNESS = mix(0.95, 0.35, veins);
	METALLIC = 0.2;
	EMISSION = (hot * veins * 2.6 + white * core * 4.0) * (0.85 + 0.15 * sin(TIME * 1.7 + heat * 9.0));
}
