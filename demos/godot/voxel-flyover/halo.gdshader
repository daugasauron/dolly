// The haze of light around each cloud to fly through (wisp.gdshader draws the cloud): a smooth
// ball two and a half times as wide, added to what is behind it, brightest where it is seen
// through its middle, in the colours that swirl through the cloud. The sparks are not drawn here.
shader_type spatial;
render_mode skip_vertex_transform, unshaded, blend_add, depth_draw_never, cull_back, fog_disabled, shadows_disabled;

#include "res://wisp.gdshaderinc"

varying vec3 tint;
varying float glow;
varying vec3 inside;

void vertex() {
	glow = wisp_glow(COLOR.w, INSTANCE_CUSTOM);
	tint = wisp_tint(COLOR.x);
	inside = VERTEX;
	vec3 drawn = lift(MODEL_MATRIX[3].xyz);
	float size = UV2.x > 0.5 ? 0.0 : wisp_size(glow, drawn, length(MODEL_MATRIX[0].xyz), VIEW_MATRIX);
	VERTEX = (VIEW_MATRIX * vec4(drawn + VERTEX * 2.5 * size, 1.0)).xyz;
	NORMAL = normalize((VIEW_MATRIX * vec4(inside, 0.0)).xyz);
}

void fragment() {
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	vec3 colour = mix(tint, rainbow(inside.y * 0.4 + clock * 0.25), 0.6);
	// By day a light haze, which only whitens a bright sky; by night a glow that is seen afar. Over
	// the cloud itself (the middle two fifths of the haze across) it is dim, so as not to whiten it.
	float around = pow(facing, 1.5) * (1.0 - 0.8 * smoothstep(0.86, 0.95, facing));
	ALBEDO = colour * around * (0.08 + 0.4 * night) * min(glow, 2.6);
}
