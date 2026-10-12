/* openpty and a master's window size over pty@0 (host/pty/dolly-pty-0.wat),
 * for a program that links this file. A prototype: the module ships no
 * client, so the calls a libdolly-pty.a would define are here. */
#include "dolly-pty.h"

#include <dolly/process.h>
#include <errno.h>
#include <pty.h>
#include <stdarg.h>
#include <stdio.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>

static int status(int64_t result) {
  if (result >= 0) return 0;
  errno = (int)-result;
  return -1;
}

/* Neither descriptor is inherited by a spawned program unless it is mapped. */
int openpty(int *master, int *slave, char *name, const struct termios *mode,
            const struct winsize *size) {
  const dolly_pty_request request = {0, DOLLY_PTY_CLOEXEC,
      size != NULL ? size->ws_row : 24, size != NULL ? size->ws_col : 80};
  dolly_pty_descriptors opened;
  const int64_t result = dolly_process_call(DOLLY_PTY_OPEN, &request, sizeof(request),
                                            &opened, sizeof(opened));
  if (result != sizeof(opened)) return status(result < 0 ? result : -EIO);
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

/* The libc's ioctl refuses TIOCSWINSZ itself; every other request is its own. */
int __syscall_ioctl(int descriptor, int request, uintptr_t arguments);

int ioctl(int descriptor, int request, ...) {
  va_list arguments;
  va_start(arguments, request);
  uintptr_t argument = va_arg(arguments, uintptr_t);
  va_end(arguments);
  if (request == TIOCSWINSZ && argument != 0) {
    const struct winsize *size = (const struct winsize *)argument;
    const dolly_pty_request resize = {(uint32_t)descriptor, 0, size->ws_row, size->ws_col};
    const int64_t result = dolly_process_call(DOLLY_PTY_RESIZE, &resize, sizeof(resize), NULL, 0);
    if (result != -ENOTTY) return status(result);
  }
  const int result = __syscall_ioctl(descriptor, request, (uintptr_t)&argument);
  return result < 0 ? status(result) : result;
}
