#include "world.c"
#include <assert.h>
#include <time.h>

static void checked(Controller *c,const Physics *p,const Character *d,float keys[128]){
    if(!controller_step(c,p,d,keys)){fprintf(stderr,"%s\n",c->error);assert(0);}
}
static void memory_and_limits(Data *ctx,Character *box){
    Physics p={0};physics_start(&p,box);float keys[128];
    const char *source="return function(t,s,m,r) m.calls=(m.calls or 0)+1; m.random=r(); m.dt=s.dt; assert(not os and not io and not package and not debug and not load and not dofile and not pcall and not math.random); return '' end";
    Controller *a=controller_new(source,17,60),*b=controller_new(source,17,60);assert(a&&b);
    for(int i=0;i<120;i++){checked(a,&p,box,keys);checked(b,&p,box,keys);assert(get_number(a->ctx,a->memory,"random",-1)==get_number(b->ctx,b->memory,"random",-2));p.steps++;}
    struct timespec pause={0,50000000};nanosleep(&pause,NULL);checked(a,&p,box,keys);assert(get_number(a->ctx,a->memory,"calls",0)==121);assert(fabs(get_number(a->ctx,a->memory,"dt",0)-1./60)<1e-12);
    Value copied=data_clone(ctx,a->ctx,a->memory);assert(!value_is_error(copied));put_number(ctx,copied,"calls",999);assert(get_number(a->ctx,a->memory,"calls",0)==121);value_free(ctx,copied);controller_free(a);controller_free(b);
    const char *bad[]={
        "return function() while true do end end",
        "local function f() return 1+f() end; return function() return f() end",
        "return function() return string.rep('x',8*1024*1024) end",
        "return function() return os.clock() end",
        "return function() return load('return 1')() end",
        "return function() return string.match(string.rep('a',200)..'!','^(a+)+$') end",
        "return function() return {A=0/0} end",
        "return function() return {unassigned=1} end",
        "return function() return setmetatable({},{__index=function() while true do end end}).key end"
    };
    for(unsigned i=0;i<sizeof(bad)/sizeof(*bad);i++){a=controller_new(bad[i],1,60);assert(a);assert(!controller_step(a,&p,box,keys)&&a->error[0]);for(int j=0;j<128;j++)assert(keys[j]==0);controller_free(a);}
    assert(!controller_new("while true do end",1,60));assert(!controller_new("local t=string.rep('x',8*1024*1024);return function()return t end",1,60));
    a=controller_new("return function(t,s,m) m.self=m;return '' end",1,60);checked(a,&p,box,keys);assert(!data_dump(a->ctx,a->memory,NULL));controller_free(a);
    a=controller_new("return function(t,s,m) setmetatable(m,{__pairs=function()while true do end end});return '' end",1,60);checked(a,&p,box,keys);assert(!data_dump(a->ctx,a->memory,NULL));controller_free(a);
    const char *invalid[]={"return os.execute('bad')","while true do end","local t={};t.t=t;return t","return function()end"};
    for(unsigned i=0;i<sizeof(invalid)/sizeof(*invalid);i++)assert(value_is_error(data_parse(ctx,invalid[i],strlen(invalid[i]),"invalid save")));
    const char *plain="return {text=[=[\nlong\ntext ]] ]=],numbers={1,2,3},positive=1/0,negative=-1/0,nan=0/0}";
    Value value=data_parse(ctx,plain,strlen(plain),"data roundtrip");assert(!value_is_error(value));Value next=data_clone(ctx,ctx,value);assert(!value_is_error(next));assert(isinf(get_number(ctx,next,"positive",0))&&isnan(get_number(ctx,next,"nan",0)));value_free(ctx,next);value_free(ctx,value);physics_stop(&p);
    puts("LUA LIMITS: deterministic memory, paused execution, runaway loops, recursion, heap, forbidden capabilities and bounded serialization passed");
}
static void environment(Data *ctx){
    terrain_select(4);Physics p={.landscape=1};Value snapshot=value_table(ctx);surroundings(ctx,snapshot,&p,(Vector3){87,4,-25});
    Value expected=data_clone(ctx,ctx,snapshot);assert(!value_is_error(expected));terrain_select(0);Value retained=data_clone(ctx,ctx,snapshot);assert(!value_is_error(retained));
    const char *fields[]={"terrain","obstacles","groundSamples"};for(int i=0;i<3;i++){
        Value a=value_get(ctx,expected,fields[i]),b=value_get(ctx,retained,fields[i]);assert(value_length(ctx,a)==value_length(ctx,b)&&value_length(ctx,a)>0);char *x=data_dump(ctx,a,NULL),*y=data_dump(ctx,b,NULL);assert(x&&y&&!strcmp(x,y));free(x);free(y);value_free(ctx,a);value_free(ctx,b);
    }value_free(ctx,expected);value_free(ctx,retained);value_free(ctx,snapshot);puts("LUA SENSORS: retained environment snapshot survives terrain replacement");
}
int main(void){
    Data *ctx=data_new(256*1024*1024);Value list=read_catalog(ctx);assert(value_is_array(list));int calls=0;
    for(int i=0;i<value_length(ctx,list);i++){
        Value item=value_at(ctx,list,i),code=value_get(ctx,item,"source"),blueprint=value_get(ctx,item,"blueprint"),label=value_get(ctx,item,"name");const char *source=value_text(ctx,code),*name=value_text(ctx,label);Character d={0};assert(read_character(ctx,blueprint,&d,0));Controller *c=controller_new(source,1,60);assert(c);Physics p={0};physics_start(&p,&d);float keys[128];
        for(int step=0;step<1000;step++){if(!controller_step(c,&p,&d,keys)){fprintf(stderr,"%s: %s\n",name,c->error);assert(0);}p.steps++;calls++;}
        physics_stop(&p);controller_free(c);character_clear(&d);value_text_free(ctx,source);value_text_free(ctx,name);value_free(ctx,item);value_free(ctx,code);value_free(ctx,blueprint);value_free(ctx,label);
    }value_free(ctx,list);Character box={0};character_add(&box,-1,0,0,0,BLOCK_BOX,0);memory_and_limits(ctx,&box);environment(ctx);character_clear(&box);data_close(ctx);printf("LUA CONTROLLERS: %d finite calls passed\n",calls);return 0;
}
