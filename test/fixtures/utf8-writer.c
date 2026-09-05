#define _POSIX_C_SOURCE 200809L
#include <string.h>
#include <time.h>
#include <unistd.h>

static void gap(void) {
  const struct timespec duration = { .tv_nsec = 100000000 };
  nanosleep(&duration, NULL);
}

int main(int argc, char **argv) {
  if (argc > 1 && strcmp(argv[1], "stdin") == 0) {
    char prefix[4095];
    memset(prefix, 'a', sizeof(prefix));
    write(1, prefix, sizeof(prefix));
    write(1, "\xe3\x81\x82\xf0\x9f\x98\x80\xe3", 8);
    return 0;
  }
  write(1, "\xe3", 1); gap();
  write(2, "\xf0\x9f", 2); gap();
  write(1, "\x81\x82", 2); gap();
  write(2, "\x98\x80", 2); gap();
  write(1, "\xe3", 1);
  write(2, "\xf0", 1);
  return 0;
}
