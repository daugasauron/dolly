#include "character.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const Color block_colors[COLOR_COUNT]={{110,197,171,255},{238,168,83,255},{105,157,221,255},{221,114,108,255},{166,139,211,255},{224,217,193,255}};
Vector3 block_position(Block b) { return (Vector3){b.x,b.y+.5f,b.z}; }
static int key_valid(int k) { return (k>='A'&&k<='Z')||(k>='0'&&k<='9'); }
int character_validate(const Character *c) {
    if(c->count<0||c->count>BLOCK_LIMIT)return 0;
    unsigned char used[128]={0};
    for(int i=0;i<c->count;i++) {
        Block b=c->blocks[i];
        if(b.x< -16||b.x>16||b.y<0||b.y>16||b.z< -16||b.z>16||b.parent>=i||b.parent< -1||
           (i==0?b.parent!=-1:b.parent<0)||b.color<0||b.color>=COLOR_COUNT||
           b.joint<0||b.joint>1||b.axis<0||b.axis>2||!isfinite(b.speed)||b.speed<.5f||b.speed>6||
           !isfinite(b.limit)||b.limit<15||b.limit>150)return 0;
        if(b.parent>=0){Block a=c->blocks[b.parent];if(abs(a.x-b.x)+abs(a.y-b.y)+abs(a.z-b.z)!=1)return 0;}
        for(int j=0;j<i;j++){Block a=c->blocks[j];if(a.x==b.x&&a.y==b.y&&a.z==b.z)return 0;}
        if(b.joint){if(i==0||!key_valid(b.negative)||!key_valid(b.positive)||b.negative==b.positive||used[b.negative]||used[b.positive])return 0;used[b.negative]=used[b.positive]=1;}
    }
    return 1;
}
int character_add(Character *c,int parent,int x,int y,int z,int joint,int color) {
    if(c->count==BLOCK_LIMIT)return -1;
    Character next=*c;
    Block b={.x=x,.y=y,.z=z,.parent=parent,.joint=joint,.color=color,.axis=2,.speed=2.5f,.limit=75};
    if(joint){
        const char *choices="QAW SOKPLERDTF GYH UJIZXCVBNM1234567890";
        int available[36],n=0;
        for(const char *k=choices;*k;k++) {
            if(*k==' ')continue;
            int used=0;
            for(int i=0;i<c->count;i++)if(c->blocks[i].joint&&(c->blocks[i].negative==*k||c->blocks[i].positive==*k))used=1;
            for(int i=0;i<n;i++)if(available[i]==*k)used=1;
            if(!used&&n<36)available[n++]=*k;
        }
        if(n<2)return -1;b.negative=available[0];b.positive=available[1];
    }
    next.blocks[next.count++]=b;if(!character_validate(&next))return -1;
    *c=next;return c->count-1;
}
void character_remove(Character *c,int index) {
    if(index<0||index>=c->count)return;
    int map[BLOCK_LIMIT];Character next={0};
    for(int i=0;i<c->count;i++) {
        Block b=c->blocks[i];
        if(i==index||(b.parent>=0&&map[b.parent]<0)){map[i]=-1;continue;}
        map[i]=next.count;if(b.parent>=0)b.parent=map[b.parent];next.blocks[next.count++]=b;
    }
    *c=next;
}
void character_preset(Character *c,int walker) {
    memset(c,0,sizeof(*c));
    character_add(c,-1,0,3,0,0,0);
    if(walker){
        character_add(c,0,-1,3,0,1,1);character_add(c,1,-1,2,0,1,3);
        character_add(c,0,1,3,0,1,2);character_add(c,3,1,2,0,1,4);
    }else{character_add(c,0,0,2,0,1,1);character_add(c,1,0,1,0,1,2);}
}
int character_save(const Character *c,const char *path) {
    if(!character_validate(c))return 0;
    char tmp[256];if(snprintf(tmp,sizeof(tmp),"%s.tmp",path)>=(int)sizeof(tmp))return 0;
    FILE *f=fopen(tmp,"w");if(!f)return 0;
    fprintf(f,"BLOCKWALKER 1\n%d\n",c->count);
    for(int i=0;i<c->count;i++){Block b=c->blocks[i];fprintf(f,"%d %d %d %d %d %d %d %d %d %.3f %.3f\n",b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit);}
    int good=!ferror(f);if(fclose(f)!=0)good=0;
    if(!good||rename(tmp,path)!=0){remove(tmp);return 0;}return 1;
}
int character_load(Character *c,const char *path) {
    FILE *f=fopen(path,"r");if(!f)return 0;
    Character next={0};char magic[32];int version=0,good=1;
    if(fscanf(f,"%31s %d %d",magic,&version,&next.count)!=3||strcmp(magic,"BLOCKWALKER")||version!=1||next.count<0||next.count>BLOCK_LIMIT)good=0;
    for(int i=0;good&&i<next.count;i++){Block *b=&next.blocks[i];if(fscanf(f,"%d%d%d%d%d%d%d%d%d%f%f",&b->x,&b->y,&b->z,&b->parent,&b->joint,&b->color,&b->axis,&b->negative,&b->positive,&b->speed,&b->limit)!=11)good=0;}
    int ch;while((ch=fgetc(f))!=EOF)if(ch!=' '&&ch!='\n'&&ch!='\t'&&ch!='\r')good=0;
    fclose(f);if(!good||!character_validate(&next))return 0;*c=next;return 1;
}
void physics_stop(Physics *p) { if(p->running)b3DestroyWorld(p->world);memset(p,0,sizeof(*p)); }
void physics_start(Physics *p,const Character *c) {
    physics_stop(p);b3WorldDef w=b3DefaultWorldDef();w.workerCount=1;w.gravity=(b3Vec3){0,-9.81f,0};
    p->world=b3CreateWorld(&w);p->running=1;
    b3BodyDef floor=b3DefaultBodyDef();floor.position=(b3Pos){0,-.5f,0};
    b3BodyId ground=b3CreateBody(p->world,&floor);b3BoxHull slab=b3MakeBoxHull(100,.5f,100);
    b3ShapeDef shape=b3DefaultShapeDef();shape.baseMaterial.friction=.85f;b3CreateHullShape(ground,&shape,&slab.base);
    int minimum=20;for(int i=0;i<c->count;i++)if(c->blocks[i].y<minimum)minimum=c->blocks[i].y;
    b3BoxHull cube=b3MakeBoxHull(.485f,.485f,.485f);
    for(int i=0;i<c->count;i++){
        Vector3 v=block_position(c->blocks[i]);b3BodyDef b=b3DefaultBodyDef();b.type=b3_dynamicBody;
        b.position=(b3Pos){v.x,v.y-minimum+2,v.z};b.angularDamping=.08f;b.enableSleep=false;
        p->bodies[i]=b3CreateBody(p->world,&b);b3CreateHullShape(p->bodies[i],&shape,&cube.base);
    }
    for(int i=1;i<c->count;i++){
        Block b=c->blocks[i],a=c->blocks[b.parent];
        b3Transform fa={.p={(b.x-a.x)*.5f,(b.y-a.y)*.5f,(b.z-a.z)*.5f},.q={{0,0,0},1}};
        b3Transform fb={.p={-fa.p.x,-fa.p.y,-fa.p.z},.q=fa.q};
        if(b.joint){
            // Box3D's hinge axis is local Z. Both frames share the chosen world axis.
            if(b.axis==0)fa.q=(b3Quat){{0,.70710678f,0},.70710678f};
            if(b.axis==1)fa.q=(b3Quat){{-.70710678f,0,0},.70710678f};fb.q=fa.q;
            b3RevoluteJointDef j=b3DefaultRevoluteJointDef();j.base.bodyIdA=p->bodies[b.parent];j.base.bodyIdB=p->bodies[i];
            j.base.localFrameA=fa;j.base.localFrameB=fb;j.enableMotor=true;j.maxMotorTorque=24;
            j.enableLimit=true;j.lowerAngle=-b.limit*DEG2RAD;j.upperAngle=b.limit*DEG2RAD;
            p->joints[i]=b3CreateRevoluteJoint(p->world,&j);
        }else{
            b3WeldJointDef j=b3DefaultWeldJointDef();j.base.bodyIdA=p->bodies[b.parent];j.base.bodyIdB=p->bodies[i];
            j.base.localFrameA=fa;j.base.localFrameB=fb;p->joints[i]=b3CreateWeldJoint(p->world,&j);
        }
    }
}
void physics_step(Physics *p,const Character *c,const unsigned char keys[128]) {
    for(int i=1;i<c->count;i++)if(c->blocks[i].joint){Block b=c->blocks[i];int direction=(keys[b.positive]!=0)-(keys[b.negative]!=0);b3RevoluteJoint_SetMotorSpeed(p->joints[i],direction*b.speed);if(direction)p->motor_steps[i]++;}
    b3World_Step(p->world,1.f/60,4);p->steps++;
    for(int i=1;i<c->count;i++)if(c->blocks[i].joint){float a=fabsf(b3RevoluteJoint_GetAngle(p->joints[i]));if(a>p->angle_peak[i])p->angle_peak[i]=a;}
}
void physics_pose(const Physics *p,const Character *c,int i,Vector3 *position,Quaternion *rotation) {
    if(p->running){b3WorldTransform t=b3Body_GetTransform(p->bodies[i]);*position=(Vector3){t.p.x,t.p.y,t.p.z};*rotation=(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s};}
    else {*position=block_position(c->blocks[i]);*rotation=(Quaternion){0,0,0,1};}
}
int character_check(void) {
    Character c={0},loaded={0};Physics p={0};unsigned char keys[128]={0};character_preset(&c,1);
    assert(c.count==5&&character_validate(&c));assert(character_save(&c,"/tmp/blockwalker-check.txt"));
    assert(character_load(&loaded,"/tmp/blockwalker-check.txt")&&memcmp(&c,&loaded,sizeof(c))==0);
    assert(character_add(&c,0,0,3,0,0,0)<0);assert(character_add(&c,0,8,3,0,0,0)<0);
    assert(character_add(&c,2,-1,1,0,0,0)==5);physics_start(&p,&c);
    for(int n=0;n<240;n++){keys['A']=n<90;keys['S']=n>=90&&n<180;physics_step(&p,&c,keys);}
    assert(p.motor_steps[1]==90&&p.motor_steps[2]==90);
    assert(p.angle_peak[1]>.15f&&p.angle_peak[2]>.15f);
    Vector3 a,b;Quaternion q;physics_pose(&p,&c,2,&a,&q);physics_pose(&p,&c,5,&b,&q);
    float distance=sqrtf((a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y)+(a.z-b.z)*(a.z-b.z));assert(fabsf(distance-1)<.08f);
    for(int i=0;i<c.count;i++){physics_pose(&p,&c,i,&a,&q);assert(isfinite(a.x)&&isfinite(a.y)&&isfinite(a.z)&&a.y>-.1f);}
    printf("BLOCKWALKER CHECK PASS: four 3D hinges, motors %.3f/%.3f rad, welded distance %.4f, floor collision, save/load\n",p.angle_peak[1],p.angle_peak[2],distance);
    physics_stop(&p);character_remove(&c,1);assert(c.count==3&&character_validate(&c));remove("/tmp/blockwalker-check.txt");return 0;
}
