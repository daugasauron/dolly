/* SPDX-FileCopyrightText: 2026 Dolly
 * SPDX-FileCopyrightText: 2022 Blender Authors (the GLSL generation, from vk_shader.cc)
 *
 * SPDX-License-Identifier: GPL-2.0-or-later */

/** \file
 * \ingroup gpu
 */

#include "wgpu_shader.hh"
#include "wgpu_backend.hh"
#include "wgpu_batch.hh"
#include "wgpu_buffer.hh"
#include "wgpu_context.hh"
#include "wgpu_framebuffer.hh"
#include "wgpu_texture.hh"

#include "vk_memory_layout.hh"

#include "gpu_shader_dependency_private.hh"

#include "BKE_global.hh"
#include "CLG_log.h"

#include <fmt/format.h>
#include <fmt/ranges.h>
#include <glslang/Public/ResourceLimits.h>
#include <glslang/Public/ShaderLang.h>
#include <glslang/SPIRV/GlslangToSpv.h>
#include <spirv_wgsl.h>

#include <algorithm>
#include <mutex>
#include <sstream>

namespace blender {

static CLG_LogRef LOG = {"gpu.webgpu"};

using namespace blender::gpu::shader;

namespace gpu {

/* -------------------------------------------------------------------- */
/** \name GLSL to SPIR-V
 * \{ */

/* SPIR-V 1.3, Vulkan 1.1's: Tint reads at most 1.3. */
static std::vector<uint32_t> compile_glsl(const std::string &source,
                                          EShLanguage stage,
                                          std::string &r_log)
{
  static std::once_flag initialized;
  std::call_once(initialized, [] { glslang::InitializeProcess(); });
  glslang::TShader shader(stage);
  const char *text = source.c_str();
  shader.setStrings(&text, 1);
  shader.setEnvInput(glslang::EShSourceGlsl, stage, glslang::EShClientVulkan, 100);
  shader.setEnvClient(glslang::EShClientVulkan, glslang::EShTargetVulkan_1_1);
  shader.setEnvTarget(glslang::EShTargetSpv, glslang::EShTargetSpv_1_3);
  const EShMessages messages = EShMessages(EShMsgSpvRules | EShMsgVulkanRules);
  if (!shader.parse(GetDefaultResources(), 450, false, messages)) {
    r_log = shader.getInfoLog();
    return {};
  }
  glslang::TProgram program;
  program.addShader(&shader);
  if (!program.link(messages)) {
    r_log = program.getInfoLog();
    return {};
  }
  std::vector<uint32_t> spirv;
  glslang::SpvOptions options;
  options.generateDebugInfo = false;
  options.disableOptimizer = true;
  glslang::GlslangToSpv(*program.getIntermediate(stage), spirv, &options);
  return spirv;
}

/* The defines the Vulkan backend puts before a stage (vk_device.cc), for a device without
 * stencil export, barycentrics, layered rendering, ray queries or a provoking vertex of choice. */
static std::string glsl_patch(const char *stage_define)
{
  std::stringstream ss;
  ss << "#version 450\n";
  ss << "#define GPU_ARB_clip_control\n";
  ss << "#define GPU_ARB_derivative_control\n";
  ss << "#define gl_VertexID gl_VertexIndex\n";
  ss << "#define gpu_BaseInstance (0)\n";
  ss << "#define gpu_InstanceIndex (gl_InstanceIndex)\n";
  ss << "#define gl_InstanceID (gpu_InstanceIndex)\n";
  ss << "#define GPU_PROVOKING_VERTEX_LAST\n";
  ss << stage_define;
  GeneratedSourceList sources{GeneratedSource{"gpu_shader_glsl_extension.glsl", {}, ss.str()}};
  return fmt::to_string(
      fmt::join(gpu_shader_dependency_get_resolved_source("gpu_shader_compat_glsl.glsl", sources),
                ""));
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Interface
 * \{ */

void WGPUShaderInterface::init(const ShaderCreateInfo &info)
{
  Vector<ShaderCreateInfo::Resource> all_resources;
  all_resources.extend(info.pass_resources_);
  all_resources.extend(info.batch_resources_);
  all_resources.extend(info.geometry_resources_);

  attr_len_ = info.vertex_inputs_.size();
  uniform_len_ = info.push_constants_.size();
  constant_len_ = info.specialization_constants_.size();
  ubo_len_ = ssbo_len_ = tlas_len_ = 0;
  for (const ShaderCreateInfo::Resource &res : all_resources) {
    switch (res.bind_type) {
      case ShaderCreateInfo::Resource::BindType::IMAGE:
      case ShaderCreateInfo::Resource::BindType::SAMPLER:
        uniform_len_++;
        break;
      case ShaderCreateInfo::Resource::BindType::UNIFORM_BUFFER:
        ubo_len_++;
        break;
      case ShaderCreateInfo::Resource::BindType::STORAGE_BUFFER:
        ssbo_len_++;
        break;
      case ShaderCreateInfo::Resource::BindType::ACCELERATION_STRUCTURE:
        tlas_len_++;
        break;
    }
  }
  const int inputs = attr_len_ + ubo_len_ + uniform_len_ + ssbo_len_ + constant_len_ + tlas_len_;
  inputs_ = MEM_new_array_zeroed<ShaderInput>(inputs, __func__);
  name_buffer_ = MEM_new_array_uninitialized<char>(info.interface_names_size_, "name_buffer");
  uint32_t name_offset = 0;
  ShaderInput *input = inputs_;

  for (const ShaderCreateInfo::VertIn &attr : info.vertex_inputs_) {
    copy_input_name(input, attr.name, name_buffer_, name_offset);
    input->location = input->binding = attr.index;
    if (input->location != -1) {
      enabled_attr_mask_ |= (1 << input->location);
      attr_types_[input->location] = uint8_t(attr.type);
    }
    input++;
  }
  for (const ShaderCreateInfo::Resource &res : all_resources) {
    if (res.bind_type == ShaderCreateInfo::Resource::BindType::UNIFORM_BUFFER) {
      copy_input_name(input, res.uniformbuf.name, name_buffer_, name_offset);
      input->location = input->binding = res.slot;
      input++;
    }
  }
  /* Samplers and images share the texture namespace; images are offset as Vulkan's are. */
  for (const ShaderCreateInfo::Resource &res : all_resources) {
    if (res.bind_type == ShaderCreateInfo::Resource::BindType::SAMPLER) {
      copy_input_name(input, res.sampler.name, name_buffer_, name_offset);
      input->location = input->binding = res.slot;
      input++;
    }
    else if (res.bind_type == ShaderCreateInfo::Resource::BindType::IMAGE) {
      copy_input_name(input, res.image.name, name_buffer_, name_offset);
      input->location = input->binding = res.slot + 512;
      input++;
    }
  }
  set_image_formats_from_info(info);
  int32_t push_constant_location = 1024;
  for (const ShaderCreateInfo::PushConst &push_constant : info.push_constants_) {
    copy_input_name(input, push_constant.name, name_buffer_, name_offset);
    input->location = push_constant_location++;
    input->binding = -1;
    input++;
  }
  for (const ShaderCreateInfo::Resource &res : all_resources) {
    if (res.bind_type == ShaderCreateInfo::Resource::BindType::STORAGE_BUFFER) {
      copy_input_name(input, res.storagebuf.name, name_buffer_, name_offset);
      input->location = input->binding = res.slot;
      input++;
    }
  }
  for (const ShaderCreateInfo::Resource &res : info.geometry_resources_) {
    if (res.bind_type == ShaderCreateInfo::Resource::BindType::STORAGE_BUFFER) {
      ssbo_attr_mask_ |= (1 << res.slot);
    }
  }
  for (const ShaderCreateInfo::Resource &res : all_resources) {
    if (res.bind_type == ShaderCreateInfo::Resource::BindType::ACCELERATION_STRUCTURE) {
      copy_input_name(input, res.acceleration_structure.name, name_buffer_, name_offset);
      input->location = input->binding = res.slot;
      input++;
    }
  }
  int constant_id = 0;
  for (const SpecializationConstant &constant : info.specialization_constants_) {
    copy_input_name(input, constant.name, name_buffer_, name_offset);
    input->location = constant_id++;
    input++;
  }
  sort_inputs();

  for (int32_t u = 0; u < GPU_NUM_UNIFORMS; u++) {
    const ShaderInput *uniform = uniform_get(builtin_uniform_name(GPUUniformBuiltin(u)));
    builtins_[u] = uniform ? uniform->location : -1;
  }
  for (int32_t u = 0; u < GPU_NUM_UNIFORM_BLOCKS; u++) {
    const ShaderInput *block = ubo_get(builtin_uniform_block_name(GPUUniformBlockBuiltin(u)));
    builtin_blocks_[u] = block ? block->binding : -1;
  }

  for (const ShaderCreateInfo::Resource &res : all_resources) {
    ImageType image_type = ImageType::Float2D;
    if (res.bind_type == ShaderCreateInfo::Resource::BindType::SAMPLER) {
      image_type = res.sampler.type;
    }
    else if (res.bind_type == ShaderCreateInfo::Resource::BindType::IMAGE) {
      image_type = res.image.type;
    }
    resources.append({res.bind_type, res.slot, image_type});
  }

  /* Push constants in std430, as Vulkan's push constant blocks. */
  uint32_t offset = 0;
  for (const ShaderCreateInfo::PushConst &push_constant : info.push_constants_) {
    align<Std430>(push_constant.type, push_constant.array_size, &offset);
    const ShaderInput *shader_input = uniform_get(push_constant.name.c_str());
    push_constants.append({shader_input->location,
                           push_constant.type,
                           push_constant.array_size,
                           offset,
                           Std430::inner_row_padding(push_constant.type)});
    reserve<Std430>(push_constant.type, push_constant.array_size, &offset);
  }
  align_end_of_struct<Std140>(&offset);
  push_constants_bytes = offset;
}

uint32_t WGPUShaderInterface::binding(const ShaderCreateInfo::Resource &resource) const
{
  for (const int i : resources.index_range()) {
    if (resources[i].bind_type == resource.bind_type && resources[i].slot == resource.slot) {
      return uint32_t(i);
    }
  }
  BLI_assert_unreachable();
  return 0;
}

const WGPUShaderInterface::PushConstant *WGPUShaderInterface::push_constant(
    int32_t location) const
{
  for (const PushConstant &push_constant : push_constants) {
    if (push_constant.location == location) {
      return &push_constant;
    }
  }
  return nullptr;
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name GLSL generation, as the Vulkan backend's
 * \{ */

static const char *to_string(const Interpolation &interp)
{
  switch (interp) {
    case Interpolation::SMOOTH:
      return "smooth";
    case Interpolation::FLAT:
      return "flat";
    case Interpolation::NO_PERSPECTIVE:
      return "noperspective";
    default:
      return "unknown";
  }
}

static const char *to_string(const Type &type)
{
  switch (type) {
    case Type::float_t:
      return "float";
    case Type::float2_t:
      return "vec2";
    case Type::float3_t:
      return "vec3";
    case Type::float4_t:
      return "vec4";
    case Type::float3x3_t:
      return "mat3";
    case Type::float4x4_t:
      return "mat4";
    case Type::uint_t:
      return "uint";
    case Type::uint2_t:
      return "uvec2";
    case Type::uint3_t:
      return "uvec3";
    case Type::uint4_t:
      return "uvec4";
    case Type::int_t:
      return "int";
    case Type::int2_t:
      return "ivec2";
    case Type::int3_t:
      return "ivec3";
    case Type::int4_t:
      return "ivec4";
    case Type::bool_t:
      return "bool";
    default:
      return "unknown";
  }
}

static const char *to_string(const TextureFormat &type)
{
  switch (type) {
    case TextureFormat::UINT_8_8_8_8:
      return "rgba8ui";
    case TextureFormat::SINT_8_8_8_8:
      return "rgba8i";
    case TextureFormat::UNORM_8_8_8_8:
      return "rgba8";
    case TextureFormat::UINT_32_32_32_32:
      return "rgba32ui";
    case TextureFormat::SINT_32_32_32_32:
      return "rgba32i";
    case TextureFormat::SFLOAT_32_32_32_32:
      return "rgba32f";
    case TextureFormat::UINT_16_16_16_16:
      return "rgba16ui";
    case TextureFormat::SINT_16_16_16_16:
      return "rgba16i";
    case TextureFormat::SFLOAT_16_16_16_16:
      return "rgba16f";
    case TextureFormat::UNORM_16_16_16_16:
      return "rgba16";
    case TextureFormat::UINT_8_8:
      return "rg8ui";
    case TextureFormat::SINT_8_8:
      return "rg8i";
    case TextureFormat::UNORM_8_8:
      return "rg8";
    case TextureFormat::UINT_32_32:
      return "rg32ui";
    case TextureFormat::SINT_32_32:
      return "rg32i";
    case TextureFormat::SFLOAT_32_32:
      return "rg32f";
    case TextureFormat::UINT_16_16:
      return "rg16ui";
    case TextureFormat::SINT_16_16:
      return "rg16i";
    case TextureFormat::SFLOAT_16_16:
      return "rg16f";
    case TextureFormat::UNORM_16_16:
      return "rg16";
    case TextureFormat::UINT_8:
      return "r8ui";
    case TextureFormat::SINT_8:
      return "r8i";
    case TextureFormat::UNORM_8:
      return "r8";
    case TextureFormat::UINT_32:
      return "r32ui";
    case TextureFormat::SINT_32:
      return "r32i";
    case TextureFormat::SFLOAT_32:
      return "r32f";
    case TextureFormat::UINT_16:
      return "r16ui";
    case TextureFormat::SINT_16:
      return "r16i";
    case TextureFormat::SFLOAT_16:
      return "r16f";
    case TextureFormat::UNORM_16:
      return "r16";
    case TextureFormat::UFLOAT_11_11_10:
      return "r11f_g11f_b10f";
    case TextureFormat::UNORM_10_10_10_2:
      return "rgb10_a2";
    default:
      return "unknown";
  }
}

static const char *to_string(const PrimitiveIn &layout)
{
  switch (layout) {
    case PrimitiveIn::POINTS:
      return "points";
    case PrimitiveIn::LINES:
      return "lines";
    case PrimitiveIn::LINES_ADJACENCY:
      return "lines_adjacency";
    case PrimitiveIn::TRIANGLES:
      return "triangles";
    case PrimitiveIn::TRIANGLES_ADJACENCY:
      return "triangles_adjacency";
    default:
      return "unknown";
  }
}

static const char *to_string(const PrimitiveOut &layout)
{
  switch (layout) {
    case PrimitiveOut::POINTS:
      return "points";
    case PrimitiveOut::LINE_STRIP:
      return "line_strip";
    case PrimitiveOut::TRIANGLE_STRIP:
      return "triangle_strip";
    default:
      return "unknown";
  }
}

static const char *to_string(const DepthWrite &value)
{
  switch (value) {
    case DepthWrite::ANY:
      return "depth_any";
    case DepthWrite::GREATER:
      return "depth_greater";
    case DepthWrite::LESS:
      return "depth_less";
    default:
      return "depth_unchanged";
  }
}

static void print_image_type(std::ostream &os,
                             const ImageType &type,
                             const ShaderCreateInfo::Resource::BindType bind_type)
{
  switch (type) {
    case ImageType::IntBuffer:
    case ImageType::Int1D:
    case ImageType::Int1DArray:
    case ImageType::Int2D:
    case ImageType::Int2DArray:
    case ImageType::Int3D:
    case ImageType::IntCube:
    case ImageType::IntCubeArray:
    case ImageType::AtomicInt2D:
    case ImageType::AtomicInt2DArray:
    case ImageType::AtomicInt3D:
      os << "i";
      break;
    case ImageType::UintBuffer:
    case ImageType::Uint1D:
    case ImageType::Uint1DArray:
    case ImageType::Uint2D:
    case ImageType::Uint2DArray:
    case ImageType::Uint3D:
    case ImageType::UintCube:
    case ImageType::UintCubeArray:
    case ImageType::AtomicUint2D:
    case ImageType::AtomicUint2DArray:
    case ImageType::AtomicUint3D:
      os << "u";
      break;
    default:
      break;
  }

  if (bind_type == ShaderCreateInfo::Resource::BindType::IMAGE) {
    os << "image";
  }
  else {
    os << "sampler";
  }

  switch (type) {
    case ImageType::FloatBuffer:
    case ImageType::IntBuffer:
    case ImageType::UintBuffer:
      os << "Buffer";
      break;
    case ImageType::Float1D:
    case ImageType::Float1DArray:
    case ImageType::Int1D:
    case ImageType::Int1DArray:
    case ImageType::Uint1D:
    case ImageType::Uint1DArray:
      os << "1D";
      break;
    case ImageType::Float2D:
    case ImageType::Float2DArray:
    case ImageType::Int2D:
    case ImageType::Int2DArray:
    case ImageType::Uint2D:
    case ImageType::Uint2DArray:
    case ImageType::Shadow2D:
    case ImageType::Shadow2DArray:
    case ImageType::Depth2D:
    case ImageType::Depth2DArray:
    case ImageType::AtomicInt2D:
    case ImageType::AtomicInt2DArray:
    case ImageType::AtomicUint2D:
    case ImageType::AtomicUint2DArray:
      os << "2D";
      break;
    case ImageType::Float3D:
    case ImageType::Int3D:
    case ImageType::AtomicInt3D:
    case ImageType::Uint3D:
    case ImageType::AtomicUint3D:
      os << "3D";
      break;
    case ImageType::FloatCube:
    case ImageType::FloatCubeArray:
    case ImageType::IntCube:
    case ImageType::IntCubeArray:
    case ImageType::UintCube:
    case ImageType::UintCubeArray:
    case ImageType::ShadowCube:
    case ImageType::ShadowCubeArray:
    case ImageType::DepthCube:
    case ImageType::DepthCubeArray:
      os << "Cube";
      break;
    default:
      break;
  }

  switch (type) {
    case ImageType::Float1DArray:
    case ImageType::Float2DArray:
    case ImageType::FloatCubeArray:
    case ImageType::Int1DArray:
    case ImageType::Int2DArray:
    case ImageType::IntCubeArray:
    case ImageType::Uint1DArray:
    case ImageType::Uint2DArray:
    case ImageType::UintCubeArray:
    case ImageType::Shadow2DArray:
    case ImageType::ShadowCubeArray:
    case ImageType::Depth2DArray:
    case ImageType::DepthCubeArray:
    case ImageType::AtomicUint2DArray:
      os << "Array";
      break;
    default:
      break;
  }

  switch (type) {
    case ImageType::Shadow2D:
    case ImageType::Shadow2DArray:
    case ImageType::ShadowCube:
    case ImageType::ShadowCubeArray:
      os << "Shadow";
      break;
    default:
      break;
  }
  os << " ";
}

static std::ostream &print_qualifier(std::ostream &os, const Qualifier &qualifiers)
{
  if (!flag_is_set(qualifiers, Qualifier::no_restrict)) {
    os << "restrict ";
  }
  if (!flag_is_set(qualifiers, Qualifier::read)) {
    os << "writeonly ";
  }
  if (!flag_is_set(qualifiers, Qualifier::write)) {
    os << "readonly ";
  }
  return os;
}

static void print_resource(std::ostream &os,
                           const uint32_t location,
                           const ShaderCreateInfo::Resource &res,
                           const ShaderCreateInfo & /*info*/)
{
  os << "layout(binding = " << uint32_t(location);
  if (res.bind_type == ShaderCreateInfo::Resource::BindType::IMAGE) {
    os << ", " << to_string(res.image.format);
  }
  else if (res.bind_type == ShaderCreateInfo::Resource::BindType::UNIFORM_BUFFER) {
    os << ", std140";
  }
  else if (res.bind_type == ShaderCreateInfo::Resource::BindType::STORAGE_BUFFER) {
    os << ", std430";
  }
  os << ") ";

  switch (res.bind_type) {
    case ShaderCreateInfo::Resource::BindType::SAMPLER:
      os << "uniform ";
      print_image_type(os, res.sampler.type, res.bind_type);
      os << res.sampler.name << ";";
      break;
    case ShaderCreateInfo::Resource::BindType::IMAGE:
      os << "uniform ";
      print_qualifier(os, res.image.qualifiers);
      print_image_type(os, res.image.type, res.bind_type);
      os << res.image.name << ";";
      break;
    case ShaderCreateInfo::Resource::BindType::UNIFORM_BUFFER:
      os << "uniform _" << res.uniformbuf.name.str_no_array() << " { " << res.uniformbuf.type_name
         << " " << res.uniformbuf.name << "; };";
      break;
    case ShaderCreateInfo::Resource::BindType::STORAGE_BUFFER:
      print_qualifier(os, res.storagebuf.qualifiers);
      os << "buffer _" << res.storagebuf.name.str_no_array() << " { " << res.storagebuf.type_name
         << " " << res.storagebuf.name << "; };";
      break;
    case ShaderCreateInfo::Resource::BindType::ACCELERATION_STRUCTURE:
      os << "uniform accelerationStructureEXT " << res.acceleration_structure.name << ";";
      break;
  }
}

static void print_resource(std::ostream &os,
                           const WGPUShaderInterface &shader_interface,
                           const ShaderCreateInfo::Resource &res,
                           const ShaderCreateInfo &info)
{
  const uint32_t location = shader_interface.binding(res);
  print_resource(os, location, res, info);
}

static void print_resource(std::ostream &os,
                           const WGPUShaderInterface &shader_interface,
                           const ShaderCreateInfo::Resource &res,
                           const ShaderCreateInfo &info,
                           StringRefNull res_frequency,
                           StringRefNull &active_info_name)
{
  if (assign_if_different(active_info_name, res.info_name)) {
    os << "\n#define CREATE_INFO_RES_" << res_frequency << "_" << res.info_name << " \\\n";
  }
  print_resource(os, shader_interface, res, info);
  os << " \\\n";
}

inline int get_location_count(const Type &type)
{
  if (type == shader::Type::float4x4_t) {
    return 4;
  }
  if (type == shader::Type::float3x3_t) {
    return 3;
  }
  return 1;
}

static void print_interface_as_attributes(std::ostream &os,
                                          const std::string &prefix,
                                          const StageInterfaceInfo &iface,
                                          int &location,
                                          const StringRefNull &suffix)
{
  for (const StageInterfaceInfo::InOut &inout : iface.inouts) {
    os << "layout(location=" << location << ") " << prefix << " " << to_string(inout.interp) << " "
       << to_string(inout.type) << " " << inout.name << suffix << ";\n";
    location += get_location_count(inout.type);
  }
}

static void print_interface_as_struct(std::ostream &os,
                                      const std::string &prefix,
                                      const StageInterfaceInfo &iface,
                                      int &location,
                                      const StringRefNull &suffix)
{
  std::string struct_name = prefix + iface.name;
  Interpolation qualifier = iface.inouts[0].interp;

  os << "struct " << struct_name << " {\n";
  for (const StageInterfaceInfo::InOut &inout : iface.inouts) {
    os << "  " << to_string(inout.type) << " " << inout.name << ";\n";
  }
  os << "};\n";
  os << "layout(location=" << location << ") " << prefix << " " << to_string(qualifier) << " "
     << struct_name << " " << iface.instance_name << suffix << ";\n";

  for (const StageInterfaceInfo::InOut &inout : iface.inouts) {
    location += get_location_count(inout.type);
  }
}

static void print_interface(std::ostream &os,
                            const std::string &prefix,
                            const StageInterfaceInfo &iface,
                            int &location,
                            const StringRefNull &suffix = "")
{
  if (iface.instance_name.is_empty()) {
    print_interface_as_attributes(os, prefix, iface, location, suffix);
  }
  else {
    print_interface_as_struct(os, prefix, iface, location, suffix);
  }
}

/** \} */
static std::string main_function_wrapper(std::string &pre_main, std::string &post_main)
{
  std::stringstream ss;
  /* Prototype for the original main. */
  ss << "\n";
  ss << "void main_function_();\n";
  /* Wrapper to the main function in order to inject code processing on globals. */
  ss << "void main() {\n";
  ss << pre_main;
  ss << "  main_function_();\n";
  ss << post_main;
  ss << "}\n";
  /* Rename the original main. */
  ss << "#define main main_function_\n";
  ss << "\n";
  return ss.str();
}

static std::string combine_sources(Span<StringRefNull> sources)
{
  return fmt::to_string(fmt::join(sources, ""));
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Declarations
 * \{ */

std::string WGPUShader::resources_declare(const ShaderCreateInfo &info) const
{
  const WGPUShaderInterface &interface = interface_get();
  std::stringstream ss;

  /* Specialization constants: WGSL overrides of the same ids. */
  uint constant_id = 0;
  for (const SpecializationConstant &sc : info.specialization_constants_) {
    ss << "layout (constant_id=" << constant_id++ << ") const ";
    switch (sc.type) {
      case Type::int_t:
        ss << "int " << sc.name << "=" << std::to_string(sc.value.i) << ";\n";
        break;
      case Type::uint_t:
        ss << "uint " << sc.name << "=" << std::to_string(sc.value.u) << "u;\n";
        break;
      case Type::bool_t:
        ss << "bool " << sc.name << "=" << (sc.value.u ? "true" : "false") << ";\n";
        break;
      case Type::float_t:
        /* The bit pattern, as Vulkan's backend keeps it. */
        ss << "uint " << sc.name << "_uint=" << std::to_string(sc.value.u) << "u;\n";
        ss << "#define " << sc.name << " uintBitsToFloat(" << sc.name << "_uint)\n";
        break;
      default:
        BLI_assert_unreachable();
        break;
    }
  }
  for (const CompilationConstant &sc : info.compilation_constants_) {
    ss << "const ";
    switch (sc.type) {
      case Type::int_t:
        ss << "int " << sc.name << "=" << std::to_string(sc.value.i) << ";\n";
        break;
      case Type::uint_t:
        ss << "uint " << sc.name << "=" << std::to_string(sc.value.u) << "u;\n";
        break;
      case Type::bool_t:
        ss << "bool " << sc.name << "=" << (sc.value.u ? "true" : "false") << ";\n";
        break;
      default:
        BLI_assert_unreachable();
        break;
    }
  }
  {
    StringRefNull active_info = "";
    for (const ShaderCreateInfo::SharedVariable &sv : info.shared_variables_) {
      if (assign_if_different(active_info, sv.info_name)) {
        ss << "\n#define CREATE_INFO_RES_SHARED_VARS_" << sv.info_name << " \\\n";
      }
      ss << "shared " << to_string(sv.type) << " " << sv.name << ";";
      ss << " \\\n";
    }
    ss << "\n";
  }
  {
    StringRefNull active_info = "";
    for (const ShaderCreateInfo::Resource &res : info.pass_resources_) {
      print_resource(ss, interface, res, info, "PASS", active_info);
    }
    ss << "\n";
  }
  {
    StringRefNull active_info = "";
    for (const ShaderCreateInfo::Resource &res : info.batch_resources_) {
      print_resource(ss, interface, res, info, "BATCH", active_info);
    }
    ss << "\n";
  }
  {
    StringRefNull active_info = "";
    for (const ShaderCreateInfo::Resource &res : info.geometry_resources_) {
      print_resource(ss, interface, res, info, "GEOMETRY", active_info);
    }
    ss << "\n";
  }
  if (!info.push_constants_.is_empty()) {
    ss << "layout(push_constant, std430) uniform constants\n{\n";
    for (const ShaderCreateInfo::PushConst &uniform : info.push_constants_) {
      ss << "  " << to_string(uniform.type) << " " << uniform.name;
      if (uniform.array_size > 0) {
        ss << "[" << uniform.array_size << "]";
      }
      ss << ";\n";
    }
    ss << "};\n";
  }
  ss << "\n";
  return ss.str();
}

std::string WGPUShader::vertex_interface_declare(const ShaderCreateInfo &info) const
{
  std::stringstream ss;
  std::string pre_main;
  std::string post_main;
  for (const ShaderCreateInfo::VertIn &attr : info.vertex_inputs_) {
    ss << "layout(location = " << attr.index << ") ";
    ss << "in " << to_string(attr.type) << " " << attr.name << ";\n";
  }
  int location = 0;
  for (const StageInterfaceInfo *iface : info.vertex_out_interfaces_) {
    print_interface(ss, "out", *iface, location);
  }
  /* Clip distances as varyings the fragment stage discards by, as Vulkan's backend does on a
   * device without them. */
  if (flag_is_set(info.builtins_combined(), BuiltinBits::CLIP_DISTANCES)) {
    ss << "layout(location=" << location << ") out float vk_ClipDistance[6];\n";
    pre_main += "#define gl_ClipDistance vk_ClipDistance\n";
    location += 6;
  }
  ss << "\n";
  /* Depth from OpenGL's -1..1 to WebGPU's 0..1. */
  post_main += "gl_Position.z = (gl_Position.z + gl_Position.w) * 0.5;\n";
  ss << main_function_wrapper(pre_main, post_main);
  return ss.str();
}

std::string WGPUShader::fragment_interface_declare(const ShaderCreateInfo &info) const
{
  std::stringstream ss;
  std::string pre_main;
  const bool clip_distances = flag_is_set(info.builtins_combined(), BuiltinBits::CLIP_DISTANCES);
  if (clip_distances) {
    pre_main += "  for (int i = 0; i < 6; i++) {\n";
    pre_main += "    if (vk_ClipDistance[i] < 0.0) { discard; }\n";
    pre_main += "  }\n";
  }
  int location = 0;
  for (const StageInterfaceInfo *iface : info.vertex_out_interfaces_) {
    print_interface(ss, "in", *iface, location);
  }
  if (clip_distances) {
    ss << "layout(location=" << location << ") in float vk_ClipDistance[6];\n";
    location += 6;
  }
  if (info.early_fragment_test_) {
    ss << "layout(early_fragment_tests) in;\n";
  }
  const bool use_gl_frag_depth = info.depth_write_ != DepthWrite::UNCHANGED &&
                                 info.fragment_source_.find("gl_FragDepth") != std::string::npos;
  if (use_gl_frag_depth) {
    ss << "layout(" << to_string(info.depth_write_) << ") out float gl_FragDepth;\n";
  }
  for (const ShaderCreateInfo::FragOut &output : info.fragment_outputs_) {
    /* WebGPU blends no second source: such an output is written to nothing. */
    if (output.blend == DualBlend::SRC_1) {
      ss << to_string(output.type) << " " << output.name << ";\n";
      continue;
    }
    ss << "layout(location = " << output.index << ") ";
    ss << "out " << to_string(output.type) << " " << output.name << ";\n";
  }
  ss << "\n";
  if (!pre_main.empty()) {
    std::string post_main;
    ss << main_function_wrapper(pre_main, post_main);
  }
  return ss.str();
}

std::string WGPUShader::geometry_layout_declare(const ShaderCreateInfo & /*info*/) const
{
  return "";
}

std::string WGPUShader::geometry_interface_declare(const ShaderCreateInfo & /*info*/) const
{
  return "";
}

std::string WGPUShader::compute_layout_declare(const ShaderCreateInfo &info) const
{
  std::stringstream ss;
  ss << "layout(";
  ss << "  local_size_x = " << info.compute_layout_.local_size_x;
  ss << ", local_size_y = " << info.compute_layout_.local_size_y;
  ss << ", local_size_z = " << info.compute_layout_.local_size_z;
  ss << ") in;\n";
  ss << "\n";
  return ss.str();
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Compilation
 * \{ */

WGPUShader::~WGPUShader()
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  for (const uint64_t module : modules_) {
    device.release(module);
  }
  for (const uint64_t pipeline : pipelines_.values()) {
    device.release(pipeline);
  }
  for (const uint64_t group : groups_.values()) {
    device.release(group);
  }
  device.release(pipeline_layout_);
  device.release(group_layout_);
}

void WGPUShader::init(const ShaderCreateInfo &info, bool /*is_codegen_only*/)
{
  WGPUShaderInterface *wgpu_interface = new WGPUShaderInterface();
  wgpu_interface->init(info);
  interface = wgpu_interface;
  compute_ = !info.compute_source_.is_empty() || !info.compute_source_generated.empty();
  push_data_.assign(std::max<uint32_t>(wgpu_interface->push_constants_bytes, 16), 0);
}

void WGPUShader::compile(Stage stage, MutableSpan<StringRefNull> sources)
{
  static const char *defines[] = {
      "#define GPU_VERTEX_SHADER\n", "#define GPU_FRAGMENT_SHADER\n", "#define GPU_COMPUTE_SHADER\n"};
  static const EShLanguage languages[] = {EShLangVertex, EShLangFragment, EShLangCompute};
  const std::string patch = glsl_patch(defines[stage]);
  sources[SOURCES_INDEX_VERSION] = patch;
  glsl_[stage] = fmt::to_string(fmt::join(sources, ""));
  std::string log;
  spirv_[stage] = compile_glsl(glsl_[stage], languages[stage], log);
  if (spirv_[stage].empty()) {
    CLOG_ERROR(&LOG, "shader \"%s\" did not compile to SPIR-V:\n%s", name, log.c_str());
    failed_ = true;
  }
}

void WGPUShader::vertex_shader_from_glsl(const ShaderCreateInfo & /*info*/,
                                         MutableSpan<StringRefNull> sources)
{
  compile(VERTEX, sources);
}

void WGPUShader::geometry_shader_from_glsl(const ShaderCreateInfo & /*info*/,
                                           MutableSpan<StringRefNull> /*sources*/)
{
  CLOG_ERROR(&LOG, "shader \"%s\": WebGPU has no geometry stage", name);
  failed_ = true;
}

void WGPUShader::fragment_shader_from_glsl(const ShaderCreateInfo & /*info*/,
                                           MutableSpan<StringRefNull> sources)
{
  compile(FRAGMENT, sources);
}

void WGPUShader::compute_shader_from_glsl(const ShaderCreateInfo & /*info*/,
                                          MutableSpan<StringRefNull> sources)
{
  compile(COMPUTE, sources);
}

static bool is_depth_image(ImageType type)
{
  return ELEM(type,
              ImageType::Depth2D,
              ImageType::Depth2DArray,
              ImageType::DepthCube,
              ImageType::DepthCubeArray,
              ImageType::Shadow2D,
              ImageType::Shadow2DArray,
              ImageType::ShadowCube,
              ImageType::ShadowCubeArray);
}

static bool is_shadow_image(ImageType type)
{
  return ELEM(type,
              ImageType::Shadow2D,
              ImageType::Shadow2DArray,
              ImageType::ShadowCube,
              ImageType::ShadowCubeArray);
}

/* Each stage's SPIR-V to WGSL, its modules, and group 0's layout from what the WGSL binds:
 * refused here, before any record, where the device cannot bind it. */
bool WGPUShader::translate(const ShaderCreateInfo & /*info*/)
{
  const WGPUShaderInterface &interface = interface_get();
  Vector<spirv_wgsl_uniform> uniforms;
  for (const int i : interface.resources.index_range()) {
    spirv_wgsl_uniform u = {};
    u.set = 0;
    u.binding = uint32_t(i);
    u.length = 1;
    u.combined = interface.resources[i].bind_type == ShaderCreateInfo::Resource::BindType::SAMPLER;
    uniforms.append(u);
  }
  spirv_wgsl_plan(uniforms.data(), uniforms.size());

  /* Binding 0 is the push constants', in every layout. */
  Map<uint32_t, Entry> entries;
  entries.add(0, {0, 0, 3, 1, 0, 0});
  std::string wgsl[3];
  const Stage stages[] = {VERTEX, FRAGMENT, COMPUTE};
  for (const Stage stage : stages) {
    if (spirv_[stage].empty()) {
      continue;
    }
    spirv_wgsl_result result;
    spirv_wgsl_translate(
        spirv_[stage].data(), spirv_[stage].size(), uniforms.data(), uniforms.size(), &result);
    if (result.error) {
      CLOG_ERROR(&LOG, "shader \"%s\" did not translate to WGSL: %s", name, result.error);
      spirv_wgsl_free(&result);
      return false;
    }
    wgsl[stage] = result.wgsl;
    overrides_[stage].assign(result.overrides, result.overrides + result.override_count);
    const uint32_t visibility = stage == VERTEX ? 1 : stage == FRAGMENT ? 2 : 4;
    for (size_t e = 0; e < result.binding_count; e++) {
      const spirv_wgsl_binding &b = result.bindings[e];
      Entry *entry = entries.lookup_ptr(b.binding);
      if (entry) {
        entry->visibility |= visibility;
        /* A texture one stage samples and another only loads is sampled. */
        if (entry->type == 7 && entry->a == 2 && b.a == 1) {
          entry->a = 1;
        }
        continue;
      }
      entries.add(b.binding, {b.binding, visibility, b.type, b.a, b.b, b.c});
    }
    spirv_wgsl_free(&result);
  }
  entries.lookup(0).visibility = compute_ ? 4 : 3;

  /* What Blender binds at each entry: the planned bindings of its resources. A depth texture
   * binds as depth, or as unfilterable floats where a sampler reads it, with a sampler that does
   * not filter. */
  for (Entry &entry : entries.values()) {
    if (entry.binding == 0) {
      sources_.append({Source::PUSH_CONSTANTS, 0, false});
      continue;
    }
    bool found = false;
    for (const int i : uniforms.index_range()) {
      const WGPUShaderInterface::Resource &res = interface.resources[i];
      const uint32_t first = uniforms[i].first;
      using BindType = ShaderCreateInfo::Resource::BindType;
      if (entry.binding == first) {
        switch (res.bind_type) {
          case BindType::UNIFORM_BUFFER:
            sources_.append({Source::UNIFORM, res.slot, false});
            break;
          case BindType::STORAGE_BUFFER:
            sources_.append({Source::STORAGE, res.slot, false});
            break;
          case BindType::IMAGE:
            sources_.append({Source::IMAGE, res.slot, false});
            break;
          case BindType::SAMPLER:
            if (is_depth_image(res.image_type) && entry.type == 7) {
              entry.a = is_shadow_image(res.image_type) ? 3 : 2;
            }
            sources_.append({Source::TEXTURE, res.slot, false});
            break;
          case BindType::ACCELERATION_STRUCTURE:
            break;
        }
        found = true;
      }
      else if (res.bind_type == BindType::SAMPLER && entry.binding == first + 1) {
        const bool depth = is_depth_image(res.image_type);
        if (depth && entry.type != 6) {
          entry.type = 5;
        }
        sources_.append({Source::SAMPLER, res.slot, !depth});
        found = true;
      }
      if (found) {
        break;
      }
    }
    if (!found) {
      CLOG_ERROR(&LOG, "shader \"%s\": WGSL binding %u is no resource of it", name, entry.binding);
      return false;
    }
  }
  /* The device's limits a stage. */
  const uint64_t *limits = wgpu_device().limits;
  for (const uint32_t visibility : {1u, 2u, 4u}) {
    uint32_t sampled = 0, samplers = 0, storage_buffers = 0, storage_textures = 0, uniform_buffers = 0;
    for (const Entry &e : entries.values()) {
      if (!(e.visibility & visibility)) {
        continue;
      }
      sampled += e.type == 7;
      samplers += e.type >= 4 && e.type <= 6;
      storage_buffers += e.type == 2 || e.type == 3;
      storage_textures += e.type == 8;
      uniform_buffers += e.type == 1;
    }
    const uint64_t storage_buffer_limit = visibility == 1 ? limits[WGPU_LIMIT_STORAGE_BUFFERS_VERTEX] :
                                          visibility == 2 ? limits[WGPU_LIMIT_STORAGE_BUFFERS_FRAGMENT] :
                                                            limits[WGPU_LIMIT_STORAGE_BUFFERS];
    if (sampled > limits[WGPU_LIMIT_SAMPLED_TEXTURES] || samplers > limits[WGPU_LIMIT_SAMPLERS] ||
        storage_buffers > storage_buffer_limit ||
        storage_textures > limits[WGPU_LIMIT_STORAGE_TEXTURES] ||
        uniform_buffers > limits[WGPU_LIMIT_UNIFORM_BUFFERS])
    {
      CLOG_ERROR(&LOG,
                 "shader \"%s\": a stage binds %u sampled textures, %u samplers, %u storage "
                 "buffers, %u storage textures and %u uniform buffers, more than the device "
                 "allows",
                 name, sampled, samplers, storage_buffers, storage_textures, uniform_buffers);
      return false;
    }
  }

  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  for (const Stage stage : stages) {
    if (wgsl[stage].empty()) {
      continue;
    }
    uint8_t *p = device.create(DOLLY_GPU_CREATE_SHADER, 24 + uint32_t(wgsl[stage].size()), modules_[stage]);
    wgpu_put32(p, 16, uint32_t(wgsl[stage].size()));
    memcpy(p + 24, wgsl[stage].data(), wgsl[stage].size());
  }
  /* Entries in binding order; Map keeps no order. */
  Vector<std::pair<Entry, Source>> ordered;
  {
    int i = 0;
    for (const Entry &entry : entries.values()) {
      ordered.append({entry, sources_[i++]});
    }
  }
  std::sort(ordered.begin(), ordered.end(), [](const auto &a, const auto &b) {
    return a.first.binding < b.first.binding;
  });
  entries_.clear();
  sources_.clear();
  for (const auto &[entry, source] : ordered) {
    entries_.append(entry);
    sources_.append(source);
  }
  uint8_t *p = device.create(
      DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, 24 + 32 * uint32_t(entries_.size()), group_layout_);
  wgpu_put32(p, 16, uint32_t(entries_.size()));
  for (const int i : entries_.index_range()) {
    const Entry &e = entries_[i];
    uint8_t *entry = p + 24 + 32 * i;
    wgpu_put32(entry, 0, e.binding);
    wgpu_put32(entry, 4, e.visibility);
    wgpu_put32(entry, 8, e.type);
    wgpu_put32(entry, 12, e.a);
    wgpu_put32(entry, 16, e.b);
    wgpu_put32(entry, 20, e.c);
  }
  p = device.create(DOLLY_GPU_CREATE_PIPELINE_LAYOUT, 32, pipeline_layout_);
  wgpu_put32(p, 16, 1);
  wgpu_put64(p, 24, group_layout_);
  return true;
}

bool WGPUShader::finalize(const ShaderCreateInfo *info)
{
  if (info == nullptr || failed_) {
    return false;
  }
  ready_ = translate(*info);
  for (std::vector<uint32_t> &spirv : spirv_) {
    spirv.clear();
  }
  if (ready_) {
    for (std::string &glsl : glsl_) {
      glsl.clear();
    }
  }
  return ready_;
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Uniforms
 * \{ */

void WGPUShader::bind(const SpecializationConstants *constants_state)
{
  WGPUContext *context = WGPUContext::get();
  context->constants = constants_state ? *constants_state : SpecializationConstants{};
}

template<typename T>
void WGPUShader::push_constant_set(int location, int comp_len, int array_size, const T *data)
{
  const WGPUShaderInterface::PushConstant *layout = interface_get().push_constant(location);
  if (layout == nullptr) {
    return;
  }
  T *dst = reinterpret_cast<T *>(push_data_.data() + layout->offset);
  const bool tightly_packed = comp_len != 3 || array_size == 0;
  if (layout->inner_row_padding == 0 && (tightly_packed || layout->array_size == 0)) {
    const size_t bytes = size_t(comp_len) * std::max(array_size, 1) * sizeof(T);
    memcpy(dst, data, std::min(bytes, push_data_.size() - layout->offset));
    return;
  }
  const T *src = data;
  if (layout->inner_row_padding == 0) {
    /* vec3 arrays: a 16-byte stride. */
    for (int i = 0; i < array_size; i++) {
      memcpy(dst, src, comp_len * sizeof(T));
      src += comp_len;
      dst += 4;
    }
    return;
  }
  /* mat3: columns of a 16-byte stride. */
  for (int component = 0; component < comp_len; component++) {
    *dst++ = *src++;
    if ((component % layout->inner_row_padding) == (layout->inner_row_padding - 1)) {
      dst++;
    }
  }
}

void WGPUShader::uniform_float(int location, int comp_len, int array_size, const float *data)
{
  push_constant_set(location, comp_len, array_size, data);
}

void WGPUShader::uniform_int(int location, int comp_len, int array_size, const int *data)
{
  push_constant_set(location, comp_len, array_size, data);
}

/** \} */

/* -------------------------------------------------------------------- */
/** \name Bind groups and pipelines
 * \{ */

uint64_t WGPUShader::bind_group(WGPUContext &context, uint32_t &r_offset)
{
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t ring;
  r_offset = uint32_t(device.stage(
      push_data_.data(), push_data_.size(), device.limits[WGPU_LIMIT_STORAGE_ALIGNMENT], ring));
  WGPUStateManager &state = context.wgpu_state();
  /* The entries' resources: kind, handle, offset, size. */
  struct Bound {
    uint32_t kind;
    uint64_t resource, offset, size;
  };
  Vector<Bound, 16> bound;
  std::string key;
  for (const int i : entries_.index_range()) {
    const Source &source = sources_[i];
    Bound b = {0, 0, 0, 0};
    switch (source.kind) {
      case Source::PUSH_CONSTANTS:
        b = {0, ring, 0, push_data_.size()};
        break;
      case Source::UNIFORM: {
        WGPUBuffer *buffer = source.slot < WGPUStateManager::UNIFORM_SLOTS ?
                                 state.uniforms[source.slot] :
                                 nullptr;
        if (buffer == nullptr || buffer->handle == 0) {
          CLOG_WARN(&LOG, "shader \"%s\": no uniform buffer at slot %d", name, source.slot);
          return 0;
        }
        b = {0, buffer->handle, 0, buffer->size};
        buffer->use();
        break;
      }
      case Source::STORAGE: {
        const WGPUStateManager::StorageBinding binding =
            source.slot < WGPUStateManager::STORAGE_SLOTS ? state.storage[source.slot] :
                                                             WGPUStateManager::StorageBinding{};
        if (binding.buffer == nullptr || binding.buffer->handle == 0) {
          CLOG_WARN(&LOG, "shader \"%s\": no storage buffer at slot %d", name, source.slot);
          return 0;
        }
        b = {0, binding.buffer->handle, binding.offset, binding.buffer->size - binding.offset};
        binding.buffer->use();
        break;
      }
      case Source::TEXTURE:
      case Source::SAMPLER: {
        const WGPUStateManager::TextureBinding binding =
            source.slot < WGPUStateManager::TEXTURE_UNITS ? state.textures[source.slot] :
                                                             WGPUStateManager::TextureBinding{};
        if (binding.texture == nullptr || binding.texture->handle() == 0) {
          CLOG_WARN(&LOG, "shader \"%s\": no texture at unit %d", name, source.slot);
          return 0;
        }
        if (source.kind == Source::TEXTURE) {
          b = {2, binding.texture->sampled_view(), 0, 0};
          binding.texture->used_in = device.submission();
        }
        else {
          b = {1, wgpu_sampler(binding.sampler, source.filterable && binding.texture->is_filterable()), 0, 0};
        }
        break;
      }
      case Source::IMAGE: {
        WGPUTexture *texture = source.slot < GPU_MAX_IMAGE ? state.images[source.slot] : nullptr;
        if (texture == nullptr || texture->handle() == 0) {
          CLOG_WARN(&LOG, "shader \"%s\": no image at unit %d", name, source.slot);
          return 0;
        }
        b = {2, texture->storage_view(), 0, 0};
        texture->used_in = device.submission();
        break;
      }
    }
    bound.append(b);
    key += fmt::format("{},{},{},{};", b.kind, b.resource, b.offset, b.size);
  }
  if (const uint64_t *found = groups_.lookup_ptr(key)) {
    return *found;
  }
  uint64_t group;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_BIND_GROUP, 32 + 32 * uint32_t(bound.size()), group);
  wgpu_put64(p, 16, group_layout_);
  wgpu_put32(p, 24, uint32_t(bound.size()));
  for (const int i : bound.index_range()) {
    uint8_t *entry = p + 32 + 32 * i;
    wgpu_put32(entry, 0, entries_[i].binding);
    wgpu_put32(entry, 4, bound[i].kind);
    wgpu_put64(entry, 8, bound[i].resource);
    wgpu_put64(entry, 16, bound[i].offset);
    wgpu_put64(entry, 24, bound[i].size);
  }
  groups_.add(key, group);
  return group;
}

uint32_t WGPUShader::constant_count(const SpecializationConstants &constants) const
{
  uint32_t count = 0;
  for (const int i : constants.types.index_range()) {
    for (const std::vector<uint32_t> &ids : overrides_) {
      if (std::find(ids.begin(), ids.end(), uint32_t(i)) != ids.end()) {
        count++;
        break;
      }
    }
  }
  return count;
}

/* Override constants by id, each for the stages whose module declares it. */
void WGPUShader::put_constants(uint8_t *p, const SpecializationConstants &constants, bool render) const
{
  int at = 0;
  for (const int i : constants.types.index_range()) {
    uint32_t stages = 0;
    for (const Stage stage : {VERTEX, FRAGMENT, COMPUTE}) {
      if (std::find(overrides_[stage].begin(), overrides_[stage].end(), uint32_t(i)) !=
          overrides_[stage].end())
      {
        stages |= stage == FRAGMENT ? 2 : 1;
      }
    }
    if (!stages) {
      continue;
    }
    double value = 0.0;
    switch (constants.types[i]) {
      case Type::int_t:
        value = constants.values[i].i;
        break;
      case Type::float_t:
      case Type::uint_t:
      case Type::bool_t:
      default:
        value = constants.values[i].u;
        break;
    }
    uint8_t *c = p + 16 * at++;
    wgpu_put32(c, 0, uint32_t(i));
    wgpu_put32(c, 4, render ? stages : 0);
    memcpy(c + 8, &value, 8);
  }
}

static uint32_t compare_op(GPUDepthTest test)
{
  switch (test) {
    case GPU_DEPTH_LESS:
      return 2;
    case GPU_DEPTH_LESS_EQUAL:
      return 4;
    case GPU_DEPTH_EQUAL:
      return 3;
    case GPU_DEPTH_GREATER:
      return 5;
    case GPU_DEPTH_GREATER_EQUAL:
      return 7;
    default:
      return 8;
  }
}

static uint32_t topology(GPUPrimType primitive)
{
  switch (primitive) {
    case GPU_PRIM_POINTS:
      return 4;
    case GPU_PRIM_LINES:
      return 2;
    case GPU_PRIM_LINE_STRIP:
    case GPU_PRIM_LINE_LOOP:
      return 3;
    case GPU_PRIM_TRI_STRIP:
      return 1;
    default:
      return 0;
  }
}

/* Factors: 0 zero, 1 one, 2 src, 3 one-minus-src, 4 dst, 5 one-minus-dst, 6 src-alpha,
 * 7 one-minus-src-alpha, 8 dst-alpha, 9 one-minus-dst-alpha. As vk_graphics_pipeline.hh. */
static void blend_state(GPUBlend blend, uint32_t r[7])
{
  /* enable, color op, src, dst, alpha op, src, dst */
  uint32_t op = 0, cs = 6, cd = 7, as = 1, ad = 7;
  switch (blend) {
    case GPU_BLEND_ALPHA_PREMULT:
      cs = 1, cd = 7, as = 1, ad = 7;
      break;
    case GPU_BLEND_ADDITIVE:
      cs = 6, cd = 1, as = 0, ad = 1;
      break;
    case GPU_BLEND_MIN:
      op = 3, cs = cd = as = ad = 1;
      break;
    case GPU_BLEND_MAX:
      op = 4, cs = cd = as = ad = 1;
      break;
    case GPU_BLEND_SUBTRACT:
      op = 2, cs = cd = as = ad = 1;
      break;
    case GPU_BLEND_ADDITIVE_PREMULT:
      cs = cd = as = ad = 1;
      break;
    case GPU_BLEND_MULTIPLY:
      cs = 4, cd = 0, as = 8, ad = 0;
      break;
    case GPU_BLEND_INVERT:
      cs = 5, cd = 0, as = 0, ad = 1;
      break;
    case GPU_BLEND_OIT:
      cs = 1, cd = 1, as = 0, ad = 7;
      break;
    case GPU_BLEND_BACKGROUND:
      cs = 9, cd = 6, as = 0, ad = 6;
      break;
    case GPU_BLEND_ALPHA_UNDER_PREMUL:
      cs = 9, cd = 1, as = 9, ad = 1;
      break;
    case GPU_BLEND_OVERLAY_MASK_FROM_ALPHA:
      cs = 0, cd = 7, as = 0, ad = 7;
      break;
    case GPU_BLEND_TRANSPARENCY:
      cs = 1, cd = 6, as = 0, ad = 6;
      break;
    default:
      /* GPU_BLEND_ALPHA, and GPU_BLEND_CUSTOM's second source, which WebGPU has not. */
      break;
  }
  r[0] = blend != GPU_BLEND_NONE;
  r[1] = op, r[2] = cs, r[3] = cd, r[4] = op, r[5] = as, r[6] = ad;
}

uint64_t WGPUShader::render_pipeline(const GPUState &state,
                                     const GPUStateMutable &mutable_state,
                                     GPUPrimType primitive,
                                     const WGPUVertexLayout &layout,
                                     const WGPUFrameBuffer &framebuffer,
                                     const SpecializationConstants &constants)
{
  if (!ready_ || compute_) {
    return 0;
  }
  uint32_t colors[GPU_FB_MAX_COLOR_ATTACHMENT], color_count, depth_format;
  framebuffer.formats(colors, color_count, depth_format);
  const bool stencil = framebuffer.has_stencil();
  GPUState pipeline_state = state;
  pipeline_state.clip_control = 0;
  pipeline_state.polygon_smooth = 0;
  pipeline_state.line_smooth = 0;
  pipeline_state.clip_distances = 0;
  uint64_t key = pipeline_state.data * 0x9E3779B97F4A7C15ull;
  key ^= layout.hash() + 0x632BE59BD9B4E019ull + (key << 6) + (key >> 2);
  key ^= uint64_t(topology(primitive)) << 3;
  for (uint32_t i = 0; i < color_count; i++) {
    key = key * 31 + colors[i];
  }
  key = key * 31 + depth_format;
  if (stencil) {
    key = key * 31 + mutable_state.stencil_compare_mask * 257 + mutable_state.stencil_write_mask;
  }
  for (const int i : constants.values.index_range()) {
    key = key * 1000003 + constants.values[i].u;
  }
  if (const uint64_t *found = pipelines_.lookup_ptr(key)) {
    return *found;
  }

  const uint32_t buffer_count = uint32_t(layout.buffers.size());
  const uint32_t attribute_count = uint32_t(layout.attributes.size());
  const uint32_t constants_count = constant_count(constants);
  const bool fragment = modules_[FRAGMENT] != 0;
  const uint32_t targets = fragment ? color_count : 0;
  const uint32_t bytes = 160 + 40 * targets + 16 * (buffer_count + attribute_count + constants_count) +
                         4 + (fragment ? 4 : 0);
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t pipeline;
  uint8_t *p = device.create(DOLLY_GPU_CREATE_RENDER_PIPELINE, bytes, pipeline);
  wgpu_put64(p, 16, pipeline_layout_);
  wgpu_put64(p, 24, modules_[VERTEX]);
  wgpu_put64(p, 32, fragment ? modules_[FRAGMENT] : 0);
  wgpu_put32(p, 40, topology(primitive));
  wgpu_put32(p, 44, 0);
  /* Framebuffers keep Vulkan's rows, so faces wind as Vulkan's backend sees them. */
  wgpu_put32(p, 48, state.invert_facing ? 0 : 1);
  wgpu_put32(p, 52, state.culling_test == GPU_CULL_FRONT ? 1 : state.culling_test == GPU_CULL_BACK ? 2 : 0);
  wgpu_put32(p, 56, 0);
  wgpu_put32(p, 60, depth_format);
  wgpu_put32(p, 64, depth_format && (state.write_mask & GPU_WRITE_DEPTH) ? 1 : 0);
  wgpu_put32(p, 68, depth_format ? compare_op(GPUDepthTest(state.depth_test)) : 0);
  /* Stencil, as vk_graphics_pipeline.hh: front then back. */
  uint32_t compare = 8, pass = 0, depth_fail = 0, back_pass = 0, back_depth_fail = 0;
  if (stencil) {
    switch (GPUStencilTest(state.stencil_test)) {
      case GPU_STENCIL_EQUAL:
        compare = 3;
        break;
      case GPU_STENCIL_NEQUAL:
        compare = 6;
        break;
      default:
        compare = 8;
        break;
    }
    switch (GPUStencilOp(state.stencil_op)) {
      case GPU_STENCIL_OP_REPLACE:
        pass = back_pass = 2;
        break;
      case GPU_STENCIL_OP_COUNT_DEPTH_PASS:
        pass = 7, back_pass = 6;
        break;
      case GPU_STENCIL_OP_COUNT_DEPTH_FAIL:
        depth_fail = 6, back_depth_fail = 7;
        break;
      default:
        break;
    }
  }
  wgpu_put32(p, 72, compare);
  wgpu_put32(p, 76, 0);
  wgpu_put32(p, 80, depth_fail);
  wgpu_put32(p, 84, pass);
  wgpu_put32(p, 88, compare);
  wgpu_put32(p, 92, 0);
  wgpu_put32(p, 96, back_depth_fail);
  wgpu_put32(p, 100, back_pass);
  const bool stencil_on = stencil && state.stencil_test != GPU_STENCIL_NONE;
  wgpu_put32(p, 104, stencil_on ? mutable_state.stencil_compare_mask : 0xff);
  wgpu_put32(p, 108,
             stencil_on && (state.write_mask & GPU_WRITE_STENCIL) ? mutable_state.stencil_write_mask : 0);
  wgpu_put32(p, 124, 1);
  wgpu_put32(p, 128, 0xffffffffu);
  wgpu_put32(p, 136, targets);
  wgpu_put32(p, 140, buffer_count);
  wgpu_put32(p, 144, attribute_count);
  wgpu_put32(p, 148, constants_count);
  wgpu_put32(p, 152, 4);
  wgpu_put32(p, 156, fragment ? 4 : 0);
  uint32_t at = 160;
  uint32_t blend[7];
  blend_state(GPUBlend(state.blend), blend);
  for (uint32_t i = 0; i < targets; i++, at += 40) {
    if (colors[i] == 0) {
      wgpu_put32(p, at + 36, 1);
      continue;
    }
    const bool integer = wgpu_format_is_integer(colors[i]);
    const bool blendable = !integer && (!ELEM(colors[i], 21, 36, 42) ||
                                        device.has_feature(WGPU_FEATURE_FLOAT32_BLENDABLE));
    uint32_t mask = 0;
    mask |= (state.write_mask & GPU_WRITE_RED) ? 1 : 0;
    mask |= (state.write_mask & GPU_WRITE_GREEN) ? 2 : 0;
    mask |= (state.write_mask & GPU_WRITE_BLUE) ? 4 : 0;
    mask |= (state.write_mask & GPU_WRITE_ALPHA) ? 8 : 0;
    /* A shader without the output writes nothing there. */
    if (!(fragment_output_bits & (1u << i))) {
      mask = 0;
    }
    wgpu_put32(p, at, colors[i]);
    wgpu_put32(p, at + 4, mask);
    wgpu_put32(p, at + 8, blend[0] && blendable ? 1 : 0);
    for (int k = 0; k < 6; k++) {
      wgpu_put32(p, at + 12 + 4 * k, blend[0] && blendable ? blend[1 + k] : 0);
    }
  }
  for (const WGPUVertexLayout::Buffer &buffer : layout.buffers) {
    wgpu_put32(p, at, buffer.stride);
    wgpu_put32(p, at + 4, buffer.step);
    at += 16;
  }
  for (const WGPUVertexLayout::Attribute &attribute : layout.attributes) {
    wgpu_put32(p, at, attribute.slot);
    wgpu_put32(p, at + 4, attribute.location);
    wgpu_put32(p, at + 8, attribute.format);
    wgpu_put32(p, at + 12, attribute.offset);
    at += 16;
  }
  put_constants(p + at, constants, true);
  at += 16 * constants_count;
  memcpy(p + at, "main", 4);
  if (fragment) {
    memcpy(p + at + 4, "main", 4);
  }
  pipelines_.add(key, pipeline);
  return pipeline;
}

uint64_t WGPUShader::compute_pipeline(const SpecializationConstants &constants)
{
  if (!ready_ || !compute_) {
    return 0;
  }
  uint64_t key = 0;
  for (const int i : constants.values.index_range()) {
    key = key * 1000003 + constants.values[i].u;
  }
  if (const uint64_t *found = pipelines_.lookup_ptr(key)) {
    return *found;
  }
  const uint32_t constants_count = constant_count(constants);
  WGPUDevice &device = wgpu_device();
  std::lock_guard lock(device.mutex);
  uint64_t pipeline;
  uint8_t *p = device.create(
      DOLLY_GPU_CREATE_COMPUTE_PIPELINE, 40 + 16 * constants_count + 4, pipeline);
  wgpu_put64(p, 16, pipeline_layout_);
  wgpu_put64(p, 24, modules_[COMPUTE]);
  wgpu_put32(p, 32, constants_count);
  wgpu_put32(p, 36, 4);
  put_constants(p + 40, constants, false);
  memcpy(p + 40 + 16 * constants_count, "main", 4);
  pipelines_.add(key, pipeline);
  return pipeline;
}

/** \} */

}  // namespace gpu
}  // namespace blender
