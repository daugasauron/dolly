// Fireflies: at night, over the warm wet land that is neither town nor sea, points of
// yellow-green light that wander a little above the ground and come and go (not in rain), twelve for each
// cell of a grid around the flyer. A firefly is a small card that faces the camera; its place
// is a function of the clock.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, skip_vertex_transform;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 36.0;

varying vec2 in_card;
varying float glow;

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	vec2 own = number * 12.0 + float(INSTANCE_ID % 12);
	vec2 home = (number + vec2(hash(own + 3.0), hash(own + 5.0))) * CELL;
	// It wanders around its home, and blinks in its own time.
	vec2 place = home + 5.0 * vec2(sin(clock * 0.31 + hash(own) * 40.0), cos(clock * 0.23 + hash(own + 1.0) * 40.0));
	vec4 here = ground_here(place);
	float lives = step(SEA + 1.5, here.x) * smoothstep(0.5, 0.58, here.z) * smoothstep(0.4, 0.48, here.y) * step(town_at(place, here.x), 0.0);
	float blink = smoothstep(0.55, 0.9, sin(clock * (1.1 + hash(own + 7.0)) + hash(own + 9.0) * 6.2832));
	glow = night * lives * blink * (1.0 - rain_on(place)) * (1.0 - smoothstep(170.0, 230.0, distance(place, flyer)));
	in_card = VERTEX.xy * 2.0;
	vec3 centre = (VIEW_MATRIX * vec4(lift(vec3(place.x, here.x + 1.5 + 4.0 * hash(own + 11.0) + sin(clock * 0.5 + hash(own + 13.0) * 9.0), place.y)), 1.0)).xyz;
	float size = max(0.16, length(centre) * 0.0016) * step(0.001, glow);
	VERTEX = centre + vec3(VERTEX.x, VERTEX.y, 0.0) * 2.0 * size;
}

void fragment() {
	ALBEDO = vec3(0.75, 1.0, 0.25) * glow * 3.0 * (1.0 - smoothstep(0.1, 1.0, length(in_card)));
}
