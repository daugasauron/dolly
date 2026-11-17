/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_framebuffer.hh"
#include "wgpu_backend.hh"
#include "wgpu_context.hh"
#include "wgpu_texture.hh"

#include "GPU_texture.hh"

#include "gpu_shader_private.hh"

#include <algorithm>

namespace blender::gpu {

WGPUFrameBuffer::~WGPUFrameBuffer()
{
  WGPUContext *context = WGPUContext::get();
  if (context) {
    context->framebuffer_forget(this);
  }
}

void WGPUFrameBuffer::update_size()
{
  if (!dirty_attachments_) {
    return;
  }
  for (int i = 0; i < GPU_FB_MAX_ATTACHMENT; i++) {
    const GPUAttachment &attachment = attachments_[i];
    if (attachment.tex) {
      int size[3];
      GPU_texture_get_mipmap_size(attachment.tex, attachment.mip, size);
      size_set(size[0], size[1]);
      break;
    }
  }
  srgb_ = false;
  for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT; i++) {
    if (const WGPUTexture *texture = color_texture(i)) {
      srgb_ = (texture->format_flag_get() & GPU_FORMAT_SRGB) != 0;
      break;
    }
  }
  dirty_attachments_ = false;
}

void WGPUFrameBuffer::bind(bool enabled_srgb)
{
  WGPUContext &context = *WGPUContext::get();
  context.active_fb = this;
  if (enabled_srgb != enabled_srgb_) {
    /* The attachments' views change: a pass of the framebuffer open with the others ends. */
    context.passes_end();
    enabled_srgb_ = enabled_srgb;
  }
  update_size();
  viewport_reset();
  scissor_reset();
  Shader::set_framebuffer_srgb_target(enabled_srgb && srgb_);
}

bool WGPUFrameBuffer::check(char /*err_out*/[256])
{
  return true;
}

WGPUTexture *WGPUFrameBuffer::color_texture(int slot) const
{
  return static_cast<WGPUTexture *>(attachments_[GPU_FB_COLOR_ATTACHMENT0 + slot].tex);
}

WGPUTexture *WGPUFrameBuffer::depth_texture() const
{
  return static_cast<WGPUTexture *>(depth_attachment().tex);
}

bool WGPUFrameBuffer::has_stencil() const
{
  const WGPUTexture *depth = depth_texture();
  return depth && depth->has_stencil();
}

void WGPUFrameBuffer::formats(uint32_t r_colors[GPU_FB_MAX_COLOR_ATTACHMENT],
                              uint32_t &r_color_count,
                              uint32_t &r_depth) const
{
  r_color_count = 0;
  for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT; i++) {
    const WGPUTexture *texture = color_texture(i);
    r_colors[i] = texture ? texture->attachment_format(enabled_srgb_) : 0;
    if (texture) {
      r_color_count = uint32_t(i + 1);
    }
  }
  const WGPUTexture *depth = depth_texture();
  r_depth = depth ? depth->gpu_format() : 0;
}

bool WGPUFrameBuffer::clears_whole() const
{
  return !scissor_test_ ||
         (scissor_[0] <= 0 && scissor_[1] <= 0 && scissor_[0] + scissor_[2] >= width_ &&
          scissor_[1] + scissor_[3] >= height_);
}

void WGPUFrameBuffer::viewport_scissor(float r_viewport[4], uint32_t r_scissor[4]) const
{
  /* WebGPU keeps a viewport inside the attachments. Rows are Vulkan's: OpenGL's y is the row. */
  const int x = std::clamp(viewport_[0][0], 0, std::max(width_ - 1, 0));
  const int y = std::clamp(viewport_[0][1], 0, std::max(height_ - 1, 0));
  r_viewport[0] = float(x);
  r_viewport[1] = float(y);
  r_viewport[2] = float(std::clamp(viewport_[0][2], 1, std::max(width_ - x, 1)));
  r_viewport[3] = float(std::clamp(viewport_[0][3], 1, std::max(height_ - y, 1)));
  int sx = 0, sy = 0, sw = width_, sh = height_;
  if (scissor_test_) {
    sx = std::clamp(scissor_[0], 0, width_);
    sy = std::clamp(scissor_[1], 0, height_);
    sw = std::clamp(scissor_[0] + scissor_[2], 0, width_) - sx;
    sh = std::clamp(scissor_[1] + scissor_[3], 0, height_) - sy;
  }
  r_scissor[0] = uint32_t(sx);
  r_scissor[1] = uint32_t(sy);
  r_scissor[2] = uint32_t(std::max(sw, 0));
  r_scissor[3] = uint32_t(std::max(sh, 0));
}

void WGPUFrameBuffer::begin_pass()
{
  update_size();
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint32_t count = 0;
  for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT; i++) {
    if (color_texture(i)) {
      count = uint32_t(i + 1);
    }
  }
  WGPUTexture *depth = depth_texture();
  uint32_t absent = 0;
  uint64_t views[GPU_FB_MAX_COLOR_ATTACHMENT] = {};
  for (uint32_t i = 0; i < count; i++) {
    const GPUAttachment &attachment = attachments_[GPU_FB_COLOR_ATTACHMENT0 + int(i)];
    WGPUTexture *texture = color_texture(i);
    if (texture) {
      views[i] = texture->attachment_view(attachment.mip, attachment.layer, enabled_srgb_);
      texture->used_in = device.submission();
    }
    else {
      absent |= 1u << i;
    }
  }
  uint64_t depth_view = 0;
  if (depth) {
    const GPUAttachment &attachment = depth_attachment();
    depth_view = depth->attachment_view(attachment.mip, attachment.layer);
    depth->used_in = device.submission();
  }
  uint8_t *p = device.command(DOLLY_GPU_BEGIN_VIEW_PASS, 64 + 40 * count);
  wgpu_put64(p, 8, depth_view);
  wgpu_put32(p, 16, count);
  wgpu_put32(p, 28, clear_depth_ ? 1 : 0);
  wgpu_put32(p, 32, 0);
  wgpu_put32(p, 36, 0);
  wgpu_putf(p, 40, clear_depth_value_);
  wgpu_put32(p, 44, clear_stencil_ ? 1 : 0);
  wgpu_put32(p, 48, 0);
  wgpu_put32(p, 52, 0);
  wgpu_put32(p, 56, clear_stencil_value_);
  wgpu_put32(p, 60, absent);
  for (uint32_t i = 0; i < count; i++) {
    if (absent & (1u << i)) {
      continue;
    }
    uint8_t *c = p + 64 + 40 * i;
    wgpu_put64(c, 0, views[i]);
    wgpu_put32(c, 16, clear_color_[i] ? 1 : 0);
    wgpu_put32(c, 20, 0);
    for (int k = 0; k < 4; k++) {
      wgpu_putf(c, 24 + 4 * k, clear_color_[i] ? float(clear_values_[i][k]) : 0.0f);
    }
    clear_color_[i] = false;
  }
  clear_depth_ = clear_stencil_ = false;
}

void WGPUFrameBuffer::clear(GPUFrameBufferBits buffers,
                            const double4 clear_color,
                            float clear_depth,
                            uint clear_stencil)
{
  update_size();
  double4 colors[GPU_FB_MAX_COLOR_ATTACHMENT];
  for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT; i++) {
    colors[i] = clear_color;
  }
  const bool color = buffers & GPU_COLOR_BIT;
  const bool depth = (buffers & GPU_DEPTH_BIT) && depth_texture();
  const bool stencil = (buffers & GPU_STENCIL_BIT) && has_stencil();
  WGPUContext &context = *WGPUContext::get();
  if (!clears_whole()) {
    context.clear_draw(*this, color, colors, depth, clear_depth, stencil, clear_stencil);
    return;
  }
  for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT; i++) {
    if (color && color_texture(i)) {
      clear_color_[i] = true;
      clear_values_[i] = clear_color;
    }
  }
  if (depth) {
    clear_depth_ = true;
    clear_depth_value_ = clear_depth;
  }
  if (stencil) {
    clear_stencil_ = true;
    clear_stencil_value_ = clear_stencil;
  }
  context.render_pass_begin(*this);
}

void WGPUFrameBuffer::clear_multi(Span<double4> clear_cols)
{
  update_size();
  WGPUContext &context = *WGPUContext::get();
  if (!clears_whole()) {
    double4 colors[GPU_FB_MAX_COLOR_ATTACHMENT];
    for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT && i < clear_cols.size(); i++) {
      colors[i] = clear_cols[i];
    }
    context.clear_draw(*this, true, colors, false, 1.0f, false, 0);
    return;
  }
  for (int i = 0; i < GPU_FB_MAX_COLOR_ATTACHMENT && i < clear_cols.size(); i++) {
    if (color_texture(i)) {
      clear_color_[i] = true;
      clear_values_[i] = clear_cols[i];
    }
  }
  context.render_pass_begin(*this);
}

void WGPUFrameBuffer::clear_attachment(GPUAttachmentType type, const double4 clear_value)
{
  if (type >= GPU_FB_COLOR_ATTACHMENT0) {
    const int slot = type - GPU_FB_COLOR_ATTACHMENT0;
    clear_color_[slot] = true;
    clear_values_[slot] = clear_value;
    WGPUContext::get()->render_pass_begin(*this);
  }
}

void WGPUFrameBuffer::attachment_set_loadstore_op(GPUAttachmentType type, GPULoadStore ls)
{
  if (ls.load_action != GPU_LOADACTION_CLEAR) {
    return;
  }
  if (type >= GPU_FB_COLOR_ATTACHMENT0) {
    const int slot = type - GPU_FB_COLOR_ATTACHMENT0;
    clear_color_[slot] = true;
    clear_values_[slot] = double4(ls.clear_value[0], ls.clear_value[1], ls.clear_value[2],
                                  ls.clear_value[3]);
  }
  else {
    clear_depth_ = true;
    clear_depth_value_ = ls.clear_value[0];
    if (type == GPU_FB_DEPTH_STENCIL_ATTACHMENT) {
      clear_stencil_ = true;
      clear_stencil_value_ = 0;
    }
  }
}

void WGPUFrameBuffer::subpass_transition_impl(const GPUAttachmentState /*depth_attachment_state*/,
                                              Span<GPUAttachmentState> /*color_attachment_states*/)
{
  /* WebGPU has no sub-passes: what a later draw reads, the pass before it stored. */
  WGPUContext::get()->passes_end();
}

void WGPUFrameBuffer::read(GPUFrameBufferBits planes,
                           eGPUDataFormat format,
                           const int area[4],
                           int /*channel_len*/,
                           int slot,
                           void *r_data)
{
  const GPUAttachment &attachment = (planes & GPU_COLOR_BIT) ?
                                        attachments_[GPU_FB_COLOR_ATTACHMENT0 + slot] :
                                        depth_attachment();
  WGPUTexture *texture = static_cast<WGPUTexture *>(attachment.tex);
  if (texture) {
    WGPUContext::get()->read_region(
        *texture, attachment.mip, std::max(attachment.layer, 0), area, format, r_data);
  }
}

void WGPUFrameBuffer::blit_to(GPUFrameBufferBits planes,
                              int src_slot,
                              FrameBuffer *dst,
                              int dst_slot,
                              int dst_offset_x,
                              int dst_offset_y)
{
  WGPUFrameBuffer &destination = *static_cast<WGPUFrameBuffer *>(dst);
  update_size();
  destination.update_size();
  WGPUContext &context = *WGPUContext::get();
  if (planes & GPU_COLOR_BIT) {
    const GPUAttachment &from = attachments_[GPU_FB_COLOR_ATTACHMENT0 + src_slot];
    const GPUAttachment &to = destination.attachments_[GPU_FB_COLOR_ATTACHMENT0 + dst_slot];
    if (from.tex && to.tex) {
      context.copy_region(*static_cast<WGPUTexture *>(from.tex),
                          from.mip,
                          std::max(from.layer, 0),
                          *static_cast<WGPUTexture *>(to.tex),
                          to.mip,
                          std::max(to.layer, 0),
                          dst_offset_x,
                          dst_offset_y,
                          width_,
                          height_);
    }
  }
  if (planes & (GPU_DEPTH_BIT | GPU_STENCIL_BIT)) {
    const GPUAttachment &from = depth_attachment();
    const GPUAttachment &to = destination.depth_attachment();
    if (from.tex && to.tex) {
      context.copy_region(*static_cast<WGPUTexture *>(from.tex),
                          from.mip,
                          std::max(from.layer, 0),
                          *static_cast<WGPUTexture *>(to.tex),
                          to.mip,
                          std::max(to.layer, 0),
                          dst_offset_x,
                          dst_offset_y,
                          width_,
                          height_);
    }
  }
}

}  // namespace blender::gpu
