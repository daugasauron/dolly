struct Scene { eye:vec4f, forward:vec4f, right:vec4f, up:vec4f, viewport:vec4f, world:vec4f }
struct Box { center:vec4f, rotation:vec4f, color:vec4f, flags:vec4f, extent:vec4f }
@group(0) @binding(0) var<uniform> scene:Scene;
@group(0) @binding(1) var<storage,read> boxes:array<Box>;
@group(0) @binding(2) var<storage,read> ui:array<u32>;
struct Node {lo:vec3f,left:u32,hi:vec3f,right:u32}
@group(0) @binding(3) var<storage,read> nodes:array<Node>;
@vertex fn vertex_main(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
    let points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(points[index],0,1);
}
fn rotate(q:vec4f,p:vec3f)->vec3f {return p+2*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
fn local(q:vec4f,p:vec3f)->vec3f {return rotate(vec4f(-q.xyz,q.w),p);}
fn wheel_space(p:vec3f,axis:f32)->vec3f {
    if(axis==0){return p.yxz;}if(axis==2){return p.xzy;}return p;
}
fn hit_wheel(o:vec3f,d:vec3f)->f32 {
    var hit=10000.0;let a=dot(d.xz,d.xz);let b=dot(o.xz,d.xz);let c=dot(o.xz,o.xz)-.7*.7;
    let disc=b*b-a*c;
    if(a>.000001&&disc>=0){
        let roots=vec2f(-b-sqrt(disc),-b+sqrt(disc))/a;
        for(var i=0;i<2;i++){let t=roots[i];if(t>.001&&abs(o.y+t*d.y)<=.35){hit=min(hit,t);}}
    }
    if(abs(d.y)>.000001){for(var i=0;i<2;i++){
        let t=(select(-.35,.35,i==1)-o.y)/d.y;
        if(t>.001&&dot(o.xz+d.xz*t,o.xz+d.xz*t)<=.7*.7){hit=min(hit,t);}
    }}return hit;
}
fn hit_part(origin:vec3f,direction:vec3f,b:Box)->f32 {
    if(b.flags.x==1){
        let offset=origin-b.center.xyz;let projection=dot(offset,direction);
        let discriminant=projection*projection-dot(offset,offset)+b.center.w*b.center.w;
        if(discriminant<0){return 10000.0;}
        let root=sqrt(discriminant);let near=-projection-root;let far=-projection+root;
        let t=select(far,near,near>.001);return select(10000.0,t,t>.001);
    }
    let o=local(b.rotation,origin-b.center.xyz);let d=local(b.rotation,direction);
    if(b.flags.x==4){return hit_wheel(wheel_space(o,b.flags.y),wheel_space(d,b.flags.y));}
    let safe=select(d,vec3f(0.000001),abs(d)<vec3f(0.000001));
    let a=(-b.extent.xyz-o)/safe;let z=(b.extent.xyz-o)/safe;
    let n=min(a,z);let f=max(a,z);let near=max(n.x,max(n.y,n.z));let far=min(f.x,min(f.y,f.z));
    return select(10000.0,near,near>0.001&&far>=near);
}
fn hits_bounds(origin:vec3f, inverse:vec3f, node:Node, limit:f32)->bool {
    let a=(node.lo-origin)*inverse;let b=(node.hi-origin)*inverse;let near=min(a,b);let far=max(a,b);
    return max(0,max(near.x,max(near.y,near.z)))<=min(limit,min(far.x,min(far.y,far.z)));
}
fn trace(origin:vec3f,direction:vec3f,limit:f32,shadow:bool)->vec2f {
    var hit=vec2f(limit,-1);if(scene.eye.w<1){return hit;}
    let inverse=1/select(direction,vec3f(.000001),abs(direction)<vec3f(.000001));
    var stack:array<u32,32>;var depth=1u;stack[0]=0u;
    while(depth>0u){depth--;let node=nodes[stack[depth]];
        if(!hits_bounds(origin,inverse,node,hit.x)){continue;}
        if(node.right==0xffffffffu){
            let b=boxes[node.left];if(shadow&&b.flags.z==2){continue;}
            let t=hit_part(origin,direction,b);if(t<hit.x){hit=vec2f(t,f32(node.left));if(shadow){return hit;}}
        }else{stack[depth]=node.left;stack[depth+1u]=node.right;depth+=2u;}
    }return hit;
}
fn hash(p:vec2f)->f32{return fract(sin(dot(p,vec2f(127.1,311.7)))*43758.5453);}
fn noise(p:vec2f)->f32 {
    let i=floor(p);let f=fract(p);let u=f*f*(3-2*f);
    return mix(mix(hash(i),hash(i+vec2f(1,0)),u.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),u.x),u.y);
}
fn unpack(v:u32)->vec4f {return vec4f(f32(v&255u),f32((v>>8u)&255u),f32((v>>16u)&255u),f32(v>>24u))/255;}
@fragment fn fragment_main(@builtin(position) pixel:vec4f)->@location(0) vec4f {
    let overlay=unpack(ui[u32(pixel.y)*1280u+u32(pixel.x)]);
    if(overlay.a>0.998){return vec4f(overlay.rgb,1);}
    let uv=(pixel.xy-scene.viewport.xy)/scene.viewport.zw;
    let xy=(uv*2-1)*vec2f(scene.right.w,-1)*scene.forward.w;
    let ray=normalize(scene.forward.xyz+scene.right.xyz*xy.x+scene.up.xyz*xy.y);
    let sun=normalize(vec3f(-.55,1,.7));
    var color=mix(vec3f(.77,.83,.81),vec3f(.93,.95,.92),clamp(1-uv.y,0,1));
    if(scene.world.y>0){
        let horizon=pow(clamp(1-abs(ray.y),0,1),4);
        color=mix(vec3f(.24,.38,.49),vec3f(.93,.71,.48),horizon);
        if(ray.y>.01){let sky=ray.xz/(ray.y+.25);let clouds=noise(sky*1.4+vec2f(scene.world.x*.005,0));
            color=mix(color,vec3f(.93,.88,.77),smoothstep(.52,.85,clouds)*.45);
            let ribbon=sin(sky.x*.8+sin(sky.y*.7+scene.world.x*.03));
            color+=vec3f(.12,.27,.20)*pow(max(0,1-abs(ribbon)*2.5),3)*max(0,ray.y)*.35;
        }
        color+=vec3f(.9,.55,.25)*pow(max(0,dot(ray,normalize(vec3f(-.8,.2,.6)))),160);
    }
    var distance=10000.0;var object=-1;
    // The builder floor is visible only from above, so it never hides undersides.
    if(scene.eye.y>0&&ray.y<-.0001){let t=-scene.eye.y/ray.y;if(t>0){distance=t;object=-2;}}
    let hit=trace(scene.eye.xyz,ray,distance,false);if(hit.y>=0){distance=hit.x;object=i32(hit.y);}
    let position=scene.eye.xyz+ray*distance;
    if(object==-2){
        let grid=abs(fract(position.xz+vec2f(.5))-.5);
        let fade=clamp(1-distance/28,0,1);
        let line=select(1.0,1-.14*fade,min(grid.x,grid.y)<.016);
        let checker=f32((i32(floor(position.x+.5))+i32(floor(position.z+.5)))&1);
        color=mix(vec3f(.81,.85,.805),mix(vec3f(.79,.84,.79),vec3f(.83,.87,.82),checker),fade)*line;
        var shadow=1.0;
        if(trace(position+vec3f(0,.01,0),sun,10000,true).y>=0){shadow=.73;}
        if(scene.world.y>0){
            let terrain=noise(position.xz*.18);let blades=noise(position.xz*8+sin(scene.world.x*.8+position.z)*.1);
            color=mix(vec3f(.29,.42,.28),vec3f(.61,.64,.37),terrain)*(.86+.14*blades);
            let contour=abs(fract(terrain*13-scene.world.x*.02)-.5);
            color+=vec3f(.17,.26,.14)*(1-smoothstep(.01,.04,contour))*.3;
            let cell=floor(position.xz*3);let flower=hash(cell);
            if(flower>.97&&length(fract(position.xz*3)-.5)<.08){color=mix(vec3f(.96,.78,.39),vec3f(.66,.67,.89),hash(cell+1));}
        }
        color*=shadow;
        color=mix(color,vec3f(.86,.9,.86),clamp(distance/85,0,.85));
    }else if(object>=0){
        let b=boxes[u32(object)];let p=local(b.rotation,position-b.center.xyz);
        if(b.flags.x==1){
            let normal=normalize(p);let world_normal=rotate(b.rotation,normal);
            let pole=normal[u32(b.flags.y)];
            color=b.color.rgb*(.70+.30*max(0,dot(world_normal,sun)));
            if(abs(pole)<.025){color*=.78;}
            let rim=1-max(0,dot(world_normal,-ray));
            if(b.flags.z==1&&rim>.8){color=vec3f(.98,1,.86);}
        }else if(b.flags.x==4){
            let w=wheel_space(p,b.flags.y);let cap=abs(w.y)>.349;
            let wn=select(normalize(vec3f(w.x,0,w.z)),vec3f(0,sign(w.y),0),cap);
            let normal=wheel_space(wn,b.flags.y);
            color=vec3f(.09,.10,.105);
            if(cap&&length(w.xz)<.27){color=b.color.rgb;let spoke=abs(sin(atan2(w.z,w.x)*3));if(spoke<.16){color*=.55;}}
            if(!cap&&sin(atan2(w.z,w.x)*24+w.y*20)> .5){color*=.7;}
            color*=.65+.35*max(0,dot(rotate(b.rotation,normal),sun));
            if(b.flags.z==1&&cap&&length(w.xz)>.45){color=vec3f(.98,1,.86);}
        }else{
            let face=abs(abs(p)-b.extent.xyz);var normal=vec3f(sign(p.x),0,0);
            if(face.y<face.x&&face.y<face.z){normal=vec3f(0,sign(p.y),0);}else if(face.z<face.x){normal=vec3f(0,0,sign(p.z));}
            color=b.color.rgb*(.69+.31*max(0,dot(rotate(b.rotation,normal),sun)));
            if(b.flags.x==3){
                let w=wheel_space(p,b.flags.y);
                if(abs(normal[u32(b.flags.y)])>.5&&max(abs(w.x),abs(w.z))<.36){
                    color=vec3f(.14,.16,.17);if(abs(sin(w.x*34))<.3){color=vec3f(.34,.37,.37);}
                }
            }
            if(b.flags.x==2&&abs(p[u32(b.flags.y)])>.47){color*=.62;}
            let edge=abs(p)>b.extent.xyz-vec3f(.027);let edges=u32(edge.x)+u32(edge.y)+u32(edge.z);
            if(edges>=2u){color*=.68;if(b.flags.z==1){color=vec3f(.98,1,.86);}if(b.flags.z==2){color=vec3f(.18,.66,.46);}}
        }
        if(b.flags.w==1&&b.flags.z==0){color=mix(color,vec3f(1),.13);}
        if(b.flags.z==2){color=mix(color,vec3f(.8,.92,.82),.5);}
    }
    return vec4f(mix(color,overlay.rgb,overlay.a),1);
}
