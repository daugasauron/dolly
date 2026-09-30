// gpu@0 kernel side: a device leased per process (src/device-lease.c).
#include "device-lease.h"
#include "process-kernel.h"

#include <dolly/gpu-abi.h>
#include <emscripten/emscripten.h>
#include <errno.h>

static _Alignas(64) unsigned char replies[DOLLY_GPU_SLOTS * (64 + DOLLY_GPU_REPLY_BYTES)];
static dolly_device_lease leases[DOLLY_GPU_SLOTS];

DOLLY_EM_JS(int, dolly_gpu_dispatch, (const void *packet, uintptr_t bytes), {
  return -ENOSYS;
});
uintptr_t dolly_gpu_mailbox_address(void) { return (uintptr_t)replies; }

static const dolly_leased_device gpu = {
    DOLLY_GPU_VERSION, DOLLY_GPU_OPEN, DOLLY_GPU_CLOSE, DOLLY_GPU_SLOTS,
    DOLLY_GPU_PACKET_BYTES, DOLLY_GPU_REPLY_BYTES, 0, dolly_gpu_dispatch, replies, leases};

static int64_t gpu_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                         uintptr_t size, uintptr_t capacity) {
  return dolly_device_call(&gpu, pid, packet, size, capacity);
}

static void gpu_release(int pid, int tid) {
  if (tid == 0) dolly_device_release(&gpu, pid);
}

const dolly_kernel_module dolly_gpu_kernel = {DOLLY_GPU_PROCESS_OP, DOLLY_GPU_PROCESS_OP, gpu_call, gpu_release};
