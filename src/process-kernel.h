#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <dolly/display.h>

#include <stddef.h>
#include <stdint.h>

uint32_t dolly_process_supervisor_version(void);
uintptr_t dolly_process_mailbox_address(void);
uintptr_t dolly_process_mailbox_capacity(void);
int dolly_process_spawn_serialized(uintptr_t request_size);
int64_t dolly_process_dispatch(int pid, uint32_t operation,
                               uintptr_t request_size,
                               uintptr_t response_capacity);
int dolly_process_next_launch(void);
uintptr_t dolly_process_image_address(int pid);
uintptr_t dolly_process_image_size(int pid);
int dolly_process_image_consumed(int pid);
int dolly_process_worker_started(int pid);
int dolly_process_worker_failed(int pid, int status);
int dolly_process_signal(int pid, int signal_number);
double dolly_process_deadline_remaining(int pid);
int dolly_process_collect(int pid);
int dolly_process_parent(int pid);
int dolly_process_descends_from(int pid, int ancestor_pid);

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

#endif
