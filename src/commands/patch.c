#define _XOPEN_SOURCE 700

#include <unistd.h>

#include "run-program.h"

static void usage(FILE *stream) {
  fputs("usage: patch [-pN] [-R] [-s] [--dry-run] [-d DIR] [-i PATCHFILE] < PATCHFILE\n"
        "Dolly applies unified patches to the files they name with source-built "
        "git apply.\n", stream);
}

int main(int argc, char **argv) {
  char **arguments = calloc((size_t)argc + 4, sizeof(*arguments));
  if (arguments == NULL) return 2;
  int count = 0;
  arguments[count++] = "git";
  arguments[count++] = "--no-pager";
  arguments[count++] = "apply";
  const char *directory = NULL;
  const char *input = NULL;
  for (int index = 1; index < argc; index++) {
    const char *option = argv[index];
    if (strcmp(option, "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(option, "-d") == 0 || strcmp(option, "-i") == 0) {
      if (++index == argc) {
        usage(stderr);
        return 2;
      }
      *(option[1] == 'd' ? &directory : &input) = argv[index];
    } else if (strcmp(option, "--dry-run") == 0) {
      arguments[count++] = "--check";
    } else if (strcmp(option, "-s") == 0 || strcmp(option, "--quiet") == 0) {
      arguments[count++] = "--quiet";
    } else if (strcmp(option, "-R") == 0 || strncmp(option, "-p", 2) == 0) {
      arguments[count++] = argv[index];
    } else if (option[0] == '-') {
      fprintf(stderr, "patch: unsupported option: %s\n", option);
      return 2;
    } else {
      fprintf(stderr, "patch: %s: a FILE operand is unsupported: the patch names its "
              "files; run patch -pN -i PATCHFILE or patch -pN < PATCHFILE\n", option);
      return 2;
    }
  }
  char resolved_input[4096];
  if (input != NULL && directory != NULL) {
    if (realpath(input, resolved_input) == NULL) {
      fprintf(stderr, "patch: %s: %s\n", input, strerror(errno));
      return 2;
    }
    input = resolved_input;
  }
  if (input != NULL) arguments[count++] = (char *)input;
  if (directory != NULL && chdir(directory) != 0) {
    fprintf(stderr, "patch: %s: %s\n", directory, strerror(errno));
    return 2;
  }
  const int status = run_program("patch", count, arguments, getenv("PATH"), -1);
  return status <= 1 ? status : 2;
}
