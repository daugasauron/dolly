// The land: a grid of points that follows the flight, each raised to the ground's height there
// (ground.gdshader). The fragment stage takes the slope from the same heights and dresses the
// ground by it: meadow, heath or desert by the climate, bare rock where it is steep, snow where
// it is high and lies, sand by the sea. Veins of crystal glow at night, the clouds lay their
// shade, and rings of light run out from lit beacons, around which the snow melts. Low wet
// plains are marsh, with pools that mirror the sky and freeze in winter.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"
#include "res://flora.gdshaderinc"

// A coarser grid lies a little lower under the square a finer one draws, of this half size.
uniform float hole = 0.0;
uniform vec2 middle; // of the grids
uniform float paint_from = 540.0; // where the last trees drawn begin to sink, and their crowns are painted

varying vec3 world;

void vertex() {
	world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float covered = hole - max(abs(world.x - middle.x), abs(world.z - middle.y));
	world.y = ground_here(world.xz).x - clamp(covered, 0.0, cell) * 0.6;
	VERTEX.y = world.y;
}

void fragment() {
	vec2 p = world.xz;
	// The ground a pixel covers. Whatever is finer than that gives way to its mean by degrees: drawn,
	// it would flicker as the flight carries it across the pixels.
	float wide = max(length(dFdx(p)), length(dFdy(p)));
	float near = 1.0 - smoothstep(0.3, 1.2, wide);
	vec4 here = ground_here(p);
	vec3 normal = ground_normal(p, max(ground_spacing(p), wide * 0.5));
	float grain = fbm_seen(p * 0.3, 4, wide * 0.3);
	float blotch = noise(p / 27.0 + vec2(9.0, 120.0));
	float height = here.x + (grain - 0.5) * 1.5;
	float warmth = here.y + (blotch - 0.5) * 0.05;
	// The relief: a hollow is wetter than a spur, darker, and keeps its snow longer.
	float relief = clamp(ground_relief(p), -4.0, 4.0);
	float moisture = here.z + (grain - 0.5) * 0.04 - relief * 0.012;
	float steep = 1.0 - normal.y;
	// Winter brings the snow down the slopes, and rain the wet (or in winter more snow).
	// A shower leaves the ground wet behind it for a while. A lit beacon warms the ground
	// around it: the snow draws back up the slope there, and more flowers stand.
	float wet = max(rain_on(p), 0.7 * rained_on(p));
	float warmed = beacon_warmth(p);
	float snowline = SEA + 78.0 - (0.5 - warmth) * 70.0 - winter * (52.0 + 14.0 * wet) + 70.0 * warmed + relief * 2.5;

	vec3 meadow = mix(vec3(0.4, 0.27, 0.04), mix(vec3(0.015, 0.19, 0.11), vec3(0.1, 0.24, 0.03), blotch), smoothstep(0.36, 0.6, moisture));
	vec3 heath = mix(vec3(0.17, 0.15, 0.09), mix(vec3(0.17, 0.08, 0.2), vec3(0.04, 0.14, 0.07), smoothstep(0.35, 0.6, blotch)), smoothstep(0.36, 0.6, moisture));
	// The desert's sand lies in dunes, whose ripples the wind draws across it.
	vec3 desert = mix(vec3(0.55, 0.13, 0.07), vec3(0.68, 0.3, 0.12), blotch) * (1.0 + 0.1 * near * sin((p.x * 0.93 + p.y * 0.36) * 0.9 + 4.0 * blotch));
	meadow = mix(meadow, vec3(0.42, 0.33, 0.1), autumn * 0.55);
	vec3 colour = mix(heath, meadow, smoothstep(0.38, 0.46, warmth));
	float sandy = smoothstep(0.55, 0.6, warmth) * smoothstep(0.5, 0.44, moisture);
	colour = mix(colour, desert, sandy);
	// Savanna between the desert and the meadows: grass, gold for most of the year and green
	// in spring and where it has rained.
	vec3 grass = mix(mix(vec3(0.5, 0.36, 0.1), vec3(0.62, 0.5, 0.18), blotch), vec3(0.2, 0.34, 0.07), clamp(0.7 * spring + 0.6 * wet, 0.0, 1.0));
	colour = mix(colour, grass, smoothstep(0.49, 0.54, warmth) * smoothstep(0.44, 0.5, moisture) * smoothstep(0.6, 0.54, moisture));
	// The ground cover is mottled, and flowers dot it near by.
	colour *= mix(0.95, 1.5, smoothstep(SEA, SEA + 45.0, height)) * (0.9 + 0.2 * grain) * (0.72 + 0.56 * fbm(p / 17.0 + vec2(5.0, 90.0), 3));
	vec2 bloom = floor(p * 2.5);
	float flower = step(0.975 - 0.02 * spring * wet - 0.06 * warmed, hash(bloom)) * (1.0 - smoothstep(0.06, 0.2, wide));
	colour = mix(colour, 0.25 + 0.75 * vec3(hash(bloom + 3.0), hash(bloom + 5.0) * 0.6, hash(bloom + 7.0)), flower * 0.8);
	// Rock shows where the ground is steep and toward the snow, in strata.
	float strata = 1.0 - 0.22 * near * (0.5 + 0.5 * sin(here.x * 1.3 + blotch * 7.0));
	vec3 rock = mix(vec3(0.09, 0.075, 0.08), vec3(0.24, 0.18, 0.13), grain * 0.5 + 0.5 * blotch) * strata;
	float bare = max(smoothstep(0.1, 0.22, steep + (grain - 0.5) * 0.06), smoothstep(snowline - 26.0, snowline - 12.0, height));
	colour = mix(colour, rock, bare);
	float snow = smoothstep(snowline - 3.0, snowline + 3.0, height) * smoothstep(0.42, 0.2, steep);
	colour = mix(colour, vec3(0.6, 0.67, 0.8) * (0.9 + 0.2 * grain), snow);
	// A town: paving in lots, with streets between them that their lamps light at night.
	float people = settled(p);
	float low = smoothstep(SEA + 4.5, SEA + 8.0, here.x) * (1.0 - smoothstep(SEA + 46.0, SEA + 60.0, here.x));
	float town = smoothstep(0.58, 0.66, people) * low * (1.0 - bare);
	// Around a town its fields: strips of crops, each field its own, green in spring, gold by
	// late summer, stubble in autumn; hedges between them.
	float farmed = smoothstep(0.49, 0.53, people) * low * (1.0 - bare) * (1.0 - town) * (1.0 - snow);
	vec2 in_field = p / vec2(52.0, 34.0) + 0.6 * noise(p / 140.0);
	float crop = hash(floor(in_field) + 77.0);
	vec2 to_hedge = abs(fract(in_field) - 0.5);
	float hedge = smoothstep(0.44, 0.47 + wide / 34.0, max(to_hedge.x, to_hedge.y)) * near;
	float rows = 0.5 + 0.5 * sin((crop > 0.5 ? p.x : p.y) * 2.2) * (1.0 - smoothstep(0.3, 1.0, wide));
	vec3 crops = mix(mix(vec3(0.16, 0.36, 0.08), vec3(0.3, 0.42, 0.1), crop), mix(vec3(0.62, 0.5, 0.16), vec3(0.45, 0.33, 0.14), autumn), smoothstep(0.3, 0.75, fract(crop * 7.0) + autumn - spring));
	colour = mix(colour, mix(crops * (0.85 + 0.3 * rows), vec3(0.03, 0.12, 0.05), hedge), farmed);
	// Where the farmed land is warm, wet and sloping it is terraced: level steps of 2.5 units
	// that follow the slope's contours behind low walls, flooded in spring so that they mirror
	// the sky, green in summer, gold in autumn.
	float terraced = farmed * smoothstep(0.012, 0.04, steep) * smoothstep(0.47, 0.54, warmth) * smoothstep(0.44, 0.52, moisture);
	float step_of = here.x / 2.5;
	float step_wide = fwidth(step_of);
	float wall = (1.0 - smoothstep(0.1, 0.1 + step_wide, fract(step_of))) * (1.0 - smoothstep(0.4, 1.2, step_wide));
	float flooded = terraced * spring * (1.0 - wall);
	vec3 paddy = mix(mix(vec3(0.2, 0.42, 0.1), vec3(0.6, 0.5, 0.15), autumn), vec3(0.16, 0.24, 0.27), spring) * (0.9 + 0.2 * hash(floor(vec2(step_of, 0.0))));
	colour = mix(colour, mix(paddy, vec3(0.2, 0.17, 0.1), wall), terraced);
	// A marsh on low, wet, level ground: reeds, and pools between them that mirror the sky, with
	// ice on them in winter.
	float marsh = marsh_at(height, moisture) * smoothstep(0.07, 0.03, steep) * (1.0 - town) * (1.0 - farmed);
	float pool = marsh * smoothstep(0.5, 0.54 + wide * 0.03, fbm_seen(p / 11.0 + vec2(60.0, 14.0), 2, wide / 11.0));
	colour = mix(colour, mix(vec3(0.07, 0.13, 0.03), vec3(0.2, 0.19, 0.06), grain) * (1.0 - 0.4 * winter), marsh * 0.85);
	colour = mix(colour, mix(vec3(0.015, 0.05, 0.07), vec3(0.62, 0.72, 0.82), winter), pool);
	vec2 in_lot = abs(fract(p / LOT) - 0.5);
	float street = mix(smoothstep(0.36, 0.4 + wide / LOT, max(in_lot.x, in_lot.y)), 0.35, smoothstep(2.0, 8.0, wide));
	// The lots of an avenue are road: asphalt, with a broken line along its middle. A square
	// is a lawn. From afar a town is the mean of them.
	vec2 lot = floor(p / LOT);
	ivec2 number = ivec2(lot);
	bool north = (number.x % 5 + 5) % 5 == 0;
	bool road = north || (number.y % 6 + 6) % 6 == 0;
	float dash = (1.0 - smoothstep(0.012, 0.012 + wide / LOT, north ? in_lot.x : in_lot.y)) * step(0.5, fract((north ? p.y : p.x) / 6.0)) * near;
	// A city is paved, with asphalt roads; a town or a village has yards of earth and grass
	// and roads of packed earth, of its ground's colour in the desert.
	int town_is = town > 0.0 ? town_kind((lot + 0.5) * LOT, here.x) : 0;
	float open = town_is == 0 ? 0.1 : (town_is == 1 || town_is == 4) ? 0.2 : 0.32;
	float lawn = step(hash(lot * LOT + 13.0), open) * (1.0 - street);
	vec3 yard = town_is == 0 ? vec3(0.4, 0.38, 0.36) : (town_is == 2 || town_is == 7) ? vec3(0.6, 0.44, 0.27) : town_is == 6 ? vec3(0.7, 0.66, 0.58) : vec3(0.36, 0.34, 0.2);
	vec3 way = town_is == 0 ? vec3(0.1, 0.1, 0.12) : (town_is == 2 || town_is == 7) ? vec3(0.5, 0.36, 0.22) : vec3(0.42, 0.34, 0.24);
	vec3 built = mix(mix(yard, town_is == 2 ? yard : vec3(0.14, 0.3, 0.08), lawn), way, street);
	built = mix(road ? mix(town_is == 0 ? vec3(0.07, 0.07, 0.08) : way, vec3(0.75, 0.7, 0.5), town_is == 0 ? dash : 0.0) : built, mix(yard, way, 0.4), smoothstep(3.0, 12.0, wide));
	street = mix(road ? 0.7 : street, 0.45, smoothstep(3.0, 12.0, wide));
	colour = mix(colour, built, town);
	// Past the last trees that are drawn, their crowns are painted on the ground they stand on.
	float away = distance(p, flyer);
	float painted = smoothstep(paint_from, paint_from + 140.0, away);
	vec3 lit_crowns = vec3(0.0);
	if (painted > 0.0 && grows(here.x, here.y)) {
		float crown = crown_width(here.y, here.z) * 1.3;
		float share = tree_share(here.y, here.z) * step(town_near(p, here.x), 0.0) * (1.0 - 0.85 * marsh_at(here.x, here.z)) * (1.0 - 0.94 * farmed);
		// Where a crown is less than a pixel, the ground takes the colour of its share of them.
		float merged = max(smoothstep(800.0, 1300.0, away), smoothstep(crown * 0.35, crown * 1.4, wide));
		// A crown is wider than its plot: the pixel is under the nearest of its own plot's tree and
		// the eight plots' around, so a crown is round and not cut off where its plot ends.
		vec4 tree = vec4(0.0);
		float disc = 0.0;
		if (merged < 1.0) {
			for (int x = -1; x <= 1; x++) {
				for (int y = -1; y <= 1; y++) {
					vec4 near_by = plot_tree(p + vec2(float(x), float(y)) * PLOT);
					float spread = crown * tree_size(near_by.w);
					float covers = step(near_by.z, share) * (1.0 - smoothstep(spread * 0.6, spread, distance(p, near_by.xy)));
					if (covers > disc) {
						disc = covers;
						tree = near_by;
					}
				}
			}
		}
		float under = mix(disc, share * 0.6, merged) * (1.0 - bare) * painted;
		vec4 leaves = mix(crown_colour(tree.xy, tree.w, here.y, here.z, here.w), crown_colour(p, 0.5, here.y, here.z, here.w), merged);
		colour = mix(colour, leaves.rgb * 0.75 * (1.0 - 0.5 * leaves.a), under);
		lit_crowns = leaves.rgb * leaves.a * under * (0.1 + 1.5 * night) * 0.75;
	}
	float sand = smoothstep(SEA + 2.4, SEA + 0.8, height);
	colour = mix(colour, vec3(0.6, 0.47, 0.27) * (1.0 - 0.5 * smoothstep(SEA, SEA - 2.5, height)), sand);
	// A vein of crystal follows a contour of a noise: pale by day, alight at night, and the
	// light runs along it.
	float contour = abs(noise(p / 46.0 + vec2(300.0, 41.0)) - 0.5);
	// A vein is never thinner than a pixel; where the pixel is wider, it is as much fainter.
	float thick = max(0.008, wide / 46.0);
	float vein = (1.0 - smoothstep(0.5, 1.0, contour / thick)) * (0.008 / thick) * (1.0 - sand) * (1.0 - snow) * (1.0 - 0.6 * bare) * (1.0 + 2.5 * here.w);
	// In the desert the veins are lava, which glows by day too.
	vec3 vein_colour = mix(mix(vec3(0.05, 0.8, 1.0), vec3(1.0, 0.15, 0.7), smoothstep(0.42, 0.58, here.z)), vec3(1.0, 0.28, 0.02), sandy);
	float run = 0.55 + 0.45 * sin(grain * 2.0 + (p.x + p.y) * 0.07 - clock * 1.8);
	colour = mix(colour, vec3(0.5, 0.62, 0.68), vein * 0.12 * near * (1.0 - bare));

	// The grain of the ground, which the grid is too coarse to carry, tilts the light near by.
	float fine = fbm(p * 0.45 + vec2(70.0, 3.0), 3);
	vec2 tilt = (vec2(fbm(p * 0.45 + vec2(70.4, 3.0), 3), fbm(p * 0.45 + vec2(70.0, 3.4), 3)) - fine) * (0.5 + 1.6 * bare) * (1.0 - smoothstep(0.1, 0.4, wide)) * (1.0 - 0.6 * snow);
	// A gust shows on grass and crops as a band of paler green that crosses them.
	float blown = gust(p) * (1.0 - bare) * (1.0 - snow) * (1.0 - town) * (1.0 - sand) * (1.0 - smoothstep(10.0, 40.0, wide));
	ALBEDO = colour * (1.0 + 0.5 * blown) * (1.0 + 0.07 * min(relief, 0.0) + 0.03 * max(relief, 0.0)) * cloud_shade(world) * (1.0 - 0.35 * wet * (1.0 - snow));
	// A town's lamps are warm; in winter each lot hangs out lights of its own colour.
	vec3 lamps = mix(vec3(1.0, 0.78, 0.45), 0.5 + 0.5 * cos(6.2832 * (hash(floor(p / LOT) + 21.0) + vec3(0.0, 0.33, 0.67))), winter * 0.8);
	EMISSION = lamps * town * street * night * (0.5 + 0.5 * winter) + lit_crowns + vein_colour * vein * run * (0.02 + 0.5 * sandy + 1.7 * night) + vec3(1.0, 0.5, 0.12) * pulse_light(p) * (1.0 + 1.8 * night) * (0.6 + 0.6 * grain);
	ROUGHNESS = mix(mix(mix(0.9, 0.7, bare), 0.3, max(max(max(vein * night, snow * 0.6), sand * 0.5), wet * 0.8)), mix(0.05, 0.35, winter), max(pool, flooded));
	SPECULAR = 0.35;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(mix(normal + vec3(tilt.x, 0.0, tilt.y), vec3(0.0, 1.0, 0.0), pool)), 0.0)).xyz);
}
