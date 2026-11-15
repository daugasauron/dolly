// A town: a building for each lot of a grid that follows the flight, where the land has a town
// (terrain.gdshaderinc's town_at) and the lot is neither road nor open nor steep. The mesh is
// four walls and a roof of 4 by 4 squares; the vertex stage stands the walls on the lot's
// ground, as wide as the lot's own numbers say and as tall as they, the town's share and its
// kind allow, and shapes the roof by the kind (town_kind): flat behind a parapet, a gable, a
// steep gable, a hip with wide upturned eaves, a cone of thatch, or a dome. The fragment stage
// draws what makes it a building of its kind: storeys with a line between them and windows,
// shop fronts, timber frames, planks, mud brick, whitewash; tiles, turf, thatch or snow on the
// roof. What is finer than a pixel gives way to its mean. Some windows are lit at night.
shader_type spatial;
render_mode cull_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

uniform float city_reach = 528.0; // how far from the flyer the buildings are drawn

varying flat vec3 tint;
varying flat float own; // the building's number
varying flat float foot; // the height its storeys are counted from
varying flat float storeys;
varying flat int kind;
varying flat float domed;
varying vec3 world;
varying vec3 facing;
varying vec2 on_roof;
varying float roof;

void vertex() {
	vec2 corner = floor(MODEL_MATRIX[3].xz / LOT) * LOT;
	vec2 centre = corner + LOT * 0.5;
	float away = distance(centre, flyer);
	own = hash(corner + 3.0);
	vec4 here = ground_here(centre);
	float share = town_at(centre, here.x);
	kind = 0;
	float tall = 0.0;
	// No building stands on a steep lot.
	float tilt = 0.0;
	if (share >= 0.1) {
		kind = town_kind(centre, here.x);
		tall = building_height(corner, share, kind);
		tilt = abs(ground_here(centre + vec2(LOT * 0.5, 0.0)).x - ground_here(centre - vec2(LOT * 0.5, 0.0)).x) + abs(ground_here(centre + vec2(0.0, LOT * 0.5)).x - ground_here(centre - vec2(0.0, LOT * 0.5)).x);
	}
	foot = here.x;
	storeys = (tall - 1.0) / 3.0;
	// The furthest buildings drawn stand lower the further they are, down to the ground, where
	// the land's shader paints the town: a town rises out of the haze by degrees.
	float low = (1.0 - smoothstep(city_reach * 0.6, city_reach * 0.97, away)) * step(tilt, 9.0);
	tall *= low;
	vec2 wide = LOT * (kind == 0 ? 0.5 + 0.3 * vec2(hash(corner + 11.0), hash(corner + 19.0)) : 0.4 + 0.24 * vec2(hash(corner + 11.0), hash(corner + 19.0)));
	tint = mix(mix(vec3(0.55, 0.5, 0.45), vec3(0.6, 0.32, 0.22), hash(corner + 5.0)), vec3(0.3, 0.4, 0.5), step(0.7, own));
	facing = NORMAL;
	on_roof = VERTEX.xz * 2.0;
	roof = COLOR.r;
	domed = float((kind == 2 && own < 0.14) || (kind == 6 && own < 0.3));
	if (tall < 0.4) {
		VERTEX = vec3(0.0);
	} else if (roof < 0.5) {
		VERTEX = vec3(VERTEX.x * wide.x, (VERTEX.y + 0.5) * (tall + 8.0), VERTEX.z * wide.y) + vec3(centre.x, here.x - 8.0, centre.y) - MODEL_MATRIX[3].xyz;
	} else {
		// The roof, by the kind: how far it rises over the walls at this place of it, and how
		// far its eaves stand out.
		bool turned = hash(corner + 23.0) > 0.5;
		vec2 at = turned ? VERTEX.zx : VERTEX.xz;
		float span = turned ? wide.y : wide.x;
		float out_to = max(abs(VERTEX.x), abs(VERTEX.z)) * 2.0;
		float rise = 0.0;
		float eaves = 1.0;
		if (domed > 0.5) {
			rise = sqrt(max(1.0 - 4.0 * dot(VERTEX.xz, VERTEX.xz), 0.0)) * 0.5 * min(wide.x, wide.y);
		} else if (kind == 1) {
			rise = (1.0 - abs(at.x) * 2.0) * 0.5 * span;
			eaves = 1.1;
		} else if (kind == 3) {
			rise = (1.0 - abs(at.x) * 2.0) * 0.95 * span;
			eaves = 1.12;
		} else if (kind == 4) {
			rise = pow(1.0 - out_to, 1.6) * 0.5 * min(wide.x, wide.y) + 1.6 * pow(abs(VERTEX.x * VERTEX.z) * 4.0, 2.0);
			eaves = 1.34;
		} else if (kind == 7) {
			rise = (1.0 - min(length(VERTEX.xz) * 2.0, 1.0)) * 1.0 * min(wide.x, wide.y);
			eaves = 1.3;
		}
		VERTEX = vec3(VERTEX.x * wide.x * eaves, tall + rise * low, VERTEX.z * wide.y * eaves) + vec3(centre.x, here.x, centre.y) - MODEL_MATRIX[3].xyz;
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
	float is_roof = step(0.5, roof);
	float wall_face = 1.0 - is_roof;
	bool city = kind == 0;
	// A city's ground floor is shop fronts, wide and dark; above the last storey is the parapet.
	float shop = city ? 1.0 - step(1.0, storey) : 0.0;
	float above = step(storeys, storey);
	// The windows, by the kind: a city's wide, a house's smaller, a mud-brick wall's few and small.
	float half_wide = city ? mix(0.3, 0.42, shop) : (kind == 2 || kind == 7) ? 0.1 : 0.19;
	float half_tall = city ? 0.28 : (kind == 2 || kind == 7) ? 0.12 : 0.24;
	float window = (1.0 - smoothstep(half_wide - fine, half_wide + fine, in_pane.x)) * (1.0 - smoothstep(half_tall - fine, half_tall + fine, in_pane.y - 0.06 * shop));
	float glass = 4.0 * half_wide * half_tall + 0.06;
	// Finer than a pixel, a wall is the mean of its windows and what is between them.
	window = mix(window, glass, merged) * (1.0 - above) * wall_face * step(0.0, storey);
	if (kind == 2 || kind == 7) {
		window *= step(0.55, hash(floor(pane) + own * 31.0));
	}
	// A line between storeys.
	float line = (1.0 - smoothstep(0.03, 0.03 + fine, abs(fract(storey + 0.5) - 0.5))) * (1.0 - merged) * wall_face;
	float lit = step(0.55, hash(floor(pane) + own * 97.0)) * (1.0 - merged) + 0.45 * merged;
	vec3 wall = tint * (0.8 + 0.2 * fract(own * 7.0)) * (1.0 - 0.3 * line) * mix(1.0, 0.7, shop);
	vec3 top = vec3(0.3, 0.3, 0.31);
	float snowy = 0.85;
	if (kind == 1) {
		// Timber frame: dark beams around panels of plaster, under red tiles in rows.
		vec2 beam = abs(fract(vec2(along / 2.4 + 0.5, storey * 2.0)) - 0.5);
		float frame = (1.0 - smoothstep(0.42, 0.44 + fine, max(beam.x, beam.y))) * (1.0 - merged) + 0.2 * merged;
		wall = mix(vec3(0.16, 0.1, 0.07), mix(vec3(0.86, 0.82, 0.7), vec3(0.8, 0.6, 0.45), fract(own * 5.0)), frame);
		top = mix(vec3(0.62, 0.2, 0.1), vec3(0.5, 0.16, 0.1), fract(own * 9.0)) * (0.8 + 0.2 * step(0.5, fract(world.y * 1.6)) * (1.0 - merged));
	} else if (kind == 2) {
		// Mud brick, the colour of its ground, and whitewashed domes.
		wall = mix(vec3(0.62, 0.42, 0.24), vec3(0.74, 0.56, 0.36), fract(own * 5.0)) * (1.0 - 0.12 * line);
		top = mix(wall * 0.9, vec3(0.9, 0.88, 0.82), domed);
	} else if (kind == 3) {
		// Dark planks under a roof of turf.
		wall = mix(vec3(0.17, 0.09, 0.05), vec3(0.3, 0.13, 0.07), fract(own * 5.0)) * (0.8 + 0.2 * step(0.5, fract(world.y * 2.5)) * (1.0 - merged));
		top = mix(vec3(0.16, 0.3, 0.08), vec3(0.3, 0.3, 0.1), autumn);
		snowy = 0.95;
	} else if (kind == 4) {
		// White walls between dark red posts, under grey-green tiles.
		float post = (1.0 - smoothstep(0.06, 0.06 + fine, abs(fract(along / 2.4) - 0.5) - 0.38)) * (1.0 - merged);
		wall = mix(vec3(0.88, 0.86, 0.8), vec3(0.45, 0.07, 0.05), max(post, line));
		top = vec3(0.1, 0.17, 0.16) * (0.75 + 0.25 * step(0.5, fract(length(on_roof) * 6.0)) * (1.0 - merged));
	} else if (kind == 6) {
		// Whitewash, and blue domes.
		wall = vec3(0.92, 0.92, 0.9) * (1.0 - 0.1 * line);
		top = mix(vec3(0.9, 0.9, 0.88), vec3(0.08, 0.3, 0.75), domed);
	} else if (kind == 7) {
		// Earth walls under thatch.
		wall = mix(vec3(0.5, 0.3, 0.16), vec3(0.62, 0.4, 0.22), fract(own * 5.0));
		top = vec3(0.55, 0.43, 0.2) * (0.8 + 0.2 * step(0.5, fract(length(on_roof) * 5.0)) * (1.0 - merged));
	} else {
		// A city's roof: gravel inside a rim, and the stair's head on it, darker.
		float rim = smoothstep(0.82, 0.9, max(abs(on_roof.x), abs(on_roof.y)));
		float head = step(max(abs(on_roof.x - 0.3 + 0.6 * own), abs(on_roof.y + 0.25)), 0.22);
		top = mix(top * (1.0 - 0.35 * head), wall, rim);
	}
	// Snow lies on the roofs in winter.
	top = mix(top, vec3(0.62, 0.68, 0.78), winter * snowy);
	vec3 colour = mix(wall, top, is_roof) * cloud_shade(world);
	ALBEDO = mix(colour, vec3(0.05, 0.08, 0.12), window);
	ROUGHNESS = mix(0.85, 0.15, window);
	METALLIC = 0.3 * window;
	EMISSION = vec3(1.0, 0.78, 0.45) * window * mix(lit, 0.9, shop * (1.0 - merged)) * night * 1.6;
	if (is_roof > 0.5) {
		// A roof's faces are flat: their normal is the face's own.
		NORMAL = normalize(cross(dFdy(VERTEX), dFdx(VERTEX)));
	} else if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
