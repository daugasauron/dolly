#pragma once
#include "character.h"
enum { WORLD_RADIUS=256,COMBAT_HALF_X=48,COMBAT_HALF_Z=100 };
#define WATER_LEVEL (-2.0f)
typedef struct {Vector3 center,half;int color,overhang;} TerrainBox;
typedef struct {const char *name;float x,z,radius;int team;} Depot;
extern const Depot depots[];
extern const Depot scrapyards[2];
extern int depot_count,terrain_count,terrain_version;
TerrainBox terrain_box(int index);
void terrain_select(int version);
int terrain_depot_count(int version);
int terrain_combat_half_x(int version);
float terrain_height(float x,float z);
float terrain_floor(Vector3 position);
float water_height(float x,float z,double time);
void terrain_build(b3WorldId world);
void water_forces(Physics *p);
