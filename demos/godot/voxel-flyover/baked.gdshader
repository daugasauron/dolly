// What is built of many painted parts and stands still (a landmark) is one mesh, its parts'
// colours in its vertices; the alpha of a vertex's colour says that its part glows at night.
shader_type spatial;
render_mode cull_disabled;

uniform float night = 0.0;

void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.75;
	EMISSION = COLOR.rgb * COLOR.a * (0.15 + 3.0 * night);
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
