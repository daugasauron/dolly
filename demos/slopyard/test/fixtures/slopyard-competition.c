#include "world.c"
#include <assert.h>

static int crowded_cranes,quay_waited;
static void delay_freight(Data *ctx,Value item,int team){
    Value value=value_get(ctx,item,"source");const char *source=value_text(ctx,value);assert(source);
    size_t size=strlen(source)+128;char *wrapped=malloc(size);assert(wrapped);
    snprintf(wrapped,size,"local run=(function() %s end)();return function(t,s,m,r) if not m.released then return {} end;return run(t,s,m,r) end",source);
    value_set(ctx,item,"source",value_string(ctx,wrapped));free(wrapped);value_text_free(ctx,source);value_free(ctx,value);
    put_number(ctx,item,"x",team==1?-32:-64);put_number(ctx,item,"z",130);
}
static int wait_at_quay(Data *ctx){
    static double held;
    if(quay_waited)return 0;
    Creature *hauler=world_find(2);assert(hauler);b3Pos p=b3Body_GetPosition(hauler->physics.parts[0].body);
    int pad=0,carried=0;
    for(int i=0;i<world.count;i++){
        Creature *c=&world.creatures[i];if(c->supply!=2)continue;
        if(magnet_holds(hauler,c))carried=c->id;
        else{b3Pos box=b3Body_GetPosition(c->physics.parts[0].body);if(hypot(box.x+42,box.z-110.5)<3.5)pad++;}
    }
    assert(pad<=1);
    b3Vec3 v=b3Body_GetLinearVelocity(hauler->physics.parts[0].body);
    if(pad&&carried&&hypot(p.x+42,p.z-98)<.5&&hypot(v.x,v.z)<.1)held+=1./60;else held=0;
    if(held<5)return 0;
    assert(b3RotateVector(b3Body_GetRotation(hauler->physics.parts[0].body),b3Vec3_axisY).y>.95f);
    assert(world_save(ctx));world_close();world_load(ctx);
    for(int id=4;id<=5;id++){Controller *c=world_find(id)->controller;value_set(c->ctx,c->memory,"released",value_bool(c->ctx,1));}
    printf("QUAY: loaded hauler waited five seconds behind occupied pad; boats released after reload at %.3f seconds\n",world.age);
    quay_waited=1;return 1;
}
static int crowd_crane(Data *ctx,int tick){
    static int active,start,mask,cargo,clutter[13];
    if(!active)for(int i=0;i<3;i++){
        Creature *c=world_find(i?i+5:3);assert(c);
        Value label=value_get(c->controller->ctx,c->controller->memory,"phase");const char *phase=value_text(c->controller->ctx,label);
        int ready=!(crowded_cranes&(1<<i))&&phase&&!strcmp(phase,"settle");value_text_free(c->controller->ctx,phase);value_free(c->controller->ctx,label);
        if(!ready)continue;
        active=c->id;start=tick;mask=1<<i;cargo=get_number(c->controller->ctx,c->controller->memory,"job",0);assert(magnet_holds(c,world_find(cargo)));
        b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);
        for(int j=0;j<13;j++)clutter[j]=world_drop_cargo(p.x+.2f,80+j*2,p.z+.2f,MATERIAL_ALLOY);
        break;
    }
    if(!active)return 0;
    Creature *c=world_find(active);assert(c&&magnet_holds(c,world_find(cargo)));
    if(tick>start+2){
        Value sensors=physics_sensors(ctx,&c->physics,&c->design,1./30),nearby=value_get(ctx,sensors,"nearby");
        for(int i=0;i<get_number(ctx,nearby,"length",0);i++){Value item=value_at(ctx,nearby,i);assert(get_number(ctx,item,"id",0)!=cargo);value_free(ctx,item);}
        value_free(ctx,nearby);value_free(ctx,sensors);
        for(int i=1;i<c->design.count;i++)if(block_controlled(c->design.blocks[i])&&c->design.blocks[i].joint!=BLOCK_MAGNET)assert(fabsf(c->physics.parts[i].command)<.00001f);
    }
    if(tick==start+60){assert(world_save(ctx));world_close();world_load(ctx);return 1;}
    if(tick==start+120){
        for(int j=0;j<13;j++)for(int i=0;i<world.count;i++)if(world.creatures[i].id==clutter[j]){
            Creature *c=&world.creatures[i];physics_stop(&c->physics);character_clear(&c->design);controller_free(c->controller);world.creatures[i]=world.creatures[--world.count];break;
        }
        printf("CRANE %d retained pallet %d through missing observations and reload\n",active,cargo);crowded_cranes|=mask;active=0;
    }
    return 0;
}

int main(void){
    Data *ctx=data_new(256*1024*1024);terrain_select(1);
    const char *names[]={"Foundry / twin-ram ore lift","Foundry / telescopic hauler","Quay / loading crane","Freighter East / island barge","Freighter West / island barge","East / receiving crane","West / receiving crane"};
    Value catalog=read_catalog(ctx),selected=value_array(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        Value item=value_at(ctx,catalog,i),label=value_get(ctx,item,"name");const char *name=value_text(ctx,label);
        for(int j=0;j<7;j++)if(name&&!strcmp(name,names[j]))value_set_at(ctx,selected,j,value_copy(ctx,item));
        value_text_free(ctx,name);value_free(ctx,label);value_free(ctx,item);
    }
    for(int j=3;j<=4;j++){Value item=value_at(ctx,selected,j);delay_freight(ctx,item,j-2);value_free(ctx,item);}
    load_designs(ctx,selected,1);value_free(ctx,selected);value_free(ctx,catalog);assert(world.count==7);
    int parcel=world_drop_cargo(-49.79f,.5f,51.17f,MATERIAL_ALLOY);assert(parcel);world_find(parcel)->supply=1;
    world.supply_seed=42;world.next_parcel=100000;
    int stages[128]={0},teams[128]={0},restarts=0;float minimum_up=1,separation=0;double progress=0;
    for(int tick=0;tick<2400*60;tick++){
        world_step();if(world.deaths)break;
        restarts+=wait_at_quay(ctx);restarts+=crowd_crane(ctx,tick);
        for(int i=0;i<world.count;i++){
            Creature *c=&world.creatures[i];separation=fmaxf(separation,c->physics.max_separation);
            if(c->id==4||c->id==5)minimum_up=fminf(minimum_up,b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y);
            if(c->supply!=2)continue;assert(c->id<128);int id=c->id,carrier=c->held_by,previous=stages[id];
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
    assert(world_find(parcel)&&!world_find(parcel)->delivered&&!magnet_holds(world_find(2),world_find(parcel)));
    printf("FREIGHT: %.3f seconds, East %d / West %d, %d reloads, %d removals, minimum barge up %.5f, maximum joint separation %.5f\n",world.age,world_team_score(1),world_team_score(2),restarts,world.deaths,minimum_up,separation);fflush(stdout);
    assert(world_team_score(1)>=16&&world_team_score(2)>=16&&restarts&&!world.deaths&&minimum_up>.9f&&separation<.12f&&crowded_cranes==7&&quay_waited);
    for(int i=0;i<world.delivery_count;i++){
        Delivery *d=&world.deliveries[i];assert(d->cargo<128&&stages[d->cargo]==31&&d->points==8&&depots[d->depot].team==teams[d->cargo]);
        printf("PALLET %d: lift / hauler / loading crane / team %d barge / receiving crane / scored at %.3f seconds\n",d->cargo,teams[d->cargo],d->time);
    }
    world_close();data_close(ctx);return 0;
}
