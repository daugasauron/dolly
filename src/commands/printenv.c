#define _POSIX_C_SOURCE 200809L

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

extern char **environ;

static void usage(FILE *stream) {
  fputs("usage: printenv [-0] [name ...]\n", stream);
}

int main(int argc, char **argv) {
  int nul = 0;
  int end_options = 0;
  int argument = 1;
  if (argument < argc && strcmp(argv[argument], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  if (argument < argc &&
      (strcmp(argv[argument], "-0") == 0 ||
       strcmp(argv[argument], "--null") == 0)) {
    nul = 1;
    argument++;
  }
  if (argument < argc && strcmp(argv[argument], "--") == 0) {
    end_options = 1;
    argument++;
  }
  if (!end_options && argument < argc && argv[argument][0] == '-' &&
      argv[argument][1] != '\0') {
    fprintf(stderr, "printenv: unsupported option: %s\n", argv[argument]);
    usage(stderr);
    return 2;
  }

  const int delimiter = nul ? '\0' : '\n';
  int missing = 0;
  if (argument == argc) {
    for (size_t index = 0; environ[index] != NULL; ++index) {
      if (fputs(environ[index], stdout) == EOF ||
          fputc(delimiter, stdout) == EOF) return 2;
    }
  } else {
    for (; argument < argc; ++argument) {
      const char *value = getenv(argv[argument]);
      if (value == NULL) {
        missing = 1;
        continue;
      }
      if (fputs(value, stdout) == EOF || fputc(delimiter, stdout) == EOF) return 2;
    }
  }
  if (fflush(stdout) == EOF) return 2;
  return missing;
}
