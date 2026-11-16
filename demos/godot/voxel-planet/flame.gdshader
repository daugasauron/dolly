// A jet's flame: a cone of light from the nozzle (y = -1) to its tip (y = 1), added to what is
// behind it, soft at its sides and toward its tip. Rings of brighter gas run down it, one for
// each stroke of the pelican's legs.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec3 colour : source_color = vec3(0.25, 0.7, 1.6);
uniform float strokes = 0.0; // of the pelican's legs so far

varying float along;

void vertex() {
	along = VERTEX.y * 0.5 + 0.5;
}

void fragment() {
	float facing = abs(dot(normalize(NORMAL), VIEW));
	ALBEDO = colour * (0.8 + 0.3 * cos(6.2832 * (strokes - along * 1.6)));
	ALPHA = facing * sqrt(facing) * (1.0 - along) * 1.6;
}
