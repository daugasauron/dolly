// The sky of a whole day: its colours follow the sun's height, with its disc and glow, a band of
// sunset around it when it is low, and at night stars and an aurora; the other world, the moon from
// the planet or the planet from the moon, and the near one from far over it. A layer of cloud drifts
// across it, the one whose shade falls on the ground (terrain.gdshaderinc), lit on the
// sun's side. Stars and aurora are left out of the radiance map, which lights the scene.
shader_type sky;
#include "res://terrain.gdshaderinc"

uniform vec3 sun_direction = vec3(0.0, 1.0, 0.0);
uniform vec3 sun_colour : source_color = vec3(1.0);
uniform float rains = 0.0; // the rain over the camera: with the sun out it stands a rainbow in it
uniform float eye_height = 0.0; // the camera's
uniform float sun_seen = 1.0; // the sun's height over the horizon the camera has at its height

// The worlds in the sky (main.gd's set_bodies): the other one, and the one the flight is near once
// it is so high over it that its far grids go (near_shown). For each, the way to its middle from the
// camera and the distance, its radius, and its ground (ground.gdshader's whole); sky_axes turns the
// sky's ways into the worlds' axes, in which the grounds are laid out.
uniform mat3 sky_axes = mat3(1.0);
uniform vec3 far_way = vec3(0.0, 1.0, 0.0);
uniform float far_distance = 1.0e7;
uniform float far_radius = 1.0;
uniform sampler2D far_ground : filter_linear, repeat_enable;
uniform vec3 near_way = vec3(0.0, -1.0, 0.0);
uniform float near_distance = 1.0e7;
uniform sampler2D near_ground : filter_linear, repeat_enable;
uniform float near_shown = 0.0;

// A world seen along `dir`: its colour, and how much of the pixel it covers (rgb, a). Its ground's
// height and climate give it the colours the land's shader gives the planet seen from orbit (the
// sea, the woods, the deserts, the snow) or the moon's dust, lit by the sun, with the planet's air
// at its rim and its towns' lights on its night side.
vec4 world_seen(vec3 dir, vec3 way, float distance, float radius, sampler2D ground, bool planet) {
	float along = dot(dir, way);
	float off = 1.0 - (radius / distance) * (radius / distance);
	float h = along * along - off;
	if (h <= 0.0 || along <= 0.0) {
		return vec4(0.0);
	}
	vec3 normal = normalize(dir * (along - sqrt(h)) - way);
	vec3 local = sky_axes * normal;
	vec4 here = textureLod(ground, vec2(atan(local.z, local.x) / 6.2831853 + 0.5, acos(clamp(local.y, -1.0, 1.0)) / 3.1415927), 0.0);
	float height = here.x + HEIGHT_KEPT;
	float lit = max(dot(normal, sun_direction), 0.0);
	vec3 colour;
	if (planet) {
		vec3 sea = mix(vec3(0.01, 0.05, 0.16), vec3(0.02, 0.16, 0.2), smoothstep(SEA - 20.0, SEA, height));
		vec3 land = mix(vec3(0.42, 0.36, 0.24), vec3(0.1, 0.2, 0.07), smoothstep(0.38, 0.6, here.z));
		land = mix(land, vec3(0.38, 0.36, 0.34), smoothstep(150.0, 300.0, height));
		colour = height < SEA ? sea : land;
		colour = mix(colour, vec3(0.85, 0.88, 0.92), smoothstep(0.24, 0.12, here.y));
		float rim = 1.0 - max(dot(normal, -dir), 0.0);
		colour = colour * (lit * sun_colour * 1.4 + 0.015) + vec3(0.3, 0.5, 1.0) * pow(rim, 3.0) * (0.15 + lit) * 0.6;
		colour += vec3(1.0, 0.6, 0.25) * smoothstep(0.62, 0.7, here.w) * smoothstep(0.1, -0.05, dot(normal, sun_direction)) * 0.4;
	} else {
		colour = mix(vec3(0.36, 0.36, 0.37), vec3(0.16, 0.16, 0.17), here.y) * (1.0 + 0.7 * here.z) * (0.75 + height / 600.0);
		colour *= lit * sun_colour * 1.5 + 0.01;
	}
	return vec4(colour, clamp(sqrt(h) / 0.0012, 0.0, 1.0));
}

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
	// The planet: from a height the horizon lies under eye level, and `up` is the height of a
	// direction over it. The air a ray looks through is over the camera when it looks up, and
	// where the ray passes nearest the planet when it looks down past its rim: that place's
	// sun colours it, so from orbit the rim has its day, its night and its sunsets.
	float from_middle = RADIUS + max(eye_height, 0.0);
	float dip = RADIUS / from_middle;
	float level_way = sqrt(max(1.0 - EYEDIR.y * EYEDIR.y, 0.0));
	float up = EYEDIR.y * dip + level_way * sqrt(max(1.0 - dip * dip, 0.0));
	vec3 nearest = normalize(vec3(0.0, from_middle, 0.0) - EYEDIR * (from_middle * min(EYEDIR.y, 0.0)));
	float sun_height = dot(nearest, sun_direction);
	// How much air the ray passes, in heights of the air (1 straight up from the ground): the
	// camera's column thinned by its height, or for a ray that dips toward the planet the whole
	// passage around its nearest point less what lies behind the camera.
	// The moon has no air: its sky is black by day, and nothing in it is the air's.
	// Nor, as the far grids go (near_shown), has the planet seen from far over it: there the sky draws it, as
	// it does from the moon.
	float air = on_moon ? 0.0 : 1.0 - near_shown;
	float thinned = exp(-max(eye_height, 0.0) / AIR) * air;
	float grazing = sqrt(1.5708 * from_middle / AIR);
	float thick = thinned * grazing / (grazing * abs(EYEDIR.y) + 1.0);
	if (EYEDIR.y < 0.0) {
		float passes = from_middle * level_way;
		thick = 2.0 * sqrt(1.5708 * passes / AIR) * exp(min((RADIUS - passes) / AIR, 0.0)) - thick;
	}
	float air_seen = 1.0 - exp(-thick * air * 3.5);
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
	// (Kept within 0 and 1: rounding puts it a hair under 0 opposite the sun, where a power of it is
	// no number; in Chrome on an AMD GPU that went from the radiance map into every lit pixel.)
	float sunward = clamp(0.5 + 0.5 * dot(normalize(EYEDIR.xz + vec2(0.0001)), normalize(sun_direction.xz + vec2(0.0001))), 0.0, 1.0);
	vec3 dusk = mix(mix(vec3(1.0, 0.33, 0.04), vec3(1.0, 0.42, 0.45), smoothstep(0.0, 0.16, up)), vec3(0.42, 0.26, 0.7), smoothstep(0.1, 0.42, up));
	vec3 away = mix(vec3(0.24, 0.28, 0.48), vec3(0.95, 0.52, 0.6), smoothstep(0.02, 0.1, up) * (1.0 - smoothstep(0.12, 0.32, up)));
	colour = mix(colour, mix(away, dusk, smoothstep(0.15, 0.85, sunward)), low * (1.0 - smoothstep(0.2, 0.65, up)) * 0.85);
	colour = mix(colour, horizon * 0.7, smoothstep(0.0, -0.25, up));
	vec3 sun = sun_colour * smoothstep(-0.08, 0.02, max(sun_height, sun_seen));
	// The sun: its disc, larger and redder when it is low, a glow around it, and at the
	// horizon a band of its light to either side.
	float disc = mix(0.9992, 0.9978, low);
	colour += sun * (pow(toward, 64.0) * (1.2 + 1.5 * low) + pow(toward, 8.0) * (0.25 + 0.35 * low));
	colour += vec3(1.0, 0.45, 0.12) * low * exp(-abs(up - max(sun_height, 0.0)) * 16.0) * pow(sunward, 5.0) * 0.6 * smoothstep(-0.2, 0.0, sun_height);
	// Out of the air the sky is black by day too, and the stars are out; the sun's disc is
	// as bright there.
	colour *= air_seen;
	// The other world, beyond the air, which veils it by day: what is behind it (the sun's disc, the
	// stars) is not seen there, and what is in the air (its light, its clouds, the aurora) is.
	vec4 far_world = world_seen(EYEDIR, far_way, far_distance, far_radius, far_ground, on_moon);
	colour += far_world.rgb * far_world.a * (1.0 - 0.7 * air_seen);
	float behind = 1.0 - far_world.a;
	colour += sun * smoothstep(disc, disc + 0.0004, toward) * 14.0 * behind;
	float dark = max(1.0 - smoothstep(-0.3, -0.06, sun_height), 1.0 - air_seen);
	if (!AT_CUBEMAP_PASS && dark * behind > 0.0 && up > 0.0) {
		// The stars are fixed in the worlds' axes, not the chart's: they stay where they are when the
		// flight crosses to the other world, whose chart's axes are others.
		vec3 star_way = sky_axes * EYEDIR;
		vec3 cell = floor(star_way * 300.0);
		float star = step(0.9965, star_hash(cell)) * star_hash(cell + 7.0);
		colour += vec3(0.9, 0.93, 1.0) * star * dark * smoothstep(0.0, 0.25, up) * (3.0 + 2.0 * sin(clock * 3.0 + star * 90.0));
		// A river of stars across the sky: a band of faint light with dark lanes in it, and
		// in it many more and fainter stars.
		vec3 pole = normalize(vec3(0.55, 0.45, -0.7));
		vec3 across = normalize(cross(pole, vec3(0.0, 1.0, 0.0)));
		float off_band = dot(star_way, pole);
		float band = exp(-off_band * off_band * 22.0) * smoothstep(0.0, 0.25, up) * dark;
		vec2 along = vec2(atan(dot(star_way, cross(pole, across)), dot(star_way, across) + 0.0001) * 4.0, off_band * 9.0);
		float lanes = smoothstep(0.25, 0.7, noise(along * 1.7 + 3.0) * 0.6 + noise(along * 4.3) * 0.4);
		colour += mix(vec3(0.05, 0.07, 0.16), vec3(0.16, 0.12, 0.2), noise(along + 20.0)) * band * lanes * 0.55;
		vec3 fine = floor(star_way * 520.0);
		colour += vec3(0.85, 0.9, 1.0) * step(1.0 - 0.02 * band * lanes, star_hash(fine)) * star_hash(fine + 3.0) * 1.6;
		// A shooting star every six seconds: a point that crosses a part of the sky in a second,
		// with what it has just crossed still alight behind it.
		float turn = floor(clock / 6.0);
		float since = fract(clock / 6.0) * 6.0;
		vec3 from = normalize(vec3(star_hash(vec3(turn, 1.0, 2.0)) * 2.0 - 1.0, 0.45 + 0.4 * star_hash(vec3(turn, 3.0, 4.0)), star_hash(vec3(turn, 5.0, 6.0)) * 2.0 - 1.0));
		vec3 way = normalize(cross(from, vec3(0.3, 1.0, 0.2)));
		for (int trail = 0; trail < 4; trail++) {
			vec3 head = normalize(from + way * (since - float(trail) * 0.035) * 0.5);
			colour += vec3(0.9, 0.95, 1.0) * dark * exp(-(1.0 - dot(star_way, head)) * 90000.0) * sin(clamp(since, 0.0, 1.0) * 3.1416) * (3.0 - float(trail) * 0.7);
		}
		// Curtains of aurora in the north.
		vec2 plane = EYEDIR.xz / (up + 0.25);
		float phase = clock * 0.25;
		float curtain = band_noise(plane.x * 2.3 + phase + sin(plane.y * 1.7 + phase * 0.6) * 1.5);
		float rays = 0.6 + 0.4 * band_noise(plane.x * 17.0 - phase * 2.0);
		float sheet = smoothstep(0.5, 0.95, curtain) * rays * smoothstep(0.05, 0.3, up) * smoothstep(0.9, 0.35, up) * smoothstep(-0.2, 0.5, -EYEDIR.z);
		// The aurora is in the air, over a night's ground: from out of the air it is not in the sky.
		colour += mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.2, 0.9), smoothstep(0.25, 0.75, up)) * sheet * (1.0 - smoothstep(-0.3, -0.06, sun_height)) * thinned * 1.1;
	}
	// High cloud: thin streaks far over the clouds, across the wind, in patches of some
	// kilometres. It keeps the sun's light after the ground has lost it: fire and rose.
	if (!AT_CUBEMAP_PASS && !on_moon && EYEDIR.y > 0.03 && eye_height < 2400.0) {
		vec2 high = POSITION.xz + EYEDIR.xz * (2600.0 - eye_height) / EYEDIR.y - vec2(0.93, 0.36) * clock * 30.0;
		float streaks = noise(vec2(dot(high, vec2(0.36, -0.93)) / 240.0, dot(high, vec2(0.93, 0.36)) / 1000.0) + noise(high / 1700.0) * 2.0);
		float thin = smoothstep(0.45, 0.95, streaks) * smoothstep(0.42, 0.75, noise(high / 8000.0 + 17.0)) * smoothstep(0.03, 0.22, EYEDIR.y) * (1.0 - 0.85 * dark) * (1.0 - smoothstep(1500.0, 2400.0, eye_height));
		vec3 lit = sun * 0.9 + horizon * 0.35 + vec3(0.05, 0.07, 0.12) * dark;
		lit = mix(lit, mix(vec3(1.0, 0.5, 0.62), vec3(1.6, 0.6, 0.2), smoothstep(0.3, 0.95, sunward)) * smoothstep(-0.3, -0.05, sun_height), low);
		colour = mix(colour, lit, thin * 0.36);
	}
	// The cloud layer, seen from under it; the camera passes through it in white (main.gd),
	// and from over it the land's shader shows it.
	if (!on_moon && EYEDIR.y > 0.012 && eye_height < CLOUD_HEIGHT) {
		float far = (CLOUD_HEIGHT - eye_height) / EYEDIR.y;
		vec2 over = POSITION.xz + EYEDIR.xz * far;
		float cover = cloud_cover(over, AT_CUBEMAP_PASS ? 3 : 5) * (1.0 - smoothstep(CLOUD_HEIGHT - 140.0, CLOUD_HEIGHT - 10.0, eye_height));
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
	// The world the flight is near, from far over it: in front of all, while its far grids go.
	if (near_shown > 0.0) {
		vec4 near_world = world_seen(EYEDIR, near_way, near_distance, RADIUS, near_ground, !on_moon);
		colour = mix(colour, near_world.rgb, near_world.a * near_shown);
	}
	COLOR = colour;
}
