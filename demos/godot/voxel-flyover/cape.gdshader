// The corgi's cape: cloth fixed at the collar (its vertices at z = 0), which streams behind,
// flutters more toward its free end and faster with the speed, and swings out of a turn.
shader_type spatial;
render_mode cull_disabled;

uniform vec3 colour : source_color = vec3(0.8, 0.05, 0.08);
uniform float speed = 1.0;
uniform float lean = 0.0; // the turn the board is in, which swings the cape outward

void vertex() {
	float free = VERTEX.z;
	VERTEX.x *= 0.7 + 0.45 * free;
	float wave = sin(free * 3.2 - TIME * 9.0 * speed + VERTEX.x * 1.5);
	VERTEX.y += (wave * 0.16 + sin(TIME * 2.3) * 0.1) * free - 0.1 * free * free;
	VERTEX.x += sin(free * 2.1 - TIME * 6.0 * speed) * 0.07 * free + lean * 0.3 * free * free;
	NORMAL = normalize(vec3(0.0, 1.0, -cos(free * 3.2 - TIME * 9.0 * speed) * 0.5 * min(free, 1.0)));
}

void fragment() {
	ALBEDO = colour;
	ROUGHNESS = 0.6;
	BACKLIGHT = colour * 0.4;
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
