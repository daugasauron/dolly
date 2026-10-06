#ifndef DOLLY_RUNTIME_API_H
#define DOLLY_RUNTIME_API_H

#include <stdint.h>
#include <stdio.h>
#include <sys/types.h>
#include <dolly/process.h>

#ifdef __cplusplus
extern "C" {
#endif

// Starts a filesystem-resident Dolly command with explicitly routed standard
// descriptors. It returns a positive in-Wasm pid once the kernel accepts the
// child; dolly_wait() collects its eventual status. Errors are negative errno.
int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd);

// Transfer foreground ownership to a child, restoring it after retirement.
// Inherits cwd, environment and stdio. interactive must be zero or one.
int dolly_spawn_foreground(const char *path, int argc, char **argv,
                           int interactive);

// Spawn with a kernel-owned deadline of at most one day; -1 means none. A
// deadline expiry returns shell status 124 without a host process.
int dolly_spawn_timeout(const char *path, int argc, char **argv,
                        int stdin_fd, int stdout_fd, int stderr_fd,
                        double timeout_milliseconds);

// Spawn with an explicit child environment, copied into the command context
// and never retained or modified, and the same runtime-owned deadline.
int dolly_spawn_env_timeout(const char *path, int argc, char **argv,
                            char *const envp[], int stdin_fd, int stdout_fd,
                            int stderr_fd, double timeout_milliseconds);

// Atomically select the child's absolute cwd without changing the parent's.
// NULL inherits cwd; a timeout of -1 disables the deadline.
int dolly_spawn_env_cwd(const char *path, int argc, char **argv,
                        char *const envp[], const char *cwd, int stdin_fd,
                        int stdout_fd, int stderr_fd, double timeout_milliseconds);

// Inherit eligible descriptors, then apply explicit parent-to-child mappings.
// The stdio convenience forms above use NONE and three explicit mappings.
int dolly_spawn_mapped(const char *path, int argc, char **argv,
                        char *const envp[], const char *cwd,
                        uint32_t descriptor_inheritance,
                        const dolly_process_fd_mapping *mappings,
                        uint32_t mapping_count, double timeout_milliseconds);

// Collects a completed command and releases its bounded process-table slot.
// Returns zero on success or a negative errno value.
int dolly_wait(int pid, int *status);

// Copies a file into kernel-owned WasmFS through the process syscall gate.
int dolly_write_file(const char *path, const void *bytes, size_t length);

// Publishes one completed interactive shell command to the terminal mailbox.
// Non-interactive shells and ordinary commands do not call this operation.
void dolly_terminal_publish_result(int status);

// Runtime event-loop support. A negative timeout waits indefinitely, zero is
// nonblocking, and a positive timeout is measured in milliseconds. These read
// Ghostty-encoded bytes and dimensions from the in-Wasm display mailbox.
int dolly_terminal_read_raw_timeout(double milliseconds);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);

// Small terminal discipline contract. Language/libc adapters translate their
// own termios layouts above these semantic bits. OPOST enables output
// processing; ONLCR maps LF to CRLF when OPOST is enabled. While ISIG is set,
// Ctrl+C sends SIGINT to the foreground; once a program clears it (raw mode),
// Ctrl+C reaches that program as the input byte 0x03.
enum {
  DOLLY_TERMINAL_CANONICAL = 1u << 0,
  DOLLY_TERMINAL_ECHO = 1u << 1,
  DOLLY_TERMINAL_OPOST = 1u << 2,
  DOLLY_TERMINAL_ONLCR = 1u << 3,
  DOLLY_TERMINAL_ISIG = 1u << 4,
};

// Returns a non-negative DOLLY_TERMINAL_* mask, or a negative errno value.
int dolly_terminal_mode_get(int descriptor);
int dolly_terminal_mode_set(int descriptor, uint32_t flags);

// Returns SIGINT once when the kernel has targeted this process, or zero when
// no interrupt is pending. The supervisor retains a forced Worker-termination
// fallback for programs that never enter the kernel.
int dolly_interrupt_poll(void);

// True for descriptors connected to the in-Wasm terminal, not for other
// character devices such as /dev/null, redirected files or pipes. libc's
// isatty uses this same operation.
int dolly_isatty(int descriptor);

// Terminates only the currently executing Dolly process, as killed by a signal.
void dolly_exit_signal(int signal_number) __attribute__((__noreturn__));

// POSIX-shaped waiting and signals above Dolly's private processes. waitpid
// accepts a child PID or -1/0 for any child; kill needs a positive PID.
pid_t dolly_waitpid(pid_t pid, int *status, int options);
int dolly_kill(pid_t pid, int signal_number);

// Raw sockets are deliberately absent: the POSIX socket functions fail
// explicitly. HTTP-capable libraries use the typed dolly_http_perform broker,
// whose sole outer edge is browser Fetch.

#ifdef __cplusplus
}
#endif

#endif
