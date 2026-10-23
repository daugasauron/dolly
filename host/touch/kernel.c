// touch@0 kernel side: the record ring the page fills and the lease a
// foreground program reads it under.
#include "process-kernel.h"

#include <dolly/touch.h>
#include <emscripten/atomic.h>
#include <errno.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

_Static_assert(
    offsetof(dolly_touch_mailbox, read) == 4 * DOLLY_TOUCH_WORD_READ &&
    offsetof(dolly_touch_mailbox, write) == 4 * DOLLY_TOUCH_WORD_WRITE &&
    offsetof(dolly_touch_mailbox, lease) == 4 * DOLLY_TOUCH_WORD_LEASE &&
    offsetof(dolly_touch_mailbox, enabled) == 4 * DOLLY_TOUCH_WORD_ENABLED,
    "touch mailbox words differ from dolly-touch-0.wat");
_Static_assert((DOLLY_TOUCH_CAPACITY & (DOLLY_TOUCH_CAPACITY - 1)) == 0,
               "touch capacity must be a power of two");

_Alignas(64) static dolly_touch_mailbox touch_mailbox;

static uint64_t lease_generation;
static int lease_owner;
static uint64_t next_generation = 1;

uintptr_t dolly_touch_mailbox_address(void) {
  return (uintptr_t)&touch_mailbox;
}

static int listening(void) {
  return atomic_load_explicit(&touch_mailbox.enabled, memory_order_acquire) != 0;
}

// The page writes a record under the lease word it read; zero is no lease.
static uint32_t lease_word(uint64_t generation) {
  return (uint32_t)generation;
}

// What the ring holds was written for an earlier holder or none.
static void discard_records(void) {
  atomic_store_explicit(&touch_mailbox.read,
      atomic_load_explicit(&touch_mailbox.write, memory_order_acquire), memory_order_release);
}

static void publish_lease(uint32_t lease) {
  atomic_store_explicit(&touch_mailbox.lease, lease, memory_order_release);
  emscripten_atomic_notify((void *)&touch_mailbox.lease, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

static int validate_lease(int pid, uint64_t generation) {
  if (generation == 0 || generation != lease_generation) return -ESTALE;
  return pid > 0 && pid == lease_owner ? 0 : -EPERM;
}

static void release_lease(int pid) {
  if (lease_generation == 0 || lease_owner != pid) return;
  lease_generation = 0;
  lease_owner = 0;
  publish_lease(0);
  discard_records();
}

static int64_t acquire_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size != 0 || response_capacity < sizeof(dolly_touch_generation)) return -EINVAL;
  if (!listening()) return -ENOSYS;
  const int foreground = dolly_kernel_foreground();
  if (pid <= 0 || foreground <= 0 || !dolly_process_descends_from(pid, foreground)) return -EPERM;
  if (lease_generation != 0) return -EBUSY;
  if (lease_word(next_generation) == 0) ++next_generation;
  lease_generation = next_generation++;
  lease_owner = pid;
  discard_records();
  publish_lease(lease_word(lease_generation));
  const dolly_touch_generation response = {lease_generation};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t read_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                           uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_touch_read_request)) return -EINVAL;
  dolly_touch_read_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.capacity == 0 || request.capacity > DOLLY_TOUCH_READ_RECORDS || request.reserved != 0 ||
      response_capacity < offsetof(dolly_touch_read_response, records) +
          (uintptr_t)request.capacity * sizeof(dolly_touch_record)) return -EINVAL;
  const int status = validate_lease(pid, request.generation);
  if (status != 0) return status;
  if (!listening()) return -ENOSYS;
  dolly_touch_read_response response = {0};
  uint32_t read = atomic_load_explicit(&touch_mailbox.read, memory_order_relaxed);
  const uint32_t write = atomic_load_explicit(&touch_mailbox.write, memory_order_acquire);
  if (write - read > DOLLY_TOUCH_CAPACITY) return -EPROTO;
  for (; read != write && response.count < request.capacity; ++read) {
    const dolly_touch_record *record = &touch_mailbox.records[read & (DOLLY_TOUCH_CAPACITY - 1)];
    if (record->lease == lease_word(lease_generation)) response.records[response.count++] = *record;
  }
  atomic_store_explicit(&touch_mailbox.read, read, memory_order_release);
  if (response.count == 0 && dolly_kernel_deadline_pending(request.deadline_nanoseconds))
    return DOLLY_PROCESS_DISPATCH_DEFERRED;
  return dolly_kernel_respond(mailbox, &response, offsetof(dolly_touch_read_response, records) +
                                                      response.count * sizeof(dolly_touch_record));
}

static int64_t release_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_touch_generation) || response_capacity != 0) return -EINVAL;
  dolly_touch_generation request;
  memcpy(&request, mailbox, sizeof(request));
  const int status = validate_lease(pid, request.generation);
  if (status != 0) return status;
  release_lease(pid);
  return 0;
}

static int64_t touch_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                          uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_TOUCH_ACQUIRE:
      return acquire_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_TOUCH_READ:
      return read_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_TOUCH_RELEASE:
      return release_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

static void touch_release(int pid, int tid) {
  if (tid == 0) release_lease(pid);
}

const dolly_kernel_module dolly_touch_kernel = {
    DOLLY_TOUCH_ACQUIRE, DOLLY_TOUCH_RELEASE, touch_call, touch_release};
