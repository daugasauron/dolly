#include "world.c"
#include <assert.h>

static WorldPlacement point(const Character *design,int team,float x,float z){return world_placement(design,team,(Ray){{x,127,z},{0,-1,0}});}
int main(void){
    Data *ctx=data_new(256*1024*1024);assert(ctx);terrain_select(8);
    Character design={0};character_add(&design,-1,0,0,0,BLOCK_BOX,0);design.anchored=1;
    int hinge=character_add(&design,0,0,1,0,BLOCK_HINGE,0);assert(hinge>0);design.blocks[hinge].axis=1;design.blocks[hinge].negative='A';design.blocks[hinge].positive='D';
    assert(character_add(&design,hinge,1,1,0,BLOCK_BOX,0)>0);
    Value args=value_table(ctx);value_set(ctx,args,"source",value_string(ctx,"return function(t,s,m) m.ticks=(m.ticks or 0)+1; return {D=1} end"));value_set(ctx,args,"name",value_string(ctx,"Placed test machine"));assert(!value_is_error(world_install(ctx,args)));value_free(ctx,args);
    assert(terrain_combat_half_x(8)==32&&terrain_combat_half_x(7)==48&&terrain_combat_half_x(6)==78);
    WorldPlacement red=point(&design,1,60,0),blue=point(&design,2,-60,0),neutral=point(&design,0,20,0);
    assert(red.status==PLACEMENT_OK&&blue.status==PLACEMENT_OK&&neutral.status==PLACEMENT_OK);
    Ray diagonal={{-54,33.281025f,31.351803f},{0,-.7173561f,-.6967067f}};
    assert(world_placement(&design,2,diagonal).status==PLACEMENT_OK);
    assert(point(&design,2,60,0).status==PLACEMENT_ZONE&&point(&design,1,-60,0).status==PLACEMENT_ZONE);
    assert(point(&design,0,60,0).status==PLACEMENT_ZONE&&point(&design,1,20,0).status==PLACEMENT_ZONE);
    assert(point(&design,0,31,0).status==PLACEMENT_ZONE);
    WorldPlacement floating=red;floating.offset.y+=1;assert(world_placement_check(&design,&floating)==PLACEMENT_SUPPORT);
    int water=0;for(int x=40;x<240&&!water;x+=4)if(terrain_height(x,0)<WATER_LEVEL){assert(point(&design,1,x,0).status==PLACEMENT_SURFACE);water=1;}assert(water);
    assert(point(&design,1,180,150).status!=PLACEMENT_OK);
    WorldPlacement missed=world_placement(&design,0,(Ray){{0,120,0},{0,1,0}});assert(missed.status==PLACEMENT_SURFACE&&!world_place(&design,&missed)&&world.count==0);
    int id=world_place(&design,&red);assert(id&&world.count==1);Creature *c=world_find(id);assert(c->team==1&&c->design.anchored&&c->design.blocks[0].color==world_team_color(1));
    assert(b3Body_GetType(c->physics.parts[0].body)==b3_staticBody);b3Pos root=b3Body_GetPosition(c->physics.parts[0].body);
    WorldPlacement occupied=point(&design,1,60,0);assert(occupied.status==PLACEMENT_COLLISION&&!world_place(&design,&occupied)&&world.count==1);
    int roof=0;float roof_height=0;
    for(int i=0;i<terrain_count&&!roof;i++){
        TerrainBox box=terrain_box(i);if(box.half.x<2||box.half.z<2||box.center.y+box.half.y<5)continue;
        int team=box.center.x>32?1:box.center.x<-32?2:0;WorldPlacement candidate=point(&design,team,box.center.x,box.center.z);
        if(candidate.status==PLACEMENT_OK&&candidate.offset.y>5){roof_height=candidate.offset.y+.5f;roof=world_place(&design,&candidate);}
    }
    assert(roof);c=world_find(roof);assert(fabsf(c->physics.start.y-roof_height)<.01f);
    for(int i=0;i<180;i++)world_step();c=world_find(id);assert(c&&!c->error[0]&&get_number(c->controller->ctx,c->controller->memory,"ticks",0)>20);
    assert(fabsf(c->physics.parts[hinge].angle)>.1f);b3Pos after=b3Body_GetPosition(c->physics.parts[0].body);assert(after.x==root.x&&after.y==root.y&&after.z==root.z);
    const char *catalog_path="/usr/src/dolly/slopyard/designs.lua";char *catalog=LoadFileText(catalog_path);assert(catalog);assert(SaveFileText(catalog_path,"return {format='slopyard-catalog',version=1,designs=array{}}"));
    assert(world_save(ctx));world_close();world_load(ctx);assert(SaveFileText(catalog_path,catalog));UnloadFileText(catalog);
    assert(terrain_version==8);c=world_find(id);assert(c&&c->team==1&&c->design.anchored&&!strcmp(c->controller->source,"return function(t,s,m) m.ticks=(m.ticks or 0)+1; return {D=1} end"));
    after=b3Body_GetPosition(c->physics.parts[0].body);assert(after.x==root.x&&after.y==root.y&&after.z==root.z);c=world_find(roof);assert(c&&fabsf(c->physics.start.y-roof_height)<.01f);
    for(int i=0;i<60;i++)world_step();assert(!world.deaths);for(int i=0;i<world.count;i++)assert(!world.creatures[i].error[0]);
    world_close();terrain_select(7);assert(point(&design,1,40,0).status==PLACEMENT_ZONE);terrain_select(8);assert(point(&design,1,40,0).status==PLACEMENT_OK);
    Character bearing={0};character_add(&bearing,-1,0,0,0,BLOCK_BOX,0);bearing.anchored=1;int table=character_add(&bearing,0,0,1,0,BLOCK_TURNTABLE,0);bearing.blocks[table].axis=1;bearing.blocks[table].size=3;
    assert(point(&bearing,1,60,0).status==PLACEMENT_OK);assert(world_drop_cargo(61.2f,.72f,0,MATERIAL_ALLOY));assert(point(&bearing,1,60,0).status==PLACEMENT_COLLISION);
    bearing.blocks[table].size=1;assert(point(&bearing,1,60,0).status==PLACEMENT_OK);character_clear(&bearing);world_close();
    character_clear(&design);data_close(ctx);puts("PLACEMENT PASS: team footprints, supported terrain and roofs, water and overlap rejection, missed preview has no effect, real joint program, stationary root, terrain8 save/restore and legacy width");return 0;
}
