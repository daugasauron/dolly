#define _POSIX_C_SOURCE 200809L
#include "render.h"
#include <dolly/raylib.h>
#include <dolly/quickjs-runner.h>
#include <quickjs.h>
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
static unsigned char keys[128],agent_keys[128];
static int agent_control,practice_steps,agent_panel,agent_enabled,prompt_focus,world_view;
static double world_accumulator,last_save;
static char agent_log[8192],prompt_input[1024],pending_prompt[1024];
static double last_frame,updated,accumulator;
static unsigned frame_count;
static Physics physics;
static Orbit orbit={.target={0,2.5f,0},.yaw=.52f,.pitch=.28f,.distance=10};
static dolly_display_surface surface;
static JSContext *embedded_context;
static char message[160]="Click a box face to add. Right-drag to orbit. Scroll to zoom.";
static const Color ink={41,57,51,255},muted={110,122,115,255},paper={248,248,241,255},line={219,225,214,255},accent={51,111,85,255};
static void report(void);
static void log_text(const char *text);

static double seconds(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static void say(const char *text){snprintf(message,sizeof(message),"%s",text);dirty=1;}
static void label(int x,int y,const char *s,float size,Color color){DrawTextEx(editor_font,s,(Vector2){x,y},size,0,color);}
static void button(int x,int y,int w,int h,const char *s,int active){
    DrawRectangleRounded((Rectangle){x,y,w,h},.18f,6,active?accent:(Color){233,237,227,255});
    Vector2 size=MeasureTextEx(editor_font,s,18,0);label(x+(w-size.x)/2,y+(h-20)/2,s,18,active?paper:ink);
}
static int inside(int x,int y,int w,int h){return mouse_x>=x&&mouse_y>=y&&mouse_x<x+w&&mouse_y<y+h;}
static int in_view(void){return inside(VIEW_X,VIEW_Y,VIEW_W,VIEW_H);}
static void remember(void){if(undo_count==32){character_clear(&undo[0]);memmove(undo,undo+1,31*sizeof(*undo));undo[31]=(Character){0};undo_count--;}character_copy(&undo[undo_count++],&design);}
static void changed(void){dirty=1;if(!character_save(&design,"/workspace/blockwalker.character"))say("Could not save the working blueprint. Use Export to keep a copy.");}
static void undo_edit(void){if(undo_count){character_clear(&design);design=undo[--undo_count];undo[undo_count]=(Character){0};selected=design.count?design.count-1:-1;binding=-1;changed();say("Undid the last edit.");}}
static void home_camera(void){
    Vector3 target={0,0,0};for(int i=0;i<design.count;i++)target=Vector3Add(target,block_position(design.blocks[i]));
    orbit.target=design.count?Vector3Scale(target,1.f/design.count):(Vector3){0,1,0};
    float extent=1;for(int i=0;i<design.count;i++)extent=fmaxf(extent,Vector3Distance(orbit.target,block_position(design.blocks[i])));
    orbit.distance=fmaxf(8,extent*3.5f);orbit.yaw=.52f;orbit.pitch=.28f;orbit_update(&orbit);
}
static int program_trial;
static void start_test(void){world_trial_stop();program_trial=0;world_view=0;if(!design.count){say("Add a box before testing your character.");return;}binding=-1;memset(keys,0,sizeof(keys));physics_start(&physics,&design);say("Hold the joint keys to move. Can you keep it standing?");}
static void back_to_builder(void){world_trial_stop();program_trial=0;world_view=0;report();physics_stop(&physics);memset(keys,0,sizeof(keys));home_camera();say("Back in the workshop. Your original build is unchanged.");}
static void preset(int walker){remember();character_preset(&design,walker);selected=0;tool=SELECT;binding=-1;home_camera();changed();say(walker?"Four hinges. Eight keys. Walking is up to you.":"A three-block chain with two powered hinges.");}
static int candidate(Block *block){
    Vector3 normal={0};int parent=render_pick(&design,&orbit,mouse_x,mouse_y,&normal),x,y,z;
    if(parent>=0){Block b=design.blocks[parent];x=b.x+(int)roundf(normal.x);y=b.y+(int)roundf(normal.y);z=b.z+(int)roundf(normal.z);}
    else if(!design.count){Ray ray=GetScreenToWorldRayEx((Vector2){mouse_x-VIEW_X,mouse_y-VIEW_Y},orbit_camera(&orbit),VIEW_W,VIEW_H);if(fabsf(ray.direction.y)<.0001f)return 0;float t=-ray.position.y/ray.direction.y;if(t<=0)return 0;x=(int)roundf(ray.position.x+t*ray.direction.x);y=0;z=(int)roundf(ray.position.z+t*ray.direction.z);}
    else return 0;
    return character_candidate(&design,parent,x,y,z,brush_joint,brush_color,block);
}
static void remove_selected(void){if(selected>=0){remember();character_remove(&design,selected);selected=design.count?0:-1;binding=-1;changed();say("Removed the block and its attached branch. Undo brings it back.");}}
static void export_character(void){
    if(character_save(&design,"/workspace/blockwalker.character")){
        int result=system("download /workspace/blockwalker.character");say(result==0?"Blueprint exported. Import it to continue in a fresh session.":"Export failed. The working blueprint is still in /workspace.");
    }else say("Could not write the blueprint.");
}
static void import_character(void){
    remove("/tmp/blockwalker-import.character");Character imported={0};
    if(system("upload /tmp/blockwalker-import.character")==0&&character_load(&imported,"/tmp/blockwalker-import.character")){
        remember();character_clear(&design);design=imported;selected=design.count?0:-1;binding=-1;home_camera();changed();say("Blueprint imported.");
    }else say("No valid blueprint imported. Your current build is unchanged.");
    remove("/tmp/blockwalker-import.character");
}
static void click(void){
    if(inside(712,22,80,36)){agent_panel=!agent_panel;prompt_focus=0;dirty=1;return;}
    if(inside(352,22,104,36)){world_view=!world_view;if(world_view){orbit.target=(Vector3){0,1,0};orbit.distance=24;orbit.pitch=.45f;orbit_update(&orbit);}else home_camera();dirty=1;return;}
    if(agent_panel&&mouse_x>998){
        prompt_focus=inside(1024,608,240,54);
        if(inside(1036,142,220,36)){agent_enabled=0;int result=system("upload /workspace/blockwalker-agent/models.json");say(result==0?"Proxy configuration imported. Press Start in the Pi panel.":"Proxy import cancelled.");}
        if(inside(1036,188,104,36)){agent_enabled=1;agent_control=1;log_text("\nStarting Pi...\n");}
        if(inside(1152,188,104,36)){agent_enabled=0;practice_steps=0;memset(agent_keys,0,128);log_text("\nPaused.\n");}
        if(inside(1036,235,220,36)){agent_control=!agent_control;agent_enabled=agent_control;practice_steps=0;memset(keys,0,128);}
        dirty=1;return;
    }
    prompt_focus=0;
    for(int i=0;i<5;i++)if(inside(254+i*88,92,80,34)){
        if(i==0)orbit.yaw-=.3f;if(i==1)orbit.yaw+=.3f;
        if(i==2)orbit.pitch=Clamp(orbit.pitch+.2f,-1.5f,1.5f);
        if(i==3)orbit.pitch=Clamp(orbit.pitch-.2f,-1.5f,1.5f);
        if(i==4)home_camera();orbit_update(&orbit);return;
    }
    if(inside(1052,18,204,44)){if(world_view){world_view=0;home_camera();dirty=1;return;}if(physics.running)back_to_builder();else start_test();return;}
    if(world_view){
        if(inside(24,598,194,36)){world_save(embedded_context);int result=system("download /workspace/blockwalker-world.json");say(result==0?"World exported with programs and physics state.":"World export failed.");}
        return;
    }
    if(physics.running){
        if(inside(24,154,194,42))start_test();
        if(inside(24,212,194,42))home_camera();
        return;
    }
    if(inside(808,22,104,36)){export_character();return;}
    if(inside(924,22,104,36)){import_character();return;}
    for(int i=0;i<BLOCK_KINDS;i++)if(inside(24,142+i*32,194,28)){brush_joint=i;tool=ADD;binding=-1;dirty=1;return;}
    for(int i=0;i<3;i++)if(inside(24+i*66,336,62,36)){tool=i;dirty=1;return;}
    for(int i=0;i<COLOR_COUNT;i++)if(inside(24+i*32,416,26,30)){
        brush_color=i;if(tool==SELECT&&selected>=0){remember();design.blocks[selected].color=i;changed();}dirty=1;return;
    }
    if(inside(24,502,194,36)){preset(1);return;}
    if(inside(24,548,194,32)){preset(0);return;}
    if(inside(24,586,194,22)){preset(2);return;}
    if(inside(24,612,92,36)){undo_edit();return;}
    if(inside(126,612,92,36)){remember();character_clear(&design);selected=-1;brush_joint=0;tool=ADD;binding=-1;home_camera();changed();say("Start with a box on the grid.");return;}
    if(in_view()){
        Vector3 normal;int hit=render_pick(&design,&orbit,mouse_x,mouse_y,&normal);
        if(tool==SELECT){selected=hit;binding=-1;dirty=1;return;}
        if(tool==ERASE){selected=hit;remove_selected();return;}
        Block b;if(candidate(&b)){remember();selected=character_add(&design,b.parent,b.x,b.y,b.z,b.joint,b.color);changed();say(b.joint?"Joint added. Select its two keys in the inspector.":"Box attached. It moves rigidly with its parent.");}
        else say(design.count?"Place on an empty adjacent side, above the grid.":"Start with a regular box on the grid.");
        return;
    }
    if(selected<0)return;
    Block *b=&design.blocks[selected];
    if(inside(1036,608,220,40)){remove_selected();return;}
    if(b->joint){
        if(b->joint==BLOCK_PISTON&&inside(1200,218,56,24)){remember();b->direction=-b->direction;changed();return;}
        for(int axis=0;axis<3;axis++)if(inside(1036+axis*76,248,68,36)){remember();b->axis=axis;changed();say("Joint axis changed.");return;}
        for(int key=0;key<2;key++)if(inside(1036+key*116,336,104,44)){binding=key;dirty=1;say("Press a letter or number for this direction. Esc cancels.");return;}
        if(inside(1036,436,40,36)||inside(1216,436,40,36)){remember();if(b->joint==BLOCK_THRUSTER)b->force=Clamp(b->force+(mouse_x<1100?-2:2),2,100);else b->speed=Clamp(b->speed+(mouse_x<1100?-.5f:.5f),.5f,6);changed();return;}
        if(inside(1036,532,40,36)||inside(1216,532,40,36)){remember();if(b->joint==BLOCK_PISTON)b->travel=Clamp(b->travel+(mouse_x<1100?-.25f:.25f),.25f,3);else if(b->joint==BLOCK_HINGE)b->limit=Clamp(b->limit+(mouse_x<1100?-15:15),15,150);else if(b->joint==BLOCK_WHEEL)b->force=Clamp(b->force+(mouse_x<1100?-2:2),2,100);changed();return;}
    }else if(selected>0&&inside(1036,248,220,42)){
        Character copy={0};character_copy(&copy,&design);Block old=copy.blocks[selected];
        // Obtain an unused pair without changing the character's attachment tree.
        const char *available="QAWSOKPLERDTFGYHUJIZXCVBNM1234567890";int chosen[2],n=0;
        for(const char *s=available;*s&&n<2;s++){int used=0;for(int j=0;j<copy.count;j++)if(copy.blocks[j].joint&&(copy.blocks[j].negative==*s||copy.blocks[j].positive==*s))used=1;if(!used)chosen[n++]=*s;}
        if(n==2){old.joint=1;old.negative=chosen[0];old.positive=chosen[1];copy.blocks[selected]=old;if(character_validate(&copy)){remember();character_copy(&design,&copy);changed();say("This attachment is now a powered hinge.");}}
        else {old.joint=1;old.negative=old.positive=0;remember();design.blocks[selected]=old;changed();say("Joint added without keyboard keys.");}
        character_clear(&copy);
    }
}
static int event_letter(const dolly_input_event *e){
    const unsigned char *code=e->data+e->key_length;
    if(e->code_length==4&&!memcmp(code,"Key",3))return code[3];
    if(e->code_length==6&&!memcmp(code,"Digit",5))return code[5];
    if(e->key_length==1)return toupper(e->data[0]);return 0;
}
static void append_prompt(const unsigned char *text,size_t n){
    size_t used=strlen(prompt_input);if(n>sizeof(prompt_input)-used-1)n=sizeof(prompt_input)-used-1;
    memcpy(prompt_input+used,text,n);prompt_input[used+n]=0;dirty=1;
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
            else if(orbit_drag){orbit.yaw-=(mouse_x-last_x)*.009f;orbit.pitch=Clamp(orbit.pitch+(mouse_y-last_y)*.008f,-1.5f,1.5f);last_x=mouse_x;last_y=mouse_y;orbit_update(&orbit);}
            Vector3 normal;hover=in_view()&&!physics.running?render_pick(&design,&orbit,mouse_x,mouse_y,&normal):-1;
        }
        if(prompt_focus&&e.type==DOLLY_INPUT_EVENT_TEXT){append_prompt(e.data+e.key_length+e.code_length,e.text_length);continue;}
        if(e.type!=DOLLY_INPUT_EVENT_KEY)continue;
        if(prompt_focus){
            if(e.action==DOLLY_KEY_ACTION_RELEASE)continue;
            if(dolly_raylib_code_is(&e,"Escape")){prompt_focus=0;dirty=1;continue;}
            if(dolly_raylib_code_is(&e,"Enter")){snprintf(pending_prompt,sizeof(pending_prompt),"%s",prompt_input);prompt_input[0]=0;agent_enabled=1;dirty=1;continue;}
            if(dolly_raylib_code_is(&e,"Backspace")){size_t n=strlen(prompt_input);if(n){do{n--;}while(n&&(prompt_input[n]&0xc0)==0x80);prompt_input[n]=0;}dirty=1;continue;}
            if(e.key_length==1&&!(e.modifiers&(DOLLY_INPUT_MOD_CONTROL|DOLLY_INPUT_MOD_META|DOLLY_INPUT_MOD_ALT)))append_prompt(e.data,e.key_length);
            continue;
        }
        if(e.action==DOLLY_KEY_ACTION_PRESS&&dolly_raylib_code_is(&e,"Backquote")){agent_control=!agent_control;agent_enabled=agent_control;practice_steps=0;memset(keys,0,128);dirty=1;continue;}
        if(e.action==DOLLY_KEY_ACTION_PRESS&&dolly_raylib_code_is(&e,"Tab")){agent_panel=!agent_panel;dirty=1;continue;}
        int k=event_letter(&e);if(k>0&&k<128){int down=e.action!=DOLLY_KEY_ACTION_RELEASE;if(physics.running&&keys[k]!=down)dirty=1;keys[k]=down;}
        if(e.action!=DOLLY_KEY_ACTION_PRESS)continue;
        if(dolly_raylib_code_is(&e,"Escape")){
            if(binding>=0){binding=-1;say("Key assignment cancelled.");}
            else if(world_view){world_view=0;home_camera();dirty=1;}else if(physics.running)back_to_builder();else stopping=1;continue;
        }
        if(binding>=0&&selected>=0){
            if(!((k>='A'&&k<='Z')||(k>='0'&&k<='9'))){say("Choose a letter or number.");continue;}
            Character next={0};character_copy(&next,&design);Block *b=&next.blocks[selected];if(binding==0)b->negative=k;else b->positive=k;
            if(character_validate(&next)){remember();character_copy(&design,&next);binding=-1;changed();say("Movement key assigned.");}else say("That key is already assigned to a joint.");
            character_clear(&next);
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
    char text[120];int joints=0;for(int i=0;i<design.count;i++)joints+=design.blocks[i].joint!=0;
    snprintf(text,sizeof(text),"%d PARTS / %d JOINTS",design.count,joints);label(472,32,text,15,muted);
    button(352,22,104,36,world_view?"Workshop":"World",world_view);button(712,22,80,36,"Pi [Tab]",agent_panel);
    button(1052,18,204,44,(physics.running||world_view)?"Back to builder":"Test character  >",1);
    const char *views[]={"< Left","Right >","Up","Down","Home"};
    for(int i=0;i<5;i++)button(254+i*88,92,80,34,views[i],0);
    DrawRectangle(254,643,600,23,paper);
    label(262,647,"Camera: right-drag / Alt + drag   |   Scroll to zoom",15,muted);
    if(world_view){
        label(24,108,"SURVIVAL WORLD",17,muted);snprintf(text,sizeof(text),"%d living / %d fallen",world.count,world.deaths);label(24,154,text,16,ink);
        label(24,205,"Programmed creatures",15,muted);label(24,230,"share this 3D world.",15,muted);
        button(24,598,194,36,"Export world",0);
        for(int i=0;i<world.count&&i<11;i++){snprintf(text,sizeof(text),"%d  %.19s",world.creatures[i].id,world.creatures[i].name);label(24,286+i*26,text,14,ink);}
    }else if(!physics.running){
        button(808,22,104,36,"Export",0);button(924,22,104,36,"Import",0);
        label(24,106,"PARTS",17,muted);
        for(int i=0;i<BLOCK_KINDS;i++)button(24,142+i*32,194,28,block_names[i],tool==ADD&&brush_joint==i);
        label(24,310,"EDIT TOOL",15,muted);button(24,336,62,36,"Add",tool==ADD);button(90,336,62,36,"Pick",tool==SELECT);button(156,336,62,36,"Erase",tool==ERASE);
        label(24,390,tool==SELECT?"SELECTED COLOR":"BLOCK COLOR",15,muted);
        for(int i=0;i<COLOR_COUNT;i++){DrawRectangleRounded((Rectangle){24+i*32,416,26,30},.12f,4,block_colors[i]);if(i==brush_color)DrawRectangleLinesEx((Rectangle){22+i*32,414,30,34},2,ink);}
        label(24,476,"STARTING POINTS",15,muted);button(24,502,194,36,"4-joint walker",0);button(24,548,194,32,"3-block chain",0);button(24,586,194,22,"Quadruped",0);
        button(24,612,92,36,"Undo",0);button(126,612,92,36,"Clear",0);
        label(1036,106,"INSPECTOR",17,muted);
        if(selected<0){label(1036,162,"Pick a block",22,ink);label(1036,199,"to edit its attachment.",16,muted);label(1036,258,"A joint turns the blocks",15,muted);label(1036,282,"attached beyond it.",15,muted);}
        else {
            Block b=design.blocks[selected];snprintf(text,sizeof(text),"%s %02d",block_names[b.joint],selected+1);label(1036,151,text,24,ink);
            snprintf(text,sizeof(text),"Grid  %d, %d, %d",b.x,b.y,b.z);label(1036,190,text,16,muted);
            if(b.joint){
                label(1036,224,"CONTROL AXIS",15,muted);if(b.joint==BLOCK_PISTON)button(1200,218,56,24,b.direction>0?"+":"-",0);for(int i=0;i<3;i++){char name[2]={'X'+i,0};button(1036+i*76,248,68,36,name,b.axis==i);}
                label(1036,310,b.joint==BLOCK_PISTON?"RETRACT -":"REVERSE -",15,muted);label(1152,310,b.joint==BLOCK_PISTON?"EXTEND +":"FORWARD +",15,muted);
                char negative[2]={b.negative?b.negative:'-',0},positive[2]={b.positive?b.positive:'-',0};button(1036,336,104,44,binding==0?"Press key":negative,binding==0);button(1152,336,104,44,binding==1?"Press key":positive,binding==1);
                label(1036,407,b.joint==BLOCK_THRUSTER?"PUSH FORCE":"MOTOR SPEED",15,muted);button(1036,436,40,36,"-",0);button(1216,436,40,36,"+",0);snprintf(text,sizeof(text),b.joint==BLOCK_THRUSTER?"%.0f N":b.joint==BLOCK_PISTON?"%.1f m/s":"%.1f rad/s",b.joint==BLOCK_THRUSTER?b.force:b.speed);label(1090,444,text,17,ink);
                if(b.joint!=BLOCK_THRUSTER){
                    label(1036,503,b.joint==BLOCK_WHEEL?"MOTOR TORQUE":"TRAVEL LIMIT",15,muted);button(1036,532,40,36,"-",0);button(1216,532,40,36,"+",0);
                    if(b.joint==BLOCK_PISTON)snprintf(text,sizeof(text),"0 - %.2f m",b.travel);
                    else if(b.joint==BLOCK_WHEEL)snprintf(text,sizeof(text),"%.0f Nm",b.force);
                    else snprintf(text,sizeof(text),"+/- %.0f deg",b.limit);label(1088,540,text,17,ink);
                }else {label(1036,503,"Push follows the block.",15,muted);label(1036,532,"Release keys to coast.",15,muted);}
            }else if(selected>0){label(1036,225,"Rigid attachment",17,muted);button(1036,248,220,42,"Make this a joint",0);}
            else {label(1036,226,"The starting block.",17,muted);label(1036,258,"Add a joint to one of",16,muted);label(1036,282,"its faces to articulate.",16,muted);}
            button(1036,608,220,40,"Remove branch",0);
        }
    }else {
        label(24,108,"TEST GROUND",17,muted);button(24,154,194,42,"Reset drop",0);button(24,212,194,42,"Center camera",0);
        label(24,300,"No training wheels.",18,ink);label(24,335,"Balance, fall, rebuild.",15,muted);
        label(1036,108,"HOLD KEYS TO TURN",17,muted);int row=0;
        for(int i=0;i<design.count&&row<7;i++)if(design.blocks[i].joint){Block b=design.blocks[i];int y=152+row*66;
            snprintf(text,sizeof(text),"%02d",i+1);label(1036,y+12,text,16,muted);char a[2]={b.negative?b.negative:'-',0},z[2]={b.positive?b.positive:'-',0};button(1072,y,72,42,a,(agent_control?agent_keys:keys)[b.negative]);button(1156,y,72,42,z,(agent_control?agent_keys:keys)[b.positive]);
            snprintf(text,sizeof(text),"%+.0f deg",physics.parts[i].angle*RAD2DEG);label(1072,y+44,text,14,muted);row++;}
        if(joints>7){snprintf(text,sizeof(text),"+ %d more active joints",joints-7);label(1036,622,text,15,muted);}
    }
    if(agent_panel){
        DrawRectangle(999,80,281,594,paper);label(1036,106,"PI / ASTRA / XHIGH",16,ink);
        button(1036,142,220,36,"Import proxy config",0);button(1036,188,104,36,"Start",agent_enabled);button(1152,188,104,36,"Pause",!agent_enabled);
        button(1036,235,220,36,agent_control?"Agent keys [`]":"Your keys [`]",agent_control);
        char rows[18][31]={{0}};int row=0,col=0;
        for(const unsigned char *p=(unsigned char *)agent_log;*p;p++){
            if(*p=='\n'||col==29){row=(row+1)%18;rows[row][0]=0;col=0;if(*p=='\n')continue;}
            rows[row][col++]=*p;rows[row][col]=0;
        }
        for(int i=0;i<18;i++)label(1024,286+i*17,rows[(row+1+i)%18],13,ink);
        DrawRectangleRounded((Rectangle){1024,608,240,54},.1f,4,(Color){232,236,225,255});
        if(prompt_focus)DrawRectangleLinesEx((Rectangle){1024,608,240,54},2,accent);
        size_t length=strlen(prompt_input);label(1032,618,length?prompt_input+(length>27?length-27:0):"Message Pi...",14,ink);label(1032,642,"Enter to send / steer",12,muted);
    }
    label(24,692,message,15,ink);snprintf(text,sizeof(text),"%.0f FPS  |  Esc %s",fps,physics.running?"edit":"exit");label(1050,692,text,14,muted);
    render_ui_upload();dirty=0;
}
static void report(void){
    FILE *f=fopen("/workspace/blockwalker-last-run.json","w");if(!f)return;
    fprintf(f,"{\"blocks\":%d,\"physicsSteps\":%d,\"maxSeparation\":%.6f,\"joints\":[",design.count,physics.steps,physics.max_separation);int n=0;
    for(int i=0;i<design.count;i++)if(design.blocks[i].joint){Block b=design.blocks[i];fprintf(f,"%s{\"block\":%d,\"negative\":\"%c\",\"positive\":\"%c\",\"axis\":%d,\"motorSteps\":%d,\"peakAngle\":%.6f,\"drivenRadians\":%.6f}",n++?",":"",i,b.negative?b.negative:'-',b.positive?b.positive:'-',b.axis,physics.parts[i].motor_steps,physics.parts[i].angle_peak,physics.parts[i].driven_radians);}
    fputs("]}\n",f);fclose(f);
}
static JSValue state(JSContext *ctx) {
    JSValue result=JS_NewObject(ctx),parts=JS_NewArray(ctx);
    JS_SetPropertyStr(ctx,result,"mode",JS_NewString(ctx,world_view?"world":physics.running?"practice":"builder"));
    JS_SetPropertyStr(ctx,result,"steps",JS_NewInt32(ctx,physics.steps));
    JS_SetPropertyStr(ctx,result,"remaining",JS_NewInt32(ctx,practice_steps));
    JS_SetPropertyStr(ctx,result,"agentControl",JS_NewBool(ctx,agent_control));
    JS_SetPropertyStr(ctx,result,"maxSeparation",JS_NewFloat64(ctx,physics.max_separation));
    if(physics.running&&design.count){
        JS_SetPropertyStr(ctx,result,"sensors",physics_sensors(ctx,&physics,&design,1./60));
        Vector3 position;Quaternion rotation;physics_pose(&physics,&design,0,&position,&rotation);
        b3Vec3 velocity=b3Body_GetLinearVelocity(physics.parts[0].body);
        JS_SetPropertyStr(ctx,result,"distance",JS_NewFloat64(ctx,hypotf(position.x-physics.start.x,position.z-physics.start.z)));
        JS_SetPropertyStr(ctx,result,"speed",JS_NewFloat64(ctx,hypotf(velocity.x,velocity.z)));
        JS_SetPropertyStr(ctx,result,"up",JS_NewFloat64(ctx,Vector3RotateByQuaternion((Vector3){0,1,0},rotation).y));
    }
    for(int i=0;i<design.count;i++){
        Block b=design.blocks[i];JSValue part=JS_NewObject(ctx);Vector3 v;Quaternion q;physics_pose(&physics,&design,i,&v,&q);
        const char *names[]={"x","y","z","parent","joint","color","axis","negative","positive"};
        const int values[]={b.x,b.y,b.z,b.parent,b.joint,b.color,b.axis,b.negative,b.positive};
        for(int j=0;j<9;j++)JS_SetPropertyStr(ctx,part,names[j],JS_NewInt32(ctx,values[j]));
        JS_SetPropertyStr(ctx,part,"speed",JS_NewFloat64(ctx,b.speed));JS_SetPropertyStr(ctx,part,"limit",JS_NewFloat64(ctx,b.limit));JS_SetPropertyStr(ctx,part,"travel",JS_NewFloat64(ctx,b.travel));JS_SetPropertyStr(ctx,part,"force",JS_NewFloat64(ctx,b.force));JS_SetPropertyStr(ctx,part,"direction",JS_NewInt32(ctx,b.direction));
        JSValue pose=JS_NewArray(ctx);float values3[]={v.x,v.y,v.z,q.x,q.y,q.z,q.w};
        for(int j=0;j<7;j++)JS_SetPropertyUint32(ctx,pose,j,JS_NewFloat64(ctx,values3[j]));
        JS_SetPropertyStr(ctx,part,"pose",pose);
        if(physics.running){JS_SetPropertyStr(ctx,part,"angle",JS_NewFloat64(ctx,physics.parts[i].angle));JS_SetPropertyStr(ctx,part,"command",JS_NewFloat64(ctx,physics.parts[i].command));}
        JS_SetPropertyUint32(ctx,parts,i,part);
    }
    JS_SetPropertyStr(ctx,result,"parts",parts);return result;
}
static int number(JSContext *ctx,JSValueConst object,const char *name,int fallback) {
    JSValue v=JS_GetPropertyStr(ctx,object,name);int result=fallback;
    if(!JS_IsUndefined(v)&&JS_ToInt32(ctx,&result,v)<0)result=fallback;JS_FreeValue(ctx,v);return result;
}
static double real(JSContext *ctx,JSValueConst object,const char *name,double fallback) {
    JSValue v=JS_GetPropertyStr(ctx,object,name);double result=fallback;
    if(!JS_IsUndefined(v)&&JS_ToFloat64(ctx,&result,v)<0)result=fallback;JS_FreeValue(ctx,v);return result;
}
static void log_text(const char *text) {
    size_t n=strlen(text),used=strlen(agent_log);if(n>=sizeof(agent_log)) {text+=n-sizeof(agent_log)+1;n=sizeof(agent_log)-1;}
    if(used+n>=sizeof(agent_log)){size_t drop=used+n-sizeof(agent_log)+1;memmove(agent_log,agent_log+drop,used-drop+1);used-=drop;}
    memcpy(agent_log+used,text,n+1);dirty=1;
}
static JSValue game_call(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv) {
    if(!argc)return JS_ThrowTypeError(ctx,"Game operation required");
    const char *op=JS_ToCString(ctx,argv[0]);if(!op)return JS_EXCEPTION;
    JSValueConst args=argc>1?argv[1]:JS_UNDEFINED;JSValue result=JS_UNDEFINED;
    if(!strcmp(op,"state"))result=state(ctx);
    else if(!strcmp(op,"world"))result=world_state(ctx);
    else if(!strcmp(op,"install")){result=world_install(ctx,args);if(!JS_IsException(result))world_save(ctx);}
    else if(!strcmp(op,"spawn")){result=world_release(ctx,&design,args);if(!JS_IsException(result)){world_save(ctx);dirty=1;}}
    else if(!strcmp(op,"watch")){world_view=JS_ToBool(ctx,args);if(world_view){orbit.target=(Vector3){0,1,0};orbit.distance=24;orbit.pitch=.45f;orbit_update(&orbit);}else home_camera();dirty=1;}
    else if(!strcmp(op,"save"))world_save(ctx);
    else if(!strcmp(op,"snapshot")) {
        if(dirty)draw_ui();int bytes;unsigned char *png=world_view?render_capture_world(&orbit,&bytes):render_capture(&design,&physics,&orbit,&bytes);
        result=png?JS_NewArrayBufferCopy(ctx,png,bytes):JS_ThrowInternalError(ctx,"GPU frame capture failed");MemFree(png);
    }else if(!strcmp(op,"build")) {
        JSValue list=JS_GetPropertyStr(ctx,args,"parts");Character next={0};
        if(!character_from_json(ctx,list,&next))result=JS_ThrowTypeError(ctx,"Invalid blueprint: connected adjacent tree, unique cells and keys, root box, positive speed/limits required");
        else {world_trial_stop();program_trial=0;physics_stop(&physics);world_view=0;practice_steps=0;remember();character_copy(&design,&next);selected=0;home_camera();changed();result=state(ctx);}
        character_clear(&next);JS_FreeValue(ctx,list);
    }else if(!strcmp(op,"reset")){start_test();agent_control=1;practice_steps=0;memset(agent_keys,0,128);result=state(ctx);}
    else if(!strcmp(op,"advance")) {
        int steps=number(ctx,args,"steps",0);JSValue v=JS_GetPropertyStr(ctx,args,"keys");const char *pressed=JS_ToCString(ctx,v);
        if(!physics.running||!agent_control||steps<1||steps>600)result=JS_ThrowRangeError(ctx,"Reset practice first; take agent control; advance 1..600 physics steps");
        else if(pressed){
            unsigned char next[128]={0};int valid=1;
            for(const char *s=pressed;*s;s++){int key=toupper((unsigned char)*s),bound=0;
                for(int i=1;i<design.count;i++)if(design.blocks[i].joint&&(design.blocks[i].negative==key||design.blocks[i].positive==key))bound=1;
                if(key>=128||!bound){valid=0;break;}next[key]=1;
            }
            if(!valid)result=JS_ThrowTypeError(ctx,"Only assigned joint keys may be held");
            else {world_trial_stop();program_trial=0;memcpy(agent_keys,next,128);practice_steps=steps;dirty=1;}
        }
        JS_FreeCString(ctx,pressed);JS_FreeValue(ctx,v);
    }else if(!strcmp(op,"program_trial")){
        int steps=number(ctx,args,"steps",0);
        if(!design.count||steps<1||steps>1200)result=JS_ThrowRangeError(ctx,"Build a character; program trial requires 1..1200 steps");
        else{start_test();if(!world_trial_begin())result=JS_ThrowTypeError(ctx,"Install a valid controller first");else{agent_control=1;program_trial=1;practice_steps=steps;memset(agent_keys,0,128);dirty=1;}}
    }else if(!strcmp(op,"release")){memset(agent_keys,0,128);practice_steps=0;dirty=1;}
    else if(!strcmp(op,"camera")) {
        orbit.yaw=real(ctx,args,"yaw",orbit.yaw);orbit.pitch=Clamp(real(ctx,args,"pitch",orbit.pitch),-1.5f,1.5f);
        orbit.distance=Clamp(real(ctx,args,"distance",orbit.distance),3,100);orbit_update(&orbit);
    }else if(!strcmp(op,"log")) {const char *s=JS_ToCString(ctx,args);if(s){log_text(s);JS_FreeCString(ctx,s);}}
    else if(!strcmp(op,"enabled")){result=JS_NewBool(ctx,agent_enabled);}
    else if(!strcmp(op,"enable")){agent_enabled=JS_ToBool(ctx,args);agent_control=agent_enabled;if(agent_enabled)agent_panel=1;dirty=1;}
    else if(!strcmp(op,"prompt")){result=JS_NewString(ctx,pending_prompt);pending_prompt[0]=0;}
    else if(!strcmp(op,"exit")){stopping=1;}
    else result=JS_ThrowTypeError(ctx,"Unknown Game operation: %s",op);
    JS_FreeCString(ctx,op);return result;
}
static JSValue game_frame(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv) {
    double now=seconds(),dt=fmin(now-last_frame,.1);last_frame=now;events();if(stopping)return JS_FALSE;
    world_accumulator+=dt;for(int i=0;i<6&&world_accumulator>=1./60;i++){world_step();world_accumulator-=1./60;}
    if(world.age-last_save>10){world_save(ctx);last_save=world.age;}
    if(physics.running&&(!world_view||agent_control)&&(!agent_control||practice_steps>0)){
        accumulator+=dt;for(int i=0;i<6&&accumulator>=1./60;i++){
            if(agent_control&&practice_steps<=0){accumulator=0;break;}
            if(program_trial&&agent_control){
                if(!world_trial_step(&physics,&design)){log_text("\nController failed during practice.\n");practice_steps=0;world_trial_stop();program_trial=0;break;}
                memset(agent_keys,0,128);for(int j=1;j<design.count;j++){Block b=design.blocks[j];agent_keys[b.positive]=physics.parts[j].command>0;agent_keys[b.negative]=physics.parts[j].command<0;}
            }else physics_step(&physics,&design,agent_control?agent_keys:keys);
            if(agent_control)practice_steps--;accumulator-=1./60;
        }
        if(design.count&&!world_view){Vector3 p;Quaternion q;physics_pose(&physics,&design,0,&p,&q);orbit.target=Vector3Lerp(orbit.target,p,.035f);orbit_update(&orbit);}
    }else accumulator=0;
    if(now-updated>1){fps=frame_count/(now-updated);updated=now;frame_count=0;dirty=1;}frame_count++;
    if(dirty)draw_ui();Block ghost,*preview=NULL;if(!physics.running&&tool==ADD&&in_view()&&candidate(&ghost))preview=&ghost;
    if(world_view)render_world(&orbit);else render_frame(&design,&physics,&orbit,selected,hover,preview);return JS_TRUE;
}
static int game_initialize(JSContext *ctx) {
    embedded_context=ctx;world_load(ctx);
    JSValue global=JS_GetGlobalObject(ctx),game=JS_NewObject(ctx);
    JS_SetPropertyStr(ctx,game,"call",JS_NewCFunction(ctx,game_call,"call",2));
    JS_SetPropertyStr(ctx,game,"frame",JS_NewCFunction(ctx,game_frame,"frame",0));
    int result=JS_SetPropertyStr(ctx,global,"Game",game);JS_FreeValue(ctx,global);return result<0?-1:0;
}
int main(int argc,char **argv){
    if(argc==2&&!strcmp(argv[1],"--check"))return character_check();
    int integration=argc==2&&!strcmp(argv[1],"--integration-check");
    if(argc!=1&&!integration){fputs("usage: blockwalker [--check | --integration-check]\n",stderr);return 1;}
    if(!character_load(&design,"/workspace/blockwalker.character"))character_preset(&design,1);
    selected=design.count?0:-1;home_camera();if(render_open(&surface)<0)return 1;
    printf("Blockwalker: C game, raylib UI, Box3D physics, WebGPU rendering, embedded Pi.\n");
    last_frame=updated=seconds();
    int result=dolly_quickjs_embed(1,argv,integration?"/usr/src/dolly/blockwalker/check.mjs":"/usr/src/dolly/blockwalker/agent.mjs",game_initialize);
    if(physics.running)report();character_save(&design,"/workspace/blockwalker.character");physics_stop(&physics);world_close();render_close();dolly_display_release(surface.generation);character_clear(&design);for(int i=0;i<undo_count;i++)character_clear(&undo[i]);return result;
}
