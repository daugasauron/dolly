// Fur, in shells: the same mesh drawn a number of times (the instances of a MultiMesh), each a
// little further out along its normals and a little further down the wind, and each keeping only
// the pixels where a hair is at least that long. The hairs lean and shiver in the air the flight
// drives past them.
shader_type spatial;
render_mode world_vertex_coords, shadows_disabled;

uniform vec3 colour : source_color = vec3(0.85, 0.47, 0.16);
uniform float shells = 14.0;
uniform float hair = 0.14; // a hair's length
uniform vec2 hairs = vec2(70.0, 35.0); // hairs around and along the mesh
uniform vec3 wind; // the air's push on the fur, in the world's directions

varying float shell;

void vertex() {
	shell = (float(INSTANCE_ID) + 1.0) / shells;
	float shiver = sin(TIME * 17.0 + UV.x * 40.0 + UV.y * 31.0);
	vec3 blown = wind * (0.7 + 0.3 * shiver) + vec3(0.0, 0.25, 0.0) * shiver * length(wind);
	// A hair bends more toward its tip, and less where it would be pushed into the skin.
	blown -= NORMAL * min(dot(blown, NORMAL), 0.0);
	VERTEX += (NORMAL * shell + blown * shell * shell) * hair;
}

void fragment() {
	vec2 at = UV * hairs;
	vec2 cell = floor(at);
	float tall = 0.45 + 0.55 * fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
	float off = length(fract(at) - 0.5) * 2.0;
	if (shell > tall || off > 1.3 * (1.0 - shell / tall) + 0.25) {
		discard;
	}
	// Dark at the roots, where little light gets in.
	ALBEDO = colour * mix(0.5, 1.1, shell) * (0.85 + 0.3 * tall);
	ROUGHNESS = 0.85;
	SPECULAR = 0.25;
	BACKLIGHT = colour * 0.3;
}
