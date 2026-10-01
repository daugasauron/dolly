#define _POSIX_C_SOURCE 200809L
#include "pi.h"
#include <dolly/quickjs-runner.h>
#include <quickjs.h>
#include <math.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

static Data *game;
static int (*initialize_game)(Data *);
static GameOperation call_game,frame_game;
enum {DATA_BYTES=DATA_ERROR+1};
Value value_bytes(Data *d,const void *bytes,size_t size){Value v=value_string_n(d,bytes,size);v.type=DATA_BYTES;return v;}
static Value from_js(Data *d,JSContext *ctx,JSValueConst v,int depth){
    if(depth>64)return value_error(d,"Data is too deeply nested");
    if(JS_IsUndefined(v))return VALUE_NIL;if(JS_IsNull(v))return VALUE_NULL;
    if(JS_IsBool(v))return value_bool(d,JS_ToBool(ctx,v));
    if(JS_IsNumber(v)){double number;JS_ToFloat64(ctx,&number,v);return value_number(d,number);}
    if(JS_IsString(v)){size_t size;const char *s=JS_ToCStringLen(ctx,&size,v);Value out=value_string_n(d,s,size);JS_FreeCString(ctx,s);return out;}
    if(!JS_IsObject(v))return VALUE_ERROR;
    Value out=JS_IsArray(v)?value_array(d):value_table(d);
    if(JS_IsArray(v)){
        JSValue count=JS_GetPropertyStr(ctx,v,"length");int32_t n;JS_ToInt32(ctx,&n,count);JS_FreeValue(ctx,count);
        for(int i=0;i<n;i++){JSValue item=JS_GetPropertyUint32(ctx,v,i);Value next=from_js(d,ctx,item,depth+1);JS_FreeValue(ctx,item);if(value_is_error(next)){value_free(d,out);return next;}value_set_at(d,out,i,next);}
    }else{
        JSPropertyEnum *keys;uint32_t count;if(JS_GetOwnPropertyNames(ctx,&keys,&count,v,JS_GPN_STRING_MASK|JS_GPN_ENUM_ONLY)<0){value_free(d,out);return VALUE_ERROR;}
        int failed=0;for(uint32_t i=0;i<count;i++){const char *key=JS_AtomToCString(ctx,keys[i].atom);JSValue item=JS_GetProperty(ctx,v,keys[i].atom);Value next=from_js(d,ctx,item,depth+1);failed|=value_is_error(next);if(!failed)value_set(d,out,key,next);else value_free(d,next);JS_FreeCString(ctx,key);JS_FreeValue(ctx,item);JS_FreeAtom(ctx,keys[i].atom);}js_free(ctx,keys);
        if(failed){value_free(d,out);return VALUE_ERROR;}
    }return out;
}
static int materialize(lua_State *L){luaL_getmetafield(L,1,"__pairs");lua_pushvalue(L,1);lua_call(L,1,0);return 0;}
static JSValue to_js(Data *d,JSContext *ctx,Value v,int depth){
    if(depth>64)return JS_ThrowTypeError(ctx,"Game data is too deeply nested");
    if(v.type==DATA_ERROR)return JS_ThrowTypeError(ctx,"%s",d->error);
    if(v.type==DATA_NIL)return JS_UNDEFINED;if(v.type==DATA_NULL)return JS_NULL;
    if(v.type==DATA_BOOL)return JS_NewBool(ctx,v.number!=0);if(v.type==DATA_NUMBER)return JS_NewFloat64(ctx,v.number);
    if(v.type==DATA_BYTES){v.type=DATA_STRING;size_t n;const char *s=value_text_n(d,&n,v);JSValue out=JS_NewArrayBufferCopy(ctx,(const uint8_t *)s,n);value_text_free(d,s);return out;}
    if(v.type==DATA_STRING){size_t n;const char *s=value_text_n(d,&n,v);JSValue out=JS_NewStringLen(ctx,s,n);value_text_free(d,s);return out;}
    lua_State *L=d->lua;
    if(value_is_table(v)){
        value_push(d,v);int lazy=luaL_getmetafield(L,-1,"__pairs")!=LUA_TNIL;lua_pop(L,lazy?2:1);
        if(lazy){d->budget=200;lua_sethook(L,data_hook,LUA_MASKCOUNT,1000);lua_pushcfunction(L,materialize);value_push(d,v);int failed=lua_pcall(L,1,0,0);lua_sethook(L,NULL,0,0);if(failed){lua_pop(L,1);return JS_ThrowTypeError(ctx,"Could not materialize game sensors");}}
    }
    JSValue out=v.type==DATA_ARRAY?JS_NewArray(ctx):JS_NewObject(ctx);
    if(v.type==DATA_ARRAY){int n=value_length(d,v);for(int i=0;i<n;i++){Value item=value_at(d,v,i);JS_SetPropertyUint32(ctx,out,i,to_js(d,ctx,item,depth+1));value_free(d,item);}}
    else if(value_is_table(v)){
        value_push(d,v);lua_pushnil(L);while(lua_next(L,-2)){
            if(lua_type(L,-2)==LUA_TSTRING||lua_type(L,-2)==LUA_TNUMBER){char numeric[64];if(lua_type(L,-2)==LUA_TNUMBER)snprintf(numeric,sizeof(numeric),"%.17g",lua_tonumber(L,-2));const char *key=lua_type(L,-2)==LUA_TSTRING?lua_tostring(L,-2):numeric;lua_pushvalue(L,-1);Value item=value_take(d);JS_SetPropertyStr(ctx,out,key,to_js(d,ctx,item,depth+1));value_free(d,item);}lua_pop(L,1);
        }lua_pop(L,1);
    }return out;
}
static JSValue invoke(JSContext *ctx,int argc,JSValueConst *argv,GameOperation op){
    Value args[2]={VALUE_NIL,VALUE_NIL};for(int i=0;i<argc&&i<2;i++)args[i]=from_js(game,ctx,argv[i],0);
    Value result=op(game,VALUE_NIL,argc>2?2:argc,args);JSValue out=to_js(game,ctx,result,0);if(result.type==DATA_BYTES)result.type=DATA_STRING;value_free(game,result);
    for(int i=0;i<2;i++)value_free(game,args[i]);return out;
}
static JSValue call(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv){(void)self;return invoke(ctx,argc,argv,call_game);}
static JSValue frame(JSContext *ctx,JSValueConst self,int argc,JSValueConst *argv){(void)self;return invoke(ctx,argc,argv,frame_game);}
static int initialize(JSContext *ctx){
    if(initialize_game(game))return -1;JSValue global=JS_GetGlobalObject(ctx),api=JS_NewObject(ctx);
    JS_SetPropertyStr(ctx,api,"call",JS_NewCFunction(ctx,call,"call",2));JS_SetPropertyStr(ctx,api,"frame",JS_NewCFunction(ctx,frame,"frame",0));
    int result=JS_SetPropertyStr(ctx,global,"Game",api);JS_FreeValue(ctx,global);return result<0?-1:0;
}
int pi_run(int argc,char **argv,int integration,int (*init)(Data *),GameOperation call,GameOperation frame){
    game=data_new(256*1024*1024);if(!game)return 1;initialize_game=init;call_game=call;frame_game=frame;
    int result=dolly_quickjs_embed(argc,argv,integration?"/usr/src/dolly/slopyard/check.mjs":"/usr/src/dolly/slopyard/pi.mjs",initialize);
    data_close(game);game=NULL;return result;
}
