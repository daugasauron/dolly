/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_backend.hh"
#include "wgpu_batch.hh"
#include "wgpu_buffer.hh"
#include "wgpu_context.hh"
#include "wgpu_framebuffer.hh"
#include "wgpu_shader.hh"
#include "wgpu_texture.hh"

#include "gpu_capabilities_private.hh"
#include "gpu_platform_private.hh"
#include "gpu_texture_pool_private.hh"

#include "CLG_log.h"

#include <algorithm>
#include <cerrno>
#include <cstdio>

namespace blender::gpu {

static CLG_LogRef LOG = {"gpu.webgpu"};

/* -------------------------------------------------------------------- */
/** \name The scope and its records
 * \{ */

/* The staging ring: queue writes of data that commands read (immediate mode's vertices, push
 * constants, updates of resources in use), each range written once per submission. */
static const uint64_t RING_BYTES = 32ull << 20;
/* A queue write's data in one record, so that a record fits a packet. */
static const uint64_t WRITE_CHUNK = 512u << 10;

bool WGPUDevice::open(uint32_t width, uint32_t height)
{
  std::lock_guard lock(mutex);
  if (gpu_) {
    return true;
  }
  dolly_gpu *gpu = new dolly_gpu;
  if (dolly_gpu_open(gpu, width, height) < 0) {
    CLOG_WARN(&LOG, "gpu@0 did not open (errno %d)", errno);
    delete gpu;
    return false;
  }
  uint32_t capabilities = 0;
  if (dolly_gpu_capabilities(gpu) == 128) {
    memcpy(&capabilities, gpu->reply, 4);
  }
  if (!(capabilities & DOLLY_GPU_FEATURE_EXPLICIT) || dolly_gpu_limits(gpu) != 280) {
    CLOG_WARN(&LOG, "gpu@0 lacks its explicit records");
    dolly_gpu_close(gpu);
    delete gpu;
    return false;
  }
  memcpy(limits, gpu->reply, sizeof(limits));
  surface_format = (capabilities & DOLLY_GPU_FEATURE_SURFACE_BGRA) ? 28 : 1;
  gpu_ = gpu;
  dolly_gpu_begin(gpu_);
  uint8_t *p = create(DOLLY_GPU_CREATE_BUFFER, 32, ring_);
  wgpu_put64(p, 16, RING_BYTES);
  wgpu_put32(p,
             24,
             WGPU_BUFFER_VERTEX | WGPU_BUFFER_INDEX | WGPU_BUFFER_STORAGE | WGPU_BUFFER_UNIFORM |
                 WGPU_BUFFER_COPY_SRC | WGPU_BUFFER_COPY_DST);
  return true;
}

void WGPUDevice::close()
{
  std::lock_guard lock(mutex);
  if (!gpu_) {
    return;
  }
  submit();
  dolly_gpu_close(gpu_);
  delete gpu_;
  gpu_ = nullptr;
}

uint8_t *WGPUDevice::append(std::vector<uint8_t> &list, uint32_t op, uint32_t bytes)
{
  const uint32_t size = wgpu_padded(bytes);
  const size_t at = list.size();
  list.resize(at + size);
  uint8_t *p = list.data() + at;
  memset(p, 0, size);
  wgpu_put32(p, 0, op);
  wgpu_put32(p, 4, size);
  return p;
}

uint8_t *WGPUDevice::create(uint32_t op, uint32_t bytes, uint64_t &r_handle)
{
  uint8_t *p = append(objects_, op, bytes);
  r_handle = ++next_handle_;
  wgpu_put64(p, 8, r_handle);
  objects_alive_++;
  return p;
}

uint8_t *WGPUDevice::object(uint32_t op, uint32_t bytes)
{
  return append(objects_, op, bytes);
}

uint8_t *WGPUDevice::command(uint32_t op, uint32_t bytes)
{
  return append(commands_, op, bytes);
}

void WGPUDevice::release(uint64_t handle)
{
  if (handle == 0 || !gpu_) {
    return;
  }
  uint8_t *p = append(releases_, DOLLY_GPU_RELEASE, 16);
  wgpu_put64(p, 8, handle);
  objects_alive_--;
}

void WGPUDevice::write_buffer(uint64_t buffer, uint64_t offset, const void *data, uint64_t size)
{
  const uint8_t *bytes = static_cast<const uint8_t *>(data);
  for (uint64_t done = 0; done < size; done += WRITE_CHUNK) {
    const uint64_t n = std::min(WRITE_CHUNK, size - done);
    /* WebGPU writes whole words. */
    const uint32_t padded_n = uint32_t((n + 3) & ~3ull);
    uint8_t *p = object(DOLLY_GPU_WRITE_BUFFER, 32 + padded_n);
    wgpu_put64(p, 8, buffer);
    wgpu_put64(p, 16, offset + done);
    wgpu_put32(p, 24, 32);
    wgpu_put32(p, 28, padded_n);
    memcpy(p + 32, bytes + done, n);
  }
}

uint64_t WGPUDevice::stage(const void *data, uint64_t size, uint64_t alignment, uint64_t &r_buffer)
{
  const uint64_t padded = (size + 3) & ~3ull;
  uint64_t at = (ring_cursor_ + alignment - 1) / alignment * alignment;
  if (at + padded > RING_BYTES) {
    submit();
    at = 0;
  }
  ring_cursor_ = at + padded;
  if (data) {
    write_buffer(ring_, at, data, size);
  }
  r_buffer = ring_;
  return at;
}

bool WGPUDevice::send(bool more)
{
  if (gpu_->count == 0) {
    dolly_gpu_begin(gpu_);
    return true;
  }
  const int status = more ? dolly_gpu_continue(gpu_) : dolly_gpu_batch(gpu_);
  const int error = errno;
  dolly_gpu_begin(gpu_);
  if (status < 0) {
    CLOG_ERROR(&LOG,
               "gpu@0 refused a batch (errno %d); the page's console has the provider's message",
               error);
    return false;
  }
  return true;
}

/* Copies a list's records into packets, each full one sent with BATCH_CONTINUE. */
bool WGPUDevice::send_list(const std::vector<uint8_t> &list)
{
  bool ok = true;
  for (size_t at = 0; at < list.size();) {
    uint32_t size;
    memcpy(&size, list.data() + at + 4, 4);
    if (gpu_->length + size > DOLLY_GPU_PACKET_BYTES || gpu_->count == DOLLY_GPU_MAX_COMMANDS) {
      ok &= send(true);
    }
    uint32_t op;
    memcpy(&op, list.data() + at, 4);
    uint8_t *p = static_cast<uint8_t *>(dolly_gpu_record(gpu_, op, size));
    memcpy(p, list.data() + at, size);
    at += size;
  }
  return ok;
}

bool WGPUDevice::submit()
{
  std::lock_guard lock(mutex);
  if (!gpu_) {
    return false;
  }
  bool ok = send_list(objects_);
  objects_.clear();
  if (!commands_.empty()) {
    append(commands_, DOLLY_GPU_SUBMIT, 8);
    ok &= send_list(commands_);
    commands_.clear();
  }
  ok &= send_list(releases_);
  releases_.clear();
  ok &= send(false);
  submission_++;
  ring_cursor_ = 0;
  return ok;
}

bool WGPUDevice::wait_idle()
{
  std::lock_guard lock(mutex);
  if (!submit()) {
    return false;
  }
  return dolly_gpu_wait(gpu_) >= 0;
}

bool WGPUDevice::read_buffer(uint64_t buffer, uint64_t offset, uint64_t size, void *r_data)
{
  std::lock_guard lock(mutex);
  if (!submit()) {
    return false;
  }
  uint8_t *p = object(DOLLY_GPU_MAP_READ, 32);
  wgpu_put64(p, 8, buffer);
  wgpu_put64(p, 16, offset);
  wgpu_put64(p, 24, size);
  if (!submit()) {
    return false;
  }
  bool ok = true;
  for (uint64_t done = 0; done < size && ok;) {
    const uint64_t n = std::min<uint64_t>(size - done, DOLLY_GPU_REPLY_BYTES);
    ok = dolly_gpu_read(gpu_, buffer, done, n) == int(n);
    if (ok) {
      memcpy(static_cast<uint8_t *>(r_data) + done, gpu_->reply, n);
    }
    done += n;
  }
  p = object(DOLLY_GPU_UNMAP, 16);
  wgpu_put64(p, 8, buffer);
  return submit() && ok;
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Backend
 * \{ */

WGPUBackend::WGPUBackend()
{
  GPG.init(GPU_DEVICE_ANY,
           GPU_OS_UNIX,
           GPU_DRIVER_ANY,
           GPU_SUPPORT_LEVEL_SUPPORTED,
           GPU_BACKEND_WEBGPU,
           "WebGPU",
           "gpu@0",
           "",
           GPU_ARCHITECTURE_IMR);
}

WGPUBackend::~WGPUBackend()
{
  device.close();
  GPG.clear();
}

/* gpu@0 opens only where the browser grants an adapter (ENODEV otherwise), and the backend needs
 * its explicit records. A scope without a surface asks, then closes. */
bool WGPUBackend::is_supported()
{
  WGPUDevice probe;
  if (!probe.open(0, 0)) {
    return false;
  }
  probe.close();
  return true;
}

void WGPUBackend::capabilities_init()
{
  const uint64_t *l = device.limits;
  GCaps.max_texture_size = int(l[WGPU_LIMIT_TEXTURE_2D]);
  GCaps.max_texture_3d_size = int(l[WGPU_LIMIT_TEXTURE_3D]);
  GCaps.max_texture_layers = int(l[WGPU_LIMIT_ARRAY_LAYERS]);
  GCaps.max_buffer_texture_size = 0;
  /* Each of Blender's samplers is a texture and a sampler binding in WebGPU. */
  GCaps.max_textures = int(std::min(l[WGPU_LIMIT_SAMPLED_TEXTURES], l[WGPU_LIMIT_SAMPLERS]));
  GCaps.max_images = int(l[WGPU_LIMIT_STORAGE_TEXTURES]);
  for (int i = 0; i < 3; i++) {
    GCaps.max_work_group_count[i] = int(l[WGPU_LIMIT_WORKGROUPS]);
  }
  GCaps.max_work_group_size[0] = int(l[WGPU_LIMIT_WORKGROUP_X]);
  GCaps.max_work_group_size[1] = int(l[WGPU_LIMIT_WORKGROUP_Y]);
  GCaps.max_work_group_size[2] = int(l[WGPU_LIMIT_WORKGROUP_Z]);
  GCaps.max_uniforms_vert = GCaps.max_uniforms_frag = 1024;
  GCaps.max_batch_indices = 1 << 30;
  GCaps.max_batch_vertices = 1 << 30;
  GCaps.max_vertex_attribs = int(l[WGPU_LIMIT_VERTEX_ATTRIBUTES]);
  GCaps.max_varying_floats = int(l[WGPU_LIMIT_INTER_STAGE]) * 4;
  /* One storage binding a stage holds the push constants. */
  GCaps.max_shader_storage_buffer_bindings = GCaps.max_compute_shader_storage_blocks =
      int(l[WGPU_LIMIT_STORAGE_BUFFERS]) - 1;
  GCaps.max_uniform_buffer_size = size_t(l[WGPU_LIMIT_UNIFORM_BINDING_SIZE]);
  GCaps.max_storage_buffer_size = size_t(l[WGPU_LIMIT_STORAGE_BINDING_SIZE]);
  GCaps.storage_buffer_alignment = size_t(l[WGPU_LIMIT_STORAGE_ALIGNMENT]);
  GCaps.geometry_shader_support = false;
  GCaps.hdr_viewport_support = false;
  GCaps.multi_viewport_support = false;
  GCaps.stencil_export_support = false;
  GCaps.ray_query_support = false;
  GCaps.vertex_pipeline_stores_and_atomics_support = false;
  GCaps.srgb_write_direct_support = true;
  GCaps.srgb_write_view_support = false;
  GCaps.texture_pool_workaround = true;
  /* Shaders are compiled where they are asked for: the device's records are the main thread's. */
  GCaps.use_main_context_workaround = true;
  GCaps.max_parallel_compilations = 0;
  GCaps.mem_stats_support = false;
  GCaps.extensions_len = 0;
  GCaps.extension_get = [](int) -> const char * { return ""; };
}

void WGPUBackend::init_resources()
{
  compiler_ = MEM_new<ShaderCompiler>(__func__, 0, GPUWorker::ContextType::Main);
}

void WGPUBackend::delete_resources()
{
  MEM_delete(compiler_);
  compiler_ = nullptr;
}

void WGPUBackend::compute_dispatch(int groups_x_len, int groups_y_len, int groups_z_len)
{
  WGPUContext::get()->dispatch(groups_x_len, groups_y_len, groups_z_len, nullptr);
}

void WGPUBackend::compute_dispatch_indirect(StorageBuf *indirect_buf)
{
  WGPUContext::get()->dispatch(0, 0, 0, static_cast<WGPUStorageBuf *>(indirect_buf));
}

/* The first context opens the scope: a window's with its surface at the window's size. */
Context *WGPUBackend::context_alloc(GHOST_IWindow *ghost_window, GHOST_IContext *ghost_context)
{
  uint32_t width = 0, height = 0;
  if (ghost_context) {
    ghost_context->getWebGPUSurfaceSize(width, height);
  }
  if (!device.is_open()) {
    if (!device.open(width ? width : 64, height ? height : 64)) {
      return nullptr;
    }
    capabilities_init();
  }
  WGPUContext *context = new WGPUContext(ghost_window, ghost_context, width, height);
  if (ghost_context && width) {
    ghost_context->setWebGPUSwapBuffersCallback([context]() { context->present(); });
  }
  return context;
}

Batch *WGPUBackend::batch_alloc()
{
  return new WGPUBatch();
}

Fence *WGPUBackend::fence_alloc()
{
  return new WGPUFence();
}

WorkInFlight *WGPUBackend::work_in_flight_alloc(unsigned int /*max_in_flight*/)
{
  return nullptr;
}

FrameBuffer *WGPUBackend::framebuffer_alloc(const char *name)
{
  return new WGPUFrameBuffer(name);
}

IndexBuf *WGPUBackend::indexbuf_alloc()
{
  return new WGPUIndexBuf();
}

PixelBuffer *WGPUBackend::pixelbuf_alloc(size_t size)
{
  return new WGPUPixelBuffer(size);
}

QueryPool *WGPUBackend::querypool_alloc()
{
  return new WGPUQueryPool();
}

Shader *WGPUBackend::shader_alloc(const char *name)
{
  return new WGPUShader(name);
}

Texture *WGPUBackend::texture_alloc(const char *name)
{
  return new WGPUTexture(name);
}

TexturePool *WGPUBackend::texturepool_alloc()
{
  return new TexturePoolImpl();
}

UniformBuf *WGPUBackend::uniformbuf_alloc(size_t size, const char *name)
{
  return new WGPUUniformBuf(size, name);
}

StorageBuf *WGPUBackend::storagebuf_alloc(size_t size, GPUUsageType usage, const char *name)
{
  return new WGPUStorageBuf(size, usage, name);
}

VertBuf *WGPUBackend::vertbuf_alloc()
{
  return new WGPUVertBuf();
}

void WGPUBackend::render_step(bool /*force_resource_release*/) {}

/** \} */

}  // namespace blender::gpu
