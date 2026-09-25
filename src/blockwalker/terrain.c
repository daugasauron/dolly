#include "terrain.h"
#include <raymath.h>
#include <math.h>

const Depot depots[]={{"Works yard",0,34,4},{"Harbor",106,10,2.8f},{"East island",163,18,3.5f,1},{"West island",-157,-49,4,2},{"East receiving yard",151,30,3,1},{"West receiving yard",-144,-43,3.5f,2}};
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
    {{-56.5f,6.5f,44},{9.5f,6.5f,1},5},
    {{-29.5f,6.5f,44},{9.5f,6.5f,1},5},
    {{-56.5f,6.5f,82},{9.5f,6.5f,1},5},
    {{-29.5f,6.5f,82},{9.5f,6.5f,1},5},
    {{-43,11,44},{4,2,1},5,1},
    {{-43,11,82},{4,2,1},5,1},
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
    {{-47,4.5f,83.03f},{.18f,4.5f,.03f},6},
    {{-39,4.5f,83.03f},{.18f,4.5f,.03f},6},
    {{-47,4.5f,42.97f},{.18f,4.5f,.03f},6},
    {{-39,4.5f,42.97f},{.18f,4.5f,.03f},6},
    {{-54.3f,.6f,58.7f},{.18f,.6f,.18f},6},
    {{-39.7f,.6f,58.7f},{.18f,.6f,.18f},6},
    {{-54.3f,.6f,71.3f},{.18f,.6f,.18f},6},
    {{-39.7f,.6f,71.3f},{.18f,.6f,.18f},6},
    {{-50,.25f,57.5f},{1.6f,.25f,1.5f},4},
    /* A low freight passage links the hall to the southern loading yard. */
    {{-48,2.5f,94},{.75f,2.5f,11},8},
    {{-38,2.5f,94},{.75f,2.5f,11},8},
    {{-43,5.25f,94},{5.75f,.25f,11},8,1},
    {{-43,-.4f,106},{7,.4f,8},4},
    {{-49.5f,-6,110},{.5f,6,.5f},4},
    {{-36.5f,-6,110},{.5f,6,.5f},4},
    {{-48,.5f,110.5f},{2.5f,.5f,2.5f},4},
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
    /* The island's stepped shore leaves a six-metre docking inlet below its pier. */
    {{143,-5,41.5f},{3,7,14.5f},1},
    {{138,-6,41.5f},{2,6,14.5f},1},
};
static const TerrainBox mine_boxes[]={
    /* Keep a flooded sump beside the dry haul road. */
    {{-55,-6,0},{1,6,100},0},
    {{-60,-6,-91},{4,6,9},0},
    {{-60,-6,18},{4,6,82},0},
    /* Stepped rock shell, with a broad southern entrance. */
    {{-74,7,-90},{23,7,3},8},
    {{-96,7,-66},{3,7,24},8},
    {{-52,7,-66},{3,7,24},8},
    {{-89,7,-42},{7,7,3},8},
    {{-59,7,-42},{7,7,3},8},
    {{-74,11,-68},{19,2,19},8,1},
    {{-76,14,-70},{16,1,15},8,1},
    {{-80,16,-73},{11,1,10},8,1},
    {{-85,18,-78},{5,1,5},8,1},
    {{-90,3,-84},{1.4f,3,1.5f},8},
    {{-90,7,-84},{2,1.5f,2},8},
    {{-87,8,-68},{1.3f,1.2f,1.5f},8,1},
    {{-81,8.2f,-84},{1.5f,.8f,1.2f},8,1},
    {{-57,8.3f,-61},{1.2f,.7f,1.5f},8,1},
    {{-91,1,-72},{1.5f,1,2},8},
    {{-83,5,-36},{2,5,6},8},
    {{-65,5,-36},{2,5,6},8},
    {{-74,7,-36},{7,1,7},8,1},
    /* Worn portal, steel ribs, pipes and a side workshop. */
    {{-81,3,-32},{.35f,3,.4f},4},
    {{-67,3,-32},{.35f,3,.4f},4},
    {{-74,6,-32},{7.35f,.35f,.4f},4,1},
    {{-74,5.5f,-31.55f},{2.5f,.25f,.08f},6,1},
    {{-91,4.5f,-53},{.3f,4.5f,.4f},4},
    {{-57,4.5f,-53},{.3f,4.5f,.4f},4},
    {{-74,8.7f,-53},{17,.3f,.4f},4,1},
    {{-91,4.5f,-76},{.3f,4.5f,.4f},4},
    {{-57,4.5f,-76},{.3f,4.5f,.4f},4},
    {{-74,8.7f,-76},{17,.3f,.4f},4,1},
    {{-90,7.5f,-68},{.45f,.45f,17},4,1},
    {{-89,7.5f,-51},{1.4f,.45f,.45f},4,1},
    {{-88,1.5f,-57},{4,1.5f,2},5},
    {{-89,4,-57},{1,.8f,1},4},
    {{-85,3.5f,-57},{1,.5f,1},6},
    {{-90,4.5f,-65},{.12f,.8f,1.2f},9},
    {{-58,4.5f,-59},{.12f,.8f,1.2f},9},
    {{-81,4.5f,-35},{.12f,.65f,.8f},6},
    {{-67,4.5f,-35},{.12f,.65f,.8f},6},
    {{-85,2,-83.9f},{2.5f,2,.5f},9},
    /* Sump edges leave room for the inspection float and salvage tools. */
    {{-64.4f,.35f,-73},{.25f,.35f,8},6},
    {{-55.6f,.35f,-73},{.25f,.35f,8},6},
    {{-60,.35f,-82.4f},{4,.35f,.25f},6},
    {{-60,.35f,-63.6f},{4,.35f,.25f},6},
    {{-60,-8,-78},{3.5f,4,1.8f},8},
    /* The open dispatch court is visible to both teams' scouts. */
    {{-79,.4f,-25},{.3f,.4f,.3f},6},
    {{-69,.4f,-25},{.3f,.4f,.3f},6},
    {{-79,.4f,-15},{.3f,.4f,.3f},6},
    {{-69,.4f,-15},{.3f,.4f,.3f},6},
    {{-89,2.5f,-23},{3,2.5f,5},5},
    {{-88,5.3f,-23},{4,.3f,6},4,1},
    {{-85.95f,3,-21},{.04f,.8f,1.5f},6},
    {{-87,7,-25},{.4f,1.4f,.4f},4},
};
static const TerrainBox ridge_boxes[]={
    /* A lower machine passage runs beside the terraced quarry road. */
    {{59,5.5f,-71},{3,5.5f,13.5f},8},
    {{90,6,-65},{8,6,27},8},
    {{72,7,-88},{16,7,6},8},
    {{73,8,-61},{11,1,15},8,1},
    {{71,10,-71},{9,1,6},8,1},
    {{75,12,-74},{5,1,3},8,1},
    {{58,2,-49},{3,2,5},8},
    {{94,1.5f,-34},{5,1.5f,4},8},
    {{78,2,-53},{6,2,4},5},
    {{78,0.125f,-33.5f},{4,0.125f,.5f},4},
    {{78,0.25f,-34.5f},{4,0.25f,.5f},4},
    {{78,0.375f,-35.5f},{4,0.375f,.5f},4},
    {{78,0.5f,-36.5f},{4,0.5f,.5f},4},
    {{78,0.625f,-37.5f},{4,0.625f,.5f},4},
    {{78,0.75f,-38.5f},{4,0.75f,.5f},4},
    {{78,0.875f,-39.5f},{4,0.875f,.5f},4},
    {{78,1.0f,-40.5f},{4,1.0f,.5f},4},
    {{78,1.125f,-41.5f},{4,1.125f,.5f},4},
    {{78,1.25f,-42.5f},{4,1.25f,.5f},4},
    {{78,1.375f,-43.5f},{4,1.375f,.5f},4},
    {{78,1.5f,-44.5f},{4,1.5f,.5f},4},
    {{78,1.625f,-45.5f},{4,1.625f,.5f},4},
    {{78,1.75f,-46.5f},{4,1.75f,.5f},4},
    {{78,1.875f,-47.5f},{4,1.875f,.5f},4},
    {{78,2.0f,-48.5f},{4,2.0f,.5f},4},
    /* Steel ribs, a viewing gallery and the abandoned extraction pier. */
    {{63,3.5f,-59},{.3f,3.5f,.4f},4},
    {{81,3.5f,-59},{.3f,3.5f,.4f},4},
    {{72,7,-59},{9.3f,.3f,.4f},4,1},
    {{69,6.4f,-58.55f},{2,.25f,.06f},6,1},
    {{67,1,-79},{3,1,1},5},
    {{67,2.4f,-79},{2,.4f,.7f},4},
    {{67,3,-79},{.5f,.2f,.5f},6},
    {{78,4.4f,-56.8f},{5.8f,.4f,.2f},4},
    {{83.8f,4.4f,-53},{.2f,.4f,3.6f},4},
    {{86,15,-76},{1,3,1},4,1},
    {{86,18.2f,-76},{1.4f,.2f,1.4f},5,1},
    {{94,13,-49},{2,1,4},5,1},
    {{94,14.4f,-49},{2.5f,.4f,4.5f},4,1},
    {{106,-.4f,-65},{8,.4f,4},4},
    {{112,-6,-68},{.5f,6,.5f},4},
    {{112,-6,-62},{.5f,6,.5f},4},
    {{105,3.5f,-68},{.5f,3.5f,.5f},4},
    {{105,3.5f,-62},{.5f,3.5f,.5f},4},
    {{105,7,-65},{.7f,.7f,3.5f},8,1},
};
enum { ORIGINAL_BOX_COUNT=sizeof(original_boxes)/sizeof(*original_boxes),INDUSTRIAL_BOX_COUNT=sizeof(industrial_boxes)/sizeof(*industrial_boxes),MINE_BOX_COUNT=sizeof(mine_boxes)/sizeof(*mine_boxes),RIDGE_BOX_COUNT=sizeof(ridge_boxes)/sizeof(*ridge_boxes) };
int terrain_version=3,terrain_count=ORIGINAL_BOX_COUNT+INDUSTRIAL_BOX_COUNT+MINE_BOX_COUNT+RIDGE_BOX_COUNT,depot_count=sizeof(depots)/sizeof(*depots);
int terrain_depot_count(int version){return version?sizeof(depots)/sizeof(*depots):3;}
void terrain_select(int version){
    terrain_version=version>=0&&version<=3?version:0;terrain_count=ORIGINAL_BOX_COUNT+(terrain_version?INDUSTRIAL_BOX_COUNT:0)+(terrain_version>=2?MINE_BOX_COUNT:0)+(terrain_version>=3?RIDGE_BOX_COUNT:0);depot_count=terrain_depot_count(terrain_version);
}
TerrainBox terrain_box(int index){
    if(terrain_version>=2&&index==1)return (TerrainBox){{-82,-6,0},{18,6,100},0};
    if(terrain_version&&index==1)return (TerrainBox){{-77,-6,0},{23,6,100},0};
    if(terrain_version&&(index==8||index==9))return (TerrainBox){{index==8?143:138,index==8?-5:-6,12.5f},{index==8?3:2,index==8?7:6,8.5f},1};
    if(index<ORIGINAL_BOX_COUNT)return original_boxes[index];
    index-=ORIGINAL_BOX_COUNT;if(index<INDUSTRIAL_BOX_COUNT)return industrial_boxes[index];
    index-=INDUSTRIAL_BOX_COUNT;return index<MINE_BOX_COUNT?mine_boxes[index]:ridge_boxes[index-MINE_BOX_COUNT];
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
static int water_blocked(b3Pos point){
    static TerrainBox barriers[ORIGINAL_BOX_COUNT+INDUSTRIAL_BOX_COUNT+MINE_BOX_COUNT+RIDGE_BOX_COUNT];static int version=-1,count;
    if(version!=terrain_version){
        version=terrain_version;count=0;
        for(int i=0;i<terrain_count;i++){TerrainBox b=terrain_box(i);if(b.center.y-b.half.y<=WATER_LEVEL+.2f&&b.center.y+b.half.y>=WATER_LEVEL-.2f)barriers[count++]=b;}
    }
    for(int i=0;i<count;i++){TerrainBox b=barriers[i];if(fabsf(point.x-b.center.x)<=b.half.x&&fabsf(point.z-b.center.z)<=b.half.z&&point.y>=b.center.y-b.half.y&&point.y<=b.center.y+b.half.y)return 1;}
    return 0;
}
void terrain_build(b3WorldId world){
    b3ShapeDef shape=b3DefaultShapeDef();shape.baseMaterial.friction=.85f;
    for(int i=0;i<terrain_count;i++){
        TerrainBox b=terrain_box(i);b3BodyDef def=b3DefaultBodyDef();def.position=(b3Pos){b.center.x,b.center.y,b.center.z};
        b3BodyId body=b3CreateBody(world,&def);b3BoxHull box=b3MakeBoxHull(b.half.x,b.half.y,b.half.z);
        b3CreateHullShape(body,&shape,&box.base);
    }
}
static float water_shape(b3BodyId body,b3WorldTransform transform,b3Vec3 half,float mass,float volume,double time){
    if(b3Body_GetType(body)!=b3_dynamicBody)return 0;
    b3Vec3 a=b3RotateVector(transform.q,(b3Vec3){half.x,0,0}),b=b3RotateVector(transform.q,(b3Vec3){0,half.y,0}),d=b3RotateVector(transform.q,(b3Vec3){0,0,half.z});
    float slice_height=fabsf(a.y)+fabsf(b.y)+fabsf(d.y),fraction=0;
    if(transform.p.y>WATER_LEVEL+.2f+slice_height||fabsf(transform.p.x)>WORLD_RADIUS||fabsf(transform.p.z)>WORLD_RADIUS)return 0;
    for(int sample=0;sample<8;sample++){
        b3Vec3 local={(sample&1?.5f:-.5f)*half.x,(sample&2?.5f:-.5f)*half.y,(sample&4?.5f:-.5f)*half.z};
        b3Pos point=b3TransformWorldPoint(transform,local);float surface=water_height(point.x,point.z,time);
        if(water_blocked((b3Pos){point.x,surface,point.z}))continue;
        float submerged=Clamp(.5f+(surface-point.y)/slice_height,0,1),displaced=volume*submerged/8;
        fraction+=submerged/8;if(displaced==0)continue;
        b3Vec3 velocity=b3Body_GetWorldPointVelocity(body,point);
        float wave_velocity=-.13f*cosf(point.x*.22f+point.z*.13f-time*1.3)+.054f*cosf(point.z*.31f-point.x*.09f+time*.9);
        velocity.y-=wave_velocity;
        float drag=fminf(displaced*(1.4f+.5f*b3Length(velocity)),mass*3/8);
        b3Vec3 force=b3MulSV(-drag,velocity);force.y+=4*displaced;b3Body_ApplyForce(body,force,point,true);
    }return fraction;
}
void water_forces(Physics *p){
    if(!p->landscape)return;
    for(int i=0;i<p->count;i++)p->parts[i].submerged=0;
    for(int i=0;i<p->shape_count;i++){
        PhysicsShape shape=p->shapes[i];PhysicsPart *part=&p->parts[shape.part];
        float fraction=water_shape(part->body,b3MulWorldTransforms(physics_transform(part),shape.local),shape.half,shape.mass,shape.volume,p->time);
        part->submerged+=fraction*shape.volume/part->volume;
    }
    for(int i=0;i<p->cargo_count;i++){
        Cargo cargo=p->cargo[i];Vector3 h=block_half(cargo.block);float mass=b3Body_GetMass(cargo.body);
        water_shape(cargo.body,b3Body_GetTransform(cargo.body),(b3Vec3){h.x,h.y,h.z},mass,mass/block_density(cargo.block),p->time);
    }
}
