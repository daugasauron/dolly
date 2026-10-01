#define _DEFAULT_SOURCE
#define _POSIX_C_SOURCE 200809L

/* POSIX sleep operations over Dolly's deferred monotonic-clock operation,
 * and the ITIMER_REAL timer. */

#include <dolly/process.h>

#include <errno.h>
#include <stdint.h>
#include <sys/time.h>
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
      .clock_id = clock == CLOCK_REALTIME
          ? DOLLY_PROCESS_CLOCK_REALTIME : DOLLY_PROCESS_CLOCK_MONOTONIC,
      .flags = 0,
      .deadline_nanoseconds = deadline,
  };
  const int64_t result = dolly_process_call(
      DOLLY_PROCESS_CLOCK_SLEEP, &packet, sizeof(packet), NULL, 0);
  if (result < 0) {
    if (remaining != NULL && (flags & TIMER_ABSTIME) == 0) {
      *remaining = (struct timespec){0};
      struct timespec now;
      uint64_t current;
      if (result == -EINTR && clock_gettime(clock, &now) == 0 &&
          timespec_nanoseconds(&now, &current) == 0 && current < deadline) {
        const uint64_t left = deadline - current;
        remaining->tv_sec = left / 1000000000u;
        remaining->tv_nsec = left % 1000000000u;
      }
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
  struct timespec remaining;
  if (nanosleep(&request, &remaining) == 0) return 0;
  return errno == EINTR ? (unsigned)remaining.tv_sec + (remaining.tv_nsec != 0) : seconds;
}

int usleep(useconds_t microseconds) {
  const struct timespec request = {
      .tv_sec = microseconds / 1000000u,
      .tv_nsec = (long)(microseconds % 1000000u) * 1000L,
  };
  return nanosleep(&request, NULL);
}

static int valid_timeval(const struct timeval *value) {
  return value->tv_sec >= 0 && value->tv_usec >= 0 && value->tv_usec < 1000000;
}

/* Saturates like Linux; the kernel saturates the deadline itself. */
static uint64_t timeval_nanoseconds(const struct timeval *value) {
  const uint64_t seconds = (uint64_t)value->tv_sec;
  return seconds >= UINT64_MAX / 1000000000u ? UINT64_MAX
      : seconds * 1000000000u + (uint64_t)value->tv_usec * 1000u;
}

/* Rounds up, so a pending timer never reads as disarmed. */
static struct timeval nanoseconds_timeval(uint64_t nanoseconds) {
  const uint64_t microseconds = nanoseconds / 1000u + (nanoseconds % 1000u != 0);
  return (struct timeval){(time_t)(microseconds / 1000000u),
                          (suseconds_t)(microseconds % 1000000u)};
}

/* A null request only reads the timer. */
static int alarm_call(const dolly_process_alarm *request, struct itimerval *previous) {
  dolly_process_alarm response;
  const int64_t result = dolly_process_call(DOLLY_PROCESS_ALARM, request,
      request ? sizeof(*request) : 0, &response, sizeof(response));
  if (result != sizeof(response)) {
    errno = result < 0 ? (int)-result : EIO;
    return -1;
  }
  if (previous) {
    previous->it_interval = nanoseconds_timeval(response.interval_nanoseconds);
    previous->it_value = nanoseconds_timeval(response.value_nanoseconds);
  }
  return 0;
}

/* Only ITIMER_REAL exists: Dolly does not account process CPU time. */
int setitimer(int which, const struct itimerval *restrict value,
              struct itimerval *restrict previous) {
  if (which != ITIMER_REAL) { errno = EINVAL; return -1; }
  if (!value) { errno = EFAULT; return -1; }
  if (!valid_timeval(&value->it_value) || !valid_timeval(&value->it_interval)) {
    errno = EINVAL;
    return -1;
  }
  const dolly_process_alarm request = {
      timeval_nanoseconds(&value->it_value), timeval_nanoseconds(&value->it_interval),
  };
  return alarm_call(&request, previous);
}

int getitimer(int which, struct itimerval *value) {
  if (which != ITIMER_REAL) { errno = EINVAL; return -1; }
  if (!value) { errno = EFAULT; return -1; }
  return alarm_call(NULL, value);
}
