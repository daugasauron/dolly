#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    fputs("usage: clear\n", stdout);
    return 0;
  }
  if (argc != 1) {
    fprintf(stderr, "clear: unsupported option: %s\n", argv[1]);
    return 2;
  }
  fputs("\033[2J\033[H", stdout);
  fflush(stdout);
  return 0;
}
