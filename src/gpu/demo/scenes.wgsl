@vertex fn fullscreen(@builtin(vertex_index) i:u32) -> @builtin(position) vec4f {
  let x=f32((i<<1u)&2u);let y=f32(i&2u);return vec4f(x*2.-1.,y*2.-1.,0,1);
}
fn aurora(uv:vec2f) -> vec3f {
  let t=u.screen.z*.14;var col=mix(vec3f(.006,.012,.035),vec3f(.015,.055,.11),uv.y)+stars(uv);
  let ridge=.83+.025*sin(uv.x*12.)+.015*sin(uv.x*37.);
  for(var i=0;i<8;i++) {
    let k=f32(i);let x=uv.x*3.+k*.13;
    let wave=.30+.085*sin(x*2.+t+k*.2)+.11*sin(x*.7-t*1.2)+.05*noise(vec2f(x*4.,t));
    let y=uv.y-wave;let curtain=exp(-abs(y)*9.)*smoothstep(-.08,.03,y);
    let threads=pow(noise(vec2f(x*36.+t,k*.1+t*.3)),2.);
    let hue=mix(vec3f(.03,.8,.43),vec3f(.38,.11,.8),smoothstep(0.,.32,y));
    col+=hue*curtain*(.10+threads*.4)*.33;
  }
  col*=1.-smoothstep(ridge-.006,ridge+.002,uv.y)*.91;
  return col;
}
fn rotate(p:vec2f,a:f32)->vec2f {let c=cos(a);let s=sin(a);return vec2f(c*p.x-s*p.y,s*p.x+c*p.y);}
fn shape(q:vec3f)->f32 {
  var p=q;let xz=rotate(p.xz,u.screen.z*.21);p=vec3f(xz.x,p.y,xz.y);let xy=rotate(p.xy,.6+u.screen.z*.14);p=vec3f(xy,p.z);
  let ring=length(vec2f(length(p.xy)-1.04,p.z))-.27;
  let facets=max(max(abs(p.x),abs(p.y)),abs(p.z))-.85;
  return mix(ring,facets,.25+.20*sin(u.screen.z*.25));
}
fn prism(uv:vec2f)->vec3f {
  let p=(uv-.5)*vec2f(u.screen.x/u.screen.y,1.);let ro=vec3f(0,0,4.3);let rd=normalize(vec3f(p*2.7,-3.));
  var travel=0.;var glow=0.;var d=0.;var hit=false;
  for(var i=0;i<72;i++) {
    d=shape(ro+rd*travel);glow+=.007/(.04+abs(d));
    if(d<.0015){hit=true;break;}travel+=d*.78;if(travel>8.){break;}
  }
  var col=vec3f(.005,.009,.022)+stars(uv)*.4;
  if(hit) {
    let p3=ro+rd*travel;let e=vec2f(.002,0);
    let n=normalize(vec3f(shape(p3+e.xyy)-shape(p3-e.xyy),shape(p3+e.yxy)-shape(p3-e.yxy),shape(p3+e.yyx)-shape(p3-e.yyx)));
    let fres=pow(1.-max(0.,dot(n,-rd)),2.);
    let hue=.5+.5*cos(vec3f(0,2,4)+dot(n,vec3f(3,2,1))*2.+u.screen.z*.22);
    let light=max(.05,dot(n,normalize(vec3f(-1,2,3))));
    col=hue*(.17+light*.6)+vec3f(.3,.7,1.)*fres*.8;
    col+=pow(max(0.,dot(reflect(rd,n),normalize(vec3f(-1,2,3)))),48.)*1.8;
  }
  return col+vec3f(.025,.015,.055)*glow;
}
@fragment fn scene(@builtin(position) p:vec4f)->@location(0) vec4f {
  let uv=p.xy/u.screen.xy;var col=vec3f(.006,.009,.025)+stars(uv)*.6;
  if(u.state.x<.5){col=aurora(uv);}else if(u.state.x<1.5){col=prism(uv);}
  col*=.65+.35*pow(max(0.,16.*uv.x*uv.y*(1.-uv.x)*(1.-uv.y)),.25);
  col=pow(max(col,vec3f(0)),vec3f(.85));
  return vec4f(hud(p.xy,col),1);
}
