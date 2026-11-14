// The sky of a whole day: its colours follow the sun's height, with its disc and glow, a band of
// sunset around it when it is low, and at night stars, the moon and an aurora. Stars and aurora
// are left out of the radiance map, which lights the scene.
shader_type sky;

uniform vec3 sun_direction = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_colour : source_color = vec3(1.0);
uniform float aurora_phase = 0.0;

float star_hash(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float band_noise(float x) {
	float i = floor(x);
	float f = x - i;
	float a = fract(sin(i * 127.1) * 43758.5453);
	float b = fract(sin((i + 1.0) * 127.1) * 43758.5453);
	return mix(a, b, f * f * (3.0 - 2.0 * f));
}

void sky() {
	float up = EYEDIR.y;
	float sun_height = sun_direction.y;
	float day = smoothstep(-0.12, 0.25, sun_height);
	float low = smoothstep(-0.25, 0.0, sun_height) * (1.0 - smoothstep(0.05, 0.45, sun_height));
	vec3 zenith = mix(vec3(0.006, 0.012, 0.045), vec3(0.09, 0.3, 0.78), day);
	vec3 horizon = mix(vec3(0.03, 0.05, 0.13), vec3(0.55, 0.75, 0.95), day);
	float toward = max(dot(EYEDIR, sun_direction), 0.0);
	// Sunrise and sunset: the horizon burns around the sun and the zenith turns violet.
	horizon = mix(horizon, mix(vec3(0.95, 0.5, 0.35), vec3(1.0, 0.42, 0.12), toward * toward), low * (0.55 + 0.45 * toward));
	zenith = mix(zenith, vec3(0.16, 0.14, 0.42), low * 0.6);
	float rise = 1.0 - pow(1.0 - clamp(up, 0.0, 1.0), 5.0);
	vec3 colour = mix(horizon, zenith, rise);
	colour = mix(colour, horizon * 0.7, smoothstep(0.0, -0.25, up));
	vec3 sun = sun_colour * smoothstep(-0.08, 0.02, sun_height);
	colour += sun * (smoothstep(0.9992, 0.9996, toward) * 12.0 + pow(toward, 64.0) * 1.1 + pow(toward, 8.0) * 0.22);
	if (!AT_CUBEMAP_PASS) {
		float night = 1.0 - smoothstep(-0.3, -0.06, sun_height);
		if (night > 0.0 && up > 0.0) {
			vec3 cell = floor(EYEDIR * 300.0);
			float star = step(0.9965, star_hash(cell)) * star_hash(cell + 7.0);
			colour += vec3(0.9, 0.93, 1.0) * star * night * smoothstep(0.0, 0.25, up) * 4.0;
			// The moon, opposite the sun.
			float moon = dot(EYEDIR, -sun_direction);
			colour += vec3(0.8, 0.88, 1.0) * night * (smoothstep(0.9993, 0.9996, moon) * 2.0 + pow(max(moon, 0.0), 400.0) * 0.12);
			// Curtains of aurora in the north.
			vec2 plane = EYEDIR.xz / (up + 0.25);
			float curtain = band_noise(plane.x * 2.3 + aurora_phase + sin(plane.y * 1.7 + aurora_phase * 0.6) * 1.5);
			float rays = 0.6 + 0.4 * band_noise(plane.x * 17.0 - aurora_phase * 2.0);
			float sheet = smoothstep(0.5, 0.95, curtain) * rays * smoothstep(0.05, 0.3, up) * smoothstep(0.9, 0.35, up) * smoothstep(-0.2, 0.5, -EYEDIR.z);
			colour += mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.2, 0.9), smoothstep(0.25, 0.75, up)) * sheet * night * 0.9;
		}
	}
	COLOR = colour;
}
