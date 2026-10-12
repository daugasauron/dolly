/* The device side of the Mojo package `gpu` (gpu.host.DeviceContext) over
 * Dolly's gpu@0. A kernel is WGSL as the compiler's webgpu target prints it:
 * pointer parameters are storage buffers bound in order, the other parameters
 * are 32-bit slots of one more buffer, block_dim is the workgroup size. */
#include <dolly/gpu.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>

enum { STORAGE = 128 | 4 | 8, READBACK = 1 | 8, CHUNK = 512 * 1024 };

static dolly_gpu g;
static uint64_t next = 1;

static int64_t done(void) { return dolly_gpu_batch(&g) < 0 ? -errno : 0; }

int64_t mojo_gpu_open(void) {
  if (g.scope) return 0;
  return dolly_gpu_open(&g, 0, 0) < 0 ? -errno : 0;
}

int64_t mojo_gpu_buffer(uint64_t bytes) {
  uint64_t id = next++;
  dolly_gpu_begin(&g);
  dolly_gpu_buffer(&g, id, (bytes + 3) & ~(uint64_t)3, STORAGE);
  int64_t error = done();
  return error ? error : (int64_t)id;
}

int64_t mojo_gpu_release(uint64_t id) {
  dolly_gpu_begin(&g);
  void *record = dolly_gpu_record(&g, DOLLY_GPU_RELEASE, 16);
  memcpy((char *)record + 8, &id, 8);
  return done();
}

int64_t mojo_gpu_write(uint64_t buffer, uint64_t offset, const void *data, uint64_t bytes) {
  for (uint64_t at = 0; at < bytes; at += CHUNK) {
    uint32_t size = bytes - at < CHUNK ? (uint32_t)(bytes - at) : CHUNK;
    dolly_gpu_begin(&g);
    char *record = dolly_gpu_record(&g, DOLLY_GPU_WRITE_BUFFER, 32 + size);
    uint64_t target = offset + at;
    uint32_t data_offset = 32;
    memcpy(record + 8, &buffer, 8);
    memcpy(record + 16, &target, 8);
    memcpy(record + 24, &data_offset, 4);
    memcpy(record + 28, &size, 4);
    memcpy(record + 32, (const char *)data + at, size);
    int64_t error = done();
    if (error) return error;
  }
  return 0;
}

int64_t mojo_gpu_read(uint64_t buffer, uint64_t offset, void *data, uint64_t bytes) {
  uint64_t staging = next++, size = (bytes + 3) & ~(uint64_t)3;
  dolly_gpu_begin(&g);
  dolly_gpu_buffer(&g, staging, size, READBACK);
  char *copy = dolly_gpu_record(&g, DOLLY_GPU_COPY_BUFFER, 48);
  memcpy(copy + 8, &buffer, 8);
  memcpy(copy + 16, &staging, 8);
  memcpy(copy + 24, &offset, 8);
  memcpy(copy + 40, &size, 8);
  dolly_gpu_submit(&g);
  dolly_gpu_map(&g, staging, size);
  int64_t error = done();
  for (uint64_t at = 0; !error && at < bytes; at += DOLLY_GPU_REPLY_BYTES) {
    uint64_t part = bytes - at < DOLLY_GPU_REPLY_BYTES ? bytes - at : DOLLY_GPU_REPLY_BYTES;
    if (dolly_gpu_read(&g, staging, at, part) != (int)part) error = errno ? -errno : -EIO;
    else memcpy((char *)data + at, g.reply, part);
  }
  int64_t released = mojo_gpu_release(staging);
  return error ? error : released;
}

/* One shader module per kernel text and one pipeline per block_dim of it. */
static struct { const char *code; uint64_t shader, pipeline; uint32_t block[3]; } kernels[64];

static int64_t pipeline(const char *code, uint64_t bytes, const uint32_t block[3]) {
  uint64_t shader = 0;
  unsigned free = 64;
  for (unsigned i = 0; i < 64; i++) {
    if (!kernels[i].code) { if (free == 64) free = i; continue; }
    if (kernels[i].code != code) continue;
    shader = kernels[i].shader;
    if (!memcmp(kernels[i].block, block, sizeof kernels[i].block)) return (int64_t)kernels[i].pipeline;
  }
  if (free == 64) return -ENOSPC;
  dolly_gpu_begin(&g);
  if (!shader) {
    shader = next++;
    char *record = dolly_gpu_record(&g, DOLLY_GPU_CREATE_SHADER, 24 + bytes);
    uint32_t length = (uint32_t)bytes;
    memcpy(record + 8, &shader, 8);
    memcpy(record + 16, &length, 4);
    memcpy(record + 24, code, bytes);
  }
  /* COMPUTE_CONSTANTS: the entry "kernel", then block_x, block_y, block_z. */
  uint64_t id = next++;
  char *record = dolly_gpu_record(&g, DOLLY_GPU_COMPUTE_CONSTANTS, 40 + 3 * 24);
  uint32_t entry = 6, count = 3;
  memcpy(record + 8, &id, 8);
  memcpy(record + 16, &shader, 8);
  memcpy(record + 24, &entry, 4);
  memcpy(record + 28, &count, 4);
  memcpy(record + 32, "kernel", 6);
  for (unsigned axis = 0; axis < 3; axis++) {
    char *constant = record + 40 + axis * 24;
    uint32_t name = 7;
    double value = block[axis];
    memcpy(constant, &name, 4);
    memcpy(constant + 8, &value, 8);
    memcpy(constant + 16, "block_x", 7);
    constant[22] += (char)axis;
  }
  int64_t error = done();
  if (error) return error;
  kernels[free].code = code;
  kernels[free].shader = shader;
  kernels[free].pipeline = id;
  memcpy(kernels[free].block, block, sizeof kernels[free].block);
  return (int64_t)id;
}

int64_t mojo_gpu_launch(const char *code, uint64_t bytes, const uint32_t grid[3], const uint32_t block[3],
                        const uint64_t *buffers, const uint64_t *sizes, uint32_t buffer_count,
                        const uint32_t *slots, uint32_t slot_count) {
  if (buffer_count + !!slot_count > DOLLY_GPU_MAX_BINDINGS) return -E2BIG;
  int64_t compute = pipeline(code, bytes, block);
  if (compute < 0) return compute;
  uint64_t bound[DOLLY_GPU_MAX_BINDINGS], bound_sizes[DOLLY_GPU_MAX_BINDINGS], arguments = 0;
  memcpy(bound, buffers, buffer_count * 8);
  memcpy(bound_sizes, sizes, buffer_count * 8);
  dolly_gpu_begin(&g);
  if (slot_count) {
    arguments = next++;
    dolly_gpu_buffer(&g, arguments, slot_count * 4, STORAGE);
    dolly_gpu_write(&g, arguments, slots, slot_count * 4);
    bound[buffer_count] = arguments;
    bound_sizes[buffer_count++] = slot_count * 4;
  }
  uint64_t group = next++;
  dolly_gpu_group(&g, group, (uint64_t)compute, buffer_count, bound, bound_sizes);
  char *record = dolly_gpu_record(&g, DOLLY_GPU_COMPUTE, 40);
  memcpy(record + 8, &compute, 8);
  memcpy(record + 16, &group, 8);
  memcpy(record + 24, grid, 12);
  dolly_gpu_submit(&g);
  int64_t error = done();
  if (error) return error;
  error = mojo_gpu_release(group);
  return error || !arguments ? error : mojo_gpu_release(arguments);
}

int64_t mojo_gpu_synchronize(void) { return dolly_gpu_wait(&g) < 0 ? -errno : 0; }
