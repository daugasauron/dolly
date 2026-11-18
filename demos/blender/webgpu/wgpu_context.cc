/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_context.hh"
#include "wgpu_backend.hh"
#include "wgpu_batch.hh"
#include "wgpu_buffer.hh"
#include "wgpu_framebuffer.hh"
#include "wgpu_shader.hh"
#include "wgpu_texture.hh"

#include "GPU_texture.hh"

#include "vk_data_conversion.hh"

#include "CLG_log.h"

#include <algorithm>
#include <string>
#include <vector>

namespace blender::gpu {

static CLG_LogRef LOG = {"gpu.webgpu"};

/* -------------------------------------------------------------------- */
/** \name Bindings
 * \{ */

void WGPUStateManager::texture_bind(Texture *tex, GPUSamplerState sampler, int unit)
{
  if (unit >= 0 && unit < TEXTURE_UNITS) {
    textures[unit] = {static_cast<WGPUTexture *>(tex), sampler};
  }
}

void WGPUStateManager::texture_unbind(Texture *tex)
{
  for (TextureBinding &binding : textures) {
    if (binding.texture == tex) {
      binding.texture = nullptr;
    }
  }
}

void WGPUStateManager::texture_unbind_all()
{
  for (TextureBinding &binding : textures) {
    binding.texture = nullptr;
  }
}

void WGPUStateManager::image_bind(Texture *tex, int unit)
{
  if (unit >= 512) {
    unit -= 512;
  }
  if (unit >= 0 && unit < GPU_MAX_IMAGE) {
    images[unit] = static_cast<WGPUTexture *>(tex);
  }
}

void WGPUStateManager::image_unbind(Texture *tex)
{
  for (WGPUTexture *&image : images) {
    if (image == tex) {
      image = nullptr;
    }
  }
}

void WGPUStateManager::image_unbind_all()
{
  for (WGPUTexture *&image : images) {
    image = nullptr;
  }
}

void WGPUStateManager::uniform_bind(int slot, WGPUBuffer *buffer)
{
  if (slot >= 0 && slot < UNIFORM_SLOTS) {
    uniforms[slot] = buffer;
  }
}

void WGPUStateManager::storage_bind(int slot, WGPUBuffer *buffer, uint64_t offset)
{
  if (slot >= 0 && slot < STORAGE_SLOTS) {
    storage[slot] = {buffer, offset};
  }
}

void WGPUStateManager::buffer_unbind(WGPUBuffer *buffer)
{
  for (WGPUBuffer *&uniform : uniforms) {
    if (uniform == buffer) {
      uniform = nullptr;
    }
  }
  for (StorageBinding &binding : storage) {
    if (binding.buffer == buffer) {
      binding.buffer = nullptr;
    }
  }
}

void WGPUStateManager::texture_forget(WGPUTexture *texture)
{
  texture_unbind(texture);
  image_unbind(texture);
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Context
 * \{ */

WGPUContext::WGPUContext(GHOST_IWindow *ghost_window,
                         GHOST_IContext *ghost_context,
                         uint32_t width,
                         uint32_t height)
    : ghost_context_(ghost_context), width_(width), height_(height)
{
  ghost_window_ = ghost_window;
  state_manager = new WGPUStateManager();
  imm = new WGPUImmediate();
  back_left = new WGPUFrameBuffer("back_left");
  front_left = new WGPUFrameBuffer("front_left");
  active_fb = back_left;
}

WGPUContext::~WGPUContext()
{
  passes_end();
  if (back_buffer_) {
    back_left->attachment_remove(GPU_FB_COLOR_ATTACHMENT0);
    front_left->attachment_remove(GPU_FB_COLOR_ATTACHMENT0);
    GPU_texture_free(back_buffer_);
  }
  delete imm;
  imm = nullptr;
  delete back_left;
  delete front_left;
  back_left = front_left = nullptr;
}

void WGPUContext::activate()
{
  is_active_ = true;
  /* The window's frame: a texture the size of the page's surface, presented upright, made again
   * when the window follows the page to another size. */
  uint32_t width = width_, height = height_;
  if (ghost_context_ && width_) {
    ghost_context_->getWebGPUSurfaceSize(width, height);
  }
  if (back_buffer_ && (width != width_ || height != height_)) {
    passes_end();
    back_left->attachment_remove(GPU_FB_COLOR_ATTACHMENT0);
    front_left->attachment_remove(GPU_FB_COLOR_ATTACHMENT0);
    GPU_texture_free(back_buffer_);
    back_buffer_ = nullptr;
    if (present_group_) {
      WGPUDevice &device = wgpu_device();
      std::lock_guard lock(device.mutex);
      device.release(present_group_);
      present_group_ = 0;
    }
  }
  width_ = width;
  height_ = height;
  if (width_ && back_buffer_ == nullptr) {
    back_buffer_ = GPU_texture_create_2d("back_left",
                                                int(width_),
                                                int(height_),
                                                1,
                                                TextureFormat::UNORM_8_8_8_8,
                                                GPU_TEXTURE_USAGE_ATTACHMENT |
                                                    GPU_TEXTURE_USAGE_SHADER_READ,
                                                nullptr);
    back_left->attachment_set(GPU_FB_COLOR_ATTACHMENT0, GPU_ATTACHMENT_TEXTURE(back_buffer_));
    front_left->attachment_set(GPU_FB_COLOR_ATTACHMENT0, GPU_ATTACHMENT_TEXTURE(back_buffer_));
    back_left->bind(false);
  }
  immActivate();
}

void WGPUContext::deactivate()
{
  passes_end();
  immDeactivate();
  is_active_ = false;
}

void WGPUContext::flush()
{
  passes_end();
  wgpu_device().submit();
}

void WGPUContext::finish()
{
  passes_end();
  wgpu_device().wait_idle();
}

void WGPUContext::memory_statistics_get(int *r_total_mem, int *r_free_mem)
{
  *r_total_mem = 0;
  *r_free_mem = 0;
}

void WGPUContext::debug_unbind_all_ubo()
{
  for (WGPUBuffer *&uniform : wgpu_state().uniforms) {
    uniform = nullptr;
  }
}

void WGPUContext::debug_unbind_all_ssbo()
{
  for (WGPUStateManager::StorageBinding &binding : wgpu_state().storage) {
    binding.buffer = nullptr;
  }
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Passes
 * \{ */

void WGPUContext::pass_state_reset()
{
  pass_pipeline_ = 0;
  pass_group_ = 0;
  pass_group_offset_ = ~0u;
  pass_stencil_reference_ = ~0u;
  for (WGPUDraw::Bound &bound : pass_vertex_) {
    bound = {};
  }
  pass_index_ = {};
  pass_viewport_[2] = -1.0f;
}

void WGPUContext::passes_end()
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  if (pass_framebuffer_) {
    device.command(DOLLY_GPU_END_RENDER_PASS, 8);
    pass_framebuffer_ = nullptr;
  }
  if (compute_pass_) {
    device.command(DOLLY_GPU_END_COMPUTE_PASS, 8);
    compute_pass_ = false;
  }
  pass_state_reset();
}

void WGPUContext::render_pass_begin(WGPUFrameBuffer &framebuffer)
{
  passes_end();
  framebuffer.begin_pass();
  pass_framebuffer_ = &framebuffer;
}

void WGPUContext::render_pass_ensure(WGPUFrameBuffer &framebuffer)
{
  if (pass_framebuffer_ != &framebuffer) {
    render_pass_begin(framebuffer);
  }
}

void WGPUContext::framebuffer_forget(WGPUFrameBuffer *framebuffer)
{
  if (pass_framebuffer_ == framebuffer) {
    passes_end();
  }
  if (active_fb == framebuffer) {
    active_fb = nullptr;
  }
}

void WGPUContext::set_pipeline(uint64_t pipeline)
{
  if (pipeline == pass_pipeline_) {
    return;
  }
  uint8_t *p = wgpu_device().command(DOLLY_GPU_SET_PIPELINE, 16);
  wgpu_put64(p, 8, pipeline);
  pass_pipeline_ = pipeline;
}

void WGPUContext::set_group(uint64_t group, uint32_t offset)
{
  if (group == pass_group_ && offset == pass_group_offset_) {
    return;
  }
  uint8_t *p = wgpu_device().command(DOLLY_GPU_SET_BIND_GROUP, 32);
  wgpu_put64(p, 8, group);
  wgpu_put32(p, 16, 0);
  wgpu_put32(p, 20, 1);
  wgpu_put32(p, 24, offset);
  pass_group_ = group;
  pass_group_offset_ = offset;
}

void WGPUContext::set_viewport(WGPUFrameBuffer &framebuffer)
{
  float viewport[4];
  uint32_t scissor[4];
  framebuffer.viewport_scissor(viewport, scissor);
  if (memcmp(viewport, pass_viewport_, sizeof(viewport)) == 0 &&
      memcmp(scissor, pass_scissor_, sizeof(scissor)) == 0)
  {
    return;
  }
  uint8_t *p = wgpu_device().command(DOLLY_GPU_VIEWPORT, 48);
  for (int i = 0; i < 4; i++) {
    wgpu_putf(p, 8 + 4 * i, viewport[i]);
    wgpu_put32(p, 32 + 4 * i, scissor[i]);
  }
  wgpu_putf(p, 24, 0.0f);
  wgpu_putf(p, 28, 1.0f);
  memcpy(pass_viewport_, viewport, sizeof(viewport));
  memcpy(pass_scissor_, scissor, sizeof(scissor));
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Draws and dispatches
 * \{ */

void WGPUContext::draw(const WGPUDraw &draw)
{
  WGPUShader *wgpu_shader = static_cast<WGPUShader *>(shader);
  WGPUFrameBuffer *framebuffer = static_cast<WGPUFrameBuffer *>(active_fb);
  if (wgpu_shader == nullptr || framebuffer == nullptr || !wgpu_shader->ready()) {
    return;
  }
  framebuffer->update_size();
  if (framebuffer->width() <= 0 || framebuffer->height() <= 0) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  /* Objects and uploads first: an upload of a resource in use ends the pass. */
  uint32_t push_offset;
  const uint64_t group = wgpu_shader->bind_group(*this, push_offset);
  const uint64_t pipeline = wgpu_shader->render_pipeline(wgpu_state().state,
                                                         wgpu_state().mutable_state,
                                                         draw.primitive,
                                                         draw.layout,
                                                         *framebuffer,
                                                         constants);
  if (group == 0 || pipeline == 0) {
    return;
  }
  if (draw.indirect) {
    draw.indirect->use();
  }
  render_pass_ensure(*framebuffer);
  set_pipeline(pipeline);
  set_group(group, push_offset);
  set_viewport(*framebuffer);
  if (framebuffer->has_stencil() && wgpu_state().state.stencil_test != GPU_STENCIL_NONE &&
      pass_stencil_reference_ != wgpu_state().mutable_state.stencil_reference)
  {
    uint8_t *p = device.command(DOLLY_GPU_SET_STENCIL_REFERENCE, 16);
    wgpu_put32(p, 8, wgpu_state().mutable_state.stencil_reference);
    pass_stencil_reference_ = wgpu_state().mutable_state.stencil_reference;
  }
  for (const int slot : draw.vertex_buffers.index_range()) {
    const WGPUDraw::Bound &bound = draw.vertex_buffers[slot];
    WGPUDraw::Bound &set = pass_vertex_[slot];
    if (set.buffer == bound.buffer && set.offset == bound.offset && set.size == bound.size) {
      continue;
    }
    uint8_t *p = device.command(DOLLY_GPU_SET_VERTEX_BUFFER, 40);
    wgpu_put64(p, 8, bound.buffer);
    wgpu_put32(p, 16, uint32_t(slot));
    wgpu_put64(p, 24, bound.offset);
    wgpu_put64(p, 32, bound.size);
    set = bound;
  }
  if (draw.index_format) {
    if (pass_index_.buffer != draw.index.buffer || pass_index_.offset != draw.index_format) {
      uint8_t *p = device.command(DOLLY_GPU_SET_INDEX_BUFFER, 40);
      wgpu_put64(p, 8, draw.index.buffer);
      wgpu_put32(p, 16, draw.index_format);
      wgpu_put64(p, 24, 0);
      wgpu_put64(p, 32, draw.index.size);
      pass_index_ = {draw.index.buffer, draw.index_format, draw.index.size};
    }
  }
  if (draw.indirect) {
    uint8_t *p = device.command(
        draw.index_format ? DOLLY_GPU_DRAW_INDEXED_INDIRECT : DOLLY_GPU_DRAW_INDIRECT, 24);
    wgpu_put64(p, 8, draw.indirect->handle);
    wgpu_put64(p, 16, draw.indirect_offset);
    return;
  }
  if (draw.index_format) {
    uint8_t *p = device.command(DOLLY_GPU_DRAW_INDEXED, 32);
    wgpu_put32(p, 8, draw.count);
    wgpu_put32(p, 12, draw.instances);
    wgpu_put32(p, 16, draw.first);
    memcpy(p + 20, &draw.base_vertex, 4);
    wgpu_put32(p, 24, draw.first_instance);
    return;
  }
  uint8_t *p = device.command(DOLLY_GPU_DRAW, 24);
  wgpu_put32(p, 8, draw.count);
  wgpu_put32(p, 12, draw.instances);
  wgpu_put32(p, 16, draw.first);
  wgpu_put32(p, 20, draw.first_instance);
}

void WGPUContext::dispatch(int x, int y, int z, WGPUStorageBuf *indirect)
{
  WGPUShader *wgpu_shader = static_cast<WGPUShader *>(shader);
  if (wgpu_shader == nullptr || !wgpu_shader->ready() || !wgpu_shader->is_compute()) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint32_t push_offset;
  const uint64_t group = wgpu_shader->bind_group(*this, push_offset);
  const uint64_t pipeline = wgpu_shader->compute_pipeline(constants);
  if (group == 0 || pipeline == 0) {
    return;
  }
  WGPUBuffer *arguments = indirect ? &indirect->ensure_allocated() : nullptr;
  if (arguments) {
    arguments->use();
  }
  if (!compute_pass_) {
    passes_end();
    device.command(DOLLY_GPU_BEGIN_COMPUTE_PASS, 8);
    compute_pass_ = true;
  }
  set_pipeline(pipeline);
  set_group(group, push_offset);
  if (arguments) {
    uint8_t *p = device.command(DOLLY_GPU_DISPATCH_INDIRECT, 24);
    wgpu_put64(p, 8, arguments->handle);
    wgpu_put64(p, 16, 0);
    return;
  }
  uint8_t *p = device.command(DOLLY_GPU_DISPATCH, 24);
  wgpu_put32(p, 8, uint32_t(std::max(x, 1)));
  wgpu_put32(p, 12, uint32_t(std::max(y, 1)));
  wgpu_put32(p, 16, uint32_t(std::max(z, 1)));
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name The backend's own pipelines: present, clears, mipmaps
 * \{ */

static const char *BLIT_WGSL = R"(
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;
struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};
fn triangle(i: u32) -> vec2f {
  return vec2f(f32((i << 1u) & 2u), f32(i & 2u));
}
@vertex fn upright(@builtin(vertex_index) i: u32) -> Varyings {
  let uv = triangle(i);
  return Varyings(vec4f(uv * 2.0 - 1.0, 0.0, 1.0), uv);
}
@vertex fn same_rows(@builtin(vertex_index) i: u32) -> Varyings {
  let uv = triangle(i);
  return Varyings(vec4f(uv * 2.0 - 1.0, 0.0, 1.0), vec2f(uv.x, 1.0 - uv.y));
}
@fragment fn sample_source(v: Varyings) -> @location(0) vec4f {
  return textureSampleLevel(source, source_sampler, v.uv, 0.0);
}
)";

void WGPUContext::internal_init()
{
  if (blit_.shader) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  const size_t length = strlen(BLIT_WGSL);
  uint8_t *p = device.create(DOLLY_GPU_CREATE_SHADER, 24 + uint32_t(length), blit_.shader);
  wgpu_put32(p, 16, uint32_t(length));
  memcpy(p + 24, BLIT_WGSL, length);
  p = device.create(DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, 24 + 32 * 2, blit_.layout);
  wgpu_put32(p, 16, 2);
  /* A float texture and a filtering sampler for the fragment stage. */
  wgpu_put32(p, 24, 0);
  wgpu_put32(p, 28, 2);
  wgpu_put32(p, 32, 7);
  wgpu_put32(p, 36, 1);
  wgpu_put32(p, 40, 2);
  wgpu_put32(p, 56, 1);
  wgpu_put32(p, 60, 2);
  wgpu_put32(p, 64, 4);
  p = device.create(DOLLY_GPU_CREATE_PIPELINE_LAYOUT, 32, blit_.pipeline_layout);
  wgpu_put32(p, 16, 1);
  wgpu_put64(p, 24, blit_.layout);
}

/* A pipeline drawing a texture's whole area: upright onto the surface (format 0), or row for row
 * into a mip of a texture. */
uint64_t WGPUContext::blit_pipeline(uint32_t format, bool upright)
{
  internal_init();
  const uint64_t key = (uint64_t(format) << 1) | (upright ? 1 : 0);
  if (const uint64_t *found = internal_pipelines_.lookup_ptr(key)) {
    return *found;
  }
  const char *vertex = upright ? "upright" : "same_rows";
  const char *fragment = "sample_source";
  const uint32_t vs = uint32_t(strlen(vertex)), fs = uint32_t(strlen(fragment));
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t pipeline;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_RENDER_PIPELINE, 160 + 40 + vs + fs, pipeline);
  wgpu_put64(p, 16, blit_.pipeline_layout);
  wgpu_put64(p, 24, blit_.shader);
  wgpu_put64(p, 32, blit_.shader);
  for (const int at : {72, 88}) {
    wgpu_put32(p, at, 8);
  }
  wgpu_put32(p, 104, 0xff);
  wgpu_put32(p, 124, 1);
  wgpu_put32(p, 128, 0xffffffffu);
  wgpu_put32(p, 136, 1);
  wgpu_put32(p, 152, vs);
  wgpu_put32(p, 156, fs);
  wgpu_put32(p, 160, format);
  wgpu_put32(p, 164, 15);
  memcpy(p + 200, vertex, vs);
  memcpy(p + 200 + vs, fragment, fs);
  internal_pipelines_.add(key, pipeline);
  return pipeline;
}

uint64_t WGPUContext::group(uint64_t layout, uint64_t view, uint64_t sampler)
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t group;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_BIND_GROUP, 32 + 64, group);
  wgpu_put64(p, 16, layout);
  wgpu_put32(p, 24, 2);
  wgpu_put32(p, 32, 0);
  wgpu_put32(p, 36, 2);
  wgpu_put64(p, 40, view);
  wgpu_put32(p, 64, 1);
  wgpu_put32(p, 68, 1);
  wgpu_put64(p, 72, sampler);
  return group;
}

void WGPUContext::present()
{
  if (!back_buffer_) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  WGPUTexture &frame = *static_cast<WGPUTexture *>(back_buffer_);
  const uint64_t pipeline = blit_pipeline(0, true);
  if (present_group_ == 0) {
    GPUSamplerState nearest = GPUSamplerState::default_sampler();
    present_group_ = group(blit_.layout, frame.sampled_view(), wgpu_sampler(nearest, true));
  }
  /* The frame's drawing is submitted first, so that the surface's pass and its SUBMIT are one
   * small batch: a batch continued in another packet lets the page show the canvas in between,
   * which expires its texture. */
  device.submit();
  uint8_t *p = device.command(DOLLY_GPU_BEGIN_VIEW_PASS, 64 + 40);
  wgpu_put32(p, 16, 1);
  wgpu_put32(p, 20, width_);
  wgpu_put32(p, 24, height_);
  wgpu_put32(p, 64 + 16, 1);
  wgpu_putf(p, 64 + 36, 1.0f);
  set_pipeline(pipeline);
  p = device.command(DOLLY_GPU_SET_BIND_GROUP, 24);
  wgpu_put64(p, 8, present_group_);
  p = device.command(DOLLY_GPU_DRAW, 24);
  wgpu_put32(p, 8, 3);
  wgpu_put32(p, 12, 1);
  device.command(DOLLY_GPU_END_RENDER_PASS, 8);
  pass_state_reset();
  frame.used_in = device.submission();
  device.submit();
}

/* A clear of the area inside the scissor: a triangle over the attachments that writes the
 * values, with every other test passing. The values are a uniform staged in the ring. */
static std::string clear_wgsl(const uint32_t colors[], uint32_t count)
{
  std::string outputs, writes;
  for (uint32_t i = 0; i < count; i++) {
    const bool sint = ELEM(colors[i], 12, 14, 18, 20, 23, 27, 35, 38, 41);
    const bool uint = ELEM(colors[i], 11, 13, 17, 19, 22, 26, 31, 34, 37, 40);
    const char *type = sint ? "vec4i" : uint ? "vec4u" : "vec4f";
    outputs += "  @location(" + std::to_string(i) + ") c" + std::to_string(i) + ": " + type + ",\n";
    writes += std::string(", ") + type + "(clear.color)";
  }
  std::string wgsl =
      "struct Clear { color: vec4f, depth: f32 };\n"
      "@group(0) @binding(0) var<uniform> clear: Clear;\n"
      "@vertex fn vertex_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {\n"
      "  let uv = vec2f(f32((i << 1u) & 2u), f32(i & 2u));\n"
      "  return vec4f(uv * 2.0 - 1.0, clear.depth, 1.0);\n"
      "}\n";
  if (count) {
    wgsl += "struct Out {\n" + outputs + "};\n";
    wgsl += "@fragment fn fragment_main() -> Out {\n  return Out(" + writes.substr(2) + ");\n}\n";
  }
  else {
    wgsl += "@fragment fn fragment_main() {}\n";
  }
  return wgsl;
}

uint64_t WGPUContext::clear_pipeline(WGPUFrameBuffer &framebuffer, bool color, bool depth, bool stencil)
{
  uint32_t colors[GPU_FB_MAX_COLOR_ATTACHMENT], count, depth_format;
  framebuffer.formats(colors, count, depth_format);
  uint64_t key = 0x5ca1ab1e;
  for (uint32_t i = 0; i < count; i++) {
    key = key * 131 + colors[i];
  }
  key = key * 131 + depth_format;
  key = key * 8 + (color ? 4 : 0) + (depth ? 2 : 0) + (stencil ? 1 : 0);
  if (const uint64_t *found = internal_pipelines_.lookup_ptr(key)) {
    return *found;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  if (clear_.layout == 0) {
    uint8_t *p = device.create(DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, 24 + 32, clear_.layout);
    wgpu_put32(p, 16, 1);
    wgpu_put32(p, 24, 0);
    wgpu_put32(p, 28, 3);
    wgpu_put32(p, 32, 1);
    wgpu_put32(p, 36, 1);
    p = device.create(DOLLY_GPU_CREATE_PIPELINE_LAYOUT, 32, clear_.pipeline_layout);
    wgpu_put32(p, 16, 1);
    wgpu_put64(p, 24, clear_.layout);
    p = device.create(DOLLY_GPU_CREATE_BIND_GROUP, 32 + 32, clear_group_);
    wgpu_put64(p, 16, clear_.layout);
    wgpu_put32(p, 24, 1);
    wgpu_put32(p, 32, 0);
    wgpu_put32(p, 36, 0);
    wgpu_put64(p, 40, device.ring_buffer());
    wgpu_put64(p, 48, 0);
    wgpu_put64(p, 56, 32);
  }
  const std::string wgsl = clear_wgsl(colors, count);
  uint64_t module;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_SHADER, 24 + uint32_t(wgsl.size()), module);
  wgpu_put32(p, 16, uint32_t(wgsl.size()));
  memcpy(p + 24, wgsl.data(), wgsl.size());
  const char *vertex = "vertex_main", *fragment = "fragment_main";
  const uint32_t vs = 11, fs = 13;
  uint64_t pipeline;
  p = device.create(DOLLY_GPU_CREATE_RENDER_PIPELINE, 160 + 40 * count + vs + fs, pipeline);
  wgpu_put64(p, 16, clear_.pipeline_layout);
  wgpu_put64(p, 24, module);
  wgpu_put64(p, 32, module);
  wgpu_put32(p, 60, depth_format);
  wgpu_put32(p, 64, depth ? 1 : 0);
  wgpu_put32(p, 68, depth_format ? 8 : 0);
  for (const int at : {72, 88}) {
    wgpu_put32(p, at, 8);
    wgpu_put32(p, at + 12, stencil ? 2 : 0);
  }
  wgpu_put32(p, 104, 0xff);
  wgpu_put32(p, 108, stencil ? 0xff : 0);
  wgpu_put32(p, 124, 1);
  wgpu_put32(p, 128, 0xffffffffu);
  wgpu_put32(p, 136, count);
  wgpu_put32(p, 152, vs);
  wgpu_put32(p, 156, fs);
  for (uint32_t i = 0; i < count; i++) {
    uint8_t *target = p + 160 + 40 * i;
    if (colors[i] == 0) {
      wgpu_put32(target, 36, 1);
      continue;
    }
    wgpu_put32(target, 0, colors[i]);
    wgpu_put32(target, 4, color ? 15 : 0);
  }
  memcpy(p + 160 + 40 * count, vertex, vs);
  memcpy(p + 160 + 40 * count + vs, fragment, fs);
  device.release(module);
  internal_pipelines_.add(key, pipeline);
  return pipeline;
}

void WGPUContext::clear_draw(WGPUFrameBuffer &framebuffer,
                             bool color,
                             const double4 colors[],
                             bool depth,
                             float depth_value,
                             bool stencil,
                             uint32_t stencil_value)
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  const uint64_t pipeline = clear_pipeline(framebuffer, color, depth, stencil);
  const float values[8] = {float(colors[0][0]),
                           float(colors[0][1]),
                           float(colors[0][2]),
                           float(colors[0][3]),
                           depth_value,
                           0.0f,
                           0.0f,
                           0.0f};
  uint64_t ring;
  const uint64_t offset = device.stage(
      values, sizeof(values), device.limits[WGPU_LIMIT_UNIFORM_ALIGNMENT], ring);
  render_pass_ensure(framebuffer);
  set_pipeline(pipeline);
  set_group(clear_group_, uint32_t(offset));
  set_viewport(framebuffer);
  if (stencil) {
    uint8_t *p = device.command(DOLLY_GPU_SET_STENCIL_REFERENCE, 16);
    wgpu_put32(p, 8, stencil_value);
    pass_stencil_reference_ = stencil_value;
  }
  uint8_t *p = device.command(DOLLY_GPU_DRAW, 24);
  wgpu_put32(p, 8, 3);
  wgpu_put32(p, 12, 1);
}

void WGPUContext::clear_texture(WGPUTexture &texture, const double4 color)
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  passes_end();
  const int layers = texture.type_get() == GPU_TEXTURE_3D ? 1 : std::max(texture.layer_count(), 1);
  for (int layer = 0; layer < layers; layer++) {
    const uint64_t view = texture.attachment_view(0, layer);
    if (texture.is_depth()) {
      uint8_t *p = device.command(DOLLY_GPU_BEGIN_VIEW_PASS, 64);
      wgpu_put64(p, 8, view);
      wgpu_put32(p, 28, 1);
      wgpu_putf(p, 40, float(color[0]));
      wgpu_put32(p, 44, texture.has_stencil() ? 1 : 0);
    }
    else {
      uint8_t *p = device.command(DOLLY_GPU_BEGIN_VIEW_PASS, 64 + 40);
      wgpu_put32(p, 16, 1);
      wgpu_put64(p, 64, view);
      wgpu_put32(p, 64 + 16, 1);
      for (int k = 0; k < 4; k++) {
        wgpu_putf(p, 64 + 24 + 4 * k, float(color[k]));
      }
    }
    device.command(DOLLY_GPU_END_RENDER_PASS, 8);
  }
  texture.used_in = device.submission();
}

/* Each mip drawn from the one above it, filtered, as OpenGL's glGenerateMipmap. */
void WGPUContext::generate_mipmaps(WGPUTexture &texture)
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  passes_end();
  const uint64_t pipeline = blit_pipeline(texture.gpu_format(), false);
  GPUSamplerState linear = GPUSamplerState::default_sampler();
  linear.filtering = GPU_SAMPLER_FILTERING_LINEAR;
  const uint64_t sampler = wgpu_sampler(linear, texture.is_filterable());
  const int layers = std::max(texture.layer_count(), 1);
  for (int mip = 1; mip < texture.mip_count(); mip++) {
    for (int layer = 0; layer < layers; layer++) {
      /* The source: one mip and layer of the texture, as a 2D view. */
      const uint64_t source = texture.attachment_view(mip - 1, layer);
      const uint64_t bind_group = group(blit_.layout, source, sampler);
      uint8_t *p = device.command(DOLLY_GPU_BEGIN_VIEW_PASS, 64 + 40);
      wgpu_put32(p, 16, 1);
      wgpu_put64(p, 64, texture.attachment_view(mip, layer));
      wgpu_put32(p, 64 + 16, 1);
      p = device.command(DOLLY_GPU_SET_PIPELINE, 16);
      wgpu_put64(p, 8, pipeline);
      p = device.command(DOLLY_GPU_SET_BIND_GROUP, 24);
      wgpu_put64(p, 8, bind_group);
      p = device.command(DOLLY_GPU_DRAW, 24);
      wgpu_put32(p, 8, 3);
      wgpu_put32(p, 12, 1);
      device.command(DOLLY_GPU_END_RENDER_PASS, 8);
      device.release(bind_group);
    }
  }
  pass_state_reset();
  texture.used_in = device.submission();
}

/* A region of one mip and layer, read back: rows of 256-byte pitch copied out, then converted. */
void WGPUContext::read_region(WGPUTexture &texture,
                              int mip,
                              int layer,
                              const int area[4],
                              eGPUDataFormat format,
                              void *r_data)
{
  const int width = area[2], height = area[3];
  if (width <= 0 || height <= 0) {
    return;
  }
  const TextureFormat device_format = wgpu_device_format(texture.format_get());
  const bool depth_stencil = texture.has_stencil();
  const size_t texel = depth_stencil ? 4 : to_bytesize(device_format);
  const uint32_t pitch = uint32_t((width * texel + 255) & ~size_t(255));
  const uint64_t bytes = uint64_t(pitch) * height;
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  WGPUBuffer readback;
  readback.ensure(bytes, WGPU_BUFFER_MAP_READ | WGPU_BUFFER_COPY_DST);
  passes_end();
  uint8_t *p = device.command(DOLLY_GPU_COPY_TEXTURE_TO_BUFFER, 72);
  wgpu_put64(p, 8, readback.handle);
  wgpu_put32(p, 24, pitch);
  wgpu_put32(p, 28, uint32_t(height));
  wgpu_put64(p, 32, texture.handle());
  wgpu_put32(p, 40, uint32_t(mip));
  wgpu_put32(p, 44, texture.is_depth() ? 2 : 0);
  wgpu_put32(p, 48, uint32_t(area[0]));
  wgpu_put32(p, 52, uint32_t(area[1]));
  wgpu_put32(p, 56, uint32_t(layer));
  wgpu_put32(p, 60, uint32_t(width));
  wgpu_put32(p, 64, uint32_t(height));
  wgpu_put32(p, 68, 1);
  std::vector<uint8_t> rows(bytes);
  const bool ok = device.read_buffer(readback.handle, 0, bytes, rows.data());
  readback.free();
  if (!ok) {
    return;
  }
  std::vector<uint8_t> tight(size_t(width) * height * texel);
  for (int row = 0; row < height; row++) {
    memcpy(tight.data() + size_t(row) * width * texel, rows.data() + size_t(row) * pitch, width * texel);
  }
  const TextureFormat host_format = depth_stencil ? TextureFormat::SFLOAT_32_DEPTH :
                                                    texture.format_get();
  convert_device_to_host(r_data,
                         tight.data(),
                         size_t(width) * height,
                         format,
                         host_format,
                         depth_stencil ? TextureFormat::SFLOAT_32_DEPTH : device_format);
}

void WGPUContext::copy_region(WGPUTexture &source,
                              int source_mip,
                              int source_layer,
                              WGPUTexture &destination,
                              int destination_mip,
                              int destination_layer,
                              int x,
                              int y,
                              int width,
                              int height)
{
  const int3 destination_size = destination.mip_size_get(destination_mip);
  width = std::min(width, destination_size.x - x);
  height = std::min(height, std::max(destination_size.y, 1) - y);
  if (width <= 0 || height <= 0) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  passes_end();
  uint8_t *p = device.command(DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE, 72);
  wgpu_put64(p, 8, source.handle());
  wgpu_put64(p, 16, destination.handle());
  wgpu_put32(p, 24, uint32_t(source_mip));
  wgpu_put32(p, 36, uint32_t(source_layer));
  wgpu_put32(p, 40, uint32_t(destination_mip));
  wgpu_put32(p, 44, uint32_t(x));
  wgpu_put32(p, 48, uint32_t(y));
  wgpu_put32(p, 52, uint32_t(destination_layer));
  wgpu_put32(p, 56, uint32_t(width));
  wgpu_put32(p, 60, uint32_t(height));
  wgpu_put32(p, 64, 1);
  source.used_in = destination.used_in = device.submission();
}

/** \} */

void WGPUFence::wait()
{
  wgpu_device().wait_idle();
  signalled_ = false;
}

}  // namespace blender::gpu
