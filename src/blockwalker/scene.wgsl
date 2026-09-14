struct Scene { eye:vec4f, forward:vec4f, right:vec4f, up:vec4f, viewport:vec4f }
struct Box { center:vec4f, rotation:vec4f, color:vec4f, flags:vec4f }
@group(0) @binding(0) var<uniform> scene:Scene;
@group(0) @binding(1) var<storage,read> boxes:array<Box>;
@group(0) @binding(2) var<storage,read> ui:array<u32>;
@vertex fn vertex_main(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
    let points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(points[index],0,1);
}
fn rotate(q:vec4f,p:vec3f)->vec3f {return p+2*cross(q.xyz,cross(q.xyz,p)+q.w*p);}
fn local(q:vec4f,p:vec3f)->vec3f {return rotate(vec4f(-q.xyz,q.w),p);}
fn hit_box(origin:vec3f,direction:vec3f,b:Box)->f32 {
    let o=local(b.rotation,origin-b.center.xyz);let d=local(b.rotation,direction);
    let safe=select(d,vec3f(0.000001),abs(d)<vec3f(0.000001));
    let a=(-vec3f(b.center.w)-o)/safe;let z=(vec3f(b.center.w)-o)/safe;
    let n=min(a,z);let f=max(a,z);let near=max(n.x,max(n.y,n.z));let far=min(f.x,min(f.y,f.z));
    return select(10000.0,near,near>0.001&&far>=near);
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
    var distance=10000.0;var object=-1;
    if(ray.y<-.0001){let t=-scene.eye.y/ray.y;if(t>0){distance=t;object=-2;}}
    for(var i=0u;i<u32(scene.eye.w);i++) {let t=hit_box(scene.eye.xyz,ray,boxes[i]);if(t<distance){distance=t;object=i32(i);}}
    let position=scene.eye.xyz+ray*distance;
    if(object==-2){
        let grid=abs(fract(position.xz+vec2f(.5))-.5);
        let fade=clamp(1-distance/28,0,1);
        let line=select(1.0,1-.14*fade,min(grid.x,grid.y)<.016);
        let checker=f32((i32(floor(position.x+.5))+i32(floor(position.z+.5)))&1);
        color=mix(vec3f(.81,.85,.805),mix(vec3f(.79,.84,.79),vec3f(.83,.87,.82),checker),fade)*line;
        var shadow=1.0;
        for(var i=0u;i<u32(scene.eye.w);i++){
            if(boxes[i].flags.z==2){continue;}
            if(hit_box(position+vec3f(0,.01,0),sun,boxes[i])<10000){shadow=.73;break;}
        }
        color*=shadow;
        color=mix(color,vec3f(.86,.9,.86),clamp(distance/85,0,.85));
    }else if(object>=0){
        let b=boxes[u32(object)];let p=local(b.rotation,position-b.center.xyz);
        let face=abs(abs(p)-vec3f(b.center.w));var normal=vec3f(sign(p.x),0,0);
        if(face.y<face.x&&face.y<face.z){normal=vec3f(0,sign(p.y),0);}else if(face.z<face.x){normal=vec3f(0,0,sign(p.z));}
        color=b.color.rgb*(.69+.31*max(0,dot(rotate(b.rotation,normal),sun)));
        let edges=u32(abs(p.x)>.458)+u32(abs(p.y)>.458)+u32(abs(p.z)>.458);
        if(edges>=2u){color*=.68;if(b.flags.z==1){color=vec3f(.98,1,.86);}if(b.flags.z==2){color=vec3f(.18,.66,.46);}}
        if(b.flags.x==1){
            let axis=u32(b.flags.y);var face_uv=p.xy;if(axis==0u){face_uv=p.yz;}else if(axis==1u){face_uv=p.xz;}
            if(abs(normal[axis])>.9){let radius=length(face_uv);if(abs(radius-.22)<.048){color=vec3f(.22,.27,.25);}if(radius<.07){color=vec3f(.98,.96,.84);}}
        }
        if(b.flags.w==1&&b.flags.z==0){color=mix(color,vec3f(1),.13);}
        if(b.flags.z==2){color=mix(color,vec3f(.8,.92,.82),.5);}
    }
    return vec4f(mix(color,overlay.rgb,overlay.a),1);
}
