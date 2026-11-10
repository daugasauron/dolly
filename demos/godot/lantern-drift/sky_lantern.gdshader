// The sky lanterns drifting around the course: each bobs and flickers on its own phase.
shader_type spatial;
render_mode unshaded, shadows_disabled;

uniform vec3 glow : source_color = vec3(1.0, 0.58, 0.24);

varying float phase;

void vertex() {
	phase = float(INSTANCE_ID) * 1.73;
	VERTEX.y += sin(TIME * 0.8 + phase) * 0.3;
}

void fragment() {
	float flicker = 0.85 + 0.15 * sin(TIME * 9.0 + phase * 3.0);
	ALBEDO = glow;
	EMISSION = glow * 3.5 * flicker;
}
