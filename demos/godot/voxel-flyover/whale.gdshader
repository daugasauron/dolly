// Whales: one at most for each cell of a grid over the deep sea, one cell in five. A whale
// swims a wide round, rises until its back shows, blows, and goes under again, every 24
// seconds; the same mesh's last instance of three is its spout, a pale column that stands for
// two of those seconds.
shader_type spatial;
render_mode shadows_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 420.0;

varying flat float spout;
varying vec3 from_centre;

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	float own = hash(number + 41.0);
	float part = float(INSTANCE_ID % 3);
	vec2 home = (number + 0.3 + 0.4 * vec2(hash(number + 43.0), hash(number + 45.0))) * CELL;
	float round = 70.0;
	float angle = clock * 4.0 / round + own * 30.0;
	vec2 place = home + round * vec2(cos(angle), sin(angle));
	vec2 ahead = vec2(-sin(angle), cos(angle));
	float depth = SEA - ground_here(place).x;
	float there = step(own, 0.2) * smoothstep(9.0, 16.0, depth) * (1.0 - smoothstep(1100.0, 1350.0, distance(place, flyer)));
	// Its round of 24 seconds: up for five of them.
	float when = mod(clock + own * 240.0, 24.0);
	float up = smoothstep(0.0, 2.0, when) * (1.0 - smoothstep(3.5, 5.5, when));
	spout = step(1.5, part);
	from_centre = VERTEX * 2.0;
	vec3 forward = vec3(ahead.x, 0.0, ahead.y);
	vec3 right = vec3(-ahead.y, 0.0, ahead.x);
	vec3 at;
	float high;
	if (part < 0.5) {
		// The body, long and rounded.
		at = VERTEX * 2.0 * vec3(3.4, 2.6, 11.0);
		high = SEA - 3.6 + 3.2 * up;
	} else if (part < 1.5) {
		// The flukes, flat, behind it; they lift last.
		at = VERTEX * 2.0 * vec3(4.2, 0.35, 1.6) + vec3(0.0, 0.0, 11.5);
		high = SEA - 4.5 + 5.5 * smoothstep(3.0, 4.2, when) * (1.0 - smoothstep(4.6, 5.6, when));
	} else {
		float blows = smoothstep(1.6, 2.0, when) * (1.0 - smoothstep(2.6, 3.8, when));
		at = VERTEX * 2.0 * vec3(0.9, 4.5, 0.9) * blows + vec3(0.0, 4.0 * blows, -6.5);
		high = SEA + 0.5;
	}
	VERTEX = (right * at.x + vec3(0.0, at.y, 0.0) - forward * at.z) * there * 1.3 + vec3(place.x, high, place.y) - MODEL_MATRIX[3].xyz;
}

void fragment() {
	ALBEDO = spout > 0.5 ? vec3(0.85, 0.9, 0.95) : mix(vec3(0.05, 0.07, 0.1), vec3(0.3, 0.33, 0.36), smoothstep(0.2, -0.6, from_centre.y));
	ROUGHNESS = spout > 0.5 ? 1.0 : 0.25;
}
