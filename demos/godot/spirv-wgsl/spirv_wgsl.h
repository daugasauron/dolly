/* SPIR-V of Vulkan GLSL shaders (Godot's, from glslang) to WGSL for gpu@0's explicit records.
 *
 * Bindings: a shader's descriptor set s is bind group s. Set 0's binding 0 is the push
 * constants, as a read-only storage buffer the caller binds with a dynamic offset; every set 0
 * layout has it, so layouts of shaders with and without push constants stay interchangeable.
 * The uniforms of a set then take consecutive bindings in binding order: one for a buffer, one per
 * element for textures, images and samplers, and for a combined image sampler its images'
 * then its samplers'. spirv_wgsl_plan gives each uniform its first binding. */
#pragma once
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
  uint32_t set, binding;
  uint32_t length;    /* array elements, 1 for a single one or a buffer */
  uint32_t combined;  /* 1 for a combined image sampler */
  uint32_t first;     /* out: its first WGSL binding */
} spirv_wgsl_uniform;

/* A gpu@0 bind group layout entry (CREATE_BIND_GROUP_LAYOUT) without its visibility: type 1
 * uniform, 2 storage, 3 read-only storage buffer; 4 filtering, 6 comparison sampler; 7 texture
 * (a sample type, b view dimension, c multisampled); 8 storage texture (a access, b view
 * dimension, c gpu@0 format). */
typedef struct {
  uint32_t group, binding, type, a, b, c;
} spirv_wgsl_binding;

typedef struct {
  char *wgsl;                  /* NUL-terminated */
  spirv_wgsl_binding *bindings;
  size_t binding_count;
  uint32_t *overrides;         /* the override constant ids the module declares */
  size_t override_count;
  char *error;                 /* NULL on success */
} spirv_wgsl_result;

void spirv_wgsl_plan(spirv_wgsl_uniform *uniforms, size_t count);
/* Translates one stage's module; uniforms are the shader's, planned. */
void spirv_wgsl_translate(const uint32_t *words, size_t word_count, const spirv_wgsl_uniform *uniforms,
                          size_t uniform_count, spirv_wgsl_result *result);
void spirv_wgsl_free(spirv_wgsl_result *result);

#ifdef __cplusplus
}
#endif
