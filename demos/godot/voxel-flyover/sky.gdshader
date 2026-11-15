// The sky of a whole day: its colours follow the sun's height, with its disc and glow, a band of
// sunset around it when it is low, and at night stars, the moon and an aurora. A layer of cloud
// drifts across it, the one whose shade falls on the ground (terrain.gdshaderinc), lit on the
// sun's side. Stars and aurora are left out of the radiance map, which lights the scene.
shader_type sky;
#include "res://terrain.gdshaderinc"

uniform vec3 sun_direction = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_colour : source_color = vec3(1.0);
uniform float rains = 0.0; // the rain over the camera: with the sun out it stands a rainbow in it

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
	vec3 zenith = mix(vec3(0.004, 0.008, 0.035), vec3(0.06, 0.22, 0.7), day);
	vec3 horizon = mix(vec3(0.02, 0.035, 0.1), vec3(0.5, 0.72, 0.95), day);
	float toward = max(dot(EYEDIR, sun_direction), 0.0);
	// Sunrise and sunset: the horizon burns around the sun and the zenith turns violet.
	horizon = mix(horizon, mix(vec3(0.95, 0.45, 0.4), vec3(1.0, 0.4, 0.1), toward * toward), low * (0.55 + 0.45 * toward));
	zenith = mix(zenith, vec3(0.14, 0.1, 0.4), low * 0.65);
	float rise = 1.0 - pow(1.0 - clamp(up, 0.0, 1.0), 5.0);
	vec3 colour = mix(horizon, zenith, rise);
	// At sunrise and sunset the sky is in bands. On the sun's side: fire at the horizon, rose
	// over it, violet higher. Opposite the sun: the earth's shadow, blue-grey along the
	// horizon, and over it a rose band. Between the two sides they turn into one another.
	float sunward = 0.5 + 0.5 * dot(normalize(EYEDIR.xz + vec2(0.0001)), normalize(sun_direction.xz + vec2(0.0001)));
	vec3 dusk = mix(mix(vec3(1.0, 0.33, 0.04), vec3(1.0, 0.42, 0.45), smoothstep(0.0, 0.16, up)), vec3(0.42, 0.26, 0.7), smoothstep(0.1, 0.42, up));
	vec3 away = mix(vec3(0.24, 0.28, 0.48), vec3(0.95, 0.52, 0.6), smoothstep(0.02, 0.1, up) * (1.0 - smoothstep(0.12, 0.32, up)));
	colour = mix(colour, mix(away, dusk, smoothstep(0.15, 0.85, sunward)), low * (1.0 - smoothstep(0.2, 0.65, up)) * 0.85);
	colour = mix(colour, horizon * 0.7, smoothstep(0.0, -0.25, up));
	vec3 sun = sun_colour * smoothstep(-0.08, 0.02, sun_height);
	// The sun: its disc, larger and redder when it is low, a glow around it, and at the
	// horizon a band of its light to either side.
	float disc = mix(0.9992, 0.9978, low);
	colour += sun * (smoothstep(disc, disc + 0.0004, toward) * 14.0 + pow(toward, 64.0) * (1.2 + 1.5 * low) + pow(toward, 8.0) * (0.25 + 0.35 * low));
	colour += vec3(1.0, 0.45, 0.12) * low * exp(-abs(up - max(sun_height, 0.0)) * 16.0) * pow(sunward, 5.0) * 0.6 * smoothstep(-0.2, 0.0, sun_height);
	float dark = 1.0 - smoothstep(-0.3, -0.06, sun_height);
	if (!AT_CUBEMAP_PASS && dark > 0.0 && up > 0.0) {
		vec3 cell = floor(EYEDIR * 300.0);
		float star = step(0.9965, star_hash(cell)) * star_hash(cell + 7.0);
		colour += vec3(0.9, 0.93, 1.0) * star * dark * smoothstep(0.0, 0.25, up) * (3.0 + 2.0 * sin(clock * 3.0 + star * 90.0));
		// A river of stars across the sky: a band of faint light with dark lanes in it, and
		// in it many more and fainter stars.
		vec3 pole = normalize(vec3(0.55, 0.45, -0.7));
		vec3 across = normalize(cross(pole, vec3(0.0, 1.0, 0.0)));
		float off_band = dot(EYEDIR, pole);
		float band = exp(-off_band * off_band * 22.0) * smoothstep(0.0, 0.25, up) * dark;
		vec2 along = vec2(atan(dot(EYEDIR, cross(pole, across)), dot(EYEDIR, across) + 0.0001) * 4.0, off_band * 9.0);
		float lanes = smoothstep(0.25, 0.7, noise(along * 1.7 + 3.0) * 0.6 + noise(along * 4.3) * 0.4);
		colour += mix(vec3(0.05, 0.07, 0.16), vec3(0.16, 0.12, 0.2), noise(along + 20.0)) * band * lanes * 0.55;
		vec3 fine = floor(EYEDIR * 520.0);
		colour += vec3(0.85, 0.9, 1.0) * step(1.0 - 0.02 * band * lanes, star_hash(fine)) * star_hash(fine + 3.0) * 1.6;
		// A shooting star every six seconds: a point that crosses a part of the sky in a second,
		// with what it has just crossed still alight behind it.
		float turn = floor(clock / 6.0);
		float since = fract(clock / 6.0) * 6.0;
		vec3 from = normalize(vec3(star_hash(vec3(turn, 1.0, 2.0)) * 2.0 - 1.0, 0.45 + 0.4 * star_hash(vec3(turn, 3.0, 4.0)), star_hash(vec3(turn, 5.0, 6.0)) * 2.0 - 1.0));
		vec3 way = normalize(cross(from, vec3(0.3, 1.0, 0.2)));
		for (int trail = 0; trail < 4; trail++) {
			vec3 head = normalize(from + way * (since - float(trail) * 0.035) * 0.5);
			colour += vec3(0.9, 0.95, 1.0) * dark * exp(-(1.0 - dot(EYEDIR, head)) * 90000.0) * sin(clamp(since, 0.0, 1.0) * 3.1416) * (3.0 - float(trail) * 0.7);
		}
		// The moon, opposite the sun.
		float moon = dot(EYEDIR, -sun_direction);
		colour += vec3(0.8, 0.88, 1.0) * dark * (smoothstep(0.9993, 0.9996, moon) * 2.5 + pow(max(moon, 0.0), 400.0) * 0.15);
		// Curtains of aurora in the north.
		vec2 plane = EYEDIR.xz / (up + 0.25);
		float phase = clock * 0.25;
		float curtain = band_noise(plane.x * 2.3 + phase + sin(plane.y * 1.7 + phase * 0.6) * 1.5);
		float rays = 0.6 + 0.4 * band_noise(plane.x * 17.0 - phase * 2.0);
		float sheet = smoothstep(0.5, 0.95, curtain) * rays * smoothstep(0.05, 0.3, up) * smoothstep(0.9, 0.35, up) * smoothstep(-0.2, 0.5, -EYEDIR.z);
		colour += mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.2, 0.9), smoothstep(0.25, 0.75, up)) * sheet * dark * 1.1;
	}
	// High cloud: thin streaks far over the clouds, across the wind, in patches of some
	// kilometres. It keeps the sun's light after the ground has lost it: fire and rose.
	if (!AT_CUBEMAP_PASS && up > 0.03) {
		vec2 high = POSITION.xz + EYEDIR.xz * (2600.0 - POSITION.y) / up - vec2(0.93, 0.36) * clock * 30.0;
		float streaks = noise(vec2(dot(high, vec2(0.36, -0.93)) / 240.0, dot(high, vec2(0.93, 0.36)) / 2400.0) + noise(high / 1700.0) * 2.0);
		float thin = smoothstep(0.45, 0.95, streaks) * smoothstep(0.42, 0.75, noise(high / 8000.0 + 17.0)) * smoothstep(0.03, 0.22, up) * (1.0 - 0.85 * dark);
		vec3 lit = sun * 0.9 + horizon * 0.35 + vec3(0.05, 0.07, 0.12) * dark;
		lit = mix(lit, mix(vec3(1.0, 0.5, 0.62), vec3(1.6, 0.6, 0.2), smoothstep(0.3, 0.95, sunward)) * smoothstep(-0.3, -0.05, sun_height), low);
		colour = mix(colour, lit, thin * 0.36);
	}
	if (up > 0.012) {
		float far = (CLOUD_HEIGHT - POSITION.y) / up;
		vec2 over = POSITION.xz + EYEDIR.xz * far;
		float cover = cloud_cover(over, AT_CUBEMAP_PASS ? 3 : 5);
		if (cover > 0.0) {
			// A cloud is bright where little cloud stands between it and the light.
			float before = cloud_cover(over + to_light.xz * 140.0 * handover, 3);
			float bright = exp(-before * 2.2) * (0.6 + 0.4 * (1.0 - cover));
			vec3 moonlight = vec3(0.05, 0.07, 0.12) * dark;
			vec3 shadow = mix(zenith, horizon, 0.35) * 0.55 + moonlight * 0.4;
			vec3 lit = sun * (1.15 + 2.5 * pow(toward, 6.0) * (1.0 - cover)) + horizon * 0.25 + moonlight;
			// A low sun lights the clouds from below: fire toward it, rose away from it, and
			// their shadowed parts are violet.
			lit = mix(lit, mix(vec3(0.95, 0.5, 0.6), vec3(1.5, 0.55, 0.16), smoothstep(0.3, 0.95, sunward)) * smoothstep(-0.16, 0.0, sun_height), low * 0.8);
			shadow = mix(shadow, vec3(0.24, 0.16, 0.36) * (0.5 + 0.5 * smoothstep(-0.2, 0.05, sun_height)), low * 0.7);
			colour = mix(colour, mix(shadow, lit, bright), cover * exp(-far / 7000.0));
		}
	}
	// The rainbow: a bow 42 degrees around the point opposite the sun, red outside, while it rains
	// in sunlight.
	float bow = (dot(EYEDIR, -sun_direction) - 0.72) / 0.05;
	if (!AT_CUBEMAP_PASS && rains > 0.0 && bow > 0.0 && bow < 1.0 && up > 0.0) {
		colour += (0.5 + 0.5 * cos(6.2832 * (bow * 0.75 + vec3(0.0, 0.33, 0.67)))) * sin(bow * 3.1416) * rains * smoothstep(0.02, 0.3, sun_height) * smoothstep(0.0, 0.12, up) * 0.3;
	}
	COLOR = colour;
}
