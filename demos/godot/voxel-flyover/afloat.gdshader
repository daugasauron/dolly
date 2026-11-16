// Boats: one at most for each cell of a grid over the sea, more of them off a town. A boat sails
// a round of its own at three units a second, heading along it, rocking on the swell, its sail
// filled; it is smaller the shallower the water under it, and none sails onto a shore. Its hull
// and its sail have the colours of its own number; a lamp at its bow is lit at night.
shader_type spatial;
render_mode cull_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 180.0;

varying flat float own;
varying float part; // 0 the hull, 0.5 the mast, 0.75 the lamp, 1 the sail

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	own = hash(number + 5.0);
	vec2 home = (number + 0.25 + 0.5 * vec2(hash(number + 3.0), hash(number + 11.0))) * CELL;
	float harbour = smoothstep(0.5, 0.6, settled(home));
	float round = 16.0 + 22.0 * hash(number + 7.0);
	float way = hash(number + 9.0) > 0.5 ? 1.0 : -1.0;
	float angle = way * clock * 3.0 / round + own * 40.0;
	vec2 place = home + round * vec2(cos(angle), sin(angle));
	vec2 ahead = way * vec2(-sin(angle), cos(angle));
	float depth = SEA - ground_here(place).x;
	float size = step(own, 0.22 + 0.6 * harbour) * smoothstep(1.5, 5.0, depth) * (1.0 - smoothstep(1150.0, 1400.0, distance(place, flyer))) * (1.7 + 1.3 * hash(number + 13.0));
	part = COLOR.r;
	vec3 at = VERTEX;
	// The sail fills away from its mast.
	at.x += step(0.9, part) * 0.45 * (at.z + 0.6) * (1.0 + 0.2 * sin(clock * 1.7 + own * 9.0));
	// The swell rocks it.
	at.y += 0.25 * sin(clock * 1.3 + own * 40.0) + at.x * 0.12 * sin(clock * 1.1 + own * 17.0);
	vec3 forward = vec3(ahead.x, 0.0, ahead.y);
	vec3 right = vec3(-ahead.y, 0.0, ahead.x);
	VERTEX = (right * at.x + vec3(0.0, at.y, 0.0) - forward * at.z) * size + vec3(place.x, SEA - 0.1, place.y) - MODEL_MATRIX[3].xyz;
}

void fragment() {
	vec3 hull = own < 0.33 ? vec3(0.45, 0.2, 0.08) : own < 0.66 ? vec3(0.1, 0.3, 0.5) : vec3(0.85, 0.82, 0.75);
	vec3 sail = fract(own * 7.0) < 0.3 ? vec3(0.62, 0.16, 0.08) : vec3(0.93, 0.9, 0.82);
	ALBEDO = part > 0.9 ? sail : part > 0.6 ? vec3(1.0, 0.8, 0.4) : part > 0.3 ? vec3(0.2, 0.12, 0.06) : hull;
	EMISSION = (part > 0.6 && part < 0.9) ? vec3(1.0, 0.75, 0.35) * 3.0 * night : vec3(0.0);
	ROUGHNESS = 0.8;
	NORMAL = normalize(cross(dFdy(VERTEX), dFdx(VERTEX)));
}
