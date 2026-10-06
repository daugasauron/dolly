#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

/* A kernel import (abi/dolly-browser-0.wat). The host module whose manifest
 * owns the name provides it; a module the page did not enable answers ENOSYS. */
#define DOLLY_BROWSER_IMPORT(name) \
  __attribute__((import_module("env"), import_name(#name)))

/* A host module's kernel side (host/NAME/kernel.c defines dolly_NAME_kernel).
 * Process operations in [first_operation, last_operation] reach call() with
 * the request in the process mailbox, where call() also writes its response.
 * release() runs when a thread retires and, with tid 0, when a process exits. */
typedef struct {
  uint32_t first_operation, last_operation;
  int64_t (*call)(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                  uintptr_t request_size, uintptr_t response_capacity);
  void (*release)(int pid, int tid);
} dolly_kernel_module;

static inline int64_t dolly_kernel_respond(unsigned char *mailbox,
                                           const void *response, size_t size) {
  memcpy(mailbox, response, size);
  return (int64_t)size;
}
/* Whether a wait may continue; records the remaining time for the supervisor. */
int dolly_kernel_deadline_pending(uint64_t deadline_nanoseconds);
/* For a module that runs a process on several threads (host/threads/kernel.c):
 * dispatch for one thread, where takes_signals marks the thread receiving the
 * process's signals; the process states it may act on; and the release of what
 * every module holds for a thread that ended. */
int64_t dolly_kernel_dispatch(int pid, int tid, int takes_signals, uint32_t operation,
                              uintptr_t request_size, uintptr_t response_capacity);
int dolly_kernel_process_launching(int pid);
int dolly_kernel_process_running(int pid);
void dolly_kernel_thread_released(int pid, int tid);
/* Decodes a dolly_process_path_request into a path the kernel can open. */
int64_t dolly_kernel_request_path(int pid, uintptr_t request_size,
                                  char *path, size_t capacity);

/* The terminal device's output, host/display/kernel.c. replies() copies what
 * the terminal answers its program (a cursor report) and returns the count. */
int dolly_kernel_terminal_attached(void);
void dolly_kernel_terminal_render(const unsigned char *bytes, size_t length);
size_t dolly_kernel_terminal_replies(unsigned char *output, size_t capacity);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);

/* The terminal device's input, host/input/kernel.c. input_service() handles
 * the pointer and scroll input that is the terminal's own, before it draws. */
int dolly_kernel_terminal_read(void);
int dolly_kernel_terminal_ready(void);
int dolly_kernel_terminal_input_service(void);
void dolly_terminal_discard_pending_input(void);

/* The terminal line discipline and the page's terminal mailbox, src/dolly.c. */
uint32_t dolly_kernel_terminal_mode(void);
int dolly_kernel_terminal_set_mode(uint32_t flags);
/* Boot text while no display driver is resident: the page's log. One write
 * holds at most DOLLY_PROCESS_PACKET_LIMIT bytes; the page refuses more. */
DOLLY_BROWSER_IMPORT(dolly_bootstrap_write_bytes)
int dolly_bootstrap_write_bytes(const unsigned char *bytes, uintptr_t length);
/* Zero, or the negative errno of a refused boot text write. */
int dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);
void dolly_terminal_publish_result(int status);
void dolly_kernel_foreground_publish(int pid, int interruptible);
/* The terminal's foreground owner, or zero. */
int dolly_kernel_foreground(void);

int dolly_process_descends_from(int pid, int ancestor_pid);
void dolly_kernel_terminal_resized(void);

#define DOLLY_PROCESS_DISPATCH_DEFERRED INT64_MIN

#endif
