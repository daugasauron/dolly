@group(0) @binding(1) var<storage,read> particles:array<vec4f>;
struct Vertex { @builtin(position) position:vec4f, @location(0) uv:vec2f, @location(1) color:vec3f }
@vertex fn particle(@builtin(vertex_index) vi:u32,@builtin(instance_index) i:u32)->Vertex {
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let p=particles[i];let corner=corners[vi];var v:Vertex;
  let aspect=u.screen.y/u.screen.x;let size=.0045+.004*p.w;
  v.position=vec4f((p.xy+corner*size)*vec2f(aspect,1.)*1.7,0,1);v.uv=corner;
  v.color=(.5+.5*cos(vec3f(0,2,4)+p.z*18.+u.screen.z*.12))*(.20+.35*p.w);
  return v;
}
@fragment fn glow(v:Vertex)->@location(0) vec4f {
  let intensity=pow(max(0.,1.-dot(v.uv,v.uv)),2.);return vec4f(v.color*intensity,0);
}
