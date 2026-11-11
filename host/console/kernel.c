// console@0 kernel side: the standard streams of a root process the host
// starts (dolly-console-0.wat). A terminal console is a pseudo-terminal
// (host/pty/kernel.c) whose master end the host holds in place of a process;
// its slave becomes descriptors 0, 1 and 2. A pipe console is three pipes:
// the host writes the one that is descriptor 0 and reads descriptors 1 and 2.
#include "process-kernel.h"
#include "../pty/pty-kernel.h"

#include <dolly/process.h>
#include <dolly/pty-abi.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* As dolly-console-0.wat gives DOLLY_CONSOLE_TRANSFER_BYTES to the host. */
enum { CONSOLE_TRANSFER_BYTES = 65536, PIPE_BYTES = 65536 };
static unsigned char transfer[CONSOLE_TRANSFER_BYTES];

/* One direction between the host and the processes that hold it. */
typedef struct {
  dolly_kernel_socket shared; /* First: the kernel's descriptor table names it. */
  int input;                  /* The host writes it; else the host reads it. */
  int host_open, held, started;
  size_t offset, size;
  unsigned char bytes[PIPE_BYTES];
} host_pipe;

typedef struct {
  dolly_pty *pty;        /* A terminal console's. */
  host_pipe *pipes[3];   /* A pipe console's, by descriptor. */
} console;
static console consoles[DOLLY_PTY_LIMIT];

uintptr_t dolly_console_transfer_address(void) { return (uintptr_t)transfer; }

static console *find(int id) {
  return id >= 0 && id < (int)DOLLY_PTY_LIMIT && (consoles[id].pty != NULL || consoles[id].pipes[0] != NULL)
      ? &consoles[id] : NULL;
}

static int free_id(void) {
  for (int id = 0; id < (int)DOLLY_PTY_LIMIT; ++id) {
    if (consoles[id].pty == NULL && consoles[id].pipes[0] == NULL) return id;
  }
  return -ENFILE;
}

static void put(host_pipe *pipe, const unsigned char *bytes, size_t count) {
  for (size_t index = 0; index < count; ++index) pipe->bytes[(pipe->offset + pipe->size + index) % PIPE_BYTES] = bytes[index];
  pipe->size += count;
  dolly_kernel_wake();
}

static size_t take(host_pipe *pipe, unsigned char *bytes, size_t capacity) {
  const size_t count = capacity < pipe->size ? capacity : pipe->size;
  for (size_t index = 0; index < count; ++index) bytes[index] = pipe->bytes[(pipe->offset + index) % PIPE_BYTES];
  pipe->offset = (pipe->offset + count) % PIPE_BYTES;
  pipe->size -= count;
  if (count != 0) dolly_kernel_wake();
  return count;
}

/* The processes' side of a pipe: they read descriptor 0 and write 1 and 2, as
 * a kernel pipe's ends. A pipe goes once neither side holds it. */
static void pipe_close(dolly_kernel_socket *shared) {
  host_pipe *pipe = (host_pipe *)shared;
  pipe->held = 0;
  dolly_kernel_wake();
  if (!pipe->host_open) free(pipe);
}

static int64_t pipe_receive(dolly_kernel_socket *shared, unsigned char *bytes, size_t size, int wait) {
  host_pipe *pipe = (host_pipe *)shared;
  if (!pipe->input) return -EBADF;
  if (size == 0) return 0;
  if (pipe->size == 0) {
    if (!pipe->host_open) return 0;
    return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  }
  return (int64_t)take(pipe, bytes, size);
}

/* A write the host no longer reads is EPIPE, for which libc raises SIGPIPE. */
static int64_t pipe_send(dolly_kernel_socket *shared, const unsigned char *bytes, size_t size, int wait) {
  host_pipe *pipe = (host_pipe *)shared;
  if (pipe->input) return -EBADF;
  if (!pipe->host_open) return -EPIPE;
  if (size == 0) return 0;
  const size_t room = PIPE_BYTES - pipe->size, count = size < room ? size : room;
  if (count == 0) return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  put(pipe, bytes, count);
  return (int64_t)count;
}

static uint16_t pipe_poll(const dolly_kernel_socket *shared, uint16_t requested) {
  const host_pipe *pipe = (const host_pipe *)shared;
  uint16_t events = 0;
  if (pipe->input && (pipe->size != 0 || !pipe->host_open)) events |= DOLLY_PROCESS_POLL_READ;
  if (!pipe->input && (pipe->size < PIPE_BYTES || !pipe->host_open)) events |= DOLLY_PROCESS_POLL_WRITE;
  return (events & requested) | (!pipe->host_open ? DOLLY_PROCESS_POLL_HANGUP : 0);
}

static const dolly_kernel_socket_kind pipe_kind = {
    DOLLY_PROCESS_FILE_FIFO, pipe_close, pipe_receive, pipe_send, pipe_poll, NULL};

int dolly_console_open(uint32_t columns, uint32_t rows) {
  const int id = free_id();
  if (id < 0) return id;
  int error;
  dolly_pty *pty = dolly_pty_pair(rows, columns, &error);
  if (pty == NULL) return error;
  consoles[id].pty = pty;
  return id;
}

int dolly_console_open_pipes(void) {
  const int id = free_id();
  if (id < 0) return id;
  host_pipe *pipes[3] = {calloc(1, sizeof(host_pipe)), calloc(1, sizeof(host_pipe)), calloc(1, sizeof(host_pipe))};
  if (pipes[0] == NULL || pipes[1] == NULL || pipes[2] == NULL) {
    for (int descriptor = 0; descriptor < 3; ++descriptor) free(pipes[descriptor]);
    return -ENOMEM;
  }
  for (int descriptor = 0; descriptor < 3; ++descriptor) {
    pipes[descriptor]->shared.kind = &pipe_kind;
    pipes[descriptor]->input = descriptor == 0;
    pipes[descriptor]->host_open = 1;
    consoles[id].pipes[descriptor] = pipes[descriptor];
  }
  return id;
}

int dolly_console_spawn(int id, uintptr_t request_size) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (found->pipes[0] != NULL && found->pipes[0]->started) return -EBUSY;
  dolly_process_spawn_request request;
  if (request_size < sizeof(request) || request_size > DOLLY_PROCESS_PACKET_LIMIT) return -EINVAL;
  memcpy(&request, (const void *)dolly_process_mailbox_address(), sizeof(request));
  if (request.mapping_count != 0) return -EINVAL;
  const int pid = dolly_process_spawn_serialized(request_size);
  if (pid < 0) return pid;
  /* With nothing mapped, 0, 1 and 2 are its first free descriptors. */
  dolly_kernel_socket *standard[3];
  for (int descriptor = 0; descriptor < 3; ++descriptor) {
    standard[descriptor] = found->pty != NULL ? dolly_pty_slave(found->pty) : &found->pipes[descriptor]->shared;
  }
  uint32_t descriptors[3];
  const int placed = dolly_kernel_socket_open(pid, standard, 3, 0, descriptors);
  if (placed != 0) return placed;
  for (int descriptor = 0; found->pty == NULL && descriptor < 3; ++descriptor) {
    found->pipes[descriptor]->held = found->pipes[descriptor]->started = 1;
  }
  return pid;
}

int64_t dolly_console_write(int id, uint64_t length) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (length > sizeof(transfer)) return -EINVAL;
  if (found->pty != NULL) {
    dolly_kernel_socket *master = dolly_pty_master(found->pty);
    return master->kind->send(master, transfer, (size_t)length, 0);
  }
  host_pipe *input = found->pipes[0];
  if (!input->host_open) return -EINVAL;
  if (input->started && !input->held) return -EPIPE;
  const size_t room = PIPE_BYTES - input->size, count = length < room ? (size_t)length : room;
  if (count == 0 && length != 0) return -EAGAIN;
  put(input, transfer, count);
  return (int64_t)count;
}

int64_t dolly_console_read(int id, int descriptor, uint64_t capacity) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (descriptor != 1 && descriptor != 2) return -EINVAL;
  if (capacity > sizeof(transfer)) capacity = sizeof(transfer);
  if (found->pty != NULL) {
    dolly_kernel_socket *master = dolly_pty_master(found->pty);
    const int64_t count = master->kind->receive(master, transfer, (size_t)capacity, 0);
    /* The master reads EIO once the slave is gone: for the host, the end. */
    return count == -EIO ? 0 : count;
  }
  host_pipe *output = found->pipes[descriptor];
  const size_t count = take(output, transfer, (size_t)capacity);
  if (count != 0 || capacity == 0) return (int64_t)count;
  return output->started && !output->held ? 0 : -EAGAIN;
}

int dolly_console_end_input(int id) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (found->pty != NULL) return -EINVAL;
  found->pipes[0]->host_open = 0;
  dolly_kernel_wake();
  return 0;
}

int dolly_console_resize(int id, uint32_t columns, uint32_t rows) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  return found->pty != NULL ? dolly_pty_resize(found->pty, rows, columns) : -EINVAL;
}

int dolly_console_close(int id) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (found->pty != NULL) dolly_pty_release(found->pty);
  for (int descriptor = 0; found->pty == NULL && descriptor < 3; ++descriptor) {
    host_pipe *pipe = found->pipes[descriptor];
    pipe->host_open = 0;
    if (!pipe->held) free(pipe);
  }
  *found = (console){0};
  dolly_kernel_wake();
  return 0;
}

const dolly_kernel_module dolly_console_kernel = {0};
