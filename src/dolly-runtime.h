#ifndef DOLLY_RUNTIME_H
#define DOLLY_RUNTIME_H

#include <stdint.h>

#include <dolly/display.h>
#include <dolly/http.h>
#include <dolly/toolchain.h>

enum {
  DOLLY_HTTP_MAILBOX_VERSION = 2,
  DOLLY_HTTP_MAILBOX_HEADER_SIZE = 64,
};

uintptr_t dolly_display_mailbox_address(void);
uint32_t dolly_display_mailbox_version(void);
uint32_t dolly_display_event_size(void);
uint32_t dolly_display_event_capacity(void);
uintptr_t dolly_display_framebuffer_address(uint32_t index);
uintptr_t dolly_display_framebuffer_capacity(void);
uintptr_t dolly_display_paste_buffer_address(void);
uintptr_t dolly_display_copy_buffer_address(void);
uint32_t dolly_display_clipboard_capacity(void);
int dolly_terminal_read_raw(void);
int dolly_terminal_read_raw_timeout(double milliseconds);
int dolly_display_acquire(dolly_display_surface *surface);
int dolly_display_begin_frame(uint64_t generation, dolly_display_frame *frame);
int dolly_display_present(uint64_t generation, uint32_t buffer_index);
int dolly_display_next_event(uint64_t generation, dolly_input_event *event,
                             double timeout_milliseconds);
int dolly_display_release(uint64_t generation);
int dolly_interrupt_poll(void);
void dolly_interrupt_checkpoint(void);
int dolly_isatty(int descriptor);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);
void dolly_terminal_reset_cooked(void);
void dolly_terminal_publish_result(int status);
void dolly_terminal_write(const char *text);
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);

uintptr_t dolly_http_mailbox_address(void);
uint32_t dolly_http_mailbox_version(void);
uint32_t dolly_http_chunk_capacity(void);

int dolly_toolchain_validate_executable(const char *path);
int dolly_run_filesystem_module(const char *path, int argc, char **argv);
int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd);
int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd);
int dolly_wait(int pid, int *status);
pid_t dolly_wait_any(int *status);

#endif
