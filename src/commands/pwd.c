#include <errno.h>
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
  char cwd[1024];
  if (getcwd(cwd, sizeof(cwd)) == NULL) {
    fprintf(stderr, "pwd: %s\n", strerror(errno));
    return 1;
  }
  fputs(cwd, stdout);
  fputc('\n', stdout);
  return 0;
}
