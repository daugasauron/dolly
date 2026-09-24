#include "world.c"
#include <assert.h>
#include <sys/stat.h>

static void drive(const Character *c,float controls[128],float throttle){for(int i=0;i<c->count;i++){Block b=c->blocks[i];if(b.joint==BLOCK_WHEEL){controls[b.positive]=fmaxf(0,throttle);controls[b.negative]=fmaxf(0,-throttle);}}}
static void ok(JSContext *ctx,JSValue result){
    if(JS_IsException(result)){JSValue error=JS_GetException(ctx);const char *text=JS_ToCString(ctx,error);fprintf(stderr,"IMPORT CHECK: %s\n",text);JS_FreeCString(ctx,text);JS_FreeValue(ctx,error);assert(0);}JS_FreeValue(ctx,result);
}
static char *json_text(JSContext *ctx,JSValueConst value){JSValue text=JS_JSONStringify(ctx,value,JS_UNDEFINED,JS_UNDEFINED);const char *s=JS_ToCString(ctx,text);char *copy=strdup(s);JS_FreeCString(ctx,s);JS_FreeValue(ctx,text);return copy;}
static void ticks(int n){for(int i=0;i<n;i++)world_step();}
static void install(JSContext *ctx){
    JSValue args=JS_NewObject(ctx);JS_SetPropertyStr(ctx,args,"source",JS_NewString(ctx,"function(t,s,m){m.calls=(m.calls||0)+1;return ''}"));JS_SetPropertyStr(ctx,args,"name",JS_NewString(ctx,"Import probe"));put_number(ctx,args,"hz",60);ok(ctx,world_install(ctx,args));JS_FreeValue(ctx,args);
}
static void reject_world(JSContext *ctx,JSValue save){
    assert(save_json(ctx,save,"/workspace/invalid-world.json"));World before=world;char *program=installed;
    JSValue result=world_import(ctx,"/workspace/invalid-world.json");assert(JS_IsException(result));JS_FreeValue(ctx,JS_GetException(ctx));JS_FreeValue(ctx,result);
    assert(world.creatures==before.creatures&&world.age==before.age&&world.count==before.count&&world.delivery_count==before.delivery_count&&installed==program);JS_FreeValue(ctx,save);
}
static void roundtrip(JSContext *ctx,const char *path){
    assert(save_world(ctx,path));JSValue original=read_json(ctx,path),items=JS_GetPropertyStr(ctx,original,"creatures");char *before=json_text(ctx,items);JS_FreeValue(ctx,items);
    char *program=strdup(installed);ok(ctx,world_import(ctx,path));assert(!strcmp(program,installed));free(program);
    JSValue restored=read_json(ctx,"/workspace/blockwalker-world.json");items=JS_GetPropertyStr(ctx,restored,"creatures");char *after=json_text(ctx,items);assert(!strcmp(before,after));free(before);free(after);
    JS_FreeValue(ctx,items);JS_FreeValue(ctx,original);JS_FreeValue(ctx,restored);
}
int main(int argc,char **argv){
    JSRuntime *rt=JS_NewRuntime();JSContext *ctx=JS_NewContext(rt);Character car={0},copy={0};character_car(&car);
    car.blocks[1].material=MATERIAL_HULL;car.blocks[2].finish=FINISH_STRIPE;
    ok(ctx,world_save_design(ctx,&car,0));assert(world.design_count==1&&!world.designs[0].source);assert(world_save(ctx));world_close();world_load(ctx);
    assert(!world.designs[0].source);install(ctx);ok(ctx,world_open_design(ctx,0,&copy));assert(!installed&&copy.count==car.count);character_clear(&copy);
    assert(world_export_design(ctx,&car,0,"/workspace/manual-design.json"));install(ctx);assert(world_export_design(ctx,&car,1,"/workspace/programmed-design.json"));
    int sea=0;ok(ctx,world_import_design(ctx,&copy,&sea,"/workspace/programmed-design.json"));assert(sea&&installed_hz==60&&installed&&copy.count==car.count&&!memcmp(car.blocks,copy.blocks,car.count*sizeof(Block)));
    char *program=strdup(installed);Character *unchanged=&copy;Block *blocks=copy.blocks;
    JSValue bad=read_json(ctx,"/workspace/programmed-design.json");JS_SetPropertyStr(ctx,bad,"source",JS_NewString(ctx,"function {"));assert(save_json(ctx,bad,"/workspace/invalid-design.json"));JS_FreeValue(ctx,bad);
    JSValue result=world_import_design(ctx,unchanged,&sea,"/workspace/invalid-design.json");assert(JS_IsException(result));JS_FreeValue(ctx,JS_GetException(ctx));JS_FreeValue(ctx,result);assert(copy.blocks==blocks&&sea&&!strcmp(installed,program));free(program);
    ok(ctx,world_import_design(ctx,&copy,&sea,"/workspace/manual-design.json"));assert(!installed&&!sea);install(ctx);assert(character_save(&car,"/workspace/legacy.character"));ok(ctx,world_import_design(ctx,&copy,&sea,"/workspace/legacy.character"));assert(!installed&&copy.count==car.count);
    character_clear(&copy);install(ctx);
    Creature *driver=spawn(&car,"function(t,s,m){m.calls=(m.calls||0)+1;return ''}","Carrier",2,60,0,12);int id=driver->id;world.player=id;
    int cargo=world_drop_cargo(0,NAN,16.5f,MATERIAL_ALLOY);ticks(90);driver=world_find(id);driver->physics.parts[8].magnet_power=1;drive(&car,driver->controls,1);
    int steps=0;while(b3Body_GetPosition(world_find(cargo)->physics.parts[0].body).z<30&&steps++<1200)world_step();assert(steps<1200);drive(&car,world_find(id)->controls,0);ticks(120);
    assert(world_find(cargo)->held_by==id);roundtrip(ctx,"/workspace/loaded-world.json");assert(world_find(cargo)->held_by==id&&b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    for(int fault=0;fault<7;fault++){
        JSValue bad=read_json(ctx,"/workspace/loaded-world.json"),list=JS_GetPropertyStr(ctx,bad,"creatures"),first=JS_GetPropertyUint32(ctx,list,0),second=JS_GetPropertyUint32(ctx,list,1);
        if(fault==0)put_number(ctx,second,"id",id);
        if(fault==1){JSValue poses=JS_GetPropertyStr(ctx,first,"poses"),pose=JS_GetPropertyUint32(ctx,poses,0);JS_SetPropertyUint32(ctx,pose,6,JS_NewFloat64(ctx,0));JS_FreeValue(ctx,pose);JS_FreeValue(ctx,poses);}
        if(fault==2)JS_SetPropertyStr(ctx,first,"memory",JS_NewString(ctx,"invalid"));
        if(fault==3)JS_SetPropertyStr(ctx,first,"source",JS_NewString(ctx,"function {"));
        if(fault==4){JSValue magnets=JS_GetPropertyStr(ctx,first,"magnets"),magnet=JS_GetPropertyUint32(ctx,magnets,8);put_number(ctx,magnet,"creature",999999);JS_FreeValue(ctx,magnet);JS_FreeValue(ctx,magnets);}
        if(fault==5)put_number(ctx,bad,"nextId",1);
        if(fault==6)JS_SetPropertyStr(ctx,bad,"format",JS_NewString(ctx,"blockwalker-design"));
        JS_FreeValue(ctx,first);JS_FreeValue(ctx,second);JS_FreeValue(ctx,list);reject_world(ctx,bad);
    }
    const char *blocked[]={"/workspace/blockwalker-world.previous.json","/workspace/blockwalker-world.json.tmp"};
    for(int i=0;i<2;i++){
        remove(blocked[i]);assert(mkdir(blocked[i],0700)==0);World before=world;
        JSValue result=world_import(ctx,"/workspace/loaded-world.json");assert(JS_IsException(result));JS_FreeValue(ctx,JS_GetException(ctx));JS_FreeValue(ctx,result);
        assert(world.creatures==before.creatures&&world.count==before.count&&world.age==before.age&&world_find(cargo)->held_by==id);remove(blocked[i]);
    }
    driver=world_find(id);drive(&car,driver->controls,.65f);steps=0;while(b3Body_GetPosition(world_find(cargo)->physics.parts[0].body).z<33.7f&&steps++<600)world_step();assert(steps<600);
    drive(&car,world_find(id)->controls,0);ticks(120);world_find(id)->physics.parts[8].magnet_power=0;ticks(180);assert(world.delivery_count==1&&world_cargo_score(-1)==1);
    roundtrip(ctx,"/workspace/delivered-world.json");assert(world.delivery_count==1&&world_cargo_score(-1)==1);ticks(120);assert(world.delivery_count==1);
    JSValue duplicate=read_json(ctx,"/workspace/delivered-world.json"),deliveries=JS_GetPropertyStr(ctx,duplicate,"deliveries"),delivery=JS_GetPropertyUint32(ctx,deliveries,0);JS_SetPropertyUint32(ctx,deliveries,1,delivery);JS_FreeValue(ctx,deliveries);reject_world(ctx,duplicate);
    if(argc==2){
        assert(save_world(ctx,"/workspace/pre-legacy-world.json"));JSValue old=read_json(ctx,argv[1]),before=JS_GetPropertyStr(ctx,old,"creatures");int count=get_number(ctx,before,"length",0);assert(count>0);ok(ctx,world_import(ctx,argv[1]));assert(world.count==count);
        JSValue updated=read_json(ctx,"/workspace/blockwalker-world.json"),after=JS_GetPropertyStr(ctx,updated,"creatures");
        const char *fields[]={"id","name","blueprint","source","poses","memory","seed","hz","seconds","magnets"};
        for(int i=0;i<count;i++){
            JSValue a=JS_GetPropertyUint32(ctx,before,i),b=JS_GetPropertyUint32(ctx,after,i);
            for(int k=0;k<10;k++){JSValue x=JS_GetPropertyStr(ctx,a,fields[k]),y=JS_GetPropertyStr(ctx,b,fields[k]);char *p=json_text(ctx,x),*q=json_text(ctx,y);assert(!strcmp(p,q));free(p);free(q);JS_FreeValue(ctx,x);JS_FreeValue(ctx,y);}
            JS_FreeValue(ctx,a);JS_FreeValue(ctx,b);
        }
        JSValue old_designs=JS_GetPropertyStr(ctx,old,"designs");int designs=get_number(ctx,old_designs,"length",0);assert(world.design_count>=designs);
        for(int i=0;i<designs;i++){JSValue item=JS_GetPropertyUint32(ctx,old_designs,i),source=JS_GetPropertyStr(ctx,item,"source");const char *code=JS_ToCString(ctx,source);assert(!strcmp(world.designs[i].source,code));JS_FreeCString(ctx,code);JS_FreeValue(ctx,source);JS_FreeValue(ctx,item);}
        printf("LEGACY IMPORT: %d original creatures and %d programs preserved, including poses, velocities, memory, seeds and magnets\n",count,designs);
        JS_FreeValue(ctx,old_designs);JS_FreeValue(ctx,old);JS_FreeValue(ctx,updated);JS_FreeValue(ctx,before);JS_FreeValue(ctx,after);ok(ctx,world_import(ctx,"/workspace/pre-legacy-world.json"));
    }
    assert(world_save(ctx));puts("IMPORT: manual/programmed/legacy designs, exact loaded and delivered world round trips, eight rejected corrupt worlds, backup/write rollback, unchanged workshop and persistent cargo credit passed");
    world_close();character_clear(&car);JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
