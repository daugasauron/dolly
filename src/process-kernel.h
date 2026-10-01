#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <stddef.h>
#include <stdint.h>
#include <string.h>

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
/* Decodes a dolly_process_path_request into a path the kernel can open. */
int64_t dolly_kernel_request_path(int pid, uintptr_t request_size,
                                  char *path, size_t capacity);

/* The terminal device, host/display/kernel.c. */
int dolly_kernel_terminal_attached(void);
void dolly_kernel_terminal_render(const unsigned char *bytes, size_t length);
int dolly_kernel_terminal_read(void);
int dolly_kernel_terminal_ready(void);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);
void dolly_terminal_discard_pending_input(void);

/* The terminal line discipline and the page's terminal mailbox, src/dolly.c. */
uint32_t dolly_kernel_terminal_mode(void);
int dolly_kernel_terminal_set_mode(uint32_t flags);
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);
void dolly_terminal_publish_result(int status);
void dolly_kernel_foreground_publish(int pid, int interruptible);
/* The terminal's foreground owner, or zero. */
int dolly_kernel_foreground(void);

int dolly_process_descends_from(int pid, int ancestor_pid);
void dolly_kernel_terminal_resized(void);

#define DOLLY_PROCESS_DISPATCH_DEFERRED INT64_MIN

/* Browser imports that return target errno values. EM_JS stringifies its
 * JavaScript body; this extra expansion first replaces C macros such as ENOSYS
 * with their numbers. */
#define DOLLY_EM_JS(...) EM_JS(__VA_ARGS__)

#endif
