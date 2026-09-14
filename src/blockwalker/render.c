#include "render.h"
#include <dolly/gpu.h>
#include <raymath.h>
#include <rlgl.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Font editor_font;
static dolly_gpu gpu;
static unsigned char *ui_pixels;
typedef struct { float center[4],rotation[4],color[4],flags[4]; } BoxDraw;
typedef struct { float eye[4],forward[4],right[4],up[4],viewport[4]; } Scene;
static void check(int status) { if(status<0){perror("blockwalker GPU");exit(1);} }
static void flush(void) {check(dolly_gpu_batch(&gpu));dolly_gpu_begin(&gpu);}
void orbit_update(Orbit *o) {o->eye=Vector3Add(o->target,(Vector3){sinf(o->yaw)*cosf(o->pitch)*o->distance,sinf(o->pitch)*o->distance,cosf(o->yaw)*cosf(o->pitch)*o->distance});}
Camera3D orbit_camera(const Orbit *o) {return (Camera3D){o->eye,o->target,{0,1,0},42,CAMERA_PERSPECTIVE};}
int render_pick(const Character *c,const Orbit *o,float x,float y,Vector3 *normal) {
    Ray ray=GetScreenToWorldRayEx((Vector2){x-VIEW_X,y-VIEW_Y},orbit_camera(o),VIEW_W,VIEW_H);
    float distance=1e30f;int selected=-1;
    for(int i=0;i<c->count;i++) {
        Vector3 p=block_position(c->blocks[i]),h={.5f,.5f,.5f};
        RayCollision hit=GetRayCollisionBox(ray,(BoundingBox){Vector3Subtract(p,h),Vector3Add(p,h)});
        if(hit.hit&&hit.distance<distance){selected=i;distance=hit.distance;*normal=hit.normal;}
    }
    return selected;
}
int render_open(dolly_display_surface *surface) {
    int result=dolly_display_acquire(surface);if(result<0)return result;
    result=dolly_display_set_size(surface->generation,SCREEN_WIDTH,SCREEN_HEIGHT,surface);if(result<0)return result;
    if(dolly_gpu_open(&gpu,SCREEN_WIDTH,SCREEN_HEIGHT)<0){perror("WebGPU is required for Blockwalker");dolly_display_release(surface->generation);return -1;}
    printf("Blockwalker GPU: %s\n",gpu.reply+16);
    SetTraceLogLevel(LOG_WARNING);InitWindow(SCREEN_WIDTH,SCREEN_HEIGHT,"Blockwalker");
    editor_font=LoadFontEx("/usr/share/fonts/IosevkaTerm-SemiBold.ttf",32,NULL,0);
    ui_pixels=calloc(SCREEN_WIDTH*SCREEN_HEIGHT,4);if(!ui_pixels)return -1;
    FILE *f=fopen("/usr/src/dolly/blockwalker/scene.wgsl","r");if(!f)return -1;
    char shader[24576];size_t n=fread(shader,1,sizeof(shader)-1,f);fclose(f);shader[n]=0;
    dolly_gpu_begin(&gpu);dolly_gpu_buffer(&gpu,1,sizeof(Scene),64|8);
    dolly_gpu_buffer(&gpu,2,(BLOCK_LIMIT+1)*sizeof(BoxDraw),128|8);
    dolly_gpu_buffer(&gpu,3,SCREEN_WIDTH*SCREEN_HEIGHT*4,128|8);
    dolly_gpu_shader(&gpu,4,shader);dolly_gpu_pipeline(&gpu,5,4,"vertex_main","fragment_main",0);
    uint64_t buffers[]={1,2,3},sizes[]={sizeof(Scene),(BLOCK_LIMIT+1)*sizeof(BoxDraw),SCREEN_WIDTH*SCREEN_HEIGHT*4};
    dolly_gpu_group(&gpu,6,5,3,buffers,sizes);flush();return 0;
}
void render_ui_upload(void) {
    EndDrawing();rlCopyFramebuffer(0,0,SCREEN_WIDTH,SCREEN_HEIGHT,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8,ui_pixels);
    const uint32_t total=SCREEN_WIDTH*SCREEN_HEIGHT*4;
    for(uint32_t offset=0;offset<total;) {
        uint32_t n=total-offset;if(n>512*1024)n=512*1024;
        unsigned char *record=dolly_gpu_record(&gpu,DOLLY_GPU_WRITE_BUFFER,32+n);
        uint64_t id=3,at=offset;uint32_t data_offset=32;
        memcpy(record+8,&id,8);memcpy(record+16,&at,8);memcpy(record+24,&data_offset,4);memcpy(record+28,&n,4);
        memcpy(record+32,ui_pixels+offset,n);flush();offset+=n;
    }
}
void render_frame(const Character *c,const Physics *p,const Orbit *o,int selected,int hover,const Block *ghost) {
    Vector3 f=Vector3Normalize(Vector3Subtract(o->target,o->eye)),r=Vector3Normalize(Vector3CrossProduct(f,(Vector3){0,1,0})),u=Vector3CrossProduct(r,f);
    Scene scene={{o->eye.x,o->eye.y,o->eye.z,c->count+(ghost!=NULL)},
        {f.x,f.y,f.z,tanf(21*DEG2RAD)},{r.x,r.y,r.z,(float)VIEW_W/VIEW_H},
        {u.x,u.y,u.z,p->running},{VIEW_X,VIEW_Y,VIEW_W,VIEW_H}};
    BoxDraw boxes[BLOCK_LIMIT+1]={0};
    for(int i=0;i<c->count+(ghost!=NULL);i++){
        int preview=i==c->count;Block b=preview?*ghost:c->blocks[i];Vector3 v;Quaternion q;
        if(preview){v=block_position(b);q=QuaternionIdentity();}else physics_pose(p,c,i,&v,&q);
        Color color=block_colors[b.color];
        boxes[i]=(BoxDraw){{v.x,v.y,v.z,.485f},{q.x,q.y,q.z,q.w},
            {color.r/255.f,color.g/255.f,color.b/255.f,preview?.35f:1},
            {b.joint,b.axis,preview?2:(i==selected?1:0),i==hover}};
    }
    dolly_gpu_write(&gpu,1,&scene,sizeof(scene));
    if(c->count||ghost)dolly_gpu_write(&gpu,2,boxes,(c->count+(ghost!=NULL))*sizeof(BoxDraw));
    dolly_gpu_draw(&gpu,5,6,3,1,SCREEN_WIDTH,SCREEN_HEIGHT,1);dolly_gpu_submit(&gpu);flush();
}
void render_close(void) {check(dolly_gpu_wait(&gpu));check(dolly_gpu_close(&gpu));UnloadFont(editor_font);CloseWindow();free(ui_pixels);ui_pixels=NULL;}
