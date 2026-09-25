#define _POSIX_C_SOURCE 200809L
#include "world.h"
#include <assert.h>
#include "terrain.h"
#include <raymath.h>
#include <errno.h>
#include <float.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
struct Controller {JSRuntime *runtime;JSContext *ctx;JSValue function,memory,random,blueprint;char *source;uint32_t seed;int hz,last_step,exhausted,remaining;char error[160];};
enum {REMOVAL_CONTROLLER,REMOVAL_POSTURE,REMOVAL_SUNK,REMOVAL_NONFINITE,REMOVAL_TERRAIN,REMOVAL_CAUSES};
static const char *removal_causes[]={"controller","posture","sunk","nonfinite","terrain"};
World world;
static char *installed;static char installed_name[64]="Creature";static int installed_hz=10;
static Controller *trial;static float trial_controls[128];
static struct {float fallen,height;int cause,steps;char detail[160];} trial_status={.cause=-1};
static int physical_failure(const Character *design,Vector3 position,float up,float root_height,float ground){
    int sea=ground<WATER_LEVEL;
    if(!isfinite(position.x)||!isfinite(position.y)||!isfinite(position.z))return REMOVAL_NONFINITE;
    if(design->anchored)return -1;
    if(position.y<(sea?WATER_LEVEL-3:ground-.5f))return sea?REMOVAL_SUNK:REMOVAL_TERRAIN;
    if((design->count>1&&up<.15f)||(!sea&&root_height>1.2f&&position.y<ground+.65f))return REMOVAL_POSTURE;
    return -1;
}
static int sustained_failure(float *fallen,int steps,int cause){
    if(steps>180&&cause>=0)*fallen+=1.f/60;else *fallen=0;
    return *fallen>2;
}
static const char *failure_detail(int cause,float up,const char *error){
    return cause==REMOVAL_CONTROLLER?error:cause==REMOVAL_POSTURE?(up<.15f?"Root tipped over":"Raised torso collapsed"):removal_causes[cause];
}
static int remember_design(const Character *design,const char *source,const char *name,int hz,float x,float z){
    for(int i=0;i<world.design_count;i++){SavedDesign *d=&world.designs[i];
        if(d->hz==hz&&d->design.count==design->count&&d->design.anchored==design->anchored&&!strcmp(d->name,name)&&!strcmp(d->source?d->source:"",source?source:"")&&!memcmp(d->design.blocks,design->blocks,design->count*sizeof(Block)))return i+1;
    }
    if(world.design_count==world.design_capacity){world.design_capacity=world.design_capacity?world.design_capacity*2:16;world.designs=array_resize(world.designs,world.design_capacity,sizeof(SavedDesign));}
    SavedDesign *d=&world.designs[world.design_count++];memset(d,0,sizeof(*d));character_copy(&d->design,design);d->source=source?strdup(source):NULL;d->hz=hz;d->x=x;d->z=z;snprintf(d->name,sizeof(d->name),"%s",name);
    return world.design_count;
}
static int interrupt(JSRuntime *rt,void *opaque){Controller *c=opaque;c->exhausted=c->remaining==0;if(!c->exhausted)c->remaining--;return c->exhausted;}
static void controller_budget(Controller *c){c->remaining=2;c->exhausted=0;c->error[0]=0;}
static JSValue random_number(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv){
    Controller *c=JS_GetContextOpaque(ctx);c->seed^=c->seed<<13;c->seed^=c->seed>>17;c->seed^=c->seed<<5;
    return JS_NewFloat64(ctx,c->seed/4294967296.0);
}
static void controller_free(Controller *c){if(!c)return;JS_FreeValue(c->ctx,c->function);JS_FreeValue(c->ctx,c->memory);JS_FreeValue(c->ctx,c->random);JS_FreeValue(c->ctx,c->blueprint);JS_FreeContext(c->ctx);JS_FreeRuntime(c->runtime);free(c->source);free(c);}
static int valid_controller_hz(double hz){return hz==1||hz==10||hz==20||hz==30||hz==60;}
static Controller *controller_new(const char *source,uint32_t seed,int hz){
    Controller *c=calloc(1,sizeof(*c));if(!c)return NULL;
    c->source=strdup(source);c->seed=seed?seed:1;c->hz=hz;c->last_step=-1;c->runtime=JS_NewRuntime();JS_SetMemoryLimit(c->runtime,4*1024*1024);JS_SetMaxStackSize(c->runtime,128*1024);
    JS_SetInterruptHandler(c->runtime,interrupt,c);c->ctx=JS_NewContext(c->runtime);JS_SetContextOpaque(c->ctx,c);
    c->memory=JS_NewObject(c->ctx);c->blueprint=JS_UNDEFINED;c->random=JS_NewCFunction(c->ctx,random_number,"random",0);controller_budget(c);
    char *wrapped=array_resize(NULL,strlen(source)+4,1);sprintf(wrapped,"(%s)",source);
    c->function=JS_Eval(c->ctx,wrapped,strlen(wrapped),"creature-controller",JS_EVAL_TYPE_GLOBAL);free(wrapped);
    if(!JS_IsFunction(c->ctx,c->function)){controller_free(c);return NULL;}return c;
}
static double get_number(JSContext *ctx,JSValueConst obj,const char *key,double fallback){
    JSValue v=JS_GetPropertyStr(ctx,obj,key);double n=fallback;if(!JS_IsUndefined(v)&&JS_ToFloat64(ctx,&n,v)<0)n=fallback;JS_FreeValue(ctx,v);return n;
}
static void put_number(JSContext *ctx,JSValue obj,const char *key,double n){JS_SetPropertyStr(ctx,obj,key,JS_NewFloat64(ctx,n));}
static const char *controller_memory_json(Controller *c,size_t *length){
    controller_budget(c);JSValue value=JS_JSONStringify(c->ctx,c->memory,JS_UNDEFINED,JS_UNDEFINED);
    const char *json=JS_IsString(value)?JS_ToCStringLen(c->ctx,length,value):NULL;
    JS_FreeValue(c->ctx,value);if(!json)JS_FreeValue(c->ctx,JS_GetException(c->ctx));return json;
}
JSValue character_json(JSContext *ctx,const Character *c){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<c->count;i++){
        Block b=c->blocks[i];JSValue part=JS_NewObject(ctx);
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive","speed","limit","travel","force","direction","material","finish","size"};
        double values[]={b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit,b.travel,b.force,b.direction,b.material,b.finish,block_size(b)};
        for(int j=0;j<17;j++)put_number(ctx,part,names[j],values[j]);JS_SetPropertyUint32(ctx,list,i,part);
    }return list;
}
static int read_character(JSContext *ctx,JSValueConst list,Character *c,int legacy){
    double length=get_number(ctx,list,"length",0);if(!isfinite(length)||length<1||length>INT32_MAX/sizeof(Block))return 0;
    Character next={.count=(int)length,.capacity=(int)length};next.blocks=array_resize(NULL,next.count,sizeof(Block));
    for(int i=0;i<next.count;i++){
        JSValue v=JS_GetPropertyUint32(ctx,list,i);Block *b=&next.blocks[i];
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive","speed","limit","travel","force","direction","material","finish","size"};
        double defaults[]={0,0,0,i-1,0,i%COLOR_COUNT,2,0,0,2.5,75,1.5,24,1,0,0,1},n[17];int valid=1;
        if(get_number(ctx,v,"joint",0)==BLOCK_WINCH){defaults[9]=.8;defaults[11]=8;}
        for(int j=0;j<17;j++){n[j]=get_number(ctx,v,names[j],defaults[j]);if(!isfinite(n[j])||((j<9||j>=13)&&(n[j]!=floor(n[j])||n[j]<INT32_MIN||n[j]>INT32_MAX)))valid=0;}
        JS_FreeValue(ctx,v);if(!valid){character_clear(&next);return 0;}
        *b=(Block){.x=n[0],.y=n[1],.z=n[2],.parent=n[3],.joint=n[4],.color=n[5],.axis=n[6],.negative=n[7],.positive=n[8],.speed=n[9],.limit=n[10],.travel=n[11],.force=n[12],.direction=n[13],.material=n[14],.finish=n[15],.size=n[16]};
    }
    if(!(legacy?character_upgrade_thrusters(&next):character_validate(&next))){character_clear(&next);return 0;}character_clear(c);*c=next;return 1;
}
int character_from_json(JSContext *ctx,JSValueConst list,Character *c){return read_character(ctx,list,c,0);}
static JSValue vector(JSContext *ctx,Vector3 v){
    JSValue a=JS_NewArray(ctx);JS_SetPropertyUint32(ctx,a,0,JS_NewFloat64(ctx,v.x));JS_SetPropertyUint32(ctx,a,1,JS_NewFloat64(ctx,v.y));JS_SetPropertyUint32(ctx,a,2,JS_NewFloat64(ctx,v.z));return a;
}
typedef struct {double support,self;int count;} ContactForces;
static ContactForces contact_forces(b3BodyId body,const void *own_parts,const b3ContactData *contacts,int count){
    ContactForces result={0};
    for(int j=0;j<count;j++){
        const b3ContactData *contact=&contacts[j];b3BodyId a=b3Shape_GetBody(contact->shapeIdA),b=b3Shape_GetBody(contact->shapeIdB);
        int is_a=B3_ID_EQUALS(a,body),own=own_parts&&b3Body_GetUserData(is_a?b:a)==own_parts;
        for(int k=0;k<contact->manifoldCount;k++){
            const b3Manifold *manifold=&contact->manifolds[k];double force=0;
            for(int n=0;n<manifold->pointCount;n++)force+=480*manifold->points[n].normalImpulse;
            if(own)result.self+=force;else result.support+=fmax(0,(is_a?-1:1)*manifold->normal.y)*force;
        }
    }result.count=count;return result;
}
static Creature *body_owner(b3BodyId body){
    void *parts=b3Body_GetUserData(body);if(!parts)return NULL;
    for(int i=0;i<world.count;i++)if(world.creatures[i].physics.parts==parts)return &world.creatures[i];return NULL;
}
static ContactForces *part_contacts(const Physics *p){
    ContactForces *forces=calloc(p->count,sizeof(*forces));assert(forces);b3ContactData *contacts=NULL;int capacity=0;
    for(int i=0;i<p->count;i++)if(p->parts[i].owner==i){
        b3BodyId body=p->parts[i].body;int required=b3Body_GetContactCapacity(body);
        if(required>capacity){capacity=required;contacts=array_resize(contacts,capacity,sizeof(*contacts));}
        int count=required?b3Body_GetContactData(body,contacts,capacity):0;
        for(int j=0;j<count;j++){
            b3ContactData *contact=&contacts[j];int is_a=B3_ID_EQUALS(b3Shape_GetBody(contact->shapeIdA),body);
            PhysicsPart *part=b3Shape_GetUserData(is_a?contact->shapeIdA:contact->shapeIdB);assert(part);int index=part-p->parts;assert(index>=0&&index<p->count);
            ContactForces value=contact_forces(body,p->parts,contact,1);forces[index].support+=value.support;forces[index].self+=value.self;forces[index].count+=value.count;
        }
    }free(contacts);return forces;
}
static int magnet_index(const PhysicsPart *part,const Creature *owner){
    PhysicsPart *hit=b3Shape_IsValid(part->magnet_shape)?b3Shape_GetUserData(part->magnet_shape):NULL;
    for(int i=0;owner&&i<owner->design.count;i++)if(B3_ID_EQUALS(part->magnet_target,owner->physics.parts[i].body)&&(!hit||hit==&owner->physics.parts[i]))return i;return -1;
}
static JSValue magnet_state(JSContext *ctx,const Physics *p,const Character *c){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_MAGNET){
        PhysicsPart *part=&p->parts[i];JSValue item=JS_NewObject(ctx);put_number(ctx,item,"power",part->magnet_power);put_number(ctx,item,"load",part->magnet_load);
        int attached=b3Body_IsValid(part->magnet_target);JS_SetPropertyStr(ctx,item,"attached",JS_NewBool(ctx,attached));
        put_number(ctx,item,"targetMass",attached?b3Body_GetMass(part->magnet_target):0);
        Creature *owner=attached?body_owner(part->magnet_target):NULL;
        int index=magnet_index(part,owner);if(index>=0){put_number(ctx,item,"creature",owner->id);put_number(ctx,item,"part",index);}
        JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
static JSValue depot_state(JSContext *ctx){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<depot_count;i++){Depot d=depots[i];JSValue item=JS_NewObject(ctx);
        JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,d.name));put_number(ctx,item,"x",d.x);put_number(ctx,item,"z",d.z);put_number(ctx,item,"radius",d.radius);put_number(ctx,item,"team",d.team);JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
static int magnet_holds(const Creature *carrier,const Creature *cargo){
    if(!carrier)return 0;
    for(int i=0;i<carrier->design.count;i++){
        b3BodyId target=carrier->physics.parts[i].magnet_target;
        if(b3Body_IsValid(target)&&b3Body_GetUserData(target)==cargo->physics.parts)return 1;
    }
    return 0;
}
static float creature_mass(const Creature *c){
    float mass=0;for(int i=0;i<c->design.count;i++)mass+=c->physics.parts[i].mass;return mass;
}
static float cargo_support_force(const Creature *cargo,const Physics *holder){
    float force=0;b3ContactData *contacts=NULL;int capacity=0;
    for(int i=0;i<cargo->design.count;i++)if(cargo->physics.parts[i].owner==i){
        b3BodyId body=cargo->physics.parts[i].body;int required=b3Body_GetContactCapacity(body);
        if(required>capacity){capacity=required;contacts=array_resize(contacts,capacity,sizeof(*contacts));}
        int count=required?b3Body_GetContactData(body,contacts,capacity):0;
        for(int j=0;j<count;j++){
            b3ContactData *contact=&contacts[j];b3BodyId a=b3Shape_GetBody(contact->shapeIdA),b=b3Shape_GetBody(contact->shapeIdB);int is_a=B3_ID_EQUALS(a,body);
            void *other=b3Body_GetUserData(is_a?b:a);if(other==cargo->physics.parts||other==holder->parts)continue;
            for(int k=0;k<contact->manifoldCount;k++){
                const b3Manifold *manifold=&contact->manifolds[k];float up=fmaxf(0,(is_a?-1:1)*manifold->normal.y);
                for(int n=0;n<manifold->pointCount;n++)force+=up*480*manifold->points[n].normalImpulse;
            }
        }
    }free(contacts);return force;
}
static const char *radio_kinds[]={"sight","claim","ready","release"};
static int cargo_visible(const Creature *observer,const Creature *cargo){
    Vector3 eye,forward,up;Quaternion rotation;physics_pose(&observer->physics,&observer->design,0,&eye,&rotation);
    physics_eyes(&observer->physics,&observer->design,&eye,&forward,&up);
    b3Pos position=b3Body_GetPosition(cargo->physics.parts[0].body);Vector3 target={position.x,position.y,position.z};
    Vector3 delta=Vector3Subtract(target,eye);float distance=Vector3Length(delta);if(distance>48)return 0;
    Ray ray={eye,Vector3Scale(delta,1/fmaxf(.001f,distance))};
    for(int i=0;i<terrain_count;i++){
        TerrainBox b=terrain_box(i);RayCollision hit=GetRayCollisionBox(ray,(BoundingBox){Vector3Subtract(b.center,b.half),Vector3Add(b.center,b.half)});
        if(hit.hit&&hit.distance<distance-.1f)return 0;
    }return 1;
}
static JSValue radio_state(JSContext *ctx,int team){
    JSValue list=JS_NewArray(ctx);int count=0;
    for(int i=0;i<world.radio_count;i++){
        RadioMessage *message=&world.radio[i];if(team>=0&&message->team!=team)continue;
        JSValue item=JS_NewObject(ctx);put_number(ctx,item,"team",message->team);put_number(ctx,item,"from",message->from);put_number(ctx,item,"cargo",message->cargo);put_number(ctx,item,"time",message->time);
        JS_SetPropertyStr(ctx,item,"kind",JS_NewString(ctx,radio_kinds[message->kind]));JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,message->name));
        put_number(ctx,item,"x",message->position.x);put_number(ctx,item,"y",message->position.y);put_number(ctx,item,"z",message->position.z);put_number(ctx,item,"mass",message->mass);JS_SetPropertyUint32(ctx,list,count++,item);
    }return list;
}
static int radio_output(JSContext *ctx,JSValueConst value,int *kind,int *cargo){
    if(!JS_IsObject(value)||JS_IsArray(value))return 0;
    JSValue label=JS_GetPropertyStr(ctx,value,"kind");const char *text=JS_IsString(label)?JS_ToCString(ctx,label):NULL;
    *kind=0;while(*kind<RADIO_KINDS&&(!text||strcmp(text,radio_kinds[*kind])))++*kind;
    double id=get_number(ctx,value,"cargo",NAN);JS_FreeCString(ctx,text);JS_FreeValue(ctx,label);
    if(*kind==RADIO_KINDS||!isfinite(id)||id<1||id>INT32_MAX||id!=floor(id))return 0;*cargo=id;return 1;
}
static void radio_send(const Physics *physics,int kind,int id){
    Creature *sender=NULL,*cargo=world_find(id);
    for(int i=0;i<world.count;i++)if(world.creatures[i].physics.parts==physics->parts)sender=&world.creatures[i];
    if(!sender||!sender->team||!cargo||!cargo->cargo)return;
    int known=0;RadioMessage report={0};
    for(int i=world.radio_count-1;i>=0;i--){
        RadioMessage *message=&world.radio[i];
        if(message->from==sender->id&&world.age-message->time<3)return;
        if(!known&&message->team==sender->team&&message->cargo==id&&world.age-message->time<120){known=1;report=*message;}
    }
    int visible=cargo_visible(sender,cargo);
    if((kind==RADIO_SIGHT||kind==RADIO_READY)?!visible:!visible&&!known)return;
    if(world.radio_count==RADIO_CAPACITY){memmove(world.radio,world.radio+1,(RADIO_CAPACITY-1)*sizeof(*world.radio));world.radio_count--;}
    RadioMessage *message=&world.radio[world.radio_count++];b3Pos p=b3Body_GetPosition(cargo->physics.parts[0].body);
    *message=(RadioMessage){.team=sender->team,.from=sender->id,.cargo=id,.kind=kind,.time=world.age,.position={p.x,p.y,p.z},.mass=creature_mass(cargo)};
    if(!visible){message->position=report.position;message->mass=report.mass;}
    snprintf(message->name,sizeof(message->name),"%s",sender->name);
}
typedef struct {float radius,low,high,mass;Vector3 center;int valid;} NeighborBounds;
static NeighborBounds *neighbor_bounds;
static NeighborBounds creature_bounds(const Creature *c,b3Pos root){
    NeighborBounds b={.radius=.7f,.low=root.y,.high=root.y,.valid=1};
    for(int j=0;j<c->design.count;j++){
        const PhysicsPart *part=&c->physics.parts[j];b3Pos position=physics_position(part),com=physics_center(part);float weight=part->mass;
        float bound=block_size(c->design.blocks[j])>1?block_size(c->design.blocks[j])*.75f:.7f;
        b.radius=fmaxf(b.radius,hypotf(position.x-root.x,position.z-root.z)+bound);b.low=fminf(b.low,position.y-bound);b.high=fmaxf(b.high,position.y+bound);
        b.mass+=weight;b.center=Vector3Add(b.center,Vector3Scale((Vector3){com.x,com.y,com.z},weight));
    }
    b.center=b.mass>0?Vector3Scale(b.center,1/b.mass):(Vector3){root.x,root.y,root.z};return b;
}
typedef struct {int index;float distance;} Nearby;
static int nearby_distance(const void *a,const void *b){
    const Nearby *left=a,*right=b;return left->distance<right->distance?-1:left->distance>right->distance?1:left->index-right->index;
}
static void surroundings(JSContext *ctx,JSValue s,const Physics *p,Vector3 origin){
    JSValue nearby=JS_NewArray(ctx),ground=JS_NewArray(ctx),obstacles=JS_NewArray(ctx),terrain=JS_NewArray(ctx);int self=0;
    if(world.next_id&&b3StoreWorldId(p->world)==b3StoreWorldId(world.physics)){
        Nearby *neighbors=array_resize(NULL,world.count,sizeof(*neighbors));int count=0;
        for(int i=0;i<world.count;i++){
            Creature *c=&world.creatures[i];if(c->physics.parts==p->parts){self=c->id;continue;}
            b3Pos v=b3Body_GetPosition(c->physics.parts[0].body);float d=hypotf(v.x-origin.x,v.z-origin.z);if(d>48)continue;
            neighbors[count++]=(Nearby){i,d};
        }
        qsort(neighbors,count,sizeof(*neighbors),nearby_distance);
        for(int i=0;i<count;i++){
            int index=neighbors[i].index;Creature *c=&world.creatures[index];b3Pos v=b3Body_GetPosition(c->physics.parts[0].body);b3Vec3 velocity=physics_velocity(&c->physics.parts[0]);
            NeighborBounds bounds;
            if(neighbor_bounds){if(!neighbor_bounds[index].valid)neighbor_bounds[index]=creature_bounds(c,v);bounds=neighbor_bounds[index];}
            else bounds=creature_bounds(c,v);
            JSValue item=JS_NewObject(ctx);put_number(ctx,item,"id",c->id);JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,c->name));
            put_number(ctx,item,"x",v.x);put_number(ctx,item,"y",v.y);put_number(ctx,item,"z",v.z);put_number(ctx,item,"vx",velocity.x);put_number(ctx,item,"vy",velocity.y);put_number(ctx,item,"vz",velocity.z);
            put_number(ctx,item,"radius",bounds.radius);put_number(ctx,item,"low",bounds.low);put_number(ctx,item,"high",bounds.high);
            put_number(ctx,item,"mass",bounds.mass);JS_SetPropertyStr(ctx,item,"centerOfMass",vector(ctx,bounds.center));
            put_number(ctx,item,"team",c->team);
            put_number(ctx,item,"supply",c->supply);JS_SetPropertyStr(ctx,item,"parachute",JS_NewBool(ctx,c->parachute));
            put_number(ctx,item,"up",b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y);put_number(ctx,item,"fallenSeconds",c->fallen);
            JS_SetPropertyStr(ctx,item,"controllerStopped",JS_NewBool(ctx,c->error[0]!=0));
            Creature *observer=world_find(self);if(c->cargo)JS_SetPropertyStr(ctx,item,"visible",JS_NewBool(ctx,observer&&cargo_visible(observer,c)));
            JS_SetPropertyStr(ctx,item,"anchored",JS_NewBool(ctx,c->design.anchored));JS_SetPropertyStr(ctx,item,"cargo",JS_NewBool(ctx,c->cargo));JS_SetPropertyStr(ctx,item,"delivered",JS_NewBool(ctx,c->delivered));put_number(ctx,item,"carriedBy",c->held_by);
            JS_SetPropertyStr(ctx,item,"magnetHeld",JS_NewBool(ctx,c->cargo&&magnet_holds(world_find(c->held_by),c)));
            JS_SetPropertyUint32(ctx,nearby,i,item);
        }
        free(neighbors);
    }
    for(int i=0;i<16;i++){
        float angle=(i%8)*PI/4,radius=i<8?6:16,x=origin.x+sinf(angle)*radius,z=origin.z+cosf(angle)*radius;
        JS_SetPropertyUint32(ctx,ground,i,vector(ctx,(Vector3){x,p->landscape?terrain_height(x,z):0,z}));
    }
    for(int i=0,n=0,bounds=0;p->landscape&&i<terrain_count;i++){
        TerrainBox b=terrain_box(i);float dx=fmaxf(0,fabsf(origin.x-b.center.x)-b.half.x),dz=fmaxf(0,fabsf(origin.z-b.center.z)-b.half.z);
        if(hypotf(dx,dz)>24)continue;
        JSValue item=JS_NewObject(ctx);put_number(ctx,item,"x",b.center.x);put_number(ctx,item,"z",b.center.z);
        put_number(ctx,item,"halfX",b.half.x);put_number(ctx,item,"halfZ",b.half.z);put_number(ctx,item,"low",b.center.y-b.half.y);put_number(ctx,item,"high",b.center.y+b.half.y);
        if(b.center.y+b.half.y>=origin.y-.2f)JS_SetPropertyUint32(ctx,obstacles,n++,JS_DupValue(ctx,item));
        JS_SetPropertyUint32(ctx,terrain,bounds++,item);
    }
    put_number(ctx,s,"id",self);put_number(ctx,s,"cargoDelivered",self?world_cargo_score(self):0);
    Creature *observer=world_find(self);int team=observer?observer->team:0;put_number(ctx,s,"team",team);put_number(ctx,s,"worldTime",world.age);JS_SetPropertyStr(ctx,s,"radio",radio_state(ctx,team));
    JS_SetPropertyStr(ctx,s,"nearby",nearby);JS_SetPropertyStr(ctx,s,"groundSamples",ground);JS_SetPropertyStr(ctx,s,"obstacles",obstacles);JS_SetPropertyStr(ctx,s,"terrain",terrain);JS_SetPropertyStr(ctx,s,"depots",depot_state(ctx));
}
static JSValue winch_state(JSContext *ctx,const Physics *p,const Character *c){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_WINCH){
        const PhysicsPart *part=&p->parts[i];JSValue item=JS_NewObject(ctx);
        put_number(ctx,item,"paidOut",part->winch_length);
        float tension=b3Joint_IsValid(part->joint)?b3Length(b3Joint_GetConstraintForce(part->joint))+part->winch_pull:0;
        put_number(ctx,item,"tension",tension);JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
JSValue physics_sensors(JSContext *ctx,const Physics *p,const Character *c,double dt){
    JSValue s=JS_NewObject(ctx),angles=JS_NewArray(ctx),rates=JS_NewArray(ctx),touching=JS_NewArray(ctx),positions=JS_NewArray(ctx),submerged=JS_NewArray(ctx);
    JSValue support=JS_NewArray(ctx),self_contact=JS_NewArray(ctx),magnets=magnet_state(ctx,p,c);b3ContactData *contacts=NULL;int contact_capacity=0;
    Vector3 position;Quaternion q;physics_pose(p,c,0,&position,&q);Quaternion inverse=QuaternionInvert(q);
    surroundings(ctx,s,p,position);
    JS_SetPropertyStr(ctx,s,"contactsReady",JS_NewBool(ctx,p->sampled));
    put_number(ctx,s,"x",position.x);put_number(ctx,s,"y",position.y);put_number(ctx,s,"z",position.z);put_number(ctx,s,"dt",dt);
    put_number(ctx,s,"ground",p->landscape?terrain_floor(position):0);
    if(p->landscape)put_number(ctx,s,"waterHeight",water_height(position.x,position.z,p->time));
    Vector3 up=Vector3RotateByQuaternion((Vector3){0,1,0},q);put_number(ctx,s,"up",up.y);
    b3Vec3 v=physics_velocity(&p->parts[0]),w=b3Body_GetAngularVelocity(p->parts[0].body),gravity=b3World_GetGravity(p->world);
    put_number(ctx,s,"vx",v.x);put_number(ctx,s,"vy",v.y);put_number(ctx,s,"vz",v.z);
    JSValue rotation=vector(ctx,(Vector3){q.x,q.y,q.z});JS_SetPropertyUint32(ctx,rotation,3,JS_NewFloat64(ctx,q.w));JS_SetPropertyStr(ctx,s,"rotation",rotation);
    JS_SetPropertyStr(ctx,s,"angularVelocity",vector(ctx,(Vector3){w.x,w.y,w.z}));
    JS_SetPropertyStr(ctx,s,"gyroscope",vector(ctx,Vector3RotateByQuaternion((Vector3){w.x,w.y,w.z},inverse)));
    JS_SetPropertyStr(ctx,s,"gravity",vector(ctx,Vector3RotateByQuaternion((Vector3){gravity.x,gravity.y,gravity.z},inverse)));
    JS_SetPropertyStr(ctx,s,"localVelocity",vector(ctx,Vector3RotateByQuaternion((Vector3){v.x,v.y,v.z},inverse)));
    double mass=0;Vector3 center={0};ContactForces *forces=part_contacts(p);
    for(int i=0;i<c->count;i++){
        b3Pos pos=physics_center(&p->parts[i]);float m=p->parts[i].mass;mass+=m;center=Vector3Add(center,Vector3Scale((Vector3){pos.x,pos.y,pos.z},m));
        b3Pos origin=physics_position(&p->parts[i]);JS_SetPropertyUint32(ctx,positions,i,vector(ctx,(Vector3){origin.x,origin.y,origin.z}));
        JS_SetPropertyUint32(ctx,submerged,i,JS_NewFloat64(ctx,p->parts[i].submerged));
        JS_SetPropertyUint32(ctx,angles,i,JS_NewFloat64(ctx,p->parts[i].angle));JS_SetPropertyUint32(ctx,rates,i,JS_NewFloat64(ctx,p->parts[i].rate));
        int required,count;JS_SetPropertyUint32(ctx,touching,i,JS_NewBool(ctx,forces[i].count>0));
        JS_SetPropertyUint32(ctx,support,i,JS_NewFloat64(ctx,forces[i].support));JS_SetPropertyUint32(ctx,self_contact,i,JS_NewFloat64(ctx,forces[i].self));
        if(c->blocks[i].joint==BLOCK_MAGNET){
            b3BodyId target=p->parts[i].magnet_target;double target_support=0;
            if(b3Body_IsValid(target)){
                required=b3Body_GetContactCapacity(target);if(required>contact_capacity){contact_capacity=required;contacts=array_resize(contacts,contact_capacity,sizeof(*contacts));}
                count=required?b3Body_GetContactData(target,contacts,contact_capacity):0;
                target_support=contact_forces(target,b3Body_GetUserData(target),contacts,count).support;
            }
            float cargo_support=0;
            if(b3Body_IsValid(target))for(int j=0;j<world.count;j++)if(world.creatures[j].cargo&&world.creatures[j].physics.parts==b3Body_GetUserData(target)){cargo_support=cargo_support_force(&world.creatures[j],p);break;}
            JSValue magnet=JS_GetPropertyUint32(ctx,magnets,i);put_number(ctx,magnet,"targetSupportForce",target_support);put_number(ctx,magnet,"cargoSupportForce",cargo_support);JS_FreeValue(ctx,magnet);
        }
    }
    free(forces);free(contacts);JS_SetPropertyStr(ctx,s,"supportForce",support);JS_SetPropertyStr(ctx,s,"selfContactForce",self_contact);
    put_number(ctx,s,"mass",mass);JS_SetPropertyStr(ctx,s,"centerOfMass",vector(ctx,Vector3Scale(center,mass>0?1/mass:0)));
    JS_SetPropertyStr(ctx,s,"angles",angles);JS_SetPropertyStr(ctx,s,"rates",rates);JS_SetPropertyStr(ctx,s,"touching",touching);JS_SetPropertyStr(ctx,s,"positions",positions);JS_SetPropertyStr(ctx,s,"submerged",submerged);JS_SetPropertyStr(ctx,s,"magnets",magnets);JS_SetPropertyStr(ctx,s,"winches",winch_state(ctx,p,c));return s;
}
static int assigned(const Character *design,int key){
    if(key<=0||key>=128)return 0;
    for(int i=1;i<design->count;i++)if(block_controlled(design->blocks[i])&&(design->blocks[i].negative==key||design->blocks[i].positive==key))return 1;return 0;
}
static int controller_step(Controller *controller,const Physics *p,const Character *design,float controls[128]){
    JSContext *ctx=controller->ctx;controller_budget(controller);
    double dt=controller->last_step<0?1.0/controller->hz:(p->steps-controller->last_step)/60.0;controller->last_step=p->steps;
    JSValue args[]={JS_NewFloat64(ctx,p->steps/60.0),physics_sensors(ctx,p,design,dt),JS_DupValue(ctx,controller->memory),JS_DupValue(ctx,controller->random)};
    if(JS_IsUndefined(controller->blueprint))controller->blueprint=character_json(ctx,design);
    JS_SetPropertyStr(ctx,args[1],"blueprint",JS_DupValue(ctx,controller->blueprint));
    JSValue input=JS_NewObject(ctx),pressed=JS_NewObject(ctx);Creature *player=world.player?world_find(world.player):NULL;
    if((player && &player->physics==p)||controller==trial){
        for(int k=1;k<128;k++){char key[2]={k,0};if(world.input[k])put_number(ctx,input,key,1);if(world.pressed[k])put_number(ctx,pressed,key,1);}
        memset(world.pressed,0,sizeof(world.pressed));
    }
    JS_SetPropertyStr(ctx,args[1],"input",input);JS_SetPropertyStr(ctx,args[1],"pressed",pressed);
    JSValue result=JS_Call(ctx,controller->function,JS_UNDEFINED,4,args);for(int i=0;i<4;i++)JS_FreeValue(ctx,args[i]);
    memset(controls,0,128*sizeof(float));int valid=1,radio_kind=-1,radio_cargo=0;
    if(JS_IsString(result)){
        const char *keys=JS_ToCString(ctx,result);if(!keys)valid=0;
        else for(const unsigned char *k=(const unsigned char *)keys;*k;k++){if(!assigned(design,*k)){valid=0;break;}controls[*k]=1;}
        JS_FreeCString(ctx,keys);
    }else if(JS_IsObject(result)&&!JS_IsArray(result)){
        JSPropertyEnum *properties=NULL;uint32_t count=0;
        if(JS_GetOwnPropertyNames(ctx,&properties,&count,result,JS_GPN_STRING_MASK|JS_GPN_ENUM_ONLY)<0)valid=0;
        for(uint32_t i=0;i<count;i++){
            const char *key=JS_AtomToCString(ctx,properties[i].atom);JSValue value=JS_GetProperty(ctx,result,properties[i].atom);double level;
            if(key&&!strcmp(key,"radio")){if(!radio_output(ctx,value,&radio_kind,&radio_cargo))valid=0;}
            else if(!key||strlen(key)!=1||!assigned(design,(unsigned char)key[0])||!JS_IsNumber(value)||JS_ToFloat64(ctx,&level,value)<0||!isfinite(level)||level<0||level>1)valid=0;
            else controls[(unsigned char)key[0]]=level;
            JS_FreeCString(ctx,key);JS_FreeValue(ctx,value);JS_FreeAtom(ctx,properties[i].atom);
        }js_free(ctx,properties);
    }else valid=0;
    if(!valid){
        snprintf(controller->error,sizeof(controller->error),"%s",controller->exhausted?"Controller execution budget exceeded":"Invalid controller output");
        if(JS_IsException(result)){JSValue error=JS_GetException(ctx);const char *text=JS_ToCString(ctx,error);if(text&&!controller->exhausted)snprintf(controller->error,sizeof(controller->error),"%s",text);JS_FreeCString(ctx,text);JS_FreeValue(ctx,error);}
    }
    if(valid&&radio_kind>=0)radio_send(p,radio_kind,radio_cargo);
    JS_FreeValue(ctx,result);return valid;
}
void world_trial_stop(void){controller_free(trial);trial=NULL;memset(trial_controls,0,sizeof(trial_controls));memset(&trial_status,0,sizeof(trial_status));trial_status.cause=-1;}
int world_trial_begin(const Physics *p){
    world_trial_stop();if(installed)trial=controller_new(installed,1,installed_hz);
    trial_status.height=p->start.y-fmaxf(p->landscape?terrain_height(p->start.x,p->start.z):0,WATER_LEVEL);return trial!=NULL;
}
const char *world_trial_error(void){return trial_status.cause>=0?trial_status.detail:"Controller unavailable";}
int world_trial_step(Physics *p,const Character *c){
    if(!trial||trial_status.cause>=0)return 0;
    int cause=-1;float up=1;
    if(p->steps%(60/trial->hz)==0&&!controller_step(trial,p,c,trial_controls))cause=REMOVAL_CONTROLLER;
    else{
        physics_drive(p,c,trial_controls);b3World_Step(p->world,1.f/60,8);physics_sample(p,c);
        Vector3 position;Quaternion rotation;physics_pose(p,c,0,&position,&rotation);up=Vector3RotateByQuaternion((Vector3){0,1,0},rotation).y;
        cause=physical_failure(c,position,up,trial_status.height,p->landscape?terrain_floor(position):0);
        if(!sustained_failure(&trial_status.fallen,p->steps,cause)||(cause!=REMOVAL_NONFINITE&&cause!=REMOVAL_TERRAIN))return 1;
    }
    trial_status.cause=cause;trial_status.steps=p->steps;snprintf(trial_status.detail,sizeof(trial_status.detail),"%s",failure_detail(cause,up,trial->error));
    memset(trial_controls,0,sizeof(trial_controls));return 0;
}
JSValue world_creature_program(JSContext *ctx,int id){
    Creature *c=world_find(id);if(!c)return JS_NULL;JSValue result=JS_NewObject(ctx);
    JS_SetPropertyStr(ctx,result,"name",JS_NewString(ctx,c->name));JS_SetPropertyStr(ctx,result,"source",JS_NewString(ctx,c->controller->source));put_number(ctx,result,"hz",c->controller->hz);if(c->error[0])JS_SetPropertyStr(ctx,result,"error",JS_NewString(ctx,c->error));return result;
}
JSValue world_program(JSContext *ctx){
    if(!installed)return JS_NULL;JSValue result=JS_NewObject(ctx);
    JS_SetPropertyStr(ctx,result,"name",JS_NewString(ctx,installed_name));JS_SetPropertyStr(ctx,result,"source",JS_NewString(ctx,installed));put_number(ctx,result,"hz",installed_hz);
    JSValue memory=JS_NULL;const char *error=NULL;
    if(trial){
        size_t length=0;const char *json=controller_memory_json(trial,&length);
        if(!json)error="Controller memory could not be serialized within its execution and heap limits";
        else if(length>8192)error="Controller memory exceeds the 8 KiB inspection limit";
        else {memory=JS_ParseJSON(ctx,json,length,"controller-memory");if(JS_IsException(memory)){JS_FreeValue(ctx,JS_GetException(ctx));memory=JS_NULL;error="Controller memory could not be copied";}}
        JS_FreeCString(trial->ctx,json);
    }
    JS_SetPropertyStr(ctx,result,"memory",memory);if(error)JS_SetPropertyStr(ctx,result,"memoryError",JS_NewString(ctx,error));
    if(trial_status.cause>=0){
        JSValue failure=JS_NewObject(ctx);put_number(ctx,failure,"seconds",trial_status.steps/60.0);
        JS_SetPropertyStr(ctx,failure,"cause",JS_NewString(ctx,removal_causes[trial_status.cause]));JS_SetPropertyStr(ctx,failure,"detail",JS_NewString(ctx,trial_status.detail));JS_SetPropertyStr(ctx,result,"failure",failure);
    }return result;
}
JSValue world_install(JSContext *ctx,JSValueConst args){
    JSValue code=JS_GetPropertyStr(ctx,args,"source"),name=JS_GetPropertyStr(ctx,args,"name");
    const char *source=JS_ToCString(ctx,code),*label=JS_ToCString(ctx,name);JSValue result=JS_UNDEFINED;
    double hz=get_number(ctx,args,"hz",10);
    Controller *probe=source&&valid_controller_hz(hz)?controller_new(source,1,hz):NULL;
    if(!probe)result=JS_ThrowTypeError(ctx,"Controller must compile to a JavaScript function within its heap and execution limits; return key letters or key strengths 0..1, hz 1/10/20/30/60");
    else {world_trial_stop();installed_hz=hz;free(installed);installed=strdup(source);snprintf(installed_name,sizeof(installed_name),"%s",label?label:"Creature");controller_free(probe);}
    JS_FreeCString(ctx,source);JS_FreeCString(ctx,label);JS_FreeValue(ctx,code);JS_FreeValue(ctx,name);return result;
}
JSValue world_designs(JSContext *ctx,int full){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<world.design_count;i++){SavedDesign *d=&world.designs[i];JSValue item=JS_NewObject(ctx);
        put_number(ctx,item,"id",i+1);put_number(ctx,item,"parts",d->design.count);put_number(ctx,item,"hz",d->hz);put_number(ctx,item,"x",d->x);put_number(ctx,item,"z",d->z);
        JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,d->name));JS_SetPropertyStr(ctx,item,"anchored",JS_NewBool(ctx,d->design.anchored));
        JS_SetPropertyStr(ctx,item,"sea",JS_NewBool(ctx,terrain_height(d->x,d->z)<WATER_LEVEL));
        JS_SetPropertyStr(ctx,item,"programmed",JS_NewBool(ctx,d->source!=NULL));
        if(full){JS_SetPropertyStr(ctx,item,"blueprint",character_json(ctx,&d->design));JS_SetPropertyStr(ctx,item,"source",d->source?JS_NewString(ctx,d->source):JS_NULL);}
        JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
JSValue world_open_design(JSContext *ctx,int index,Character *design){
    if(index<0||index>=world.design_count)return JS_ThrowRangeError(ctx,"Unknown saved design");
    SavedDesign *d=&world.designs[index];JSValue args=JS_NewObject(ctx);
    if(!d->source){world_trial_stop();free(installed);installed=NULL;installed_hz=10;snprintf(installed_name,sizeof(installed_name),"%s",d->name);character_copy(design,&d->design);JS_FreeValue(ctx,args);return JS_UNDEFINED;}
    JS_SetPropertyStr(ctx,args,"source",JS_NewString(ctx,d->source));JS_SetPropertyStr(ctx,args,"name",JS_NewString(ctx,d->name));put_number(ctx,args,"hz",d->hz);
    JSValue result=world_install(ctx,args);JS_FreeValue(ctx,args);if(!JS_IsException(result))character_copy(design,&d->design);return result;
}
JSValue world_save_design(JSContext *ctx,const Character *design,int sea){
    if(!design->count)return JS_ThrowTypeError(ctx,"Build a character before saving a design");
    return JS_NewInt32(ctx,remember_design(design,installed,installed?installed_name:"Workshop build",installed_hz,sea?125:0,sea?10:0));
}
static Creature *spawn(const Character *design,const char *source,const char *name,uint32_t seed,int hz,float x,float z){
    Controller *controller=controller_new(source,seed,hz);if(!controller)return NULL;
    if(!world.next_id){world.next_id=1;world.physics=physics_world(1);}
    if(world.count==world.capacity){world.capacity=world.capacity?world.capacity*2:16;world.creatures=array_resize(world.creatures,world.capacity,sizeof(Creature));}
    Creature *c=&world.creatures[world.count++];memset(c,0,sizeof(*c));c->id=world.next_id++;snprintf(c->name,sizeof(c->name),"%s",name);c->controller=controller;
    c->cargo=!design->anchored;
    for(int i=0;i<design->count;i++)if(design->blocks[i].joint!=BLOCK_BOX)c->cargo=0;
    character_copy(&c->design,design);physics_attach(&c->physics,&c->design,world.physics,x,z,1);c->physics.time=world.age;
    Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);c->root_height=p.y-fmaxf(terrain_height(x,z),WATER_LEVEL);return c;
}
static void set_spawn_height(Creature *c,float y){
    float offset=y-c->physics.start.y;
    for(int i=0;i<c->design.count;i++)if(c->physics.parts[i].owner==i){
        b3BodyId body=c->physics.parts[i].body;b3WorldTransform t=b3Body_GetTransform(body);t.p.y+=offset;b3Body_SetTransform(body,t.p,t.q);
    }c->physics.start.y=y;
}
Creature *world_find(int id){for(int i=0;i<world.count;i++)if(world.creatures[i].id==id)return &world.creatures[i];return NULL;}
int world_enter(const Character *design,int sea){
    if(!design->count||design->anchored)return 0;
    float radius=1,x=0,z=0;int clear=0;
    for(int i=0;i<design->count;i++){Block b=design->blocks[i];Vector3 p=block_position(b);radius=fmaxf(radius,hypotf(p.x,p.z)+(block_size(b)>1?block_size(b)*.75f:1));}
    for(int plot=0;plot<64&&!clear;plot++){
        float distance=plot?(radius+2)*sqrtf(plot):0,angle=plot*2.399963f;
        x=(sea?125:0)+cosf(angle)*distance;z=(sea?10:12)+sinf(angle)*distance;
        if(fabsf(x)>240-radius||fabsf(z)>240-radius||(terrain_height(x,z)<WATER_LEVEL)!=sea)continue;
        clear=1;
        for(int i=0;i<world.count&&clear;i++)if(world.creatures[i].id!=world.player){
            Physics *p=&world.creatures[i].physics;for(int j=0;j<p->count;j++){
                b3Pos v=physics_position(&p->parts[j]);if(hypotf(v.x-x,v.z-z)<radius+(block_size(world.creatures[i].design.blocks[j])>1?block_size(world.creatures[i].design.blocks[j])*.75f:1)){clear=0;break;}
            }
        }
    }
    if(!clear)return 0;
    for(int i=0;i<world.count;i++)if(world.creatures[i].id==world.player){
        Creature *old=&world.creatures[i];physics_stop(&old->physics);character_clear(&old->design);controller_free(old->controller);
        world.creatures[i]=world.creatures[--world.count];break;
    }
    char *fallback=installed?NULL:LoadFileText("/usr/src/dolly/blockwalker/driver.js");
    world.player=0;Creature *player=installed||fallback?spawn(design,installed?installed:fallback,"Your character",1,installed?installed_hz:60,x,z):NULL;UnloadFileText(fallback);
    if(player)world.player=player->id;return world.player;
}
int world_drop_cargo(float x,float y,float z,int material){
    Character box={0};character_add(&box,-1,0,0,0,BLOCK_BOX,1);box.blocks[0].material=material;box.blocks[0].finish=FINISH_STRIPE;
    Creature *cargo=spawn(&box,"function(){return ''}","Cargo",1,1,x,z);character_clear(&box);if(cargo&&isfinite(y))set_spawn_height(cargo,y);return cargo?cargo->id:0;
}
static Creature *cargo_carrier(const Creature *cargo,int *supported){
    if(supported)*supported=0;
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];if(c->cargo)continue;
        if(magnet_holds(c,cargo))return c;
    }
    b3ContactData *contacts=NULL;int capacity=0;Creature *carrier=NULL;
    for(int part=0;part<cargo->design.count&&!carrier;part++)if(cargo->physics.parts[part].owner==part){
        b3BodyId body=cargo->physics.parts[part].body;int required=b3Body_GetContactCapacity(body);
        if(required>capacity){capacity=required;contacts=array_resize(contacts,capacity,sizeof(*contacts));}
        int count=required?b3Body_GetContactData(body,contacts,capacity):0;
        for(int i=0;i<count&&!carrier;i++){
            b3ContactData *contact=&contacts[i];b3BodyId a=b3Shape_GetBody(contact->shapeIdA),b=b3Shape_GetBody(contact->shapeIdB);int is_a=B3_ID_EQUALS(a,body);
            Creature *owner=body_owner(is_a?b:a);if(owner==cargo)continue;
            for(int j=0;j<contact->manifoldCount;j++)if((is_a?-1:1)*contact->manifolds[j].normal.y>.5f){
                if(supported)*supported=1;if(owner&&!owner->cargo)carrier=owner;break;
            }
        }
    }free(contacts);return carrier;
}
int world_cargo_score(int id){
    if(id==world.player)id=-1;int score=0;
    for(int i=0;i<world.delivery_count;i++)score+=world.deliveries[i].carrier==id;return score;
}
int world_team_color(int team){return team==1?3:2;}
int world_team_score(int team){
    if(team<1||team>2)return 0;int score=0;
    for(int i=0;i<world.delivery_count;i++)if(depots[world.deliveries[i].depot].team==team)score+=world.deliveries[i].points;
    return score;
}
static Delivery *new_delivery(void){
    if(world.delivery_count==world.delivery_capacity){world.delivery_capacity=world.delivery_capacity?world.delivery_capacity*2:16;world.deliveries=array_resize(world.deliveries,world.delivery_capacity,sizeof(Delivery));}
    Delivery *d=&world.deliveries[world.delivery_count++];memset(d,0,sizeof(*d));return d;
}
static void cargo_step(void){
    for(int i=0;i<world.count;i++){
        Creature *cargo=&world.creatures[i];if(!cargo->cargo)continue;
        int supported=0;b3BodyId body=cargo->physics.parts[0].body;b3Pos p=b3Body_GetPosition(body);Creature *owner=cargo_carrier(cargo,&supported);
        cargo->held_by=owner?owner->id:0;
        if(cargo->delivered)continue;
        if(owner){
            if(!cargo->carrier)cargo->pickup=(Vector3){p.x,p.y,p.z};
            cargo->carrier=owner->id==world.player?-1:owner->id;cargo->settled=0;continue;
        }
        int depot=-1;
        for(int j=0;j<depot_count;j++){Depot d=depots[j];
            if(hypotf(p.x-d.x,p.z-d.z)<d.radius-.5f&&hypotf(cargo->pickup.x-d.x,cargo->pickup.z-d.z)>d.radius+1&&
               supported&&hypotf(p.x-cargo->pickup.x,p.z-cargo->pickup.z)>3){depot=j;break;}
        }
        if(!cargo->carrier||depot<0||b3LengthSquared(b3Body_GetLinearVelocity(body))>.16f){cargo->settled=0;continue;}
        cargo->settled+=1.f/60;if(cargo->settled<1)continue;
        Delivery *d=new_delivery();d->cargo=cargo->id;d->carrier=cargo->carrier;d->depot=depot;d->time=world.age;
        d->points=creature_mass(cargo)>8?8:1;
        Creature *carrier=world_find(cargo->carrier);snprintf(d->name,sizeof(d->name),"%s",cargo->carrier==-1?"You":carrier?carrier->name:"Removed carrier");
        if(!carrier&&cargo->carrier>0)for(int j=0;j<world.removal_count;j++)if(world.removals[j].id==cargo->carrier)snprintf(d->name,sizeof(d->name),"%s",world.removals[j].name);
        cargo->delivered=1;for(int j=0;j<cargo->design.count;j++)cargo->design.blocks[j].color=0;
        printf("CARGO %d delivered by %s to %s / total %d\n",cargo->id,d->name,depots[depot].name,world.delivery_count);
    }
}
static double supply_random(void){
    unsigned seed=world.supply_seed;seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;world.supply_seed=seed;return seed/4294967296.0;
}
static void supply_step(void){
    int parcels=0,ore=0,mine=0,blocked=0,platform=0,mine_blocked=0,drilling=0;
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
        if(!c->delivered){parcels+=c->supply==1;ore+=c->supply==2;mine+=c->supply==3;}
        if(c->cargo&&hypotf(p.x+47,p.z-61)<4)blocked=1;
        if(c->cargo&&hypotf(p.x+73,p.z+78)<3)mine_blocked=1;
        if(c->design.anchored)for(int j=0;j<c->design.count;j++){
            b3BodyId body=c->physics.parts[j].body;b3Pos p=physics_position(&c->physics.parts[j]);
            if(hypotf(p.x+47,p.z-61)<.65f&&p.y> -8.2f&&p.y< -7.6f&&b3LengthSquared(physics_velocity(&c->physics.parts[j]))<.01f)platform=1;
            if(c->design.blocks[j].joint==BLOCK_TURNTABLE&&hypotf(p.x+85,p.z+81)<4&&b3LengthSquared(b3Body_GetAngularVelocity(body))>1)drilling=1;
        }
    }
    if(world.age>=world.next_parcel&&parcels<6){
        const Vector2 sites[]={{-60,-25},{-15,-45},{45,-30},{65,20},{-43,47},{8,66},{-72,72},{38,32}};
        int first=(int)(supply_random()*8);Vector2 site=sites[first];
        for(int offset=0;offset<8;offset++){
            site=sites[(first+offset)%8];int occupied=0;
            for(int i=0;i<world.count;i++){
                Creature *c=&world.creatures[i];
                if(c->supply==1&&!c->delivered&&hypotf(c->physics.start.x-site.x,c->physics.start.z-site.y)<5)occupied=1;
            }
            if(!occupied)break;
        }
        float x=site.x+(supply_random()-.5f)*6,z=site.y+(supply_random()-.5f)*6;
        int id=world_drop_cargo(x,42+10*supply_random(),z,MATERIAL_ALLOY);Creature *cargo=world_find(id);
        if(cargo){cargo->supply=1;cargo->parachute=1;snprintf(cargo->name,sizeof(cargo->name),"Air parcel");}
        world.next_parcel=world.age+45+45*supply_random();
    }
    if(world.age>=world.next_ore&&ore<3&&!blocked&&platform){
        Character crate={0};character_add(&crate,-1,0,0,0,BLOCK_BOX,1);character_add(&crate,0,1,0,0,BLOCK_BOX,1);character_add(&crate,0,0,0,1,BLOCK_BOX,1);character_add(&crate,1,1,0,1,BLOCK_BOX,1);
        for(int i=0;i<crate.count;i++){crate.blocks[i].material=MATERIAL_BALLAST;crate.blocks[i].finish=FINISH_STRIPE;}
        Creature *cargo=spawn(&crate,"function(){return ''}","Ore pallet",1,1,-47,60.5f);character_clear(&crate);
        if(cargo){cargo->supply=2;set_spawn_height(cargo,-6.9f);}
        world.next_ore=world.age+60+30*supply_random();
    }
    if(terrain_version>=2&&world.age>=world.next_mine&&mine<2&&!mine_blocked&&drilling){
        int id=world_drop_cargo(-73,.55f,-78,MATERIAL_BALLAST);Creature *cargo=world_find(id);
        if(cargo){cargo->supply=3;cargo->design.blocks[0].color=2;cargo->design.blocks[0].finish=FINISH_GLOW;snprintf(cargo->name,sizeof(cargo->name),"Core sample");}
        world.next_mine=world.age+50+30*supply_random();
    }
}
static void parachute_force(Creature *cargo){
    if(!cargo->parachute)return;b3BodyId body=cargo->physics.parts[0].body;b3Pos p=b3Body_GetPosition(body);
    if(cargo->held_by||p.y<fmaxf(WATER_LEVEL,terrain_floor((Vector3){p.x,p.y,p.z}))+1.4f){cargo->parachute=0;return;}
    b3Vec3 velocity=b3Body_GetLinearVelocity(body);float mass=creature_mass(cargo);
    b3Body_ApplyForceToCenter(body,(b3Vec3){mass*(.25f*sinf(world.age*.11f)-velocity.x),mass*fmaxf(0,-2.4f*velocity.y),mass*(.18f*cosf(world.age*.13f)-velocity.z)},true);
}
JSValue world_release(JSContext *ctx,const Character *design,JSValueConst args){
    if(!installed||!design->count)return JS_ThrowTypeError(ctx,"Build a character and install a learned controller first");
    int index=world.next_id?world.next_id-1:0,plot=index%256;float angle=plot*2.399963f,radius=5*sqrtf(plot);
    float x=get_number(ctx,args,"x",cosf(angle)*radius),z=get_number(ctx,args,"z",sinf(angle)*radius);
    if(!isfinite(x)||!isfinite(z)||fabsf(x)>WORLD_RADIUS-8||fabsf(z)>WORLD_RADIUS-8)return JS_ThrowRangeError(ctx,"Spawn must be inside the 512 m world; the sea surrounds the central 200 m ground");
    double team=get_number(ctx,args,"team",0);if(!isfinite(team)||team<0||team>2||team!=floor(team))return JS_ThrowRangeError(ctx,"Team must be 0 (neutral), 1 (East) or 2 (West)");
    Creature *c=spawn(design,installed,installed_name,(uint32_t)get_number(ctx,args,"seed",index+1),installed_hz,x,z);
    if(!c)return JS_ThrowInternalError(ctx,"Controller failed to initialize");
    c->team=team;
    remember_design(design,installed,installed_name,installed_hz,x,z);
    printf("CREATURE %d born: %s, %d parts\n",c->id,c->name,c->design.count);return JS_NewInt32(ctx,c->id);
}
static JSValue removal_state(JSContext *ctx,int full){
    JSValue list=JS_NewArray(ctx);int first=full?0:(int)fmaxf(0,world.removal_count-8);
    for(int i=first;i<world.removal_count;i++){Removal *r=&world.removals[i];JSValue item=JS_NewObject(ctx);
        put_number(ctx,item,"id",r->id);put_number(ctx,item,"time",r->time);put_number(ctx,item,"seconds",r->seconds);put_number(ctx,item,"up",r->up);
        put_number(ctx,item,"x",r->position.x);put_number(ctx,item,"y",r->position.y);put_number(ctx,item,"z",r->position.z);
        JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,r->name));JS_SetPropertyStr(ctx,item,"cause",JS_NewString(ctx,removal_causes[r->cause]));JS_SetPropertyStr(ctx,item,"detail",JS_NewString(ctx,r->detail));JS_SetPropertyUint32(ctx,list,i-first,item);
    }return list;
}
static Removal *new_removal(void){
    if(world.removal_count==world.removal_capacity){world.removal_capacity=world.removal_capacity?world.removal_capacity*2:16;world.removals=array_resize(world.removals,world.removal_capacity,sizeof(Removal));}
    Removal *r=&world.removals[world.removal_count++];memset(r,0,sizeof(*r));return r;
}
static JSValue delivery_state(JSContext *ctx){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<world.delivery_count;i++){Delivery *d=&world.deliveries[i];JSValue item=JS_NewObject(ctx);
        put_number(ctx,item,"cargoId",d->cargo);put_number(ctx,item,"carrierId",d->carrier);put_number(ctx,item,"depot",d->depot);put_number(ctx,item,"time",d->time);
        put_number(ctx,item,"points",d->points);
        JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,d->name));JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
JSValue world_state(JSContext *ctx){
    JSValue result=JS_NewObject(ctx),list=JS_NewArray(ctx);put_number(ctx,result,"deaths",world.deaths);put_number(ctx,result,"seconds",world.age);
    put_number(ctx,result,"playerId",world.player);
    put_number(ctx,result,"cargoDelivered",world.delivery_count);put_number(ctx,result,"playerDelivered",world_cargo_score(-1));
    JSValue scores=JS_NewArray(ctx);for(int team=1;team<=2;team++)JS_SetPropertyUint32(ctx,scores,team-1,JS_NewInt32(ctx,world_team_score(team)));JS_SetPropertyStr(ctx,result,"teamScores",scores);
    JS_SetPropertyStr(ctx,result,"deliveries",delivery_state(ctx));
    JS_SetPropertyStr(ctx,result,"depots",depot_state(ctx));
    JS_SetPropertyStr(ctx,result,"recentRemovals",removal_state(ctx,0));
    JS_SetPropertyStr(ctx,result,"radio",radio_state(ctx,-1));
    if(world.supply_seed){JSValue supply=JS_NewObject(ctx);put_number(ctx,supply,"seed",world.supply_seed);put_number(ctx,supply,"nextParcel",world.next_parcel);put_number(ctx,supply,"nextOre",world.next_ore);put_number(ctx,supply,"nextMine",world.next_mine);JS_SetPropertyStr(ctx,result,"supply",supply);}
    put_number(ctx,result,"terrainVersion",terrain_version);
    JSValue terrain=JS_NewObject(ctx);put_number(ctx,terrain,"radius",WORLD_RADIUS);put_number(ctx,terrain,"waterLevel",WATER_LEVEL);
    JS_SetPropertyStr(ctx,terrain,"harbor",vector(ctx,(Vector3){112,0,20}));JS_SetPropertyStr(ctx,terrain,"seaTrial",vector(ctx,(Vector3){125,-2,10}));
    JS_SetPropertyStr(ctx,terrain,"basin",vector(ctx,(Vector3){46,0,72}));
    if(terrain_version){JS_SetPropertyStr(ctx,terrain,"foundry",vector(ctx,(Vector3){-47,0,64}));JS_SetPropertyStr(ctx,terrain,"loadingQuay",vector(ctx,(Vector3){-44,0,110}));}
    if(terrain_version>=2){JS_SetPropertyStr(ctx,terrain,"mine",vector(ctx,(Vector3){-74,0,-70}));JS_SetPropertyStr(ctx,terrain,"sump",vector(ctx,(Vector3){-60,-2,-73}));JS_SetPropertyStr(ctx,terrain,"dispatch",vector(ctx,(Vector3){-74,0,-20}));}
    JS_SetPropertyStr(ctx,terrain,"eastIsland",vector(ctx,(Vector3){170,4,30}));JS_SetPropertyStr(ctx,terrain,"westIsland",vector(ctx,(Vector3){-174,2,-35}));JS_SetPropertyStr(ctx,terrain,"northRidge",vector(ctx,(Vector3){15,6,-175}));JS_SetPropertyStr(ctx,result,"terrain",terrain);
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];JSValue item=JS_NewObject(ctx);Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);
        put_number(ctx,item,"id",c->id);JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,c->name));put_number(ctx,item,"parts",c->design.count);
        JS_SetPropertyStr(ctx,item,"anchored",JS_NewBool(ctx,c->design.anchored));
        put_number(ctx,item,"mass",creature_mass(c));
        put_number(ctx,item,"team",c->team);
        put_number(ctx,item,"supply",c->supply);JS_SetPropertyStr(ctx,item,"parachute",JS_NewBool(ctx,c->parachute));
        JS_SetPropertyStr(ctx,item,"cargo",JS_NewBool(ctx,c->cargo));JS_SetPropertyStr(ctx,item,"delivered",JS_NewBool(ctx,c->delivered));put_number(ctx,item,"carrierId",c->carrier);put_number(ctx,item,"carriedBy",c->held_by);put_number(ctx,item,"cargoDelivered",world_cargo_score(c->id));
        if(c->cargo){JS_SetPropertyStr(ctx,item,"pickup",vector(ctx,c->pickup));put_number(ctx,item,"settled",c->settled);}
        JS_SetPropertyStr(ctx,item,"magnets",magnet_state(ctx,&c->physics,&c->design));
        JS_SetPropertyStr(ctx,item,"winches",winch_state(ctx,&c->physics,&c->design));
        put_number(ctx,item,"seconds",c->physics.steps/60.0);put_number(ctx,item,"x",p.x);put_number(ctx,item,"y",p.y);put_number(ctx,item,"z",p.z);
        put_number(ctx,item,"distance",hypot(p.x-c->physics.start.x,p.z-c->physics.start.z));
        b3Vec3 velocity=physics_velocity(&c->physics.parts[0]);put_number(ctx,item,"speed",hypot(velocity.x,velocity.z));
        put_number(ctx,item,"up",Vector3RotateByQuaternion((Vector3){0,1,0},q).y);put_number(ctx,item,"fallenSeconds",c->fallen);
        if(c->error[0])JS_SetPropertyStr(ctx,item,"controllerError",JS_NewString(ctx,c->error));
        JS_SetPropertyUint32(ctx,list,i,item);
    }JS_SetPropertyStr(ctx,result,"creatures",list);return result;
}
void world_step(void){
    if(!world.next_id){world.next_id=1;world.physics=physics_world(1);}
    if(world.supply_seed&&llround(world.age*60)%60==0)supply_step();
    /* Poses stay fixed throughout the controller phase; actuator state does not. */
    if(world.count){neighbor_bounds=calloc(world.count,sizeof(*neighbor_bounds));assert(neighbor_bounds);}
    for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];
        c->physics.time=world.age;
        int due=c->controller->last_step<0||c->physics.steps-c->controller->last_step>=60/c->controller->hz;
        if(!c->error[0]&&(c->id!=world.player||world.driving)&&(c->physics.sampled||c->physics.steps==0)&&due&&!controller_step(c->controller,&c->physics,&c->design,c->controls)){
            snprintf(c->error,sizeof(c->error),"%s",c->controller->error);memset(c->controls,0,sizeof(c->controls));
            printf("CREATURE %d program stopped: %s (%s)\n",c->id,c->name,c->error);
        }
        physics_drive(&c->physics,&c->design,c->controls);
        parachute_force(c);
    }
    free(neighbor_bounds);neighbor_bounds=NULL;
    b3World_Step(world.physics,1.f/60,8);world.age+=1./60;cargo_step();
    for(int i=0;i<world.count;){Creature *c=&world.creatures[i];physics_sample(&c->physics,&c->design);
        Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);float up=Vector3RotateByQuaternion((Vector3){0,1,0},q).y;
        int cause=physical_failure(&c->design,p,up,c->root_height,terrain_floor(p));
        if(c->cargo&&(cause==REMOVAL_SUNK||cause==REMOVAL_POSTURE))cause=-1;
        if(sustained_failure(&c->fallen,c->physics.steps,cause)&&(cause==REMOVAL_NONFINITE||cause==REMOVAL_TERRAIN)){
            Removal *r=new_removal();r->id=c->id;r->time=world.age;r->seconds=c->physics.steps/60.0;r->position=p;r->up=up;snprintf(r->name,sizeof(r->name),"%s",c->name);
            r->cause=cause;
            snprintf(r->detail,sizeof(r->detail),"%s",failure_detail(r->cause,up,c->controller->error));
            printf("CREATURE %d removed: %s after %.1fs (%s: %s; xyz %.3f %.3f %.3f, up %.3f)\n",c->id,c->name,r->seconds,removal_causes[r->cause],r->detail,p.x,p.y,p.z,up);
            if(c->id==world.player)world.player=0;
            physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);world.creatures[i]=world.creatures[--world.count];world.deaths++;
        }else i++;
    }
}
static void destroy_world(World *w){
    for(int i=0;i<w->count;i++){Creature *c=&w->creatures[i];physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);}
    for(int i=0;i<w->design_count;i++){character_clear(&w->designs[i].design);free(w->designs[i].source);}free(w->designs);
    if(w->next_id)b3DestroyWorld(w->physics);free(w->creatures);free(w->removals);free(w->deliveries);memset(w,0,sizeof(*w));
}
void world_close(void){
    world_trial_stop();destroy_world(&world);free(installed);installed=NULL;
}
static int save_json(JSContext *ctx,JSValueConst value,const char *path){
    JSValue json=JS_JSONStringify(ctx,value,JS_UNDEFINED,JS_UNDEFINED);const char *source=JS_ToCString(ctx,json);
    char temp[256];snprintf(temp,sizeof(temp),"%s.tmp",path);FILE *f=source?fopen(temp,"w"):NULL;
    int good=0;if(f){good=fputs(source,f)>=0;if(fclose(f)!=0)good=0;if(good)good=rename(temp,path)==0;}
    if(!good)remove(temp);JS_FreeCString(ctx,source);JS_FreeValue(ctx,json);return good;
}
static int save_world(JSContext *ctx,const char *path){
    JSValue save=world_state(ctx),list=JS_GetPropertyStr(ctx,save,"creatures");put_number(ctx,save,"version",5);put_number(ctx,save,"nextId",world.next_id);put_number(ctx,save,"installedHz",installed_hz);
    JS_SetPropertyStr(ctx,save,"format",JS_NewString(ctx,"blockwalker-world"));
    JS_SetPropertyStr(ctx,save,"designs",world_designs(ctx,1));
    JS_SetPropertyStr(ctx,save,"removals",removal_state(ctx,1));
    if(installed){JS_SetPropertyStr(ctx,save,"installed",JS_NewString(ctx,installed));JS_SetPropertyStr(ctx,save,"name",JS_NewString(ctx,installed_name));}
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];JSValue item=JS_GetPropertyUint32(ctx,list,i),poses=JS_NewArray(ctx);
        JS_SetPropertyStr(ctx,item,"blueprint",character_json(ctx,&c->design));JS_SetPropertyStr(ctx,item,"source",JS_NewString(ctx,c->controller->source));
        JSValue controls=JS_NewObject(ctx);for(int j=1;j<128;j++)if(c->controls[j]&&assigned(&c->design,j)){char key[2]={j,0};put_number(ctx,controls,key,c->controls[j]);}JS_SetPropertyStr(ctx,item,"controls",controls);
        put_number(ctx,item,"hz",c->controller->hz);put_number(ctx,item,"controlStep",c->controller->last_step);put_number(ctx,item,"seed",c->controller->seed);put_number(ctx,item,"rootHeight",c->root_height);put_number(ctx,item,"startX",c->physics.start.x);put_number(ctx,item,"startZ",c->physics.start.z);
        size_t length=0;const char *m=controller_memory_json(c->controller,&length);if(m)JS_SetPropertyStr(ctx,item,"memory",JS_NewStringLen(ctx,m,length));JS_FreeCString(c->controller->ctx,m);
        for(int j=0;j<c->design.count;j++){
            Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,j,&p,&q);b3Vec3 v=physics_velocity(&c->physics.parts[j]),a=b3Body_GetAngularVelocity(c->physics.parts[j].body);
            double values[]={p.x,p.y,p.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,a.x,a.y,a.z};JSValue pose=JS_NewArray(ctx);
            for(int k=0;k<13;k++)JS_SetPropertyUint32(ctx,pose,k,JS_NewFloat64(ctx,values[k]));JS_SetPropertyUint32(ctx,poses,j,pose);
        }JS_SetPropertyStr(ctx,item,"poses",poses);
        JSValue magnets=JS_GetPropertyStr(ctx,item,"magnets");
        for(int j=0;j<c->design.count;j++)if(c->design.blocks[j].joint==BLOCK_MAGNET){
            PhysicsPart *part=&c->physics.parts[j];JSValue magnet=JS_GetPropertyUint32(ctx,magnets,j);
            if(get_number(ctx,magnet,"creature",0)){
                Creature *owner=body_owner(part->magnet_target);int index=magnet_index(part,owner);assert(index>=0);b3Vec3 local=b3InvTransformPoint(owner->physics.parts[index].frame,part->magnet_local);
                JS_SetPropertyStr(ctx,magnet,"local",vector(ctx,(Vector3){local.x,local.y,local.z}));
            }JS_FreeValue(ctx,magnet);
        }JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,item);
    }int good=save_json(ctx,save,path);JS_FreeValue(ctx,list);JS_FreeValue(ctx,save);return good;
}
int world_save(JSContext *ctx){return save_world(ctx,"/workspace/blockwalker-world.json");}
static JSValue read_json(JSContext *ctx,const char *path){
    FILE *f=fopen(path,"r");if(!f)return JS_UNDEFINED;fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);
    if(size<0||size>128*1024*1024){fclose(f);return JS_UNDEFINED;}char *source=array_resize(NULL,size+1,1);size_t n=fread(source,1,size,f);source[n]=0;fclose(f);
    JSValue save=JS_ParseJSON(ctx,source,n,"saved-world");free(source);if(JS_IsException(save)){JS_FreeValue(ctx,JS_GetException(ctx));return JS_UNDEFINED;}
    return save;
}
static int read_design(JSContext *ctx,JSValueConst item,Character *design,int require_program,int legacy){
    JSValue blueprint=JS_GetPropertyStr(ctx,item,"blueprint"),code=JS_GetPropertyStr(ctx,item,"source"),name=JS_GetPropertyStr(ctx,item,"name"),anchored=JS_GetPropertyStr(ctx,item,"anchored");
    int empty=!require_program&&JS_IsArray(blueprint)&&get_number(ctx,blueprint,"length",-1)==0;
    int valid=JS_IsArray(blueprint)&&(empty||read_character(ctx,blueprint,design,legacy))&&JS_IsString(name)&&JS_IsBool(anchored);
    if(valid)design->anchored=JS_ToBool(ctx,anchored);
    double hz=get_number(ctx,item,"hz",0);valid=valid&&valid_controller_hz(hz);
    size_t bytes=0;const char *label=JS_IsString(name)?JS_ToCStringLen(ctx,&bytes,name):NULL;
    valid=valid&&label&&bytes>0&&bytes<64&&strlen(label)==bytes;JS_FreeCString(ctx,label);
    if(JS_IsString(code)){
        const char *source=JS_ToCStringLen(ctx,&bytes,code);Controller *probe=valid&&source&&strlen(source)==bytes?controller_new(source,1,hz):NULL;
        valid=valid&&probe;controller_free(probe);JS_FreeCString(ctx,source);
    }else valid=valid&&!require_program&&JS_IsNull(code);
    JS_FreeValue(ctx,blueprint);JS_FreeValue(ctx,code);JS_FreeValue(ctx,name);JS_FreeValue(ctx,anchored);return valid;
}
int world_export_design(JSContext *ctx,const Character *design,int sea,const char *path){
    JSValue item=JS_NewObject(ctx);JS_SetPropertyStr(ctx,item,"format",JS_NewString(ctx,"blockwalker-design"));put_number(ctx,item,"version",4);
    JS_SetPropertyStr(ctx,item,"blueprint",character_json(ctx,design));JS_SetPropertyStr(ctx,item,"anchored",JS_NewBool(ctx,design->anchored));
    JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,installed?installed_name:"Workshop build"));
    JS_SetPropertyStr(ctx,item,"source",installed?JS_NewString(ctx,installed):JS_NULL);put_number(ctx,item,"hz",installed_hz);JS_SetPropertyStr(ctx,item,"sea",JS_NewBool(ctx,sea));
    int good=save_json(ctx,item,path);JS_FreeValue(ctx,item);return good;
}
JSValue world_import_design(JSContext *ctx,Character *design,int *sea,const char *path){
    JSValue item=read_json(ctx,path),result=JS_UNDEFINED;Character next={0};int water=0,valid=0;
    if(JS_IsUndefined(item))valid=character_load(&next,path);
    else{
        JSValue format=JS_GetPropertyStr(ctx,item,"format"),surface=JS_GetPropertyStr(ctx,item,"sea");const char *kind=JS_ToCString(ctx,format);
        valid=kind&&!strcmp(kind,"blockwalker-design")&&(get_number(ctx,item,"version",0)>=1&&get_number(ctx,item,"version",0)<=4&&floor(get_number(ctx,item,"version",0))==get_number(ctx,item,"version",0))&&JS_IsBool(surface)&&read_design(ctx,item,&next,0,get_number(ctx,item,"version",0)==1);
        water=JS_ToBool(ctx,surface);JS_FreeCString(ctx,kind);JS_FreeValue(ctx,format);JS_FreeValue(ctx,surface);
    }
    if(!valid)result=JS_ThrowTypeError(ctx,"Invalid design file. Import an exported design or a legacy .character blueprint.");
    else{
        JSValue code=JS_IsObject(item)?JS_GetPropertyStr(ctx,item,"source"):JS_NULL;
        if(JS_IsString(code))result=world_install(ctx,item);
        else{world_trial_stop();free(installed);installed=NULL;installed_hz=10;snprintf(installed_name,sizeof(installed_name),"Workshop build");}
        JS_FreeValue(ctx,code);
        if(!JS_IsException(result)){character_clear(design);*design=next;next=(Character){0};*sea=water;}
    }
    character_clear(&next);JS_FreeValue(ctx,item);return result;
}
static void load_designs_version(JSContext *ctx,JSValueConst list,int populate,int legacy){
    if(!JS_IsArray(list))return;
    for(int i=0;i<get_number(ctx,list,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),blueprint=JS_GetPropertyStr(ctx,item,"blueprint"),code=JS_GetPropertyStr(ctx,item,"source"),label=JS_GetPropertyStr(ctx,item,"name");Character c={0};
        if((JS_IsString(code)||(!populate&&JS_IsNull(code)))&&JS_IsString(label)&&read_character(ctx,blueprint,&c,legacy)){
            JSValue anchored=JS_GetPropertyStr(ctx,item,"anchored");c.anchored=JS_ToBool(ctx,anchored);JS_FreeValue(ctx,anchored);
            const char *source=JS_IsString(code)?JS_ToCString(ctx,code):NULL,*name=JS_ToCString(ctx,label);int hz=get_number(ctx,item,"hz",10);float x=get_number(ctx,item,"x",0),z=get_number(ctx,item,"z",0);
            JSValue height=JS_GetPropertyStr(ctx,item,"y");int elevated=!JS_IsUndefined(height);float y=get_number(ctx,item,"y",NAN);JS_FreeValue(ctx,height);
            Controller *probe=source&&valid_controller_hz(hz)?controller_new(source,1,hz):NULL;
            if((probe||(!populate&&!source))&&isfinite(x)&&isfinite(z)&&(!elevated||(isfinite(y)&&y>=-12&&y<=128))){
                x=Clamp(x,-248,248);z=Clamp(z,-248,248);remember_design(&c,source,name,hz,x,z);
                if(populate){Creature *born=spawn(&c,source,name,i+1,hz,x,z);if(born){int team=get_number(ctx,item,"team",0);born->team=team==1||team==2?team:0;if(elevated)set_spawn_height(born,y);}}
            }controller_free(probe);JS_FreeCString(ctx,source);JS_FreeCString(ctx,name);
        }character_clear(&c);JS_FreeValue(ctx,item);JS_FreeValue(ctx,blueprint);JS_FreeValue(ctx,code);JS_FreeValue(ctx,label);
    }
}
static void load_designs(JSContext *ctx,JSValueConst list,int populate){load_designs_version(ctx,list,populate,0);}
void world_load_archive(JSContext *ctx){
    JSValue archive=read_json(ctx,"/usr/src/dolly/blockwalker/archive-designs.json");load_designs_version(ctx,archive,0,1);JS_FreeValue(ctx,archive);
}
static void load_removals(JSContext *ctx,JSValueConst list){
    if(!JS_IsArray(list))return;
    for(int i=0;i<get_number(ctx,list,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i);if(!JS_IsObject(item)){JS_FreeValue(ctx,item);continue;}
        JSValue kind=JS_GetPropertyStr(ctx,item,"cause"),name=JS_GetPropertyStr(ctx,item,"name"),detail=JS_GetPropertyStr(ctx,item,"detail");
        if(JS_IsString(kind)&&JS_IsString(name)&&JS_IsString(detail)){
            const char *k=JS_ToCString(ctx,kind),*n=JS_ToCString(ctx,name),*d=JS_ToCString(ctx,detail);int cause=0;while(cause<REMOVAL_CAUSES&&strcmp(k,removal_causes[cause]))cause++;
            double id=get_number(ctx,item,"id",0),time=get_number(ctx,item,"time",0),age=get_number(ctx,item,"seconds",0);
            if(cause<REMOVAL_CAUSES&&id>=1&&id<=INT32_MAX&&id==floor(id)&&isfinite(time)&&isfinite(age)){
                Removal *r=new_removal();r->id=id;r->cause=cause;r->time=time;r->seconds=age;snprintf(r->name,sizeof(r->name),"%s",n);snprintf(r->detail,sizeof(r->detail),"%s",d);
                const char *fields[]={"x","y","z","up"};float *values[]={&r->position.x,&r->position.y,&r->position.z,&r->up};
                for(int j=0;j<4;j++){JSValue v=JS_GetPropertyStr(ctx,item,fields[j]);double value=NAN;if(!JS_IsNull(v))JS_ToFloat64(ctx,&value,v);*values[j]=value;JS_FreeValue(ctx,v);}
            }JS_FreeCString(ctx,k);JS_FreeCString(ctx,n);JS_FreeCString(ctx,d);
        }JS_FreeValue(ctx,kind);JS_FreeValue(ctx,name);JS_FreeValue(ctx,detail);JS_FreeValue(ctx,item);
    }
}
static void restore_world(JSContext *ctx,JSValue save,int fresh){
    int legacy=JS_IsObject(save)&&get_number(ctx,save,"version",0)==1;
    terrain_select(JS_IsObject(save)?get_number(ctx,save,"terrainVersion",0):fresh?4:0);
    if(JS_IsObject(save)){JSValue designs=JS_GetPropertyStr(ctx,save,"designs");load_designs_version(ctx,designs,0,legacy);JS_FreeValue(ctx,designs);}
    JSValue examples=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json");load_designs(ctx,examples,fresh);JS_FreeValue(ctx,examples);
    if(fresh){world.supply_seed=0x243f6a88;world.next_parcel=45;world.next_ore=5;world.next_mine=10;}
    if(fresh)world_save(ctx);
    if(!JS_IsObject(save)){JS_FreeValue(ctx,save);return;}
    if(!legacy&&get_number(ctx,save,"version",0)!=2&&get_number(ctx,save,"version",0)!=3&&get_number(ctx,save,"version",0)!=4&&get_number(ctx,save,"version",0)!=5){JS_FreeValue(ctx,save);return;}
    JSValue removals=JS_GetPropertyStr(ctx,save,"removals");load_removals(ctx,removals);JS_FreeValue(ctx,removals);
    JSValue deliveries=JS_GetPropertyStr(ctx,save,"deliveries");
    for(int i=0;JS_IsArray(deliveries)&&i<get_number(ctx,deliveries,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,deliveries,i),label=JS_GetPropertyStr(ctx,item,"name");
        int cargo=get_number(ctx,item,"cargoId",0),carrier=get_number(ctx,item,"carrierId",0),depot=get_number(ctx,item,"depot",-1);double time=get_number(ctx,item,"time",NAN);
        if(cargo>0&&(carrier>0||carrier==-1)&&depot>=0&&depot<depot_count&&isfinite(time)&&JS_IsString(label)){
            int duplicate=0;for(int j=0;j<world.delivery_count;j++)duplicate|=world.deliveries[j].cargo==cargo;
            if(!duplicate){const char *name=JS_ToCString(ctx,label);Delivery *d=new_delivery();*d=(Delivery){.cargo=cargo,.carrier=carrier,.depot=depot,.time=time,.points=get_number(ctx,item,"points",1)};snprintf(d->name,sizeof(d->name),"%s",name);JS_FreeCString(ctx,name);}
        }JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }JS_FreeValue(ctx,deliveries);
    int hz=get_number(ctx,save,"installedHz",10);installed_hz=valid_controller_hz(hz)?hz:10;
    JSValue code=JS_GetPropertyStr(ctx,save,"installed"),label=JS_GetPropertyStr(ctx,save,"name");
    if(JS_IsString(code)){const char *s=JS_ToCString(ctx,code),*name=JS_ToCString(ctx,label);installed=strdup(s);snprintf(installed_name,sizeof(installed_name),"%s",name);JS_FreeCString(ctx,s);JS_FreeCString(ctx,name);}
    JS_FreeValue(ctx,code);JS_FreeValue(ctx,label);JSValue list=JS_GetPropertyStr(ctx,save,"creatures");int count=get_number(ctx,list,"length",0);
    for(int i=0;i<count;i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),blueprint=JS_GetPropertyStr(ctx,item,"blueprint");Character c={0};
        if(read_character(ctx,blueprint,&c,legacy)){
            JSValue anchored=JS_GetPropertyStr(ctx,item,"anchored");c.anchored=JS_ToBool(ctx,anchored);JS_FreeValue(ctx,anchored);
            JSValue code=JS_GetPropertyStr(ctx,item,"source"),label=JS_GetPropertyStr(ctx,item,"name");const char *s=JS_ToCString(ctx,code),*name=JS_ToCString(ctx,label);
            int hz=get_number(ctx,item,"hz",10);if(!valid_controller_hz(hz))hz=10;
            Creature *creature=s?spawn(&c,s,name?name:"Creature",get_number(ctx,item,"seed",1),hz,0,0):NULL;
            if(creature){
                int team=get_number(ctx,item,"team",0);creature->team=team==1||team==2?team:0;
                JSValue error=JS_GetPropertyStr(ctx,item,"controllerError");const char *message=JS_IsString(error)?JS_ToCString(ctx,error):NULL;
                if(message)snprintf(creature->error,sizeof(creature->error),"%s",message);JS_FreeCString(ctx,message);JS_FreeValue(ctx,error);
                int supply=get_number(ctx,item,"supply",0);creature->supply=supply>=1&&supply<=3?supply:0;JSValue parachute=JS_GetPropertyStr(ctx,item,"parachute");creature->parachute=JS_ToBool(ctx,parachute);JS_FreeValue(ctx,parachute);
                JSValue cargo=JS_GetPropertyStr(ctx,item,"cargo");if(JS_IsBool(cargo))creature->cargo=JS_ToBool(ctx,cargo);JS_FreeValue(ctx,cargo);
                creature->id=get_number(ctx,item,"id",creature->id);creature->physics.steps=llround(get_number(ctx,item,"seconds",0)*60);creature->root_height=get_number(ctx,item,"rootHeight",1);creature->fallen=get_number(ctx,item,"fallenSeconds",0);creature->physics.start.x=get_number(ctx,item,"startX",creature->physics.start.x);creature->physics.start.z=get_number(ctx,item,"startZ",creature->physics.start.z);
                int period=60/hz,last=creature->physics.steps?(creature->physics.steps-1)/period*period:-1;
                creature->controller->last_step=get_number(ctx,item,"controlStep",last);
                if(creature->controller->last_step< -1||creature->controller->last_step>=creature->physics.steps)creature->controller->last_step=last;
                creature->carrier=get_number(ctx,item,"carrierId",0);creature->held_by=get_number(ctx,item,"carriedBy",0);creature->settled=get_number(ctx,item,"settled",0);
                JSValue pickup=JS_GetPropertyStr(ctx,item,"pickup");
                if(JS_IsArray(pickup))for(int j=0;j<3;j++){JSValue value=JS_GetPropertyUint32(ctx,pickup,j);double v=0;JS_ToFloat64(ctx,&v,value);((float *)&creature->pickup)[j]=isfinite(v)?v:0;JS_FreeValue(ctx,value);}JS_FreeValue(ctx,pickup);
                for(int j=0;j<world.delivery_count;j++)if(world.deliveries[j].cargo==creature->id){creature->delivered=1;for(int k=0;k<creature->design.count;k++)creature->design.blocks[k].color=0;}
                JSValue memory=JS_GetPropertyStr(ctx,item,"memory");const char *m=JS_ToCString(ctx,memory);
                if(m){controller_budget(creature->controller);JSValue value=JS_ParseJSON(creature->controller->ctx,m,strlen(m),"controller-memory");if(!JS_IsException(value)){JS_FreeValue(creature->controller->ctx,creature->controller->memory);creature->controller->memory=value;}}
                JS_FreeCString(ctx,m);JS_FreeValue(ctx,memory);
                JSValue poses=JS_GetPropertyStr(ctx,item,"poses");int saved_count=legacy?get_number(ctx,blueprint,"length",0):c.count;
                PhysicsPose *restored=array_resize(NULL,c.count,sizeof(*restored));
                for(int j=0;j<c.count;j++)restored[j]=(PhysicsPose){.transform=physics_transform(&creature->physics.parts[j])};
                for(int j=0;j<saved_count;j++){
                    JSValue pose=JS_GetPropertyUint32(ctx,poses,j);double p[13]={0};p[6]=1;int valid=1;
                    for(int k=0;k<13;k++){JSValue v=JS_GetPropertyUint32(ctx,pose,k);if(JS_ToFloat64(ctx,&p[k],v)<0||!isfinite(p[k]))valid=0;JS_FreeValue(ctx,v);}JS_FreeValue(ctx,pose);
                    if(valid)restored[j]=(PhysicsPose){.transform={{p[0],p[1],p[2]},{{p[3],p[4],p[5]},p[6]}},.velocity={p[7],p[8],p[9]},.angular={p[10],p[11],p[12]}};
                }
                if(legacy)for(int j=saved_count;j<c.count;j++){
                    Block block=c.blocks[j],parent=c.blocks[block.parent];PhysicsPose a=restored[block.parent];b3Vec3 offset={block.x-parent.x,block.y-parent.y,block.z-parent.z};
                    restored[j]=a;restored[j].transform.p=b3TransformWorldPoint(a.transform,offset);restored[j].velocity=b3Add(a.velocity,b3Cross(a.angular,b3RotateVector(a.transform.q,offset)));
                }
                int steps=creature->physics.steps;Vector3 start=creature->physics.start;
                physics_attach_poses(&creature->physics,&creature->design,world.physics,0,0,1,restored,get_number(ctx,save,"version",0)<4);
                JSValue winches=JS_GetPropertyStr(ctx,item,"winches");
                for(int j=0;j<c.count;j++)if(c.blocks[j].joint==BLOCK_WINCH){
                    JSValue state=JS_GetPropertyUint32(ctx,winches,j);PhysicsPart *part=&creature->physics.parts[j];
                    part->winch_length=Clamp(get_number(ctx,state,"paidOut",part->winch_length),1,c.blocks[j].travel);
                    if(b3Joint_IsValid(part->joint))b3DistanceJoint_SetLengthRange(part->joint,.005f,part->winch_length);
                    JS_FreeValue(ctx,state);
                }JS_FreeValue(ctx,winches);
                creature->physics.steps=steps;creature->physics.start=start;free(restored);JS_FreeValue(ctx,poses);physics_refresh(&creature->physics,&creature->design);
                JSValue controls=JS_GetPropertyStr(ctx,item,"controls");
                if(JS_IsObject(controls))for(int j=1;j<128;j++)if(assigned(&creature->design,j)){char key[2]={j,0};double value=get_number(ctx,controls,key,0);creature->controls[j]=isfinite(value)?Clamp(value,0,1):0;}JS_FreeValue(ctx,controls);if(creature->error[0])memset(creature->controls,0,sizeof(creature->controls));
                if(!creature->cargo&&creature->id!=get_number(ctx,save,"playerId",0))remember_design(&c,s,creature->name,hz,creature->physics.start.x,creature->physics.start.z);
            }JS_FreeCString(ctx,s);JS_FreeCString(ctx,name);JS_FreeValue(ctx,code);JS_FreeValue(ctx,label);
        }character_clear(&c);JS_FreeValue(ctx,blueprint);JS_FreeValue(ctx,item);
    }
    for(int i=0;i<count;i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),magnets=JS_GetPropertyStr(ctx,item,"magnets");int id=get_number(ctx,item,"id",0);
        if(!JS_IsArray(magnets)){JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,item);continue;}
        for(int j=0;j<world.count;j++)if(world.creatures[j].id==id){
            Creature *creature=&world.creatures[j];
            for(int k=0;k<creature->design.count;k++)if(creature->design.blocks[k].joint==BLOCK_MAGNET){
                PhysicsPart *part=&creature->physics.parts[k];JSValue magnet=JS_GetPropertyUint32(ctx,magnets,k);if(!JS_IsObject(magnet)){JS_FreeValue(ctx,magnet);continue;}double power=get_number(ctx,magnet,"power",0);
                part->magnet_power=isfinite(power)?Clamp(power,0,1):0;int target=get_number(ctx,magnet,"creature",0),index=get_number(ctx,magnet,"part",-1);
                JSValue local=JS_GetPropertyStr(ctx,magnet,"local");double p[3];int valid=target>0&&index>=0&&JS_IsArray(local);
                for(int n=0;valid&&n<3;n++){JSValue v=JS_GetPropertyUint32(ctx,local,n);if(JS_ToFloat64(ctx,&p[n],v)<0||!isfinite(p[n]))valid=0;JS_FreeValue(ctx,v);}
                if(valid)for(int n=0;n<world.count;n++)if(world.creatures[n].id==target&&index>=0&&index<world.creatures[n].design.count&&n!=j){
                    PhysicsPart *target_part=&world.creatures[n].physics.parts[index];part->magnet_target=target_part->body;part->magnet_shape=target_part->shape;part->magnet_local=b3TransformPoint(target_part->frame,(b3Vec3){p[0],p[1],p[2]});
                    double load=get_number(ctx,magnet,"load",0);part->magnet_load=isfinite(load)?Clamp(load,0,creature->design.blocks[k].force*part->magnet_power):0;
                }JS_FreeValue(ctx,local);JS_FreeValue(ctx,magnet);
            }
        }JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,item);
    }
    world.deaths=get_number(ctx,save,"deaths",0);world.age=get_number(ctx,save,"seconds",0);int next_id=get_number(ctx,save,"nextId",0);if(next_id>0&&!world.next_id)world.physics=physics_world(1);world.next_id=fmax(world.next_id,next_id);
    JSValue supply=JS_GetPropertyStr(ctx,save,"supply");if(JS_IsObject(supply)){world.supply_seed=get_number(ctx,supply,"seed",0);world.next_parcel=get_number(ctx,supply,"nextParcel",world.age);world.next_ore=get_number(ctx,supply,"nextOre",world.age);world.next_mine=get_number(ctx,supply,"nextMine",world.age+10);}JS_FreeValue(ctx,supply);
    JSValue radio=JS_GetPropertyStr(ctx,save,"radio");
    for(int i=0;JS_IsArray(radio)&&i<get_number(ctx,radio,"length",0)&&world.radio_count<RADIO_CAPACITY;i++){
        JSValue item=JS_GetPropertyUint32(ctx,radio,i),label=JS_GetPropertyStr(ctx,item,"name");RadioMessage message={0};
        if(radio_output(ctx,item,&message.kind,&message.cargo)&&JS_IsString(label)){
            message.team=get_number(ctx,item,"team",0);message.from=get_number(ctx,item,"from",0);message.time=get_number(ctx,item,"time",NAN);message.mass=get_number(ctx,item,"mass",NAN);
            message.position=(Vector3){get_number(ctx,item,"x",NAN),get_number(ctx,item,"y",NAN),get_number(ctx,item,"z",NAN)};
            if((message.team==1||message.team==2)&&message.from>0&&isfinite(message.time)&&isfinite(message.mass)&&isfinite(message.position.x)&&isfinite(message.position.y)&&isfinite(message.position.z)){
                const char *name=JS_ToCString(ctx,label);snprintf(message.name,sizeof(message.name),"%s",name);JS_FreeCString(ctx,name);world.radio[world.radio_count++]=message;
            }
        }JS_FreeValue(ctx,item);JS_FreeValue(ctx,label);
    }JS_FreeValue(ctx,radio);
    int player=get_number(ctx,save,"playerId",0);world.player=world_find(player)?player:0;
    for(int i=0;i<world.count;i++)world.creatures[i].physics.time=world.age;
    for(int i=0;i<world.count;i++)if(world.creatures[i].cargo){
        Creature *cargo=&world.creatures[i],*owner=cargo_carrier(cargo,NULL);
        if(owner)cargo->held_by=owner->id;else if(!world_find(cargo->held_by))cargo->held_by=0;
    }
    JS_FreeValue(ctx,list);JS_FreeValue(ctx,save);
}
void world_load(JSContext *ctx){
    int fresh=access("/workspace/blockwalker-world.json",F_OK)<0&&errno==ENOENT;
    JSValue save=read_json(ctx,"/workspace/blockwalker-world.json");int version=JS_IsObject(save)?get_number(ctx,save,"version",0):0,migrate=version>=1&&version<4;
    JSValue creatures=JS_IsObject(save)?JS_GetPropertyStr(ctx,save,"creatures"):JS_UNDEFINED;int count=JS_IsArray(creatures)?get_number(ctx,creatures,"length",0):0;JS_FreeValue(ctx,creatures);
    if(migrate){
        char path[128];int index=0;do{snprintf(path,sizeof(path),"/workspace/blockwalker-world.before-physics-%03d.json",++index);}while(access(path,F_OK)==0&&index<INT32_MAX);
        if(!save_json(ctx,save,path)){fputs("Could not back up the old world before upgrading physics.\n",stderr);exit(1);}
        printf("Physics upgrade: original world saved as %s\n",path);
    }
    restore_world(ctx,save,fresh);
    if(migrate&&world.count!=count){fputs("Physics upgrade could not restore every character; original world kept.\n",stderr);exit(1);}
}
enum {IMPORT_INTEGER=1,IMPORT_OPTIONAL=2,IMPORT_NULLABLE=4};
static int import_number(JSContext *ctx,JSValueConst object,const char *key,double low,double high,int flags){
    JSValue value=JS_GetPropertyStr(ctx,object,key);double n=NAN;int valid=0;
    if(JS_IsNumber(value)){JS_ToFloat64(ctx,&n,value);valid=isfinite(n)&&n>=low&&n<=high&&(!(flags&IMPORT_INTEGER)||n==floor(n));}
    else valid=((flags&IMPORT_OPTIONAL)&&JS_IsUndefined(value))||((flags&IMPORT_NULLABLE)&&JS_IsNull(value));
    JS_FreeValue(ctx,value);return valid;
}
static int import_vector(JSContext *ctx,JSValueConst list,int length,int pose){
    if(!JS_IsArray(list)||get_number(ctx,list,"length",0)!=length)return 0;
    double norm=0;int valid=1;
    for(int i=0;i<length;i++){JSValue v=JS_GetPropertyUint32(ctx,list,i);double n=NAN;if(JS_IsNumber(v))JS_ToFloat64(ctx,&n,v);valid=valid&&isfinite(n)&&fabs(n)<=FLT_MAX;if(pose&&i>=3&&i<=6)norm+=n*n;JS_FreeValue(ctx,v);}
    return valid&&(!pose||(norm>.99&&norm<1.01));
}
static int import_string(JSContext *ctx,JSValueConst object,const char *key,size_t limit){
    JSValue value=JS_GetPropertyStr(ctx,object,key);size_t length=0;const char *text=JS_IsString(value)?JS_ToCStringLen(ctx,&length,value):NULL;
    int valid=text&&length<limit&&strlen(text)==length;JS_FreeCString(ctx,text);JS_FreeValue(ctx,value);return valid;
}
static int import_world_valid(JSContext *ctx,JSValueConst save){
    if(!JS_IsObject(save)||JS_IsArray(save))return 0;
    JSValue list=JS_GetPropertyStr(ctx,save,"creatures"),designs=JS_GetPropertyStr(ctx,save,"designs"),removals=JS_GetPropertyStr(ctx,save,"removals"),deliveries=JS_GetPropertyStr(ctx,save,"deliveries"),ids=JS_NewObject(ctx),delivered=JS_NewObject(ctx),format=JS_GetPropertyStr(ctx,save,"format");
    const char *kind=JS_IsString(format)?JS_ToCString(ctx,format):NULL;
    int legacy=get_number(ctx,save,"version",0)==1;
    int valid=JS_IsObject(save)&&import_number(ctx,save,"version",1,5,IMPORT_INTEGER)&&import_number(ctx,save,"terrainVersion",0,4,IMPORT_INTEGER|IMPORT_OPTIONAL)&&
        (JS_IsUndefined(format)||(kind&&!strcmp(kind,"blockwalker-world")))&&JS_IsArray(list)&&JS_IsArray(designs)&&JS_IsArray(removals)&&(JS_IsUndefined(deliveries)||JS_IsArray(deliveries))&&
        import_number(ctx,save,"seconds",0,INT32_MAX/60.,0)&&import_number(ctx,save,"deaths",0,INT32_MAX,IMPORT_INTEGER)&&import_number(ctx,save,"nextId",0,INT32_MAX,IMPORT_INTEGER)&&import_number(ctx,save,"playerId",0,INT32_MAX,IMPORT_INTEGER|IMPORT_OPTIONAL);
    JS_FreeCString(ctx,kind);JS_FreeValue(ctx,format);int greatest=0,count=get_number(ctx,list,"length",0);
    for(int i=0;valid&&i<count;i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i);Character c={0};
        valid=read_design(ctx,item,&c,1,legacy)&&import_number(ctx,item,"id",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"seconds",0,(INT32_MAX-1)/60.,0)&&import_number(ctx,item,"seed",0,UINT32_MAX,IMPORT_INTEGER);
        int id=valid?get_number(ctx,item,"id",0):0;JSValue previous=JS_GetPropertyUint32(ctx,ids,id);valid=valid&&JS_IsUndefined(previous);JS_FreeValue(ctx,previous);
        if(valid){JS_SetPropertyUint32(ctx,ids,id,JS_NewInt32(ctx,c.count));if(id>greatest)greatest=id;}
        const char *fields[]={"rootHeight","fallenSeconds","startX","startZ","settled"};
        for(int k=0;k<5;k++)valid=valid&&import_number(ctx,item,fields[k],-FLT_MAX,FLT_MAX,IMPORT_OPTIONAL);
        valid=valid&&import_number(ctx,item,"carrierId",-1,INT32_MAX,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"carriedBy",0,INT32_MAX,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"controlStep",-1,fmax(-1,round(get_number(ctx,item,"seconds",0)*60)-1),IMPORT_INTEGER|IMPORT_OPTIONAL);
        JSValue error=JS_GetPropertyStr(ctx,item,"controllerError");valid=valid&&(JS_IsUndefined(error)||import_string(ctx,item,"controllerError",160));JS_FreeValue(ctx,error);
        JSValue poses=JS_GetPropertyStr(ctx,item,"poses"),memory=JS_GetPropertyStr(ctx,item,"memory"),controls=JS_GetPropertyStr(ctx,item,"controls"),pickup=JS_GetPropertyStr(ctx,item,"pickup"),cargo=JS_GetPropertyStr(ctx,item,"cargo");
        valid=valid&&(JS_IsUndefined(cargo)||JS_IsBool(cargo))&&import_number(ctx,item,"team",0,2,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"supply",0,3,IMPORT_INTEGER|IMPORT_OPTIONAL);
        JSValue parachute=JS_GetPropertyStr(ctx,item,"parachute");valid=valid&&(JS_IsUndefined(parachute)||JS_IsBool(parachute));
        if(get_number(ctx,item,"supply",0)||JS_ToBool(ctx,parachute))valid=valid&&JS_ToBool(ctx,cargo);JS_FreeValue(ctx,parachute);JS_FreeValue(ctx,cargo);
        JSValue blueprint=JS_GetPropertyStr(ctx,item,"blueprint");int pose_count=legacy?get_number(ctx,blueprint,"length",0):c.count;JS_FreeValue(ctx,blueprint);
        valid=valid&&JS_IsArray(poses)&&get_number(ctx,poses,"length",0)==pose_count&&JS_IsString(memory)&&(JS_IsUndefined(controls)||JS_IsObject(controls))&&(JS_IsUndefined(pickup)||import_vector(ctx,pickup,3,0));
        for(int k=0;valid&&k<pose_count;k++){JSValue p=JS_GetPropertyUint32(ctx,poses,k);valid=import_vector(ctx,p,13,1);JS_FreeValue(ctx,p);}
        JSValue winches=JS_GetPropertyStr(ctx,item,"winches");int version=get_number(ctx,save,"version",0);
        valid=valid&&(version<5?JS_IsUndefined(winches):JS_IsArray(winches)&&get_number(ctx,winches,"length",0)<=c.count);
        for(int k=0;valid&&k<c.count;k++){
            if(c.blocks[k].joint==BLOCK_WINCH){
                JSValue state=JS_GetPropertyUint32(ctx,winches,k);
                valid=version>=5&&JS_IsObject(state)&&import_number(ctx,state,"paidOut",1,c.blocks[k].travel,0);
                JS_FreeValue(ctx,state);
            }else if(JS_IsArray(winches)){
                JSValue state=JS_GetPropertyUint32(ctx,winches,k);valid=JS_IsUndefined(state)||JS_IsNull(state);JS_FreeValue(ctx,state);
            }
        }JS_FreeValue(ctx,winches);
        for(int k=1;valid&&k<128&&!JS_IsUndefined(controls);k++){char key[2]={k,0};valid=import_number(ctx,controls,key,0,1,IMPORT_OPTIONAL);}
        const char *json=JS_IsString(memory)?JS_ToCString(ctx,memory):NULL;
        if(json){JSValue parsed=JS_ParseJSON(ctx,json,strlen(json),"imported-memory");if(JS_IsException(parsed)){valid=0;JS_FreeValue(ctx,JS_GetException(ctx));}JS_FreeValue(ctx,parsed);}JS_FreeCString(ctx,json);
        JS_FreeValue(ctx,poses);JS_FreeValue(ctx,memory);JS_FreeValue(ctx,controls);JS_FreeValue(ctx,pickup);character_clear(&c);JS_FreeValue(ctx,item);
    }
    for(int i=0;valid&&i<count;i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),magnets=JS_GetPropertyStr(ctx,item,"magnets"),blueprint=JS_GetPropertyStr(ctx,item,"blueprint");int parts=get_number(ctx,blueprint,"length",0);valid=JS_IsArray(magnets)&&get_number(ctx,magnets,"length",0)<=parts;
        for(int j=0;valid&&j<parts;j++){
            JSValue block=JS_GetPropertyUint32(ctx,blueprint,j);int magnet=get_number(ctx,block,"joint",0)==BLOCK_MAGNET;JS_FreeValue(ctx,block);if(!magnet)continue;
            JSValue m=JS_GetPropertyUint32(ctx,magnets,j),local=JS_GetPropertyStr(ctx,m,"local");
            valid=JS_IsObject(m)&&import_number(ctx,m,"power",0,1,0)&&import_number(ctx,m,"load",0,FLT_MAX,IMPORT_OPTIONAL)&&import_number(ctx,m,"creature",1,INT32_MAX-1,IMPORT_INTEGER|IMPORT_OPTIONAL);
            int target=valid?get_number(ctx,m,"creature",0):0;
            if(target){JSValue target_parts=JS_GetPropertyUint32(ctx,ids,target);int n=0;JS_ToInt32(ctx,&n,target_parts);JS_FreeValue(ctx,target_parts);valid=valid&&target!=get_number(ctx,item,"id",0)&&import_number(ctx,m,"part",0,n-1,IMPORT_INTEGER)&&import_vector(ctx,local,3,0);}
            else{JSValue attached=JS_GetPropertyStr(ctx,m,"attached");valid=valid&&!JS_ToBool(ctx,attached);JS_FreeValue(ctx,attached);}
            JS_FreeValue(ctx,m);JS_FreeValue(ctx,local);
        }JS_FreeValue(ctx,item);JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,blueprint);
    }
    for(int i=0;valid&&i<get_number(ctx,designs,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,designs,i);Character c={0};valid=read_design(ctx,item,&c,0,legacy)&&c.count>0&&import_number(ctx,item,"x",-248,248,0)&&import_number(ctx,item,"z",-248,248,0);character_clear(&c);JS_FreeValue(ctx,item);
    }
    for(int i=0;valid&&i<get_number(ctx,removals,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,removals,i),cause=JS_GetPropertyStr(ctx,item,"cause");const char *kind=JS_IsString(cause)?JS_ToCString(ctx,cause):NULL;int known=0;for(int k=0;kind&&k<REMOVAL_CAUSES;k++)known|=!strcmp(kind,removal_causes[k]);
        valid=known&&import_string(ctx,item,"name",64)&&import_string(ctx,item,"detail",160)&&import_number(ctx,item,"id",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"time",0,DBL_MAX,0)&&import_number(ctx,item,"seconds",0,DBL_MAX,0);
        const char *fields[]={"x","y","z","up"};for(int k=0;k<4;k++)valid=valid&&import_number(ctx,item,fields[k],-FLT_MAX,FLT_MAX,IMPORT_NULLABLE);
        if(valid){int id=get_number(ctx,item,"id",0);if(id>greatest)greatest=id;}
        JS_FreeCString(ctx,kind);JS_FreeValue(ctx,cause);JS_FreeValue(ctx,item);
    }
    for(int i=0;valid&&JS_IsArray(deliveries)&&i<get_number(ctx,deliveries,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,deliveries,i);valid=import_string(ctx,item,"name",64)&&import_number(ctx,item,"cargoId",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"carrierId",-1,INT32_MAX-1,IMPORT_INTEGER)&&get_number(ctx,item,"carrierId",0)!=0&&import_number(ctx,item,"depot",0,terrain_depot_count(get_number(ctx,save,"terrainVersion",0))-1,IMPORT_INTEGER)&&import_number(ctx,item,"time",0,DBL_MAX,0)&&import_number(ctx,item,"points",1,8,IMPORT_INTEGER|IMPORT_OPTIONAL);
        int id=valid?get_number(ctx,item,"cargoId",0):0;JSValue prior=JS_GetPropertyUint32(ctx,delivered,id);valid=valid&&JS_IsUndefined(prior);JS_FreeValue(ctx,prior);if(valid){JS_SetPropertyUint32(ctx,delivered,id,JS_TRUE);if(id>greatest)greatest=id;}JS_FreeValue(ctx,item);
    }
    JSValue supply=JS_GetPropertyStr(ctx,save,"supply");
    valid=valid&&(JS_IsUndefined(supply)||(JS_IsObject(supply)&&!JS_IsArray(supply)&&import_number(ctx,supply,"seed",1,UINT32_MAX,IMPORT_INTEGER)&&import_number(ctx,supply,"nextParcel",0,DBL_MAX,0)&&import_number(ctx,supply,"nextOre",0,DBL_MAX,0)&&import_number(ctx,supply,"nextMine",0,DBL_MAX,IMPORT_OPTIONAL)));JS_FreeValue(ctx,supply);
    JSValue radio=JS_GetPropertyStr(ctx,save,"radio");
    valid=valid&&(JS_IsUndefined(radio)||(JS_IsArray(radio)&&get_number(ctx,radio,"length",0)<=RADIO_CAPACITY));
    for(int i=0;valid&&JS_IsArray(radio)&&i<get_number(ctx,radio,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,radio,i);int kind,cargo;
        valid=radio_output(ctx,item,&kind,&cargo)&&import_number(ctx,item,"cargo",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"team",1,2,IMPORT_INTEGER)&&import_number(ctx,item,"from",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"time",0,get_number(ctx,save,"seconds",0),0)&&import_number(ctx,item,"mass",0,FLT_MAX,0)&&import_string(ctx,item,"name",64);
        const char *coordinates[]={"x","y","z"};for(int j=0;j<3;j++)valid=valid&&import_number(ctx,item,coordinates[j],-FLT_MAX,FLT_MAX,0);JS_FreeValue(ctx,item);
    }JS_FreeValue(ctx,radio);
    int player=valid?get_number(ctx,save,"playerId",0):0;JSValue found=JS_GetPropertyUint32(ctx,ids,player);valid=valid&&(!player||!JS_IsUndefined(found))&&get_number(ctx,save,"nextId",0)>=greatest+(greatest>0);JS_FreeValue(ctx,found);
    JS_FreeValue(ctx,list);JS_FreeValue(ctx,designs);JS_FreeValue(ctx,removals);JS_FreeValue(ctx,deliveries);JS_FreeValue(ctx,ids);JS_FreeValue(ctx,delivered);return valid;
}
JSValue world_import(JSContext *ctx,const char *path){
    JSValue save=read_json(ctx,path);
    if(!import_world_valid(ctx,save)){JS_FreeValue(ctx,save);return JS_ThrowTypeError(ctx,"Invalid world file; current world kept.");}
    if(!save_world(ctx,"/workspace/blockwalker-world.previous.json")){JS_FreeValue(ctx,save);return JS_ThrowInternalError(ctx,"Could not back up the current world; import cancelled.");}
    JSValue list=JS_GetPropertyStr(ctx,save,"creatures");int count=get_number(ctx,list,"length",0);JS_FreeValue(ctx,list);
    World previous=world;char *program=installed,name[64];int hz=installed_hz,previous_terrain=terrain_version;memcpy(name,installed_name,sizeof(name));world=(World){0};installed=NULL;
    restore_world(ctx,save,0);free(installed);installed=program;installed_hz=hz;memcpy(installed_name,name,sizeof(name));
    if(world.count!=count||!world_save(ctx)){destroy_world(&world);world=previous;terrain_select(previous_terrain);return JS_ThrowInternalError(ctx,"World restore failed; current world kept.");}
    destroy_world(&previous);return JS_UNDEFINED;
}
