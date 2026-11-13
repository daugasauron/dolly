// Pseudo-terminals. A pseudo-terminal is two streams of the kernel's
// descriptor table, each holding the bytes the other wrote until they are
// read. The slave also answers the terminal request, so a program that holds
// it has a terminal. The boot terminal is one whose master the kernel holds
// (kernel/dolly.c); console@0's terminal consoles and pty@0's openpty are others.
#include "pty-kernel.h"

#include <dolly/process.h>
#include <dolly/runtime.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* The mode a terminal starts in, as `stty sane` leaves one: lines edited and
 * echoed, Enter read as LF (ICRNL), LF shown as CRLF, the interrupt key. */
#define INITIAL_MODE (DOLLY_TERMINAL_CANONICAL | DOLLY_TERMINAL_ECHO | DOLLY_TERMINAL_ICRNL | \
    DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR | DOLLY_TERMINAL_ISIG)

/* The slave's line while its mode is canonical: what was typed and edited, of
 * which the first `ready` bytes are lines a read may take. `end` is Ctrl+D on
 * an empty line: the read after them returns no byte. */
typedef struct {
  unsigned char bytes[4096];
  size_t size, ready;
  int end;
} line;

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
  line line; /* The slave's input while its mode is canonical. */
  const dolly_pty_holder *holder; /* The kernel's, of a held master; else NULL. */
};

static dolly_pty *ptys[DOLLY_KERNEL_PTY_LIMIT];

static pty_end *other_end(const pty_end *end) {
  return end == &end->pty->master ? &end->pty->slave : &end->pty->master;
}

static void put(pty_end *end, unsigned char byte) {
  end->unread[(end->offset + end->size++) % end->capacity] = byte;
}

/* Bytes that fit, as put() puts each. */
static void put_bytes(pty_end *end, const unsigned char *bytes, size_t size) {
  const size_t tail = (end->offset + end->size) % end->capacity;
  const size_t first = size < end->capacity - tail ? size : end->capacity - tail;
  memcpy(end->unread + tail, bytes, first);
  memcpy(end->unread, bytes + first, size - first);
  end->size += size;
}

/* A writer waiting for room may go on; a held pair's other side is the kernel,
 * which waits for none. */
static size_t take(pty_end *end, unsigned char *bytes, size_t size) {
  if (size > end->size) size = end->size;
  const size_t first = size < end->capacity - end->offset ? size : end->capacity - end->offset;
  memcpy(bytes, end->unread + end->offset, first);
  memcpy(bytes + first, end->unread, size - first);
  end->offset = (end->offset + size) % end->capacity;
  end->size -= size;
  if (size != 0 && end->pty->holder == NULL) dolly_kernel_wake();
  return size;
}

/* What the slave wrote reached the master: a holder takes it now. */
static void shown(dolly_pty *pty) {
  if (pty->holder != NULL && pty->master.size != 0) pty->holder->output(pty);
}

/* What a holder has typed for the reader asking now. */
static void fill(dolly_pty *pty) {
  if (pty->holder != NULL) pty->holder->input(pty);
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

/* The slave's output for the master, as show() shows each byte: the count
 * taken, which stops where the master is full. */
static size_t show_bytes(dolly_pty *pty, const unsigned char *bytes, size_t size) {
  const uint32_t newline = DOLLY_TERMINAL_OPOST | DOLLY_TERMINAL_ONLCR;
  const int carriage_returns = (pty->mode & newline) == newline;
  pty_end *master = &pty->master;
  size_t taken = 0;
  while (taken < size) {
    const unsigned char *found = carriage_returns ? memchr(bytes + taken, '\n', size - taken) : NULL;
    const size_t end = found != NULL ? (size_t)(found - bytes) : size;
    const size_t room = master->capacity - master->size;
    const size_t run = end - taken < room ? end - taken : room;
    put_bytes(master, bytes + taken, run);
    taken += run;
    if (taken < end || found == NULL || !show(pty, '\n')) break;
    ++taken;
  }
  return taken;
}

/* What an echoing slave displays is its output; what does not fit is not shown. */
static void echo(dolly_pty *pty, const unsigned char *bytes, size_t length) {
  for (size_t index = 0; index < length && show(pty, bytes[index]); ++index) {}
}

static void erase_character(dolly_pty *pty, int echoes) {
  line *edited = &pty->line;
  size_t start = edited->size - 1;
  while (start > edited->ready && (edited->bytes[start] & 0xc0) == 0x80) --start;
  /* A control character was shown as two: ^X. A tab is erased as one cell. */
  const int shown_cells = edited->bytes[start] < ' ' && edited->bytes[start] != '\t' ? 2 : 1;
  edited->size = start;
  if (echoes) echo(pty, (const unsigned char *)"\b \b\b \b", 3 * (size_t)shown_cells);
}

/* One typed byte: Enter ends the line with a newline, Backspace erases a
 * character and Ctrl+U the line, Ctrl+D ends it without a newline. An echoing
 * slave shows what the byte displays. */
static void type_byte(dolly_pty *pty, unsigned char byte) {
  line *edited = &pty->line;
  const int echoes = (pty->mode & DOLLY_TERMINAL_ECHO) != 0;
  if (byte == 0x7f || byte == '\b' || byte == 0x15) {
    while (edited->size > edited->ready) {
      erase_character(pty, echoes);
      if (byte != 0x15) break;
    }
    return;
  }
  if (byte == 4) {
    if (edited->size == edited->ready) edited->end = 1;
    edited->ready = edited->size;
    return;
  }
  const int newline = byte == '\r' || byte == '\n';
  if (newline) byte = '\n';
  /* A full line takes nothing but the newline that ends it. */
  if (edited->size + !newline >= sizeof(edited->bytes)) return;
  edited->bytes[edited->size++] = byte;
  if (newline) edited->ready = edited->size;
  if (!echoes) return;
  if (byte < ' ' && byte != '\n' && byte != '\t') {
    const unsigned char caret[2] = {'^', (unsigned char)(byte + '@')};
    echo(pty, caret, sizeof(caret));
  } else {
    echo(pty, &byte, 1);
  }
}

/* Moves bytes out of the line and returns their count: one line at most, or
 * with `raw` whatever is held. */
static size_t take_line(line *edited, unsigned char *bytes, size_t size, int raw) {
  size_t count = raw ? edited->size : edited->ready;
  const unsigned char *newline = raw ? NULL : memchr(edited->bytes, '\n', count);
  if (newline != NULL) count = (size_t)(newline - edited->bytes) + 1;
  if (raw) edited->end = 0;
  if (count > size) count = size;
  memcpy(bytes, edited->bytes, count);
  memmove(edited->bytes, edited->bytes + count, edited->size - count);
  edited->size -= count;
  edited->ready -= count < edited->ready ? count : edited->ready;
  return count;
}

/* The slave's input is typed into its line when a read or a poll asks under
 * the canonical mode, so a raw read leaves what was typed before it unedited. */
static void type_line(dolly_pty *pty) {
  unsigned char byte;
  while (pty->line.ready == 0 && !pty->line.end && take(&pty->slave, &byte, 1) == 1) type_byte(pty, byte);
  shown(pty);
}

/* Whether a read of the slave returns without waiting. Under the canonical
 * mode a line is due once Enter or Ctrl+D is typed into it. */
static int slave_readable(dolly_pty *pty) {
  if ((pty->mode & DOLLY_TERMINAL_CANONICAL) == 0) return pty->line.size != 0 || pty->slave.size != 0;
  type_line(pty);
  return pty->line.ready != 0 || pty->line.end;
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
  for (size_t index = 0; index < DOLLY_KERNEL_PTY_LIMIT; ++index) {
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
    line *edited = &end->pty->line;
    fill(end->pty);
    if (canonical) type_line(end->pty);
    const size_t count = take_line(edited, bytes, size, !canonical);
    if (count != 0) return (int64_t)count;
    if (canonical && edited->end) {
      edited->end = 0;
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

/* The slave's input, as the master's holder writes it: the mode's interrupt
 * character (VINTR) is SIGINT under ISIG, to the processes that hold the
 * slave unless a holder gives it. The count taken. */
size_t dolly_pty_type(dolly_pty *pty, const unsigned char *bytes, size_t size) {
  const unsigned interrupt = dolly_terminal_interrupt(pty->mode);
  pty_end *reader = &pty->slave;
  size_t taken = 0;
  for (; taken < size; ++taken) {
    const unsigned char byte = bytes[taken];
    if (interrupt != 0 && byte == interrupt) {
      if (pty->holder != NULL) pty->holder->interrupt(pty);
      else dolly_kernel_socket_holders(&reader->shared, 1, dolly_kernel_raise, DOLLY_PROCESS_SIGINT);
      continue;
    }
    if (reader->size == reader->capacity) break;
    if (byte == '\r' && (pty->mode & DOLLY_TERMINAL_ICRNL) != 0) put(reader, '\n');
    else if (byte == '\n' && (pty->mode & DOLLY_TERMINAL_INLCR) != 0) put(reader, '\r');
    else put(reader, byte);
  }
  return taken;
}

/* Takes what fits, at least one byte: the master's bytes are the slave's
 * input; the slave's pass OPOST, and a holder takes them as they come. */
static int64_t pty_send(dolly_kernel_socket *shared, const unsigned char *bytes, size_t size, int wait) {
  pty_end *end = (pty_end *)shared;
  dolly_pty *pty = end->pty;
  if (size == 0) return 0;
  if (!other_end(end)->open) return -EIO;
  size_t taken = 0;
  if (end == &pty->master) {
    taken = dolly_pty_type(pty, bytes, size);
  } else {
    taken = show_bytes(pty, bytes, size);
    for (size_t more = 1; taken < size && pty->holder != NULL && more != 0; taken += more) {
      shown(pty);
      more = show_bytes(pty, bytes + taken, size - taken);
    }
    shown(pty);
  }
  if (taken == 0) return wait && !shared->nonblocking ? DOLLY_PROCESS_DISPATCH_DEFERRED : -EAGAIN;
  if (pty->holder == NULL) dolly_kernel_wake();
  return (int64_t)taken;
}

static uint16_t pty_poll(const dolly_kernel_socket *shared, uint16_t requested) {
  const pty_end *end = (const pty_end *)shared, *reader = other_end(end);
  uint16_t events = 0;
  if (end == &end->pty->slave) fill(end->pty);
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
      fill(pty);
      if (take_line(&pty->line, &byte, 1, 1) == 1 || take(end, &byte, 1) == 1) {
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
      if (pty->holder != NULL) return -EPERM;
      return dolly_pty_resize(pty, request->flags >> 16, request->flags & 0xffff);
  }
  return -EINVAL;
}

static const dolly_kernel_socket_kind pty_kind = {
    DOLLY_PROCESS_FILE_CHARACTER_DEVICE, DOLLY_PROCESS_FD_STATUS_READ | DOLLY_PROCESS_FD_STATUS_WRITE, pty_close, pty_receive, pty_send, pty_poll, pty_terminal};

static dolly_pty *pty_new(uint32_t rows, uint32_t columns) {
  dolly_pty *pty = calloc(1, sizeof(*pty));
  if (pty == NULL) return NULL;
  pty->master.capacity = DOLLY_KERNEL_PTY_OUTPUT_BYTES;
  pty->slave.capacity = DOLLY_KERNEL_PTY_INPUT_BYTES;
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
  pty->mode = INITIAL_MODE;
  pty->rows = rows;
  pty->columns = columns;
  pty->master.open = pty->slave.open = 1;
  return pty;
}

dolly_pty *dolly_pty_pair(uint32_t rows, uint32_t columns, int *error) {
  uint32_t number = 0;
  while (number < DOLLY_KERNEL_PTY_LIMIT && ptys[number] != NULL) ++number;
  *error = !valid_size(rows, columns) ? -EINVAL : number == DOLLY_KERNEL_PTY_LIMIT ? -ENFILE : -ENOMEM;
  dolly_pty *pty = *error == -ENOMEM ? pty_new(rows, columns) : NULL;
  if (pty == NULL) return NULL;
  pty->number = number;
  ptys[number] = pty;
  *error = 0;
  return pty;
}

dolly_pty *dolly_pty_held(const dolly_pty_holder *holder) {
  dolly_pty *pty = pty_new(0, 0);
  if (pty == NULL) return NULL;
  pty->number = UINT32_MAX;
  pty->holder = holder;
  pty->master.shared.descriptors = pty->slave.shared.descriptors = 1;
  return pty;
}

dolly_kernel_socket *dolly_pty_master(dolly_pty *pty) { return &pty->master.shared; }
dolly_kernel_socket *dolly_pty_slave(dolly_pty *pty) { return &pty->slave.shared; }
uint32_t dolly_pty_number(const dolly_pty *pty) { return pty->number; }
uint32_t dolly_pty_mode(const dolly_pty *pty) { return pty->mode; }

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

size_t dolly_pty_input_room(const dolly_pty *pty) {
  return pty->slave.capacity - pty->slave.size;
}

size_t dolly_pty_take_output(dolly_pty *pty, unsigned char *bytes, size_t size) {
  return take(&pty->master, bytes, size);
}

void dolly_pty_discard_input(dolly_pty *pty) {
  pty->slave.offset = pty->slave.size = 0;
  pty->line.size = pty->line.ready = 0;
  pty->line.end = 0;
}
