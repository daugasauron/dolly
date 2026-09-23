#define _POSIX_C_SOURCE 200809L
#include "world.h"
#include "terrain.h"
#include <raymath.h>
#include <errno.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
struct Controller {JSRuntime *runtime;JSContext *ctx;JSValue function,memory,random;char *source;uint32_t seed;int hz,exhausted,remaining;char error[160];};
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
    if(steps>180&&cause>=0)*fallen+=1.f/60;else if(*fallen<100)*fallen=0;
    return *fallen>2;
}
static const char *failure_detail(int cause,float up,const char *error){
    return cause==REMOVAL_CONTROLLER?error:cause==REMOVAL_POSTURE?(up<.15f?"Root tipped over":"Raised torso collapsed"):removal_causes[cause];
}
static int remember_design(const Character *design,const char *source,const char *name,int hz,float x,float z){
    for(int i=0;i<world.design_count;i++){SavedDesign *d=&world.designs[i];
        if(d->hz==hz&&d->design.count==design->count&&d->design.anchored==design->anchored&&!strcmp(d->name,name)&&!strcmp(d->source,source)&&!memcmp(d->design.blocks,design->blocks,design->count*sizeof(Block)))return i+1;
    }
    if(world.design_count==world.design_capacity){world.design_capacity=world.design_capacity?world.design_capacity*2:16;world.designs=array_resize(world.designs,world.design_capacity,sizeof(SavedDesign));}
    SavedDesign *d=&world.designs[world.design_count++];memset(d,0,sizeof(*d));character_copy(&d->design,design);d->source=strdup(source);d->hz=hz;d->x=x;d->z=z;snprintf(d->name,sizeof(d->name),"%s",name);
    return world.design_count;
}
static int interrupt(JSRuntime *rt,void *opaque){Controller *c=opaque;c->exhausted=c->remaining==0;if(!c->exhausted)c->remaining--;return c->exhausted;}
static void controller_budget(Controller *c){c->remaining=2;c->exhausted=0;c->error[0]=0;}
static JSValue random_number(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv){
    Controller *c=JS_GetContextOpaque(ctx);c->seed^=c->seed<<13;c->seed^=c->seed>>17;c->seed^=c->seed<<5;
    return JS_NewFloat64(ctx,c->seed/4294967296.0);
}
static void controller_free(Controller *c){if(!c)return;JS_FreeValue(c->ctx,c->function);JS_FreeValue(c->ctx,c->memory);JS_FreeValue(c->ctx,c->random);JS_FreeContext(c->ctx);JS_FreeRuntime(c->runtime);free(c->source);free(c);}
static Controller *controller_new(const char *source,uint32_t seed,int hz){
    Controller *c=calloc(1,sizeof(*c));if(!c)return NULL;
    c->source=strdup(source);c->seed=seed?seed:1;c->hz=hz;c->runtime=JS_NewRuntime();JS_SetMemoryLimit(c->runtime,4*1024*1024);JS_SetMaxStackSize(c->runtime,128*1024);
    JS_SetInterruptHandler(c->runtime,interrupt,c);c->ctx=JS_NewContext(c->runtime);JS_SetContextOpaque(c->ctx,c);
    c->memory=JS_NewObject(c->ctx);c->random=JS_NewCFunction(c->ctx,random_number,"random",0);controller_budget(c);
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
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive","speed","limit","travel","force","direction","material","finish"};
        double values[]={b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit,b.travel,b.force,b.direction,b.material,b.finish};
        for(int j=0;j<16;j++)put_number(ctx,part,names[j],values[j]);JS_SetPropertyUint32(ctx,list,i,part);
    }return list;
}
int character_from_json(JSContext *ctx,JSValueConst list,Character *c){
    double length=get_number(ctx,list,"length",0);if(!isfinite(length)||length<1||length>INT32_MAX/sizeof(Block))return 0;
    Character next={.count=(int)length,.capacity=(int)length};next.blocks=array_resize(NULL,next.count,sizeof(Block));
    for(int i=0;i<next.count;i++){
        JSValue v=JS_GetPropertyUint32(ctx,list,i);Block *b=&next.blocks[i];
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive","speed","limit","travel","force","direction","material","finish"};
        double defaults[]={0,0,0,i-1,0,i%COLOR_COUNT,2,0,0,2.5,75,1.5,24,1,0,0},n[16];int valid=1;
        for(int j=0;j<16;j++){n[j]=get_number(ctx,v,names[j],defaults[j]);if(!isfinite(n[j])||((j<9||j>=13)&&(n[j]!=floor(n[j])||n[j]<INT32_MIN||n[j]>INT32_MAX)))valid=0;}
        JS_FreeValue(ctx,v);if(!valid){character_clear(&next);return 0;}
        *b=(Block){.x=n[0],.y=n[1],.z=n[2],.parent=n[3],.joint=n[4],.color=n[5],.axis=n[6],.negative=n[7],.positive=n[8],.speed=n[9],.limit=n[10],.travel=n[11],.force=n[12],.direction=n[13],.material=n[14],.finish=n[15]};
    }
    if(!character_validate(&next)){character_clear(&next);return 0;}character_clear(c);*c=next;return 1;
}
static JSValue vector(JSContext *ctx,Vector3 v){
    JSValue a=JS_NewArray(ctx);JS_SetPropertyUint32(ctx,a,0,JS_NewFloat64(ctx,v.x));JS_SetPropertyUint32(ctx,a,1,JS_NewFloat64(ctx,v.y));JS_SetPropertyUint32(ctx,a,2,JS_NewFloat64(ctx,v.z));return a;
}
static JSValue magnet_state(JSContext *ctx,const Physics *p,const Character *c){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_MAGNET){
        PhysicsPart *part=&p->parts[i];JSValue item=JS_NewObject(ctx);put_number(ctx,item,"power",part->magnet_power);put_number(ctx,item,"load",part->magnet_load);
        JS_SetPropertyStr(ctx,item,"attached",JS_NewBool(ctx,b3Body_IsValid(part->magnet_target)));JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
JSValue physics_sensors(JSContext *ctx,const Physics *p,const Character *c,double dt){
    JSValue s=JS_NewObject(ctx),angles=JS_NewArray(ctx),rates=JS_NewArray(ctx),touching=JS_NewArray(ctx),positions=JS_NewArray(ctx),submerged=JS_NewArray(ctx);
    JSValue support=JS_NewArray(ctx),self_contact=JS_NewArray(ctx);b3ContactData *contacts=NULL;int contact_capacity=0;
    Vector3 position;Quaternion q;physics_pose(p,c,0,&position,&q);Quaternion inverse=QuaternionInvert(q);
    put_number(ctx,s,"x",position.x);put_number(ctx,s,"y",position.y);put_number(ctx,s,"z",position.z);put_number(ctx,s,"dt",dt);
    put_number(ctx,s,"ground",p->landscape?terrain_height(position.x,position.z):0);
    if(p->landscape)put_number(ctx,s,"waterHeight",water_height(position.x,position.z,p->time));
    Vector3 up=Vector3RotateByQuaternion((Vector3){0,1,0},q);put_number(ctx,s,"up",up.y);
    b3Vec3 v=b3Body_GetLinearVelocity(p->parts[0].body),w=b3Body_GetAngularVelocity(p->parts[0].body),gravity=b3World_GetGravity(p->world);
    put_number(ctx,s,"vx",v.x);put_number(ctx,s,"vy",v.y);put_number(ctx,s,"vz",v.z);
    JSValue rotation=vector(ctx,(Vector3){q.x,q.y,q.z});JS_SetPropertyUint32(ctx,rotation,3,JS_NewFloat64(ctx,q.w));JS_SetPropertyStr(ctx,s,"rotation",rotation);
    JS_SetPropertyStr(ctx,s,"angularVelocity",vector(ctx,(Vector3){w.x,w.y,w.z}));
    JS_SetPropertyStr(ctx,s,"gyroscope",vector(ctx,Vector3RotateByQuaternion((Vector3){w.x,w.y,w.z},inverse)));
    JS_SetPropertyStr(ctx,s,"gravity",vector(ctx,Vector3RotateByQuaternion((Vector3){gravity.x,gravity.y,gravity.z},inverse)));
    JS_SetPropertyStr(ctx,s,"localVelocity",vector(ctx,Vector3RotateByQuaternion((Vector3){v.x,v.y,v.z},inverse)));
    double mass=0;Vector3 center={0};
    for(int i=0;i<c->count;i++){
        b3BodyId body=p->parts[i].body;b3Pos pos=b3Body_GetWorldCenterOfMass(body);float m=b3Body_GetMass(body);mass+=m;center=Vector3Add(center,Vector3Scale((Vector3){pos.x,pos.y,pos.z},m));
        JS_SetPropertyUint32(ctx,positions,i,vector(ctx,(Vector3){pos.x,pos.y,pos.z}));
        JS_SetPropertyUint32(ctx,submerged,i,JS_NewFloat64(ctx,p->parts[i].submerged));
        JS_SetPropertyUint32(ctx,angles,i,JS_NewFloat64(ctx,p->parts[i].angle));JS_SetPropertyUint32(ctx,rates,i,JS_NewFloat64(ctx,p->parts[i].rate));
        int required=b3Body_GetContactCapacity(body);
        if(required>contact_capacity){contact_capacity=required;contacts=array_resize(contacts,contact_capacity,sizeof(*contacts));}
        int count=required?b3Body_GetContactData(body,contacts,contact_capacity):0;double support_force=0,self_force=0;
        for(int j=0;j<count;j++){
            b3ContactData *contact=&contacts[j];b3BodyId a=b3Shape_GetBody(contact->shapeIdA),b=b3Shape_GetBody(contact->shapeIdB);
            int is_a=B3_ID_EQUALS(a,body),own=b3Body_GetUserData(is_a?b:a)==p->parts;
            for(int k=0;k<contact->manifoldCount;k++){
                const b3Manifold *manifold=&contact->manifolds[k];double force=0;
                for(int n=0;n<manifold->pointCount;n++)force+=480*manifold->points[n].normalImpulse;
                if(own)self_force+=force;else support_force+=fmax(0,(is_a?-1:1)*manifold->normal.y)*force;
            }
        }
        JS_SetPropertyUint32(ctx,touching,i,JS_NewBool(ctx,count>0));
        JS_SetPropertyUint32(ctx,support,i,JS_NewFloat64(ctx,support_force));JS_SetPropertyUint32(ctx,self_contact,i,JS_NewFloat64(ctx,self_force));
    }
    free(contacts);JS_SetPropertyStr(ctx,s,"supportForce",support);JS_SetPropertyStr(ctx,s,"selfContactForce",self_contact);
    put_number(ctx,s,"mass",mass);JS_SetPropertyStr(ctx,s,"centerOfMass",vector(ctx,Vector3Scale(center,mass>0?1/mass:0)));
    JS_SetPropertyStr(ctx,s,"angles",angles);JS_SetPropertyStr(ctx,s,"rates",rates);JS_SetPropertyStr(ctx,s,"touching",touching);JS_SetPropertyStr(ctx,s,"positions",positions);JS_SetPropertyStr(ctx,s,"submerged",submerged);JS_SetPropertyStr(ctx,s,"magnets",magnet_state(ctx,p,c));return s;
}
static int assigned(const Character *design,int key){
    if(key<=0||key>=128)return 0;
    for(int i=1;i<design->count;i++)if(design->blocks[i].joint&&(design->blocks[i].negative==key||design->blocks[i].positive==key))return 1;return 0;
}
static int controller_step(Controller *controller,const Physics *p,const Character *design,float controls[128]){
    JSContext *ctx=controller->ctx;controller_budget(controller);
    JSValue args[]={JS_NewFloat64(ctx,p->steps/60.0),physics_sensors(ctx,p,design,1.0/controller->hz),JS_DupValue(ctx,controller->memory),JS_DupValue(ctx,controller->random)};
    JSValue result=JS_Call(ctx,controller->function,JS_UNDEFINED,4,args);for(int i=0;i<4;i++)JS_FreeValue(ctx,args[i]);
    memset(controls,0,128*sizeof(float));int valid=1;
    if(JS_IsString(result)){
        const char *keys=JS_ToCString(ctx,result);if(!keys)valid=0;
        else for(const unsigned char *k=(const unsigned char *)keys;*k;k++){if(!assigned(design,*k)){valid=0;break;}controls[*k]=1;}
        JS_FreeCString(ctx,keys);
    }else if(JS_IsObject(result)&&!JS_IsArray(result)){
        JSPropertyEnum *properties=NULL;uint32_t count=0;
        if(JS_GetOwnPropertyNames(ctx,&properties,&count,result,JS_GPN_STRING_MASK|JS_GPN_ENUM_ONLY)<0)valid=0;
        for(uint32_t i=0;i<count;i++){
            const char *key=JS_AtomToCString(ctx,properties[i].atom);JSValue value=JS_GetProperty(ctx,result,properties[i].atom);double level;
            if(!key||strlen(key)!=1||!assigned(design,(unsigned char)key[0])||!JS_IsNumber(value)||JS_ToFloat64(ctx,&level,value)<0||!isfinite(level)||level<0||level>1)valid=0;
            else controls[(unsigned char)key[0]]=level;
            JS_FreeCString(ctx,key);JS_FreeValue(ctx,value);JS_FreeAtom(ctx,properties[i].atom);
        }js_free(ctx,properties);
    }else valid=0;
    if(!valid){
        snprintf(controller->error,sizeof(controller->error),"%s",controller->exhausted?"Controller execution budget exceeded":"Invalid controller output");
        if(JS_IsException(result)){JSValue error=JS_GetException(ctx);const char *text=JS_ToCString(ctx,error);if(text&&!controller->exhausted)snprintf(controller->error,sizeof(controller->error),"%s",text);JS_FreeCString(ctx,text);JS_FreeValue(ctx,error);}
    }
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
        cause=physical_failure(c,position,up,trial_status.height,p->landscape?terrain_height(position.x,position.z):0);
        if(!sustained_failure(&trial_status.fallen,p->steps,cause))return 1;
    }
    trial_status.cause=cause;trial_status.steps=p->steps;snprintf(trial_status.detail,sizeof(trial_status.detail),"%s",failure_detail(cause,up,trial->error));
    memset(trial_controls,0,sizeof(trial_controls));return 0;
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
    Controller *probe=source&&(hz==10||hz==20||hz==30||hz==60)?controller_new(source,1,hz):NULL;
    if(!probe)result=JS_ThrowTypeError(ctx,"Controller must compile to a JavaScript function within its heap and execution limits; return key letters or key strengths 0..1, hz 10/20/30/60");
    else {world_trial_stop();installed_hz=hz;free(installed);installed=strdup(source);snprintf(installed_name,sizeof(installed_name),"%s",label?label:"Creature");controller_free(probe);}
    JS_FreeCString(ctx,source);JS_FreeCString(ctx,label);JS_FreeValue(ctx,code);JS_FreeValue(ctx,name);return result;
}
JSValue world_designs(JSContext *ctx,int full){
    JSValue list=JS_NewArray(ctx);
    for(int i=0;i<world.design_count;i++){SavedDesign *d=&world.designs[i];JSValue item=JS_NewObject(ctx);
        put_number(ctx,item,"id",i+1);put_number(ctx,item,"parts",d->design.count);put_number(ctx,item,"hz",d->hz);put_number(ctx,item,"x",d->x);put_number(ctx,item,"z",d->z);
        JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,d->name));JS_SetPropertyStr(ctx,item,"anchored",JS_NewBool(ctx,d->design.anchored));
        JS_SetPropertyStr(ctx,item,"sea",JS_NewBool(ctx,terrain_height(d->x,d->z)<WATER_LEVEL));
        if(full){JS_SetPropertyStr(ctx,item,"blueprint",character_json(ctx,&d->design));JS_SetPropertyStr(ctx,item,"source",JS_NewString(ctx,d->source));}
        JS_SetPropertyUint32(ctx,list,i,item);
    }return list;
}
JSValue world_open_design(JSContext *ctx,int index,Character *design){
    if(index<0||index>=world.design_count)return JS_ThrowRangeError(ctx,"Unknown saved design");
    SavedDesign *d=&world.designs[index];JSValue args=JS_NewObject(ctx);
    JS_SetPropertyStr(ctx,args,"source",JS_NewString(ctx,d->source));JS_SetPropertyStr(ctx,args,"name",JS_NewString(ctx,d->name));put_number(ctx,args,"hz",d->hz);
    JSValue result=world_install(ctx,args);JS_FreeValue(ctx,args);if(!JS_IsException(result))character_copy(design,&d->design);return result;
}
JSValue world_save_design(JSContext *ctx,const Character *design,int sea){
    if(!installed||!design->count)return JS_ThrowTypeError(ctx,"Build a character and install its controller before saving a design");
    return JS_NewInt32(ctx,remember_design(design,installed,installed_name,installed_hz,sea?125:0,sea?10:0));
}
static Creature *spawn(const Character *design,const char *source,const char *name,uint32_t seed,int hz,float x,float z){
    Controller *controller=controller_new(source,seed,hz);if(!controller)return NULL;
    if(!world.next_id){world.next_id=1;world.physics=physics_world(1);}
    if(world.count==world.capacity){world.capacity=world.capacity?world.capacity*2:16;world.creatures=array_resize(world.creatures,world.capacity,sizeof(Creature));}
    Creature *c=&world.creatures[world.count++];memset(c,0,sizeof(*c));c->id=world.next_id++;snprintf(c->name,sizeof(c->name),"%s",name);c->controller=controller;
    character_copy(&c->design,design);physics_attach(&c->physics,&c->design,world.physics,x,z,1);c->physics.time=world.age;
    Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);c->root_height=p.y-fmaxf(terrain_height(x,z),WATER_LEVEL);return c;
}
static void set_spawn_height(Creature *c,float y){
    float offset=y-c->physics.start.y;
    for(int i=0;i<c->design.count;i++){
        b3BodyId body=c->physics.parts[i].body;b3WorldTransform t=b3Body_GetTransform(body);t.p.y+=offset;b3Body_SetTransform(body,t.p,t.q);
    }c->physics.start.y=y;
}
int world_drop_cargo(float x,float y,float z,int material){
    Character box={0};character_add(&box,-1,0,0,0,BLOCK_BOX,1);box.blocks[0].material=material;box.blocks[0].finish=FINISH_STRIPE;
    Creature *cargo=spawn(&box,"function(){return ''}","Cargo",1,10,x,z);character_clear(&box);if(cargo&&isfinite(y))set_spawn_height(cargo,y);return cargo?cargo->id:0;
}
JSValue world_release(JSContext *ctx,const Character *design,JSValueConst args){
    if(!installed||!design->count)return JS_ThrowTypeError(ctx,"Build a character and install a learned controller first");
    int index=world.next_id?world.next_id-1:0,plot=index%256;float angle=plot*2.399963f,radius=5*sqrtf(plot);
    float x=get_number(ctx,args,"x",cosf(angle)*radius),z=get_number(ctx,args,"z",sinf(angle)*radius);
    if(!isfinite(x)||!isfinite(z)||fabsf(x)>WORLD_RADIUS-8||fabsf(z)>WORLD_RADIUS-8)return JS_ThrowRangeError(ctx,"Spawn must be inside the 512 m world; the sea surrounds the central 200 m ground");
    Creature *c=spawn(design,installed,installed_name,(uint32_t)get_number(ctx,args,"seed",index+1),installed_hz,x,z);
    if(!c)return JS_ThrowInternalError(ctx,"Controller failed to initialize");
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
JSValue world_state(JSContext *ctx){
    JSValue result=JS_NewObject(ctx),list=JS_NewArray(ctx);put_number(ctx,result,"deaths",world.deaths);put_number(ctx,result,"seconds",world.age);
    JS_SetPropertyStr(ctx,result,"recentRemovals",removal_state(ctx,0));
    JSValue terrain=JS_NewObject(ctx);put_number(ctx,terrain,"radius",WORLD_RADIUS);put_number(ctx,terrain,"waterLevel",WATER_LEVEL);
    JS_SetPropertyStr(ctx,terrain,"harbor",vector(ctx,(Vector3){112,0,20}));JS_SetPropertyStr(ctx,terrain,"seaTrial",vector(ctx,(Vector3){125,-2,10}));
    JS_SetPropertyStr(ctx,terrain,"basin",vector(ctx,(Vector3){46,0,72}));
    JS_SetPropertyStr(ctx,terrain,"eastIsland",vector(ctx,(Vector3){170,4,30}));JS_SetPropertyStr(ctx,terrain,"westIsland",vector(ctx,(Vector3){-174,2,-35}));JS_SetPropertyStr(ctx,terrain,"northRidge",vector(ctx,(Vector3){15,6,-175}));JS_SetPropertyStr(ctx,result,"terrain",terrain);
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];JSValue item=JS_NewObject(ctx);Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);
        put_number(ctx,item,"id",c->id);JS_SetPropertyStr(ctx,item,"name",JS_NewString(ctx,c->name));put_number(ctx,item,"parts",c->design.count);
        JS_SetPropertyStr(ctx,item,"anchored",JS_NewBool(ctx,c->design.anchored));
        JS_SetPropertyStr(ctx,item,"magnets",magnet_state(ctx,&c->physics,&c->design));
        put_number(ctx,item,"seconds",c->physics.steps/60.0);put_number(ctx,item,"x",p.x);put_number(ctx,item,"y",p.y);put_number(ctx,item,"z",p.z);
        put_number(ctx,item,"distance",hypot(p.x-c->physics.start.x,p.z-c->physics.start.z));
        b3Vec3 velocity=b3Body_GetLinearVelocity(c->physics.parts[0].body);put_number(ctx,item,"speed",hypot(velocity.x,velocity.z));
        put_number(ctx,item,"up",Vector3RotateByQuaternion((Vector3){0,1,0},q).y);put_number(ctx,item,"fallenSeconds",c->fallen);
        JS_SetPropertyUint32(ctx,list,i,item);
    }JS_SetPropertyStr(ctx,result,"creatures",list);return result;
}
void world_step(void){
    if(!world.next_id){world.next_id=1;world.physics=physics_world(1);}
    for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];
        c->physics.time=world.age;
        if(c->physics.steps%(60/c->controller->hz)==0&&!controller_step(c->controller,&c->physics,&c->design,c->controls))c->fallen=100;
        physics_drive(&c->physics,&c->design,c->controls);
    }
    b3World_Step(world.physics,1.f/60,8);world.age+=1./60;
    for(int i=0;i<world.count;){Creature *c=&world.creatures[i];physics_sample(&c->physics,&c->design);
        Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);float up=Vector3RotateByQuaternion((Vector3){0,1,0},q).y;
        int cause=physical_failure(&c->design,p,up,c->root_height,terrain_height(p.x,p.z));
        if(sustained_failure(&c->fallen,c->physics.steps,cause)){
            Removal *r=new_removal();r->id=c->id;r->time=world.age;r->seconds=c->physics.steps/60.0;r->position=p;r->up=up;snprintf(r->name,sizeof(r->name),"%s",c->name);
            r->cause=c->fallen>=100?REMOVAL_CONTROLLER:cause;
            snprintf(r->detail,sizeof(r->detail),"%s",failure_detail(r->cause,up,c->controller->error));
            printf("CREATURE %d removed: %s after %.1fs (%s: %s; xyz %.3f %.3f %.3f, up %.3f)\n",c->id,c->name,r->seconds,removal_causes[r->cause],r->detail,p.x,p.y,p.z,up);
            physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);world.creatures[i]=world.creatures[--world.count];world.deaths++;
        }else i++;
    }
}
void world_close(void){
    world_trial_stop();
    for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);}
    for(int i=0;i<world.design_count;i++){character_clear(&world.designs[i].design);free(world.designs[i].source);}free(world.designs);
    if(world.next_id)b3DestroyWorld(world.physics);free(world.creatures);free(world.removals);memset(&world,0,sizeof(world));free(installed);installed=NULL;
}
static void save_json(JSContext *ctx,JSValueConst value,const char *path){
    JSValue json=JS_JSONStringify(ctx,value,JS_UNDEFINED,JS_UNDEFINED);const char *source=JS_ToCString(ctx,json);
    char temp[256];snprintf(temp,sizeof(temp),"%s.tmp",path);FILE *f=source?fopen(temp,"w"):NULL;
    if(f){int good=fputs(source,f)>=0;if(fclose(f)!=0)good=0;if(good)rename(temp,path);else remove(temp);}
    JS_FreeCString(ctx,source);JS_FreeValue(ctx,json);
}
void world_save(JSContext *ctx){
    JSValue save=world_state(ctx),list=JS_GetPropertyStr(ctx,save,"creatures");put_number(ctx,save,"version",1);put_number(ctx,save,"nextId",world.next_id);put_number(ctx,save,"installedHz",installed_hz);
    JS_SetPropertyStr(ctx,save,"designs",world_designs(ctx,1));
    JS_SetPropertyStr(ctx,save,"removals",removal_state(ctx,1));
    if(installed){JS_SetPropertyStr(ctx,save,"installed",JS_NewString(ctx,installed));JS_SetPropertyStr(ctx,save,"name",JS_NewString(ctx,installed_name));}
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];JSValue item=JS_GetPropertyUint32(ctx,list,i),poses=JS_NewArray(ctx);
        JS_SetPropertyStr(ctx,item,"blueprint",character_json(ctx,&c->design));JS_SetPropertyStr(ctx,item,"source",JS_NewString(ctx,c->controller->source));
        put_number(ctx,item,"hz",c->controller->hz);put_number(ctx,item,"seed",c->controller->seed);put_number(ctx,item,"rootHeight",c->root_height);put_number(ctx,item,"startX",c->physics.start.x);put_number(ctx,item,"startZ",c->physics.start.z);
        size_t length=0;const char *m=controller_memory_json(c->controller,&length);if(m)JS_SetPropertyStr(ctx,item,"memory",JS_NewStringLen(ctx,m,length));JS_FreeCString(c->controller->ctx,m);
        for(int j=0;j<c->design.count;j++){
            Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,j,&p,&q);b3Vec3 v=b3Body_GetLinearVelocity(c->physics.parts[j].body),a=b3Body_GetAngularVelocity(c->physics.parts[j].body);
            double values[]={p.x,p.y,p.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,a.x,a.y,a.z};JSValue pose=JS_NewArray(ctx);
            for(int k=0;k<13;k++)JS_SetPropertyUint32(ctx,pose,k,JS_NewFloat64(ctx,values[k]));JS_SetPropertyUint32(ctx,poses,j,pose);
        }JS_SetPropertyStr(ctx,item,"poses",poses);
        JSValue magnets=JS_GetPropertyStr(ctx,item,"magnets");
        for(int j=0;j<c->design.count;j++)if(c->design.blocks[j].joint==BLOCK_MAGNET){
            PhysicsPart *part=&c->physics.parts[j];JSValue magnet=JS_GetPropertyUint32(ctx,magnets,j);
            for(int k=0;k<world.count;k++)for(int l=0;l<world.creatures[k].design.count;l++)if(B3_ID_EQUALS(part->magnet_target,world.creatures[k].physics.parts[l].body)){
                put_number(ctx,magnet,"creature",world.creatures[k].id);put_number(ctx,magnet,"part",l);
                JS_SetPropertyStr(ctx,magnet,"local",vector(ctx,(Vector3){part->magnet_local.x,part->magnet_local.y,part->magnet_local.z}));
            }JS_FreeValue(ctx,magnet);
        }JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,item);
    }save_json(ctx,save,"/workspace/blockwalker-world.json");JS_FreeValue(ctx,list);JS_FreeValue(ctx,save);
}
static JSValue read_json(JSContext *ctx,const char *path){
    FILE *f=fopen(path,"r");if(!f)return JS_UNDEFINED;fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);
    if(size<0||size>128*1024*1024){fclose(f);return JS_UNDEFINED;}char *source=array_resize(NULL,size+1,1);size_t n=fread(source,1,size,f);source[n]=0;fclose(f);
    JSValue save=JS_ParseJSON(ctx,source,n,"saved-world");free(source);if(JS_IsException(save)){JS_FreeValue(ctx,JS_GetException(ctx));return JS_UNDEFINED;}
    return save;
}
static void load_designs(JSContext *ctx,JSValueConst list,int populate){
    if(!JS_IsArray(list))return;
    for(int i=0;i<get_number(ctx,list,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),blueprint=JS_GetPropertyStr(ctx,item,"blueprint"),code=JS_GetPropertyStr(ctx,item,"source"),label=JS_GetPropertyStr(ctx,item,"name");Character c={0};
        if(JS_IsString(code)&&JS_IsString(label)&&character_from_json(ctx,blueprint,&c)){
            JSValue anchored=JS_GetPropertyStr(ctx,item,"anchored");c.anchored=JS_ToBool(ctx,anchored);JS_FreeValue(ctx,anchored);
            const char *source=JS_ToCString(ctx,code),*name=JS_ToCString(ctx,label);int hz=get_number(ctx,item,"hz",10);float x=get_number(ctx,item,"x",0),z=get_number(ctx,item,"z",0);
            JSValue height=JS_GetPropertyStr(ctx,item,"y");int elevated=!JS_IsUndefined(height);float y=get_number(ctx,item,"y",NAN);JS_FreeValue(ctx,height);
            Controller *probe=source&&(hz==10||hz==20||hz==30||hz==60)?controller_new(source,1,hz):NULL;
            if(probe&&isfinite(x)&&isfinite(z)&&(!elevated||(isfinite(y)&&y>=-12&&y<=128))){
                x=Clamp(x,-248,248);z=Clamp(z,-248,248);remember_design(&c,source,name,hz,x,z);
                if(populate){Creature *born=spawn(&c,source,name,i+1,hz,x,z);if(born&&elevated)set_spawn_height(born,y);}
            }controller_free(probe);JS_FreeCString(ctx,source);JS_FreeCString(ctx,name);
        }character_clear(&c);JS_FreeValue(ctx,item);JS_FreeValue(ctx,blueprint);JS_FreeValue(ctx,code);JS_FreeValue(ctx,label);
    }
}
void world_load_archive(JSContext *ctx){
    JSValue archive=read_json(ctx,"/usr/src/dolly/blockwalker/archive-designs.json");load_designs(ctx,archive,0);JS_FreeValue(ctx,archive);
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
void world_load(JSContext *ctx){
    int fresh=access("/workspace/blockwalker-world.json",F_OK)<0&&errno==ENOENT;
    JSValue save=read_json(ctx,"/workspace/blockwalker-world.json");
    if(JS_IsObject(save)){JSValue designs=JS_GetPropertyStr(ctx,save,"designs");load_designs(ctx,designs,0);JS_FreeValue(ctx,designs);}
    JSValue examples=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json");load_designs(ctx,examples,fresh);JS_FreeValue(ctx,examples);
    if(fresh)world_save(ctx);
    if(!JS_IsObject(save)){JS_FreeValue(ctx,save);return;}
    if(get_number(ctx,save,"version",0)!=1){JS_FreeValue(ctx,save);return;}
    JSValue removals=JS_GetPropertyStr(ctx,save,"removals");load_removals(ctx,removals);JS_FreeValue(ctx,removals);
    int hz=get_number(ctx,save,"installedHz",10);installed_hz=(hz==10||hz==20||hz==30||hz==60)?hz:10;
    JSValue code=JS_GetPropertyStr(ctx,save,"installed"),label=JS_GetPropertyStr(ctx,save,"name");
    if(JS_IsString(code)){const char *s=JS_ToCString(ctx,code),*name=JS_ToCString(ctx,label);installed=strdup(s);snprintf(installed_name,sizeof(installed_name),"%s",name);JS_FreeCString(ctx,s);JS_FreeCString(ctx,name);}
    JS_FreeValue(ctx,code);JS_FreeValue(ctx,label);JSValue list=JS_GetPropertyStr(ctx,save,"creatures");int count=get_number(ctx,list,"length",0);
    for(int i=0;i<count;i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),blueprint=JS_GetPropertyStr(ctx,item,"blueprint");Character c={0};
        if(character_from_json(ctx,blueprint,&c)){
            JSValue anchored=JS_GetPropertyStr(ctx,item,"anchored");c.anchored=JS_ToBool(ctx,anchored);JS_FreeValue(ctx,anchored);
            JSValue code=JS_GetPropertyStr(ctx,item,"source"),label=JS_GetPropertyStr(ctx,item,"name");const char *s=JS_ToCString(ctx,code),*name=JS_ToCString(ctx,label);
            int hz=get_number(ctx,item,"hz",10);if(hz!=10&&hz!=20&&hz!=30&&hz!=60)hz=10;
            Creature *creature=s?spawn(&c,s,name?name:"Creature",get_number(ctx,item,"seed",1),hz,0,0):NULL;
            if(creature){
                creature->id=get_number(ctx,item,"id",creature->id);creature->physics.steps=llround(get_number(ctx,item,"seconds",0)*60);creature->root_height=get_number(ctx,item,"rootHeight",1);creature->fallen=get_number(ctx,item,"fallenSeconds",0);creature->physics.start.x=get_number(ctx,item,"startX",creature->physics.start.x);creature->physics.start.z=get_number(ctx,item,"startZ",creature->physics.start.z);
                JSValue memory=JS_GetPropertyStr(ctx,item,"memory");const char *m=JS_ToCString(ctx,memory);
                if(m){controller_budget(creature->controller);JSValue value=JS_ParseJSON(creature->controller->ctx,m,strlen(m),"controller-memory");if(!JS_IsException(value)){JS_FreeValue(creature->controller->ctx,creature->controller->memory);creature->controller->memory=value;}}
                JS_FreeCString(ctx,m);JS_FreeValue(ctx,memory);
                JSValue poses=JS_GetPropertyStr(ctx,item,"poses");
                for(int j=0;j<c.count;j++){JSValue pose=JS_GetPropertyUint32(ctx,poses,j);double p[13]={0};p[6]=1;int valid=1;
                    for(int k=0;k<13;k++){JSValue v=JS_GetPropertyUint32(ctx,pose,k);if(JS_ToFloat64(ctx,&p[k],v)<0||!isfinite(p[k]))valid=0;JS_FreeValue(ctx,v);}JS_FreeValue(ctx,pose);
                    if(valid){b3BodyId b=creature->physics.parts[j].body;b3Body_SetTransform(b,(b3Pos){p[0],p[1],p[2]},(b3Quat){{p[3],p[4],p[5]},p[6]});b3Body_SetLinearVelocity(b,(b3Vec3){p[7],p[8],p[9]});b3Body_SetAngularVelocity(b,(b3Vec3){p[10],p[11],p[12]});}
                }JS_FreeValue(ctx,poses);
                if(strcmp(creature->name,"Cargo"))remember_design(&c,s,creature->name,hz,creature->physics.start.x,creature->physics.start.z);
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
                    part->magnet_target=world.creatures[n].physics.parts[index].body;part->magnet_local=(b3Vec3){p[0],p[1],p[2]};
                    double load=get_number(ctx,magnet,"load",0);part->magnet_load=isfinite(load)?Clamp(load,0,creature->design.blocks[k].force*part->magnet_power):0;
                }JS_FreeValue(ctx,local);JS_FreeValue(ctx,magnet);
            }
        }JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,item);
    }
    world.deaths=get_number(ctx,save,"deaths",0);world.age=get_number(ctx,save,"seconds",0);int next_id=get_number(ctx,save,"nextId",0);if(next_id>0&&!world.next_id)world.physics=physics_world(1);world.next_id=fmax(world.next_id,next_id);
    JS_FreeValue(ctx,list);JS_FreeValue(ctx,save);
}
