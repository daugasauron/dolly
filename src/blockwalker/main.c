#define _POSIX_C_SOURCE 200809L
#include "render.h"
#include <dolly/raylib.h>
#include <raymath.h>
#include <ctype.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

enum { ADD,SELECT,ERASE };
static Character design,undo[32];
static int undo_count,selected=-1,hover=-1,tool=ADD,brush_joint,brush_color,dirty=1,stopping,binding=-1,orbit_drag;
static float mouse_x,mouse_y,last_x,last_y,fps;
static unsigned char keys[128];
static Physics physics;
static Orbit orbit={.target={0,2.5f,0},.yaw=.52f,.pitch=.28f,.distance=10};
static dolly_display_surface surface;
static char message[160]="Click a box face to add. Right-drag to orbit. Scroll to zoom.";
static const Color ink={41,57,51,255},muted={110,122,115,255},paper={248,248,241,255},line={219,225,214,255},accent={51,111,85,255};
static void report(void);

static double seconds(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static void say(const char *text){snprintf(message,sizeof(message),"%s",text);dirty=1;}
static void label(int x,int y,const char *s,float size,Color color){DrawTextEx(editor_font,s,(Vector2){x,y},size,0,color);}
static void button(int x,int y,int w,int h,const char *s,int active){
    DrawRectangleRounded((Rectangle){x,y,w,h},.18f,6,active?accent:(Color){233,237,227,255});
    Vector2 size=MeasureTextEx(editor_font,s,18,0);label(x+(w-size.x)/2,y+(h-20)/2,s,18,active?paper:ink);
}
static int inside(int x,int y,int w,int h){return mouse_x>=x&&mouse_y>=y&&mouse_x<x+w&&mouse_y<y+h;}
static int in_view(void){return inside(VIEW_X,VIEW_Y,VIEW_W,VIEW_H);}
static void remember(void){if(undo_count==32){memmove(undo,undo+1,31*sizeof(*undo));undo_count--;}undo[undo_count++]=design;}
static void changed(void){dirty=1;if(!character_save(&design,"/workspace/blockwalker.character"))say("Could not save the working blueprint. Use Export to keep a copy.");}
static void undo_edit(void){if(undo_count){design=undo[--undo_count];selected=design.count?design.count-1:-1;binding=-1;changed();say("Undid the last edit.");}}
static void home_camera(void){
    Vector3 target={0,0,0};for(int i=0;i<design.count;i++)target=Vector3Add(target,block_position(design.blocks[i]));
    orbit.target=design.count?Vector3Scale(target,1.f/design.count):(Vector3){0,1,0};
    float extent=1;for(int i=0;i<design.count;i++)extent=fmaxf(extent,Vector3Distance(orbit.target,block_position(design.blocks[i])));
    orbit.distance=fmaxf(8,extent*3.5f);orbit.yaw=.52f;orbit.pitch=.28f;orbit_update(&orbit);
}
static void start_test(void){if(!design.count){say("Add a box before testing your character.");return;}binding=-1;memset(keys,0,sizeof(keys));physics_start(&physics,&design);say("Hold the joint keys to move. Can you keep it standing?");}
static void back_to_builder(void){report();physics_stop(&physics);memset(keys,0,sizeof(keys));home_camera();say("Back in the workshop. Your original build is unchanged.");}
static void preset(int walker){remember();character_preset(&design,walker);selected=0;tool=SELECT;binding=-1;home_camera();changed();say(walker?"Four hinges. Eight keys. Walking is up to you.":"A three-block chain with two powered hinges.");}
static int candidate(Block *block){
    Vector3 normal={0};int parent=render_pick(&design,&orbit,mouse_x,mouse_y,&normal),x,y,z;
    if(parent>=0){Block b=design.blocks[parent];x=b.x+(int)roundf(normal.x);y=b.y+(int)roundf(normal.y);z=b.z+(int)roundf(normal.z);}
    else if(!design.count){Ray ray=GetScreenToWorldRayEx((Vector2){mouse_x-VIEW_X,mouse_y-VIEW_Y},orbit_camera(&orbit),VIEW_W,VIEW_H);if(ray.direction.y>=0)return 0;float t=-ray.position.y/ray.direction.y;x=(int)roundf(ray.position.x+t*ray.direction.x);y=0;z=(int)roundf(ray.position.z+t*ray.direction.z);}
    else return 0;
    Character next=design;int id=character_add(&next,parent,x,y,z,brush_joint,brush_color);if(id<0)return 0;*block=next.blocks[id];return 1;
}
static void remove_selected(void){if(selected>=0){remember();character_remove(&design,selected);selected=design.count?0:-1;binding=-1;changed();say("Removed the block and its attached branch. Undo brings it back.");}}
static void export_character(void){
    if(character_save(&design,"/workspace/blockwalker.character")){
        int result=system("download /workspace/blockwalker.character");say(result==0?"Blueprint exported. Import it to continue in a fresh session.":"Export failed. The working blueprint is still in /workspace.");
    }else say("Could not write the blueprint.");
}
static void import_character(void){
    remove("/tmp/blockwalker-import.character");Character imported;
    if(system("upload /tmp/blockwalker-import.character")==0&&character_load(&imported,"/tmp/blockwalker-import.character")){
        remember();design=imported;selected=design.count?0:-1;binding=-1;home_camera();changed();say("Blueprint imported.");
    }else say("No valid blueprint imported. Your current build is unchanged.");
    remove("/tmp/blockwalker-import.character");
}
static void click(void){
    for(int i=0;i<5;i++)if(inside(254+i*88,92,80,34)){
        if(i==0)orbit.yaw-=.3f;if(i==1)orbit.yaw+=.3f;
        if(i==2)orbit.pitch=Clamp(orbit.pitch+.2f,-.1f,1.35f);
        if(i==3)orbit.pitch=Clamp(orbit.pitch-.2f,-.1f,1.35f);
        if(i==4)home_camera();orbit_update(&orbit);return;
    }
    if(inside(1052,18,204,44)){if(physics.running)back_to_builder();else start_test();return;}
    if(physics.running){
        if(inside(24,154,194,42))start_test();
        if(inside(24,212,194,42))home_camera();
        return;
    }
    if(inside(808,22,104,36)){export_character();return;}
    if(inside(924,22,104,36)){import_character();return;}
    if(inside(24,142,194,64)){brush_joint=0;tool=ADD;binding=-1;dirty=1;return;}
    if(inside(24,218,194,64)){brush_joint=1;tool=ADD;binding=-1;dirty=1;return;}
    for(int i=0;i<3;i++)if(inside(24+i*66,336,62,36)){tool=i;dirty=1;return;}
    for(int i=0;i<COLOR_COUNT;i++)if(inside(24+i*32,416,26,30)){
        brush_color=i;if(tool==SELECT&&selected>=0){remember();design.blocks[selected].color=i;changed();}dirty=1;return;
    }
    if(inside(24,502,194,36)){preset(1);return;}
    if(inside(24,548,194,36)){preset(0);return;}
    if(inside(24,612,92,36)){undo_edit();return;}
    if(inside(126,612,92,36)){remember();memset(&design,0,sizeof(design));selected=-1;brush_joint=0;tool=ADD;binding=-1;home_camera();changed();say("Start with a box on the grid.");return;}
    if(in_view()){
        Vector3 normal;int hit=render_pick(&design,&orbit,mouse_x,mouse_y,&normal);
        if(tool==SELECT){selected=hit;binding=-1;dirty=1;return;}
        if(tool==ERASE){selected=hit;remove_selected();return;}
        Block b;if(candidate(&b)){remember();selected=character_add(&design,b.parent,b.x,b.y,b.z,b.joint,b.color);changed();say(b.joint?"Joint added. Select its two keys in the inspector.":"Box attached. It moves rigidly with its parent.");}
        else say(design.count?"Place on an empty adjacent face. Up to 64 boxes, within the grid.":"Start with a regular box on the grid.");
        return;
    }
    if(selected<0)return;
    Block *b=&design.blocks[selected];
    if(inside(1036,608,220,40)){remove_selected();return;}
    if(b->joint){
        for(int axis=0;axis<3;axis++)if(inside(1036+axis*76,248,68,36)){remember();b->axis=axis;changed();say("Joint axis changed.");return;}
        for(int key=0;key<2;key++)if(inside(1036+key*116,336,104,44)){binding=key;dirty=1;say("Press a letter or number for this direction. Esc cancels.");return;}
        if(inside(1036,436,40,36)||inside(1216,436,40,36)){remember();b->speed=Clamp(b->speed+(mouse_x<1100?-.5f:.5f),.5f,6);changed();return;}
        if(inside(1036,532,40,36)||inside(1216,532,40,36)){remember();b->limit=Clamp(b->limit+(mouse_x<1100?-15:15),15,150);changed();return;}
    }else if(selected>0&&inside(1036,248,220,42)){
        Character copy=design;Block old=copy.blocks[selected];
        // Obtain an unused pair without changing the character's attachment tree.
        const char *available="QAWSOKPLERDTFGYHUJIZXCVBNM1234567890";int chosen[2],n=0;
        for(const char *s=available;*s&&n<2;s++){int used=0;for(int j=0;j<copy.count;j++)if(copy.blocks[j].joint&&(copy.blocks[j].negative==*s||copy.blocks[j].positive==*s))used=1;if(!used)chosen[n++]=*s;}
        if(n==2){old.joint=1;old.negative=chosen[0];old.positive=chosen[1];copy.blocks[selected]=old;if(character_validate(&copy)){remember();design=copy;changed();say("This attachment is now a powered hinge.");}}
        else say("All available movement keys are assigned.");
    }
}
static int event_letter(const dolly_input_event *e){
    const unsigned char *code=e->data+e->key_length;
    if(e->code_length==4&&!memcmp(code,"Key",3))return code[3];
    if(e->code_length==6&&!memcmp(code,"Digit",5))return code[5];
    if(e->key_length==1)return toupper(e->data[0]);return 0;
}
static void events(void){
    dolly_input_event e;
    while(dolly_display_next_event(surface.generation,&e,0)>0){
        if(e.type==DOLLY_INPUT_EVENT_FOCUS&&e.action==0){memset(keys,0,sizeof(keys));orbit_drag=0;dirty=1;}
        if(e.type==DOLLY_INPUT_EVENT_SCROLL){orbit.distance=Clamp(orbit.distance+(int32_t)e.action*.00065f,3,45);orbit_update(&orbit);}
        if(e.type==DOLLY_INPUT_EVENT_POINTER){
            mouse_x=e.width_css_px;mouse_y=e.height_css_px;
            if(e.action==DOLLY_POINTER_ACTION_PRESS){
                if(in_view()&&((e.flags>>8)==2||(e.modifiers&DOLLY_INPUT_MOD_ALT))){orbit_drag=1;last_x=mouse_x;last_y=mouse_y;}
                else if((e.flags>>8)==0)click();
            }else if(e.action==DOLLY_POINTER_ACTION_RELEASE)orbit_drag=0;
            else if(orbit_drag){orbit.yaw-=(mouse_x-last_x)*.009f;orbit.pitch=Clamp(orbit.pitch+(mouse_y-last_y)*.008f,-.1f,1.35f);last_x=mouse_x;last_y=mouse_y;orbit_update(&orbit);}
            Vector3 normal;hover=in_view()&&!physics.running?render_pick(&design,&orbit,mouse_x,mouse_y,&normal):-1;
        }
        if(e.type!=DOLLY_INPUT_EVENT_KEY)continue;
        int k=event_letter(&e);if(k>0&&k<128){int down=e.action!=DOLLY_KEY_ACTION_RELEASE;if(physics.running&&keys[k]!=down)dirty=1;keys[k]=down;}
        if(e.action!=DOLLY_KEY_ACTION_PRESS)continue;
        if(dolly_raylib_code_is(&e,"Escape")){
            if(binding>=0){binding=-1;say("Key assignment cancelled.");}
            else if(physics.running)back_to_builder();else stopping=1;continue;
        }
        if(binding>=0&&selected>=0){
            if(!((k>='A'&&k<='Z')||(k>='0'&&k<='9'))){say("Choose a letter or number.");continue;}
            Character next=design;Block *b=&next.blocks[selected];if(binding==0)b->negative=k;else b->positive=k;
            if(character_validate(&next)){remember();design=next;binding=-1;changed();say("Movement key assigned.");}else say("That key is already assigned to a joint.");
            continue;
        }
        if(physics.running){dirty=1;continue;}
        if((e.modifiers&DOLLY_INPUT_MOD_CONTROL)&&k=='Z'){undo_edit();continue;}
        if(dolly_raylib_code_is(&e,"Enter")){start_test();continue;}
        if(dolly_raylib_code_is(&e,"Delete")||dolly_raylib_code_is(&e,"Backspace")){remove_selected();continue;}
        if(k=='B'){brush_joint=0;tool=ADD;dirty=1;}if(k=='J'){brush_joint=1;tool=ADD;dirty=1;}
        if(k=='V'){tool=SELECT;dirty=1;}if(k=='X'){tool=ERASE;dirty=1;}if(k=='H')home_camera();
    }
}
static void draw_ui(void){
    BeginDrawing();ClearBackground(BLANK);
    DrawRectangle(0,0,SCREEN_WIDTH,VIEW_Y,paper);DrawRectangle(0,VIEW_Y,VIEW_X,VIEW_H,paper);
    DrawRectangle(VIEW_X+VIEW_W,VIEW_Y,SCREEN_WIDTH-VIEW_X-VIEW_W,VIEW_H,paper);DrawRectangle(0,674,SCREEN_WIDTH,46,paper);
    DrawLine(0,79,1280,79,line);DrawLine(241,80,241,674,line);DrawLine(998,80,998,674,line);DrawLine(0,674,1280,674,line);
    label(24,15,"BLOCKWALKER",28,ink);label(24,47,"Build something that might walk.",15,muted);
    char text[120];int joints=0;for(int i=0;i<design.count;i++)joints+=design.blocks[i].joint;
    snprintf(text,sizeof(text),"%02d BOXES  /  %02d JOINTS",design.count,joints);label(472,30,text,18,muted);
    button(1052,18,204,44,physics.running?"Back to builder":"Test character  >",1);
    const char *views[]={"< Left","Right >","Up","Down","Home"};
    for(int i=0;i<5;i++)button(254+i*88,92,80,34,views[i],0);
    DrawRectangle(254,643,600,23,paper);
    label(262,647,"Camera: right-drag / Alt + drag   |   Scroll to zoom",15,muted);
    if(!physics.running){
        button(808,22,104,36,"Export",0);button(924,22,104,36,"Import",0);
        label(24,106,"PARTS",17,muted);
        button(24,142,194,64,"BOX     [B]",tool==ADD&&!brush_joint);button(24,218,194,64,"JOINT   [J]",tool==ADD&&brush_joint);
        label(24,310,"EDIT TOOL",15,muted);button(24,336,62,36,"Add",tool==ADD);button(90,336,62,36,"Pick",tool==SELECT);button(156,336,62,36,"Erase",tool==ERASE);
        label(24,390,tool==SELECT?"SELECTED COLOR":"BLOCK COLOR",15,muted);
        for(int i=0;i<COLOR_COUNT;i++){DrawRectangleRounded((Rectangle){24+i*32,416,26,30},.12f,4,block_colors[i]);if(i==brush_color)DrawRectangleLinesEx((Rectangle){22+i*32,414,30,34},2,ink);}
        label(24,476,"STARTING POINTS",15,muted);button(24,502,194,36,"4-joint walker",0);button(24,548,194,36,"3-block chain",0);
        button(24,612,92,36,"Undo",0);button(126,612,92,36,"Clear",0);
        label(1036,106,"INSPECTOR",17,muted);
        if(selected<0){label(1036,162,"Pick a block",22,ink);label(1036,199,"to edit its attachment.",16,muted);label(1036,258,"A joint turns the blocks",15,muted);label(1036,282,"attached beyond it.",15,muted);}
        else {
            Block b=design.blocks[selected];snprintf(text,sizeof(text),"%s %02d",b.joint?"JOINT":"BOX",selected+1);label(1036,151,text,24,ink);
            snprintf(text,sizeof(text),"Grid  %d, %d, %d",b.x,b.y,b.z);label(1036,190,text,16,muted);
            if(b.joint){
                label(1036,224,"HINGE AXIS",15,muted);for(int i=0;i<3;i++){char name[2]={'X'+i,0};button(1036+i*76,248,68,36,name,b.axis==i);}
                label(1036,310,"TURN -",15,muted);label(1152,310,"TURN +",15,muted);
                char negative[2]={b.negative,0},positive[2]={b.positive,0};button(1036,336,104,44,binding==0?"Press key":negative,binding==0);button(1152,336,104,44,binding==1?"Press key":positive,binding==1);
                label(1036,407,"MOTOR SPEED",15,muted);button(1036,436,40,36,"-",0);button(1216,436,40,36,"+",0);snprintf(text,sizeof(text),"%.1f rad/s",b.speed);label(1090,444,text,17,ink);
                label(1036,503,"TRAVEL LIMIT",15,muted);button(1036,532,40,36,"-",0);button(1216,532,40,36,"+",0);snprintf(text,sizeof(text),"+/- %.0f deg",b.limit);label(1088,540,text,17,ink);
            }else if(selected>0){label(1036,225,"Rigid attachment",17,muted);button(1036,248,220,42,"Make this a joint",0);}
            else {label(1036,226,"The starting block.",17,muted);label(1036,258,"Add a joint to one of",16,muted);label(1036,282,"its faces to articulate.",16,muted);}
            button(1036,608,220,40,"Remove branch",0);
        }
    }else {
        label(24,108,"TEST GROUND",17,muted);button(24,154,194,42,"Reset drop",0);button(24,212,194,42,"Center camera",0);
        label(24,300,"No training wheels.",18,ink);label(24,335,"Balance, fall, rebuild.",15,muted);
        label(1036,108,"HOLD KEYS TO TURN",17,muted);int row=0;
        for(int i=0;i<design.count&&row<7;i++)if(design.blocks[i].joint){Block b=design.blocks[i];int y=152+row*66;
            snprintf(text,sizeof(text),"%02d",i+1);label(1036,y+12,text,16,muted);char a[2]={b.negative,0},z[2]={b.positive,0};button(1072,y,72,42,a,keys[b.negative]);button(1156,y,72,42,z,keys[b.positive]);
            snprintf(text,sizeof(text),"%+.0f deg",physics.angles[i]*RAD2DEG);label(1072,y+44,text,14,muted);row++;}
        if(joints>7){snprintf(text,sizeof(text),"+ %d more active joints",joints-7);label(1036,622,text,15,muted);}
    }
    label(24,692,message,15,ink);snprintf(text,sizeof(text),"%.0f FPS  |  Esc %s",fps,physics.running?"edit":"exit");label(1050,692,text,14,muted);
    render_ui_upload();dirty=0;
}
static void report(void){
    FILE *f=fopen("/workspace/blockwalker-last-run.json","w");if(!f)return;
    fprintf(f,"{\"blocks\":%d,\"physicsSteps\":%d,\"maxSeparation\":%.6f,\"joints\":[",design.count,physics.steps,physics.max_separation);int n=0;
    for(int i=0;i<design.count;i++)if(design.blocks[i].joint){Block b=design.blocks[i];fprintf(f,"%s{\"block\":%d,\"negative\":\"%c\",\"positive\":\"%c\",\"axis\":%d,\"motorSteps\":%d,\"peakAngle\":%.6f,\"drivenRadians\":%.6f}",n++?",":"",i,b.negative,b.positive,b.axis,physics.motor_steps[i],physics.angle_peak[i],physics.driven_radians[i]);}
    fputs("]}\n",f);fclose(f);
}
int main(int argc,char **argv){
    if(argc==2&&!strcmp(argv[1],"--check"))return character_check();
    if(argc!=1){fputs("usage: blockwalker [--check]\n",stderr);return 1;}
    if(!character_load(&design,"/workspace/blockwalker.character"))character_preset(&design,1);
    selected=design.count?0:-1;home_camera();if(render_open(&surface)<0)return 1;
    printf("Blockwalker: C editor, raylib UI, Box3D physics, WebGPU box rendering.\n");
    double last=seconds(),updated=last,accumulator=0;unsigned frames=0;uint32_t sequence=0;
    while(!stopping){
        double now=seconds(),dt=fmin(now-last,.1);last=now;events();if(stopping)break;
        if(physics.running){
            accumulator+=dt;for(int i=0;i<6&&accumulator>=1./60;i++){physics_step(&physics,&design,keys);accumulator-=1./60;}
            if(design.count){Vector3 p;Quaternion q;physics_pose(&physics,&design,0,&p,&q);orbit.target=Vector3Lerp(orbit.target,p,.035f);orbit_update(&orbit);}
        }else accumulator=0;
        if(now-updated>1){fps=frames/(now-updated);updated=now;frames=0;dirty=1;}frames++;
        if(dirty)draw_ui();Block ghost,*preview=NULL;if(!physics.running&&tool==ADD&&in_view()&&candidate(&ghost))preview=&ghost;
        render_frame(&design,&physics,&orbit,selected,hover,preview);
        if(dolly_display_wait_frame(surface.generation,&sequence,100)<0){perror("blockwalker frame");break;}
    }
    if(physics.running)report();character_save(&design,"/workspace/blockwalker.character");physics_stop(&physics);render_close();dolly_display_release(surface.generation);return 0;
}
