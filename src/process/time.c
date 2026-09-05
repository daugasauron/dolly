#define _DEFAULT_SOURCE
#define _POSIX_C_SOURCE 200809L

/* POSIX sleep operations over Dolly's deferred monotonic-clock operation. */

#include <dolly/process.h>

#include <errno.h>
#include <stdint.h>
#include <time.h>
#include <unistd.h>

static int timespec_nanoseconds(const struct timespec *value, uint64_t *result) {
  if (value == NULL || value->tv_sec < 0 || value->tv_nsec < 0 ||
      value->tv_nsec >= 1000000000L ||
      (uint64_t)value->tv_sec > UINT64_MAX / 1000000000u) {
    return EINVAL;
  }
  const uint64_t seconds = (uint64_t)value->tv_sec * 1000000000u;
  if ((uint64_t)value->tv_nsec > UINT64_MAX - seconds) return EINVAL;
  *result = seconds + (uint64_t)value->tv_nsec;
  return 0;
}

int clock_nanosleep(clockid_t clock, int flags,
                    const struct timespec *request,
                    struct timespec *remaining) {
  if (clock != CLOCK_REALTIME && clock != CLOCK_MONOTONIC) return EINVAL;
  if ((flags & ~TIMER_ABSTIME) != 0) return EINVAL;
  uint64_t nanoseconds = 0;
  int error = timespec_nanoseconds(request, &nanoseconds);
  if (error != 0) return error;

  uint64_t deadline = nanoseconds;
  if ((flags & TIMER_ABSTIME) == 0) {
    struct timespec now;
    if (clock_gettime(clock, &now) != 0) return errno;
    uint64_t current = 0;
    error = timespec_nanoseconds(&now, &current);
    if (error != 0 || nanoseconds > UINT64_MAX - current) return EINVAL;
    deadline = current + nanoseconds;
  }

  const dolly_process_clock_sleep_request packet = {
      .clock_id = clock == CLOCK_REALTIME ? 0 : 1,
      .flags = 0,
      .deadline_nanoseconds = deadline,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_CLOCK_SLEEP, &packet, sizeof(packet), NULL, 0);
  if (result < 0) {
    if (remaining != NULL && (flags & TIMER_ABSTIME) == 0) {
      *remaining = (struct timespec){0};
    }
    return (int)-result;
  }
  return result == 0 ? 0 : EIO;
}

int nanosleep(const struct timespec *request, struct timespec *remaining) {
  const int error = clock_nanosleep(
      CLOCK_MONOTONIC, 0, request, remaining);
  if (error == 0) return 0;
  errno = error;
  return -1;
}

unsigned sleep(unsigned seconds) {
  const struct timespec request = {.tv_sec = seconds};
  return nanosleep(&request, NULL) == 0 ? 0 : seconds;
}

int usleep(useconds_t microseconds) {
  if (microseconds >= 1000000u) {
    errno = EINVAL;
    return -1;
  }
  const struct timespec request = {
      .tv_sec = 0,
      .tv_nsec = (long)microseconds * 1000L,
  };
  return nanosleep(&request, NULL);
}
