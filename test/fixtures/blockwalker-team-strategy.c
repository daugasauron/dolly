#include "world.c"
#include <assert.h>

static int catalog_spawn(Data *ctx,Value list,const char *program,float x,float z){
    for(int i=0;i<value_length(ctx,list);i++){
        Value item=value_at(ctx,list,i),path=value_get(ctx,item,"program");const char *file=value_text(ctx,path);int matches=file&&!strcmp(file,program);value_text_free(ctx,file);value_free(ctx,path);
        if(matches){Character design={0};Value blocks=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source"),anchor=value_get(ctx,item,"anchored");assert(read_character(ctx,blocks,&design,0));design.anchored=value_truth(ctx,anchor);const char *source=value_text(ctx,code);Creature *c=spawn(&design,source,program,1,20,x,z);assert(c);int id=c->id;c->team=1;character_clear(&design);value_text_free(ctx,source);value_free(ctx,code);value_free(ctx,blocks);value_free(ctx,anchor);value_free(ctx,item);return id;}
        value_free(ctx,item);
    }assert(0);return 0;
}
static int body(float x,float y,float z,int team,int cargo){int id=world_drop_cargo(x,y,z,MATERIAL_ALLOY);Creature *c=world_find(id);assert(c);c->team=team;c->cargo=cargo;return id;}
static void tick(int id,float keys[128]){Creature *c=world_find(id);c->physics.steps+=3;if(!controller_step(c->controller,&c->physics,&c->design,keys)){fprintf(stderr,"%s: %s\n",c->name,c->controller->error);assert(0);}}
static double memory(int id,const char *key){Controller *c=world_find(id)->controller;return get_number(c->ctx,c->memory,key,0);}
static void targets(Data *ctx,Value catalog,const char *program){
    terrain_select(6);int gun=catalog_spawn(ctx,catalog,program,50,0);int friend=body(51,35,-14,1,0),neutral=body(52,35,-17,0,0),enemy=body(55,35,-22,2,0),outside=body(90,35,-4,2,0),cargo=body(57,35,-19,2,1),down=body(58,35,-25,2,0);
    body(56,1,-20,2,0);Creature *c=world_find(down);b3Body_SetTransform(c->physics.parts[0].body,(b3Pos){58,35,-25},(b3Quat){1,0,0,0});float keys[128];tick(gun,keys);assert(memory(gun,"target")==enemy);
    world_find(enemy)->team=1;tick(gun,keys);assert(memory(gun,"target")==0);
    world_find(outside)->team=1;world_find(friend)->team=2;tick(gun,keys);assert(memory(gun,"target")==friend);
    world_find(neutral)->team=2;int supply=body(52,34,-17,0,1);world_find(supply)->supply=1;
    // A real magnetic grasp makes the farther aircraft the cargo carrier.
    Character carrier={0};character_add(&carrier,-1,0,1,0,BLOCK_BOX,0);int head=character_add(&carrier,0,0,0,0,BLOCK_MAGNET,1);assert(head>=0);carrier.blocks[head].axis=1;carrier.blocks[head].direction=-1;carrier.blocks[head].positive='E';carrier.blocks[head].negative='Q';
    Creature *loaded=spawn(&carrier,"return function() return {} end","Cargo carrier",1,20,60,-26);assert(loaded);int loaded_id=loaded->id;loaded->team=2;set_spawn_height(loaded,35);int payload=body(60,33,-26,0,1);world_find(payload)->supply=1;loaded=world_find(loaded_id);magnet_drive(&loaded->physics,head,loaded->design.blocks[head],1,0);update_magnet_owners();assert(world_find(payload)->held_by==loaded_id);tick(gun,keys);assert(memory(gun,"target")==loaded_id);
    character_clear(&carrier);world_close();printf("TEAM TARGETING %s: opposing airborne only, combat boundary, grounded/cargo/neutral/friendly exclusion, supply carrier priority pass\n",program);
    (void)cargo;(void)supply;
}
static void trajectory(Data *ctx,Value catalog,const char *program){
    terrain_select(0);int gun=catalog_spawn(ctx,catalog,program,0,0);Creature *g=world_find(gun);int head=-1;for(int i=0;i<g->design.count;i++)if(g->design.blocks[i].joint==BLOCK_MAGNET){head=i;break;}assert(head>=0);
    b3WorldTransform pose=physics_transform(&g->physics.parts[head]);Block block=g->design.blocks[head];b3Vec3 axis={0};((float *)&axis)[block.axis]=block.direction;b3Pos a=b3TransformWorldPoint(pose,b3MulSV(1.02f,axis));
    int ammo=body(a.x,a.y,a.z,1,1),enemy=body(a.x,22,a.z-30,2,0);g=world_find(gun);magnet_drive(&g->physics,head,block,1,0);update_magnet_owners();assert(world_find(ammo)->held_by==gun);
    float flight=2.55f,gravity=4;Creature *round=world_find(ammo);b3Vec3 velocity={0,(22-a.y+gravity*flight*flight/2)/flight,-30/flight};b3Body_SetLinearVelocity(round->physics.parts[0].body,velocity);
    float half=flight/2;int friend=body(a.x,a.y+velocity.y*half-gravity*half*half/2,a.z+velocity.z*half,1,0);
    g=world_find(gun);Controller *controller=g->controller;put_number(controller->ctx,controller->memory,"shots",0);put_number(controller->ctx,controller->memory,"at",-5);value_set(controller->ctx,controller->memory,"phase",value_string(controller->ctx,"spin"));float keys[128];tick(gun,keys);
    assert(memory(gun,"target")==enemy);assert(memory(gun,"shots")==0);assert(memory(gun,"blockedBy")==friend);assert(keys[block.positive]>0);
    Creature *clear=world_find(friend);b3Body_SetTransform(clear->physics.parts[0].body,(b3Pos){a.x+15,a.y+velocity.y*half-gravity*half*half/2,a.z+velocity.z*half},b3Quat_identity);tick(gun,keys);
    assert(memory(gun,"shots")==1);assert(keys[block.negative]>0);world_close();printf("BALLISTIC SAFETY %s: actual loaded magnet holds fire for friendly body; same shot releases after the body clears trajectory\n",program);
}
static void pairing(Data *ctx,Value catalog,const char *program,const char *loader_program,float offset){
    terrain_select(0);int gun=catalog_spawn(ctx,catalog,program,0,0),loader=catalog_spawn(ctx,catalog,loader_program,offset,2);
    Character decoy={0};decoy.anchored=1;character_add(&decoy,-1,0,0,0,BLOCK_BOX,0);Creature *base=spawn(&decoy,"return function() return {} end","Unrelated anchored assembly",1,20,offset/2,0);assert(base);base->team=1;character_clear(&decoy);
    float keys[128];tick(gun,keys);tick(loader,keys);assert(memory(gun,"loader")==loader);assert(memory(loader,"station")==gun);
    world_close();printf("RELOAD COORDINATION %s: actuator-discovered launcher and loader ignore nearer unrelated anchored teammate\n",program);
}
static void retry_handoff(Data *ctx,Value catalog,const char *program,const char *loader_program,float offset,int initial_ready){
    terrain_select(0);int gun=catalog_spawn(ctx,catalog,program,0,0),loader=catalog_spawn(ctx,catalog,loader_program,offset,2);
    for(int i=0;i<20*60;i++)world_step();
    int ammo=body(4.4f,.485f,0,1,1);Creature *g=world_find(gun);Controller *c=g->controller;
    if(initial_ready){
        radio_send(&world_find(loader)->physics,RADIO_READY,ammo);float keys[128];tick(gun,keys);
        Value phase=value_get(c->ctx,c->memory,"phase");const char *name=value_text(c->ctx,phase);assert(name&&!strcmp(name,"load")&&memory(gun,"ammo")==ammo);value_text_free(c->ctx,name);value_free(c->ctx,phase);
        for(int i=0;i<16*60;i++)world_step();assert(memory(gun,"misloads")==1);
    }
    int loader_grip=0,gun_grip=0;double loaded_at=0;
    for(int i=0;i<120*60&&!gun_grip;i++){
        world_step();assert(!world.deaths);for(int j=0;j<world.count;j++)assert(!world.creatures[j].error[0]);
        int owner=world_find(ammo)->held_by;if(owner==loader){loader_grip=1;if(!loaded_at)loaded_at=world.age;}if(owner==gun)gun_grip=1;
    }
    if(!loader_grip||!gun_grip){g=world_find(gun);printf("RETRY GUN %s\n",controller_memory_lua(g->controller,NULL));g=world_find(loader);printf("RETRY LOADER %s\n",controller_memory_lua(g->controller,NULL));}
    assert(loader_grip&&gun_grip);printf("HANDOFF RETRY %s (%s): 1.4 m off-center round regripped by loader at %.3f s and physically handed back to launcher at %.3f s\n",program,initial_ready?"initial ready report":"lost ready report",loaded_at,world.age);world_close();
}
static void neutral_logistics(Data *ctx,Value catalog){
    terrain_select(0);int courier=catalog_spawn(ctx,catalog,"programs/east-air-courier.lua",0,10),scout=catalog_spawn(ctx,catalog,"programs/suzume-dispatch-lookout.lua",0,15);float keys[128];tick(courier,keys);
    body(1,.485f,10,1,1);body(2,.485f,10,2,1);int parcel=body(7,.485f,10,0,1);assert(!world_find(parcel)->supply);
    Character grappler={0};character_add(&grappler,-1,0,0,0,BLOCK_BOX,0);int head=character_add(&grappler,0,1,0,0,BLOCK_MAGNET,1);assert(head>=0);grappler.blocks[head].axis=0;grappler.blocks[head].direction=1;
    Creature *holding=spawn(&grappler,"return function() return {} end","Active neutral payload",1,20,3,12);assert(holding);int holding_id=holding->id;holding->cargo=1;int target=body(5,.485f,12,0,0);holding=world_find(holding_id);magnet_drive(&holding->physics,head,holding->design.blocks[head],1,0);update_magnet_owners();assert(world_find(target)->held_by==holding_id);character_clear(&grappler);
    Controller *c=world_find(courier)->controller;put_number(c->ctx,c->memory,"ts",-20);tick(courier,keys);assert(memory(courier,"job")==parcel);
    tick(scout,keys);assert(memory(scout,"report")==parcel);
    Creature *air=world_find(courier);for(int i=0;i<air->design.count;i++)if(air->physics.parts[i].owner==i){b3BodyId body=air->physics.parts[i].body;b3WorldTransform pose=b3Body_GetTransform(body);pose.p.x+=3;b3Body_SetTransform(body,pose.p,pose.q);}
    world_find(parcel)->delivered=1;tick(courier,keys);c=world_find(courier)->controller;Value phase=value_get(c->ctx,c->memory,"phase"),goal=value_get(c->ctx,c->memory,"goal"),x=value_at(c->ctx,goal,0);const char *text=value_text(c->ctx,phase);assert(text&&!strcmp(text,"seek")&&fabs(x.number-3)<.01&&memory(courier,"job")==0);value_text_free(c->ctx,text);value_free(c->ctx,x);value_free(c->ctx,goal);value_free(c->ctx,phase);
    world_close();puts("NEUTRAL LOGISTICS: starter cargo accepted; team ammunition and active payloads excluded; unavailable jobs re-seek in place");
}
int main(void){Data *ctx=data_new(256*1024*1024);assert(ctx);Value catalog=read_catalog(ctx);assert(value_is_array(catalog));const char *programs[]={"programs/tengu-east-cargo-slinger.lua","programs/hosen-channel-flak.lua"};const char *loaders[]={"programs/koban-east-loading-shuttle.lua","programs/koban-channel-loading-shuttle.lua"};for(int i=0;i<2;i++){targets(ctx,catalog,programs[i]);trajectory(ctx,catalog,programs[i]);pairing(ctx,catalog,programs[i],loaders[i],i?20:16);retry_handoff(ctx,catalog,programs[i],loaders[i],i?20:16,1);}retry_handoff(ctx,catalog,programs[0],loaders[0],16,0);neutral_logistics(ctx,catalog);value_free(ctx,catalog);data_close(ctx);return 0;}
