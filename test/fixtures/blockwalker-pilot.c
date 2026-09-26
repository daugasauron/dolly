#include "world.c"
#include <assert.h>
static void pilot_ticks(int n){for(int i=0;i<n;i++)world_step();assert(!world.deaths);}
static void pilot_keys(const char *keys){memset(world.input,0,sizeof(world.input));for(;*keys;keys++)world.input[(unsigned char)*keys]=1;world.driving=1;}
int main(void){
    Character car={0};character_car(&car);int id=world_enter(&car,0);assert(id);pilot_keys("W");pilot_ticks(180);
    Creature *c=world_find(id);b3Pos forward=b3Body_GetPosition(c->physics.parts[0].body);assert(forward.z-c->physics.start.z>5);
    pilot_keys("");pilot_ticks(90);pilot_keys("D");pilot_ticks(30);float right=b3Body_GetAngularVelocity(c->physics.parts[0].body).y;assert(right<-.1f);
    pilot_keys("");pilot_ticks(90);pilot_keys("A");pilot_ticks(30);float left=b3Body_GetAngularVelocity(c->physics.parts[0].body).y;assert(left>.1f);
    pilot_keys("2");pilot_ticks(3);assert(c->controls['2']==1&&c->controls['4']==0&&c->controls['6']==0&&c->controls['8']==0);
    pilot_keys("");world.pressed['E']=1;pilot_ticks(3);assert(c->physics.parts[8].magnet_power==1&&!world.pressed['E']);
    world.pressed['Q']=1;pilot_ticks(3);assert(c->physics.parts[8].magnet_power==0);
    printf("PILOT: forward %.3f m, right yaw %.3f, left yaw %.3f; individual wheel input preserved\n",forward.z-c->physics.start.z,right,left);world_close();
    for(int i=3;i<7;i++){car.blocks[i].negative='H'+(i-3)*2;car.blocks[i].positive='I'+(i-3)*2;}
    id=world_enter(&car,0);assert(id);pilot_keys("W");pilot_ticks(180);c=world_find(id);forward=b3Body_GetPosition(c->physics.parts[0].body);assert(forward.z-c->physics.start.z>5);
    printf("PILOT REMAP: same program drives remapped wheel bindings %.3f m\n",forward.z-c->physics.start.z);
    world_close();
    for(int j=0;j<car.count;j++){Block *b=&car.blocks[j];int x=b->x;b->x=b->z;b->z=-x;if(b->axis==0)b->axis=2;else if(b->axis==2)b->axis=0;}
    id=world_enter(&car,0);assert(id);pilot_keys("W");pilot_ticks(180);c=world_find(id);forward=b3Body_GetPosition(c->physics.parts[0].body);assert(forward.x-c->physics.start.x>5);
    pilot_keys("");pilot_ticks(90);pilot_keys("D");pilot_ticks(30);assert(b3Body_GetAngularVelocity(c->physics.parts[0].body).y<-.1f);
    printf("PILOT ROTATED: same program follows +X Eyes using Z-axis wheels, %.3f m\n",forward.x-c->physics.start.x);world_close();
    installed=strdup("return function()\n  do return {} end\nend\n");installed_hz=60;id=world_enter(&car,0);assert(id);pilot_keys("WDE");pilot_ticks(180);c=world_find(id);forward=b3Body_GetPosition(c->physics.parts[0].body);
    assert(hypotf(forward.x-c->physics.start.x,forward.z-c->physics.start.z)<.1f);for(int j=0;j<128;j++)assert(c->controls[j]==0);
    puts("PILOT EMPTY: no movement helper overrides an empty program");
    world_close();character_clear(&car);return 0;
}
