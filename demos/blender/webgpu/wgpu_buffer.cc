/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_buffer.hh"
#include "wgpu_backend.hh"
#include "wgpu_context.hh"

#include "MEM_guardedalloc.h"

#include <algorithm>

namespace blender::gpu {

/* -------------------------------------------------------------------- */
/** \name One gpu@0 buffer
 * \{ */

uint32_t wgpu_buffer_usage_all()
{
  return WGPU_BUFFER_VERTEX | WGPU_BUFFER_INDEX | WGPU_BUFFER_UNIFORM | WGPU_BUFFER_STORAGE |
         WGPU_BUFFER_INDIRECT | WGPU_BUFFER_COPY_SRC | WGPU_BUFFER_COPY_DST;
}

void WGPUBuffer::ensure(uint64_t bytes, uint32_t usage)
{
  /* WebGPU copies, clears and binds whole words; uniform blocks are 16-byte aligned. */
  bytes = std::max<uint64_t>((bytes + 15) & ~15ull, 16);
  if (handle && size >= bytes) {
    return;
  }
  free();
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint8_t *p = device.create(DOLLY_GPU_CREATE_BUFFER, 32, handle);
  wgpu_put64(p, 16, bytes);
  wgpu_put32(p, 24, usage);
  size = bytes;
  used_in = 0;
}

void WGPUBuffer::free()
{
  if (handle) {
    wgpu_device().release(handle);
  }
  handle = 0;
  size = 0;
}

void WGPUBuffer::use()
{
  used_in = wgpu_device().submission();
}

void WGPUBuffer::write(uint64_t offset, const void *data, uint64_t bytes)
{
  if (!handle || bytes == 0) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  if (!device.in_use(used_in)) {
    device.write_buffer(handle, offset, data, bytes);
    return;
  }
  uint64_t ring;
  const uint64_t at = device.stage(data, bytes, 4, ring);
  /* Staging may have submitted the encoder, and then a queue write is ordered. */
  if (!device.in_use(used_in)) {
    device.write_buffer(handle, offset, data, bytes);
    return;
  }
  WGPUContext::get()->passes_end();
  uint8_t *p = device.command(DOLLY_GPU_COPY_BUFFER, 48);
  wgpu_put64(p, 8, ring);
  wgpu_put64(p, 16, handle);
  wgpu_put64(p, 24, at);
  wgpu_put64(p, 32, offset);
  wgpu_put64(p, 40, (bytes + 3) & ~3ull);
}

void WGPUBuffer::clear(uint32_t value)
{
  if (!handle) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  if (value == 0) {
    WGPUContext::get()->passes_end();
    uint8_t *p = device.command(DOLLY_GPU_CLEAR_BUFFER, 32);
    wgpu_put64(p, 8, handle);
    wgpu_put64(p, 16, 0);
    wgpu_put64(p, 24, size);
    use();
    return;
  }
  uint32_t *words = static_cast<uint32_t *>(MEM_new_uninitialized(size, __func__));
  std::fill(words, words + size / 4, value);
  write(0, words, size);
  MEM_delete_void(static_cast<void *>(words));
}

void WGPUBuffer::copy_from(WGPUBuffer &source,
                           uint64_t source_offset,
                           uint64_t offset,
                           uint64_t bytes)
{
  if (!handle || !source.handle || bytes == 0) {
    return;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  WGPUContext::get()->passes_end();
  uint8_t *p = device.command(DOLLY_GPU_COPY_BUFFER, 48);
  wgpu_put64(p, 8, source.handle);
  wgpu_put64(p, 16, handle);
  wgpu_put64(p, 24, source_offset);
  wgpu_put64(p, 32, offset);
  wgpu_put64(p, 40, (bytes + 3) & ~3ull);
  source.use();
  use();
}

bool WGPUBuffer::read(uint64_t offset, uint64_t bytes, void *r_data)
{
  if (!handle || bytes == 0) {
    return false;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  const uint64_t padded = (bytes + 3) & ~3ull;
  WGPUBuffer readback;
  readback.ensure(padded, WGPU_BUFFER_MAP_READ | WGPU_BUFFER_COPY_DST);
  readback.copy_from(*this, offset, 0, padded);
  const bool ok = device.read_buffer(readback.handle, 0, bytes, r_data);
  readback.free();
  return ok;
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Vertex buffers
 * \{ */

WGPUVertBuf::~WGPUVertBuf()
{
  release_data();
  buffer.free();
}

void WGPUVertBuf::bind_as_ssbo(uint binding)
{
  WGPUContext::get()->wgpu_state().storage_bind(binding, &ensure_uploaded(), 0);
}

/* WGSL has no texel buffers. */
void WGPUVertBuf::bind_as_texture(uint /*binding*/) {}

WGPUBuffer &WGPUVertBuf::ensure_uploaded()
{
  upload_data();
  return buffer;
}

void WGPUVertBuf::update_sub(uint start, uint len, const void *data)
{
  ensure_uploaded().write(start, data, len);
}

void WGPUVertBuf::copy_sub(VertBuf &source_buf,
                           uint source_first_vertex,
                           uint dest_first_vertex,
                           uint vertex_len)
{
  WGPUVertBuf &source = static_cast<WGPUVertBuf &>(source_buf);
  ensure_uploaded().copy_from(source.ensure_uploaded(),
                              uint64_t(source_first_vertex) * source.format.stride,
                              uint64_t(dest_first_vertex) * format.stride,
                              uint64_t(vertex_len) * format.stride);
}

void WGPUVertBuf::read(void *data) const
{
  WGPUVertBuf &self = const_cast<WGPUVertBuf &>(*this);
  self.ensure_uploaded().read(0, size_used_get(), data);
}

void WGPUVertBuf::acquire_data()
{
  if (usage_ == GPU_USAGE_DEVICE_ONLY) {
    return;
  }
  MEM_SAFE_DELETE(data_);
  data_ = MEM_new_array_uninitialized<uchar>(this->size_alloc_get(), __func__);
}

void WGPUVertBuf::resize_data()
{
  if (usage_ == GPU_USAGE_DEVICE_ONLY) {
    return;
  }
  data_ = static_cast<uchar *>(MEM_realloc_uninitialized(data_, this->size_alloc_get()));
}

void WGPUVertBuf::release_data()
{
  MEM_SAFE_DELETE(data_);
}

void WGPUVertBuf::upload_data()
{
  const bool created = buffer.handle == 0 || buffer.size < size_alloc_get();
  buffer.ensure(size_alloc_get(), wgpu_buffer_usage_all());
  if (created && !(flag & GPU_VERTBUF_DATA_DIRTY) && data_ == nullptr) {
    /* A device-only buffer starts as zeros, as WebGPU makes it. */
    return;
  }
  if ((flag & GPU_VERTBUF_DATA_DIRTY) && data_) {
    buffer.write(0, data_, size_used_get());
    if (usage_ == GPU_USAGE_STATIC) {
      MEM_SAFE_DELETE(data_);
    }
    flag &= ~GPU_VERTBUF_DATA_DIRTY;
    flag |= GPU_VERTBUF_DATA_UPLOADED;
  }
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Index buffers
 * \{ */

WGPUIndexBuf::~WGPUIndexBuf()
{
  buffer.free();
}

WGPUBuffer &WGPUIndexBuf::ensure_uploaded()
{
  if (is_subrange_) {
    return static_cast<WGPUIndexBuf *>(src_)->ensure_uploaded();
  }
  upload_data();
  return buffer;
}

void WGPUIndexBuf::upload_data()
{
  if (is_subrange_) {
    static_cast<WGPUIndexBuf *>(src_)->upload_data();
    return;
  }
  if (buffer.handle == 0) {
    buffer.ensure(size_get(), wgpu_buffer_usage_all());
  }
  if (data_) {
    buffer.write(0, data_, size_get());
    MEM_SAFE_DELETE_VOID(data_);
  }
}

void WGPUIndexBuf::bind_as_ssbo(uint binding)
{
  WGPUContext::get()->wgpu_state().storage_bind(binding, &ensure_uploaded(), 0);
}

void WGPUIndexBuf::read(uint32_t *data) const
{
  WGPUIndexBuf &self = const_cast<WGPUIndexBuf &>(*this);
  self.ensure_uploaded().read(0, size_get(), data);
}

void WGPUIndexBuf::update_sub(uint start, uint len, const void *data)
{
  ensure_uploaded().write(start, data, len);
}

void WGPUIndexBuf::copy_sub(IndexBuf &source_buf,
                            uint source_first_index,
                            uint dest_first_index,
                            uint index_len)
{
  WGPUIndexBuf &source = static_cast<WGPUIndexBuf &>(source_buf);
  ensure_uploaded().copy_from(source.ensure_uploaded(),
                              uint64_t(source_first_index) * to_bytesize(source.index_type_),
                              uint64_t(dest_first_index) * to_bytesize(index_type_),
                              uint64_t(index_len) * to_bytesize(index_type_));
}

/* WebGPU restarts only strips; a point list's restart indices are drawn as points of the
 * restart value's vertex, which Blender sets out of the hidden ones: they are moved to the first
 * index, as the Metal backend does. */
void WGPUIndexBuf::strip_restart_indices()
{
  if (data_ == nullptr || index_len_ == 0) {
    return;
  }
  if (is_32bit()) {
    uint32_t *indices = static_cast<uint32_t *>(data_);
    for (uint32_t i = 0; i < index_len_; i++) {
      if (indices[i] == 0xFFFFFFFFu) {
        indices[i] = indices[0];
      }
    }
  }
  else {
    uint16_t *indices = static_cast<uint16_t *>(data_);
    for (uint32_t i = 0; i < index_len_; i++) {
      if (indices[i] == 0xFFFFu) {
        indices[i] = indices[0];
      }
    }
  }
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Uniform buffers
 * \{ */

WGPUUniformBuf::~WGPUUniformBuf()
{
  WGPUContext *context = WGPUContext::get();
  if (context) {
    context->wgpu_state().buffer_unbind(&buffer);
  }
  buffer.free();
}

WGPUBuffer &WGPUUniformBuf::ensure_uploaded()
{
  if (buffer.handle == 0) {
    buffer.ensure(size_in_bytes_, wgpu_buffer_usage_all());
    if (data_) {
      buffer.write(0, data_, size_in_bytes_);
      MEM_SAFE_DELETE_VOID(data_);
    }
  }
  return buffer;
}

void WGPUUniformBuf::update(const void *data)
{
  ensure_uploaded().write(0, data, size_in_bytes_);
}

void WGPUUniformBuf::clear_to_zero()
{
  ensure_uploaded().clear(0);
}

void WGPUUniformBuf::bind(int slot)
{
  WGPUContext::get()->wgpu_state().uniform_bind(slot, &ensure_uploaded());
}

void WGPUUniformBuf::bind_as_ssbo(int slot)
{
  WGPUContext::get()->wgpu_state().storage_bind(slot, &ensure_uploaded(), 0);
}

void WGPUUniformBuf::unbind()
{
  WGPUContext::get()->wgpu_state().buffer_unbind(&buffer);
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Storage buffers
 * \{ */

WGPUStorageBuf::WGPUStorageBuf(size_t size, GPUUsageType /*usage*/, const char *name)
    : StorageBuf(size, name)
{
}

WGPUStorageBuf::~WGPUStorageBuf()
{
  WGPUContext *context = WGPUContext::get();
  if (context) {
    context->wgpu_state().buffer_unbind(&buffer);
  }
  buffer.free();
}

WGPUBuffer &WGPUStorageBuf::ensure_allocated()
{
  buffer.ensure(size_in_bytes_, wgpu_buffer_usage_all());
  return buffer;
}

void WGPUStorageBuf::update(const void *data)
{
  ensure_allocated().write(0, data, usage_size_get());
}

void WGPUStorageBuf::bind(int slot)
{
  WGPUContext::get()->wgpu_state().storage_bind(slot, &ensure_allocated(), 0);
}

void WGPUStorageBuf::unbind()
{
  WGPUContext::get()->wgpu_state().buffer_unbind(&buffer);
}

void WGPUStorageBuf::clear(uint32_t clear_value)
{
  ensure_allocated().clear(clear_value);
}

void WGPUStorageBuf::copy_sub(VertBuf *src, uint dst_offset, uint src_offset, uint copy_size)
{
  WGPUVertBuf *source = static_cast<WGPUVertBuf *>(src);
  ensure_allocated().copy_from(source->ensure_uploaded(), src_offset, dst_offset, copy_size);
}

void WGPUStorageBuf::read(void *data)
{
  ensure_allocated().read(0, usage_size_get(), data);
}

/** \} */

}  // namespace blender::gpu
