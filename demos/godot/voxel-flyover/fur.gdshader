// Fur, in shells: the same mesh drawn a number of times (the instances of a MultiMesh), each a
// little further out along its normals and a little further down the wind, and each keeping only
// the pixels where a hair is at least that long. The hairs lean and shiver in the air the flight
// drives past them. Its colour is its mesh's vertices'.
shader_type spatial;
render_mode world_vertex_coords, shadows_disabled;

uniform float shells = 14.0;
uniform float hair = 0.14; // a hair's length
uniform vec2 hairs = vec2(70.0, 35.0); // hairs around and along the mesh
uniform vec3 wind; // the air's push on the fur, in the world's directions

varying float shell;

void vertex() {
	shell = (float(INSTANCE_ID) + 1.0) / shells;
	float shiver = sin(TIME * 17.0 + UV.x * 40.0 + UV.y * 31.0);
	vec3 blown = wind * (0.7 + 0.3 * shiver) + vec3(0.0, 0.25, 0.0) * shiver * length(wind);
	// The normal comes as long as its part is scaled, or of length one where the scale is uneven: a
	// leg, whose scale changes as the corgi crouches, came now one way and now the other.
	vec3 out_of = normalize(NORMAL);
	// A hair bends more toward its tip, and less where it would be pushed into the skin.
	blown -= out_of * min(dot(blown, out_of), 0.0);
	VERTEX += (out_of * shell + blown * shell * shell) * hair;
}

void fragment() {
	vec2 at = UV * hairs;
	vec2 cell = floor(at);
	// Hairs finer than the pixels would sparkle: from afar they merge into a coat of their mean length.
	float merged = smoothstep(0.3, 0.9, max(length(dFdx(at)), length(dFdy(at))));
	float chance = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
	float tall = mix(0.45 + 0.55 * chance, 0.72, merged);
	// Each hair stands somewhere in its cell: in the cells' middles they were rows.
	vec2 root = 0.5 + 0.5 * (fract(chance * vec2(57.0, 113.0)) - 0.5);
	float off = length(fract(at) - root) * 2.0 * (1.0 - merged);
	if (shell > tall || off > 1.3 * (1.0 - shell / tall) + 0.25) {
		discard;
	}
	// Dark at the roots, where little light gets in.
	ALBEDO = COLOR.rgb * mix(0.5, 1.1, shell) * (0.85 + 0.3 * tall);
	ROUGHNESS = 0.85;
	SPECULAR = 0.25;
	BACKLIGHT = COLOR.rgb * 0.3;
}
