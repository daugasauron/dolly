// Living-world audit: run.mjs OUT audit.c SECONDS [WORLD.lua]
// Runs the fresh catalog (or WORLD.lua) for SECONDS of simulation and prints,
// per actor: path length, magnet grips, deliveries, uprightness, the longest
// time fallen (up < .5) and the longest time stationary while holding
// something, with the controller status at that moment and its counters.
#include "world.c"
#include <assert.h>
#include <ctype.h>

typedef struct {int id,was_holding,grips;double path,still,longest_still,fallen,longest_fallen,min_up;char stall[64];Vector3 last,stall_at;} Track;
static Track tracks[1024];static int track_count;
static Track *track(const Creature *c){
    for(int i=0;i<track_count;i++)if(tracks[i].id==c->id)return &tracks[i];
    assert(track_count<1024);Track *t=&tracks[track_count++];b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
    *t=(Track){.id=c->id,.min_up=1,.last={p.x,p.y,p.z}};return t;
}
static float up(const Creature *c){Vector3 p;Quaternion q;physics_pose(&c->physics,&c->design,0,&p,&q);return Vector3RotateByQuaternion((Vector3){0,1,0},q).y;}
static int holding(const Creature *c){for(int k=0;k<c->design.count;k++)if(b3Body_IsValid(c->physics.parts[k].magnet_target))return 1;return 0;}
static void sample(void){
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];if(c->cargo)continue;Track *t=track(c);b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
        double moved=hypot(p.x-t->last.x,p.z-t->last.z);t->path+=moved;t->last=(Vector3){p.x,p.y,p.z};
        float u=up(c);if(u<t->min_up)t->min_up=u;
        t->fallen=u<.5f?t->fallen+1:0;if(t->fallen>t->longest_fallen)t->longest_fallen=t->fallen;
        int h=holding(c);t->grips+=h&&!t->was_holding;t->was_holding=h;
        t->still=h&&moved<.05?t->still+1:0;
        if(t->still>t->longest_still){t->longest_still=t->still;world_creature_status(c->id,t->stall,sizeof(t->stall));t->stall_at=t->last;}
    }
}
// Whole-number counters in the controller's memory whose names suggest work done.
static void counters(const Creature *c,char *out,size_t size){
    static const char *words[]={"shot","captur","deliver","job","trip","handoff","rescue","recover","pick","report"};
    out[0]=0;lua_State *L=c->controller->ctx->lua;value_push(c->controller->ctx,c->controller->memory);size_t used=0;
    for(lua_pushnil(L);lua_next(L,-2);lua_pop(L,1)){
        if(lua_type(L,-2)!=LUA_TSTRING||lua_type(L,-1)!=LUA_TNUMBER)continue;
        const char *key=lua_tostring(L,-2);double v=lua_tonumber(L,-1);char lower[64];size_t n=0;
        for(;key[n]&&n<63;n++)lower[n]=tolower((unsigned char)key[n]);lower[n]=0;
        int match=0;for(unsigned w=0;w<sizeof(words)/sizeof(*words);w++)match|=strstr(lower,words[w])!=NULL;
        if(match&&v==floor(v)&&v>0&&v<1e6&&used+48<size)used+=snprintf(out+used,size-used,"%s=%.0f ",key,v);
    }lua_pop(L,1);
}
int main(int argc,char **argv){
    double seconds=argc>1?atof(argv[1]):2400;Data *ctx=data_new(256*1024*1024);
    if(rename("/workspace/audit-in.lua","/workspace/slopyard-world.lua"))unlink("/workspace/slopyard-world.lua");
    world_load(ctx);double start=world.age;printf("AUDIT start t %.1f: %d actors, terrain %d\n",start,world.count,terrain_version);
    for(long tick=1;world.age-start<seconds;tick++){
        world_step();if(tick%60==0)sample();
        if(tick%(300*60)==0)printf("AUDIT t %.0f: %d actors, %d deliveries, East %d West %d, removals %d\n",world.age,world.count,world.delivery_count,world_team_score(1),world_team_score(2),world.deaths);
    }
    printf("AUDIT end t %.1f: %d actors, %d deliveries, East %d West %d, removals %d\n",world.age,world.count,world.delivery_count,world_team_score(1),world_team_score(2),world.deaths);
    for(int i=0;i<world.delivery_count;i++){Delivery *d=&world.deliveries[i];printf("DELIVERY t %.1f cargo %d by %d %s to %s, %d points\n",d->time,d->cargo,d->carrier,d->name,depots[d->depot].name,d->points);}
    for(int i=0;i<world.removal_count;i++){Removal *r=&world.removals[i];printf("REMOVAL %d %s t %.1f %s\n",r->id,r->name,r->time,r->detail);}
    for(int i=0;i<track_count;i++){
        Track *t=&tracks[i];Creature *c=world_find(t->id);char status[64]="",work[512]="";
        if(c){world_creature_status(c->id,status,sizeof(status));counters(c,work,sizeof(work));}
        printf("ACTOR %3d %-34s team %d path %7.1f grips %3d delivered %2d up %6.3f min %6.3f fallen %4.0f/%4.0f held-still %4.0f/%4.0f '%s' at (%.1f,%.1f,%.1f) now '%s' {%s}%s%s\n",
            t->id,c?c->name:"(removed)",c?c->team:0,t->path,t->grips,world_cargo_score(t->id),c?up(c):NAN,t->min_up,t->fallen,t->longest_fallen,t->still,t->longest_still,
            t->stall,t->stall_at.x,t->stall_at.y,t->stall_at.z,status,work,c&&c->error[0]?" ERROR ":"",c?c->error:"");
    }
    assert(world_save(ctx));rename("/workspace/slopyard-world.lua","/workspace/audit-out.lua");world_close();data_close(ctx);return 0;
}
