// Herds: nine animals for a cell of a grid over the land, in three cells of ten, on open
// ground that is neither high nor town: sheep, pale, where it is temperate; antelopes, tan,
// where it is warm; reindeer, grey-brown, in the cold. Each walks a small round of its own on
// the ground, its legs swinging, and nods to graze.
shader_type spatial;
render_mode cull_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 300.0;

varying flat vec3 coat;
varying float part; // 0 the body, 1 the head, 0.5 a leg

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	float animal = float(INSTANCE_ID % 9);
	float own = hash(number * 16.0 + vec2(animal, 7.0));
	vec2 home = (number + 0.3 + 0.4 * vec2(hash(number + 53.0), hash(number + 57.0))) * CELL;
	vec4 here = ground_here(home);
	float open = step(hash(number + 51.0), 0.3) * smoothstep(SEA + 3.0, SEA + 5.0, here.x) * (1.0 - smoothstep(SEA + 45.0, SEA + 55.0, here.x)) * step(town_near(home, here.x), 0.0);
	float round = 2.5 + 3.0 * own;
	float way = own > 0.5 ? 1.0 : -1.0;
	float angle = way * clock * 1.1 / round + own * 40.0;
	vec2 place = home + (5.0 + 16.0 * own) * vec2(cos(animal * 0.7 + own * 6.0), sin(animal * 0.7 + own * 6.0)) + round * vec2(cos(angle), sin(angle));
	vec2 ahead = way * vec2(-sin(angle), cos(angle));
	float ground_height = ground_here(place).x;
	float size = open * step(SEA + 1.0, ground_height) * (1.0 - smoothstep(900.0, 1200.0, far_from(place))) * (0.8 + 0.5 * own);
	coat = here.y < 0.42 ? mix(vec3(0.3, 0.26, 0.22), vec3(0.5, 0.46, 0.4), own) : here.y > 0.52 ? mix(vec3(0.62, 0.42, 0.2), vec3(0.75, 0.55, 0.3), own) : mix(vec3(0.85, 0.83, 0.78), vec3(0.7, 0.66, 0.6), own);
	part = COLOR.r;
	vec3 at = VERTEX;
	// A leg swings from its top; the head nods down to the grass and comes up again.
	at.z += (1.0 - step(0.75, part)) * step(0.25, part) * (1.1 - at.y) * 0.45 * sin(clock * 5.0 + COLOR.g * 3.1416 + own * 9.0);
	at.y -= step(0.75, part) * 0.9 * smoothstep(0.2, 0.8, sin(clock * 0.5 + own * 30.0));
	vec3 forward = vec3(ahead.x, 0.0, ahead.y);
	vec3 right = vec3(-ahead.y, 0.0, ahead.x);
	VERTEX = (right * at.x + vec3(0.0, at.y, 0.0) - forward * at.z) * size + vec3(place.x, ground_height, place.y) - MODEL_MATRIX[3].xyz;
	VERTEX = lift(VERTEX + MODEL_MATRIX[3].xyz) - MODEL_MATRIX[3].xyz;
}

void fragment() {
	ALBEDO = coat * (part > 0.75 ? 0.6 : part > 0.25 ? 0.45 : 1.0);
	ROUGHNESS = 0.9;
	NORMAL = normalize(cross(dFdy(VERTEX), dFdx(VERTEX)));
}
