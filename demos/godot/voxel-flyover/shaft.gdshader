// A beacon's shaft of light: brightest at its foot and along its middle, added to what is behind it.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec3 colour : source_color = vec3(1.0);
uniform float strength = 1.0;

varying float up;
varying float thin;

void vertex() {
	up = VERTEX.y + 80.0; // the shaft is 160 tall, and this its height over its foot
	// From afar it is never thinner than a few pixels, which would flicker; it is as much fainter.
	float wide = max(1.0, length((MODELVIEW_MATRIX * vec4(0.0, VERTEX.y, 0.0, 1.0)).xyz) * 0.0022);
	VERTEX.xz *= wide;
	thin = 1.0 / wide;
}

void fragment() {
	float middle = abs(dot(NORMAL, VIEW));
	ALBEDO = colour * strength * 2.0;
	// It thins before the camera, which may fly through it.
	ALPHA = middle * middle * exp(-up / 45.0) * thin * smoothstep(3.0, 22.0, length(VERTEX));
}
