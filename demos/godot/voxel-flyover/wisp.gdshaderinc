// What wisp.gdshader and halo.gdshader, which draw the clouds to fly through, both work out.

#include "res://terrain.gdshaderinc"

// A colour for each place in a chain, the first cool and the last hot.
const vec3 HUES[6] = { vec3(0.1, 0.8, 1.0), vec3(0.2, 1.0, 0.45), vec3(0.75, 0.3, 1.0), vec3(1.0, 0.2, 0.75), vec3(1.0, 0.75, 0.1), vec3(1.0, 0.25, 0.1) };

// How a cloud glows now: from how it glowed before (w of its colour) to how it glows now (x of its
// custom data), over half a second from when that was set (z); the next cloud of a chain beats,
// faster as the chain's time (w) runs out.
float wisp_glow(float before, vec4 custom) {
	float glow = mix(before, custom.x, smoothstep(0.0, 0.5, clock - custom.z));
	float left = custom.w - clock;
	if (left > 0.0) {
		glow *= 1.0 + 0.4 * sin(clock * (7.0 + 12.0 * exp(-left)));
	}
	return glow;
}

vec3 wisp_tint(float place) {
	return HUES[clamp(int(place + 0.5), 0, 5)];
}

// Fully saturated colours round the wheel, by a share of it.
vec3 rainbow(float share) {
	return clamp(abs(fract(share + vec3(0.0, 0.667, 0.333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}

// How wide a cloud is drawn: its radius as it comes and goes, by degrees; and far off no smaller
// than a two-hundredth of its distance, so it stays a point of light that is seen. One of no
// size is a point, and its puffs are not worked out.
float wisp_size(float glow, vec3 drawn, float wide, mat4 view) {
	float far = length((view * vec4(drawn, 1.0)).xyz);
	return smoothstep(0.0, 0.3, glow) * max(wide, far * 0.005);
}
