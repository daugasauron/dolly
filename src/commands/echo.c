#include <stdio.h>
#include <string.h>

// Slop includes this file and runs the same code itself for the echo that PATH
// finds in /bin (DOLLY_SHELL_UTILITY).
static int echo_utility(int argc, char **argv) {
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

#ifndef DOLLY_SHELL_UTILITY
int main(int argc, char **argv) { return echo_utility(argc, argv); }
#endif
