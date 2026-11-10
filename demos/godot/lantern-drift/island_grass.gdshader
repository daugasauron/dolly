// An island's top: patches of meadow on the flat, earth on the rim.
shader_type spatial;
#include "res://noise.gdshaderinc"

uniform vec3 meadow : source_color = vec3(0.33, 0.58, 0.35);
uniform vec3 dry : source_color = vec3(0.62, 0.64, 0.33);
uniform vec3 earth : source_color = vec3(0.47, 0.32, 0.27);

varying vec3 world_position;
varying float up;

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	up = NORMAL.y;
}

void fragment() {
	vec3 grass = mix(meadow, dry, smoothstep(0.35, 0.75, fbm(world_position.xz * 0.12, 3)));
	ALBEDO = mix(earth, grass, smoothstep(0.4, 0.9, up));
	ROUGHNESS = 1.0;
}
