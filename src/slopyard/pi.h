#pragma once
#include "data.h"
typedef Value (*GameOperation)(Data *,Value,int,Value *);
int pi_run(int argc,char **argv,int integration,int (*initialize)(Data *),GameOperation call,GameOperation frame);
Value value_bytes(Data *d,const void *bytes,size_t size);
Value legacy_read(Data *d,const char *path);
Value legacy_parse(Data *d,const char *text,size_t size,const char *name);
