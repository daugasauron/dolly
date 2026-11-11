// console@0 kernel side: terminals the host holds (dolly-console-0.wat). A
// console is a pseudo-terminal (host/pty/kernel.c) whose master end the host
// holds in place of a process; its slave becomes descriptors 0, 1 and 2 of
// the root process the host starts on it. Everything else is the
// pseudo-terminal's: what typing does, what the programs show, the signals of
// a resize and a hang-up.
#include "process-kernel.h"
#include "../pty/pty-kernel.h"

#include <dolly/process.h>
#include <dolly/pty-abi.h>
#include <errno.h>
#include <stdint.h>
#include <string.h>

/* As dolly-console-0.wat gives DOLLY_CONSOLE_TRANSFER_BYTES to the host. */
enum { CONSOLE_TRANSFER_BYTES = 65536 };
static unsigned char transfer[CONSOLE_TRANSFER_BYTES];
static dolly_pty *consoles[DOLLY_PTY_LIMIT];

uintptr_t dolly_console_transfer_address(void) { return (uintptr_t)transfer; }

static dolly_pty *console(int id) {
  return id >= 0 && id < (int)DOLLY_PTY_LIMIT ? consoles[id] : NULL;
}

int dolly_console_open(uint32_t columns, uint32_t rows) {
  int error;
  dolly_pty *pty = dolly_pty_pair(rows, columns, &error);
  if (pty == NULL) return error;
  int id = 0;
  while (consoles[id] != NULL) ++id; /* A console is a pseudo-terminal: one is free. */
  consoles[id] = pty;
  return id;
}

int dolly_console_spawn(int id, uintptr_t request_size) {
  dolly_pty *pty = console(id);
  if (pty == NULL) return -EBADF;
  dolly_process_spawn_request request;
  if (request_size < sizeof(request) || request_size > DOLLY_PROCESS_PACKET_LIMIT) return -EINVAL;
  memcpy(&request, (const void *)dolly_process_mailbox_address(), sizeof(request));
  if (request.mapping_count != 0) return -EINVAL;
  const int pid = dolly_process_spawn_serialized(request_size);
  if (pid < 0) return pid;
  /* With nothing mapped, 0, 1 and 2 are its first free descriptors. */
  dolly_kernel_socket *slave = dolly_pty_slave(pty);
  dolly_kernel_socket *const standard[3] = {slave, slave, slave};
  uint32_t descriptors[3];
  const int placed = dolly_kernel_socket_open(pid, standard, 3, 0, descriptors);
  return placed != 0 ? placed : pid;
}

int64_t dolly_console_write(int id, uint64_t length) {
  dolly_pty *pty = console(id);
  if (pty == NULL) return -EBADF;
  if (length > sizeof(transfer)) return -EINVAL;
  dolly_kernel_socket *master = dolly_pty_master(pty);
  return master->kind->send(master, transfer, (size_t)length, 0);
}

int64_t dolly_console_read(int id, uint64_t capacity) {
  dolly_pty *pty = console(id);
  if (pty == NULL) return -EBADF;
  if (capacity > sizeof(transfer)) capacity = sizeof(transfer);
  dolly_kernel_socket *master = dolly_pty_master(pty);
  const int64_t count = master->kind->receive(master, transfer, (size_t)capacity, 0);
  /* The master reads EIO once the slave is gone: for the host, the end. */
  return count == -EIO ? 0 : count;
}

int dolly_console_resize(int id, uint32_t columns, uint32_t rows) {
  dolly_pty *pty = console(id);
  return pty == NULL ? -EBADF : dolly_pty_resize(pty, rows, columns);
}

int dolly_console_close(int id) {
  dolly_pty *pty = console(id);
  if (pty == NULL) return -EBADF;
  consoles[id] = NULL;
  dolly_pty_release(pty);
  return 0;
}

const dolly_kernel_module dolly_console_kernel = {0};
