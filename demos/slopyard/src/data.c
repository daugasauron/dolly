#define _POSIX_C_SOURCE 200809L
#include "data.h"
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

static void *allocate(void *opaque,void *ptr,size_t old,size_t size){
    Data *d=opaque;if(!ptr)old=0;if(!size){free(ptr);d->bytes-=old;return NULL;}
    if(size>old&&size-old>d->limit-d->bytes)return NULL;
    void *next=realloc(ptr,size);if(next)d->bytes=d->bytes-old+size;return next;
}
void data_hook(lua_State *L,lua_Debug *ar){
    Data *d=*(Data **)lua_getextraspace(L);(void)ar;
    char frame;if(d->stack_base&&((uintptr_t)&frame>d->stack_base?(uintptr_t)&frame-d->stack_base:d->stack_base-(uintptr_t)&frame)>128*1024)luaL_error(L,"Script stack limit exceeded");
    if(--d->budget<=0)luaL_error(L,"Script execution budget exceeded");
}
Data *data_new(size_t limit){
    Data *d=calloc(1,sizeof(*d));if(!d)return NULL;d->limit=limit;d->lua=lua_newstate(allocate,d,0);
    if(!d->lua){free(d);return NULL;}*(Data **)lua_getextraspace(d->lua)=d;lua_newtable(d->lua);lua_pushboolean(d->lua,1);lua_setfield(d->lua,-2,"_array");d->array_ref=luaL_ref(d->lua,LUA_REGISTRYINDEX);return d;
}
void data_close(Data *d){if(d){lua_close(d->lua);free(d);}}
void value_push(Data *d,Value v){lua_State *L=d->lua;switch(v.type){
    case DATA_BOOL:lua_pushboolean(L,v.number!=0);break;
    case DATA_NUMBER:lua_pushnumber(L,v.number);break;
    case DATA_NULL:lua_pushlightuserdata(L,NULL);break;
    case DATA_STRING:case DATA_TABLE:case DATA_ARRAY:case DATA_FUNCTION:if(v.ref<0)lua_pushvalue(L,-v.ref);else lua_rawgeti(L,LUA_REGISTRYINDEX,v.ref);break;
    default:lua_pushnil(L);break;
}}
Value value_take(Data *d){
    lua_State *L=d->lua;Value v=VALUE_NIL;int type=lua_type(L,-1);
    if(type==LUA_TBOOLEAN)v=(Value){.type=DATA_BOOL,.number=lua_toboolean(L,-1)};
    else if(type==LUA_TNUMBER)v=value_number(d,lua_tonumber(L,-1));
    else if(type==LUA_TLIGHTUSERDATA)v=VALUE_NULL;
    else if(type==LUA_TSTRING||type==LUA_TTABLE||type==LUA_TFUNCTION){
        v.type=type==LUA_TSTRING?DATA_STRING:type==LUA_TFUNCTION?DATA_FUNCTION:DATA_TABLE;
        if(type==LUA_TTABLE){
            if(lua_getmetatable(L,-1)){lua_getfield(L,-1,"_array");if(lua_toboolean(L,-1))v.type=DATA_ARRAY;lua_pop(L,2);}
            if(v.type==DATA_TABLE){int array=0;lua_pushnil(L);while(lua_next(L,-2)){if(!lua_isinteger(L,-2)||lua_tointeger(L,-2)<1){array=0;lua_pop(L,2);break;}array=1;lua_pop(L,1);}if(array)v.type=DATA_ARRAY;}
        }v.ref=d->scratch?-lua_gettop(L):luaL_ref(L,LUA_REGISTRYINDEX);return v;
    }lua_pop(L,1);return v;
}
Value value_string_n(Data *d,const char *s,size_t n){lua_pushlstring(d->lua,s,n);return value_take(d);}
Value value_string(Data *d,const char *s){return s?value_string_n(d,s,strlen(s)):VALUE_NIL;}
static Value reference(Data *d,int type){return (Value){.type=type,.ref=d->scratch?-lua_gettop(d->lua):luaL_ref(d->lua,LUA_REGISTRYINDEX)};}
Value value_record(Data *d,int fields){lua_createtable(d->lua,0,fields);return reference(d,DATA_TABLE);}
Value value_table(Data *d){return value_record(d,0);}
Value value_sequence(Data *d,int count){lua_State *L=d->lua;lua_createtable(L,count,0);lua_rawgeti(L,LUA_REGISTRYINDEX,d->array_ref);lua_setmetatable(L,-2);return reference(d,DATA_ARRAY);}
Value value_array(Data *d){return value_sequence(d,0);}
Value value_copy(Data *d,Value v){if(v.type>=DATA_STRING&&v.type<=DATA_FUNCTION){value_push(d,v);return reference(d,v.type);}return v;}
void value_free(Data *d,Value v){if(v.type>=DATA_STRING&&v.type<=DATA_FUNCTION){if(v.ref<0){lua_pushnil(d->lua);lua_replace(d->lua,-v.ref);}else luaL_unref(d->lua,LUA_REGISTRYINDEX,v.ref);}}
int value_length(Data *d,Value v){
    if(!value_is_table(v))return 0;lua_State *L=d->lua;value_push(d,v);lua_Integer n=lua_rawlen(L,-1);
    lua_pushnil(L);while(lua_next(L,-2)){if(lua_isinteger(L,-2)){lua_Integer key=lua_tointeger(L,-2);if(key>n&&key<INT_MAX)n=key;}lua_pop(L,1);}lua_pop(L,1);return n;
}
Value value_get(Data *d,Value v,const char *key){
    if(!value_is_table(v))return VALUE_NIL;
    if(v.type==DATA_ARRAY&&!strcmp(key,"length"))return value_number(d,value_length(d,v));
    value_push(d,v);lua_getfield(d->lua,-1,key);lua_remove(d->lua,-2);return value_take(d);
}
Value value_at(Data *d,Value v,uint32_t index){if(!value_is_table(v))return VALUE_NIL;value_push(d,v);lua_rawgeti(d->lua,-1,(lua_Integer)index+1);lua_remove(d->lua,-2);return value_take(d);}
void value_set(Data *d,Value v,const char *key,Value item){value_push(d,v);lua_pushstring(d->lua,key);value_push(d,item);lua_rawset(d->lua,-3);lua_pop(d->lua,1);value_free(d,item);}
void value_set_at(Data *d,Value v,uint32_t index,Value item){
    lua_State *L=d->lua;value_push(d,v);value_push(d,item);lua_rawseti(L,-2,(lua_Integer)index+1);lua_pop(L,1);value_free(d,item);
}
const char *value_text_n(Data *d,size_t *length,Value v){if(!value_is_string(v))return NULL;value_push(d,v);size_t n;const char *s=lua_tolstring(d->lua,-1,&n);char *copy=malloc(n+1);if(copy){memcpy(copy,s,n);copy[n]=0;if(length)*length=n;}lua_pop(d->lua,1);return copy;}
const char *value_text(Data *d,Value v){return value_text_n(d,NULL,v);}
void value_text_free(Data *d,const char *s){(void)d;free((void *)s);}
int value_double(Data *d,double *out,Value v){(void)d;if(v.type!=DATA_NUMBER&&v.type!=DATA_BOOL)return -1;*out=v.number;return 0;}
int value_int(Data *d,int *out,Value v){double n;if(value_double(d,&n,v)||!isfinite(n)||n<INT_MIN||n>INT_MAX)return -1;*out=n;return 0;}
int value_truth(Data *d,Value v){(void)d;return v.type==DATA_NIL||v.type==DATA_NULL?0:v.type==DATA_NUMBER||v.type==DATA_BOOL?v.number!=0:1;}
Value value_error(Data *d,const char *format,...){va_list args;va_start(args,format);vsnprintf(d->error,sizeof(d->error),format,args);va_end(args);return VALUE_ERROR;}
Value value_exception(Data *d){Value v=value_string(d,d->error);d->error[0]=0;return v;}

typedef struct {char *text;size_t length,capacity;const void *parents[64];size_t limit;int failed,nodes;} Writer;
static void write_bytes(Writer *w,const char *s,size_t n){
    if(w->failed)return;if(n>w->limit-w->length){w->failed=1;return;}
    if(w->length+n+1>w->capacity){size_t next=(w->length+n+1)*2;char *p=realloc(w->text,next);if(!p){w->failed=1;return;}w->text=p;w->capacity=next;}
    memcpy(w->text+w->length,s,n);w->length+=n;w->text[w->length]=0;
}
static void write_string(Writer *w,const char *s,size_t n){
    if(memchr(s,'\n',n)&&!memchr(s,0,n)){
        int level=0;char close[40]="]]",open[40]="[[";while(strstr(s,close)&&level<30){level++;close[0]=']';memset(close+1,'=',level);close[level+1]=']';close[level+2]=0;}
        open[0]='[';memset(open+1,'=',level);open[level+1]='[';open[level+2]=0;write_bytes(w,open,level+2);write_bytes(w,"\n",1);write_bytes(w,s,n);write_bytes(w,close,level+2);return;
    }
    write_bytes(w,"\"",1);for(size_t i=0;i<n;i++){unsigned char c=s[i];if(c=='"'||c=='\\'){write_bytes(w,"\\",1);write_bytes(w,s+i,1);}else if(c<32||c==127){char code[5];snprintf(code,sizeof(code),"\\%03u",c);write_bytes(w,code,4);}else write_bytes(w,s+i,1);}write_bytes(w,"\"",1);
}
static void write_value(lua_State *L,int index,Writer *w,int depth){
    if(++w->nodes>1000000||depth==64){w->failed=1;return;}index=lua_absindex(L,index);
    switch(lua_type(L,index)){
    case LUA_TNIL:case LUA_TLIGHTUSERDATA:write_bytes(w,"nil",3);break;
    case LUA_TBOOLEAN:if(lua_toboolean(L,index))write_bytes(w,"true",4);else write_bytes(w,"false",5);break;
    case LUA_TNUMBER:{double n=lua_tonumber(L,index);char s[64];int bytes=isfinite(n)?snprintf(s,sizeof(s),"%.17g",n):snprintf(s,sizeof(s),"%s",isnan(n)?"(0/0)":n>0?"(1/0)":"(-1/0)");write_bytes(w,s,bytes);break;}
    case LUA_TSTRING:{size_t n;const char *s=lua_tolstring(L,index,&n);write_string(w,s,n);break;}
    case LUA_TTABLE:{
        const void *p=lua_topointer(L,index);for(int i=0;i<depth;i++)if(w->parents[i]==p){w->failed=1;return;}w->parents[depth]=p;
        int array=0;if(lua_getmetatable(L,index)){lua_pushliteral(L,"_array");lua_rawget(L,-2);array=lua_toboolean(L,-1);lua_pop(L,2);}if(array)write_bytes(w,"array",5);
        write_bytes(w,"{",1);int first=1,top=lua_gettop(L),iterator=0;
        if(luaL_getmetafield(L,index,"__pairs")!=LUA_TNIL){lua_pushvalue(L,index);lua_call(L,1,3);iterator=lua_gettop(L)-2;}else lua_pushnil(L);
        for(;;){
            if(iterator){lua_pushvalue(L,iterator);lua_pushvalue(L,iterator+1);lua_pushvalue(L,iterator+2);lua_call(L,2,2);if(lua_isnil(L,-2)){lua_pop(L,2);break;}lua_pushvalue(L,-2);lua_replace(L,iterator+2);}
            else if(!lua_next(L,index))break;
            if(!first)write_bytes(w,",",1);first=0;if(lua_type(L,-2)!=LUA_TSTRING&&lua_type(L,-2)!=LUA_TNUMBER)w->failed=1;
            write_bytes(w,"[ ",2);write_value(L,-2,w,depth+1);write_bytes(w," ]=",3);write_value(L,-1,w,depth+1);lua_pop(L,iterator?2:1);if(w->failed)break;
        }lua_settop(L,top);
        write_bytes(w,"}",1);break;
    }
    default:w->failed=1;break;
    }
}
static int dump_value(lua_State *L){Writer *w=lua_touserdata(L,2);write_value(L,1,w,0);return 0;}
char *data_dump(Data *d,Value v,size_t *length){
    Writer w={.limit=d->limit<128*1024*1024?d->limit:128*1024*1024};write_bytes(&w,"return ",7);lua_State *L=d->lua;int top=lua_gettop(L);
    d->budget=200;lua_sethook(L,data_hook,LUA_MASKCOUNT,1000);lua_pushcfunction(L,dump_value);value_push(d,v);lua_pushlightuserdata(L,&w);
    int status=lua_pcall(L,2,0,0);lua_settop(L,top);lua_sethook(L,NULL,0,0);write_bytes(&w,"\n",1);if(w.failed||status){free(w.text);return NULL;}if(length)*length=w.length;return w.text;
}
typedef struct {const char *source,*name;size_t length;} Input;
static int parse_array(lua_State *L){luaL_checktype(L,1,LUA_TTABLE);Data *d=*(Data **)lua_getextraspace(L);lua_rawgeti(L,LUA_REGISTRYINDEX,d->array_ref);lua_setmetatable(L,1);lua_settop(L,1);return 1;}
static int parse_value(lua_State *L){
    Input *input=lua_touserdata(L,1);if(luaL_loadbufferx(L,input->source,input->length,input->name,"t"))return lua_error(L);
    lua_newtable(L);lua_pushcfunction(L,parse_array);lua_setfield(L,-2,"array");lua_setupvalue(L,-2,1);lua_call(L,0,1);return 1;
}
Value data_parse(Data *d,const char *s,size_t n,const char *name){
    lua_State *L=d->lua;int top=lua_gettop(L);d->budget=4000;lua_sethook(L,data_hook,LUA_MASKCOUNT,1000);
    Input input={s,name,n};lua_pushcfunction(L,parse_value);lua_pushlightuserdata(L,&input);int status=lua_pcall(L,1,1,0);
    lua_sethook(L,NULL,0,0);if(status){value_error(d,"%s",lua_tostring(L,-1));lua_settop(L,top);return VALUE_ERROR;}
    Value v=value_take(d);size_t bytes;char *proof=data_dump(d,v,&bytes);
    if(!proof){value_free(d,v);return value_error(d,"Save contains non-data values, cycles, excessive depth or size");}free(proof);return v;
}
Value data_read(Data *d,const char *path){
    FILE *f=fopen(path,"rb");if(!f)return VALUE_NIL;fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);
    if(n<0||n>128*1024*1024){fclose(f);return value_error(d,"Save is too large");}
    char *s=malloc(n+1);if(!s){fclose(f);return VALUE_ERROR;}size_t count=fread(s,1,n,f);fclose(f);s[count]=0;Value v=data_parse(d,s,count,path);free(s);return v;
}
int data_write(Data *d,Value v,const char *path){
    size_t n;char *s=data_dump(d,v,&n);char temp[512];snprintf(temp,sizeof(temp),"%s.tmp",path);FILE *f=s?fopen(temp,"wb"):NULL;
    int good=0;if(f){good=fwrite(s,1,n,f)==n;if(fclose(f))good=0;if(good)good=rename(temp,path)==0;}if(!good)remove(temp);free(s);return good;
}
Value data_clone(Data *target,Data *source,Value v){size_t n;char *s=data_dump(source,v,&n);if(!s)return VALUE_ERROR;Value out=data_parse(target,s,n,"copied data");free(s);return out;}
