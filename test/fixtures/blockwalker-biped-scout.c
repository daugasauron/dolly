#include "world.c"
#include <assert.h>
static int model(Data*ctx,Value catalog,int index,float x,float y,float z,int team){
 Value item=value_at(ctx,catalog,index),blocks=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source");Character design={0};assert(read_character(ctx,blocks,&design,0));const char*source=value_text(ctx,code);
 Creature*c=spawn(&design,source,"Biped survey mission",index+1,20,x,z);assert(c);set_spawn_height(c,y);c->team=team;int id=c->id;
 character_clear(&design);value_text_free(ctx,source);value_free(ctx,code);value_free(ctx,blocks);value_free(ctx,item);return id;
}
static double memory(int id,const char*key){Controller*c=world_find(id)->controller;return get_number(c->ctx,c->memory,key,0);}
int main(void){Data*ctx=data_new(256*1024*1024);Value catalog=read_catalog(ctx);terrain_select(8);
 int walker=model(ctx,catalog,0,18,7.65,-70,1),courier=model(ctx,catalog,30,85,32,-70,1),enemy=model(ctx,catalog,2,-20,1.65,-60,2),cargo=world_drop_cargo(-8,.485,-70,MATERIAL_ALLOY);
 assert(observation_distance(world_find(cargo),&world_find(courier)->physics)>48);int sight=0,threat=0,dispatch=0,grip=0,delivered=0;float low=-70,high=-70,minup=1;
 for(int i=0;i<400*60;i++){world_step();assert(!world.deaths);for(int j=0;j<world.count;j++)if(world.creatures[j].error[0]){printf("FAULT %s\n",world.creatures[j].error);assert(0);}
  for(int j=0;j<world.radio_count;j++){RadioMessage*r=&world.radio[j];sight|=r->from==walker&&r->target==cargo&&r->kind==RADIO_SIGHT;threat|=r->from==walker&&r->target==enemy&&r->kind==RADIO_THREAT;}
  dispatch|=memory(courier,"job")==cargo&&memory(courier,"dispatchedFrom")==walker;grip|=magnet_holds(world_find(courier),world_find(cargo));delivered=world_find(cargo)->delivered;
  b3WorldTransform pose=physics_transform(&world_find(walker)->physics.parts[0]);low=fminf(low,pose.p.z);high=fmaxf(high,pose.p.z);minup=fminf(minup,b3RotateVector(pose.q,b3Vec3_axisY).y);
  if(i%3600==3599||(delivered&&high-low>4))printf("SURVEY t%.3f sight%d threat%d dispatch%d grip%d delivered%d walkerRange%.3f up%.6f\n",world.age,sight,threat,dispatch,grip,delivered,high-low,minup);
  if(delivered&&high-low>4)break;
 }
 assert(sight&&threat&&dispatch&&grip&&delivered&&high-low>4&&minup>.95);world_close();value_free(ctx,catalog);data_close(ctx);return 0;}
