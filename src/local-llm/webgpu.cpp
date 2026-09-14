#include <webgpu/webgpu.h>
extern "C" {
#include <dolly/gpu.h>
}
#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

// The C API is an in-image adapter. Only dolly-gpu-0 packets cross the process ABI.
static dolly_gpu gpu;
static bool opened;
static uint64_t next_id, next_future;
static uint32_t features, subgroup_min, subgroup_max;
static WGPULimits limits = WGPU_LIMITS_INIT;
static std::string adapter_name;
static void require(bool value, const char *message) {
    if (!value) { fprintf(stderr,"Dolly WebGPU: %s\n",message); abort(); }
}
static void checked(int result) {
    if(result<0) { fprintf(stderr,"Dolly WebGPU: %s\n",strerror(errno)); abort(); }
}
template<class T> static T get(const void *p,size_t at) {T n;memcpy(&n,(const char*)p+at,sizeof n);return n;}
template<class T> static void put(void *p,size_t at,T n) {memcpy((char*)p+at,&n,sizeof n);}
static size_t aligned(size_t n) {return (n+7)&~size_t(7);}
static std::string string(WGPUStringView v) {return v.data ? std::string(v.data,v.length==WGPU_STRLEN?strlen(v.data):v.length) : std::string();}
static WGPUStringView view(const char *s) {return {s,strlen(s)};}
static WGPUFuture completed() {return {++next_future};}
static void flush() {if(gpu.count) {checked(dolly_gpu_batch(&gpu));dolly_gpu_begin(&gpu);}}
static void *record(unsigned op,size_t bytes) {
    if(gpu.count==256 || aligned(bytes)>sizeof(gpu.packet)-gpu.length)flush();
    return dolly_gpu_record(&gpu,op,bytes);
}
static void open_gpu() {
    if(opened)return;
    int n=dolly_gpu_open(&gpu,0,0);checked(n);adapter_name.assign((char*)gpu.reply+16,n-16);
    require(dolly_gpu_capabilities(&gpu)==128,"GPU provider does not implement capabilities");
    features=get<uint32_t>(gpu.reply,0);subgroup_min=get<uint32_t>(gpu.reply,88);subgroup_max=get<uint32_t>(gpu.reply,92);
    limits.maxBufferSize=get<uint64_t>(gpu.reply,8);limits.maxStorageBufferBindingSize=get<uint64_t>(gpu.reply,24);
    uint32_t *fields[]={&limits.minUniformBufferOffsetAlignment,&limits.minStorageBufferOffsetAlignment,
      &limits.maxComputeWorkgroupStorageSize,&limits.maxComputeInvocationsPerWorkgroup,&limits.maxComputeWorkgroupSizeX,
      &limits.maxComputeWorkgroupSizeY,&limits.maxComputeWorkgroupSizeZ,&limits.maxComputeWorkgroupsPerDimension,
      &limits.maxBindingsPerBindGroup,&limits.maxStorageBuffersPerShaderStage,&limits.maxUniformBuffersPerShaderStage,&limits.maxBindGroups};
    for(unsigned i=0;i<12;i++)*fields[i]=get<uint32_t>(gpu.reply,32+i*4);
    limits.maxUniformBufferBindingSize=get<uint64_t>(gpu.reply,80);
    fprintf(stderr,"Dolly WebGPU: %s, features=0x%x, max buffer=%llu MiB\n",adapter_name.c_str(),features,(unsigned long long)(limits.maxBufferSize>>20));
    opened=true;dolly_gpu_begin(&gpu);
    atexit([]{if(opened){flush();dolly_gpu_close(&gpu);opened=false;}});
}
struct Object {
    unsigned refs=1;
    uint64_t id=0;
    std::vector<Object*> held;
    void hold(Object *o) {require(o,"Null WebGPU object");o->refs++;held.push_back(o);}
    void release() {if(!--refs)delete this;}
    void destroy() {if(id && opened){auto p=record(DOLLY_GPU_RELEASE,16);put(p,8,id);id=0;}}
    virtual ~Object() {destroy();for(auto o:held)o->release();}
};
struct WGPUInstanceImpl:Object {};
struct WGPUAdapterImpl:Object {};
struct WGPUDeviceImpl:Object {};
struct WGPUQueueImpl:Object {};
struct WGPUBufferImpl:Object {uint64_t size,usage;size_t map_offset=0;std::vector<unsigned char> mapped;};
struct WGPUShaderModuleImpl:Object {};
struct WGPUComputePipelineImpl:Object {};
struct WGPUBindGroupLayoutImpl:Object {WGPUComputePipeline pipeline;};
struct WGPUBindGroupImpl:Object {};
struct Command {unsigned op;uint64_t a,b,c,d,e;};
struct WGPUCommandEncoderImpl:Object {std::vector<Command> commands;bool finished=false,pass=false;};
struct WGPUCommandBufferImpl:Object {std::vector<Command> commands;bool submitted=false;};
struct WGPUComputePassEncoderImpl:Object {WGPUCommandEncoder encoder;WGPUComputePipeline pipeline=nullptr;WGPUBindGroup group=nullptr;bool ended=false;};
#define REFS(T) \
 void wgpu##T##AddRef(WGPU##T o){if(o)o->refs++;} \
 void wgpu##T##Release(WGPU##T o){if(o)o->release();}
extern "C" {
// C++ descriptors contain optional handles even when the corresponding API
// is unsupported. Only their null AddRef/Release operations are valid here.
#define NULL_REFS(T) \
 void wgpu##T##AddRef(WGPU##T o){require(!o,"Unsupported " #T " handle");} \
 void wgpu##T##Release(WGPU##T o){require(!o,"Unsupported " #T " handle");}
NULL_REFS(Surface) NULL_REFS(PipelineLayout) NULL_REFS(TextureView) NULL_REFS(Sampler) NULL_REFS(QuerySet)
REFS(Instance) REFS(Adapter) REFS(Device) REFS(Queue) REFS(Buffer) REFS(ShaderModule)
REFS(ComputePipeline) REFS(BindGroupLayout) REFS(BindGroup) REFS(CommandEncoder) REFS(CommandBuffer) REFS(ComputePassEncoder)
WGPUInstance wgpuCreateInstance(const WGPUInstanceDescriptor *d) {
    if(d && d->nextInChain){fprintf(stderr,"Dolly WebGPU: unsupported instance chain\n");return nullptr;}
    if(d)for(size_t i=0;i<d->requiredFeatureCount;i++)if(d->requiredFeatures[i]!=WGPUInstanceFeatureName_TimedWaitAny){fprintf(stderr,"Dolly WebGPU: unsupported instance feature %u\n",unsigned(d->requiredFeatures[i]));return nullptr;}
    open_gpu();return new WGPUInstanceImpl;
}
WGPUFuture wgpuInstanceRequestAdapter(WGPUInstance,const WGPURequestAdapterOptions *d,WGPURequestAdapterCallbackInfo cb) {
    const bool valid=!d || (!d->nextInChain && !d->forceFallbackAdapter && !d->compatibleSurface);
    cb.callback(valid?WGPURequestAdapterStatus_Success:WGPURequestAdapterStatus_Unavailable,
      valid?new WGPUAdapterImpl:nullptr,view(valid?"":"Unsupported adapter options"),cb.userdata1,cb.userdata2);
    return completed();
}
WGPUBool wgpuAdapterHasFeature(WGPUAdapter,WGPUFeatureName f) {
    return (f==WGPUFeatureName_ShaderF16 && (features&1)) || (f==WGPUFeatureName_Subgroups && (features&2));
}
WGPUBool wgpuInstanceHasWGSLLanguageFeature(WGPUInstance,WGPUWGSLLanguageFeatureName f) {
    return f==WGPUWGSLLanguageFeatureName_Packed4x8IntegerDotProduct && (features&4);
}
WGPUStatus wgpuAdapterGetLimits(WGPUAdapter,WGPULimits *out) {if(out->nextInChain)return WGPUStatus_Error;*out=limits;return WGPUStatus_Success;}
WGPUStatus wgpuAdapterGetInfo(WGPUAdapter,WGPUAdapterInfo *out) {
    if(out->nextInChain)return WGPUStatus_Error;
    *out=WGPU_ADAPTER_INFO_INIT;out->vendor=view("");out->architecture=view("");out->device=view("Dolly WebGPU");
    out->description=view(adapter_name.c_str());out->subgroupMinSize=subgroup_min;out->subgroupMaxSize=subgroup_max;return WGPUStatus_Success;
}
void wgpuAdapterInfoFreeMembers(WGPUAdapterInfo) {} // Views belong to this process's GPU session.
WGPUFuture wgpuAdapterRequestDevice(WGPUAdapter a,const WGPUDeviceDescriptor *d,WGPURequestDeviceCallbackInfo cb) {
    bool valid=!d || !d->nextInChain;
    if(d)for(size_t i=0;i<d->requiredFeatureCount;i++)valid=valid && wgpuAdapterHasFeature(a,d->requiredFeatures[i]);
    // This adapter exposes exactly one admitted device, with no renegotiation.
    if(d && d->requiredLimits)valid=valid && memcmp(d->requiredLimits,&limits,sizeof limits)==0;
    cb.callback(valid?WGPURequestDeviceStatus_Success:WGPURequestDeviceStatus_Error,
      valid?new WGPUDeviceImpl:nullptr,view(valid?"":"Unsupported device requirements"),cb.userdata1,cb.userdata2);
    return completed();
}
WGPUWaitStatus wgpuInstanceWaitAny(WGPUInstance,size_t n,WGPUFutureWaitInfo *f,uint64_t) {
    for(size_t i=0;i<n;i++){if(!f[i].future.id || f[i].future.id>next_future)return WGPUWaitStatus_Error;f[i].completed=true;}
    return WGPUWaitStatus_Success;
}
WGPUQueue wgpuDeviceGetQueue(WGPUDevice) {return new WGPUQueueImpl;}
WGPUBuffer wgpuDeviceCreateBuffer(WGPUDevice,const WGPUBufferDescriptor *d) {
    require(d && !d->nextInChain && !d->mappedAtCreation,"Unsupported buffer descriptor");
    auto b=new WGPUBufferImpl;b->id=++next_id;b->size=d->size;b->usage=d->usage;
    auto p=record(DOLLY_GPU_CREATE_BUFFER,32);put(p,8,b->id);put(p,16,b->size);put(p,24,uint32_t(b->usage));return b;
}
uint64_t wgpuBufferGetSize(WGPUBuffer b) {return b->size;}
void wgpuBufferDestroy(WGPUBuffer b) {b->destroy();}
void wgpuQueueWriteBuffer(WGPUQueue,WGPUBuffer b,uint64_t offset,const void *data,size_t size) {
    require(offset%4==0 && size%4==0 && offset<=b->size && size<=b->size-offset,"Buffer write range");
    for(size_t at=0;at<size;) {
        size_t n=std::min(size-at,size_t(DOLLY_GPU_PACKET_BYTES-72));
        auto p=record(DOLLY_GPU_WRITE_BUFFER,32+n);put(p,8,b->id);put(p,16,offset+at);
        put(p,24,uint32_t(32));put(p,28,uint32_t(n));memcpy((char*)p+32,(const char*)data+at,n);at+=n;
    }
}
WGPUShaderModule wgpuDeviceCreateShaderModule(WGPUDevice,const WGPUShaderModuleDescriptor *d) {
    require(d && d->nextInChain && !d->nextInChain->next && d->nextInChain->sType==WGPUSType_ShaderSourceWGSL,"Only WGSL shader sources are supported");
    auto source=reinterpret_cast<const WGPUShaderSourceWGSL*>(d->nextInChain);auto code=string(source->code);
    auto s=new WGPUShaderModuleImpl;s->id=++next_id;
    auto p=record(DOLLY_GPU_CREATE_SHADER,24+code.size());put(p,8,s->id);put(p,16,uint32_t(code.size()));memcpy((char*)p+24,code.data(),code.size());
    return s;
}
WGPUComputePipeline wgpuDeviceCreateComputePipeline(WGPUDevice,const WGPUComputePipelineDescriptor *d) {
    require(d && !d->nextInChain && !d->layout && !d->compute.nextInChain,"Only automatic compute layouts are supported");
    auto entry=string(d->compute.entryPoint);size_t bytes=aligned(32+entry.size());
    for(size_t i=0;i<d->compute.constantCount;i++)bytes+=aligned(16+string(d->compute.constants[i].key).size());
    auto pipeline=new WGPUComputePipelineImpl;pipeline->id=++next_id;
    auto p=record(DOLLY_GPU_COMPUTE_CONSTANTS,bytes);put(p,8,pipeline->id);put(p,16,d->compute.module->id);
    put(p,24,uint32_t(entry.size()));put(p,28,uint32_t(d->compute.constantCount));memcpy((char*)p+32,entry.data(),entry.size());
    size_t at=aligned(32+entry.size());
    for(size_t i=0;i<d->compute.constantCount;i++) {
        auto &c=d->compute.constants[i];require(!c.nextInChain,"Constant extensions unsupported");auto key=string(c.key);
        put(p,at,uint32_t(key.size()));put(p,at+8,c.value);memcpy((char*)p+at+16,key.data(),key.size());at+=aligned(16+key.size());
    }
    return pipeline;
}
WGPUBindGroupLayout wgpuComputePipelineGetBindGroupLayout(WGPUComputePipeline pipeline,uint32_t index) {
    require(index==0,"Only bind group zero is supported");auto layout=new WGPUBindGroupLayoutImpl;layout->pipeline=pipeline;layout->hold(pipeline);return layout;
}
WGPUBindGroup wgpuDeviceCreateBindGroup(WGPUDevice,const WGPUBindGroupDescriptor *d) {
    require(d && !d->nextInChain && d->entryCount<=DOLLY_GPU_MAX_BINDINGS,"Bind group descriptor");
    auto group=new WGPUBindGroupImpl;group->id=++next_id;group->hold(d->layout);
    auto p=record(DOLLY_GPU_BIND_GROUP,32+24*d->entryCount);put(p,8,group->id);put(p,16,d->layout->pipeline->id);put(p,24,uint32_t(d->entryCount));
    bool seen[DOLLY_GPU_MAX_BINDINGS]={};
    for(size_t i=0;i<d->entryCount;i++) {
        auto &e=d->entries[i];require(!e.nextInChain && e.buffer && !e.sampler && !e.textureView && e.binding<d->entryCount && !seen[e.binding],"Only dense buffer bindings are supported");
        seen[e.binding]=true;group->hold(e.buffer);size_t at=32+24*e.binding;
        put(p,at,e.buffer->id);put(p,at+8,e.offset);put(p,at+16,e.size==WGPU_WHOLE_SIZE?e.buffer->size-e.offset:e.size);
    }
    return group;
}
WGPUCommandEncoder wgpuDeviceCreateCommandEncoder(WGPUDevice,const WGPUCommandEncoderDescriptor *d) {
    require(!d || !d->nextInChain,"Command encoder extensions unsupported");return new WGPUCommandEncoderImpl;
}
WGPUComputePassEncoder wgpuCommandEncoderBeginComputePass(WGPUCommandEncoder e,const WGPUComputePassDescriptor *d) {
    require(!e->finished && !e->pass && (!d || (!d->nextInChain && !d->timestampWrites)),"Compute pass descriptor");
    auto pass=new WGPUComputePassEncoderImpl;pass->encoder=e;pass->hold(e);e->pass=true;return pass;
}
void wgpuComputePassEncoderSetPipeline(WGPUComputePassEncoder p,WGPUComputePipeline pipeline) {require(!p->ended,"Ended compute pass");p->pipeline=pipeline;p->encoder->hold(pipeline);}
void wgpuComputePassEncoderSetBindGroup(WGPUComputePassEncoder p,uint32_t index,WGPUBindGroup group,size_t n,const uint32_t*) {
    require(!p->ended && index==0 && n==0,"Dynamic offsets and nonzero bind groups unsupported");p->group=group;p->encoder->hold(group);
}
void wgpuComputePassEncoderDispatchWorkgroups(WGPUComputePassEncoder p,uint32_t x,uint32_t y,uint32_t z) {
    require(!p->ended && p->pipeline && p->group,"Incomplete compute pass");
    p->encoder->commands.push_back({DOLLY_GPU_COMPUTE,p->pipeline->id,p->group->id,x,y,z});
}
void wgpuComputePassEncoderEnd(WGPUComputePassEncoder p) {require(!p->ended,"Ended compute pass");p->ended=true;p->encoder->pass=false;}
void wgpuCommandEncoderCopyBufferToBuffer(WGPUCommandEncoder e,WGPUBuffer src,uint64_t so,WGPUBuffer dst,uint64_t off,uint64_t n) {
    require(!e->finished && !e->pass,"Encoder is not recording copies");e->hold(src);e->hold(dst);e->commands.push_back({DOLLY_GPU_COPY_BUFFER,src->id,dst->id,so,off,n});
}
WGPUCommandBuffer wgpuCommandEncoderFinish(WGPUCommandEncoder e,const WGPUCommandBufferDescriptor *d) {
    require(!e->finished && !e->pass && (!d || !d->nextInChain),"Encoder cannot finish");e->finished=true;
    auto b=new WGPUCommandBufferImpl;b->commands=std::move(e->commands);b->held=std::move(e->held);return b;
}
void wgpuQueueSubmit(WGPUQueue,size_t n,const WGPUCommandBuffer *buffers) {
    flush();unsigned encoded=0;
    auto submit=[&]{if(encoded){dolly_gpu_submit(&gpu);flush();encoded=0;}};
    for(size_t i=0;i<n;i++) {
        auto b=buffers[i];require(!b->submitted,"Command buffer was already submitted");b->submitted=true;
        for(auto &c:b->commands) {
            if(encoded==200)submit();
            auto p=record(c.op,c.op==DOLLY_GPU_COMPUTE?40:48);put(p,8,c.a);put(p,16,c.b);
            if(c.op==DOLLY_GPU_COMPUTE){put(p,24,uint32_t(c.c));put(p,28,uint32_t(c.d));put(p,32,uint32_t(c.e));}
            else {put(p,24,c.c);put(p,32,c.d);put(p,40,c.e);}encoded++;
        }
    }
    submit();
}
WGPUFuture wgpuQueueOnSubmittedWorkDone(WGPUQueue,WGPUQueueWorkDoneCallbackInfo cb) {
    flush();int result=dolly_gpu_wait(&gpu);dolly_gpu_begin(&gpu);
    cb.callback(result<0?WGPUQueueWorkDoneStatus_Error:WGPUQueueWorkDoneStatus_Success,view(result<0?strerror(errno):""),cb.userdata1,cb.userdata2);return completed();
}
WGPUFuture wgpuBufferMapAsync(WGPUBuffer b,WGPUMapMode mode,size_t offset,size_t size,WGPUBufferMapCallbackInfo cb) {
    require(mode==WGPUMapMode_Read && b->mapped.empty() && offset<=b->size && size<=b->size-offset,"Only read mappings are supported");
    auto p=record(DOLLY_GPU_MAP_READ,32);put(p,8,b->id);put(p,16,uint64_t(offset));put(p,24,uint64_t(size));flush();
    b->mapped.resize(size);b->map_offset=offset;
    for(size_t at=0;at<size;){size_t n=std::min(size-at,size_t(DOLLY_GPU_REPLY_BYTES));checked(dolly_gpu_read(&gpu,b->id,at,n));memcpy(b->mapped.data()+at,gpu.reply,n);at+=n;}
    dolly_gpu_begin(&gpu);cb.callback(WGPUMapAsyncStatus_Success,view(""),cb.userdata1,cb.userdata2);return completed();
}
const void *wgpuBufferGetConstMappedRange(WGPUBuffer b,size_t offset,size_t size) {
    require(offset>=b->map_offset && offset-b->map_offset<=b->mapped.size() && size<=b->mapped.size()-(offset-b->map_offset),"Mapped range");return b->mapped.data()+offset-b->map_offset;
}
void wgpuBufferUnmap(WGPUBuffer b) {auto p=record(DOLLY_GPU_UNMAP,16);put(p,8,b->id);b->mapped.clear();}
}
