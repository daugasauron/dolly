// What falls from a heavy cloud: drops of rain, or in winter flakes of snow, each a small card
// that faces the camera, in a box of air around it that they fall through and come round in.
// The game tells how far each kind has fallen and drifted (the wind carries them, and the flight
// slants them back), so a drop is a thin soft streak along its way and a flake a soft round dot,
// near ones large and far ones small. Between the seasons some are drops and some flakes.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, skip_vertex_transform;

uniform float falls = 0.0; // how hard it rains or snows here, between 0 and 1
uniform float snows = 0.0; // the share of flakes among what falls
uniform vec3 fallen_rain; // how far the drops have come, in the box
uniform vec3 fallen_snow;
uniform vec3 way_rain; // a drop's way through the air the camera sees, a second's worth
uniform vec3 way_snow;

const vec3 BOX = vec3(44.0, 30.0, 44.0);

varying vec2 in_card;
varying float flake;
varying float seen;

float drop_hash(float n) {
	return fract(sin(n * 127.1) * 43758.5453);
}

void vertex() {
	float own = float(INSTANCE_ID);
	flake = step(drop_hash(own + 0.9), snows);
	vec3 home = vec3(drop_hash(own), drop_hash(own + 0.37), drop_hash(own + 0.71)) * BOX;
	// A flake wanders as it falls.
	vec3 wander = flake * 0.45 * vec3(sin(TIME * 1.3 + own), 0.0, cos(TIME * 1.1 + own * 1.7));
	vec3 from_eye = mod(home + mix(fallen_rain, fallen_snow, flake) + wander, BOX) - BOX * 0.5;
	vec3 centre = mat3(VIEW_MATRIX) * from_eye;
	vec3 way = mat3(VIEW_MATRIX) * mix(way_rain, way_snow, flake);
	float far = length(centre);
	// A card is never narrower than a pixel; where it would be, it is as much fainter.
	float pixel = far * 0.0012;
	float size = mix(0.014, 0.05 + 0.04 * drop_hash(own + 0.13), flake);
	float wide = max(size, pixel * 0.8);
	vec3 across = normalize(cross(way, centre));
	// A drop is drawn along the way it comes in a thirtieth of a second.
	vec3 along = mix(way / 60.0, normalize(cross(centre, across)) * wide, flake);
	in_card = VERTEX.xy * 2.0;
	VERTEX = centre + across * VERTEX.x * 2.0 * wide + along * VERTEX.y * 2.0;
	// It fades at the box's sides, where it comes round, and before the camera's lens.
	vec3 inside = 1.0 - abs(from_eye) / (BOX * 0.5);
	seen = falls * smoothstep(0.0, 0.25, min(inside.x, min(inside.y, inside.z))) * smoothstep(0.8, 3.0, far) * size / wide;
}

void fragment() {
	float streak = (1.0 - smoothstep(0.1, 1.0, abs(in_card.x))) * (1.0 - in_card.y * in_card.y);
	float dot_of_snow = 1.0 - smoothstep(0.2, 1.0, length(in_card));
	ALBEDO = mix(vec3(0.72, 0.8, 0.95), vec3(1.0), flake);
	ALPHA = mix(streak * 0.7, dot_of_snow * 0.9, flake) * seen;
}
