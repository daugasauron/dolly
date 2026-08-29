#ifndef DOLLY_RUNTIME_H
#define DOLLY_RUNTIME_H

#include <stdint.h>

#include <dolly/toolchain.h>

enum {
  DOLLY_TERMINAL_MAILBOX_VERSION = 1,
  DOLLY_TERMINAL_MAILBOX_HEADER_SIZE = 64,
  DOLLY_TERMINAL_INPUT_CAPACITY = 65536,
  DOLLY_HTTP_MAILBOX_VERSION = 2,
  DOLLY_HTTP_MAILBOX_HEADER_SIZE = 64,
  DOLLY_HTTP_CHUNK_CAPACITY = 65536,
};

// The mailbox begins with seven little-endian atomic u32 fields: input read
// cursor, input write cursor, input wake sequence, command result sequence,
// command status, foreground pid, and flags. Input bytes begin at offset 64.
uintptr_t dolly_terminal_mailbox_address(void);
uint32_t dolly_terminal_mailbox_version(void);
uint32_t dolly_terminal_input_capacity(void);
int dolly_terminal_read_raw(void);
void dolly_terminal_reset_cooked(void);
void dolly_terminal_publish_result(int status);
void dolly_terminal_write(const char *text);
void dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);

uintptr_t dolly_http_mailbox_address(void);
uint32_t dolly_http_mailbox_version(void);
uint32_t dolly_http_chunk_capacity(void);

int dolly_run_filesystem_module(const char *path, int argc, char **argv);
int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd);
int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd);
int dolly_wait(int pid, int *status);
pid_t dolly_wait_any(int *status);

#endif
