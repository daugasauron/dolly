#include "world.c"
#include <assert.h>

static void compare_observations(void){
    size_t count=(size_t)world.count*world.count;float *expected=array_resize(NULL,count,sizeof(float));
    for(int i=0;i<world.count;i++)for(int j=0;j<world.count;j++)expected[(size_t)i*world.count+j]=observation_distance(&world.creatures[j],&world.creatures[i].physics);
    neighbor_bounds=calloc(world.count,sizeof(*neighbor_bounds));assert(neighbor_bounds);
    for(int i=world.count-1;i>=0;i--)for(int j=0;j<world.count;j++){
        float distance=observation_distance(&world.creatures[j],&world.creatures[i].physics);
        assert(distance==expected[(size_t)i*world.count+j]);
    }
    observation_frame_clear();free(neighbor_bounds);neighbor_bounds=NULL;free(expected);
}
int main(void){
    Data *ctx=data_new(256*1024*1024);assert(ctx);world_load(ctx);assert(world.count>1);
    compare_observations();
    for(int i=0;i<90;i++)world_step();
    compare_observations();
    for(int i=0;i<world.count;i++)assert(!world.creatures[i].error[0]);
    printf("OBSERVATION PASS: %d articulated characters, exact observation distances before and after motion\n",world.count);
    world_close();data_close(ctx);return 0;
}
