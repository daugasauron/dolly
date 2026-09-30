#define _XOPEN_SOURCE 700

#include "run-program.h"

static void usage(FILE *stream) {
  fputs("usage: command [-p] COMMAND [ARG ...]\n"
        "       command [-p] -v NAME ...\n", stream);
}

int main(int argc, char **argv) {
  int argument = 1;
  const char *search = getenv("PATH");
  int describe = 0;
  for (; argument < argc && argv[argument][0] == '-'; argument++) {
    if (strcmp(argv[argument], "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(argv[argument], "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(argv[argument], "-p") == 0) search = "/bin:/usr/bin";
    else if (strcmp(argv[argument], "-v") == 0) describe = 1;
    else {
      fprintf(stderr, "command: unsupported option: %s\n", argv[argument]);
      return 2;
    }
  }
  if (argument == argc) {
    usage(stderr);
    return 2;
  }
  if (!describe) return run_program("command", argc - argument, argv + argument, search, -1);

  int status = 0;
  for (; argument < argc; argument++) {
    char *path = find_program(argv[argument], search);
    if (path == NULL) status = 1;
    else puts(path);
    free(path);
  }
  return status;
}
