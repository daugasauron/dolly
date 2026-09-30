#include "world.c"
#include <assert.h>
static void contracts(void){
    const char *sources[]={
        "calls=0;return function() calls=calls+1;return {L=calls%5/5} end",
        "return function(t) return {L=t%1} end",
        "return function(t,s) assert(#s.blueprint>1 and type(s.parts)=='function' and type(s.bounds)=='function');assert(s.input.L==1 and s.pressed.L==1);return {L=s.dt} end",
        "return function(...) assert(select('#',...)==4);local t,s,m,r=...;m.calls=(m.calls or 0)+1;m.random=r();assert(#s.blueprint>1 and s.input.L==1);return {L=m.random} end",
        "return function(t,...) assert(select('#',...)==3);local s,m,r=...;m.calls=(m.calls or 0)+1;return {L=r()} end",
        "return function() error('deliberate failure') end",
        "return string.char"
    };
    Character design={0};character_car(&design);Physics p={0};physics_start(&p,&design);
    for(unsigned which=0;which<sizeof(sources)/sizeof(*sources);which++){
        Controller *a=controller_new(sources[which],17,20),*b=controller_new(sources[which],17,20);assert(a&&b);b->parameters=4;
        for(int i=0;i<120;i++){
            float actual[128],reference[128];p.steps=i*3;
            trial=a;world.input['L']=world.pressed['L']=1;int good=controller_step(a,&p,&design,actual);assert(!world.pressed['L']);
            trial=b;world.pressed['L']=1;assert(controller_step(b,&p,&design,reference)==good);assert(!world.pressed['L']);trial=NULL;
            assert(good==(which<5));assert(!memcmp(actual,reference,sizeof(actual)));assert(!strcmp(a->error,b->error));assert(a->seed==b->seed&&a->last_step==b->last_step);
            assert(get_number(a->ctx,a->memory,"calls",0)==get_number(b->ctx,b->memory,"calls",0));
        }
        if(which==0){lua_getglobal(a->ctx->lua,"calls");assert(lua_tointeger(a->ctx->lua,-1)==120);lua_pop(a->ctx->lua,1);}
        printf("ARGUMENT CONTRACT %u passed\n",which);controller_free(a);controller_free(b);
    }
    memset(world.input,0,sizeof(world.input));physics_stop(&p);character_clear(&design);
}
int main(void){contracts();puts("Controller argument semantics preserved");return 0;}
