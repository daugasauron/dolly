struct Item {rect:vec4f, character:u32, color:u32, a:u32, b:u32}
@group(0) @binding(0) var<storage,read> items:array<Item>;
@group(0) @binding(1) var<uniform> screen:vec4f;
struct V { @builtin(position) pos:vec4f, @location(0) uv:vec2f, @location(1) @interpolate(flat) item:u32 }
@vertex fn ui_vertex(@builtin(vertex_index) v:u32,@builtin(instance_index) i:u32)->V {
 let corners=array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
 let q=corners[v];let r=items[i].rect;let p=r.xy+q*r.zw;var o:V;
 o.pos=vec4f(p.x/screen.x*2.-1.,1.-p.y/screen.y*2.,0,1);o.uv=q;o.item=i;return o;
}
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
    case 48u: {lo=714286u;hi=14899u;}
    case 52u: {lo=1025321u;hi=8456u;}
    case 53u: {lo=492607u;hi=15888u;}
    case 54u: {lo=492590u;hi=14897u;}
    case 55u: {lo=139807u;hi=2114u;}
    case 56u: {lo=476718u;hi=14897u;}
    case 57u: {lo=1001006u;hi=14864u;}
    case 46u: {lo=0u;hi=4096u;}
    case 45u: {lo=1015808u;hi=0u;}
    case 43u: {lo=1020032u;hi=132u;}
    case 47u: {lo=139792u;hi=1058u;}
    default: {}
  }
  let i=p.y*5u+p.x;return f32(select((lo>>(i%20u))&1u,(hi>>((i-20u)%20u))&1u,i>=20u));
}

@fragment fn ui_fragment(v:V)->@location(0) vec4f {
 let item=items[v.item];let c=item.color;
 var alpha=f32((c>>24u)&255u)/255.;
 if(item.character!=0u) {alpha*=glyph(item.character,vec2u(min(v.uv*vec2f(5,7),vec2f(4,6))));}
 let rgb=vec3f(f32(c&255u),f32((c>>8u)&255u),f32((c>>16u)&255u))/255.;return vec4f(rgb*alpha,alpha);
}
