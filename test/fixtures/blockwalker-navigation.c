#include "world.c"
#include <assert.h>

static void walker(JSContext *ctx,float x){
    JSValue catalog=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json"),selected=JS_NewArray(ctx);
    for(int i=0;i<get_number(ctx,catalog,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,catalog,i),label=JS_GetPropertyStr(ctx,item,"name");const char *name=JS_ToCString(ctx,label);
        int match=name&&!strcmp(name,"Amberguard / heavy walker");JS_FreeCString(ctx,name);JS_FreeValue(ctx,label);
        if(match){put_number(ctx,item,"x",x);put_number(ctx,item,"z",-14);JS_SetPropertyUint32(ctx,selected,0,JS_DupValue(ctx,item));}
        JS_FreeValue(ctx,item);
    }
    terrain_select(1);load_designs(ctx,selected,1);JS_FreeValue(ctx,selected);JS_FreeValue(ctx,catalog);assert(world.count==1);
    world.next_parcel=world.next_ore=100000;
}
int main(void){
    JSRuntime *rt=JS_NewRuntime();JSContext *ctx=JS_NewContext(rt);
    for(int side=-1;side<=1;side+=2){
        walker(ctx,side*77);int flight[4]={0},planted[4]={0},steps[4]={0},reloads=0;b3Pos previous[4]={{0}},takeoff[4]={{0}};float min_up=1,separation=0;double distance=INFINITY;
        for(int tick=0;tick<300*60;tick++){
            if(tick==60){Controller *c=world_find(1)->controller;put_number(c->ctx,c->memory,"x",side*17);put_number(c->ctx,c->memory,"z",-14);JS_SetPropertyStr(c->ctx,c->memory,"goal",JS_UNDEFINED);}
            world_step();Creature *c=world_find(1);if(!c)break;b3Pos p=b3Body_GetPosition(c->physics.parts[0].body);distance=hypot(p.x-side*17,p.z+14);min_up=fminf(min_up,b3RotateVector(b3Body_GetRotation(c->physics.parts[0].body),b3Vec3_axisY).y);separation=fmaxf(separation,c->physics.max_separation);
            if(tick%6==0)for(int leg=0;leg<4;leg++){
                const int tips[]={12,16,22,26};float bottom=INFINITY,support=0;b3Pos center={0};
                for(int part=tips[leg]-1;part<=tips[leg];part++){
                    b3BodyId body=c->physics.parts[part].body;b3WorldTransform pose=b3Body_GetTransform(body);center.x+=pose.p.x/2;center.y+=pose.p.y/2;center.z+=pose.p.z/2;Vector3 half=block_half(c->design.blocks[part]);
                    for(int corner=0;corner<8;corner++){b3Vec3 local={(corner&1?1:-1)*half.x,(corner&2?1:-1)*half.y,(corner&4?1:-1)*half.z};b3Pos point=b3TransformWorldPoint(pose,local);bottom=fminf(bottom,point.y-terrain_floor((Vector3){point.x,point.y,point.z}));}
                    int cap=b3Body_GetContactCapacity(body);if(cap){b3ContactData *data=array_resize(NULL,cap,sizeof(*data));int count=b3Body_GetContactData(body,data,cap);support+=contact_forces(body,c->physics.parts,data,count).support;free(data);}
                }
                if(bottom>.12f&&support<.1f&&!flight[leg]&&planted[leg]){flight[leg]=1;takeoff[leg]=previous[leg];}
                if(bottom<.08f&&support>1){if(flight[leg]&&hypot(center.x-takeoff[leg].x,center.z-takeoff[leg].z)>.1)steps[leg]++;flight[leg]=0;planted[leg]=1;previous[leg]=center;}
            }
            if(tick==90*60||tick==210*60){assert(world_save(ctx));world_close();world_load(ctx);reloads++;}
        }
        assert(world_save(ctx));printf("WALKER RETURN: side %d, home distance %.3f m, supported airborne steps %d/%d/%d/%d, minimum up %.5f, separation %.5f, reloads %d, deaths %d\n",side,distance,steps[0],steps[1],steps[2],steps[3],min_up,separation,reloads,world.deaths);fflush(stdout);
        assert(distance<30&&min_up>.9f&&separation<.2f&&reloads==2&&!world.deaths);for(int leg=0;leg<4;leg++)assert(steps[leg]>10);
        world_close();
    }
    JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
