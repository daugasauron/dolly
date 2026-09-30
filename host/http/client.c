#define _GNU_SOURCE
#include <dolly/http.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

DOLLY_HOST_REQUIRE(http, 0);

static int append_http_text(char **target, size_t *length,
                            const unsigned char *bytes, size_t count) {
  if (count > SIZE_MAX - *length - 1) return -EOVERFLOW;
  char *grown = realloc(*target, *length + count + 1);
  if (grown == NULL) return -ENOMEM;
  memcpy(grown + *length, bytes, count);
  *length += count;
  grown[*length] = 0;
  *target = grown;
  return 0;
}

int dolly_http_start(const char *method, const char *url, const char *headers,
                     const void *body, size_t body_size, unsigned int flags,
                     unsigned int *sequence) {
  if (method == NULL || url == NULL || sequence == NULL ||
      method[0] == 0 || url[0] == 0 || (body_size != 0 && body == NULL)) {
    return -EINVAL;
  }
  if (headers == NULL) headers = "";
  const size_t method_size = strlen(method);
  const size_t url_size = strlen(url);
  const size_t headers_size = strlen(headers);
  if (method_size > UINT32_MAX || url_size > UINT32_MAX ||
      headers_size > UINT32_MAX ||
      method_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) ||
      url_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) - method_size ||
      headers_size > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_start_request) - method_size - url_size) return -E2BIG;
  const size_t metadata_size = sizeof(dolly_process_http_start_request) +
      method_size + url_size + headers_size;
  const int staged = body_size > DOLLY_PROCESS_PACKET_LIMIT - metadata_size;
  const size_t packet_size = metadata_size + (staged ? 0 : body_size);
  unsigned char *packet = malloc(staged ? DOLLY_PROCESS_PACKET_LIMIT : packet_size);
  if (packet == NULL) return -ENOMEM;
  if (staged) {
    const size_t capacity = DOLLY_PROCESS_PACKET_LIMIT -
        sizeof(dolly_process_http_body_write_request);
    for (size_t offset = 0; offset < body_size;) {
      const size_t length = body_size - offset > capacity ? capacity : body_size - offset;
      const dolly_process_http_body_write_request write = {offset, body_size};
      memcpy(packet, &write, sizeof(write));
      memcpy(packet + sizeof(write), (const unsigned char *)body + offset, length);
      const int64_t result = dolly_process_call(DOLLY_PROCESS_HTTP_BODY_WRITE,
          packet, sizeof(write) + length, NULL, 0);
      if (result != 0) {
        (void)dolly_process_call(DOLLY_PROCESS_HTTP_BODY_WRITE, NULL, 0, NULL, 0);
        free(packet);
        return result < 0 ? (int)result : -EIO;
      }
      offset += length;
    }
  }
  const dolly_process_http_start_request request = {
      flags, (uint32_t)method_size, (uint32_t)url_size,
      (uint32_t)headers_size, body_size,
  };
  memcpy(packet, &request, sizeof(request));
  size_t offset = sizeof(request);
  memcpy(packet + offset, method, method_size);
  offset += method_size;
  memcpy(packet + offset, url, url_size);
  offset += url_size;
  memcpy(packet + offset, headers, headers_size);
  offset += headers_size;
  if (!staged && body_size != 0) memcpy(packet + offset, body, body_size);
  dolly_process_http_start_response response = {0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_HTTP_START, packet, packet_size,
      &response, sizeof(response));
  free(packet);
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.sequence == 0 ||
      response.reserved != 0) return -EIO;
  *sequence = response.sequence;
  return 0;
}

int dolly_http_poll(unsigned int sequence, dolly_http_chunk *chunk,
                    void *data, size_t capacity) {
  if (sequence == 0 || chunk == NULL || (capacity != 0 && data == NULL) ||
      capacity > DOLLY_PROCESS_PACKET_LIMIT -
          sizeof(dolly_process_http_poll_response)) return -EINVAL;
  const dolly_process_http_poll_request request = {sequence, 0};
  const size_t response_capacity =
      sizeof(dolly_process_http_poll_response) + capacity;
  unsigned char *packet = malloc(response_capacity);
  if (packet == NULL) return -ENOMEM;
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_HTTP_POLL, &request, sizeof(request),
      packet, response_capacity);
  if (result < 0) {
    free(packet);
    return (int)result;
  }
  dolly_process_http_poll_response response;
  if ((uint64_t)result < sizeof(response)) {
    free(packet);
    return -EIO;
  }
  memcpy(&response, packet, sizeof(response));
  if (response.ready > 1 || response.reserved != 0 ||
      response.length > capacity ||
      (uint64_t)result != sizeof(response) + response.length ||
      (response.ready == 0 && (response.status || response.kind || response.error || response.eof || response.length))) {
    free(packet);
    return -EIO;
  }
  chunk->status = response.status;
  chunk->kind = response.kind;
  chunk->error = response.error;
  chunk->eof = response.eof;
  chunk->length = response.length;
  if (response.length != 0) {
    memcpy(data, packet + sizeof(response), (size_t)response.length);
  }
  free(packet);
  return (int)response.ready;
}

int dolly_http_cancel(unsigned int sequence) {
  const dolly_process_http_cancel_request request = {sequence, 0};
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_HTTP_CANCEL, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

int dolly_http_perform(const dolly_http_request *request,
                       dolly_http_response *response) {
  if (request == NULL || response == NULL) return -EINVAL;
  response->status = 0;
  response->effective_url = NULL;
  size_t effective_url_length = 0;
  unsigned char *data = malloc(DOLLY_HTTP_CHUNK_CAPACITY);
  if (data == NULL) return -ENOMEM;
  unsigned int sequence = 0;
  int result;
  do {
    result = dolly_http_start(request->method, request->url, request->headers,
        request->body, request->body_size, request->flags, &sequence);
    if (result == -EBUSY) usleep(10000);
  } while (result == -EBUSY);
  if (result != 0) {
    free(data);
    return result;
  }
  for (;;) {
    dolly_http_chunk chunk = {0};
    const int polled = dolly_http_poll(
        sequence, &chunk, data, DOLLY_HTTP_CHUNK_CAPACITY);
    if (polled == 0) { usleep(10000); continue; }
    if (polled < 0 && result == 0) result = polled;
    if (polled < 0) {
      (void)dolly_http_cancel(sequence);
      break;
    }
    if (chunk.status != 0) response->status = chunk.status;
    if (chunk.error != 0 && result == 0) {
      result = -(int)chunk.error;
    }
    if ((request->flags & DOLLY_HTTP_FAIL_STATUS) != 0 &&
        chunk.status >= 400 && result == 0) result = (int)chunk.status;
    if (result == 0 && chunk.kind == 1) {
      result = append_http_text(&response->effective_url,
                                &effective_url_length,
                                data, chunk.length);
    } else if (result == 0 && chunk.kind == 2 && request->header != NULL) {
      if (request->header(data, chunk.length,
                          request->header_context) != chunk.length) {
        result = -ECANCELED;
      }
    } else if (result == 0 && chunk.kind == 3 && request->write != NULL) {
      if (request->write(data, chunk.length,
                         request->write_context) != chunk.length) {
        result = -ECANCELED;
      }
    }
    if (chunk.eof) break;
    if (result != 0) {
      (void)dolly_http_cancel(sequence);
      break;
    }
  }
  free(data);
  return result;
}

void dolly_http_response_dispose(dolly_http_response *response) {
  if (response == NULL) return;
  free(response->effective_url);
  response->effective_url = NULL;
  response->status = 0;
}
