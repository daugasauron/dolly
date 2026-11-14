// The ground: one hexagonal column for each cell of a grid that follows the flight. The vertex
// stage reads what stands in its cell (ground.gdshader), raises the column to it and gives the
// cell its colour and its light: the climate's, veins of crystal that glow at night, and the
// rings that run out from lit beacons. The fragment stage tells the top from the sides and lays
// the clouds' shade over both.
shader_type spatial;
#include "res://terrain.gdshaderinc"

uniform sampler2D ground : filter_nearest;
uniform float across = 256.0;
uniform float cell = 1.0;
// A coarser grid sinks the columns under the rectangle a finer one draws, of this half size.
uniform vec2 hole_centre;
uniform vec2 hole = vec2(0.0);

varying flat vec3 top_colour;
varying flat vec3 glow;
varying flat float gloss;
varying vec3 within; // xz: the place in the cell, in cell widths; y: how far under the column's top
varying float side;

vec3 surface_colour(float top, float warmth, float moisture, float own, float patch) {
	float t = warmth + (own - 0.5) * 0.04;
	float m = moisture + (own - 0.5) * 0.04;
	float snowline = SEA + 70.0 - (0.5 - t) * 70.0 + own * 3.0;
	vec3 jade = mix(vec3(0.4, 0.27, 0.04), mix(vec3(0.015, 0.19, 0.11), vec3(0.1, 0.24, 0.03), patch), smoothstep(0.36, 0.6, m));
	vec3 heath = mix(vec3(0.17, 0.14, 0.15), mix(vec3(0.13, 0.07, 0.2), vec3(0.03, 0.12, 0.13), patch), smoothstep(0.36, 0.6, m));
	vec3 coral = mix(vec3(0.55, 0.13, 0.07), vec3(0.68, 0.3, 0.12), own);
	vec3 colour = mix(heath, jade, smoothstep(0.38, 0.46, t));
	colour = mix(colour, coral, smoothstep(0.55, 0.6, t) * smoothstep(0.5, 0.44, m));
	colour *= mix(0.7, 1.25, smoothstep(SEA, SEA + 45.0, top)) * (0.85 + 0.3 * own);
	colour = mix(colour, vec3(0.06, 0.06, 0.09), smoothstep(snowline - 18.0, snowline - 9.0, top));
	colour = mix(colour, vec3(0.78, 0.84, 0.95), smoothstep(snowline - 2.0, snowline, top));
	return mix(vec3(0.6, 0.47, 0.27), colour, smoothstep(SEA + 0.8, SEA + 2.4, top));
}

void vertex() {
	vec2 centre = MODEL_MATRIX[3].xz;
	vec2 at = hex_cell(centre, cell);
	vec4 here = texelFetch(ground, ivec2(mod(at, across)), 0);
	float top = here.x;
	float own = hash(at + 77.0);
	vec2 from_hole = hole - abs(centre - hole_centre);
	float covered = min(from_hole.x, from_hole.y);
	vec2 from_edge = vec2(0.5, 0.5 * ROW) * across * cell - abs(centre - hole_centre);
	if (top < SEA - 0.4 || covered > cell * 2.0) {
		VERTEX = vec3(0.0);
	} else {
		if (covered > 0.0) {
			top -= cell * 2.0;
		}
		// The sides reach the lowest column around, and further where a coarser grid begins.
		float base = max(min(here.w, top), SEA - 1.0) - 0.3 - cell * 3.0 * step(min(from_edge.x, from_edge.y), cell * 3.0);
		within = vec3(VERTEX.xz / cell, UV.x > 0.5 ? UV.y : top - base);
		VERTEX.y = UV.x > 0.5 ? top - UV.y : base;
	}
	side = COLOR.r;
	top_colour = surface_colour(top, here.y, here.z, own, smoothstep(0.35, 0.65, noise(centre / 31.0 + vec2(9.0, 120.0))));
	// A vein of crystal follows a contour of a noise: pale by day, alight at night, and the
	// light runs along it.
	float vein = 1.0 - smoothstep(0.5, 1.0, abs(noise(centre / 46.0 + vec2(300.0, 41.0)) - 0.5) / min(0.012 * (0.4 + cell), 0.06));
	vein *= smoothstep(SEA + 1.0, SEA + 3.0, top) * step(cell, 8.0);
	vec3 vein_colour = mix(vec3(0.05, 0.8, 1.0), vec3(1.0, 0.15, 0.7), smoothstep(0.42, 0.58, here.z));
	float run = 0.55 + 0.45 * sin(own * 2.0 + (centre.x + centre.y) * 0.07 - clock * 1.8);
	top_colour = mix(top_colour, vec3(0.5, 0.62, 0.68), vein * 0.6);
	gloss = vein;
	glow = vein_colour * vein * run * (0.04 + 2.4 * night) / sqrt(cell);
	glow += vec3(1.0, 0.5, 0.12) * pulse_light(centre) * (1.0 + 1.8 * night) * (0.5 + own);
}

void fragment() {
	float near = 1.0 - smoothstep(70.0, 220.0, -VERTEX.z);
	// The top darkens toward the cell's edge, so each column reads as one.
	vec3 colour = top_colour * mix(1.0, mix(1.08, 0.72, smoothstep(0.5, 1.1, length(within.xz) * 2.0)), near);
	float lit = 1.0;
	if (side > 0.5) {
		// The sides are basalt: the top's colour runs a little way down them, and so does its light.
		colour = mix(top_colour * 0.45, vec3(0.025, 0.025, 0.035), smoothstep(0.0, 2.2, within.y));
		lit = exp(-within.y * 0.9);
	}
	ALBEDO = colour * cloud_shade((INV_VIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
	EMISSION = glow * lit;
	ROUGHNESS = mix(0.85, 0.22, gloss);
	SPECULAR = 0.35;
}
