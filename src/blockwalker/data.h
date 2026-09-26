#pragma once
#include <lua.h>
#include <lauxlib.h>
#include <lualib.h>
#include <stddef.h>
#include <stdint.h>

typedef struct Data {lua_State *lua;size_t bytes,limit;int budget,array_ref,scratch;uintptr_t stack_base;void *owner;char error[256];} Data;
enum {DATA_NIL,DATA_NULL,DATA_BOOL,DATA_NUMBER,DATA_STRING,DATA_TABLE,DATA_ARRAY,DATA_FUNCTION,DATA_ERROR};
typedef struct {int type,ref;double number;} Value;
#define VALUE_NIL ((Value){0})
#define VALUE_NULL ((Value){.type=DATA_NULL})
#define VALUE_TRUE ((Value){.type=DATA_BOOL,.number=1})
#define VALUE_FALSE ((Value){.type=DATA_BOOL})
#define VALUE_ERROR ((Value){.type=DATA_ERROR})
Data *data_new(size_t limit);
void data_close(Data *d);
void data_hook(lua_State *L,lua_Debug *ar);
void value_push(Data *d,Value v);
Value value_take(Data *d);
static inline Value value_number(Data *d,double n){(void)d;return (Value){.type=DATA_NUMBER,.number=n};}
static inline Value value_bool(Data *d,int b){(void)d;return b?VALUE_TRUE:VALUE_FALSE;}
Value value_string(Data *d,const char *s);
Value value_string_n(Data *d,const char *s,size_t n);
Value value_record(Data *d,int fields);
Value value_sequence(Data *d,int count);
Value value_table(Data *d);
Value value_array(Data *d);
Value value_copy(Data *d,Value v);
void value_free(Data *d,Value v);
Value value_get(Data *d,Value v,const char *key);
Value value_at(Data *d,Value v,uint32_t index);
void value_set(Data *d,Value v,const char *key,Value item);
void value_set_at(Data *d,Value v,uint32_t index,Value item);
int value_length(Data *d,Value v);
const char *value_text(Data *d,Value v);
const char *value_text_n(Data *d,size_t *length,Value v);
void value_text_free(Data *d,const char *s);
int value_double(Data *d,double *out,Value v);
int value_int(Data *d,int *out,Value v);
int value_truth(Data *d,Value v);
Value value_error(Data *d,const char *format,...);
Value value_exception(Data *d);
char *data_dump(Data *d,Value v,size_t *length);
Value data_parse(Data *d,const char *s,size_t n,const char *name);
Value data_read(Data *d,const char *path);
int data_write(Data *d,Value v,const char *path);
Value data_clone(Data *target,Data *source,Value value);
static inline int value_is_nil(Value v){return v.type==DATA_NIL;}
static inline int value_is_null(Value v){return v.type==DATA_NULL||v.type==DATA_NIL;}
static inline int value_is_bool(Value v){return v.type==DATA_BOOL;}
static inline int value_is_number(Value v){return v.type==DATA_NUMBER;}
static inline int value_is_string(Value v){return v.type==DATA_STRING;}
static inline int value_is_array(Value v){return v.type==DATA_ARRAY;}
static inline int value_is_table(Value v){return v.type==DATA_TABLE||v.type==DATA_ARRAY;}
static inline int value_is_error(Value v){return v.type==DATA_ERROR;}
