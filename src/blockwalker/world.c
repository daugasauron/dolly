#define _POSIX_C_SOURCE 200809L
#include "world.h"
#include "pi.h"
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
struct Controller {Data *ctx;Value function,memory,random,blueprint;char *source;uint32_t seed;int hz,last_step,exhausted,remaining;char error[160];};
enum {REMOVAL_CONTROLLER,REMOVAL_POSTURE,REMOVAL_SUNK,REMOVAL_NONFINITE,REMOVAL_TERRAIN,REMOVAL_CAUSES};
static const char *removal_causes[]={"controller","posture","sunk","nonfinite","terrain"};
World world;
void world_creature_status(int id,char *text,size_t size){
    if(!size)return;text[0]=0;Creature *c=world_find(id);if(!c||!c->controller)return;
    Data *ctx=c->controller->ctx;Value message=value_get(ctx,c->controller->memory,"status");
    if(!value_is_string(message)){value_free(ctx,message);message=value_get(ctx,c->controller->memory,"phase");}
    if(value_is_string(message)){
        value_push(ctx,message);size_t length;const char *value=lua_tolstring(ctx->lua,-1,&length);
        if(length>=size)length=size-1;memcpy(text,value,length);text[length]=0;lua_pop(ctx->lua,1);
    }value_free(ctx,message);
}
static char *installed;static char installed_name[64]="Creature";static int installed_hz=CONTROLLER_DEFAULT_HZ;
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
static void controller_budget(Controller *c){c->ctx->budget=200;c->exhausted=0;c->error[0]=0;lua_sethook(c->ctx->lua,data_hook,LUA_MASKCOUNT,1000);}
static int random_number(lua_State *L){
    Controller *c=(*(Data **)lua_getextraspace(L))->owner;c->seed^=c->seed<<13;c->seed^=c->seed>>17;c->seed^=c->seed<<5;
    lua_pushnumber(L,c->seed/4294967296.0);return 1;
}
static void controller_free(Controller *c){if(!c)return;data_close(c->ctx);free(c->source);free(c);}
static int valid_controller_hz(double hz){return hz==1||hz==10||hz==20||hz==30||hz==60;}
static int script_hypot(lua_State *L){double sum=0;int count=lua_gettop(L);for(int i=1;i<=count;i++){double n=luaL_checknumber(L,i);sum+=n*n;}lua_pushnumber(L,sqrt(sum));return 1;}
static int script_at(lua_State *L){
    if(lua_type(L,1)==LUA_TSTRING){size_t n;const char *s=lua_tolstring(L,1,&n);lua_Integer i=luaL_checkinteger(L,2);if(i<0||(uint64_t)i>=n)lua_pushnil(L);else lua_pushlstring(L,s+i,1);}
    else{if(lua_type(L,2)==LUA_TNUMBER)lua_pushnumber(L,lua_tonumber(L,2)+1);else lua_pushvalue(L,2);lua_gettable(L,1);}return 1;
}
static int controller_initialize(lua_State *L){
    Data *d=*(Data **)lua_getextraspace(L);Controller *c=d->owner;
    luaL_requiref(L,"_G",luaopen_base,1);lua_pop(L,1);luaL_requiref(L,LUA_MATHLIBNAME,luaopen_math,1);lua_pop(L,1);
    luaL_requiref(L,LUA_TABLIBNAME,luaopen_table,1);lua_pop(L,1);luaL_requiref(L,LUA_STRLIBNAME,luaopen_string,1);lua_pop(L,1);
    const char *denied[]={"dofile","loadfile","load","collectgarbage","pcall","xpcall","print","warn"};
    for(unsigned i=0;i<sizeof(denied)/sizeof(*denied);i++){lua_pushnil(L);lua_setglobal(L,denied[i]);}
    lua_getglobal(L,"math");lua_pushnil(L);lua_setfield(L,-2,"random");lua_pushnil(L);lua_setfield(L,-2,"randomseed");lua_pop(L,1);
    if(luaL_loadfilex(L,"/usr/src/dolly/blockwalker/controller.lua","t")||lua_pcall(L,0,0,0))return lua_error(L);
    lua_pushcfunction(L,script_hypot);lua_setglobal(L,"hypot");lua_pushcfunction(L,script_at);lua_setglobal(L,"at");
    if(luaL_loadbufferx(L,c->source,strlen(c->source),"controller","t")||lua_pcall(L,0,1,0))return lua_error(L);
    if(!lua_isfunction(L,-1))return luaL_error(L,"Controller must return a function");c->function=value_take(d);
    c->memory=value_table(d);lua_pushcfunction(L,random_number);c->random=value_take(d);return 0;
}
static Controller *controller_new(const char *source,uint32_t seed,int hz){
    Controller *c=calloc(1,sizeof(*c));if(!c)return NULL;
    c->source=strdup(source);c->seed=seed?seed:1;c->hz=hz;c->last_step=-1;c->ctx=data_new(4*1024*1024);
    if(!c->source||!c->ctx){controller_free(c);return NULL;}c->ctx->owner=c;controller_budget(c);
    lua_State *L=c->ctx->lua;lua_pushcfunction(L,controller_initialize);if(lua_pcall(L,0,0,0)){fprintf(stderr,"Controller: %s\n",lua_tostring(L,-1));controller_free(c);return NULL;}lua_gc(L,LUA_GCGEN);lua_gc(L,LUA_GCSTOP);return c;
}
static double get_number(Data *ctx,Value obj,const char *key,double fallback){
    Value v=value_get(ctx,obj,key);double n=fallback;if(!value_is_nil(v)&&value_double(ctx,&n,v)<0)n=fallback;value_free(ctx,v);return n;
}
static void put_number(Data *ctx,Value obj,const char *key,double n){value_push(ctx,obj);lua_pushnumber(ctx->lua,n);lua_setfield(ctx->lua,-2,key);lua_pop(ctx->lua,1);}
static const char *controller_memory_lua(Controller *c,size_t *length){return data_dump(c->ctx,c->memory,length);}
Value character_data(Data *ctx,const Character *c){
    Value list=value_array(ctx);
    for(int i=0;i<c->count;i++){
        Block b=c->blocks[i];Value part=value_table(ctx);
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive","speed","limit","travel","force","direction","material","finish","size"};
        double values[]={b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit,b.travel,b.force,b.direction,b.material,b.finish,block_size(b)};
        for(int j=0;j<17;j++)put_number(ctx,part,names[j],values[j]);value_set_at(ctx,list,i,part);
    }return list;
}
static int read_character(Data *ctx,Value list,Character *c,int legacy){
    double length=get_number(ctx,list,"length",0);if(!isfinite(length)||length<1||length>INT32_MAX/sizeof(Block))return 0;
    Character next={.count=(int)length,.capacity=(int)length};next.blocks=array_resize(NULL,next.count,sizeof(Block));
    for(int i=0;i<next.count;i++){
        Value v=value_at(ctx,list,i);Block *b=&next.blocks[i];
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive","speed","limit","travel","force","direction","material","finish","size"};
        double defaults[]={0,0,0,i-1,0,i%COLOR_COUNT,2,0,0,2.5,75,1.5,24,1,0,0,1},n[17];int valid=1;
        if(get_number(ctx,v,"joint",0)==BLOCK_WINCH){defaults[9]=.8;defaults[11]=8;}
        for(int j=0;j<17;j++){n[j]=get_number(ctx,v,names[j],defaults[j]);if(!isfinite(n[j])||((j<9||j>=13)&&(n[j]!=floor(n[j])||n[j]<INT32_MIN||n[j]>INT32_MAX)))valid=0;}
        value_free(ctx,v);if(!valid){character_clear(&next);return 0;}
        *b=(Block){.x=n[0],.y=n[1],.z=n[2],.parent=n[3],.joint=n[4],.color=n[5],.axis=n[6],.negative=n[7],.positive=n[8],.speed=n[9],.limit=n[10],.travel=n[11],.force=n[12],.direction=n[13],.material=n[14],.finish=n[15],.size=n[16]};
    }
    if(!(legacy?character_upgrade_thrusters(&next):character_validate(&next))){character_clear(&next);return 0;}character_clear(c);*c=next;return 1;
}
int character_from_data(Data *ctx,Value list,Character *c){return read_character(ctx,list,c,0);}
static Value vector(Data *ctx,Vector3 v){
    Value a=value_sequence(ctx,4);value_set_at(ctx,a,0,value_number(ctx,v.x));value_set_at(ctx,a,1,value_number(ctx,v.y));value_set_at(ctx,a,2,value_number(ctx,v.z));return a;
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
static Value magnet_state(Data *ctx,const Physics *p,const Character *c){
    Value list=value_array(ctx);
    for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_MAGNET){
        PhysicsPart *part=&p->parts[i];Value item=value_record(ctx,8);put_number(ctx,item,"power",part->magnet_power);put_number(ctx,item,"load",part->magnet_load);
        int attached=b3Body_IsValid(part->magnet_target);value_set(ctx,item,"attached",value_bool(ctx,attached));
        put_number(ctx,item,"targetMass",attached?b3Body_GetMass(part->magnet_target):0);
        Creature *owner=attached?body_owner(part->magnet_target):NULL;
        int index=magnet_index(part,owner);if(index>=0){put_number(ctx,item,"creature",owner->id);put_number(ctx,item,"part",index);}
        value_set_at(ctx,list,i,item);
    }return list;
}
static Value depot_list(Data *ctx,int count){
    Value list=value_sequence(ctx,count);
    for(int i=0;i<count;i++){Depot d=depots[i];Value item=value_record(ctx,5);
        value_set(ctx,item,"name",value_string(ctx,d.name));put_number(ctx,item,"x",d.x);put_number(ctx,item,"z",d.z);put_number(ctx,item,"radius",d.radius);put_number(ctx,item,"team",d.team);value_set_at(ctx,list,i,item);
    }return list;
}
static Value depot_state(Data *ctx){return depot_list(ctx,depot_count);}
static Value combat_state(Data *ctx,int version){
    if(version<6)return VALUE_NIL;
    Value area=value_record(ctx,4);put_number(ctx,area,"x",0);put_number(ctx,area,"z",0);put_number(ctx,area,"halfX",terrain_combat_half_x(version));put_number(ctx,area,"halfZ",COMBAT_HALF_Z);return area;
}
static Value scrapyard_state(Data *ctx,int version){
    Value list=value_sequence(ctx,version>=6?2:0);
    for(int i=0;version>=6&&i<2;i++){Depot d=scrapyards[i];Value area=value_record(ctx,6);
        value_set(ctx,area,"name",value_string(ctx,d.name));put_number(ctx,area,"x",d.x);put_number(ctx,area,"y",-1.5f);put_number(ctx,area,"z",d.z);put_number(ctx,area,"radius",d.radius);put_number(ctx,area,"team",d.team);value_set_at(ctx,list,i,area);
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
static const char *radio_kinds[]={"sight","claim","ready","release","help","threat"};
static Vector3 creature_eye(const Creature *observer){
    Vector3 eye,forward,up;Quaternion rotation;physics_pose(&observer->physics,&observer->design,0,&eye,&rotation);
    physics_eyes(&observer->physics,&observer->design,&eye,&forward,&up);
    return eye;
}
static int cargo_visible_from(Vector3 eye,const Creature *cargo){
    b3Pos position=b3Body_GetPosition(cargo->physics.parts[0].body);Vector3 target={position.x,position.y,position.z};
    Vector3 delta=Vector3Subtract(target,eye);float distance=Vector3Length(delta);if(distance>48)return 0;
    Ray ray={eye,Vector3Scale(delta,1/fmaxf(.001f,distance))};
    Vector3 low=Vector3Subtract(Vector3Min(eye,target),(Vector3){.001f,.001f,.001f}),high=Vector3Add(Vector3Max(eye,target),(Vector3){.001f,.001f,.001f});
    for(int i=0;i<terrain_count;i++){
        TerrainBox b=terrain_box(i);Vector3 min=Vector3Subtract(b.center,b.half),max=Vector3Add(b.center,b.half);
        if(max.x<low.x||min.x>high.x||max.y<low.y||min.y>high.y||max.z<low.z||min.z>high.z)continue;
        RayCollision hit=GetRayCollisionBox(ray,(BoundingBox){min,max});
        if(hit.hit&&hit.distance<distance-.1f)return 0;
    }return 1;
}
static int cargo_visible(const Creature *observer,const Creature *cargo){return cargo_visible_from(creature_eye(observer),cargo);}
static Value radio_list(Data *ctx,const RadioMessage *messages,int total,int team){
    Value list=value_array(ctx);int count=0;
    for(int i=0;i<total;i++){
        const RadioMessage *message=&messages[i];if(team>=0&&message->team!=team)continue;
        Value item=value_record(ctx,10);put_number(ctx,item,"team",message->team);put_number(ctx,item,"from",message->from);put_number(ctx,item,"target",message->target);if(message->kind<RADIO_HELP)put_number(ctx,item,"cargo",message->target);put_number(ctx,item,"time",message->time);
        value_set(ctx,item,"kind",value_string(ctx,radio_kinds[message->kind]));value_set(ctx,item,"name",value_string(ctx,message->name));
        put_number(ctx,item,"x",message->position.x);put_number(ctx,item,"y",message->position.y);put_number(ctx,item,"z",message->position.z);put_number(ctx,item,"mass",message->mass);value_set_at(ctx,list,count++,item);
    }return list;
}
static Value radio_state(Data *ctx,int team){return radio_list(ctx,world.radio,world.radio_count,team);}
static int radio_output(Data *ctx,Value value,int *kind,int *target){
    if(!value_is_table(value)||value_is_array(value))return 0;
    Value label=value_get(ctx,value,"kind");const char *text=value_is_string(label)?value_text(ctx,label):NULL;
    *kind=0;while(*kind<RADIO_KINDS&&(!text||strcmp(text,radio_kinds[*kind])))++*kind;
    Value legacy=value_get(ctx,value,"cargo"),requested=value_get(ctx,value,"target");
    int valid=(value_is_nil(legacy)||value_is_number(legacy))&&(value_is_nil(requested)||value_is_number(requested));
    double id=value_is_nil(requested)?(value_is_number(legacy)?legacy.number:NAN):requested.number;
    if(value_is_number(legacy)&&legacy.number!=id)valid=0;
    value_text_free(ctx,text);value_free(ctx,label);value_free(ctx,legacy);value_free(ctx,requested);
    if(!valid||*kind==RADIO_KINDS||!isfinite(id)||id<1||id>INT32_MAX||id!=floor(id))return 0;*target=id;return 1;
}
static void radio_send(const Physics *physics,int kind,int id){
    Creature *sender=NULL,*target=world_find(id);
    for(int i=0;i<world.count;i++)if(world.creatures[i].physics.parts==physics->parts)sender=&world.creatures[i];
    if(!sender||!sender->team||!target)return;
    if((kind==RADIO_SIGHT||kind==RADIO_READY)&&!target->cargo)return;
    if(kind==RADIO_HELP&&(target->cargo||target->team!=sender->team))return;
    if(kind==RADIO_THREAT&&(target->cargo||!target->team||target->team==sender->team))return;
    int known=0;RadioMessage report={0};
    for(int i=world.radio_count-1;i>=0;i--){
        RadioMessage *message=&world.radio[i];
        if(message->from==sender->id&&world.age-message->time<3)return;
        if(!known&&message->team==sender->team&&message->target==id&&world.age-message->time<120){known=1;report=*message;}
    }
    int visible=target==sender||cargo_visible(sender,target);
    if((kind==RADIO_CLAIM||kind==RADIO_RELEASE)?!visible&&!known:!visible)return;
    for(int i=world.radio_count-1;i>=0;i--)if(world.radio[i].from==sender->id&&world.radio[i].target==id){
        memmove(world.radio+i,world.radio+i+1,(world.radio_count-i-1)*sizeof(*world.radio));world.radio_count--;
    }
    if(world.radio_count==RADIO_CAPACITY){memmove(world.radio,world.radio+1,(RADIO_CAPACITY-1)*sizeof(*world.radio));world.radio_count--;}
    RadioMessage *message=&world.radio[world.radio_count++];b3Pos p=b3Body_GetPosition(target->physics.parts[0].body);
    *message=(RadioMessage){.team=sender->team,.from=sender->id,.target=id,.kind=kind,.time=world.age,.position={p.x,p.y,p.z},.mass=creature_mass(target)};
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
typedef struct {Vector3 origin;int landscape,count,depots,radio_count,version;size_t radio_offset;TerrainBox boxes[];} EnvironmentSensors;
static const char *environment_names[]={"groundSamples","obstacles","terrain","depots","radio","combat","scrapyards"};
static int environment_read(lua_State *L){
    Data *ctx=*(Data **)lua_getextraspace(L);const char *name=lua_tostring(L,2);int field=0;
    while(field<7&&(!name||strcmp(name,environment_names[field])))field++;if(field==7)return 0;
    EnvironmentSensors *sample=lua_touserdata(L,lua_upvalueindex(1));lua_pushvalue(L,lua_upvalueindex(2));Value cache=value_take(ctx);
    Value list=value_get(ctx,cache,name);
    if(value_is_nil(list)){
        if(field>=3){list=field==3?depot_list(ctx,sample->depots):field==4?radio_list(ctx,(RadioMessage *)((char *)sample+sample->radio_offset),sample->radio_count,-1):field==5?combat_state(ctx,sample->version):scrapyard_state(ctx,sample->version);value_set(ctx,cache,name,value_copy(ctx,list));}
        else if(field==0){
            list=value_sequence(ctx,16);
            for(int i=0;i<16;i++){
                float angle=(i%8)*PI/4,radius=i<8?6:16,x=sample->origin.x+sinf(angle)*radius,z=sample->origin.z+cosf(angle)*radius,height=sample->landscape?-100:0;
                for(int j=0;j<sample->count;j++){TerrainBox b=sample->boxes[j];if(!b.overhang&&fabsf(x-b.center.x)<=b.half.x&&fabsf(z-b.center.z)<=b.half.z)height=fmaxf(height,b.center.y+b.half.y);}
                value_set_at(ctx,list,i,vector(ctx,(Vector3){x,height,z}));
            }value_set(ctx,cache,name,value_copy(ctx,list));
        }else{
            list=value_sequence(ctx,sample->count);Value obstacles=value_array(ctx);
            for(int i=0,n=0;i<sample->count;i++){
                TerrainBox b=sample->boxes[i];Value item=value_record(ctx,6);put_number(ctx,item,"x",b.center.x);put_number(ctx,item,"z",b.center.z);
                put_number(ctx,item,"halfX",b.half.x);put_number(ctx,item,"halfZ",b.half.z);put_number(ctx,item,"low",b.center.y-b.half.y);put_number(ctx,item,"high",b.center.y+b.half.y);
                if(b.center.y+b.half.y>=sample->origin.y-.2f)value_set_at(ctx,obstacles,n++,value_copy(ctx,item));value_set_at(ctx,list,i,item);
            }value_set(ctx,cache,"terrain",list);value_set(ctx,cache,"obstacles",obstacles);list=value_get(ctx,cache,name);
        }
    }value_push(ctx,list);lua_pushvalue(L,2);lua_pushvalue(L,-2);lua_rawset(L,1);value_free(ctx,list);value_free(ctx,cache);return 1;
}
static int environment_next(lua_State *L){lua_settop(L,2);return lua_next(L,1)?2:0;}
static int environment_pairs(lua_State *L){
    for(int i=0;i<7;i++){lua_getfield(L,1,environment_names[i]);lua_pop(L,1);}lua_pushcfunction(L,environment_next);lua_pushvalue(L,1);lua_pushnil(L);return 3;
}
static void environment_sensors(Data *ctx,Value s,const Physics *p,Vector3 origin,int team){
    TerrainBox boxes[p->landscape&&terrain_count?terrain_count:1];int count=0,messages=0;
    for(int i=0;p->landscape&&i<terrain_count;i++){
        TerrainBox b=terrain_box(i);float dx=fmaxf(0,fabsf(origin.x-b.center.x)-b.half.x),dz=fmaxf(0,fabsf(origin.z-b.center.z)-b.half.z);
        if(hypotf(dx,dz)<=24)boxes[count++]=b;
    }
    for(int i=0;i<world.radio_count;i++)if(world.radio[i].team==team)messages++;
    size_t offset=(sizeof(EnvironmentSensors)+count*sizeof(TerrainBox)+_Alignof(RadioMessage)-1)&~(_Alignof(RadioMessage)-1);
    lua_State *L=ctx->lua;value_push(ctx,s);lua_newtable(L);
    EnvironmentSensors *sample=lua_newuserdatauv(L,offset+messages*sizeof(RadioMessage),0);
    *sample=(EnvironmentSensors){.origin=origin,.landscape=p->landscape,.count=count,.depots=depot_count,.radio_offset=offset,.radio_count=messages,.version=p->landscape?terrain_version:0};memcpy(sample->boxes,boxes,count*sizeof(TerrainBox));
    RadioMessage *radio=(RadioMessage *)((char *)sample+offset);for(int i=0,n=0;i<world.radio_count;i++)if(world.radio[i].team==team)radio[n++]=world.radio[i];
    lua_newtable(L);lua_pushcclosure(L,environment_read,2);lua_setfield(L,-2,"__index");lua_pushcfunction(L,environment_pairs);lua_setfield(L,-2,"__pairs");lua_setmetatable(L,-2);lua_pop(L,1);
}

static struct {b3Pos *positions;int *offsets;float *distances;} observation_frame;
static void observation_frame_clear(void){
    free(observation_frame.positions);free(observation_frame.offsets);free(observation_frame.distances);
    memset(&observation_frame,0,sizeof(observation_frame));
}
static float observation_distance(const Creature *c,const Physics *observer){
    if(neighbor_bounds){
        if(!observation_frame.offsets){
            int capacity=0;for(int i=0;i<world.count;i++)capacity+=world.creatures[i].physics.count;
            observation_frame.positions=array_resize(NULL,capacity,sizeof(b3Pos));
            observation_frame.offsets=array_resize(NULL,world.count+1,sizeof(int));
            observation_frame.distances=array_resize(NULL,(size_t)world.count*world.count,sizeof(float));
            for(size_t i=0;i<(size_t)world.count*world.count;i++)observation_frame.distances[i]=-1;
            for(int i=0,n=0;i<world.count;i++){
                const Physics *p=&world.creatures[i].physics;observation_frame.offsets[i]=n;
                for(int j=0;j<p->count;j++)if(p->parts[j].owner==j)observation_frame.positions[n++]=physics_position(&p->parts[j]);
                observation_frame.offsets[i+1]=n;
            }
        }
        int from=0;while(from<world.count&&world.creatures[from].physics.parts!=observer->parts)from++;
        if(from<world.count){
            int to=c-world.creatures;float *cached=&observation_frame.distances[(size_t)from*world.count+to];
            if(*cached<0){
                float squared=INFINITY;
                for(int i=observation_frame.offsets[to];i<observation_frame.offsets[to+1];i++){
                    b3Pos target=observation_frame.positions[i];
                    for(int j=observation_frame.offsets[from];j<observation_frame.offsets[from+1];j++){
                        b3Pos origin=observation_frame.positions[j];float x=target.x-origin.x,z=target.z-origin.z;squared=fminf(squared,x*x+z*z);
                    }
                }
                *cached=sqrtf(squared);observation_frame.distances[(size_t)to*world.count+from]=*cached;
            }return *cached;
        }
    }
    float squared=INFINITY;
    for(int i=0;i<c->design.count;i++)if(c->physics.parts[i].owner==i){
        b3Pos target=physics_position(&c->physics.parts[i]);
        for(int j=0;j<observer->count;j++)if(observer->parts[j].owner==j){
            b3Pos from=physics_position(&observer->parts[j]);float x=target.x-from.x,z=target.z-from.z;
            squared=fminf(squared,x*x+z*z);
        }
    }return sqrtf(squared);
}
static Creature *observed_target(lua_State *L){
    lua_Number number=luaL_checknumber(L,1);
    if(!isfinite(number)||number<1||number>INT32_MAX||number!=floor(number)){luaL_error(L,"Observation requires an object ID");return NULL;}
    Creature *observer=world_find(lua_tointeger(L,lua_upvalueindex(1))),*target=world_find((int)number);
    if(!observer||!target)return NULL;
    return observation_distance(target,&observer->physics)<=48?target:NULL;
}
static int observed_parts(lua_State *L){
    Creature *target=observed_target(L);lua_newtable(L);if(!target)return 1;
    ContactForces *contacts=part_contacts(&target->physics);
    for(int i=0;i<target->design.count;i++){
        Block b=target->design.blocks[i];PhysicsPart *part=&target->physics.parts[i];b3WorldTransform pose=physics_transform(part);
        lua_createtable(L,0,16);
        const char *keys[]={"joint","parent","body","x","y","z","force","travel","angle","size"};
        double values[]={b.joint,b.parent,part->owner,pose.p.x,pose.p.y,pose.p.z,b.force,b.travel,part->angle,block_size(b)};
        for(int j=0;j<10;j++){lua_pushnumber(L,values[j]);lua_setfield(L,-2,keys[j]);}
        lua_createtable(L,4,0);for(int j=0;j<4;j++){lua_pushnumber(L,((float *)&pose.q)[j]);lua_rawseti(L,-2,j+1);}lua_setfield(L,-2,"rotation");
        lua_pushnumber(L,contacts[i].support);lua_setfield(L,-2,"supportForce");
        b3Vec3 axis={0};((float *)&axis)[b.axis]=b.direction;axis=b3RotateVector(pose.q,axis);
        const char *axes[]={"axisX","axisY","axisZ"};for(int j=0;j<3;j++){lua_pushnumber(L,((float *)&axis)[j]);lua_setfield(L,-2,axes[j]);}
        if(b.joint==BLOCK_MAGNET){Creature *held=b3Body_IsValid(part->magnet_target)?body_owner(part->magnet_target):NULL;lua_pushinteger(L,held?held->id:0);lua_setfield(L,-2,"target");}
        lua_rawseti(L,-2,i+1);
    }free(contacts);return 1;
}
static int collision_bounds(lua_State *L){
    Creature *target=observed_target(L);lua_newtable(L);if(!target)return 1;
    for(int i=0;i<target->physics.shape_count;i++){
        PhysicsShape *shape=&target->physics.shapes[i];b3AABB box=b3Shape_GetAABB(shape->id);
        lua_createtable(L,0,7);
        const char *keys[]={"body","x","z","halfX","halfZ","low","high"};
        double values[]={target->physics.parts[shape->part].owner,(box.lowerBound.x+box.upperBound.x)*.5,(box.lowerBound.z+box.upperBound.z)*.5,(box.upperBound.x-box.lowerBound.x)*.5,(box.upperBound.z-box.lowerBound.z)*.5,box.lowerBound.y,box.upperBound.y};
        for(int j=0;j<7;j++){lua_pushnumber(L,values[j]);lua_setfield(L,-2,keys[j]);}lua_rawseti(L,-2,i+1);
    }return 1;
}
static void surroundings(Data *ctx,Value s,const Physics *p,Vector3 origin){
    Value nearby=value_array(ctx);int self=0;
    if(world.next_id&&b3StoreWorldId(p->world)==b3StoreWorldId(world.physics)){
        Nearby *neighbors=array_resize(NULL,world.count,sizeof(*neighbors));int count=0;
        for(int i=0;i<world.count;i++){
            Creature *c=&world.creatures[i];if(c->physics.parts==p->parts){self=c->id;continue;}
            float d=observation_distance(c,p);if(d>48)continue;
            neighbors[count++]=(Nearby){i,d};
        }
        qsort(neighbors,count,sizeof(*neighbors),nearby_distance);
        Creature *observer=world_find(self);Vector3 eye=observer?creature_eye(observer):(Vector3){0};
        for(int i=0;i<count;i++){
            int index=neighbors[i].index;Creature *c=&world.creatures[index];b3Pos v=b3Body_GetPosition(c->physics.parts[0].body);b3Vec3 velocity=physics_velocity(&c->physics.parts[0]);
            NeighborBounds bounds;
            if(neighbor_bounds){if(!neighbor_bounds[index].valid)neighbor_bounds[index]=creature_bounds(c,v);bounds=neighbor_bounds[index];}
            else bounds=creature_bounds(c,v);
            Value item=value_record(ctx,26);put_number(ctx,item,"id",c->id);value_set(ctx,item,"name",value_string(ctx,c->name));
            put_number(ctx,item,"x",v.x);put_number(ctx,item,"y",v.y);put_number(ctx,item,"z",v.z);put_number(ctx,item,"vx",velocity.x);put_number(ctx,item,"vy",velocity.y);put_number(ctx,item,"vz",velocity.z);
            put_number(ctx,item,"radius",bounds.radius);put_number(ctx,item,"low",bounds.low);put_number(ctx,item,"high",bounds.high);
            put_number(ctx,item,"mass",bounds.mass);value_set(ctx,item,"centerOfMass",vector(ctx,bounds.center));
            put_number(ctx,item,"team",c->team);
            put_number(ctx,item,"supply",c->supply);value_set(ctx,item,"parachute",value_bool(ctx,c->parachute));
            put_number(ctx,item,"up",b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y);put_number(ctx,item,"fallenSeconds",c->fallen);
            value_set(ctx,item,"controllerStopped",value_bool(ctx,c->error[0]!=0));
            if(c->cargo)value_set(ctx,item,"visible",value_bool(ctx,observer&&cargo_visible_from(eye,c)));
            value_set(ctx,item,"anchored",value_bool(ctx,c->design.anchored));value_set(ctx,item,"cargo",value_bool(ctx,c->cargo));value_set(ctx,item,"delivered",value_bool(ctx,c->delivered));put_number(ctx,item,"carriedBy",c->held_by);
            value_set(ctx,item,"magnetHeld",value_bool(ctx,c->magnet_count>0));put_number(ctx,item,"magnetCount",c->magnet_count);
            value_set_at(ctx,nearby,i,item);
        }
        free(neighbors);
    }
    put_number(ctx,s,"id",self);put_number(ctx,s,"cargoDelivered",self?world_cargo_score(self):0);
    Creature *observer=world_find(self);int team=observer?observer->team:0;put_number(ctx,s,"team",team);put_number(ctx,s,"worldTime",world.age);
    put_number(ctx,s,"carriedBy",observer?observer->held_by:0);put_number(ctx,s,"magnetCount",observer?observer->magnet_count:0);
    value_set(ctx,s,"nearby",nearby);environment_sensors(ctx,s,p,origin,team);
}
static Value winch_state(Data *ctx,const Physics *p,const Character *c){
    Value list=value_array(ctx);
    for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_WINCH){
        const PhysicsPart *part=&p->parts[i];Value item=value_table(ctx);
        put_number(ctx,item,"paidOut",part->winch_length);
        float tension=b3Joint_IsValid(part->joint)?b3Length(b3Joint_GetConstraintForce(part->joint))+part->winch_pull:0;
        put_number(ctx,item,"tension",tension);value_set_at(ctx,list,i,item);
    }return list;
}
Value physics_sensors(Data *ctx,const Physics *p,const Character *c,double dt){
    Value s=value_record(ctx,40),angles=value_sequence(ctx,c->count),rates=value_sequence(ctx,c->count),touching=value_sequence(ctx,c->count),positions=value_sequence(ctx,c->count),submerged=value_sequence(ctx,c->count);
    Value support=value_sequence(ctx,c->count),self_contact=value_sequence(ctx,c->count),magnets=magnet_state(ctx,p,c);b3ContactData *contacts=NULL;int contact_capacity=0;
    Vector3 position;Quaternion q;physics_pose(p,c,0,&position,&q);Quaternion inverse=QuaternionInvert(q);
    surroundings(ctx,s,p,position);
    value_set(ctx,s,"contactsReady",value_bool(ctx,p->sampled));
    put_number(ctx,s,"x",position.x);put_number(ctx,s,"y",position.y);put_number(ctx,s,"z",position.z);put_number(ctx,s,"dt",dt);
    put_number(ctx,s,"ground",p->landscape?terrain_floor(position):0);
    put_number(ctx,s,"waterHeight",p->landscape?water_height(position.x,position.z,p->time):NAN);
    Vector3 up=Vector3RotateByQuaternion((Vector3){0,1,0},q);put_number(ctx,s,"up",up.y);
    b3Vec3 v=physics_velocity(&p->parts[0]),w=b3Body_GetAngularVelocity(p->parts[0].body),gravity=b3World_GetGravity(p->world);
    put_number(ctx,s,"vx",v.x);put_number(ctx,s,"vy",v.y);put_number(ctx,s,"vz",v.z);
    Value rotation=vector(ctx,(Vector3){q.x,q.y,q.z});value_set_at(ctx,rotation,3,value_number(ctx,q.w));value_set(ctx,s,"rotation",rotation);
    value_set(ctx,s,"angularVelocity",vector(ctx,(Vector3){w.x,w.y,w.z}));
    value_set(ctx,s,"gyroscope",vector(ctx,Vector3RotateByQuaternion((Vector3){w.x,w.y,w.z},inverse)));
    value_set(ctx,s,"gravity",vector(ctx,Vector3RotateByQuaternion((Vector3){gravity.x,gravity.y,gravity.z},inverse)));
    value_set(ctx,s,"localVelocity",vector(ctx,Vector3RotateByQuaternion((Vector3){v.x,v.y,v.z},inverse)));
    double mass=0;Vector3 center={0};ContactForces *forces=part_contacts(p);
    for(int i=0;i<c->count;i++){
        b3Pos pos=physics_center(&p->parts[i]);float m=p->parts[i].mass;mass+=m;center=Vector3Add(center,Vector3Scale((Vector3){pos.x,pos.y,pos.z},m));
        b3Pos origin=physics_position(&p->parts[i]);value_set_at(ctx,positions,i,vector(ctx,(Vector3){origin.x,origin.y,origin.z}));
        value_set_at(ctx,submerged,i,value_number(ctx,p->parts[i].submerged));
        value_set_at(ctx,angles,i,value_number(ctx,p->parts[i].angle));value_set_at(ctx,rates,i,value_number(ctx,p->parts[i].rate));
        int required,count;value_set_at(ctx,touching,i,value_bool(ctx,forces[i].count>0));
        value_set_at(ctx,support,i,value_number(ctx,forces[i].support));value_set_at(ctx,self_contact,i,value_number(ctx,forces[i].self));
        if(c->blocks[i].joint==BLOCK_MAGNET){
            b3BodyId target=p->parts[i].magnet_target;double target_support=0;
            if(b3Body_IsValid(target)){
                required=b3Body_GetContactCapacity(target);if(required>contact_capacity){contact_capacity=required;contacts=array_resize(contacts,contact_capacity,sizeof(*contacts));}
                count=required?b3Body_GetContactData(target,contacts,contact_capacity):0;
                target_support=contact_forces(target,b3Body_GetUserData(target),contacts,count).support;
            }
            float cargo_support=0;
            if(b3Body_IsValid(target))for(int j=0;j<world.count;j++)if(world.creatures[j].cargo&&world.creatures[j].physics.parts==b3Body_GetUserData(target)){cargo_support=cargo_support_force(&world.creatures[j],p);break;}
            Value magnet=value_at(ctx,magnets,i);put_number(ctx,magnet,"targetSupportForce",target_support);put_number(ctx,magnet,"cargoSupportForce",cargo_support);value_free(ctx,magnet);
        }
    }
    free(forces);free(contacts);value_set(ctx,s,"supportForce",support);value_set(ctx,s,"selfContactForce",self_contact);
    put_number(ctx,s,"mass",mass);value_set(ctx,s,"centerOfMass",vector(ctx,Vector3Scale(center,mass>0?1/mass:0)));
    value_set(ctx,s,"angles",angles);value_set(ctx,s,"rates",rates);value_set(ctx,s,"touching",touching);value_set(ctx,s,"positions",positions);value_set(ctx,s,"submerged",submerged);value_set(ctx,s,"magnets",magnets);value_set(ctx,s,"winches",winch_state(ctx,p,c));return s;
}
static int assigned(const Character *design,int key){
    if(key<=0||key>=128)return 0;
    for(int i=1;i<design->count;i++)if(block_controlled(design->blocks[i])&&(design->blocks[i].negative==key||design->blocks[i].positive==key))return 1;return 0;
}
typedef struct {Controller *controller;const Physics *physics;const Character *design;float *controls;} ControlCall;
static int controller_call(lua_State *L){
    ControlCall *call=lua_touserdata(L,1);Controller *controller=call->controller;const Physics *p=call->physics;const Character *design=call->design;Data *ctx=controller->ctx;
    double dt=controller->last_step<0?1.0/controller->hz:(p->steps-controller->last_step)/60.0;controller->last_step=p->steps;
    if(value_is_nil(controller->blueprint))controller->blueprint=character_data(ctx,design);
    if(!lua_checkstack(L,512+5*world.count+4*design->count))return luaL_error(L,"Controller stack limit exceeded");int base=lua_gettop(L);ctx->scratch=1;
    Value sensors=physics_sensors(ctx,p,design,dt);
    value_set(ctx,sensors,"blueprint",value_copy(ctx,controller->blueprint));
    value_push(ctx,sensors);lua_pushinteger(L,get_number(ctx,sensors,"id",0));lua_pushcclosure(L,collision_bounds,1);lua_setfield(L,-2,"bounds");
    lua_pushinteger(L,get_number(ctx,sensors,"id",0));lua_pushcclosure(L,observed_parts,1);lua_setfield(L,-2,"parts");lua_pop(L,1);
    Value input=value_table(ctx),pressed=value_table(ctx);Creature *player=world.player?world_find(world.player):NULL;
    if((player&&&player->physics==p)||controller==trial){
        for(int k=1;k<128;k++){char key[2]={k,0};if(world.input[k])put_number(ctx,input,key,1);if(world.pressed[k])put_number(ctx,pressed,key,1);}memset(world.pressed,0,sizeof(world.pressed));
    }value_set(ctx,sensors,"input",input);value_set(ctx,sensors,"pressed",pressed);
    value_push(ctx,controller->function);lua_pushnumber(L,p->steps/60.0);value_push(ctx,sensors);value_free(ctx,sensors);value_push(ctx,controller->memory);value_push(ctx,controller->random);ctx->scratch=0;lua_rotate(L,base+1,5);lua_settop(L,base+5);lua_call(L,4,1);
    int valid=1,radio_kind=-1,radio_cargo=0;float *controls=call->controls;
    if(lua_type(L,-1)==LUA_TSTRING){
        size_t length;const unsigned char *keys=(const unsigned char *)lua_tolstring(L,-1,&length);
        for(size_t i=0;i<length;i++){if(!assigned(design,keys[i])){valid=0;break;}controls[keys[i]]=1;}
    }else if(lua_istable(L,-1)){
        lua_pushnil(L);while(lua_next(L,-2)){
            const char *key=lua_type(L,-2)==LUA_TSTRING?lua_tostring(L,-2):NULL;
            if(key&&!strcmp(key,"radio")){lua_pushvalue(L,-1);Value v=value_take(ctx);if(!radio_output(ctx,v,&radio_kind,&radio_cargo)){value_free(ctx,v);return luaL_error(L,"Invalid radio output");}value_free(ctx,v);}
            else if(!key||strlen(key)!=1||!assigned(design,(unsigned char)key[0])||lua_type(L,-1)!=LUA_TNUMBER||!isfinite(lua_tonumber(L,-1))||lua_tonumber(L,-1)<0||lua_tonumber(L,-1)>1)return luaL_error(L,"Invalid command key=%s type=%s",key?key:"(not a string)",lua_typename(L,lua_type(L,-1)));
            else controls[(unsigned char)key[0]]=lua_tonumber(L,-1);lua_pop(L,1);
        }
    }else valid=0;
    if(!valid)return luaL_error(L,"Invalid controller output");if(radio_kind>=0)radio_send(p,radio_kind,radio_cargo);return 0;
}
static int controller_step(Controller *controller,const Physics *p,const Character *design,float controls[128]){
    controller_budget(controller);Data *ctx=controller->ctx;char frame;ctx->stack_base=(uintptr_t)&frame;lua_State *L=ctx->lua;int top=lua_gettop(L);memset(controls,0,128*sizeof(float));
    ControlCall call={controller,p,design,controls};lua_pushcfunction(L,controller_call);lua_pushlightuserdata(L,&call);int status=lua_pcall(L,1,0,0);ctx->scratch=0;ctx->stack_base=0;
    if(status){snprintf(controller->error,sizeof(controller->error),"%s",lua_tostring(L,-1));memset(controls,0,128*sizeof(float));}lua_settop(L,top);lua_gc(L,LUA_GCSTEP,(size_t)0);return status==LUA_OK;
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
Value world_creature_program(Data *ctx,int id){
    Creature *c=world_find(id);if(!c)return VALUE_NULL;Value result=value_table(ctx);
    value_set(ctx,result,"name",value_string(ctx,c->name));value_set(ctx,result,"source",value_string(ctx,c->controller->source));put_number(ctx,result,"hz",c->controller->hz);if(c->error[0])value_set(ctx,result,"error",value_string(ctx,c->error));return result;
}
Value world_program(Data *ctx){
    if(!installed)return VALUE_NULL;Value result=value_table(ctx);
    value_set(ctx,result,"name",value_string(ctx,installed_name));value_set(ctx,result,"source",value_string(ctx,installed));put_number(ctx,result,"hz",installed_hz);
    Value memory=VALUE_NULL;const char *error=NULL;
    if(trial){
        size_t length=0;const char *json=controller_memory_lua(trial,&length);
        if(!json)error="Controller memory could not be serialized within its execution and heap limits";
        else if(length>8192)error="Controller memory exceeds the 8 KiB inspection limit";
        else {memory=data_parse(ctx,json,length,"controller-memory");if(value_is_error(memory)){value_free(ctx,value_exception(ctx));memory=VALUE_NULL;error="Controller memory could not be copied";}}
        value_text_free(trial->ctx,json);
    }
    value_set(ctx,result,"memory",memory);if(error)value_set(ctx,result,"memoryError",value_string(ctx,error));
    if(trial_status.cause>=0){
        Value failure=value_table(ctx);put_number(ctx,failure,"seconds",trial_status.steps/60.0);
        value_set(ctx,failure,"cause",value_string(ctx,removal_causes[trial_status.cause]));value_set(ctx,failure,"detail",value_string(ctx,trial_status.detail));value_set(ctx,result,"failure",failure);
    }return result;
}
Value world_install(Data *ctx,Value args){
    Value code=value_get(ctx,args,"source"),name=value_get(ctx,args,"name");
    const char *source=value_text(ctx,code),*label=value_text(ctx,name);Value result=VALUE_NIL;
    double hz=get_number(ctx,args,"hz",CONTROLLER_DEFAULT_HZ);
    Controller *probe=source&&valid_controller_hz(hz)?controller_new(source,1,hz):NULL;
    if(!probe)result=value_error(ctx,"Controller must compile to a Lua chunk returning a function within its heap and execution limits; return key letters or key strengths 0..1, hz 1/10/20/30/60");
    else {world_trial_stop();installed_hz=hz;free(installed);installed=strdup(source);snprintf(installed_name,sizeof(installed_name),"%s",label?label:"Creature");controller_free(probe);}
    value_text_free(ctx,source);value_text_free(ctx,label);value_free(ctx,code);value_free(ctx,name);return result;
}
Value world_designs(Data *ctx,int full){
    Value list=value_array(ctx);
    for(int i=0;i<world.design_count;i++){SavedDesign *d=&world.designs[i];Value item=value_table(ctx);
        put_number(ctx,item,"id",i+1);put_number(ctx,item,"parts",d->design.count);put_number(ctx,item,"hz",d->hz);put_number(ctx,item,"x",d->x);put_number(ctx,item,"z",d->z);
        value_set(ctx,item,"name",value_string(ctx,d->name));value_set(ctx,item,"anchored",value_bool(ctx,d->design.anchored));
        value_set(ctx,item,"sea",value_bool(ctx,terrain_height(d->x,d->z)<WATER_LEVEL));
        value_set(ctx,item,"programmed",value_bool(ctx,d->source!=NULL));
        if(full){value_set(ctx,item,"blueprint",character_data(ctx,&d->design));value_set(ctx,item,"source",d->source?value_string(ctx,d->source):VALUE_NULL);}
        value_set_at(ctx,list,i,item);
    }return list;
}
Value world_open_design(Data *ctx,int index,Character *design){
    if(index<0||index>=world.design_count)return value_error(ctx,"Unknown saved design");
    SavedDesign *d=&world.designs[index];Value args=value_table(ctx);
    if(!d->source){world_trial_stop();free(installed);installed=NULL;installed_hz=CONTROLLER_DEFAULT_HZ;snprintf(installed_name,sizeof(installed_name),"%s",d->name);character_copy(design,&d->design);value_free(ctx,args);return VALUE_NIL;}
    value_set(ctx,args,"source",value_string(ctx,d->source));value_set(ctx,args,"name",value_string(ctx,d->name));put_number(ctx,args,"hz",d->hz);
    Value result=world_install(ctx,args);value_free(ctx,args);if(!value_is_error(result))character_copy(design,&d->design);return result;
}
Value world_save_design(Data *ctx,const Character *design,int sea){
    if(!design->count)return value_error(ctx,"Build a character before saving a design");
    return value_number(ctx,remember_design(design,installed,installed?installed_name:"Workshop build",installed_hz,sea?125:0,sea?10:0));
}
static Creature *spawn_poses(const Character *design,const char *source,const char *name,uint32_t seed,int hz,float x,float z,const PhysicsPose *poses){
    Controller *controller=controller_new(source,seed,hz);if(!controller)return NULL;
    if(!world.next_id){world.next_id=1;world.physics=physics_world(1);}
    if(world.count==world.capacity){world.capacity=world.capacity?world.capacity*2:16;world.creatures=array_resize(world.creatures,world.capacity,sizeof(Creature));}
    Creature *c=&world.creatures[world.count++];memset(c,0,sizeof(*c));c->id=world.next_id++;snprintf(c->name,sizeof(c->name),"%s",name);c->controller=controller;
    c->cargo=!design->anchored;
    for(int i=0;i<design->count;i++)if(design->blocks[i].joint!=BLOCK_BOX)c->cargo=0;
    character_copy(&c->design,design);physics_attach_poses(&c->physics,&c->design,world.physics,x,z,1,poses,0);c->physics.time=world.age;
    Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);c->root_height=p.y-fmaxf(terrain_height(x,z),WATER_LEVEL);return c;
}
static Creature *spawn(const Character *design,const char *source,const char *name,uint32_t seed,int hz,float x,float z){return spawn_poses(design,source,name,seed,hz,x,z,NULL);}
static void set_spawn_height(Creature *c,float y){
    float offset=y-c->physics.start.y;
    for(int i=0;i<c->design.count;i++)if(c->physics.parts[i].owner==i){
        b3BodyId body=c->physics.parts[i].body;b3WorldTransform t=b3Body_GetTransform(body);t.p.y+=offset;b3Body_SetTransform(body,t.p,t.q);
    }c->physics.start.y=y;
}
Creature *world_find(int id){for(int i=0;i<world.count;i++)if(world.creatures[i].id==id)return &world.creatures[i];return NULL;}
const char *world_placement_message(PlacementStatus status){
    const char *messages[]={"Ready: click or Enter to place","Point at solid ground or a roof","Anchor the root before placing","Keep the whole build inside the selected team's ground","The root needs a flat, supported footing","Blocked by terrain or another character"};
    return messages[status];
}
static int placement_overlap(BoundingBox a,BoundingBox b){
    return a.min.x<b.max.x-.005f&&a.max.x>b.min.x+.005f&&a.min.y<b.max.y-.005f&&a.max.y>b.min.y+.005f&&a.min.z<b.max.z-.005f&&a.max.z>b.min.z+.005f;
}
PlacementStatus world_placement_check(const Character *design,const WorldPlacement *placement){
    if(!design->count||!design->anchored)return PLACEMENT_ANCHOR;
    Vector3 offset=placement->offset;if(!isfinite(offset.x)||!isfinite(offset.y)||!isfinite(offset.z))return PLACEMENT_SURFACE;
    int team=placement->team;if(team<0||team>2||terrain_version<7&&team)return PLACEMENT_ZONE;
    BoundingBox root={0},extent={{INFINITY,INFINITY,INFINITY},{-INFINITY,-INFINITY,-INFINITY}};
    BoundingBox *boxes=array_resize(NULL,(size_t)design->count*2,sizeof(*boxes));int count=0;PlacementStatus status=PLACEMENT_OK;
    for(int i=0;i<design->count;i++){
        Vector3 p=Vector3Add(block_position(design->blocks[i]),offset),h=block_half(design->blocks[i]);
        boxes[count++]=(BoundingBox){Vector3Subtract(p,h),Vector3Add(p,h)};
        if(block_size(design->blocks[i])>1){Block b=design->blocks[i];((float *)&p)[b.axis]-=b.direction*.33f;((float *)&h)[b.axis]=.14f;boxes[count++]=(BoundingBox){Vector3Subtract(p,h),Vector3Add(p,h)};}
    }
    for(int i=0;i<count;i++){extent.min=Vector3Min(extent.min,boxes[i].min);extent.max=Vector3Max(extent.max,boxes[i].max);}
    root=boxes[0];float width=terrain_combat_half_x(terrain_version);
    if(extent.min.x<-WORLD_RADIUS||extent.max.x>WORLD_RADIUS||extent.min.z<-WORLD_RADIUS||extent.max.z>WORLD_RADIUS||extent.max.y>128)status=PLACEMENT_SURFACE;
    else if(terrain_version>=7&&(extent.min.z<=-COMBAT_HALF_Z||extent.max.z>=COMBAT_HALF_Z||
        (team==1?extent.min.x<=width:team==2?extent.max.x>=-width:extent.min.x<-width||extent.max.x>width)))status=PLACEMENT_ZONE;
    else if(root.min.y<WATER_LEVEL+.05f)status=PLACEMENT_SURFACE;
    for(int point=0;status==PLACEMENT_OK&&point<5;point++){
        float x=point==4?(root.min.x+root.max.x)*.5f:point&1?root.min.x:root.max.x;
        float z=point==4?(root.min.z+root.max.z)*.5f:point&2?root.min.z:root.max.z;int supported=0;
        for(int i=0;i<terrain_count&&!supported;i++){TerrainBox b=terrain_box(i);
            supported=fabsf(root.min.y-b.center.y-b.half.y)<.04f&&fabsf(x-b.center.x)<=b.half.x+.001f&&fabsf(z-b.center.z)<=b.half.z+.001f;
        }if(!supported)status=PLACEMENT_SUPPORT;
    }
    for(int i=0;status==PLACEMENT_OK&&i<terrain_count;i++){
        TerrainBox b=terrain_box(i);BoundingBox obstacle={Vector3Subtract(b.center,b.half),Vector3Add(b.center,b.half)};
        if(placement_overlap(extent,obstacle))for(int j=0;j<count;j++)if(placement_overlap(boxes[j],obstacle)){status=PLACEMENT_COLLISION;break;}
    }
    for(int i=0;status==PLACEMENT_OK&&i<world.count;i++)for(int j=0;j<world.creatures[i].physics.shape_count;j++){
        b3AABB b=b3Shape_GetAABB(world.creatures[i].physics.shapes[j].id);
        BoundingBox obstacle={{b.lowerBound.x,b.lowerBound.y,b.lowerBound.z},{b.upperBound.x,b.upperBound.y,b.upperBound.z}};
        if(placement_overlap(extent,obstacle))for(int k=0;k<count;k++)if(placement_overlap(boxes[k],obstacle)){status=PLACEMENT_COLLISION;break;}
        if(status!=PLACEMENT_OK)break;
    }
    free(boxes);return status;
}
WorldPlacement world_placement(const Character *design,int team,Ray ray){
    WorldPlacement placement={.team=team,.status=PLACEMENT_SURFACE};float nearest=INFINITY,top=0;Vector3 point={0};
    if(!design->count||!design->anchored){placement.status=PLACEMENT_ANCHOR;return placement;}
    for(int i=0;i<terrain_count;i++){
        TerrainBox b=terrain_box(i);Vector3 low=Vector3Subtract(b.center,b.half),high=Vector3Add(b.center,b.half);float enter=0,leave=INFINITY;
        for(int axis=0;axis<3&&enter<=leave;axis++){
            float origin=((float *)&ray.position)[axis],direction=((float *)&ray.direction)[axis],min=((float *)&low)[axis],max=((float *)&high)[axis];
            if(direction==0){if(origin<min||origin>max)leave=-1;continue;}
            float a=(min-origin)/direction,c=(max-origin)/direction;enter=fmaxf(enter,fminf(a,c));leave=fminf(leave,fmaxf(a,c));
        }
        if(enter<=leave&&enter<nearest){nearest=enter;point=Vector3Add(ray.position,Vector3Scale(ray.direction,enter));top=b.center.y+b.half.y;}
    }
    if(!isfinite(nearest)||ray.direction.y>=0||fabsf(point.y-top)>.002f)return placement;
    Vector3 root=block_position(design->blocks[0]),half=block_half(design->blocks[0]);
    placement.offset=(Vector3){roundf(point.x)-root.x,point.y+half.y-root.y,roundf(point.z)-root.z};
    placement.status=world_placement_check(design,&placement);return placement;
}
int world_place(const Character *design,WorldPlacement *placement){
    if(placement->status==PLACEMENT_SURFACE||placement->status==PLACEMENT_ANCHOR)return 0;
    placement->status=world_placement_check(design,placement);if(placement->status!=PLACEMENT_OK||!character_validate(design))return 0;
    Character painted={0};character_copy(&painted,design);
    if(placement->team)for(int i=0;i<painted.count;i++)if(painted.blocks[i].color!=4)painted.blocks[i].color=world_team_color(placement->team);
    PhysicsPose *poses=array_resize(NULL,painted.count,sizeof(*poses));
    for(int i=0;i<painted.count;i++){Vector3 p=Vector3Add(block_position(painted.blocks[i]),placement->offset);poses[i]=(PhysicsPose){.transform={{p.x,p.y,p.z},{{0,0,0},1}}};}
    Creature *c=spawn_poses(&painted,installed?installed:"return function() return {} end",installed?installed_name:"Your structure",world.next_id+1,installed_hz,placement->offset.x,placement->offset.z,poses);
    free(poses);character_clear(&painted);if(!c)return 0;
    c->team=placement->team;c->root_height=block_half(c->design.blocks[0]).y;return c->id;
}
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
    char *fallback=installed?NULL:LoadFileText("/usr/src/dolly/blockwalker/driver.lua");
    world.player=0;Creature *player=installed||fallback?spawn(design,installed?installed:fallback,"Your character",1,installed?installed_hz:CONTROLLER_DEFAULT_HZ,x,z):NULL;UnloadFileText(fallback);
    if(player)world.player=player->id;return world.player;
}
int world_drop_cargo(float x,float y,float z,int material){
    Character box={0};character_add(&box,-1,0,0,0,BLOCK_BOX,1);box.blocks[0].material=material;box.blocks[0].finish=FINISH_STRIPE;
    Creature *cargo=spawn(&box,"return function() return '' end","Cargo",1,CONTROLLER_DEFAULT_HZ,x,z);character_clear(&box);if(cargo&&isfinite(y))set_spawn_height(cargo,y);return cargo?cargo->id:0;
}
static void update_magnet_owners(void){
    for(int i=0;i<world.count;i++){world.creatures[i].held_by=0;world.creatures[i].magnet_count=0;}
    for(int i=0;i<world.count;i++){
        Creature *holder=&world.creatures[i];
        for(int j=0;j<holder->design.count;j++){
            b3BodyId body=holder->physics.parts[j].magnet_target;if(!b3Body_IsValid(body))continue;
            Creature *target=body_owner(body);if(target){target->magnet_count++;if(!target->held_by)target->held_by=holder->id;}
        }
    }
}
static Creature *cargo_carrier(const Creature *cargo,int *supported){
    if(supported)*supported=0;
    Creature *holder=world_find(cargo->held_by);if(magnet_holds(holder,cargo))return holder;
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
    update_magnet_owners();
    for(int i=0;i<world.count;i++){
        Creature *cargo=&world.creatures[i];if(!cargo->cargo)continue;
        int supported=0;b3BodyId body=cargo->physics.parts[0].body;b3Pos p=b3Body_GetPosition(body);Creature *owner=cargo_carrier(cargo,&supported);
        cargo->held_by=owner?owner->id:0;
        if(cargo->delivered)continue;
        if(owner){
            if(!cargo->carrier)cargo->pickup=(Vector3){p.x,p.y,p.z};
            cargo->carrier=owner->id==world.player?-1:owner->id;cargo->settled=0;continue;
        }
        int attached=0;for(int j=0;j<cargo->design.count;j++)attached|=b3Body_IsValid(cargo->physics.parts[j].magnet_target);
        if(attached){cargo->settled=0;continue;}
        int depot=-1;
        for(int j=0;j<depot_count;j++){Depot d=depots[j];if(terrain_version>=6&&!d.team)continue;
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
    if(world.age>=world.next_parcel&&parcels<(terrain_version>=8?10:6)){
        const Vector2 legacy_sites[]={{-60,-25},{-15,-45},{45,-30},{65,20},{-43,47},{8,66},{-72,72},{38,32}};
        const Vector2 combat_sites[]={{-22,-16},{14,-9},{-8,14},{20,26},{-43,47},{8,66},{-20,-44},{38,-28}};
        const Vector2 contested_sites[]={{-22,-68},{14,-42},{-8,-16},{2,12},{-24,38},{8,66},{0,-44},{24,28}};
        const Vector2 *sites=terrain_version>=8?contested_sites:terrain_version>=6?combat_sites:legacy_sites;
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
        world.next_parcel=world.age+(terrain_version>=8?18+14*supply_random():45+45*supply_random());
    }
    if(world.age>=world.next_ore&&ore<3&&!blocked&&platform){
        Character crate={0};character_add(&crate,-1,0,0,0,BLOCK_BOX,1);character_add(&crate,0,1,0,0,BLOCK_BOX,1);character_add(&crate,0,0,0,1,BLOCK_BOX,1);character_add(&crate,1,1,0,1,BLOCK_BOX,1);
        for(int i=0;i<crate.count;i++){crate.blocks[i].material=MATERIAL_BALLAST;crate.blocks[i].finish=FINISH_STRIPE;}
        Creature *cargo=spawn(&crate,"return function() return '' end","Ore pallet",1,CONTROLLER_DEFAULT_HZ,-47,60.5f);character_clear(&crate);
        if(cargo){cargo->supply=2;set_spawn_height(cargo,-6.9f);}
        world.next_ore=world.age+60+30*supply_random();
    }
    if(terrain_version>=2&&world.age>=world.next_mine&&mine<2&&!mine_blocked&&drilling){
        Creature *cargo;
        if(terrain_version>=8){
            Character pallet={0};character_add(&pallet,-1,0,0,0,BLOCK_BOX,2);character_add(&pallet,0,1,0,0,BLOCK_BOX,2);character_add(&pallet,0,0,0,1,BLOCK_BOX,2);character_add(&pallet,1,1,0,1,BLOCK_BOX,2);
            for(int i=0;i<pallet.count;i++){pallet.blocks[i].material=MATERIAL_BALLAST;pallet.blocks[i].finish=FINISH_GLOW;}
            cargo=spawn(&pallet,"return function() return '' end","Core sample",1,CONTROLLER_DEFAULT_HZ,-73,-78);character_clear(&pallet);if(cargo)set_spawn_height(cargo,.55f);
        }else cargo=world_find(world_drop_cargo(-73,.55f,-78,MATERIAL_BALLAST));
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
Value world_release(Data *ctx,const Character *design,Value args){
    if(!installed||!design->count)return value_error(ctx,"Build a character and install a learned controller first");
    int index=world.next_id?world.next_id-1:0,plot=index%256;float angle=plot*2.399963f,radius=5*sqrtf(plot);
    float x=get_number(ctx,args,"x",cosf(angle)*radius),z=get_number(ctx,args,"z",sinf(angle)*radius);
    if(!isfinite(x)||!isfinite(z)||fabsf(x)>WORLD_RADIUS-8||fabsf(z)>WORLD_RADIUS-8)return value_error(ctx,"Spawn must be inside the 512 m world; the sea surrounds the central 200 m ground");
    double team=get_number(ctx,args,"team",0);if(!isfinite(team)||team<0||team>2||team!=floor(team))return value_error(ctx,"Team must be 0 (neutral), 1 (East) or 2 (West)");
    Value cargo=value_get(ctx,args,"cargo");int payload=value_is_bool(cargo)?value_truth(ctx,cargo):-1,valid=value_is_nil(cargo)||value_is_bool(cargo);value_free(ctx,cargo);
    if(!valid)return value_error(ctx,"Cargo must be a boolean");
    if(design->anchored){
        WorldPlacement placement=world_placement(design,team,(Ray){{x,128,z},{0,-1,0}});int id=world_place(design,&placement);
        if(!id)return value_error(ctx,"%s",world_placement_message(placement.status));
        remember_design(design,installed,installed_name,installed_hz,x,z);return value_number(ctx,id);
    }
    Creature *c=spawn(design,installed,installed_name,(uint32_t)get_number(ctx,args,"seed",index+1),installed_hz,x,z);
    if(!c)return value_error(ctx,"Controller failed to initialize");
    c->team=team;
    if(payload>=0)c->cargo=payload;
    remember_design(design,installed,installed_name,installed_hz,x,z);
    printf("CREATURE %d born: %s, %d parts\n",c->id,c->name,c->design.count);return value_number(ctx,c->id);
}
static Value removal_state(Data *ctx,int full){
    Value list=value_array(ctx);int first=full?0:(int)fmaxf(0,world.removal_count-8);
    for(int i=first;i<world.removal_count;i++){Removal *r=&world.removals[i];Value item=value_table(ctx);
        put_number(ctx,item,"id",r->id);put_number(ctx,item,"time",r->time);put_number(ctx,item,"seconds",r->seconds);
        const char *axes[]={"up","x","y","z"};float pose[]={r->up,r->position.x,r->position.y,r->position.z};for(int j=0;j<4;j++)value_set(ctx,item,axes[j],isfinite(pose[j])?value_number(ctx,pose[j]):VALUE_NULL);
        value_set(ctx,item,"name",value_string(ctx,r->name));value_set(ctx,item,"cause",value_string(ctx,removal_causes[r->cause]));value_set(ctx,item,"detail",value_string(ctx,r->detail));value_set_at(ctx,list,i-first,item);
    }return list;
}
static Removal *new_removal(void){
    if(world.removal_count==world.removal_capacity){world.removal_capacity=world.removal_capacity?world.removal_capacity*2:16;world.removals=array_resize(world.removals,world.removal_capacity,sizeof(Removal));}
    Removal *r=&world.removals[world.removal_count++];memset(r,0,sizeof(*r));return r;
}
static Value delivery_state(Data *ctx){
    Value list=value_array(ctx);
    for(int i=0;i<world.delivery_count;i++){Delivery *d=&world.deliveries[i];Value item=value_table(ctx);
        put_number(ctx,item,"cargoId",d->cargo);put_number(ctx,item,"carrierId",d->carrier);put_number(ctx,item,"depot",d->depot);put_number(ctx,item,"time",d->time);
        put_number(ctx,item,"points",d->points);
        value_set(ctx,item,"name",value_string(ctx,d->name));value_set_at(ctx,list,i,item);
    }return list;
}
Value world_state(Data *ctx){
    Value result=value_table(ctx),list=value_array(ctx);put_number(ctx,result,"deaths",world.deaths);put_number(ctx,result,"seconds",world.age);
    put_number(ctx,result,"playerId",world.player);
    put_number(ctx,result,"cargoDelivered",world.delivery_count);put_number(ctx,result,"playerDelivered",world_cargo_score(-1));
    Value scores=value_array(ctx);for(int team=1;team<=2;team++)value_set_at(ctx,scores,team-1,value_number(ctx,world_team_score(team)));value_set(ctx,result,"teamScores",scores);
    value_set(ctx,result,"deliveries",delivery_state(ctx));
    value_set(ctx,result,"depots",depot_state(ctx));
    value_set(ctx,result,"combat",combat_state(ctx,terrain_version));value_set(ctx,result,"scrapyards",scrapyard_state(ctx,terrain_version));
    value_set(ctx,result,"recentRemovals",removal_state(ctx,0));
    value_set(ctx,result,"radio",radio_state(ctx,-1));
    if(world.supply_seed){Value supply=value_table(ctx);put_number(ctx,supply,"seed",world.supply_seed);put_number(ctx,supply,"nextParcel",world.next_parcel);put_number(ctx,supply,"nextOre",world.next_ore);put_number(ctx,supply,"nextMine",world.next_mine);value_set(ctx,result,"supply",supply);}
    put_number(ctx,result,"terrainVersion",terrain_version);
    Value terrain=value_table(ctx);put_number(ctx,terrain,"radius",WORLD_RADIUS);put_number(ctx,terrain,"waterLevel",WATER_LEVEL);
    value_set(ctx,terrain,"harbor",vector(ctx,(Vector3){112,0,20}));value_set(ctx,terrain,"seaTrial",vector(ctx,(Vector3){125,-2,10}));
    value_set(ctx,terrain,"basin",vector(ctx,(Vector3){46,0,72}));
    if(terrain_version){value_set(ctx,terrain,"foundry",vector(ctx,(Vector3){-47,0,64}));value_set(ctx,terrain,"loadingQuay",vector(ctx,(Vector3){-44,0,110}));}
    if(terrain_version>=2){value_set(ctx,terrain,"mine",vector(ctx,(Vector3){-74,0,-70}));value_set(ctx,terrain,"sump",vector(ctx,(Vector3){-60,-2,-73}));value_set(ctx,terrain,"dispatch",vector(ctx,(Vector3){-74,0,-20}));}
    value_set(ctx,terrain,"eastIsland",vector(ctx,(Vector3){170,4,30}));value_set(ctx,terrain,"westIsland",vector(ctx,(Vector3){-174,2,-35}));value_set(ctx,terrain,"northRidge",vector(ctx,(Vector3){15,6,-175}));value_set(ctx,result,"terrain",terrain);
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];Value item=value_table(ctx);Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);
        put_number(ctx,item,"id",c->id);value_set(ctx,item,"name",value_string(ctx,c->name));put_number(ctx,item,"parts",c->design.count);
        value_set(ctx,item,"anchored",value_bool(ctx,c->design.anchored));
        put_number(ctx,item,"mass",creature_mass(c));
        put_number(ctx,item,"team",c->team);
        put_number(ctx,item,"supply",c->supply);value_set(ctx,item,"parachute",value_bool(ctx,c->parachute));
        value_set(ctx,item,"cargo",value_bool(ctx,c->cargo));value_set(ctx,item,"delivered",value_bool(ctx,c->delivered));put_number(ctx,item,"carrierId",c->carrier);put_number(ctx,item,"carriedBy",c->held_by);put_number(ctx,item,"cargoDelivered",world_cargo_score(c->id));
        if(c->cargo){value_set(ctx,item,"pickup",vector(ctx,c->pickup));put_number(ctx,item,"settled",c->settled);}
        value_set(ctx,item,"magnets",magnet_state(ctx,&c->physics,&c->design));
        value_set(ctx,item,"winches",winch_state(ctx,&c->physics,&c->design));
        put_number(ctx,item,"seconds",c->physics.steps/60.0);put_number(ctx,item,"x",p.x);put_number(ctx,item,"y",p.y);put_number(ctx,item,"z",p.z);
        put_number(ctx,item,"distance",hypot(p.x-c->physics.start.x,p.z-c->physics.start.z));
        b3Vec3 velocity=physics_velocity(&c->physics.parts[0]);put_number(ctx,item,"speed",hypot(velocity.x,velocity.z));
        put_number(ctx,item,"up",Vector3RotateByQuaternion((Vector3){0,1,0},q).y);put_number(ctx,item,"fallenSeconds",c->fallen);
        if(c->error[0])value_set(ctx,item,"controllerError",value_string(ctx,c->error));
        value_set_at(ctx,list,i,item);
    }value_set(ctx,result,"creatures",list);return result;
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
    observation_frame_clear();free(neighbor_bounds);neighbor_bounds=NULL;
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
static int save_data(Data *ctx,Value value,const char *path){return data_write(ctx,value,path);}
static int save_world(Data *ctx,const char *path){
    Value save=world_state(ctx),list=value_get(ctx,save,"creatures");put_number(ctx,save,"version",6);put_number(ctx,save,"nextId",world.next_id);put_number(ctx,save,"installedHz",installed_hz);
    value_set(ctx,save,"format",value_string(ctx,"blockwalker-world"));
    value_set(ctx,save,"designs",world_designs(ctx,1));
    value_set(ctx,save,"removals",removal_state(ctx,1));
    if(installed){value_set(ctx,save,"installed",value_string(ctx,installed));value_set(ctx,save,"name",value_string(ctx,installed_name));}
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];Value item=value_at(ctx,list,i),poses=value_array(ctx);
        value_set(ctx,item,"blueprint",character_data(ctx,&c->design));value_set(ctx,item,"source",value_string(ctx,c->controller->source));
        Value controls=value_table(ctx);for(int j=1;j<128;j++)if(c->controls[j]&&assigned(&c->design,j)){char key[2]={j,0};put_number(ctx,controls,key,c->controls[j]);}value_set(ctx,item,"controls",controls);
        put_number(ctx,item,"hz",c->controller->hz);put_number(ctx,item,"controlStep",c->controller->last_step);put_number(ctx,item,"seed",c->controller->seed);put_number(ctx,item,"rootHeight",c->root_height);put_number(ctx,item,"startX",c->physics.start.x);put_number(ctx,item,"startY",c->physics.start.y);put_number(ctx,item,"startZ",c->physics.start.z);
        size_t length=0;const char *m=controller_memory_lua(c->controller,&length);if(m)value_set(ctx,item,"memory",data_parse(ctx,m,length,"controller memory"));value_text_free(c->controller->ctx,m);
        for(int j=0;j<c->design.count;j++){
            Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,j,&p,&q);b3Vec3 v=physics_velocity(&c->physics.parts[j]),a=b3Body_GetAngularVelocity(c->physics.parts[j].body);
            double values[]={p.x,p.y,p.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,a.x,a.y,a.z};Value pose=value_array(ctx);
            for(int k=0;k<13;k++)value_set_at(ctx,pose,k,value_number(ctx,values[k]));value_set_at(ctx,poses,j,pose);
        }value_set(ctx,item,"poses",poses);
        Value magnets=value_get(ctx,item,"magnets");
        for(int j=0;j<c->design.count;j++)if(c->design.blocks[j].joint==BLOCK_MAGNET){
            PhysicsPart *part=&c->physics.parts[j];Value magnet=value_at(ctx,magnets,j);
            if(get_number(ctx,magnet,"creature",0)){
                Creature *owner=body_owner(part->magnet_target);int index=magnet_index(part,owner);assert(index>=0);b3Vec3 local=b3InvTransformPoint(owner->physics.parts[index].frame,part->magnet_local);
                value_set(ctx,magnet,"local",vector(ctx,(Vector3){local.x,local.y,local.z}));
            }value_free(ctx,magnet);
        }value_free(ctx,magnets);value_free(ctx,item);
    }int good=save_data(ctx,save,path);value_free(ctx,list);value_free(ctx,save);return good;
}
int world_save(Data *ctx){return save_world(ctx,"/workspace/blockwalker-world.lua");}
static void empty_sequence(Data *ctx,Value object,const char *field){
    Value v=value_get(ctx,object,field);if(v.type==DATA_TABLE){value_push(ctx,v);lua_pushnil(ctx->lua);int nonempty=lua_next(ctx->lua,-2);lua_pop(ctx->lua,nonempty?3:1);if(!nonempty)value_set(ctx,object,field,value_array(ctx));}value_free(ctx,v);
}
static Value read_data(Data *ctx,const char *path){
    Value data=data_read(ctx,path);if(value_is_error(data)){value_free(ctx,data);return legacy_read(ctx,path);}
    if(value_is_table(data)){
        const char *lists[]={"creatures","designs","removals","recentRemovals","deliveries","radio"};for(int i=0;i<6;i++)empty_sequence(ctx,data,lists[i]);
        Value list=value_get(ctx,data,"creatures");for(int i=0;i<value_length(ctx,list);i++){Value item=value_at(ctx,list,i);empty_sequence(ctx,item,"magnets");empty_sequence(ctx,item,"winches");value_free(ctx,item);}value_free(ctx,list);
    }return data;
}
static char *read_program(const char *path){
    FILE *f=fopen(path,"rb");if(!f)return NULL;fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);if(n<0||n>1024*1024){fclose(f);return NULL;}
    char *text=malloc(n+1);if(text){size_t bytes=fread(text,1,n,f);text[bytes]=0;}fclose(f);return text;
}
static void catalog_programs(Data *ctx,Value list){
    for(int i=0;i<value_length(ctx,list);i++){
        Value item=value_at(ctx,list,i),program=value_get(ctx,item,"program");const char *name=value_text(ctx,program);char path[512];
        if(name&&!strncmp(name,"programs/",9)&&!strstr(name,"..")){snprintf(path,sizeof(path),"/usr/src/dolly/blockwalker/%s",name);char *text=read_program(path);if(text){value_set(ctx,item,"source",value_string(ctx,text));free(text);}}
        value_text_free(ctx,name);value_free(ctx,program);value_free(ctx,item);
    }
}
static Value read_catalog(Data *ctx){
    Value catalog=read_data(ctx,"/usr/src/dolly/blockwalker/designs.lua"),format=value_get(ctx,catalog,"format");const char *name=value_text(ctx,format);
    int valid=name&&!strcmp(name,"blockwalker-catalog")&&get_number(ctx,catalog,"version",0)==1;value_text_free(ctx,name);value_free(ctx,format);
    Value list=valid?value_get(ctx,catalog,"designs"):VALUE_ERROR;value_free(ctx,catalog);if(value_is_array(list))catalog_programs(ctx,list);return list;
}
static void migrate_memory_keys(Data *ctx,Value memory){
    if(!value_is_table(memory))return;lua_State *L=ctx->lua;value_push(ctx,memory);int table=lua_gettop(L);lua_newtable(L);int moves=lua_gettop(L);lua_pushnil(L);
    while(lua_next(L,table)){
        lua_pushvalue(L,-1);Value child=value_take(ctx);migrate_memory_keys(ctx,child);value_free(ctx,child);
        if(lua_type(L,-2)==LUA_TSTRING){const char *s=lua_tostring(L,-2);char *end;long n=strtol(s,&end,10);
            if(*s&&!*end&&n>=0&&n<INT32_MAX){lua_pushvalue(L,-2);lua_pushinteger(L,n+1);lua_rawset(L,moves);}}
        lua_pop(L,1);
    }
    lua_pushnil(L);while(lua_next(L,moves)){
        lua_pushvalue(L,-2);lua_rawget(L,table);lua_pushvalue(L,-2);lua_pushvalue(L,-2);lua_rawset(L,table);lua_pop(L,1);
        lua_pushvalue(L,-2);lua_pushnil(L);lua_rawset(L,table);lua_pop(L,1);
    }lua_pop(L,2);
}
static int migrate_program(Data *ctx,Value item,const char *key,Value translations){
    Value code=value_get(ctx,item,key);if(!value_is_string(code)){value_free(ctx,code);return 1;}const char *source=value_text(ctx,code);
    Value converted=value_get(ctx,translations,source);value_text_free(ctx,source);value_free(ctx,code);
    if(!value_is_string(converted)){value_free(ctx,converted);return 0;}value_set(ctx,item,key,converted);return 1;
}
static int migrate_data(Data *ctx,Value save){
    Value format=value_get(ctx,save,"format");const char *kind=value_text(ctx,format);int design=kind&&!strcmp(kind,"blockwalker-design");value_text_free(ctx,kind);value_free(ctx,format);
    int version=get_number(ctx,save,"version",0);if(version>=(design?5:6))return 1;
    Value translations=data_read(ctx,"/usr/src/dolly/blockwalker/legacy-programs.lua");int good=1;
    if(design){good=migrate_program(ctx,save,"source",translations);put_number(ctx,save,"hz",CONTROLLER_DEFAULT_HZ);}
    else{
        const char *fields[]={"creatures","designs"};good=migrate_program(ctx,save,"installed",translations);put_number(ctx,save,"installedHz",CONTROLLER_DEFAULT_HZ);
        for(int group=0;group<2;group++){
            Value list=value_get(ctx,save,fields[group]);for(int i=0;i<value_length(ctx,list);i++){
                Value item=value_at(ctx,list,i);put_number(ctx,item,"hz",CONTROLLER_DEFAULT_HZ);if(!migrate_program(ctx,item,"source",translations)){Value label=value_get(ctx,item,"name");const char *name=value_text(ctx,label);value_error(ctx,"No verified Lua translation for %s. Original world kept.",name?name:"unnamed program");value_text_free(ctx,name);value_free(ctx,label);good=0;}
                if(group==0){Value memory=value_get(ctx,item,"memory");const char *text=value_text(ctx,memory);if(text){Value parsed=legacy_parse(ctx,text,strlen(text),"legacy controller memory");if(value_is_error(parsed))good=0;else {migrate_memory_keys(ctx,parsed);value_set(ctx,item,"memory",parsed);}}value_text_free(ctx,text);value_free(ctx,memory);}value_free(ctx,item);
            }value_free(ctx,list);
        }
    }value_free(ctx,translations);return good;
}
static int read_design(Data *ctx,Value item,Character *design,int require_program,int legacy){
    Value blueprint=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source"),name=value_get(ctx,item,"name"),anchored=value_get(ctx,item,"anchored");
    int empty=!require_program&&value_is_array(blueprint)&&get_number(ctx,blueprint,"length",-1)==0;
    int valid=value_is_array(blueprint)&&(empty||read_character(ctx,blueprint,design,legacy))&&value_is_string(name)&&value_is_bool(anchored);
    if(valid)design->anchored=value_truth(ctx,anchored);
    double hz=get_number(ctx,item,"hz",0);valid=valid&&valid_controller_hz(hz);
    size_t bytes=0;const char *label=value_is_string(name)?value_text_n(ctx,&bytes,name):NULL;
    valid=valid&&label&&bytes>0&&bytes<64&&strlen(label)==bytes;value_text_free(ctx,label);
    if(value_is_string(code)){
        const char *source=value_text_n(ctx,&bytes,code);Controller *probe=valid&&source&&strlen(source)==bytes?controller_new(source,1,hz):NULL;
        valid=valid&&probe;controller_free(probe);value_text_free(ctx,source);
    }else valid=valid&&!require_program&&value_is_null(code);
    value_free(ctx,blueprint);value_free(ctx,code);value_free(ctx,name);value_free(ctx,anchored);return valid;
}
int world_export_design(Data *ctx,const Character *design,int sea,const char *path){
    Value item=value_table(ctx);value_set(ctx,item,"format",value_string(ctx,"blockwalker-design"));put_number(ctx,item,"version",5);
    value_set(ctx,item,"blueprint",character_data(ctx,design));value_set(ctx,item,"anchored",value_bool(ctx,design->anchored));
    value_set(ctx,item,"name",value_string(ctx,installed?installed_name:"Workshop build"));
    value_set(ctx,item,"source",installed?value_string(ctx,installed):VALUE_NULL);put_number(ctx,item,"hz",installed_hz);value_set(ctx,item,"sea",value_bool(ctx,sea));
    int good=save_data(ctx,item,path);value_free(ctx,item);return good;
}
Value world_import_design(Data *ctx,Character *design,int *sea,const char *path){
    Value item=read_data(ctx,path),result=VALUE_NIL;Character next={0};int water=0,valid=0;
    if(value_is_table(item)&&!migrate_data(ctx,item)){value_free(ctx,item);return value_error(ctx,"This legacy program has no verified Lua conversion. Original design kept.");}
    if(value_is_nil(item))valid=character_load(&next,path);
    else{
        Value format=value_get(ctx,item,"format"),surface=value_get(ctx,item,"sea");const char *kind=value_text(ctx,format);
        valid=kind&&!strcmp(kind,"blockwalker-design")&&(get_number(ctx,item,"version",0)>=1&&get_number(ctx,item,"version",0)<=5&&floor(get_number(ctx,item,"version",0))==get_number(ctx,item,"version",0))&&value_is_bool(surface)&&read_design(ctx,item,&next,0,get_number(ctx,item,"version",0)==1);
        water=value_truth(ctx,surface);value_text_free(ctx,kind);value_free(ctx,format);value_free(ctx,surface);
    }
    if(!valid)result=value_error(ctx,"Invalid design file. Import an exported design or a legacy .character blueprint.");
    else{
        Value code=value_is_table(item)?value_get(ctx,item,"source"):VALUE_NULL;
        if(value_is_string(code))result=world_install(ctx,item);
        else{world_trial_stop();free(installed);installed=NULL;installed_hz=CONTROLLER_DEFAULT_HZ;snprintf(installed_name,sizeof(installed_name),"Workshop build");}
        value_free(ctx,code);
        if(!value_is_error(result)){character_clear(design);*design=next;next=(Character){0};*sea=water;}
    }
    character_clear(&next);value_free(ctx,item);return result;
}
static void load_designs_version(Data *ctx,Value list,int populate,int legacy){
    if(!value_is_array(list))return;
    for(int i=0;i<get_number(ctx,list,"length",0);i++){
        Value item=value_at(ctx,list,i),blueprint=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source"),label=value_get(ctx,item,"name");Character c={0};
        if((value_is_string(code)||(!populate&&value_is_null(code)))&&value_is_string(label)&&read_character(ctx,blueprint,&c,legacy)){
            Value anchored=value_get(ctx,item,"anchored");c.anchored=value_truth(ctx,anchored);value_free(ctx,anchored);
            const char *source=value_is_string(code)?value_text(ctx,code):NULL,*name=value_text(ctx,label);int hz=get_number(ctx,item,"hz",CONTROLLER_DEFAULT_HZ);float x=get_number(ctx,item,"x",0),z=get_number(ctx,item,"z",0);
            Value height=value_get(ctx,item,"y");int elevated=!value_is_nil(height);float y=get_number(ctx,item,"y",NAN);value_free(ctx,height);
            Controller *probe=source&&valid_controller_hz(hz)?controller_new(source,1,hz):NULL;
            if((probe||(!populate&&!source))&&isfinite(x)&&isfinite(z)&&(!elevated||(isfinite(y)&&y>=-12&&y<=128))){
                x=Clamp(x,-248,248);z=Clamp(z,-248,248);remember_design(&c,source,name,hz,x,z);
                if(populate){Creature *born=spawn(&c,source,name,i+1,hz,x,z);if(born){int team=get_number(ctx,item,"team",0);born->team=team==1||team==2?team:0;Value cargo=value_get(ctx,item,"cargo");if(value_is_bool(cargo))born->cargo=value_truth(ctx,cargo);value_free(ctx,cargo);if(elevated)set_spawn_height(born,y);}}
            }controller_free(probe);value_text_free(ctx,source);value_text_free(ctx,name);
        }character_clear(&c);value_free(ctx,item);value_free(ctx,blueprint);value_free(ctx,code);value_free(ctx,label);
    }
}
static void load_designs(Data *ctx,Value list,int populate){load_designs_version(ctx,list,populate,0);}
static void load_removals(Data *ctx,Value list){
    if(!value_is_array(list))return;
    for(int i=0;i<get_number(ctx,list,"length",0);i++){
        Value item=value_at(ctx,list,i);if(!value_is_table(item)){value_free(ctx,item);continue;}
        Value kind=value_get(ctx,item,"cause"),name=value_get(ctx,item,"name"),detail=value_get(ctx,item,"detail");
        if(value_is_string(kind)&&value_is_string(name)&&value_is_string(detail)){
            const char *k=value_text(ctx,kind),*n=value_text(ctx,name),*d=value_text(ctx,detail);int cause=0;while(cause<REMOVAL_CAUSES&&strcmp(k,removal_causes[cause]))cause++;
            double id=get_number(ctx,item,"id",0),time=get_number(ctx,item,"time",0),age=get_number(ctx,item,"seconds",0);
            if(cause<REMOVAL_CAUSES&&id>=1&&id<=INT32_MAX&&id==floor(id)&&isfinite(time)&&isfinite(age)){
                Removal *r=new_removal();r->id=id;r->cause=cause;r->time=time;r->seconds=age;snprintf(r->name,sizeof(r->name),"%s",n);snprintf(r->detail,sizeof(r->detail),"%s",d);
                const char *fields[]={"x","y","z","up"};float *values[]={&r->position.x,&r->position.y,&r->position.z,&r->up};
                for(int j=0;j<4;j++){Value v=value_get(ctx,item,fields[j]);double value=NAN;if(!value_is_null(v))value_double(ctx,&value,v);*values[j]=value;value_free(ctx,v);}
            }value_text_free(ctx,k);value_text_free(ctx,n);value_text_free(ctx,d);
        }value_free(ctx,kind);value_free(ctx,name);value_free(ctx,detail);value_free(ctx,item);
    }
}
static void restore_world(Data *ctx,Value save,int fresh){
    int legacy=value_is_table(save)&&get_number(ctx,save,"version",0)==1;
    terrain_select(value_is_table(save)?get_number(ctx,save,"terrainVersion",0):fresh?8:0);
    if(value_is_table(save)){Value designs=value_get(ctx,save,"designs");load_designs_version(ctx,designs,0,legacy);value_free(ctx,designs);}
    Value examples=read_catalog(ctx);load_designs(ctx,examples,fresh);value_free(ctx,examples);
    if(fresh){world.supply_seed=0x243f6a88;world.next_parcel=45;world.next_ore=5;world.next_mine=10;}
    if(fresh)world_save(ctx);
    if(!value_is_table(save)){value_free(ctx,save);return;}
    if(!legacy&&get_number(ctx,save,"version",0)!=2&&get_number(ctx,save,"version",0)!=3&&get_number(ctx,save,"version",0)!=4&&get_number(ctx,save,"version",0)!=5&&get_number(ctx,save,"version",0)!=6){value_free(ctx,save);return;}
    Value removals=value_get(ctx,save,"removals");load_removals(ctx,removals);value_free(ctx,removals);
    Value deliveries=value_get(ctx,save,"deliveries");
    for(int i=0;value_is_array(deliveries)&&i<get_number(ctx,deliveries,"length",0);i++){
        Value item=value_at(ctx,deliveries,i),label=value_get(ctx,item,"name");
        int cargo=get_number(ctx,item,"cargoId",0),carrier=get_number(ctx,item,"carrierId",0),depot=get_number(ctx,item,"depot",-1);double time=get_number(ctx,item,"time",NAN);
        if(cargo>0&&(carrier>0||carrier==-1)&&depot>=0&&depot<depot_count&&isfinite(time)&&value_is_string(label)){
            int duplicate=0;for(int j=0;j<world.delivery_count;j++)duplicate|=world.deliveries[j].cargo==cargo;
            if(!duplicate){const char *name=value_text(ctx,label);Delivery *d=new_delivery();*d=(Delivery){.cargo=cargo,.carrier=carrier,.depot=depot,.time=time,.points=get_number(ctx,item,"points",1)};snprintf(d->name,sizeof(d->name),"%s",name);value_text_free(ctx,name);}
        }value_free(ctx,label);value_free(ctx,item);
    }value_free(ctx,deliveries);
    int hz=get_number(ctx,save,"installedHz",CONTROLLER_DEFAULT_HZ);installed_hz=valid_controller_hz(hz)?hz:CONTROLLER_DEFAULT_HZ;
    Value code=value_get(ctx,save,"installed"),label=value_get(ctx,save,"name");
    if(value_is_string(code)){const char *s=value_text(ctx,code),*name=value_text(ctx,label);installed=strdup(s);snprintf(installed_name,sizeof(installed_name),"%s",name);value_text_free(ctx,s);value_text_free(ctx,name);}
    value_free(ctx,code);value_free(ctx,label);Value list=value_get(ctx,save,"creatures");int count=get_number(ctx,list,"length",0);
    for(int i=0;i<count;i++){
        Value item=value_at(ctx,list,i),blueprint=value_get(ctx,item,"blueprint");Character c={0};
        if(read_character(ctx,blueprint,&c,legacy)){
            Value anchored=value_get(ctx,item,"anchored");c.anchored=value_truth(ctx,anchored);value_free(ctx,anchored);
            Value code=value_get(ctx,item,"source"),label=value_get(ctx,item,"name");const char *s=value_text(ctx,code),*name=value_text(ctx,label);
            int hz=get_number(ctx,item,"hz",CONTROLLER_DEFAULT_HZ);if(!valid_controller_hz(hz))hz=CONTROLLER_DEFAULT_HZ;
            Creature *creature=s?spawn(&c,s,name?name:"Creature",get_number(ctx,item,"seed",1),hz,0,0):NULL;
            if(creature){
                int team=get_number(ctx,item,"team",0);creature->team=team==1||team==2?team:0;
                Value error=value_get(ctx,item,"controllerError");const char *message=value_is_string(error)?value_text(ctx,error):NULL;
                if(message)snprintf(creature->error,sizeof(creature->error),"%s",message);value_text_free(ctx,message);value_free(ctx,error);
                int supply=get_number(ctx,item,"supply",0);creature->supply=supply>=1&&supply<=3?supply:0;Value parachute=value_get(ctx,item,"parachute");creature->parachute=value_truth(ctx,parachute);value_free(ctx,parachute);
                Value cargo=value_get(ctx,item,"cargo");if(value_is_bool(cargo))creature->cargo=value_truth(ctx,cargo);value_free(ctx,cargo);
                creature->id=get_number(ctx,item,"id",creature->id);creature->physics.steps=llround(get_number(ctx,item,"seconds",0)*60);creature->root_height=get_number(ctx,item,"rootHeight",1);creature->fallen=get_number(ctx,item,"fallenSeconds",0);creature->physics.start.x=get_number(ctx,item,"startX",creature->physics.start.x);creature->physics.start.y=get_number(ctx,item,"startY",creature->physics.start.y);creature->physics.start.z=get_number(ctx,item,"startZ",creature->physics.start.z);
                int period=60/hz,last=creature->physics.steps?(creature->physics.steps-1)/period*period:-1;
                creature->controller->last_step=get_number(ctx,item,"controlStep",last);
                if(creature->controller->last_step< -1||creature->controller->last_step>=creature->physics.steps)creature->controller->last_step=last;
                creature->carrier=get_number(ctx,item,"carrierId",0);creature->held_by=get_number(ctx,item,"carriedBy",0);creature->settled=get_number(ctx,item,"settled",0);
                Value pickup=value_get(ctx,item,"pickup");
                if(value_is_array(pickup))for(int j=0;j<3;j++){Value value=value_at(ctx,pickup,j);double v=0;value_double(ctx,&v,value);((float *)&creature->pickup)[j]=isfinite(v)?v:0;value_free(ctx,value);}value_free(ctx,pickup);
                for(int j=0;j<world.delivery_count;j++)if(world.deliveries[j].cargo==creature->id){creature->delivered=1;for(int k=0;k<creature->design.count;k++)creature->design.blocks[k].color=0;}
                Value memory=value_get(ctx,item,"memory");
                if(value_is_table(memory)){Value value=data_clone(creature->controller->ctx,ctx,memory);if(!value_is_error(value)){value_free(creature->controller->ctx,creature->controller->memory);creature->controller->memory=value;}}value_free(ctx,memory);
                Value poses=value_get(ctx,item,"poses");int saved_count=legacy?get_number(ctx,blueprint,"length",0):c.count;
                PhysicsPose *restored=array_resize(NULL,c.count,sizeof(*restored));
                for(int j=0;j<c.count;j++)restored[j]=(PhysicsPose){.transform=physics_transform(&creature->physics.parts[j])};
                for(int j=0;j<saved_count;j++){
                    Value pose=value_at(ctx,poses,j);double p[13]={0};p[6]=1;int valid=1;
                    for(int k=0;k<13;k++){Value v=value_at(ctx,pose,k);if(value_double(ctx,&p[k],v)<0||!isfinite(p[k]))valid=0;value_free(ctx,v);}value_free(ctx,pose);
                    if(valid)restored[j]=(PhysicsPose){.transform={{p[0],p[1],p[2]},{{p[3],p[4],p[5]},p[6]}},.velocity={p[7],p[8],p[9]},.angular={p[10],p[11],p[12]}};
                }
                if(legacy)for(int j=saved_count;j<c.count;j++){
                    Block block=c.blocks[j],parent=c.blocks[block.parent];PhysicsPose a=restored[block.parent];b3Vec3 offset={block.x-parent.x,block.y-parent.y,block.z-parent.z};
                    restored[j]=a;restored[j].transform.p=b3TransformWorldPoint(a.transform,offset);restored[j].velocity=b3Add(a.velocity,b3Cross(a.angular,b3RotateVector(a.transform.q,offset)));
                }
                int steps=creature->physics.steps;Vector3 start=creature->physics.start;
                physics_attach_poses(&creature->physics,&creature->design,world.physics,0,0,1,restored,get_number(ctx,save,"version",0)<4);
                Value winches=value_get(ctx,item,"winches");
                for(int j=0;j<c.count;j++)if(c.blocks[j].joint==BLOCK_WINCH){
                    Value state=value_at(ctx,winches,j);PhysicsPart *part=&creature->physics.parts[j];
                    part->winch_length=Clamp(get_number(ctx,state,"paidOut",part->winch_length),1,c.blocks[j].travel);
                    if(b3Joint_IsValid(part->joint))b3DistanceJoint_SetLengthRange(part->joint,.005f,part->winch_length);
                    value_free(ctx,state);
                }value_free(ctx,winches);
                creature->physics.steps=steps;creature->physics.start=start;free(restored);value_free(ctx,poses);physics_refresh(&creature->physics,&creature->design);
                Value controls=value_get(ctx,item,"controls");
                if(value_is_table(controls))for(int j=1;j<128;j++)if(assigned(&creature->design,j)){char key[2]={j,0};double value=get_number(ctx,controls,key,0);creature->controls[j]=isfinite(value)?Clamp(value,0,1):0;}value_free(ctx,controls);if(creature->error[0])memset(creature->controls,0,sizeof(creature->controls));
                if(!creature->cargo&&creature->id!=get_number(ctx,save,"playerId",0))remember_design(&c,s,creature->name,hz,creature->physics.start.x,creature->physics.start.z);
            }value_text_free(ctx,s);value_text_free(ctx,name);value_free(ctx,code);value_free(ctx,label);
        }character_clear(&c);value_free(ctx,blueprint);value_free(ctx,item);
    }
    for(int i=0;i<count;i++){
        Value item=value_at(ctx,list,i),magnets=value_get(ctx,item,"magnets");int id=get_number(ctx,item,"id",0);
        if(!value_is_array(magnets)){value_free(ctx,magnets);value_free(ctx,item);continue;}
        for(int j=0;j<world.count;j++)if(world.creatures[j].id==id){
            Creature *creature=&world.creatures[j];
            for(int k=0;k<creature->design.count;k++)if(creature->design.blocks[k].joint==BLOCK_MAGNET){
                PhysicsPart *part=&creature->physics.parts[k];Value magnet=value_at(ctx,magnets,k);if(!value_is_table(magnet)){value_free(ctx,magnet);continue;}double power=get_number(ctx,magnet,"power",0);
                part->magnet_power=isfinite(power)?Clamp(power,0,1):0;int target=get_number(ctx,magnet,"creature",0),index=get_number(ctx,magnet,"part",-1);
                Value local=value_get(ctx,magnet,"local");double p[3];int valid=target>0&&index>=0&&value_is_array(local);
                for(int n=0;valid&&n<3;n++){Value v=value_at(ctx,local,n);if(value_double(ctx,&p[n],v)<0||!isfinite(p[n]))valid=0;value_free(ctx,v);}
                if(valid)for(int n=0;n<world.count;n++)if(world.creatures[n].id==target&&index>=0&&index<world.creatures[n].design.count&&n!=j){
                    PhysicsPart *target_part=&world.creatures[n].physics.parts[index];part->magnet_target=target_part->body;part->magnet_shape=target_part->shape;part->magnet_local=b3TransformPoint(target_part->frame,(b3Vec3){p[0],p[1],p[2]});
                    double load=get_number(ctx,magnet,"load",0);part->magnet_load=isfinite(load)?Clamp(load,0,creature->design.blocks[k].force*part->magnet_power):0;
                }value_free(ctx,local);value_free(ctx,magnet);
            }
        }value_free(ctx,magnets);value_free(ctx,item);
    }
    world.deaths=get_number(ctx,save,"deaths",0);world.age=get_number(ctx,save,"seconds",0);int next_id=get_number(ctx,save,"nextId",0);if(next_id>0&&!world.next_id)world.physics=physics_world(1);world.next_id=fmax(world.next_id,next_id);
    Value supply=value_get(ctx,save,"supply");if(value_is_table(supply)){world.supply_seed=get_number(ctx,supply,"seed",0);world.next_parcel=get_number(ctx,supply,"nextParcel",world.age);world.next_ore=get_number(ctx,supply,"nextOre",world.age);world.next_mine=get_number(ctx,supply,"nextMine",world.age+10);}value_free(ctx,supply);
    Value radio=value_get(ctx,save,"radio");
    for(int i=0;value_is_array(radio)&&i<get_number(ctx,radio,"length",0)&&world.radio_count<RADIO_CAPACITY;i++){
        Value item=value_at(ctx,radio,i),label=value_get(ctx,item,"name");RadioMessage message={0};
        if(radio_output(ctx,item,&message.kind,&message.target)&&value_is_string(label)){
            message.team=get_number(ctx,item,"team",0);message.from=get_number(ctx,item,"from",0);message.time=get_number(ctx,item,"time",NAN);message.mass=get_number(ctx,item,"mass",NAN);
            message.position=(Vector3){get_number(ctx,item,"x",NAN),get_number(ctx,item,"y",NAN),get_number(ctx,item,"z",NAN)};
            if((message.team==1||message.team==2)&&message.from>0&&isfinite(message.time)&&isfinite(message.mass)&&isfinite(message.position.x)&&isfinite(message.position.y)&&isfinite(message.position.z)){
                const char *name=value_text(ctx,label);snprintf(message.name,sizeof(message.name),"%s",name);value_text_free(ctx,name);world.radio[world.radio_count++]=message;
            }
        }value_free(ctx,item);value_free(ctx,label);
    }value_free(ctx,radio);
    int player=get_number(ctx,save,"playerId",0);world.player=world_find(player)?player:0;
    for(int i=0;i<world.count;i++)world.creatures[i].physics.time=world.age;
    for(int i=0;i<world.count;i++){
        Creature *target=&world.creatures[i];int holder=0;target->magnet_count=0;
        for(int j=0;j<world.count;j++){
            Creature *candidate=&world.creatures[j];
            for(int k=0;k<candidate->design.count;k++){
                b3BodyId body=candidate->physics.parts[k].magnet_target;
                if(b3Body_IsValid(body)&&b3Body_GetUserData(body)==target->physics.parts){target->magnet_count++;if(!holder)holder=candidate->id;}
            }
        }
        if(holder)target->held_by=holder;else if(!target->cargo||!world_find(target->held_by))target->held_by=0;
    }
    value_free(ctx,list);value_free(ctx,save);
}
void world_load(Data *ctx){
    const char *path="/workspace/blockwalker-world.lua";int fresh=access(path,F_OK)<0&&errno==ENOENT;
    if(fresh&&access("/workspace/blockwalker-world.json",F_OK)==0){path="/workspace/blockwalker-world.json";fresh=0;}
    Value save=read_data(ctx,path);if(!fresh&&(!value_is_table(save)||!migrate_data(ctx,save))){fprintf(stderr,"World could not be converted: %s. Original file kept at %s.\n",ctx->error,path);exit(1);}
    Value creatures=value_get(ctx,save,"creatures");int count=value_length(ctx,creatures);value_free(ctx,creatures);
    restore_world(ctx,save,fresh);
    if(!fresh&&world.count!=count){fprintf(stderr,"Could not restore every character; original world kept at %s.\n",path);exit(1);}
    if(!fresh&&!strcmp(path,"/workspace/blockwalker-world.json")){
        if(!world_save(ctx)){fprintf(stderr,"Could not save converted world; original kept at %s.\n",path);exit(1);}printf("Converted world to Lua. Original kept at %s.\n",path);
    }
}

enum {IMPORT_INTEGER=1,IMPORT_OPTIONAL=2,IMPORT_NULLABLE=4};
static int import_number(Data *ctx,Value object,const char *key,double low,double high,int flags){
    Value value=value_get(ctx,object,key);double n=NAN;int valid=0;
    if(value_is_number(value)){value_double(ctx,&n,value);valid=isfinite(n)&&n>=low&&n<=high&&(!(flags&IMPORT_INTEGER)||n==floor(n));}
    else valid=((flags&IMPORT_OPTIONAL)&&value_is_nil(value))||((flags&IMPORT_NULLABLE)&&value_is_null(value));
    value_free(ctx,value);return valid;
}
static int import_vector(Data *ctx,Value list,int length,int pose){
    if(!value_is_array(list)||get_number(ctx,list,"length",0)!=length)return 0;
    double norm=0;int valid=1;
    for(int i=0;i<length;i++){Value v=value_at(ctx,list,i);double n=NAN;if(value_is_number(v))value_double(ctx,&n,v);valid=valid&&isfinite(n)&&fabs(n)<=FLT_MAX;if(pose&&i>=3&&i<=6)norm+=n*n;value_free(ctx,v);}
    return valid&&(!pose||(norm>.99&&norm<1.01));
}
static int import_string(Data *ctx,Value object,const char *key,size_t limit){
    Value value=value_get(ctx,object,key);size_t length=0;const char *text=value_is_string(value)?value_text_n(ctx,&length,value):NULL;
    int valid=text&&length<limit&&strlen(text)==length;value_text_free(ctx,text);value_free(ctx,value);return valid;
}
static int import_world_valid(Data *ctx,Value save){
    if(!value_is_table(save)||value_is_array(save))return 0;
    Value list=value_get(ctx,save,"creatures"),designs=value_get(ctx,save,"designs"),removals=value_get(ctx,save,"removals"),deliveries=value_get(ctx,save,"deliveries"),ids=value_table(ctx),delivered=value_table(ctx),format=value_get(ctx,save,"format");
    const char *kind=value_is_string(format)?value_text(ctx,format):NULL;
    int legacy=get_number(ctx,save,"version",0)==1;
    int valid=value_is_table(save)&&import_number(ctx,save,"version",1,6,IMPORT_INTEGER)&&import_number(ctx,save,"terrainVersion",0,8,IMPORT_INTEGER|IMPORT_OPTIONAL)&&
        (value_is_nil(format)||(kind&&!strcmp(kind,"blockwalker-world")))&&value_is_array(list)&&value_is_array(designs)&&value_is_array(removals)&&(value_is_nil(deliveries)||value_is_array(deliveries))&&
        import_number(ctx,save,"seconds",0,INT32_MAX/60.,0)&&import_number(ctx,save,"deaths",0,INT32_MAX,IMPORT_INTEGER)&&import_number(ctx,save,"nextId",0,INT32_MAX,IMPORT_INTEGER)&&import_number(ctx,save,"playerId",0,INT32_MAX,IMPORT_INTEGER|IMPORT_OPTIONAL);
    value_text_free(ctx,kind);value_free(ctx,format);int greatest=0,count=get_number(ctx,list,"length",0);
    for(int i=0;valid&&i<count;i++){
        Value item=value_at(ctx,list,i);Character c={0};
        valid=read_design(ctx,item,&c,1,legacy)&&import_number(ctx,item,"id",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"seconds",0,(INT32_MAX-1)/60.,0)&&import_number(ctx,item,"seed",0,UINT32_MAX,IMPORT_INTEGER);
        int id=valid?get_number(ctx,item,"id",0):0;Value previous=value_at(ctx,ids,id);valid=valid&&value_is_nil(previous);value_free(ctx,previous);
        if(valid){value_set_at(ctx,ids,id,value_number(ctx,c.count));if(id>greatest)greatest=id;}
        const char *fields[]={"rootHeight","fallenSeconds","startX","startY","startZ","settled"};
        for(int k=0;k<6;k++)valid=valid&&import_number(ctx,item,fields[k],-FLT_MAX,FLT_MAX,IMPORT_OPTIONAL);
        valid=valid&&import_number(ctx,item,"carrierId",-1,INT32_MAX,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"carriedBy",0,INT32_MAX,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"controlStep",-1,fmax(-1,round(get_number(ctx,item,"seconds",0)*60)-1),IMPORT_INTEGER|IMPORT_OPTIONAL);
        Value error=value_get(ctx,item,"controllerError");valid=valid&&(value_is_nil(error)||import_string(ctx,item,"controllerError",160));value_free(ctx,error);
        Value poses=value_get(ctx,item,"poses"),memory=value_get(ctx,item,"memory"),controls=value_get(ctx,item,"controls"),pickup=value_get(ctx,item,"pickup"),cargo=value_get(ctx,item,"cargo");
        valid=valid&&(value_is_nil(cargo)||value_is_bool(cargo))&&import_number(ctx,item,"team",0,2,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"supply",0,3,IMPORT_INTEGER|IMPORT_OPTIONAL);
        Value parachute=value_get(ctx,item,"parachute");valid=valid&&(value_is_nil(parachute)||value_is_bool(parachute));
        if(get_number(ctx,item,"supply",0)||value_truth(ctx,parachute))valid=valid&&value_truth(ctx,cargo);value_free(ctx,parachute);value_free(ctx,cargo);
        Value blueprint=value_get(ctx,item,"blueprint");int pose_count=legacy?get_number(ctx,blueprint,"length",0):c.count;value_free(ctx,blueprint);
        valid=valid&&value_is_array(poses)&&get_number(ctx,poses,"length",0)==pose_count&&value_is_table(memory)&&(value_is_nil(controls)||value_is_table(controls))&&(value_is_nil(pickup)||import_vector(ctx,pickup,3,0));
        for(int k=0;valid&&k<pose_count;k++){Value p=value_at(ctx,poses,k);valid=import_vector(ctx,p,13,1);value_free(ctx,p);}
        Value winches=value_get(ctx,item,"winches");int version=get_number(ctx,save,"version",0);
        valid=valid&&(version<5?value_is_nil(winches):value_is_array(winches)&&get_number(ctx,winches,"length",0)<=c.count);
        for(int k=0;valid&&k<c.count;k++){
            if(c.blocks[k].joint==BLOCK_WINCH){
                Value state=value_at(ctx,winches,k);
                valid=version>=5&&value_is_table(state)&&import_number(ctx,state,"paidOut",1,c.blocks[k].travel,0);
                value_free(ctx,state);
            }else if(value_is_array(winches)){
                Value state=value_at(ctx,winches,k);valid=value_is_nil(state)||value_is_null(state);value_free(ctx,state);
            }
        }value_free(ctx,winches);
        for(int k=1;valid&&k<128&&!value_is_nil(controls);k++){char key[2]={k,0};valid=import_number(ctx,controls,key,0,1,IMPORT_OPTIONAL);}
        value_free(ctx,poses);value_free(ctx,memory);value_free(ctx,controls);value_free(ctx,pickup);character_clear(&c);value_free(ctx,item);
    }
    for(int i=0;valid&&i<count;i++){
        Value item=value_at(ctx,list,i),magnets=value_get(ctx,item,"magnets"),blueprint=value_get(ctx,item,"blueprint");int parts=get_number(ctx,blueprint,"length",0);valid=value_is_array(magnets)&&get_number(ctx,magnets,"length",0)<=parts;
        for(int j=0;valid&&j<parts;j++){
            Value block=value_at(ctx,blueprint,j);int magnet=get_number(ctx,block,"joint",0)==BLOCK_MAGNET;value_free(ctx,block);if(!magnet)continue;
            Value m=value_at(ctx,magnets,j),local=value_get(ctx,m,"local");
            valid=value_is_table(m)&&import_number(ctx,m,"power",0,1,0)&&import_number(ctx,m,"load",0,FLT_MAX,IMPORT_OPTIONAL)&&import_number(ctx,m,"creature",1,INT32_MAX-1,IMPORT_INTEGER|IMPORT_OPTIONAL);
            int target=valid?get_number(ctx,m,"creature",0):0;
            if(target){Value target_parts=value_at(ctx,ids,target);int n=0;value_int(ctx,&n,target_parts);value_free(ctx,target_parts);valid=valid&&target!=get_number(ctx,item,"id",0)&&import_number(ctx,m,"part",0,n-1,IMPORT_INTEGER)&&import_vector(ctx,local,3,0);}
            else{Value attached=value_get(ctx,m,"attached");valid=valid&&!value_truth(ctx,attached);value_free(ctx,attached);}
            value_free(ctx,m);value_free(ctx,local);
        }value_free(ctx,item);value_free(ctx,magnets);value_free(ctx,blueprint);
    }
    for(int i=0;valid&&i<get_number(ctx,designs,"length",0);i++){
        Value item=value_at(ctx,designs,i);Character c={0};valid=read_design(ctx,item,&c,0,legacy)&&c.count>0&&import_number(ctx,item,"x",-248,248,0)&&import_number(ctx,item,"z",-248,248,0);character_clear(&c);value_free(ctx,item);
    }
    for(int i=0;valid&&i<get_number(ctx,removals,"length",0);i++){
        Value item=value_at(ctx,removals,i),cause=value_get(ctx,item,"cause");const char *kind=value_is_string(cause)?value_text(ctx,cause):NULL;int known=0;for(int k=0;kind&&k<REMOVAL_CAUSES;k++)known|=!strcmp(kind,removal_causes[k]);
        valid=known&&import_string(ctx,item,"name",64)&&import_string(ctx,item,"detail",160)&&import_number(ctx,item,"id",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"time",0,DBL_MAX,0)&&import_number(ctx,item,"seconds",0,DBL_MAX,0);
        const char *fields[]={"x","y","z","up"};for(int k=0;k<4;k++)valid=valid&&import_number(ctx,item,fields[k],-FLT_MAX,FLT_MAX,IMPORT_NULLABLE);
        if(valid){int id=get_number(ctx,item,"id",0);if(id>greatest)greatest=id;}
        value_text_free(ctx,kind);value_free(ctx,cause);value_free(ctx,item);
    }
    for(int i=0;valid&&value_is_array(deliveries)&&i<get_number(ctx,deliveries,"length",0);i++){
        Value item=value_at(ctx,deliveries,i);valid=import_string(ctx,item,"name",64)&&import_number(ctx,item,"cargoId",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"carrierId",-1,INT32_MAX-1,IMPORT_INTEGER)&&get_number(ctx,item,"carrierId",0)!=0&&import_number(ctx,item,"depot",0,terrain_depot_count(get_number(ctx,save,"terrainVersion",0))-1,IMPORT_INTEGER)&&import_number(ctx,item,"time",0,DBL_MAX,0)&&import_number(ctx,item,"points",1,8,IMPORT_INTEGER|IMPORT_OPTIONAL);
        int id=valid?get_number(ctx,item,"cargoId",0):0;Value prior=value_at(ctx,delivered,id);valid=valid&&value_is_nil(prior);value_free(ctx,prior);if(valid){value_set_at(ctx,delivered,id,VALUE_TRUE);if(id>greatest)greatest=id;}value_free(ctx,item);
    }
    Value supply=value_get(ctx,save,"supply");
    valid=valid&&(value_is_nil(supply)||(value_is_table(supply)&&!value_is_array(supply)&&import_number(ctx,supply,"seed",1,UINT32_MAX,IMPORT_INTEGER)&&import_number(ctx,supply,"nextParcel",0,DBL_MAX,0)&&import_number(ctx,supply,"nextOre",0,DBL_MAX,0)&&import_number(ctx,supply,"nextMine",0,DBL_MAX,IMPORT_OPTIONAL)));value_free(ctx,supply);
    Value radio=value_get(ctx,save,"radio");
    valid=valid&&(value_is_nil(radio)||(value_is_array(radio)&&get_number(ctx,radio,"length",0)<=RADIO_CAPACITY));
    for(int i=0;valid&&value_is_array(radio)&&i<get_number(ctx,radio,"length",0);i++){
        Value item=value_at(ctx,radio,i);int kind,cargo;
        valid=radio_output(ctx,item,&kind,&cargo)&&import_number(ctx,item,"cargo",1,INT32_MAX-1,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"target",1,INT32_MAX-1,IMPORT_INTEGER|IMPORT_OPTIONAL)&&import_number(ctx,item,"team",1,2,IMPORT_INTEGER)&&import_number(ctx,item,"from",1,INT32_MAX-1,IMPORT_INTEGER)&&import_number(ctx,item,"time",0,get_number(ctx,save,"seconds",0),0)&&import_number(ctx,item,"mass",0,FLT_MAX,0)&&import_string(ctx,item,"name",64);
        const char *coordinates[]={"x","y","z"};for(int j=0;j<3;j++)valid=valid&&import_number(ctx,item,coordinates[j],-FLT_MAX,FLT_MAX,0);value_free(ctx,item);
    }value_free(ctx,radio);
    int player=valid?get_number(ctx,save,"playerId",0):0;Value found=value_at(ctx,ids,player);valid=valid&&(!player||!value_is_nil(found))&&get_number(ctx,save,"nextId",0)>=greatest+(greatest>0);value_free(ctx,found);
    value_free(ctx,list);value_free(ctx,designs);value_free(ctx,removals);value_free(ctx,deliveries);value_free(ctx,ids);value_free(ctx,delivered);return valid;
}
Value world_import(Data *ctx,const char *path){
    Value save=read_data(ctx,path);
    if(!migrate_data(ctx,save)){value_free(ctx,save);return VALUE_ERROR;}
    if(!import_world_valid(ctx,save)){value_free(ctx,save);return value_error(ctx,"Invalid world file; current world kept.");}
    if(!save_world(ctx,"/workspace/blockwalker-world.previous.lua")){value_free(ctx,save);return value_error(ctx,"Could not back up the current world; import cancelled.");}
    Value list=value_get(ctx,save,"creatures");int count=get_number(ctx,list,"length",0);value_free(ctx,list);
    World previous=world;char *program=installed,name[64];int hz=installed_hz,previous_terrain=terrain_version;memcpy(name,installed_name,sizeof(name));world=(World){0};installed=NULL;
    restore_world(ctx,save,0);free(installed);installed=program;installed_hz=hz;memcpy(installed_name,name,sizeof(name));
    if(world.count!=count||!world_save(ctx)){destroy_world(&world);world=previous;terrain_select(previous_terrain);return value_error(ctx,"World restore failed; current world kept.");}
    destroy_world(&previous);return VALUE_NIL;
}
