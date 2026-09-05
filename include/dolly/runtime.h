#ifndef DOLLY_RUNTIME_API_H
#define DOLLY_RUNTIME_API_H

#include <stdint.h>
#include <stdio.h>
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

// Starts a filesystem-resident Dolly command with explicitly routed standard
// descriptors. It returns a positive in-Wasm pid once the kernel accepts the
// child; dolly_wait() collects its eventual status. Errors are negative errno.
int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd);

// Spawn with a kernel-owned deadline. A deadline expiry returns shell status
// 124 without a host process.
int dolly_spawn_timeout(const char *path, int argc, char **argv,
                        int stdin_fd, int stdout_fd, int stderr_fd,
                        double timeout_milliseconds);

// Spawn with an explicit child environment. The input
// array is copied into the command context and never retained or modified.
int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd);

// Explicit-environment form with the same runtime-owned deadline semantics.
// Keeping both controls in one spawn operation avoids mutating a parent's
// environment merely to configure a child.
int dolly_spawn_env_timeout(const char *path, int argc, char **argv,
                            char *const envp[], int stdin_fd, int stdout_fd,
                            int stderr_fd, double timeout_milliseconds);

/* Process-local dynamic loading. dolly_dlopen() accepts only a side module
 * carrying the current dolly.process.dso stamp. Its imports resolve from the
 * executable and already-loaded DSOs in the same private Worker; loading never
 * delegates filesystem access to the browser. */
void *dolly_dlopen(const char *path, int flags);
void *dolly_dlsym(void *handle, const char *name);
char *dolly_dlerror(void);
int dolly_dlclose(void *handle);

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
// own termios layouts above these two stable semantic bits. Foreground Ctrl+C
// remains a lifecycle operation, not mutable terminal state.
enum {
  DOLLY_TERMINAL_CANONICAL = 1u << 0,
  DOLLY_TERMINAL_ECHO = 1u << 1,
};

// Returns a non-negative DOLLY_TERMINAL_* mask, or a negative errno value.
int dolly_terminal_mode_get(int descriptor);
int dolly_terminal_mode_set(int descriptor, uint32_t flags);

// Returns SIGINT once when the kernel has targeted this process, or zero when
// no interrupt is pending. The supervisor retains a forced Worker-termination
// fallback for programs that never reach a checkpoint.
int dolly_interrupt_poll(void);

// Compiler-inserted cancellation safepoint. A pending SIGINT terminates only
// the current Dolly command with the conventional shell status 130.
void dolly_interrupt_checkpoint(void);

// Dolly terminals are WasmFS character devices whose browser-free line and
// raw disciplines live in the runtime. Emscripten's generic isatty probes a
// native-style ioctl that those devices intentionally do not expose, so the
// target uses this descriptor-kind check instead. Regular redirected files
// and serial pipeline spools return false.
int dolly_isatty(int descriptor);

// Terminates only the currently executing Dolly process.
void dolly_exit(int status) __attribute__((__noreturn__));

// Compatibility spelling used only by the resident kernel display plugin.
int dolly_fclose(FILE *stream);

// POSIX-shaped shell helpers execute /bin/slop as another private process.
int dolly_system(const char *command);
FILE *dolly_popen(const char *command, const char *mode);
int dolly_pclose(FILE *stream);

// Handlers are scoped to the current command invocation and run in reverse
// registration order when its main returns or calls dolly_exit.
int dolly_atexit(void (*callback)(void));

char *dolly_getpass(const char *prompt);
ssize_t dolly_getrandom(void *buffer, size_t length, unsigned flags);

// Minimal exec/wait compatibility above Dolly's serialized process model.
int dolly_execve(const char *path, char *const argv[], char *const envp[]);
pid_t dolly_waitpid(pid_t pid, int *status, int options);
int dolly_kill(pid_t pid, int signal_number);
unsigned dolly_alarm(unsigned seconds);

// Raw sockets are deliberately absent. HTTP-capable libraries must use the
// typed dolly_http_perform broker, whose sole outer edge is browser Fetch.
// Their exact declarations come from the ordinary POSIX headers after the
// compiler maps those names onto Dolly's failure implementations.

#ifdef __cplusplus
}
#endif

#endif
