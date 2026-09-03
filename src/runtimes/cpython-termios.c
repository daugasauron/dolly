/* CPython termios adapter over Dolly's libc-independent terminal modes.
 *
 * This file belongs above the Dolly substrate. It translates Emscripten
 * musl's struct termios layout into Dolly's closed canonical/echo mask;
 * that libc structure is intentionally not part of the Dolly machine ABI.
 */

#include <dolly/runtime.h>

#include <errno.h>
#include <stdarg.h>
#include <string.h>
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>

static int check_terminal(int descriptor) {
  const int mode = dolly_terminal_mode_get(descriptor);
  if (mode >= 0) return mode;
  errno = -mode;
  return -1;
}

int dolly_py_tcgetattr(int descriptor, struct termios *attributes) {
  if (attributes == NULL) {
    errno = EINVAL;
    return -1;
  }
  const int mode = check_terminal(descriptor);
  if (mode < 0) return -1;

  memset(attributes, 0, sizeof(*attributes));
  attributes->c_iflag = ICRNL | IXON;
  attributes->c_oflag = OPOST | ONLCR;
  attributes->c_cflag = CS8 | CREAD;
  if ((mode & DOLLY_TERMINAL_CANONICAL) != 0) attributes->c_lflag |= ICANON;
  if ((mode & DOLLY_TERMINAL_ECHO) != 0) {
    attributes->c_lflag |= ECHO | ECHOE | ECHOK;
  }
  // Ctrl+C is Dolly command supervision and remains available in raw mode.
  // Report ISIG as always present rather than exposing a bit that cannot
  // truthfully disable the supervisor.
  attributes->c_lflag |= ISIG;
  attributes->c_cc[VINTR] = 3;
  attributes->c_cc[VQUIT] = 28;
  attributes->c_cc[VERASE] = 127;
  attributes->c_cc[VKILL] = 21;
  attributes->c_cc[VEOF] = 4;
  attributes->c_cc[VMIN] = 1;
  attributes->c_cc[VTIME] = 0;
  attributes->c_cc[VSTART] = 17;
  attributes->c_cc[VSTOP] = 19;
  attributes->__c_ispeed = B38400;
  attributes->__c_ospeed = B38400;
  return 0;
}

int dolly_py_tcsetattr(int descriptor, int action,
                       const struct termios *attributes) {
  if (attributes == NULL ||
      (action != TCSANOW && action != TCSADRAIN && action != TCSAFLUSH)) {
    errno = EINVAL;
    return -1;
  }
  uint32_t mode = 0;
  if ((attributes->c_lflag & ICANON) != 0) mode |= DOLLY_TERMINAL_CANONICAL;
  if ((attributes->c_lflag & ECHO) != 0) mode |= DOLLY_TERMINAL_ECHO;
  const int result = dolly_terminal_mode_set(descriptor, mode);
  if (result >= 0) return result;
  errno = -result;
  return -1;
}

speed_t dolly_py_cfgetispeed(const struct termios *attributes) {
  return attributes->__c_ispeed;
}

speed_t dolly_py_cfgetospeed(const struct termios *attributes) {
  return attributes->__c_ospeed;
}

int dolly_py_cfsetispeed(struct termios *attributes, speed_t speed) {
  attributes->__c_ispeed = speed;
  return 0;
}

int dolly_py_cfsetospeed(struct termios *attributes, speed_t speed) {
  attributes->__c_ospeed = speed;
  return 0;
}

int dolly_py_tcsendbreak(int descriptor, int duration) {
  (void)duration;
  if (check_terminal(descriptor) < 0) return -1;
  errno = ENOSYS;
  return -1;
}

int dolly_py_tcdrain(int descriptor) {
  if (check_terminal(descriptor) < 0) return -1;
  return fsync(descriptor);
}

int dolly_py_tcflush(int descriptor, int queue) {
  if (queue != TCIFLUSH && queue != TCOFLUSH && queue != TCIOFLUSH) {
    errno = EINVAL;
    return -1;
  }
  const int mode = check_terminal(descriptor);
  if (mode < 0) return -1;
  const int result = dolly_terminal_mode_set(descriptor, (uint32_t)mode);
  if (result >= 0) return result;
  errno = -result;
  return -1;
}

int dolly_py_tcflow(int descriptor, int action) {
  (void)action;
  if (check_terminal(descriptor) < 0) return -1;
  errno = ENOSYS;
  return -1;
}

int dolly_py_ioctl(int descriptor, int request, ...) {
  if (check_terminal(descriptor) < 0) return -1;
  va_list arguments;
  va_start(arguments, request);
  void *argument = va_arg(arguments, void *);
  va_end(arguments);
  if (request == TIOCGWINSZ) {
    if (argument == NULL) {
      errno = EINVAL;
      return -1;
    }
    struct winsize *size = argument;
    memset(size, 0, sizeof(*size));
    size->ws_row = (unsigned short)dolly_terminal_rows();
    size->ws_col = (unsigned short)dolly_terminal_columns();
    return 0;
  }
  errno = request == TIOCSWINSZ ? EPERM : ENOTTY;
  return -1;
}
