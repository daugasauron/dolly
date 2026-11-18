// Fireworks over a town at night: for each cell of a grid that has a town, now and then (one
// seven-second turn in three) a shell rises for a second, a short streak, and bursts over it:
// 48 sparks that fly out from a point, slow, sink, twinkle and fade, in the shell's own colour; over a town of
// red posts and upturned eaves, lanterns that rise all night. A spark is a small card that faces the
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
	float lantern = 1.0;
	// A town of red posts and upturned eaves (town_kind 4) sends up lanterns instead, all night: each
	// of the cell's 48 rises from its roofs for a minute and a half to some 400 units, drifting
	// with the wind, a warm glow that flickers, and fades as it goes.
	vec4 town_here = ground_here((number + 0.5) * CELL);
	if (town_from(town_here.w, town_here.x) > 0.3 && town_kind((number + 0.5) * CELL, town_here.x, town_here.yz) == 4) {
		float rise = fract(clock / 90.0 + hash(vec2(spark, 3.0) + number));
		vec2 from = (number + 0.15 + 0.7 * vec2(hash(vec2(spark, 5.0) + number), hash(vec2(spark, 9.0) + number))) * CELL;
		place = vec3(from.x, town_here.x + 12.0 + 400.0 * rise, from.y) + vec3(0.93, 0.0, 0.36) * rise * 160.0;
		glow = vec3(1.0, 0.5, 0.16) * (0.75 + 0.25 * sin(clock * 3.0 + spark * 1.7)) * night * (1.0 - smoothstep(1300.0, 1600.0, far_from(from))) * (1.0 - smoothstep(0.7, 1.0, rise)) * smoothstep(0.0, 0.03, rise) * 3.0;
		lantern = 1.6;
	}
	in_card = VERTEX.xy * 2.0;
	vec3 centre = (VIEW_MATRIX * vec4(lift(place), 1.0)).xyz;
	float size = max(1.5 * lantern, length(centre) * 0.0042) * step(0.001, max(glow.r, max(glow.g, glow.b)));
	VERTEX = centre + vec3(VERTEX.x, VERTEX.y, 0.0) * 2.0 * size;
}

void fragment() {
	ALBEDO = glow * (1.0 - smoothstep(0.1, 1.0, length(in_card)));
}
