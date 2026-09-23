#define _POSIX_C_SOURCE 200809L
#include "render.h"
#include "terrain.h"
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
static int brush_material,brush_finish=FINISH_PANEL,practice_sea;
static float mouse_x,mouse_y,last_x,last_y,fps;
static unsigned char keys[128],agent_keys[128];
static int agent_control,practice_steps,agent_panel,agent_enabled,prompt_focus,world_view,camera_fast,world_list;
static int library_open,library_page,control_page,piloting,eye_view;
static int focus_view,world_follow;
static Vector3 world_follow_position;
static double world_accumulator,last_save;
static char agent_log[8192],prompt_input[1024],pending_prompt[1024];
static double last_frame,updated,accumulator;
static unsigned frame_count;
static Physics physics;
static Vector3 follow_position;
static Orbit orbit={.target={0,2.5f,0},.yaw=.52f,.pitch=.28f,.distance=10};
static Orbit workshop_orbit,world_orbit={.target={0,3,-8},.yaw=.52f,.pitch=.35f,.distance=30};
static dolly_display_surface surface;
static JSContext *embedded_context;
static char message[160]="Click a box face to add. Right-drag to orbit. Scroll to zoom.";
static const Color ink={216,211,188,255},muted={143,151,140,255},paper={25,31,35,255},line={75,84,83,255},accent={180,144,78,255},panel={45,54,58,255};
static void report(void);
static void log_text(const char *text);

static double seconds(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static void say(const char *text){snprintf(message,sizeof(message),"%s",text);dirty=1;}
static void label(int x,int y,const char *s,float size,Color color){DrawTextEx(editor_font,s,(Vector2){x,y},size,0,color);}
static void button(int x,int y,int w,int h,const char *s,int active){
    DrawRectangleRec((Rectangle){x,y,w,h},active?accent:panel);
    DrawRectangleLinesEx((Rectangle){x,y,w,h},1,active?accent:line);
    DrawLine(x+1,y+1,x+w-2,y+1,active?(Color){216,183,117,255}:(Color){95,104,100,255});
    DrawLine(x+1,y+h-2,x+w-2,y+h-2,(Color){17,23,27,255});
    float font=18;Vector2 size=MeasureTextEx(editor_font,s,font,0);if(size.x>w-10){font*=(w-10)/size.x;size=MeasureTextEx(editor_font,s,font,0);}
    label(x+(w-size.x)/2,y+(h-font)/2,s,font,active?paper:ink);
}
static void draw_agent_log(void){
    char rows[18][256];int count=0;
    for(const char *p=agent_log;*p;count++){
        char *row=rows[count%18];const char *rest=NULL;int length=0,split=0;float width=0;
        while(*p&&*p!='\n'){
            int bytes;GetCodepointNext(p,&bytes);char glyph[5]={0};memcpy(glyph,p,bytes);
            float advance=MeasureTextEx(editor_font,glyph,15,0).x;
            if(length&&(width+advance>240||length+bytes>=(int)sizeof(rows[0])))break;
            if(*p==' '){split=length;rest=p+bytes;}
            memcpy(row+length,p,bytes);length+=bytes;width+=advance;p+=bytes;
        }
        if(*p&&*p!='\n'&&rest){length=split;p=rest;}
        row[length]=0;
        if(*p=='\n')p++;else while(*p==' ')p++;
    }
    int first=count>18?count-18:0;
    for(int i=first;i<count;i++)label(1024,286+(18-count+i)*17,rows[i%18],15,ink);
}
static int inside(int x,int y,int w,int h){return mouse_x>=x&&mouse_y>=y&&mouse_x<x+w&&mouse_y<y+h;}
static int in_view(void){return inside(render_view.x,render_view.y,render_view.width,render_view.height);}
static void layout(void){
    render_view=focus_view?(Viewport){0,0,agent_panel?998:SCREEN_WIDTH,SCREEN_HEIGHT}:(Viewport){VIEW_X,VIEW_Y,VIEW_W,VIEW_H};
    prompt_focus=0;memset(keys,0,sizeof(keys));orbit_drag=0;dirty=1;
}
static void toggle_focus(void){focus_view=!focus_view;library_open=0;binding=-1;layout();}
static void remember(void){if(undo_count==32){character_clear(&undo[0]);memmove(undo,undo+1,31*sizeof(*undo));undo[31]=(Character){0};undo_count--;}character_copy(&undo[undo_count++],&design);}
static void changed(void){dirty=1;if(!character_save(&design,"/workspace/blockwalker.character"))say("Could not save the working blueprint. Use Export to keep a copy.");}
static void undo_edit(void){if(undo_count){character_clear(&design);design=undo[--undo_count];undo[undo_count]=(Character){0};selected=design.count?design.count-1:-1;binding=-1;changed();say("Undid the last edit.");}}
static void home_camera(void){
    if(world_view){world_follow=0;orbit=(Orbit){.target={0,3,-8},.yaw=.52f,.pitch=.35f,.distance=30};orbit_update(&orbit);return;}
    Vector3 target={0,0,0};for(int i=0;i<design.count;i++){Vector3 p;Quaternion q;physics_pose(&physics,&design,i,&p,&q);target=Vector3Add(target,p);}
    orbit.target=design.count?Vector3Scale(target,1.f/design.count):(Vector3){0,1,0};
    float extent=1;for(int i=0;i<design.count;i++){Vector3 p;Quaternion q;physics_pose(&physics,&design,i,&p,&q);extent=fmaxf(extent,Vector3Distance(orbit.target,p));}
    orbit.distance=fmaxf(8,extent*3.5f);orbit.yaw=.52f;orbit.pitch=.28f;orbit_update(&orbit);
}
static void set_world_view(int enabled){
    enabled=enabled!=0;if(enabled==world_view)return;
    if(!enabled){piloting=eye_view=0;world_follow=0;}
    if(world_view){world_orbit=orbit;orbit=workshop_orbit;}else{workshop_orbit=orbit;orbit=world_orbit;}
    world_view=enabled;orbit_update(&orbit);memset(keys,0,sizeof(keys));dirty=1;
}
static void move_camera(float dt){
    if(!world_view||prompt_focus||piloting)return;
    float forward=keys['W']-keys['S'],right=keys['D']-keys['A'],up=keys['E']-keys['Q'];
    Vector3 delta={cosf(orbit.yaw)*right-sinf(orbit.yaw)*forward,up,-sinf(orbit.yaw)*right-cosf(orbit.yaw)*forward};
    if(Vector3LengthSqr(delta)==0)return;
    if(world_follow){world_follow=0;dirty=1;}
    orbit.target=Vector3Add(orbit.target,Vector3Scale(Vector3Normalize(delta),dt*(camera_fast?80:20)));
    orbit.target.x=Clamp(orbit.target.x,-512,512);orbit.target.z=Clamp(orbit.target.z,-512,512);orbit.target.y=Clamp(orbit.target.y,-64,128);
    orbit_update(&orbit);
}
static void visit_creature(const Creature *c){
    world_follow=c->id;Quaternion q;physics_pose(&c->physics,&c->design,0,&world_follow_position,&q);
    Vector3 low={INFINITY,INFINITY,INFINITY},high={-INFINITY,-INFINITY,-INFINITY};
    for(int i=0;i<c->design.count;i++){Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,i,&p,&q);low=Vector3Min(low,p);high=Vector3Max(high,p);}
    orbit.target=Vector3Scale(Vector3Add(low,high),.5f);orbit.distance=fmaxf(12,Vector3Distance(low,high)*1.8f);orbit_update(&orbit);dirty=1;
}
static void follow_creature(void){
    if(!world_view||!world_follow)return;
    for(int i=0;i<world.count;i++)if(world.creatures[i].id==world_follow){
        Creature *c=&world.creatures[i];Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);
        orbit.target=Vector3Add(orbit.target,Vector3Subtract(p,world_follow_position));world_follow_position=p;orbit_update(&orbit);return;
    }world_follow=0;dirty=1;
}
static void world_page(int delta){world_list=(int)Clamp(world_list+delta,0,fmaxf(0,world.count-8));dirty=1;}
static int program_trial;
static void enter_world(void){
    int id=world_enter(&design,practice_sea);if(!id){say("Use an unanchored character with room to spawn.");return;}
    world_trial_stop();program_trial=practice_steps=agent_enabled=agent_control=0;physics_stop(&physics);
    set_world_view(1);piloting=1;eye_view=1;visit_creature(world_find(id));memset(keys,0,sizeof(keys));
    world_save(embedded_context);say("WASD drive / E magnet on / Q off / Backslash camera / Esc workshop");
}
static void toggle_eyes(void){Creature *c=world_find(world.player);if(piloting&&c){eye_view=!eye_view;visit_creature(c);dirty=1;}}
static void player_camera(void){
    if(!piloting)return;Creature *c=world_find(world.player);
    if(!c){piloting=eye_view=0;home_camera();say("Your character stopped. Return to the workshop to rebuild.");return;}
    if(eye_view){
        Vector3 forward;
        if(physics_eyes(&c->physics,&c->design,&orbit.eye,&forward,&orbit.up)>=0){orbit.target=Vector3Add(orbit.eye,forward);orbit.fov=72;return;}
        eye_view=0;visit_creature(c);say("No Eyes block: using the follow camera.");
    }
}
static void start_test(void){
    world_trial_stop();program_trial=0;set_world_view(0);if(!design.count){say("Add a box before testing your character.");return;}binding=-1;memset(keys,0,sizeof(keys));
    int count=physics.cargo_count,old_sea=physics.landscape;Cargo *cargo=array_resize(NULL,count,sizeof(Cargo));if(count)memcpy(cargo,physics.cargo,count*sizeof(Cargo));
    if(practice_sea)physics_start_sea(&physics,&design);else physics_start(&physics,&design);
    for(int i=0;i<count;i++){Vector3 p=cargo[i].start;p.x+=(practice_sea-old_sea)*125;p.z+=(practice_sea-old_sea)*10;physics_add_cargo(&physics,p,cargo[i].block.material);}free(cargo);
    Quaternion rotation;physics_pose(&physics,&design,0,&follow_position,&rotation);
    home_camera();say(practice_sea?"Sea trial: hulls float, ballast sinks. Use the joint keys to sail.":"Hold the joint keys to move. Can you keep it standing?");
}
static void drop_cargo(void){
    if(world_view){
        Vector3 target=orbit.target;if(piloting)target=Vector3Add(orbit.eye,Vector3Scale(Vector3Normalize(Vector3Subtract(orbit.target,orbit.eye)),3));
        world_drop_cargo(Clamp(target.x,-248,248),NAN,Clamp(target.z,-248,248),MATERIAL_ALLOY);world_save(embedded_context);
    }
    else if(physics.running){
        Vector3 p=physics.start;for(int i=0;i<design.count;i++)if(design.blocks[i].joint==BLOCK_MAGNET){Quaternion q;physics_pose(&physics,&design,i,&p,&q);break;}
        p.y=(physics.landscape?fmaxf(terrain_height(p.x,p.z),WATER_LEVEL):0)+.65f;physics_add_cargo(&physics,p,MATERIAL_ALLOY);
    }
    dirty=1;say("Loose cargo dropped. Power the magnet to pick it up; switch it off to release.");
}
static void back_to_builder(void){world_trial_stop();program_trial=0;set_world_view(0);report();physics_stop(&physics);memset(keys,0,sizeof(keys));home_camera();say("Back in the workshop. Your original build is unchanged.");}
static void preset(int walker){remember();if(walker==3)character_car(&design);else character_preset(&design,walker);selected=0;tool=SELECT;binding=-1;home_camera();changed();say(walker==3?"Starter car: Drive in world, then WASD. E picks cargo up; Q releases it.":"Walking is up to you. Test the joints, or ask Pi to learn a gait.");}
static int candidate(Block *block){
    Vector3 normal={0};int parent=render_pick(&design,&orbit,mouse_x,mouse_y,&normal),x,y,z;
    if(parent>=0){Block b=design.blocks[parent];x=b.x+(int)roundf(normal.x);y=b.y+(int)roundf(normal.y);z=b.z+(int)roundf(normal.z);}
    else if(!design.count){Ray ray=GetScreenToWorldRayEx((Vector2){mouse_x-render_view.x,mouse_y-render_view.y},orbit_camera(&orbit),render_view.width,render_view.height);if(fabsf(ray.direction.y)<.0001f)return 0;float t=-ray.position.y/ray.direction.y;if(t<=0)return 0;x=(int)roundf(ray.position.x+t*ray.direction.x);y=0;z=(int)roundf(ray.position.z+t*ray.direction.z);}
    else return 0;
    if(!character_candidate(&design,parent,x,y,z,brush_joint,brush_color,block))return 0;
    block->material=brush_material;block->finish=brush_finish;return 1;
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
static JSValue open_design(JSContext *ctx,int index){
    Character next={0};JSValue result=world_open_design(ctx,index,&next);if(JS_IsException(result))return result;
    world_trial_stop();program_trial=0;physics_stop(&physics);set_world_view(0);practice_steps=0;remember();character_copy(&design,&next);character_clear(&next);
    SavedDesign *saved=&world.designs[index];practice_sea=terrain_height(saved->x,saved->z)<WATER_LEVEL;
    library_open=0;selected=0;binding=-1;home_camera();changed();world_save(ctx);say("Design and controller restored. Test it, then Play program.");return result;
}
static JSValue save_design(JSContext *ctx){
    JSValue result=world_save_design(ctx,&design,practice_sea);
    if(!JS_IsException(result)){int id;JS_ToInt32(ctx,&id,result);library_page=(id-1)/8*8;world_save(ctx);dirty=1;say("Blueprint and controller saved in the design library.");}
    return result;
}
static void toggle_control(void){world_trial_stop();program_trial=0;agent_control=!agent_control;agent_enabled=agent_control;practice_steps=0;memset(keys,0,128);dirty=1;}
static void click(void){
    if(focus_view){
        if(inside(render_view.width-232,12,220,34)){toggle_focus();return;}
        if(inside(12,12,80,34)){agent_panel=!agent_panel;layout();return;}
        if(!(agent_panel&&mouse_x>=998)){
            prompt_focus=0;
            if(!world_view&&!physics.running&&in_view())goto edit_view;
            return;
        }
    }else if(inside(794,683,230,30)){toggle_focus();return;}
    if(inside(24,54,194,20)){library_open=!library_open;prompt_focus=0;memset(keys,0,128);dirty=1;return;}
    if(library_open){
        if(inside(932,156,44,32))library_open=0;
        if(inside(520,156,210,32)){world_load_archive(embedded_context);say("Older prototypes added to the library. The starting world is unchanged.");}
        if(inside(748,156,164,32)){
            JSValue result=save_design(embedded_context);
            if(JS_IsException(result)){JS_FreeValue(embedded_context,JS_GetException(embedded_context));say("Build a character and install its controller before saving a design.");}
            JS_FreeValue(embedded_context,result);
        }
        if(inside(274,558,68,34))library_page=(int)fmaxf(0,library_page-8);
        if(inside(908,558,68,34))library_page=(int)fminf((world.design_count?((world.design_count-1)/8)*8:0),library_page+8);
        for(int i=0;i<8&&library_page+i<world.design_count;i++)if(inside(882,206+i*42,94,32)){
            JSValue result=open_design(embedded_context,library_page+i);
            if(JS_IsException(result)){JS_FreeValue(embedded_context,JS_GetException(embedded_context));say("Could not open this design.");}
            else{agent_enabled=agent_control=0;memset(agent_keys,0,128);}JS_FreeValue(embedded_context,result);break;
        }dirty=1;return;
    }
    if(physics.running&&!agent_panel){
        if(inside(1036,616,56,32)){control_page=(int)fmaxf(0,control_page-7);dirty=1;return;}
        if(inside(1200,616,56,32)){control_page+=7;dirty=1;return;}
    }
    if(inside(712,22,80,36)){agent_panel=!agent_panel;layout();return;}
    if(inside(352,22,104,36)){set_world_view(!world_view);return;}
    if(!world_view&&inside(472,54,208,20)){practice_sea=!practice_sea;if(physics.running)start_test();dirty=1;return;}
    if(agent_panel&&mouse_x>998){
        prompt_focus=inside(1024,608,240,54);
        if(prompt_focus)memset(keys,0,sizeof(keys));
        if(inside(1036,142,220,36)){agent_enabled=0;int result=system("upload /workspace/blockwalker-agent/models.json");say(result==0?"Proxy configuration imported. Press Start in the Pi panel.":"Proxy import cancelled.");}
        if(inside(1036,188,104,36)){agent_enabled=1;agent_control=1;log_text("\nStarting Pi...\n");}
        if(inside(1152,188,104,36)){agent_enabled=0;practice_steps=0;memset(agent_keys,0,128);log_text("\nPaused.\n");}
        if(inside(1036,235,220,36))toggle_control();
        dirty=1;return;
    }
    prompt_focus=0;
    for(int i=0;i<5;i++)if(inside(254+i*88,92,80,34)){
        if(i==0)orbit.yaw-=.3f;if(i==1)orbit.yaw+=.3f;
        if(i==2)orbit.pitch=Clamp(orbit.pitch+.2f,-1.5f,1.5f);
        if(i==3)orbit.pitch=Clamp(orbit.pitch-.2f,-1.5f,1.5f);
        if(i==4)home_camera();orbit_update(&orbit);return;
    }
    if(inside(1052,18,204,44)){if(world_view){set_world_view(0);return;}if(physics.running)back_to_builder();else start_test();return;}
    if(world_view){
        if(!agent_panel&&inside(1036,188,220,36)){drop_cargo();return;}
        if(!agent_panel&&piloting&&inside(1036,280,220,36)){toggle_eyes();return;}
        for(int i=0;i<7;i++)if(inside(24+(i%2)*102,188+(i/2)*32,92,28)){
            piloting=eye_view=0;
            const Vector3 targets[]={{0,1,0},{116,-1,20},{170,4,30},{-174,2,-35},{15,6,-175},{0,0,0},{46,2,72}};
            const float distances[]={24,50,100,110,150,512,72};
            if(i==0)home_camera();else{world_follow=0;orbit.target=targets[i];orbit.distance=distances[i];orbit.pitch=i==5?1.15f:.55f;orbit_update(&orbit);dirty=1;}return;
        }
        world_page(0);
        for(int i=0;i<8&&world_list+i<world.count;i++)if(inside(24,344+i*26,194,25)){piloting=eye_view=0;visit_creature(&world.creatures[world_list+i]);return;}
        if(inside(24,564,40,30)){world_page(-8);return;}if(inside(178,564,40,30)){world_page(8);return;}
        if(inside(24,612,194,36)){world_save(embedded_context);int result=system("download /workspace/blockwalker-world.json");say(result==0?"World exported with programs and physics state.":"World export failed.");}
        return;
    }
    if(physics.running){
        if(inside(24,154,194,42))start_test();
        if(inside(24,212,194,42))home_camera();
        if(inside(24,264,194,30))drop_cargo();
        if(inside(24,350,194,36)){
            if(program_trial==2){toggle_control();say("Program stopped. Your keys control the joints.");}
            else{agent_enabled=0;start_test();if(world_trial_begin(&physics)){program_trial=2;agent_control=1;memset(agent_keys,0,128);say("Playing the saved controller. Stop program or ` takes manual control.");}else say("Open a saved design or ask Pi to install a controller first.");}
        }
        return;
    }
    if(inside(808,22,104,36)){export_character();return;}
    if(inside(924,22,104,36)){import_character();return;}
    if(inside(24,280,194,40)){enter_world();return;}
    for(int i=0;i<BLOCK_KINDS;i++)if(inside(24+(i%2)*100,142+(i/2)*32,94,28)){brush_joint=i;tool=ADD;binding=-1;dirty=1;return;}
    for(int i=0;i<3;i++)if(inside(24+i*66,336,62,36)){tool=i;dirty=1;return;}
    for(int i=0;i<COLOR_COUNT;i++)if(inside(24+i*32,416,26,30)){
        brush_color=i;if(tool==SELECT&&selected>=0){remember();design.blocks[selected].color=i;changed();}dirty=1;return;
    }
    for(int i=0;i<FINISH_COUNT;i++)if(inside(24+i*49,452,46,24)){
        brush_finish=i;if(tool==SELECT&&selected>=0){remember();design.blocks[selected].finish=i;changed();}dirty=1;return;
    }
    if(inside(24,502,194,36)){preset(1);return;}
    if(inside(24,548,194,32)){preset(3);return;}
    if(inside(24,586,194,22)){preset(2);return;}
    if(inside(24,612,92,36)){undo_edit();return;}
    if(inside(126,612,92,36)){remember();character_clear(&design);selected=-1;brush_joint=0;tool=ADD;binding=-1;home_camera();changed();say("Start with a box on the grid.");return;}
edit_view:
    if(in_view()){
        Vector3 normal;int hit=render_pick(&design,&orbit,mouse_x,mouse_y,&normal);
        if(tool==SELECT){selected=hit;binding=-1;dirty=1;return;}
        if(tool==ERASE){selected=hit;remove_selected();return;}
        Block b;if(candidate(&b)){remember();selected=character_add(&design,b.parent,b.x,b.y,b.z,b.joint,b.color);design.blocks[selected].material=b.material;design.blocks[selected].finish=b.finish;changed();say(b.joint?"Joint added. Select its two keys in the inspector.":"Box attached to every touching rigid block.");}
        else say(design.count?"Place on an empty adjacent side, above the grid.":"Start with a regular box on the grid.");
        return;
    }
    if(selected<0)return;
    Block *b=&design.blocks[selected];
    for(int i=0;i<MATERIAL_COUNT;i++)if(inside(1074+i*62,574,58,28)){remember();b->material=brush_material=i;changed();return;}
    if(selected==0&&inside(1036,328,220,36)){remember();design.anchored=!design.anchored;changed();return;}
    if(inside(1036,608,220,40)){remove_selected();return;}
    if(b->joint==BLOCK_EYES){
        if(inside(1200,218,56,24)){remember();b->direction=-b->direction;changed();}
        for(int axis=0;axis<3;axis++)if(inside(1036+axis*76,248,68,36)){remember();b->axis=axis;changed();}return;
    }
    if(block_controlled(*b)){
        if((b->joint==BLOCK_PISTON||b->joint==BLOCK_MAGNET)&&inside(1200,218,56,24)){remember();b->direction=-b->direction;changed();return;}
        for(int axis=0;axis<3;axis++)if(inside(1036+axis*76,248,68,36)){remember();b->axis=axis;changed();say("Joint axis changed.");return;}
        for(int key=0;key<2;key++)if(inside(1036+key*116,336,104,44)){binding=key;dirty=1;say("Press a letter or number for this direction. Esc cancels.");return;}
        if(inside(1036,436,40,36)||inside(1216,436,40,36)){remember();if(b->joint==BLOCK_THRUSTER||b->joint==BLOCK_MAGNET)b->force=Clamp(b->force+(mouse_x<1100?-2:2),2,100);else b->speed=Clamp(b->speed+(mouse_x<1100?-.5f:.5f),.5f,6);changed();return;}
        if(inside(1036,532,40,36)||inside(1216,532,40,36)){remember();if(b->joint==BLOCK_PISTON)b->travel=Clamp(b->travel+(mouse_x<1100?-.25f:.25f),.25f,3);else if(b->joint==BLOCK_HINGE)b->limit=Clamp(b->limit+(mouse_x<1100?-15:15),15,150);else if(b->joint==BLOCK_WHEEL||b->joint==BLOCK_TURNTABLE)b->force=Clamp(b->force+(mouse_x<1100?-2:2),2,100);changed();return;}
    }else if(selected>0&&inside(1036,248,220,42)){
        Character copy={0};character_copy(&copy,&design);Block old=copy.blocks[selected];
        // Obtain an unused pair without changing the character's attachment tree.
        const char *available="QAWSOKPLERDTFGYHUJIZXCVBNM1234567890";int chosen[2],n=0;
        for(const char *s=available;*s&&n<2;s++){int used=0;for(int j=0;j<copy.count;j++)if(block_controlled(copy.blocks[j])&&(copy.blocks[j].negative==*s||copy.blocks[j].positive==*s))used=1;if(!used)chosen[n++]=*s;}
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
        if(e.type==DOLLY_INPUT_EVENT_FOCUS&&e.action==0){memset(keys,0,sizeof(keys));orbit_drag=camera_fast=0;dirty=1;}
        if(e.type==DOLLY_INPUT_EVENT_SCROLL&&in_view()){orbit.distance=Clamp(orbit.distance+(int32_t)e.action*.00065f*fmaxf(1,orbit.distance/20),3,512);orbit_update(&orbit);}
        if(e.type==DOLLY_INPUT_EVENT_SCROLL&&!focus_view&&world_view&&inside(24,344,194,250))world_page((int32_t)e.action>0?3:-3);
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
        if(e.action==DOLLY_KEY_ACTION_PRESS&&dolly_raylib_code_is(&e,"Tab")){if(e.modifiers&DOLLY_INPUT_MOD_SHIFT)toggle_focus();else{agent_panel=!agent_panel;layout();}continue;}
        if(library_open){if(e.action==DOLLY_KEY_ACTION_PRESS&&dolly_raylib_code_is(&e,"Escape")){library_open=0;dirty=1;}continue;}
        camera_fast=(e.modifiers&DOLLY_INPUT_MOD_SHIFT)!=0;
        if(prompt_focus){
            if(e.action==DOLLY_KEY_ACTION_RELEASE)continue;
            if(dolly_raylib_code_is(&e,"Escape")){prompt_focus=0;dirty=1;continue;}
            if(dolly_raylib_code_is(&e,"Enter")){snprintf(pending_prompt,sizeof(pending_prompt),"%s",prompt_input);prompt_input[0]=0;agent_enabled=agent_control=1;dirty=1;continue;}
            if(dolly_raylib_code_is(&e,"Backspace")){size_t n=strlen(prompt_input);if(n){do{n--;}while(n&&(prompt_input[n]&0xc0)==0x80);prompt_input[n]=0;}dirty=1;continue;}
            if(e.key_length==1&&!(e.modifiers&(DOLLY_INPUT_MOD_CONTROL|DOLLY_INPUT_MOD_META|DOLLY_INPUT_MOD_ALT)))append_prompt(e.data,e.key_length);
            continue;
        }
        if(e.action==DOLLY_KEY_ACTION_PRESS&&dolly_raylib_code_is(&e,"Backquote")){toggle_control();continue;}
        int k=event_letter(&e);if(k>0&&k<128){int down=e.action!=DOLLY_KEY_ACTION_RELEASE;if(physics.running&&keys[k]!=down)dirty=1;keys[k]=down;}
        if(e.action!=DOLLY_KEY_ACTION_PRESS)continue;
        if(dolly_raylib_code_is(&e,"Escape")){
            if(focus_view){toggle_focus();}
            else if(binding>=0){binding=-1;say("Key assignment cancelled.");}
            else if(world_view)set_world_view(0);else if(physics.running)back_to_builder();else stopping=1;continue;
        }
        if(world_view){
            if(piloting&&dolly_raylib_code_is(&e,"Backslash"))toggle_eyes();
            Creature *c=piloting?world_find(world.player):NULL;
            if(c)for(int i=0;i<c->design.count;i++)if(c->design.blocks[i].joint==BLOCK_MAGNET){
                if(k==c->design.blocks[i].positive)c->physics.parts[i].magnet_power=1;
                if(k==c->design.blocks[i].negative)c->physics.parts[i].magnet_power=0;
            }
            if(!piloting&&k=='H')home_camera();if(k=='C')drop_cargo();continue;
        }
        if(binding>=0&&selected>=0){
            if(!((k>='A'&&k<='Z')||(k>='0'&&k<='9'))){say("Choose a letter or number.");continue;}
            Character next={0};character_copy(&next,&design);Block *b=&next.blocks[selected];if(binding==0)b->negative=k;else b->positive=k;
            if(character_validate(&next)){remember();character_copy(&design,&next);binding=-1;changed();say("Movement key assigned.");}else say("That key is already assigned to a joint.");
            character_clear(&next);
            continue;
        }
        if(physics.running){
            if(!agent_control)for(int i=0;i<design.count;i++)if(design.blocks[i].joint==BLOCK_MAGNET){
                if(k==design.blocks[i].positive)physics.parts[i].magnet_power=1;
                if(k==design.blocks[i].negative)physics.parts[i].magnet_power=0;
            }dirty=1;continue;
        }
        if((e.modifiers&DOLLY_INPUT_MOD_CONTROL)&&k=='Z'){undo_edit();continue;}
        if(dolly_raylib_code_is(&e,"Enter")){start_test();continue;}
        if(dolly_raylib_code_is(&e,"Delete")||dolly_raylib_code_is(&e,"Backspace")){remove_selected();continue;}
        if(k=='B'){brush_joint=0;tool=ADD;dirty=1;}if(k=='J'){brush_joint=1;tool=ADD;dirty=1;}
        if(k=='V'){tool=SELECT;dirty=1;}if(k=='X'){tool=ERASE;dirty=1;}if(k=='H')home_camera();
    }
}
static void draw_ui(void){
    BeginDrawing();ClearBackground(BLANK);
    char text[120];int joints=0;for(int i=0;i<design.count;i++)joints+=block_controlled(design.blocks[i]);
    if(focus_view){
        button(render_view.width-232,12,220,34,"Controls [Shift Tab]",0);button(12,12,80,34,"Pi [Tab]",agent_panel);
        if(world_view&&world_follow){snprintf(text,sizeof(text),piloting?"WASD drive / E pickup / Q release":"Following %d / WASD to leave",world_follow);label(110,22,text,16,ink);}
        if(world_view){snprintf(text,sizeof(text),"CARGO DELIVERED  %d / YOU %d",world.delivery_count,world_cargo_score(-1));label(16,render_view.height-30,text,16,ink);}
        goto agent_overlay;
    }
    DrawRectangle(0,0,SCREEN_WIDTH,VIEW_Y,paper);DrawRectangle(0,VIEW_Y,VIEW_X,VIEW_H,paper);
    DrawRectangle(VIEW_X+VIEW_W,VIEW_Y,SCREEN_WIDTH-VIEW_X-VIEW_W,VIEW_H,paper);DrawRectangle(0,674,SCREEN_WIDTH,46,paper);
    DrawLine(0,79,1280,79,line);DrawLine(241,80,241,674,line);DrawLine(998,80,998,674,line);DrawLine(0,674,1280,674,line);
    label(24,12,"BLOCKWALKER",26,ink);label(26,38,"MECHANICAL WORKS / 96",11,muted);button(24,54,194,20,"Design library",library_open);
    if(world_view){int parts=0;for(int i=0;i<world.count;i++)parts+=world.creatures[i].design.count;snprintf(text,sizeof(text),"%d OBJECTS / %d PARTS",world.count,parts);}
    else snprintf(text,sizeof(text),"%d PARTS / %d JOINTS",design.count,joints);label(472,32,text,15,muted);
    if(!world_view)button(472,54,208,20,practice_sea?"Test surface: water":"Test surface: ground",practice_sea);
    button(352,22,104,36,world_view?"Workshop":"World",world_view);button(712,22,80,36,"Pi [Tab]",agent_panel);
    button(1052,18,204,44,(physics.running||world_view)?"Back to builder":"Test character  >",1);
    const char *views[]={"< Left","Right >","Up","Down","Home"};
    for(int i=0;i<5;i++)button(254+i*88,92,80,34,views[i],0);
    DrawRectangle(254,643,600,23,paper);
    label(262,647,piloting?"WASD drive / E on / Q release / Backslash camera":world_view?"WASD move / QE rise / Shift fast / drag orbit / scroll zoom":"Camera: right-drag / Alt + drag   |   Scroll to zoom",15,muted);
    if(world_view){
        label(24,108,"COASTAL WORKS",17,muted);snprintf(text,sizeof(text),"%d living / %d removed",world.count,world.deaths);label(24,154,text,16,ink);
        const char *places[]={"Home","Harbor","East","West","North","Overview","Basin"};
        for(int i=0;i<7;i++)button(24+(i%2)*102,188+(i/2)*32,92,28,places[i],0);
        label(24,316,"CREATURES / click to follow",14,muted);
        world_list=(int)Clamp(world_list,0,fmaxf(0,world.count-8));
        for(int i=0;i<8&&world_list+i<world.count;i++){Creature *c=&world.creatures[world_list+i];snprintf(text,sizeof(text),"%d  %.19s",c->id,c->name);label(24,344+i*26,text,14,c->id==world_follow?accent:ink);}
        button(24,564,40,30,"<",0);button(178,564,40,30,">",0);
        snprintf(text,sizeof(text),"%d-%d / %d",world.count?world_list+1:0,(int)fminf(world_list+8,world.count),world.count);label(74,572,text,14,muted);
        button(24,612,194,36,"Export world",0);
        if(!agent_panel){
            label(1036,108,piloting?"DRIVER":"LOOSE CARGO",17,muted);label(1036,149,piloting?"WASD drive / E on / Q off":"Drops at the camera target.",14,muted);button(1036,188,220,36,"Drop cargo [C]",0);
            if(piloting)button(1036,280,220,36,eye_view?"Follow camera [\\]":"Eyes camera [\\]",0);
            label(1036,354,"CARGO DELIVERED",17,muted);snprintf(text,sizeof(text),"%d total / %d by you",world.delivery_count,world_cargo_score(-1));label(1036,385,text,17,ink);
            label(1036,428,"Carry to a striped depot.",14,muted);label(1036,449,"Release and let it settle.",14,muted);label(1036,470,"Each crate counts once.",14,muted);
            int nearest=0;float distance=INFINITY;for(int i=0;i<depot_count;i++){float d=hypotf(orbit.target.x-depots[i].x,orbit.target.z-depots[i].z);if(d<distance){distance=d;nearest=i;}}
            snprintf(text,sizeof(text),"%s / %.0f m",depots[nearest].name,distance);label(1036,520,text,16,accent);
            if(world.delivery_count){Delivery *d=&world.deliveries[world.delivery_count-1];snprintf(text,sizeof(text),"Last: %.22s",d->name);label(1036,555,text,14,muted);label(1036,576,depots[d->depot].name,14,muted);}
        }
    }else if(!physics.running){
        button(808,22,104,36,"Export",0);button(924,22,104,36,"Import",0);
        label(24,106,"PARTS",17,muted);
        for(int i=0;i<BLOCK_KINDS;i++)button(24+(i%2)*100,142+(i/2)*32,94,28,block_names[i],tool==ADD&&brush_joint==i);
        button(24,280,194,40,"Drive in world",1);
        button(24,336,62,36,"Add",tool==ADD);button(90,336,62,36,"Pick",tool==SELECT);button(156,336,62,36,"Erase",tool==ERASE);
        label(24,390,tool==SELECT?"SELECTED COLOR":"BLOCK COLOR",15,muted);
        for(int i=0;i<COLOR_COUNT;i++){DrawRectangleRounded((Rectangle){24+i*32,416,26,30},.12f,4,block_colors[i]);if(i==brush_color)DrawRectangleLinesEx((Rectangle){22+i*32,414,30,34},2,ink);}
        const char *finishes[]={"Plain","Panel","Trim","Stripe"};for(int i=0;i<FINISH_COUNT;i++)button(24+i*49,452,46,24,finishes[i],(tool==SELECT&&selected>=0?design.blocks[selected].finish:brush_finish)==i);
        label(24,482,"STARTING POINTS",15,muted);button(24,502,194,36,"4-joint walker",0);button(24,548,194,32,"Starter car",0);button(24,586,194,22,"Quadruped",0);
        button(24,612,92,36,"Undo",0);button(126,612,92,36,"Clear",0);
        label(1036,106,"INSPECTOR",17,muted);
        if(selected<0){label(1036,162,"Pick a block",22,ink);label(1036,199,"to edit its attachment.",16,muted);label(1036,258,"A joint turns the blocks",15,muted);label(1036,282,"attached beyond it.",15,muted);}
        else {
            Block b=design.blocks[selected];snprintf(text,sizeof(text),"%s %02d",block_names[b.joint],selected+1);label(1036,151,text,24,ink);
            snprintf(text,sizeof(text),"Grid  %d, %d, %d",b.x,b.y,b.z);label(1036,190,text,16,muted);
            if(b.joint==BLOCK_EYES){
                label(1036,224,"LOOK DIRECTION",15,muted);button(1200,218,56,24,b.direction>0?"+":"-",0);
                for(int i=0;i<3;i++){char name[2]={'X'+i,0};button(1036+i*76,248,68,36,name,b.axis==i);}
                label(1036,322,"View follows this block.",15,muted);label(1036,350,"Backslash: switch camera",15,muted);
                label(1036,392,"Aim the lenses outward.",15,muted);
            }else if(block_controlled(b)){
                label(1036,224,b.joint==BLOCK_MAGNET?"MAGNET FACE":"CONTROL AXIS",15,muted);if(b.joint==BLOCK_PISTON||b.joint==BLOCK_MAGNET)button(1200,218,56,24,b.direction>0?"+":"-",0);for(int i=0;i<3;i++){char name[2]={'X'+i,0};button(1036+i*76,248,68,36,name,b.axis==i);}
                label(1036,310,b.joint==BLOCK_MAGNET?"SWITCH OFF":b.joint==BLOCK_PISTON?"RETRACT -":"REVERSE -",15,muted);label(1152,310,b.joint==BLOCK_MAGNET?"SWITCH ON":b.joint==BLOCK_PISTON?"EXTEND +":"FORWARD +",15,muted);
                char negative[2]={b.negative?b.negative:'-',0},positive[2]={b.positive?b.positive:'-',0};button(1036,336,104,44,binding==0?"Press key":negative,binding==0);button(1152,336,104,44,binding==1?"Press key":positive,binding==1);
                int force_control=b.joint==BLOCK_THRUSTER||b.joint==BLOCK_MAGNET;
                label(1036,407,b.joint==BLOCK_MAGNET?"HOLDING FORCE":force_control?"PUSH FORCE":"MOTOR SPEED",15,muted);button(1036,436,40,36,"-",0);button(1216,436,40,36,"+",0);snprintf(text,sizeof(text),force_control?"%.0f N":b.joint==BLOCK_PISTON?"%.1f m/s":"%.1f rad/s",force_control?b.force:b.speed);label(1090,444,text,17,ink);
                if(!force_control){
                    label(1036,503,b.joint==BLOCK_WHEEL||b.joint==BLOCK_TURNTABLE?"MOTOR TORQUE":"TRAVEL LIMIT",15,muted);button(1036,532,40,36,"-",0);button(1216,532,40,36,"+",0);
                    if(b.joint==BLOCK_PISTON)snprintf(text,sizeof(text),"0 - %.2f m",b.travel);
                    else if(b.joint==BLOCK_WHEEL||b.joint==BLOCK_TURNTABLE)snprintf(text,sizeof(text),"%.0f Nm",b.force);
                    else snprintf(text,sizeof(text),"+/- %.0f deg",b.limit);label(1088,540,text,17,ink);
                }else {label(1036,503,b.joint==BLOCK_MAGNET?"Stays powered until Off.":"Push follows the block.",15,muted);label(1036,532,b.joint==BLOCK_MAGNET?"Cyan: on / amber: holding.":"Release keys to coast.",15,muted);}
            }else if(selected>0){label(1036,225,"Rigid attachment",17,muted);button(1036,248,220,42,"Make this a joint",0);}
            else {label(1036,226,"The starting block.",17,muted);label(1036,258,"Add a joint to one of",16,muted);label(1036,282,"its faces to articulate.",16,muted);button(1036,328,220,36,design.anchored?"Root anchored":"Root free",design.anchored);label(1036,386,"Anchor cranes / bridges.",15,muted);}
            label(1036,582,"Mass",13,muted);const char *materials[]={"Alloy","Hull","Heavy"};for(int i=0;i<MATERIAL_COUNT;i++)button(1074+i*62,574,58,28,materials[i],b.material==i);
            button(1036,608,220,40,"Remove branch",0);
        }
    }else {
        label(24,108,practice_sea?"SEA TRIAL":"TEST GROUND",17,muted);button(24,154,194,42,"Reset drop",0);button(24,212,194,42,"Center camera",0);button(24,264,194,30,"Drop cargo",0);
        label(24,308,"Balance, fall, rebuild.",15,muted);button(24,350,194,36,program_trial==2?"Stop program":"Play program",program_trial==2);
        label(1036,108,"HOLD KEYS TO TURN",17,muted);int row=0,actuator=0;
        control_page=(int)Clamp(control_page,0,joints?((joints-1)/7)*7:0);
        for(int i=0;i<design.count&&row<7;i++)if(block_controlled(design.blocks[i])){if(actuator++<control_page)continue;Block b=design.blocks[i];int y=152+row*66;
            snprintf(text,sizeof(text),"%02d",i+1);label(1036,y+12,text,16,muted);char a[2]={b.negative?b.negative:'-',0},z[2]={b.positive?b.positive:'-',0};button(1072,y,72,42,a,(agent_control?agent_keys:keys)[b.negative]);button(1156,y,72,42,z,(agent_control?agent_keys:keys)[b.positive]);
            PhysicsPart *part=&physics.parts[i];
            if(b.joint==BLOCK_MAGNET)snprintf(text,sizeof(text),part->magnet_power?b3Body_IsValid(part->magnet_target)?"Holding %.1f N":"On %.1f N":"Off",part->magnet_load);
            else if(b.joint==BLOCK_PISTON)snprintf(text,sizeof(text),"%.2f m",part->angle);
            else if(b.joint==BLOCK_THRUSTER)snprintf(text,sizeof(text),"%+.1f N",part->command*b.force);
            else snprintf(text,sizeof(text),"%+.0f deg",part->angle*RAD2DEG);
            label(1072,y+44,text,14,muted);row++;}
        if(joints>7){button(1036,616,56,32,"<",0);button(1200,616,56,32,">",0);snprintf(text,sizeof(text),"%d-%d / %d",control_page+1,(int)fminf(control_page+7,joints),joints);label(1100,626,text,14,muted);}
    }
    if(library_open){
        DrawRectangle(254,142,742,470,paper);DrawRectangleLinesEx((Rectangle){254,142,742,470},2,line);
        label(274,164,"DESIGN LIBRARY",22,ink);button(520,156,210,32,"Older prototypes",0);button(748,156,164,32,"Save current",0);button(932,156,44,32,"X",0);
        library_page=(int)Clamp(library_page,0,world.design_count?((world.design_count-1)/8)*8:0);
        for(int i=0;i<8&&library_page+i<world.design_count;i++){SavedDesign *d=&world.designs[library_page+i];int y=206+i*42;
            snprintf(text,sizeof(text),"%.34s",d->name);label(274,y+8,text,16,ink);
            snprintf(text,sizeof(text),"%d parts / %d Hz",d->design.count,d->hz);label(696,y+8,text,14,muted);button(882,y,94,32,"Open",0);
        }button(274,558,68,34,"<",0);button(908,558,68,34,">",0);snprintf(text,sizeof(text),"%d-%d of %d designs",world.design_count?library_page+1:0,(int)fminf(library_page+8,world.design_count),world.design_count);label(498,568,text,15,muted);
    }
agent_overlay:
    if(agent_panel){
        DrawRectangle(998,focus_view?0:80,282,focus_view?SCREEN_HEIGHT:594,paper);label(1036,106,"PI / ASTRA / XHIGH",16,ink);
        button(1036,142,220,36,"Import proxy config",0);button(1036,188,104,36,"Start",agent_enabled);button(1152,188,104,36,"Pause",!agent_enabled);
        button(1036,235,220,36,agent_control?"Agent keys [`]":"Your keys [`]",agent_control);
        draw_agent_log();
        DrawRectangleRec((Rectangle){1024,608,240,54},panel);
        if(prompt_focus)DrawRectangleLinesEx((Rectangle){1024,608,240,54},2,accent);
        size_t length=strlen(prompt_input);label(1032,618,length?prompt_input+(length>27?length-27:0):"Message Pi...",14,ink);label(1032,642,"Enter to send / steer",12,muted);
    }
    if(!focus_view){label(24,692,message,15,ink);button(794,683,230,30,"Focus [Shift Tab]",0);snprintf(text,sizeof(text),"%.0f FPS  |  Esc %s",fps,physics.running?"edit":"exit");label(1050,692,text,14,muted);}
    render_ui_upload();dirty=0;
}
static void report(void){
    FILE *f=fopen("/workspace/blockwalker-last-run.json","w");if(!f)return;
    fprintf(f,"{\"blocks\":%d,\"physicsSteps\":%d,\"maxSeparation\":%.6f,\"joints\":[",design.count,physics.steps,physics.max_separation);int n=0;
    for(int i=0;i<design.count;i++)if(block_controlled(design.blocks[i])){Block b=design.blocks[i];fprintf(f,"%s{\"block\":%d,\"negative\":\"%c\",\"positive\":\"%c\",\"axis\":%d,\"motorSteps\":%d,\"peakAngle\":%.6f,\"drivenRadians\":%.6f}",n++?",":"",i,b.negative?b.negative:'-',b.positive?b.positive:'-',b.axis,physics.parts[i].motor_steps,physics.parts[i].angle_peak,physics.parts[i].driven_radians);}
    fputs("]}\n",f);fclose(f);
}
static JSValue state(JSContext *ctx) {
    JSValue result=JS_NewObject(ctx),parts=JS_NewArray(ctx);
    JS_SetPropertyStr(ctx,result,"mode",JS_NewString(ctx,world_view?"world":physics.running?"practice":"builder"));
    JS_SetPropertyStr(ctx,result,"playerId",JS_NewInt32(ctx,world.player));JS_SetPropertyStr(ctx,result,"piloting",JS_NewBool(ctx,piloting));JS_SetPropertyStr(ctx,result,"eyes",JS_NewBool(ctx,eye_view));
    Creature *player=world_find(world.player);if(player&&piloting)JS_SetPropertyStr(ctx,result,"driverSensors",physics_sensors(ctx,&player->physics,&player->design,1./60));
    JS_SetPropertyStr(ctx,result,"steps",JS_NewInt32(ctx,physics.steps));
    JS_SetPropertyStr(ctx,result,"remaining",JS_NewInt32(ctx,practice_steps));
    JS_SetPropertyStr(ctx,result,"agentControl",JS_NewBool(ctx,agent_control));
    JS_SetPropertyStr(ctx,result,"programPlaying",JS_NewBool(ctx,program_trial==2&&agent_control));
    JS_SetPropertyStr(ctx,result,"anchored",JS_NewBool(ctx,design.anchored));JS_SetPropertyStr(ctx,result,"sea",JS_NewBool(ctx,practice_sea));
    JS_SetPropertyStr(ctx,result,"maxSeparation",JS_NewFloat64(ctx,physics.max_separation));
    JSValue camera=JS_NewObject(ctx);const char *camera_keys[]={"x","y","z","yaw","pitch","distance","eyeX","eyeY","eyeZ","upX","upY","upZ","fov"};
    double camera_values[]={orbit.target.x,orbit.target.y,orbit.target.z,orbit.yaw,orbit.pitch,orbit.distance,orbit.eye.x,orbit.eye.y,orbit.eye.z,orbit.up.x,orbit.up.y,orbit.up.z,orbit.fov};
    for(int i=0;i<13;i++)JS_SetPropertyStr(ctx,camera,camera_keys[i],JS_NewFloat64(ctx,camera_values[i]));
    JS_SetPropertyStr(ctx,camera,"follow",JS_NewInt32(ctx,world_view?world_follow:0));
    JS_SetPropertyStr(ctx,result,"camera",camera);
    JSValue view=JS_NewObject(ctx);const char *view_keys[]={"x","y","width","height","focused","agentPanel"};
    int view_values[]={render_view.x,render_view.y,render_view.width,render_view.height,focus_view,agent_panel};
    for(int i=0;i<6;i++)JS_SetPropertyStr(ctx,view,view_keys[i],JS_NewInt32(ctx,view_values[i]));JS_SetPropertyStr(ctx,result,"view",view);
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
        JS_SetPropertyStr(ctx,part,"material",JS_NewInt32(ctx,b.material));JS_SetPropertyStr(ctx,part,"finish",JS_NewInt32(ctx,b.finish));
        JSValue pose=JS_NewArray(ctx);float values3[]={v.x,v.y,v.z,q.x,q.y,q.z,q.w};
        for(int j=0;j<7;j++)JS_SetPropertyUint32(ctx,pose,j,JS_NewFloat64(ctx,values3[j]));
        JS_SetPropertyStr(ctx,part,"pose",pose);
        if(physics.running){JS_SetPropertyStr(ctx,part,"angle",JS_NewFloat64(ctx,physics.parts[i].angle));JS_SetPropertyStr(ctx,part,"command",JS_NewFloat64(ctx,physics.parts[i].command));}
        JS_SetPropertyUint32(ctx,parts,i,part);
    }
    JSValue cargo=JS_NewArray(ctx);
    for(int i=0;i<physics.cargo_count;i++){
        b3Pos p=b3Body_GetPosition(physics.cargo[i].body);JSValue item=JS_NewObject(ctx);
        JS_SetPropertyStr(ctx,item,"x",JS_NewFloat64(ctx,p.x));JS_SetPropertyStr(ctx,item,"y",JS_NewFloat64(ctx,p.y));JS_SetPropertyStr(ctx,item,"z",JS_NewFloat64(ctx,p.z));JS_SetPropertyStr(ctx,item,"material",JS_NewInt32(ctx,physics.cargo[i].block.material));JS_SetPropertyUint32(ctx,cargo,i,item);
    }JS_SetPropertyStr(ctx,result,"cargo",cargo);JS_SetPropertyStr(ctx,result,"parts",parts);return result;
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
    else if(!strcmp(op,"enter_world")){enter_world();result=state(ctx);}
    else if(!strcmp(op,"world"))result=world_state(ctx);
    else if(!strcmp(op,"designs"))result=world_designs(ctx,0);
    else if(!strcmp(op,"save_design"))result=save_design(ctx);
    else if(!strcmp(op,"installed_program"))result=world_program(ctx);
    else if(!strcmp(op,"open_design")){
        int index=number(ctx,args,"id",0)-1;result=open_design(ctx,index);
        if(!JS_IsException(result)){result=state(ctx);JS_SetPropertyStr(ctx,result,"source",JS_NewString(ctx,world.designs[index].source));}
    }
    else if(!strcmp(op,"install")){result=world_install(ctx,args);if(!JS_IsException(result))world_save(ctx);}
    else if(!strcmp(op,"spawn")){result=world_release(ctx,&design,args);if(!JS_IsException(result)){world_save(ctx);dirty=1;}}
    else if(!strcmp(op,"cargo")){
        int shared=number(ctx,args,"world",0),material=number(ctx,args,"material",MATERIAL_ALLOY);double x=real(ctx,args,"x",0),z=real(ctx,args,"z",0);
        double y=real(ctx,args,"y",(shared||physics.landscape?fmaxf(terrain_height(x,z),WATER_LEVEL):0)+.65f);
        if(!isfinite(x)||!isfinite(y)||!isfinite(z)||fabs(x)>248||fabs(z)>248||y< -12||y>128||material<0||material>=MATERIAL_COUNT)result=JS_ThrowRangeError(ctx,"Cargo requires finite coordinates inside the world and a valid material");
        else if(shared){int id=world_drop_cargo(x,y,z,material);world_save(ctx);result=JS_NewInt32(ctx,id);dirty=1;}
        else if(!physics.running)result=JS_ThrowTypeError(ctx,"Reset practice before dropping cargo, or use world:true");
        else{physics_add_cargo(&physics,(Vector3){x,y,z},material);result=state(ctx);dirty=1;}
    }
    else if(!strcmp(op,"watch"))set_world_view(JS_ToBool(ctx,args));
    else if(!strcmp(op,"save"))world_save(ctx);
    else if(!strcmp(op,"snapshot")) {
        if(dirty)draw_ui();int bytes;unsigned char *png=world_view?render_capture_world(&orbit,&bytes):render_capture(&design,&physics,&orbit,&bytes);
        result=png?JS_NewArrayBufferCopy(ctx,png,bytes):JS_ThrowInternalError(ctx,"GPU frame capture failed");MemFree(png);
    }else if(!strcmp(op,"build")) {
        JSValue list=JS_GetPropertyStr(ctx,args,"parts");Character next={0};
        if(!character_from_json(ctx,list,&next))result=JS_ThrowTypeError(ctx,"Invalid blueprint: connected adjacent tree, unique cells and keys, root box, positive speed/limits required");
        else {JSValue anchored=JS_GetPropertyStr(ctx,args,"anchored");next.anchored=JS_ToBool(ctx,anchored);JS_FreeValue(ctx,anchored);world_trial_stop();program_trial=0;physics_stop(&physics);set_world_view(0);practice_steps=0;remember();character_copy(&design,&next);selected=0;home_camera();changed();result=state(ctx);}
        character_clear(&next);JS_FreeValue(ctx,list);
    }else if(!strcmp(op,"reset")){practice_sea=number(ctx,args,"sea",practice_sea)!=0;start_test();agent_control=1;practice_steps=0;memset(agent_keys,0,128);result=state(ctx);}
    else if(!strcmp(op,"advance")) {
        int steps=number(ctx,args,"steps",0);JSValue v=JS_GetPropertyStr(ctx,args,"keys");const char *pressed=JS_ToCString(ctx,v);
        if(!physics.running||!agent_control||steps<1||steps>600)result=JS_ThrowRangeError(ctx,"Reset practice first; take agent control; advance 1..600 physics steps");
        else if(pressed){
            unsigned char next[128]={0};int valid=1;
            for(const char *s=pressed;*s;s++){int key=toupper((unsigned char)*s),bound=0;
                for(int i=1;i<design.count;i++)if(block_controlled(design.blocks[i])&&(design.blocks[i].negative==key||design.blocks[i].positive==key))bound=1;
                if(key>=128||!bound){valid=0;break;}next[key]=1;
            }
            if(!valid)result=JS_ThrowTypeError(ctx,"Only assigned joint keys may be held");
            else {world_trial_stop();program_trial=0;memcpy(agent_keys,next,128);practice_steps=steps;dirty=1;}
        }
        JS_FreeCString(ctx,pressed);JS_FreeValue(ctx,v);
    }else if(!strcmp(op,"program_trial")){
        int steps=number(ctx,args,"steps",0);
        if(!design.count||steps<1||steps>18000)result=JS_ThrowRangeError(ctx,"Build a character; program trial requires 1..18000 steps");
        else{practice_sea=number(ctx,args,"sea",practice_sea)!=0;start_test();if(!world_trial_begin(&physics))result=JS_ThrowTypeError(ctx,"Install a valid controller first");else{agent_control=1;program_trial=1;practice_steps=steps;memset(agent_keys,0,128);dirty=1;}}
    }else if(!strcmp(op,"release")){memset(agent_keys,0,128);practice_steps=0;dirty=1;}
    else if(!strcmp(op,"camera")) {
        double yaw=real(ctx,args,"yaw",orbit.yaw),pitch=real(ctx,args,"pitch",orbit.pitch),distance=real(ctx,args,"distance",orbit.distance);
        double x=real(ctx,args,"x",orbit.target.x),y=real(ctx,args,"y",orbit.target.y),z=real(ctx,args,"z",orbit.target.z);
        if(!isfinite(yaw)||!isfinite(pitch)||!isfinite(distance)||!isfinite(x)||!isfinite(y)||!isfinite(z))result=JS_ThrowRangeError(ctx,"Camera coordinates must be finite");
        else {world_follow=0;orbit.yaw=yaw;orbit.pitch=Clamp(pitch,-1.5f,1.5f);orbit.distance=Clamp(distance,3,512);orbit.target=(Vector3){Clamp(x,-512,512),Clamp(y,-64,128),Clamp(z,-512,512)};orbit_update(&orbit);dirty=1;}
    }else if(!strcmp(op,"log")) {const char *s=JS_ToCString(ctx,args);if(s){log_text(s);JS_FreeCString(ctx,s);}}
    else if(!strcmp(op,"enabled")){result=JS_NewBool(ctx,agent_enabled);}
    else if(!strcmp(op,"enable")){agent_enabled=JS_ToBool(ctx,args);agent_control=agent_enabled;if(agent_enabled)agent_panel=1;layout();}
    else if(!strcmp(op,"prompt")){result=JS_NewString(ctx,pending_prompt);pending_prompt[0]=0;}
    else if(!strcmp(op,"exit")){stopping=1;}
    else result=JS_ThrowTypeError(ctx,"Unknown Game operation: %s",op);
    JS_FreeCString(ctx,op);return result;
}
static JSValue game_frame(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv) {
    double now=seconds(),dt=fmin(now-last_frame,.1);last_frame=now;events();if(stopping)return JS_FALSE;move_camera(dt);
    Creature *player=world_find(world.player);if(player){
        memset(player->controls,0,sizeof(player->controls));
        if(piloting&&!prompt_focus){for(int i=1;i<128;i++)player->controls[i]=keys[i];vehicle_controls(&player->design,player->controls,keys['W']-keys['S'],keys['D']-keys['A']);}
    }
    world_accumulator+=dt;for(int i=0;i<6&&world_accumulator>=1./60;i++){world_step();world_accumulator-=1./60;}
    follow_creature();player_camera();
    if(world.age-last_save>10){world_save(ctx);last_save=world.age;}
    if(physics.running&&(!world_view||agent_control)&&(!agent_control||practice_steps>0||program_trial==2)){
        accumulator+=dt;for(int i=0;i<6&&accumulator>=1./60;i++){
            if(agent_control&&practice_steps<=0&&program_trial!=2){accumulator=0;break;}
            if(program_trial&&agent_control){
                if(!world_trial_step(&physics,&design)){log_text("\nPractice stopped: ");log_text(world_trial_error());log_text("\n");say(world_trial_error());practice_steps=program_trial=0;memset(agent_keys,0,128);accumulator=0;break;}
                memset(agent_keys,0,128);for(int j=1;j<design.count;j++){Block b=design.blocks[j];agent_keys[b.positive]=physics.parts[j].command>0;agent_keys[b.negative]=physics.parts[j].command<0;}
            }else physics_step(&physics,&design,agent_control?agent_keys:keys);
            if(agent_control&&practice_steps>0)practice_steps--;accumulator-=1./60;
        }
        if(design.count&&!world_view){Vector3 p;Quaternion q;physics_pose(&physics,&design,0,&p,&q);orbit.target=Vector3Add(orbit.target,Vector3Subtract(p,follow_position));follow_position=p;orbit_update(&orbit);}
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
    if(!character_load(&design,"/workspace/blockwalker.character"))character_car(&design);
    selected=design.count?0:-1;home_camera();if(render_open(&surface)<0)return 1;
    printf("Blockwalker: C game, raylib UI, Box3D physics, WebGPU rendering, embedded Pi.\n");
    last_frame=updated=seconds();
    int result=dolly_quickjs_embed(1,argv,integration?"/usr/src/dolly/blockwalker/check.mjs":"/usr/src/dolly/blockwalker/agent.mjs",game_initialize);
    if(physics.running)report();character_save(&design,"/workspace/blockwalker.character");physics_stop(&physics);world_close();render_close();dolly_display_release(surface.generation);character_clear(&design);for(int i=0;i<undo_count;i++)character_clear(&undo[i]);return result;
}
