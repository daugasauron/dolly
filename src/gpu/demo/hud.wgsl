fn glyph(c:u32,p:vec2u)->f32 {
  var lo=0u;var hi=0u;
  switch(c) {
    case 65u: {lo=1033774u;hi=17969u;}
    case 66u: {lo=509487u;hi=15921u;}
    case 67u: {lo=33854u;hi=30753u;}
    case 68u: {lo=575023u;hi=15921u;}
    case 69u: {lo=492607u;hi=31777u;}
    case 70u: {lo=492607u;hi=1057u;}
    case 71u: {lo=951358u;hi=31281u;}
    case 72u: {lo=1033777u;hi=17969u;}
    case 73u: {lo=135327u;hi=31876u;}
    case 74u: {lo=270620u;hi=6441u;}
    case 75u: {lo=103729u;hi=17701u;}
    case 76u: {lo=33825u;hi=31777u;}
    case 77u: {lo=710513u;hi=17969u;}
    case 78u: {lo=841329u;hi=17969u;}
    case 79u: {lo=575022u;hi=14897u;}
    case 80u: {lo=509487u;hi=1057u;}
    case 81u: {lo=575022u;hi=22837u;}
    case 82u: {lo=509487u;hi=17701u;}
    case 83u: {lo=459838u;hi=15888u;}
    case 84u: {lo=135327u;hi=4228u;}
    case 85u: {lo=575025u;hi=14897u;}
    case 86u: {lo=575025u;hi=4433u;}
    case 87u: {lo=706097u;hi=18293u;}
    case 88u: {lo=141873u;hi=17962u;}
    case 89u: {lo=141873u;hi=4228u;}
    case 90u: {lo=139807u;hi=31778u;}
    case 49u: {lo=135364u;hi=14468u;}
    case 50u: {lo=410158u;hi=31778u;}
    case 51u: {lo=475663u;hi=15888u;}
    default: {}
  }
  let i=p.y*5u+p.x;return f32(select((lo>>(i%20u))&1u,(hi>>((i-20u)%20u))&1u,i>=20u));
}
fn label0(p:vec2f)->f32 {
  let chars=array<u32,13>(68u,79u,76u,76u,89u,32u,71u,80u,85u,32u,76u,65u,66u);
  if(any(p<vec2f(0)) || p.y>=7. || p.x>=78.){return 0.;}
  let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
}
fn label1(p:vec2f)->f32 {
  let chars=array<u32,6>(65u,85u,82u,79u,82u,65u);
  if(any(p<vec2f(0)) || p.y>=7. || p.x>=36.){return 0.;}
  let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
}
fn label2(p:vec2f)->f32 {
  let chars=array<u32,5>(80u,82u,73u,83u,77u);
  if(any(p<vec2f(0)) || p.y>=7. || p.x>=30.){return 0.;}
  let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
}
fn label3(p:vec2f)->f32 {
  let chars=array<u32,15>(77u,65u,71u,78u,69u,84u,73u,67u,32u,71u,65u,82u,68u,69u,78u);
  if(any(p<vec2f(0)) || p.y>=7. || p.x>=90.){return 0.;}
  let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
}
fn label4(p:vec2f)->f32 {
  let chars=array<u32,29>(49u,32u,65u,85u,82u,79u,82u,65u,32u,32u,32u,50u,32u,80u,82u,73u,83u,77u,32u,32u,32u,51u,32u,71u,65u,82u,68u,69u,78u);
  if(any(p<vec2f(0)) || p.y>=7. || p.x>=174.){return 0.;}
  let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
}
fn label5(p:vec2f)->f32 {
  let chars=array<u32,21>(83u,80u,65u,67u,69u,32u,80u,65u,85u,83u,69u,32u,32u,32u,81u,32u,83u,72u,69u,76u,76u);
  if(any(p<vec2f(0)) || p.y>=7. || p.x>=126.){return 0.;}
  let q=vec2u(p);if(q.x%6u>=5u){return 0.;}return glyph(chars[q.x/6u],vec2u(q.x%6u,q.y));
}
fn hud(p:vec2f,col:vec3f)->vec3f {
  let scale=max(1.,floor(u.screen.y/360.));let q=p/scale;let h=u.screen.y/scale;
  var mask=label0(q-vec2f(20,18))*.65;
  if(u.state.x<.5){mask+=label1((q-vec2f(20,36))/2.);}else if(u.state.x<1.5){mask+=label2((q-vec2f(20,36))/2.);}else{mask+=label3((q-vec2f(20,36))/2.);}
  mask+=label4(q-vec2f(20,h-38))*.65+label5(q-vec2f(20,h-23))*.45;
  return mix(col,vec3f(.82,.94,1.),clamp(mask,0.,1.));
}
