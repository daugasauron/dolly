#include "device-lease.h"
#include "process-kernel.h"

#include <errno.h>
#include <string.h>

typedef struct {
  uint32_t version, operation;
  uint64_t scope, sequence;
  uint32_t bytes, reserved;
} dolly_device_header;
_Static_assert(sizeof(dolly_device_header) == 32, "device packet header");
_Static_assert(offsetof(dolly_device_reply, bytes) == 64, "device reply header");

static dolly_device_reply *reply_at(const dolly_leased_device *device, unsigned index) {
  return (dolly_device_reply *)(device->replies + index * (64 + device->reply_bytes));
}

void dolly_device_release(const dolly_leased_device *device, int pid) {
  for (unsigned i = 0; i < device->slots; ++i) {
    dolly_device_lease *lease = &device->leases[i];
    if (lease->pid != pid) continue;
    device->dispatch(NULL, lease->scope);
    lease->pid = 0;
    lease->pending = 0;
  }
}

int64_t dolly_device_call(const dolly_leased_device *device, int pid, unsigned char *packet,
                          uintptr_t size, uintptr_t capacity) {
  if (size < sizeof(dolly_device_header) || size > device->packet_bytes) return -EINVAL;
  dolly_device_header h;
  memcpy(&h, packet, sizeof(h));
  if (h.version != device->version || h.reserved || h.bytes != size - sizeof(h) ||
      !h.sequence || h.sequence > UINT32_MAX || h.scope > UINT32_MAX) return -EINVAL;
  unsigned i;
  for (i = 0; i < device->slots && device->leases[i].pid != pid; ++i) {}
  if (i == device->slots) {
    if (h.operation != device->open || h.scope != 0) return -EBADF;
    for (i = 0; i < device->slots; ++i)
      if (!device->leases[i].pid && device->leases[i].scope <= UINT32_MAX - device->slots) break;
    if (i == device->slots) return -EBUSY;
    dolly_device_lease *fresh = &device->leases[i];
    fresh->scope = fresh->scope ? fresh->scope + device->slots : i + 1;
    fresh->pid = pid;
    fresh->sequence = 0;
  }
  dolly_device_lease *lease = &device->leases[i];
  dolly_device_reply *reply = reply_at(device, i);
  if (device->reopen_busy && h.operation == device->open && lease->sequence && !lease->pending) return -EBUSY;
  if (h.scope != lease->scope && !(h.operation == device->open && h.scope == 0)) return -EBADF;
  if (!lease->pending) {
    if (h.sequence <= lease->sequence) return -ESTALE;
    h.scope = lease->scope;
    memcpy(packet, &h, sizeof(h));
    atomic_store(&reply->scope, lease->scope);
    atomic_store(&reply->sequence, (uint32_t)h.sequence);
    atomic_store(&reply->state, 0);
    int status = device->dispatch(packet, size);
    if (status < 0) {
      /* A cancelled process can still occupy this provider slot until its
         submitted work settles. Keep the new lease and retry admission. */
      if (h.operation == device->open && status == -EBUSY) return DOLLY_PROCESS_DISPATCH_DEFERRED;
      if (h.operation == device->open) lease->pid = 0;
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
  if (length > device->reply_bytes || length > capacity || error > 4095) result = -EIO;
  else if (!error) memcpy(packet, reply->bytes, length);
  lease->pending = 0;
  atomic_store(&reply->state, 0);
  if (lease->operation == device->close || (lease->operation == device->open && result < 0)) {
    dolly_device_release(device, pid);
  }
  return result;
}
