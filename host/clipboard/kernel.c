// clipboard@0 kernel side: the clipboard's text, which a program copies and
// the page writes a user's paste into, and the lease its holder reads and
// writes it under.
#include "process-kernel.h"

#include <dolly/clipboard.h>
#include <errno.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

_Static_assert(
    offsetof(dolly_clipboard_mailbox, copy) == 4 * DOLLY_CLIPBOARD_WORD_COPY &&
    offsetof(dolly_clipboard_mailbox, length) == 4 * DOLLY_CLIPBOARD_WORD_LENGTH &&
    offsetof(dolly_clipboard_mailbox, holder) == 4 * DOLLY_CLIPBOARD_WORD_HOLDER &&
    offsetof(dolly_clipboard_mailbox, enabled) == 4 * DOLLY_CLIPBOARD_WORD_ENABLED,
    "clipboard mailbox words differ from dolly-clipboard-0.wat");

_Alignas(64) static dolly_clipboard_mailbox clipboard_mailbox;

// The holders, the newest last: a descendant of the holder takes the
// clipboard over it, as a program it runs to show its own window.
typedef struct {
  uint64_t generation;
  int owner;
} clipboard_lease;
#define CLIPBOARD_LEASE_DEPTH 4
static clipboard_lease leases[CLIPBOARD_LEASE_DEPTH];
static unsigned lease_depth;
static uint64_t next_generation = 1;

uintptr_t dolly_clipboard_mailbox_address(void) {
  return (uintptr_t)&clipboard_mailbox;
}

static void publish_holder(void) {
  atomic_store_explicit(&clipboard_mailbox.holder, lease_depth != 0, memory_order_release);
}

// The newest holder's lease of this generation, or why the caller has none.
static int newest_holder(int pid, uint64_t generation) {
  for (unsigned i = 0; generation != 0 && i < lease_depth; ++i) {
    if (leases[i].generation != generation) continue;
    if (pid <= 0 || pid != leases[i].owner) return -EPERM;
    return i == lease_depth - 1 ? 0 : -EBUSY;
  }
  return -ESTALE;
}

static void release_lease(int pid) {
  unsigned i = 0;
  while (i < lease_depth && leases[i].owner != pid) ++i;
  if (i == lease_depth) return;
  memmove(&leases[i], &leases[i + 1], (lease_depth - i - 1) * sizeof(leases[0]));
  memset(&leases[--lease_depth], 0, sizeof(leases[0]));
  publish_holder();
}

static int64_t acquire_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size != 0 || response_capacity < sizeof(dolly_clipboard_generation)) return -EINVAL;
  if (!atomic_load_explicit(&clipboard_mailbox.enabled, memory_order_acquire)) return -ENOSYS;
  if (lease_depth == 0) {
    const int foreground = dolly_kernel_foreground();
    if (pid <= 0 || foreground <= 0 || !dolly_process_descends_from(pid, foreground)) return -EPERM;
  } else {
    const int holder = leases[lease_depth - 1].owner;
    if (pid == holder || !dolly_process_descends_from(pid, holder) ||
        lease_depth == CLIPBOARD_LEASE_DEPTH) return -EBUSY;
  }
  clipboard_lease *lease = &leases[lease_depth++];
  *lease = (clipboard_lease){next_generation++, pid};
  publish_holder();
  const dolly_clipboard_generation response = {lease->generation};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t write_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                            uintptr_t response_capacity) {
  dolly_clipboard_write_request request;
  if (request_size < sizeof(request) || response_capacity != 0) return -EINVAL;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0 || request.length > DOLLY_CLIPBOARD_CAPACITY ||
      request_size != sizeof(request) + request.length) return -EINVAL;
  const int status = newest_holder(pid, request.generation);
  if (status != 0) return status;
  memcpy(clipboard_mailbox.text, mailbox + sizeof(request), request.length);
  atomic_store_explicit(&clipboard_mailbox.length, request.length, memory_order_relaxed);
  atomic_fetch_add_explicit(&clipboard_mailbox.copy, 1, memory_order_release);
  return 0;
}

static int64_t read_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                           uintptr_t response_capacity) {
  dolly_clipboard_generation request;
  const size_t header = sizeof(dolly_clipboard_read_response);
  if (request_size != sizeof(request) || response_capacity < header) return -EINVAL;
  memcpy(&request, mailbox, sizeof(request));
  const int status = newest_holder(pid, request.generation);
  if (status != 0) return status;
  const uint32_t length = atomic_load_explicit(&clipboard_mailbox.length, memory_order_acquire);
  if (length > DOLLY_CLIPBOARD_CAPACITY) return -EPROTO;
  const size_t copied = length < response_capacity - header ? length : response_capacity - header;
  const dolly_clipboard_read_response response = {length, 0};
  memcpy(mailbox, &response, header);
  memcpy(mailbox + header, clipboard_mailbox.text, copied);
  return (int64_t)(header + copied);
}

static int64_t release_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                              uintptr_t response_capacity) {
  dolly_clipboard_generation request;
  if (request_size != sizeof(request) || response_capacity != 0) return -EINVAL;
  memcpy(&request, mailbox, sizeof(request));
  const int status = newest_holder(pid, request.generation);
  if (status != 0 && status != -EBUSY) return status;
  release_lease(pid);
  return 0;
}

static int64_t clipboard_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                              uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_CLIPBOARD_ACQUIRE:
      return acquire_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_CLIPBOARD_WRITE:
      return write_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_CLIPBOARD_READ:
      return read_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_CLIPBOARD_RELEASE:
      return release_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

static void clipboard_release(int pid, int tid) {
  if (tid == 0) release_lease(pid);
}

const dolly_kernel_module dolly_clipboard_kernel = {
    DOLLY_CLIPBOARD_ACQUIRE, DOLLY_CLIPBOARD_RELEASE, clipboard_call, clipboard_release};
