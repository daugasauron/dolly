#include "world.c"
#include <assert.h>
typedef struct {int tug,atlas,crane_supported,crane_released,courier,courier_supported,courier_released,delivered,holder;double crane_support,courier_support;} Transfer;
static Transfer transfers[256];
static int named(const char *name){for(int i=0;i<world.count;i++)if(!strcmp(world.creatures[i].name,name))return world.creatures[i].id;assert(0);return 0;}
int main(int argc,char **argv){
 Data*ctx=data_new(256*1024*1024);assert(ctx);terrain_select(8);
 Value catalog=read_catalog(ctx),selected=value_sequence(ctx,9);int ids[]={7,17,18,19,20,21,22,23,29};
 for(int i=0;i<9;i++){
  Value item=value_at(ctx,catalog,ids[i]-1);assert(value_is_table(item));
  if(ids[i]==22){put_number(ctx,item,"x",112);put_number(ctx,item,"y",8);put_number(ctx,item,"z",8);}
  if(ids[i]==23){put_number(ctx,item,"x",124);put_number(ctx,item,"y",-1);put_number(ctx,item,"z",58);}
  value_set_at(ctx,selected,i,item);
 }
 load_designs(ctx,selected,1);value_free(ctx,selected);value_free(ctx,catalog);assert(world.count==9);
 world.supply_seed=0x243f6a88;world.next_parcel=45;world.next_ore=5;world.next_mine=10;
 int crane=named("Harbor Atlas / luffing crane"),tug=named("Tsubame / harbor tug"),courier=named("Kawasemi / dock courier"),original[256]={0};
 for(int i=0;i<world.count;i++)if(world.creatures[i].cargo)original[world.creatures[i].id]=1;
 int seconds=argc>1?atoi(argv[1]):600,complete=0;
 assert(save_world(ctx,"/workspace/dock-before.lua"));
 for(int tick=0;tick<seconds*60;tick++){
  world_step();assert(!world.deaths);for(int j=0;j<world.count;j++){Creature*c=&world.creatures[j];if(c->error[0])printf("ERROR %d %s\n",c->id,c->error);assert(!c->error[0]);}
  for(int i=0;i<world.count;i++){Creature*c=&world.creatures[i];if(c->id>=256||!original[c->id])continue;Transfer*m=&transfers[c->id];
   int holder=magnet_holds(world_find(crane),c)?crane:magnet_holds(world_find(tug),c)?tug:magnet_holds(world_find(courier),c)?courier:0;
   float weight=creature_mass(c)*b3Length(b3World_GetGravity(world.physics));
   m->tug|=holder==tug;m->atlas|=holder==crane;
   if(holder==crane&&cargo_support_force(c,&world_find(crane)->physics)>weight*.5)m->crane_support=world.age;
   if(holder==courier&&cargo_support_force(c,&world_find(courier)->physics)>weight*.5)m->courier_support=world.age;
   if(m->holder!=holder){b3Pos p=physics_position(&c->physics.parts[0]);printf("TRANSFER %.3f cargo%d from%d to%d at %.4f %.4f %.4f weight%.4f\n",world.age,c->id,m->holder,holder,p.x,p.y,p.z,weight);
    if(m->holder==crane&&holder==0){m->crane_released=1;m->crane_supported=world.age-m->crane_support<.2;printf("CRANE RELEASE supported%d\n",m->crane_supported);}
    if(holder==courier){m->courier=1;printf("COURIER GRIP priorAtlas%d priorSupportedRelease%d\n",m->atlas,m->crane_supported);}
    if(m->holder==courier&&holder==0){m->courier_released=1;m->courier_supported=world.age-m->courier_support<.2;printf("COURIER RELEASE supported%d delivered%d\n",m->courier_supported,c->delivered);}
   }
   m->holder=holder;for(int j=0;j<world.delivery_count;j++){Delivery*d=&world.deliveries[j];if(d->cargo==c->id&&d->carrier==courier&&depots[d->depot].team==world_find(courier)->team)m->delivered=1;}
   if(m->atlas&&m->crane_released&&m->crane_supported&&m->courier&&m->courier_released&&m->courier_supported&&m->delivered){complete=c->id;printf("COMPLETE %.3f cargo%d tug%d atlas1 supportedDock1 courier1 supportedIsland1 score1\n",world.age,c->id,m->tug);break;}
  }
  if(complete)break;
  if(tick%1800==1799){Creature*c=world_find(courier);b3Pos p=physics_position(&c->physics.parts[0]);Value v=value_get(c->controller->ctx,c->controller->memory,"phase");const char*s=value_text(c->controller->ctx,v);printf("STATE %.3f courier %s xyz%.4f %.4f %.4f traffic%.3f job%.0f deliveries%d\n",world.age,s?s:"",p.x,p.y,p.z,get_number(c->controller->ctx,c->controller->memory,"trafficTime",0),get_number(c->controller->ctx,c->controller->memory,"job",0),world_cargo_score(c->id));value_text_free(c->controller->ctx,s);value_free(c->controller->ctx,v);fflush(stdout);}
 }
 assert(save_world(ctx,"/workspace/dock-after.lua"));
 printf("DOCK RESULT complete%d objects%d deaths%d deliveries%d\n",complete,world.count,world.deaths,world.delivery_count);world_close();data_close(ctx);return complete?0:1;
}
