// What grows: a trunk and a round crown for each plot of a grid that follows the flight. The
// vertex stage stands the tree on the ground of its place, or leaves it out where the ground is
// steep, bare or sea, and the climate shapes the crown: tall firs in the cold, broad heads in the
// wet, in places in blossom or in autumn colours, slender glowing spires in the desert, and groves
// whose crowns glow at night. The fragment stage roughens the crown's light as foliage does.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

uniform float plot = 4.0;
// The grid of finer trees draws the plots within this of its middle; the coarser grid leaves them.
uniform vec2 near_middle;
uniform float near = 0.0;
uniform bool coarse = false;
// How far from the grid's middle the trees end.
uniform float end = 250.0;

varying flat vec3 colour;
varying flat float glow;
varying float crown; // 0 on the trunk; on the crown, from just over 0 at its foot to 1 at its tip
varying vec3 world;

void vertex() {
	vec2 corner = floor(MODEL_MATRIX[3].xz / plot) * plot;
	float chance = hash(corner);
	float kind = hash(corner + 311.0);
	vec2 place = corner + vec2(hash(corner + 91.0), hash(corner + 173.0)) * plot;
	vec2 from_near = abs(corner + plot * 0.5 - near_middle);
	bool finer = max(from_near.x, from_near.y) < near;
	vec4 here = ground_here(place);
	float top = here.x;
	float warmth = here.y;
	float moisture = here.z;
	float steep = abs(ground_here(place + vec2(2.0, 0.0)).x - ground_here(place - vec2(2.0, 0.0)).x)
		+ abs(ground_here(place + vec2(0.0, 2.0)).x - ground_here(place - vec2(0.0, 2.0)).x);
	float snowline = SEA + 78.0 - (0.5 - warmth) * 70.0;
	bool desert = warmth > 0.57 && moisture < 0.47;
	bool cold = warmth < 0.42;
	float density = desert ? 0.12 : cold ? 0.5 : mix(0.1, 0.7, smoothstep(0.35, 0.62, moisture));
	float size = (0.75 + 0.7 * kind) * smoothstep(1.0, 0.8, distance(place, NODE_POSITION_WORLD.xz) / end);
	bool leafy = VERTEX.y > 0.95;
	// On the crown's unit sphere: its height from foot to tip.
	vec3 ball = VERTEX - vec3(0.0, 2.0, 0.0);
	float up = ball.y * 0.5 + 0.5;
	colour = vec3(0.0);
	glow = 0.0;
	crown = leafy ? 0.02 + 0.98 * up : 0.0;
	if (finer == coarse || top < SEA + 2.0 || top > snowline - 16.0 || steep > 3.4 || chance > density || size <= 0.0) {
		VERTEX = vec3(0.0);
	} else {
		bool lit = !desert && noise(place / 190.0 + vec2(57.0, 201.0)) > 0.66;
		vec3 at;
		vec3 facing = NORMAL;
		if (!leafy) {
			at = VERTEX * vec3(0.16, desert ? 0.0 : cold ? 1.6 : 2.6, 0.16);
			colour = lit ? vec3(0.1, 0.11, 0.16) : vec3(0.1, 0.06, 0.04);
		} else {
			vec2 around = length(ball.xz) > 0.001 ? normalize(ball.xz) : vec2(0.0);
			if (desert) {
				// A spire: slender, swelling a little above its foot.
				float wide = 0.34 * sin(up * 3.1416) * (1.0 - 0.45 * up) + 0.03;
				at = vec3(around.x * wide, up * 5.2, around.y * wide);
				facing = normalize(vec3(around.x, 0.25, around.y));
				colour = mix(vec3(1.0, 0.45, 0.2), vec3(0.95, 0.2, 0.45), kind);
				glow = 0.35;
			} else if (cold) {
				// A fir: boughs in tiers that narrow to the tip.
				float wide = (1.0 - up) * (1.05 + 0.3 * sin(up * 21.0 + kind * 6.0)) * step(0.001, up) + 0.02;
				at = vec3(around.x * wide, 1.0 + up * 6.2, around.y * wide);
				facing = normalize(vec3(around.x, 0.45, around.y));
				colour = mix(vec3(0.01, 0.09, 0.08), vec3(0.03, 0.15, 0.1), kind);
			} else {
				// A broad head, lumpy as a crown of leaves is.
				float lump = sin(ball.x * 3.3 + kind * 40.0) * sin(ball.y * 2.9 + kind * 17.0) * sin(ball.z * 3.1 + kind * 29.0);
				at = ball * (1.0 + 0.32 * lump) * vec3(1.9, 1.35, 1.9) + vec3(0.0, 3.4, 0.0);
				facing = normalize(ball + vec3(0.0, 0.25, 0.0));
				if (noise(place / 240.0 + vec2(7.0, 61.0)) > 0.6) {
					colour = kind < 0.4 ? vec3(0.8, 0.2, 0.02) : kind < 0.75 ? vec3(0.85, 0.45, 0.03) : vec3(0.45, 0.03, 0.05);
				} else if (noise(place / 200.0 + vec2(131.0, 23.0)) > 0.64) {
					colour = mix(vec3(0.9, 0.3, 0.45), vec3(1.0, 0.6, 0.7), kind);
				} else {
					colour = mix(vec3(0.02, 0.2, 0.1), vec3(0.12, 0.3, 0.05), kind);
				}
			}
			if (lit) {
				colour = mix(vec3(0.05, 0.85, 0.9), vec3(0.65, 0.2, 1.0), kind);
				glow = 1.0;
			}
			// The wind.
			at.xz += sin(clock * 1.4 + place.x * 0.21 + place.y * 0.17) * 0.03 * at.y;
		}
		colour *= cloud_shade(vec3(place.x, top, place.y));
		NORMAL = facing;
		VERTEX = at * size + vec3(place.x, top - 0.15, place.y) - MODEL_MATRIX[3].xyz;
	}
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float leafy = step(0.001, crown);
	// Leaves: clumps lighter and darker, deeper toward the crown's foot and inside, and a light
	// that does not fall as on a smooth ball.
	float clump = noise(world.xz * 1.9 + world.y * 1.3);
	float fleck = noise(world.zy * 2.3 + world.x * 1.7);
	vec3 shade = colour * mix(1.0, (0.55 + 0.6 * crown) * (0.78 + 0.44 * clump), leafy);
	float edge = pow(1.0 - abs(dot(NORMAL, VIEW)), 2.0);
	ALBEDO = (shade + colour * edge * 0.2 * leafy) * (1.0 - 0.5 * glow);
	EMISSION = colour * glow * (0.1 + 1.5 * night) * mix(0.5, 1.0, crown);
	ROUGHNESS = glow > 0.2 ? 0.3 : 0.85;
	SPECULAR = 0.3;
	BACKLIGHT = colour * 0.35 * leafy;
	NORMAL = normalize(NORMAL + (vec3(clump, fleck, clump * fleck * 2.0) - 0.5) * 0.7 * leafy);
}
