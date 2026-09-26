#include "world.c"
#include <assert.h>
#include <sys/stat.h>

static void drive(const Character *c,float controls[128],float throttle){for(int i=0;i<c->count;i++){Block b=c->blocks[i];if(b.joint==BLOCK_WHEEL){controls[b.positive]=fmaxf(0,throttle);controls[b.negative]=fmaxf(0,-throttle);}}}
static void ok(Data *ctx,Value result){
    if(value_is_error(result)){Value error=value_exception(ctx);const char *text=value_text(ctx,error);fprintf(stderr,"IMPORT CHECK: %s\n",text);value_text_free(ctx,text);value_free(ctx,error);assert(0);}value_free(ctx,result);
}
static char *lua_text(Data *ctx,Value value){return data_dump(ctx,value,NULL);}
static void same_data(Data *ctx,Value a,Value b){char *x=lua_text(ctx,a),*y=lua_text(ctx,b);if(strcmp(x,y))fprintf(stderr,"JSON differs: %.160s / %.160s\n",x,y);assert(!strcmp(x,y));free(x);free(y);}
static void ticks(int n){for(int i=0;i<n;i++)world_step();}
static void install(Data *ctx){
    Value args=value_table(ctx);value_set(ctx,args,"source",value_string(ctx,"return function(t, s, m)\n  (m).calls = ((function() local value = (m).calls; if active(value) then return value else return 0 end end)() + 1);\n  do return \"\" end\nend\n"));value_set(ctx,args,"name",value_string(ctx,"Import probe"));put_number(ctx,args,"hz",60);ok(ctx,world_install(ctx,args));value_free(ctx,args);
}
static void reject_world(Data *ctx,Value save){
    assert(save_data(ctx,save,"/workspace/invalid-world.lua"));World before=world;char *program=installed;
    Value result=world_import(ctx,"/workspace/invalid-world.lua");assert(value_is_error(result));value_free(ctx,value_exception(ctx));value_free(ctx,result);
    assert(world.creatures==before.creatures&&world.age==before.age&&world.count==before.count&&world.delivery_count==before.delivery_count&&installed==program);value_free(ctx,save);
}
static void roundtrip(Data *ctx,const char *path){
    assert(save_world(ctx,path));Value original=read_data(ctx,path),items=value_get(ctx,original,"creatures");char *before=lua_text(ctx,items);value_free(ctx,items);
    char *program=strdup(installed);ok(ctx,world_import(ctx,path));assert(!strcmp(program,installed));free(program);
    Value restored=read_data(ctx,"/workspace/blockwalker-world.lua");items=value_get(ctx,restored,"creatures");char *after=lua_text(ctx,items);assert(!strcmp(before,after));free(before);free(after);
    value_free(ctx,items);value_free(ctx,original);value_free(ctx,restored);
}
int main(int argc,char **argv){
    Data *ctx=data_new(256*1024*1024);Character car={0},copy={0};character_car(&car);
    car.blocks[1].material=MATERIAL_HULL;car.blocks[2].finish=FINISH_STRIPE;
    ok(ctx,world_save_design(ctx,&car,0));assert(world.design_count==1&&!world.designs[0].source);assert(world_save(ctx));world_close();world_load(ctx);
    assert(!world.designs[0].source);install(ctx);ok(ctx,world_open_design(ctx,0,&copy));assert(!installed&&copy.count==car.count);character_clear(&copy);
    assert(world_export_design(ctx,&car,0,"/workspace/manual-design.lua"));install(ctx);assert(world_export_design(ctx,&car,1,"/workspace/programmed-design.lua"));
    int sea=0;ok(ctx,world_import_design(ctx,&copy,&sea,"/workspace/programmed-design.lua"));assert(sea&&installed_hz==60&&installed&&copy.count==car.count&&!memcmp(car.blocks,copy.blocks,car.count*sizeof(Block)));
    char *program=strdup(installed);Character *unchanged=&copy;Block *blocks=copy.blocks;
    Value bad=read_data(ctx,"/workspace/programmed-design.lua");value_set(ctx,bad,"source",value_string(ctx,"function {"));assert(save_data(ctx,bad,"/workspace/invalid-design.lua"));value_free(ctx,bad);
    Value result=world_import_design(ctx,unchanged,&sea,"/workspace/invalid-design.lua");assert(value_is_error(result));value_free(ctx,value_exception(ctx));value_free(ctx,result);assert(copy.blocks==blocks&&sea&&!strcmp(installed,program));free(program);
    ok(ctx,world_import_design(ctx,&copy,&sea,"/workspace/manual-design.lua"));assert(!installed&&!sea);install(ctx);assert(character_save(&car,"/workspace/legacy.character"));ok(ctx,world_import_design(ctx,&copy,&sea,"/workspace/legacy.character"));assert(!installed&&copy.count==car.count);
    character_clear(&copy);install(ctx);
    Creature *driver=spawn(&car,"return function(t, s, m)\n  (m).calls = ((function() local value = (m).calls; if active(value) then return value else return 0 end end)() + 1);\n  do return \"\" end\nend\n","Carrier",2,60,0,12);int id=driver->id;world.player=id;
    int cargo=world_drop_cargo(0,NAN,16.5f,MATERIAL_ALLOY);ticks(90);driver=world_find(id);driver->physics.parts[8].magnet_power=1;drive(&car,driver->controls,1);
    int steps=0;while(b3Body_GetPosition(world_find(cargo)->physics.parts[0].body).z<30&&steps++<1200)world_step();assert(steps<1200);drive(&car,world_find(id)->controls,0);ticks(120);
    assert(world_find(cargo)->held_by==id);roundtrip(ctx,"/workspace/loaded-world.lua");assert(world_find(cargo)->held_by==id&&b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    for(int fault=0;fault<7;fault++){
        Value bad=read_data(ctx,"/workspace/loaded-world.lua"),list=value_get(ctx,bad,"creatures"),first=value_at(ctx,list,0),second=value_at(ctx,list,1);
        if(fault==0)put_number(ctx,second,"id",id);
        if(fault==1){Value poses=value_get(ctx,first,"poses"),pose=value_at(ctx,poses,0);value_set_at(ctx,pose,6,value_number(ctx,0));value_free(ctx,pose);value_free(ctx,poses);}
        if(fault==2)value_set(ctx,first,"memory",value_string(ctx,"invalid"));
        if(fault==3)value_set(ctx,first,"source",value_string(ctx,"function {"));
        if(fault==4){Value magnets=value_get(ctx,first,"magnets"),magnet=value_at(ctx,magnets,8);put_number(ctx,magnet,"creature",999999);value_free(ctx,magnet);value_free(ctx,magnets);}
        if(fault==5)put_number(ctx,bad,"nextId",1);
        if(fault==6)value_set(ctx,bad,"format",value_string(ctx,"blockwalker-design"));
        value_free(ctx,first);value_free(ctx,second);value_free(ctx,list);reject_world(ctx,bad);
    }
    const char *blocked[]={"/workspace/blockwalker-world.previous.lua","/workspace/blockwalker-world.json.tmp"};
    for(int i=0;i<2;i++){
        remove(blocked[i]);assert(mkdir(blocked[i],0700)==0);World before=world;
        Value result=world_import(ctx,"/workspace/loaded-world.lua");assert(value_is_error(result));value_free(ctx,value_exception(ctx));value_free(ctx,result);
        assert(world.creatures==before.creatures&&world.count==before.count&&world.age==before.age&&world_find(cargo)->held_by==id);remove(blocked[i]);
    }
    driver=world_find(id);drive(&car,driver->controls,.65f);steps=0;while(b3Body_GetPosition(world_find(cargo)->physics.parts[0].body).z<33.7f&&steps++<600)world_step();assert(steps<600);
    drive(&car,world_find(id)->controls,0);ticks(120);world_find(id)->physics.parts[8].magnet_power=0;ticks(180);assert(world.delivery_count==1&&world_cargo_score(-1)==1);
    roundtrip(ctx,"/workspace/delivered-world.lua");assert(world.delivery_count==1&&world_cargo_score(-1)==1);ticks(120);assert(world.delivery_count==1);
    Value duplicate=read_data(ctx,"/workspace/delivered-world.lua"),deliveries=value_get(ctx,duplicate,"deliveries"),delivery=value_at(ctx,deliveries,0);value_set_at(ctx,deliveries,1,delivery);value_free(ctx,deliveries);reject_world(ctx,duplicate);
    Character jet={0};assert(character_add(&jet,-1,0,1,0,BLOCK_BOX,0)==0);assert(character_add(&jet,0,1,1,0,BLOCK_THRUSTER,1)==1);assert(world_export_design(ctx,&jet,0,"/workspace/jet-design.lua"));
    for(int fault=0;fault<2;fault++){
        Value file=read_data(ctx,"/workspace/jet-design.lua"),parts=value_get(ctx,file,"blueprint"),engine=value_at(ctx,parts,1);put_number(ctx,engine,fault?"direction":"negative",fault?-1:'Z');assert(save_data(ctx,file,"/workspace/invalid-jet.lua"));value_free(ctx,engine);value_free(ctx,parts);value_free(ctx,file);
        Value rejected=world_import_design(ctx,&jet,&sea,"/workspace/invalid-jet.lua");assert(value_is_error(rejected));value_free(ctx,value_exception(ctx));value_free(ctx,rejected);assert(jet.count==2&&jet.blocks[1].direction==1&&jet.blocks[1].negative==0);
    }
    Value legacy=read_data(ctx,"/workspace/jet-design.lua"),parts=value_get(ctx,legacy,"blueprint"),engine=value_at(ctx,parts,1);put_number(ctx,legacy,"version",1);put_number(ctx,engine,"negative",'Z');assert(save_data(ctx,legacy,"/workspace/legacy-jet.lua"));value_free(ctx,engine);value_free(ctx,parts);value_free(ctx,legacy);
    ok(ctx,world_import_design(ctx,&jet,&sea,"/workspace/legacy-jet.lua"));assert(jet.count==4&&character_validate(&jet));int positive=0,negative=0;for(int i=0;i<jet.count;i++){Block b=jet.blocks[i];if(b.joint==BLOCK_THRUSTER){positive+=b.positive=='Q'&&b.direction==-1;negative+=b.positive=='Z'&&b.direction==1;}}assert(positive==1&&negative==1);character_clear(&jet);
    if(argc==2){
        assert(save_world(ctx,"/workspace/pre-legacy-world.lua"));Value old=read_data(ctx,argv[1]),before=value_get(ctx,old,"creatures");int count=get_number(ctx,before,"length",0);assert(count>0);ok(ctx,world_import(ctx,argv[1]));assert(world.count==count);
        Value updated=read_data(ctx,"/workspace/blockwalker-world.lua"),after=value_get(ctx,updated,"creatures");
        const char *fields[]={"id","name","source","memory","seed","hz","seconds","controls"};
        for(int i=0;i<count;i++){
            Value a=value_at(ctx,before,i),b=value_at(ctx,after,i);
            for(int k=0;k<sizeof(fields)/sizeof(*fields);k++){Value x=value_get(ctx,a,fields[k]),y=value_get(ctx,b,fields[k]);if(!strcmp(fields[k],"controls")&&value_is_nil(x))x=value_table(ctx);same_data(ctx,x,y);value_free(ctx,x);value_free(ctx,y);}
            Value blueprint=value_get(ctx,a,"blueprint"),converted=value_get(ctx,b,"blueprint");Character expected={0};assert(read_character(ctx,blueprint,&expected,1));Value actual=character_data(ctx,&expected);same_data(ctx,actual,converted);value_free(ctx,actual);value_free(ctx,converted);value_free(ctx,blueprint);character_clear(&expected);
            const char *arrays[]={"poses","magnets"};
            for(int k=0;k<2;k++){
                Value x=value_get(ctx,a,arrays[k]),y=value_get(ctx,b,arrays[k]);int n=get_number(ctx,x,"length",0);assert(get_number(ctx,y,"length",0)>=n);
                for(int j=0;j<n;j++){Value p=value_at(ctx,x,j),q=value_at(ctx,y,j);if(k==1&&value_is_table(p)){
                    const char *saved[]={"power","load","attached","creature","part","local"};for(int n=0;n<6;n++){Value u=value_get(ctx,p,saved[n]),v=value_get(ctx,q,saved[n]);same_data(ctx,u,v);value_free(ctx,u);value_free(ctx,v);}
                }else same_data(ctx,p,q);value_free(ctx,p);value_free(ctx,q);}value_free(ctx,x);value_free(ctx,y);
            }
            value_free(ctx,a);value_free(ctx,b);
        }
        Value old_designs=value_get(ctx,old,"designs");int designs=get_number(ctx,old_designs,"length",0);assert(world.design_count>=designs);
        for(int i=0;i<designs;i++){Value item=value_at(ctx,old_designs,i),source=value_get(ctx,item,"source");const char *code=value_text(ctx,source);assert(!strcmp(world.designs[i].source,code));value_text_free(ctx,code);value_free(ctx,source);value_free(ctx,item);}
        printf("LEGACY IMPORT: %d original creatures and %d programs preserved, including poses, velocities, memory, seeds and magnets\n",count,designs);
        assert(save_data(ctx,old,"/workspace/blockwalker-world.lua"));world_close();world_load(ctx);assert(world.count==count);Value backup=read_data(ctx,"/workspace/blockwalker-world.before-thrusters-001.lua");same_data(ctx,old,backup);value_free(ctx,backup);assert(world_save(ctx));roundtrip(ctx,"/workspace/upgraded-world.lua");
        value_free(ctx,old_designs);value_free(ctx,old);value_free(ctx,updated);value_free(ctx,before);value_free(ctx,after);ok(ctx,world_import(ctx,"/workspace/pre-legacy-world.lua"));
    }
    assert(world_save(ctx));puts("IMPORT: manual/programmed/legacy designs, exact loaded and delivered world round trips, eight rejected corrupt worlds, backup/write rollback, unchanged workshop and persistent cargo credit passed");
    world_close();character_clear(&car);data_close(ctx);return 0;
}
