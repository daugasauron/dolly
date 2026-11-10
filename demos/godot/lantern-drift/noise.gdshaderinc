// Value noise and its fractal sum, smooth to the second derivative (quintic), with each octave
// turned so the lattice does not show.
float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p, int octaves) {
	const mat2 turn = mat2(vec2(0.8, 0.6), vec2(-0.6, 0.8));
	float sum = 0.0;
	float weight = 0.5;
	for (int octave = 0; octave < octaves; octave++) {
		sum += noise(p) * weight;
		p = turn * p * 2.02 + vec2(3.1, 1.7);
		weight *= 0.5;
	}
	return sum;
}
