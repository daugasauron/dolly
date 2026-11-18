/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * A context's state, its passes and draws. Every context records into the backend's one scope;
 * a context that is not current has no pass open.
 */

#pragma once

#include "BLI_map.hh"
#include "BLI_vector.hh"

#include "GHOST_IContext.hh"
#include "GHOST_IWindow.hh"

#include "gpu_context_private.hh"
#include "gpu_query.hh"
#include "gpu_shader_create_info.hh"
#include "gpu_state_private.hh"

#include <cstdint>
#include <string>

namespace blender::gpu {

class WGPUFrameBuffer;
class WGPUShader;
class WGPUStorageBuf;
class WGPUTexture;
struct WGPUBuffer;

/** Bindings as Blender sets them, read when a draw or dispatch makes its bind group. */
class WGPUStateManager : public StateManager {
 public:
  static constexpr int TEXTURE_UNITS = 64, UNIFORM_SLOTS = 32, STORAGE_SLOTS = 32;
  struct TextureBinding {
    WGPUTexture *texture = nullptr;
    GPUSamplerState sampler = GPUSamplerState::default_sampler();
  };
  struct StorageBinding {
    WGPUBuffer *buffer = nullptr;
    uint64_t offset = 0;
  };
  TextureBinding textures[TEXTURE_UNITS];
  WGPUTexture *images[GPU_MAX_IMAGE] = {};
  WGPUBuffer *uniforms[UNIFORM_SLOTS] = {};
  StorageBinding storage[STORAGE_SLOTS];

  void apply_state() override {}
  void force_state() override {}
  void issue_barrier(GPUBarrier /*barrier_bits*/) override {}
  void texture_bind(Texture *tex, GPUSamplerState sampler, int unit) override;
  void texture_unbind(Texture *tex) override;
  void texture_unbind_all() override;
  void image_bind(Texture *tex, int unit) override;
  void image_unbind(Texture *tex) override;
  void image_unbind_all() override;

  void uniform_bind(int slot, WGPUBuffer *buffer);
  void storage_bind(int slot, WGPUBuffer *buffer, uint64_t offset);
  /** A buffer freed: no binding names it. */
  void buffer_unbind(WGPUBuffer *buffer);
  void texture_forget(WGPUTexture *texture);
};

/** What a batch or immediate mode draws: buffers as WebGPU's vertex state lays them out. */
struct WGPUVertexLayout {
  struct Buffer {
    uint32_t stride = 0, step = 0;
  };
  struct Attribute {
    uint32_t slot = 0, location = 0, format = 0, offset = 0;
  };
  Vector<Buffer, 8> buffers;
  Vector<Attribute, 16> attributes;
  uint64_t hash() const;
};

struct WGPUDraw {
  struct Bound {
    uint64_t buffer = 0, offset = 0, size = 0;
  };
  GPUPrimType primitive = GPU_PRIM_TRIS;
  WGPUVertexLayout layout;
  Vector<Bound, 8> vertex_buffers;
  /** gpu@0's index formats: 0 none, 1 uint16, 2 uint32. */
  uint32_t index_format = 0;
  Bound index;
  uint32_t count = 0, instances = 1, first = 0, first_instance = 0;
  int32_t base_vertex = 0;
  /** An indirect draw's arguments. */
  WGPUBuffer *indirect = nullptr;
  uint64_t indirect_offset = 0;
};

class WGPUContext : public Context {
 public:
  shader::SpecializationConstants constants;

  WGPUContext(GHOST_IWindow *ghost_window,
              GHOST_IContext *ghost_context,
              uint32_t width,
              uint32_t height);
  ~WGPUContext() override;

  static WGPUContext *get()
  {
    return static_cast<WGPUContext *>(Context::get());
  }
  WGPUStateManager &wgpu_state()
  {
    return *static_cast<WGPUStateManager *>(state_manager);
  }

  void activate() override;
  void deactivate() override;
  void begin_frame() override {}
  void end_frame() override {}
  void flush() override;
  void finish() override;
  void memory_statistics_get(int *r_total_mem, int *r_free_mem) override;
  bool debug_capture_begin(const char * /*title*/) override
  {
    return false;
  }
  void debug_capture_end() override {}
  void *debug_capture_scope_create(const char * /*name*/) override
  {
    return nullptr;
  }
  bool debug_capture_scope_begin(void * /*scope*/) override
  {
    return false;
  }
  void debug_capture_scope_end(void * /*scope*/) override {}
  void debug_unbind_all_ubo() override;
  void debug_unbind_all_ssbo() override;

  /** The window's frame onto the page's surface, upright, then the encoder submitted. */
  void present();

  /** Ends the open pass, render or compute: the encoder is outside passes. */
  void passes_end();
  /** Ends any pass and begins the framebuffer's, with the clears it was asked for. */
  void render_pass_begin(WGPUFrameBuffer &framebuffer);
  void framebuffer_forget(WGPUFrameBuffer *framebuffer);

  void draw(const WGPUDraw &draw);
  /** A compute dispatch of the bound shader, or of its indirect arguments. */
  void dispatch(int x, int y, int z, WGPUStorageBuf *indirect);

  /** A clear inside the scissor: a draw writing the values. */
  void clear_draw(WGPUFrameBuffer &framebuffer,
                  bool color,
                  const double4 colors[],
                  bool depth,
                  float depth_value,
                  bool stencil,
                  uint32_t stencil_value);
  void clear_texture(WGPUTexture &texture, const double4 color);
  void generate_mipmaps(WGPUTexture &texture);
  void read_region(WGPUTexture &texture,
                   int mip,
                   int layer,
                   const int area[4],
                   eGPUDataFormat format,
                   void *r_data);
  void copy_region(WGPUTexture &source,
                   int source_mip,
                   int source_layer,
                   WGPUTexture &destination,
                   int destination_mip,
                   int destination_layer,
                   int x,
                   int y,
                   int width,
                   int height);

 private:
  GHOST_IContext *ghost_context_;
  uint32_t width_, height_;
  Texture *back_buffer_ = nullptr;

  /* The open pass: which, and what it has set. */
  WGPUFrameBuffer *pass_framebuffer_ = nullptr;
  bool compute_pass_ = false;
  uint64_t pass_pipeline_ = 0, pass_group_ = 0;
  uint32_t pass_group_offset_ = ~0u;
  float pass_viewport_[4] = {};
  uint32_t pass_scissor_[4] = {};
  uint32_t pass_stencil_reference_ = ~0u;
  WGPUDraw::Bound pass_vertex_[8];
  WGPUDraw::Bound pass_index_;

  /* Pipelines of the backend's own WGSL: present, clears, mipmaps. */
  struct Internal {
    uint64_t layout = 0, pipeline_layout = 0, shader = 0;
  };
  Internal blit_, clear_;
  Map<uint64_t, uint64_t> internal_pipelines_;
  uint64_t present_group_ = 0, clear_group_ = 0;

  void render_pass_ensure(WGPUFrameBuffer &framebuffer);
  void pass_state_reset();
  void set_pipeline(uint64_t pipeline);
  void set_group(uint64_t group, uint32_t offset);
  void set_viewport(WGPUFrameBuffer &framebuffer);
  void internal_init();
  uint64_t blit_pipeline(uint32_t format, bool upright);
  uint64_t clear_pipeline(WGPUFrameBuffer &framebuffer, bool color, bool depth, bool stencil);
  uint64_t group(uint64_t layout, uint64_t view, uint64_t sampler);
};

class WGPUFence : public Fence {
 public:
  void signal() override
  {
    signalled_ = true;
  }
  void wait() override;
};

/** Occlusion queries are not given: every query reports one sample, so nothing is culled. */
class WGPUQueryPool : public QueryPool {
 public:
  void init(GPUQueryType /*type*/) override {}
  void begin_query() override
  {
    queries_++;
  }
  void end_query() override {}
  void get_occlusion_result(MutableSpan<uint32_t> r_values) override
  {
    r_values.fill(1);
  }

 private:
  int queries_ = 0;
};

}  // namespace blender::gpu
