// The clouds: slabs on a grid that follows the flight, kept where a drifting noise is high, and
// thicker toward a cloud's middle. They take the light of the hour and shade the ground.
shader_type spatial;
#include "res://terrain.gdshaderinc"

uniform float cell = 16.0;
// How far the wind has carried them.
uniform vec2 drift;

varying float lit;

void vertex() {
	vec2 slab = round((MODEL_MATRIX[3].xz - drift) / cell);
	float cover = fbm(slab * 0.085 + vec2(31.0, 7.0), 3);
	float thickness = smoothstep(0.56, 0.72, cover);
	if (thickness <= 0.0) {
		VERTEX = vec3(0.0);
	} else {
		VERTEX.y *= 1.0 + floor(thickness * 3.0);
	}
	lit = VERTEX.y > 0.0 ? 1.0 : 0.72;
}

void fragment() {
	ALBEDO = vec3(lit);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
	BACKLIGHT = vec3(0.35);
}
