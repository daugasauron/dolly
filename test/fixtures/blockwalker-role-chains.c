#include "world.c"
#include <assert.h>
static int model(Data *ctx,Value catalog,int index,float x,float y,float z,int team){
    Value item=value_at(ctx,catalog,index),blocks=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source"),label=value_get(ctx,item,"name");
    Character design={0};assert(read_character(ctx,blocks,&design,0));const char *source=value_text(ctx,code),*name=value_text(ctx,label);
    Creature *c=spawn(&design,source,name,index+1,20,x,z);assert(c);set_spawn_height(c,y);c->team=team;int id=c->id;
    character_clear(&design);value_text_free(ctx,name);value_text_free(ctx,source);value_free(ctx,label);value_free(ctx,code);value_free(ctx,blocks);value_free(ctx,item);return id;
}
static double memory(int id,const char *key){Controller*c=world_find(id)->controller;return get_number(c->ctx,c->memory,key,0);}
static void step(void){world_step();assert(!world.deaths);for(int i=0;i<world.count;i++)if(world.creatures[i].error[0]){printf("ERROR %d %s\n",world.creatures[i].id,world.creatures[i].error);assert(0);}}
static int dispatch(Data *ctx,Value catalog){
    terrain_select(8);int drone=model(ctx,catalog,83,84,18,-70,1);
    double entered=0;for(int i=0;i<100*60;i++){step();b3Pos p=physics_position(&world_find(drone)->physics.parts[0]);if(p.x<32){entered=world.age;break;}}
    assert(entered>0);printf("RESCUE PATROL physically entered own combat half after%.3fs\n",entered);
    int guard=model(ctx,catalog,45,-5,.65,-70,1),porter=model(ctx,catalog,11,10,1.85,-42,1);Creature*c=world_find(porter);b3Pos root=physics_position(&c->physics.parts[0]);b3Quat q={{0,0,.70710678f},.70710678f};
    for(int i=0;i<c->physics.count;i++)if(c->physics.parts[i].owner==i){b3WorldTransform p=physics_transform(&c->physics.parts[i]);b3Vec3 v=b3RotateVector(q,b3SubPos(p.p,root));b3Body_SetTransform(c->physics.parts[i].body,(b3Pos){root.x+v.x,root.y+v.y,root.z+v.z},b3MulQuat(q,p.q));}
    int helped=0,responded=0,claimed=0,pursued=0,deferred=0,gripped=0,released=0,was_held=0,supported_release=0,last_support=-1000;
    for(int i=0;i<180*60;i++){step();for(int n=0;n<world.radio_count;n++){RadioMessage*r=&world.radio[n];if(r->from==guard&&r->target==porter&&r->kind==RADIO_HELP)helped=1;if(r->from==drone&&r->target==porter&&r->kind==RADIO_CLAIM)claimed=1;}responded|=memory(drone,"responding")==porter;pursued|=memory(guard,"target")==porter;deferred|=pursued&&claimed&&memory(guard,"target")==0;
        Creature*rescuer=world_find(drone);Creature*load=world_find(porter);b3WorldTransform pose=physics_transform(&load->physics.parts[0]);float support=cargo_support_force(load,&rescuer->physics),gravity=b3Length(b3World_GetGravity(world.physics));
        int held=magnet_holds(rescuer,load);gripped|=held;
        if(support>creature_mass(load)*gravity*.75f)last_support=i;
        if(was_held&&!held){float low=creature_bounds(load,pose.p).low,floor=terrain_height(pose.p.x,pose.p.z),up=b3RotateVector(pose.q,b3Vec3_axisY).y;
            assert(i-last_support<12&&up>.93f&&low>floor-.1f&&low<floor+.2f);supported_release=1;printf("SUPPORTED RELEASE %.3f support%.3f up%.6f ground-gap%.5f\n",world.age,support,up,low-floor);
        }
        was_held=held;released|=supported_release&&!held&&memory(drone,"rescues")>0;
        if(i%1800==1799){c=world_find(drone);b3Pos p=physics_position(&c->physics.parts[0]);printf("RESCUE t%.2f drone%.2f %.2f %.2f help%d response%d claim%d defer%d grip%d release%d\n",world.age,p.x,p.y,p.z,helped,responded,claimed,deferred,gripped,released);}
        if(released)break;
    }
    printf("RESCUE RESULT help%d response%d claim%d defer%d grip%d release%d\n",helped,responded,claimed,deferred,gripped,released);int pass=helped&&responded&&claimed&&deferred&&gripped&&released;world_close();return pass;
}
static int quarry(Data*ctx,Value catalog){
 terrain_select(8);int truck=model(ctx,catalog,48,78,.65,-30,1),core=model(ctx,catalog,49,78,4.6,-54,0),courier=model(ctx,catalog,30,163,8,18,1);
 model(ctx,catalog,50,78,4.6,-55.5,0);int hauled=0,released=0,reported=0,dispatched=0,collected=0,delivered=0;
 for(int tick=0;tick<650*60;tick++){step();Creature*c=world_find(core);hauled|=magnet_holds(world_find(truck),c);released|=hauled&&!c->held_by&&physics_position(&c->physics.parts[0]).z>-40;
  for(int j=0;j<world.radio_count;j++){RadioMessage*r=&world.radio[j];if(r->from==truck&&r->target==core&&r->kind==RADIO_RELEASE)reported=1;}
  dispatched|=memory(courier,"job")==core&&memory(courier,"dispatchedFrom")==truck;collected|=magnet_holds(world_find(courier),c);delivered=c->delivered;
  if(tick%1800==1799||delivered){b3Pos p=physics_position(&c->physics.parts[0]);printf("QUARRY t%.3f core%.3f %.3f %.3f haul%d release%d report%d dispatch%d collect%d delivered%d\n",world.age,p.x,p.y,p.z,hauled,released,reported,dispatched,collected,delivered);}
  if(delivered)break;
 }
 int pass=hauled&&released&&reported&&dispatched&&collected&&delivered;printf("QUARRY RESULT pass%d\n",pass);world_close();return pass;
}
int main(void){
    Data*ctx=data_new(256*1024*1024);assert(ctx);Value catalog=read_catalog(ctx);
    int rescue=dispatch(ctx,catalog),freight=quarry(ctx,catalog);
    value_free(ctx,catalog);data_close(ctx);assert(rescue&&freight);return 0;
}
