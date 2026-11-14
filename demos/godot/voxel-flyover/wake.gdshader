// The wake behind the board: a ribbon along the places it has been (path, the newest first), which
// rolls as it trails, widens and thins out, in colours that run along it.
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

const int POINTS = 64;
uniform vec3 path[64];
// How far the board is from the newest kept place, in places: the ribbon's pattern keeps to the air.
uniform float lead = 0.0;
uniform float clock = 0.0;

varying vec2 across; // x: along the wake, 0 at the board to 1 at its end; y: across it

void vertex() {
	int i = int(round(UV.x * float(POINTS - 1)));
	float along = i == 0 ? 0.0 : (float(i) - 1.0 + lead) / float(POINTS - 1);
	vec3 back = path[min(i + 1, POINTS - 1)] - path[max(i - 1, 0)];
	vec3 toward = length(back) > 0.001 ? normalize(back) : vec3(0.0, 0.0, 1.0);
	vec3 side = normalize(cross(toward, vec3(0.0, 1.0, 0.0)));
	float roll = sin(along * 14.0 - clock * 2.2) * 1.1;
	side = side * cos(roll) + cross(toward, side) * sin(roll);
	float wide = 0.75 * smoothstep(0.0, 0.1, along) * (1.0 - 0.5 * along) + 0.3;
	VERTEX = path[i] + side * (UV.y - 0.5) * 2.0 * wide;
	across = vec2(along, UV.y);
}

void fragment() {
	// From the jets' blue through violet and rose to gold, and brightest along its middle.
	float hue = across.x * 2.2 - clock * 0.35;
	vec3 colour = 0.5 + 0.5 * cos(6.2832 * (vec3(0.62, 0.45, 0.2) - hue * vec3(0.5, 0.3, 0.45)));
	float middle = sin(across.y * 3.1416);
	ALBEDO = colour * (0.5 + 1.0 * middle * middle);
	// It thins before the camera, which may fly through it.
	ALPHA = (1.0 - across.x) * (1.0 - across.x) * middle * 0.75 * smoothstep(1.5, 8.0, length(VERTEX));
}
