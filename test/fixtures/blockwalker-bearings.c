#include "world.c"
#include <assert.h>
static Data *embedded_context;
static int linked(b3BodyId a,b3BodyId b){
 if(B3_ID_EQUALS(a,b))return 1;
 int count=b3Body_GetJointCount(a);b3JointId *joints=array_resize(NULL,count,sizeof(*joints));count=b3Body_GetJoints(a,joints,count);int found=0;
 for(int i=0;i<count;i++)if(B3_ID_EQUALS(b3Joint_GetBodyA(joints[i]),b)||B3_ID_EQUALS(b3Joint_GetBodyB(joints[i]),b))found=1;
 free(joints);return found;
}
static void bearing_trial(int n,int axis,int sign){
 Character c={.anchored=1},loaded={0};Physics p={0};int u=(axis+1)%3,v=(axis+2)%3,lo=-(n-1)/2,hi=n/2,base[3]={0,7,0},root=0;
 int grid[4][4];for(int i=0;i<4;i++)for(int j=0;j<4;j++)grid[i][j]=-1;
 root=character_add(&c,-1,0,0,0,BLOCK_BOX,4);assert(root==0);for(int y=1;y<=7;y++)root=character_add(&c,root,0,y,0,BLOCK_BOX,4);grid[-lo][-lo]=root;
 for(int distance=1;distance<=6;distance++)for(int a=lo;a<=hi;a++)for(int b=lo;b<=hi;b++)if(abs(a)+abs(b)==distance){
  int xyz[3]={base[0],base[1],base[2]};xyz[u]+=a;xyz[v]+=b;int parent=a?grid[a-lo-(a>0?1:-1)][b-lo]:grid[a-lo][b-lo-(b>0?1:-1)];assert(parent>=0);
  int existing=-1;for(int j=0;j<c.count;j++)if(c.blocks[j].x==xyz[0]&&c.blocks[j].y==xyz[1]&&c.blocks[j].z==xyz[2])existing=j;grid[a-lo][b-lo]=existing>=0?existing:character_add(&c,parent,xyz[0],xyz[1],xyz[2],BLOCK_BOX,4);assert(grid[a-lo][b-lo]>=0);
 }
 int center[3]={base[0],base[1],base[2]};center[axis]+=sign;
 int rotor=character_add(&c,root,center[0],center[1],center[2],BLOCK_TURNTABLE,3);assert(rotor>0);c.blocks[rotor].axis=axis;c.blocks[rotor].size=n;c.blocks[rotor].direction=sign;c.blocks[rotor].force=100*n*n;c.blocks[rotor].speed=1;c.blocks[rotor].negative='Q';c.blocks[rotor].positive='A';assert(character_validate(&c));
 int top[4][4];for(int i=0;i<4;i++)for(int j=0;j<4;j++)top[i][j]=-1;
 for(int distance=0;distance<=6;distance++)for(int a=lo;a<=hi;a++)for(int b=lo;b<=hi;b++)if(abs(a)+abs(b)==distance){
  int xyz[3]={base[0],base[1],base[2]};xyz[axis]+=2*sign;xyz[u]+=a;xyz[v]+=b;
  int parent=distance==0?rotor:a?top[a-lo-(a>0?1:-1)][b-lo]:top[a-lo][b-lo-(b>0?1:-1)];
  int at=character_add(&c,parent,xyz[0],xyz[1],xyz[2],BLOCK_BOX,3);assert(at>0);top[a-lo][b-lo]=at;
 }
 int arm=top[hi-lo][-lo];for(int a=hi+1;a<=hi+3;a++){int xyz[3]={base[0],base[1],base[2]};xyz[axis]+=2*sign;xyz[u]+=a;arm=character_add(&c,arm,xyz[0],xyz[1],xyz[2],BLOCK_BOX,5);assert(arm>0);c.blocks[arm].material=MATERIAL_BALLAST;}
 assert(character_validate(&c));assert(character_save(&c,"/tmp/bearing.character"));assert(character_load(&loaded,"/tmp/bearing.character"));assert(loaded.blocks[rotor].size==n);character_clear(&loaded);
 Value json=character_data(embedded_context,&c);assert(character_from_data(embedded_context,json,&loaded));value_free(embedded_context,json);assert(loaded.blocks[rotor].size==n);character_clear(&loaded);
 Block invalid=c.blocks[rotor];c.blocks[rotor].size=5;assert(!character_validate(&c));c.blocks[rotor]=invalid;
 Block candidate;assert(!character_candidate(&c,rotor,center[0],center[1],center[2],BLOCK_BOX,0,&candidate));
 physics_start(&p,&c);
 if(n>1)for(int a=lo;a<=hi;a++)for(int b=lo;b<=hi;b++){
  int support=grid[a-lo][b-lo];if(support!=root)assert(linked(p.parts[root].body,p.parts[support].body));
  assert(linked(p.parts[rotor].body,p.parts[top[a-lo][b-lo]].body));
 }
 unsigned char keys[128]={0};keys['A']=1;for(int tick=0;tick<480;tick++)physics_step(&p,&c,keys);
 printf("BEARING %dx%d axis %d sign %d parts %d separation %.6f rotation %.4f\n",n,n,axis,sign,c.count,p.max_separation,p.parts[rotor].driven_radians);fflush(stdout);
 assert(p.max_separation<.03f&&p.parts[rotor].driven_radians>5);physics_stop(&p);
 if(n==3&&axis==1&&sign==1){
  Creature *machine=spawn(&c,"return function()\n  do return {A = 1} end\nend\n","Wide bearing",42,60,0,0);assert(machine);int id=machine->id;
  for(int i=0;i<120;i++)world_step();b3WorldTransform before=b3Body_GetTransform(machine->physics.parts[rotor].body);float mass=b3Body_GetMass(machine->physics.parts[root].body);
  for(int cycle=0;cycle<20;cycle++){
   assert(world_save(embedded_context));world_close();world_load(embedded_context);machine=world_find(id);assert(machine&&machine->design.blocks[rotor].size==3);
   b3WorldTransform after=b3Body_GetTransform(machine->physics.parts[rotor].body);assert(b3Length(b3SubPos(before.p,after.p))<.00001f&&fabsf(before.q.s-after.q.s)<.00001f&&fabsf(b3Body_GetMass(machine->physics.parts[root].body)-mass)<.00001f);
  }
  for(int i=0;i<120;i++)world_step();assert(!machine->error[0]&&machine->physics.max_separation<.03f);world_close();
 }
 character_clear(&c);
}
static void base_controls(void){
 Character c={.anchored=1};Physics p={0};unsigned char keys[128]={0};
 character_add(&c,-1,0,0,0,BLOCK_BOX,4);
 int table=character_add(&c,0,0,1,0,BLOCK_TURNTABLE,3);c.blocks[table].size=3;c.blocks[table].speed=1;
 int hinge=character_add(&c,table,1,0,1,BLOCK_HINGE,4);c.blocks[hinge].axis=1;
 int piston=character_add(&c,table,-1,0,1,BLOCK_PISTON,4);c.blocks[piston].axis=0;c.blocks[piston].direction=-1;
 assert(character_validate(&c));physics_start(&p,&c);keys[c.blocks[table].positive]=1;keys[c.blocks[piston].positive]=1;
 for(int i=0;i<120;i++)physics_step(&p,&c,keys);
 assert(fabsf(p.parts[hinge].rate)<.01f&&fabsf(p.parts[hinge].angle)<.01f&&p.parts[piston].angle>1&&p.max_separation<.03f);
 printf("BASE CONTROLS: spinning rotor, stationary hinge rate %.6f, piston %.3f, separation %.6f\n",p.parts[hinge].rate,p.parts[piston].angle,p.max_separation);
 physics_stop(&p);character_clear(&c);
}
static void articulated_contacts(void){
 Character c={.anchored=1};Physics p={0};for(int y=0;y<4;y++)character_add(&c,y-1,0,y,0,BLOCK_BOX,0);
 int hinge=character_add(&c,3,1,3,0,BLOCK_HINGE,1);c.blocks[hinge].axis=2;c.blocks[hinge].limit=150;c.blocks[hinge].force=100;character_add(&c,hinge,2,3,0,BLOCK_BOX,1);
 physics_start(&p,&c);unsigned char keys[128]={0};keys[c.blocks[hinge].negative]=1;for(int i=0;i<600;i++)physics_step(&p,&c,keys);
 ContactForces *forces=part_contacts(&p);double self=0;for(int i=0;i<c.count;i++)self+=forces[i].self;
 printf("ARTICULATED CONTACT angle %.6f force %.3f separation %.6f\n",p.parts[hinge].angle,self,p.max_separation);
 assert(p.parts[hinge].angle<-.5f&&p.parts[hinge].angle> -1.5f&&self>10&&p.max_separation<.03f);free(forces);physics_stop(&p);character_clear(&c);
}
static void compound_contacts(void){
 Character c={0};Physics p={0};character_add(&c,-1,0,0,0,BLOCK_BOX,0);character_add(&c,0,0,1,0,BLOCK_BOX,0);physics_start(&p,&c);
 for(int i=0;i<300;i++)physics_step(&p,&c,(unsigned char[128]){0});
 ContactForces *forces=part_contacts(&p);float weight=4*b3Body_GetMass(p.parts[0].body);
 printf("COMPOUND CONTACTS lower %.5f upper %.5f weight %.5f\n",forces[0].support,forces[1].support,weight);
 assert(fabs(forces[0].support-weight)<.01f&&forces[1].support==0&&forces[1].count==0);free(forces);physics_stop(&p);character_clear(&c);
}
static void mechanics(void){
    Character c={0};Physics p={0};character_add(&c,-1,0,2,0,BLOCK_BOX,0);character_add(&c,0,1,2,0,BLOCK_BOX,0);
    PhysicsPose poses[2]={{{{-.5f,5,0},{{0,0,0},1}},{0,0,1},{0}},{{{.5f,5,0},{{0,0,0},1}},{0,0,-1},{0}}};
    physics_attach_poses(&p,&c,physics_world(0),0,0,0,poses,1);p.owns_world=1;
    assert(B3_ID_EQUALS(p.parts[0].body,p.parts[1].body));b3BodyId body=p.parts[0].body;
    assert(b3Length( b3Body_GetLinearVelocity(body))<1e-5f);b3Matrix3 inertia=b3Body_GetLocalRotationalInertia(body);b3Vec3 omega=b3Body_GetAngularVelocity(body);
    assert(fabsf(b3MulMV(inertia,omega).y-p.parts[0].mass)<1e-4f);
    b3World_SetGravity(p.world,b3Vec3_zero);for(int i=0;i<300;i++)b3World_Step(p.world,1.f/60,8);
    assert(fabsf(b3Length(b3SubPos(physics_position(&p.parts[1]),physics_position(&p.parts[0])))-1)<1e-4f);physics_stop(&p);
    int jet=character_add(&c,1,2,2,0,BLOCK_THRUSTER,1);assert(jet>=0);c.blocks[jet].axis=2;c.blocks[jet].direction=1;
    physics_start(&p,&c);body=p.parts[0].body;b3Body_SetTransform(body,(b3Pos){0,5,0},(b3Quat){{0,0,0},1});b3World_SetGravity(p.world,b3Vec3_zero);
    float controls[128]={0};controls[c.blocks[jet].positive]=1;for(int i=0;i<30;i++){physics_drive(&p,&c,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);}
    assert(fabsf(b3Body_GetAngularVelocity(body).y)>.2f);printf("OFFCENTER THRUSTER %.6f\n",b3Body_GetAngularVelocity(body).y);physics_stop(&p);character_clear(&c);
    character_add(&c,-1,0,1,0,BLOCK_BOX,0);character_add(&c,0,1,1,0,BLOCK_BOX,0);character_add(&c,0,0,1,1,BLOCK_BOX,0);character_add(&c,1,1,1,1,BLOCK_BOX,0);for(int i=0;i<c.count;i++)c.blocks[i].material=MATERIAL_HULL;
    physics_start_sea(&p,&c);for(int i=0;i<600;i++){physics_drive(&p,&c,(float[128]){0});b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);}
    b3Pos floating=physics_position(&p.parts[0]);printf("FLOAT %.6f / submerged %.6f %.6f\n",floating.y,p.parts[0].submerged,p.parts[1].submerged);assert(floating.y> -2.4f&&floating.y< -1);assert(b3RotateVector(physics_transform(&p.parts[0]).q,b3Vec3_axisY).y>.9f);
    physics_stop(&p);character_clear(&c);
}
static void reversed_pistons(void){
 Character c={.anchored=1};Physics p={0};
 character_add(&c,-1,0,0,0,BLOCK_BOX,0);
 character_add(&c,0,0,1,0,BLOCK_PISTON,1);
 character_add(&c,1,1,1,0,BLOCK_BOX,0);
 character_add(&c,2,1,0,0,BLOCK_PISTON,1);
 character_add(&c,3,2,0,0,BLOCK_BOX,0);
 character_add(&c,4,2,0,1,BLOCK_BOX,0);
 character_add(&c,5,1,0,1,BLOCK_BOX,0);
 character_add(&c,6,0,0,1,BLOCK_BOX,0);
 for(int i=1;i<=3;i+=2){c.blocks[i].speed=1;c.blocks[i].force=100;}
 assert(character_validate(&c));physics_start(&p,&c);
 printf("REVERSED PISTON: endpoint type %d, parent type %d\n",b3Body_GetType(p.parts[3].body),b3Body_GetType(p.parts[2].body));fflush(stdout);
 assert(B3_ID_EQUALS(p.parts[0].body,p.parts[3].body)&&!B3_ID_EQUALS(p.parts[0].body,p.parts[2].body));
 float controls[128]={0};controls[c.blocks[1].positive]=controls[c.blocks[3].positive]=1;
 for(int i=0;i<120;i++){physics_drive(&p,&c,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);}
 printf("EXTEND %.6f %.6f separation %.6f\n",p.parts[1].angle,p.parts[3].angle,p.max_separation);fflush(stdout);
 assert(p.parts[1].angle>1.4f&&p.parts[3].angle>1.4f&&fabsf(p.parts[1].angle-p.parts[3].angle)<.01f&&p.max_separation<.03f);
 controls[c.blocks[1].positive]=controls[c.blocks[3].positive]=0;controls[c.blocks[1].negative]=controls[c.blocks[3].negative]=1;
 for(int i=0;i<120;i++){physics_drive(&p,&c,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);}
 printf("RETRACT %.6f %.6f separation %.6f\n",p.parts[1].angle,p.parts[3].angle,p.max_separation);assert(fabsf(p.parts[1].angle)<.03f&&fabsf(p.parts[3].angle)<.03f&&p.max_separation<.03f);
 physics_stop(&p);character_clear(&c);
}

int main(void){
 JSRuntime *rt=JS_NewRuntime();embedded_context=JS_NewContext(rt);assert(character_check()==0);
 for(int n=1;n<=4;n++)for(int axis=0;axis<3;axis++)bearing_trial(n,axis,1);
 for(int axis=0;axis<3;axis++)if(axis!=1)bearing_trial(3,axis,-1);
 base_controls();articulated_contacts();compound_contacts();mechanics();reversed_pistons();
 JS_FreeContext(embedded_context);JS_FreeRuntime(rt);puts("Wide bearing physical trials passed");return 0;
}
