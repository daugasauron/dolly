/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * Buffers on gpu@0: vertex, index, uniform and storage buffers, each one gpu@0 buffer with every
 * usage Blender may give it (a vertex buffer is also read as storage by polylines and the draw
 * manager).
 */

#pragma once

#include "GPU_index_buffer.hh"
#include "GPU_vertex_buffer.hh"

#include "gpu_storage_buffer_private.hh"
#include "gpu_uniform_buffer_private.hh"

#include <cstdint>

namespace blender::gpu {

/** One gpu@0 buffer and whether the encoder being recorded uses it. */
struct WGPUBuffer {
  uint64_t handle = 0;
  uint64_t size = 0;
  uint64_t used_in = 0;

  /** A buffer of at least size bytes, its content lost when it grows. */
  void ensure(uint64_t size, uint32_t usage);
  void free();
  /** Ordered with the commands recorded so far: a queue write, or a staged copy in the encoder
   * when they use the buffer. */
  void write(uint64_t offset, const void *data, uint64_t size);
  void clear(uint32_t value);
  void copy_from(WGPUBuffer &source, uint64_t source_offset, uint64_t offset, uint64_t size);
  /** Waits for the GPU. */
  bool read(uint64_t offset, uint64_t size, void *r_data);
  /** Marks the buffer as read or written by the encoder being recorded. */
  void use();
};

/** Every usage a buffer of Blender's may need. */
uint32_t wgpu_buffer_usage_all();

class WGPUVertBuf : public VertBuf {
 public:
  WGPUBuffer buffer;

  ~WGPUVertBuf() override;
  void bind_as_ssbo(uint binding) override;
  void bind_as_texture(uint binding) override;
  void wrap_handle(uint64_t /*handle*/) override {}
  void update_sub(uint start, uint len, const void *data) override;
  void copy_sub(VertBuf &source_buf,
                uint source_first_vertex,
                uint dest_first_vertex,
                uint vertex_len) override;
  void read(void *data) const override;
  /** The buffer as drawn: uploaded. */
  WGPUBuffer &ensure_uploaded();

 protected:
  void acquire_data() override;
  void resize_data() override;
  void release_data() override;
  void upload_data() override;
};

class WGPUIndexBuf : public IndexBuf {
 public:
  WGPUBuffer buffer;

  ~WGPUIndexBuf() override;
  void upload_data() override;
  void bind_as_ssbo(uint binding) override;
  void read(uint32_t *data) const override;
  void update_sub(uint start, uint len, const void *data) override;
  void copy_sub(IndexBuf &source_buf,
                uint source_first_index,
                uint dest_first_index,
                uint index_len) override;
  /** The buffer that holds the indices, a sub-range's source's, uploaded. */
  WGPUBuffer &ensure_uploaded();

 private:
  void strip_restart_indices() override;
};

class WGPUUniformBuf : public UniformBuf {
 public:
  WGPUBuffer buffer;

  WGPUUniformBuf(size_t size, const char *name) : UniformBuf(size, name) {}
  ~WGPUUniformBuf() override;
  void update(const void *data) override;
  void clear_to_zero() override;
  void bind(int slot) override;
  void bind_as_ssbo(int slot) override;
  void unbind() override;
  /** The buffer as bound: data attached before the first use uploaded. */
  WGPUBuffer &ensure_uploaded();
};

class WGPUStorageBuf : public StorageBuf {
 public:
  WGPUBuffer buffer;

  WGPUStorageBuf(size_t size, GPUUsageType usage, const char *name);
  ~WGPUStorageBuf() override;
  void update(const void *data) override;
  void bind(int slot) override;
  void unbind() override;
  void clear(uint32_t clear_value) override;
  void copy_sub(VertBuf *src, uint dst_offset, uint src_offset, uint copy_size) override;
  void read(void *data) override;
  void async_flush_to_host() override {}
  void sync_as_indirect_buffer() override {}
  WGPUBuffer &ensure_allocated();
};

}  // namespace blender::gpu
