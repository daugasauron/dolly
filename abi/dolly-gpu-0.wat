(module
  ;; Experimental, additive process operation. The base process call/layout is
  ;; unchanged; an older kernel returns ENOSYS. No image needs a new libc.
  (import "env" "memory" (memory i64 1024 131072 shared))
  (import "env" "dolly_gpu_dispatch" (func (param i64 i64) (result i32)))
  (func (export "dolly_gpu_mailbox_address") (result i64) i64.const 0)

  (global (export "DOLLY_GPU_VERSION") i32 (i32.const 0))
  (global (export "DOLLY_GPU_PROCESS_OP") i32 (i32.const 128))
  (global (export "DOLLY_GPU_SLOTS") i32 (i32.const 8))
  (global (export "DOLLY_GPU_REPLY_BYTES") i32 (i32.const 65536))
  (global (export "DOLLY_GPU_PACKET_BYTES") i32 (i32.const 1048576))
  (global (export "DOLLY_GPU_HEADER_BYTES") i32 (i32.const 32))
  (global (export "DOLLY_GPU_OPEN") i32 (i32.const 1))
  (global (export "DOLLY_GPU_BATCH") i32 (i32.const 2))
  (global (export "DOLLY_GPU_WAIT") i32 (i32.const 3))
  (global (export "DOLLY_GPU_READ") i32 (i32.const 4))
  (global (export "DOLLY_GPU_CLOSE") i32 (i32.const 5))
  (global (export "DOLLY_GPU_INFO") i32 (i32.const 6))
  (global (export "DOLLY_GPU_CAPABILITIES") i32 (i32.const 7))
  (global (export "DOLLY_GPU_MAX_BINDINGS") i32 (i32.const 16))
  (global (export "DOLLY_GPU_CREATE_BUFFER") i32 (i32.const 1))
  (global (export "DOLLY_GPU_WRITE_BUFFER") i32 (i32.const 2))
  (global (export "DOLLY_GPU_CREATE_SHADER") i32 (i32.const 3))
  (global (export "DOLLY_GPU_RENDER_PIPELINE") i32 (i32.const 4))
  (global (export "DOLLY_GPU_COMPUTE_PIPELINE") i32 (i32.const 5))
  (global (export "DOLLY_GPU_BIND_GROUP") i32 (i32.const 6))
  (global (export "DOLLY_GPU_RENDER") i32 (i32.const 7))
  (global (export "DOLLY_GPU_COMPUTE") i32 (i32.const 8))
  (global (export "DOLLY_GPU_COPY_BUFFER") i32 (i32.const 9))
  (global (export "DOLLY_GPU_MAP_READ") i32 (i32.const 10))
  (global (export "DOLLY_GPU_UNMAP") i32 (i32.const 11))
  (global (export "DOLLY_GPU_RELEASE") i32 (i32.const 12))
  (global (export "DOLLY_GPU_SUBMIT") i32 (i32.const 13))
  (global (export "DOLLY_GPU_VERTEX_PIPELINE") i32 (i32.const 14))
  (global (export "DOLLY_GPU_RENDER_VERTEX") i32 (i32.const 15))

  (global (export "DOLLY_GPU_COMPUTE_CONSTANTS") i32 (i32.const 16))
  (global (export "DOLLY_GPU_CAPTURE_FRAME") i32 (i32.const 17))
  (global (export "DOLLY_GPU_FEATURE_CAPTURE_FRAME") i32 (i32.const 16))
  (global (export "DOLLY_GPU_FEATURE_SURFACE_BGRA") i32 (i32.const 32))

  ;; Additive graphics records. Clients must test FEATURE_TEXTURE_RENDER first.
  (global (export "DOLLY_GPU_FEATURE_TEXTURE_RENDER") i32 (i32.const 64))
  (global (export "DOLLY_GPU_CREATE_TEXTURE") i32 (i32.const 18))
  (global (export "DOLLY_GPU_WRITE_TEXTURE") i32 (i32.const 19))
  (global (export "DOLLY_GPU_CREATE_SAMPLER") i32 (i32.const 20))
  (global (export "DOLLY_GPU_GRAPHICS_PIPELINE") i32 (i32.const 21))
  (global (export "DOLLY_GPU_RESOURCE_GROUP") i32 (i32.const 22))
  (global (export "DOLLY_GPU_BEGIN_RENDER_PASS") i32 (i32.const 23))
  (global (export "DOLLY_GPU_END_RENDER_PASS") i32 (i32.const 24))
  (global (export "DOLLY_GPU_DRAW_MESH") i32 (i32.const 25))
  (global (export "DOLLY_GPU_VIEWPORT") i32 (i32.const 26))

  ;; All fields LE. Header: u32 version/op, u64 scope/sequence, u32 body/reserved.
  ;; Scope is a non-reused u32 lease, slot=(scope-1)%8; upper bits are zero.
  ;; OPEN starts with scope=0; kernel binds a process-owned lease before dispatch.
  ;; Sequence is nonzero u32, monotonically increasing per lease, never reused.
  ;; OPEN body: u32 width,height. Reply: u64 scope, u32 width,height, then
  ;; at most 240 UTF-8 bytes naming the admitted adapter (no terminating NUL).
  ;; BATCH body: u32 count,reserved then count records, each 8-byte aligned.
  ;; Record prefix: u32 opcode,bytes including prefix. Reserved fields are zero.
  ;; BUFFER[32]: u64 id,size; u32 WebGPU usage,reserved.
  ;; WRITE[32+n]: u64 id,offset; u32 data_offset,data_bytes; inline bytes.
  ;; SHADER[24+n]: u64 id; u32 code_bytes,reserved; inline UTF-8 WGSL.
  ;; RENDER_PIPELINE[40+n]: u64 id,shader; u32 topology,blend,vs_bytes,fs_bytes;
  ;; UTF-8 entry names. topology:0 triangle-list,1 triangle-strip; blend:0 opaque,
  ;; 1 premultiplied alpha,2 additive. Native descriptors/extension chains absent.
  ;; COMPUTE_PIPELINE[32+n]: u64 id,shader; u32 entry_bytes,reserved; UTF-8 entry.
  ;; COMPUTE_CONSTANTS[32+n]: COMPUTE_PIPELINE prefix, count replaces reserved.
  ;; Entry UTF-8 padded to 8, then <=16 constants: u32 name_bytes,reserved;
  ;; f64 finite_value; UTF-8 name padded to 8. Names <=64 bytes, unique.
  ;; VERTEX_PIPELINE[48+16*a+n]: RENDER_PIPELINE prefix through fs_bytes, then
  ;; u32 stride,attribute_count<=8; attributes: u32 location,components,offset,
  ;; reserved. Components 2/3/4 mean float32x2/x3/x4; one per-vertex buffer.
  ;; Vertex/fragment entry names follow the attributes. Stride <=2048, multiple 4.
  ;; BIND_GROUP[32+24*n]: u64 id,pipeline; u32 count,reserved; consecutive bindings
  ;; contain u64 buffer,offset,size. Group zero; pipeline supplies the layout.
  ;; At most DOLLY_GPU_MAX_BINDINGS entries; WebGPU device limits also apply.
  ;; RENDER[64]: u64 pipeline,group; u32 vertices,instances,width,height;
  ;; f32 clear_rgba[4]; u32 clear,reserved. Target is the designated Dolly surface.
  ;; RENDER_VERTEX[88]: RENDER followed by u64 vertex_buffer,offset,size.
  ;; COMPUTE[40]: u64 pipeline,group; u32 x,y,z,reserved.
  ;; COPY[48]: u64 source,dest,source_offset,dest_offset,bytes.
  ;; CAPTURE_FRAME[32]: u64 destination_buffer; u32 x,y,width,height.
  ;; Copies the current batch's rendered surface rectangle, before SUBMIT, to
  ;; buffer offset zero. Four bytes/pixel, row stride ceil(width*4/256)*256.
  ;; Surface lease required; no other surfaces or browser content are accessible.
  ;; MAP_READ[32]: u64 buffer,offset,bytes. Completes only after mapping is ready.
  ;; UNMAP/RELEASE[16]: u64 object. SUBMIT[8]: finish/submit this batch's encoder.
  ;; TEXTURE[48]: u64 id; u32 width,height,layers,mips,format,usage; u64 reserved.
  ;; Layers 1 or 6; cube faces must be square. Dimensions <=8192 and device limit.
  ;; Formats: 1 RGBA8unorm,2 RGBA8unorm-sRGB,3 R8unorm,4 RG8unorm,
  ;; 5 depth24plus-stencil8,6 depth32float. Texture usage is WebGPU usage bits
  ;; COPY_SRC=1,COPY_DST=2,TEXTURE_BINDING=4,RENDER_ATTACHMENT=16; storage absent.
  ;; Each texture <=1 GiB; all mip/layer bytes count against the shared 4 GiB
  ;; allocation quota (depth formats charged 4 bytes/pixel). Samples always 1.
  ;; WRITE_TEXTURE[48+n]: u64 id; u32 mip,layer,x,y,width,height,data_bytes,
  ;; reserved; tightly packed rows of native format bytes. Depth uploads absent.
  ;; SAMPLER[48]: u64 id; u32 min,mag,mip,address_u/v/w,compare,anisotropy.
  ;; Filters 0 nearest/1 linear; addresses 0 clamp/1 repeat/2 mirror-repeat;
  ;; compare 0 absent,1 never,2 less,3 equal,4 less-equal,5 greater,6 not-equal,
  ;; 7 greater-equal,8 always. Anisotropy 1..16; >1 requires all filters linear.
  ;; GRAPHICS_PIPELINE[112+16*(b+a)]: u64 id,vertex_shader,fragment_shader;
  ;; u32 color_format(0 surface),depth_format(0 absent),topology,cull,front_face,
  ;; depth_compare,depth_write; i32 depth_bias; f32 depth_slope,depth_clamp;
  ;; u32 color_mask,blend_enabled,color_op,src_color,dst_color,alpha_op,src_alpha,
  ;; dst_alpha,buffer_count<=8,attribute_count<=16. Entry points are "main".
  ;; Topology 0 triangles/1 triangle-strip(uint16 indices)/2 lines/3 points;
  ;; cull 0 none/1 front/2 back; front 0 CCW/1 CW. Compare as SAMPLER except 0.
  ;; Blend ops 0 add/1 subtract/2 reverse-subtract/3 min/4 max. Factors 0 zero,
  ;; 1 one,2 src,3 one-minus-src,4 dst,5 one-minus-dst,6 src-alpha,
  ;; 7 one-minus-src-alpha,8 dst-alpha,9 one-minus-dst-alpha,10 src-alpha-saturated.
  ;; Buffers: u32 stride<=2048,step(0 vertex/1 instance),reserved[2].
  ;; Attributes: u32 buffer_slot,location,format,offset. Formats 1..4 float32x1..4,
  ;; 5 unorm8x4,6 snorm8x4,7 uint8x4,8 sint8x4,9 unorm16x2,10 unorm16x4,
  ;; 11 uint16x2,12 uint16x4. Layout and locations must be unique/in bounds.
  ;; RESOURCE_GROUP[32+32*n]: u64 id,pipeline; u32 group_index<4,count<=16;
  ;; entries: u32 binding,kind; u64 resource,offset,size. Kind 0 buffer (range),
  ;; 1 texture2d,2 textureCube,3 sampler (offset/size zero). No host handles.
  ;; BEGIN_RENDER_PASS[64]: u64 color_texture(0 surface),depth_texture(0 absent);
  ;; u32 width,height,color_clear,depth_clear; f32 clear_rgba[4],clear_depth;
  ;; u32 clear_stencil. Exact attachment dimensions; clear flags 0 load/1 clear.
  ;; One color attachment, optional depth/stencil, store all; samples always 1.
  ;; END_RENDER_PASS[8]. Passes cannot nest or cross a packet/submit boundary.
  ;; DRAW_MESH[80+8*g+24*b]: u64 pipeline,index_buffer,index_offset,index_size;
  ;; u32 count,instances,first; i32 base_vertex; u32 first_instance,index_format,
  ;; group_count<=4,buffer_count<=8; u64 reserved. Index format 0 absent/1 u16/2 u32.
  ;; Followed by group handles (distinct group indices), then vertex buffers:
  ;; u64 buffer,offset,size. Count*instances <=4M; only within a render pass.
  ;; VIEWPORT[48]: f32 x,y,width,height,min_depth,max_depth; u32 scissor_x/y/w/h.
  ;; Top-left origin, within current attachment; viewport/scissor reset on BEGIN.
  ;; Queue writes occur before submitted encoders; use distinct uniform ranges
  ;; or submit before overwriting data consumed by earlier draws. Release only
  ;; after submit. No shader-selected network, host images or canvas handles.
  ;; WAIT body empty: queue completion, not packet admission. READ body: u64
  ;; mapped_buffer,relative_offset,bytes<=65536. CLOSE body empty.
  ;; INFO body empty, 80-byte reply: u32 timestamp_available,max_bindings;
  ;; u64 max_buffer_bytes,max_total_bytes; f64 last_gpu_ms,total_gpu_ms;
  ;; u64 gpu_samples; f64 total_provider_ms; u64 frames,dispatches,allocated_bytes.
  ;; CAPABILITIES body empty, 128-byte reply: u32 features,max_objects;
  ;; u64 max_buffer_bytes,max_total_bytes,max_storage_binding_bytes;
  ;; u32 min_uniform_alignment,min_storage_alignment,max_workgroup_storage,
  ;; max_invocations,max_workgroup_x/y/z,max_workgroups_per_dimension,
  ;; max_bindings,max_storage_buffers,max_uniform_buffers,max_bind_groups;
  ;; u64 max_uniform_binding_bytes; u32 subgroup_min/max; 32 reserved zero bytes.
  ;; Feature bits: 1 shader-f16, 2 subgroups, 4 packed_4x8_integer_dot_product,
  ;; 8 timestamp-query, 16 frame capture, 32 surface bytes BGRA8 (else RGBA8),
  ;; 64 texture/depth/indexed rendering records 18..26.
  ;; Limits describe the admitted device, not native pointers.
  ;; GPU timestamps are optional, asynchronously sampled per submitted encoder;
  ;; zero samples means unavailable/pending. They include passes, not CPU work.
  ;; One encoder per batch, explicit SUBMIT, at most 256 records. No replay or
  ;; rollback: structural rejection precedes execution; later GPU errors can
  ;; leave earlier writes/resources alive. Returned diagnostics are bounded.
  ;;
  ;; Eight reply slots, each a 64 B header followed by 65536 bytes:
  ;; atomic u32 state,scope,sequence,error,length; 44 reserved bytes.
  ;; Browser writes payload and fields before release-publishing state=1.
  ;; Kernel acquire-reads state, checks lease/sequence and copies before clearing.
  ;; The provider has private admission/resource limits, independent of state.
  ;; One outstanding operation per lease. Dispatch copies or rejects before
  ;; returning; asynchronous completion wakes the supervisor without polling RAF.
  ;; Zero pointer + scope in the size argument revokes exactly that lease on exit.
  ;; Revocation does not release host credits until outstanding GPU work settles.
)
