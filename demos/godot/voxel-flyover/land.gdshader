// The land: a grid of points that follows the flight, each raised to the ground's height there
// (ground.gdshader). The fragment stage takes the slope from the same heights and dresses the
// ground by it: meadow, heath or desert by the climate, bare rock where it is steep, snow where
// it is high and lies, sand by the sea. Veins of crystal glow at night, the clouds lay their
// shade, and rings of light run out from lit beacons.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"
#include "res://flora.gdshaderinc"

// A coarser grid lies a little lower under the square a finer one draws, of this half size.
uniform float hole = 0.0;
uniform vec2 middle; // of the grids

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
	float moisture = here.z + (grain - 0.5) * 0.04;
	float steep = 1.0 - normal.y;
	float snowline = SEA + 78.0 - (0.5 - warmth) * 70.0;

	vec3 meadow = mix(vec3(0.4, 0.27, 0.04), mix(vec3(0.015, 0.19, 0.11), vec3(0.1, 0.24, 0.03), blotch), smoothstep(0.36, 0.6, moisture));
	vec3 heath = mix(vec3(0.17, 0.15, 0.09), mix(vec3(0.17, 0.08, 0.2), vec3(0.04, 0.14, 0.07), smoothstep(0.35, 0.6, blotch)), smoothstep(0.36, 0.6, moisture));
	vec3 desert = mix(vec3(0.55, 0.13, 0.07), vec3(0.68, 0.3, 0.12), blotch);
	vec3 colour = mix(heath, meadow, smoothstep(0.38, 0.46, warmth));
	colour = mix(colour, desert, smoothstep(0.55, 0.6, warmth) * smoothstep(0.5, 0.44, moisture));
	// The ground cover is mottled, and flowers dot it near by.
	colour *= mix(0.95, 1.5, smoothstep(SEA, SEA + 45.0, height)) * (0.9 + 0.2 * grain) * (0.72 + 0.56 * fbm(p / 17.0 + vec2(5.0, 90.0), 3));
	vec2 bloom = floor(p * 2.5);
	float flower = step(0.975, hash(bloom)) * (1.0 - smoothstep(0.06, 0.2, wide));
	colour = mix(colour, 0.25 + 0.75 * vec3(hash(bloom + 3.0), hash(bloom + 5.0) * 0.6, hash(bloom + 7.0)), flower * 0.8);
	// Rock shows where the ground is steep and toward the snow, in strata.
	float strata = 1.0 - 0.22 * near * (0.5 + 0.5 * sin(here.x * 1.3 + blotch * 7.0));
	vec3 rock = mix(vec3(0.09, 0.075, 0.08), vec3(0.24, 0.18, 0.13), grain * 0.5 + 0.5 * blotch) * strata;
	float bare = max(smoothstep(0.1, 0.22, steep + (grain - 0.5) * 0.06), smoothstep(snowline - 26.0, snowline - 12.0, height));
	colour = mix(colour, rock, bare);
	float snow = smoothstep(snowline - 3.0, snowline + 3.0, height) * smoothstep(0.42, 0.2, steep);
	colour = mix(colour, vec3(0.6, 0.67, 0.8) * (0.9 + 0.2 * grain), snow);
	// Past the last trees that are drawn, their crowns are painted on the ground they stand on.
	float away = distance(p, flyer);
	float painted = smoothstep(540.0, 680.0, away);
	vec3 lit_crowns = vec3(0.0);
	if (painted > 0.0 && grows(here.x, here.y)) {
		vec4 tree = plot_tree(p);
		float crown = crown_width(here.y, here.z) * tree_size(tree.w) * 1.3;
		float share = tree_share(here.y, here.z);
		// Where a crown is less than a pixel, the ground takes the colour of its share of them.
		float merged = max(smoothstep(800.0, 1300.0, away), smoothstep(crown * 0.35, crown * 1.4, wide));
		float under = mix(step(tree.z, share) * (1.0 - smoothstep(crown * 0.6, crown, distance(p, tree.xy))), share * 0.6, merged) * (1.0 - bare) * painted;
		vec4 leaves = mix(crown_colour(tree.xy, tree.w, here.y, here.z), crown_colour(p, 0.5, here.y, here.z), merged);
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
	float vein = (1.0 - smoothstep(0.5, 1.0, contour / thick)) * (0.008 / thick) * (1.0 - sand) * (1.0 - snow) * (1.0 - 0.6 * bare);
	vec3 vein_colour = mix(vec3(0.05, 0.8, 1.0), vec3(1.0, 0.15, 0.7), smoothstep(0.42, 0.58, here.z));
	float run = 0.55 + 0.45 * sin(grain * 2.0 + (p.x + p.y) * 0.07 - clock * 1.8);
	colour = mix(colour, vec3(0.5, 0.62, 0.68), vein * 0.12 * near * (1.0 - bare));

	// The grain of the ground, which the grid is too coarse to carry, tilts the light near by.
	float fine = fbm(p * 0.45 + vec2(70.0, 3.0), 3);
	vec2 tilt = (vec2(fbm(p * 0.45 + vec2(70.4, 3.0), 3), fbm(p * 0.45 + vec2(70.0, 3.4), 3)) - fine) * (0.5 + 1.6 * bare) * (1.0 - smoothstep(0.1, 0.4, wide)) * (1.0 - 0.6 * snow);
	ALBEDO = colour * cloud_shade(world);
	EMISSION = lit_crowns + vein_colour * vein * run * (0.02 + 1.7 * night) + vec3(1.0, 0.5, 0.12) * pulse_light(p) * (1.0 + 1.8 * night) * (0.6 + 0.6 * grain);
	ROUGHNESS = mix(mix(0.9, 0.7, bare), 0.3, max(max(vein * night, snow * 0.6), sand * 0.5));
	SPECULAR = 0.35;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(normal + vec3(tilt.x, 0.0, tilt.y)), 0.0)).xyz);
}
