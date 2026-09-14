#pragma once
#include <raylib.h>
#include <box3d/box3d.h>

enum { COLOR_COUNT=6 };
enum { BLOCK_BOX, BLOCK_HINGE, BLOCK_PISTON, BLOCK_THRUSTER, BLOCK_WHEEL, BLOCK_KINDS };
typedef struct {
    int x,y,z,parent,joint,color,axis,negative,positive;
    float speed,limit,travel,force;
    int direction;
} Block;
typedef struct { int count,capacity; Block *blocks; } Character;
typedef struct {
    b3BodyId body;
    b3JointId joint;
    int motor_steps;
    float angle_peak,angle,rate,command,driven_radians;
} PhysicsPart;
typedef struct {
    b3WorldId world;
    PhysicsPart *parts;
    int running,steps,owns_world,count;
    float max_separation;
    Vector3 start;
} Physics;

extern const Color block_colors[COLOR_COUNT];
extern const char *block_names[BLOCK_KINDS];
Vector3 block_position(Block b);
void *array_resize(void *memory,size_t count,size_t size);
void character_clear(Character *c);
void character_copy(Character *to,const Character *from);
int character_candidate(const Character *c,int parent,int x,int y,int z,int joint,int color,Block *block);
int character_validate(const Character *c);
int character_add(Character *c,int parent,int x,int y,int z,int joint,int color);
void character_remove(Character *c,int index);
void character_preset(Character *c,int walker);
int character_save(const Character *c,const char *path);
int character_load(Character *c,const char *path);
b3WorldId physics_world(void);
void physics_attach(Physics *p,const Character *c,b3WorldId world,float x,float z);
void physics_start(Physics *p,const Character *c);
void physics_motor(Physics *p,const Character *c,const unsigned char keys[128]);
void physics_drive(Physics *p,const Character *c,const float controls[128]);
void physics_sample(Physics *p,const Character *c);
void physics_stop(Physics *p);
void physics_step(Physics *p,const Character *c,const unsigned char keys[128]);
void physics_pose(const Physics *p,const Character *c,int i,Vector3 *position,Quaternion *rotation);
int character_check(void);
