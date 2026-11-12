// A pad: steel diamond plate on top, worn sides, and a strip of light along its edges that
// says what the pad does (amber drops, cyan holds), red while it is about to go.
shader_type spatial;
#include "res://noise.gdshaderinc"

uniform vec3 rim : source_color = vec3(1.0, 0.62, 0.18);
uniform float warn = 0.0;    // 0..1: the pad is dropping
uniform float fade = 0.0;    // 0..1: gone
uniform vec3 size = vec3(2.0, 0.8, 2.0);   // metres
uniform float rim_width = 0.08;

varying vec3 local;
varying vec3 normal_local;

void vertex() {
	local = VERTEX;
	normal_local = NORMAL;
}

void fragment() {
	// A dropping pad thins out by dither, so pads stay opaque and cast shadows.
	if (fade > 0.0 && hash12(FRAGCOORD.xy) < fade) {
		discard;
	}
	vec3 p = local + size * 0.5;
	bool top = normal_local.y > 0.5;
	vec2 plane = top ? p.xz : (abs(normal_local.x) > 0.5 ? p.zy : p.xy);
	// Diamond tread on top, scratched steel elsewhere.
	vec2 tread = plane * 5.0;
	vec2 cell = fract(vec2(tread.x + tread.y, tread.x - tread.y) * 0.7071) - 0.5;
	float bump = top ? smoothstep(0.32, 0.18, length(cell * vec2(1.0, 3.2))) : 0.0;
	float wear = fbm(plane * 3.1);
	vec3 steel = mix(vec3(0.16, 0.17, 0.18), vec3(0.34, 0.35, 0.36), wear);
	ALBEDO = steel * (1.0 + bump * 0.45);
	METALLIC = 0.85;
	ROUGHNESS = mix(0.62, 0.35, bump) + wear * 0.15;
	// The edge strip along the top's border.
	float edge = 0.0;
	if (top) {
		vec2 border = min(p.xz, size.xz - p.xz);
		edge = 1.0 - smoothstep(rim_width * 0.6, rim_width, min(border.x, border.y));
	} else {
		edge = smoothstep(size.y - 0.06, size.y - 0.02, p.y);
	}
	vec3 light = mix(rim, vec3(1.0, 0.12, 0.06), warn);
	float pulse = 0.8 + 0.2 * sin(TIME * (6.0 + warn * 30.0));
	EMISSION = light * edge * (2.4 + warn * 4.0) * pulse;
}
