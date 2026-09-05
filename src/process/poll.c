#define _GNU_SOURCE

/* POSIX poll over Dolly's pointer-free descriptor readiness operation. */

#include <dolly/process.h>

#include <errno.h>
#include <poll.h>
#include <stdint.h>
#include <stdlib.h>
#include <time.h>

static int poll_deadline(int timeout, uint64_t *deadline) {
  if (timeout < 0) {
    *deadline = UINT64_MAX;
    return 0;
  }
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now) != 0) return -1;
  const uint64_t seconds = (uint64_t)now.tv_sec * UINT64_C(1000000000);
  const uint64_t current = seconds + (uint64_t)now.tv_nsec;
  const uint64_t delta = (uint64_t)timeout * UINT64_C(1000000);
  if (delta > UINT64_MAX - current) {
    errno = EINVAL;
    return -1;
  }
  *deadline = current + delta;
  return 0;
}

int poll(struct pollfd *descriptors, nfds_t count, int timeout) {
  if (count != 0 && descriptors == NULL) {
    errno = EFAULT;
    return -1;
  }
  if ((uint64_t)count >
      (DOLLY_PROCESS_PACKET_LIMIT - sizeof(dolly_process_poll_request)) /
          sizeof(dolly_process_poll_query)) {
    errno = EINVAL;
    return -1;
  }

  uint64_t deadline;
  if (poll_deadline(timeout, &deadline) != 0) return -1;
  const size_t request_size = sizeof(dolly_process_poll_request) +
      (size_t)count * sizeof(dolly_process_poll_query);
  const size_t response_size = sizeof(dolly_process_poll_response) +
      (size_t)count * sizeof(dolly_process_poll_result);
  unsigned char *request_bytes = malloc(request_size);
  unsigned char *response_bytes = malloc(response_size);
  if (request_bytes == NULL || response_bytes == NULL) {
    free(request_bytes);
    free(response_bytes);
    errno = ENOMEM;
    return -1;
  }

  dolly_process_poll_request request = {
      .deadline_nanoseconds = deadline,
      .count = (uint32_t)count,
      .reserved = 0,
  };
  __builtin_memcpy(request_bytes, &request, sizeof(request));
  dolly_process_poll_query *queries =
      (dolly_process_poll_query *)(request_bytes + sizeof(request));
  for (nfds_t index = 0; index < count; ++index) {
    uint16_t events = 0;
    if ((descriptors[index].events & POLLIN) != 0) {
      events |= DOLLY_PROCESS_POLL_READ;
    }
    if ((descriptors[index].events & POLLOUT) != 0) {
      events |= DOLLY_PROCESS_POLL_WRITE;
    }
    if ((descriptors[index].events & POLLPRI) != 0) {
      events |= DOLLY_PROCESS_POLL_PRIORITY;
    }
    queries[index] = (dolly_process_poll_query){
        .descriptor = descriptors[index].fd < 0
            ? DOLLY_PROCESS_POLL_IGNORED_DESCRIPTOR
            : (uint32_t)descriptors[index].fd,
        .events = events,
        .reserved = 0,
    };
    descriptors[index].revents = 0;
  }

  const int64_t called = dolly_process_call(
      DOLLY_PROCESS_FD_POLL, request_bytes, request_size,
      response_bytes, response_size);
  free(request_bytes);
  if (called < 0) {
    free(response_bytes);
    errno = (int)-called;
    return -1;
  }
  if ((uint64_t)called != response_size) {
    free(response_bytes);
    errno = EIO;
    return -1;
  }
  dolly_process_poll_response response;
  __builtin_memcpy(&response, response_bytes, sizeof(response));
  if (response.count != count || response.ready > count || response.reserved != 0) {
    free(response_bytes);
    errno = EIO;
    return -1;
  }
  const dolly_process_poll_result *results =
      (const dolly_process_poll_result *)(response_bytes + sizeof(response));
  uint32_t ready = 0;
  for (nfds_t index = 0; index < count; ++index) {
    if (results[index].reserved != 0 || results[index].reserved2 != 0) {
      free(response_bytes);
      errno = EIO;
      return -1;
    }
    short events = 0;
    if ((results[index].events & DOLLY_PROCESS_POLL_READ) != 0) events |= POLLIN;
    if ((results[index].events & DOLLY_PROCESS_POLL_WRITE) != 0) events |= POLLOUT;
    if ((results[index].events & DOLLY_PROCESS_POLL_PRIORITY) != 0) events |= POLLPRI;
    if ((results[index].events & DOLLY_PROCESS_POLL_ERROR) != 0) events |= POLLERR;
    if ((results[index].events & DOLLY_PROCESS_POLL_HANGUP) != 0) events |= POLLHUP;
    if ((results[index].events & DOLLY_PROCESS_POLL_INVALID) != 0) events |= POLLNVAL;
    descriptors[index].revents = events;
    if (events != 0) ++ready;
  }
  free(response_bytes);
  if (ready != response.ready) {
    errno = EIO;
    return -1;
  }
  return (int)ready;
}
