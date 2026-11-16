// A thermal: the warm air that rises over a town by day, shown as faint bands that wind up a
// column and carry the board up with them. Added to what is behind it, soft at its sides, foot
// and head, and thinning before the camera.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform float strength = 0.0;
uniform float clock = 0.0;

void fragment() {
	float up = UV.y * 2.0; // a tube's side has the upper half of the texture: 0 at its head
	float band = fract(UV.x * 5.0 + up * 1.5 + clock * 0.2);
	float wide = fwidth(UV.x * 5.0) + 0.02;
	float streak = smoothstep(0.0, wide + 0.06, band) * (1.0 - smoothstep(0.1, 0.34 + wide, band));
	float facing = abs(dot(normalize(NORMAL), VIEW));
	ALBEDO = vec3(1.0, 0.95, 0.85);
	ALPHA = streak * strength * 0.16 * facing * smoothstep(0.0, 0.25, up) * smoothstep(1.0, 0.7, up) * smoothstep(8.0, 50.0, length(VERTEX));
}
