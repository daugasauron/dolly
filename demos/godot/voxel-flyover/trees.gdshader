// What grows: a trunk and a round crown for each plot of a grid that follows the flight. The
// vertex stage stands the tree on the ground of its place, or leaves it out where the ground is
// steep, bare or sea, and the climate shapes the crown: tall firs in the cold, broad heads in the
// wet, in places in blossom or in autumn colours, slender glowing spires in the desert, and groves
// whose crowns glow at night. The fragment stage roughens the crown's light as foliage does.
//
// Several grids draw the same trees, each with a mesh of less detail over a ring further from
// the flyer. Where two rings overlap, the coarser tree grows inside the finer, which then draws back,
// so no tree appears or goes at once and none is thinned pixel by pixel; past the last ring
// land.gdshader paints the crowns.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"
#include "res://flora.gdshaderinc"

// How far from the flyer this grid's trees fill in (from x to y) and thin out (from z to w).
uniform vec4 ring = vec4(-2.0, -1.0, 64.0, 80.0);
uniform bool sinks = false; // the last grid of trees, and the shadows'
uniform vec3 eye; // where the camera is

varying flat vec3 colour;
varying flat float glow;
varying float crown; // 0 on the trunk; on the crown, from just over 0 at its foot to 1 at its tip
varying vec3 world;

void vertex() {
	vec4 tree = plot_tree(MODEL_MATRIX[3].xz);
	vec2 place = tree.xy;
	float kind = tree.w;
	float away = distance(place, flyer);
	float come = smoothstep(ring.x, ring.y, away);
	float gone = smoothstep(ring.z, ring.w, away);
	// A plot outside the grid's ring has no tree here: its ground is not looked up.
	bool in_ring = come > 0.0 && gone < 1.0;
	vec4 here = in_ring ? ground_here(place) : vec4(0.0);
	float top = here.x;
	float warmth = here.y;
	float moisture = here.z;
	float steep = 100.0;
	if (in_ring) {
		steep = abs(ground_here(place + vec2(4.0, 0.0)).x - top) + abs(ground_here(place + vec2(0.0, 4.0)).x - top);
	}
	bool desert = is_desert(warmth, moisture);
	bool cold = is_cold(warmth);
	bool leafy = VERTEX.y > 0.95;
	// On the crown's unit sphere: its height from foot to tip.
	vec3 ball = VERTEX - vec3(0.0, 2.0, 0.0);
	float up = ball.y * 0.5 + 0.5;
	colour = vec3(0.0);
	glow = 0.0;
	crown = leafy ? 0.02 + 0.98 * up : 0.0;
	if (come <= 0.0 || gone >= 1.0 || !grows(top, warmth) || steep > 3.4 || tree.z > tree_share(warmth, moisture) * (1.0 - town_at(place, top))) {
		VERTEX = vec3(0.0);
	} else {
		vec4 leaves = crown_colour(place, kind, warmth, moisture);
		vec3 at;
		vec3 facing = NORMAL;
		if (!leafy) {
			at = VERTEX * vec3(0.16, desert ? 0.0 : cold ? 1.6 : 2.6, 0.16);
			colour = leaves.a > 0.9 ? vec3(0.1, 0.11, 0.16) : vec3(0.1, 0.06, 0.04);
		} else {
			vec2 around = length(ball.xz) > 0.001 ? normalize(ball.xz) : vec2(0.0);
			float wide = crown_width(warmth, moisture);
			if (desert) {
				// A spire: slender, swelling a little above its foot.
				float swell = wide * sin(up * 3.1416) * (1.0 - 0.45 * up) + 0.03;
				at = vec3(around.x * swell, up * 5.2, around.y * swell);
				facing = normalize(vec3(around.x, 0.25, around.y));
			} else if (cold) {
				// A fir: boughs in tiers that narrow to the tip.
				float boughs = (1.0 - up) * (wide - 0.15 + 0.3 * sin(up * 21.0 + kind * 6.0)) * step(0.001, up) + 0.02;
				at = vec3(around.x * boughs, 1.0 + up * 6.2, around.y * boughs);
				facing = normalize(vec3(around.x, 0.45, around.y));
			} else {
				// A broad head, lumpy as a crown of leaves is.
				float lump = sin(ball.x * 3.3 + kind * 40.0) * sin(ball.y * 2.9 + kind * 17.0) * sin(ball.z * 3.1 + kind * 29.0);
				at = ball * (1.0 + 0.32 * lump) * vec3(wide - 0.3, 1.35, wide - 0.3) + vec3(0.0, 3.4, 0.0);
				facing = normalize(ball + vec3(0.0, 0.25, 0.0));
			}
			colour = leaves.rgb;
			glow = leaves.a;
			// The wind.
			at.xz += sin(clock * 1.4 + place.x * 0.21 + place.y * 0.17) * 0.03 * at.y;
		}
		colour *= cloud_shade(vec3(place.x, top, place.y));
		NORMAL = facing;
		// A coarser grid's tree comes inside the finer one's and grows to its size; the finer one then draws
		// back inside it and goes. No pixel is thinned: the tree is whole at every distance. The last
		// grid's trees, and the shadows', sink into the ground, and a tree the camera flies into draws in.
		vec3 size = vec3(mix(0.8, 1.0, smoothstep(0.0, 0.6, come)));
		size *= sinks ? vec3(1.0, 1.0 - gone, 1.0) : vec3(mix(1.0, 0.8, smoothstep(0.6, 1.0, gone)));
		size *= smoothstep(2.0, 10.0, distance(vec3(place.x, top + 3.0, place.y), eye));
		VERTEX = at * tree_size(kind) * size + vec3(place.x, top - 0.15, place.y) - MODEL_MATRIX[3].xyz;
	}
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float leafy = step(0.001, crown);
	// Leaves: clumps lighter and darker, deeper toward the crown's foot and inside, and a light
	// that does not fall as on a smooth ball.
	// Clumps finer than the pixels would flicker as the crown moves: from afar it is evenly lit.
	float seen = 1.0 - smoothstep(0.1, 0.35, max(length(dFdx(world)), length(dFdy(world))));
	float clump = mix(0.5, noise(world.xz * 1.9 + world.y * 1.3), seen);
	float fleck = mix(0.5, noise(world.zy * 2.3 + world.x * 1.7), seen);
	vec3 shade = colour * mix(1.0, (0.55 + 0.6 * crown) * (0.78 + 0.44 * clump), leafy);
	float edge = pow(1.0 - abs(dot(NORMAL, VIEW)), 2.0);
	ALBEDO = (shade + colour * edge * 0.2 * leafy) * (1.0 - 0.5 * glow);
	EMISSION = colour * glow * (0.1 + 1.5 * night) * mix(0.5, 1.0, crown);
	ROUGHNESS = glow > 0.2 ? 0.3 : 0.85;
	SPECULAR = 0.3;
	BACKLIGHT = colour * 0.35 * leafy;
	NORMAL = normalize(NORMAL + (vec3(clump, fleck, clump * fleck * 2.0) - 0.5) * 0.7 * leafy);
}
