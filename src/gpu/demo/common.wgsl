struct Uniforms { screen: vec4f, state: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453); }
fn noise(p: vec2f) -> f32 {
  let i=floor(p);let f=fract(p);let v=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2f(1,0)),v.x),mix(hash(i+vec2f(0,1)),hash(i+1.),v.x),v.y);
}
fn stars(uv: vec2f) -> vec3f {
  let p=uv*200.;let h=hash(floor(p));
  return vec3f(pow(max(0.,1.-length(fract(p)-.5)*2.),12.)*step(.974,h)*(0.7+0.3*sin(u.screen.z+h*90.)));
}
