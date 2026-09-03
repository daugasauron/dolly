#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    fputs("usage: tty\n", stdout);
    return 0;
  }
  if (argc != 1) {
    fputs("tty: expected no arguments\n", stderr);
    return 2;
  }
  if (!isatty(STDIN_FILENO)) {
    puts("not a tty");
    return 1;
  }
  puts("/dev/tty");
  return 0;
}
