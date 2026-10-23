#include <dolly/touch.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <string.h>
#include <time.h>

DOLLY_HOST_REQUIRE(touch, 0, DOLLY_TOUCH_ABI_DIGEST);

// The monotonic deadline of a timeout in milliseconds: zero polls, a negative
// timeout never expires.
static int touch_deadline(double timeout_milliseconds, uint64_t *deadline) {
  if (timeout_milliseconds != timeout_milliseconds) return -EINVAL;
  *deadline = timeout_milliseconds < 0 ? UINT64_MAX : 0;
  if (timeout_milliseconds <= 0) return 0;
  struct timespec value;
  if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) return -EINVAL;
  const uint64_t now = (uint64_t)value.tv_sec * 1000000000u + (uint64_t)value.tv_nsec;
  const double delta = timeout_milliseconds * 1000000.0;
  if (delta > (double)(UINT64_MAX - now)) return -EINVAL;
  *deadline = now + (uint64_t)delta;
  return 0;
}

int dolly_touch_acquire(uint64_t *generation) {
  if (generation == NULL) return -EINVAL;
  dolly_touch_generation response = {0};
  const int64_t result = dolly_process_call(DOLLY_TOUCH_ACQUIRE, NULL, 0, &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.generation == 0) return -EIO;
  *generation = response.generation;
  return 0;
}

int dolly_touch_read(uint64_t generation, dolly_touch_record *records, size_t capacity,
                     double timeout_milliseconds) {
  if (generation == 0 || records == NULL || capacity == 0) return -EINVAL;
  if (capacity > DOLLY_TOUCH_READ_RECORDS) capacity = DOLLY_TOUCH_READ_RECORDS;
  dolly_touch_read_request request = {generation, 0, (uint32_t)capacity, 0};
  const int status = touch_deadline(timeout_milliseconds, &request.deadline_nanoseconds);
  if (status != 0) return status;
  dolly_touch_read_response response;
  const int64_t result = dolly_process_call(DOLLY_TOUCH_READ, &request, sizeof(request),
                                            &response, sizeof(response));
  if (result < 0) return (int)result;
  const size_t header = offsetof(dolly_touch_read_response, records);
  if ((uint64_t)result < header || response.count > capacity || response.reserved != 0 ||
      (uint64_t)result != header + (uint64_t)response.count * sizeof(dolly_touch_record)) return -EIO;
  memcpy(records, response.records, response.count * sizeof(dolly_touch_record));
  return (int)response.count;
}

int dolly_touch_release(uint64_t generation) {
  const dolly_touch_generation request = {generation};
  const int64_t result = dolly_process_call(DOLLY_TOUCH_RELEASE, &request, sizeof(request), NULL, 0);
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}
