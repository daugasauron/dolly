// pty@0 kernel side: openpty, a pseudo-terminal (src/pty.c) whose two ends
// become descriptors of the process that asks.
#include "process-kernel.h"
#include "pty-kernel.h"

#include <dolly/process.h>
#include <dolly/pty.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>

_Static_assert(DOLLY_PTY_LIMIT == DOLLY_KERNEL_PTY_LIMIT &&
               DOLLY_PTY_INPUT_BYTES == DOLLY_KERNEL_PTY_INPUT_BYTES &&
               DOLLY_PTY_OUTPUT_BYTES == DOLLY_KERNEL_PTY_OUTPUT_BYTES,
               "the kernel's pseudo-terminals differ from dolly-pty-0.wat");

static int64_t pty_open(int pid, const dolly_pty_request *request, unsigned char *mailbox,
                        uintptr_t response_capacity) {
  if (request->descriptor != 0 || (request->flags & ~(DOLLY_PTY_CLOEXEC | DOLLY_PTY_NONBLOCK)) != 0 ||
      response_capacity < sizeof(dolly_pty_descriptors)) return -EINVAL;
  int error;
  dolly_pty *pty = dolly_pty_pair(request->rows, request->columns, &error);
  if (pty == NULL) return error;
  dolly_pty_master(pty)->nonblocking = (request->flags & DOLLY_PTY_NONBLOCK) != 0;
  dolly_kernel_socket *const ends[2] = {dolly_pty_master(pty), dolly_pty_slave(pty)};
  dolly_pty_descriptors response = {0, 0, dolly_pty_number(pty), 0};
  const int result = dolly_kernel_socket_open(pid, ends, 2, (request->flags & DOLLY_PTY_CLOEXEC) != 0,
                                              &response.master);
  if (result != 0) {
    dolly_pty_release(pty);
    return result;
  }
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t pty_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                        uintptr_t request_size, uintptr_t response_capacity) {
  (void)tid;
  dolly_pty_request request;
  if (request_size != sizeof(request)) return -EINVAL;
  memcpy(&request, mailbox, sizeof(request));
  (void)operation;
  return pty_open(pid, &request, mailbox, response_capacity);
}

const dolly_kernel_module dolly_pty_kernel = {DOLLY_PTY_OPEN, DOLLY_PTY_OPEN, pty_call, NULL};
