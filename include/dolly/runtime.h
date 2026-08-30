#ifndef DOLLY_RUNTIME_API_H
#define DOLLY_RUNTIME_API_H

#include <stdint.h>
#include <stdio.h>
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

// Starts a filesystem-resident Dolly command with explicitly routed standard
// descriptors. Version 0 runs it synchronously and returns a positive pid once
// its exit status is available. Errors are returned as negative errno values.
int dolly_spawn(const char *path, int argc, char **argv,
                int stdin_fd, int stdout_fd, int stderr_fd);

// Synchronous version-0 spawn with an explicit child environment. The input
// array is copied into the command context and never retained or modified.
int dolly_spawn_env(const char *path, int argc, char **argv, char *const envp[],
                    int stdin_fd, int stdout_fd, int stderr_fd);

// Collects a completed command and releases its bounded process-table slot.
// Returns zero on success or a negative errno value.
int dolly_wait(int pid, int *status);

// Mutates the runtime-owned WasmFS directly. Dynamic language runtimes use
// this narrow call instead of retaining executable-local stdio state around a
// filesystem operation.
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

// Returns SIGINT once when the browser has targeted the currently executing
// foreground command, or zero when no interrupt is pending. Ordinary programs
// normally rely on compiler-inserted checkpoints rather than calling this.
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

// Terminates only the currently executing Dolly command. The compiler maps
// ordinary C exit() calls to this lifecycle operation.
#ifdef __cplusplus
[[noreturn]] void dolly_exit(int status);
#else
_Noreturn void dolly_exit(int status);
#endif

// Closes ordinary streams. Standard streams are inherited runtime resources,
// so closing one at command teardown flushes it without invalidating the
// shared shell stream. The compiler maps ordinary fclose() calls here.
int dolly_fclose(FILE *stream);

// Dolly has no ambient shell or host subprocesses. These preserve the libc
// call shapes while failing explicitly inside the Wasm userspace.
int dolly_system(const char *command);
FILE *dolly_popen(const char *command, const char *mode);
int dolly_pclose(FILE *stream);

// Handlers are scoped to the current command invocation and run in reverse
// registration order when its main returns or calls dolly_exit.
int dolly_atexit(void (*callback)(void));

// Dolly has no file permission checks. These retain source compatibility
// without creating or consulting execute bits, ownership, or a process umask.
int dolly_chmod(const char *path, mode_t mode);
mode_t dolly_umask(mode_t mask);
char *dolly_getpass(const char *prompt);
ssize_t dolly_getrandom(void *buffer, size_t length, unsigned flags);

// Version 0 has no concurrent native-style process model. These calls are
// explicit in-Wasm failures; they never delegate to the browser or host.
pid_t dolly_fork(void);
int dolly_execve(const char *path, char *const argv[], char *const envp[]);
int dolly_execvp(const char *file, char *const argv[]);
int dolly_execl(const char *path, const char *arg, ...);
int dolly_execlp(const char *file, const char *arg, ...);
pid_t dolly_waitpid(pid_t pid, int *status, int options);
pid_t dolly_wait_any(int *status);
int dolly_kill(pid_t pid, int signal_number);
pid_t dolly_setsid(void);
pid_t dolly_getpgid(pid_t pid);
pid_t dolly_tcgetpgrp(int fd);
unsigned dolly_alarm(unsigned seconds);
unsigned dolly_sleep(unsigned seconds);
_Noreturn void dolly__exit(int status);

// Raw sockets are deliberately absent. HTTP-capable libraries must use the
// typed dolly_http_perform broker, whose sole outer edge is browser Fetch.
// Their exact declarations come from the ordinary POSIX headers after the
// compiler maps those names onto Dolly's failure implementations.

#ifdef __cplusplus
}
#endif

#endif
