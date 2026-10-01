#include <dolly/http.h>
#include <dolly/process.h>

#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct {
  unsigned char bytes[32];
  size_t length;
} capture;

static size_t capture_prefix(const void *bytes, size_t length, void *context) {
  capture *output = context;
  const size_t remaining = sizeof(output->bytes) - output->length;
  const size_t copied = length < remaining ? length : remaining;
  memcpy(output->bytes + output->length, bytes, copied);
  output->length += copied;
  return length;
}

static size_t verify_body(const void *bytes, size_t length, void *context) {
  size_t *offset = context;
  const unsigned char *data = bytes;
  for (size_t i = 0; i < length; ++i)
    if (data[i] != (unsigned char)(*offset + i)) return 0;
  *offset += length;
  return length;
}

static int upload_check(const char *url) {
  struct { dolly_http_body_write_request header; unsigned char data[4]; }
      packet = {{1, 8}, {1, 2, 3, 4}};
  if (dolly_process_call(DOLLY_HTTP_BODY_WRITE, &packet,
      sizeof(packet.header) + 4, NULL, 0) != -EINVAL) return 103;
  packet.header.offset = 0;
  if (dolly_process_call(DOLLY_HTTP_BODY_WRITE, &packet,
      sizeof(packet.header) + 4, NULL, 0) != 0) return 104;
  packet.header.offset = 3;
  if (dolly_process_call(DOLLY_HTTP_BODY_WRITE, &packet,
      sizeof(packet.header) + 4, NULL, 0) != -EINVAL) return 105;
  if (dolly_process_call(DOLLY_HTTP_BODY_WRITE, NULL, 0, NULL, 0)) return 106;
  const size_t length = 3 * 1024 * 1024 + 17;
  unsigned char *body = malloc(9 * 1024 * 1024);
  if (!body) return 107;
  for (size_t i = 0; i < 9 * 1024 * 1024; ++i) body[i] = (unsigned char)i;
  size_t received = 0;
  dolly_http_request request = {.method = "POST", .url = url, .body = body,
      .body_size = length, .write = verify_body, .write_context = &received};
  dolly_http_response response = {0};
  int result = dolly_http_perform(&request, &response);
  const int valid = result == 0 && response.status == 200 && received == length;
  dolly_http_response_dispose(&response);
  request.body_size = 9 * 1024 * 1024;
  result = dolly_http_perform(&request, &response);
  dolly_http_response_dispose(&response);
  free(body);
  return !valid ? 108 : result != -E2BIG ? 109 : 0;
}

int main(void) {
  const char *upload = getenv("DOLLY_PROCESS_HTTP_POST_URL");
  if (upload) return upload_check(upload);
  const char *url = getenv("DOLLY_PROCESS_HTTP_CHECK_URL");
  if (url == NULL || url[0] == 0) return 100;
  capture body = {0};
  const dolly_http_request request = {
      .method = "GET",
      .url = url,
      .headers = "",
      .flags = DOLLY_HTTP_FAIL_STATUS,
      .write = capture_prefix,
      .write_context = &body,
  };
  dolly_http_response response = {0};
  const int result = dolly_http_perform(&request, &response);
  const char expected[] = "FETCHED-THROUGH-BROWSER\n";
  const int valid = result == 0 && response.status == 200 &&
      body.length == sizeof(expected) - 1 && memcmp(body.bytes, expected, body.length) == 0;
  dolly_http_response_dispose(&response);
  if (!valid) return 101;
  return write(STDOUT_FILENO, "PROCESS-HTTP-OK\n", 16) == 16 ? 0 : 102;
}
