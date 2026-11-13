// console@0 kernel side: the standard streams of a root process the host
// starts (dolly-console-0.wat). A terminal console is a pseudo-terminal
// (kernel/pty.c) whose master end the host holds in place of a process;
// its slave becomes descriptors 0, 1 and 2. A pipe console is three pipes:
// the host writes the one that is descriptor 0 and reads descriptors 1 and 2.
#include "process-kernel.h"
#include "pty-kernel.h"

#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>

/* As dolly-console-0.wat gives DOLLY_CONSOLE_TRANSFER_BYTES to the host. */
enum { CONSOLE_TRANSFER_BYTES = 65536 };
static unsigned char transfer[CONSOLE_TRANSFER_BYTES];

/* A pipe console is three kernel pipes: the host holds descriptor 0's write
 * end and the read ends of 1 and 2, and gives the process the others. */
typedef struct {
  int used, id;
  dolly_pty *pty;                 /* A terminal console's. */
  dolly_kernel_socket *host[3];   /* A pipe console's ends that the host holds. */
  dolly_kernel_socket *given[3];  /* Its ends for the process, until it has them. */
  int started, pid;
} console;
static console consoles[DOLLY_KERNEL_PTY_LIMIT];

uintptr_t dolly_console_transfer_address(void) { return (uintptr_t)transfer; }

/* An id is a slot and how many consoles the slot has held, so a closed console's id names
 * nothing again: the end of its program, which the host learns later, cannot reach the
 * console that takes the slot after it. */
static uint32_t generations[DOLLY_KERNEL_PTY_LIMIT];

static console *find(int id) {
  if (id < 0) return NULL;
  console *found = &consoles[(uint32_t)id % DOLLY_KERNEL_PTY_LIMIT];
  return found->used && found->id == id ? found : NULL;
}

/* A free slot's next id, or -ENFILE. */
static int free_id(void) {
  for (uint32_t slot = 0; slot < DOLLY_KERNEL_PTY_LIMIT; ++slot) {
    if (consoles[slot].used) continue;
    generations[slot] = (generations[slot] + 1) % (INT32_MAX / DOLLY_KERNEL_PTY_LIMIT);
    return (int)(slot + DOLLY_KERNEL_PTY_LIMIT * generations[slot]);
  }
  return -ENFILE;
}

static void release(dolly_kernel_socket **end) {
  if (*end != NULL) dolly_kernel_socket_release(*end);
  *end = NULL;
}

int dolly_console_open(uint32_t columns, uint32_t rows) {
  const int id = free_id();
  if (id < 0) return id;
  int error;
  dolly_pty *pty = dolly_pty_pair(rows, columns, &error);
  if (pty == NULL) return error;
  consoles[id % DOLLY_KERNEL_PTY_LIMIT] = (console){.used = 1, .id = id, .pty = pty};
  return id;
}

int dolly_console_open_pipes(void) {
  const int id = free_id();
  if (id < 0) return id;
  console *opened = &consoles[id % DOLLY_KERNEL_PTY_LIMIT];
  *opened = (console){.used = 1, .id = id};
  for (int descriptor = 0; descriptor < 3; ++descriptor) {
    dolly_kernel_socket *ends[2];
    const int made = dolly_kernel_pipe_open(ends);
    if (made != 0) {
      for (int made_descriptor = 0; made_descriptor < descriptor; ++made_descriptor) {
        release(&opened->host[made_descriptor]);
        release(&opened->given[made_descriptor]);
      }
      *opened = (console){0};
      return made;
    }
    const int input = descriptor == 0;
    opened->host[descriptor] = ends[input];
    opened->given[descriptor] = ends[!input];
  }
  return id;
}

int dolly_console_spawn(int id, uintptr_t request_size) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (found->started) return -EBUSY;
  dolly_process_spawn_request request;
  if (request_size < sizeof(request) || request_size > DOLLY_PROCESS_PACKET_LIMIT) return -EINVAL;
  memcpy(&request, (const void *)dolly_process_mailbox_address(), sizeof(request));
  if (request.mapping_count != 0) return -EINVAL;
  const int pid = dolly_process_spawn_serialized(request_size);
  if (pid < 0) return pid;
  /* With nothing mapped, 0, 1 and 2 are its first free descriptors. */
  dolly_kernel_socket *standard[3];
  for (int descriptor = 0; descriptor < 3; ++descriptor) {
    standard[descriptor] = found->pty != NULL ? dolly_pty_slave(found->pty) : found->given[descriptor];
  }
  uint32_t descriptors[3];
  const int placed = dolly_kernel_socket_open(pid, standard, 3, 0, descriptors);
  if (placed != 0) return placed;
  /* The process holds them now: a pipe ends once it lets them go. */
  for (int descriptor = 0; descriptor < 3; ++descriptor) release(&found->given[descriptor]);
  found->started = found->pty == NULL;
  found->pid = pid;
  return pid;
}

int64_t dolly_console_write(int id, uint64_t length) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (length > sizeof(transfer)) return -EINVAL;
  dolly_kernel_socket *end = found->pty != NULL ? dolly_pty_master(found->pty) : found->host[0];
  if (end == NULL) return -EINVAL;
  /* A write the processes no longer read is EPIPE. */
  return end->kind->send(end, transfer, (size_t)length, 0);
}

int64_t dolly_console_read(int id, int descriptor, uint64_t capacity) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (descriptor != 1 && descriptor != 2) return -EINVAL;
  if (capacity > sizeof(transfer)) capacity = sizeof(transfer);
  dolly_kernel_socket *end = found->pty != NULL ? dolly_pty_master(found->pty) : found->host[descriptor];
  const int64_t count = end->kind->receive(end, transfer, (size_t)capacity, 0);
  /* A master reads EIO once the slave is gone, and a pipe the end of the
   * file once its writers are: for the host, the end. */
  return count == -EIO ? 0 : count;
}

/* Ctrl-C for a pipe console's program, which has no terminal's interrupt key. */
int dolly_console_interrupt(int id) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (found->pty != NULL) return -EINVAL;
  if (found->pid == 0) return -ESRCH;
  dolly_kernel_interrupt_tree(found->pid);
  return 0;
}

int dolly_console_end_input(int id) {
  console *found = find(id);
  if (found == NULL) return -EBADF;
  if (found->pty != NULL) return -EINVAL;
  release(&found->host[0]);
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
  for (int descriptor = 0; descriptor < 3; ++descriptor) {
    release(&found->host[descriptor]);
    release(&found->given[descriptor]);
  }
  *found = (console){0};
  return 0;
}

const dolly_kernel_module dolly_console_kernel = {0};
