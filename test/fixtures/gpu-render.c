#include <dolly/gpu.h>
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static dolly_gpu gpu;
static unsigned next_id, bgra;
static unsigned id(void) { return ++next_id; }
static void u32(void *p, unsigned at, uint32_t v) { memcpy((char*)p+at,&v,4); }
static void u64(void *p, unsigned at, uint64_t v) { memcpy((char*)p+at,&v,8); }
static void f32(void *p, unsigned at, float v) { memcpy((char*)p+at,&v,4); }
static unsigned shader(const char *s) { unsigned n=id();dolly_gpu_shader(&gpu,n,s);return n; }
static unsigned buffer(const void *data, unsigned size, unsigned usage) {
  unsigned n=id();dolly_gpu_buffer(&gpu,n,size,usage);
  if(data)dolly_gpu_write(&gpu,n,data,size);
  return n;
}
static unsigned texture(unsigned width,unsigned height,unsigned layers,unsigned mips,unsigned format,unsigned usage) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_TEXTURE,48);
  u64(p,8,n);u32(p,16,width);u32(p,20,height);u32(p,24,layers);u32(p,28,mips);u32(p,32,format);u32(p,36,usage);return n;
}
static void upload(unsigned n,unsigned mip,unsigned layer,unsigned x,unsigned y,unsigned w,unsigned h,const void *data,unsigned bytes) {
  void *p=dolly_gpu_record(&gpu,DOLLY_GPU_WRITE_TEXTURE,48+bytes);
  u64(p,8,n);u32(p,16,mip);u32(p,20,layer);u32(p,24,x);u32(p,28,y);u32(p,32,w);u32(p,36,h);u32(p,40,bytes);memcpy((char*)p+48,data,bytes);
}
static unsigned pipeline(unsigned vs,unsigned fs,unsigned color,unsigned depth) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_GRAPHICS_PIPELINE,176);
  u64(p,8,n);u64(p,16,vs);u64(p,24,fs);u32(p,32,color);u32(p,36,depth);
  u32(p,52,2);u32(p,56,1);u32(p,72,15);u32(p,84,1);u32(p,96,1);u32(p,104,2);u32(p,108,2);
  u32(p,112,12);u32(p,128,8); // Two vertex streams: position and UV.
  u32(p,152,3); // Attribute zero: slot 0, location 0, float32x3.
  u32(p,160,1);u32(p,164,1);u32(p,168,2); // Slot 1, location 1, float32x2.
  return n;
}
static unsigned uniform_group(unsigned pipeline,unsigned index,unsigned buf,unsigned offset) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_RESOURCE_GROUP,64);
  u64(p,8,n);u64(p,16,pipeline);u32(p,24,index);u32(p,28,1);
  u64(p,40,buf);u64(p,48,offset);u64(p,56,16);return n;
}
static unsigned texture_group(unsigned pipeline,unsigned texture,unsigned sampler,unsigned kind) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_RESOURCE_GROUP,96);
  u64(p,8,n);u64(p,16,pipeline);u32(p,24,1);u32(p,28,2);
  u32(p,36,kind);u64(p,40,texture);u32(p,64,1);u32(p,68,3);u64(p,72,sampler);return n;
}
static void begin(unsigned color,unsigned depth) {
  void *p=dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_RENDER_PASS,64);
  u64(p,8,color);u64(p,16,depth);u32(p,24,64);u32(p,28,64);u32(p,32,1);u32(p,36,1);f32(p,52,1);f32(p,56,1);
}
static void end(void) { dolly_gpu_record(&gpu,DOLLY_GPU_END_RENDER_PASS,8); }
static void draw(unsigned pipeline,unsigned position,unsigned uv,unsigned indices,unsigned material,unsigned textures,unsigned transform) {
  void *p=dolly_gpu_record(&gpu,DOLLY_GPU_DRAW_MESH,152);
  u64(p,8,pipeline);u64(p,16,indices);u64(p,32,12);u32(p,40,6);u32(p,44,1);u32(p,60,1);u32(p,64,3);u32(p,68,2);
  u64(p,80,material);u64(p,88,textures);u64(p,96,transform);
  u64(p,104,position);u64(p,120,48);u64(p,128,uv);u64(p,144,32);
}
static void batch(void) { if(dolly_gpu_batch(&gpu)<0){perror("GPU batch");abort();}dolly_gpu_begin(&gpu); }
static void rejected(int expected) { assert(dolly_gpu_batch(&gpu)==-1);assert(errno==expected);dolly_gpu_begin(&gpu); }
static void pixel(unsigned x,unsigned y,unsigned r,unsigned g,unsigned b) {
  unsigned char *p=gpu.reply+(y*64+x)*4;
  assert(abs(p[bgra?2:0]-(int)r)<=1 && abs(p[1]-(int)g)<=1 && abs(p[bgra?0:2]-(int)b)<=1 && p[3]==255);
}
static void capture(unsigned readback) {
  static int mapped;
  if(mapped)u64(dolly_gpu_record(&gpu,DOLLY_GPU_UNMAP,16),8,readback);
  void *p=dolly_gpu_record(&gpu,DOLLY_GPU_CAPTURE_FRAME,32);u64(p,8,readback);u32(p,24,64);u32(p,28,64);
  dolly_gpu_submit(&gpu);dolly_gpu_map(&gpu,readback,64*64*4);batch();
  assert(dolly_gpu_read(&gpu,readback,0,64*64*4)==64*64*4);
  mapped=1;
}
int main(int argc,char **argv) {
  (void)argv;
  assert(dolly_gpu_open(&gpu,64,64)>=16);
  assert(dolly_gpu_capabilities(&gpu)==128);
  unsigned features;memcpy(&features,gpu.reply,4);assert(features&DOLLY_GPU_FEATURE_TEXTURE_RENDER);bgra=!!(features&DOLLY_GPU_FEATURE_SURFACE_BGRA);
  dolly_gpu_begin(&gpu);
  // Invalid spans reject the entire packet before an earlier allocation.
  unsigned source=texture(2,2,1,2,1,6);
  unsigned char colors[16]={255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255};
  void *bad=dolly_gpu_record(&gpu,DOLLY_GPU_WRITE_TEXTURE,48);u64(bad,8,source);u32(bad,40,0xffffffff);
  rejected(EINVAL);next_id=0;source=texture(2,2,1,2,1,6);batch();
  upload(source,2,0,0,0,1,1,colors,4);rejected(EINVAL);
  upload(source,0,1,0,0,1,1,colors,4);rejected(EINVAL);
  upload(source,0,0,2,0,1,1,colors,4);rejected(EINVAL);
  upload(source,0,0,0,0,2,2,colors,16);
  upload(source,1,0,0,0,1,1,colors,4);batch();
  // Six full mip chains exceed the per-texture 1 GiB ceiling; no allocation.
  texture(8192,8192,6,14,1,4);rejected(ENOMEM);
  end();rejected(EINVAL);
  unsigned target=texture(64,64,1,1,1,20),depth=texture(64,64,1,1,6,16);
  unsigned sampler=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_SAMPLER,48);u64(p,8,sampler);u32(p,44,1);
  static const float positions[]={-1,-1,0,1,-1,0,-1,1,0,1,1,0},uvs[]={0,1,1,1,0,0,1,0};
  static const unsigned short indices[]={0,1,2,2,1,3};
  float uniforms[256]={0};
  uniforms[0]=uniforms[1]=uniforms[2]=uniforms[3]=1; // White tint.
  uniforms[64]=uniforms[67]=1; // Red tint, at byte 256.
  uniforms[130]=.2f;uniforms[194]=.8f; // Near/far depth at bytes 512/768.
  unsigned pos=buffer(positions,sizeof(positions),40),uv=buffer(uvs,sizeof(uvs),40),
    index=buffer(indices,sizeof(indices),24),uniform=buffer(uniforms,sizeof(uniforms),72),readback=buffer(NULL,64*64*4,9);
  unsigned vs=shader("struct Out {@builtin(position) p:vec4f,@location(0) uv:vec2f}; @group(2) @binding(0) var<uniform> shift:vec4f; @vertex fn main(@location(0) p:vec3f,@location(1) uv:vec2f)->Out {return Out(vec4f(p+shift.xyz,1),uv);}");
  unsigned fs=shader("@group(0) @binding(0) var<uniform> tint:vec4f; @group(1) @binding(0) var image:texture_2d<f32>; @group(1) @binding(1) var filtering:sampler; @fragment fn main(@location(0) uv:vec2f)->@location(0) vec4f {return textureSample(image,filtering,uv)*tint;}");
  unsigned offscreen=pipeline(vs,fs,1,6),surface=pipeline(vs,fs,0,0);
  unsigned white=uniform_group(offscreen,0,uniform,0),red=uniform_group(offscreen,0,uniform,256),
    source_group=texture_group(offscreen,source,sampler,1),near=uniform_group(offscreen,2,uniform,512),far=uniform_group(offscreen,2,uniform,768),
    surface_white=uniform_group(surface,0,uniform,0),target_group=texture_group(surface,target,sampler,1),surface_near=uniform_group(surface,2,uniform,512);
  batch();
  assert(features&DOLLY_GPU_FEATURE_LARGE_BATCH);
  for(unsigned i=0;i<DOLLY_GPU_MAX_COMMANDS;i++) {
    const float tint[4]={i+1==DOLLY_GPU_MAX_COMMANDS?1:0,1,1,1};
    dolly_gpu_write(&gpu,uniform,tint,sizeof(tint));
  }
  batch();
  draw(offscreen,pos,uv,index,white,source_group,near);rejected(EINVAL);
  begin(target,depth);begin(target,depth);rejected(EINVAL);
  begin(target,depth);draw(offscreen,pos,uv,index,white,source_group,near);draw(offscreen,pos,uv,index,red,source_group,far);end();
  begin(0,0);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_VIEWPORT,48);f32(p,8,8);f32(p,12,8);f32(p,16,48);f32(p,20,48);f32(p,28,1);
  u32(p,32,8);u32(p,36,8);u32(p,40,48);u32(p,44,48);
  draw(surface,pos,uv,index,surface_white,target_group,surface_near);end();
  capture(readback);
  pixel(0,0,0,0,0);pixel(16,16,255,0,0);pixel(48,16,0,255,0);pixel(16,48,0,0,255);pixel(48,48,255,255,0);pixel(63,63,0,0,0);
  assert(dolly_gpu_info(&gpu)==80);uint64_t before;memcpy(&before,gpu.reply+72,8);
  for(unsigned format=7;format<=9;format++) {
    if(!(features&DOLLY_GPU_FEATURE_TEXTURE_BC)) {
      texture(4,4,1,1,format,6);rejected(ENOSYS);continue;
    }
    texture(6,4,1,1,format,6);rejected(EINVAL);
    texture(4,4,1,1,format,20);rejected(EINVAL);
    unsigned bc=texture(12,12,6,4,format,6),block_bytes=format==7?8:16;
    batch();
    unsigned char data[144]={0};
    upload(bc,0,0,1,0,4,4,data,block_bytes);rejected(EINVAL);
    upload(bc,0,0,0,0,3,4,data,block_bytes);rejected(EINVAL);
    upload(bc,0,0,0,0,4,4,data,block_bytes-1);rejected(EINVAL);
    upload(bc,0,6,0,0,4,4,data,block_bytes);rejected(EINVAL);
    upload(bc,4,0,0,0,4,4,data,block_bytes);rejected(EINVAL);
    upload(bc,3,0,0,0,2,2,data,block_bytes);rejected(EINVAL);
    const unsigned short rgb565[]={0xf800,0x07e0,0x001f,0xffe0};
    const unsigned rgb[][3]={{255,0,0},{0,255,0},{0,0,255},{255,255,0}};
    for(unsigned face=0;face<6;face++)for(unsigned mip=0;mip<4;mip++) {
      unsigned width=((12u>>mip)+3)/4*4,blocks=width*width/16;
      memset(data,0,sizeof(data));
      for(unsigned block=0;block<blocks;block++) {
        unsigned char *bytes=data+block*block_bytes;
        if(format==8)memset(bytes,255,8);
        if(format==9)bytes[0]=255;
        memcpy(bytes+(format==7?0:8),&rgb565[(mip+face)%4],2);
      }
      upload(bc,mip,face,0,0,width,width,data,blocks*block_bytes);
    }
    unsigned bc_fs=shader("@group(0) @binding(0) var<uniform> settings:vec4f; @group(1) @binding(0) var image:texture_cube<f32>; @group(1) @binding(1) var sampling:sampler; @fragment fn main()->@location(0) vec4f {let directions=array<vec3f,6>(vec3f(1,0,0),vec3f(-1,0,0),vec3f(0,1,0),vec3f(0,-1,0),vec3f(0,0,1),vec3f(0,0,-1));return textureSampleLevel(image,sampling,directions[u32(settings.y)],settings.x);}");
    unsigned bc_pipeline=pipeline(vs,bc_fs,0,0),bc_settings=uniform_group(bc_pipeline,0,uniform,0),
      bc_group=texture_group(bc_pipeline,bc,sampler,2),bc_near=uniform_group(bc_pipeline,2,uniform,512);
    batch();
    for(unsigned face=0;face<6;face++)for(unsigned mip=0;mip<4;mip++) {
      float settings[]={mip,face,0,0};dolly_gpu_write(&gpu,uniform,settings,sizeof(settings));
      begin(0,0);draw(bc_pipeline,pos,uv,index,bc_settings,bc_group,bc_near);end();capture(readback);
      const unsigned *color=rgb[(mip+face)%4];pixel(32,32,color[0],color[1],color[2]);
    }
    before+=90*block_bytes;
    assert(dolly_gpu_info(&gpu)==80);uint64_t after;memcpy(&after,gpu.reply+72,8);assert(after==before);
  }
  printf("GPU BC texture checks: %s\n",features&DOLLY_GPU_FEATURE_TEXTURE_BC?"pixels, mips, cube faces, bounds, allocation bytes":"unsupported formats rejected");
  assert(dolly_gpu_info(&gpu)==80);uint64_t allocated;memcpy(&allocated,gpu.reply+72,8);assert(allocated>0);
  if(argc>1){puts("GPU_RENDER_HOLD");fflush(stdout);for(;;)sleep(1);}
  assert(dolly_gpu_close(&gpu)==0);
  assert(dolly_gpu_open(&gpu,0,0)>=16);assert(dolly_gpu_info(&gpu)==80);memcpy(&allocated,gpu.reply+72,8);assert(allocated==0);assert(dolly_gpu_close(&gpu)==0);
  puts("GPU texture/depth/indexed rendering PASS: offscreen, three groups, two streams, mip upload, viewport, pixels, bounds, recovery");
  return 0;
}
