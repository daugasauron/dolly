#include "character.h"
#include <math.h>

typedef struct {Physics *physics;b3Vec3 pole,axis;float distance;b3BodyId target;b3ShapeId shape;b3Vec3 point;} MagnetQuery;
static bool magnet_candidate(b3ShapeId shape,void *opaque){
    MagnetQuery *query=opaque;b3BodyId body=b3Shape_GetBody(shape);
    if(b3Body_GetType(body)!=b3_dynamicBody||b3Body_GetUserData(body)==query->physics->parts)return true;
    b3Vec3 point=b3Shape_GetClosestPoint(shape,query->pole),delta=b3Sub(point,query->pole);float distance=b3Length(delta);
    if(distance<query->distance&&b3Dot(delta,query->axis)>-.06f){query->target=body;query->shape=shape;query->point=point;query->distance=distance;}
    return true;
}
void magnet_drive(Physics *physics,int index,Block block,float on,float off){
    PhysicsPart *part=&physics->parts[index];part->magnet_load=0;
    if(on>0)part->magnet_power=on;if(off>0)part->magnet_power=0;
    part->command=part->magnet_power;
    if(part->magnet_power==0){part->magnet_target=b3_nullBodyId;return;}
    b3Vec3 axis={0};((float *)&axis)[block.axis]=block.direction;
    b3WorldTransform transform=physics_transform(part);b3Pos pole=b3TransformWorldPoint(transform,b3MulSV(.485f,axis));axis=b3RotateVector(transform.q,axis);
    if(!b3Body_IsValid(part->magnet_target)){
        b3Vec3 point={pole.x,pole.y,pole.z};MagnetQuery query={.physics=physics,.pole=point,.axis=axis,.distance=.65f};
        b3AABB bounds={b3Sub(point,(b3Vec3){.65f,.65f,.65f}),b3Add(point,(b3Vec3){.65f,.65f,.65f})};
        b3World_OverlapAABB(physics->world,bounds,b3DefaultQueryFilter(),magnet_candidate,&query);
        part->magnet_target=query.target;part->magnet_shape=query.shape;
        if(!b3Body_IsValid(query.target))return;
        part->magnet_local=b3Body_GetLocalPoint(query.target,(b3Pos){query.point.x,query.point.y,query.point.z});
    }
    b3Pos point=b3Body_GetWorldPoint(part->magnet_target,part->magnet_local);b3Vec3 delta=b3SubPos(pole,point);
    if(b3Length(delta)>1.2f){part->magnet_target=b3_nullBodyId;return;}
    float strength=block.force*part->magnet_power,stiffness=strength*10;
    float a=b3Body_GetMass(part->body),b=b3Body_GetMass(part->magnet_target),mass=a>0&&b>0?a*b/(a+b):fmaxf(a,b);if(mass<=0)return;
    b3Vec3 velocity=b3Sub(b3Body_GetWorldPointVelocity(part->body,pole),b3Body_GetWorldPointVelocity(part->magnet_target,point));
    // Implicit damping keeps the force-limited spring stable at the 60 Hz control rate.
    float damping=2*sqrtf(stiffness*mass),dt=1.f/60;
    b3Vec3 force=b3MulSV(1/(1+damping*dt/mass+stiffness*dt*dt/mass),b3Add(b3MulSV(stiffness,delta),b3MulSV(damping,velocity)));
    float load=b3Length(force);if(load>strength)force=b3MulSV(strength/load,force);part->magnet_load=fminf(load,strength);
    b3Body_ApplyForce(part->magnet_target,force,point,true);b3Body_ApplyForce(part->body,b3MulSV(-1,force),pole,true);
}
void physics_add_cargo(Physics *physics,Vector3 position,int material){
    physics->cargo=array_resize(physics->cargo,physics->cargo_count+1,sizeof(Cargo));
    Cargo *cargo=&physics->cargo[physics->cargo_count++];cargo->block=(Block){.color=1,.finish=FINISH_STRIPE,.material=material};cargo->start=position;
    b3BodyDef body=b3DefaultBodyDef();body.type=b3_dynamicBody;body.position=(b3Pos){position.x,position.y,position.z};body.enableSleep=false;
    cargo->body=b3CreateBody(physics->world,&body);b3BoxHull box=b3MakeBoxHull(.485f,.485f,.485f);
    b3ShapeDef shape=b3DefaultShapeDef();shape.density=block_density(cargo->block);shape.baseMaterial.friction=.85f;b3CreateHullShape(cargo->body,&shape,&box.base);
}
