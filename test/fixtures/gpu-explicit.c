// gpu@0's explicit records on a real device: texture views, explicit layouts, a whole render
// pipeline with two targets, depth and dynamic offsets, an absent attachment, a render pass
// continued across two batches, multisample resolve, an explicit compute pass with indirect
// dispatch into a storage texture, copies, buffer clears, timestamps, sRGB views of storage
// textures, tier-1 formats, the surface as a view-pass attachment, and refusals.
#include <dolly/gpu.h>
#include <assert.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum { MAP_READ = 1, COPY_SRC = 4, COPY_DST = 8, INDEX = 16, VERTEX = 32, UNIFORM = 64, STORAGE = 128, INDIRECT = 256,
  QUERY_RESOLVE = 512 };
enum { T_COPY_SRC = 1, T_COPY_DST = 2, T_SAMPLED = 4, T_STORAGE = 8, T_RENDER = 16 };
enum { RGBA8 = 1, R8 = 3, DEPTH32 = 6 };

static dolly_gpu gpu;
static unsigned next_id, bgra;
static uint64_t features;
static unsigned id(void) { return ++next_id; }
static void u16(void *p, unsigned at, uint16_t v) { memcpy((char*)p+at,&v,2); }
static void u32(void *p, unsigned at, uint32_t v) { memcpy((char*)p+at,&v,4); }
static void u64(void *p, unsigned at, uint64_t v) { memcpy((char*)p+at,&v,8); }
static void f32(void *p, unsigned at, float v) { memcpy((char*)p+at,&v,4); }
static void batch(void) { if(dolly_gpu_batch(&gpu)<0){perror("GPU batch");abort();}dolly_gpu_begin(&gpu); }
static void continued(void) { if(dolly_gpu_continue(&gpu)<0){perror("GPU continued batch");abort();}dolly_gpu_begin(&gpu); }
// Refused by the provider's checks, or by WebGPU's validation, which the next WAIT reports.
static void rejected(int expected) {
  int status=dolly_gpu_batch(&gpu);
  if(status!=-1)status=dolly_gpu_wait(&gpu);
  if(status!=-1 || errno!=expected){fprintf(stderr,"expected errno %d, got status %d errno %d\n",expected,status,errno);abort();}
  dolly_gpu_begin(&gpu);
}
static unsigned buffer(const void *data, unsigned size, unsigned usage) {
  unsigned n=id();dolly_gpu_buffer(&gpu,n,size,usage);
  if(data)dolly_gpu_write(&gpu,n,data,size);
  return n;
}
static unsigned texture(unsigned dimension, unsigned width, unsigned height, unsigned layers, unsigned format,
    unsigned usage, unsigned samples) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_TEXTURE,48);
  u64(p,8,n);u32(p,16,width);u32(p,20,height);u32(p,24,layers);u32(p,28,1);u32(p,32,format);u32(p,36,usage);
  u32(p,40,dimension);u16(p,44,samples);return n;
}
static unsigned view(unsigned texture, unsigned dimension, unsigned base_layer, unsigned layers, uint32_t swizzle) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_VIEW,56);
  u64(p,8,n);u64(p,16,texture);u32(p,28,dimension);u32(p,44,base_layer);u32(p,48,layers);u32(p,52,swizzle);return n;
}
static void layout_entry(void *p, unsigned i, unsigned binding, unsigned visibility, unsigned type, unsigned a, unsigned b, unsigned c) {
  unsigned at=24+i*32;u32(p,at,binding);u32(p,at+4,visibility);u32(p,at+8,type);u32(p,at+12,a);u32(p,at+16,b);u32(p,at+20,c);
}
static void group_entry(void *p, unsigned i, unsigned binding, unsigned kind, unsigned resource, uint64_t offset, uint64_t size) {
  unsigned at=32+i*32;u32(p,at,binding);u32(p,at+4,kind);u64(p,at+8,resource);u64(p,at+16,offset);u64(p,at+24,size);
}
static unsigned pipeline_layout(unsigned group_layout) {
  unsigned n=id();void *p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_PIPELINE_LAYOUT,32);
  u64(p,8,n);u32(p,16,1);u64(p,24,group_layout);return n;
}
static void copy_texture_to_buffer(unsigned texture, unsigned buffer, unsigned width, unsigned height) {
  void *p=dolly_gpu_record(&gpu,DOLLY_GPU_COPY_TEXTURE_TO_BUFFER,72);
  u64(p,8,buffer);u32(p,24,256);u32(p,28,height);u64(p,32,texture);u32(p,60,width);u32(p,64,height);u32(p,68,1);
}
static const unsigned char *readback(unsigned buffer, unsigned bytes) {
  dolly_gpu_map(&gpu,buffer,bytes);batch();
  assert(dolly_gpu_read(&gpu,buffer,0,bytes)==(int)bytes);
  u64(dolly_gpu_record(&gpu,DOLLY_GPU_UNMAP,16),8,buffer);batch();
  return gpu.reply;
}
static void texel(const unsigned char *rows, unsigned x, unsigned y, int r, int g, int b, int a) {
  const unsigned char *p=rows+y*256+x*4;
  if(abs(p[0]-r)>2 || abs(p[1]-g)>2 || abs(p[2]-b)>2 || abs(p[3]-a)>2) {
    fprintf(stderr,"texel %u,%u is %d,%d,%d,%d, not %d,%d,%d,%d\n",x,y,p[0],p[1],p[2],p[3],r,g,b,a);abort();
  }
}

static const char *render_shader =
  "struct U { color: vec4f, depth: f32 }\n"
  "@group(0) @binding(0) var<uniform> u: U;\n"
  "@group(0) @binding(1) var layer: texture_2d<f32>;\n"
  "@group(0) @binding(2) var linear: sampler;\n"
  "struct V { @builtin(position) position: vec4f, @location(0) uv: vec2f }\n"
  "@vertex fn vs(@location(0) p: vec2f) -> V { return V(vec4f(p, u.depth, 1), p * 0.5 + 0.5); }\n"
  "struct F { @location(0) first: vec4f, @location(1) second: vec4f }\n"
  "@fragment fn fs(v: V) -> F {\n"
  "  let c = u.color + textureSample(layer, linear, v.uv) * 0.5;\n"
  "  return F(c, vec4f(1 - c.rgb, 1));\n"
  "}\n";
static const char *compute_shader =
  "@group(0) @binding(0) var image: texture_storage_2d<rgba8unorm, write>;\n"
  "@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) i: vec3u) {\n"
  "  textureStore(image, i.xy, vec4f(f32(i.x) / 7, f32(i.y) / 7, 0.5, 1));\n"
  "}\n";

int main(void) {
  assert(dolly_gpu_open(&gpu,64,64)>=16);
  assert(dolly_gpu_capabilities(&gpu)==128);
  uint32_t capabilities;memcpy(&capabilities,gpu.reply,4);
  assert(capabilities&DOLLY_GPU_FEATURE_EXPLICIT);bgra=!!(capabilities&DOLLY_GPU_FEATURE_SURFACE_BGRA);
  assert(dolly_gpu_limits(&gpu)==280);
  uint64_t limits[35];memcpy(limits,gpu.reply,280);features=limits[0];
  assert(limits[5]>=4 && limits[23]>=4); // maxBindGroups, maxColorAttachments
  printf("GPU explicit limits: features %#llx, %llu bind groups, %llu sampled textures per stage\n",
    (unsigned long long)features,(unsigned long long)limits[5],(unsigned long long)limits[9]);
  dolly_gpu_begin(&gpu);

  // A two-layer texture whose second layer is green, uploaded by a buffer copy, seen through a view.
  static unsigned char green[256*4];
  for(unsigned i=0;i<4;i++)for(unsigned x=0;x<4;x++){unsigned char *p=green+i*256+x*4;p[1]=255;p[3]=255;}
  unsigned staging=buffer(green,sizeof green,COPY_SRC|COPY_DST);
  unsigned layered=texture(2,4,4,2,RGBA8,T_SAMPLED|T_COPY_DST,1);
  void *p=dolly_gpu_record(&gpu,DOLLY_GPU_COPY_BUFFER_TO_TEXTURE,72);
  u64(p,8,staging);u32(p,24,256);u32(p,28,4);u64(p,32,layered);u32(p,56,1);u32(p,60,4);u32(p,64,4);u32(p,68,1);
  unsigned layer_view=view(layered,2,1,1,0x03020100);
  unsigned sampler=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_SAMPLER,56);
  u64(p,8,sampler);u32(p,44,1);f32(p,48,0);f32(p,52,4);
  // Uniforms at two dynamic offsets: red at depth 0.5, then blue at 0.75, which the depth test hides.
  float uniforms[128]={1,0,0,1,0.5f};uniforms[64]=0;uniforms[66]=1;uniforms[67]=1;uniforms[68]=0.75f;
  unsigned uniform=buffer(uniforms,sizeof uniforms,UNIFORM|COPY_DST);
  static const float quad[]={-1,-1,1,-1,-1,1,1,1};
  static const uint16_t indices[]={0,1,2,2,1,3};
  static const uint32_t indirect[]={6,1,0,0,0};
  unsigned vertices=buffer(quad,sizeof quad,VERTEX|COPY_DST), index=buffer(indices,12,INDEX|COPY_DST);
  unsigned arguments=buffer(indirect,sizeof indirect,INDIRECT|COPY_DST);
  unsigned module=id();dolly_gpu_shader(&gpu,module,render_shader);

  unsigned group_layout=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT,24+3*32);
  u64(p,8,group_layout);u32(p,16,3);
  layout_entry(p,0,0,3,1,1,0,0);layout_entry(p,1,1,2,7,1,2,0);layout_entry(p,2,2,2,4,0,0,0);
  u64(p,24+24,32);
  unsigned layout=pipeline_layout(group_layout);
  unsigned group=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_BIND_GROUP,32+3*32);
  u64(p,8,group);u64(p,16,group_layout);u32(p,24,3);
  group_entry(p,0,0,0,uniform,0,32);group_entry(p,1,1,2,layer_view,0,0);group_entry(p,2,2,1,sampler,0,0);

  // Two colour targets and depth32float; one buffer of float32x2 positions.
  static const char vs[]="vs", fs[]="fs";
  unsigned size=160+2*40+16*2+2+2;
  unsigned pipeline=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_RENDER_PIPELINE,size);
  u64(p,8,pipeline);u64(p,16,layout);u64(p,24,module);u64(p,32,module);
  u32(p,60,DEPTH32);u32(p,64,1);u32(p,68,2); // depth write, less
  for(unsigned face=0;face<2;face++)u32(p,72+face*16,8);
  u32(p,104,255);u32(p,108,255);u32(p,124,1);u32(p,128,0xffffffff);
  u32(p,136,2);u32(p,140,1);u32(p,144,1);u32(p,152,2);u32(p,156,2);
  for(unsigned t=0;t<2;t++){u32(p,160+t*40,RGBA8);u32(p,164+t*40,15);}
  u32(p,240,8);                    // stride
  u32(p,256,0);u32(p,260,0);u32(p,264,2);u32(p,268,0); // float32x2 at location 0
  memcpy((char*)p+272,vs,2);memcpy((char*)p+274,fs,2);

  unsigned first=texture(2,16,16,1,RGBA8,T_RENDER|T_COPY_SRC,1), second=texture(2,16,16,1,RGBA8,T_RENDER|T_COPY_SRC,1);
  unsigned depth=texture(2,16,16,1,DEPTH32,T_RENDER,1);
  unsigned first_view=view(first,0,0,0,0x03020100), second_view=view(second,0,0,0,0x03020100), depth_view=view(depth,0,0,0,0x03020100);
  dolly_gpu_submit(&gpu);batch();

  // The pass: begun and drawn once in one batch, continued, drawn again and ended in the next.
  p=dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_VIEW_PASS,64+2*40);
  u64(p,8,depth_view);u32(p,16,2);u32(p,28,1);f32(p,40,1);
  for(unsigned t=0;t<2;t++){u64(p,64+t*40,t?second_view:first_view);u32(p,64+t*40+16,1);}
  u64(dolly_gpu_record(&gpu,DOLLY_GPU_SET_PIPELINE,16),8,pipeline);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_BIND_GROUP,32);u64(p,8,group);u32(p,20,1);u32(p,24,0);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_VERTEX_BUFFER,40);u64(p,8,vertices);u64(p,32,sizeof quad);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_INDEX_BUFFER,40);u64(p,8,index);u32(p,16,1);u64(p,32,12);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_DRAW_INDEXED,32);u32(p,8,6);u32(p,12,1);
  continued();
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_BIND_GROUP,32);u64(p,8,group);u32(p,20,1);u32(p,24,256);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_DRAW_INDEXED_INDIRECT,24);u64(p,8,arguments);
  dolly_gpu_record(&gpu,DOLLY_GPU_END_RENDER_PASS,8);
  unsigned out=buffer(NULL,256*16,COPY_DST|MAP_READ), out2=buffer(NULL,256*16,COPY_DST|MAP_READ);
  copy_texture_to_buffer(first,out,16,16);copy_texture_to_buffer(second,out2,16,16);
  dolly_gpu_submit(&gpu);batch();
  const unsigned char *rows=readback(out,256*16);
  texel(rows,8,8,255,128,0,255);texel(rows,0,15,255,128,0,255);
  rows=readback(out2,256*16);texel(rows,8,8,0,127,255,255);

  // No attachment at location 0: the pass's colour 0 and the pipeline's target 0 are absent, and
  // the draw writes location 1 alone, into the second texture cleared to black.
  unsigned sparse=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_RENDER_PIPELINE,size);
  u64(p,8,sparse);u64(p,16,layout);u64(p,24,module);u64(p,32,module);
  u32(p,124,1);u32(p,128,0xffffffff);
  u32(p,136,2);u32(p,140,1);u32(p,144,1);u32(p,152,2);u32(p,156,2);
  u32(p,160+36,1);u32(p,200,RGBA8);u32(p,204,15);
  u32(p,240,8);u32(p,264,2);
  memcpy((char*)p+272,vs,2);memcpy((char*)p+274,fs,2);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_VIEW_PASS,64+2*40);
  u32(p,16,2);u32(p,60,1);u64(p,104,second_view);u32(p,120,1);f32(p,140,1);
  u64(dolly_gpu_record(&gpu,DOLLY_GPU_SET_PIPELINE,16),8,sparse);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_BIND_GROUP,32);u64(p,8,group);u32(p,20,1);u32(p,24,0);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_VERTEX_BUFFER,40);u64(p,8,vertices);u64(p,32,sizeof quad);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_INDEX_BUFFER,40);u64(p,8,index);u32(p,16,1);u64(p,32,12);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_DRAW_INDEXED,32);u32(p,8,6);u32(p,12,1);
  dolly_gpu_record(&gpu,DOLLY_GPU_END_RENDER_PASS,8);
  copy_texture_to_buffer(second,out2,16,16);
  dolly_gpu_submit(&gpu);batch();
  rows=readback(out2,256*16);texel(rows,8,8,0,127,255,255);

  // Multisample resolve: a cleared four-sample texture resolved into a single-sample one.
  unsigned msaa=texture(2,16,16,1,RGBA8,T_RENDER,4), resolved=texture(2,16,16,1,RGBA8,T_RENDER|T_COPY_SRC,1);
  unsigned msaa_view=view(msaa,0,0,0,0x03020100), resolved_view=view(resolved,0,0,0,0x03020100);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_VIEW_PASS,64+40);
  u32(p,16,1);u64(p,64,msaa_view);u64(p,72,resolved_view);u32(p,80,1);u32(p,84,1);
  f32(p,88,0.25f);f32(p,92,0.5f);f32(p,96,0.75f);f32(p,100,1);
  dolly_gpu_record(&gpu,DOLLY_GPU_END_RENDER_PASS,8);
  copy_texture_to_buffer(resolved,out,16,16);
  dolly_gpu_submit(&gpu);batch();
  rows=readback(out,256*16);texel(rows,3,3,64,128,191,255);

  // An explicit compute pass, dispatched indirectly, writes a storage texture; a texture copy
  // and a buffer clear follow.
  unsigned image=texture(2,8,8,1,RGBA8,T_STORAGE|T_COPY_SRC,1), copy=texture(2,8,8,1,RGBA8,T_COPY_DST|T_COPY_SRC,1);
  unsigned image_view=view(image,0,0,0,0x03020100);
  static const uint32_t one_group[]={1,1,1};
  unsigned dispatch=buffer(one_group,sizeof one_group,INDIRECT|COPY_DST);
  unsigned compute_module=id();dolly_gpu_shader(&gpu,compute_module,compute_shader);
  unsigned storage_layout=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT,56);
  u64(p,8,storage_layout);u32(p,16,1);layout_entry(p,0,0,4,8,1,2,RGBA8);
  unsigned storage_group=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_BIND_GROUP,64);
  u64(p,8,storage_group);u64(p,16,storage_layout);u32(p,24,1);group_entry(p,0,0,2,image_view,0,0);
  unsigned storage_pipeline_layout=pipeline_layout(storage_layout);
  unsigned compute=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_COMPUTE_PIPELINE,48);
  u64(p,8,compute);u64(p,16,storage_pipeline_layout);u64(p,24,compute_module);u32(p,36,4);memcpy((char*)p+40,"main",4);
  dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_COMPUTE_PASS,8);
  u64(dolly_gpu_record(&gpu,DOLLY_GPU_SET_PIPELINE,16),8,compute);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_BIND_GROUP,24);u64(p,8,storage_group);
  u64(dolly_gpu_record(&gpu,DOLLY_GPU_DISPATCH_INDIRECT,24),8,dispatch);
  dolly_gpu_record(&gpu,DOLLY_GPU_END_COMPUTE_PASS,8);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE,72);
  u64(p,8,image);u64(p,16,copy);u32(p,56,8);u32(p,60,8);u32(p,64,1);
  copy_texture_to_buffer(copy,out,8,8);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_CLEAR_BUFFER,32);u64(p,8,out2);u64(p,24,256*16);
  dolly_gpu_submit(&gpu);batch();
  rows=readback(out,256*8);texel(rows,7,0,255,0,128,255);texel(rows,0,7,0,255,128,255);
  rows=readback(out2,256*16);
  for(unsigned i=0;i<256*16;i++)assert(rows[i]==0);

  // Timestamps around a pass, where the device has them.
  if(features&8) {
    unsigned queries=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_QUERY_SET,24);u64(p,8,queries);u32(p,16,2);
    unsigned resolve=buffer(NULL,256,QUERY_RESOLVE|COPY_SRC), times=buffer(NULL,16,COPY_DST|MAP_READ);
    p=dolly_gpu_record(&gpu,DOLLY_GPU_WRITE_TIMESTAMP,24);u64(p,8,queries);
    dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_COMPUTE_PASS,8);
    u64(dolly_gpu_record(&gpu,DOLLY_GPU_SET_PIPELINE,16),8,compute);
    p=dolly_gpu_record(&gpu,DOLLY_GPU_SET_BIND_GROUP,24);u64(p,8,storage_group);
    p=dolly_gpu_record(&gpu,DOLLY_GPU_DISPATCH,24);u32(p,8,1);u32(p,12,1);u32(p,16,1);
    dolly_gpu_record(&gpu,DOLLY_GPU_END_COMPUTE_PASS,8);
    p=dolly_gpu_record(&gpu,DOLLY_GPU_WRITE_TIMESTAMP,24);u64(p,8,queries);u32(p,16,1);
    p=dolly_gpu_record(&gpu,DOLLY_GPU_RESOLVE_QUERY_SET,40);u64(p,8,queries);u32(p,20,2);u64(p,24,resolve);
    dolly_gpu_copy(&gpu,resolve,times,16);
    dolly_gpu_submit(&gpu);batch();
    uint64_t t[2];memcpy(t,readback(times,16),16);assert(t[1]>=t[0]);
    printf("GPU explicit timestamps: %llu ns around one dispatch\n",(unsigned long long)(t[1]-t[0]));
  }

  // A swizzled view exists only where the device grants the feature.
  unsigned gray=texture(2,4,4,1,R8,T_SAMPLED,1);
  batch();
  view(gray,0,0,0,0x05000000);
  if(features&1024)batch();else rejected(ENOTSUP);

  // An sRGB view of a storage texture leaves out the storage its format lacks; under
  // texture-formats-tier1, r16unorm is a storage format.
  unsigned storable=id();p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_TEXTURE,48);
  u64(p,8,storable);u32(p,16,4);u32(p,20,4);u32(p,24,1);u32(p,28,1);u32(p,32,RGBA8);u32(p,36,T_STORAGE|T_SAMPLED);
  u32(p,40,2);u16(p,44,1);u16(p,46,2);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_VIEW,56);u64(p,8,id());u64(p,16,storable);u32(p,24,2);u32(p,52,0x03020100);
  batch();
  if(features&2048) {
    texture(2,4,4,1,57,T_STORAGE|T_COPY_SRC,1);
    p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT,56);u64(p,8,id());u32(p,16,1);layout_entry(p,0,0,4,8,1,2,57);
    batch();
  }

  // The surface as a view-pass attachment, captured.
  unsigned frame=buffer(NULL,256*64,COPY_DST|MAP_READ);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_VIEW_PASS,104);
  u32(p,16,1);u32(p,20,64);u32(p,24,64);u32(p,80,1);f32(p,88,1);f32(p,100,1);
  dolly_gpu_record(&gpu,DOLLY_GPU_END_RENDER_PASS,8);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_CAPTURE_FRAME,32);u64(p,8,frame);u32(p,24,64);u32(p,28,64);
  dolly_gpu_submit(&gpu);batch();
  rows=readback(frame,256*64);
  texel(rows,32,32,bgra?0:255,0,bgra?255:0,255);

  // Refusals: pass state outside its pass, a draw in a compute pass, an unknown batch flag, a
  // layout whose size disagrees with its count, storage on a texture of the compact kind.
  u64(dolly_gpu_record(&gpu,DOLLY_GPU_SET_PIPELINE,16),8,pipeline);rejected(EINVAL);
  dolly_gpu_record(&gpu,DOLLY_GPU_BEGIN_COMPUTE_PASS,8);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_DRAW,24);u32(p,8,3);u32(p,12,1);rejected(EINVAL);
  u32(gpu.packet,36,2);rejected(EINVAL);
  p=dolly_gpu_record(&gpu,DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT,56);u64(p,8,id());u32(p,16,2);rejected(EINVAL);
  texture(0,4,4,1,RGBA8,T_STORAGE,1);rejected(EINVAL);
  assert(dolly_gpu_close(&gpu)==0);
  puts("GPU explicit records PASS");
  return 0;
}
