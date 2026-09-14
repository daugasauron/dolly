#include "render.h"
#include "terrain.h"
#include <dolly/gpu.h>
#include <raymath.h>
#include <rlgl.h>
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Font editor_font;
Viewport render_view={VIEW_X,VIEW_Y,VIEW_W,VIEW_H};
static dolly_gpu gpu;
static unsigned char *ui_pixels;
typedef struct { float center[4],rotation[4],color[4],flags[4],half[4],style[4]; } BoxDraw;
static BoxDraw *boxes;
static size_t box_capacity;
static uint64_t box_buffer,box_group,node_buffer,next_resource;
typedef struct {float lo[3];uint32_t left;float hi[3];uint32_t right;} Node;
static Node *nodes;static uint32_t node_count;
static uint64_t capture_buffer;
static int capture_requested;
typedef struct { float eye[4],forward[4],right[4],up[4],viewport[4],world[4]; } Scene;
static void check(int status) { if(status<0){perror("blockwalker GPU");exit(1);} }
static void flush(void) {check(dolly_gpu_batch(&gpu));dolly_gpu_begin(&gpu);}
void orbit_update(Orbit *o) {o->eye=Vector3Add(o->target,(Vector3){sinf(o->yaw)*cosf(o->pitch)*o->distance,sinf(o->pitch)*o->distance,cosf(o->yaw)*cosf(o->pitch)*o->distance});}
Camera3D orbit_camera(const Orbit *o) {return (Camera3D){o->eye,o->target,{0,1,0},42,CAMERA_PERSPECTIVE};}
int render_pick(const Character *c,const Orbit *o,float x,float y,Vector3 *normal) {
    Ray ray=GetScreenToWorldRayEx((Vector2){x-render_view.x,y-render_view.y},orbit_camera(o),render_view.width,render_view.height);
    float distance=1e30f;int selected=-1;
    for(int i=0;i<c->count;i++) {
        Vector3 p=block_position(c->blocks[i]),h={.5f,.5f,.5f};
        if(c->blocks[i].joint==BLOCK_WHEEL){h=(Vector3){.7f,.7f,.7f};((float *)&h)[c->blocks[i].axis]=.35f;}
        RayCollision hit=c->blocks[i].joint==BLOCK_HINGE?GetRayCollisionSphere(ray,p,.485f):
            GetRayCollisionBox(ray,(BoundingBox){Vector3Subtract(p,h),Vector3Add(p,h)});
        if(hit.hit&&hit.distance<distance){
            selected=i;distance=hit.distance;Vector3 n=hit.normal;
            if(fabsf(n.x)>=fabsf(n.y)&&fabsf(n.x)>=fabsf(n.z))*normal=(Vector3){copysignf(1,n.x),0,0};
            else if(fabsf(n.y)>=fabsf(n.z))*normal=(Vector3){0,copysignf(1,n.y),0};
            else *normal=(Vector3){0,0,copysignf(1,n.z)};
        }
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
    char shader[65536];size_t n=fread(shader,1,sizeof(shader)-1,f);fclose(f);shader[n]=0;
    box_capacity=16;box_buffer=2;node_buffer=6;box_group=7;next_resource=8;
    boxes=array_resize(NULL,box_capacity,sizeof(BoxDraw));
    dolly_gpu_begin(&gpu);dolly_gpu_buffer(&gpu,1,sizeof(Scene),64|8);
    dolly_gpu_buffer(&gpu,2,box_capacity*sizeof(BoxDraw),128|8);
    dolly_gpu_buffer(&gpu,3,SCREEN_WIDTH*SCREEN_HEIGHT*4,128|8);
    dolly_gpu_shader(&gpu,4,shader);dolly_gpu_pipeline(&gpu,5,4,"vertex_main","fragment_main",0);
    nodes=array_resize(NULL,box_capacity*2,sizeof(Node));dolly_gpu_buffer(&gpu,node_buffer,box_capacity*2*sizeof(Node),128|8);
    uint64_t buffers[]={1,2,3,node_buffer},sizes[]={sizeof(Scene),box_capacity*sizeof(BoxDraw),SCREEN_WIDTH*SCREEN_HEIGHT*4,box_capacity*2*sizeof(Node)};
    dolly_gpu_group(&gpu,box_group,5,4,buffers,sizes);flush();return 0;
}
static void upload_buffer(uint64_t id,const void *data,size_t bytes) {
    for(size_t offset=0;offset<bytes;) {
        uint32_t n=bytes-offset>512*1024?512*1024:bytes-offset;
        unsigned char *record=dolly_gpu_record(&gpu,DOLLY_GPU_WRITE_BUFFER,32+n);
        uint64_t at=offset;uint32_t data_offset=32;
        memcpy(record+8,&id,8);memcpy(record+16,&at,8);memcpy(record+24,&data_offset,4);memcpy(record+28,&n,4);
        memcpy(record+32,(const unsigned char *)data+offset,n);flush();offset+=n;
    }
}
static void reserve_boxes(size_t count) {
    if(count<=box_capacity)return;
    check(dolly_gpu_wait(&gpu));
    for(int i=0;i<3;i++){uint64_t id=i==0?box_group:i==1?box_buffer:node_buffer;void *record=dolly_gpu_record(&gpu,DOLLY_GPU_RELEASE,16);memcpy((char *)record+8,&id,8);}
    while(box_capacity<count)box_capacity*=2;
    boxes=array_resize(boxes,box_capacity,sizeof(BoxDraw));box_buffer=next_resource++;node_buffer=next_resource++;box_group=next_resource++;
    dolly_gpu_buffer(&gpu,box_buffer,box_capacity*sizeof(BoxDraw),128|8);
    nodes=array_resize(nodes,box_capacity*2,sizeof(Node));dolly_gpu_buffer(&gpu,node_buffer,box_capacity*2*sizeof(Node),128|8);
    uint64_t buffers[]={1,box_buffer,3,node_buffer},sizes[]={sizeof(Scene),box_capacity*sizeof(BoxDraw),SCREEN_WIDTH*SCREEN_HEIGHT*4,box_capacity*2*sizeof(Node)};
    dolly_gpu_group(&gpu,box_group,5,4,buffers,sizes);flush();
}
void render_ui_upload(void) {
    EndDrawing();rlCopyFramebuffer(0,0,SCREEN_WIDTH,SCREEN_HEIGHT,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8,ui_pixels);
    upload_buffer(3,ui_pixels,SCREEN_WIDTH*SCREEN_HEIGHT*4);
}
static int sort_axis;
static int compare_box(const void *a,const void *b){float x=((const BoxDraw *)a)->center[sort_axis],y=((const BoxDraw *)b)->center[sort_axis];return (x>y)-(x<y);}
static uint32_t make_tree(uint32_t start,uint32_t count){
    uint32_t id=node_count++;Node *n=&nodes[id];
    for(int axis=0;axis<3;axis++){n->lo[axis]=1e30f;n->hi[axis]=-1e30f;}
    for(uint32_t i=start;i<start+count;i++){
        BoxDraw b=boxes[i];Quaternion q={b.rotation[0],b.rotation[1],b.rotation[2],b.rotation[3]};
        Vector3 x=Vector3RotateByQuaternion((Vector3){b.half[0],0,0},q),y=Vector3RotateByQuaternion((Vector3){0,b.half[1],0},q),z=Vector3RotateByQuaternion((Vector3){0,0,b.half[2]},q);
        for(int axis=0;axis<3;axis++){
            float h=b.flags[0]==BLOCK_HINGE?.485f:fabsf(((float *)&x)[axis])+fabsf(((float *)&y)[axis])+fabsf(((float *)&z)[axis]);
            n->lo[axis]=fminf(n->lo[axis],b.center[axis]-h);n->hi[axis]=fmaxf(n->hi[axis],b.center[axis]+h);
        }
    }
    if(count==1){n->left=start;n->right=UINT32_MAX;return id;}
    sort_axis=0;for(int axis=1;axis<3;axis++)if(n->hi[axis]-n->lo[axis]>n->hi[sort_axis]-n->lo[sort_axis])sort_axis=axis;
    qsort(boxes+start,count,sizeof(BoxDraw),compare_box);uint32_t mid=count/2;
    n->left=make_tree(start,mid);n->right=make_tree(start+mid,count-mid);return id;
}
static void box_draw(Block b,Vector3 v,Quaternion q,int selected,int hover,int preview,size_t index){
    Color color=block_colors[b.color];
    boxes[index]=(BoxDraw){{v.x,v.y,v.z,.485f},{q.x,q.y,q.z,q.w},
        {color.r/255.f,color.g/255.f,color.b/255.f,preview?.35f:1},
        {b.joint,b.axis,preview?2:selected,hover},{.485f,.485f,.485f,0},{b.material,b.finish,b.direction,0}};
    if(b.joint==BLOCK_WHEEL){for(int i=0;i<3;i++)boxes[index].half[i]=i==b.axis?.35f:.7f;}
}
static void draw_scene(const Orbit *o,size_t count,int running,int landscape,double time){
    Vector3 f=Vector3Normalize(Vector3Subtract(o->target,o->eye)),r=Vector3Normalize(Vector3CrossProduct(f,(Vector3){0,1,0})),u=Vector3CrossProduct(r,f);
    Scene scene={{o->eye.x,o->eye.y,o->eye.z,count},
        {f.x,f.y,f.z,tanf(21*DEG2RAD)},{r.x,r.y,r.z,(float)render_view.width/render_view.height},
        {u.x,u.y,u.z,running},{render_view.x,render_view.y,render_view.width,render_view.height},{time,landscape,GetTime(),WATER_LEVEL}};
    node_count=0;if(count)make_tree(0,count);
    dolly_gpu_write(&gpu,1,&scene,sizeof(scene));
    if(count){upload_buffer(box_buffer,boxes,count*sizeof(BoxDraw));upload_buffer(node_buffer,nodes,node_count*sizeof(Node));}
    dolly_gpu_draw(&gpu,5,box_group,3,1,SCREEN_WIDTH,SCREEN_HEIGHT,1);
    if(capture_requested){
        unsigned char *record=dolly_gpu_record(&gpu,DOLLY_GPU_CAPTURE_FRAME,32);
        uint32_t rectangle[]={render_view.x,render_view.y,render_view.width,render_view.height};
        memcpy(record+8,&capture_buffer,8);memcpy(record+16,rectangle,sizeof(rectangle));
    }
    dolly_gpu_submit(&gpu);flush();
}
static size_t character_draw(const Character *c,const Physics *p,int selected,int hover,size_t at){
    for(int i=0;i<c->count;i++){
        Block b=c->blocks[i];Vector3 v;Quaternion q;physics_pose(p,c,i,&v,&q);box_draw(b,v,q,i==selected,i==hover,0,at++);
        if(b.joint==BLOCK_MAGNET&&p->running){boxes[at-1].style[3]=p->parts[i].magnet_power;boxes[at-1].half[3]=b3Body_IsValid(p->parts[i].magnet_target);}
        if(b.joint==BLOCK_PISTON&&b.parent>=0){
            Vector3 parent;Quaternion rotation;physics_pose(p,c,b.parent,&parent,&rotation);Block a=c->blocks[b.parent];
            Vector3 offset=Vector3Scale((Vector3){b.x-a.x,b.y-a.y,b.z-a.z},.5f);
            Vector3 start=Vector3Add(parent,Vector3RotateByQuaternion(offset,rotation)),delta=Vector3Subtract(v,start);
            float length=Vector3Length(delta);Vector3 direction=length>.001f?Vector3Scale(delta,1/length):(Vector3){0,1,0};
            Quaternion rod=QuaternionFromVector3ToVector3((Vector3){0,1,0},direction);Block metal={.color=5};
            box_draw(metal,Vector3Scale(Vector3Add(start,v),.5f),rod,0,0,0,at);
            boxes[at].half[0]=boxes[at].half[2]=.13f;boxes[at++].half[1]=length*.5f;
            box_draw(metal,Vector3Add(start,Vector3Scale(direction,.12f)),rod,0,0,0,at);
            boxes[at].half[0]=boxes[at].half[2]=.24f;boxes[at++].half[1]=.24f;
        }
        if(b.joint==BLOCK_THRUSTER&&p->running&&fabsf(p->parts[i].command)>.001f){
            float strength=fabsf(p->parts[i].command),length=.4f+1.8f*strength;
            Vector3 direction={0};((float *)&direction)[b.axis]=-copysignf(1,p->parts[i].command);
            direction=Vector3RotateByQuaternion(direction,q);
            Quaternion rotation=QuaternionFromVector3ToVector3((Vector3){0,1,0},direction);
            box_draw(b,Vector3Add(v,Vector3Scale(direction,.47f+length*.45f)),rotation,0,0,0,at);
            boxes[at].flags[0]=100;boxes[at].center[3]=strength;
            boxes[at].half[0]=boxes[at].half[2]=.12f+.13f*strength;boxes[at++].half[1]=length*.5f;
        }
    }
    for(int i=0;i<p->cargo_count;i++){b3WorldTransform t=b3Body_GetTransform(p->cargo[i].body);box_draw(p->cargo[i].block,(Vector3){t.p.x,t.p.y,t.p.z},(Quaternion){t.q.v.x,t.q.v.y,t.q.v.z,t.q.s},0,0,0,at++);}
    return at;
}
static size_t draw_terrain(size_t at){
    const Color colors[]={{38,48,65,255},{76,60,86,255},{43,76,76,255},{67,70,88,255},{53,72,81,255},{40,64,86,255},{45,191,178,255},{20,38,64,255},{49,55,64,255},{76,174,148,255}};
    for(int i=0;i<terrain_count;i++){
        TerrainBox b=terrain_boxes[i];box_draw((Block){0},b.center,QuaternionIdentity(),0,0,0,at);
        Color color=colors[b.color];boxes[at].color[0]=color.r/255.f;boxes[at].color[1]=color.g/255.f;boxes[at].color[2]=color.b/255.f;
        boxes[at].flags[0]=101;boxes[at].style[0]=b.color;
        boxes[at].half[0]=b.half.x;boxes[at].half[1]=b.half.y;boxes[at++].half[2]=b.half.z;
    }return at;
}
void render_frame(const Character *c,const Physics *p,const Orbit *o,int selected,int hover,const Block *ghost){
    reserve_boxes((size_t)c->count*3+p->cargo_count+(ghost!=NULL)+(p->landscape?terrain_count:0));
    size_t count=character_draw(c,p,selected,hover,p->landscape?draw_terrain(0):0);
    if(ghost)box_draw(*ghost,block_position(*ghost),QuaternionIdentity(),0,0,1,count++);
    draw_scene(o,count,p->running,p->landscape,p->time);
}
void render_world(const Orbit *o){
    size_t count=terrain_count;for(int i=0;i<world.count;i++)count+=(size_t)world.creatures[i].design.count*3;reserve_boxes(count);
    size_t at=draw_terrain(0);for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];at=character_draw(&c->design,&c->physics,-1,-1,at);}
    draw_scene(o,at,1,1,world.age);
}
static unsigned char *capture(const Character *c,const Physics *p,const Orbit *o,int *bytes) {
    *bytes=0;check(dolly_gpu_capabilities(&gpu));uint32_t features;memcpy(&features,gpu.reply,4);dolly_gpu_begin(&gpu);
    if(!(features&DOLLY_GPU_FEATURE_CAPTURE_FRAME))return NULL;
    int width=render_view.width,height=render_view.height;
    size_t stride=(width*4+255)&~255,total=stride*height;
    if(!capture_buffer){capture_buffer=next_resource++;dolly_gpu_buffer(&gpu,capture_buffer,((SCREEN_WIDTH*4+255)&~255)*SCREEN_HEIGHT,1|8);flush();}
    capture_requested=1;if(c)render_frame(c,p,o,-1,-1,NULL);else render_world(o);capture_requested=0;
    dolly_gpu_map(&gpu,capture_buffer,total);flush();
    unsigned char *pixels=array_resize(NULL,total,1);
    for(size_t offset=0;offset<total;){size_t n=total-offset>sizeof(gpu.reply)?sizeof(gpu.reply):total-offset;
        int got=dolly_gpu_read(&gpu,capture_buffer,offset,n);check(got);if(got!=(int)n){free(pixels);return NULL;}
        memcpy(pixels+offset,gpu.reply,n);offset+=n;
    }
    dolly_gpu_begin(&gpu);void *record=dolly_gpu_record(&gpu,DOLLY_GPU_UNMAP,16);memcpy((char *)record+8,&capture_buffer,8);flush();
    for(int y=0;y<height;y++){
        memmove(pixels+(size_t)y*width*4,pixels+(size_t)y*stride,width*4);
        if(features&DOLLY_GPU_FEATURE_SURFACE_BGRA)for(int x=0;x<width;x++){
            unsigned char *pixel=pixels+((size_t)y*width+x)*4,temp=pixel[0];pixel[0]=pixel[2];pixel[2]=temp;
        }
    }
    Image image={pixels,width,height,1,PIXELFORMAT_UNCOMPRESSED_R8G8B8A8};ImageResize(&image,640,height*640/width);
    unsigned char *png=ExportImageToMemory(image,".png",bytes);UnloadImage(image);return png;
}
unsigned char *render_capture(const Character *c,const Physics *p,const Orbit *o,int *bytes){return capture(c,p,o,bytes);}
unsigned char *render_capture_world(const Orbit *o,int *bytes){return capture(NULL,NULL,o,bytes);}
void render_close(void) {check(dolly_gpu_wait(&gpu));check(dolly_gpu_close(&gpu));UnloadFont(editor_font);CloseWindow();free(ui_pixels);ui_pixels=NULL;free(boxes);boxes=NULL;box_capacity=0;free(nodes);nodes=NULL;}
