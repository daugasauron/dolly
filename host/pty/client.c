#define _GNU_SOURCE

/* The libc's openpty over pty@0. A program links this instead of the libc's
 * own, which finds no /dev/ptmx here, by asking for -ldolly-pty. */
#include <dolly/host.h>
#include <dolly/process.h>
#include <dolly/pty.h>
#include <errno.h>
#include <pty.h>
#include <stdio.h>
#include <termios.h>
#include <unistd.h>

DOLLY_HOST_REQUIRE(pty, 0, DOLLY_PTY_ABI_DIGEST);

/* Neither descriptor is inherited by a spawned program unless it is mapped.
 * `name` is for display: a slave has no path, and the program on it opens
 * it as /dev/tty. */
int openpty(int *master, int *slave, char *name, const struct termios *mode,
            const struct winsize *size) {
  const dolly_pty_request request = {0, DOLLY_PTY_CLOEXEC,
      size != NULL ? size->ws_row : 24, size != NULL ? size->ws_col : 80};
  dolly_pty_descriptors opened;
  const int64_t result = dolly_process_call(DOLLY_PTY_OPEN, &request, sizeof(request),
                                            &opened, sizeof(opened));
  if (result != sizeof(opened)) {
    errno = result < 0 ? (int)-result : EIO;
    return -1;
  }
  if (mode != NULL && tcsetattr((int)opened.slave, TCSANOW, mode) != 0) {
    const int error = errno;
    close((int)opened.master);
    close((int)opened.slave);
    errno = error;
    return -1;
  }
  *master = (int)opened.master;
  *slave = (int)opened.slave;
  if (name != NULL) sprintf(name, "/dev/pts/%u", opened.number);
  return 0;
}
