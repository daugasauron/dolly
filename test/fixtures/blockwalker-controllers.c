#include "world.c"
#include <assert.h>
#include <time.h>
typedef struct {Controller *controller;int checks,pause_ms;} Probe;
static double wall(void){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec/1e9;}
static int probe_interrupt(JSRuntime *rt,void *opaque){
    Probe *p=opaque;p->checks++;
    if(p->pause_ms){struct timespec delay={0,p->pause_ms*1000000};p->pause_ms=0;nanosleep(&delay,NULL);}
    return interrupt(rt,p->controller);
}
static void run(FILE *f,const char *kind,int id,const char *source,Character *design,int steps,int pause){
    double start=wall();Controller *c=controller_new(source,1,60);
    if(!c){fprintf(f,"%s,%d,0,0,0,0,%d,%.4f,initialization\n",kind,id,pause,(wall()-start)*1000);return;}
    Physics p={0};physics_start(&p,design);Probe probe={c,0,pause};JS_SetInterruptHandler(c->runtime,probe_interrupt,&probe);
    int completed=0,peak=0,valid=1;float keys[128];start=wall();
    while(completed<steps){int before=probe.checks;valid=controller_step(c,&p,design,keys);int checks=probe.checks-before;if(checks>peak)peak=checks;if(!valid)break;completed++;p.steps++;}
    fprintf(f,"%s,%d,%d,%d,%d,%d,%d,%.4f,%s\n",kind,id,valid,completed,probe.checks,peak,pause,(wall()-start)*1000,c->error);
    physics_stop(&p);controller_free(c);
}
static void install(JSContext *ctx,const char *source){
    JSValue args=JS_NewObject(ctx);JS_SetPropertyStr(ctx,args,"source",JS_NewString(ctx,source));put_number(ctx,args,"hz",60);
    JSValue result=world_install(ctx,args);assert(!JS_IsException(result));JS_FreeValue(ctx,result);JS_FreeValue(ctx,args);
}
static JSValue memory_snapshot(JSContext *ctx,int failed){
    JSValue program=world_program(ctx),memory=JS_GetPropertyStr(ctx,program,"memory"),error=JS_GetPropertyStr(ctx,program,"memoryError");
    assert(JS_IsString(error)==failed);JS_FreeValue(ctx,error);JS_FreeValue(ctx,program);return memory;
}
static void check_memory(JSContext *ctx,Character *design){
    Physics p={0};physics_start(&p,design);
    install(ctx,"function(t,s,m){m.ticks=(m.ticks||0)+1;m.phase=t<1?'shift':'lift';m.last=t;return {}}");
    JSValue memory=memory_snapshot(ctx,0);assert(JS_IsNull(memory));JS_FreeValue(ctx,memory);assert(world_trial_begin(&p));
    for(int i=0;i<120;i++)assert(world_trial_step(&p,design));
    memory=memory_snapshot(ctx,0);assert(get_number(ctx,memory,"ticks",-1)==120);assert(fabs(get_number(ctx,memory,"last",-1)-119./60)<1e-9);
    JSValue phase=JS_GetPropertyStr(ctx,memory,"phase");const char *name=JS_ToCString(ctx,phase);assert(name&&!strcmp(name,"lift"));JS_FreeCString(ctx,name);JS_FreeValue(ctx,phase);
    put_number(ctx,memory,"ticks",999);JS_FreeValue(ctx,memory);memory=memory_snapshot(ctx,0);assert(get_number(ctx,memory,"ticks",-1)==120);JS_FreeValue(ctx,memory);
    assert(world_trial_begin(&p));memory=memory_snapshot(ctx,0);assert(get_number(ctx,memory,"ticks",-1)==-1);JS_FreeValue(ctx,memory);
    const char *bad[]={"m.self=m", "m.data='x'.repeat(8192)", "m.big=1n", "m.toJSON=()=>undefined", "Object.defineProperty(m,'bad',{enumerable:true,get(){throw Error('oops')}})", "Object.defineProperty(m,'bad',{enumerable:true,get(){while(true){}}})", "m.toJSON=()=>{while(true){}}"};
    for(int i=0;i<sizeof(bad)/sizeof(*bad);i++){
        char source[512];snprintf(source,sizeof(source),"function(t,s,m){if(!m.ticks){%s};m.ticks=(m.ticks||0)+1;return {}}",bad[i]);install(ctx,source);assert(world_trial_begin(&p));assert(world_trial_step(&p,design));
        memory=memory_snapshot(ctx,1);assert(JS_IsNull(memory));JS_FreeValue(ctx,memory);assert(world_trial_step(&p,design));assert(get_number(trial->ctx,trial->memory,"ticks",-1)==2);
    }
    world_trial_stop();memory=memory_snapshot(ctx,0);assert(JS_IsNull(memory));JS_FreeValue(ctx,memory);physics_stop(&p);
}
int main(void){
    JSRuntime *rt=JS_NewRuntime();JSContext *ctx=JS_NewContext(rt);JSValue list=read_json(ctx,"/usr/src/dolly/blockwalker/designs.json");
    FILE *f=fopen("/workspace/controller-probe.csv","w");if(!f)return 1;fputs("kind,id,valid,steps,checks,peakChecks,pauseMs,wallMs,error\n",f);
    for(int i=0;i<get_number(ctx,list,"length",0);i++){
        JSValue item=JS_GetPropertyUint32(ctx,list,i),blueprint=JS_GetPropertyStr(ctx,item,"blueprint"),code=JS_GetPropertyStr(ctx,item,"source"),label=JS_GetPropertyStr(ctx,item,"name");
        Character design={0};if(!character_from_json(ctx,blueprint,&design))return 2;const char *source=JS_ToCString(ctx,code),*name=JS_ToCString(ctx,label);
        run(f,"normal",i,source,&design,1000,0);
        if(strstr(name,"Marrowstep"))run(f,"paused",i,source,&design,1000,50);
        JS_FreeCString(ctx,name);JS_FreeCString(ctx,source);character_clear(&design);JS_FreeValue(ctx,item);JS_FreeValue(ctx,blueprint);JS_FreeValue(ctx,code);JS_FreeValue(ctx,label);
    }
    remove("/workspace/blockwalker-world.json");world_load(ctx);
    world.creatures[0].physics.steps=1032202;world.creatures[1].physics.steps=261688;world_save(ctx);world_close();world_load(ctx);
    if(world.creatures[0].physics.steps!=1032202||world.creatures[1].physics.steps!=261688)return 3;world_close();
    Character box={0};character_add(&box,-1,0,0,0,BLOCK_BOX,0);
    check_memory(ctx,&box);
    run(f,"clock",-1,"function(){while(true){Date.now()}}",&box,1,0);
    run(f,"loop",-1,"function(){while(true){}}",&box,1,0);
    run(f,"regex",-1,"function(){/^(a+)+$/.test('a'.repeat(200)+'!');return {}}",&box,1,0);
    run(f,"getter",-1,"function(){return {get A(){while(true){}}}}",&box,1,0);
    run(f,"initialize",-1,"(function(){while(true){}})()",&box,1,0);
    character_clear(&box);fclose(f);JS_FreeValue(ctx,list);JS_FreeContext(ctx);JS_FreeRuntime(rt);return 0;
}
