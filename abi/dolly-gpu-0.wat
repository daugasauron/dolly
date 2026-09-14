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
  ;; MAP_READ[32]: u64 buffer,offset,bytes. Completes only after mapping is ready.
  ;; UNMAP/RELEASE[16]: u64 object. SUBMIT[8]: finish/submit this batch's encoder.
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
  ;; 8 timestamp-query. Limits describe the admitted device, not native pointers.
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
