/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * The gpu@0 scope every WebGPU context of Blender's shares, and its records.
 *
 * Records go in three lists, sent in this order when the encoder is submitted: objects (creations
 * and queue writes, which gpu@0 does not take inside a pass, and which WebGPU runs before the
 * encoder), the encoder's commands, then releases (an object is released only after the
 * commands that use it). A handle is numbered as its creating record is queued: gpu@0 numbers
 * objects in the order it meets their records.
 *
 * A queue write lands before every command of the encoder it is sent with, so a resource that
 * the current encoder already used is updated through the staging ring and a copy in the encoder
 * (`in_use`); the ring's ranges are each written once per submission.
 */

#pragma once

#include <dolly/gpu.h>

#include <cstdint>
#include <cstring>
#include <mutex>
#include <vector>

namespace blender::gpu {

/* gpu@0's WebGPU buffer usage bits. */
enum : uint32_t {
  WGPU_BUFFER_MAP_READ = 1,
  WGPU_BUFFER_COPY_SRC = 4,
  WGPU_BUFFER_COPY_DST = 8,
  WGPU_BUFFER_INDEX = 16,
  WGPU_BUFFER_VERTEX = 32,
  WGPU_BUFFER_UNIFORM = 64,
  WGPU_BUFFER_STORAGE = 128,
  WGPU_BUFFER_INDIRECT = 256,
};
/* And its texture usage bits. */
enum : uint32_t {
  WGPU_TEXTURE_COPY_SRC = 1,
  WGPU_TEXTURE_COPY_DST = 2,
  WGPU_TEXTURE_SAMPLED = 4,
  WGPU_TEXTURE_STORAGE = 8,
  WGPU_TEXTURE_ATTACHMENT = 16,
};
/* LIMITS' order (Dolly's host/gpu/dolly-gpu-0.wat); index 0 is the feature bits. */
enum : uint32_t {
  WGPU_LIMIT_TEXTURE_1D = 1,
  WGPU_LIMIT_TEXTURE_2D,
  WGPU_LIMIT_TEXTURE_3D,
  WGPU_LIMIT_ARRAY_LAYERS,
  WGPU_LIMIT_BIND_GROUPS,
  WGPU_LIMIT_BINDINGS_PER_GROUP,
  WGPU_LIMIT_DYNAMIC_UNIFORM,
  WGPU_LIMIT_DYNAMIC_STORAGE,
  WGPU_LIMIT_SAMPLED_TEXTURES,
  WGPU_LIMIT_SAMPLERS,
  WGPU_LIMIT_STORAGE_BUFFERS,
  WGPU_LIMIT_STORAGE_TEXTURES,
  WGPU_LIMIT_UNIFORM_BUFFERS,
  WGPU_LIMIT_UNIFORM_BINDING_SIZE,
  WGPU_LIMIT_STORAGE_BINDING_SIZE,
  WGPU_LIMIT_UNIFORM_ALIGNMENT,
  WGPU_LIMIT_STORAGE_ALIGNMENT,
  WGPU_LIMIT_VERTEX_BUFFERS,
  WGPU_LIMIT_BUFFER_SIZE,
  WGPU_LIMIT_VERTEX_ATTRIBUTES,
  WGPU_LIMIT_VERTEX_STRIDE,
  WGPU_LIMIT_INTER_STAGE,
  WGPU_LIMIT_COLOR_ATTACHMENTS,
  WGPU_LIMIT_COLOR_BYTES,
  WGPU_LIMIT_WORKGROUP_STORAGE,
  WGPU_LIMIT_INVOCATIONS,
  WGPU_LIMIT_WORKGROUP_X,
  WGPU_LIMIT_WORKGROUP_Y,
  WGPU_LIMIT_WORKGROUP_Z,
  WGPU_LIMIT_WORKGROUPS,
  WGPU_LIMIT_STORAGE_BUFFERS_VERTEX,
  WGPU_LIMIT_STORAGE_BUFFERS_FRAGMENT,
  WGPU_LIMIT_STORAGE_TEXTURES_VERTEX,
  WGPU_LIMIT_STORAGE_TEXTURES_FRAGMENT,
  WGPU_LIMIT_COUNT,
};
/* LIMITS' feature bits. */
enum : uint64_t {
  WGPU_FEATURE_DEPTH_CLIP_CONTROL = 1,
  WGPU_FEATURE_DEPTH32_STENCIL8 = 2,
  WGPU_FEATURE_BC = 4,
  WGPU_FEATURE_INDIRECT_FIRST_INSTANCE = 16,
  WGPU_FEATURE_RG11B10_RENDERABLE = 64,
  WGPU_FEATURE_FLOAT32_FILTERABLE = 128,
  WGPU_FEATURE_FLOAT32_BLENDABLE = 256,
  WGPU_FEATURE_SWIZZLE = 1024,
  WGPU_FEATURE_TIER1 = 2048,
  WGPU_FEATURE_TIER2 = 4096,
};

inline void wgpu_put16(uint8_t *p, uint32_t at, uint16_t v)
{
  memcpy(p + at, &v, 2);
}
inline void wgpu_put32(uint8_t *p, uint32_t at, uint32_t v)
{
  memcpy(p + at, &v, 4);
}
inline void wgpu_put64(uint8_t *p, uint32_t at, uint64_t v)
{
  memcpy(p + at, &v, 8);
}
inline void wgpu_putf(uint8_t *p, uint32_t at, float v)
{
  memcpy(p + at, &v, 4);
}
inline uint32_t wgpu_padded(uint32_t bytes)
{
  return (bytes + 7) & ~7u;
}

class WGPUDevice {
 public:
  /** Every record list and the scope are the main thread's and the compile threads'. */
  std::recursive_mutex mutex;
  uint64_t limits[WGPU_LIMIT_COUNT] = {};
  /** The surface's format: 1 rgba8unorm or 28 bgra8unorm. */
  uint32_t surface_format = 1;

  /** Opens the scope with a surface of the size given; false where gpu@0 grants no device. */
  bool open(uint32_t width, uint32_t height);
  void close();
  bool is_open() const
  {
    return gpu_ != nullptr;
  }
  bool has_feature(uint64_t feature) const
  {
    return limits[0] & feature;
  }

  /** A record creating an object; its handle is put at offset 8 and returned. */
  uint8_t *create(uint32_t op, uint32_t bytes, uint64_t &r_handle);
  /** A record in the object list that creates nothing (a queue write). */
  uint8_t *object(uint32_t op, uint32_t bytes);
  /** A record of the encoder. */
  uint8_t *command(uint32_t op, uint32_t bytes);
  void release(uint64_t handle);

  /** Copies data into a buffer by queue writes, in chunks a packet holds. */
  void write_buffer(uint64_t buffer, uint64_t offset, const void *data, uint64_t size);
  /** Room in the staging ring, written by a queue write now: the ring's buffer and offset. */
  uint64_t stage(const void *data, uint64_t size, uint64_t alignment, uint64_t &r_buffer);
  uint64_t ring_buffer() const
  {
    return ring_;
  }

  /** The encoder being recorded: a resource whose `used_in` is it was used by its commands. */
  uint64_t submission() const
  {
    return submission_;
  }
  bool in_use(uint64_t used_in) const
  {
    return used_in == submission_;
  }
  /** Sends every list and submits the encoder, its open pass ended first by this. */
  bool submit();
  void (*end_passes)() = nullptr;
  /** Submits, then waits until the GPU finished. */
  bool wait_idle();
  /** Reads a range of a MAP_READ buffer after the GPU finished writing it. */
  bool read_buffer(uint64_t buffer, uint64_t offset, uint64_t size, void *r_data);

  /** Objects alive in the scope, against its quota. */
  uint64_t objects() const
  {
    return objects_alive_;
  }

 private:
  dolly_gpu *gpu_ = nullptr;
  std::vector<uint8_t> objects_, commands_, releases_;
  uint64_t next_handle_ = 0;
  uint64_t submission_ = 1;
  uint64_t objects_alive_ = 0;
  uint64_t ring_ = 0, ring_cursor_ = 0;

  uint8_t *append(std::vector<uint8_t> &list, uint32_t op, uint32_t bytes);
  bool send_list(const std::vector<uint8_t> &list);
  bool send(bool more);
};

}  // namespace blender::gpu
