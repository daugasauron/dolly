#define _POSIX_C_SOURCE 200809L
#include "world.h"
#include "terrain.h"
#include <raymath.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
struct Controller {JSRuntime *runtime;JSContext *ctx;JSValue function,memory,random;char *source;uint32_t seed;int hz;double deadline;};
World world;
static char *installed;static char installed_name[64]="Creature";static int installed_hz=10;
static Controller *trial;static float trial_controls[128];
static double seconds(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static int interrupt(JSRuntime *rt,void *opaque){return seconds()>((Controller *)opaque)->deadline;}
static JSValue random_number(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv){
    Controller *c=JS_GetContextOpaque(ctx);c->seed^=c->seed<<13;c->seed^=c->seed>>17;c->seed^=c->seed<<5;
    return JS_NewFloat64(ctx,c->seed/4294967296.0);
}
static void controller_free(Controller *c){if(!c)return;JS_FreeValue(c->ctx,c->function);JS_FreeValue(c->ctx,c->memory);JS_FreeValue(c->ctx,c->random);JS_FreeContext(c->ctx);JS_FreeRuntime(c->runtime);free(c->source);free(c);}
static Controller *controller_new(const char *source,uint32_t seed,int hz){
    Controller *c=calloc(1,sizeof(*c));if(!c)return NULL;
    c->source=strdup(source);c->seed=seed?seed:1;c->hz=hz;c->runtime=JS_NewRuntime();JS_SetMemoryLimit(c->runtime,4*1024*1024);JS_SetMaxStackSize(c->runtime,128*1024);
    JS_SetInterruptHandler(c->runtime,interrupt,c);c->ctx=JS_NewContext(c->runtime);JS_SetContextOpaque(c->ctx,c);
    c->memory=JS_NewObject(c->ctx);c->random=JS_NewCFunction(c->ctx,random_number,"random",0);c->deadline=seconds()+.05;
    char *wrapped=array_resize(NULL,strlen(source)+4,1);sprintf(wrapped,"(%s)",source);
    c->function=JS_Eval(c->ctx,wrapped,strlen(wrapped),"creature-controller",JS_EVAL_TYPE_GLOBAL);free(wrapped);
    if(!JS_IsFunction(c->ctx,c->function)){controller_free(c);return NULL;}return c;
}
static double get_number(JSContext *ctx,JSValueConst obj,const char *key,double fallback){
    JSValue v=JS_GetPropertyStr(ctx,obj,key);double n=fallback;if(!JS_IsUndefined(v)&&JS_ToFloat64(ctx,&n,v)<0)n=fallback;JS_FreeValue(ctx,v);return n;
}
static void put_number(JSContext *ctx,JSValue obj,const char *key,double n){JS_SetPropertyStr(ctx,obj,key,JS_NewFloat64(ctx,n));}
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
        b3ContactData contact;JS_SetPropertyUint32(ctx,touching,i,JS_NewBool(ctx,b3Body_GetContactData(body,&contact,1)>0));
    }
    put_number(ctx,s,"mass",mass);JS_SetPropertyStr(ctx,s,"centerOfMass",vector(ctx,Vector3Scale(center,mass>0?1/mass:0)));
    JS_SetPropertyStr(ctx,s,"angles",angles);JS_SetPropertyStr(ctx,s,"rates",rates);JS_SetPropertyStr(ctx,s,"touching",touching);JS_SetPropertyStr(ctx,s,"positions",positions);JS_SetPropertyStr(ctx,s,"submerged",submerged);JS_SetPropertyStr(ctx,s,"magnets",magnet_state(ctx,p,c));return s;
}
static int assigned(const Character *design,int key){
    if(key<=0||key>=128)return 0;
    for(int i=1;i<design->count;i++)if(design->blocks[i].joint&&(design->blocks[i].negative==key||design->blocks[i].positive==key))return 1;return 0;
}
static int controller_step(Controller *controller,const Physics *p,const Character *design,float controls[128]){
    JSContext *ctx=controller->ctx;controller->deadline=seconds()+.004;
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
    JS_FreeValue(ctx,result);return valid;
}
void world_trial_stop(void){controller_free(trial);trial=NULL;memset(trial_controls,0,sizeof(trial_controls));}
int world_trial_begin(void){world_trial_stop();if(installed)trial=controller_new(installed,1,installed_hz);return trial!=NULL;}
int world_trial_step(Physics *p,const Character *c){
    if(!trial||(p->steps%(60/trial->hz)==0&&!controller_step(trial,p,c,trial_controls)))return 0;
    physics_drive(p,c,trial_controls);b3World_Step(p->world,1.f/60,8);physics_sample(p,c);return 1;
}
JSValue world_install(JSContext *ctx,JSValueConst args){
    JSValue code=JS_GetPropertyStr(ctx,args,"source"),name=JS_GetPropertyStr(ctx,args,"name");
    const char *source=JS_ToCString(ctx,code),*label=JS_ToCString(ctx,name);JSValue result=JS_UNDEFINED;
    double hz=get_number(ctx,args,"hz",10);
    Controller *probe=source&&strlen(source)<=16384&&(hz==10||hz==20||hz==30||hz==60)?controller_new(source,1,hz):NULL;
    if(!probe)result=JS_ThrowTypeError(ctx,"Controller must be a JavaScript function(t, sensors, memory, random) returning key letters or key strengths 0..1; up to 16 KiB, hz 10/20/30/60");
    else {world_trial_stop();installed_hz=hz;free(installed);installed=strdup(source);snprintf(installed_name,sizeof(installed_name),"%s",label?label:"Creature");controller_free(probe);}
    JS_FreeCString(ctx,source);JS_FreeCString(ctx,label);JS_FreeValue(ctx,code);JS_FreeValue(ctx,name);return result;
}
static Creature *spawn(const Character *design,const char *source,const char *name,uint32_t seed,int hz,float x,float z){
    Controller *controller=controller_new(source,seed,hz);if(!controller)return NULL;
    if(!world.next_id){world.next_id=1;world.physics=physics_world(1);}
    if(world.count==world.capacity){world.capacity=world.capacity?world.capacity*2:16;world.creatures=array_resize(world.creatures,world.capacity,sizeof(Creature));}
    Creature *c=&world.creatures[world.count++];memset(c,0,sizeof(*c));c->id=world.next_id++;snprintf(c->name,sizeof(c->name),"%s",name);c->controller=controller;
    character_copy(&c->design,design);physics_attach(&c->physics,&c->design,world.physics,x,z,1);c->physics.time=world.age;
    Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);c->root_height=p.y-fmaxf(terrain_height(x,z),WATER_LEVEL);return c;
}
int world_drop_cargo(float x,float z,int material){
    Character box={0};character_add(&box,-1,0,0,0,BLOCK_BOX,1);box.blocks[0].material=material;box.blocks[0].finish=FINISH_STRIPE;
    Creature *cargo=spawn(&box,"function(){return ''}","Cargo",1,10,x,z);character_clear(&box);return cargo?cargo->id:0;
}
JSValue world_release(JSContext *ctx,const Character *design,JSValueConst args){
    if(!installed||!design->count)return JS_ThrowTypeError(ctx,"Build a character and install a learned controller first");
    int index=world.next_id?world.next_id-1:0,plot=index%256;float angle=plot*2.399963f,radius=5*sqrtf(plot);
    float x=get_number(ctx,args,"x",cosf(angle)*radius),z=get_number(ctx,args,"z",sinf(angle)*radius);
    if(!isfinite(x)||!isfinite(z)||fabsf(x)>WORLD_RADIUS-8||fabsf(z)>WORLD_RADIUS-8)return JS_ThrowRangeError(ctx,"Spawn must be inside the 512 m world; the sea surrounds the central 200 m ground");
    Creature *c=spawn(design,installed,installed_name,(uint32_t)get_number(ctx,args,"seed",index+1),installed_hz,x,z);
    if(!c)return JS_ThrowInternalError(ctx,"Controller failed to initialize");
    printf("CREATURE %d born: %s, %d parts\n",c->id,c->name,c->design.count);return JS_NewInt32(ctx,c->id);
}
JSValue world_state(JSContext *ctx){
    JSValue result=JS_NewObject(ctx),list=JS_NewArray(ctx);put_number(ctx,result,"deaths",world.deaths);put_number(ctx,result,"seconds",world.age);
    JSValue terrain=JS_NewObject(ctx);put_number(ctx,terrain,"radius",WORLD_RADIUS);put_number(ctx,terrain,"waterLevel",WATER_LEVEL);
    JS_SetPropertyStr(ctx,terrain,"harbor",vector(ctx,(Vector3){112,0,20}));JS_SetPropertyStr(ctx,terrain,"seaTrial",vector(ctx,(Vector3){125,-2,10}));
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
        float ground=terrain_height(p.x,p.z);int sea=ground<WATER_LEVEL;
        int fallen=!isfinite(p.x)||!isfinite(p.y)||!isfinite(p.z)||(!c->design.anchored&&
            (p.y<(sea?WATER_LEVEL-3:ground-.5f)||(c->design.count>1&&up<.15f)||(!sea&&c->root_height>1.2f&&p.y<ground+.65f)));
        if(c->physics.steps>180&&fallen)c->fallen+=1.f/60;else if(c->fallen<100)c->fallen=0;
        if(c->fallen>2){printf("CREATURE %d removed: %s after %.1fs\n",c->id,c->name,c->physics.steps/60.0);
            physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);world.creatures[i]=world.creatures[--world.count];world.deaths++;
        }else i++;
    }
}
void world_close(void){
    world_trial_stop();
    for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);}
    if(world.next_id)b3DestroyWorld(world.physics);free(world.creatures);memset(&world,0,sizeof(world));free(installed);installed=NULL;
}
static void save_json(JSContext *ctx,JSValueConst value,const char *path){
    JSValue json=JS_JSONStringify(ctx,value,JS_UNDEFINED,JS_UNDEFINED);const char *source=JS_ToCString(ctx,json);
    char temp[256];snprintf(temp,sizeof(temp),"%s.tmp",path);FILE *f=source?fopen(temp,"w"):NULL;
    if(f){int good=fputs(source,f)>=0;if(fclose(f)!=0)good=0;if(good)rename(temp,path);else remove(temp);}
    JS_FreeCString(ctx,source);JS_FreeValue(ctx,json);
}
void world_save(JSContext *ctx){
    JSValue save=world_state(ctx),list=JS_GetPropertyStr(ctx,save,"creatures");put_number(ctx,save,"version",1);put_number(ctx,save,"nextId",world.next_id);put_number(ctx,save,"installedHz",installed_hz);
    if(installed){JS_SetPropertyStr(ctx,save,"installed",JS_NewString(ctx,installed));JS_SetPropertyStr(ctx,save,"name",JS_NewString(ctx,installed_name));}
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];JSValue item=JS_GetPropertyUint32(ctx,list,i),poses=JS_NewArray(ctx);
        JS_SetPropertyStr(ctx,item,"blueprint",character_json(ctx,&c->design));JS_SetPropertyStr(ctx,item,"source",JS_NewString(ctx,c->controller->source));
        put_number(ctx,item,"hz",c->controller->hz);put_number(ctx,item,"seed",c->controller->seed);put_number(ctx,item,"rootHeight",c->root_height);put_number(ctx,item,"startX",c->physics.start.x);put_number(ctx,item,"startZ",c->physics.start.z);
        c->controller->deadline=seconds()+.004;JSValue memory=JS_JSONStringify(c->controller->ctx,c->controller->memory,JS_UNDEFINED,JS_UNDEFINED);
        const char *m=JS_ToCString(c->controller->ctx,memory);if(m)JS_SetPropertyStr(ctx,item,"memory",JS_NewString(ctx,m));JS_FreeCString(c->controller->ctx,m);JS_FreeValue(c->controller->ctx,memory);
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
void world_load(JSContext *ctx){
    FILE *f=fopen("/workspace/blockwalker-world.json","r");if(!f)return;fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);
    if(size<0||size>128*1024*1024){fclose(f);return;}char *source=array_resize(NULL,size+1,1);size_t n=fread(source,1,size,f);source[n]=0;fclose(f);
    JSValue save=JS_ParseJSON(ctx,source,n,"saved-world");free(source);if(JS_IsException(save)){JS_FreeValue(ctx,JS_GetException(ctx));return;}
    if(get_number(ctx,save,"version",0)!=1){JS_FreeValue(ctx,save);return;}
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
                creature->id=get_number(ctx,item,"id",creature->id);creature->physics.steps=get_number(ctx,item,"seconds",0)*60;creature->root_height=get_number(ctx,item,"rootHeight",1);creature->fallen=get_number(ctx,item,"fallenSeconds",0);creature->physics.start.x=get_number(ctx,item,"startX",creature->physics.start.x);creature->physics.start.z=get_number(ctx,item,"startZ",creature->physics.start.z);
                JSValue memory=JS_GetPropertyStr(ctx,item,"memory");const char *m=JS_ToCString(ctx,memory);
                if(m){creature->controller->deadline=seconds()+.004;JSValue value=JS_ParseJSON(creature->controller->ctx,m,strlen(m),"controller-memory");if(!JS_IsException(value)){JS_FreeValue(creature->controller->ctx,creature->controller->memory);creature->controller->memory=value;}}
                JS_FreeCString(ctx,m);JS_FreeValue(ctx,memory);
                JSValue poses=JS_GetPropertyStr(ctx,item,"poses");
                for(int j=0;j<c.count;j++){JSValue pose=JS_GetPropertyUint32(ctx,poses,j);double p[13]={0};p[6]=1;int valid=1;
                    for(int k=0;k<13;k++){JSValue v=JS_GetPropertyUint32(ctx,pose,k);if(JS_ToFloat64(ctx,&p[k],v)<0||!isfinite(p[k]))valid=0;JS_FreeValue(ctx,v);}JS_FreeValue(ctx,pose);
                    if(valid){b3BodyId b=creature->physics.parts[j].body;b3Body_SetTransform(b,(b3Pos){p[0],p[1],p[2]},(b3Quat){{p[3],p[4],p[5]},p[6]});b3Body_SetLinearVelocity(b,(b3Vec3){p[7],p[8],p[9]});b3Body_SetAngularVelocity(b,(b3Vec3){p[10],p[11],p[12]});}
                }JS_FreeValue(ctx,poses);
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
                }JS_FreeValue(ctx,local);JS_FreeValue(ctx,magnet);
            }
        }JS_FreeValue(ctx,magnets);JS_FreeValue(ctx,item);
    }
    world.deaths=get_number(ctx,save,"deaths",0);world.age=get_number(ctx,save,"seconds",0);int next_id=get_number(ctx,save,"nextId",0);if(next_id>0&&!world.next_id)world.physics=physics_world(1);world.next_id=fmax(world.next_id,next_id);
    JS_FreeValue(ctx,list);JS_FreeValue(ctx,save);
}
