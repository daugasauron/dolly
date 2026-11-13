#define _POSIX_C_SOURCE 200809L
#include <dolly/process.h>
#include <errno.h>
#include <poll.h>
#include <stdio.h>
#include <time.h>
#include <unistd.h>

static int expect(int condition, int status, const char *message) {
  if (condition) return 0;
  fprintf(stderr, "process-poll-check: %s\n", message);
  return status;
}

int main(void) {
  dolly_process_clock_request request = {.clock_id = 1};
  dolly_process_clock_response response;
  uint64_t previous = 0;
  for (unsigned i = 0; i < 4096; ++i) {
    if (dolly_process_call(DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request),
        &response, sizeof(response)) != sizeof(response) || response.nanoseconds < previous) return 53;
    previous = response.nanoseconds;
  }
  request.reserved = 1;
  if (dolly_process_call(DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request),
      &response, sizeof(response)) != -EINVAL) return 54;
  request.reserved = 0; request.clock_id = 2;
  if (dolly_process_call(DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request),
      &response, sizeof(response)) != -EINVAL) return 55;
  request.clock_id = 1;
  if (dolly_process_call(DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request) - 1,
      &response, sizeof(response)) != -EINVAL ||
      dolly_process_call(DOLLY_PROCESS_CLOCK_TIME, &request, sizeof(request),
      &response, sizeof(response) - 1) != -EINVAL) return 56;
  const clockid_t clocks[] = {CLOCK_MONOTONIC, CLOCK_REALTIME};
  for (unsigned i = 0; i < sizeof(clocks) / sizeof(clocks[0]); ++i) {
    struct timespec deadline, after;
    if (clock_gettime(clocks[i], &deadline) != 0) return 50;
    deadline.tv_nsec += 3000000;
    if (deadline.tv_nsec >= 1000000000) { deadline.tv_sec++; deadline.tv_nsec -= 1000000000; }
    if (clock_nanosleep(clocks[i], TIMER_ABSTIME, &deadline, NULL) != 0 ||
        clock_gettime(clocks[i], &after) != 0) return 51;
    if (after.tv_sec < deadline.tv_sec ||
        (after.tv_sec == deadline.tv_sec && after.tv_nsec < deadline.tv_nsec)) return 52;
  }
  struct pollfd ignored = {.fd = -1, .events = POLLIN, .revents = -1};
  int result = poll(&ignored, 1, 0);
  int status = expect(result == 0 && ignored.revents == 0, 40,
                      "a negative descriptor was not ignored");
  if (status != 0) return status;

  int descriptors[2];
  if (pipe(descriptors) != 0) return 41;
  struct pollfd ends[2] = {
      {.fd = descriptors[0], .events = POLLIN},
      {.fd = descriptors[1], .events = POLLOUT},
  };
  result = poll(ends, 2, 0);
  status = expect(result == 1 && ends[0].revents == 0 &&
                      (ends[1].revents & POLLOUT) != 0,
                  42, "empty pipe readiness is incorrect");
  if (status != 0) return status;

  if (write(descriptors[1], "x", 1) != 1) return 43;
  ends[0].revents = ends[1].revents = 0;
  result = poll(ends, 2, 0);
  status = expect(result == 2 && (ends[0].revents & POLLIN) != 0 &&
                      (ends[1].revents & POLLOUT) != 0,
                  44, "populated pipe readiness is incorrect");
  if (status != 0) return status;

  char byte = 0;
  if (read(descriptors[0], &byte, 1) != 1 || byte != 'x') return 45;
  if (close(descriptors[1]) != 0) return 46;
  ends[0].revents = 0;
  result = poll(ends, 1, 0);
  status = expect(result == 1 && (ends[0].revents & POLLHUP) != 0,
                  47, "closed pipe did not report hangup");
  if (status != 0) return status;
  close(descriptors[0]);

  struct pollfd invalid = {.fd = 100000, .events = POLLIN};
  result = poll(&invalid, 1, 0);
  status = expect(result == 1 && (invalid.revents & POLLNVAL) != 0,
                  48, "invalid descriptor did not report POLLNVAL");
  if (status != 0) return status;

  return poll(NULL, 0, 1) == 0 ? 0 : 49;
}
