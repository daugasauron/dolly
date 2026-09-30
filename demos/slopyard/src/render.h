#pragma once
#include "world.h"
#include <dolly/display.h>

enum { SCREEN_WIDTH=1280, SCREEN_HEIGHT=720, VIEW_X=242, VIEW_Y=80, VIEW_W=756, VIEW_H=594 };
typedef struct { Vector3 eye,target; float yaw,pitch,distance; Vector3 up; float fov; } Orbit;
typedef struct { int x,y,width,height; } Viewport;
extern Viewport render_view;
extern Font editor_font;
int render_open(dolly_display_surface *surface);
void render_close(void);
void render_ui_upload(void);
void render_frame(const Character *c,const Physics *p,const Orbit *orbit,int selected,int hover,const Block *ghost);
void render_world(const Orbit *orbit);
void render_world_placement(const Orbit *orbit,const Character *design,const WorldPlacement *placement);
unsigned char *render_capture_world(const Orbit *orbit,int *bytes);
unsigned char *render_capture(const Character *c,const Physics *p,const Orbit *orbit,int *bytes);
Camera3D orbit_camera(const Orbit *orbit);
void orbit_update(Orbit *orbit);
int render_pick(const Character *c,const Orbit *orbit,float x,float y,Vector3 *normal,Vector3 *point);
