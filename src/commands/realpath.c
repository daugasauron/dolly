#define _XOPEN_SOURCE 700

#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void usage(FILE *stream) {
  fputs("usage: realpath [-e] PATH ...\n", stream);
}

int main(int argc, char **argv) {
  int argument = 1;
  while (argument < argc) {
    if (strcmp(argv[argument], "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(argv[argument], "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(argv[argument], "-e") == 0) {
      argument++;
      continue;
    }
    if (argv[argument][0] == '-') {
      fprintf(stderr, "realpath: unsupported option: %s\n", argv[argument]);
      usage(stderr);
      return 2;
    }
    break;
  }
  if (argument == argc) {
    usage(stderr);
    return 2;
  }

  int status = 0;
  for (; argument < argc; argument++) {
    char resolved[PATH_MAX];
    if (realpath(argv[argument], resolved) == NULL) {
      fprintf(stderr, "realpath: %s: %s\n", argv[argument], strerror(errno));
      status = 1;
      continue;
    }
    if (puts(resolved) == EOF) status = 1;
  }
  if (fflush(stdout) != 0) status = 1;
  return status;
}
