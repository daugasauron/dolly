// The clouds to fly through: a small round cloud that boils in lobes, swirled through with every
// colour, with a hot heart and a rim of light bright enough to bloom (the environment's glow), and
// five sparks of white light that whirl around it on tilted rounds. One mesh for every cloud
// (main.gd's build_wisps): a ball of radius 1, the sparks marked by their second UV; halo.gdshader
// draws the same instances again as a haze of light around each. An instance's middle is a place
// of the chart with its height (lift carries it onto the sphere), its scale the cloud's radius; its
// colour has its place in its chain (x) and how it glowed before (w); its custom data how it glows
// now (x: 0 is not there), the clock when that was set (z), and for the next cloud of a chain the
// clock when the chain's time runs out (w).
shader_type spatial;
// No fog veils them: they are seen as they are from far off.
render_mode skip_vertex_transform, fog_disabled;

#include "res://wisp.gdshaderinc"

varying vec3 tint;
varying float glow;
varying vec3 inside;
varying float spark;
varying float place; // its place in its chain, a share of the colour wheel

void vertex() {
	glow = wisp_glow(COLOR.w, INSTANCE_CUSTOM);
	tint = wisp_tint(COLOR.x);
	place = COLOR.x / 6.0;
	spark = UV2.x;
	vec3 middle = MODEL_MATRIX[3].xyz;
	vec3 drawn = lift(middle);
	float size = wisp_size(glow, drawn, length(MODEL_MATRIX[0].xyz), VIEW_MATRIX);
	vec3 at = vec3(0.0);
	inside = VERTEX;
	if (size > 0.0) {
		if (spark > 0.5) {
			// A spark: a tenth of the cloud through, on a round of its own, tilted, twice as wide as the cloud.
			float round = clock * (2.2 + UV2.y * 0.37) + UV2.y * 1.2566;
			vec3 path = vec3(cos(round), 0.0, sin(round)) * (1.7 + 0.12 * UV2.y);
			float tilt = UV2.y * 0.9 - 1.8;
			path = vec3(path.x, path.z * sin(tilt), path.z * cos(tilt));
			at = VERTEX * 0.1 + path;
		} else {
			// The ball boils: lobes rise through it, and it breathes and turns.
			vec3 seed = vec3(middle.x * 0.013, -clock * 0.5, middle.z * 0.013);
			float boil = noise3(VERTEX * 1.4 + seed) * 0.6 + noise3(VERTEX * 3.6 + seed * 1.7) * 0.4;
			float turned = clock * 0.6 + middle.x;
			vec3 spun = vec3(VERTEX.x * cos(turned) - VERTEX.z * sin(turned), VERTEX.y, VERTEX.x * sin(turned) + VERTEX.z * cos(turned));
			inside = spun;
			at = spun * (0.65 + 0.85 * boil) * (1.0 + 0.06 * sin(clock * 3.1 + middle.z));
		}
	}
	VERTEX = (VIEW_MATRIX * vec4(drawn + at * size, 1.0)).xyz;
	NORMAL = normalize((VIEW_MATRIX * vec4(normalize(inside), 0.0)).xyz);
}

void fragment() {
	float facing = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	// Every colour swirls through it in hard bands that wander and turn, a dark seam between each
	// two: a sixth of the wheel a band, so neighbours differ. (Worked out before the branch below:
	// a derivative, fwidth, is only had where every pixel takes the same way.)
	float swirl = dot(inside, vec3(0.5, 1.1, 0.3)) * 1.2 + noise3(inside * 2.2 + vec3(clock * 0.3)) * 1.6 + clock * 0.4;
	float band = swirl * 3.0;
	float seam = smoothstep(0.42 - fwidth(band), 0.5, abs(fract(band) - 0.5));
	if (spark > 0.5) {
		// Each spark a colour of its own, round the wheel as it goes.
		vec3 own = rainbow(UV2.y * 0.2 + clock * 0.3);
		ALBEDO = own;
		EMISSION = own * (1.0 + 1.2 * glow);
	} else {
		vec3 colour = mix(rainbow(floor(band) / 6.0 + place), tint, 0.15) * (1.0 - 0.85 * seam);
		ALBEDO = colour * 0.5;
		ROUGHNESS = 0.35;
		// Lit from within in its colours, brightest at its rim, each band in its own: no two hues
		// add up to white there, and none is so bright that the tone mapping whitens it.
		EMISSION = colour * (0.5 + 0.4 * facing + 0.9 * pow(1.0 - facing, 2.0)) * (0.55 + 0.35 * min(glow, 2.0));
	}
}
