#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  int newline = 1;
  int first = 1;
  // POSIX: echo takes no options but -n, so `echo --help` prints --help.
  if (first < argc && strcmp(argv[first], "-n") == 0) {
    newline = 0;
    first++;
  }

  for (int index = first; index < argc; index++) {
    if (index != first) fputc(' ', stdout);
    fputs(argv[index], stdout);
  }
  if (newline) fputc('\n', stdout);
  fflush(stdout);
  return ferror(stdout) ? 1 : 0;
}
