// The clouds to fly through: a small round cloud whose puffs boil in lobes, marbled with pastel
// bands, a pearly sheen at its rim that runs through the colours, a light at its heart in the
// colour of its place in its chain, and three small puffs that circle it. One mesh for every cloud
// (main.gd's build_wisps): a ball of radius 1, the small puffs marked by their second UV. An
// instance's middle is a place of the chart with its height (lift carries it onto the sphere), its
// scale the cloud's radius; its colour has its place in its chain (x) and how it glowed before (w);
// its custom data how it glows now (x: 0 is not there), how far it is spent (y), the clock when
// that was set (z), and for the next cloud of a chain the clock when the chain's time runs out (w).
shader_type spatial;
render_mode skip_vertex_transform;

#include "res://terrain.gdshaderinc"

const vec3 HUES[6] = { vec3(0.45, 0.85, 1.0), vec3(0.5, 1.0, 0.7), vec3(0.8, 0.6, 1.0), vec3(1.0, 0.55, 0.85), vec3(1.0, 0.78, 0.4), vec3(1.0, 0.45, 0.3) };

varying vec3 tint;
varying float glow;
varying float spent;
varying vec3 inside;

void vertex() {
	float changing = smoothstep(0.0, 0.5, clock - INSTANCE_CUSTOM.z);
	spent = INSTANCE_CUSTOM.y * changing;
	glow = mix(COLOR.w, INSTANCE_CUSTOM.x, changing);
	// The next cloud of a chain beats, faster as the chain's time runs out.
	float left = INSTANCE_CUSTOM.w - clock;
	if (left > 0.0) {
		glow *= 1.0 + 0.4 * sin(clock * (7.0 + 12.0 * exp(-left)));
	}
	tint = HUES[clamp(int(COLOR.x + 0.5), 0, 5)];
	vec3 middle = MODEL_MATRIX[3].xyz;
	float wide = length(MODEL_MATRIX[0].xyz);
	// A small puff is a quarter of the cloud through.
	float big = UV2.x > 0.5 ? 0.25 : 1.0;
	// The puffs boil: the ball bulges in lobes that rise through it, with smaller ones on them.
	vec3 seed = vec3(middle.x * 0.013 + UV2.y * 7.0, -clock * 0.35, middle.z * 0.013);
	float boil = noise3(VERTEX * 1.4 + seed) * 0.5 + noise3(VERTEX * 3.6 + seed * 1.7) * 0.3 + noise3(VERTEX * 7.5 - seed) * 0.2;
	vec3 at = VERTEX * big * (0.6 + 0.95 * boil);
	if (UV2.x > 0.5) {
		// On a tilted round half again as wide as the cloud.
		float round = clock * 0.7 + UV2.y * 2.0944;
		at += vec3(cos(round), 0.3 * sin(round + UV2.y * 1.7), sin(round)) * 1.55;
	}
	inside = VERTEX * big;
	// A cloud that is not there has no size; one comes and goes by degrees. Far off, past 250
	// times its radius, it fades out of sight, so none comes at once.
	vec3 drawn = lift(middle);
	float far = length((VIEW_MATRIX * vec4(drawn, 1.0)).xyz) / wide;
	float size = smoothstep(0.0, 0.3, glow) * (1.0 - smoothstep(250.0, 300.0, far));
	VERTEX = (VIEW_MATRIX * vec4(drawn + at * wide * size, 1.0)).xyz;
	// Lit as a soft ball: the lobes do not darken its sides.
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(inside), 0.0)).xyz);
}

void fragment() {
	float rim = 1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	// Pastel bands marble it, turning slowly; the sheen at its rim runs through the colours.
	float marble = sin(dot(inside, vec3(2.3, 4.1, 1.7)) * 2.0 + noise3(inside * 2.5 + vec3(clock * 0.2)) * 5.0 + clock * 0.4);
	vec3 pearl = 0.55 + 0.45 * cos(6.2832 * (rim * 0.9 + clock * 0.06 + inside.y * 0.3 + vec3(0.0, 0.33, 0.67)));
	vec3 body = mix(vec3(0.97, 0.97, 1.0), mix(tint, pearl, 0.4), 0.4 + 0.3 * marble);
	vec3 ghost = vec3(1.0, 0.72, 0.4);
	ALBEDO = mix(body, ghost, spent * 0.5);
	ROUGHNESS = 0.95;
	// A light at its heart, seen through its middle, and the sheen at its rim: as bright as it glows.
	vec3 light = tint * (1.0 - rim) * (1.0 - rim) * 0.6 + pearl * rim * rim * 0.8;
	EMISSION = mix(light, ghost * 0.15, spent) * (0.25 + 0.35 * glow);
}
