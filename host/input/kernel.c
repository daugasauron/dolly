// input@0 kernel side: the record ring the page fills, the lease a foreground
// program reads it under, and the terminal's reader of every other record.
#include "process-kernel.h"
#include "ring.h"

#include <dolly/input.h>
#include <dolly/process.h>
#include <emscripten/atomic.h>
#include <errno.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

_Static_assert(
    offsetof(dolly_input_mailbox, event_read) == 4 * DOLLY_INPUT_WORD_EVENT_READ &&
    offsetof(dolly_input_mailbox, event_write) == 4 * DOLLY_INPUT_WORD_EVENT_WRITE &&
    offsetof(dolly_input_mailbox, flags) == 4 * DOLLY_INPUT_WORD_FLAGS &&
    offsetof(dolly_input_mailbox, paste_sequence) == 4 * DOLLY_INPUT_WORD_PASTE_SEQUENCE &&
    offsetof(dolly_input_mailbox, paste_consumed_sequence) == 4 * DOLLY_INPUT_WORD_PASTE_CONSUMED_SEQUENCE &&
    offsetof(dolly_input_mailbox, paste_length) == 4 * DOLLY_INPUT_WORD_PASTE_LENGTH,
    "input mailbox words differ from dolly-input-0.wat");

_Alignas(64) static dolly_input_mailbox input_mailbox;
_Alignas(64) static unsigned char paste_buffer[DOLLY_INPUT_PASTE_CAPACITY];
static dolly_input_ring ring = {&input_mailbox, NULL};

static uint64_t lease_generation;
static int lease_owner;
static uint64_t next_generation = 1;

static unsigned char encoded_input[256];
static size_t encoded_input_length;
static size_t encoded_input_cursor;

uintptr_t dolly_input_mailbox_address(void) {
  return (uintptr_t)&input_mailbox;
}

uintptr_t dolly_input_paste_buffer_address(void) {
  return (uintptr_t)paste_buffer;
}

int dolly_input_decoder_install(const dolly_input_decoder *decoder) {
  if (decoder == NULL || decoder->record == NULL || decoder->paste == NULL) return -EINVAL;
  if (ring.decoder != NULL) return -EBUSY;
  ring.decoder = decoder;
  return 0;
}

// The page follows the lease and the pointer request.
static void publish_flags(uint32_t flags) {
  atomic_store_explicit(&input_mailbox.flags, flags, memory_order_release);
  emscripten_atomic_notify((void *)&input_mailbox.flags, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
}

// An application may return immediately on a key-down record while the
// matching key-up is already queued. That record belongs to the old
// foreground command or lessee and must not become input to its successor.
static void discard_pending_input(int terminal_ui) {
  dolly_input_ring_discard(&ring, terminal_ui);
  atomic_store_explicit(&input_mailbox.paste_consumed_sequence,
      atomic_load_explicit(&input_mailbox.paste_sequence, memory_order_acquire), memory_order_release);
  encoded_input_cursor = 0;
  encoded_input_length = 0;
}

void dolly_terminal_discard_pending_input(void) {
  discard_pending_input(lease_generation == 0);
}

int dolly_kernel_terminal_input_service(void) {
  return lease_generation == 0 ? dolly_input_ring_service(&ring) : 0;
}

// Decodes one record for the terminal's reader into encoded_input.
static int decode(const dolly_input_event *event) {
  if (event->type != DOLLY_INPUT_EVENT_PASTE)
    return ring.decoder->record(event, encoded_input, sizeof(encoded_input), &encoded_input_length);
  const uint32_t sequence = atomic_load_explicit(&input_mailbox.paste_sequence, memory_order_acquire);
  if (sequence == atomic_load_explicit(&input_mailbox.paste_consumed_sequence, memory_order_relaxed)) return 0;
  const uint32_t size = atomic_load_explicit(&input_mailbox.paste_length, memory_order_relaxed);
  const int result = size > DOLLY_INPUT_PASTE_CAPACITY ? -EPROTO
      : ring.decoder->paste(paste_buffer, size, encoded_input, sizeof(encoded_input), &encoded_input_length);
  atomic_store_explicit(&input_mailbox.paste_consumed_sequence, sequence, memory_order_release);
  return result;
}

// Buffers the terminal's next input bytes; returns 1 when some are ready and
// -1 otherwise. The kernel thread never waits for input.
static int fill_terminal_input(void) {
  for (;;) {
    if (encoded_input_cursor < encoded_input_length) return 1;
    encoded_input_cursor = 0;
    // What the terminal answers itself (a cursor report, the rest of a long
    // paste) comes before the next record.
    encoded_input_length = dolly_kernel_terminal_replies(encoded_input, sizeof(encoded_input));
    if (encoded_input_length != 0) continue;
    // A lessee reads the records itself: no terminal reader may race it for
    // the single-consumer ring.
    dolly_input_event event;
    if (lease_generation != 0 || ring.decoder == NULL || !dolly_input_ring_take(&ring, &event)) return -1;
    if (decode(&event) != 0) encoded_input_length = 0;
  }
}

int dolly_kernel_terminal_ready(void) {
  return fill_terminal_input() > 0;
}

int dolly_kernel_terminal_read(void) {
  if (fill_terminal_input() <= 0) return -1;
  return encoded_input[encoded_input_cursor++];
}

static int validate_lease(int pid, uint64_t generation) {
  if (generation == 0 || generation != lease_generation) return -ESTALE;
  return pid > 0 && pid == lease_owner ? 0 : -EPERM;
}

static void release_lease(int pid) {
  if (lease_generation == 0 || lease_owner != pid) return;
  lease_generation = 0;
  lease_owner = 0;
  // Records published during the lease were its owner's: its pointer and
  // scroll records are not the terminal's.
  discard_pending_input(0);
  publish_flags(0);
}

static int64_t acquire_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size != 0 || response_capacity < sizeof(dolly_input_generation)) return -EINVAL;
  const int foreground = dolly_kernel_foreground();
  if (pid <= 0 || foreground <= 0 || !dolly_process_descends_from(pid, foreground)) return -EPERM;
  if (lease_generation != 0) return -EBUSY;
  lease_generation = next_generation++;
  lease_owner = pid;
  encoded_input_cursor = 0;
  encoded_input_length = 0;
  publish_flags(DOLLY_INPUT_LEASED);
  const dolly_input_generation response = {lease_generation};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t next_event_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                                 uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_input_event_request) ||
      response_capacity < sizeof(dolly_input_event_response)) return -EINVAL;
  dolly_input_event_request request;
  memcpy(&request, mailbox, sizeof(request));
  const int status = validate_lease(pid, request.generation);
  if (status != 0) return status;
  dolly_input_event_response response = {0};
  if (!dolly_input_ring_take(&ring, &response.event)) {
    if (dolly_kernel_deadline_pending(request.deadline_nanoseconds)) return DOLLY_PROCESS_DISPATCH_DEFERRED;
    return dolly_kernel_respond(mailbox, &response, sizeof(response));
  }
  if ((size_t)response.event.key_length + response.event.code_length + response.event.text_length >
      sizeof(response.event.data)) return -EPROTO;
  response.result = 1;
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t set_pointer_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                                  uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_input_pointer_request) || response_capacity != 0) return -EINVAL;
  dolly_input_pointer_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.relative > 1 || request.reserved != 0) return -EINVAL;
  const int status = validate_lease(pid, request.generation);
  if (status != 0) return status;
  publish_flags(DOLLY_INPUT_LEASED | (request.relative ? DOLLY_INPUT_POINTER_RELATIVE : 0));
  return 0;
}

static int64_t release_packet(int pid, unsigned char *mailbox, uintptr_t request_size,
                              uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_input_generation) || response_capacity != 0) return -EINVAL;
  dolly_input_generation request;
  memcpy(&request, mailbox, sizeof(request));
  const int status = validate_lease(pid, request.generation);
  if (status != 0) return status;
  release_lease(pid);
  return 0;
}

static int64_t input_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                          uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_INPUT_ACQUIRE:
      return acquire_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_INPUT_NEXT_EVENT:
      return next_event_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_INPUT_SET_POINTER:
      return set_pointer_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_INPUT_RELEASE:
      return release_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

static void input_release(int pid, int tid) {
  if (tid == 0) release_lease(pid);
}

const dolly_kernel_module dolly_input_kernel = {
    DOLLY_INPUT_ACQUIRE, DOLLY_INPUT_RELEASE, input_call, input_release};
