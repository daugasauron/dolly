// The shader container of Godot's driver on gpu@0: each stage's WGSL, which spirv_wgsl makes from
// the SPIR-V glslang compiled, with the gpu@0 layout entries and override constants it declares;
// or, for a stage it cannot translate, why (the driver keeps such a variant without modules).
#pragma once

#include "servers/rendering/rendering_shader_container.h"

class RenderingShaderContainerWebGPU : public RenderingShaderContainer {
	GDSOFTCLASS(RenderingShaderContainerWebGPU, RenderingShaderContainer);

public:
	// A gpu@0 bind group layout entry (CREATE_BIND_GROUP_LAYOUT), without its visibility.
	struct LayoutEntry {
		uint32_t group = 0, binding = 0, type = 0, a = 0, b = 0, c = 0;
	};
	struct Stage {
		LocalVector<LayoutEntry> entries;
		LocalVector<uint32_t> overrides;  // the override constant ids its module declares
		// A stage the translator refused has the one entry of type UNAVAILABLE, and its code holds
		// the translator's words instead of WGSL.
		bool unavailable() const { return entries.size() == 1 && entries[0].type == UNAVAILABLE; }
	};
	static const uint32_t UNAVAILABLE = UINT32_MAX;
	// Per uniform of the reflection, in its order: its first WGSL binding (spirv_wgsl_plan).
	LocalVector<uint32_t> first_binding;
	LocalVector<Stage> stages;

	static const uint32_t FORMAT_VERSION = 1;

protected:
	uint32_t _format() const override { return 0x4c534757; } // "WGSL"
	uint32_t _format_version() const override { return FORMAT_VERSION; }
	bool _set_code_from_spirv(const ReflectShader &p_shader) override;
	uint32_t _from_bytes_reflection_binding_uniform_extra_data_start(const uint8_t *p_bytes) override;
	uint32_t _from_bytes_reflection_binding_uniform_extra_data(const uint8_t *p_bytes, uint32_t p_index) override;
	uint32_t _from_bytes_shader_extra_data_start(const uint8_t *p_bytes) override;
	uint32_t _from_bytes_shader_extra_data(const uint8_t *p_bytes, uint32_t p_index) override;
	uint32_t _to_bytes_reflection_binding_uniform_extra_data(uint8_t *p_bytes, uint32_t p_index) const override;
	uint32_t _to_bytes_shader_extra_data(uint8_t *p_bytes, uint32_t p_index) const override;
};

class RenderingShaderContainerFormatWebGPU : public RenderingShaderContainerFormat {
public:
	Ref<RenderingShaderContainer> create_container() const override;
	ShaderLanguageVersion get_shader_language_version() const override { return SHADER_LANGUAGE_VULKAN_VERSION_1_1; }
	// Tint reads SPIR-V up to 1.3, Vulkan 1.1's.
	ShaderSpirvVersion get_shader_spirv_version() const override { return SHADER_SPIRV_VERSION_1_3; }
};
