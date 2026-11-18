// Cloth in the wind, fixed along its vertices at z = 0: the corgi's cape, and with other
// measures the pelican's long feathers. It streams behind, flutters more toward its free end,
// and swings out of a turn. The flutter's phase is counted by the game, so a change of speed
// changes its pace and never its place. Its colour runs from `colour` to `tip` along it, times the
// colours of its vertices.
shader_type spatial;
render_mode cull_disabled;

uniform vec3 colour : source_color = vec3(0.8, 0.05, 0.08);
uniform vec3 tip : source_color = vec3(0.8, 0.05, 0.08); // the colour of its free end
uniform vec2 widens = vec2(0.7, 0.45); // its width at the fixed end, and what it gains a unit
uniform float flaps = 1.0; // how far it flutters
uniform float phase = 0.0; // of the flutter
uniform float own = 0.0; // a feather's own start in it
uniform float lean = 0.0; // the turn the board is in, which swings it outward

void vertex() {
	float free = VERTEX.z;
	VERTEX.x *= max(widens.x + widens.y * free, 0.02);
	float wave = sin(free * 3.2 - (phase + own) * 9.0 + VERTEX.x * 1.5);
	VERTEX.y += ((wave * 0.16 + sin((phase + own) * 2.3) * 0.1) * free - 0.1 * free * free) * flaps;
	VERTEX.x += (sin(free * 2.1 - (phase + own) * 6.0) * 0.07 * free + lean * 0.3 * free * free) * flaps;
	NORMAL = normalize(vec3(0.0, 1.0, -cos(free * 3.2 - (phase + own) * 9.0) * 0.5 * min(free, 1.0) * flaps));
}

void fragment() {
	ALBEDO = mix(colour, tip, smoothstep(0.45, 0.8, UV.y)) * COLOR.rgb;
	ROUGHNESS = 0.6;
	BACKLIGHT = ALBEDO * 0.4;
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
