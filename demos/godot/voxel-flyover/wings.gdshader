// The birds of a place: nine for each cell of a grid in the air. Over a coast they are gulls
// that wheel round a point of it; over land in spring and in autumn, in some cells, geese that
// cross the sky in a wedge along the wind. Elsewhere a cell has none. Each is a strip across
// its wings that the vertex stage beats, in its own time.
shader_type spatial;
render_mode cull_disabled, shadows_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 360.0;

varying float out_on_wing;
varying flat float dark;

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	float bird = float(INSTANCE_ID % 9);
	float own = hash(number * 16.0 + vec2(bird, 3.0));
	vec2 home = (number + 0.3 + 0.4 * vec2(hash(number + 3.0), hash(number + 11.0))) * CELL;
	float ground_height = ground_here(home).x;
	float fade = 1.0 - smoothstep(1250.0, 1500.0, far_from(home));
	vec3 place = vec3(0.0);
	vec2 ahead = vec2(1.0, 0.0);
	float size = 0.0;
	float lean = 0.0;
	dark = 0.0;
	if (abs(ground_height - SEA) < 5.0) {
		// Gulls: round and round over the shore, each at its own distance and height.
		float round = 16.0 + 16.0 * own;
		float angle = clock * 9.0 / round + bird * 0.7 + own * 6.0;
		place = vec3(home.x + round * cos(angle), SEA + 20.0 + 14.0 * own + 2.0 * sin(clock * 0.6 + bird), home.y + round * sin(angle));
		ahead = vec2(-sin(angle), cos(angle));
		size = 1.0;
		lean = 0.5;
		dark = 0.0;
	} else if (ground_height > SEA && hash(number + 21.0) < 0.4 * max(spring, autumn)) {
		// Geese: a wedge that crosses its cell along the wind, and comes round again unseen.
		vec2 wind = vec2(0.93, 0.36);
		float along = mod(clock * 16.0 + hash(number + 23.0) * CELL, CELL) - CELL * 0.5;
		float row = floor((bird + 1.0) * 0.5);
		float side = mod(bird, 2.0) * 2.0 - 1.0;
		vec2 at = home + wind * (along - row * 3.2) + vec2(-wind.y, wind.x) * side * row * 2.6;
		place = vec3(at.x, max(ground_height, SEA) + 95.0 + 30.0 * hash(number + 25.0) + 0.6 * sin(clock * 1.1 + bird), at.y);
		ahead = wind;
		size = 1.5 * smoothstep(CELL * 0.5, CELL * 0.38, abs(along));
		dark = 1.0;
	}
	out_on_wing = abs(VERTEX.x) * 2.0;
	float beat = sin(clock * (dark > 0.5 ? 7.0 : 5.0) + bird * 1.7 + own * 5.0);
	vec3 at_bird = VERTEX;
	at_bird.y += out_on_wing * out_on_wing * 0.28 * beat + 0.05 * beat - lean * at_bird.x * 0.4;
	at_bird.z *= 1.0 - 0.6 * out_on_wing;
	vec3 forward = vec3(ahead.x, 0.0, ahead.y);
	vec3 right = vec3(-ahead.y, 0.0, ahead.x);
	VERTEX = (right * at_bird.x + vec3(0.0, at_bird.y, 0.0) - forward * at_bird.z) * size * fade * 1.4 + place - MODEL_MATRIX[3].xyz;
	VERTEX = lift(VERTEX + MODEL_MATRIX[3].xyz) - MODEL_MATRIX[3].xyz;
}

void fragment() {
	ALBEDO = mix(mix(vec3(0.92, 0.93, 0.95), vec3(0.3, 0.27, 0.24), dark), vec3(0.08, 0.09, 0.12), smoothstep(0.55, 0.9, out_on_wing));
	ROUGHNESS = 0.8;
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
