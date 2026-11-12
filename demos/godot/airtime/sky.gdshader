// The foundry's night: a smoke-dark zenith over a horizon lit from below by molten metal.
shader_type sky;
#include "res://noise.gdshaderinc"

uniform vec3 zenith : source_color = vec3(0.012, 0.016, 0.03);
uniform vec3 horizon : source_color = vec3(0.32, 0.11, 0.035);
uniform vec3 glow : source_color = vec3(1.0, 0.42, 0.1);

void sky() {
	float up = EYEDIR.y;
	float band = exp(-max(up, 0.0) * 9.0);
	vec3 color = mix(zenith, horizon, band);
	// Below the horizon the glow of the metal sea comes up through the haze.
	color = mix(color, glow * 0.55, smoothstep(0.02, -0.25, up));
	// Smoke drifting across the glow.
	vec2 drift = EYEDIR.xz / max(up + 0.25, 0.05) * 1.4 + vec2(TIME * 0.006, TIME * 0.002);
	float smoke = fbm(drift);
	color *= mix(1.0, 0.45 + smoke * 0.8, band * 0.85);
	// A few stars where the smoke thins.
	vec2 cell = floor(EYEDIR.xz / max(up, 0.08) * 160.0);
	float star = step(0.9975, hash12(cell)) * smoothstep(0.15, 0.5, up) * (1.0 - smoke);
	COLOR = color + vec3(star) * 1.8;
}
