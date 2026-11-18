/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * Batches and immediate mode: vertex buffers laid out for the bound shader's attributes, as the
 * Vulkan backend's vertex attribute objects are, and drawn by the context.
 */

#pragma once

#include "GPU_batch.hh"

#include "gpu_immediate_private.hh"

#include "wgpu_context.hh"

#include <vector>

namespace blender::gpu {

class WGPUShader;

/** gpu@0's vertex format of one of Blender's, or 0 where WebGPU has none. */
uint32_t wgpu_vertex_format(VertAttrType type);
/** The layout of a vertex format's attributes the shader reads, in buffer slot `slot`. */
void wgpu_vertex_layout_add(const GPUVertFormat &format,
                            uint vertex_len,
                            const WGPUShader &shader,
                            uint64_t buffer,
                            uint64_t offset,
                            uint64_t size,
                            uint16_t &r_occupied,
                            WGPUDraw &r_draw);
/** A zero for every attribute the shader reads that no buffer gives, as OpenGL reads one. */
void wgpu_vertex_layout_fill(const WGPUShader &shader, uint16_t occupied, WGPUDraw &r_draw);

class WGPUBatch : public Batch {
 public:
  void draw(int v_first, int v_count, int i_first, int i_count) override;
  void draw_indirect(StorageBuf *indirect_buf, intptr_t offset) override;
  void multi_draw_indirect(StorageBuf *indirect_buf,
                           int count,
                           intptr_t offset,
                           intptr_t stride) override;

 private:
  /** The draw without counts: buffers uploaded and laid out, the index buffer. */
  bool prepare(WGPUDraw &r_draw);
};

class WGPUImmediate : public Immediate {
 public:
  uchar *begin() override;
  void end() override;

 private:
  std::vector<uchar> data_;
};

}  // namespace blender::gpu
