/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * Textures, their views and samplers on gpu@0. A texture's rows are as OpenGL and Vulkan keep
 * them (spirv-wgsl negates the vertex stage's y, so WebGPU draws in Vulkan's row order); only
 * the window's frame is turned upright, as it is presented.
 */

#pragma once

#include "BLI_map.hh"

#include "gpu_texture_private.hh"

#include <cstdint>

namespace blender::gpu {

/** gpu@0's texture format for one of Blender's as the device stores it, or 0 for none. */
uint32_t wgpu_texture_format(TextureFormat format);
/** The format the device stores a format in: a four-component one for three. */
TextureFormat wgpu_device_format(TextureFormat format);
bool wgpu_format_is_renderable(uint32_t gpu_format);
/** Whether a gpu@0 format holds integers, which no blend or filter takes. */
bool wgpu_format_is_integer(uint32_t gpu_format);
/** A sampler of gpu@0 for a state, made once. */
uint64_t wgpu_sampler(GPUSamplerState state, bool filterable);

class WGPUTexture : public Texture {
 public:
  /** The submission whose encoder last drew into or read the texture. */
  uint64_t used_in = 0;

  WGPUTexture(const char *name) : Texture(name) {}
  ~WGPUTexture() override;

  void generate_mipmap() override;
  void copy_to(Texture *tex, IndexRange mip_levels) override;
  void clear(const double4 data) override;
  void swizzle_set(const char swizzle_mask[4]) override;
  void read(int mip, eGPUDataFormat format, void *dst) override;
  void update_sub(int mip,
                  int offset[3],
                  int extent[3],
                  eGPUDataFormat format,
                  const void *data,
                  uint unpack_row_length = 0) override;
  void update_sub(int offset[3],
                  int extent[3],
                  eGPUDataFormat format,
                  GPUPixelBuffer *pixbuf) override;

  /** The gpu@0 texture, a view's source's. */
  uint64_t handle() const;
  uint32_t gpu_format() const
  {
    return gpu_format_;
  }
  /** The view shaders sample, as Blender's type, mips and layers of it say. */
  uint64_t sampled_view();
  /** The view shaders store into: one mip. */
  uint64_t storage_view();
  /** A view of one mip and layer to draw into: an sRGB texture's linear one where Blender
   * binds its framebuffer without sRGB, as the Vulkan backend's unorm view. */
  uint64_t attachment_view(int mip, int layer, bool srgb = true);
  uint32_t attachment_format(bool srgb) const;
  bool is_depth() const;
  bool has_stencil() const;
  /** Whether a sampler filters this format: floats and normalized, not integers or depth. */
  bool is_filterable() const;
  /** A texture is zero until drawn or written; a clear of it is a render pass. */
  bool is_renderable() const
  {
    return renderable_;
  }

 protected:
  bool init_internal() override;
  bool init_internal(VertBuf *vbo) override;
  bool init_internal(gpu::Texture *src, bool use_stencil) override;

 private:
  uint64_t handle_ = 0;
  uint32_t gpu_format_ = 0;
  TextureFormat device_format_ = TextureFormat::Invalid;
  bool renderable_ = false;
  bool use_stencil_ = false;
  /** gpu@0's swizzle bytes: red, green, blue, alpha, each 0 r, 1 g, 2 b, 3 a, 4 zero, 5 one. */
  uint32_t swizzle_ = 0x03020100;
  Map<uint64_t, uint64_t> views_;

  WGPUTexture *source() const
  {
    return source_texture_ ? static_cast<WGPUTexture *>(source_texture_) : nullptr;
  }
  uint64_t view(uint32_t dimension, uint32_t aspect, int mip, int mips, int layer, int layers,
                uint32_t swizzle, uint32_t format = 0);
  void upload(int mip, int3 offset, int3 extent, int layer, int layers, const uint8_t *data);
};

class WGPUPixelBuffer : public PixelBuffer {
 public:
  WGPUPixelBuffer(size_t size);
  ~WGPUPixelBuffer() override;
  void *map() override
  {
    return data_;
  }
  void unmap() override {}
  GPUPixelBufferNativeHandle get_native_handle() override
  {
    return {};
  }
  size_t get_size() override
  {
    return size_;
  }
  const void *data() const
  {
    return data_;
  }

 private:
  void *data_ = nullptr;
};

}  // namespace blender::gpu
