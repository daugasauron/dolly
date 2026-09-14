#include <dolly/gpu.h>
#include <dolly/process.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void u32(void *p, size_t at, uint32_t n) { memcpy((char *)p+at,&n,4); }
static void u64(void *p, size_t at, uint64_t n) { memcpy((char *)p+at,&n,8); }
static int call(dolly_gpu *g, unsigned operation, size_t bytes) {
  u32(g->packet,0,DOLLY_GPU_VERSION);u32(g->packet,4,operation);
  u64(g->packet,8,g->scope);u64(g->packet,16,++g->sequence);
  u32(g->packet,24,bytes-32);u32(g->packet,28,0);
  int64_t result=dolly_process_call(DOLLY_GPU_PROCESS_OP,g->packet,bytes,g->reply,sizeof(g->reply));
  if(result<0) { errno=(int)-result;return -1; }
  return (int)result;
}
int dolly_gpu_open(dolly_gpu *g, uint32_t width, uint32_t height) {
  memset(g,0,sizeof(*g));u32(g->packet,32,width);u32(g->packet,36,height);
  int n=call(g,DOLLY_GPU_OPEN,40);
  if(n>=16) memcpy(&g->scope,g->reply,8);
  else if(n>=0) {errno=EPROTO;return -1;}
  return n;
}
int dolly_gpu_close(dolly_gpu *g) {return call(g,DOLLY_GPU_CLOSE,32);}
int dolly_gpu_wait(dolly_gpu *g) {return call(g,DOLLY_GPU_WAIT,32);}
int dolly_gpu_info(dolly_gpu *g) {return call(g,DOLLY_GPU_INFO,32);}
int dolly_gpu_capabilities(dolly_gpu *g) {return call(g,DOLLY_GPU_CAPABILITIES,32);}
int dolly_gpu_read(dolly_gpu *g, uint64_t buffer, uint64_t offset, uint64_t length) {
  u64(g->packet,32,buffer);u64(g->packet,40,offset);u64(g->packet,48,length);
  return call(g,DOLLY_GPU_READ,56);
}
void dolly_gpu_begin(dolly_gpu *g) { g->length=40;g->count=0;u32(g->packet,36,0); }
void *dolly_gpu_record(dolly_gpu *g, uint32_t opcode, size_t bytes) {
  bytes=(bytes+7)&~(size_t)7;
  if(bytes<8 || bytes>sizeof(g->packet)-g->length || g->count==256) {
    fputs("GPU client packet capacity exceeded\n",stderr);abort();
  }
  void *p=g->packet+g->length;memset(p,0,bytes);g->length+=bytes;g->count++;
  u32(p,0,opcode);u32(p,4,bytes);return p;
}
int dolly_gpu_batch(dolly_gpu *g) {u32(g->packet,32,g->count);return call(g,DOLLY_GPU_BATCH,g->length);}
void dolly_gpu_buffer(dolly_gpu *g,uint64_t id,uint64_t size,uint32_t usage) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_CREATE_BUFFER,32);u64(p,8,id);u64(p,16,size);u32(p,24,usage);
}
void dolly_gpu_write(dolly_gpu *g,uint64_t id,const void *data,uint32_t size) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_WRITE_BUFFER,32+size);u64(p,8,id);u32(p,24,32);u32(p,28,size);memcpy((char *)p+32,data,size);
}
void dolly_gpu_shader(dolly_gpu *g,uint64_t id,const char *code) {
  size_t n=strlen(code);void *p=dolly_gpu_record(g,DOLLY_GPU_CREATE_SHADER,24+n);
  u64(p,8,id);u32(p,16,n);memcpy((char *)p+24,code,n);
}
void dolly_gpu_pipeline(dolly_gpu *g,uint64_t id,uint64_t shader,const char *vs,const char *fs,uint32_t blend) {
  size_t a=strlen(vs),b=strlen(fs);void *p=dolly_gpu_record(g,DOLLY_GPU_RENDER_PIPELINE,40+a+b);
  u64(p,8,id);u64(p,16,shader);u32(p,28,blend);u32(p,32,a);u32(p,36,b);
  memcpy((char *)p+40,vs,a);memcpy((char *)p+40+a,fs,b);
}
void dolly_gpu_compute_pipeline(dolly_gpu *g,uint64_t id,uint64_t shader,const char *entry) {
  size_t n=strlen(entry);void *p=dolly_gpu_record(g,DOLLY_GPU_COMPUTE_PIPELINE,32+n);
  u64(p,8,id);u64(p,16,shader);u32(p,24,n);memcpy((char *)p+32,entry,n);
}
void dolly_gpu_group(dolly_gpu *g,uint64_t id,uint64_t pipeline,unsigned count,const uint64_t *buffers,const uint64_t *sizes) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_BIND_GROUP,32+24*count);u64(p,8,id);u64(p,16,pipeline);u32(p,24,count);
  for(unsigned i=0;i<count;i++){u64(p,32+i*24,buffers[i]);u64(p,48+i*24,sizes[i]);}
}
void dolly_gpu_draw(dolly_gpu *g,uint64_t pipeline,uint64_t group,unsigned vertices,unsigned instances,unsigned width,unsigned height,int clear) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_RENDER,64);u64(p,8,pipeline);u64(p,16,group);
  u32(p,24,vertices);u32(p,28,instances);u32(p,32,width);u32(p,36,height);u32(p,56,!!clear);
}
void dolly_gpu_dispatch(dolly_gpu *g,uint64_t pipeline,uint64_t group,unsigned x) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_COMPUTE,40);u64(p,8,pipeline);u64(p,16,group);u32(p,24,x);u32(p,28,1);u32(p,32,1);
}
void dolly_gpu_copy(dolly_gpu *g,uint64_t src,uint64_t dst,uint64_t size) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_COPY_BUFFER,48);u64(p,8,src);u64(p,16,dst);u64(p,40,size);
}
void dolly_gpu_map(dolly_gpu *g,uint64_t id,uint64_t size) {
  void *p=dolly_gpu_record(g,DOLLY_GPU_MAP_READ,32);u64(p,8,id);u64(p,24,size);
}
void dolly_gpu_submit(dolly_gpu *g) {dolly_gpu_record(g,DOLLY_GPU_SUBMIT,8);}
