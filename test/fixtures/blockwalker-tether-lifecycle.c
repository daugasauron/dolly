#include "world.c"
#include <assert.h>

static int catalog_spawn(Data *ctx,Value catalog,const char *program,int team,float x,float y,float z){
    for(int i=0;i<value_length(ctx,catalog);i++){
        Value item=value_at(ctx,catalog,i),path=value_get(ctx,item,"program");const char *file=value_text(ctx,path);
        int matches=file&&!strcmp(file,program)&&get_number(ctx,item,"team",0)==team;
        value_text_free(ctx,file);value_free(ctx,path);
        if(!matches){value_free(ctx,item);continue;}
        Character design={0};Value blocks=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source"),payload=value_get(ctx,item,"cargo"),anchor=value_get(ctx,item,"anchored");
        assert(read_character(ctx,blocks,&design,0));design.anchored=value_truth(ctx,anchor);const char *source=value_text(ctx,code);assert(source);
        Creature *c=spawn(&design,source,program,world.count+1,get_number(ctx,item,"hz",20),x,z);assert(c);
        c->team=team;if(value_is_bool(payload))c->cargo=value_truth(ctx,payload);if(isfinite(y))set_spawn_height(c,y);int id=c->id;
        character_clear(&design);value_text_free(ctx,source);value_free(ctx,blocks);value_free(ctx,code);value_free(ctx,payload);value_free(ctx,anchor);value_free(ctx,item);return id;
    }
    assert(!"Missing canonical tether design");return 0;
}
int main(void){
    Data *ctx=data_new(256*1024*1024);assert(ctx);terrain_select(6);Value catalog=read_catalog(ctx);
    /* Begin with an airborne near-contact, not an installed magnet attachment. */
    int round_id=catalog_spawn(ctx,catalog,"programs/kusari-tether-round.lua",1,18,20,6.63f);
    int flyer_id=catalog_spawn(ctx,catalog,"programs/east-air-courier.lua",2,18,20,10);
    int tug_id=catalog_spawn(ctx,catalog,"programs/kanagu-cable-tug.lua",1,18,NAN,0);value_free(ctx,catalog);
    world.supply_seed=0x243f6a88;world.next_parcel=45;world.next_ore=5;world.next_mine=10;
    Creature *round=world_find(round_id);int rope=-1;
    for(int i=0;i<round->design.count;i++)if(round->design.blocks[i].joint==BLOCK_WINCH)rope=i;
    assert(rope>=0&&round->physics.parts[rope].winch_length<1.1f);
    assert(!magnet_holds(round,world_find(flyer_id))&&!magnet_holds(world_find(tug_id),round));
    int captured=0,previous=0,handle_held=0,released=0,last_support=-10000,recovered=0,recovery_ticks=0,resumed_work=0;
    float payout=0,gravity=b3Length(b3World_GetGravity(world.physics));
    for(int tick=0;tick<360*60;tick++){
        world_step();assert(!world.deaths);
        for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];if(c->error[0])fprintf(stderr,"%s: %s\n",c->name,c->error);assert(!c->error[0]);}
        round=world_find(round_id);Creature *flyer=world_find(flyer_id),*tug=world_find(tug_id);assert(round&&flyer&&tug);
        int attached=magnet_holds(round,flyer);captured|=attached;payout=fmaxf(payout,round->physics.parts[rope].winch_length);
        if(attached&&!previous)printf("TETHER captured at %.3f s\n",world.age);
        for(int i=0;i<tug->design.count;i++)if(b3Body_IsValid(tug->physics.parts[i].magnet_target)&&B3_ID_EQUALS(tug->physics.parts[i].magnet_target,round->physics.parts[rope].body)){
            b3Pos p=physics_position(&round->physics.parts[rope]);
            if(attached&&p.y<terrain_floor((Vector3){p.x,p.y,p.z})+2)handle_held=1;
        }
        b3Pos p=b3Body_GetPosition(flyer->physics.parts[0].body);float floor=terrain_floor((Vector3){p.x,p.y,p.z});
        if(attached&&creature_bounds(flyer,p).low<floor+1.5f&&cargo_support_force(flyer,&round->physics)>creature_mass(flyer)*gravity*.2f)last_support=tick;
        if(previous&&!attached){
            Value report=value_get(round->controller->ctx,round->controller->memory,"lastRelease"),supported=value_get(round->controller->ctx,report,"grounded");
            int grounded=value_truth(round->controller->ctx,supported);value_free(round->controller->ctx,supported);value_free(round->controller->ctx,report);
            assert(grounded&&tick-last_support<180);released=1;printf("TETHER physically supported release at %.3f s\n",world.age);
        }
        float up=b3RotateVector(b3Body_GetRotation(flyer->physics.parts[0].body),b3Vec3_axisY).y;
        recovery_ticks=released&&!flyer->held_by&&up>.9f&&p.y>floor+8?recovery_ticks+1:0;
        if(recovery_ticks>=120)recovered=1;
        if(released)for(int i=0;i<world.count;i++)if(world.creatures[i].supply&&magnet_holds(flyer,&world.creatures[i]))resumed_work=1;
        previous=attached;
    }
    printf("TETHER lifecycle: captured=%d payout=%.3f groundHandleHeld=%d supportedRelease=%d sustainedFlight=%d resumedCargo=%d\n",captured,payout,handle_held,released,recovered,resumed_work);
    assert(captured&&payout>10&&handle_held&&released&&recovered);
    world_close();data_close(ctx);return 0;
}
