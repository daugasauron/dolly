// Value noise and fractal noise shared by the foundry's shaders.
float hash12(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * 0.1031);
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}

float value_noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
		mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
	float sum = 0.0, amplitude = 0.5;
	for (int octave = 0; octave < 5; octave++) {
		sum += amplitude * value_noise(p);
		p = p * 2.03 + vec2(17.1, 9.7);
		amplitude *= 0.5;
	}
	return sum;
}
