#include "rendering_device_driver_webgpu.h"

#include "rendering_context_driver_webgpu.h"

#include "core/string/print_string.h"

#include <errno.h>

// gpu@0's WebGPU buffer usage bits.
enum : uint32_t {
	GPU_MAP_READ = 1,
	GPU_COPY_SRC = 4,
	GPU_COPY_DST = 8,
	GPU_INDEX = 16,
	GPU_VERTEX = 32,
	GPU_UNIFORM = 64,
	GPU_STORAGE = 128,
	GPU_INDIRECT = 256,
	GPU_QUERY_RESOLVE = 512,
};
// And its texture usage bits.
enum : uint32_t {
	TEX_COPY_SRC = 1,
	TEX_COPY_DST = 2,
	TEX_SAMPLED = 4,
	TEX_STORAGE = 8,
	TEX_RENDER = 16,
};
// LIMITS' order (host/gpu/dolly-gpu-0.wat).
enum : uint32_t {
	L_TEXTURE_1D = 1,
	L_TEXTURE_2D,
	L_TEXTURE_3D,
	L_ARRAY_LAYERS,
	L_BIND_GROUPS,
	L_BINDINGS_PER_GROUP,
	L_DYNAMIC_UNIFORM,
	L_DYNAMIC_STORAGE,
	L_SAMPLED_TEXTURES,
	L_SAMPLERS,
	L_STORAGE_BUFFERS,
	L_STORAGE_TEXTURES,
	L_UNIFORM_BUFFERS,
	L_UNIFORM_BINDING_SIZE,
	L_STORAGE_BINDING_SIZE,
	L_UNIFORM_ALIGNMENT,
	L_STORAGE_ALIGNMENT,
	L_VERTEX_BUFFERS,
	L_BUFFER_SIZE,
	L_VERTEX_ATTRIBUTES,
	L_VERTEX_STRIDE,
	L_INTER_STAGE,
	L_COLOR_ATTACHMENTS,
	L_COLOR_BYTES,
	L_WORKGROUP_STORAGE,
	L_INVOCATIONS,
	L_WORKGROUP_X,
	L_WORKGROUP_Y,
	L_WORKGROUP_Z,
	L_WORKGROUPS,
};

static const uint32_t PUSH_CONSTANT_BYTES = 128;
static const uint64_t PUSH_RING_FRAME_BYTES = 4 << 20;
static const uint32_t UPLOAD_CHUNK = 512 << 10;

static void put16(uint8_t *p, uint32_t at, uint16_t v) { memcpy(p + at, &v, 2); }
static uint64_t allocated(const RenderingDeviceDriverWebGPU::BufferInfo *p_buffer) {
	return p_buffer->stride ? p_buffer->stride * p_buffer->copies : (p_buffer->size + 3) & ~3ull;
}
static void put32(uint8_t *p, uint32_t at, uint32_t v) { memcpy(p + at, &v, 4); }
static void put64(uint8_t *p, uint32_t at, uint64_t v) { memcpy(p + at, &v, 8); }
static void putf(uint8_t *p, uint32_t at, float v) { memcpy(p + at, &v, 4); }
static uint32_t padded(uint32_t p_bytes) { return (p_bytes + 7) & ~7u; }

// A record built here, then queued: gpu@0 handles are numbered in the order the provider
// meets their records, so a creating record gets its handle as it is queued (object()).
struct Record {
	LocalVector<uint8_t> bytes;
	Record(uint32_t p_op, uint32_t p_bytes) {
		bytes.resize(padded(p_bytes));
		memset(bytes.ptr(), 0, bytes.size());
		put32(bytes.ptr(), 0, p_op);
		put32(bytes.ptr(), 4, bytes.size());
	}
	uint8_t *p() { return bytes.ptr(); }
};

/****************/
/**** FORMATS ***/
/****************/

// gpu@0's texture format for one of Godot's, or 0 where WebGPU has no exact one; Godot then
// converts or picks another (texture_storage.cpp, render_scene_buffers_rd.cpp).
static uint32_t gpu_texture_format(RDD::DataFormat p_format) {
	switch (p_format) {
		case RDD::DATA_FORMAT_R8G8B8A8_UNORM: return 1;
		case RDD::DATA_FORMAT_R8G8B8A8_SRGB: return 2;
		case RDD::DATA_FORMAT_R8_UNORM: return 3;
		case RDD::DATA_FORMAT_R8G8_UNORM: return 4;
		case RDD::DATA_FORMAT_D32_SFLOAT: return 6;
		case RDD::DATA_FORMAT_BC1_RGBA_UNORM_BLOCK: return 7;
		case RDD::DATA_FORMAT_BC2_UNORM_BLOCK: return 8;
		case RDD::DATA_FORMAT_BC3_UNORM_BLOCK: return 9;
		case RDD::DATA_FORMAT_R8_SNORM: return 10;
		case RDD::DATA_FORMAT_R8_UINT: return 11;
		case RDD::DATA_FORMAT_R8_SINT: return 12;
		case RDD::DATA_FORMAT_R16_UINT: return 13;
		case RDD::DATA_FORMAT_R16_SINT: return 14;
		case RDD::DATA_FORMAT_R16_SFLOAT: return 15;
		case RDD::DATA_FORMAT_R8G8_SNORM: return 16;
		case RDD::DATA_FORMAT_R8G8_UINT: return 17;
		case RDD::DATA_FORMAT_R8G8_SINT: return 18;
		case RDD::DATA_FORMAT_R32_UINT: return 19;
		case RDD::DATA_FORMAT_R32_SINT: return 20;
		case RDD::DATA_FORMAT_R32_SFLOAT: return 21;
		case RDD::DATA_FORMAT_R16G16_UINT: return 22;
		case RDD::DATA_FORMAT_R16G16_SINT: return 23;
		case RDD::DATA_FORMAT_R16G16_SFLOAT: return 24;
		case RDD::DATA_FORMAT_R8G8B8A8_SNORM: return 25;
		case RDD::DATA_FORMAT_R8G8B8A8_UINT: return 26;
		case RDD::DATA_FORMAT_R8G8B8A8_SINT: return 27;
		case RDD::DATA_FORMAT_B8G8R8A8_UNORM: return 28;
		case RDD::DATA_FORMAT_B8G8R8A8_SRGB: return 29;
		case RDD::DATA_FORMAT_E5B9G9R9_UFLOAT_PACK32: return 30;
		case RDD::DATA_FORMAT_A2B10G10R10_UINT_PACK32: return 31;
		case RDD::DATA_FORMAT_A2B10G10R10_UNORM_PACK32: return 32;
		case RDD::DATA_FORMAT_B10G11R11_UFLOAT_PACK32: return 33;
		case RDD::DATA_FORMAT_R32G32_UINT: return 34;
		case RDD::DATA_FORMAT_R32G32_SINT: return 35;
		case RDD::DATA_FORMAT_R32G32_SFLOAT: return 36;
		case RDD::DATA_FORMAT_R16G16B16A16_UINT: return 37;
		case RDD::DATA_FORMAT_R16G16B16A16_SINT: return 38;
		case RDD::DATA_FORMAT_R16G16B16A16_SFLOAT: return 39;
		case RDD::DATA_FORMAT_R32G32B32A32_UINT: return 40;
		case RDD::DATA_FORMAT_R32G32B32A32_SINT: return 41;
		case RDD::DATA_FORMAT_R32G32B32A32_SFLOAT: return 42;
		case RDD::DATA_FORMAT_S8_UINT: return 43;
		case RDD::DATA_FORMAT_D16_UNORM: return 44;
		case RDD::DATA_FORMAT_D32_SFLOAT_S8_UINT: return 45;
		case RDD::DATA_FORMAT_BC1_RGBA_SRGB_BLOCK: return 46;
		case RDD::DATA_FORMAT_BC2_SRGB_BLOCK: return 47;
		case RDD::DATA_FORMAT_BC3_SRGB_BLOCK: return 48;
		case RDD::DATA_FORMAT_BC4_UNORM_BLOCK: return 49;
		case RDD::DATA_FORMAT_BC4_SNORM_BLOCK: return 50;
		case RDD::DATA_FORMAT_BC5_UNORM_BLOCK: return 51;
		case RDD::DATA_FORMAT_BC5_SNORM_BLOCK: return 52;
		case RDD::DATA_FORMAT_BC6H_UFLOAT_BLOCK: return 53;
		case RDD::DATA_FORMAT_BC6H_SFLOAT_BLOCK: return 54;
		case RDD::DATA_FORMAT_BC7_UNORM_BLOCK: return 55;
		case RDD::DATA_FORMAT_BC7_SRGB_BLOCK: return 56;
		case RDD::DATA_FORMAT_R16_UNORM: return 57;
		case RDD::DATA_FORMAT_R16_SNORM: return 58;
		case RDD::DATA_FORMAT_R16G16_UNORM: return 59;
		case RDD::DATA_FORMAT_R16G16_SNORM: return 60;
		case RDD::DATA_FORMAT_R16G16B16A16_UNORM: return 61;
		case RDD::DATA_FORMAT_R16G16B16A16_SNORM: return 62;
		default: return 0;
	}
}

static bool is_compressed(uint32_t p_gpu) { return (p_gpu >= 7 && p_gpu <= 9) || (p_gpu >= 46 && p_gpu <= 56); }
static bool is_depth(uint32_t p_gpu) { return p_gpu == 6 || p_gpu == 44 || p_gpu == 45; }
static bool is_stencil(uint32_t p_gpu) { return p_gpu == 43 || p_gpu == 45; }
// LIMITS' feature bits.
enum : uint64_t {
	F_DEPTH_CLIP_CONTROL = 1,
	F_DEPTH32_STENCIL8 = 2,
	F_BC = 4,
	F_TIMESTAMPS = 8,
	F_RG11B10_RENDERABLE = 64,
	F_FLOAT32_FILTERABLE = 128,
	F_SWIZZLE = 1024,
	F_TIER1 = 2048,
};
// Whether the device has a format at all: the 16-bit normalized ones are texture-formats-tier1's.
static bool exists(uint32_t p_gpu, uint64_t p_features) {
	return p_gpu && (!is_compressed(p_gpu) || (p_features & F_BC)) && (p_gpu != 45 || (p_features & F_DEPTH32_STENCIL8)) &&
			(p_gpu < 57 || (p_features & F_TIER1));
}
// WebGPU's renderable formats: tier 1 adds the snorm and 16-bit normalized ones.
static bool is_renderable(uint32_t p_gpu, uint64_t p_features) {
	if (is_compressed(p_gpu) || p_gpu == 30) return false;
	if (p_gpu == 33) return p_features & F_RG11B10_RENDERABLE;
	return (p_features & F_TIER1) || !(p_gpu == 10 || p_gpu == 16 || p_gpu == 25 || p_gpu >= 57);
}
// WebGPU's storage formats: the core ones, and tier 1's 8- and 16-bit and packed ones.
static bool is_storage(uint32_t p_gpu, uint64_t p_features) {
	switch (p_gpu) {
		case 1: case 25: case 26: case 27: case 37: case 38: case 39: case 19: case 20: case 21:
		case 34: case 35: case 36: case 40: case 41: case 42:
			return true;
		case 3: case 4: case 10: case 11: case 12: case 13: case 14: case 15: case 16: case 17: case 18:
		case 22: case 23: case 24: case 31: case 32: case 33: case 57: case 58: case 59: case 60: case 61: case 62:
			return p_features & F_TIER1;
		default:
			return false;
	}
}
static bool is_integer(uint32_t p_gpu) {
	switch (p_gpu) {
		case 11: case 12: case 13: case 14: case 17: case 18: case 19: case 20: case 22: case 23:
		case 26: case 27: case 31: case 34: case 35: case 37: case 38: case 40: case 41: case 43:
			return true;
		default:
			return false;
	}
}

// gpu@0's vertex formats (GRAPHICS_PIPELINE's list and its continuation).
static uint32_t gpu_vertex_format(RDD::DataFormat p_format) {
	switch (p_format) {
		case RDD::DATA_FORMAT_R32_SFLOAT: return 1;
		case RDD::DATA_FORMAT_R32G32_SFLOAT: return 2;
		case RDD::DATA_FORMAT_R32G32B32_SFLOAT: return 3;
		case RDD::DATA_FORMAT_R32G32B32A32_SFLOAT: return 4;
		case RDD::DATA_FORMAT_R8G8B8A8_UNORM: return 5;
		case RDD::DATA_FORMAT_R8G8B8A8_SNORM: return 6;
		case RDD::DATA_FORMAT_R8G8B8A8_UINT: return 7;
		case RDD::DATA_FORMAT_R8G8B8A8_SINT: return 8;
		case RDD::DATA_FORMAT_R16G16_UNORM: return 9;
		case RDD::DATA_FORMAT_R16G16B16A16_UNORM: return 10;
		case RDD::DATA_FORMAT_R16G16_UINT: return 11;
		case RDD::DATA_FORMAT_R16G16B16A16_UINT: return 12;
		case RDD::DATA_FORMAT_R16G16_SFLOAT: return 13;
		case RDD::DATA_FORMAT_R16G16B16A16_SFLOAT: return 14;
		case RDD::DATA_FORMAT_R8G8_UINT: return 15;
		case RDD::DATA_FORMAT_R8G8_SINT: return 16;
		case RDD::DATA_FORMAT_R8G8_UNORM: return 17;
		case RDD::DATA_FORMAT_R8G8_SNORM: return 18;
		case RDD::DATA_FORMAT_R16G16_SINT: return 19;
		case RDD::DATA_FORMAT_R16G16B16A16_SINT: return 20;
		case RDD::DATA_FORMAT_R16G16_SNORM: return 21;
		case RDD::DATA_FORMAT_R16G16B16A16_SNORM: return 22;
		case RDD::DATA_FORMAT_R32_UINT: return 23;
		case RDD::DATA_FORMAT_R32G32_UINT: return 24;
		case RDD::DATA_FORMAT_R32G32B32_UINT: return 25;
		case RDD::DATA_FORMAT_R32G32B32A32_UINT: return 26;
		case RDD::DATA_FORMAT_R32_SINT: return 27;
		case RDD::DATA_FORMAT_R32G32_SINT: return 28;
		case RDD::DATA_FORMAT_R32G32B32_SINT: return 29;
		case RDD::DATA_FORMAT_R32G32B32A32_SINT: return 30;
		case RDD::DATA_FORMAT_A2B10G10R10_UNORM_PACK32: return 31;
		default: return 0;
	}
}

static uint32_t gpu_compare(RDD::CompareOperator p_op) { return uint32_t(p_op) + 1; }

static uint32_t gpu_stencil_op(RDD::StencilOperation p_op) {
	static const uint32_t ops[] = { 0, 1, 2, 4, 5, 3, 6, 7 };
	return ops[p_op];
}

static bool gpu_blend_factor(RDD::BlendFactor p_factor, uint32_t &r_factor) {
	static const int factors[] = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, -1, -1, 10, -1, -1, -1, -1 };
	if (factors[p_factor] < 0) return false;
	r_factor = factors[p_factor];
	return true;
}

/*****************/
/**** RECORDS ****/
/*****************/

uint8_t *RenderingDeviceDriverWebGPU::command_record(CommandBufferID p_cmd_buffer, uint32_t p_op, uint32_t p_bytes) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	const uint32_t size = padded(p_bytes), at = cb->records.size();
	cb->records.resize(at + size);
	uint8_t *p = cb->records.ptr() + at;
	memset(p, 0, size);
	put32(p, 0, p_op);
	put32(p, 4, size);
	cb->count++;
	return p;
}

// Queues an object's record; a creating one gets the next handle at offset 8, returned.
static uint64_t queue(Mutex &p_mutex, std::atomic<uint64_t> &p_next, LocalVector<uint8_t> &p_pending, uint32_t &p_count, Record &p_record, bool p_creates) {
	MutexLock lock(p_mutex);
	uint64_t handle = 0;
	if (p_creates) {
		handle = ++p_next;
		put64(p_record.p(), 8, handle);
	}
	const uint32_t at = p_pending.size();
	p_pending.resize(at + p_record.bytes.size());
	memcpy(p_pending.ptr() + at, p_record.p(), p_record.bytes.size());
	p_count++;
	return handle;
}

#define CREATE(m_record) queue(mutex, next_id, pending, pending_count, m_record, true)
#define QUEUE(m_record) queue(mutex, next_id, pending, pending_count, m_record, false)

void RenderingDeviceDriverWebGPU::release(uint64_t p_handle) {
	if (!p_handle) return;
	Record r(DOLLY_GPU_RELEASE, 16);
	put64(r.p(), 8, p_handle);
	QUEUE(r);
}

// The scope's packet, sent; with BATCH_CONTINUE its encoder and pass go on in the next one.
bool RenderingDeviceDriverWebGPU::send(bool p_continue) {
	if (gpu->count == 0) {
		dolly_gpu_begin(gpu);
		return true;
	}
	const int status = p_continue ? dolly_gpu_continue(gpu) : dolly_gpu_batch(gpu);
	const int error = errno;
	dolly_gpu_begin(gpu);
	ERR_FAIL_COND_V_MSG(status < 0, false, vformat("gpu@0 refused a batch (errno %d); the page's console has the provider's message.", error));
	return true;
}

// Room for one record in the scope's packet, the full packet sent first; the mutex is held.
uint8_t *RenderingDeviceDriverWebGPU::packet_record(uint32_t p_op, uint32_t p_bytes, bool &r_sent_any) {
	const uint32_t size = padded(p_bytes);
	if (gpu->length + size > DOLLY_GPU_PACKET_BYTES || gpu->count == DOLLY_GPU_MAX_COMMANDS) {
		r_sent_any = true;
		send(true);
	}
	return (uint8_t *)dolly_gpu_record(gpu, p_op, size);
}

bool RenderingDeviceDriverWebGPU::flush_pending() {
	bool sent = false;
	for (uint32_t at = 0; at < pending.size();) {
		uint32_t op, size;
		memcpy(&op, pending.ptr() + at, 4);
		memcpy(&size, pending.ptr() + at + 4, 4);
		uint8_t *p = packet_record(op, size, sent);
		memcpy(p, pending.ptr() + at, size);
		at += size;
	}
	pending.clear();
	pending_count = 0;
	return true;
}

void RenderingDeviceDriverWebGPU::mark_dirty(BufferInfo *p_buffer, uint64_t p_begin, uint64_t p_end) {
	MutexLock lock(mutex);
	p_buffer->dirty_begin = MIN(p_buffer->dirty_begin, p_begin);
	p_buffer->dirty_end = MAX(p_buffer->dirty_end, p_end);
	dirty.insert(p_buffer);
}

// Every queued object and CPU-written range sent, then the GPU's work awaited: gpu@0's WAIT.
bool RenderingDeviceDriverWebGPU::wait_idle() {
	MutexLock lock(mutex);
	flush_pending();
	send(false);
	return dolly_gpu_wait(gpu) >= 0;
}

// Copies a range of a buffer the GPU wrote (MAP_READ usage) into r_out: gpu@0 maps it, then
// reads 64 KiB a call. Waits for the GPU: the driver's only waits.
bool RenderingDeviceDriverWebGPU::read_buffer(BufferInfo *p_buffer, uint64_t p_offset, uint64_t p_size, uint8_t *r_out) {
	MutexLock lock(mutex);
	flush_pending();
	send(false);
	bool sent = false;
	uint8_t *p = packet_record(DOLLY_GPU_MAP_READ, 32, sent);
	put64(p, 8, p_buffer->handle);
	put64(p, 16, p_offset);
	put64(p, 24, p_size);
	ERR_FAIL_COND_V(!send(false), false);
	for (uint64_t done = 0; done < p_size;) {
		const uint64_t n = MIN(p_size - done, uint64_t(DOLLY_GPU_REPLY_BYTES));
		ERR_FAIL_COND_V(dolly_gpu_read(gpu, p_buffer->handle, done, n) != int(n), false);
		memcpy(r_out + done, gpu->reply, n);
		done += n;
	}
	p = packet_record(DOLLY_GPU_UNMAP, 16, sent);
	put64(p, 8, p_buffer->handle);
	return send(false);
}

/*****************/
/**** GENERIC ****/
/*****************/

RenderingDeviceDriverWebGPU::RenderingDeviceDriverWebGPU(RenderingContextDriverWebGPU *p_context_driver) :
		context_driver(p_context_driver) {}

RenderingDeviceDriverWebGPU::~RenderingDeviceDriverWebGPU() {
	if (gpu) {
		dolly_gpu_close(gpu);
		memdelete(gpu);
	}
	memfree(push_ring.copy);
}

Error RenderingDeviceDriverWebGPU::initialize(uint32_t p_device_index, uint32_t p_frame_count) {
	frame_count = p_frame_count;
	gpu = memnew(dolly_gpu);
	// The surface takes the size of the passes that draw on it.
	ERR_FAIL_COND_V_MSG(dolly_gpu_open(gpu, 64, 64) < 0, ERR_CANT_CREATE, vformat("gpu@0 did not open (errno %d).", errno));
	ERR_FAIL_COND_V(dolly_gpu_capabilities(gpu) != 128, ERR_CANT_CREATE);
	uint32_t capability_bits;
	memcpy(&capability_bits, gpu->reply, 4);
	surface_format = (capability_bits & DOLLY_GPU_FEATURE_SURFACE_BGRA) ? 28 : 1;
	ERR_FAIL_COND_V(dolly_gpu_limits(gpu) != 280, ERR_CANT_CREATE);
	memcpy(limits, gpu->reply, sizeof(limits));
	features = limits[0];
	dolly_gpu_begin(gpu);

	capabilities.device_family = DEVICE_UNKNOWN;
	capabilities.version_major = 0;
	capabilities.version_minor = 0;

	// Push constants: a ring of frame_count regions, bound in group 0 at a dynamic offset.
	push_ring_frame_bytes = PUSH_RING_FRAME_BYTES;
	push_ring.size = push_ring_frame_bytes * frame_count;
	push_ring.copy = (uint8_t *)memalloc(push_ring.size);
	{
		Record r(DOLLY_GPU_CREATE_BUFFER, 32);
		put64(r.p(), 16, push_ring.size);
		put32(r.p(), 24, GPU_STORAGE | GPU_COPY_DST);
		push_ring.handle = CREATE(r);
	}
	return OK;
}

void RenderingDeviceDriverWebGPU::begin_segment(uint32_t p_frame_index, uint32_t p_frames_drawn) {
	frame = p_frame_index % frame_count;
	push_cursor = 0;
}

/*****************/
/**** BUFFERS ****/
/*****************/

RDD::BufferID RenderingDeviceDriverWebGPU::buffer_create(uint64_t p_size, BitField<BufferUsageBits> p_usage, MemoryAllocationType p_allocation_type, uint64_t p_frames_drawn) {
	ERR_FAIL_COND_V_MSG(p_usage.has_flag(BUFFER_USAGE_DEVICE_ADDRESS_BIT) || p_usage.has_flag(BUFFER_USAGE_SHADER_BINDING_TABLE_BIT) ||
					p_usage.has_flag(BUFFER_USAGE_ACCELERATION_STRUCTURE_STORAGE_BIT),
			BufferID(), "WebGPU has no buffer addresses or acceleration structures.");
	BufferInfo *buffer = memnew(BufferInfo);
	buffer->size = p_size;
	uint32_t usage = 0;
	if (p_usage.has_flag(BUFFER_USAGE_TRANSFER_FROM_BIT)) usage |= GPU_COPY_SRC;
	if (p_usage.has_flag(BUFFER_USAGE_TRANSFER_TO_BIT)) usage |= GPU_COPY_DST;
	if (p_usage.has_flag(BUFFER_USAGE_UNIFORM_BIT)) usage |= GPU_UNIFORM;
	if (p_usage.has_flag(BUFFER_USAGE_STORAGE_BIT)) usage |= GPU_STORAGE;
	if (p_usage.has_flag(BUFFER_USAGE_INDEX_BIT)) usage |= GPU_INDEX;
	if (p_usage.has_flag(BUFFER_USAGE_VERTEX_BIT)) usage |= GPU_VERTEX;
	if (p_usage.has_flag(BUFFER_USAGE_INDIRECT_BIT)) usage |= GPU_INDIRECT;
	const bool persistent = p_usage.has_flag(BUFFER_USAGE_DYNAMIC_PERSISTENT_BIT);
	uint64_t size = (p_size + 3) & ~3ull;
	if (persistent) {
		// frame_count copies, chosen by a dynamic offset (as Vulkan's driver keeps them).
		const uint64_t alignment = MAX(limits[L_UNIFORM_ALIGNMENT], limits[L_STORAGE_ALIGNMENT]);
		buffer->stride = (size + alignment - 1) / alignment * alignment;
		buffer->copies = frame_count;
		size = buffer->stride * frame_count;
		buffer->copy = (uint8_t *)memalloc(size);
		usage |= GPU_COPY_DST;
	} else if (p_allocation_type == MEMORY_ALLOCATION_TYPE_CPU) {
		// Godot's staging and readback buffers: a copy here, uploaded when written, or a buffer
		// the GPU copies into and Godot maps to read.
		buffer->copy = (uint8_t *)memalloc(size);
		buffer->readback = p_usage.has_flag(BUFFER_USAGE_TRANSFER_TO_BIT) && !p_usage.has_flag(BUFFER_USAGE_TRANSFER_FROM_BIT);
		usage = buffer->readback ? (GPU_MAP_READ | GPU_COPY_DST) : (usage | GPU_COPY_SRC | GPU_COPY_DST);
	}
	Record r(DOLLY_GPU_CREATE_BUFFER, 32);
	put64(r.p(), 16, size);
	put32(r.p(), 24, usage);
	buffer->handle = CREATE(r);
	total_memory += size;
	return BufferID(buffer);
}

// WGSL has no texel buffers: a shader that reads one does not translate. The buffer itself is
// one like any other (Godot makes one at startup that nothing binds).
bool RenderingDeviceDriverWebGPU::buffer_set_texel_format(BufferID p_buffer, DataFormat p_format) {
	return true;
}

void RenderingDeviceDriverWebGPU::buffer_free(BufferID p_buffer) {
	BufferInfo *buffer = (BufferInfo *)p_buffer.id;
	{
		MutexLock lock(mutex);
		dirty.erase(buffer);
	}
	release(buffer->handle);
	total_memory -= buffer->stride ? buffer->stride * buffer->copies : buffer->size;
	if (buffer->copy) memfree(buffer->copy);
	memdelete(buffer);
}

uint64_t RenderingDeviceDriverWebGPU::buffer_get_allocation_size(BufferID p_buffer) {
	const BufferInfo *buffer = (const BufferInfo *)p_buffer.id;
	return buffer->stride ? buffer->stride * buffer->copies : buffer->size;
}

uint8_t *RenderingDeviceDriverWebGPU::buffer_map(BufferID p_buffer) {
	BufferInfo *buffer = (BufferInfo *)p_buffer.id;
	ERR_FAIL_NULL_V_MSG(buffer->copy, nullptr, "Only CPU buffers map.");
	if (buffer->readback) {
		ERR_FAIL_COND_V(!read_buffer(buffer, 0, (buffer->size + 3) & ~3ull, buffer->copy), nullptr);
	}
	return buffer->copy;
}

// Godot keeps its staging blocks mapped for their whole life: a copy from a CPU buffer sends
// the range it reads (read_from), not an unmap.
void RenderingDeviceDriverWebGPU::buffer_unmap(BufferID p_buffer) {
}

void RenderingDeviceDriverWebGPU::read_from(CommandBufferID p_cmd_buffer, BufferInfo *p_buffer, uint64_t p_begin, uint64_t p_end) {
	if (p_buffer->copy && !p_buffer->readback && !p_buffer->stride) {
		((CommandBufferInfo *)p_cmd_buffer.id)->uploads.push_back({ p_buffer, p_begin, p_end });
	}
}

uint8_t *RenderingDeviceDriverWebGPU::buffer_persistent_map_advance(BufferID p_buffer, uint64_t p_frames_drawn) {
	BufferInfo *buffer = (BufferInfo *)p_buffer.id;
	ERR_FAIL_COND_V_MSG(!buffer->stride, nullptr, "Buffer must have BUFFER_USAGE_DYNAMIC_PERSISTENT_BIT.");
	buffer->frame = (buffer->frame + 1) % buffer->copies;
	const uint64_t begin = buffer->frame * buffer->stride;
	mark_dirty(buffer, begin, begin + buffer->size);
	return buffer->copy + begin;
}

uint64_t RenderingDeviceDriverWebGPU::buffer_get_dynamic_offsets(Span<BufferID> p_buffers) {
	uint64_t mask = 0, shift = 0;
	for (const BufferID &id : p_buffers) {
		const BufferInfo *buffer = (const BufferInfo *)id.id;
		if (!buffer->stride) continue;
		mask |= uint64_t(buffer->frame) << shift;
		shift += 2;
	}
	return mask;
}

uint64_t RenderingDeviceDriverWebGPU::buffer_get_device_address(BufferID p_buffer) {
	return 0;
}

/*****************/
/**** TEXTURE ****/
/*****************/

static uint32_t view_dimension(RDD::TextureType p_type) {
	static const uint32_t dimensions[] = { 1, 2, 6, 4, 1, 3, 5 };
	return dimensions[p_type];
}

static uint32_t swizzle_channel(RDD::TextureSwizzle p_swizzle, uint32_t p_identity) {
	switch (p_swizzle) {
		case RDD::TEXTURE_SWIZZLE_ZERO: return 4;
		case RDD::TEXTURE_SWIZZLE_ONE: return 5;
		case RDD::TEXTURE_SWIZZLE_R: return 0;
		case RDD::TEXTURE_SWIZZLE_G: return 1;
		case RDD::TEXTURE_SWIZZLE_B: return 2;
		case RDD::TEXTURE_SWIZZLE_A: return 3;
		default: return p_identity;
	}
}

static uint32_t swizzle(const RDD::TextureView &p_view) {
	return swizzle_channel(p_view.swizzle_r, 0) | swizzle_channel(p_view.swizzle_g, 1) << 8 |
			swizzle_channel(p_view.swizzle_b, 2) << 16 | swizzle_channel(p_view.swizzle_a, 3) << 24;
}

// What WebGPU's sampling already gives a format of one, two or four channels: (r,0,0,1),
// (r,g,0,1), (r,g,b,a). A swizzle equal to it needs nothing.
static uint32_t default_swizzle(uint32_t p_gpu) {
	switch (p_gpu) {
		case 3: case 10: case 11: case 12: case 13: case 14: case 15: case 19: case 20: case 21: case 49: case 50: case 57: case 58:
			return 0x05040400;
		case 4: case 16: case 17: case 18: case 22: case 23: case 24: case 34: case 35: case 36: case 51: case 52: case 59: case 60:
			return 0x05040100;
		default:
			return 0x03020100;
	}
}

// The format of p_gpu's bytes without sRGB decoding, and the sRGB one of a linear format (0: none).
static uint32_t linear_format(uint32_t p_gpu) {
	switch (p_gpu) {
		case 2: return 1;
		case 29: return 28;
		case 46: return 7;
		case 47: return 8;
		case 48: return 9;
		case 56: return 55;
		default: return p_gpu;
	}
}

static uint32_t srgb_format(uint32_t p_gpu) {
	switch (p_gpu) {
		case 1: return 2;
		case 28: return 29;
		case 7: return 46;
		case 8: return 47;
		case 9: return 48;
		case 55: return 56;
		default: return 0;
	}
}

// The four-channel storage format a shadow keeps a linear format's texels in (0: none, depth
// and stencil): exact, or eight bits for block formats, as Direct3D's reference decoders give.
static uint32_t shadow_format(uint32_t p_linear) {
	switch (p_linear) {
		case 1: case 3: case 4: case 7: case 8: case 9: case 28: case 49: case 51: case 55: return 1;
		case 10: case 16: case 25: case 50: case 52: return 25;
		case 15: case 24: case 33: case 39: case 53: case 54: return 39;
		case 21: case 30: case 32: case 36: case 42: case 57: case 58: case 59: case 60: case 61: case 62: return 42;
		case 11: case 17: case 26: return 26;
		case 12: case 18: case 27: return 27;
		case 13: case 22: case 31: case 37: return 37;
		case 14: case 23: case 38: return 38;
		case 19: case 34: case 40: return 40;
		case 20: case 35: case 41: return 41;
		default: return 0;
	}
}

// The WGSL that refills a shadow format's mip from the source's: each texel swizzled by
// override constants 0..3 (gpu@0's swizzle bytes: 0 r, 1 g, 2 b, 3 a, 4 zero, 5 one). An r32float
// shadow's source is depth, which samples as (d, 0, 0, 1).
static String shadow_wgsl(uint32_t p_format, uint32_t p_dimension) {
	const char *names[] = { "rgba8unorm", "rgba8snorm", "rgba16float", "rgba32float", "r32float", "rgba8uint", "rgba8sint", "rgba16uint", "rgba16sint", "rgba32uint", "rgba32sint" };
	const uint32_t formats[] = { 1, 25, 39, 42, 21, 26, 27, 37, 38, 40, 41 };
	uint32_t at = 0;
	while (formats[at] != p_format) at++;
	const String type = at >= 5 ? (at % 2 ? "u32" : "i32") : "f32";
	String source = "texture_2d_array", target = "texture_storage_2d_array", load = "textureLoad(source, id.xy, id.z, 0)",
			store = "textureStore(shadow, id.xy, id.z, c)", outside = "any(id.xy >= textureDimensions(shadow))";
	if (p_dimension == 1) {
		source = "texture_1d", target = "texture_storage_1d", load = "textureLoad(source, id.x, 0)";
		store = "textureStore(shadow, id.x, c)", outside = "id.x >= textureDimensions(shadow) || id.y > 0u";
	} else if (p_dimension == 6) {
		source = "texture_3d", target = "texture_storage_3d", load = "textureLoad(source, id, 0)";
		store = "textureStore(shadow, id, c)", outside = "any(id >= textureDimensions(shadow))";
	}
	if (p_format == 21) load = "vec4f(" + load + ", 0.0, 0.0, 1.0)";
	return "@group(0) @binding(0) var source: " + (p_format == 21 ? String("texture_depth_2d_array") : source + "<" + type + ">") + ";\n" +
			"@group(0) @binding(1) var shadow: " + target + "<" + names[at] + ", write>;\n" +
			"@id(0) override r: u32;\n@id(1) override g: u32;\n@id(2) override b: u32;\n@id(3) override a: u32;\n" +
			"fn pick(c: vec4<" + type + ">, s: u32) -> " + type + " {\n\tif (s < 4u) { return c[s]; }\n\treturn " + type + "(s - 4u);\n}\n" +
			"@compute @workgroup_size(8, 8, 1) fn main(@builtin(global_invocation_id) id: vec3u) {\n" +
			"\tif (" + outside + ") { return; }\n\tlet t = " + load + ";\n" +
			"\tlet c = vec4<" + type + ">(pick(t, r), pick(t, g), pick(t, b), pick(t, a));\n\t" + store + ";\n}\n";
}

// A view of p_original's texture: one CREATE_VIEW, and a shadow for a swizzle the browser lacks.
RDD::TextureID RenderingDeviceDriverWebGPU::make_view(const TextureInfo *p_original, const TextureView &p_view, uint32_t p_dimension,
		uint32_t p_layer, uint32_t p_layers, uint32_t p_mip, uint32_t p_mips, bool p_owns) {
	TextureInfo *view = memnew(TextureInfo(*p_original));
	view->owner = p_owns;
	view->original = p_owns ? nullptr : p_original->owner ? const_cast<TextureInfo *>(p_original) : p_original->original;
	view->shadowed.clear();
	view->shadow = nullptr;
	view->subresource_views.clear();
	view->depth_view = 0;
	const uint32_t format = p_view.format == DATA_FORMAT_MAX ? p_original->gpu_format : gpu_texture_format(p_view.format);
	view->format = p_view.format == DATA_FORMAT_MAX ? p_original->format : p_view.format;
	view->gpu_format = format;
	view->base_layer = p_original->base_layer + p_layer;
	view->base_mip = p_original->base_mip + p_mip;
	view->width = MAX(1u, p_original->width >> p_mip);
	view->height = MAX(1u, p_original->height >> p_mip);
	view->depth = MAX(1u, p_original->depth >> p_mip);
	view->mips = p_mips ? p_mips : p_original->mips - p_mip;
	view->layers = p_layers ? p_layers : p_original->layers - p_layer;
	uint32_t swizzle_bytes = swizzle(p_view);
	if (swizzle_bytes == default_swizzle(format)) swizzle_bytes = 0x03020100;
	const bool emulated = swizzle_bytes != 0x03020100 && !(features & F_SWIZZLE);
	Record r(DOLLY_GPU_CREATE_VIEW, 56);
	put64(r.p(), 16, p_original->texture);
	put32(r.p(), 24, format);
	put32(r.p(), 28, p_dimension);
	// A stencil8 view of a depth-stencil texture is its stencil aspect.
	put32(r.p(), 32, format == 43 && is_depth(p_original->gpu_format) ? 1 : 0);
	put32(r.p(), 36, view->base_mip);
	put32(r.p(), 40, p_mips);
	put32(r.p(), 44, view->base_layer);
	put32(r.p(), 48, p_layers);
	put32(r.p(), 52, emulated ? 0x03020100 : swizzle_bytes);
	view->view = CREATE(r);
	view->dimension = p_dimension;
	if (emulated) make_shadow(view, swizzle_bytes);
	return TextureID(view);
}

// A view's shadow (Shadow), refilled from its subresources once they were written
// (refill_shadows), as ANGLE's Direct3D 11 backend keeps swizzled copies of textures. A colour
// shadow reads the bytes of an sRGB view through its linear partner (texture_create adds it) and
// samples them as sRGB; a depth view's is r32float, which filters under float32-filterable.
void RenderingDeviceDriverWebGPU::make_shadow(TextureInfo *p_view, uint32_t p_swizzle) {
	const bool depth = is_depth(p_view->gpu_format);
	const uint32_t linear = linear_format(p_view->gpu_format), format = depth ? 21 : shadow_format(linear);
	ERR_FAIL_COND_MSG(!format || p_view->samples != TEXTURE_SAMPLES_1, "WebGPU cannot sample this view, nor a copy of it.");
	ERR_FAIL_COND_MSG(depth && !(features & F_FLOAT32_FILTERABLE), "Filtering depth needs float32-filterable, which the browser lacks.");
	const uint32_t p_dimension = p_view->dimension;
	const uint32_t dimension = p_dimension == 6 ? 6 : p_dimension == 1 ? 1 : 3; // the refill's: 3d, 1d or 2d-array
	const uint32_t layers = dimension == 6 ? p_view->depth : dimension == 1 ? 1 : p_view->layers;
	const uint32_t srgb = linear != p_view->gpu_format ? srgb_format(format) : 0;
	Shadow *shadow = memnew(Shadow);
	Record t(DOLLY_GPU_CREATE_TEXTURE, 48);
	put32(t.p(), 16, p_view->width);
	put32(t.p(), 20, dimension == 1 ? 1 : p_view->height);
	put32(t.p(), 24, layers);
	put32(t.p(), 28, p_view->mips);
	put32(t.p(), 32, format);
	put32(t.p(), 36, TEX_SAMPLED | TEX_STORAGE);
	put32(t.p(), 40, dimension == 6 ? 3 : dimension == 1 ? 1 : 2);
	put16(t.p(), 44, 1);
	put16(t.p(), 46, srgb);
	shadow->texture = CREATE(t);
	Record v(DOLLY_GPU_CREATE_VIEW, 56);
	put64(v.p(), 16, shadow->texture);
	put32(v.p(), 24, srgb ? srgb : format);
	put32(v.p(), 28, p_dimension);
	put32(v.p(), 52, 0x03020100);
	shadow->view = CREATE(v);

	const uint32_t sample = depth ? 3 : (format == 27 || format == 38 || format == 41) ? 4 : (format == 26 || format == 37 || format == 40) ? 5 : 2;
	LocalVector<GroupEntry> entries;
	entries.push_back({ 0, 4, 7, sample, dimension, 0 });
	entries.push_back({ 1, 4, 8, 1, dimension, format });
	const uint64_t group = group_layout(entries);
	LocalVector<uint64_t> groups;
	groups.push_back(group);
	const uint64_t layout = pipeline_layout(groups);
	const uint64_t key = uint64_t(format) << 40 | uint64_t(dimension) << 32 | p_swizzle;
	uint64_t pipeline = 0, module = 0;
	{
		MutexLock lock(mutex);
		if (const uint64_t *found = swizzle_pipelines.getptr(key)) pipeline = *found;
		if (const uint64_t *found = swizzle_shaders.getptr(format << 8 | dimension)) module = *found;
	}
	if (!module) {
		const CharString text = shadow_wgsl(format, dimension).utf8();
		Record s(DOLLY_GPU_CREATE_SHADER, 24 + text.length());
		put32(s.p(), 16, text.length());
		memcpy(s.p() + 24, text.get_data(), text.length());
		module = CREATE(s);
		MutexLock lock(mutex);
		swizzle_shaders[format << 8 | dimension] = module;
	}
	if (!pipeline) {
		Record c(DOLLY_GPU_CREATE_COMPUTE_PIPELINE, 40 + 16 * 4 + 4);
		put64(c.p(), 16, layout);
		put64(c.p(), 24, module);
		put32(c.p(), 32, 4);
		put32(c.p(), 36, 4);
		for (uint32_t i = 0; i < 4; i++) {
			const double value = (p_swizzle >> (8 * i)) & 255;
			put32(c.p(), 40 + 16 * i, i);
			memcpy(c.p() + 48 + 16 * i, &value, 8);
		}
		memcpy(c.p() + 104, "main", 4);
		pipeline = CREATE(c);
		MutexLock lock(mutex);
		swizzle_pipelines[key] = pipeline;
	}
	shadow->pipeline = pipeline;

	for (uint32_t m = 0; m < p_view->mips; m++) {
		Record source(DOLLY_GPU_CREATE_VIEW, 56);
		put64(source.p(), 16, p_view->texture);
		put32(source.p(), 24, linear);
		put32(source.p(), 28, dimension);
		put32(source.p(), 32, depth ? 2 : 0);
		put32(source.p(), 36, p_view->base_mip + m);
		put32(source.p(), 40, 1);
		put32(source.p(), 44, dimension == 3 ? p_view->base_layer : 0);
		put32(source.p(), 48, dimension == 3 ? p_view->layers : 1);
		put32(source.p(), 52, 0x03020100);
		Record target(DOLLY_GPU_CREATE_VIEW, 56);
		put64(target.p(), 16, shadow->texture);
		put32(target.p(), 28, dimension);
		put32(target.p(), 36, m);
		put32(target.p(), 40, 1);
		put32(target.p(), 52, 0x03020100);
		const uint64_t views[2] = { CREATE(source), CREATE(target) };
		Record g(DOLLY_GPU_CREATE_BIND_GROUP, 32 + 32 * 2);
		put64(g.p(), 16, group);
		put32(g.p(), 24, 2);
		for (uint32_t i = 0; i < 2; i++) {
			put32(g.p(), 32 + 32 * i, i);
			put32(g.p(), 36 + 32 * i, 2);
			put64(g.p(), 40 + 32 * i, views[i]);
		}
		shadow->views.push_back(views[0]);
		shadow->views.push_back(views[1]);
		shadow->groups.push_back(CREATE(g));
		const uint32_t width = MAX(1u, p_view->width >> m), height = dimension == 1 ? 1 : MAX(1u, p_view->height >> m);
		const uint32_t depth = dimension == 6 ? MAX(1u, p_view->depth >> m) : layers;
		shadow->dispatches.push_back(Vector3i((width + 7) / 8, (height + 7) / 8, depth));
	}
	p_view->shadow = shadow;
	TextureInfo *texture = p_view->owner ? p_view : p_view->original;
	MutexLock lock(mutex);
	texture->shadowed.push_back(p_view);
	if (!unfilled.has(texture)) unfilled.push_back(texture);
	shadows++;
}

// A write to p_texture: its views' shadows are refilled before anything samples them.
void RenderingDeviceDriverWebGPU::written(CommandBufferID p_cmd_buffer, const TextureInfo *p_texture) {
	if (!shadows.load() || p_texture->surface) return;
	TextureInfo *texture = p_texture->owner ? const_cast<TextureInfo *>(p_texture) : p_texture->original;
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	MutexLock lock(mutex);
	if (texture && !texture->shadowed.is_empty() && !cb->stale.has(texture)) cb->stale.push_back(texture);
}

// The shadows of the textures written since they were last refilled: as a pass begins, before
// a dispatch and as the command buffer ends, so whatever samples them next sees the writes.
void RenderingDeviceDriverWebGPU::refill_shadows(CommandBufferID p_cmd_buffer) {
	if (!shadows.load()) return;
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	{
		MutexLock lock(mutex);
		for (TextureInfo *texture : unfilled) {
			if (!cb->stale.has(texture)) cb->stale.push_back(texture);
		}
		unfilled.clear();
	}
	if (cb->stale.is_empty()) return;
	const bool inside = cb->in_compute_pass;
	if (!inside) command_record(p_cmd_buffer, DOLLY_GPU_BEGIN_COMPUTE_PASS, 8);
	{
		MutexLock lock(mutex);
		for (const TextureInfo *texture : cb->stale) {
			for (const TextureInfo *view : texture->shadowed) {
				const Shadow *shadow = view->shadow;
				put64(command_record(p_cmd_buffer, DOLLY_GPU_SET_PIPELINE, 16), 8, shadow->pipeline);
				for (uint32_t m = 0; m < shadow->groups.size(); m++) {
					uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_SET_BIND_GROUP, 24);
					put64(p, 8, shadow->groups[m]);
					p = command_record(p_cmd_buffer, DOLLY_GPU_DISPATCH, 24);
					put32(p, 8, shadow->dispatches[m].x);
					put32(p, 12, shadow->dispatches[m].y);
					put32(p, 16, shadow->dispatches[m].z);
				}
			}
		}
	}
	cb->stale.clear();
	if (inside) {
		cb->pipeline_dirty = true;
		for (bool &d : cb->bound.dirty) d = true;
	} else {
		command_record(p_cmd_buffer, DOLLY_GPU_END_COMPUTE_PASS, 8);
	}
}

RDD::TextureID RenderingDeviceDriverWebGPU::texture_create(const TextureFormat &p_format, const TextureView &p_view) {
	const uint32_t format = gpu_texture_format(p_format.format);
	ERR_FAIL_COND_V_MSG(!exists(format, features), TextureID(), vformat("The browser's WebGPU has no format %d.", p_format.format));
	ERR_FAIL_COND_V_MSG((p_format.texture_type == TEXTURE_TYPE_1D || p_format.texture_type == TEXTURE_TYPE_1D_ARRAY) && (p_format.array_layers != 1 || p_format.mipmaps != 1),
			TextureID(), "WebGPU's one-dimensional textures have no layers or mips.");
	uint32_t usage = 0;
	if (p_format.usage_bits & (TEXTURE_USAGE_SAMPLING_BIT | TEXTURE_USAGE_INPUT_ATTACHMENT_BIT)) usage |= TEX_SAMPLED;
	if (p_format.usage_bits & (TEXTURE_USAGE_COLOR_ATTACHMENT_BIT | TEXTURE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT)) usage |= TEX_RENDER;
	if (p_format.usage_bits & TEXTURE_USAGE_STORAGE_BIT) usage |= TEX_STORAGE;
	if (p_format.usage_bits & (TEXTURE_USAGE_CAN_UPDATE_BIT | TEXTURE_USAGE_CAN_COPY_TO_BIT)) usage |= TEX_COPY_DST;
	if (p_format.usage_bits & (TEXTURE_USAGE_CAN_COPY_FROM_BIT | TEXTURE_USAGE_CPU_READ_BIT)) usage |= TEX_COPY_SRC;
	// Clears are render passes in WebGPU (command_clear_color_texture).
	if ((p_format.usage_bits & TEXTURE_USAGE_CAN_COPY_TO_BIT) && is_renderable(format, features)) usage |= TEX_RENDER;
	TextureInfo *texture = memnew(TextureInfo);
	texture->format = p_format.format;
	texture->gpu_format = format;
	texture->type = p_format.texture_type;
	texture->width = p_format.width;
	texture->height = p_format.height;
	texture->depth = p_format.depth;
	texture->layers = p_format.array_layers;
	texture->mips = p_format.mipmaps;
	// WebGPU multisamples by 4 only; a count it lacks becomes the highest below it, as Direct3D
	// 12's driver does.
	texture->samples = p_format.samples >= TEXTURE_SAMPLES_4 ? TEXTURE_SAMPLES_4 : TEXTURE_SAMPLES_1;
	uint32_t dimension = 2, layers = p_format.array_layers;
	switch (p_format.texture_type) {
		case TEXTURE_TYPE_1D:
		case TEXTURE_TYPE_1D_ARRAY:
			dimension = 1;
			break;
		case TEXTURE_TYPE_3D:
			dimension = 3;
			layers = p_format.depth;
			break;
		case TEXTURE_TYPE_CUBE:
			layers = 6;
			break;
		case TEXTURE_TYPE_CUBE_ARRAY:
			layers = p_format.array_layers; // Godot counts the faces of every cube
			break;
		default:
			break;
	}
	// WebGPU views a texture only in its format and its sRGB or linear partner.
	const uint32_t partner = linear_format(format) != format ? linear_format(format) : srgb_format(format);
	uint32_t view_format = 0;
	for (const DataFormat shared : p_format.shareable_formats) {
		if (partner && gpu_texture_format(shared) == partner) view_format = partner;
	}
	// A shadow reads an sRGB texture's bytes through its linear partner (make_shadow).
	if (!(features & F_SWIZZLE) && partner == linear_format(format)) view_format = partner;
	Record r(DOLLY_GPU_CREATE_TEXTURE, 48);
	put32(r.p(), 16, p_format.width);
	put32(r.p(), 20, dimension == 1 ? 1 : p_format.height);
	put32(r.p(), 24, layers);
	put32(r.p(), 28, p_format.mipmaps);
	put32(r.p(), 32, format);
	put32(r.p(), 36, usage);
	put32(r.p(), 40, dimension);
	put16(r.p(), 44, texture->samples == TEXTURE_SAMPLES_4 ? 4 : 1);
	put16(r.p(), 46, view_format);
	texture->texture = CREATE(r);
	total_memory += get_image_format_required_size(p_format.format, p_format.width, p_format.height, p_format.depth, p_format.mipmaps) * p_format.array_layers;
	const TextureID view = make_view(texture, p_view, view_dimension(p_format.texture_type), 0, 0, 0, 0, true);
	memdelete(texture);
	return view;
}

RDD::TextureID RenderingDeviceDriverWebGPU::texture_create_from_extension(uint64_t p_native_texture, TextureType p_type, DataFormat p_format, uint32_t p_array_layers, bool p_depth_stencil, uint32_t p_mipmaps) {
	ERR_FAIL_V_MSG(TextureID(), "gpu@0 has no native textures.");
}

RDD::TextureID RenderingDeviceDriverWebGPU::texture_create_shared(TextureID p_original_texture, const TextureView &p_view) {
	const TextureInfo *original = (const TextureInfo *)p_original_texture.id;
	return make_view(original, p_view, view_dimension(original->type), 0, 0, 0, 0, false);
}

RDD::TextureID RenderingDeviceDriverWebGPU::texture_create_shared_from_slice(TextureID p_original_texture, const TextureView &p_view, TextureSliceType p_slice_type, uint32_t p_layer, uint32_t p_layers, uint32_t p_mipmap, uint32_t p_mipmaps) {
	const TextureInfo *original = (const TextureInfo *)p_original_texture.id;
	static const uint32_t dimensions[] = { 2, 4, 6, 3 };
	// The type first: a shadow (make_shadow) is made as the view is.
	TextureInfo slice = *original;
	slice.type = p_slice_type == TEXTURE_SLICE_CUBEMAP ? TEXTURE_TYPE_CUBE : p_slice_type == TEXTURE_SLICE_3D ? TEXTURE_TYPE_3D :
			p_slice_type == TEXTURE_SLICE_2D_ARRAY ? TEXTURE_TYPE_2D_ARRAY : TEXTURE_TYPE_2D;
	slice.original = original->owner ? const_cast<TextureInfo *>(original) : original->original;
	slice.owner = false;
	return make_view(&slice, p_view, dimensions[p_slice_type], p_layer,
			p_slice_type == TEXTURE_SLICE_CUBEMAP ? 6 : p_slice_type == TEXTURE_SLICE_2D_ARRAY ? p_layers : 1, p_mipmap, p_mipmaps, false);
}

void RenderingDeviceDriverWebGPU::texture_free(TextureID p_texture) {
	TextureInfo *texture = (TextureInfo *)p_texture.id;
	for (const KeyValue<uint32_t, uint64_t> &kv : texture->subresource_views) {
		release(kv.value);
	}
	release(texture->view);
	release(texture->depth_view);
	if (Shadow *shadow = texture->shadow) {
		for (const uint64_t group : shadow->groups) release(group);
		for (const uint64_t view : shadow->views) release(view);
		release(shadow->view);
		release(shadow->texture);
		memdelete(shadow);
		TextureInfo *owner = texture->owner ? texture : texture->original;
		MutexLock lock(mutex);
		owner->shadowed.erase(texture);
		if (owner->shadowed.is_empty()) unfilled.erase(owner);
		shadows--;
	}
	if (texture->owner) {
		release(texture->texture);
	}
	memdelete(texture);
}

uint64_t RenderingDeviceDriverWebGPU::texture_get_allocation_size(TextureID p_texture) {
	const TextureInfo *texture = (const TextureInfo *)p_texture.id;
	return get_image_format_required_size(texture->format, texture->width, texture->height, texture->depth, texture->mips) * texture->layers;
}

void RenderingDeviceDriverWebGPU::texture_get_copyable_layout(TextureID p_texture, const TextureSubresource &p_subresource, TextureCopyableLayout *r_layout) {
	const TextureInfo *texture = (const TextureInfo *)p_texture.id;
	uint32_t block_w = 1, block_h = 1;
	get_compressed_image_format_block_dimensions(texture->format, block_w, block_h);
	const uint32_t width = MAX(1u, texture->width >> p_subresource.mipmap), height = MAX(1u, texture->height >> p_subresource.mipmap);
	const uint32_t depth = texture->type == TEXTURE_TYPE_3D ? MAX(1u, texture->depth >> p_subresource.mipmap) : 1;
	const uint32_t row = get_image_format_required_size(texture->format, width, block_h, 1, 1);
	r_layout->row_pitch = STEPIFY(row, 256u);
	r_layout->size = r_layout->row_pitch * ((height + block_h - 1) / block_h) * depth;
}

Vector<uint8_t> RenderingDeviceDriverWebGPU::texture_get_data(TextureID p_texture, uint32_t p_layer) {
	const TextureInfo *texture = (const TextureInfo *)p_texture.id;
	Vector<uint8_t> data;
	uint32_t block_w = 1, block_h = 1;
	get_compressed_image_format_block_dimensions(texture->format, block_w, block_h);
	const uint32_t total = get_image_format_required_size(texture->format, texture->width, texture->height, texture->depth, texture->mips);
	data.resize(total);
	uint8_t *out = data.ptrw();
	for (uint32_t mip = 0; mip < texture->mips; mip++) {
		TextureCopyableLayout layout;
		texture_get_copyable_layout(p_texture, { TEXTURE_ASPECT_COLOR, p_layer, mip }, &layout);
		const uint32_t width = MAX(1u, texture->width >> mip), height = MAX(1u, texture->height >> mip);
		const uint32_t depth = texture->type == TEXTURE_TYPE_3D ? MAX(1u, texture->depth >> mip) : 1;
		BufferInfo staging;
		{
			Record r(DOLLY_GPU_CREATE_BUFFER, 32);
			put64(r.p(), 16, layout.size);
			put32(r.p(), 24, GPU_MAP_READ | GPU_COPY_DST);
			staging.handle = CREATE(r);
		}
		{
			MutexLock lock(mutex);
			flush_pending();
			bool sent = false;
			uint8_t *p = packet_record(DOLLY_GPU_COPY_TEXTURE_TO_BUFFER, 72, sent);
			put64(p, 8, staging.handle);
			put32(p, 24, layout.row_pitch);
			put32(p, 28, (height + block_h - 1) / block_h);
			put64(p, 32, texture->texture);
			put32(p, 40, texture->base_mip + mip);
			put32(p, 56, texture->type == TEXTURE_TYPE_3D ? 0 : texture->base_layer + p_layer);
			put32(p, 60, STEPIFY(width, block_w));
			put32(p, 64, STEPIFY(height, block_h));
			put32(p, 68, depth);
			packet_record(DOLLY_GPU_SUBMIT, 8, sent);
			send(false);
		}
		LocalVector<uint8_t> rows;
		rows.resize(layout.size);
		read_buffer(&staging, 0, layout.size, rows.ptr());
		release(staging.handle);
		const uint32_t row = get_image_format_required_size(texture->format, width, block_h, 1, 1);
		const uint32_t row_count = (height + block_h - 1) / block_h * depth;
		for (uint32_t y = 0; y < row_count; y++) {
			memcpy(out + y * row, rows.ptr() + y * layout.row_pitch, row);
		}
		out += row * row_count;
	}
	return data;
}

BitField<RDD::TextureUsageBits> RenderingDeviceDriverWebGPU::texture_get_usages_supported_by_format(DataFormat p_format, bool p_cpu_readable) {
	const uint32_t format = gpu_texture_format(p_format);
	if (!exists(format, features)) {
		return 0;
	}
	BitField<TextureUsageBits> usage = TEXTURE_USAGE_SAMPLING_BIT | TEXTURE_USAGE_CAN_UPDATE_BIT | TEXTURE_USAGE_CAN_COPY_FROM_BIT |
			TEXTURE_USAGE_CAN_COPY_TO_BIT | TEXTURE_USAGE_CPU_READ_BIT;
	if (is_depth(format) || is_stencil(format)) {
		usage.set_flag(TEXTURE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT);
	} else if (is_renderable(format, features)) {
		usage.set_flag(TEXTURE_USAGE_COLOR_ATTACHMENT_BIT);
		usage.set_flag(TEXTURE_USAGE_INPUT_ATTACHMENT_BIT);
	}
	if (is_storage(format, features)) {
		usage.set_flag(TEXTURE_USAGE_STORAGE_BIT);
	}
	return usage;
}

// WebGPU reinterprets a texture only as its sRGB or linear partner.
bool RenderingDeviceDriverWebGPU::texture_can_make_shared_with_format(TextureID p_texture, DataFormat p_format, bool &r_raw_reinterpretation) {
	r_raw_reinterpretation = false;
	const TextureInfo *texture = (const TextureInfo *)p_texture.id;
	const uint32_t a = texture->gpu_format, b = gpu_texture_format(p_format);
	return b && (a == b || a + 1 == b || b + 1 == a || (a == 28 && b == 29) || (a == 29 && b == 28));
}

/*****************/
/**** SAMPLER ****/
/*****************/

RDD::SamplerID RenderingDeviceDriverWebGPU::sampler_create(const SamplerState &p_state) {
	// WebGPU has no border colour (clamp to edge stands for clamp to border), no mirror-once and
	// no LOD bias; Godot sets a bias only with TAA and FSR.
	static const uint32_t address[] = { 1, 2, 0, 0, 2 };
	Record r(DOLLY_GPU_CREATE_SAMPLER, 56);
	put32(r.p(), 16, p_state.min_filter == SAMPLER_FILTER_LINEAR);
	put32(r.p(), 20, p_state.mag_filter == SAMPLER_FILTER_LINEAR);
	put32(r.p(), 24, p_state.mip_filter == SAMPLER_FILTER_LINEAR);
	put32(r.p(), 28, address[p_state.repeat_u]);
	put32(r.p(), 32, address[p_state.repeat_v]);
	put32(r.p(), 36, address[p_state.repeat_w]);
	put32(r.p(), 40, p_state.enable_compare ? gpu_compare(p_state.compare_op) : 0);
	const bool linear = p_state.min_filter == SAMPLER_FILTER_LINEAR && p_state.mag_filter == SAMPLER_FILTER_LINEAR && p_state.mip_filter == SAMPLER_FILTER_LINEAR;
	put32(r.p(), 44, p_state.use_anisotropy && linear ? CLAMP(uint32_t(p_state.anisotropy_max), 1u, 16u) : 1);
	putf(r.p(), 48, MAX(0.0f, p_state.min_lod));
	putf(r.p(), 52, CLAMP(p_state.max_lod, MAX(0.0f, p_state.min_lod), 32.0f));
	return SamplerID(CREATE(r));
}

void RenderingDeviceDriverWebGPU::sampler_free(SamplerID p_sampler) {
	release(p_sampler.id);
}

bool RenderingDeviceDriverWebGPU::sampler_is_format_supported_for_filter(DataFormat p_format, SamplerFilter p_filter) {
	const uint32_t format = gpu_texture_format(p_format);
	return format && (p_filter == SAMPLER_FILTER_NEAREST || (!is_integer(format) && !is_depth(format)));
}

/**********************/
/**** VERTEX ARRAY ****/
/**********************/

RDD::VertexFormatID RenderingDeviceDriverWebGPU::vertex_format_create(Span<VertexAttribute> p_vertex_attribs, const VertexAttributeBindingsMap &p_vertex_bindings) {
	VertexFormatInfo *format = memnew(VertexFormatInfo);
	for (uint32_t i = 0; i < p_vertex_attribs.size(); i++) {
		VertexAttribute attribute = p_vertex_attribs[i];
		if (attribute.binding == UINT32_MAX) {
			attribute.binding = i;
		}
		format->attributes.push_back(attribute);
		if (format->bindings.size() <= attribute.binding) {
			format->bindings.resize(attribute.binding + 1);
		}
		const VertexAttributeBinding *binding = p_vertex_bindings.getptr(attribute.binding);
		format->bindings[attribute.binding] = binding ? *binding : VertexAttributeBinding(attribute.stride, attribute.frequency);
	}
	return VertexFormatID(format);
}

void RenderingDeviceDriverWebGPU::vertex_format_free(VertexFormatID p_vertex_format) {
	memdelete((VertexFormatInfo *)p_vertex_format.id);
}

/****************/
/**** SHADER ****/
/****************/

struct GroupEntryOrder {
	bool operator()(const RenderingDeviceDriverWebGPU::GroupEntry &p_a, const RenderingDeviceDriverWebGPU::GroupEntry &p_b) const { return p_a.binding < p_b.binding; }
};
struct BoundUniformOrder {
	bool operator()(const RDD::BoundUniform &p_a, const RDD::BoundUniform &p_b) const { return p_a.binding < p_b.binding; }
};

uint64_t RenderingDeviceDriverWebGPU::group_layout(const LocalVector<GroupEntry> &p_entries) {
	String key;
	for (const GroupEntry &e : p_entries) {
		key += vformat("%d,%d,%d,%d,%d,%d;", e.binding, e.visibility, e.type, e.a, e.b, e.c);
	}
	{
		MutexLock lock(mutex);
		if (const uint64_t *found = group_layouts.getptr(key)) return *found;
	}
	Record r(DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, 24 + 32 * p_entries.size());
	put32(r.p(), 16, p_entries.size());
	for (uint32_t i = 0; i < p_entries.size(); i++) {
		const GroupEntry &e = p_entries[i];
		uint8_t *p = r.p() + 24 + i * 32;
		put32(p, 0, e.binding);
		put32(p, 4, e.visibility);
		put32(p, 8, e.type);
		put32(p, 12, e.a);
		put32(p, 16, e.b);
		put32(p, 20, e.c);
	}
	const uint64_t handle = CREATE(r);
	MutexLock lock(mutex);
	group_layouts[key] = handle;
	return handle;
}

uint64_t RenderingDeviceDriverWebGPU::pipeline_layout(const LocalVector<uint64_t> &p_groups) {
	String key;
	for (const uint64_t g : p_groups) {
		key += itos(g) + ",";
	}
	{
		MutexLock lock(mutex);
		if (const uint64_t *found = pipeline_layouts.getptr(key)) return *found;
	}
	Record r(DOLLY_GPU_CREATE_PIPELINE_LAYOUT, 24 + 8 * p_groups.size());
	put32(r.p(), 16, p_groups.size());
	for (uint32_t i = 0; i < p_groups.size(); i++) {
		put64(r.p(), 24 + i * 8, p_groups[i]);
	}
	const uint64_t handle = CREATE(r);
	MutexLock lock(mutex);
	pipeline_layouts[key] = handle;
	return handle;
}

static bool dynamic_type(RDD::UniformType p_type) {
	return p_type == RDD::UNIFORM_TYPE_UNIFORM_BUFFER_DYNAMIC || p_type == RDD::UNIFORM_TYPE_STORAGE_BUFFER_DYNAMIC;
}

// The Godot uniform whose bindings hold WGSL binding p_binding of set p_set, and the element.
static const RenderingDeviceDriverWebGPU::SetUniform *uniform_at(const RenderingDeviceDriverWebGPU::ShaderInfo *p_shader, uint32_t p_set, uint32_t p_binding, uint32_t &r_element) {
	if (p_set >= p_shader->sets.size()) return nullptr;
	for (const RenderingDeviceDriverWebGPU::SetUniform &u : p_shader->sets[p_set]) {
		const uint32_t width = u.length * (u.type == RDD::UNIFORM_TYPE_SAMPLER_WITH_TEXTURE ? 2 : 1);
		if (p_binding >= u.first && p_binding < u.first + width) {
			r_element = p_binding - u.first;
			return &u;
		}
	}
	return nullptr;
}

RDD::ShaderID RenderingDeviceDriverWebGPU::shader_create_from_container(const Ref<RenderingShaderContainer> &p_shader_container, const Vector<ImmutableSampler> &p_immutable_samplers) {
	const RenderingShaderContainerWebGPU *container = static_cast<const RenderingShaderContainerWebGPU *>(p_shader_container.ptr());
	const ShaderReflection reflection = container->get_shader_reflection();
	ShaderInfo *shader = memnew(ShaderInfo);
	shader->compute = reflection.pipeline_type == PIPELINE_TYPE_COMPUTE;
	uint32_t index = 0;
	for (int set = 0; set < reflection.uniform_sets.size(); set++) {
		shader->sets.push_back(LocalVector<SetUniform>());
		for (const RenderingDeviceCommons::ShaderUniform &u : reflection.uniform_sets[set]) {
			SetUniform uniform;
			uniform.type = u.type;
			uniform.binding = u.binding;
			uniform.length = (u.type == UNIFORM_TYPE_UNIFORM_BUFFER || u.type == UNIFORM_TYPE_STORAGE_BUFFER || dynamic_type(u.type)) ? 1 : MAX(1u, u.length);
			uniform.first = container->first_binding[index++];
			shader->sets[set].push_back(uniform);
		}
	}
	// One module per stage, and every group's entries, from what its WGSL uses.
	LocalVector<HashMap<uint32_t, GroupEntry>> groups;
	groups.resize(MAX(1, reflection.uniform_sets.size()));
	for (int i = 0; i < container->shaders.size(); i++) {
		const RenderingShaderContainer::Shader &code = container->shaders[i];
		Vector<uint8_t> text;
		text.resize(code.code_decompressed_size ? code.code_decompressed_size : code.code_compressed_bytes.size());
		ERR_FAIL_COND_V(!const_cast<RenderingShaderContainerWebGPU *>(container)->decompress_code(code.code_compressed_bytes.ptr(), code.code_compressed_bytes.size(),
								code.code_compression_flags, text.ptrw(), text.size()),
				ShaderID());
		Record r(DOLLY_GPU_CREATE_SHADER, 24 + text.size());
		put32(r.p(), 16, text.size());
		memcpy(r.p() + 24, text.ptr(), text.size());
		const uint32_t slot = code.shader_stage == SHADER_STAGE_FRAGMENT ? 1 : 0;
		shader->modules[slot] = CREATE(r);
		shader->overrides[slot] = container->stages[i].overrides;
		const uint32_t visibility = code.shader_stage == SHADER_STAGE_VERTEX ? 1 : code.shader_stage == SHADER_STAGE_FRAGMENT ? 2 : 4;
		for (const RenderingShaderContainerWebGPU::LayoutEntry &e : container->stages[i].entries) {
			if (groups.size() <= e.group) groups.resize(e.group + 1);
			GroupEntry *entry = groups[e.group].getptr(e.binding);
			if (entry) {
				entry->visibility |= visibility;
				// A texture one stage samples and another only loads is sampled.
				if (entry->type == 7 && entry->a == 2 && e.a == 1) entry->a = 1;
				continue;
			}
			GroupEntry made = { e.binding, visibility, e.type, e.a, e.b, e.c };
			uint32_t element;
			const SetUniform *u = uniform_at(shader, e.group, e.binding, element);
			if (e.type <= 3 && ((e.group == 0 && e.binding == 0) || (u && dynamic_type(u->type)))) {
				made.a = 1; // a dynamic offset: the push constants' ring, a persistent buffer's copies
			}
			groups[e.group][e.binding] = made;
		}
	}
	for (uint32_t g = 0; g < groups.size(); g++) {
		LocalVector<GroupEntry> entries;
		for (const KeyValue<uint32_t, GroupEntry> &kv : groups[g]) {
			entries.push_back(kv.value);
		}
		entries.sort_custom<GroupEntryOrder>();
		shader->layouts.resize(g + 1);
		shader->layouts[g] = entries;
		shader->group_layouts.push_back(group_layout(entries));
	}
	shader->pipeline_layout = pipeline_layout(shader->group_layouts);
	for (const ImmutableSampler &sampler : p_immutable_samplers) {
		if (sampler.ids.size()) shader->immutable_samplers[sampler.binding] = sampler.ids[0];
	}
	return ShaderID(shader);
}

void RenderingDeviceDriverWebGPU::shader_free(ShaderID p_shader) {
	ShaderInfo *shader = (ShaderInfo *)p_shader.id;
	release(shader->modules[0]);
	release(shader->modules[1]);
	memdelete(shader);
}

/*********************/
/**** UNIFORM SET ****/
/*********************/

RDD::UniformSetID RenderingDeviceDriverWebGPU::uniform_set_create(VectorView<BoundUniform> p_uniforms, ShaderID p_shader, uint32_t p_set_index, int p_linear_pool_index) {
	UniformSetInfo *set = memnew(UniformSetInfo);
	set->set = p_set_index;
	set->shader = (ShaderInfo *)p_shader.id;
	for (uint32_t i = 0; i < p_uniforms.size(); i++) {
		set->uniforms.push_back(p_uniforms[i]);
	}
	set->uniforms.sort_custom<BoundUniformOrder>();
	for (const BoundUniform &u : set->uniforms) {
		if (u.is_dynamic()) {
			for (const ID &id : u.ids) set->dynamic.push_back((BufferInfo *)id.id);
		}
	}
	// A depth texture the set's shader samples through a filtering sampler gets its shadow now,
	// before the commands that use the set are recorded (Godot records them after).
	for (const BoundUniform &u : set->uniforms) {
		if (p_set_index >= set->shader->sets.size()) break;
		if (u.type != UNIFORM_TYPE_TEXTURE && u.type != UNIFORM_TYPE_SAMPLER_WITH_TEXTURE) continue;
		for (const SetUniform &s : set->shader->sets[p_set_index]) {
			if (s.binding != u.binding) continue;
			for (uint32_t element = 0; element < s.length; element++) {
				const uint32_t at = u.type == UNIFORM_TYPE_SAMPLER_WITH_TEXTURE ? element * 2 + 1 : element;
				if (at >= u.ids.size()) break;
				TextureInfo *texture = (TextureInfo *)u.ids[at].id;
				if (!texture || texture->shadow || !is_depth(texture->gpu_format)) continue;
				for (const GroupEntry &e : set->shader->layouts[p_set_index]) {
					if (e.binding == s.first + element && e.type == 7 && e.a == 1) make_shadow(texture, 0x03020100);
				}
			}
		}
	}
	return UniformSetID(set);
}

void RenderingDeviceDriverWebGPU::uniform_set_free(UniformSetID p_uniform_set) {
	UniformSetInfo *set = (UniformSetInfo *)p_uniform_set.id;
	for (const KeyValue<uint64_t, Group> &kv : set->groups) {
		release(kv.value.handle);
	}
	memdelete(set);
}

// The persistent copies the sets' dynamic buffers write this frame, 4 bits each, as Vulkan's
// driver packs them.
uint32_t RenderingDeviceDriverWebGPU::uniform_sets_get_dynamic_offsets(VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count) const {
	uint32_t mask = 0, shift = 0;
	for (uint32_t i = 0; i < p_set_count; i++) {
		const UniformSetInfo *set = (const UniformSetInfo *)p_uniform_sets[i].id;
		for (const BufferInfo *buffer : set->dynamic) {
			mask |= buffer->frame << shift;
			shift += 4;
		}
	}
	return mask;
}

// The bind group of p_set (or of no set) for the shader's group p_index, made on first use.
const RenderingDeviceDriverWebGPU::Group &RenderingDeviceDriverWebGPU::group_for(UniformSetInfo *p_set, ShaderInfo *p_shader, uint32_t p_index) {
	const uint64_t layout = p_shader->group_layouts[p_index];
	{
		MutexLock lock(mutex);
		const Group *found = p_set ? p_set->groups.getptr(layout) : setless_groups.getptr(layout);
		if (found) return *found;
	}
	static const Group none;
	const LocalVector<GroupEntry> &entries = p_shader->layouts[p_index];
	Group group;
	Record r(DOLLY_GPU_CREATE_BIND_GROUP, 32 + 32 * entries.size());
	put64(r.p(), 16, layout);
	put32(r.p(), 24, entries.size());
	for (uint32_t i = 0; i < entries.size(); i++) {
		const GroupEntry &e = entries[i];
		uint8_t *p = r.p() + 32 + i * 32;
		put32(p, 0, e.binding);
		if (p_index == 0 && e.binding == 0) {
			put32(p, 4, 0);
			put64(p, 8, push_ring.handle);
			put64(p, 24, PUSH_CONSTANT_BYTES);
			group.dynamic.push_back(-1);
			continue;
		}
		uint32_t element = 0;
		const SetUniform *u = p_set ? uniform_at(p_set->shader, p_index, e.binding, element) : nullptr;
		ERR_FAIL_NULL_V_MSG(u, none, vformat("Group %d binding %d has no uniform of Godot's.", p_index, e.binding));
		const BoundUniform *bound = nullptr;
		for (const BoundUniform &b : p_set->uniforms) {
			if (b.binding == u->binding) bound = &b;
		}
		if (u->type == UNIFORM_TYPE_SAMPLER) {
			const ID *immutable = p_shader->immutable_samplers.getptr(u->binding);
			put32(p, 4, 1);
			put64(p, 8, bound && element < bound->ids.size() ? bound->ids[element].id : immutable ? immutable->id : 0);
		} else if (u->type == UNIFORM_TYPE_SAMPLER_WITH_TEXTURE) {
			// Godot's ids pair each element's sampler then texture.
			ERR_FAIL_NULL_V(bound, none);
			if (element < u->length) {
				put32(p, 4, 2);
				put64(p, 8, sampled_view((TextureInfo *)bound->ids[element * 2 + 1].id, e));
			} else {
				put32(p, 4, 1);
				put64(p, 8, bound->ids[(element - u->length) * 2].id);
			}
		} else if (u->type == UNIFORM_TYPE_TEXTURE || u->type == UNIFORM_TYPE_IMAGE || u->type == UNIFORM_TYPE_INPUT_ATTACHMENT) {
			ERR_FAIL_NULL_V(bound, none);
			put32(p, 4, 2);
			TextureInfo *texture = (TextureInfo *)bound->ids[element].id;
			put64(p, 8, u->type == UNIFORM_TYPE_IMAGE ? texture->view : sampled_view(texture, e));
		} else {
			ERR_FAIL_COND_V_MSG(!bound || bound->ids.is_empty(), none, "A buffer uniform without a buffer.");
			const BufferInfo *buffer = (const BufferInfo *)bound->ids[0].id;
			put32(p, 4, 0);
			put64(p, 8, buffer->handle);
			put64(p, 24, (buffer->size + 3) & ~3ull);
			if (dynamic_type(u->type)) {
				int32_t at = 0;
				for (const BufferInfo *d : p_set->dynamic) {
					if (d == buffer) break;
					at++;
				}
				group.dynamic.push_back(at);
			}
		}
	}
	group.handle = CREATE(r);
	MutexLock lock(mutex);
	return p_set ? (p_set->groups[layout] = group) : (setless_groups[layout] = group);
}

/******************/
/**** PIPELINE ****/
/******************/

// Override constants by numeric id, each sent to the stages whose module declares it.
static void put_constants(uint8_t *p, const RenderingDeviceDriverWebGPU::ShaderInfo *p_shader, VectorView<RDD::PipelineSpecializationConstant> p_constants, bool p_render) {
	uint32_t at = 0;
	for (uint32_t i = 0; i < p_constants.size(); i++) {
		const RDD::PipelineSpecializationConstant &c = p_constants[i];
		uint32_t stages = 0;
		for (uint32_t s = 0; s < 2; s++) {
			if (p_shader->overrides[s].has(c.constant_id)) stages |= 1u << s;
		}
		if (!stages) continue;
		double value = c.type == RDD::PIPELINE_SPECIALIZATION_CONSTANT_TYPE_FLOAT ? double(c.float_value) :
				c.type == RDD::PIPELINE_SPECIALIZATION_CONSTANT_TYPE_BOOL ? double(c.bool_value ? 1 : 0) : double(int32_t(c.int_value));
		put32(p, at, c.constant_id);
		put32(p, at + 4, p_render ? stages : 0);
		memcpy(p + at + 8, &value, 8);
		at += 16;
	}
}

static uint32_t constants_declared(const RenderingDeviceDriverWebGPU::ShaderInfo *p_shader, VectorView<RDD::PipelineSpecializationConstant> p_constants) {
	uint32_t count = 0;
	for (uint32_t i = 0; i < p_constants.size(); i++) {
		if (p_shader->overrides[0].has(p_constants[i].constant_id) || p_shader->overrides[1].has(p_constants[i].constant_id)) count++;
	}
	return count;
}

RDD::PipelineID RenderingDeviceDriverWebGPU::render_pipeline_create(ShaderID p_shader, VertexFormatID p_vertex_format, RenderPrimitive p_render_primitive,
		PipelineRasterizationState p_rasterization_state, PipelineMultisampleState p_multisample_state, PipelineDepthStencilState p_depth_stencil_state,
		PipelineColorBlendState p_blend_state, VectorView<int32_t> p_color_attachments, BitField<PipelineDynamicStateFlags> p_dynamic_state,
		RenderPassID p_render_pass, uint32_t p_render_subpass, VectorView<PipelineSpecializationConstant> p_specialization_constants) {
	ShaderInfo *shader = (ShaderInfo *)p_shader.id;
	const RenderPassInfo *pass = (const RenderPassInfo *)p_render_pass.id;
	const Subpass &subpass = pass->subpasses[p_render_subpass];
	ERR_FAIL_COND_V_MSG(p_rasterization_state.wireframe, PipelineID(), "WebGPU draws no wireframes.");
	ERR_FAIL_COND_V_MSG(p_rasterization_state.discard_primitives || p_blend_state.enable_logic_op || p_multisample_state.enable_alpha_to_one ||
					p_depth_stencil_state.enable_depth_range,
			PipelineID(), "WebGPU has no rasterizer discard, logic operations, alpha to one or depth bounds.");
	static const uint32_t topologies[] = { 4, 2, 2, 3, 3, 0, 0, 1, 1, 1, 0 };
	ERR_FAIL_COND_V_MSG(p_render_primitive == RENDER_PRIMITIVE_TESSELATION_PATCH, PipelineID(), "WebGPU has no tessellation.");
	const VertexFormatInfo *vertex = p_vertex_format ? (const VertexFormatInfo *)p_vertex_format.id : nullptr;
	const uint32_t targets = subpass.color_references.size();
	const uint32_t buffers = vertex ? vertex->bindings.size() : 0, attributes = vertex ? vertex->attributes.size() : 0;
	const uint32_t constants = constants_declared(shader, p_specialization_constants);
	static const char entry[] = "main";
	const uint32_t names = 4 + (shader->modules[1] ? 4 : 0);
	Record r(DOLLY_GPU_CREATE_RENDER_PIPELINE, 160 + 40 * targets + 16 * (buffers + attributes + constants) + names);
	uint8_t *p = r.p();
	put64(p, 16, shader->pipeline_layout);
	put64(p, 24, shader->modules[0]);
	put64(p, 32, shader->modules[1]);
	const uint32_t topology = topologies[p_render_primitive];
	put32(p, 40, topology);
	put32(p, 48, p_rasterization_state.front_face == POLYGON_FRONT_FACE_CLOCKWISE ? 1 : 0);
	put32(p, 52, p_rasterization_state.cull_mode);
	put32(p, 56, p_rasterization_state.enable_depth_clamp && (features & F_DEPTH_CLIP_CONTROL) ? 1 : 0);
	const uint32_t depth_attachment = subpass.depth_stencil_reference.attachment;
	if (depth_attachment != AttachmentReference::UNUSED) {
		const uint32_t format = gpu_texture_format(pass->attachments[depth_attachment].format);
		put32(p, 60, format);
		// Vulkan writes depth only where it tests it; WebGPU writes it under "always" too.
		put32(p, 64, p_depth_stencil_state.enable_depth_test && p_depth_stencil_state.enable_depth_write);
		put32(p, 68, p_depth_stencil_state.enable_depth_test ? gpu_compare(p_depth_stencil_state.depth_compare_operator) : 8);
		for (uint32_t face = 0; face < 2; face++) {
			const PipelineDepthStencilState::StencilOperationState &op = face ? p_depth_stencil_state.back_op : p_depth_stencil_state.front_op;
			const bool on = p_depth_stencil_state.enable_stencil && is_stencil(format);
			put32(p, 72 + face * 16, on ? gpu_compare(op.compare) : 8);
			put32(p, 76 + face * 16, on ? gpu_stencil_op(op.fail) : 0);
			put32(p, 80 + face * 16, on ? gpu_stencil_op(op.depth_fail) : 0);
			put32(p, 84 + face * 16, on ? gpu_stencil_op(op.pass) : 0);
		}
		put32(p, 104, p_depth_stencil_state.enable_stencil ? p_depth_stencil_state.front_op.compare_mask : 0xff);
		put32(p, 108, p_depth_stencil_state.enable_stencil ? p_depth_stencil_state.front_op.write_mask : 0);
		if (p_rasterization_state.depth_bias_enabled) {
			// Godot's constant factor is Vulkan's, in units of the format's least step, as WebGPU's.
			put32(p, 112, uint32_t(int32_t(p_rasterization_state.depth_bias_constant_factor)));
			putf(p, 116, p_rasterization_state.depth_bias_slope_factor);
			putf(p, 120, p_rasterization_state.depth_bias_clamp);
		}
	}
	put32(p, 124, p_multisample_state.sample_count >= TEXTURE_SAMPLES_4 ? 4 : 1);
	put32(p, 128, p_multisample_state.sample_mask.is_empty() ? 0xffffffff : p_multisample_state.sample_mask[0]);
	put32(p, 132, p_multisample_state.enable_alpha_to_coverage);
	put32(p, 136, shader->modules[1] ? targets : 0);
	put32(p, 140, buffers);
	put32(p, 144, attributes);
	put32(p, 148, constants);
	put32(p, 152, 4);
	put32(p, 156, shader->modules[1] ? 4 : 0);
	uint32_t at = 160;
	for (uint32_t i = 0; shader->modules[1] && i < targets; i++, at += 40) {
		const uint32_t attachment = subpass.color_references[i].attachment;
		if (attachment == AttachmentReference::UNUSED) {
			put32(p, at + 36, 1); // no target, as the pass has no attachment there
			continue;
		}
		put32(p, at, gpu_texture_format(pass->attachments[attachment].format));
		const int32_t blend_index = i < p_color_attachments.size() ? p_color_attachments[i] : int32_t(i);
		if (blend_index < 0 || blend_index >= p_blend_state.attachments.size()) continue;
		const PipelineColorBlendState::Attachment &blend = p_blend_state.attachments[blend_index];
		put32(p, at + 4, (blend.write_r ? 1 : 0) | (blend.write_g ? 2 : 0) | (blend.write_b ? 4 : 0) | (blend.write_a ? 8 : 0));
		if (blend.enable_blend) {
			uint32_t factors[4];
			ERR_FAIL_COND_V_MSG(!gpu_blend_factor(blend.src_color_blend_factor, factors[0]) || !gpu_blend_factor(blend.dst_color_blend_factor, factors[1]) ||
							!gpu_blend_factor(blend.src_alpha_blend_factor, factors[2]) || !gpu_blend_factor(blend.dst_alpha_blend_factor, factors[3]),
					PipelineID(), "WebGPU has no constant-alpha or dual-source blend factors.");
			put32(p, at + 8, 1);
			put32(p, at + 12, blend.color_blend_op);
			put32(p, at + 16, factors[0]);
			put32(p, at + 20, factors[1]);
			put32(p, at + 24, blend.alpha_blend_op);
			put32(p, at + 28, factors[2]);
			put32(p, at + 32, factors[3]);
		}
	}
	for (uint32_t i = 0; i < buffers; i++, at += 16) {
		put32(p, at, vertex->bindings[i].stride);
		put32(p, at + 4, vertex->bindings[i].frequency == VERTEX_FREQUENCY_INSTANCE);
	}
	for (uint32_t i = 0; i < attributes; i++, at += 16) {
		const VertexAttribute &a = vertex->attributes[i];
		const uint32_t format = gpu_vertex_format(a.format);
		ERR_FAIL_COND_V_MSG(!format, PipelineID(), vformat("WebGPU has no vertex format %d.", a.format));
		put32(p, at, a.binding);
		put32(p, at + 4, a.location);
		put32(p, at + 8, format);
		put32(p, at + 12, a.offset);
	}
	put_constants(p + at, shader, p_specialization_constants, true);
	at += 16 * constants;
	memcpy(p + at, entry, 4);
	if (shader->modules[1]) memcpy(p + at + 4, entry, 4);
	PipelineInfo *pipeline = memnew(PipelineInfo);
	pipeline->shader = shader;
	pipeline->stencil_reference = p_depth_stencil_state.front_op.reference;
	pipeline->handle = CREATE(r);
	return PipelineID(pipeline);
}

RDD::PipelineID RenderingDeviceDriverWebGPU::compute_pipeline_create(ShaderID p_shader, VectorView<PipelineSpecializationConstant> p_specialization_constants) {
	ShaderInfo *shader = (ShaderInfo *)p_shader.id;
	const uint32_t constants = constants_declared(shader, p_specialization_constants);
	Record r(DOLLY_GPU_CREATE_COMPUTE_PIPELINE, 40 + 16 * constants + 4);
	put64(r.p(), 16, shader->pipeline_layout);
	put64(r.p(), 24, shader->modules[0]);
	put32(r.p(), 32, constants);
	put32(r.p(), 36, 4);
	put_constants(r.p() + 40, shader, p_specialization_constants, false);
	memcpy(r.p() + 40 + 16 * constants, "main", 4);
	PipelineInfo *pipeline = memnew(PipelineInfo);
	pipeline->compute = true;
	pipeline->shader = shader;
	pipeline->handle = CREATE(r);
	return PipelineID(pipeline);
}

void RenderingDeviceDriverWebGPU::pipeline_free(PipelineID p_pipeline) {
	PipelineInfo *pipeline = (PipelineInfo *)p_pipeline.id;
	release(pipeline->handle);
	memdelete(pipeline);
}

/******************/
/**** COMMANDS ****/
/******************/

RDD::CommandBufferID RenderingDeviceDriverWebGPU::command_buffer_create(CommandPoolID p_cmd_pool) {
	return CommandBufferID(memnew(CommandBufferInfo));
}

bool RenderingDeviceDriverWebGPU::command_buffer_begin(CommandBufferID p_cmd_buffer) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->records.clear();
	cb->count = 0;
	cb->in_render_pass = cb->in_compute_pass = cb->surface = false;
	cb->pipeline = nullptr;
	cb->bound = Bound();
	cb->push_begin = UINT64_MAX;
	cb->push_end = 0;
	cb->uploads.clear();
	cb->stale.clear();
	return true;
}

bool RenderingDeviceDriverWebGPU::command_buffer_begin_secondary(CommandBufferID p_cmd_buffer, RenderPassID p_render_pass, uint32_t p_subpass, FramebufferID p_framebuffer) {
	command_buffer_begin(p_cmd_buffer);
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->in_render_pass = true; // its records go inside its primary's pass
	cb->render_pass = (RenderPassInfo *)p_render_pass.id;
	cb->framebuffer = (FramebufferInfo *)p_framebuffer.id;
	cb->subpass = p_subpass;
	return true;
}

void RenderingDeviceDriverWebGPU::command_buffer_end(CommandBufferID p_cmd_buffer) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	if (cb->in_compute_pass) {
		command_record(p_cmd_buffer, DOLLY_GPU_END_COMPUTE_PASS, 8);
		cb->in_compute_pass = false;
	}
	refill_shadows(p_cmd_buffer);
}

void RenderingDeviceDriverWebGPU::command_buffer_execute_secondary(CommandBufferID p_cmd_buffer, VectorView<CommandBufferID> p_secondary_cmd_buffers) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	for (uint32_t i = 0; i < p_secondary_cmd_buffers.size(); i++) {
		const CommandBufferInfo *secondary = (const CommandBufferInfo *)p_secondary_cmd_buffers[i].id;
		const uint32_t at = cb->records.size();
		cb->records.resize(at + secondary->records.size());
		memcpy(cb->records.ptr() + at, secondary->records.ptr(), secondary->records.size());
		cb->count += secondary->count;
		cb->push_begin = MIN(cb->push_begin, secondary->push_begin);
		cb->push_end = MAX(cb->push_end, secondary->push_end);
		for (const CommandBufferInfo::Upload &u : secondary->uploads) cb->uploads.push_back(u);
		for (TextureInfo *texture : secondary->stale) {
			if (!cb->stale.has(texture)) cb->stale.push_back(texture);
		}
	}
	// The pass's state is what the secondaries left.
	cb->pipeline = nullptr;
	cb->bound = Bound();
}

// A compute dispatch needs a compute pass, and a copy, clear or timestamp none.
void RenderingDeviceDriverWebGPU::compute_pass(CommandBufferID p_cmd_buffer) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	if (cb->in_compute_pass) return;
	command_record(p_cmd_buffer, DOLLY_GPU_BEGIN_COMPUTE_PASS, 8);
	cb->in_compute_pass = true;
	for (bool &d : cb->bound.dirty) d = true;
	cb->pipeline_dirty = true;
}

void RenderingDeviceDriverWebGPU::end_passes(CommandBufferID p_cmd_buffer) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	if (cb->in_compute_pass) {
		command_record(p_cmd_buffer, DOLLY_GPU_END_COMPUTE_PASS, 8);
		cb->in_compute_pass = false;
	}
}

/********************/
/**** SWAP CHAIN ****/
/********************/

struct SwapChainInfo {
	RenderingContextDriver::SurfaceID surface = 0;
	RDD::RenderPassID render_pass;
	RenderingDeviceDriverWebGPU::TextureInfo image;
	RenderingDeviceDriverWebGPU::FramebufferInfo framebuffer;
};

RDD::SwapChainID RenderingDeviceDriverWebGPU::swap_chain_create(RenderingContextDriver::SurfaceID p_surface) {
	SwapChainInfo *swap_chain = memnew(SwapChainInfo);
	swap_chain->surface = p_surface;
	Attachment attachment;
	attachment.format = swap_chain_get_format(SwapChainID());
	attachment.samples = TEXTURE_SAMPLES_1;
	attachment.load_op = ATTACHMENT_LOAD_OP_CLEAR;
	attachment.store_op = ATTACHMENT_STORE_OP_STORE;
	Subpass subpass;
	AttachmentReference color;
	color.attachment = 0;
	subpass.color_references.push_back(color);
	swap_chain->render_pass = render_pass_create(attachment, subpass, VectorView<SubpassDependency>(), 1, AttachmentReference());
	swap_chain->image.surface = true;
	swap_chain->image.format = attachment.format;
	swap_chain->image.gpu_format = surface_format;
	swap_chain->framebuffer.attachments.push_back(&swap_chain->image);
	return SwapChainID(swap_chain);
}

Error RenderingDeviceDriverWebGPU::swap_chain_resize(CommandQueueID p_cmd_queue, SwapChainID p_swap_chain, uint32_t p_desired_framebuffer_count) {
	SwapChainInfo *swap_chain = (SwapChainInfo *)p_swap_chain.id;
	// gpu@0's surface is at most 4096 by 2304.
	swap_chain->image.width = CLAMP(context_driver->surface_get_width(swap_chain->surface), 1u, 4096u);
	swap_chain->image.height = CLAMP(context_driver->surface_get_height(swap_chain->surface), 1u, 2304u);
	swap_chain->framebuffer.width = swap_chain->image.width;
	swap_chain->framebuffer.height = swap_chain->image.height;
	context_driver->surface_set_needs_resize(swap_chain->surface, false);
	return OK;
}

RDD::FramebufferID RenderingDeviceDriverWebGPU::swap_chain_acquire_framebuffer(CommandQueueID p_cmd_queue, SwapChainID p_swap_chain, bool &r_resize_required) {
	SwapChainInfo *swap_chain = (SwapChainInfo *)p_swap_chain.id;
	r_resize_required = context_driver->surface_get_needs_resize(swap_chain->surface);
	if (r_resize_required) return FramebufferID();
	return FramebufferID(&swap_chain->framebuffer);
}

RDD::RenderPassID RenderingDeviceDriverWebGPU::swap_chain_get_render_pass(SwapChainID p_swap_chain) {
	return ((SwapChainInfo *)p_swap_chain.id)->render_pass;
}

RDD::DataFormat RenderingDeviceDriverWebGPU::swap_chain_get_format(SwapChainID p_swap_chain) {
	return surface_format == 28 ? DATA_FORMAT_B8G8R8A8_UNORM : DATA_FORMAT_R8G8B8A8_UNORM;
}

void RenderingDeviceDriverWebGPU::swap_chain_free(SwapChainID p_swap_chain) {
	SwapChainInfo *swap_chain = (SwapChainInfo *)p_swap_chain.id;
	render_pass_free(swap_chain->render_pass);
	memdelete(swap_chain);
}

/*********************/
/**** FRAMEBUFFER ****/
/*********************/

RDD::FramebufferID RenderingDeviceDriverWebGPU::framebuffer_create(RenderPassID p_render_pass, VectorView<TextureID> p_attachments, uint32_t p_width, uint32_t p_height) {
	FramebufferInfo *framebuffer = memnew(FramebufferInfo);
	for (uint32_t i = 0; i < p_attachments.size(); i++) {
		framebuffer->attachments.push_back((TextureInfo *)p_attachments[i].id);
	}
	framebuffer->width = p_width;
	framebuffer->height = p_height;
	return FramebufferID(framebuffer);
}

void RenderingDeviceDriverWebGPU::framebuffer_free(FramebufferID p_framebuffer) {
	memdelete((FramebufferInfo *)p_framebuffer.id);
}

/*******************/
/**** RENDERING ****/
/*******************/

RDD::RenderPassID RenderingDeviceDriverWebGPU::render_pass_create(VectorView<Attachment> p_attachments, VectorView<Subpass> p_subpasses, VectorView<SubpassDependency> p_subpass_dependencies, uint32_t p_view_count, AttachmentReference p_fragment_density_map_attachment) {
	ERR_FAIL_COND_V_MSG(p_view_count > 1, RenderPassID(), "WebGPU has no multiview.");
	RenderPassInfo *pass = memnew(RenderPassInfo);
	for (uint32_t i = 0; i < p_attachments.size(); i++) pass->attachments.push_back(p_attachments[i]);
	for (uint32_t i = 0; i < p_subpasses.size(); i++) pass->subpasses.push_back(p_subpasses[i]);
	return RenderPassID(pass);
}

void RenderingDeviceDriverWebGPU::render_pass_free(RenderPassID p_render_pass) {
	memdelete((RenderPassInfo *)p_render_pass.id);
}

// Whether a subpass after p_subpass reads or draws attachment p_attachment: then it is stored.
static bool used_later(const RenderingDeviceDriverWebGPU::RenderPassInfo *p_pass, uint32_t p_subpass, uint32_t p_attachment) {
	for (uint32_t s = p_subpass + 1; s < p_pass->subpasses.size(); s++) {
		const RDD::Subpass &subpass = p_pass->subpasses[s];
		for (const RDD::AttachmentReference &r : subpass.color_references) {
			if (r.attachment == p_attachment) return true;
		}
		for (const RDD::AttachmentReference &r : subpass.input_references) {
			if (r.attachment == p_attachment) return true;
		}
		if (subpass.depth_stencil_reference.attachment == p_attachment) return true;
	}
	return false;
}

// Whether a subpass before p_subpass used attachment p_attachment: then it is loaded.
static bool used_before(const RenderingDeviceDriverWebGPU::RenderPassInfo *p_pass, uint32_t p_subpass, uint32_t p_attachment) {
	for (uint32_t s = 0; s < p_subpass; s++) {
		const RDD::Subpass &subpass = p_pass->subpasses[s];
		for (const RDD::AttachmentReference &r : subpass.color_references) {
			if (r.attachment == p_attachment) return true;
		}
		if (subpass.depth_stencil_reference.attachment == p_attachment) return true;
	}
	return false;
}

// One WebGPU pass per subpass, as Direct3D 12's driver does: an attachment is cleared where its
// first subpass begins and stored where a later one reads it; an input attachment is then a
// texture, which the subpass's uniform set binds.
void RenderingDeviceDriverWebGPU::begin_subpass(CommandBufferID p_cmd_buffer, bool p_first) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	const RenderPassInfo *pass = cb->render_pass;
	const FramebufferInfo *fb = cb->framebuffer;
	const Subpass &subpass = pass->subpasses[cb->subpass];
	const uint32_t colors = subpass.color_references.size();
	refill_shadows(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_BEGIN_VIEW_PASS, 64 + 40 * colors);
	uint32_t width = 0, height = 0;
	auto load = [&](uint32_t attachment, AttachmentLoadOp op) {
		return used_before(pass, cb->subpass, attachment) ? 0u : op == ATTACHMENT_LOAD_OP_LOAD ? 0u : 1u;
	};
	auto store = [&](uint32_t attachment, AttachmentStoreOp op) {
		return used_later(pass, cb->subpass, attachment) || op == ATTACHMENT_STORE_OP_STORE ? 0u : 1u;
	};
	uint32_t absent = 0;
	for (uint32_t i = 0; i < colors; i++) {
		const uint32_t attachment = subpass.color_references[i].attachment;
		uint8_t *c = p + 64 + 40 * i;
		if (attachment == AttachmentReference::UNUSED) {
			absent |= 1u << i;
			continue;
		}
		const TextureInfo *texture = fb->attachments[attachment];
		if (texture->surface) {
			cb->surface = true;
			width = texture->width;
			height = texture->height;
		}
		put64(c, 0, texture->surface ? 0 : texture->view);
		written(p_cmd_buffer, texture);
		if (i < subpass.resolve_references.size() && subpass.resolve_references[i].attachment != AttachmentReference::UNUSED) {
			const TextureInfo *resolve = fb->attachments[subpass.resolve_references[i].attachment];
			put64(c, 8, resolve->view);
			written(p_cmd_buffer, resolve);
		}
		const Attachment &a = pass->attachments[attachment];
		put32(c, 16, load(attachment, a.load_op));
		put32(c, 20, store(attachment, a.store_op));
		if (attachment < cb->clear_values.size()) {
			const Color &color = cb->clear_values[attachment].color;
			putf(c, 24, color.r);
			putf(c, 28, color.g);
			putf(c, 32, color.b);
			putf(c, 36, color.a);
		}
	}
	put32(p, 16, colors);
	put32(p, 20, width);
	put32(p, 24, height);
	put32(p, 60, absent);
	const uint32_t depth = subpass.depth_stencil_reference.attachment;
	if (depth != AttachmentReference::UNUSED) {
		const TextureInfo *texture = fb->attachments[depth];
		const Attachment &a = pass->attachments[depth];
		const bool read_only = subpass.depth_stencil_reference.layout == TEXTURE_LAYOUT_DEPTH_STENCIL_READ_ONLY_OPTIMAL;
		put64(p, 8, texture->view);
		if (!read_only) written(p_cmd_buffer, texture);
		put32(p, 28, load(depth, a.load_op));
		put32(p, 32, store(depth, a.store_op));
		put32(p, 36, read_only);
		put32(p, 44, load(depth, a.stencil_load_op));
		put32(p, 48, store(depth, a.stencil_store_op));
		put32(p, 52, read_only);
		if (depth < cb->clear_values.size()) {
			putf(p, 40, cb->clear_values[depth].depth);
			put32(p, 56, cb->clear_values[depth].stencil);
		}
	}
	cb->in_render_pass = true;
	for (bool &d : cb->bound.dirty) d = true;
	cb->pipeline_dirty = true;
	cb->vertex_dirty = cb->index_dirty = true;
	// The render area, as Vulkan clips to it.
	cb->viewport = cb->scissor = cb->render_rect;
	cb->viewport_dirty = true;
}

void RenderingDeviceDriverWebGPU::command_begin_render_pass(CommandBufferID p_cmd_buffer, RenderPassID p_render_pass, FramebufferID p_framebuffer, CommandBufferType p_cmd_buffer_type, const Rect2i &p_rect, VectorView<RenderPassClearValue> p_clear_values) {
	end_passes(p_cmd_buffer);
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->render_pass = (RenderPassInfo *)p_render_pass.id;
	cb->framebuffer = (FramebufferInfo *)p_framebuffer.id;
	cb->subpass = 0;
	cb->render_rect = p_rect;
	cb->clear_values.clear();
	for (uint32_t i = 0; i < p_clear_values.size(); i++) cb->clear_values.push_back(p_clear_values[i]);
	begin_subpass(p_cmd_buffer, true);
}

void RenderingDeviceDriverWebGPU::command_end_render_pass(CommandBufferID p_cmd_buffer) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	command_record(p_cmd_buffer, DOLLY_GPU_END_RENDER_PASS, 8);
	cb->in_render_pass = false;
}

void RenderingDeviceDriverWebGPU::command_next_render_subpass(CommandBufferID p_cmd_buffer, CommandBufferType p_cmd_buffer_type) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	command_record(p_cmd_buffer, DOLLY_GPU_END_RENDER_PASS, 8);
	cb->subpass++;
	begin_subpass(p_cmd_buffer, false);
}

void RenderingDeviceDriverWebGPU::command_render_set_viewport(CommandBufferID p_cmd_buffer, VectorView<Rect2i> p_viewports) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->viewport = p_viewports[0];
	cb->viewport_dirty = true;
}

void RenderingDeviceDriverWebGPU::command_render_set_scissor(CommandBufferID p_cmd_buffer, VectorView<Rect2i> p_scissors) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->scissor = p_scissors[0];
	cb->viewport_dirty = true;
}

void RenderingDeviceDriverWebGPU::command_render_clear_attachments(CommandBufferID p_cmd_buffer, VectorView<AttachmentClear> p_attachment_clears, VectorView<Rect2i> p_rects) {
	ERR_FAIL_MSG("Clearing part of an attachment inside a render pass is not done yet on gpu@0.");
}

void RenderingDeviceDriverWebGPU::command_bind_render_pipeline(CommandBufferID p_cmd_buffer, PipelineID p_pipeline) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->pipeline = (PipelineInfo *)p_pipeline.id;
	cb->pipeline_dirty = true;
	if (cb->bound.shader != cb->pipeline->shader) {
		cb->bound.shader = cb->pipeline->shader;
		for (bool &d : cb->bound.dirty) d = true;
	}
}

// Godot's sets, and the dynamic copies its buffers write, bound when the next draw or dispatch
// needs them.
static void bind_sets(RenderingDeviceDriverWebGPU::CommandBufferInfo *p_cb, VectorView<RDD::UniformSetID> p_uniform_sets, uint32_t p_first_set_index, uint32_t p_set_count, uint32_t p_dynamic_offsets) {
	uint32_t shift = 0;
	for (uint32_t i = 0; i < p_set_count; i++) {
		RenderingDeviceDriverWebGPU::UniformSetInfo *set = (RenderingDeviceDriverWebGPU::UniformSetInfo *)p_uniform_sets[i].id;
		const uint32_t index = p_first_set_index + i;
		p_cb->bound.sets[index] = set;
		p_cb->bound.frames[index] = set->dynamic.is_empty() ? 0 : (p_dynamic_offsets >> shift);
		shift += 4 * set->dynamic.size();
		p_cb->bound.dirty[index] = true;
	}
}

void RenderingDeviceDriverWebGPU::command_bind_render_uniform_sets(CommandBufferID p_cmd_buffer, VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count, uint32_t p_dynamic_offsets) {
	bind_sets((CommandBufferInfo *)p_cmd_buffer.id, p_uniform_sets, p_first_set_index, p_set_count, p_dynamic_offsets);
}

// Before a draw or dispatch: the pipeline, then each of its shader's groups whose set, dynamic
// copies or push constants changed.
void RenderingDeviceDriverWebGPU::bind_groups(CommandBufferID p_cmd_buffer) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	ERR_FAIL_NULL(cb->pipeline);
	if (cb->pipeline_dirty) {
		put64(command_record(p_cmd_buffer, DOLLY_GPU_SET_PIPELINE, 16), 8, cb->pipeline->handle);
		if (!cb->pipeline->compute) {
			put32(command_record(p_cmd_buffer, DOLLY_GPU_SET_STENCIL_REFERENCE, 16), 8, cb->pipeline->stencil_reference);
		}
		cb->pipeline_dirty = false;
	}
	ShaderInfo *shader = cb->pipeline->shader;
	for (uint32_t g = 0; g < shader->group_layouts.size(); g++) {
		if (!cb->bound.dirty[g]) continue;
		UniformSetInfo *set = g < shader->sets.size() && !shader->sets[g].is_empty() ? cb->bound.sets[g] : nullptr;
		const Group &group = group_for(set, shader, g);
		if (!group.handle) continue;
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_SET_BIND_GROUP, 24 + 4 * group.dynamic.size());
		put64(p, 8, group.handle);
		put32(p, 16, g);
		put32(p, 20, group.dynamic.size());
		for (uint32_t i = 0; i < group.dynamic.size(); i++) {
			uint32_t offset = cb->bound.push_offset;
			if (group.dynamic[i] >= 0) {
				const BufferInfo *buffer = set->dynamic[group.dynamic[i]];
				offset = ((cb->bound.frames[g] >> (4 * group.dynamic[i])) & 15) * buffer->stride;
			}
			put32(p, 24 + 4 * i, offset);
		}
		if (set && shadows.load()) {
			for (const BoundUniform &u : set->uniforms) {
				if (u.type != UNIFORM_TYPE_IMAGE) continue;
				for (uint32_t i = 0; i < u.ids.size(); i++) written(p_cmd_buffer, (const TextureInfo *)u.ids[i].id);
			}
		}
		cb->bound.dirty[g] = false;
	}
	if (cb->in_render_pass && cb->viewport_dirty) {
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_VIEWPORT, 48);
		const Rect2i &v = cb->viewport;
		putf(p, 8, v.position.x);
		putf(p, 12, v.position.y);
		putf(p, 16, MAX(1, v.size.width));
		putf(p, 20, MAX(1, v.size.height));
		putf(p, 24, 0.0f);
		putf(p, 28, 1.0f);
		const Rect2i s = cb->scissor.intersection(cb->render_rect);
		put32(p, 32, s.position.x);
		put32(p, 36, s.position.y);
		put32(p, 40, s.size.width);
		put32(p, 44, s.size.height);
		cb->viewport_dirty = false;
	}
	if (cb->in_render_pass && cb->vertex_dirty) {
		for (uint32_t i = 0; i < cb->vertex_count; i++) {
			uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_SET_VERTEX_BUFFER, 40);
			put64(p, 8, cb->vertex_buffers[i]->handle);
			put32(p, 16, i);
			put64(p, 24, cb->vertex_offsets[i]);
			put64(p, 32, allocated(cb->vertex_buffers[i]) - cb->vertex_offsets[i]);
		}
		cb->vertex_dirty = false;
	}
	if (cb->in_render_pass && cb->index_dirty && cb->index_buffer) {
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_SET_INDEX_BUFFER, 40);
		put64(p, 8, cb->index_buffer->handle);
		put32(p, 16, cb->index_format == INDEX_BUFFER_FORMAT_UINT16 ? 1 : 2);
		put64(p, 24, cb->index_offset);
		put64(p, 32, allocated(cb->index_buffer) - cb->index_offset);
		cb->index_dirty = false;
	}
}

void RenderingDeviceDriverWebGPU::command_render_draw(CommandBufferID p_cmd_buffer, uint32_t p_vertex_count, uint32_t p_instance_count, uint32_t p_base_vertex, uint32_t p_first_instance) {
	bind_groups(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_DRAW, 24);
	put32(p, 8, p_vertex_count);
	put32(p, 12, p_instance_count);
	put32(p, 16, p_base_vertex);
	put32(p, 20, p_first_instance);
}

void RenderingDeviceDriverWebGPU::command_render_draw_indexed(CommandBufferID p_cmd_buffer, uint32_t p_index_count, uint32_t p_instance_count, uint32_t p_first_index, int32_t p_vertex_offset, uint32_t p_first_instance) {
	bind_groups(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_DRAW_INDEXED, 32);
	put32(p, 8, p_index_count);
	put32(p, 12, p_instance_count);
	put32(p, 16, p_first_index);
	put32(p, 20, uint32_t(p_vertex_offset));
	put32(p, 24, p_first_instance);
}

void RenderingDeviceDriverWebGPU::command_render_draw_indexed_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, uint32_t p_draw_count, uint32_t p_stride) {
	bind_groups(p_cmd_buffer);
	// WebGPU has no multi-draw: one indirect draw each.
	for (uint32_t i = 0; i < p_draw_count; i++) {
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_DRAW_INDEXED_INDIRECT, 24);
		put64(p, 8, ((BufferInfo *)p_indirect_buffer.id)->handle);
		put64(p, 16, p_offset + uint64_t(i) * p_stride);
	}
}

void RenderingDeviceDriverWebGPU::command_render_draw_indexed_indirect_count(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, BufferID p_count_buffer, uint64_t p_count_buffer_offset, uint32_t p_max_draw_count, uint32_t p_stride) {
	ERR_FAIL_MSG("WebGPU has no draw count buffers.");
}

void RenderingDeviceDriverWebGPU::command_render_draw_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, uint32_t p_draw_count, uint32_t p_stride) {
	bind_groups(p_cmd_buffer);
	for (uint32_t i = 0; i < p_draw_count; i++) {
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_DRAW_INDIRECT, 24);
		put64(p, 8, ((BufferInfo *)p_indirect_buffer.id)->handle);
		put64(p, 16, p_offset + uint64_t(i) * p_stride);
	}
}

void RenderingDeviceDriverWebGPU::command_render_draw_indirect_count(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset, BufferID p_count_buffer, uint64_t p_count_buffer_offset, uint32_t p_max_draw_count, uint32_t p_stride) {
	ERR_FAIL_MSG("WebGPU has no draw count buffers.");
}

void RenderingDeviceDriverWebGPU::command_render_bind_vertex_buffers(CommandBufferID p_cmd_buffer, uint32_t p_binding_count, const BufferID *p_buffers, const uint64_t *p_offsets, uint64_t p_dynamic_offsets) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	ERR_FAIL_COND(p_binding_count > 16);
	uint64_t shift = 0;
	for (uint32_t i = 0; i < p_binding_count; i++) {
		BufferInfo *buffer = (BufferInfo *)p_buffers[i].id;
		uint64_t offset = p_offsets[i];
		if (buffer->stride) {
			offset += ((p_dynamic_offsets >> shift) & 3) * buffer->stride;
			shift += 2;
		}
		cb->vertex_buffers[i] = buffer;
		cb->vertex_offsets[i] = offset;
	}
	cb->vertex_count = p_binding_count;
	cb->vertex_dirty = true;
}

void RenderingDeviceDriverWebGPU::command_render_bind_index_buffer(CommandBufferID p_cmd_buffer, BufferID p_buffer, IndexBufferFormat p_format, uint64_t p_offset) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	cb->index_buffer = (BufferInfo *)p_buffer.id;
	cb->index_format = p_format;
	cb->index_offset = p_offset;
	cb->index_dirty = true;
}

void RenderingDeviceDriverWebGPU::command_render_set_blend_constants(CommandBufferID p_cmd_buffer, const Color &p_constants) {
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_SET_BLEND_CONSTANT, 24);
	putf(p, 8, p_constants.r);
	putf(p, 12, p_constants.g);
	putf(p, 16, p_constants.b);
	putf(p, 20, p_constants.a);
}

void RenderingDeviceDriverWebGPU::command_render_set_line_width(CommandBufferID p_cmd_buffer, float p_width) {
	ERR_FAIL_COND_MSG(p_width != 1.0f, "WebGPU draws lines one pixel wide.");
}

// Push constants: a slot of the frame's ring, the whole block each time, bound by group 0's
// dynamic offset at the next draw or dispatch.
void RenderingDeviceDriverWebGPU::command_bind_push_constants(CommandBufferID p_cmd_buffer, ShaderID p_shader, uint32_t p_first_index, VectorView<uint32_t> p_data) {
	CommandBufferInfo *cb = (CommandBufferInfo *)p_cmd_buffer.id;
	ERR_FAIL_COND((p_first_index + p_data.size()) * 4 > PUSH_CONSTANT_BYTES);
	memcpy(cb->bound.push + p_first_index * 4, p_data.ptr(), p_data.size() * 4);
	const uint64_t alignment = limits[L_STORAGE_ALIGNMENT];
	const uint64_t slot = push_cursor.fetch_add(STEPIFY(uint64_t(PUSH_CONSTANT_BYTES), alignment));
	ERR_FAIL_COND_MSG(slot + PUSH_CONSTANT_BYTES > push_ring_frame_bytes, "A frame's push constants exceed their ring.");
	const uint64_t offset = frame * push_ring_frame_bytes + slot;
	memcpy(push_ring.copy + offset, cb->bound.push, PUSH_CONSTANT_BYTES);
	cb->push_begin = MIN(cb->push_begin, offset);
	cb->push_end = MAX(cb->push_end, offset + PUSH_CONSTANT_BYTES);
	cb->bound.push_offset = offset;
	cb->bound.dirty[0] = true;
}

/*****************/
/**** COMPUTE ****/
/*****************/

void RenderingDeviceDriverWebGPU::command_bind_compute_pipeline(CommandBufferID p_cmd_buffer, PipelineID p_pipeline) {
	command_bind_render_pipeline(p_cmd_buffer, p_pipeline);
}

void RenderingDeviceDriverWebGPU::command_bind_compute_uniform_sets(CommandBufferID p_cmd_buffer, VectorView<UniformSetID> p_uniform_sets, ShaderID p_shader, uint32_t p_first_set_index, uint32_t p_set_count, uint32_t p_dynamic_offsets) {
	bind_sets((CommandBufferInfo *)p_cmd_buffer.id, p_uniform_sets, p_first_set_index, p_set_count, p_dynamic_offsets);
}

void RenderingDeviceDriverWebGPU::command_compute_dispatch(CommandBufferID p_cmd_buffer, uint32_t p_x_groups, uint32_t p_y_groups, uint32_t p_z_groups) {
	compute_pass(p_cmd_buffer);
	refill_shadows(p_cmd_buffer);
	bind_groups(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_DISPATCH, 24);
	put32(p, 8, p_x_groups);
	put32(p, 12, p_y_groups);
	put32(p, 16, p_z_groups);
}

void RenderingDeviceDriverWebGPU::command_compute_dispatch_indirect(CommandBufferID p_cmd_buffer, BufferID p_indirect_buffer, uint64_t p_offset) {
	compute_pass(p_cmd_buffer);
	refill_shadows(p_cmd_buffer);
	bind_groups(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_DISPATCH_INDIRECT, 24);
	put64(p, 8, ((BufferInfo *)p_indirect_buffer.id)->handle);
	put64(p, 16, p_offset);
}

/******************/
/**** TRANSFER ****/
/******************/

void RenderingDeviceDriverWebGPU::command_clear_buffer(CommandBufferID p_cmd_buffer, BufferID p_buffer, uint64_t p_offset, uint64_t p_size) {
	end_passes(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_CLEAR_BUFFER, 32);
	put64(p, 8, ((BufferInfo *)p_buffer.id)->handle);
	put64(p, 16, p_offset);
	put64(p, 24, p_size);
}

void RenderingDeviceDriverWebGPU::command_copy_buffer(CommandBufferID p_cmd_buffer, BufferID p_src_buffer, BufferID p_dst_buffer, VectorView<BufferCopyRegion> p_regions) {
	end_passes(p_cmd_buffer);
	for (uint32_t i = 0; i < p_regions.size(); i++) {
		read_from(p_cmd_buffer, (BufferInfo *)p_src_buffer.id, p_regions[i].src_offset, p_regions[i].src_offset + p_regions[i].size);
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_COPY_BUFFER, 48);
		put64(p, 8, ((BufferInfo *)p_src_buffer.id)->handle);
		put64(p, 16, ((BufferInfo *)p_dst_buffer.id)->handle);
		put64(p, 24, p_regions[i].src_offset);
		put64(p, 32, p_regions[i].dst_offset);
		put64(p, 40, p_regions[i].size);
	}
}

void RenderingDeviceDriverWebGPU::command_copy_texture(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, VectorView<TextureCopyRegion> p_regions) {
	end_passes(p_cmd_buffer);
	const TextureInfo *src = (const TextureInfo *)p_src_texture.id, *dst = (const TextureInfo *)p_dst_texture.id;
	for (uint32_t i = 0; i < p_regions.size(); i++) {
		const TextureCopyRegion &r = p_regions[i];
		uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE, 72);
		put64(p, 8, src->texture);
		put64(p, 16, dst->texture);
		const bool src3d = src->type == TEXTURE_TYPE_3D, dst3d = dst->type == TEXTURE_TYPE_3D;
		put32(p, 24, src->base_mip + r.src_subresources.mipmap);
		put32(p, 28, r.src_offset.x);
		put32(p, 32, r.src_offset.y);
		put32(p, 36, src3d ? r.src_offset.z : src->base_layer + r.src_subresources.base_layer);
		put32(p, 40, dst->base_mip + r.dst_subresources.mipmap);
		put32(p, 44, r.dst_offset.x);
		put32(p, 48, r.dst_offset.y);
		put32(p, 52, dst3d ? r.dst_offset.z : dst->base_layer + r.dst_subresources.base_layer);
		put32(p, 56, r.size.x);
		put32(p, 60, r.size.y);
		put32(p, 64, src3d ? r.size.z : r.src_subresources.layer_count);
	}
	written(p_cmd_buffer, dst);
}

void RenderingDeviceDriverWebGPU::copy_buffer_texture(CommandBufferID p_cmd_buffer, uint32_t p_op, BufferID p_buffer, TextureID p_texture, const BufferTextureCopyRegion &p_region) {
	const TextureInfo *texture = (const TextureInfo *)p_texture.id;
	uint32_t block_w = 1, block_h = 1;
	get_compressed_image_format_block_dimensions(texture->format, block_w, block_h);
	const bool volume = texture->type == TEXTURE_TYPE_3D;
	uint8_t *p = command_record(p_cmd_buffer, p_op, 72);
	put64(p, 8, ((BufferInfo *)p_buffer.id)->handle);
	put64(p, 16, p_region.buffer_offset);
	put32(p, 24, p_region.row_pitch);
	put32(p, 28, (p_region.texture_region_size.y + block_h - 1) / block_h);
	put64(p, 32, texture->texture);
	put32(p, 40, texture->base_mip + p_region.texture_subresource.mipmap);
	put32(p, 44, p_region.texture_subresource.aspect == TEXTURE_ASPECT_DEPTH ? 2 : p_region.texture_subresource.aspect == TEXTURE_ASPECT_STENCIL ? 1 : 0);
	put32(p, 48, p_region.texture_offset.x);
	put32(p, 52, p_region.texture_offset.y);
	put32(p, 56, volume ? p_region.texture_offset.z : texture->base_layer + p_region.texture_subresource.layer);
	// WebGPU copies whole blocks, which Godot's sizes of a compressed mip below 4 are not.
	put32(p, 60, STEPIFY(uint32_t(p_region.texture_region_size.x), block_w));
	put32(p, 64, STEPIFY(uint32_t(p_region.texture_region_size.y), block_h));
	put32(p, 68, volume ? p_region.texture_region_size.z : 1);
}

void RenderingDeviceDriverWebGPU::command_copy_buffer_to_texture(CommandBufferID p_cmd_buffer, BufferID p_src_buffer, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, VectorView<BufferTextureCopyRegion> p_regions) {
	end_passes(p_cmd_buffer);
	const TextureInfo *texture = (const TextureInfo *)p_dst_texture.id;
	for (uint32_t i = 0; i < p_regions.size(); i++) {
		const BufferTextureCopyRegion &r = p_regions[i];
		uint32_t block_w = 1, block_h = 1;
		get_compressed_image_format_block_dimensions(texture->format, block_w, block_h);
		const uint64_t rows = (r.texture_region_size.y + block_h - 1) / block_h * MAX(1, r.texture_region_size.z);
		read_from(p_cmd_buffer, (BufferInfo *)p_src_buffer.id, r.buffer_offset, r.buffer_offset + rows * r.row_pitch);
		copy_buffer_texture(p_cmd_buffer, DOLLY_GPU_COPY_BUFFER_TO_TEXTURE, p_src_buffer, p_dst_texture, r);
	}
	written(p_cmd_buffer, texture);
}

void RenderingDeviceDriverWebGPU::command_copy_texture_to_buffer(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, BufferID p_dst_buffer, VectorView<BufferTextureCopyRegion> p_regions) {
	end_passes(p_cmd_buffer);
	for (uint32_t i = 0; i < p_regions.size(); i++) {
		copy_buffer_texture(p_cmd_buffer, DOLLY_GPU_COPY_TEXTURE_TO_BUFFER, p_dst_buffer, p_src_texture, p_regions[i]);
	}
}

// What a shader samples at p_entry: a colour view's shadow (make_shadow) or the view; for depth
// through a filtering sampler, its shadow; else a depth-stencil texture's depth aspect alone, as
// WebGPU binds one aspect.
uint64_t RenderingDeviceDriverWebGPU::sampled_view(TextureInfo *p_texture, const GroupEntry &p_entry) {
	if (p_texture->surface) return p_texture->view;
	if (!is_depth(p_texture->gpu_format)) return p_texture->shadow ? p_texture->shadow->view : p_texture->view;
	if (p_entry.type == 7 && p_entry.a == 1) {
		if (!p_texture->shadow) {
			// uniform_set_create makes it for the set's own shader; another of its variants may
			// filter what that one only loads. Filled at the next refill, after this frame.
			WARN_PRINT_ONCE("A depth texture is filtered by a shader its uniform set was not made for.");
			make_shadow(p_texture, 0x03020100);
		}
		return p_texture->shadow ? p_texture->shadow->view : p_texture->view;
	}
	if (!is_stencil(p_texture->gpu_format)) return p_texture->view;
	if (!p_texture->depth_view) {
		Record r(DOLLY_GPU_CREATE_VIEW, 56);
		put64(r.p(), 16, p_texture->texture);
		put32(r.p(), 28, view_dimension(p_texture->type));
		put32(r.p(), 32, 2);
		put32(r.p(), 36, p_texture->base_mip);
		put32(r.p(), 40, p_texture->mips);
		put32(r.p(), 44, p_texture->base_layer);
		put32(r.p(), 48, p_texture->layers);
		put32(r.p(), 52, 0x03020100);
		p_texture->depth_view = CREATE(r);
	}
	return p_texture->depth_view;
}

// A two-dimensional view of one mip and layer, kept with the texture, for clears and resolves.
uint64_t RenderingDeviceDriverWebGPU::subresource_view(TextureInfo *p_texture, uint32_t p_mip, uint32_t p_layer) {
	const uint32_t key = p_mip << 16 | p_layer;
	if (const uint64_t *found = p_texture->subresource_views.getptr(key)) return *found;
	Record r(DOLLY_GPU_CREATE_VIEW, 56);
	put64(r.p(), 16, p_texture->texture);
	put32(r.p(), 28, 2);
	put32(r.p(), 36, p_texture->base_mip + p_mip);
	put32(r.p(), 40, 1);
	put32(r.p(), 44, p_texture->base_layer + p_layer);
	put32(r.p(), 48, 1);
	put32(r.p(), 52, 0x03020100);
	return p_texture->subresource_views[key] = CREATE(r);
}

// WebGPU clears an attachment as its render pass begins: one pass per mip and layer.
void RenderingDeviceDriverWebGPU::command_clear_color_texture(CommandBufferID p_cmd_buffer, TextureID p_texture, TextureLayout p_texture_layout, const Color &p_color, const TextureSubresourceRange &p_subresources) {
	end_passes(p_cmd_buffer);
	TextureInfo *texture = (TextureInfo *)p_texture.id;
	ERR_FAIL_COND_MSG(!is_renderable(texture->gpu_format, features), "WebGPU clears a texture as an attachment; this format is none.");
	for (uint32_t mip = 0; mip < p_subresources.mipmap_count; mip++) {
		for (uint32_t layer = 0; layer < p_subresources.layer_count; layer++) {
			uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_BEGIN_VIEW_PASS, 104);
			put32(p, 16, 1);
			put64(p, 64, subresource_view(texture, p_subresources.base_mipmap + mip, p_subresources.base_layer + layer));
			put32(p, 80, 1);
			putf(p, 88, p_color.r);
			putf(p, 92, p_color.g);
			putf(p, 96, p_color.b);
			putf(p, 100, p_color.a);
			command_record(p_cmd_buffer, DOLLY_GPU_END_RENDER_PASS, 8);
		}
	}
	written(p_cmd_buffer, texture);
}

void RenderingDeviceDriverWebGPU::command_clear_depth_stencil_texture(CommandBufferID p_cmd_buffer, TextureID p_texture, TextureLayout p_texture_layout, float p_depth, uint8_t p_stencil, const TextureSubresourceRange &p_subresources) {
	end_passes(p_cmd_buffer);
	TextureInfo *texture = (TextureInfo *)p_texture.id;
	for (uint32_t mip = 0; mip < p_subresources.mipmap_count; mip++) {
		for (uint32_t layer = 0; layer < p_subresources.layer_count; layer++) {
			uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_BEGIN_VIEW_PASS, 64);
			put64(p, 8, subresource_view(texture, p_subresources.base_mipmap + mip, p_subresources.base_layer + layer));
			put32(p, 28, 1);
			putf(p, 40, p_depth);
			put32(p, 44, 1);
			put32(p, 56, p_stencil);
			command_record(p_cmd_buffer, DOLLY_GPU_END_RENDER_PASS, 8);
		}
	}
	written(p_cmd_buffer, texture);
}

// WebGPU resolves only as a render pass ends.
void RenderingDeviceDriverWebGPU::command_resolve_texture(CommandBufferID p_cmd_buffer, TextureID p_src_texture, TextureLayout p_src_texture_layout, uint32_t p_src_layer, uint32_t p_src_mipmap, TextureID p_dst_texture, TextureLayout p_dst_texture_layout, uint32_t p_dst_layer, uint32_t p_dst_mipmap) {
	end_passes(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_BEGIN_VIEW_PASS, 104);
	put32(p, 16, 1);
	put64(p, 64, subresource_view((TextureInfo *)p_src_texture.id, p_src_mipmap, p_src_layer));
	put64(p, 72, subresource_view((TextureInfo *)p_dst_texture.id, p_dst_mipmap, p_dst_layer));
	command_record(p_cmd_buffer, DOLLY_GPU_END_RENDER_PASS, 8);
	written(p_cmd_buffer, (const TextureInfo *)p_dst_texture.id);
}

/*****************/
/**** QUERIES ****/
/*****************/

// Godot's GPU profiler: a query set, resolved into a buffer it maps the next time it reads.
RDD::QueryPoolID RenderingDeviceDriverWebGPU::timestamp_query_pool_create(uint32_t p_query_count) {
	if (!(features & F_TIMESTAMPS)) return QueryPoolID();
	QueryPoolInfo *pool = memnew(QueryPoolInfo);
	pool->count = p_query_count;
	Record q(DOLLY_GPU_CREATE_QUERY_SET, 24);
	put32(q.p(), 16, p_query_count);
	pool->handle = CREATE(q);
	Record resolve(DOLLY_GPU_CREATE_BUFFER, 32);
	put64(resolve.p(), 16, STEPIFY(p_query_count * 8, 256u));
	put32(resolve.p(), 24, GPU_QUERY_RESOLVE | GPU_COPY_SRC);
	pool->resolve = CREATE(resolve);
	Record read(DOLLY_GPU_CREATE_BUFFER, 32);
	put64(read.p(), 16, STEPIFY(p_query_count * 8, 256u));
	put32(read.p(), 24, GPU_MAP_READ | GPU_COPY_DST);
	pool->read = CREATE(read);
	return QueryPoolID(pool);
}

void RenderingDeviceDriverWebGPU::timestamp_query_pool_free(QueryPoolID p_pool_id) {
	QueryPoolInfo *pool = (QueryPoolInfo *)p_pool_id.id;
	release(pool->handle);
	release(pool->resolve);
	release(pool->read);
	memdelete(pool);
}

void RenderingDeviceDriverWebGPU::timestamp_query_pool_get_results(QueryPoolID p_pool_id, uint32_t p_query_count, uint64_t *r_results) {
	QueryPoolInfo *pool = (QueryPoolInfo *)p_pool_id.id;
	{
		MutexLock lock(mutex);
		flush_pending();
		bool sent = false;
		uint8_t *p = packet_record(DOLLY_GPU_RESOLVE_QUERY_SET, 40, sent);
		put64(p, 8, pool->handle);
		put32(p, 20, p_query_count);
		put64(p, 24, pool->resolve);
		p = packet_record(DOLLY_GPU_COPY_BUFFER, 48, sent);
		put64(p, 8, pool->resolve);
		put64(p, 16, pool->read);
		put64(p, 40, p_query_count * 8);
		packet_record(DOLLY_GPU_SUBMIT, 8, sent);
		send(false);
	}
	BufferInfo read;
	read.handle = pool->read;
	read_buffer(&read, 0, p_query_count * 8, (uint8_t *)r_results);
}

void RenderingDeviceDriverWebGPU::command_timestamp_write(CommandBufferID p_cmd_buffer, QueryPoolID p_pool_id, uint32_t p_index) {
	end_passes(p_cmd_buffer);
	uint8_t *p = command_record(p_cmd_buffer, DOLLY_GPU_WRITE_TIMESTAMP, 24);
	put64(p, 8, ((QueryPoolInfo *)p_pool_id.id)->handle);
	put32(p, 16, p_index);
}

/********************/
/**** SUBMISSION ****/
/********************/

// The objects queued since the last submission, the CPU-written ranges and push constants, the
// command buffers' records in one encoder, then SUBMIT, which presents a surface it drew on.
Error RenderingDeviceDriverWebGPU::command_queue_execute_and_present(CommandQueueID p_cmd_queue, VectorView<SemaphoreID> p_wait_semaphores, VectorView<CommandBufferID> p_cmd_buffers,
		VectorView<SemaphoreID> p_cmd_semaphores, FenceID p_cmd_fence, VectorView<SwapChainID> p_swap_chains) {
	MutexLock lock(mutex);
	flush_pending();
	bool sent = false;
	auto upload = [&](const BufferInfo *p_buffer, uint64_t p_begin, uint64_t p_end) {
		p_begin &= ~3ull;
		p_end = (p_end + 3) & ~3ull;
		for (uint64_t at = p_begin; at < p_end; at += UPLOAD_CHUNK) {
			const uint32_t n = MIN(uint64_t(UPLOAD_CHUNK), p_end - at);
			uint8_t *p = packet_record(DOLLY_GPU_WRITE_BUFFER, 32 + n, sent);
			put64(p, 8, p_buffer->handle);
			put64(p, 16, at);
			put32(p, 24, 32);
			put32(p, 28, n);
			memcpy(p + 32, p_buffer->copy + at, n);
		}
	};
	for (BufferInfo *buffer : dirty) {
		upload(buffer, buffer->dirty_begin, buffer->dirty_end);
		buffer->dirty_begin = UINT64_MAX;
		buffer->dirty_end = 0;
	}
	dirty.clear();
	bool encoder = false;
	for (uint32_t i = 0; i < p_cmd_buffers.size(); i++) {
		const CommandBufferInfo *cb = (const CommandBufferInfo *)p_cmd_buffers[i].id;
		if (cb->push_begin < cb->push_end) upload(&push_ring, cb->push_begin, cb->push_end);
		for (const CommandBufferInfo::Upload &u : cb->uploads) upload(u.buffer, u.begin, MIN(u.end, allocated(u.buffer)));
	}
	for (uint32_t i = 0; i < p_cmd_buffers.size(); i++) {
		const CommandBufferInfo *cb = (const CommandBufferInfo *)p_cmd_buffers[i].id;
		for (uint32_t at = 0; at < cb->records.size();) {
			uint32_t op, size;
			memcpy(&op, cb->records.ptr() + at, 4);
			memcpy(&size, cb->records.ptr() + at + 4, 4);
			memcpy(packet_record(op, size, sent), cb->records.ptr() + at, size);
			at += size;
			encoder = true;
		}
	}
	if (encoder) packet_record(DOLLY_GPU_SUBMIT, 8, sent);
	return send(false) ? OK : ERR_CANT_CREATE;
}

/**************/
/**** MISC ****/
/**************/

uint64_t RenderingDeviceDriverWebGPU::limit_get(Limit p_limit) {
	switch (p_limit) {
		case LIMIT_MAX_BOUND_UNIFORM_SETS: return MIN(limits[L_BIND_GROUPS], 8ull);
		case LIMIT_MAX_FRAMEBUFFER_COLOR_ATTACHMENTS: return limits[L_COLOR_ATTACHMENTS];
		case LIMIT_MAX_TEXTURES_PER_UNIFORM_SET:
		case LIMIT_MAX_TEXTURES_PER_SHADER_STAGE: return limits[L_SAMPLED_TEXTURES];
		case LIMIT_MAX_SAMPLERS_PER_UNIFORM_SET:
		case LIMIT_MAX_SAMPLERS_PER_SHADER_STAGE: return limits[L_SAMPLERS];
		case LIMIT_MAX_STORAGE_BUFFERS_PER_UNIFORM_SET:
		case LIMIT_MAX_STORAGE_BUFFERS_PER_SHADER_STAGE: return limits[L_STORAGE_BUFFERS] - 1; // one is the push constants'
		case LIMIT_MAX_STORAGE_IMAGES_PER_UNIFORM_SET:
		case LIMIT_MAX_STORAGE_IMAGES_PER_SHADER_STAGE: return limits[L_STORAGE_TEXTURES];
		case LIMIT_MAX_UNIFORM_BUFFERS_PER_UNIFORM_SET:
		case LIMIT_MAX_UNIFORM_BUFFERS_PER_SHADER_STAGE: return limits[L_UNIFORM_BUFFERS];
		case LIMIT_MAX_DRAW_INDEXED_INDEX: return 0xffffffff;
		case LIMIT_MAX_FRAMEBUFFER_HEIGHT:
		case LIMIT_MAX_FRAMEBUFFER_WIDTH:
		case LIMIT_MAX_TEXTURE_SIZE_2D:
		case LIMIT_MAX_TEXTURE_SIZE_CUBE:
		case LIMIT_MAX_VIEWPORT_DIMENSIONS_X:
		case LIMIT_MAX_VIEWPORT_DIMENSIONS_Y: return limits[L_TEXTURE_2D];
		case LIMIT_MAX_TEXTURE_ARRAY_LAYERS: return limits[L_ARRAY_LAYERS];
		case LIMIT_MAX_TEXTURE_SIZE_1D: return limits[L_TEXTURE_1D];
		case LIMIT_MAX_TEXTURE_SIZE_3D: return limits[L_TEXTURE_3D];
		case LIMIT_MAX_PUSH_CONSTANT_SIZE: return PUSH_CONSTANT_BYTES;
		case LIMIT_MAX_UNIFORM_BUFFER_SIZE: return limits[L_UNIFORM_BINDING_SIZE];
		case LIMIT_MAX_VERTEX_INPUT_ATTRIBUTE_OFFSET: return limits[L_VERTEX_STRIDE] - 4;
		case LIMIT_MAX_VERTEX_INPUT_ATTRIBUTES: return limits[L_VERTEX_ATTRIBUTES];
		case LIMIT_MAX_VERTEX_INPUT_BINDINGS: return limits[L_VERTEX_BUFFERS];
		case LIMIT_MAX_VERTEX_INPUT_BINDING_STRIDE: return limits[L_VERTEX_STRIDE];
		case LIMIT_MIN_UNIFORM_BUFFER_OFFSET_ALIGNMENT: return limits[L_UNIFORM_ALIGNMENT];
		case LIMIT_MAX_COMPUTE_SHARED_MEMORY_SIZE: return limits[L_WORKGROUP_STORAGE];
		case LIMIT_MAX_COMPUTE_WORKGROUP_COUNT_X:
		case LIMIT_MAX_COMPUTE_WORKGROUP_COUNT_Y:
		case LIMIT_MAX_COMPUTE_WORKGROUP_COUNT_Z: return limits[L_WORKGROUPS];
		case LIMIT_MAX_COMPUTE_WORKGROUP_INVOCATIONS: return limits[L_INVOCATIONS];
		case LIMIT_MAX_COMPUTE_WORKGROUP_SIZE_X: return limits[L_WORKGROUP_X];
		case LIMIT_MAX_COMPUTE_WORKGROUP_SIZE_Y: return limits[L_WORKGROUP_Y];
		case LIMIT_MAX_COMPUTE_WORKGROUP_SIZE_Z: return limits[L_WORKGROUP_Z];
		case LIMIT_MAX_SHADER_VARYINGS: return limits[L_INTER_STAGE];
		// No subgroups: Firefox has none, and one path serves both browsers.
		case LIMIT_SUBGROUP_SIZE:
		case LIMIT_SUBGROUP_MIN_SIZE:
		case LIMIT_SUBGROUP_MAX_SIZE:
		case LIMIT_SUBGROUP_IN_SHADERS:
		case LIMIT_SUBGROUP_OPERATIONS: return 0;
		default: return 0;
	}
}

uint64_t RenderingDeviceDriverWebGPU::api_trait_get(ApiTrait p_trait) {
	switch (p_trait) {
		case API_TRAIT_HONORS_PIPELINE_BARRIERS: return false; // WebGPU orders usage itself
		case API_TRAIT_TEXTURE_TRANSFER_ALIGNMENT:
		case API_TRAIT_TEXTURE_DATA_ROW_PITCH_STEP: return 256; // WebGPU's bytesPerRow
		case API_TRAIT_CLEARS_WITH_COPY_ENGINE: return false; // clears are render passes
		case API_TRAIT_TEXTURE_OUTPUTS_REQUIRE_CLEARS: return false; // WebGPU zeroes textures
		default: return RenderingDeviceDriver::api_trait_get(p_trait);
	}
}

bool RenderingDeviceDriverWebGPU::has_feature(Features p_feature) {
	switch (p_feature) {
		// A fragment shader may write storage buffers without colour outputs.
		case SUPPORTS_FRAGMENT_SHADER_WITH_ONLY_SIDE_EFFECTS: return true;
		// No f16: Chrome lacks it on NVIDIA's Vulkan, and one path serves both browsers.
		default: return false;
	}
}
