#include "world.c"
#include <assert.h>
static void physics_ticks(Physics *p,Character *c,int n,float command){
 float controls[128]={0};for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_WINCH)controls[command<0?c->blocks[i].negative:c->blocks[i].positive]=fabsf(command);
 for(int i=0;i<n;i++){physics_drive(p,c,controls);b3World_Step(p->world,1.f/60,8);physics_sample(p,c);}
}
static void hang(Physics *p,int i,float length){
 PhysicsPart *part=&p->parts[i];b3BodyId parent=b3Joint_GetBodyA(part->joint);b3Pos top=b3Body_GetWorldPoint(parent,b3Joint_GetLocalFrameA(part->joint).p);
 b3Body_SetTransform(part->body,(b3Pos){top.x,top.y-length,top.z},b3Quat_identity);b3Body_SetLinearVelocity(part->body,b3Vec3_zero);b3Body_SetAngularVelocity(part->body,b3Vec3_zero);part->winch_length=length;b3DistanceJoint_SetLengthRange(part->joint,.005f,length);
}
static int mechanics(void){
 Character c={.anchored=1},loaded={0};Physics p={0};character_add(&c,-1,0,2,0,BLOCK_BOX,4);int winch=character_add(&c,0,1,2,0,BLOCK_WINCH,1);character_add(&c,winch,1,1,0,BLOCK_MAGNET,3);
 assert(character_validate(&c));assert(character_save(&c,"/tmp/winch.character")&&character_load(&loaded,"/tmp/winch.character"));assert(loaded.blocks[winch].travel==8);character_clear(&loaded);
 physics_start(&p,&c);assert(!B3_ID_EQUALS(p.parts[0].body,p.parts[winch].body)&&B3_ID_EQUALS(p.parts[winch].body,p.parts[2].body));
 b3Body_SetTransform(p.parts[0].body,(b3Pos){0,12,0},b3Quat_identity);hang(&p,winch,3);physics_ticks(&p,&c,180,0);
 c.blocks[winch].force=2;float before=p.parts[winch].winch_length;physics_ticks(&p,&c,600,-1);assert(fabsf(p.parts[winch].winch_length-before)<.02f);
 printf("WINCH BLOCK: weak motor length %.6f / load weight %.6f\n",p.parts[winch].winch_length,4*b3Body_GetMass(p.parts[winch].body));
 c.blocks[winch].force=24;physics_ticks(&p,&c,180,-1);float raised=p.parts[winch].winch_length;assert(before-raised>1&&raised>=1);
 physics_ticks(&p,&c,180,0);assert(fabsf(p.parts[winch].angle-raised)<.015f&&p.max_separation<.02f);physics_ticks(&p,&c,120,1);assert(p.parts[winch].winch_length>raised+1.5f);
 printf("WINCH BLOCK: powered reeling %.6f m; payout %.6f; separation %.6f\n",before-raised,p.parts[winch].winch_length,p.max_separation);
 b3World_SetGravity(p.world,b3Vec3_zero);hang(&p,winch,2);p.parts[winch].winch_length=5;b3DistanceJoint_SetLengthRange(p.parts[winch].joint,.005f,5);b3Pos slack=physics_position(&p.parts[winch]);physics_ticks(&p,&c,120,1);assert(b3Length(b3SubPos(slack,physics_position(&p.parts[winch])))<1e-5f);
 puts("WINCH BLOCK: slack cable and payout cannot push");physics_stop(&p);character_clear(&c);
 character_add(&c,-1,0,2,0,BLOCK_BOX,4);for(int x=1;x<=3;x++)character_add(&c,x-1,x,2,0,BLOCK_BOX,4);winch=character_add(&c,3,3,1,0,BLOCK_WINCH,1);character_add(&c,winch,3,0,0,BLOCK_MAGNET,3);
 physics_start(&p,&c);b3World_SetGravity(p.world,b3Vec3_zero);b3Body_SetTransform(p.parts[0].body,(b3Pos){0,10,0},b3Quat_identity);hang(&p,winch,3);physics_ticks(&p,&c,90,-1);
 b3Vec3 momentum=b3Vec3_zero;for(int i=0;i<c.count;i++)if(p.parts[i].owner==i)momentum=b3Add(momentum,b3MulSV(b3Body_GetMass(p.parts[i].body),b3Body_GetLinearVelocity(p.parts[i].body)));
 float angular=b3Body_GetAngularVelocity(p.parts[0].body).z;printf("WINCH BLOCK: off-center anchor rotates chassis %.6f, momentum %.8f\n",angular,b3Length(momentum));assert(fabsf(angular)>.1f&&b3Length(momentum)<.0001f);physics_stop(&p);character_clear(&c);return 0;
}

static Data *ctx;
static void ticks(int count){for(int i=0;i<count;i++){world_step();assert(!world.deaths);for(int j=0;j<world.count;j++)assert(!world.creatures[j].error[0]);}}
static void set_command(int id,int command){Controller *c=world_find(id)->controller;put_number(c->ctx,c->memory,"command",command);}
static Creature *reopen(int id){assert(world_save(ctx));world_close();world_load(ctx);Creature *c=world_find(id);assert(c);return c;}
static void reject(int id,int variant){
 assert(world_save(ctx));Value save=read_data(ctx,"/workspace/slopyard-world.lua"),list=value_get(ctx,save,"creatures"),row=value_at(ctx,list,0),winches=value_get(ctx,row,"winches"),state=value_at(ctx,winches,1);
 switch(variant){
  case 0:put_number(ctx,state,"paidOut",0);break;
  case 1:put_number(ctx,state,"paidOut",9);break;
  case 2:value_set(ctx,state,"paidOut",value_string(ctx,"2"));break;
  case 3:value_set_at(ctx,winches,1,VALUE_NULL);break;
  case 4:value_set(ctx,row,"winches",value_array(ctx));break;
  case 5:value_set_at(ctx,winches,0,value_table(ctx));break;
  case 6:put_number(ctx,save,"version",4);break;
 }
 assert(save_data(ctx,save,"/tmp/bad-world.lua"));value_free(ctx,state);value_free(ctx,winches);value_free(ctx,row);value_free(ctx,list);value_free(ctx,save);
 Creature *before=world_find(id);float length=before->physics.parts[1].winch_length;int count=world.count;Value result=world_import(ctx,"/tmp/bad-world.lua");assert(value_is_error(result));value_free(ctx,value_exception(ctx));assert(world_find(id)==before&&world.count==count&&before->physics.parts[1].winch_length==length);
}
int main(void){
 ctx=data_new(256*1024*1024);terrain_select(0);assert(mechanics()==0);
 Character design={.anchored=1};character_add(&design,-1,0,2,0,BLOCK_BOX,4);character_add(&design,0,1,2,0,BLOCK_WINCH,1);character_add(&design,1,1,1,0,BLOCK_MAGNET,3);
 design.blocks[1].negative='R';design.blocks[1].positive='F';design.blocks[2].negative='Q';design.blocks[2].positive='E';design.blocks[2].axis=1;design.blocks[2].direction=-1;
 assert(character_validate(&design));
 const char *source="return function(t, s, m)\n  (m).paid = (at((s).winches, 1)).paidOut;\n  (m).tension = (at((s).winches, 1)).tension;\n  (m).distance = at((s).angles, 1);\n  do return {E = 1, R = ((((m).command or 0) < 0) and 1 or 0), F = ((((m).command or 0) > 0) and 1 or 0)} end\nend\n";
 Creature *machine=spawn(&design,source,"Cable test",42,60,0,0);assert(machine);int id=machine->id;
 b3Body_SetTransform(machine->physics.parts[0].body,(b3Pos){0,12,0},b3Quat_identity);b3Body_SetTransform(machine->physics.parts[1].body,(b3Pos){0,9,0},b3Quat_identity);machine->physics.parts[1].winch_length=3;b3DistanceJoint_SetLengthRange(machine->physics.parts[1].joint,.005f,3);
 int cargo=world_drop_cargo(0,7.01f,0,MATERIAL_ALLOY);assert(cargo);ticks(180);machine=world_find(id);assert(b3Body_IsValid(machine->physics.parts[2].magnet_target));assert(world_find(cargo)->held_by==id);
 world_find(cargo)->cargo=0;ticks(3);assert(world_find(cargo)->held_by==id);
 Value observer=physics_sensors(ctx,&world_find(cargo)->physics,&world_find(cargo)->design,.05);assert(get_number(ctx,observer,"carriedBy",0)==id&&get_number(ctx,observer,"magnetCount",0)==1);value_free(ctx,observer);
 machine=reopen(id);assert(!world_find(cargo)->cargo&&world_find(cargo)->held_by==id&&world_find(cargo)->magnet_count==1&&magnet_holds(machine,world_find(cargo)));world_find(cargo)->cargo=1;
 puts("CHARACTER CAPTURE: physical ownership and self-sensor survive reopening a noncargo target");
 float before=machine->physics.parts[1].winch_length;double tension=get_number(machine->controller->ctx,machine->controller->memory,"tension",-1);
 printf("SUSPENDED %.6f m / cable tension %.6f N / cargo y %.6f\n",before,tension,physics_position(&world_find(cargo)->physics.parts[0]).y);assert(tension>10&&tension<12);
 for(int i=0;i<20;i++){machine=reopen(id);assert(machine->physics.parts[1].winch_length==before&&b3Body_IsValid(machine->physics.parts[2].magnet_target)&&world.count==2);}
 ticks(120);assert(fabsf(machine->physics.parts[1].angle-before)<.01f);set_command(id,-1);ticks(180);float raised=machine->physics.parts[1].winch_length;assert(before-raised>1&&raised>=1);set_command(id,0);ticks(120);machine=reopen(id);assert(machine->physics.parts[1].winch_length==raised);set_command(id,1);ticks(120);float paid=machine->physics.parts[1].winch_length;assert(paid>raised+1.5f);set_command(id,0);ticks(120);
 assert(world_find(cargo)->held_by==id);printf("LOADED REOPEN x20 / reeling %.6f m / payout %.6f m / cargo retained\n",before-raised,paid-raised);
 for(int i=0;i<7;i++)reject(id,i);puts("INVALID CABLE STATE: 7 imports rejected with current world intact");
 machine->physics.parts[1].winch_length=6;b3DistanceJoint_SetLengthRange(machine->physics.parts[1].joint,.005f,6);for(int j=0;j<world.count;j++)for(int k=0;k<world.creatures[j].design.count;k++)if(world.creatures[j].physics.parts[k].owner==k){b3Body_SetLinearVelocity(world.creatures[j].physics.parts[k].body,b3Vec3_zero);b3Body_SetAngularVelocity(world.creatures[j].physics.parts[k].body,b3Vec3_zero);}
 float distance=machine->physics.parts[1].angle;machine=reopen(id);assert(machine->physics.parts[1].winch_length==6&&fabsf(machine->physics.parts[1].angle-distance)<.00002f);puts("SLACK REOPEN: paid-out length retained independently of anchor distance");
 assert(world_export_design(ctx,&design,0,"/tmp/winch-design.lua"));Character loaded={0};int sea=0;Value imported=world_import_design(ctx,&loaded,&sea,"/tmp/winch-design.lua");assert(!value_is_error(imported)&&loaded.count==3&&loaded.blocks[1].joint==BLOCK_WINCH&&loaded.blocks[1].travel==8);value_free(ctx,imported);character_clear(&loaded);character_clear(&design);world_close();
 character_add(&design,-1,0,0,0,BLOCK_BOX,0);character_add(&design,0,1,0,0,BLOCK_WINCH,1);character_add(&design,1,1,1,0,BLOCK_BOX,0);character_add(&design,0,0,1,0,BLOCK_BOX,0);assert(character_validate(&design));
 machine=spawn(&design,"return function()\n  do return {} end\nend\n","Rigid bridged cable",42,10,0,0);id=machine->id;assert(!b3Joint_IsValid(machine->physics.parts[1].joint)&&machine->physics.parts[1].winch_length==1);machine=reopen(id);assert(machine->physics.parts[1].winch_length==1);puts("BRIDGED ENDPOINT: disabled cable round-trip retains valid length");
 character_clear(&design);world_close();
 character_add(&design,-1,0,0,0,BLOCK_BOX,0);machine=spawn(&design,"return function()\n  do return {} end\nend\n","Legacy box",42,10,0,0);id=machine->id;assert(world_save(ctx));
 Value old=read_data(ctx,"/workspace/slopyard-world.lua"),list=value_get(ctx,old,"creatures"),row=value_at(ctx,list,0);put_number(ctx,old,"version",4);value_set(ctx,row,"winches",VALUE_NIL);value_set(ctx,row,"source",value_string(ctx,"function(){return ''}"));
 Value old_designs=value_get(ctx,old,"designs");for(int i=0;i<value_length(ctx,old_designs);i++){Value design=value_at(ctx,old_designs,i);value_set(ctx,design,"source",value_string(ctx,"function(){return ''}"));value_free(ctx,design);}value_free(ctx,old_designs);assert(save_data(ctx,old,"/tmp/old-world.lua"));value_free(ctx,row);value_free(ctx,list);value_free(ctx,old);
 Value legacy=world_import(ctx,"/tmp/old-world.lua");assert(!value_is_error(legacy));value_free(ctx,legacy);ticks(60);machine=reopen(id);assert(world.count==1&&machine->design.blocks[0].joint==BLOCK_BOX);character_clear(&design);puts("OLDER WORLD: format 4 imports, advances and reopens in format 6");
 world_close();
 design.anchored=1;assert(character_add(&design,-1,0,0,0,BLOCK_BOX,0)==0);assert(character_add(&design,0,1,0,0,BLOCK_MAGNET,3)==1);design.blocks[1].axis=0;design.blocks[1].direction=1;design.blocks[1].negative='Q';design.blocks[1].positive='E';assert(character_validate(&design));
 const char *grip="return function(t,s,m) return m.off and {Q=1} or {E=1} end";
 int left=spawn(&design,grip,"Left grip",1,20,-2,0)->id;design.blocks[1].x=-1;design.blocks[1].direction=-1;assert(character_validate(&design));
 int right=spawn(&design,grip,"Right grip",2,20,2,0)->id;cargo=world_drop_cargo(0,.5f,0,MATERIAL_ALLOY);world_find(cargo)->cargo=0;ticks(60);
 assert(world_find(cargo)->magnet_count==2&&magnet_holds(world_find(left),world_find(cargo))&&magnet_holds(world_find(right),world_find(cargo)));
 Creature swap=world.creatures[0];world.creatures[0]=world.creatures[1];world.creatures[1]=swap;
 reopen(cargo);assert(world_find(cargo)->magnet_count==2&&world_find(cargo)->held_by==right);
 observer=physics_sensors(ctx,&world_find(cargo)->physics,&world_find(cargo)->design,.05);assert(get_number(ctx,observer,"magnetCount",0)==2);value_free(ctx,observer);
 put_number(world_find(right)->controller->ctx,world_find(right)->controller->memory,"off",1);ticks(12);assert(world_find(cargo)->magnet_count==1&&world_find(cargo)->held_by==left);
 put_number(world_find(left)->controller->ctx,world_find(left)->controller->memory,"off",1);ticks(12);assert(world_find(cargo)->magnet_count==0&&world_find(cargo)->held_by==0);
 puts("MULTIPLE CAPTURES: physical attachment count survives reordered reload and independent releases");
 character_clear(&design);world_close();data_close(ctx);return 0;
}
