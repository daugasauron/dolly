#include "world.c"
#include <assert.h>

int main(void){
    Data *ctx=data_new(256*1024*1024);assert(ctx);terrain_select(8);
    Value catalog=read_catalog(ctx),selected=value_array(ctx);
    const int slots[]={64,74};
    for(int i=0;i<2;i++){
        Value item=value_at(ctx,catalog,slots[i]);
        if(i==1){put_number(ctx,item,"x",38.35);put_number(ctx,item,"z",-34.3);}
        value_set_at(ctx,selected,i,item);
    }
    load_designs(ctx,selected,1);value_free(ctx,selected);value_free(ctx,catalog);
    assert(world.count==2);int cargo_id=world_drop_cargo(28,.485,-34,MATERIAL_ALLOY);
    world.next_parcel=world.next_ore=world.next_mine=100000;
    int picked=0,placed=0,received=0;
    for(int tick=0;tick<900*60&&!received;tick++){
        Creature *loader=world_find(2),*cargo=world_find(cargo_id);assert(loader&&cargo);
        int held=magnet_holds(loader,cargo);
        float support=cargo_support_force(cargo,&loader->physics);
        float weight=creature_mass(cargo)*b3Length(b3World_GetGravity(loader->physics.world));
        float speed=b3Length(physics_velocity(&cargo->physics.parts[0]));
        world_step();assert(!world.deaths&&world.count==3);
        for(int i=0;i<world.count;i++){if(world.creatures[i].error[0])puts(world.creatures[i].error);assert(!world.creatures[i].error[0]);}
        loader=world_find(2);cargo=world_find(cargo_id);
        if(magnet_holds(loader,cargo)&&!picked){picked=1;printf("PICKUP %.3f\n",world.age);}
        if(held&&!magnet_holds(loader,cargo)){
            assert(support>.6f*weight&&speed<.2f);placed=1;
            printf("PLACED %.3f support %.3f weight %.3f speed %.3f\n",world.age,support,weight,speed);
        }
        received=placed&&magnet_holds(world_find(1),cargo);
        if(tick%3600==3599||received)printf("CAROUSEL %.3f pickup %d placed %d received %d\n",world.age,picked,placed,received);
    }
    assert(picked&&placed&&received);world_close();data_close(ctx);return 0;
}
