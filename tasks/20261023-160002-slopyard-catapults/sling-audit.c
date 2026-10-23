// Sling audit: run.mjs OUT sling-audit.c SECONDS [WORLD.lua] (run.mjs is beside
// the living-world task). Runs the fresh catalog for SECONDS and prints, per gun
// (Tengu, Hosen, roof sling, roof battery): seconds in each phase, loads, shots,
// misloads, rounds dropped while spinning, the longest time holding a round
// unfired with its status, contact with its own loader and with other friendly
// machines (seconds and peak force); each shot, and what each round touches in
// the 10 s after it leaves the arm.
#include "world.c"
#include <assert.h>

enum {PHASES=5,ROUNDS=64};
static const char *phases[PHASES]={"wait","load","spin","hold","return"};
typedef struct {int id,shots,misloads,loads,drops,was_loaded,friendly,round,touched;double touch_force,touch_time;double reported,in_sight,in_sight_low,seconds[PHASES],held,longest_held,loader_contact,loader_force,friendly_contact,friendly_force;char phase[16],held_status[64];} Gun;
typedef struct {int round,gun,target,team,touched[8],touches;double until;} Round;
static Gun guns[16];static int gun_count;
static Round rounds[ROUNDS];static int round_count;

static int is_gun(const Creature *c){return strstr(c->name,"Tengu")||strstr(c->name,"Hosen /")||strstr(c->name,"roof sling")||strstr(c->name,"roof battery");}
static double memory_number(const Creature *c,const char *key){
    Data *ctx=c->controller->ctx;Value v=value_get(ctx,c->controller->memory,key);double n=0;value_double(ctx,&n,v);value_free(ctx,v);return n;
}
static void memory_text(const Creature *c,const char *key,char *out,size_t size){
    Data *ctx=c->controller->ctx;Value v=value_get(ctx,c->controller->memory,key);out[0]=0;
    if(value_is_string(v)){const char *text=value_text(ctx,v);snprintf(out,size,"%s",text);value_text_free(ctx,text);}value_free(ctx,v);
}
static double memory_field(const Creature *c,const char *table,const char *key){
    Data *ctx=c->controller->ctx;Value t=value_get(ctx,c->controller->memory,table),v=value_get(ctx,t,key);double n=0;value_double(ctx,&n,v);value_free(ctx,v);value_free(ctx,t);return n;
}
static b3Pos magnet_pole(const Creature *c){
    for(int k=0;k<c->design.count;k++)if(c->design.blocks[k].joint==BLOCK_MAGNET)return physics_position(&c->physics.parts[k]);
    return (b3Pos){0};
}
// Teammates near a gun that holds a round in its load phase, or holds fire with a target.
static void report_clearance(const Creature *gun){
    b3Pos g=b3Body_GetPosition(gun->physics.parts[0].body);
    for(int i=0;i<world.count;i++){Creature *o=&world.creatures[i];if(o==gun||o->team!=gun->team||o->cargo)continue;
        b3Pos p=b3Body_GetPosition(o->physics.parts[0].body);NeighborBounds b=creature_bounds(o,p);float gap=hypotf(p.x-g.x,p.z-g.z)-b.radius;
        if(gap<9)printf("SLING t %.2f %s: teammate %d %s at (%.1f,%.1f,%.1f) gap %.1f m, radius %.1f, height %.1f..%.1f\n",world.age,gun->name,o->id,o->name,p.x,p.y,p.z,gap,b.radius,b.low,b.high);}
}
// Seconds with an enemy machine in the combat zone within 48 m that flies more than 5 m
// above the gun's own floor (the program's rule), and more than 5 m above the ground.
static void count_targets(Gun *g,const Creature *gun){
    b3Pos at=b3Body_GetPosition(gun->physics.parts[0].body);float floor=terrain_floor((Vector3){at.x,at.y,at.z});int high=0,low=0;
    for(int i=0;i<world.count;i++){Creature *o=&world.creatures[i];if(!o->team||o->team==gun->team||o->cargo||o->design.anchored||o->held_by||o->error[0])continue;
        b3Pos p=b3Body_GetPosition(o->physics.parts[0].body);NeighborBounds b=creature_bounds(o,p);
        if(fabsf(p.x)>terrain_combat_half_x(terrain_version)||fabsf(p.z)>COMBAT_HALF_Z||hypotf(hypotf(p.x-at.x,p.z-at.z),p.y-at.y)-b.radius>48)continue;
        if(b.low>floor+5)high=1;else if(b.low>5)low=1;}
    g->in_sight+=high/60.;g->in_sight_low+=(low&&!high)/60.;
}
typedef struct {int id;char phase[16];double lowest,releases;} Tether;static Tether tethers[8];static int tether_count;
// Each tether round's lifecycle: ready, deploy (caught an aircraft), caught, haul, release, recover.
static void track_tether(const Creature *c){
    Tether *t=NULL;for(int i=0;i<tether_count;i++)if(tethers[i].id==c->id)t=&tethers[i];
    if(!t){if(tether_count==8)return;t=&tethers[tether_count++];*t=(Tether){.id=c->id};}
    char phase[16];memory_text(c,"phase",phase,sizeof(phase));
    // How low the captured machine comes while the round holds it.
    Creature *held=world_find(memory_number(c,"target"));
    if(held&&(!strcmp(phase,"deploy")||!strcmp(phase,"caught")||!strcmp(phase,"haul"))){NeighborBounds b=creature_bounds(held,b3Body_GetPosition(held->physics.parts[0].body));if(b.low<t->lowest)t->lowest=b.low;}
    if(!strcmp(t->phase,"ready")&&!strcmp(phase,"deploy"))t->lowest=1e9;
    if(strcmp(phase,t->phase)&&!strcmp(phase,"release"))printf("SLING t %.2f tether %d lets go of %d, %s; its bottom came down to %.1f m\n",world.age,c->id,(int)memory_number(c,"target"),memory_number(c,"releases")>t->releases?"on the ground":"still aloft",t->lowest);
    t->releases=memory_number(c,"releases");
    if(strcmp(phase,t->phase)){b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
        printf("SLING t %.2f tether %d %s -> %s at (%.1f,%.1f,%.1f), captures %.0f, target %.0f\n",world.age,c->id,t->phase,phase,p.x,p.y,p.z,memory_number(c,"captures"),memory_number(c,"target"));
        snprintf(t->phase,sizeof(t->phase),"%s",phase);}
}
static int held_round(const Creature *c){
    for(int k=0;k<c->design.count;k++)if(c->design.blocks[k].joint==BLOCK_MAGNET&&b3Body_IsValid(c->physics.parts[k].magnet_target)){Creature *o=body_owner(c->physics.parts[k].magnet_target);return o?o->id:0;}
    return 0;
}
typedef struct {int gun,id;double force;b3BodyId head;} RoundTouch;
// The strongest contact of a spinning round with anything but its own gun.
static void round_contact(void *context,const Creature *other,double force){RoundTouch *t=context;if(force>t->force){t->id=other?other->id:-1;t->force=force;}}
// Calls touch(other, force) for every creature in contact with c's bodies.
static void contacts(const Creature *c,void (*touch)(void *,const Creature *,double),void *context){
    b3ContactData list[256];
    for(int i=0;i<c->physics.count;i++)if(c->physics.parts[i].owner==i){
        b3BodyId body=c->physics.parts[i].body;int count=b3Body_GetContactData(body,list,256);
        for(int j=0;j<count;j++){
            b3BodyId a=b3Shape_GetBody(list[j].shapeIdA),b=b3Shape_GetBody(list[j].shapeIdB),peer=B3_ID_EQUALS(a,body)?b:a;Creature *other=body_owner(peer);
            if(other==c||touch==round_contact&&B3_ID_EQUALS(peer,((RoundTouch *)context)->head))continue;double force=0;
            for(int k=0;k<list[j].manifoldCount;k++)for(int n=0;n<list[j].manifolds[k].pointCount;n++)force+=480*list[j].manifolds[k].points[n].normalImpulse;
            if(force>0&&(other||touch==round_contact))touch(context,other,force);
        }
    }
}
typedef struct {const Creature *gun;int loader,round,friendly;double loader_force,friendly_force;} GunTouch;
static void gun_touch(void *context,const Creature *other,double force){
    GunTouch *t=context;
    if(other->id==t->loader){if(force>t->loader_force)t->loader_force=force;}
    else if(other->id!=t->round&&other->team==t->gun->team&&!other->cargo&&force>t->friendly_force){t->friendly_force=force;t->friendly=other->id;}
}
static void round_touch(void *context,const Creature *other,double force){
    Round *r=context;for(int i=0;i<r->touches;i++)if(r->touched[i]==other->id)return;
    if(other->id==r->gun||r->touches==8)return;r->touched[r->touches++]=other->id;
    printf("SLING t %.2f round %d touches %d %s team %d%s%s, %.0f N\n",world.age,r->round,other->id,other->name,other->team,
        other->team&&other->team!=r->team?" ENEMY":other->team==r->team?" FRIENDLY":"",other->id==r->target?" TARGET":"",force);
}
static void step(void){
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];if(!c->controller)continue;
        if(strstr(c->name,"Kusari"))track_tether(c);
        if(!is_gun(c))continue;
        Gun *g=NULL;for(int k=0;k<gun_count;k++)if(guns[k].id==c->id)g=&guns[k];
        if(!g){assert(gun_count<16);g=&guns[gun_count++];*g=(Gun){.id=c->id,.reported=-1000};}
        char phase[16];memory_text(c,"phase",phase,sizeof(phase));
        for(int k=0;k<PHASES;k++)if(!strcmp(phase,phases[k]))g->seconds[k]+=1./60;
        int round=held_round(c),shots=memory_number(c,"shots"),misloads=memory_number(c,"misloads"),loaded=round&&(!strcmp(phase,"spin")||!strcmp(phase,"hold"));
        if(loaded&&!g->was_loaded)g->loads++;
        if(g->was_loaded&&!round&&!strcmp(g->phase,"spin")&&shots==g->shots){g->drops++;Creature *a=world_find(g->round),*o=g->touched>0?world_find(g->touched):NULL;
            printf("SLING t %.2f %s drops round %d %s while spinning; last contact %s %.0f N %.2f s before\n",world.age,c->name,g->round,a?a->name:"?",o?o->name:g->touched<0?"terrain":"none",g->touch_force,world.age-g->touch_time);}
        if(round&&round!=g->round){g->round=round;g->touched=0;g->touch_force=0;Creature *a=world_find(round);
            if(a&&a->design.count>1){b3Pos r=b3Body_GetPosition(a->physics.parts[0].body),pole=magnet_pole(c);printf("SLING t %.2f %s grips round %d %s %.2f m from its magnet\n",world.age,c->name,round,a->name,hypotf(hypotf(r.x-pole.x,r.y-pole.y),r.z-pole.z));}}
        if(round&&!strcmp(phase,"spin")){Creature *a=world_find(round);RoundTouch touch={c->id};for(int k=0;k<c->design.count;k++)if(c->design.blocks[k].joint==BLOCK_MAGNET)touch.head=c->physics.parts[k].body;if(a)contacts(a,round_contact,&touch);if(touch.id){g->touched=touch.id;g->touch_force=touch.force;g->touch_time=world.age;}}
        g->was_loaded=loaded;
        if(misloads>g->misloads){
            Creature *a=world_find(memory_number(c,"ammo"));b3Pos pole=magnet_pole(c),at=a?b3Body_GetPosition(a->physics.parts[0].body):(b3Pos){0};
            printf("SLING t %.2f %s misload %d: ammo %d %s at (%.2f,%.2f,%.2f) held by %d, pole at (%.2f,%.2f,%.2f)\n",world.age,c->name,misloads,a?a->id:0,a?a->name:"?",at.x,at.y,at.z,a?a->held_by:0,pole.x,pole.y,pole.z);
        }
        if(shots>g->shots){
            int ammo=memory_field(c,"lastShot","cargo"),target=memory_field(c,"lastShot","target");Creature *t=world_find(target),*a=world_find(ammo);
            printf("SLING t %.2f %s shot %d: round %d %s at %d %s, predicted miss %.2f m, flight %.2f s\n",world.age,c->name,shots,ammo,a?a->name:"?",target,t?t->name:"?",memory_field(c,"lastShot","error"),memory_field(c,"lastShot","flight"));
            if(round_count<ROUNDS)rounds[round_count++]=(Round){.round=ammo,.gun=c->id,.target=target,.team=c->team,.until=world.age+10};
        }
        g->shots=shots;g->misloads=misloads;snprintf(g->phase,sizeof(g->phase),"%s",phase);
        if(round&&(!strcmp(phase,"load")||!strcmp(phase,"hold")&&memory_number(c,"target"))&&g->held>20&&world.age-g->reported>120){g->reported=world.age;report_clearance(c);}
        if(round&&strcmp(phase,"spin")){g->held+=1./60;if(g->held>g->longest_held){g->longest_held=g->held;world_creature_status(c->id,g->held_status,sizeof(g->held_status));}}else g->held=0;
        count_targets(g,c);
        GunTouch touch={c,memory_number(c,"loader"),round};contacts(c,gun_touch,&touch);
        if(touch.loader_force>0){g->loader_contact+=1./60;if(touch.loader_force>g->loader_force)g->loader_force=touch.loader_force;}
        if(touch.friendly_force>0){g->friendly_contact+=1./60;if(touch.friendly_force>g->friendly_force){g->friendly_force=touch.friendly_force;g->friendly=touch.friendly;}}
    }
    for(int i=0;i<round_count;i++){Round *r=&rounds[i];Creature *c=world_find(r->round);if(c&&world.age<r->until)contacts(c,round_touch,r);}
}
int main(int argc,char **argv){
    double seconds=argc>1?atof(argv[1]):2400;Data *ctx=data_new(256*1024*1024);
    if(rename("/workspace/audit-in.lua","/workspace/slopyard-world.lua"))unlink("/workspace/slopyard-world.lua");
    world_load(ctx);double start=world.age;printf("SLING start t %.1f: %d actors, terrain %d\n",start,world.count,terrain_version);
    for(long tick=1;world.age-start<seconds;tick++){
        world_step();step();
        if(tick%(300*60)==0){int shots=0;for(int k=0;k<gun_count;k++)shots+=guns[k].shots;printf("SLING t %.0f: %d shots, %d deliveries, East %d West %d, removals %d\n",world.age,shots,world.delivery_count,world_team_score(1),world_team_score(2),world.deaths);}
    }
    for(int k=0;k<gun_count;k++){
        Gun *g=&guns[k];Creature *c=world_find(g->id);char status[64]="";if(c)world_creature_status(c->id,status,sizeof(status));
        printf("GUN %3d %-28s shots %2d loads %2d misloads %2d drops %d | wait %4.0f load %4.0f spin %4.0f hold %4.0f return %4.0f s | held unfired %4.0f s '%s' | loader contact %5.1f s %4.0f N | friendly contact %5.1f s %4.0f N (%d) | enemy aircraft in sight %4.0f s, only below the gun's floor + 5 m %4.0f s | now '%s'%s%s\n",
            g->id,c?c->name:"(removed)",g->shots,g->loads,g->misloads,g->drops,g->seconds[0],g->seconds[1],g->seconds[2],g->seconds[3],g->seconds[4],g->longest_held,g->held_status,
            g->loader_contact,g->loader_force,g->friendly_contact,g->friendly_force,g->friendly,g->in_sight,g->in_sight_low,status,c&&c->error[0]?" ERROR ":"",c?c->error:"");
    }
    for(int k=0;k<gun_count;k++){Creature *g=world_find(guns[k].id);if(!g)continue;b3Pos at=b3Body_GetPosition(g->physics.parts[0].body);
        for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
            if(c->cargo&&hypotf(p.x-at.x,p.z-at.z)<20&&fabsf(p.y-at.y)<6)printf("STOCK %s: %d %s at (%.1f,%.1f,%.1f) held by %d\n",g->name,c->id,c->name,p.x,p.y,p.z,c->held_by);}}
    for(int i=0;i<tether_count;i++){Creature *c=world_find(tethers[i].id);if(c&&c->controller)printf("TETHER %d captures %.0f grounded releases %.0f released aloft %.0f now '%s'\n",c->id,memory_number(c,"captures"),memory_number(c,"releases"),memory_number(c,"aborts"),tethers[i].phase);}
    for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];if(strncmp(c->name,"Koban",5)||!c->controller)continue;char status[64];world_creature_status(c->id,status,sizeof(status));
        printf("LOADER %3d %-22s jobs %2.0f failures %2.0f now '%s'\n",c->id,c->name,memory_number(c,"jobs"),memory_number(c,"failures"),status);}
    world_close();data_close(ctx);return 0;
}
