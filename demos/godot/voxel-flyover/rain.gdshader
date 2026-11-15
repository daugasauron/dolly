// What falls from a heavy cloud: a tube around the camera whose inside carries streaks of rain,
// or in winter flakes of snow, that fall with the clock. Its strength is
// the rain over the camera, which the game tells it; a streak finer than a pixel fades.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;

uniform float falls = 0.0; // how hard it rains or snows here, between 0 and 1
uniform float snows = 0.0; // 0 for rain, 1 for snow
uniform float clock = 0.0;
uniform float columns = 90.0; // streaks around the tube

float streak_hash(float n) {
	return fract(sin(n * 127.1) * 43758.5453);
}

void fragment() {
	float down = UV.y * 2.0; // a tube's side has the upper half of the texture
	float column = UV.x * columns;
	float own = streak_hash(floor(column));
	// Rain falls ten times its length a second, snow a tenth of that and wanders.
	float speed = mix(2.2 + own, 0.25 + 0.2 * own, snows);
	float along = down * mix(3.0, 9.0, snows) - clock * speed + own * 7.0;
	float across = abs(fract(column + snows * 0.3 * sin(along * 2.0 + own * 6.0)) - 0.5) * 2.0;
	float wide = fwidth(column) * 2.0;
	float thin = mix(0.12, 0.3, snows);
	float drop = (1.0 - smoothstep(thin, thin + wide + 0.02, across)) * smoothstep(1.0 - mix(0.35, 0.12, snows), 1.0, fract(along));
	// Not every column has a drop in it at once, and the tube fades toward its ends.
	drop *= step(0.45, streak_hash(floor(along) + own * 31.0)) * smoothstep(0.0, 0.2, down) * smoothstep(1.0, 0.8, down);
	ALBEDO = mix(vec3(0.75, 0.82, 0.95), vec3(1.0), snows);
	ALPHA = drop * falls * mix(0.3, 0.8, snows) * (1.0 - smoothstep(0.5, 1.5, wide));
}
