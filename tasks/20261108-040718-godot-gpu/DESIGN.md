# Design: Godot's RenderingDevice on gpu@0

For the owner's review (2026-11-08). Nothing of it is implemented. The task is
[TASK.md](TASK.md); the owner chose to extend gpu@0 rather than version it. The evidence is in
`work/godot/build/gpu-baseline/`. Godot's sources cited are 4.7.2-stable.

## 1. Measured

- **The editor today** (TASK.md, Baseline). 71% of its main thread is Mesa's softpipe, 2% is
  Godot. A click on a view tab shows the new view after 1 to 2 s.
- **A gpu@0 batch** (`gpu-batch-cost.c`, `.mjs`, `cost-*.log`). Indexed draws of a quad into the
  surface, in Chrome 156 and Firefox 157 (the installed snap) on the NVIDIA RTX 5070 (driver
  580), on a private Xvfb:

  | | Chrome | Firefox |
  | --- | --- | --- |
  | Admitting a batch of 1 / 100 / 1000 draws | 1.35 / 1.36 / 2.22 ms | 0.98 / 1.07 / 2.02 ms |
  | Waiting for the GPU to finish it (`WAIT`) | 2.3 to 3.4 ms | 98 to 100 ms, every time |
  | 300 frames of 100 draws, never waiting | 54 frames/s | 1,346 frames/s |

- **What WebGPU grants on that adapter** (`webgpu-probe.mjs`, `probe-*.json`). These are the
  adapter's values. gpu@0's device asks for only a few of them today; the rest stay at WebGPU's
  defaults (`host/gpu/worker.mjs`).

  | | Chrome | Firefox |
  | --- | --- | --- |
  | Bind groups | 4 | 8 |
  | Per stage: sampled textures, samplers, storage buffers, storage textures, uniform buffers | 48, 16, 16, 8, 12 | 64 each |
  | Dynamic uniform / storage buffers per layout | 10 / 8 | 15 / 16 |
  | Colour attachments, bytes per sample | 8, 128 | 8, 128 |
  | Push constants (`setImmediates`) | 64 bytes | absent |
  | Texture view swizzle (`texture-component-swizzle`) | yes | absent |
  | `subgroups`, `float32-blendable`, `clip-distances`, `texture-formats-tier1/2` | yes | absent |
  | `shader-f16` | absent (Dawn on NVIDIA's Vulkan, `docs/gpu.md`) | yes |
  | `depth32float-stencil8`, `rg11b10ufloat-renderable`, `float32-filterable`, BC, `timestamp-query`, `dual-source-blending`, `depth-clip-control` | yes | yes |
  | ETC2, ASTC | absent | absent |
  | WGSL `uniform_buffer_standard_layout` | yes | absent |
  | Preferred surface format | `rgba8unorm` | `bgra8unorm` |

- **What follows:**
  - Admission is about 1 ms a batch plus about 1 µs a draw. Godot submits one command buffer a
    frame (`RenderingDevice::_execute_frame`), plus its transfer workers' uploads.
  - **The driver never waits for the GPU in its frame loop.** In Firefox a wait is 100 ms
    (`onSubmittedWorkDone` on a timer, `docs/gpu.md`). Only readbacks wait.
  - gpu@0 allows a surface 3 frames awaiting completion, yet Firefox ran unpaced. The cause is
    not known yet; it is found before §4.E is specified.
  - Godot's scene shaders use 4 sets: 0 to 2 and the material's 3 (`scene_forward_*_inc.glsl`,
    `MATERIAL_UNIFORM_SET`). That is all of Chrome's groups, so push constants cannot have a
    group of their own (§5).
  - Push constants are up to 128 bytes in Godot (Vulkan's guarantee). Chrome's immediates are
    64 and Firefox has none, so they cannot carry them.
  - Godot's glyph caches are `LA8` (`text_server_adv.cpp`), which Godot draws through an `RRRG`
    swizzled view. Without a swizzle, Firefox would show the editor's text wrongly (§6).

## 2. How the driver works

The driver is a fourth `RenderingDeviceDriver` beside Vulkan's, Direct3D 12's and Metal's,
living in the port (`demos/godot/platform`). Godot's interface has 138 methods to implement and 9
with defaults; `RenderingContextDriver` has 25 and 10.

- **One gpu@0 scope with the window's surface,** opened in `initialize`. Where gpu@0 grants no
  device, `OPEN` fails with `ENODEV`. The display server then falls back to the Compatibility
  renderer, as Godot's X11 one does (`rendering/rendering_device/fallback_to_opengl3`).
- **Command buffers are the driver's own record lists** in Wasm memory, so recording makes no
  gpu@0 call. Godot records on several threads, and each list belongs to one of them.
- **`command_queue_execute_and_present` makes the packets,** under one lock. In order:
  - the objects created and released since the last submission;
  - the CPU-written buffer ranges, as `WRITE_BUFFER` records;
  - the command buffers' records, in one encoder;
  - `SUBMIT`.

  This is several packets when the frame needs it (§4.D).
- **CPU memory.** WebGPU cannot map a buffer synchronously. So the buffers Godot allocates as CPU
  memory are copies in Wasm memory: staging, readback and persistent dynamic buffers. An upload
  is correct because:
  - WebGPU runs a queue write after every submission made before it;
  - Godot reuses a staging range only after the fence of the submission that read it.
- **Fences signal at submission,** since every later queue operation is ordered after it. Godot's
  `fence_wait` never blocks, and the surface's pacing bounds the frames in flight (§4.E).
- **Readback is the only wait:** `buffer_map` of a readback buffer, and `texture_get_data`.
  - They use `MAP_READ`, then `READ` in 64 KiB pieces into the copy, then `UNMAP`.
  - Each costs 100 ms in Firefox, so how often the editor reads back is measured.

## 3. Every method

What each method becomes. "New" names an addition of §4. Ray tracing, multiview, variable rate
shading, density maps, HDR output and MetalFX exist in none of the browsers; they are reported
unsupported, and Godot checks before using them.

**Device and surface** (`RenderingContextDriver`)

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `initialize`, `device_get`, `device_get_count`, `device_supports_present` | One device. Its name is gpu@0's fixed "WebGPU", which never names the adapter; vendor unknown. | `OPEN`, `CAPABILITIES` |
| `driver_create`, `driver_free` | The device driver | — |
| `surface_create`, `surface_destroy`, `surface_set_size`, `surface_get_width`, `surface_get_height`, `surface_set_needs_resize`, `surface_get_needs_resize` | The window's one surface; its size is the page frame's | The surface takes the size of the pass that draws on it |
| `surface_set_vsync_mode`, `surface_get_vsync_mode` | Reports the mode in effect: the page's pacing | §4.E |
| The 9 HDR methods | Off, and reported unsupported | — |
| `is_debug_utils_enabled` | false | — |
| The 10 memory-report methods | Their defaults | — |

**Generic, capabilities, debugging**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `initialize` | Opens the scope; Godot's `frame_count` sizes the persistent copies | `OPEN` |
| `limit_get`, `has_feature`, `get_capabilities`, `get_multiview_capabilities`, `get_fragment_shading_rate_capabilities`, `get_fragment_density_map_capabilities`, `get_driver_workarounds`, `is_composite_alpha_supported` | From the device's WebGPU limits and features | New G |
| `api_trait_get` | Barriers not honoured (WebGPU tracks hazards); clears not on a copy engine; 256-byte row pitch and transfer alignment (WebGPU's `bytesPerRow`); outputs need no clears (WebGPU zeroes textures) | — |
| `get_api_name`, `get_api_version`, `get_pipeline_cache_uuid`, `get_shader_container_format` | "WebGPU", gpu@0's version, the container format | — |
| `get_total_memory_used`, `get_lazily_memory_used` | The driver's own count | — |
| `set_object_name`, `command_begin_label`, `command_end_label`, `command_insert_breadcrumb` | Nothing: labels change no pixel, and gpu@0 carries none | — |
| `get_resource_native_handle` | 0: there is no native object | — |
| `begin_segment`, `end_segment` | The frame index for persistent copies | — |

**Buffers**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `buffer_create`, `buffer_free`, `buffer_get_allocation_size` | Usage bits map to WebGPU's. A CPU buffer is a copy in Wasm memory plus a GPU buffer. Device address, shader binding table and acceleration structure usage are refused. | `CREATE_BUFFER`, `RELEASE` |
| `buffer_map`, `buffer_unmap`, `buffer_flush` | The copy's pointer; unmapping marks the range written. A readback buffer waits (§2). | `WRITE_BUFFER`, `MAP_READ`, `READ`, `UNMAP` |
| `buffer_persistent_map_advance`, `buffer_get_dynamic_offsets` | `frame_count` copies in one buffer, as Vulkan's driver does; the frame's copy is chosen by dynamic offset | New C (dynamic offsets) |
| `buffer_set_texel_format` | false: WebGPU has no texel buffers. Godot's renderers bind none: `texture_storage.cpp` makes one default that nothing uses. | — |
| `buffer_get_device_address` | 0; the feature is not reported | — |

**Textures and samplers**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `texture_create`, `texture_free`, `texture_get_allocation_size` | 1D, 2D, 3D, arrays and cubes. Formats map only where WebGPU has the exact one. A sample count WebGPU lacks (it has 1 and 4) becomes the highest below it, as Direct3D 12's driver does. | New A |
| `texture_create_shared`, `texture_create_shared_from_slice` | WebGPU texture views; a swizzle where the feature exists (§6) | New A |
| `texture_can_make_shared_with_format` | True only for an sRGB/linear pair, WebGPU's one reinterpretation. Otherwise Godot makes its own alias texture and copies (`shared_fallback` in `rendering_device.cpp`). | — |
| `texture_get_usages_supported_by_format`, `sampler_is_format_supported_for_filter` | WebGPU's format tables and the granted features. Godot converts what is unsupported: RGB8 to RGBA8, and ETC2, ASTC and absent BC to RGBA8 (`texture_storage.cpp`). `D24_UNORM_S8_UINT` is unsupported (depth24plus is not exactly 24-bit unorm), so Godot picks `D32_SFLOAT_S8_UINT`. | New G |
| `texture_get_copyable_layout` | WebGPU's 256-byte row pitch | — |
| `texture_get_data` | Copy to a buffer, then readback (§2) | New B |
| `texture_create_from_extension` | Refused: no native textures | — |
| `sampler_create`, `sampler_free` | WebGPU samplers. Border colours, unnormalized coordinates and LOD bias are absent in WebGPU (§6). | New A (LOD clamps) |

**Vertex formats, barriers, synchronisation, queues**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `vertex_format_create`, `vertex_format_free` | Kept for the pipeline's vertex buffer layouts | New A (every vertex format) |
| `command_pipeline_barrier` | Nothing: WebGPU orders usage itself | — |
| `fence_create`, `fence_wait`, `fence_free` | Signalled at submission (§2) | — |
| `semaphore_create`, `semaphore_free` | Nothing: one queue orders all submissions | — |
| `command_queue_family_get`, `command_queue_create`, `command_queue_free` | One family and one queue, graphics, compute, transfer and present | — |
| `command_queue_execute_and_present` | Packets, `SUBMIT`, and presents the surface (§2) | `BATCH`, `SUBMIT`; new D |
| `command_pool_create`, `command_pool_reset`, `command_pool_free`, `command_buffer_create`, `command_buffer_begin`, `command_buffer_end` | Record lists | — |
| `command_buffer_begin_secondary`, `command_buffer_execute_secondary` | A secondary list is copied into its primary | — |

**Swap chain and framebuffers**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `swap_chain_create`, `swap_chain_resize`, `swap_chain_free` | The surface, one image | — |
| `swap_chain_acquire_framebuffer`, `swap_chain_get_render_pass` | The surface as attachment 0 | Attachment handle 0 is the surface, as now |
| `swap_chain_get_format`, `swap_chain_get_color_space` | gpu@0's surface format (`FEATURE_SURFACE_BGRA`), sRGB non-linear | — |
| `swap_chain_get_hdr_output_supported`, `swap_chain_set_max_fps`, `swap_chain_get_pre_rotation_degrees` | false; pacing is the page's; 0 | — |
| `framebuffer_create`, `framebuffer_free` | The attachments' views, kept for the passes | — |

**Shaders, uniform sets, pipelines**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `shader_create_from_container` | WGSL modules, bind group layouts from the reflection, a pipeline layout. Immutable samplers are bound by the driver. | `CREATE_SHADER`; new A (layouts) |
| `shader_free`, `shader_destroy_modules`, `shader_get_layout_hash` | Release; layouts are kept by content | `RELEASE` |
| `uniform_set_create`, `uniform_set_free`, `uniform_sets_have_linear_pools`, `linear_uniform_set_pools_reset` | A bind group on the set's layout; no linear pools | New A (bind groups) |
| `uniform_sets_get_dynamic_offsets`, `command_uniform_set_prepare_for_use` | The frame indices of the persistent copies, as Vulkan's driver packs them; nothing to prepare | New C |
| `render_pipeline_create`, `compute_pipeline_create`, `pipeline_free` | WebGPU's full descriptors. Godot's specialization constants become override constants. Line width other than 1 is refused. | New A |
| `command_bind_push_constants` | Writes a 256-byte slot of a per-frame ring, then rebinds group 0 at its offset (§5) | New C |
| `pipeline_cache_create`, `pipeline_cache_free`, `pipeline_cache_query_size`, `pipeline_cache_serialize` | Empty: the browser caches pipelines | — |

**Transfers**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `command_copy_buffer`, `command_clear_buffer` | Encoder copies and clears | `COPY_BUFFER`; new B |
| `command_copy_texture`, `command_copy_buffer_to_texture`, `command_copy_texture_to_buffer` | Encoder copies | New B |
| `command_resolve_texture` | An empty render pass that resolves into the target | New C (resolve targets) |
| `command_clear_color_texture`, `command_clear_depth_stencil_texture` | A clearing render pass per mip and layer | New C |

**Render passes and drawing**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `render_pass_create`, `render_pass_free` | Kept: attachments, load and store, subpasses | — |
| `command_begin_render_pass`, `command_end_render_pass` | A WebGPU render pass on the framebuffer's views | New C |
| `command_next_render_subpass` | Ends the pass and begins the next subpass's, as Direct3D 12's driver does. An input attachment becomes a texture read at the fragment's position (§5). | New C |
| `command_render_clear_attachments` | Draws a rectangle with a built-in clearing pipeline | New C |
| `command_bind_render_pipeline`, `command_bind_render_uniform_sets`, `command_render_bind_vertex_buffers`, `command_render_bind_index_buffer` | `setPipeline`, `setBindGroup` with dynamic offsets, `setVertexBuffer`, `setIndexBuffer` | New C |
| `command_render_draw`, `command_render_draw_indexed`, `command_render_draw_indirect`, `command_render_draw_indexed_indirect` | WebGPU's draws. A count above 1 becomes that many draws; WebGPU has no multi-draw. | New C |
| `command_render_draw_indirect_count`, `command_render_draw_indexed_indirect_count` | Refused: WebGPU has no count buffer. Nothing in Godot's RenderingDevice calls them. | — |
| `command_render_set_viewport`, `command_render_set_scissor`, `command_render_set_blend_constants` | WebGPU's dynamic state; stencil reference too | New C |
| `command_render_set_line_width` | Accepted only at 1 | — |

**Compute, queries, ray tracing**

| Methods | The driver | gpu@0 |
| --- | --- | --- |
| `command_bind_compute_pipeline`, `command_bind_compute_uniform_sets`, `command_compute_dispatch`, `command_compute_dispatch_indirect` | A compute pass for a run of dispatches | New C |
| `timestamp_query_pool_create`, `timestamp_query_pool_free`, `timestamp_query_pool_get_results`, `timestamp_query_result_to_time`, `command_timestamp_query_pool_reset`, `command_timestamp_write` | Where `timestamp-query` exists: a query set, written by an empty pass's `timestampWrites`, resolved and read back late without waiting. Otherwise no timestamps, as Godot allows. | New A, B |
| `blas_create`, `tlas_create`, `acceleration_structure_instance_write`, `acceleration_structure_free`, `acceleration_structure_get_scratch_size_bytes`, `raytracing_pipeline_create`, `raytracing_pipeline_free`, `raytracing_pipeline_get_shader_group_handles`, `command_build_blas`, `command_build_tlas`, `command_bind_raytracing_pipeline`, `command_bind_raytracing_uniform_set`, `command_trace_rays` | Refused; the features are not reported | — |

## 4. What gpu@0 gains

gpu@0 is a small subset of WebGPU:

- 26 records;
- one colour attachment and six formats, plus BC;
- bind group layouts derived from a pipeline;
- a whole draw in one record.

Godot needs most of WebGPU's rendering API. Two things in gpu@0 do not fit it:

- **Its derived layouts.** A layout derived from a pipeline belongs to that pipeline alone. Godot
  makes a uniform set once per shader and uses it with every pipeline of that shader. WebGPU
  allows this only with explicit layouts, which are interchangeable when their entries are equal.
- **Its one-record draws.** `DRAW_MESH` names the pipeline, groups and buffers of every draw.
  Godot sets state, then draws.

The additions are new opcodes and a feature bit beside today's records. Xonotic, 0 A.D.,
gpu-fluid and Mojo keep working unchanged. The contract's digest changes with the WAT, as for
every change.

- **A. Objects.**
  - Textures of every dimension, with mips, layers and sample counts 1 and 4. Formats come from
    an enumerated list of WebGPU's, each under its feature where it needs one. Usage includes
    storage, and the sRGB view format.
  - Texture views: format, dimension, aspect, mip and layer range. A swizzle under
    `texture-component-swizzle`.
  - Samplers with LOD clamps; the rest of today's sampler stays.
  - Bind group layouts:
    - buffers: uniform, storage and read-only storage, each optionally dynamic, with a minimum
      binding size;
    - samplers: filtering, non-filtering and comparison;
    - textures: sample type, view dimension, multisampled;
    - storage textures: access, format, view dimension.
  - Pipeline layouts, and bind groups on a layout.
  - Render pipelines with WebGPU's whole descriptor:
    - every vertex format, per-vertex and per-instance buffers;
    - every topology, unclipped depth;
    - depth bias, stencil, multisampling, alpha to coverage;
    - up to 8 targets, each with its own format, blend and write mask;
    - override constants by numeric id.
  - Compute pipelines on a layout with override constants.
  - Timestamp query sets, under `timestamp-query`.
- **B. Transfers.** Copies from buffer to texture, texture to buffer and texture to texture.
  Buffer clears. Query resolves.
- **C. Passes.**
  - Render passes with up to 8 colour attachments, each with a resolve target. Depth and stencil
    each get their own load, store, clear and read-only. Timestamp writes.
  - Inside a render pass:
    - set pipeline;
    - set bind group with dynamic offsets;
    - set vertex buffer, set index buffer;
    - draw, draw indexed, and their two indirect forms;
    - viewport, scissor, blend constant, stencil reference.
  - Compute passes: set pipeline, set bind group, dispatch, indirect dispatch.
- **D. Frames over several packets.**
  - A flag in `BATCH`'s reserved word keeps the encoder, and a pass open in it, for the next
    batch.
  - Today a pass and an encoder end with their packet: 1 MiB and 1,024 records. A Godot frame
    can be larger.
  - Each packet is still validated whole before any of it runs. A packet without the flag
    behaves as now.
- **E. Pacing.** Firefox's frames went unpaced although gpu@0 bounds a surface's frames. The
  cause is found first. Then a rule holds in both browsers: a surface has at most 3 frames not
  yet shown, the page's display rate paces it, and a test checks the rule.
- **F. Quotas.**
  - Each new kind is counted: views, layouts, bind groups, query sets.
  - Texture bytes include depth, layers, samples and mips.
  - Two limits are measured against Godot's editor before either changes: the 4,096 objects of a
    scope, and the 128 KiB of a shader (Godot's largest WGSL).
  - Each limit lands in `docs/gpu.md`. Each record goes into `docs/browser-boundary.md`'s review
    map, with tests of its refusals.
- **G. Capabilities.**
  - The GPU Worker asks the adapter for the limits that Godot's shaders need (those of §1),
    where today it keeps WebGPU's defaults.
  - A new reply reports them with the granted features. Today's 128-byte `CAPABILITIES` has no
    room for them.
- **What stays.**
  - Packets name only gpu@0 handles: no URL, DOM node, host pointer or native object.
  - Objects live in the GPU Worker, are charged to their scope and are released when it is
    revoked.
  - The provider validates structure; WebGPU validates shaders and pipelines.
  - None of this grants anything outside the GPU device the page already gives gpu@0.

## 5. Shaders

Godot compiles its GLSL to SPIR-V with glslang as it runs. It then hands the SPIR-V and its
reflection to the driver's shader container (`_set_code_from_spirv`). Metal's container converts
with SPIRV-Cross, and Direct3D 12's with Mesa's NIR. Godot's shader cache and its export-time
baker store what the container made.

`RenderingShaderContainerWebGPU` makes WGSL. Six changes beyond the translation itself are known:

| Godot's GLSL | WGSL has | The container |
| --- | --- | --- |
| Push constants, up to 128 bytes, std430 | No push constants in Firefox, 64 bytes in Chrome | A read-only storage buffer, whose layout is std430's, bound in group 0 with a dynamic offset into a per-frame ring. Every group-0 layout has it, so layouts stay interchangeable; a shader without set 0 gets a group 0 of its own. |
| Combined image samplers (`sampler2D`) | Separate textures and samplers | Two bindings, recorded in the container |
| Arrays of textures: lightmaps, VoxelGI, SDFGI cascades | No binding arrays | One binding each, chosen by a `switch` on the index |
| Specialization constants | Override constants | Numeric ids |
| Input attachments (`subpassInput`, Mobile's tonemapper) | None | A texture read with `textureLoad` at the fragment's position |
| Sets and bindings | 4 groups in Chrome | Sets 0 to 3 become groups 0 to 3 |

What converts SPIR-V to WGSL is decided by measurement:

- **Candidates.**
  - naga, the wgpu project's translator: Rust, and already a Dolly package. 0 A.D. and Xonotic
    use it for GLSL at build time; Firefox validates WGSL with it.
  - Tint, from Dawn: C++. Chrome validates WGSL with it. Whether its SPIR-V reader handles
    Godot's shaders is part of the measurement.
- **The measurement.**
  - Godot's glslang produces the SPIR-V of every shader variant it compiles: at startup, in the
    editor, and in the test scenes.
  - Each candidate, with the changes above, converts every one.
  - Every result is validated by both naga and Tint, since each browser accepts only what its
    own validator does.
  - Failures decide, then time and size inside Dolly.
- **Where it runs.** Inside the Godot process, when Godot makes a container.
  - Its output lands in Godot's shader cache, so a variant converts once.
  - Exported games carry baked shaders.
  - The editor's startup, which compiles many variants, is measured.

## 6. WebGPU's gaps against Godot

- **Swizzles in Firefox.** Godot's views with a swizzle that WebGPU's sampling lacks:
  - `L8` (`RRR1`) and `LA8` (`RRRG`), which include the glyph caches;
  - `RA_AS_RG` normal maps;
  - `RGBA4444` and `RGB565`, whose formats WebGPU lacks anyway.

  Chrome has the feature. In Firefox, such a view is a texture of its own: the driver re-renders
  it after every command that writes the source. This goes once Firefox grants the feature.
- **Sampler state.** WebGPU has no border colours, unnormalized coordinates or LOD bias.
  - The audit finds where Godot uses each. Godot sets LOD bias with TAA and FSR.
  - The choice comes to the owner with that evidence: refuse, or approximate in the shader.
- **Reported unsupported, as Godot allows:**
  - sample counts 2 and 8, and depth resolve; Godot then resolves depth to `R32_SFLOAT`
    (`render_scene_buffers_rd.cpp`);
  - point size and line width;
  - image atomics, texel buffers, multi-draw and count draws;
  - ETC2 and ASTC on these adapters; Godot decompresses them.
- **Per browser:** subgroups (Chrome) and `shader-f16` (Firefox) are reported where granted.
- **Per-stage limits.** Chrome's per-stage limits are the lower of the two (§1). The shader
  measurement counts each pipeline's bindings against them and against Firefox's.
- **The renderers.**
  - Mobile comes first: Godot's renderer for constrained GPUs. Its subpasses become passes.
  - Forward+ comes second.
  - Where no adapter exists, the Compatibility renderer on softpipe stays.

## 7. Changes to Godot

- **`main/main.cpp`.** Its modern renderers accept only the drivers it lists. Two hunks, in the
  file's own form:
  - `webgpu` joins the list behind `WEBGPU_ENABLED`;
  - `rendering/rendering_device/driver.dolly` defaults to it. The port's OS already reports the
    `dolly` feature.

  This is the first source patch of the port. Without it the driver would have to call itself
  `vulkan`, which the porting rules forbid.
- **Everything else is the port's:**
  - the context and device drivers and the shader container;
  - the display server, which offers `webgpu` and falls back to `opengl3`;
  - the build: `RD_ENABLED`, Godot's glslang module, the translator.

## 8. Performance targets

Measured as the baseline was (`latency.sh`, a trace, frame times):

- A click in the editor shows its result within 100 ms, where it now takes 1 to 2 s.
- The 2D scene of `godot-browser.mjs` keeps the page's frame rate at full size.
- A 3D scene on Mobile is measured in Chrome and Firefox, with no completion waits in its frame
  loop.
- The editor's startup and its shader conversion time are recorded.

## 9. Tests

- **The contract.**
  - A C program exercises each new record, its refusals and its quotas, as
    `test/fixtures/gpu-render.c` does now.
  - It runs in Chrome and Firefox on real adapters, and in SwiftShader in the core browser tests.
  - `test/gpu-boundary.mjs` and the allowlist tests follow each addition.
- **Shaders.** Every shader Godot makes converts, and validates under both naga and Tint.
- **Godot.** Each step draws on the page and its pixels are checked, in both browsers:
  - a cleared surface;
  - the 2D scene;
  - the editor's window, with a click;
  - a 3D scene on Mobile, compared with Godot's own Linux build;
  - Forward+.
- **Performance.** §8's figures against the baseline, recorded in TASK.md.

## 10. Order

1. The contract additions, each as a WAT change with its kernel, client, GPU Worker, quotas and
   tests. The Firefox pacing cause comes before E.
2. The shader measurement of §5, then the container.
3. The driver, in §9's order.

## 11. For the owner to decide

- **§4's additions in principle.** Their byte layouts come as WAT changes, each reviewed before
  it merges.
- **The batch flag (§4.D),** rather than larger packets.
- **The pacing rule (§4.E),** once Firefox's cause is known.
- **The `main.cpp` patch (§7).**
