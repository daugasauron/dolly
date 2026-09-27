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
static int retrieval_ready(Creature *round,Creature *tug,int rope,float gravity){
    if(round->held_by||magnet_holds(tug,round)||b3Length(physics_velocity(&round->physics.parts[0]))>=.3f
       ||cargo_support_force(round,&tug->physics)<=creature_mass(round)*gravity*.2f
       ||get_number(tug->controller->ctx,tug->controller->memory,"recycled",0)<1)return 0;
    Value state=value_get(round->controller->ctx,round->controller->memory,"phase");const char *phase=value_text(round->controller->ctx,state);
    int ready=phase&&!strcmp(phase,"ready");value_text_free(round->controller->ctx,phase);value_free(round->controller->ctx,state);
    if(!ready)return 0;
    int folded=round->physics.parts[rope].winch_length<1.15f;
    b3BodyId endpoint=round->physics.parts[rope].body;int capacity=b3Body_GetContactCapacity(endpoint);
    b3ContactData *contacts=capacity?calloc(capacity,sizeof(*contacts)):NULL;
    int count=capacity?b3Body_GetContactData(endpoint,contacts,capacity):0;
    for(int i=0;i<count;i++){
        b3BodyId a=b3Shape_GetBody(contacts[i].shapeIdA),b=b3Shape_GetBody(contacts[i].shapeIdB);
        b3BodyId other=B3_ID_EQUALS(a,endpoint)?b:a;
        if(!B3_ID_EQUALS(other,round->physics.parts[0].body))continue;
        for(int j=0;j<contacts[i].manifoldCount;j++)folded|=contacts[i].manifolds[j].pointCount>0;
    }
    free(contacts);
    return folded;
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
    int return_ticks=0,returned_ready=0;
    float payout=0,gravity=b3Length(b3World_GetGravity(world.physics));
    for(int tick=0;tick<360*60;tick++){
        world_step();assert(!world.deaths);
        for(int i=0;i<world.count;i++){Creature *c=&world.creatures[i];if(c->error[0])fprintf(stderr,"%s: %s\n",c->name,c->error);assert(!c->error[0]);}
        round=world_find(round_id);Creature *flyer=world_find(flyer_id),*tug=world_find(tug_id);assert(round&&flyer&&tug);
        return_ticks=retrieval_ready(round,tug,rope,gravity)?return_ticks+1:0;
        if(return_ticks>=60&&!returned_ready){returned_ready=1;printf("TETHER stopped supported retrieval-ready return at %.3f s\n",world.age);}
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
            if(!grounded){assert(save_world(ctx,"/workspace/lifecycle-stall.lua"));assert(system("download /workspace/lifecycle-stall.lua")==0);}
            assert(grounded&&tick-last_support<180);released=1;printf("TETHER physically supported release at %.3f s\n",world.age);
        }
        float up=b3RotateVector(b3Body_GetRotation(flyer->physics.parts[0].body),b3Vec3_axisY).y;
        recovery_ticks=released&&!flyer->held_by&&up>.9f&&p.y>floor+8&&cargo_support_force(flyer,&round->physics)<creature_mass(flyer)*gravity*.1f?recovery_ticks+1:0;
        if(recovery_ticks>=120)recovered=1;
        if(released)for(int i=0;i<world.count;i++)if(world.creatures[i].supply&&magnet_holds(flyer,&world.creatures[i]))resumed_work=1;
        previous=attached;
    }
    printf("TETHER lifecycle: captured=%d payout=%.3f groundHandleHeld=%d supportedRelease=%d sustainedFlight=%d resumedCargo=%d\n",captured,payout,handle_held,released,recovered,resumed_work);
    if(!recovered){assert(save_world(ctx,"/workspace/lifecycle-after.lua"));assert(system("download /workspace/lifecycle-after.lua")==0);}
    int salvaged=0;
    if(!recovered){
        Creature *flyer=world_find(flyer_id);b3Pos origin=physics_position(&flyer->physics.parts[0]);
        assert(b3RotateVector(physics_transform(&flyer->physics.parts[0]).q,b3Vec3_axisY).y<.45f&&!flyer->held_by&&!flyer->error[0]);
        catalog=read_catalog(ctx);int collector_id=catalog_spawn(ctx,catalog,"programs/kurogane-scrap-collector.lua",1,40,18,-10);value_free(ctx,catalog);
        int claimed=0,gripped=0,carried=0,holding=0,yard_release=-10000,settled=0;
        for(int tick=0;tick<240*60;tick++){
            world_step();assert(!world.deaths);for(int i=0;i<world.count;i++)assert(!world.creatures[i].error[0]);
            flyer=world_find(flyer_id);round=world_find(round_id);Creature *collector=world_find(collector_id);assert(flyer&&round&&collector);b3Pos p=physics_position(&flyer->physics.parts[0]);
            for(int i=0;i<world.radio_count;i++)if(world.radio[i].from==collector_id&&world.radio[i].target==flyer_id&&world.radio[i].kind==RADIO_CLAIM)claimed=1;
            return_ticks=retrieval_ready(round,world_find(tug_id),rope,gravity)?return_ticks+1:0;
            if(return_ticks>=60&&!returned_ready){returned_ready=1;printf("TETHER stopped supported retrieval-ready return at %.3f s\n",world.age);}
            int attached=magnet_holds(collector,flyer);gripped|=attached;carried|=gripped&&hypot(p.x-origin.x,p.z-origin.z)>15;
            int inside=0;for(int i=0;i<2;i++)if(scrapyards[i].team==collector->team&&hypot(p.x-scrapyards[i].x,p.z-scrapyards[i].z)<scrapyards[i].radius)inside=1;
            if(inside&&holding&&!attached)yard_release=tick;
            holding=attached;
            int supported=cargo_support_force(flyer,&collector->physics)>creature_mass(flyer)*gravity*.2f;
            settled=inside&&!flyer->held_by&&supported&&b3Length(physics_velocity(&flyer->physics.parts[0]))<.5f?settled+1:0;
            int delivered=get_number(collector->controller->ctx,collector->controller->memory,"deliveries",0)>0;
            salvaged=claimed&&gripped&&carried&&delivered&&tick-yard_release<30*60&&settled>=180;
            float up=b3RotateVector(physics_transform(&flyer->physics.parts[0]).q,b3Vec3_axisY).y;
            recovery_ticks=!flyer->held_by&&up>.9f&&p.y>terrain_floor((Vector3){p.x,p.y,p.z})+8&&cargo_support_force(flyer,&round->physics)<creature_mass(flyer)*gravity*.1f?recovery_ticks+1:0;
            if(recovery_ticks>=120)recovered=1;
            if(salvaged||recovered)break;
        }
        printf("TETHER scrapyard: claimed=%d physicallyGripped=%d carried=%d supportedAfterDrop=%d deposited=%d seconds=%.3f\n",claimed,gripped,carried,settled>=180,salvaged,world.age);
        assert(save_world(ctx,"/workspace/lifecycle-salvage.lua"));assert(system("download /workspace/lifecycle-salvage.lua")==0);
    }
    printf("TETHER outcome: independentFlight=%d settledInScrapyard=%d\n",recovered,salvaged);
    Creature *tug=world_find(tug_id);round=world_find(round_id);Value bay=value_get(tug->controller->ctx,tug->controller->memory,"destination");
    Value bx=value_at(tug->controller->ctx,bay,0),bz=value_at(tug->controller->ctx,bay,1);b3Pos position=physics_position(&round->physics.parts[0]);
    double returned=get_number(tug->controller->ctx,tug->controller->memory,"recycled",0),bay_distance=hypot(position.x-bx.number,position.z-bz.number);
    Value state=value_get(round->controller->ctx,round->controller->memory,"phase");const char *phase=value_text(round->controller->ctx,state);
    int ready=phase&&!strcmp(phase,"ready"),supported=cargo_support_force(round,&tug->physics)>creature_mass(round)*gravity*.2f;
    int folded=round->physics.parts[rope].winch_length<1.15f,unheld=!round->held_by&&!magnet_holds(tug,round);
    printf("TETHER final return state (event checked independently): recycled=%.0f finalBayDistance=%.3f ready=%d supported=%d folded=%d unheld=%d\n",returned,bay_distance,ready,supported,folded,unheld);
    value_text_free(round->controller->ctx,phase);value_free(round->controller->ctx,state);
    assert(save_world(ctx,"/workspace/lifecycle-final.lua"));assert(system("download /workspace/lifecycle-final.lua")==0);
    assert(value_is_number(bx)&&value_is_number(bz)&&returned_ready);
    value_free(tug->controller->ctx,bx);value_free(tug->controller->ctx,bz);value_free(tug->controller->ctx,bay);
    assert(captured&&payout>10&&handle_held&&released&&(recovered||salvaged));
    world_close();data_close(ctx);return 0;
}
