#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <dolly/display.h>

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

/* Terminal services of dolly.c used by process dispatch. */
int dolly_kernel_terminal_read(void);
int dolly_kernel_terminal_ready(void);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);
uint32_t dolly_kernel_terminal_mode(void);
int dolly_kernel_terminal_set_mode(uint32_t flags);
void dolly_terminal_publish_result(int status);
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);
void dolly_terminal_discard_pending_input(void);

int dolly_process_descends_from(int pid, int ancestor_pid);
void dolly_kernel_foreground_publish(int pid, int interruptible);
void dolly_kernel_terminal_resized(void);

int dolly_kernel_display_acquire(int pid, dolly_display_surface *surface);
int dolly_kernel_display_set_size(int pid, uint64_t generation,
                                  uint32_t width, uint32_t height,
                                  dolly_display_surface *surface);
int dolly_kernel_display_begin_frame(int pid, uint64_t generation,
                                     dolly_display_frame *frame);
int dolly_kernel_display_write_frame(int pid, uint64_t generation,
                                     uint32_t buffer_index, size_t offset,
                                     const unsigned char *bytes, size_t size);
int dolly_kernel_display_present(int pid, uint64_t generation,
                                 uint32_t buffer_index);
int dolly_kernel_display_poll_frame(int pid, uint64_t generation,
                                    uint32_t sequence, uint32_t *current);
int dolly_kernel_display_set_cursor(int pid, uint64_t generation,
                                    uint32_t cursor);
int dolly_kernel_display_poll_event(int pid, uint64_t generation,
                                    dolly_input_event *event);
int dolly_kernel_display_release(int pid, uint64_t generation);
void dolly_kernel_display_release_owner(int pid);

#define DOLLY_PROCESS_DISPATCH_DEFERRED INT64_MIN

/* Browser imports that return target errno values. EM_JS stringifies its
 * JavaScript body; this extra expansion first replaces C macros such as ENOSYS
 * with their numbers. */
#define DOLLY_EM_JS(...) EM_JS(__VA_ARGS__)

#endif
