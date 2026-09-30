#pragma once
#define _POSIX_C_SOURCE 200809L
#include <webgpu/webgpu.h>
#include <dolly/gpu.h>
#include <dolly/display.h>
#include <cglm/vec2.h>
#include <cglm/vec4.h>
#include <assert.h>
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define CODE(...) #__VA_ARGS__
#define STRVIEW(s) ((WGPUStringView){s,sizeof(s)-1})
#define ASSERT(x) assert(x)
#define ARRAY_SIZE(x) (sizeof(x)/sizeof((x)[0]))
#define MIN(a,b) ((a)<(b)?(a):(b))
#define MAX(a,b) ((a)>(b)?(a):(b))
#define UNUSED_VAR(x) (void)(x)
#define WGPU_RELEASE_RESOURCE(T,x) do {if(x){wgpu##T##Release(x);x=0;}} while(0);
#define WGPU_VERTATTR_DESC(l,f,o) ((WGPUVertexAttribute){.shaderLocation=l,.format=f,.offset=o})
#define WGPU_VERTEX_BUFFER_LAYOUT(name,stride,...) \
 WGPUVertexAttribute name##_attrs[]={__VA_ARGS__}; \
 WGPUVertexBufferLayout name##_vertex_buffer_layout={.arrayStride=stride,.stepMode=WGPUVertexStepMode_Vertex,.attributeCount=ARRAY_SIZE(name##_attrs),.attributes=name##_attrs};

typedef struct wgpu_context_t { WGPUDevice device; WGPUAdapter adapter; WGPUQueue queue; WGPUTextureView swapchain_view; WGPUTextureFormat render_format; unsigned width,height; } wgpu_context_t;
typedef struct { WGPUBuffer buffer; WGPUBufferUsage usage; uint32_t size,count; } wgpu_buffer_t;
typedef struct { const char *label; WGPUBufferUsage usage; uint32_t size,count; struct {const void *data;uint32_t size;} initial; WGPUBool mapped_at_creation; } wgpu_buffer_desc_t;
typedef struct {int type; float mouse_x,mouse_y;} input_event_t;
enum {INPUT_EVENT_TYPE_MOUSE_MOVE=1};
typedef struct {const char *title; bool no_depth_buffer;int (*init_cb)(wgpu_context_t*);int (*frame_cb)(wgpu_context_t*);void (*shutdown_cb)(wgpu_context_t*);void (*input_event_cb)(wgpu_context_t*,const input_event_t*);} wgpu_desc_t;
static void wgpu_start(const wgpu_desc_t *d) {(void)d;abort();} /* app.c owns the Dolly entry point. */
wgpu_buffer_t wgpu_create_buffer(wgpu_context_t*,const wgpu_buffer_desc_t*);
void wgpu_destroy_buffer(wgpu_buffer_t*);
WGPUShaderModule wgpu_create_shader_module(WGPUDevice,const char*);
WGPUBlendState wgpu_create_blend_state(bool);
extern dolly_gpu fluid_gpu;
extern uint64_t fluid_clock;
uint64_t gpu_id(void);
void fluid_draw_overlay(void);
void gpu_flush(void);
void gpu_reset_client(void);
void gpu_dimensions(unsigned,unsigned);
void gpu_check(int);
static double seconds(void) {struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec+t.tv_nsec*1e-9;}
static void stm_setup(void) {}
static uint64_t stm_now(void) {return fluid_clock?fluid_clock:(uint64_t)(seconds()*1e9);}
static double stm_ms(uint64_t t) {return t/1e6;}
static double stm_sec(uint64_t t) {return t/1e9;}
static uint64_t stm_diff(uint64_t a,uint64_t b) {return a-b;}
