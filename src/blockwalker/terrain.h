#pragma once
#include "character.h"
enum { WORLD_RADIUS=256 };
#define WATER_LEVEL (-2.0f)
typedef struct {Vector3 center,half;int color;} TerrainBox;
extern const TerrainBox terrain_boxes[];
extern const int terrain_count;
float terrain_height(float x,float z);
float water_height(float x,float z,double time);
void terrain_build(b3WorldId world);
void water_forces(Physics *p,const Character *c);
