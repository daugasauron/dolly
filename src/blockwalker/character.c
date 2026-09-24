#include "character.h"
#include "terrain.h"
#include <assert.h>
#include <raymath.h>
#include <math.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const Color block_colors[COLOR_COUNT]={{89,119,112,255},{172,139,76,255},{83,101,129,255},{155,83,65,255},{65,73,79,255},{182,177,154,255}};
const char *block_names[BLOCK_KINDS]={"BOX","SERVO HINGE","PISTON","THRUSTER","WHEEL","MAGNET","EYES","TURNTABLE"};
Vector3 block_position(Block b) { return (Vector3){b.x,b.y+.5f,b.z}; }
int block_controlled(Block b){return b.joint!=BLOCK_BOX&&b.joint!=BLOCK_EYES;}
int block_cylinder(Block b){return b.joint==BLOCK_HINGE||b.joint==BLOCK_WHEEL||b.joint==BLOCK_TURNTABLE;}
Vector3 block_half(Block b){
    Vector3 half={.485f,.485f,.485f};
    if(block_cylinder(b)){
        float radius=b.joint==BLOCK_HINGE?HINGE_RADIUS:b.joint==BLOCK_TURNTABLE?TURNTABLE_RADIUS:.7f;
        half=(Vector3){radius,radius,radius};((float *)&half)[b.axis]=b.joint==BLOCK_HINGE?HINGE_HALF:b.joint==BLOCK_TURNTABLE?TURNTABLE_HALF:.35f;
    }return half;
}
float block_density(Block b){
    Vector3 h=block_half(b);float density=b.joint==BLOCK_HINGE||b.joint==BLOCK_TURNTABLE?(.97f*.97f*.97f)/(24*sinf(PI/12)*h.x*h.y*h.z):b.joint==BLOCK_WHEEL?2:1;
    return density*(b.material==MATERIAL_HULL?.25f:b.material==MATERIAL_BALLAST?3:1);
}
static int blocks_adjacent(Block a,Block b){return llabs((long long)a.x-b.x)+llabs((long long)a.y-b.y)+llabs((long long)a.z-b.z)==1;}
static int articulates(Block b){return block_cylinder(b)||b.joint==BLOCK_PISTON;}
void *array_resize(void *memory,size_t count,size_t size) {
    if(count>SIZE_MAX/size){fputs("Character allocation overflow\n",stderr);exit(1);}
    void *grown=realloc(memory,count*size);
    if(count&&!grown){perror("Character allocation");exit(1);}return grown;
}
void character_clear(Character *c) {free(c->blocks);memset(c,0,sizeof(*c));}
void character_copy(Character *to,const Character *from) {
    if(to==from)return;
    if(to->capacity<from->count){to->blocks=array_resize(to->blocks,from->count,sizeof(Block));to->capacity=from->count;}
    to->count=from->count;to->anchored=from->anchored;if(from->count)memcpy(to->blocks,from->blocks,from->count*sizeof(Block));
}
static int key_valid(int k) {return k==0||(k>='A'&&k<='Z')||(k>='0'&&k<='9');}
int character_validate(const Character *c) {
    if(c->count<0||c->count>c->capacity||(c->count&&!c->blocks)||(c->anchored!=0&&c->anchored!=1))return 0;
    unsigned char used[128]={0};
    for(int i=0;i<c->count;i++) {
        Block b=c->blocks[i];
        if(b.y<0||b.parent>=i||b.parent< -1||(i==0?b.parent!=-1:b.parent<0)||
           b.color<0||b.color>=COLOR_COUNT||b.joint<0||b.joint>=BLOCK_KINDS||b.axis<0||b.axis>2||b.material<0||b.material>=MATERIAL_COUNT||b.finish<0||b.finish>=FINISH_COUNT||
           !isfinite(b.speed)||b.speed<.5f||b.speed>6||!isfinite(b.limit)||b.limit<15||b.limit>150||!isfinite(b.travel)||b.travel<.25f||b.travel>3||!isfinite(b.force)||b.force<2||b.force>100||(b.direction!=1&&b.direction!=-1))return 0;
        if(b.parent>=0&&!blocks_adjacent(c->blocks[b.parent],b))return 0;
        for(int j=0;j<i;j++){Block a=c->blocks[j];if(a.x==b.x&&a.y==b.y&&a.z==b.z)return 0;}
        if(i==0&&b.joint)return 0;
        if(block_controlled(b)){
            if(i==0||!key_valid(b.negative)||!key_valid(b.positive)||
                (b.negative&&(b.negative==b.positive||used[b.negative]))||(b.positive&&used[b.positive]))return 0;
            if(b.negative)used[b.negative]=1;if(b.positive)used[b.positive]=1;
        }
    }
    return 1;
}
int character_candidate(const Character *c,int parent,int x,int y,int z,int joint,int color,Block *block) {
    if(c->count==INT_MAX||y<0||parent< -1||parent>=c->count||
        (c->count==0?parent!=-1||joint:parent<0)||joint<0||joint>=BLOCK_KINDS||color<0||color>=COLOR_COUNT)return 0;
    if(parent>=0){Block a=c->blocks[parent];if(llabs((long long)a.x-x)+llabs((long long)a.y-y)+llabs((long long)a.z-z)!=1)return 0;}
    for(int i=0;i<c->count;i++){Block a=c->blocks[i];if(a.x==x&&a.y==y&&a.z==z)return 0;}
    Block b={.x=x,.y=y,.z=z,.parent=parent,.joint=joint,.color=color,.axis=2,.speed=2.5f,.limit=75,.travel=1.5f,.force=24,.direction=1};
    if(joint>=BLOCK_PISTON&&parent>=0){Block a=c->blocks[parent];b.axis=x!=a.x?0:y!=a.y?1:2;if(joint==BLOCK_PISTON||joint==BLOCK_MAGNET||joint==BLOCK_EYES)b.direction=(b.axis==0?x-a.x:b.axis==1?y-a.y:z-a.z)<0?-1:1;}
    if(block_controlled(b)){
        const char *choices="QAWSOKPLERDTFGYHUJIZXCVBNM1234567890";int found=0;
        for(const char *k=choices;*k&&found<2;k++) {
            int used=0;for(int i=0;i<c->count;i++)if(block_controlled(c->blocks[i])&&(c->blocks[i].negative==*k||c->blocks[i].positive==*k))used=1;
            if(!used){if(found++==0)b.negative=*k;else b.positive=*k;}
        }
    }
    *block=b;return 1;
}
int character_add(Character *c,int parent,int x,int y,int z,int joint,int color) {
    Block b;if(!character_candidate(c,parent,x,y,z,joint,color,&b))return -1;
    if(c->count==c->capacity){int next=c->capacity>INT_MAX/2?INT_MAX:c->capacity?c->capacity*2:16;
        c->blocks=array_resize(c->blocks,next,sizeof(Block));c->capacity=next;}
    c->blocks[c->count]=b;return c->count++;
}
void character_remove(Character *c,int index) {
    if(index<0||index>=c->count)return;
    int *map=array_resize(NULL,c->count,sizeof(int)),count=0;
    for(int i=0;i<c->count;i++) {
        Block b=c->blocks[i];
        if(i==index||(b.parent>=0&&map[b.parent]<0)){map[i]=-1;continue;}
        map[i]=count;if(b.parent>=0)b.parent=map[b.parent];c->blocks[count++]=b;
    }
    c->count=count;free(map);
}
void character_preset(Character *c,int walker) {
    c->count=0;c->anchored=0;
    character_add(c,-1,0,3,0,0,0);
    if(walker==2){
        int front=character_add(c,0,0,3,1,BLOCK_BOX,0),back=character_add(c,0,0,3,-1,BLOCK_BOX,0);
        for(int leg=0;leg<4;leg++){
            int x=leg%2?1:-1,z=leg<2?1:-1;
            int hip=character_add(c,leg<2?front:back,x,3,z,BLOCK_HINGE,1+leg);
            int knee=character_add(c,hip,x,2,z,BLOCK_HINGE,1+leg);
            character_add(c,knee,x,1,z,BLOCK_BOX,1+leg);
            c->blocks[hip].axis=c->blocks[knee].axis=0;c->blocks[hip].speed=1.5f;c->blocks[knee].speed=2.5f;
            c->blocks[hip].limit=60;c->blocks[knee].limit=105;c->blocks[hip].force=c->blocks[knee].force=32;
        }
    }else if(walker){
        character_add(c,0,-1,3,0,1,1);character_add(c,1,-1,2,0,1,3);
        character_add(c,0,1,3,0,1,2);character_add(c,3,1,2,0,1,4);
    }else{character_add(c,0,0,2,0,1,1);character_add(c,1,0,1,0,1,2);}
}
void character_car(Character *c){
    c->count=0;c->anchored=0;
    character_add(c,-1,0,1,0,BLOCK_BOX,0);
    int front=character_add(c,0,0,1,1,BLOCK_BOX,0),rear=character_add(c,0,0,1,-1,BLOCK_BOX,0);
    for(int i=0;i<4;i++){
        int wheel=character_add(c,i<2?front:rear,i%2?1:-1,1,i<2?1:-1,BLOCK_WHEEL,1);
        c->blocks[wheel].axis=0;c->blocks[wheel].speed=4;c->blocks[wheel].force=12;
        c->blocks[wheel].negative='1'+i*2;c->blocks[wheel].positive='2'+i*2;
    }
    int eye=character_add(c,front,0,2,1,BLOCK_EYES,5);c->blocks[eye].axis=2;c->blocks[eye].direction=1;
    int magnet=character_add(c,front,0,1,2,BLOCK_MAGNET,1);c->blocks[magnet].negative='Q';c->blocks[magnet].positive='E';
    for(int i=0;i<c->count;i++)c->blocks[i].finish=i==magnet?FINISH_STRIPE:FINISH_PANEL;
}
int character_save(const Character *c,const char *path) {
    if(!character_validate(c))return 0;
    char tmp[256];if(snprintf(tmp,sizeof(tmp),"%s.tmp",path)>=(int)sizeof(tmp))return 0;
    FILE *f=fopen(tmp,"w");if(!f)return 0;
    fprintf(f,"BLOCKWALKER 6\n%d %d\n",c->count,c->anchored);
    for(int i=0;i<c->count;i++){Block b=c->blocks[i];fprintf(f,"%d %d %d %d %d %d %d %d %d %.3f %.3f %.3f %.3f %d %d %d\n",b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit,b.travel,b.force,b.direction,b.material,b.finish);}
    int good=!ferror(f);if(fclose(f)!=0)good=0;
    if(!good||rename(tmp,path)!=0){remove(tmp);return 0;}return 1;
}
int character_load(Character *c,const char *path) {
    FILE *f=fopen(path,"r");if(!f)return 0;
    Character next={0};char magic[32];int version=0,good=1;
    if(fscanf(f,"%31s %d %d",magic,&version,&next.count)!=3||strcmp(magic,"BLOCKWALKER")||(version<1||version>6)||next.count<0||next.count>INT_MAX/(int)sizeof(Block))good=0;
    if(good&&version>=4&&fscanf(f,"%d",&next.anchored)!=1)good=0;
    if(good){next.capacity=next.count;next.blocks=array_resize(NULL,next.count,sizeof(Block));}
    for(int i=0;good&&i<next.count;i++){Block *b=&next.blocks[i];*b=(Block){.travel=1.5f,.force=24,.direction=1};if(fscanf(f,"%d%d%d%d%d%d%d%d%d%f%f",&b->x,&b->y,&b->z,&b->parent,&b->joint,&b->color,&b->axis,&b->negative,&b->positive,&b->speed,&b->limit)!=11)good=0;if(version>=2&&fscanf(f,"%f%f",&b->travel,&b->force)!=2)good=0;if(version>=3&&fscanf(f,"%d",&b->direction)!=1)good=0;if(version>=4&&fscanf(f,"%d%d",&b->material,&b->finish)!=2)good=0;}
    int ch;while((ch=fgetc(f))!=EOF)if(ch!=' '&&ch!='\n'&&ch!='\t'&&ch!='\r')good=0;
    fclose(f);if(!good||!character_validate(&next)){character_clear(&next);return 0;}character_clear(c);*c=next;return 1;
}
void physics_stop(Physics *p) {
    if(p->running){if(p->owns_world)b3DestroyWorld(p->world);else {for(int i=0;i<p->count;i++)b3DestroyBody(p->parts[i].body);for(int i=0;i<p->cargo_count;i++)b3DestroyBody(p->cargo[i].body);}}
    free(p->parts);free(p->cargo);memset(p,0,sizeof(*p));
}
b3WorldId physics_world(int landscape) {
    b3WorldDef w=b3DefaultWorldDef();w.workerCount=1;w.gravity=(b3Vec3){0,-4,0};b3WorldId world=b3CreateWorld(&w);
    if(landscape){terrain_build(world);return world;}
    b3BodyDef floor=b3DefaultBodyDef();floor.position=(b3Pos){0,-.5f,0};
    b3BodyId ground=b3CreateBody(world,&floor);b3BoxHull slab=b3MakeBoxHull(100,.5f,100);
    b3ShapeDef shape=b3DefaultShapeDef();shape.density=1;shape.baseMaterial.friction=.85f;b3CreateHullShape(ground,&shape,&slab.base);
    return world;
}
void physics_attach(Physics *p,const Character *c,b3WorldId world,float x,float z,int landscape) {
    physics_stop(p);p->world=world;p->running=1;p->count=c->count;p->landscape=landscape;
    p->parts=array_resize(NULL,c->count,sizeof(PhysicsPart));if(c->count)memset(p->parts,0,c->count*sizeof(PhysicsPart));
    b3ShapeDef shape=b3DefaultShapeDef();shape.density=1;shape.baseMaterial.friction=.85f;
    int minimum=INT_MAX;for(int i=0;i<c->count;i++)if(c->blocks[i].y<minimum)minimum=c->blocks[i].y;
    b3BoxHull cube=b3MakeBoxHull(.485f,.485f,.485f);
    float ground=landscape?(c->anchored?terrain_height(x,z):fmaxf(terrain_height(x,z),WATER_LEVEL)):0;
    for(int i=0;i<c->count;i++){
        Vector3 v=block_position(c->blocks[i]);b3BodyDef b=b3DefaultBodyDef();b.type=c->anchored&&i==0?b3_staticBody:b3_dynamicBody;b.userData=p->parts;
        b.position=(b3Pos){v.x+x,v.y-minimum+(c->anchored?-.015f:.15f)+ground,v.z+z};b.angularDamping=.08f;b.enableSleep=false;
        p->parts[i].body=b3CreateBody(p->world,&b);
        // Servo housings retain the standard block mass.
        Block part=c->blocks[i];shape.density=block_density(part);
        if(block_cylinder(part)){
            Vector3 h=block_half(part);float radius=((float *)&h)[(part.axis+1)%3],half=((float *)&h)[part.axis];
            b3HullData *wheel=b3CreateCylinder(2*half,radius,-half,24);
            b3Quat rotation={{0,0,0},1};
            if(part.axis==0)rotation=(b3Quat){{0,0,-.70710678f},.70710678f};
            if(part.axis==2)rotation=(b3Quat){{.70710678f,0,0},.70710678f};
            b3HullData *rotated=b3CloneAndTransformHull(wheel,(b3Transform){{0,0,0},rotation},(b3Vec3){1,1,1});
            shape.baseMaterial.friction=part.joint==BLOCK_WHEEL?1.3f:.85f;
            b3CreateHullShape(p->parts[i].body,&shape,rotated);b3DestroyHull(rotated);b3DestroyHull(wheel);
            shape.baseMaterial.friction=.85f;
        }else b3CreateHullShape(p->parts[i].body,&shape,&cube.base);
    }
    for(int i=1;i<c->count;i++){
        Block b=c->blocks[i],a=c->blocks[b.parent];
        b3Transform fa={.p={(b.x-a.x)*.5f,(b.y-a.y)*.5f,(b.z-a.z)*.5f},.q={{0,0,0},1}};
        b3Transform fb={.p={-fa.p.x,-fa.p.y,-fa.p.z},.q=fa.q};
        if(b.joint==BLOCK_PISTON){
            // Prismatic translation uses local X, unlike the hinge's local Z.
            int sign=b.direction;
            if(b.axis==0&&sign<0)fa.q=(b3Quat){{0,0,1},0};
            if(b.axis==1)fa.q=(b3Quat){{0,0,sign*.70710678f},.70710678f};
            if(b.axis==2)fa.q=(b3Quat){{0,-sign*.70710678f,0},.70710678f};fb.q=fa.q;
            b3PrismaticJointDef j=b3DefaultPrismaticJointDef();j.base.bodyIdA=p->parts[b.parent].body;j.base.bodyIdB=p->parts[i].body;
            j.base.localFrameA=fa;j.base.localFrameB=fb;j.enableMotor=true;j.maxMotorForce=b.force;
            j.enableLimit=true;j.lowerTranslation=0;j.upperTranslation=b.travel;
            p->parts[i].joint=b3CreatePrismaticJoint(p->world,&j);
        }else if(block_cylinder(b)){
            // Box3D's hinge axis is local Z. Both frames share the chosen world axis.
            if(b.axis==0)fa.q=(b3Quat){{0,.70710678f,0},.70710678f};
            if(b.axis==1)fa.q=(b3Quat){{-.70710678f,0,0},.70710678f};fb.q=fa.q;
            b3RevoluteJointDef j=b3DefaultRevoluteJointDef();j.base.bodyIdA=p->parts[b.parent].body;j.base.bodyIdB=p->parts[i].body;
            j.base.localFrameA=fa;j.base.localFrameB=fb;j.enableMotor=true;j.maxMotorTorque=b.force;
            j.enableLimit=b.joint==BLOCK_HINGE;j.lowerAngle=-b.limit*DEG2RAD;j.upperAngle=b.limit*DEG2RAD;
            p->parts[i].joint=b3CreateRevoluteJoint(p->world,&j);
        }else{
            b3WeldJointDef j=b3DefaultWeldJointDef();j.base.bodyIdA=p->parts[b.parent].body;j.base.bodyIdB=p->parts[i].body;
            j.base.localFrameA=fa;j.base.localFrameB=fb;p->parts[i].joint=b3CreateWeldJoint(p->world,&j);
        }
    }
    for(int i=1;i<c->count;i++)for(int j=0;j<i;j++){
        Block a=c->blocks[j],b=c->blocks[i];
        if(b.parent==j||articulates(a)||articulates(b)||!blocks_adjacent(a,b))continue;
        b3WeldJointDef weld=b3DefaultWeldJointDef();weld.base.bodyIdA=p->parts[j].body;weld.base.bodyIdB=p->parts[i].body;
        weld.base.localFrameA=(b3Transform){{(b.x-a.x)*.5f,(b.y-a.y)*.5f,(b.z-a.z)*.5f},{{0,0,0},1}};
        weld.base.localFrameB=(b3Transform){{(a.x-b.x)*.5f,(a.y-b.y)*.5f,(a.z-b.z)*.5f},{{0,0,0},1}};
        b3CreateWeldJoint(p->world,&weld);
    }
    if(c->count){b3Pos root=b3Body_GetPosition(p->parts[0].body);p->start=(Vector3){root.x,root.y,root.z};}
}
void physics_start(Physics *p,const Character *c) {
    physics_stop(p);physics_attach(p,c,physics_world(0),0,0,0);p->owns_world=1;
}
void physics_start_sea(Physics *p,const Character *c){physics_stop(p);physics_attach(p,c,physics_world(1),125,10,1);p->owns_world=1;}
void physics_motor(Physics *p,const Character *c,const unsigned char keys[128]) {
    float controls[128];for(int i=0;i<128;i++)controls[i]=keys[i]!=0;
    physics_drive(p,c,controls);
}
void physics_drive(Physics *p,const Character *c,const float controls[128]) {
    for(int i=1;i<c->count;i++)if(block_controlled(c->blocks[i])){
        Block b=c->blocks[i];float direction=controls[b.positive]-controls[b.negative];
        p->parts[i].command=direction;
        if(b.joint==BLOCK_MAGNET)magnet_drive(p,i,b,controls[b.positive],controls[b.negative]);
        else if(b.joint==BLOCK_PISTON)b3PrismaticJoint_SetMotorSpeed(p->parts[i].joint,direction*b.speed);
        else if(b.joint==BLOCK_THRUSTER){
            b3WorldTransform t=b3Body_GetTransform(p->parts[i].body);Vector3 axis={0};((float *)&axis)[b.axis]=direction*b.force;
            axis=Vector3RotateByQuaternion(axis,(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s});
            b3Body_ApplyForceToCenter(p->parts[i].body,(b3Vec3){axis.x,axis.y,axis.z},true);
        }else b3RevoluteJoint_SetMotorSpeed(p->parts[i].joint,direction*b.speed);
        if(direction)p->parts[i].motor_steps++;
    }
    water_forces(p,c);
}
static void physics_read(Physics *p,const Character *c,int advanced) {
    if(advanced){p->steps++;p->time+=1./60;p->sampled=1;}
    for(int i=1;i<c->count;i++){
        Block b=c->blocks[i];
        float separation;
        if(b.joint==BLOCK_PISTON){
            b3WorldTransform a=b3Body_GetTransform(p->parts[b.parent].body),child=b3Body_GetTransform(p->parts[i].body);
            b3Transform fa=b3Joint_GetLocalFrameA(p->parts[i].joint),fb=b3Joint_GetLocalFrameB(p->parts[i].joint);
            b3Vec3 delta=b3SubPos(b3TransformWorldPoint(child,fb.p),b3TransformWorldPoint(a,fa.p));
            b3Vec3 axis=b3RotateVector(a.q,b3RotateVector(fa.q,b3Vec3_axisX));
            float along=b3Dot(delta,axis),bounded=Clamp(along,0,b.travel);
            separation=b3Length(b3Sub(delta,b3MulSV(bounded,axis)));
        }else separation=b3Joint_GetLinearSeparation(p->parts[i].joint);
        p->max_separation=fmaxf(p->max_separation,separation);
        if(block_controlled(b)){
            float angle=b.joint==BLOCK_PISTON?b3PrismaticJoint_GetTranslation(p->parts[i].joint):
                (b.joint==BLOCK_THRUSTER||b.joint==BLOCK_MAGNET)?0:b3RevoluteJoint_GetAngle(p->parts[i].joint);
            float direction=p->parts[i].command;
            float delta=angle-p->parts[i].angle;
            if(b.joint==BLOCK_WHEEL||b.joint==BLOCK_TURNTABLE){while(delta>PI)delta-=2*PI;while(delta< -PI)delta+=2*PI;}
            if(b.joint==BLOCK_PISTON)p->parts[i].rate=b3PrismaticJoint_GetSpeed(p->parts[i].joint);
            else if(b.joint==BLOCK_THRUSTER||b.joint==BLOCK_MAGNET)p->parts[i].rate=0;
            else{
                b3WorldTransform parent=b3Body_GetTransform(p->parts[b.parent].body);
                b3Vec3 axis=b3RotateVector(parent.q,b3RotateVector(b3Joint_GetLocalFrameA(p->parts[i].joint).q,b3Vec3_axisZ));
                p->parts[i].rate=b3Dot(b3Sub(b3Body_GetAngularVelocity(p->parts[i].body),b3Body_GetAngularVelocity(p->parts[b.parent].body)),axis);
            }
            if(advanced)p->parts[i].driven_radians+=delta*direction;p->parts[i].angle=angle;
            p->parts[i].angle_peak=fmaxf(p->parts[i].angle_peak,fabsf(angle));
        }
    }
}
void physics_sample(Physics *p,const Character *c){physics_read(p,c,1);}
void physics_refresh(Physics *p,const Character *c){physics_read(p,c,0);}
void physics_step(Physics *p,const Character *c,const unsigned char keys[128]) {
    physics_motor(p,c,keys);b3World_Step(p->world,1.f/60,8);physics_sample(p,c);
}
void physics_pose(const Physics *p,const Character *c,int i,Vector3 *position,Quaternion *rotation) {
    if(p->running){b3WorldTransform t=b3Body_GetTransform(p->parts[i].body);*position=(Vector3){t.p.x,t.p.y,t.p.z};*rotation=(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s};}
    else {*position=block_position(c->blocks[i]);*rotation=(Quaternion){0,0,0,1};}
}
int physics_eyes(const Physics *p,const Character *c,Vector3 *position,Vector3 *forward,Vector3 *up){
    for(int i=0;i<c->count;i++)if(c->blocks[i].joint==BLOCK_EYES){
        Block b=c->blocks[i];Quaternion rotation;physics_pose(p,c,i,position,&rotation);
        Vector3 direction={0};((float *)&direction)[b.axis]=b.direction;
        *forward=Vector3RotateByQuaternion(direction,rotation);
        *up=Vector3RotateByQuaternion(b.axis==1?(Vector3){0,0,-1}:(Vector3){0,1,0},rotation);
        *position=Vector3Add(*position,Vector3Scale(*forward,.52f));return i;
    }return -1;
}
static void motor_check(int axis) {
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,3,0,0,0);character_add(&c,0,1,3,0,1,1);c.blocks[1].axis=axis;
    physics_start(&p,&c);
    // Suspend one hinge from a fixed test fixture, with gravity still enabled.
    for(int i=0;i<2;i++){b3Pos pos=b3Body_GetPosition(p.parts[i].body);pos.y+=3;b3Body_SetTransform(p.parts[i].body,pos,(b3Quat){{0,0,0},1});}
    b3Body_SetType(p.parts[0].body,b3_staticBody);
    for(int i=0;i<120;i++)physics_step(&p,&c,keys);
    float idle=p.parts[1].angle;keys['A']=1;
    for(int i=0;i<30;i++)physics_step(&p,&c,keys);
    float forward=p.parts[1].angle;keys['A']=0;keys['Q']=1;
    for(int i=0;i<60;i++)physics_step(&p,&c,keys);
    float reverse=p.parts[1].angle;keys['Q']=0;
    for(int i=0;i<60;i++)physics_step(&p,&c,keys);
    printf("MOTOR %c: mass %.3f kg, idle %.3f, forward %.3f, reverse %.3f, released %.3f rad, separation %.5f m\n",
        'X'+axis,b3Body_GetMass(p.parts[1].body),idle,forward,reverse,p.parts[1].angle,p.max_separation);
    assert(fabsf(idle)<.04f&&forward>.7f&&reverse<-.7f&&fabsf(p.parts[1].angle-reverse)<.08f);
    float stopped=p.parts[1].angle;for(int i=0;i<60;i++)physics_step(&p,&c,keys);
    assert(fabsf(p.parts[1].angle-stopped)<.01f);
    assert(p.max_separation<.025f);physics_stop(&p);character_clear(&c);
}
static void actuator_check(int kind,int axis,int sign) {
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,3,0,BLOCK_BOX,0);
    character_add(&c,0,sign*(axis==0),3+sign*(axis==1),sign*(axis==2),kind,1);c.blocks[1].axis=axis;c.blocks[1].speed=1;
    physics_start(&p,&c);b3World_SetGravity(p.world,(b3Vec3){0,0,0});
    for(int i=0;i<2;i++){b3Pos pos=b3Body_GetPosition(p.parts[i].body);pos.y+=5;b3Body_SetTransform(p.parts[i].body,pos,(b3Quat){{0,0,0},1});}
    if(kind!=BLOCK_THRUSTER)b3Body_SetType(p.parts[0].body,b3_staticBody);
    b3Pos initial=b3Body_GetPosition(p.parts[1].body);
    keys['A']=1;for(int i=0;i<(kind==BLOCK_WHEEL?600:60);i++)physics_step(&p,&c,keys);
    float forward=p.parts[1].angle;keys['A']=0;
    if(kind==BLOCK_WHEEL)assert(p.parts[1].driven_radians>9.5f);
    else if(kind==BLOCK_PISTON){
        b3Pos position=b3Body_GetPosition(p.parts[1].body);
        float displacement=axis==0?position.x-initial.x:axis==1?position.y-initial.y:position.z-initial.z;
        assert(forward>.8f&&forward<1.1f&&displacement*sign>.8f);
    }
    else {b3Vec3 v=b3Body_GetLinearVelocity(p.parts[0].body);float along=axis==0?v.x:axis==1?v.y:v.z;assert(along>10);}
    for(int i=0;i<60;i++)physics_step(&p,&c,keys);
    if(kind==BLOCK_PISTON||kind==BLOCK_WHEEL)assert(fabsf(p.parts[1].angle-forward)<.03f);
    keys['Q']=1;for(int i=0;i<150;i++)physics_step(&p,&c,keys);
    if(kind==BLOCK_PISTON)assert(fabsf(p.parts[1].angle)<.03f);
    assert(p.max_separation<.03f);
    printf("ACTUATOR %s %c: forward %.3f, reverse %.3f, driven %.3f\n",block_names[kind],'X'+axis,forward,p.parts[1].angle,p.parts[1].driven_radians);
    physics_stop(&p);character_clear(&c);
}
static void adjacency_check(void){
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,4,0,BLOCK_BOX,0);character_add(&c,0,1,4,0,BLOCK_BOX,0);
    character_add(&c,1,1,5,0,BLOCK_BOX,0);character_add(&c,2,0,5,0,BLOCK_BOX,0);c.anchored=1;
    physics_start(&p,&c);assert(b3Body_GetJointCount(p.parts[3].body)==2);
    b3DestroyJoint(p.parts[3].joint,true);b3World_SetGravity(p.world,(b3Vec3){0,-4,0});
    b3Pos initial=b3Body_GetPosition(p.parts[3].body);
    b3Body_ApplyLinearImpulseToCenter(p.parts[3].body,(b3Vec3){8,0,4},true);
    for(int i=0;i<240;i++)b3World_Step(p.world,1.f/60,8);
    b3Pos held=b3Body_GetPosition(p.parts[3].body);assert(fabs(held.x-initial.x)+fabs(held.y-initial.y)+fabs(held.z-initial.z)<.01);
    physics_stop(&p);c.blocks[3].joint=BLOCK_HINGE;c.blocks[3].negative='Q';c.blocks[3].positive='A';
    physics_start(&p,&c);assert(b3Body_GetJointCount(p.parts[3].body)==1);
    b3World_SetGravity(p.world,(b3Vec3){0,0,0});keys['Q']=1;
    for(int i=0;i<120;i++)physics_step(&p,&c,keys);
    assert(p.parts[3].angle<-.9f);
    printf("ADJACENCY: closing face holds after parent weld removal; adjacent servo remains free, angle %.3f rad\n",p.parts[3].angle);
    physics_stop(&p);character_clear(&c);
}
static void wheel_cart_check(void) {
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,1,0,BLOCK_BOX,0);
    character_add(&c,0,0,1,1,BLOCK_BOX,0);character_add(&c,0,0,1,-1,BLOCK_BOX,0);
    for(int i=0;i<4;i++){
        int wheel=character_add(&c,i<2?1:2,i%2?1:-1,1,i<2?1:-1,BLOCK_WHEEL,1);
        c.blocks[wheel].axis=0;c.blocks[wheel].speed=2;keys[c.blocks[wheel].positive]=1;
    }
    physics_start(&p,&c);for(int i=0;i<360;i++)physics_step(&p,&c,keys);
    Vector3 forward,reverse;Quaternion q;physics_pose(&p,&c,0,&forward,&q);
    assert(fabsf(forward.z)>5&&forward.y>.65f&&Vector3RotateByQuaternion((Vector3){0,1,0},q).y>.95f);
    memset(keys,0,sizeof(keys));for(int i=3;i<7;i++)keys[c.blocks[i].negative]=1;
    for(int i=0;i<360;i++)physics_step(&p,&c,keys);physics_pose(&p,&c,0,&reverse,&q);
    assert(fabsf(reverse.z-forward.z)>5&&fabsf(reverse.z)<2&&p.max_separation<.04f);
    printf("WHEEL CART: forward %.3f m, reverse %.3f m, chassis %.3f m above ground\n",forward.z,reverse.z,forward.y);
    physics_stop(&p);character_clear(&c);
}
static void playground_check(void){
    Character c={0},loaded={0};Physics p={0};float controls[128]={0};character_car(&c);
    assert(c.count==9&&character_validate(&c));assert(character_save(&c,"/tmp/blockwalker-car.character"));
    assert(character_load(&loaded,"/tmp/blockwalker-car.character")&&loaded.count==9&&loaded.blocks[7].joint==BLOCK_EYES);
    character_clear(&loaded);remove("/tmp/blockwalker-car.character");physics_start(&p,&c);
    for(int i=3;i<7;i++)controls[c.blocks[i].positive]=1;
    for(int i=0;i<180;i++){physics_drive(&p,&c,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);}
    Vector3 straight,turned,eye,forward,up;Quaternion q;physics_pose(&p,&c,0,&straight,&q);
    assert(straight.z>5&&Vector3RotateByQuaternion((Vector3){0,1,0},q).y>.9f);
    memset(controls,0,sizeof(controls));for(int i=3;i<7;i++){Block b=c.blocks[i];controls[b.x<0?b.positive:b.negative]=b.x<0?1:.15f;}
    for(int i=0;i<180;i++){physics_drive(&p,&c,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);}
    physics_pose(&p,&c,0,&turned,&q);assert(physics_eyes(&p,&c,&eye,&forward,&up)==7);
    Vector3 mount;Quaternion eye_rotation;physics_pose(&p,&c,7,&mount,&eye_rotation);
    assert(fabsf(Vector3Distance(eye,mount)-.52f)<.001f&&fabsf(Vector3DotProduct(forward,up))<.001f);
    printf("STARTER CAR: forward %.3f m, turn x %.3f, eye %.3f %.3f %.3f, forward %.3f %.3f %.3f, up %.3f\n",straight.z,turned.x,eye.x,eye.y,eye.z,forward.x,forward.y,forward.z,up.y);
    assert(turned.x>straight.x+1&&up.y>.8f&&forward.x>.5f);
    physics_stop(&p);character_clear(&c);
    for(int y=0;y<5;y++)character_add(&c,y-1,0,y,0,BLOCK_BOX,0);
    int hinge=character_add(&c,4,0,5,0,BLOCK_HINGE,1);c.blocks[hinge].force=100;
    character_add(&c,hinge,0,6,0,BLOCK_BOX,0);character_add(&c,6,0,7,0,BLOCK_BOX,0);
    int table=character_add(&c,7,0,8,0,BLOCK_TURNTABLE,1);c.blocks[table].axis=1;c.blocks[table].speed=2;
    int tip=character_add(&c,table,1,8,0,BLOCK_BOX,3);c.anchored=1;assert(character_validate(&c));physics_start(&p,&c);
    Vector3 low={INFINITY,INFINITY,INFINITY},high={-INFINITY,-INFINITY,-INFINITY};
    for(int i=0;i<900;i++){
        memset(controls,0,sizeof(controls));float drive=Clamp((PI/4-p.parts[hinge].angle)*3,-1,1);
        controls[c.blocks[hinge].positive]=fmaxf(0,drive);controls[c.blocks[hinge].negative]=fmaxf(0,-drive);
        if(i>180)controls[c.blocks[table].positive]=1;
        physics_drive(&p,&c,controls);b3World_Step(p.world,1.f/60,8);physics_sample(&p,&c);
        if(i>300){Vector3 position;physics_pose(&p,&c,tip,&position,&q);low=Vector3Min(low,position);high=Vector3Max(high,position);}
    }
    Vector3 range=Vector3Subtract(high,low);printf("TILTED TURNTABLE: hinge %.3f, driven %.3f rad, tip range %.3f %.3f %.3f, separation %.5f\n",p.parts[hinge].angle,p.parts[table].driven_radians,range.x,range.y,range.z,p.max_separation);
    assert(fabsf(p.parts[hinge].angle-PI/4)<.04f&&p.parts[table].driven_radians>20&&range.x>1&&range.y>1&&range.z>1.8f&&p.max_separation<.03f);
    physics_stop(&p);character_clear(&c);
}
static void water_check(void){
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,1,0,BLOCK_BOX,0);
    int jets[2];
    for(int side=0;side<2;side++){
        int x=side?1:-1,deck=character_add(&c,0,x,1,0,BLOCK_BOX,side+1);
        int hull=character_add(&c,deck,x,0,0,BLOCK_BOX,side+1);
        character_add(&c,hull,x,0,1,BLOCK_BOX,side+1);int stern=character_add(&c,hull,x,0,-1,BLOCK_BOX,side+1);
        jets[side]=character_add(&c,stern,x,0,-2,BLOCK_THRUSTER,side+1);c.blocks[jets[side]].axis=2;c.blocks[jets[side]].force=4;
    }
    for(int i=0;i<c.count;i++){c.blocks[i].material=MATERIAL_HULL;c.blocks[i].finish=FINISH_PANEL;}
    physics_start_sea(&p,&c);for(int i=0;i<1200;i++)physics_step(&p,&c,keys);
    Vector3 floating,forward;Quaternion rotation;physics_pose(&p,&c,0,&floating,&rotation);
    printf("BOAT FLOAT: height %.3f, up %.4f, submerged hull %.3f\n",floating.y,Vector3RotateByQuaternion((Vector3){0,1,0},rotation).y,p.parts[2].submerged);
    assert(floating.y>WATER_LEVEL&&floating.y<WATER_LEVEL+1.5f&&Vector3RotateByQuaternion((Vector3){0,1,0},rotation).y>.9f);
    for(int i=0;i<2;i++)keys[c.blocks[jets[i]].positive]=1;
    for(int i=0;i<360;i++)physics_step(&p,&c,keys);physics_pose(&p,&c,0,&forward,&rotation);
    assert(forward.z-floating.z>2&&Vector3RotateByQuaternion((Vector3){0,1,0},rotation).y>.8f);
    Vector3 heading=Vector3RotateByQuaternion((Vector3){0,0,1},rotation);float previous=atan2f(heading.x,heading.z),turn=0,minimum_up=1;
    keys[c.blocks[jets[1]].positive]=0;for(int i=0;i<180;i++){
        physics_step(&p,&c,keys);Vector3 position;physics_pose(&p,&c,0,&position,&rotation);heading=Vector3RotateByQuaternion((Vector3){0,0,1},rotation);
        float yaw=atan2f(heading.x,heading.z),delta=yaw-previous;while(delta>PI)delta-=2*PI;while(delta< -PI)delta+=2*PI;turn+=delta;previous=yaw;
        minimum_up=fminf(minimum_up,Vector3RotateByQuaternion((Vector3){0,1,0},rotation).y);
    }
    Vector3 turned;physics_pose(&p,&c,0,&turned,&rotation);
    printf("BOAT DRIVE: %.3f m, turn %.3f rad, minimum up %.3f, separation %.5f\n",forward.z-floating.z,turn,minimum_up,p.max_separation);
    assert(fabsf(turn)>.5f&&minimum_up>.75f&&p.max_separation<.06f);
    physics_stop(&p);character_clear(&c);
    character_add(&c,-1,0,0,0,BLOCK_BOX,0);c.blocks[0].material=MATERIAL_BALLAST;
    physics_start_sea(&p,&c);for(int i=0;i<600;i++)physics_step(&p,&c,keys);
    physics_pose(&p,&c,0,&turned,&rotation);assert(turned.y<WATER_LEVEL-5);physics_stop(&p);character_clear(&c);
    character_add(&c,-1,0,0,0,BLOCK_BOX,0);
    for(int y=1;y<=3;y++)character_add(&c,y-1,0,y,0,BLOCK_BOX,0);
    int support=character_add(&c,3,1,3,0,BLOCK_BOX,0);
    int hinge=character_add(&c,support,2,3,0,BLOCK_HINGE,1);character_add(&c,hinge,3,3,0,BLOCK_BOX,1);character_add(&c,6,4,3,0,BLOCK_BOX,1);
    c.anchored=1;c.blocks[hinge].force=60;c.blocks[6].material=MATERIAL_HULL;c.blocks[6].finish=FINISH_GLOW;
    Character saved={0};assert(character_save(&c,"/tmp/blockwalker-anchor.character")&&character_load(&saved,"/tmp/blockwalker-anchor.character")&&saved.anchored&&saved.blocks[6].material==MATERIAL_HULL&&saved.blocks[6].finish==FINISH_GLOW);
    character_clear(&saved);remove("/tmp/blockwalker-anchor.character");
    memset(keys,0,sizeof(keys));physics_start(&p,&c);Vector3 anchor;physics_pose(&p,&c,0,&anchor,&rotation);keys['A']=1;
    for(int i=0;i<120;i++)physics_step(&p,&c,keys);assert(p.parts[hinge].angle>1);
    keys['A']=0;keys['Q']=1;for(int i=0;i<120;i++)physics_step(&p,&c,keys);
    physics_pose(&p,&c,0,&turned,&rotation);
    printf("ANCHORED BRIDGE: root travel %.6f, hinge %.3f rad, separation %.5f\n",Vector3Distance(anchor,turned),p.parts[hinge].angle,p.max_separation);
    assert(Vector3Distance(anchor,turned)<.0001f&&p.parts[hinge].angle< -1&&p.max_separation<.04f);
    physics_stop(&p);character_clear(&c);
}
static void magnet_check(void){
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,0,0,BLOCK_BOX,0);character_add(&c,0,0,1,0,BLOCK_BOX,0);character_add(&c,1,0,2,0,BLOCK_BOX,0);character_add(&c,2,1,2,0,BLOCK_BOX,0);
    int piston=character_add(&c,3,2,2,0,BLOCK_PISTON,1),magnet=character_add(&c,piston,2,1,0,BLOCK_MAGNET,2);
    c.anchored=1;c.blocks[piston].axis=1;c.blocks[magnet].axis=1;c.blocks[magnet].direction=-1;
    physics_start(&p,&c);keys[c.blocks[magnet].positive]=1;
    for(int i=0;i<30;i++)physics_step(&p,&c,keys);assert(!b3Body_IsValid(p.parts[magnet].magnet_target));
    physics_add_cargo(&p,(Vector3){2,.5f,0},MATERIAL_ALLOY);
    for(int i=0;i<30;i++)physics_step(&p,&c,keys);assert(b3Body_IsValid(p.parts[magnet].magnet_target));
    keys[c.blocks[magnet].positive]=0;keys[c.blocks[piston].positive]=1;
    for(int i=0;i<180;i++)physics_step(&p,&c,keys);
    b3Pos lifted=b3Body_GetPosition(p.cargo[0].body);
    printf("MAGNET LIFT: cargo %.3f m, power %.1f, load %.3f N, separation %.5f\n",lifted.y,p.parts[magnet].magnet_power,p.parts[magnet].magnet_load,p.max_separation);
    assert(lifted.y>1.7f&&b3Body_IsValid(p.parts[magnet].magnet_target)&&p.parts[magnet].magnet_power==1&&p.parts[magnet].magnet_load<=24&&p.max_separation<.04f);
    keys[c.blocks[piston].positive]=0;keys[c.blocks[magnet].negative]=1;
    for(int i=0;i<180;i++)physics_step(&p,&c,keys);
    assert(!b3Body_IsValid(p.parts[magnet].magnet_target)&&b3Body_GetPosition(p.cargo[0].body).y<.6f);
    physics_stop(&p);c.blocks[magnet].force=2;physics_start(&p,&c);physics_add_cargo(&p,(Vector3){2,.5f,0},MATERIAL_ALLOY);
    memset(keys,0,128);keys[c.blocks[magnet].positive]=1;for(int i=0;i<30;i++)physics_step(&p,&c,keys);keys[c.blocks[piston].positive]=1;
    for(int i=0;i<180;i++)physics_step(&p,&c,keys);
    assert(!b3Body_IsValid(p.parts[magnet].magnet_target)&&b3Body_GetPosition(p.cargo[0].body).y<.6f);
    physics_stop(&p);c.blocks[magnet].force=24;physics_start(&p,&c);physics_add_cargo(&p,(Vector3){2,.5f,0},MATERIAL_ALLOY);
    keys[c.blocks[piston].positive]=0;for(int i=0;i<30;i++)physics_step(&p,&c,keys);assert(b3Body_IsValid(p.parts[magnet].magnet_target));
    b3DestroyBody(p.cargo[0].body);p.cargo_count=0;physics_step(&p,&c,keys);assert(!b3Body_IsValid(p.parts[magnet].magnet_target));
    printf("MAGNET: pickup, latched power, lift, release, overload, self-exclusion and removed target passed\n");
    physics_stop(&p);character_clear(&c);
}
static void landmark_check(void){
    Character c={0};Physics p={0};unsigned char keys[128]={0};character_add(&c,-1,0,0,0,BLOCK_BOX,0);
    assert(terrain_height(164,40)==4&&terrain_height(-8,-170)==6&&terrain_height(0,0)==0);
    physics_attach(&p,&c,physics_world(1),164,40,1);p.owns_world=1;
    for(int i=0;i<240;i++)physics_step(&p,&c,keys);b3Pos floor=b3Body_GetPosition(p.parts[0].body);
    assert(fabsf(floor.y-4.485f)<.01f);
    b3Body_SetTransform(p.parts[0].body,(b3Pos){164,22,40},(b3Quat){{0,0,0},1});
    for(int i=0;i<240;i++)physics_step(&p,&c,keys);b3Pos roof=b3Body_GetPosition(p.parts[0].body);
    assert(fabsf(roof.y-19.485f)<.01f);
    b3Body_SetTransform(p.parts[0].body,(b3Pos){164,10,35},(b3Quat){{0,0,0},1});b3Body_SetLinearVelocity(p.parts[0].body,(b3Vec3){0,0,6});
    for(int i=0;i<180;i++)physics_step(&p,&c,keys);b3Pos crossed=b3Body_GetPosition(p.parts[0].body);
    assert(crossed.z>44&&crossed.y>4.4f);
    printf("LANDMARK: floor %.3f, solid beam %.3f, passage z %.3f\n",floor.y,roof.y,crossed.z);
    const Vector3 basin[]={{46,0,72},{34,2,75},{65,8,58},{64,9,88}};
    for(int j=0;j<4;j++){
        Vector3 v=basin[j];assert(fabsf(terrain_height(v.x,v.z)-v.y)<.001f);
        b3Body_SetTransform(p.parts[0].body,(b3Pos){v.x,v.y+3,v.z},(b3Quat){{0,0,0},1});b3Body_SetLinearVelocity(p.parts[0].body,(b3Vec3){0});b3Body_SetAngularVelocity(p.parts[0].body,(b3Vec3){0});
        for(int i=0;i<180;i++)physics_step(&p,&c,keys);assert(fabsf(b3Body_GetPosition(p.parts[0].body).y-v.y-.485f)<.01f);
    }
    b3Body_SetTransform(p.parts[0].body,(b3Pos){46,1,50},(b3Quat){{0,0,0},1});b3Body_SetLinearVelocity(p.parts[0].body,(b3Vec3){0,0,8});
    for(int i=0;i<180;i++)physics_step(&p,&c,keys);b3Pos basin_entry=b3Body_GetPosition(p.parts[0].body);
    printf("BASIN: floor, ledges, rim heights and entrance y %.3f, z %.3f\n",basin_entry.y,basin_entry.z);
    assert(basin_entry.z>58&&basin_entry.y<1.5f);
    physics_stop(&p);character_clear(&c);
}
int character_check(void) {
    landmark_check();
    magnet_check();
    water_check();
    wheel_cart_check();
    adjacency_check();
    playground_check();
    for(int axis=0;axis<3;axis++){
        motor_check(axis);
        actuator_check(BLOCK_PISTON,axis,1);actuator_check(BLOCK_PISTON,axis,-1);actuator_check(BLOCK_THRUSTER,axis,1);actuator_check(BLOCK_WHEEL,axis,1);
    }
    Character c={0},loaded={0};Physics p={0};unsigned char keys[128]={0};character_preset(&c,1);
    assert(c.count==5&&character_validate(&c));assert(character_save(&c,"/tmp/blockwalker-check.txt"));
    assert(character_load(&loaded,"/tmp/blockwalker-check.txt")&&c.count==loaded.count&&memcmp(c.blocks,loaded.blocks,c.count*sizeof(Block))==0);
    assert(character_add(&c,0,0,3,0,0,0)<0);assert(character_add(&c,0,8,3,0,0,0)<0);
    assert(character_add(&c,2,-1,1,0,0,0)==5);physics_start(&p,&c);
    for(int n=0;n<2400;n++){
        keys['A']=n<90;keys['S']=n>=90&&n<180;
        keys['O']=n>=240&&(n/90)%2==0;keys['K']=n>=240&&!keys['O'];
        keys['P']=n>=240&&(n/120)%2==0;keys['L']=n>=240&&!keys['P'];
        physics_step(&p,&c,keys);
    }
    assert(p.parts[1].motor_steps==90&&p.parts[2].motor_steps==90);
    Vector3 a,b;Quaternion q;physics_pose(&p,&c,2,&a,&q);physics_pose(&p,&c,5,&b,&q);
    float distance=sqrtf((a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y)+(a.z-b.z)*(a.z-b.z));assert(fabsf(distance-1)<.08f);
    for(int i=0;i<c.count;i++){physics_pose(&p,&c,i,&a,&q);assert(isfinite(a.x)&&isfinite(a.y)&&isfinite(a.z)&&a.y>-.1f);}
    printf("BLOCKWALKER CHECK: 40 seconds, four 3D hinges, motors %.3f/%.3f rad, welded distance %.4f, peak separation %.5f m, floor collision, save/load\n",p.parts[1].angle_peak,p.parts[2].angle_peak,distance,p.max_separation);
    assert(p.max_separation<.025f);
    physics_stop(&p);character_remove(&c,1);assert(c.count==3&&character_validate(&c));character_clear(&c);character_clear(&loaded);
    for(int i=0;i<160;i++)assert(character_add(&c,i-1,i,2,0,i>0,i%COLOR_COUNT)==i);
    assert(character_validate(&c)&&c.count==160);assert(character_save(&c,"/tmp/blockwalker-check.txt"));
    assert(character_load(&loaded,"/tmp/blockwalker-check.txt")&&loaded.count==160);
    character_remove(&loaded,120);assert(loaded.count==120&&character_validate(&loaded));
    character_clear(&c);character_clear(&loaded);remove("/tmp/blockwalker-check.txt");return 0;
}
