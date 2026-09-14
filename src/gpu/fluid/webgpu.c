#include "platform.h"
#include <errno.h>

dolly_gpu fluid_gpu;
uint64_t fluid_clock;
static uint64_t next_id, render_pipeline, compute_pipeline, render_group, compute_group, vertex_buffer, vertex_offset, vertex_size;
static unsigned width,height;
uint64_t gpu_id(void) {return ++next_id;}
static bool clear;
static float clear_color[4];
static struct {uint64_t id,size;} buffers[128];
static uint64_t id(const void *p) {return (uintptr_t)p;}
static void put32(void *p,size_t o,uint32_t n) {memcpy((char*)p+o,&n,4);}
static void put64(void *p,size_t o,uint64_t n) {memcpy((char*)p+o,&n,8);}
static void unsupported(bool allowed) {if(!allowed){fputs("Unsupported fluid WebGPU descriptor\n",stderr);exit(1);}}
void gpu_check(int n) {if(n<0){perror("fluid GPU");exit(1);}}
void gpu_flush(void) {if(fluid_gpu.count)gpu_check(dolly_gpu_batch(&fluid_gpu));dolly_gpu_begin(&fluid_gpu);}
void gpu_reset_client(void) {next_id=0;memset(buffers,0,sizeof(buffers));dolly_gpu_begin(&fluid_gpu);}
void gpu_dimensions(unsigned w,unsigned h) {width=w;height=h;}
static void reserve(size_t n) {if(fluid_gpu.length+n>sizeof(fluid_gpu.packet)||fluid_gpu.count==256)gpu_flush();}
static void *record(unsigned op,size_t bytes) {reserve(bytes+7);return dolly_gpu_record(&fluid_gpu,op,bytes);}
static uint64_t buffer_size(WGPUBuffer b) {for(unsigned i=0;i<128;i++)if(buffers[i].id==id(b))return buffers[i].size;unsupported(false);return 0;}
WGPUBuffer wgpuDeviceCreateBuffer(WGPUDevice device,const WGPUBufferDescriptor *d) {
  (void)device;unsupported(!d->nextInChain&&!d->mappedAtCreation&&d->usage<=1023);
  uint64_t n=++next_id;unsigned i;for(i=0;i<128&&buffers[i].id;i++){}unsupported(i<128);
  buffers[i].id=n;buffers[i].size=d->size;
  reserve(32);dolly_gpu_buffer(&fluid_gpu,n,d->size,d->usage);return (WGPUBuffer)(uintptr_t)n;
}
void wgpuQueueWriteBuffer(WGPUQueue q,WGPUBuffer b,uint64_t offset,const void *data,size_t size) {
  (void)q;unsupported(offset%4==0&&size%4==0);
  while(size){size_t n=MIN(size,128*1024);void*p=record(DOLLY_GPU_WRITE_BUFFER,32+n);
    put64(p,8,id(b));put64(p,16,offset);put32(p,24,32);put32(p,28,n);memcpy((char*)p+32,data,n);
    offset+=n;data=(const char*)data+n;size-=n;}
}
wgpu_buffer_t wgpu_create_buffer(wgpu_context_t *ctx,const wgpu_buffer_desc_t *d) {
  WGPUBuffer b=wgpuDeviceCreateBuffer(ctx->device,&(WGPUBufferDescriptor){.usage=d->usage,.size=d->size,.mappedAtCreation=d->mapped_at_creation});
  if(d->initial.data)wgpuQueueWriteBuffer(ctx->queue,b,0,d->initial.data,d->initial.size?d->initial.size:d->size);
  return (wgpu_buffer_t){.buffer=b,.usage=d->usage,.size=d->size,.count=d->count};
}
static void release(uint64_t n) {if(n){void*p=record(DOLLY_GPU_RELEASE,16);put64(p,8,n);}}
void wgpuBufferRelease(WGPUBuffer b) {release(id(b));for(unsigned i=0;i<128;i++)if(buffers[i].id==id(b))buffers[i].id=0;}
void wgpu_destroy_buffer(wgpu_buffer_t *b) {if(b->buffer)wgpuBufferRelease(b->buffer);memset(b,0,sizeof(*b));}
void wgpuShaderModuleRelease(WGPUShaderModule s) {release(id(s));}
void wgpuComputePipelineRelease(WGPUComputePipeline p) {release(id(p));}
void wgpuRenderPipelineRelease(WGPURenderPipeline p) {release(id(p));}
void wgpuBindGroupRelease(WGPUBindGroup g) {release(id(g));}
WGPUShaderModule wgpu_create_shader_module(WGPUDevice device,const char *source) {
  (void)device;uint64_t n=++next_id;reserve(strlen(source)+32);dolly_gpu_shader(&fluid_gpu,n,source);return (WGPUShaderModule)(uintptr_t)n;
}
WGPUComputePipeline wgpuDeviceCreateComputePipeline(WGPUDevice device,const WGPUComputePipelineDescriptor *d) {
  (void)device;unsupported(!d->nextInChain&&!d->layout&&!d->compute.constantCount&&!d->compute.nextInChain);
  size_t length=d->compute.entryPoint.length;unsupported(length>0&&length<=64);char entry[65];memcpy(entry,d->compute.entryPoint.data,length);entry[length]=0;
  uint64_t n=++next_id;reserve(104);dolly_gpu_compute_pipeline(&fluid_gpu,n,id(d->compute.module),entry);return (WGPUComputePipeline)(uintptr_t)n;
}
WGPUBlendState wgpu_create_blend_state(bool enabled) {
  unsupported(!enabled);WGPUBlendComponent c={.operation=WGPUBlendOperation_Add,.srcFactor=WGPUBlendFactor_One,.dstFactor=WGPUBlendFactor_Zero};return (WGPUBlendState){.color=c,.alpha=c};
}
WGPURenderPipeline wgpuDeviceCreateRenderPipeline(WGPUDevice device,const WGPURenderPipelineDescriptor *d) {
  (void)device;unsupported(!d->nextInChain&&!d->layout&&!d->depthStencil&&d->vertex.bufferCount==1&&d->fragment&&d->fragment->module==d->vertex.module&&d->fragment->targetCount==1&&d->primitive.topology==WGPUPrimitiveTopology_TriangleList&&d->primitive.cullMode==WGPUCullMode_None&&d->multisample.count==1);
  const WGPUVertexBufferLayout *layout=d->vertex.buffers;
  unsupported(layout->stepMode==WGPUVertexStepMode_Vertex&&layout->attributeCount<=8&&layout->arrayStride<=2048);
  size_t a=d->vertex.entryPoint.length,b=d->fragment->entryPoint.length,count=layout->attributeCount;unsupported(a<=64&&b<=64);
  uint64_t n=++next_id;void*p=record(DOLLY_GPU_VERTEX_PIPELINE,48+count*16+a+b);
  put64(p,8,n);put64(p,16,id(d->vertex.module));put32(p,32,a);put32(p,36,b);put32(p,40,layout->arrayStride);put32(p,44,count);
  for(unsigned i=0;i<count;i++) {const WGPUVertexAttribute *attr=layout->attributes+i;unsigned components=attr->format==WGPUVertexFormat_Float32x2?2:attr->format==WGPUVertexFormat_Float32x3?3:attr->format==WGPUVertexFormat_Float32x4?4:0;unsupported(components&&attr->offset<=UINT32_MAX);
    put32(p,48+i*16,attr->shaderLocation);put32(p,52+i*16,components);put32(p,56+i*16,attr->offset);}
  memcpy((char*)p+48+count*16,d->vertex.entryPoint.data,a);memcpy((char*)p+48+count*16+a,d->fragment->entryPoint.data,b);
  return (WGPURenderPipeline)(uintptr_t)n;
}
WGPUBindGroupLayout wgpuComputePipelineGetBindGroupLayout(WGPUComputePipeline p,uint32_t index) {unsupported(index==0);return (WGPUBindGroupLayout)p;}
WGPUBindGroupLayout wgpuRenderPipelineGetBindGroupLayout(WGPURenderPipeline p,uint32_t index) {unsupported(index==0);return (WGPUBindGroupLayout)p;}
void wgpuBindGroupLayoutRelease(WGPUBindGroupLayout layout) {(void)layout;} /* Borrowed auto layout. */
WGPUBindGroup wgpuDeviceCreateBindGroup(WGPUDevice device,const WGPUBindGroupDescriptor *d) {
  (void)device;unsupported(!d->nextInChain&&d->entryCount<=DOLLY_GPU_MAX_BINDINGS);
  uint64_t n=++next_id;void*p=record(DOLLY_GPU_BIND_GROUP,32+d->entryCount*24);put64(p,8,n);put64(p,16,id(d->layout));put32(p,24,d->entryCount);
  for(unsigned i=0;i<d->entryCount;i++){const WGPUBindGroupEntry*e=d->entries+i;unsupported(e->binding==i&&e->buffer&&!e->sampler&&!e->textureView&&!e->nextInChain);put64(p,32+i*24,id(e->buffer));put64(p,40+i*24,e->offset);put64(p,48+i*24,e->size==WGPU_WHOLE_SIZE?buffer_size(e->buffer)-e->offset:e->size);}
  return (WGPUBindGroup)(uintptr_t)n;
}
WGPUStatus wgpuAdapterGetLimits(WGPUAdapter a,WGPULimits *limits) {(void)a;gpu_flush();gpu_check(dolly_gpu_info(&fluid_gpu));memset(limits,0,sizeof(*limits));memcpy(&limits->maxStorageBufferBindingSize,fluid_gpu.reply+8,8);limits->maxTextureDimension2D=4096;return WGPUStatus_Success;}
WGPUStatus wgpuDeviceGetLimits(WGPUDevice d,WGPULimits *l) {return wgpuAdapterGetLimits((WGPUAdapter)d,l);}
WGPUCommandEncoder wgpuDeviceCreateCommandEncoder(WGPUDevice d,const WGPUCommandEncoderDescriptor *desc) {(void)d;unsupported(!desc);return (WGPUCommandEncoder)1;}
WGPUComputePassEncoder wgpuCommandEncoderBeginComputePass(WGPUCommandEncoder e,const WGPUComputePassDescriptor *d) {unsupported(e==(WGPUCommandEncoder)1&&!d);return (WGPUComputePassEncoder)1;}
void wgpuComputePassEncoderSetPipeline(WGPUComputePassEncoder p,WGPUComputePipeline pipeline) {(void)p;compute_pipeline=id(pipeline);}
void wgpuComputePassEncoderSetBindGroup(WGPUComputePassEncoder p,uint32_t index,WGPUBindGroup g,size_t count,const uint32_t *offsets) {(void)p;(void)offsets;unsupported(index==0&&count==0);compute_group=id(g);}
void wgpuComputePassEncoderDispatchWorkgroups(WGPUComputePassEncoder e,uint32_t x,uint32_t y,uint32_t z) {(void)e;void*p=record(DOLLY_GPU_COMPUTE,40);put64(p,8,compute_pipeline);put64(p,16,compute_group);put32(p,24,x);put32(p,28,y);put32(p,32,z);}
void wgpuComputePassEncoderEnd(WGPUComputePassEncoder p) {(void)p;}
void wgpuComputePassEncoderRelease(WGPUComputePassEncoder p) {(void)p;}
void wgpuCommandEncoderCopyBufferToBuffer(WGPUCommandEncoder e,WGPUBuffer a,uint64_t ao,WGPUBuffer b,uint64_t bo,uint64_t size) {(void)e;void*p=record(DOLLY_GPU_COPY_BUFFER,48);put64(p,8,id(a));put64(p,16,id(b));put64(p,24,ao);put64(p,32,bo);put64(p,40,size);}
WGPURenderPassEncoder wgpuCommandEncoderBeginRenderPass(WGPUCommandEncoder e,const WGPURenderPassDescriptor *d) {(void)e;unsupported(d->colorAttachmentCount==1&&!d->depthStencilAttachment);clear=d->colorAttachments[0].loadOp==WGPULoadOp_Clear;const WGPUColor*c=&d->colorAttachments[0].clearValue;clear_color[0]=c->r;clear_color[1]=c->g;clear_color[2]=c->b;clear_color[3]=c->a;vertex_buffer=0;return (WGPURenderPassEncoder)1;}
void wgpuRenderPassEncoderSetPipeline(WGPURenderPassEncoder e,WGPURenderPipeline p) {(void)e;render_pipeline=id(p);}
void wgpuRenderPassEncoderSetBindGroup(WGPURenderPassEncoder e,uint32_t index,WGPUBindGroup g,size_t count,const uint32_t *o) {(void)e;(void)o;unsupported(index==0&&count==0);render_group=id(g);}
void wgpuRenderPassEncoderSetVertexBuffer(WGPURenderPassEncoder e,uint32_t slot,WGPUBuffer b,uint64_t offset,uint64_t size) {(void)e;unsupported(slot==0);vertex_buffer=id(b);vertex_offset=offset;vertex_size=size==WGPU_WHOLE_SIZE?buffer_size(b)-offset:size;}
void wgpuRenderPassEncoderDraw(WGPURenderPassEncoder e,uint32_t vertices,uint32_t instances,uint32_t first,uint32_t first_instance) {
  (void)e;unsupported(first==0&&first_instance==0&&vertex_buffer);void*p=record(DOLLY_GPU_RENDER_VERTEX,88);put64(p,8,render_pipeline);put64(p,16,render_group);put32(p,24,vertices);put32(p,28,instances);put32(p,32,width);put32(p,36,height);memcpy((char*)p+40,clear_color,16);put32(p,56,clear);put64(p,64,vertex_buffer);put64(p,72,vertex_offset);put64(p,80,vertex_size);clear=false;
}
void wgpuRenderPassEncoderEnd(WGPURenderPassEncoder p) {(void)p;}
void wgpuRenderPassEncoderRelease(WGPURenderPassEncoder p) {(void)p;}
WGPUCommandBuffer wgpuCommandEncoderFinish(WGPUCommandEncoder e,const WGPUCommandBufferDescriptor *d) {unsupported(e==(WGPUCommandEncoder)1&&!d);return (WGPUCommandBuffer)1;}
void wgpuQueueSubmit(WGPUQueue q,size_t count,const WGPUCommandBuffer *b) {(void)q;unsupported(count==1&&b[0]==(WGPUCommandBuffer)1);fluid_draw_overlay();reserve(8);dolly_gpu_submit(&fluid_gpu);gpu_flush();}
void wgpuCommandBufferRelease(WGPUCommandBuffer b) {(void)b;}
void wgpuCommandEncoderRelease(WGPUCommandEncoder e) {(void)e;}
