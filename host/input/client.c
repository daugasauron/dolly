#include <dolly/input.h>
#include <dolly/process.h>
#include <dolly/host.h>
#include <errno.h>
#include <time.h>

DOLLY_HOST_REQUIRE(input, 0, DOLLY_INPUT_ABI_DIGEST);

// The monotonic deadline of a timeout in milliseconds: zero polls, a negative
// timeout never expires.
static int input_deadline(double timeout_milliseconds, uint64_t *deadline) {
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

// A call without a response succeeds with zero.
static int input_status(int64_t result) {
  return result < 0 ? (int)result : result == 0 ? 0 : -EIO;
}

int dolly_input_acquire(uint64_t *generation) {
  if (generation == NULL) return -EINVAL;
  dolly_input_generation response = {0};
  const int64_t result = dolly_process_call(DOLLY_INPUT_ACQUIRE, NULL, 0, &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.generation == 0) return -EIO;
  *generation = response.generation;
  return 0;
}

int dolly_input_next_event(uint64_t generation, dolly_input_event *event, double timeout_milliseconds) {
  if (generation == 0 || event == NULL) return -EINVAL;
  dolly_input_event_request request = {generation, 0};
  const int status = input_deadline(timeout_milliseconds, &request.deadline_nanoseconds);
  if (status != 0) return status;
  dolly_input_event_response response = {0};
  const int64_t result = dolly_process_call(DOLLY_INPUT_NEXT_EVENT, &request, sizeof(request),
                                            &response, sizeof(response));
  if (result < 0) return (int)result;
  if ((uint64_t)result != sizeof(response) || response.reserved != 0 ||
      (response.result != 0 && response.result != 1)) return -EIO;
  if (response.result == 1) *event = response.event;
  return response.result;
}

int dolly_input_set_pointer_relative(uint64_t generation, int relative) {
  const dolly_input_pointer_request request = {generation, relative != 0, 0};
  return input_status(dolly_process_call(DOLLY_INPUT_SET_POINTER, &request, sizeof(request), NULL, 0));
}

int dolly_input_release(uint64_t generation) {
  const dolly_input_generation request = {generation};
  return input_status(dolly_process_call(DOLLY_INPUT_RELEASE, &request, sizeof(request), NULL, 0));
}
