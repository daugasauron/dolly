#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <dolly/display.h>

#include <stddef.h>
#include <stdint.h>

/* Terminal services of dolly.c used by process dispatch. */
int dolly_terminal_read_raw_timeout(double milliseconds);
int dolly_terminal_raw_ready_timeout(double milliseconds);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);
uint32_t dolly_kernel_terminal_mode(void);
int dolly_kernel_terminal_set_mode(uint32_t flags);
void dolly_terminal_publish_result(int status);
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);
void dolly_terminal_discard_pending_input(void);
int dolly_download_file(const char *path);

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
