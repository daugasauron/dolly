#include "world.c"
#include <assert.h>
static void ticks(int n){for(int i=0;i<n;i++)world_step();assert(!world.deaths);}
static void keys(const char *text){world.driving=1;memset(world.input,0,sizeof(world.input));for(;*text;text++)world.input[(unsigned char)*text]=1;}
static float z(int id){return b3Body_GetPosition(world_find(id)->physics.parts[0].body).z;}
static void crowded_yard(Data *ctx){
 terrain_select(0);Character rig={0};character_add(&rig,-1,0,0,0,BLOCK_BOX,0);rig.anchored=1;
 Creature *c=spawn(&rig,"return function(t, s, m)\n  (m).cargo = map(filter((s).nearby, function(b)\n    return (function() local value = (b).cargo; if active(value) then return (not active((b).delivered)) else return value end end)()\n  end), function(b)\n    return (b).id\n  end);\n  do return {} end\nend\n","Yard observer",1,60,0,0);int id=c->id;
 for(int i=0;i<18;i++){int crate=world_drop_cargo(3+i%6,NAN,3+i/6,MATERIAL_ALLOY);world_find(crate)->delivered=1;}
 int target=world_drop_cargo(36,NAN,0,MATERIAL_ALLOY);world_drop_cargo(60,NAN,0,MATERIAL_ALLOY);ticks(2);
 c=world_find(id);Value seen=value_get(c->controller->ctx,c->controller->memory,"cargo"),first=value_at(c->controller->ctx,seen,0);int found=0;assert(value_int(c->controller->ctx,&found,first)==0);
 assert(found==target&&get_number(c->controller->ctx,seen,"length",0)==1);value_free(c->controller->ctx,first);value_free(c->controller->ctx,seen);
 printf("CROWDED YARD: controller finds uncollected cargo behind 18 closer deliveries; range remains bounded\n");world_close();character_clear(&rig);
}
static void retained_cargo(Data *ctx){
 terrain_select(0);Character car={0};character_car(&car);int pilot=world_enter(&car,0);assert(pilot);
 int cargo=world_drop_cargo(0,NAN,16.5f,MATERIAL_ALLOY);world_find(cargo)->supply=1;
 world.supply_seed=1;world.next_parcel=world.next_ore=world.next_mine=100000;keys("");ticks(90);keys("EW");
 int steps=0;while(z(cargo)<33.7f&&steps++<1800)ticks(1);assert(steps<1800);keys("");ticks(120);keys("Q");ticks(180);keys("");assert(world.delivery_count==1&&world_find(cargo)->delivered);
 double scored=world.deliveries[0].time;ticks(120*60);assert(world_find(cargo)&&world_find(cargo)->delivered&&world_cargo_score(pilot)==1&&world.count==2);
 assert(world_save(ctx));world_close();world_load(ctx);assert(world_find(cargo)&&world_cargo_score(-1)==1);keys("E");ticks(60);assert(world_find(cargo)->held_by==pilot&&world.delivery_count==1);
 Creature *holder=world_find(pilot);Value sensors=physics_sensors(ctx,&holder->physics,&holder->design,1./60),magnets=value_get(ctx,sensors,"magnets");int identified=0;
 for(int i=0;i<holder->design.count;i++)if(holder->design.blocks[i].joint==BLOCK_MAGNET){Value head=value_at(ctx,magnets,i);identified+=get_number(ctx,head,"creature",0)==cargo&&get_number(ctx,head,"part",-1)==0;value_free(ctx,head);}assert(identified==1);value_free(ctx,magnets);value_free(ctx,sensors);
 printf("RETENTION: scored at %.3f, still physical and grippable at %.3f; score %d, objects %d\n",scored,world.age,world.delivery_count,world.count);assert(save_world(ctx,"/workspace/retained-cargo.lua"));world_close();character_clear(&car);
}
static void program_fault(Data *ctx){
 Character rig={0};character_add(&rig,-1,0,0,0,BLOCK_BOX,0);character_add(&rig,0,0,1,0,BLOCK_HINGE,1);rig.anchored=1;
 Creature *c=spawn(&rig,"return function(t,s,m) m.calls=(m.calls or 0)+1;if t>.2 then error('motor test fault') end;return {A=1} end","Stopped servo",1,60,0,0);int id=c->id;ticks(180);c=world_find(id);assert(c&&c->error[0]);for(int i=0;i<128;i++)assert(c->controls[i]==0);double calls=get_number(c->controller->ctx,c->controller->memory,"calls",0);
 assert(world_save(ctx));world_close();world_load(ctx);ticks(180);c=world_find(id);assert(c&&c->error[0]&&get_number(c->controller->ctx,c->controller->memory,"calls",0)==calls&&c->physics.steps==360);
 printf("STOPPED PROGRAM: %s, calls %.0f, body still simulates after reload\n",c->error,calls);assert(save_world(ctx,"/workspace/stopped-program.lua"));world_close();character_clear(&rig);
}
static void recover(Data *ctx){
 Character rig={0};character_add(&rig,-1,0,0,0,BLOCK_BOX,0);int left=character_add(&rig,0,-1,0,0,BLOCK_THRUSTER,1),right=character_add(&rig,0,1,0,0,BLOCK_THRUSTER,1);
 rig.blocks[left].axis=rig.blocks[right].axis=1;rig.blocks[left].force=rig.blocks[right].force=24;rig.blocks[left].negative='Q';rig.blocks[left].positive='A';rig.blocks[right].negative='W';rig.blocks[right].positive='S';assert(character_upgrade_thrusters(&rig));
 const char *source="return function(t, s, m)\n  (m).calls = ((function() local value = (m).calls; if active(value) then return value else return 0 end end)() + 1);\n  if (t < 110) then\n    do return {} end\n  end\n  local angle = math.atan((-at((s).gravity, 0)), (-at((s).gravity, 1)));\n  local u = math.max((-1), math.min(1, (((-angle) * 0.65) - (at((s).gyroscope, 2) * 0.25))));\n  do return {Q = math.max(0, u), A = math.max(0, (-u)), W = math.max(0, (-u)), S = math.max(0, u)} end\nend\n";
 Creature *c=spawn(&rig,source,"Recovery jets",1,60,0,0);int id=c->id;
 Quaternion q=QuaternionFromAxisAngle((Vector3){0,0,1},PI);for(int i=0;i<rig.count;i++)if(c->physics.parts[i].owner==i){Vector3 p=Vector3RotateByQuaternion(block_position(rig.blocks[i]),q);b3Body_SetTransform(c->physics.parts[i].body,(b3Pos){p.x,p.y+2,p.z},(b3Quat){{q.x,q.y,q.z},q.w});}physics_refresh(&c->physics,&c->design);
 ticks(109*60);c=world_find(id);assert(c&&c->fallen>100);printf("TIPPED: retained %.3f seconds, up %.4f, %d objects\n",c->fallen,b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y,world.count);
 assert(world_save(ctx));world_close();world_load(ctx);ticks(20*60);c=world_find(id);float up=b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y;
 printf("RECOVERY: up %.5f, down %.5f, calls %.0f, separation %.5f\n",up,c->fallen,get_number(c->controller->ctx,c->controller->memory,"calls",0),c->physics.max_separation);assert(up>.9&&c->fallen==0&&c->physics.max_separation<.1f);assert(save_world(ctx,"/workspace/recovered-program.lua"));world_close();
 Physics practice={0};physics_start(&practice,&rig);
 for(int i=0;i<rig.count;i++)if(practice.parts[i].owner==i){Vector3 p=Vector3RotateByQuaternion(block_position(rig.blocks[i]),q);b3Body_SetTransform(practice.parts[i].body,(b3Pos){p.x,p.y+2,p.z},(b3Quat){{q.x,q.y,q.z},q.w});}physics_refresh(&practice,&rig);
 installed=strdup(source);installed_hz=60;assert(world_trial_begin(&practice));for(int i=0;i<129*60;i++)assert(world_trial_step(&practice,&rig));up=b3RotateVector(b3Body_GetRotation(practice.parts[0].body),b3Vec3_axisY).y;assert(up>.9&&practice.steps==129*60);
 printf("PRACTICE RECOVERY: completed %d steps, up %.5f\n",practice.steps,up);world_close();physics_stop(&practice);character_clear(&rig);
}
int main(void){Data *ctx=data_new(256*1024*1024);crowded_yard(ctx);retained_cargo(ctx);program_fault(ctx);recover(ctx);data_close(ctx);return 0;}
