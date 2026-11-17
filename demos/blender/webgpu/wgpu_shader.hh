/* SPDX-FileCopyrightText: 2026 Dolly
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 *
 * Shaders: the GLSL the Vulkan backend generates (`vk_shader.cc`: one descriptor set, push
 * constants, depth retargeted to 0..1), compiled to SPIR-V by glslang and translated to WGSL by
 * spirv-wgsl, which makes the push constants a read-only storage buffer at group 0 binding 0,
 * read at a dynamic offset into the staging ring, and negates the vertex position's y. Their bind
 * group layout is group 0's bindings as the WGSL of both stages uses them.
 */

#pragma once

#include "BLI_map.hh"
#include "BLI_vector.hh"

#include "gpu_shader_create_info.hh"
#include "gpu_shader_interface.hh"
#include "gpu_shader_private.hh"
#include "gpu_state_private.hh"

#include <cstdint>
#include <string>
#include <vector>

namespace blender::gpu {

class WGPUContext;
class WGPUFrameBuffer;
struct WGPUVertexLayout;

class WGPUShaderInterface : public ShaderInterface {
 public:
  /** Every resource of the create info, in the order of its GLSL bindings. */
  struct Resource {
    shader::ShaderCreateInfo::Resource::BindType bind_type;
    int slot;
    shader::ImageType image_type;
  };
  Vector<Resource> resources;
  struct PushConstant {
    int32_t location;
    shader::Type type;
    int32_t array_size;
    uint32_t offset;
    uint32_t inner_row_padding;
  };
  Vector<PushConstant> push_constants;
  uint32_t push_constants_bytes = 0;

  void init(const shader::ShaderCreateInfo &info);
  /** A resource's GLSL binding. */
  uint32_t binding(const shader::ShaderCreateInfo::Resource &resource) const;
  const PushConstant *push_constant(int32_t location) const;
};

class WGPUShader : public Shader {
 public:
  WGPUShader(const char *name) : Shader(name) {}
  ~WGPUShader() override;

  void init(const shader::ShaderCreateInfo &info, bool is_codegen_only) override;
  const shader::ShaderCreateInfo &patch_create_info(
      const shader::ShaderCreateInfo &original_info) override
  {
    return original_info;
  }
  void vertex_shader_from_glsl(const shader::ShaderCreateInfo &info,
                               MutableSpan<StringRefNull> sources) override;
  void geometry_shader_from_glsl(const shader::ShaderCreateInfo &info,
                                 MutableSpan<StringRefNull> sources) override;
  void fragment_shader_from_glsl(const shader::ShaderCreateInfo &info,
                                 MutableSpan<StringRefNull> sources) override;
  void compute_shader_from_glsl(const shader::ShaderCreateInfo &info,
                                MutableSpan<StringRefNull> sources) override;
  bool finalize(const shader::ShaderCreateInfo *info = nullptr) override;
  void warm_cache(int /*limit*/) override {}

  void bind(const shader::SpecializationConstants *constants_state) override;
  void unbind() override {}
  void uniform_float(int location, int comp_len, int array_size, const float *data) override;
  void uniform_int(int location, int comp_len, int array_size, const int *data) override;

  std::string resources_declare(const shader::ShaderCreateInfo &info) const override;
  std::string vertex_interface_declare(const shader::ShaderCreateInfo &info) const override;
  std::string fragment_interface_declare(const shader::ShaderCreateInfo &info) const override;
  std::string geometry_interface_declare(const shader::ShaderCreateInfo &info) const override;
  std::string geometry_layout_declare(const shader::ShaderCreateInfo &info) const override;
  std::string compute_layout_declare(const shader::ShaderCreateInfo &info) const override;

  const WGPUShaderInterface &interface_get() const
  {
    return *static_cast<const WGPUShaderInterface *>(interface);
  }
  bool is_compute() const
  {
    return compute_;
  }
  /** Whether gpu@0 has the shader's modules and layout: no draw of a failed one is recorded. */
  bool ready() const
  {
    return ready_;
  }
  /** The bind group of the resources bound now, and the push constants staged at r_offset. */
  uint64_t bind_group(WGPUContext &context, uint32_t &r_offset);
  uint64_t render_pipeline(const GPUState &state,
                           const GPUStateMutable &mutable_state,
                           GPUPrimType primitive,
                           const WGPUVertexLayout &layout,
                           const WGPUFrameBuffer &framebuffer,
                           const shader::SpecializationConstants &constants);
  uint64_t compute_pipeline(const shader::SpecializationConstants &constants);

 private:
  enum Stage { VERTEX = 0, FRAGMENT = 1, COMPUTE = 2 };
  std::vector<uint32_t> spirv_[3];
  std::string glsl_[3];
  uint64_t modules_[3] = {};
  std::vector<uint32_t> overrides_[3];
  bool compute_ = false, ready_ = false, failed_ = false;

  /** A gpu@0 bind group layout entry. */
  struct Entry {
    uint32_t binding, visibility, type, a, b, c;
  };
  Vector<Entry> entries_;
  /** What Blender binds at each entry. */
  struct Source {
    enum Kind { PUSH_CONSTANTS, UNIFORM, STORAGE, TEXTURE, SAMPLER, IMAGE };
    Kind kind;
    int slot;
    /** For a sampler: whether its texture is depth, read without filtering or compared. */
    bool filterable;
  };
  Vector<Source> sources_;
  uint64_t group_layout_ = 0, pipeline_layout_ = 0;
  std::vector<uint8_t> push_data_;
  Map<uint64_t, uint64_t> pipelines_;
  Map<std::string, uint64_t> groups_;

  void compile(Stage stage, MutableSpan<StringRefNull> sources);
  bool translate(const shader::ShaderCreateInfo &info);
  template<typename T> void push_constant_set(int location, int comp_len, int array_size, const T *data);
  uint32_t constant_count(const shader::SpecializationConstants &constants) const;
  void put_constants(uint8_t *p, const shader::SpecializationConstants &constants, bool render) const;
};

}  // namespace blender::gpu
