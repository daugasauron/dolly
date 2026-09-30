#define _XOPEN_SOURCE 700

#include "run-program.h"

static void usage(FILE *stream) {
  fputs("usage: env [-i] [-0] [-u NAME] [NAME=VALUE ...] [command [arg ...]]\n",
        stream);
}

int main(int argc, char **argv) {
  static char *empty[] = {NULL};
  int nul = 0;
  int argument = 1;
  for (; argument < argc && argv[argument][0] == '-'; argument++) {
    const char *option = argv[argument];
    if (strcmp(option, "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(option, "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(option, "-") == 0 || strcmp(option, "-i") == 0) {
      environ = empty;
    } else if (strcmp(option, "-0") == 0) {
      nul = 1;
    } else if (strncmp(option, "-u", 2) == 0) {
      const char *name = option[2] != '\0' ? option + 2 : argv[++argument];
      if (name == NULL || unsetenv(name) != 0) {
        fprintf(stderr, "env: invalid variable name: %s\n", name == NULL ? "" : name);
        return 2;
      }
    } else {
      fprintf(stderr, "env: unsupported option: %s\n", option);
      usage(stderr);
      return 2;
    }
  }
  for (; argument < argc && strchr(argv[argument], '=') != NULL; argument++) {
    if (putenv(argv[argument]) != 0) {
      fprintf(stderr, "env: invalid assignment: %s\n", argv[argument]);
      return 2;
    }
  }
  if (argument < argc) {
    return run_program("env", argc - argument, argv + argument, getenv("PATH"), -1);
  }
  for (char **entry = environ; entry != NULL && *entry != NULL; entry++) {
    fputs(*entry, stdout);
    fputc(nul ? '\0' : '\n', stdout);
  }
  return fflush(stdout) == 0 ? 0 : 1;
}
