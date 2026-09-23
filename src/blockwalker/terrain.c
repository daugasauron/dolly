#include "terrain.h"
#include <raymath.h>
#include <math.h>

const Depot depots[]={{"Works yard",0,34,4},{"Harbor",106,10,2.8f},{"Island",163,18,3.5f},{"West island",-157,-49,4}};
static const TerrainBox original_boxes[]={
    {{0,-13,0},{256,1,256},0},
    {{0,-6,0},{100,6,100},0},
    {{170,-4,30},{24,8,26},1},
    {{-174,-5,-35},{35,7,30},2},
    {{15,-3,-175},{65,9,20},3},
    {{-190,-2,-35},{10,10,14},2},
    {{185,1,40},{8,9,12},1},
    {{-48,1,-182},{8,5,12},3},
    {{143,-5,30},{3,7,26},1},
    {{138,-6,30},{2,6,26},1},
    {{108,-.3f,10},{8,.3f,4},4},
    {{114,-.3f,20},{2,.3f,14},4},
    {{104,-6,7},{.5f,6,.5f},4},
    {{112,-6,7},{.5f,6,.5f},4},
    {{112,-6,30},{.5f,6,.5f},4},
    {{151,3.7f,24},{7,.3f,3},4},
    {{163,4.3f,18},{9,.3f,8},5},
    {{154,10,40},{1.5f,6,1.5f},5},
    {{174,10,40},{1.5f,6,1.5f},5},
    {{164,17.5f,40},{11.5f,1.5f,1.5f},5,1},
    {{164,17.5f,41.6f},{9,.3f,.1f},6,1},
    {{154,10,41.6f},{.3f,4,.1f},6},
    {{174,10,41.6f},{.3f,4,.1f},6},
    {{155,4.7f,11},{.5f,.1f,.5f},6},
    {{171,4.7f,11},{.5f,.1f,.5f},6},
    {{155,4.7f,25},{.5f,.1f,.5f},6},
    {{171,4.7f,25},{.5f,.1f,.5f},6},
    {{-170,3,-35},{6,1,6},5},
    {{-170,8,-35},{3,4,3},5},
    {{-170,12.5f,-35},{4,.5f,4},5,1},
    {{-170,8,-38.1f},{2.3f,3,.1f},6},
    {{-170,8,-31.9f},{2.3f,3,.1f},6},
    {{-173.1f,8,-35},{.1f,3,2.3f},6},
    {{-166.9f,8,-35},{.1f,3,2.3f},6},
    {{-170,14,-35},{1.5f,1,1.5f},5},
    {{-170,15.2f,-35},{1,.2f,1},6},
    {{-161,2.5f,-35},{3,.5f,3},5},
    {{15,7,-175},{5,1,5},5},
    {{15,16,-175},{1,8,1},5},
    {{15,24,-175},{7.5f,.5f,.5f},5,1},
    {{8,27,-175},{.5f,3,.5f},5,1},
    {{22,27,-175},{.5f,3,.5f},5,1},
    {{8,30.2f,-175},{.65f,.2f,.65f},6,1},
    {{22,30.2f,-175},{.65f,.2f,.65f},6,1},
    {{-12,8.5f,-170},{.5f,2.5f,.5f},5},
    {{-4,8.5f,-170},{.5f,2.5f,.5f},5},
    {{-8,11.25f,-170},{8,.25f,5},7,1},
    {{34,8.5f,-170},{.5f,2.5f,.5f},5},
    {{42,8.5f,-170},{.5f,2.5f,.5f},5},
    {{38,11.25f,-170},{8,.25f,5},7,1},
    {{29,1,55},{6,1,4},8},
    {{28,3,59},{4,3,4},8},
    {{36,1.5f,54},{5,1.5f,3},8},
    {{58,2,54},{7,2,3},8},
    {{65,4,58},{4,4,4},8},
    {{68,2,64},{4,2,3},8},
    {{68,2.5f,82},{4,2.5f,5},8},
    {{64,4.5f,88},{5,4.5f,4},8},
    {{52,2.5f,91},{7,2.5f,4},8},
    {{43,4,91},{4,4,3},8},
    {{31,3.5f,88},{7,3.5f,5},8},
    {{26,2.5f,74},{4,2.5f,10},8},
    {{22,1,74},{4,1,12},8},
    {{34,1,75},{4,1,7},8},
    {{61,1,82},{3,1,5},8},
    {{47,1,85},{10,1,3},8},
    {{72,1,58},{4,1,5},8},
    {{45,.6f,97},{12,.6f,2},8},
    {{51,4.7f,82},{.85f,2.7f,.85f},9},
    {{53.2f,3.8f,81},{.65f,1.8f,.65f},9},
    {{49.5f,3.4f,82.5f},{.7f,1.4f,.7f},9},
};
static const TerrainBox industrial_boxes[]={
    /* The main slab is split around the flooded ore shaft, x=-54..-40/z=59..71. */
    {{30,-6,0},{70,6,100},0},
    {{-47,-6,-20.5f},{7,6,79.5f},0},
    {{-47,-6,85.5f},{7,6,14.5f},0},
    /* Foundry shell and its two open loading doors. */
    {{-65,6.5f,63},{1,6.5f,19},5},
    {{-21,3.5f,63},{1,3.5f,19},5},
    {{-21,11,63},{1,2,19},5},
    {{-21,8,46},{.8f,1,.3f},4},
    {{-21,8,54},{.8f,1,.3f},4},
    {{-21,8,62},{.8f,1,.3f},4},
    {{-21,8,70},{.8f,1,.3f},4},
    {{-21,8,78},{.8f,1,.3f},4},
    {{-56,6.5f,44},{10,6.5f,1},5},
    {{-30,6.5f,44},{10,6.5f,1},5},
    {{-56,6.5f,82},{10,6.5f,1},5},
    {{-30,6.5f,82},{10,6.5f,1},5},
    {{-43,11,44},{3,2,1},5,1},
    {{-43,11,82},{3,2,1},5,1},
    {{-60.5f,13.5f,63},{5.5f,.5f,20},5,1},
    {{-29.5f,13.5f,63},{9.5f,.5f,20},5,1},
    {{-47,13.5f,65},{8,.5f,8},5,1},
    {{-47,13.5f,47},{8,.5f,4},5,1},
    {{-47,13.5f,80},{8,.5f,3},5,1},
    /* Roof ribs, a broken chimney and the old observation gallery. */
    {{-43,14.2f,47},{23,.2f,.35f},4,1},
    {{-43,14.2f,63},{23,.2f,.35f},4,1},
    {{-43,14.2f,79},{23,.2f,.35f},4,1},
    {{-62,19,78},{2,5,2},8,1},
    {{-63.5f,25,78},{.5f,1,2},8,1},
    {{-62,25,79.5f},{1,1,.5f},8,1},
    {{-25,7.5f,63},{3,.5f,15},4,1},
    {{-27.8f,8.4f,63},{.2f,.4f,15},4,1},
    {{-25,3.5f,51},{.5f,3.5f,.5f},4},
    {{-25,3.5f,75},{.5f,3.5f,.5f},4},
    {{-46,4.5f,83.03f},{.18f,4.5f,.03f},6},
    {{-40,4.5f,83.03f},{.18f,4.5f,.03f},6},
    {{-46,4.5f,42.97f},{.18f,4.5f,.03f},6},
    {{-40,4.5f,42.97f},{.18f,4.5f,.03f},6},
    {{-54.3f,.6f,58.7f},{.18f,.6f,.18f},6},
    {{-39.7f,.6f,58.7f},{.18f,.6f,.18f},6},
    {{-54.3f,.6f,71.3f},{.18f,.6f,.18f},6},
    {{-39.7f,.6f,71.3f},{.18f,.6f,.18f},6},
    {{-50,.25f,57.5f},{1.6f,.25f,1.5f},4},
    /* A low freight passage links the hall to the southern loading yard. */
    {{-47,2.5f,94},{.75f,2.5f,11},8},
    {{-39,2.5f,94},{.75f,2.5f,11},8},
    {{-43,5.25f,94},{4.75f,.25f,11},8,1},
    {{-43,-.4f,106},{7,.4f,8},4},
    {{-49.5f,-6,110},{.5f,6,.5f},4},
    {{-36.5f,-6,110},{.5f,6,.5f},4},
    /* Open turbine ruins east of the foundry; cargo can be spotted through gaps. */
    {{-1,3.5f,68},{.75f,3.5f,12},5},
    {{17,3.5f,68},{.75f,3.5f,12},5},
    {{8,3.5f,80},{9.75f,3.5f,.75f},5},
    {{3,8,68},{5,.5f,12},5,1},
    {{13,8,76},{5,.5f,4},5,1},
    {{8,1,76},{3,1,3},8},
    {{8,3.5f,76},{2,1.5f,2},8},
    {{8,5.5f,76},{1.25f,.5f,1.25f},4},
    /* Rusted pipe crossing with an accessible underpass. */
    {{-8,3.5f,51},{.5f,3.5f,.5f},4},
    {{15,3.5f,51},{.5f,3.5f,.5f},4},
    {{3.5f,7,51},{12.5f,.8f,.8f},8,1},
    /* A small receiving quay below the western team's island. */
    {{-147,1.7f,-49},{10,.3f,5},4},
    {{-138,-5,-53},{.5f,7,.5f},4},
    {{-138,-5,-45},{.5f,7,.5f},4},
};
enum { ORIGINAL_BOX_COUNT=sizeof(original_boxes)/sizeof(*original_boxes),INDUSTRIAL_BOX_COUNT=sizeof(industrial_boxes)/sizeof(*industrial_boxes) };
int terrain_version=1,terrain_count=ORIGINAL_BOX_COUNT+INDUSTRIAL_BOX_COUNT,depot_count=sizeof(depots)/sizeof(*depots);
int terrain_depot_count(int version){return version==1?sizeof(depots)/sizeof(*depots):3;}
void terrain_select(int version){
    terrain_version=version==1;terrain_count=ORIGINAL_BOX_COUNT+(terrain_version?INDUSTRIAL_BOX_COUNT:0);depot_count=terrain_depot_count(version);
}
TerrainBox terrain_box(int index){
    if(terrain_version&&index==1)return (TerrainBox){{-77,-6,0},{23,6,100},0};
    return index<ORIGINAL_BOX_COUNT?original_boxes[index]:industrial_boxes[index-ORIGINAL_BOX_COUNT];
}
float terrain_height(float x,float z){
    float height=-100;
    for(int i=0;i<terrain_count;i++){TerrainBox b=terrain_box(i);
        if(!b.overhang&&fabsf(x-b.center.x)<=b.half.x&&fabsf(z-b.center.z)<=b.half.z)height=fmaxf(height,b.center.y+b.half.y);
    }return height;
}
float terrain_floor(Vector3 position){
    float height=-100;
    for(int i=0;i<terrain_count;i++){TerrainBox b=terrain_box(i);
        if(b.center.y-b.half.y<=position.y&&fabsf(position.x-b.center.x)<=b.half.x&&fabsf(position.z-b.center.z)<=b.half.z)height=fmaxf(height,b.center.y+b.half.y);
    }return height;
}
float water_height(float x,float z,double time){
    return WATER_LEVEL+.10f*sinf(x*.22f+z*.13f-time*1.3)+.06f*sinf(z*.31f-x*.09f+time*.9);
}
void terrain_build(b3WorldId world){
    b3ShapeDef shape=b3DefaultShapeDef();shape.baseMaterial.friction=.85f;
    for(int i=0;i<terrain_count;i++){
        TerrainBox b=terrain_box(i);b3BodyDef def=b3DefaultBodyDef();def.position=(b3Pos){b.center.x,b.center.y,b.center.z};
        b3BodyId body=b3CreateBody(world,&def);b3BoxHull box=b3MakeBoxHull(b.half.x,b.half.y,b.half.z);
        b3CreateHullShape(body,&shape,&box.base);
    }
}
static void water_body(PhysicsPart *part,Block block,double time){
    part->submerged=0;
    if(b3Body_GetType(part->body)!=b3_dynamicBody)return;
    b3WorldTransform transform=b3Body_GetTransform(part->body);
    if(transform.p.y>WATER_LEVEL+1.5f||fabsf(transform.p.x)>WORLD_RADIUS||fabsf(transform.p.z)>WORLD_RADIUS)return;
    float mass=b3Body_GetMass(part->body),volume=mass/block_density(block);
    Vector3 extent=block_half(block);b3Vec3 half={extent.x,extent.y,extent.z};
    b3Vec3 a=b3RotateVector(transform.q,(b3Vec3){half.x,0,0}),b=b3RotateVector(transform.q,(b3Vec3){0,half.y,0}),d=b3RotateVector(transform.q,(b3Vec3){0,0,half.z});
    float slice_height=fabsf(a.y)+fabsf(b.y)+fabsf(d.y);
    for(int sample=0;sample<8;sample++){
        b3Vec3 local={(sample&1?.5f:-.5f)*half.x,(sample&2?.5f:-.5f)*half.y,(sample&4?.5f:-.5f)*half.z};
        b3Pos point=b3TransformWorldPoint(transform,local);float surface=water_height(point.x,point.z,time);
        if(terrain_floor((Vector3){point.x,surface,point.z})>=surface)continue;
        float submerged=Clamp(.5f+(surface-point.y)/slice_height,0,1),displaced=volume*submerged/8;
        part->submerged+=submerged/8;if(displaced==0)continue;
        b3Vec3 velocity=b3Body_GetWorldPointVelocity(part->body,point);
        float wave_velocity=-.13f*cosf(point.x*.22f+point.z*.13f-time*1.3)+.054f*cosf(point.z*.31f-point.x*.09f+time*.9);
        velocity.y-=wave_velocity;
        float drag=fminf(displaced*(1.4f+.5f*b3Length(velocity)),mass*3/8);
        b3Vec3 force=b3MulSV(-drag,velocity);force.y+=4*displaced;
        b3Body_ApplyForce(part->body,force,point,true);
    }
}
void water_forces(Physics *p,const Character *c){
    if(!p->landscape)return;
    for(int i=0;i<c->count;i++)water_body(&p->parts[i],c->blocks[i],p->time);
    for(int i=0;i<p->cargo_count;i++){PhysicsPart part={.body=p->cargo[i].body};water_body(&part,p->cargo[i].block,p->time);}
}
