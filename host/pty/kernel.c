// pty@0 kernel side: pseudo-terminals. A pseudo-terminal is two streams of the
// kernel's descriptor table, each holding the bytes the other wrote until they
// are read. The slave also answers the terminal request, so a program that
// holds it has a terminal as it has the display's.
#include "process-kernel.h"
#include "pty-kernel.h"

#include <dolly/process.h>
#include <dolly/pty.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
  dolly_kernel_socket shared; /* First: the kernel's descriptor table names it. */
  dolly_pty *pty;
  int open; /* Until its last descriptor closed. */
  unsigned char *unread; /* What the other end wrote: a ring of `capacity`. */
  size_t capacity, offset, size;
} pty_end;

struct dolly_pty {
  pty_end master, slave;
  uint32_t number, mode, rows, columns;
  dolly_kernel_line line; /* The slave's input while its mode is canonical. */
};

static dolly_pty *ptys[DOLLY_PTY_LIMIT];

static pty_end *other_end(const pty_end *end) {
  return end == &end->pty->master ? &end->pty->slave : &end->pty->master;
}

static void put(pty_end *end, unsigned char byte) {
  end->unread[(end->offset + end->size++) % end->capacity] = byte;
}

static size_t take(pty_end *end, unsigned char *bytes, size_t size) {
  if (size > end->size) size = end->size;
  for (size_t index = 0; index < size; ++index) {
    bytes[index] = end->unread[(end->offset + index) % end->capacity];
  }
  end->offset = (end->offset + size) % end->capacity;
  end->size -= size;
  if (size != 0) dolly_kernel_wake();
  return size;
}

/* One byte of the slave's output for the master, LF as CRLF under OPOST with
 * ONLCR. Zero when it does not fit. */
static int show(dolly_pty *pty, unsigned char byte) {
  const uint32_t newline = DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR;
  const int carriage_return = byte == '\n' && (pty->mode & newline) == newline;
  if (pty->master.capacity - pty->master.size < (carriage_return ? 2u : 1u)) return 0;
  if (carriage_return) put(&pty->master, '\r');
  put(&pty->master, byte);
  return 1;
}

/* What an echoing slave displays is its output; what does not fit is not shown. */
static void echo(void *terminal, const unsigned char *bytes, size_t length) {
  for (size_t index = 0; index < length && show(terminal, bytes[index]); ++index) {}
}

/* The slave's input is typed into its line when a read asks under the
 * canonical mode, so the raw read leaves it unedited, as at the display. */
static void type_line(dolly_pty *pty) {
  unsigned char byte;
  while (pty->line.ready == 0 && !pty->line.end && take(&pty->slave, &byte, 1) == 1) {
    dolly_kernel_line_type(&pty->line, byte, (pty->mode & DOLLY_TERMINAL_ECHO) != 0 ? echo : NULL, pty);
  }
}

/* Whether a read of the slave returns without waiting. Under the canonical
 * mode a line is due once Enter or Ctrl+D waits to be typed into it. */
static int slave_readable(const dolly_pty *pty) {
  const pty_end *slave = &pty->slave;
  if ((pty->mode & DOLLY_TERMINAL_CANONICAL) == 0) return pty->line.size != 0 || slave->size != 0;
  if (pty->line.ready != 0 || pty->line.end) return 1;
  for (size_t index = 0; index < slave->size; ++index) {
    const unsigned char byte = slave->unread[(slave->offset + index) % slave->capacity];
    if (byte == '\r' || byte == '\n' || byte == 4) return 1;
  }
  return 0;
}

static int valid_size(uint32_t rows, uint32_t columns) {
  return rows != 0 && rows <= UINT16_MAX && columns != 0 && columns <= UINT16_MAX;
}

/* The last descriptor of one end went. The programs on the slave lose their
 * terminal with the master; the pseudo-terminal goes with its second end. */
static void pty_close(dolly_kernel_socket *closing) {
  pty_end *end = (pty_end *)closing;
  dolly_pty *pty = end->pty;
  if (end == &pty->master && pty->slave.open) {
    dolly_kernel_socket_holders(&pty->slave.shared, 0, dolly_kernel_raise, DOLLY_PROCESS_SIGHUP);
  }
  end->open = 0;
  dolly_kernel_wake();
  if (pty->master.open || pty->slave.open) return;
  for (size_t index = 0; index < DOLLY_PTY_LIMIT; ++index) {
    if (ptys[index] == pty) ptys[index] = NULL;
  }
  free(pty->master.unread);
  free(pty->slave.unread);
  free(pty);
}

static int64_t pty_receive(dolly_kernel_socket *shared, unsigned char *bytes, size_t size, int wait) {
  pty_end *end = (pty_end *)shared;
  if (size == 0) return 0;
  const int canonical = end == &end->pty->slave && (end->pty->mode & DOLLY_TERMINAL_CANONICAL) != 0;
  if (end == &end->pty->slave) {
    dolly_kernel_line *line = &end->pty->line;
    if (canonical) type_line(end->pty);
    const size_t count = dolly_kernel_line_take(line, bytes, size, !canonical);
    if (count != 0) return (int64_t)count;
    if (canonical && line->end) {
      line->end = 0;
      return 0;
    }
  }
  if (canonical || end->size == 0) {
    /* As on Linux, the master reads EIO once the slave is gone (xterm takes
     * end of file for a fault and carries on); the slave reads end of file. */
    if (!other_end(end)->open) return end == &end->pty->master ? -EIO : 0;
    return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  }
  return (int64_t)take(end, bytes, size);
}

/* Takes what fits, at least one byte. The slave's output passes OPOST; the
 * master's is the slave's input, where the mode's interrupt character (VINTR)
 * is SIGINT under ISIG. */
static int64_t pty_send(dolly_kernel_socket *shared, const unsigned char *bytes, size_t size, int wait) {
  pty_end *end = (pty_end *)shared, *reader = other_end(end);
  dolly_pty *pty = end->pty;
  if (size == 0) return 0;
  if (!reader->open) return -EIO;
  const int input = end == &pty->master;
  const unsigned interrupt = dolly_terminal_interrupt(pty->mode);
  size_t taken = 0;
  for (; taken < size; ++taken) {
    const unsigned char byte = bytes[taken];
    if (input && interrupt != 0 && byte == interrupt) {
      dolly_kernel_socket_holders(&pty->slave.shared, 1, dolly_kernel_raise, DOLLY_PROCESS_SIGINT);
    } else if (input) {
      if (reader->size == reader->capacity) break;
      put(reader, dolly_kernel_terminal_input(pty->mode, byte));
    } else if (!show(pty, byte)) {
      break;
    }
  }
  if (taken == 0) return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  dolly_kernel_wake();
  return (int64_t)taken;
}

static uint16_t pty_poll(const dolly_kernel_socket *shared, uint16_t requested) {
  const pty_end *end = (const pty_end *)shared, *reader = other_end(end);
  uint16_t events = 0;
  if (end == &end->pty->slave ? slave_readable(end->pty) : end->size != 0) events |= DOLLY_PROCESS_POLL_READ;
  if (!reader->open) events |= DOLLY_PROCESS_POLL_READ;
  if (!reader->open || reader->capacity - reader->size >= 2) events |= DOLLY_PROCESS_POLL_WRITE;
  return (events & requested) | (!reader->open ? DOLLY_PROCESS_POLL_HANGUP : 0);
}

/* The slave is a terminal; the master is not one. The pair has one mode and
 * one size, which termios on the master reaches, as on Linux: a terminal
 * emulator sets its slave's mode that way. */
static int64_t pty_terminal(dolly_kernel_socket *shared, const dolly_process_terminal_request *request,
                            dolly_process_terminal_response *response) {
  pty_end *end = (pty_end *)shared;
  dolly_pty *pty = end->pty;
  const int slave = end == &pty->slave;
  switch (request->operation) {
    case DOLLY_PROCESS_TERMINAL_ISATTY:
      response->value = slave;
      return 0;
    case DOLLY_PROCESS_TERMINAL_READ: {
      if (!slave) return -ENOTTY;
      unsigned char byte;
      if (dolly_kernel_line_take(&pty->line, &byte, 1, 1) == 1 || take(end, &byte, 1) == 1) {
        response->value = byte;
      } else if (pty->master.open && dolly_kernel_deadline_pending(request->deadline_nanoseconds)) {
        return DOLLY_PROCESS_DISPATCH_DEFERRED;
      } else {
        response->value = -1;
      }
      return 0;
    }
    case DOLLY_PROCESS_TERMINAL_MODE_GET:
      response->value = pty->mode;
      return 0;
    case DOLLY_PROCESS_TERMINAL_MODE_SET:
      if ((request->flags & ~DOLLY_TERMINAL_MODE_BITS) != 0) return -EINVAL;
      pty->mode = request->flags;
      return 0;
    case DOLLY_PROCESS_TERMINAL_SIZE:
      response->columns = pty->columns;
      response->rows = pty->rows;
      return 0;
    case DOLLY_PROCESS_TERMINAL_SIZE_SET:
      return dolly_pty_resize(pty, request->flags >> 16, request->flags & 0xffff);
  }
  return -EINVAL;
}

static const dolly_kernel_socket_kind pty_kind = {
    DOLLY_PROCESS_FILE_CHARACTER_DEVICE, pty_close, pty_receive, pty_send, pty_poll, pty_terminal};

dolly_pty *dolly_pty_pair(uint32_t rows, uint32_t columns, int *error) {
  uint32_t number = 0;
  while (number < DOLLY_PTY_LIMIT && ptys[number] != NULL) ++number;
  *error = !valid_size(rows, columns) ? -EINVAL : number == DOLLY_PTY_LIMIT ? -ENFILE : -ENOMEM;
  dolly_pty *pty = *error == -ENOMEM ? calloc(1, sizeof(*pty)) : NULL;
  if (pty == NULL) return NULL;
  pty->master.capacity = DOLLY_PTY_OUTPUT_BYTES;
  pty->slave.capacity = DOLLY_PTY_INPUT_BYTES;
  pty->master.unread = malloc(pty->master.capacity);
  pty->slave.unread = malloc(pty->slave.capacity);
  if (pty->master.unread == NULL || pty->slave.unread == NULL) {
    free(pty->master.unread);
    free(pty->slave.unread);
    free(pty);
    return NULL;
  }
  pty->master.shared.kind = pty->slave.shared.kind = &pty_kind;
  pty->master.pty = pty->slave.pty = pty;
  pty->number = number;
  pty->mode = DOLLY_KERNEL_TERMINAL_INITIAL_MODE;
  pty->rows = rows;
  pty->columns = columns;
  pty->master.open = pty->slave.open = 1;
  ptys[number] = pty;
  *error = 0;
  return pty;
}

dolly_kernel_socket *dolly_pty_master(dolly_pty *pty) { return &pty->master.shared; }
dolly_kernel_socket *dolly_pty_slave(dolly_pty *pty) { return &pty->slave.shared; }

int dolly_pty_resize(dolly_pty *pty, uint32_t rows, uint32_t columns) {
  if (!valid_size(rows, columns)) return -EINVAL;
  pty->rows = rows;
  pty->columns = columns;
  if (pty->slave.open) dolly_kernel_socket_holders(&pty->slave.shared, 0, dolly_kernel_raise, DOLLY_PROCESS_SIGWINCH);
  return 0;
}

void dolly_pty_release(dolly_pty *pty) {
  const int unheld = pty->slave.open && pty->slave.shared.descriptors == 0;
  pty_close(&pty->master.shared);
  if (unheld) pty_close(&pty->slave.shared);
}

static int64_t pty_open(int pid, const dolly_pty_request *request, unsigned char *mailbox,
                        uintptr_t response_capacity) {
  if (request->descriptor != 0 || (request->flags & ~(DOLLY_PTY_CLOEXEC | DOLLY_PTY_NONBLOCK)) != 0 ||
      response_capacity < sizeof(dolly_pty_descriptors)) return -EINVAL;
  int error;
  dolly_pty *pty = dolly_pty_pair(request->rows, request->columns, &error);
  if (pty == NULL) return error;
  pty->master.shared.nonblocking = (request->flags & DOLLY_PTY_NONBLOCK) != 0;
  dolly_kernel_socket *const ends[2] = {&pty->master.shared, &pty->slave.shared};
  dolly_pty_descriptors response = {0, 0, pty->number, 0};
  const int result = dolly_kernel_socket_open(pid, ends, 2, (request->flags & DOLLY_PTY_CLOEXEC) != 0,
                                              &response.master);
  if (result != 0) {
    ptys[pty->number] = NULL;
    free(pty->master.unread);
    free(pty->slave.unread);
    free(pty);
    return result;
  }
  return dolly_kernel_respond(mailbox, &response, sizeof(response));
}

static int64_t pty_call(int pid, int tid, uint32_t operation, unsigned char *mailbox,
                        uintptr_t request_size, uintptr_t response_capacity) {
  (void)tid;
  dolly_pty_request request;
  if (request_size != sizeof(request)) return -EINVAL;
  memcpy(&request, mailbox, sizeof(request));
  (void)operation;
  return pty_open(pid, &request, mailbox, response_capacity);
}

const dolly_kernel_module dolly_pty_kernel = {DOLLY_PTY_OPEN, DOLLY_PTY_OPEN, pty_call, NULL};
