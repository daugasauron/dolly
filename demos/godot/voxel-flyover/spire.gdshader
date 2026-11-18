// The spires of an old world (main.gd's spires, landmarks.gd's spire_mesh): their colours in
// their vertices, alpha 1 where they glow at night, as a landmark's (baked.gdshader). They are
// carried onto the sphere, and grow out of nothing as the flight comes within 24,000 units of one,
// and go back as it climbs over 25,000.
shader_type spatial;
render_mode cull_disabled, skip_vertex_transform;
#include "res://terrain.gdshaderinc"

void vertex() {
	vec3 foot = MODEL_MATRIX[3].xyz;
	float seen = (1.0 - smoothstep(19000.0, 24000.0, distance(foot.xz, flyer_over))) * (1.0 - smoothstep(25000.0, 40000.0, altitude));
	vec3 world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	VERTEX = (VIEW_MATRIX * vec4(lift(foot + (world - foot) * seen), 1.0)).xyz;
	NORMAL = normalize((VIEW_MATRIX * vec4(mat3(MODEL_MATRIX) * NORMAL, 0.0)).xyz);
}

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.75;
	EMISSION = COLOR.rgb * COLOR.a * (0.3 + 4.0 * night);
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
