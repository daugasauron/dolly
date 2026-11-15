// A city: a building for each lot of a grid that follows the flight, where the land has a town
// (terrain.gdshaderinc's town_at) and the lot is neither road nor square nor steep. The vertex
// stage stands a box on the lot's ground, as wide as the lot's own numbers say and as tall as
// they and the town's share allow, so a town rises toward its middle. The fragment stage draws
// what makes it a building: a ground floor of shop fronts, storeys of 3 units with a line
// between them and a row of windows each, a parapet, and a roof with a rim. What is finer than
// a pixel gives way to its mean. Some windows are lit at night.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

varying flat vec3 tint;
varying flat float own; // the building's number
varying flat float foot; // the height its storeys are counted from
varying flat float storeys;
varying vec3 world;
varying vec3 facing;
varying vec2 on_roof;

void vertex() {
	vec2 corner = floor(MODEL_MATRIX[3].xz / LOT) * LOT;
	vec2 centre = corner + LOT * 0.5;
	float away = distance(centre, flyer);
	own = hash(corner + 3.0);
	vec4 here = ground_here(centre);
	float tall = building_height(corner, town_at(centre, here.x));
	// No building stands on a steep lot.
	float tilt = abs(ground_here(centre + vec2(LOT * 0.5, 0.0)).x - ground_here(centre - vec2(LOT * 0.5, 0.0)).x) + abs(ground_here(centre + vec2(0.0, LOT * 0.5)).x - ground_here(centre - vec2(0.0, LOT * 0.5)).x);
	foot = here.x;
	storeys = (tall - 1.0) / 3.0;
	// The grid's last buildings sink into the ground, where the land's shader paints the town.
	tall *= (1.0 - smoothstep(400.0, 520.0, away)) * step(tilt, 9.0);
	vec2 wide = LOT * (0.5 + 0.3 * vec2(hash(corner + 11.0), hash(corner + 19.0)));
	tint = mix(mix(vec3(0.55, 0.5, 0.45), vec3(0.6, 0.32, 0.22), hash(corner + 5.0)), vec3(0.3, 0.4, 0.5), step(0.7, own));
	facing = NORMAL;
	on_roof = VERTEX.xz * 2.0;
	if (tall < 0.4) {
		VERTEX = vec3(0.0);
	} else {
		VERTEX = vec3(VERTEX.x * wide.x, (VERTEX.y + 0.5) * (tall + 8.0), VERTEX.z * wide.y) + vec3(centre.x, here.x - 8.0, centre.y) - MODEL_MATRIX[3].xyz;
	}
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	// On a wall: storeys 3 units apart, windows 2.4 apart along it.
	float along = abs(facing.x) > 0.5 ? world.z : world.x;
	float storey = (world.y - foot) / 3.0;
	vec2 pane = vec2(along / 2.4, storey);
	float fine = max(fwidth(pane.x), fwidth(pane.y));
	float merged = smoothstep(0.35, 0.9, fine);
	vec2 in_pane = abs(fract(pane) - 0.5);
	bool wall_face = abs(facing.y) < 0.5;
	// The ground floor is shop fronts, wide and dark; above the last storey is the parapet.
	float shop = 1.0 - step(1.0, storey);
	float above = step(storeys, storey);
	float window = (1.0 - smoothstep(mix(0.3, 0.42, shop) - fine, mix(0.3, 0.42, shop) + fine, in_pane.x)) * (1.0 - smoothstep(0.28 - fine, 0.28 + fine, in_pane.y - 0.06 * shop));
	// Finer than a pixel, a wall is the mean of its windows and what is between them.
	window = mix(window, 0.34, merged) * (1.0 - above) * float(wall_face) * step(0.0, storey);
	// A line between storeys.
	float line = (1.0 - smoothstep(0.03, 0.03 + fine, abs(fract(storey + 0.5) - 0.5))) * (1.0 - merged) * float(wall_face);
	float lit = step(0.55, hash(floor(pane) + own * 97.0)) * (1.0 - merged) + 0.45 * merged;
	vec3 wall = tint * (0.8 + 0.2 * fract(own * 7.0)) * (1.0 - 0.3 * line) * mix(1.0, 0.7, shop) * cloud_shade(world);
	// The roof: gravel inside a rim, and the stair's head on it, darker.
	float rim = smoothstep(0.82, 0.9, max(abs(on_roof.x), abs(on_roof.y)));
	float head = step(max(abs(on_roof.x - 0.3 + 0.6 * own), abs(on_roof.y + 0.25)), 0.22);
	vec3 roof = mix(vec3(0.3, 0.3, 0.31) * (1.0 - 0.35 * head), wall, rim) * cloud_shade(world);
	// Snow lies on the roofs in winter.
	roof = mix(roof, vec3(0.62, 0.68, 0.78), winter * 0.85);
	wall = mix(wall, roof, step(0.5, facing.y));
	ALBEDO = mix(wall, vec3(0.05, 0.08, 0.12), window);
	ROUGHNESS = mix(0.85, 0.15, window);
	METALLIC = 0.3 * window;
	EMISSION = vec3(1.0, 0.78, 0.45) * window * mix(lit, 0.9, shop * (1.0 - merged)) * night * 1.6;
}
