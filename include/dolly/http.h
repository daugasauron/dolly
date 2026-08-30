#ifndef DOLLY_HTTP_API_H
#define DOLLY_HTTP_API_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_HTTP_CHUNK_CAPACITY = 64 * 1024,
  DOLLY_HTTP_FAIL_STATUS = 1u << 0,
  // Records caller intent. The version-0 browser provider still rejects every
  // redirect; a later provider may follow only after authorizing each hop.
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

// Starts one request without blocking the calling runtime. Version 0 permits
// one in-flight request because the browser boundary intentionally contains a
// single fixed mailbox. The browser copies all request bytes before this call
// returns. `sequence` identifies the claimed mailbox generation.
int dolly_http_start(const char *method, const char *url, const char *headers,
                     const void *body, size_t body_size, unsigned int flags,
                     unsigned int *sequence);

// Copies and acknowledges at most one broker record. Zero means no record is
// currently ready, one means `chunk` and `data` were populated, and a negative
// errno value reports a contract error. Kinds 1, 2, and 3 are effective URL,
// response-header line, and body bytes. A terminal record has `eof != 0`.
int dolly_http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                    void *data, size_t capacity);

// Performs one browser-brokered HTTP request. The browser provider receives
// no filesystem or process capability: only the explicit request data above.
// Returns zero or a negative errno value. HTTP status is not itself an error
// unless DOLLY_HTTP_FAIL_STATUS is selected.
int dolly_http_perform(const dolly_http_request *request,
                       dolly_http_response *response);
void dolly_http_response_dispose(dolly_http_response *response);

#ifdef __cplusplus
}
#endif

#endif
