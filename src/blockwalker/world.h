#pragma once
#include "character.h"
#include <quickjs.h>
typedef struct Controller Controller;
typedef struct {Character design;char name[64];char *source;int hz;float x,z;} SavedDesign;
typedef struct {int id,cause;char name[64],detail[160];double time,seconds;Vector3 position;float up;} Removal;
typedef struct {int cargo,carrier,depot,points;char name[64];double time;} Delivery;
enum {RADIO_SIGHT,RADIO_CLAIM,RADIO_READY,RADIO_RELEASE,RADIO_KINDS,RADIO_CAPACITY=32};
typedef struct {int team,from,cargo,kind;char name[64];double time;Vector3 position;float mass;} RadioMessage;
typedef struct {
    int id;char name[64];Character design;Physics physics;Controller *controller;
    float fallen,root_height;float controls[128];
    int team;
    int cargo,carrier,held_by,delivered,supply,parachute;float settled;Vector3 pickup;
} Creature;
typedef struct {Creature *creatures;int count,capacity,next_id,deaths,player;double age;b3WorldId physics;SavedDesign *designs;int design_count,design_capacity;Removal *removals;int removal_count,removal_capacity;Delivery *deliveries;int delivery_count,delivery_capacity;RadioMessage radio[RADIO_CAPACITY];int radio_count;unsigned supply_seed;double next_parcel,next_ore;} World;
extern World world;
JSValue character_json(JSContext *ctx,const Character *c);
JSValue physics_sensors(JSContext *ctx,const Physics *p,const Character *c,double dt);
int character_from_json(JSContext *ctx,JSValueConst list,Character *c);
JSValue world_state(JSContext *ctx);
JSValue world_install(JSContext *ctx,JSValueConst args);
JSValue world_program(JSContext *ctx);
JSValue world_release(JSContext *ctx,const Character *design,JSValueConst args);
JSValue world_designs(JSContext *ctx,int full);
JSValue world_open_design(JSContext *ctx,int index,Character *design);
JSValue world_save_design(JSContext *ctx,const Character *design,int sea);
int world_export_design(JSContext *ctx,const Character *design,int sea,const char *path);
JSValue world_import_design(JSContext *ctx,Character *design,int *sea,const char *path);
int world_drop_cargo(float x,float y,float z,int material);
Creature *world_find(int id);
int world_enter(const Character *design,int sea);
int world_cargo_score(int id);
int world_team_score(int team);
void world_step(void);
void world_close(void);
int world_save(JSContext *ctx);
void world_load(JSContext *ctx);
JSValue world_import(JSContext *ctx,const char *path);
void world_load_archive(JSContext *ctx);
int world_trial_begin(const Physics *p);
int world_trial_step(Physics *p,const Character *c);
const char *world_trial_error(void);
void world_trial_stop(void);
