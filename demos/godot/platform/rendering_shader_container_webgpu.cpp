#include "rendering_shader_container_webgpu.h"

#include <spirv_wgsl.h>

static bool is_buffer(RenderingDeviceCommons::UniformType p_type) {
	return p_type == RenderingDeviceCommons::UNIFORM_TYPE_UNIFORM_BUFFER || p_type == RenderingDeviceCommons::UNIFORM_TYPE_STORAGE_BUFFER ||
			p_type == RenderingDeviceCommons::UNIFORM_TYPE_UNIFORM_BUFFER_DYNAMIC || p_type == RenderingDeviceCommons::UNIFORM_TYPE_STORAGE_BUFFER_DYNAMIC;
}

bool RenderingShaderContainerWebGPU::_set_code_from_spirv(const ReflectShader &p_shader) {
	LocalVector<spirv_wgsl_uniform> uniforms;
	for (uint32_t set = 0; set < p_shader.uniform_sets.size(); set++) {
		for (const ReflectUniform &uniform : p_shader.uniform_sets[set]) {
			spirv_wgsl_uniform u = {};
			u.set = set;
			u.binding = uniform.binding;
			u.length = is_buffer(uniform.type) ? 1 : MAX(1u, uniform.length);
			u.combined = uniform.type == RenderingDeviceCommons::UNIFORM_TYPE_SAMPLER_WITH_TEXTURE;
			uniforms.push_back(u);
		}
	}
	spirv_wgsl_plan(uniforms.ptr(), uniforms.size());
	first_binding.clear();
	for (const spirv_wgsl_uniform &u : uniforms) {
		first_binding.push_back(u.first);
	}

	shaders.resize(p_shader.shader_stages.size());
	stages.resize(p_shader.shader_stages.size());
	for (uint32_t i = 0; i < p_shader.shader_stages.size(); i++) {
		const ReflectShaderStage &stage = p_shader.shader_stages[i];
		const Span<uint32_t> spirv = stage.spirv();
		spirv_wgsl_result result;
		spirv_wgsl_translate(spirv.ptr(), spirv.size(), uniforms.ptr(), uniforms.size(), &result);
		// A stage the translator refuses keeps its words: Godot compiles every variant of a shader
		// and keeps none if one fails, though it may never use that one (FSR's half precision).
		const CharString error = result.error ? vformat("%s, %s stage: %s", String(shader_name.get_data()), RenderingDeviceCommons::SHADER_STAGE_NAMES[stage.shader_stage], result.error).utf8() : CharString();
		const char *code = result.error ? error.get_data() : result.wgsl;
		const uint32_t size = strlen(code);
		Shader &shader = shaders.ptrw()[i];
		shader.shader_stage = stage.shader_stage;
		shader.code_decompressed_size = size;
		shader.code_compressed_bytes.resize(size);
		uint32_t compressed = 0;
		const bool done = compress_code((const uint8_t *)code, size, shader.code_compressed_bytes.ptrw(), &compressed, &shader.code_compression_flags);
		shader.code_compressed_bytes.resize(compressed);
		Stage &out = stages[i];
		out.entries.clear();
		if (result.error) out.entries.push_back({ 0, 0, UNAVAILABLE, 0, 0, 0 });
		for (size_t e = 0; e < result.binding_count; e++) {
			const spirv_wgsl_binding &b = result.bindings[e];
			out.entries.push_back({ b.group, b.binding, b.type, b.a, b.b, b.c });
		}
		out.overrides.clear();
		for (size_t o = 0; o < result.override_count; o++) {
			out.overrides.push_back(result.overrides[o]);
		}
		spirv_wgsl_free(&result);
		ERR_FAIL_COND_V_MSG(!done, false, "Compressing WGSL failed.");
	}
	return true;
}

uint32_t RenderingShaderContainerWebGPU::_to_bytes_reflection_binding_uniform_extra_data(uint8_t *p_bytes, uint32_t p_index) const {
	if (p_bytes) {
		memcpy(p_bytes, &first_binding[p_index], sizeof(uint32_t));
	}
	return sizeof(uint32_t);
}

uint32_t RenderingShaderContainerWebGPU::_from_bytes_reflection_binding_uniform_extra_data_start(const uint8_t *p_bytes) {
	return 0;
}

uint32_t RenderingShaderContainerWebGPU::_from_bytes_reflection_binding_uniform_extra_data(const uint8_t *p_bytes, uint32_t p_index) {
	if (first_binding.size() <= p_index) {
		first_binding.resize(p_index + 1);
	}
	memcpy(&first_binding[p_index], p_bytes, sizeof(uint32_t));
	return sizeof(uint32_t);
}

uint32_t RenderingShaderContainerWebGPU::_to_bytes_shader_extra_data(uint8_t *p_bytes, uint32_t p_index) const {
	const Stage &stage = stages[p_index];
	const uint32_t entries = stage.entries.size(), overrides = stage.overrides.size();
	const uint32_t size = sizeof(uint32_t) * (2 + entries * 6 + overrides);
	if (p_bytes) {
		uint32_t *out = (uint32_t *)p_bytes;
		*out++ = entries;
		memcpy(out, stage.entries.ptr(), entries * sizeof(LayoutEntry));
		out += entries * 6;
		*out++ = overrides;
		memcpy(out, stage.overrides.ptr(), overrides * sizeof(uint32_t));
	}
	return size;
}

uint32_t RenderingShaderContainerWebGPU::_from_bytes_shader_extra_data_start(const uint8_t *p_bytes) {
	return 0;
}

uint32_t RenderingShaderContainerWebGPU::_from_bytes_shader_extra_data(const uint8_t *p_bytes, uint32_t p_index) {
	if (stages.size() <= p_index) {
		stages.resize(p_index + 1);
	}
	Stage &stage = stages[p_index];
	const uint32_t *in = (const uint32_t *)p_bytes;
	const uint32_t entries = *in++;
	stage.entries.resize(entries);
	memcpy(stage.entries.ptr(), in, entries * sizeof(LayoutEntry));
	in += entries * 6;
	const uint32_t overrides = *in++;
	stage.overrides.resize(overrides);
	memcpy(stage.overrides.ptr(), in, overrides * sizeof(uint32_t));
	return sizeof(uint32_t) * (2 + entries * 6 + overrides);
}

Ref<RenderingShaderContainer> RenderingShaderContainerFormatWebGPU::create_container() const {
	return memnew(RenderingShaderContainerWebGPU);
}
