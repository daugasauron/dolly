#include "character.h"
#include <assert.h>
#include <raymath.h>
#include <math.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const Color block_colors[COLOR_COUNT]={{110,197,171,255},{238,168,83,255},{105,157,221,255},{221,114,108,255},{166,139,211,255},{224,217,193,255}};
const char *block_names[BLOCK_KINDS]={"BOX","BALL JOINT","PISTON","THRUSTER","WHEEL"};
Vector3 block_position(Block b) { return (Vector3){b.x,b.y+.5f,b.z}; }
void *array_resize(void *memory,size_t count,size_t size) {
    if(count>SIZE_MAX/size){fputs("Character allocation overflow\n",stderr);exit(1);}
    void *grown=realloc(memory,count*size);
    if(count&&!grown){perror("Character allocation");exit(1);}return grown;
}
void character_clear(Character *c) {free(c->blocks);memset(c,0,sizeof(*c));}
void character_copy(Character *to,const Character *from) {
    if(to==from)return;
    if(to->capacity<from->count){to->blocks=array_resize(to->blocks,from->count,sizeof(Block));to->capacity=from->count;}
    to->count=from->count;if(from->count)memcpy(to->blocks,from->blocks,from->count*sizeof(Block));
}
static int key_valid(int k) {return k==0||(k>='A'&&k<='Z')||(k>='0'&&k<='9');}
int character_validate(const Character *c) {
    if(c->count<0||c->count>c->capacity||(c->count&&!c->blocks))return 0;
    unsigned char used[128]={0};
    for(int i=0;i<c->count;i++) {
        Block b=c->blocks[i];
        if(b.y<0||b.parent>=i||b.parent< -1||(i==0?b.parent!=-1:b.parent<0)||
           b.color<0||b.color>=COLOR_COUNT||b.joint<0||b.joint>=BLOCK_KINDS||b.axis<0||b.axis>2||
           !isfinite(b.speed)||b.speed<.5f||b.speed>6||!isfinite(b.limit)||b.limit<15||b.limit>150||!isfinite(b.travel)||b.travel<.25f||b.travel>3||!isfinite(b.force)||b.force<2||b.force>100||(b.direction!=1&&b.direction!=-1))return 0;
        if(b.parent>=0){Block a=c->blocks[b.parent];if(llabs((long long)a.x-b.x)+llabs((long long)a.y-b.y)+llabs((long long)a.z-b.z)!=1)return 0;}
        for(int j=0;j<i;j++){Block a=c->blocks[j];if(a.x==b.x&&a.y==b.y&&a.z==b.z)return 0;}
        if(b.joint){
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
    if(joint>=BLOCK_PISTON&&parent>=0){Block a=c->blocks[parent];b.axis=x!=a.x?0:y!=a.y?1:2;if(joint==BLOCK_PISTON)b.direction=(b.axis==0?x-a.x:b.axis==1?y-a.y:z-a.z)<0?-1:1;}
    if(joint){
        const char *choices="QAWSOKPLERDTFGYHUJIZXCVBNM1234567890";int found=0;
        for(const char *k=choices;*k&&found<2;k++) {
            int used=0;for(int i=0;i<c->count;i++)if(c->blocks[i].joint&&(c->blocks[i].negative==*k||c->blocks[i].positive==*k))used=1;
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
    c->count=0;
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
int character_save(const Character *c,const char *path) {
    if(!character_validate(c))return 0;
    char tmp[256];if(snprintf(tmp,sizeof(tmp),"%s.tmp",path)>=(int)sizeof(tmp))return 0;
    FILE *f=fopen(tmp,"w");if(!f)return 0;
    fprintf(f,"BLOCKWALKER 3\n%d\n",c->count);
    for(int i=0;i<c->count;i++){Block b=c->blocks[i];fprintf(f,"%d %d %d %d %d %d %d %d %d %.3f %.3f %.3f %.3f %d\n",b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit,b.travel,b.force,b.direction);}
    int good=!ferror(f);if(fclose(f)!=0)good=0;
    if(!good||rename(tmp,path)!=0){remove(tmp);return 0;}return 1;
}
int character_load(Character *c,const char *path) {
    FILE *f=fopen(path,"r");if(!f)return 0;
    Character next={0};char magic[32];int version=0,good=1;
    if(fscanf(f,"%31s %d %d",magic,&version,&next.count)!=3||strcmp(magic,"BLOCKWALKER")||(version<1||version>3)||next.count<0||next.count>INT_MAX/(int)sizeof(Block))good=0;
    if(good){next.capacity=next.count;next.blocks=array_resize(NULL,next.count,sizeof(Block));}
    for(int i=0;good&&i<next.count;i++){Block *b=&next.blocks[i];b->travel=1.5f;b->force=24;b->direction=1;if(fscanf(f,"%d%d%d%d%d%d%d%d%d%f%f",&b->x,&b->y,&b->z,&b->parent,&b->joint,&b->color,&b->axis,&b->negative,&b->positive,&b->speed,&b->limit)!=11)good=0;if(version>=2&&fscanf(f,"%f%f",&b->travel,&b->force)!=2)good=0;if(version>=3&&fscanf(f,"%d",&b->direction)!=1)good=0;}
    int ch;while((ch=fgetc(f))!=EOF)if(ch!=' '&&ch!='\n'&&ch!='\t'&&ch!='\r')good=0;
    fclose(f);if(!good||!character_validate(&next)){character_clear(&next);return 0;}character_clear(c);*c=next;return 1;
}
void physics_stop(Physics *p) {
    if(p->running){if(p->owns_world)b3DestroyWorld(p->world);else for(int i=0;i<p->count;i++)b3DestroyBody(p->parts[i].body);}
    free(p->parts);memset(p,0,sizeof(*p));
}
b3WorldId physics_world(void) {
    b3WorldDef w=b3DefaultWorldDef();w.workerCount=1;w.gravity=(b3Vec3){0,-4,0};b3WorldId world=b3CreateWorld(&w);
    b3BodyDef floor=b3DefaultBodyDef();floor.position=(b3Pos){0,-.5f,0};
    b3BodyId ground=b3CreateBody(world,&floor);b3BoxHull slab=b3MakeBoxHull(100,.5f,100);
    b3ShapeDef shape=b3DefaultShapeDef();shape.density=1;shape.baseMaterial.friction=.85f;b3CreateHullShape(ground,&shape,&slab.base);
    return world;
}
void physics_attach(Physics *p,const Character *c,b3WorldId world,float x,float z) {
    physics_stop(p);p->world=world;p->running=1;p->count=c->count;
    p->parts=array_resize(NULL,c->count,sizeof(PhysicsPart));if(c->count)memset(p->parts,0,c->count*sizeof(PhysicsPart));
    b3ShapeDef shape=b3DefaultShapeDef();shape.density=1;shape.baseMaterial.friction=.85f;
    int minimum=INT_MAX;for(int i=0;i<c->count;i++)if(c->blocks[i].y<minimum)minimum=c->blocks[i].y;
    b3BoxHull cube=b3MakeBoxHull(.485f,.485f,.485f);
    b3Sphere ball={{0,0,0},.485f};
    for(int i=0;i<c->count;i++){
        Vector3 v=block_position(c->blocks[i]);b3BodyDef b=b3DefaultBodyDef();b.type=b3_dynamicBody;
        b.position=(b3Pos){v.x+x,v.y-minimum+.15f,v.z+z};b.angularDamping=.08f;b.enableSleep=false;
        p->parts[i].body=b3CreateBody(p->world,&b);
        // Keep equal part mass when exchanging a cube for a ball of the same width.
        Block part=c->blocks[i];shape.density=part.joint==BLOCK_HINGE?6/PI:1;
        if(part.joint==BLOCK_HINGE)b3CreateSphereShape(p->parts[i].body,&shape,&ball);
        else if(part.joint==BLOCK_WHEEL){
            b3HullData *wheel=b3CreateCylinder(.7f,.7f,-.35f,24);
            b3Quat rotation={{0,0,0},1};
            if(part.axis==0)rotation=(b3Quat){{0,0,-.70710678f},.70710678f};
            if(part.axis==2)rotation=(b3Quat){{.70710678f,0,0},.70710678f};
            b3HullData *rotated=b3CloneAndTransformHull(wheel,(b3Transform){{0,0,0},rotation},(b3Vec3){1,1,1});
            shape.density=2;shape.baseMaterial.friction=1.3f;
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
        }else if(b.joint==BLOCK_HINGE||b.joint==BLOCK_WHEEL){
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
    if(c->count){b3Pos root=b3Body_GetPosition(p->parts[0].body);p->start=(Vector3){root.x,root.y,root.z};}
}
void physics_start(Physics *p,const Character *c) {
    physics_stop(p);physics_attach(p,c,physics_world(),0,0);p->owns_world=1;
}
void physics_motor(Physics *p,const Character *c,const unsigned char keys[128]) {
    float controls[128];for(int i=0;i<128;i++)controls[i]=keys[i]!=0;
    physics_drive(p,c,controls);
}
void physics_drive(Physics *p,const Character *c,const float controls[128]) {
    for(int i=1;i<c->count;i++)if(c->blocks[i].joint){
        Block b=c->blocks[i];float direction=controls[b.positive]-controls[b.negative];
        p->parts[i].command=direction;
        if(b.joint==BLOCK_PISTON)b3PrismaticJoint_SetMotorSpeed(p->parts[i].joint,direction*b.speed);
        else if(b.joint==BLOCK_THRUSTER){
            b3WorldTransform t=b3Body_GetTransform(p->parts[i].body);Vector3 axis={0};((float *)&axis)[b.axis]=direction*b.force;
            axis=Vector3RotateByQuaternion(axis,(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s});
            b3Body_ApplyForceToCenter(p->parts[i].body,(b3Vec3){axis.x,axis.y,axis.z},true);
        }else b3RevoluteJoint_SetMotorSpeed(p->parts[i].joint,direction*b.speed);
        if(direction)p->parts[i].motor_steps++;
    }
}
void physics_sample(Physics *p,const Character *c) {
    p->steps++;
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
        if(b.joint){
            float angle=b.joint==BLOCK_PISTON?b3PrismaticJoint_GetTranslation(p->parts[i].joint):
                b.joint==BLOCK_THRUSTER?0:b3RevoluteJoint_GetAngle(p->parts[i].joint);
            float direction=p->parts[i].command;
            float delta=angle-p->parts[i].angle;
            if(b.joint==BLOCK_WHEEL){while(delta>PI)delta-=2*PI;while(delta< -PI)delta+=2*PI;}
            if(b.joint==BLOCK_PISTON)p->parts[i].rate=b3PrismaticJoint_GetSpeed(p->parts[i].joint);
            else if(b.joint==BLOCK_THRUSTER)p->parts[i].rate=0;
            else{
                b3WorldTransform parent=b3Body_GetTransform(p->parts[b.parent].body);
                b3Vec3 axis=b3RotateVector(parent.q,b3RotateVector(b3Joint_GetLocalFrameA(p->parts[i].joint).q,b3Vec3_axisZ));
                p->parts[i].rate=b3Dot(b3Sub(b3Body_GetAngularVelocity(p->parts[i].body),b3Body_GetAngularVelocity(p->parts[b.parent].body)),axis);
            }
            p->parts[i].driven_radians+=delta*direction;p->parts[i].angle=angle;
            p->parts[i].angle_peak=fmaxf(p->parts[i].angle_peak,fabsf(angle));
        }
    }
}
void physics_step(Physics *p,const Character *c,const unsigned char keys[128]) {
    physics_motor(p,c,keys);b3World_Step(p->world,1.f/60,8);physics_sample(p,c);
}
void physics_pose(const Physics *p,const Character *c,int i,Vector3 *position,Quaternion *rotation) {
    if(p->running){b3WorldTransform t=b3Body_GetTransform(p->parts[i].body);*position=(Vector3){t.p.x,t.p.y,t.p.z};*rotation=(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s};}
    else {*position=block_position(c->blocks[i]);*rotation=(Quaternion){0,0,0,1};}
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
int character_check(void) {
    wheel_cart_check();
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
