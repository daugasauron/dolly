// The sky from sunset to night: a gradient over the horizon, the sun's disc and glow, and stars
// as the night comes. The stars are left out of the radiance map, which lights the scene. No TIME:
// the sky is redrawn only when the game changes its colours.
shader_type sky;

uniform vec3 top_color : source_color = vec3(0.1, 0.08, 0.27);
uniform vec3 horizon_color : source_color = vec3(0.96, 0.5, 0.36);
uniform vec3 below_color : source_color = vec3(0.6, 0.3, 0.35);
uniform float night : hint_range(0.0, 1.0) = 0.0;

float star_hash(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void sky() {
	float up = EYEDIR.y;
	// A narrow band of horizon colour under the top's, as at sunset.
	vec3 color = mix(horizon_color, top_color, 1.0 - pow(1.0 - clamp(up, 0.0, 1.0), 7.0));
	color = mix(color, below_color, smoothstep(0.0, -0.3, up));
	if (LIGHT0_ENABLED) {
		float toward = max(dot(EYEDIR, LIGHT0_DIRECTION), 0.0);
		float disc = smoothstep(0.9993, 0.9996, toward);
		vec3 sun = LIGHT0_COLOR * LIGHT0_ENERGY;
		color += sun * (disc * 6.0 + pow(toward, 48.0) * 0.8 + pow(toward, 6.0) * 0.18);
	}
	if (!AT_CUBEMAP_PASS && night > 0.0 && up > 0.0) {
		vec3 cell = floor(EYEDIR * 260.0);
		float star = step(0.9968, star_hash(cell)) * star_hash(cell + 7.0);
		color += vec3(0.9, 0.92, 1.0) * star * night * smoothstep(0.0, 0.3, up) * 3.0;
	}
	COLOR = color;
}
