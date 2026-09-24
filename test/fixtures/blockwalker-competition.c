#include "world.c"
#include <assert.h>

int main(void){
    JSRuntime *rt=JS_NewRuntime();JSContext *ctx=JS_NewContext(rt);terrain_select(1);
    const char *names[]={"Foundry / twin-ram ore lift","Foundry / telescopic hauler","Quay / loading crane","Freighter East / island barge","Freighter West / island barge","East / receiving crane","West / receiving crane"};
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        for(int j=0;j<7;j++)if(name&&!strcmp(name,names[j]))JS_SetPropertyUint32(ctx,selected,j,JS_DupValue(ctx,item));
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==7);
    world.supply_seed=42;world.next_parcel=100000;
    int stages[128]={0},teams[128]={0},restarts=0;float minimum_up=1,separation=0;double progress=0;
    for(int tick=0;tick<1800*60;tick++){
        world_step();if(world.deaths)break;
        for(int i=0;i<world.count;i++){
            Creature *c=&world.creatures[i];separation=fmaxf(separation,c->physics.max_separation);
            if(c->id==4||c->id==5)minimum_up=fminf(minimum_up,b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y);
            if(!c->cargo)continue;assert(c->id<128);int id=c->id,carrier=c->held_by,previous=stages[id];
            if(carrier==1)stages[id]|=1;
            if(carrier==2){assert(stages[id]&1);stages[id]|=2;}
            if(carrier==3){assert(stages[id]&2);stages[id]|=4;}
            if(carrier==4||carrier==5){assert(stages[id]&4);stages[id]|=8;teams[id]=carrier-3;}
            if(carrier==6||carrier==7){assert((stages[id]&8)&&teams[id]==carrier-5);stages[id]|=16;}
            if(stages[id]!=previous)progress=world.age;
        }
        if((world_team_score(1)>=16&&world_team_score(2)>=16)||world.age-progress>400)break;
        if(tick&&tick%(197*60)==0){assert(world_save(ctx));world_close();world_load(ctx);restarts++;}
    }
    assert(world_save(ctx));
    printf("FREIGHT: %.3f seconds, East %d / West %d, %d reloads, %d removals, minimum barge up %.5f, maximum joint separation %.5f\n",world.age,world_team_score(1),world_team_score(2),restarts,world.deaths,minimum_up,separation);fflush(stdout);
    assert(world_team_score(1)>=16&&world_team_score(2)>=16&&restarts&&!world.deaths&&minimum_up>.9f&&separation<.12f);
    for(int i=0;i<world.delivery_count;i++){
        Delivery *d=&world.deliveries[i];assert(d->cargo<128&&stages[d->cargo]==31&&d->points==8&&depots[d->depot].team==teams[d->cargo]);
        printf("PALLET %d: lift / hauler / loading crane / team %d barge / receiving crane / scored at %.3f seconds\n",d->cargo,teams[d->cargo],d->time);
    }
    world_close();JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
