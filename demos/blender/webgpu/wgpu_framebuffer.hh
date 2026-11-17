/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * A framebuffer is the attachments of a WebGPU render pass. Its pass opens at the first draw or
 * clear after it is bound and ends when another framebuffer draws, or a copy, compute dispatch or
 * readback needs the encoder outside passes. A clear of the whole framebuffer is the next pass's
 * load operation; a clear inside a scissor is a draw.
 */

#pragma once

#include "gpu_framebuffer_private.hh"

#include <cstdint>

namespace blender::gpu {

class WGPUTexture;

class WGPUFrameBuffer : public FrameBuffer {
 public:
  WGPUFrameBuffer(const char *name) : FrameBuffer(name) {}
  ~WGPUFrameBuffer() override;

  void bind(bool enabled_srgb) override;
  bool check(char err_out[256]) override;
  void clear(GPUFrameBufferBits buffers,
             const double4 clear_color,
             float clear_depth,
             uint clear_stencil) override;
  void clear_multi(Span<double4> clear_cols) override;
  void clear_attachment(GPUAttachmentType type, const double4 clear_value) override;
  void attachment_set_loadstore_op(GPUAttachmentType type, GPULoadStore ls) override;
  void read(GPUFrameBufferBits planes,
            eGPUDataFormat format,
            const int area[4],
            int channel_len,
            int slot,
            void *r_data) override;
  void blit_to(GPUFrameBufferBits planes,
               int src_slot,
               FrameBuffer *dst,
               int dst_slot,
               int dst_offset_x,
               int dst_offset_y) override;

  /** BEGIN_VIEW_PASS for the attachments, with the clears asked for since its last pass. */
  void begin_pass();
  /** gpu@0's formats of the colour attachments (0 for none) and of depth (0 for none). */
  void formats(uint32_t r_colors[GPU_FB_MAX_COLOR_ATTACHMENT],
               uint32_t &r_color_count,
               uint32_t &r_depth) const;
  bool has_stencil() const;
  WGPUTexture *color_texture(int slot) const;
  WGPUTexture *depth_texture() const;
  /** The viewport and scissor as gpu@0 takes them: inside the attachments. */
  void viewport_scissor(float r_viewport[4], uint32_t r_scissor[4]) const;
  int width() const
  {
    return width_;
  }
  int height() const
  {
    return height_;
  }
  /** Size from the attachments, after they changed. */
  void update_size();

 protected:
  void subpass_transition_impl(const GPUAttachmentState depth_attachment_state,
                               Span<GPUAttachmentState> color_attachment_states) override;

 private:
  /* Clears for the next pass's load operations. */
  bool clear_color_[GPU_FB_MAX_COLOR_ATTACHMENT] = {};
  double4 clear_values_[GPU_FB_MAX_COLOR_ATTACHMENT];
  bool clear_depth_ = false, clear_stencil_ = false;
  float clear_depth_value_ = 1.0f;
  uint32_t clear_stencil_value_ = 0;
  bool srgb_ = false;

  /** Whether a clear can be the pass's load operation: no scissor inside the attachments. */
  bool clears_whole() const;
};

}  // namespace blender::gpu
