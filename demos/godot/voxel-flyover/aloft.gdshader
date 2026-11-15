// Balloons: one at most for each cell of a grid in the sky, over the board's ceiling, one cell
// in six. A balloon drifts with the wind across its cell and comes round again unseen, bobs,
// and turns slowly; its envelope has stripes of its own two colours, a basket hangs under it,
// and its burner lights the envelope from inside at night, now and then.
shader_type spatial;
render_mode cull_disabled, shadows_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 520.0;

varying flat float own;
varying vec3 from_centre;
varying flat float seen;

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	own = hash(number + 31.0);
	vec2 home = (number + 0.5) * CELL;
	float along = mod(clock * 5.0 + hash(number + 33.0) * CELL, CELL) - CELL * 0.5;
	vec2 place = home + vec2(0.93, 0.36) * along + vec2(-0.36, 0.93) * (hash(number + 35.0) - 0.5) * CELL * 0.6;
	seen = step(own, 0.17) * smoothstep(CELL * 0.5, CELL * 0.36, abs(along)) * (1.0 - smoothstep(1300.0, 1550.0, distance(place, flyer)));
	float high = max(ground_here(place).x, SEA) + 215.0 + 60.0 * hash(number + 37.0) + 4.0 * sin(clock * 0.3 + own * 50.0);
	from_centre = VERTEX * 2.0;
	// The envelope: a ball that narrows to its mouth; under it the basket, the mesh's lowest part.
	vec3 at = VERTEX * 2.0;
	float narrow = at.y < 0.0 ? 1.0 - 0.55 * at.y * at.y : 1.0;
	at = at.y > -0.92 ? vec3(at.x * narrow, at.y * 1.15, at.z * narrow) * 11.0 : vec3(at.x * 9.0, -17.0 + (at.y + 0.96) * 30.0, at.z * 9.0);
	float turn = clock * 0.1 + own * 9.0;
	at.xz = vec2(at.x * cos(turn) - at.z * sin(turn), at.x * sin(turn) + at.z * cos(turn));
	VERTEX = at * seen + vec3(place.x, high, place.y) - MODEL_MATRIX[3].xyz;
}

void fragment() {
	float around = atan(from_centre.z, from_centre.x);
	vec3 first = 0.5 + 0.5 * cos(6.2832 * (own * 6.0 + vec3(0.0, 0.33, 0.67)));
	vec3 second = 0.5 + 0.5 * cos(6.2832 * (own * 13.0 + vec3(0.2, 0.5, 0.8)));
	float stripe = step(0.5, fract(around * 8.0 / 6.2832 + from_centre.y * (own > 0.08 ? 0.0 : 1.5)));
	bool basket = from_centre.y < -0.92;
	ALBEDO = basket ? vec3(0.35, 0.22, 0.1) : mix(first, second, stripe) * 0.9;
	ROUGHNESS = 0.7;
	float burner = smoothstep(0.6, 1.0, sin(clock * 0.9 + own * 70.0));
	EMISSION = basket ? vec3(0.0) : vec3(1.0, 0.55, 0.2) * ALBEDO * night * (0.25 + 1.6 * burner) * (1.0 - 0.5 * from_centre.y);
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
