// A beacon's shaft of light: brightest at its foot and along its middle, added to what is behind it.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec3 colour : source_color = vec3(1.0);
uniform float strength = 1.0;

varying float up;

void vertex() {
	up = VERTEX.y + 80.0; // the shaft is 160 tall, and this its height over its foot
}

void fragment() {
	float middle = abs(dot(NORMAL, VIEW));
	ALBEDO = colour * strength * 2.0;
	ALPHA = middle * middle * exp(-up / 45.0);
}
