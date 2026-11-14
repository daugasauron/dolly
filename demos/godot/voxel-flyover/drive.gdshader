// What carries the pelican's pedalling to the jets, and shows that it turns: a chain's links,
// which run along it as the cranks turn, or (around) the sectors of a wheel, a chainring, a fan or
// a shaft, which turn with the part itself. Links finer than the pixels give their mean.
shader_type spatial;
render_mode cull_disabled;

uniform vec3 colour : source_color = vec3(0.6);
uniform vec3 between : source_color = vec3(0.04);
uniform float links = 20.0; // along the part, or around it
uniform float run = 0.0; // how far the chain has run, in links
uniform bool around = false;
uniform float metal = 0.8;

varying vec3 local;

void vertex() {
	local = VERTEX;
}

void fragment() {
	float at = around ? atan(local.z, local.x) / 6.2832 * links : UV.y * links - run;
	float wide = fwidth(at);
	// Across the seam of the angle the width is no measure.
	wide = wide > links * 0.5 ? 0.0 : wide;
	float link = smoothstep(0.25 - wide * 0.5, 0.25 + wide * 0.5, abs(fract(at) - 0.5));
	ALBEDO = mix(between, colour, mix(link, 0.5, smoothstep(0.5, 1.0, wide)));
	METALLIC = metal;
	ROUGHNESS = 0.35;
	if (!FRONT_FACING) {
		NORMAL = -NORMAL;
	}
}
