// Low clouds, and mist: soft balls in clusters, one cluster for each cell of a grid that drifts
// with the wind. Its 13 by 13 clusters are the cells around the flyer, each cluster always a
// cell of its own place in the 13 (the cell's number, modulo 13): as the flight goes on, a
// cluster far behind becomes the cell far ahead and no other changes, so the clusters keep the
// order they are drawn in, which shows where one soft ball is seen through another. A cell has a cloud where a noise of its number says so,
// so a cloud is where it was when the flight comes back to it. A cloud's balls are flat under
// and stand above the ground below them; the mist's are flatter still and lie on the sea and
// the low ground, thickest at dawn. A ball is soft at its rim and draws in before the camera,
// which flies through it; the game whitens the air there (main.gd's in_cloud).
shader_type spatial;
render_mode unshaded, depth_draw_never, shadows_disabled;
#include "res://terrain.gdshaderinc"
#include "res://ground.gdshaderinc"

const float CELL = 240.0;
const float PUFFS = 9.0;

uniform vec2 adrift; // how far the wind has carried the grid
uniform vec3 eye; // where the camera is
uniform bool mist = false;
uniform float thick = 1.0; // of the mist: more at dawn
uniform vec3 light : source_color = vec3(1.0); // the sun's, or the moon's
uniform vec3 shade : source_color = vec3(0.5, 0.55, 0.65); // the sky's, under a cloud

varying vec3 from_centre;
varying float strength;
varying float flash; // lightning inside the cluster

void vertex() {
	vec2 own = floor(MODEL_MATRIX[3].xz / CELL) + 6.0;
	vec2 middle = floor((flyer - adrift) / CELL);
	vec2 cell_number = middle + mod(own - middle + 6.0, 13.0) - 6.0;
	vec2 at = (cell_number + 0.5) * CELL + adrift;
	vec2 number = cell_number + (mist ? 40.0 : 0.0);
	float puff = float(INSTANCE_ID % int(PUFFS));
	float deep = fbm(number * 0.31 + vec2(71.0, 19.0), 2);
	float cover = smoothstep(mist ? 0.4 : 0.53, mist ? 0.5 : 0.65, deep);
	// Lightning: the deepest clouds stand together as a storm, and in three of ten turns of
	// six seconds a cluster of one is lit from within, twice in quick succession.
	float turn = clock / 6.0 + hash(number + 3.0);
	float since = fract(turn) * 6.0;
	flash = mist ? 0.0 : (0.3 + 0.7 * night) * smoothstep(0.8, 0.84, deep) * step(hash(number + floor(turn) * 7.0), 0.3) * (exp(-since * 7.0) + 0.7 * exp(-(since - 0.3) * (since - 0.3) * 250.0));
	vec2 seed = number * 16.0 + vec2(puff * 3.0, 5.0);
	vec2 offset = (vec2(hash(seed), hash(seed + 1.0)) - 0.5) * CELL * (mist ? 0.9 : 0.62);
	vec2 place = at + offset;
	float ground_height = max(ground_here(place).x, SEA);
	float radius = (mist ? 75.0 + 60.0 * hash(seed + 2.0) : 24.0 + 30.0 * hash(seed + 2.0)) * cover;
	float base = mist ? ground_height + 2.0 : max(SEA + 135.0 + 50.0 * hash(number * 16.0 + 9.0) + 14.0 * hash(seed + 3.0), ground_height + 50.0);
	// Mist lies on the sea and the low ground only.
	if (mist) {
		radius *= (1.0 - smoothstep(SEA + 5.0, SEA + 14.0, ground_height)) * thick;
	}
	radius *= 1.0 - smoothstep(1050.0, 1240.0, distance(place, flyer));
	from_centre = VERTEX * 2.0;
	// A ball the camera comes up to thins out whole, and is gone before the camera is in it:
	// its far side would else go at once as the camera passed its near one.
	vec3 to_eye = eye - vec3(place.x, base, place.y);
	to_eye.y /= mist ? 0.06 : (to_eye.y < 0.0 ? 0.25 : 0.6);
	strength = step(0.5, radius) * (mist ? 1.0 : smoothstep(1.05, 1.6, length(to_eye) / max(radius, 0.5)));
	vec3 flat_ball = from_centre * vec3(1.0, mist ? 0.06 : (from_centre.y < 0.0 ? 0.25 : 0.6), 1.0);
	VERTEX = flat_ball * radius + vec3(place.x, base, place.y) - MODEL_MATRIX[3].xyz;
	if (radius < 0.5) {
		VERTEX = vec3(0.0);
	}
}

void fragment() {
	// Soft at the rim, by how much the ball's surface faces the camera.
	vec3 out_of = normalize((VIEW_MATRIX * MODEL_MATRIX * vec4(from_centre * vec3(1.0, mist ? 4.0 : 1.4, 1.0), 0.0)).xyz);
	float facing = abs(dot(out_of, normalize(-VERTEX)));
	float soft = smoothstep(0.05, mist ? 0.9 : 0.6, facing);
	// Lit from the light's side and from above.
	float toward = 0.5 + 0.5 * dot(normalize(from_centre), to_light) * handover;
	vec3 colour = mix(shade, light * 1.15, 0.3 + 0.7 * toward) * (0.85 + 0.15 * from_centre.y);
	ALBEDO = mist ? mix(shade, light, 0.5) : colour + vec3(0.7, 0.78, 1.0) * flash * (0.6 + 0.9 * (1.0 - facing));
	// Mist has no rim: it thins from its middle outwards.
	float thin = mist ? 1.0 - smoothstep(0.15, 1.0, length(from_centre.xz)) : soft;
	ALPHA = thin * strength * (mist ? 0.24 : 0.8) * smoothstep(4.0, mist ? 90.0 : 32.0, length(VERTEX));
}
