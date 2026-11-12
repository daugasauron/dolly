#include <dolly/clipboard.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <stdlib.h>
#include <string.h>

DOLLY_HOST_REQUIRE(clipboard, 0, DOLLY_CLIPBOARD_ABI_DIGEST);

// A call without a response succeeds with zero.
static int clipboard_status(int64_t result) {
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

int dolly_clipboard_acquire(uint64_t *generation) {
  if (generation == NULL) return -EINVAL;
  dolly_clipboard_generation response = {0};
  const int64_t result = dolly_process_call(DOLLY_CLIPBOARD_ACQUIRE, NULL, 0, &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.generation == 0) return -EIO;
  *generation = response.generation;
  return 0;
}

int dolly_clipboard_write(uint64_t generation, const void *text, size_t length) {
  if (generation == 0 || (text == NULL && length != 0)) return -EINVAL;
  if (length > DOLLY_CLIPBOARD_CAPACITY) return -EFBIG;
  const dolly_clipboard_write_request request = {generation, (uint32_t)length, 0};
  unsigned char *packet = malloc(sizeof(request) + length);
  if (packet == NULL) return -ENOMEM;
  memcpy(packet, &request, sizeof(request));
  if (length != 0) memcpy(packet + sizeof(request), text, length);
  const int64_t result = dolly_process_call(DOLLY_CLIPBOARD_WRITE, packet, sizeof(request) + length, NULL, 0);
  free(packet);
  return clipboard_status(result);
}

int64_t dolly_clipboard_read(uint64_t generation, void *text, size_t capacity) {
  if (generation == 0 || (text == NULL && capacity != 0)) return -EINVAL;
  if (capacity > DOLLY_CLIPBOARD_CAPACITY) capacity = DOLLY_CLIPBOARD_CAPACITY;
  const dolly_clipboard_generation request = {generation};
  const size_t header = sizeof(dolly_clipboard_read_response);
  unsigned char *packet = malloc(header + capacity);
  if (packet == NULL) return -ENOMEM;
  int64_t status = dolly_process_call(DOLLY_CLIPBOARD_READ, &request, sizeof(request), packet, header + capacity);
  if (status >= 0) {
    dolly_clipboard_read_response response;
    memcpy(&response, packet, header);
    const size_t copied = response.length < capacity ? response.length : capacity;
    if ((uint64_t)status != header + copied || response.reserved != 0 || response.length > DOLLY_CLIPBOARD_CAPACITY) {
      status = -EIO;
    } else {
      if (copied != 0) memcpy(text, packet + header, copied);
      status = response.length;
    }
  }
  free(packet);
  return status;
}

int dolly_clipboard_release(uint64_t generation) {
  const dolly_clipboard_generation request = {generation};
  return clipboard_status(dolly_process_call(DOLLY_CLIPBOARD_RELEASE, &request, sizeof(request), NULL, 0));
}
