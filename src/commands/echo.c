#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  int newline = 1;
  int first = 1;
  if (first < argc && strcmp(argv[first], "--help") == 0) {
    fputs("usage: echo [-n] [--] [ARG ...]\n", stdout);
    return 0;
  }
  if (first < argc && strcmp(argv[first], "-n") == 0) {
    newline = 0;
    first++;
  }
  if (first < argc && strcmp(argv[first], "--") == 0) first++;

  for (int index = first; index < argc; index++) {
    if (index != first) fputc(' ', stdout);
    fputs(argv[index], stdout);
  }
  if (newline) fputc('\n', stdout);
  fflush(stdout);
  return ferror(stdout) ? 1 : 0;
}
