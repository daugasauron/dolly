#ifndef DOLLY_PROCESS_KERNEL_H
#define DOLLY_PROCESS_KERNEL_H

#include <sys/types.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <sys/stat.h>

/* A kernel import (abi/dolly-browser-0.wat). The host module whose manifest
 * owns the name provides it; a module the page did not enable answers ENOSYS. */
#define DOLLY_BROWSER_IMPORT(name) \
  __attribute__((import_module("env"), import_name(#name)))

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
/* For a module that runs a process on several threads (host/threads/kernel.c):
 * dispatch for one thread, where takes_signals marks the thread receiving the
 * process's signals; the process states it may act on; and the release of what
 * every module holds for a thread that ended. */
int64_t dolly_kernel_dispatch(int pid, int tid, int takes_signals, uint32_t operation,
                              uintptr_t request_size, uintptr_t response_capacity);
int dolly_kernel_process_launching(int pid);
int dolly_kernel_process_running(int pid);
void dolly_kernel_thread_released(int pid, int tid);
/* Decodes a dolly_process_path_request into a path the kernel can open. */
int64_t dolly_kernel_request_path(int pid, uintptr_t request_size,
                                  char *path, size_t capacity);

/* A local stream socket, host/sockets/kernel.c: the open description its
 * descriptors name. The kernel counts them, keeps the description's
 * O_NONBLOCK, closes the socket with its last descriptor and passes on reads,
 * writes and polls; `wait` is whether an empty read or a full write may be
 * deferred. */
typedef struct {
  uint32_t descriptors;
  unsigned char nonblocking;
} dolly_kernel_socket;
void dolly_kernel_socket_close(dolly_kernel_socket *socket);
int64_t dolly_kernel_socket_receive(dolly_kernel_socket *socket, unsigned char *bytes,
                                    size_t size, int wait);
int64_t dolly_kernel_socket_send(dolly_kernel_socket *socket, const unsigned char *bytes,
                                 size_t size, int wait);
uint16_t dolly_kernel_socket_poll(const dolly_kernel_socket *socket, uint16_t requested);
/* For that module: the socket a descriptor of `pid` names (EBADF, ENOTSOCK);
 * `count` new descriptors, all or none (EMFILE); the directory relative
 * paths of `pid` start from; and that a deferred call may now complete. */
int dolly_kernel_socket_descriptor(int pid, uint32_t descriptor, dolly_kernel_socket **socket);
int dolly_kernel_socket_open(int pid, dolly_kernel_socket *const *sockets, uint32_t count,
                             int close_on_exec, uint32_t *descriptors);
int dolly_kernel_process_directory(int pid);
void dolly_kernel_wake(void);
/* WasmFS has no socket node. A path a socket was bound to is an empty regular
 * file with the sticky bit, which no process can set: chmod changes nothing. */
static inline int dolly_kernel_socket_node(mode_t mode) {
  return S_ISREG(mode) && (mode & S_ISVTX) != 0;
}

/* The terminal device, host/display/kernel.c. */

/* The terminal device's output, host/display/kernel.c. replies() copies what
 * the terminal answers its program (a cursor report) and returns the count. */
int dolly_kernel_terminal_attached(void);
void dolly_kernel_terminal_render(const unsigned char *bytes, size_t length);
size_t dolly_kernel_terminal_replies(unsigned char *output, size_t capacity);
uint32_t dolly_terminal_columns(void);
uint32_t dolly_terminal_rows(void);

/* The terminal device's input, host/input/kernel.c. input_service() handles
 * the pointer and scroll input that is the terminal's own, before it draws. */
int dolly_kernel_terminal_read(void);
int dolly_kernel_terminal_ready(void);
int dolly_kernel_terminal_input_service(void);
void dolly_terminal_discard_pending_input(void);
/* Terminal input from inside Wasm (host/buttons/kernel.c): whoever reads the
 * terminal reads the bytes as if typed, after the keyboard input that came
 * before them. Byte 3 interrupts an interruptible foreground instead. Zero, or
 * -EAGAIN while the queue has no room for them. */
int dolly_kernel_terminal_type(const unsigned char *bytes, size_t length);

/* The terminal line discipline and the page's terminal mailbox, src/dolly.c. */
uint32_t dolly_kernel_terminal_mode(void);
int dolly_kernel_terminal_set_mode(uint32_t flags);
/* Boot text while no display driver is resident: the page's log. One write
 * holds at most DOLLY_PROCESS_PACKET_LIMIT bytes; the page refuses more. */
DOLLY_BROWSER_IMPORT(dolly_bootstrap_write_bytes)
int dolly_bootstrap_write_bytes(const unsigned char *bytes, uintptr_t length);
/* Zero, or the negative errno of a refused boot text write. */
int dolly_terminal_write_bytes(const unsigned char *bytes, uintptr_t length);
void dolly_terminal_publish_result(int status);
void dolly_kernel_foreground_publish(int pid, int interruptible);
/* The terminal's foreground owner, or zero. */
int dolly_kernel_foreground(void);
/* Whether Ctrl+C is its SIGINT (ISIG) and not input; the request to send it. */
int dolly_kernel_foreground_interruptible(void);
void dolly_kernel_foreground_interrupt(void);

int dolly_process_descends_from(int pid, int ancestor_pid);
void dolly_kernel_terminal_resized(void);

#define DOLLY_PROCESS_DISPATCH_DEFERRED INT64_MIN

#endif
