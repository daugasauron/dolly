// A bird of the flock: a strip across its wings (x) that the vertex stage beats, each bird in
// its own time, with a darker back and tips.
shader_type spatial;
render_mode cull_disabled, shadows_disabled;

uniform float clock = 0.0;

varying float out_on_wing;

void vertex() {
	out_on_wing = abs(VERTEX.x) * 2.0;
	float beat = sin(clock * 9.0 + float(INSTANCE_ID) * 1.7);
	VERTEX.y += out_on_wing * out_on_wing * 0.28 * beat + 0.05 * beat;
	VERTEX.z *= 1.0 - 0.6 * out_on_wing;
}

void fragment() {
	ALBEDO = mix(vec3(0.92, 0.93, 0.95), vec3(0.08, 0.09, 0.12), smoothstep(0.55, 0.9, out_on_wing));
	ROUGHNESS = 0.8;
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
