#pragma once
#include <raylib.h>
#include <box3d/box3d.h>

enum { BLOCK_LIMIT=64, COLOR_COUNT=6 };
typedef struct {
    int x,y,z,parent,joint,color,axis,negative,positive;
    float speed,limit;
} Block;
typedef struct { int count; Block blocks[BLOCK_LIMIT]; } Character;
typedef struct {
    b3WorldId world;
    b3BodyId bodies[BLOCK_LIMIT];
    b3JointId joints[BLOCK_LIMIT];
    int running,steps,motor_steps[BLOCK_LIMIT];
    float angle_peak[BLOCK_LIMIT],angles[BLOCK_LIMIT],driven_radians[BLOCK_LIMIT],max_separation;
} Physics;

extern const Color block_colors[COLOR_COUNT];
Vector3 block_position(Block b);
int character_validate(const Character *c);
int character_add(Character *c,int parent,int x,int y,int z,int joint,int color);
void character_remove(Character *c,int index);
void character_preset(Character *c,int walker);
int character_save(const Character *c,const char *path);
int character_load(Character *c,const char *path);
void physics_start(Physics *p,const Character *c);
void physics_stop(Physics *p);
void physics_step(Physics *p,const Character *c,const unsigned char keys[128]);
void physics_pose(const Physics *p,const Character *c,int i,Vector3 *position,Quaternion *rotation);
int character_check(void);
