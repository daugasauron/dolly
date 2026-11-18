// The rings to fly through: a hoop of glass, six-sided as a crystal, and three motes that circle
// it. One mesh for every ring (main.gd's build_rings): the hoop is a torus of radius 1 around y,
// its tube 0.045 thick, and the motes are marked by their second UV. An instance's colour has
// its hue (z) and how it glowed before (w); its custom data how it glows now (x), how far it is
// a passed ring's amber (y), the clock when that was set (z), and for the next ring of a chain
// the clock when the chain's time runs out (w).
shader_type spatial;

uniform float clock = 0.0;
uniform vec3 flyer_at = vec3(0.0);

const vec3 HUES[4] = { vec3(0.2, 0.8, 1.0), vec3(0.75, 0.3, 1.0), vec3(0.25, 1.0, 0.5), vec3(1.0, 0.35, 0.6) };

varying vec3 glass;
varying float glow;

void vertex() {
	float changing = smoothstep(0.0, 0.5, clock - INSTANCE_CUSTOM.z);
	float amber = INSTANCE_CUSTOM.y * changing;
	glow = mix(COLOR.w, INSTANCE_CUSTOM.x, changing);
	// The next ring of a chain beats, faster as the chain's time runs out.
	float left = INSTANCE_CUSTOM.w - clock;
	if (left > 0.0) {
		glow *= 1.0 + 0.5 * sin(clock * (8.0 + 14.0 * exp(-left)));
	}
	glass = mix(HUES[int(COLOR.z)], vec3(1.0, 0.62, 0.15), amber);
	// A ring comes into sight by degrees as the flight nears it, growing out of nothing.
	float seen = 1.0 - smoothstep(640.0, 760.0, distance(MODEL_MATRIX[3].xz, flyer_at.xz));
	float wide = length(MODEL_MATRIX[0].xyz);
	if (UV2.x > 0.5) {
		// A mote: a ball half a unit through, on the hoop, a third of the way round from the next.
		float round = clock * (0.5 + 0.35 * glow) + UV2.y * 2.0944;
		VERTEX = vec3(cos(round), 0.0, sin(round)) + VERTEX * 0.9 * seen / wide;
		glow *= 1.6;
	} else {
		// From afar the hoop is never thinner than a pixel and a half, which would flicker; it
		// is as much fainter.
		float far = length((MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
		float thick = max(1.0, far * 0.0016 / (0.045 * wide));
		VERTEX += NORMAL * 0.045 * (thick * seen - 1.0);
		glow /= thick;
	}
}

void fragment() {
	ALBEDO = glass * 0.5;
	ROUGHNESS = 0.15;
	EMISSION = glass * glow;
}
