// Fireworks over a town at night: for each cell of a grid that has a town, now and then (one
// seven-second turn in three) a shell rises for a second, a short streak, and bursts over it:
// 48 sparks that fly out from a point, slow, sink, twinkle and fade, in the shell's own colour. A spark is a small card that faces the
// camera. Nothing is kept: a spark's place is a function of the clock.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled, skip_vertex_transform;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 200.0;

varying vec2 in_card;
varying vec3 glow;

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	float spark = float(INSTANCE_ID % 48);
	float turn = floor(clock / 7.0 + hash(number + 61.0));
	float since = fract(clock / 7.0 + hash(number + 61.0)) * 7.0;
	vec2 home = (number + 0.2 + 0.6 * vec2(hash(number + turn), hash(number + turn + 7.0))) * CELL;
	vec4 here = ground_here(home);
	float show = step(hash(number + turn * 3.0 + 5.0), 0.3) * step(0.3, town_from(here.w, here.x)) * night * (1.0 - smoothstep(1300.0, 1600.0, far_from(home)));
	// A spark's way out of the burst: its own direction, slowing; it sinks as it goes.
	float a = hash(vec2(spark, turn)) * 6.2832;
	float b = hash(vec2(turn, spark)) * 2.0 - 1.0;
	vec3 way = vec3(cos(a) * sqrt(1.0 - b * b), b, sin(a) * sqrt(1.0 - b * b));
	float burst = max(since - 1.0, 0.0);
	float risen = 1.0 - (1.0 - min(since, 1.0)) * (1.0 - min(since, 1.0));
	float out_to = 60.0 * (1.0 - exp(-burst * 1.6));
	// On the way up the first twelve sparks are the shell's streak, one behind another.
	vec3 place = vec3(home.x, here.x + (70.0 + 30.0 * hash(number + turn + 9.0)) * risen - (burst > 0.0 ? 0.0 : spark * 0.5), home.y) + way * out_to - vec3(0.0, burst * burst * 1.6, 0.0);
	float life = burst > 0.0 ? (1.0 - smoothstep(1.6, 3.6, burst)) * (0.65 + 0.35 * sin(clock * 31.0 + spark * 2.4) * smoothstep(1.0, 2.0, burst)) : 0.4 * step(spark, 11.5);
	glow = (0.5 + 0.5 * cos(6.2832 * (hash(number + turn + 11.0) + vec3(0.0, 0.33, 0.67)))) * show * life * 4.0;
	in_card = VERTEX.xy * 2.0;
	vec3 centre = (VIEW_MATRIX * vec4(lift(place), 1.0)).xyz;
	float size = max(1.5, length(centre) * 0.0042) * step(0.001, show * life);
	VERTEX = centre + vec3(VERTEX.x, VERTEX.y, 0.0) * 2.0 * size;
}

void fragment() {
	ALBEDO = glow * (1.0 - smoothstep(0.1, 1.0, length(in_card)));
}
