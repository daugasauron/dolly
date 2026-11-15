// The sea, a mirror for the sky: its colour deepens with the ground under it, which the ground's
// texture gives, and ripples break the reflection. Foam follows the shore and glows at night, as
// do the rings from lit beacons that cross the water. In winter the cold seas carry ice: floes
// that drift with the wind, with open water between them.
shader_type spatial;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

uniform vec3 shallow : source_color = vec3(0.05, 0.5, 0.48);
uniform vec3 deep : source_color = vec3(0.004, 0.035, 0.1);
uniform vec3 skims; // the flyer low over the sea: its place (xy) and how low, between 0 and 1 (z)

varying vec3 world_position;

// Three sizes of ripple; a pixel that covers `wide` of the sea sees the mean of those finer than it.
float ripples(vec2 p, float wide) {
	return noise(p * 0.11 + vec2(clock * 0.3, clock * 0.17)) * (1.0 - smoothstep(2.0, 6.0, wide))
		+ 0.5 * noise(p * 0.37 - vec2(clock * 0.4, -clock * 0.3)) * (1.0 - smoothstep(0.6, 1.8, wide))
		+ 0.25 * noise(p * 1.1 + vec2(-clock * 0.5, clock * 0.6)) * (1.0 - smoothstep(0.2, 0.6, wide));
}

// The swell of the open sea at a place: two trains of long waves that run with the wind, bent
// by a slow noise so their crests are not straight lines. Between -1 and 1.
float swell(vec2 p) {
	float bend = 4.0 * noise(p * 0.006);
	return 0.6 * sin(dot(p, vec2(0.93, 0.36)) * 0.11 - clock * 1.1 + bend) + 0.4 * sin(dot(p, vec2(0.62, 0.78)) * 0.19 - clock * 1.5 - bend * 1.3);
}

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = world_position.xz;
	float depth = max(SEA - ground_here(p).x, 0.0);
	float wide = max(length(dFdx(p)), length(dFdy(p)));
	float here = ripples(p, wide);
	float calm = 1.0 / (1.0 + length(VERTEX) * 0.01);
	vec2 slope = vec2(ripples(p + vec2(0.4, 0.0), wide) - here, ripples(p + vec2(0.0, 0.4), wide) - here) * 0.9 * calm;
	// The swell rolls where the sea is deep, and is seen from farther than the ripples are.
	float open = smoothstep(2.0, 10.0, depth) * (1.0 - smoothstep(8.0, 30.0, wide));
	float crest = open > 0.0 ? swell(p) : 0.0;
	if (open > 0.0) {
		slope += vec2(swell(p + vec2(1.5, 0.0)) - crest, swell(p + vec2(0.0, 1.5)) - crest) * 0.22 * open;
	}
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
	float foam = smoothstep(1.5, 0.3, depth + (ripples(p, 0.0) - 0.9) * 1.1 * (1.0 - smoothstep(0.5, 3.0, wide)));
	// Surf: lines of foam that roll in over the shallows, one behind another, toward the shore.
	float surf = smoothstep(5.0, 0.6, depth) * smoothstep(0.78, 0.96, sin(depth * 2.1 + clock * 1.2 + 5.0 * noise(p * 0.03))) * (1.0 - smoothstep(0.5, 2.5, wide));
	foam = max(foam, 0.75 * surf);
	// White horses: in a gust the swell's crests break.
	foam = max(foam, 0.7 * open * smoothstep(0.3, 0.55, gust(p)) * smoothstep(0.72, 0.98, crest) * smoothstep(0.35, 0.7, noise(p * 0.5 + vec2(clock * 0.3, 0.0))));
	// The flyer's spray: the sea under it is beaten white, and a ring runs out from it.
	float under = distance(p, skims.xy);
	float ring = under - 9.0 - 2.5 * sin(clock * 5.0);
	foam = max(foam, skims.z * max(exp(-under * under / 30.0), 0.6 * exp(-ring * ring / 5.0)));
	// Rain pocks the sea.
	foam = max(foam, 0.25 * rain_on(p) * smoothstep(0.7, 0.9, noise(p * 1.7 + vec2(clock * 0.9, -clock * 0.7))) * (1.0 - smoothstep(0.3, 1.0, wide)));
	// Ice: plates of a noise that drifts slowly, on the seas of the cold lands in winter; a lit
	// beacon's warmth opens the water around it.
	float warmth = climate(p).x;
	float cold = winter * smoothstep(0.52, 0.42, warmth) * (1.0 - beacon_warmth(p));
	vec2 adrift = p - vec2(0.93, 0.36) * clock * 0.6;
	float floe = cold > 0.0 ? cold * smoothstep(0.47, 0.5 + wide * 0.02, fbm_seen(adrift / 26.0 + vec2(7.0, 51.0), 3, wide / 26.0)) : 0.0;
	NORMAL = normalize(mix(NORMAL, (VIEW_MATRIX * vec4(0.0, 1.0, 0.0, 0.0)).xyz, floe));
	// The sea takes its colour from its country: clear and turquoise over pale sand in the hot
	// ones, grey-green in the cold ones. Light dances on the bed of the shallows.
	float tropic = smoothstep(0.58, 0.78, warmth);
	float polar = smoothstep(0.45, 0.3, warmth);
	vec3 over_sand = mix(mix(shallow, vec3(0.01, 0.34, 0.3), tropic), vec3(0.012, 0.07, 0.07), polar);
	vec3 over_deep = mix(mix(deep, vec3(0.0, 0.006, 0.03), tropic), vec3(0.002, 0.004, 0.006), polar);
	if (depth < 4.0 && wide < 0.5) {
		vec2 net = p * 0.55;
		float lines = 1.0 - abs(noise(net + vec2(clock * 0.35, 0.0)) - noise(net.yx * 1.1 - vec2(0.0, clock * 0.3) + 9.0)) * 5.0;
		over_sand *= 1.0 + 0.5 * smoothstep(0.55, 1.0, lines) * (1.0 - night) * (1.0 - depth / 4.0) * (1.0 - wide * 2.0);
	}
	vec3 colour = mix(over_sand, over_deep, 1.0 - exp(-depth * mix(0.2, 0.13, tropic))) * cloud_shade(world_position);
	colour = mix(colour, vec3(0.9, 0.95, 1.0), foam * 0.8 * (1.0 - floe));
	ALBEDO = mix(colour, vec3(0.6, 0.7, 0.82) * (0.85 + 0.3 * noise(adrift / 3.0)) * cloud_shade(world_position), floe);
	// The ripples a pixel no longer shows still spread the light it reflects.
	// A gust roughens the sea where it passes, a darker patch that moves with the wind.
	float blown = gust(p) * (1.0 - smoothstep(10.0, 40.0, wide));
	ROUGHNESS = mix(mix(0.04 + 0.3 * smoothstep(0.15, 2.5, wide) + 0.3 * blown, 0.5, foam), 0.55, floe);
	SPECULAR = 0.8;
	// In a realm of wonders the sea is alight at night: its surf, and sparks in the swell.
	float alight = ground_here(p).w * night * (1.0 - floe);
	float sparks = smoothstep(0.75, 0.95, noise(p * 0.9 + vec2(clock * 0.4, -clock * 0.3))) * (1.0 - smoothstep(0.3, 1.2, wide)) * exp(-depth * 0.08);
	EMISSION = vec3(0.1, 0.7, 0.9) * foam * here * night * 0.9 * (1.0 - floe) + vec3(0.05, 0.9, 0.75) * alight * (3.0 * foam + 1.5 * sparks + 0.5 * exp(-depth * 0.25)) + vec3(1.0, 0.55, 0.16) * pulse_light(p) * (0.4 + 0.8 * night);
}
