#include "world.c"
#include <assert.h>

static int model(Data *ctx,Value catalog,const char *name,float x,float y,float z,int team){
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        Value item=value_at(ctx,catalog,i),label=value_get(ctx,item,"name");const char *text=value_text(ctx,label);int match=text&&!strcmp(text,name);value_text_free(ctx,text);value_free(ctx,label);
        if(match){
            Character design={0};Value blocks=value_get(ctx,item,"blueprint"),code=value_get(ctx,item,"source");assert(read_character(ctx,blocks,&design));const char *source=value_text(ctx,code);
            Creature *c=spawn(&design,source,name,world.count+1,20,x,z);assert(c);set_spawn_height(c,y);c->team=team;int id=c->id;
            character_clear(&design);value_text_free(ctx,source);value_free(ctx,code);value_free(ctx,blocks);value_free(ctx,item);return id;
        }value_free(ctx,item);
    }assert(!"Missing canonical model");return 0;
}
static double memory(Creature *c,const char *key){return get_number(c->controller->ctx,c->controller->memory,key,0);}
static int carrying(Creature *c){Value v=value_get(c->controller->ctx,c->controller->memory,"phase");const char *text=value_text(c->controller->ctx,v);int yes=text&&!strcmp(text,"carry");value_text_free(c->controller->ctx,text);value_free(c->controller->ctx,v);return yes;}
static void no_contact(Creature *a,Creature *b){
    for(int i=0;i<a->physics.count;i++)if(a->physics.parts[i].owner==i){
        b3BodyId body=a->physics.parts[i].body;int capacity=b3Body_GetContactCapacity(body);b3ContactData *data=capacity?malloc(capacity*sizeof(*data)):NULL;int count=capacity?b3Body_GetContactData(body,data,capacity):0;
        for(int j=0;j<count;j++){
            b3BodyId x=b3Shape_GetBody(data[j].shapeIdA),y=b3Shape_GetBody(data[j].shapeIdB),other=B3_ID_EQUALS(x,body)?y:x;
            for(int k=0;k<b->physics.count;k++)if(b->physics.parts[k].owner==k&&B3_ID_EQUALS(other,b->physics.parts[k].body))for(int n=0;n<data[j].manifoldCount;n++)assert(data[j].manifolds[n].pointCount==0);
        }free(data);
    }
}
int main(void){
    Data *ctx=data_new(256*1024*1024);assert(ctx);terrain_select(8);Value catalog=read_catalog(ctx);
    int scoutA=model(ctx,catalog,"Komame / roaming lookout",-22,.65,-69,1),scoutB=model(ctx,catalog,"Komame / roaming lookout",22,.65,-69,2);
    int aId=model(ctx,catalog,"Tonbo / Red courier",60,32,-73,1),bId=model(ctx,catalog,"Yamabiko / Red courier",-60,32,-73,2);
    int cargoA=world_drop_cargo(-24,.485,-73,MATERIAL_ALLOY),cargoB=world_drop_cargo(24,.485,-73,MATERIAL_ALLOY);assert(cargoA&&cargoB);value_free(ctx,catalog);
    int dispatchedA=0,dispatchedB=0,loadedYield=0,passedA=0,passedB=0;
    for(int tick=0;tick<180*60;tick++){
        world_step();assert(world.count==6&&!world.deaths);for(int i=0;i<world.count;i++)assert(!world.creatures[i].error[0]);
        Creature *a=world_find(aId),*b=world_find(bId);assert(a&&b);no_contact(a,b);
        dispatchedA|=memory(a,"job")==cargoA&&memory(a,"dispatchedFrom")==scoutA;dispatchedB|=memory(b,"job")==cargoB&&memory(b,"dispatchedFrom")==scoutB;
        int heldA=magnet_holds(a,world_find(cargoA)),heldB=magnet_holds(b,world_find(cargoB));
        if(memory(a,"yieldingTo")==bId&&carrying(a)){assert(heldA);loadedYield=1;}
        if(memory(b,"yieldingTo")==aId&&carrying(b)){assert(heldB);loadedYield=1;}
        passedA|=heldA&&physics_position(&a->physics.parts[0]).x>10;passedB|=heldB&&physics_position(&b->physics.parts[0]).x< -10;
        if(passedA&&passedB&&loadedYield)break;
    }
    assert(dispatchedA&&dispatchedB&&passedA&&passedB&&loadedYield);
    printf("AIR TRAFFIC PASS at%.3fs: real scout missions cross outbound and loaded, no courier contact, cargo retained during yielding\n",world.age);world_close();data_close(ctx);return 0;
}
