#include "process-kernel.h"
#include <dolly/audio-abi.h>
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
  unsigned char reserved[44], bytes[DOLLY_AUDIO_REPLY_BYTES];
} Reply;
typedef struct {
  int pid;
  uint32_t scope, sequence, operation;
  int pending;
} Lease;
_Static_assert(sizeof(Header) == 32, "Audio packet header");
_Static_assert(offsetof(Reply, bytes) == 64, "Audio reply header");
_Static_assert(sizeof(Reply) == 80, "Audio reply stride");
static _Alignas(64) Reply replies[DOLLY_AUDIO_SLOTS];
static Lease leases[DOLLY_AUDIO_SLOTS];

DOLLY_EM_JS(int, dolly_audio_dispatch, (const void *packet, uintptr_t bytes), {
  if (!Module["audioDispatch"]) return -ENOSYS;
  return Module["audioDispatch"]({memory: HEAPU8.buffer, address: packet, bytes});
});
uintptr_t dolly_audio_mailbox_address(void) { return (uintptr_t)replies; }

static void audio_release_owner(int pid) {
  for (unsigned i = 0; i < DOLLY_AUDIO_SLOTS; ++i) {
    if (leases[i].pid != pid) continue;
    dolly_audio_dispatch(NULL, leases[i].scope);
    leases[i].pid = 0;
    leases[i].pending = 0;
  }
}

static int64_t audio_call(int pid, int tid, uint32_t operation, unsigned char *packet,
                          uintptr_t size, uintptr_t capacity) {
  if (size < sizeof(Header) || size > DOLLY_AUDIO_PACKET_BYTES) return -EINVAL;
  Header h;
  memcpy(&h, packet, sizeof(h));
  if (h.version != DOLLY_AUDIO_VERSION || h.reserved || h.bytes != size - sizeof(h) ||
      !h.sequence || h.sequence > UINT32_MAX || h.scope > UINT32_MAX) return -EINVAL;
  unsigned i;
  for (i = 0; i < DOLLY_AUDIO_SLOTS && leases[i].pid != pid; ++i) {}
  if (i == DOLLY_AUDIO_SLOTS) {
    if (h.operation != DOLLY_AUDIO_OPEN || h.scope != 0) return -EBADF;
    for (i = 0; i < DOLLY_AUDIO_SLOTS; ++i)
      if (!leases[i].pid && leases[i].scope <= UINT32_MAX - DOLLY_AUDIO_SLOTS) break;
    if (i == DOLLY_AUDIO_SLOTS) return -EBUSY;
    leases[i].scope = leases[i].scope ? leases[i].scope + DOLLY_AUDIO_SLOTS : i + 1;
    leases[i].pid = pid;
    leases[i].sequence = 0;
  }
  Lease *lease = &leases[i];
  Reply *reply = &replies[i];
  if (h.operation == DOLLY_AUDIO_OPEN && lease->sequence && !lease->pending) return -EBUSY;
  if (h.scope != lease->scope && !(h.operation == DOLLY_AUDIO_OPEN && h.scope == 0)) return -EBADF;
  if (!lease->pending) {
    if (h.sequence <= lease->sequence) return -ESTALE;
    h.scope = lease->scope;
    memcpy(packet, &h, sizeof(h));
    atomic_store(&reply->scope, lease->scope);
    atomic_store(&reply->sequence, (uint32_t)h.sequence);
    atomic_store(&reply->state, 0);
    int status = dolly_audio_dispatch(packet, size);
    if (status < 0) {
      /* A cancelled process can still occupy this provider slot until its
         queued audio is revoked. Keep the new lease and retry admission. */
      if (h.operation == DOLLY_AUDIO_OPEN && status == -EBUSY)
        return DOLLY_PROCESS_DISPATCH_DEFERRED;
      if (h.operation == DOLLY_AUDIO_OPEN) lease->pid = 0;
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
  if (length > DOLLY_AUDIO_REPLY_BYTES || length > capacity || error > 4095) result = -EIO;
  else if (!error) memcpy(packet, reply->bytes, length);
  lease->pending = 0;
  atomic_store(&reply->state, 0);
  if (lease->operation == DOLLY_AUDIO_CLOSE || (lease->operation == DOLLY_AUDIO_OPEN && result < 0)) {
    audio_release_owner(pid);
  }
  return result;
}

static void audio_release(int pid, int tid) {
  if (tid == 0) audio_release_owner(pid);
}

const dolly_kernel_module dolly_audio_kernel = {DOLLY_AUDIO_PROCESS_OP, DOLLY_AUDIO_PROCESS_OP, audio_call, audio_release};
