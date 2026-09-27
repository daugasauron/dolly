#include "character.h"
#include "terrain.h"
#include <assert.h>
#include <raymath.h>
#include <math.h>
#include <limits.h>
#include <float.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

const Color block_colors[COLOR_COUNT]={{89,119,112,255},{172,139,76,255},{83,101,129,255},{155,83,65,255},{65,73,79,255},{182,177,154,255}};
const char *block_names[BLOCK_KINDS]={"BOX","SERVO HINGE","PISTON","THRUSTER","WHEEL","MAGNET","EYES","TURNTABLE","WINCH"};
int block_size(Block b){return b.joint==BLOCK_TURNTABLE&&b.size>1?b.size:1;}
float block_force_max(Block b){int n=block_size(b);return 100*n*n;}
Vector3 block_position(Block b) {
    Vector3 p={b.x,b.y+.5f,b.z};
    if(block_size(b)%2==0)for(int axis=0;axis<3;axis++)if(axis!=b.axis)((float *)&p)[axis]+=.5f;
    return p;
}
int block_controlled(Block b){return b.joint!=BLOCK_BOX&&b.joint!=BLOCK_EYES;}
int block_cylinder(Block b){return b.joint==BLOCK_HINGE||b.joint==BLOCK_WHEEL||b.joint==BLOCK_TURNTABLE;}
Vector3 block_half(Block b){
    Vector3 half={.485f,.485f,.485f};
    if(block_cylinder(b)){
        float radius=b.joint==BLOCK_HINGE?HINGE_RADIUS:b.joint==BLOCK_TURNTABLE?block_size(b)*.5f-.015f:.7f;
        half=(Vector3){radius,radius,radius};((float *)&half)[b.axis]=b.joint==BLOCK_HINGE?HINGE_HALF:b.joint==BLOCK_TURNTABLE?TURNTABLE_HALF:.35f;
    }return half;
}
float block_density(Block b){
    Vector3 h=block_half(b);float density=b.joint==BLOCK_HINGE||b.joint==BLOCK_TURNTABLE?(.97f*.97f*.97f)/(24*sinf(PI/12)*h.x*h.y*h.z):b.joint==BLOCK_WHEEL?2:1;
    return density*block_size(b)*block_size(b)*(b.material==MATERIAL_HULL?.25f:b.material==MATERIAL_BALLAST?3:1);
}
static int blocks_adjacent(Block a,Block b){return llabs((long long)a.x-b.x)+llabs((long long)a.y-b.y)+llabs((long long)a.z-b.z)==1;}
static void block_cells(Block b,long long lo[3],long long hi[3]){
    int v[]={b.x,b.y,b.z},n=block_size(b);
    for(int axis=0;axis<3;axis++){lo[axis]=(long long)v[axis]-(axis==b.axis?0:(n-1)/2);hi[axis]=(long long)v[axis]+(axis==b.axis?0:n/2);}
}
static int blocks_overlap(Block a,Block b){
    long long al[3],ah[3],bl[3],bh[3];block_cells(a,al,ah);block_cells(b,bl,bh);
    for(int axis=0;axis<3;axis++)if(ah[axis]<bl[axis]||bh[axis]<al[axis])return 0;return 1;
}
int turntable_face(Block table,Block other){
    if(block_size(table)==1)return 0;
    long long lo[3],hi[3];block_cells(table,lo,hi);int v[]={other.x,other.y,other.z};
    for(int axis=0;axis<3;axis++)if(axis!=table.axis&&(v[axis]<lo[axis]||v[axis]>hi[axis]))return 0;
    long long d=(long long)v[table.axis]-lo[table.axis];return d==1?1:d==-1?-1:0;
}
static int blocks_connected(Block parent,Block child){
    if(block_size(child)>1)return turntable_face(child,parent)==-child.direction;
    if(block_size(parent)>1)return turntable_face(parent,child)!=0;
    return blocks_adjacent(parent,child);
}
static int blocks_exhaust(Block a,Block b){
    if(a.joint!=BLOCK_THRUSTER||a.axis<0||a.axis>2)return 0;
    long long v[]={a.x,a.y,a.z},lo[3],hi[3];v[a.axis]+=a.direction;block_cells(b,lo,hi);
    for(int axis=0;axis<3;axis++)if(v[axis]<lo[axis]||v[axis]>hi[axis])return 0;return 1;
}
static int exhaust_clear(const Character *c,Block b){
    for(int i=0;i<c->count;i++)if(blocks_exhaust(b,c->blocks[i])||blocks_exhaust(c->blocks[i],b))return 0;return 1;
}
static int articulates(Block b){return block_cylinder(b)||b.joint==BLOCK_PISTON||b.joint==BLOCK_WINCH;}
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
static int character_valid(const Character *c,int legacy) {
    if(c->count<0||c->count>c->capacity||(c->count&&!c->blocks)||(c->anchored!=0&&c->anchored!=1))return 0;
    unsigned char used[128]={0};
    for(int i=0;i<c->count;i++) {
        Block b=c->blocks[i];
        if(b.y<0||b.parent>=i||b.parent< -1||(i==0?b.parent!=-1:b.parent<0)||
           b.color<0||b.color>=COLOR_COUNT||b.joint<0||b.joint>=BLOCK_KINDS||b.axis<0||b.axis>2||b.material<0||b.material>=MATERIAL_COUNT||b.finish<0||b.finish>=FINISH_COUNT||
           b.size<0||b.size>4||(b.joint!=BLOCK_TURNTABLE&&b.size>1)||
           !isfinite(b.speed)||b.speed<.5f||b.speed>6||!isfinite(b.limit)||b.limit<15||b.limit>150||!isfinite(b.travel)||b.travel<(b.joint==BLOCK_WINCH?1:.25f)||b.travel>(b.joint==BLOCK_WINCH?WINCH_MAX_TRAVEL:3)||!isfinite(b.force)||b.force<2||b.force>block_force_max(b)||(b.direction!=1&&b.direction!=-1))return 0;
        long long lo[3],hi[3];block_cells(b,lo,hi);if(lo[1]<0)return 0;
        if(b.parent>=0&&!blocks_connected(c->blocks[b.parent],b))return 0;
        for(int j=0;j<i;j++)if(blocks_overlap(c->blocks[j],b))return 0;
        if(i==0&&b.joint)return 0;
        if(!legacy&&b.joint==BLOCK_THRUSTER&&(b.negative||!exhaust_clear(c,b)))return 0;
        if(block_controlled(b)){
            if(i==0||!key_valid(b.negative)||!key_valid(b.positive)||
                (b.negative&&(b.negative==b.positive||used[b.negative]))||(b.positive&&used[b.positive]))return 0;
            if(b.negative)used[b.negative]=1;if(b.positive)used[b.positive]=1;
        }
    }
    return 1;
}
int character_validate(const Character *c){return character_valid(c,0);}
int character_candidate(const Character *c,int parent,int x,int y,int z,int joint,int color,Block *block) {
    if(c->count==INT_MAX||y<0||parent< -1||parent>=c->count||
        (c->count==0?parent!=-1||joint:parent<0)||joint<0||joint>=BLOCK_KINDS||color<0||color>=COLOR_COUNT)return 0;
    Block b={.x=x,.y=y,.z=z,.parent=parent,.joint=joint,.color=color,.axis=2,.speed=2.5f,.limit=75,.travel=1.5f,.force=24,.direction=1,.size=1};
    if(joint==BLOCK_WINCH){b.travel=8;b.speed=.8f;}
    if(parent>=0&&!blocks_connected(c->blocks[parent],b))return 0;
    for(int i=0;i<c->count;i++)if(blocks_overlap(c->blocks[i],b))return 0;
    if(joint>=BLOCK_PISTON&&parent>=0){Block a=c->blocks[parent];b.axis=block_size(a)>1?a.axis:x!=a.x?0:y!=a.y?1:2;if(joint==BLOCK_PISTON||joint==BLOCK_THRUSTER||joint==BLOCK_MAGNET||joint==BLOCK_EYES||joint==BLOCK_TURNTABLE)b.direction=(b.axis==0?x-a.x:b.axis==1?y-a.y:z-a.z)<0?-1:1;}
    if(!exhaust_clear(c,b))return 0;
    if(block_controlled(b)){
        const char *choices="QAWSOKPLERDTFGYHUJIZXCVBNM1234567890";int found=0;
        for(const char *k=choices;*k&&found<(joint==BLOCK_THRUSTER?1:2);k++) {
            int used=0;for(int i=0;i<c->count;i++)if(block_controlled(c->blocks[i])&&(c->blocks[i].negative==*k||c->blocks[i].positive==*k))used=1;
            if(!used){if(found++==0&&joint!=BLOCK_THRUSTER)b.negative=*k;else b.positive=*k;}
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
static int append_thruster(Character *c,Block engine,int key,int nozzle){
    Block best={0},root=c->blocks[0];double score=DBL_MAX,outward=-DBL_MAX;int found=0;
    for(int i=0;i<c->count;i++)for(int axis=0;axis<3;axis++)for(int sign=-1;sign<=1;sign+=2){
        Block b=engine,a=c->blocks[i];long long v[]={a.x,a.y,a.z};v[axis]+=sign;
        if(v[0]<INT_MIN||v[0]>INT_MAX||v[1]<0||v[1]>INT_MAX||v[2]<INT_MIN||v[2]>INT_MAX)continue;
        b.x=v[0];b.y=v[1];b.z=v[2];b.parent=i;b.negative=0;b.positive=key;b.direction=nozzle;
        int occupied=0;for(int j=0;j<c->count;j++)occupied|=c->blocks[j].x==b.x&&c->blocks[j].y==b.y&&c->blocks[j].z==b.z;
        if(occupied||!exhaust_clear(c,b))continue;
        double d[]={ (double)b.x-engine.x,(double)b.y-engine.y,(double)b.z-engine.z },cost=0;
        for(int j=0;j<3;j++)cost+=d[j]*d[j]*(j==engine.axis?1:5);
        double radial=d[0]*((double)engine.x-root.x)+d[1]*((double)engine.y-root.y)+d[2]*((double)engine.z-root.z);
        if(cost<score||(cost==score&&radial>outward)){score=cost;outward=radial;best=b;found=1;}
    }
    if(!found)return 0;
    int index=character_add(c,best.parent,best.x,best.y,best.z,BLOCK_BOX,best.color);if(index<0)return 0;c->blocks[index]=best;return 1;
}
int character_upgrade_thrusters(Character *c){
    if(!character_valid(c,1))return 0;
    int count=c->count;Block *old=array_resize(NULL,count,sizeof(Block));if(count)memcpy(old,c->blocks,count*sizeof(Block));
    for(int i=0;i<count;i++)if(c->blocks[i].joint==BLOCK_THRUSTER){c->blocks[i].negative=0;c->blocks[i].direction=-1;}
    for(int i=0;i<count;i++)if(c->blocks[i].joint==BLOCK_THRUSTER&&!exhaust_clear(c,c->blocks[i])){c->blocks[i].joint=BLOCK_BOX;c->blocks[i].positive=0;}
    int good=1;
    for(int i=0;good&&i<count;i++)if(old[i].joint==BLOCK_THRUSTER){
        if(c->blocks[i].joint!=BLOCK_THRUSTER)good=append_thruster(c,old[i],old[i].positive,-1);
        if(good&&old[i].negative)good=append_thruster(c,old[i],old[i].negative,1);
    }
    free(old);return good&&character_validate(c);
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
    int nose=character_add(c,0,0,1,1,BLOCK_BOX,0);
    int steering=character_add(c,nose,0,1,2,BLOCK_HINGE,1);
    c->blocks[steering].axis=1;c->blocks[steering].limit=35;c->blocks[steering].force=60;
    c->blocks[steering].negative='J';c->blocks[steering].positive='L';
    int front=character_add(c,steering,0,1,3,BLOCK_BOX,0),rear=character_add(c,0,0,1,-1,BLOCK_BOX,0);
    for(int i=0;i<4;i++){
        int wheel=character_add(c,i<2?front:rear,i%2?1:-1,1,i<2?3:-1,BLOCK_WHEEL,1);
        c->blocks[wheel].axis=0;c->blocks[wheel].speed=4;c->blocks[wheel].force=12;
        c->blocks[wheel].negative='1'+i*2;c->blocks[wheel].positive='2'+i*2;
    }
    int eye=character_add(c,0,0,2,0,BLOCK_EYES,5);c->blocks[eye].axis=2;c->blocks[eye].direction=1;
    int magnet=character_add(c,front,0,1,4,BLOCK_MAGNET,1);c->blocks[magnet].negative='Q';c->blocks[magnet].positive='E';
    for(int i=0;i<c->count;i++)c->blocks[i].finish=i==magnet?FINISH_STRIPE:FINISH_PANEL;
}
int character_save(const Character *c,const char *path) {
    if(!character_validate(c))return 0;
    char tmp[256];if(snprintf(tmp,sizeof(tmp),"%s.tmp",path)>=(int)sizeof(tmp))return 0;
    FILE *f=fopen(tmp,"w");if(!f)return 0;
    fprintf(f,"BLOCKWALKER 9\n%d %d\n",c->count,c->anchored);
    for(int i=0;i<c->count;i++){Block b=c->blocks[i];fprintf(f,"%d %d %d %d %d %d %d %d %d %.3f %.3f %.3f %.3f %d %d %d %d\n",b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive,b.speed,b.limit,b.travel,b.force,b.direction,b.material,b.finish,block_size(b));}
    int good=!ferror(f);if(fclose(f)!=0)good=0;
    if(!good||rename(tmp,path)!=0){remove(tmp);return 0;}return 1;
}
int character_load(Character *c,const char *path) {
    FILE *f=fopen(path,"r");if(!f)return 0;
    Character next={0};char magic[32];int version=0,good=1;
    if(fscanf(f,"%31s %d %d",magic,&version,&next.count)!=3||strcmp(magic,"BLOCKWALKER")||(version<1||version>9)||next.count<0||next.count>INT_MAX/(int)sizeof(Block))good=0;
    if(good&&version>=4&&fscanf(f,"%d",&next.anchored)!=1)good=0;
    if(good){next.capacity=next.count;next.blocks=array_resize(NULL,next.count,sizeof(Block));}
    for(int i=0;good&&i<next.count;i++){Block *b=&next.blocks[i];*b=(Block){.travel=1.5f,.force=24,.direction=1,.size=1};if(fscanf(f,"%d%d%d%d%d%d%d%d%d%f%f",&b->x,&b->y,&b->z,&b->parent,&b->joint,&b->color,&b->axis,&b->negative,&b->positive,&b->speed,&b->limit)!=11)good=0;if(version>=2&&fscanf(f,"%f%f",&b->travel,&b->force)!=2)good=0;if(version>=3&&fscanf(f,"%d",&b->direction)!=1)good=0;if(version>=4&&fscanf(f,"%d%d",&b->material,&b->finish)!=2)good=0;if(version>=8&&fscanf(f,"%d",&b->size)!=1)good=0;}
    int ch;while((ch=fgetc(f))!=EOF)if(ch!=' '&&ch!='\n'&&ch!='\t'&&ch!='\r')good=0;
    fclose(f);if(!good||!(version<7?character_upgrade_thrusters(&next):character_validate(&next))){character_clear(&next);return 0;}character_clear(c);*c=next;return 1;
}
void physics_stop(Physics *p) {
    if(p->running){if(p->owns_world)b3DestroyWorld(p->world);else {for(int i=0;i<p->count;i++)if(p->parts[i].owner==i)b3DestroyBody(p->parts[i].body);for(int i=0;i<p->cargo_count;i++)b3DestroyBody(p->cargo[i].body);}}
    free(p->parts);free(p->shapes);free(p->cargo);memset(p,0,sizeof(*p));
}
static bool block_contact_filter(b3ShapeId a,b3ShapeId b,void *context){
    (void)context;PhysicsPart *parts=b3Body_GetUserData(b3Shape_GetBody(a));if(!parts||parts!=b3Body_GetUserData(b3Shape_GetBody(b)))return true;
    PhysicsPart *left=b3Shape_GetUserData(a),*right=b3Shape_GetUserData(b);assert(left&&right);
    return !(left->mount>=0&&parts+left->mount==right)&&!(right->mount>=0&&parts+right->mount==left);
}
b3WorldId physics_world(int landscape) {
    b3WorldDef w=b3DefaultWorldDef();w.workerCount=landscape?4:1;w.gravity=(b3Vec3){0,-4,0};b3WorldId world=b3CreateWorld(&w);b3World_SetCustomFilterCallback(world,block_contact_filter,NULL);
    if(landscape){terrain_build(world);return world;}
    b3BodyDef floor=b3DefaultBodyDef();floor.position=(b3Pos){0,-.5f,0};
    b3BodyId ground=b3CreateBody(world,&floor);b3BoxHull slab=b3MakeBoxHull(100,.5f,100);
    b3ShapeDef shape=b3DefaultShapeDef();shape.density=1;shape.baseMaterial.friction=.85f;b3CreateHullShape(ground,&shape,&slab.base);
    return world;
}
int block_parent(const Character *c,int index){
    Block b=c->blocks[index],a=c->blocks[b.parent];
    return block_size(a)>1&&turntable_face(a,b)==-a.direction?block_parent(c,b.parent):b.parent;
}
b3WorldTransform physics_transform(const PhysicsPart *part){return b3MulWorldTransforms(b3Body_GetTransform(part->body),part->frame);}
b3Pos physics_position(const PhysicsPart *part){return physics_transform(part).p;}
b3Pos physics_center(const PhysicsPart *part){return b3TransformWorldPoint(physics_transform(part),part->center);}
b3Vec3 physics_velocity(const PhysicsPart *part){return b3Body_GetWorldPointVelocity(part->body,physics_position(part));}
static int component_root(int *components,int i){while(components[i]!=i){components[i]=components[components[i]];i=components[i];}return i;}
static void component_join(int *components,int a,int b){a=component_root(components,a);b=component_root(components,b);components[a>b?a:b]=a<b?a:b;}
static b3ShapeId attach_shape(Physics *p,int index,const b3HullData *hull,b3Transform local,b3Vec3 half,float density,float friction){
    PhysicsPart *part=&p->parts[index];b3ShapeDef def=b3DefaultShapeDef();def.density=density;def.updateBodyMass=false;def.baseMaterial.friction=friction;def.userData=part;def.enableCustomFiltering=true;
    b3ShapeId id=b3CreateTransformedHullShape(part->body,&def,hull,b3MulTransforms(part->frame,local),(b3Vec3){1,1,1});
    b3MassData mass=b3Shape_ComputeMassData(id);b3Vec3 center=b3InvTransformPoint(part->frame,mass.center);
    part->center=b3Add(part->center,b3MulSV(mass.mass,center));part->mass+=mass.mass;part->volume+=mass.mass/density;
    p->shapes[p->shape_count++]=(PhysicsShape){id,index,local,half,mass.mass/density,mass.mass};return id;
}
static void restore_momentum(Physics *p,const PhysicsPose *poses,int legacy_velocity){
    b3Vec3 *momentum=calloc(p->count,sizeof(*momentum)),*angular=calloc(p->count,sizeof(*angular));assert(momentum&&angular);
    for(int i=0;i<p->shape_count;i++){
        PhysicsShape shape=p->shapes[i];PhysicsPart *part=&p->parts[shape.part];int owner=part->owner;
        if(b3Body_GetType(part->body)!=b3_dynamicBody)continue;
        b3MassData mass=b3Shape_ComputeMassData(shape.id);b3WorldTransform body=b3Body_GetTransform(part->body);b3Pos center=b3Body_GetWorldPoint(part->body,mass.center);
        PhysicsPose pose=poses[shape.part];b3Vec3 velocity=pose.velocity;
        if(legacy_velocity)velocity=b3Sub(velocity,b3Cross(pose.angular,b3RotateVector(pose.transform.q,part->center)));
        velocity=b3Add(velocity,b3Cross(pose.angular,b3SubPos(center,pose.transform.p)));
        b3Vec3 linear=b3MulSV(mass.mass,velocity);momentum[owner]=b3Add(momentum[owner],linear);
        b3Matrix3 rotation=b3MakeMatrixFromQuat(body.q),inertia=b3MulMM(b3MulMM(rotation,mass.inertia),b3Transpose(rotation));
        angular[owner]=b3Add(angular[owner],b3Add(b3MulMV(inertia,pose.angular),b3Cross(b3SubPos(center,b3Body_GetWorldCenterOfMass(part->body)),linear)));
    }
    for(int i=0;i<p->count;i++)if(p->parts[i].owner==i&&b3Body_GetType(p->parts[i].body)==b3_dynamicBody){
        b3BodyId body=p->parts[i].body;float mass=b3Body_GetMass(body);b3Body_SetLinearVelocity(body,b3MulSV(1/mass,momentum[i]));
        b3Body_SetAngularVelocity(body,b3MulMV(b3Body_GetWorldInverseRotationalInertia(body),angular[i]));
    }free(momentum);free(angular);
}
void physics_attach_poses(Physics *p,const Character *c,b3WorldId world,float x,float z,int landscape,const PhysicsPose *poses,int legacy_velocity){
    physics_stop(p);p->world=world;p->running=1;p->count=c->count;p->landscape=landscape;
    p->parts=array_resize(NULL,c->count,sizeof(PhysicsPart));if(c->count)memset(p->parts,0,c->count*sizeof(PhysicsPart));
    p->shapes=array_resize(NULL,(size_t)c->count*2,sizeof(PhysicsShape));int *components=array_resize(NULL,c->count,sizeof(int));
    for(int i=0;i<c->count;i++)components[i]=i;
    for(int i=1;i<c->count;i++)if(!articulates(c->blocks[i]))component_join(components,i,block_parent(c,i));
    for(int i=1;i<c->count;i++)for(int j=0;j<i;j++)if(!articulates(c->blocks[i])&&!articulates(c->blocks[j])&&blocks_adjacent(c->blocks[i],c->blocks[j]))component_join(components,i,j);
    for(int i=1;i<c->count;i++)if(block_size(c->blocks[i])>1)for(int j=0;j<c->count;j++){
        int face=turntable_face(c->blocks[i],c->blocks[j]);if(face&&!articulates(c->blocks[j]))component_join(components,j,face==c->blocks[i].direction?i:block_parent(c,i));
    }
    int minimum=INT_MAX;for(int i=0;i<c->count;i++){long long lo[3],hi[3];block_cells(c->blocks[i],lo,hi);if(lo[1]<minimum)minimum=lo[1];}
    float ground=landscape?(c->anchored?terrain_height(x,z):fmaxf(terrain_height(x,z),WATER_LEVEL)):0;
    for(int i=0;i<c->count;i++){
        PhysicsPart *part=&p->parts[i];part->winch_length=c->blocks[i].joint==BLOCK_WINCH?1:0;part->owner=component_root(components,i);part->mount=i&&articulates(c->blocks[i])&&c->blocks[i].joint!=BLOCK_WINCH?block_parent(c,i):-1;Vector3 v=block_position(c->blocks[i]);
        b3WorldTransform transform=poses?poses[i].transform:(b3WorldTransform){{v.x+x,v.y-minimum+(c->anchored?-.015f:.15f)+ground,v.z+z},{{0,0,0},1}};
        transform.q=b3NormalizeQuat(transform.q);
        if(part->owner==i){b3BodyDef body=b3DefaultBodyDef();body.type=c->anchored&&i==0?b3_staticBody:b3_dynamicBody;body.position=transform.p;body.rotation=transform.q;body.userData=p->parts;body.angularDamping=.08f;body.enableSleep=false;part->body=b3CreateBody(world,&body);}
        else part->body=p->parts[part->owner].body;
        part->frame=part->owner==i?b3Transform_identity:b3InvMulWorldTransforms(b3Body_GetTransform(part->body),transform);part->frame.q=b3NormalizeQuat(part->frame.q);
    }free(components);
    b3BoxHull cube=b3MakeBoxHull(.485f,.485f,.485f);
    for(int i=0;i<c->count;i++){
        Block b=c->blocks[i];Vector3 h=block_half(b);b3Vec3 half={h.x,h.y,h.z};
        if(block_cylinder(b)){
            float radius=((float *)&h)[(b.axis+1)%3],extent=((float *)&h)[b.axis];b3HullData *cylinder=b3CreateCylinder(2*extent,radius,-extent,24);b3Quat q={{0,0,0},1};
            if(b.axis==0)q=(b3Quat){{0,0,-.70710678f},.70710678f};if(b.axis==2)q=(b3Quat){{.70710678f,0,0},.70710678f};
            b3HullData *rotated=b3CloneAndTransformHull(cylinder,(b3Transform){{0,0,0},q},(b3Vec3){1,1,1});
            p->parts[i].shape=attach_shape(p,i,rotated,b3Transform_identity,half,block_density(b),b.joint==BLOCK_WHEEL?1.3f:.85f);b3DestroyHull(rotated);b3DestroyHull(cylinder);
        }else p->parts[i].shape=attach_shape(p,i,&cube.base,b3Transform_identity,half,block_density(b),.85f);
    }
    for(int i=1;i<c->count;i++)if(block_size(c->blocks[i])>1){
        Block b=c->blocks[i];int parent=block_parent(c,i);Vector3 offset=Vector3Subtract(block_position(b),block_position(c->blocks[parent]));((float *)&offset)[b.axis]-=b.direction*.33f;
        Vector3 h=block_half(b);((float *)&h)[b.axis]=.14f;b3BoxHull plate=b3MakeBoxHull(h.x,h.y,h.z);
        attach_shape(p,parent,&plate.base,(b3Transform){{offset.x,offset.y,offset.z},{{0,0,0},1}},(b3Vec3){h.x,h.y,h.z},b.material==MATERIAL_HULL?.25f:b.material==MATERIAL_BALLAST?3:1,.85f);
    }
    for(int i=0;i<c->count;i++)if(p->parts[i].owner==i)b3Body_ApplyMassFromShapes(p->parts[i].body);
    for(int i=0;i<c->count;i++)if(p->parts[i].mass>0)p->parts[i].center=b3MulSV(1/p->parts[i].mass,p->parts[i].center);
    for(int i=1;i<c->count;i++){
        Block b=c->blocks[i];int parent=block_parent(c,i);if(!articulates(b)||p->parts[parent].owner==p->parts[i].owner)continue;
        Vector3 delta=Vector3Subtract(block_position(b),block_position(c->blocks[parent]));
        b3Transform fa={.p={delta.x*.5f,delta.y*.5f,delta.z*.5f},.q={{0,0,0},1}},fb={.p={-delta.x*.5f,-delta.y*.5f,-delta.z*.5f},.q={{0,0,0},1}};
        if(block_size(b)>1){fa.p=(b3Vec3){delta.x,delta.y,delta.z};fb.p=b3Vec3_zero;}
        if(b.joint==BLOCK_WINCH){
            PhysicsPart *part=&p->parts[i];part->winch_length=Clamp(b3Length(b3SubPos(physics_position(part),physics_position(&p->parts[parent]))),1,b.travel);
            b3DistanceJointDef j=b3DefaultDistanceJointDef();j.base.bodyIdA=p->parts[parent].body;j.base.bodyIdB=part->body;j.base.collideConnected=true;
            j.base.localFrameA=p->parts[parent].frame;j.base.localFrameB=part->frame;j.enableSpring=true;j.hertz=0;j.enableLimit=true;j.minLength=.005f;j.maxLength=part->winch_length;
            part->joint=b3CreateDistanceJoint(world,&j);
        }else if(b.joint==BLOCK_PISTON){
            int sign=b.direction;if(b.axis==0&&sign<0)fa.q=(b3Quat){{0,0,1},0};if(b.axis==1)fa.q=(b3Quat){{0,0,sign*.70710678f},.70710678f};if(b.axis==2)fa.q=(b3Quat){{0,-sign*.70710678f,0},.70710678f};fb.q=fa.q;
            b3PrismaticJointDef j=b3DefaultPrismaticJointDef();j.base.bodyIdA=p->parts[parent].body;j.base.bodyIdB=p->parts[i].body;j.base.collideConnected=true;j.base.localFrameA=b3MulTransforms(p->parts[parent].frame,fa);j.base.localFrameB=b3MulTransforms(p->parts[i].frame,fb);
            // Keep the awake body second; reverse both axes to preserve extension sign.
            if(b3Body_GetType(j.base.bodyIdB)==b3_staticBody){
                b3BodyId body=j.base.bodyIdA;j.base.bodyIdA=j.base.bodyIdB;j.base.bodyIdB=body;
                b3Transform frame=j.base.localFrameA;j.base.localFrameA=j.base.localFrameB;j.base.localFrameB=frame;
                b3Quat reverse={{0,0,1},0};j.base.localFrameA.q=b3MulQuat(j.base.localFrameA.q,reverse);j.base.localFrameB.q=b3MulQuat(j.base.localFrameB.q,reverse);
            }
            j.enableMotor=true;j.maxMotorForce=b.force;j.enableLimit=true;j.lowerTranslation=0;j.upperTranslation=b.travel;p->parts[i].joint=b3CreatePrismaticJoint(world,&j);
        }else{
            if(b.axis==0)fa.q=(b3Quat){{0,.70710678f,0},.70710678f};if(b.axis==1)fa.q=(b3Quat){{-.70710678f,0,0},.70710678f};fb.q=fa.q;
            b3RevoluteJointDef j=b3DefaultRevoluteJointDef();j.base.bodyIdA=p->parts[parent].body;j.base.bodyIdB=p->parts[i].body;j.base.collideConnected=true;j.base.localFrameA=b3MulTransforms(p->parts[parent].frame,fa);j.base.localFrameB=b3MulTransforms(p->parts[i].frame,fb);
            j.enableMotor=true;j.maxMotorTorque=b.force;j.enableLimit=b.joint==BLOCK_HINGE;j.lowerAngle=-b.limit*DEG2RAD;j.upperAngle=b.limit*DEG2RAD;p->parts[i].joint=b3CreateRevoluteJoint(world,&j);
        }
    }
    if(poses&&c->count)restore_momentum(p,poses,legacy_velocity);
    if(c->count){b3Pos root=physics_position(&p->parts[0]);p->start=(Vector3){root.x,root.y,root.z};}
}
void physics_attach(Physics *p,const Character *c,b3WorldId world,float x,float z,int landscape){physics_attach_poses(p,c,world,x,z,landscape,NULL,0);}
void physics_start(Physics *p,const Character *c) {
    physics_stop(p);physics_attach(p,c,physics_world(0),0,0,0);p->owns_world=1;
}
void physics_start_sea(Physics *p,const Character *c){physics_stop(p);physics_attach(p,c,physics_world(1),125,10,1);p->owns_world=1;}
void physics_motor(Physics *p,const Character *c,const unsigned char keys[128]) {
    float controls[128];for(int i=0;i<128;i++)controls[i]=keys[i]!=0;
    physics_drive(p,c,controls);
}
static void winch_drive(PhysicsPart *part,Block block,float control){
    part->winch_pull=0;if(!b3Joint_IsValid(part->joint))return;
    b3BodyId a=b3Joint_GetBodyA(part->joint),b=b3Joint_GetBodyB(part->joint);
    b3Pos from=b3Body_GetWorldPoint(a,b3Joint_GetLocalFrameA(part->joint).p),to=b3Body_GetWorldPoint(b,b3Joint_GetLocalFrameB(part->joint).p);
    b3Vec3 delta=b3SubPos(to,from);float distance=b3Length(delta),length=part->winch_length;
    if(control>0)length=fminf(block.travel,length+control*block.speed/60);
    if(control<0){
        length=fminf(length,fmaxf(1,fmaxf(distance,length+control*block.speed/60)));
        if(distance>length-.02f&&distance>.001f){
            b3Vec3 axis=b3MulSV(1/distance,delta),velocity=b3Sub(b3Body_GetWorldPointVelocity(b,to),b3Body_GetWorldPointVelocity(a,from));
            float ma=b3Body_GetMass(a),mb=b3Body_GetMass(b),mass=ma>0&&mb>0?ma*mb/(ma+mb):fmaxf(ma,mb);
            part->winch_pull=fminf(block.force,fmaxf(0,mass*(b3Dot(velocity,axis)-control*block.speed)/(.05f+1.f/60)));
            b3Vec3 force=b3MulSV(part->winch_pull,axis);b3Body_ApplyForce(a,force,from,true);b3Body_ApplyForce(b,b3Neg(force),to,true);
        }
    }
    if(length!=part->winch_length){part->winch_length=length;b3DistanceJoint_SetLengthRange(part->joint,.005f,length);}
}
void physics_drive(Physics *p,const Character *c,const float controls[128]) {
    for(int i=1;i<c->count;i++)if(block_controlled(c->blocks[i])){
        Block b=c->blocks[i];float direction=b.joint==BLOCK_THRUSTER?(b.positive?Clamp(controls[b.positive],0,1):0):controls[b.positive]-controls[b.negative];
        p->parts[i].command=direction;
        if(b.joint==BLOCK_MAGNET)magnet_drive(p,i,b,controls[b.positive],controls[b.negative]);
        else if(b.joint==BLOCK_WINCH)winch_drive(&p->parts[i],b,direction);
        else if(b.joint==BLOCK_PISTON&&b3Joint_IsValid(p->parts[i].joint))b3PrismaticJoint_SetMotorSpeed(p->parts[i].joint,direction*b.speed);
        else if(b.joint==BLOCK_THRUSTER){
            b3WorldTransform t=physics_transform(&p->parts[i]);Vector3 axis={0};((float *)&axis)[b.axis]=-b.direction*direction*b.force;
            axis=Vector3RotateByQuaternion(axis,(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s});
            b3Body_ApplyForce(p->parts[i].body,(b3Vec3){axis.x,axis.y,axis.z},t.p,true);
        }else if(b3Joint_IsValid(p->parts[i].joint))b3RevoluteJoint_SetMotorSpeed(p->parts[i].joint,direction*b.speed);
        if(direction)p->parts[i].motor_steps++;
    }
    water_forces(p);
}
static void physics_read(Physics *p,const Character *c,int advanced) {
    if(advanced){p->steps++;p->time+=1./60;p->sampled=1;}
    for(int i=1;i<c->count;i++){
        Block b=c->blocks[i];
        if(!b3Joint_IsValid(p->parts[i].joint))continue;
        float separation;
        if(b.joint==BLOCK_PISTON){
            b3WorldTransform a=b3Body_GetTransform(b3Joint_GetBodyA(p->parts[i].joint)),child=b3Body_GetTransform(b3Joint_GetBodyB(p->parts[i].joint));
            b3Transform fa=b3Joint_GetLocalFrameA(p->parts[i].joint),fb=b3Joint_GetLocalFrameB(p->parts[i].joint);
            b3Vec3 delta=b3SubPos(b3TransformWorldPoint(child,fb.p),b3TransformWorldPoint(a,fa.p));
            b3Vec3 axis=b3RotateVector(a.q,b3RotateVector(fa.q,b3Vec3_axisX));
            float along=b3Dot(delta,axis),bounded=Clamp(along,0,b.travel);
            separation=b3Length(b3Sub(delta,b3MulSV(bounded,axis)));
        }else if(b.joint==BLOCK_WINCH)separation=fmaxf(0,b3DistanceJoint_GetCurrentLength(p->parts[i].joint)-p->parts[i].winch_length);
        else separation=b3Joint_GetLinearSeparation(p->parts[i].joint);
        p->max_separation=fmaxf(p->max_separation,separation);
        if(block_controlled(b)){
            float angle=b.joint==BLOCK_WINCH?b3DistanceJoint_GetCurrentLength(p->parts[i].joint):b.joint==BLOCK_PISTON?b3PrismaticJoint_GetTranslation(p->parts[i].joint):
                (b.joint==BLOCK_THRUSTER||b.joint==BLOCK_MAGNET)?0:b3RevoluteJoint_GetAngle(p->parts[i].joint);
            float direction=p->parts[i].command;
            float delta=angle-p->parts[i].angle;
            if(b.joint==BLOCK_WHEEL||b.joint==BLOCK_TURNTABLE){while(delta>PI)delta-=2*PI;while(delta< -PI)delta+=2*PI;}
            if(b.joint==BLOCK_PISTON)p->parts[i].rate=b3PrismaticJoint_GetSpeed(p->parts[i].joint);
            else if(b.joint==BLOCK_WINCH){
                b3BodyId parent=b3Joint_GetBodyA(p->parts[i].joint);b3Pos from=b3Body_GetWorldPoint(parent,b3Joint_GetLocalFrameA(p->parts[i].joint).p),to=physics_position(&p->parts[i]);
                b3Vec3 axis=b3Normalize(b3SubPos(to,from));p->parts[i].rate=b3Dot(b3Sub(b3Body_GetWorldPointVelocity(p->parts[i].body,to),b3Body_GetWorldPointVelocity(parent,from)),axis);
            }else if(b.joint==BLOCK_THRUSTER||b.joint==BLOCK_MAGNET)p->parts[i].rate=0;
            else{
                b3WorldTransform parent=b3Body_GetTransform(b3Joint_GetBodyA(p->parts[i].joint));
                b3Vec3 axis=b3RotateVector(parent.q,b3RotateVector(b3Joint_GetLocalFrameA(p->parts[i].joint).q,b3Vec3_axisZ));
                p->parts[i].rate=b3Dot(b3Sub(b3Body_GetAngularVelocity(p->parts[i].body),b3Body_GetAngularVelocity(b3Joint_GetBodyA(p->parts[i].joint))),axis);
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
    if(p->running){b3WorldTransform t=physics_transform(&p->parts[i]);*position=(Vector3){t.p.x,t.p.y,t.p.z};*rotation=(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s};}
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
    for(int i=0;i<2;i++)if(p.parts[i].owner==i){b3Pos pos=b3Body_GetPosition(p.parts[i].body);pos.y+=3;b3Body_SetTransform(p.parts[i].body,pos,(b3Quat){{0,0,0},1});}
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
    if(kind==BLOCK_THRUSTER){
        Block b=c.blocks[1],candidate;int v[]={b.x,b.y,b.z};v[axis]+=sign;
        assert(b.direction==sign&&!b.negative&&b.positive);
        assert(!character_candidate(&c,1,v[0],v[1],v[2],BLOCK_BOX,0,&candidate));
        c.blocks[1].direction=-sign;assert(!character_validate(&c));c.blocks[1]=b;c.blocks[1].positive='A';
    }
    physics_start(&p,&c);b3World_SetGravity(p.world,(b3Vec3){0,0,0});
    for(int i=0;i<2;i++)if(p.parts[i].owner==i){b3Pos pos=b3Body_GetPosition(p.parts[i].body);pos.y+=5;b3Body_SetTransform(p.parts[i].body,pos,(b3Quat){{0,0,0},1});}
    if(kind!=BLOCK_THRUSTER)b3Body_SetType(p.parts[0].body,b3_staticBody);
    b3Pos initial=b3Body_GetPosition(p.parts[1].body);
    keys['A']=1;for(int i=0;i<(kind==BLOCK_WHEEL?600:kind==BLOCK_THRUSTER?12:60);i++)physics_step(&p,&c,keys);
    float forward=p.parts[1].angle;keys['A']=0;
    if(kind==BLOCK_WHEEL)assert(p.parts[1].driven_radians>9.5f);
    else if(kind==BLOCK_PISTON){
        b3Pos position=b3Body_GetPosition(p.parts[1].body);
        float displacement=axis==0?position.x-initial.x:axis==1?position.y-initial.y:position.z-initial.z;
        assert(forward>.8f&&forward<1.1f&&displacement*sign>.8f);
    }
    else {
        b3Vec3 momentum={0};for(int i=0;i<p.count;i++)if(p.parts[i].owner==i){b3BodyId body=p.parts[i].body;momentum=b3Add(momentum,b3MulSV(b3Body_GetMass(body),b3Body_GetLinearVelocity(body)));}
        assert(fabsf(((float *)&momentum)[axis]+sign*c.blocks[1].force*.2f)<.02f);
    }
    for(int i=0;i<60;i++)physics_step(&p,&c,keys);
    if(kind==BLOCK_PISTON||kind==BLOCK_WHEEL)assert(fabsf(p.parts[1].angle-forward)<.03f);
    keys['Q']=1;for(int i=0;i<150;i++)physics_step(&p,&c,keys);
    if(kind==BLOCK_PISTON)assert(fabsf(p.parts[1].angle)<.03f);
    if(kind==BLOCK_THRUSTER)assert(p.parts[1].command==0);
    assert(p.max_separation<.03f);
    printf("ACTUATOR %s %c: forward %.3f, reverse %.3f, driven %.3f\n",block_names[kind],'X'+axis,forward,p.parts[1].angle,p.parts[1].driven_radians);
    physics_stop(&p);character_clear(&c);
}
static void adjacency_check(void){
    Character c={0};Physics p={0};unsigned char keys[128]={0};
    character_add(&c,-1,0,4,0,BLOCK_BOX,0);character_add(&c,0,1,4,0,BLOCK_BOX,0);
    character_add(&c,1,1,5,0,BLOCK_BOX,0);character_add(&c,2,0,5,0,BLOCK_BOX,0);c.anchored=1;
    physics_start(&p,&c);assert(B3_ID_EQUALS(p.parts[3].body,p.parts[0].body));
    b3World_SetGravity(p.world,(b3Vec3){0,-4,0});
    b3Pos initial=physics_position(&p.parts[3]);
    b3Body_ApplyLinearImpulseToCenter(p.parts[3].body,(b3Vec3){8,0,4},true);
    for(int i=0;i<240;i++)b3World_Step(p.world,1.f/60,8);
    b3Pos held=physics_position(&p.parts[3]);assert(fabs(held.x-initial.x)+fabs(held.y-initial.y)+fabs(held.z-initial.z)<.01);
    physics_stop(&p);c.blocks[3].joint=BLOCK_HINGE;c.blocks[3].negative='Q';c.blocks[3].positive='A';
    physics_start(&p,&c);assert(b3Body_GetJointCount(p.parts[3].body)==1);
    b3World_SetGravity(p.world,(b3Vec3){0,0,0});keys['Q']=1;
    for(int i=0;i<120;i++)physics_step(&p,&c,keys);
    assert(p.parts[3].angle<-.9f);
    printf("ADJACENCY: touching boxes share a fixed assembly; adjacent servo remains free, angle %.3f rad\n",p.parts[3].angle);
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
    keys[c.blocks[piston].positive]=0;c.blocks[magnet].force=100;
    for(int i=0;i<240;i++)physics_step(&p,&c,keys);
    float holding=p.parts[magnet].magnet_load,weight=b3Body_GetMass(p.cargo[0].body)*4;
    printf("MAGNET HOLD: force %.3f N, weight %.3f N, speed %.5f m/s\n",holding,weight,b3Length(b3Body_GetLinearVelocity(p.cargo[0].body)));
    assert(b3Body_IsValid(p.parts[magnet].magnet_target)&&fabsf(holding-weight)<1&&b3Length(b3Body_GetLinearVelocity(p.cargo[0].body))<.05f);
    keys[c.blocks[magnet].negative]=1;
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
        actuator_check(BLOCK_PISTON,axis,1);actuator_check(BLOCK_PISTON,axis,-1);actuator_check(BLOCK_THRUSTER,axis,1);actuator_check(BLOCK_THRUSTER,axis,-1);actuator_check(BLOCK_WHEEL,axis,1);
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
