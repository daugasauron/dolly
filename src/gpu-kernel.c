#include "gpu-kernel.h"
#include "process-kernel.h"
#include <dolly/gpu-abi.h>
#include <emscripten/emscripten.h>
#include <stdatomic.h>
#include <errno.h>
#include <limits.h>
#include <string.h>

typedef struct {
  uint32_t version, operation;
  uint64_t scope, sequence;
  uint32_t bytes, reserved;
} Header;
typedef struct {
  _Atomic uint32_t state, scope, sequence, error, length;
  unsigned char reserved[44], bytes[DOLLY_GPU_REPLY_BYTES];
} Reply;
typedef struct {
  int pid;
  uint32_t scope, sequence, operation;
  int pending;
} Lease;
_Static_assert(sizeof(Header) == 32, "GPU packet header");
_Static_assert(offsetof(Reply, bytes) == 64, "GPU reply header");
static _Alignas(64) Reply replies[DOLLY_GPU_SLOTS];
static Lease leases[DOLLY_GPU_SLOTS];

#define DOLLY_EM_JS(...) EM_JS(__VA_ARGS__)
DOLLY_EM_JS(int, dolly_gpu_dispatch, (const void *packet, uintptr_t bytes), {
  if (!Module["gpuDispatch"]) return -ENOSYS;
  return Module["gpuDispatch"]({memory: HEAPU8.buffer, address: packet, bytes});
});
#undef DOLLY_EM_JS
EMSCRIPTEN_KEEPALIVE
uintptr_t dolly_gpu_mailbox_address(void) { return (uintptr_t)replies; }

void dolly_gpu_release_owner(int pid) {
  for (unsigned i = 0; i < DOLLY_GPU_SLOTS; ++i) {
    if (leases[i].pid != pid) continue;
    dolly_gpu_dispatch(NULL, leases[i].scope);
    leases[i].pid = 0;
    leases[i].pending = 0;
  }
}

int64_t dolly_gpu_process_call(int pid, unsigned char *packet, size_t size, size_t capacity) {
  if (size < sizeof(Header) || size > DOLLY_GPU_PACKET_BYTES) return -EINVAL;
  Header h;
  memcpy(&h, packet, sizeof(h));
  if (h.version != DOLLY_GPU_VERSION || h.reserved || h.bytes != size - sizeof(h) ||
      !h.sequence || h.sequence > UINT32_MAX || h.scope > UINT32_MAX) return -EINVAL;
  unsigned i;
  for (i = 0; i < DOLLY_GPU_SLOTS && leases[i].pid != pid; ++i) {}
  if (i == DOLLY_GPU_SLOTS) {
    if (h.operation != DOLLY_GPU_OPEN || h.scope != 0) return -EBADF;
    for (i = 0; i < DOLLY_GPU_SLOTS; ++i)
      if (!leases[i].pid && leases[i].scope <= UINT32_MAX - DOLLY_GPU_SLOTS) break;
    if (i == DOLLY_GPU_SLOTS) return -EBUSY;
    leases[i].scope = leases[i].scope ? leases[i].scope + DOLLY_GPU_SLOTS : i + 1;
    leases[i].pid = pid;
    leases[i].sequence = 0;
  }
  Lease *lease = &leases[i];
  Reply *reply = &replies[i];
  if (h.scope != lease->scope && !(h.operation == DOLLY_GPU_OPEN && h.scope == 0)) return -EBADF;
  if (!lease->pending) {
    if (h.sequence <= lease->sequence) return -ESTALE;
    h.scope = lease->scope;
    memcpy(packet, &h, sizeof(h));
    atomic_store(&reply->scope, lease->scope);
    atomic_store(&reply->sequence, (uint32_t)h.sequence);
    atomic_store(&reply->state, 0);
    int status = dolly_gpu_dispatch(packet, size);
    if (status < 0) {
      if (h.operation == DOLLY_GPU_OPEN) lease->pid = 0;
      return status;
    }
    lease->sequence = (uint32_t)h.sequence;
    lease->operation = h.operation;
    lease->pending = 1;
  } else if (h.sequence != lease->sequence || h.operation != lease->operation) return -EBUSY;
  if (atomic_load_explicit(&reply->state, memory_order_acquire) != 1 ||
      atomic_load(&reply->scope) != lease->scope ||
      atomic_load(&reply->sequence) != lease->sequence) return DOLLY_PROCESS_DISPATCH_DEFERRED;
  uint32_t length = atomic_load(&reply->length), error = atomic_load(&reply->error);
  int64_t result = error ? -(int64_t)error : (int64_t)length;
  if (length > DOLLY_GPU_REPLY_BYTES || length > capacity || error > 4095) result = -EIO;
  else if (!error) memcpy(packet, reply->bytes, length);
  lease->pending = 0;
  atomic_store(&reply->state, 0);
  if (lease->operation == DOLLY_GPU_CLOSE || (lease->operation == DOLLY_GPU_OPEN && result < 0)) {
    dolly_gpu_release_owner(pid);
  }
  return result;
}
