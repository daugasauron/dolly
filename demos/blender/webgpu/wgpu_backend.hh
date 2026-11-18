/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * The GPU module's backend on Dolly's gpu@0: WebGPU's object model through gpu@0's explicit
 * records (docs/gpu.md in Dolly). Shaders are the Vulkan backend's GLSL, compiled to SPIR-V by
 * glslang and translated to WGSL by Dolly's spirv-wgsl, as Godot's Dolly port compiles its own.
 */

#pragma once

#include "gpu_backend.hh"
#include "wgpu_device.hh"

namespace blender::gpu {

class WGPUBackend : public GPUBackend {
 public:
  WGPUBackend();
  ~WGPUBackend() override;

  /** Whether gpu@0 opens: the browser granted a WebGPU device with the explicit records. */
  static bool is_supported();

  void init_resources() override;
  void delete_resources() override;

  void compute_dispatch(int groups_x_len, int groups_y_len, int groups_z_len) override;
  void compute_dispatch_indirect(StorageBuf *indirect_buf) override;

  Context *context_alloc(GHOST_IWindow *ghost_window, GHOST_IContext *ghost_context) override;

  Batch *batch_alloc() override;
  Fence *fence_alloc() override;
  WorkInFlight *work_in_flight_alloc(unsigned int max_in_flight) override;
  FrameBuffer *framebuffer_alloc(const char *name) override;
  IndexBuf *indexbuf_alloc() override;
  PixelBuffer *pixelbuf_alloc(size_t size) override;
  QueryPool *querypool_alloc() override;
  Shader *shader_alloc(const char *name) override;
  Texture *texture_alloc(const char *name) override;
  TexturePool *texturepool_alloc() override;
  UniformBuf *uniformbuf_alloc(size_t size, const char *name) override;
  StorageBuf *storagebuf_alloc(size_t size, GPUUsageType usage, const char *name) override;
  VertBuf *vertbuf_alloc() override;
  TopLevelAS *tlas_alloc(const char * /*name*/) override
  {
    return nullptr;
  }
  BottomLevelAS *blas_alloc(const char * /*name*/) override
  {
    return nullptr;
  }
  void shader_cache_dir_clear_old() override {}

  void render_begin() override {}
  void render_end() override {}
  void render_step(bool force_resource_release = false) override;

  /** The one gpu@0 scope, which every context draws through. */
  WGPUDevice device;

  static WGPUBackend &get()
  {
    return *static_cast<WGPUBackend *>(GPUBackend::get());
  }

 private:
  void capabilities_init();
};

/** The backend's scope. */
inline WGPUDevice &wgpu_device()
{
  return WGPUBackend::get().device;
}

}  // namespace blender::gpu
