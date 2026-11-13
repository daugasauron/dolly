#include <assert.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <unistd.h>

int main(void) {
  assert(isatty(STDIN_FILENO));
  int flags = fcntl(STDIN_FILENO, F_GETFL);
  assert(flags >= 0);
  int reader = dup(STDIN_FILENO);
  assert(reader >= 0);
  assert(fcntl(reader, F_SETFL, flags | O_NONBLOCK) == 0);
  assert(fcntl(STDIN_FILENO, F_GETFL) & O_NONBLOCK);
  char byte;
  assert(read(reader, &byte, 0) == 0);
  errno = 0;
  assert(read(reader, &byte, 1) == -1 && errno == EAGAIN);
  assert(fcntl(reader, F_SETFL, flags) == 0);
  assert(fcntl(STDIN_FILENO, F_GETFL) == flags);
  assert(close(reader) == 0);
  puts("TERMINAL-NONBLOCK-PASSED");
}
