#include "world.c"
#include <assert.h>
static int courier(Data*ctx,Value catalog){
 Value item=value_at(ctx,catalog,30),blocks=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source");Character design={0};assert(read_character(ctx,blocks,&design));const char*source=value_text(ctx,code);
 Creature*c=spawn(&design,source,"Blue depot compatibility",1,20,0,0);assert(c);set_spawn_height(c,8);c->team=2;int id=c->id;
 character_clear(&design);value_text_free(ctx,source);value_free(ctx,code);value_free(ctx,blocks);value_free(ctx,item);return id;
}
static double memory(int id,const char*key){Controller*c=world_find(id)->controller;return get_number(c->ctx,c->memory,key,0);}
static void step(void){world_step();assert(!world.deaths);for(int i=0;i<world.count;i++)if(world.creatures[i].error[0]){printf("FAULT %s\n",world.creatures[i].error);assert(0);}}
int main(void){
 Data*ctx=data_new(256*1024*1024);Value catalog=read_catalog(ctx);terrain_select(0);int id=courier(ctx,catalog),cargo=world_drop_cargo(4,.485,0,MATERIAL_ALLOY);
 for(int i=0;i<45*60;i++){step();assert(memory(id,"job")==0&&!world_find(cargo)->held_by&&!world.delivery_count);}
 puts("MISSING DEPOT: real nearby neutral cargo left unclaimed for45s, no fault");world_close();
 terrain_select(1);id=courier(ctx,catalog);cargo=world_drop_cargo(4,.485,0,MATERIAL_ALLOY);int loaded=0;
 for(int i=0;i<120*60;i++){step();loaded=magnet_holds(world_find(id),world_find(cargo))&&physics_position(&world_find(cargo)->physics.parts[0]).y>12;if(loaded)break;}
 assert(loaded);printf("VALID DEPOT: ordinary pickup and airborne load at%.3fs\n",world.age);
 // Keep the real body state and grip; remove only the Blue destination metadata.
 depot_count=terrain_depot_count(0);int supported=-1000,released=0,held=1;
 for(int i=0;i<100*60;i++){step();Creature*c=world_find(cargo),*air=world_find(id);float force=cargo_support_force(c,&air->physics),weight=creature_mass(c)*b3Length(b3World_GetGravity(world.physics));if(force>.75f*weight)supported=i;int now=magnet_holds(air,c);
  if(held&&!now){b3Pos p=physics_position(&c->physics.parts[0]);b3WorldTransform pose=physics_transform(&c->physics.parts[0]);Vector3 half=block_half(c->design.blocks[0]);float gap=INFINITY;for(int corner=0;corner<8;corner++){b3Pos edge=b3TransformWorldPoint(pose,(b3Vec3){(corner&1?1:-1)*half.x,(corner&2?1:-1)*half.y,(corner&4?1:-1)*half.z});gap=fminf(gap,edge.y-terrain_height(edge.x,edge.z));}printf("MISSING DESTINATION RELEASE t%.3f support%.3f gap%.5f\n",world.age,force,gap);assert(i-supported<12&&gap>-.1&&gap<.15);released=1;break;}held=now;
 }
 assert(released&&!world.delivery_count);
 for(int i=0;i<20*60;i++){step();assert(!world_find(cargo)->held_by&&!world.delivery_count);}
 depot_count=terrain_depot_count(1);int collected=0;
 for(int i=0;i<100*60;i++){step();collected=magnet_holds(world_find(id),world_find(cargo));if(collected)break;}
 assert(collected);printf("RESTORED DEPOT: ordinary cargo work resumes with real grip at%.3fs\n",world.age);
 world_close();value_free(ctx,catalog);data_close(ctx);return 0;
}
