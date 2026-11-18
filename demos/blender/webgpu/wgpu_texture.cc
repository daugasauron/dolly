/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_texture.hh"
#include "wgpu_backend.hh"
#include "wgpu_buffer.hh"
#include "wgpu_context.hh"
#include "wgpu_framebuffer.hh"

#include "vk_data_conversion.hh"

#include "CLG_log.h"
#include "MEM_guardedalloc.h"

#include <algorithm>
#include <mutex>
#include <vector>

namespace blender::gpu {

static CLG_LogRef LOG = {"gpu.webgpu"};

/* -------------------------------------------------------------------- */
/** \name Formats
 * \{ */

TextureFormat wgpu_device_format(TextureFormat format)
{
  switch (format) {
    case TextureFormat::SFLOAT_16_16_16:
      return TextureFormat::SFLOAT_16_16_16_16;
    case TextureFormat::SFLOAT_32_32_32:
      return TextureFormat::SFLOAT_32_32_32_32;
    case TextureFormat::UNORM_8_8_8:
      return TextureFormat::UNORM_8_8_8_8;
    case TextureFormat::SRGBA_8_8_8:
      return TextureFormat::SRGBA_8_8_8_8;
    default:
      return format;
  }
}

/* gpu@0's format numbers (CREATE_TEXTURE in dolly-gpu-0.wat). */
uint32_t wgpu_texture_format(TextureFormat format)
{
  const WGPUDevice &device = wgpu_device();
  const bool tier1 = device.has_feature(WGPU_FEATURE_TIER1);
  const bool bc = device.has_feature(WGPU_FEATURE_BC);
  switch (wgpu_device_format(format)) {
    case TextureFormat::UNORM_8:
      return 3;
    case TextureFormat::UNORM_8_8:
      return 4;
    case TextureFormat::UNORM_8_8_8_8:
      return 1;
    case TextureFormat::SRGBA_8_8_8_8:
      return 2;
    case TextureFormat::SNORM_8:
      return 10;
    case TextureFormat::SNORM_8_8:
      return 16;
    case TextureFormat::SNORM_8_8_8_8:
      return 25;
    case TextureFormat::UNORM_16:
      return tier1 ? 57 : 0;
    case TextureFormat::UNORM_16_16:
      return tier1 ? 59 : 0;
    case TextureFormat::UNORM_16_16_16_16:
      return tier1 ? 61 : 0;
    case TextureFormat::SNORM_16:
      return tier1 ? 58 : 0;
    case TextureFormat::SNORM_16_16:
      return tier1 ? 60 : 0;
    case TextureFormat::SNORM_16_16_16_16:
      return tier1 ? 62 : 0;
    case TextureFormat::UINT_8:
      return 11;
    case TextureFormat::UINT_8_8:
      return 17;
    case TextureFormat::UINT_8_8_8_8:
      return 26;
    case TextureFormat::SINT_8:
      return 12;
    case TextureFormat::SINT_8_8:
      return 18;
    case TextureFormat::SINT_8_8_8_8:
      return 27;
    case TextureFormat::UINT_16:
      return 13;
    case TextureFormat::UINT_16_16:
      return 22;
    case TextureFormat::UINT_16_16_16_16:
      return 37;
    case TextureFormat::SINT_16:
      return 14;
    case TextureFormat::SINT_16_16:
      return 23;
    case TextureFormat::SINT_16_16_16_16:
      return 38;
    case TextureFormat::UINT_32:
      return 19;
    case TextureFormat::UINT_32_32:
      return 34;
    case TextureFormat::UINT_32_32_32_32:
      return 40;
    case TextureFormat::SINT_32:
      return 20;
    case TextureFormat::SINT_32_32:
      return 35;
    case TextureFormat::SINT_32_32_32_32:
      return 41;
    case TextureFormat::SFLOAT_16:
      return 15;
    case TextureFormat::SFLOAT_16_16:
      return 24;
    case TextureFormat::SFLOAT_16_16_16_16:
      return 39;
    case TextureFormat::SFLOAT_32:
      return 21;
    case TextureFormat::SFLOAT_32_32:
      return 36;
    case TextureFormat::SFLOAT_32_32_32_32:
      return 42;
    case TextureFormat::UNORM_10_10_10_2:
      return 32;
    case TextureFormat::UINT_10_10_10_2:
      return 31;
    case TextureFormat::UFLOAT_11_11_10:
      return 33;
    case TextureFormat::UFLOAT_9_9_9_EXP_5:
      return 30;
    case TextureFormat::UNORM_16_DEPTH:
      return 44;
    case TextureFormat::SFLOAT_32_DEPTH:
      return 6;
    case TextureFormat::SFLOAT_32_DEPTH_UINT_8:
      return device.has_feature(WGPU_FEATURE_DEPTH32_STENCIL8) ? 45 : 5;
    case TextureFormat::SNORM_DXT1:
      return bc ? 7 : 0;
    case TextureFormat::SNORM_DXT3:
      return bc ? 8 : 0;
    case TextureFormat::SNORM_DXT5:
      return bc ? 9 : 0;
    case TextureFormat::SRGB_DXT1:
      return bc ? 46 : 0;
    case TextureFormat::SRGB_DXT3:
      return bc ? 47 : 0;
    case TextureFormat::SRGB_DXT5:
      return bc ? 48 : 0;
    default:
      return 0;
  }
}

bool wgpu_format_is_renderable(uint32_t gpu_format)
{
  const WGPUDevice &device = wgpu_device();
  if ((gpu_format >= 7 && gpu_format <= 9) || (gpu_format >= 46 && gpu_format <= 56) ||
      gpu_format == 30)
  {
    return false;
  }
  if (gpu_format == 33) {
    return device.has_feature(WGPU_FEATURE_RG11B10_RENDERABLE);
  }
  return device.has_feature(WGPU_FEATURE_TIER1) ||
         !(gpu_format == 10 || gpu_format == 16 || gpu_format == 25 || gpu_format >= 57);
}

/* WebGPU's storage texture formats: the core's, and with texture-formats-tier1 the 8- and 16-bit
 * one- and two-channel formats, the normalized 16-bit and the packed ones. */
static bool wgpu_format_is_storable(uint32_t gpu_format)
{
  switch (gpu_format) {
    case 1:
    case 19:
    case 20:
    case 21:
    case 25:
    case 26:
    case 27:
    case 34:
    case 35:
    case 36:
    case 37:
    case 38:
    case 39:
    case 40:
    case 41:
    case 42:
      return true;
    case 3:
    case 4:
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
    case 15:
    case 16:
    case 17:
    case 18:
    case 22:
    case 23:
    case 24:
    case 31:
    case 32:
    case 33:
      return wgpu_device().has_feature(WGPU_FEATURE_TIER1);
    default:
      return gpu_format >= 57 && gpu_format <= 62 && wgpu_device().has_feature(WGPU_FEATURE_TIER1);
  }
}

bool wgpu_format_is_integer(uint32_t gpu_format)
{
  switch (gpu_format) {
    case 11:
    case 12:
    case 13:
    case 14:
    case 17:
    case 18:
    case 19:
    case 20:
    case 22:
    case 23:
    case 26:
    case 27:
    case 31:
    case 34:
    case 35:
    case 37:
    case 38:
    case 40:
    case 41:
      return true;
    default:
      return false;
  }
}

/* The sRGB or linear partner a texture of the format may also be viewed as. */
static uint32_t view_partner(uint32_t gpu_format)
{
  switch (gpu_format) {
    case 1:
      return 2;
    case 2:
      return 1;
    case 7:
      return 46;
    case 8:
      return 47;
    case 9:
      return 48;
    case 46:
      return 7;
    case 47:
      return 8;
    case 48:
      return 9;
    default:
      return 0;
  }
}

static bool is_compressed(TextureFormat format)
{
  return ELEM(format,
              TextureFormat::SNORM_DXT1,
              TextureFormat::SNORM_DXT3,
              TextureFormat::SNORM_DXT5,
              TextureFormat::SRGB_DXT1,
              TextureFormat::SRGB_DXT3,
              TextureFormat::SRGB_DXT5);
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Samplers
 * \{ */

static uint32_t address_mode(GPUSamplerExtendMode mode)
{
  switch (mode) {
    case GPU_SAMPLER_EXTEND_MODE_REPEAT:
      return 1;
    case GPU_SAMPLER_EXTEND_MODE_MIRRORED_REPEAT:
      return 2;
    default:
      /* WebGPU has no border colour: the edge is extended. */
      return 0;
  }
}

uint64_t wgpu_sampler(GPUSamplerState state, bool filterable)
{
  static Map<uint64_t, uint64_t> samplers;
  uint32_t bits;
  static_assert(sizeof(state) == sizeof(bits));
  memcpy(&bits, &state, sizeof(bits));
  const uint64_t key = uint64_t(bits) | (uint64_t(filterable) << 32);
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  if (const uint64_t *found = samplers.lookup_ptr(key)) {
    return *found;
  }
  uint32_t filter = 0, mip = 0, compare = 0, anisotropy = 1;
  float lod_max = 0.0f;
  if (state.type == GPU_SAMPLER_STATE_TYPE_CUSTOM) {
    if (state.custom_type == GPU_SAMPLER_CUSTOM_ICON) {
      filter = 1;
      lod_max = 1.0f;
    }
    else if (state.custom_type == GPU_SAMPLER_CUSTOM_COMPARE) {
      filter = 1;
      compare = 4; /* less-equal */
    }
  }
  else {
    filter = (state.filtering & GPU_SAMPLER_FILTERING_LINEAR) ? 1 : 0;
    if (state.filtering & GPU_SAMPLER_FILTERING_MIPMAP) {
      mip = filter;
      lod_max = 1000.0f;
      if (state.filtering & GPU_SAMPLER_FILTERING_ANISOTROPIC_MASK) {
        anisotropy = std::min<uint32_t>(16, 1u << ((state.filtering >> 2) & 7));
      }
    }
  }
  /* A non-filtering sampler for what WebGPU does not filter (depth, unfilterable floats). */
  if (!filterable && compare == 0) {
    filter = 0;
    mip = 0;
    anisotropy = 1;
  }
  if (anisotropy > 1 && !(filter && mip)) {
    anisotropy = 1;
  }
  uint64_t handle;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_SAMPLER, 56, handle);
  wgpu_put32(p, 16, filter);
  wgpu_put32(p, 20, filter);
  wgpu_put32(p, 24, mip);
  wgpu_put32(p, 28, address_mode(state.extend_x));
  wgpu_put32(p, 32, address_mode(state.extend_yz));
  wgpu_put32(p, 36, address_mode(state.extend_yz));
  wgpu_put32(p, 40, compare);
  wgpu_put32(p, 44, anisotropy);
  wgpu_putf(p, 48, 0.0f);
  wgpu_putf(p, 52, lod_max);
  samplers.add(key, handle);
  return handle;
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Textures
 * \{ */

WGPUTexture::~WGPUTexture()
{
  WGPUContext *context = WGPUContext::get();
  if (context) {
    context->wgpu_state().texture_forget(this);
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  for (const uint64_t view : views_.values()) {
    device.release(view);
  }
  if (!source_texture_) {
    device.release(handle_);
  }
}

uint64_t WGPUTexture::handle() const
{
  return source() ? source()->handle() : handle_;
}

bool WGPUTexture::is_depth() const
{
  return format_flag_ & GPU_FORMAT_DEPTH;
}

bool WGPUTexture::has_stencil() const
{
  return format_flag_ & GPU_FORMAT_STENCIL;
}

bool WGPUTexture::is_filterable() const
{
  if (format_flag_ & (GPU_FORMAT_DEPTH | GPU_FORMAT_INTEGER)) {
    return false;
  }
  if (ELEM(gpu_format_, 21, 36, 42)) {
    return wgpu_device().has_feature(WGPU_FEATURE_FLOAT32_FILTERABLE);
  }
  return true;
}

bool WGPUTexture::init_internal()
{
  device_format_ = wgpu_device_format(format_);
  gpu_format_ = wgpu_texture_format(format_);
  if (gpu_format_ == 0) {
    CLOG_WARN(&LOG, "texture \"%s\": WebGPU has no format for Blender's %d", name_.c_str(),
              int(format_));
    return false;
  }
  uint32_t dimension = 2, width = w_, height = std::max(h_, 1), layers = 1;
  switch (type_) {
    case GPU_TEXTURE_1D:
      dimension = 1;
      height = 1;
      break;
    case GPU_TEXTURE_1D_ARRAY:
      /* WebGPU has no 1D arrays: a 2D array of rows. */
      layers = h_;
      height = 1;
      break;
    case GPU_TEXTURE_2D:
      break;
    case GPU_TEXTURE_2D_ARRAY:
    case GPU_TEXTURE_CUBE:
    case GPU_TEXTURE_CUBE_ARRAY:
      layers = std::max(d_, 1);
      break;
    case GPU_TEXTURE_3D:
      dimension = 3;
      layers = std::max(d_, 1);
      break;
    default:
      CLOG_WARN(&LOG, "texture \"%s\": WebGPU has no texel buffers", name_.c_str());
      return false;
  }
  uint32_t mips = std::max(mipmaps_, 1);
  if (dimension == 1) {
    mips = 1;
  }
  renderable_ = dimension != 1 && wgpu_format_is_renderable(gpu_format_);
  uint32_t usage = WGPU_TEXTURE_SAMPLED | WGPU_TEXTURE_COPY_SRC | WGPU_TEXTURE_COPY_DST;
  if (renderable_) {
    usage |= WGPU_TEXTURE_ATTACHMENT;
  }
  if ((gpu_image_usage_flags_ & GPU_TEXTURE_USAGE_SHADER_WRITE) && wgpu_format_is_storable(gpu_format_)) {
    usage |= WGPU_TEXTURE_STORAGE;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint8_t *p = device.create(DOLLY_GPU_CREATE_TEXTURE, 48, handle_);
  wgpu_put32(p, 16, width);
  wgpu_put32(p, 20, height);
  wgpu_put32(p, 24, layers);
  wgpu_put32(p, 28, mips);
  wgpu_put32(p, 32, gpu_format_);
  wgpu_put32(p, 36, usage);
  wgpu_put32(p, 40, dimension);
  wgpu_put16(p, 44, 0);
  wgpu_put16(p, 46, uint16_t(view_partner(gpu_format_)));
  mipmaps_ = int(mips);
  return true;
}

bool WGPUTexture::init_internal(VertBuf * /*vbo*/)
{
  CLOG_WARN(&LOG, "texture \"%s\": WebGPU has no texel buffers", name_.c_str());
  return false;
}

bool WGPUTexture::init_internal(gpu::Texture *src, bool use_stencil)
{
  WGPUTexture *original = static_cast<WGPUTexture *>(src);
  gpu_format_ = wgpu_texture_format(format_);
  device_format_ = wgpu_device_format(format_);
  renderable_ = original->renderable_;
  use_stencil_ = use_stencil;
  return gpu_format_ != 0;
}

uint64_t WGPUTexture::view(uint32_t dimension,
                           uint32_t aspect,
                           int mip,
                           int mips,
                           int layer,
                           int layers,
                           uint32_t swizzle,
                           uint32_t format)
{
  if (format == 0) {
    format = gpu_format_;
  }
  uint64_t swizzle_bits = 0;
  for (int i = 0; i < 4; i++) {
    swizzle_bits |= uint64_t((swizzle >> (8 * i)) & 7) << (3 * i);
  }
  const uint64_t key = uint64_t(dimension & 7) | (uint64_t(aspect & 3) << 3) |
                       (uint64_t(mip & 31) << 5) | (uint64_t(mips & 31) << 10) |
                       (uint64_t(layer & 0x3fff) << 15) | (uint64_t(layers & 0x3fff) << 29) |
                       (swizzle_bits << 43) | (uint64_t(format & 127) << 55);
  if (const uint64_t *found = views_.lookup_ptr(key)) {
    return *found;
  }
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t handle;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_VIEW, 56, handle);
  wgpu_put64(p, 16, this->handle());
  /* A view of one aspect takes that aspect's format, which WebGPU derives. */
  wgpu_put32(p, 24, (aspect != 0 || format == gpu_format_) ? 0 : format);
  wgpu_put32(p, 28, dimension);
  wgpu_put32(p, 32, aspect);
  wgpu_put32(p, 36, uint32_t(mip));
  wgpu_put32(p, 40, uint32_t(mips));
  wgpu_put32(p, 44, uint32_t(layer));
  wgpu_put32(p, 48, uint32_t(layers));
  wgpu_put32(p, 52, swizzle);
  views_.add(key, handle);
  return handle;
}

/* gpu@0's view dimensions: 1 1d, 2 2d, 3 2d-array, 4 cube, 5 cube-array, 6 3d. */
uint64_t WGPUTexture::sampled_view()
{
  uint32_t dimension = 2;
  switch (type_) {
    case GPU_TEXTURE_1D:
      dimension = 1;
      break;
    case GPU_TEXTURE_1D_ARRAY:
    case GPU_TEXTURE_2D_ARRAY:
      dimension = 3;
      break;
    case GPU_TEXTURE_CUBE:
      dimension = 4;
      break;
    case GPU_TEXTURE_CUBE_ARRAY:
      dimension = 5;
      break;
    case GPU_TEXTURE_3D:
      dimension = 6;
      break;
    default:
      break;
  }
  const uint32_t aspect = has_stencil() ? (use_stencil_ ? 1 : 2) : 0;
  const bool swizzled = swizzle_ != 0x03020100 && wgpu_device().has_feature(WGPU_FEATURE_SWIZZLE);
  const int layer_count = dimension == 6 ? 1 : this->layer_count();
  return view(dimension,
              aspect,
              mip_min_,
              std::max(mip_max_ - mip_min_ + 1, 1),
              view_layer_start_,
              std::max(layer_count, 1),
              swizzled ? swizzle_ : 0x03020100);
}

uint64_t WGPUTexture::storage_view()
{
  uint32_t dimension = 2;
  if (type_ & GPU_TEXTURE_ARRAY || type_ == GPU_TEXTURE_CUBE) {
    dimension = 3;
  }
  else if (type_ == GPU_TEXTURE_3D) {
    dimension = 6;
  }
  else if (type_ == GPU_TEXTURE_1D) {
    dimension = 1;
  }
  const int layer_count = dimension == 6 ? 1 : this->layer_count();
  return view(dimension, 0, mip_min_, 1, view_layer_start_, std::max(layer_count, 1), 0x03020100);
}

uint32_t WGPUTexture::attachment_format(bool srgb) const
{
  return (format_flag_ & GPU_FORMAT_SRGB) && !srgb && view_partner(gpu_format_) ?
             view_partner(gpu_format_) :
             gpu_format_;
}

uint64_t WGPUTexture::attachment_view(int mip, int layer, bool srgb)
{
  /* A view's mips and layers count from its own first ones. */
  const int base_mip = source() ? mip_min_ + mip : mip;
  return view(2,
              0,
              base_mip,
              1,
              view_layer_start_ + std::max(layer, 0),
              1,
              0x03020100,
              attachment_format(srgb));
}

void WGPUTexture::swizzle_set(const char swizzle_mask[4])
{
  uint32_t swizzle = 0;
  for (int i = 0; i < 4; i++) {
    uint32_t channel = uint32_t(i);
    switch (swizzle_mask[i]) {
      case 'r':
      case 'x':
        channel = 0;
        break;
      case 'g':
      case 'y':
        channel = 1;
        break;
      case 'b':
      case 'z':
        channel = 2;
        break;
      case 'a':
      case 'w':
        channel = 3;
        break;
      case '0':
        channel = 4;
        break;
      case '1':
        channel = 5;
        break;
    }
    swizzle |= channel << (8 * i);
  }
  swizzle_ = swizzle;
}

/* Rows go through the staging ring and a copy in the encoder, so that an update is ordered with
 * the draws before and after it. Rows are 256-byte aligned there, in pieces of at most 8 MiB. */
void WGPUTexture::upload(int mip, int3 offset, int3 extent, int layer, int layers, const uint8_t *data)
{
  const bool compressed = is_compressed(device_format_);
  const int block = compressed ? 4 : 1;
  const size_t texel_bytes = compressed ? to_block_size(device_format_) :
                                          to_bytesize(device_format_);
  const size_t row_bytes = size_t((extent.x + block - 1) / block) * texel_bytes;
  const uint32_t pitch = uint32_t((row_bytes + 255) & ~size_t(255));
  const int rows = (extent.y + block - 1) / block;
  const int slices = extent.z * layers;
  const int rows_per_piece = std::max<int>(1, int((8u << 20) / pitch));
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  std::vector<uint8_t> piece;
  for (int slice = 0; slice < slices; slice++) {
    for (int row = 0; row < rows; row += rows_per_piece) {
      const int count = std::min(rows_per_piece, rows - row);
      piece.assign(size_t(pitch) * count, 0);
      for (int r = 0; r < count; r++) {
        memcpy(piece.data() + size_t(r) * pitch,
               data + (size_t(slice) * rows + row + r) * row_bytes,
               row_bytes);
      }
      uint64_t ring;
      const uint64_t at = device.stage(piece.data(), piece.size(), 256, ring);
      WGPUContext::get()->passes_end();
      uint8_t *p = device.command(DOLLY_GPU_COPY_BUFFER_TO_TEXTURE, 72);
      wgpu_put64(p, 8, ring);
      wgpu_put64(p, 16, at);
      wgpu_put32(p, 24, pitch);
      wgpu_put32(p, 28, uint32_t(count));
      wgpu_put64(p, 32, handle());
      wgpu_put32(p, 40, uint32_t(mip));
      wgpu_put32(p, 44, has_stencil() ? 2 : 0);
      wgpu_put32(p, 48, uint32_t(offset.x));
      wgpu_put32(p, 52, uint32_t(offset.y + row * block));
      const bool volume = type_ == GPU_TEXTURE_3D;
      wgpu_put32(p, 56, uint32_t(volume ? offset.z + slice : layer + slice));
      wgpu_put32(p, 60, uint32_t(compressed ? (extent.x + 3) & ~3 : extent.x));
      wgpu_put32(p, 64, uint32_t(std::min(count * block, compressed ? (extent.y + 3) & ~3 : extent.y)));
      wgpu_put32(p, 68, 1);
    }
  }
}

void WGPUTexture::update_sub(int mip,
                             int offset[3],
                             int extent[3],
                             eGPUDataFormat format,
                             const void *data,
                             uint unpack_row_length)
{
  if (!handle() || data == nullptr || is_depth()) {
    /* WebGPU copies no data into depth textures. */
    return;
  }
  int3 off(offset[0], offset[1], offset[2]);
  int3 ext(extent[0], std::max(extent[1], 1), std::max(extent[2], 1));
  int layer = 0, layers = 1;
  if (type_ == GPU_TEXTURE_1D_ARRAY) {
    layer = off.y;
    layers = ext.y;
    off.y = 0;
    ext.y = 1;
  }
  else if (type_ & (GPU_TEXTURE_ARRAY | GPU_TEXTURE_CUBE)) {
    layer = off.z;
    layers = ext.z;
    off.z = 0;
    ext.z = 1;
  }
  layer += view_layer_start_;
  const size_t samples = size_t(ext.x) * ext.y * ext.z * layers;
  const uint8_t *bytes = static_cast<const uint8_t *>(data);
  std::vector<uint8_t> packed;
  /* Rows of a wider image: packed first. */
  if (unpack_row_length != 0 && int(unpack_row_length) != ext.x) {
    const size_t texel = to_bytesize(format_, format);
    packed.resize(samples * texel);
    for (size_t row = 0; row < samples / ext.x; row++) {
      memcpy(packed.data() + row * ext.x * texel, bytes + row * unpack_row_length * texel,
             ext.x * texel);
    }
    bytes = packed.data();
  }
  std::vector<uint8_t> converted;
  if (!is_compressed(device_format_) && needs_conversion(format, format_, device_format_)) {
    converted.resize(samples * to_bytesize(device_format_));
    convert_host_to_device(converted.data(), bytes, samples, format, format_, device_format_);
    bytes = converted.data();
  }
  upload(mip, off, ext, layer, layers, bytes);
}

void WGPUTexture::update_sub(int offset[3],
                             int extent[3],
                             eGPUDataFormat format,
                             GPUPixelBuffer *pixbuf)
{
  const WGPUPixelBuffer *buffer = static_cast<const WGPUPixelBuffer *>(unwrap(pixbuf));
  update_sub(0, offset, extent, format, buffer->data(), 0);
}

void WGPUTexture::read(int mip, eGPUDataFormat format, void *dst)
{
  if (!handle()) {
    return;
  }
  const int3 size = mip_size_get(mip);
  const int layers = std::max(layer_count(), 1);
  const int width = size.x, height = std::max(size.y, 1);
  const int depth = type_ == GPU_TEXTURE_3D ? std::max(size.z, 1) : layers;
  const size_t texel_bytes = to_bytesize(device_format_);
  /* A depth-stencil texture's depth is read alone, as 32-bit floats. */
  const size_t copy_texel = has_stencil() ? 4 : texel_bytes;
  const uint32_t pitch = uint32_t((width * copy_texel + 255) & ~size_t(255));
  const uint64_t bytes = uint64_t(pitch) * height * depth;
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  WGPUBuffer readback;
  readback.ensure(bytes, WGPU_BUFFER_MAP_READ | WGPU_BUFFER_COPY_DST);
  WGPUContext::get()->passes_end();
  uint8_t *p = device.command(DOLLY_GPU_COPY_TEXTURE_TO_BUFFER, 72);
  wgpu_put64(p, 8, readback.handle);
  wgpu_put64(p, 16, 0);
  wgpu_put32(p, 24, pitch);
  wgpu_put32(p, 28, uint32_t(height));
  wgpu_put64(p, 32, handle());
  wgpu_put32(p, 40, uint32_t(mip));
  wgpu_put32(p, 44, is_depth() ? 2 : 0);
  wgpu_put32(p, 48, 0);
  wgpu_put32(p, 52, 0);
  wgpu_put32(p, 56, uint32_t(view_layer_start_));
  wgpu_put32(p, 60, uint32_t(width));
  wgpu_put32(p, 64, uint32_t(height));
  wgpu_put32(p, 68, uint32_t(depth));
  std::vector<uint8_t> rows(bytes);
  const bool ok = device.read_buffer(readback.handle, 0, bytes, rows.data());
  readback.free();
  if (!ok) {
    return;
  }
  const size_t samples = size_t(width) * height * depth;
  std::vector<uint8_t> tight(samples * copy_texel);
  for (size_t row = 0; row < size_t(height) * depth; row++) {
    memcpy(tight.data() + row * width * copy_texel, rows.data() + row * pitch, width * copy_texel);
  }
  if (has_stencil()) {
    convert_device_to_host(dst, tight.data(), samples, format, TextureFormat::SFLOAT_32_DEPTH,
                           TextureFormat::SFLOAT_32_DEPTH);
    return;
  }
  convert_device_to_host(dst, tight.data(), samples, format, format_, device_format_);
}

void WGPUTexture::clear(const double4 data)
{
  if (!handle()) {
    return;
  }
  if (renderable_) {
    WGPUContext::get()->clear_texture(*this, data);
    return;
  }
  /* A format no pass draws into: its texels written. */
  const int3 size = mip_size_get(0);
  const int layers = std::max(layer_count(), 1);
  const size_t samples = size_t(size.x) * std::max(size.y, 1) *
                         (type_ == GPU_TEXTURE_3D ? std::max(size.z, 1) : layers);
  const eGPUDataFormat data_format = (format_flag_ & GPU_FORMAT_INTEGER) ?
                                         ((format_flag_ & GPU_FORMAT_SIGNED) ? GPU_DATA_INT :
                                                                               GPU_DATA_UINT) :
                                         GPU_DATA_FLOAT;
  const int components = to_component_len(format_);
  std::vector<uint8_t> texels(samples * to_bytesize(format_, data_format));
  for (size_t i = 0; i < samples; i++) {
    for (int c = 0; c < components; c++) {
      if (data_format == GPU_DATA_FLOAT) {
        reinterpret_cast<float *>(texels.data())[i * components + c] = float(data[c]);
      }
      else {
        reinterpret_cast<int32_t *>(texels.data())[i * components + c] = int32_t(data[c]);
      }
    }
  }
  int offset[3] = {0, 0, 0};
  int extent[3] = {size.x, std::max(size.y, 1), type_ == GPU_TEXTURE_3D ? size.z : layers};
  update_sub(0, offset, extent, data_format, texels.data(), 0);
}

void WGPUTexture::copy_to(Texture *tex, IndexRange mip_levels)
{
  WGPUTexture *destination = static_cast<WGPUTexture *>(tex);
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  WGPUContext::get()->passes_end();
  for (const int mip : mip_levels) {
    const int3 size = mip_size_get(mip);
    uint8_t *p = device.command(DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE, 72);
    wgpu_put64(p, 8, handle());
    wgpu_put64(p, 16, destination->handle());
    wgpu_put32(p, 24, uint32_t(mip));
    wgpu_put32(p, 36, uint32_t(view_layer_start_));
    wgpu_put32(p, 40, uint32_t(mip));
    wgpu_put32(p, 52, uint32_t(destination->view_layer_start_));
    wgpu_put32(p, 56, uint32_t(size.x));
    wgpu_put32(p, 60, uint32_t(std::max(size.y, 1)));
    wgpu_put32(p, 64,
               uint32_t(type_ == GPU_TEXTURE_3D ? std::max(size.z, 1) :
                                                  std::max(layer_count(), 1)));
  }
}

void WGPUTexture::generate_mipmap()
{
  if (mipmaps_ > 1 && renderable_ && !(format_flag_ & (GPU_FORMAT_DEPTH | GPU_FORMAT_INTEGER))) {
    WGPUContext::get()->generate_mipmaps(*this);
  }
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Pixel buffers
 * \{ */

WGPUPixelBuffer::WGPUPixelBuffer(size_t size) : PixelBuffer(size)
{
  data_ = MEM_new_uninitialized(size, __func__);
}

WGPUPixelBuffer::~WGPUPixelBuffer()
{
  MEM_delete_void(data_);
}

/** \} */

}  // namespace blender::gpu
