#include "world.c"
#include <assert.h>
static Value parts(Data *ctx,int observer,double target,int valid){
 lua_State *L=ctx->lua;lua_pushinteger(L,observer);lua_pushcclosure(L,observed_parts,1);lua_pushnumber(L,target);int status=lua_pcall(L,1,1,0);assert((status==LUA_OK)==valid);return value_take(ctx);
}
static void step(int n){for(int i=0;i<n;i++){world_step();assert(!world.deaths);for(int j=0;j<world.count;j++)assert(!world.creatures[j].error[0]);}}
int main(void){
 Data *ctx=data_new(256*1024*1024);terrain_select(0);Character design={0};character_car(&design);
 Creature *car=spawn(&design,"return function(t,s,m) m.observed=s.parts(s.id);return {} end","Observed car",1,20,0,0);assert(car);int id=car->id;
 int near=world_drop_cargo(40,.5f,0,MATERIAL_ALLOY),far=world_drop_cargo(60,.5f,0,MATERIAL_ALLOY);step(120);car=world_find(id);
 Value local=parts(ctx,id,id,1);assert(value_length(ctx,local)==design.count);double support=0;
 for(int i=0;i<design.count;i++){
  Value p=value_at(ctx,local,i);b3WorldTransform actual=physics_transform(&car->physics.parts[i]);
  assert(fabs(get_number(ctx,p,"x",NAN)-actual.p.x)<1e-5&&fabs(get_number(ctx,p,"y",NAN)-actual.p.y)<1e-5&&fabs(get_number(ctx,p,"z",NAN)-actual.p.z)<1e-5);
  Value rotation=value_get(ctx,p,"rotation");for(int j=0;j<4;j++){Value v=value_at(ctx,rotation,j);double n=NAN;assert(value_double(ctx,&n,v)==0&&fabs(n-((float *)&actual.q)[j])<1e-5);value_free(ctx,v);}value_free(ctx,rotation);
  double x=get_number(ctx,p,"axisX",NAN),y=get_number(ctx,p,"axisY",NAN),z=get_number(ctx,p,"axisZ",NAN);assert(fabs(x*x+y*y+z*z-1)<1e-5);
  if(design.blocks[i].joint==BLOCK_WHEEL)assert(get_number(ctx,p,"body",-1)!=0);
  support+=get_number(ctx,p,"supportForce",0);value_free(ctx,p);
 }
 assert(fabs(support-creature_mass(car)*4)<.05*creature_mass(car)*4);
 Value first=value_at(ctx,local,0);put_number(ctx,first,"x",100000);value_free(ctx,first);value_free(ctx,local);
 local=parts(ctx,id,id,1);first=value_at(ctx,local,0);assert(fabs(get_number(ctx,first,"x",NAN))<1);value_free(ctx,first);value_free(ctx,local);
 local=parts(ctx,id,near,1);assert(value_length(ctx,local)==1);value_free(ctx,local);local=parts(ctx,id,far,1);assert(value_length(ctx,local)==0);value_free(ctx,local);
 local=parts(ctx,id,999999,1);assert(value_length(ctx,local)==0);value_free(ctx,local);
 double bad[]={0,-1,.5,INFINITY,NAN,2147483648.};for(int i=0;i<6;i++){Value e=parts(ctx,id,bad[i],0);value_free(ctx,e);}
 assert(world_save(ctx));world_close();world_load(ctx);step(12);car=world_find(id);Value sensed=value_get(car->controller->ctx,car->controller->memory,"observed");assert(value_length(car->controller->ctx,sensed)==design.count);value_free(car->controller->ctx,sensed);
 printf("OBSERVED PARTS: real articulated poses/axes, grounded wheel support %.5f N, fresh copies, range, invalid IDs and controller reload pass\n",support);
 world_close();character_clear(&design);
 design.anchored=0;character_add(&design,-1,0,0,0,BLOCK_BOX,0);character_add(&design,0,1,0,0,BLOCK_MAGNET,3);design.blocks[1].axis=0;design.blocks[1].direction=1;design.blocks[1].positive='E';design.blocks[1].negative='Q';
 Creature *holder=spawn(&design,"return function(t,s,m) return m.off and {Q=1} or {E=1} end","Programmable cargo",1,20,-2,34);assert(holder);id=holder->id;holder->cargo=1;
 near=world_drop_cargo(0,.5f,34,MATERIAL_ALLOY);world_find(near)->cargo=0;step(60);assert(world_find(near)->held_by==id&&world_find(near)->magnet_count==1);
 assert(world_save(ctx));world_close();world_load(ctx);holder=world_find(id);assert(holder->cargo&&world_find(near)->held_by==id&&magnet_holds(holder,world_find(near)));step(60);
 holder->carrier=near;holder->pickup=(Vector3){50,0,34};step(120);assert(!holder->delivered);
 put_number(holder->controller->ctx,holder->controller->memory,"off",1);step(120);assert(holder->delivered&&world_find(near)->held_by==0);
 puts("PROGRAMMABLE CARGO: attachment ownership survives reload; an attached payload cannot score until released");
 world_close();character_clear(&design);
 design.anchored=1;character_add(&design,-1,0,2,0,BLOCK_BOX,0);int winch=character_add(&design,0,1,2,0,BLOCK_WINCH,1);design.blocks[winch].travel=96;design.blocks[winch].force=24;
 assert(character_validate(&design));design.blocks[winch].travel=97;assert(!character_validate(&design));design.blocks[winch].travel=96;
 Physics p={0};physics_start(&p,&design);b3Body_SetTransform(p.parts[0].body,(b3Pos){0,100,0},b3Quat_identity);b3Body_SetTransform(p.parts[winch].body,(b3Pos){0,20,0},b3Quat_identity);
 p.parts[winch].winch_length=80;b3DistanceJoint_SetLengthRange(p.parts[winch].joint,.005f,80);float controls[128]={0};
 for(int tick=0;tick<180;tick++){physics_drive(&p,&design,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&design);}
 assert(fabs(p.parts[winch].angle-80)<.02f);controls[design.blocks[winch].negative]=1;
 for(int tick=0;tick<600;tick++){physics_drive(&p,&design,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&design);}
 printf("LONG WINCH: capacity 96 m, 80 m suspension reels to %.5f m under real load\n",p.parts[winch].angle);assert(p.parts[winch].angle<76&&p.parts[winch].angle>=80-design.blocks[winch].speed*10-.02f&&fabs(p.parts[winch].angle-p.parts[winch].winch_length)<.02f);
 physics_stop(&p);character_clear(&design);data_close(ctx);return 0;
}
