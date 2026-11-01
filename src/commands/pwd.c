#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    fputs("usage: pwd [-L|-P]\n", stdout);
    return 0;
  }
  if (argc > 2 ||
      (argc == 2 && strcmp(argv[1], "-L") != 0 && strcmp(argv[1], "-P") != 0)) {
    fprintf(stderr, "pwd: unsupported option: %s\n", argc > 1 ? argv[1] : "");
    return 2;
  }
  char cwd[PATH_MAX];
  if (getcwd(cwd, sizeof(cwd)) == NULL) {
    fprintf(stderr, "pwd: %s\n", strerror(errno));
    return 1;
  }
  fputs(cwd, stdout);
  fputc('\n', stdout);
  // Output that could not be written fails the command, as any other error does.
  if (fflush(stdout) != 0) {
    fprintf(stderr, "pwd: write error: %s\n", strerror(errno));
    return 1;
  }
  return 0;
}
