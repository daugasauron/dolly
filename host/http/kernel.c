// http@0 kernel side: the browser broker's slot mailboxes and the process
// packets that start, poll and cancel requests in them.
#include "process-kernel.h"

#include <dolly/http.h>
#include <dolly/process.h>
#include <emscripten/atomic.h>
#include <emscripten/emscripten.h>
#include <errno.h>
#include <stdatomic.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  _Atomic uint32_t state;
  _Atomic uint32_t sequence;
  _Atomic uint32_t status;
  _Atomic uint32_t length;
  _Atomic uint32_t eof;
  _Atomic uint32_t error;
  _Atomic uint32_t kind;
  unsigned char reserved[DOLLY_HTTP_HEADER_SIZE - 7 * sizeof(uint32_t)];
  unsigned char data[DOLLY_HTTP_CHUNK_CAPACITY];
} dolly_http_mailbox;

_Static_assert(offsetof(dolly_http_mailbox, state) == 4 * DOLLY_HTTP_WORD_STATE &&
               offsetof(dolly_http_mailbox, sequence) == 4 * DOLLY_HTTP_WORD_SEQUENCE &&
               offsetof(dolly_http_mailbox, status) == 4 * DOLLY_HTTP_WORD_STATUS &&
               offsetof(dolly_http_mailbox, length) == 4 * DOLLY_HTTP_WORD_LENGTH &&
               offsetof(dolly_http_mailbox, eof) == 4 * DOLLY_HTTP_WORD_EOF &&
               offsetof(dolly_http_mailbox, error) == 4 * DOLLY_HTTP_WORD_ERROR &&
               offsetof(dolly_http_mailbox, kind) == 4 * DOLLY_HTTP_WORD_KIND &&
               offsetof(dolly_http_mailbox, data) == DOLLY_HTTP_HEADER_SIZE,
               "HTTP mailbox layout differs from dolly-http-0.wat");

_Alignas(64) static dolly_http_mailbox http_mailboxes[DOLLY_HTTP_SLOT_COUNT];
static uint32_t next_http_slot;

// The trusted host registry supplies this typed import. The generated
// Emscripten binding fails closed if a host omits that step.
DOLLY_EM_JS(int, dolly_http_dispatch,
      (const char *method, uintptr_t method_size,
       const char *url, uintptr_t url_size,
       const char *headers, uintptr_t headers_size,
       const void *body, uintptr_t body_size, uint32_t flags,
       uint32_t sequence), { return -ENOSYS; });
uintptr_t dolly_http_mailbox_address(void) {
  return (uintptr_t)http_mailboxes;
}

static int http_start(const char *method, const char *url, const char *headers,
                      const void *body, size_t body_size, unsigned int flags,
                      unsigned int *sequence_out) {
  const unsigned int valid_flags = DOLLY_HTTP_FAIL_STATUS | DOLLY_HTTP_FOLLOW_REDIRECTS;
  if (method == NULL || url == NULL || sequence_out == NULL ||
      method[0] == '\0' || url[0] == '\0' || (flags & ~valid_flags) != 0 ||
      (body_size != 0 && body == NULL)) return -EINVAL;

  for (uint32_t attempt = 0; attempt < DOLLY_HTTP_SLOT_COUNT; ++attempt) {
    const uint32_t index = next_http_slot++ % DOLLY_HTTP_SLOT_COUNT;
    dolly_http_mailbox *mailbox = &http_mailboxes[index];
    uint32_t sequence = atomic_load_explicit(&mailbox->sequence, memory_order_acquire);
    // Never wrap a handle and let a stale caller address a later request.
    if (sequence > UINT32_MAX - DOLLY_HTTP_SLOT_COUNT) continue;
    uint32_t expected = DOLLY_HTTP_STATE_IDLE;
    if (!atomic_compare_exchange_strong_explicit(
            &mailbox->state, &expected, DOLLY_HTTP_STATE_WRITABLE,
            memory_order_acq_rel, memory_order_acquire)) continue;
    sequence = sequence == 0 ? index + 1 : sequence + DOLLY_HTTP_SLOT_COUNT;
    atomic_store_explicit(&mailbox->sequence, sequence, memory_order_release);
    atomic_store_explicit(&mailbox->status, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->length, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->eof, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->error, 0, memory_order_relaxed);
    atomic_store_explicit(&mailbox->kind, 0, memory_order_relaxed);
    const int admitted = dolly_http_dispatch(
        method, strlen(method), url, strlen(url),
        headers, headers == NULL ? 0 : strlen(headers),
        body, body_size, flags, sequence);
    if (admitted == 0) { *sequence_out = sequence; return 0; }
    atomic_store_explicit(&mailbox->state, DOLLY_HTTP_STATE_IDLE, memory_order_release);
    // A cancelled provider can still be settling in this browser slot.
    if (admitted != -EBUSY) return admitted;
  }
  return -EBUSY;
}

static int http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                     void *data, size_t capacity) {
  if (chunk == NULL || (capacity != 0 && data == NULL)) return -EINVAL;
  if (sequence == 0) return -ESTALE;
  dolly_http_mailbox *mailbox = &http_mailboxes[(sequence - 1) % DOLLY_HTTP_SLOT_COUNT];
  if (atomic_load_explicit(&mailbox->sequence, memory_order_acquire) != sequence) return -ESTALE;
  const uint32_t state = atomic_load_explicit(&mailbox->state, memory_order_acquire);
  if (state == DOLLY_HTTP_STATE_IDLE) return -ESTALE;
  if (state == DOLLY_HTTP_STATE_FAILED) {
    *chunk = (dolly_http_chunk){
        .status = atomic_load_explicit(&mailbox->status, memory_order_relaxed),
        .error = atomic_load_explicit(&mailbox->error, memory_order_relaxed),
        .kind = DOLLY_HTTP_KIND_BODY, .eof = 1};
    atomic_store_explicit(&mailbox->state, DOLLY_HTTP_STATE_IDLE, memory_order_release);
    return 1;
  }
  if (state != DOLLY_HTTP_STATE_READABLE) return 0;

  const uint32_t length = atomic_load_explicit(&mailbox->length, memory_order_relaxed);
  *chunk = (dolly_http_chunk){
      .status = atomic_load_explicit(&mailbox->status, memory_order_relaxed),
      .kind = atomic_load_explicit(&mailbox->kind, memory_order_relaxed),
      .error = atomic_load_explicit(&mailbox->error, memory_order_relaxed),
      .eof = atomic_load_explicit(&mailbox->eof, memory_order_relaxed),
      .length = length};
  if (length > DOLLY_HTTP_CHUNK_CAPACITY || length > capacity) return -EOVERFLOW;
  if (length != 0) memcpy(data, mailbox->data, length);
  uint32_t readable = DOLLY_HTTP_STATE_READABLE;
  atomic_compare_exchange_strong_explicit(
      &mailbox->state, &readable, chunk->eof ? DOLLY_HTTP_STATE_IDLE : DOLLY_HTTP_STATE_WRITABLE,
      memory_order_release, memory_order_relaxed);
  emscripten_atomic_notify((void *)&mailbox->state, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  return 1;
}

static int http_cancel(unsigned int sequence) {
  if (sequence == 0) return -ESTALE;
  dolly_http_mailbox *mailbox = &http_mailboxes[(sequence - 1) % DOLLY_HTTP_SLOT_COUNT];
  if (atomic_load_explicit(&mailbox->sequence, memory_order_acquire) != sequence) return -ESTALE;
  const int result = dolly_http_dispatch(NULL, 0, NULL, 0, NULL, 0, NULL, 0, 0, sequence);
  if (result != 0) return result;
  atomic_store_explicit(&mailbox->state, DOLLY_HTTP_STATE_IDLE, memory_order_release);
  emscripten_atomic_notify((void *)&mailbox->state, EMSCRIPTEN_NOTIFY_ALL_WAITERS);
  return 0;
}

// The process that started each slot's current request.
typedef struct { int pid; uint32_t sequence; } owned_request;
static owned_request requests[DOLLY_HTTP_SLOT_COUNT];

static int owns(int pid, uint32_t sequence) {
  const owned_request request = requests[(sequence - 1) % DOLLY_HTTP_SLOT_COUNT];
  return request.pid == pid && request.sequence == sequence;
}

// A request body larger than one packet, staged per thread before HTTP_START.
typedef struct staged_body {
  int pid, tid;
  unsigned char *bytes;
  size_t size, written;
  struct staged_body *next;
} staged_body;
static staged_body *staged_bodies;

static staged_body *body_for(int pid, int tid) {
  for (staged_body *body = staged_bodies; body != NULL; body = body->next)
    if (body->pid == pid && body->tid == tid) return body;
  staged_body *body = calloc(1, sizeof(*body));
  if (body == NULL) return NULL;
  *body = (staged_body){.pid = pid, .tid = tid, .next = staged_bodies};
  staged_bodies = body;
  return body;
}

static void discard_body(staged_body *body) {
  free(body->bytes);
  body->bytes = NULL;
  body->size = body->written = 0;
}

static int64_t http_body_write_packet(staged_body *body, unsigned char *mailbox,
                                      uintptr_t request_size) {
  if (request_size == 0) { discard_body(body); return 0; }
  if (request_size <= sizeof(dolly_http_body_write_request)) return -EINVAL;
  dolly_http_body_write_request request;
  memcpy(&request, mailbox, sizeof(request));
  const size_t length = request_size - sizeof(request);
  if (request.total_size > DOLLY_HTTP_MAX_BODY) return -E2BIG;
  if (request.offset > request.total_size ||
      length > request.total_size - request.offset) return -EINVAL;
  if (request.offset == 0) {
    discard_body(body);
    body->bytes = malloc((size_t)request.total_size);
    if (body->bytes == NULL) return -ENOMEM;
    body->size = (size_t)request.total_size;
  }
  if (body->bytes == NULL || request.total_size != body->size ||
      request.offset != body->written) return -EINVAL;
  memcpy(body->bytes + body->written,
         mailbox + sizeof(request), length);
  body->written += length;
  return 0;
}

static int64_t http_start_packet(int pid, staged_body *body, unsigned char *mailbox,
                                 uintptr_t request_size,
                                 uintptr_t response_capacity) {
  if (request_size < sizeof(dolly_http_start_request) ||
      response_capacity < sizeof(dolly_http_start_response)) {
    return -EINVAL;
  }
  dolly_http_start_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.method_size == 0 || request.url_size == 0 ||
      request.body_size > SIZE_MAX) return -EINVAL;
  const size_t method_size = request.method_size;
  const size_t url_size = request.url_size;
  const size_t headers_size = request.headers_size;
  const size_t body_size = (size_t)request.body_size;
  size_t remaining = (size_t)request_size - sizeof(request);
  if (method_size > remaining) return -EINVAL;
  remaining -= method_size;
  if (url_size > remaining) return -EINVAL;
  remaining -= url_size;
  if (headers_size > remaining) return -EINVAL;
  remaining -= headers_size;
  const int staged = body_size != 0 && remaining == 0;
  if ((staged ? (body_size != body->size ||
                 body_size != body->written) : body_size != remaining) ||
      method_size > SIZE_MAX - url_size - headers_size - 3) return -EINVAL;

  const unsigned char *cursor = mailbox + sizeof(request);
  if (memchr(cursor, 0, method_size) != NULL ||
      memchr(cursor + method_size, 0, url_size) != NULL ||
      memchr(cursor + method_size + url_size, 0, headers_size) != NULL) {
    return -EINVAL;
  }
  char *strings = malloc(method_size + url_size + headers_size + 3);
  if (strings == NULL) return -ENOMEM;
  char *method = strings;
  char *url = method + method_size + 1;
  char *headers = url + url_size + 1;
  memcpy(method, cursor, method_size);
  method[method_size] = 0;
  cursor += method_size;
  memcpy(url, cursor, url_size);
  url[url_size] = 0;
  cursor += url_size;
  memcpy(headers, cursor, headers_size);
  headers[headers_size] = 0;
  cursor += headers_size;

  unsigned int sequence = 0;
  const int result = http_start(
      method, url, headers, staged ? body->bytes : cursor,
      body_size, request.flags, &sequence);
  free(strings);
  if (result != 0) return result;
  requests[(sequence - 1) % DOLLY_HTTP_SLOT_COUNT] = (owned_request){pid, sequence};
  const dolly_http_start_response response = {sequence, 0};
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t http_poll_packet(int pid, unsigned char *mailbox,
                                uintptr_t request_size,
                                uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_http_poll_request) ||
      response_capacity < sizeof(dolly_http_poll_response)) {
    return -EINVAL;
  }
  dolly_http_poll_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0 || request.sequence == 0 ||
      !owns(pid, request.sequence)) return -ESTALE;
  dolly_http_chunk chunk = {0};
  const size_t data_capacity =
      (size_t)response_capacity - sizeof(dolly_http_poll_response);
  const int result = http_poll(
      request.sequence, &chunk,
      mailbox + sizeof(dolly_http_poll_response),
      data_capacity);
  if (result < 0) return result;
  if (chunk.length > data_capacity) return -EOVERFLOW;
  const dolly_http_poll_response response = {
      (uint32_t)result, chunk.status, chunk.kind, chunk.error, chunk.eof, 0, chunk.length,
  };
  memcpy(mailbox, &response, sizeof(response));
  if (chunk.eof) requests[(request.sequence - 1) % DOLLY_HTTP_SLOT_COUNT] = (owned_request){0};
  return (int64_t)(sizeof(response) + chunk.length);
}

static int64_t http_cancel_packet(int pid, unsigned char *mailbox,
                                  uintptr_t request_size,
                                  uintptr_t response_capacity) {
  if (request_size != sizeof(dolly_http_cancel_request) ||
      response_capacity != 0) return -EINVAL;
  dolly_http_cancel_request request;
  memcpy(&request, mailbox, sizeof(request));
  if (request.reserved != 0 || request.sequence == 0 ||
      !owns(pid, request.sequence)) return -ESTALE;
  const int result = http_cancel(request.sequence);
  if (result == 0) requests[(request.sequence - 1) % DOLLY_HTTP_SLOT_COUNT] = (owned_request){0};
  return result;
}

static int64_t http_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                         uintptr_t request_size, uintptr_t response_capacity) {
  switch (operation) {
    case DOLLY_HTTP_START: {
      staged_body *body = body_for(pid, tid);
      if (body == NULL) return -ENOMEM;
      const int64_t result = http_start_packet(pid, body, mailbox, request_size, response_capacity);
      discard_body(body);
      return result;
    }
    case DOLLY_HTTP_BODY_WRITE: {
      staged_body *body = body_for(pid, tid);
      return body == NULL ? -ENOMEM : http_body_write_packet(body, mailbox, request_size);
    }
    case DOLLY_HTTP_POLL:
      return http_poll_packet(pid, mailbox, request_size, response_capacity);
    case DOLLY_HTTP_CANCEL:
      return http_cancel_packet(pid, mailbox, request_size, response_capacity);
  }
  return -EINVAL;
}

// A retired thread loses its staged body; an exited process also loses its requests.
static void http_release(int pid, int tid) {
  for (staged_body **link = &staged_bodies; *link != NULL;) {
    staged_body *body = *link;
    if (body->pid != pid || (tid != 0 && body->tid != tid)) { link = &body->next; continue; }
    *link = body->next;
    free(body->bytes);
    free(body);
  }
  if (tid != 0) return;
  for (size_t index = 0; index < DOLLY_HTTP_SLOT_COUNT; ++index) {
    if (requests[index].pid != pid) continue;
    (void)http_cancel(requests[index].sequence);
    requests[index] = (owned_request){0};
  }
}

const dolly_kernel_module dolly_http_kernel = {
    DOLLY_HTTP_START, DOLLY_HTTP_BODY_WRITE, http_call, http_release};
