@group(0) @binding(1) var<storage,read_write> particles:array<vec4f>;
@compute @workgroup_size(64) fn update(@builtin(global_invocation_id) id:vec3u) {
  let i=id.x;if(i>=arrayLength(&particles)){return;}
  let f=f32(i);let t=u.screen.z*.23;let seed=f/8192.;
  let a=seed*6.2831853*13.+t*(.3+fract(seed*17.));
  let r=.08+.65*sqrt(fract(seed*17.))+ .06*sin(a*3.+t);
  let tilt=sin(t*.3)*.35;
  let x=cos(a)*r;let y=sin(a)*r*.60;
  let destination=vec2f(x*cos(tilt)-y*sin(tilt),x*sin(tilt)+y*cos(tilt));
  let old=particles[i];let position=mix(old.xy,destination,select(.12,1.,u.state.y<1.));
  particles[i]=vec4f(position,seed, .45+.55*pow(sin(a*.5+t)*.5+.5,2.));
}
