#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <time.h>

// A decimal number of seconds ("2", "0.1", ".5"), as GNU, BSD, toybox and
// busybox take it, read to the nanosecond without rounding.
static int parse_seconds(const char *text, struct timespec *duration) {
  int64_t seconds = 0;
  long nanoseconds = 0;
  const char *cursor = text;
  for (; *cursor >= '0' && *cursor <= '9'; ++cursor) {
    if (seconds > (INT64_MAX - 9) / 10) return -1;
    seconds = seconds * 10 + (*cursor - '0');
  }
  int digits = cursor != text;
  if (*cursor == '.') {
    for (long scale = 100000000; *++cursor >= '0' && *cursor <= '9'; scale /= 10, digits = 1) {
      nanoseconds += (*cursor - '0') * scale;
    }
  }
  if (!digits || *cursor != '\0') return -1;
  *duration = (struct timespec){(time_t)seconds, nanoseconds};
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    puts("usage: sleep SECONDS\n"
         "Wait SECONDS, a decimal number: sleep 0.1 waits a tenth of a second.");
    return 0;
  }
  struct timespec duration;
  if (argc != 2 || parse_seconds(argv[1], &duration) != 0) {
    fputs("usage: sleep SECONDS\n", stderr);
    return 2;
  }
  // A signal that does not end the process leaves the rest of the wait.
  while (nanosleep(&duration, &duration) != 0) {
    if (errno != EINTR) {
      fprintf(stderr, "sleep: %s\n", strerror(errno));
      return 1;
    }
  }
  return 0;
}
