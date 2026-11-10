// An island's underside: banded strata, darker toward the tip.
shader_type spatial;
#include "res://noise.gdshaderinc"

uniform vec3 rock_light : source_color = vec3(0.62, 0.42, 0.44);
uniform vec3 rock_dark : source_color = vec3(0.24, 0.14, 0.23);

varying vec3 world_position;
varying float height;

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	height = VERTEX.y;
}

void fragment() {
	float strata = sin(world_position.y * 1.6 + noise(world_position.xz * 0.3) * 4.0) * 0.5 + 0.5;
	float grain = noise(world_position.xz * 1.1 + vec2(world_position.y * 0.7));
	vec3 color = mix(rock_dark, rock_light, strata * 0.6 + grain * 0.3);
	ALBEDO = color * mix(0.45, 1.0, smoothstep(-0.5, 0.45, height));
	ROUGHNESS = 0.95;
}
