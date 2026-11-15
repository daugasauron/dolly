// A city: a building for each lot of a grid that follows the flight, where the land has a town
// (terrain.gdshaderinc's town_at). The vertex stage stands a box on the lot's ground, as tall as
// the lot's own number and the town's share there allow, so a town rises from its outskirts to
// its middle and a building grows out of the ground as the grid reaches it. The fragment stage
// draws its floors and windows, which give way to their mean where they are finer than a pixel,
// and lights some of them at night.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

varying flat vec3 tint;
varying flat float own; // the building's number
varying vec3 world;
varying vec3 facing;
varying float tall;

void vertex() {
	vec2 corner = floor(MODEL_MATRIX[3].xz / LOT) * LOT;
	vec2 centre = corner + LOT * 0.5;
	float away = distance(centre, flyer);
	own = hash(corner + 3.0);
	vec4 here = ground_here(centre);
	// The grid's last buildings sink into the ground, where the land's shader paints the town.
	tall = building_height(corner, town_at(centre, here.x)) * (1.0 - smoothstep(400.0, 520.0, away));
	float wide = LOT * (0.45 + 0.35 * hash(corner + 11.0));
	tint = mix(mix(vec3(0.55, 0.5, 0.45), vec3(0.6, 0.32, 0.22), hash(corner + 5.0)), vec3(0.3, 0.4, 0.5), step(0.7, own));
	facing = NORMAL;
	if (tall < 0.4) {
		VERTEX = vec3(0.0);
	} else {
		VERTEX = vec3(VERTEX.x * wide, (VERTEX.y + 0.5) * (tall + 1.5), VERTEX.z * wide) + vec3(centre.x, here.x - 1.5, centre.y) - MODEL_MATRIX[3].xyz;
	}
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	// On a wall: floors 3 units apart, windows 2.4 apart along it.
	float along = abs(facing.x) > 0.5 ? world.z : world.x;
	vec2 pane = vec2(along / 2.4, world.y / 3.0);
	float fine = max(fwidth(pane.x), fwidth(pane.y));
	vec2 in_pane = abs(fract(pane) - 0.5);
	float window = (1.0 - smoothstep(0.3 - fine, 0.3 + fine, in_pane.x)) * (1.0 - smoothstep(0.28 - fine, 0.28 + fine, in_pane.y));
	// Finer than a pixel, a wall is the mean of its windows and what is between them.
	window = mix(window, 0.34, smoothstep(0.35, 0.9, fine)) * step(abs(facing.y), 0.5);
	float lit = step(0.55, hash(floor(pane) + own * 97.0)) * (1.0 - smoothstep(0.35, 0.9, fine)) + 0.45 * smoothstep(0.35, 0.9, fine);
	vec3 wall = tint * (0.8 + 0.2 * fract(own * 7.0)) * cloud_shade(world);
	ALBEDO = mix(wall, vec3(0.05, 0.08, 0.12), window);
	ROUGHNESS = mix(0.85, 0.15, window);
	METALLIC = 0.3 * window;
	EMISSION = vec3(1.0, 0.78, 0.45) * window * lit * night * 1.6;
}
