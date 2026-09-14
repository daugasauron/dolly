#pragma once
#include "character.h"
#include <quickjs.h>
typedef struct Controller Controller;
typedef struct {
    int id;char name[64];Character design;Physics physics;Controller *controller;
    float fallen,root_height;float controls[128];
} Creature;
typedef struct {Creature *creatures;int count,capacity,next_id,deaths;double age;b3WorldId physics;} World;
extern World world;
JSValue character_json(JSContext *ctx,const Character *c);
JSValue physics_sensors(JSContext *ctx,const Physics *p,const Character *c,double dt);
int character_from_json(JSContext *ctx,JSValueConst list,Character *c);
JSValue world_state(JSContext *ctx);
JSValue world_install(JSContext *ctx,JSValueConst args);
JSValue world_release(JSContext *ctx,const Character *design,JSValueConst args);
void world_step(void);
void world_close(void);
void world_save(JSContext *ctx);
void world_load(JSContext *ctx);
int world_trial_begin(void);
int world_trial_step(Physics *p,const Character *c);
void world_trial_stop(void);
