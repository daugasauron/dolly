// SPDX-License-Identifier: GPL-2.0-or-later
// DarkPlaces' software rasterizer interface (dpsoftrast.h) drawn on gpu@0.
// The engine's RENDERPATH_SOFT calls these unchanged. Where gpu@0 gives no
// device, every call goes to the software rasterizer itself, compiled with
// its DPSOFTRAST_ names as dpsoft_ (the Makefile's DPSOFTRAST_CALLS).
//
// The frame is drawn into a colour and a depth texture and copied onto the
// surface by DPSOFTRAST_Finish; a copy of the frame into a texture is a draw
// from the colour texture, and the frame is read back from the surface.
// Consecutive draws with the same pipeline, textures and uniforms merge into
// one: their vertex ranges are gathered into one set of arrays. A merged
// draw's arrays go into a stream buffer and its uniforms into slots of a
// storage buffer that the shaders (dpshaders.c, translated to WGSL by naga)
// index by the draw's instance index; both are written once per command
// packet. A larger draw whose arrays and indices held the same bytes when
// drawn before (a static model's) reads them from a geometry buffer instead,
// where they were written once. Pipelines, shader modules, samplers and
// texture groups are created on first use and kept. A packet is sent when it
// fills, which ends the render pass, and at the end of the frame.
#include <dolly/gpu.h>
#include <errno.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "quakedef.h"
#include "dpsoftrast.h"

#define SHADER_DIRECTORY "/usr/share/xonotic/shaders"
#define MAX_TEXTURES 16384
#define MAX_PAIRS 1024
#define MAX_PIPELINES 2048
#define MAX_GROUPS 4096
#define MAX_SLOTS 256
#define OBJECT_BUDGET 3800 // below the scope's 4096 objects, with room for releases in flight
#define STREAM_BYTES (1u << 20)
#define UNIFORM_BYTES (256u << 10)
#define DRAW_BYTES (960u << 10) // the most arrays and indices of one draw, below a packet
#define MERGED_BYTES (256u << 10) // the most of draws merged into one
#define ATTRIBUTES (2 + DPSOFTRAST_MAXTEXCOORDARRAYS)
#define GEOMETRY_BYTES (64u << 20)
#define MAX_RANGES 8192
#define CACHED_VERTICES 64 // fewer go into the stream, merged
#define INDICES 16

#define SOFT(name) extern __typeof__(DPSOFTRAST_##name) dpsoft_##name;
SOFT(Init) SOFT(Shutdown) SOFT(Flush) SOFT(Finish) SOFT(Texture_New) SOFT(Texture_Free) SOFT(Texture_UpdatePartial)
SOFT(Texture_UpdateFull) SOFT(Texture_GetWidth) SOFT(Texture_GetHeight) SOFT(Texture_GetDepth) SOFT(Texture_GetPixelPointer)
SOFT(Texture_Filter) SOFT(SetRenderTargets) SOFT(Viewport) SOFT(ClearColor) SOFT(ClearDepth) SOFT(ColorMask) SOFT(DepthTest)
SOFT(ScissorTest) SOFT(Scissor) SOFT(ClipPlane) SOFT(BlendFunc) SOFT(BlendSubtract) SOFT(DepthMask) SOFT(DepthFunc)
SOFT(DepthRange) SOFT(PolygonOffset) SOFT(CullFace) SOFT(Color4f) SOFT(GetPixelsBGRA) SOFT(CopyRectangleToTexture)
SOFT(SetTexture) SOFT(SetVertexPointer) SOFT(SetColorPointer) SOFT(SetColorPointer4ub) SOFT(SetTexCoordPointer)
SOFT(SetShader) SOFT(Uniform4f) SOFT(Uniform4fv) SOFT(UniformMatrix4fv) SOFT(Uniform1i) SOFT(DrawTriangles)
#define SOFTWARE(...) do { if (!gpu_open) { __VA_ARGS__; return; } } while (0)

typedef struct gpu_texture_s
{
	uint64_t handle;
	int width, height, layers, mips, flags, filter;
}
gpu_texture_t;

typedef struct pair_s
{
	int mode, loaded;
	dpuint64 permutation;
	uint64_t vertex, fragment;
	int inputs[ATTRIBUTES]; // the vertex inputs the vertex stage reads
	int units, cubes; // bit u: texture unit u (binding 2u, sampler 2u+1); the cube ones
	int uniforms; // whether a stage reads the storage buffer of slots
	int slots;
	short slot[MAX_SLOTS]; // the DPSOFTRAST_UNIFORM row each slot holds
}
pair_t;

typedef struct pipeline_state_s
{
	pair_t *pair;
	int format[ATTRIBUTES]; // components of each vertex buffer, 0 for none
	int blending, source, destination, subtract, test, write, cull, mask, bias;
	float slope;
}
pipeline_state_t;

typedef struct pipeline_s
{
	pipeline_state_t state;
	uint64_t handle, uniform_group;
}
pipeline_t;

typedef struct group_s
{
	pipeline_t *pipeline;
	uint64_t handle;
	int texture[DPSOFTRAST_MAXTEXTUREUNITS], sampler[DPSOFTRAST_MAXTEXTUREUNITS];
	int packet;
}
group_t;

typedef struct vertex_array_s
{
	const void *pointer;
	size_t stride;
	int components, unsigned_bytes;
}
vertex_array_t;

// The draws merged so far, waiting for one that differs.
typedef struct merged_s
{
	pipeline_t *pipeline;
	uint64_t group;
	int vertices, indices, capacity, index_capacity;
	float *array[ATTRIBUTES];
	uint32_t *index;
	float slot_data[MAX_SLOTS * 4];
}
merged_t;

// A range of an engine array, or of a draw's indices, as a draw read it. Seen
// again with the same bytes, it is written to the geometry buffer.
typedef struct range_s
{
	const void *pointer;
	size_t stride;
	int kind, first, count; // kind: the components, +8 for bytes; or INDICES + the size of an index
	unsigned char *bytes; // the engine's bytes, as last seen
	uint32_t offset, size; // where the geometry buffer holds them; size 0 until seen twice
	int frame;
}
range_t;

static dolly_gpu gpu;
static int gpu_open, command_limit, packet_number;
static uint64_t next_handle;
static int objects;

static gpu_texture_t textures[MAX_TEXTURES];
static unsigned char texture_tokens[MAX_TEXTURES]; // Texture_GetPixelPointer's answers
static int textures_end = 1;
static uint64_t samplers[8], white_texture, black_cube;
static pair_t pairs[MAX_PAIRS];
static int pairs_count;
static pipeline_t pipelines[MAX_PIPELINES];
static int pipelines_count;
static group_t groups[MAX_GROUPS];
static int groups_count;
static uint64_t releases[MAX_GROUPS];
static int releases_count;
static merged_t merged;
static range_t ranges[MAX_RANGES];
static int ranges_count, range_index[2 * MAX_RANGES], frame_number, geometry_full;
static uint64_t geometry_buffer;
static uint32_t geometry_used;

static int fb_width, fb_height, target_is_texture, surface_bgra;
static uint64_t color_target, depth_target, stream_buffer, uniform_buffer, blit_pipeline, blit_group, copy_pipeline, copy_group, capture_buffer;
static unsigned char stream_data[STREAM_BYTES], uniform_data[UNIFORM_BYTES];
static uint32_t stream_used, uniform_used;
static int last_slot = -1;
static pair_t *last_slot_pair;
static int pass_open, pass_clear_color, pass_clear_depth, viewport_set, encoded;
static float clear_color[4], clear_depth = 1;

// The engine's state as DPSOFTRAST receives it.
static int viewport[4], scissor[4], scissor_test, color_mask[4] = {1, 1, 1, 1};
static int depth_test = 1, depth_mask = 1, depth_func = GL_LEQUAL, cull_face, blend[2] = {GL_ONE, GL_ZERO}, blend_subtract;
static float depth_range[2] = {0, 1}, polygon_offset[2], constant_color[4] = {1, 1, 1, 1};
static int bound_texture[DPSOFTRAST_MAXTEXTUREUNITS];
static vertex_array_t arrays[ATTRIBUTES];
static pair_t *shader;
static float uniform4f[DPSOFTRAST_UNIFORM_TOTAL * 4];
static const float default_attribute[4] = {0, 0, 0, 1};


// Each kind of shortfall is printed once, with the details of its first occurrence.
static void Warn(const char *format, ...)
{
	static const char *warned[64];
	int i = 0;
	while (i < 64 && warned[i] && warned[i] != format)
		i++;
	if (i == 64 || warned[i])
		return;
	warned[i] = format;
	char text[256];
	va_list arguments;
	va_start(arguments, format);
	dpvsnprintf(text, sizeof(text), format, arguments);
	va_end(arguments);
	Con_Printf("dpgpurast: %s\n", text);
}

static void U32(void *p, size_t at, uint32_t v) {memcpy((char *)p + at, &v, 4);}
static void U64(void *p, size_t at, uint64_t v) {memcpy((char *)p + at, &v, 8);}
static void F32(void *p, size_t at, float v) {memcpy((char *)p + at, &v, 4);}
static size_t Align(size_t n, size_t a) {return (n + a - 1) / a * a;}

static uint64_t NewHandle(void)
{
	objects++;
	return ++next_handle;
}

static void WriteBuffer(uint64_t buffer, const void *data, uint32_t bytes)
{
	void *p = dolly_gpu_record(&gpu, DOLLY_GPU_WRITE_BUFFER, 32 + bytes);
	U64(p, 8, buffer);U32(p, 24, 32);U32(p, 28, bytes);
	memcpy((char *)p + 32, data, bytes);
}

static void EndPass(void)
{
	if (pass_open)
		dolly_gpu_record(&gpu, DOLLY_GPU_END_RENDER_PASS, 8);
	pass_open = false;
}

// Sends the packet: writes the arrays and uniforms its draws read, ends the
// render pass, copies the frame onto the surface when PRESENT (and the
// CAPTURE rectangle of it into the capture buffer when given), submits, and
// starts a packet with the releases that waited for it. The merged draw, if
// any, waits for the next packet. Each packet costs a wait for gpu@0's
// validation of it, so a frame takes as few as fit.
static void Send(int present, const int *capture)
{
	if (stream_used)
		WriteBuffer(stream_buffer, stream_data, stream_used);
	if (uniform_used)
		WriteBuffer(uniform_buffer, uniform_data, uniform_used);
	EndPass();
	if (present)
	{
		void *p = dolly_gpu_record(&gpu, DOLLY_GPU_BEGIN_RENDER_PASS, 64);
		U32(p, 24, fb_width);U32(p, 28, fb_height);U32(p, 32, 1);F32(p, 52, 1);
		p = dolly_gpu_record(&gpu, DOLLY_GPU_DRAW_MESH, 88);
		U64(p, 8, blit_pipeline);U32(p, 40, 3);U32(p, 44, 1);U32(p, 64, 1);U64(p, 80, blit_group);
		dolly_gpu_record(&gpu, DOLLY_GPU_END_RENDER_PASS, 8);
		if (capture)
		{
			p = dolly_gpu_record(&gpu, DOLLY_GPU_CAPTURE_FRAME, 32);
			U64(p, 8, capture_buffer);U32(p, 16, capture[0]);U32(p, 20, capture[1]);U32(p, 24, capture[2]);U32(p, 28, capture[3]);
		}
	}
	if (encoded || present)
		dolly_gpu_submit(&gpu);
	encoded = false;
	stream_used = uniform_used = 0;
	last_slot = -1;
	if (gpu.count && dolly_gpu_batch(&gpu) < 0)
		Warn("a command packet failed: %s", strerror(errno));
	dolly_gpu_begin(&gpu);
	packet_number++;
	for (int i = 0; i < releases_count; i++)
	{
		U64(dolly_gpu_record(&gpu, DOLLY_GPU_RELEASE, 16), 8, releases[i]);
		objects--;
	}
	releases_count = 0;
}

static void Flush(void) {Send(false, NULL);}

// Whether the packet holds RECORDS more commands of BYTES, with STREAM and
// UNIFORM bytes more for Flush to write.
static int Fits(size_t bytes, int records, uint32_t stream, uint32_t uniform)
{
	return gpu.count + records + 6 <= command_limit && stream_used + stream <= STREAM_BYTES && uniform_used + uniform <= UNIFORM_BYTES &&
	       gpu.length + bytes + 64 + stream_used + stream + uniform_used + uniform + 256 <= sizeof(gpu.packet);
}

static void *Record(uint32_t opcode, size_t bytes)
{
	if (!Fits(Align(bytes, 8), 1, 0, 0))
		Flush();
	return dolly_gpu_record(&gpu, opcode, bytes);
}

static void Release(uint64_t handle)
{
	if (releases_count == MAX_GROUPS)
		Flush();
	releases[releases_count++] = handle;
}

static uint64_t CreateTexture(int width, int height, int layers, int mips, int type, int usage)
{
	uint64_t handle = NewHandle();
	void *p = Record(DOLLY_GPU_CREATE_TEXTURE, 48);
	U64(p, 8, handle);U32(p, 16, width);U32(p, 20, height);U32(p, 24, layers);U32(p, 28, mips);U32(p, 32, type);U32(p, 36, usage);
	return handle;
}

// Writes one mip level of one layer, as RGBA8 rows, in pieces that fit a packet.
static void WriteTexture(uint64_t handle, int mip, int layer, int x, int y, int width, int height, const unsigned char *rgba)
{
	int rows = bound(1, (512 * 1024) / (width * 4), height);
	for (int row = 0; row < height; row += rows)
	{
		int count = min(rows, height - row);
		uint32_t bytes = count * width * 4;
		void *p = Record(DOLLY_GPU_WRITE_TEXTURE, 48 + bytes);
		U64(p, 8, handle);U32(p, 16, mip);U32(p, 20, layer);U32(p, 24, x);U32(p, 28, y + row);
		U32(p, 32, width);U32(p, 36, count);U32(p, 40, bytes);
		memcpy((char *)p + 48, rgba + (size_t)row * width * 4, bytes);
	}
}

static uint64_t CreateShader(const char *code)
{
	uint64_t handle = NewHandle();
	if (!Fits(Align(24 + strlen(code), 8), 1, 0, 0))
		Flush();
	dolly_gpu_shader(&gpu, handle, code);
	return handle;
}

static uint64_t CreateSampler(int filter, int clamp)
{
	int linear = filter == DPSOFTRAST_TEXTURE_FILTER_LINEAR || filter == DPSOFTRAST_TEXTURE_FILTER_LINEAR_MIPMAP_TRIANGLE;
	int mipmapped = filter >= DPSOFTRAST_TEXTURE_FILTER_NEAREST_MIPMAP_TRIANGLE;
	uint64_t handle = NewHandle();
	void *p = Record(DOLLY_GPU_CREATE_SAMPLER, 48);
	U64(p, 8, handle);U32(p, 16, linear);U32(p, 20, linear);U32(p, 24, mipmapped);
	for (int i = 0; i < 3; i++)
		U32(p, 28 + 4 * i, clamp ? 0 : 1);
	U32(p, 44, 1);
	return handle;
}

static char *ReadFile(const char *path)
{
	FILE *f = fopen(path, "rb");
	if (!f)
		return NULL;
	fseek(f, 0, SEEK_END);
	long n = ftell(f);
	fseek(f, 0, SEEK_SET);
	char *text = (char *)malloc(n + 1);
	if (fread(text, 1, n, f) != (size_t)n)
		n = 0;
	text[n] = 0;
	fclose(f);
	return text;
}

// The vertex inputs of the vertex stage's entry point and the group 1 bindings of either stage.
static void ReadInterface(pair_t *pair, const char *vertex, const char *fragment)
{
	const char *entry = strstr(vertex, "@vertex");
	const char *end = entry ? strstr(entry, ") ->") : NULL;
	for (const char *p = entry; p && end && (p = strstr(p, "@location(")) && p < end; p++)
		pair->inputs[bound(0, atoi(p + 10), ATTRIBUTES - 1)] = true;
	for (int stage = 0; stage < 2; stage++)
	{
		const char *text = stage ? fragment : vertex;
		pair->uniforms |= strstr(text, "@group(0) @binding(0)") != NULL;
		for (const char *p = text; (p = strstr(p, "@group(1) @binding(")); p++)
		{
			int binding = atoi(p + 19);
			const char *declaration = strstr(p, "var");
			pair->units |= 1 << (binding / 2);
			if (declaration && !strncmp(strchr(declaration, ':'), ": texture_cube", 14))
				pair->cubes |= 1 << (binding / 2);
		}
	}
}

static pair_t *LoadPair(int mode, dpuint64 permutation)
{
	for (int i = 0; i < pairs_count; i++)
		if (pairs[i].mode == mode && pairs[i].permutation == permutation)
			return &pairs[i];
	if (pairs_count == MAX_PAIRS)
		Sys_Error("dpgpurast: more than %d shader permutations", MAX_PAIRS);
	pair_t *pair = &pairs[pairs_count++];
	memset(pair, 0, sizeof(*pair));
	pair->mode = mode;
	pair->permutation = permutation;
	Con_DPrintf("dpgpurast: shader mode %d permutation %llu\n", mode, (unsigned long long)permutation);
	if (!gpu_open)
		return pair;
	char path[256], *vertex, *fragment, *uniforms;
	dpsnprintf(path, sizeof(path), SHADER_DIRECTORY "/%d-%llu.vert.wgsl", mode, (unsigned long long)permutation);
	vertex = ReadFile(path);
	dpsnprintf(path, sizeof(path), SHADER_DIRECTORY "/%d-%llu.frag.wgsl", mode, (unsigned long long)permutation);
	fragment = ReadFile(path);
	dpsnprintf(path, sizeof(path), SHADER_DIRECTORY "/%d-%llu.uniforms", mode, (unsigned long long)permutation);
	uniforms = ReadFile(path);
	if (vertex && fragment && uniforms)
	{
		ReadInterface(pair, vertex, fragment);
		for (char *p = uniforms, *next; pair->slots < MAX_SLOTS && (pair->slot[pair->slots] = (short)strtol(p, &next, 10), next != p); p = next)
			pair->slots++;
		pair->vertex = CreateShader(vertex);
		pair->fragment = CreateShader(fragment);
		pair->loaded = true;
	}
	else
		Con_Printf("dpgpurast: no WGSL for shader mode %d permutation %llu, its draws are skipped\n", mode, (unsigned long long)permutation);
	free(vertex);free(fragment);free(uniforms);
	return pair;
}

static int BlendFactor(int gl)
{
	switch (gl)
	{
	case GL_ZERO: return 0;
	case GL_ONE: return 1;
	case GL_SRC_COLOR: return 2;
	case GL_ONE_MINUS_SRC_COLOR: return 3;
	case GL_DST_COLOR: return 4;
	case GL_ONE_MINUS_DST_COLOR: return 5;
	case GL_SRC_ALPHA: return 6;
	case GL_ONE_MINUS_SRC_ALPHA: return 7;
	case GL_DST_ALPHA: return 8;
	case GL_ONE_MINUS_DST_ALPHA: return 9;
	default: Warn("blend factor 0x%x drawn as one", gl); return 1;
	}
}

static int CompareFunction(int gl)
{
	// gpu@0's order: never less equal less-equal greater not-equal greater-equal always
	return gl >= GL_NEVER && gl <= GL_ALWAYS ? 1 + (gl - GL_NEVER) : 4;
}

// The pipeline for the current shader, state and vertex arrays.
static pipeline_t *GetPipeline(void)
{
	pipeline_state_t s;
	memset(&s, 0, sizeof(s));
	s.pair = shader;
	for (int i = 0; i < ATTRIBUTES; i++)
		s.format[i] = s.pair->inputs[i] ? (arrays[i].pointer ? arrays[i].components : 4) : 0;
	s.blending = !(blend[0] == GL_ONE && blend[1] == GL_ZERO);
	s.source = s.blending ? BlendFactor(blend[0]) : 1;
	s.destination = s.blending ? BlendFactor(blend[1]) : 0;
	s.subtract = s.blending && blend_subtract;
	s.test = depth_test ? CompareFunction(depth_func) : 8;
	s.write = depth_test && depth_mask;
	s.cull = cull_face == GL_FRONT ? 1 : cull_face == GL_BACK ? 2 : 0;
	s.mask = color_mask[0] | color_mask[1] << 1 | color_mask[2] << 2 | color_mask[3] << 3;
	s.bias = (int)polygon_offset[1];
	s.slope = polygon_offset[0];
	for (int i = 0; i < pipelines_count; i++)
		if (!memcmp(&pipelines[i].state, &s, sizeof(s)))
			return &pipelines[i];
	if (pipelines_count == MAX_PIPELINES)
		Sys_Error("dpgpurast: more than %d pipelines", MAX_PIPELINES);
	pipeline_t *pipeline = &pipelines[pipelines_count++];
	pair_t *pair = s.pair;
	pipeline->state = s;
	int buffers = 0;
	for (int i = 0; i < ATTRIBUTES; i++)
		buffers += s.format[i] != 0;
	pipeline->handle = NewHandle();
	void *p = Record(DOLLY_GPU_GRAPHICS_PIPELINE, 112 + 32 * buffers);
	U64(p, 8, pipeline->handle);U64(p, 16, pair->vertex);U64(p, 24, pair->fragment);
	U32(p, 32, 1);U32(p, 36, 6);U32(p, 44, s.cull);U32(p, 52, s.test);U32(p, 56, s.write);
	U32(p, 60, (uint32_t)s.bias);F32(p, 64, s.slope);U32(p, 72, s.mask);U32(p, 76, s.blending);
	for (int component = 0; component < 2; component++)
	{
		U32(p, 80 + 12 * component, s.subtract ? 2 : 0); // reverse-subtract, as GL_FUNC_REVERSE_SUBTRACT
		U32(p, 84 + 12 * component, s.source);
		U32(p, 88 + 12 * component, s.destination);
	}
	U32(p, 104, buffers);U32(p, 108, buffers);
	for (int i = 0, slot = 0; i < ATTRIBUTES; i++)
	{
		if (!s.format[i])
			continue;
		U32(p, 112 + 16 * slot, 4 * s.format[i]);
		char *attribute = (char *)p + 112 + 16 * (buffers + slot);
		U32(attribute, 0, slot);U32(attribute, 4, i);U32(attribute, 8, s.format[i]);
		slot++;
	}
	// Group 0: the storage buffer of slots, or empty when only group 1 is read.
	if (pair->uniforms || pair->units)
	{
		pipeline->uniform_group = NewHandle();
		p = Record(DOLLY_GPU_RESOURCE_GROUP, 32 + (pair->uniforms ? 32 : 0));
		U64(p, 8, pipeline->uniform_group);U64(p, 16, pipeline->handle);U32(p, 28, pair->uniforms);
		if (pair->uniforms)
		{
			U64(p, 40, uniform_buffer);U64(p, 56, UNIFORM_BYTES);
		}
	}
	return pipeline;
}

static int SamplerIndex(const gpu_texture_t *texture)
{
	int filter = texture->mips > 1 ? texture->filter : min(texture->filter, DPSOFTRAST_TEXTURE_FILTER_LINEAR);
	return filter * 2 + !!(texture->flags & DPSOFTRAST_TEXTURE_FLAG_CLAMPTOEDGE);
}

static void EvictGroups(void)
{
	// The groups unused longest go first; one of this packet, or of the merged draw, stays.
	while (groups_count && objects > OBJECT_BUDGET)
	{
		int oldest = -1;
		for (int i = 0; i < groups_count; i++)
			if (groups[i].packet != packet_number && groups[i].handle != merged.group &&
			    (oldest < 0 || groups[i].packet < groups[oldest].packet))
				oldest = i;
		if (oldest < 0)
			return;
		Release(groups[oldest].handle);
		groups[oldest] = groups[--groups_count];
	}
}

// The group of the textures the current shader samples, as the engine bound them.
static uint64_t GetTextureGroup(pipeline_t *pipeline)
{
	pair_t *pair = pipeline->state.pair;
	int texture[DPSOFTRAST_MAXTEXTUREUNITS] = {0}, sampler[DPSOFTRAST_MAXTEXTUREUNITS] = {0};
	for (int unit = 0; unit < DPSOFTRAST_MAXTEXTUREUNITS; unit++)
	{
		if (!(pair->units & 1 << unit))
			continue;
		int index = bound_texture[unit];
		int cube = (pair->cubes >> unit) & 1;
		if (index <= 0 || index >= textures_end || !textures[index].handle || (textures[index].layers == 6) != cube)
			index = -cube; // 0: the white texture, -1: the black cube
		texture[unit] = index;
		sampler[unit] = index > 0 ? SamplerIndex(&textures[index]) : 2;
	}
	for (int i = 0; i < groups_count; i++)
	{
		group_t *group = &groups[i];
		if (group->pipeline == pipeline && !memcmp(group->texture, texture, sizeof(texture)) && !memcmp(group->sampler, sampler, sizeof(sampler)))
		{
			group->packet = packet_number;
			return group->handle;
		}
	}
	EvictGroups();
	if (groups_count == MAX_GROUPS)
		Sys_Error("dpgpurast: more than %d texture groups", MAX_GROUPS);
	group_t *group = &groups[groups_count++];
	group->pipeline = pipeline;
	memcpy(group->texture, texture, sizeof(texture));
	memcpy(group->sampler, sampler, sizeof(sampler));
	group->packet = packet_number;
	group->handle = NewHandle();
	int bindings = 0;
	for (int unit = 0; unit < DPSOFTRAST_MAXTEXTUREUNITS; unit++)
		bindings += (pair->units >> unit & 1) * 2;
	void *p = Record(DOLLY_GPU_RESOURCE_GROUP, 32 + 32 * bindings);
	U64(p, 8, group->handle);U64(p, 16, pipeline->handle);U32(p, 24, 1);U32(p, 28, bindings);
	for (int unit = 0, n = 0; unit < DPSOFTRAST_MAXTEXTUREUNITS; unit++)
	{
		if (!(pair->units & 1 << unit))
			continue;
		uint64_t handle = texture[unit] > 0 ? textures[texture[unit]].handle : texture[unit] ? black_cube : white_texture;
		char *entry = (char *)p + 32 + 32 * n++;
		U32(entry, 0, 2 * unit);U32(entry, 4, (pair->cubes >> unit & 1) ? 2 : 1);U64(entry, 8, handle);
		entry = (char *)p + 32 + 32 * n++;
		U32(entry, 0, 2 * unit + 1);U32(entry, 4, 3);U64(entry, 8, samplers[sampler[unit]]);
	}
	return group->handle;
}

static void BeginPass(void)
{
	void *p = dolly_gpu_record(&gpu, DOLLY_GPU_BEGIN_RENDER_PASS, 64);
	U64(p, 8, color_target);U64(p, 16, depth_target);U32(p, 24, fb_width);U32(p, 28, fb_height);
	U32(p, 32, pass_clear_color);U32(p, 36, pass_clear_depth);
	for (int i = 0; i < 4; i++)
		F32(p, 40 + 4 * i, clear_color[i]);
	F32(p, 56, bound(0.0f, clear_depth, 1.0f));
	pass_open = encoded = true;
	pass_clear_color = pass_clear_depth = 0;
	viewport_set = false;
}

static void SetViewport(void)
{
	// OpenGL's window y runs up from the bottom; the framebuffer's down from the top.
	int x = bound(0, viewport[0], fb_width - 1), y = bound(0, fb_height - viewport[1] - viewport[3], fb_height - 1);
	int width = bound(1, viewport[2], fb_width - x), height = bound(1, viewport[3], fb_height - y);
	int sx = 0, sy = 0, sw = fb_width, sh = fb_height;
	if (scissor_test)
	{
		sx = bound(0, scissor[0], fb_width);
		sy = bound(0, fb_height - scissor[1] - scissor[3], fb_height);
		sw = bound(0, scissor[2], fb_width - sx);
		sh = bound(0, scissor[3], fb_height - sy);
	}
	void *p = dolly_gpu_record(&gpu, DOLLY_GPU_VIEWPORT, 48);
	F32(p, 8, x);F32(p, 12, y);F32(p, 16, width);F32(p, 20, height);
	F32(p, 24, min(depth_range[0], depth_range[1]));F32(p, 28, max(depth_range[0], depth_range[1]));
	U32(p, 32, sx);U32(p, 36, sy);U32(p, 40, sw);U32(p, 44, sh);
	viewport_set = true;
}

// Makes room for a draw that reads STREAM bytes from the stream, writes its
// uniforms into a slot (the last one again when equal), and opens the render
// pass and viewport; the slot index, or -1 when the draw cannot fit a packet.
static int PrepareDraw(pair_t *pair, const float *slot_data, uint32_t stream)
{
	uint32_t slot_bytes = pair->uniforms ? pair->slots * 16 : 0;
	uint32_t slot_at = slot_bytes ? (uint32_t)Align(uniform_used, slot_bytes) : 0;
	int reuse = slot_bytes && last_slot >= 0 && last_slot_pair == pair && !memcmp(uniform_data + last_slot * slot_bytes, slot_data, slot_bytes);
	size_t command = 64 + 48 + 80 + 16 + 24 * ATTRIBUTES;
	if (!Fits(command, 3, stream, reuse ? 0 : slot_at + slot_bytes - uniform_used))
	{
		Flush();
		reuse = false;
		slot_at = 0;
		if (!Fits(command, 3, stream, slot_bytes))
			return -1;
	}
	if (slot_bytes && !reuse)
	{
		memcpy(uniform_data + slot_at, slot_data, slot_bytes);
		uniform_used = slot_at + slot_bytes;
		last_slot = slot_at / slot_bytes;
		last_slot_pair = pair;
	}
	if (!pass_open)
		BeginPass();
	if (!viewport_set)
		SetViewport();
	return slot_bytes ? last_slot : 0;
}

// Records a draw of INDICES indices from BUFFER (index_at, 32-bit when WIDE)
// over the vertex arrays at OFFSET in BUFFERS, with the pipeline's groups.
static void RecordDraw(pipeline_t *pipeline, uint64_t group, int slot, const uint64_t *buffer, const uint32_t *offset, const uint32_t *size,
                       uint64_t index_buffer, uint32_t index_at, int indices, int wide)
{
	const int *format = pipeline->state.format;
	uint64_t used_groups[2] = {pipeline->uniform_group, group};
	int group_count = (used_groups[0] != 0) + (used_groups[1] != 0), buffers = 0;
	for (int i = 0; i < ATTRIBUTES; i++)
		buffers += format[i] != 0;
	char *d = (char *)dolly_gpu_record(&gpu, DOLLY_GPU_DRAW_MESH, 80 + 8 * group_count + 24 * buffers);
	U64(d, 8, pipeline->handle);U64(d, 16, index_buffer);U64(d, 24, index_at);U64(d, 32, Align(indices * (wide ? 4 : 2), 4));
	U32(d, 40, indices);U32(d, 44, 1);U32(d, 56, slot);U32(d, 60, wide ? 2 : 1);
	U32(d, 64, group_count);U32(d, 68, buffers);
	for (int g = 0, n = 0; g < 2; g++)
		if (used_groups[g])
			U64(d, 80 + 8 * n++, used_groups[g]);
	for (int i = 0, b = 0; i < ATTRIBUTES; i++)
	{
		if (!format[i])
			continue;
		char *entry = d + 80 + 8 * group_count + 24 * b++;
		U64(entry, 0, buffer[i]);U64(entry, 8, offset[i]);U64(entry, 16, size[i]);
	}
}

// Records the merged draw, its arrays and indices copied into the stream.
static void EmitMerged(void)
{
	if (!merged.vertices)
		return;
	pipeline_t *pipeline = merged.pipeline;
	const int *format = pipeline->state.format;
	int wide = merged.vertices > 65536;
	uint32_t bytes = (uint32_t)Align(merged.indices * (wide ? 4 : 2), 4);
	for (int i = 0; i < ATTRIBUTES; i++)
		bytes += format[i] * 4 * merged.vertices;
	int slot = PrepareDraw(pipeline->state.pair, merged.slot_data, bytes);
	if (slot < 0)
	{
		Warn("a draw of %d vertices does not fit a command packet, skipped", merged.vertices);
		merged.vertices = merged.indices = 0;
		return;
	}
	uint32_t at = stream_used, offset[ATTRIBUTES], size[ATTRIBUTES];
	uint64_t buffer[ATTRIBUTES];
	for (int i = 0; i < ATTRIBUTES; i++)
	{
		if (!format[i])
			continue;
		buffer[i] = stream_buffer;
		offset[i] = stream_used;
		size[i] = format[i] * 4 * merged.vertices;
		memcpy(stream_data + stream_used, merged.array[i], size[i]);
		stream_used += size[i];
	}
	uint32_t index_at = stream_used;
	if (wide)
		memcpy(stream_data + index_at, merged.index, merged.indices * 4);
	else
		for (int i = 0; i < merged.indices; i++)
		{
			uint16_t e = (uint16_t)merged.index[i];
			memcpy(stream_data + index_at + 2 * i, &e, 2);
		}
	stream_used = at + bytes;
	RecordDraw(pipeline, merged.group, slot, buffer, offset, size, stream_buffer, index_at, merged.indices, wide);
	merged.vertices = merged.indices = 0;
	merged.group = 0;
}

static void Gather(float *out, const vertex_array_t *array, int format, int first, int count, int location)
{
	if (!array->pointer)
	{
		const float *value = location == 1 ? constant_color : default_attribute;
		for (int i = 0; i < count; i++, out += format)
			memcpy(out, value, format * 4);
		return;
	}
	const unsigned char *in = (const unsigned char *)array->pointer + (size_t)first * array->stride;
	for (int i = 0; i < count; i++, in += array->stride, out += format)
	{
		if (array->unsigned_bytes)
			for (int c = 0; c < 4; c++)
				out[c] = in[c] * (1.0f / 255.0f);
		else
			memcpy(out, in, format * 4);
	}
}

static unsigned RangeHash(const void *pointer, size_t stride, int kind, int first, int count)
{
	uint64_t h = (uint64_t)(uintptr_t)pointer * 0x9e3779b97f4a7c15u ^ stride * 0xbf58476d1ce4e5b9u ^ (uint64_t)kind << 56 ^
	             (uint64_t)first * 0x94d049bb133111ebu ^ (uint64_t)count * 0x2545f4914f6cdd1du;
	return (unsigned)(h ^ h >> 29) % (2 * MAX_RANGES);
}

static void IndexRanges(void)
{
	memset(range_index, 0, sizeof(range_index));
	for (int i = 0; i < ranges_count; i++)
	{
		range_t *r = &ranges[i];
		unsigned h = RangeHash(r->pointer, r->stride, r->kind, r->first, r->count);
		while (range_index[h])
			h = (h + 1) % (2 * MAX_RANGES);
		range_index[h] = i + 1;
	}
}

// Writes a range into the geometry buffer: vertices as floats, indices as 32-bit ones less FIRST.
static int UploadRange(range_t *r)
{
	int index = r->kind >= INDICES, components = r->kind & 7;
	uint32_t size = (uint32_t)r->count * 4 * (index ? 1 : components);
	if (geometry_used + size > GEOMETRY_BYTES)
	{
		geometry_full = true;
		return false;
	}
	float *data = (float *)malloc(size);
	if (index)
		for (int i = 0; i < r->count; i++)
		{
			uint32_t e = (r->kind == INDICES + 4 ? ((const int *)r->pointer)[i] : ((const unsigned short *)r->pointer)[i]) - r->first;
			memcpy(&data[i], &e, 4);
		}
	else
	{
		const vertex_array_t array = {r->pointer, r->stride, components, (r->kind & 8) != 0};
		Gather(data, &array, components, r->first, r->count, 0);
	}
	for (uint32_t at = 0; at < size; at += 512 * 1024)
	{
		uint32_t bytes = min(size - at, 512u * 1024);
		void *p = Record(DOLLY_GPU_WRITE_BUFFER, 32 + bytes);
		U64(p, 8, geometry_buffer);U64(p, 16, geometry_used + at);U32(p, 24, 32);U32(p, 28, bytes);
		memcpy((char *)p + 32, (char *)data + at, bytes);
	}
	free(data);
	r->offset = geometry_used;
	r->size = size;
	geometry_used += size;
	return true;
}

// Whether the range is in the geometry buffer (at *OFFSET): it is written
// there when a draw reads it a second time with the same bytes.
static int CachedRange(const void *pointer, size_t stride, int kind, int first, int count, size_t length, uint32_t *offset)
{
	const unsigned char *source = (const unsigned char *)pointer + (kind >= INDICES ? 0 : (size_t)first * stride);
	unsigned h = RangeHash(pointer, stride, kind, first, count);
	range_t *r = NULL;
	for (; range_index[h]; h = (h + 1) % (2 * MAX_RANGES))
	{
		range_t *candidate = &ranges[range_index[h] - 1];
		if (candidate->pointer == pointer && candidate->stride == stride && candidate->kind == kind && candidate->first == first && candidate->count == count)
		{
			r = candidate;
			break;
		}
	}
	if (!r)
	{
		if (ranges_count == MAX_RANGES)
			return false;
		r = &ranges[ranges_count];
		*r = (range_t){pointer, stride, kind, first, count, (unsigned char *)malloc(length), 0, 0, frame_number};
		memcpy(r->bytes, source, length);
		range_index[h] = ++ranges_count;
		return false;
	}
	r->frame = frame_number;
	if (memcmp(r->bytes, source, length))
	{
		memcpy(r->bytes, source, length);
		r->size = 0;
		return false;
	}
	if (!r->size && !UploadRange(r))
		return false;
	*offset = r->offset;
	return true;
}

// Forgets ranges not drawn lately; when the geometry buffer is full, all it holds.
static void SweepRanges(void)
{
	int kept = 0;
	for (int i = 0; i < ranges_count; i++)
	{
		range_t *r = &ranges[i];
		if (geometry_full)
			r->size = 0;
		if (frame_number - r->frame > (r->size ? 600 : 2))
			free(r->bytes);
		else
			ranges[kept++] = *r;
	}
	ranges_count = kept;
	if (geometry_full)
		geometry_used = 0;
	geometry_full = false;
	IndexRanges();
}

// A draw from the geometry buffer, when its arrays and indices are there.
static int DrawCached(pipeline_t *pipeline, uint64_t group, const float *slot_data, int firstvertex, int numvertices, int indices,
                      const int *element3i, const unsigned short *element3s)
{
	const int *format = pipeline->state.format;
	uint32_t offset[ATTRIBUTES], size[ATTRIBUTES], index_at;
	uint64_t buffer[ATTRIBUTES];
	if (numvertices < CACHED_VERTICES || (!element3i && !element3s))
		return false;
	for (int i = 0; i < ATTRIBUTES; i++)
	{
		const vertex_array_t *a = &arrays[i];
		if (!format[i])
			continue;
		if (!a->pointer || !CachedRange(a->pointer, a->stride, a->components + 8 * a->unsigned_bytes, firstvertex, numvertices,
		                                (size_t)numvertices * a->stride, &offset[i]))
			return false;
		buffer[i] = geometry_buffer;
		size[i] = format[i] * 4 * numvertices;
	}
	if (element3i ? !CachedRange(element3i, 4, INDICES + 4, firstvertex, indices, (size_t)indices * 4, &index_at)
	              : !CachedRange(element3s, 2, INDICES + 2, firstvertex, indices, (size_t)indices * 2, &index_at))
		return false;
	EmitMerged();
	int slot = PrepareDraw(pipeline->state.pair, slot_data, 0);
	if (slot >= 0)
		RecordDraw(pipeline, group, slot, buffer, offset, size, geometry_buffer, index_at, indices, true);
	return true;
}

static void Draw(int firstvertex, int numvertices, int numtriangles, const int *element3i, const unsigned short *element3s)
{
	if (!shader || !shader->loaded || target_is_texture || numtriangles <= 0 || numvertices <= 0)
		return;
	pair_t *pair = shader;
	pipeline_t *pipeline = GetPipeline();
	uint64_t group = pair->units ? GetTextureGroup(pipeline) : 0;
	const int *format = pipeline->state.format;
	int indices = numtriangles * 3;
	uint32_t vertex_bytes = 0;
	for (int i = 0; i < ATTRIBUTES; i++)
		vertex_bytes += format[i] * 4;
	if ((size_t)vertex_bytes * numvertices + indices * 4 > DRAW_BYTES)
	{
		Warn("a draw of %d vertices exceeds a command packet, skipped", numvertices);
		return;
	}
	float slot_data[MAX_SLOTS * 4];
	for (int i = 0; pair->uniforms && i < pair->slots; i++)
		memcpy(&slot_data[i * 4], &uniform4f[pair->slot[i] * 4], 16);
	if (DrawCached(pipeline, group, slot_data, firstvertex, numvertices, indices, element3i, element3s))
		return;
	int merges = merged.vertices && merged.pipeline == pipeline && merged.group == group &&
	             !memcmp(merged.slot_data, slot_data, pair->uniforms ? pair->slots * 16 : 0) &&
	             (size_t)vertex_bytes * (merged.vertices + numvertices) + (merged.indices + indices) * 4 <= MERGED_BYTES;
	if (!merges)
	{
		EmitMerged();
		merged.pipeline = pipeline;
		merged.group = group;
		memcpy(merged.slot_data, slot_data, pair->uniforms ? pair->slots * 16 : 0);
	}
	if (merged.vertices + numvertices > merged.capacity)
	{
		merged.capacity = max(merged.vertices + numvertices, 2 * merged.capacity);
		for (int i = 0; i < ATTRIBUTES; i++)
			merged.array[i] = (float *)realloc(merged.array[i], (size_t)merged.capacity * 16);
	}
	if (merged.indices + indices > merged.index_capacity)
	{
		merged.index_capacity = max(merged.indices + indices, 2 * merged.index_capacity);
		merged.index = (uint32_t *)realloc(merged.index, (size_t)merged.index_capacity * 4);
	}
	for (int i = 0; i < ATTRIBUTES; i++)
		if (format[i])
			Gather(merged.array[i] + (size_t)merged.vertices * format[i], &arrays[i], format[i], firstvertex, numvertices, i);
	uint32_t *out = merged.index + merged.indices;
	for (int i = 0; i < indices; i++)
	{
		int e = element3i ? element3i[i] : element3s ? element3s[i] : firstvertex + i;
		out[i] = (uint32_t)(e - firstvertex + merged.vertices);
	}
	merged.vertices += numvertices;
	merged.indices += indices;
}

static const char blit_vertex[] =
	"@vertex fn main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {\n"
	"  let p = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));\n"
	"  return vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0);\n"
	"}\n";
static const char blit_fragment[] =
	"@group(0) @binding(0) var frame: texture_2d<f32>;\n"
	"@fragment fn main(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {\n"
	"  return vec4<f32>(textureLoad(frame, vec2<i32>(p.xy), 0).rgb, 1.0);\n"
	"}\n";
// A rectangle of the frame into a texture, as OpenGL's glCopyTexSubImage2D: its
// row 0 takes the rectangle's bottom row. The frame's rows run down from the
// top, so with the draw's slot holding (sx - tx, height - sy + ty), texel
// (x, y) takes the frame's pixel (x + sx - tx, height - sy + ty - 1 - y).
static const char copy_vertex[] =
	"@group(0) @binding(1) var<storage, read> slots: array<vec4<f32>>;\n"
	"struct V {@builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) origin: vec2<f32>}\n"
	"@vertex fn main(@builtin(vertex_index) i: u32, @builtin(instance_index) slot: u32) -> V {\n"
	"  let p = vec2<f32>(f32((i << 1u) & 2u), f32(i & 2u));\n"
	"  return V(vec4<f32>(p * 2.0 - 1.0, 0.0, 1.0), slots[slot].xy);\n"
	"}\n";
static const char copy_fragment[] =
	"@group(0) @binding(0) var frame: texture_2d<f32>;\n"
	"@fragment fn main(@builtin(position) p: vec4<f32>, @location(0) @interpolate(flat) origin: vec2<f32>) -> @location(0) vec4<f32> {\n"
	"  return textureLoad(frame, vec2<i32>(floor(vec2<f32>(origin.x + p.x, origin.y - p.y))), 0);\n"
	"}\n";

static void CreateFramebuffer(int width, int height)
{
	if (color_target)
	{
		Release(color_target);Release(depth_target);Release(blit_group);Release(copy_group);
		if (capture_buffer)
			Release(capture_buffer);
		capture_buffer = 0;
		Flush();
	}
	fb_width = width;
	fb_height = height;
	color_target = CreateTexture(width, height, 1, 1, 1, 4 | 16);
	depth_target = CreateTexture(width, height, 1, 1, 6, 16);
	blit_group = NewHandle();
	void *p = Record(DOLLY_GPU_RESOURCE_GROUP, 64);
	U64(p, 8, blit_group);U64(p, 16, blit_pipeline);U32(p, 28, 1);
	U32(p, 36, 1);U64(p, 40, color_target);
	copy_group = NewHandle();
	p = Record(DOLLY_GPU_RESOURCE_GROUP, 96);
	U64(p, 8, copy_group);U64(p, 16, copy_pipeline);U32(p, 28, 2);
	U32(p, 36, 1);U64(p, 40, color_target);
	U32(p, 64, 1);U64(p, 72, uniform_buffer);U64(p, 88, UNIFORM_BYTES);
	pass_clear_color = pass_clear_depth = 1;
}

static int OpenDevice(int width, int height)
{
	if (dolly_gpu_open(&gpu, width, height) < 0)
	{
		Con_Printf("dpgpurast: gpu@0 has no device (%s); the software rasterizer draws\n", strerror(errno));
		return false;
	}
	uint32_t features = 0;
	if (dolly_gpu_capabilities(&gpu) >= 4)
		memcpy(&features, gpu.reply, 4);
	command_limit = (features & DOLLY_GPU_FEATURE_LARGE_BATCH) ? DOLLY_GPU_MAX_COMMANDS : 256;
	surface_bgra = (features & DOLLY_GPU_FEATURE_SURFACE_BGRA) != 0;
	dolly_gpu_begin(&gpu);
	gpu_open = true;
	stream_buffer = NewHandle();
	uniform_buffer = NewHandle();
	dolly_gpu_buffer(&gpu, stream_buffer, STREAM_BYTES, 8 | 16 | 32);
	dolly_gpu_buffer(&gpu, uniform_buffer, UNIFORM_BYTES, 8 | 128);
	geometry_buffer = NewHandle();
	dolly_gpu_buffer(&gpu, geometry_buffer, GEOMETRY_BYTES, 8 | 16 | 32);
	for (int i = 0; i < 8; i++)
		samplers[i] = CreateSampler(i / 2, i & 1);
	static const unsigned char white[4] = {255, 255, 255, 255}, black[4] = {0, 0, 0, 255};
	white_texture = CreateTexture(1, 1, 1, 1, 1, 2 | 4);
	WriteTexture(white_texture, 0, 0, 0, 0, 1, 1, white);
	black_cube = CreateTexture(1, 1, 6, 1, 1, 2 | 4);
	for (int face = 0; face < 6; face++)
		WriteTexture(black_cube, 0, face, 0, 0, 1, 1, black);
	uint64_t vertex = CreateShader(blit_vertex), fragment = CreateShader(blit_fragment);
	blit_pipeline = NewHandle();
	void *p = Record(DOLLY_GPU_GRAPHICS_PIPELINE, 112);
	U64(p, 8, blit_pipeline);U64(p, 16, vertex);U64(p, 24, fragment);U32(p, 52, 8);U32(p, 72, 15);
	vertex = CreateShader(copy_vertex);
	fragment = CreateShader(copy_fragment);
	copy_pipeline = NewHandle();
	p = Record(DOLLY_GPU_GRAPHICS_PIPELINE, 112);
	U64(p, 8, copy_pipeline);U64(p, 16, vertex);U64(p, 24, fragment);U32(p, 32, 1);U32(p, 52, 8);U32(p, 72, 15);
	CreateFramebuffer(width, height);
	Flush();
	Con_Printf("dpgpurast: drawing on gpu@0 at %dx%d\n", width, height);
	return true;
}

int DPSOFTRAST_Init(int width, int height, int numthreads, int interlace, unsigned int *colorpixels, unsigned int *depthpixels)
{
	if (OpenDevice(width, height))
		return 0;
	return dpsoft_Init(width, height, numthreads, interlace, colorpixels, depthpixels);
}

void DPSOFTRAST_Shutdown(void)
{
	SOFTWARE(dpsoft_Shutdown());
	dolly_gpu_close(&gpu);
	gpu_open = false;
	memset(textures, 0, sizeof(textures));
	textures_end = 1;
	pairs_count = pipelines_count = groups_count = releases_count = objects = 0;
	merged.vertices = merged.indices = 0;
	stream_used = uniform_used = 0;
	color_target = depth_target = capture_buffer = next_handle = 0;
	shader = last_slot_pair = NULL;
	pass_open = encoded = false;
	for (int i = 0; i < ranges_count; i++)
		free(ranges[i].bytes);
	ranges_count = geometry_used = 0;
	IndexRanges();
}

void DPSOFTRAST_Flush(void)
{
	SOFTWARE(dpsoft_Flush());
}

// Draws what is recorded, a clear nothing drew after included.
static void DrawRecorded(size_t bytes, int records, uint32_t uniform)
{
	EmitMerged();
	if (!Fits(64 + bytes, 1 + records, 0, uniform))
		Flush();
	if ((pass_clear_color || pass_clear_depth) && !pass_open)
		BeginPass();
}

// The frame, copied onto the surface.
void DPSOFTRAST_Finish(void)
{
	SOFTWARE(dpsoft_Finish());
	DrawRecorded(64 + 88 + 8 + 8, 4, 0);
	Send(true, NULL);
	if (++frame_number % 8 == 0 || geometry_full)
		SweepRanges();
}

int DPSOFTRAST_Texture_New(int flags, int width, int height, int depth)
{
	if (!gpu_open)
		return dpsoft_Texture_New(flags, width, height, depth);
	int format = flags & DPSOFTRAST_TEXTURE_FORMAT_COMPAREMASK;
	if (depth != 1 || width > 8192 || height > 8192 ||
	    !(format == DPSOFTRAST_TEXTURE_FORMAT_BGRA8 || format == DPSOFTRAST_TEXTURE_FORMAT_RGBA8 || format == DPSOFTRAST_TEXTURE_FORMAT_ALPHA8))
	{
		Warn("no texture of format %d, %dx%dx%d", format, width, height, depth);
		return 0;
	}
	int index = 1;
	while (index < textures_end && textures[index].handle)
		index++;
	if (index == MAX_TEXTURES)
		return 0;
	textures_end = max(textures_end, index + 1);
	gpu_texture_t *texture = &textures[index];
	texture->width = width;
	texture->height = height;
	texture->layers = (flags & DPSOFTRAST_TEXTURE_FLAG_CUBEMAP) ? 6 : 1;
	texture->mips = 1;
	if (flags & DPSOFTRAST_TEXTURE_FLAG_MIPMAP)
		for (int extent = max(width, height); extent > 1; extent >>= 1)
			texture->mips++;
	texture->flags = flags;
	texture->filter = (flags & DPSOFTRAST_TEXTURE_FLAG_MIPMAP) ? DPSOFTRAST_TEXTURE_FILTER_LINEAR_MIPMAP_TRIANGLE : DPSOFTRAST_TEXTURE_FILTER_LINEAR;
	if (objects > OBJECT_BUDGET)
		EvictGroups();
	// One level of one layer can take a copy of the frame (CopyRectangleToTexture).
	texture->handle = CreateTexture(width, height, texture->layers, texture->mips, 1, 2 | 4 | (texture->mips == 1 && texture->layers == 1 ? 16 : 0));
	return index;
}

void DPSOFTRAST_Texture_Free(int index)
{
	SOFTWARE(dpsoft_Texture_Free(index));
	if (index <= 0 || index >= textures_end || !textures[index].handle)
		return;
	EmitMerged(); // it may sample the texture
	for (int i = 0; i < groups_count; )
	{
		int uses = false;
		for (int unit = 0; unit < DPSOFTRAST_MAXTEXTUREUNITS; unit++)
			uses |= groups[i].texture[unit] == index;
		if (uses)
		{
			Release(groups[i].handle);
			groups[i] = groups[--groups_count];
		}
		else
			i++;
	}
	// Releases go out after the packet whose draws sample it.
	Release(textures[index].handle);
	memset(&textures[index], 0, sizeof(textures[index]));
}

// Engine pixels (BGRA unless the format is RGBA8) as RGBA8, and their mip levels.
static void Upload(gpu_texture_t *texture, int layer, int x, int y, int width, int height, const unsigned char *pixels)
{
	size_t count = (size_t)width * height;
	unsigned char *rgba = (unsigned char *)malloc(count * 4);
	int swap = (texture->flags & DPSOFTRAST_TEXTURE_FORMAT_COMPAREMASK) != DPSOFTRAST_TEXTURE_FORMAT_RGBA8;
	for (size_t i = 0; i < count; i++)
	{
		rgba[i * 4 + 0] = pixels[i * 4 + (swap ? 2 : 0)];
		rgba[i * 4 + 1] = pixels[i * 4 + 1];
		rgba[i * 4 + 2] = pixels[i * 4 + (swap ? 0 : 2)];
		rgba[i * 4 + 3] = pixels[i * 4 + 3];
	}
	// Draws already recorded sample the old pixels: they are sent first.
	EmitMerged();
	if (pass_open)
		Flush();
	WriteTexture(texture->handle, 0, layer, x, y, width, height, rgba);
	if (texture->mips > 1 && (x || y || width != texture->width || height != texture->height))
		Warn("a partial update of a mipmapped texture leaves its smaller levels as they were");
	else
		for (int mip = 1, w = width, h = height; mip < texture->mips; mip++)
		{
			int nw = max(1, w >> 1), nh = max(1, h >> 1);
			for (int j = 0; j < nh; j++)
				for (int i = 0; i < nw; i++)
					for (int c = 0; c < 4; c++)
					{
						int x0 = min(2 * i, w - 1), x1 = min(2 * i + 1, w - 1), y0 = min(2 * j, h - 1), y1 = min(2 * j + 1, h - 1);
						rgba[(j * nw + i) * 4 + c] = (rgba[(y0 * w + x0) * 4 + c] + rgba[(y0 * w + x1) * 4 + c] +
						                              rgba[(y1 * w + x0) * 4 + c] + rgba[(y1 * w + x1) * 4 + c] + 2) >> 2;
					}
			WriteTexture(texture->handle, mip, layer, 0, 0, nw, nh, rgba);
			w = nw;
			h = nh;
		}
	free(rgba);
}

void DPSOFTRAST_Texture_UpdatePartial(int index, int mip, const unsigned char *pixels, int blockx, int blocky, int blockwidth, int blockheight)
{
	SOFTWARE(dpsoft_Texture_UpdatePartial(index, mip, pixels, blockx, blocky, blockwidth, blockheight));
	if (index > 0 && index < textures_end && textures[index].handle && pixels && !mip)
		Upload(&textures[index], 0, blockx, blocky, blockwidth, blockheight, pixels);
}

void DPSOFTRAST_Texture_UpdateFull(int index, const unsigned char *pixels)
{
	SOFTWARE(dpsoft_Texture_UpdateFull(index, pixels));
	if (index <= 0 || index >= textures_end || !textures[index].handle || !pixels)
		return;
	gpu_texture_t *texture = &textures[index];
	for (int layer = 0; layer < texture->layers; layer++)
		Upload(texture, layer, 0, 0, texture->width, texture->height, pixels + (size_t)layer * texture->width * texture->height * 4);
}

int DPSOFTRAST_Texture_GetWidth(int index, int mip)
{
	if (!gpu_open)
		return dpsoft_Texture_GetWidth(index, mip);
	return index > 0 && index < textures_end ? max(1, textures[index].width >> mip) : 0;
}

int DPSOFTRAST_Texture_GetHeight(int index, int mip)
{
	if (!gpu_open)
		return dpsoft_Texture_GetHeight(index, mip);
	return index > 0 && index < textures_end ? max(1, textures[index].height >> mip) : 0;
}

int DPSOFTRAST_Texture_GetDepth(int index, int mip)
{
	if (!gpu_open)
		return dpsoft_Texture_GetDepth(index, mip);
	return index > 0 && index < textures_end && textures[index].handle ? 1 : 0;
}

// Only SetRenderTargets uses the answer, which names the texture there.
unsigned char *DPSOFTRAST_Texture_GetPixelPointer(int index, int mip)
{
	if (!gpu_open)
		return dpsoft_Texture_GetPixelPointer(index, mip);
	return index > 0 && index < MAX_TEXTURES ? &texture_tokens[index] : NULL;
}

void DPSOFTRAST_Texture_Filter(int index, DPSOFTRAST_TEXTURE_FILTER filter)
{
	SOFTWARE(dpsoft_Texture_Filter(index, filter));
	if (index > 0 && index < textures_end)
		textures[index].filter = filter;
}

void DPSOFTRAST_SetRenderTargets(int width, int height, unsigned int *depthpixels, unsigned int *colorpixels0, unsigned int *colorpixels1, unsigned int *colorpixels2, unsigned int *colorpixels3)
{
	SOFTWARE(dpsoft_SetRenderTargets(width, height, depthpixels, colorpixels0, colorpixels1, colorpixels2, colorpixels3));
	EmitMerged();
	const unsigned char *token = (const unsigned char *)(colorpixels0 ? colorpixels0 : depthpixels);
	target_is_texture = token >= texture_tokens && token < texture_tokens + MAX_TEXTURES;
	if (target_is_texture)
		Warn("rendering into textures is not drawn (an effect beyond the normal preset)");
	else if (width != fb_width || height != fb_height)
		CreateFramebuffer(width, height);
}

// A change of the viewport, scissor or depth range: the merged draw goes first.
static void ViewportChange(void)
{
	EmitMerged();
	viewport_set = false;
}

void DPSOFTRAST_Viewport(int x, int y, int width, int height)
{
	SOFTWARE(dpsoft_Viewport(x, y, width, height));
	const int value[4] = {x, y, width, height};
	if (memcmp(viewport, value, sizeof(value)))
	{
		ViewportChange();
		memcpy(viewport, value, sizeof(value));
	}
}

// A clear of the whole target opens the next render pass with it; a scissored one is not drawn.
static int WholeTargetClear(void)
{
	if (target_is_texture)
		return false;
	if (scissor_test && (scissor[0] > 0 || scissor[1] > 0 || scissor[0] + scissor[2] < fb_width || scissor[1] + scissor[3] < fb_height))
	{
		Warn("a scissored clear is not drawn");
		return false;
	}
	EmitMerged();
	if (pass_open)
		Flush();
	return true;
}

void DPSOFTRAST_ClearColor(float r, float g, float b, float a)
{
	SOFTWARE(dpsoft_ClearColor(r, g, b, a));
	if (!WholeTargetClear())
		return;
	clear_color[0] = r;clear_color[1] = g;clear_color[2] = b;clear_color[3] = a;
	pass_clear_color = true;
}

void DPSOFTRAST_ClearDepth(float d)
{
	SOFTWARE(dpsoft_ClearDepth(d));
	if (!WholeTargetClear())
		return;
	clear_depth = d;
	pass_clear_depth = true;
}

void DPSOFTRAST_ColorMask(int r, int g, int b, int a)
{
	SOFTWARE(dpsoft_ColorMask(r, g, b, a));
	color_mask[0] = r != 0;color_mask[1] = g != 0;color_mask[2] = b != 0;color_mask[3] = a != 0;
}

void DPSOFTRAST_DepthTest(int enable) {SOFTWARE(dpsoft_DepthTest(enable));depth_test = enable;}

void DPSOFTRAST_ScissorTest(int enable)
{
	SOFTWARE(dpsoft_ScissorTest(enable));
	if (scissor_test != enable)
	{
		ViewportChange();
		scissor_test = enable;
	}
}

void DPSOFTRAST_Scissor(float x, float y, float width, float height)
{
	SOFTWARE(dpsoft_Scissor(x, y, width, height));
	const int value[4] = {(int)x, (int)y, (int)width, (int)height};
	if (memcmp(scissor, value, sizeof(value)))
	{
		ViewportChange();
		memcpy(scissor, value, sizeof(value));
	}
}

void DPSOFTRAST_ClipPlane(float x, float y, float z, float w)
{
	SOFTWARE(dpsoft_ClipPlane(x, y, z, w));
	if (x || y || z || w != 1)
		Warn("clip planes are not drawn (water reflections, beyond the normal preset)");
}

void DPSOFTRAST_BlendFunc(int smodulate, int dmodulate) {SOFTWARE(dpsoft_BlendFunc(smodulate, dmodulate));blend[0] = smodulate;blend[1] = dmodulate;}
void DPSOFTRAST_BlendSubtract(int enable) {SOFTWARE(dpsoft_BlendSubtract(enable));blend_subtract = enable != 0;}
void DPSOFTRAST_DepthMask(int enable) {SOFTWARE(dpsoft_DepthMask(enable));depth_mask = enable != 0;}
void DPSOFTRAST_DepthFunc(int comparemode) {SOFTWARE(dpsoft_DepthFunc(comparemode));depth_func = comparemode;}

void DPSOFTRAST_DepthRange(float range0, float range1)
{
	SOFTWARE(dpsoft_DepthRange(range0, range1));
	range0 = bound(0.0f, range0, 1.0f);
	range1 = bound(0.0f, range1, 1.0f);
	if (range0 != depth_range[0] || range1 != depth_range[1])
	{
		ViewportChange();
		depth_range[0] = range0;depth_range[1] = range1;
	}
}

void DPSOFTRAST_PolygonOffset(float alongnormal, float intoview)
{
	SOFTWARE(dpsoft_PolygonOffset(alongnormal, intoview));
	polygon_offset[0] = alongnormal;polygon_offset[1] = intoview;
}

void DPSOFTRAST_CullFace(int mode) {SOFTWARE(dpsoft_CullFace(mode));cull_face = mode;}

void DPSOFTRAST_Color4f(float r, float g, float b, float a)
{
	SOFTWARE(dpsoft_Color4f(r, g, b, a));
	constant_color[0] = r;constant_color[1] = g;constant_color[2] = b;constant_color[3] = a;
}

// A block of the frame, as OpenGL's glReadPixels: rows from the bottom, BGRA.
// gpu@0 reads back only the surface, so the frame is presented again with a
// capture of the block.
void DPSOFTRAST_GetPixelsBGRA(int blockx, int blocky, int blockwidth, int blockheight, unsigned char *outpixels)
{
	SOFTWARE(dpsoft_GetPixelsBGRA(blockx, blocky, blockwidth, blockheight, outpixels));
	int width = min(blockwidth, fb_width - blockx), height = min(blockheight, fb_height - blocky);
	if (target_is_texture || blockx < 0 || blocky < 0 || width < 1 || height < 1)
	{
		Warn("reading back a texture target, or outside the frame, is not drawn");
		return;
	}
	if (!capture_buffer)
	{
		capture_buffer = NewHandle();
		void *p = Record(DOLLY_GPU_CREATE_BUFFER, 32);
		U64(p, 8, capture_buffer);U64(p, 16, Align(fb_width * 4, 256) * fb_height);U32(p, 24, 1 | 8);
	}
	const int capture[4] = {blockx, fb_height - blocky - height, width, height};
	DrawRecorded(64 + 88 + 8 + 32 + 8, 5, 0);
	Send(true, capture);
	uint32_t pitch = (uint32_t)Align(width * 4, 256), bytes = pitch * (height - 1) + width * 4;
	void *p = dolly_gpu_record(&gpu, DOLLY_GPU_MAP_READ, 32);
	U64(p, 8, capture_buffer);U64(p, 24, bytes);
	unsigned char *rows = (unsigned char *)malloc(bytes);
	int mapped = dolly_gpu_batch(&gpu) >= 0, read = mapped;
	for (uint32_t at = 0; read && at < bytes; at += DOLLY_GPU_REPLY_BYTES)
	{
		uint32_t n = min(bytes - at, DOLLY_GPU_REPLY_BYTES);
		if ((read = dolly_gpu_read(&gpu, capture_buffer, at, n) == (int)n))
			memcpy(rows + at, gpu.reply, n);
	}
	if (!read)
		Warn("reading the frame back failed: %s", strerror(errno));
	dolly_gpu_begin(&gpu);
	if (mapped)
		U64(dolly_gpu_record(&gpu, DOLLY_GPU_UNMAP, 16), 8, capture_buffer);
	for (int y = 0; read && y < height; y++)
	{
		const unsigned char *in = rows + (size_t)(height - 1 - y) * pitch;
		unsigned char *out = outpixels + (size_t)y * blockwidth * 4;
		for (int x = 0; x < width; x++, in += 4, out += 4)
		{
			out[0] = in[surface_bgra ? 0 : 2];
			out[1] = in[1];
			out[2] = in[surface_bgra ? 2 : 0];
			out[3] = in[3];
		}
	}
	free(rows);
}

// A rectangle of the frame into a texture, drawn by the copy pipeline.
void DPSOFTRAST_CopyRectangleToTexture(int index, int mip, int tx, int ty, int sx, int sy, int width, int height)
{
	SOFTWARE(dpsoft_CopyRectangleToTexture(index, mip, tx, ty, sx, sy, width, height));
	if (index <= 0 || index >= textures_end || !textures[index].handle)
		return;
	gpu_texture_t *texture = &textures[index];
	if (target_is_texture || mip || texture->mips > 1 || texture->layers > 1)
	{
		Warn("a copy from a texture target, or into a texture's smaller levels or faces, is not drawn");
		return;
	}
	width = min(width, min(texture->width - tx, fb_width - sx));
	height = min(height, min(texture->height - ty, fb_height - sy));
	if (tx < 0 || ty < 0 || sx < 0 || sy < 0 || width < 1 || height < 1)
		return;
	DrawRecorded(8 + 64 + 48 + 88 + 8, 5, 32);
	EndPass();
	uint32_t at = (uint32_t)Align(uniform_used, 16);
	const float origin[4] = {(float)(sx - tx), (float)(fb_height - sy + ty), 0, 0};
	memcpy(uniform_data + at, origin, 16);
	uniform_used = at + 16;
	void *p = dolly_gpu_record(&gpu, DOLLY_GPU_BEGIN_RENDER_PASS, 64);
	U64(p, 8, texture->handle);U32(p, 24, texture->width);U32(p, 28, texture->height);
	p = dolly_gpu_record(&gpu, DOLLY_GPU_VIEWPORT, 48);
	F32(p, 16, texture->width);F32(p, 20, texture->height);F32(p, 28, 1);
	U32(p, 32, tx);U32(p, 36, ty);U32(p, 40, width);U32(p, 44, height);
	p = dolly_gpu_record(&gpu, DOLLY_GPU_DRAW_MESH, 88);
	U64(p, 8, copy_pipeline);U32(p, 40, 3);U32(p, 44, 1);U32(p, 56, at / 16);U32(p, 64, 1);U64(p, 80, copy_group);
	dolly_gpu_record(&gpu, DOLLY_GPU_END_RENDER_PASS, 8);
	encoded = true;
}

void DPSOFTRAST_SetTexture(int unitnum, int index)
{
	SOFTWARE(dpsoft_SetTexture(unitnum, index));
	if (unitnum >= 0 && unitnum < DPSOFTRAST_MAXTEXTUREUNITS)
		bound_texture[unitnum] = index;
}

void DPSOFTRAST_SetVertexPointer(const float *vertex3f, size_t stride)
{
	SOFTWARE(dpsoft_SetVertexPointer(vertex3f, stride));
	arrays[0] = (vertex_array_t){vertex3f, stride, 3, false};
}

void DPSOFTRAST_SetColorPointer(const float *color4f, size_t stride)
{
	SOFTWARE(dpsoft_SetColorPointer(color4f, stride));
	arrays[1] = (vertex_array_t){color4f, stride, 4, false};
}

void DPSOFTRAST_SetColorPointer4ub(const unsigned char *color4ub, size_t stride)
{
	SOFTWARE(dpsoft_SetColorPointer4ub(color4ub, stride));
	arrays[1] = (vertex_array_t){color4ub, stride, 4, true};
}

void DPSOFTRAST_SetTexCoordPointer(int unitnum, int numcomponents, size_t stride, const float *texcoordf)
{
	SOFTWARE(dpsoft_SetTexCoordPointer(unitnum, numcomponents, stride, texcoordf));
	if (unitnum >= 0 && unitnum < DPSOFTRAST_MAXTEXCOORDARRAYS)
		arrays[2 + unitnum] = (vertex_array_t){texcoordf, stride, bound(2, numcomponents, 4), false};
}

// dpshaders.c compiles the shaders with USEEXACTSPECULARMATH, as Xonotic sets r_shadow_glossexact.
void DPSOFTRAST_SetShader(int mode, dpuint64 permutation, int exactspecularmath)
{
	pair_t *pair = LoadPair(mode, permutation);
	SOFTWARE(dpsoft_SetShader(mode, permutation, exactspecularmath));
	if (!exactspecularmath)
		Warn("the approximate specular math is drawn as the exact one");
	shader = pair;
}

static void SetUniform(int index, const float *v)
{
	if (index >= 0 && index < DPSOFTRAST_UNIFORM_TOTAL)
		memcpy(&uniform4f[index * 4], v, 16);
}

void DPSOFTRAST_Uniform4f(DPSOFTRAST_UNIFORM index, float v0, float v1, float v2, float v3)
{
	SOFTWARE(dpsoft_Uniform4f(index, v0, v1, v2, v3));
	const float v[4] = {v0, v1, v2, v3};
	SetUniform(index, v);
}

void DPSOFTRAST_Uniform4fv(DPSOFTRAST_UNIFORM index, const float *v)
{
	SOFTWARE(dpsoft_Uniform4fv(index, v));
	SetUniform(index, v);
}

void DPSOFTRAST_UniformMatrix4fv(DPSOFTRAST_UNIFORM uniform, int arraysize, int transpose, const float *v)
{
	SOFTWARE(dpsoft_UniformMatrix4fv(uniform, arraysize, transpose, v));
	for (int i = 0; i < arraysize; i++, v += 16)
		for (int row = 0; row < 4; row++)
		{
			const float t[4] = {v[row], v[row + 4], v[row + 8], v[row + 12]};
			SetUniform(uniform + i * 4 + row, transpose ? t : v + row * 4);
		}
}

// No GLSL uniform of the engine is an integer; the software path reads them.
void DPSOFTRAST_Uniform1i(DPSOFTRAST_UNIFORM index, int i0) {SOFTWARE(dpsoft_Uniform1i(index, i0));}

void DPSOFTRAST_DrawTriangles(int firstvertex, int numvertices, int numtriangles, const int *element3i, const unsigned short *element3s)
{
	SOFTWARE(dpsoft_DrawTriangles(firstvertex, numvertices, numtriangles, element3i, element3s));
	Draw(firstvertex, numvertices, numtriangles, element3i, element3s);
}
