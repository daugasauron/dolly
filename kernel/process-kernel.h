#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <sys/types.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <sys/stat.h>

#include <dolly/process.h>

/* A kernel import (abi/dolly-browser-0.wat). The host module whose manifest
 * owns the name provides it; a module the page did not enable answers ENOSYS. */
#define DOLLY_BROWSER_IMPORT(name) \
  __attribute__((import_module("env"), import_name(#name)))

/* A host module's kernel side (host/NAME/kernel.c defines dolly_NAME_kernel).
 * Process operations in [first_operation, last_operation] reach call() with
 * the request in the process mailbox, where call() also writes its response.
 * A call that defers (DOLLY_PROCESS_DISPATCH_DEFERRED) has written nothing:
 * the request stays in the mailbox for the retry.
 * release() runs when a thread retires and, with tid 0, when a process exits.
 * mailbox(), which a module that runs a process on several threads defines,
 * keeps the mailbox of each thread's Worker (dolly_process_worker_mailbox):
 * zero, or -ESRCH for a thread it does not know. A device leased per process
 * (kernel/device-lease.c) is a module with a device in place of call and release. */
struct dolly_leased_device;
typedef struct {
  uint32_t first_operation, last_operation;
  int64_t (*call)(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                  uintptr_t request_size, uintptr_t response_capacity);
  void (*release)(int pid, int tid);
  int (*mailbox)(int pid, int tid, uintptr_t address);
  const struct dolly_leased_device *device;
  /* The halves of the display's terminal a module gives (below). */
  const struct dolly_terminal_output *terminal_output;
  const struct dolly_terminal_input *terminal_input;
} dolly_kernel_module;

static inline int64_t dolly_kernel_respond(unsigned char *mailbox,
                                           const void *response, size_t size) {
  memcpy(mailbox, response, size);
  return (int64_t)size;
}
/* Whether a wait may continue; records the remaining time for the supervisor. */
int dolly_kernel_deadline_pending(uint64_t deadline_nanoseconds);
/* For a module that runs a process on several threads (host/threads/kernel.c):
 * dispatch for one thread, where takes_signals marks the thread receiving the
 * process's signals and mailbox is the thread's Worker's; the process states
 * it may act on; and the release of what every module holds for a thread that
 * ended. */
int64_t dolly_kernel_dispatch(int pid, int tid, int takes_signals, uint32_t operation,
                              uintptr_t mailbox, uintptr_t request_size,
                              uintptr_t response_capacity);
/* The boot's standard streams, directories, /proc/processes and environment, before a
 * filesystem is restored into it: an image's snapshot, or a saved session's whole
 * filesystem (host/snapshot/kernel.c). */
int dolly_kernel_boot_environment(void);
int dolly_kernel_process_launching(int pid);
int dolly_kernel_process_running(int pid);
void dolly_kernel_thread_released(int pid, int tid);
/* Decodes a dolly_process_path_request into a path the kernel can open. */
int64_t dolly_kernel_request_path(int pid, uintptr_t request_size,
                                  char *path, size_t capacity);

/* A stream: the open description its descriptors name, a pipe's end, a
 * pseudo-terminal's (kernel/pty.c) or one a host module implements
 * (host/sockets/kernel.c). The kernel counts them, keeps the description's
 * O_NONBLOCK, closes the stream with its last descriptor and passes on reads,
 * writes and polls; `wait` is whether an empty read or a full write may be
 * deferred. A kind that is a terminal answers the terminal request of its
 * descriptors: the response to fill, or a negative errno. */
typedef struct dolly_kernel_socket dolly_kernel_socket;
typedef struct {
  uint32_t file_type; /* DOLLY_PROCESS_FILE_*, as fstat reports the descriptor. */
  uint32_t access;    /* DOLLY_PROCESS_FD_STATUS_READ and _WRITE, as it gives them. */
  void (*close)(dolly_kernel_socket *socket);
  int64_t (*receive)(dolly_kernel_socket *socket, unsigned char *bytes, size_t size, int wait);
  int64_t (*send)(dolly_kernel_socket *socket, const unsigned char *bytes, size_t size, int wait);
  uint16_t (*poll)(const dolly_kernel_socket *socket, uint16_t requested);
  int64_t (*terminal)(dolly_kernel_socket *socket, const dolly_process_terminal_request *request,
                      dolly_process_terminal_response *response);
} dolly_kernel_socket_kind;
struct dolly_kernel_socket {
  const dolly_kernel_socket_kind *kind;
  uint32_t descriptors;
  unsigned char nonblocking;
};
/* For those modules: the stream of `kind` a descriptor of `pid` names (EBADF,
 * ENOTSOCK for another kind); `count` new descriptors, all or none (EMFILE);
 * the directory relative paths of `pid` start from; that a deferred call may
 * now complete; and each(pid, argument) for the processes that hold a
 * descriptor of `socket`. With `foreground` the one the other holders descend
 * from is left out while it has them, as a terminal's interrupt key spares
 * the shell that waits for its command. */
int dolly_kernel_socket_descriptor(int pid, uint32_t descriptor, const dolly_kernel_socket_kind *kind,
                                   dolly_kernel_socket **socket);
int dolly_kernel_socket_open(int pid, dolly_kernel_socket *const *sockets, uint32_t count,
                             int close_on_exec, uint32_t *descriptors);
/* A pipe for a module that holds its ends itself (console@0): its read and
 * write end, each held once by the module, which gives an end to a process
 * with dolly_kernel_socket_open and lets its own hold go with
 * dolly_kernel_socket_release. ENFILE past the kernel's pipes. */
int dolly_kernel_pipe_open(dolly_kernel_socket *ends[2]);
void dolly_kernel_socket_release(dolly_kernel_socket *socket);
int dolly_kernel_process_directory(int pid);
/* For console@0, which starts a root process as the supervisor does
 * (dolly-supervisor-0.wat): the supervisor's mailbox and its spawn. */
uintptr_t dolly_process_mailbox_address(void);
int dolly_process_spawn_serialized(uintptr_t request_size);
/* While held (a session's save, host/snapshot/kernel.c), the process calls
 * that change a file's bytes or times, or remove, rename or truncate one, wait:
 * nothing changes the files being copied. Everything else runs. */
void dolly_kernel_hold_calls(int held);
/* 1 while a change to `descriptor`'s bytes or times must wait, a regular
 * file's; -1 names a path's removal, rename or truncation. */
int dolly_kernel_change_waits(int descriptor);
/* How many changes processes made to files, directories and links since the
 * count was last cleared; CLEAR clears it. */
uint32_t dolly_kernel_changes(int clear);
void dolly_kernel_wake(void);
/* Raises `number` for `pid`, which the supervisor delivers as it delivers a
 * kill: what a module's device decides, as a pseudo-terminal's interrupt key. */
void dolly_kernel_raise(int pid, int number);
void dolly_kernel_socket_holders(const dolly_kernel_socket *socket, int foreground,
                                 void (*each)(int pid, int argument), int argument);
/* WasmFS has no socket node. A path a socket was bound to is an empty regular
 * file with the sticky bit, which no process can set: chmod changes nothing. */
static inline int dolly_kernel_socket_node(mode_t mode) {
  return S_ISREG(mode) && (mode & S_ISVTX) != 0;
}

/* The display's terminal, whose halves modules give: its output
 * (host/display/kernel.c) and its input (host/input/kernel.c). The accessors
 * answer NULL where no module gives the half; output that is not attached (no
 * driver yet) is no terminal either, and the boot terminal's output then goes
 * to the bootstrap log. replies() copies what the terminal answers its
 * program (a cursor report) and returns the count; read() is the next byte
 * typed, or -1; service() handles the pointer and scroll input that is the
 * terminal's own, before it draws; discard() drops what was typed. */
typedef struct dolly_terminal_output {
  int (*attached)(void);
  void (*render)(const unsigned char *bytes, size_t length);
  size_t (*replies)(unsigned char *output, size_t capacity);
} dolly_terminal_output;
typedef struct dolly_terminal_input {
  int (*read)(void);
  int (*service)(void);
  void (*discard)(void);
} dolly_terminal_input;
const dolly_terminal_output *dolly_kernel_terminal_output_device(void);
const dolly_terminal_input *dolly_kernel_terminal_input_device(void);

/* The boot terminal and the page's terminal mailbox, kernel/dolly.c. */
/* The boot terminal's slave, the page's terminal: its programs' standard
 * streams; NULL without memory. */
dolly_kernel_socket *dolly_kernel_boot_terminal(void);
uint32_t dolly_kernel_terminal_mode(void);
/* The display's new grid: SIGWINCH for the programs on the boot terminal. */
void dolly_kernel_terminal_resized(uint32_t columns, uint32_t rows);
/* Drops what was typed at the boot terminal and not read. */
void dolly_kernel_terminal_discard(void);
/* Boot text while no display driver is resident: the page's log. One write
 * holds at most DOLLY_PROCESS_PACKET_LIMIT bytes; the page refuses more. */
DOLLY_BROWSER_IMPORT(dolly_bootstrap_write_bytes)
int dolly_bootstrap_write_bytes(const unsigned char *bytes, uintptr_t length);
/* What the kernel writes to the boot terminal. Zero, or the negative errno of
 * a refused boot text write. */
int dolly_kernel_terminal_write(const unsigned char *bytes, uintptr_t length);
int dolly_terminal_write_bytes(int pid, const unsigned char *bytes, uintptr_t length);
/* The version of the bytes a kernel descriptor reads, kernel/file-blocks.cpp. */
uint64_t dolly_fs_version(int descriptor);
/* The address of block `index` of those bytes (DOLLY_FS_BLOCK_SIZE each, the
 * last short), or 0 past them or for no regular file. */
uintptr_t dolly_fs_block(int descriptor, uintptr_t index);
/* Makes PATH, whose parents exist, the build's input image INPUT of SIZE
 * bytes, which the Worker holds: 0 or a negative errno. */
int dolly_fs_input_file(const char *path, uint32_t input, uint64_t size);
/* The supervisor's words about the executable it prepares, kernel/process-kernel.c. */
bool dolly_kernel_launch_diagnostic(int pid, const unsigned char *bytes, size_t size);
void dolly_terminal_publish_result(int status);
void dolly_kernel_foreground_publish(int pid, unsigned interrupt);
/* The terminal's foreground owner, or zero. */
int dolly_kernel_foreground(void);
/* The foreground process the page asked to interrupt (Ctrl-C) since the last
 * call, or 0: the page's terminal mailbox (abi/dolly-supervisor-0.wat). */
int dolly_kernel_take_interrupt(void);
/* Ctrl-C's SIGINT for PID's tree (console@0's pipes, which have no
 * interrupt key): the host carries it out at its next event. */
void dolly_kernel_interrupt_tree(int pid);

int dolly_process_descends_from(int pid, int ancestor_pid);

#define DOLLY_PROCESS_DISPATCH_DEFERRED INT64_MIN

#endif
