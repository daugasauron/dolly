#ifndef DOLLY_RUNTIME_API_H
#define DOLLY_RUNTIME_API_H

#include <stdint.h>
#include <stdio.h>
#include <sys/types.h>
#include <dolly/process.h>

#ifdef __cplusplus
extern "C" {
#endif

// A device leased per process (gpu@0, audio@0, microphone@0, nena@0): each
// call of the device's own operation is one packet, this header and then the
// operation's body, answered in the device's reply slot
// (dolly-supervisor-0.wat). version is the device's. scope names the lease
// and is never reused: it is 0 in the OPEN that asks for one, whose reply
// begins with the u64 scope. sequence starts at 1 and only increases.
// body_bytes is the length of what follows; reserved and the upper halves of
// scope and sequence are zero.
typedef struct {
  uint32_t version;
  uint32_t operation;
  uint64_t scope;
  uint64_t sequence;
  uint32_t body_bytes;
  uint32_t reserved;
} dolly_device_header;
#ifdef __cplusplus
static_assert(sizeof(dolly_device_header) == 32, "dolly_device_header");
#else
_Static_assert(sizeof(dolly_device_header) == 32, "dolly_device_header");
#endif

// One call of a leased device (dolly_device_header): fills the header at the
// start of packet, `bytes` long in all, for scope with the lease's next
// sequence, and calls the device's process operation. The last sequence is
// kept for close_operation, so a lease whose sequences are spent can still
// close; any other call fails with -EOVERFLOW. Returns the reply's length or a
// negative errno.
static inline int64_t dolly_device_request(uint32_t process_operation, uint32_t version,
                                           uint32_t operation, uint32_t close_operation,
                                           uint64_t scope, uint64_t *sequence, void *packet,
                                           size_t bytes, void *reply, size_t reply_capacity) {
  if (*sequence >= UINT32_MAX - (operation != close_operation)) return -DOLLY_PROCESS_EOVERFLOW;
  const dolly_device_header header = {
      version, operation, scope, ++*sequence, (uint32_t)(bytes - sizeof(header)), 0};
  __builtin_memcpy(packet, &header, sizeof(header));
  return dolly_process_call(process_operation, packet, bytes, reply, reply_capacity);
}

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
// The stdio convenience forms above use NONE and three explicit mappings. A
// child of these starts with every signal unblocked at its default action;
// posix_spawn's keeps the caller's mask and ignored signals.
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
// the terminal's decoded input bytes and its dimensions.
int dolly_terminal_read_raw_timeout(double milliseconds);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);

// Small terminal discipline contract. Language/libc adapters translate their
// own termios layouts above these semantic bits. OPOST enables output
// processing; ONLCR maps LF to CRLF when OPOST is enabled. While ISIG is set,
// the interrupt character (termios VINTR) sends SIGINT to the foreground: Ctrl+C
// (3), or the one INTERRUPT holds when it is not 0, as Emacs sets C-g; once a
// program clears ISIG (raw mode), it reaches that program as input. ICRNL reads
// an input CR as LF and INLCR an input LF as CR (both: they swap); a canonical
// line ends at either. A non-canonical read returns the bytes queued, at
// least one, unless VMIN_ZERO is set (termios VMIN 0): then it returns without
// a byte, at once or once VTIME tenths of a second have passed since it began.
enum {
  DOLLY_TERMINAL_CANONICAL = 1u << 0,
  DOLLY_TERMINAL_ECHO = 1u << 1,
  DOLLY_TERMINAL_OPOST = 1u << 2,
  DOLLY_TERMINAL_ONLCR = 1u << 3,
  DOLLY_TERMINAL_ISIG = 1u << 4,
  DOLLY_TERMINAL_ICRNL = 1u << 5,
  DOLLY_TERMINAL_INLCR = 1u << 6,
  DOLLY_TERMINAL_VMIN_ZERO = 1u << 7,
  DOLLY_TERMINAL_INTERRUPT_SHIFT = 8,
  DOLLY_TERMINAL_INTERRUPT = 0xffu << DOLLY_TERMINAL_INTERRUPT_SHIFT,
  DOLLY_TERMINAL_VTIME_SHIFT = 16,
  DOLLY_TERMINAL_VTIME = 0xffu << DOLLY_TERMINAL_VTIME_SHIFT,
  DOLLY_TERMINAL_MODE_BITS = DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO | DOLLY_TERMINAL_OPOST |
      DOLLY_TERMINAL_ONLCR | DOLLY_TERMINAL_ISIG | DOLLY_TERMINAL_ICRNL | DOLLY_TERMINAL_INLCR |
      DOLLY_TERMINAL_VMIN_ZERO | DOLLY_TERMINAL_INTERRUPT | DOLLY_TERMINAL_VTIME,
};

// The character that interrupts the foreground under this mode, or 0.
static inline unsigned dolly_terminal_interrupt(uint32_t mode) {
  const unsigned key = (mode & DOLLY_TERMINAL_INTERRUPT) >> DOLLY_TERMINAL_INTERRUPT_SHIFT;
  return (mode & DOLLY_TERMINAL_ISIG) == 0 ? 0 : key != 0 ? key : 3;
}

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
// accepts a child PID, -PID for the same child (a process group is one
// process), or -1/0 for any child; kill needs a positive PID.
pid_t dolly_waitpid(pid_t pid, int *status, int options);
int dolly_kill(pid_t pid, int signal_number);

#ifdef __cplusplus
}
#endif

#endif
