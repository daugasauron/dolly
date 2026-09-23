#include "world.c"
#include <assert.h>

static void ticks(int n){for(int i=0;i<n;i++)world_step();}
static float cargo_z(int id){return b3Body_GetPosition(world_find(id)->physics.parts[0].body).z;}
static void motor(int id,float throttle){Creature *c=world_find(id);vehicle_controls(&c->design,c->controls,throttle,0);}
static void magnet(int id,int powered){Creature *c=world_find(id);c->physics.parts[8].magnet_power=powered;}
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
    JSValue sensors=physics_sensors(ctx,&world_find(id)->physics,&car,1./60),nearby=JS_GetPropertyStr(ctx,sensors,"nearby"),sample=JS_GetPropertyUint32(ctx,nearby,0),ground=JS_GetPropertyStr(ctx,sensors,"groundSamples");
    assert(get_number(ctx,sensors,"id",0)==id&&get_number(ctx,ground,"length",0)==16&&get_number(ctx,sample,"id",0)==cargo&&get_number(ctx,sample,"carriedBy",0)==id);
    double sensed=get_number(ctx,sample,"z",0);assert(fabs(sensed-cargo_z(cargo))<.001);
    JS_FreeValue(ctx,ground);JS_FreeValue(ctx,sample);JS_FreeValue(ctx,nearby);JS_FreeValue(ctx,sensors);
    motor(id,.65f);steps=0;while(cargo_z(cargo)<33.7f&&steps++<600)world_step();motor(id,0);ticks(120);
    assert(steps<600&&world.delivery_count==0);magnet(id,0);ticks(180);
    printf("DELIVERY RELEASE: cargo %.3f, settled %.3f, delivered %d, score %d\n",cargo_z(cargo),world_find(cargo)->settled,world_find(cargo)->delivered,world_cargo_score(-1));
    assert(world.delivery_count==1&&world_find(cargo)->delivered&&world_cargo_score(id)==1&&world_cargo_score(-1)==1);
    Delivery first=world.deliveries[0];assert(first.cargo==cargo&&first.carrier==-1&&first.depot==0&&!strcmp(first.name,"You"));
    magnet(id,1);ticks(60);magnet(id,0);ticks(180);assert(world.delivery_count==1);
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
    world_close();character_clear(&car);JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
