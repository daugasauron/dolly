#ifndef DOLLY_HTTP_API_H
#define DOLLY_HTTP_API_H

#include <stddef.h>
#include <stdint.h>
#include <errno.h>
#include <dolly/http-abi.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_HTTP_FAIL_STATUS = 1u << 0,
  // Caller intent; the browser policy decides whether redirects are allowed.
  DOLLY_HTTP_FOLLOW_REDIRECTS = 1u << 1,
};

typedef struct {
  unsigned int status;
  unsigned int kind;
  unsigned int error;
  unsigned int eof;
  size_t length;
} dolly_http_chunk;

typedef size_t (*dolly_http_write_callback)(const void *bytes, size_t length,
                                            void *context);

typedef struct {
  const char *method;
  const char *url;
  // Zero or more RFC-style `name: value\r\n` lines, terminated by NUL.
  const char *headers;
  const void *body;
  size_t body_size;
  unsigned int flags;
  dolly_http_write_callback write;
  void *write_context;
  dolly_http_write_callback header;
  void *header_context;
} dolly_http_request;

typedef struct {
  unsigned int status;
  // Allocated by the runtime. Release it with dolly_http_response_dispose().
  char *effective_url;
} dolly_http_response;

// Shared by C/libcurl and language adapters. Name the class the broker knows:
// its policy refused, or the browser could not fetch. Fetch does not say
// whether that was CORS, a redirect, DNS, TLS or the network, so do not guess,
// and do not include request data.
static inline const char *dolly_http_error_message(int error) {
  switch (error) {
    case EACCES: return "Browser HTTP policy denied the request";
    case EDQUOT: return "Browser HTTP request quota exceeded";
    case E2BIG: return "Browser HTTP byte limit exceeded";
    case ETIMEDOUT: return "Browser HTTP deadline exceeded";
    case ECANCELED: return "Browser HTTP request cancelled";
    case EPROTONOSUPPORT: return "Browser HTTP requires HTTP(S)";
    case EINVAL: return "Invalid browser HTTP request";
    case EFAULT: return "HTTP argument is outside Wasm memory";
    case EBUSY: return "Browser HTTP request slot is busy";
    default: return "Browser could not fetch the URL: blocked (no CORS headers, or a redirect) "
                    "or unreachable (DNS, TLS, offline)";
  }
}

// Starts an independent request. The browser copies bounded request bytes before
// returning. `sequence` is an opaque nonzero handle, not a process identifier.
// EBUSY means the bounded pool is full; callers may retry after yielding.
int dolly_http_start(const char *method, const char *url, const char *headers,
                     const void *body, size_t body_size, unsigned int flags,
                     unsigned int *sequence);

// Copies and acknowledges at most one broker record. Zero means no record is
// currently ready, one means `chunk` and `data` were populated, and a negative
// errno value reports a contract error. `chunk.error` is a positive target
// errno, not an HTTP status. Kinds 1, 2, and 3 are effective URL,
// response-header line, and body bytes. A terminal record has `eof != 0`.
int dolly_http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                    void *data, size_t capacity);

// Cancels only the matching request, without waiting for the provider to settle.
// A stale sequence fails without affecting a newer request.
int dolly_http_cancel(unsigned int sequence);

// Performs one browser-brokered HTTP request. The browser provider receives
// no filesystem or process capability: only the explicit request data above.
// Returns zero or a negative errno value. With DOLLY_HTTP_FAIL_STATUS,
// an HTTP status >= 400 is returned as a positive value instead.
// Received response metadata survives errors; always dispose the response.
int dolly_http_perform(const dolly_http_request *request,
                       dolly_http_response *response);
void dolly_http_response_dispose(dolly_http_response *response);

/*
 * Process packets of the DOLLY_HTTP_* operations. Requests remain
 * byte-oriented at the process boundary. Strings are UTF-8 byte sequences
 * without trailing NULs in the packet. The body follows the three strings. For
 * a body larger than the packet, BODY_WRITE stages it in kernel Wasm memory and
 * START contains only the strings. START consumes the staged body on success or
 * failure. Browser policy still owns admission and byte quotas; staging does
 * not start a network request.
 */
typedef struct {
  uint32_t flags;
  uint32_t method_size;
  uint32_t url_size;
  uint32_t headers_size;
  uint64_t body_size;
} dolly_http_start_request;

/* One staged body per process. Writes are sequential; offset=0 replaces any
 * previous body. A zero-byte packet discards it. Exit also discards it.
 * Nonempty writes contain this header followed by bytes; every write must
 * agree on total_size and continue at the exact next offset. */
typedef struct {
  uint64_t offset;
  uint64_t total_size;
} dolly_http_body_write_request;

typedef struct {
  uint32_t sequence;
  uint32_t reserved;
} dolly_http_start_response;

typedef struct {
  uint32_t sequence;
  uint32_t reserved;
} dolly_http_poll_request;

/* POLL never blocks: ready=0 is pending, with all remaining fields zero.
 * `length` bytes immediately follow this header when ready=1. */
typedef struct {
  uint32_t ready;
  uint32_t status;
  uint32_t kind;
  uint32_t error;
  uint32_t eof;
  uint32_t reserved;
  uint64_t length;
} dolly_http_poll_response;

typedef struct {
  uint32_t sequence;
  uint32_t reserved;
} dolly_http_cancel_request;

#ifdef __cplusplus
#define DOLLY_HTTP_LAYOUT(type, size) static_assert(sizeof(type) == size, #type)
#else
#define DOLLY_HTTP_LAYOUT(type, size) _Static_assert(sizeof(type) == size, #type)
#endif
DOLLY_HTTP_LAYOUT(dolly_http_start_request, 24);
DOLLY_HTTP_LAYOUT(dolly_http_body_write_request, 16);
DOLLY_HTTP_LAYOUT(dolly_http_start_response, 8);
DOLLY_HTTP_LAYOUT(dolly_http_poll_request, 8);
DOLLY_HTTP_LAYOUT(dolly_http_poll_response, 32);
DOLLY_HTTP_LAYOUT(dolly_http_cancel_request, 8);
#undef DOLLY_HTTP_LAYOUT

#ifdef __cplusplus
}
#endif

#endif
