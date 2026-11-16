// The air at speed: faint streaks that run out from the middle of the screen toward its edges,
// more of them and longer the faster the board goes over its cruise. Drawn over the scene.
shader_type canvas_item;

uniform float rush = 0.0; // 0 at the cruise, 1 at the fastest
uniform float clock = 0.0;

void fragment() {
	vec2 from = UV - 0.5;
	from.x *= 16.0 / 9.0;
	float out_to = length(from);
	float ray = atan(from.y, from.x) / 6.2832 * 90.0;
	float own = fract(sin(floor(ray) * 127.1) * 43758.5453);
	float across = abs(fract(ray) - 0.5) * 2.0;
	float along = fract(out_to * (1.2 + own) - clock * (1.5 + own) + own * 5.0);
	float streak = (1.0 - smoothstep(0.1, 0.5, across)) * smoothstep(0.0, 0.3, along) * (1.0 - smoothstep(0.3, 0.9, along)) * step(0.55, own);
	COLOR = vec4(1.0, 1.0, 1.0, streak * rush * 0.22 * smoothstep(0.35, 0.85, out_to));
}
