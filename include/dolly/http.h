#ifndef DOLLY_HTTP_API_H
#define DOLLY_HTTP_API_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
  DOLLY_HTTP_FAIL_STATUS = 1u << 0,
  DOLLY_HTTP_FOLLOW_REDIRECTS = 1u << 1,
};

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
