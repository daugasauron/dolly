// WebGPU has no clamp-to-border sampler. The guest supplies eight descriptors:
// flags (border U=1,V=2,opaque RGB=4), linear filtering, mip filtering, border color.
@group(3) @binding(0) var<uniform> dolly_samplers: array<vec4u, 8>;

fn dolly_texel(p: vec4u, value: vec4f) -> vec4f {
    return vec4f(value.rgb, select(value.a, 1, (p.x & 4u) != 0u));
}

fn dolly_border_level(t: texture_2d<f32>, s: sampler, uv: vec2f, level: f32, p: vec4u) -> vec4f {
    let dimensions = vec2f(textureDimensions(t, u32(level)));
    var coverage = vec2f(1);
    if (p.y != 0u) {
        coverage = clamp(min(uv, vec2f(1) - uv) * dimensions + vec2f(0.5), vec2f(0), vec2f(1));
    } else {
        coverage = select(vec2f(0), vec2f(1), (uv >= vec2f(0)) & (uv < vec2f(1)));
    }
    coverage = select(vec2f(1), coverage, (p.xx & vec2u(1, 2)) != vec2u(0));
    var border = vec4f(0);
    if (p.w == 1u) { border.a = 1; }
    if (p.w == 2u) { border = vec4f(1); }
    return mix(border, dolly_texel(p, textureSampleLevel(t, s, uv, level)), coverage.x * coverage.y);
}

fn dolly_sample_level(p: vec4u, t: texture_2d<f32>, s: sampler, uv: vec2f, lod: f32) -> vec4f {
    if ((p.x & 3u) == 0u) { return dolly_texel(p, textureSampleLevel(t, s, uv, lod)); }
    let level = clamp(lod, 0, f32(textureNumLevels(t) - 1u));
    if (p.z == 0u) { return dolly_border_level(t, s, uv, floor(level + 0.5), p); }
    return mix(dolly_border_level(t, s, uv, floor(level), p),
        dolly_border_level(t, s, uv, ceil(level), p), fract(level));
}

fn dolly_sample(p: vec4u, t: texture_2d<f32>, s: sampler, uv: vec2f) -> vec4f {
    if ((p.x & 3u) == 0u) { return dolly_texel(p, textureSample(t, s, uv)); }
    let scaled = uv * vec2f(textureDimensions(t, 0));
    let dx = dpdx(scaled);
    let dy = dpdy(scaled);
    let lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1e-16));
    return dolly_sample_level(p, t, s, uv, lod);
}

fn dolly_sample_cube(p: vec4u, t: texture_cube<f32>, s: sampler, uv: vec3f) -> vec4f {
    return dolly_texel(p, textureSample(t, s, uv));
}

fn dolly_sample_cube_level(p: vec4u, t: texture_cube<f32>, s: sampler, uv: vec3f, lod: f32) -> vec4f {
    return dolly_texel(p, textureSampleLevel(t, s, uv, lod));
}
