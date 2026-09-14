#pragma once
#include <dolly/gpu-abi.h>
#include <stddef.h>
#include <stdint.h>

/* Experimental client of dolly-gpu-0.wat; not the WebGPU C API. */
typedef struct {
  uint64_t scope;
  uint32_t sequence, count;
  size_t length;
  unsigned char packet[DOLLY_GPU_PACKET_BYTES];
  unsigned char reply[DOLLY_GPU_REPLY_BYTES];
} dolly_gpu;

int dolly_gpu_open(dolly_gpu *g, uint32_t width, uint32_t height);
int dolly_gpu_close(dolly_gpu *g);
int dolly_gpu_wait(dolly_gpu *g);
int dolly_gpu_read(dolly_gpu *g, uint64_t buffer, uint64_t offset, uint64_t length);
void dolly_gpu_begin(dolly_gpu *g);
void *dolly_gpu_record(dolly_gpu *g, uint32_t opcode, size_t bytes);
int dolly_gpu_batch(dolly_gpu *g);
void dolly_gpu_buffer(dolly_gpu *g, uint64_t id, uint64_t size, uint32_t usage);
void dolly_gpu_write(dolly_gpu *g, uint64_t id, const void *data, uint32_t size);
void dolly_gpu_shader(dolly_gpu *g, uint64_t id, const char *code);
void dolly_gpu_pipeline(dolly_gpu *g, uint64_t id, uint64_t shader,
                        const char *vertex, const char *fragment, uint32_t blend);
void dolly_gpu_compute_pipeline(dolly_gpu *g, uint64_t id, uint64_t shader, const char *entry);
void dolly_gpu_group(dolly_gpu *g, uint64_t id, uint64_t pipeline,
                     unsigned count, const uint64_t *buffers, const uint64_t *sizes);
void dolly_gpu_draw(dolly_gpu *g, uint64_t pipeline, uint64_t group,
                    unsigned vertices, unsigned instances, unsigned width, unsigned height, int clear);
void dolly_gpu_dispatch(dolly_gpu *g, uint64_t pipeline, uint64_t group, unsigned x);
void dolly_gpu_copy(dolly_gpu *g, uint64_t src, uint64_t dst, uint64_t size);
void dolly_gpu_map(dolly_gpu *g, uint64_t id, uint64_t size);
void dolly_gpu_submit(dolly_gpu *g);
