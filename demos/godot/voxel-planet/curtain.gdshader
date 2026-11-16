// Rain seen from afar: under the deep of a cloud, where it rains (terrain.gdshaderinc's
// rain_on), a curtain hangs from the cloud to the ground, one for each cell of a grid: a soft
// grey column, streaked along its fall, as strong as the rain at its place, so a shower comes
// and goes with its cloud. Near the camera a curtain thins: there the rain itself is drawn
// (rain.gdshader). In winter it is paler: snow.
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;
#include "res://terrain.gdshaderinc"

const float CELL = 300.0;

uniform vec2 flyer;

varying float strength;
varying vec3 from_axis;
varying vec3 world;

void vertex() {
	vec2 number = floor(MODEL_MATRIX[3].xz / CELL);
	vec2 place = (number + 0.2 + 0.6 * vec2(hash(number + 3.0), hash(number + 11.0))) * CELL;
	strength = rain_on(place) * (1.0 - smoothstep(1500.0, 1900.0, distance(place, flyer)));
	from_axis = VERTEX;
	float radius = 120.0 + 70.0 * hash(number + 5.0);
	// Wider under the cloud than at the ground, and leaning with the wind.
	float up = VERTEX.y + 0.5;
	vec3 at = vec3(VERTEX.x * radius * (0.7 + 0.5 * up), SEA + up * (CLOUD_HEIGHT - SEA), VERTEX.z * radius * (0.7 + 0.5 * up));
	at.xz += vec2(0.93, 0.36) * (up - 1.0) * 60.0;
	VERTEX = (strength > 0.01 ? at + vec3(place.x, 0.0, place.y) : vec3(0.0)) - MODEL_MATRIX[3].xyz;
	world = VERTEX + MODEL_MATRIX[3].xyz;
	VERTEX = lift(VERTEX + MODEL_MATRIX[3].xyz) - MODEL_MATRIX[3].xyz;
}

void fragment() {
	float up = from_axis.y + 0.5;
	float around = atan(from_axis.z, from_axis.x);
	float streaks = 0.7 + 0.3 * noise(vec2(around * 14.0, up * 5.0 - clock * 0.3));
	// Soft toward the column's edge as it is seen: by how squarely its side faces the camera.
	vec3 out_of = normalize((VIEW_MATRIX * vec4(from_axis.x, 0.0, from_axis.z, 0.0)).xyz);
	float facing = abs(dot(out_of, normalize(-VERTEX)));
	ALBEDO = mix(mix(vec3(0.33, 0.37, 0.45), vec3(0.75, 0.78, 0.85), winter), vec3(0.03, 0.04, 0.07), night);
	ALPHA = strength * 0.34 * streaks * smoothstep(0.0, 0.7, facing) * smoothstep(0.0, 0.15, up) * smoothstep(1.0, 0.8, up) * smoothstep(150.0, 600.0, length(VERTEX));
}
