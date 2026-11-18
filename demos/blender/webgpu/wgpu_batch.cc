/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_batch.hh"
#include "wgpu_backend.hh"
#include "wgpu_buffer.hh"
#include "wgpu_shader.hh"

#include "GPU_capabilities.hh"
#include "GPU_shader.hh"

#include "gpu_shader_create_info.hh"

#include "CLG_log.h"

namespace blender::gpu {

static CLG_LogRef LOG = {"gpu.webgpu"};

/* gpu@0's vertex formats (GRAPHICS_PIPELINE's list and its continuation). */
uint32_t wgpu_vertex_format(VertAttrType type)
{
  switch (type) {
    case VertAttrType::SFLOAT_32:
      return 1;
    case VertAttrType::SFLOAT_32_32:
      return 2;
    case VertAttrType::SFLOAT_32_32_32:
      return 3;
    case VertAttrType::SFLOAT_32_32_32_32:
      return 4;
    case VertAttrType::UNORM_8_8_8_8:
      return 5;
    case VertAttrType::SNORM_8_8_8_8:
      return 6;
    case VertAttrType::UINT_8_8_8_8:
      return 7;
    case VertAttrType::SINT_8_8_8_8:
      return 8;
    case VertAttrType::UNORM_16_16:
      return 9;
    case VertAttrType::UNORM_16_16_16_16:
      return 10;
    case VertAttrType::UINT_16_16:
      return 11;
    case VertAttrType::UINT_16_16_16_16:
      return 12;
    case VertAttrType::SFLOAT_16_16:
      return 13;
    case VertAttrType::SFLOAT_16_16_16_16:
      return 14;
    case VertAttrType::UINT_8_8_DEPRECATED:
      return 15;
    case VertAttrType::SINT_8_8_DEPRECATED:
      return 16;
    case VertAttrType::UNORM_8_8_DEPRECATED:
      return 17;
    case VertAttrType::SNORM_8_8_DEPRECATED:
      return 18;
    case VertAttrType::SINT_16_16:
      return 19;
    case VertAttrType::SINT_16_16_16_16:
      return 20;
    case VertAttrType::SNORM_16_16:
      return 21;
    case VertAttrType::SNORM_16_16_16_16:
      return 22;
    case VertAttrType::UINT_32:
      return 23;
    case VertAttrType::UINT_32_32:
      return 24;
    case VertAttrType::UINT_32_32_32:
      return 25;
    case VertAttrType::UINT_32_32_32_32:
      return 26;
    case VertAttrType::SINT_32:
      return 27;
    case VertAttrType::SINT_32_32:
      return 28;
    case VertAttrType::SINT_32_32_32:
      return 29;
    case VertAttrType::SINT_32_32_32_32:
      return 30;
    case VertAttrType::UNORM_10_10_10_2:
      return 31;
    default:
      /* SNORM_10_10_10_2 (normals, which WGPUBackend asks in 16 bits instead) and the deprecated
       * formats of three components. */
      return 0;
  }
}

/* A zero format for a shader's input type: float, int or uint, of four components. */
static uint32_t zero_format(shader::Type type)
{
  switch (type) {
    case shader::Type::int_t:
    case shader::Type::int2_t:
    case shader::Type::int3_t:
    case shader::Type::int4_t:
      return 30;
    case shader::Type::uint_t:
    case shader::Type::uint2_t:
    case shader::Type::uint3_t:
    case shader::Type::uint4_t:
      return 26;
    default:
      return 4;
  }
}

void wgpu_vertex_layout_add(const GPUVertFormat &format,
                            uint vertex_len,
                            const WGPUShader &shader,
                            uint64_t buffer,
                            uint64_t offset,
                            uint64_t size,
                            uint16_t &r_occupied,
                            WGPUDraw &r_draw)
{
  const ShaderInterface &interface = shader.interface_get();
  if (format.attr_len == 0) {
    return;
  }
  /* An interleaved buffer is one slot; a deinterleaved one a slot an attribute. */
  int interleaved_slot = -1;
  uint64_t attribute_offset_in_buffer = 0;
  for (uint32_t a = 0; a < format.attr_len; a++) {
    const GPUVertAttr &attribute = format.attrs[a];
    uint64_t base = offset;
    uint32_t stride = format.stride, attribute_offset = attribute.offset;
    if (format.deinterleaved) {
      base += attribute_offset_in_buffer;
      attribute_offset_in_buffer += uint64_t(attribute.type.size()) * vertex_len;
      stride = uint32_t(attribute.type.size());
      attribute_offset = 0;
    }
    for (uint32_t n = 0; n < attribute.name_len; n++) {
      const char *name = GPU_vertformat_attr_name_get(&format, &attribute, n);
      const ShaderInput *input = interface.attr_get(name);
      if (input == nullptr || input->location == -1) {
        continue;
      }
      const uint16_t bit = uint16_t(1u << input->location);
      if (r_occupied & bit) {
        continue;
      }
      const uint32_t gpu_format = wgpu_vertex_format(attribute.type.format);
      if (gpu_format == 0) {
        CLOG_WARN(&LOG, "attribute \"%s\": WebGPU has no vertex format %d", name,
                  int(attribute.type.format));
        continue;
      }
      r_occupied |= bit;
      uint32_t slot;
      if (format.deinterleaved || interleaved_slot < 0) {
        slot = uint32_t(r_draw.layout.buffers.size());
        r_draw.layout.buffers.append({stride, 0});
        r_draw.vertex_buffers.append({buffer, base, size - std::min(size, base - offset)});
        if (!format.deinterleaved) {
          interleaved_slot = int(slot);
        }
      }
      else {
        slot = uint32_t(interleaved_slot);
      }
      r_draw.layout.attributes.append({slot, uint32_t(input->location), gpu_format, attribute_offset});
    }
  }
}

void wgpu_vertex_layout_fill(const WGPUShader &shader, uint16_t occupied, WGPUDraw &r_draw)
{
  const ShaderInterface &interface = shader.interface_get();
  const uint16_t missing = interface.enabled_attr_mask_ & ~occupied;
  if (!missing) {
    return;
  }
  /* One buffer of zeros a stride of 0 reads for every vertex. */
  static WGPUBuffer zeros;
  if (zeros.handle == 0) {
    zeros.ensure(16, WGPU_BUFFER_VERTEX | WGPU_BUFFER_COPY_DST);
  }
  const uint32_t slot = uint32_t(r_draw.layout.buffers.size());
  r_draw.layout.buffers.append({0, 0});
  r_draw.vertex_buffers.append({zeros.handle, 0, 16});
  for (int location = 0; location < 16; location++) {
    if (missing & (1u << location)) {
      r_draw.layout.attributes.append(
          {slot, uint32_t(location), zero_format(shader::Type(interface.attr_types_[location])), 0});
    }
  }
}

uint64_t WGPUVertexLayout::hash() const
{
  uint64_t h = 1469598103934665603ull;
  auto mix = [&](uint64_t v) { h = (h ^ v) * 1099511628211ull; };
  for (const Buffer &buffer : buffers) {
    mix(buffer.stride);
    mix(buffer.step);
  }
  for (const Attribute &attribute : attributes) {
    mix(attribute.slot);
    mix(attribute.location);
    mix(attribute.format);
    mix(attribute.offset);
  }
  return h;
}

/* -------------------------------------------------------------------- */
/** \name Batches
 * \{ */

bool WGPUBatch::prepare(WGPUDraw &r_draw)
{
  WGPUContext &context = *WGPUContext::get();
  const WGPUShader *wgpu_shader = static_cast<const WGPUShader *>(context.shader);
  if (wgpu_shader == nullptr || !wgpu_shader->ready() || wgpu_shader->is_compute()) {
    return false;
  }
  r_draw.primitive = prim_type;
  uint16_t occupied = 0;
  for (int v = 0; v < GPU_BATCH_VBO_MAX_LEN; v++) {
    WGPUVertBuf *vbo = static_cast<WGPUVertBuf *>(verts[v]);
    if (vbo == nullptr) {
      continue;
    }
    WGPUBuffer &buffer = vbo->ensure_uploaded();
    buffer.use();
    wgpu_vertex_layout_add(vbo->format,
                           vbo->vertex_len,
                           *wgpu_shader,
                           buffer.handle,
                           0,
                           buffer.size,
                           occupied,
                           r_draw);
  }
  wgpu_vertex_layout_fill(*wgpu_shader, occupied, r_draw);
  WGPUIndexBuf *index_buffer = static_cast<WGPUIndexBuf *>(elem);
  if (index_buffer) {
    WGPUBuffer &buffer = index_buffer->ensure_uploaded();
    buffer.use();
    r_draw.index_format = index_buffer->is_32bit() ? 2 : 1;
    r_draw.index = {buffer.handle, 0, buffer.size};
  }
  return true;
}

void WGPUBatch::draw(int v_first, int v_count, int i_first, int i_count)
{
  WGPUDraw draw;
  if (v_count <= 0 || i_count <= 0 || !prepare(draw)) {
    return;
  }
  WGPUIndexBuf *index_buffer = static_cast<WGPUIndexBuf *>(elem);
  draw.count = uint32_t(v_count);
  draw.instances = uint32_t(i_count);
  draw.first_instance = uint32_t(i_first);
  if (index_buffer) {
    draw.first = index_buffer->index_start_get() + uint32_t(v_first);
    draw.base_vertex = int32_t(index_buffer->index_base_get());
  }
  else {
    draw.first = uint32_t(v_first);
  }
  WGPUContext::get()->draw(draw);
}

void WGPUBatch::draw_indirect(StorageBuf *indirect_buf, intptr_t offset)
{
  multi_draw_indirect(indirect_buf, 1, offset, 0);
}

/* WebGPU draws one indirect draw a command. */
void WGPUBatch::multi_draw_indirect(StorageBuf *indirect_buf,
                                    int count,
                                    intptr_t offset,
                                    intptr_t stride)
{
  WGPUDraw draw;
  if (!prepare(draw)) {
    return;
  }
  WGPUStorageBuf *indirect = static_cast<WGPUStorageBuf *>(indirect_buf);
  draw.indirect = &indirect->ensure_allocated();
  for (int i = 0; i < count; i++) {
    draw.indirect_offset = uint64_t(offset) + uint64_t(i) * uint64_t(stride);
    WGPUContext::get()->draw(draw);
  }
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Immediate mode
 * \{ */

uchar *WGPUImmediate::begin()
{
  const uint extra = prim_type == GPU_PRIM_LINE_LOOP ? 1 : 0;
  data_.resize(size_t(vertex_len + extra) * vertex_format.stride + 4);
  return data_.data();
}

void WGPUImmediate::end()
{
  if (vertex_idx == 0) {
    return;
  }
  WGPUContext &context = *WGPUContext::get();
  const size_t stride = vertex_format.stride;
  GPUPrimType primitive = prim_type;
  uint vertices = vertex_idx;
  std::vector<uchar> fan;
  const uchar *data = data_.data();
  if (primitive == GPU_PRIM_LINE_LOOP) {
    memcpy(data_.data() + stride * vertices, data_.data(), stride);
    vertices++;
    primitive = GPU_PRIM_LINE_STRIP;
  }
  else if (primitive == GPU_PRIM_TRI_FAN) {
    /* WebGPU has no fans: a list of the same triangles. */
    if (vertices < 3) {
      return;
    }
    fan.resize(size_t(vertices - 2) * 3 * stride);
    for (uint t = 0; t + 2 < vertices; t++) {
      memcpy(fan.data() + (t * 3 + 0) * stride, data, stride);
      memcpy(fan.data() + (t * 3 + 1) * stride, data + (t + 1) * stride, stride);
      memcpy(fan.data() + (t * 3 + 2) * stride, data + (t + 2) * stride, stride);
    }
    data = fan.data();
    vertices = (vertices - 2) * 3;
    primitive = GPU_PRIM_TRIS;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t ring;
  const uint64_t offset = device.stage(
      data, uint64_t(vertices) * stride, device.limits[WGPU_LIMIT_STORAGE_ALIGNMENT], ring);
  WGPUShader *wgpu_shader = static_cast<WGPUShader *>(this->shader);
  if (wgpu_shader->is_polyline) {
    /* Polylines read the vertices as storage, from an offset given as a uniform. */
    static WGPUBuffer ring_buffer;
    ring_buffer.handle = ring;
    ring_buffer.size = 32ull << 20;
    WGPUStateManager &state = context.wgpu_state();
    state.storage_bind(GPU_SSBO_POLYLINE_POS_BUF_SLOT, &ring_buffer, 0);
    state.storage_bind(GPU_SSBO_POLYLINE_COL_BUF_SLOT, &ring_buffer, 0);
    state.storage_bind(GPU_SSBO_INDEX_BUF_SLOT, &ring_buffer, 0);
    const GPUPrimType original = prim_type;
    const uint original_count = vertex_idx;
    prim_type = primitive;
    vertex_idx = vertices;
    polyline_draw_workaround(offset);
    prim_type = original;
    vertex_idx = original_count;
    return;
  }
  if (!wgpu_shader->ready()) {
    return;
  }
  WGPUDraw draw;
  draw.primitive = primitive;
  uint16_t occupied = 0;
  wgpu_vertex_layout_add(vertex_format,
                         vertices,
                         *wgpu_shader,
                         ring,
                         offset,
                         uint64_t(vertices) * stride,
                         occupied,
                         draw);
  wgpu_vertex_layout_fill(*wgpu_shader, occupied, draw);
  draw.count = vertices;
  context.draw(draw);
}

/** \} */

}  // namespace blender::gpu
