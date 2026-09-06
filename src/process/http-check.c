#include <dolly/http.h>

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

int main(void) {
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
