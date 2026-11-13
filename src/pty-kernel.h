/* Pseudo-terminals, src/pty.c: the boot terminal (src/dolly.c), console@0's
 * terminal consoles and pty@0's openpty. Kernel-private. */
#pragma once
#include "process-kernel.h"

/* At most this many numbered pairs (/dev/pts/N, for display), as pty@0's
 * contract gives DOLLY_PTY_LIMIT; unread bytes each direction holds. */
enum { DOLLY_KERNEL_PTY_LIMIT = 32, DOLLY_KERNEL_PTY_INPUT_BYTES = 4096, DOLLY_KERNEL_PTY_OUTPUT_BYTES = 65536 };

typedef struct dolly_pty dolly_pty;
/* What holds a master in the kernel, in place of a process (the boot
 * terminal): output() is told that the slave wrote and takes it from the
 * master now; input() is asked for what was typed when a reader of the slave
 * finds nothing to read, and gives it with dolly_pty_type; interrupt() gives
 * the interrupt key typed at the master its SIGINT. The holder sizes the pair:
 * the slave's size request is EPERM. */
typedef struct {
  void (*output)(dolly_pty *pty);
  void (*input)(dolly_pty *pty);
  void (*interrupt)(dolly_pty *pty);
} dolly_pty_holder;

/* A numbered pair of `rows` by `columns`, both ends open and in no descriptor
 * table; NULL with *error -EINVAL, -ENFILE or -ENOMEM. */
dolly_pty *dolly_pty_pair(uint32_t rows, uint32_t columns, int *error);
/* An unnumbered pair whose master `holder` holds for good, of no size until
 * it gives one; the kernel holds its slave too. NULL without memory. */
dolly_pty *dolly_pty_held(const dolly_pty_holder *holder);
dolly_kernel_socket *dolly_pty_master(dolly_pty *pty);
dolly_kernel_socket *dolly_pty_slave(dolly_pty *pty);
/* A numbered pair's number, which names it /dev/pts/N for display. */
uint32_t dolly_pty_number(const dolly_pty *pty);
/* A new size, and SIGWINCH for the programs on the slave; -EINVAL for none. */
int dolly_pty_resize(dolly_pty *pty, uint32_t rows, uint32_t columns);
/* The master's holder lets go, as a last descriptor would: the programs on
 * the slave get SIGHUP, and a slave that no descriptor names goes too. */
void dolly_pty_release(dolly_pty *pty);
/* For a holder: input as if written to the master (the interrupt key under
 * ISIG, ICRNL, INLCR), the count it took, and how many bytes it has room for;
 * output the slave wrote, the count moved out; the mode; and the end of what
 * was typed and not yet read, when the foreground program changes. */
size_t dolly_pty_type(dolly_pty *pty, const unsigned char *bytes, size_t size);
size_t dolly_pty_input_room(const dolly_pty *pty);
size_t dolly_pty_take_output(dolly_pty *pty, unsigned char *bytes, size_t size);
uint32_t dolly_pty_mode(const dolly_pty *pty);
void dolly_pty_discard_input(dolly_pty *pty);
