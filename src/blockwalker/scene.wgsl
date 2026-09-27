struct Scene { eye:vec4f, forward:vec4f, right:vec4f, up:vec4f, viewport:vec4f, world:vec4f }
struct Box { center:vec4f, rotation:vec4f, color:vec4f, flags:vec4f, extent:vec4f, style:vec4f }
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
fn hit_cylinder(o:vec3f,d:vec3f,radius:f32,half:f32)->f32 {
    var hit=10000.0;let a=dot(d.xz,d.xz);let b=dot(o.xz,d.xz);let c=dot(o.xz,o.xz)-radius*radius;
    let disc=b*b-a*c;
    if(a>.000001&&disc>=0){
        let roots=vec2f(-b-sqrt(disc),-b+sqrt(disc))/a;
        for(var i=0;i<2;i++){let t=roots[i];if(t>.001&&abs(o.y+t*d.y)<=half){hit=min(hit,t);}}
    }
    if(abs(d.y)>.000001){for(var i=0;i<2;i++){
        let t=(select(-half,half,i==1)-o.y)/d.y;
        if(t>.001&&dot(o.xz+d.xz*t,o.xz+d.xz*t)<=radius*radius){hit=min(hit,t);}
    }}return hit;
}
fn hit_part(origin:vec3f,direction:vec3f,b:Box)->f32 {
    let o=local(b.rotation,origin-b.center.xyz);let d=local(b.rotation,direction);
    if(b.flags.x==100){
        let v=o/b.extent.xyz;let r=d/b.extent.xyz;let a=dot(r,r);let projection=dot(v,r);let disc=projection*projection-a*(dot(v,v)-1);
        if(disc<0){return 10000.0;}let near=(-projection-sqrt(disc))/a;let far=(-projection+sqrt(disc))/a;
        let t=select(far,near,near>.001);return select(10000.0,t,t>.001);
    }
    if(b.flags.x==4||b.flags.x==1||b.flags.x==7){let size=wheel_space(b.extent.xyz,b.flags.y);return hit_cylinder(wheel_space(o,b.flags.y),wheel_space(d,b.flags.y),size.x,size.y);}
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
            let b=boxes[node.left];if(shadow&&(b.flags.z==2||b.flags.x==100)){continue;}
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
fn sky(ray:vec3f)->vec3f {
    let horizon=pow(clamp(1-abs(ray.y),0,1),3);
    var color=mix(vec3f(.23,.37,.51),vec3f(.73,.66,.50),horizon);
    let angle=atan2(ray.z,ray.x);let ridge=.025+.035*abs(sin(angle*4))+.023*abs(sin(angle*11));
    if(ray.y<ridge&&ray.y>-.05){color=mix(vec3f(.26,.37,.38),vec3f(.48,.54,.45),horizon*.6);}
    let clouds=floor(noise(floor(ray.xz/max(.08,ray.y)*8)/8)*5)/5;
    color+=vec3f(.12,.11,.075)*smoothstep(.48,.8,clouds)*smoothstep(.07,.25,ray.y);
    return color;
}
fn water_height(p:vec2f)->f32 {
    return scene.world.w+.10*sin(p.x*.22+p.y*.13-scene.world.x*1.3)+.06*sin(p.y*.31-p.x*.09+scene.world.x*.9);
}
fn water_normal(p:vec2f)->vec3f {
    let a=cos(p.x*.22+p.y*.13-scene.world.x*1.3);let b=cos(p.y*.31-p.x*.09+scene.world.x*.9);
    return normalize(vec3f(-.022*a+.0054*b,1,-.013*a-.0186*b));
}
@fragment fn fragment_main(@builtin(position) pixel:vec4f)->@location(0) vec4f {
    let overlay=unpack(ui[u32(pixel.y)*1280u+u32(pixel.x)]);
    if(overlay.a>0.998){return vec4f(overlay.rgb,1);}
    let raster=(floor(pixel.xy/2)+.5)*2;
    let uv=(raster-scene.viewport.xy)/scene.viewport.zw;
    let xy=(uv*2-1)*vec2f(scene.right.w,-1)*scene.forward.w;
    let ray=normalize(scene.forward.xyz+scene.right.xyz*xy.x+scene.up.xyz*xy.y);
    let sun=normalize(vec3f(-.55,1,.7));
    var color=sky(ray);
    var distance=10000.0;var object=-1;
    // The builder floor is visible only from above, so it never hides undersides.
    if(scene.world.y==0&&scene.eye.y>0&&ray.y<-.0001){let t=-scene.eye.y/ray.y;if(t>0){distance=t;object=-2;}}
    let hit=trace(scene.eye.xyz,ray,distance,false);if(hit.y>=0){distance=hit.x;object=i32(hit.y);}
    let position=scene.eye.xyz+ray*distance;
    if(object==-2){
        let grid=abs(fract(position.xz+vec2f(.5))-.5);
        let fade=clamp(1-distance/28,0,1);
        let line=select(1.0,1-.14*fade,min(grid.x,grid.y)<.016);
        let checker=f32((i32(floor(position.x+.5))+i32(floor(position.z+.5)))&1);
        color=mix(vec3f(.20,.25,.25),mix(vec3f(.26,.31,.30),vec3f(.28,.33,.31),checker),fade)*line;
        color+=vec3f(.14,.13,.08)*fade*select(0.0,1.0,min(grid.x,grid.y)<.016);
        var shadow=1.0;
        if(trace(position+vec3f(0,.01,0),sun,10000,true).y>=0){shadow=.73;}
        color*=shadow;
        color=mix(color,vec3f(.43,.49,.45),clamp(distance/250,0,.85));
    }else if(object>=0){
        let b=boxes[u32(object)];let p=local(b.rotation,position-b.center.xyz);
        if(b.flags.x==100){
            let normalized=p/b.extent.xyz;let along=clamp(normalized.y*.5+.5,0,1);
            let pulse=.85+.15*sin(scene.world.z*43+along*20+b.center.x*7);
            color=mix(vec3f(.88,.82,.48),vec3f(.83,.41,.15),floor(smoothstep(.1,.85,along)*4)/4)*pulse;
            color=mix(color,vec3f(.32,.29,.25),smoothstep(.7,1,along));
        }else if(b.flags.x==1){
            let w=wheel_space(p,b.flags.y);let size=wheel_space(b.extent.xyz,b.flags.y);let cap=abs(w.y)>size.y-.001;
            let facet=floor(atan2(w.z,w.x)*24/6.283185+.5)*6.283185/24;
            let normal=wheel_space(select(vec3f(cos(facet),0,sin(facet)),vec3f(0,sign(w.y),0),cap),b.flags.y);
            let radius=length(w.xz)/size.x;let angle=atan2(w.z,w.x);let reference=angle+select(b.style.w,-b.style.w,b.flags.y==1);
            color=vec3f(.16,.19,.22);
            if(cap){
                color=select(b.color.rgb,vec3f(.72,.70,.59),radius>.67);
                if(radius>.9||radius<.15){color=vec3f(.13,.16,.19);}
                if(radius>.71&&radius<.87&&abs(sin(reference*12))<.16){color=vec3f(.16,.19,.22);}
                if(radius>.67&&radius<.91&&abs(atan2(sin(reference),cos(reference)))>b.center.w){color=vec3f(.72,.19,.12);}
                if(radius>.18&&radius<.63&&abs(w.z)<.033&&w.x>0){color=vec3f(.98,.92,.73);}
                if(radius<.10&&abs(w.z)<.015){color=vec3f(.68,.67,.60);}
            }else{
                color=mix(vec3f(.17,.19,.22),b.color.rgb,.6);
                if(abs(w.y)<.055||abs(w.y)>size.y-.075){color=vec3f(.12,.15,.18);}
            }
            color*=.72+.28*max(0,dot(rotate(b.rotation,normal),sun));
            if(b.flags.z==1&&cap&&radius>.92){color=vec3f(1,.73,.3);}
        }else if(b.flags.x==7){
            let w=wheel_space(p,b.flags.y);let size=wheel_space(b.extent.xyz,b.flags.y);let cap=abs(w.y)>size.y-.001;
            let angle=atan2(w.z,w.x);let facet=floor(angle*24/6.283185+.5)*6.283185/24;
            let normal=wheel_space(select(vec3f(cos(facet),0,sin(facet)),vec3f(0,sign(w.y),0),cap),b.flags.y);
            let radius=length(w.xz)/size.x;
            color=select(vec3f(.16,.19,.19),b.color.rgb,cap);
            if(cap&&radius>.70){color=vec3f(.29,.32,.31);}
            if(cap&&(radius>.95||(radius>.61&&radius<.68))){color=vec3f(.11,.14,.15);}
            if(cap&&radius<.25){color=vec3f(.18,.21,.22);}
            let bolt=vec2f(radius-.83,atan2(sin(angle*12),cos(angle*12))/12);
            if(cap&&length(bolt)<.045){color=vec3f(.12,.15,.16);}
            if(cap&&radius>.28&&radius<.60&&abs(w.z)<size.x*.045&&w.x>0){color=vec3f(.68,.55,.31);}
            if(!cap&&abs(w.y)<.04){color=vec3f(.09,.12,.13);}
            color*=.65+.35*max(0,dot(rotate(b.rotation,normal),sun));
            if(b.flags.z==1&&radius>.92){color=vec3f(1,.73,.3);}
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
            var face_uv=p.yz;if(abs(normal.y)>.5){face_uv=p.xz;}else if(abs(normal.z)>.5){face_uv=p.xy;}
            if(b.flags.x==101){
                if(b.style.x<4){
                    let grain=noise(floor(position.xz*3)/3);
                    if(normal.y>.5){
                        let growth=noise(floor(position.xz*.5)*.10);
                        let moss=smoothstep(.38,.73,growth);
                        let cell=floor(position.xz/8+.5);let uv=fract(position.xz/8+.5)-.5;
                        let weather=hash(cell+vec2f(19,7));
                        color*=.80+.20*hash(cell);
                        let repair=step(.89,weather)*(1-smoothstep(.28,.30,max(abs(uv.x),abs(uv.y)*.75)));
                        color=mix(color,vec3f(.20,.25,.24),repair*.75);
                        color=mix(color,vec3f(.28,.39,.21),moss*.80);
                        color*=.84+.16*grain;
                        let seam=1-smoothstep(.003,.010,.5-max(abs(uv.x),abs(uv.y)));
                        color*=1-.30*seam*(1-moss*.85);
                        let crack=abs(uv.x-uv.y*.35-.045*floor(uv.y*7));
                        if(weather<.24&&crack<.006&&abs(uv.y)<.40){color*=.62;}
                    }else{
                        let layer=floor(position.y*1.7+noise(position.xz*.12)*2);
                        color*=.72+.28*hash(vec2f(layer,floor(face_uv.x*.5)));
                        if(position.y<.7){color=mix(color,vec3f(.19,.30,.25),.38);}
                    }
                }else if(b.style.x==8){
                    let strata=.5+.5*sin(position.y*5+noise(floor(position.xz*2)*.11)*5);
                    color*=.65+.18*noise(floor(face_uv*8)/3)+.17*strata;
                    let vein=abs(sin(face_uv.x*.35+face_uv.y*.11+noise(face_uv*.3)*3));
                    color=mix(color,vec3f(.39,.28,.19),.5*(1-smoothstep(.03,.09,vein)));
                }else if(b.style.x==9){
                    let vent=abs(fract(face_uv.y*3)-.5);
                    color*=select(.48,.92,vent<.32);
                    if(abs(fract(face_uv.x*2)-.5)>.46){color=vec3f(.64,.51,.26);}
                }else if(b.style.x==6){
                    color=b.color.rgb*(.8+.1*sin(scene.world.x*.8+position.y*.4));
                    let bars=abs(fract(face_uv.y*.8)-.5);if(bars>.42){color*=.18;}
                }else if(b.style.x==7){
                    let cell=abs(fract(face_uv*vec2f(.8,1.2))-.5);
                    color=b.color.rgb*(.8+.2*noise(floor(face_uv*vec2f(.8,1.2))));
                    if(max(cell.x,cell.y)>.47){color=vec3f(.16,.23,.29);}
                    if(abs(fract(face_uv.x*4)-.5)>.47){color+=vec3f(.025,.045,.065);}
                }else if(b.style.x==5&&abs(normal.y)<.5){
                    let row=floor(face_uv.y*1.4);
                    let brick=vec2f(face_uv.x*.6+fract(row*.5)*.5,face_uv.y*1.4);
                    let joint=abs(fract(brick)-.5);
                    color*=.75+.25*hash(floor(brick));
                    if(max(joint.x,joint.y)>.46){color=mix(color,vec3f(.30,.29,.23),.8);}
                    let weather=noise(floor(face_uv*2)*.14);
                    color=mix(color,vec3f(.24,.31,.25),smoothstep(.65,.85,weather)*.6);
                }else if(b.style.x>=4){
                    let panel=abs(fract(face_uv*.25)-.5);
                    if(max(panel.x,panel.y)>.48){color*=.4;}
                    let corrosion=smoothstep(.6,.8,noise(floor(face_uv*3)*.13));
                    color=mix(color,vec3f(.42,.25,.13),corrosion*.65);
                }
                if(b.style.x==4&&normal.y>.5&&b.extent.y<.75&&min(b.extent.x,b.extent.z)>1){
                    let edge=min(b.extent.x-abs(p.x),b.extent.z-abs(p.z));
                    let band=smoothstep(.08,.12,edge)*(1-smoothstep(.40,.44,edge));
                    let stripe=step(.5,fract((position.x+position.z)*1.4));
                    let paint=mix(vec3f(.16,.19,.18),vec3f(.65,.50,.23),stripe);
                    let worn=smoothstep(.23,.55,hash(floor(position.xz*5)));
                    color=mix(color,paint,band*worn*.9);
                }
                if(abs(normal.y)<.5&&(b.style.x<4||b.style.x==8)){
                    let tide=1-smoothstep(scene.world.w+.25,scene.world.w+1.4+hash(floor(face_uv*2))*.4,position.y);
                    color=mix(color,vec3f(.16,.27,.21),tide*.6);
                }
                if(b.style.z>0&&abs(position.x)>b.style.z&&abs(position.z)<b.style.w&&position.y>scene.world.w&&b.style.x!=6){
                    let paint=select(vec3f(.24,.38,.55),vec3f(.63,.29,.23),position.x>0);
                    let worn=.72+.20*hash(floor(position.xz*2));
                    let light=.69+.31*max(0,dot(normal,sun));
                    color=mix(color,paint*worn*light,select(.65,.86,normal.y>.5));
                    if(normal.y>.5&&abs(position.x)-b.style.z<1.4){
                        let stripe=step(.5,fract((abs(position.x)+position.z)*.35));
                        color=mix(paint*.40,vec3f(.76,.73,.59),stripe)*worn;
                    }
                }
                if(b.style.x!=6&&trace(position+normal*.02,sun,512,true).y>=0){color*=.65;}
            }else{
                let texel=floor(face_uv*24)/24;let inset=abs(face_uv);
                color*=.9+.1*hash(texel+vec2f(b.center.x,b.center.z));
                if(b.style.y==1){
                    if(max(inset.x,inset.y)>.405){color*=.55;}
                    if(length(inset-vec2f(.34))<.03){color=vec3f(.39,.42,.40);}
                    if(texel.y>.16&&texel.y<.29&&abs(texel.x)<.20){color*=.58+step(.018,abs(fract(texel.x*9)-.5))*.18;}
                }
                if(b.style.y==2&&max(inset.x,inset.y)>.39){color=mix(b.color.rgb,vec3f(.76,.71,.43),.55);}
                if(b.style.y==3&&abs(face_uv.y)>.28){color=select(vec3f(.14,.17,.17),vec3f(.66,.51,.23),sin((texel.x+texel.y)*28)>0);}
                if(b.style.x==1&&abs(p.y)<.19&&abs(normal.y)<.5){color=mix(color,vec3f(.04,.10,.15),.75);}
                if(b.style.x==2&&abs(face_uv.y)<.065){color*=.3;}
                if(b.flags.x==6&&normal[u32(b.flags.y)]*b.style.z>.5){
                    color=vec3f(.16,.20,.21);let lens=abs(vec2f(abs(face_uv.x)-.19,face_uv.y));
                    if(max(lens.x,lens.y)<.15){color=vec3f(.49,.52,.48);}
                    if(max(lens.x,lens.y)<.115){color=vec3f(.08,.18,.20);}
                    if(max(lens.x,lens.y)<.05){color=vec3f(.46,.66,.60);}
                    if(face_uv.y>.27&&face_uv.x>.27){color=vec3f(.7,.25,.13);}
                }
                if(b.flags.x==8){
                    let ring=length(face_uv);color*=.72;
                    if(ring<.34){color=vec3f(.15,.18,.18);}
                    if(ring>.22&&ring<.30){color=vec3f(.54,.52,.43);}
                    if(ring<.08){color=vec3f(.08,.11,.11);}
                    if(abs(face_uv.y)>.36){color=select(vec3f(.15,.18,.18),vec3f(.62,.48,.22),sin((texel.x+texel.y)*28)>0);}
                }
                if(b.flags.x==5){
                    let powered=b.style.w>0;let light=select(vec3f(.18,.30,.34),select(vec3f(.15,.95,.9),vec3f(1,.66,.18),b.extent.w>0),powered);
                    if(normal[u32(b.flags.y)]*b.style.z>.5){
                        color=vec3f(.10,.14,.18);let ring=max(abs(face_uv.x),abs(face_uv.y));
                        if(ring>.28&&ring<.39){color=light;}
                        if(abs(face_uv.x)<.06&&abs(face_uv.y)<.18){color=light;}
                    }else if(abs(face_uv.y)<.045){color=light;}
                }
            }
            if(b.flags.x==3){
                let w=wheel_space(p,b.flags.y);
                if(normal[u32(b.flags.y)]*b.style.z>.5&&max(abs(w.x),abs(w.z))<.36){
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
    if(scene.world.y>0&&abs(ray.y)>.005){
        var t=(scene.world.w-scene.eye.y)/ray.y;
        for(var i=0;i<4;i++){let p=scene.eye.xyz+ray*t;t=(water_height(p.xz)-scene.eye.y)/ray.y;}
        let water=scene.eye.xyz+ray*t;
        if(t>0&&t<distance&&max(abs(water.x),abs(water.z))<256){
            let detail=vec3f(.035*sin(water.z*2.6+scene.world.x*2.1),0,.025*sin(water.x*2.1-scene.world.x*1.7));
            let normal=normalize(water_normal(water.xz)+detail);let depth=max(0,distance-t);
            let fresnel=.035+.80*pow(1-abs(dot(normal,-ray)),5);
            let reflection=sky(reflect(ray,normal));
            let swell=.5+.5*sin(water.x*.22+water.z*.13-scene.world.x*1.3);
            let deep=mix(vec3f(.10,.29,.32),vec3f(.13,.39,.40),floor(swell*4)/4);
            let transmitted=mix(deep,color,exp(-depth*.20));
            color=mix(transmitted,reflection,fresnel);
            let gleam=step(.992,dot(reflect(-sun,normal),-ray));
            color+=vec3f(.25,.27,.20)*gleam*.2;
            let ripples=pow(.5+.5*sin(water.x*1.9+water.z*2.6+scene.world.x*2.3),12);
            color+=vec3f(.015,.055,.07)*ripples*(.35+.65*fresnel);
            let foam=(1-smoothstep(.02,.4,depth))*(.5+.5*noise(water.xz*9+scene.world.x*.3));
            color=mix(color,vec3f(.65,.73,.64),foam*.55);
        }
    }
    if(distance<10000){color=mix(color,vec3f(.66,.64,.53),clamp(1-exp(-distance*.0022),0,.8));}
    let dither=array<f32,16>(0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);
    let cell=vec2u(raster/2)%4u;let bias=(dither[cell.y*4u+cell.x]/16-.5)/31;
    color=floor(clamp(color+bias,vec3f(0),vec3f(1))*31+.5)/31;
    return vec4f(mix(color,overlay.rgb,overlay.a),1);
}
