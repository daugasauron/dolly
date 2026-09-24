#include "world.c"
#include <assert.h>
static JSContext *embedded_context;
static int linked(b3BodyId a,b3BodyId b){
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
 JSValue json=character_json(embedded_context,&c);assert(character_from_json(embedded_context,json,&loaded));JS_FreeValue(embedded_context,json);assert(loaded.blocks[rotor].size==n);character_clear(&loaded);
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
  Creature *machine=spawn(&c,"function(){return {A:1}}","Wide bearing",42,60,0,0);assert(machine);int id=machine->id;
  for(int i=0;i<120;i++)world_step();b3WorldTransform before=b3Body_GetTransform(machine->physics.parts[rotor].body);float mass=b3Body_GetMass(machine->physics.parts[root].body);
  assert(world_save(embedded_context));world_close();world_load(embedded_context);machine=world_find(id);assert(machine&&machine->design.blocks[rotor].size==3);
  b3WorldTransform after=b3Body_GetTransform(machine->physics.parts[rotor].body);assert(b3Length(b3SubPos(before.p,after.p))<.00001f&&fabsf(before.q.s-after.q.s)<.00001f&&fabsf(b3Body_GetMass(machine->physics.parts[root].body)-mass)<.00001f);
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
int main(void){
 JSRuntime *rt=JS_NewRuntime();embedded_context=JS_NewContext(rt);assert(character_check()==0);
 for(int n=1;n<=4;n++)for(int axis=0;axis<3;axis++)bearing_trial(n,axis,1);
 for(int axis=0;axis<3;axis++)if(axis!=1)bearing_trial(3,axis,-1);
 base_controls();
 JS_FreeContext(embedded_context);JS_FreeRuntime(rt);puts("Wide bearing physical trials passed");return 0;
}
