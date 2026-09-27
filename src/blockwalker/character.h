#pragma once
#include <raylib.h>
#include <box3d/box3d.h>

enum { COLOR_COUNT=6 };
enum { BLOCK_BOX, BLOCK_HINGE, BLOCK_PISTON, BLOCK_THRUSTER, BLOCK_WHEEL, BLOCK_MAGNET, BLOCK_EYES, BLOCK_TURNTABLE, BLOCK_WINCH, BLOCK_KINDS };
enum { MATERIAL_ALLOY,MATERIAL_HULL,MATERIAL_BALLAST,MATERIAL_COUNT };
enum { FINISH_PLAIN,FINISH_PANEL,FINISH_GLOW,FINISH_STRIPE,FINISH_COUNT };
#define HINGE_RADIUS .434f
#define HINGE_HALF .376f
#define TURNTABLE_RADIUS .485f
#define TURNTABLE_HALF .16f
#define WINCH_MAX_TRAVEL 96
typedef struct {
    int x,y,z,parent,joint,color,axis,negative,positive;
    float speed,limit,travel,force;
    int direction,material,finish,size;
} Block;
typedef struct { int count,capacity,anchored; Block *blocks; } Character;
typedef struct {b3WorldTransform transform;b3Vec3 velocity,angular;} PhysicsPose;
typedef struct {b3ShapeId id;int part;b3Transform local;b3Vec3 half;float volume,mass;} PhysicsShape;
typedef struct {
    b3BodyId body;
    int owner,mount;
    b3Transform frame;
    float mass,volume;
    b3Vec3 center;
    b3ShapeId shape,magnet_shape;
    b3JointId joint;
    int motor_steps;
    float angle_peak,angle,rate,command,driven_radians,submerged;
    b3BodyId magnet_target;
    b3Vec3 magnet_local;
    float magnet_power,magnet_load;
    float winch_length,winch_pull;
} PhysicsPart;
typedef struct {b3BodyId body;Block block;Vector3 start;} Cargo;
typedef struct {
    b3WorldId world;
    PhysicsPart *parts;
    PhysicsShape *shapes;
    int shape_count;
    int running,steps,owns_world,count,landscape,sampled;
    double time;
    float max_separation;
    Vector3 start;
    Cargo *cargo;
    int cargo_count;
} Physics;

extern const Color block_colors[COLOR_COUNT];
extern const char *block_names[BLOCK_KINDS];
Vector3 block_position(Block b);
int block_size(Block b);
float block_force_max(Block b);
int turntable_face(Block table,Block other);
float block_density(Block b);
int block_controlled(Block b);
int block_cylinder(Block b);
Vector3 block_half(Block b);
void *array_resize(void *memory,size_t count,size_t size);
void character_clear(Character *c);
void character_copy(Character *to,const Character *from);
int character_candidate(const Character *c,int parent,int x,int y,int z,int joint,int color,Block *block);
int character_validate(const Character *c);
int block_parent(const Character *c,int index);
int character_upgrade_thrusters(Character *c);
int character_add(Character *c,int parent,int x,int y,int z,int joint,int color);
void character_remove(Character *c,int index);
void character_preset(Character *c,int walker);
void character_car(Character *c);
int character_save(const Character *c,const char *path);
int character_load(Character *c,const char *path);
b3WorldId physics_world(int landscape);
void physics_attach(Physics *p,const Character *c,b3WorldId world,float x,float z,int landscape);
b3WorldTransform physics_transform(const PhysicsPart *part);
b3Pos physics_position(const PhysicsPart *part);
b3Pos physics_center(const PhysicsPart *part);
b3Vec3 physics_velocity(const PhysicsPart *part);
void physics_attach_poses(Physics *p,const Character *c,b3WorldId world,float x,float z,int landscape,const PhysicsPose *poses,int legacy_velocity);
void physics_start(Physics *p,const Character *c);
void physics_start_sea(Physics *p,const Character *c);
void physics_motor(Physics *p,const Character *c,const unsigned char keys[128]);
void physics_drive(Physics *p,const Character *c,const float controls[128]);
void physics_sample(Physics *p,const Character *c);
void physics_refresh(Physics *p,const Character *c);
void physics_stop(Physics *p);
void physics_step(Physics *p,const Character *c,const unsigned char keys[128]);
void physics_pose(const Physics *p,const Character *c,int i,Vector3 *position,Quaternion *rotation);
int physics_eyes(const Physics *p,const Character *c,Vector3 *position,Vector3 *forward,Vector3 *up);
void physics_add_cargo(Physics *p,Vector3 position,int material);
void magnet_drive(Physics *p,int index,Block block,float on,float off);
int character_check(void);
