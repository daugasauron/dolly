// Godot's RenderingDeviceDriver on gpu@0's explicit records (host/gpu/dolly-gpu-0.wat).
//
// Command buffers are record lists in this process's memory; a submission sends, in order, the
// objects created and released since the last one, the CPU-written buffer ranges, then its
// command buffers' records in one encoder, over as many packets as it takes, and SUBMIT.
// WebGPU orders a queue write after every submission before it, so fences signal at submission,
// and only readbacks wait for the GPU. The design: tasks/20261108-040718-godot-gpu/DESIGN.md.
#pragma once

#include "rendering_shader_container_webgpu.h"

#include "core/os/mutex.h"
#include "core/templates/hash_map.h"
#include "core/templates/local_vector.h"
#include "servers/rendering/rendering_device_driver.h"

#include <dolly/gpu.h>

#include <atomic>

class RenderingContextDriverWebGPU;

class RenderingDeviceDriverWebGPU : public RenderingDeviceDriver {
public:
	// A gpu@0 bind group layout entry (CREATE_BIND_GROUP_LAYOUT).
	struct GroupEntry {
		uint32_t binding = 0, visibility = 0, type = 0, a = 0, b = 0, c = 0;
	};

	struct BufferInfo {
		uint64_t handle = 0;
		uint64_t size = 0; // what Godot asked for; a persistent buffer's one copy
		uint64_t stride = 0; // between a persistent buffer's copies
		uint32_t copies = 1;
		uint32_t frame = 0; // a persistent buffer's current copy
		bool readback = false; // a CPU buffer Godot maps to read what the GPU wrote
		uint8_t *copy = nullptr; // a CPU or persistent buffer's bytes in this process
		uint8_t *sent = nullptr; // a persistent buffer's bytes as the GPU holds them
		uint64_t dirty_begin = UINT64_MAX, dirty_end = 0;
	};
	// A view's own texture for what WebGPU cannot sample from the view itself: a swizzle where the
	// browser has no texture-component-swizzle (Firefox), or depth through a filtering sampler. A
	// compute pass refills it from the view's subresources after writes to them (refill_shadows).
	struct Shadow {
		uint64_t texture = 0, view = 0, pipeline = 0;
		LocalVector<uint64_t> groups; // per mip: its source and destination views
		LocalVector<uint64_t> views;
		LocalVector<Vector3i> dispatches; // per mip
		// A storage shadow's way back into its texture (flush_stored): per mip and layer, a group of
		// a view of it, drawn by back_pipeline into the texture's view of that mip and layer.
		uint64_t back_pipeline = 0;
		LocalVector<uint64_t> back_groups;
		LocalVector<Vector2i> back_subresources; // mip, layer
	};
	struct TextureInfo {
		uint64_t texture = 0; // shared by the views of one texture
		uint64_t view = 0;
		bool owner = true;
		DataFormat format = DATA_FORMAT_MAX; // the view's
		TextureType type = TEXTURE_TYPE_2D;
		uint32_t width = 1, height = 1, depth = 1, layers = 1, mips = 1;
		uint32_t base_layer = 0, base_mip = 0;
		TextureSamples samples = TEXTURE_SAMPLES_1;
		uint32_t gpu_format = 0;
		bool surface = false; // the swap chain's image: gpu@0's surface, view 0
		TextureInfo *original = nullptr; // a view's: the one texture_create made
		LocalVector<TextureInfo *> shadowed; // the one texture_create made: its views with shadows
		uint32_t dimension = 2; // the view's VIEW_DIMENSION
		Shadow *shadow = nullptr;
		// A texture of a format the device stores in only with texture-formats-tier1 (Firefox), which
		// shaders store into through a shadow of a wider format (make_storage_shadow): the texture's,
		// the views' of it, and whether texture and shadow hold the same.
		Shadow *storage = nullptr;
		uint64_t storage_view = 0;
		bool storage_current = true;
		HashMap<uint32_t, uint64_t> subresource_views; // by mip << 16 | layer, for clears and resolves
		uint64_t depth_view = 0; // a depth-stencil texture's depth aspect, which shaders sample
	};
	struct VertexFormatInfo {
		LocalVector<VertexAttribute> attributes;
		LocalVector<VertexAttributeBinding> bindings; // by binding index
	};
	struct SetUniform {
		UniformType type = UNIFORM_TYPE_MAX;
		uint32_t binding = 0, length = 1, first = 0;
	};
	// Each group's layout holds what the shader's WGSL uses (spirv_wgsl): group 0 binding 0
	// is the push constants'.
	struct ShaderInfo {
		bool compute = false;
		uint64_t modules[2] = {}; // vertex and fragment, or the compute module
		LocalVector<uint32_t> overrides[2];
		uint64_t pipeline_layout = 0;
		LocalVector<uint64_t> group_layouts; // by group, at least group 0
		String wgsl; // a compute shader's with storage textures, for its pipelines' variants (StorageVariant)
		LocalVector<LocalVector<GroupEntry>> layouts;
		LocalVector<LocalVector<SetUniform>> sets;
		HashMap<uint32_t, ID> immutable_samplers; // by binding
		// Why this variant cannot run here, when it cannot: kept without modules for its sets, as
		// Vulkan keeps a module it could not pipeline; its compute pipelines do nothing, and render
		// pipelines are refused.
		String unavailable;
	};
	struct Group {
		uint64_t handle = 0;
		LocalVector<int32_t> dynamic; // per dynamic entry: an index into the set's dynamic buffers, -1 the push constants
	};
	// A uniform set keeps its resources and gets a bind group for each layout it meets: Godot shares
	// a set among the variants of a shader, whose WGSL may use different parts of it.
	struct UniformSetInfo {
		uint32_t set = 0;
		ShaderInfo *shader = nullptr; // the one Godot made it for
		LocalVector<BoundUniform> uniforms;
		LocalVector<BufferInfo *> dynamic; // its dynamic buffers in Godot's binding order
		HashMap<uint64_t, Group> groups; // by layout
	};
	// A compute pipeline for storage textures of formats other than its WGSL declares (stored
	// in the bound view's format, as Vulkan's drivers do): its own module, layouts and pipeline.
	struct StorageVariant {
		uint64_t handle = 0, module = 0;
		LocalVector<uint64_t> group_layouts;
		LocalVector<LocalVector<GroupEntry>> layouts;
	};
	struct PipelineInfo {
		uint64_t handle = 0;
		bool compute = false;
		uint32_t samples = 1;
		ShaderInfo *shader = nullptr;
		uint32_t stencil_reference = 0;
		LocalVector<PipelineSpecializationConstant> constants; // a compute pipeline's, for its variants
		HashMap<String, StorageVariant> variants; // by the bound formats of its storage textures
	};
	struct RenderPassInfo {
		LocalVector<Attachment> attachments;
		LocalVector<Subpass> subpasses;
	};
	struct FramebufferInfo {
		LocalVector<TextureInfo *> attachments;
		uint32_t width = 0, height = 0;
	};
	struct QueryPoolInfo {
		uint64_t handle = 0, resolve = 0, read = 0;
		uint32_t count = 0;
	};
	// What a command buffer has bound, for draws and dispatches to bind lazily: group 0 carries
	// the push constants with a dynamic offset into the frame's ring.
	struct Bound {
		UniformSetInfo *sets[8] = {};
		uint32_t frames[8] = {}; // the sets' dynamic buffers' copies, 4 bits each in their order
		bool dirty[8] = {};
		uint32_t push_offset = 0;
		uint8_t push[128] = {};
		ShaderInfo *shader = nullptr;
	};
	struct CommandBufferInfo {
		LocalVector<uint8_t> records;
		uint32_t count = 0;
		// The render pass being recorded: its framebuffer and pass, the subpass, clear values.
		RenderPassInfo *render_pass = nullptr;
		FramebufferInfo *framebuffer = nullptr;
		uint32_t subpass = 0;
		Rect2i render_rect;
		LocalVector<RenderPassClearValue> clear_values;
		bool in_render_pass = false, in_compute_pass = false;
		Rect2i viewport, scissor;
		bool viewport_dirty = false;
		PipelineInfo *pipeline = nullptr;
		bool pipeline_dirty = false;
		Bound bound;
		BufferInfo *vertex_buffers[16] = {};
		uint64_t vertex_offsets[16] = {};
		uint32_t vertex_count = 0;
		bool vertex_dirty = false;
		BufferInfo *index_buffer = nullptr;
		IndexBufferFormat index_format = INDEX_BUFFER_FORMAT_UINT16;
		uint64_t index_offset = 0;
		bool index_dirty = false;
		uint64_t push_begin = UINT64_MAX, push_end = 0; // the ring's range its push constants wrote
		struct Upload {
			BufferInfo *buffer;
			uint64_t begin, end;
		};
		LocalVector<Upload> uploads; // CPU buffer ranges its copies read
		bool surface = false; // it draws on the surface
		LocalVector<TextureInfo *> stale; // textures written since their views' shadows were refilled
		// Textures whose storage shadows shaders stored into since they were drawn back, and which of
		// the shadow's subresources (Shadow::back_subresources) the storage views covered.
		struct Stored {
			TextureInfo *texture = nullptr;
			LocalVector<bool> subresources;
		};
		LocalVector<Stored> stored;
		uint32_t placeholder_at = UINT32_MAX; // a view pass without attachments awaiting its depth (place_depth)
		const StorageVariant *variant = nullptr; // the bound compute pipeline's, if any
	};

private:
	RenderingContextDriverWebGPU *context_driver = nullptr;
	dolly_gpu *gpu = nullptr; // the scope, opened with the window's surface
	Mutex mutex; // the scope's packets and the objects' records
	std::atomic<uint64_t> next_id = { 0 };
	LocalVector<uint8_t> pending; // object records since the last submission
	uint32_t pending_count = 0;
	HashSet<BufferInfo *> dirty;
	uint32_t frame_count = 3, frame = 0;
	uint64_t limits[35] = {};
	uint64_t features = 0;
	uint32_t surface_format = 0; // gpu@0's surface: rgba8unorm or bgra8unorm
	Capabilities capabilities;
	MultiviewCapabilities multiview_capabilities;
	FragmentShadingRateCapabilities fsr_capabilities;
	FragmentDensityMapCapabilities fdm_capabilities;
	RenderingShaderContainerFormatWebGPU shader_container_format;
	// Push constants: one ring of storage per frame in flight.
	BufferInfo push_ring;
	uint64_t push_ring_frame_bytes = 0;
	std::atomic<uint64_t> push_cursor = { 0 };
	LocalVector<uint8_t> push_data; // the frame's push constants, written at submission
	HashMap<uint64_t, Group> setless_groups; // by layout: a group no set of Godot's fills
	HashMap<String, uint64_t> group_layouts; // by their entries
	HashMap<String, uint64_t> pipeline_layouts;
	uint64_t clear_pipeline_shader = 0;
	uint64_t total_memory = 0;

	uint64_t id() { return ++next_id; }
	uint8_t *object_record(uint32_t p_op, uint32_t p_bytes);
	uint8_t *command_record(CommandBufferID p_cmd_buffer, uint32_t p_op, uint32_t p_bytes);
	void release(uint64_t p_handle);
	bool send(bool p_continue);
	uint8_t *packet_record(uint32_t p_op, uint32_t p_bytes, bool &r_sent_any);
	bool flush_pending();
	bool wait_idle();
	bool read_buffer(BufferInfo *p_buffer, uint64_t p_offset, uint64_t p_size, uint8_t *r_out);
	void mark_dirty(BufferInfo *p_buffer, uint64_t p_begin, uint64_t p_end);
	uint64_t group_layout(const LocalVector<GroupEntry> &p_entries);
	const Group &group_for(UniformSetInfo *p_set, ShaderInfo *p_shader, uint32_t p_index, uint64_t p_layout, const LocalVector<GroupEntry> &p_entries);
	const StorageVariant *storage_variant(CommandBufferID p_cmd_buffer);
	uint64_t pipeline_layout(const LocalVector<uint64_t> &p_groups);
	void bind_groups(CommandBufferID p_cmd_buffer);
	void begin_subpass(CommandBufferID p_cmd_buffer, bool p_first);
	void end_passes(CommandBufferID p_cmd_buffer);
	void compute_pass(CommandBufferID p_cmd_buffer);
	TextureID make_view(const TextureInfo *p_original, const TextureView &p_view, uint32_t p_dimension, uint32_t p_layer, uint32_t p_layers, uint32_t p_mip, uint32_t p_mips, bool p_owns);
	Shadow *make_shadow(TextureInfo *p_view, uint32_t p_swizzle, uint32_t p_format = 0);
	void make_storage_shadow(TextureInfo *p_texture);
	uint64_t storage_view(TextureInfo *p_texture);
	void flush_stored(CommandBufferID p_cmd_buffer);
	HashMap<uint32_t, uint64_t> back_pipelines; // by format
	void written(CommandBufferID p_cmd_buffer, const TextureInfo *p_texture);
	void refill_shadows(CommandBufferID p_cmd_buffer);
	LocalVector<TextureInfo *> unfilled; // textures whose views have shadows no refill has filled
	std::atomic<uint32_t> shadows = { 0 };
	HashMap<uint64_t, uint64_t> swizzle_pipelines; // by format << 40 | dimension << 32 | swizzle
	HashMap<uint32_t, uint64_t> swizzle_shaders; // by format << 8 | dimension
	uint64_t subresource_view(TextureInfo *p_texture, uint32_t p_mip, uint32_t p_layer);
	uint64_t placeholder_depth(uint32_t p_width, uint32_t p_height, uint32_t p_samples);
	void place_depth(CommandBufferID p_cmd_buffer, uint32_t p_samples);
	HashMap<uint64_t, uint64_t> placeholders; // by samples << 48 | width << 24 | height: views of depth textures
	uint64_t sampled_view(TextureInfo *p_texture, const GroupEntry &p_entry);
	void read_from(CommandBufferID p_cmd_buffer, BufferInfo *p_buffer, uint64_t p_begin, uint64_t p_end);
	void copy_buffer_texture(CommandBufferID p_cmd_buffer, uint32_t p_op, BufferID p_buffer, TextureID p_texture, const BufferTextureCopyRegion &p_region);
	void clear_3d(CommandBufferID p_cmd_buffer, TextureInfo *p_texture, const TextureSubresourceRange &p_subresources);
	LocalVector<BufferID> clear_sources; // what clear_3d copies from: only grown, as recorded commands may read the smaller
	uint64_t idle_module = 0; // an empty compute shader, the module of the pipelines of variants that cannot run here

public:
	/*****************/
	/**** GENERIC ****/
	/*****************/

	Error initialize(uint32_t p_device_index, uint32_t p_frame_count) override;

	/*****************/
	/**** BUFFERS ****/
	/*****************/

	BufferID buffer_create(uint64_t p_size, BitField<BufferUsageBits> p_usage, MemoryAllocationType p_allocation_type, uint64_t p_frames_drawn) override;
	bool buffer_set_texel_format(BufferID p_buffer, DataFormat p_format) override;
	void buffer_free(BufferID p_buffer) override;
	uint64_t buffer_get_allocation_size(BufferID p_buffer) override;
	uint8_t *buffer_map(BufferID p_buffer) override;
	void buffer_unmap(BufferID p_buffer) override;
	uint8_t *buffer_persistent_map_advance(BufferID p_buffer, uint64_t p_frames_drawn) override;
	uint64_t buffer_get_dynamic_offsets(Span<BufferID> p_buffers) override;
	uint64_t buffer_get_device_address(BufferID p_buffer) override;

	/*****************/
	/**** TEXTURE ****/
	/*****************/

	TextureID texture_create(const TextureFormat &p_format, const TextureView &p_view) override;
	TextureID texture_create_from_extension(uint64_t p_native_texture, TextureType p_type, DataFormat p_format, uint32_t p_array_layers, bool p_depth_stencil, uint32_t p_mipmaps) override;
	TextureID texture_create_shared(TextureID p_original_texture, const TextureView &p_view) override;
	TextureID texture_create_shared_from_slice(TextureID p_original_texture, const TextureView &p_view, TextureSliceType p_slice_type, uint32_t p_layer, uint32_t p_layers, uint32_t p_mipmap, uint32_t p_mipmaps) override;
	void texture_free(TextureID p_texture) override;
	uint64_t texture_get_allocation_size(TextureID p_texture) override;
	void texture_get_copyable_layout(TextureID p_texture, const TextureSubresource &p_subresource, TextureCopyableLayout *r_layout) override;
	Vector<uint8_t> texture_get_data(TextureID p_texture, uint32_t p_layer) override;
	BitField<TextureUsageBits> texture_get_usages_supported_by_format(DataFormat p_format, bool p_cpu_readable) override;
	bool texture_can_make_shared_with_format(TextureID p_texture, DataFormat p_format, bool &r_raw_reinterpretation) override;

	/*****************/
	/**** SAMPLER ****/
	/*****************/

	SamplerID sampler_create(const SamplerState &p_state) override;
	void sampler_free(SamplerID p_sampler) override;
	bool sampler_is_format_supported_for_filter(DataFormat p_format, SamplerFilter p_filter) override;

	/**********************/
	/**** VERTEX ARRAY ****/
	/**********************/

	VertexFormatID vertex_format_create(Span<VertexAttribute> p_vertex_attribs, const VertexAttributeBindingsMap &p_vertex_bindings) override;
	void vertex_format_free(VertexFormatID p_vertex_format) override;

	/******************/
	/**** BARRIERS ****/
	/******************/

	void command_pipeline_barrier(CommandBufferID p_cmd_buffer, BitField<PipelineStageBits> p_src_stages, BitField<PipelineStageBits> p_dst_stages,
			VectorView<MemoryAccessBarrier> p_memory_barriers, VectorView<BufferBarrier> p_buffer_barriers, VectorView<TextureBarrier> p_texture_barriers,
			VectorView<AccelerationStructureBarrier> p_acceleration_structure_barriers) override {}

	/****************/
	/**** FENCES ****/
	/****************/

	FenceID fence_create() override { return FenceID(1); }
	Error fence_wait(FenceID p_fence) override { return OK; }
	void fence_free(FenceID p_fence) override {}

	/********************/
	/**** SEMAPHORES ****/
	/********************/

	SemaphoreID semaphore_create() override { return SemaphoreID(1); }
	void semaphore_free(SemaphoreID p_semaphore) override {}

	/******************/
	/**** COMMANDS ****/
	/******************/

	CommandQueueFamilyID command_queue_family_get(BitField<CommandQueueFamilyBits> p_cmd_queue_family_bits, RenderingContextDriver::SurfaceID p_surface = 0) override { return CommandQueueFamilyID(1); }
	CommandQueueID command_queue_create(CommandQueueFamilyID p_cmd_queue_family, bool p_identify_as_main_queue = false) override { return CommandQueueID(1); }
	Error command_queue_execute_and_present(CommandQueueID p_cmd_queue, VectorView<SemaphoreID> p_wait_semaphores, VectorView<CommandBufferID> p_cmd_buffers,
			VectorView<SemaphoreID> p_cmd_semaphores, FenceID p_cmd_fence, VectorView<SwapChainID> p_swap_chains) override;
	void command_queue_free(CommandQueueID p_cmd_queue) override {}
	CommandPoolID command_pool_create(CommandQueueFamilyID p_cmd_queue_family, CommandBufferType p_cmd_buffer_type) override { return CommandPoolID(1); }
	bool command_pool_reset(CommandPoolID p_cmd_pool) override { return true; }
	void command_pool_free(CommandPoolID p_cmd_pool) override {}
	CommandBufferID command_buffer_create(CommandPoolID p_cmd_pool) override;
	bool command_buffer_begin(CommandBufferID p_cmd_buffer) override;
	bool command_buffer_begin_secondary(CommandBufferID p_cmd_buffer, RenderPassID p_render_pass, uint32_t p_subpass, FramebufferID p_framebuffer) override;
	void command_buffer_end(CommandBufferID p_cmd_buffer) override;
	void command_buffer_execute_secondary(CommandBufferID p_cmd_buffer, VectorView<CommandBufferID> p_secondary_cmd_buffers) override;

	/********************/
	/**** SWAP CHAIN ****/
	/********************/

	SwapChainID swap_chain_create(RenderingContextDriver::SurfaceID p_surface) override;
	Error swap_chain_resize(CommandQueueID p_cmd_queue, SwapChainID p_swap_chain, uint32_t p_desired_framebuffer_count) override;
	FramebufferID swap_chain_acquire_framebuffer(CommandQueueID p_cmd_queue, SwapChainID p_swap_chain, bool &r_resize_required) override;
	RenderPassID swap_chain_get_render_pass(SwapChainID p_swap_chain) override;
	DataFormat swap_chain_get_format(SwapChainID p_swap_chain) override;
	ColorSpace swap_chain_get_color_space(SwapChainID p_swap_chain) override { return COLOR_SPACE_REC709_NONLINEAR_SRGB; }
	bool swap_chain_get_hdr_output_supported(SwapChainID p_swap_chain) override { return false; }
	void swap_chain_free(SwapChainID p_swap_chain) override;

	/*********************/
	/**** FRAMEBUFFER ****/
	/*********************/

	FramebufferID framebuffer_create(RenderPassID p_render_pass, VectorView<TextureID> p_attachments, uint32_t p_width, uint32_t p_height) override;
	void framebuffer_free(FramebufferID p_framebuffer) override;

	/****************/
	/**** SHADER ****/
	/****************/

	ShaderID shader_create_from_container(const Ref<RenderingShaderContainer> &p_shader_container, const Vector<ImmutableSampler> &p_immutable_samplers) override;
	void shader_free(ShaderID p_shader) override;
	void shader_destroy_modules(ShaderID p_shader) override {}

	/*********************/
	/**** UNIFORM SET ****/
	/*********************/

	UniformSetID uniform_set_create(VectorView<BoundUniform> p_uniforms, ShaderID p_shader, uint32_t p_set_index, int p_linear_pool_index) override;
	void uniform_set_free(UniformSetID p_uniform_set) override;
	uint32_t uniform_sets_get_dynamic_offsets(VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count) const override;
	void command_uniform_set_prepare_for_use(CommandBufferID p_cmd_buffer, UniformSetID p_uniform_set, ShaderID p_shader, uint32_t p_set_index) override {}

	/******************/
	/**** TRANSFER ****/
	/******************/

	void command_clear_buffer(CommandBufferID p_cmd_buffer, BufferID p_buffer, uint64_t p_offset, uint64_t p_size) override;
	void command_copy_buffer(CommandBufferID p_cmd_buffer, BufferID p_src_buffer, BufferID p_dst_buffer, VectorView<BufferCopyRegion> p_regions) override;
	void command_copy_texture(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, VectorView<TextureCopyRegion> p_regions) override;
	void command_resolve_texture(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, uint32_t p_src_layer, uint32_t p_src_mipmap, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, uint32_t p_dst_layer, uint32_t p_dst_mipmap) override;
	void command_clear_color_texture(CommandBufferID p_cmd_buffer, TextureID p_texture, TextureLayout p_texture_layout, const Color &p_color, const TextureSubresourceRange &p_subresources) override;
	void command_clear_depth_stencil_texture(CommandBufferID p_cmd_buffer, TextureID p_texture, TextureLayout p_texture_layout, float p_depth, uint8_t p_stencil, const TextureSubresourceRange &p_subresources) override;
	void command_copy_buffer_to_texture(CommandBufferID p_cmd_buffer, BufferID p_src_buffer, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, VectorView<BufferTextureCopyRegion> p_regions) override;
	void command_copy_texture_to_buffer(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, BufferID p_dst_buffer, VectorView<BufferTextureCopyRegion> p_regions) override;

	/******************/
	/**** PIPELINE ****/
	/******************/

	void pipeline_free(PipelineID p_pipeline) override;
	void command_bind_push_constants(CommandBufferID p_cmd_buffer, ShaderID p_shader, uint32_t p_first_index, VectorView<uint32_t> p_data) override;
	// The browser caches pipelines; Godot's cache stays empty.
	bool pipeline_cache_create(const Vector<uint8_t> &p_data) override { return false; }
	void pipeline_cache_free() override {}
	size_t pipeline_cache_query_size() override { return 0; }
	Vector<uint8_t> pipeline_cache_serialize() override { return Vector<uint8_t>(); }

	/*******************/
	/**** RENDERING ****/
	/*******************/

	RenderPassID render_pass_create(VectorView<Attachment> p_attachments, VectorView<Subpass> p_subpasses, VectorView<SubpassDependency> p_subpass_dependencies, uint32_t p_view_count, AttachmentReference p_fragment_density_map_attachment) override;
	void render_pass_free(RenderPassID p_render_pass) override;
	void command_begin_render_pass(CommandBufferID p_cmd_buffer, RenderPassID p_render_pass, FramebufferID p_framebuffer, CommandBufferType p_cmd_buffer_type, const Rect2i &p_rect, VectorView<RenderPassClearValue> p_clear_values) override;
	void command_end_render_pass(CommandBufferID p_cmd_buffer) override;
	void command_next_render_subpass(CommandBufferID p_cmd_buffer, CommandBufferType p_cmd_buffer_type) override;
	void command_render_set_viewport(CommandBufferID p_cmd_buffer, VectorView<Rect2i> p_viewports) override;
	void command_render_set_scissor(CommandBufferID p_cmd_buffer, VectorView<Rect2i> p_scissors) override;
	void command_render_clear_attachments(CommandBufferID p_cmd_buffer, VectorView<AttachmentClear> p_attachment_clears, VectorView<Rect2i> p_rects) override;
	void command_bind_render_pipeline(CommandBufferID p_cmd_buffer, PipelineID p_pipeline) override;
	void command_bind_render_uniform_sets(CommandBufferID p_cmd_buffer, VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count, uint32_t p_dynamic_offsets) override;
	void command_render_draw(CommandBufferID p_cmd_buffer, uint32_t p_vertex_count, uint32_t p_instance_count, uint32_t p_base_vertex, uint32_t p_first_instance) override;
	void command_render_draw_indexed(CommandBufferID p_cmd_buffer, uint32_t p_index_count, uint32_t p_instance_count, uint32_t p_first_index, int32_t p_vertex_offset, uint32_t p_first_instance) override;
	void command_render_draw_indexed_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, uint32_t p_draw_count, uint32_t p_stride) override;
	void command_render_draw_indexed_indirect_count(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, BufferID p_count_buffer, uint64_t p_count_buffer_offset, uint32_t p_max_draw_count, uint32_t p_stride) override;
	void command_render_draw_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, uint32_t p_draw_count, uint32_t p_stride) override;
	void command_render_draw_indirect_count(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, BufferID p_count_buffer, uint64_t p_count_buffer_offset, uint32_t p_max_draw_count, uint32_t p_stride) override;
	void command_render_bind_vertex_buffers(CommandBufferID p_cmd_buffer, uint32_t p_binding_count, const BufferID *p_buffers, const uint64_t *p_offsets, uint64_t p_dynamic_offsets) override;
	void command_render_bind_index_buffer(CommandBufferID p_cmd_buffer, BufferID p_buffer, IndexBufferFormat p_format, uint64_t p_offset) override;
	void command_render_set_blend_constants(CommandBufferID p_cmd_buffer, const Color &p_constants) override;
	void command_render_set_line_width(CommandBufferID p_cmd_buffer, float p_width) override;
	PipelineID render_pipeline_create(ShaderID p_shader, VertexFormatID p_vertex_format, RenderPrimitive p_render_primitive, PipelineRasterizationState p_rasterization_state,
			PipelineMultisampleState p_multisample_state, PipelineDepthStencilState p_depth_stencil_state, PipelineColorBlendState p_blend_state, VectorView<int32_t> p_color_attachments,
			BitField<PipelineDynamicStateFlags> p_dynamic_state, RenderPassID p_render_pass, uint32_t p_render_subpass, VectorView<PipelineSpecializationConstant> p_specialization_constants) override;

	/*****************/
	/**** COMPUTE ****/
	/*****************/

	void command_bind_compute_pipeline(CommandBufferID p_cmd_buffer, PipelineID p_pipeline) override;
	void command_bind_compute_uniform_sets(CommandBufferID p_cmd_buffer, VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count, uint32_t p_dynamic_offsets) override;
	void command_compute_dispatch(CommandBufferID p_cmd_buffer, uint32_t p_x_groups, uint32_t p_y_groups, uint32_t p_z_groups) override;
	void command_compute_dispatch_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset) override;
	PipelineID compute_pipeline_create(ShaderID p_shader, VectorView<PipelineSpecializationConstant> p_specialization_constants) override;

	/********************/
	/**** RAYTRACING ****/
	/********************/

	// WebGPU has no ray tracing; the feature is not reported.
	AccelerationStructureID blas_create(VectorView<AccelerationStructureGeometry> p_geometries, BitField<AccelerationStructureFlagBits> p_flags) override { return AccelerationStructureID(); }
	AccelerationStructureID tlas_create(uint32_t p_max_instance_count, BitField<AccelerationStructureFlagBits> p_flags) override { return AccelerationStructureID(); }
	void acceleration_structure_instance_write(uint8_t *r_driver_instance, const AccelerationStructureInstance &p_instance) override {}
	void acceleration_structure_free(AccelerationStructureID p_acceleration_structure) override {}
	uint32_t acceleration_structure_get_scratch_size_bytes(AccelerationStructureID p_acceleration_structure) override { return 0; }
	RaytracingPipelineID raytracing_pipeline_create(VectorView<PipelineShader> p_shaders, VectorView<uint32_t> p_raygen_shader_indices, VectorView<uint32_t> p_miss_shader_indices, VectorView<HitGroup> p_hit_groups, uint32_t p_max_trace_recursion_depth, ShaderID p_layout_defining_shader) override { return RaytracingPipelineID(); }
	void raytracing_pipeline_free(RaytracingPipelineID p_pipeline) override {}
	bool raytracing_pipeline_get_shader_group_handles(RaytracingPipelineID p_pipeline, uint32_t p_group_index_offset, VectorView<uint32_t> p_group_indices, uint8_t *r_data, uint32_t p_data_stride_bytes) override { return false; }
	void command_build_blas(CommandBufferID p_cmd_buffer, AccelerationStructureID p_acceleration_structure, BufferID p_scratch_buffer) override {}
	void command_build_tlas(CommandBufferID p_cmd_buffer, AccelerationStructureID p_acceleration_structure, BufferID p_scratch_buffer, BufferID p_instance_buffer, uint32_t p_instance_offset, uint32_t p_instance_count) override {}
	void command_bind_raytracing_pipeline(CommandBufferID p_cmd_buffer, RaytracingPipelineID p_pipeline) override {}
	void command_bind_raytracing_uniform_set(CommandBufferID p_cmd_buffer, UniformSetID p_uniform_set, ShaderID p_shader, uint32_t p_set_index) override {}
	void command_trace_rays(CommandBufferID p_cmd_buffer, const ShaderBindingTable &p_raygen_sbt, const ShaderBindingTable &p_miss_sbt, const ShaderBindingTable &p_hit_sbt, uint32_t p_width, uint32_t p_height, uint32_t p_depth) override {}

	/*****************/
	/**** QUERIES ****/
	/*****************/

	QueryPoolID timestamp_query_pool_create(uint32_t p_query_count) override;
	void timestamp_query_pool_free(QueryPoolID p_pool_id) override;
	void timestamp_query_pool_get_results(QueryPoolID p_pool_id, uint32_t p_query_count, uint64_t *r_results) override;
	uint64_t timestamp_query_result_to_time(uint64_t p_result) override { return p_result; }
	void command_timestamp_query_pool_reset(CommandBufferID p_cmd_buffer, QueryPoolID p_pool_id, uint32_t p_query_count) override {}
	void command_timestamp_write(CommandBufferID p_cmd_buffer, QueryPoolID p_pool_id, uint32_t p_index) override;

	/****************/
	/**** LABELS ****/
	/****************/

	// Labels change no pixel; gpu@0 carries none.
	void command_begin_label(CommandBufferID p_cmd_buffer, const char *p_label_name, const Color &p_color) override {}
	void command_end_label(CommandBufferID p_cmd_buffer) override {}
	void command_insert_breadcrumb(CommandBufferID p_cmd_buffer, uint32_t p_data) override {}

	/********************/
	/**** SUBMISSION ****/
	/********************/

	void begin_segment(uint32_t p_frame_index, uint32_t p_frames_drawn) override;
	void end_segment() override {}

	/**************/
	/**** MISC ****/
	/**************/

	void set_object_name(ObjectType p_type, ID p_driver_id, const String &p_name) override {}
	uint64_t get_resource_native_handle(DriverResource p_type, ID p_driver_id) override { return 0; }
	uint64_t get_total_memory_used() override { return total_memory; }
	uint64_t get_lazily_memory_used() override { return 0; }
	uint64_t limit_get(Limit p_limit) override;
	uint64_t api_trait_get(ApiTrait p_trait) override;
	bool has_feature(Features p_feature) override;
	const MultiviewCapabilities &get_multiview_capabilities() override { return multiview_capabilities; }
	const FragmentShadingRateCapabilities &get_fragment_shading_rate_capabilities() override { return fsr_capabilities; }
	const FragmentDensityMapCapabilities &get_fragment_density_map_capabilities() override { return fdm_capabilities; }
	String get_api_name() const override { return "WebGPU"; }
	String get_api_version() const override { return "gpu@0"; }
	String get_pipeline_cache_uuid() const override { return "dolly-gpu-0"; }
	const Capabilities &get_capabilities() const override { return capabilities; }
	const RenderingShaderContainerFormat &get_shader_container_format() const override { return shader_container_format; }

	RenderingDeviceDriverWebGPU(RenderingContextDriverWebGPU *p_context_driver);
	~RenderingDeviceDriverWebGPU();
};
