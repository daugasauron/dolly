#include "world.c"
#include <assert.h>

static void ticks(int n){for(int i=0;i<n;i++)world_step();}
static float cargo_z(int id){return b3Body_GetPosition(world_find(id)->physics.parts[0].body).z;}
static void motor(int id,float throttle){Creature *c=world_find(id);vehicle_controls(&c->design,c->controls,throttle,0);}
static void magnet(int id,int powered){Creature *c=world_find(id);c->physics.parts[8].magnet_power=powered;}
static void check_resume(JSContext *ctx){
    Character rig={0};character_add(&rig,-1,0,0,0,BLOCK_BOX,0);character_add(&rig,0,0,1,0,BLOCK_HINGE,1);rig.blocks[1].axis=1;rig.anchored=1;
    const char *source="function(t,s,m){m.calls=(m.calls||0)+1;m.angle=s.angles[1];m.rate=s.rates[1];m.time=t;m.dt=s.dt;m.ready=s.contactsReady;return {A:.3};}";
    for(int hz=10;hz<=60;hz+=50)for(int steps=72;steps<=73;steps++){
        world_close();Creature *c=spawn(&rig,source,"Resume probe",1,hz,-40,0);int id=c->id;ticks(steps);c=world_find(id);
        float angle=c->physics.parts[1].angle,rate=c->physics.parts[1].rate,command=c->controls['A'];int previous=c->controller->last_step,calls=get_number(c->controller->ctx,c->controller->memory,"calls",0);double age=world.age;
        assert(angle>.8f&&rate>.7f&&command>.29f);world_save(ctx);world_close();world_load(ctx);c=world_find(id);
        assert(world.age==age&&c->physics.steps==steps&&c->controller->last_step==previous&&c->controls['A']==command&&!c->physics.sampled);
        assert(fabsf(c->physics.parts[1].angle-angle)<.0001f&&fabsf(c->physics.parts[1].rate-rate)<.0001f);
        ticks(1);c=world_find(id);assert(get_number(c->controller->ctx,c->controller->memory,"calls",0)==calls&&c->physics.parts[1].command==command&&c->physics.sampled);
        int ran=0;
        for(int i=0;i<7&&!ran;i++){
            angle=c->physics.parts[1].angle;rate=c->physics.parts[1].rate;double time=c->physics.steps/60.;ticks(1);
            ran=get_number(c->controller->ctx,c->controller->memory,"calls",0)>calls;
            if(ran){
                assert(fabs(get_number(c->controller->ctx,c->controller->memory,"angle",0)-angle)<.0001&&fabs(get_number(c->controller->ctx,c->controller->memory,"rate",0)-rate)<.0001);
                assert(get_number(c->controller->ctx,c->controller->memory,"ready",0)==1&&fabs(get_number(c->controller->ctx,c->controller->memory,"dt",0)-(time-previous/60.))<1e-9);
                printf("RESUME: %d Hz at step %d, first input angle %.6f, rate %.6f, dt %.6f, held command %.3f\n",hz,steps,angle,rate,time-previous/60.,command);
            }
        }assert(ran);world_close();
    }character_clear(&rig);
}
static void check_air_traffic(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);int lookout=0;
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        int bird=name&&!strncmp(name,"Postbird /",10),scout=!lookout&&name&&!strncmp(name,"Komame /",8);
        if(bird||scout){put_number(ctx,item,"x",0);put_number(ctx,item,"z",scout?12:0);if(scout){lookout=1;JS_SetPropertyStr(ctx,item,"source",JS_NewString(ctx,"function(){return {}}"));}JS_SetPropertyUint32(ctx,selected,scout?1:0,JS_DupValue(ctx,item));}
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==2);
    Creature *bird=&world.creatures[0],*scout=&world.creatures[1];Controller *controller=bird->controller;
    const char *memory="{\"phase\":\"return\",\"home\":[0,12],\"goal\":[0,12],\"ts\":0,\"hi\":0,\"pi\":0,\"ri\":0,\"job\":0,\"deliveries\":0,\"cruise\":5.2}";
    JS_FreeValue(controller->ctx,controller->memory);controller->memory=JS_ParseJSON(controller->ctx,memory,strlen(memory),"traffic-trial");
    float peak=0,travel=0,displacement=0;
    for(int i=0;i<20*60;i++){
        world_step();assert(world.count==2&&world.deaths==0);
        b3Pos a=b3Body_GetPosition(bird->physics.parts[0].body),b=b3Body_GetPosition(scout->physics.parts[0].body);
        peak=fmaxf(peak,a.y);travel=fmaxf(travel,a.z);displacement=fmaxf(displacement,hypotf(b.x,b.z-12));
    }
    assert(peak>8&&travel>10&&displacement<.1f);
    printf("AIR TRAFFIC: courier crossed %.3f m at peak %.3f m; stationary lookout displaced %.4f m\n",travel,peak,displacement);world_close();
}
static void check_courier(JSContext *ctx){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        if(name&&!strncmp(name,"Postbird /",10))JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));
        JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);JS_FreeValue(ctx,item);
    }
    load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==1);
    int carrier=world.creatures[0].id;Vector3 home=world.creatures[0].physics.start;
    int first=world_drop_cargo(home.x,NAN,home.z,MATERIAL_ALLOY),second=0;
    for(int i=0;i<180*60;i++){
        if(i==60*60){world_save(ctx);world_close();world_load(ctx);}
        if(i==90*60)second=world_drop_cargo(home.x,NAN,home.z,MATERIAL_ALLOY);
        world_step();
    }
    assert(world.count==3&&world.deaths==0&&world.delivery_count==2&&world_cargo_score(carrier)==2);
    Creature *a=world_find(first),*b=world_find(second);assert(a->delivered&&b->delivered&&!a->held_by&&!b->held_by);
    b3Pos pa=b3Body_GetPosition(a->physics.parts[0].body),pb=b3Body_GetPosition(b->physics.parts[0].body);
    assert(pb.y-pa.y>.8f&&hypotf(pa.x-pb.x,pa.z-pb.z)<.9f);
    printf("COURIER: two physical deliveries, stacked height difference %.3f m, score %d after controller restart\n",pb.y-pa.y,world_cargo_score(carrier));
    world_save(ctx);world_close();world_load(ctx);ticks(120);assert(world.delivery_count==2&&world_cargo_score(carrier)==2);world_close();
}
int main(void){
    JSRuntime *rt=JS_NewRuntime();JSContext *ctx=JS_NewContext(rt);Character car={0};character_car(&car);
    Creature *driver=spawn(&car,"function(){return ''}","Your character",1,60,0,12);int id=driver->id;world.player=id;
    int cargo=world_drop_cargo(0,NAN,16.5f,MATERIAL_ALLOY),unearned=world_drop_cargo(2,NAN,34,MATERIAL_ALLOY);
    ticks(90);assert(world.delivery_count==0&&!world_find(unearned)->carrier);
    magnet(id,1);motor(id,1);
    int steps=0;while(cargo_z(cargo)<30&&steps++<1200)world_step();motor(id,0);ticks(120);
    printf("DELIVERY APPROACH: steps %d, cargo z %.3f, carrier %d, grip %d\n",steps,cargo_z(cargo),world_find(cargo)->carrier,b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    assert(steps<1200&&world_find(cargo)->carrier==-1&&world.delivery_count==0&&b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    world_save(ctx);world_close();world_load(ctx);
    assert(world.player==id&&world_find(cargo)->carrier==-1&&world.delivery_count==0&&b3Body_IsValid(world_find(id)->physics.parts[8].magnet_target));
    for(int i=0;i<world.design_count;i++)assert(strcmp(world.designs[i].name,"Your character"));
    JSValue sensors=physics_sensors(ctx,&world_find(id)->physics,&car,1./60),nearby=JS_GetPropertyStr(ctx,sensors,"nearby"),sample=JS_GetPropertyUint32(ctx,nearby,0),ground=JS_GetPropertyStr(ctx,sensors,"groundSamples");
    assert(get_number(ctx,sensors,"id",0)==id&&get_number(ctx,ground,"length",0)==16&&get_number(ctx,sample,"id",0)==cargo&&get_number(ctx,sample,"carriedBy",0)==id);
    double sensed=get_number(ctx,sample,"z",0);assert(fabs(sensed-cargo_z(cargo))<.001);
    JS_FreeValue(ctx,ground);JS_FreeValue(ctx,sample);JS_FreeValue(ctx,nearby);JS_FreeValue(ctx,sensors);
    motor(id,.65f);steps=0;while(cargo_z(cargo)<33.7f&&steps++<600)world_step();motor(id,0);ticks(120);
    assert(steps<600&&world.delivery_count==0);magnet(id,0);ticks(180);
    printf("DELIVERY RELEASE: cargo %.3f, settled %.3f, delivered %d, score %d\n",cargo_z(cargo),world_find(cargo)->settled,world_find(cargo)->delivered,world_cargo_score(-1));
    assert(world.delivery_count==1&&world_find(cargo)->delivered&&world_cargo_score(id)==1&&world_cargo_score(-1)==1);
    Delivery first=world.deliveries[0];assert(first.cargo==cargo&&first.carrier==-1&&first.depot==0&&!strcmp(first.name,"You"));
    magnet(id,1);ticks(60);assert(world_find(cargo)->held_by==id);magnet(id,0);ticks(180);assert(world.delivery_count==1);
    world_save(ctx);world_close();world_load(ctx);assert(world.delivery_count==1&&world_find(cargo)->delivered&&world_cargo_score(-1)==1);
    assert(!memcmp(&first,&world.deliveries[0],sizeof(first)));assert(!world_find(unearned)->delivered);ticks(120);assert(world.delivery_count==1);
    int next=world_enter(&car,0);assert(next!=id&&world_cargo_score(next)==1&&world.delivery_count==1);
    world_save(ctx);puts("DELIVERY: physical pickup, loaded restart, transport, release, one-time score and persistent player attribution passed");
    world_close();
    character_remove(&car,7);character_remove(&car,7);assert(car.count==7);
    driver=spawn(&car,"function(){return ''}","Deck carrier",1,60,0,12);id=driver->id;world.player=id;ticks(60);
    b3Pos p=b3Body_GetPosition(world_find(id)->physics.parts[0].body);cargo=world_drop_cargo(p.x,p.y+1,p.z,MATERIAL_ALLOY);ticks(90);
    assert(world_find(cargo)->carrier==-1);float start=cargo_z(cargo);motor(id,.5f);ticks(300);motor(id,0);ticks(60);
    printf("DECK CARGO: transported %.3f m, carrier %d\n",cargo_z(cargo)-start,world_find(cargo)->carrier);
    assert(cargo_z(cargo)>start+4&&world_find(cargo)->carrier==-1&&world.delivery_count==0);
    assert(world_find(cargo)->held_by==id);world_save(ctx);world_close();world_load(ctx);
    assert(world_find(cargo)->held_by==id&&world_find(cargo)->carrier==-1);ticks(30);assert(world_find(cargo)->held_by==id);
    world_close();character_clear(&car);check_resume(ctx);check_courier(ctx);check_air_traffic(ctx);JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
